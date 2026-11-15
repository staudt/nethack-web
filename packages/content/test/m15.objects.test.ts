// m15 step 3: objects, boulders, ice, lava and swamps. Objects landing in water get wet and lie
// hidden, in lava they burn; the bottom of a pool is out of reach; a boulder fills a pool (9 in
// 10) or sinks; digging next to water floods the hole; lava burns the hero up or (fire
// resistant) she sinks into it; fire boils a pool away, cold freezes it into ice that melts again;
// she slips on ice; a gushing fountain makes pools; swamps are made. Outcomes are asserted, with
// searched seeds where a roll decides.
// ref: src/do.c flooreffects(), boulder_hits_pool(); src/trap.c lava_damage(), fire_damage(),
// lava_effects(), sink_into_lava(); src/dig.c fillholetyp(), liquid_flow(), dighole();
// src/zap.c zap_over_floor(), melt_ice(), start_melt_ice_timeout(); src/hack.c
// slippery_ice_fumbling(), pickup_checks(); src/timeout.c slip_or_trip(); src/fountain.c
// gush(); src/mkroom.c mkswamp()
import {
  createEngine,
  getLevel,
  getPlayer,
  itemsAt,
  trapAt,
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
import { zapOverFloor } from '../src/buzz';
import { dighole } from '../src/dig';
import { flooreffects } from '../src/flooreffects';
import { dogushforth } from '../src/fountain';
import { MELT_ICE_AWAY } from '../src/icestate';
import { dropx } from '../src/itemactions';
import { mksobj } from '../src/items';
import { setU } from '../src/luck';
import { mkswamp } from '../src/mkroom';
import { P, setIntrinsic, setItimeout } from '../src/props';
import { T, setTerrain, terrainIdAt } from '../src/terrain';
import { utrap } from '../src/trapstate';
import { SWAMP } from '../src/zoo';
import { ctxFor, itemOf, obj, plainKit, render } from './itemHelpers';
import { heroAt, mapSetup } from './maps';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'po',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'po:run',
      labelKey: 'po',
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
  return texts(engine.step(state, { type: 'mod', action: 'po:run' as DefId }).events);
};
const walk = (s: GameState, dir: string): StepResult =>
  engine.stepAll(s, { type: 'move', dir: dir as never });
const answer = (s: GameState, value: unknown): StepResult => {
  const p = s.pendingPrompt?.prompt;
  if (!p) throw new Error('no prompt');
  return engine.stepAll(s, { type: 'answer', promptId: p.id, value: value as never });
};
const wait = (s: GameState): StepResult => engine.stepAll(s, { type: 'wait' });

// a lit room with a pool east of the hero
const ROOM = ['------------', '|..........|', '|..@}......|', '|..........|', '------------'];
const POOL = { x: 4, y: 2 };

function make(rows = ROOM, seed = 1) {
  const m = mapSetup(rows, { seed });
  plainKit(m.state);
  getPlayer(m.state).c.hp = { cur: 200, max: 200 };
  return m;
}
const carry = (s: GameState, id: string): EntityId =>
  mksobj(ctxFor(s), obj(id), { init: false, carriedBy: s.playerId });
const free = (s: GameState, id: string): EntityId => mksobj(ctxFor(s), obj(id), { init: false });
const level = (s: GameState) => getLevel(s, 'dlvl1');
const terrain = (s: GameState, x: number, y: number) => terrainIdAt(level(s), x, y);
const place = (s: GameState, p: { x: number; y: number }) =>
  Object.assign(getPlayer(s).c.pos ?? {}, p);

