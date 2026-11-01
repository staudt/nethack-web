import { getPlayer, type Ctx, type GameState } from '@nh/core';
import { describe, expect, test } from 'vitest';
import {
  M_ATTK,
  P,
  dochug,
  growUp,
  isFrozen,
  isMStunned,
  mattackm,
  mondied,
  setItimeout,
} from '../src/index';
import { addMon, setup } from './helpers';
import { ctxFor, render } from './itemHelpers';

const ROOM = ['---------', '|.......|', '|.@.....|', '|.......|', '---------'];

/** A full enough ctx for the fight functions (they emit, roll, remove and spawn). */
function fightCtx(state: GameState): Ctx & { events: { type: string; key?: string }[] } {
  return Object.assign(ctxFor(state), { interrupt() {}, endGame() {} }) as never;
}

const keys = (ctx: ReturnType<typeof fightCtx>): string[] =>
  ctx.events.flatMap((e) => (e.type === 'msg' && e.key ? [e.key] : []));
const texts = (ctx: ReturnType<typeof fightCtx>): string[] =>
  ctx.events.flatMap((e) => (e.type === 'msg' ? [render(e as never)] : []));

function pair(seed: number, agr: string, def: string, o: { hp?: number; level?: number } = {}) {
  const t = setup(ROOM, seed);
  const a = addMon(t.state, agr, 4, 2);
  const d = addMon(t.state, def, 5, 2);
  const de = t.state.entities[String(d)]!;
  de.c.hp = { cur: o.hp ?? 1000, max: o.hp ?? 1000 };
  const ae = t.state.entities[String(a)]!;
  ae.c.monster!.level = o.level ?? 1;
  ae.c.hp = { cur: 20, max: 20 };
  t.wait(); // see them
  return { ...t, a, d, ctx: fightCtx(t.state) };
}

