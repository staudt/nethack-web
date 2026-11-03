// Milestone 6b1 step 2: LevelDef map blocks, regions, edits, doors, features, stairs and
// `inaccessibles` (core buildLevel), their coordinates and their validation.
import { describe, expect, test } from 'vitest';
import {
  buildLevel,
  mapBlock,
  VANILLA_TERRAIN,
  type GenOptions,
  type LevelTerrain,
} from '../src/levelgen/index';
import { ModLoadError, loadMods } from '../src/registry';
import { createRng, seedRng } from '../src/rng';
import type { Pos } from '../src/types/common';
import type { Level } from '../src/types/level';
import type { LevelDef, Mod, TerrainEdit } from '../src/types/mod';
import { terrainMod } from './helpers/fakeMods';

type Key = keyof LevelTerrain;
const KEY_OF = new Map(Object.entries(VANILLA_TERRAIN).map(([k, id]) => [id, k as Key]));
const opts = (width = 80, height = 21): GenOptions => ({
  id: 'x',
  depth: 5,
  width,
  height,
  terrain: VANILLA_TERRAIN,
});
const build = (def: LevelDef, seed = 1, o = opts()): Level =>
  buildLevel(createRng(seedRng(seed)), o, def);
const keyAt = (l: Level, x: number, y: number): Key | undefined =>
  KEY_OF.get(l.palette[l.cells[y * l.width + x] ?? -1] ?? 'nh:none');
/** The keys of a w x h window at x,y, row by row. */
const window = (l: Level, x: number, y: number, w: number, h: number): (Key | undefined)[][] =>
  Array.from({ length: h }, (_, j) => Array.from({ length: w }, (_, i) => keyAt(l, x + i, y + j)));

const STONE = { style: 'solidfill', fg: 'nh:stone', lit: false } as const;
const BOX = ['-----', '|...|', '|...+', '-----'];
const boxDef = (map: LevelDef['map'] & object, extra: Partial<LevelDef> = {}): LevelDef => ({
  id: 'mb:box',
  init: STONE,
  map,
  ...extra,
});

describe('map block placement', () => {
  const block = (w: number, h: number, m: Partial<NonNullable<LevelDef['map']>>, size = opts()) =>
    mapBlock(
      { id: 'mb:p', init: STONE, map: { rows: Array<string>(h).fill('.'.repeat(w)), ...m } },
      size.width,
      size.height,
    );

  test('aligns follow lspo_map(): odd NetHack starts, inside the level, at any size', () => {
    expect(block(10, 5, {})).toEqual({ x: 36, y: 9, w: 10, h: 5 });
    expect(block(10, 5, { halign: 'left', valign: 'top' })).toEqual({ x: 0, y: 3, w: 10, h: 5 });
    expect(block(10, 5, { halign: 'right', valign: 'bottom' })).toEqual({
      x: 68,
      y: 15,
      w: 10,
      h: 5,
    });
    expect(block(10, 5, {}, opts(120, 40))).toEqual({ x: 56, y: 17, w: 10, h: 5 });
    for (const size of [opts(), opts(120, 40), opts(41, 12)])
      for (const halign of ['left', 'half-left', 'center', 'half-right', 'right'] as const)
        for (const valign of ['top', 'center', 'bottom'] as const) {
          const b = block(10, 5, { halign, valign }, size);
          expect(b).not.toBeNull();
          if (!b) continue;
          expect(b.x).toBeGreaterThanOrEqual(0);
          expect(b.y).toBeGreaterThanOrEqual(0);
          expect(b.x + b.w).toBeLessThanOrEqual(size.width);
          expect(b.y + b.h).toBeLessThanOrEqual(size.height);
        }
    // left of center of left of right
    const xs = (['left', 'half-left', 'center', 'half-right', 'right'] as const).map(
      (halign) => block(10, 5, { halign }, opts(120, 40))?.x ?? -1,
    );
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });

  test('a block the size of the level covers it exactly, whatever the aligns', () => {
    for (const size of [opts(), opts(120, 40)])
      for (const halign of ['left', 'center', 'right'] as const)
        for (const valign of ['top', 'center', 'bottom'] as const)
          expect(block(size.width, size.height, { halign, valign }, size)).toEqual({
            x: 0,
            y: 0,
            w: size.width,
            h: size.height,
          });
  });

  test('x,y puts the top-left there; the cells land on the level', () => {
    const def = boxDef({ rows: BOX, x: 7, y: 2, lit: true });
    expect(mapBlock(def, 80, 21)).toEqual({ x: 7, y: 2, w: 5, h: 4 });
    for (const size of [opts(), opts(120, 40)]) {
      const l = build(def, 1, { ...size, up: false, down: false });
      expect(keyAt(l, 8, 3)).toBe('floor');
      expect(keyAt(l, 6, 3)).toBe('stone');
      expect(l.lit[3 * l.width + 8]).toBe(1); // the map's lit
      expect(l.lit[3 * l.width + 6]).toBe(0); // outside it: init's
    }
  });

  test("'x' keeps what init made", () => {
    const def: LevelDef = {
      id: 'mb:x',
      init: { style: 'solidfill', fg: 'nh:floor', lit: true },
      map: { rows: ['x x', ' x '], x: 0, y: 0 },
    };
    const l = build(def, 1, { ...opts(), up: false, down: false });
    expect(window(l, 0, 0, 3, 2)).toEqual([
      ['floor', 'stone', 'floor'],
      ['stone', 'floor', 'stone'],
    ]);
    expect([l.lit[0], l.lit[1]]).toEqual([1, 0]);
  });

  test('a block bigger than the level, or off it at x,y, throws a RangeError', () => {
    const def = boxDef({ rows: Array<string>(22).fill('.') });
    expect(() => build(def)).toThrow(RangeError);
    expect(() => build(def)).toThrow(
      /LevelDef 'mb:box': the 1x22 map does not fit the 80x21 level/,
    );
    const off = boxDef({ rows: BOX, x: 77, y: 0 });
    expect(() => build(off)).toThrow(/map at 77,0 does not fit the 80x21 level/);
  });
});

