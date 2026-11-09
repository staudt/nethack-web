// m14 step 2: monster item use, the defensive items. A wounded hostile zaps itself with a wand of
// teleportation, reads a scroll of teleportation (cursed or confused: another level), digs a hole
// with a wand of digging and falls through, calls up monsters with a wand or scroll of create
// monster; a confused or stunned one uses a unicorn horn (or a unicorn its own horn) or eats a
// lizard corpse; a mercenary wakes sleeping soldiers with a bugle; and one lined up with her while
// she wields a cockatrice corpse zaps a wand of undead turning. Outcomes are asserted.
import {
  getLevel,
  getPlayer,
  inventoryOf,
  trapAt,
  type Ctx,
  type DefId,
  type EntityId,
  type GameState,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { mksobj } from '../src/index';
import { meating } from '../src/dog';
import { isKnown } from '../src/o_init';
import { isMConfused, isMStunned, setMblinded, setMConfused, setMStunned } from '../src/mstate';
import { findDefensive, useDefensive } from '../src/muse';
import { TRAP } from '../src/trap';
import { trapTable } from '../src/trapstate';
import { setTerrain, T } from '../src/terrain';
import { addMon } from './helpers';
import { ctxFor, defs, levelSetup, obj, plainKit, render } from './itemHelpers';

type S = ReturnType<typeof levelSetup>;

const ROOM = [
  '               ',
  ' ............. ',
  ' ............. ',
  ' ......@...... ',
  ' ............. ',
  ' ............. ',
  '               ',
];

function make(seed = 1, rows = ROOM): S {
  const s = levelSetup(rows, seed);
  plainKit(s.state);
  s.step({ type: 'wait' });
  return s;
}
const ent = (state: GameState, id: EntityId) => state.entities[String(id)];
const textOf = (r: StepResult): string[] =>
  r.events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );
/** A hill orc (or `def`) at (x, y), awake, with `hp` of 20 hit points. */
function orc(
  state: GameState,
  x: number,
  y: number,
  hp = 20,
  def = 'nh:hill_orc',
  o: { asleep?: boolean; peaceful?: boolean } = {},
): EntityId {
  const id = addMon(state, def, x, y, { asleep: false, energy: 12, ...o });
  const e = ent(state, id)!;
  e.c.hp = { cur: hp, max: 20 };
  e.c.monster!.level = 1;
  return id;
}
/** Gives the monster (or the hero) a new object. */
function give(
  state: GameState,
  mon: EntityId,
  otyp: string,
  o: { buc?: 'blessed' | 'cursed'; spe?: number; corpseOf?: string } = {},
) {
  const id = mksobj(ctxFor(state), obj(otyp), {
    init: false,
    carriedBy: mon,
    ...(o.corpseOf ? { corpseOf: o.corpseOf as DefId } : {}),
  });
  const it = state.entities[String(id)]!.c.item!;
  it.buc = o.buc ?? 'uncursed';
  if (o.spe !== undefined) it.spe = o.spe;
  return id;
}
const carried = (state: GameState, mon: EntityId) =>
  inventoryOf(state, mon).map((e) => e.def as string);
/**
 * findDefensive() then useDefensive() for the monster, outside its move (a confused or stunned
 * monster may recover at the start of dochug()); the messages, rendered.
 */
function use(state: GameState, id: EntityId): string[] {
  const ctx = ctxFor(state);
  const c = findDefensive(ctx as unknown as Ctx, id, false);
  if (c) useDefensive(ctx as unknown as Ctx, id, c);
  return ctx.events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );
}
const monsters = (state: GameState) =>
  Object.values(state.entities).filter((e) => e?.c.monster && e.c.pos?.level === 'dlvl1');

