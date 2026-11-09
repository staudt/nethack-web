// Milestone 6b3 step 1: shopkeepers and stock on a small test level. stock_room() puts the
// shopkeeper one step inside the door and stock of the shop's type on the other floor squares
// (not the row by the door); nameshk() names him; the candles are made as mksobj() makes them;
// shopkeepers and priests cannot be displaced; a shopkeeper in his shop picks nothing up.
// Step 2: entering a shop (the greeting, an angry or robbed keeper, the untended shop, the
// mattock left outside) and the keeper going back to his spot.
// Step 3: prices, the bill (picking up, putting back, using up, biting), names with prices,
// paying and the warning at the door.
// Step 4: selling (the offer, a/q over several drops, an uninterested or broke keeper, into a
// shop's container), goods thrown or kicked out of the shop owed, usage fees.
// Step 5: robbery (the alarm, the Watch, hot pursuit), paying him off, appeasing, his death,
// #chat with him and his price quotes.
import {
  getPlayer,
  inventoryOf,
  putIn,
  sortedIds,
  type Ctx,
  type DefId,
  type Entity,
  type Level,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import {
  SHOPKEEPER,
  SHOP_TYPES,
  addToInventory,
  billUsedUp,
  checkSpecialRoom,
  getCost,
  getprice,
  mkgold,
  emptyShops,
  uRooms,
  uShops,
  SHTYPES,
  T,
  eshkOf,
  forgetMonster,
  getShopItem,
  monsterDied,
  mergable,
  mksobj,
  monNam,
  mpickstuff,
  priestini,
  moneyCnt,
  saleable,
  shkName,
  shopType,
  stockShops,
} from '../src/index';
import { messagesEn } from '../src/messages.en';
import { P, setIntrinsic, setItimeout } from '../src/props';
import { tamedog } from '../src/dog';
import { wakeup } from '../src/peaceful';
import { shkArrivals } from '../src/shk';
import { mappearance } from '../src/mimicstate';
import { addMon, setup } from './helpers';
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
const mimicAt = (s: S, x: number, y: number): Entity | undefined =>
  sortedIds(s.state)
    .map((id) => s.state.entities[String(id)])
    .find((e) => e?.c.monster && !eshkOf(s, e.id) && e.c.pos?.x === x && e.c.pos.y === y);
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
        expect([...seen].sort()).toEqual([
          'food',
          'nh:potion_of_booze',
          'nh:potion_of_fruit_juice',
          'nh:potion_of_water',
        ]);
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
      // nothing in the column by the door, something it sells (or, one time in 100 per level of
      // depth, a mimic) on the 12 other squares
      for (let y = 1; y <= 3; y++) expect(itemsAt(s, 5, y)).toEqual([]);
      let stocked = 0;
      for (let x = 1; x <= 4; x++)
        for (let y = 1; y <= 3; y++) {
          const here = itemsAt(s, x, y);
          if (here.length > 0 || mimicAt(s, x, y)) stocked++;
          if (mimicAt(s, x, y)) expect(here).toEqual([]);
          for (const o of here) if (o) expect(saleable(ctxOf(s), e, o)).toBe(true);
        }
      if (type === 'nh:shop') expect(stocked).toBeGreaterThanOrEqual(6);
      else expect(stocked).toBe(12);
      // the other room is no shop: nothing there
      for (let x = 9; x <= 11; x++)
        for (let y = 1; y <= 3; y++) expect(itemsAt(s, x, y)).toEqual([]);
    }
  });

  test('deep down most squares are mimics posing as the goods of the shop', () => {
    const s = shop(1, 'nh:armor_shop');
    s.level.depth = 60; // rn2(100) < 60 a mimic; rn2(10) >= 60 never a strange object
    stockShops(ctxOf(s), s.level);
    let mimics = 0;
    for (let x = 1; x <= 4; x++)
      for (let y = 1; y <= 3; y++) {
        const m = mimicAt(s, x, y);
        if (!m) {
          expect(itemsAt(s, x, y)).toHaveLength(1);
          continue;
        }
        mimics++;
        expect(defs.monster(m.def).glyph.ch).toBe('m');
        expect(itemsAt(s, x, y)).toEqual([]);
        const ap = mappearance(s, m.id);
        expect(ap?.type).toBe('object');
        expect(['armor', 'weapon']).toContain(defs.object(ap!.id).class);
      }
    expect(mimics).toBeGreaterThanOrEqual(4);
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
    // (1 time in 7 he is just "in your way": move again)
    let r = s.engine.step(s.state, { type: 'move', dir: 'w' });
    for (
      let i = 0;
      i < 20 && r.events.some((e) => e.type === 'msg' && e.key === 'dog.in_the_way_peaceful');
      i++
    )
      r = s.engine.step(s.state, { type: 'move', dir: 'w' });
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
    let r2 = t.engine.step(t.state, { type: 'move', dir: 'w' });
    for (
      let i = 0;
      i < 20 && r2.events.some((e) => e.type === 'msg' && e.key === 'dog.in_the_way_peaceful');
      i++
    )
      r2 = t.engine.step(t.state, { type: 'move', dir: 'w' });
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

describe('entering a shop', () => {
  const said = (r: StepResult): string[] =>
    r.events.flatMap((e) => (e.type === 'msg' && e.key?.startsWith('shk.') ? [render(e)] : []));
  /** Izchak's town lighting store, him pinned (speed 0) on his spot, the hero at 7,2. */
  function izchak(seed = 1) {
    const s = shop(seed, 'nh:candle_shop', { town: true });
    stockShops(ctxOf(s), s.level);
    const [id] = shkOn(s);
    const shk = id === undefined ? undefined : s.state.entities[String(id)];
    const e = id === undefined ? null : eshkOf(s, id);
    if (id === undefined || !shk?.c.actor || !shk.c.pos || !shk.c.monster || !e)
      throw new Error('no shopkeeper');
    shk.c.actor.speed = 0;
    shk.c.actor.energy = 0;
    const move = (dir: 'w' | 'e') => s.engine.step(s.state, { type: 'move', dir });
    const at = (x: number, y: number) => {
      const hp = getPlayer(s.state).c.pos;
      if (hp) Object.assign(hp, { x, y });
    };
    return { s, id, shk: shk as typeof shk & { c: Required<typeof shk.c> }, e, move, at };
  }

  test('a new customer is welcomed once, then welcomed again on each return', () => {
    const { s, e, move, at } = izchak();
    expect(said(move('w'))).toEqual([
      '"Velkommen, Valkyrie!  Welcome to Izchak\'s lighting store!"',
    ]);
    expect(e).toMatchObject({ customer: true, visitct: 1 });
    expect(uShops(s)).toEqual([0]);
    // walking on inside says nothing more
    at(4, 2);
    expect(said(move('w'))).toEqual([]);
    // out of the door and back in
    at(7, 2);
    expect(said(move('e'))).toEqual([]);
    expect(uShops(s)).toEqual([]);
    expect(said(move('w'))).toEqual([]); // 7,2
    expect(said(move('w'))).toEqual([
      '"Velkommen, Valkyrie!  Welcome again to Izchak\'s lighting store!"',
    ]);
    expect(e.visitct).toBe(2);
  });

  test('angry, surcharged and robbed keepers; a new customer pacifies an angry one', () => {
    const cases: [Partial<typeof base>, string][] = [];
    const base = { peaceful: true, surcharge: false, robbed: 0 };
    cases.push([
      { peaceful: false },
      '"So, Valkyrie, you dare return to Izchak\'s lighting store?!"',
    ]);
    cases.push([{ surcharge: true }, '"Back again, Valkyrie?  I\'ve got my eye on you."']);
    cases.push([{ robbed: 100 }, 'Izchak mutters imprecations against shoplifters.']);
    for (const [c, line] of cases) {
      const { shk, e, move } = izchak();
      const o = { ...base, ...c };
      e.customer = true;
      e.visitct = 3;
      shk.c.monster.peaceful = o.peaceful;
      e.surcharge = o.surcharge;
      e.robbed = o.robbed;
      expect(said(move('w'))).toEqual([line]);
      expect(shk.c.monster.peaceful).toBe(o.peaceful);
      expect(e.visitct).toBe(3);
    }
    const { shk, e, move } = izchak();
    shk.c.monster.peaceful = false;
    e.surcharge = true;
    expect(said(move('w'))).toEqual([
      '"Velkommen, Valkyrie!  Welcome to Izchak\'s lighting store!"',
    ]);
    expect(shk.c.monster.peaceful).toBe(true);
    expect(e.surcharge).toBe(false);
  });

  test('an asleep keeper says nothing', () => {
    const { shk, move } = izchak();
    shk.c.monster.asleep = true;
    expect(said(move('w'))).toEqual([]);
  });

  test('a shop without its keeper: deserted or untended, said once', () => {
    const { s, id, move, at } = izchak();
    delete s.state.entities[String(id)];
    expect(said(move('w'))).toEqual(['This shop is deserted.']);
    // she is in the room but in no shop while it is untended
    expect(uRooms(s)).toEqual([0]);
    expect(uShops(s)).toEqual([]);
    expect(emptyShops(s)).toEqual([0]);
    expect(said(move('w'))).toEqual([]);
    at(7, 2);
    expect(said(move('e'))).toEqual([]);
    expect(said(move('w'))).toEqual([]);
    expect(said(move('w'))).toEqual([]); // the door again
    expect(getPlayer(s.state).c.pos).toMatchObject({ x: 6, y: 2 });

    // someone else is in it: untended
    const t = izchak();
    delete t.s.state.entities[String(t.id)];
    const newt = addMon(t.s.state, 'nh:newt', 2, 2, { asleep: true });
    const nm = t.s.state.entities[String(newt)];
    if (nm?.c.actor) nm.c.actor.speed = 0;
    t.s.wait(); // the hero sees it
    expect(said(t.move('w'))).toEqual(['This shop is untended.']);
  });

  test('a keeper teleported away goes back to his spot and greets her on his return', () => {
    const { s, shk, e, move, at } = izchak();
    shk.c.actor.speed = 16;
    Object.assign(shk.c.pos, { x: 10, y: 2 }); // into the other room
    expect(said(move('w'))).toEqual(['This shop is deserted.']);
    at(3, 2); // she goes inside
    const lines: string[] = [];
    // back in his shop, near enough his spot that he stops there (shk_move(): GDIST < 3 and
    // not in line with her), which may be the spot itself or a cell next to it
    const home = (): boolean =>
      shk.c.pos.x <= 5 && (shk.c.pos.x - SHK_SPOT.x) ** 2 + (shk.c.pos.y - SHK_SPOT.y) ** 2 < 3;
    for (let t = 0; t < 30 && !home(); t++)
      lines.push(...said(s.engine.step(s.state, { type: 'wait' })));
    expect(home()).toBe(true);
    expect(lines).toEqual(['"Velkommen, Valkyrie!  Welcome to Izchak\'s lighting store!"']);
    expect(uShops(s)).toEqual([0]);
    expect(e.visitct).toBe(1);
    // and he stays there
    for (let t = 0; t < 50; t++) {
      s.engine.step(s.state, { type: 'wait' });
      const p = shk.c.pos;
      expect(p.x >= 1 && p.x <= 5 && p.y >= 1 && p.y <= 3).toBe(true);
    }
  });

  test('with a mattock she is asked to leave it outside, and he blocks the way in', () => {
    const { s, shk, move } = izchak();
    const m = mksobj(ctxOf(s), obj('nh:dwarvish_mattock'), { init: false });
    addToInventory(ctxOf(s), s.state.playerId, m);
    // he is off his spot; the extra move takes him back onto it at once
    Object.assign(shk.c.pos, { x: 4, y: 1 });
    expect(s.state.discovered).not.toContain('nh:dwarvish_mattock');
    expect(said(move('w'))).toEqual([
      '"Velkommen, Valkyrie!  Welcome to Izchak\'s lighting store!"',
      '"Will you please leave your mattock outside?"',
    ]);
    expect(s.state.discovered).toContain('nh:dwarvish_mattock');
    expect(shk.c.pos).toMatchObject(SHK_SPOT);
    // at his normal speed he never leaves the spot while she waits on the door
    shk.c.actor.speed = 16;
    for (let t = 0; t < 100; t++) {
      s.engine.step(s.state, { type: 'wait' });
      expect(shk.c.pos).toMatchObject(SHK_SPOT);
    }
    // two of them, and an upset keeper
    const t = izchak();
    for (let i = 0; i < 2; i++)
      addToInventory(
        ctxOf(t.s),
        t.s.state.playerId,
        mksobj(ctxOf(t.s), obj('nh:dwarvish_mattock'), { init: false }),
      );
    t.e.customer = true;
    t.e.surcharge = true;
    expect(said(t.move('w'))).toEqual([
      '"Back again, Valkyrie?  I\'ve got my eye on you."',
      '"Leave the mattocks outside."',
    ]);
  });

  test('a pick-axe is checked too; with both kinds: "digging tools"', () => {
    const { s, shk, move } = izchak();
    addToInventory(
      ctxOf(s),
      s.state.playerId,
      mksobj(ctxOf(s), obj('nh:pick_axe'), { init: false }),
    );
    Object.assign(shk.c.pos, { x: 4, y: 1 });
    expect(said(move('w'))).toEqual([
      '"Velkommen, Valkyrie!  Welcome to Izchak\'s lighting store!"',
      '"Will you please leave your pick-axe outside?"',
    ]);
    expect(shk.c.pos).toMatchObject(SHK_SPOT);
    const t = izchak();
    for (const id of ['nh:pick_axe', 'nh:dwarvish_mattock'])
      addToInventory(ctxOf(t.s), t.s.state.playerId, mksobj(ctxOf(t.s), obj(id), { init: false }));
    t.e.customer = true;
    t.e.surcharge = true;
    expect(said(t.move('w'))).toEqual([
      '"Back again, Valkyrie?  I\'ve got my eye on you."',
      '"Leave the digging tools outside."',
    ]);
    // the mattock is not identified when a pick-axe comes with it
    expect(t.s.state.discovered).not.toContain('nh:dwarvish_mattock');
  });

  test('without one he steps out of her way, and no extra move', () => {
    const { s, shk, move } = izchak();
    Object.assign(shk.c.pos, { x: 4, y: 1 });
    move('w');
    expect(shk.c.pos).toMatchObject({ x: 4, y: 1 }); // pinned: no energy, no move
    Object.assign(shk.c.pos, SHK_SPOT);
    shk.c.actor.speed = 16;
    let moved = false;
    for (let t = 0; t < 20 && !moved; t++) {
      s.engine.step(s.state, { type: 'wait' });
      moved = !(shk.c.pos.x === SHK_SPOT.x && shk.c.pos.y === SHK_SPOT.y);
    }
    expect(moved).toBe(true);
    // the way in is free
    expect(said(move('w'))).toEqual([]);
    expect(getPlayer(s.state).c.pos).toMatchObject(SHK_SPOT);
  });

  test('an invisible customer is not welcome, and he stays on his spot in her way (7f-b)', () => {
    const { s, shk, move } = izchak();
    setIntrinsic(getPlayer(s.state), P.INVIS, true);
    expect(said(move('w'))).toEqual([
      'Izchak senses your presence.',
      '"Invisible customers are not welcome!"',
    ]);
    // no extra move, and at his normal speed he never steps out of her way
    shk.c.actor.speed = 16;
    for (let t = 0; t < 60; t++) {
      s.engine.step(s.state, { type: 'wait' });
      expect(shk.c.pos).toMatchObject(SHK_SPOT);
    }
    expect(said(move('w'))).toEqual([]);
    expect(getPlayer(s.state).c.pos).toMatchObject({ x: 6, y: 2 });
  });
});

describe('prices', () => {
  /** A shop with no stock, the hero inside it at 3,2 with Charisma `cha`. */
  function bare(cha = 15, type = 'nh:shop') {
    const s = shop(1, type);
    stockShops(ctxOf(s), s.level);
    for (const id of sortedIds(s.state)) {
      const o = s.state.entities[String(id)];
      if (o?.c.item && o.c.pos) delete s.state.entities[String(id)];
    }
    const [id] = shkOn(s);
    const e = id === undefined ? null : eshkOf(s, id);
    const shk = id === undefined ? undefined : s.state.entities[String(id)];
    if (id === undefined || !e || !shk?.c.actor) throw new Error('no shopkeeper');
    shk.c.actor.speed = 0;
    shk.c.actor.energy = 0;
    const hero = getPlayer(s.state);
    if (hero.c.attributes) hero.c.attributes.cha = cha;
    if (hero.c.pos) Object.assign(hero.c.pos, { x: 3, y: 2 });
    checkSpecialRoom(ctxOf(s), false);
    const make = (def: string, o: { quantity?: number; at?: { x: number; y: number } } = {}) => {
      const at = o.at ?? { x: 3, y: 2 };
      const oid = mksobj(ctxOf(s), obj(def), {
        init: false,
        ...(o.quantity !== undefined ? { quantity: o.quantity } : {}),
        at: { level: 'dlvl1', ...at },
      });
      const ent = s.state.entities[String(oid)];
      if (!ent) throw new Error('no object');
      return ent;
    };
    const gold = (n: number) => {
      const g = mkgold(ctxOf(s), n, { level: 'dlvl1', x: 9, y: 2 });
      addToInventory(ctxOf(s), s.state.playerId, g);
    };
    const name = (o: Entity) => render(defs.itemName(s.state, o));
    const step = (a: Parameters<typeof s.engine.step>[1]) => s.engine.step(s.state, a);
    const pickup = () => step({ type: 'mod', action: 'nh:pickup' });
    const payNow = () => step({ type: 'mod', action: 'nh:pay' });
    const answer = (r: StepResult, value: unknown) =>
      step({ type: 'answer', promptId: r.prompt?.id ?? '', value: value as never });
    const lines = (r: StepResult) =>
      r.events.flatMap((ev) => (ev.type === 'msg' && ev.key ? [render(ev)] : []));
    const inv = () => inventoryOf(s.state, s.state.playerId);
    return { s, id, e, shk, make, gold, name, pickup, payNow, answer, lines, inv, step };
  }

  test("get_cost(): Charisma, hunger, the anger surcharge (a known type's base price)", () => {
    // a food ration costs 45
    const table: [number, number][] = [
      [5, 90],
      [6, 68],
      [7, 68],
      [8, 60],
      [10, 60],
      [11, 45],
      [15, 45],
      [16, 34],
      [17, 34],
      [18, 30],
      [19, 23],
      [25, 23],
    ];
    for (const [cha, price] of table) {
      const t = bare(cha);
      const ration = t.make('nh:food_ration');
      expect([cha, getCost(t.s.state, defs, ration, t.e)]).toEqual([cha, price]);
    }
    const t = bare(15);
    const ration = t.make('nh:food_ration');
    const hunger = getPlayer(t.s.state).c.hunger;
    if (!hunger) throw new Error('no hunger');
    for (const [st, price] of [
      ['satiated', 45],
      ['not_hungry', 45],
      ['hungry', 90],
      ['weak', 135],
      ['fainting', 180],
    ] as const) {
      hunger.state = st;
      expect(getCost(t.s.state, defs, ration, t.e)).toBe(price);
      // a shopkeeper buying pays no hunger premium
      expect(getprice(t.s.state, defs, ration, true)).toBe(45);
    }
    hunger.state = 'not_hungry';
    t.e.surcharge = true;
    expect(getCost(t.s.state, defs, ration, t.e)).toBe(60); // + (45 + 2) / 3
    // a partly eaten one is worth nothing, and still costs the minimum 5
    t.e.surcharge = false;
    const it = ration.c.item;
    if (it) it.eaten = 100;
    expect(getprice(t.s.state, defs, ration, false)).toBe(0);
    expect(getCost(t.s.state, defs, ration, t.e)).toBe(5);
  });

  test("a unique monster's corpse is priced 51 times its base, not once (G_UNIQ)", () => {
    // ref: src/shk.c corpsenm_price_adj(): tmp = 1 + 50 for unique_corpstat()
    const t = bare(15);
    const id = mksobj(ctxOf(t.s), obj('nh:corpse'), {
      init: false,
      corpseOf: 'nh:oracle',
      at: { level: 'dlvl1', x: 3, y: 2 },
    });
    const corpse = t.s.state.entities[String(id)]!;
    // the Oracle: level 12, nutrition 400, conveys nothing: (11 * 2 + 400 / 30) * (1 + 50)
    expect(getprice(t.s.state, defs, corpse, true)).toBe(defs.object('nh:corpse').cost + 35 * 51);
  });

  test('an unidentified type costs a third more when its id is a multiple of 4', () => {
    const t = bare(15, 'nh:candle_shop');
    const candles: Entity[] = [];
    for (let i = 0; i < 4; i++)
      candles.push(t.make('nh:tallow_candle', { at: { x: 1 + i, y: 1 } }));
    for (const c of candles) {
      const it = c.c.item;
      if (it) it.age = 200; // full: no half price
      expect([c.id % 4, getCost(t.s.state, defs, c, t.e)]).toEqual([
        c.id % 4,
        c.id % 4 === 0 ? 13 : 10,
      ]);
    }
    t.s.state.discovered.push('nh:tallow_candle');
    for (const c of candles) expect(getCost(t.s.state, defs, c, t.e)).toBe(10);
    // a used candle is half price
    const it = candles[1]?.c.item;
    if (it) it.age = 199;
    expect(getCost(t.s.state, defs, candles[1] as Entity, t.e)).toBe(5);
  });

  test('names: for sale on the shop floor, no charge on his spot, nothing outside', () => {
    const t = bare(15);
    const ration = t.make('nh:food_ration');
    expect(t.name(ration)).toBe('food ration (for sale, 45 zorkmids)');
    const two = t.make('nh:apple', { quantity: 2, at: { x: 2, y: 2 } });
    expect(t.name(two)).toBe('2 apples (for sale, 14 zorkmids)');
    const onSpot = t.make('nh:apple', { at: SHK_SPOT });
    expect(t.name(onSpot)).toBe('apple (no charge)');
    // seen from outside the shop: no prices
    const hp = getPlayer(t.s.state).c.pos;
    if (hp) Object.assign(hp, { x: 7, y: 2 });
    checkSpecialRoom(ctxOf(t.s), false);
    expect(t.name(ration)).toBe('food ration');
  });

  test('picking up bills it: the quote, the unpaid name, a partial stack, putting it back', () => {
    const t = bare(10);
    t.s.state.discovered.push('nh:tallow_candle');
    const c = t.make('nh:tallow_candle', { quantity: 5 });
    const it = c.c.item;
    if (it) it.age = 200;
    const r = t.pickup();
    expect(t.lines(r)[0]).toMatch(
      /^"For you, (good|honored|most gracious|esteemed) lady; only 13 zorkmids per tallow candle\."$/,
    );
    expect(t.e.bill).toEqual([{ oid: c.id, bquan: 5, price: 13, useup: false }]);
    expect(it?.unpaid).toBe(true);
    expect(t.name(c)).toBe('5 tallow candles (unpaid, 65 zorkmids)');
    // drop 2 of them: the bill splits, the dropped part goes back to him
    const d = t.step({ type: 'mod', action: 'nh:drop_many' });
    t.answer(d, [{ value: c.id, count: 2 }]);
    expect(t.e.bill).toEqual([{ oid: c.id, bquan: 3, price: 13, useup: false }]);
    const floor = sortedIds(t.s.state)
      .map((id) => t.s.state.entities[String(id)])
      .filter((o) => o?.c.pos?.x === 3 && o.c.pos.y === 2 && o.c.item);
    expect(floor).toHaveLength(1);
    expect(floor[0]?.c.item).toMatchObject({ quantity: 2 });
    expect(floor[0]?.c.item?.unpaid).toBeUndefined();
    expect(floor[0]?.c.item?.noCharge).toBeUndefined();
    expect(t.name(floor[0] as Entity)).toBe('2 tallow candles (for sale, 26 zorkmids)');
    // picking them up again merges them back into the unpaid stack, one bill line
    t.pickup();
    expect(t.inv().map((o) => o.c.item?.quantity)).toEqual([5]);
    expect(t.e.bill).toEqual([{ oid: c.id, bquan: 5, price: 13, useup: false }]);
  });

  test('her own things she will not sell are no charge and stay hers', () => {
    const t = bare(15);
    const own = mksobj(ctxOf(t.s), obj('nh:dagger'), { init: false });
    addToInventory(ctxOf(t.s), t.s.state.playerId, own);
    const d = t.step({ type: 'mod', action: 'nh:drop', args: { item: own } });
    expect(t.lines(d)).toEqual(['You drop a dagger.']);
    expect(d.prompt?.kind).toBe('yn');
    t.answer(d, false);
    const e = t.s.state.entities[String(own)] as Entity;
    expect(e.c.item?.noCharge).toBe(true);
    expect(t.name(e)).toBe('dagger (no charge)');
    t.pickup();
    expect(t.e.bill).toEqual([]);
    expect(e.c.item?.noCharge).toBeUndefined();
    expect(t.name(e)).toBe('dagger');
  });

  test('a container picked up is billed with its contents, each on its own line', () => {
    const t = bare(15);
    // an o_id that is not a multiple of 4: no unidentified surcharge (oid_price_adjustment())
    while (t.s.state.nextEntityId % 4 === 0) t.s.state.nextEntityId++;
    const sack = t.make('nh:sack');
    const apple = mksobj(ctxOf(t.s), obj('nh:apple'), { init: false });
    putIn(defs, t.s.state, sack.id, apple);
    expect(t.name(sack)).toBe('bag (for sale, 9 zorkmids)'); // 2 + 7
    const r = t.pickup();
    expect(t.lines(r)[0]).toMatch(/only 9 zorkmids for this bag and its contents\."$/);
    expect(t.e.bill.map((b) => [b.oid, b.price])).toEqual([
      [sack.id, 2],
      [apple, 7],
    ]);
    expect(t.name(sack)).toMatch(/ \(unpaid, 9 zorkmids\)$/);
  });

  test('taking a shop object out of a container on the floor bills it', () => {
    const t = bare(15);
    const sack = t.make('nh:sack');
    const apple = mksobj(ctxOf(t.s), obj('nh:apple'), { init: false });
    putIn(defs, t.s.state, sack.id, apple);
    const r = t.step({ type: 'mod', action: 'nh:loot', args: { box: sack.id } });
    let p = r;
    // answer the loot menus until the apple is out
    for (let i = 0; i < 4 && p.prompt; i++) {
      const o = p.prompt;
      if (o.id === 'loot-out') p = t.answer(p, [apple]);
      else if (o.options?.some((x) => x.value === 'o')) p = t.answer(p, 'o');
      else p = t.answer(p, true);
    }
    expect(t.lines(p)).toContain('The apple will cost you 7 zorkmids.');
    expect(t.e.bill).toEqual([{ oid: apple, bquan: 1, price: 7, useup: false }]);
    expect(t.s.state.entities[String(apple)]?.c.item?.unpaid).toBe(true);
  });

  test('pay: one item directly, "Thank you", no time without a bill', () => {
    const t = bare(15);
    const ration = t.make('nh:food_ration');
    t.pickup();
    t.gold(100);
    const r = t.payNow();
    expect(t.lines(r)).toEqual([
      'You bought a food ration for 45 gold pieces.',
      `"Thank you for shopping in ${render(shkName(t.e))}'s general store!"`,
    ]);
    expect(t.e.bill).toEqual([]);
    expect(ration.c.item?.unpaid).toBeUndefined();
    expect(t.name(ration)).toBe('food ration');
    expect(moneyCnt(ctxOf(t.s), t.s.state.playerId)).toBe(55);
    expect(moneyCnt(ctxOf(t.s), t.id)).toBeGreaterThanOrEqual(1030 + 45);
    expect(t.lines(t.payNow())).toEqual([`You do not owe ${render(shkName(t.e))} anything.`]);
  });

  test('pay: too little gold; itemized billing, item by item', () => {
    const t = bare(15);
    const ration = t.make('nh:food_ration');
    const apple = t.make('nh:apple', { at: { x: 2, y: 2 } });
    t.pickup();
    const hp = getPlayer(t.s.state).c.pos;
    if (hp) hp.x = 2;
    t.pickup();
    expect(t.lines(t.payNow())).toEqual(['You have no gold or credit.']);
    t.gold(5);
    expect(t.lines(t.payNow())).toEqual([
      "You don't have enough gold to buy any of the items you've picked.",
    ]);
    t.gold(45);
    // not itemized: the dearest first, then he cannot pay for the apple
    let r = t.payNow();
    expect(r.prompt?.key).toBe('pay.itemize');
    r = t.answer(r, false);
    expect(t.lines(r)).toEqual([
      'You bought a food ration for 45 gold pieces.',
      "You don't have gold enough to pay for an apple.",
    ]);
    expect(t.e.bill.map((b) => b.oid)).toEqual([apple.id]);
    expect(ration.c.item?.unpaid).toBeUndefined();
    // itemized: say no, then yes
    t.gold(10);
    const ration2 = t.make('nh:food_ration', { at: { x: 2, y: 2 } });
    t.pickup();
    r = t.answer(t.payNow(), true);
    expect(r.prompt?.key).toBe('pay.item_prompt1');
    expect(render({ key: r.prompt?.key ?? '', params: r.prompt?.params ?? {} })).toBe(
      'A food ration for 45 zorkmids.  Pay?',
    );
    r = t.answer(r, false);
    expect(render({ key: r.prompt?.key ?? '', params: r.prompt?.params ?? {} })).toBe(
      'An apple for 7 zorkmids.  Pay?',
    );
    r = t.answer(r, true);
    expect(t.lines(r)).toEqual([
      'You bought an apple for 7 gold pieces.',
      `"Thank you for shopping in ${render(shkName(t.e))}'s general store!"`,
    ]);
    expect(t.e.bill.map((b) => b.oid)).toEqual([ration2.id]);
    expect(moneyCnt(ctxOf(t.s), t.s.state.playerId)).toBe(8); // 50 - 45 + 10 - 7
  });

  test('using up an unpaid object keeps it on the bill; partly used stacks pay the used part first', () => {
    const t = bare(15, 'nh:candle_shop');
    t.s.state.discovered.push('nh:tallow_candle');
    const c = t.make('nh:tallow_candle', { quantity: 3 });
    const it = c.c.item;
    if (it) it.age = 200;
    t.pickup();
    // one of them is used up (as useup() would): the bill keeps 3, the stack has 2
    if (it) it.quantity = 2;
    t.gold(100);
    let r = t.answer(t.payNow(), true);
    // the used-up candle comes first
    expect(render({ key: r.prompt?.key ?? '', params: r.prompt?.params ?? {} })).toBe(
      'A tallow candle for 10 zorkmids.  Pay?',
    );
    r = t.answer(r, false);
    // asked about the rest, he will not sell it before the used-up one is paid for
    expect(render({ key: r.prompt?.key ?? '', params: r.prompt?.params ?? {} })).toBe(
      '2 tallow candles for 20 zorkmids.  Pay?',
    );
    r = t.answer(r, true);
    expect(t.lines(r)).toEqual(['"Please pay for the other tallow candle before buying these."']);
    expect(t.e.bill).toEqual([{ oid: c.id, bquan: 3, price: 10, useup: false }]);
    // all of it, not itemized
    r = t.answer(t.payNow(), false);
    expect(t.lines(r).slice(0, 2)).toEqual([
      'You paid for a tallow candle at a cost of 10 gold pieces.',
      'You bought 2 tallow candles for 20 gold pieces.',
    ]);
    expect(t.e.bill).toEqual([]);
  });

  test('a used-up unpaid potion stays billed by name', () => {
    const t = bare(15);
    while (t.s.state.nextEntityId % 4 === 0) t.s.state.nextEntityId++; // no o_id surcharge
    const pot = t.make('nh:potion_of_water');
    const it = pot.c.item;
    if (it) it.buc = 'blessed';
    t.pickup();
    billUsedUp(ctxOf(t.s), pot);
    delete t.s.state.entities[String(pot.id)];
    expect(t.e.bill).toMatchObject([{ oid: pot.id, bquan: 1, price: 100, useup: true }]);
    t.gold(100);
    const r = t.payNow();
    expect(t.lines(r)[0]).toMatch(/^You paid for a .*potion.* at a cost of 100 gold pieces\.$/);
    expect(t.e.bill).toEqual([]);
  });

  test('biting unpaid food: you pay for it, the rest is still for sale', () => {
    const t = bare(15, 'nh:food_shop');
    const r0 = t.make('nh:food_ration', { quantity: 2 });
    t.pickup();
    expect(t.e.bill).toEqual([{ oid: r0.id, bquan: 2, price: 45, useup: false }]);
    const r = t.step({ type: 'mod', action: 'nh:eat', args: { item: r0.id } });
    expect(t.lines(r)).toContain('"You bite that food ration, you pay for it!"');
    // one used-up line for the bitten one, the other still unpaid
    expect(t.e.bill).toHaveLength(2);
    expect(t.e.bill.find((b) => b.oid === r0.id)).toEqual({
      oid: r0.id,
      bquan: 1,
      price: 45,
      useup: false,
    });
    expect(t.e.bill.find((b) => b.useup)).toMatchObject({ bquan: 1, price: 45 });
    expect(r0.c.item).toMatchObject({ quantity: 1, unpaid: true });
  });

  test('biting food on the shop floor bills it; the rest of it is no charge', () => {
    const t = bare(15, 'nh:food_shop');
    const ration = t.make('nh:food_ration');
    const r = t.step({ type: 'mod', action: 'nh:eat', args: { item: ration.id } });
    expect(t.lines(r)).toContain('"You bite that, you pay for it!"');
    expect(t.e.bill).toMatchObject([{ bquan: 1, price: 45, useup: true }]);
    // interrupted: what is left lies there, no charge
    expect(ration.c.item?.noCharge).toBe(true);
    expect(ration.c.item?.unpaid).toBeUndefined();
  });

  test('stepping onto the door with a bill: "Please pay before leaving."', () => {
    const t = bare(15);
    t.make('nh:apple', { at: { x: 4, y: 2 } });
    Object.assign(t.shk.c.pos ?? {}, { x: 1, y: 1 }); // out of the way
    const hp = getPlayer(t.s.state).c.pos;
    if (hp) hp.x = 4;
    t.pickup();
    expect(t.e.bill).toHaveLength(1);
    expect(t.lines(t.step({ type: 'move', dir: 'e' }))).toEqual([]); // onto his spot
    const r = t.step({ type: 'move', dir: 'e' });
    expect(t.lines(r)).toContain('"Valkyrie!  Please pay before leaving."');
    // and not again while she stays on the door
    expect(t.lines(t.step({ type: 'wait' }))).not.toContain(
      '"Valkyrie!  Please pay before leaving."',
    );
    // nothing owed: nothing said
    const u = bare(15);
    Object.assign(u.shk.c.pos ?? {}, { x: 1, y: 1 });
    const up = getPlayer(u.s.state).c.pos;
    if (up) up.x = 5;
    checkSpecialRoom(ctxOf(u.s), false);
    expect(u.lines(u.step({ type: 'move', dir: 'e' }))).toEqual([]);
  });

  test('the pay offer: on herself in a shop, on an adjacent shopkeeper', () => {
    const t = bare(15);
    t.step({ type: 'wait' }); // she sees him
    const self = t.s.engine.query(t.s.state).actionsFor({ kind: 'self' });
    expect(self.some((o) => o.action.type === 'mod' && o.action.action === 'nh:pay')).toBe(true);
    const hp = getPlayer(t.s.state).c.pos;
    if (hp) hp.x = 4;
    const cell = t.s.engine.query(t.s.state).actionsFor({ kind: 'cell', pos: SHK_SPOT });
    const offer = cell.find((o) => o.action.type === 'mod' && o.action.action === 'nh:pay');
    expect(offer?.labelKey).toBe('action.nh:pay_shk');
  });

  describe('selling and fees', () => {
    type T = ReturnType<typeof bare>;
    const own = (t: T, def: string): Entity => {
      const id = mksobj(ctxOf(t.s), obj(def), { init: false });
      addToInventory(ctxOf(t.s), t.s.state.playerId, id);
      return t.s.state.entities[String(id)] as Entity;
    };
    const know = (t: T, ...ids: DefId[]) => {
      for (const id of ids) if (!t.s.state.discovered.includes(id)) t.s.state.discovered.push(id);
    };
    const ask = (r: StepResult) =>
      render({ key: r.prompt?.key ?? '', params: r.prompt?.params ?? {} });
    const shkn = (t: T) => render(shkName(t.e));
    const cash = (t: T, id: number) => moneyCnt(ctxOf(t.s), id);
    const outOfTheWay = (t: T) => Object.assign(t.shk.c.pos ?? {}, { x: 1, y: 1 });

    test('drop: he offers to buy it, and yes sells it', () => {
      const t = bare(15);
      know(t, 'nh:long_sword');
      const sword = own(t, 'nh:long_sword');
      const had = cash(t, t.id);
      const d = t.step({ type: 'mod', action: 'nh:drop', args: { item: sword.id } });
      // set_cost(): half of 15, rounded
      expect(ask(d)).toBe(`${shkn(t)} offers 8 gold pieces for your long sword.  Sell it?`);
      const r = t.answer(d, true);
      expect(t.lines(r)).toEqual(['You sold a long sword for 8 gold pieces.']);
      expect(cash(t, t.s.state.playerId)).toBe(8);
      expect(cash(t, t.id)).toBe(had - 8);
      // it is his now, for sale
      expect(sword.c.item?.noCharge).toBeUndefined();
      expect(t.name(sword)).toBe('long sword (for sale, 15 zorkmids)');
    });

    test('drop several: "a" sells the rest without asking, "q" keeps the rest', () => {
      for (const reply of ['a', 'q'] as const) {
        const t = bare(15);
        know(t, 'nh:long_sword', 'nh:dagger');
        const items = [own(t, 'nh:long_sword'), own(t, 'nh:dagger'), own(t, 'nh:apple')];
        const d = t.step({ type: 'mod', action: 'nh:drop_many' });
        let r = t.answer(
          d,
          items.map((o) => o.id),
        );
        expect(r.prompt?.kind).toBe('menu');
        expect(r.prompt?.options?.map((o) => o.value)).toEqual(['y', 'n', 'a', 'q']);
        r = t.answer(r, reply);
        expect(r.prompt ?? null).toBeNull();
        const sold = t.lines(r).filter((l) => l.startsWith('You sold'));
        expect(sold).toHaveLength(reply === 'a' ? 3 : 0);
        for (const o of items) expect(o.c.item?.noCharge).toBe(reply === 'a' ? undefined : true);
        expect(cash(t, t.s.state.playerId)).toBe(reply === 'a' ? 8 + 2 + 4 : 0);
      }
    });

    test('gold she drops in a shop is marked no charge until she picks it up again', () => {
      const t = bare(15);
      const gold = own(t, 'nh:gold_piece');
      if (gold.c.item) gold.c.item.quantity = 5;
      const d = t.step({ type: 'mod', action: 'nh:drop', args: { item: gold.id } });
      expect(d.prompt ?? null).toBeNull();
      expect(gold.c.item?.noCharge).toBe(true);
      expect(t.e.credit).toBe(0);
      // ref: invent.c addinv_core0(): never no_charge in her inventory (addtobill() skips gold)
      t.pickup();
      expect(cash(t, t.s.state.playerId)).toBe(5);
      const carried = inventoryOf(t.s.state, t.s.state.playerId).find(
        (o) => o.def === 'nh:gold_piece',
      );
      expect(carried?.c.item?.noCharge).toBeUndefined();
    });

    test("a shop that doesn't deal in it: he seems uninterested, and it stays hers", () => {
      const t = bare(15, 'nh:food_shop');
      const wand = own(t, 'nh:wand_of_striking');
      const d = t.step({ type: 'mod', action: 'nh:drop', args: { item: wand.id } });
      expect(d.prompt ?? null).toBeNull();
      expect(t.lines(d)[1]).toBe(`${shkn(t)} seems uninterested.`);
      expect(wand.c.item?.noCharge).toBe(true);
      // food he buys
      const apple = own(t, 'nh:apple');
      const a = t.step({ type: 'mod', action: 'nh:drop', args: { item: apple.id } });
      expect(ask(a)).toBe(`${shkn(t)} offers 4 gold pieces for your apple.  Sell it?`);
    });

    test('a keeper with no gold offers credit, and the credit pays the bill', () => {
      const t = bare(15);
      know(t, 'nh:long_sword');
      for (const o of inventoryOf(t.s.state, t.id))
        if (o.def === 'nh:gold_piece') delete t.s.state.entities[String(o.id)];
      const sword = own(t, 'nh:long_sword');
      const d = t.step({ type: 'mod', action: 'nh:drop', args: { item: sword.id } });
      expect(t.lines(d)).toContain(`${shkn(t)} cannot pay you at present.`);
      expect(ask(d)).toBe('Will you accept 7 zorkmids in credit for a long sword?');
      expect(t.lines(t.answer(d, true))).toEqual([
        'You traded a long sword for 7 zorkmids in credit.',
      ]);
      expect(t.e.credit).toBe(7);
      t.make('nh:apple', { at: { x: 2, y: 2 } });
      const hp = getPlayer(t.s.state).c.pos;
      if (hp) hp.x = 2;
      t.pickup();
      const r = t.payNow();
      expect(t.lines(r).slice(0, 2)).toEqual([
        'The price is deducted from your credit.',
        'You bought an apple for 7 gold pieces.',
      ]);
      expect(t.e.credit).toBe(0);
      expect(t.e.bill).toEqual([]);
    });

    test('an angry keeper takes what she drops: "Thank you, scum!"', () => {
      const t = bare(15);
      const m = t.shk.c.monster;
      if (m) m.peaceful = false;
      const dagger = own(t, 'nh:dagger');
      const d = t.step({ type: 'mod', action: 'nh:drop', args: { item: dagger.id } });
      expect(d.prompt ?? null).toBeNull();
      expect(t.lines(d)).toContain('"Thank you, scum!"');
      expect(dagger.c.item?.noCharge).toBeUndefined();
      expect(cash(t, t.s.state.playerId)).toBe(0);
    });

    test('an unpaid candle thrown out of the door is owed; the debt is paid first', () => {
      const t = bare(15, 'nh:candle_shop');
      know(t, 'nh:tallow_candle');
      const c = t.make('nh:tallow_candle');
      if (c.c.item) c.c.item.age = 200;
      t.pickup();
      expect(t.e.bill).toHaveLength(1);
      outOfTheWay(t);
      const th = t.step({ type: 'mod', action: 'nh:throw', args: { item: c.id } });
      const r = t.answer(th, 'e');
      expect(t.lines(r)).toContain(`You owe ${shkn(t)} 10 zorkmids for it!`);
      expect(c.c.pos?.x).toBeGreaterThan(6); // out of the shop
      expect(c.c.item?.unpaid).toBeUndefined();
      expect(t.e.bill).toEqual([]);
      expect(t.e.debit).toBe(10);
      t.gold(30);
      const p = t.payNow();
      expect(t.lines(p)).toContain(`You owe ${shkn(t)} 10 zorkmids for the use of merchandise.`);
      expect(t.e.debit).toBe(0);
      expect(cash(t, t.s.state.playerId)).toBe(20);
    });

    test('her own dagger thrown onto the shop floor is sold without asking', () => {
      const t = bare(15);
      know(t, 'nh:dagger');
      outOfTheWay(t);
      const hp = getPlayer(t.s.state).c.pos;
      if (hp) hp.x = 4;
      checkSpecialRoom(ctxOf(t.s), false);
      const dagger = own(t, 'nh:dagger');
      const th = t.step({ type: 'mod', action: 'nh:throw', args: { item: dagger.id } });
      const r = t.answer(th, 'w');
      expect(r.prompt ?? null).toBeNull();
      expect(t.lines(r)).toContain(
        'You relinquish a dagger and receive 2 gold pieces in compensation.',
      );
      expect(dagger.c.pos?.x).toBe(1);
      expect(cash(t, t.s.state.playerId)).toBe(2);
    });

    test('a shop object kicked out of the door is owed', () => {
      const t = bare(15);
      const apple = t.make('nh:apple', { at: { x: 4, y: 2 } });
      outOfTheWay(t);
      const r = t.step({ type: 'mod', action: 'nh:kick', args: { dir: 'e' } });
      expect(apple.c.pos?.x).toBeGreaterThan(6);
      expect(t.lines(r)).toContain(`You owe ${shkn(t)} 7 zorkmids for it!`);
      expect(t.e.debit).toBe(7);
    });

    test('zapping an unpaid wand or lighting an unpaid lamp: a usage fee', () => {
      const t = bare(15);
      know(t, 'nh:wand_of_striking', 'nh:oil_lamp');
      const wand = t.make('nh:wand_of_striking');
      if (wand.c.item) wand.c.item.spe = 5;
      t.pickup();
      const z = t.step({ type: 'mod', action: 'nh:zap', args: { item: wand.id } });
      // cost_per_charge(): a quarter of 150 with more than one charge left
      expect(t.lines(z)).toHaveLength(1);
      expect(t.lines(z)[0]).toMatch(/^"(Hey! {2})?(Ahem\. {2})?Usage fee, 37 zorkmids\."$/);
      t.answer(z, 'w');
      expect(t.e.debit).toBe(37);
      const lamp = t.make('nh:oil_lamp', { at: { x: 2, y: 2 } });
      if (lamp.c.item) lamp.c.item.age = 1500;
      const hp = getPlayer(t.s.state).c.pos;
      if (hp) hp.x = 2;
      t.pickup();
      const a = t.step({ type: 'mod', action: 'nh:apply', args: { item: lamp.id } });
      expect(t.lines(a)[0]).toMatch(/^"(Hey! {2})?(Ahem\. {2})?Usage fee, 10 zorkmids\."$/);
      expect(t.e.debit).toBe(47);
      // her own wand costs nothing
      const mine = own(t, 'nh:wand_of_striking');
      if (mine.c.item) mine.c.item.spe = 5;
      const z2 = t.step({ type: 'mod', action: 'nh:zap', args: { item: mine.id } });
      expect(t.lines(z2)).toEqual([]);
    });

    test("selling into the shop's container on his floor", () => {
      const t = bare(15);
      know(t, 'nh:dagger');
      const sack = t.make('nh:sack');
      const dagger = own(t, 'nh:dagger');
      let r = t.step({ type: 'mod', action: 'nh:loot', args: { box: sack.id } });
      for (let i = 0; i < 4 && r.prompt && r.prompt.id !== 'sell'; i++) {
        const o = r.prompt;
        if (o.id === 'loot-in') r = t.answer(r, [dagger.id]);
        else if (o.options?.some((x) => x.value === 'i')) r = t.answer(r, 'i');
        else r = t.answer(r, true);
      }
      expect(ask(r)).toBe(`${shkn(t)} offers 2 gold pieces for your dagger.  Sell it?`);
      r = t.answer(r, 'y');
      expect(t.lines(r)).toEqual([
        'You sold a dagger for 2 gold pieces.',
        'You put a dagger into the bag.',
      ]);
      expect(dagger.c.item?.containedIn).toBe(sack.id);
      expect(dagger.c.item?.noCharge).toBeUndefined();
      expect(cash(t, t.s.state.playerId)).toBe(2);
    });
  });

  describe('robbery, anger and making up', () => {
    type T = ReturnType<typeof bare>;
    const shkn = (t: T) => render(shkName(t.e));
    const cash = (t: T, id: number) => moneyCnt(ctxOf(t.s), id);
    const heroAt = (t: T, x: number, y: number) =>
      Object.assign(getPlayer(t.s.state).c.pos ?? {}, { x, y });
    /** A pinned, peaceful watchman in the other room. */
    const watchman = (t: T): Entity => {
      const id = addMon(t.s.state, 'nh:watchman', 10, 2, { peaceful: true });
      const w = t.s.state.entities[String(id)] as Entity;
      if (w.c.actor) w.c.actor.speed = 0;
      return w;
    };
    /** She picks up an apple at 4,2 with him out of the way at 1,1, and walks onto the door. */
    const owing = (t: T): Entity => {
      const apple = t.make('nh:apple', { at: { x: 4, y: 2 } });
      Object.assign(t.shk.c.pos ?? {}, { x: 1, y: 1 });
      heroAt(t, 4, 2);
      t.pickup();
      t.step({ type: 'move', dir: 'e' });
      t.step({ type: 'move', dir: 'e' }); // the door: "Please pay before leaving."
      return apple;
    };

    test('walking out with an unpaid apple: robbery, the alarm, the Watch, hot pursuit', () => {
      const t = bare(15);
      const w = watchman(t);
      const apple = owing(t);
      const price = t.e.bill[0]?.price ?? 0;
      expect(price).toBeGreaterThan(0);
      const r = t.step({ type: 'move', dir: 'e' });
      const lines = t.lines(r);
      expect(lines.slice(0, 3)).toEqual([
        'You escaped the shop without paying!',
        `You stole ${price} zorkmids worth of merchandise.`,
        'An alarm sounds!',
      ]);
      expect(lines).not.toContain('But no one seems to respond to it.');
      expect(w.c.monster?.peaceful).toBe(false);
      expect(t.shk.c.monster?.peaceful).toBe(false);
      expect(t.e).toMatchObject({ robbed: price, following: true, surcharge: true, bill: [] });
      expect(apple.c.item?.unpaid).toBeUndefined();
      expect(uShops(t.s)).toEqual([]);
      // no Watch: nobody answers the alarm
      const u = bare(15);
      owing(u);
      expect(u.lines(u.step({ type: 'move', dir: 'e' }))).toContain(
        'But no one seems to respond to it.',
      );
    });

    test("credit covers the bill: no robbery; a sleeping keeper's door is no obstacle", () => {
      const t = bare(15);
      t.e.credit = 100;
      owing(t);
      const r = t.step({ type: 'move', dir: 'e' });
      expect(t.lines(r)[0]).toBe(
        'Your credit of 100 zorkmids is used to cover your shopping bill.',
      );
      expect(t.e).toMatchObject({ robbed: 0, following: false, credit: 0, bill: [] });
      expect(t.shk.c.monster?.peaceful).toBe(true);
      // he sleeps: stepping onto the door is enough (he wakes up and sees her gone)
      const u = bare(15);
      u.make('nh:apple', { at: { x: 4, y: 2 } });
      Object.assign(u.shk.c.pos ?? {}, { x: 1, y: 1 });
      if (u.shk.c.monster) u.shk.c.monster.asleep = true;
      heroAt(u, 4, 2);
      u.pickup();
      u.step({ type: 'move', dir: 'e' });
      const d = u.lines(u.step({ type: 'move', dir: 'e' }));
      expect(d).not.toContain('"Valkyrie!  Please pay before leaving."');
      expect(d).toContain('You escaped the shop without paying!');
      expect(u.shk.c.monster?.asleep).toBe(false);
      expect(u.e.following).toBe(true);
    });

    test('paying off a robbed keeper: he calms down, goes home, and so does the Watch', () => {
      const t = bare(15);
      const w = watchman(t);
      owing(t);
      t.step({ type: 'move', dir: 'e' }); // robbed
      const robbed = t.e.robbed;
      // he catches up with her outside his shop
      Object.assign(t.shk.c.pos ?? {}, { x: 8, y: 2 });
      // too little gold
      t.gold(Math.floor((robbed - 1) / 2));
      let r = t.payNow();
      expect(t.lines(r)).toEqual([
        `${shkn(t)} is after blood, not gold!`,
        expect.stringMatching(/^Besides, you don't have enough to interest (him|her)\.$/),
      ]);
      expect(t.shk.c.monster?.peaceful).toBe(false);
      t.gold(robbed);
      const had = cash(t, t.s.state.playerId);
      r = t.payNow();
      expect(t.lines(r)).toEqual([
        `${shkn(t)} is after blood, not gold!`,
        expect.stringMatching(/^But since (his|her) shop has been robbed recently,$/),
        expect.stringMatching(new RegExp(`^you compensate ${shkn(t)} for (his|her) losses\\.$`)),
        expect.stringMatching(new RegExp(`^${shkn(t)} returns to (his|her) shop\\.$`)),
      ]);
      expect(cash(t, t.s.state.playerId)).toBe(had - robbed);
      expect(t.shk.c.monster?.peaceful).toBe(true);
      expect(t.e).toMatchObject({ robbed: 0, following: false });
      expect(t.shk.c.pos).toMatchObject(SHK_SPOT);
      expect(w.c.monster?.peaceful).toBe(true);
    });

    test('an angry keeper who was not robbed takes 1000 gold to appease', () => {
      const t = bare(15);
      if (t.shk.c.monster) t.shk.c.monster.peaceful = false;
      t.e.customer = true;
      heroAt(t, 4, 2); // next to him
      t.step({ type: 'wait' }); // she sees him
      expect(t.lines(t.payNow())).toEqual([
        `${shkn(t)} is after your hide, not your gold!`,
        'Moreover, you have no gold.',
      ]);
      t.gold(1500);
      const lines = t.lines(t.payNow());
      expect(lines[0]).toBe(`${shkn(t)} is after your hide, not your gold!`);
      expect(lines[1]).toMatch(
        new RegExp(
          `^You try to appease the angry ${shkn(t)} by giving (him|her) 1000 gold pieces\\.$`,
        ),
      );
      expect(cash(t, t.s.state.playerId)).toBe(500);
      // two times in three he calms down (in his shop: "calms down")
      if (lines[2] === `But ${shkn(t)} is as angry as ever.`)
        expect(t.shk.c.monster?.peaceful).toBe(false);
      else {
        expect(lines[2]).toBe(`${shkn(t)} calms down.`);
        expect(t.shk.c.monster?.peaceful).toBe(true);
      }
    });

    test('attacked by her outside any shop, he goes after her; tamedog() only calms him', () => {
      const t = bare(15);
      Object.assign(t.shk.c.pos ?? {}, { x: 8, y: 2 });
      heroAt(t, 7, 2);
      checkSpecialRoom(ctxOf(t.s), false);
      wakeup(ctxOf(t.s), t.id);
      expect(t.shk.c.monster?.peaceful).toBe(false);
      expect(t.e).toMatchObject({ following: true, surcharge: true });
      tamedog(ctxOf(t.s), t.id, null, false, () => undefined);
      expect(t.shk.c.monster?.peaceful).toBe(true);
      expect(t.shk.c.monster?.tame).toBeUndefined();
      expect(t.e.following).toBe(false);
      expect(t.shk.c.pos).toMatchObject(SHK_SPOT);
    });

    test('a following keeper next to her: "Didn\'t you forget to pay?"', () => {
      const t = bare(15);
      t.e.following = true;
      t.e.customer = true;
      heroAt(t, 4, 2);
      if (t.shk.c.actor) Object.assign(t.shk.c.actor, { speed: 12, energy: 12 });
      t.s.state.turn = 100;
      const lines = t.lines(t.step({ type: 'wait' }));
      expect(lines[0]).toBe('"Velkommen, Valkyrie!  Didn\'t you forget to pay?"');
    });

    test('a keeper paid off on another level vanishes home', () => {
      const t = bare(15);
      const w = watchman(t);
      if (w.c.monster) w.c.monster.peaceful = false;
      if (t.shk.c.monster) t.shk.c.monster.peaceful = false;
      t.e.robbed = 10;
      t.e.following = true;
      // he is with her on another level (the level ids differ: his shop level is elsewhere)
      t.e.shoplevel = 'dlvl9';
      t.s.state.levels['dlvl9'] = { ...t.s.level, id: 'dlvl9' };
      heroAt(t, 4, 2);
      t.step({ type: 'wait' }); // she sees him
      t.gold(10);
      const lines = t.lines(t.payNow());
      expect(lines).toContain(`Satisfied, ${shkn(t)} suddenly disappears!`);
      expect(t.shk.c.pos).toMatchObject({ level: 'dlvl9', ...SHK_SPOT });
      expect(t.e.dismissKops).toBe(true);
      // (make_happy_shoppers() calms the Watch of the level she is on, as in NetHack)
      expect(w.c.monster?.peaceful).toBe(true);
      shkArrivals(ctxOf(t.s), 'dlvl9');
      expect(t.e.dismissKops).toBeUndefined();
    });

    test('killing him frees the stock and voids her bill', () => {
      const t = bare(15);
      const apple = t.make('nh:apple');
      const pear = t.make('nh:apple', { at: { x: 2, y: 2 } });
      t.pickup();
      expect(apple.c.item?.unpaid).toBe(true);
      expect(t.name(pear)).toMatch(/for sale/);
      if (pear.c.item) pear.c.item.noCharge = true;
      monsterDied(ctxOf(t.s), t.id, true);
      expect(apple.c.item?.unpaid).toBeUndefined();
      expect(pear.c.item?.noCharge).toBeUndefined();
      expect(t.name(pear)).toBe('apple');
      expect(uShops(t.s)).toEqual([]);
      expect(eshkOf(t.s, t.id)).toBeNull();
    });

    test('#chat: what he says, and the price quote of what she stands on', () => {
      const t = bare(15);
      heroAt(t, 4, 2);
      t.step({ type: 'wait' });
      const chat = () => t.lines(t.step({ type: 'mod', action: 'nh:chat', args: { dir: 'e' } }));
      const s = shkn(t);
      t.e.bill = [{ oid: 999, bquan: 2, price: 10, useup: true }];
      t.e.debit = 5;
      expect(chat()).toEqual([`${s} says that your bill comes to 25 zorkmids.`]);
      t.e.bill = [];
      expect(chat()).toEqual([
        expect.stringMatching(
          new RegExp(`^${s} reminds you that you owe (him|her) 5 zorkmids\\.$`),
        ),
      ]);
      t.e.debit = 0;
      t.e.credit = 7;
      expect(chat()).toEqual([`${s} encourages you to use your 7 zorkmids of credit.`]);
      t.e.credit = 0;
      t.e.robbed = 50;
      expect(chat()).toEqual([`${s} complains about a recent robbery.`]);
      if (t.shk.c.monster) t.shk.c.monster.peaceful = false;
      expect(chat()).toEqual([
        expect.stringMatching(
          new RegExp(`^${s} mentions how much (he|she) dislikes non-paying customers\\.$`),
        ),
      ]);
      if (t.shk.c.monster) t.shk.c.monster.peaceful = true;
      t.e.robbed = 0;
      // business: his gold
      expect(chat()).toEqual([
        cash(t, t.id) > 4000
          ? `${s} says that business is good.`
          : `${s} talks about the problem of shoplifters.`,
      ]);
      // standing on an apple of his: the quote instead (no direction asked)
      const apple = t.make('nh:apple', { at: { x: 4, y: 2 } });
      const q = t.step({ type: 'mod', action: 'nh:chat' });
      expect(q.prompt ?? null).toBeNull();
      expect(t.lines(q)[0]).toMatch(
        /^"An apple, price 7 zorkmids(\.|, a real bargain\.|, gourmets' delight!|, an excellent choice\.|, finest quality\.)"$/,
      );
      if (apple.c.item) apple.c.item.quantity = 2;
      t.make('nh:food_ration', { at: { x: 4, y: 2 } });
      const l = t.step({ type: 'mod', action: 'nh:chat' });
      const list = l.events.find((e) => e.type === 'list');
      expect(list && list.type === 'list' ? list.items.map((m) => render(m)) : []).toEqual([
        'a food ration, 45 zorkmids',
        '2 apples, 7 zorkmids each',
      ]);
    });
  });
});
