// m21 step 1: the layout and the Rogue level's map. dungeon.lua's two missing entries are placed
// at new game: the Rogue level (DL15-18, first of the main dungeon's special levels) and Fort
// Ludios (one level, its branch rolled on DL18-21 with stairs at neither end: C's floating knox
// entrance). The Rogue level is three by three sections of rooms and crossings joined by
// corridors, its doors all doorways or secret doors with nothing behind them. Outcomes are
// asserted over many seeds; makeroguerooms()'s draws against a hand-traced scripted run.
// ref: dat/dungeon.lua; src/dungeon.c init_dungeons(), place_level(), fixup_level_locations();
// src/extralev.c makeroguerooms(), miniwalk(), roguecorr(), roguejoin(), corr(); src/mklev.c
// makelevel(), dosdoor(), generate_stairs()
import {
  cellIndex,
  createEngine,
  createRng,
  getLevel,
  insideRoom,
  levelStairs,
  rollDungeons,
  seedRng,
  sortedIds,
  type Ctx,
  type DefId,
  type GameState,
  type Level,
  type Mod,
  type Pos,
  type Rng,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import { KNOX, LUDIOS, ROGUE, isKnox, isRogueLevel } from '../src/levelflags';
import { makeRogueRooms, rogueFits, rogueSection } from '../src/rogue';
import { T } from '../src/terrain';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'rg',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'rg:run',
      labelKey: 'rg',
      handles: 'mod',
      offer: () => [],
      perform(ctx) {
        probe.fn(ctx);
        return 0;
      },
    });
  },
};
const engine = createEngine([vanillaMod, probeMod]);
const run = (state: GameState, fn: (ctx: Ctx) => void): void => {
  probe.fn = fn;
  engine.step(state, { type: 'mod', action: 'rg:run' as DefId });
};

const rogueDlevel = (state: GameState): number =>
  state.dungeons[0]?.special.find((s) => s.id === 'nh:rogue')?.dlevel ?? -1;

/** A new game on its Rogue level. */
function rogueLevel(seed: number, width = 80, height = 21): { state: GameState; level: Level } {
  const { state } = engine.newGame({ seed, width, height });
  run(state, (ctx) => ctx.goToLevel({ dungeon: 'nh:main', dlevel: rogueDlevel(state) }, 'random'));
  return { state, level: getLevel(state) };
}

const at = (l: Level, x: number, y: number): DefId | undefined =>
  l.palette[l.cells[cellIndex(l, x, y)] ?? -1];
const DOORS: ReadonlySet<DefId> = new Set([
  T.doorway,
  T.door_open_v,
  T.door_open_h,
  T.door_closed,
  T.door_locked,
  T.sdoor_v,
  T.sdoor_h,
  T.sdoor_locked_v,
  T.sdoor_locked_h,
]);
/** Squares one can walk on once every secret square is found. */
const WALK: ReadonlySet<DefId> = new Set([
  T.floor,
  T.corr,
  T.scorr,
  T.doorway,
  T.sdoor_v,
  T.sdoor_h,
  T.stairs_up,
  T.stairs_down,
]);

/** The squares reachable from `from`, secret ones counted as open. */
function reach(l: Level, from: Pos): Set<number> {
  const seen = new Set([cellIndex(l, from.x, from.y)]);
  const queue = [from];
  for (let q = 0; q < queue.length; q++) {
    const p = queue[q] as Pos;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const x = p.x + dx;
      const y = p.y + dy;
      if (x < 0 || y < 0 || x >= l.width || y >= l.height) continue;
      const i = cellIndex(l, x, y);
      const id = at(l, x, y);
      if (seen.has(i) || id === undefined || !WALK.has(id)) continue;
      seen.add(i);
      queue.push({ x, y });
    }
  }
  return seen;
}

