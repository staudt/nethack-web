// m14 step 1: monster item use, the framework. A wounded (or blinded) monster drinks a healing
// potion; a peaceful one only heals; a hostile one near the hero flees down or up the stairs (and
// comes out by the matching stairs when she follows), out of the dungeon from the first level's
// up stairs, into a trap door or onto a teleportation trap; a cornered one tries the same; a
// cursed wand can blow up in its hands. Outcomes are asserted.
import {
  cellIndex,
  cellRules,
  getLevel,
  getPlayer,
  inventoryOf,
  trapAt,
  type Ctx,
  type DefId,
  type EntityId,
  type GameState,
  type Level,
  type Pos,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { mksobj } from '../src/index';
import { fleeTime, isFleeing } from '../src/monflee';
import { isKnown } from '../src/o_init';
import { setMblinded, mcansee } from '../src/mstate';
import { findDefensive, precheck } from '../src/muse';
import { TRAP } from '../src/trap';
import { monKnowsTraps, trapTable } from '../src/trapstate';
import { setTerrain, T } from '../src/terrain';
import { addMon } from './helpers';
import { ctxFor, defs, engine, levelSetup, obj, plainKit, render } from './itemHelpers';

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
  o = {},
): EntityId {
  const id = addMon(state, def, x, y, { asleep: false, energy: 12, ...o });
  const e = ent(state, id)!;
  e.c.hp = { cur: hp, max: 20 };
  e.c.monster!.level = 1;
  return id;
}
/** Gives the monster a new object. */
function give(
  state: GameState,
  mon: EntityId,
  otyp: string,
  o: { buc?: 'blessed' | 'cursed' } = {},
) {
  const id = mksobj(ctxFor(state), obj(otyp), { init: false, carriedBy: mon });
  const it = state.entities[String(id)]!.c.item!;
  it.buc = o.buc ?? 'uncursed';
  return id;
}
const addTrap = (level: Level, def: DefId, x: number, y: number) => {
  level.traps.push({ def, x, y, seen: false });
  level.traps.sort((a, b) => a.y * level.width + a.x - (b.y * level.width + b.x));
};
const carried = (state: GameState, mon: EntityId) =>
  inventoryOf(state, mon).map((e) => e.def as string);

