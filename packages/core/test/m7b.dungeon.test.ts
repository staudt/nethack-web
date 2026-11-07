// Milestone 7b step 5: up-branches chained to a special level of the parent (dungeon.lua
// `chainlevel`, `direction = "up"`, `entry = -1`), the branch stairs spot of a LevelDef and the
// Sokoban level flag.
import { describe, expect, test } from 'vitest';
import { depthOf, levelStairs, rollDungeons } from '../src/dungeon';
import { createEngine } from '../src/engine';
import { VANILLA_TERRAIN } from '../src/levelgen/index';
import { ModLoadError, loadMods } from '../src/registry';
import { createRng, seedRng } from '../src/rng';
import { getLevel, playerPos } from '../src/state';
import type { DefId } from '../src/types/common';
import type { Ctx, DungeonDef, LevelDef, Mod, SpecialLevelDef } from '../src/types/mod';
import type { GameState } from '../src/types/state';
import { actionsMod, terrainMod } from './helpers/fakeMods';

const plain = (id: DefId, extra: Partial<LevelDef> = {}): LevelDef => ({
  id,
  init: { style: 'solidfill', fg: 'nh:floor', lit: true },
  ...extra,
});
/** Sokoban's bottom level: its branch stairs at a fixed spot, with the Sokoban flags. */
const BOTTOM = plain('dg:bottom-a', {
  stairs: { up: { x: 2, y: 2, coords: 'level' }, branch: { x: 5, y: 3, coords: 'level' } },
  flags: { sokoban: true, premapped: true },
});
const LEVELS = [plain('dg:orc-a'), BOTTOM];
const ORC: SpecialLevelDef = {
  id: 'dg:orc',
  nameKey: 'orc',
  base: 5,
  range: 5,
  variants: ['dg:orc-a'],
};
const MAIN: DungeonDef = { id: 'dg:main', nameKey: 'main', special: [ORC] };
const MINES: DungeonDef = {
  id: 'dg:mines',
  nameKey: 'mines',
  levels: { base: 8, range: 2 },
  entry: { from: 'dg:main', base: 2, range: 3 },
};
/** dungeon.lua Sokoban: four levels, entered at the bottom by stairs up from below the Oracle. */
const SOKO: DungeonDef = {
  id: 'dg:soko',
  nameKey: 'soko',
  levels: { base: 4 },
  entryLevel: -1,
  entry: { from: 'dg:main', chain: 'dg:orc', base: 1, dir: 'up' },
  special: [{ id: 'dg:bottom', nameKey: 'bottom', base: 4, variants: ['dg:bottom-a'] }],
};

const dungeonMod = (defs: DungeonDef[], levels: LevelDef[] = LEVELS): Mod => ({
  id: 'dg',
  version: '1',
  register(api) {
    levels.forEach((l) => api.defineLevel(l));
    defs.forEach((d) => api.defineDungeon(d));
  },
});

