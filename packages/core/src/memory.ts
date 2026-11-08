// Monster memory markers: remembered glyphs that are not monsters (the remembered-unseen `I`).
// ref: src/display.c map_invisible(), unmap_invisible(), newsym()
import type { DefId, LevelId, Pos } from './types/common';
import type { Registry } from './types/mod';
import type { GameState } from './types/state';
import { cellIndex, inBounds } from './util';

/**
 * True when a `monsterMemory` entry is a marker: any id that is not a MonsterDef id (vanilla's
 * remembered-unseen `I` is an AppearanceDef). Vision keeps markers on visible cells until a
 * perceived monster replaces them or content clears them.
 */
export function isMarker(registry: Registry, id: DefId): boolean {
  return !registry.isMonster(id);
}

/**
 * Sets (or with null clears) the remembered monster glyph of a cell: content's way to place and
 * remove markers. Throws on an unknown level or a cell out of bounds.
 * ref: src/display.c map_invisible(), unmap_invisible()
 */
export function setMonsterMark(state: GameState, level: LevelId, pos: Pos, id: DefId | null): void {
  const lv = state.levels[level];
  if (!lv) throw new Error(`setMonsterMark: unknown level '${level}'`);
  if (!inBounds(lv, pos.x, pos.y))
    throw new Error(`setMonsterMark: (${pos.x}, ${pos.y}) is out of bounds`);
  const key = String(cellIndex(lv, pos.x, pos.y));
  if (id === null) {
    const mem = state.monsterMemory[level];
    if (mem) delete mem[key];
  } else (state.monsterMemory[level] ??= {})[key] = id;
}
