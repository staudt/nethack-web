// Milestone 6a step 4: mkmap cave maps (the `mines` LevelDef style), walls and T-walls.
import { describe, expect, test } from 'vitest';
import { createEngine } from '../src/engine';
import {
  buildLevel,
  levelToAscii,
  mkmap,
  MIN_MKMAP_HEIGHT,
  MIN_MKMAP_WIDTH,
  MK,
  VANILLA_TERRAIN,
  type MkmapOptions,
} from '../src/levelgen/index';
import { ModLoadError, loadMods } from '../src/registry';
import { createRng, seedRng } from '../src/rng';
import { getLevel } from '../src/state';
import type { LevelDef, Mod } from '../src/types/mod';
import { actionsMod, terrainMod } from './helpers/fakeMods';

const SIZES: [number, number][] = [
  [MIN_MKMAP_WIDTH, MIN_MKMAP_HEIGHT],
  [17, 11],
  [80, 21],
  [41, 50],
  [200, 60],
];
const CAVE: Omit<MkmapOptions, 'width' | 'height'> = {
  smoothed: true,
  joined: true,
  walled: true,
};

const isWall = (k: number | undefined): boolean => k !== undefined && k >= MK.VWALL;

/** The 8 neighbours of cell i that are on the map. */
function around(w: number, h: number, i: number): number[] {
  const x = i % w;
  const y = (i - x) / w;
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if ((dx || dy) && nx >= 0 && ny >= 0 && nx < w && ny < h) out.push(ny * w + nx);
    }
  return out;
}

/** Cells reachable from the first FG cell by king moves over FG cells. */
function reach(cells: number[], w: number, h: number): number {
  const start = cells.indexOf(MK.FG);
  if (start < 0) return 0;
  const seen = new Set([start]);
  const todo = [start];
  for (let i = todo.pop(); i !== undefined; i = todo.pop())
    for (const j of around(w, h, i))
      if (cells[j] === MK.FG && !seen.has(j)) {
        seen.add(j);
        todo.push(j);
      }
  return seen.size;
}

describe('mkmap', () => {
  // 200x60 timed out at 30s once under a loaded full run: room as for the heavy soaks
  const HEAVY = { timeout: 120000 };

  test.each(SIZES)('%ix%i: joined caves are one connected open area', HEAVY, (w, h) => {
    for (let seed = 1; seed <= 40; seed++) {
      const cells = mkmap(createRng(seedRng(seed)), { width: w, height: h, ...CAVE });
      const open = cells.filter((k) => k === MK.FG).length;
      expect(open).toBeGreaterThan(3);
      expect(reach(cells, w, h)).toBe(open);
    }
  });

  test.each(SIZES)(
    '%ix%i: walls only next to open cells, and open cells only touch walls or open',
    HEAVY,
    (w, h) => {
      for (let seed = 1; seed <= 40; seed++) {
        const cells = mkmap(createRng(seedRng(seed)), { width: w, height: h, ...CAVE });
        cells.forEach((k, i) => {
          const x = i % w;
          const y = (i - x) / w;
          const near = around(w, h, i).map((j) => cells[j]);
          if (isWall(k)) expect(near).toContain(MK.FG);
          if (k === MK.FG) {
            // never on the map edge, so the wall around it fits
            expect(x > 0 && y > 0 && x < w - 1 && y < h - 1).toBe(true);
            expect(near.every((n) => n === MK.FG || isWall(n))).toBe(true);
          }
        });
      }
    },
  );

  test('wall pieces join their neighbours: T-walls and corners appear and connect', () => {
    const w = 80;
    const h = 21;
    const seen = new Set<number>();
    for (let seed = 1; seed <= 20; seed++) {
      const cells = mkmap(createRng(seedRng(seed)), { width: w, height: h, ...CAVE });
      cells.forEach((k, i) => {
        if (!isWall(k)) return;
        seen.add(k);
        const x = i % w;
        const wallAt = (dx: number, dy: number): boolean =>
          x + dx >= 0 && x + dx < w && isWall(cells[i + dy * w + dx]);
        // a piece with an arm toward a side has a wall there (ref: rm.h wall pictures)
        const arms: Record<number, [boolean, boolean, boolean, boolean]> = {
          // [north, south, east, west]
          [MK.TLCORN]: [false, true, true, false],
          [MK.TRCORN]: [false, true, false, true],
          [MK.BLCORN]: [true, false, true, false],
          [MK.BRCORN]: [true, false, false, true],
          [MK.CRWALL]: [true, true, true, true],
          [MK.TUWALL]: [true, false, true, true],
          [MK.TDWALL]: [false, true, true, true],
          [MK.TLWALL]: [true, true, false, true],
          [MK.TRWALL]: [true, true, true, false],
        };
        const a = arms[k];
        if (!a) return;
        expect(
          [wallAt(0, -1), wallAt(0, 1), wallAt(1, 0), wallAt(-1, 0)].map((v, d) => v || !a[d]),
        ).toEqual([true, true, true, true]);
      });
    }
    for (const k of [
      MK.VWALL,
      MK.HWALL,
      MK.TLCORN,
      MK.BRCORN,
      MK.TUWALL,
      MK.TDWALL,
      MK.TLWALL,
      MK.TRWALL,
    ])
      expect(seen).toContain(k);
  });

  test('unjoined, unwalled maps have only open and background cells', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const cells = mkmap(createRng(seedRng(seed)), {
        width: 40,
        height: 15,
        smoothed: seed % 2 === 0,
        joined: false,
        walled: false,
      });
      expect(cells.every((k) => k === MK.BG || k === MK.FG)).toBe(true);
    }
  });

  test('is deterministic and refuses maps below the minimum', () => {
    const a = mkmap(createRng(seedRng(7)), { width: 80, height: 21, ...CAVE });
    const b = mkmap(createRng(seedRng(7)), { width: 80, height: 21, ...CAVE });
    expect(a).toEqual(b);
    expect(() =>
      mkmap(createRng(seedRng(1)), { width: MIN_MKMAP_WIDTH - 1, height: 21, ...CAVE }),
    ).toThrow(RangeError);
    expect(() =>
      mkmap(createRng(seedRng(1)), { width: 80, height: MIN_MKMAP_HEIGHT - 1, ...CAVE }),
    ).toThrow(RangeError);
  });
});

