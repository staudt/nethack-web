// m7e step 8: shop damage. add_damage() remembers what a shop's door, wall or floor was; the
// keeper wants paying for the hero's damage ("Minx!  You did 400 zorkmids worth of damage!"
// Pay?) or goes after her; he repairs it REPAIR_DELAY turns later as he moves (or silently when
// she comes back to his level), moving objects out of a rebuilt wall and taking traps away;
// digging in his shop gets a warning, and falling through his floor owing him costs her pack.
// The shopkeeper's random choices are searched over seeds; outcomes are asserted.
// ref: src/shk.c add_damage(), repair_damage(), shk_fixes_damage(), litter_scatter(),
// fix_shop_damage(), shopdig(), getcad(), pay_for_damage(); src/dokick.c dokick() door;
// src/dig.c zap_dig(), digactualhole(); src/zap.c zap_over_floor(), bhit(); src/mon.c shkgone()
import {
  createEngine,
  getPlayer,
  inventoryOf,
  itemsAt,
  trapAt,
  type Ctx,
  type DefId,
  type Entity,
  type GameEvent,
  type GameState,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { checkSpecialRoom, eshkOf, stockShops, vanillaMod } from '../src/index';
import { digactualhole, usePickAxe2, zapDig } from '../src/dig';
import { zapOverFloor } from '../src/buzz';
import { addtobill, shkgone } from '../src/shk';
import { fixShopDamage } from '../src/shkdamage';
import { payForDamage, shopdig } from '../src/shkpay';
import { mksobj } from '../src/items';
import { mdigTunnel } from '../src/mdig';
import {
  SHOP_DOOR_COST,
  SHOP_WALL_COST,
  addDamage,
  addShopDamage,
  damageList,
} from '../src/shopdamage';
import { T, setTerrain, terrainIdAt } from '../src/terrain';
import { TRAP, maketrap } from '../src/trap';
import { addMon, setup } from './helpers';
import { obj, render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'sd',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'sd:run',
      labelKey: 'sd',
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
function run(state: GameState, fn: (ctx: Ctx) => void): GameEvent[] {
  probe.fn = fn;
  return engine.step(state, { type: 'mod', action: 'sd:run' }).events;
}
const answer = (state: GameState, value: boolean): GameEvent[] =>
  engine.step(state, { type: 'answer', promptId: 'shk-damage', value }).events;

// A shop (interior 1..5 x 1..3) with a closed door in its east wall at 6,2 onto a corridor.
const MAP = ['-------   ', '|.....|   ', '|.....+...', '|.....|   ', '-------   '];
const DOOR = { x: 6, y: 2 };

/** The shop with its keeper (on his spot, 5,2), the hero at x,y, `gold` zorkmids on her. */
function shop(seed: number, at = { x: 7, y: 2 }, gold = 1000) {
  const s = setup(MAP, seed);
  s.level.rooms = [{ lx: 1, ly: 1, hx: 5, hy: 3, lit: true, type: 'nh:tool_shop' as DefId }];
  const ctx = ctxOf(s.state);
  stockShops(ctx, s.level);
  const shkId = Object.keys(s.state.entities)
    .map(Number)
    .find((id) => eshkOf(s, id) !== null);
  if (shkId === undefined) throw new Error('no shopkeeper');
  // the stock is in the way of these tests
  for (const o of Object.values(s.state.entities))
    if (o.c.item && o.c.item.carriedBy === null) delete s.state.entities[String(o.id)];
  const hp = getPlayer(s.state).c.pos;
  if (hp) Object.assign(hp, at);
  if (gold)
    mksobj(ctx, obj('nh:gold_piece'), { init: false, quantity: gold, carriedBy: s.state.playerId });
  run(s.state, (c) => checkSpecialRoom(c, false));
  return { ...s, shkId, shk: (): Entity => s.state.entities[String(shkId)] as Entity };
}
function ctxOf(state: GameState): Ctx {
  let out: Ctx | null = null;
  probe.fn = (c) => {
    out = c;
  };
  // a probe step costs no time
  engine.step(state, { type: 'mod', action: 'sd:run' });
  if (!out) throw new Error('no ctx');
  return out;
}
const gold = (state: GameState): number =>
  inventoryOf(state, state.playerId)
    .filter((o) => o.def === 'nh:gold_piece')
    .reduce((n, o) => n + (o.c.item?.quantity ?? 0), 0);
/** The hero breaks the shop door (as a kick does) and the keeper is asked about it. */
const breakDoor = (ctx: Ctx): void => {
  addDamage(ctx, DOOR.x, DOOR.y, SHOP_DOOR_COST);
  setTerrain(ctx.state.levels['dlvl1']!, DOOR.x, DOOR.y, T.doorway);
  payForDamage(ctx, 'break', false);
};

describe('add_damage()', () => {
  test('remembers the terrain, adds up costs, and counts only the real shop door', () => {
    const s = shop(1);
    run(s.state, (ctx) => {
      addDamage(ctx, 6, 1, 10);
      addDamage(ctx, 6, 1, 20);
      addShopDamage(ctx, 8, 2, 5); // the corridor: not part of a shop
    });
    expect(damageList(s, 'dlvl1')).toEqual([
      { x: 6, y: 1, when: s.state.turn, cost: 30, typ: T.vwall },
    ]);
    // a door that is not his shop door is not scheduled
    setTerrain(s.level, 6, 3, T.door_closed);
    run(s.state, (ctx) => addDamage(ctx, 6, 3, SHOP_DOOR_COST));
    expect(damageList(s, 'dlvl1').some((d) => d.y === 3)).toBe(false);
    run(s.state, (ctx) => addDamage(ctx, DOOR.x, DOOR.y, SHOP_DOOR_COST));
    expect(damageList(s, 'dlvl1')[0]).toMatchObject({ ...DOOR, typ: T.door_closed, cost: 400 });
  });
});

describe('pay_for_damage()', () => {
  /** A seed where the keeper asks (pay_for_damage()'s 1 in 50 refusal not taken). */
  function asked(): { s: ReturnType<typeof shop>; events: GameEvent[] } {
    for (let seed = 1; seed < 40; seed++) {
      const s = shop(seed);
      const events = run(s.state, breakDoor);
      if (s.state.pendingPrompt) return { s, events };
    }
    throw new Error('never asked');
  }

  test('"Minx!  You did 400 zorkmids worth of damage!"  Pay? -- yes: he takes it and goes home', () => {
    const { s, events } = asked();
    expect(s.state.pendingPrompt?.prompt.id).toBe('shk-damage');
    expect(
      render({ key: 'shk.damage.pay_q', params: s.state.pendingPrompt?.prompt.params ?? {} }),
    ).toBe('"Minx!  You did 400 zorkmids worth of damage!"  Pay?');
    // he came to the damage, his door
    expect(s.shk().c.pos).toMatchObject(DOOR);
    expect(texts(events)).toEqual([]);
    const out = texts(answer(s.state, true));
    expect(out[0]).toMatch(/^Mollified, \w+ accepts your restitution\.$/);
    expect(gold(s.state)).toBe(600);
    expect(s.shk().c.monster?.peaceful).toBe(true);
    expect(s.shk().c.pos).toMatchObject({ x: 5, y: 2 });
  });

  test('no: "Oh, yes!  You\'ll pay!" and he goes after her', () => {
    const { s } = asked();
    const out = texts(answer(s.state, false));
    expect(out).toContain('"Oh, yes!  You\'ll pay!"');
    expect(s.shk().c.monster?.peaceful).toBe(false);
    expect(eshkOf(s, s.shkId)?.following).toBe(true);
    expect(gold(s.state)).toBe(1000);
  });

  test('without the money: "How dare you break my door?"', () => {
    const s = shop(1, { x: 7, y: 2 }, 100);
    const out = texts(run(s.state, breakDoor));
    expect(out).toEqual(['"How dare you break my door?"']);
    expect(s.state.pendingPrompt).toBeNull();
    expect(s.shk().c.monster?.peaceful).toBe(false);
    expect(eshkOf(s, s.shkId)?.following).toBe(true);
  });

  test('from afar outside: "Izchak shouts:" "Who dared dig into my shop?"', () => {
    // she zaps digging west from the corridor's end through the door and into the shop's far wall
    const s = shop(1, { x: 9, y: 2 });
    const out = texts(
      run(s.state, (ctx) => {
        addDamage(ctx, 6, 1, SHOP_WALL_COST);
        setTerrain(s.level, 6, 1, T.doorway);
        payForDamage(ctx, 'dig into', false);
      }),
    );
    expect(out[0]).toMatch(/^\w+ shouts:$/);
    expect(out[1]).toBe('"Who dared dig into my shop?"');
  });

  test('an angry keeper just keeps after her; damage by nobody this turn costs nothing', () => {
    const s = shop(1);
    s.shk().c.monster!.peaceful = false;
    expect(texts(run(s.state, breakDoor))).toEqual([]);
    expect(eshkOf(s, s.shkId)?.following).toBe(true);
    const t = shop(1);
    run(t.state, (ctx) => addDamage(ctx, DOOR.x, DOOR.y, 0));
    run(t.state, (ctx) => payForDamage(ctx, 'break', false));
    expect(t.state.pendingPrompt).toBeNull();
    expect(t.shk().c.monster?.peaceful).toBe(true);
  });
});

describe('what damages a shop', () => {
  test('kicking his door open: SHOP_DOOR_COST, and he wants paying for "break"', () => {
    let broke = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const s = shop(seed);
      const h = getPlayer(s.state);
      h.c.attributes = { str: 18, int: 10, wis: 10, dex: 18, con: 18, cha: 10 };
      // keep kicking until it gives (or a trap... none: shop doors are not trapped here)
      for (let i = 0; i < 40 && terrainIdAt(s.level, DOOR.x, DOOR.y) === T.door_closed; i++) {
        engine.step(s.state, { type: 'mod', action: 'nh:kick' as DefId });
        const p = s.state.pendingPrompt?.prompt;
        if (p) engine.step(s.state, { type: 'answer', promptId: p.id, value: 'w' });
      }
      if (terrainIdAt(s.level, DOOR.x, DOOR.y) !== T.doorway) continue;
      broke++;
      // (C's typ is DOOR whatever its state: added after the door broke)
      expect(damageList(s, 'dlvl1')[0]).toMatchObject({ ...DOOR, cost: 400, typ: T.doorway });
      // asked (he came to the door), or 1 in 50 he goes after her
      const p = s.state.pendingPrompt;
      if (p) expect(p.prompt).toMatchObject({ id: 'shk-damage', params: { n: 400 } });
      else expect(s.shk().c.monster?.peaceful).toBe(false);
    }
    expect(broke).toBeGreaterThan(0);
  });

  test('digging down in his shop with a pick-axe: the warning and SHOP_PIT_COST', () => {
    const s = shop(1, { x: 3, y: 2 });
    const ctx = ctxOf(s.state);
    const pick = mksobj(ctx, obj('nh:pick_axe'), { init: false, carriedBy: s.state.playerId });
    const out = texts(
      run(s.state, (c) => {
        usePickAxe2(c, c.state.entities[String(pick)]!, 'down');
      }),
    );
    expect(out).toEqual(['You start digging downward.', '"Madam, do not damage the floor here!"']);
    expect(damageList(s, 'dlvl1')[0]).toMatchObject({ x: 3, y: 2, cost: 100, typ: T.floor });
  });

  test('a wand of digging through his wall from inside: SHOP_WALL_COST, "dig into"', () => {
    for (let seed = 1; seed <= 3; seed++) {
      const s = shop(seed, { x: 2, y: 2 });
      run(s.state, (ctx) => zapDig(ctx, 'n'));
      expect(terrainIdAt(s.level, 2, 0)).toBe(T.doorway);
      expect(damageList(s, 'dlvl1')).toEqual([
        { x: 2, y: 0, when: expect.any(Number), cost: 200, typ: T.hwall },
      ]);
      // inside, next to him or not: he is asked about it (or 1 in 50 he is not)
      const p = s.state.pendingPrompt;
      if (p) expect(p.prompt.params).toMatchObject({ n: 200 });
      else expect(s.shk().c.monster?.peaceful).toBe(false);
    }
  });

  test("a fire ray burning his door is hers to pay for; a monster's is free", () => {
    const s = shop(1);
    const flag = { damaged: false };
    run(s.state, (ctx) => zapOverFloor(ctx, 'fire', DOOR.x, DOOR.y, undefined, flag));
    expect(flag.damaged).toBe(true);
    expect(damageList(s, 'dlvl1')[0]).toMatchObject({ ...DOOR, cost: 400 });
    const t = shop(1);
    run(t.state, (ctx) => zapOverFloor(ctx, 'fire', DOOR.x, DOOR.y));
    expect(damageList(t, 'dlvl1')[0]).toMatchObject({ ...DOOR, cost: 0 });
  });

  test('a dwarf tunnelling through his wall leaves free damage', () => {
    const s = shop(1);
    const d = addMon(s.state, 'nh:dwarf', 6, 1);
    run(s.state, (ctx) => mdigTunnel(ctx, s.state.entities[String(d)]!));
    expect(terrainIdAt(s.level, 6, 1)).not.toBe(T.vwall);
    expect(damageList(s, 'dlvl1')).toEqual([
      { x: 6, y: 1, when: expect.any(Number), cost: 0, typ: T.vwall },
    ]);
  });

  test('a hole in his floor is scheduled for repair; a pit she digs costs SHOP_PIT_COST', () => {
    const s = shop(1, { x: 2, y: 2 });
    run(s.state, (ctx) => maketrap(ctx, 'dlvl1', 3, 1, TRAP.hole));
    run(s.state, (ctx) => digactualhole(ctx, 3, 3, true, 'pit'));
    expect(damageList(s, 'dlvl1')).toEqual([
      { x: 3, y: 3, when: expect.any(Number), cost: 100, typ: T.floor },
      { x: 3, y: 1, when: expect.any(Number), cost: 0, typ: T.floor },
    ]);
  });
});

describe('repairs', () => {
  /** The keeper paid off (peaceful, at home), the hero back out on the corridor. */
  function paidOff(from = 1): ReturnType<typeof shop> & { seed: number } {
    for (let seed = from; seed < from + 40; seed++) {
      const s = shop(seed);
      run(s.state, breakDoor);
      if (!s.state.pendingPrompt) continue;
      answer(s.state, true);
      Object.assign(getPlayer(s.state).c.pos!, { x: 8, y: 2 });
      return { ...s, seed };
    }
    throw new Error('never asked');
  }

  test('REPAIR_DELAY turns later: "Suddenly, the shop door reappears!" (closed)', () => {
    // searched: the first paid-off game where the keeper repairs it within BOLT_LIM / 2 of her
    // (from afar he "whispers something")
    let close = 0;
    for (let from = 1; from < 200 && !close;) {
      const s = paidOff(from);
      from = s.seed + 1;
      const when = damageList(s, 'dlvl1')[0]?.when ?? 0;
      const out: string[] = [];
      for (let i = 0; i < 20 && damageList(s, 'dlvl1').length; i++)
        out.push(...texts(engine.stepAll(s.state, { type: 'wait' }).events));
      expect(terrainIdAt(s.level, DOOR.x, DOOR.y)).toBe(T.door_closed);
      expect(damageList(s, 'dlvl1')).toEqual([]);
      expect(s.state.turn - when).toBeGreaterThanOrEqual(5);
      expect(out).toContain('Suddenly, the shop door reappears!');
      if (out.some((m) => /^\w+ whispers something\.$/.test(m))) continue;
      // seen: "Izchak whispers an incantation."; unseen but close: muttering
      expect(
        out.some((m) =>
          /^(\w+ whispers an incantation|You hear someone muttering an incantation)\.$/.test(m),
        ),
      ).toBe(true);
      close++;
    }
    expect(close).toBe(1);
  });

  test('a rebuilt wall pushes objects into the shop; boulders merge into it', () => {
    const s = shop(1, { x: 8, y: 2 });
    run(s.state, (ctx) => {
      addDamage(ctx, 6, 1, 0);
      setTerrain(s.level, 6, 1, T.doorway);
      mksobj(ctx, obj('nh:dagger'), { at: { level: 'dlvl1', x: 6, y: 1 } });
      mksobj(ctx, obj('nh:boulder'), { at: { level: 'dlvl1', x: 6, y: 1 } });
    });
    for (let i = 0; i < 20 && damageList(s, 'dlvl1').length; i++)
      engine.stepAll(s.state, { type: 'wait' });
    expect(terrainIdAt(s.level, 6, 1)).toBe(T.vwall);
    expect(itemsAt(engine.registry, s.state, 'dlvl1', 6, 1)).toEqual([]);
    const all = Object.values(s.state.entities).filter((e) => e.c.item && e.c.pos);
    expect(all.map((e) => e.def)).toEqual(['nh:dagger']);
    const p = all[0]?.c.pos;
    expect(p && p.x >= 1 && p.x <= 5 && p.y >= 1 && p.y <= 3).toBe(true);
  });

  test('a pit is filled in; a bear trap goes into his pack', () => {
    const s = shop(1, { x: 8, y: 2 });
    run(s.state, (ctx) => {
      const pit = maketrap(ctx, 'dlvl1', 3, 1, TRAP.pit);
      pit.seen = true;
      addDamage(ctx, 3, 1, 0);
      maketrap(ctx, 'dlvl1', 3, 3, TRAP.bear);
      addDamage(ctx, 3, 3, 0);
    });
    for (let i = 0; i < 30 && damageList(s, 'dlvl1').length; i++)
      engine.stepAll(s.state, { type: 'wait' });
    expect(trapAt(s.level, 3, 1)).toBeUndefined();
    expect(trapAt(s.level, 3, 3)).toBeUndefined();
    expect(inventoryOf(s.state, s.shkId).map((o) => o.def)).toContain('nh:beartrap');
  });

  test('back on his level, he catches up silently; a dead keeper repairs nothing', () => {
    const s = shop(1, { x: 8, y: 2 });
    run(s.state, (ctx) => {
      addDamage(ctx, 6, 1, 0);
      setTerrain(s.level, 6, 1, T.doorway);
    });
    s.state.turn += 10;
    const out = texts(run(s.state, (ctx) => fixShopDamage(ctx)));
    expect(out).toEqual([]);
    expect(terrainIdAt(s.level, 6, 1)).toBe(T.vwall);
    expect(damageList(s, 'dlvl1')).toEqual([]);

    const t = shop(1, { x: 8, y: 2 });
    run(t.state, (ctx) => {
      addDamage(ctx, 6, 1, 0);
      shkgone(ctx, t.shkId);
    });
    expect(damageList(t, 'dlvl1')).toEqual([]);
  });
});

describe('shopdig()', () => {
  test('digging down: "Madam, do not damage the floor here!" (in a pit: "Be careful, madam...")', () => {
    const s = shop(1, { x: 3, y: 2 });
    expect(texts(run(s.state, (ctx) => shopdig(ctx, false)))).toEqual([
      '"Madam, do not damage the floor here!"',
    ]);
  });

  test('falling through owing him: he grabs her backpack, worn things stay', () => {
    const s = shop(1, { x: 4, y: 2 });
    const ctx = ctxOf(s.state);
    const own = mksobj(ctx, obj('nh:dagger'), { carriedBy: s.state.playerId });
    const ware = mksobj(ctx, obj('nh:pick_axe'), { carriedBy: s.state.playerId });
    run(s.state, (c) => addtobill(c, c.state.entities[String(ware)]!, true, false, false));
    const worn = inventoryOf(s.state, s.state.playerId).find((o) => o.c.item?.equipped);
    const out = texts(run(s.state, (c) => shopdig(c, true)));
    expect(out).toEqual([expect.stringMatching(/^\w+ grabs your backpack!$/)]);
    const taken = inventoryOf(s.state, s.shkId).map((o) => o.id);
    expect(taken).toEqual(expect.arrayContaining([own, ware]));
    expect(eshkOf(s, s.shkId)?.bill).toEqual([]);
    if (worn) expect(worn.c.item?.carriedBy).toBe(s.state.playerId);
    // not owing him anything, he lets her go
    const t = shop(1, { x: 4, y: 2 });
    expect(texts(run(t.state, (c) => shopdig(c, true)))).toEqual([]);
  });
});
