// Milestone 7b step 2: boulders in generated levels (extra corridors, the Mines filler, Orcish
// Town), breaking boulders with striking and force bolt, kicking them.
import {
  cellIndex,
  cellRules,
  createEngine,
  getLevel,
  getPlayer,
  itemsAt,
  sortedIds,
  type Ctx,
  type DefId,
  type Entity,
  type GameState,
  type Json,
  type Level,
  type LevelRef,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { BOULDER, T, WAN, vanillaMod } from '../src/index';
import { blockersOf } from '../src/boulder';
import { TRAP, dataOf } from '../src/trap';
import { mksobj } from '../src/items';
import { P, setItimeout } from '../src/props';
import { setPw } from '../src/uenergy';
import { engine as itemEngine, levelSetup, obj, plainKit, render } from './itemHelpers';

// A probe action that runs a callback with a real Ctx (no time passes).
const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'mp',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'mp:run',
      labelKey: 'mp',
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
const defs = engine.registry;

function goTo(state: GameState, to: LevelRef): Level {
  probe.fn = (ctx) => ctx.goToLevel(to, 'up');
  engine.step(state, { type: 'mod', action: 'mp:run' });
  return getLevel(state);
}

const onLevel = (state: GameState, level: Level): Entity[] =>
  sortedIds(state)
    .map((id) => state.entities[String(id)])
    .filter((e): e is Entity => e?.c.pos?.level === level.id);
const boulders = (state: GameState, level: Level): Entity[] =>
  onLevel(state, level).filter((e) => e.def === BOULDER);
const terrainAt = (level: Level, x: number, y: number): DefId | undefined =>
  level.palette[level.cells[cellIndex(level, x, y)] ?? -1];

/**
 * No monster on a boulder square, and every boulder on passable ground. `launch` boulders (a
 * rolling boulder trap's, keyed "x,y") may sit on a monster: C's mkroll_launch() does not look.
 */
function boulderSane(
  state: GameState,
  level: Level,
  launch: ReadonlySet<string> = new Set(),
): void {
  const { passable } = cellRules(level, defs);
  const mons = new Set(
    onLevel(state, level)
      .filter((e) => e.c.monster)
      .map((e) => cellIndex(level, e.c.pos!.x, e.c.pos!.y)),
  );
  for (const b of boulders(state, level)) {
    const i = cellIndex(level, b.c.pos!.x, b.c.pos!.y);
    expect(passable[level.cells[i] ?? 0]).toBe(true);
    if (!launch.has(`${b.c.pos!.x},${b.c.pos!.y}`)) expect(mons.has(i)).toBe(false);
  }
}

describe('boulders in level generation', () => {
  test('extra corridors get boulders on some levels, always on corridor cells', () => {
    let levels = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { state } = engine.newGame({ seed });
      const level = getLevel(state);
      expect(level.boulderSpots).toBeUndefined(); // made and forgotten by the newLevel hook
      const here = boulders(state, level);
      if (here.length) levels++;
      for (const b of here) expect(terrainAt(level, b.c.pos!.x, b.c.pos!.y)).toBe(T.corr);
      boulderSane(state, level);
    }
    expect(levels).toBeGreaterThan(0);
  });

  test('the Mines filler makes 1-2 boulders 75% of the time, never under a monster', () => {
    let withBoulders = 0;
    let n = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const { state } = engine.newGame({ seed });
      const level = goTo(state, { dungeon: 'nh:mines', dlevel: 1 });
      expect(level.def).toBe('nh:minefill');
      // the filler's own boulders: not those waiting on a rolling boulder trap's launch spot
      const launch = new Set(
        level.traps.flatMap((t) => {
          const l = dataOf(t).launch;
          return t.def === TRAP.rolling && l ? [`${l.x},${l.y}`] : [];
        }),
      );
      const count = boulders(state, level).filter(
        (b) => !launch.has(`${b.c.pos!.x},${b.c.pos!.y}`),
      ).length;
      // a random trap may land on an earlier one (sp_lev's get_location() ignores traps, as in C):
      // a rolling boulder trap replaced that way leaves its launch boulder behind (seed 15)
      // (seed 58: a launch boulder on a gnome, made after it as in C)
      boulderSane(state, level, launch);
      if (level.traps.length < 6) continue;
      expect(count).toBeLessThanOrEqual(2);
      if (count > 0) withBoulders++;
      n++;
    }
    // percent(75): 45 of 60 expected
    expect(withBoulders / n).toBeGreaterThan(0.55);
    expect(withBoulders / n).toBeLessThan(0.92);
  });
});

/** A hero in a lit room with a boulder 2 squares east. */
function boulderRoom(seed = 1) {
  const s = levelSetup(['.......', '.@.....', '.......'], seed);
  plainKit(s.state);
  const b = mksobj(s.ctx, obj(BOULDER), { init: false, at: { level: 'dlvl1', x: 3, y: 1 } });
  s.step({ type: 'wait' }); // vision for the new level
  return { s, b };
}
const answer = (s: ReturnType<typeof levelSetup>, value: Json) => {
  const p = s.state.pendingPrompt?.prompt;
  if (!p) throw new Error('no prompt');
  return itemEngine.step(s.state, { type: 'answer', promptId: p.id, value });
};
const textOf = (events: readonly { type: string; key?: string; params?: object }[]): string[] =>
  events.flatMap((e) =>
    e.type === 'msg' && e.key ? [render({ key: e.key, params: (e.params ?? {}) as never })] : [],
  );