describe('mattackm', () => {
  test('a visible fight: "The jackal bites the newt." and "The jackal misses the newt."', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const t = pair(seed, 'nh:jackal', 'nh:newt');
      const r = mattackm(t.ctx, t.a, t.d);
      for (const x of texts(t.ctx)) seen.add(x);
      if (r & M_ATTK.HIT) expect(texts(t.ctx)).toContain('The jackal bites the newt.');
    }
    expect(seen).toContain('The jackal bites the newt.');
    expect(seen).toContain('The jackal misses the newt.');
  });

  test('the to-hit is AC + level against rnd(20 + i), +4 against a sleeping target', () => {
    const rate = (asleep: boolean): number => {
      let hits = 0;
      for (let seed = 1; seed <= 400; seed++) {
        const t = pair(seed, 'nh:jackal', 'nh:newt');
        t.state.entities[String(t.d)]!.c.monster!.asleep = asleep;
        if (mattackm(t.ctx, t.a, t.d) & M_ATTK.HIT) hits++;
      }
      return hits / 400;
    };
    // newt AC 8 + level 1 = 9 > rnd(20): 8/20; asleep 13 > rnd(20): 12/20
    expect(Math.abs(rate(false) - 0.4)).toBeLessThan(0.07);
    expect(Math.abs(rate(true) - 0.6)).toBeLessThan(0.07);
  });

  test('attacking wakes a sleeping target', () => {
    const t = pair(1, 'nh:jackal', 'nh:newt');
    t.state.entities[String(t.d)]!.c.monster!.asleep = true;
    mattackm(t.ctx, t.a, t.d);
    expect(t.state.entities[String(t.d)]!.c.monster!.asleep).toBe(false);
  });

  test('a kill: "The newt is killed!", it is gone, the killer may grow, a corpse may be left', () => {
    let corpses = 0;
    let kills = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const t = pair(seed, 'nh:jackal', 'nh:newt', { hp: 1 });
      const r = mattackm(t.ctx, t.a, t.d);
      if (!(r & M_ATTK.DEF_DIED)) continue;
      kills++;
      expect(texts(t.ctx)).toContain('The newt is killed!');
      expect(t.state.entities[String(t.d)]).toBeUndefined();
      const corpse = Object.values(t.state.entities).some(
        (e) => e.c.item?.corpseOf === 'nh:newt' && e.c.pos?.x === 5,
      );
      if (corpse) corpses++;
    }
    expect(kills).toBeGreaterThan(10);
    expect(corpses).toBeGreaterThan(0);
    expect(corpses).toBeLessThan(kills);
  });

  test('a fight the hero cannot see is heard: "You hear some noises."', () => {
    const t = pair(2, 'nh:jackal', 'nh:newt');
    setItimeout(t.state, getPlayer(t.state), P.BLINDED, 100);
    t.wait();
    const ctx = fightCtx(t.state);
    mattackm(ctx, t.a, t.d);
    const k = keys(ctx);
    expect(k.filter((x) => x.startsWith('mhitm.noises'))).toHaveLength(1);
    expect(k.some((x) => x === 'mhitm.bites' || x === 'mhitm.misses')).toBe(false);
    // not again within 10 turns
    const again = fightCtx(t.state);
    mattackm(again, t.a, t.d);
    expect(keys(again).some((x) => x.startsWith('mhitm.noises'))).toBe(false);
  });

  test("a homunculus's sleep bite puts the target to sleep for a while", () => {
    let slept = false;
    for (let seed = 1; seed <= 60 && !slept; seed++) {
      const t = pair(seed, 'nh:homunculus', 'nh:jackal', { level: 5 });
      mattackm(t.ctx, t.a, t.d);
      if (isFrozen({ state: t.state }, t.d)) {
        slept = true;
        // NetHack's `sleep_monst() && sleep_monst()`: the second call finds it already unable to
        // move and fails, so the target falls asleep without the message
        expect(keys(t.ctx)).not.toContain('mhitm.put_to_sleep');
      }
    }
    expect(slept).toBe(true);
  });

  test('hitting a floating eye may freeze the attacker; it then does nothing', () => {
    let frozen = false;
    for (let seed = 1; seed <= 80 && !frozen; seed++) {
      const t = pair(seed, 'nh:jackal', 'nh:floating_eye', { level: 3 });
      const r = mattackm(t.ctx, t.a, t.d);
      if (!(r & M_ATTK.HIT) || !isFrozen({ state: t.state }, t.a)) continue;
      frozen = true;
      expect(keys(t.ctx)).toContain('mhitm.frozen_gaze');
      const before = { ...t.state.entities[String(t.a)]!.c.pos! };
      dochug(t.ctx, t.a);
      expect(t.state.entities[String(t.a)]!.c.pos).toEqual(before);
      // an attack by a frozen monster misses
      expect(mattackm(t.ctx, t.a, t.d)).toBe(M_ATTK.MISS);
    }
    expect(frozen).toBe(true);
  });

  test('hitting a yellow mold may stun the attacker', () => {
    let stunned = false;
    for (let seed = 1; seed <= 80 && !stunned; seed++) {
      const t = pair(seed, 'nh:jackal', 'nh:yellow_mold', { level: 3 });
      mattackm(t.ctx, t.a, t.d);
      if (isMStunned({ state: t.state }, t.a)) stunned = true;
    }
    expect(stunned).toBe(true);
  });
});

describe('growUp and mondied', () => {
  test('a kill adds hit points up to the level threshold, then a level', () => {
    const t = pair(1, 'nh:jackal', 'nh:newt');
    const j = t.state.entities[String(t.a)]!;
    j.c.monster!.level = 0;
    j.c.hp = { cur: 4, max: 4 };
    // level 0: threshold 4, so any gain passes it and gives a level
    growUp(t.ctx, t.a, 3);
    expect(j.c.monster!.level).toBe(1);
    expect(j.c.hp!.max).toBe(5);
    // level 1: threshold 8
    j.c.hp = { cur: 5, max: 5 };
    growUp(t.ctx, t.a, 0);
    expect(j.c.monster!.level).toBe(1);
    expect(j.c.hp!.max).toBe(6);
  });

  test('mondied drops the monster and leaves a corpse by corpse_chance', () => {
    let corpses = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const t = pair(seed, 'nh:jackal', 'nh:newt');
      mondied(t.ctx, t.d);
      expect(t.state.entities[String(t.d)]).toBeUndefined();
      if (Object.values(t.state.entities).some((e) => e.c.item?.corpseOf === 'nh:newt')) corpses++;
    }
    // newts are tiny: 1 in 3
    expect(corpses).toBeGreaterThan(8);
    expect(corpses).toBeLessThan(35);
  });
});
