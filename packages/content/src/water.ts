// Getting an object wet: scrolls and spellbooks fade to blank paper, rustprone items rust, a
// container lets the water in (or, waterproof, keeps it out) and a carried lit lantern flickers.
// ref: src/trap.c water_damage(), water_damage_chain(); src/apply.c splash_lit()
//
// Not ported (DEVIATIONS "Dipping"): potion dilution (potions are untouched, ER_NOTHING), the
// potion of acid, grease, towels, cans of grease, mail, the Book of the Dead and novels (none of
// them exist).
import { contents, getPlayer, type Ctx, type Entity, type Msg } from '@nh/core';
import { erodeObj } from './erode';
import { LAMP, snuffLit } from './light';
import { luckOf } from './luck';
import { discover } from './o_init';
import { xnameOf } from './objnam';
import { P, hasProp } from './props';
import { BLANK_PAPER, blankStudied } from './spell';

/** ref: include/hack.h ER_NOTHING, ER_DAMAGED, ER_DESTROYED (no ER_GREASED: no grease) */
export type WaterResult = 'nothing' | 'damaged' | 'destroyed';

const SCR_BLANK_PAPER = 'nh:scroll_of_blank_paper';
const OILSKIN_SACK = 'nh:oilskin_sack';

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
export function waterDamage(ctx: Ctx, obj: Entity, ostr: Msg | null, force: boolean): WaterResult {
  const it = obj.c.item;
  if (!it) return 'nothing';
  const inInvent = it.carriedBy === ctx.state.playerId;
  if (splashLit(ctx, obj)) return 'damaged';
  const name = ostr ?? xnameOf(ctx.state, ctx.defs, obj);
  const def = ctx.defs.object(obj.def);
  const pl = it.quantity !== 1 ? '_pl' : '';
  const waterproof = def.container?.box === true || obj.def === OILSKIN_SACK;

  if (def.container && (!waterproof || (it.buc === 'cursed' && !ctx.rng.rn2(3)))) {
    if (inInvent) say(ctx, 'water.gets_into', { item: name });
    // ref: water_damage_chain(obj->cobj, FALSE)
    for (const o of contents(ctx.state, obj.id)) waterDamage(ctx, o, null, false);
    return 'damaged'; // contents were damaged
  }
  if (waterproof) {
    if (inInvent && !blind(ctx)) {
      say(ctx, 'water.cannot_get_into', { item: name });
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
    if (obj.def === BLANK_PAPER) return 'nothing';
    if (inInvent) say(ctx, `water.fade${pl}`, { item: name });
    obj.def = BLANK_PAPER;
    blankStudied(ctx, obj.id);
    return 'damaged';
  }
  // potions would be diluted: not ported
  if (def.class === 'potion') return 'nothing';
  const r = erodeObj(ctx, obj, ostr, 'rust');
  return r === 'greased' ? 'nothing' : r; // nothing is ever greased
}
