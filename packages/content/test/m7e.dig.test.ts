// m7e step 1: the pick-axe and the dig occupation. Applying a pick-axe or mattock (or the "Dig" /
// "Dig down" offers) wields it, asks the direction and digs over several turns: rock to corridor,
// walls to openings (corridor on cavernous levels, floor on maze levels), doors broken, boulders
// split, down to a pit and then a hole she falls through; refusals (non-diggable walls, shops,
// stairs, altars); interruption and "You continue digging."; the Watch warning then arresting.
// Outcomes are asserted; effort thresholds are reached by forcing the effort.
// ref: src/dig.c use_pick_axe(), use_pick_axe2(), dig(), dig_typ(), dig_check(), watch_dig();
// src/apply.c doapply(); src/wield.c wield_tool(); src/monmove.c watch_on_duty()
import {
  createEngine,
  getPlayer,
  inventoryOf,
  trapAt,
  type DefId,
  type EntityId,
  type GameEvent,
  type GameState,
  type Level,
  type PlayerAction,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { T, vanillaMod } from '../src/index';
import { BOULDER, boulderAt } from '../src/boulder';
import { digTyp } from '../src/dig';
import { diggingOf } from '../src/digstate';
import { mksobj } from '../src/items';
import { pickObjectOfClass } from '../src/mkobj';
import { setTerrain } from '../src/terrain';
import { TRAP } from '../src/trap';
import { levitating, utrap } from '../src/trapstate';
import { addMon } from './helpers';
import { ctxFor, obj, render } from './itemHelpers';
import { mapSetup } from './maps';

const engine = createEngine([vanillaMod]);
const defs = engine.registry;
const texts = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [render({ key: e.key, params: e.params ?? {} })] : []));
const cellOf = (level: Level, x: number, y: number): string | undefined =>
  level.palette[level.cells[y * level.width + x] ?? -1];

/** Str 16, Dex 10 at XL 1: abon() is 1, so a turn of digging adds 11..15 effort. */
function steady(state: GameState): void {
  const h = getPlayer(state);
  h.c.attributes = { str: 16, int: 10, wis: 10, dex: 10, con: 10, cha: 10 };
}

/** A pick in her pack (not wielded), or wielded when `wield`. */
function pick(state: GameState, id = 'nh:pick_axe', wield = false): EntityId {
  const p = mksobj(ctxFor(state), obj(id), { init: false, carriedBy: state.playerId });
  const it = state.entities[String(p)]!.c.item!;
  it.buc = 'uncursed';
  if (wield) {
    for (const o of inventoryOf(state, state.playerId))
      if (o.c.item?.equipped === 'weapon') o.c.item.equipped = null;
    it.equipped = 'weapon';
  }
  return p;
}

/** Steps `a`, then 'continue' while the occupation lasts (and no prompt waits). */
function run(state: GameState, a: PlayerAction, out: string[], max = 300): StepResult {
  let r = engine.step(state, a);
  out.push(...texts(r.events));
  for (let i = 0; i < max && r.continuing && !state.pendingPrompt; i++) {
    r = engine.step(state, { type: 'continue' });
    out.push(...texts(r.events));
  }
  return r;
}

/** Applies the pick and answers the direction prompt; the messages until the digging stops. */
function applyDig(state: GameState, p: EntityId, dir: string, max = 300): string[] {
  const out: string[] = [];
  run(state, { type: 'mod', action: 'nh:apply' as DefId, args: { item: p } }, out);
  const prompt = state.pendingPrompt?.prompt;
  if (prompt?.id !== 'dig-direction') throw new Error(`no direction prompt: ${out.join(' ')}`);
  run(state, { type: 'answer', promptId: prompt.id, value: dir }, out, max);
  return out;
}

/** Starts digging in `dir` and stops after the first move (the swing). */
function startDig(state: GameState, p: EntityId, dir: string): string[] {
  const out: string[] = [];
  run(state, { type: 'mod', action: 'nh:apply' as DefId, args: { item: p } }, out);
  const prompt = state.pendingPrompt!.prompt;
  out.push(
    ...texts(engine.step(state, { type: 'answer', promptId: prompt.id, value: dir }).events),
  );
  return out;
}

