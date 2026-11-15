// m15 step 1: the hero in water. Stepping into known water asks first; a hero who cannot swim
// falls in, her pack gets wet, she crawls out (dropping gear when too heavy) or drowns, and life
// saving puts her on dry land; water walking boots keep her on top, levitation over it; ending
// levitation over a pool drops her in; swimming forms go into the water; travel goes around it;
// what lies in it is not shown; the wizard wishes for it. Outcomes are asserted (crawling out
// is checked for whatever square the shuffled directions pick).
// ref: src/hack.c swim_move_danger(), pooleffects(); src/trap.c drown(), emergency_disrobe(),
// float_down(); src/do_wear.c Boots_off(); src/sit.c dosit(); src/objnam.c wizterrainwish()
import {
  buildSnapshot,
  createEngine,
  getPlayer,
  inventoryOf,
  itemsAt,
  type Ctx,
  type DefId,
  type EntityId,
  type GameEvent,
  type GameState,
  type Mod,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import { pooleffects } from '../src/drown';
import { mksobj } from '../src/items';
import { floatDown } from '../src/levitation';
import { setU } from '../src/luck';
import { discover } from '../src/o_init';
import { polymon } from '../src/polyself';
import { P, setItimeout, updateWornProps } from '../src/props';
import { nearCapacity } from '../src/stats';
import { T, setTerrain, terrainIdAt } from '../src/terrain';
import { uinwater } from '../src/uwater';
import { wizTerrainWish } from '../src/wizard/terrainwish';
import { ctxFor, itemOf, obj, plainKit, render } from './itemHelpers';
import { heroAt, mapSetup, runDir, travelTo } from './maps';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'pw',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'pw:run',
      labelKey: 'pw',
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
  return texts(engine.step(state, { type: 'mod', action: 'pw:run' as DefId }).events);
};
const walk = (s: GameState, dir: string): StepResult =>
  engine.stepAll(s, { type: 'move', dir: dir as never });
const answer = (s: GameState, value: unknown): StepResult => {
  const p = s.pendingPrompt?.prompt;
  if (!p) throw new Error('no prompt');
  return engine.stepAll(s, { type: 'answer', promptId: p.id, value: value as never });
};

// a lit room with a pool east of the hero
const ROOM = ['----------', '|........|', '|..@}....|', '|........|', '----------'];
const POOL = { x: 4, y: 2 };

function make(rows = ROOM, seed = 1) {
  const m = mapSetup(rows, { seed });
  plainKit(m.state);
  getPlayer(m.state).c.hp = { cur: 200, max: 200 };
  return m;
}
const ctxOf = (s: GameState) => ctxFor(s);
const carry = (s: GameState, id: string): EntityId =>
  mksobj(ctxOf(s), obj(id), { init: false, carriedBy: s.playerId });

function wear(s: GameState, id: EntityId, slot: 'boots' | 'amulet'): void {
  itemOf(s, id).equipped = slot;
  updateWornProps(s, engine.registry, s.playerId);
}
const pos = (s: GameState) => heroAt(s);

describe('stepping into the water', () => {
  test('known water asks first; no answers stay put, yes falls in and crawls out wet', () => {
    const m = make();
    setU(ctxOf(m.state), { luck: -10 }); // nothing is spared the water
    const scroll = carry(m.state, 'nh:scroll_of_light');
    const r = walk(m.state, 'e');
    expect(r.prompt?.key).toBe('liquid.confirm');
    expect(render({ key: r.prompt?.key ?? '', params: r.prompt?.params ?? {} })).toBe(
      'Really step into the pool of water?',
    );
    answer(m.state, false);
    expect(pos(m.state)).toEqual({ x: 3, y: 2 });
    walk(m.state, 'e');
    const t = texts(answer(m.state, true).events);
    expect(t).toContain('You fall into the pool of water!');
    expect(t).toContain('You sink like a rock.');
    expect(t).toContain('You try to crawl out of the water.');
    expect(t).toContain('Pheew!  That was close.');
    expect(t.some((x) => x.includes('fades'))).toBe(true);
    expect(m.state.entities[String(scroll)]?.def).toBe('nh:scroll_of_blank_paper');
    const p = pos(m.state);
    expect(p).not.toEqual(POOL);
    expect(Math.max(Math.abs(p.x - POOL.x), Math.abs(p.y - POOL.y))).toBe(1);
    expect(uinwater(ctxOf(m.state))).toBe(false);
    expect(m.state.gameOver).toBeNull();
  });

  test('stunned, she is not asked and falls in', () => {
    // search for a seed where the stunned step goes east
    let r: StepResult | null = null;
    for (let seed = 1; seed < 200; seed++) {
      const n = make(ROOM, seed);
      setItimeout(n.state, getPlayer(n.state), P.STUNNED, 50);
      r = walk(n.state, 'e');
      if (texts(r.events).includes('You fall into the pool of water!')) break;
      r = null;
    }
    expect(r).not.toBeNull();
    expect(r?.prompt ?? null).toBeNull();
  });

  test('a heavy load is dumped to crawl out', () => {
    const m = make();
    const rocks = [carry(m.state, 'nh:boulder'), carry(m.state, 'nh:boulder')];
    Object.assign(getPlayer(m.state).c.pos ?? {}, POOL);
    const t = withCtx(m.state, (ctx) => void pooleffects(ctx, true));
    expect(t).toContain('You try to crawl out of the water.');
    expect(t).toContain('You dump some of your gear to lose weight...');
    expect(t).toContain('Pheew!  That was close.');
    for (const r of rocks) expect(itemOf(m.state, r).carriedBy).toBeNull();
    expect(itemsAt(engine.registry, m.state, 'dlvl1', POOL.x, POOL.y).length).toBeGreaterThan(1);
    expect(nearCapacity(m.state, engine.registry, m.state.playerId)).toBeLessThanOrEqual(1);
    expect(pos(m.state)).not.toEqual(POOL);
  });
});

