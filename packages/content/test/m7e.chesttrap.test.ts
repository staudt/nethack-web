// m7e step 4: trapped boxes and doors, #force. Each chest_trap() outcome with its roll forced
// (a scripted rn2), the trap set off by #loot and by picking the lock, #force with a blade (the
// lock gives or the blade breaks) and a blunt weapon (the box wrecked, its potions broken),
// trapped doors set off by opening, kicking, unlocking, a wand of striking and a monster opening
// one, trapped doors made by level generation, the shop door, and the wish parser.
// ref: src/trap.c chest_trap(), b_trapped(); src/lock.c doforce(), forcelock(), breakchestlock(),
// picklock(), doopen_indir(), doorlock(); src/monmove.c postmov(), mb_trapped(); src/dokick.c
// kick_door(); src/mklev.c dosdoor(); src/shknam.c stock_room(); src/pickup.c use_container()
import {
  cellIndex,
  getPlayer,
  inventoryOf,
  type Ctx,
  type DefId,
  type EntityId,
  type GameEvent,
  type GameState,
  type Mod,
  type Rng,
  type StepResult,
  createEngine,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { P, T, WAN, hasProp, setItimeout, vanillaMod } from '../src/index';
import {
  boxTknown,
  doorTrapped,
  isBoxTrapped,
  setBoxTrapped,
  setDoorTrapped,
} from '../src/btrapstate';
import { chestTrap } from '../src/chesttrap';
import { breakchestlock } from '../src/force';
import { mksobj } from '../src/items';
import { lockData } from '../src/lockstate';
import { addMon } from './helpers';
import { defs, itemOf, obj, plainKit, render } from './itemHelpers';
import { mapSetup } from './maps';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'ct',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'ct:run',
      labelKey: 'ct',
      handles: 'mod',
      offer: () => [],
      perform(ctx) {
        probe.fn(ctx);
        return 0;
      },
    });
  },
};
const engine = createEngine([vanillaMod, probeMod]);
const textsOf = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [render({ key: e.key, params: e.params ?? {} })] : []));
const texts = (r: StepResult): string[] => textsOf(r.events);
/** Runs `fn` with a real Ctx, no time passing; the rendered messages. */
function run(state: GameState, fn: (ctx: Ctx) => void): string[] {
  probe.fn = fn;
  return textsOf(engine.step(state, { type: 'mod', action: 'ct:run' }).events);
}
/** A Ctx whose rn2() answers from `script` first (out-of-range answers are an error). */
function scripted(ctx: Ctx, script: number[]): Ctx {
  const real = ctx.rng;
  const rng: Rng = {
    next: () => real.next(),
    rn2: (x) => {
      const v = script.shift();
      if (v === undefined) return real.rn2(x);
      if (v < 0 || v >= x) throw new Error(`scripted rn2(${x}) cannot be ${v}`);
      return v;
    },
    rnd: (x) => real.rnd(x),
    d: (n, s) => real.d(n, s),
  };
  return { ...ctx, rng };
}

type M = ReturnType<typeof mapSetup>;
function make(rows: string[], seed = 1): M {
  const m = mapSetup(rows, { seed });
  plainKit(m.state);
  getPlayer(m.state).c.hp = { cur: 500, max: 500 };
  return m;
}
const step = (m: M, a: Parameters<M['step']>[0]): StepResult => engine.stepAll(m.state, a);
/** One move only (an occupation is not run to its end). */
const once = (m: M, action: string, args?: Record<string, unknown>): StepResult =>
  engine.step(m.state, {
    type: 'mod',
    action: action as DefId,
    ...(args ? { args: args as never } : {}),
  });
const mod = (m: M, action: string, args?: Record<string, unknown>): StepResult =>
  step(m, { type: 'mod', action: action as DefId, ...(args ? { args: args as never } : {}) });
