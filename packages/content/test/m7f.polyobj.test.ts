// m7f-d step 1: the polymorph objects (objects.h order, properties), the polymorph trap kind, the
// hero's gender and the amulet of change. The hero's polymorph is m7f.polyself.test.ts: here the trap, wand,
// spell and potion reach it (monsters and objects: m7f.newcham.test.ts).
import {
  getLevel,
  getPlayer,
  trapAt,
  type Ctx,
  type DefId,
  type Level,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { CAST_BOOKS, isKnown } from '../src/index';
import { enlightenment } from '../src/enlightenment';
import { heroFemale, polyGender, setHeroFemale } from '../src/gender';
import { mksobj } from '../src/items';
import { traptypeRnd } from '../src/mklev';
import { P, hasProp, setIntrinsic } from '../src/props';
import { spellSkill } from '../src/spellcalc';
import { couldSeduce } from '../src/steal';
import { TRAP, floorTrigger, isMagicalTrap } from '../src/trap';
import { addMon } from './helpers';
import { ctxFor, defs, engine, itemOf, levelSetup, obj, plainKit, render } from './itemHelpers';

const ROOM = ['       ', ' ..... ', ' .@... ', ' ..... ', '       '];
type S = ReturnType<typeof levelSetup>;
function room(seed = 1): S {
  const s = levelSetup(ROOM, seed);
  plainKit(s.state);
  s.step({ type: 'wait' });
  return s;
}
const answer = (s: S, value: unknown): StepResult => {
  const p = s.state.pendingPrompt?.prompt;
  if (!p) throw new Error('no prompt');
  return engine.step(s.state, { type: 'answer', promptId: p.id, value: value as never });
};
const ids = (cls: string): DefId[] => defs.objects.filter((d) => d.class === cls).map((d) => d.id);
const after = (cls: string, id: string): string | undefined => {
  const list = ids(cls);
  return list[list.indexOf(id as DefId) + 1];
};
const addTrap = (level: Level, def: string, x: number, y: number, seen = false) => {
  level.traps.push({ def: def as DefId, x, y, seen });
};

describe('the objects', () => {
  test('objects.h order and data', () => {
    expect(after('wand', 'nh:wand_of_undead_turning')).toBe('nh:wand_of_polymorph');
    expect(after('ring', 'nh:ring_of_teleport_control')).toBe('nh:ring_of_polymorph');
    expect(after('ring', 'nh:ring_of_polymorph')).toBe('nh:ring_of_polymorph_control');
    expect(after('amulet', 'nh:amulet_versus_poison')).toBe('nh:amulet_of_change');
    expect(after('amulet', 'nh:amulet_of_change')).toBe('nh:amulet_of_unchanging');
    expect(after('potion', 'nh:potion_of_full_healing')).toBe('nh:potion_of_polymorph');
    expect(after('spellbook', 'nh:spellbook_of_turn_undead')).toBe('nh:spellbook_of_polymorph');
    expect(defs.object('nh:wand_of_polymorph').wand?.dir).toBe('immediate');
    expect(defs.object('nh:ring_of_polymorph').prop).toBe(P.POLYMORPH);
    expect(defs.object('nh:ring_of_polymorph_control').prop).toBe(P.POLYMORPH_CONTROL);
    expect(defs.object('nh:amulet_of_unchanging').prop).toBe(P.UNCHANGING);
    expect(defs.object('nh:amulet_of_change').prop).toBeUndefined();
    expect(defs.object('nh:spellbook_of_polymorph').spellbook?.level).toBe(6);
    expect(spellSkill('nh:spellbook_of_polymorph')).toBe('matter_spell');
    expect(CAST_BOOKS).toContain('nh:spellbook_of_polymorph');
  });

  test('worn, the rings and the amulet of unchanging confer their properties', () => {
    const s = room();
    const h = getPlayer(s.state);
    const ring = s.carry('nh:ring_of_polymorph_control');
    s.mod('nh:puton', { item: ring });
    if (s.state.pendingPrompt) answer(s, 'l');
    expect(hasProp(h, P.POLYMORPH_CONTROL)).toBe(true);
    const ring2 = s.carry('nh:ring_of_polymorph');
    s.mod('nh:puton', { item: ring2 });
    if (s.state.pendingPrompt) answer(s, 'r');
    expect(hasProp(h, P.POLYMORPH)).toBe(true);
    s.mod('nh:puton', { item: s.carry('nh:amulet_of_unchanging') });
    expect(hasProp(h, P.UNCHANGING)).toBe(true);
    const lines = enlightenment(s.ctx as unknown as Ctx).map((m) => render(m));
    expect(lines).toContain('You can not change from your current form.');
    expect(lines).toContain(
      'You would polymorph periodically if not locked into your current form.',
    );
    expect(lines).not.toContain('You are polymorphing periodically.');
    expect(lines).toContain('You have polymorph control.');
  });

  test('mksobj_init(): amulets of change and rings of polymorph are usually cursed', () => {
    const s = room();
    for (const id of ['nh:amulet_of_change', 'nh:ring_of_polymorph', 'nh:ring_of_teleportation']) {
      let cursed = 0;
      for (let i = 0; i < 200; i++)
        if (itemOf(s.state, mksobj(s.ctx, obj(id), { init: true })).buc === 'cursed') cursed++;
      // rn2(10) curses 9 in 10, then blessorcurse() may curse some more
      expect(cursed, id).toBeGreaterThan(160);
    }
  });
});

describe('the amulet of change', () => {
  test('"You are suddenly very masculine!", then feminine again; it disintegrates', () => {
    const s = room();
    expect(heroFemale(s.state)).toBe(true);
    const am = s.carry('nh:amulet_of_change');
    const text = s.text(s.mod('nh:puton', { item: am }));
    expect(text.slice(-2)).toEqual([
      'You are suddenly very masculine!',
      'The amulet disintegrates!',
    ]);
    expect(text[0]).toMatch(/amulet of change \(being worn\)/);
    expect(s.state.entities[String(am)]).toBeUndefined();
    expect(heroFemale(s.state)).toBe(false);
    expect(polyGender(s.state)).toBe(0);
    expect(isKnown(s.state, defs, 'nh:amulet_of_change')).toBe(true);
    const text2 = s.text(s.mod('nh:puton', { item: s.carry('nh:amulet_of_change') }));
    expect(text2).toContain('You are suddenly very feminine!');
    expect(heroFemale(s.state)).toBe(true);
    // the start is stored as no entry
    expect((s.state.modData['nh'] as Record<string, unknown>)['ugender']).toBeUndefined();
  });

  test('Unchanging: "You don\'t feel like yourself." and it still disintegrates', () => {
    const s = room();
    setIntrinsic(getPlayer(s.state), P.UNCHANGING, true);
    const am = s.carry('nh:amulet_of_change');
    const text = s.text(s.mod('nh:puton', { item: am }));
    expect(text.slice(-2)).toEqual(["You don't feel like yourself.", 'The amulet disintegrates!']);
    expect(heroFemale(s.state)).toBe(true);
    expect(isKnown(s.state, defs, 'nh:amulet_of_change')).toBe(false);
    expect(s.state.entities[String(am)]).toBeUndefined();
  });
});

describe("the hero's gender", () => {
  test('could_seduce(): a nymph and a female hero is "wrong gender" (2), a male one 1', () => {
    const s = room();
    const id = addMon(s.state, 'nh:water_nymph', 4, 2, { asleep: true });
    const nymph = s.state.entities[String(id)]!;
    const hero = getPlayer(s.state);
    const ctx = ctxFor(s.state);
    expect(couldSeduce(ctx, nymph, hero, null)).toBe(2);
    setHeroFemale(s.state, false);
    expect(couldSeduce(ctx, nymph, hero, null)).toBe(1);
  });
});

describe('the polymorph trap', () => {
  test('kind 22, from difficulty 8; a magical trap that is not a floor trigger', () => {
    const rng22 = { rng: { rnd: () => 22, rn2: () => 0 } } as never;
    expect(traptypeRnd(rng22, 7)).toBeNull();
    expect(traptypeRnd(rng22, 8)).toBe(TRAP.poly);
    expect(isMagicalTrap(TRAP.poly)).toBe(true);
    expect(floorTrigger(TRAP.poly)).toBe(false);
    const def = engine.registry.traps.find((t) => t.id === TRAP.poly);
    expect(def?.glyph).toEqual({ ch: '^', fg: '#55ff55' }); // S_polymorph_trap, bright green
  });

  test('stepping on it uses it up: "You feel a change coming over you."', () => {
    const s = room();
    addTrap(getLevel(s.state), TRAP.poly, 3, 2);
    const text = s.text(s.step({ type: 'move', dir: 'e' }));
    expect(text).toContain('You step onto a polymorph trap!');
    expect(text).toContain('You feel a change coming over you.');
    expect(trapAt(getLevel(s.state), 3, 2)).toBeUndefined();
  });

  test('magic resistance or Unchanging: "You feel momentarily different." and it stays', () => {
    for (const prop of [P.ANTIMAGIC, P.UNCHANGING]) {
      const s = room();
      setIntrinsic(getPlayer(s.state), prop, true);
      addTrap(getLevel(s.state), TRAP.poly, 3, 2);
      const text = s.text(s.step({ type: 'move', dir: 'e' }));
      expect(text, prop).toContain('You feel momentarily different.');
      expect(trapAt(getLevel(s.state), 3, 2)?.def).toBe(TRAP.poly);
      expect(trapAt(getLevel(s.state), 3, 2)?.seen).toBe(true);
    }
  });

  test('levitating, she still sets it off ("You float onto a polymorph trap!")', () => {
    const s = room();
    setIntrinsic(getPlayer(s.state), P.LEVITATION, true);
    addTrap(getLevel(s.state), TRAP.poly, 3, 2);
    const text = s.text(s.step({ type: 'move', dir: 'e' }));
    expect(text).toContain('You float onto a polymorph trap!');
    expect(trapAt(getLevel(s.state), 3, 2)).toBeUndefined();
  });
});

describe('the potion, the wand and the spell (the polymorph itself: m7f.polyself.test.ts)', () => {
  test('the potion: "You feel a little strange." and it is identified', () => {
    const s = room();
    const p = s.carry('nh:potion_of_polymorph');
    const text = s.text(s.mod('nh:quaff', { item: p }));
    expect(text).toContain('You feel a little strange.');
    expect(isKnown(s.state, defs, 'nh:potion_of_polymorph')).toBe(true);
    setIntrinsic(getPlayer(s.state), P.HALLUC, true);
    const text2 = s.text(s.mod('nh:quaff', { item: s.carry('nh:potion_of_polymorph') }));
    expect(text2).toContain('You feel a little normal.');
  });

  test('the wand zapped at herself is learned, unless Unchanging', () => {
    for (const unchanging of [false, true]) {
      const s = room();
      if (unchanging) setIntrinsic(getPlayer(s.state), P.UNCHANGING, true);
      const w = s.carry('nh:wand_of_polymorph');
      itemOf(s.state, w).spe = 5;
      s.mod('nh:zap', { item: w });
      answer(s, 'self');
      expect(isKnown(s.state, defs, 'nh:wand_of_polymorph'), String(unchanging)).toBe(!unchanging);
    }
  });
});
