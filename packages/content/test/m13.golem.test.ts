// m13 step 6: golems. Fixed hit points by kind (made, polymorphed into, a hero's form); what each
// golem leaves (missing objects absent); fire burning paper golems away; lightning healing flesh
// golems and fire iron ones; cancellation killing clay golems; stone to flesh turning a stone
// golem into a flesh golem and a golem statue into one; golems turned to stone becoming stone
// golems; polypiling melding a pile into a golem. Outcomes are asserted; rolls are searched.
import { getPlayer, type Ctx, type DefId, type Entity, type EntityId } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { buzzFrom } from '../src/buzz';
import { explode } from '../src/explode';
import { makemon } from '../src/generation';
import { golemhp } from '../src/golem';
import { golemeffects } from '../src/golemfx';
import { mksobj } from '../src/items';
import { monsterDied } from '../src/mondeath';
import { mspeed } from '../src/mstate';
import { newcham } from '../src/newcham';
import { createPolymon } from '../src/polyobj';
import { polymon } from '../src/polyself';
import { instapetrify, minstapetrify } from '../src/stoning';
import { animateStatue } from '../src/statue';
import { bhitm, cancelMonst } from '../src/zap';
import { heroFormId } from '../src/upoly';
import { addMon } from './helpers';
import { defs, levelSetup, plainKit, render } from './itemHelpers';

type S = ReturnType<typeof levelSetup>;

const ROOM = [
  '               ',
  ' ............. ',
  ' ............. ',
  ' .....@....... ',
  ' ............. ',
  ' ............. ',
  '               ',
];

const GOLEMS = [
  'nh:straw_golem',
  'nh:paper_golem',
  'nh:rope_golem',
  'nh:gold_golem',
  'nh:leather_golem',
  'nh:wood_golem',
  'nh:flesh_golem',
  'nh:clay_golem',
  'nh:stone_golem',
  'nh:glass_golem',
  'nh:iron_golem',
] as const;

/** A lit room with no monsters; the hero at (6, 3). */
function make(seed = 1): S {
  const s = levelSetup(ROOM, seed);
  plainKit(s.state);
  for (const k of Object.keys(s.state.entities)) {
    if (s.state.entities[k]?.c.monster) delete s.state.entities[k];
  }
  s.step({ type: 'wait' });
  return s;
}
const cx = (s: S): Ctx => s.ctx as unknown as Ctx;
const ent = (s: S, id: EntityId): Entity | undefined => s.state.entities[String(id)];
/** A golem at (x, y) that does not act, with its makemon() hit points. */
function golem(s: S, def: string, x: number, y: number): EntityId {
  const id = makemon(cx(s), defs.monster(def as DefId), { x, y }, { noInventory: true });
  if (id === null) throw new Error(`no ${def}`);
  ent(s, id)!.c.actor!.speed = 0;
  return id;
}
const floorAt = (s: S, x: number, y: number): Entity[] =>
  Object.values(s.state.entities).filter(
    (e) => e.c.item && e.c.pos?.level === 'dlvl1' && e.c.pos.x === x && e.c.pos.y === y,
  );
const texts = (s: S): string[] =>
  s.ctx.events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );

describe('golemhp(): golems have fixed hit points', () => {
  test('each golem is made with its golemhp(), C values', () => {
    const want: Record<string, number> = {
      'nh:straw_golem': 20,
      'nh:paper_golem': 20,
      'nh:rope_golem': 30,
      'nh:gold_golem': 60,
      'nh:leather_golem': 40,
      'nh:wood_golem': 50,
      'nh:flesh_golem': 40,
      'nh:clay_golem': 70,
      'nh:stone_golem': 100,
      'nh:glass_golem': 80,
      'nh:iron_golem': 120,
    };
    const s = make();
    GOLEMS.forEach((g, i) => {
      expect(golemhp(g)).toBe(want[g]);
      const id = golem(s, g, 1 + (i % 13), i < 13 ? 1 : 5);
      expect(ent(s, id)!.c.hp).toEqual({ cur: want[g], max: want[g] });
    });
  });

  test('a monster polymorphed into a golem gets its HP (in proportion)', () => {
    const s = make();
    const id = addMon(s.state, 'nh:jackal', 8, 3);
    ent(s, id)!.c.hp = { cur: 3, max: 6 };
    expect(newcham(cx(s), ent(s, id)!, defs.monster('nh:iron_golem' as DefId))).toBe(true);
    expect(ent(s, id)!.c.hp).toEqual({ cur: 60, max: 120 });
  });

  test('the hero polymorphed into a golem: u.mh is golemhp()', () => {
    const s = make();
    expect(polymon(cx(s), 'nh:clay_golem' as DefId, false)).toBe(true);
    expect(heroFormId(s.state)).toBe('nh:clay_golem');
    expect(getPlayer(s.state).c.hp).toEqual({ cur: 70, max: 70 });
  });
});

