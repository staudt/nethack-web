// Milestone 6b3 step 1: shopkeepers and stock on a small test level. stock_room() puts the
// shopkeeper one step inside the door and stock of the shop's type on the other floor squares
// (not the row by the door); nameshk() names him; the candles are made as mksobj() makes them;
// shopkeepers and priests cannot be displaced; a shopkeeper in his shop picks nothing up.
import { getPlayer, sortedIds, type Ctx, type DefId, type Level, type StepResult } from '@nh/core';
import { describe, expect, test } from 'vitest';
import {
  SHOPKEEPER,
  SHOP_TYPES,
  SHTYPES,
  T,
  eshkOf,
  forgetMonster,
  getShopItem,
  mergable,
  mksobj,
  monNam,
  mpickstuff,
  priestini,
  saleable,
  shopType,
  stockShops,
} from '../src/index';
import { messagesEn } from '../src/messages.en';
import { P, setItimeout } from '../src/props';
import { setup } from './helpers';
import { ctxFor, defs, obj, render } from './itemHelpers';

// A shop (interior 1..5 x 1..3) with a doorway in its east wall at 6,2 onto a floor corridor,
// and a second room (interior 9..11 x 1..3) with a doorway in its west wall at 8,2.
const MAP = ['------- -----', '|.....| |...|', '|.....o.o...|', '|.....| |...|', '------- -----'];
const SHK_SPOT = { x: 5, y: 2 };

type S = ReturnType<typeof setup>;
const ctxOf = (s: S): Ctx => ctxFor(s.state) as unknown as Ctx;
const keys = (r: StepResult): string[] =>
  r.events.flatMap((e) => (e.type === 'msg' && e.key ? [e.key] : []));
const terrainAt = (level: Level, x: number, y: number): string =>
  level.palette[level.cells[y * level.width + x] ?? -1] ?? '';
const itemsAt = (s: S, x: number, y: number) =>
  sortedIds(s.state)
    .map((id) => s.state.entities[String(id)])
    .filter((e) => e?.c.item && e.c.pos?.x === x && e.c.pos.y === y);
const shkOn = (s: S): number[] => sortedIds(s.state).filter((id) => eshkOf(s, id) !== null);

/** The test level with room 0 a shop of `type` (and room 1 of `type2`), the hero at 7,2. */
function shop(seed: number, type: string, o: { town?: boolean; type2?: string } = {}) {
  const s = setup(MAP, seed);
  s.level.rooms = [
    { lx: 1, ly: 1, hx: 5, hy: 3, lit: true, type: type as DefId },
    { lx: 9, ly: 1, hx: 11, hy: 3, lit: true, ...(o.type2 ? { type: o.type2 as DefId } : {}) },
  ];
  if (o.town) s.level.town = true;
  const hp = getPlayer(s.state).c.pos;
  if (hp) Object.assign(hp, { x: 7, y: 2 });
  return s;
}

describe('the shop types', () => {
  test('one per room type, in shtypes[] order, probabilities summing to 100', () => {
    expect(SHTYPES.map((t) => t.id)).toEqual(SHOP_TYPES);
    expect(SHTYPES.reduce((a, t) => a + t.prob, 0)).toBe(100);
    for (const t of SHTYPES) {
      expect(t.iprobs.reduce((a, i) => a + i.prob, 0)).toBe(100);
      expect(messagesEn[t.nameKey]).toBeTruthy();
      expect(t.names.length).toBeGreaterThan(0);
    }
    expect(messagesEn[shopType('nh:candle_shop')?.nameKey ?? '']).toBe('lighting store');
    expect(messagesEn[shopType('nh:shop')?.nameKey ?? '']).toBe('general store');
    expect(messagesEn[shopType('nh:wand_shop')?.nameKey ?? '']).toBe(
      'quality apparel and accessories',
    );
  });

  test('get_shop_item() rolls again for objects this port lacks', () => {
    const s = setup(MAP, 1);
    const ctx = ctxOf(s);
    for (const t of SHTYPES) {
      const seen = new Set<string>();
      for (let i = 0; i < 2000; i++) {
        const item = getShopItem(ctx, t);
        if (typeof item === 'object') expect(defs.isObject(item.def)).toBe(true);
        seen.add(typeof item === 'object' ? item.def : item);
      }
      if (t.id === 'nh:food_shop')
        expect([...seen].sort()).toEqual(['food', 'nh:potion_of_booze', 'nh:potion_of_water']);
      if (t.id === 'nh:candle_shop')
        expect([...seen].sort()).toEqual([
          'nh:brass_lantern',
          'nh:oil_lamp',
          'nh:scroll_of_light',
          'nh:spellbook_of_light',
          'nh:tallow_candle',
          'nh:wand_of_light',
          'nh:wax_candle',
        ]);
    }
  });
});