// a pool walled in on all sides, and a room to land in
const WALLED = ['----- ---', '|...| |}|', '|...| ---', '-----    '];
const WPOOL = { x: 7, y: 1 };

describe('drowning', () => {
  test('with nowhere to crawl she drowns in a pool of water', () => {
    const m = make(WALLED);
    Object.assign(getPlayer(m.state).c.pos ?? {}, WPOOL);
    const t = withCtx(m.state, (ctx) => void pooleffects(ctx, true));
    expect(t).toContain('You drown.');
    expect(m.state.gameOver?.killer).toBe('@killer.drown.pool');
    expect(render({ key: 'end.killer.drowning', params: { killer: 'a pool of water' } })).toBe(
      'drowned in a pool of water',
    );
  });

  test('life saving puts her on dry land', () => {
    const m = make(WALLED);
    const amulet = carry(m.state, 'nh:amulet_of_life_saving');
    wear(m.state, amulet, 'amulet');
    Object.assign(getPlayer(m.state).c.pos ?? {}, WPOOL);
    const t = withCtx(m.state, (ctx) => void pooleffects(ctx, true));
    expect(t).toContain('You drown.');
    expect(t).toContain('But wait...');
    expect(m.state.gameOver).toBeNull();
    expect(m.state.entities[String(amulet)]).toBeUndefined();
    const p = pos(m.state);
    expect(terrainIdAt(m.level, p.x, p.y)).toBe(T.floor);
    expect(t.some((x) => /^You find yourself on solid ground\.$/.test(x))).toBe(true);
    expect(uinwater(ctxOf(m.state))).toBe(false);
  });
});

describe('staying above the water', () => {
  test('water walking boots walk on it; once known she is not asked', () => {
    const m = make();
    const boots = carry(m.state, 'nh:water_walking_boots');
    wear(m.state, boots, 'boots');
    const r = walk(m.state, 'e');
    expect(r.prompt?.key).toBe('liquid.confirm'); // she does not know what her boots are
    const t = texts(answer(m.state, true).events);
    expect(pos(m.state)).toEqual(POOL);
    expect(t.some((x) => x.includes('fall into'))).toBe(false);
    // off the pool and back on, knowing the boots
    walk(m.state, 'w');
    discover(ctxOf(m.state), 'nh:water_walking_boots');
    const r2 = walk(m.state, 'e');
    expect(r2.prompt).toBeNull();
    expect(pos(m.state)).toEqual(POOL);
  });

  test('taking the boots off on the water drops her in', () => {
    const m = make();
    const boots = carry(m.state, 'nh:water_walking_boots');
    wear(m.state, boots, 'boots');
    Object.assign(getPlayer(m.state).c.pos ?? {}, POOL);
    const t = texts(
      engine.stepAll(m.state, { type: 'mod', action: 'nh:takeoff' as DefId, args: { item: boots } })
        .events,
    );
    expect(t).toContain('You fall into the pool of water!');
    expect(pos(m.state)).not.toEqual(POOL);
  });

  test('levitating over it is safe; when the levitation ends she falls in', () => {
    const m = make();
    setItimeout(m.state, getPlayer(m.state), P.LEVITATION, 100);
    const r = walk(m.state, 'e');
    expect(r.prompt).toBeNull();
    expect(pos(m.state)).toEqual(POOL);
    expect(texts(r.events).some((x) => x.includes('fall into'))).toBe(false);
    const t = withCtx(m.state, (ctx) => void floatDown(ctx, true));
    expect(t).toContain('You fall into the pool of water!');
    expect(t.some((x) => x.includes('float gently'))).toBe(false);
    expect(pos(m.state)).not.toEqual(POOL);
  });
});

