// m9 step 5: breath and spit. The winter wolf cub's frost breath at the hero (lined up, used up
// for a while, a cancelled one coughing), breath rays killing monsters without crediting the hero,
// the death message; poison gas and acid rays; the cobra's blinding venom and acid venom at the
// hero and at monsters. Outcomes are checked over many tries, never on a lucky seed.
import { getPlayer, type DefId, type GameState } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { breamm, mattackRanged, spitmm } from '../src/mthrowu';
import { P, hasProp, makeBlinded, setIntrinsic } from '../src/props';
import { mblinded, mspecUsed, setCancelled, setMspecUsed } from '../src/mstate';
import { defs } from './itemHelpers';
import { alive, atk, heroHp, keys, mon, room } from './m9helpers';

const frost = defs.monster('nh:winter_wolf_cub' as DefId).attacks[1]!;
const venom = defs.monster('nh:cobra' as DefId).attacks[1]!;
const clear = (): boolean => true;
/** The Valkyrie resists cold: take it away. */
const warmRoom = (seed = 1) => {
  const s = room(seed);
  setIntrinsic(getPlayer(s.state), P.COLD_RES, false);
  return s;
};
const venomLeft = (state: GameState): number =>
  Object.values(state.entities).filter((e) => e.def.includes('venom')).length;

describe('breath (breamu, breamm)', () => {
  test('the winter wolf cub breathes frost when lined up, and the blast hits her', () => {
    const s = warmRoom();
    const w = mon(s.state, 'nh:winter_wolf_cub', 7, 2);
    let breathed = 0;
    for (let i = 0; i < 200; i++) {
      setMspecUsed(s.ctx, w.id, 0);
      mattackRanged(s.ctx, w.id, clear, null);
    }
    for (const e of s.ctx.events)
      if (e.type === 'msg' && e.key === 'mthrow.breathes') {
        breathed++;
        expect(e.params?.['breath']).toEqual({ key: 'mthrow.breath.cold' });
      }
    expect(breathed).toBeGreaterThan(100); // 2 times in 3
    expect(breathed).toBeLessThan(170);
    expect(s.ctx.events.some((e) => e.type === 'ray' && e.kind === 'cold')).toBe(true);
    expect(keys(s.ctx)).toContain('zap.ray.hits_you');
    expect(heroHp(s.state)).toBeLessThan(5000);
  });

  test('not lined up, used up or cancelled: no breath', () => {
    const s = room();
    const w = mon(s.state, 'nh:winter_wolf_cub', 5, 3); // a knight's move away
    for (let i = 0; i < 50; i++) breamm(s.ctx, w.id, frost, s.state.playerId, clear);
    expect(keys(s.ctx)).not.toContain('mthrow.breathes');
    const t = room();
    const u = mon(t.state, 'nh:winter_wolf_cub', 7, 2);
    setMspecUsed(t.ctx, u.id, 100);
    for (let i = 0; i < 50; i++) breamm(t.ctx, u.id, frost, t.state.playerId, clear);
    expect(keys(t.ctx)).not.toContain('mthrow.breathes');
    setMspecUsed(t.ctx, u.id, 0);
    setCancelled(t.ctx, u.id);
    breamm(t.ctx, u.id, frost, t.state.playerId, clear);
    expect(keys(t.ctx)).toEqual(['mthrow.coughs']);
    expect(heroHp(t.state)).toBe(5000);
  });

  test('after breathing at her the breath is used up 1 time in 3', () => {
    const s = room();
    const w = mon(s.state, 'nh:winter_wolf_cub', 7, 2);
    let used = 0;
    let n = 0;
    for (let i = 0; i < 300; i++) {
      setMspecUsed(s.ctx, w.id, 0);
      s.ctx.events.length = 0;
      breamm(s.ctx, w.id, frost, s.state.playerId, clear);
      if (!keys(s.ctx).includes('mthrow.breathes')) continue;
      n++;
      const m = mspecUsed(s.ctx, w.id);
      if (m) {
        used++;
        expect(m).toBeGreaterThanOrEqual(8);
        expect(m).toBeLessThanOrEqual(25);
      }
    }
    expect(used / n).toBeGreaterThan(0.2);
    expect(used / n).toBeLessThan(0.5);
  });

  test('cold resistance (the Valkyrie\'s): "You don\'t feel cold." and no damage', () => {
    const s = room();
    const w = mon(s.state, 'nh:winter_wolf_cub', 7, 2);
    for (let i = 0; i < 100; i++) {
      setMspecUsed(s.ctx, w.id, 0);
      breamm(s.ctx, w.id, frost, s.state.playerId, clear);
    }
    expect(keys(s.ctx)).toContain('zap.u.not_cold');
    expect(heroHp(s.state)).toBe(5000);
  });

  test('a fatal blast: "killed by a blast of frost exhaled by a winter wolf cub"', () => {
    for (let i = 0; i < 40; i++) {
      const s = warmRoom(i + 1);
      getPlayer(s.state).c.hp = { cur: 1, max: 1 };
      const w = mon(s.state, 'nh:winter_wolf_cub', 7, 2);
      for (let j = 0; j < 30 && !s.state.gameOver; j++) {
        setMspecUsed(s.ctx, w.id, 0);
        breamm(s.ctx, w.id, frost, s.state.playerId, clear);
      }
      if (!s.state.gameOver) continue;
      expect(s.state.gameOver.killer).toBe('@killer.breath.cold.winter_wolf_cub');
      return;
    }
    throw new Error('no fatal blast in 40 games');
  });

  test('a monster killed by a breath gives the hero no experience', () => {
    let kills = 0;
    for (let i = 0; i < 40; i++) {
      const s = room(i + 1);
      const w = mon(s.state, 'nh:winter_wolf_cub', 7, 2);
      const j = mon(s.state, 'nh:jackal', 4, 5); // lined up on the diagonal
      j.c.hp = { cur: 1, max: 1 };
      const exp0 = getPlayer(s.state).c.experience!.points;
      for (let k = 0; k < 20 && alive(s.state, j.id); k++) {
        setMspecUsed(s.ctx, w.id, 0);
        breamm(s.ctx, w.id, frost, j.id, clear);
      }
      if (alive(s.state, j.id)) continue;
      kills++;
      expect(getPlayer(s.state).c.experience!.points).toBe(exp0);
      expect(keys(s.ctx)).not.toContain('combat.you_kill');
    }
    expect(kills).toBeGreaterThan(20);
  });

  test('poison gas poisons her (no damage with poison resistance); acid burns', () => {
    const s = room();
    const w = mon(s.state, 'nh:winter_wolf_cub', 7, 2);
    const gas = atk('breath', 'drst', 1, 6);
    for (let i = 0; i < 100; i++) {
      setMspecUsed(s.ctx, w.id, 0);
      breamm(s.ctx, w.id, gas, s.state.playerId, clear);
    }
    expect(s.ctx.events.some((e) => e.type === 'ray' && e.kind === 'poison_gas')).toBe(true);
    expect(heroHp(s.state)).toBeLessThan(5000);
    const t = room();
    setIntrinsic(getPlayer(t.state), P.POISON_RES, true);
    const v = mon(t.state, 'nh:winter_wolf_cub', 7, 2);
    for (let i = 0; i < 100; i++) {
      setMspecUsed(t.ctx, v.id, 0);
      breamm(t.ctx, v.id, gas, t.state.playerId, clear);
    }
    expect(keys(t.ctx)).toContain('poison.no_effect');
    expect(heroHp(t.state)).toBe(5000);
    const a = room();
    const x = mon(a.state, 'nh:winter_wolf_cub', 7, 2);
    for (let i = 0; i < 100; i++) {
      setMspecUsed(a.ctx, x.id, 0);
      breamm(a.ctx, x.id, atk('breath', 'acid', 1, 6), a.state.playerId, clear);
    }
    expect(keys(a.ctx)).toContain('zap.u.acid_burns');
    expect(heroHp(a.state)).toBeLessThan(5000);
  });
});

