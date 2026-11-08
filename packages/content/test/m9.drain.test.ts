// m9 step 7: level drain. A wraith's touch and a barrow wight's blade take levels from the hero
// (the hit points and energy that level gave, its intrinsics and skill slot; death at level 1),
// monsters drain monsters, the wraith corpse and blessed full healing give levels back ("Welcome
// back"), and wizard mode's #levelchange lowers. Outcomes are checked over many tries, never on a
// lucky seed.
import { getPlayer, type DefId, type Entity, type GameState } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { M_ATTK, mhitmAdtyping, newMhm, resistsDrli } from '../src/adtyping';
import { losexp } from '../src/exper';
import { cpostfxOf } from '../src/givit';
import { levelIncrements, pluslvl, ulevelmax } from '../src/hero';
import { mattackm } from '../src/mhitm';
import { mInitWeap } from '../src/mongear';
import { P, hasIntrinsic } from '../src/props';
import { loseWeaponSkill, weaponSlots } from '../src/skills';
import { pwOf } from '../src/uenergy';
import { setUlycn } from '../src/werestate';
import { defs, render } from './itemHelpers';
import { alive, keys, mon, room, type FullCtx } from './m9helpers';

const TUCH = defs.monster('nh:wraith' as DefId).attacks[0]!;
const hero = (state: GameState): Entity => getPlayer(state);
const level = (state: GameState): number => hero(state).c.experience!.level;
const texts = (ctx: FullCtx): string[] =>
  ctx.events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );

/** A room whose hero has gained levels up to `lvl` (each gain recorded). */
function leveled(lvl: number, seed = 1) {
  const s = room(seed);
  const h = hero(s.state);
  h.c.hp = { cur: 20, max: 20 };
  while (level(s.state) < lvl) pluslvl(s.ctx, h.id, false);
  s.ctx.events.length = 0;
  return s;
}

describe('the hero loses levels (losexp)', () => {
  test('one level: the gains of that level go, intrinsics too, points drop below the level', () => {
    const s = leveled(7);
    const h = hero(s.state);
    const max = h.c.hp!.max;
    const pw = pwOf(s.state);
    const inc = levelIncrements(s.ctx, 6, max, pw.uenmax, 7);
    expect(inc.hp).toBeGreaterThan(0);
    expect(hasIntrinsic(h, P.FAST)).toBe(true);
    losexp(s.ctx, '@killer.life_drainage');
    expect(texts(s.ctx)).toEqual(['Farvel level 7.', 'You feel slow!']);
    expect(level(s.state)).toBe(6);
    expect(h.c.hp!.max).toBe(max - inc.hp);
    expect(pwOf(s.state).uenmax).toBe(pw.uenmax - inc.en);
    expect(hasIntrinsic(h, P.FAST)).toBe(false);
    expect(h.c.experience!.points).toBe(639); // newuexp(6) - 1
    expect(ulevelmax(s.ctx, 6)).toBe(7);
  });

  test('regaining the level is "Welcome back"; blessed full healing gives one back', () => {
    const s = leveled(4);
    losexp(s.ctx, '@killer.life_drainage');
    losexp(s.ctx, '@killer.life_drainage');
    expect(level(s.state)).toBe(2);
    s.ctx.events.length = 0;
    // the wraith corpse: pluslvl(FALSE)
    cpostfxOf(s.ctx, defs.monster('nh:wraith' as DefId));
    expect(texts(s.ctx)).toEqual([
      'You feel more experienced.',
      'Welcome back to experience level 3.',
      'You feel stealthy!',
    ]);
    cpostfxOf(s.ctx, defs.monster('nh:wraith' as DefId));
    cpostfxOf(s.ctx, defs.monster('nh:wraith' as DefId));
    expect(level(s.state)).toBe(5);
    expect(texts(s.ctx).at(-1)).toBe('Welcome to experience level 5.');
    expect(ulevelmax(s.ctx, 5)).toBe(5);
  });

  test('at level 1 a drainer kills her; divine anger only takes her experience points', () => {
    const s = leveled(1);
    hero(s.state).c.experience!.points = 15;
    losexp(s.ctx, null);
    expect(texts(s.ctx)).toEqual([]);
    expect(hero(s.state).c.experience!.points).toBe(0);
    expect(s.state.gameOver).toBeNull();
    losexp(s.ctx, '@killer.life_drainage');
    expect(texts(s.ctx)).toEqual(['Farvel level 1.']);
    expect(s.state.gameOver?.killer).toBe('@killer.life_drainage');
  });

  test('hit points never drop below the life-saving minimum, current HP stays at least 1', () => {
    const s = leveled(3);
    const h = hero(s.state);
    h.c.hp = { cur: 2, max: 11 };
    losexp(s.ctx, '@killer.life_drainage');
    expect(h.c.hp).toEqual({ cur: 1, max: 10 });
  });

  test('a lycanthrope resists level drain', () => {
    const s = leveled(5);
    setUlycn(s.ctx, 'nh:wererat' as DefId);
    losexp(s.ctx, '@killer.life_drainage');
    expect(level(s.state)).toBe(5);
    expect(texts(s.ctx)).toEqual([]);
  });

  test('a lost level takes back an unused skill slot first, then the last advance', () => {
    const s = leveled(3);
    const slots = weaponSlots(s.ctx);
    loseWeaponSkill(s.ctx, 1);
    expect(weaponSlots(s.ctx)).toBe(slots - 1);
    const nh = s.state.modData['nh'] as {
      weaponSlots: number;
      skills: Record<string, number>;
      skillRecord?: string[];
      skillsAdvanced: number;
    };
    nh.weaponSlots = 0;
    nh.skills['long_sword'] = 3; // Skilled, advanced last
    nh.skillRecord = ['long_sword'];
    nh.skillsAdvanced = 1;
    loseWeaponSkill(s.ctx, 1);
    expect(nh.skills['long_sword']).toBe(2);
    expect(nh.skillsAdvanced).toBe(0);
    expect(weaponSlots(s.ctx)).toBe(1); // slots_required() at Basic - 1
  });
});

