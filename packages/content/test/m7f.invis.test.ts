// m7f-b step 2: invisible things. The five objects, invisible monsters (hidden on a visible
// square, seen with see invisible, still sensed by telepathy), the invisible hero (drawn unseen,
// the mummy wrapping), and each source: wand, potions, rings, cloak, magic trap, attrcurse,
// enlightenment, probing and wizard genesis. Outcomes are asserted; random rolls are forced or
// searched.
import {
  buildSnapshot,
  getPlayer,
  type Ctx,
  type DefId,
  type EntityId,
  type GameEvent,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { enlightenment } from '../src/enlightenment';
import {
  REMEMBERED_UNSEEN,
  canseemon,
  cantSeeSelf,
  heroInvisible,
  mapInvisible,
  monInvisible,
  monVisible,
  seeInvisible,
  setMinvis,
  unmapInvisible,
} from '../src/invis';
import { magicTrapFate } from '../src/magictrap';
import { mDoWear } from '../src/mongear';
import { canSpotMon, monNam } from '../src/perception';
import { attrcurse } from '../src/pray';
import { P, hasIntrinsic, hasProp, setIntrinsic, setItimeout, timeoutLeft } from '../src/props';
import { forgetMState } from '../src/mstate';
import { isKnown } from '../src/o_init';
import { createParticular, parseGenesis } from '../src/wizard/genesis';
import { addMon } from './helpers';
import { defs, engine, itemOf, levelSetup, plainKit, render } from './itemHelpers';

type S = ReturnType<typeof levelSetup>;

const ROOM = ['           ', ' ......... ', ' ..@...... ', ' ......... ', '           '];

/** A lit room with no monsters. */
function make(seed = 1): S {
  const s = levelSetup(ROOM, seed);
  plainKit(s.state);
  for (const k of Object.keys(s.state.entities))
    if (s.state.entities[k]?.c.monster) delete s.state.entities[k];
  s.step({ type: 'wait' });
  return s;
}
const hero = (s: S) => getPlayer(s.state);
const textOf = (r: StepResult): string[] =>
  r.events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );
const answer = (s: S, value: unknown): StepResult => {
  const p = s.state.pendingPrompt?.prompt;
  if (!p) throw new Error('no prompt');
  return engine.stepAll(s.state, { type: 'answer', promptId: p.id, value: value as never });
};
/** Zaps a wand (5 charges); directional ones get `dir`. */
function zap(s: S, wand: DefId, dir: string): string[] {
  const id = s.carry(wand);
  itemOf(s.state, id).spe = 5;
  const out = s.text(s.mod('nh:zap', { item: id }));
  return s.state.pendingPrompt ? [...out, ...textOf(answer(s, dir))] : out;
}
/** A pinned monster (speed 0, awake) at x,y. */
function pinned(s: S, def: string, x: number, y: number): EntityId {
  const id = addMon(s.state, def, x, y);
  const e = s.state.entities[String(id)]!;
  e.c.hp = { cur: 100, max: 100 };
  e.c.actor!.speed = 0;
  return id;
}
const ent = (s: S, id: EntityId) => s.state.entities[String(id)]!;
const shownIds = (s: S): number[] => buildSnapshot(defs, s.state).entities.map((e) => e.id);
const heroView = (s: S) =>
  buildSnapshot(defs, s.state).entities.find((e) => e.id === s.state.playerId)!;
const quaff = (s: S, potion: string, buc: 'blessed' | 'uncursed' | 'cursed' = 'uncursed') => {
  const id = s.carry(potion);
  itemOf(s.state, id).buc = buc;
  return s.text(s.mod('nh:quaff', { item: id }));
};
const putOn = (s: S, def: string): { id: EntityId; text: string[] } => {
  const id = s.carry(def);
  const t = s.text(s.mod('nh:puton', { item: id }));
  return { id, text: s.state.pendingPrompt ? [...t, ...textOf(answer(s, 'l'))] : t };
};
const known = (s: S, def: string): boolean => isKnown(s.state, defs, def as DefId);

