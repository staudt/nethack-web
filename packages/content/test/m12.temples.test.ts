// m12 step 5: random temples (mktemple(), shrine_pos(), induced_align()), the ghost of an
// untended temple (intemple()), and the sinks and altars of ordinary rooms (mksink(), mkaltar()).
import {
  cellIndex,
  createEngine,
  getLevel,
  getPlayer,
  sortedIds,
  type Ctx,
  type DefId,
  type Entity,
  type GameEvent,
  type GameState,
  type Level,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import {
  TEMPLE,
  WIZ_MKROOM,
  altarAlign,
  epriOf,
  makeTemple,
  mkaltar,
  mksink,
  shrinePos,
  vanillaMod,
  wizardMod,
} from '../src/index';
import { T, setTerrain } from '../src/terrain';
import { levelSetup, render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'ph',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'ph:run',
      labelKey: 'ph',
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
const wiz = createEngine([vanillaMod, wizardMod, probeMod]);
const texts = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [render({ key: e.key, params: e.params ?? {} })] : []));
function withCtx(state: GameState, fn: (ctx: Ctx) => void): string[] {
  probe.fn = fn;
  return texts(engine.step(state, { type: 'mod', action: 'ph:run' }).events);
}
const all = (state: GameState): Entity[] =>
  sortedIds(state).map((id) => state.entities[String(id)]!);
const monsters = (state: GameState): Entity[] =>
  all(state).filter((e) => e.c.monster && e.id !== state.playerId);
const terrainAt = (level: Level, x: number, y: number): DefId =>
  level.palette[level.cells[cellIndex(level, x, y)]!]!;

// A walled room, floor x 2..8, y 2..6 (centre 5,4), a doorway in its east wall at 9,4; the hero
// outside it at 11,4.
const MAP = [
  '             ',
  ' .........   ',
  ' .........   ',
  ' ........... ',
  ' ........... ',
  ' .........   ',
  ' .........   ',
  ' .........   ',
  '             ',
];
function walledRoom(seed: number): { state: GameState; level: Level } {
  const s = levelSetup(MAP, seed);
  const level = getLevel(s.state);
  level.depth = 10;
  for (let x = 1; x <= 9; x++) {
    setTerrain(level, x, 1, T.hwall);
    setTerrain(level, x, 7, T.hwall);
  }
  for (let y = 1; y <= 7; y++) {
    setTerrain(level, 1, y, T.vwall);
    setTerrain(level, 9, y, T.vwall);
  }
  setTerrain(level, 9, 4, T.doorway);
  level.rooms.push({ lx: 2, ly: 2, hx: 8, hy: 6, lit: true });
  getPlayer(s.state).c.pos = { level: level.id, x: 11, y: 4 };
  return { state: s.state, level };
}