function issues(defs: DungeonDef[], levels: LevelDef[] = LEVELS): string[] {
  try {
    loadMods([terrainMod(), dungeonMod(defs, levels)]);
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
const engine = createEngine([terrainMod(), actionsMod(), runMod, dungeonMod([MAIN, MINES, SOKO])]);
const fresh = (seed = 5): GameState => engine.newGame({ seed, width: 40, height: 15 }).state;
const run = (s: GameState, fn: (ctx: Ctx) => void): void => {
  ctl.fn = fn;
  engine.step(s, { type: 'mod', action: 'gt:run', args: null });
  ctl.fn = () => undefined;
};
const terrainAt = (s: GameState, p: { x: number; y: number }): string => {
  const l = getLevel(s);
  return l.palette[l.cells[p.y * l.width + p.x] ?? -1] ?? '';
};

describe('a chained up-branch', () => {
  test('one level below its chain level, entered at the bottom, over 200 seeds', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const [main, mines, soko] = rollDungeons(createRng(seedRng(seed)), [MAIN, MINES, SOKO]);
      const orc = main?.special.find((s) => s.id === 'dg:orc');
      expect([5, 6, 7, 8, 9]).toContain(orc?.dlevel);
      const b = main?.branches.find((x) => x.to === 'dg:soko');
      expect(b).toEqual({ to: 'dg:soko', dlevel: (orc?.dlevel ?? 0) + 1, dir: 'up' });
      // the down branch keeps no dir
      expect(main?.branches.find((x) => x.to === 'dg:mines')).not.toHaveProperty('dir');
      expect(mines).not.toHaveProperty('entry');
      expect(soko).toMatchObject({ levels: 4, entry: 4 });
      // init_dungeon_set_depth(): the branch level's depth - 1 (up) - (entry - 1); so the
      // entry level is as deep as the chain level and the top 3 above it
      const orcDepth = (main?.depthStart ?? 0) + (orc?.dlevel ?? 0) - 1;
      expect(soko?.depthStart).toBe(orcDepth - 4 + 1);
    }
  });

  test('entry levels from the top and the bottom, clamped (init_dungeon_set_entry())', () => {
    const roll = (entryLevel: number) =>
      rollDungeons(createRng(seedRng(1)), [
        MAIN,
        { ...MINES, levels: { base: 8 }, entry: { from: 'dg:main', base: 3 }, entryLevel },
      ])[1];
    expect(roll(0)).toMatchObject({ depthStart: 4 });
    expect(roll(0)).not.toHaveProperty('entry');
    // down stairs from DL3 arrive on level 2: depth 4 = depthStart + 1
    expect(roll(2)).toMatchObject({ entry: 2, depthStart: 3 });
    expect(roll(99)).toMatchObject({ entry: 8, depthStart: 4 - 7 });
    expect(roll(-1)).toMatchObject({ entry: 8 });
    expect(roll(-99)).not.toHaveProperty('entry'); // clamped to 1
  });

  test('stairs on each end: up branch stairs below the chain level, down ones back', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const s = fresh(seed);
      const [main, , soko] = s.dungeons;
      const b = main?.branches.find((x) => x.to === 'dg:soko');
      if (!main || !soko || !b) throw new Error('no layout');
      expect(levelStairs(s, { dungeon: 'dg:main', dlevel: b.dlevel })).toEqual({
        up: true,
        down: true,
        branch: { to: { dungeon: 'dg:soko', dlevel: 4 }, dir: 'up' },
      });
      // the entry (bottom) level: up stairs, no down stairs, branch stairs down back to main
      expect(levelStairs(s, { dungeon: 'dg:soko', dlevel: 4 })).toEqual({
        up: true,
        down: false,
        branch: { to: { dungeon: 'dg:main', dlevel: b.dlevel }, dir: 'down' },
      });
      // the top: no up stairs; no level but the entry has the branch
      expect(levelStairs(s, { dungeon: 'dg:soko', dlevel: 1 })).toEqual({ up: false, down: true });
      expect(levelStairs(s, { dungeon: 'dg:soko', dlevel: 2 })).toEqual({ up: true, down: true });
      expect(depthOf(s, { dungeon: 'dg:soko', dlevel: 4 })).toBe(b.dlevel - 1);
    }
  });

  test('goToLevel through both ends; the bottom has its branch spot and the Sokoban flag', () => {
    const s = fresh();
    const b = s.dungeons[0]!.branches.find((x) => x.to === 'dg:soko')!;
    run(s, (ctx) => ctx.goToLevel({ dungeon: 'dg:main', dlevel: b.dlevel }, 'up'));
    const below = getLevel(s);
    expect(below.branch).toMatchObject({ to: { dungeon: 'dg:soko', dlevel: 4 }, dir: 'up' });
    expect(terrainAt(s, below.branch!.pos)).toBe(VANILLA_TERRAIN.stairs_up);
    expect(below.up).not.toBeNull();
    expect(below.down).not.toBeNull();
    expect(below.sokoban).toBeUndefined();

    run(s, (ctx) => ctx.goToLevel(below.branch!.to, 'branch'));
    const bottom = getLevel(s);
    expect(bottom).toMatchObject({
      id: 'dg:soko/4',
      dungeon: 'dg:soko',
      dlevel: 4,
      depth: b.dlevel - 1,
    });
    expect(bottom.def).toBe('dg:bottom-a');
    expect(bottom.sokoban).toBe(true);
    expect(bottom.down).toBeNull();
    expect(bottom.up).toEqual({ x: 2, y: 2 });
    expect(bottom.branch).toEqual({
      pos: { x: 5, y: 3 },
      to: { dungeon: 'dg:main', dlevel: b.dlevel },
      dir: 'down',
    });
    expect(terrainAt(s, { x: 5, y: 3 })).toBe(VANILLA_TERRAIN.stairs_down);
    expect(playerPos(s)).toEqual({ x: 5, y: 3 });

    run(s, (ctx) => ctx.goToLevel(bottom.branch!.to, 'branch'));
    expect(getLevel(s).id).toBe(below.id);
    expect(playerPos(s)).toEqual(below.branch!.pos);

    run(s, (ctx) => ctx.goToLevel({ dungeon: 'dg:soko', dlevel: 1 }, 'down'));
    const top = getLevel(s);
    expect(top).toMatchObject({ up: null, branch: null, depth: b.dlevel - 4 });
    expect(top.down).not.toBeNull();
    expect(top.sokoban).toBeUndefined();
  });
});

