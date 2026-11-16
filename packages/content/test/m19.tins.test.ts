// m19 step 5: tins and the horn of plenty. Opening a tin (fingers, a dagger, a pick-axe, the
// tin opener, a blessed tin; an occupation that a monster interrupts and that gives up after 50
// moves), what is inside (each variety's nutrition and line, spinach, empty, rotten, cursed and
// booby-trapped tins, "Eat it?"), a cockatrice tin, the tin opener applied, the tinning kit,
// monsters eating lizard tins (munstone(), find_defensive()), searches_for_item()'s tins, and
// the horn of plenty. Outcomes are asserted; random rolls are bounded over many tries.
// ref: src/eat.c start_tin(), opentin(), consume_tin(), costly_tin(), use_tin_opener(),
// Popeye(); src/apply.c use_tinning_kit(); src/muse.c munstone(), mon_consume_unstone(),
// mcould_eat_tin(), find_defensive(), searches_for_item(); src/mkobj.c hornoplenty()
import {
  createEngine,
  getPlayer,
  inventoryOf,
  type Mod,
  type Ctx,
  type DefId,
  type EntityId,
  type GameEvent,
  type GameState,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { mksobj, vanillaMod } from '../src/index';
import { polymon } from '../src/polyself';
import { setBoxTrapped } from '../src/btrapstate';
import { findDefensive, munstone } from '../src/muse';
import { mcouldEatTin, searchesForItem } from '../src/musestate';
import { setMConfused } from '../src/mstate';
import { P, setIntrinsic } from '../src/props';
import { glibTimeout, isGlib } from '../src/glib';
import { isStoned, makeStoned } from '../src/stonestate';
import { OPENTIN_ID, TINTXT, popeye, tinCtx } from '../src/tins';
import { messagesEn } from '../src/messages.en';
import { addMon } from './helpers';
import { ctxFor, defs, levelSetup, obj, plainKit, render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'tn',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'tn:run',
      labelKey: 'tn',
      handles: 'mod',
      offer: () => [],
      perform(ctx) {
        probe.fn(ctx);
        return 0;
      },
    });
  },
};
const engine = createEngine([vanillaMod, probeMod]);
/** Runs `fn` with the engine's own Ctx and returns the messages. */
function run(s: { state: GameState }, fn: (ctx: Ctx) => void): string[] {
  probe.fn = fn;
  return msgs(engine.step(s.state, { type: 'mod', action: 'tn:run' as DefId }));
}

const ROOM = [
  '               ',
  ' ............. ',
  ' ............. ',
  ' ......@...... ',
  ' ............. ',
  ' ............. ',
  '               ',
];

type S = ReturnType<typeof levelSetup>;
function make(seed = 1): S {
  const s = levelSetup(ROOM, seed);
  plainKit(s.state);
  // no starting kit in the way (a wielded weapon would change how tins open)
  for (const e of inventoryOf(s.state, s.state.playerId)) delete s.state.entities[String(e.id)];
  s.step({ type: 'wait' });
  const h = getPlayer(s.state);
  if (h.c.hunger) h.c.hunger.nutrition = 500;
  if (h.c.attributes) Object.assign(h.c.attributes, { str: 16, dex: 14 });
  return s;
}
const ent = (state: GameState, id: EntityId) => state.entities[String(id)];
/** The catalog with a regular plural for the smell (the test renderer has no |plural). */
const CAT = { ...messagesEn, 'tin.smells': 'It smells like {mon}s.' };
const msgs = (r: { events: readonly GameEvent[] }): string[] =>
  r.events.flatMap((e) =>
    e.type === 'msg'
      ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) }, CAT)]
      : [],
  );
const nutrition = (s: S): number => getPlayer(s.state).c.hunger!.nutrition;
/** Nutrition gained since `from` = { n, turn }, the 1 a turn spent on hunger added back. */
const gained = (s: S, from: { n: number; turn: number }): number =>
  nutrition(s) - from.n + (s.state.turn - from.turn);
const mark = (s: S): { n: number; turn: number } => ({ n: nutrition(s), turn: s.state.turn });