const answer = (m: M, value: unknown): StepResult => {
  const p = m.state.pendingPrompt?.prompt;
  if (!p) throw new Error('no prompt');
  return engine.stepAll(m.state, { type: 'answer', promptId: p.id, value: value as never });
};
function boxAt(
  m: M,
  x: number,
  y: number,
  o: { locked?: boolean; trapped?: boolean } = {},
): EntityId {
  const id = mksobj(m.ctx, obj('nh:large_box'), { init: false, at: { level: 'dlvl1', x, y } });
  if (o.locked) itemOf(m.state, id).locked = true;
  if (o.trapped) setBoxTrapped(m.ctx, id, true);
  return id;
}
function into(m: M, box: EntityId, def: string, quantity = 1): EntityId {
  const id = mksobj(m.ctx, obj(def), { init: false, quantity });
  itemOf(m.state, id).containedIn = box;
  return id;
}
const hp = (m: M): number => getPlayer(m.state).c.hp!.cur;
const exists = (m: M, id: EntityId): boolean => m.state.entities[String(id)] !== undefined;
const cell = (m: M, x: number, y: number): DefId | undefined =>
  m.level.palette[m.level.cells[cellIndex(m.level, x, y)] ?? -1];

const ROOM = ['-------', '|.....|', '|..@..|', '|.....|', '-------'];

// ---------------------------------------------------------------------------------------------

describe('chest_trap() outcomes', () => {
  /** Sets the box at her feet off with the given rn2 answers; the messages. */
  function fire(m: M, box: EntityId, script: number[]): string[] {
    return run(m.state, (ctx) => {
      chestTrap(scripted(ctx, script), ctx.state.entities[String(box)]!, 'hand', false);
    });
  }

  test('saved by luck: a dud, and the box is no longer trapped (and she knows it)', () => {
    const m = make(ROOM);
    const box = boxAt(m, 3, 2, { trapped: true });
    const before = hp(m);
    // rn2(13 + Luck) > 7, then the dud message (rn2(13) 11..12)
    expect(fire(m, box, [8, 12])).toEqual([
      'You trigger a trap!',
      'But luckily the explosive charge is a dud!',
    ]);
    expect(hp(m)).toBe(before);
    expect(isBoxTrapped(m.state, box)).toBe(false);
    expect(boxTknown(m.state, box)).toBe(true);
  });

  test('the explosion destroys the box, its contents and the pile, and hurts her', () => {
    const m = make(ROOM);
    const box = boxAt(m, 3, 2, { trapped: true });
    const inside = into(m, box, 'nh:dagger');
    const pile = mksobj(m.ctx, obj('nh:food_ration'), {
      init: false,
      at: { level: 'dlvl1', x: 3, y: 2 },
    });
    const before = hp(m);
    // not saved; rn2(20) == 0 picks rn2(26); 25 is the explosion
    expect(fire(m, box, [0, 0, 25])).toEqual(['You trigger a trap!', 'The large box explodes!']);
    expect(exists(m, box)).toBe(false);
    expect(exists(m, inside)).toBe(false);
    expect(exists(m, pile)).toBe(false);
    const lost = before - hp(m);
    expect(lost).toBeGreaterThanOrEqual(6);
    expect(lost).toBeLessThanOrEqual(36);
  });

  test('a carried box explodes but stays (its contents are lost)', () => {
    const m = make(ROOM);
    const box = mksobj(m.ctx, obj('nh:large_box'), { init: false, carriedBy: m.state.playerId });
    setBoxTrapped(m.ctx, box, true);
    const inside = into(m, box, 'nh:dagger');
    fire(m, box, [0, 0, 21]);
    expect(exists(m, box)).toBe(true);
    expect(exists(m, inside)).toBe(false);
  });

  test('noxious gas and the poisoned needle poison her', () => {
    const m = make(ROOM);
    const box = boxAt(m, 3, 2, { trapped: true });
    const gas = fire(m, box, [0, 0, 18]);
    expect(gas.slice(0, 3)).toEqual([
      'You trigger a trap!',
      'A cloud of noxious gas billows from the large box.',
      'The gas cloud was poisoned!',
    ]);
    const box2 = boxAt(m, 3, 2, { trapped: true });
    const needle = fire(m, box2, [0, 0, 14]);
    expect(needle.slice(0, 3)).toEqual([
      'You trigger a trap!',
      'You feel a needle prick your hand.',
      'The needle was poisoned!',
    ]);
  });

  test('a tower of flame bursts from the box', () => {
    const m = make(ROOM);
    const box = boxAt(m, 3, 2, { trapped: true });
    // not saved, rn2(20) != 0 so rn2(13 - Luck): 10
    expect(fire(m, box, [0, 1, 10])[1]).toBe('A tower of flame bursts from the large box!');
  });

  test('an electric shock: shock resistance leaves her unhurt', () => {
    const m = make(ROOM);
    const box = boxAt(m, 3, 2, { trapped: true });
    const before = hp(m);
    setItimeout(m.state, getPlayer(m.state), P.SHOCK_RES, 10000);
    const t = fire(m, box, [0, 1, 7]);
    expect(t.slice(0, 3)).toEqual([
      'You trigger a trap!',
      'You are jolted by a surge of electricity!',
      "You don't seem to be affected.",
    ]);
    expect(hp(m)).toBe(before);
  });

  test('paralysis freezes her in place', () => {
    const m = make(ROOM);
    const box = boxAt(m, 3, 2, { trapped: true });
    expect(fire(m, box, [0, 1, 4])[1]).toBe('Suddenly you are frozen in place!');
    expect(getPlayer(m.state).c.helpless?.reasonKey).toBe('helpless.frozen_trap');
  });

  test('the colored gas stuns her and makes her hallucinate', () => {
    const m = make(ROOM);
    const box = boxAt(m, 3, 2, { trapped: true });
    // the color is rn2(CLR_MAX): 1 is red
    const t = fire(m, box, [0, 1, 1, 1]);
    expect(t.slice(1)).toEqual([
      'A cloud of red gas billows from the large box.',
      'You stagger and your vision blurs...',
    ]);
    const hero = getPlayer(m.state);
    expect(hasProp(hero, P.STUNNED)).toBe(true);
    expect(hasProp(hero, P.HALLUC)).toBe(true);
  });
});

