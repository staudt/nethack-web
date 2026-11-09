// m12 step 3: beehives, cockatrice nests, antholes and barracks (fill_zoo()'s four cases),
// squadmon(), antholemon(), mk_tt_object(), the entry messages, eating royal jelly and a killer
// bee eating it (bee_eat_jelly()).
import {
  createEngine,
  getLevel,
  getPlayer,
  sortedIds,
  type Ctx,
  type DefId,
  type Entity,
  type GameEvent,
  type GameState,
  type Level,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import {
  ANTHOLE,
  BARRACKS,
  BEEHIVE,
  COCKNEST,
  WIZ_MKROOM,
  antholemon,
  fillZoo,
  mkTtObject,
  squadmon,
  vanillaMod,
  wizardMod,
} from '../src/index';
import { abase, setAbase } from '../src/attrstate';
import { mInitWeap } from '../src/mongear';
import { polymon } from '../src/polyself';
import { P, hasProp, setItimeout } from '../src/props';
import { T, setTerrain } from '../src/terrain';
import { heroFormId } from '../src/upoly';
import { setGenocided } from '../src/vanquished';
import { addMon } from './helpers';
import { itemOf, levelSetup, plainKit, render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'ph',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'ph:run',
      labelKey: 'ph',
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
const wiz = createEngine([vanillaMod, wizardMod, probeMod]);
const texts = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [render({ key: e.key, params: e.params ?? {} })] : []));
function withCtx(state: GameState, fn: (ctx: Ctx) => void): string[] {
  probe.fn = fn;
  return texts(engine.step(state, { type: 'mod', action: 'ph:run' }).events);
}
const all = (state: GameState): Entity[] =>
  sortedIds(state).map((id) => state.entities[String(id)]!);

// A walled room, floor x 2..8, y 2..6 (7 x 5), a doorway in its east wall at 9,4; the hero
// outside it at 10,4. fill_zoo() leaves out the door's side (x 8).
const MAP = [
  '            ',
  ' .........  ',
  ' .........  ',
  ' .......... ',
  ' .......... ',
  ' .........  ',
  ' .........  ',
  ' .........  ',
  '            ',
];
function walledRoom(seed: number, depth: number): { state: GameState; level: Level } {
  const s = levelSetup(MAP, seed);
  const level = getLevel(s.state);
  level.depth = depth;
  for (let x = 1; x <= 9; x++) {
    setTerrain(level, x, 1, T.hwall);
    setTerrain(level, x, 7, T.hwall);
  }
  for (let y = 1; y <= 7; y++) {
    setTerrain(level, 1, y, T.vwall);
    setTerrain(level, 9, y, T.vwall);
  }
  setTerrain(level, 9, 4, T.doorway);
  level.rooms.push({ lx: 2, ly: 2, hx: 8, hy: 6, lit: true });
  getPlayer(s.state).c.pos = { level: level.id, x: 10, y: 4 };
  return { state: s.state, level };
}
const FILLED: { x: number; y: number }[] = [];
for (let x = 2; x <= 7; x++) for (let y = 2; y <= 6; y++) FILLED.push({ x, y });

function filled(kind: DefId, seed: number, depth = 12) {
  const { state, level } = walledRoom(seed, depth);
  level.rooms[0]!.type = kind;
  withCtx(state, (ctx) => fillZoo(ctx, level, 0));
  const ents = all(state);
  const mons = ents.filter((e) => e.c.monster && e.id !== state.playerId);
  const at = (x: number, y: number) =>
    ents.filter((e) => e.c.pos?.level === level.id && e.c.pos.x === x && e.c.pos.y === y);
  return { state, level, ents, mons, at };
}

