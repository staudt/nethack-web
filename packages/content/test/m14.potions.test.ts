// m14 step 4: thrown potions and the scroll of earth. A hostile lined up with the hero hurls its
// potions of sleeping, paralysis, blindness, confusion and acid: they break on her head with their
// vapors; her own thrown potions break on a monster (a potion of sleeping puts it to sleep) or
// where they land, with their vapors when that is next to her; a hostile next to her with a hard
// hat reads a scroll of earth and boulders fall around it and on her. Outcomes are asserted;
// random rolls are searched over seeds.
import {
  getPlayer,
  itemsAt,
  type Ctx,
  type DefId,
  type EntityId,
  type GameEvent,
  type GameState,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { mksobj } from '../src/index';
import { findOffensive, useOffensive } from '../src/muse';
import { M_SEEN, mSeenres } from '../src/musestate';
import { isFrozen } from '../src/mstate';
import { isKnown } from '../src/o_init';
import { P, hasProp, setIntrinsic } from '../src/props';
import { addMon } from './helpers';
import { ctxFor, defs, engine, levelSetup, obj, plainKit, render } from './itemHelpers';

const ROOM = [
  '               ',
  ' ............. ',
  ' ............. ',
  ' ......@...... ',
  ' ............. ',
  ' ............. ',
  '               ',
];

function make(seed = 1, rows = ROOM) {
  const s = levelSetup(rows, seed);
  plainKit(s.state);
  s.step({ type: 'wait' });
  return s;
}
type Setup = ReturnType<typeof make>;
const ent = (state: GameState, id: EntityId) => state.entities[String(id)];
const msgs = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );
/** A hostile awake hill orc (or `def`) at (x, y) with `hp` hit points. */
function orc(state: GameState, x: number, y: number, hp = 200, def = 'nh:hill_orc'): EntityId {
  const id = addMon(state, def, x, y, { asleep: false, energy: 12 });
  const e = ent(state, id)!;
  e.c.hp = { cur: hp, max: hp };
  e.c.monster!.level = 1;
  return id;
}
/** Gives the monster (or the hero) a new uncursed object. */
function give(state: GameState, mon: EntityId, otyp: string): EntityId {
  const id = mksobj(ctxFor(state), obj(otyp), { init: false, carriedBy: mon });
  state.entities[String(id)]!.c.item!.buc = 'uncursed';
  return id;
}
function tctx(state: GameState): Ctx & { events: GameEvent[] } {
  const c = ctxFor(state);
  return Object.assign(c, { interrupt: () => undefined }) as unknown as Ctx & {
    events: GameEvent[];
  };
}
/** findOffensive() then useOffensive() for the monster, outside its move; the messages. */
function use(state: GameState, id: EntityId): { kind: string | null; text: string[] } {
  const ctx = tctx(state);
  const c = findOffensive(ctx, id);
  if (c) useOffensive(ctx, id, c);
  return { kind: c?.kind ?? null, text: msgs(ctx.events) };
}
const kindOf = (state: GameState, id: EntityId): string | null =>
  findOffensive(tctx(state), id)?.kind ?? null;
const hero = (state: GameState) => getPlayer(state);
const floorDefs = (state: GameState, x: number, y: number): string[] =>
  itemsAt(defs, state, 'dlvl1', x, y).map((e) => e.def);
const anyPotionOnFloor = (state: GameState): boolean =>
  Object.values(state.entities).some(
    (e) => e?.c.item && !e.c.item.carriedBy && e.c.pos && defs.object(e.def).class === 'potion',
  );

