// m15 step 2: monsters and water. Monsters keep out of water and lava unless they swim, fly or
// like lava; a monster put into water drowns (or burns in lava), gremlins multiply, eels stay in
// the water, hide in it and drown a hero they hold, a pet goes around a pool, and goodpos()
// refuses water to a non-swimmer. Outcomes are asserted; random rolls are stubbed or searched.
// ref: src/mon.c mfndpos(), minliquid_core(), hideunder(); src/teleport.c goodpos();
// src/uhitm.c mhitm_ad_wrap(); src/dothrow.c mhurtle(); src/dogmove.c could_reach_item()
import {
  getPlayer,
  itemsAt,
  sortedIds,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type GameEvent,
  type GameState,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import { makemon } from '../src/generation';
import { setUstuck } from '../src/hackmove';
import { hideunder, isUndetected } from '../src/hide';
import { monLiquidOk } from '../src/liquid';
import { mhurtle } from '../src/mhurtle';
import { minliquid } from '../src/minliquid';
import { isFleeing } from '../src/monflee';
import { mfndpos } from '../src/monmove';
import { goodposMon } from '../src/teleport';
import { T, setTerrain } from '../src/terrain';
import { cellRules, createEngine } from '@nh/core';
import { render } from './itemHelpers';
import { mapSetup } from './maps';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'pm',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'pm:run',
      labelKey: 'pm',
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
const texts = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [render({ key: e.key, params: e.params ?? {} })] : []));
const withCtx = (state: GameState, fn: (ctx: Ctx) => void): string[] => {
  probe.fn = fn;
  return texts(engine.step(state, { type: 'mod', action: 'pm:run' as DefId }).events);
};
const mon = (s: GameState, id: EntityId): Entity => {
  const e = s.entities[String(id)];
  if (!e) throw new Error(`no entity ${id}`);
  return e;
};
const alive = (s: GameState, id: EntityId): boolean =>
  s.entities[String(id)]?.c.monster !== undefined;
const count = (s: GameState, def: string): number =>
  sortedIds(s).filter((i) => s.entities[String(i)]?.def === def && alive(s, i)).length;

/** Makes a monster of `def` at (x, y) (hostile, awake unless `asleep`). */
function spawn(s: GameState, def: string, x: number, y: number, asleep = false): EntityId {
  let id: EntityId | null = null;
  withCtx(s, (ctx) => {
    id = makemon(
      ctx,
      ctx.defs.monster(def as DefId),
      { x, y },
      { angry: true, asleep, noInventory: true },
    );
  });
  if (id === null) throw new Error(`no ${def}`);
  return id;
}

// a lit room with a pool to the east of the hero; the pool is (5, 2)..(6, 3)
const ROOM = [
  '------------',
  '|..........|',
  '|..@.}}....|',
  '|....}}....|',
  '|..........|',
  '------------',
];

function make(seed = 1) {
  const m = mapSetup(ROOM, { seed });
  getPlayer(m.state).c.hp = { cur: 200, max: 200 };
  return m;
}

