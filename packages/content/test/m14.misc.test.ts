// m14 step 5: miscellaneous items. A monster within 6 squares of the hero drinks gain level (cursed:
// up through the ceiling, or "looks uneasy." where it can't rise), makes itself invisible with a
// wand or potion (a cursed potion fails and aggravates her), speeds itself up, polymorphs itself
// with a wand or potion, jumps onto a polymorph trap, pulls her weapon away with a bullwhip, and
// takes things out of a carried sack. Outcomes are asserted; random rolls are searched over seeds.
import {
  getLevel,
  getPlayer,
  inventoryOf,
  itemsAt,
  putIn,
  type Ctx,
  type DefId,
  type EntityId,
  type GameEvent,
  type GameState,
  type Pos,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { mksobj } from '../src/index';
import { uwepOf } from '../src/combat';
import { monInvisible } from '../src/invis';
import { contents } from '@nh/core';
import { mspeed } from '../src/mstate';
import { findMisc, useMisc } from '../src/muse';
import { isKnown } from '../src/o_init';
import { P, setIntrinsic } from '../src/props';
import { TRAP } from '../src/trap';
import { trapTable } from '../src/trapstate';
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
const ent = (state: GameState, id: EntityId) => state.entities[String(id)];
const msgs = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );
/** A hostile awake monster (a gnome by default) at (x, y). */
function mon(state: GameState, x: number, y: number, def = 'nh:gnome', o = {}): EntityId {
  const id = addMon(state, def, x, y, { asleep: false, energy: 12, ...o });
  const e = ent(state, id)!;
  e.c.hp = { cur: 20, max: 20 };
  e.c.monster!.level = 1;
  return id;
}
/** Gives the monster (or the hero) a new object. */
function give(
  state: GameState,
  owner: EntityId,
  otyp: string,
  o: { buc?: 'blessed' | 'cursed'; spe?: number } = {},
): EntityId {
  const id = mksobj(ctxFor(state), obj(otyp), { init: false, carriedBy: owner });
  const it = state.entities[String(id)]!.c.item!;
  it.buc = o.buc ?? 'uncursed';
  if (o.spe !== undefined) it.spe = o.spe;
  return id;
}
function tctx(state: GameState): Ctx & { events: GameEvent[] } {
  const c = ctxFor(state);
  return Object.assign(c, { interrupt: () => undefined }) as unknown as Ctx & {
    events: GameEvent[];
  };
}
/** findMisc() then useMisc() for the monster, outside its move; the kind, result and messages. */
function use(state: GameState, id: EntityId) {
  const ctx = tctx(state);
  const c = findMisc(ctx, id);
  const res = c ? useMisc(ctx, id, c) : null;
  return { kind: c?.kind ?? null, res, text: msgs(ctx.events) };
}
const kindOf = (state: GameState, id: EntityId): string | null =>
  findMisc(tctx(state), id)?.kind ?? null;
const hero = (state: GameState) => getPlayer(state);
const DRINKS = /^The gnome drinks an? .*potion!$/;
const carried = (state: GameState, id: EntityId): string[] =>
  inventoryOf(state, id).map((e) => e.def);

describe('when a monster looks for a misc item', () => {
  test('not when she is more than 6 squares away, nor for animals or the mindless', () => {
    const s = make();
    const far = mon(s.state, 13, 1); // dist2 = 36 + 4
    give(s.state, far, 'nh:potion_of_speed');
    expect(kindOf(s.state, far)).toBeNull();
    const near = mon(s.state, 13, 3); // dist2 = 36
    give(s.state, near, 'nh:potion_of_speed');
    expect(kindOf(s.state, near)).toBe('pot_speed');
    const dog = mon(s.state, 9, 3, 'nh:jackal');
    give(s.state, dog, 'nh:potion_of_speed');
    expect(kindOf(s.state, dog)).toBeNull();
  });

  test('the last viable item wins', () => {
    const s = make();
    const id = mon(s.state, 9, 3);
    give(s.state, id, 'nh:potion_of_speed');
    give(s.state, id, 'nh:potion_of_gain_level'); // newer: looked at first
    expect(kindOf(s.state, id)).toBe('pot_speed');
  });
});

