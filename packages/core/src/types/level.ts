import type { DefId, Json, LevelId, Pos } from './common';

/** Room interior bounds, inclusive. ref: include/mkroom.h struct mkroom */
export interface Room {
  lx: number;
  ly: number;
  hx: number;
  hy: number;
  lit: boolean;
  /**
   * Special room kind, a def id such as 'nh:temple' or 'nh:tool_shop' (ref: mkroom.h rtype);
   * absent = an ordinary room. Core does not check the id; the mod that owns it gives it meaning.
   */
  type?: DefId;
  /**
   * Index in `Level.rooms` of the enclosing room, for a subroom (ref: mkroom.h sbrooms[]).
   * Subrooms come after their parent. Code that wants the top-level rooms (NetHack's
   * `svr.rooms[]`) filters `parent === undefined`.
   */
  parent?: number;
  /** false = a typed room left empty (ref: sp_lev.c `filled`, fill_special_room()). */
  filled?: boolean;
  /**
   * For a room built from a `RoomDef`: its indexes, `LevelDef.rooms[a].rooms[b]...` = [a, b, ...],
   * in the LevelDef named by `Level.def` (see `levelDefRoom`).
   */
  defPath?: number[];
}

/** A trap on a level cell. ref: include/trap.h struct trap */
export interface Trap {
  /** TrapDef id. */
  def: DefId;
  x: number;
  y: number;
  /** The hero knows it is there (tseen); only seen traps are shown and remembered. */
  seen: boolean;
  /** It has gone off at least once (once), e.g. a falling rock trap that ran out. */
  once?: boolean;
  /** Per-trap data owned by the trap's mod. */
  data?: Json;
}

/** A level by dungeon and position in it (ref: include/dungeon.h d_level). */
export interface LevelRef {
  /** DungeonDef id. */
  dungeon: DefId;
  /** 1 = the dungeon's top level. */
  dlevel: number;
}

export interface Level {
  id: LevelId;
  /** Absolute depth, shown as Dlvl (ref: src/dungeon.c depth()). */
  depth: number;
  /** The DungeonDef this level belongs to. */
  dungeon: DefId;
  /** Level number inside its dungeon, 1 = top. */
  dlevel: number;
  width: number;
  height: number;
  /** Terrain defs used on this level; `cells` index into it. */
  palette: DefId[];
  /** Row-major, `i = y * width + x`. */
  cells: number[];
  lit: (0 | 1)[];
  rooms: Room[];
  up: Pos | null;
  down: Pos | null;
  /**
   * Stairs into another dungeon (ref: include/stairs.h stairway with tolev in another dnum):
   * down into a branch from its parent, or up from a branch dungeon's top level to its parent.
   */
  branch: { pos: Pos; to: LevelRef; dir: 'up' | 'down' } | null;
  /** The LevelDef it was built from; absent for an ordinary level. */
  def?: DefId;
  /** A town level (ref: sp_lev.c level flag "town", level.flags.has_town); see `inTown`. */
  town?: true;
  /**
   * Altars that are shrines, in placement order (ref: rm.h AM_SHRINE in `altarmask`; sp_lev.c
   * create_altar()). Kept on the level, not on a priest, because a shrine outlives its priest.
   * Absent when there are none.
   */
  shrines?: Pos[];
  /** Sorted by cell index; only on plain floor. Change through `ctx.placeTrap` / `removeTrap`. */
  traps: Trap[];
}