/** A new carried object (uncursed unless given). */
function carry(
  s: S,
  otyp: string,
  o: { buc?: 'blessed' | 'cursed'; spe?: number; corpseOf?: string; wield?: boolean } = {},
): EntityId {
  const id = s.carry(otyp, o.corpseOf ? { corpseOf: o.corpseOf as DefId } : {});
  const it = ent(s.state, id)!.c.item!;
  it.buc = o.buc ?? 'uncursed';
  if (o.spe !== undefined) it.spe = o.spe;
  if (o.wield) it.equipped = 'weapon';
  return id;
}
/** A tin of `mon` with variety index `r` (or spinach / empty). */
function tin(
  s: S,
  what: { mon?: string; r?: number; spinach?: boolean },
  buc?: 'blessed' | 'cursed',
): EntityId {
  const id = carry(s, 'nh:tin', buc ? { buc } : {});
  const it = ent(s.state, id)!.c.item!;
  if (what.spinach) it.spe = 1;
  else {
    if (what.mon) it.corpseOf = what.mon as DefId;
    it.spe = -((what.r ?? 1) + 1);
  }
  return id;
}
const eat = (s: S, item: EntityId): StepResult =>
  engine.stepAll(s.state, { type: 'mod', action: 'nh:eat' as DefId, args: { item } });
const answer = (s: S, value: unknown): StepResult =>
  engine.stepAll(s.state, {
    type: 'answer',
    promptId: s.state.pendingPrompt!.prompt.id,
    value: value as never,
  });
const apply = (s: S, item: EntityId): StepResult =>
  engine.stepAll(s.state, { type: 'mod', action: 'nh:apply' as DefId, args: { item } });

describe('opening a tin', () => {
  test('Eat is offered on a carried tin and on one at her feet', () => {
    const s = make();
    const t = tin(s, { mon: 'nh:newt' });
    const floor = s.floor('nh:tin');
    const offers = (target: Parameters<ReturnType<typeof engine.query>['actionsFor']>[0]) =>
      engine
        .query(s.state)
        .actionsFor(target)
        .map((o) => o.action);
    expect(offers({ kind: 'item', id: t })).toContainEqual({
      type: 'mod',
      action: 'nh:eat',
      args: { item: t },
    });
    expect(offers({ kind: 'self' })).toContainEqual({
      type: 'mod',
      action: 'nh:eat',
      args: { item: floor },
    });
  });

  test('a blessed tin opener opens a tin at once; the tin of newt meat is eaten', () => {
    const s = make();
    carry(s, 'nh:tin_opener', { buc: 'blessed', wield: true });
    const t = tin(s, { mon: 'nh:newt', r: 6 }); // smoked
    const before = mark(s);
    const r1 = eat(s, t);
    expect(msgs(r1)).toEqual([
      'Using your tin opener you try to open the tin.',
      'You easily open the tin.',
      'It smells like newts.',
    ]);
    expect(s.state.pendingPrompt?.prompt.key).toBe('tin.eat_it');
    const r2 = answer(s, true);
    expect(msgs(r2)).toContain('You consume smoked newt.');
    expect(ent(s.state, t)).toBeUndefined();
    expect(gained(s, before)).toBe(TINTXT[6]!.nut);
  });
});

/** Starts eating the tin with one move only (not the occupation's later moves). */
const startEat = (s: S, item: EntityId): StepResult =>
  engine.step(s.state, { type: 'mod', action: 'nh:eat' as DefId, args: { item } });

