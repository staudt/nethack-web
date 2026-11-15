// Milestone 17 step 1: chained special levels (SpecialLevelDef.chain, dungeon.lua `chainlevel`)
// and the variant draw made only for two or more variants (C's `rndlevs`).
import { describe, expect, test } from 'vitest';
import { rollDungeons } from '../src/dungeon';
import { createEngine } from '../src/engine';
import { ModLoadError, loadMods } from '../src/registry';
import { createRng, seedRng } from '../src/rng';
import { getLevel } from '../src/state';
import type { DefId } from '../src/types/common';
import type { Ctx, DungeonDef, LevelDef, Mod, SpecialLevelDef } from '../src/types/mod';
import { actionsMod, terrainMod } from './helpers/fakeMods';

const PLAIN: LevelDef = { id: 'ch:plain', init: { style: 'solidfill', fg: 'nh:floor', lit: true } };
const sp = (id: DefId, base: number, more: Partial<SpecialLevelDef> = {}): SpecialLevelDef => ({
  id,
  nameKey: id,
  base,
  variants: [PLAIN.id],
  ...more,
});
const MAIN: DungeonDef = { id: 'ch:main', nameKey: 'main', levels: { base: 20 }, filler: PLAIN.id };
const mod = (defs: DungeonDef[]): Mod => ({
  id: 'ch',
  version: '1',
  register(api) {
    api.defineLevel(PLAIN);
    defs.forEach((d) => api.defineDungeon(d));
  },
});

function issues(defs: DungeonDef[]): string[] {
  try {
    loadMods([terrainMod(), mod(defs)]);
    return [];
  } catch (e) {
    if (!(e instanceof ModLoadError)) throw e;
    return e.issues.map((i) => `${i.defId ?? ''} ${i.path}`);
  }
}

const roll = (special: SpecialLevelDef[], seed: number) =>
  rollDungeons(createRng(seedRng(seed)), [{ ...MAIN, special }])[0]?.special ?? [];

describe('chained special levels', () => {
  test("a chained level counts from wherever its chain level went (the Wizard's Tower)", () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 80; seed++) {
      const got = roll(
        [
          sp('ch:w1', 11, { range: 6 }),
          sp('ch:w2', 1, { chain: 'ch:w1' }),
          sp('ch:w3', 2, { chain: 'ch:w1' }),
        ],
        seed,
      );
      const [w1, w2, w3] = got.map((s) => s.dlevel);
      expect(w1).toBeGreaterThanOrEqual(11);
      expect(w1).toBeLessThanOrEqual(16);
      expect(w2).toBe((w1 ?? 0) + 1);
      expect(w3).toBe((w1 ?? 0) + 2);
      seen.add(w1 ?? 0);
    }
    expect(seen.size).toBe(6);
  });

  test('backtracking moves the chain level when its chained level finds no room', () => {
    // a: 11 or 12; b: 13; c: one below a, so a = 12 (c on 13, taken) is undone for a = 11
    for (let seed = 1; seed <= 60; seed++) {
      const got = roll(
        [sp('ch:a', 11, { range: 2 }), sp('ch:b', 13), sp('ch:c', 1, { chain: 'ch:a' })],
        seed,
      );
      expect(got).toEqual([
        { id: 'ch:a', dlevel: 11 },
        { id: 'ch:b', dlevel: 13 },
        { id: 'ch:c', dlevel: 12 },
      ]);
    }
  });

  test('a chained range is cut at the bottom and skips taken levels', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const got = roll(
        [sp('ch:a', -3), sp('ch:z', 20), sp('ch:c', 1, { chain: 'ch:a', range: 5 })],
        seed,
      );
      expect(got.map((s) => s.dlevel)).toEqual([18, 20, 19]);
    }
  });

  test('loadMods: the chain must be an earlier, always-made level and keep the base inside', () => {
    const w1 = sp('ch:w1', 11, { range: 6 });
    expect(issues([{ ...MAIN, special: [w1, sp('ch:w2', 1, { chain: 'ch:w1' })] }])).toEqual([]);
    expect(issues([{ ...MAIN, special: [w1, sp('ch:w2', 1, { chain: 'ch:nope' })] }])).toEqual([
      'ch:main special[1].chain',
    ]);
    // later in the list, or itself
    expect(issues([{ ...MAIN, special: [sp('ch:w2', 1, { chain: 'ch:w1' }), w1] }])).toEqual([
      'ch:main special[0].chain',
    ]);
    expect(
      issues([{ ...MAIN, special: [{ ...w1, chance: 50 }, sp('ch:w2', 1, { chain: 'ch:w1' })] }]),
    ).toEqual(['ch:main special[1].chain']);
    // w1 may go on 16: 16 + 5 = 21 is past the 20 levels
    expect(issues([{ ...MAIN, special: [w1, sp('ch:w2', 5, { chain: 'ch:w1' })] }])).toEqual([
      'ch:main special[1].base',
    ]);
    // a negative chained base counts up from the chain level, not from the bottom
    expect(issues([{ ...MAIN, special: [w1, sp('ch:w0', -10, { chain: 'ch:w1' })] }])).toEqual([]);
    expect(issues([{ ...MAIN, special: [w1, sp('ch:w0', -11, { chain: 'ch:w1' })] }])).toEqual([
      'ch:main special[1].base',
    ]);
  });
});

describe('the variant draw', () => {
  const ctl: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
  const runMod: Mod = {
    id: 'cr',
    version: '1',
    register(api) {
      api.defineAction({
        id: 'cr:run',
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
  const engine = createEngine([
    terrainMod(),
    actionsMod(),
    runMod,
    mod([{ ...MAIN, special: [sp('ch:one', 5)] }]),
  ]);
  const goTo = (s: ReturnType<typeof engine.newGame>['state'], dlevel: number): void => {
    ctl.fn = (ctx) => ctx.goToLevel({ dungeon: MAIN.id, dlevel }, 'up');
    engine.step(s, { type: 'mod', action: 'cr:run', args: null });
  };

  test('a special level with one variant draws nothing for it (C: no `nlevels`, no rnd())', () => {
    for (let seed = 1; seed <= 10; seed++) {
      // the same LevelDef as a special level (dlevel 5) and as an ordinary one (dlevel 6)
      const a = engine.newGame({ seed, width: 30, height: 12 }).state;
      const b = structuredClone(a);
      goTo(a, 5);
      goTo(b, 6);
      expect(getLevel(a).def).toBe(PLAIN.id);
      expect(getLevel(b).def).toBe(PLAIN.id);
      expect(a.rng).toEqual(b.rng);
      expect(getLevel(a).cells).toEqual(getLevel(b).cells);
    }
  });

  test('two or more variants draw rnd(n) (as before)', () => {
    const two: LevelDef = { ...PLAIN, id: 'ch:plain2' as DefId };
    const eng2 = createEngine([
      terrainMod(),
      actionsMod(),
      runMod,
      {
        id: 'ch',
        version: '1',
        register(api) {
          api.defineLevel(PLAIN);
          api.defineLevel(two);
          api.defineDungeon({
            ...MAIN,
            special: [sp('ch:two', 5, { variants: [PLAIN.id, two.id] })],
          });
        },
      },
    ]);
    const seen = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const s = eng2.newGame({ seed, width: 30, height: 12 }).state;
      ctl.fn = (ctx) => ctx.goToLevel({ dungeon: MAIN.id, dlevel: 5 }, 'up');
      eng2.step(s, { type: 'mod', action: 'cr:run', args: null });
      seen.add(getLevel(s).def ?? '');
    }
    expect([...seen].sort()).toEqual([PLAIN.id, two.id].sort());
  });
});