describe('goodpos() and mfndpos() keep monsters out of water', () => {
  test('goodpos() refuses water to a non-swimmer and takes a swimmer or flyer', () => {
    const m = make();
    const orc = spawn(m.state, 'nh:hill_orc', 2, 4, true);
    const bat = spawn(m.state, 'nh:bat', 9, 1, true);
    const croc = spawn(m.state, 'nh:crocodile', 9, 4, true);
    withCtx(m.state, (ctx) => {
      expect(goodposMon(ctx, m.level, 5, 2, orc)).toBe(false);
      expect(goodposMon(ctx, m.level, 4, 1, orc)).toBe(true);
      expect(goodposMon(ctx, m.level, 5, 2, bat)).toBe(true);
      expect(goodposMon(ctx, m.level, 5, 2, croc)).toBe(true);
    });
  });

  test("monLiquidOk(): an eel out of water 12 times in 13; lava for lava lovers, never an eye's", () => {
    const m = make();
    const d = (id: string) => engine.registry.monster(id as DefId);
    const ctx = (roll: number) => ({ defs: engine.registry, rng: { rn2: () => roll } });
    const eel = d('nh:giant_eel');
    expect(monLiquidOk(ctx(1), m.level, 5, 2, eel, false)).toBe(true); // in the pool
    expect(monLiquidOk(ctx(1), m.level, 2, 1, eel, false)).toBe(false); // rn2(13) != 0
    expect(monLiquidOk(ctx(0), m.level, 2, 1, eel, false)).toBe(true); // the 1 in 13
    setTerrain(m.level, 9, 1, T.lava);
    expect(monLiquidOk(ctx(1), m.level, 9, 1, d('nh:hill_orc'), false)).toBe(false);
    expect(monLiquidOk(ctx(1), m.level, 9, 1, d('nh:fire_elemental'), false)).toBe(true);
    expect(monLiquidOk(ctx(1), m.level, 9, 1, d('nh:bat'), true)).toBe(true);
    expect(monLiquidOk(ctx(1), m.level, 9, 1, d('nh:floating_eye'), true)).toBe(false);
    setTerrain(m.level, 9, 2, T.water); // a wall of water: only swimmers
    expect(monLiquidOk(ctx(1), m.level, 9, 2, d('nh:bat'), true)).toBe(false);
    expect(monLiquidOk(ctx(1), m.level, 9, 2, d('nh:crocodile'), false)).toBe(true);
  });

  test('a walker gets no pool square, a flyer does, an eel only pool squares', () => {
    const m = make();
    const orc = spawn(m.state, 'nh:hill_orc', 4, 2, true);
    const bat = spawn(m.state, 'nh:bat', 4, 3, true);
    const eel = spawn(m.state, 'nh:giant_eel', 6, 2, true);
    const hero = { x: 1, y: 1 };
    withCtx(m.state, (ctx) => {
      const rules = cellRules(m.level, ctx.defs);
      const pool = (c: { x: number; y: number }) => c.x >= 5 && c.x <= 6 && c.y >= 2 && c.y <= 3;
      const o = mfndpos(ctx, m.level, rules, orc, hero);
      expect(o.length).toBeGreaterThan(0);
      expect(o.some(pool)).toBe(false);
      expect(mfndpos(ctx, m.level, rules, bat, hero).some(pool)).toBe(true);
      const e = mfndpos(ctx, m.level, rules, eel, hero);
      expect(e.length).toBeGreaterThan(0);
      expect(e.every(pool)).toBe(true);
    });
  });

  test('an eel with no water next to it crawls over land; in a one-square pool it stays', () => {
    const m = make();
    const eel = spawn(m.state, 'nh:giant_eel', 9, 2, true);
    withCtx(m.state, (ctx) => {
      const rules = cellRules(m.level, ctx.defs);
      expect(mfndpos(ctx, m.level, rules, eel, { x: 1, y: 1 }).length).toBeGreaterThan(0);
      setTerrain(m.level, 9, 2, T.pool);
      expect(mfndpos(ctx, m.level, rules, eel, { x: 1, y: 1 })).toEqual([]);
    });
  });

  test('a pet goes around the pool', () => {
    const m = make();
    const dog = spawn(m.state, 'nh:little_dog', 4, 2, true);
    const d = mon(m.state, dog).c.monster;
    if (d) d.tame = 10;
    withCtx(m.state, (ctx) => {
      const rules = cellRules(m.level, ctx.defs);
      const c = mfndpos(ctx, m.level, rules, dog, { x: 3, y: 2 }, { allowTraps: true });
      expect(c.length).toBeGreaterThan(0);
      expect(c.some((p) => p.x === 5 && p.y >= 2)).toBe(false);
    });
  });
});

