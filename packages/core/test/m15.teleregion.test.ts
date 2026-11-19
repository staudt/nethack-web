// m15 step 5: LevelDef.teleportRegions (the hero's random arrival, u_on_rndspot()), the
// `replace` terrain edit (des.replace_terrain()) and the maze init's random corrwid/deadends.
import { describe, expect, test } from 'vitest';
import { createEngine } from '../src/engine';
import { buildLevel, VANILLA_TERRAIN } from '../src/levelgen/index';
import { ModLoadError, loadMods } from '../src/registry';
import { createRng, seedRng } from '../src/rng';
import { getLevel, playerPos } from '../src/state';
import type { Level } from '../src/types/level';
import type { Ctx, DungeonDef, LevelDef, LevelRect, Mod, TerrainEdit } from '../src/types/mod';
import { actionsMod, terrainMod } from './helpers/fakeMods';

const W = 80;
const H = 21;
const opts = { id: 'x', depth: 12, width: W, height: H, terrain: VANILLA_TERRAIN };
const rng = (seed: number) => createRng(seedRng(seed));
const terrainAt = (l: Level, x: number, y: number): string =>
  l.palette[l.cells[y * l.width + x] ?? -1] ?? '?';
const inside = (p: { x: number; y: number }, r: LevelRect): boolean =>
  p.x >= r[0] && p.x <= r[2] && p.y >= r[1] && p.y <= r[3];

/** Loads `levels` (and `dungeons`) and returns the issues loadMods reports. */
function issues(levels: LevelDef[], dungeons: DungeonDef[] = []): string[] {
  try {
    loadMods([
      terrainMod(),
      {
        id: 'lv',
        version: '1',
        register(api) {
          levels.forEach((l) => api.defineLevel(l));
          dungeons.forEach((d) => api.defineDungeon(d));
        },
      },
    ]);
    return [];
  } catch (e) {
    if (!(e instanceof ModLoadError)) throw e;
    return e.issues.map((i) => `${i.path}: ${i.reason}`);
  }
}

