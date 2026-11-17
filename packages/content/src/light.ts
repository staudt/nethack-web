// Light: lamps, lanterns, candles, the magic lamp and burning potions of oil. Lighting them
// (apply), the fuel timer with its warnings, snuffing them out, catching fire (ignite_items),
// and the light they give (a PerceptionDef light source).
// ref: src/apply.c use_candle(), use_lamp(), snuff_candle(), snuff_lit(), catch_lit();
// src/timeout.c burn_object(), see_lamp_flicker(), lantern_message(); src/trap.c
// ignite_items(); src/light.c new_light_source(), candle_light_range()
//
// The burn state (fuel in `age`, `lit`, the timer records, beginBurn/endBurn and the stack
// split/merge hooks) lives in the leaf burnstate.ts; this module has the messages and the
// light. A potion of oil lit by applying it (light_cocktail()) and its explosion are oil.ts's.
//
// Not ported: the Candelabrum of Invocation (candles are never attached), light
// sources carried while the hero is away from the level (their timers simply run on;
// burn_object()'s "timeout while away" catch-up is not needed).
import {
  getLevel,
  itemsAt,
  inventoryOf,
  sortedIds,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type GameState,
  type LightSource,
  type ModApi,
  type Msg,
  type Pos,
} from '@nh/core';
import {
  BRASS_LANTERN,
  BURN_TIMER,
  MAGIC_LAMP,
  OIL_LAMP,
  beginBurn,
  burnRec,
  candleLightRange,
  endBurn,
  isCandle,
  setBurnRec,
} from './burnstate';
import { POT_OIL } from './dilute';
import { uswallow } from './engulfstate';
import { costlySpot, insideShop, shopKeeper } from './eshk';
import { removeFromInventory } from './items';
import { heroSees } from './mongear';
import { discover } from './o_init';
import { fingersOrGloves, glibTimeout, makeGlib } from './glib';
import { xnameOf } from './objnam';
import { P, heroHas } from './props';
import { monNam } from './perception';
import { billDummyObject, billUsedUp, checkUnpaid } from './shk';
import { uinwater } from './uwater';

export { beginBurn, endBurn, isCandle } from './burnstate';

export const LAMP = {
  oil: OIL_LAMP,
  lantern: BRASS_LANTERN,
  magic: MAGIC_LAMP,
} as const;

/** Light radius of a burning lamp, lantern or magic lamp. ref: src/timeout.c begin_burn() */
const LAMP_RADIUS = 3;

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/** The lamps lit by applying them (use_lamp()'s `lamp`): oil lamp, magic lamp, brass lantern. */
export const isLamp = (def: string): boolean =>
  def === OIL_LAMP || def === BRASS_LANTERN || def === MAGIC_LAMP;

/** ref: include/obj.h ignitable(): lamps, the lantern, candles and potions of oil */
export const ignitable = (def: string): boolean => isLamp(def) || isCandle(def) || def === POT_OIL;

/**
 * Where an object is, for light and messages (ref: src/mkobj.c get_obj_location() without
 * CONTAINED_TOO): its floor cell or its carrier's; null inside a container or carried by
 * something without a position.
 */
export function objLocation(
  state: Readonly<GameState>,
  e: Entity,
): (Pos & { level: string }) | null {
  const it = e.c.item;
  if (!it || it.containedIn !== undefined) return null;
  if (e.c.pos) return e.c.pos;
  if (it.carriedBy !== null) return state.entities[String(it.carriedBy)]?.c.pos ?? null;
  return null;
}

/**
 * Whose the object is, as a sentence's start (`cap`) or inside one: "Your", "The", "Izchak's"
 * (unpaid, or shop goods on his floor) or "the gnome's". ref: src/shk.c shk_your(), Shk_Your(),
 * shk_owns(), mon_owns()
 */
export function shkYour(ctx: Ctx, obj: Entity, cap: boolean): Msg {
  const it = obj.c.item;
  const loc = objLocation(ctx.state, obj);
  if (
    it &&
    loc &&
    loc.level === ctx.state.currentLevel &&
    (it.unpaid || (obj.c.pos && !it.noCharge && costlySpot(ctx, loc.x, loc.y)))
  ) {
    const room = insideShop(getLevel(ctx.state), loc.x, loc.y);
    const shk = room === null ? null : shopKeeper(ctx, loc.level, room);
    const e = shk === null ? undefined : ctx.state.entities[String(shk)];
    if (e) return { key: cap ? 'zap.owner.Mon' : 'zap.owner.mon', params: { mon: monNam(ctx, e) } };
    return { key: cap ? 'zap.owner.The' : 'zap.owner.the' };
  }
  const carrier = it?.carriedBy ?? null;
  if (carrier !== null && carrier !== ctx.state.playerId) {
    const m = ctx.state.entities[String(carrier)];
    if (m) return { key: cap ? 'zap.owner.Mon' : 'zap.owner.mon', params: { mon: monNam(ctx, m) } };
  }
  if (carrier === ctx.state.playerId) return { key: cap ? 'zap.owner.Your' : 'zap.owner.your' };
  return { key: cap ? 'zap.owner.The' : 'zap.owner.the' };
}

