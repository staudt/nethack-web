import { type Buc, type DefId, type EntityId, type StepResult } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { SPELLBOOK_CLASSES, isKnown, shuffleAll } from '../src/o_init';
import { KEEN, knownSpells } from '../src/spell';
import { addMon } from './helpers';
import { defs, engine, levelSetup, render } from './itemHelpers';

type Setup = ReturnType<typeof levelSetup>;

const FORCE_BOLT = 'nh:spellbook_of_force_bolt';
const PROTECTION = 'nh:spellbook_of_protection';
const SLEEP = 'nh:spellbook_of_sleep';

function book(s: Setup, def: string, buc: Buc): EntityId {
  const id = s.carry(def);
  const it = s.state.entities[String(id)]?.c.item;
  if (!it) throw new Error('no item');
  it.buc = buc;
  return id;
}

/** One step only (no automatic continues), with its rendered messages. */
const once = (s: Setup, a: Parameters<typeof engine.step>[1]): string[] =>
  s.text(engine.step(s.state, a));
const readOnce = (s: Setup, id: EntityId) =>
  once(s, { type: 'mod', action: 'nh:read', args: { item: id } });
const read = (s: Setup, id: EntityId): StepResult => s.mod('nh:read', { item: id });
const learned = (s: Setup) => knownSpells(s.ctx).map((k) => k.id);
const studying = (s: Setup) =>
  s.state.occupation?.action.type === 'mod' && s.state.occupation.action.action === 'nh:learn';

describe('studying a spellbook', () => {
  test('a blessed book is always learned after its delay, and identified', () => {
    let tested = 0;
    for (let seed = 1; seed <= 15; seed++) {
      const s = levelSetup(undefined, seed);
      shuffleAll(s.ctx, SPELLBOOK_CLASSES);
      // a dull-looking book may put the hero to sleep first: not this case, skip the seed
      if (s.state.appearances[FORCE_BOLT] === 'nh:dull_spellbook') continue;
      const b = book(s, FORCE_BOLT, 'blessed');
      expect(isKnown(s.state, defs, FORCE_BOLT)).toBe(false);
      expect(readOnce(s, b)).toEqual(['You begin to memorize the runes.']);
      expect(studying(s)).toBe(true);
      // force bolt: level 1, oc_delay 2 -> two busy moves, then the spell is learned
      let moves = 0;
      let last: string[] = [];
      while (studying(s) && moves < 10) {
        last = once(s, { type: 'continue' });
        moves++;
      }
      // a randomly spawned monster coming into view interrupts: not this case, skip the seed
      if (last[0] === 'You stop studying.') continue;
      tested++;
      expect(moves).toBe(3);
      expect(last).toEqual(['You learn the "force bolt" spell.']);
      expect(learned(s)).toEqual([FORCE_BOLT]);
      expect(knownSpells(s.ctx)[0]?.retention).toBe(KEEN);
      expect(isKnown(s.state, defs, FORCE_BOLT)).toBe(true);
      expect(s.state.entities[String(b)]).toBeDefined();
      once(s, { type: 'wait' });
      expect(knownSpells(s.ctx)[0]?.retention).toBe(KEEN - 1); // age_spells()
    }
    expect(tested).toBeGreaterThanOrEqual(10);
  });

  test('a monster interrupts the study, and reading the book again resumes it', () => {
    const s = levelSetup(['.....', '..@..', '.....']);
    // a dull-looking book may put the hero to sleep first: swap its look with force bolt's
    const look = s.state.appearances;
    if (look[PROTECTION] === 'nh:dull_spellbook')
      [look[PROTECTION], look[FORCE_BOLT]] = [look[FORCE_BOLT], look[PROTECTION]] as [DefId, DefId];
    const b = book(s, PROTECTION, 'blessed');
    expect(readOnce(s, b)).toEqual(['You begin to memorize the runes.']);
    const newt = addMon(s.state, 'nh:newt', 3, 1);
    s.state.entities[String(newt)]!.c.actor!.speed = 0; // pinned
    expect(once(s, { type: 'continue' })).toEqual(['You stop studying.']);
    expect(s.state.occupation).toBeNull();
    expect(learned(s)).toEqual([]);
    delete s.state.entities[String(newt)];
    const r = read(s, b);
    expect(s.text(r)[0]).toBe('You continue your efforts to memorize the spell.');
    expect(s.text(r)).toContain('You learn the "protection" spell.');
    expect(learned(s)).toEqual([PROTECTION]);
  });

  test('a too difficult uncursed book fails with a cursed_book effect and teaches nothing', () => {
    const effects = new Set<string>();
    let crumbled = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const s = levelSetup(undefined, seed);
      s.hero.c.attributes!.int = 3; // read ability 3 + 4 + 0 - 2 * 3 = 1
      const b = book(s, SLEEP, 'uncursed');
      const turn = s.state.turn;
      const text = s.text(read(s, b));
      if (text[0] === 'You begin to memorize the runes.') continue; // rnd(20) <= 1
      // sleep is level 3: rn2(3) picks the teleport (not ported), aggravate or blindness
      const effect = text[0] ?? '';
      effects.add(effect);
      expect(learned(s)).toEqual([]);
      expect(studying(s)).toBe(false);
      // nomul(delay): the study time is spent helpless (level 3, oc_delay 1 -> 2 turns)
      expect(s.state.turn - turn).toBeGreaterThanOrEqual(3);
      if (text.includes('The spellbook crumbles to dust!')) {
        crumbled++;
        expect(s.state.entities[String(b)]).toBeUndefined();
      } else expect(s.state.entities[String(b)]).toBeDefined();
    }
    expect(effects).toContain('You feel a wrenching sensation.');
    expect(effects).toContain('You feel threatened.');
    expect(effects).toContain('A cloud of darkness falls upon you.'); // make_blinded(.., TRUE)
    expect(crumbled).toBeGreaterThan(0);
  });

  test('a cursed book never teaches its spell', () => {
    let tested = 0;
    for (let seed = 1; seed <= 15; seed++) {
      const s = levelSetup(undefined, seed);
      // a dull-looking book may put the hero to sleep first: not this case, skip the seed
      if (s.state.appearances[FORCE_BOLT] === 'nh:dull_spellbook') continue;
      tested++;
      const b = book(s, FORCE_BOLT, 'cursed');
      const text = s.text(read(s, b));
      // level 1: rn2(1) is always the "teleport"
      expect(text[0]).toBe('You feel a wrenching sensation.');
      expect(learned(s)).toEqual([]);
    }
    expect(tested).toBeGreaterThan(10);
  });

  test('blank paper is all blank and becomes known', () => {
    const s = levelSetup();
    const b = book(s, 'nh:spellbook_of_blank_paper', 'uncursed');
    expect(isKnown(s.state, defs, 'nh:spellbook_of_blank_paper')).toBe(false);
    expect(s.text(read(s, b))).toEqual(['This spellbook is all blank.']);
    expect(isKnown(s.state, defs, 'nh:spellbook_of_blank_paper')).toBe(true);
    expect(learned(s)).toEqual([]);
  });

  test('re-reading a known book refreshes the retention', () => {
    const s = levelSetup();
    const b = book(s, FORCE_BOLT, 'blessed');
    read(s, b);
    const spell = knownSpells(s.ctx)[0]!;
    // well remembered: asks first; 'no' costs nothing
    const turn = s.state.turn;
    expect(readOnce(s, b)).toEqual(['You know "force bolt" quite well already.']);
    expect(s.state.pendingPrompt?.prompt.id).toBe('spell-refresh');
    engine.step(s.state, { type: 'answer', promptId: 'spell-refresh', value: false });
    expect(s.state.turn).toBe(turn);
    // nearly forgotten: studies again without asking
    spell.retention = 1500;
    const text = s.text(read(s, b));
    expect(text).toContain('Your knowledge of "force bolt" is keener.');
    expect(knownSpells(s.ctx)[0]?.retention).toBe(KEEN);
    expect(learned(s)).toEqual([FORCE_BOLT]);
  });
});

