// m7f-d step 2: monsters and objects polymorph. newcham() (forms, hit points, armor, weapons,
// messages), system shock, the polymorph trap on monsters and the iron shoes branch, poly_obj()
// and polypiling (resisting, shuddering, statues), kicking boots.
import {
  getLevel,
  getPlayer,
  inventoryOf,
  itemsAt,
  trapAt,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type MonsterDef,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { adjLev } from '../src/generation';
import { mksobj } from '../src/items';
import { newcham, polyok } from '../src/newcham';
import { objShudders, objUnpolyable, polyObj } from '../src/polyobj';
import { P, setIntrinsic } from '../src/props';
import { TRAP, mintrap } from '../src/trap';
import { addMon, setup } from './helpers';
import { ctxFor, defs, engine, itemOf, levelSetup, obj, plainKit, render } from './itemHelpers';
import { T } from '../src/terrain';

const ROOM = ['         ', ' ....... ', ' ..@.... ', ' ....... ', '         '];
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
const ent = (s: S, id: EntityId): Entity | undefined => s.state.entities[String(id)];
const ctxOf = (s: S): Ctx => s.ctx as unknown as Ctx;
const said = (s: S): string[] =>
  s.ctx.events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );
const mon = (id: string): MonsterDef => defs.monster(id as DefId);
/** A monster next to her (east), awake, with `hp` of `max`. */
function jackal(s: S, def = 'nh:jackal', hp = 3, max = 6): Entity {
  const id = addMon(s.state, def, 4, 2);
  const e = ent(s, id)!;
  e.c.hp = { cur: hp, max };
  return e;
}
const wear = (s: S, m: Entity, otyp: string, slot: string): EntityId => {
  const id = mksobj(s.ctx, obj(otyp), { init: false, carriedBy: m.id });
  itemOf(s.state, id).equipped = slot as never;
  return id;
};