/** The whose-prefixed name pieces for burn messages: by holder (hero, monster) or floor. */
function where(ctx: Ctx, obj: Entity): 'invent' | 'minvent' | 'floor' | null {
  const it = obj.c.item;
  if (!it || it.containedIn !== undefined) return null;
  if (it.carriedBy === ctx.state.playerId) return 'invent';
  if (it.carriedBy !== null) return 'minvent';
  return obj.c.pos ? 'floor' : null;
}

/** A burnt-out candle or potion of oil is gone (useupall() when hers; billed when unpaid). */
function burnUp(ctx: Ctx, obj: Entity): void {
  if (obj.c.item?.carriedBy !== null) removeFromInventory(ctx, obj.id);
  billUsedUp(ctx, obj); // obfree(): an unpaid object stays on the bill, used up
  ctx.remove(obj.id);
}

/**
 * Timer callback for a burning object. ref: src/timeout.c burn_object() POT_OIL,
 * BRASS_LANTERN/OIL_LAMP, TALLOW_CANDLE/WAX_CANDLE
 */
function burnObject(ctx: Ctx, data: unknown): void {
  const { item, tok } = (data ?? {}) as { item?: number; tok?: number };
  if (typeof item !== 'number') return;
  const obj = ctx.state.entities[String(item)];
  const it = obj?.c.item;
  const rec = burnRec(ctx.state, item);
  if (!rec || rec.tok !== tok) return; // stopped timer
  setBurnRec(ctx, item, null);
  if (!obj || !it || !it.lit) return; // used up meanwhile (obfree() stops its timer)
  const loc = objLocation(ctx.state, obj);
  const canseeit = loc !== null && !heroHas(ctx.state, P.BLINDED) && heroSees(ctx, loc);
  const w = where(ctx, obj);
  // when carrying the light source, you can feel the heat from lit lamp or candle so you'll be
  // notified when it burns out even if blind at the time; brass lantern doesn't radiate
  // sufficient heat for that
  const bytouch = w === 'invent' && obj.def !== BRASS_LANTERN;
  const name = xnameOf(ctx.state, ctx.defs, obj);
  const holder = (): Msg | string => {
    const mon = it.carriedBy === null ? undefined : ctx.state.entities[String(it.carriedBy)];
    return mon ? monNam(ctx, mon) : '';
  };
  const age = it.age ?? 0;
  // obj->age is the age remaining at this point
  if (obj.def === POT_OIL) {
    // this should only be called when we run out
    if (canseeit) {
      if (w === 'invent' || w === 'minvent')
        say(ctx, 'oil.burnt_away', { whose: shkYour(ctx, obj, true) });
      else if (w === 'floor') say(ctx, 'oil.see_go_out');
    }
    endBurn(ctx, obj, false); // turn off light source
    burnUp(ctx, obj);
    return;
  }
  if (isCandle(obj.def)) {
    burnCandle(ctx, obj, age, canseeit, bytouch, w);
    return;
  }
  const lantern = obj.def === BRASS_LANTERN;
  switch (age) {
    case 150:
    case 100:
    case 50:
      if (canseeit) {
        if (lantern) lanternMessage(ctx, w, holder);
        else {
          // see_lamp_flicker(obj, age == 50 ? " considerably" : "")
          const much = age === 50 ? '_much' : '';
          if (w === 'invent') say(ctx, `lamp.your_flickers${much}`, { item: name });
          else if (w === 'minvent')
            say(ctx, `lamp.mon_flickers${much}`, { mon: holder(), item: name });
          else if (w === 'floor') say(ctx, `lamp.see_flicker${much}`, { item: name });
        }
      }
      break;
    case 25:
      if (canseeit) {
        if (lantern) lanternMessage(ctx, w, holder);
        else if (w === 'invent') say(ctx, 'lamp.your_about_out', { item: name });
        else if (w === 'minvent') say(ctx, 'lamp.mon_about_out', { mon: holder(), item: name });
        else if (w === 'floor') say(ctx, 'lamp.see_about_out', { item: name });
      }
      break;
    case 0:
      // even if blind you'll know if holding it
      if (canseeit || bytouch) {
        if (w === 'invent')
          say(ctx, lantern ? 'lamp.your_lantern_out' : 'lamp.your_gone_out', { item: name });
        else if (w === 'minvent')
          say(ctx, lantern ? 'lamp.mon_lantern_out' : 'lamp.mon_gone_out', {
            mon: holder(),
            item: name,
          });
        else if (w === 'floor')
          say(ctx, lantern ? 'lamp.see_lantern_out' : 'lamp.see_go_out', { item: name });
      }
      endBurn(ctx, obj, false);
      break;
    default:
      // someone added fuel to the lamp while it was lit: begin_burn() handles the new age
      break;
  }
  if (it.age) {
    delete it.lit; // begin_burn(obj, TRUE) relights it for the next stretch
    beginBurn(ctx, obj, true);
  }
}

