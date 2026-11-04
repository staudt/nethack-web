// Milestone 6b3 step 1: shopkeepers and stock. Every shop of a real Minetown gets one
// shopkeeper on the square inside its door, with his starting gold and a name from his shop
// type's list (Izchak in the lighting store), and the stock of its type on the other squares;
// he stays by his door while the hero waits, and the soak invariant checks it. Step 2: Izchak
// greets the hero at his door in every variant. Step 3: she buys from each shop of every
// variant: the price quote, the unpaid name, paying. Step 5: walking out of the lighting store or
// levelporting away with an unpaid candle is robbery (the alarm, the Watch, Izchak after her);
// paying him off sends him home and calms the Watch.
import {
  SHOPKEEPER,
  addToInventory,
  checkSpecialRoom,
  eshkOf,
  mkgold,
  insideShop,
  saleable,
  shopDoors,
  shopType,
  vanillaMod,
  type Eshk,
} from '@nh/content';
import {
  cellIndex,
  createEngine,
  getLevel,
  getPlayer,
  inRooms,
  inventoryOf,
  sortedIds,
  type Ctx,
  type DefId,
  type DungeonLayout,
  type GameEvent,
  type GameState,
  type Level,
  type Pos,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { checkInvariants } from '../src/index';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'sh-probe',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'sh-probe:run',
      labelKey: 'sh-probe',
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

function run(state: GameState, fn: (ctx: Ctx) => void): GameEvent[] {
  probe.fn = fn;
  return engine.step(state, { type: 'mod', action: 'sh-probe:run' }).events;
}
const mines = (state: GameState): DungeonLayout => {
  const d = state.dungeons.find((x) => x.id === 'nh:mines');
  if (!d) throw new Error('no Mines');
  return d;
};

/** A new game (seed) with its Minetown made and the hero on it. */
function minetown(seed: number): { state: GameState; level: Level } {
  const { state } = engine.newGame({ seed });
  const town = mines(state).special.find((s) => s.id === 'nh:minetown');
  if (!town) throw new Error(`seed ${seed}: no Minetown`);
  run(state, (ctx) => ctx.goToLevel({ dungeon: 'nh:mines', dlevel: town.dlevel }, 'up'));
  return { state, level: getLevel(state) };
}

/** The shopkeepers on a level and their tables. */
function shopkeepers(state: GameState, levelId: string): { id: number; e: Eshk }[] {
  return sortedIds(state).flatMap((id) => {
    const m = state.entities[String(id)];
    const e = eshkOf({ state }, id);
    return m?.c.pos?.level === levelId && e ? [{ id, e }] : [];
  });
}

const terrainAt = (level: Level, x: number, y: number): string =>
  level.palette[level.cells[cellIndex(level, x, y)] ?? -1] ?? '';
const isRoomFloor = (level: Level, x: number, y: number): boolean => {
  const id = level.palette[level.cells[cellIndex(level, x, y)] ?? -1];
  if (id === undefined) return false;
  const t = defs.terrain(id);
  return t.passable && t.door === undefined && t.id !== 'nh:corr';
};

const VARIANTS = [
  'nh:minetn-2',
  'nh:minetn-3',
  'nh:minetn-4',
  'nh:minetn-5',
  'nh:minetn-6',
  'nh:minetn-7',
];

// up to four seeds per variant
const bySeed = new Map<string, number[]>();
for (let seed = 1; seed <= 80; seed++) {
  const { level } = minetown(seed);
  const list = bySeed.get(level.def ?? '') ?? [];
  if (list.length < 4) list.push(seed);
  bySeed.set(level.def ?? '', list);
}

describe('the shops of a real Minetown', () => {
  test('every variant comes up', () => {
    expect([...bySeed.keys()].sort()).toEqual(VARIANTS);
  });

  test.each(VARIANTS)('%s: one shopkeeper by the door of each shop, stock on the rest', (v) => {
    const typesSeen = new Set<string>();
    for (const seed of bySeed.get(v) ?? []) {
      const { state, level } = minetown(seed);
      expect(checkInvariants(state, defs)).toEqual([]);
      const shks = shopkeepers(state, level.id);
      const shops = level.rooms.flatMap((r, i) => (shopType(r.type) ? [i] : []));
      expect(shops.length).toBeGreaterThan(0);
      // one per shop
      expect(shks.map((s) => s.e.shoproom).sort()).toEqual([...shops].sort());
      // names distinct on the level
      expect(new Set(shks.map((s) => s.e.shknam)).size).toBe(shks.length);
      for (const { id, e } of shks) {
        const room = level.rooms[e.shoproom];
        const shk = state.entities[String(id)];
        if (!room || !shk?.c.monster || !shk.c.pos) throw new Error('no shop or shopkeeper');
        typesSeen.add(room.type ?? '');
        expect(shk.def).toBe(SHOPKEEPER);
        expect(shk.c.monster.peaceful).toBe(true);
        expect(e).toMatchObject({ shoplevel: level.id, shoptype: room.type, bill: [] });
        // the first door of the shop's walls, him one step inside it
        const [door] = shopDoors(defs, level, e.shoproom);
        expect(e.shd).toEqual(door);
        expect(Math.max(Math.abs(e.shk.x - e.shd.x), Math.abs(e.shk.y - e.shd.y))).toBe(1);
        expect(insideShop(level, e.shk.x, e.shk.y)).toBe(e.shoproom);
        expect({ x: shk.c.pos.x, y: shk.c.pos.y }).toEqual(e.shk);
        // a real door: no doorway, no secret door
        expect(['nh:door_open_v', 'nh:door_open_h', 'nh:door_closed', 'nh:door_locked']).toContain(
          terrainAt(level, e.shd.x, e.shd.y),
        );
        // his starting capital, his key
        const inv = inventoryOf(state, id);
        const gold = inv.find((o) => o.def === 'nh:gold_piece')?.c.item?.quantity ?? 0;
        expect(gold).toBeGreaterThanOrEqual(1030);
        expect(gold).toBeLessThanOrEqual(4000);
        expect((gold - 1000) % 30).toBe(0);
        expect(inv.map((o) => o.def)).toContain('nh:skeleton_key');
        expect(inv.map((o) => o.def)).toContain('nh:wand_of_striking');
        // a name from his type's list; the town's lighting store is Izchak's
        const shp = shopType(room.type);
        if (room.type === 'nh:candle_shop') expect(e.shknam).toBe('+Izchak');
        else expect([...(shp?.names ?? []), '-Lucrezia', '+Dirk']).toContain(e.shknam);
        // stock: every floor square off the door's row holds something the shop sells (a
        // general store's random-class roll can come up empty: a gem class this port lacks)
        let squares = 0;
        let stocked = 0;
        for (let x = room.lx; x <= room.hx; x++)
          for (let y = room.ly; y <= room.hy; y++) {
            const doorRow =
              (x === room.lx && e.shd.x === x - 1) ||
              (x === room.hx && e.shd.x === x + 1) ||
              (y === room.ly && e.shd.y === y - 1) ||
              (y === room.hy && e.shd.y === y + 1);
            const here = sortedIds(state)
              .map((k) => state.entities[String(k)])
              .filter((o) => o?.c.item && o.c.pos?.level === level.id)
              .filter((o) => o?.c.pos?.x === x && o.c.pos.y === y);
            if (doorRow || !isRoomFloor(level, x, y)) {
              expect(here).toEqual([]);
              continue;
            }
            squares++;
            if (here.length > 0) stocked++;
            for (const o of here) if (o) expect(saleable({ defs }, e, o)).toBe(true);
          }
        expect(squares).toBeGreaterThan(0);
        if (room.type === 'nh:shop') expect(stocked * 2).toBeGreaterThanOrEqual(squares);
        else expect(stocked).toBe(squares);
      }
    }
    // the lighting store is in every variant
    expect(typesSeen).toContain('nh:candle_shop');
  });

  test('the lighting store sells candles and lamps', () => {
    const defsSeen = new Set<string>();
    for (const v of VARIANTS)
      for (const seed of bySeed.get(v) ?? []) {
        const { state, level } = minetown(seed);
        const room = level.rooms.findIndex((r) => r.type === 'nh:candle_shop');
        for (const id of sortedIds(state)) {
          const o = state.entities[String(id)];
          const p = o?.c.pos;
          if (o?.c.item && p?.level === level.id && insideShop(level, p.x, p.y) === room)
            defsSeen.add(o.def);
        }
      }
    for (const d of ['nh:tallow_candle', 'nh:wax_candle', 'nh:oil_lamp', 'nh:brass_lantern'])
      expect(defsSeen).toContain(d);
    // nothing that lighting stores do not stock
    for (const d of defsSeen)
      expect(
        shopType('nh:candle_shop')?.iprobs.some(
          (i) => typeof i.item === 'object' && i.item.def === d,
        ),
      ).toBe(true);
  });

  test('Alley Town has its wand and book shops when they come up', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 200 && seen.size < 2; seed++) {
      const { level } = minetown(seed);
      if (level.def !== 'nh:minetn-3' && level.def !== 'nh:minetn-4') continue;
      for (const r of level.rooms)
        if (r.type === 'nh:wand_shop' || r.type === 'nh:book_shop') seen.add(r.type);
    }
    expect([...seen].sort()).toEqual(['nh:book_shop', 'nh:wand_shop']);
  });

  test.each(VARIANTS)('%s: the shopkeepers stay in their shops while the hero waits', (v) => {
    const seed = bySeed.get(v)?.[0] ?? 1;
    const { state, level } = minetown(seed);
    const hero = getPlayer(state);
    if (hero.c.hp) hero.c.hp = { cur: 100000, max: 100000 };
    const shks = shopkeepers(state, level.id);
    for (let t = 0; t < 300 && !state.gameOver; t++) {
      engine.stepAll(state, { type: 'wait' });
      for (const { id, e } of shks) {
        const m = state.entities[String(id)];
        const p = m?.c.pos;
        if (!p || !m.c.monster?.peaceful) continue; // (hostile dwarves may kill or anger him)
        expect(inRooms(level, p.x, p.y)).toContain(e.shoproom);
      }
    }
    expect(checkInvariants(state, defs)).toEqual([]);
  });

  test('soak invariant: a peaceful shopkeeper stands in his shop', () => {
    const { state, level } = minetown(3);
    const [s] = shopkeepers(state, level.id);
    const shk = s && state.entities[String(s.id)];
    const sp = shk?.c.pos;
    if (!s || !shk?.c.monster || !sp) throw new Error('no shopkeeper');
    expect(checkInvariants(state, defs)).toEqual([]);
    const up = level.up;
    if (!up) throw new Error('no up stairs');
    const hp = getPlayer(state).c.pos;
    if (hp) Object.assign(hp, { x: sp.x, y: sp.y });
    Object.assign(sp, { x: up.x, y: up.y });
    expect(checkInvariants(state, defs).join('\n')).toMatch(/shopkeeper .* outside his shop/);
    s.e.following = true; // one who follows the hero may leave
    expect(checkInvariants(state, defs)).toEqual([]);
    s.e.following = false;
    shk.c.monster.peaceful = false; // and an angry one
    expect(checkInvariants(state, defs)).toEqual([]);
  });
});