describe('gain level', () => {
  test('a monster drinks it and seems more experienced', () => {
    const s = make();
    const id = mon(s.state, 9, 3);
    const p = give(s.state, id, 'nh:potion_of_gain_level');
    const lev = ent(s.state, id)!.c.monster!.level;
    const r = use(s.state, id);
    expect(r.kind).toBe('pot_gain_level');
    expect(r.res).toBe(2);
    expect(r.text[0]).toMatch(DRINKS);
    expect(r.text[1]).toBe('The gnome seems more experienced.');
    expect(ent(s.state, p)).toBeUndefined();
    expect(ent(s.state, id)!.c.monster!.level).toBe(lev + 1);
    expect(isKnown(s.state, defs, 'nh:potion_of_gain_level' as DefId)).toBe(true);
  });

  test('a cursed one on the first level: it looks uneasy', () => {
    const s = make();
    const id = mon(s.state, 9, 3);
    give(s.state, id, 'nh:potion_of_gain_level', { buc: 'cursed' });
    const r = use(s.state, id);
    expect(r.text).toContain('The gnome looks uneasy.');
    expect(carried(s.state, id)).toEqual([]);
    expect(ent(s.state, id)!.c.pos).toBeDefined();
  });

  test('a cursed one on the second level: it rises through the ceiling', () => {
    const { state } = engine.newGame({ seed: 1 });
    (state.modData['nh'] as Record<string, unknown>)['debugMongen'] = true;
    for (const k of Object.keys(state.entities)) {
      const e = state.entities[k];
      if (e?.c.monster && Number(k) !== state.playerId) delete state.entities[k];
    }
    const down = getLevel(state).down!;
    Object.assign(hero(state).c.pos!, down);
    engine.stepAll(state, { type: 'mod', action: 'nh:down' as DefId });
    const l2 = getLevel(state);
    expect(l2.dlevel).toBe(2);
    const hp = hero(state).c.pos!;
    const spot = freeNear(state, hp);
    const id = mon(state, spot.x, spot.y);
    ent(state, id)!.c.pos!.level = l2.id;
    give(state, id, 'nh:potion_of_gain_level', { buc: 'cursed' });
    const r = use(state, id);
    expect(r.res).toBe(2);
    expect(r.text).toContain('The gnome rises up, through the ceiling!');
    expect(ent(state, id)!.c.pos).toBeUndefined();
    expect(trapTable({ state }, 'migrating', false)?.[String(id)]).toBe('dlvl1');
    expect(carried(state, id)).toEqual([]);
  });

  test('a guard, shopkeeper or priest does not drink a cursed one', () => {
    const s = make();
    const id = mon(s.state, 9, 3, 'nh:watchman');
    give(s.state, id, 'nh:potion_of_gain_level', { buc: 'cursed' });
    expect(kindOf(s.state, id)).toBe('pot_gain_level'); // the watch is none of them
  });
});

/** A floor square next to `p` with no monster. */
function freeNear(state: GameState, p: Pos): Pos {
  const level = getLevel(state);
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
  ] as const) {
    const x = p.x + dx;
    const y = p.y + dy;
    const t = level.palette[level.cells[y * level.width + x] ?? 0];
    if (t && defs.terrain(t).passable && !defs.terrain(t).stairs) return { x, y };
  }
  throw new Error('no free square');
}

