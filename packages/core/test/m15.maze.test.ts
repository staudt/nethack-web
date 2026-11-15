// m15 step 4: the `maze` and `mazegrid` LevelDef inits, walkfrom(), mazexy() and
// DungeonDef.mazeFiller.
import { describe, expect, test } from 'vitest';
import { createEngine } from '../src/engine';
import { buildLevel, mazeMax, mazexy, VANILLA_TERRAIN, walkfrom } from '../src/levelgen/index';
import { ModLoadError, loadMods } from '../src/registry';
import { createRng, seedRng } from '../src/rng';
import { getLevel } from '../src/state';
import type { Level } from '../src/types/level';
import type { Ctx, DungeonDef, LevelDef, Mod } from '../src/types/mod';
import { actionsMod, terrainMod } from './helpers/fakeMods';

const W = 80;
const H = 21;
const opts = { id: 'x', depth: 30, width: W, height: H, terrain: VANILLA_TERRAIN };
const WALLS = new Set([
  'nh:vwall',
  'nh:hwall',
  'nh:tlcorn',
  'nh:trcorn',
  'nh:blcorn',
  'nh:brcorn',
  'nh:crwall',
  'nh:tuwall',
  'nh:tdwall',
  'nh:tlwall',
  'nh:trwall',
]);
const OPEN = new Set(['nh:floor', 'nh:corr', 'nh:stairs_up', 'nh:stairs_down']);

const terrainAt = (l: Level, x: number, y: number): string =>
  x < 0 || y < 0 || x >= l.width || y >= l.height
    ? 'out'
    : (l.palette[l.cells[y * l.width + x] ?? -1] ?? '?');
const open = (l: Level, x: number, y: number): boolean => OPEN.has(terrainAt(l, x, y));

/** Every open cell is reached from the up stairs, orthogonally. */
function joined(l: Level): boolean {
  const start = l.up ?? l.down;
  if (!start) return false;
  const seen = new Set<number>([start.y * l.width + start.x]);
  const stack = [start];
  while (stack.length) {
    const p = stack.pop() as { x: number; y: number };
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const x = p.x + dx;
      const y = p.y + dy;
      if (!open(l, x, y) || seen.has(y * l.width + x)) continue;
      seen.add(y * l.width + x);
      stack.push({ x, y });
    }
  }
  let n = 0;
  for (let i = 0; i < l.cells.length; i++) if (OPEN.has(l.palette[l.cells[i] ?? -1] ?? '')) n++;
  return n === seen.size;
}

/** Maze nodes (Level x even, y odd) inside the maze with three closed sides. */
function deadEnds(l: Level): number {
  const max = mazeMax(l.width, l.height);
  let n = 0;
  for (let x = 2; x < max.x - 1; x += 2)
    for (let y = 3; y < max.y; y += 2) {
      if (!open(l, x, y)) continue;
      const sides = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].filter(([dx, dy]) => open(l, x + (dx as number), y + (dy as number))).length;
      if (sides === 1) n++;
    }
  return n;
}