describe('how long a tin takes to open', () => {
  test('fingers: rn1(1 + 500 / (Dex + Str), 10) moves, then it opens', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const s = make(seed);
      const t = tin(s, { mon: 'nh:newt' });
      const r = startEat(s, t);
      expect(msgs(r)).toContain('It is not so easy to open this tin.');
      const rec = tinCtx(s.state)!;
      // Dex 14 + Str 16 = 30: 10 .. 10 + 500 / 30 = 26
      expect(rec.reqtime).toBeGreaterThanOrEqual(10);
      expect(rec.reqtime).toBeLessThanOrEqual(26);
      seen.add(rec.reqtime);
      expect(s.state.occupation?.action).toEqual({ type: 'mod', action: OPENTIN_ID });
      // the occupation's moves: one per move, the last one opens it
      let moves = 0;
      let opened = false;
      while (s.state.occupation && moves < 60) {
        const m = msgs(engine.step(s.state, { type: 'continue' }));
        moves++;
        if (m.includes('You succeed in opening the tin.')) opened = true;
      }
      expect(opened).toBe(true);
      expect(moves).toBe(rec.reqtime);
      expect(s.state.pendingPrompt?.prompt.key).toBe('tin.eat_it');
    }
    expect(seen.size).toBeGreaterThan(5);
  });

  test('a dagger takes 3 moves, a pick-axe 6 ("Using your X you try to open the tin.")', () => {
    for (const [weapon, n] of [
      ['nh:dagger', 3],
      ['nh:knife', 3],
      ['nh:pick_axe', 6],
      ['nh:axe', 6],
    ] as const) {
      const s = make();
      carry(s, weapon, { wield: true });
      const t = tin(s, { mon: 'nh:newt' });
      const r = startEat(s, t);
      expect(msgs(r)[0]).toMatch(
        /^Using your (dagger|knife|pick-axe|axe) you try to open the tin\.$/,
      );
      expect(tinCtx(s.state)!.reqtime).toBe(n);
    }
  });

  test('another wielded weapon is no help: fingers', () => {
    const s = make();
    carry(s, 'nh:long_sword', { wield: true });
    const r = startEat(s, tin(s, { mon: 'nh:newt' }));
    expect(msgs(r)).toContain('It is not so easy to open this tin.');
  });

  test('a tin opener: 0..1 moves uncursed, 0..2 cursed, none blessed', () => {
    for (const [buc, max] of [
      [undefined, 1],
      ['cursed', 2],
      ['blessed', 0],
    ] as const) {
      const seen = new Set<number>();
      for (let seed = 1; seed <= 30; seed++) {
        const s = make(seed);
        carry(s, 'nh:tin_opener', { wield: true, ...(buc ? { buc } : {}) });
        const t = tin(s, { mon: 'nh:newt' });
        const r = startEat(s, t);
        const rec = tinCtx(s.state);
        const req = s.state.pendingPrompt ? 0 : rec!.reqtime;
        if (req === 0) expect(msgs(r)).toContain('You easily open the tin.');
        seen.add(req);
      }
      expect([...seen].sort()).toEqual(Array.from({ length: max + 1 }, (_, i) => i));
    }
  });

  test('a blessed tin opens like magic half the time, else in one move; always with a blessed opener', () => {
    let magic = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = make(seed);
      const r = startEat(s, tin(s, { mon: 'nh:newt' }, 'blessed'));
      if (msgs(r).includes('The tin opens like magic!')) magic++;
      else {
        expect(msgs(r)).toContain('The tin seems easy to open.');
        expect(tinCtx(s.state)!.reqtime).toBe(1);
      }
    }
    expect(magic).toBeGreaterThan(15);
    expect(magic).toBeLessThan(45);
    for (let seed = 1; seed <= 10; seed++) {
      const s = make(seed);
      carry(s, 'nh:tin_opener', { buc: 'blessed', wield: true });
      const r = startEat(s, tin(s, { mon: 'nh:newt' }, 'blessed'));
      expect(msgs(r)).toContain('The tin opens like magic!');
    }
  });

  test('a form without hands cannot open it; a metallivore bites right into it', () => {
    const s = make();
    const t = tin(s, { mon: 'nh:newt' });
    run(s, (ctx) => polymon(ctx, 'nh:jackal' as DefId, false));
    const r = startEat(s, t);
    expect(msgs(r)).toEqual(['You cannot handle the tin properly to open it.']);
    expect(ent(s.state, t)).toBeDefined();
    const m = make();
    const t2 = tin(m, { mon: 'nh:newt', r: 5 }); // boiled
    run(m, (ctx) => polymon(ctx, 'nh:rock_mole' as DefId, false));
    const before = mark(m);
    const r2 = startEat(m, t2);
    // tin and all: no question, 5 more nutrition
    expect(msgs(r2)).toContain('You bite right into the metal tin...');
    expect(msgs(r2)).toContain('You consume boiled newt.');
    expect(m.state.pendingPrompt).toBeNull();
    expect(gained(m, before)).toBe(TINTXT[5]!.nut + 5);
  });
});