describe('invisibility', () => {
  test('a hostile zaps itself with make invisible and vanishes', () => {
    const s = make();
    const id = mon(s.state, 9, 3);
    const w = give(s.state, id, 'nh:wand_of_make_invisible', { spe: 4 });
    const r = use(s.state, id);
    expect(r.kind).toBe('wan_make_invisible');
    expect(r.text[0]).toMatch(/^The gnome zaps itself with an? .*wand.*!$/);
    expect(r.text[1]).toBe('Suddenly you cannot see the gnome.');
    expect(monInvisible(s.ctx, ent(s.state, id)!)).toBe(true);
    expect(ent(s.state, w)!.c.item!.spe).toBe(3);
    expect(isKnown(s.state, defs, 'nh:wand_of_make_invisible' as DefId)).toBe(true);
    // already invisible: not again
    expect(kindOf(s.state, id)).toBeNull();
  });

  test('she sees invisible: "body takes on a strange transparency"', () => {
    const s = make();
    setIntrinsic(hero(s.state), P.SEE_INVIS, true);
    const id = mon(s.state, 9, 3);
    const p = give(s.state, id, 'nh:potion_of_invisibility');
    const r = use(s.state, id);
    expect(r.text[0]).toMatch(DRINKS);
    expect(r.text.slice(1)).toEqual(["The gnome's body takes on a strange transparency."]);
    expect(ent(s.state, p)).toBeUndefined();
  });

  test('a peaceful only when she sees invisible', () => {
    const s = make();
    const id = mon(s.state, 9, 3, 'nh:gnome', { peaceful: true });
    give(s.state, id, 'nh:potion_of_invisibility');
    expect(kindOf(s.state, id)).toBeNull();
    setIntrinsic(hero(s.state), P.SEE_INVIS, true);
    expect(kindOf(s.state, id)).toBe('pot_invisibility');
  });

  test('a cursed potion fails and aggravates her', () => {
    const s = make();
    const id = mon(s.state, 9, 3);
    give(s.state, id, 'nh:potion_of_invisibility', { buc: 'cursed' });
    const r = use(s.state, id);
    expect(r.text[0]).toMatch(DRINKS);
    expect(r.text.slice(1)).toEqual([
      'The gnome briefly seems to be transparent.',
      "For some reason, the gnome's presence is known to you.",
      'You feel aggravated at the gnome.',
    ]);
    expect(monInvisible(s.ctx, ent(s.state, id)!)).toBe(false);
    expect(carried(s.state, id)).toEqual([]);
  });
});

describe('speed', () => {
  test('a potion of speed makes it fast; then it looks for no more speed', () => {
    const s = make();
    const id = mon(s.state, 9, 3);
    give(s.state, id, 'nh:potion_of_speed');
    give(s.state, id, 'nh:potion_of_speed', { buc: 'blessed' });
    const r = use(s.state, id);
    expect(r.kind).toBe('pot_speed');
    expect(r.text[0]).toMatch(DRINKS);
    expect(r.text.slice(1)).toEqual(['The gnome is suddenly moving faster.']);
    expect(mspeed(s.ctx, id)).toBe('fast');
    expect(isKnown(s.state, defs, 'nh:potion_of_speed' as DefId)).toBe(true);
    expect(kindOf(s.state, id)).toBeNull();
  });

  test('nomore(): a wand of speed looked at first keeps a later potion from being chosen', () => {
    const s = make();
    const id = mon(s.state, 9, 3);
    give(s.state, id, 'nh:potion_of_speed');
    give(s.state, id, 'nh:wand_of_speed_monster', { spe: 3 }); // newer: looked at first
    expect(kindOf(s.state, id)).toBe('wan_speed_monster');
  });

  test('a wand of speed monster', () => {
    const s = make();
    const id = mon(s.state, 9, 3);
    const w = give(s.state, id, 'nh:wand_of_speed_monster', { spe: 3 });
    const r = use(s.state, id);
    expect(r.kind).toBe('wan_speed_monster');
    expect(r.text[1]).toBe('The gnome is suddenly moving faster.');
    expect(mspeed(s.ctx, id)).toBe('fast');
    expect(ent(s.state, w)!.c.item!.spe).toBe(2);
  });
});