describe('newcham()', () => {
  test('a given form: level and hit points rolled for it, the old fraction kept, its speed', () => {
    const s = room();
    const m = jackal(s);
    const to = mon('nh:gnome_lord');
    expect(newcham(ctxOf(s), m, to, { msg: true })).toBe(true);
    expect(m.def).toBe(to.id);
    expect(m.c.monster?.level).toBe(adjLev(to, 1, 1));
    const hp = m.c.hp!;
    expect(hp.cur).toBe(Math.max(1, Math.trunc((3 * hp.max) / 6)));
    expect(m.c.actor?.speed).toBe(to.speed);
    expect(said(s)).toContain('The jackal turns into a gnome lord!');
    // the same form again changes nothing
    expect(newcham(ctxOf(s), m, to, { msg: true })).toBe(false);
  });

  test('a pet stays tame: "Your jackal turns into a gnome lord!"', () => {
    const s = room();
    const m = jackal(s);
    m.c.monster!.tame = 10;
    m.c.monster!.peaceful = true;
    newcham(ctxOf(s), m, mon('nh:gnome_lord'), { msg: true });
    expect(said(s)).toContain('Your jackal turns into a gnome lord!');
    expect(m.c.monster?.tame).toBe(10);
    expect(m.c.monster?.peaceful).toBe(true);
  });

  test('unseen before and after, nothing is said', () => {
    const s = room();
    setIntrinsic(getPlayer(s.state), P.BLINDED, true);
    s.step({ type: 'wait' }); // her view goes dark
    const m = jackal(s);
    expect(newcham(ctxOf(s), m, mon('nh:gnome_lord'), { msg: true })).toBe(true);
    expect(said(s).filter((t) => /turns into|appears|disappears/.test(t))).toEqual([]);
  });

  test('random forms are polyok() and never placeholders; inventory is kept', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const s = room(seed);
      const m = jackal(s);
      const gem = mksobj(s.ctx, obj('nh:rock'), { init: false, carriedBy: m.id });
      if (!newcham(ctxOf(s), m, null)) continue;
      const d = mon(m.def);
      expect(polyok(d), d.id).toBe(true);
      expect(['nh:orc', 'nh:giant', 'nh:elf', 'nh:human']).not.toContain(d.id);
      expect(d.id).not.toBe('nh:jackal');
      expect(itemOf(s.state, gem).carriedBy).toBe(m.id);
      seen.add(d.id);
    }
    expect(seen.size).toBeGreaterThan(20);
  });

  test('a big form breaks out of suit and cloak and drops what it cannot wear', () => {
    const s = room();
    const m = jackal(s, 'nh:dwarf');
    const body = wear(s, m, 'nh:dwarvish_mithril_coat', 'body');
    const cloak = wear(s, m, 'nh:dwarvish_cloak', 'cloak');
    const helm = wear(s, m, 'nh:dwarvish_iron_helm', 'helm');
    const boots = wear(s, m, 'nh:iron_shoes', 'boots');
    // large, no hands, not humanoid
    const big = defs.monsters.find(
      (d) =>
        polyok(d) &&
        (d.size === 'large' || d.size === 'huge') &&
        d.flags.includes('nohands') &&
        !d.flags.includes('humanoid'),
    )!;
    newcham(ctxOf(s), m, big, { msg: true });
    const out = said(s);
    expect(out.some((t) => t.startsWith('The dwarf turns into '))).toBe(true);
    expect(out.some((t) => /breaks out of (his|her|its) armor!/.test(t))).toBe(true);
    expect(out.some((t) => /cloak tears apart!/.test(t))).toBe(true);
    expect(out.some((t) => /helmet falls to the floor!/.test(t))).toBe(true);
    expect(out.some((t) => /boots are pushed off (his|her|its) feet!/.test(t))).toBe(true);
    expect(ent(s, body)).toBeUndefined();
    expect(ent(s, cloak)).toBeUndefined();
    for (const id of [helm, boots]) {
      expect(itemOf(s.state, id).carriedBy ?? null).toBe(null);
      expect(ent(s, id)?.c.pos).toMatchObject({ x: 4, y: 2 });
    }
  });

  test('a small form lets its suit fall around it', () => {
    const s = room();
    const m = jackal(s, 'nh:dwarf');
    const body = wear(s, m, 'nh:dwarvish_mithril_coat', 'body');
    newcham(ctxOf(s), m, mon('nh:jackal'), { msg: true });
    expect(said(s).some((t) => /armor falls around (him|her|it)!/.test(t))).toBe(true);
    expect(ent(s, body)?.c.pos).toMatchObject({ x: 4, y: 2 });
  });

  test('a form without a weapon attack drops its weapon', () => {
    const s = room();
    const m = jackal(s, 'nh:dwarf');
    const axe = wear(s, m, 'nh:axe', 'weapon');
    newcham(ctxOf(s), m, mon('nh:jackal'), { msg: true });
    expect(said(s)).toContain('The jackal drops an axe.');
    expect(ent(s, axe)?.c.pos).toMatchObject({ x: 4, y: 2 });
  });
});

/** Zaps a charged wand of polymorph east at what stands next to her; returns the text. */
function zapEast(s: S, otyp = 'nh:wand_of_polymorph'): string[] {
  const w = s.carry(otyp);
  itemOf(s.state, w).spe = 8;
  s.mod('nh:zap', { item: w });
  return s.text(answer(s, 'e'));
}

