// Milestone 6b1 step 5: Minetown in the Mines. Where the layout puts it, which variant a new
// level gets, and that every variant builds a town: stairs reachable from each other, a temple
// with an altar, typed shops and a peaceful Watch.
import { vanillaMod } from '@nh/content';
import {
  createEngine,
  getLevel,
  inTown,
  sortedIds,
  type Ctx,
  type DungeonLayout,
  type GameState,
  type Level,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { checkInvariants } from '../src/index';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'mt-probe',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'mt-probe:run',
      labelKey: 'mt-probe',
      handles: 'mod',
      offer: () => [],
      perform(ctx) {
        probe.fn(ctx);
        return 0;
      },
    });
  },
};
const engine = createEngine([vanillaMod, probeMod]);
const defs = engine.registry;

function run(state: GameState, fn: (ctx: Ctx) => void): void {
  probe.fn = fn;
  engine.step(state, { type: 'mod', action: 'mt-probe:run' });
}
const mines = (state: GameState): DungeonLayout => {
  const d = state.dungeons.find((x) => x.id === 'nh:mines');
  if (!d) throw new Error('no Mines');
  return d;
};

/** A new game (seed) with its Minetown made and the hero on it, at `width` x `height`. */
function minetown(seed: number, width = 80, height = 21): { state: GameState; level: Level } {
  const { state } = engine.newGame({ seed, width, height });
  const town = mines(state).special.find((s) => s.id === 'nh:minetown');
  if (!town) throw new Error(`seed ${seed}: no Minetown`);
  run(state, (ctx) => ctx.goToLevel({ dungeon: 'nh:mines', dlevel: town.dlevel }, 'up'));
  return { state, level: getLevel(state) };
}

const VARIANTS = [
  'nh:minetn-2',
  'nh:minetn-3',
  'nh:minetn-4',
  'nh:minetn-5',
  'nh:minetn-6',
  'nh:minetn-7',
];
const SHOPS = [
  'nh:shop',
  'nh:tool_shop',
  'nh:food_shop',
  'nh:candle_shop',
  'nh:wand_shop',
  'nh:book_shop',
];

describe('Minetown placement', () => {
  test('exactly once, on Mines level 3 or 4, both over seeds', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 200; seed++) {
      const { state } = engine.newGame({ seed });
      const special = mines(state).special;
      expect(special).toHaveLength(1);
      const dl = special[0]?.dlevel ?? 0;
      expect([3, 4]).toContain(dl);
      seen.add(dl);
      for (const d of state.dungeons) if (d.id !== 'nh:mines') expect(d.special).toEqual([]);
    }
    expect([...seen].sort()).toEqual([3, 4]);
  });
});

describe('Minetown variants', () => {
  // seeds grouped by the variant their Minetown got
  const bySeed = new Map<string, number[]>();
  for (let seed = 1; seed <= 90; seed++) {
    const { level } = minetown(seed);
    const list = bySeed.get(level.def ?? '') ?? [];
    list.push(seed);
    bySeed.set(level.def ?? '', list);
  }

  test('the variant roll covers all six', () => {
    expect([...bySeed.keys()].sort()).toEqual(VARIANTS);
  });

  test.each(VARIANTS)('%s builds a town at 80x21', (variant) => {
    for (const seed of (bySeed.get(variant) ?? []).slice(0, 6)) {
      const { state, level } = minetown(seed);
      expect(level.def).toBe(variant);
      expect(level.town).toBe(true);
      expect(level.up && level.down).toBeTruthy();
      expect(checkInvariants(state, defs)).toEqual([]);
      const altar = (r: (typeof level.rooms)[number]): boolean => {
        for (let y = r.ly; y <= r.hy; y++)
          for (let x = r.lx; x <= r.hx; x++)
            if (level.palette[level.cells[y * level.width + x] ?? -1]?.startsWith('nh:altar_'))
              return true;
        return false;
      };
      const temples = level.rooms.filter((r) => r.type === 'nh:temple');
      expect(temples).toHaveLength(1);
      expect(temples.every(altar)).toBe(true);
      // at least the candle shop is always there (no chance roll in any variant)
      expect(level.rooms.some((r) => r.type === 'nh:candle_shop')).toBe(true);
      for (const r of level.rooms) if (r.type) expect([...SHOPS, 'nh:temple']).toContain(r.type);
      const watch = sortedIds(state)
        .map((id) => state.entities[String(id)])
        .filter((e) => e?.c.pos?.level === level.id && e.def.startsWith('nh:watch'));
      expect(watch.length).toBeGreaterThanOrEqual(5);
      for (const w of watch) expect(w?.c.monster?.peaceful).toBe(true);
      // the Watch stands in town
      expect(watch.some((w) => w?.c.pos && inTown(level, w.c.pos.x, w.c.pos.y))).toBe(true);
    }
  });
});