describe('polymorph', () => {
  test('a weak monster zaps itself with polymorph and changes', () => {
    expect(defs.monster('nh:gnome').difficulty).toBeLessThan(6);
    const s = make();
    const id = mon(s.state, 9, 3);
    give(s.state, id, 'nh:wand_of_polymorph', { spe: 3 });
    const r = use(s.state, id);
    expect(r.kind).toBe('wan_polymorph');
    expect(ent(s.state, id)!.def).not.toBe('nh:gnome');
    expect(r.text.some((m) => /^The gnome turns into /.test(m))).toBe(true);
  });

  test('a potion of polymorph: "suddenly mutates!"', () => {
    const s = make();
    const id = mon(s.state, 9, 3);
    give(s.state, id, 'nh:potion_of_polymorph');
    const r = use(s.state, id);
    expect(r.kind).toBe('pot_polymorph');
    expect(r.text[0]).toMatch(DRINKS);
    expect(r.text[1]).toBe('The gnome suddenly mutates!');
    expect(ent(s.state, id)!.def).not.toBe('nh:gnome');
    expect(carried(s.state, id)).not.toContain('nh:potion_of_polymorph');
  });

  test('not for a monster of difficulty 6 or more', () => {
    const s = make();
    const def = defs.monsters.find((m) => m.difficulty >= 6 && m.flags.includes('humanoid'))!;
    const id = mon(s.state, 9, 3, def.id);
    give(s.state, id, 'nh:potion_of_polymorph');
    expect(kindOf(s.state, id)).toBeNull();
  });

  test('a weak monster jumps onto a polymorph trap next to it; not in iron shoes', () => {
    const s = make();
    const id = mon(s.state, 9, 3);
    getLevel(s.state).traps.push({ def: TRAP.poly, x: 10, y: 3, seen: true });
    const shoes = give(s.state, id, 'nh:iron_shoes');
    ent(s.state, shoes)!.c.item!.equipped = 'boots';
    expect(kindOf(s.state, id)).toBeNull();
    ent(s.state, shoes)!.c.item!.equipped = null;
    const r = use(s.state, id);
    expect(r.kind).toBe('poly_trap');
    expect(r.text[0]).toBe('The gnome deliberately jumps onto a polymorph trap!');
    const e = ent(s.state, id)!;
    expect(e.c.pos).toMatchObject({ x: 10, y: 3 });
    expect(e.def).not.toBe('nh:gnome');
  });
});

describe('the bullwhip', () => {
  /** A hostile gnome lord next to her wielding a bullwhip; she wields a dagger. */
  function whipper(seed: number, o: { cursedWep?: boolean; silver?: boolean } = {}) {
    const s = make(seed);
    for (const e of inventoryOf(s.state, s.state.playerId))
      if (e.c.item?.equipped === 'weapon') e.c.item.equipped = null;
    const wep = give(s.state, s.state.playerId, o.silver ? 'nh:silver_saber' : 'nh:dagger', {
      ...(o.cursedWep ? { buc: 'cursed' as const } : {}),
    });
    ent(s.state, wep)!.c.item!.equipped = 'weapon';
    ent(s.state, wep)!.c.item!.quantity = 1;
    const id = mon(s.state, 8, 3, 'nh:gnome_lord');
    const whip = give(s.state, id, 'nh:bullwhip');
    ent(s.state, whip)!.c.item!.equipped = 'weapon';
    return { s, id, wep };
  }
  /** The first seed where the whip is used and the weapon ends up as `where` says. */
  function disarmed(where: 'mon_floor' | 'her_floor' | 'snatched' | 'slips', silver = false) {
    for (let seed = 1; seed <= 200; seed++) {
      const { s, id, wep } = whipper(seed, { silver });
      const r = use(s.state, id);
      if (r.kind !== 'bullwhip') continue;
      const w = ent(s.state, wep)!;
      const got =
        w.c.item!.carriedBy === s.state.playerId
          ? 'slips'
          : w.c.item!.carriedBy === id
            ? 'snatched'
            : w.c.pos?.x === 8
              ? 'mon_floor'
              : 'her_floor';
      if (got === where) return { s, id, wep, r };
    }
    throw new Error(`never ${where}`);
  }

  test('yanked to the floor under the monster', () => {
    const { s, wep, r } = disarmed('mon_floor');
    expect(r.res).toBe(1);
    expect(r.text).toEqual([
      'The gnome lord flicks a bullwhip towards your hand!',
      "The bullwhip wraps around the dagger you're wielding!",
      'The gnome lord yanks the dagger from your hand!',
    ]);
    expect(itemsAt(defs, s.state, 'dlvl1', 8, 3).map((e) => e.id)).toContain(wep);
    expect(uwepOf(s.ctx as unknown as Ctx)).toBeNull();
  });

  test('yanked to the floor under her', () => {
    const { s, wep, r } = disarmed('her_floor');
    expect(r.text[2]).toBe('The gnome lord yanks the dagger to the floor!');
    expect(itemsAt(defs, s.state, 'dlvl1', 7, 3).map((e) => e.id)).toContain(wep);
  });

  test('snatched', () => {
    const { s, id, wep, r } = disarmed('snatched');
    expect(r.text[2]).toBe('The gnome lord snatches the dagger!');
    expect(ent(s.state, wep)!.c.item!.carriedBy).toBe(id);
  });

  test('the whip slips free', () => {
    const { s, wep, r } = disarmed('slips');
    expect(r.text[2]).toBe('The whip slips free.');
    expect(ent(s.state, wep)!.c.item!.equipped).toBe('weapon');
  });

  test('not against a welded weapon, and not at a distance or every turn', () => {
    let tries = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { s, id } = whipper(seed, { cursedWep: true });
      expect(kindOf(s.state, id)).toBeNull();
      const { s: s2, id: id2 } = whipper(seed);
      if (kindOf(s2.state, id2) === 'bullwhip') tries++;
      Object.assign(ent(s2.state, id2)!.c.pos!, { x: 5, y: 3 });
      expect(kindOf(s2.state, id2)).toBeNull();
    }
    // !rn2(5): sometimes, not always
    expect(tries).toBeGreaterThan(0);
    expect(tries).toBeLessThan(40);
  });
});

