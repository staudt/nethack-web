import {
  getPlayer,
  rnl,
  createRng,
  newRngStates,
  type Ctx,
  type DefId,
  type GameState,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import {
  LUCKMAX,
  LUCKMIN,
  adjalign,
  alignLim,
  changeLuck,
  initedog,
  luckOf,
  malign,
  setU,
  uState,
  xkilledPenalties,
} from '../src/index';
import { heroToHit } from '../src/combat';
import { addMon, setup } from './helpers';
import { ctxFor, defs } from './itemHelpers';

const ROOM = ['-------', '|.....|', '|.@...|', '|.....|', '-------'];
const ctxOf = (state: GameState): Ctx & { events: { type: string; key?: string }[] } =>
  Object.assign(ctxFor(state), { interrupt() {}, endGame() {} }) as never;
const keys = (ctx: ReturnType<typeof ctxOf>): string[] =>
  ctx.events.flatMap((e) => (e.type === 'msg' && e.key ? [e.key] : []));
const def = (id: string) => defs.monster(id as DefId);

describe('Luck', () => {
  test('starts at 0, with prayer timeout 300 and a 0 alignment record', () => {
    const s = setup(ROOM);
    expect(uState(s.state)).toMatchObject({ luck: 0, alignRecord: 0, ugangr: 0 });
    // 300 at the start, counting down a turn at a time
    expect(uState(s.state).ublesscnt).toBe(300 - (s.state.turn - 1));
  });

  test('change_luck clamps to -10..10', () => {
    const s = setup(ROOM);
    changeLuck(s, 25);
    expect(luckOf(s.state)).toBe(LUCKMAX);
    changeLuck(s, -40);
    expect(luckOf(s.state)).toBe(LUCKMIN);
  });

  test('times out toward 0 by one every 600 turns (300 while the god is angry)', () => {
    const s = setup(ROOM);
    changeLuck(s, 3);
    while (s.state.turn % 600 !== 599) s.state.turn++;
    s.wait();
    expect(luckOf(s.state)).toBe(2);
    setU(s, { ugangr: 1, luck: -2 });
    while (s.state.turn % 300 !== 299) s.state.turn++;
    s.wait();
    expect(luckOf(s.state)).toBe(-1);
  });

  test('rnl() skews toward 0 with good Luck and away with bad', () => {
    const avg = (luck: number): number => {
      const rng = createRng(newRngStates(7).core);
      let sum = 0;
      for (let i = 0; i < 4000; i++) sum += rnl(rng, 7, luck);
      return sum / 4000;
    };
    expect(avg(10)).toBeLessThan(avg(0) - 1);
    expect(avg(-10)).toBeGreaterThan(avg(0) + 1);
  });

  test('to-hit gains sgn(Luck) * ((|Luck| + 2) / 3)', () => {
    const hero = { str: 16, dex: 10, level: 1 };
    const base = heroToHit(hero, def('nh:newt'), { asleep: false }, null);
    expect(heroToHit({ ...hero, luck: 10 }, def('nh:newt'), { asleep: false }, null)).toBe(
      base + 4,
    );
    expect(heroToHit({ ...hero, luck: -1 }, def('nh:newt'), { asleep: false }, null)).toBe(
      base - 1,
    );
  });
});

describe('alignment', () => {
  test('adjalign: raises up to ALIGNLIM (10 + turns / 200), lowers freely', () => {
    const s = setup(ROOM);
    adjalign(s, 100);
    expect(uState(s.state).alignRecord).toBe(alignLim(s.state));
    adjalign(s, -30);
    expect(uState(s.state).alignRecord).toBe(alignLim(s.state) - 30);
  });

  test('malign (set_malign) for a neutral hero', () => {
    // always hostile and cross-aligned: max(5, |mal|); co-aligned: 0
    expect(malign(def('nh:jackal'), false, 0)).toBe(0); // jackals are unaligned (0) = co-aligned
    expect(malign(def('nh:hill_orc'), false, 0)).toBe(4); // not M2_HOSTILE, cross-aligned: |mal|
    // a peaceful co-aligned monster is bad to kill
    expect(malign({ ...def('nh:dwarf'), flags: [], alignment: 0 }, true, 0)).toBe(-9);
  });

  test('killing a peaceful: -5 (and its malign), and Luck -1 half the time', () => {
    let lostLuck = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = setup(ROOM, seed);
      const ctx = ctxOf(s.state);
      const d = addMon(s.state, 'nh:dwarf', 3, 2, { peaceful: true });
      xkilledPenalties(ctx, s.state.entities[String(d)]!);
      const u = uState(s.state);
      expect(u.alignRecord).toBeLessThan(0);
      if (u.luck === -1) lostLuck++;
    }
    expect(lostLuck).toBeGreaterThan(8);
    expect(lostLuck).toBeLessThan(32);
  });

  test('killing your pet: alignment -15, Luck -1, "You hear the rumble of distant thunder..."', () => {
    const s = setup(ROOM);
    const ctx = ctxOf(s.state);
    const k = addMon(s.state, 'nh:kitten', 3, 2);
    initedog(ctx, k, true);
    xkilledPenalties(ctx, s.state.entities[String(k)]!);
    expect(uState(s.state).luck).toBe(-1);
    expect(uState(s.state).alignRecord).toBeLessThanOrEqual(-15);
    expect(keys(ctx)).toContain('luck.thunder');
  });

  test('angering a peaceful costs a point of alignment', () => {
    const s = setup(ROOM);
    const d = addMon(s.state, 'nh:dwarf', 3, 2, { peaceful: true });
    s.state.entities[String(d)]!.c.hp = { cur: 500, max: 500 };
    const r = s.engine.step(s.state, {
      type: 'mod',
      action: 'nh:fight' as DefId,
      args: { dir: 'e' },
    });
    s.engine.step(s.state, { type: 'answer', promptId: r.prompt!.id, value: true });
    expect(uState(s.state).alignRecord).toBe(-1);
    expect(s.state.entities[String(d)]!.c.monster!.peaceful).toBe(false);
  });

  test('the hero keeps her alignment type', () => {
    const s = setup(ROOM);
    expect(uState(s.state).alignType).toBe(0);
    expect(getPlayer(s.state).def).toBe('nh:valkyrie');
  });
});
