// m11 step 6: the twelve new potions and the attribute peaks (AMAX) they restore. Every effect is
// checked by BUC with outcomes over several seeds or forced states, never on a lucky seed.
import {
  getPlayer,
  inventoryOf,
  type Buc,
  type Ctx,
  type DefId,
  type EntityId,
  type GameState,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import {
  abase,
  adjattrib,
  amax,
  rawAttr,
  setAbase,
  setAmax,
  setRawAttr,
  type Attr,
} from '../src/attrib';
import { hungerData } from '../src/uhunger';
import { losexp } from '../src/exper';
import { pluslvl, ulevelmax, newuexp } from '../src/hero';
import { mksobj } from '../src/items';
import { polymon, rehumanize } from '../src/polyself';
import { inTrouble } from '../src/pray';
import { P, hasIntrinsic, hasProp, setItimeout, timeoutLeft } from '../src/props';
import { isStoned, makeStoned } from '../src/stonestate';
import { levAtWill, levAtWillFlag, levitating } from '../src/trapstate';
import { pwOf, setPw } from '../src/uenergy';
import { T } from '../src/terrain';
import { addMon } from './helpers';
import { engine, itemOf, obj, plainKit, render } from './itemHelpers';
import { mapSetup } from './maps';

type M = ReturnType<typeof mapSetup>;

const texts = (r: StepResult): string[] =>
  r.events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );
const hero = (s: GameState) => getPlayer(s);
const ROOM = ['-------', '|.....|', '|..@..|', '|.....|', '-------'];
/** Big enough for another level to be made at its size. */
const BIG = ['..........', '..@.......', ...Array.from({ length: 10 }, () => '..........')];

/** A lit room, plain kit, 500 HP. */
function make(rows: string[] = ROOM, seed = 1): M {
  const m = mapSetup(rows, { seed });
  plainKit(m.state);
  hero(m.state).c.hp = { cur: 500, max: 500 };
  return m;
}
const mod = (m: M, action: string, args?: Record<string, unknown>): StepResult =>
  m.step({ type: 'mod', action: action as DefId, ...(args ? { args: args as never } : {}) });
function potion(m: M, name: string, buc: Buc): EntityId {
  const id = mksobj(m.ctx, obj(`nh:potion_of_${name}`), {
    init: false,
    carriedBy: m.state.playerId,
  });
  itemOf(m.state, id).buc = buc;
  return id;
}
const quaff = (m: M, name: string, buc: Buc): string[] =>
  texts(mod(m, 'nh:quaff', { item: potion(m, name, buc) }));
const wait = (m: M): string[] => texts(m.step({ type: 'wait' }));
const hasPotion = (m: M, name: string): boolean =>
  inventoryOf(m.state, m.state.playerId).some((o) => o.def === `nh:potion_of_${name}`);
const known = (m: M, name: string): boolean =>
  m.state.discovered.includes(`nh:potion_of_${name}` as DefId);
/** ABASE and AMAX both at `v` (setAbase alone keeps a higher peak). */
function setAttr(m: M, k: Attr, v: number): void {
  setAbase(m.ctx, k, v);
  setAmax(m.ctx, k, v);
}
const level = (m: M): number => hero(m.state).c.experience!.level;
const seeds = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);