describe('find_defensive()/use_defensive(): healing potions', () => {
  test('a wounded hostile drinks its potion of healing: HP back, seen, the potion gone and known', () => {
    const s = make();
    const id = orc(s.state, 9, 3, 3);
    give(s.state, id, 'nh:potion_of_healing');
    expect(isKnown(s.state, defs, 'nh:potion_of_healing' as DefId)).toBe(false);
    const r = s.step({ type: 'wait' });
    const t = textOf(r);
    // (unidentified: "The hill orc drinks an emerald potion!")
    expect(t.some((m) => /^The hill orc drinks an? [a-z -]+ potion!$/.test(m))).toBe(true);
    expect(t).toContain('The hill orc looks better.');
    const hp = ent(s.state, id)!.c.hp!;
    // d(6, 4) more, at most one over the maximum
    expect(hp.cur).toBeGreaterThanOrEqual(3 + 6);
    expect(hp.cur).toBeLessThanOrEqual(21);
    expect(carried(s.state, id)).toEqual([]);
    expect(isKnown(s.state, defs, 'nh:potion_of_healing' as DefId)).toBe(true);
  });

  test('full healing heals mhpmax, raising the maximum by up to 4 (8 blessed)', () => {
    const s = make();
    const id = orc(s.state, 9, 3, 2);
    give(s.state, id, 'nh:potion_of_full_healing', { buc: 'blessed' });
    const t = textOf(s.step({ type: 'wait' }));
    expect(t).toContain('The hill orc looks completely healed.');
    // healmon(mhpmax, 8): 2 + 20 is under 20 + 8, so all of it
    expect(ent(s.state, id)!.c.hp).toEqual({ cur: 22, max: 22 });
  });

  test('a monster above the threshold, or far from her, keeps its potion', () => {
    const s = make();
    // 10 HP of 20 at her level 1: `mhp >= 10 && mhp * 5 >= mhpmax`
    const id = orc(s.state, 9, 3, 10);
    give(s.state, id, 'nh:potion_of_healing');
    const far = orc(s.state, 13, 1, 2);
    ent(s.state, far)!.c.actor!.speed = 0; // dist2 > 25: never looks
    give(s.state, far, 'nh:potion_of_healing');
    for (let i = 0; i < 5; i++) s.step({ type: 'wait' });
    expect(carried(s.state, id)).toEqual(['nh:potion_of_healing']);
    expect(findDefensive(s.ctx as unknown as Ctx, far, false)).toBeNull();
  });

  test('a peaceful monster drinks only when hurt, and never flees by the stairs', () => {
    const s = make();
    const id = orc(s.state, 9, 3, 20, 'nh:hill_orc', { peaceful: true });
    give(s.state, id, 'nh:potion_of_healing');
    for (let i = 0; i < 4; i++) s.step({ type: 'wait' });
    expect(carried(s.state, id)).toEqual(['nh:potion_of_healing']);
    const p = ent(s.state, id)!.c.pos!;
    ent(s.state, id)!.c.hp!.cur = 2;
    // stairs under it change nothing for a peaceful one: it drinks
    setTerrain(getLevel(s.state), p.x, p.y, T.stairs_down);
    const c = findDefensive(s.ctx as unknown as Ctx, id, false);
    expect(c?.kind).toBe('pot_healing');
    s.step({ type: 'wait' });
    expect(carried(s.state, id)).toEqual([]);
    expect(ent(s.state, id)!.c.pos).toBeDefined();
  });

  test('a blinded monster drinks even unhurt, and can see again', () => {
    const s = make();
    const id = orc(s.state, 9, 3, 20);
    give(s.state, id, 'nh:potion_of_extra_healing');
    setMblinded(s.ctx, id, 50);
    const t = textOf(s.step({ type: 'wait' }));
    expect(t.some((m) => /^The hill orc drinks an? [a-z -]+ potion!$/.test(m))).toBe(true);
    expect(t).toContain('The hill orc can see again.');
    expect(mcansee(s.ctx, id)).toBe(true);
    expect(ent(s.state, id)!.c.hp!.max).toBeLessThanOrEqual(22);
  });

  test('the inventory loop walks minvent newest first: either potion can be chosen', () => {
    const s = make();
    const id = orc(s.state, 9, 3, 2);
    give(s.state, id, 'nh:potion_of_extra_healing');
    give(s.state, id, 'nh:potion_of_healing');
    // the plain potion (newest) is met first; the loop stops there 1 time in 3, else the extra
    // healing potion replaces it (oldest first, the extra one would always win: nomore())
    const kinds = new Set<string>();
    for (let i = 0; i < 40; i++)
      kinds.add(findDefensive(s.ctx as unknown as Ctx, id, false)?.kind ?? 'none');
    expect(kinds).toEqual(new Set(['pot_healing', 'pot_extra_healing']));
  });
});

