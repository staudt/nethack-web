// m21 step 6: symbol sets resolved into the snapshot's legend, their validation, and LevelDef
// doorwaysBlockDiagonal in cellRules().
import { describe, expect, test } from 'vitest';
import { createEngine } from '../src/engine';
import { cellRules, checkStep } from '../src/movement';
import { findPath } from '../src/path';
import { ModLoadError, loadMods } from '../src/registry';
import { getLevel } from '../src/state';
import type { DefId } from '../src/types/common';
import type { LevelDef, Mod, SymsetDef } from '../src/types/mod';
import { applyUpdate, buildSnapshot, diffSnapshot } from '../src/view';
import { VANILLA_TERRAIN } from '../src/levelgen/index';
import { fakeMod } from './helpers/fakeMod';
import { objDef, objectsMod } from './helpers/objectMods';

const DOORWAY = 'sy:doorway' as DefId;

const SET: SymsetDef = {
  id: 'sy:oldset',
  nameKey: 'symset.old',
  glyphs: { [DOORWAY]: '+', 'ob:apple': 'A' },
  classes: { armor: ']', food: ':' },
  fg: '#777',
};

const level = (id: DefId, extra: Partial<LevelDef> = {}): LevelDef => ({
  id,
  init: { style: 'solidfill', fg: VANILLA_TERRAIN.floor, lit: true },
  ...extra,
});

/** Mod 'sy': an armour piece, its appearance, a marker of class armor, a '[' monster, the set. */
const symsetMod = (set: SymsetDef = SET, levels: LevelDef[] = []): Mod => ({
  id: 'sy',
  version: '1',
  dependsOn: ['nh', 'ob'],
  register(api) {
    api.defineTerrain({
      id: DOORWAY,
      nameKey: 'terrain.doorway',
      passable: true,
      opaque: false,
      door: 'doorway',
      glyph: { ch: '.', fg: '#ccc' },
    });
    api.defineObject(
      objDef('mail', {
        id: 'sy:mail',
        class: 'armor',
        armor: { slot: 'body', ac: 3, mc: 0 },
        glyph: { ch: '[', fg: '#0ff' },
      }),
    );
    api.defineAppearance({
      id: 'sy:shiny',
      nameKey: 'app.shiny',
      class: 'armor',
      glyph: { ch: '[', fg: '#ff0' },
    });
    api.defineAppearance({
      id: 'sy:mark',
      nameKey: 'app.mark',
      class: 'armor',
      glyph: { ch: 'I', fg: '#aaa' },
      marker: true,
    });
    api.defineBrain({ id: 'sy:b', act: () => undefined } as never);
    api.defineMonster({
      id: 'sy:mimic',
      nameKey: 'mon.mimic',
      glyph: { ch: '[', fg: '#f0f' },
      level: 1,
      speed: 3,
      ac: 7,
      mr: 0,
      alignment: 0,
      attacks: [],
      size: 'medium',
      flags: [],
      frequency: 0,
      group: null,
      genFlags: [],
      difficulty: 2,
      resists: [],
      conveys: [],
      weight: 100,
      nutrition: 100,
      brain: 'sy:b',
    } as never);
    api.defineSymset(set);
    api.defineLevel(level('sy:plain'));
    api.defineLevel(level('sy:old', { symset: set.id, doorwaysBlockDiagonal: true }));
    for (const l of levels) api.defineLevel(l);
  },
});

function snapshotOn(def: DefId | undefined) {
  const engine = createEngine([fakeMod, objectsMod(), symsetMod()]);
  const { state } = engine.newGame({ seed: 7 });
  const lvl = getLevel(state);
  if (def === undefined) delete lvl.def;
  else lvl.def = def;
  return { engine, state, s: buildSnapshot(engine.registry, state) };
}

