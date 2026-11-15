// m15 step 4: the maze levels below Medusa (`nh:mazefill`, populate_maze()), the minotaur,
// fill_empty_maze() and rndtrap().
import {
  createEngine,
  getLevel,
  sortedIds,
  type Ctx,
  type Entity,
  type GameState,
  type Level,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import { fillEmptyMaze, MAZEFILL } from '../src/mazefill';
import { rndtrap } from '../src/mklev';
import { makemon } from '../src/generation';
import { minvent } from '../src/mongear';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'mz',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'mz:run',
      labelKey: 'mz',
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
  engine.step(state, { type: 'mod', action: 'mz:run' });
};

/** A new game whose Medusa's level is moved to DL20 (above DL21-24; the Castle is DL25-29). */
function withMedusa(seed: number): GameState {
  const { state } = engine.newGame({ seed });
  const medusa = state.dungeons[0]?.special.find((s) => s.id === 'nh:medusa');
  if (!medusa) throw new Error('no Medusa');
  medusa.dlevel = 20;
  return state;
}

function goTo(state: GameState, dlevel: number): Level {
  run(state, (ctx) => ctx.goToLevel({ dungeon: 'nh:main', dlevel }, 'down'));
  return getLevel(state);
}

const on = (state: GameState, level: Level): Entity[] =>
  sortedIds(state)
    .map((id) => state.entities[String(id)] as Entity)
    .filter((e) => e.c.pos?.level === level.id);
const terrainAt = (l: Level, x: number, y: number): string =>
  l.palette[l.cells[y * l.width + x] ?? -1] ?? '?';

describe('the maze levels below Medusa', () => {
  test('levels below Medusa are mostly mazes; above it never', () => {
    let mazes = 0;
    let rooms = 0;
    // `rn2(5)`: 4 in 5 are mazes; enough levels that the count does not hang on the stream
    for (let seed = 1; seed <= 8; seed++) {
      const state = withMedusa(seed);
      for (let d = 17; d <= 24; d++) {
        const l = goTo(state, d);
        if (d < 20) expect(l.def).toBeUndefined();
        else if (d === 20) expect(l.def).toMatch(/^nh:medusa-[1-4]$/);
        else if (l.def === MAZEFILL.id) mazes++;
        else {
          expect(l.def).toBeUndefined();
          rooms++;
        }
      }
    }
    expect(mazes).toBeGreaterThan(rooms);
  });

  test("populate_maze(): C's counts of objects, boulders, minotaurs, gold and traps on maze spots", () => {
    let minotaurs = 0;
    let levels = 0;
    let corrmazes = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const state = withMedusa(seed);
      for (let d = 21; d <= 23; d++) {
        const l = goTo(state, d);
        if (l.def !== MAZEFILL.id) continue;
        levels++;
        if (l.corrmaze) corrmazes++;
        const floor = l.corrmaze ? 'nh:corr' : 'nh:floor';
        // the stairs are where mazexy() found the maze's floor
        expect(l.up).not.toBeNull();
        expect(l.down).not.toBeNull();
        const here = on(state, l);
        const items = here.filter((e) => e.c.item);
        const boulders = items.filter((e) => e.def === 'nh:boulder');
        const gold = items.filter((e) => e.def === 'nh:gold_piece');
        const others = items.length - boulders.length - gold.length;
        // a rolling boulder trap brings its boulder, a statue trap its statue
        const rolling = l.traps.filter((t) => t.def === 'nh:rolling_boulder_trap').length;
        const statues = l.traps.filter((t) => t.def === 'nh:statue_trap').length;
        expect(boulders.length).toBeGreaterThanOrEqual(2);
        expect(boulders.length).toBeLessThanOrEqual(11 + rolling);
        expect(gold.length).toBeGreaterThanOrEqual(1);
        expect(gold.length).toBeLessThanOrEqual(12);
        // snakes and spiders made with the level may get an object to hide under
        const hiders = here.filter(
          (e) => e.c.monster && 'sS'.includes(engine.registry.monster(e.def).glyph.ch),
        ).length;
        expect(others).toBeGreaterThanOrEqual(11);
        expect(others).toBeLessThanOrEqual(18 + statues + hiders);
        expect(l.traps.length).toBeGreaterThanOrEqual(7);
        expect(l.traps.length).toBeLessThanOrEqual(12);
        const mons = here.filter((e) => e.c.monster && !e.c.player);
        const mino = mons.filter((e) => e.def === 'nh:minotaur').length;
        expect(mino).toBeLessThanOrEqual(2);
        minotaurs += mino;
        expect(mons.length).toBeGreaterThanOrEqual(7);
        // every object and trap made with the level lies on the maze floor
        for (const e of items) {
          const p = e.c.pos as { x: number; y: number };
          expect([floor, 'nh:stairs_up', 'nh:stairs_down']).toContain(terrainAt(l, p.x, p.y));
        }
        for (const t of l.traps) expect(terrainAt(l, t.x, t.y)).toBe(floor);
      }
    }
    expect(levels).toBeGreaterThan(10);
    expect(corrmazes).toBeGreaterThan(0);
    expect(minotaurs).toBeGreaterThan(0); // rn2(3) per level: one each on average
  });
});

