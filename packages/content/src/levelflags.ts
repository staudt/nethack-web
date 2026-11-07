// Level flags of the special levels, kept as a content table keyed by LevelDef id (a level with no
// LevelDef has none). Nothing is saved: the flags follow from `Level.def`.
// ref: dat/soko*.lua, dat/minend-*.lua, dat/minetn-5.lua des.level_flags() ("noteleport",
// "hardfloor", "mazelevel", "solidify") and des.non_diggable(selection.area(...));
// src/sp_lev.c lspo_level_flags(), set_wall_property(); src/mkmap.c mkmap() (cavernous levels);
// src/dungeon.c Can_dig_down(); src/hack.c may_dig()
import {
  dungeonLayout,
  levelDefArea,
  type Ctx,
  type DefId,
  type GameState,
  type Level,
} from '@nh/core';

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

/**
 * The flags of each special level that has any. Minetown's minetn-1 (Orcish Town) and minetn-6
 * say "mazelevel" too, but their mines-style map makes them cavernous instead (mkmap() clears
 * is_maze_lev), as are the Mines' filler levels; see {@link cavernous}.
 */
export const LEVEL_FLAGS: Readonly<Record<DefId, LevelFlags>> = {
  'nh:soko1-1': SOKO,
  'nh:soko1-2': SOKO,
  'nh:soko2-1': SOKO,
  'nh:soko2-2': SOKO,
  'nh:soko3-1': SOKO,
  'nh:soko3-2': SOKO,
  'nh:soko4-1': SOKO_ENTRY,
  'nh:soko4-2': SOKO_ENTRY,
  /** ref: dat/minetn-5.lua (Grotto town is a solidfill map, so it stays a maze level) */
  'nh:minetn-5': { maze: true },
  /** ref: dat/minend-1.lua */
  'nh:minend-1': { maze: true, nondiggable: [{ x1: 0, y1: 0, x2: 74, y2: 17 }] },
  /** ref: dat/minend-2.lua */
  'nh:minend-2': {
    maze: true,
    nondiggable: [
      { x1: 0, y1: 0, x2: 52, y2: 17 },
      { x1: 53, y1: 0, x2: 74, y2: 0 },
      { x1: 53, y1: 17, x2: 74, y2: 17 },
      { x1: 74, y1: 1, x2: 74, y2: 16 },
      { x1: 53, y1: 7, x2: 55, y2: 7 },
      { x1: 53, y1: 14, x2: 61, y2: 14 },
    ],
  },
  /** ref: dat/minend-3.lua (the Catacombs) */
  'nh:minend-3': {
    maze: true,
    nondiggable: [
      { x1: 67, y1: 3, x2: 73, y2: 7 },
      { x1: 0, y1: 12, x2: 2, y2: 16 },
    ],
  },
};

const NONE: LevelFlags = {};

/** The level's flags (none for an ordinary level). */
export function levelFlags(_ctx: Pick<Ctx, 'defs'>, level: Readonly<Level>): LevelFlags {
  return (level.def !== undefined ? LEVEL_FLAGS[level.def] : undefined) ?? NONE;
}

/**
 * A walled, joined mines-style level is cavernous, not mazelike: zapped walls there become
 * corridor rather than doorways. ref: src/mkmap.c mkmap() `if (walled && join)`
 */
export function cavernous(ctx: Pick<Ctx, 'defs'>, level: Readonly<Level>): boolean {
  if (level.def === undefined) return false;
  const init = ctx.defs.level(level.def).init;
  return init.style === 'mines' && init.walled === true && init.joined === true;
}

/**
 * The cell's W_NONDIGGABLE bit: inside one of the level's des.non_diggable() areas (map-relative,
 * placed through the LevelDef's map block), or anywhere on a level whose flags say 'all'. Only
 * stone, walls and trees care (may_dig()).
 */
export function nonDiggable(
  ctx: Pick<Ctx, 'defs'>,
  level: Readonly<Level>,
  x: number,
  y: number,
): boolean {
  const nd = levelFlags(ctx, level).nondiggable;
  if (nd === undefined) return false;
  if (nd === 'all') return true;
  if (level.def === undefined) return false;
  const area = levelDefArea(ctx.defs.level(level.def), level.width, level.height);
  const mx = x - area.x;
  const my = y - area.y;
  return nd.some((r) => mx >= r.x1 && mx <= r.x2 && my >= r.y1 && my <= r.y2);
}

/**
 * Whether a hole can be dug through the level's floor: no hard floor and not the last level of
 * its dungeon (the main dungeon has none). ref: src/dungeon.c Can_dig_down() (no invocation level)
 */
export function canDigDown(ctx: Pick<Ctx, 'defs' | 'state'>, level: Readonly<Level>): boolean {
  if (levelFlags(ctx, level).hardfloor) return false;
  return level.dlevel < (dungeonLayout(ctx.state, level.dungeon).levels ?? Infinity);
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