describe('walls, doors and features', () => {
  test('walls join up around and across a block; doors join walls', () => {
    const def = boxDef(
      { rows: ['-------', '|..|..|', '|..|..+', '-------'], x: 2, y: 2 },
      { doors: [{ x: 6, y: 2, state: 'open' }] },
    );
    const l = build(def, 1, { ...opts(), up: false, down: false });
    expect(window(l, 2, 2, 7, 4)).toEqual([
      ['tlcorn', 'hwall', 'hwall', 'tdwall', 'hwall', 'hwall', 'trcorn'],
      ['vwall', 'floor', 'floor', 'vwall', 'floor', 'floor', 'vwall'],
      ['vwall', 'floor', 'floor', 'vwall', 'floor', 'floor', 'door_open_v'],
      ['blcorn', 'hwall', 'hwall', 'tuwall', 'hwall', 'hwall', 'brcorn'],
    ]);
  });

  test('a wall with only rock around it becomes rock', () => {
    const l = build(boxDef({ rows: ['   ', ' - ', '   '], x: 4, y: 4 }), 1, {
      ...opts(),
      up: false,
      down: false,
    });
    expect(keyAt(l, 5, 5)).toBe('stone');
  });

  test('door states, random doors and orientation', () => {
    const rows = ['---+---', '|.....|', '+.....S', '|.....|', '-------'];
    const doors = (state: 'open' | 'closed' | 'locked' | 'nodoor' | 'broken' | 'random') => [
      { x: 3, y: 0, state },
      { x: 0, y: 2, state },
      { x: 6, y: 2, state },
    ];
    const at = (state: Parameters<typeof doors>[0], seed = 1) => {
      const l = build(boxDef({ rows, x: 0, y: 0 }, { doors: doors(state) }), seed, {
        ...opts(),
        up: false,
        down: false,
      });
      return [keyAt(l, 3, 0), keyAt(l, 0, 2), keyAt(l, 6, 2)];
    };
    expect(at('open')).toEqual(['door_open_h', 'door_open_v', 'sdoor_v']);
    expect(at('closed')).toEqual(['door_closed', 'door_closed', 'sdoor_v']);
    expect(at('locked')).toEqual(['door_locked', 'door_locked', 'sdoor_locked_v']);
    expect(at('nodoor')).toEqual(['doorway', 'doorway', 'sdoor_v']);
    expect(at('broken')).toEqual(['doorway', 'doorway', 'sdoor_v']);
    const seen = new Set<string | undefined>();
    for (let seed = 1; seed <= 40; seed++) seen.add(at('random', seed)[1]);
    expect([...seen].sort()).toEqual(['door_closed', 'door_locked', 'door_open_v', 'doorway']);
    // '+' with no doors entry is a doorway; a horizontal secret door
    const l = build(boxDef({ rows: ['--S--', '|...+', '-----'], x: 0, y: 0 }), 1, {
      ...opts(),
      up: false,
      down: false,
    });
    expect([keyAt(l, 2, 0), keyAt(l, 4, 1)]).toEqual(['sdoor_h', 'doorway']);
  });

  test('features at map spots, altars by alignment; nothing over another feature', () => {
    const def = boxDef(
      { rows: ['.....', '..{..'], x: 10, y: 5 },
      {
        features: [
          { kind: 'fountain', x: 0, y: 0 },
          { kind: 'sink', x: 1, y: 0 },
          { kind: 'tree', x: 2, y: 1 }, // on the map's fountain: nothing
          { kind: 'altar', x: 3, y: 0, align: 'chaotic', shrine: true },
          { kind: 'sink', x: 3, y: 0 }, // on the altar: nothing
          { kind: 'altar', x: 0, y: 1, align: 'noalign' },
          { kind: 'tree', x: -1, y: -1, coords: 'level' },
        ],
      },
    );
    const l = build(def, 1, { ...opts(), up: false, down: false });
    expect(window(l, 10, 5, 5, 2)).toEqual([
      ['fountain', 'sink', 'floor', 'altar_chaotic', 'floor'],
      ['altar_unaligned', 'floor', 'fountain', 'floor', 'floor'],
    ]);
    expect(keyAt(l, 79, 20)).toBe('tree');
    // feature terrains join the palette only when used
    expect(l.palette).not.toContain('nh:altar_lawful');
    const randoms = new Set<Key | undefined>();
    for (let seed = 1; seed <= 30; seed++) {
      const a = build(
        boxDef({ rows: ['.'], x: 0, y: 0 }, { features: [{ kind: 'altar', x: 0, y: 0 }] }),
        seed,
        { ...opts(), up: false, down: false },
      );
      randoms.add(keyAt(a, 0, 0));
    }
    expect([...randoms].sort()).toEqual(['altar_chaotic', 'altar_lawful', 'altar_neutral']);
  });

  test('edits: percent rolls pick set/then or else; lines, areas and spots', () => {
    const rows = ['.......', '.......', '.......'];
    const edits = (percent: number): TerrainEdit[] => [
      {
        percent,
        set: [{ char: '-', line: [0, 0, 6, 0] }],
        then: { set: [{ char: 'T', at: [3, 1] }] },
        else: { set: [{ char: ' ', area: [0, 1, 1, 2] }] },
      },
      { set: [{ char: '|', line: [6, 1, 6, 2] }] },
    ];
    const run = (percent: number) =>
      window(
        build(boxDef({ rows, x: 1, y: 1 }, { edits: edits(percent) }), 1, {
          ...opts(),
          up: false,
          down: false,
        }),
        1,
        1,
        7,
        3,
      );
    expect(run(100)).toEqual([
      ['hwall', 'hwall', 'hwall', 'hwall', 'hwall', 'hwall', 'trcorn'],
      ['floor', 'floor', 'floor', 'tree', 'floor', 'floor', 'vwall'],
      ['floor', 'floor', 'floor', 'floor', 'floor', 'floor', 'vwall'],
    ]);
    expect(run(0)).toEqual([
      ['floor', 'floor', 'floor', 'floor', 'floor', 'floor', 'floor'],
      ['stone', 'stone', 'floor', 'floor', 'floor', 'floor', 'vwall'],
      ['stone', 'stone', 'floor', 'floor', 'floor', 'floor', 'vwall'],
    ]);
  });
});

