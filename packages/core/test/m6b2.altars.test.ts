// Milestone 6b2 step 1: shrine altars recorded on the level (both feature paths) and inRooms().
import { describe, expect, test } from 'vitest';
import {
  buildLevel,
  VANILLA_TERRAIN,
  type GenOptions,
  type LevelTerrain,
} from '../src/levelgen/index';
import { createRng, seedRng } from '../src/rng';
import { inRooms, insideRoom } from '../src/rooms';
import type { Level, Room } from '../src/types/level';
import type { LevelDef } from '../src/types/mod';

type Key = keyof LevelTerrain;
const KEY_OF = new Map(Object.entries(VANILLA_TERRAIN).map(([k, id]) => [id, k as Key]));
const opts = (): GenOptions => ({
  id: 'x',
  depth: 5,
  width: 80,
  height: 21,
  terrain: VANILLA_TERRAIN,
});
const build = (def: LevelDef, seed = 1): Level => buildLevel(createRng(seedRng(seed)), opts(), def);
const keyAt = (l: Level, x: number, y: number): Key | undefined =>
  KEY_OF.get(l.palette[l.cells[y * l.width + x] ?? -1] ?? 'nh:none');
const DOORS: Key[] = ['doorway', 'door_open_v', 'door_open_h', 'door_closed', 'door_locked'];

const FIELD: LevelDef = {
  id: 't:field',
  init: { style: 'solidfill', fg: 'nh:floor', lit: true },
  features: [
    { kind: 'altar', x: 10, y: 5, align: 'lawful', shrine: true },
    { kind: 'altar', x: 20, y: 5, align: 'chaotic' },
    { kind: 'altar', x: 30, y: 5, shrine: false },
    { kind: 'fountain', x: 40, y: 5 },
  ],
};

const TOWN: LevelDef = {
  id: 't:town',
  init: { style: 'solidfill', fg: 'nh:stone', lit: false },
  rooms: [
    {
      x: 3,
      y: 3,
      xalign: 'center',
      yalign: 'center',
      w: 20,
      h: 11,
      lit: true,
      rooms: [
        {
          type: 'nh:temple',
          lit: true,
          x: 6,
          y: 3,
          w: 5,
          h: 4,
          doors: [{ state: 'nodoor', wall: 'south', pos: 2 }],
          features: [{ kind: 'altar', x: 2, y: 1, shrine: true }],
        },
      ],
    },
  ],
};

describe('Level.shrines', () => {
  test('a top-level shrine altar is recorded; other altars and features are not', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const l = build(FIELD, seed);
      expect(keyAt(l, 10, 5)).toBe('altar_lawful');
      expect(l.shrines).toEqual([{ x: 10, y: 5 }]);
    }
  });

  test('a shrine altar in a room is recorded at its room-relative spot', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const l = build(TOWN, seed);
      const temple = l.rooms.find((r) => r.type === 'nh:temple') as Room;
      const at = { x: temple.lx + 2, y: temple.ly + 1 };
      expect(keyAt(l, at.x, at.y)).toMatch(/^altar_(lawful|neutral|chaotic)$/);
      expect(l.shrines).toEqual([at]);
    }
  });

  test('a level without shrine altars has no shrines field', () => {
    const l = build({ ...FIELD, features: [{ kind: 'altar', x: 3, y: 3 }] });
    expect('shrines' in l).toBe(false);
  });
});

describe('inRooms', () => {
  test("a subroom's floor is its own; its walls and door count for it and its parent", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const l = build(TOWN, seed);
      const ti = l.rooms.findIndex((r) => r.type === 'nh:temple');
      const temple = l.rooms[ti] as Room;
      const pi = temple.parent as number;
      const parent = l.rooms[pi] as Room;
      expect(inRooms(l, temple.lx, temple.ly)).toEqual([ti]);
      // the temple's door on its south wall
      const y = temple.hy + 1;
      let door = -1;
      for (let x = temple.lx; x <= temple.hx; x++) if (DOORS.includes(keyAt(l, x, y)!)) door = x;
      expect(door).toBeGreaterThanOrEqual(0);
      expect(inRooms(l, door, y)).toEqual([ti, pi]);
      expect(inRooms(l, temple.lx - 1, temple.ly - 1)).toEqual([ti, pi]); // a corner
      // parent floor away from the temple, the parent's wall, and outside
      let free: { x: number; y: number } | null = null;
      for (let x = parent.lx; x <= parent.hx && !free; x++)
        for (let yy = parent.ly; yy <= parent.hy && !free; yy++)
          if (!l.rooms.some((r) => r.parent === pi && insideRoom(r, x, yy))) free = { x, y: yy };
      expect(free).not.toBeNull();
      expect(inRooms(l, free!.x, free!.y)).toEqual([pi]);
      expect(inRooms(l, parent.lx - 1, parent.ly)).toEqual([pi]);
      expect(inRooms(l, parent.lx - 2, parent.ly)).toEqual([]);
    }
  });
});
