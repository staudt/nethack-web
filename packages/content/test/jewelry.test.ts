// Rings and amulets: P and R, and each ported effect while worn.
import { getPlayer, type EntityId, type GameState, type StepResult } from '@nh/core';
import { describe, expect, test } from 'vitest';
import {
  JEWELRY_CLASSES,
  P,
  T,
  adjattrib,
  findAc,
  hasProp,
  heroAttack,
  inTrouble,
  isStrangled,
  mdamageu,
  ringBonus,
  ringGone,
  shuffleAll,
  telepathSenses,
  updateWornProps,
} from '../src/index';
import { magicNegation } from '../src/mhitu';
import { addMon } from './helpers';
import { ctxFor, defs, engine, itemOf, levelSetup, plainKit, render } from './itemHelpers';

type S = ReturnType<typeof levelSetup>;

/** Rings and amulets are known by name here; identification tests shuffle them again. */
function make(rows?: string[], seed = 1): S {
  const s = levelSetup(rows, seed);
  plainKit(s.state);
  for (const d of defs.objects)
    if (d.class === 'ring' || d.class === 'amulet') delete s.state.appearances[d.id];
  return s;
}
const hero = (s: S) => getPlayer(s.state);
/** A carried ring or amulet with a fixed enchantment and BUC. */
function jewel(s: S, id: string, spe = 0, buc: 'uncursed' | 'cursed' = 'uncursed'): EntityId {
  const e = s.carry(id);
  const it = itemOf(s.state, e);
  it.spe = spe;
  it.buc = buc;
  return e;
}
const answer = (s: S, value: unknown): StepResult => {
  const p = s.state.pendingPrompt?.prompt;
  if (!p) throw new Error('no prompt');
  return engine.step(s.state, { type: 'answer', promptId: p.id, value: value as never });
};
/** Puts on a ring on the given hand (or an amulet). */
function putOn(s: S, id: EntityId, hand: 'l' | 'r' = 'l'): string[] {
  const r = s.mod('nh:puton', { item: id });
  if (!s.state.pendingPrompt) return s.text(r);
  return s.text(answer(s, hand));
}
const remove = (s: S, id: EntityId): StepResult => s.mod('nh:remove', { item: id });
const name = (s: S, id: EntityId) => render(defs.itemName(s.state, s.state.entities[String(id)]!));
/** A context that can end the game, over the setup's state. */
function fullCtx(state: GameState) {
  return Object.assign(ctxFor(state), {
    interrupt() {},
    endGame(over: NonNullable<GameState['gameOver']>) {
      state.gameOver = over;
    },
    ask() {},
  }) as unknown as Parameters<typeof mdamageu>[0];
}
const offers = (s: S, id: EntityId) =>
  engine
    .query(s.state)
    .actionsFor({ kind: 'item', id })
    .flatMap((o) => (o.action.type === 'mod' ? [o.action.action as string] : []));

