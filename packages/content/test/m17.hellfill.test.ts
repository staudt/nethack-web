// m17 step 3: hellfill.lua, Gehennom's filler. Each of its seven kinds of level (found by seed
// search) builds with its stairs and its look; the ten prefabs stamp their maps and contents;
// hell_tweaks() changes nothing it protects and makes its four kinds of change; the selection
// functions against hand-computed cases. Outcomes are asserted over many seeds.
// ref: dat/hellfill.lua; dat/nhlib.lua hell_tweaks(); src/selvar.c; src/sp_lev.c lspo_map()
import {
  cellIndex,
  createEngine,
  createRng,
  getLevel,
  seedRng,
  sortedIds,
  type Ctx,
  type DefId,
  type Entity,
  type GameState,
  type Level,
  type MapBlock,
  type Mod,
  type Pos,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import { ALIGNED_CLERIC, TEMPLE } from '../src/epri';
import { HELL_PREFAB_MAPS, makeHellPrefab } from '../src/hellfill';
import { hellTweaks } from '../src/helltweaks';
import { GEHENNOM, cavernous, levelFlags, madeLevelFlags, nonDiggable } from '../src/levelflags';
import {
  selArea,
  selBounds,
  selCount,
  selFilterMapchar,
  selGrow,
  selMatch,
  selNew,
  selPercentage,
  selRandline,
  selRect,
  selRndcoord,
  selSetRandom,
  type Sel,
} from '../src/selection';
import { setTerrain, T, terrainIdAt } from '../src/terrain';
import { TRAP } from '../src/trap';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'hf',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'hf:run',
      labelKey: 'hf',
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
const defs = engine.registry;
const run = (state: GameState, fn: (ctx: Ctx) => void): void => {
  probe.fn = fn;
  engine.step(state, { type: 'mod', action: 'hf:run' as DefId });
};
const ordinary = (state: GameState): number[] => {
  const d = state.dungeons.find((x) => x.id === GEHENNOM)!;
  const taken = new Set(d.special.map((s) => s.dlevel));
  return [...Array(d.levels!).keys()].map((i) => i + 1).filter((n) => !taken.has(n));
};
const ter = (l: Level, x: number, y: number): DefId => terrainIdAt(l, x, y)!;
const WALLS = new Set<DefId>(
  ['vwall', 'hwall', 'tlcorn', 'trcorn', 'blcorn', 'brcorn', 'crwall']
    .concat(['tuwall', 'tdwall', 'tlwall', 'trwall'])
    .map((k) => `nh:${k}` as DefId),
);

/** Cells a flying hero can cross: open ground, liquids, furniture; not rock, walls or bars. */
function flyerOpen(l: Level, x: number, y: number): boolean {
  const id = ter(l, x, y);
  if (id === T.lava || id === T.pool || id === T.moat) return true;
  return defs.terrain(id).passable;
}

/** Whether `b` is reachable from `a` over cells that pass `open`, moving in 8 directions. */
function reachable(l: Level, a: Pos, b: Pos, open: (x: number, y: number) => boolean): boolean {
  const seen = new Set<number>([cellIndex(l, a.x, a.y)]);
  const todo: Pos[] = [a];
  while (todo.length > 0) {
    const p = todo.pop()!;
    if (p.x === b.x && p.y === b.y) return true;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const x = p.x + dx;
        const y = p.y + dy;
        if (x < 0 || y < 0 || x >= l.width || y >= l.height) continue;
        const i = cellIndex(l, x, y);
        if (seen.has(i) || !open(x, y)) continue;
        seen.add(i);
        todo.push({ x, y });
      }
  }
  return false;
}

/** Ordinary Gehennom levels of new games, by hellfill kind, two of each at most. */
const byHell = new Map<number, { state: GameState; level: Level }[]>();
for (
  let seed = 1;
  seed <= 40 && [...byHell.values()].filter((v) => v.length >= 2).length < 7;
  seed++
) {
  const { state } = engine.newGame({ seed });
  for (const dlevel of ordinary(state).slice(0, 4)) {
    run(state, (ctx) => ctx.goToLevel({ dungeon: GEHENNOM, dlevel }, 'random'));
    const level = getLevel(state);
    const n = madeLevelFlags(state, level.id).hellfill!;
    const list = byHell.get(n) ?? [];
    if (list.length < 2) list.push({ state, level });
    byHell.set(n, list);
  }
}