describe('regions', () => {
  test('a lit region lights its edge too; an unlit one darkens just its area', () => {
    const def: LevelDef = {
      id: 'mb:r',
      init: { style: 'solidfill', fg: 'nh:floor', lit: false },
      map: { rows: Array<string>(6).fill('.'.repeat(10)), x: 20, y: 5 },
      regions: [
        { area: [2, 2, 4, 3], lit: true },
        { area: [3, 3, 3, 3], lit: false },
      ],
    };
    const l = build(def, 1, { ...opts(), up: false, down: false });
    const litAt = (x: number, y: number) => l.lit[(5 + y) * l.width + 20 + x];
    const lit: string[] = [];
    for (let y = 0; y < 6; y++) {
      let row = '';
      for (let x = 0; x < 10; x++) row += String(litAt(x, y));
      lit.push(row);
    }
    expect(lit).toEqual([
      '0000000000',
      '0111110000',
      '0111110000',
      '0110110000',
      '0111110000',
      '0000000000',
    ]);
  });

  test('a typed region is a wall-less room; unlit rooms leave lighting alone', () => {
    const def: LevelDef = {
      id: 'mb:shop',
      init: STONE,
      map: { rows: ['-----', '|...|', '|...|', '-----'], x: 30, y: 8, lit: false },
      regions: [
        { area: [1, 1, 3, 2], lit: true, type: 'nh:tool_shop', filled: true },
        { area: [1, 1, 1, 1], lit: false, type: 'nh:temple' },
      ],
    };
    const l = build(def, 1, { ...opts(), up: false, down: false });
    expect(l.rooms).toEqual([
      { lx: 31, ly: 9, hx: 33, hy: 10, lit: true, type: 'nh:tool_shop', filled: true },
      { lx: 31, ly: 9, hx: 31, hy: 9, lit: false, type: 'nh:temple', filled: false },
    ]);
    for (let x = 30; x <= 34; x++)
      for (let y = 8; y <= 11; y++) expect(l.lit[y * l.width + x]).toBe(1);
    expect(keyAt(l, 30, 8)).toBe('tlcorn'); // no walls drawn over the map
    expect(l.lit[7 * l.width + 30]).toBe(0);
  });
});

