// Milestone 6b1 step 3: rooms in a LevelDef (5x5 grid and random rooms, subrooms, room doors,
// random corridors, room-relative features and stairs) and their validation.
import { describe, expect, test } from 'vitest';
import {
  buildLevel,
  levelToAscii,
  VANILLA_TERRAIN,
  type GenOptions,
  type LevelTerrain,
} from '../src/levelgen/index';
import { ModLoadError, loadMods } from '../src/registry';
import { createRng, seedRng } from '../src/rng';
import { insideRoom, roomHas } from '../src/rooms';
import type { Pos } from '../src/types/common';
import type { Level, Room } from '../src/types/level';
import type { LevelDef, Mod, RoomDef } from '../src/types/mod';
import { terrainMod } from './helpers/fakeMods';

type Key = keyof LevelTerrain;
const KEY_OF = new Map(Object.entries(VANILLA_TERRAIN).map(([k, id]) => [id, k as Key]));
const opts = (width = 80, height = 21, depth = 5): GenOptions => ({
  id: 'x',
  depth,
  width,
  height,
  terrain: VANILLA_TERRAIN,
});
const build = (def: LevelDef, seed = 1, o = opts()): Level =>
  buildLevel(createRng(seedRng(seed)), o, def);
const keyAt = (l: Level, x: number, y: number): Key | undefined =>
  KEY_OF.get(l.palette[l.cells[y * l.width + x] ?? -1] ?? 'nh:none');
const STONE = { style: 'solidfill', fg: 'nh:stone', lit: false } as const;
const WALLS: Key[] = [
  'vwall',
  'hwall',
  'tlcorn',
  'trcorn',
  'blcorn',
  'brcorn',
  'crwall',
  'tuwall',
  'tdwall',
  'tlwall',
  'trwall',
];
const DOORS: Key[] = [
  'doorway',
  'door_open_v',
  'door_open_h',
  'door_closed',
  'door_locked',
  'sdoor_v',
  'sdoor_h',
  'sdoor_locked_v',
  'sdoor_locked_h',
];

/** Cells reachable from `from` orthogonally and diagonally through anything but stone and walls. */
function reach(l: Level, from: Pos): Set<number> {
  const seen = new Set<number>([from.y * l.width + from.x]);
  const stack = [from];
  while (stack.length) {
    const p = stack.pop() as Pos;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = p.x + dx;
        const y = p.y + dy;
        if (x < 0 || y < 0 || x >= l.width || y >= l.height) continue;
        const i = y * l.width + x;
        const k = keyAt(l, x, y);
        if (seen.has(i) || k === 'stone' || k === undefined || WALLS.includes(k)) continue;
        // no diagonal moves into or out of doorways
        const here = keyAt(l, p.x, p.y);
        if (dx && dy && ((here && DOORS.includes(here)) || DOORS.includes(k))) continue;
        seen.add(i);
        stack.push({ x, y });
      }
  }
  return seen;
}

/** Shaped like minetn-2: a big centred town room with subrooms, four random rooms, corridors. */
const sub = (x: number, y: number, extra: Partial<RoomDef> = {}): RoomDef => ({
  x,
  y,
  w: 2,
  h: 2,
  doors: [{ state: 'closed', wall: 'south' }],
  ...extra,
});
const TOWN: LevelDef = {
  id: 't:town',
  init: STONE,
  rooms: [
    {
      x: 3,
      y: 3,
      xalign: 'center',
      yalign: 'center',
      w: 31,
      h: 15,
      lit: true,
      features: [
        { kind: 'fountain', x: 17, y: 5 },
        { kind: 'fountain', x: 13, y: 8 },
      ],
      contents: [{ kind: 'monster', peaceful: true, count: 4 }],
      rooms: [
        sub(2, 0, { percent: 75, doors: [{ state: 'closed', wall: 'west' }] }),
        sub(5, 0, { lit: false }),
        sub(8, 0, { doors: [{ state: 'closed', wall: 'east' }] }),
        sub(2, 5, { lit: true, doors: [{ state: 'closed', wall: 'north' }] }),
        sub(8, 5, { doors: [{ state: 'locked', wall: 'north' }] }),
        {
          type: 'nh:shop',
          chance: 90,
          lit: true,
          x: 2,
          y: 10,
          w: 4,
          h: 3,
          doors: [{ state: 'closed', wall: 'west' }],
        },
        {
          type: 'nh:temple',
          lit: true,
          x: 19,
          y: 5,
          w: 4,
          h: 4,
          doors: [{ state: 'closed', wall: 'north' }],
          features: [{ kind: 'altar', x: 2, y: 2, align: 'neutral', shrine: true }],
        },
        {
          type: 'nh:candle_shop',
          lit: true,
          x: 11,
          y: 10,
          w: 4,
          h: 3,
          doors: [{ state: 'random', wall: 'east' }],
        },
      ],
    },
    { stairs: ['up'] },
    { stairs: ['down'], contents: [{ kind: 'trap' }] },
    { contents: [{ kind: 'object' }] },
    {},
  ],
  corridors: 'random',
};