describe('swimming forms', () => {
  test('a crocodile goes into the water and back out', () => {
    const m = make();
    withCtx(m.state, (ctx) => void polymon(ctx, 'nh:crocodile' as DefId, false));
    walk(m.state, 'e');
    const t = texts(answer(m.state, true).events);
    expect(t).toContain('You fall into the pool of water.');
    expect(t).not.toContain('You sink like a rock.');
    expect(t).toContain("But you aren't drowning.");
    expect(t).toContain('You touch bottom.');
    expect(pos(m.state)).toEqual(POOL);
    expect(uinwater(ctxOf(m.state))).toBe(true);
    // waiting in the water is safe
    engine.stepAll(m.state, { type: 'wait' });
    expect(pos(m.state)).toEqual(POOL);
    expect(m.state.gameOver).toBeNull();
    const back = texts(walk(m.state, 'w').events);
    expect(back).toContain('You are back on solid ground.');
    expect(uinwater(ctxOf(m.state))).toBe(false);
  });
});

describe('the map', () => {
  test('an object in the water is not shown or described', () => {
    const m = make();
    mksobj(ctxOf(m.state), obj('nh:food_ration'), { init: false, at: { level: 'dlvl1', ...POOL } });
    mksobj(ctxOf(m.state), obj('nh:food_ration'), {
      init: false,
      at: { level: 'dlvl1', x: 5, y: 2 },
    });
    engine.stepAll(m.state, { type: 'wait' });
    const snap = buildSnapshot(engine.registry, m.state);
    expect(snap.cells[POOL.y * snap.width + POOL.x]?.o).toBeUndefined();
    expect(snap.cells[2 * snap.width + 5]?.o).toBe('nh:food_ration');
    const q = engine.query(m.state);
    expect(q.describe(POOL).objects).toEqual([]);
    expect(q.describe({ x: 5, y: 2 }).objects.length).toBe(1);
  });

  test('travel goes around the water', () => {
    // a column of water with a gap at the bottom
    const rows = ['---------', '|...}...|', '|.@.}...|', '|...}...|', '|.......|', '---------'];
    const m = make(rows);
    const seen: { x: number; y: number }[] = [];
    for (let i = 0; i < 20 && !(pos(m.state).x === 6 && pos(m.state).y === 2); i++) {
      const r = engine.stepAll(m.state, travelTo(6, 2));
      for (const e of r.events)
        if (e.type === 'moved' && e.id === m.state.playerId) seen.push(e.to);
      if (r.prompt) break;
    }
    expect(pos(m.state)).toEqual({ x: 6, y: 2 });
    expect(seen.some((p) => p.x === 4)).toBe(true);
    expect(seen.some((p) => p.x === 4 && p.y < 4)).toBe(false);
  });

  test('running stops at the edge of the water', () => {
    // a pool beside the way does not stop her, one in front does
    const rows = ['------------', '|@.....}...|', '|...}......|', '------------'];
    const m = make(rows);
    for (const mode of ['rush', 'run']) {
      Object.assign(getPlayer(m.state).c.pos ?? {}, { x: 1, y: 1 });
      const r = engine.stepAll(m.state, runDir('e', mode));
      expect(r.prompt).toBeNull();
      expect(pos(m.state)).toEqual({ x: 6, y: 1 });
    }
  });

  test('the wizard wishes for a pool, a moat, a wall of water, lava and ice', () => {
    const m = make();
    const say = (w: string): string[] => withCtx(m.state, (ctx) => void wizTerrainWish(ctx, w));
    Object.assign(getPlayer(m.state).c.pos ?? {}, { x: 6, y: 3 });
    expect(say('ice')).toContain('Ice.');
    expect(terrainIdAt(m.level, 6, 3)).toBe(T.ice);
    expect(say('moat')).toContain('A moat.');
    expect(terrainIdAt(m.level, 6, 3)).toBe(T.moat);
    // she stands on the moat: the next turn spent there drops her in
    const t = texts(engine.stepAll(m.state, { type: 'search' }).events);
    expect(t).toContain('You fall into the moat!');
    setTerrain(m.level, 7, 1, T.floor);
    Object.assign(getPlayer(m.state).c.pos ?? {}, { x: 7, y: 1 });
    expect(say('pool')).toContain('A pool of water.');
    expect(terrainIdAt(m.level, 7, 1)).toBe(T.pool);
    // she is on top of the pool: the others are made under her as well
    setItimeout(m.state, getPlayer(m.state), P.LEVITATION, 100);
    expect(say('wall of water')).toContain('A wall of water.');
    expect(terrainIdAt(m.level, 7, 1)).toBe(T.water);
    expect(say('lava')).toContain('A pool of molten lava.');
    expect(terrainIdAt(m.level, 7, 1)).toBe(T.lava);
  });
});

describe('sitting', () => {
  test('water walking, she sits in the water', () => {
    const m = make();
    const boots = carry(m.state, 'nh:water_walking_boots');
    wear(m.state, boots, 'boots');
    Object.assign(getPlayer(m.state).c.pos ?? {}, POOL);
    const t = texts(engine.stepAll(m.state, { type: 'mod', action: 'nh:sit' as DefId }).events);
    expect(t).toContain('You sit in the water.');
    expect(inventoryOf(m.state, m.state.playerId).length).toBeGreaterThan(0);
  });
});