describe('teleportation', () => {
  test('a wounded hostile zaps itself with its wand of teleportation and lands elsewhere', () => {
    const s = make();
    const id = orc(s.state, 9, 3, 2);
    const w = give(s.state, id, 'nh:wand_of_teleportation', { spe: 3 });
    const t = textOf(s.step({ type: 'wait' }));
    expect(t.some((m) => /^The hill orc zaps itself with an? .*wand.*!$/.test(m))).toBe(true);
    const p = ent(s.state, id)!.c.pos!;
    expect(p.level).toBe('dlvl1');
    expect(p.x !== 9 || p.y !== 3).toBe(true);
    expect(ent(s.state, w)!.c.item!.spe).toBe(2);
    expect(isKnown(s.state, defs, 'nh:wand_of_teleportation' as DefId)).toBe(true);
  });

  test('an empty wand is not chosen; a scroll read in its place teleports and is used up', () => {
    const s = make();
    const id = orc(s.state, 9, 3, 2);
    give(s.state, id, 'nh:wand_of_teleportation', { spe: 0 });
    give(s.state, id, 'nh:scroll_of_teleportation');
    expect(findDefensive(s.ctx as unknown as Ctx, id, false)?.kind).toBe('scr_tele');
    const t = textOf(s.step({ type: 'wait' }));
    expect(t.some((m) => /^The hill orc reads a scroll .*!$/.test(m))).toBe(true);
    const p = ent(s.state, id)!.c.pos!;
    expect(p.level).toBe('dlvl1');
    expect(p.x !== 9 || p.y !== 3).toBe(true);
    expect(carried(s.state, id)).toEqual(['nh:wand_of_teleportation']);
    expect(isKnown(s.state, defs, 'nh:scroll_of_teleportation' as DefId)).toBe(true);
  });

  test('a blinded monster does not read its scroll', () => {
    const s = make();
    const id = orc(s.state, 9, 3, 2);
    give(s.state, id, 'nh:scroll_of_teleportation');
    expect(findDefensive(s.ctx as unknown as Ctx, id, false)?.kind).toBe('scr_tele');
    setMblinded(s.ctx, id, 20);
    expect(findDefensive(s.ctx as unknown as Ctx, id, false)).toBeNull();
  });

  test('a confused reader goes to another level, or shudders when the level comes up again', () => {
    let moved = 0;
    let shuddered = 0;
    for (let seed = 1; seed <= 30 && (moved === 0 || shuddered === 0); seed++) {
      const s = make(seed);
      const id = orc(s.state, 9, 3, 2);
      give(s.state, id, 'nh:scroll_of_teleportation');
      setMConfused(s.ctx, id, true);
      expect(findDefensive(s.ctx as unknown as Ctx, id, false)?.kind).toBe('scr_tele');
      const t = use(s.state, id);
      expect(t).toContain('Being confused, the hill orc mispronounces the magic words...');
      expect(inventoryOf(s.state, id).length).toBe(0);
      const to = trapTable(s.ctx, 'migrating', false)?.[String(id)];
      if (t.includes('The hill orc shudders for a moment.')) {
        shuddered++;
        expect(ent(s.state, id)!.c.pos?.level).toBe('dlvl1');
        expect(to).toBeUndefined();
      } else {
        moved++;
        expect(ent(s.state, id)!.c.pos).toBeUndefined();
        expect(typeof to).toBe('string');
        expect(to).not.toBe('dlvl1');
      }
    }
    expect(moved).toBeGreaterThan(0);
    expect(shuddered).toBeGreaterThan(0);
  });

  test('a cursed scroll is a level teleport too', () => {
    let moved = false;
    for (let seed = 1; seed <= 20 && !moved; seed++) {
      const s = make(seed);
      const id = orc(s.state, 9, 3, 2);
      give(s.state, id, 'nh:scroll_of_teleportation', { buc: 'cursed' });
      s.step({ type: 'wait' });
      const to = trapTable(s.ctx, 'migrating', false)?.[String(id)];
      if (to !== undefined) {
        moved = true;
        expect(to).not.toBe('dlvl1');
      }
    }
    expect(moved).toBe(true);
  });
});

describe('digging', () => {
  test('a wounded hostile zaps a wand of digging down: a hole, and it falls to the next level', () => {
    const s = make();
    const id = orc(s.state, 9, 3, 2);
    const w = give(s.state, id, 'nh:wand_of_digging', { spe: 4 });
    const t = textOf(s.step({ type: 'wait' }));
    expect(t.some((m) => /^The hill orc zaps an? [a-z ]+ wand!$/.test(m))).toBe(true);
    expect(t).toContain('The hill orc has made a hole in the floor.');
    expect(t).toContain('The hill orc falls through...');
    expect(ent(s.state, id)!.c.pos).toBeUndefined();
    expect(trapTable(s.ctx, 'migrating', false)?.[String(id)]).toBe('dlvl2');
    expect(ent(s.state, w)!.c.item!.spe).toBe(3);
    const hole = trapAt(getLevel(s.state), 9, 3);
    expect(hole?.def).toBe(TRAP.hole);
    expect(hole?.seen).toBe(true);
    expect(isKnown(s.state, defs, 'nh:wand_of_digging' as DefId)).toBe(true);
  });

  test('on furniture the digging ray is ineffective; in Sokoban or over a trap it is not tried', () => {
    const s = make();
    setTerrain(getLevel(s.state), 9, 3, T.fountain);
    const id = orc(s.state, 9, 3, 2);
    const w = give(s.state, id, 'nh:wand_of_digging', { spe: 4 });
    const t = textOf(s.step({ type: 'wait' }));
    expect(t).toContain('The digging ray is ineffective.');
    expect(ent(s.state, id)!.c.pos?.level).toBe('dlvl1');
    expect(ent(s.state, w)!.c.item!.spe).toBe(3);
    // a teleportation trap under it (not a pit, web or bear trap): no digging
    const s2 = make();
    getLevel(s2.state).traps.push({ def: TRAP.tele, x: 5, y: 2, seen: false });
    const id2 = orc(s2.state, 5, 2, 2);
    give(s2.state, id2, 'nh:wand_of_digging', { spe: 4 });
    // the orc stands on the trap: findDefensive picks the trap square itself first
    expect(findDefensive(s2.ctx as unknown as Ctx, id2, false)?.kind).toBe('teleport_trap');
    getLevel(s2.state).traps[0]!.def = TRAP.bear;
    // a bear trap is fine to dig through (the orc is not caught in it)
    expect(findDefensive(s2.ctx as unknown as Ctx, id2, false)?.kind).toBe('wan_digging');
    getLevel(s2.state).traps[0]!.def = TRAP.squeaky;
    expect(findDefensive(s2.ctx as unknown as Ctx, id2, false)).toBeNull();
  });
});