describe('the Spells menu', () => {
  test('is offered on the hero and lists the known spells with level, school, fail and retention', () => {
    const s = levelSetup();
    const offers = engine.query(s.state).actionsFor({ kind: 'self' });
    expect(offers.some((o) => o.action.type === 'mod' && o.action.action === 'nh:spells')).toBe(
      true,
    );
    expect(s.text(s.mod('nh:spells'))).toEqual(["You don't know any spells right now."]);
    read(s, book(s, FORCE_BOLT, 'blessed'));
    read(s, book(s, 'nh:spellbook_of_cure_blindness', 'blessed'));
    knownSpells(s.ctx)[1]!.retention = 9000;
    s.hero.c.attributes!.wis = 12;
    const turn = s.state.turn;
    const r = s.mod('nh:spells');
    expect(s.state.turn).toBe(turn);
    const list = r.events.find((e) => e.type === 'list');
    if (list?.type !== 'list') throw new Error('no list');
    expect(render({ key: list.titleKey })).toBe('Currently known spells');
    const lines = list.items.map((m) => render(m));
    expect(lines.slice(1)).toEqual([
      // Wis 12, XL 1: (66 + 15) * 10 / 15 - 10 = 44% success; a few turns later; unskilled: 25% steps
      'a - force bolt (level 1, attack) 56% fail, 76%-100%',
      // level 2: 66 - isqrt(4700) < 0, so 0% success
      'b - cure blindness (level 2, healing) 100% fail, 26%-50%',
    ]);
  });
});