describe('stock_room()', () => {
  test.each(SHTYPES.map((t) => t.id))('%s: the shopkeeper by the door, the stock', (type) => {
    for (const seed of [1, 2, 3]) {
      const s = shop(seed, type);
      stockShops(ctxOf(s), s.level);
      const [id] = shkOn(s);
      const shk = id === undefined ? undefined : s.state.entities[String(id)];
      const e = id === undefined ? null : eshkOf(s, id);
      if (!shk || !e) throw new Error('no shopkeeper');
      expect(shkOn(s)).toHaveLength(1);
      expect(shk.def).toBe(SHOPKEEPER);
      expect(shk.c.pos).toMatchObject(SHK_SPOT);
      expect(shk.c.monster).toMatchObject({ peaceful: true, asleep: false });
      expect(e).toMatchObject({
        shoproom: 0,
        shoplevel: 'dlvl1',
        shoptype: type,
        shk: SHK_SPOT,
        shd: { x: 6, y: 2 },
        robbed: 0,
        credit: 0,
        debit: 0,
        following: false,
        surcharge: false,
        bill: [],
      });
      // the doorway became an open door in the east (vertical) wall
      expect(terrainAt(s.level, 6, 2)).toBe(T.door_open_v);
      // a name from the list; his sex from its prefix where it has one
      const shp = shopType(type);
      expect([...(shp?.names ?? []), '-Lucrezia', '+Dirk']).toContain(e.shknam);
      if ('-_'.includes(e.shknam.charAt(0))) expect(e.female).toBe(true);
      if ('+|'.includes(e.shknam.charAt(0))) expect(e.female).toBe(false);
      // nothing in the column by the door, something it sells on the 12 other squares
      for (let y = 1; y <= 3; y++) expect(itemsAt(s, 5, y)).toEqual([]);
      let stocked = 0;
      for (let x = 1; x <= 4; x++)
        for (let y = 1; y <= 3; y++) {
          const here = itemsAt(s, x, y);
          if (here.length > 0) stocked++;
          for (const o of here) if (o) expect(saleable(ctxOf(s), e, o)).toBe(true);
        }
      if (type === 'nh:shop') expect(stocked).toBeGreaterThanOrEqual(6);
      else expect(stocked).toBe(12);
      // the other room is no shop: nothing there
      for (let x = 9; x <= 11; x++)
        for (let y = 1; y <= 3; y++) expect(itemsAt(s, x, y)).toEqual([]);
    }
  });

  test('a secret door becomes a door; a locked door stays locked; no door, no shopkeeper', () => {
    for (const [door, after] of [
      [T.sdoor_v, T.door_closed],
      [T.sdoor_locked_v, T.door_locked],
      [T.door_locked, T.door_locked],
      [T.door_closed, T.door_closed],
    ] as const) {
      const s = shop(1, 'nh:tool_shop');
      let i = s.level.palette.indexOf(door);
      if (i === -1) i = s.level.palette.push(door) - 1;
      s.level.cells[2 * s.level.width + 6] = i;
      stockShops(ctxOf(s), s.level);
      expect(terrainAt(s.level, 6, 2)).toBe(after);
      expect(shkOn(s)).toHaveLength(1);
    }
    const s = shop(1, 'nh:tool_shop');
    s.level.cells[2 * s.level.width + 6] = s.level.palette.indexOf(T.vwall);
    stockShops(ctxOf(s), s.level);
    expect(shkOn(s)).toEqual([]);
    expect(itemsAt(s, 1, 1)).toEqual([]);
  });

  test('an unfilled shop room gets nothing', () => {
    const s = shop(1, 'nh:tool_shop');
    const r = s.level.rooms[0];
    if (r) r.filled = false;
    stockShops(ctxOf(s), s.level);
    expect(shkOn(s)).toEqual([]);
  });

  test('a monster on the shopkeeper spot is moved away', () => {
    const s = shop(1, 'nh:tool_shop');
    const ctx = ctxOf(s);
    const newt = ctx.spawn({
      def: 'nh:newt' as DefId,
      c: {
        pos: { level: 'dlvl1', ...SHK_SPOT },
        actor: { energy: 0, speed: 6 },
        hp: { cur: 1, max: 1 },
        monster: { level: 0, peaceful: false, asleep: true, lastHero: null },
      },
    });
    stockShops(ctx, s.level);
    expect(s.state.entities[String(newt)]?.c.pos).not.toMatchObject(SHK_SPOT);
    expect(shkOn(s)).toHaveLength(1);
  });
});

