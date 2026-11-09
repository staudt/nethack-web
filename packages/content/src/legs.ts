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

/**
 * "Your left leg is in no shape for jumping." (the wounded side, or "legs are" for both).
 * `what` is the activity's message key. ref: src/do.c legs_in_no_shape() (no steed)
 */
export function legsInNoShape(ctx: Ctx, what: string): void {
  const wl = woundedLegSides(ctx) & BOTH_SIDES;
  const key =
    wl === BOTH_SIDES
      ? 'legs.no_shape_both'
      : wl === LEFT_SIDE
        ? 'legs.no_shape_left'
        : 'legs.no_shape_right';
  ctx.emit({ type: 'msg', key, params: { what: `@${what}` } });
}

/**
 * Wounded legs heal at once: "Your leg feels better." ("legs feel" when both were hurt), then an
 * encumbrance check. ref: src/do.c heal_legs(0) (no steed; the Dex penalty is not ported)
 */
export function healLegs(ctx: Ctx): void {
  const h = hero(ctx);
  if (!hasProp(h, P.WOUNDED_LEGS)) return;
  const both = (woundedLegSides(ctx) & BOTH_SIDES) === BOTH_SIDES;
  ctx.emit({ type: 'msg', key: both ? 'legs.better_both' : 'timeout.legs_better' });
  setItimeout(ctx.state, h, P.WOUNDED_LEGS, 0);
  delete (nhData(ctx) as unknown as { legSides?: number }).legSides;
  encumberMsg(ctx);
}