describe('the wand of polymorph at a monster', () => {
  test('system shock 1 time in 25 ("The jackal shudders!", killed, no corpse), else a new form', () => {
    let shock = 0;
    let changed = 0;
    for (let seed = 1; seed <= 150 && (shock < 2 || changed < 2); seed++) {
      const s = room(seed);
      const m = jackal(s, 'nh:jackal', 6, 6);
      const out = zapEast(s);
      if (out.includes('The jackal shudders!')) {
        shock++;
        expect(out).toContain('You kill the jackal!');
        expect(ent(s, m.id)).toBeUndefined();
        const level = getLevel(s.state);
        expect(itemsAt(defs, s.state, level.id, 4, 2).some((o) => o.def === 'nh:corpse')).toBe(
          false,
        );
      } else if (ent(s, m.id) && ent(s, m.id)!.def !== 'nh:jackal') {
        changed++;
        expect(out.some((t) => t.startsWith('The jackal turns into '))).toBe(true);
      }
    }
    expect(shock).toBeGreaterThan(0);
    expect(changed).toBeGreaterThan(0);
  });

  test('magic resistance protects (the Oracle stays)', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const s = room(seed);
      const m = jackal(s, 'nh:oracle', 50, 50);
      zapEast(s);
      expect(ent(s, m.id)?.def).toBe('nh:oracle');
    }
  });

  test('what a polymorphed monster drops is not hit by the same zap', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = room(seed);
      const m = jackal(s, 'nh:dwarf', 20, 20);
      const axe = wear(s, m, 'nh:axe', 'weapon');
      zapEast(s);
      const e = ent(s, axe);
      // dropped (or kept): never polymorphed or shuddered away by the same zap
      expect(e?.def, String(seed)).toBe('nh:axe');
    }
  });
});

describe('the polymorph trap and monsters', () => {
  test('a monster that does not resist changes and the trap stays', () => {
    let changed = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = room(seed);
      const level = getLevel(s.state);
      level.traps.push({ def: TRAP.poly as DefId, x: 4, y: 2, seen: false });
      const m = jackal(s, 'nh:jackal', 6, 6);
      mintrap(ctxOf(s), m.id, { force: true });
      if (ent(s, m.id)?.def !== 'nh:jackal') {
        changed++;
        expect(said(s).some((t) => t.startsWith('The jackal turns into '))).toBe(true);
        expect(trapAt(level, 4, 2)?.seen).toBe(true);
      }
      expect(trapAt(level, 4, 2)).toBeDefined();
    }
    expect(changed).toBeGreaterThan(10);
  });

  test("a monster's iron shoes warp into kicking boots and stay on", () => {
    const s = room();
    const level = getLevel(s.state);
    level.traps.push({ def: TRAP.poly as DefId, x: 4, y: 2, seen: false });
    const m = jackal(s, 'nh:dwarf', 6, 6);
    wear(s, m, 'nh:iron_shoes', 'boots');
    mintrap(ctxOf(s), m.id, { force: true });
    expect(m.def).toBe('nh:dwarf');
    const boots = inventoryOf(s.state, m.id).find((o) => o.c.item?.equipped === 'boots');
    expect(boots?.def).toBe('nh:kicking_boots');
  });

  test('her iron shoes warp: "Your pair of hard shoes warps strangely.", the trap is gone', () => {
    const s = room();
    const level = getLevel(s.state);
    const shoes = s.carry('nh:iron_shoes');
    itemOf(s.state, shoes).equipped = 'boots';
    level.traps.push({ def: TRAP.poly as DefId, x: 4, y: 2, seen: false });
    const out = s.text(s.step({ type: 'move', dir: 'e' }));
    expect(out).toContain('Your pair of hard shoes warps strangely.');
    expect(out.some((t) => t.includes('pair of buckled boots (being worn)'))).toBe(true);
    expect(trapAt(level, 4, 2)).toBeUndefined();
    const boots = inventoryOf(s.state, s.state.playerId).find(
      (o) => o.c.item?.equipped === 'boots',
    );
    expect(boots?.def).toBe('nh:kicking_boots');
  });
});