describe('fill_zoo()', () => {
  test('a beehive: the queen on its centre, sleeping killer bees on the rest, royal jelly about 1 square in 3', () => {
    let jelly = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const { mons, at, ents } = filled(BEEHIVE, seed);
      // centre: lx + (hx - lx + 1) / 2, ly + (hy - ly + 1) / 2
      expect(at(5, 4).find((e) => e.c.monster)?.def).toBe('nh:queen_bee');
      expect(mons.filter((e) => e.def === 'nh:queen_bee')).toHaveLength(1);
      expect(mons.filter((e) => e.def === 'nh:killer_bee')).toHaveLength(FILLED.length - 1);
      for (const p of FILLED) expect(at(p.x, p.y).some((e) => e.c.monster)).toBe(true);
      for (let y = 2; y <= 6; y++) expect(at(8, y)).toHaveLength(0); // the door's side
      expect(mons.every((e) => e.c.monster!.asleep)).toBe(true);
      jelly += ents.filter((e) => e.def === 'nh:lump_of_royal_jelly' && e.c.pos).length;
    }
    expect(jelly).toBeGreaterThan((6 * FILLED.length) / 6);
    expect(jelly).toBeLessThan((6 * FILLED.length) / 2);
  });

  test('a cockatrice nest: cockatrices, and statues of humans holding up to 4 random objects', () => {
    let statues = 0;
    let held = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const { mons, ents } = filled(COCKNEST, seed);
      expect(mons).toHaveLength(FILLED.length);
      expect(mons.every((e) => e.def === 'nh:cockatrice' && e.c.monster!.asleep)).toBe(true);
      for (const st of ents.filter((e) => e.def === 'nh:statue')) {
        statues++;
        expect(st.c.item!.corpseOf).toBe('nh:human');
        const inside = ents.filter((e) => e.c.item?.containedIn === st.id);
        expect(inside.length).toBeLessThanOrEqual(4);
        held += inside.length;
      }
    }
    expect(statues).toBeGreaterThan((6 * FILLED.length) / 6);
    expect(statues).toBeLessThan((6 * FILLED.length) / 2);
    expect(held).toBeGreaterThan(0);
  });

  test('an anthole: ants of one kind (antholemon()), and food', () => {
    let food = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const { state, mons, ents } = filled(ANTHOLE, seed);
      const kind = antholemon(state, engine.registry, 12)!.id;
      expect(mons).toHaveLength(FILLED.length);
      expect(mons.every((e) => e.def === kind)).toBe(true);
      const floorFood = ents.filter(
        (e) => e.c.pos && e.c.item && engine.registry.object(e.def).class === 'food',
      );
      food += floorFood.length;
    }
    expect(food).toBeGreaterThan(0);
  });

  test('barracks: soldiers and their officers, and now and then a box or chest', () => {
    let boxes = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const { mons, ents } = filled(BARRACKS, seed, 20);
      expect(mons).toHaveLength(FILLED.length);
      for (const m of mons)
        expect(['nh:soldier', 'nh:sergeant', 'nh:lieutenant', 'nh:captain']).toContain(m.def);
      boxes += ents.filter(
        (e) => (e.def === 'nh:large_box' || e.def === 'nh:chest') && e.c.pos,
      ).length;
    }
    expect(boxes).toBeGreaterThan(0);
    expect(boxes).toBeLessThan(12 * FILLED.length * 0.15);
  });
});

describe('the room monsters', () => {
  const tally = (state: GameState, depth: number, n: number): Record<string, number> => {
    const out: Record<string, number> = {};
    withCtx(state, (ctx) => {
      for (let i = 0; i < n; i++) {
        const m = squadmon(ctx, depth)?.id ?? 'none';
        out[m] = (out[m] ?? 0) + 1;
      }
    });
    return out;
  };

  test('squadmon(): soldiers 80, sergeants 15, lieutenants 4, a captain 1 in rnd(80 + depth)', () => {
    const { state } = walledRoom(1, 1);
    // rnd(81): 1..79 soldier, 80..81 sergeant
    const shallow = tally(state, 1, 3000);
    expect(Object.keys(shallow).sort()).toEqual(['nh:sergeant', 'nh:soldier']);
    expect(shallow['nh:sergeant']! / 3000).toBeGreaterThan(0.01);
    expect(shallow['nh:sergeant']! / 3000).toBeLessThan(0.05);
    // rnd(130): past 100 a uniform pick of the four
    const deep = tally(state, 50, 13000);
    const p = (k: string) => (deep[k] ?? 0) / 13000;
    expect(p('nh:captain')).toBeGreaterThan(0.04); // (1 + 30 / 4) / 130 = 0.065
    expect(p('nh:captain')).toBeLessThan(0.09);
    expect(p('nh:lieutenant')).toBeGreaterThan(0.07); // (4 + 30 / 4) / 130 = 0.088
    expect(p('nh:lieutenant')).toBeLessThan(0.11);
    // a genocided kind: no monster (a random one is made)
    withCtx(state, (ctx) => setGenocided(ctx, 'nh:soldier' as DefId));
    const geno = tally(state, 1, 500);
    expect(geno['nh:soldier']).toBeUndefined();
    expect(geno['none']).toBeGreaterThan(400);
  });

  test('antholemon(): one kind on a level, another a level deeper, the next when genocided', () => {
    const { state } = walledRoom(1, 1);
    const reg = engine.registry;
    const kinds = [13, 14, 15].map((d) => antholemon(state, reg, d)!.id);
    expect(new Set(kinds).size).toBe(3);
    withCtx(state, (ctx) => setGenocided(ctx, kinds[0]! as DefId));
    expect(antholemon(state, reg, 13)!.id).toBe(kinds[1]);
    withCtx(state, (ctx) => setGenocided(ctx, kinds[1]! as DefId));
    withCtx(state, (ctx) => setGenocided(ctx, kinds[2]! as DefId));
    expect(antholemon(state, reg, 13)).toBeNull();
  });

  test('lieutenants carry a broadsword or long sword, captains a long sword or silver saber', () => {
    const { state } = walledRoom(1, 1);
    const seen: Record<string, Set<string>> = {
      'nh:lieutenant': new Set(),
      'nh:captain': new Set(),
    };
    for (const pm of ['nh:lieutenant', 'nh:captain'])
      for (let i = 0; i < 12; i++) {
        const m = addMon(state, pm, 3, 3);
        withCtx(state, (ctx) => mInitWeap(ctx, m));
        for (const o of all(state))
          if (o.c.item?.carriedBy === m && engine.registry.object(o.def).class === 'weapon')
            seen[pm]!.add(o.def);
        delete state.entities[String(m)];
      }
    const swords = (pm: string) => [...seen[pm]!].filter((d) => d !== 'nh:knife').sort();
    expect(swords('nh:lieutenant')).toEqual(['nh:broadsword', 'nh:long_sword']);
    expect(swords('nh:captain')).toEqual(['nh:long_sword', 'nh:silver_saber']);
  });
});

