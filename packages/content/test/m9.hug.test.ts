// m9 step 2: hugs and wraps. The owlbear's hug after two hits (then automatic while it holds
// her), being held, the python's wrap, and grabs that pass through an unsolid target.
import { getPlayer } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { M_ATTK, mhitmAdtyping, newMhm } from '../src/adtyping';
import { monsterAttack } from '../src/combat';
import { setUstuck, ustuck } from '../src/hackmove';
import { mattackm } from '../src/mhitm';
import { setCancelled } from '../src/mstate';
import { defs } from './itemHelpers';
import { atk, heroHp, keys, mon, room } from './m9helpers';

const OWLBEAR_HUG = defs.monster('nh:owlbear' as never).attacks[2]!;

describe('the owlbear (AT_HUGS AD_PHYS)', () => {
  test('after both claws hit it hugs: half the time it grabs her, later it crushes', () => {
    let grabs = 0;
    let crushes = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = room(seed);
      getPlayer(s.state).c.attributes!.dex = 3;
      const ob = mon(s.state, 'nh:owlbear');
      for (let i = 0; i < 8; i++) {
        s.ctx.events.length = 0;
        const before = ustuck(s.ctx);
        monsterAttack(s.ctx, ob.id);
        const k = keys(s.ctx);
        if (k.includes('mhitu.grabs_you')) {
          expect(before).toBe(null);
          // both claws hit first ("hits!" then "hits again!")
          expect(k.slice(0, 2)).toEqual(['combat.mon_hits', 'combat.mon_hits_again']);
          expect(ustuck(s.ctx)).toBe(ob.id);
          grabs++;
        }
        if (before === ob.id) {
          // held: the hug is automatic, whatever the claws do
          expect(k).toContain('mhitu.being_crushed');
          crushes++;
        }
      }
    }
    expect(grabs).toBeGreaterThan(5);
    expect(crushes).toBeGreaterThan(5);
  });

  test('a hug never prints a hit message of its own, and still does its damage', () => {
    const s = room();
    const ob = mon(s.state, 'nh:owlbear');
    setUstuck(s.ctx, ob.id);
    const mhm = newMhm(10);
    mhitmAdtyping(s.ctx, ob.id, OWLBEAR_HUG, s.state.playerId, mhm);
    expect(mhm.damage).toBe(10);
    expect(keys(s.ctx)).toEqual(['mhitu.being_crushed']);
  });

  test('held, she cannot walk away (3 times in 40 she pulls free)', () => {
    let stuck = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = room(seed);
      const ob = mon(s.state, 'nh:owlbear');
      ob.c.monster!.asleep = true; // it does not act
      setUstuck(s.ctx, ob.id);
      const r = s.step({ type: 'move', dir: 'w' });
      if (s.msgKeys(r).includes('stuck.cannot_escape')) {
        expect(getPlayer(s.state).c.pos).toMatchObject({ x: 2, y: 2 });
        stuck++;
      }
    }
    expect(stuck).toBeGreaterThan(14);
  });

  test('against a monster: two hits, then "The owlbear squeezes the newt."', () => {
    let squeezed = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = room(seed);
      const ob = mon(s.state, 'nh:owlbear', 5, 4);
      const newt = mon(s.state, 'nh:newt', 6, 4);
      newt.c.monster!.asleep = true; // +4 to hit
      mattackm(s.ctx, ob.id, newt.id);
      const k = keys(s.ctx);
      // the hug comes exactly when both claws hit
      const both = k[0] === 'mhitm.hits' && k[1] === 'mhitm.hits';
      expect(k.includes('mhitm.squeezes')).toBe(both);
      if (both) {
        expect(k[2]).toBe('mhitm.squeezes');
        squeezed++;
      }
    }
    expect(squeezed).toBeGreaterThan(3);
  });

  test("a grab passes right through an unsolid yellow light; so does a lichen's touch", () => {
    let passes = 0;
    for (let seed = 1; seed <= 400 && passes < 5; seed++) {
      const s = room(seed);
      const ob = mon(s.state, 'nh:owlbear', 5, 4);
      const yl = mon(s.state, 'nh:yellow_light', 6, 4);
      setCancelled(s.ctx, yl.id); // so it does not explode at the owlbear
      yl.c.monster!.asleep = true; // +4 to hit
      mattackm(s.ctx, ob.id, yl.id);
      if (keys(s.ctx).includes('mhitm.grab_passes')) {
        expect(keys(s.ctx)).not.toContain('mhitm.squeezes');
        passes++;
      }
    }
    expect(passes).toBe(5);
    let adhere = 0;
    for (let seed = 1; seed <= 400 && adhere < 5; seed++) {
      const s = room(seed);
      const l = mon(s.state, 'nh:lichen', 5, 4);
      const yl = mon(s.state, 'nh:yellow_light', 6, 4);
      yl.c.monster!.asleep = true; // +4 to hit
      const hp = yl.c.hp!.cur;
      const r = mattackm(s.ctx, l.id, yl.id);
      expect(r & M_ATTK.HIT).toBe(0);
      expect(yl.c.hp!.cur).toBe(hp);
      if (keys(s.ctx).includes('mhitm.grab_passes')) adhere++;
    }
    expect(adhere).toBe(5);
  });
});

describe('the python (AT_HUGS AD_WRAP)', () => {
  const WRAP = defs.monster('nh:python' as never).attacks[2]!;

  test('1 time in 10 it coils itself around her; otherwise it brushes against her for nothing', () => {
    const s = room();
    const py = mon(s.state, 'nh:python');
    let coiled = 0;
    let brushed = 0;
    for (let i = 0; i < 200; i++) {
      setUstuck(s.ctx, null);
      s.ctx.events.length = 0;
      const mhm = newMhm(3);
      mhitmAdtyping(s.ctx, py.id, WRAP, s.state.playerId, mhm);
      const k = keys(s.ctx);
      if (k.includes('mhitu.coils_around')) {
        expect(ustuck(s.ctx)).toBe(py.id);
        expect(mhm.damage).toBe(3);
        coiled++;
      } else {
        expect(k).toEqual(['mhitu.brushes_against']);
        expect(mhm.damage).toBe(0);
        brushed++;
      }
    }
    expect(coiled).toBeGreaterThan(5);
    expect(coiled).toBeLessThan(45);
    expect(brushed).toBeGreaterThan(150);
    // held: the wrap hug crushes
    s.ctx.events.length = 0;
    setUstuck(s.ctx, py.id);
    mhitmAdtyping(s.ctx, py.id, WRAP, s.state.playerId, newMhm(3));
    expect(keys(s.ctx)).toEqual(['mhitu.being_crushed']);
  });

  test('a cancelled python cannot start a wrap', () => {
    const s = room();
    const py = mon(s.state, 'nh:python');
    setCancelled(s.ctx, py.id);
    for (let i = 0; i < 60; i++) {
      const mhm = newMhm(3);
      mhitmAdtyping(s.ctx, py.id, atk('hug', 'wrap'), s.state.playerId, mhm);
      expect(mhm.damage).toBe(0);
    }
    expect(ustuck(s.ctx)).toBe(null);
    expect(heroHp(s.state)).toBe(5000);
  });
});
