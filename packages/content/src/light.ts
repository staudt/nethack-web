// Lamps and lanterns: lighting them (apply), the fuel timer with its warnings, snuffing them out,
// catching fire (ignite_items), and the light they give (a PerceptionDef light source).
// ref: src/apply.c use_lamp(), snuff_lit(), catch_lit(); src/timeout.c begin_burn(),
// end_burn(), burn_object(), cleanup_burn(), see_lamp_flicker(), lantern_message();
// src/trap.c ignite_items(); src/light.c new_light_source()
//
// The fuel is `ItemComponent.age` (obj->age) and the lit state `ItemComponent.lit`
// (obj->lamplit). A burning lamp has one `nh:burn_object` timer; NetHack stops that timer when
// the lamp is snuffed (stop_timer), which core timers cannot do, so the live timer is recorded in
// `modData.nh.burn[id] = { due, tok }` and a timer whose token does not match is ignored.
//
// Not ported: candles, the magic lamp, potions of oil, artifact lights, Glib (a cursed lamp that
// spills oil only says so), shop billing, light sources carried while the hero is away from the
// level (their timers simply run on).
import {
  itemsAt,
  inventoryOf,
  sortedIds,
  type Ctx,
  type Entity,
  type EntityId,
  type GameState,
  type LightSource,
  type ModApi,
  type Msg,
  type Pos,
} from '@nh/core';
import { heroSees } from './mongear';
import { xnameOf } from './objnam';
import { P, heroHas } from './props';
import { monNam } from './perception';
import { checkUnpaid } from './shk';

export const LAMP = {
  oil: 'nh:oil_lamp',
  lantern: 'nh:brass_lantern',
} as const;

const BURN_TIMER = 'nh:burn_object';

/** Light radius of a burning lamp or lantern. ref: src/timeout.c begin_burn() `radius = 3` */
const LAMP_RADIUS = 3;

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

export const isLamp = (def: string): boolean => def === LAMP.oil || def === LAMP.lantern;

interface BurnData {
  burn?: Record<string, { due: number; tok: number }>;
  burnTok?: number;
}

function burnData(ctx: Pick<Ctx, 'state'>): BurnData {
  const md = ctx.state.modData;
  let d = md['nh'] as unknown as BurnData | undefined;
  if (typeof d !== 'object' || d === null) {
    d = {};
    md['nh'] = d as unknown as (typeof md)[string];
  }
  return d;
}

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
 * Starts a lit object burning: a timer to the next warning (150, 100, 50, 25 turns of fuel left,
 * then 0) and the light. ref: src/timeout.c begin_burn()
 */
export function beginBurn(ctx: Ctx, obj: Entity, _alreadyLit = false): void {
  const it = obj.c.item;
  if (!it || !isLamp(obj.def)) return;
  const age = it.age ?? 0;
  if (age === 0) return;
  // magic times are 150, 100, 50, 25, and 0
  let turns: number;
  if (age > 150) turns = age - 150;
  else if (age > 100) turns = age - 100;
  else if (age > 50) turns = age - 50;
  else if (age > 25) turns = age - 25;
  else turns = age;
  const d = burnData(ctx);
  const tok = (d.burnTok ?? 0) + 1;
  d.burnTok = tok;
  (d.burn ??= {})[String(obj.id)] = { due: ctx.state.turn + turns, tok };
  ctx.schedule(turns, BURN_TIMER, { item: obj.id, tok });
  it.lit = true;
  it.age = age - turns;
}

/**
 * Puts the light out. With `timerAttached`, the unused fuel of the current stretch is given
 * back (cleanup_burn()). ref: src/timeout.c end_burn()
 */
export function endBurn(ctx: Ctx, obj: Entity, timerAttached: boolean): void {
  const it = obj.c.item;
  if (!it?.lit) return;
  const d = burnData(ctx);
  const rec = d.burn?.[String(obj.id)];
  if (rec && d.burn) {
    // restore unused time
    if (timerAttached) it.age = (it.age ?? 0) + Math.max(rec.due - ctx.state.turn, 0);
    delete d.burn[String(obj.id)];
    if (Object.keys(d.burn).length === 0) delete d.burn;
  }
  delete it.lit;
}

/** The whose-prefixed name pieces for burn messages: by holder (hero, monster) or floor. */
function where(ctx: Ctx, obj: Entity): 'invent' | 'minvent' | 'floor' | null {
  const it = obj.c.item;
  if (!it || it.containedIn !== undefined) return null;
  if (it.carriedBy === ctx.state.playerId) return 'invent';
  if (it.carriedBy !== null) return 'minvent';
  return obj.c.pos ? 'floor' : null;
}