describe('the opening occupation', () => {
  test('a hostile monster coming next to her stops it; eating it again starts over', () => {
    const s = make();
    const t = tin(s, { mon: 'nh:newt' });
    startEat(s, t);
    expect(tinCtx(s.state)).not.toBeNull();
    const id = addMon(s.state, 'nh:jackal', 8, 3, { energy: 0 });
    const e = ent(s.state, id)!;
    e.c.actor!.speed = 0; // pinned
    const r = engine.step(s.state, { type: 'continue' });
    expect(msgs(r)).toContain('You stop opening the tin.');
    expect(s.state.occupation).toBeNull();
    expect(tinCtx(s.state)).toBeNull();
    expect(ent(s.state, t)).toBeDefined();
    delete s.state.entities[String(id)];
    const again = startEat(s, t);
    expect(msgs(again)).toContain('It is not so easy to open this tin.');
    expect(tinCtx(s.state)!.usedtime).toBe(0);
  });

  test('any other action cancels it silently; the tin stays', () => {
    const s = make();
    const t = tin(s, { mon: 'nh:newt' });
    startEat(s, t);
    engine.step(s.state, { type: 'wait' });
    expect(s.state.occupation).toBeNull();
    expect(tinCtx(s.state)).toBeNull();
    expect(ent(s.state, t)).toBeDefined();
  });

  test('after 50 moves she gives up', () => {
    const s = make();
    const t = tin(s, { mon: 'nh:newt' });
    startEat(s, t);
    tinCtx(s.state)!.reqtime = 99;
    let moves = 0;
    let gaveUp = false;
    while (s.state.occupation && moves < 100) {
      moves++;
      if (
        msgs(engine.step(s.state, { type: 'continue' })).includes(
          'You give up your attempt to open the tin.',
        )
      )
        gaveUp = true;
    }
    expect(gaveUp).toBe(true);
    expect(moves).toBe(51);
    expect(ent(s.state, t)).toBeDefined();
  });

  test('turning to stone does not stop her opening a tin that may cure it (Popeye())', () => {
    const s = make();
    const t = tin(s, { mon: 'nh:lizard' });
    startEat(s, t);
    expect(popeye(s.state, defs, 'stoned')).toBe(true); // unknown: assumed helpful
    ent(s.state, t)!.c.item!.known.spe = true;
    expect(popeye(s.state, defs, 'stoned')).toBe(true);
    expect(popeye(s.state, defs, 'slimed')).toBe(false);
    ent(s.state, t)!.c.item!.corpseOf = 'nh:newt' as DefId;
    expect(popeye(s.state, defs, 'stoned')).toBe(false);
    ent(s.state, t)!.c.item!.corpseOf = 'nh:chameleon' as DefId;
    expect(popeye(s.state, defs, 'slimed')).toBe(true);
    engine.step(s.state, { type: 'wait' });
    expect(popeye(s.state, defs, 'stoned')).toBe(false); // not opening any more
  });
});

/** Opens the tin at once (a blessed tin with a blessed tin opener wielded) and answers. */
function openNow(s: S, t: EntityId, eatIt: boolean | null = true): string[] {
  if (!inventoryOf(s.state, s.state.playerId).some((o) => o.def === 'nh:tin_opener'))
    carry(s, 'nh:tin_opener', { buc: 'blessed', wield: true });
  const out = msgs(eat(s, t));
  if (s.state.pendingPrompt && eatIt !== null) out.push(...msgs(answer(s, eatIt)));
  return out;
}