describe('the objects', () => {
  test('wand, two rings, potion and cloak in the object table', () => {
    expect(defs.object('nh:wand_of_make_invisible').wand?.dir).toBe('immediate');
    expect(defs.object('nh:ring_of_invisibility').prop).toBe(P.INVIS);
    expect(defs.object('nh:ring_of_see_invisible').prop).toBe(P.SEE_INVIS);
    expect(defs.object('nh:potion_of_invisibility').class).toBe('potion');
    expect(defs.object('nh:cloak_of_invisibility').armor?.slot).toBe('cloak');
    // its description is one of its range's (m11 step 3: the cloak range is shuffled)
    expect(defs.object('nh:cloak_of_invisibility').descKey).toBeUndefined();
    expect(render({ key: 'nh:opera_cloak' })).toBe('opera cloak');
  });
});

describe('invisible monsters', () => {
  test('hidden on a visible square, seen with see invisible, sensed by blind telepathy', () => {
    const s = make();
    const id = pinned(s, 'nh:jackal', 5, 2);
    setMinvis(s.ctx, ent(s, id));
    s.step({ type: 'wait' });
    expect(monInvisible(s.ctx, ent(s, id))).toBe(true);
    expect(shownIds(s)).not.toContain(id);
    expect(engine.query(s.state).describe({ x: 5, y: 2 }).entities ?? []).toEqual([]);
    expect(canseemon(s.ctx, ent(s, id))).toBe(false);
    expect(canSpotMon(s.ctx, ent(s, id))).toBe(false);
    expect(monNam(s.ctx, ent(s, id))).toBe('@pronoun.it');
    // see invisible
    setIntrinsic(hero(s), P.SEE_INVIS, true);
    expect(monVisible(s.ctx, ent(s, id))).toBe(true);
    expect(shownIds(s)).toContain(id);
    expect(canseemon(s.ctx, ent(s, id))).toBe(true);
    // blind and telepathic, without see invisible: sensed
    setIntrinsic(hero(s), P.SEE_INVIS, false);
    setIntrinsic(hero(s), P.TELEPAT, true);
    setIntrinsic(hero(s), P.BLINDED, true);
    s.step({ type: 'wait' });
    expect(shownIds(s)).toContain(id);
    expect(canSpotMon(s.ctx, ent(s, id))).toBe(true);
  });

  test('the remembered-unseen I: kept on a visible square, never on hers, forgotten', () => {
    const s = make();
    mapInvisible(s.ctx, 6, 2);
    mapInvisible(s.ctx, s.here.x, s.here.y); // her own square: skipped
    s.step({ type: 'wait' });
    const cells = buildSnapshot(defs, s.state).cells;
    const lv = s.state.levels['dlvl1']!;
    expect(cells[2 * lv.width + 6]?.m).toBe(REMEMBERED_UNSEEN);
    expect(cells[s.here.y * lv.width + s.here.x]?.m).toBeUndefined();
    expect(unmapInvisible(s.ctx, 6, 2)).toBe(true);
    expect(unmapInvisible(s.ctx, 6, 2)).toBe(false);
  });

  test('its state goes with it', () => {
    const s = make();
    const id = pinned(s, 'nh:jackal', 5, 2);
    setMinvis(s.ctx, ent(s, id));
    forgetMState(s.ctx, id);
    expect(monInvisible(s.ctx, ent(s, id))).toBe(false);
  });

  test('a monster putting on a cloak of invisibility vanishes; a mummy wrapping shows it', () => {
    const s = make();
    const id = pinned(s, 'nh:hill_orc', 5, 2);
    const cloak = s.give('nh:cloak_of_invisibility', { carriedBy: id });
    const out: string[] = [];
    mDoWear({ ...s.ctx, emit: (e) => void (e.type === 'msg' && out.push(render(e))) }, id, false);
    expect(itemOf(s.state, cloak).equipped).toBe('cloak');
    expect(monInvisible(s.ctx, ent(s, id))).toBe(true);
    expect(out).toContain('Suddenly you cannot see the hill orc.');
    expect(known(s, 'nh:cloak_of_invisibility')).toBe(true);
    // a mummy wrapping blocks a permanently invisible monster's invisibility
    const s2 = make();
    const m2 = pinned(s2, 'nh:kobold_mummy', 5, 2);
    setMinvis(s2.ctx, ent(s2, m2));
    s2.give('nh:mummy_wrapping', { carriedBy: m2 });
    mDoWear(s2.ctx, m2, true); // (at creation: a new mummy wears it even so)
    expect(monInvisible(s2.ctx, ent(s2, m2))).toBe(false);
  });
});

