// Sokoban's rules, keyed on the live level flag (C's `svl.level.flags.sokoban_rules`). A leaf
// module (core and luck only), so reading, zapping, pushing and traps can all import it.
import type { Ctx, Level } from '@nh/core';
import { changeLuck } from './luck';

/**
 * The level still has Sokoban's rules (`Level.sokoban`, set from `LevelDef.flags.sokoban`).
 * ref: include/rm.h `Sokoban`
 */
export const isSokoban = (level: Readonly<Level>): boolean => level.sokoban === true;

/**
 * Cheating in Sokoban (squeezing past or breaking a boulder, reading earth) costs a point of
 * Luck; anywhere else it is nothing. No conduct is kept (`u.uconduct.sokocheat`).
 * ref: src/trap.c sokoban_guilt()
 */
export function sokobanGuilt(ctx: Pick<Ctx, 'state'>): void {
  const level = ctx.state.levels[ctx.state.currentLevel];
  if (level && isSokoban(level)) changeLuck(ctx, -1);
}
