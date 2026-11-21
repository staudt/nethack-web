import type { Dir } from './types/action';
import type { EntityId, Pos } from './types/common';
import type { Entity } from './types/entity';
import type { GameState } from './types/state';

/**
 * A derived cache of {@link sortedIds} and {@link sortedEntities}, live only inside
 * {@link withIdCache} (an engine step, a new game, a query's offers): the helpers that scan the
 * entities (the objects at a square, a monster's inventory, the monsters on a level) list them
 * thousands of times a turn on a crowded level, and listing the keys of a large table each time
 * cost about a third of a turn. Never part of the state: an entry is keyed on the `entities`
 * table, made in one scope and kept only while `nextEntityId` is unchanged (every entity is added
 * under a fresh id); each use checks every cached entry against the table, dropping the removed
 * ones and taking a replaced entity's new object. Outside a scope (tests editing the table by
 * hand, the UI's queries) nothing is cached.
 */
interface IdCache {
  scope: number;
  next: number;
  ids: EntityId[];
  ents: Entity[];
}
const idCache = new WeakMap<object, IdCache>();
let cacheDepth = 0;
let cacheScope = 0;

/** Runs `fn` with the entity list cached (see {@link IdCache}); scopes may nest. */
export function withIdCache<T>(fn: () => T): T {
  if (cacheDepth++ === 0) cacheScope++;
  try {
    return fn();
  } finally {
    cacheDepth--;
  }
}

/** The ids of the entities table, ascending (integer keys already come in that order). */
function listIds(table: GameState['entities']): EntityId[] {
  const ids = Object.keys(table).map(Number);
  for (let i = 1; i < ids.length; i++) {
    if ((ids[i - 1] ?? 0) > (ids[i] ?? 0)) {
      ids.sort((a, b) => a - b);
      break;
    }
  }
  return ids;
}

/** The checked cache entry for `state` (see {@link IdCache}), made if missing or stale. */
function entityCache(state: Readonly<GameState>): IdCache {
  const table = state.entities;
  const c = idCache.get(table);
  if (c && c.scope === cacheScope && c.next === state.nextEntityId) {
    const { ids, ents } = c;
    for (let i = 0; i < ids.length; i++) {
      if (table[ids[i] ?? 0] === ents[i]) continue;
      // something was removed or replaced: keep what is still there, as it is now
      const keep: EntityId[] = [];
      const now: Entity[] = [];
      for (const id of ids) {
        const e = table[id];
        if (e === undefined) continue;
        keep.push(id);
        now.push(e);
      }
      c.ids = keep;
      c.ents = now;
      break;
    }
    return c;
  }
  const ids = listIds(table);
  const ents = ids.map((id) => table[id]).filter((e): e is Entity => e !== undefined);
  const made: IdCache = { scope: cacheScope, next: state.nextEntityId, ids, ents };
  idCache.set(table, made);
  return made;
}

/** The ids of every entity, ascending. */
export function sortedIds(state: Readonly<GameState>): EntityId[] {
  return cacheDepth > 0 ? entityCache(state).ids.slice() : listIds(state.entities);
}

/**
 * Every entity, in ascending id order: `sortedIds(state)` mapped to the entities, for read-only
 * scans (an entity removed while the list is walked is still in it).
 */
export function sortedEntities(state: Readonly<GameState>): Entity[] {
  if (cacheDepth > 0) return entityCache(state).ents.slice();
  const table = state.entities;
  return listIds(table)
    .map((id) => table[id])
    .filter((e): e is Entity => e !== undefined);
}

export function cellIndex(level: { width: number }, x: number, y: number): number {
  return y * level.width + x;
}

export function inBounds(level: { width: number; height: number }, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < level.width && y < level.height;
}

export const DIRS: Record<Dir, Pos> = {
  n: { x: 0, y: -1 },
  ne: { x: 1, y: -1 },
  e: { x: 1, y: 0 },
  se: { x: 1, y: 1 },
  s: { x: 0, y: 1 },
  sw: { x: -1, y: 1 },
  w: { x: -1, y: 0 },
  nw: { x: -1, y: -1 },
};

export const DIR_LIST: readonly Dir[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
