// Milestone 7c step 5: Mines' End, three variants on the last Mines level (minesend.ts), the
// Catacombs maze walk (mazewalk.ts) and the sp_lev fixups.
import {
  cellIndex,
  createEngine,
  getLevel,
  sortedIds,
  type Ctx,
  type DungeonLayout,
  type GameState,
  type Level,
  type Mod,
  type Pos,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import { MINEND_3, MINEND_3_PLACES, MINEND_LUCKSTONE_SPOTS } from '../src/minesend';
import { mapToLevel, shuffle } from '../src/sp_lev';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'me',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'me:run',
      labelKey: 'me',
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

const mines = (state: GameState): DungeonLayout => {
  const d = state.dungeons.find((x) => x.id === 'nh:mines');
  if (!d) throw new Error('no Mines');
  return d;
};

/** A new game with the hero sent to the last Mines level, at `width` x `height`. */
function minesEnd(seed: number, width = 80, height = 21): { state: GameState; level: Level } {
  const { state } = engine.newGame({ seed, width, height });
  const n = mines(state).levels ?? 0;
  probe.fn = (ctx) => ctx.goToLevel({ dungeon: 'nh:mines', dlevel: n }, 'up');
  engine.step(state, { type: 'mod', action: 'me:run' });
  return { state, level: getLevel(state) };
}

const VARIANTS = ['nh:minend-1', 'nh:minend-2', 'nh:minend-3'] as const;

/** The first seeds (from 1) whose Mines' End is each variant, at that size. */
function seedsByVariant(width: number, height: number, from = 1): Record<string, number> {
  const found: Record<string, number> = {};
  for (let seed = from; Object.keys(found).length < VARIANTS.length; seed++) {
    if (seed > from + 199)
      throw new Error(`not every variant within 200 seeds: ${JSON.stringify(found)}`);
    const { level } = minesEnd(seed, width, height);
    const id = level.def ?? '';
    if (found[id] === undefined) found[id] = seed;
  }
  return found;
}

/**
 * Cells reachable from `from` by 8-way steps over ground a hero can cross in time: passable
 * terrain, closed and locked doors, and secret doors (found by searching).
 */
function reachable(level: Level, from: Pos): Set<number> {
  const ok = level.palette.map((id) => {
    const t = defs.terrain(id);
    return t.passable || t.door !== undefined || id.startsWith('nh:sdoor');
  });
  const seen = new Set([cellIndex(level, from.x, from.y)]);
  const queue: Pos[] = [from];
  for (let p = queue.shift(); p; p = queue.shift())
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = p.x + dx;
        const y = p.y + dy;
        if (x < 0 || y < 0 || x >= level.width || y >= level.height) continue;
        const i = cellIndex(level, x, y);
        if (seen.has(i) || !ok[level.cells[i] ?? -1]) continue;
        seen.add(i);
        queue.push({ x, y });
      }
  return seen;
}

/** The entities on `level` (not the hero). */
function onLevel(state: GameState, level: Level) {
  return sortedIds(state)
    .map((id) => state.entities[String(id)])
    .filter((e) => e !== undefined && e.c.pos?.level === level.id && e.id !== state.playerId);
}

describe("Mines' End in the layout", () => {
  test('it is on the last Mines level, below Minetown, which keeps no down stairs', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { state } = engine.newGame({ seed });
      const m = mines(state);
      const end = m.special.find((s) => s.id === 'nh:minesend');
      const town = m.special.find((s) => s.id === 'nh:minetown');
      expect(end?.dlevel).toBe(m.levels);
      expect(town?.dlevel).toBeLessThan(end?.dlevel ?? 0);
    }
  });
});

describe.each([
  [80, 21],
  [120, 40],
])("Mines' End at %ix%i", (width, height) => {
  const seeds = seedsByVariant(width, height);

  test.each(VARIANTS)(
    '%s: up stairs at its spot, no down stairs, one achievement luckstone',
    (v) => {
      const { state, level } = minesEnd(seeds[v] ?? 0, width, height);
      const def = defs.level(v);
      expect(level.def).toBe(v);
      expect(level.down).toBeNull();
      expect(level.branch).toBeNull();
      const up = v === 'nh:minend-3' ? [42, 8] : [36, 4];
      expect(level.up).toEqual(mapToLevel(def, level, up[0] ?? 0, up[1] ?? 0));
      // exactly one luckstone on the luckstone spots, not cursed (random gems may add others)
      const spots = (MINEND_LUCKSTONE_SPOTS[v] ?? []).map(([x, y]) => mapToLevel(def, level, x, y));
      const stones = onLevel(state, level).filter(
        (e) =>
          e?.def === 'nh:luckstone' && spots.some((p) => p.x === e.c.pos?.x && p.y === e.c.pos.y),
      );
      expect(stones).toHaveLength(1);
      expect(stones[0]?.c.item?.buc).not.toBe('cursed');
    },
  );

  test('the Catacombs maze joins the up stairs to every luckstone place', () => {
    const { level } = minesEnd(seeds['nh:minend-3'] ?? 0, width, height);
    const area = reachable(level, level.up as Pos);
    for (const [x, y] of MINEND_3_PLACES) {
      const p = mapToLevel(MINEND_3, level, x, y);
      expect(area.has(cellIndex(level, p.x, p.y))).toBe(true);
    }
  });
});