describe('the minotaur', () => {
  test('a giant brown H, never generated at random, with a wand of digging 1 time in 8', () => {
    const def = engine.registry.monster('nh:minotaur');
    expect(def.glyph.ch).toBe('H');
    expect(def.genFlags).toContain('nogen');
    const state = withMedusa(5);
    goTo(state, 21);
    let wands = 0;
    run(state, (ctx) => {
      const l = getLevel(ctx.state);
      for (let i = 0; i < 64; i++) {
        const id = makemon(ctx, def, null, { level: l.id });
        if (id !== null && minvent(ctx, id).some((o) => o.def === 'nh:wand_of_digging')) wands++;
      }
    });
    expect(wands).toBeGreaterThan(0);
    expect(wands).toBeLessThan(32);
  });
});

describe('fill_empty_maze() and rndtrap()', () => {
  test('a stocked maze puts its objects, boulders and traps on maze nodes', () => {
    const state = withMedusa(2);
    let l = goTo(state, 21);
    for (let d = 22; l.def !== MAZEFILL.id || l.corrmaze; d++) l = goTo(state, d);
    const before = new Set(on(state, l).map((e) => e.id));
    const key = (t: { x: number; y: number; def: string }): string => `${t.x},${t.y},${t.def}`;
    const trapsBefore = new Set(l.traps.map(key));
    run(state, (ctx) => fillEmptyMaze(ctx, l, MAZEFILL));
    const fresh = on(state, l).filter((e) => !before.has(e.id) && e.c.item);
    expect(fresh.length).toBeGreaterThan(0);
    // maze1xy(): odd NetHack coordinates, the Level's even x and odd y
    for (const e of fresh) {
      const p = e.c.pos as { x: number; y: number };
      expect(p.x % 2).toBe(0);
      expect(p.y % 2).toBe(1);
    }
    const freshTraps = l.traps.filter((t) => !trapsBefore.has(key(t)));
    expect(freshTraps.length).toBeGreaterThan(0);
    for (const t of freshTraps) {
      expect(t.x % 2).toBe(0);
      expect(t.y % 2).toBe(1);
    }
  });

  test('rndtrap() never makes a hole', () => {
    const state = withMedusa(3);
    const l = goTo(state, 21);
    const kinds = new Set<string>();
    run(state, (ctx) => {
      for (let i = 0; i < 300; i++) kinds.add(rndtrap(ctx, l));
    });
    expect(kinds.has('nh:hole')).toBe(false);
    expect(kinds.has('nh:trap_door')).toBe(true);
    expect(kinds.size).toBeGreaterThan(10);
  });
});
