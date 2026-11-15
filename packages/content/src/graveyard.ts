// The graveyard flag of a level: a level with a morgue (made by level generation or a special
// level's region) and the Castle; undead dying there seldom leave a corpse. A leaf over the state.
// ref: src/mklev.c mklev() (`if (has_morgue) graveyard = 1`), src/sp_lev.c lspo_region() and
// src/mkroom.c fill_zoo() (has_morgue), src/mkmaze.c fixup_special() (Is_stronghold);
// src/mon.c LEVEL_SPECIFIC_NOCORPSE
//
// `modData.nh.graveyard` holds the ids of the graveyard levels (sorted); it is written only once a
// level gets the flag, which it never loses.
import type { Ctx, GameState, Json, MonsterDef } from '@nh/core';

const nhData = (state: Readonly<GameState>): Record<string, Json> | undefined =>
  state.modData['nh'] as Record<string, Json> | undefined;

/** C's `level.flags.graveyard` of the level `levelId`. */
export function isGraveyard(state: Readonly<GameState>, levelId: string): boolean {
  const list = nhData(state)?.['graveyard'];
  return Array.isArray(list) && list.includes(levelId);
}

/** Sets the level's graveyard flag. */
export function setGraveyard(ctx: Pick<Ctx, 'state'>, levelId: string): void {
  if (isGraveyard(ctx.state, levelId)) return;
  let nh = nhData(ctx.state);
  if (!nh) {
    nh = {};
    ctx.state.modData['nh'] = nh;
  }
  const list = Array.isArray(nh['graveyard']) ? (nh['graveyard'] as string[]) : [];
  nh['graveyard'] = [...list, levelId].sort();
}

/**
 * LEVEL_SPECIFIC_NOCORPSE(): an undead monster dying on a graveyard level leaves nothing 2 times in
 * 3 (`rn2(3)`, drawn only there). The Rogue level and `deathdrops` are not ported.
 * ref: src/mon.c LEVEL_SPECIFIC_NOCORPSE
 */
export function levelSpecificNocorpse(
  ctx: Pick<Ctx, 'state' | 'rng'>,
  def: MonsterDef,
  levelId: string,
): boolean {
  return isGraveyard(ctx.state, levelId) && def.flags.includes('undead') && ctx.rng.rn2(3) !== 0;
}