/** The candle phases: 75 "getting short", 15 "flicker low", 0 consumed. ref: burn_object() */
function burnCandle(
  ctx: Ctx,
  obj: Entity,
  age: number,
  canseeit: boolean,
  bytouch: boolean,
  w: ReturnType<typeof where>,
): void {
  const it = obj.c.item;
  if (!it) return;
  const many = it.quantity > 1;
  const pl = many ? '_pl' : '';
  const carried = w === 'invent' || w === 'minvent';
  switch (age) {
    case 75:
      if (canseeit) {
        if (carried) say(ctx, `candle.short${pl}`, { whose: shkYour(ctx, obj, true) });
        else if (w === 'floor') say(ctx, `candle.see_short${pl}`);
      }
      break;
    case 15:
      if (canseeit) {
        if (carried) say(ctx, `candle.flicker_low${pl}`, { whose: shkYour(ctx, obj, true) });
        else if (w === 'floor') say(ctx, `candle.see_flicker_low${pl}`);
      }
      break;
    case 0:
      // we know even if blind and in our inventory
      if (canseeit || bytouch) {
        const name = xnameOf(ctx.state, ctx.defs, obj);
        if (carried)
          say(ctx, `candle.consumed${pl}`, { whose: shkYour(ctx, obj, true), item: name });
        else if (w === 'floor') say(ctx, `candle.see_consumed${pl}`, { item: name });
        // post message
        if (heroHas(ctx.state, P.HALLUC)) say(ctx, `candle.shriek${pl}`);
        else if (!heroHas(ctx.state, P.BLINDED)) say(ctx, `candle.flame_dies${pl}`);
      }
      endBurn(ctx, obj, false);
      burnUp(ctx, obj);
      return;
    default:
      // someone added fuel: begin_burn() handles the new age
      break;
  }
  if (it.age) {
    delete it.lit; // begin_burn(obj, TRUE) relights it for the next stretch
    beginBurn(ctx, obj, true);
  }
}

/** ref: src/timeout.c lantern_message() */
function lanternMessage(ctx: Ctx, w: ReturnType<typeof where>, holder: () => Msg | string): void {
  if (w === 'invent') {
    say(ctx, 'lamp.lantern_dim');
    if (heroHas(ctx.state, P.HALLUC)) say(ctx, 'lamp.batteries');
  } else if (w === 'floor') say(ctx, 'lamp.see_lantern_dim');
  else if (w === 'minvent') say(ctx, 'lamp.mon_lantern_dim', { mon: holder() });
}

/** Seen: by the hero when a monster has it, else unless she is blind. */
function snuffSeen(ctx: Ctx, obj: Entity): boolean {
  const it = obj.c.item;
  if (it && it.carriedBy !== null && it.carriedBy !== ctx.state.playerId) {
    const loc = objLocation(ctx.state, obj);
    return loc !== null && heroSees(ctx, loc);
  }
  return !heroHas(ctx.state, P.BLINDED);
}

/**
 * Lit candles go out when thrown, kicked or put away: "Your candle's flame is extinguished."
 * True if they were lit. ref: src/apply.c snuff_candle()
 */
export function snuffCandle(ctx: Ctx, obj: Entity): boolean {
  if (!isCandle(obj.def) || !obj.c.item?.lit) return false;
  const many = obj.c.item.quantity > 1;
  if (snuffSeen(ctx, obj))
    say(ctx, `candle.extinguished${many ? '_pl' : ''}`, { whose: shkYour(ctx, obj, true) });
  endBurn(ctx, obj, true);
  return true;
}

