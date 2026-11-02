// Milestone 6a step 1: DungeonDef, the dungeon layout rolled at new game, goToLevel(LevelRef)
// and the v7 save format.
import { describe, expect, test } from 'vitest';
import { DEFAULT_DUNGEON, depthOf, levelIdFor, rollDungeons } from '../src/dungeon';
import { createEngine } from '../src/engine';
import { ModLoadError, loadMods } from '../src/registry';
import { createRng, seedRng } from '../src/rng';
import { getLevel, playerPos } from '../src/state';
import type { Ctx, DungeonDef, Mod } from '../src/types/mod';
import type { Rng } from '../src/types/rng';
import type { GameState } from '../src/types/state';
import { actionsMod, terrainMod } from './helpers/fakeMods';

const dungeonMod = (defs: DungeonDef[]): Mod => ({
  id: 'dg',
  version: '1',
  register: (api) => defs.forEach((d) => api.defineDungeon(d)),
});

const MAIN: DungeonDef = {
  id: 'dg:main',
  nameKey: 'main',
  branches: [{ to: 'dg:mines', base: 2, range: 3 }],
};
const MINES: DungeonDef = { id: 'dg:mines', nameKey: 'mines', levels: { base: 8, range: 2 } };

/** Mod 'gt': a 'gt:run' action that runs `ctl.fn` with a real Ctx. */
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
const run = (s: GameState, fn: (ctx: Ctx) => void): void => {
  ctl.fn = fn;
  engine.step(s, { type: 'mod', action: 'gt:run', args: null });
  ctl.fn = () => undefined;
};

/** The paths of the issues loading `defs` reports. */
function issues(defs: DungeonDef[]): string[] {
  try {
    loadMods([dungeonMod(defs)]);
    return [];
  } catch (e) {
    if (!(e instanceof ModLoadError)) throw e;
    return e.issues.map((i) => `${i.defId ?? ''} ${i.path}`);
  }
}

/** An Rng that counts its draws. */
function counting(seed: number): Rng & { draws: number } {
  const rng = createRng(seedRng(seed));
  const out = {
    draws: 0,
    next: () => (out.draws++, rng.next()),
    rn2: (x: number) => (out.draws++, rng.rn2(x)),
    rnd: (x: number) => (out.draws++, rng.rnd(x)),
    d: (n: number, s: number) => (out.draws++, rng.d(n, s)),
  };
  return out;
}

describe('DungeonDef registration', () => {
  test('without a DungeonDef there is one endless default dungeon', () => {
    const r = loadMods([terrainMod()]);
    expect(r.dungeons).toEqual([DEFAULT_DUNGEON]);
    expect(r.dungeon('core:dungeon')).toBe(DEFAULT_DUNGEON);
  });

  test('the root comes first, then branches breadth-first', () => {
    const r = loadMods([
      dungeonMod([
        { id: 'dg:c', nameKey: 'c' },
        { id: 'dg:b', nameKey: 'b', branches: [{ to: 'dg:c', base: 1 }] },
        { id: 'dg:a', nameKey: 'a', branches: [{ to: 'dg:b', base: 1 }] },
      ]),
    ]);
    expect(r.dungeons.map((d) => d.id)).toEqual(['dg:a', 'dg:b', 'dg:c']);
    expect(() => r.dungeon('dg:nope')).toThrow(/Unknown dungeon/);
  });

  test('bad dungeon defs are reported', () => {
    expect(issues([{ ...MINES, levels: { base: 0 } }])).toEqual(['dg:mines levels.base']);
    expect(issues([{ ...MINES, levels: { base: 3, range: -1 } }])).toEqual([
      'dg:mines levels.range',
    ]);
    expect(issues([{ ...MAIN, branches: [{ to: 'dg:x', base: 1 }] }])).toEqual([
      'dg:main branches[0].to',
    ]);
    // two roots
    expect(issues([MINES, { id: 'dg:other', nameKey: 'o' }])).toEqual(['dg:other branches']);
    // a branch below the bottom of its dungeon
    expect(
      issues([
        { ...MINES, branches: [{ to: 'dg:main', base: 9 }] },
        { ...MAIN, branches: [] },
      ]),
    ).toEqual(['dg:mines branches[0].base']);
    // a dungeon entered by two branches
    expect(
      issues([
        {
          ...MAIN,
          branches: [
            { to: 'dg:mines', base: 2 },
            { to: 'dg:mines', base: 3 },
          ],
        },
        MINES,
      ]),
    ).toEqual(['dg:main branches[1].to']);
  });
});