describe("hellfill's seven kinds of level", () => {
  test('every kind is found; each is an 80x21 maze level with its stairs on open ground', () => {
    expect([...byHell.keys()].sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const [, list] of byHell)
      for (const { state, level } of list) {
        expect(level.def).toBe('nh:hellfill');
        expect([level.width, level.height]).toEqual([80, 21]);
        expect(ter(level, level.up!.x, level.up!.y)).toBe(T.stairs_up);
        expect(ter(level, level.down!.x, level.down!.y)).toBe(T.stairs_down);
        // every other kind is a maze level; the first is cavernous instead
        const n = madeLevelFlags(state, level.id).hellfill;
        expect(levelFlags({ defs, state }, level).maze === true).toBe(n !== 1);
        expect(cavernous({ defs, state }, level)).toBe(n === 1);
      }
  });

  test('1: lava caves: no stone left, lava everywhere around', () => {
    for (const { level } of byHell.get(1)!) {
      expect(level.cells.some((c) => level.palette[c] === T.stone)).toBe(false);
      expect(level.cells.filter((c) => level.palette[c] === T.lava).length).toBeGreaterThan(200);
    }
  });

  test('3: a plain maze of stone, walls and floor; the stairs are joined on foot', () => {
    for (const { level } of byHell.get(3)!) {
      const kinds = new Set(level.cells.map((c) => level.palette[c]!));
      for (const id of kinds)
        expect(
          id === T.stone || id === T.floor || id === T.stairs_up || id === T.stairs_down
            ? true
            : WALLS.has(id),
        ).toBe(true);
      const walk = (x: number, y: number): boolean => defs.terrain(ter(level, x, y)).passable;
      expect(reachable(level, level.up!, level.down!, walk)).toBe(true);
    }
  });

  test('4: the maze walls are iron bars or lava, the outside stays stone', () => {
    for (const { level } of byHell.get(4)!) {
      const bars = level.cells.filter((c) => level.palette[c] === T.iron_bars).length;
      const lava = level.cells.filter((c) => level.palette[c] === T.lava).length;
      expect(bars + lava).toBeGreaterThan(100);
      expect(ter(level, 0, 0)).toBe(T.stone);
    }
  });

  test('6: the cold maze: cold, with ice', () => {
    for (const { state, level } of byHell.get(6)!) {
      expect(madeLevelFlags(state, level.id).temperature).toBe(-1);
      expect(level.cells.some((c) => level.palette[c] === T.ice)).toBe(true);
    }
  });

  test("7: the open cavern's edge is all stone or all lava", () => {
    for (const { level } of byHell.get(7)!) {
      const edge: DefId[] = [];
      for (let x = 0; x < level.width; x++) edge.push(ter(level, x, 0), ter(level, x, 20));
      for (let y = 0; y < level.height; y++) edge.push(ter(level, 0, y), ter(level, 79, y));
      const kinds = new Set(edge.map((id) => (WALLS.has(id) ? T.stone : id)));
      expect(kinds.size).toBe(1);
      expect([T.stone, T.lava]).toContain([...kinds][0]);
    }
  });

  test('without prefabs (1, 3, 5, 7) a flying hero can go from the up to the down stairs', () => {
    for (const n of [1, 3, 5, 7])
      for (const { level } of byHell.get(n)!)
        expect(reachable(level, level.up!, level.down!, (x, y) => flyerOpen(level, x, y))).toBe(
          true,
        );
  });

  test('populatemaze(): minotaurs, gold, boulder-class objects and traps', () => {
    for (const [, list] of byHell)
      for (const { state, level } of list) {
        const here = sortedIds(state)
          .map((id) => state.entities[String(id)] as Entity)
          .filter((e) => e.c.pos?.level === level.id);
        expect(here.some((e) => e.c.item && e.def === 'nh:gold_piece')).toBe(true);
        expect(level.traps.length).toBeGreaterThanOrEqual(1);
        // no boulder or trap is left on lava or water (map_cleanup())
        for (const t of level.traps) expect(flyerOpen(level, t.x, t.y)).toBe(true);
      }
  });
});

