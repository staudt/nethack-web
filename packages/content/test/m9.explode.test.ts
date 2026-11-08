// m9 step 2: exploding monsters. The yellow light's blinding explosion (at the hero and at a
// monster), the gas spore's death explosion (AT_BOOM) with its kill credit and chain reactions,
// and a sphere-style AT_EXPL fire explosion through explode().
import { getPlayer } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { M_ATTK } from '../src/adtyping';
import { heroAttack, monsterAttack } from '../src/combat';
import { explmu } from '../src/mhitu';
import { mattackm, monkilled } from '../src/mhitm';
import { P, hasProp, makeBlinded, setIntrinsic, timeoutLeft } from '../src/props';
import { mblinded, setCancelled } from '../src/mstate';
import { alive, atk, heroHp, keys, mon, room } from './m9helpers';

const corpsesOn = (s: ReturnType<typeof room>) =>
  Object.values(s.state.entities).filter((e) => e?.def === 'nh:corpse');

describe('the yellow light (AT_EXPL AD_BLND)', () => {
  test('it explodes next to her: blinded for d(10, 20) turns, and it is gone', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const s = room(seed);
      const y = mon(s.state, 'nh:yellow_light');
      monsterAttack(s.ctx, y.id);
      const k = keys(s.ctx);
      expect(k.slice(0, 2)).toEqual(['combat.mon_explodes', 'mhitu.blast_of_light']);
      const t = timeoutLeft(s.state, getPlayer(s.state), P.BLINDED);
      expect(t).toBeGreaterThanOrEqual(10);
      expect(t).toBeLessThanOrEqual(200);
      expect(alive(s.state, y.id)).toBe(false);
      expect(corpsesOn(s)).toEqual([]);
      expect(heroHp(s.state)).toBe(5000);
    }
  });

  test('already blind: "You seem unaffected by it.", the light dies anyway', () => {
    const s = room();
    makeBlinded(s.ctx, 3, false);
    const y = mon(s.state, 'nh:yellow_light');
    expect(explmu(s.ctx, y, s.ctx.defs.monster(y.def).attacks[0]!, true)).toBe(M_ATTK.AGR_DIED);
    expect(keys(s.ctx)).toContain('mhitu.seem_unaffected_by_it');
    expect(timeoutLeft(s.state, getPlayer(s.state), P.BLINDED)).toBe(3);
    expect(alive(s.state, y.id)).toBe(false);
  });

  test('a cancelled yellow light does not explode', () => {
    const s = room();
    const y = mon(s.state, 'nh:yellow_light');
    setCancelled(s.ctx, y.id);
    monsterAttack(s.ctx, y.id);
    expect(alive(s.state, y.id)).toBe(true);
    expect(hasProp(getPlayer(s.state), P.BLINDED)).toBe(false);
  });

  test('at a monster: "The yellow light explodes!", the newt is blinded, the light dies', () => {
    const s = room();
    const y = mon(s.state, 'nh:yellow_light', 5, 4);
    const newt = mon(s.state, 'nh:newt', 6, 4);
    const r = mattackm(s.ctx, y.id, newt.id);
    expect(r & M_ATTK.AGR_DIED).toBeTruthy();
    expect(keys(s.ctx)).toContain('mhitm.explodes');
    expect(alive(s.state, y.id)).toBe(false);
    expect(mblinded(s.ctx, newt.id)).toBeGreaterThanOrEqual(10);
  });
});