describe('breaking boulders', () => {
  test('a wand of striking turns a boulder into 7..66 rocks on top of its pile', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 30; seed++) {
      const { s, b } = boulderRoom(seed);
      const under = mksobj(s.ctx, obj('nh:dagger'), {
        init: false,
        at: { level: 'dlvl1', x: 3, y: 1 },
      });
      expect(itemsAt(defs, s.state, 'dlvl1', 3, 1)[0]?.id).toBe(b); // the boulder is on top
      const w = s.carry(WAN.striking);
      s.state.entities[String(w)]!.c.item!.spe = 5;
      const r1 = s.mod('nh:zap', { item: w });
      const text = [...s.text(r1), ...textOf(answer(s, 'e').events)];
      expect(text).toContain('The boulder falls apart.');
      const rocks = s.state.entities[String(b)];
      expect(rocks?.def).toBe('nh:rock');
      expect(rocks?.c.pos).toMatchObject({ x: 3, y: 1 });
      const q = rocks?.c.item?.quantity ?? 0;
      expect(q).toBeGreaterThanOrEqual(7);
      expect(q).toBeLessThanOrEqual(66);
      seen.add(q);
      const pile = itemsAt(defs, s.state, 'dlvl1', 3, 1);
      expect(pile.map((e) => e.id)).toEqual([b, under]); // the rocks stay on top
      expect(blockersOf(s.ctx, 'dlvl1').size).toBe(0);
      expect(s.state.discovered).toContain(WAN.striking); // seen or heard: learned
    }
    expect(seen.size).toBeGreaterThan(5);
  });

  test('unseen, it is a crumbling sound', () => {
    const { s, b } = boulderRoom();
    setItimeout(s.state, getPlayer(s.state), P.BLINDED, 50);
    const w = s.carry(WAN.striking);
    s.state.entities[String(w)]!.c.item!.spe = 5;
    s.step({ type: 'wait' });
    const r1 = s.mod('nh:zap', { item: w });
    const text = [...s.text(r1), ...textOf(answer(s, 'e').events)];
    expect(text).toContain('You hear a crumbling sound.');
    expect(s.state.entities[String(b)]?.def).toBe('nh:rock');
  });

  test('force bolt breaks a boulder too', () => {
    const { s, b } = boulderRoom();
    const h = getPlayer(s.state);
    if (h.c.attributes) h.c.attributes.wis = 25;
    const robe = s.carry('nh:robe');
    s.state.entities[String(robe)]!.c.item!.equipped = 'cloak';
    setPw(s.ctx, { uen: 100, uenmax: 100, uenpeak: 100 });
    (s.state.modData['nh'] as Record<string, Json>)['spells'] = [
      { id: 'nh:spellbook_of_force_bolt', retention: 20000 },
    ];
    s.mod('nh:cast');
    answer(s, 0);
    const text = textOf(answer(s, 'e').events);
    expect(text).toContain('The boulder falls apart.');
    expect(s.state.entities[String(b)]?.def).toBe('nh:rock');
  });
});

describe('kicking boulders', () => {
  const kick = (s: ReturnType<typeof levelSetup>, dir: string) => {
    itemEngine.step(s.state, { type: 'mod', action: 'nh:kick' as DefId });
    return answer(s, dir);
  };

  test('"Ouch! That hurts!": hit points lost, the boulder stays', () => {
    const s = levelSetup(['.@..', '....'], 2); // seed: no HP regained in the kick's turn
    const h = getPlayer(s.state);
    h.c.attributes = { str: 18, int: 10, wis: 10, dex: 14, con: 18, cha: 10 };
    const b = mksobj(s.ctx, obj(BOULDER), { init: false, at: { level: 'dlvl1', x: 2, y: 0 } });
    const hp0 = h.c.hp!.cur;
    const t0 = s.state.turn;
    const r = kick(s, 'e');
    expect(textOf(r.events)).toContain('Ouch!  That hurts!');
    expect(hp0 - h.c.hp!.cur).toBeGreaterThanOrEqual(1);
    expect(hp0 - h.c.hp!.cur).toBeLessThanOrEqual(3);
    expect(s.state.turn).toBeGreaterThan(t0);
    expect(s.state.entities[String(b)]?.c.pos).toMatchObject({ x: 2, y: 0 });
  });

  test('standing on a boulder: "There\'s not enough room to kick in here.", no time', () => {
    const s = levelSetup(['.@..', '....']);
    mksobj(s.ctx, obj(BOULDER), { init: false, at: { level: 'dlvl1', x: 1, y: 0 } });
    const t0 = s.state.turn;
    const r = itemEngine.step(s.state, { type: 'mod', action: 'nh:kick' as DefId });
    expect(textOf(r.events)).toEqual(["There's not enough room to kick in here."]);
    expect(s.state.pendingPrompt).toBeNull();
    expect(s.state.turn).toBe(t0);
  });
});