describe('objects in water and lava', () => {
  test('dropped while floating over a pool: "Plop!", wet, and lying in the water', () => {
    const m = make();
    setU(ctxFor(m.state), { luck: -10 }); // nothing is spared the water
    setItimeout(m.state, getPlayer(m.state), P.LEVITATION, 50);
    place(m.state, POOL);
    const scroll = carry(m.state, 'nh:scroll_of_light');
    const t = withCtx(m.state, (ctx) => {
      const e = ctx.state.entities[String(scroll)];
      if (e) dropx(ctx, e);
    });
    expect(t).toContain('Plop!');
    expect(m.state.entities[String(scroll)]?.def).toBe('nh:scroll_of_blank_paper');
    expect(itemOf(m.state, scroll).carriedBy).toBeNull();
    expect(itemsAt(engine.registry, m.state, 'dlvl1', POOL.x, POOL.y).map((o) => o.id)).toContain(
      scroll,
    );
  });

  test('the bottom of a pool is out of reach unless she is in it', () => {
    const m = make();
    setItimeout(m.state, getPlayer(m.state), P.LEVITATION, 50);
    place(m.state, POOL);
    mksobj(ctxFor(m.state), obj('nh:dagger'), { init: false, at: { level: 'dlvl1', ...POOL } });
    const r = engine.step(m.state, { type: 'mod', action: 'nh:pickup' as DefId });
    expect(texts(r.events)).toContain(
      "You can't even see the bottom, let alone pick up something.",
    );
    expect(itemsAt(engine.registry, m.state, 'dlvl1', POOL.x, POOL.y)).toHaveLength(1);
  });

  test('lava burns up what is organic, burns scrolls, and leaves iron in it', () => {
    const m = make();
    setTerrain(level(m.state), POOL.x, POOL.y, T.lava);
    wait(m.state); // she sees the lava
    const ration = free(m.state, 'nh:food_ration');
    const dagger = free(m.state, 'nh:dagger');
    const t = withCtx(m.state, (ctx) => {
      for (const id of [ration, dagger]) {
        const e = ctx.state.entities[String(id)];
        if (e && !flooreffects(ctx, e, POOL.x, POOL.y, 'fall'))
          e.c.pos = { level: 'dlvl1', ...POOL };
      }
    });
    expect(t).toEqual(['You see a food ration hit lava and burn up!']);
    expect(m.state.entities[String(ration)]).toBeUndefined();
    expect(m.state.entities[String(dagger)]?.c.pos).toEqual({ level: 'dlvl1', ...POOL });
    const scroll = free(m.state, 'nh:scroll_of_light');
    const t2 = withCtx(m.state, (ctx) => {
      const e = ctx.state.entities[String(scroll)];
      if (e) flooreffects(ctx, e, POOL.x, POOL.y, 'fall');
    });
    expect(t2.some((x) => x.endsWith('catches fire and burns.'))).toBe(true);
    expect(m.state.entities[String(scroll)]).toBeUndefined();
  });
});

describe('boulders', () => {
  // a boulder east of the hero with water (or lava) beyond it
  const BROWS = ['------------', '|..........|', '|..@.}.....|', '|..........|', '------------'];
  function pushInto(seed: number, liquid: DefId) {
    const m = make(BROWS, seed);
    setTerrain(level(m.state), 5, 2, liquid);
    const b = mksobj(ctxFor(m.state), obj('nh:boulder'), {
      init: false,
      at: { level: 'dlvl1', x: 4, y: 2 },
    });
    const t = texts(walk(m.state, 'e').events);
    return { m, t, b };
  }

  test('a pushed boulder fills a pool 9 times in 10, else sinks; either way it is gone', () => {
    let filled = false;
    let sank = false;
    for (let seed = 1; seed <= 60 && !(filled && sank); seed++) {
      const { m, t, b } = pushInto(seed, T.pool);
      expect(m.state.entities[String(b)]).toBeUndefined();
      expect(heroAt(m.state)).toEqual({ x: 4, y: 2 });
      if (t.includes('Now you can cross it!')) {
        expect(t).toContain('You push the boulder into the pool of water.');
        expect(terrain(m.state, 5, 2)).toBe(T.floor);
        filled = true;
      } else {
        expect(t).toContain('There is a large splash as the boulder falls into the pool of water.');
        expect(t).toContain('It sinks without a trace!');
        expect(terrain(m.state, 5, 2)).toBe(T.pool);
        sank = true;
      }
    }
    expect(filled && sank).toBe(true);
  });

  test('a boulder pushed into lava mostly sinks (she is two squares off: no splash on her)', () => {
    let seen = false;
    for (let seed = 1; seed <= 20 && !seen; seed++) {
      const { m, t } = pushInto(seed, T.lava);
      if (!t.includes('It sinks without a trace!')) continue;
      expect(t).toContain('There is a large splash as the boulder falls into the molten lava.');
      expect(t).not.toContain('You are hit by molten lava!');
      expect(getPlayer(m.state).c.hp?.cur).toBe(200);
      expect(terrain(m.state, 5, 2)).toBe(T.lava);
      seen = true;
    }
    expect(seen).toBe(true);
  });
});