describe('what is inside', () => {
  test("each variety's line and nutrition (homemade no more than the corpse)", () => {
    for (let r = 1; r < TINTXT.length; r++) {
      const s = make();
      const t = tin(s, { mon: 'nh:jackal', r }, 'blessed');
      const before = mark(s);
      const out = openNow(s, t);
      const variety = render({ key: TINTXT[r]!.txtKey });
      expect(out).toContain('It smells like jackals.');
      expect(out).toContain(`You consume ${variety} jackal.`);
      // the jackal's corpse is worth 250: a homemade tin's 50 stays
      expect(gained(s, before)).toBe(TINTXT[r]!.nut);
      expect(ent(s.state, t)).toBeUndefined();
      if (TINTXT[r]!.greasy) {
        expect(out).toContain(`Eating ${variety} food made your fingers very slippery.`);
        // 5..15 turns of slippery fingers
        expect(glibTimeout(s.state)).toBeGreaterThanOrEqual(4);
        expect(glibTimeout(s.state)).toBeLessThanOrEqual(15);
      } else expect(isGlib(s.state)).toBe(false);
    }
    // a newt's corpse is worth 20: a homemade tin of newt gives 20
    const s = make();
    const before = mark(s);
    openNow(s, tin(s, { mon: 'nh:newt', r: 1 }, 'blessed'));
    expect(gained(s, before)).toBe(20);
  });

  test('a rotten tin gives nothing and makes her vomit', () => {
    const s = make();
    const before = mark(s);
    const out = openNow(s, tin(s, { mon: 'nh:jackal', r: 0 }, 'blessed'));
    expect(out).toContain('You consume rotten jackal.');
    expect(gained(s, before)).toBe(0);
    expect(
      (s.state.modData['nh'] as { hunger?: { vomiting?: number } }).hunger?.vomiting ?? 1,
    ).toBeGreaterThan(0);
  });

  test('a homemade tin of a non-blessed tin goes bad about 1 time in 7; never a lizard tin', () => {
    let rotten = 0;
    for (let seed = 1; seed <= 140; seed++) {
      const s = make(seed);
      const out = openNow(s, tin(s, { mon: 'nh:jackal', r: 1 }));
      if (out.includes('You consume rotten jackal.')) rotten++;
      else expect(out).toContain('You consume homemade jackal.');
    }
    expect(rotten).toBeGreaterThan(8);
    expect(rotten).toBeLessThan(35);
    for (let seed = 1; seed <= 20; seed++) {
      const s = make(seed);
      expect(openNow(s, tin(s, { mon: 'nh:lizard', r: 1 }))).toContain(
        'You consume homemade lizard.',
      );
    }
  });

  test('spinach: Popeye and Str (uncursed 401..600, blessed 600); cursed decays and takes Str', () => {
    for (const buc of [undefined, 'blessed'] as const) {
      const s = make();
      const str = getPlayer(s.state).c.attributes!.str;
      const before = mark(s);
      const out = openNow(s, tin(s, { spinach: true }, buc));
      expect(out).toContain('It contains spinach.');
      expect(out).toContain('This makes you feel like Popeye!');
      expect(getPlayer(s.state).c.attributes!.str).toBeGreaterThan(str);
      const g = gained(s, before);
      if (buc === 'blessed') expect(g).toBe(600);
      else {
        expect(g).toBeGreaterThan(400);
        expect(g).toBeLessThanOrEqual(600);
      }
    }
    // a cursed tin may be booby-trapped (1 in 8 unless homemade): search a seed that is not
    let seed = 1;
    for (; seed < 50; seed++) {
      const m = make(seed);
      const str = getPlayer(m.state).c.attributes!.str;
      const c = tin(m, { spinach: true }, 'cursed');
      const before = mark(m);
      const out = openNow(m, c);
      if (out.includes('KABOOM!!  The tin was booby-trapped!')) continue;
      expect(out).toContain('It contains some decaying green substance.');
      expect(out).not.toContain('This makes you feel like Popeye!');
      expect(getPlayer(m.state).c.attributes!.str).toBeLessThan(str);
      const g = gained(m, before);
      expect(g).toBeGreaterThan(200);
      expect(g).toBeLessThanOrEqual(600);
      break;
    }
    expect(seed).toBeLessThan(50);
  });

  test('an empty tin; a discarded one', () => {
    const s = make();
    const t = tin(s, {});
    const out = openNow(s, t);
    expect(out).toContain('It turns out to be empty.');
    expect(s.state.pendingPrompt).toBeNull();
    expect(ent(s.state, t)).toBeUndefined();
    const before = mark(s);
    const t2 = tin(s, { mon: 'nh:newt', r: 6 }, 'blessed');
    const out2 = openNow(s, t2, false);
    expect(out2).toContain('You discard the open tin.');
    expect(ent(s.state, t2)).toBeUndefined();
    expect(gained(s, before)).toBe(0);
  });

  test('a cursed tin blows up about 1 time in 8; a booby-trapped one always', () => {
    let boom = 0;
    for (let seed = 1; seed <= 160; seed++) {
      const s = make(seed);
      const out = openNow(s, tin(s, { mon: 'nh:jackal', r: 5 }, 'cursed'));
      if (out.includes('KABOOM!!  The tin was booby-trapped!')) boom++;
      else expect(out).toContain('You consume rotten jackal.'); // cursed tins are rotten
    }
    expect(boom).toBeGreaterThan(8);
    expect(boom).toBeLessThan(35);
    const s = make();
    const t = tin(s, { mon: 'nh:jackal', r: 5 }, 'blessed');
    setBoxTrapped(s.ctx, t, true);
    const out = openNow(s, t);
    expect(out).toContain('KABOOM!!  The tin was booby-trapped!');
    expect(ent(s.state, t)).toBeUndefined();
  });

  test('a cockatrice tin turns her to stone; with stone resistance it smells like chicken', () => {
    const s = make();
    const out = openNow(s, tin(s, { mon: 'nh:cockatrice', r: 5 }, 'blessed'));
    expect(out).toContain('It smells like cockatrices.');
    expect(s.state.gameOver).not.toBeNull();
    const m = make();
    setIntrinsic(getPlayer(m.state), P.STONE_RES, true);
    const out2 = openNow(m, tin(m, { mon: 'nh:cockatrice', r: 5 }, 'blessed'));
    expect(out2).toContain('It smells like chicken.');
    expect(m.state.gameOver).toBeNull();
  });

  test('a lizard tin cures her petrification, even opened with her fingers at the last moment', () => {
    const s = make();
    const t = tin(s, { mon: 'nh:lizard', r: 5 }, 'blessed');
    run(s, (ctx) => makeStoned(ctx, 5, null, '@killer.ston.tasting.nh:cockatrice'));
    expect(isStoned(s.state)).toBe(true);
    openNow(s, t);
    expect(ent(s.state, t)).toBeUndefined();
    expect(isStoned(s.state)).toBe(false);
    // with fingers, stoned three moves before it opens: the countdown's "slowing down" and
    // "limbs are stiffening" do not stop the opening (Popeye()); for another tin they would
    let saved = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const m = make(seed);
      const lt = tin(m, { mon: 'nh:lizard', r: 5 });
      startEat(m, lt);
      const rec = tinCtx(m.state)!;
      while (m.state.occupation && rec.usedtime < rec.reqtime - 3)
        engine.step(m.state, { type: 'continue' });
      // (no step: any other action would stop the opening)
      makeStoned(m.ctx, 5, null, '@killer.ston.tasting.nh:cockatrice');
      const log: string[] = [];
      while (m.state.occupation) log.push(...msgs(engine.step(m.state, { type: 'continue' })));
      if (m.state.pendingPrompt) log.push(...msgs(answer(m, true)));
      expect(log).toContain('Your limbs are stiffening.');
      expect(log).not.toContain('You stop opening the tin.');
      if (!isStoned(m.state) && m.state.gameOver === null) saved++;
    }
    expect(saved).toBe(10);
    // a tin known to hold a newt is no help: the stiffening stops her
    const m = make(1);
    const nt = tin(m, { mon: 'nh:newt', r: 5 });
    ent(m.state, nt)!.c.item!.known.spe = true;
    startEat(m, nt);
    const rec = tinCtx(m.state)!;
    while (m.state.occupation && rec.usedtime < rec.reqtime - 3)
      engine.step(m.state, { type: 'continue' });
    makeStoned(m.ctx, 5, null, '@killer.ston.tasting.nh:cockatrice');
    const log: string[] = [];
    while (m.state.occupation) log.push(...msgs(engine.step(m.state, { type: 'continue' })));
    expect(log).toContain('You stop opening the tin.');
    expect(ent(m.state, nt)).toBeDefined();
  });

  test('the tin is known once opened; a stack gives up one', () => {
    const s = make();
    const t = tin(s, { mon: 'nh:newt', r: 6 }, 'blessed');
    ent(s.state, t)!.c.item!.quantity = 3;
    openNow(s, t, false);
    const left = ent(s.state, t)!;
    expect(left.c.item!.quantity).toBe(2);
    expect(left.c.item!.known.spe).toBe(true);
    expect(render(defs.itemName(s.state, left))).toBe('2 tins of newt meat');
  });
});

