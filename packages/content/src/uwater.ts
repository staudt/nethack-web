// The hero and water: being in it (u.uinwater), and the properties that decide what water and
// lava do to her. ref: include/youprop.h Swimming, Amphibious, Breathless, Wwalking,
// Known_wwalking, Underwater; include/mondata.h likes_lava(); src/teleport.c goodpos() (the
// hero's water and lava rules)
//
// `modData.nh.uinwater` is written only while she is in the water, so dry games keep their
// state. Her form is the polymorphed form, else her own (a human: no swimming).
// Not ported: steeds, the Plane of Water (Wwalking is never cancelled there), the swimming
// intrinsic from anything but a form (HSwimming has no other source here).
import { getPlayer, type Ctx, type Json } from '@nh/core';
import { isKnown } from './o_init';
import { P, hasProp, wornIn } from './props';
import { flying, levitating } from './trapstate';
import { heroForm } from './upoly';

type S = Pick<Ctx, 'state'>;
type SD = Pick<Ctx, 'state' | 'defs'>;

export const WATER_WALKING_BOOTS = 'nh:water_walking_boots';

/** Underwater, u.uinwater: she is in the water (a swimmer, amphibious or breathless form). */
export const uinwater = (ctx: S): boolean =>
  (ctx.state.modData['nh'] as { uinwater?: boolean } | undefined)?.uinwater === true;

/**
 * Sets or clears u.uinwater (written only while set). C's set_uinwater() also runs
 * switch_terrain(), which matters only inside walls of water and lava (DEVIATIONS "Water").
 */
export function setUinwater(ctx: S, on: boolean): void {
  const nh = (ctx.state.modData['nh'] ??= {}) as Record<string, Json>;
  if (on) nh['uinwater'] = true;
  else delete nh['uinwater'];
}

const formHas = (ctx: SD, flag: string): boolean => heroForm(ctx)?.flags.includes(flag) === true;

/** ref: youprop.h Swimming: her form swims (no steed) */
export const swimming = (ctx: SD): boolean => formHas(ctx, 'swim');

/** ref: youprop.h Breathless: magical breathing or a breathless form */
export const breathless = (ctx: SD): boolean =>
  hasProp(getPlayer(ctx.state), P.MAGICAL_BREATHING) || formHas(ctx, 'breathless');

/** ref: youprop.h Amphibious: magical breathing or an amphibious (or breathless) form */
export const amphibious = (ctx: SD): boolean => breathless(ctx) || formHas(ctx, 'amphibious');

/** ref: youprop.h Wwalking (worn water walking boots; no Plane of Water) */
export const wwalking = (ctx: S): boolean => hasProp(getPlayer(ctx.state), P.WWALKING);

/** ref: youprop.h Known_wwalking: worn water walking boots she knows by name (no steed) */
export const knownWwalking = (ctx: SD): boolean =>
  wornIn(ctx.state, ctx.state.playerId, 'boots')?.def === WATER_WALKING_BOOTS &&
  isKnown(ctx.state, ctx.defs, WATER_WALKING_BOOTS);

/**
 * pooleffects() and drown() (drown.ts), for the modules below it that move the hero or take
 * away what keeps her up (teleds(), float_down(), Boots_off()): drown.ts sets them at load.
 */
interface PoolFx {
  pooleffects(ctx: Ctx, newspot: boolean): boolean;
  drown(ctx: Ctx): boolean;
}
let poolFx: PoolFx | null = null;

export function setPoolFx(fx: PoolFx): void {
  poolFx = fx;
}

/** pooleffects(): true when she moved while surviving (see drown.ts). */
export const poolEffects = (ctx: Ctx, newspot: boolean): boolean =>
  poolFx?.pooleffects(ctx, newspot) ?? false;

/** drown(): true when she moved while surviving (see drown.ts). */
export const drownLate = (ctx: Ctx): boolean => poolFx?.drown(ctx) ?? false;

/** ref: include/mondata.h likes_lava(): fire elementals and salamanders */
export const likesLavaId = (id: string | undefined): boolean =>
  id === 'nh:fire_elemental' || id === 'nh:salamander';

/**
 * ref: src/teleport.c goodpos() for the hero on water (`waterwall`: a wall of water, which
 * nothing stays on top of) or lava: in the water she swims or is amphibious, or stays above it
 * levitating, flying or water walking; over lava she must levitate, fly, walk on it with
 * fireproof water walking boots and fire resistance, or be a lava-loving form.
 */
export function heroLiquidOk(ctx: SD, liquid: 'water' | 'lava', waterwall: boolean): boolean {
  if (liquid === 'water')
    return (
      swimming(ctx) ||
      amphibious(ctx) ||
      (!waterwall && (levitating(ctx) || flying(ctx) || wwalking(ctx)))
    );
  const h = getPlayer(ctx.state);
  const boots = wornIn(ctx.state, h.id, 'boots');
  return (
    levitating(ctx) ||
    flying(ctx) ||
    (hasProp(h, P.FIRE_RES) && wwalking(ctx) && boots?.c.item?.erodeproof === true) ||
    likesLavaId(heroForm(ctx)?.id)
  );
}
