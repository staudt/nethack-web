import { buildSnapshot, getPlayer, type Buc, type Ctx } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { P, hasProp, heroHas, isKnown, monNam, setIntrinsic, setItimeout } from '../src/index';
import { cpostfxOf } from '../src/givit';
import { uMaybeImpaired } from '../src/hackmove';
import { addMon } from './helpers';
import { defs, engine, levelSetup, plainKit, render } from './itemHelpers';

type Setup = ReturnType<typeof levelSetup>;

const setup = (seed = 1, rows?: string[]) => {
  const s = levelSetup(rows, seed);
  plainKit(s.state);
  return s;
};
const hero = (s: Setup) => getPlayer(s.state);
/** The test ctx is enough for these helpers, which only read, emit and roll. */
const ctxOf = (s: Setup): Ctx => s.ctx as unknown as Ctx;
const quaff = (s: Setup, def: string, buc: Buc = 'uncursed') => {
  const id = s.carry(def);
  s.state.entities[String(id)]!.c.item!.buc = buc;
  return s.mod('nh:quaff', { item: id });
};
const wait = (s: Setup) => s.step({ type: 'wait' });
const read = (s: Setup, def: string) => s.mod('nh:read', { item: s.carry(def) });

describe('blindness', () => {
  test('a potion of blindness blinds: no cell is visible and the status says Blind', () => {
    const s = setup();
    expect(s.state.visible.length).toBeGreaterThan(0);
    const r = quaff(s, 'nh:potion_of_blindness');
    expect(s.msgKeys(r)).toContain('blind.darkness');
    expect(heroHas(s.state, P.BLINDED)).toBe(true);
    expect(s.state.visible).toEqual([]);
    expect(buildSnapshot(defs, s.state).status['blind']).toBe(1);
    expect(isKnown(s.state, defs, defs.object('nh:potion_of_blindness'))).toBe(true);
  });

  test('it lasts rn1(200, 250 - 125 * bcsign) turns and ends with "You can see again."', () => {
    for (const [buc, lo, hi] of [
      ['blessed', 125, 324],
      ['uncursed', 250, 449],
      ['cursed', 375, 574],
    ] as const) {
      const s = setup();
      quaff(s, 'nh:potion_of_blindness', buc);
      const left = (hero(s).c.props?.[P.BLINDED]?.timeout ?? 0) - s.state.turn;
      expect(left).toBeGreaterThanOrEqual(lo - 1);
      expect(left).toBeLessThanOrEqual(hi);
    }
    const s = setup();
    setItimeout(s.state, hero(s), P.BLINDED, 1);
    expect(s.msgKeys(wait(s))).toContain('blind.see_again');
    expect(s.state.visible.length).toBeGreaterThan(0);
  });

  test('a second potion while blind gives the peculiar feeling and leaves the type unknown', () => {
    const s = setup();
    setItimeout(s.state, hero(s), P.BLINDED, 50);
    const r = quaff(s, 'nh:potion_of_blindness');
    expect(s.msgKeys(r)).toContain('potion.peculiar');
    expect(isKnown(s.state, defs, defs.object('nh:potion_of_blindness'))).toBe(false);
  });

  test('a carrot cures blindness', () => {
    const s = setup();
    setItimeout(s.state, hero(s), P.BLINDED, 100);
    const carrot = s.carry('nh:carrot');
    const r = s.mod('nh:eat', { item: carrot });
    expect(s.msgKeys(r)).toContain('blind.see_again');
    expect(hasProp(hero(s), P.BLINDED)).toBe(false);
  });

  test('an unseen monster is "it": "It bites!"', () => {
    const s = setup();
    const m = addMon(s.state, 'nh:jackal', 3, 1);
    setItimeout(s.state, hero(s), P.BLINDED, 100);
    wait(s);
    const mon = s.state.entities[String(m)]!;
    expect(monNam(s.ctx, mon)).toBe('@pronoun.it');
    let seen = false;
    for (let i = 0; i < 20 && !seen; i++) {
      const lines = s.text(wait(s));
      if (lines.includes('It bites!')) seen = true;
      expect(lines.some((l) => l.includes('jackal'))).toBe(false);
    }
    expect(seen).toBe(true);
  });

  test('a blind telepathic hero senses monsters with minds anywhere on the level', () => {
    const s = setup(1, ['.........', '..@......', '.........']);
    const jackal = addMon(s.state, 'nh:jackal', 8, 2, { asleep: true });
    const mold = addMon(s.state, 'nh:brown_mold', 8, 0, { asleep: true }); // mindless
    setIntrinsic(hero(s), P.TELEPAT, true);
    wait(s);
    let v = buildSnapshot(defs, s.state);
    expect(v.entities.some((e) => e.id === jackal)).toBe(true); // just seen (lit)
    setItimeout(s.state, hero(s), P.BLINDED, 100);
    wait(s);
    v = buildSnapshot(defs, s.state);
    expect(v.entities.some((e) => e.id === jackal)).toBe(true);
    expect(v.entities.some((e) => e.id === mold)).toBe(false);
    expect(monNam(s.ctx, s.state.entities[String(jackal)]!)).toBe('@nh:jackal');
  });
});

