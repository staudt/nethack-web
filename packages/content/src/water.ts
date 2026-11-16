// Getting an object wet: scrolls and spellbooks fade to blank paper, potions are diluted (twice:
// water), a potion of acid explodes, rustprone items rust, a container lets the water in (or,
// waterproof, keeps it out) and a carried lit lantern flickers.
// ref: src/trap.c water_damage(), water_damage_chain(), pot_acid_damage(); src/apply.c
// splash_lit()
//
// Not ported (DEVIATIONS "Dipping"): grease, cans of grease, mail and novels (none of them
// exist); towels get wet in m19 step 8.
import {
  cellIndex,
  contents,
  getPlayer,
  isVisible,
  takeOut,
  type Ctx,
  type Entity,
  type Msg,
} from '@nh/core';
import { isDiluted, setDiluted } from './dilute';
import { erodeObj } from './erode';
import { removeFromInventory } from './items';
import { LAMP, snuffLit } from './light';
import { luckOf } from './luck';
import { discover } from './o_init';
import { xnameOf } from './objnam';
import { P, hasProp } from './props';
import { billUsedUp } from './shk';
import { BLANK_PAPER, blankStudied } from './spell';

/** ref: include/hack.h ER_NOTHING, ER_DAMAGED, ER_DESTROYED (no ER_GREASED: no grease) */
export type WaterResult = 'nothing' | 'damaged' | 'destroyed';

const SCR_BLANK_PAPER = 'nh:scroll_of_blank_paper';
const OILSKIN_SACK = 'nh:oilskin_sack';
export const POT_WATER = 'nh:potion_of_water';
export const POT_ACID = 'nh:potion_of_acid';

/**
 * What a water_damage() call tells its caller beyond its result: `mentionedWater` is C's
 * gm.mentioned_water (a container message named the water); `acid` is the acid context of a
 * water_damage_chain() (how many potions of acid have exploded so far in this soaking).
 */
export interface WaterNote {
  mentionedWater?: boolean;
  acid?: { boom: number };
}

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const blind = (ctx: Ctx): boolean => hasProp(getPlayer(ctx.state), P.BLINDED);

/**
 * A lit light source splashed with water: a carried brass lantern only crackles and flickers,
 * anything else goes out. True when it went out. ref: src/apply.c splash_lit() (the hero is
 * never under water and nothing is deaf here, so a carried lantern always crackles)
 */
function splashLit(ctx: Ctx, obj: Entity): boolean {
  const it = obj.c.item;
  if (!it?.lit) return false;
  if (obj.def === LAMP.lantern && it.carriedBy === ctx.state.playerId) {
    say(ctx, blind(ctx) ? 'water.lantern_crackles' : 'water.lantern_flickers', {
      item: xnameOf(ctx.state, ctx.defs, obj),
    });
    return false;
  }
  return snuffLit(ctx, obj);
}

/**
 * Gets `obj` wet and damages it. `ostr` replaces the item's name in messages; `force` skips
 * the Luck-based protection. ref: src/trap.c water_damage()
 */
