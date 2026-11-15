// m15 step 5: the big room's thirteen variants (bigroom.ts), and the teleport regions that hold
// random arrivals (bigrm-10, minend-2, Orcish Town).
import {
  cellIndex,
  createEngine,
  getLevel,
  levelDefArea,
  playerPos,
  sortedIds,
  type Ctx,
  type DefId,
  type Entity,
  type GameState,
  type Level,
  type LevelRect,
  type MapBlock,
  type Mod,
  type Pos,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import { BIGROOM_VARIANTS } from '../src/bigroom';
import { mapToLevel } from '../src/sp_lev';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
/**
 * A probe action and a test dungeon (from DL10 of the main one) whose level n + 1 is big room
 * variant n, between ordinary levels so that every variant gets up and down stairs (the main
 * dungeon places the big room from step 9 on).
 */
const testMod: Mod = {
  id: 'bt',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'bt:run',
      labelKey: 'bt',
      handles: 'mod',
      offer: () => [],
      perform(ctx) {
        probe.fn(ctx);
        return 0;
      },
    });
    api.defineDungeon({
      id: 'bt:big',
      nameKey: 'bt:big',
      levels: { base: 15 },
      entry: { from: 'nh:main', base: 10 },
      special: BIGROOM_VARIANTS.map((v, i) => ({
        id: `bt:b${String(i + 1)}`,
        nameKey: 'bt:b',
        base: i + 2,
        variants: [v.id],
      })),
    });
  },
};
const engine = createEngine([vanillaMod, testMod]);
const defs = engine.registry;
const run = (state: GameState, fn: (ctx: Ctx) => void): void => {
  probe.fn = fn;
  engine.step(state, { type: 'mod', action: 'bt:run' });
};
const goTo = (state: GameState, dungeon: DefId, dlevel: number, at: 'up' | 'random'): Level => {
  run(state, (ctx) => ctx.goToLevel({ dungeon, dlevel }, at));
  return getLevel(state);
};

/** Big room variant `n` of a new game with `seed`, the hero falling onto it from above. */
function bigroom(n: number, seed: number): { state: GameState; level: Level } {
  const { state } = engine.newGame({ seed });
  goTo(state, 'bt:big', n, 'up');
  return { state, level: goTo(state, 'bt:big', n + 1, 'random') };
}

const ter = (l: Level, x: number, y: number): string =>
  x < 0 || y < 0 || x >= l.width || y >= l.height
    ? 'out'
    : (l.palette[l.cells[cellIndex(l, x, y)] ?? -1] ?? '?');
const WALLS = new Set(
  ['vwall', 'hwall', 'tlcorn', 'trcorn', 'blcorn', 'brcorn', 'crwall', 'tuwall', 'tdwall']
    .concat(['tlwall', 'trwall'])
    .map((k) => `nh:${k}`),
);
/** Terrain with every wall shape as 'wall'. */
const kind = (l: Level, x: number, y: number): string => {
  const id = ter(l, x, y);
  return WALLS.has(id) ? 'wall' : id;
};
const isFloor = (id: string): boolean =>
  id === 'nh:floor' || id === 'nh:stairs_up' || id === 'nh:stairs_down';
const liquid = (l: Level, x: number, y: number): boolean => {
  const id = ter(l, x, y);
  return defs.terrains.some((t) => t.id === id && t.liquid !== undefined);
};
const onLevel = (state: GameState, level: Level): Entity[] =>
  sortedIds(state)
    .map((id) => state.entities[String(id)] as Entity)
    .filter((e) => e.c.pos?.level === level.id && e.id !== state.playerId);
const block = (l: Level): MapBlock =>
  levelDefArea(defs.level(l.def ?? 'nh:none'), l.width, l.height);
/** The Level cells of a variant's map character `ch`. */
function mapCells(n: number, l: Level, ch: string): Pos[] {
  const def = defs.level(`nh:bigrm-${String(n)}`);
  const out: Pos[] = [];
  (def.map?.rows ?? []).forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c === ch) out.push(mapToLevel(def, l, x, y));
    }),
  );
  return out;
}
/**
 * The kinds of terrain on `cells`, stairs counting as the floor they were put on and stone as
 * wall (the walls of a solid block with no open neighbour become stone, as wall_cleanup() does).
 */