describe('the maze init', () => {
  const MAZE: LevelDef = { id: 'lv:maze', init: { style: 'maze', corrwid: 1, wallthick: 1 } };

  test('a one-wide maze is fully joined, walled, unlit, with stairs on its floor', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const l = buildLevel(createRng(seedRng(seed)), opts, MAZE);
      expect(l.corrmaze).toBeUndefined();
      expect(joined(l)).toBe(true);
      expect(l.lit.every((v) => v === 0)).toBe(true);
      expect(l.cells.some((c) => WALLS.has(l.palette[c] ?? ''))).toBe(true);
      expect(l.cells.some((c) => l.palette[c] === 'nh:corr')).toBe(false);
      // the stairs replaced maze floor: next to some other floor, on a maze node or corridor
      for (const p of [l.up, l.down]) {
        expect(p).not.toBeNull();
        const s = p as { x: number; y: number };
        expect(
          open(l, s.x + 1, s.y) ||
            open(l, s.x - 1, s.y) ||
            open(l, s.x, s.y + 1) ||
            open(l, s.x, s.y - 1),
        ).toBe(true);
      }
      // every node of the inner grid (Level x even 2..78, y odd 3..19) is walked
      for (let x = 2; x <= 78; x += 2)
        for (let y = 3; y <= 19; y += 2) expect(open(l, x, y)).toBe(true);
      // the outer two rows and columns stay stone
      for (let x = 0; x < W; x++) expect(terrainAt(l, x, 0)).toBe('nh:stone');
      for (let y = 0; y < H; y++) expect(terrainAt(l, 0, y)).toBe('nh:stone');
    }
  });

  test('deadends: false opens every dead end; by default some remain', () => {
    let kept = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const removed = buildLevel(createRng(seedRng(seed)), opts, {
        ...MAZE,
        init: { style: 'maze', corrwid: 1, wallthick: 1, deadends: false },
      });
      expect(joined(removed)).toBe(true);
      expect(deadEnds(removed)).toBe(0);
      kept += deadEnds(buildLevel(createRng(seedRng(seed)), opts, MAZE));
    }
    expect(kept).toBeGreaterThan(0);
  });

  test('wider corridors and walls scale the maze up and stay joined', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const def: LevelDef = { id: 'lv:wide', init: { style: 'maze', corrwid: 3, wallthick: 2 } };
      const l = buildLevel(createRng(seedRng(seed)), opts, def);
      expect(joined(l)).toBe(true);
      // a corridor three cells wide: some 3x3 block of floor
      let block = false;
      for (let x = 1; x < W - 3 && !block; x++)
        for (let y = 1; y < H - 3 && !block; y++) {
          let all = true;
          for (let dx = 0; dx < 3; dx++)
            for (let dy = 0; dy < 3; dy++) if (!open(l, x + dx, y + dy)) all = false;
          block = all;
        }
      expect(block).toBe(true);
    }
  });

  test('the filler maze: a corridor maze without walls 1 time in 3, its stairs on maze spots', () => {
    let corr = 0;
    let walled = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const def: LevelDef = { id: 'lv:fill', init: { style: 'maze', filler: true } };
      const l = buildLevel(createRng(seedRng(seed)), opts, def);
      expect(joined(l)).toBe(true);
      const hasWalls = l.cells.some((c) => WALLS.has(l.palette[c] ?? ''));
      if (l.corrmaze) {
        corr++;
        expect(hasWalls).toBe(false);
        expect(l.cells.some((c) => l.palette[c] === 'nh:floor')).toBe(false);
        expect(l.cells.some((c) => l.palette[c] === 'nh:corr')).toBe(true);
      } else {
        walled++;
        expect(hasWalls).toBe(true);
        expect(l.cells.some((c) => l.palette[c] === 'nh:corr')).toBe(false);
      }
    }
    expect(corr).toBeGreaterThan(0);
    expect(walled).toBeGreaterThan(corr);
  });

  test('mazexy() finds maze floor (corridor on a corridor maze) inside the maze bounds', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const def: LevelDef = { id: 'lv:fill', init: { style: 'maze', filler: true } };
      const l = buildLevel(createRng(seedRng(seed)), opts, def);
      const rng = createRng(seedRng(seed + 100));
      for (let i = 0; i < 20; i++) {
        const p = mazexy(rng, l, VANILLA_TERRAIN);
        expect(p).not.toBeNull();
        expect(terrainAt(l, p?.x ?? -1, p?.y ?? -1)).toBe(l.corrmaze ? 'nh:corr' : 'nh:floor');
      }
    }
    const stone: LevelDef = { id: 'lv:s', init: { style: 'solidfill', fg: 'nh:stone' } };
    const l = buildLevel(createRng(seedRng(1)), { ...opts, up: false, down: false }, stone);
    expect(mazexy(createRng(seedRng(1)), l, VANILLA_TERRAIN)).toBeNull();
  });

  test('small levels still make a joined maze', () => {
    for (const [w, h] of [
      [10, 10],
      [15, 12],
      [120, 40],
    ] as const)
      for (let seed = 1; seed <= 5; seed++) {
        const def: LevelDef = { id: 'lv:fill', init: { style: 'maze', filler: true } };
        const l = buildLevel(createRng(seedRng(seed)), { ...opts, width: w, height: h }, def);
        expect(joined(l)).toBe(true);
      }
  });
});

describe('the mazegrid init', () => {
  test('grid walls next to open map cells stay; the stone nodes are on odd NetHack cells', () => {
    const def: LevelDef = {
      id: 'lv:grid',
      init: { style: 'mazegrid', bg: 'nh:hwall' },
      map: { rows: ['...', '...', '...'], x: 10, y: 9 },
    };
    const l = buildLevel(createRng(seedRng(1)), opts, def);
    expect(l.lit.every((v) => v === 0)).toBe(true);
    // the grid cells around the 3x3 map block are walls, the far grid wiped to stone
    for (let x = 9; x <= 13; x++) {
      expect(WALLS.has(terrainAt(l, x, 8))).toBe(true);
      expect(WALLS.has(terrainAt(l, x, 12))).toBe(true);
    }
    expect(terrainAt(l, 40, 10)).toBe('nh:stone');
  });

  test('walkfrom() carves a maze through the grid two cells at a time', () => {
    const def: LevelDef = { id: 'lv:grid', init: { style: 'mazegrid', bg: 'nh:hwall' } };
    const l = buildLevel(createRng(seedRng(2)), { ...opts, up: false, down: false }, def);
    const floor = l.palette.indexOf('nh:floor');
    const stone = l.palette.indexOf('nh:stone');
    const max = mazeMax(W, H);
    walkfrom(
      createRng(seedRng(3)),
      {
        minX: 2,
        minY: 3,
        maxX: max.x - 1,
        maxY: max.y,
        stone: (x, y) => l.cells[y * W + x] === stone,
        door: () => false,
        carve: (x, y) => void (l.cells[y * W + x] = floor),
      },
      2,
      3,
    );
    for (let x = 2; x <= max.x - 1; x += 2)
      for (let y = 3; y <= max.y - 1; y += 2) expect(terrainAt(l, x, y)).toBe('nh:floor');
    // carved cells only on the grid lines: never both coordinates "wall" (Level x odd, y even)
    for (let x = 1; x < W; x += 2)
      for (let y = 2; y < H; y += 2) expect(terrainAt(l, x, y)).not.toBe('nh:floor');
  });
});