describe('the gas spore (AT_BOOM)', () => {
  /** The hero at (2,2), a spore at (3,2) with 1 HP, a newt at (4,2) next to it. */
  function setup(seed = 1) {
    const s = room(seed);
    const spore = mon(s.state, 'nh:gas_spore');
    spore.c.hp = { cur: 1, max: 1 };
    spore.c.monster!.asleep = true; // hit for sure
    const newt = mon(s.state, 'nh:newt', 4, 2);
    newt.c.hp = { cur: 1, max: 1 };
    return { s, spore, newt };
  }

  test('killed by the hero, it explodes: she is caught, the newt dies and she gets the credit', () => {
    let tries = 0;
    for (let seed = 1; tries < 5 && seed < 60; seed++) {
      const { s, spore, newt } = setup(seed);
      const exp0 = getPlayer(s.state).c.experience!.points;
      heroAttack(s.ctx, spore.id);
      if (alive(s.state, spore.id)) continue; // missed
      tries++;
      const k = keys(s.ctx);
      expect(k).toContain('explode.you_caught');
      // (her explosion messages come after the monsters')
      expect(k.indexOf('explode.mon_caught')).toBeLessThan(k.indexOf('explode.you_caught'));
      const lost = 5000 - heroHp(s.state);
      expect(lost).toBeGreaterThanOrEqual(4);
      expect(lost).toBeLessThanOrEqual(24); // d(4, 6)
      expect(alive(s.state, newt.id)).toBe(false);
      // "You kill the gas spore!" then "You kill the newt!": both kills are hers
      expect(k.filter((x) => x === 'combat.you_kill').length).toBe(2);
      expect(getPlayer(s.state).c.experience!.points).toBeGreaterThan(exp0 + 1);
      expect(corpsesOn(s).some((c) => c?.c.item?.corpseOf === 'nh:gas_spore')).toBe(false);
    }
    expect(tries).toBe(5);
  });

  test('killed by a monster, the explosion kills as a monster would (no experience)', () => {
    const { s, spore, newt } = setup();
    const exp0 = getPlayer(s.state).c.experience!.points;
    monkilled(s.ctx, spore.id, true);
    expect(alive(s.state, newt.id)).toBe(false);
    expect(keys(s.ctx)).toContain('mhitm.is_killed');
    expect(keys(s.ctx)).not.toContain('combat.you_kill');
    expect(getPlayer(s.state).c.experience!.points).toBe(exp0);
    expect(heroHp(s.state)).toBeLessThan(5000);
  });

  test('a chain reaction: a spore caught in the blast explodes in turn', () => {
    const s = room();
    const a = mon(s.state, 'nh:gas_spore', 5, 4);
    const b = mon(s.state, 'nh:gas_spore', 6, 4);
    b.c.hp = { cur: 1, max: 1 };
    const far = mon(s.state, 'nh:newt', 7, 4); // only in b's blast
    far.c.hp = { cur: 1, max: 1 };
    monkilled(s.ctx, a.id, true);
    expect(alive(s.state, b.id)).toBe(false);
    expect(alive(s.state, far.id)).toBe(false);
    expect(keys(s.ctx).filter((k) => k === 'explode.boom').length).toBe(2);
  });

  test("its explosion can kill her: a gas spore's explosion", () => {
    const s = room();
    getPlayer(s.state).c.hp = { cur: 1, max: 10 };
    const spore = mon(s.state, 'nh:gas_spore');
    monkilled(s.ctx, spore.id, true);
    expect(s.state.gameOver).toBeTruthy();
    expect(JSON.stringify(s.state.gameOver)).toContain('killer.explode.mon.gas_spore');
  });
});

describe('a sphere-style fire explosion (mon_explodes() through explode())', () => {
  test('a real fiery explosion: fire resistance shields her, the exploder dies', () => {
    const s = room();
    const sph = mon(s.state, 'nh:gas_spore');
    const fire = atk('explode', 'fire', 4, 6);
    const r = explmu(s.ctx, sph, fire, true);
    expect(r).toBe(M_ATTK.AGR_DIED);
    expect(heroHp(s.state)).toBeLessThan(5000);
    const t = room();
    setIntrinsic(getPlayer(t.state), P.FIRE_RES, true);
    const sph2 = mon(t.state, 'nh:gas_spore');
    explmu(t.ctx, sph2, fire, true);
    expect(heroHp(t.state)).toBe(5000);
    expect(keys(t.ctx)).toContain('explode.you_caught');
    expect(alive(t.state, sph2.id)).toBe(false);
  });
});