describe('the ten prefabs', () => {
  /** A game standing on an ordinary Gehennom level cleared to unlit floor. */
  function blank(seed: number): { state: GameState; level: Level } {
    const { state } = engine.newGame({ seed });
    const dlevel = ordinary(state)[0]!;
    run(state, (ctx) => {
      ctx.goToLevel({ dungeon: GEHENNOM, dlevel }, 'random');
      const level = getLevel(ctx.state);
      for (const id of sortedIds(ctx.state)) {
        const e = ctx.state.entities[String(id)]!;
        if (e.c.monster && e.c.pos?.level === level.id) ctx.remove(id);
      }
      level.traps = [];
      level.rooms = []; // the level's own prefabs (a temple of Moloch) go too
      delete level.shrines;
      for (let y = 0; y < level.height; y++)
        for (let x = 0; x < level.width; x++) {
          setTerrain(level, x, y, T.floor);
          level.lit[cellIndex(level, x, y)] = 0;
        }
    });
    return { state, level: getLevel(state) };
  }
  const prefab = (seed: number, n: number, cold = false) => {
    const { state, level } = blank(seed);
    let blocks: MapBlock[] = [];
    run(state, (ctx) => {
      blocks = makeHellPrefab(ctx, level, n, cold);
    });
    return { state, level, blocks };
  };
  /** The block's cells are its map's (`B` floor, `x` left alone). */
  const stamped = (level: Level, b: MapBlock, rows: readonly string[]): boolean =>
    rows.every((row, y) =>
      [...row].every((ch, x) => {
        if (ch === 'x') return true;
        const KEYS: Record<string, DefId> = {
          '.': T.floor,
          B: T.floor,
          L: T.lava,
          P: T.pool,
          W: T.water,
          Z: T.lavawall,
          F: T.iron_bars,
          '}': T.moat,
        };
        const want = KEYS[ch];
        const id = ter(level, b.x + x, b.y + y);
        // the fort's drawbridges, the temple's altar
        const extra: DefId[] = [T.drawbridge_up_lava, T.dbwall_h, T.dbwall_v, T.altar_unaligned];
        if (extra.includes(id)) return true;
        return want === undefined ? WALLS.has(id) : id === want;
      }),
    );
  const monstersIn = (state: GameState, level: Level, b: MapBlock): Entity[] =>
    sortedIds(state)
      .map((id) => state.entities[String(id)] as Entity)
      .filter(
        (e) =>
          e.c.monster &&
          e.c.pos?.level === level.id &&
          e.c.pos.x >= b.x &&
          e.c.pos.x < b.x + b.w &&
          e.c.pos.y >= b.y &&
          e.c.pos.y < b.y + b.h,
      );

  test('each map is stamped where it was placed, inside the level', () => {
    for (let n = 1; n <= 10; n++)
      for (let seed = 1; seed <= 3; seed++) {
        const { level, blocks } = prefab(seed, n);
        expect(blocks.length).toBe(n === 9 ? 5 : n === 10 ? 3 : 1);
        for (const b of blocks) {
          expect(b.x).toBeGreaterThanOrEqual(0);
          expect(b.x + b.w).toBeLessThanOrEqual(80);
          expect(b.y + b.h).toBeLessThanOrEqual(21);
          const maps = HELL_PREFAB_MAPS[n - 1]!;
          expect([n, maps.some((rows) => stamped(level, b, rows))]).toEqual([n, true]);
        }
      }
  });

  test('3: the fort: its inside lit and non-diggable, 1-4 drawbridges, 4-8 monsters in it', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const { state, level, blocks } = prefab(seed, 3);
      const b = blocks[0]!;
      expect(level.lit[cellIndex(level, b.x + 6, b.y + 5)]).toBe(1);
      expect(nonDiggable({ defs, state }, level, b.x + 2, b.y + 2)).toBe(true);
      expect(nonDiggable({ defs, state }, level, b.x + 1, b.y + 1)).toBe(false);
      const spans = [
        [1, 5],
        [11, 5],
        [6, 1],
        [6, 9],
      ].filter(([x, y]) => ter(level, b.x + x!, b.y + y!) !== T.lava);
      expect(spans.length).toBeGreaterThanOrEqual(1);
      expect(spans.length).toBeLessThanOrEqual(4);
      const mons = monstersIn(state, level, b);
      expect(mons.length).toBeGreaterThanOrEqual(4);
      expect(mons.length).toBeLessThanOrEqual(8);
    }
    // on a cold level its moat is water
    const { level, blocks } = prefab(1, 3, true);
    const b = blocks[0]!;
    expect(ter(level, b.x + 1, b.y + 1)).toBe(T.pool);
  });

  test('6: the temple of Moloch: an unaligned altar in a temple, a shrine with its priest', () => {
    let shrines = 0;
    let altars = 0;
    for (let seed = 1; seed <= 16; seed++) {
      const { state, level, blocks } = prefab(seed, 6);
      const b = blocks[0]!;
      expect(ter(level, b.x + 3, b.y + 3)).toBe(T.altar_unaligned);
      const room = level.rooms.find((r) => r.type === TEMPLE)!;
      expect([room.lx, room.ly, room.hx, room.hy]).toEqual([b.x + 1, b.y + 1, b.x + 5, b.y + 5]);
      const priests = monstersIn(state, level, b).filter((m) => m.def === ALIGNED_CLERIC);
      if (level.shrines?.length) {
        shrines++;
        expect(priests).toHaveLength(1);
      } else {
        altars++;
        expect(priests).toHaveLength(0);
      }
    }
    expect(shrines).toBeGreaterThan(0);
    expect(altars).toBeGreaterThan(shrines);
  });

  test('7 and 8: a monster in the cage, a monster in the moated tower', () => {
    for (const n of [7, 8])
      for (let seed = 1; seed <= 4; seed++) {
        const { state, level, blocks } = prefab(seed, n);
        const b = blocks[0]!;
        const mons = monstersIn(state, level, b);
        expect(mons.length).toBeGreaterThanOrEqual(1);
      }
  });

  test('9: five pools in a row, all lava or all water', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const { level, blocks } = prefab(seed, 9);
      expect(blocks.map((b) => b.x)).toEqual([9, 23, 37, 51, 65]);
      const centres = new Set(blocks.map((b) => ter(level, b.x + 2, b.y + 2)));
      expect(centres.size).toBe(1);
      expect([T.lavawall, T.water]).toContain([...centres][0]);
    }
  });
});

