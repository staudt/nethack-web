import type { DefId, Json, LevelId, Pos } from './common';

/** Room interior bounds, inclusive. ref: include/mkroom.h struct mkroom */
export interface Room {
  lx: number;
  ly: number;
  hx: number;
  hy: number;
  lit: boolean;
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

export interface Level {
  id: LevelId;
  depth: number;
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
  /** Sorted by cell index; only on plain floor. Change through `ctx.placeTrap` / `removeTrap`. */
  traps: Trap[];
}