describe('P and R', () => {
  test('the hand prompt can be cancelled for free; a ring goes on the chosen hand', () => {
    const s = make();
    const ring = jewel(s, 'nh:ring_of_fire_resistance');
    expect(offers(s, ring)).toContain('nh:puton');
    expect(offers(s, ring)).not.toContain('nh:remove');
    const turn = s.state.turn;
    s.mod('nh:puton', { item: ring });
    expect(s.state.pendingPrompt?.prompt.options?.map((o) => o.value)).toEqual(['r', 'l']);
    answer(s, null);
    expect(s.state.turn).toBe(turn);
    expect(itemOf(s.state, ring).equipped).toBeNull();
    const text = putOn(s, ring, 'l');
    expect(s.state.turn).toBe(turn + 1);
    expect(itemOf(s.state, ring).equipped).toBe('ringL');
    expect(text.at(-1)).toMatch(/ - a ring of fire resistance \(on left hand\)\.$/);
    expect(offers(s, ring)).toEqual(expect.arrayContaining(['nh:remove']));
  });

  test('the second ring goes on the free hand without asking; no third ring', () => {
    const s = make();
    const a = jewel(s, 'nh:ring_of_searching');
    const b = jewel(s, 'nh:ring_of_hunger');
    const c = jewel(s, 'nh:ring_of_free_action');
    putOn(s, a, 'r');
    s.mod('nh:puton', { item: b });
    expect(s.state.pendingPrompt).toBeNull();
    expect(itemOf(s.state, b).equipped).toBe('ringL');
    expect(offers(s, c)).not.toContain('nh:puton');
    expect(s.text(s.mod('nh:puton', { item: c }))).toEqual([
      'There are no more ring-fingers to fill.',
    ]);
  });

  test('a cursed ring cannot be removed and costs no time', () => {
    const s = make();
    const ring = jewel(s, 'nh:ring_of_hunger', 0, 'cursed');
    putOn(s, ring);
    const turn = s.state.turn;
    expect(s.text(remove(s, ring))).toEqual(["You can't.  It is cursed."]);
    expect(s.state.turn).toBe(turn);
    expect(itemOf(s.state, ring).equipped).toBe('ringL');
    expect(itemOf(s.state, ring).known.buc).toBe(true);
  });

  test('cursed gloves stop rings going on (time used only when the curse is learned)', () => {
    const s = make();
    const gloves = s.carry('nh:leather_gloves');
    itemOf(s.state, gloves).buc = 'cursed';
    itemOf(s.state, gloves).equipped = 'gloves';
    const ring = jewel(s, 'nh:ring_of_hunger');
    const turn = s.state.turn;
    expect(putOn(s, ring)).toEqual(['You cannot remove your gloves to put on the ring.']);
    expect(s.state.turn).toBe(turn + 1);
    expect(putOn(s, ring)).toEqual(['You cannot remove your gloves to put on the ring.']);
    expect(s.state.turn).toBe(turn + 1);
    expect(itemOf(s.state, ring).equipped).toBeNull();
  });

  test('a property is there while the ring is worn and gone after removal', () => {
    const s = make();
    const ring = jewel(s, 'nh:ring_of_fire_resistance');
    expect(hasProp(hero(s), P.FIRE_RES)).toBe(false);
    putOn(s, ring);
    expect(hasProp(hero(s), P.FIRE_RES)).toBe(true);
    expect(s.text(remove(s, ring))).toEqual([
      'You were wearing a ring of fire resistance (on left hand).',
    ]);
    expect(hasProp(hero(s), P.FIRE_RES)).toBe(false);
    expect(hero(s).c.props?.['fire_res:worn']).toBeUndefined();
  });

  test('an unidentified ring of gain strength is learned from the Str change', () => {
    const s = make();
    shuffleAll(fullCtx(s.state), JEWELRY_CLASSES);
    const ring = jewel(s, 'nh:ring_of_gain_strength', 2);
    expect(name(s, ring)).toMatch(/^[a-z ]+ ring$/);
    const a = hero(s).c.attributes!;
    a.str = 16;
    putOn(s, ring, 'r');
    expect(a.str).toBe(18);
    expect(name(s, ring)).toBe('+2 ring of gain strength (on right hand)');
    remove(s, ring);
    expect(a.str).toBe(16);
  });
});