/** The Rogue level's map, as makelevel()'s rogue path leaves it. */
function checkRogueMap(l: Level, state: GameState): void {
  expect(isRogueLevel(l)).toBe(true);
  const { sw, sh } = rogueSection(l.width, l.height);
  // 1-9 rooms, each in its own section of the 3x3 grid, sorted left to right
  expect(l.rooms.length).toBeGreaterThanOrEqual(1);
  expect(l.rooms.length).toBeLessThanOrEqual(9);
  const sections = l.rooms.map((r) => {
    const sx = Math.trunc(r.lx / sw);
    const sy = Math.min(2, Math.trunc(r.ly / sh));
    expect(sx).toBeLessThan(3);
    // the room and its walls stay inside the section
    expect(r.lx - 1).toBeGreaterThanOrEqual(sw * sx);
    expect(r.hx + 1).toBeLessThan(sw * (sx + 1));
    expect(r.ly - 1).toBeGreaterThanOrEqual(sh * sy);
    expect(r.hy + 1).toBeLessThan(sy === 2 ? l.height : sh * (sy + 1));
    return sy * 3 + sx;
  });
  expect(new Set(sections).size).toBe(sections.length);
  for (let i = 1; i < l.rooms.length; i++)
    expect(l.rooms[i]?.lx).toBeGreaterThanOrEqual(l.rooms[i - 1]?.lx ?? 0);
  // every door is a doorway or a secret door with no door, in a room's wall
  for (let y = 0; y < l.height; y++)
    for (let x = 0; x < l.width; x++) {
      const id = at(l, x, y) as DefId;
      if (!DOORS.has(id)) continue;
      expect([T.doorway, T.sdoor_v, T.sdoor_h]).toContain(id);
      const wall = l.rooms.find(
        (r) =>
          insideRoom(r, x, y) &&
          (x === r.lx - 1 || x === r.hx + 1 || y === r.ly - 1 || y === r.hy + 1),
      );
      expect(wall).toBeDefined();
      // a secret door faces its wall
      const w = wall ?? { lx: -9, ly: -9, hx: -9, hy: -9 };
      if (id === T.sdoor_h) expect(y === w.ly - 1 || y === w.hy + 1).toBe(true);
      if (id === T.sdoor_v) expect(x === w.lx - 1 || x === w.hx + 1).toBe(true);
    }
  // the stairs the dungeon gives it, in rooms, in different rooms when there are two or more
  const want = levelStairs(state, l);
  expect(l.up !== null).toBe(want.up);
  expect(l.down !== null).toBe(want.down);
  expect(l.branch).toBeNull();
  const roomOf = (p: Pos): number => l.rooms.findIndex((r) => insideRoom(r, p.x, p.y));
  for (const p of [l.up, l.down]) if (p) expect(roomOf(p)).toBeGreaterThanOrEqual(0);
  if (l.up) expect(at(l, l.up.x, l.up.y)).toBe(T.stairs_up);
  if (l.down) expect(at(l, l.down.x, l.down.y)).toBe(T.stairs_down);
  if (l.up && l.down && l.rooms.length > 1) expect(roomOf(l.up)).not.toBe(roomOf(l.down));
  // corridors join every room
  const start = l.up ?? l.down ?? { x: l.rooms[0]?.lx ?? 0, y: l.rooms[0]?.ly ?? 0 };
  const seen = reach(l, start);
  for (const r of l.rooms) expect(seen.has(cellIndex(l, r.lx, r.ly))).toBe(true);
  // no corridor inside a room or its walls
  for (const r of l.rooms)
    for (let x = r.lx - 1; x <= r.hx + 1; x++)
      for (let y = r.ly - 1; y <= r.hy + 1; y++)
        expect([T.corr, T.scorr]).not.toContain(at(l, x, y));
}

describe('the layout', () => {
  test('the Rogue level on DL15-18, Fort Ludios one level deep at 19-22, over seeds', () => {
    const rogue = new Set<number>();
    const ludios = new Set<number>();
    for (let seed = 1; seed <= 300; seed++) {
      const layout = rollDungeons(createRng(seedRng(seed)), engine.registry.dungeons);
      const [main] = layout;
      expect(main?.special.map((s) => s.id)).toEqual(
        expect.arrayContaining(['nh:rogue', 'nh:oracle', 'nh:medusa', 'nh:castle']),
      );
      // dungeon.lua's order: the rogue level first
      expect(main?.special[0]?.id).toBe('nh:rogue');
      const r = main?.special[0]?.dlevel ?? 0;
      expect([15, 16, 17, 18]).toContain(r);
      rogue.add(r);
      // never on another special level
      expect(main?.special.filter((s) => s.dlevel === r)).toHaveLength(1);
      // Fort Ludios: after Sokoban, one level, its branch on DL18-21 with no stairs on the main
      // dungeon's end
      expect(layout.map((d) => d.id).slice(0, 5)).toEqual([
        'nh:main',
        'nh:gehennom',
        'nh:mines',
        'nh:sokoban',
        LUDIOS,
      ]);
      const knox = layout[4];
      const b = main?.branches.find((x) => x.to === LUDIOS);
      expect(b?.stairs).toBe('child');
      expect([18, 19, 20, 21]).toContain(b?.dlevel);
      expect(knox).toMatchObject({ levels: 1, depthStart: (b?.dlevel ?? 0) + 1 });
      expect(knox?.special).toEqual([{ id: KNOX, dlevel: 1 }]);
      ludios.add(knox?.depthStart ?? 0);
    }
    expect([...rogue].sort()).toEqual([15, 16, 17, 18]);
    expect([...ludios].sort()).toEqual([19, 20, 21, 22]);
  });

  test('no level of the main dungeon has stairs to Fort Ludios', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { state } = engine.newGame({ seed });
      const main = state.dungeons[0]!;
      for (let dlevel = 1; dlevel <= (main.levels ?? 0); dlevel++)
        expect(levelStairs(state, { dungeon: main.id, dlevel }).branch?.to.dungeon).not.toBe(
          LUDIOS,
        );
    }
  });

  test("Fort Ludios's stand-in: no stairs at all, at its dungeon's depth", () => {
    for (const seed of [1, 2, 3]) {
      const { state } = engine.newGame({ seed });
      run(state, (ctx) => ctx.goToLevel({ dungeon: LUDIOS, dlevel: 1 }, 'random'));
      const l = getLevel(state);
      expect(isKnox(l)).toBe(true);
      expect(l.id).toBe('nh:ludios/1');
      expect(l.depth).toBe(state.dungeons.find((d) => d.id === LUDIOS)?.depthStart);
      expect([l.up, l.down, l.branch]).toEqual([null, null, null]);
      expect(l.cells.some((c) => engine.registry.terrain(l.palette[c] as DefId).stairs)).toBe(
        false,
      );
    }
  });
});