describe('stairs', () => {
  const field = (stairs?: NonNullable<LevelDef['stairs']>): LevelDef => ({
    id: 'mb:st',
    init: STONE,
    map: { rows: Array<string>(10).fill('.'.repeat(30)), halign: 'center', valign: 'center' },
    ...(stairs ? { stairs } : {}),
  });

  test('in a region outside its exclusion, at 80x21 and 120x40', () => {
    for (const size of [opts(), opts(120, 40)])
      for (let seed = 1; seed <= 25; seed++) {
        const def = field({
          up: { region: [0, 0, 29, 9], exclude: [0, 0, 24, 9] },
          down: { region: [0, 0, 5, 9] },
        });
        const l = build(def, seed, size);
        const b = mapBlock(def, size.width, size.height);
        if (!b || !l.up || !l.down) throw new Error('missing');
        expect(l.up.x - b.x).toBeGreaterThanOrEqual(25);
        expect(l.up.x - b.x).toBeLessThanOrEqual(29);
        expect(l.down.x - b.x).toBeLessThanOrEqual(5);
        expect(keyAt(l, l.up.x, l.up.y)).toBe('stairs_up');
        expect(keyAt(l, l.down.x, l.down.y)).toBe('stairs_down');
      }
  });

  test('fixed spots; a level-coordinate region; random stairs stay in the block', () => {
    const l = build(
      field({
        up: { x: 2, y: 3 },
        down: { region: [-30, 0, -1, -1], coords: 'level', exclude: [0, 0, 24, 9] },
      }),
      3,
    );
    const b = mapBlock(field({}), 80, 21);
    expect(l.up).toEqual({ x: (b?.x ?? 0) + 2, y: (b?.y ?? 0) + 3 });
    // x 50..79 of the level, minus the block's columns 0..24: its last five columns
    expect(b?.x).toBe(26);
    expect(l.down?.x).toBeGreaterThanOrEqual(51);
    expect(l.down?.x).toBeLessThanOrEqual(55);
    for (let seed = 1; seed <= 20; seed++) {
      const r = build(field(), seed);
      for (const p of [r.up, r.down]) {
        expect(p?.x).toBeGreaterThanOrEqual(b?.x ?? 0);
        expect(p?.x).toBeLessThan((b?.x ?? 0) + 30);
      }
    }
  });

  test('a region with no floor left throws', () => {
    expect(() => build(field({ up: { region: [0, 0, 3, 3], exclude: [0, 0, 3, 3] } }))).toThrow(
      /no spot for stairs.up in its region/,
    );
  });
});