describe('entering a real Minetown shop', () => {
  const DIRS: Record<string, 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'> = {
    '0,-1': 'n',
    '1,-1': 'ne',
    '1,0': 'e',
    '1,1': 'se',
    '0,1': 's',
    '-1,1': 'sw',
    '-1,0': 'w',
    '-1,-1': 'nw',
  };
  test.each(VARIANTS)('%s: Izchak welcomes her at his door, once', (v) => {
    const seed = bySeed.get(v)?.[0] ?? 1;
    const { state, level } = minetown(seed);
    const lighting = shopkeepers(state, level.id).find(
      (s) => level.rooms[s.e.shoproom]?.type === 'nh:candle_shop',
    );
    if (!lighting) throw new Error('no lighting store');
    // pin every monster (the keeper too) so nothing gets in the way
    for (const id of sortedIds(state)) {
      const m = state.entities[String(id)];
      if (m?.c.monster && m.c.actor && id !== state.playerId) {
        m.c.actor.speed = 0;
        m.c.actor.energy = 0;
      }
    }
    // the square outside the door, on the line from his spot through the door
    const { shk, shd } = lighting.e;
    const out = { x: 2 * shd.x - shk.x, y: 2 * shd.y - shk.y };
    const blocker = sortedIds(state).find((id) => {
      const p = state.entities[String(id)]?.c.pos;
      return id !== state.playerId && p?.level === level.id && p.x === out.x && p.y === out.y;
    });
    if (blocker !== undefined) delete state.entities[String(blocker)];
    // a closed shop door is opened first
    const open = shd.x !== shk.x ? 'nh:door_open_v' : 'nh:door_open_h';
    if (!terrainAt(level, shd.x, shd.y).startsWith('nh:door_open')) {
      let i = level.palette.indexOf(open as DefId);
      if (i === -1) i = level.palette.push(open as DefId) - 1;
      level.cells[cellIndex(level, shd.x, shd.y)] = i;
    }
    const hp = getPlayer(state).c.pos;
    if (!hp) throw new Error('no hero');
    Object.assign(hp, out);
    const dir = DIRS[`${shd.x - out.x},${shd.y - out.y}`];
    if (!dir) throw new Error('no direction');
    const r = engine.step(state, { type: 'move', dir });
    expect(hp).toMatchObject(shd);
    const greet = r.events.filter((e) => e.type === 'msg' && e.key?.startsWith('shk.'));
    expect(greet).toEqual([
      {
        type: 'msg',
        key: 'shk.welcome',
        params: {
          hello: '@shk.hello.valkyrie',
          name: '@role.valkyrie',
          shk: '=Izchak',
          shop: '@shop.name.lighting',
        },
      },
    ]);
    expect(lighting.e).toMatchObject({ customer: true, visitct: 1 });
    expect(checkInvariants(state, defs)).toEqual([]);
  });
});