const MINES: LevelDef = {
  id: 'lv:mines',
  init: { style: 'mines', fg: 'nh:floor', smoothed: true, joined: true, walled: true },
};

describe('buildLevel with the mines style', () => {
  const opts = { id: 'x', depth: 3, width: 80, height: 21, terrain: VANILLA_TERRAIN };

  test('lays out a walled cave with up, down and branch stairs on open cells', () => {
    const lits = new Set<number>();
    for (let seed = 1; seed <= 20; seed++) {
      const branch = { to: { dungeon: 'lv:other' as const, dlevel: 1 }, dir: 'up' as const };
      const l = buildLevel(createRng(seedRng(seed)), { ...opts, branch }, MINES);
      expect(l.def).toBe('lv:mines');
      expect(l.rooms).toEqual([]);
      for (const k of ['tuwall', 'tdwall', 'tlwall', 'trwall', 'crwall'] as const)
        expect(l.palette).toContain(VANILLA_TERRAIN[k]);
      const id = (p: { x: number; y: number } | null): string | undefined =>
        p ? l.palette[l.cells[p.y * l.width + p.x] ?? -1] : undefined;
      expect(id(l.up)).toBe('nh:stairs_up');
      expect(id(l.down)).toBe('nh:stairs_down');
      expect(id(l.branch?.pos ?? null)).toBe('nh:stairs_up');
      const ids = new Set(l.cells.map((c) => l.palette[c]));
      expect(ids).toContain('nh:floor');
      expect(ids).toContain('nh:stone');
      expect(ids).not.toContain('nh:corr');
      // lit is a coin flip; when lit, floor and walls are lit and stone is not
      const stone = l.palette.indexOf('nh:stone');
      l.cells.forEach((c, i) => {
        if (c === stone) expect(l.lit[i]).toBe(0);
      });
      lits.add(Math.max(...l.lit));
      expect(levelToAscii(l)).not.toContain('?');
    }
    expect([...lits].sort()).toEqual([0, 1]);
  });

  test('lit and bg are honoured, and the minimum size works', () => {
    const def: LevelDef = {
      id: 'lv:m',
      init: { style: 'mines', fg: 'nh:floor', bg: 'lv:moss', joined: true, lit: true },
    };
    for (let seed = 1; seed <= 30; seed++) {
      const l = buildLevel(
        createRng(seedRng(seed)),
        { ...opts, width: MIN_MKMAP_WIDTH, height: MIN_MKMAP_HEIGHT },
        def,
      );
      const moss = l.palette.indexOf('lv:moss');
      expect(moss).toBeGreaterThan(0);
      l.cells.forEach((c, i) => expect(l.lit[i]).toBe(c === moss ? 0 : 1));
      expect(l.up).not.toBeNull();
      expect(l.down).not.toBeNull();
    }
  });

  test('a dungeon with a mines filler builds cave levels in the engine', () => {
    const mod: Mod = {
      id: 'lv',
      version: '1',
      register(api) {
        api.defineLevel(MINES);
        api.defineDungeon({ id: 'lv:main', nameKey: 'main', filler: 'lv:mines' });
      },
    };
    const engine = createEngine([terrainMod(), actionsMod(), mod]);
    const { state } = engine.newGame({ seed: 5, width: 80, height: 21 });
    const l = getLevel(state);
    expect(l.def).toBe('lv:mines');
    expect(l.up).not.toBeNull();
    expect(l.down).not.toBeNull();
  });
});

describe('mines LevelDef validation', () => {
  const load = (init: unknown): string[] => {
    try {
      loadMods([
        terrainMod(),
        {
          id: 'lv',
          version: '1',
          register: (api) => api.defineLevel({ id: 'lv:m', init } as LevelDef),
        },
      ]);
      return [];
    } catch (e) {
      if (!(e instanceof ModLoadError)) throw e;
      return e.issues.map((i) => `${i.path}: ${i.reason}`);
    }
  };

  test('reports bad fields and unknown terrains', () => {
    expect(load({ style: 'mines', fg: 'nh:floor', walled: true })).toEqual([]);
    expect(load({ style: 'mines', bg: 3, joined: 'yes', lit: 1 })).toEqual([
      'init.fg: must be a terrain id',
      'init.bg: must be a terrain id',
      'init.joined: must be a boolean',
      'init.lit: must be a boolean',
    ]);
    expect(load({ style: 'mines', fg: 'nh:floor', bg: 'lv:void' })).toEqual([
      "init.bg: unknown terrain 'lv:void'",
    ]);
  });
});
