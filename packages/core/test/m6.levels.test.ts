// Milestone 6a step 3: LevelDef (defineLevel), its validation, DungeonDef.filler and buildLevel.
import { describe, expect, test } from 'vitest';
import { createEngine } from '../src/engine';
import { buildLevel, VANILLA_TERRAIN } from '../src/levelgen/index';
import { ModLoadError, loadMods } from '../src/registry';
import { createRng, seedRng } from '../src/rng';
import { getLevel, playerPos } from '../src/state';
import type { Level } from '../src/types/level';
import type { Ctx, DungeonDef, LevelDef, Mod, MonsterDef } from '../src/types/mod';
import { actionsMod, terrainMod } from './helpers/fakeMods';

const gnome: MonsterDef = {
  id: 'lv:gnome',
  nameKey: 'mon.gnome',
  glyph: { ch: 'G', fg: '#a52' },
  level: 1,
  speed: 6,
  ac: 10,
  mr: 4,
  alignment: 0,
  attacks: [],
  size: 'small',
  flags: [],
  frequency: 1,
  group: null,
  genFlags: [],
  difficulty: 3,
  resists: [],
  conveys: [],
  weight: 650,
  nutrition: 100,
  brain: 'lv:idle',
};

const CAVE: LevelDef = { id: 'lv:cave', init: { style: 'solidfill', fg: 'nh:floor', lit: true } };

/** Mod 'lv': a gnome, the given levels and dungeons. */
const levelMod = (levels: LevelDef[], dungeons: DungeonDef[] = []): Mod => ({
  id: 'lv',
  version: '1',
  register(api) {
    api.defineBrain({ id: 'lv:idle', act: () => undefined });
    api.defineMonster(gnome);
    levels.forEach((l) => api.defineLevel(l));
    dungeons.forEach((d) => api.defineDungeon(d));
  },
});

/** The `defId path: reason` of each issue loading `levels` reports. */
function issues(levels: LevelDef[], dungeons: DungeonDef[] = []): string[] {
  try {
    loadMods([terrainMod(), levelMod(levels, dungeons)]);
    return [];
  } catch (e) {
    if (!(e instanceof ModLoadError)) throw e;
    return e.issues.map((i) => `${i.defId ?? ''} ${i.path}: ${i.reason}`);
  }
}

describe('defineLevel validation', () => {
  test('a valid level loads and is listed', () => {
    const lv: LevelDef = {
      id: 'lv:full',
      init: { style: 'rooms' },
      contents: [
        { kind: 'monster', id: 'lv:gnome', count: { min: 6, max: 8 } },
        { kind: 'monster', class: 'G', percent: 50 },
        { kind: 'object', class: 'gem', count: 3 },
        { kind: 'object' },
        { kind: 'trap', count: 0 },
      ],
    };
    const reg = loadMods([terrainMod(), levelMod([lv, CAVE])]);
    expect(reg.levels.map((l) => l.id)).toEqual(['lv:full', 'lv:cave']);
    expect(reg.level('lv:cave')).toMatchObject(CAVE);
    expect(() => reg.level('lv:none')).toThrow(/Unknown level/);
  });

  test('bad shapes are reported with their paths', () => {
    const bad = {
      id: 'lv:bad',
      init: { style: 'maze' },
      contents: [
        { kind: 'statue' },
        { kind: 'monster', id: 'lv:gnome', class: 'G' },
        { kind: 'trap', class: '^' },
        { kind: 'object', class: 'boulders' },
        { kind: 'monster', class: 'GG' },
        { kind: 'object', count: { min: 3, max: 2 } },
        { kind: 'object', count: -1 },
        { kind: 'object', percent: 101 },
      ],
    } as unknown as LevelDef;
    expect(issues([bad])).toEqual([
      "lv:bad init.style: must be 'rooms', 'solidfill' or 'mines'",
      'lv:bad contents[0].kind: must be one of monster, object, trap',
      'lv:bad contents[1].class: give either id or class, not both',
      'lv:bad contents[2].class: traps have no classes',
      expect.stringMatching(/^lv:bad contents\[3\]\.class: must be one of weapon, /),
      'lv:bad contents[4].class: must be one monster glyph character',
      'lv:bad contents[5].count: must be an integer >= 0 or { min, max } with 0 <= min <= max',
      'lv:bad contents[6].count: must be an integer >= 0 or { min, max } with 0 <= min <= max',
      'lv:bad contents[7].percent: must be an integer 0..100',
    ]);
    expect(issues([{ id: 'lv:x', init: { style: 'solidfill' } } as unknown as LevelDef])).toEqual([
      'lv:x init.fg: must be a terrain id',
    ]);
  });

  test('references to unknown defs are reported', () => {
    const lv: LevelDef = {
      id: 'lv:refs',
      init: { style: 'solidfill', fg: 'nh:lava' },
      contents: [
        { kind: 'monster', id: 'lv:dwarf' },
        { kind: 'monster', class: 'h' },
        { kind: 'object', id: 'lv:gem' },
        { kind: 'trap', id: 'lv:pit' },
      ],
    };
    expect(issues([lv], [{ id: 'lv:main', nameKey: 'main', filler: 'lv:nope' }])).toEqual([
      "lv:main filler: unknown level 'lv:nope'",
      "lv:refs init.fg: unknown terrain 'nh:lava'",
      "lv:refs contents[0].id: unknown monster 'lv:dwarf'",
      "lv:refs contents[1].class: no monster has glyph 'h'",
      "lv:refs contents[2].id: unknown object 'lv:gem'",
      "lv:refs contents[3].id: unknown trap 'lv:pit'",
    ]);
  });

  test('appearAs names a registered def of its kind, on monsters only', () => {
    const lv: LevelDef = {
      id: 'lv:ap',
      init: { style: 'solidfill', fg: 'nh:floor' },
      contents: [
        { kind: 'monster', id: 'lv:gnome', appearAs: { kind: 'furniture', id: 'nh:floor' } },
        { kind: 'monster', id: 'lv:gnome', appearAs: { kind: 'monster', id: 'lv:gnome' } },
        { kind: 'monster', id: 'lv:gnome', appearAs: { kind: 'object', id: 'lv:boulder' } },
        { kind: 'monster', id: 'lv:gnome', appearAs: { kind: 'furniture', id: 'lv:grave' } },
        { kind: 'object', class: 'gem', appearAs: { kind: 'monster', id: 'lv:gnome' } },
      ],
    };
    expect(issues([lv])).toEqual([
      'lv:ap contents[2].appearAs: bad appearAs {"kind":"object","id":"lv:boulder"}',
      'lv:ap contents[3].appearAs: bad appearAs {"kind":"furniture","id":"lv:grave"}',
      'lv:ap contents[4].appearAs: bad appearAs {"kind":"monster","id":"lv:gnome"}',
    ]);
  });
});