describe('the tin opener applied', () => {
  test('no tin: "You have no tin to open." and no time', () => {
    const s = make();
    const op = carry(s, 'nh:tin_opener');
    const turn = s.state.turn;
    expect(msgs(apply(s, op))).toEqual(['You have no tin to open.']);
    expect(s.state.turn).toBe(turn);
  });

  test('it asks for the tin, wields the opener and opens the tin', () => {
    const s = make();
    const op = carry(s, 'nh:tin_opener', { buc: 'blessed' });
    const t = tin(s, { mon: 'nh:newt', r: 6 });
    const r = apply(s, op);
    expect(msgs(r)).toEqual([]);
    expect(s.state.pendingPrompt?.prompt.key).toBe('tin.what_to_open');
    expect(s.state.pendingPrompt?.prompt.options?.map((o) => o.value)).toEqual([t]);
    const out = msgs(answer(s, t));
    expect(out[0]).toBe('You now wield a tin opener.');
    expect(out).toContain('You easily open the tin.');
    expect(s.state.pendingPrompt?.prompt.key).toBe('tin.eat_it');
    expect(ent(s.state, op)!.c.item!.equipped).toBe('weapon');
  });
});

describe('the tinning kit', () => {
  test('Apply is offered on the kit, the opener and the horn of plenty', () => {
    const s = make();
    for (const otyp of ['nh:tinning_kit', 'nh:tin_opener', 'nh:horn_of_plenty']) {
      const id = carry(s, otyp);
      const acts = engine
        .query(s.state)
        .actionsFor({ kind: 'item', id })
        .flatMap((o) => (o.action.type === 'mod' ? [o.action.action] : []));
      expect(acts).toContain('nh:apply');
    }
  });

  test('out of tins; nothing to tin (each takes a move)', () => {
    const s = make();
    const kit = carry(s, 'nh:tinning_kit', { spe: 0 });
    let turn = s.state.turn;
    expect(msgs(apply(s, kit))).toEqual(['You seem to be out of tins.']);
    expect(s.state.turn).toBe(turn + 1);
    ent(s.state, kit)!.c.item!.spe = 5;
    turn = s.state.turn;
    expect(msgs(apply(s, kit))).toEqual(["You don't have anything to tin."]);
    expect(s.state.turn).toBe(turn + 1);
  });

  test("a newt corpse here becomes a known homemade tin of newt meat of the kit's BUC", () => {
    const s = make();
    const kit = carry(s, 'nh:tinning_kit', { spe: 5, buc: 'blessed' });
    const corpse = s.floor('nh:corpse', { corpseOf: 'nh:newt' as DefId });
    const eaten = carry(s, 'nh:corpse', { corpseOf: 'nh:jackal' });
    ent(s.state, eaten)!.c.item!.eaten = 10; // partly eaten: not offered
    apply(s, kit);
    const opts = s.state.pendingPrompt?.prompt.options ?? [];
    expect(opts.map((o) => o.value)).toEqual([corpse]);
    const out = msgs(answer(s, corpse));
    expect(ent(s.state, corpse)).toBeUndefined();
    expect(ent(s.state, kit)!.c.item!.spe).toBe(4);
    const can = inventoryOf(s.state, s.state.playerId).find((o) => o.def === 'nh:tin')!;
    expect(can.c.item).toMatchObject({ corpseOf: 'nh:newt', buc: 'blessed', spe: -2 });
    expect(can.c.item!.known.spe).toBe(true);
    expect(out[0]).toMatch(/^[a-z] - a tin of newt meat\.$/);
    // eating it: homemade
    const out2 = openNow(s, can.id);
    expect(out2).toContain('You consume homemade newt.');
  });

  test('a cockatrice corpse without gloves is a fatal mistake', () => {
    const s = make();
    const kit = carry(s, 'nh:tinning_kit', { spe: 5 });
    const c = s.floor('nh:corpse', { corpseOf: 'nh:cockatrice' as DefId });
    apply(s, kit);
    const out = msgs(answer(s, c));
    expect(out).toContain(
      'Tinning a cockatrice corpse without wearing gloves is a fatal mistake...',
    );
    expect(s.state.gameOver).not.toBeNull();
    // with gloves it is tinned
    const m = make();
    const kit2 = carry(m, 'nh:tinning_kit', { spe: 5 });
    const gl = carry(m, 'nh:leather_gloves');
    ent(m.state, gl)!.c.item!.equipped = 'gloves';
    const c2 = m.floor('nh:corpse', { corpseOf: 'nh:cockatrice' as DefId });
    apply(m, kit2);
    answer(m, c2);
    expect(m.state.gameOver).toBeNull();
    expect(inventoryOf(m.state, m.state.playerId).some((o) => o.def === 'nh:tin')).toBe(true);
  });
});

