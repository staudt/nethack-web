// Slippery fingers (Glib) and wet towels: the state and its small helpers, low enough for the
// many places that grease or wipe her fingers (lamps, oil, tins, markers, washing, gloves,
// rings, prayer, polymorph) and that wet or dry a towel (water, fire, throwing, hitting,
// engraving). glibr() and use_towel() are towel.ts's.
// ref: src/potion.c make_glib(); src/do_wear.c fingers_or_gloves(); src/objnam.c
// gloves_simple_name(); src/weapon.c wet_a_towel(), dry_a_towel(), finish_towel_change();
// include/obj.h is_wet_towel(); include/youprop.h Glib, Half_gas_damage
//
// Glib is the timed property `P.GLIB` (C keeps only its TIMEOUT bits). A towel's wetness is its
// `spe`, 0 (dry) to 7.
import { getPlayer, type Ctx, type Entity, type GameState, type Msg } from '@nh/core';
import { canseemon } from './invis';
import { isKnown } from './o_init';
import { xnameOf } from './objnam';
import { monNam } from './perception';
import { P, hasProp, setItimeout, timeoutLeft, wornIn } from './props';

export const TOWEL = 'nh:towel';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/** ref: include/youprop.h Glib */
export const isGlib = (state: Readonly<GameState>): boolean => hasProp(getPlayer(state), P.GLIB);

/** `Glib & TIMEOUT`: the turns of slippery fingers left. */
export const glibTimeout = (state: Readonly<GameState>): number =>
  timeoutLeft(state, getPlayer(state), P.GLIB);

/** Sets or clears slippery fingers (`xtime` turns; 0 clears). ref: src/potion.c make_glib() */
export function makeGlib(ctx: Pick<Ctx, 'state'>, xtime: number): void {
  setItimeout(ctx.state, getPlayer(ctx.state), P.GLIB, xtime);
}

/**
 * "gauntlets" when the gloves' known name (or else their description) says so, else "gloves".
 * No glove description is a gauntlet, so an unidentified pair is always "gloves".
 * ref: src/objnam.c gloves_simple_name()
 */
export function glovesSimpleName(ctx: Pick<Ctx, 'state' | 'defs'>, gloves: Entity): Msg {
  const known = isKnown(ctx.state, ctx.defs, gloves.def);
  return { key: known && gloves.def.includes('gauntlets') ? 'glib.gauntlets' : 'glib.gloves' };
}

/** Her worn gloves (uarmg), or null. */
export const uarmg = (ctx: Pick<Ctx, 'state'>): Entity | null =>
  wornIn(ctx.state, ctx.state.playerId, 'gloves');

/**
 * "fingers", or her gloves' simple name when `checkGloves` and she wears some.
 * ref: src/do_wear.c fingers_or_gloves() (always "fingers": no body_part() of other forms)
 */
export function fingersOrGloves(ctx: Pick<Ctx, 'state' | 'defs'>, checkGloves: boolean): Msg {
  const g = checkGloves ? uarmg(ctx) : null;
  return g ? glovesSimpleName(ctx, g) : { key: 'glib.fingers' };
}

/** ref: include/obj.h is_wet_towel() */
export const isWetTowel = (e: Entity): boolean => e.def === TOWEL && (e.c.item?.spe ?? 0) > 0;

/**
 * A worn damp or wet towel wards off noxious fumes. ref: include/youprop.h Half_gas_damage
 */
export function halfGasDamage(state: Readonly<GameState>): boolean {
  const ublindf = wornIn(state, state.playerId, 'blindfold');
  return ublindf !== null && isWetTowel(ublindf);
}

/** The wetness stays within 0..7. ref: src/weapon.c finish_towel_change() */
function finishTowelChange(obj: Entity, newspe: number): void {
  const it = obj.c.item;
  if (it) it.spe = Math.max(Math.min(newspe, 7), 0);
}

/** "Your towel" (the shop's "The" for an unpaid one) or the monster carrying it, if seen. */
function towelOwner(ctx: Ctx, obj: Entity): { you: boolean; params: Msg['params'] } | null {
  const it = obj.c.item;
  if (!it) return null;
  const item = xnameOf(ctx.state, ctx.defs, obj);
  if (it.carriedBy === ctx.state.playerId)
    return { you: true, params: { item, whose: it.unpaid ? '@towel.the' : '@towel.your' } };
  const mon = it.carriedBy === null ? undefined : ctx.state.entities[String(it.carriedBy)];
  if (mon?.c.monster && canseemon(ctx, mon))
    return { you: false, params: { item, mon: monNam(ctx, mon) } };
  return null;
}

/**
 * Makes a towel wetter: `amt` positive is the new wetness, negative adds `-amt`, zero does
 * nothing; only an increase is reported ("Your towel gets damp.", "... wetter.").
 * ref: src/weapon.c wet_a_towel()
 */
export function wetATowel(ctx: Ctx, obj: Entity, amt: number, verbose: boolean): void {
  const it = obj.c.item;
  if (!it) return;
  const newspe = amt <= 0 ? it.spe - amt : amt;
  if (newspe > it.spe && verbose) {
    const how = newspe < 3 ? (!it.spe ? 'damp' : 'damper') : !it.spe ? 'wet' : 'wetter';
    const who = towelOwner(ctx, obj);
    if (who)
      say(ctx, who.you ? 'towel.gets' : 'towel.mon_gets', { ...who.params, how: `@towel.${how}` });
  }
  if (newspe !== it.spe) finishTowelChange(obj, newspe);
}

/**
 * Makes a towel drier: `amt` zero or positive is the new wetness, negative takes `-amt` off;
 * only a decrease is reported ("Your towel dries.", "... dries out."). ref: src/weapon.c
 * dry_a_towel()
 */
export function dryATowel(ctx: Ctx, obj: Entity, amt: number, verbose: boolean): void {
  const it = obj.c.item;
  if (!it) return;
  const newspe = amt < 0 ? it.spe + amt : amt;
  if (newspe < it.spe && verbose) {
    const who = towelOwner(ctx, obj);
    if (who)
      say(
        ctx,
        `${who.you ? 'towel.dries' : 'towel.mon_dries'}${!newspe ? '_out' : ''}`,
        who.params,
      );
  }
  if (newspe !== it.spe) finishTowelChange(obj, newspe);
}
