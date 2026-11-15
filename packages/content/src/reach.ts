// Whether the hero can reach the floor. ref: src/engrave.c can_reach_floor(); src/trap.c
// uteetering_at_seen_pit(), uescaped_shaft()
//
// A leaf (state, the swallow and hold records, the trap state, the form): the engraving code
// (engr.ts u_wipe_engr(), engrread.ts), levitation.ts (which re-exports it) and every caller that
// only asks "can she touch the floor here" import it.
// Not ported: steeds (no riding), the hero hiding on the ceiling (no u.uundetected), the air and
// water levels (Levitation always lifts her).
import { getPlayer, trapAt, type Ctx, type Trap } from '@nh/core';
import { engulferOf, ustuck } from './engulfstate';
import { MZ_HUGE, msize, sticks } from './mondata';
import { flying, isHole, isPit, levitating, utrap } from './trapstate';
import { heroForm } from './upoly';

/**
 * She escaped a seen pit and stands on its edge. ref: src/trap.c uteetering_at_seen_pit()
 * (the trap is at her feet: callers pass t_at(u.ux, u.uy))
 */
export const uteeteringAtSeenPit = (ctx: Pick<Ctx, 'state'>, t: Trap | null): boolean =>
  !!t && isPit(t.def) && t.seen && utrap(ctx)?.type !== 'pit';

/** She did not fall through a seen hole or trap door. ref: src/trap.c uescaped_shaft() */
export const uescapedShaft = (t: Trap | null): boolean => !!t && isHole(t.def) && t.seen;

/**
 * Whether the hero can reach something at ground level: not while swallowed, held by a hugger
 * (unless she is the sticky one), or levitating; flying or a huge form always reaches; with
 * `checkPit`, not from the edge of a seen pit or over a seen hole.
 * ref: src/engrave.c can_reach_floor()
 */
export function canReachFloor(ctx: Pick<Ctx, 'state' | 'defs'>, checkPit = false): boolean {
  if (engulferOf(ctx.state) !== null) return false;
  const form = heroForm(ctx);
  const stuck = ustuck(ctx);
  const holder = stuck === null ? undefined : ctx.state.entities[String(stuck)];
  // arms pinned rather than lifted above the floor
  if (
    holder &&
    !(form && sticks(form)) &&
    ctx.defs.monster(holder.def).attacks.some((a) => a.at === 'hug')
  )
    return false;
  if (levitating(ctx)) return false;
  if (flying(ctx) || (form !== null && msize(form) >= MZ_HUGE)) return true;
  if (checkPit) {
    const pos = getPlayer(ctx.state).c.pos;
    const level = pos ? ctx.state.levels[pos.level] : undefined;
    const t = level && pos ? (trapAt(level, pos.x, pos.y) ?? null) : null;
    if (uteeteringAtSeenPit(ctx, t) || uescapedShaft(t)) return false;
  }
  return true;
}
