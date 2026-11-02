// Milestone 6a step 1: DungeonDef, the dungeon layout rolled at new game, goToLevel(LevelRef)
// and the v7 save format.
import { describe, expect, test } from 'vitest';
import { DEFAULT_DUNGEON, depthOf, levelIdFor, rollDungeons } from '../src/dungeon';
import { createEngine } from '../src/engine';
import { VANILLA_TERRAIN } from '../src/levelgen/index';
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

const MAIN: DungeonDef = { id: 'dg:main', nameKey: 'main' };
const MINES: DungeonDef = {
  id: 'dg:mines',
  nameKey: 'mines',
  levels: { base: 8, range: 2 },
  entry: { from: 'dg:main', base: 2, range: 3 },
};

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

  test('the root comes first, then children breadth-first in registration order', () => {
    const r = loadMods([
      dungeonMod([
        { id: 'dg:c', nameKey: 'c', entry: { from: 'dg:b', base: 1 } },
        { id: 'dg:b', nameKey: 'b', entry: { from: 'dg:a', base: 1 } },
        { id: 'dg:d', nameKey: 'd', entry: { from: 'dg:a', base: 2 } },
        { id: 'dg:a', nameKey: 'a' },
      ]),
    ]);
    expect(r.dungeons.map((d) => d.id)).toEqual(['dg:a', 'dg:b', 'dg:d', 'dg:c']);
    expect(() => r.dungeon('dg:nope')).toThrow(/Unknown dungeon/);
  });

  test('bad dungeon defs are reported', () => {
    expect(issues([MAIN, { ...MINES, levels: { base: 0 } }])).toEqual(['dg:mines levels.base']);
    expect(issues([MAIN, { ...MINES, levels: { base: 3, range: -1 } }])).toEqual([
      'dg:mines levels.range',
    ]);
    expect(issues([MAIN, { ...MINES, entry: { from: 'dg:x', base: 1 } }])).toEqual([
      'dg:mines entry.from',
    ]);
    // two roots
    expect(issues([MAIN, { id: 'dg:mines', nameKey: 'mines' }])).toEqual(['dg:mines entry']);
    // an entry below the bottom of its parent
    expect(
      issues([
        { ...MAIN, levels: { base: 3 } },
        { ...MINES, entry: { from: 'dg:main', base: 4 } },
      ]),
    ).toEqual(['dg:mines entry.base']);
    // a loop that the root cannot reach
    expect(
      issues([
        MAIN,
        { id: 'dg:x', nameKey: 'x', entry: { from: 'dg:y', base: 1 } },
        { id: 'dg:y', nameKey: 'y', entry: { from: 'dg:x', base: 1 } },
      ]),
    ).toEqual(['dg:x entry.from', 'dg:y entry.from']);
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
      { id: 'dg:main', nameKey: 'm', levels: { base: 10 } },
      { id: 'dg:a', nameKey: 'a', entry: { from: 'dg:main', base: 3, range: 2 } },
      { id: 'dg:b', nameKey: 'b', entry: { from: 'dg:main', base: 3, range: 2 } },
    ];
    for (let seed = 1; seed <= 50; seed++) {
      const [main] = rollDungeons(createRng(seedRng(seed)), defs);
      expect(main?.branches.map((b) => b.dlevel).sort()).toEqual([3, 4]);
    }
  });

  test('a branch range is cut at the bottom of its dungeon', () => {
    const defs: DungeonDef[] = [
      { id: 'dg:main', nameKey: 'm', levels: { base: 5 } },
      { id: 'dg:a', nameKey: 'a', entry: { from: 'dg:main', base: 4, range: 9 } },
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
        levels: Record<string, { dungeon?: unknown; dlevel?: unknown; branch?: unknown }>;
      };
    };
    raw.version = 6;
    raw.state.version = 6;
    delete raw.state.dungeons;
    for (const l of Object.values(raw.state.levels)) {
      delete l.dungeon;
      delete l.dlevel;
      delete l.branch;
    }
    const loaded = engine.load(JSON.stringify(raw)).state;
    expect(loaded.version).toBe(7);
    expect(loaded.dungeons).toEqual([{ id: 'dg:main', depthStart: 1, levels: null, branches: [] }]);
    expect(loaded.levels['dlvl2']).toMatchObject({ dungeon: 'dg:main', dlevel: 2, depth: 2 });
    for (const id of ['dlvl1', 'dlvl2'])
      expect(loaded.levels[id]).toEqual({ ...s.levels[id], branch: null });
  });
});

describe('branch stairs', () => {
  const terrainAt = (s: GameState, p: { x: number; y: number }): string => {
    const l = getLevel(s);
    return l.palette[l.cells[p.y * l.width + p.x] ?? -1] ?? '';
  };
  const roomOf = (s: GameState, p: { x: number; y: number }) =>
    getLevel(s).rooms.findIndex((r) => p.x >= r.lx && p.x <= r.hx && p.y >= r.ly && p.y <= r.hy);

  test('the branch level has stairs down into the branch, in a room without other stairs', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = fresh(seed);
      const b = s.dungeons[0]!.branches[0]!;
      run(s, (ctx) => ctx.goToLevel({ dungeon: 'dg:main', dlevel: b.dlevel }, 'branch'));
      const level = getLevel(s);
      expect(level.branch).toMatchObject({ to: { dungeon: 'dg:mines', dlevel: 1 }, dir: 'down' });
      const pos = level.branch!.pos;
      expect(playerPos(s)).toEqual(pos);
      expect(terrainAt(s, pos)).toBe(VANILLA_TERRAIN.stairs_down);
      expect(level.up).not.toBeNull();
      expect(level.down).not.toBeNull();
      if (level.rooms.length >= 3)
        for (const p of [level.up!, level.down!]) expect(roomOf(s, p)).not.toBe(roomOf(s, pos));
      else for (const p of [level.up!, level.down!]) expect(p).not.toEqual(pos);
    }
  });

  test("the branch's top level has no up stairs; its branch stairs lead back up", () => {
    const s = fresh();
    const b = s.dungeons[0]!.branches[0]!;
    run(s, (ctx) => ctx.goToLevel({ dungeon: 'dg:mines', dlevel: 1 }, 'branch'));
    const level = getLevel(s);
    expect(level.up).toBeNull();
    expect(level.down).not.toBeNull();
    expect(level.branch).toMatchObject({ to: { dungeon: 'dg:main', dlevel: b.dlevel }, dir: 'up' });
    expect(terrainAt(s, level.branch!.pos)).toBe(VANILLA_TERRAIN.stairs_up);
    expect(playerPos(s)).toEqual(level.branch!.pos);
  });

  test('the last level of a dungeon has no down stairs; other levels have no branch', () => {
    const s = fresh();
    const mines = s.dungeons[1]!;
    run(s, (ctx) => ctx.goToLevel({ dungeon: 'dg:mines', dlevel: mines.levels! }, 'up'));
    expect(getLevel(s)).toMatchObject({ down: null, branch: null });
    expect(getLevel(s).up).not.toBeNull();
    const notBranch = mines.depthStart - 1 === 2 ? 3 : 2;
    run(s, (ctx) => ctx.goToLevel({ dungeon: 'dg:main', dlevel: notBranch }, 'up'));
    expect(getLevel(s).branch).toBeNull();
    expect(s.levels['dlvl1']?.branch).toBeNull();
  });
});
