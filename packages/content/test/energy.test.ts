import {
  buildSnapshot,
  createRng,
  getPlayer,
  seedRng,
  type EquipSlot,
  type GameState,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { cpostfxOf, eyeOfNewtBuzz } from '../src/givit';
import { MAXULEV, gainExperience, newpw, pluslvl, regenPw } from '../src/hero';
import { nhData } from '../src/items';
import { P_BASIC } from '../src/skills';
import { isqrt, percentSuccess } from '../src/spellcalc';
import { pwOf, setPw } from '../src/uenergy';
import { ctxFor, defs, engine, itemOf, levelSetup, render } from './itemHelpers';

const FORCE_BOLT = 'nh:spellbook_of_force_bolt';
const HEALING = 'nh:spellbook_of_healing';
const PROTECTION = 'nh:spellbook_of_protection';
const SLEEP = 'nh:spellbook_of_sleep';
const CURE_BLINDNESS = 'nh:spellbook_of_cure_blindness';

const rngAt = (seed: number) => createRng(seedRng(seed));

describe('spell energy at creation', () => {
  test('Pw is 2(2) (Valkyrie 1 + human 1, no random part) for every seed', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { state } = engine.newGame({ seed });
      expect(pwOf(state)).toEqual({ uen: 2, uenmax: 2, uenpeak: 2 });
      const status = buildSnapshot(defs, state).status;
      expect(status['pw']).toBe(2);
      expect(status['pwmax']).toBe(2);
    }
  });
});

