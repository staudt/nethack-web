import type { Level, Trap } from './types/level';
import type { Registry } from './types/mod';
import { cellIndex, inBounds } from './util';

/**
 * Plain floor: passable terrain that is not a door, doorway, staircase or hidden terrain.
 * Only such cells hold traps. ref: src/mklev.c mktrap() (traps go on ROOM or CORR squares)
 */
export function isPlainFloor(registry: Registry, level: Level, x: number, y: number): boolean {
  if (!inBounds(level, x, y)) return false;
  const id = level.palette[level.cells[cellIndex(level, x, y)] ?? -1];
  if (id === undefined) return false;
  const t = registry.terrain(id);
  return t.passable && t.door === undefined && t.stairs === undefined && t.looksLike === undefined;
}

/** The trap at (x, y) of `level`, seen or not, or undefined. ref: src/trap.c t_at() */
export function trapAt(level: Level, x: number, y: number): Trap | undefined {
  return level.traps.find((t) => t.x === x && t.y === y);
}

/** Adds `t`, replacing any trap on its cell, keeping `level.traps` sorted by cell index. */
export function placeTrapOn(registry: Registry, level: Level, t: Trap): void {
  if (!registry.isTrap(t.def)) throw new Error(`Unknown trap '${t.def}'`);
  if (!isPlainFloor(registry, level, t.x, t.y))
    throw new Error(`Cannot place a trap at (${t.x}, ${t.y}) of '${level.id}': not plain floor`);
  const i = cellIndex(level, t.x, t.y);
  const traps = level.traps.filter((o) => o.x !== t.x || o.y !== t.y);
  const at = traps.findIndex((o) => cellIndex(level, o.x, o.y) > i);
  traps.splice(at === -1 ? traps.length : at, 0, JSON.parse(JSON.stringify(t)) as Trap);
  level.traps = traps;
}

/** Removes the trap at (x, y) of `level`, if any. */
export function removeTrapOn(level: Level, x: number, y: number): void {
  level.traps = level.traps.filter((t) => t.x !== x || t.y !== y);
}
