// Fort Ludios: the one level of its branch, reached by a magic portal hidden in a vault.
// ref: dat/knox.lua; src/dungeon.c fixup_level_locations() (the floating knox entrance)
//
// m21 step 1: a stand-in until knox.lua is ported (step 4): a lit floor and nothing else. The
// layout rolls Ludios's branch on DL18-21 (dungeon.lua) for the draws and the depth only: as C
// marks the branch's main-dungeon end bogus until a vault's portal re-inserts it, the branch has
// stairs at neither end, and the fixup lifts the up stairs core makes on this end (knox.lua's
// levregion "branch" spot; the portal back goes there in step 5).
import type { Level, LevelDef } from '@nh/core';
import { KNOX } from './levelflags';
import type { SpLevFixup } from './sp_lev';
import { T, setTerrain } from './terrain';

/** Fort Ludios's stand-in. Its branch stairs go on a placeholder spot (no draw). */
export const KNOX_LEVEL: LevelDef = {
  id: KNOX,
  init: { style: 'solidfill', fg: 'nh:floor', lit: true },
  stairs: { branch: { x: 0, y: 0, coords: 'level' } },
};

/** Lifts the branch stairs back to floor: Ludios has no stairs back to the main dungeon. */
function liftBranch(level: Level): void {
  const b = level.branch;
  if (!b) return;
  setTerrain(level, b.pos.x, b.pos.y, T.floor);
  level.branch = null;
}

export const KNOX_FIXUP: SpLevFixup = {
  before(_ctx, level) {
    liftBranch(level);
  },
};
