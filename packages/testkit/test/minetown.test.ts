// Milestone 6b1: Minetown in the Mines. Where the layout puts it, which variant a new level
// gets, that every variant builds a town at 80x21 and on bigger maps (stairs reachable from each
// other, a temple with an altar, typed shops and a peaceful Watch), and that kicking a town door
// on a real Minetown warns, then angers the Watch.
import { vanillaMod } from '@nh/content';
import {
  DIRS,
  createEngine,
  getLevel,
  getPlayer,
  inTown,
  isPlainFloor,
  mapBlock,
  sortedIds,
  type Ctx,
  type DefId,
  type DungeonLayout,
  type GameState,
  type Level,
  type Mod,
  type StepResult,
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
      isTown(state, level);
    }
  });
});

/** A built Minetown: stairs, invariants, one temple with an altar, typed shops, the Watch. */
function isTown(state: GameState, level: Level): void {
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

describe('Minetown variants on bigger maps', () => {
  // The maps are 76 or fewer columns wide (Grotto 75) and Bustling's stair regions count from
  // the right edge: every variant must still build, centred, with its stairs where they belong.
  for (const [w, h] of [
    [120, 40],
    [100, 30],
  ] as const) {
    test(`every variant builds a town at ${w}x${h}`, () => {
      const seen = new Map<string, number>();
      for (let seed = 1; seed <= 60; seed++) {
        const { state, level } = minetown(seed, w, h);
        const v = level.def ?? '';
        if ((seen.get(v) ?? 0) >= 4) continue;
        seen.set(v, (seen.get(v) ?? 0) + 1);
        expect(level.width).toBe(w);
        isTown(state, level);
        if (v === 'nh:minetn-6') {
          // Bustling: up stairs left of the town block, down stairs right of it
          const block = mapBlock(defs.level(v as DefId), w, h);
          if (!block) throw new Error('Bustling has a map block');
          expect(level.up?.x).toBeLessThan(block.x + 1);
          expect(level.down?.x).toBeGreaterThan(block.x + block.w - 2);
        }
      }
      expect([...seen.keys()].sort()).toEqual(VARIANTS);
    });
  }
});

describe('kicking a door in a real Minetown', () => {
  const keys = (r: StepResult): string[] =>
    r.events.flatMap((e) => (e.type === 'msg' && e.key ? [e.key] : []));
  const terrainAt = (level: Level, x: number, y: number): string =>
    level.palette[level.cells[y * level.width + x] ?? -1] ?? '';
  const DOORS = ['nh:door_closed', 'nh:door_locked'];

  /**
   * Sets up the kick: every monster pinned (speed 0, so nothing moves or fights), the hero weak
   * (the door rarely gives way) on free floor in town beside a closed town door, and a watchman
   * moved right behind her, where he sees her. Returns the door, the kick direction and the
   * Watch, or null when this town has no such door.
   */
  function atTownDoor(state: GameState, level: Level) {
    const taken = new Set<string>();
    const watch: number[] = [];
    for (const id of sortedIds(state)) {
      const e = state.entities[String(id)];
      if (e?.c.pos?.level !== level.id || id === state.playerId) continue;
      taken.add(`${e.c.pos.x},${e.c.pos.y}`);
      if (e.c.actor) e.c.actor.speed = 0;
      if (e.def.startsWith('nh:watch')) watch.push(id);
    }
    const free = (x: number, y: number): boolean =>
      isPlainFloor(defs, level, x, y) && inTown(level, x, y) && !taken.has(`${x},${y}`);
    for (let i = 0; i < level.cells.length; i++) {
      const door = { x: i % level.width, y: Math.floor(i / level.width) };
      if (!DOORS.includes(terrainAt(level, door.x, door.y)) || !inTown(level, door.x, door.y))
        continue;
      for (const dir of ['n', 's', 'e', 'w'] as const) {
        // the hero stands on the far side of `dir`, the watchman one step behind her
        const d = DIRS[dir];
        const hero = { x: door.x - d.x, y: door.y - d.y };
        const behind = { x: door.x - 2 * d.x, y: door.y - 2 * d.y };
        if (!free(hero.x, hero.y) || !free(behind.x, behind.y)) continue;
        const w = state.entities[String(watch[0])];
        const hp = getPlayer(state).c.pos;
        if (!w?.c.pos || !hp) throw new Error('no watchman or hero');
        Object.assign(hp, hero);
        Object.assign(w.c.pos, behind);
        const h = getPlayer(state);
        if (h.c.attributes) Object.assign(h.c.attributes, { str: 3, dex: 3, con: 3 });
        return { door, dir, watch };
      }
    }
    return null;
  }
  const kick = (state: GameState, dir: string): StepResult => {
    engine.step(state, { type: 'mod', action: 'nh:kick' });
    const p = state.pendingPrompt?.prompt;
    if (!p) throw new Error('no kick prompt');
    return engine.stepAll(state, { type: 'answer', promptId: p.id, value: dir });
  };

  test('the first kick that leaves the door standing is warned about, the next angers the Watch', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const { state, level } = minetown(seed);
      const set = atTownDoor(state, level);
      if (!set) continue;
      const before = terrainAt(level, set.door.x, set.door.y);
      const peaceful = (): boolean[] =>
        set.watch.map((id) => state.entities[String(id)]?.c.monster?.peaceful === true);
      const k1 = keys(kick(state, set.dir));
      if (terrainAt(level, set.door.x, set.door.y) !== before) continue; // it gave way
      expect(k1).toContain('watch.stop_damaging_door');
      expect(peaceful().every(Boolean)).toBe(true);
      const k2 = keys(kick(state, set.dir));
      if (terrainAt(level, set.door.x, set.door.y) !== before) continue;
      expect(k2).toContain('watch.halt_vandal');
      expect(set.watch.length).toBeGreaterThanOrEqual(5);
      expect(peaceful().some(Boolean)).toBe(false); // the whole Watch
      expect(checkInvariants(state, defs)).toEqual([]);
      return;
    }
    throw new Error('no seed with a town door and two kicks that leave it standing');
  });
});