describe('find_defensive()/use_defensive(): escapes', () => {
  test('a wounded hostile next to her jumps into a trap door and migrates below', () => {
    const s = make();
    addTrap(getLevel(s.state), TRAP.trapdoor, 10, 3);
    const id = orc(s.state, 9, 3, 2);
    const t = textOf(s.step({ type: 'wait' }));
    expect(t).toContain('The hill orc jumps into a trap door!');
    expect(ent(s.state, id)!.c.pos).toBeUndefined();
    const to = trapTable(s.ctx, 'migrating', false)?.[String(id)];
    expect(to).toBe('dlvl2');
    expect(trapTable(s.ctx, 'migrVia', false)?.[String(id)]).toBeUndefined();
    expect(trapAt(getLevel(s.state), 10, 3)?.seen).toBe(true);
  });

  test('a wounded hostile next to a teleportation trap jumps onto it and is teleported', () => {
    const s = make();
    addTrap(getLevel(s.state), TRAP.tele, 10, 2);
    const id = orc(s.state, 9, 3, 2);
    const t = textOf(s.step({ type: 'wait' }));
    expect(t).toContain('The hill orc jumps onto a teleportation trap!');
    expect(ent(s.state, id)!.c.pos?.level).toBe('dlvl1');
    expect(monKnowsTraps(s.ctx, id, TRAP.tele)).toBe(true);
    // m_flee: 33 - 30 * 2 / 20 turns (less the turn-end countdown, if any)
    expect(isFleeing(s.ctx, id)).toBe(true);
    expect(fleeTime(s.ctx, id)).toBeGreaterThanOrEqual(29);
    expect(fleeTime(s.ctx, id)).toBeLessThanOrEqual(30);
    expect(trapAt(getLevel(s.state), 10, 2)?.seen).toBe(true);
  });

  test('a trap door takes precedence over a teleportation trap; a flyer can still fall', () => {
    const s = make();
    addTrap(getLevel(s.state), TRAP.tele, 8, 2);
    addTrap(getLevel(s.state), TRAP.trapdoor, 10, 4);
    const id = orc(s.state, 9, 3, 2);
    expect(findDefensive(s.ctx as unknown as Ctx, id, false)).toEqual({
      kind: 'trapdoor',
      obj: null,
      trap: { x: 10, y: 4 },
    });
    // a floating eye (it floats) never falls: it takes the teleportation trap
    const s2 = make();
    addTrap(getLevel(s2.state), TRAP.tele, 8, 2);
    addTrap(getLevel(s2.state), TRAP.trapdoor, 10, 4);
    const eye = orc(s2.state, 9, 3, 2, 'nh:floating_eye');
    expect(findDefensive(s2.ctx as unknown as Ctx, eye, false)).toEqual({
      kind: 'teleport_trap',
      obj: null,
      trap: { x: 8, y: 2 },
    });
  });

  test('a cornered hostile, far from her and unhurt, escapes down the stairs it stands on', () => {
    const rows = [
      '               ',
      ' ............. ',
      ' ......@...... ',
      ' ............. ',
      '               ',
      '  .            ',
      '               ',
    ];
    const s = make(1, rows);
    const level = getLevel(s.state);
    // (2, 5) has stone all around: nowhere to go
    setTerrain(level, 2, 5, T.stairs_down);
    level.down = { x: 2, y: 5 };
    const id = orc(s.state, 2, 5, 20);
    expect(findDefensive(s.ctx as unknown as Ctx, id, false)).toBeNull(); // too far, unhurt
    s.step({ type: 'wait' });
    expect(ent(s.state, id)!.c.pos).toBeUndefined();
    expect(trapTable(s.ctx, 'migrating', false)?.[String(id)]).toBe('dlvl2');
    expect(trapTable(s.ctx, 'migrVia', false)?.[String(id)]).toBe('stairs_up');
  });
});