describe('nameshk()', () => {
  test('the town lighting store is always Izchak, others vary by game', () => {
    const names = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const town = shop(seed, 'nh:candle_shop', { town: true });
      stockShops(ctxOf(town), town.level);
      const [a] = shkOn(town);
      expect(a === undefined ? null : eshkOf(town, a)).toMatchObject({
        shknam: '+Izchak',
        female: false,
      });
      const s = shop(seed, 'nh:candle_shop');
      s.state.seed = seed * 2571;
      stockShops(ctxOf(s), s.level);
      const [b] = shkOn(s);
      const e = b === undefined ? null : eshkOf(s, b);
      expect(shopType('nh:candle_shop')?.names).toContain(e?.shknam);
      names.add(e?.shknam ?? '');
    }
    expect(names.size).toBeGreaterThan(3);
  });

  test('two shops of one type on a level get different names', () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (const type of ['nh:shop', 'nh:food_shop', 'nh:tool_shop']) {
        const s = shop(seed, type, { type2: type });
        stockShops(ctxOf(s), s.level);
        const ids = shkOn(s);
        expect(ids).toHaveLength(2);
        const [a, b] = ids.map((id) => eshkOf(s, id)?.shknam);
        expect(a).not.toBe(b);
        // the second shop's keeper stands inside its west door
        const second = ids.map((id) => eshkOf(s, id)).find((e) => e?.shoproom === 1);
        expect(second?.shk).toEqual({ x: 9, y: 2 });
      }
    }
  });

  test("the hero sees a shopkeeper by his name: 'Izchak', no article", () => {
    const s = shop(1, 'nh:candle_shop', { town: true });
    stockShops(ctxOf(s), s.level);
    const [id] = shkOn(s);
    const shk = s.state.entities[String(id)];
    if (!shk?.c.actor) throw new Error('no shopkeeper');
    shk.c.actor.speed = 0;
    s.wait(); // the hero sees him
    expect(monNam(ctxOf(s), shk)).toBe('=Izchak');
    expect(render({ key: 'mon.wakes_up', params: { mon: monNam(ctxOf(s), shk) } })).toBe(
      'Izchak wakes up!',
    );
    setItimeout(s.state, getPlayer(s.state), P.HALLUC, 100);
    expect(monNam(ctxOf(s), shk)).toMatch(/^@nh:/); // a random monster
  });
});