describe('a minetn-2 shaped level', () => {
  const sizes = [opts(), opts(120, 40)];

  test('builds for many seeds at 80x21 and 120x40, every room reachable from the stairs', () => {
    for (const size of sizes)
      for (let seed = 1; seed <= 40; seed++) {
        const l = build(TOWN, seed, size);
        const town = l.rooms[0] as Room;
        expect(town.parent).toBeUndefined();
        expect(town.hx - town.lx + 1).toBe(31);
        expect(town.hy - town.ly + 1).toBe(15);
        if (!l.up || !l.down) throw new Error('no stairs');
        const seen = reach(l, l.up);
        expect(seen.has(l.down.y * l.width + l.down.x)).toBe(true);
        for (const [i, r] of l.rooms.entries()) {
          // some floor cell of each room (outside its subrooms) is reachable
          let ok = false;
          for (let x = r.lx; x <= r.hx && !ok; x++)
            for (let y = r.ly; y <= r.hy && !ok; y++)
              ok = roomHas(l, i, x, y) && seen.has(y * l.width + x);
          if (!ok) throw new Error(`seed ${seed} room ${i} unreachable:\n${levelToAscii(l)}`);
        }
      }
  });

  test('the town is centred on the 5x5 grid, scaled to the level size', () => {
    // create_room(): xabs = (x - 1) * COLNO / 5 + 1 + (COLNO / 5 - w) / 2, NetHack x = ours + 1
    const at = (w: number, h: number): Room => build(TOWN, 3, opts(w, h)).rooms[0] as Room;
    expect(at(80, 21)).toMatchObject({ lx: 25, ly: 4, hx: 55, hy: 18 });
    expect(at(120, 40)).toMatchObject({ lx: 45, ly: 14, hx: 75, hy: 28 });
  });

  test('subrooms lie inside their parent with walls, after it in Level.rooms', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const l = build(TOWN, seed);
      const subs = l.rooms.filter((r) => r.parent !== undefined);
      expect(subs.length).toBeGreaterThanOrEqual(7);
      for (const [i, r] of l.rooms.entries()) {
        if (r.parent === undefined) continue;
        expect(r.parent).toBeLessThan(i);
        const p = l.rooms[r.parent] as Room;
        expect(r.lx).toBeGreaterThanOrEqual(p.lx);
        expect(r.hx).toBeLessThanOrEqual(p.hx);
        expect(r.ly).toBeGreaterThanOrEqual(p.ly);
        expect(r.hy).toBeLessThanOrEqual(p.hy);
        for (let x = r.lx - 1; x <= r.hx + 1; x++)
          for (let y = r.ly - 1; y <= r.hy + 1; y++) {
            const k = keyAt(l, x, y);
            const edge = x < r.lx || x > r.hx || y < r.ly || y > r.hy;
            if (edge) expect([...WALLS, ...DOORS]).toContain(k);
            else expect(['floor', 'altar_neutral']).toContain(k);
          }
      }
    }
  });

  test('room doors go on the wall they name, with their state', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const l = build(TOWN, seed);
      for (const r of l.rooms) {
        if (r.parent === undefined || !r.defPath) continue;
        const rd = TOWN.rooms?.[0]?.rooms?.[r.defPath[1] ?? -1];
        const dd = rd?.doors?.[0];
        if (!dd?.wall) continue;
        const cells: Pos[] = [];
        for (let x = r.lx - 1; x <= r.hx + 1; x++)
          for (let y = r.ly - 1; y <= r.hy + 1; y++)
            if (DOORS.includes(keyAt(l, x, y) as Key)) cells.push({ x, y });
        expect(cells.length).toBe(1);
        const d = cells[0] as Pos;
        const side =
          d.y === r.ly - 1
            ? 'north'
            : d.y === r.hy + 1
              ? 'south'
              : d.x === r.lx - 1
                ? 'west'
                : 'east';
        expect(side).toBe(dd.wall);
        if (dd.state === 'closed') expect(keyAt(l, d.x, d.y)).toBe('door_closed');
        if (dd.state === 'locked') expect(keyAt(l, d.x, d.y)).toBe('door_locked');
      }
    }
  });

  test('room features land at their room-relative spot; stairs in the room that asks', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const l = build(TOWN, seed);
      const town = l.rooms[0] as Room;
      expect(keyAt(l, town.lx + 17, town.ly + 5)).toBe('fountain');
      expect(keyAt(l, town.lx + 13, town.ly + 8)).toBe('fountain');
      const temple = l.rooms.find((r) => r.defPath?.[1] === 6) as Room;
      expect(keyAt(l, temple.lx + 2, temple.ly + 2)).toBe('altar_neutral');
      const upRoom = l.rooms.find((r) => r.defPath?.join() === '1');
      const downRoom = l.rooms.find((r) => r.defPath?.join() === '2');
      if (!l.up || !l.down || !upRoom || !downRoom) throw new Error('missing');
      expect(insideRoom(upRoom, l.up.x, l.up.y)).toBe(true);
      expect(insideRoom(downRoom, l.down.x, l.down.y)).toBe(true);
      expect(keyAt(l, l.up.x, l.up.y)).toBe('stairs_up');
    }
  });

  test('typed rooms keep their type (filled by default); chance and percent are rolled', () => {
    let shops = 0;
    let plain = 0;
    let first = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const l = build(TOWN, seed);
      const temple = l.rooms.find((r) => r.defPath?.join() === '0,6');
      expect(temple).toMatchObject({ type: 'nh:temple', filled: true, lit: true });
      const shop = l.rooms.find((r) => r.defPath?.join() === '0,5');
      if (shop?.type === 'nh:shop') shops++;
      else if (shop) {
        plain++;
        expect(shop.filled).toBeUndefined();
      }
      if (l.rooms.some((r) => r.defPath?.join() === '0,0')) first++;
    }
    expect(shops).toBeGreaterThan(plain); // chance 90
    expect(plain).toBeGreaterThan(0);
    expect(first).toBeGreaterThan(30); // percent 75
    expect(first).toBeLessThan(60);
  });
});