describe('make_corpse(): what golems leave', () => {
  /** Kills a fresh `def` at (10, 3) by the hero's hand, `n` seeds; the floor items per kill. */
  function drops(def: string, n = 12): Entity[][] {
    const out: Entity[][] = [];
    for (let seed = 1; seed <= n; seed++) {
      const s = make(seed);
      const id = golem(s, def, 10, 3);
      monsterDied(cx(s), id, true);
      out.push(floorAt(s, 10, 3));
    }
    return out;
  }
  const ids = (piles: Entity[][]): Set<string> => new Set(piles.flat().map((e) => e.def));

  test('iron golem: no iron chains (absent); straw golem: nothing at all', () => {
    for (const p of drops('nh:iron_golem')) expect(p).toEqual([]);
    for (const p of drops('nh:straw_golem')) expect(p).toEqual([]);
  });

  test('glass golem: 2..8 worthless glass pieces', () => {
    for (const p of drops('nh:glass_golem')) {
      expect(p.length).toBeGreaterThanOrEqual(1); // same kinds merge
      const n = p.reduce((a, e) => a + (e.c.item?.quantity ?? 0), 0);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(16); // a gem may come as a pair
      for (const e of p) expect(e.def).toMatch(/^nh:worthless_piece_of_/);
    }
  });

  test('clay golem: one stack of 50..69 rocks', () => {
    for (const p of drops('nh:clay_golem')) {
      expect(p.map((e) => e.def)).toEqual(['nh:rock']);
      expect(p[0]!.c.item!.quantity).toBeGreaterThanOrEqual(50);
      expect(p[0]!.c.item!.quantity).toBeLessThanOrEqual(69);
    }
  });

  test('stone golem: a statue of a stone golem', () => {
    for (const p of drops('nh:stone_golem', 4)) {
      expect(p.map((e) => [e.def, e.c.item?.corpseOf])).toEqual([['nh:statue', 'nh:stone_golem']]);
    }
  });

  test('wood golem: quarterstaffs, small shields, clubs, elven spears (no boomerangs)', () => {
    const piles = drops('nh:wood_golem', 20);
    const allowed = ['nh:club', 'nh:elven_spear', 'nh:quarterstaff', 'nh:small_shield'];
    for (const p of piles) {
      expect(p.length).toBeLessThanOrEqual(8);
      for (const e of p) expect(allowed).toContain(e.def);
    }
    expect(ids(piles).has('nh:quarterstaff')).toBe(true);
  });

  test('rope golem: up to two bullwhips (no leashes or grappling hooks)', () => {
    const piles = drops('nh:rope_golem', 30);
    for (const p of piles) {
      expect(p.length).toBeLessThanOrEqual(2);
      for (const e of p) expect(e.def).toBe('nh:bullwhip');
    }
    expect(piles.some((p) => p.length === 0)).toBe(true);
    expect(piles.some((p) => p.length > 0)).toBe(true);
  });

  test('leather golem: leather armor and cloaks (no saddles)', () => {
    const piles = drops('nh:leather_golem', 20);
    for (const p of piles) {
      expect(p.length).toBeGreaterThanOrEqual(1);
      expect(p.length).toBeLessThanOrEqual(8);
      for (const e of p) expect(['nh:leather_armor', 'nh:leather_cloak']).toContain(e.def);
    }
    expect(ids(piles).has('nh:leather_armor')).toBe(true);
  });

  test('gold golem: 100..200 gold pieces; paper golem: 1..4 blank scrolls', () => {
    for (const p of drops('nh:gold_golem')) {
      expect(p.map((e) => e.def)).toEqual(['nh:gold_piece']);
      expect(p[0]!.c.item!.quantity).toBeGreaterThanOrEqual(100);
      expect(p[0]!.c.item!.quantity).toBeLessThanOrEqual(200);
    }
    for (const p of drops('nh:paper_golem')) {
      const n = p.reduce((a, e) => a + (e.c.item?.quantity ?? 0), 0);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(4);
      for (const e of p) expect(e.def).toBe('nh:scroll_of_blank_paper');
    }
  });

  test('flesh golem: its corpse', () => {
    for (const p of drops('nh:flesh_golem', 4)) {
      expect(p.some((e) => e.def === 'nh:corpse' && e.c.item?.corpseOf === 'nh:flesh_golem')).toBe(
        true,
      );
    }
  });
});

