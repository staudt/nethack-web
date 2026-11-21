import { describe, expect, test } from 'vitest';
import type { GameState } from '../src/types/state';
import type { Entity } from '../src/types/entity';
import {
  DIRS,
  DIR_LIST,
  cellIndex,
  inBounds,
  sortedEntities,
  sortedIds,
  withIdCache,
} from '../src/util';

const ent = (id: number): Entity => ({ id, def: 't:x', c: {} });

describe('util', () => {
  test('sortedIds sorts numerically', () => {
    const state = { entities: { '2': {}, '10': {}, '1': {} } } as unknown as GameState;
    expect(sortedIds(state)).toEqual([1, 2, 10]);
  });

  test('sortedIds and sortedEntities follow the table inside a cache scope', () => {
    const state = {
      nextEntityId: 4,
      entities: { '3': ent(3), '1': ent(1), '2': ent(2) },
    } as unknown as GameState;
    withIdCache(() => {
      expect(sortedIds(state)).toEqual([1, 2, 3]);
      // callers get copies: changing one leaves the cache alone
      sortedIds(state).push(99);
      sortedEntities(state).pop();
      expect(sortedEntities(state).map((e) => e.id)).toEqual([1, 2, 3]);
      // removed by hand: dropped
      delete state.entities['2'];
      expect(sortedIds(state)).toEqual([1, 3]);
      // replaced: the new object
      const three = ent(3);
      state.entities['3'] = three;
      expect(sortedEntities(state)[1]).toBe(three);
      // added under a fresh id
      state.entities['4'] = ent(4);
      state.nextEntityId = 5;
      expect(sortedIds(state)).toEqual([1, 3, 4]);
      // nested scopes share the cache
      expect(withIdCache(() => sortedIds(state))).toEqual([1, 3, 4]);
    });
    // outside a scope nothing is cached: an id added by hand without a fresh id is listed
    state.entities['0'] = ent(0);
    expect(sortedIds(state)).toEqual([0, 1, 3, 4]);
    expect(sortedEntities(state).map((e) => e.id)).toEqual([0, 1, 3, 4]);
    // a new scope starts afresh
    withIdCache(() => {
      expect(sortedIds(state)).toEqual([0, 1, 3, 4]);
    });
  });

  test('DIRS / DIR_LIST', () => {
    expect(DIR_LIST).toEqual(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']);
    expect(DIRS.n).toEqual({ x: 0, y: -1 });
    expect(DIRS.e).toEqual({ x: 1, y: 0 });
    expect(DIRS.se).toEqual({ x: 1, y: 1 });
    expect(DIRS.sw).toEqual({ x: -1, y: 1 });
    expect(DIRS.w).toEqual({ x: -1, y: 0 });
    expect(DIRS.nw).toEqual({ x: -1, y: -1 });
    expect(DIRS.ne).toEqual({ x: 1, y: -1 });
    expect(DIRS.s).toEqual({ x: 0, y: 1 });
  });

  test('cellIndex / inBounds', () => {
    const lv = { width: 80, height: 21 };
    expect(cellIndex(lv, 0, 0)).toBe(0);
    expect(cellIndex(lv, 3, 2)).toBe(163);
    expect(inBounds(lv, 0, 0)).toBe(true);
    expect(inBounds(lv, 79, 20)).toBe(true);
    expect(inBounds(lv, -1, 0)).toBe(false);
    expect(inBounds(lv, 0, -1)).toBe(false);
    expect(inBounds(lv, 80, 0)).toBe(false);
    expect(inBounds(lv, 0, 21)).toBe(false);
  });
});