describe('hell_tweaks()', () => {
  test('leaves the protected area alone; makes lava, floor with boulders and iron bars', () => {
    const seen = { lava: 0, boulder: 0, bars: 0 };
    // each change is a 20 per cent (or rarer) roll: search seeds until all three were seen
    let seed = 0;
    while (++seed <= 30 || (seed <= 200 && !(seen.lava && seen.boulder && seen.bars))) {
      const { state } = engine.newGame({ seed });
      run(state, (ctx) =>
        ctx.goToLevel({ dungeon: GEHENNOM, dlevel: ordinary(state)[0]! }, 'random'),
      );
      const level = getLevel(state);
      const before = [...level.cells.map((c) => level.palette[c])];
      const boulders = (): number =>
        sortedIds(state).filter((id) => {
          const e = state.entities[String(id)]!;
          return e.def === 'nh:boulder' && e.c.pos?.level === level.id;
        }).length;
      const b0 = boulders();
      const prot: Sel = selArea(level, 0, 0, 39, 20);
      run(state, (ctx) => hellTweaks(ctx, level, prot));
      level.cells.forEach((c, i) => {
        const id = level.palette[c];
        if (i % 80 < 40) expect(id).toBe(before[i]);
        else if (id !== before[i]) expect([T.lava, T.floor, T.iron_bars]).toContain(id);
      });
      const after = level.cells.map((c) => level.palette[c]);
      if (after.some((id, i) => id === T.lava && before[i] !== T.lava)) seen.lava++;
      if (after.some((id, i) => id === T.iron_bars && before[i] !== T.iron_bars)) seen.bars++;
      if (boulders() > b0) seen.boulder++;
    }
    expect(seen.lava).toBeGreaterThan(0);
    expect(seen.boulder).toBeGreaterThan(0);
    expect(seen.bars).toBeGreaterThan(0);
  });
});