const kindsAt = (l: Level, cells: Pos[]): Set<string> =>
  new Set(
    cells.map((p) => {
      const id = ter(l, p.x, p.y);
      return isFloor(id) ? 'nh:floor' : id === 'nh:stone' ? 'wall' : kind(l, p.x, p.y);
    }),
  );
const inside = (p: Pos, r: LevelRect): boolean =>
  p.x >= r[0] && p.x <= r[2] && p.y >= r[1] && p.y <= r[3];
/** The map-relative rectangle `r` of variant level `l` in Level coordinates. */
const mapRect = (l: Level, r: LevelRect): LevelRect => {
  const b = block(l);
  return [b.x + r[0], b.y + r[1], b.x + r[2], b.y + r[3]];
};

describe('the big room', () => {
  test('all thirteen build on 80x21 with stairs, 15 objects, 6 traps and 28 monsters', () => {
    let sixTraps = 0;
    for (let n = 1; n <= 13; n++)
      for (const seed of [1, 2]) {
        const { state, level } = bigroom(n, seed);
        expect(level.def).toBe(`nh:bigrm-${String(n)}`);
        expect([level.width, level.height]).toEqual([80, 21]);
        const { up, down } = level;
        expect(up && ter(level, up.x, up.y)).toBe('nh:stairs_up');
        expect(down && ter(level, down.x, down.y)).toBe('nh:stairs_down');
        const ents = onLevel(state, level);
        expect(ents.filter((e) => e.c.monster).length).toBeGreaterThanOrEqual(28);
        const items = ents.filter((e) => e.c.item);
        expect(items.length).toBeGreaterThanOrEqual(15);
        // six des.trap(): two on the same random spot make one (maketrap() replaces the first)
        expect(level.traps.length).toBeLessThanOrEqual(6);
        if (level.traps.length === 6) sixTraps++;
        // random things go on DRY spots: never in water or lava
        for (const e of items.filter((i) => i.def !== 'nh:boulder'))
          expect(liquid(level, e.c.pos?.x ?? 0, e.c.pos?.y ?? 0)).toBe(false);
        for (const t of level.traps) expect(liquid(level, t.x, t.y)).toBe(false);
        const p = playerPos(state);
        expect(ter(level, p.x, p.y)).toBe('nh:floor');
      }
    expect(sixTraps).toBeGreaterThanOrEqual(22);
  });

  test('bigrm-1: most of the time one line shape of one terrain', () => {
    const seen = new Set<string>();
    let none = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const { level } = bigroom(1, seed);
      const b = block(level);
      const kinds = new Set<string>();
      for (let x = b.x + 1; x < b.x + b.w - 1; x++)
        for (let y = b.y + 1; y < b.y + b.h - 1; y++)
          if (!isFloor(ter(level, x, y))) kinds.add(kind(level, x, y));
      expect(kinds.size).toBeLessThanOrEqual(1);
      if (kinds.size === 0) none++;
      for (const k of kinds) seen.add(k);
      expect(level.up && ter(level, level.up.x, level.up.y)).toBe('nh:stairs_up');
    }
    expect(none).toBeLessThan(12);
    expect(seen.size).toBeGreaterThan(1);
    for (const k of seen)
      expect(['wall', 'nh:iron_bars', 'nh:lava', 'nh:tree', 'nh:cloud']).toContain(k);
  });

  test('bigrm-2: darkness patterns, sometimes iced over', () => {
    let dark = false;
    let ice = false;
    for (let seed = 1; seed <= 60 && !(dark && ice); seed++) {
      const { level } = bigroom(2, seed);
      const b = block(level);
      const unlit = (x: number, y: number): boolean => level.lit[cellIndex(level, x, y)] === 0;
      for (let x = b.x + 1; x < b.x + b.w - 1; x++)
        for (let y = b.y + 1; y < b.y + b.h - 1; y++) {
          if (unlit(x, y)) dark = true;
          if (ter(level, x, y) !== 'nh:ice') continue;
          ice = true;
          // the ice is the darkness grown by one
          let near = false;
          for (let dx = -1; dx <= 1; dx++)
            for (let dy = -1; dy <= 1; dy++) if (unlit(x + dx, y + dy)) near = true;
          expect(near).toBe(true);
        }
    }
    expect([dark, ice]).toEqual([true, true]);
  });

  test('bigrm-3: the walls between floor become bars, trees, water or lava walls, or stay', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const { level } = bigroom(3, seed);
      const cells: Pos[] = [];
      for (let x = 1; x < level.width - 1; x++)
        for (let y = 0; y < level.height; y++)
          if (
            isFloor(ter(level, x - 1, y)) &&
            isFloor(ter(level, x + 1, y)) &&
            !isFloor(ter(level, x, y)) &&
            ter(level, x, y) !== 'nh:stone'
          )
            cells.push({ x, y });
      const kinds = kindsAt(level, cells);
      expect(kinds.size).toBe(1);
      for (const k of kinds) seen.add(k);
    }
    expect(seen.has('wall')).toBe(true);
    expect(seen.size).toBeGreaterThan(1);
    for (const k of seen)
      expect(['wall', 'nh:iron_bars', 'nh:tree', 'nh:water', 'nh:lavawall']).toContain(k);
  });

  test('bigrm-4, 7 and 8: their lava or bars become one terrain; bigrm-4 has its fountains', () => {
    const cases: [number, string, string[]][] = [
      [4, 'L', ['nh:floor', 'nh:pool', 'nh:lava', 'wall', 'nh:tree', 'nh:water', 'nh:lavawall']],
      [7, 'L', ['nh:lava', 'nh:tree', 'nh:fountain', 'nh:floor']],
      [8, 'F', ['nh:iron_bars', 'nh:lava', 'nh:moat', 'nh:tree', 'nh:floor', 'wall', 'nh:cloud']],
    ];
    for (const [n, ch, allowed] of cases) {
      const seen = new Set<string>();
      for (let seed = 1; seed <= 10; seed++) {
        const { level } = bigroom(n, seed);
        const kinds = kindsAt(level, mapCells(n, level, ch));
        expect(kinds.size).toBe(1);
        for (const k of kinds) seen.add(k);
        if (n === 4)
          for (const p of mapCells(4, level, '{')) expect(ter(level, p.x, p.y)).toBe('nh:fountain');
      }
      expect(seen.size).toBeGreaterThan(1);
      for (const k of seen) expect(allowed).toContain(k);
    }
  });

  test('bigrm-5: a quarter of the time patches of ice or clouds', () => {
    let found = false;
    for (let seed = 1; seed <= 40 && !found; seed++) {
      const { level } = bigroom(5, seed);
      const n = level.cells.filter((c) => {
        const id = level.palette[c];
        return id === 'nh:ice' || id === 'nh:cloud';
      }).length;
      found = n > 0;
    }
    expect(found).toBe(true);
  });

  test('bigrm-9: an eye in a moat, dark but around the pupil', () => {
    const { level } = bigroom(9, 1);
    expect(kindsAt(level, mapCells(9, level, '}'))).toEqual(new Set(['nh:moat']));
    expect(kindsAt(level, mapCells(9, level, 'L'))).toEqual(new Set(['nh:lava']));
    const [x, y] = mapRect(level, [5, 1, 37, 9]);
    expect(level.lit[cellIndex(level, x, y)]).toBe(0);
    const [cx, cy] = mapRect(level, [37, 9, 37, 9]);
    expect(level.lit[cellIndex(level, cx, cy)]).toBe(1);
  });

  test('bigrm-10: the fog maze is walked; falling in lands outside it, as do the up stairs', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const { state, level } = bigroom(10, seed);
      const fog = mapRect(level, [2, 3, 68, 15]);
      expect(inside(playerPos(state), fog)).toBe(false);
      expect(level.up && inside(level.up, fog)).toBe(false);
      // every maze node (the map's stone) is carved
      for (let my = 4; my <= 14; my += 2)
        for (let mx = 4; mx <= 66; mx += 2) {
          const p = mapToLevel(defs.level('nh:bigrm-10'), level, mx, my);
          expect(isFloor(ter(level, p.x, p.y))).toBe(true);
        }
      // falling in again from above never lands in the fog
      for (let i = 0; i < 4; i++) {
        goTo(state, 'bt:big', 10, 'up');
        goTo(state, 'bt:big', 11, 'random');
        expect(inside(playerPos(state), fog)).toBe(false);
      }
    }
  });

  test('bigrm-11: a maze of boulders: no wall is left between two floor cells', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const { state, level } = bigroom(11, seed);
      for (let x = 0; x < level.width; x++)
        for (let y = 0; y < level.height; y++) {
          if (kind(level, x, y) !== 'wall') continue;
          expect(isFloor(ter(level, x - 1, y)) && isFloor(ter(level, x + 1, y))).toBe(false);
          expect(isFloor(ter(level, x, y - 1)) && isFloor(ter(level, x, y + 1))).toBe(false);
        }
      const boulders = onLevel(state, level).filter((e) => e.def === 'nh:boulder');
      expect(boulders.length).toBeGreaterThan(20);
      expect(level.traps.every((t) => t.def === 'nh:rolling_boulder_trap')).toBe(true);
    }
  });

  test('bigrm-12: walled around, its pools and lava kept, replaced or swapped', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 10; seed++) {
      const { level } = bigroom(12, seed);
      for (let x = 0; x < level.width; x++)
        for (let y = 0; y < level.height; y++) {
          if (ter(level, x, y) !== 'nh:stone') continue;
          for (let dx = -1; dx <= 1; dx++)
            for (let dy = -1; dy <= 1; dy++)
              expect(isFloor(ter(level, x + dx, y + dy))).toBe(false);
        }
      for (const ch of ['P', 'W', 'L', 'Z']) {
        const kinds = kindsAt(level, mapCells(12, level, ch));
        expect(kinds.size).toBe(1);
        for (const k of kinds) seen.add(`${ch}${k}`);
      }
    }
    expect(seen.size).toBeGreaterThan(4);
  });

  test('bigrm-13: pillars of walls around stone, never over the stairs', () => {
    const counts = new Set<number>();
    for (let seed = 1; seed <= 10; seed++) {
      const { level } = bigroom(13, seed);
      const b = block(level);
      let pillars = 0;
      for (let x = b.x + 1; x < b.x + b.w - 1; x++)
        for (let y = b.y + 1; y < b.y + b.h - 1; y++) {
          if (ter(level, x, y) !== 'nh:stone') continue;
          pillars++;
          for (const [dx, dy] of [
            [-1, -1],
            [0, -1],
            [1, -1],
            [-1, 0],
            [1, 0],
            [-1, 1],
            [0, 1],
            [1, 1],
          ] as const)
            expect(kind(level, x + dx, y + dy)).toBe('wall');
        }
      counts.add(pillars);
      expect(level.up && ter(level, level.up.x, level.up.y)).toBe('nh:stairs_up');
      expect(level.down && ter(level, level.down.x, level.down.y)).toBe('nh:stairs_down');
    }
    expect(counts.size).toBeGreaterThan(1);
    for (const c of counts) expect(c).toBeLessThanOrEqual(21);
  });
});