describe('create monster', () => {
  test('the wand makes one monster next to the zapper and uses a charge', () => {
    const s = make();
    const id = orc(s.state, 9, 3, 2);
    const w = give(s.state, id, 'nh:wand_of_create_monster', { spe: 2 });
    const before = monsters(s.state).length;
    const t = textOf(s.step({ type: 'wait' }));
    expect(t.some((m) => /^The hill orc zaps an? [a-z ]+ wand!$/.test(m))).toBe(true);
    expect(ent(s.state, w)!.c.item!.spe).toBe(1);
    // one new monster (or a small group of one kind) near it
    expect(monsters(s.state).length).toBeGreaterThan(before);
  });

  test('a confused reader calls up 13 or more acid blobs, and the scroll is used up', () => {
    const s = make();
    const id = orc(s.state, 9, 3, 2);
    give(s.state, id, 'nh:scroll_of_create_monster');
    setMConfused(s.ctx, id, true);
    const t = use(s.state, id);
    expect(t.some((m) => /^The hill orc reads a scroll .*!$/.test(m))).toBe(true);
    const blobs = monsters(s.state).filter((e) => e!.def === 'nh:acid_blob');
    expect(blobs.length).toBeGreaterThanOrEqual(13);
    expect(blobs.length).toBeLessThanOrEqual(17);
    expect(carried(s.state, id)).toEqual([]);
    expect(isKnown(s.state, defs, 'nh:scroll_of_create_monster' as DefId)).toBe(true);
  });
});

describe('unicorn horn and lizard corpse', () => {
  test('a confused monster uses its unicorn horn (not a cursed one), unhurt', () => {
    const s = make();
    const id = orc(s.state, 9, 3, 20);
    give(s.state, id, 'nh:unicorn_horn', { buc: 'cursed' });
    setMConfused(s.ctx, id, true);
    expect(findDefensive(s.ctx as unknown as Ctx, id, false)).toBeNull();
    give(s.state, id, 'nh:unicorn_horn');
    setMStunned(s.ctx, id, true);
    const t = use(s.state, id);
    expect(t).toContain('The hill orc uses a unicorn horn!');
    expect(t).toContain('The hill orc seems steadier now.');
    expect(isMConfused(s.ctx, id)).toBe(false);
    expect(isMStunned(s.ctx, id)).toBe(false);
    expect(carried(s.state, id).length).toBe(2); // horns are not used up
  });

  test('a stunned unicorn uses its own horn: the tip glows', () => {
    const s = make();
    const id = orc(s.state, 9, 3, 20, 'nh:white_unicorn');
    setMStunned(s.ctx, id, true);
    expect(findDefensive(s.ctx as unknown as Ctx, id, false)).toEqual({
      kind: 'unicorn_horn',
      obj: null,
    });
    const t = use(s.state, id);
    expect(t).toContain("The tip of the white unicorn's horn glows!");
    expect(isMStunned(s.ctx, id)).toBe(false);
  });

  test('a confused monster eats a lizard corpse: steadier, and the meal takes its time', () => {
    const s = make();
    const id = orc(s.state, 9, 3, 20);
    give(s.state, id, 'nh:corpse', { corpseOf: 'nh:lizard' });
    setMConfused(s.ctx, id, true);
    expect(findDefensive(s.ctx as unknown as Ctx, id, false)?.kind).toBe('lizard_corpse');
    const energy = ent(s.state, id)!.c.actor!.energy;
    const t = use(s.state, id);
    expect(t).toContain('The hill orc eats a lizard corpse.');
    expect(t).toContain('The hill orc seems steadier now.');
    expect(isMConfused(s.ctx, id)).toBe(false);
    expect(carried(s.state, id)).toEqual([]);
    // dog_nutrition(): 3 + (lizard weight >> 6) turns of eating
    expect(meating(s.ctx, id)).toBeGreaterThan(0);
    // "use up monster's next move"
    expect(ent(s.state, id)!.c.actor!.energy).toBe(energy - 12);
  });
});