const cont = (state: GameState): string[] => texts(engine.step(state, { type: 'continue' }).events);

// ---------------------------------------------------------------------------------------------

describe('the pick-axe', () => {
  test('a tool of the pick-axe skill, made at its probability among tools', () => {
    const def = obj('nh:pick_axe');
    expect(def).toMatchObject({ class: 'tool', prob: 20, weight: 100, cost: 50, material: 'iron' });
    expect(def.weapon).toMatchObject({ small: [1, 6], large: [1, 3], skill: 'pick_axe' });
    const m = mapSetup(['@']);
    const tools = defs.objects.filter((o) => o.class === 'tool');
    const total = tools.reduce((a, o) => a + o.prob, 0);
    let n = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) if (pickObjectOfClass(m.ctx, 'tool')?.id === 'nh:pick_axe') n++;
    expect(Math.abs(n / N - 20 / total)).toBeLessThan(0.01);
  });

  test('applying it wields it first; the direction is asked on the next move', () => {
    const m = mapSetup(['@    ']);
    const p = pick(m.state);
    const out: string[] = [];
    run(m.state, { type: 'mod', action: 'nh:apply' as DefId, args: { item: p } }, out);
    expect(out).toContain('You now wield a pick-axe.');
    expect(m.state.entities[String(p)]?.c.item?.equipped).toBe('weapon');
    const prompt = m.state.pendingPrompt?.prompt;
    expect(prompt?.key).toBe('dig.direction');
    const values = (prompt?.options ?? []).map((o) => o.value);
    for (const v of ['n', 'e', 'sw', 'self', 'up', 'down']) expect(values).toContain(v);
  });

  test('a two-handed mattock cannot be wielded with a shield', () => {
    const m = mapSetup(['@    ']);
    const shield = mksobj(m.ctx, obj('nh:small_shield'), {
      init: false,
      carriedBy: m.state.playerId,
    });
    m.state.entities[String(shield)]!.c.item!.equipped = 'shield';
    const p = pick(m.state, 'nh:dwarvish_mattock');
    const out: string[] = [];
    run(m.state, { type: 'mod', action: 'nh:apply' as DefId, args: { item: p } }, out);
    expect(out).toContain('You cannot swing a two-handed weapon while wearing a shield.');
    expect(m.state.pendingPrompt).toBeNull();
  });

  test('up, at herself and into thin air', () => {
    const m = mapSetup(['.....', '..@..', '.....']);
    steady(m.state);
    const p = pick(m.state, 'nh:pick_axe', true);
    expect(applyDig(m.state, p, 'up')).toContain("You can't reach the ceiling.");
    const before = getPlayer(m.state).c.hp!.cur;
    expect(applyDig(m.state, p, 'self')).toContain('You hit yourself with your pick-axe.');
    expect(getPlayer(m.state).c.hp!.cur).toBeLessThan(before);
    expect(applyDig(m.state, p, 'e')).toContain('You swing your pick-axe through thin air.');
    expect(m.state.occupation).toBeNull();
  });
});