export function waterDamage(
  ctx: Ctx,
  obj: Entity,
  ostr: Msg | null,
  force: boolean,
  note: WaterNote = {},
): WaterResult {
  const it = obj.c.item;
  if (!it) return 'nothing';
  const inInvent = it.carriedBy === ctx.state.playerId;
  if (splashLit(ctx, obj)) return 'damaged';
  const name = ostr ?? xnameOf(ctx.state, ctx.defs, obj);
  const def = ctx.defs.object(obj.def);
  const pl = it.quantity !== 1 ? '_pl' : '';
  const waterproof = def.container?.box === true || obj.def === OILSKIN_SACK;
  const halluc = hasProp(getPlayer(ctx.state), P.HALLUC);

  // (a towel gets wetter here: m19 step 8's wet_a_towel())
  if (def.container && (!waterproof || (it.buc === 'cursed' && !ctx.rng.rn2(3)))) {
    if (inInvent) {
      say(ctx, 'water.gets_into', { item: name });
      note.mentionedWater = !halluc;
    }
    // ref: water_damage_chain(obj->cobj, FALSE)
    waterDamageChain(ctx, contents(ctx.state, obj.id));
    return 'damaged'; // contents were damaged
  }
  if (waterproof) {
    if (inInvent && !blind(ctx)) {
      say(ctx, 'water.cannot_get_into', { item: name });
      note.mentionedWater = !halluc;
      discover(ctx, def); // if an oilskin sack, discover it
    }
    // not actually damaged, but the hero now knows more
    return 'damaged';
  }
  // chance per item of sustaining damage: max luck 10%, Luck 0 75%, Luck < -4 100%
  if (!force && luckOf(ctx.state) + 5 > ctx.rng.rn2(20)) return 'nothing';
  if (def.class === 'scroll') {
    if (obj.def === SCR_BLANK_PAPER) return 'nothing';
    if (inInvent) say(ctx, `water.fade${pl}`, { item: name });
    obj.def = SCR_BLANK_PAPER;
    it.spe = 0;
    return 'damaged';
  }
  if (def.class === 'spellbook') {
    if (obj.def === 'nh:book_of_the_dead') {
      // (it can't be contained or buried)
      const p = it.carriedBy !== null ? ctx.state.entities[String(it.carriedBy)]?.c.pos : obj.c.pos;
      const level = p ? ctx.state.levels[p.level] : undefined;
      const seen =
        p !== undefined &&
        level !== undefined &&
        p.level === ctx.state.currentLevel &&
        isVisible(ctx.state, cellIndex(level, p.x, p.y));
      if (seen) say(ctx, 'erode.book_steam', { item: xnameOf(ctx.state, ctx.defs, obj) });
      return 'nothing';
    }
    if (obj.def === BLANK_PAPER) return 'nothing';
    if (inInvent) say(ctx, `water.fade${pl}`, { item: name });
    obj.def = BLANK_PAPER;
    blankStudied(ctx, obj.id);
    return 'damaged';
  }
  if (def.class === 'potion') {
    if (obj.def === POT_ACID) {
      potAcidDamage(ctx, obj, inInvent, note.acid);
      return 'destroyed';
    }
    if (isDiluted(it)) {
      if (inInvent) say(ctx, `water.dilute_further${pl}`, { item: name });
      obj.def = POT_WATER;
      it.buc = 'uncursed';
      setDiluted(it, false);
      return 'damaged';
    }
    if (obj.def !== POT_WATER) {
      if (inInvent) say(ctx, `water.dilute${pl}`, { item: name });
      setDiluted(it, true);
      return 'damaged';
    }
    return 'nothing';
  }
  const r = erodeObj(ctx, obj, ostr, 'rust');
  return r === 'greased' ? 'nothing' : r; // nothing is ever greased
}

/**
 * A potion of acid meets water and explodes: "A potion of acid explodes!" ("Some ... explode!",
 * then "Another ..."/"More ..." for the next ones of the same soaking), and it is gone.
 * ref: src/trap.c pot_acid_damage() (no grease, so never "described"; every object is dknown)
 */
function potAcidDamage(
  ctx: Ctx,
  obj: Entity,
  inInvent: boolean,
  acid: { boom: number } | undefined,
): void {
  const it = obj.c.item;
  if (!it) return;
  const one = it.quantity === 1;
  const exploded = (acid?.boom ?? 0) > 0;
  say(ctx, `water.acid_${exploded ? (one ? 'another' : 'more') : one ? 'one' : 'some'}`, {
    item: xnameOf(ctx.state, ctx.defs, obj),
  });
  if (acid) acid.boom++;
  // setnotworn(); delobj()
  if (inInvent) removeFromInventory(ctx, obj.id);
  if (it.containedIn !== undefined) takeOut(ctx.state, obj.id);
  billUsedUp(ctx, obj);
  ctx.remove(obj.id);
}

/**
 * Gets every object of `objs` wet in turn (her inventory, or the objects on a square), with
 * one acid context for the potions of acid that explode. ref: src/trap.c water_damage_chain()
 */
export function waterDamageChain(ctx: Ctx, objs: readonly Entity[]): void {
  const note: WaterNote = { acid: { boom: 0 } };
  for (const o of objs)
    if (ctx.state.entities[String(o.id)]) waterDamage(ctx, o, null, false, note);
}