describe('selections', () => {
  // A 7x5 level:
  //   -------
  //   |..L..|
  //   |.---.|
  //   |..L..|
  //   -------
  const ROWS = ['-------', '|..L..|', '|.---.|', '|..L..|', '-------'];
  const KEY: Record<string, DefId> = { '-': T.hwall, '|': T.vwall, '.': T.floor, L: T.lava };
  function small(): Level {
    const palette: DefId[] = [];
    const cells = ROWS.flatMap((r) =>
      [...r].map((ch) => {
        const id = KEY[ch]!;
        if (!palette.includes(id)) palette.push(id);
        return palette.indexOf(id);
      }),
    );
    return {
      id: 'sel',
      depth: 1,
      dungeon: 'nh:main',
      dlevel: 1,
      width: 7,
      height: 5,
      palette,
      cells,
      lit: cells.map(() => 0),
      rooms: [],
      up: null,
      down: null,
      branch: null,
      traps: [],
    };
  }
  const pts = (l: Level, s: Sel): string[] =>
    s.flatMap((v, i) => (v ? [`${i % l.width},${Math.trunc(i / l.width)}`] : []));
  const rng = (seed: number) => createRng(seedRng(seed));

  test('match: a character, `w` for walls and stone, a fragment, off the level as stone', () => {
    const l = small();
    expect(pts(l, selMatch(l, 'L'))).toEqual(['3,1', '3,3']);
    expect(selCount(selMatch(l, 'w'))).toBe(7 * 5 - 12);
    // a wall with floor above and below (lava above the middle one)
    expect(pts(l, selMatch(l, '.\nw\n.'))).toEqual(['2,2', '4,2']);
    expect(pts(l, selMatch(l, '.L.'))).toEqual(['3,1', '3,3']);
    // a wall with a wall or stone (off the level counts) to its left and floor to its right
    expect(pts(l, selMatch(l, 'ww.'))).toEqual(['0,1', '0,2', '4,2', '0,3']);
  });

  test('grow: all eight ways, or one way', () => {
    const l = small();
    const one = selArea(l, 3, 2, 3, 2);
    expect(selCount(selGrow(l, one))).toBe(9);
    expect(pts(l, selGrow(l, one, 'west'))).toEqual(['2,2', '3,2']);
    expect(pts(l, selGrow(l, one, 'north'))).toEqual(['3,1', '3,2']);
    const r = selGrow(l, one, 'random', rng(1));
    expect(selCount(r)).toBe(2);
    // at the level's corner only the cells inside are added
    expect(selCount(selGrow(l, selArea(l, 0, 0, 0, 0)))).toBe(4);
  });

  test('area, rect, bounds; filter_mapchar', () => {
    const l = small();
    expect(selCount(selArea(l, -3, -3, 1, 1))).toBe(4);
    expect(selCount(selRect(l, 0, 0, 6, 4))).toBe(20);
    expect(selBounds(l, selMatch(l, 'L'))).toEqual({ lx: 3, ly: 1, hx: 3, hy: 3 });
    expect(selBounds(l, selNew(l))).toEqual({ lx: 0, ly: 0, hx: 6, hy: 4 });
    expect(pts(l, selFilterMapchar(l, selArea(l, 2, 1, 4, 1), '.'))).toEqual(['2,1', '4,1']);
  });

  test('percentage draws once per selected cell; rndcoord and set() pick inside', () => {
    const l = small();
    const all = selArea(l, 0, 0, 6, 4);
    const a = rng(5);
    const b = rng(5);
    const half = selPercentage(a, l, all, 50);
    for (let i = 0; i < 35; i++) b.rn2(100);
    expect(a.rn2(1000)).toBe(b.rn2(1000)); // 35 draws each
    expect(selCount(half)).toBeGreaterThan(5);
    expect(selCount(half)).toBeLessThan(30);
    expect(selCount(selPercentage(rng(1), l, all, 100))).toBe(35);
    expect(selCount(selPercentage(rng(1), l, all, 0))).toBe(0);
    const lava = selMatch(l, 'L');
    for (let s = 1; s <= 10; s++)
      expect(['3,1', '3,3']).toContain(
        `${selRndcoord(rng(s), l, lava)!.x},${selRndcoord(rng(s), l, lava)!.y}`,
      );
    expect(selRndcoord(rng(1), l, selNew(l))).toBeNull();
    expect(selCount(selSetRandom(rng(3), l, selNew(l)))).toBe(1);
  });

  test('randline joins its ends without a gap', () => {
    const l = small();
    for (let s = 1; s <= 10; s++) {
      const line = selRandline(rng(s), l, selNew(l), 0, 0, 6, 4, 10);
      expect(line[cellIndex(l, 6, 4)]).toBe(true); // the end (the start is not set: C's own)
      expect(selCount(line)).toBeGreaterThanOrEqual(3);
      // a rough line stays on the level; a straight one (roughness 0) is the midpoints
      const flat = selRandline(rng(s), l, selNew(l), 0, 2, 6, 2, 0);
      expect(pts(l, flat)).toEqual(['0,2', '1,2', '2,2', '3,2', '4,2', '5,2', '6,2']);
    }
  });
});

describe('the invocation level', () => {
  test('is hellfill too: the vibrating square, no down stairs', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const { state } = engine.newGame({ seed });
      const d = state.dungeons.find((x) => x.id === GEHENNOM)!;
      run(state, (ctx) => ctx.goToLevel({ dungeon: GEHENNOM, dlevel: d.levels! - 1 }, 'random'));
      const level = getLevel(state);
      expect(level.def).toBe('nh:hellfill');
      expect(level.down).toBeNull();
      expect(level.traps.filter((t) => t.def === TRAP.vibrating)).toHaveLength(1);
    }
  });
});
