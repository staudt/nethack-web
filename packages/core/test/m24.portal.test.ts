// Milestone 24 step 3: the portal branch type (dungeon.lua branchtype "portal", BR_PORTAL), the
// role-dependent special levels and fillers (the quest's "x-strt" and "%s-fila"/"%s-filb"), and
// goToLevel(to, { trap }) arriving on the made level's portal.
import { describe, expect, test } from 'vitest';
import { depthOf, levelStairs, rollDungeons } from '../src/dungeon';
import { createEngine } from '../src/engine';
import { ModLoadError, loadMods } from '../src/registry';
import { createRng, seedRng } from '../src/rng';
import { getLevel, playerPos } from '../src/state';
import type { DefId } from '../src/types/common';
import type { Ctx, DungeonDef, LevelDef, Mod, SpecialLevelDef } from '../src/types/mod';
import type { GameState } from '../src/types/state';
import { actionsMod, terrainMod } from './helpers/fakeMods';

const plain = (id: DefId): LevelDef => ({
  id,
  init: { style: 'solidfill', fg: 'nh:floor', lit: true },
});
const LEVELS = (
  ['qt:orc-a', 'qt:start', 'qt:mid', 'qt:goal', 'qt:standin', 'qt:fa', 'qt:fb'] as DefId[]
).map((id) => plain(id));
const ORC: SpecialLevelDef = {
  id: 'qt:orc',
  nameKey: 'orc',
  base: 5,
  range: 5,
  variants: ['qt:orc-a'],
};
const MAIN: DungeonDef = { id: 'qt:main', nameKey: 'main', special: [ORC] };
/** dungeon.lua "The Quest": 5-6 levels, its portal 6-7 below the chain level. */
const QUEST: DungeonDef = {
  id: 'qt:quest',
  nameKey: 'quest',
  levels: { base: 5, range: 2 },
  entry: { from: 'qt:main', chain: 'qt:orc', base: 6, range: 2, stairs: 'portal' },
  special: [
    {
      id: 'qt:qstart',
      nameKey: 'start',
      base: 1,
      variants: ['qt:standin'],
      roleVariants: { 'nh:hero': ['qt:start'] },
    },
    { id: 'qt:qlocate', nameKey: 'mid', base: 3, variants: ['qt:standin'] },
    {
      id: 'qt:qgoal',
      nameKey: 'goal',
      base: -1,
      variants: ['qt:standin'],
      roleVariants: { 'nh:hero': ['qt:goal'] },
    },
  ],
  roleFiller: { split: 'qt:qlocate', byRole: { 'nh:hero': ['qt:fa', 'qt:fb'] } },
};

const ROLES: { id: DefId; speed: number }[] = [
  { id: 'nh:hero', speed: 12 },
  { id: 'nh:other', speed: 12 },
];
const dungeonMod = (defs: DungeonDef[], levels: LevelDef[] = LEVELS): Mod => ({
  id: 'qt',
  version: '1',
  register(api) {
    levels.forEach((l) => api.defineLevel(l));
    defs.forEach((d) => api.defineDungeon(d));
    api.defineTrap({ id: 'qt:portal', nameKey: 'portal', glyph: { ch: '^', fg: '#f0f' } });
    // the portal on the quest's first level, at a spot only known once it is made
    api.on('newLevel', (ctx, level) => {
      if (level.dungeon === 'qt:quest' && level.dlevel === 1)
        ctx.placeTrap(level.id, { def: 'qt:portal', x: 7, y: 4, seen: false });
    });
  },
});