describe('teleport regions', () => {
  /** An open floor level whose arrivals from above go left, from below right. */
  const ARENA: LevelDef = {
    id: 'lv:arena',
    init: { style: 'solidfill', fg: 'nh:floor', lit: true },
    teleportRegions: [
      { area: [2, 2, 20, 18], exclude: [5, 5, 15, 15], dir: 'down' },
      { area: [60, 2, 70, 18], dir: 'up' },
    ],
  };
  /** Both ways, map-relative: a later region without `dir` wins over an earlier one. */
  const BOTH: LevelDef = {
    id: 'lv:both',
    init: { style: 'solidfill', fg: 'nh:stone' },
    map: { rows: Array.from({ length: 9 }, () => '.'.repeat(21)) },
    teleportRegions: [{ area: [0, 0, 2, 2] }, { area: [10, 4, 12, 6] }],
  };
  const ctl: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
  const runMod: Mod = {
    id: 'gt',
    version: '1',
    register(api) {
      api.defineAction({
        id: 'gt:run',
        labelKey: 'a.run',
        handles: 'mod',
        offer: () => [],
        perform(ctx) {
          ctl.fn(ctx);
          return 12;
        },
      });
    },
  };
  const levelMod: Mod = {
    id: 'lv',
    version: '1',
    register(api) {
      api.defineLevel(ARENA);
      api.defineLevel(BOTH);
      api.defineDungeon({
        id: 'lv:main',
        nameKey: 'main',
        special: [
          { id: 'lv:a', nameKey: 'a', base: 3, variants: ['lv:arena'] },
          { id: 'lv:b', nameKey: 'b', base: 6, variants: ['lv:both'] },
        ],
      });
    },
  };
  const engine = createEngine([terrainMod(), actionsMod(), runMod, levelMod]);
  const go = (
    state: ReturnType<typeof engine.newGame>['state'],
    dlevel: number,
    at: 'up' | 'down' | 'branch' | 'random',
  ): void => {
    ctl.fn = (ctx) => ctx.goToLevel({ dungeon: 'lv:main', dlevel }, at);
    engine.step(state, { type: 'mod', action: 'gt:run', args: null });
  };

  test('arriving from above lands in the down region outside its exclusion', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const { state } = engine.newGame({ seed });
      for (let i = 0; i < 5; i++) {
        go(state, 2, 'up');
        go(state, 3, 'random');
        const p = playerPos(state);
        expect(getLevel(state).def).toBe('lv:arena');
        expect(inside(p, [2, 2, 20, 18])).toBe(true);
        expect(inside(p, [5, 5, 15, 15])).toBe(false);
      }
    }
  });

  test('arriving from below lands in the up region; a level without regions anywhere', () => {
    const { state } = engine.newGame({ seed: 3 });
    for (let i = 0; i < 6; i++) {
      go(state, 4, 'random');
      expect(getLevel(state).def).toBeUndefined();
      go(state, 3, 'random');
      expect(inside(playerPos(state), [60, 2, 70, 18])).toBe(true);
    }
    // the ordinary level below is entered anywhere on its floor
    go(state, 4, 'random');
    expect(terrainAt(getLevel(state), playerPos(state).x, playerPos(state).y)).toBe('nh:floor');
  });

  test('a region without dir serves both ways and the last one counts; map-relative', () => {
    const { state } = engine.newGame({ seed: 5 });
    go(state, 6, 'random');
    const level = getLevel(state);
    expect(level.def).toBe('lv:both');
    // the 21x9 map is centred: its top-left is where its first floor cell is
    let ox = -1;
    let oy = -1;
    for (let y = 0; y < H && ox < 0; y++)
      for (let x = 0; x < W && ox < 0; x++)
        if (terrainAt(level, x, y) !== 'nh:stone') [ox, oy] = [x, y];
    const area: LevelRect = [ox + 10, oy + 4, ox + 12, oy + 6];
    for (let i = 0; i < 4; i++) {
      expect(inside(playerPos(state), area)).toBe(true);
      go(state, 7, 'random');
      go(state, 6, 'random'); // from below
      expect(inside(playerPos(state), area)).toBe(true);
      go(state, 5, 'random');
      go(state, 6, 'random'); // from above
    }
  });

  test('a branch arrival without branch stairs lands at random in the region', () => {
    const { state } = engine.newGame({ seed: 2 });
    go(state, 2, 'up');
    go(state, 3, 'branch');
    expect(getLevel(state).branch).toBeNull();
    expect(inside(playerPos(state), [2, 2, 20, 18])).toBe(true);
    expect(inside(playerPos(state), [5, 5, 15, 15])).toBe(false);
  });

  test('m17: arriving at a fixed spot, new level or not; a monster there moves off', () => {
    const { state } = engine.newGame({ seed: 4 });
    const at = (x: number, y: number) => {
      ctl.fn = (ctx) => ctx.goToLevel({ dungeon: 'lv:main', dlevel: 3 }, { x, y });
      engine.step(state, { type: 'mod', action: 'gt:run', args: null });
    };
    at(40, 10); // the arena is generated first
    expect(getLevel(state).def).toBe('lv:arena');
    expect(playerPos(state)).toMatchObject({ x: 40, y: 10 });
    go(state, 2, 'random');
    const arena = Object.values(state.levels).find((l) => l.def === 'lv:arena')!;
    const id = state.nextEntityId++;
    state.entities[String(id)] = {
      id,
      def: 'x:mon',
      c: { pos: { level: arena.id, x: 7, y: 3 }, monster: {} },
    } as never;
    at(7, 3);
    expect(playerPos(state)).toMatchObject({ x: 7, y: 3 });
    const moved = state.entities[String(id)]!.c.pos!;
    expect(Math.max(Math.abs(moved.x - 7), Math.abs(moved.y - 3))).toBe(1);
    ctl.fn = (ctx) => ctx.goToLevel({ dungeon: 'lv:main', dlevel: 3 }, { x: W, y: 0 });
    expect(() => engine.step(state, { type: 'mod', action: 'gt:run', args: null })).toThrow(
      RangeError,
    );
  });

  test('bad shapes are reported', () => {
    expect(
      issues([
        {
          id: 'lv:t',
          init: { style: 'solidfill', fg: 'nh:floor' },
          map: { rows: ['....', '....'] },
          teleportRegions: [
            { area: [0, 0, 9, 1] },
            { area: [0, 0, 1, 1], exclude: [0, 0, 1, 1], excludeCoords: 'lvl' },
            { area: [0, 0, 1, 1], excludeCoords: 'level', dir: 'sideways' },
            { area: [1, 1, 0, 0] },
          ],
        } as unknown as LevelDef,
        {
          id: 'lv:u',
          init: { style: 'solidfill', fg: 'nh:floor' },
          teleportRegions: 'all',
        } as unknown as LevelDef,
      ]),
    ).toEqual([
      "teleportRegions[0].area: 9,1 is outside the 4x2 map (map coordinates run from 0,0; use coords: 'level' for Level coordinates)",
      "teleportRegions[1].excludeCoords: must be 'map' or 'level'",
      'teleportRegions[2].excludeCoords: needs an exclude',
      "teleportRegions[2].dir: must be 'up' or 'down' (omitted: both)",
      'teleportRegions[3].area: x1,y1 must be the top-left corner and x2,y2 the bottom-right',
      'teleportRegions: must be an array',
    ]);
  });
});

