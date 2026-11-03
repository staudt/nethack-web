// Milestone 6b1 step 5: special levels of a dungeon (DungeonDef.special), placed when the layout
// is rolled, a variant picked when the level is made, the town flag, and the v8 save format.
import { describe, expect, test } from 'vitest';
import { rollDungeons } from '../src/dungeon';
import { createEngine } from '../src/engine';
import { ModLoadError, loadMods } from '../src/registry';
import { createRng, seedRng } from '../src/rng';
import { getLevel } from '../src/state';
import type { Ctx, DungeonDef, LevelDef, Mod, SpecialLevelDef } from '../src/types/mod';
import type { DefId } from '../src/types/common';
import type { GameState } from '../src/types/state';
import { actionsMod, terrainMod } from './helpers/fakeMods';

const plain = (id: DefId): LevelDef => ({
  id,
  init: { style: 'solidfill', fg: 'nh:floor', lit: true },
});
const LEVELS = [plain('dg:town-a'), plain('dg:town-b'), plain('dg:end')];
const TOWN: SpecialLevelDef = {
  id: 'dg:town',
  nameKey: 'town',
  base: 3,
  range: 2,
  variants: ['dg:town-a', 'dg:town-b'],
  town: true,
};
const MAIN: DungeonDef = { id: 'dg:main', nameKey: 'main' };
const MINES: DungeonDef = {
  id: 'dg:mines',
  nameKey: 'mines',
  levels: { base: 8, range: 2 },
  entry: { from: 'dg:main', base: 2, range: 3 },
  special: [TOWN],
};
const dungeonMod = (defs: DungeonDef[], levels: LevelDef[] = LEVELS): Mod => ({
  id: 'dg',
  version: '1',
  register(api) {
    levels.forEach((l) => api.defineLevel(l));
    defs.forEach((d) => api.defineDungeon(d));
  },
});

function issues(defs: DungeonDef[]): string[] {
  try {
    loadMods([terrainMod(), dungeonMod(defs)]);
    return [];
  } catch (e) {
    if (!(e instanceof ModLoadError)) throw e;
    return e.issues.map((i) => `${i.defId ?? ''} ${i.path}`);
  }
}

const ctl: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const runMod: Mod = {
  id: 'gt',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'gt:run',
      labelKey: 'a.run',
      handles: 'mod',
      offer: () => [],
      perform(ctx) {
        ctl.fn(ctx);
        return 12;
      },
    });
  },
};
const engine = createEngine([terrainMod(), actionsMod(), runMod, dungeonMod([MAIN, MINES])]);
const fresh = (seed = 5): GameState => engine.newGame({ seed, width: 40, height: 15 }).state;