describe('buying in a real Minetown shop', () => {
  test.each(VARIANTS)('%s: something from every shop, billed, then paid for', (v) => {
    const seed = bySeed.get(v)?.[0] ?? 1;
    const { state, level } = minetown(seed);
    for (const id of sortedIds(state)) {
      const m = state.entities[String(id)];
      if (m?.c.monster && m.c.actor && id !== state.playerId) {
        m.c.actor.speed = 0;
        m.c.actor.energy = 0;
      }
    }
    const hero = getPlayer(state);
    const hp = hero.c.pos;
    if (!hp) throw new Error('no hero');
    run(state, (ctx) => {
      addToInventory(
        ctx,
        state.playerId,
        mkgold(ctx, 100000, { level: level.id, x: hp.x, y: hp.y }),
      );
    });
    const shks = shopkeepers(state, level.id);
    expect(shks.length).toBeGreaterThan(0);
    for (const { id, e } of shks) {
      // a stocked square of his shop with one object on it, nobody there
      const here = sortedIds(state)
        .map((i) => state.entities[String(i)])
        .filter((o) => o?.c.item && o.c.pos?.level === level.id);
      const spot = here.find((o) => {
        const p = o?.c.pos;
        if (!p || insideShop(level, p.x, p.y) !== e.shoproom) return false;
        if (p.x === e.shk.x && p.y === e.shk.y) return false;
        const mons = sortedIds(state).some((i) => {
          const q = state.entities[String(i)]?.c.pos;
          return (
            i !== state.playerId &&
            state.entities[String(i)]?.c.monster &&
            q?.level === level.id &&
            q.x === p.x &&
            q.y === p.y
          );
        });
        return !mons && here.filter((x) => x?.c.pos?.x === p.x && x.c.pos.y === p.y).length === 1;
      });
      if (!spot?.c.pos) throw new Error(`${v}: nothing to buy in shop ${e.shoproom}`);
      Object.assign(hp, { x: spot.c.pos.x, y: spot.c.pos.y });
      run(state, (ctx) => checkSpecialRoom(ctx, false));
      const r = engine.step(state, { type: 'mod', action: 'nh:pickup' });
      const quote = r.events.find((ev) => ev.type === 'msg' && ev.key?.startsWith('shk.for_you'));
      expect(quote).toBeDefined();
      expect(spot.c.item?.unpaid).toBe(true);
      expect(e.bill).toHaveLength(1);
      const price = (e.bill[0]?.price ?? 0) * (e.bill[0]?.bquan ?? 0);
      const before = inventoryOf(state, id).reduce(
        (a, o) => a + (o.def === 'nh:gold_piece' ? (o.c.item?.quantity ?? 0) : 0),
        0,
      );
      const p = engine.step(state, { type: 'mod', action: 'nh:pay' });
      const keys = p.events.flatMap((ev) => (ev.type === 'msg' ? [ev.key] : []));
      // (an ordinary weapon, armor or scroll the shop deals in is named first: shk.bought_unknown)
      expect(keys).toHaveLength(2);
      expect(keys[0]).toMatch(/^shk\.bought/);
      expect(keys[1]).toBe('pay.thank_you');
      expect(e.bill).toEqual([]);
      expect(spot.c.item?.unpaid).toBeUndefined();
      const after = inventoryOf(state, id).reduce(
        (a, o) => a + (o.def === 'nh:gold_piece' ? (o.c.item?.quantity ?? 0) : 0),
        0,
      );
      expect(after - before).toBe(price);
    }
    expect(checkInvariants(state, defs)).toEqual([]);
  });
});