describe('symset legend', () => {
  test('a level without a symset keeps the defs’ glyphs and names none', () => {
    for (const def of [undefined, 'sy:plain' as DefId]) {
      const { s } = snapshotOn(def);
      expect(s.symset).toBeUndefined();
      expect('symset' in s).toBe(false);
      expect(s.legend[DOORWAY]?.ch).not.toBe('+');
      expect(s.legend['sy:mail']).toEqual({ ch: '[', fg: '#0ff' });
      expect(s.legend['ob:apple']).toEqual({ ch: '%', fg: '#f00' });
    }
  });

  test('a symset level resolves ids, then object classes, and recolours everything', () => {
    const { engine, s } = snapshotOn('sy:old');
    expect(s.symset).toBe('sy:oldset');
    expect(s.legend[DOORWAY]).toEqual({ ch: '+', fg: '#777' });
    // an id entry wins over its class's character
    expect(s.legend['ob:apple']).toEqual({ ch: 'A', fg: '#777' });
    // objects and appearances by class
    expect(s.legend['sy:mail']).toEqual({ ch: ']', fg: '#777' });
    expect(s.legend['sy:shiny']).toEqual({ ch: ']', fg: '#777' });
    // classes not in the set keep their characters
    expect(s.legend['ob:dagger']).toEqual({ ch: ')', fg: '#777' });
    expect(s.legend['ob:ruby']).toEqual({ ch: '!', fg: '#777' });
    // a marker is no object, a monster drawn '[' is no armour; the hero is recoloured too
    expect(s.legend['sy:mark']).toEqual({ ch: 'I', fg: '#777' });
    expect(s.legend['sy:mimic']).toEqual({ ch: '[', fg: '#777' });
    expect(s.legend['nh:tester']).toEqual({ ch: '@', fg: '#777' });
    // every legend entry has the set's colour, and the same keys as anywhere else
    expect(Object.values(s.legend).every((g) => g.fg === '#777')).toBe(true);
    expect(Object.keys(s.legend)).toEqual(Object.keys(snapshotOn(undefined).s.legend));
    // the registry is untouched
    expect(engine.registry.object('sy:mail').glyph).toEqual({ ch: '[', fg: '#0ff' });
  });

  test('a set without fg keeps the colours', () => {
    const set: SymsetDef = { id: 'sy:oldset', nameKey: 'k', classes: { armor: ']' } };
    const engine = createEngine([fakeMod, objectsMod(), symsetMod(set)]);
    const { state } = engine.newGame({ seed: 7 });
    getLevel(state).def = 'sy:old';
    const s = buildSnapshot(engine.registry, state);
    expect(s.legend['sy:mail']).toEqual({ ch: ']', fg: '#0ff' });
    expect(s.legend[DOORWAY]).toEqual(engine.registry.terrain(DOORWAY).glyph);
  });

  test('a change of symset on the same level sends a full snapshot carrying it', () => {
    const { engine, state, s: rogue } = snapshotOn('sy:old');
    delete getLevel(state).def;
    const plain = buildSnapshot(engine.registry, state);
    const back = diffSnapshot(rogue, plain);
    expect(back.kind).toBe('full');
    const applied = applyUpdate(rogue, back);
    expect(applied.symset).toBeUndefined();
    expect(applied.legend[DOORWAY]).toEqual(engine.registry.terrain(DOORWAY).glyph);
    // the same set: deltas as usual
    expect(diffSnapshot(rogue, rogue).kind).toBe('delta');
  });
});

