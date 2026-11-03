// Milestone 6b1 step 1: dungeon features (fountain, sink, tree, altars) and LevelDef contents at
// fixed spots with `peaceful`.
import {
  cellIndex,
  cellRules,
  checkStep,
  createEngine,
  getLevel,
  insideRoom,
  loadMods,
  mapBlock,
  roomHas,
  sortedIds,
  VANILLA_TERRAIN,
  type Ctx,
  type DefId,
  type GameState,
  type Level,
  type LevelDef,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { T, messagesEn, vanillaMod } from '../src/index';
import { levelSetup, render } from './itemHelpers';

const FEATURES = [
  T.fountain,
  T.sink,
  T.tree,
  T.altar_lawful,
  T.altar_neutral,
  T.altar_chaotic,
  T.altar_unaligned,
] as const;

/** Sets cell x,y of `level` to terrain `id`, adding it to the palette. */
function paint(level: Level, x: number, y: number, id: DefId): void {
  let i = level.palette.indexOf(id);
  if (i === -1) i = level.palette.push(id) - 1;
  level.cells[cellIndex(level, x, y)] = i;
}

describe('feature terrains', () => {
  const defs = loadMods([vanillaMod]);

  test('core names them and content draws and names them as NetHack does', () => {
    expect(FEATURES.map((id) => Object.values(VANILLA_TERRAIN).includes(id))).not.toContain(false);
    const shown = FEATURES.map((id) => {
      const t = defs.terrain(id);
      return [id, t.glyph.ch, t.passable, t.opaque, messagesEn[id], messagesEn[t.nameKey]];
    });
    expect(shown).toEqual([
      [T.fountain, '{', true, false, 'fountain', 'fountain'],
      [T.sink, '{', true, false, 'sink', 'sink'],
      [T.tree, '#', false, true, 'tree', 'tree'],
      [T.altar_lawful, '_', true, false, 'lawful altar', 'altar'],
      [T.altar_neutral, '_', true, false, 'neutral altar', 'altar'],
      [T.altar_chaotic, '_', true, false, 'chaotic altar', 'altar'],
      [T.altar_unaligned, '_', true, false, 'unaligned altar', 'altar'],
    ]);
  });

  test('a tree blocks the way; a fountain does not', () => {
    const s = levelSetup(['.@{#.']);
    const level = getLevel(s.state);
    paint(level, 2, 0, T.fountain);
    paint(level, 3, 0, T.tree);
    const rules = cellRules(level, defs);
    expect(checkStep(level, rules, { x: 1, y: 0 }, 'e').ok).toBe(true);
    expect(checkStep(level, rules, { x: 2, y: 0 }, 'e')).toMatchObject({
      ok: false,
      reason: 'blocked',
    });
  });

  test('stepping onto objects on a feature names the feature first', () => {
    const s = levelSetup(['.@...']);
    const level = getLevel(s.state);
    paint(level, 2, 0, T.altar_neutral);
    paint(level, 3, 0, T.fountain);
    s.floor('nh:apple', { at: { level: 'dlvl1', x: 2, y: 0 } });
    s.floor('nh:apple', { at: { level: 'dlvl1', x: 3, y: 0 } });
    s.floor('nh:dagger', { at: { level: 'dlvl1', x: 3, y: 0 } });
    const east = () => s.step({ type: 'move', dir: 'e' });
    expect(s.text(east())).toEqual(['There is a neutral altar here.', 'You see here an apple.']);
    expect(s.text(east())).toEqual([
      'There is a fountain here.',
      expect.stringMatching(/^There are an? .* and an? .* here\.$/),
    ]);
    expect(s.text(east())).toEqual([]); // plain floor, nothing here
  });

  test('a feature with nothing on it is not mentioned (no mention_decor)', () => {
    const s = levelSetup(['.@...']);
    paint(getLevel(s.state), 2, 0, T.sink);
    expect(s.text(s.step({ type: 'move', dir: 'e' }))).toEqual([]);
  });

  test('fighting a tree is harmless', () => {
    const s = levelSetup(['.@...']);
    paint(getLevel(s.state), 2, 0, T.tree);
    const r = s.step({ type: 'mod', action: 'nh:fight', args: { dir: 'e' } });
    expect(r.events.flatMap((e) => (e.type === 'msg' ? [render(e)] : []))).toEqual([
      'You harmlessly attack the tree.',
    ]);
  });
});

// LevelDefs with contents at fixed spots, each as a one-level dungeon below DL5.
const SPOTS: LevelDef = {
  id: 'ft:spots',
  init: { style: 'solidfill', fg: 'nh:floor', lit: true },
  contents: [
    { kind: 'monster', id: 'nh:gnome_lord', x: 3, y: 2, peaceful: true },
    { kind: 'monster', id: 'nh:gnome_lord', x: -2, y: -1, peaceful: true },
    { kind: 'monster', id: 'nh:gnome_lord', x: 3, y: 2, peaceful: false }, // taken: next to it
    { kind: 'object', id: 'nh:apple', x: 5, y: 5 },
    { kind: 'trap', id: 'nh:bear_trap', x: 6, y: 5 },
  ],
};
const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const spotsMod = (def: LevelDef): Mod => ({
  id: 'ft',
  version: '1',
  register(api) {
    api.defineLevel(def);
    api.defineDungeon({
      id: 'ft:d',
      nameKey: 'ft',
      levels: { base: 1 },
      entry: { from: 'nh:main', base: 5 },
      filler: def.id,
    });
    api.defineAction({
      id: 'ft:run',
      labelKey: 'ft',
      handles: 'mod',
      offer: () => [],
      perform(ctx) {
        probe.fn(ctx);
        return 0;
      },
    });
  },
});

describe('LevelDef contents at a spot', () => {
  /** A new game with the hero sent to the dungeon built from `def`. */
  const visit = (def: LevelDef, seed: number) => {
    const engine = createEngine([vanillaMod, spotsMod(def)]);
    const { state } = engine.newGame({ seed });
    probe.fn = (ctx) => ctx.goToLevel({ dungeon: 'ft:d', dlevel: 1 }, 'up');
    engine.step(state, { type: 'mod', action: 'ft:run' });
    return { state, level: getLevel(state) };
  };
  const on = (state: GameState, level: Level, def: DefId) =>
    sortedIds(state)
      .map((id) => state.entities[String(id)])
      .filter((e) => e?.def === def && e.c.pos?.level === level.id);

  test('things go on their spots; negative coordinates count from the far edge', () => {
    for (const seed of [1, 2, 3]) {
      const { state, level } = visit(SPOTS, seed);
      const lords = on(state, level, 'nh:gnome_lord').map((e) => ({
        x: e?.c.pos?.x,
        y: e?.c.pos?.y,
        peaceful: e?.c.monster?.peaceful,
      }));
      const [first, second, third] = lords;
      // the hero may stand on the first spot (the up stairs), which moves the gnome lord over
      if (level.up?.x !== 3 || level.up.y !== 2)
        expect(first).toEqual({ x: 3, y: 2, peaceful: true });
      expect(second).toEqual({ x: level.width - 2, y: level.height - 1, peaceful: true });
      // the third wanted a taken spot and went next to it, forced hostile
      expect(third?.peaceful).toBe(false);
      expect(Math.max(Math.abs((third?.x ?? 0) - 3), Math.abs((third?.y ?? 0) - 2))).toBe(1);
      expect(on(state, level, 'nh:apple').map((e) => e?.c.pos)).toMatchObject([{ x: 5, y: 5 }]);
      const stairs = [level.up, level.down].some((p) => p?.x === 6 && p.y === 5);
      expect(level.traps.filter((t) => t.x === 6 && t.y === 5).map((t) => t.def)).toEqual(
        stairs ? [] : ['nh:bear_trap'],
      );
    }
  });

  test('a spot outside the level throws', () => {
    const far: LevelDef = {
      ...SPOTS,
      contents: [{ kind: 'object', id: 'nh:apple', x: 500, y: 1 }],
    };
    expect(() => visit(far, 1)).toThrow(
      /LevelDef 'ft:spots': object at 500,1 is outside the 80x21 level/,
    );
  });
});

// Milestone 6b1 step 2: contents of a LevelDef with a map block use the block's coordinates.
describe('LevelDef contents with a map block', () => {
  const BLOCK: LevelDef = {
    id: 'ft:spots',
    init: { style: 'solidfill', fg: 'nh:floor', lit: true },
    map: { rows: Array<string>(5).fill('.'.repeat(12)), halign: 'center', valign: 'center' },
    contents: [
      { kind: 'object', id: 'nh:apple', x: 1, y: 2 },
      { kind: 'object', id: 'nh:carrot', x: -1, y: -1, coords: 'level' },
      { kind: 'object', id: 'nh:rock', count: 8 },
    ],
  };
  const visit = (seed: number) => {
    const engine = createEngine([vanillaMod, spotsMod(BLOCK)]);
    const { state } = engine.newGame({ seed });
    probe.fn = (ctx) => ctx.goToLevel({ dungeon: 'ft:d', dlevel: 1 }, 'up');
    engine.step(state, { type: 'mod', action: 'ft:run' });
    return { state, level: getLevel(state) };
  };
  const posOf = (state: GameState, level: Level, def: DefId) =>
    sortedIds(state)
      .map((id) => state.entities[String(id)])
      .filter((e) => e?.def === def && e.c.pos?.level === level.id)
      .map((e) => ({ x: e?.c.pos?.x ?? -1, y: e?.c.pos?.y ?? -1 }));

  test('fixed spots are map-relative unless coords is level; random spots stay in the block', () => {
    const b = mapBlock(BLOCK, 80, 21);
    expect(b).toEqual({ x: 34, y: 9, w: 12, h: 5 });
    if (!b) return;
    for (const seed of [1, 2, 3]) {
      const { state, level } = visit(seed);
      expect(posOf(state, level, 'nh:apple')).toEqual([{ x: b.x + 1, y: b.y + 2 }]);
      expect(posOf(state, level, 'nh:carrot')).toEqual([{ x: 79, y: 20 }]);
      const rocks = posOf(state, level, 'nh:rock');
      expect(rocks.length).toBeGreaterThan(0); // some may stack
      for (const p of rocks) {
        expect(p.x - b.x).toBeGreaterThanOrEqual(0);
        expect(p.x - b.x).toBeLessThan(b.w);
        expect(p.y - b.y).toBeGreaterThanOrEqual(0);
        expect(p.y - b.y).toBeLessThan(b.h);
      }
    }
  });
});

// Milestone 6b1 step 3: contents of a room are made in that room, at room-relative spots.
describe('LevelDef room contents', () => {
  const ROOMS: LevelDef = {
    id: 'ft:spots',
    init: { style: 'solidfill', fg: 'nh:stone', lit: true },
    rooms: [
      {
        x: 3,
        y: 3,
        w: 14,
        h: 8,
        xalign: 'center',
        yalign: 'center',
        lit: true,
        contents: [
          { kind: 'object', id: 'nh:apple', x: 1, y: 6 },
          { kind: 'object', id: 'nh:rock', count: 12 },
        ],
        rooms: [
          {
            x: 6,
            y: 2,
            w: 3,
            h: 3,
            doors: [{ state: 'nodoor', wall: 'south' }],
            contents: [{ kind: 'object', id: 'nh:carrot', count: 3 }],
          },
        ],
      },
      { stairs: ['up'] },
      { stairs: ['down'] },
    ],
    corridors: 'random',
  };
  const visit = (seed: number) => {
    const engine = createEngine([vanillaMod, spotsMod(ROOMS)]);
    const { state } = engine.newGame({ seed });
    probe.fn = (ctx) => ctx.goToLevel({ dungeon: 'ft:d', dlevel: 1 }, 'up');
    engine.step(state, { type: 'mod', action: 'ft:run' });
    return { state, level: getLevel(state) };
  };
  const posOf = (state: GameState, level: Level, def: DefId) =>
    sortedIds(state)
      .map((id) => state.entities[String(id)])
      .filter((e) => e?.def === def && e.c.pos?.level === level.id)
      .map((e) => ({ x: e?.c.pos?.x ?? -1, y: e?.c.pos?.y ?? -1 }));

  test('fixed spots are room-relative; random ones stay in the room, outside its subrooms', () => {
    for (const seed of [1, 2, 3, 4]) {
      const { state, level } = visit(seed);
      const town = level.rooms[0];
      const shed = level.rooms[1];
      if (!town || !shed) throw new Error('rooms missing');
      expect(shed.parent).toBe(0);
      expect(posOf(state, level, 'nh:apple')).toEqual([{ x: town.lx + 1, y: town.ly + 6 }]);
      const rocks = posOf(state, level, 'nh:rock');
      expect(rocks.length).toBeGreaterThan(0);
      for (const p of rocks) {
        expect(roomHas(level, 0, p.x, p.y)).toBe(true);
        expect(insideRoom(shed, p.x, p.y)).toBe(false);
      }
      const carrots = posOf(state, level, 'nh:carrot');
      expect(carrots.length).toBeGreaterThan(0);
      for (const p of carrots) expect(roomHas(level, 1, p.x, p.y)).toBe(true);
    }
  });
});