/**
 * A lit light goes out when it is hit by water or put into a container or the like; true if
 * it was lit. ref: src/apply.c snuff_lit()
 */
export function snuffLit(ctx: Ctx, obj: Entity): boolean {
  const it = obj.c.item;
  if (!it?.lit) return false;
  if (isLamp(obj.def) || obj.def === POT_OIL) {
    if (snuffSeen(ctx, obj))
      say(ctx, it.quantity > 1 ? 'lamp.go_out_pl' : 'lamp.goes_out', {
        whose: shkYour(ctx, obj, true),
        item: xnameOf(ctx.state, ctx.defs, obj),
      });
    endBurn(ctx, obj, true);
    return true;
  }
  return snuffCandle(ctx, obj);
}

/**
 * Fire lights an ignitable object (not a lantern, nor a magic lamp without its djinni, nor
 * anything out of fuel); a cursed lamp fails half the time. Carried unpaid goods cost extra.
 * ref: src/apply.c catch_lit()
 */
export function catchLit(ctx: Ctx, obj: Entity): boolean {
  const it = obj.c.item;
  if (!it || it.lit || !ignitable(obj.def)) return false;
  const loc = objLocation(ctx.state, obj);
  if (!loc) return false;
  // spe==0 => no djinni inside; age_is_relative && age==0 && still-exists means out of fuel;
  // lantern is classified as ignitable() but not by fire
  if (
    (obj.def === MAGIC_LAMP && it.spe === 0) ||
    (obj.def !== MAGIC_LAMP && (it.age ?? 0) === 0) ||
    obj.def === BRASS_LANTERN
  )
    return false;
  // once lit, cursed lamp is as good as non-cursed one, so failure to light is a minor
  // inconvenience to make cursed be worse
  if ((obj.def === OIL_LAMP || obj.def === MAGIC_LAMP) && it.buc === 'cursed' && !ctx.rng.rn2(2))
    return false;
  const carried = it.carriedBy === ctx.state.playerId;
  if (carried || heroSees(ctx, loc)) {
    const blind = heroHas(ctx.state, P.BLINDED);
    say(ctx, `lamp.${blind ? 'feel_warm' : 'catch'}${it.quantity > 1 ? '_pl' : ''}`, {
      whose: shkYour(ctx, obj, true),
      item: xnameOf(ctx.state, ctx.defs, obj),
    });
  }
  if (obj.def === POT_OIL) discover(ctx, POT_OIL);
  const hp = ctx.state.entities[String(ctx.state.playerId)]?.c.pos;
  if (carried && it.unpaid && hp && costlySpot(ctx, hp.x, hp.y)) {
    // if it catches while you have it, then it's your tough luck
    checkUnpaid(ctx, obj);
    say(ctx, `lamp.catch_cost${it.quantity === 1 ? '' : '_pl'}`, {
      whose: shkYour(ctx, obj, false),
      item: xnameOf(ctx.state, ctx.defs, obj),
    });
    billDummyObject(ctx, obj, false);
  }
  beginBurn(ctx, obj, false);
  return true;
}

/**
 * Fire lights the ignitable objects carried by `carrier` (an entity id) or lying on a floor
 * cell. ref: src/trap.c ignite_items()
 */
export function igniteItems(
  ctx: Ctx,
  from: EntityId | { level: string; x: number; y: number },
): void {
  const objs =
    typeof from === 'number'
      ? inventoryOf(ctx.state, from)
      : itemsAt(ctx.defs, ctx.state, from.level, from.x, from.y);
  for (const o of objs) if (!o.c.item?.lit) catchLit(ctx, o);
}

/** Applying candles: no candelabrum to attach them to. ref: src/apply.c use_candle() */
export function useCandle(ctx: Ctx, obj: Entity): void {
  if (uswallow(ctx)) {
    say(ctx, 'apply.no_elbow_room');
    return;
  }
  useLamp(ctx, obj);
}

