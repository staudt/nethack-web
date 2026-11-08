// m9 step 2: gazes. The pyrolisk's fiery gaze next to the hero and at range, the confusion,
// stun and blinding gazes (on the pyrolisk's body with a test attack: their vanilla owners come
// with m10), the cancelled and unseen cases, and gazes between monsters. Each outcome is checked
// over many independent tries, never on a lucky seed.
import { getPlayer, type DefId } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { M_ATTK } from '../src/adtyping';
import { gazemu } from '../src/mhitu';
import { mattackm } from '../src/mhitm';
import { mattackRanged } from '../src/mthrowu';
import { P, hasProp, makeBlinded, makeHallucinated, setIntrinsic } from '../src/props';
import { mspecUsed, setCancelled, setMblinded, setMspecUsed } from '../src/mstate';
import { defs } from './itemHelpers';
import { atk, heroHp, keys, mon, room } from './m9helpers';

const fiery = defs.monster('nh:pyrolisk' as DefId).attacks[0]!;

describe('the pyrolisk (AD_FIRE gaze)', () => {
  test('its fiery gaze burns her 4 times in 5 and never uses its special ability', () => {
    const s = room();
    const p = mon(s.state, 'nh:pyrolisk');
    let burnt = 0;
    for (let i = 0; i < 100; i++) {
      const before = heroHp(s.state);
      s.ctx.events.length = 0;
      expect(gazemu(s.ctx, p, fiery)).toBe(M_ATTK.MISS);
      if (keys(s.ctx).includes('mhitu.fiery_gaze')) {
        burnt++;
        const lost = before - heroHp(s.state);
        expect(lost).toBeGreaterThanOrEqual(2); // d(2, 6), not the attack's own dice
        expect(lost).toBeLessThanOrEqual(12);
      } else expect(heroHp(s.state)).toBe(before);
      expect(mspecUsed(s.ctx, p.id)).toBe(0);
    }
    expect(burnt).toBeGreaterThan(60);
    expect(burnt).toBeLessThan(100);
  });

  test('fire resistance: "The fire doesn\'t feel hot!" and no damage', () => {
    const s = room();
    setIntrinsic(getPlayer(s.state), P.FIRE_RES, true);
    const p = mon(s.state, 'nh:pyrolisk');
    for (let i = 0; i < 30; i++) gazemu(s.ctx, p, fiery);
    expect(keys(s.ctx)).toContain('mhitu.fire_not_hot');
    expect(heroHp(s.state)).toBe(5000);
  });

  test('a cancelled pyrolisk only looks irritated or inflamed', () => {
    const s = room();
    const p = mon(s.state, 'nh:pyrolisk');
    setCancelled(s.ctx, p.id);
    for (let i = 0; i < 40; i++) gazemu(s.ctx, p, fiery);
    expect(heroHp(s.state)).toBe(5000);
    const reacts = s.ctx.events.flatMap((e) =>
      e.type === 'msg' && e.key === 'mhitu.looks_react' ? [String(e.params?.['react'])] : [],
    );
    expect(reacts.length).toBeGreaterThan(20);
    expect(new Set(reacts)).toEqual(new Set(['@mhitu.react.4', '@mhitu.react.5']));
  });

  test('she has to see it: a blind hero or a blinded pyrolisk does nothing', () => {
    const s = room();
    const p = mon(s.state, 'nh:pyrolisk');
    makeBlinded(s.ctx, 500, false);
    s.step({ type: 'wait' }); // vision recomputed
    for (let i = 0; i < 30; i++) gazemu(s.ctx, p, fiery);
    expect(keys(s.ctx)).not.toContain('mhitu.fiery_gaze');
    const t = room();
    const q = mon(t.state, 'nh:pyrolisk');
    setMblinded(t.ctx, q.id, 100);
    for (let i = 0; i < 30; i++) gazemu(t.ctx, q, fiery);
    expect(keys(t.ctx)).not.toContain('mhitu.fiery_gaze');
    expect(heroHp(t.state)).toBe(5000);
  });

  test('a hallucinating hero is mostly spared (3 times in 4 the gaze counts as cancelled)', () => {
    const s = room();
    const p = mon(s.state, 'nh:pyrolisk');
    makeHallucinated(s.ctx, 5000, false);
    for (let i = 0; i < 200; i++) gazemu(s.ctx, p, fiery);
    const k = keys(s.ctx);
    const burnt = k.filter((x) => x === 'mhitu.fiery_gaze').length;
    expect(burnt).toBeGreaterThan(10);
    expect(burnt).toBeLessThan(80);
    expect(k).toContain('mhitu.looks_react');
  });

  test('at range: the gaze comes through mattackRanged()', () => {
    const s = room();
    const p = mon(s.state, 'nh:pyrolisk', 7, 2);
    for (let i = 0; i < 20; i++) mattackRanged(s.ctx, p.id, () => true, null);
    expect(keys(s.ctx)).toContain('mhitu.fiery_gaze');
    expect(heroHp(s.state)).toBeLessThan(5000);
  });
});