describe('setting a box trap off', () => {
  test('#loot opens a trapped box: the trap goes off and the turn is used', () => {
    const m = make(ROOM);
    const box = boxAt(m, 3, 2, { trapped: true });
    const t = texts(mod(m, 'nh:loot', { box }));
    expect(t[0]).toBe('You trigger a trap!');
    expect(isBoxTrapped(m.state, box)).toBe(false);
    expect(m.state.pendingPrompt).toBeNull(); // no "Do what?" menu this time
  });

  test('picking the lock of a trapped box sets it off when the lock gives', () => {
    const m = make(ROOM);
    getPlayer(m.state).c.attributes!.dex = 25; // a skeleton key: 75 + 25, always succeeds
    const key = mksobj(m.ctx, obj('nh:skeleton_key'), { init: false, carriedBy: m.state.playerId });
    const box = boxAt(m, 3, 2, { locked: true, trapped: true });
    mod(m, 'nh:lock', { item: key, box });
    const t = texts(answer(m, true));
    expect(t.slice(0, 2)).toEqual(['You succeed in unlocking the box.', 'You trigger a trap!']);
    expect(isBoxTrapped(m.state, box)).toBe(false);
  });

  test('a known trapped box says so in its name; a wished-for one may be trapped', () => {
    const m = make(ROOM);
    const box = boxAt(m, 3, 2, { trapped: true });
    const name = (): string => render(defs.itemName(m.state, m.state.entities[String(box)]!));
    expect(name()).toBe('large box');
    run(m.state, (ctx) => {
      ctx.state.modData['nh'] = {
        ...(ctx.state.modData['nh'] as object),
        tknown: { [String(box)]: true },
      };
    });
    expect(name()).toBe('trapped large box');
  });
});