describe('mktemple()', () => {
  test('the shrine at the centre, of a random alignment, with a peaceful priest of it beside it', () => {
    const aligns = new Set<number>();
    for (let seed = 1; seed <= 30; seed++) {
      const { state, level } = walledRoom(seed);
      withCtx(state, (ctx) => makeTemple(ctx, level, 0));
      expect(level.rooms[0]!.type).toBe(TEMPLE);
      expect(level.shrines).toEqual([{ x: 5, y: 4 }]);
      const al = altarAlign(terrainAt(level, 5, 4));
      expect(al).not.toBeNull();
      aligns.add(al!);
      const ms = monsters(state);
      expect(ms).toHaveLength(1);
      const priest = ms[0]!;
      expect(priest.def).toBe('nh:aligned_cleric');
      expect(priest.c.monster!.peaceful).toBe(true);
      const p = priest.c.pos!;
      expect(Math.max(Math.abs(p.x - 5), Math.abs(p.y - 4))).toBe(1);
      const epri = epriOf({ state }, priest.id)!;
      expect(epri.shralign).toBe(al);
      expect(epri.shrpos).toEqual({ x: 5, y: 4 });
      expect(epri.shroom).toBe(0);
    }
    expect([...aligns].sort()).toEqual([-1, 0, 1]);
  });

  test('shrine_pos(): with an even width or height, one of the squares round the middle', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const { state, level } = walledRoom(seed);
      const room = { lx: 2, ly: 2, hx: 7, hy: 5, lit: true };
      withCtx(state, (ctx) => {
        const p = shrinePos(ctx, level, room);
        seen.add(`${p.x},${p.y}`);
      });
    }
    expect([...seen].sort()).toEqual(['4,3', '4,4', '5,3', '5,4']);
  });

  test('shrine_pos(): a blocked centre gives a free square elsewhere', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { state, level } = walledRoom(seed);
      setTerrain(level, 5, 4, T.fountain);
      withCtx(state, (ctx) => {
        const p = shrinePos(ctx, level, level.rooms[0]!);
        expect(p).not.toEqual({ x: 5, y: 4 });
        expect(terrainAt(level, p.x, p.y)).toBe(T.floor);
      });
    }
  });

  test('entering it, the priest greets the hero', () => {
    const { state, level } = walledRoom(4);
    withCtx(state, (ctx) => makeTemple(ctx, level, 0));
    const west = { type: 'move', dir: 'w' } as const;
    const t = [
      ...texts(engine.step(state, west).events),
      ...texts(engine.step(state, west).events),
    ];
    expect(t.some((m) => m.startsWith('"Pilgrim, you enter a sacred place!"'))).toBe(true);
  });

  test('wiz:mkroom offers and makes a temple', () => {
    const { state, level } = walledRoom(5);
    getPlayer(state).c.pos = { level: level.id, x: 3, y: 3 };
    wiz.step(state, { type: 'mod', action: WIZ_MKROOM as DefId });
    const p = state.pendingPrompt?.prompt;
    const values = p?.kind === 'menu' ? (p.options ?? []).map((o) => o.value) : [];
    expect(values).toContain(TEMPLE);
    wiz.step(state, { type: 'answer', promptId: p!.id, value: TEMPLE });
    expect(level.rooms[0]!.type).toBe(TEMPLE);
    expect(level.shrines).toEqual([{ x: 5, y: 4 }]);
    expect(monsters(state).map((m) => m.def)).toEqual(['nh:aligned_cleric']);
  });
});

// Main-dungeon levels 9..14 of a number of games, made by walking down.
describe('random temples in the dungeon', () => {
  test('below DL8 some levels have a temple: one shrine at its centre, one priest, no stairs', () => {
    let temples = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const { state } = engine.newGame({ seed });
      for (let dlevel = 2; dlevel <= 14; dlevel++) {
        withCtx(state, (ctx) => ctx.goToLevel({ dungeon: 'nh:main', dlevel }, 'up'));
        const level = getLevel(state);
        const ri = level.rooms.findIndex((r) => r.type === TEMPLE);
        if (level.def !== undefined || ri === -1) continue;
        expect(level.depth).toBeGreaterThan(8);
        temples++;
        const r = level.rooms[ri]!;
        expect(level.shrines).toHaveLength(1);
        const s = level.shrines![0]!;
        expect(s.x - r.lx - Math.trunc((r.hx - r.lx) / 2)).toBeGreaterThanOrEqual(0);
        expect(s.x - r.lx - Math.trunc((r.hx - r.lx) / 2)).toBeLessThanOrEqual(1);
        expect(s.y - r.ly - Math.trunc((r.hy - r.ly) / 2)).toBeGreaterThanOrEqual(0);
        expect(s.y - r.ly - Math.trunc((r.hy - r.ly) / 2)).toBeLessThanOrEqual(1);
        expect(altarAlign(terrainAt(level, s.x, s.y))).not.toBeNull();
        const priests = all(state).filter(
          (e) => e.c.pos?.level === level.id && epriOf({ state }, e.id)?.shrlevel === level.id,
        );
        expect(priests).toHaveLength(1);
        for (const st of [level.up, level.down])
          if (st) expect(st.x >= r.lx && st.x <= r.hx && st.y >= r.ly && st.y <= r.hy).toBe(false);
      }
    }
    expect(temples).toBeGreaterThan(0);
  });
});

