// m18 step 6: Keystone Kops and cream pies. Robbing a shop sounds the alarm and brings Kops
// around her (stepped out of the door) or near the down stairs and the shopkeeper (left from
// inside), their numbers by depth, gone kinds skipped, paying off the keeper sends them away, a
// dead Kop may come back; their gear and arrest lines; cream pies thrown by a Kop and by her,
// applied to her own face, and #wipe. Outcomes over many seeds, monsters pinned.
// ref: src/shk.c call_kops(), makekops(), kops_gone(), make_happy_shoppers(); src/mon.c
// mondead(); src/makemon.c m_initweap(); src/sounds.c domonnoise(); src/apply.c
// use_cream_pie(); src/do.c dowipe(), wipeoff(); src/mthrowu.c m_throw(); src/uhitm.c
// hmon_hitmon_misc_obj()
import {
  getPlayer,
  sortedIds,
  type Ctx,
  type DefId,
  type Entity,
  type GameState,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { callKops, kopsGone, makekops, makemon, ucreamed } from '../src/index';
import { domonnoise } from '../src/chat';
import { thitmonst } from '../src/dothrow';
import { addToInventory, mksobj } from '../src/items';
import { mondead } from '../src/mondeath';
import { mblinded } from '../src/mstate';
import { mThrowOne } from '../src/mthrowu';
import { P, hasProp, timeoutLeft } from '../src/props';
import { eshkOf } from '../src/eshk';
import { makeHappyShoppers } from '../src/shk';
import { stockShops } from '../src/shknam';
import { checkSpecialRoom } from '../src/rooms';
import { setGenocided } from '../src/vanquished';
import { setHeroFemale } from '../src/gender';
import { addMon, setup } from './helpers';
import { ctxFor, defs, engine, obj, render } from './itemHelpers';
import { fullCtx, mon, room, type FullCtx } from './m9helpers';

const KOPS = ['nh:keystone_kop', 'nh:kop_sergeant', 'nh:kop_lieutenant', 'nh:kop_kaptain'];

const BIG = Array.from({ length: 15 }, (_, y) =>
  y === 7 ? '.........@.........' : '.'.repeat(19),
);

const kopsOn = (state: GameState): Entity[] =>
  sortedIds(state)
    .map((id) => state.entities[String(id)] as Entity)
    .filter((e) => e.c.monster && KOPS.includes(e.def));
const countOf = (state: GameState, id: string): number =>
  kopsOn(state).filter((e) => e.def === id).length;
const texts = (ctx: FullCtx): string[] =>
  ctx.events.flatMap((e) => (e.type === 'msg' ? [render(e)] : []));
const near = (e: Entity, p: { x: number; y: number }, r: number): boolean =>
  !!e.c.pos && Math.max(Math.abs(e.c.pos.x - p.x), Math.abs(e.c.pos.y - p.y)) <= r;

describe('makekops(): the swarm', () => {
  test('abs(depth) + rnd(5) Kops, a third plus one sergeants, a sixth lieutenants, a ninth kaptains', () => {
    for (const depth of [1, 5, 12]) {
      const seen = new Set<number>();
      for (let seed = 1; seed <= 12; seed++) {
        const r = room(seed, BIG);
        r.state.levels[r.state.currentLevel]!.depth = depth;
        makekops(r.ctx, { x: 9, y: 7 });
        const k = countOf(r.state, 'nh:keystone_kop');
        seen.add(k);
        expect(k).toBeGreaterThanOrEqual(depth + 1);
        expect(k).toBeLessThanOrEqual(depth + 5);
        expect(countOf(r.state, 'nh:kop_sergeant')).toBe(Math.trunc(k / 3) + 1);
        expect(countOf(r.state, 'nh:kop_lieutenant')).toBe(Math.trunc(k / 6));
        expect(countOf(r.state, 'nh:kop_kaptain')).toBe(Math.trunc(k / 9));
        // a swarm: each next to the one before, so all close to the spot
        for (const e of kopsOn(r.state)) expect(near(e, { x: 9, y: 7 }, 9)).toBe(true);
      }
      expect(seen.size).toBeGreaterThan(2);
    }
  });

  test('a genocided kind is skipped, the next kinds still come', () => {
    const r = room(3, BIG);
    r.state.levels[r.state.currentLevel]!.depth = 12;
    setGenocided(r.ctx, 'nh:kop_sergeant' as DefId);
    makekops(r.ctx, { x: 9, y: 7 });
    expect(countOf(r.state, 'nh:kop_sergeant')).toBe(0);
    expect(countOf(r.state, 'nh:kop_lieutenant')).toBeGreaterThan(0);
    expect(countOf(r.state, 'nh:kop_kaptain')).toBeGreaterThan(0);
  });
});

describe('call_kops(): the alarm', () => {
  const shkAt = (state: GameState, x: number, y: number): Entity =>
    state.entities[String(addMon(state, 'nh:shopkeeper', x, y))] as Entity;

  test('stepped out: "The Keystone Kops appear!" around her', () => {
    const r = room(1, BIG);
    const shk = shkAt(r.state, 1, 1);
    callKops(r.ctx, shk, true);
    expect(texts(r.ctx).slice(0, 2)).toEqual(['An alarm sounds!', 'The Keystone Kops appear!']);
    const kops = kopsOn(r.state);
    expect(kops.length).toBeGreaterThan(2);
    const hp = getPlayer(r.state).c.pos!;
    for (const e of kops) expect(near(e, hp, 6)).toBe(true);
  });

  test('left from inside: "The Keystone Kops are after you!" at the down stairs and the shopkeeper', () => {
    const r = room(2, BIG);
    r.state.levels[r.state.currentLevel]!.down = { x: 17, y: 13 };
    const shk = shkAt(r.state, 1, 1);
    callKops(r.ctx, shk, false);
    expect(texts(r.ctx).slice(0, 2)).toEqual([
      'An alarm sounds!',
      'The Keystone Kops are after you!',
    ]);
    const kops = kopsOn(r.state);
    expect(kops.some((e) => near(e, { x: 17, y: 13 }, 2))).toBe(true);
    expect(kops.some((e) => near(e, { x: 1, y: 1 }, 2))).toBe(true);
    for (const e of kops)
      expect(near(e, { x: 17, y: 13 }, 7) || near(e, { x: 1, y: 1 }, 7)).toBe(true);
  });

  test('every kind gone: "But no one seems to respond to it." without a Watch, silence with one', () => {
    const r = room(1, BIG);
    for (const id of KOPS) setGenocided(r.ctx, id as DefId);
    const shk = shkAt(r.state, 1, 1);
    callKops(r.ctx, shk, true);
    expect(texts(r.ctx)).toEqual(['An alarm sounds!', 'But no one seems to respond to it.']);
    expect(kopsOn(r.state)).toEqual([]);
    const w = room(1, BIG);
    for (const id of KOPS) setGenocided(w.ctx, id as DefId);
    addMon(w.state, 'nh:watchman', 15, 3, { peaceful: true });
    callKops(w.ctx, shkAt(w.state, 1, 1), true);
    expect(texts(w.ctx)[0]).toBe('An alarm sounds!');
    expect(texts(w.ctx)).not.toContain('But no one seems to respond to it.');
    expect(kopsOn(w.state)).toEqual([]);
  });
});

describe('the Kops leave and come back', () => {
  test('kops_gone(): "The Kops (disappointed) vanish into thin air." (or silently)', () => {
    const r = room(1, BIG);
    makekops(r.ctx, { x: 9, y: 7 });
    expect(kopsOn(r.state).length).toBeGreaterThan(2);
    makeHappyShoppers(r.ctx, false); // no angry shopkeeper
    expect(kopsOn(r.state)).toEqual([]);
    expect(texts(r.ctx)).toContain('The Kops (disappointed) vanish into thin air.');
    const one = room(1, BIG);
    mon(one.state, 'nh:kop_sergeant', 4, 4);
    kopsGone(one.ctx, false);
    expect(texts(one.ctx)).toEqual(['The Kop (disappointed) vanishes into thin air.']);
    const quiet = room(1, BIG);
    makekops(quiet.ctx, { x: 9, y: 7 });
    makeHappyShoppers(quiet.ctx, true);
    expect(kopsOn(quiet.state)).toEqual([]);
    expect(texts(quiet.ctx)).toEqual([]);
  });

  test('a dead Kop comes back 2 times in 5: near the down stairs or at random', () => {
    let back = 0;
    let atStairs = 0;
    const N = 200;
    for (let seed = 1; seed <= N; seed++) {
      const r = room(seed, BIG);
      r.state.levels[r.state.currentLevel]!.down = { x: 17, y: 13 };
      const k = mon(r.state, 'nh:keystone_kop', 4, 4);
      mondead(r.ctx, k.id);
      const kops = kopsOn(r.state);
      expect(kops.length).toBeLessThanOrEqual(1);
      if (kops.length) back++;
      if (kops.some((e) => e.c.pos?.x === 17 && e.c.pos.y === 13)) atStairs++;
    }
    expect(back / N).toBeGreaterThan(0.28);
    expect(back / N).toBeLessThan(0.52);
    expect(atStairs / N).toBeGreaterThan(0.1);
    expect(atStairs / N).toBeLessThan(0.32);
  });
});

describe('the Kops themselves', () => {
  test('gear: cream pies 1 time in 4 (3 or 4 of them), a club or rubber hose 1 time in 3', () => {
    let pies = 0;
    let sticks = 0;
    const N = 300;
    const r = room(1, BIG);
    for (let i = 0; i < N; i++) {
      for (const e of kopsOn(r.state)) delete r.state.entities[String(e.id)];
      const id = makemon(r.ctx, defs.monster('nh:keystone_kop' as DefId), { x: 9, y: 3 });
      expect(id).not.toBeNull();
      const inv = sortedIds(r.state)
        .map((x) => r.state.entities[String(x)] as Entity)
        .filter((o) => o.c.item?.carriedBy === id);
      const pie = inv.find((o) => o.def === 'nh:cream_pie');
      if (pie) {
        pies++;
        expect([3, 4]).toContain(pie.c.item?.quantity);
      }
      if (inv.some((o) => o.def === 'nh:club' || o.def === 'nh:rubber_hose')) sticks++;
      for (const o of inv) delete r.state.entities[String(o.id)];
    }
    expect(pies / N).toBeGreaterThan(0.17);
    expect(pies / N).toBeLessThan(0.33);
    expect(sticks / N).toBeGreaterThan(0.25);
    expect(sticks / N).toBeLessThan(0.42);
  });

  test('MS_ARREST: the arrest lines, "Just the facts, Ma\'am." when peaceful', () => {
    const lines = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const r = room(seed, BIG);
      const k = mon(r.state, 'nh:kop_sergeant', 3, 7);
      domonnoise(r.ctx, k.id);
      lines.add(texts(r.ctx)[0] ?? '');
    }
    expect([...lines].sort()).toEqual([
      '"Anything you say can be used against you."',
      '"Stop in the name of the Law!"',
      '"You\'re under arrest!"',
    ]);
    const p = room(1, BIG);
    const k = mon(p.state, 'nh:keystone_kop', 3, 7);
    k.c.monster!.peaceful = true;
    domonnoise(p.ctx, k.id);
    expect(texts(p.ctx)).toEqual(['"Just the facts, Ma\'am."']);
    setHeroFemale(p.state, false);
    domonnoise(p.ctx, k.id);
    expect(texts(p.ctx)[1]).toBe('"Just the facts, Sir."');
  });
});