describe('room placement', () => {
  test('a fixed room on the grid with each alignment, at two sizes', () => {
    for (const [w, h] of [
      [80, 21],
      [120, 40],
    ] as const) {
      const colno = w + 1;
      const one = (xalign: 'left' | 'center' | 'right', yalign: 'top' | 'center' | 'bottom') =>
        build(
          { id: 't:one', init: STONE, rooms: [{ x: 2, y: 2, w: 4, h: 3, xalign, yalign }] },
          1,
          opts(w, h),
        ).rooms[0] as Room;
      const left = one('left', 'top');
      expect(left.lx + 1).toBe(Math.trunc(colno / 5) + 1); // NetHack x of cell 2
      expect(left.hx - left.lx + 1).toBe(4);
      const center = one('center', 'center');
      const right = one('right', 'bottom');
      expect(center.lx).toBeGreaterThan(left.lx);
      expect(right.lx).toBeGreaterThan(center.lx);
      expect(right.ly).toBeGreaterThan(center.ly);
      expect(right.lx + 1 + 4).toBe(2 * Math.trunc(colno / 5) + 1); // xabs += COLNO/5 - w
    }
  });

  test('random rooms fill the level like ordinary ones and never overlap', () => {
    const def: LevelDef = {
      id: 't:rand',
      init: STONE,
      rooms: Array.from({ length: 8 }, () => ({})),
      corridors: 'random',
    };
    for (const size of [opts(), opts(120, 40)])
      for (let seed = 1; seed <= 20; seed++) {
        const l = build(def, seed, size);
        expect(l.rooms.length).toBeGreaterThanOrEqual(4);
        for (const [i, a] of l.rooms.entries())
          for (const b of l.rooms.slice(i + 1))
            expect(
              a.hx + 1 < b.lx - 1 ||
                b.hx + 1 < a.lx - 1 ||
                a.hy + 1 < b.ly - 1 ||
                b.hy + 1 < a.ly - 1,
            ).toBe(true);
        if (!l.up) throw new Error('no up');
        const seen = reach(l, l.up);
        for (const r of l.rooms) expect(seen.has(r.ly * l.width + r.lx)).toBe(true);
      }
  });

  test('a two-room level with corridors; a door at a fixed pos needs open ground outside', () => {
    const def: LevelDef = {
      id: 't:two',
      init: STONE,
      rooms: [
        { x: 1, y: 3, w: 5, h: 4, xalign: 'center', yalign: 'center', stairs: ['up'] },
        {
          x: 5,
          y: 3,
          w: 5,
          h: 4,
          xalign: 'center',
          yalign: 'center',
          stairs: ['down'],
          rooms: [{ x: 3, y: 0, w: 2, h: 2, doors: [{ state: 'open', wall: 'west', pos: 1 }] }],
        },
      ],
      corridors: 'random',
    };
    for (let seed = 1; seed <= 20; seed++) {
      const l = build(def, seed);
      expect(l.rooms).toHaveLength(3);
      const r = l.rooms[2] as Room;
      expect(keyAt(l, r.lx - 1, r.ly + 1)).toBe('door_open_v');
      if (!l.up || !l.down) throw new Error('no stairs');
      expect(reach(l, l.up).has(l.down.y * l.width + l.down.x)).toBe(true);
    }
  });

  test('a subroom without size or spot is placed at random inside its parent', () => {
    const def: LevelDef = {
      id: 't:subrnd',
      init: STONE,
      rooms: [
        {
          x: 3,
          y: 3,
          w: 12,
          h: 8,
          xalign: 'center',
          yalign: 'center',
          rooms: [{ doors: [{ state: 'nodoor' }] }],
        },
      ],
    };
    for (let seed = 1; seed <= 30; seed++) {
      const l = build(def, seed);
      const [p, s] = l.rooms as [Room, Room];
      expect(s.parent).toBe(0);
      expect(s.lx).toBeGreaterThanOrEqual(p.lx);
      expect(s.hx).toBeLessThanOrEqual(p.hx);
      expect(s.ly).toBeGreaterThanOrEqual(p.ly);
      expect(s.hy).toBeLessThanOrEqual(p.hy);
    }
  });

  test('a level without rooms or map builds exactly as before (old code path)', () => {
    const def: LevelDef = { id: 't:plain', init: { style: 'solidfill', fg: 'nh:floor' } };
    expect(build(def, 4)).toEqual(build({ ...def }, 4));
    expect(build(def, 4).rooms).toEqual([]);
  });
});