describe('monsters and lizard tins', () => {
  /** A hostile awake monster at (x, y) with 20 hit points, pinned (speed 0). */
  function mon(s: S, x: number, y: number, def = 'nh:gnome'): EntityId {
    const id = addMon(s.state, def, x, y, { asleep: false, energy: 12 });
    const e = ent(s.state, id)!;
    e.c.hp = { cur: 20, max: 20 };
    e.c.monster!.level = 1;
    return id;
  }
  function give(s: S, owner: EntityId, otyp: string, corpseOf?: string): EntityId {
    const id = mksobj(ctxFor(s.state), obj(otyp), {
      init: false,
      carriedBy: owner,
      ...(corpseOf ? { corpseOf: corpseOf as DefId } : {}),
    });
    const it = s.state.entities[String(id)]!.c.item!;
    if (otyp === 'nh:tin' && corpseOf) {
      it.corpseOf = corpseOf as DefId;
      it.spe = -6;
    }
    return id;
  }
  const tctx = (s: S): Ctx & { events: GameEvent[] } =>
    Object.assign(ctxFor(s.state), { interrupt: () => undefined }) as unknown as Ctx & {
      events: GameEvent[];
    };

  test('one turning to stone opens and eats a lizard tin when it has a dagger or tin opener', () => {
    for (const tool of ['nh:dagger', 'nh:tin_opener', 'nh:knife']) {
      const s = make();
      const id = mon(s, 9, 3);
      give(s, id, 'nh:tin', 'nh:lizard');
      give(s, id, tool);
      const ctx = tctx(s);
      expect(munstone(ctx, ent(s.state, id)!, false)).toBe(true);
      const text = msgs(ctx);
      // (she does not know what is in it: "a tin")
      expect(text).toContain('The gnome opens and eats the contents of a tin.');
      expect(text).toContain('The gnome seems limber!');
      expect(inventoryOf(s.state, id).map((o) => o.def)).toEqual([tool]);
    }
  });

  test('without a tool, or an animal, it cannot open the tin', () => {
    const s = make();
    const id = mon(s, 9, 3);
    give(s, id, 'nh:tin', 'nh:lizard');
    expect(munstone(tctx(s), ent(s.state, id)!, false)).toBe(false);
    const dog = mon(s, 10, 3, 'nh:jackal');
    give(s, dog, 'nh:tin', 'nh:lizard');
    give(s, dog, 'nh:dagger');
    expect(mcouldEatTin(s.ctx, ent(s.state, dog)!)).toBe(false);
    expect(munstone(tctx(s), ent(s.state, dog)!, false)).toBe(false);
    // a welded cursed weapon that is not a blade: the dagger in its pack is out of reach
    const g = mon(s, 11, 3);
    const club = give(s, g, 'nh:club');
    Object.assign(ent(s.state, club)!.c.item!, { buc: 'cursed', equipped: 'weapon' });
    give(s, g, 'nh:dagger');
    expect(mcouldEatTin(s.ctx, ent(s.state, g)!)).toBe(false);
  });

  test('an acidic tin cures without burning; an empty or spinach tin does not cure', () => {
    const s = make();
    const id = mon(s, 9, 3);
    give(s, id, 'nh:dagger');
    const sp = give(s, id, 'nh:tin');
    ent(s.state, sp)!.c.item!.spe = 1;
    expect(munstone(tctx(s), ent(s.state, id)!, false)).toBe(false);
    give(s, id, 'nh:tin', 'nh:acid_blob');
    const ctx = tctx(s);
    expect(munstone(ctx, ent(s.state, id)!, false)).toBe(true);
    expect(msgs(ctx)).not.toContain('The gnome has a very bad case of stomach acid.');
    expect(ent(s.state, id)!.c.hp!.cur).toBe(20);
  });

  test('a confused one uses its lizard tin 2 times in 3 (find_defensive())', () => {
    let used = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = make(seed);
      const id = mon(s, 9, 3);
      give(s, id, 'nh:tin', 'nh:lizard');
      give(s, id, 'nh:dagger');
      setMConfused(s.ctx, id, true);
      const c = findDefensive(tctx(s), id, false);
      if (c?.kind === 'lizard_corpse') used++;
    }
    expect(used).toBeGreaterThan(28);
    expect(used).toBeLessThan(52);
  });

  test('it wants a lizard tin only when it could open it (searches_for_item())', () => {
    const s = make();
    const id = mon(s, 9, 3);
    const t = s.floor('nh:tin');
    Object.assign(ent(s.state, t)!.c.item!, { corpseOf: 'nh:lizard', spe: -6 });
    expect(searchesForItem(s.ctx, ent(s.state, id)!, ent(s.state, t)!)).toBe(false);
    give(s, id, 'nh:dagger');
    expect(searchesForItem(s.ctx, ent(s.state, id)!, ent(s.state, t)!)).toBe(true);
    ent(s.state, t)!.c.item!.corpseOf = 'nh:newt' as DefId;
    expect(searchesForItem(s.ctx, ent(s.state, id)!, ent(s.state, t)!)).toBe(false);
  });
});