describe('mk_tt_object()', () => {
  test('an unnamed human corpse that rots, or statue without a spellbook', () => {
    const { state, level } = walledRoom(2, 12);
    const at = { level: level.id, x: 3, y: 3 };
    let corpse = 0;
    let statue = 0;
    withCtx(state, (ctx) => {
      corpse = mkTtObject(ctx, 'nh:corpse', at, false);
      statue = mkTtObject(ctx, 'nh:statue', at, false);
    });
    const c = state.entities[String(corpse)]!;
    expect(c.def).toBe('nh:corpse');
    expect(c.c.item!.corpseOf).toBe('nh:human');
    expect(
      state.timers.filter(
        (t) => t.kind === 'nh:rot_corpse' && (t.data as { id: number }).id === corpse,
      ),
    ).toHaveLength(1);
    expect(state.entities[String(statue)]!.c.item!.corpseOf).toBe('nh:human');
    expect(all(state).some((e) => e.c.item?.containedIn === statue)).toBe(false);
  });
});

describe('entering', () => {
  const west = { type: 'move', dir: 'w' } as const;
  const enter = (kind: DefId, setup?: (state: GameState, level: Level) => void): string[] => {
    const { state, level } = walledRoom(3, 12);
    level.rooms[0]!.type = kind;
    setup?.(state, level);
    return [...texts(engine.step(state, west).events), ...texts(engine.step(state, west).events)];
  };

  test('a giant beehive, a disgusting nest, an anthole', () => {
    expect(enter(BEEHIVE)).toContain('You enter a giant beehive!');
    expect(enter(COCKNEST)).toContain('You enter a disgusting nest!');
    expect(enter(ANTHOLE)).toContain('You enter an anthole!');
  });

  test('a military barracks while a soldier is in it, else an abandoned one', () => {
    expect(enter(BARRACKS)).toContain('You enter an abandoned barracks.');
    for (const pm of ['nh:soldier', 'nh:sergeant', 'nh:lieutenant', 'nh:captain'])
      expect(
        enter(BARRACKS, (state) => addMon(state, pm, 3, 6, { asleep: true, peaceful: true })),
      ).toContain('You enter a military barracks!');
  });
});