describe('spit (spitmu, spitmm)', () => {
  test('the cobra spits blinding venom: it blinds her, and the venom is used up', () => {
    const s = room();
    const c = mon(s.state, 'nh:cobra', 6, 2);
    let spat = 0;
    for (let i = 0; i < 400 && !hasProp(getPlayer(s.state), P.BLINDED); i++)
      if (spitmm(s.ctx, c.id, venom, s.state.playerId, clear)) spat++;
    expect(spat).toBeGreaterThan(0);
    expect(keys(s.ctx)).toContain('mthrow.spits');
    expect(keys(s.ctx)).toContain('mthrow.venom_blinds');
    expect(hasProp(getPlayer(s.state), P.BLINDED)).toBe(true);
    expect(heroHp(s.state)).toBe(5000); // blinding venom does no damage
    expect(venomLeft(s.state)).toBe(0);
  });

  test('it spits 1 time in (BOLT_LIM - distance)', () => {
    const s = room();
    const c = mon(s.state, 'nh:cobra', 6, 2); // distance 4: 1 in 4
    makeBlinded(s.ctx, 0, false);
    let spat = 0;
    for (let i = 0; i < 400; i++) if (spitmm(s.ctx, c.id, venom, s.state.playerId, clear)) spat++;
    expect(spat).toBeGreaterThan(60);
    expect(spat).toBeLessThan(140);
    expect(venomLeft(s.state)).toBe(0);
  });

  test('acid venom burns her, unless she resists acid; a cancelled cobra only rattles', () => {
    const s = room();
    const c = mon(s.state, 'nh:cobra', 6, 2);
    const acid = atk('spit', 'acid', 0, 0);
    for (let i = 0; i < 400; i++) spitmm(s.ctx, c.id, acid, s.state.playerId, clear);
    expect(keys(s.ctx)).toContain('mthrow.acid_burns');
    expect(heroHp(s.state)).toBeLessThan(5000);
    const t = room();
    setIntrinsic(getPlayer(t.state), P.ACID_RES, true);
    const d = mon(t.state, 'nh:cobra', 6, 2);
    for (let i = 0; i < 400; i++) spitmm(t.ctx, d.id, acid, t.state.playerId, clear);
    expect(keys(t.ctx)).toContain('mthrow.acid_no_hurt');
    expect(heroHp(t.state)).toBe(5000);
    setCancelled(t.ctx, d.id);
    t.ctx.events.length = 0;
    expect(spitmm(t.ctx, d.id, acid, t.state.playerId, clear)).toBe(false);
    expect(keys(t.ctx)).toEqual(['mthrow.dry_rattle']);
  });

  test('venom spat at a monster blinds it', () => {
    const s = room();
    const c = mon(s.state, 'nh:cobra', 7, 4);
    const j = mon(s.state, 'nh:jackal', 7, 1); // lined up in the column
    for (let i = 0; i < 400 && !mblinded(s.ctx, j.id); i++) spitmm(s.ctx, c.id, venom, j.id, clear);
    expect(mblinded(s.ctx, j.id)).toBeGreaterThanOrEqual(21);
    expect(keys(s.ctx)).toContain('mthrow.mon_blinded_venom');
    expect(venomLeft(s.state)).toBe(0);
  });
});
