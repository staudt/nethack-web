// Milestone 7b step 6: the Sokoban branch (dat/dungeon.lua) and its eight levels
// (dat/soko*.lua): layout, every variant's map, boulders, traps, stairs and doors at the lua
// spots, premapped on creation, and the branch stairs up from below the Oracle and back.
import {
  cellIndex,
  createEngine,
  createRng,
  getLevel,
  getPlayer,
  rollDungeons,
  seedRng,
  sortedIds,
  type Ctx,
  type DefId,
  type Entity,
  type GameState,
  type Level,
  type Mod,
  type Pos,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import { mapToLevel } from '../src/sp_lev';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'sk',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'sk:run',
      labelKey: 'sk',
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
const UP = { type: 'mod', action: 'nh:up' } as const;
const DOWN = { type: 'mod', action: 'nh:down' } as const;

function run(state: GameState, fn: (ctx: Ctx) => void): void {
  probe.fn = fn;
  engine.step(state, { type: 'mod', action: 'sk:run' });
}

type Xy = [x: number, y: number];
interface Expect {
  boulders: string;
  pits: string;
  holes: string;
  /** rolling boulder traps: not ported, the spot stays plain floor */
  rolling: string;
  earth: string;
  stairs: { up?: Xy; down?: Xy; branch?: Xy };
  doors: [state: 'locked' | 'closed', x: number, y: number][];
}

/** Copied from dat/soko*.lua (map coordinates), independently of sokoban.ts. */
const LUA: Record<string, Expect> = {
  'soko1-1': {
    boulders: '3,5 5,5 7,5 9,5 11,5 4,7 4,8 6,7 9,7 11,7 3,12 4,10 5,12 6,10 7,11 8,10 9,12 3,14',
    pits: '',
    holes: '7,1 9,1 10,1 11,1 12,1 13,1 14,1 15,1 16,1 17,1 18,1 19,1 20,1 21,1 22,1 23,1',
    rolling: '8,1',
    earth: '',
    stairs: { down: [1, 1] },
    doors: [
      ['locked', 23, 13],
      ['closed', 17, 11],
      ['closed', 17, 13],
      ['closed', 17, 15],
    ],
  },
  'soko1-2': {
    boulders:
      '4,4 2,6 3,6 4,7 5,7 2,8 5,8 3,9 4,9 3,10 5,10 6,12 7,14 11,5 12,6 10,7 11,7 10,8 12,9 11,10',
    pits: '',
    holes: '6,1 7,1 8,1 9,1 10,1 11,1 12,1 13,1 14,1 15,1 16,1 17,1 18,1 19,1 20,1 21,1 22,1 23,1',
    rolling: '5,1',
    earth: '',
    stairs: { down: [6, 15] },
    doors: [
      ['locked', 23, 12],
      ['closed', 17, 10],
      ['closed', 17, 12],
      ['closed', 17, 14],
    ],
  },
  'soko2-1': {
    boulders: '2,2 3,2 5,3 7,3 7,2 8,2 10,3 11,3 2,7 2,8 3,9 5,7 6,6',
    pits: '',
    holes: '8,9 9,9 10,9 11,9 12,9 13,9 14,9 15,9 16,9 17,9',
    rolling: '7,9',
    earth: '',
    stairs: { down: [6, 10], up: [16, 4] },
    doors: [['locked', 18, 8]],
  },
  'soko2-2': {
    boulders: '4,2 4,3 5,3 7,3 8,3 2,4 3,4 5,5 6,6 9,6 3,7 4,7 7,7 6,9 5,10 5,11',
    pits: '',
    holes: '8,11 9,11 10,11 11,11 12,11 13,11 14,11 15,11 16,11 17,11 18,11',
    rolling: '7,11',
    earth: '',
    stairs: { down: [6, 11], up: [15, 6] },
    doors: [
      ['locked', 19, 9],
      ['locked', 19, 11],
    ],
  },
  'soko3-1': {
    boulders: '3,2 4,2 6,2 6,3 7,2 3,6 2,7 3,7 3,8 2,9 3,9 4,9 6,7 6,9 8,7 8,10 9,8 9,9 10,7 10,10',
    pits: '',
    holes:
      '12,10 13,10 14,10 15,10 16,10 17,10 18,10 19,10 20,10 21,10 22,10 23,10 24,10 25,10 26,10',
    rolling: '11,10',
    earth: '',
    stairs: { down: [11, 2], up: [23, 4] },
    doors: [['locked', 27, 9]],
  },
  'soko3-2': {
    boulders: '2,3 8,3 9,4 2,5 4,5 9,5 2,6 5,6 6,7 3,8 7,8 5,9 10,9 7,10 10,10 3,11',
    pits: '',
    holes: '12,10 13,10 14,10 15,10 16,10 17,10 18,10 19,10 20,10 21,10 22,10 23,10',
    rolling: '11,10',
    earth: '',
    stairs: { down: [3, 1], up: [20, 4] },
    doors: [['locked', 24, 9]],
  },
  'soko4-1': {
    boulders: '2,2 2,3 10,2 9,3 10,4 8,7 9,8 9,9 8,10 10,10',
    pits: '4,6 2,6 2,7 2,8 2,10 3,10 4,10 5,10 6,10',
    holes: '',
    rolling: '2,9 7,10',
    earth: '2,11 3,11',
    stairs: { branch: [6, 4], up: [6, 6] },
    doors: [],
  },
  'soko4-2': {
    boulders: '5,2 6,2 6,3 7,3 9,5 10,3 11,2 12,3 7,8 8,8 9,8 10,8',
    pits: '1,2 1,3 1,4 1,5 1,6 1,8 2,8 3,8 4,8 5,8',
    holes: '',
    rolling: '1,7 6,8',
    earth: '1,9 2,9',
    stairs: { branch: [3, 1], up: [1, 1] },
    doors: [],
  },
};
const VARIANTS = Object.keys(LUA);

const spots = (s: string): Xy[] =>
  s === '' ? [] : s.split(' ').map((p) => p.split(',').map(Number) as Xy);
const terrain = (level: Level, p: Pos): DefId =>
  level.palette[level.cells[cellIndex(level, p.x, p.y)] ?? -1] ?? 'nh:none';
const entitiesOn = (state: GameState, level: Level): Entity[] =>
  sortedIds(state)
    .map((id) => state.entities[String(id)] as Entity)
    .filter((e) => e.c.pos?.level === level.id);
const key = (p: Pos): string => `${String(p.x)},${String(p.y)}`;

/**
 * Builds Sokoban level `n` (1 = top) of a new game, with the hero sent there alone: the pet is
 * left behind (moved away from her) so it cannot eat the level's food before the count.
 */
function sokoLevel(state: GameState, n: number): Level {
  for (const e of entitiesOn(state, getLevel(state)))
    if ((e.c.monster?.tame ?? 0) > 0) Object.assign(e.c.pos!, { x: 0, y: 0 });
  run(state, (ctx) => ctx.goToLevel({ dungeon: 'nh:sokoban', dlevel: n }, n === 1 ? 'down' : 'up'));
  return getLevel(state);
}

/** For each variant, a level built from it: the first seeds (from 1) that pick it. */
function levelsByVariant(
  width: number,
  height: number,
): Map<string, { state: GameState; level: Level }> {
  const found = new Map<string, { state: GameState; level: Level }>();
  for (let seed = 1; found.size < VARIANTS.length; seed++) {
    if (seed > 60)
      throw new Error(`not every variant within 60 seeds: ${[...found.keys()].join()}`);
    for (let n = 1; n <= 4; n++) {
      const { state } = engine.newGame({ seed, width, height });
      const level = sokoLevel(state, n);
      const id = (level.def ?? '').replace(/^nh:/, '');
      if (!found.has(id)) found.set(id, { state, level });
    }
  }
  return found;
}

describe('the Sokoban branch', () => {
  test('four levels above the level below the Oracle, entered on the bottom one', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const layout = rollDungeons(createRng(seedRng(seed)), defs.dungeons);
      const main = layout[0]!;
      const oracle = main.special.find((s) => s.id === 'nh:oracle')!;
      const soko = layout.find((d) => d.id === 'nh:sokoban')!;
      expect(main.branches.find((b) => b.to === 'nh:sokoban')).toEqual({
        to: 'nh:sokoban',
        dlevel: oracle.dlevel + 1,
        dir: 'up',
      });
      expect(soko.levels).toBe(4);
      expect(soko.entry).toBe(4);
      // the entry level's depth is the Oracle's (the level below it, one up)
      expect(soko.depthStart + 3).toBe(oracle.dlevel);
      expect(soko.special.map((s) => [s.id, s.dlevel])).toEqual([
        ['nh:soko1', 1],
        ['nh:soko2', 2],
        ['nh:soko3', 3],
        ['nh:soko4', 4],
      ]);
    }
  });

  for (const [width, height] of [
    [80, 21],
    [120, 40],
  ] as const) {
    test(`every variant at ${String(width)}x${String(height)}: the lua map and spots`, () => {
      const built = levelsByVariant(width, height);
      for (const name of VARIANTS) {
        const { state, level } = built.get(name)!;
        const lua = LUA[name]!;
        const def = defs.level(`nh:${name}`);
        const rows = def.map!.rows;
        const at = (x: number, y: number) => mapToLevel(def, level, x, y);
        expect(level.sokoban).toBe(true);
        expect(level.dlevel).toBe(Number(name[4]));
        // the block is centred
        const o = at(0, 0);
        expect(Math.abs(o.x + rows[0]!.length / 2 - width / 2)).toBeLessThanOrEqual(2);
        expect(Math.abs(o.y + rows.length / 2 - height / 2)).toBeLessThanOrEqual(2);
        // every '.' is walkable, every wall a wall, every '+' a door, all lit
        for (const [y, row] of rows.entries())
          for (const [x, ch] of [...row].entries()) {
            const t = defs.terrain(terrain(level, at(x, y)));
            const lit = level.lit[cellIndex(level, at(x, y).x, at(x, y).y)];
            if (ch === '.') expect(t.passable, `${name} ${String(x)},${String(y)}`).toBe(true);
            if (ch === '-' || ch === '|') expect(t.id).toMatch(/wall|corn/);
            if (ch === '+') expect(t.door).toBeDefined();
            if (ch !== ' ') expect(lit).toBeTruthy();
          }
        // boulders: exactly the lua ones, each alone on floor
        const things = entitiesOn(state, level);
        const boulders = things.filter((e) => e.def === 'nh:boulder').map((e) => key(e.c.pos!));
        const want = spots(lua.boulders).map(([x, y]) => key(at(x, y)));
        expect(boulders.sort()).toEqual([...want].sort());
        for (const [x, y] of spots(lua.boulders)) expect(terrain(level, at(x, y))).toBe('nh:floor');
        // traps: exactly the lua pits, holes and rolling boulder traps (with no boulder: the
        // boulders are only the lua ones, checked above)
        const traps = level.traps.map((t) => `${t.def} ${key(t)}`).sort();
        const wantTraps = [
          ...spots(lua.pits).map(([x, y]) => `nh:pit ${key(at(x, y))}`),
          ...spots(lua.holes).map(([x, y]) => `nh:hole ${key(at(x, y))}`),
          ...spots(lua.rolling).map(([x, y]) => `nh:rolling_boulder_trap ${key(at(x, y))}`),
        ].sort();
        expect(traps).toEqual(wantTraps);
        for (const t of level.traps) expect(terrain(level, t)).toBe('nh:floor');
        for (const [x, y] of spots(lua.rolling)) expect(terrain(level, at(x, y))).toBe('nh:floor');
        // the scrolls of earth
        const earth = things
          .filter((e) => e.def === 'nh:scroll_of_earth')
          .map((e) => key(e.c.pos!));
        expect(earth.sort()).toEqual(
          spots(lua.earth)
            .map(([x, y]) => key(at(x, y)))
            .sort(),
        );
        // random objects: four food (1 or 2 each; equal ones made on one spot merge), a ring
        // and a wand, all inside the block
        const ofClass = (c: string) =>
          things.filter((e) => e.c.item && defs.object(e.def).class === c);
        const food = ofClass('food').reduce((n, e) => n + (e.c.item?.quantity ?? 0), 0);
        expect(food).toBeGreaterThanOrEqual(4);
        expect(food).toBeLessThanOrEqual(8);
        expect([ofClass('ring').length, ofClass('wand').length]).toEqual([1, 1]);
        // stairs and branch stairs at their spots; the top has no up stairs, the bottom no down
        const { up, down, branch } = lua.stairs;
        const spot = (p: Xy | undefined) => (p ? key(at(...p)) : null);
        expect(level.up ? key(level.up) : null).toBe(spot(up));
        expect(level.down ? key(level.down) : null).toBe(spot(down));
        expect(level.branch ? key(level.branch.pos) : null).toBe(spot(branch));
        if (branch) expect(level.branch).toMatchObject({ to: { dungeon: 'nh:main' }, dir: 'down' });
        // doors
        for (const [st, x, y] of lua.doors)
          expect(terrain(level, at(x, y))).toBe(
            st === 'locked' ? 'nh:door_locked' : 'nh:door_closed',
          );
        // premapped: every non-stone cell known, the boulders remembered, every trap seen
        const memory = state.memory[level.id]!;
        for (let i = 0; i < level.cells.length; i++)
          if (level.palette[level.cells[i] ?? 0] !== 'nh:stone')
            expect(memory[i]).toBe(level.cells[i]);
        for (const b of boulders) {
          const [x, y] = b.split(',').map(Number) as Xy;
          expect(state.objectMemory[level.id]?.[String(cellIndex(level, x, y))]).toBe('nh:boulder');
        }
        expect(level.traps.every((t) => t.seen)).toBe(true);
      }
    });
  }

  test('< on the up branch stairs below the Oracle reaches Sokoban 4, > comes back', () => {
    const { state } = engine.newGame({ seed: 2 });
    const main = state.dungeons[0]!;
    const below = main.branches.find((b) => b.to === 'nh:sokoban')!.dlevel;
    run(state, (ctx) => ctx.goToLevel({ dungeon: 'nh:main', dlevel: below }, 'up'));
    const level = getLevel(state);
    expect(level.up).not.toBeNull();
    expect(level.branch).toMatchObject({ to: { dungeon: 'nh:sokoban', dlevel: 4 }, dir: 'up' });
    const pos = getPlayer(state).c.pos!;
    Object.assign(pos, level.branch!.pos);
    engine.step(state, UP);
    const soko = getLevel(state);
    expect(soko.id).toBe('nh:sokoban/4');
    expect(soko.depth).toBe(below - 1);
    expect(soko.down).toBeNull();
    expect(getPlayer(state).c.pos).toMatchObject(soko.branch!.pos);
    // the arrival level is already mapped, its pits shown
    expect(soko.traps.length).toBeGreaterThan(0);
    expect(soko.traps.every((t) => t.seen)).toBe(true);
    engine.step(state, DOWN);
    expect(getPlayer(state).c.pos).toEqual({ level: level.id, ...level.branch!.pos });
  });
});