describe('room validation', () => {
  const lvMod = (levels: LevelDef[]): Mod => ({
    id: 'lv',
    version: '1',
    register(api) {
      levels.forEach((l) => api.defineLevel(l));
    },
  });
  const issues = (d: unknown): string[] => {
    try {
      loadMods([terrainMod(), lvMod([d as LevelDef])]);
      return [];
    } catch (e) {
      if (!(e instanceof ModLoadError)) throw e;
      return e.issues.map((i) => `${i.path}: ${i.reason}`);
    }
  };

  test('the town loads', () => {
    expect(issues({ ...TOWN, id: 'lv:town' })).toEqual([]);
  });

  test('bad rooms are reported with their paths', () => {
    expect(
      issues({
        id: 'lv:badrooms',
        init: STONE,
        stairs: { up: { x: 1, y: 1 } },
        corridors: 'all',
        rooms: [
          { x: 0, y: 6, w: 3, xalign: 'middle', chance: 50 },
          {
            w: 4,
            h: 3,
            filled: true,
            stairs: ['up', 'sideways'],
            doors: [
              { state: 'ajar', wall: 'up' },
              { state: 'open', wall: 'north', pos: 4 },
              { state: 'open', pos: 1 },
              { state: 'open', x: 1, y: 1 },
            ],
            features: [{ kind: 'fountain', x: 4, y: 0, coords: 'level' }],
            contents: [{ kind: 'trap', x: 0, y: 3 }, { kind: 'spell' }],
            rooms: [
              { x: 2, y: 1, w: 3, h: 1, xalign: 'left' },
              { stairs: ['down'] },
              { stairs: ['down'] },
            ],
          },
        ],
      }),
    ).toEqual([
      'rooms[0].h: give both w and h, or neither',
      'rooms[0].x: must be an integer 1..5 (a cell of the 5x5 level grid)',
      'rooms[0].y: must be an integer 1..5 (a cell of the 5x5 level grid)',
      'rooms[0].xalign: must be one of left, center, right',
      'rooms[0].chance: is the chance of the room type; give a type',
      'rooms[1].filled: only a typed room can be filled',
      'rooms[1].doors[0].state: must be one of open, closed, locked, nodoor, broken, random',
      'rooms[1].doors[0].wall: must be one of north, south, east, west, random',
      'rooms[1].doors[1].pos: must be below 4, the length of the north wall',
      'rooms[1].doors[2].pos: needs a wall (north, south, east or west)',
      'rooms[1].doors[3]: a room door goes on a wall (wall, pos); put doors at x,y in LevelDef.doors',
      'rooms[1].features[0].coords: room features are relative to the room; no coords',
      "rooms[1].features[0]: 4,0 is outside the room's 4x3 floor (room coordinates run from 0,0)",
      'rooms[1].stairs[0]: the up stairs are already placed by stairs.up',
      "rooms[1].stairs[1]: must be 'up' or 'down'",
      "rooms[1].contents[0]: 0,3 is outside the room's 4x3 floor (room coordinates run from 0,0)",
      'rooms[1].rooms[0]: a subroom is placed by x,y; xalign and yalign are for top-level rooms',
      "rooms[1].rooms[0]: does not fit in its parent's 4x3 floor",
      'rooms[1].rooms[2].stairs[0]: the down stairs are already placed by rooms[1].rooms[1].stairs[0]',
      "corridors: must be 'random'",
      'rooms[1].contents[1].kind: must be one of monster, object, trap',
    ]);
  });

  test('unknown ids in room contents are reported', () => {
    expect(
      issues({
        id: 'lv:ids',
        init: STONE,
        rooms: [{ rooms: [{ contents: [{ kind: 'monster', id: 'nh:nobody' }] }] }],
      }),
    ).toEqual(["rooms[0].rooms[0].contents[0].id: unknown monster 'nh:nobody'"]);
  });

  test('a room feature off the level throws when built', () => {
    const def: LevelDef = {
      id: 'lv:offroom',
      init: STONE,
      rooms: [{ x: 5, y: 1, features: [{ kind: 'tree', x: 200, y: 0 }] }],
    };
    expect(() => build(def)).toThrow(
      /LevelDef 'lv:offroom': rooms\[0\]\.features\[0\] at 200,0 of its room is outside the 80x21 level/,
    );
  });
});