describe('ring effects', () => {
  test('protection lowers AC by its enchantment and adds 1 to MC', () => {
    const s = make();
    const ac = findAc(s.state, defs, s.state.playerId);
    const mc = magicNegation(fullCtx(s.state));
    const ring = jewel(s, 'nh:ring_of_protection', 3);
    putOn(s, ring);
    expect(findAc(s.state, defs, s.state.playerId)).toBe(ac - 3);
    expect(magicNegation(fullCtx(s.state))).toBe(mc + 1);
    remove(s, ring);
    expect(findAc(s.state, defs, s.state.playerId)).toBe(ac);
  });

  test('adornment and gain constitution change Cha and Con', () => {
    const s = make();
    const a = hero(s).c.attributes!;
    a.cha = 10;
    a.con = 12;
    const r1 = jewel(s, 'nh:ring_of_adornment', 3);
    const r2 = jewel(s, 'nh:ring_of_gain_constitution', -2);
    putOn(s, r1, 'l');
    putOn(s, r2);
    expect([a.cha, a.con]).toEqual([13, 10]);
    remove(s, r1);
    remove(s, r2);
    expect([a.cha, a.con]).toEqual([10, 12]);
  });

  test('a ring destroyed while worn takes its bonus with it (Ring_gone)', () => {
    const s = make();
    const a = hero(s).c.attributes!;
    a.cha = 10;
    const ring = jewel(s, 'nh:ring_of_adornment', 2);
    putOn(s, ring);
    ringGone(fullCtx(s.state), s.state.entities[String(ring)]!);
    expect(a.cha).toBe(10);
    expect(itemOf(s.state, ring).equipped).toBeNull();
  });

  test('increase accuracy adds to u.uhitinc', () => {
    const s = make();
    putOn(s, jewel(s, 'nh:ring_of_increase_accuracy', 3), 'l');
    putOn(s, jewel(s, 'nh:ring_of_increase_accuracy', 1));
    expect(ringBonus(s.state, 'nh:ring_of_increase_accuracy')).toBe(4);
  });

  test('increase damage adds its enchantment to a melee hit', () => {
    let checked = 0;
    for (let seed = 1; seed <= 30 && checked < 3; seed++) {
      const hits: number[] = [];
      for (const wear of [false, true]) {
        const s = make(['.....', '..@..', '.....'], seed);
        const ring = jewel(s, 'nh:ring_of_increase_damage', 4);
        if (wear) {
          itemOf(s.state, ring).equipped = 'ringL';
          updateWornProps(s.state, defs, s.state.playerId);
        }
        const mon = addMon(s.state, 'nh:lichen', 3, 1, { asleep: true });
        s.state.entities[String(mon)]!.c.hp = { cur: 200, max: 200 };
        heroAttack(fullCtx(s.state), mon);
        hits.push(200 - (s.state.entities[String(mon)]?.c.hp?.cur ?? 200));
      }
      if (!hits[0]) continue;
      expect(hits[1]).toBe((hits[0] ?? 0) + 4);
      checked++;
    }
    expect(checked).toBe(3);
  });

  test('regeneration heals at least 1 point every turn', () => {
    const s = make();
    putOn(s, jewel(s, 'nh:ring_of_regeneration'));
    const hp = hero(s).c.hp!;
    hp.cur = 100;
    for (let i = 0; i < 10; i++) {
      s.step({ type: 'search' });
      // randomly spawned monsters are removed before they can attack
      for (const e of Object.values(s.state.entities))
        if (e.c.monster) delete s.state.entities[String(e.id)];
    }
    expect(hp.cur).toBeGreaterThanOrEqual(110);
  });

  test('slow digestion stops the turn-by-turn burn; hunger speeds it up', () => {
    const burn = (ring: string | null): number => {
      const s = make();
      if (ring) putOn(s, jewel(s, ring));
      const h = hero(s).c.hunger!;
      h.nutrition = 900;
      for (let i = 0; i < 60; i++) s.step({ type: 'search' });
      return 900 - h.nutrition;
    };
    const plain = burn(null);
    expect(plain).toBeGreaterThanOrEqual(60);
    expect(burn('nh:ring_of_slow_digestion')).toBeLessThan(20);
    expect(burn('nh:ring_of_hunger')).toBeGreaterThan(plain);
  });

  test('searching finds a hidden passage without the search command', () => {
    const s = make(['.....', '..@..', '.....']);
    const level = s.state.levels['dlvl1']!;
    let pi = level.palette.indexOf(T.scorr);
    if (pi === -1) pi = level.palette.push(T.scorr) - 1;
    level.cells[1 * level.width + 3] = pi;
    putOn(s, jewel(s, 'nh:ring_of_searching'));
    for (let i = 0; i < 40 && level.palette[level.cells[1 * level.width + 3]!] === T.scorr; i++)
      s.step({ type: 'wait' });
    expect(level.palette[level.cells[1 * level.width + 3]!]).not.toBe(T.scorr);
  });

  test('sustain ability keeps attributes from changing', () => {
    const s = make();
    putOn(s, jewel(s, 'nh:ring_of_sustain_ability'));
    const a = hero(s).c.attributes!;
    const before = a.str;
    expect(adjattrib(fullCtx(s.state), 'str', -2, true)).toBe(false);
    expect(a.str).toBe(before);
  });

  test('aggravate monster makes sleeping monsters in view always wake', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const s = make(['.........', '..@......', '.........'], seed);
      putOn(s, jewel(s, 'nh:ring_of_aggravate_monster'));
      const mon = addMon(s.state, 'nh:newt', 6, 1, { asleep: true, energy: 12 });
      s.step({ type: 'search' });
      expect(s.state.entities[String(mon)]?.c.monster?.asleep, `seed ${seed}`).toBe(false);
    }
  });

  test('free action: the potion of sleeping only makes you yawn', () => {
    const s = make();
    putOn(s, jewel(s, 'nh:ring_of_free_action'));
    const pot = s.carry('nh:potion_of_sleeping');
    itemOf(s.state, pot).buc = 'uncursed';
    expect(s.text(s.mod('nh:quaff', { item: pot }))).toContain('You yawn.');
    expect(hero(s).c.helpless).toBeUndefined();
  });
});