describe('the invisible hero', () => {
  test('drawn unseen without see invisible; seen with it; a mummy wrapping blocks it', () => {
    const s = make();
    setIntrinsic(hero(s), P.INVIS, true);
    expect(heroInvisible(s.state)).toBe(true);
    expect(heroView(s).unseen).toBe(true);
    setIntrinsic(hero(s), P.SEE_INVIS, true);
    expect(cantSeeSelf(s.state)).toBe(false);
    expect(heroView(s).unseen).toBeUndefined();
    setIntrinsic(hero(s), P.SEE_INVIS, false);
    const wrap = s.carry('nh:mummy_wrapping');
    expect(s.text(s.mod('nh:wear', { item: wrap }))).toContain('You can see yourself!');
    expect(heroInvisible(s.state)).toBe(false);
    expect(heroView(s).unseen).toBeUndefined();
    expect(s.text(s.mod('nh:takeoff', { item: wrap }))).toContain(
      'You can no longer see yourself.',
    );
    expect(heroInvisible(s.state)).toBe(true);
  });

  test('a cloak of invisibility: on and off, learned', () => {
    const s = make();
    const c = s.carry('nh:cloak_of_invisibility');
    expect(s.text(s.mod('nh:wear', { item: c }))).toContain('Suddenly you cannot see yourself.');
    expect(known(s, 'nh:cloak_of_invisibility')).toBe(true);
    expect(cantSeeSelf(s.state)).toBe(true);
    expect(s.text(s.mod('nh:takeoff', { item: c }))).toContain('Suddenly you can see yourself.');
    expect(heroInvisible(s.state)).toBe(false);
    // already invisible: no message, not learned
    const t = make();
    setIntrinsic(hero(t), P.INVIS, true);
    const c2 = t.carry('nh:cloak_of_invisibility');
    expect(t.text(t.mod('nh:wear', { item: c2 }))).not.toContain(
      'Suddenly you cannot see yourself.',
    );
    expect(known(t, 'nh:cloak_of_invisibility')).toBe(false);
  });
});

describe('the wand of make invisible', () => {
  test('at a monster she sees: it vanishes (not learned); with see invisible it turns transparent', () => {
    const s = make();
    const id = pinned(s, 'nh:jackal', 5, 2);
    expect(zap(s, 'nh:wand_of_make_invisible', 'e')).toContain('The jackal vanishes!');
    expect(monInvisible(s.ctx, ent(s, id))).toBe(true);
    expect(known(s, 'nh:wand_of_make_invisible')).toBe(false);
    const t = make();
    setIntrinsic(hero(t), P.SEE_INVIS, true);
    const id2 = pinned(t, 'nh:jackal', 5, 2);
    expect(zap(t, 'nh:wand_of_make_invisible', 'e')).toContain('The jackal turns transparent!');
    expect(monInvisible(t.ctx, ent(t, id2))).toBe(true);
    expect(known(t, 'nh:wand_of_make_invisible')).toBe(true);
  });

  test('at herself: 31-45 turns of invisibility and learned; the mummy wrapping absorbs it', () => {
    const s = make();
    expect(zap(s, 'nh:wand_of_make_invisible', 'self')).toContain(
      "Gee!  All of a sudden, you can't see yourself.",
    );
    const left = timeoutLeft(s.state, hero(s), P.INVIS);
    expect(left).toBeGreaterThanOrEqual(30);
    expect(left).toBeLessThanOrEqual(45);
    expect(known(s, 'nh:wand_of_make_invisible')).toBe(true);
    const t = make();
    const wrap = t.carry('nh:mummy_wrapping');
    t.mod('nh:wear', { item: wrap });
    expect(zap(t, 'nh:wand_of_make_invisible', 'self')).toContain(
      'You feel rather itchy under your mummy wrapping.',
    );
    expect(hasProp(hero(t), P.INVIS)).toBe(false);
  });
});