describe('newpw', () => {
  test('a level gain is enermod(rn1(Wis/2 + 1, 2)) = 3/4 of it, at least 1', () => {
    for (let wis = 3; wis <= 25; wis++) {
      for (let lvl = 1; lvl < MAXULEV; lvl++) {
        const seed = wis * 100 + lvl;
        const a = rngAt(seed);
        const b = rngAt(seed);
        const want = Math.max(1, Math.trunc((3 * (b.rn2(Math.trunc(wis / 2) + 1) + 2)) / 4));
        expect(newpw({ rng: a } as never, lvl, wis)).toBe(want);
      }
    }
  });

  test('spans 1 .. 3 * (Wis/2 + 2) / 4 over many rolls', () => {
    const seen = new Set<number>();
    const rng = rngAt(5);
    for (let i = 0; i < 400; i++) seen.add(newpw({ rng } as never, 3, 18));
    // rn1(10, 2) is 2..11; 3/4 of it is 1..8
    expect([...seen].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test('after level 30 the gain is throttled by the maximum', () => {
    const rng = rngAt(9);
    for (let i = 0; i < 50; i++) {
      expect(newpw({ rng } as never, MAXULEV, 18, 0)).toBeLessThanOrEqual(4);
      expect(newpw({ rng } as never, MAXULEV, 18, 700)).toBe(1);
    }
  });
});

describe('pluslvl', () => {
  test('a level gain adds the same Pw to current and maximum, and raises the peak', () => {
    const s = levelSetup();
    setPw(s.ctx, { uen: 1, uenmax: 2, uenpeak: 2 });
    gainExperience(s.ctx as never, s.state.playerId, 20);
    const pw = pwOf(s.state);
    expect(getPlayer(s.state).c.experience?.level).toBe(2);
    const inc = pw.uenmax - 2;
    expect(inc).toBeGreaterThanOrEqual(1);
    expect(pw.uen).toBe(1 + inc);
    expect(pw.uenpeak).toBe(pw.uenmax);
  });

  test('pluslvl(FALSE) says "You feel more experienced." and sets the points to the threshold', () => {
    const s = levelSetup();
    pluslvl(s.ctx as never, s.state.playerId, false);
    const keys = s.ctx.events.flatMap((e) => (e.type === 'msg' ? [render(e)] : []));
    expect(keys).toEqual(['You feel more experienced.', 'Welcome to experience level 2.']);
    expect(getPlayer(s.state).c.experience).toEqual({ level: 2, points: 20 });
    expect(pwOf(s.state).uenmax).toBeGreaterThan(2);
  });
});

/** Runs regen_pw for turn `t` and returns the Pw gained. */
function regenAt(state: GameState, t: number): number {
  const before = pwOf(state).uen;
  state.turn = t;
  regenPw(ctxFor(state) as never);
  return pwOf(state).uen - before;
}

describe('regen_pw', () => {
  test('only on turns divisible by (38 - XL) * 4 / 6, by 1 .. (Wis + Int) / 15 + 1', () => {
    for (const [xl, every] of [
      [1, 24],
      [14, 16],
    ] as const) {
      const s = levelSetup();
      const hero = getPlayer(s.state);
      hero.c.experience = { level: xl, points: 0 };
      if (hero.c.attributes) Object.assign(hero.c.attributes, { wis: 18, int: 18 });
      setPw(s.ctx, { uen: 0, uenmax: 1000, uenpeak: 1000 });
      const gains = new Set<number>();
      for (let t = 1; t <= 400; t++) {
        const g = regenAt(s.state, t);
        if (t % every === 0) {
          expect(g).toBeGreaterThanOrEqual(1);
          expect(g).toBeLessThanOrEqual(3); // 36 / 15 + 1
          gains.add(g);
        } else expect(g).toBe(0);
      }
      expect(gains.size).toBeGreaterThan(1);
    }
  });

  test('never above the maximum, and nothing at the maximum', () => {
    const s = levelSetup();
    setPw(s.ctx, { uen: 9, uenmax: 10, uenpeak: 10 });
    expect(regenAt(s.state, 24)).toBe(1);
    expect(regenAt(s.state, 48)).toBe(0);
    expect(pwOf(s.state)).toEqual({ uen: 10, uenmax: 10, uenpeak: 10 });
  });

  test('Burdened still regenerates; Stressed or worse does not', () => {
    const s = levelSetup();
    const hero = getPlayer(s.state);
    if (hero.c.attributes) Object.assign(hero.c.attributes, { str: 10, con: 10 });
    setPw(s.ctx, { uen: 0, uenmax: 1000, uenpeak: 1000 });
    const enc = () => buildSnapshot(defs, s.state).status['encumbrance'];
    while (enc() !== 'burdened') s.carry('nh:dagger');
    expect(regenAt(s.state, 24)).toBeGreaterThan(0);
    while (enc() === 'burdened') s.carry('nh:dagger');
    expect(enc()).toBe('stressed');
    for (let t = 24; t <= 240; t += 24) expect(regenAt(s.state, t)).toBe(0);
  });

  test('runs each turn through the endOfTurn hook', () => {
    const s = levelSetup();
    setPw(s.ctx, { uen: 0, uenmax: 100, uenpeak: 100 });
    while (s.state.turn < 50) s.step({ type: 'search' });
    // turns 24 and 48 regenerated
    expect(pwOf(s.state).uen).toBeGreaterThanOrEqual(2);
  });
});

describe('the newt buzz', () => {
  const buzz = (uen: number, uenmax: number, seed: number) => {
    const s = levelSetup(undefined, seed);
    setPw(s.ctx, { uen, uenmax, uenpeak: uenmax });
    eyeOfNewtBuzz(s.ctx as never);
    const msgs = s.ctx.events.flatMap((e) => (e.type === 'msg' ? [render(e)] : []));
    return { pw: pwOf(s.state), msgs };
  };

  test('at two thirds or less it always gives 1-3 Pw, with "You feel a mild buzz."', () => {
    const gains = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const { pw, msgs } = buzz(2, 30, seed);
      gains.add(pw.uen - 2);
      expect(pw.uenmax).toBe(30);
      expect(msgs).toEqual(['You feel a mild buzz.']);
    }
    expect([...gains].sort()).toEqual([1, 2, 3]);
  });

  test('at full energy it sometimes raises the maximum (and peak) by 1, else nothing', () => {
    let raised = 0;
    let silent = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const { pw, msgs } = buzz(10, 10, seed);
      expect(pw.uen).toBe(pw.uenmax);
      if (pw.uenmax === 11) {
        raised++;
        expect(pw.uenpeak).toBe(11);
        expect(msgs).toEqual(['You feel a mild buzz.']);
      } else {
        silent++;
        expect(pw).toEqual({ uen: 10, uenmax: 10, uenpeak: 10 });
        expect(msgs).toEqual([]);
      }
    }
    expect(raised).toBeGreaterThan(0);
    expect(silent).toBeGreaterThan(0);
  });

  test('newts and spellcasters buzz when eaten; a jackal does not', () => {
    for (const [mon, buzzes] of [
      ['nh:newt', true],
      ['nh:gnomish_wizard', true],
      ['nh:jackal', false],
    ] as const) {
      const s = levelSetup();
      setPw(s.ctx, { uen: 0, uenmax: 30, uenpeak: 30 });
      cpostfxOf(s.ctx as never, defs.monster(mon));
      expect(pwOf(s.state).uen > 0, mon).toBe(buzzes);
    }
  });
});

describe('percent_success', () => {
  /** The hero with the kit (spear, small shield), the given Wis and XL. */
  function caster(wis: number, xl: number) {
    const s = levelSetup();
    const hero = getPlayer(s.state);
    if (hero.c.attributes) hero.c.attributes.wis = wis;
    hero.c.experience = { level: xl, points: 0 };
    const wear = (id: string, slot: EquipSlot) => {
      const item = s.carry(id);
      itemOf(s.state, item).equipped = slot;
      return item;
    };
    const unwear = (slot: EquipSlot) => {
      for (const e of Object.values(s.state.entities))
        if (e.c.item?.carriedBy === s.state.playerId && e.c.item.equipped === slot)
          e.c.item.equipped = null;
    };
    const pct = (book: string) => percentSuccess(s.state, defs, book as never);
    return { s, wear, unwear, pct };
  }

  test('isqrt is the integer square root', () => {
    expect([0, 1, 3, 4, 8300, 4700, 8281, 8280].map(isqrt)).toEqual([0, 1, 1, 2, 91, 68, 91, 90]);
  });

  // Worked out by hand from the C formula for the Valkyrie (spelbase 10, spelheal -2, spelshld 0,
  // spelarmr 9, Wis): splcaster, then chance = 11 * Wis / 2 +- the difficulty term, clamped to
  // 0..120, the heavy-shield division, then chance * (20 - splcaster) / 15 - splcaster.
  test.each([
    // [what, wis, xl, book, expected]
    ['Wis 7 XL 1 force bolt: 53 * 10 / 15 - 10', 7, 1, FORCE_BOLT, 25],
    ['Wis 12 XL 6 force bolt: (66 + 20) * 10 / 15 - 10', 12, 6, FORCE_BOLT, 47],
    ['Wis 18 XL 12 force bolt: (99 + 20) * 10 / 15 - 10', 18, 12, FORCE_BOLT, 69],
    ['Wis 12 XL 6 healing: splcaster 8, 86 * 12 / 15 - 8', 12, 6, HEALING, 60],
    [
      'Wis 18 XL 12 protection (level 1, restricted = unskilled): as force bolt',
      18,
      12,
      PROTECTION,
      69,
    ],
    ['Wis 7 XL 1 sleep (level 3): 38 - isqrt(8300) < 0', 7, 1, SLEEP, 0],
    ['Wis 18 XL 12 sleep: (99 - isqrt(4700)) * 10 / 15 - 10', 18, 12, SLEEP, 10],
    [
      'Wis 12 XL 6 cure blindness (level 2): (66 - isqrt(2900)) * 12 / 15 - 8',
      12,
      6,
      CURE_BLINDNESS,
      2,
    ],
  ])('%s', (_what, wis, xl, book, want) => {
    expect(caster(wis, xl).pct(book)).toBe(want);
  });

  test('Basic attack skill: Wis 7 XL 1 force bolt 58 * 10 / 15 - 10 = 28', () => {
    const c = caster(7, 1);
    const skills = nhData(c.s.ctx).skills;
    if (!skills) throw new Error('no skills');
    skills['attack_spell'] = P_BASIC;
    expect(c.pct(FORCE_BOLT)).toBe(28);
  });

  test('a robe alone helps: splcaster 1, 53 * 19 / 15 - 1 = 66', () => {
    const c = caster(7, 1);
    c.wear('nh:robe', 'cloak');
    expect(c.pct(FORCE_BOLT)).toBe(66);
  });

  test('metal body armor: 0 alone, splcaster 14 under a robe', () => {
    const c = caster(18, 12);
    c.wear('nh:ring_mail', 'body');
    expect(c.pct(FORCE_BOLT)).toBe(0); // splcaster 19: 119 * 1 / 15 - 19 < 0
    c.wear('nh:robe', 'cloak');
    expect(c.pct(FORCE_BOLT)).toBe(33); // 119 * 6 / 15 - 14
    const w = caster(7, 1);
    w.wear('nh:ring_mail', 'body');
    w.wear('nh:robe', 'cloak');
    expect(w.pct(FORCE_BOLT)).toBe(7); // 53 * 6 / 15 - 14
  });

  test('a large shield quarters the chance; the small shield does not', () => {
    const c = caster(18, 12);
    expect(c.pct(FORCE_BOLT)).toBe(69); // the kit's small shield (weight 30)
    c.unwear('shield');
    expect(c.pct(FORCE_BOLT)).toBe(69); // spelshld 0
    c.wear('nh:dwarvish_roundshield', 'shield');
    expect(c.pct(FORCE_BOLT)).toBe(9); // 119 / 4 = 29; 29 * 10 / 15 - 10
  });

  test('metal helm +4, metal boots +2', () => {
    const c = caster(18, 12);
    c.wear('nh:dwarvish_iron_helm', 'helm');
    expect(c.pct(FORCE_BOLT)).toBe(33); // 119 * 6 / 15 - 14
    c.unwear('helm');
    c.wear('nh:iron_shoes', 'boots');
    expect(c.pct(FORCE_BOLT)).toBe(51); // 119 * 8 / 15 - 12
  });
});