describe('#force', () => {
  /** Wields a new `def` instead of her kit's weapon. */
  function wieldNew(m: M, def: string): EntityId {
    for (const o of inventoryOf(m.state, m.state.playerId))
      if (o.c.item?.equipped === 'weapon') o.c.item.equipped = null;
    const id = mksobj(m.ctx, obj(def), { init: false, carriedBy: m.state.playerId });
    itemOf(m.state, id).equipped = 'weapon';
    return id;
  }
  const sword = (m: M): EntityId => wieldNew(m, 'nh:long_sword');

  test('offered on a box at her feet while she wields the long sword', () => {
    const m = make(ROOM);
    sword(m);
    const box = boxAt(m, 3, 2, { locked: true });
    const offers = engine
      .query(m.state)
      .actionsFor({ kind: 'self' })
      .filter((o) => o.action.type === 'mod' && o.action.action === 'nh:force');
    expect(offers.map((o) => o.action)).toEqual([
      { type: 'mod', action: 'nh:force', args: { box } },
    ]);
  });

  test('prying with a blade until the lock gives: the box is unlocked and broken', () => {
    const m = make(ROOM);
    const s = sword(m);
    itemOf(m.state, s).buc = 'cursed'; // a cursed blade never breaks
    const box = boxAt(m, 3, 2, { locked: true });
    const first = texts(once(m, 'nh:force', { box }));
    expect(first).toEqual(['You force your long sword into a crack and pry.']);
    const x = lockData(m.ctx).xlock!;
    expect(x.chance).toBe(24); // oc_wldam (d12) * 2
    x.chance = 100;
    const t = texts(step(m, { type: 'continue' }));
    expect(t).toContain('You succeed in forcing the lock.');
    expect(itemOf(m.state, box).locked).toBeUndefined();
    expect(itemOf(m.state, box).broken).toBe(true);
    expect(exists(m, s)).toBe(true);
  });

  test('a blade may break', () => {
    const m = make(ROOM);
    const s = sword(m);
    itemOf(m.state, s).spe = -9000; // rn2(1000 - spe) > 992 nearly every turn
    const box = boxAt(m, 3, 2, { locked: true });
    once(m, 'nh:force', { box });
    lockData(m.ctx).xlock!.chance = 0;
    const t: string[] = [];
    for (let i = 0; i < 60 && m.state.occupation; i++)
      t.push(...texts(step(m, { type: 'continue' })));
    expect(t).toContain('Your long sword broke!');
    expect(t).toContain('You give up your attempt to force the lock.');
    expect(exists(m, s)).toBe(false);
    expect(itemOf(m.state, box).locked).toBe(true);
  });

  test('a blunt weapon bashes; wrecking the box breaks every potion, a third of the rest', () => {
    const m = make(ROOM);
    const box = boxAt(m, 3, 2, { locked: true });
    const potions = into(m, box, 'nh:potion_of_confusion', 3);
    const rest: EntityId[] = [];
    for (let i = 0; i < 9; i++) rest.push(into(m, box, 'nh:dagger'));
    const t = run(m.state, (ctx) => breakchestlock(ctx, ctx.state.entities[String(box)]!, true));
    expect(t[0]).toBe("In fact, you've totally destroyed the large box.");
    expect(exists(m, box)).toBe(false);
    // a stack of potions loses one; the other two land at her feet
    expect(t.filter((s) => / shatter!$/.test(s))).toHaveLength(1);
    expect(itemOf(m.state, potions).quantity).toBe(2);
    const destroyed = t.filter((s) => s === 'A dagger is destroyed!').length;
    const left = Object.values(m.state.entities)
      .filter((e) => e?.def === 'nh:dagger' && e.c.pos?.x === 3 && e.c.pos.y === 2)
      .reduce((n, e) => n + (e?.c.item?.quantity ?? 0), 0);
    expect(left + destroyed).toBe(9); // the survivors stack at her feet
    expect(rest.length).toBe(9);
  });

  test('bashing with a mace: wakes things, chance from its large damage', () => {
    const m = make(ROOM);
    wieldNew(m, 'nh:mace');
    const box = boxAt(m, 3, 2, { locked: true });
    expect(texts(once(m, 'nh:force', { box }))).toEqual(['You start bashing it with your mace.']);
    expect(lockData(m.ctx).xlock).toMatchObject({ force: 'blunt', chance: 12 });
  });

  test('an unlocked box: "its lock is already unlocked"', () => {
    const m = make(ROOM);
    const box = boxAt(m, 3, 2);
    expect(texts(mod(m, 'nh:force', { box }))).toEqual([
      'There is a large box here, but its lock is already unlocked.',
      'You decide not to force the issue.',
    ]);
  });
});