describe('potions', () => {
  test('invisibility: the message and a timeout; already invisible, a peculiar feeling', () => {
    const s = make();
    expect(quaff(s, 'nh:potion_of_invisibility')).toContain(
      "Gee!  All of a sudden, you can't see yourself.",
    );
    expect(timeoutLeft(s.state, hero(s), P.INVIS)).toBeGreaterThan(100);
    expect(known(s, 'nh:potion_of_invisibility')).toBe(true);
    const t = make();
    setIntrinsic(hero(t), P.INVIS, true);
    expect(quaff(t, 'nh:potion_of_invisibility')).toContain(
      'You have a peculiar feeling for a moment, then it passes.',
    );
    expect(known(t, 'nh:potion_of_invisibility')).toBe(false);
  });

  test('cursed invisibility: presence known, permanent invisibility taken, timed kept', () => {
    const s = make();
    setIntrinsic(hero(s), P.INVIS, true);
    const out = quaff(s, 'nh:potion_of_invisibility', 'cursed');
    expect(out).toContain('For some reason, you feel your presence is known.');
    expect(hasIntrinsic(hero(s), P.INVIS)).toBe(false);
    expect(timeoutLeft(s.state, hero(s), P.INVIS)).toBeGreaterThan(100);
  });

  test('blessed invisibility is sometimes permanent', () => {
    let perm = false;
    for (let seed = 1; seed <= 200 && !perm; seed++) {
      const s = make(seed);
      quaff(s, 'nh:potion_of_invisibility', 'blessed');
      perm = hasIntrinsic(hero(s), P.INVIS);
    }
    expect(perm).toBe(true);
  });

  test('see invisible: fruit juice taste, sight back, and an invisible hero sees through herself', () => {
    const s = make();
    setIntrinsic(hero(s), P.INVIS, true);
    const out = quaff(s, 'nh:potion_of_see_invisible');
    expect(out).toEqual([
      'This tastes like fruit juice.',
      'You can see through yourself, but you are visible!',
    ]);
    expect(seeInvisible(s.state)).toBe(true);
    expect(known(s, 'nh:potion_of_see_invisible')).toBe(true);
    // blind when she drinks: sight comes back, but she did not see herself before
    const b = make();
    setIntrinsic(hero(b), P.INVIS, true);
    setItimeout(b.state, hero(b), P.BLINDED, 50);
    expect(quaff(b, 'nh:potion_of_see_invisible')).toEqual([
      'This tastes like fruit juice.',
      'You can see again.',
    ]);
    expect(hasProp(hero(b), P.BLINDED)).toBe(false);
    const t = make();
    quaff(t, 'nh:potion_of_see_invisible');
    expect(timeoutLeft(t.state, hero(t), P.SEE_INVIS)).toBeGreaterThanOrEqual(750);
    expect(known(t, 'nh:potion_of_see_invisible')).toBe(false);
  });
});

describe('rings', () => {
  test('invisibility: on and off with their messages, learned', () => {
    const s = make();
    const r = putOn(s, 'nh:ring_of_invisibility');
    expect(r.text).toContain("Gee!  All of a sudden, you can't see yourself.");
    expect(known(s, 'nh:ring_of_invisibility')).toBe(true);
    expect(s.text(s.mod('nh:remove', { item: r.id }))).toContain('Your body seems to unfade..');
    expect(heroInvisible(s.state)).toBe(false);
  });

  test('see invisible: transparent but there; off, she cannot see herself', () => {
    const s = make();
    setIntrinsic(hero(s), P.INVIS, true);
    const r = putOn(s, 'nh:ring_of_see_invisible');
    expect(r.text).toContain('Suddenly you are transparent, but there!');
    expect(known(s, 'nh:ring_of_see_invisible')).toBe(true);
    expect(s.text(s.mod('nh:remove', { item: r.id }))).toContain(
      'Suddenly you cannot see yourself.',
    );
    // not invisible: nothing to notice
    const t = make();
    putOn(t, 'nh:ring_of_see_invisible');
    expect(known(t, 'nh:ring_of_see_invisible')).toBe(false);
  });
});