describe('confusion', () => {
  test('a potion of confusion: "Huh, What?  Where am I?" and Conf for rn1(7, 16 - 8 * bcsign)', () => {
    const s = setup();
    const r = quaff(s, 'nh:potion_of_confusion');
    expect(s.text(r)).toContain('Huh, What?  Where am I?');
    const left = (hero(s).c.props?.[P.CONFUSION]?.timeout ?? 0) - s.state.turn;
    expect(left).toBeGreaterThanOrEqual(15);
    expect(left).toBeLessThanOrEqual(22);
    expect(buildSnapshot(defs, s.state).status['conf']).toBe(1);
  });

  test('confusion impairs about 1 move in 5 (u_maybe_impaired)', () => {
    const s = setup();
    setItimeout(s.state, hero(s), P.CONFUSION, 1000);
    let n = 0;
    for (let i = 0; i < 2000; i++) if (uMaybeImpaired(ctxOf(s))) n++;
    expect(n / 2000).toBeGreaterThan(0.15);
    expect(n / 2000).toBeLessThan(0.25);
  });

  test('it wears off with "You feel less confused now."', () => {
    const s = setup();
    setItimeout(s.state, hero(s), P.CONFUSION, 1);
    expect(s.text(wait(s))).toContain('You feel less confused now.');
  });

  test('a confused identify scroll only identifies itself', () => {
    const s = setup();
    s.carry('nh:potion_of_healing');
    setItimeout(s.state, hero(s), P.CONFUSION, 50);
    const r = read(s, 'nh:scroll_of_identify');
    expect(s.text(r)).toContain('Being confused, you mispronounce the magic words...');
    expect(s.msgKeys(r)).toContain('identify.identify_this_as');
    expect(r.prompt).toBeNull();
    expect(isKnown(s.state, defs, defs.object('nh:scroll_of_identify'))).toBe(true);
    expect(isKnown(s.state, defs, defs.object('nh:potion_of_healing'))).toBe(false);
  });

  test('a confused enchant weapon scroll covers the weapon in a golden shield, no enchantment', () => {
    const s = setup();
    const spear = s.state.entities[String(s.byLetter('a'))]!.c.item!;
    const spe = spear.spe;
    setItimeout(s.state, hero(s), P.CONFUSION, 50);
    const r = read(s, 'nh:scroll_of_enchant_weapon');
    expect(s.text(r).some((l) => /is covered by a shimmering golden shield!$/.test(l))).toBe(true);
    expect(spear.spe).toBe(spe);
  });

  test('booze confuses (unless blessed) and feeds 10 * (2 + bcsign)', () => {
    const s = setup();
    const n0 = hero(s).c.hunger!.nutrition;
    const r = quaff(s, 'nh:potion_of_booze');
    expect(s.text(r)).toContain('Ooph!  This tastes like liquid fire!');
    expect(heroHas(s.state, P.CONFUSION)).toBe(true);
    expect(hero(s).c.hunger!.nutrition).toBeGreaterThanOrEqual(n0 + 20 - 2);
    const b = setup();
    quaff(b, 'nh:potion_of_booze', 'blessed');
    expect(heroHas(b.state, P.CONFUSION)).toBe(false);
  });
});