describe('inaccessibles', () => {
  /** Cells reachable from `from` as ensure_way_out() floods (diagonals, through secret doors). */
  const reach = (l: Level, from: Pos): Set<number> => {
    const solid = new Set<Key | undefined>([
      'stone',
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
      'tree',
    ]);
    const seen = new Set([from.y * l.width + from.x]);
    const stack = [from.y * l.width + from.x];
    while (stack.length) {
      const c = stack.pop() ?? 0;
      const x = c % l.width;
      const y = Math.floor(c / l.width);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          const j = ny * l.width + nx;
          if (nx < 0 || ny < 0 || nx >= l.width || ny >= l.height || seen.has(j)) continue;
          if (solid.has(keyAt(l, nx, ny))) continue;
          seen.add(j);
          stack.push(j);
        }
    }
    return seen;
  };
  const open = (l: Level): number[] =>
    l.cells.flatMap((_, i) => {
      const k = keyAt(l, i % l.width, Math.floor(i / l.width));
      return k &&
        !['stone', 'scorr', 'tree'].includes(k) &&
        !k.includes('wall') &&
        !k.includes('corn') &&
        !k.startsWith('sdoor')
        ? [i]
        : [];
    });
  const rows = [
    '-----   -----        ',
    '|...|   |...|  ----- ',
    '|...|----...|  |...| ',
    '|...||..|...|  |...| ',
    '-----------------...|',
    '               ----- ',
  ];
  const def = (inaccessibles: boolean): LevelDef => ({
    id: 'mb:in',
    init: STONE,
    map: { rows, x: 3, y: 3 },
    stairs: { up: { x: 2, y: 2 }, down: { x: 10, y: 2 } },
    flags: { inaccessibles },
  });

  test('every open area is joined to the stairs', () => {
    const closed = build(def(false), 1);
    expect(reach(closed, closed.up ?? { x: 0, y: 0 }).size).toBeLessThan(open(closed).length);
    for (const size of [opts(), opts(120, 40)])
      for (let seed = 1; seed <= 15; seed++) {
        const l = build(def(true), seed, size);
        const r = reach(l, l.up ?? { x: 0, y: 0 });
        expect(open(l).filter((i) => !r.has(i))).toEqual([]);
        expect(r.has((l.down?.y ?? 0) * l.width + (l.down?.x ?? 0))).toBe(true);
      }
  });
});

