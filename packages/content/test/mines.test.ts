// Milestone 6a step 5: the Gnomish Mines (nh:mines, filled with nh:minefill).
import {
  cellIndex,
  cellRules,
  createEngine,
  createRng,
  getLevel,
  getPlayer,
  rollDungeons,
  seedRng,
  sortedIds,
  type Ctx,
  type GameState,
  type Level,
  type LevelRef,
  type Mod,
  type Pos,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';

// A probe action that runs a callback with a real Ctx (no time passes).
const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'mp',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'mp:run',
      labelKey: 'mp',
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

function goTo(state: GameState, to: LevelRef, at: 'up' | 'branch' = 'up'): Level {
  probe.fn = (ctx) => ctx.goToLevel(to, at);
  engine.step(state, { type: 'mod', action: 'mp:run' });
  return getLevel(state);
}

/** Cells reachable from `from` by 8-way steps over passable terrain (caves have no doors). */
function reachable(level: Level, from: Pos): Set<number> {
  const { passable } = cellRules(level, defs);
  const seen = new Set([cellIndex(level, from.x, from.y)]);
  const queue: Pos[] = [from];
  for (let p = queue.shift(); p; p = queue.shift())
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = p.x + dx;
        const y = p.y + dy;
        if (x < 0 || y < 0 || x >= level.width || y >= level.height) continue;
        const i = cellIndex(level, x, y);
        if (seen.has(i) || !passable[level.cells[i] ?? -1]) continue;
        seen.add(i);
        queue.push({ x, y });
      }
  return seen;
}

describe('the Mines layout', () => {
  test('entry on DL2-4, 8 or 9 levels, one branch staircase in the main dungeon', () => {
    const entries = new Set<number>();
    const sizes = new Set<number>();
    for (let seed = 1; seed <= 300; seed++) {
      const [main, mines, ...rest] = rollDungeons(createRng(seedRng(seed)), defs.dungeons);
      expect(rest).toEqual([]);
      expect(main).toMatchObject({ id: 'nh:main', depthStart: 1, levels: null });
      expect(main?.branches).toHaveLength(1);
      const b = main?.branches[0];
      expect(b?.to).toBe('nh:mines');
      const dl = b?.dlevel ?? 0;
      expect(dl).toBeGreaterThanOrEqual(2);
      expect(dl).toBeLessThanOrEqual(4);
      expect(mines).toMatchObject({ id: 'nh:mines', depthStart: dl + 1, branches: [] });
      expect([8, 9]).toContain(mines?.levels);
      entries.add(dl);
      sizes.add(mines?.levels ?? 0);
    }
    expect([...entries].sort()).toEqual([2, 3, 4]);
    expect([...sizes].sort()).toEqual([8, 9]);
  });
});

describe('Mines levels', () => {
  test('every level: a minefill cave with reachable stairs, gnomes, dwarves, gems and traps', () => {
    const seen = new Set<string>();
    for (const seed of [1, 2, 3]) {
      const { state } = engine.newGame({ seed });
      const mines = state.dungeons.find((d) => d.id === 'nh:mines');
      const n = mines?.levels ?? 0;
      expect(n).toBeGreaterThanOrEqual(8);
      for (let dlevel = 1; dlevel <= n; dlevel++) {
        const level = goTo(state, { dungeon: 'nh:mines', dlevel });
        if (mines?.special.some((s) => s.dlevel === dlevel)) {
          // Minetown (see testkit's minetown.test.ts)
          expect(level.town).toBe(true);
          expect(level.def).toMatch(/^nh:minetn-[2-7]$/);
          continue;
        }
        expect(level).toMatchObject({ id: `nh:mines/${dlevel}`, def: 'nh:minefill', rooms: [] });
        expect(level.depth).toBe((mines?.depthStart ?? 0) + dlevel - 1);

        // stairs: the top level goes up by the branch stairs, the bottom has no down stairs
        const stairs: Pos[] = [];
        if (dlevel === 1) {
          expect(level.up).toBeNull();
          expect(level.branch).toMatchObject({ dir: 'up', to: { dungeon: 'nh:main' } });
        } else expect(level.up).not.toBeNull();
        if (dlevel === n) expect(level.down).toBeNull();
        else expect(level.down).not.toBeNull();
        for (const p of [level.up, level.down, level.branch?.pos]) if (p) stairs.push(p);
        expect(stairs).toHaveLength(dlevel === n ? 1 : 2);
        const first = stairs[0] as Pos;
        const area = reachable(level, first);
        for (const p of stairs) expect(area.has(cellIndex(level, p.x, p.y))).toBe(true);

        // contents: 6-8 gnomes, a gnome lord, 2 dwarves, 2 more G and maybe an h or a G
        const here = sortedIds(state)
          .map((id) => state.entities[String(id)])
          .filter((e) => e?.c.pos?.level === level.id && e.id !== state.playerId);
        const mons = here
          .filter((e) => e?.c.monster && e.c.monster.tame === undefined) // not the kitten
          .map((e) => e?.def ?? 'nh:none');
        const glyphs = mons.map((d) => defs.monster(d).glyph.ch);
        expect(glyphs.every((g) => g === 'G' || g === 'h')).toBe(true);
        for (const d of mons) seen.add(d);
        expect(mons.filter((d) => d === 'nh:gnome').length).toBeGreaterThanOrEqual(6);
        expect(mons).toContain('nh:gnome_lord');
        expect(mons.filter((d) => d === 'nh:dwarf').length).toBeGreaterThanOrEqual(2);
        expect(glyphs.filter((g) => g === 'G' || g === 'h').length).toBeGreaterThanOrEqual(11);
        const items = here.filter((e) => e?.c.item).map((e) => defs.object(e?.def ?? 'nh:none'));
        expect(items.filter((o) => o.class === 'gem').length).toBeGreaterThanOrEqual(2);
        expect(items.some((o) => o.class === 'tool')).toBe(true);
        // six des.trap() calls; one may land on an earlier trap, which maketrap() replaces (as in
        // C), so 5 or 6 remain
        expect(level.traps.length).toBeGreaterThanOrEqual(5);
        expect(level.traps.length).toBeLessThanOrEqual(6);
      }
    }
    expect(seen).toContain('nh:hobbit'); // the 50% "h"
  });

  test('the hero can be sent to the Mines top, arriving on its branch stairs', () => {
    const { state } = engine.newGame({ seed: 5 });
    const level = goTo(state, { dungeon: 'nh:mines', dlevel: 1 }, 'branch');
    const pos = getPlayer(state).c.pos;
    expect(level.id).toBe('nh:mines/1');
    expect({ x: pos?.x, y: pos?.y }).toEqual(level.branch?.pos);
  });
});