describe('digging sideways', () => {
  test('rock becomes corridor after several turns', () => {
    const m = mapSetup(['@    ']);
    steady(m.state);
    const p = pick(m.state, 'nh:pick_axe', true);
    const t0 = m.state.turn;
    const out = applyDig(m.state, p, 'e');
    expect(out).toContain('You start digging.');
    expect(out).toContain('You hit the rock with all your might.');
    expect(out).toContain('You succeed in cutting away some rock.');
    expect(cellOf(m.level, 1, 0)).toBe(T.corr);
    expect(cellOf(m.level, 2, 0)).toBe(T.stone);
    // effort 11..15 a turn: over 100 after 7 to 10 turns of digging, plus the swing
    expect(m.state.turn - t0).toBeGreaterThanOrEqual(8);
    expect(m.state.turn - t0).toBeLessThanOrEqual(11);
    expect(m.state.occupation).toBeNull();
  });

  test('the effort threshold: still digging at 100, through above it', () => {
    const m = mapSetup(['@    ']);
    steady(m.state);
    const p = pick(m.state, 'nh:pick_axe', true);
    startDig(m.state, p, 'e');
    diggingOf(m)!.effort = 85; // 96..100: not yet
    cont(m.state);
    expect(cellOf(m.level, 1, 0)).toBe(T.stone);
    expect(m.state.occupation).not.toBeNull();
    diggingOf(m)!.effort = 90; // 101..105: through
    expect(cont(m.state)).toContain('You succeed in cutting away some rock.');
    expect(cellOf(m.level, 1, 0)).toBe(T.corr);
    expect(m.state.occupation).toBeNull();
  });

  test('a room wall: an opening (a doorway)', () => {
    const m = mapSetup(['-----', '|..@|', '-----']);
    steady(m.state);
    const p = pick(m.state, 'nh:pick_axe', true);
    expect(applyDig(m.state, p, 'e')).toContain('You make an opening in the wall.');
    expect(cellOf(m.level, 4, 1)).toBe(T.doorway);
  });

  test('a cavernous (Mines) wall becomes corridor, a maze wall floor', () => {
    const c = mapSetup(['     ', '|..@|', '     ']);
    c.level.def = 'nh:minefill' as DefId;
    steady(c.state);
    applyDig(c.state, pick(c.state, 'nh:pick_axe', true), 'e');
    expect(cellOf(c.level, 4, 1)).toBe(T.corr);
    const z = mapSetup(['-----------', '|..@|.|...|', '-----------']);
    z.level.def = 'nh:minetn-5' as DefId; // "mazelevel", no non-diggable areas
    steady(z.state);
    applyDig(z.state, pick(z.state, 'nh:pick_axe', true), 'e');
    expect(cellOf(z.level, 4, 1)).toBe(T.floor);
  });

  test('a closed door is broken; a secret door too', () => {
    const m = mapSetup(['-----', '|..@+', '-----']);
    steady(m.state);
    const p = pick(m.state, 'nh:pick_axe', true);
    const out = applyDig(m.state, p, 'e');
    expect(out).toContain('You start chopping at the door.');
    expect(out).toContain('You break through the door with your pick-axe.');
    expect(cellOf(m.level, 4, 1)).toBe(T.doorway);
    const s = mapSetup(['-----', '|..@|', '-----']);
    setTerrain(s.level, 4, 1, T.sdoor_v);
    steady(s.state);
    expect(applyDig(s.state, pick(s.state, 'nh:pick_axe', true), 'e')).toContain(
      'You break through a secret door!',
    );
    expect(cellOf(s.level, 4, 1)).toBe(T.doorway);
  });

  test('a boulder falls apart into rocks', () => {
    const m = mapSetup(['.....', '..@..', '.....']);
    steady(m.state);
    mksobj(m.ctx, obj(BOULDER), { init: false, at: { level: 'dlvl1', x: 3, y: 1 } });
    const p = pick(m.state, 'nh:pick_axe', true);
    const out = applyDig(m.state, p, 'e');
    expect(out).toContain('You start hitting the boulder.');
    expect(out).toContain('You hit the boulder with all your might.');
    expect(out).toContain('The boulder falls apart.');
    expect(boulderAt(m.ctx, 'dlvl1', 3, 1)).toBeNull();
  });

  test('a non-diggable wall (Sokoban): too hard, nothing changes', () => {
    const m = mapSetup(['-----', '|..@|', '-----']);
    m.level.def = 'nh:soko1-1' as DefId;
    steady(m.state);
    const out = applyDig(m.state, pick(m.state, 'nh:pick_axe', true), 'e');
    expect(out).toContain('This wall is too hard to dig into.');
    expect(cellOf(m.level, 4, 1)).toBe(T.vwall);
    expect(m.state.occupation).toBeNull();
  });

  test("a shop's wall seems too hard", () => {
    const m = mapSetup(['-----', '|..@|', '-----']);
    m.level.rooms = [{ lx: 1, ly: 1, hx: 3, hy: 1, lit: true, type: 'nh:shop' as DefId }];
    steady(m.state);
    const out = applyDig(m.state, pick(m.state, 'nh:pick_axe', true), 'e');
    expect(out).toContain('This wall seems too hard to dig into.');
    expect(cellOf(m.level, 4, 1)).toBe(T.vwall);
  });

  test('a pick vs a tree: "You need an axe to cut down a tree."', () => {
    const m = mapSetup(['.....', '..@..', '.....']);
    setTerrain(m.level, 3, 1, T.tree);
    const p = pick(m.state, 'nh:pick_axe', true);
    expect(digTyp(m.ctx as never, m.state.entities[String(p)]!, m.level, 3, 1)).toBe('undiggable');
    expect(applyDig(m.state, p, 'e')).toContain('You need an axe to cut down a tree.');
  });

  test('interrupted, it resumes where it was; another square starts over', () => {
    const m = mapSetup(['.@   ', '     ']);
    steady(m.state);
    const p = pick(m.state, 'nh:pick_axe', true);
    startDig(m.state, p, 'e');
    cont(m.state);
    cont(m.state);
    const effort = diggingOf(m)!.effort;
    expect(effort).toBeGreaterThan(0);
    engine.step(m.state, { type: 'wait' }); // any other action stops it
    expect(m.state.occupation).toBeNull();
    expect(startDig(m.state, p, 'e')).toContain('You continue digging.');
    expect(diggingOf(m)!.effort).toBe(effort);
    expect(startDig(m.state, p, 's')).toContain('You start digging.');
    expect(diggingOf(m)).toMatchObject({ x: 1, y: 1, effort: 0 });
  });

  test('a hostile monster coming next to her stops it', () => {
    const m = mapSetup(['......', '.@    ', '......']);
    steady(m.state);
    const p = pick(m.state, 'nh:pick_axe', true);
    startDig(m.state, p, 'e');
    const newt = addMon(m.state, 'nh:newt', 0, 0);
    m.state.entities[String(newt)]!.c.actor!.speed = 0;
    const r = engine.step(m.state, { type: 'continue' });
    expect(texts(r.events)).toContain('You stop digging.');
    expect(m.state.occupation).toBeNull();
  });
});

