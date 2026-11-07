// m7d step 7: the wands of undead turning (undead hurt and fleeing, corpses revived on the floor,
// under her with a down zap, in her pack when zapped at herself) and enlightenment (the
// attribute list). Outcomes are asserted; nothing depends on a lucky seed (kobold zombies
// never resist a wand: magic resistance 0).
import { inventoryOf, type Ctx, type EntityId, type StepResult } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { WAN, isKnown, updateWornProps } from '../src/index';
import { mksobj } from '../src/items';
import { isFleeing } from '../src/monflee';
import { revive } from '../src/revive';
import { setU } from '../src/luck';
import { addMon } from './helpers';
import { ctxFor, defs, engine, itemOf, levelSetup, plainKit, render } from './itemHelpers';

type S = ReturnType<typeof levelSetup>;

/** Wands are known by name here (their appearances are dropped); no monsters. */
function make(rows: string[], seed = 1): S {
  const s = levelSetup(rows, seed);
  plainKit(s.state);
  for (const d of defs.objects) if (d.class === 'wand') delete s.state.appearances[d.id];
  for (const k of Object.keys(s.state.entities))
    if (s.state.entities[k]?.c.monster) delete s.state.entities[k];
  s.step({ type: 'wait' }); // vision for the new level
  return s;
}
function wand(s: S, id: string, spe = 5): EntityId {
  const e = s.carry(id);
  itemOf(s.state, e).spe = spe;
  return e;
}
const textOf = (r: StepResult): string[] =>
  r.events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );
/** Zaps the wand; directional wands get `dir`. All messages of the zap, rendered. */
function zap(s: S, id: EntityId, dir?: string): { text: string[]; result: StepResult } {
  const r = s.mod('nh:zap', { item: id });
  const out = s.text(r);
  const p = s.state.pendingPrompt?.prompt;
  if (!p) return { text: out, result: r };
  const r2 = engine.stepAll(s.state, {
    type: 'answer',
    promptId: p.id,
    value: (dir ?? null) as never,
  });
  return { text: [...out, ...textOf(r2)], result: r2 };
}
/** A pinned monster (speed 0) with `hp` hit points. */
function pinned(s: S, def: string, x: number, y: number, hp = 100): EntityId {
  const m = addMon(s.state, def, x, y);
  const e = s.state.entities[String(m)]!;
  e.c.hp = { cur: hp, max: hp };
  e.c.actor!.speed = 0;
  return m;
}
function corpse(s: S, of: string, x: number, y: number, quantity = 1): EntityId {
  return mksobj(s.ctx as unknown as Ctx, defs.object('nh:corpse'), {
    init: false,
    corpseOf: of as never,
    quantity,
    at: { level: 'dlvl1', x, y },
  });
}
const monsOf = (s: S, def: string) =>
  Object.values(s.state.entities).filter((e) => e.c.monster && e.def === def);
const exists = (s: S, id: EntityId) => s.state.entities[String(id)] !== undefined;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