describe('buildLevel', () => {
  const opts = { id: 'x', depth: 3, width: 12, height: 6, terrain: VANILLA_TERRAIN };
  const at = (l: Level, p: { x: number; y: number } | null): string | undefined =>
    p ? l.palette[l.cells[p.y * l.width + p.x] ?? -1] : undefined;

  test('solidfill fills the map and puts the stairs asked for on distinct cells', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const rng = createRng(seedRng(seed));
      const branch = { to: { dungeon: 'lv:other' as const, dlevel: 1 }, dir: 'down' as const };
      const l = buildLevel(rng, { ...opts, branch }, CAVE);
      expect(l.def).toBe('lv:cave');
      expect(l.rooms).toEqual([]);
      expect(l.lit.every((v) => v === 1)).toBe(true);
      expect(at(l, l.up)).toBe('nh:stairs_up');
      expect(at(l, l.down)).toBe('nh:stairs_down');
      expect(at(l, l.branch?.pos ?? null)).toBe('nh:stairs_down');
      expect(l.branch?.to).toEqual(branch.to);
      const stairs = l.cells.filter((c) => l.palette[c] !== 'nh:floor');
      expect(stairs).toHaveLength(3);
    }
  });

  test('stairs only where the dungeon wants them; lit is random when omitted', () => {
    const lits = new Set<number>();
    for (let seed = 1; seed <= 20; seed++) {
      const def: LevelDef = { id: 'lv:c', init: { style: 'solidfill', fg: 'nh:floor' } };
      const l = buildLevel(createRng(seedRng(seed)), { ...opts, down: false }, def);
      expect(l.down).toBeNull();
      expect(l.up).not.toBeNull();
      lits.add(l.lit[0] ?? -1);
    }
    expect([...lits].sort()).toEqual([0, 1]);
  });

  test('a fill terrain outside the vanilla palette is added to it', () => {
    const def: LevelDef = { id: 'lv:c', init: { style: 'solidfill', fg: 'lv:moss' } };
    const l = buildLevel(createRng(seedRng(1)), { ...opts, up: false, down: false }, def);
    expect(l.palette.at(-1)).toBe('lv:moss');
    expect(l.cells.every((c) => c === l.palette.length - 1)).toBe(true);
    // no floor at all: stairs have nowhere to go
    expect(() => buildLevel(createRng(seedRng(1)), opts, def)).toThrow(/no spot for stairs/);
  });

  test('rooms style is the ordinary generator, tagged with the def', () => {
    const def: LevelDef = { id: 'lv:r', init: { style: 'rooms' } };
    const l = buildLevel(createRng(seedRng(4)), { ...opts, width: 40, height: 15 }, def);
    expect(l.def).toBe('lv:r');
    expect(l.rooms.length).toBeGreaterThan(0);
  });
});

describe('DungeonDef.filler', () => {
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
  const seen: string[] = [];
  const engine = createEngine([
    terrainMod(),
    actionsMod((api) => api.on('newLevel', (_ctx, level) => void seen.push(level.def ?? '-'))),
    runMod,
    levelMod(
      [CAVE],
      [
        { id: 'lv:main', nameKey: 'main' },
        {
          id: 'lv:caves',
          nameKey: 'caves',
          levels: { base: 2 },
          entry: { from: 'lv:main', base: 1 },
          filler: 'lv:cave',
        },
      ],
    ),
  ]);

  test('levels of a dungeon with a filler are built from it', () => {
    seen.length = 0;
    const { state } = engine.newGame({ seed: 3, width: 30, height: 12 });
    expect(getLevel(state).def).toBeUndefined();
    ctl.fn = (ctx) => ctx.goToLevel({ dungeon: 'lv:caves', dlevel: 2 }, 'up');
    engine.step(state, { type: 'mod', action: 'gt:run', args: null });
    const l = getLevel(state);
    expect(l.id).toBe('lv:caves/2');
    expect(l.def).toBe('lv:cave');
    expect(l.down).toBeNull(); // the last level
    expect(playerPos(state)).toMatchObject(l.up ?? {});
    expect(seen).toEqual(['-', 'lv:cave']);
  });
});