describe('teleport regions of the Mines', () => {
  const minesEnd = (state: GameState): number =>
    state.dungeons.find((d) => d.id === 'nh:mines')?.levels ?? 0;

  test("minend-2: falling into the Gnome King's wine cellar lands in its region", () => {
    let tested = 0;
    for (let seed = 1; seed <= 60 && tested < 2; seed++) {
      const { state } = engine.newGame({ seed });
      const last = minesEnd(state);
      if (goTo(state, 'nh:mines', last, 'random').def !== 'nh:minend-2') continue;
      tested++;
      for (let i = 0; i < 5; i++) {
        expect(inside(playerPos(state), [22, 3, 47, 16])).toBe(true);
        goTo(state, 'nh:mines', last - 1, 'up');
        goTo(state, 'nh:mines', last, 'random');
      }
    }
    expect(tested).toBe(2);
  });

  test('Orcish Town: falling in never lands in the town', () => {
    let tested = 0;
    for (let seed = 1; seed <= 400 && tested < 1; seed++) {
      const { state } = engine.newGame({ seed });
      const town = state.dungeons
        .find((d) => d.id === 'nh:mines')
        ?.special.find((s) => s.id === 'nh:minetown');
      if (!town) continue;
      const level = goTo(state, 'nh:mines', town.dlevel, 'random');
      if (level.def !== 'nh:minetn-1') continue;
      tested++;
      const townArea = mapRect(level, [1, 0, 35, 18]);
      for (let i = 0; i < 6; i++) {
        const p = playerPos(state);
        expect(inside(p, townArea)).toBe(false);
        expect(inside(p, [0, 1, 74, 19])).toBe(true);
        goTo(state, 'nh:mines', town.dlevel - 1, 'up');
        goTo(state, 'nh:mines', town.dlevel, 'random');
      }
    }
    expect(tested).toBe(1);
  });
});