describe('the candles', () => {
  test('mksobj(): 1 to 7 of them, 20 turns of light per zorkmid, rarely blessed or cursed', () => {
    const s = setup(MAP, 1);
    const ctx = ctxOf(s);
    const quans = new Set<number>();
    const bucs = new Set<string>();
    for (const [def, age] of [
      ['nh:tallow_candle', 200],
      ['nh:wax_candle', 400],
    ] as const) {
      for (let i = 0; i < 300; i++) {
        const id = mksobj(ctx, obj(def), { at: { level: 'dlvl1', x: 1 + (i % 4), y: 1 } });
        const it = s.state.entities[String(id)]?.c.item;
        if (!it) throw new Error('no candle');
        if (it.quantity > 7) continue; // merged into a pile
        quans.add(it.quantity);
        bucs.add(it.buc);
        expect(it).toMatchObject({ spe: 1, age });
        expect(it.lit).toBeUndefined();
      }
    }
    expect([...quans].sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect([...bucs].sort()).toEqual(['blessed', 'cursed', 'uncursed']);
    expect(obj('nh:tallow_candle')).toMatchObject({ class: 'tool', merge: true, cost: 10 });
    expect(obj('nh:wax_candle')).toMatchObject({ class: 'tool', merge: true, cost: 20 });
    expect(messagesEn[obj('nh:wax_candle').descKey ?? '']).toBe('candle');
  });

  test('candles merge only when their ages are close', () => {
    const s = setup(MAP, 1);
    const ctx = ctxOf(s);
    const make = (age: number) => {
      const id = mksobj(ctx, obj('nh:wax_candle'), { init: false });
      const e = s.state.entities[String(id)];
      if (!e?.c.item) throw new Error('no candle');
      e.c.item.age = age;
      return e;
    };
    expect(mergable(defs, make(400), make(424))).toBe(true);
    expect(mergable(defs, make(400), make(399))).toBe(false);
  });
});

describe('shopkeepers and priests', () => {
  test("they won't swap places with the hero", () => {
    const s = shop(1, 'nh:candle_shop', { town: true });
    stockShops(ctxOf(s), s.level);
    const [id] = shkOn(s);
    const shk = s.state.entities[String(id)];
    if (!shk?.c.pos || !shk.c.actor) throw new Error('no shopkeeper');
    shk.c.actor.speed = 0;
    Object.assign(shk.c.pos, { x: 6, y: 2 }); // on his door, next to the hero at 7,2
    s.wait(); // the hero sees him
    const r = s.engine.step(s.state, { type: 'move', dir: 'w' });
    const msg = r.events.find((e) => e.type === 'msg' && e.key === 'dog.doesnt_want_swap_peaceful');
    expect(msg && msg.type === 'msg' ? render(msg) : '').toBe(
      "You stop.  Izchak doesn't want to swap places.",
    );
    expect(getPlayer(s.state).c.pos).toMatchObject({ x: 7, y: 2 });
    expect(shk.c.pos).toMatchObject({ x: 6, y: 2 });

    // a temple priest neither
    const t = shop(1, 'nh:temple');
    const priest = priestini(ctxOf(t), t.level, 0, { x: 3, y: 2 });
    const pe = priest === null ? undefined : t.state.entities[String(priest)];
    if (!pe?.c.pos || !pe.c.actor) throw new Error('no priest');
    pe.c.actor.speed = 0;
    Object.assign(pe.c.pos, { x: 6, y: 2 });
    t.wait();
    const r2 = t.engine.step(t.state, { type: 'move', dir: 'w' });
    const m2 = r2.events.find((e) => e.type === 'msg' && e.key === 'dog.doesnt_want_swap_peaceful');
    expect(m2 && m2.type === 'msg' ? render(m2) : '').toMatch(
      /^You stop\. {2}The priest of \w+ doesn't want to swap places\.$/,
    );
    expect(getPlayer(t.state).c.pos).toMatchObject({ x: 7, y: 2 });
    expect(keys(r2)).not.toContain('dog.swap_peaceful');
  });

  test('a shopkeeper in his shop picks nothing up; a dead one is forgotten', () => {
    const s = shop(2, 'nh:tool_shop');
    stockShops(ctxOf(s), s.level);
    const [id] = shkOn(s);
    if (id === undefined) throw new Error('no shopkeeper');
    // move him onto a stocked square of his shop
    const p = s.state.entities[String(id)]?.c.pos;
    if (!p) throw new Error('no shopkeeper');
    Object.assign(p, { x: 2, y: 2 });
    expect(itemsAt(s, 2, 2).length).toBeGreaterThan(0);
    expect(mpickstuff(ctxOf(s), id)).toBe(false);
    expect(itemsAt(s, 2, 2).length).toBeGreaterThan(0);
    forgetMonster(s, id);
    expect(eshkOf(s, id)).toBeNull();
  });

  test('a peaceful shopkeeper keeps to his door while the hero waits in his shop', () => {
    const s = shop(1, 'nh:tool_shop');
    stockShops(ctxOf(s), s.level);
    const [id] = shkOn(s);
    const hp = getPlayer(s.state).c.pos;
    if (id === undefined || !hp) throw new Error('no shopkeeper');
    Object.assign(hp, { x: 2, y: 2 });
    for (let t = 0; t < 200; t++) {
      s.engine.stepAll(s.state, { type: 'wait' });
      const p = s.state.entities[String(id)]?.c.pos;
      // he stays inside (never onto his door or out of the shop), close to his spot
      expect(p && p.x >= 1 && p.x <= 5 && p.y >= 1 && p.y <= 3).toBe(true);
      expect(p && Math.max(Math.abs(p.x - 5), Math.abs(p.y - 2))).toBeLessThanOrEqual(2);
    }
  });
});