describe('cream pies', () => {
  /** A Kop at (x, y) holding a pie, thrown at the hero (at 9,7) from the west. */
  const kopThrows = (seed: number) => {
    const r = room(seed, BIG);
    const k = mon(r.state, 'nh:keystone_kop', 6, 7);
    const pie = mksobj(r.ctx, obj('nh:cream_pie'), { init: false, quantity: 1 });
    addToInventory(r.ctx, k.id, pie);
    mThrowOne(r.ctx, k.id, 1, 0, 8, pie);
    return r;
  };

  test('a Kop\'s pie: "Yecch!  You\'ve been creamed.", blind with goop; the pie is gone', () => {
    let hit = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const r = kopThrows(seed);
      const t = texts(r.ctx);
      const pies = sortedIds(r.state).filter(
        (id) => r.state.entities[String(id)]?.def === 'nh:cream_pie',
      );
      expect(pies).toEqual([]); // a pie always breaks
      if (!t.includes("Yecch!  You've been creamed.")) continue;
      hit++;
      const hero = getPlayer(r.state);
      expect(hasProp(hero, P.BLINDED)).toBe(true);
      const goop = ucreamed(r.state);
      expect(goop).toBeGreaterThan(0);
      expect(goop).toBeLessThanOrEqual(25);
      expect(timeoutLeft(r.state, hero, P.BLINDED)).toBe(goop);
    }
    expect(hit).toBeGreaterThan(5);
  });

  test('#wipe is offered while creamed and wipes 4 turns of goop a turn', () => {
    let seed = 1;
    let r = kopThrows(seed);
    while (ucreamed(r.state) < 9) r = kopThrows(++seed);
    for (const e of kopsOn(r.state)) delete r.state.entities[String(e.id)];
    const offers = engine.query(r.state).actionsFor({ kind: 'self' });
    expect(offers.some((o) => o.action.type === 'mod' && o.action.action === 'nh:wipe')).toBe(true);
    const goop = ucreamed(r.state);
    const turn0 = r.state.turn;
    // stepAll() runs the occupation to its end
    const res: StepResult = r.step({ type: 'mod', action: 'nh:wipe' });
    const lines = res.events.flatMap((e) => (e.type === 'msg' ? [render(e)] : []));
    expect(lines).toContain("You've got the glop off.");
    expect(ucreamed(r.state)).toBe(0);
    expect(hasProp(getPlayer(r.state), P.BLINDED)).toBe(false);
    // dowipe() takes a turn, then 4 turns of goop come off each turn (it also counts down)
    expect(r.state.turn - turn0).toBeGreaterThan(1);
    expect(r.state.turn - turn0).toBeLessThanOrEqual(Math.ceil(goop / 4) + 1);
    expect(
      engine
        .query(r.state)
        .actionsFor({ kind: 'self' })
        .some((o) => o.action.type === 'mod' && o.action.action === 'nh:wipe'),
    ).toBe(false);
    // a clean face
    const c = room(1, BIG);
    const r2 = c.step({ type: 'mod', action: 'nh:wipe' });
    expect(r2.events.flatMap((e) => (e.type === 'msg' ? [render(e)] : []))).toEqual([
      'Your face is already clean.',
    ]);
  });

  test('applying a pie: "You immerse your face in the cream pie." and goop; a blindfold keeps it off her eyes', () => {
    const r = room(1, BIG);
    const pie = mksobj(r.ctx, obj('nh:cream_pie'), { init: false, quantity: 2 });
    addToInventory(r.ctx, r.state.playerId, pie);
    const res = r.step({ type: 'mod', action: 'nh:apply', args: { item: pie } });
    const t = res.events.flatMap((e) => (e.type === 'msg' ? [render(e)] : []));
    // ("You immerse your face in one of the cream pies.": the test renderer has no plurals)
    expect(res.events.find((e) => e.type === 'msg')).toMatchObject({ key: 'pie.immerse_one' });
    expect(t).toContain("You can't see through all the sticky goop on your face.");
    expect(ucreamed(r.state)).toBeGreaterThan(0);
    expect(r.state.entities[String(pie)]?.c.item?.quantity).toBe(1);
    // blindfolded: no goop in the eyes
    const b = room(1, BIG);
    const bf = mksobj(b.ctx, obj('nh:blindfold'), { init: false, quantity: 1 });
    addToInventory(b.ctx, b.state.playerId, bf);
    b.step({ type: 'mod', action: 'nh:apply', args: { item: bf } });
    const p2 = mksobj(b.ctx, obj('nh:cream_pie'), { init: false, quantity: 1 });
    addToInventory(b.ctx, b.state.playerId, p2);
    const r2 = b.step({ type: 'mod', action: 'nh:apply', args: { item: p2 } });
    expect(r2.events.flatMap((e) => (e.type === 'msg' ? [render(e)] : []))).toEqual([
      'You immerse your face in the cream pie.',
    ]);
    expect(ucreamed(b.state)).toBe(0);
    expect(b.state.entities[String(p2)]).toBeUndefined();
  });

  test('her pie at a monster: "The cream pie splashes over the jackal\'s face!" and it is blinded', () => {
    let hits = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const r = room(seed, BIG);
      const j = mon(r.state, 'nh:jackal', 10, 7);
      j.c.monster!.asleep = true;
      const pie = mksobj(r.ctx, obj('nh:cream_pie'), { init: false, quantity: 1 });
      const used = thitmonst(r.ctx as unknown as Ctx, j.id, pie, { i: 1, n: 1 });
      if (!used) continue;
      hits++;
      expect(texts(r.ctx)).toEqual(["The cream pie splashes over the jackal's face!"]);
      expect(mblinded(r.ctx, j.id)).toBeGreaterThanOrEqual(21);
      expect(j.c.monster?.asleep).toBe(false);
      expect(r.state.entities[String(pie)]).toBeUndefined();
    }
    expect(hits).toBeGreaterThan(5);
  });
});