describe('wand of undead turning', () => {
  test('a pinned zombie is hurt (1..8) and turns to flee; the wand is not learned by that', () => {
    const s = make(['@.....']);
    const z = pinned(s, 'nh:kobold_zombie', 3, 0);
    const w = wand(s, WAN.undeadTurning);
    const { text } = zap(s, w, 'e');
    const hp = s.state.entities[String(z)]!.c.hp!.cur;
    expect(hp).toBeLessThan(100);
    expect(hp).toBeGreaterThanOrEqual(92);
    expect(isFleeing(ctxFor(s.state), z)).toBe(true);
    expect(text).toContain('The kobold zombie turns to flee.');
  });

  test('a living monster is not hurt; a zombie killed by the zap does not rise from its corpse', () => {
    // whether the zombie leaves a corpse is a roll: look at several seeds, and require some
    let corpses = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const s = make(['@.....'], seed);
      const j = pinned(s, 'nh:jackal', 2, 0);
      const z = pinned(s, 'nh:kobold_zombie', 3, 0, 1);
      const w = wand(s, WAN.undeadTurning);
      zap(s, w, 'e');
      expect(s.state.entities[String(j)]!.c.hp!.cur).toBe(100);
      expect(exists(s, z)).toBe(false);
      // its kobold corpse is bypassed by the same beam
      expect(monsOf(s, 'nh:kobold')).toHaveLength(0);
      corpses += Object.values(s.state.entities).filter((e) => e.def === 'nh:corpse').length;
    }
    expect(corpses).toBeGreaterThan(0);
  });

  test('a jackal corpse in the beam rises as a jackal; the corpse is used up and the wand learned', () => {
    const s = make(['@.....']);
    const c = corpse(s, 'nh:jackal', 3, 0);
    const w = wand(s, WAN.undeadTurning);
    const { text } = zap(s, w, 'e');
    expect(exists(s, c)).toBe(false);
    expect(monsOf(s, 'nh:jackal')).toHaveLength(1);
    expect(text).toContain('The jackal corpse glows iridescently.');
    expect(text).toContain('The jackal is resurrected!');
    expect(isKnown(s.state, defs, WAN.undeadTurning)).toBe(true);
  });

  test('revive(): on the corpse spot, next to it when taken; one of a stack; HP of a partly eaten one', () => {
    const s = make(['@.....', '......', '......']);
    const ctx = ctxFor(s.state) as unknown as Ctx;
    // free spot: the jackal is made right there, with a fresh monster's HP
    const c1 = corpse(s, 'nh:jackal', 4, 1);
    const r1 = revive(ctx, s.state.entities[String(c1)]!, true);
    expect(r1?.mon.c.pos).toMatchObject({ x: 4, y: 1 });
    expect(r1?.mon.c.hp?.cur).toBe(r1?.mon.c.hp?.max);
    expect(exists(s, c1)).toBe(false);
    // a monster on the spot: the nearest free square
    pinned(s, 'nh:newt', 2, 1);
    const c2 = corpse(s, 'nh:jackal', 2, 1, 3);
    const r2 = revive(ctx, s.state.entities[String(c2)]!, true);
    const p2 = r2!.mon.c.pos!;
    expect(dist(p2, { x: 2, y: 1 })).toBe(1);
    expect(itemOf(s.state, c2).quantity).toBe(2); // one of the stack
    // partly eaten: eaten_stat() scales the new monster's HP (at least 1)
    const c3 = corpse(s, 'nh:jackal', 5, 2);
    itemOf(s.state, c3).eaten = 1;
    const r3 = revive(ctx, s.state.entities[String(c3)]!, true);
    expect(r3?.mon.c.hp?.cur).toBe(1);
  });

  test('zapped down, the corpse under her rises next to her', () => {
    const s = make(['.....', '..@..', '.....']);
    const c = corpse(s, 'nh:jackal', 2, 1);
    const w = wand(s, WAN.undeadTurning);
    const { text } = zap(s, w, 'down');
    expect(exists(s, c)).toBe(false);
    const [j] = monsOf(s, 'nh:jackal');
    expect(j).toBeDefined();
    expect(dist(j!.c.pos!, { x: 2, y: 1 })).toBe(1);
    expect(text).toContain('The jackal corpse glows iridescently.');
  });

  test('zapped at herself, a carried corpse comes alive: "It suddenly comes alive!", "You shudder in dread."', () => {
    const s = make(['.....', '..@..', '.....']);
    const c = s.carry('nh:corpse', { corpseOf: 'nh:jackal' as never, quantity: 2 });
    const w = wand(s, WAN.undeadTurning);
    const { text } = zap(s, w, 'self');
    expect(text).toContain('One of your jackal corpses glows iridescently.');
    expect(text).toContain('It suddenly comes alive!');
    expect(text).toContain('You shudder in dread.');
    expect(itemOf(s.state, c).quantity).toBe(1);
    expect(inventoryOf(s.state, s.state.playerId).some((o) => o.id === c)).toBe(true);
    expect(monsOf(s, 'nh:jackal')).toHaveLength(1);
    expect(isKnown(s.state, defs, WAN.undeadTurning)).toBe(true);
  });

  test('zapped at herself with no corpse: only "You shudder in dread."', () => {
    const s = make(['.....', '..@..', '.....']);
    const w = wand(s, WAN.undeadTurning);
    expect(zap(s, w, 'self').text).toEqual(['You shudder in dread.']);
  });
});

describe('wand of enlightenment', () => {
  test('lists what she is: levitating, stealthy, very lucky; the wand is learned', () => {
    const s = make(['.....', '..@..', '.....']);
    for (const r of ['nh:ring_of_levitation', 'nh:ring_of_stealth'] as const) {
      const id = s.carry(r);
      itemOf(s.state, id).equipped = r === 'nh:ring_of_levitation' ? 'ringL' : 'ringR';
    }
    updateWornProps(s.state, defs, s.state.playerId);
    setU(ctxFor(s.state), { luck: 6 });
    const w = wand(s, WAN.enlightenment);
    const { text, result } = zap(s, w);
    expect(text[0]).toBe('You feel self-knowledgeable...');
    expect(text).toContain('The feeling subsides.');
    const list = result.events.find((e) => e.type === 'list');
    expect(list?.type === 'list' && list.titleKey).toBe('enl.title');
    const lines = list?.type === 'list' ? list.items.map((m) => render(m)) : [];
    expect(lines).toContain('You are levitating.');
    expect(lines).toContain('You are stealthy.');
    expect(lines).toContain('You are very lucky.');
    expect(lines).toContain('You are not hungry.');
    expect(lines).toContain('You are nominally aligned.');
    expect(lines).not.toContain('You are telepathic.');
    expect(isKnown(s.state, defs, WAN.enlightenment)).toBe(true);
  });
});