describe('confusion, stun and blinding gazes', () => {
  test('confusion: confused for d(3,4), the monster spends its special ability', () => {
    const s = room();
    const p = mon(s.state, 'nh:pyrolisk');
    const conf = atk('gaze', 'conf', 0, 0);
    let n = 0;
    for (let i = 0; i < 40 && !n; i++) {
      gazemu(s.ctx, p, conf);
      if (keys(s.ctx).includes('mhitu.gaze_confuses')) n++;
    }
    expect(n).toBe(1);
    expect(hasProp(getPlayer(s.state), P.CONFUSION)).toBe(true);
    expect(mspecUsed(s.ctx, p.id)).toBeGreaterThanOrEqual(3);
    // while the ability is used up, nothing more happens
    s.ctx.events.length = 0;
    for (let i = 0; i < 20; i++) gazemu(s.ctx, p, conf);
    expect(keys(s.ctx)).toEqual([]);
    setMspecUsed(s.ctx, p.id, 0);
    for (let i = 0; i < 40; i++) gazemu(s.ctx, p, conf);
    expect(keys(s.ctx)).toContain('mhitu.more_confused');
  });

  test('stun: "stares piercingly", stunned', () => {
    const s = room();
    const p = mon(s.state, 'nh:pyrolisk');
    for (let i = 0; i < 40 && !keys(s.ctx).includes('mhitu.stares_piercingly'); i++)
      gazemu(s.ctx, p, atk('gaze', 'stun', 0, 0));
    expect(keys(s.ctx)).toContain('mhitu.stares_piercingly');
    expect(hasProp(getPlayer(s.state), P.STUNNED)).toBe(true);
  });

  test('blinding radiance blinds (and briefly stuns) every time she sees it', () => {
    const s = room();
    const p = mon(s.state, 'nh:pyrolisk');
    gazemu(s.ctx, p, atk('gaze', 'blnd', 1, 50));
    expect(keys(s.ctx)).toContain('mhitu.blinded_by_radiance');
    const hero = getPlayer(s.state);
    expect(hasProp(hero, P.BLINDED)).toBe(true);
    expect(hasProp(hero, P.STUNNED)).toBe(true);
  });
});

describe('gazes between monsters (gazemm)', () => {
  test('a pyrolisk sets a newt on fire; a blind newt or a cancelled pyrolisk: nothing happens', () => {
    const s = room();
    const p = mon(s.state, 'nh:pyrolisk', 5, 4);
    const newt = mon(s.state, 'nh:newt', 6, 4);
    let fire = 0;
    for (let i = 0; i < 20; i++) {
      s.ctx.events.length = 0;
      mattackm(s.ctx, p.id, newt.id);
      const k = keys(s.ctx);
      if (k.includes('mhitm.gazes_at')) {
        expect(k).toContain('mhitm.on_fire');
        fire++;
      }
    }
    expect(fire).toBe(20); // the gaze needs no to-hit roll
    expect(newt.c.hp!.cur).toBeLessThan(1000);

    const hp = newt.c.hp!.cur;
    setMblinded(s.ctx, newt.id, 100);
    s.ctx.events.length = 0;
    mattackm(s.ctx, p.id, newt.id);
    expect(keys(s.ctx)).toContain('mhitm.nothing_happens');
    expect(keys(s.ctx)).not.toContain('mhitm.on_fire');
    setMblinded(s.ctx, newt.id, 0);
    setCancelled(s.ctx, p.id);
    s.ctx.events.length = 0;
    mattackm(s.ctx, p.id, newt.id);
    expect(keys(s.ctx)).toContain('mhitm.nothing_happens');
    expect(newt.c.hp!.cur).toBeLessThanOrEqual(hp); // only bites can hurt now
  });
});