describe('the bugle', () => {
  test('a wounded soldier seeing a sleeping soldier plays its bugle and wakes it', () => {
    const s = make();
    const id = orc(s.state, 9, 3, 2, 'nh:soldier');
    give(s.state, id, 'nh:bugle');
    const sleeper = orc(s.state, 11, 4, 20, 'nh:soldier', { asleep: true, peaceful: true });
    ent(s.state, sleeper)!.c.actor!.speed = 0;
    const t = textOf(s.step({ type: 'wait' }));
    expect(t).toContain('The soldier plays a bugle!');
    expect(ent(s.state, sleeper)!.c.monster!.asleep).toBe(false);
    expect(ent(s.state, sleeper)!.c.monster!.peaceful).toBe(false);
    expect(carried(s.state, id)).toEqual(['nh:bugle']);
  });

  test('no sleeping soldier in reach, no bugle call', () => {
    const s = make();
    const id = orc(s.state, 9, 3, 2, 'nh:soldier');
    give(s.state, id, 'nh:bugle');
    orc(s.state, 13, 1, 20, 'nh:soldier', { asleep: true }); // 4 squares away
    expect(findDefensive(s.ctx as unknown as Ctx, id, false)).toBeNull();
  });
});

describe('undead turning against a cockatrice corpse', () => {
  test('a hostile lined up with her zaps it: her carried corpses rise, "You shudder in dread."', () => {
    const s = make();
    const h = getPlayer(s.state);
    for (const o of inventoryOf(s.state, h.id)) if (o.c.item) o.c.item.equipped = null;
    const cocka = give(s.state, h.id, 'nh:corpse', { corpseOf: 'nh:cockatrice' });
    ent(s.state, cocka)!.c.item!.equipped = 'weapon';
    give(s.state, h.id, 'nh:corpse', { corpseOf: 'nh:jackal' });
    // unhurt and in line (row 3)
    const id = orc(s.state, 10, 3, 20);
    const w = give(s.state, id, 'nh:wand_of_undead_turning', { spe: 3 });
    expect(findDefensive(s.ctx as unknown as Ctx, id, false)).toEqual({
      kind: 'wan_undead_turning',
      obj: w,
      aim: { x: 7, y: 3 },
    });
    const t = textOf(s.step({ type: 'wait' }));
    expect(t.some((m) => /^The hill orc zaps an? [a-z ]+ wand!$/.test(m))).toBe(true);
    expect(t).toContain('You shudder in dread.');
    expect(ent(s.state, w)!.c.item!.spe).toBe(2);
    // both corpses rise: the jackal and the cockatrice (her hands are empty now)
    const pack = carried(s.state, h.id);
    expect(pack).not.toContain('nh:corpse');
    expect(monsters(s.state).some((e) => e!.def === 'nh:jackal')).toBe(true);
    expect(isKnown(s.state, defs, 'nh:wand_of_undead_turning' as DefId)).toBe(true);
  });

  test('not when out of line, nor for a peaceful monster', () => {
    const s = make();
    const h = getPlayer(s.state);
    for (const o of inventoryOf(s.state, h.id)) if (o.c.item) o.c.item.equipped = null;
    const cocka = give(s.state, h.id, 'nh:corpse', { corpseOf: 'nh:cockatrice' });
    ent(s.state, cocka)!.c.item!.equipped = 'weapon';
    const id = orc(s.state, 9, 4, 20); // a knight's move away
    give(s.state, id, 'nh:wand_of_undead_turning', { spe: 3 });
    expect(findDefensive(s.ctx as unknown as Ctx, id, false)).toBeNull();
    const p = orc(s.state, 10, 3, 20, 'nh:hill_orc', { peaceful: true });
    give(s.state, p, 'nh:wand_of_undead_turning', { spe: 3 });
    expect(findDefensive(s.ctx as unknown as Ctx, p, false)).toBeNull();
  });
});