describe('attribute peaks (AMAX)', () => {
  test('a drop keeps the peak; a raise past it lifts it; nothing is recorded otherwise', () => {
    const m = make();
    const str = abase(m.state, 'str');
    expect(m.state.modData['nh']).not.toHaveProperty('amax');
    adjattrib(m.ctx, 'str', -2, false);
    expect(abase(m.state, 'str')).toBe(str - 2);
    expect(amax(m.state, 'str')).toBe(str);
    adjattrib(m.ctx, 'str', 3, false);
    expect(abase(m.state, 'str')).toBe(str + 1);
    expect(amax(m.state, 'str')).toBe(str + 1);
    expect(m.state.modData['nh']).not.toHaveProperty('amax');
  });

  test('a drop below the minimum lowers the peak by part of the excess', () => {
    const lowered = new Set<number>();
    for (const seed of seeds(20)) {
      const m = make(ROOM, seed);
      setAttr(m, 'dex', 4);
      adjattrib(m.ctx, 'dex', -1, false); // 4 -> 3 with a peak at the old value
      const peak = amax(m.state, 'dex');
      adjattrib(m.ctx, 'dex', -4, false); // 3 - 4: four below the minimum
      expect(abase(m.state, 'dex')).toBe(3);
      expect(amax(m.state, 'dex')).toBeLessThanOrEqual(peak);
      expect(amax(m.state, 'dex')).toBeGreaterThanOrEqual(3);
      lowered.add(peak - amax(m.state, 'dex'));
    }
    expect(lowered.size).toBeGreaterThan(1); // rn2(excess + 1)
  });

  test('Weak hunger is not a lost attribute; a polymorphed form keeps her own peaks apart', () => {
    const m = make();
    // Weak takes a point of Str as ATTEMP: ABASE and AMAX stay
    const str = abase(m.state, 'str');
    setRawAttr(m.ctx, 'str', rawAttr(m.state, 'str') - 1);
    hungerData(m.ctx).strLoss = 1;
    expect([abase(m.state, 'str'), amax(m.state, 'str')]).toEqual([str, str]);
    adjattrib(m.ctx, 'con', -2, false);
    const con = amax(m.state, 'con');
    const ctx = { ...m.ctx, interrupt: () => undefined } as unknown as Ctx;
    polymon(ctx, 'nh:jackal' as DefId, false);
    expect(amax(m.state, 'con')).toBe(con); // C copies u.amax to u.mamax and keeps it
    rehumanize(ctx);
    expect(amax(m.state, 'con')).toBe(con);
    expect(abase(m.state, 'con')).toBe(con - 2);
  });
});

describe('restore ability', () => {
  test('uncursed restores one lost attribute; blessed all; cursed none', () => {
    for (const [buc, restored] of [
      ['uncursed', 1],
      ['blessed', 2],
      ['cursed', 0],
    ] as const) {
      const m = make();
      const str = abase(m.state, 'str');
      const con = abase(m.state, 'con');
      adjattrib(m.ctx, 'str', -3, false);
      adjattrib(m.ctx, 'con', -2, false);
      const out = quaff(m, 'restore_ability', buc);
      const back = Number(abase(m.state, 'str') === str) + Number(abase(m.state, 'con') === con);
      expect(back).toBe(restored);
      expect(out[0]).toBe(
        buc === 'cursed'
          ? 'Ulch!  This makes you feel mediocre!'
          : buc === 'blessed'
            ? 'Wow!  This makes you feel great!'
            : 'Wow!  This makes you feel good!',
      );
      expect(known(m, 'restore_ability')).toBe(false); // potion_unkn
    }
  });

  test('it overrides sustain ability and brings back lost levels (all when blessed)', () => {
    for (const [buc, back] of [
      ['uncursed', 1],
      ['blessed', 3],
    ] as const) {
      const m = make();
      const h = hero(m.state);
      while (level(m) < 5) pluslvl(m.ctx as unknown as Ctx, h.id, false);
      for (let i = 0; i < 3; i++) losexp(m.ctx as unknown as Ctx, '@killer.life_drainage');
      expect(level(m)).toBe(2);
      quaff(m, 'restore_ability', buc);
      expect(level(m)).toBe(2 + back);
      expect(ulevelmax(m.ctx, level(m))).toBe(5);
    }
  });

  test('a poisoning is restored; "better" when blessed with a trouble left', () => {
    const m = make();
    const str = abase(m.state, 'str');
    adjattrib(m.ctx, 'str', -3, false);
    expect(inTrouble(m.ctx as unknown as Ctx)).toBe(-6); // TROUBLE_POISONED
    setItimeout(m.state, hero(m.state), P.CONFUSION, 50);
    expect(quaff(m, 'restore_ability', 'blessed')[0]).toBe('Wow!  This makes you feel better!');
    expect(abase(m.state, 'str')).toBe(str);
  });
});