describe('the ARCHITECTURE.md rooms example', () => {
  const square: LevelDef = {
    id: 'mymod:square',
    init: { style: 'solidfill', fg: 'nh:stone' },
    rooms: [
      {
        x: 3,
        y: 3,
        xalign: 'center',
        yalign: 'center',
        w: 20,
        h: 9,
        lit: true,
        features: [{ kind: 'fountain', x: 10, y: 4 }],
        contents: [{ kind: 'monster', id: 'nh:watchman', peaceful: true, count: 2 }],
        rooms: [
          {
            type: 'nh:temple',
            x: 2,
            y: 2,
            w: 4,
            h: 4,
            lit: true,
            doors: [{ state: 'closed', wall: 'east' }],
            features: [{ kind: 'altar', x: 2, y: 2, align: 'random', shrine: true }],
          },
          {
            type: 'nh:tool_shop',
            chance: 90,
            x: 13,
            y: 2,
            w: 3,
            h: 3,
            doors: [{ state: 'closed', wall: 'west' }],
          },
          { percent: 75, x: 13, y: 7, w: 2, h: 2, doors: [{ state: 'locked', wall: 'north' }] },
        ],
      },
      { stairs: ['up'] },
      { stairs: ['down'], contents: [{ kind: 'trap' }] },
      { contents: [{ kind: 'monster', id: 'nh:dwarf' }] },
    ],
    corridors: 'random',
  };

  test('builds at 80x21 and 120x40 with the temple, its altar and door, and reachable stairs', () => {
    for (const size of [opts(), opts(120, 40)])
      for (let seed = 1; seed <= 10; seed++) {
        const l = build(square, seed, size);
        const temple = l.rooms.find((r) => r.type === 'nh:temple');
        if (!temple || !l.up || !l.down) throw new Error('missing');
        expect(temple.parent).toBe(0);
        expect(keyAt(l, temple.lx + 2, temple.ly + 2)).toMatch(/^altar_/);
        const doors = [];
        for (let y = temple.ly; y <= temple.hy; y++)
          if (keyAt(l, temple.hx + 1, y) === 'door_closed') doors.push(y);
        expect(doors).toHaveLength(1);
        const town = l.rooms[0] as Room;
        expect(keyAt(l, town.lx + 10, town.ly + 4)).toBe('fountain');
        expect(reach(l, l.up).has(l.down.y * l.width + l.down.x)).toBe(true);
      }
  });
});