describe("Mines' End contents", () => {
  // searched start: the vampires and mimics have no MonsterDefs, so each becomes a random monster
  // (create_monster() as for a genocided class); from seed 22 none falls outside these classes
  const seeds = seedsByVariant(80, 21, 22);

  test('the Catacombs: undead and floating eyes, no vampires; a flint on a place', () => {
    const { state, level } = minesEnd(seeds['nh:minend-3'] ?? 0);
    const mons = onLevel(state, level).filter(
      (e) => e?.c.monster && e.c.monster.tame === undefined,
    );
    const glyphs = mons.map((e) => defs.monster(e?.def ?? 'nh:none').glyph.ch);
    expect(glyphs.length).toBeGreaterThanOrEqual(15);
    expect(new Set(glyphs)).toEqual(new Set(['M', 'Z', 'e']));
    expect(mons.map((e) => e?.def)).toContain('nh:ettin_mummy');
    const places = MINEND_3_PLACES.map(([x, y]) => mapToLevel(MINEND_3, level, x, y));
    const flint = onLevel(state, level).filter(
      (e) =>
        e?.def === 'nh:flint_stone' && places.some((p) => p.x === e.c.pos?.x && p.y === e.c.pos.y),
    );
    expect(flint.length).toBeGreaterThanOrEqual(1);
  });

  test('minend-1 and minend-2: the gnome king and his court, no mimics', () => {
    for (const v of ['nh:minend-1', 'nh:minend-2']) {
      const { state, level } = minesEnd(seeds[v] ?? 0);
      const mons = onLevel(state, level).filter(
        (e) => e?.c.monster && e.c.monster.tame === undefined,
      );
      const ids = mons.map((e) => e?.def);
      expect(ids).toContain('nh:gnome_king');
      expect(ids.filter((d) => d === 'nh:gnome').length).toBeGreaterThanOrEqual(9);
      const glyphs = new Set(ids.map((d) => defs.monster(d ?? 'nh:none').glyph.ch));
      expect([...glyphs].every((g) => g === 'G' || g === 'h')).toBe(true);
    }
  });

  test('minend-2: booze in the wine cellar; the door at 52,5 is locked whenever it is secret', () => {
    const def = defs.level('nh:minend-2');
    const states = new Set<string>();
    for (let seed = 1; seed <= 200 && states.size < 2; seed++) {
      const { state, level } = minesEnd(seed);
      if (level.def !== 'nh:minend-2') continue;
      const p = mapToLevel(def, level, 52, 5);
      const id = level.palette[level.cells[cellIndex(level, p.x, p.y)] ?? -1] ?? '';
      expect(['nh:sdoor_v', 'nh:sdoor_h']).not.toContain(id);
      states.add(id.startsWith('nh:sdoor_locked') ? 'locked' : 'wall');
      const cellar = mapToLevel(def, level, 10, 7);
      const booze = onLevel(state, level).filter(
        (e) => e?.def === 'nh:potion_of_booze' && e.c.pos?.x === cellar.x && e.c.pos.y === cellar.y,
      );
      expect(booze.length).toBeGreaterThanOrEqual(1); // two, or one merged stack
    }
    expect(states).toEqual(new Set(['locked', 'wall']));
  });
});

test("shuffle() is nhlib.lua's: a permutation drawn from the RNG", () => {
  const rolls: number[] = [];
  const list = [1, 2, 3, 4, 5];
  shuffle({ rng: { rn2: (n: number) => (rolls.push(n), 0) } } as unknown as Ctx, list);
  expect(rolls).toEqual([5, 4, 3, 2]); // math.random(i) for i = #list .. 2
  expect(list).toEqual([2, 3, 4, 5, 1]);
});
