// Level flags of the special levels, kept as a content table keyed by LevelDef id (a level with no
// LevelDef has none). Nothing is saved: the flags follow from `Level.def`.
// ref: dat/soko*.lua des.level_flags() ("noteleport", "hardfloor", "mazelevel", "solidify") and
// des.non_diggable(selection.area(...)); src/sp_lev.c lspo_level_flags()
import { dungeonLayout, type Ctx, type DefId, type GameState, type Level } from '@nh/core';

/** A rectangle of map-relative cells, corners included (des.non_diggable(selection.area())). */
export interface FlagRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * ref: level.flags.noteleport, hardfloor, is_maze_lev; W_NONDIGGABLE walls (`'all'`: every wall
 * and, with `solidify`, the stone around the map block).
 */
export interface LevelFlags {
  noteleport?: true;
  hardfloor?: true;
  maze?: true;
  nondiggable?: 'all' | readonly FlagRect[];
}

/** The Sokoban levels: their non_diggable areas cover the whole map, and `solidify` the rest. */
const SOKO: LevelFlags = { noteleport: true, maze: true, nondiggable: 'all' };
/** soko4 (the entry level) also has a hard floor. ref: dat/soko4-1.lua, soko4-2.lua */
const SOKO_ENTRY: LevelFlags = { ...SOKO, hardfloor: true };

/** The flags of each special level that has any. */
export const LEVEL_FLAGS: Readonly<Record<DefId, LevelFlags>> = {
  'nh:soko1-1': SOKO,
  'nh:soko1-2': SOKO,
  'nh:soko2-1': SOKO,
  'nh:soko2-2': SOKO,
  'nh:soko3-1': SOKO,
  'nh:soko3-2': SOKO,
  'nh:soko4-1': SOKO_ENTRY,
  'nh:soko4-2': SOKO_ENTRY,
};

const NONE: LevelFlags = {};

/** The level's flags (none for an ordinary level). */
export function levelFlags(_ctx: Pick<Ctx, 'defs'>, level: Readonly<Level>): LevelFlags {
  return (level.def !== undefined ? LEVEL_FLAGS[level.def] : undefined) ?? NONE;
}

/**
 * The bottom of a dungeon without one for holes, trap doors and level teleports. NetHack's
 * Dungeons of Doom has `rn1(5, 25)` levels (dat/dungeon.lua base 25, range 5) with the Castle at
 * the bottom; this port's main dungeon is endless and uses the smallest of those, 25 (see
 * DEVIATIONS.md). Stairs still lead deeper.
 */
export const DUNGEON_BOTTOM = 25;

/**
 * The last level holes lead to in `level`'s dungeon: its last level, or for an endless dungeon
 * DUNGEON_BOTTOM (one below `level` once past it). ref: src/trap.c dng_bottom()
 */
export function dungeonBottom(state: Readonly<GameState>, level: Readonly<Level>): number {
  const n = dungeonLayout(state, level.dungeon).levels;
  return n ?? Math.max(DUNGEON_BOTTOM, level.dlevel + 1);
}
