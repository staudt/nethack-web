import {
  buildSnapshot,
  createEngine,
  getLevel,
  getPlayer,
  type Ctx,
  type DefId,
  type Entity,
  type GameState,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import {
  ACCFOOD,
  APPORT,
  CADAVER,
  DOGFOOD,
  MANFOOD,
  POISON,
  UNDEF,
  dogfood,
  edogOf,
  growUp,
  initedog,
  mksobj,
  tamedog,
  vanillaMod,
} from '../src/index';
import { dogEat } from '../src/dogmove';
import { addMon, setup } from './helpers';
import { ctxFor, defs, render } from './itemHelpers';

const engine = createEngine([vanillaMod]);
const ctxOf = (state: GameState): Ctx & { events: { type: string; key?: string }[] } =>
  Object.assign(ctxFor(state), { interrupt() {}, endGame() {} }) as never;
const pets = (state: GameState): Entity[] =>
  Object.values(state.entities).filter((e) => (e.c.monster?.tame ?? 0) > 0);
const msgs = (events: readonly { type: string; key?: string }[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' && e.key ? [e.key] : []));
const texts = (events: readonly unknown[]): string[] =>
  (events as { type: string }[]).flatMap((e) => (e.type === 'msg' ? [render(e as never)] : []));

/** A pet of `def` at (x, y) on a setup() level. */
function addPet(state: GameState, def: string, x: number, y: number): number {
  const id = addMon(state, def, x, y);
  const m = state.entities[String(id)]!;
  m.c.monster!.level = defs.monster(def as DefId).level;
  m.c.hp = { cur: 12, max: 12 };
  m.c.actor!.speed = defs.monster(def as DefId).speed;
  initedog(ctxOf(state), id, true);
  return id;
}

const ROOM = ['---------', '|.......|', '|.@.....|', '|.......|', '---------'];

describe('the starting kitten', () => {
  test('the Valkyrie starts with a tame kitten next to her (makedog)', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { state } = engine.newGame({ seed });
      const ps = pets(state);
      expect(ps).toHaveLength(1);
      const k = ps[0]!;
      expect(k.def).toBe('nh:kitten');
      expect(k.c.monster).toMatchObject({ tame: 10, peaceful: true, asleep: false });
      const h = getPlayer(state).c.pos!;
      expect(Math.max(Math.abs(k.c.pos!.x - h.x), Math.abs(k.c.pos!.y - h.y))).toBe(1);
      const e = edogOf({ state }, k.id)!;
      expect(e.hungrytime).toBe(state.turn + 1000 - 0);
      expect(e.apport).toBe(getPlayer(state).c.attributes!.cha);
      // the renderer highlights it
      expect(buildSnapshot(defs, state).entities.find((v) => v.id === k.id)?.tame).toBe(true);
    }
  });

  test('carries nothing (NO_MINVENT)', () => {
    const { state } = engine.newGame({ seed: 9 });
    const k = pets(state)[0]!;
    expect(Object.values(state.entities).some((e) => e.c.item?.carriedBy === k.id)).toBe(false);
  });
});

describe('dogfood', () => {
  test('what a kitten wants, best first', () => {
    const s = setup(ROOM);
    const ctx = ctxOf(s.state);
    const k = s.state.entities[String(addPet(s.state, 'nh:kitten', 3, 2))]!;
    const item = (def: string, o: { corpseOf?: string; buc?: 'cursed'; age?: number } = {}) => {
      const id = mksobj(ctx, defs.object(def as DefId), {
        init: false,
        at: { level: 'dlvl1', x: 5, y: 2 },
        ...(o.corpseOf ? { corpseOf: o.corpseOf as DefId } : {}),
      });
      const e = s.state.entities[String(id)]!;
      if (o.buc) e.c.item!.buc = o.buc;
      if (o.age !== undefined) e.c.item!.age = o.age;
      return e;
    };
    expect(dogfood(ctx, k, item('nh:tripe_ration'))).toBe(DOGFOOD);
    expect(dogfood(ctx, k, item('nh:corpse', { corpseOf: 'nh:newt', age: s.state.turn }))).toBe(
      CADAVER,
    );
    expect(dogfood(ctx, k, item('nh:food_ration'))).toBe(ACCFOOD);
    expect(dogfood(ctx, k, item('nh:apple'))).toBe(MANFOOD);
    expect(dogfood(ctx, k, item('nh:corpse', { corpseOf: 'nh:lichen', age: s.state.turn }))).toBe(
      MANFOOD, // vegan, and a kitten is no herbivore
    );
    expect(
      dogfood(ctx, k, item('nh:corpse', { corpseOf: 'nh:newt', age: s.state.turn - 60 })),
    ).toBe(
      POISON, // too old
    );
    expect(dogfood(ctx, k, item('nh:dagger'))).toBe(APPORT);
    expect(dogfood(ctx, k, item('nh:dagger', { buc: 'cursed' }))).toBe(UNDEF);
  });
});

describe('following the hero to a new level', () => {
  function atStairs(seed: number) {
    const { state } = engine.newGame({ seed });
    const level = getLevel(state);
    const down = level.down!;
    const hero = getPlayer(state);
    hero.c.pos = { level: level.id, x: down.x, y: down.y };
    const k = pets(state)[0]!;
    return { state, k, down, level };
  }

  test('an adjacent pet comes along and arrives next to the hero', () => {
    const { state, k, down } = atStairs(3);
    // a free square next to the stairs
    const ctx = ctxOf(state);
    void ctx;
    k.c.pos = { level: 'dlvl1', x: down.x + 1, y: down.y };
    if (!engine.query(state).describe({ x: down.x + 1, y: down.y }).terrain) {
      k.c.pos = { level: 'dlvl1', x: down.x - 1, y: down.y };
    }
    engine.step(state, { type: 'mod', action: 'nh:down' as DefId });
    expect(state.currentLevel).toBe('dlvl2');
    const pet = state.entities[String(k.id)]!;
    expect(pet.c.pos?.level).toBe('dlvl2');
    const h = getPlayer(state).c.pos!;
    expect(
      Math.max(Math.abs(pet.c.pos!.x - h.x), Math.abs(pet.c.pos!.y - h.y)),
    ).toBeLessThanOrEqual(2);
  });

  test('a pet that is not adjacent stays behind', () => {
    const { state, k, level } = atStairs(4);
    const up = level.up!;
    k.c.pos = { level: 'dlvl1', x: up.x, y: up.y };
    engine.step(state, { type: 'mod', action: 'nh:down' as DefId });
    expect(state.entities[String(k.id)]!.c.pos?.level).toBe('dlvl1');
  });

  test('a pet left alone grows wilder: (time + 75) / 150 less tame', () => {
    const { state, k, level } = atStairs(5);
    const up = level.up!;
    k.c.pos = { level: 'dlvl1', x: up.x, y: up.y };
    engine.step(state, { type: 'mod', action: 'nh:down' as DefId });
    state.turn += 1050; // pretend she was away a long time
    const l2 = getLevel(state);
    const hero = getPlayer(state);
    hero.c.pos = { level: l2.id, x: l2.up!.x, y: l2.up!.y };
    engine.step(state, { type: 'mod', action: 'nh:up' as DefId });
    expect(state.currentLevel).toBe('dlvl1');
    // (1051 + 75) / 150 = 7
    expect(state.entities[String(k.id)]!.c.monster?.tame).toBe(3);
  });
});

describe('the hero and her pet', () => {
  test('walking into the pet swaps places, or 1 time in 7 it is in the way', () => {
    let swaps = 0;
    let stops = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = setup(ROOM, seed);
      const k = addPet(s.state, 'nh:kitten', 3, 2);
      s.state.entities[String(k)]!.c.actor!.speed = 0; // keep it still
      const r = engine.step(s.state, { type: 'move', dir: 'e' });
      const h = getPlayer(s.state).c.pos!;
      const t = texts(r.events);
      if (t.includes('You swap places with your kitten.')) {
        swaps++;
        expect(h).toMatchObject({ x: 3, y: 2 });
        expect(s.state.entities[String(k)]!.c.pos).toMatchObject({ x: 2, y: 2 });
      } else if (t.includes('You stop.  Your kitten is in the way!')) {
        stops++;
        expect(h).toMatchObject({ x: 2, y: 2 });
      }
      expect(s.state.entities[String(k)]!.c.hp!.cur).toBe(12);
    }
    expect(swaps + stops).toBe(60);
    expect(stops).toBeGreaterThan(2);
    expect(stops).toBeLessThan(20);
  });

  test('Fight attacks the pet ("Really attack?"), which abuses it: less tame, it flees', () => {
    let abused = false;
    for (let seed = 1; seed <= 30 && !abused; seed++) {
      const s = setup(ROOM, seed);
      const k = addPet(s.state, 'nh:kitten', 3, 2);
      s.state.entities[String(k)]!.c.hp = { cur: 100, max: 100 };
      const r = engine.step(s.state, {
        type: 'mod',
        action: 'nh:fight' as DefId,
        args: { dir: 'e' },
      });
      expect(r.prompt?.key).toBe('attack.confirm');
      const a = engine.step(s.state, { type: 'answer', promptId: r.prompt!.id, value: true });
      const m = s.state.entities[String(k)]!.c.monster!;
      if (m.tame === 9) {
        abused = true;
        expect(m.peaceful).toBe(true);
        expect(msgs(a.events).some((x) => x === 'dog.yowls' || x === 'dog.hisses')).toBe(true);
      }
    }
    expect(abused).toBe(true);
  });

  test('Fight is offered on a pet; walking into it is offered as a swap', () => {
    const s = setup(ROOM);
    addPet(s.state, 'nh:kitten', 3, 2);
    engine.step(s.state, { type: 'wait' });
    const offers = engine.query(s.state).actionsFor({ kind: 'cell', pos: { x: 3, y: 2 } });
    expect(offers.map((o) => o.labelKey)).toEqual(['action.swap', 'action.nh:fight']);
  });
});

