// Milestone 7c step 6: Orcish Town, the seventh Minetown variant (orctown.ts), and the orcs who
// left it for the deeper Mines levels (stolenBooty, migrate.ts).
import {
  cellIndex,
  createEngine,
  getLevel,
  sortedIds,
  type Ctx,
  type DefId,
  type DungeonLayout,
  type Entity,
  type GameState,
  type Level,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import { clearPath } from '../src/clearpath';
import { MINETN_1, ORCTOWN_BARS } from '../src/orctown';
import { mapToLevel } from '../src/sp_lev';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'ot',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'ot:run',
      labelKey: 'ot',
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

function goTo(state: GameState, dlevel: number): Level {
  probe.fn = (ctx) => ctx.goToLevel({ dungeon: 'nh:mines', dlevel }, 'up');
  engine.step(state, { type: 'mod', action: 'ot:run' });
  return getLevel(state);
}

/** A new game with the hero sent to Minetown. */
function minetown(seed: number, width = 80, height = 21): { state: GameState; level: Level } {
  const { state } = engine.newGame({ seed, width, height });
  const town = mines(state).special.find((s) => s.id === 'nh:minetown');
  return { state, level: goTo(state, town?.dlevel ?? 0) };
}

/** The first `n` seeds (from 1) whose Minetown is Orcish Town, at that size. */
function orcishTownSeeds(n: number, width = 80, height = 21): number[] {
  const out: number[] = [];
  for (let seed = 1; out.length < n; seed++) {
    if (seed > 400) throw new Error(`only ${String(out.length)} Orcish Towns in 400 seeds`);
    if (minetown(seed, width, height).level.def === MINETN_1.id) out.push(seed);
  }
  return out;
}

const onLevel = (state: GameState, level: Level): Entity[] =>
  sortedIds(state)
    .map((id) => state.entities[String(id)])
    .filter(
      (e): e is Entity => e !== undefined && e.c.pos?.level === level.id && e.id !== state.playerId,
    );

const terrainAt = (level: Level, x: number, y: number): string =>
  level.palette[level.cells[cellIndex(level, x, y)] ?? -1] ?? '';

const SEEDS = orcishTownSeeds(4);

describe.each([
  [80, 21],
  [120, 40],
])('Orcish Town at %ix%i', (width, height) => {
  const seeds = width === 80 ? SEEDS : orcishTownSeeds(2, width, height);

  test('builds, with its iron bars, fountains and altar, and stairs outside the town', () => {
    for (const seed of seeds) {
      const { level } = minetown(seed, width, height);
      expect(level.def).toBe(MINETN_1.id);
      for (const [x, y] of ORCTOWN_BARS) {
        const p = mapToLevel(MINETN_1, level, x, y);
        expect(terrainAt(level, p.x, p.y)).toBe('nh:iron_bars');
      }
      const f1 = mapToLevel(MINETN_1, level, 16, 9);
      const f2 = mapToLevel(MINETN_1, level, 25, 9);
      const altar = mapToLevel(MINETN_1, level, 20, 13);
      expect(terrainAt(level, f1.x, f1.y)).toBe('nh:fountain');
      expect(terrainAt(level, f2.x, f2.y)).toBe('nh:fountain');
      expect(terrainAt(level, altar.x, altar.y)).toBe('nh:altar_unaligned');
      // both stairs, neither inside the town's walls (map-relative exclude 0,1 - 36,17)
      const tl = mapToLevel(MINETN_1, level, 0, 0);
      const stairs: string[] = [];
      for (let y = 0; y < level.height; y++)
        for (let x = 0; x < level.width; x++) {
          const t = defs.terrain(terrainAt(level, x, y) as DefId);
          if (t.stairs === undefined) continue;
          stairs.push(t.stairs);
          const inTown = x >= tl.x && x <= tl.x + 36 && y >= tl.y + 1 && y <= tl.y + 17;
          expect(inTown).toBe(false);
        }
      expect(stairs.sort()).toEqual(['down', 'up']);
    }
  });
});

describe('Orcish Town contents', () => {
  test('no Watch, shopkeepers or priest; the dead are corpses; the orcs are hostile', () => {
    for (const seed of SEEDS) {
      const { state, level } = minetown(seed);
      const things = onLevel(state, level);
      const mons = things.filter((e) => e.c.monster);
      for (const m of mons)
        expect([
          'nh:watchman',
          'nh:watch_captain',
          'nh:shopkeeper',
          'nh:aligned_cleric',
        ]).not.toContain(m.def);
      const count = (ids: string[]): number => mons.filter((m) => ids.includes(m.def)).length;
      expect(count(['nh:orc_captain', 'nh:uruk_hai', 'nh:mordor_orc'])).toBeGreaterThanOrEqual(5);
      expect(count(['nh:orc_captain', 'nh:uruk_hai', 'nh:mordor_orc'])).toBeLessThanOrEqual(15);
      expect(count(['nh:orc_shaman'])).toBeGreaterThanOrEqual(1);
      expect(count(['nh:orc_shaman'])).toBeLessThanOrEqual(6);
      expect(count(['nh:hill_orc', 'nh:goblin'])).toBeGreaterThanOrEqual(10);
      expect(count(['nh:hill_orc', 'nh:goblin'])).toBeLessThanOrEqual(19);
      for (const m of mons)
        if (m.def.includes('orc') || m.def === 'nh:goblin')
          expect(m.c.monster?.peaceful).toBe(false);

      const corpses = things.filter((e) => e.def === 'nh:corpse');
      const of = (id: string): number => corpses.filter((c) => c.c.item?.corpseOf === id).length;
      expect(of('nh:aligned_cleric')).toBe(1);
      expect(of('nh:shopkeeper')).toBe(5);
      expect(of('nh:watchman')).toBe(4);
      expect(of('nh:watch_captain')).toBe(1);
      const cleric = corpses.find((c) => c.c.item?.corpseOf === 'nh:aligned_cleric');
      expect(cleric?.c.pos).toMatchObject(mapToLevel(MINETN_1, level, 20, 12));
      // each corpse has one rot timer
      for (const c of corpses)
        expect(
          state.timers.filter(
            (t) => t.kind === 'nh:rot_corpse' && (t.data as { id: number }).id === c.id,
          ),
        ).toHaveLength(1);

      // at least seven candles, three empty wands of striking and two of magic missile
      const quan = (id: string): number =>
        things.filter((e) => e.def === id).reduce((a, e) => a + (e.c.item?.quantity ?? 0), 0);
      expect(quan('nh:wax_candle') + quan('nh:tallow_candle')).toBeGreaterThanOrEqual(7);
      expect(quan('nh:oil_lamp')).toBe(1);
      const wands = things.filter((e) => e.def.startsWith('nh:wand_of_'));
      expect(wands.filter((w) => w.def === 'nh:wand_of_striking')).toHaveLength(3);
      expect(wands.filter((w) => w.def === 'nh:wand_of_magic_missile')).toHaveLength(2);
      for (const w of wands) expect(w.c.item).toMatchObject({ spe: 0, buc: 'uncursed' });
      expect(quan('nh:rock')).toBeGreaterThanOrEqual(10);
    }
  });

  test('the iron bars stop the hero but not her sight', () => {
    const { state, level } = minetown(SEEDS[0] ?? 1);
    const bar = mapToLevel(MINETN_1, level, 17, 1); // in the north wall
    const hero = state.entities[String(state.playerId)];
    if (!hero?.c.pos) throw new Error('no hero');
    for (const e of onLevel(state, level))
      if (e.c.monster && e.c.pos && e.c.pos.y <= bar.y + 1 && Math.abs(e.c.pos.x - bar.x) <= 1)
        delete e.c.pos; // nobody in the way
    hero.c.pos = { level: level.id, x: bar.x, y: bar.y - 1 };
    engine.step(state, { type: 'move', dir: 's' });
    expect(hero.c.pos).toMatchObject({ x: bar.x, y: bar.y - 1 });
    const opaque = level.palette.map((id) => defs.terrain(id).opaque);
    expect(clearPath(level, opaque, bar.x, bar.y - 1, bar.x, bar.y + 1, new Set())).toBe(true);
    expect(defs.terrain('nh:iron_bars')).toMatchObject({ passable: false, opaque: false });
  });
});

describe('the orcs who left', () => {
  const ORCS = ['nh:orc', 'nh:hill_orc', 'nh:mordor_orc', 'nh:uruk_hai', 'nh:orc_shaman'];

  test('their leader and 5-14 more wait on the deeper Mines levels, then come out', () => {
    let carrying = 0;
    for (const seed of SEEDS) {
      const { state, level } = minetown(seed);
      const bottom = mines(state).levels ?? 0;
      const nh = state.modData['nh'] as { migrating?: Record<string, string> };
      const table = nh.migrating ?? {};
      const gang = Object.keys(table)
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => ({ mon: state.entities[k], to: table[k] ?? '' }));
      const leaders = gang.filter((g) => g.mon?.def === 'nh:orc_captain');
      expect(leaders).toHaveLength(1);
      expect(gang.length - 1).toBeGreaterThanOrEqual(5);
      expect(gang.length - 1).toBeLessThanOrEqual(14);
      const leader = leaders[0];
      expect([`nh:mines/${String(bottom)}`, `nh:mines/${String(bottom - 1)}`]).toContain(
        leader?.to,
      );
      expect(leader?.mon?.c.monster?.peaceful).toBe(false);
      for (const g of gang) {
        expect(g.mon?.c.pos).toBeUndefined();
        if (g !== leader) expect(ORCS).toContain(g.mon?.def);
        const d = Number(g.to.split('/')[1]);
        expect(d).toBeGreaterThan(level.dlevel);
        expect(d).toBeLessThanOrEqual(bottom);
        const inv = sortedIds(state)
          .map((id) => state.entities[String(id)])
          .filter((e) => e?.c.item?.carriedBy === g.mon?.id);
        // no rock kept from the gem roll
        expect(inv.some((e) => e?.def === 'nh:rock')).toBe(false);
        if (
          inv.some(
            (e) => e?.def === 'nh:gold_piece' || defs.object(e?.def ?? 'nh:rock').class === 'gem',
          )
        )
          carrying++;
      }
      // the hero gets to the leader's level: the leader comes out there
      const there = goTo(state, Number(leader?.to.split('/')[1]));
      expect(leader?.mon?.c.pos?.level).toBe(there.id);
    }
    expect(carrying).toBeGreaterThan(0);
  });
});