describe('rollDungeons', () => {
  test('nothing is drawn for fixed sizes and no branches', () => {
    const rng = counting(1);
    const layout = rollDungeons(rng, [DEFAULT_DUNGEON, { id: 'dg:x', nameKey: 'x' }]);
    expect(rng.draws).toBe(0);
    expect(layout[0]).toEqual({ id: 'core:dungeon', depthStart: 1, levels: null, branches: [] });
  });

  test('sizes and branch levels stay in their ranges', () => {
    const seen = { levels: new Set<number>(), branch: new Set<number>() };
    for (let seed = 1; seed <= 200; seed++) {
      const [main, mines] = rollDungeons(createRng(seedRng(seed)), [MAIN, MINES]);
      const b = main?.branches[0];
      expect(main?.levels).toBeNull();
      expect(b?.to).toBe('dg:mines');
      seen.branch.add(b?.dlevel ?? 0);
      seen.levels.add(mines?.levels ?? 0);
      // ref: init_dungeon_set_depth(): down stairs from the branch level, entered at the top
      expect(mines?.depthStart).toBe((b?.dlevel ?? 0) + 1);
    }
    expect([...seen.branch].sort()).toEqual([2, 3, 4]);
    expect([...seen.levels].sort()).toEqual([8, 9]);
  });

  test('a branch avoids levels that already hold one', () => {
    const defs: DungeonDef[] = [
      {
        id: 'dg:main',
        nameKey: 'm',
        levels: { base: 10 },
        branches: [
          { to: 'dg:a', base: 3, range: 2 },
          { to: 'dg:b', base: 3, range: 2 },
        ],
      },
      { id: 'dg:a', nameKey: 'a' },
      { id: 'dg:b', nameKey: 'b' },
    ];
    for (let seed = 1; seed <= 50; seed++) {
      const [main] = rollDungeons(createRng(seedRng(seed)), defs);
      expect(main?.branches.map((b) => b.dlevel).sort()).toEqual([3, 4]);
    }
  });

  test('a branch range is cut at the bottom of its dungeon', () => {
    const defs: DungeonDef[] = [
      {
        id: 'dg:main',
        nameKey: 'm',
        levels: { base: 5 },
        branches: [{ to: 'dg:a', base: 4, range: 9 }],
      },
      { id: 'dg:a', nameKey: 'a' },
    ];
    for (let seed = 1; seed <= 50; seed++) {
      const dl = rollDungeons(createRng(seedRng(seed)), defs)[0]?.branches[0]?.dlevel;
      expect([4, 5]).toContain(dl);
    }
  });
});

describe('levels in dungeons', () => {
  test('a new game rolls the layout and starts on the root dungeon top', () => {
    const s = fresh();
    expect(s.dungeons.map((d) => d.id)).toEqual(['dg:main', 'dg:mines']);
    const level = getLevel(s);
    expect(level).toMatchObject({ id: 'dlvl1', dungeon: 'dg:main', dlevel: 1, depth: 1 });
    expect(s.currentLevel).toBe('dlvl1');
  });

  test('goToLevel into a branch dungeon names and places its levels', () => {
    const s = fresh();
    const mines = s.dungeons[1]!;
    run(s, (ctx) => ctx.goToLevel({ dungeon: 'dg:mines', dlevel: 2 }, 'up'));
    const level = getLevel(s);
    expect(level).toMatchObject({
      id: 'dg:mines/2',
      dungeon: 'dg:mines',
      dlevel: 2,
      depth: mines.depthStart + 1,
    });
    expect(playerPos(s)).toEqual(level.up);
    expect(levelIdFor(s, { dungeon: 'dg:main', dlevel: 3 })).toBe('dlvl3');
    expect(depthOf(s, { dungeon: 'dg:mines', dlevel: 1 })).toBe(mines.depthStart);
  });

  test('goToLevel throws outside the layout', () => {
    const s = fresh();
    const bottom = s.dungeons[1]!.levels!;
    const go = (dungeon: string, dlevel: number) => () =>
      run(s, (ctx) => ctx.goToLevel({ dungeon: dungeon as `${string}:${string}`, dlevel }, 'up'));
    expect(go('dg:mines', bottom + 1)).toThrow(/No level/);
    expect(go('dg:mines', 0)).toThrow(/No level/);
    expect(go('dg:nope', 1)).toThrow(/Unknown dungeon/);
    run(s, (ctx) => ctx.goToLevel({ dungeon: 'dg:mines', dlevel: bottom }, 'up'));
    expect(s.currentLevel).toBe(`dg:mines/${bottom}`);
  });
});

describe('save v7', () => {
  const replay = { seed: 5, width: 40, height: 15, mods: [], actions: [] };

  test('a v6 save migrates to the root dungeon with no branches', () => {
    const s = fresh();
    run(s, (ctx) => ctx.goToLevel({ dungeon: 'dg:main', dlevel: 2 }, 'up'));
    const raw = JSON.parse(engine.save(s, replay)) as {
      version: number;
      state: {
        version: number;
        dungeons?: unknown;
        levels: Record<string, { dungeon?: unknown; dlevel?: unknown }>;
      };
    };
    raw.version = 6;
    raw.state.version = 6;
    delete raw.state.dungeons;
    for (const l of Object.values(raw.state.levels)) {
      delete l.dungeon;
      delete l.dlevel;
    }
    const loaded = engine.load(JSON.stringify(raw)).state;
    expect(loaded.version).toBe(7);
    expect(loaded.dungeons).toEqual([{ id: 'dg:main', depthStart: 1, levels: null, branches: [] }]);
    expect(loaded.levels['dlvl2']).toMatchObject({ dungeon: 'dg:main', dlevel: 2, depth: 2 });
    expect(loaded.levels).toEqual(s.levels);
  });
});