describe('pets fight and eat', () => {
  test('the kitten kills an adjacent newt and then eats its corpse', () => {
    let done = false;
    for (let seed = 1; seed <= 40 && !done; seed++) {
      const s = setup(ROOM, seed);
      const k = addPet(s.state, 'nh:kitten', 4, 2);
      const newt = addMon(s.state, 'nh:newt', 5, 2, { asleep: true });
      s.state.entities[String(newt)]!.c.actor!.speed = 0;
      const seen: string[] = [];
      for (let i = 0; i < 40 && !done; i++) {
        seen.push(...texts(engine.step(s.state, { type: 'wait' }).events));
        if (seen.includes('The kitten eats a newt corpse.')) done = true;
        if (!s.state.entities[String(k)]) break;
      }
      if (done) {
        expect(seen).toContain('The newt is killed!');
        expect(seen.indexOf('The newt is killed!')).toBeLessThan(
          seen.indexOf('The kitten eats a newt corpse.'),
        );
        expect(s.state.entities[String(newt)]).toBeUndefined();
      }
    }
    expect(done).toBe(true);
  });

  test('eating a corpse: hungrytime grows by nutrition * 6 (small), tameness by 1', () => {
    const s = setup(ROOM);
    const ctx = ctxOf(s.state);
    const k = addPet(s.state, 'nh:kitten', 3, 2);
    const e = edogOf(ctx, k)!;
    const before = e.hungrytime;
    const corpse = mksobj(ctx, defs.object('nh:corpse' as DefId), {
      init: false,
      at: { level: 'dlvl1', x: 3, y: 2 },
      corpseOf: 'nh:newt' as DefId,
    });
    dogEat(ctx, k, s.state.entities[String(corpse)]!, { x: 3, y: 2 }, false);
    expect(e.hungrytime).toBe(before + defs.monster('nh:newt' as DefId).nutrition * 6);
    expect(s.state.entities[String(k)]!.c.monster!.tame).toBe(11);
    expect(s.state.entities[String(corpse)]).toBeUndefined();
  });

  test('a hungry pet weakens (max HP / 3), then starves', () => {
    const s = setup(ROOM);
    const k = addPet(s.state, 'nh:kitten', 6, 2);
    const e = edogOf(ctxOf(s.state), k)!;
    e.hungrytime = s.state.turn - 501;
    // hunger is checked when the pet moves (it starts with no movement)
    const keys: string[] = [];
    for (let i = 0; i < 3; i++) keys.push(...msgs(engine.step(s.state, { type: 'wait' }).events));
    const hp = s.state.entities[String(k)]!.c.hp!;
    expect(hp.max).toBe(4);
    expect(e.mhpmaxPenalty).toBe(8);
    expect(keys).toContain('dog.confused_hunger');
    e.hungrytime = s.state.turn - 751;
    const later: string[] = [];
    for (let i = 0; i < 3; i++) later.push(...msgs(engine.step(s.state, { type: 'wait' }).events));
    expect(s.state.entities[String(k)]).toBeUndefined();
    expect(later).toContain('dog.starves');
  });
});