describe('minliquid()', () => {
  test('a hill orc pushed into the pool drowns', () => {
    const m = make();
    const orc = spawn(m.state, 'nh:hill_orc', 4, 2, true);
    const t = withCtx(m.state, (ctx) => mhurtle(ctx, mon(m.state, orc), 1, 0, 1));
    expect(t).toContain('The hill orc drowns.');
    expect(alive(m.state, orc)).toBe(false);
  });

  test('a monster standing in water drowns at its next move', () => {
    const m = make();
    const orc = spawn(m.state, 'nh:hill_orc', 5, 3, true);
    let t: string[] = [];
    // (its first move may wait a turn for movement points)
    for (let i = 0; i < 5 && alive(m.state, orc); i++)
      t = texts(engine.stepAll(m.state, { type: 'wait' }).events);
    expect(t).toContain('The hill orc drowns.');
    expect(alive(m.state, orc)).toBe(false);
  });

  test('a gremlin in the pool multiplies', () => {
    const m = make();
    const g = spawn(m.state, 'nh:gremlin', 6, 3, true);
    const hp = mon(m.state, g).c.hp;
    if (hp) Object.assign(hp, { cur: 40, max: 40 });
    let t: string[] = [];
    for (let i = 0; i < 10 && count(m.state, 'nh:gremlin') === 1; i++)
      t = withCtx(m.state, (ctx) => void minliquid(ctx, mon(m.state, g)));
    expect(count(m.state, 'nh:gremlin')).toBe(2);
    expect(t).toContain('The gremlin multiplies!');
    expect(alive(m.state, g)).toBe(true);
  });

  test('a monster on lava burns to a crisp; a fire resistant one burns slightly and gets out', () => {
    const m = make();
    setTerrain(m.level, 4, 1, T.lava);
    setTerrain(m.level, 2, 1, T.lava);
    const orc = spawn(m.state, 'nh:hill_orc', 4, 1, true);
    const t = withCtx(m.state, (ctx) => void minliquid(ctx, mon(m.state, orc)));
    expect(t).toContain('The hill orc burns to a crisp.');
    expect(alive(m.state, orc)).toBe(false);
    expect(
      itemsAt(engine.registry, m.state, 'dlvl1', 4, 1).some((o) => o.def === 'nh:corpse'),
    ).toBe(false);
    // a red mold (speed 0) is checked once a turn
    const mold = spawn(m.state, 'nh:red_mold', 2, 1, true);
    const hp = mon(m.state, mold).c.hp;
    if (hp) Object.assign(hp, { cur: 20, max: 20 });
    const r = engine.stepAll(m.state, { type: 'wait' });
    expect(texts(r.events)).toContain('The red mold burns slightly.');
    expect(alive(m.state, mold)).toBe(true);
    expect(mon(m.state, mold).c.hp?.cur).toBeLessThan(20);
    expect(mon(m.state, mold).c.pos).not.toMatchObject({ x: 2, y: 1 });
  });

  test('an eel on land gasps: it flees', () => {
    const m = make();
    const eel = spawn(m.state, 'nh:giant_eel', 9, 4, true);
    withCtx(m.state, (ctx) => void minliquid(ctx, mon(m.state, eel)));
    expect(isFleeing({ state: m.state }, eel)).toBe(true);
  });
});

describe('eels', () => {
  test('an eel hides in water, not on land', () => {
    const m = make();
    const wet = spawn(m.state, 'nh:giant_eel', 6, 3, true);
    const dry = spawn(m.state, 'nh:giant_eel', 9, 4, true);
    withCtx(m.state, (ctx) => {
      expect(hideunder(ctx, wet)).toBe(true);
      expect(hideunder(ctx, dry)).toBe(false);
    });
    expect(isUndetected({ state: m.state }, wet)).toBe(true);
    expect(isUndetected({ state: m.state }, dry)).toBe(false);
  });

  test('an eel holding her next to its pool drowns her', () => {
    const m = make();
    // she stands on land next to the pool, held by the eel in it
    Object.assign(getPlayer(m.state).c.pos ?? {}, { x: 4, y: 2 });
    const eel = spawn(m.state, 'nh:giant_eel', 5, 2);
    withCtx(m.state, (ctx) => setUstuck(ctx, eel));
    let t: string[] = [];
    for (let i = 0; i < 60 && m.state.gameOver === null; i++)
      t = texts(engine.stepAll(m.state, { type: 'wait' }).events);
    expect(t).toContain('The giant eel drowns you...');
    expect(m.state.gameOver?.killer).toBe('@killer.drown_by.pool.nh:giant_eel');
    expect(render('@killer.drown_by.pool.nh:giant_eel')).toBe('a pool of water by a giant eel');
  });
});
