// Milestone 6b1 step 1: typed rooms and subrooms, town levels (inTown) and LevelContent spots.
import { describe, expect, test } from 'vitest';
import { ModLoadError, loadMods } from '../src/registry';
import { inTown } from '../src/rooms';
import type { Level, Room } from '../src/types/level';
import type { LevelDef, Mod } from '../src/types/mod';
import { terrainMod } from './helpers/fakeMods';

/** A blank 30x10 level with `rooms`. */
const level = (rooms: Room[], town = true): Level => ({
  id: 'dlvl1',
  depth: 1,
  dungeon: 'core:dungeon',
  dlevel: 1,
  width: 30,
  height: 10,
  palette: ['nh:stone'],
  cells: new Array<number>(300).fill(0),
  lit: new Array<0 | 1>(300).fill(0),
  rooms,
  up: null,
  down: null,
  branch: null,
  traps: [],
  ...(town ? { town: true as const } : {}),
});
const room = (lx: number, ly: number, hx: number, hy: number, more: Partial<Room> = {}): Room => ({
  lx,
  ly,
  hx,
  hy,
  lit: true,
  ...more,
});

describe('inTown', () => {
  // the town: rooms[0] (interior 2..20 x 2..7) with a temple subroom; rooms[2] is out of town
  const town = [
    room(2, 2, 20, 7),
    room(4, 3, 6, 5, { type: 'nh:temple', parent: 0 }),
    room(24, 2, 27, 5),
  ];

  test('is the room with subrooms, walls included', () => {
    const l = level(town);
    const at = (x: number, y: number) => inTown(l, x, y);
    expect([at(10, 4), at(1, 1), at(21, 8), at(5, 4)]).toEqual([true, true, true, true]);
    expect([at(0, 0), at(22, 4), at(25, 3), at(10, 9)]).toEqual([false, false, false, false]);
  });

  test('is the whole level when no room has subrooms', () => {
    const l = level([room(2, 2, 5, 5), room(24, 2, 27, 5)]);
    expect([inTown(l, 0, 0), inTown(l, 25, 3), inTown(l, 29, 9)]).toEqual([true, true, true]);
  });

  test('is nowhere on a level that is not a town', () => {
    const l = level(town, false);
    expect([inTown(l, 10, 4), inTown(l, 0, 0)]).toEqual([false, false]);
  });
});

describe('LevelContent spots and peaceful', () => {
  const issues = (contents: unknown[]): string[] => {
    const lv = { id: 'lv:spots', init: { style: 'rooms' }, contents } as unknown as LevelDef;
    const mod: Mod = { id: 'lv', version: '1', register: (api) => api.defineLevel(lv) };
    try {
      loadMods([terrainMod(), mod]);
      return [];
    } catch (e) {
      if (!(e instanceof ModLoadError)) throw e;
      return e.issues.map((i) => `${i.path}: ${i.reason}`);
    }
  };

  test('valid spots load', () => {
    expect(
      issues([
        { kind: 'object', x: 3, y: 4 },
        { kind: 'trap', x: -1, y: -2 },
        { kind: 'monster', x: 0, y: 0, peaceful: true },
        { kind: 'monster', peaceful: false },
      ]),
    ).toEqual([]);
  });

  test('bad spots and peaceful flags are reported', () => {
    expect(
      issues([
        { kind: 'object', x: 3 },
        { kind: 'object', y: 3 },
        { kind: 'object', x: 1.5, y: '2' },
        { kind: 'monster', peaceful: 'yes' },
        { kind: 'object', peaceful: true },
      ]),
    ).toEqual([
      'contents[0].y: give both x and y, or neither',
      'contents[1].x: give both x and y, or neither',
      'contents[2].x: must be an integer',
      'contents[2].y: must be an integer',
      'contents[3].peaceful: must be a boolean',
      'contents[4].peaceful: only monsters can be peaceful',
    ]);
  });
});