describe('taming and growing up', () => {
  test('food tames a domestic animal, which devours it ("seems more amiable" if hostile)', () => {
    const s = setup(ROOM);
    const ctx = ctxOf(s.state);
    const cat = addMon(s.state, 'nh:housecat', 4, 2);
    s.state.entities[String(cat)]!.c.monster!.level = 4;
    engine.step(s.state, { type: 'wait' });
    const food = mksobj(ctx, defs.object('nh:tripe_ration' as DefId), { init: false });
    const ate: number[] = [];
    const ok = tamedog(ctx, cat, s.state.entities[String(food)]!, true, (_c, _id, o) => {
      ate.push(o.id);
    });
    expect(ok).toBe(true);
    expect(ate).toEqual([food]);
    expect(s.state.entities[String(cat)]!.c.monster).toMatchObject({ tame: 10, peaceful: true });
    // a hostile one only gets the first message (givemsg is then used up)
    expect(msgs(ctx.events)).toEqual(['dog.more_amiable']);
    // a peaceful one: "seems quite friendly"
    const cat2 = addMon(s.state, 'nh:housecat', 5, 3, { peaceful: true });
    const ctx2 = ctxOf(s.state);
    const food2 = mksobj(ctx2, defs.object('nh:tripe_ration' as DefId), { init: false });
    tamedog(ctx2, cat2, s.state.entities[String(food2)]!, true, () => undefined);
    expect(msgs(ctx2.events)).toEqual(['dog.quite_friendly']);
  });

  test('a kitten that kills enough grows up into a housecat', () => {
    const s = setup(ROOM);
    const ctx = ctxOf(s.state);
    const k = addPet(s.state, 'nh:kitten', 3, 2);
    const m = s.state.entities[String(k)]!;
    m.c.monster!.level = 3;
    m.c.hp = { cur: 24, max: 24 }; // the threshold for level 3 is 24
    growUp(ctx, k, 5);
    expect(m.def).toBe('nh:housecat');
    expect(m.c.monster!.level).toBe(4);
    expect(texts(ctx.events)).toContain('The kitten grows up into a housecat.');
  });
});