describe('other sources', () => {
  /** Runs `fn` with the test ctx (rng, emit; no prompts or timers), collecting the messages. */
  const run = (s: S, fn: (ctx: Ctx) => void): string[] => {
    const out: string[] = [];
    fn({
      ...s.ctx,
      emit: (e: GameEvent) => void (e.type === 'msg' && out.push(render(e))),
    } as unknown as Ctx);
    return out;
  };

  test("the magic trap's low hum toggles intrinsic invisibility", () => {
    const s = make();
    expect(run(s, (ctx) => magicTrapFate(ctx, 11))).toEqual([
      'You hear a low hum.',
      "Gee!  All of a sudden, you can't see yourself.",
    ]);
    expect(hasIntrinsic(hero(s), P.INVIS)).toBe(true);
    expect(run(s, (ctx) => magicTrapFate(ctx, 11))).toEqual([
      'You hear a low hum.',
      'You can see yourself again!',
    ]);
    expect(hasProp(hero(s), P.INVIS)).toBe(false);
    // invisible from a ring: only a feeling
    putOn(s, 'nh:ring_of_invisibility');
    expect(run(s, (ctx) => magicTrapFate(ctx, 11))).toEqual([
      'You hear a low hum.',
      'You feel a little more hidden now.',
    ]);
  });

  test('attrcurse takes intrinsic invisibility ("paranoid") or see invisible', () => {
    let saw = { paranoid: false, saw: false };
    for (let seed = 1; seed <= 60 && !(saw.paranoid && saw.saw); seed++) {
      const s = make(seed);
      setIntrinsic(hero(s), P.INVIS, true);
      setIntrinsic(hero(s), P.SEE_INVIS, true);
      // the other intrinsics of the order are not held, so it falls through to these two
      for (const p of [P.FIRE_RES, P.POISON_RES, P.TELEPAT, P.COLD_RES])
        setIntrinsic(hero(s), p, false);
      const out = run(s, (ctx) => void attrcurse(ctx));
      if (out.includes('You feel paranoid.')) {
        saw = { ...saw, paranoid: true };
        expect(hasIntrinsic(hero(s), P.INVIS)).toBe(false);
      }
      if (out.includes('You thought you saw something!')) {
        saw = { ...saw, saw: true };
        expect(hasIntrinsic(hero(s), P.SEE_INVIS)).toBe(false);
        expect(hasIntrinsic(hero(s), P.INVIS)).toBe(true);
      }
    }
    expect(saw).toEqual({ paranoid: true, saw: true });
  });

  test('enlightenment: invisible, invisible to others, visible; see invisible', () => {
    const lines = (s: S) => enlightenment(s.ctx as unknown as Ctx).map((m) => render(m));
    const s = make();
    setIntrinsic(hero(s), P.INVIS, true);
    expect(lines(s)).toContain('You are invisible.');
    setIntrinsic(hero(s), P.SEE_INVIS, true);
    expect(lines(s)).toContain('You are invisible to others.');
    expect(lines(s)).toContain('You see invisible.');
    setIntrinsic(hero(s), P.SEE_INVIS, false);
    const wrap = s.carry('nh:mummy_wrapping');
    s.mod('nh:wear', { item: wrap });
    expect(lines(s)).toContain('You are visible.');
  });

  test('probing shows ", invisible"', () => {
    const s = make();
    setIntrinsic(hero(s), P.SEE_INVIS, true);
    const id = pinned(s, 'nh:jackal', 5, 2);
    setMinvis(s.ctx, ent(s, id));
    const out = zap(s, 'nh:wand_of_probing', 'e');
    expect(out.some((l) => l.includes(', invisible'))).toBe(true);
  });

  test('wizard genesis: "invisible jackal"', () => {
    const s = make();
    const spec = parseGenesis(s.ctx as unknown as Ctx, 'invisible jackal');
    expect(spec).toMatchObject({ invisible: true, which: { id: 'nh:jackal' } });
    run(s, (ctx) => void createParticular(ctx, spec!));
    const j = Object.values(s.state.entities).find((e) => e.def === 'nh:jackal')!;
    expect(monInvisible(s.ctx, j)).toBe(true);
  });
});
