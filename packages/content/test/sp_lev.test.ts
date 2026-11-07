// Milestone 6a step 3: content makes a LevelDef's contents (sp_lev.ts) and mkclass().
import {
  createEngine,
  getLevel,
  loadMods,
  sortedIds,
  type Ctx,
  type DefId,
  type GameState,
  type Level,
  type LevelDef,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import { mkclass } from '../src/generation';

const CAVE: LevelDef = {
  id: 'tl:cave',
  init: { style: 'solidfill', fg: 'nh:floor', lit: true },
  contents: [
    { kind: 'monster', id: 'nh:dwarf', count: { min: 2, max: 4 } },
    { kind: 'monster', class: 'G', count: 3 },
    { kind: 'monster', id: 'nh:homunculus', count: 5, percent: 0 },
    { kind: 'object', class: 'gem', count: 3 },
    { kind: 'object', id: 'nh:large_box', percent: 100 },
    { kind: 'trap', count: 2 },
  ],
};
const ROOMS: LevelDef = {
  id: 'tl:rooms',
  init: { style: 'rooms' },
  contents: [
    { kind: 'monster', id: 'nh:homunculus', count: 10 }, // by id: no group to spread out
    { kind: 'object', count: 10 },
    { kind: 'trap', count: 10 },
  ],
};

// Mod 'tl': two one-level dungeons off DL5 and DL6 built from the levels above, and a probe action that
// runs a callback with a real Ctx (no time passes).
const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const tlMod: Mod = {
  id: 'tl',
  version: '1',
  register(api) {
    api.defineLevel(CAVE);
    api.defineLevel(ROOMS);
    for (const l of [CAVE, ROOMS])
      api.defineDungeon({
        id: `${l.id}_d`,
        nameKey: 'tl',
        levels: { base: 1 },
        entry: { from: 'nh:main', base: l === CAVE ? 5 : 6 }, // below the Mines entry
        filler: l.id,
      });
    api.defineAction({
      id: 'tl:run',
      labelKey: 'tl',
      handles: 'mod',
      offer: () => [],
      perform(ctx) {
        probe.fn(ctx);
        return 0;
      },
    });
  },
};
const engine = createEngine([vanillaMod, tlMod]);
const defs = loadMods([vanillaMod, tlMod]);

/** A new game, with the hero sent to the top of dungeon `to`. */
function visit(seed: number, to: DefId): { state: GameState; level: Level } {
  const { state } = engine.newGame({ seed });
  probe.fn = (ctx) => ctx.goToLevel({ dungeon: to, dlevel: 1 }, 'up');
  engine.step(state, { type: 'mod', action: 'tl:run' });
  return { state, level: getLevel(state) };
}

/** Entities standing on `level`, by kind. */
function onLevel(state: GameState, level: Level) {
  const here = sortedIds(state)
    .map((id) => state.entities[String(id)])
    .filter((e) => e?.c.pos?.level === level.id && e.id !== state.playerId);
  return {
    monsters: here.filter((e) => e?.c.monster && e.c.monster.tame === undefined),
    items: here.filter((e) => e?.c.item),
  };
}

describe('LevelDef contents', () => {
  test('counts, classes and percent chances are honoured', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const { state, level } = visit(seed, 'tl:cave_d');
      expect(level.def).toBe('tl:cave');
      const { monsters, items } = onLevel(state, level);
      const ids = monsters.map((m) => m?.def ?? 'nh:none');
      const dwarves = ids.filter((d) => d === 'nh:dwarf').length;
      expect(dwarves).toBeGreaterThanOrEqual(2);
      expect(dwarves).toBeLessThanOrEqual(4);
      const gs = ids.filter((d) => defs.monster(d).glyph.ch === 'G');
      expect(gs).toHaveLength(3);
      expect(ids).not.toContain('nh:homunculus');
      expect(monsters).toHaveLength(dwarves + 3);
      const gems = items.filter((i) => i && defs.object(i.def).class === 'gem');
      expect(gems).toHaveLength(3);
      expect(items.filter((i) => i?.def === 'nh:large_box')).toHaveLength(1);
      expect(level.traps).toHaveLength(2);
    }
  });

  test('things go only on dry ground (floor, corridor, stairs), traps only on plain floor', () => {
    const dry = new Set(['nh:floor', 'nh:corr', 'nh:stairs_up', 'nh:stairs_down']);
    for (let seed = 1; seed <= 6; seed++) {
      const { state, level } = visit(seed, 'tl:rooms_d');
      expect(level.def).toBe('tl:rooms');
      const { monsters, items } = onLevel(state, level);
      // mklev's own room gold is made before its fountains (mklev.c makelevel(): mkgold() then
      // mkfount()), so a fountain may stand on it; the contents never make gold (mkobjprobs)
      const made = items.filter((i) => i?.def !== 'nh:gold_piece');
      for (const e of [...monsters, ...made]) {
        const p = e?.c.pos;
        if (!p) throw new Error('no pos');
        expect(dry).toContain(level.palette[level.cells[p.y * level.width + p.x] ?? -1]);
      }
      for (const t of level.traps)
        expect(['nh:floor', 'nh:corr']).toContain(
          level.palette[level.cells[t.y * level.width + t.x] ?? -1],
        );
      expect(level.traps.length).toBeGreaterThan(0);
    }
  });
});

describe('mkclass', () => {
  test('picks only monsters of the class, and null for an empty class', () => {
    const { state } = engine.newGame({ seed: 9 });
    probe.fn = (ctx) => {
      const seen = new Set<string>();
      for (let i = 0; i < 200; i++) {
        const m = mkclass(ctx, 'G', 1 + (i % 12));
        if (!m) throw new Error('no G monster');
        expect(m.glyph.ch).toBe('G');
        seen.add(m.id);
      }
      expect(seen.size).toBeGreaterThan(1);
      expect(mkclass(ctx, '}', 5)).toBeNull();
    };
    engine.step(state, { type: 'mod', action: 'tl:run' });
  });
});