describe('a carried sack', () => {
  /** A gnome carrying a sack with a dagger and an apple in it. */
  function sacker(seed: number, x = 8) {
    const s = make(seed);
    const id = mon(s.state, x, 3);
    const sack = give(s.state, id, 'nh:sack');
    const inside: EntityId[] = [];
    for (const otyp of ['nh:dagger', 'nh:apple']) {
      const o = mksobj(ctxFor(s.state), obj(otyp), { init: false });
      putIn(defs, s.state, sack, o);
      inside.push(o);
    }
    return { s, id, sack, inside };
  }

  test('it takes something out of it', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { s, id, sack, inside } = sacker(seed);
      const r = use(s.state, id);
      if (r.kind !== 'bag' || r.res !== 2) continue;
      expect(r.text[0]).toMatch(/^The gnome removes an? (dagger|apple) from an? (bag|sack)\.$/);
      const left = contents(s.state, sack).map((e) => e.id);
      const taken = inside.filter((o) => !left.includes(o));
      expect(taken.length).toBeGreaterThan(0);
      for (const o of taken) expect(ent(s.state, o)!.c.item!.carriedBy).toBe(id);
      return;
    }
    throw new Error('never looted');
  });

  test('further away it rummages', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { s, id } = sacker(seed, 11);
      const r = use(s.state, id);
      if (r.kind !== 'bag' || r.res !== 2) continue;
      expect(r.text).toHaveLength(1);
      expect(r.text[0]).toMatch(/^The gnome rummages through an? (bag|sack)\.$/);
      return;
    }
    throw new Error('never looted');
  });

  test('not an empty or locked container', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = make(seed);
      const id = mon(s.state, 8, 3);
      give(s.state, id, 'nh:sack');
      expect(kindOf(s.state, id)).toBeNull();
    }
  });
});

describe('in its move', () => {
  test('a hostile near her drinks its potion of speed', () => {
    const s = make();
    const id = mon(s.state, 10, 3);
    give(s.state, id, 'nh:potion_of_speed');
    const r = s.step({ type: 'wait' });
    expect(msgs(r.events).some((m) => DRINKS.test(m))).toBe(true);
    expect(mspeed(s.ctx, id)).toBe('fast');
  });
});