describe('monsters hurl potions', () => {
  /** The first seed where the orc's potion is not caught: its messages and state. */
  function hurled(otyp: string, prep: (s: Setup) => void = () => undefined) {
    for (let seed = 1; seed <= 30; seed++) {
      const s = make(seed);
      prep(s);
      const id = orc(s.state, 10, 3);
      const p = give(s.state, id, otyp);
      const r = use(s.state, id);
      if (r.text.some((m) => /^You catch/.test(m))) continue;
      return { s, id, p, r };
    }
    throw new Error('always caught');
  }
  const BREAKS =
    /^The (bottle|phial|flagon|carafe|flask|jar|vial) crashes on your head and breaks into shards\.$/;

  test.each([
    ['nh:potion_of_sleeping', 'pot_sleeping', 'You feel rather tired.'],
    ['nh:potion_of_paralysis', 'pot_paralysis', 'Something seems to be holding you.'],
    ['nh:potion_of_blindness', 'pot_blindness', 'It suddenly gets dark.'],
    ['nh:potion_of_confusion', 'pot_confusion', 'You feel somewhat dizzy.'],
    ['nh:potion_of_acid', 'pot_acid', 'This burns!'],
  ])('%s breaks on her head with its effect', (otyp, kind, line) => {
    const { s, p, r } = hurled(otyp);
    expect(r.kind).toBe(kind);
    expect(r.text[0]).toMatch(/^The hill orc hurls an? .*potion.*!$/);
    expect(r.text.some((m) => BREAKS.test(m))).toBe(true);
    expect(r.text.some((m) => / evaporates\.$/.test(m))).toBe(true);
    expect(r.text).toContain(line);
    expect(ent(s.state, p)).toBeUndefined(); // used up
    expect(anyPotionOnFloor(s.state)).toBe(false);
    expect(hero(s.state).c.hp!.cur).toBeLessThan(500); // rnd(2) from the bottle
    const h = hero(s.state);
    if (kind === 'pot_sleeping' || kind === 'pot_paralysis') expect(h.c.helpless).toBeDefined();
    if (kind === 'pot_blindness') expect(hasProp(h, P.BLINDED)).toBe(true);
    if (kind === 'pot_confusion') expect(hasProp(h, P.CONFUSION)).toBe(true);
    if (kind === 'pot_acid') expect(h.c.hp!.cur).toBeLessThanOrEqual(500 - 2);
    // a vapor she noticed identifies the type (confusion and acid do not)
    const noticed = kind !== 'pot_confusion' && kind !== 'pot_acid';
    expect(isKnown(s.state, defs, otyp as DefId)).toBe(noticed);
  });

  test('no paralysis potion at a helpless hero; the others still fly', () => {
    const s = make();
    const id = orc(s.state, 10, 3);
    give(s.state, id, 'nh:potion_of_paralysis');
    expect(kindOf(s.state, id)).toBe('pot_paralysis');
    hero(s.state).c.helpless = { until: s.state.turn + 10, reasonKey: 'helpless.asleep' };
    expect(kindOf(s.state, id)).toBeNull();
    give(s.state, id, 'nh:potion_of_confusion');
    expect(kindOf(s.state, id)).toBe('pot_confusion');
  });

  test('she yawns at a sleeping potion with sleep resistance; the monsters stop throwing it', () => {
    const { s, id, r } = hurled('nh:potion_of_sleeping', (st) =>
      setIntrinsic(hero(st.state), P.SLEEP_RES, true),
    );
    expect(r.text).toContain('You yawn.');
    expect(hero(s.state).c.helpless).toBeUndefined();
    expect(mSeenres({ state: s.state }, id, M_SEEN.sleep)).toBe(true);
    give(s.state, id, 'nh:potion_of_sleeping');
    expect(kindOf(s.state, id)).toBeNull();
  });

  test('next to her a ray wand is not zapped: the potion is thrown instead', () => {
    const s = make();
    const id = orc(s.state, 10, 3);
    give(s.state, id, 'nh:potion_of_sleeping');
    const w = give(s.state, id, 'nh:wand_of_fire');
    ent(s.state, w)!.c.item!.spe = 5;
    expect(kindOf(s.state, id)).toBe('wan_fire'); // the last viable item wins, rays first
    ent(s.state, id)!.c.pos!.x = 8;
    expect(kindOf(s.state, id)).toBe('pot_sleeping');
  });

  test('a monster in the way may be hit instead: the potion breaks on it', () => {
    let found = false;
    for (let seed = 1; seed <= 60 && !found; seed++) {
      const s = make(seed);
      const id = orc(s.state, 11, 3);
      const j = orc(s.state, 9, 3, 50, 'nh:jackal');
      give(s.state, id, 'nh:potion_of_sleeping');
      const r = use(s.state, id);
      if (!r.text.some((m) => /crashes on the jackal's head/.test(m))) continue;
      found = true;
      expect(r.text).toContain('The jackal falls asleep.');
      expect(isFrozen({ state: s.state }, j)).toBe(true);
      expect(hero(s.state).c.helpless).toBeUndefined();
      expect(anyPotionOnFloor(s.state)).toBe(false);
    }
    expect(found).toBe(true);
  });
});

describe('her thrown potions break', () => {
  /** Starts a throw and answers the direction prompt. */
  function throwDir(s: Setup, id: EntityId, dir: string) {
    s.mod('nh:throw', { item: id });
    const prompt = s.state.pendingPrompt?.prompt;
    if (!prompt) throw new Error('no prompt');
    const r = engine.stepAll(s.state, { type: 'answer', promptId: prompt.id, value: dir });
    return { r, text: msgs(r.events) };
  }

  test('a potion of sleeping that hits puts the monster to sleep; one that misses shatters', () => {
    let hit = false;
    let miss = false;
    for (let seed = 1; seed <= 40 && !(hit && miss); seed++) {
      const s = make(seed);
      const j = orc(s.state, 9, 3, 200, 'nh:jackal');
      ent(s.state, j)!.c.actor!.speed = 0; // pinned
      const p = s.carry('nh:potion_of_sleeping');
      ent(s.state, p)!.c.item!.buc = 'uncursed';
      const { text } = throwDir(s, p, 'e');
      expect(ent(s.state, p)).toBeUndefined(); // gone either way
      expect(anyPotionOnFloor(s.state)).toBe(false);
      if (text.some((m) => /crashes on the jackal's head/.test(m))) {
        hit = true;
        expect(text).toContain('The jackal falls asleep.');
        expect(isFrozen({ state: s.state }, j)).toBe(true);
        expect(ent(s.state, j)!.c.monster!.peaceful).toBe(false);
      } else if (text.some((m) => / shatters!$/.test(m))) {
        miss = true;
        expect(isFrozen({ state: s.state }, j)).toBe(false);
      }
    }
    expect(hit).toBe(true);
    expect(miss).toBe(true);
  });

  test('a potion breaking next to her gives its vapors', () => {
    let found = false;
    for (let seed = 1; seed <= 10 && !found; seed++) {
      const s = make(seed, [' ..@. ', ' .... ']);
      const p = s.carry('nh:potion_of_blindness');
      ent(s.state, p)!.c.item!.buc = 'uncursed';
      const { text } = throwDir(s, p, 'e');
      if (!text.some((m) => / shatters!$/.test(m))) continue; // 1% stay whole
      found = true;
      expect(text).toContain('You smell a peculiar odor...');
      expect(text).toContain('It suddenly gets dark.');
      expect(hasProp(hero(s.state), P.BLINDED)).toBe(true);
      expect(floorDefs(s.state, 4, 0)).toEqual([]);
      expect(isKnown(s.state, defs, 'nh:potion_of_blindness' as DefId)).toBe(true);
    }
    expect(found).toBe(true);
  });
});

describe('the scroll of earth', () => {
  function earthOrc(s: Setup, buc: 'uncursed' | 'cursed' = 'uncursed') {
    const id = orc(s.state, 8, 3);
    const helm = give(s.state, id, 'nh:dwarvish_iron_helm');
    ent(s.state, helm)!.c.item!.equipped = 'helm';
    const sc = give(s.state, id, 'nh:scroll_of_earth');
    ent(s.state, sc)!.c.item!.buc = buc;
    return { id, sc };
  }
  const boulders = (s: Setup, x: number, y: number) =>
    floorDefs(s.state, x, y).filter((d) => d === 'nh:boulder').length;

  test('a hostile with a hard hat next to her reads it: boulders around it, on it and on her', () => {
    const s = make();
    const { id, sc } = earthOrc(s);
    const r = use(s.state, id);
    expect(r.kind).toBe('scr_earth');
    expect(r.text[0]).toMatch(/^The hill orc reads a scroll labeled .*!$/);
    expect(r.text).toContain('The ceiling rumbles above the hill orc!');
    expect(r.text).toContain('You are hit by a boulder!');
    expect(ent(s.state, sc)).toBeUndefined();
    expect(isKnown(s.state, defs, 'nh:scroll_of_earth' as DefId)).toBe(true);
    for (let x = 7; x <= 9; x++) for (let y = 2; y <= 4; y++) expect(boulders(s, x, y)).toBe(1);
    expect(hero(s.state).c.hp!.cur).toBeLessThan(500);
    expect(ent(s.state, id)?.c.monster).toBeDefined(); // 200 HP and a hard hat
  });

  test('a cursed one drops a boulder only on the reader', () => {
    const s = make();
    const { id } = earthOrc(s, 'cursed');
    const r = use(s.state, id);
    expect(r.kind).toBe('scr_earth');
    expect(r.text).not.toContain('You are hit by a boulder!');
    expect(boulders(s, 8, 3)).toBe(1);
    expect(boulders(s, 7, 3) + boulders(s, 9, 3) + boulders(s, 8, 2)).toBe(0);
    expect(hero(s.state).c.hp!.cur).toBe(500);
  });

  test('not from afar, and without a hard hat only sometimes (1 in 10)', () => {
    const s = make();
    const far = orc(s.state, 10, 3);
    const h = give(s.state, far, 'nh:dwarvish_iron_helm');
    ent(s.state, h)!.c.item!.equipped = 'helm';
    give(s.state, far, 'nh:scroll_of_earth');
    expect(kindOf(s.state, far)).toBeNull();
    let yes = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const t = make(seed);
      const id = orc(t.state, 8, 3);
      give(t.state, id, 'nh:scroll_of_earth');
      if (kindOf(t.state, id) === 'scr_earth') yes++;
    }
    expect(yes).toBeGreaterThan(0);
    expect(yes).toBeLessThan(20);
  });
});