describe('royal jelly', () => {
  function eater(seed = 1) {
    const s = levelSetup(['.......', '...@...', '.......'], seed);
    plainKit(s.state);
    withCtx(s.state, (ctx) => setAbase(ctx, 'str', 16));
    return s;
  }
  const eat = (s: ReturnType<typeof eater>, id: number): string[] => {
    const out: string[] = [];
    for (let i = 0; i < 5 && s.state.entities[String(id)] && !s.state.gameOver; i++)
      out.push(...s.text(s.mod('nh:eat', { item: id })));
    return out;
  };

  test('uncursed: +1 Str, up to 20 hit points, wounded legs healed', () => {
    const s = eater();
    const hp = s.hero.c.hp!;
    hp.cur = hp.max - 40;
    setItimeout(s.state, s.hero, P.WOUNDED_LEGS, 50);
    const j = s.carry('nh:lump_of_royal_jelly');
    const before = hp.cur;
    const t = eat(s, j);
    expect(abase(s.state, 'str')).toBe(17);
    expect(hp.cur - before).toBeGreaterThanOrEqual(1);
    expect(hp.cur - before).toBeLessThanOrEqual(20);
    expect(hasProp(s.hero, P.WOUNDED_LEGS)).toBe(false);
    expect(t).toContain('Your leg feels better.');
  });

  test('at full hit points the maximum goes up by one about 1 time in 17', () => {
    let up = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const s = eater(seed);
      const hp = s.hero.c.hp!;
      hp.cur = hp.max;
      const max = hp.max;
      const j = s.carry('nh:lump_of_royal_jelly');
      itemOf(s.state, j).buc = 'blessed';
      eat(s, j);
      expect(hp.max - max).toBeGreaterThanOrEqual(0);
      expect(hp.max - max).toBeLessThanOrEqual(1);
      expect(hp.cur).toBe(hp.max);
      up += hp.max - max;
    }
    expect(up).toBeGreaterThan(1);
    expect(up).toBeLessThan(20);
  });

  test('cursed: -1 Str, hit points lost, legs not healed; at 1 hit point it kills', () => {
    const s = eater();
    const hp = s.hero.c.hp!;
    setItimeout(s.state, s.hero, P.WOUNDED_LEGS, 50);
    const before = hp.cur;
    const j = s.carry('nh:lump_of_royal_jelly');
    itemOf(s.state, j).buc = 'cursed';
    eat(s, j);
    expect(abase(s.state, 'str')).toBe(15);
    expect(before - hp.cur).toBeGreaterThanOrEqual(1);
    expect(before - hp.cur).toBeLessThanOrEqual(20);
    expect(hasProp(s.hero, P.WOUNDED_LEGS)).toBe(true);

    const d = eater(2);
    d.hero.c.hp!.cur = 1;
    const k = d.carry('nh:lump_of_royal_jelly');
    itemOf(d.state, k).buc = 'cursed';
    eat(d, k);
    expect(d.state.gameOver?.killer).toBe('@killer.royal_jelly');
    expect(render({ key: 'killer.royal_jelly' })).toBe('a rotten lump of royal jelly');
  });

  test('a hero polymorphed into a killer bee becomes a queen bee instead', () => {
    const s = eater();
    withCtx(s.state, (ctx) => polymon(ctx, 'nh:killer_bee' as DefId, false));
    const str = abase(s.state, 'str');
    // the bee drops what it cannot carry; eat a lump from the floor
    const j = s.floor('nh:lump_of_royal_jelly');
    eat(s, j);
    expect(s.state.entities[String(j)]).toBeUndefined();
    expect(heroFormId(s.state)).toBe('nh:queen_bee');
    expect(abase(s.state, 'str')).toBe(str);
  });
});

describe('a killer bee on royal jelly', () => {
  function bee(queen: boolean) {
    const s = levelSetup(['...........', '.@.........', '...........'], 4);
    const b = addMon(s.state, 'nh:killer_bee', 8, 1, { peaceful: true });
    const j = s.give('nh:lump_of_royal_jelly', { at: { level: s.here.level, x: 8, y: 1 } });
    if (queen) addMon(s.state, 'nh:queen_bee', 10, 2, { asleep: true, peaceful: true });
    s.step({ type: 'wait' }); // its first move comes on the second turn
    s.step({ type: 'wait' });
    return { s, b, j };
  }

  test('with no queen on the level it eats the lump and becomes one', () => {
    const { s, b, j } = bee(false);
    expect(s.state.entities[String(j)]).toBeUndefined();
    expect(s.state.entities[String(b)]!.def).toBe('nh:queen_bee');
  });

  test('with a queen on the level it leaves the jelly alone', () => {
    const { s, b, j } = bee(true);
    expect(s.state.entities[String(j)]).toBeDefined();
    expect(s.state.entities[String(b)]!.def).toBe('nh:killer_bee');
    expect(itemOf(s.state, j).quantity).toBe(1);
  });
});

describe('wiz:mkroom', () => {
  test('offers and makes the four new kinds', () => {
    const { state, level } = walledRoom(5, 12);
    getPlayer(state).c.pos = { level: level.id, x: 3, y: 3 };
    wiz.step(state, { type: 'mod', action: WIZ_MKROOM as DefId });
    const p = state.pendingPrompt?.prompt;
    const values = p?.kind === 'menu' ? (p.options ?? []).map((o) => o.value) : [];
    for (const k of [BEEHIVE, COCKNEST, ANTHOLE, BARRACKS]) expect(values).toContain(k);
    wiz.step(state, { type: 'answer', promptId: p!.id, value: BARRACKS });
    expect(level.rooms[0]!.type).toBe(BARRACKS);
    expect(all(state).filter((e) => e.c.monster && e.id !== state.playerId)).toHaveLength(
      FILLED.length - 1,
    );
  });
});