describe('amulets', () => {
  test('ESP senses minded monsters nearby while not blind', () => {
    const s = make(['....................', '..@.................']);
    const amul = jewel(s, 'nh:amulet_of_esp');
    const near = addMon(s.state, 'nh:jackal', 9, 1);
    const far = addMon(s.state, 'nh:jackal', 15, 1);
    const sense = (id: EntityId) => telepathSenses(s.state, defs, s.state.entities[String(id)]!);
    expect(sense(near)).toBe(false);
    expect(putOn(s, amul).at(-1)).toMatch(/amulet of ESP \(being worn\)\.$/);
    expect(sense(near)).toBe(true);
    expect(sense(far)).toBe(false);
  });

  test('life saving stops a death once, and crumbles', () => {
    const s = make();
    const amul = jewel(s, 'nh:amulet_of_life_saving');
    putOn(s, amul);
    const ctx = fullCtx(s.state);
    const con = hero(s).c.attributes!.con;
    mdamageu(ctx, 1000, '@nh:newt');
    expect(s.state.gameOver).toBeNull();
    expect(hero(s).c.hp!.cur).toBeGreaterThan(0);
    expect(s.state.entities[String(amul)]).toBeUndefined();
    expect(hasProp(hero(s), P.LIFESAVED)).toBe(false);
    expect(hero(s).c.attributes!.con).toBe(con - 1);
    expect(s.state.discovered).toContain('nh:amulet_of_life_saving');
    mdamageu(ctx, 1000, '@nh:newt');
    expect(s.state.gameOver?.kind).toBe('died');
  });

  test('strangulation kills after six turns; prayer counts it as major trouble', () => {
    const s = make();
    const text = putOn(s, jewel(s, 'nh:amulet_of_strangulation'));
    expect(text.at(-1)).toBe('It constricts your throat!');
    expect(isStrangled(hero(s))).toBe(true);
    expect(inTrouble(fullCtx(s.state))).toBe(12);
    for (let i = 0; i < 10 && !s.state.gameOver; i++) s.step({ type: 'search' });
    expect(s.state.gameOver?.killer).toBe('@killer.strangulation');
  });

  test('taking the strangling amulet off in time saves you', () => {
    const s = make();
    const amul = jewel(s, 'nh:amulet_of_strangulation');
    putOn(s, amul);
    s.step({ type: 'search' });
    const text = s.text(remove(s, amul));
    expect(text.at(-1)).toBe('You can breathe more easily!');
    for (let i = 0; i < 10; i++) s.step({ type: 'search' });
    expect(s.state.gameOver).toBeNull();
    expect(isStrangled(hero(s))).toBe(false);
  });

  test('restful sleep sets a nap timer; versus poison and reflection give their property', () => {
    const s = make();
    const sleep = jewel(s, 'nh:amulet_of_restful_sleep');
    putOn(s, sleep);
    expect(hero(s).c.props?.[P.SLEEPY]?.timeout ?? 0).toBeGreaterThan(s.state.turn);
    remove(s, sleep);
    expect(hasProp(hero(s), P.SLEEPY)).toBe(false);
    const vp = jewel(s, 'nh:amulet_versus_poison');
    putOn(s, vp);
    expect(hasProp(hero(s), P.POISON_RES)).toBe(true);
    remove(s, vp);
    putOn(s, jewel(s, 'nh:amulet_of_reflection'));
    expect(hasProp(hero(s), P.REFLECTING)).toBe(true);
  });

  test('the imitation Amulet of Yendor', () => {
    const s = make();
    const fake = s.carry('nh:fake_amulet_of_yendor');
    itemOf(s.state, fake).buc = 'uncursed';
    itemOf(s.state, fake).known.buc = true;
    expect(name(s, fake)).toBe('the Amulet of Yendor');
    itemOf(s.state, fake).known.spe = true;
    expect(name(s, fake)).toBe('cheap plastic imitation of the Amulet of Yendor');
  });
});