describe('digging next to water', () => {
  // the spot (7, 2) has a pool on each of its eight sides
  const DROWS = ['------------', '|.....}}}..|', '|..@..}.}..|', '|.....}}}..|', '------------'];
  test('the hole fills with water (pools count a third: rn2(3) of 8/3)', () => {
    let flooded = false;
    let dug = false;
    for (let seed = 1; seed <= 30 && !(flooded && dug); seed++) {
      const m = make(DROWS, seed);
      const t = withCtx(m.state, (ctx) => void dighole(ctx, false, true, { x: 7, y: 2 }));
      if (t.includes('As you dig, the hole fills with water!')) {
        expect(terrain(m.state, 7, 2)).toBe(T.pool);
        expect(trapAt(level(m.state), 7, 2)).toBeUndefined();
        flooded = true;
      } else {
        expect(trapAt(level(m.state), 7, 2)).toBeDefined();
        dug = true;
      }
    }
    expect(flooded && dug).toBe(true);
  });

  test('digging into the water only sloshes it', () => {
    const m = make();
    const t = withCtx(m.state, (ctx) => void dighole(ctx, false, true, POOL));
    expect(t).toContain('The water sloshes furiously for a moment, then subsides.');
    expect(terrain(m.state, POOL.x, POOL.y)).toBe(T.pool);
  });
});

describe('the hero in lava', () => {
  function onLava(fireRes: boolean) {
    const m = make();
    setTerrain(level(m.state), POOL.x, POOL.y, T.lava);
    wait(m.state);
    if (fireRes) setIntrinsic(getPlayer(m.state), P.FIRE_RES, true);
    const r = walk(m.state, 'e');
    expect(r.prompt?.key).toBe('liquid.confirm');
    return { m, t: texts(answer(m.state, true).events) };
  }

  test('without fire resistance she burns to a crisp', () => {
    const { m, t } = onLava(false);
    expect(t).toContain('You fall into the molten lava!');
    expect(t).toContain('You burn to a crisp...');
    expect(m.state.gameOver?.killer).toBe('@killer.lava');
    expect(render({ key: 'end.killer.burning', params: { killer: 'molten lava' } })).toBe(
      'burned by molten lava',
    );
  });

  test('fire resistant she sinks in, and pulls herself out by walking off', () => {
    const { m, t } = onLava(true);
    expect(t).toContain('You sink into the molten lava, but it only burns slightly!');
    expect(utrap(ctxFor(m.state))?.type).toBe('lava');
    const all: string[] = [];
    for (let i = 0; i < 20 && heroAt(m.state).x === POOL.x; i++)
      all.push(...texts(walk(m.state, 'w').events));
    expect(all).toContain('You are stuck in the lava.');
    expect(all).toContain('You pull yourself to the edge of the lava.');
    expect(heroAt(m.state)).toEqual({ x: 3, y: 2 });
    expect(m.state.gameOver).toBeNull();
  });

  test('fire resistant and staying put she sinks deeper until she dies', () => {
    const { m } = onLava(true);
    const all: string[] = [];
    for (let i = 0; i < 40 && !m.state.gameOver; i++) all.push(...texts(wait(m.state).events));
    expect(all).toContain('You sink deeper into the lava.');
    expect(all).toContain('You sink below the surface and die.');
    expect(m.state.gameOver?.killer).toBe('@killer.lava');
  });
});

describe('fire and cold over water', () => {
  test('fire boils a pool into a pit', () => {
    const m = make();
    const t = withCtx(m.state, (ctx) => void zapOverFloor(ctx, 'fire', POOL.x, POOL.y));
    expect(t).toContain('The water evaporates.');
    expect(terrain(m.state, POOL.x, POOL.y)).toBe(T.floor);
    expect(trapAt(level(m.state), POOL.x, POOL.y)?.def).toBe('nh:pit');
  });

  test('cold freezes a pool into ice that melts back into a pool', () => {
    let done = false;
    for (let seed = 1; seed <= 10 && !done; seed++) {
      const m = make(ROOM, seed);
      const t = withCtx(m.state, (ctx) => void zapOverFloor(ctx, 'cold', POOL.x, POOL.y));
      expect(t).toContain('The water freezes.');
      expect(terrain(m.state, POOL.x, POOL.y)).toBe(T.ice);
      const timer = m.state.timers.find((x) => x.kind === MELT_ICE_AWAY);
      if (!timer) continue; // permanent ice (about 1 time in 40)
      expect(timer.at - m.state.turn).toBeGreaterThanOrEqual(50);
      timer.at = m.state.turn + 1;
      const t2 = texts(wait(m.state).events);
      expect(t2).toContain('Some ice melts away.');
      expect(terrain(m.state, POOL.x, POOL.y)).toBe(T.pool);
      done = true;
    }
    expect(done).toBe(true);
  });

  test('a moat is bridged with ice; fire melts it back into a moat', () => {
    const m = make();
    setTerrain(level(m.state), POOL.x, POOL.y, T.moat);
    const t = withCtx(m.state, (ctx) => void zapOverFloor(ctx, 'cold', POOL.x, POOL.y));
    expect(t).toContain('The moat is bridged with ice!');
    const t2 = withCtx(m.state, (ctx) => void zapOverFloor(ctx, 'fire', POOL.x, POOL.y));
    expect(t2).toContain('The ice crackles and melts.');
    expect(terrain(m.state, POOL.x, POOL.y)).toBe(T.moat);
    expect(m.state.timers.some((x) => x.kind === MELT_ICE_AWAY)).toBe(false);
  });

  test('cold cools lava into floor for good', () => {
    const m = make();
    setTerrain(level(m.state), POOL.x, POOL.y, T.lava);
    const t = withCtx(m.state, (ctx) => void zapOverFloor(ctx, 'cold', POOL.x, POOL.y));
    expect(t).toContain('The lava cools and solidifies.');
    expect(terrain(m.state, POOL.x, POOL.y)).toBe(T.floor);
    expect(m.state.timers.some((x) => x.kind === MELT_ICE_AWAY)).toBe(false);
  });
});