describe('fire, lightning and cancellation', () => {
  test('a fire ray kills a paper golem and leaves no scrolls (searched hit)', () => {
    let done = false;
    for (let seed = 1; seed <= 20 && !done; seed++) {
      const s = make(seed);
      const id = golem(s, 'nh:paper_golem', 9, 3);
      buzzFrom(cx(s), 'fire', 6, { x: 6, y: 3 }, 'e', {
        by: 'hero',
        wakeup: () => undefined,
      });
      if (ent(s, id)) continue; // missed or survived
      expect(floorAt(s, 9, 3).filter((e) => e.def === 'nh:scroll_of_blank_paper')).toEqual([]);
      done = true;
    }
    expect(done).toBe(true);
  });

  test('a hero in iron golem form caught in a fire explosion feels better', () => {
    const s = make();
    polymon(cx(s), 'nh:iron_golem' as DefId, false);
    getPlayer(s.state).c.hp = { cur: 50, max: 120 };
    explode(cx(s), 6, 3, { wand: 'nh:wand_of_fire' as DefId, by: 'other' }, 20, 'fiery');
    expect(getPlayer(s.state).c.hp!.cur).toBeGreaterThan(50);
    expect(texts(s)).toContain('Strangely, you feel better than before.');
  });

  test('golemeffects(): lightning heals a flesh golem, fire slows it; fire heals an iron golem', () => {
    const s = make();
    const flesh = golem(s, 'nh:flesh_golem', 9, 3);
    ent(s, flesh)!.c.hp = { cur: 10, max: 40 };
    golemeffects(cx(s), ent(s, flesh)!, 'elec', 30);
    expect(ent(s, flesh)!.c.hp!.cur).toBe(15); // (30 + 5) / 6
    expect(texts(s)).toContain('The flesh golem seems healthier.');
    golemeffects(cx(s), ent(s, flesh)!, 'fire', 30);
    expect(mspeed(s.ctx, flesh)).toBe('slow');
    const iron = golem(s, 'nh:iron_golem', 11, 3);
    ent(s, iron)!.c.hp = { cur: 50, max: 120 };
    golemeffects(cx(s), ent(s, iron)!, 'fire', 40);
    expect(ent(s, iron)!.c.hp!.cur).toBe(90);
    golemeffects(cx(s), ent(s, iron)!, 'elec', 40);
    expect(mspeed(s.ctx, iron)).toBe('slow');
  });

  test('an exploding wand of lightning heals the flesh golem it does not hurt', () => {
    const s = make();
    const flesh = golem(s, 'nh:flesh_golem', 11, 3);
    ent(s, flesh)!.c.hp = { cur: 10, max: 40 };
    explode(cx(s), 11, 3, { wand: 'nh:wand_of_lightning' as DefId, by: 'hero' }, 24, 'magical');
    expect(ent(s, flesh)!.c.hp!.cur).toBe(14); // (24 + 5) / 6
  });

  test("cancellation erases the clay golem's word: it dies (searched: not resisted)", () => {
    let done = false;
    for (let seed = 1; seed <= 20 && !done; seed++) {
      const s = make(seed);
      const id = golem(s, 'nh:clay_golem', 9, 3);
      const wand = mksobj(s.ctx, defs.object('nh:wand_of_cancellation' as DefId), {
        init: false,
        carriedBy: s.state.playerId,
      });
      const src = { kind: 'wand' as const, item: ent(s, wand)! };
      if (!cancelMonst(cx(s), ent(s, id)!, src, true, false)) continue;
      expect(ent(s, id)).toBeUndefined();
      expect(texts(s)).toContain("Some writing vanishes from the clay golem's head!");
      // golems leave their material: 50..69 rocks
      expect(floorAt(s, 9, 3).map((e) => e.def)).toContain('nh:rock');
      done = true;
    }
    expect(done).toBe(true);
  });
});

