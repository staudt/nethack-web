// Wounded legs. ref: src/do.c set_wounded_legs()
import { getPlayer, type Ctx } from '@nh/core';
import { encumberMsg } from './itemactions';
import { nhData } from './items';
import { P, hasProp, setItimeout, timeoutLeft } from './props';

const hero = (ctx: Ctx) => getPlayer(ctx.state);

/** ref: include/prop.h LEFT_SIDE, RIGHT_SIDE, BOTH_SIDES (EWounded_legs bits) */
export const LEFT_SIDE = 1;
export const RIGHT_SIDE = 2;
export const BOTH_SIDES = LEFT_SIDE | RIGHT_SIDE;

/**
 * Wounds a leg (`side`, the right one by default) for `timex` turns; both legs heal together.
 * ref: src/do.c set_wounded_legs() (`EWounded_legs |= side`; the Dex penalty is not ported). The
 * side bits are kept in `modData.nh.legSides` (absent: the right leg) and only mean something while Wounded_legs lasts.
 */
export function setWoundedLegs(ctx: Ctx, timex: number, side: number = RIGHT_SIDE): void {
  const h = hero(ctx);
  const d = nhData(ctx) as unknown as { legsHurt?: boolean; legSides?: number };
  const wounded = hasProp(h, P.WOUNDED_LEGS);
  const sides = (wounded ? (d.legSides ?? RIGHT_SIDE) : 0) | side;
  // kept only when it is not the right leg alone (a missing field reads so)
  if (sides === RIGHT_SIDE) delete d.legSides;
  else d.legSides = sides;
  if (!wounded || timeoutLeft(ctx.state, h, P.WOUNDED_LEGS) < timex)
    setItimeout(ctx.state, h, P.WOUNDED_LEGS, timex);
  d.legsHurt = true;
  encumberMsg(ctx); // Wounded_legs reduces carrying capacity
}

/** Which legs are wounded (EWounded_legs & BOTH_SIDES); RIGHT_SIDE for older saves. */
export function woundedLegSides(ctx: Pick<Ctx, 'state'>): number {
  const nh = ctx.state.modData['nh'] as { legSides?: number } | undefined;
  return nh?.legSides ?? RIGHT_SIDE;
}