describe('hallucination', () => {
  test('a potion of hallucination: "Oh wow!  Everything looks so cosmic!" and Hallu', () => {
    const s = setup();
    const r = quaff(s, 'nh:potion_of_hallucination');
    expect(s.text(r)).toContain('Oh wow!  Everything looks so cosmic!');
    expect(buildSnapshot(defs, s.state).status['hallu']).toBe(1);
  });

  test('monsters look like random monsters, changing over turns; the hero does not', () => {
    const s = setup(1, ['.........', '..@......', '.........']);
    const m = addMon(s.state, 'nh:newt', 6, 1, { asleep: true });
    setItimeout(s.state, hero(s), P.HALLUC, 500);
    const shown = new Set<string>();
    for (let i = 0; i < 12; i++) {
      wait(s);
      const v = buildSnapshot(defs, s.state);
      const e = v.entities.find((x) => x.id === m);
      expect(defs.isMonster(e?.g ?? 'nh:x')).toBe(true);
      shown.add(e?.g ?? '');
      expect(v.entities.find((x) => x.id === s.state.playerId)?.g).toBe(hero(s).def);
    }
    expect(shown.size).toBeGreaterThan(3);
  });

  test('ends with "Everything looks SO boring now."', () => {
    const s = setup();
    setItimeout(s.state, hero(s), P.HALLUC, 1);
    expect(s.text(wait(s))).toContain('Everything looks SO boring now.');
  });

  test('a yellow mold corpse is "Great stuff!" (AD_STUN): 200 more turns of hallucination', () => {
    const s = setup();
    cpostfxOf(ctxOf(s), defs.monster('nh:yellow_mold'));
    expect(s.ctx.events.some((e) => e.type === 'msg' && e.key === 'givit.great_stuff')).toBe(true);
    expect((hero(s).c.props?.[P.HALLUC]?.timeout ?? 0) - s.state.turn).toBe(200);
  });

  test('replays stay deterministic: hallucinated glyphs use no RNG', () => {
    const a = setup(3);
    const b = setup(3);
    for (const s of [a, b]) {
      addMon(s.state, 'nh:newt', 4, 1, { asleep: true });
      setItimeout(s.state, hero(s), P.HALLUC, 500);
    }
    for (let i = 0; i < 5; i++) {
      wait(a);
      wait(b);
    }
    expect(JSON.stringify(buildSnapshot(defs, a.state))).toBe(
      JSON.stringify(buildSnapshot(defs, b.state)),
    );
    expect(a.state.rng).toEqual(b.state.rng);
  });
});

describe('sleeping', () => {
  test('falls asleep for rn1(10, 25 - 12 * bcsign) turns unless sleep resistant', () => {
    const s = setup();
    const t0 = s.state.turn;
    const r = quaff(s, 'nh:potion_of_sleeping');
    // the whole sleep passes within the step (monsters act meanwhile)
    expect(s.text(r)).toContain('You suddenly fall asleep!');
    expect(s.text(r)).toContain('You wake up.');
    expect(s.state.turn - t0).toBeGreaterThanOrEqual(25 - 1);
    expect(s.state.turn - t0).toBeLessThanOrEqual(35 + 1);
    const t = setup();
    setIntrinsic(hero(t), P.SLEEP_RES, true);
    expect(t.text(quaff(t, 'nh:potion_of_sleeping'))).toContain('You yawn.');
    expect(t.text(quaff(t, 'nh:potion_of_sleeping'))).not.toContain('You wake up.');
  });
});

describe('render helpers', () => {
  test('{mon|The}, {mon|the_s} with names and with "it"', () => {
    const cat = { t: '{mon|The} bites {x|the}. {mon|The_s} acid!', 'pronoun.it': 'it', n: 'newt' };
    expect(render({ key: 't', params: { mon: '@n', x: '@n' } }, cat)).toBe(
      "The newt bites the newt. The newt's acid!",
    );
    expect(render({ key: 't', params: { mon: '@pronoun.it', x: '@n' } }, cat)).toBe(
      'It bites the newt. Its acid!',
    );
  });

  test('the engine still runs a whole game with these props', () => {
    const s = setup();
    setItimeout(s.state, hero(s), P.BLINDED, 30);
    setItimeout(s.state, hero(s), P.CONFUSION, 30);
    setItimeout(s.state, hero(s), P.HALLUC, 30);
    for (let i = 0; i < 40; i++) engine.step(s.state, { type: 'wait' });
    expect(heroHas(s.state, P.BLINDED)).toBe(false);
  });
});