describe('poly_obj() and polypiling', () => {
  test('a random object of the same class keeps quantity rules, BUC and charges', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = room(seed);
      const w = s.floor('nh:wand_of_striking');
      itemOf(s.state, w).spe = 4;
      itemOf(s.state, w).buc = 'blessed';
      const n = polyObj(ctxOf(s), ent(s, w)!, null);
      expect(ent(s, w)).toBeUndefined();
      expect(defs.object(n.def).class).toBe('wand');
      expect(n.def).not.toBe('nh:wand_of_wishing');
      expect(n.def).not.toBe('nh:wand_of_polymorph');
      expect(n.c.item?.spe).toBe(4);
      expect(n.c.item?.buc).toBe('blessed');
      expect(n.c.pos).toMatchObject({ x: 3, y: 2 });
    }
  });

  test('a statue becomes a statue of another monster or a boulder', () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const s = room(seed);
      const st = s.floor('nh:statue', { corpseOf: 'nh:jackal' as DefId });
      const n = polyObj(ctxOf(s), ent(s, st)!, null);
      expect(['nh:statue', 'nh:boulder']).toContain(n.def);
      kinds.add(n.def === 'nh:statue' ? `statue:${n.c.item?.corpseOf}` : n.def);
    }
    expect(kinds.size).toBeGreaterThan(5);
  });

  test('unpolyable objects; shuddering odds (wands 1 in 3)', () => {
    const s = room();
    for (const id of [
      'nh:wand_of_polymorph',
      'nh:potion_of_polymorph',
      'nh:spellbook_of_polymorph',
      'nh:amulet_of_unchanging',
    ])
      expect(objUnpolyable(ctxOf(s), ent(s, s.floor(id))!)).toBe(true);
    let wand = 0;
    let rock = 0;
    const once = (id: string): boolean => {
      const e = ent(s, s.give(id))!;
      const r = objShudders(ctxOf(s), e);
      s.ctx.remove(e.id);
      return r;
    };
    for (let i = 0; i < 600; i++) {
      if (once('nh:wand_of_striking')) wand++;
      if (once('nh:dagger')) rock++;
    }
    expect(wand / 600).toBeGreaterThan(0.25);
    expect(wand / 600).toBeLessThan(0.42);
    expect(rock / 600).toBeGreaterThan(0.07);
    expect(rock / 600).toBeLessThan(0.19);
  });

  test('zapping down at a pile: objects change or shudder ("You feel shuddering vibrations.")', () => {
    let vibrations = 0;
    for (let seed = 1; seed <= 20 && vibrations === 0; seed++) {
      const s = room(seed);
      const pile: EntityId[] = [];
      for (const id of ['nh:dagger', 'nh:axe', 'nh:rock', 'nh:apple', 'nh:wand_of_striking'])
        pile.push(s.floor(id));
      const w = s.carry('nh:wand_of_polymorph');
      itemOf(s.state, w).spe = 8;
      s.mod('nh:zap', { item: w });
      const out = s.text(answer(s, 'down'));
      const now = itemsAt(defs, s.state, 'dlvl1', 3, 2);
      const gone = pile.filter((id) => !ent(s, id)).length;
      // every object resisted (kept), shuddered (destroyed) or was replaced
      expect(now.length).toBeLessThanOrEqual(pile.length);
      if (out.includes('You feel shuddering vibrations.')) {
        vibrations++;
        expect(now.length).toBeLessThan(pile.length);
      }
      expect(gone).toBeGreaterThan(0);
    }
    expect(vibrations).toBeGreaterThan(0);
  });
});

describe('kicking boots', () => {
  test('a kick in kicking boots always breaks a locked door open, even with feeble stats', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = setup(['.@X.', '....'], seed);
      const h = s.state.entities[String(s.state.playerId)]!;
      h.c.attributes = { str: 3, int: 10, wis: 10, dex: 3, con: 3, cha: 10 };
      const b = mksobj(ctxFor(s.state), obj('nh:kicking_boots'), {
        init: false,
        carriedBy: s.state.playerId,
      });
      itemOf(s.state, b).equipped = 'boots';
      engine.step(s.state, { type: 'mod', action: 'nh:kick' as DefId });
      const p = s.state.pendingPrompt?.prompt;
      if (!p) throw new Error('no prompt');
      engine.step(s.state, { type: 'answer', promptId: p.id, value: 'e' });
      expect(s.level.palette[s.level.cells[2] ?? 0], String(seed)).toBe(T.doorway);
    }
  });
});