describe('DungeonDef.mazeFiller', () => {
  const ROOMY: LevelDef = { id: 'lv:island', init: { style: 'solidfill', fg: 'nh:floor' } };
  const FILL: LevelDef = { id: 'lv:mazefill', init: { style: 'maze', filler: true } };
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
  const levelMod = (dungeons: DungeonDef[]): Mod => ({
    id: 'lv',
    version: '1',
    register(api) {
      api.defineLevel(ROOMY);
      api.defineLevel(FILL);
      dungeons.forEach((d) => api.defineDungeon(d));
    },
  });
  const main = (chance: number): DungeonDef => ({
    id: 'lv:main',
    nameKey: 'main',
    special: [{ id: 'lv:isle', nameKey: 'isle', base: 3, chance, variants: ['lv:island'] }],
    mazeFiller: { below: 'lv:isle', def: 'lv:mazefill', roomsOneIn: 5 },
  });
  /** The `def` of levels 1..n, made in order. */
  function defsDown(chance: number, seed: number, n: number): (string | undefined)[] {
    const engine = createEngine([terrainMod(), actionsMod(), runMod, levelMod([main(chance)])]);
    const { state } = engine.newGame({ seed });
    const out: (string | undefined)[] = [getLevel(state).def];
    for (let d = 2; d <= n; d++) {
      ctl.fn = (ctx) => ctx.goToLevel({ dungeon: 'lv:main', dlevel: d }, 'down');
      engine.step(state, { type: 'mod', action: 'gt:run', args: null });
      out.push(getLevel(state).def);
    }
    return out;
  }

  test('below the special level most levels are mazes; above it none', () => {
    let mazes = 0;
    let rooms = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const defs = defsDown(100, seed, 10);
      expect(defs.slice(0, 2)).toEqual([undefined, undefined]);
      expect(defs[2]).toBe('lv:island');
      for (const d of defs.slice(3)) {
        if (d === 'lv:mazefill') mazes++;
        else {
          expect(d).toBeUndefined();
          rooms++;
        }
      }
    }
    expect(rooms).toBeGreaterThan(0); // rn2(5) == 0
    expect(mazes).toBeGreaterThan(rooms * 2);
  });

  test('inert while the special level is not in the layout', () => {
    for (let seed = 1; seed <= 3; seed++)
      expect(defsDown(0, seed, 6).every((d) => d === undefined)).toBe(true);
  });

  test('bad shapes and unknown levels are reported', () => {
    const issues = (d: DungeonDef): string[] => {
      try {
        loadMods([terrainMod(), levelMod([d])]);
        return [];
      } catch (e) {
        if (!(e instanceof ModLoadError)) throw e;
        return e.issues.map((i) => `${i.path}: ${i.reason}`);
      }
    };
    expect(
      issues({
        id: 'lv:main',
        nameKey: 'main',
        mazeFiller: { below: '', def: 'lv:nope', roomsOneIn: 0 },
      } as unknown as DungeonDef),
    ).toEqual([
      'mazeFiller.below: must be a non-empty string',
      'mazeFiller.roomsOneIn: must be an integer >= 1',
      "mazeFiller.def: unknown level 'lv:nope'",
    ]);
    expect(
      issues({
        id: 'lv:main',
        nameKey: 'main',
        filler: 'lv:island',
        mazeFiller: { below: 'lv:isle', def: 'lv:mazefill', roomsOneIn: 5 },
      }),
    ).toEqual(['mazeFiller: a dungeon with a filler makes no other levels']);
  });

  test('maze init shapes are checked', () => {
    const issues = (l: LevelDef): string[] => {
      try {
        loadMods([terrainMod(), { id: 'lv', version: '1', register: (api) => api.defineLevel(l) }]);
        return [];
      } catch (e) {
        if (!(e instanceof ModLoadError)) throw e;
        return e.issues.map((i) => `${i.path}: ${i.reason}`);
      }
    };
    expect(
      issues({
        id: 'lv:m',
        init: { style: 'maze', corrwid: 6, wallthick: 0, deadends: 1 },
      } as unknown as LevelDef),
    ).toEqual([
      'init.corrwid: must be an integer 1..5',
      'init.wallthick: must be an integer 1..5',
      'init.deadends: must be a boolean',
    ]);
    expect(issues({ id: 'lv:m', init: { style: 'maze', filler: true, corrwid: 2 } })).toEqual([
      'init.corrwid: is not used with filler',
    ]);
    expect(issues({ id: 'lv:g', init: { style: 'mazegrid' } } as unknown as LevelDef)).toEqual([
      'init.bg: must be a terrain id',
    ]);
    expect(issues({ id: 'lv:g', init: { style: 'mazegrid', bg: 'lv:hedge' } })).toEqual([
      "init.bg: unknown terrain 'lv:hedge'",
    ]);
  });
});