describe('robbing a real Minetown shop', () => {
  const DIRS: Record<string, 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'> = {
    '0,-1': 'n',
    '1,-1': 'ne',
    '1,0': 'e',
    '1,1': 'se',
    '0,1': 's',
    '-1,1': 'sw',
    '-1,0': 'w',
    '-1,-1': 'nw',
  };
  const msgKeys = (ev: GameEvent[]): string[] =>
    ev.flatMap((e) => (e.type === 'msg' ? [e.key] : []));
  const watch = (state: GameState, levelId: string) =>
    sortedIds(state)
      .map((id) => state.entities[String(id)])
      .filter((m) => m?.c.monster && m.c.pos?.level === levelId && m.def.startsWith('nh:watch'));
  const occupied = (state: GameState, levelId: string, p: Pos): boolean =>
    sortedIds(state).some((id) => {
      const q = state.entities[String(id)];
      return !q?.c.item && q?.c.pos?.level === levelId && q.c.pos.x === p.x && q.c.pos.y === p.y;
    });

  /** Minetown with every monster pinned, Izchak, the hero holding one of his candles. */
  function stolenCandle(v: string) {
    const seed = bySeed.get(v)?.[0] ?? 1;
    const { state, level } = minetown(seed);
    for (const id of sortedIds(state)) {
      const m = state.entities[String(id)];
      if (m?.c.monster && m.c.actor && id !== state.playerId) {
        m.c.actor.speed = 0;
        m.c.actor.energy = 0;
      }
    }
    const lighting = shopkeepers(state, level.id).find(
      (s) => level.rooms[s.e.shoproom]?.type === 'nh:candle_shop',
    );
    if (!lighting) throw new Error('no lighting store');
    const { e } = lighting;
    const shkMon = state.entities[String(lighting.id)];
    const hp = getPlayer(state).c.pos;
    if (!hp || !shkMon?.c.pos) throw new Error('no hero');
    const hero = getPlayer(state);
    if (hero.c.hp) hero.c.hp = { cur: 500, max: 500 };
    // one of his candles, at her feet on a square of his shop next to his spot
    const candle = sortedIds(state)
      .map((i) => state.entities[String(i)])
      .find((o) => {
        const p = o?.c.pos;
        return (
          o?.c.item?.carriedBy === null &&
          o.def !== 'nh:gold_piece' &&
          !!p &&
          insideShop(level, p.x, p.y) === e.shoproom
        );
      });
    if (!candle?.c.pos) throw new Error('no stock');
    const inside = [-1, 0, 1]
      .flatMap((dx) => [-1, 0, 1].map((dy) => ({ x: e.shk.x + dx, y: e.shk.y + dy })))
      .find(
        (p) =>
          insideShop(level, p.x, p.y) === e.shoproom &&
          !(p.x === e.shk.x && p.y === e.shk.y) &&
          !occupied(state, level.id, p) &&
          !sortedIds(state).some((i) => {
            const q = state.entities[String(i)];
            return (
              q?.c.item && q.c.pos?.level === level.id && q.c.pos.x === p.x && q.c.pos.y === p.y
            );
          }),
      );
    if (!inside) throw new Error('no square by his spot');
    Object.assign(candle.c.pos, inside);
    Object.assign(hp, inside);
    run(state, (ctx) => checkSpecialRoom(ctx, false));
    engine.step(state, { type: 'mod', action: 'nh:pickup' });
    expect(candle.c.item?.unpaid).toBe(true);
    const price = (e.bill[0]?.price ?? 0) * (e.bill[0]?.bquan ?? 0);
    return { state, level, e, shkMon, hp, candle, price };
  }

  /** Gives her `n` gold and pays the shopkeeper next to her. */
  function payOff(state: GameState, n: number): string[] {
    const hp = getPlayer(state).c.pos;
    if (!hp) throw new Error('no hero');
    run(state, (ctx) =>
      addToInventory(ctx, state.playerId, mkgold(ctx, n, { level: hp.level, x: hp.x, y: hp.y })),
    );
    return msgKeys(engine.step(state, { type: 'mod', action: 'nh:pay' }).events);
  }

  test.each(VARIANTS)('%s: out of the door with a candle, then paying Izchak off', (v) => {
    const { state, level, e, shkMon, hp, candle, price } = stolenCandle(v);
    const { shk, shd } = e;
    const out = { x: 2 * shd.x - shk.x, y: 2 * shd.y - shk.y };
    const blocker = sortedIds(state).find((id) => {
      const p = state.entities[String(id)]?.c.pos;
      return id !== state.playerId && p?.level === level.id && p.x === out.x && p.y === out.y;
    });
    if (blocker !== undefined) delete state.entities[String(blocker)];
    const from = { x: hp.x, y: hp.y };
    Object.assign(hp, shd);
    const warn = run(state, (ctx) => checkSpecialRoom(ctx, false, from));
    expect(msgKeys(warn)).toContain('shk.pay_before_leaving');
    const dir = DIRS[`${out.x - shd.x},${out.y - shd.y}`];
    if (!dir) throw new Error('no direction');
    const r = engine.step(state, { type: 'move', dir });
    expect(hp).toMatchObject(out);
    const keys = msgKeys(r.events);
    expect(keys.slice(0, 3)).toEqual(['shk.escaped', 'shk.stole', 'shk.alarm']);
    expect(keys).not.toContain('shk.no_one_responds');
    expect(e).toMatchObject({ robbed: price, following: true, bill: [] });
    expect(candle.c.item?.unpaid).toBeUndefined();
    expect(shkMon.c.monster?.peaceful).toBe(false);
    const guards = watch(state, level.id);
    expect(guards.length).toBeGreaterThan(0);
    for (const g of guards) expect(g?.c.monster?.peaceful).toBe(false);
    // he catches up with her outside: next to her, not in his shop
    const near = [-1, 0, 1]
      .flatMap((dx) => [-1, 0, 1].map((dy) => ({ x: out.x + dx, y: out.y + dy })))
      .find((p) => {
        if (inRooms(level, p.x, p.y).includes(e.shoproom) || occupied(state, level.id, p))
          return false;
        const id = level.palette[level.cells[cellIndex(level, p.x, p.y)] ?? -1];
        return id !== undefined && defs.terrain(id).passable && defs.terrain(id).door === undefined;
      });
    if (!near || !shkMon.c.pos) throw new Error('no room next to her');
    Object.assign(shkMon.c.pos, near);
    const paid = payOff(state, price);
    expect(paid.slice(0, 3)).toEqual(['pay.after_blood', 'pay.robbed_recently', 'pay.compensate']);
    expect(shkMon.c.monster?.peaceful).toBe(true);
    expect(shkMon.c.pos).toMatchObject({ level: level.id, ...shk });
    expect(e).toMatchObject({ robbed: 0, following: false });
    for (const g of guards) expect(g?.c.monster?.peaceful).toBe(true);
    expect(checkInvariants(state, defs)).toEqual([]);
  });

  test.each(VARIANTS)('%s: levelporting away while owing; he follows, is paid off there', (v) => {
    const { state, level, e, shkMon, price } = stolenCandle(v);
    const town = mines(state).special.find((s) => s.id === 'nh:minetown');
    if (!town) throw new Error('no Minetown');
    const ev = run(state, (ctx) =>
      ctx.goToLevel({ dungeon: 'nh:mines', dlevel: town.dlevel + 1 }, 'up'),
    );
    const keys = msgKeys(ev);
    expect(keys).toContain('shk.escaped');
    expect(keys).toContain('shk.alarm');
    for (const g of watch(state, level.id)) expect(g?.c.monster?.peaceful).toBe(false);
    // he was next to her: he came along
    const below = state.currentLevel;
    expect(below).not.toBe(level.id);
    expect(shkMon.c.pos?.level).toBe(below);
    expect(e).toMatchObject({ robbed: price, following: true });
    expect(shkMon.c.monster?.peaceful).toBe(false);
    expect(checkInvariants(state, defs)).toEqual([]);
    const paid = payOff(state, price);
    expect(paid).toContain('pay.compensate');
    expect(shkMon.c.pos).toMatchObject({ level: level.id, ...e.shk });
    expect(e.dismissKops).toBe(true);
    // back in town the Watch has calmed down
    run(state, (ctx) => ctx.goToLevel({ dungeon: 'nh:mines', dlevel: town.dlevel }, 'down'));
    expect(state.currentLevel).toBe(level.id);
    for (const g of watch(state, level.id)) expect(g?.c.monster?.peaceful).toBe(true);
    expect(e.dismissKops).toBeUndefined();
    expect(checkInvariants(state, defs)).toEqual([]);
  });
});