describe("the Rogue level's map", () => {
  test('3x3 sections, doorways only, all joined, stairs in rooms, over seeds', () => {
    const counts = new Set<number>();
    let filled = 0;
    let secretDoors = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { state, level } = rogueLevel(seed);
      expect(level.def).toBe(ROGUE);
      expect(level.depth).toBe(rogueDlevel(state));
      checkRogueMap(level, state);
      counts.add(level.rooms.length);
      if (
        level.cells.some((c) =>
          ([T.sdoor_v, T.sdoor_h] as DefId[]).includes(level.palette[c] as DefId),
        )
      )
        secretDoors++;
      // the rooms are filled as ordinary ones (C's fill_ordinary_room()): gold, objects
      if (
        sortedIds(state).some((id) => {
          const e = state.entities[String(id)];
          return e?.c.item !== undefined && e.c.pos?.level === level.id;
        })
      )
        filled++;
    }
    expect(counts.size).toBeGreaterThan(2);
    expect(secretDoors).toBeGreaterThan(0);
    expect(filled).toBeGreaterThan(30);
  });

  test('a larger map works: sections scale with it', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { state, level } = rogueLevel(seed, 120, 40);
      expect([level.width, level.height]).toEqual([120, 40]);
      checkRogueMap(level, state);
    }
  });

  test('a map too small for the 3x3 grid gets ordinary rooms, still without doors', () => {
    expect(rogueFits(80, 21)).toBe(true);
    expect(rogueFits(40, 15)).toBe(false);
    for (const seed of [1, 2, 3]) {
      const { state, level } = rogueLevel(seed, 40, 15);
      expect(isRogueLevel(level)).toBe(true);
      expect(level.rooms.length).toBeGreaterThan(0);
      for (const c of level.cells)
        expect([
          T.door_open_v,
          T.door_open_h,
          T.door_closed,
          T.door_locked,
          T.sdoor_locked_v,
          T.sdoor_locked_h,
        ]).not.toContain(level.palette[c]);
      const want = levelStairs(state, level);
      expect(level.up !== null).toBe(want.up);
      expect(level.down !== null).toBe(want.down);
    }
  });
});

/**
 * An rng that answers `script` in order, then 0, and records each rn2() bound (rnd(x) is rn2(x) +
 * 1, as core's).
 */
function scripted(script: number[]): Rng & { bounds: number[] } {
  const bounds: number[] = [];
  let i = 0;
  const rn2 = (x: number): number => {
    bounds.push(x);
    const v = i < script.length ? (script[i] as number) : 0;
    i++;
    if (v < 0 || v >= x) throw new Error(`scripted rn2(${String(x)}) cannot be ${String(v)}`);
    return v;
  };
  return { bounds, next: () => 0, rn2, rnd: (x) => rn2(x) + 1, d: () => 0 };
}

/** A stone 80x21 level at depth 15. */
function stoneLevel(width = 80, height = 21): Level {
  return {
    id: 'dlvl15',
    depth: 15,
    dungeon: 'nh:main',
    dlevel: 15,
    width,
    height,
    palette: [T.stone],
    cells: new Array<number>(width * height).fill(0),
    lit: new Array<0 | 1>(width * height).fill(0),
    rooms: [],
    up: null,
    down: null,
    branch: null,
    traps: [],
  };
}