describe('robbery brings the Kops (the shop)', () => {
  // A shop (interior 1..5 x 1..3) with a doorway at 6,2, open floor to the east.
  const MAP = [
    '-------...........',
    '|.....|...........',
    '|.....o...........',
    '|.....|...........',
    '-------...........',
  ];

  test('walking out of the door with an unpaid apple: the alarm and Kops around her', () => {
    const s = setup(MAP, 1);
    s.level.rooms = [{ lx: 1, ly: 1, hx: 5, hy: 3, lit: true, type: 'nh:shop' as DefId }];
    const ctx = ctxFor(s.state) as unknown as Ctx;
    stockShops(ctx, s.level);
    for (const id of sortedIds(s.state)) {
      const o = s.state.entities[String(id)];
      if (o?.c.item && o.c.pos) delete s.state.entities[String(id)];
    }
    const shk = sortedIds(s.state)
      .map((id) => s.state.entities[String(id)] as Entity)
      .find((e) => eshkOf(s, e.id) !== null)!;
    shk.c.actor!.speed = 0;
    Object.assign(shk.c.pos!, { x: 1, y: 1 });
    const hero = getPlayer(s.state);
    Object.assign(hero.c.pos!, { x: 4, y: 2 });
    checkSpecialRoom(fullCtx(s.state), false);
    mksobj(ctx, obj('nh:apple'), { init: false, at: { level: 'dlvl1', x: 4, y: 2 } });
    const step = (a: Parameters<typeof s.engine.step>[1]) => s.engine.step(s.state, a);
    step({ type: 'mod', action: 'nh:pickup' });
    step({ type: 'move', dir: 'e' });
    step({ type: 'move', dir: 'e' }); // the door: "Please pay before leaving."
    const r = step({ type: 'move', dir: 'e' });
    const t = r.events.flatMap((e) => (e.type === 'msg' ? [render(e)] : []));
    expect(t).toContain('An alarm sounds!');
    expect(t).toContain('The Keystone Kops appear!');
    const kops = kopsOn(s.state);
    expect(kops.length).toBeGreaterThan(2);
    for (const e of kops) expect(near(e, { x: 7, y: 2 }, 7)).toBe(true);
  });
});