describe('the stairs on a real level', () => {
  /** A fresh game with no monsters but the hero. */
  function game(seed = 1) {
    const { state } = engine.newGame({ seed });
    (state.modData['nh'] as Record<string, unknown>)['debugMongen'] = true;
    for (const k of Object.keys(state.entities)) {
      const e = state.entities[k];
      if (e?.c.monster && Number(k) !== state.playerId) delete state.entities[k];
    }
    return state;
  }
  /** A passable square within 2 of `p` that is not `p` or any stairs. */
  function near(state: GameState, p: Pos): Pos {
    const level = getLevel(state);
    const rules = cellRules(level, defs);
    for (let dx = -2; dx <= 2; dx++)
      for (let dy = -2; dy <= 2; dy++) {
        const x = p.x + dx;
        const y = p.y + dy;
        if ((dx === 0 && dy === 0) || x < 0 || y < 0 || x >= level.width || y >= level.height)
          continue;
        const t = level.palette[level.cells[cellIndex(level, x, y)] ?? 0]!;
        if (rules.passable[level.cells[cellIndex(level, x, y)] ?? 0] && !defs.terrain(t).stairs)
          return { x, y };
      }
    throw new Error('no square near');
  }
  const put = (state: GameState, p: Pos) => Object.assign(getPlayer(state).c.pos!, p);

  test('a wounded hostile on the down stairs escapes; following her down, it is by the up stairs', () => {
    const state = game();
    const l1 = getLevel(state);
    const down = l1.down!;
    put(state, near(state, down));
    const id = orc(state, down.x, down.y, 2);
    ent(state, id)!.c.pos!.level = l1.id;
    give(state, id, 'nh:dagger');
    engine.stepAll(state, { type: 'wait' });
    expect(ent(state, id)!.c.pos).toBeUndefined();
    expect(trapTable({ state }, 'migrVia', false)?.[String(id)]).toBe('stairs_up');
    put(state, down);
    engine.stepAll(state, { type: 'mod', action: 'nh:down' as DefId });
    const l2 = getLevel(state);
    expect(l2.dlevel).toBe(2);
    const p = ent(state, id)!.c.pos!;
    const up = l2.up!;
    expect(p.level).toBe(l2.id);
    // she stands on the up stairs: it comes out next to them
    expect(Math.max(Math.abs(p.x - up.x), Math.abs(p.y - up.y))).toBe(1);
    expect(carried(state, id)).toEqual(['nh:dagger']);
    expect(trapTable({ state }, 'migrVia', false)?.[String(id)]).toBeUndefined();
  });

  test("on the first level's up stairs it escapes the dungeon, with what it carries", () => {
    const state = game();
    const l1 = getLevel(state);
    const up = l1.up!;
    put(state, near(state, up));
    const id = orc(state, up.x, up.y, 2);
    ent(state, id)!.c.pos!.level = l1.id;
    const dagger = give(state, id, 'nh:dagger');
    engine.stepAll(state, { type: 'wait' });
    expect(ent(state, id)).toBeUndefined();
    expect(ent(state, dagger)).toBeUndefined();
    expect(trapTable({ state }, 'migrating', false)?.[String(id)]).toBeUndefined();
  });
});

describe('precheck(): a cursed wand blows up', () => {
  test('one time in 100 a cursed wand explodes for d(spe + 2, 6); otherwise it is kept', () => {
    const s = make();
    const id = orc(s.state, 9, 3, 20);
    ent(s.state, id)!.c.hp = { cur: 500, max: 500 };
    const ctx = ctxFor(s.state);
    let booms = 0;
    let kept = 0;
    for (let i = 0; i < 2000 && booms === 0; i++) {
      const w = give(s.state, id, 'nh:wand_of_striking', { buc: 'cursed' });
      s.state.entities[String(w)]!.c.item!.spe = 4;
      const before = ent(s.state, id)!.c.hp!.cur;
      const r = precheck(ctx as unknown as Ctx, id, s.state.entities[String(w)]!);
      if (r === -1) {
        booms++;
        const lost = before - ent(s.state, id)!.c.hp!.cur;
        expect(lost).toBeGreaterThanOrEqual(6);
        expect(lost).toBeLessThanOrEqual(36);
        expect(ent(s.state, w)).toBeUndefined();
        const msgs = ctx.events.flatMap((e) =>
          e.type === 'msg'
            ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })]
            : [],
        );
        expect(
          msgs.some((m) =>
            /^The hill orc zaps an? [a-z ]+ wand, which suddenly explodes!$/.test(m),
          ),
        ).toBe(true);
      } else {
        expect(r).toBe(0);
        expect(ent(s.state, w)).toBeDefined();
        kept++;
        s.ctx.remove(w);
      }
    }
    expect(booms).toBe(1);
    expect(kept).toBeGreaterThan(0);
    // an uncursed wand never does
    const w = give(s.state, id, 'nh:wand_of_striking');
    for (let i = 0; i < 300; i++)
      expect(precheck(ctx as unknown as Ctx, id, s.state.entities[String(w)]!)).toBe(0);
  });

  test('the explosion can kill the monster', () => {
    const s = make();
    const id = orc(s.state, 9, 3, 1);
    const ctx = ctxFor(s.state);
    let r: number = 0;
    for (let i = 0; i < 1000 && r === 0; i++) {
      const w = give(s.state, id, 'nh:wand_of_striking', { buc: 'cursed' });
      r = precheck(ctx as unknown as Ctx, id, s.state.entities[String(w)]!);
      if (r === 0) s.ctx.remove(w);
    }
    expect(r).toBe(1);
    expect(ent(s.state, id)).toBeUndefined();
  });
});