/** Light (or put out) a lamp, lantern, magic lamp or candles. ref: src/apply.c use_lamp() */
export function useLamp(ctx: Ctx, obj: Entity): void {
  const it = obj.c.item;
  if (!it) return;
  const candle = isCandle(obj.def);
  const lamp = obj.def === BRASS_LANTERN ? 'lantern' : candle ? null : 'lamp';
  const many = it.quantity > 1;
  if (it.lit) {
    if (lamp) say(ctx, `lamp.now_off.${lamp}`);
    else
      say(ctx, 'candle.snuff_out', {
        whose: shkYour(ctx, obj, false),
        item: xnameOf(ctx.state, ctx.defs, obj),
      });
    endBurn(ctx, obj, true);
    return;
  }
  if (uinwater(ctx)) {
    say(ctx, candle ? 'candle.fire_water' : 'lamp.not_diving');
    return;
  }
  const blind = heroHas(ctx.state, P.BLINDED);
  // magic lamps with an spe == 0 (wished for) cannot be lit; the magic lamp's age is unused
  if (
    (!candle && obj.def !== MAGIC_LAMP && (it.age ?? 0) === 0) ||
    (obj.def === MAGIC_LAMP && it.spe === 0)
  ) {
    if (obj.def === BRASS_LANTERN) say(ctx, blind ? 'apply.nothing_seems' : 'lamp.out_of_power');
    else say(ctx, 'lamp.no_oil', { item: xnameOf(ctx.state, ctx.defs, obj) });
    return;
  }
  if (it.buc === 'cursed' && !ctx.rng.rn2(2)) {
    if ((obj.def === OIL_LAMP || obj.def === MAGIC_LAMP) && !ctx.rng.rn2(3)) {
      say(ctx, 'glib.lamp_spills', { fingers: fingersOrGloves(ctx, true) });
      makeGlib(ctx, glibTimeout(ctx.state) + ctx.rng.d(2, 10));
    } else if (!blind) {
      say(ctx, many ? 'lamp.flicker_die_pl' : 'lamp.flicker_die', {
        item: xnameOf(ctx.state, ctx.defs, obj),
      });
    } else say(ctx, 'apply.nothing_seems');
    return;
  }
  if (lamp) {
    checkUnpaid(ctx, obj); // a usage fee in a shop
    say(ctx, `lamp.now_on.${lamp}`);
  } else {
    // candle(s)
    say(ctx, `candle.burn${blind ? '' : '_brightly'}${many ? '_pl' : ''}`, {
      whose: shkYour(ctx, obj, true),
      item: xnameOf(ctx.state, ctx.defs, obj),
    });
    const hp = ctx.state.entities[String(ctx.state.playerId)]?.c.pos;
    if (
      it.unpaid &&
      hp &&
      costlySpot(ctx, hp.x, hp.y) &&
      it.age === 20 * ctx.defs.object(obj.def).cost
    ) {
      say(ctx, many ? 'candle.burn_bought_pl' : 'candle.burn_bought');
      billDummyObject(ctx, obj, false);
    }
  }
  beginBurn(ctx, obj, false);
}

/** The light radius of a lit object. ref: src/timeout.c begin_burn() `radius` */
export function lightRadius(def: DefId, quantity: number): number {
  if (isCandle(def)) return candleLightRange(quantity);
  if (def === POT_OIL) return 1; // very dim light
  return LAMP_RADIUS;
}

/** Sunsword shines while it is wielded, by the hero or a monster. ref: artifact_light() */
export const artiShining = (e: Entity): boolean =>
  e.c.item?.artifact === 'nh:sunsword' &&
  e.c.item.equipped === 'weapon' &&
  e.c.item.carriedBy !== null;

/**
 * The radius of Sunsword's light: 3 blessed, 2 uncursed, 1 cursed.
 * ref: src/light.c arti_light_radius()
 */
export const artiLightRadius = (e: Entity): number =>
  e.c.item?.buc === 'blessed' ? 3 : e.c.item?.buc === 'cursed' ? 1 : 2;

/**
 * Light sources: every lit object, at its own cell on the floor or at its carrier's (none
 * inside a container), with its radius: candles by their number, oil 1, lamps 3; and a
 * shining artifact at its wielder (artiLightRadius()).
 * ref: src/light.c do_light_sources(), new_light_source() via begin_burn()
 */
export function objLights(state: Readonly<GameState>): LightSource[] {
  const out: LightSource[] = [];
  for (const id of sortedIds(state)) {
    const e = state.entities[String(id)];
    const it = e?.c.item;
    if (e && it && artiShining(e)) {
      const loc = objLocation(state, e);
      if (loc) out.push({ level: loc.level, x: loc.x, y: loc.y, radius: artiLightRadius(e) });
      continue;
    }
    if (!e || !it?.lit) continue;
    const loc = objLocation(state, e);
    if (loc)
      out.push({ level: loc.level, x: loc.x, y: loc.y, radius: lightRadius(e.def, it.quantity) });
  }
  return out;
}

export function registerLight(api: ModApi): void {
  api.defineTimer({ id: BURN_TIMER, fire: burnObject });
  api.definePerception({ id: 'nh:lamps', lights: (state) => objLights(state) });
}