describe('validation', () => {
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

  test('a full valid LevelDef loads', () => {
    const ok: LevelDef = {
      id: 'lv:ok',
      init: STONE,
      map: { rows: BOX, halign: 'left', valign: 'top', lit: true },
      regions: [{ area: [1, 1, 3, 2], lit: true, type: 'nh:temple', filled: false }],
      edits: [{ percent: 50, set: [{ char: '.', at: [4, 2] }], else: { set: [] } }],
      doors: [{ x: 4, y: 2, state: 'random' }],
      features: [{ kind: 'altar', x: 2, y: 1, align: 'random', shrine: true }],
      stairs: {
        up: { region: [-10, 0, -1, -1], coords: 'level', exclude: [0, 0, 4, 3] },
        down: { x: 1, y: 1 },
      },
      flags: { inaccessibles: true },
      contents: [
        { kind: 'object', x: 3, y: 2 },
        { kind: 'trap', x: -1, y: -1, coords: 'level' },
      ],
    };
    expect(issues(ok)).toEqual([]);
  });

  test('bad map characters, rows, aligns and spots are reported with their paths', () => {
    const bad = {
      id: 'lv:bad',
      init: STONE,
      map: { rows: ['..Q.', '...'], halign: 'middle', x: 1 },
      regions: [{ area: [0, 0, 9, 1] }, { area: [3, 1, 1, 0] }, { area: [0, 0], filled: true }],
      edits: [{ set: [{ char: 'x', at: [0, 0], line: [0, 0, 1, 0] }] }, { else: {} }],
      doors: [{ x: 4, y: 0, state: 'ajar' }],
      features: [{ kind: 'throne', x: 0, y: 0, align: 'lawful' }],
      stairs: {
        up: { x: 1, y: 1, region: [0, 0, 1, 1] },
        down: { region: [0, 0, 1, 1], exclude: [0, 0, 1, 1], excludeCoords: 'world' },
      },
      flags: { inaccessibles: 'yes' },
      contents: [{ kind: 'object', x: 9, y: 0 }],
    };
    expect(issues(bad)).toEqual([
      "map.rows[0]: unknown map character 'Q' at column 2 (use ' ' . # - | + S H { K T x)",
      'map.rows[1]: is 3 wide; every row must be 4 wide',
      'map.halign: must be one of left, half-left, center, half-right, right',
      'map.y: give both x and y, or neither',
      'map.x: give x,y or halign/valign, not both',
      "regions[0].area: 9,1 is outside the 4x2 map (map coordinates run from 0,0; use coords: 'level' for Level coordinates)",
      'regions[1].area: x1,y1 must be the top-left corner and x2,y2 the bottom-right',
      'regions[2].area: must be [x1, y1, x2, y2] integers',
      'regions[2].filled: only a typed region (a room) can be filled',
      "edits[0].set[0].char: must be one map character (' ' . # - | + S H { K T)",
      'edits[0].set[0]: give exactly one of at, line, area',
      'edits[1].else: needs a percent',
      "doors[0]: 4,0 is outside the 4x2 map (map coordinates run from 0,0; use coords: 'level' for Level coordinates)",
      'doors[0].state: must be one of open, closed, locked, nodoor, broken, random',
      'features[0].kind: must be one of fountain, sink, tree, altar',
      'features[0]: only an altar has align and shrine',
      'stairs.up: give x,y or region, not both',
      "stairs.down.excludeCoords: must be 'map' or 'level'",
      'flags.inaccessibles: must be a boolean',
      "contents[0]: 9,0 is outside the 4x2 map (map coordinates run from 0,0; use coords: 'level' for Level coordinates)",
    ]);
    expect(
      issues({
        id: 'lv:nomap',
        init: STONE,
        doors: [{ x: 1, y: 1, state: 'open', coords: 'map' }],
      }),
    ).toEqual(["doors[0].coords: 'map' needs a map block in the LevelDef"]);
  });

  test('level coordinates outside the level throw when the level is built', () => {
    const def: LevelDef = {
      id: 'lv:far',
      init: { style: 'solidfill', fg: 'nh:floor' },
      features: [{ kind: 'tree', x: 90, y: 1 }],
    };
    expect(() => build(def)).toThrow(
      /LevelDef 'lv:far': features\[0\] at 90,1 is outside the 80x21 level/,
    );
  });
});

describe('the ARCHITECTURE.md example', () => {
  const hamlet: LevelDef = {
    id: 'mymod:hamlet',
    init: { style: 'solidfill', fg: 'nh:floor', lit: true },
    map: { rows: ['---------', '|...|...|', '|...+...+', '---------'] },
    regions: [{ area: [1, 1, 3, 2], lit: true, type: 'nh:tool_shop' }],
    doors: [
      { x: 4, y: 2, state: 'closed' },
      { x: 8, y: 2, state: 'random' },
    ],
    features: [{ kind: 'fountain', x: 6, y: 1 }],
    stairs: { down: { region: [-6, 0, -1, -1], coords: 'level' } },
  };

  test('builds at 80x21 and 120x40 with the shop, door, fountain and stairs where it says', () => {
    for (const size of [opts(), opts(120, 40)]) {
      const l = build(hamlet, 2, size);
      const b = mapBlock(hamlet, size.width, size.height);
      if (!b) throw new Error('no block');
      expect(l.rooms[0]).toMatchObject({ lx: b.x + 1, ly: b.y + 1, type: 'nh:tool_shop' });
      expect(keyAt(l, b.x + 4, b.y + 2)).toBe('door_closed');
      expect(keyAt(l, b.x + 6, b.y + 1)).toBe('fountain');
      expect(l.down?.x).toBeGreaterThanOrEqual(size.width - 6);
    }
  });
});