describe('the horn of plenty', () => {
  test('food or a potion of the horn\'s BUC; a charge each time; empty: "Nothing happens."', () => {
    const s = make();
    const horn = carry(s, 'nh:horn_of_plenty', { spe: 200, buc: 'cursed' });
    let potions = 0;
    for (let i = 0; i < 200; i++) {
      const before = new Set(inventoryOf(s.state, s.state.playerId).map((o) => o.id));
      const out = msgs(apply(s, horn));
      const spilled = out[0];
      expect([
        'Some food spills out.',
        'A potion spills out.',
        'Some potions spill out.',
      ]).toContain(spilled);
      const got = inventoryOf(s.state, s.state.playerId).filter(
        (o) => !before.has(o.id) && o.id !== horn,
      );
      // new stacks only (a merged one is not new): check the new ones
      for (const o of got) {
        const def = defs.object(o.def);
        expect(o.c.item!.buc).toBe('cursed');
        if (def.class === 'potion') {
          expect(def.magic).toBe(false);
        } else expect(def.class).toBe('food');
      }
      if (spilled !== 'Some food spills out.') potions++;
      // keep the pack light
      for (const o of got) delete s.state.entities[String(o.id)];
      for (const o of inventoryOf(s.state, s.state.playerId))
        if (o.id !== horn && o.def !== 'nh:tin_opener') delete s.state.entities[String(o.id)];
    }
    expect(ent(s.state, horn)!.c.item!.spe).toBe(0);
    // 1 time in 13
    expect(potions).toBeGreaterThan(5);
    expect(potions).toBeLessThan(32);
    expect(msgs(apply(s, horn))).toEqual(['Nothing happens.']);
    expect(render(defs.itemName(s.state, ent(s.state, horn)!))).toMatch(/empty/);
  });
});