describe('trapped doors', () => {
  const HALL = ['-------', '|.@+..|', '-------'];
  function trappedDoor(m: M): void {
    setDoorTrapped(m.ctx, 'dlvl1', 3, 1, true);
    expect(doorTrapped(m.ctx, 'dlvl1', 3, 1)).toBe(true);
  }
  const kaboom = 'KABOOM!!  The door was booby-trapped!';

  test('opening one: KABOOM, an empty doorway, and she is stunned', () => {
    // (seed 2: a blast of more than 1 point, which her regeneration would hide this turn)
    const m = make(HALL, 2);
    trappedDoor(m);
    const before = hp(m);
    const t = texts(mod(m, 'nh:open', { dir: 'e' }));
    expect(t.slice(0, 2)).toEqual(['The door opens.', kaboom]);
    expect(cell(m, 3, 1)).toBe(T.doorway);
    expect(hp(m)).toBeLessThan(before);
    // stunned for as many turns as the damage: a 1-point blast wears off at the end of this turn
    expect(t).toContain('You stagger...');
    const stunned = hasProp(getPlayer(m.state), P.STUNNED);
    expect(stunned).toBe(!t.includes('You feel a bit steadier now.'));
    expect(doorTrapped(m.ctx, 'dlvl1', 3, 1)).toBe(false);
  });

  test('kicking one that gives way', () => {
    const m = make(HALL);
    trappedDoor(m);
    const a = getPlayer(m.state).c.attributes!;
    Object.assign(a, { str: 25, dex: 25, con: 25 });
    const t: string[] = [];
    for (let i = 0; i < 40 && cell(m, 3, 1) !== T.doorway; i++)
      t.push(...texts(mod(m, 'nh:kick', { dir: 'e' })));
    expect(t).toContain('You kick the door.');
    expect(t).toContain(kaboom);
    expect(cell(m, 3, 1)).toBe(T.doorway);
  });

  test('unlocking one with a key', () => {
    const m = make(HALL);
    run(m.state, (ctx) => {
      const lv = ctx.state.levels['dlvl1']!;
      lv.palette.push(T.door_locked);
      lv.cells[cellIndex(lv, 3, 1)] = lv.palette.length - 1;
    });
    trappedDoor(m);
    getPlayer(m.state).c.attributes!.dex = 30; // 70 + dex: always
    const key = mksobj(m.ctx, obj('nh:skeleton_key'), { init: false, carriedBy: m.state.playerId });
    mod(m, 'nh:lock', { item: key, dir: 'e' });
    const t = texts(answer(m, true));
    expect(t.slice(0, 2)).toEqual(['You succeed in unlocking the door.', kaboom]);
    expect(cell(m, 3, 1)).toBe(T.doorway);
  });

  test('a wand of striking blows it up', () => {
    const m = make(HALL);
    trappedDoor(m);
    const w = mksobj(m.ctx, obj(WAN.striking), { init: false, carriedBy: m.state.playerId });
    itemOf(m.state, w).spe = 4;
    mod(m, 'nh:zap', { item: w });
    const t = texts(answer(m, 'e'));
    expect(t).toContain('KABOOM!!  You see a door explode.');
    expect(cell(m, 3, 1)).toBe(T.doorway);
  });

  test('a monster opening one is hurt and stunned', () => {
    const m = make(['---------', '|@....+.|', '---------']);
    setDoorTrapped(m.ctx, 'dlvl1', 6, 1, true);
    const gnome = addMon(m.state, 'nh:gnome', 7, 1);
    m.state.entities[String(gnome)]!.c.hp = { cur: 100, max: 100 };
    const t: string[] = [];
    for (let i = 0; i < 20 && cell(m, 6, 1) !== T.doorway; i++)
      t.push(...texts(step(m, { type: 'wait' })));
    expect(t).toContain('KABOOM!!  You see a door explode.');
    expect(cell(m, 6, 1)).toBe(T.doorway);
    expect(m.state.entities[String(gnome)]!.c.hp!.cur).toBeLessThan(100);
  });
});

describe('trapped doors in level generation', () => {
  test('deep levels get some, kept in content state and forgotten by the level', () => {
    let found = 0;
    for (let seed = 1; seed <= 12 && found === 0; seed++) {
      const { state } = engine.newGame({ seed });
      for (let d = 5; d <= 12; d++) {
        run(state, (ctx) => ctx.goToLevel({ dungeon: 'nh:main', dlevel: d }, 'up'));
        const level = state.levels[state.currentLevel]!;
        expect(level.trappedDoorSpots).toBeUndefined();
        const traps = (state.modData['nh'] as { doorTraps?: Record<string, number[]> }).doorTraps;
        for (const i of traps?.[level.id] ?? []) {
          found++;
          const x = i % level.width;
          const y = Math.floor(i / level.width);
          expect(doorTrapped({ state, defs }, level.id, x, y)).toBe(true);
        }
      }
    }
    expect(found).toBeGreaterThan(0);
  });
});