/** Timer callback for a burning lamp. ref: src/timeout.c burn_object() BRASS_LANTERN/OIL_LAMP */
function burnObject(ctx: Ctx, data: unknown): void {
  const { item, tok } = (data ?? {}) as { item?: number; tok?: number };
  const obj = typeof item === 'number' ? ctx.state.entities[String(item)] : undefined;
  const it = obj?.c.item;
  const d = burnData(ctx);
  const rec = typeof item === 'number' ? d.burn?.[String(item)] : undefined;
  if (!obj || !it || !it.lit || !rec || rec.tok !== tok) return; // stopped timer
  delete d.burn?.[String(obj.id)];
  if (d.burn && Object.keys(d.burn).length === 0) delete d.burn;
  const loc = objLocation(ctx.state, obj);
  const canseeit = loc !== null && !heroHas(ctx.state, P.BLINDED) && heroSees(ctx, loc);
  const w = where(ctx, obj);
  const lantern = obj.def === LAMP.lantern;
  const bytouch = w === 'invent' && !lantern;
  const name = xnameOf(ctx.state, ctx.defs, obj);
  const holder = (): Msg | string => {
    const mon = it.carriedBy === null ? undefined : ctx.state.entities[String(it.carriedBy)];
    return mon ? monNam(ctx, mon) : '';
  };
  const age = it.age ?? 0;
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

/**
 * A lit lamp goes out when it is put into a container or the like; true if it was lit.
 * ref: src/apply.c snuff_lit()
 */
export function snuffLit(ctx: Ctx, obj: Entity): boolean {
  if (!obj.c.item?.lit || !isLamp(obj.def)) return false;
  const it = obj.c.item;
  const loc = objLocation(ctx.state, obj);
  const seen =
    it.carriedBy !== null && it.carriedBy !== ctx.state.playerId
      ? loc !== null && heroSees(ctx, loc)
      : !heroHas(ctx.state, P.BLINDED);
  if (seen)
    say(ctx, it.carriedBy === ctx.state.playerId ? 'lamp.your_goes_out' : 'lamp.the_goes_out', {
      item: xnameOf(ctx.state, ctx.defs, obj),
    });
  endBurn(ctx, obj, true);
  return true;
}

/** Fire lights an oil lamp (not a lantern). ref: src/apply.c catch_lit() */
export function catchLit(ctx: Ctx, obj: Entity): boolean {
  const it = obj.c.item;
  if (!it || it.lit || obj.def !== LAMP.oil) return false;
  const loc = objLocation(ctx.state, obj);
  if (!loc) return false;
  // age_is_relative && age == 0: out of fuel
  if ((it.age ?? 0) === 0) return false;
  // once lit, cursed lamp is as good as non-cursed one, so failure to light is a minor
  // inconvenience to make cursed be worse
  if (it.buc === 'cursed' && !ctx.rng.rn2(2)) return false;
  const carried = it.carriedBy === ctx.state.playerId;
  if (carried || heroSees(ctx, loc)) {
    const blind = heroHas(ctx.state, P.BLINDED);
    say(ctx, `lamp.${carried ? 'your' : 'the'}_${blind ? 'feels_warm' : 'catches'}`, {
      item: xnameOf(ctx.state, ctx.defs, obj),
    });
  }
  beginBurn(ctx, obj, false);
  return true;
}

/**
 * Fire lights the lamps carried by `carrier` (an entity id) or lying on a floor cell.
 * ref: src/trap.c ignite_items()
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

/** ref: src/apply.c use_lamp() for an oil lamp or brass lantern. */
export function useLamp(ctx: Ctx, obj: Entity): void {
  const it = obj.c.item;
  if (!it) return;
  const lamp = obj.def === LAMP.lantern ? 'lantern' : 'lamp';
  if (it.lit) {
    say(ctx, `lamp.now_off.${lamp}`);
    endBurn(ctx, obj, true);
    return;
  }
  const blind = heroHas(ctx.state, P.BLINDED);
  if ((it.age ?? 0) === 0) {
    if (obj.def === LAMP.lantern) say(ctx, blind ? 'apply.nothing_seems' : 'lamp.out_of_power');
    else say(ctx, 'lamp.no_oil', { item: xnameOf(ctx.state, ctx.defs, obj) });
    return;
  }
  if (it.buc === 'cursed' && !ctx.rng.rn2(2)) {
    if (obj.def === LAMP.oil && !ctx.rng.rn2(3)) {
      const gloves = inventoryOf(ctx.state, ctx.state.playerId).some(
        (o) => o.c.item?.equipped === 'gloves',
      );
      say(ctx, gloves ? 'lamp.spills_gloves' : 'lamp.spills_fingers');
      ctx.rng.d(2, 10); // make_glib((Glib & TIMEOUT) + d(2, 10)): no Glib yet
    } else if (!blind) {
      say(ctx, 'lamp.flicker_die', { item: xnameOf(ctx.state, ctx.defs, obj) });
    } else say(ctx, 'apply.nothing_seems');
    return;
  }
  checkUnpaid(ctx, obj); // ref: use_lamp(): check_unpaid(obj), a usage fee in a shop
  say(ctx, `lamp.now_on.${lamp}`);
  beginBurn(ctx, obj, false);
}

/**
 * Light sources: every lit lamp, at its own cell on the floor or at its carrier's.
 * ref: src/light.c do_light_sources(), new_light_source() via begin_burn()
 */
export function lampLights(state: Readonly<GameState>): LightSource[] {
  const out: LightSource[] = [];
  for (const id of sortedIds(state)) {
    const e = state.entities[String(id)];
    if (!e?.c.item?.lit) continue;
    const loc = objLocation(state, e);
    if (loc) out.push({ level: loc.level, x: loc.x, y: loc.y, radius: LAMP_RADIUS });
  }
  return out;
}

export function registerLight(api: ModApi): void {
  api.defineTimer({ id: BURN_TIMER, fire: burnObject });
  api.definePerception({ id: 'nh:lamps', lights: (state) => lampLights(state) });
}
