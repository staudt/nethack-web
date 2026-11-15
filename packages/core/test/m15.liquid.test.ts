// m15 step 1: liquid terrain in core. `TerrainDef.liquid` keeps traps off water and lava, keeps
// travel paths out of remembered liquid, hides objects and traps in it; the map legend makes
// NetHack's liquid and furniture characters, and walls join walls of water, lava and iron bars.
// ref: src/nhlua.c char2typ[]; src/mkmaze.c iswall(); src/mklev.c mktrap();
// src/hack.c test_move() TEST_TRAV; include/display.h covers_objects()
import { describe, expect, test } from 'vitest';
import { buildLevel, VANILLA_TERRAIN, type LevelTerrain } from '../src/levelgen/index';
import { cellRules } from '../src/movement';
import { findPath } from '../src/path';
import { loadMods } from '../src/registry';
import { createRng, seedRng } from '../src/rng';
import { coversObjects, isPlainFloor, placeTrapOn } from '../src/traps';
import type { DefId } from '../src/types/common';
import type { Level } from '../src/types/level';
import type { LevelDef, Mod } from '../src/types/mod';
import { terrainMod } from './helpers/fakeMods';

type Key = keyof LevelTerrain;
const KEY_OF = new Map(Object.entries(VANILLA_TERRAIN).map(([k, id]) => [id, k as Key]));
const trapMod: Mod = {
  id: 'tp',
  version: '1',
  register(api) {
    api.defineTrap({ id: 'tp:pit', nameKey: 'pit', glyph: { ch: '^', fg: '#fff' } });
  },
};
const registry = loadMods([terrainMod(), trapMod]);
const build = (rows: string[]): Level =>
  buildLevel(
    createRng(seedRng(1)),
    { id: 'x', depth: 5, width: 20, height: 9, terrain: VANILLA_TERRAIN },
    {
      id: 'lq:map',
      init: { style: 'solidfill', fg: 'nh:stone', lit: true },
      map: { rows, x: 2, y: 2 },
    } as LevelDef,
  );
const keyAt = (l: Level, x: number, y: number): Key | undefined =>
  KEY_OF.get(l.palette[l.cells[y * l.width + x] ?? -1] ?? ('nh:none' as DefId));

describe('the map legend', () => {
  test('P } W L Z I C \\ F make pool, moat, water, lava, lava wall, ice, cloud, throne, bars', () => {
    const l = build(['|.PWLZ.|', '|.}IC\\F|', '|......|']);
    expect([4, 5, 6, 7].map((x) => keyAt(l, x, 2))).toEqual(['pool', 'water', 'lava', 'lavawall']);
    expect([4, 5, 6, 7, 8].map((x) => keyAt(l, x, 3))).toEqual([
      'moat',
      'ice',
      'cloud',
      'throne',
      'iron_bars',
    ]);
  });

  test('walls join walls of water, lava walls and iron bars (iswall())', () => {
    // a wall with one of them above and below turns into a vertical wall joining them
    const l = build(['.W.Z.F.', '.-.-.-.', '.W.Z.F.']);
    expect([3, 5, 7].map((x) => keyAt(l, x, 3))).toEqual(['vwall', 'vwall', 'vwall']);
    expect([3, 5, 7].map((x) => keyAt(l, x, 2))).toEqual(['water', 'lavawall', 'iron_bars']);
  });
});

describe('liquid cells', () => {
  const l = build(['.....', '.P.L.', '.....']);
  const pool = { x: 3, y: 3 };
  const lava = { x: 5, y: 3 };

  test('no trap goes on water or lava (mktrap())', () => {
    expect(isPlainFloor(registry, l, pool.x, pool.y)).toBe(false);
    expect(isPlainFloor(registry, l, lava.x, lava.y)).toBe(false);
    expect(isPlainFloor(registry, l, 2, 2)).toBe(true);
    expect(() => placeTrapOn(registry, l, { def: 'tp:pit', ...pool, seen: false })).toThrow(
      /not plain floor/,
    );
  });

  test('a liquid covers what lies in it (covers_objects())', () => {
    expect(coversObjects(registry, l, pool.y * l.width + pool.x)).toBe(true);
    expect(coversObjects(registry, l, lava.y * l.width + lava.x)).toBe(true);
    expect(coversObjects(registry, l, 2 * l.width + 2)).toBe(false);
  });

  test('travel paths go around remembered water but may end in it', () => {
    // a row of water between the hero and her goal, open at the bottom
    const w = build(['..P..', '..P..', '.....']);
    const rules = cellRules(w, registry);
    const path = findPath(w, rules, w.cells, { x: 2, y: 2 }, { x: 6, y: 2 });
    expect(path).not.toBeNull();
    const wet = (p: { x: number; y: number }): boolean =>
      rules.liquid[w.cells[p.y * w.width + p.x] ?? 0] !== null;
    expect(path?.some(wet)).toBe(false);
    expect(path?.at(-1)).toEqual({ x: 6, y: 2 });
    const into = findPath(w, rules, w.cells, { x: 3, y: 2 }, { x: 4, y: 2 });
    expect(into).toEqual([{ x: 4, y: 2 }]);
  });
});

describe('validation', () => {
  test("a liquid must be 'water' or 'lava'", () => {
    const bad: Mod = {
      id: 'bd',
      version: '1',
      register(api) {
        api.defineTerrain({
          id: 'bd:goo',
          nameKey: 'goo',
          passable: true,
          opaque: false,
          liquid: 'goo' as never,
          glyph: { ch: '}', fg: '#fff' },
        });
      },
    };
    expect(() => loadMods([bad])).toThrow(/liquid: must be 'water' or 'lava'/);
  });
});