describe('an untended temple', () => {
  test('one time in five a hostile ghost appears next to the hero and frightens her for 3 turns', () => {
    let ghosts = 0;
    const n = 60;
    for (let seed = 1; seed <= n; seed++) {
      const { state, level } = walledRoom(seed);
      setTerrain(level, 5, 4, T.altar_neutral);
      level.rooms[0]!.type = TEMPLE;
      level.shrines = [{ x: 5, y: 4 }];
      getPlayer(state).c.pos = { level: level.id, x: 9, y: 4 };
      const turn0 = state.turn;
      const t = texts(engine.step(state, { type: 'move', dir: 'w' }).events);
      const ghost = monsters(state).find((m) => m.def === 'nh:ghost');
      if (!t.includes('An enormous ghost appears next to you!')) {
        expect(ghost).toBeUndefined();
        continue;
      }
      ghosts++;
      expect(t).toContain('You are frightened to death, and unable to move.');
      expect(ghost).toBeDefined();
      expect(ghost!.c.monster!.peaceful).toBe(false);
      const hp = getPlayer(state).c.pos!;
      const gp = ghost!.c.pos!;
      expect(Math.max(Math.abs(gp.x - hp.x), Math.abs(gp.y - hp.y))).toBe(1);
      // she stays helpless while time passes (the step runs until she can act again)
      expect(state.turn - turn0).toBeGreaterThanOrEqual(4);
      expect(t).toContain('You regain your composure.');
      expect(getPlayer(state).c.helpless).toBeUndefined();
    }
    expect(ghosts / n).toBeGreaterThan(0.08);
    expect(ghosts / n).toBeLessThan(0.35);
  });
});

describe('fill_ordinary_room(): sinks and altars', () => {
  test('mksink() and mkaltar() put theirs on a free square not by a door; altars of each alignment', () => {
    const aligns = new Set<number>();
    for (let seed = 1; seed <= 30; seed++) {
      const { state, level } = walledRoom(seed);
      withCtx(state, (ctx) => {
        mksink(ctx, level, level.rooms[0]!);
        mkaltar(ctx, level, level.rooms[0]!);
      });
      const found: Record<string, { x: number; y: number }[]> = {};
      for (let x = 2; x <= 8; x++)
        for (let y = 2; y <= 6; y++) {
          const t = terrainAt(level, x, y);
          if (t !== T.floor) (found[t] ??= []).push({ x, y });
        }
      expect(found[T.sink]).toHaveLength(1);
      const altars = (Object.keys(found) as DefId[]).filter((k) => altarAlign(k) !== null);
      expect(altars).toHaveLength(1);
      aligns.add(altarAlign(altars[0]!)!);
      expect(altars[0]).not.toBe(T.altar_unaligned);
      for (const p of [...found[T.sink]!, ...found[altars[0]!]!])
        expect(p.x === 8 && p.y === 4).toBe(false); // next to the doorway at 9,4
      expect(level.shrines).toBeUndefined();
    }
    expect([...aligns].sort()).toEqual([-1, 0, 1]);
  });

  test('mkaltar() makes nothing in a special room', () => {
    const { state, level } = walledRoom(1);
    level.rooms[0]!.type = 'nh:zoo';
    withCtx(state, (ctx) => mkaltar(ctx, level, level.rooms[0]!));
    for (let x = 2; x <= 8; x++)
      for (let y = 2; y <= 6; y++) expect(terrainAt(level, x, y)).toBe(T.floor);
  });

  test('about one ordinary room in 60 gets a sink, and one in 60 an altar', () => {
    let rooms = 0;
    let sinks = 0;
    let altars = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { state } = engine.newGame({ seed });
      for (let dlevel = 2; dlevel <= 4; dlevel++) {
        withCtx(state, (ctx) => ctx.goToLevel({ dungeon: 'nh:main', dlevel }, 'up'));
        const level = getLevel(state);
        if (level.def !== undefined) continue;
        rooms += level.rooms.filter((r) => r.parent === undefined && r.type === undefined).length;
        for (const t of level.cells.map((c) => level.palette[c]!)) {
          if (t === T.sink) sinks++;
          else if (altarAlign(t) !== null) altars++;
        }
      }
    }
    expect(rooms).toBeGreaterThan(500);
    expect(sinks).toBeGreaterThan(rooms / 200);
    expect(sinks).toBeLessThan(rooms / 20);
    expect(altars).toBeGreaterThan(rooms / 200);
    expect(altars).toBeLessThan(rooms / 20);
  });
});
