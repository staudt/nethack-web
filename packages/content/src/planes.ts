// The Elemental Planes: the endgame dungeon above DL1, entered only with the Amulet (m23b). Until
// m23b builds them, its six special levels are one stand-in: lit open floor with no stairs (C's
// planes have none: their Lua files place no stairs, and the portals between them are m23b's).
// The dungeon cannot be reached yet (DL1's up stairs leave the dungeon), so the stand-in is seen
// only in wizard mode. ref: dat/dungeon.lua "The Elemental Planes"
import type { DefId, LevelDef } from '@nh/core';
import type { SpLevFixup } from './sp_lev';
import { T, setTerrain } from './terrain';

/** The Planes' stand-in level (m23 step 2). */
export const PLANE_STANDIN: LevelDef = {
  id: 'nh:plane-standin',
  init: { style: 'solidfill', fg: 'nh:floor', lit: true },
};

/**
 * Lifts every stair core made (up, down and the branch back to DL1 on Earth): the Planes have
 * none. The cells go back to floor. (Fort Ludios's stairs are lifted the same way: knox.ts.)
 */
const PLANE_STANDIN_FIXUP: SpLevFixup = {
  before(_ctx, level) {
    for (const p of [level.up, level.down, level.branch?.pos])
      if (p) setTerrain(level, p.x, p.y, T.floor);
    level.up = null;
    level.down = null;
    level.branch = null;
  },
};

/** The stand-in's fixup, by LevelDef id. */
export const PLANE_FIXUPS: Readonly<Record<DefId, SpLevFixup>> = {
  [PLANE_STANDIN.id]: PLANE_STANDIN_FIXUP,
};