describe('replace edits', () => {
  const ROWS = ['..........', '..LLLL....', '..LLLL..L.', '..........'];
  const def = (edits: TerrainEdit[]): LevelDef => ({
    id: 'lv:r',
    init: { style: 'solidfill', fg: 'nh:stone' },
    map: { rows: ROWS },
    edits,
  });
  /** The map block's cells as map characters after building. */
  function built(d: LevelDef, seed = 1): string[] {
    const l = buildLevel(rng(seed), { ...opts, up: false, down: false }, d);
    const CH: Record<string, string> = { 'nh:floor': '.', 'nh:lava': 'L', 'nh:pool': 'P' };
    let ox = -1;
    let oy = -1;
    for (let y = 0; y < H && ox < 0; y++)
      for (let x = 0; x < W && ox < 0; x++)
        if (terrainAt(l, x, y) !== 'nh:stone') [ox, oy] = [x, y];
    return ROWS.map((row, y) =>
      [...row].map((_, x) => CH[terrainAt(l, ox + x, oy + y)] ?? '?').join(''),
    );
  }

  test('every matching cell of the area (default the whole level) is replaced', () => {
    expect(built(def([{ replace: { from: 'L', to: 'P' } }]))).toEqual(
      ROWS.map((r) => r.replace(/L/g, 'P')),
    );
    expect(built(def([{ replace: { from: 'L', to: 'P', area: [0, 0, 5, 3] } }]))).toEqual([
      '..........',
      '..PPPP....',
      '..PPPP..L.',
      '..........',
    ]);
  });

  test('chance: each matching cell rolls; 0 replaces none; percent wraps it like any edit', () => {
    expect(built(def([{ replace: { from: 'L', to: 'P', chance: 0 } }]))).toEqual(ROWS);
    let some = false;
    for (let seed = 1; seed <= 10 && !some; seed++) {
      const out = built(def([{ replace: { from: 'L', to: 'P', chance: 50 } }]), seed);
      const p = out.join('').split('P').length - 1;
      const l = out.join('').split('L').length - 1;
      expect(p + l).toBe(9);
      some = p > 0 && l > 0;
    }
    expect(some).toBe(true);
    expect(
      built(
        def([
          {
            percent: 0,
            replace: { from: 'L', to: 'P' },
            else: { replace: { from: 'L', to: '.' } },
          },
        ]),
      ),
    ).toEqual(ROWS.map((r) => r.replace(/L/g, '.')));
  });

  test('the rolls are drawn for every matching cell even at chance 100', () => {
    // one rn2(100) per lava cell: the stairs after the edit land differently than without it
    const stairs = (edits: TerrainEdit[]): string => {
      const l = buildLevel(rng(7), opts, def(edits));
      return JSON.stringify([l.up, l.down]);
    };
    expect(stairs([{ replace: { from: 'L', to: 'L' } }])).not.toBe(stairs([]));
    expect(stairs([{ replace: { from: 'P', to: 'L' } }])).toBe(stairs([]));
  });

  test('bad shapes are reported', () => {
    expect(
      issues([
        def([
          { replace: { from: 'x', to: 'Q' } },
          { replace: { from: 'L', to: '.', area: [0, 0, 10, 3], chance: 101 } },
          { replace: { from: 'L', to: '.', coords: 'level' } },
          { replace: 'L' },
        ] as unknown as TerrainEdit[]),
      ]),
    ).toEqual([
      "edits[0].replace.from: must be one map character (' ' . # - | + S H { K T P } W L Z I C \\ F A)",
      "edits[0].replace.to: must be one map character (' ' . # - | + S H { K T P } W L Z I C \\ F A)",
      "edits[1].replace.area: 10,3 is outside the 10x4 map (map coordinates run from 0,0; use coords: 'level' for Level coordinates)",
      'edits[1].replace.chance: must be an integer 0..100',
      'edits[2].replace.coords: needs an area',
      'edits[3].replace: must be an object',
    ]);
  });
});

describe('random maze widths and dead ends', () => {
  const MAZE: LevelDef = {
    id: 'lv:m',
    init: { style: 'maze', corrwid: { min: 3, max: 5 }, wallthick: 1, deadends: { percent: 50 } },
  };
  /**
   * The corridor width: from the maze's top-left floor cell (x0, y0), the first k with
   * (x0 + k, y0 + k) not floor is a wall post (never carved), so k is the width.
   */
  function corridorWidth(l: Level): number {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (terrainAt(l, x, y) === 'nh:floor') {
          let k = 1;
          while (terrainAt(l, x + k, y + k) === 'nh:floor') k++;
          return k;
        }
    return 0;
  }

  test('corrwid min..max: every width occurs, nothing else', () => {
    const widths = new Set<number>();
    for (let seed = 1; seed <= 30; seed++)
      widths.add(corridorWidth(buildLevel(rng(seed), { ...opts, up: false, down: false }, MAZE)));
    expect([...widths].sort()).toEqual([3, 4, 5]);
  });

  test('the shapes are checked', () => {
    expect(
      issues([
        { id: 'lv:a', init: { style: 'maze', corrwid: { min: 4, max: 2 } } },
        {
          id: 'lv:b',
          init: { style: 'maze', corrwid: { min: 0, max: 2 }, deadends: { percent: 120 } },
        },
        { id: 'lv:c', init: { style: 'maze', deadends: 'maybe' } } as unknown as LevelDef,
      ]),
    ).toEqual([
      'init.corrwid: must be an integer 1..5 or { min, max } with 1 <= min <= max <= 5',
      'init.corrwid: must be an integer 1..5 or { min, max } with 1 <= min <= max <= 5',
      'init.deadends: must be a boolean or { percent } with an integer 0..100',
      'init.deadends: must be a boolean',
    ]);
  });
});