describe('digging down', () => {
  const BIG = ['..........', '..@.......', ...Array.from({ length: 10 }, () => '..........')];

  test('a pit after effort 50, then (applied again) a hole she falls through', () => {
    const m = mapSetup(BIG);
    steady(m.state);
    const p = pick(m.state, 'nh:pick_axe', true);
    const out = applyDig(m.state, p, 'down');
    expect(out).toContain('You start digging downward.');
    expect(out).toContain('You dig a pit in the floor.');
    expect(trapAt(m.level, 2, 1)?.def).toBe(TRAP.pit);
    expect(utrap(m)?.type).toBe('pit');
    // the dig is over once the pit is made: applying again starts afresh, down to the hole
    const out2 = applyDig(m.state, p, 'down');
    expect(out2).toContain('You start digging downward.');
    expect(out2).toContain('You dig a hole through the floor.');
    expect(out2).toContain('You fall through...');
    expect(getPlayer(m.state).c.pos?.level).not.toBe('dlvl1');
    expect(diggingOf(m)).toBeNull();
  });

  test('on stairs or an altar it is refused', () => {
    for (const [id, msg] of [
      [T.stairs_down, 'The stairs are too hard to dig in.'],
      [T.altar_neutral, 'The altar is too hard to break apart.'],
    ] as const) {
      const m = mapSetup(BIG);
      setTerrain(m.level, 2, 1, id);
      const out = applyDig(m.state, pick(m.state, 'nh:pick_axe', true), 'down');
      expect(out).toContain(msg);
      expect(cellOf(m.level, 2, 1)).toBe(id);
      expect(trapAt(m.level, 2, 1)).toBeFalsy();
    }
  });

  test('floating, the floor is out of reach', () => {
    const m = mapSetup(BIG);
    const p = pick(m.state, 'nh:pick_axe', true);
    const ring = mksobj(m.ctx, obj('nh:ring_of_levitation'), {
      init: false,
      carriedBy: m.state.playerId,
    });
    m.state.entities[String(ring)]!.c.item!.buc = 'uncursed';
    engine.step(m.state, { type: 'mod', action: 'nh:puton' as DefId, args: { item: ring } });
    const pp = m.state.pendingPrompt?.prompt;
    if (pp) engine.step(m.state, { type: 'answer', promptId: pp.id, value: 'l' });
    expect(levitating(m.ctx)).toBe(true);
    const out = applyDig(m.state, p, 'down');
    expect(out.some((x) => /^You can't reach the /.test(x))).toBe(true);
    expect(applyDig(m.state, p, 'up')).toContain("You don't have enough leverage.");
  });
});

describe('the offers', () => {
  test('"Dig" next to rock and "Dig down" on herself while she carries a pick', () => {
    const m = mapSetup(['.@   ', '.....']);
    const q = () => engine.query(m.state);
    const digs = (t: Parameters<ReturnType<typeof q>['actionsFor']>[0]) =>
      q()
        .actionsFor(t)
        .filter((o) => o.action.type === 'mod' && o.action.action === 'nh:dig');
    expect(digs({ kind: 'self' })).toEqual([]);
    const p = pick(m.state);
    expect(digs({ kind: 'self' }).map((o) => o.labelKey)).toEqual(['action.nh:dig_down']);
    expect(digs({ kind: 'cell', pos: { x: 2, y: 0 } }).map((o) => o.labelKey)).toEqual([
      'action.nh:dig',
    ]);
    expect(digs({ kind: 'cell', pos: { x: 0, y: 0 } })).toEqual([]); // floor
    // taking it: she wields the pick, then swings on the next move
    steady(m.state);
    const offer = digs({ kind: 'cell', pos: { x: 2, y: 0 } })[0]!;
    const out: string[] = [];
    run(m.state, offer.action, out);
    expect(out).toContain('You now wield a pick-axe.');
    expect(out).toContain('You start digging.');
    expect(out).toContain('You succeed in cutting away some rock.');
    expect(cellOf(m.level, 2, 0)).toBe(T.corr);
    expect(m.state.entities[String(p)]?.c.item?.equipped).toBe('weapon');
  });
});

describe('the Watch', () => {
  // A town room; the hero stands next to its east wall.
  const TOWN = [
    '-----------    ',
    '|.........|    ',
    '|........@|    ',
    '|.........|    ',
    '-----------    ',
  ];
  function town(seed: number) {
    const m = mapSetup(TOWN, { seed });
    m.level.rooms = [{ lx: 1, ly: 1, hx: 9, hy: 3, lit: true }];
    m.level.town = true;
    steady(m.state);
    const wm = addMon(m.state, 'nh:watchman', 2, 2, { peaceful: true });
    m.state.entities[String(wm)]!.c.hp = { cur: 200, max: 200 };
    return { m, wm };
  }

  test('a watchman warns her ("Hey, stop damaging that wall!"), then arrests her', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const { m, wm } = town(seed);
      const p = pick(m.state, 'nh:pick_axe', true);
      const out1 = applyDig(m.state, p, 'e');
      if (!out1.includes('"Hey, stop damaging that wall!"')) continue;
      expect(out1).toContain('You stop digging.');
      expect(cellOf(m.level, 10, 2)).toBe(T.vwall);
      expect(m.state.entities[String(wm)]?.c.monster?.peaceful).toBe(true);
      const out2 = applyDig(m.state, p, 'e');
      expect(out2).toContain('You continue digging.');
      if (!out2.includes('"Halt, vandal!  You\'re under arrest!"')) continue;
      expect(m.state.entities[String(wm)]?.c.monster?.peaceful).toBe(false);
      return;
    }
    throw new Error('no seed found');
  });

  test('out of town the watchman does not care', () => {
    const { m, wm } = town(1);
    delete m.level.town;
    const out = applyDig(m.state, pick(m.state, 'nh:pick_axe', true), 'e');
    expect(out.filter((x) => x.includes('Hey') || x.includes('Halt'))).toEqual([]);
    expect(cellOf(m.level, 10, 2)).toBe(T.doorway);
    expect(m.state.entities[String(wm)]?.c.monster?.peaceful).toBe(true);
  });
});
