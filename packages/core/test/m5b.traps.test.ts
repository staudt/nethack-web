import { describe, expect, test } from 'vitest';
import { createEngine } from '../src/engine';
import { isJsonPlain } from '../src/hash';
import { createQuery } from '../src/query';
import { ModLoadError, loadMods } from '../src/registry';
import { getLevel } from '../src/state';
import { isPlainFloor, trapAt } from '../src/traps';
import { buildSnapshot, diffSnapshot } from '../src/view';
import type { Ctx, Mod, TrapDef } from '../src/types/mod';
import type { GameState } from '../src/types/state';
import { actionsMod, terrainMod } from './helpers/fakeMods';
import { heroPos } from './helpers/objectMods';

const GLYPH = { ch: '^', fg: '#f0f' };

/** Mod 'tt': two traps and a 'tt:run' action that runs `ctl.fn` with a real Ctx. */
const ctl: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const ttMod: Mod = {
  id: 'tt',
  version: '1.0.0',
  register(api) {
    api.defineTrap({ id: 'tt:bear', nameKey: 'trap.bear', glyph: GLYPH });
    api.defineTrap({ id: 'tt:door', nameKey: 'trap.door', glyph: GLYPH, hole: true });
    api.defineAction({
      id: 'tt:run',
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
const engine = createEngine([terrainMod(), actionsMod(), ttMod]);
const fresh = (seed = 5): GameState => engine.newGame({ seed, width: 40, height: 15 }).state;
const RUN = { type: 'mod', action: 'tt:run', args: null } as const;
const run = (s: GameState, fn: (ctx: Ctx) => void): void => {
  ctl.fn = fn;
  engine.step(s, RUN);
  ctl.fn = () => undefined;
};

/** Cells of the current level whose terrain id passes `pred`, in index order. */
function cellsWhere(s: GameState, pred: (id: string) => boolean): { x: number; y: number }[] {
  const level = getLevel(s);
  const out: { x: number; y: number }[] = [];
  for (let y = 0; y < level.height; y++)
    for (let x = 0; x < level.width; x++)
      if (pred(level.palette[level.cells[y * level.width + x] ?? 0] ?? '')) out.push({ x, y });
  return out;
}
const floors = (s: GameState) => cellsWhere(s, (id) => id === 'nh:floor');

describe('TrapDef registration', () => {
  test('traps are registered in order and looked up by id', () => {
    expect(engine.registry.traps.map((t) => t.id)).toEqual(['tt:bear', 'tt:door']);
    expect(engine.registry.trap('tt:door').hole).toBe(true);
    expect(engine.registry.isTrap('tt:bear')).toBe(true);
    expect(engine.registry.isTrap('tt:nope')).toBe(false);
    expect(() => engine.registry.trap('tt:nope')).toThrow(/Unknown trap/);
  });

  test('bad trap defs are reported', () => {
    const bad = (d: Partial<TrapDef>): Mod => ({
      id: 'bt',
      version: '1',
      register: (api) =>
        api.defineTrap({ id: 'bt:x', nameKey: 'k', glyph: GLYPH, ...d } as TrapDef),
    });
    const paths = (d: Partial<TrapDef>): string[] => {
      try {
        loadMods([bad(d)]);
        return [];
      } catch (e) {
        return (e as ModLoadError).issues.map((i) => i.path);
      }
    };
    expect(paths({})).toEqual([]);
    expect(paths({ glyph: { ch: '^^', fg: '#fff' } })).toEqual(['glyph.ch']);
    expect(paths({ nameKey: '' })).toEqual(['nameKey']);
    expect(paths({ hole: 'yes' as unknown as boolean })).toEqual(['hole']);
    expect(() => loadMods([bad({ id: 'zz:x' })])).toThrow(ModLoadError);
  });
});

describe('placing and removing traps', () => {
  test('placeTrap keeps traps sorted by cell index and replaces a trap on the same cell', () => {
    const s = fresh();
    const [a, b] = floors(s).slice(-2) as [{ x: number; y: number }, { x: number; y: number }];
    run(s, (ctx) => {
      ctx.placeTrap(s.currentLevel, { def: 'tt:bear', x: b.x, y: b.y, seen: false });
      ctx.placeTrap(s.currentLevel, { def: 'tt:bear', x: a.x, y: a.y, seen: false });
      ctx.placeTrap(s.currentLevel, { def: 'tt:door', x: b.x, y: b.y, seen: true });
    });
    expect(getLevel(s).traps).toEqual([
      { def: 'tt:bear', x: a.x, y: a.y, seen: false },
      { def: 'tt:door', x: b.x, y: b.y, seen: true },
    ]);
    expect(trapAt(getLevel(s), b.x, b.y)?.def).toBe('tt:door');
    run(s, (ctx) => ctx.removeTrap(s.currentLevel, a));
    expect(getLevel(s).traps.map((t) => t.def)).toEqual(['tt:door']);
    expect(isJsonPlain(s)).toBe(true);
  });

  test('traps go on plain floor only, and must be registered', () => {
    const s = fresh();
    const level = getLevel(s);
    const reg = engine.registry;
    const wall = cellsWhere(s, (id) => id === 'nh:hwall')[0]!;
    const stairs = level.up!;
    const corr = cellsWhere(s, (id) => id === 'nh:corr')[0]!;
    const door = cellsWhere(
      s,
      (id) => reg.terrain(id as `${string}:${string}`).door !== undefined,
    )[0]!;
    expect(isPlainFloor(reg, level, corr.x, corr.y)).toBe(true);
    expect(isPlainFloor(reg, level, -1, 0)).toBe(false);
    for (const p of [wall, stairs, door])
      expect(() =>
        run(s, (ctx) => ctx.placeTrap(level.id, { def: 'tt:bear', x: p.x, y: p.y, seen: false })),
      ).toThrow(/not plain floor/);
    const f = floors(s)[0]!;
    expect(() =>
      run(s, (ctx) => ctx.placeTrap(level.id, { def: 'tt:nope', x: f.x, y: f.y, seen: false })),
    ).toThrow(/Unknown trap/);
    expect(level.traps).toEqual([]);
  });

  test('offer() cannot place or remove traps', () => {
    const s = fresh();
    const probe = loadMods([
      terrainMod(),
      {
        id: 'pq',
        version: '1',
        register: (api) =>
          api.defineAction({
            id: 'pq:a',
            labelKey: 'x',
            handles: 'mod',
            offer: (ctx) => {
              ctx.removeTrap(s.currentLevel, { x: 0, y: 0 });
              return [];
            },
            perform: () => 0,
          }),
      },
    ]);
    expect(() => createQuery(probe, s).actionsFor({ kind: 'self' })).toThrow(/offer\(\) must not/);
  });
});

describe('player knowledge of traps', () => {
  test('query.trapAt and describe() report only seen traps', () => {
    const s = fresh();
    const p = heroPos(s);
    const f = floors(s).find((c) => c.x !== p.x || c.y !== p.y)!;
    run(s, (ctx) => ctx.placeTrap(s.currentLevel, { def: 'tt:bear', x: f.x, y: f.y, seen: false }));
    const q = () => createQuery(engine.registry, s);
    expect(q().trapAt(s.currentLevel, f)).toBeNull();
    expect(q().describe(f).trap).toBeNull();
    getLevel(s).traps[0]!.seen = true;
    expect(q().trapAt(s.currentLevel, f)).toMatchObject({ def: 'tt:bear', x: f.x, y: f.y });
    expect(q().describe(f).trap).toBe('tt:bear');
    expect(q().trapAt('nowhere', f)).toBeNull();
  });

  test('the view shows seen traps (with a legend glyph) and sends them in deltas', () => {
    const s = fresh();
    const f = floors(s)[0]!;
    const i = f.y * getLevel(s).width + f.x;
    run(s, (ctx) => ctx.placeTrap(s.currentLevel, { def: 'tt:bear', x: f.x, y: f.y, seen: false }));
    const before = buildSnapshot(engine.registry, s);
    expect(before.legend['tt:bear']).toEqual(GLYPH);
    expect(before.cells[i]?.t).toBeUndefined();
    getLevel(s).traps[0]!.seen = true;
    const after = buildSnapshot(engine.registry, s);
    expect(after.cells[i]?.t).toBe('tt:bear');
    const d = diffSnapshot(before, after);
    expect(d.kind === 'delta' && d.cells.find(([j]) => j === i)?.[1].t).toBe('tt:bear');
  });
});

describe("goToLevel 'random'", () => {
  test.each([1, 2, 3, 4, 5, 6])('seed %i: lands on a room floor cell without a trap', (seed) => {
    const s = fresh(seed);
    run(s, (ctx) => ctx.goToLevel({ dungeon: 'core:dungeon', dlevel: 2 }, 'random'));
    expect(s.currentLevel).toBe('dlvl2');
    const p = heroPos(s);
    const level = getLevel(s);
    expect(level.palette[level.cells[p.y * level.width + p.x] ?? 0]).toBe('nh:floor');
    expect(trapAt(level, p.x, p.y)).toBeUndefined();
  });

  test('never lands on a trap, even when every other floor cell is trapped', () => {
    const s = fresh();
    run(s, (ctx) => ctx.goToLevel({ dungeon: 'core:dungeon', dlevel: 2 }, 'up'));
    run(s, (ctx) => ctx.goToLevel({ dungeon: 'core:dungeon', dlevel: 1 }, 'down'));
    const level2 = s.levels['dlvl2']!;
    s.currentLevel = 'dlvl2';
    const all = floors(s);
    s.currentLevel = 'dlvl1';
    const free = all[Math.floor(all.length / 2)]!;
    run(s, (ctx) => {
      for (const c of all)
        if (c.x !== free.x || c.y !== free.y)
          ctx.placeTrap('dlvl2', { def: 'tt:bear', x: c.x, y: c.y, seen: false });
    });
    expect(level2.traps).toHaveLength(all.length - 1);
    run(s, (ctx) => ctx.goToLevel({ dungeon: 'core:dungeon', dlevel: 2 }, 'random'));
    expect(heroPos(s)).toEqual(free);
  });
});

describe('save v7', () => {
  const replay = { seed: 5, width: 40, height: 15, mods: [], actions: [] };

  test('traps survive a round trip', () => {
    const s = fresh();
    const f = floors(s)[0]!;
    run(s, (ctx) =>
      ctx.placeTrap(s.currentLevel, {
        def: 'tt:door',
        x: f.x,
        y: f.y,
        seen: true,
        once: true,
        data: { n: 1 },
      }),
    );
    expect(engine.load(engine.save(s, replay)).state).toEqual(s);
  });

  test.each([3, 4, 5])('a v%i save migrates to v8 with empty trap lists', (old) => {
    const s = fresh();
    run(s, (ctx) => ctx.goToLevel({ dungeon: 'core:dungeon', dlevel: 2 }, 'up'));
    const raw = JSON.parse(engine.save(s, replay)) as {
      version: number;
      state: { version: number; levels: Record<string, { traps?: unknown }> };
    };
    raw.version = old;
    raw.state.version = old;
    for (const l of Object.values(raw.state.levels)) delete l.traps;
    const loaded = engine.load(JSON.stringify(raw)).state;
    expect(loaded.version).toBe(8);
    expect(Object.keys(loaded.levels).sort()).toEqual(['dlvl1', 'dlvl2']);
    for (const id of ['dlvl1', 'dlvl2']) expect(loaded.levels[id]?.traps).toEqual([]);
  });
});