describe('ice', () => {
  const IROWS = ['------------', '|..........|', '|..@.......|', '|..........|', '------------'];
  function iceWalk(coldRes: boolean): string[] {
    const m = make(IROWS, 3);
    for (let x = 1; x <= 10; x++) setTerrain(level(m.state), x, 2, T.ice);
    // (a Valkyrie is born cold resistant)
    setIntrinsic(getPlayer(m.state), P.COLD_RES, coldRes);
    const all: string[] = [];
    for (let i = 0; i < 30; i++) all.push(...texts(walk(m.state, i % 2 ? 'w' : 'e').events));
    return all;
  }
  const slipped = (t: string[]): boolean =>
    t.some((x) => /You (slip|slide) (on|off) the ice\./.test(x));

  test('walking on ice she slips now and then', () => {
    expect(slipped(iceWalk(false))).toBe(true);
  });

  test('cold resistant she keeps her footing', () => {
    expect(slipped(iceWalk(true))).toBe(false);
  });
});

describe('fountains and swamps', () => {
  const BIG = [
    '--------------------',
    '|..................|',
    '|..................|',
    '|........@.........|',
    '|..................|',
    '|..................|',
    '--------------------',
  ];

  test('a gushing fountain makes pools on every other square, never hers', () => {
    let made = false;
    for (let seed = 1; seed <= 20 && !made; seed++) {
      const m = make(BIG, seed);
      const t = withCtx(m.state, (ctx) => dogushforth(ctx, true));
      const lv = level(m.state);
      const pools: { x: number; y: number }[] = [];
      for (let y = 0; y < lv.height; y++)
        for (let x = 0; x < lv.width; x++)
          if (terrainIdAt(lv, x, y) === T.pool) pools.push({ x, y });
      if (pools.length === 0) {
        expect(t).toContain('Your thirst is quenched.');
        continue;
      }
      expect(t).toContain('Water gushes forth from the overflowing fountain!');
      for (const p of pools) {
        expect((p.x + p.y) % 2).toBe(0);
        expect(p).not.toEqual(heroAt(m.state));
      }
      made = true;
    }
    expect(made).toBe(true);
  });

  test('a swamp: pools in a checkerboard with an eel, fungi between', () => {
    const m = make(BIG, 2);
    const lv = level(m.state);
    lv.rooms = [{ lx: 1, ly: 1, hx: 18, hy: 5, lit: true }];
    // the hero stands elsewhere so the squares are free
    place(m.state, { x: 0, y: 0 });
    withCtx(m.state, (ctx) => mkswamp(ctx, ctx.state.levels['dlvl1'] ?? lv));
    expect(lv.rooms[0]?.type).toBe(SWAMP);
    let pools = 0;
    const eels: string[] = [];
    for (let y = 1; y <= 5; y++)
      for (let x = 1; x <= 18; x++) {
        if (terrainIdAt(lv, x, y) !== T.pool) continue;
        expect((x + y) % 2).toBe(1);
        pools++;
      }
    expect(pools).toBeGreaterThan(0);
    for (const e of Object.values(m.state.entities)) {
      const p = e.c.pos;
      if (!e.c.monster || !p || p.level !== 'dlvl1') continue;
      if (terrainIdAt(lv, p.x, p.y) === T.pool) eels.push(e.def);
      else expect(e.def.startsWith('nh:') && engine.registry.monster(e.def).glyph.ch).toBe('F');
    }
    expect(eels.length).toBeGreaterThan(0);
    for (const d of eels) expect(['nh:giant_eel', 'nh:piranha', 'nh:electric_eel']).toContain(d);
  });
});