describe('gain ability', () => {
  test('blessed raises every attribute; uncursed one; cursed none', () => {
    for (const buc of ['blessed', 'uncursed', 'cursed'] as const) {
      const m = make();
      const before = (['str', 'int', 'wis', 'dex', 'con', 'cha'] as const).map((k) => {
        setAttr(m, k, 10);
        return abase(m.state, k);
      });
      const out = quaff(m, 'gain_ability', buc);
      const ups = (['str', 'int', 'wis', 'dex', 'con', 'cha'] as const).filter(
        (k, i) => abase(m.state, k) === before[i]! + 1,
      ).length;
      expect(ups).toBe(buc === 'blessed' ? 6 : buc === 'uncursed' ? 1 : 0);
      if (buc === 'cursed') expect(out).toEqual(['Ulch!  That potion tasted foul!']);
    }
  });

  test('at the maximum the last try says so', () => {
    const m = make();
    setAttr(m, 'str', 118);
    for (const k of ['int', 'wis', 'dex', 'con', 'cha'] as const) setAttr(m, k, 18);
    const out = quaff(m, 'gain_ability', 'uncursed');
    expect(out.some((l) => /^You're already as \w+ as you can get\.$/.test(l))).toBe(true);
  });
});

describe('gain level', () => {
  test('uncursed: one level; blessed: points within the new level', () => {
    for (const seed of seeds(5)) {
      const m = make(ROOM, seed);
      quaff(m, 'gain_level', 'uncursed');
      expect(level(m)).toBe(2);
      expect(hero(m.state).c.experience!.points).toBe(newuexp(1));
      const b = make(ROOM, seed);
      quaff(b, 'gain_level', 'blessed');
      expect(level(b)).toBe(2);
      const pts = hero(b.state).c.experience!.points;
      expect(pts).toBeGreaterThanOrEqual(newuexp(1));
      expect(pts).toBeLessThan(newuexp(2));
    }
  });

  test('cursed on the first level: "You have an uneasy feeling."', () => {
    const m = make();
    expect(quaff(m, 'gain_level', 'cursed')).toEqual(['You have an uneasy feeling.']);
    expect(level(m)).toBe(1);
  });

  test('cursed on level 2: she rises through the ceiling to level 1', () => {
    const m = make(BIG);
    // make this level 2 of the main dungeon
    const lvl = m.state.levels['dlvl1']!;
    delete m.state.levels['dlvl1'];
    Object.assign(lvl, { id: 'dlvl2', dlevel: 2, depth: 2 });
    m.state.levels['dlvl2'] = lvl;
    m.state.memory['dlvl2'] = m.state.memory['dlvl1']!;
    delete m.state.memory['dlvl1'];
    m.state.currentLevel = 'dlvl2';
    hero(m.state).c.pos!.level = 'dlvl2';
    const out = quaff(m, 'gain_level', 'cursed');
    expect(out).toContain('You rise up, through the ceiling!');
    expect(hero(m.state).c.pos!.level).toBe('dlvl1');
    expect(level(m)).toBe(1);
  });
});

describe('gain energy', () => {
  test('d(3/2/1, 6) to the maximum (taken away when cursed), three times that to the current', () => {
    for (const [buc, lo, hi] of [
      ['blessed', 3, 18],
      ['uncursed', 2, 12],
      ['cursed', -6, -1],
    ] as const) {
      for (const seed of seeds(8)) {
        const m = make(ROOM, seed);
        setPw(m.ctx, { uen: 10, uenmax: 100, uenpeak: 100 });
        const out = quaff(m, 'gain_energy', buc);
        const d = pwOf(m.state).uenmax - 100;
        expect(d).toBeGreaterThanOrEqual(lo);
        expect(d).toBeLessThanOrEqual(hi);
        expect(pwOf(m.state).uen).toBe(Math.max(0, Math.min(10 + 3 * d, 100 + d)));
        expect(out[0]).toBe(
          buc === 'cursed' ? 'You feel lackluster.' : 'Magical energies course through your body.',
        );
      }
    }
  });
});

describe('speed', () => {
  test('very fast for a while, and intrinsically fast unless cursed', () => {
    for (const buc of ['uncursed', 'cursed'] as const) {
      const m = make();
      const out = quaff(m, 'speed', buc);
      const h = hero(m.state);
      expect(out[0]).toBe('You are suddenly moving much faster.');
      expect(timeoutLeft(m.state, h, P.FAST)).toBeGreaterThan(30);
      expect(hasIntrinsic(h, P.FAST)).toBe(buc !== 'cursed');
      expect(out.includes('Your quickness feels very natural.')).toBe(buc !== 'cursed');
    }
  });

  test('it heals wounded legs instead', () => {
    const m = make();
    const h = hero(m.state);
    setItimeout(m.state, h, P.WOUNDED_LEGS, 30);
    expect(quaff(m, 'speed', 'uncursed')).toEqual(['Your leg feels better.']);
    expect(hasProp(h, P.WOUNDED_LEGS)).toBe(false);
    expect(timeoutLeft(m.state, h, P.FAST)).toBe(0);
  });
});

describe('paralysis, sickness, fruit juice, acid', () => {
  test('paralysis freezes her for rn1(10, 25 - 12 * bcsign) turns; free action stiffens', () => {
    const m = make();
    const turn = m.state.turn;
    expect(quaff(m, 'paralysis', 'uncursed')).toContain('Your feet are frozen to the floor!');
    expect(m.state.turn - turn).toBeGreaterThanOrEqual(25);
    expect(m.state.turn - turn).toBeLessThanOrEqual(35);
    const f = make();
    hero(f.state).c.props = {
      ...hero(f.state).c.props,
      [P.FREE_ACTION]: { intrinsic: true, timeout: 0 },
    };
    expect(quaff(f, 'paralysis', 'uncursed')).toEqual(['You stiffen momentarily.']);
  });

  test('sickness: blessed is stale juice; uncursed poisons an attribute, which keeps its peak', () => {
    const b = make();
    expect(quaff(b, 'sickness', 'blessed')).toEqual([
      'Yecch!  This stuff tastes like poison.',
      '(But in fact it was mildly stale fruit juice.)',
    ]);
    expect(hero(b.state).c.hp!.cur).toBe(499);
    let dropped = 0;
    for (const seed of seeds(10)) {
      const m = make(ROOM, seed);
      for (const k of ['str', 'int', 'wis', 'dex', 'con', 'cha'] as const) setAttr(m, k, 15);
      quaff(m, 'sickness', 'uncursed');
      expect(hero(m.state).c.hp!.cur).toBeLessThan(500);
      const lost = (['str', 'int', 'wis', 'dex', 'con', 'cha'] as const).filter(
        (k) => abase(m.state, k) < 15,
      );
      expect(lost.length).toBe(1);
      expect(amax(m.state, lost[0]!)).toBe(15);
      if (lost.length) dropped++;
      quaff(m, 'restore_ability', 'uncursed');
      expect(abase(m.state, lost[0]!)).toBe(15);
    }
    expect(dropped).toBe(10);
  });

  test('fruit juice feeds her and is not identified by drinking', () => {
    const m = make();
    const h = hero(m.state).c.hunger!;
    h.nutrition = 500;
    expect(quaff(m, 'fruit_juice', 'uncursed')).toEqual(['This tastes like fruit juice.']);
    expect(h.nutrition).toBeGreaterThanOrEqual(519); // 20, less a turn's hunger
    expect(known(m, 'fruit_juice')).toBe(false);
  });

  test('acid burns (not when acid resistant) and cures stoning', () => {
    const m = make();
    makeStoned(m.ctx, 5, null, '@killer.potion.acid');
    const out = quaff(m, 'acid', 'cursed');
    expect(out).toContain('This burns a lot!');
    expect(out).toContain('You feel limber!');
    expect(isStoned(m.state)).toBe(false);
    expect(hero(m.state).c.hp!.cur).toBeLessThan(500);
    const r = make();
    hero(r.state).c.props = {
      ...hero(r.state).c.props,
      [P.ACID_RES]: { intrinsic: true, timeout: 0 },
    };
    expect(quaff(r, 'acid', 'uncursed')).toEqual(['This tastes sour.']);
    expect(hero(r.state).c.hp!.cur).toBeGreaterThanOrEqual(500);
  });
});

describe('enlightenment and monster detection', () => {
  test('enlightenment: cursed is an uneasy feeling; blessed raises Int and Wis first', () => {
    const c = make();
    expect(quaff(c, 'enlightenment', 'cursed')).toEqual(['You have an uneasy feeling...']);
    const m = make();
    setAttr(m, 'int', 10);
    setAttr(m, 'wis', 10);
    const r = mod(m, 'nh:quaff', { item: potion(m, 'enlightenment', 'blessed') });
    expect(texts(r)).toContain('You feel self-knowledgeable...');
    expect(r.events.some((e) => e.type === 'list')).toBe(true);
    expect([abase(m.state, 'int'), abase(m.state, 'wis')]).toEqual([11, 11]);
  });

  test('monster detection shows the monsters; a cursed one wakes them', () => {
    const m = make();
    const id = addMon(m.state, 'nh:jackal', 1, 1, { asleep: true });
    const out = quaff(m, 'monster_detection', 'cursed');
    expect(out).toEqual([
      'You sense the presence of monsters.',
      'Monsters sense the presence of you.',
    ]);
    expect(m.state.entities[String(id)]!.c.monster!.asleep).toBe(false);
    expect(known(m, 'monster_detection')).toBe(true);
  });

  test('on an empty level: "You feel threatened.", used up and not identified', () => {
    const m = make();
    const out = quaff(m, 'monster_detection', 'blessed');
    expect(out.length).toBe(1);
    expect([
      'You feel threatened.',
      'You have a strange feeling for a moment, then it passes.',
    ]).toContain(out[0]);
    expect(hasPotion(m, 'monster_detection')).toBe(false);
    expect(known(m, 'monster_detection')).toBe(false);
  });
});

describe('levitation', () => {
  test('uncursed: she floats for 10..149 turns, then floats down after two warnings', () => {
    const m = make();
    expect(quaff(m, 'levitation', 'uncursed')).toEqual(['You start to float in the air!']);
    const h = hero(m.state);
    const left = timeoutLeft(m.state, h, P.LEVITATION);
    expect(left).toBeGreaterThanOrEqual(9);
    expect(left).toBeLessThanOrEqual(151);
    expect(levitating(m.ctx)).toBe(true);
    expect(levAtWillFlag(m.ctx)).toBe(false);
    const lines: string[] = [];
    for (let i = 0; i < 160 && levitating(m.ctx); i++) lines.push(...wait(m));
    expect(levitating(m.ctx)).toBe(false);
    expect(lines).toContain('You float slightly lower.');
    expect(lines).toContain('You wobble unsteadily in the air.');
    expect(lines.at(-1)).toBe('You float gently to the floor.');
  });

  test('blessed: at will; "Stop levitating" (or >) brings her down', () => {
    const m = make();
    quaff(m, 'levitation', 'blessed');
    const h = hero(m.state);
    expect(timeoutLeft(m.state, h, P.LEVITATION)).toBeGreaterThanOrEqual(250);
    expect(levAtWill(m.ctx)).toBe(true);
    const offers = engine.query(m.state).actionsFor({ kind: 'self' });
    const stop = offers.find((o) => o.labelKey === 'action.stop_levitating');
    expect(stop?.action).toEqual({ type: 'mod', action: 'nh:down' });
    const turn = m.state.turn;
    expect(texts(m.step(stop!.action))).toEqual(['You float gently to the floor.']);
    expect(m.state.turn).toBe(turn + 1);
    expect(levitating(m.ctx)).toBe(false);
    expect(hasProp(h, P.LEVITATION)).toBe(false);
    expect(levAtWillFlag(m.ctx)).toBe(false);
    expect(m.state.modData['nh']).not.toHaveProperty('levAtWill');
    const after = engine.query(m.state).actionsFor({ kind: 'self' });
    expect(after.some((o) => o.labelKey === 'action.stop_levitating')).toBe(false);
  });

  test('blessed with a ring of levitation on: not at will, > leaves her floating', () => {
    const m = make();
    const ring = mksobj(m.ctx, obj('nh:ring_of_levitation'), {
      init: false,
      carriedBy: m.state.playerId,
    });
    itemOf(m.state, ring).buc = 'uncursed';
    mod(m, 'nh:puton', { item: ring });
    if (m.state.pendingPrompt)
      engine.stepAll(m.state, {
        type: 'answer',
        promptId: m.state.pendingPrompt.prompt.id,
        value: 'l' as never,
      });
    expect(levitating(m.ctx)).toBe(true);
    quaff(m, 'levitation', 'blessed'); // already levitating: a peculiar feeling
    expect(levAtWill(m.ctx)).toBe(false);
    expect(texts(mod(m, 'nh:down'))[0]).toMatch(/^You are floating high above the floor/);
    expect(levitating(m.ctx)).toBe(true);
    expect(timeoutLeft(m.state, hero(m.state), P.LEVITATION)).toBe(0);
  });

  test('cursed: she hits her head on the ceiling and floats down when the turn ends', () => {
    const m = make();
    const out = quaff(m, 'levitation', 'cursed');
    // set_itimeout(&HLevitation, 1L): nh_timeout() at the end of this turn brings her down
    expect(out).toEqual([
      'You start to float in the air!',
      'You hit your head on the ceiling.',
      'You float gently to the floor.',
    ]);
    expect(hero(m.state).c.hp!.cur).toBeLessThan(500);
    expect(levAtWillFlag(m.ctx)).toBe(false);
    expect(levitating(m.ctx)).toBe(false);
  });

  test('cursed on the up stairs: she goes up them', () => {
    const m = make();
    const lvl = m.state.levels['dlvl1']!;
    let i = lvl.palette.indexOf(T.stairs_up);
    if (i < 0) i = lvl.palette.push(T.stairs_up) - 1;
    const p = hero(m.state).c.pos!;
    lvl.cells[p.y * lvl.width + p.x] = i;
    const r = mod(m, 'nh:quaff', { item: potion(m, 'levitation', 'cursed') });
    // level 1's up stairs lead out of the dungeon: doup() asks first
    expect(m.state.pendingPrompt?.prompt.key).toBe('stairs.leave_confirm');
    expect(texts(r)).toContain('You start to float in the air!');
  });

  test('enlightenment says "levitating, at will"', () => {
    const m = make();
    quaff(m, 'levitation', 'blessed');
    const r = mod(m, 'nh:quaff', { item: potion(m, 'enlightenment', 'uncursed') });
    const list = r.events.find((e) => e.type === 'list');
    const lines = list && list.type === 'list' ? list.items.map((i) => render(i)) : [];
    expect(lines).toContain('You are levitating, at will.');
  });
});