describe('symset validation', () => {
  const issues = (set: SymsetDef, levels: LevelDef[] = []): string[] => {
    try {
      loadMods([fakeMod, objectsMod(), symsetMod(set, levels)]);
      return [];
    } catch (e) {
      if (!(e instanceof ModLoadError)) throw e;
      return e.issues.map((i) => `${i.defId ?? ''} ${i.path}: ${i.reason}`);
    }
  };

  test('the vanilla-like set loads', () => {
    expect(issues(SET)).toEqual([]);
    const reg = loadMods([fakeMod, objectsMod(), symsetMod()]);
    expect(reg.symset('sy:oldset').classes).toEqual({ armor: ']', food: ':' });
    expect(reg.symsets.map((s) => s.id)).toEqual(['sy:oldset']);
    expect(() => reg.symset('sy:nope')).toThrow(/Unknown symset/);
  });

  test('bad characters, classes, ids and colours are reported', () => {
    const bad = {
      id: 'sy:oldset',
      nameKey: '',
      glyphs: { [DOORWAY]: '++', 'sy:nothing': '+' },
      classes: { armour: ']', food: '' },
      fg: '',
    } as unknown as SymsetDef;
    expect(issues(bad)).toEqual([
      'sy:oldset nameKey: must be a non-empty string',
      'sy:oldset glyphs.sy:doorway: must be exactly one character',
      expect.stringMatching(/^sy:oldset classes\.armour: unknown object class/),
      'sy:oldset classes.food: must be exactly one character',
      'sy:oldset fg: must be a non-empty string',
      expect.stringMatching(/^sy:oldset glyphs\.sy:nothing: unknown legend id 'sy:nothing'/),
    ]);
  });

  test('a level naming an unknown set, or a bad doorway flag, is reported', () => {
    expect(
      issues(SET, [
        level('sy:lost', { symset: 'sy:gone' }),
        level('sy:flag', { doorwaysBlockDiagonal: false as unknown as true }),
      ]),
    ).toEqual([
      'sy:flag doorwaysBlockDiagonal: must be true',
      "sy:lost symset: unknown symset 'sy:gone'",
    ]);
  });
});

describe('doorwaysBlockDiagonal', () => {
  const engine = createEngine([fakeMod, objectsMod(), symsetMod()]);

  /** A floor level with a doorway at (5,5) and the hero's level def set to `def`. */
  function doorwayLevel(def: DefId | undefined) {
    const { state } = engine.newGame({ seed: 7 });
    const lvl = getLevel(state);
    if (def === undefined) delete lvl.def;
    else lvl.def = def;
    if (!lvl.palette.includes(DOORWAY)) lvl.palette.push(DOORWAY);
    const floor = lvl.palette.indexOf(VANILLA_TERRAIN.floor as DefId);
    lvl.cells = lvl.cells.map(() => floor);
    lvl.cells[5 * lvl.width + 5] = lvl.palette.indexOf(DOORWAY);
    return lvl;
  }

  test('on a flagged level a doorway blocks diagonals into and out of it', () => {
    const lvl = doorwayLevel('sy:old');
    const r = cellRules(lvl, engine.registry);
    expect(r.intactDoor[lvl.palette.indexOf(DOORWAY)]).toBe(true);
    expect(r.closedDoor[lvl.palette.indexOf(DOORWAY)]).toBe(false);
    expect(checkStep(lvl, r, { x: 4, y: 4 }, 'se')).toEqual({ ok: false, reason: 'diagonalDoor' });
    expect(checkStep(lvl, r, { x: 5, y: 5 }, 'ne')).toEqual({ ok: false, reason: 'diagonalDoor' });
    expect(checkStep(lvl, r, { x: 4, y: 5 }, 'e')).toEqual({ ok: true });
    expect(checkStep(lvl, r, { x: 5, y: 5 }, 's')).toEqual({ ok: true });
  });

  test('elsewhere a doorway allows diagonals', () => {
    for (const def of [undefined, 'sy:plain' as DefId]) {
      const lvl = doorwayLevel(def);
      const r = cellRules(lvl, engine.registry);
      expect(r.intactDoor[lvl.palette.indexOf(DOORWAY)]).toBe(false);
      expect(checkStep(lvl, r, { x: 4, y: 4 }, 'se')).toEqual({ ok: true });
    }
  });

  test('travel goes round a flagged doorway instead of cutting the corner', () => {
    for (const [def, len] of [
      ['sy:old', 3],
      [undefined, 2],
    ] as const) {
      const lvl = doorwayLevel(def);
      // a wall row with the doorway as its only gap: (4,4) to (6,6) through (5,5)
      const wall = lvl.palette.indexOf(VANILLA_TERRAIN.vwall as DefId);
      for (let x = 0; x < lvl.width; x++) if (x !== 5) lvl.cells[5 * lvl.width + x] = wall;
      const r = cellRules(lvl, engine.registry);
      const path = findPath(lvl, r, lvl.cells.slice(), { x: 4, y: 4 }, { x: 5, y: 6 });
      expect(path?.length).toBe(len);
    }
  });
});
