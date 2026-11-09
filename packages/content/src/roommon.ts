// The monsters of special rooms: a leaf above generation.ts, so zoo.ts and the throne code share it.
// ref: src/mkroom.c courtmon(), squadmon(), antholemon()
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

/** ref: src/mkroom.c squadprob[] */
const SQUADPROB: readonly { pm: DefId; prob: number }[] = [
  { pm: 'nh:soldier', prob: 80 },
  { pm: 'nh:sergeant', prob: 15 },
  { pm: 'nh:lieutenant', prob: 4 },
  { pm: 'nh:captain', prob: 1 },
];

/**
 * A barracks' soldier for a level of difficulty `depth`: by `rnd(80 + depth)` over squadprob[]
 * (soldier 80, sergeant 15, lieutenant 4, captain 1), and past the table's 100 a uniform pick of
 * the four. null: that kind is genocided (makemon() then makes a random monster).
 * ref: src/mkroom.c squadmon()
 */
export function squadmon(
  ctx: Pick<Ctx, 'state' | 'rng' | 'defs'>,
  depth: number,
): MonsterDef | null {
  const selProb = ctx.rng.rnd(80 + depth);
  let cpro = 0;
  let mndx: DefId | undefined;
  for (const s of SQUADPROB) {
    cpro += s.prob;
    if (cpro > selProb) {
      mndx = s.pm;
      break;
    }
  }
  mndx ??= SQUADPROB[ctx.rng.rn2(SQUADPROB.length)]?.pm ?? 'nh:soldier'; // ROLL_FROM(squadprob)
  return isGenocided(ctx.state, mndx) || !ctx.defs.isMonster(mndx) ? null : ctx.defs.monster(mndx);
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