describe('the wraith touch (mhitm_ad_drli)', () => {
  test('against the hero: a level 1 time in 3, and death at level 1', () => {
    let drained = 0;
    for (let i = 0; i < 90; i++) {
      const s = leveled(3, i + 1);
      const w = mon(s.state, 'nh:wraith');
      const mhm = newMhm(3);
      mhitmAdtyping(s.ctx, w.id, TUCH, s.state.playerId, mhm, { vis: true, mwep: null });
      if (level(s.state) === 2) {
        drained++;
        expect(keys(s.ctx)).toContain('exp.goodbye');
      }
      expect(mhm.damage).toBe(3); // the touch's own damage still applies
    }
    expect(drained).toBeGreaterThan(15);
    expect(drained).toBeLessThan(50);
    let died = false;
    for (let i = 0; i < 60 && !died; i++) {
      const s = leveled(1, i + 1);
      const w = mon(s.state, 'nh:wraith');
      mhitmAdtyping(s.ctx, w.id, TUCH, s.state.playerId, newMhm(1));
      died = s.state.gameOver?.killer === '@killer.life_drainage';
    }
    expect(died).toBe(true);
  });

  test('against a monster: weaker, a level less; at level 0 it dies; undead resist', () => {
    let weaker = 0;
    for (let i = 0; i < 60; i++) {
      const s = room(i + 1);
      const w = mon(s.state, 'nh:wraith', 3, 2);
      const d = mon(s.state, 'nh:hill_orc', 4, 2);
      const lvl = d.c.monster!.level;
      const mhm = newMhm(0);
      mhitmAdtyping(s.ctx, w.id, TUCH, d.id, mhm, { vis: true, mwep: null });
      if (keys(s.ctx).includes('adtyp.becomes_weaker')) {
        weaker++;
        expect(d.c.monster!.level).toBe(lvl - 1);
        expect(d.c.hp!.max).toBe(1000 - mhm.damage);
        expect(mhm.damage).toBeGreaterThanOrEqual(2);
        expect(mhm.damage).toBeLessThanOrEqual(12);
      }
    }
    expect(weaker).toBeGreaterThan(10);
    // a level 0 newt drained dies of it
    let killed = false;
    for (let i = 0; i < 60 && !killed; i++) {
      const s = room(i + 1);
      const w = mon(s.state, 'nh:wraith', 3, 2);
      const n = mon(s.state, 'nh:newt', 4, 2);
      n.c.monster!.level = 0;
      const r = mattackm(s.ctx, w.id, n.id);
      if (!alive(s.state, n.id)) {
        killed = true;
        expect(r & M_ATTK.DEF_DIED).toBeTruthy();
      }
    }
    expect(killed).toBe(true);
    const s = room();
    expect(resistsDrli(s.ctx, mon(s.state, 'nh:human_zombie', 4, 2))).toBe(true);
    expect(resistsDrli(s.ctx, mon(s.state, 'nh:human_wererat', 5, 2))).toBe(true);
    expect(resistsDrli(s.ctx, mon(s.state, 'nh:jackal', 6, 2))).toBe(false);
  });

  test('the barrow wight is made with a knife and a long sword', () => {
    const s = room();
    const b = mon(s.state, 'nh:barrow_wight', 4, 2);
    mInitWeap(s.ctx, b.id);
    const items = Object.values(s.state.entities)
      .filter((e) => e.c.item?.carriedBy === b.id)
      .map((e) => e.def)
      .sort();
    expect(items).toEqual(['nh:knife', 'nh:long_sword']);
  });
});