describe('validation', () => {
  test('a valid chained layout loads', () => {
    expect(issues([MAIN, MINES, SOKO])).toEqual([]);
  });

  test('chain, dir and entryLevel errors', () => {
    const soko = (entry: Partial<DungeonDef['entry']>, extra: Partial<DungeonDef> = {}) => ({
      ...SOKO,
      entry: { ...SOKO.entry!, ...entry },
      ...extra,
    });
    expect(issues([MAIN, soko({ chain: 'dg:nope' })])).toEqual(['dg:soko entry.chain']);
    expect(issues([{ ...MAIN, special: [{ ...ORC, chance: 50 }] }, soko({})])).toEqual([
      'dg:soko entry.chain',
    ]);
    expect(issues([MAIN, soko({ dir: 'sideways' as 'up' })])).toEqual(['dg:soko entry.dir']);
    expect(issues([MAIN, soko({ base: 1.5 })])).toEqual(['dg:soko entry.base']);
    expect(issues([MAIN, soko({ base: -5 })])).toEqual(['dg:soko entry.base']); // above DL1
    // with a chain the base may be 0 or negative while it stays inside the parent
    expect(issues([MAIN, soko({ base: -2 })])).toEqual([]);
    expect(issues([{ ...MAIN, entryLevel: 1 }, SOKO])).toEqual(['dg:main entryLevel']);
    const endless: DungeonDef = { ...SOKO };
    delete endless.levels;
    expect(issues([MAIN, endless])).toEqual(['dg:soko entryLevel']);
    expect(issues([MAIN, soko({}, { entryLevel: 0.5 })])).toEqual(['dg:soko entryLevel']);
    // a finite parent: the chained level must fit above its bottom
    expect(issues([{ ...MAIN, levels: { base: 9 } }, soko({ base: 1 })])).toEqual([
      'dg:soko entry.base',
    ]);
  });

  test('LevelDef stairs.branch and the sokoban/premapped flags', () => {
    const bad = plain('dg:bottom-a', {
      stairs: { branch: { x: 1 } as unknown as { x: number; y: number } },
      flags: { sokoban: 'yes' as unknown as boolean, premapped: 1 as unknown as boolean },
    });
    expect(issues([MAIN, MINES, SOKO], [plain('dg:orc-a'), bad])).toEqual([
      'dg:bottom-a stairs.branch',
      'dg:bottom-a flags.sokoban',
      'dg:bottom-a flags.premapped',
    ]);
  });
});