describe('stone and flesh', () => {
  const STF = {
    kind: 'spell' as const,
    otyp: 'nh:spellbook_of_stone_to_flesh' as DefId,
    blessed: false,
  };

  test('stone to flesh turns a stone golem into a flesh golem (HP in proportion)', () => {
    const s = make();
    const id = golem(s, 'nh:stone_golem', 9, 3);
    ent(s, id)!.c.hp = { cur: 50, max: 100 };
    bhitm(cx(s), ent(s, id)!, STF, { x: 9, y: 3 });
    expect(ent(s, id)!.def).toBe('nh:flesh_golem');
    expect(ent(s, id)!.c.hp).toEqual({ cur: 20, max: 40 });
    expect(texts(s)).toContain('The stone golem turns to flesh!');
  });

  test('a flesh golem "seems fleshier"; other golems look fleshy for a moment', () => {
    const s = make();
    const f = golem(s, 'nh:flesh_golem', 9, 3);
    const w = golem(s, 'nh:wood_golem', 9, 1);
    bhitm(cx(s), ent(s, f)!, STF, { x: 9, y: 3 });
    bhitm(cx(s), ent(s, w)!, STF, { x: 9, y: 1 });
    expect(texts(s)).toContain('The flesh golem seems fleshier...');
    expect(texts(s)).toContain('The wood golem looks rather fleshy for a moment.');
    expect(ent(s, w)!.def).toBe('nh:wood_golem');
  });

  test("a golem's statue hit by stone to flesh comes to life as a flesh golem", () => {
    const s = make();
    const st = mksobj(s.ctx, defs.object('nh:statue' as DefId), {
      init: false,
      corpseOf: 'nh:iron_golem' as DefId,
      at: { level: 'dlvl1', x: 9, y: 3 },
    });
    const { mon } = animateStatue(cx(s), ent(s, st)!, 9, 3, 'spell');
    expect(mon?.def).toBe('nh:flesh_golem');
  });

  test('a golem turned to stone becomes a stone golem', () => {
    const s = make();
    const id = golem(s, 'nh:flesh_golem', 9, 3);
    ent(s, id)!.c.hp = { cur: 20, max: 40 };
    minstapetrify(cx(s), ent(s, id)!, true);
    expect(ent(s, id)!.def).toBe('nh:stone_golem');
    expect(ent(s, id)!.c.hp).toEqual({ cur: 50, max: 100 });
    expect(texts(s)).toContain('The flesh golem solidifies...');
    expect(texts(s)).toContain("Now it's a stone golem.");
  });

  test('a hero in a golem form turns into a stone golem instead of to stone', () => {
    const s = make();
    polymon(cx(s), 'nh:wood_golem' as DefId, false);
    instapetrify(cx(s), '@nh:cockatrice');
    expect(s.state.gameOver).toBeFalsy();
    expect(heroFormId(s.state)).toBe('nh:stone_golem');
    expect(getPlayer(s.state).c.hp).toEqual({ cur: 100, max: 100 });
  });
});

describe('polypiling', () => {
  /** A pile of `n` iron daggers (separate objects) and a mace at (9, 3). */
  function pile(s: S, n: number): Entity[] {
    const at = { level: 'dlvl1', x: 9, y: 3 };
    for (let i = 0; i < n; i++)
      mksobj(s.ctx, defs.object('nh:dagger' as DefId), { init: false, at });
    mksobj(s.ctx, defs.object('nh:mace' as DefId), { init: false, at });
    return floorAt(s, 9, 3);
  }

  test('iron objects meld into an iron golem; some of the pile is used up', () => {
    const s = make();
    const before = pile(s, 3);
    expect(before.length).toBeGreaterThanOrEqual(2);
    createPolymon(cx(s), before, 'iron');
    const golems = Object.values(s.state.entities).filter((e) => e.def === 'nh:iron_golem');
    expect(golems.length).toBe(1);
    expect(golems[0]!.c.hp).toEqual({ cur: 120, max: 120 });
    expect(floorAt(s, 9, 3).length).toBeLessThan(before.length);
    expect(texts(s)).toContain('Some metal objects meld, and an iron golem arises from the pile!');
  });

  test('a single object makes no golem', () => {
    const s = make();
    const at = { level: 'dlvl1', x: 9, y: 3 };
    mksobj(s.ctx, defs.object('nh:mace' as DefId), { init: false, at });
    createPolymon(cx(s), floorAt(s, 9, 3), 'iron');
    expect(Object.values(s.state.entities).some((e) => e.def === 'nh:iron_golem')).toBe(false);
    expect(floorAt(s, 9, 3).length).toBe(1);
  });
});