describe('special level placement', () => {
  test('base 3, range 2: always placed, on level 3 or 4, both over seeds', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 100; seed++) {
      const [main, mines] = rollDungeons(createRng(seedRng(seed)), [MAIN, MINES]);
      expect(main?.special).toEqual([]);
      expect(mines?.special).toHaveLength(1);
      const dl = mines?.special[0]?.dlevel ?? 0;
      expect(mines?.special[0]?.id).toBe('dg:town');
      seen.add(dl);
    }
    expect([...seen].sort()).toEqual([3, 4]);
  });

  test('a negative base counts from the bottom; later levels avoid taken ones', () => {
    const END: SpecialLevelDef = { id: 'dg:end', nameKey: 'end', base: -1, variants: ['dg:end'] };
    const NEXT: SpecialLevelDef = {
      id: 'dg:next',
      nameKey: 'n',
      base: 3,
      range: 2,
      variants: ['dg:end'],
    };
    for (let seed = 1; seed <= 100; seed++) {
      const [, mines] = rollDungeons(createRng(seedRng(seed)), [
        MAIN,
        { ...MINES, special: [TOWN, END, NEXT] },
      ]);
      const sp = mines?.special ?? [];
      expect(sp.map((s) => s.id)).toEqual(['dg:town', 'dg:end', 'dg:next']);
      expect(sp[1]?.dlevel).toBe(mines?.levels);
      // the town and the next one share levels 3..4: one each
      expect([sp[0]?.dlevel, sp[2]?.dlevel].sort()).toEqual([3, 4]);
    }
  });

  test('chance 0 leaves it out; when nothing fits the roll throws', () => {
    const [, mines] = rollDungeons(createRng(seedRng(1)), [
      MAIN,
      { ...MINES, special: [{ ...TOWN, chance: 0 }] },
    ]);
    expect(mines?.special).toEqual([]);
    const ONE: SpecialLevelDef = { ...TOWN, range: 1 };
    expect(() =>
      rollDungeons(createRng(seedRng(1)), [
        MAIN,
        { ...MINES, special: [ONE, { ...ONE, id: 'dg:b' }] },
      ]),
    ).toThrow(/Cannot place/);
  });

  test('loadMods checks the entries', () => {
    expect(issues([MAIN, MINES])).toEqual([]);
    expect(issues([MAIN, { ...MINES, special: [{ ...TOWN, base: 0 }] }])).toEqual([
      'dg:mines special[0].base',
    ]);
    expect(issues([MAIN, { ...MINES, special: [{ ...TOWN, base: 9 }] }])).toEqual([
      'dg:mines special[0].base',
    ]);
    expect(issues([{ ...MAIN, special: [{ ...TOWN, base: -1 }] }, MINES])).toEqual([
      'dg:main special[0].base',
    ]);
    expect(issues([MAIN, { ...MINES, special: [{ ...TOWN, chance: 101 }] }])).toEqual([
      'dg:mines special[0].chance',
    ]);
    expect(issues([MAIN, { ...MINES, special: [{ ...TOWN, variants: [] }] }])).toEqual([
      'dg:mines special[0].variants',
    ]);
    expect(issues([MAIN, { ...MINES, special: [{ ...TOWN, variants: ['dg:nope'] }] }])).toEqual([
      'dg:mines special[0].variants[0]',
    ]);
    expect(issues([MAIN, { ...MINES, special: [TOWN, TOWN] }])).toEqual(['dg:mines special[1].id']);
  });
});

describe('making a special level', () => {
  test('one of its variants, picked when first made, with the town flag', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const s = fresh(seed);
      const town = s.dungeons[1]?.special[0];
      ctl.fn = (ctx) => ctx.goToLevel({ dungeon: 'dg:mines', dlevel: town?.dlevel ?? 0 }, 'up');
      engine.step(s, { type: 'mod', action: 'gt:run', args: null });
      const level = getLevel(s);
      expect(level.town).toBe(true);
      expect(['dg:town-a', 'dg:town-b']).toContain(level.def);
      seen.add(level.def ?? '');
      // the level next to it is ordinary
      ctl.fn = (ctx) => ctx.goToLevel({ dungeon: 'dg:mines', dlevel: 1 }, 'up');
      engine.step(s, { type: 'mod', action: 'gt:run', args: null });
      expect(getLevel(s).town).toBeUndefined();
      expect(getLevel(s).def).toBeUndefined();
    }
    expect(seen.size).toBe(2);
  });
});

describe('save v8', () => {
  const replay = { seed: 5, width: 40, height: 15, mods: [], actions: [] };

  test('a v7 save keeps its layout without special levels', () => {
    const s = fresh();
    const raw = JSON.parse(engine.save(s, replay)) as {
      version: number;
      state: { version: number; dungeons: { special?: unknown }[] };
    };
    raw.version = 7;
    raw.state.version = 7;
    for (const d of raw.state.dungeons) delete d.special;
    const loaded = engine.load(JSON.stringify(raw)).state;
    expect(loaded.version).toBe(8);
    expect(loaded.dungeons).toEqual(s.dungeons.map((d) => ({ ...d, special: [] })));
    // its Mines has no town level
    const dl = s.dungeons[1]?.special[0]?.dlevel ?? 0;
    ctl.fn = (ctx) => ctx.goToLevel({ dungeon: 'dg:mines', dlevel: dl }, 'up');
    engine.step(loaded, { type: 'mod', action: 'gt:run', args: null });
    expect(getLevel(loaded).town).toBeUndefined();
  });
});
