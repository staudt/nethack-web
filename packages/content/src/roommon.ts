// The monsters of special rooms: a leaf above generation.ts, so zoo.ts and the throne code share it.
// ref: src/mkroom.c courtmon(), antholemon()
import type { Ctx, DefId, GameState, MonsterDef, Registry } from '@nh/core';
import { mkclass } from './generation';
import { isGenocided } from './vanquished';

/**
 * A throne room's courtier for a level of difficulty `depth`: by `rn2(60) + rn2(3 * depth)`, a
 * dragon, giant, troll, centaur, orc, bugbear, hobgoblin, gnome or kobold. null: no monster of
 * that class could be made (makemon() then makes a random one). ref: src/mkroom.c courtmon()
 */
export function courtmon(
  ctx: Pick<Ctx, 'state' | 'rng' | 'defs'>,
  depth: number,
): MonsterDef | null {
  const i = ctx.rng.rn2(60) + ctx.rng.rn2(3 * depth);
  if (i > 100) return mkclass(ctx, 'D', depth);
  if (i > 95) return mkclass(ctx, 'H', depth);
  if (i > 85) return mkclass(ctx, 'T', depth);
  if (i > 75) return mkclass(ctx, 'C', depth);
  if (i > 60) return mkclass(ctx, 'o', depth);
  if (i > 45) return ctx.defs.monster('nh:bugbear');
  if (i > 30) return ctx.defs.monster('nh:hobgoblin');
  if (i > 15) return mkclass(ctx, 'G', depth);
  return mkclass(ctx, 'k', depth);
}

const ANTS: readonly [DefId, DefId, DefId] = ['nh:soldier_ant', 'nh:fire_ant', 'nh:giant_ant'];

/**
 * The ant of an anthole on a level of difficulty `depth`: the same kind within a level, another
 * between levels (`ubirthday % 3 + depth`; `state.seed` stands in for the birthday), the next
 * kind when that one is genocided; null when all three are. Draws no random numbers.
 * ref: src/mkroom.c antholemon()
 */
export function antholemon(
  state: Readonly<GameState>,
  defs: Registry,
  depth: number,
): MonsterDef | null {
  const indx = (Math.abs(Math.trunc(state.seed)) % 3) + depth;
  let trycnt = 0;
  let mtyp: DefId = ANTS[indx % 3] ?? ANTS[0];
  // try again if chosen type has been genocided
  while (++trycnt < 3 && isGenocided(state, mtyp)) mtyp = ANTS[(indx + trycnt) % 3] ?? ANTS[0];
  return isGenocided(state, mtyp) ? null : defs.monster(mtyp);
}