function issues(defs: DungeonDef[], levels: LevelDef[] = LEVELS): string[] {
  try {
    loadMods([terrainMod(ROLES), dungeonMod(defs, levels)]);
    return [];
  } catch (e) {
    if (!(e instanceof ModLoadError)) throw e;
    return e.issues.map((i) => `${i.defId ?? ''} ${i.path} ${i.reason}`);
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
const engine = createEngine([terrainMod(ROLES), actionsMod(), runMod, dungeonMod([MAIN, QUEST])]);
const fresh = (seed = 5, role: DefId = 'nh:hero'): GameState =>
  engine.newGame({ seed, width: 40, height: 15, character: { role } }).state;
const run = (s: GameState, fn: (ctx: Ctx) => void): void => {
  ctl.fn = fn;
  engine.step(s, { type: 'mod', action: 'gt:run', args: null });
  ctl.fn = () => undefined;
};

describe('a portal branch', () => {
  test('rolled 6-7 below its chain level at the same depth, over 200 seeds', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const [main, quest] = rollDungeons(createRng(seedRng(seed)), [MAIN, QUEST]);
      const orc = main?.special.find((s) => s.id === 'qt:orc');
      const b = main?.branches.find((x) => x.to === 'qt:quest');
      expect(b?.stairs).toBe('portal');
      expect([6, 7].map((d) => d + (orc?.dlevel ?? 0))).toContain(b?.dlevel);
      expect([5, 6]).toContain(quest?.levels);
      // init_dungeon_set_depth(): "portals stay on the same depth"
      expect(quest?.depthStart).toBe((main?.depthStart ?? 0) + (b?.dlevel ?? 0) - 1);
      expect(quest?.special.map((x) => x.dlevel)).toEqual([1, 3, quest?.levels]);
    }
  });

  test('no branch stairs at either end; no up stairs on the first level', () => {
    const s = fresh();
    const b = s.dungeons[0]!.branches.find((x) => x.to === 'qt:quest')!;
    expect(levelStairs(s, { dungeon: 'qt:main', dlevel: b.dlevel })).toEqual({
      up: true,
      down: true,
    });
    expect(levelStairs(s, { dungeon: 'qt:quest', dlevel: 1 })).toEqual({ up: false, down: true });
    expect(depthOf(s, { dungeon: 'qt:quest', dlevel: 1 })).toBe(b.dlevel);
  });

  test("goToLevel(..., { trap }) arrives on the made level's trap, else at random", () => {
    const s = fresh();
    run(s, (ctx) => ctx.goToLevel({ dungeon: 'qt:quest', dlevel: 1 }, { trap: 'qt:portal' }));
    expect(getLevel(s).id).toBe('qt:quest/1');
    expect(playerPos(s)).toEqual({ x: 7, y: 4 });
    // 'branch' on a portal branch's end: its teleport region (here the whole level)
    run(s, (ctx) => ctx.goToLevel({ dungeon: 'qt:quest', dlevel: 2 }, { trap: 'qt:portal' }));
    expect(getLevel(s).id).toBe('qt:quest/2');
    expect(getLevel(s).traps).toEqual([]);
    run(s, (ctx) => ctx.goToLevel({ dungeon: 'qt:quest', dlevel: 1 }, { trap: 'qt:portal' }));
    expect(playerPos(s)).toEqual({ x: 7, y: 4 });
  });
});

describe('levels by role', () => {
  const visit = (role: DefId): (string | undefined)[] => {
    const s = fresh(3, role);
    const n = s.dungeons.find((d) => d.id === 'qt:quest')!.levels!;
    const out: (string | undefined)[] = [];
    for (let dl = 1; dl <= n; dl++) {
      run(s, (ctx) => ctx.goToLevel({ dungeon: 'qt:quest', dlevel: dl }, 'random'));
      out.push(getLevel(s).def);
    }
    return out;
  };

  test("the hero's role picks the special level and the filler above and below the split", () => {
    const got = visit('nh:hero');
    expect(got.slice(0, 4)).toEqual(['qt:start', 'qt:fa', 'qt:standin', 'qt:fb']);
    expect(got.at(-1)).toBe('qt:goal');
    if (got.length === 6) expect(got[4]).toBe('qt:fb');
  });

  test('a role without an entry uses the variants and the ordinary levels', () => {
    const got = visit('nh:other');
    expect(got[0]).toBe('qt:standin');
    expect(got[1]).toBeUndefined(); // the rooms-and-corridors generator
    expect(got[2]).toBe('qt:standin');
    expect(got.at(-1)).toBe('qt:standin');
  });
});

describe('validation', () => {
  test('the portal type, role variants and the role filler are checked', () => {
    expect(issues([MAIN, QUEST])).toEqual([]);
    const bad: DungeonDef = {
      ...QUEST,
      special: [
        {
          id: 'qt:qstart',
          nameKey: 'start',
          base: 1,
          variants: ['qt:standin'],
          roleVariants: { 'nh:nobody': ['qt:start'], 'nh:hero': [], 'nh:other': ['qt:none'] },
        },
      ],
      roleFiller: { split: 'qt:qmissing', byRole: { 'nh:hero': ['qt:fa', 'qt:gone'] } },
    };
    expect(issues([MAIN, bad])).toEqual(
      expect.arrayContaining([
        'qt:quest special[0].roleVariants.nh:hero must be a non-empty array of LevelDef ids',
        "qt:quest roleFiller.split 'qt:qmissing' is not a special level",
        "qt:quest special[0].roleVariants.nh:nobody unknown role 'nh:nobody'",
        "qt:quest special[0].roleVariants.nh:other[0] unknown level 'qt:none'",
        "qt:quest roleFiller.byRole.nh:hero[1] unknown level 'qt:gone'",
      ]),
    );
    const wrong = { ...QUEST, entry: { ...QUEST.entry!, stairs: 'none' } } as unknown as DungeonDef;
    expect(issues([MAIN, wrong])).toEqual([
      "qt:quest entry.stairs must be 'both', 'child' or 'portal'",
    ]);
  });
});