describe('makeroguerooms() against a hand-traced run', () => {
  test("80x21: C's bounds, rooms and crossings", () => {
    // Each section: rn2(5) (0 = a crossing once a room exists or in the first 2x2), then for a
    // room dx = rn1(22, 2), dy = rn1(3, 2) (rn1(4, 2) on the last row), rlx = rnd(23 - dx + 1),
    // rly = rnd(4 - dy + 1) (5 on the last row); for a crossing rlx = rn1(22, 2), rly = rn1(3, 2)
    // (rn1(4, 2)); then miniwalk(rn2(3), rn2(3)). Floor at C column 1 + 26 * x + rlx (ours: one
    // less), row 7 * y + rly.
    // prettier-ignore
    const script = [
      1, 10, 1, 4, 0, //   (0,0) room: dx 12, dy 3, rlx 5, rly 1
      0, 7, 2, //          (1,0) crossing at rlx 9, rly 4
      3, 21, 0, 0, 2, //   (2,0) room: dx 23, dy 2, rlx 1, rly 3
      2, 0, 2, 21, 0, //   (0,1) room: dx 2, dy 4, rlx 22, rly 1
      4, 5, 0, 0, 1, //    (1,1) room: dx 7, dy 2, rlx 1, rly 2
      0, 0, 0, //          (2,1) crossing at rlx 2, rly 2
      1, 3, 3, 18, 0, //   (0,2) room: dx 5, dy 5, rlx 19, rly 1
      0, 21, 3, //         (1,2) crossing at rlx 23, rly 5
      1, 1, 0, 10, 3, //   (2,2) room: dx 3, dy 2, rlx 11, rly 4
      1, 1, //             miniwalk(1, 1)
    ];
    const rng = scripted(script);
    const level = stoneLevel();
    makeRogueRooms({ rng }, level);
    // prettier-ignore
    expect(rng.bounds.slice(0, script.length)).toEqual([
      5, 22, 3, 12, 2,
      5, 22, 3,
      5, 22, 3, 1, 3,
      5, 22, 3, 22, 1,
      5, 22, 3, 17, 3,
      5, 22, 3,
      5, 22, 4, 19, 1,
      5, 22, 4,
      5, 22, 4, 21, 4,
      3, 3,
    ]);
    // the rooms in grid order (sort_rooms() comes later), lit (the script's 0s: !rn2(7))
    expect(level.rooms).toEqual([
      { lx: 5, ly: 1, hx: 16, hy: 3, lit: true },
      { lx: 53, ly: 3, hx: 75, hy: 4, lit: true },
      { lx: 22, ly: 8, hx: 23, hy: 11, lit: true },
      { lx: 27, ly: 9, hx: 33, hy: 10, lit: true },
      { lx: 19, ly: 15, hx: 23, hy: 19, lit: true },
      { lx: 63, ly: 18, hx: 65, hy: 19, lit: true },
    ]);
    // walls and corners
    expect(at(level, 4, 0)).toBe(T.tlcorn);
    expect(at(level, 17, 4)).toBe(T.brcorn);
    expect(at(level, 10, 0)).toBe(T.hwall);
    expect(at(level, 4, 2)).toBe(T.vwall);
    expect(at(level, 64, 19)).toBe(T.floor);
    expect(level.lit[cellIndex(level, 4, 0)]).toBe(1);
    // the rest of the script's 0s: every door is secret at depth 15 (maybe_sdoor(8))
    let doors = 0;
    for (let y = 0; y < level.height; y++)
      for (let x = 0; x < level.width; x++) {
        const id = at(level, x, y) as DefId;
        if (DOORS.has(id)) {
          doors++;
          expect([T.sdoor_v, T.sdoor_h]).toContain(id);
        }
      }
    expect(doors).toBeGreaterThan(0);
    // and the crossings are on corridors: C's (1 + 26 + 9, 4), (1 + 52 + 2, 9), (1 + 26 + 23, 19)
    for (const [x, y] of [
      [35, 4],
      [54, 9],
      [49, 19],
    ] as const)
      expect([T.corr, T.scorr]).toContain(at(level, x, y));
    // every room joined to the others
    const seen = reach(level, { x: 5, y: 1 });
    for (const r of level.rooms) expect(seen.has(cellIndex(level, r.lx, r.ly))).toBe(true);
  });

  test('the first eight sections all crossings: the last is a room', () => {
    // rn2(5) = 0 everywhere: a crossing wherever allowed (a room exists, or x < 2 and y < 2)
    const rng = scripted([]);
    const level = stoneLevel();
    makeRogueRooms({ rng }, level);
    // (2,0) cannot be a crossing while no room exists: dx 2, dy 2, rlx 1, rly 1
    expect(level.rooms).toEqual([{ lx: 53, ly: 1, hx: 54, hy: 2, lit: true }]);
  });
});
