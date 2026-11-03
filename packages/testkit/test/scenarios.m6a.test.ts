// Milestone 6a scenarios: the Mines branch stairs both ways, trap doors in the Mines, the bottom
// Mines level. Each level change is the offered action (actionsFor) or a step onto a trap.
import { TRAP, vanillaMod } from '@nh/content';
import {
  DIRS,
  DIR_LIST,
  createEngine,
  getLevel,
  getPlayer,
  isPlainFloor,
  sortedIds,
  type Ctx,
  type DefId,
  type DungeonLayout,
  type GameState,
  type Level,
  type LevelRef,
  type Mod,
  type Pos,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { checkInvariants } from '../src/index';

// A probe action that runs a callback with a real Ctx (set-up only; no time passes).
const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'm6a-probe',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'm6a-probe:run',
      labelKey: 'm6a-probe',
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
  engine.step(state, { type: 'mod', action: 'm6a-probe:run' });
}
/** Sends the hero to `to` (set-up, not the move under test). */
function goTo(state: GameState, to: LevelRef, at: 'up' | 'down' | 'branch'): Level {
  run(state, (ctx) => ctx.goToLevel(to, at));
  return getLevel(state);
}
/** A new game with random monster generation off (content's `modData.nh.debugMongen`). */
function newGame(seed: number): GameState {
  const { state } = engine.newGame({ seed });
  (state.modData['nh'] ??= {}) as Record<string, unknown>;
  (state.modData['nh'] as Record<string, unknown>)['debugMongen'] = true;
  return state;
}
const layout = (state: GameState, id: DefId): DungeonLayout => {
  const d = state.dungeons.find((x) => x.id === id);
  if (!d) throw new Error(`no dungeon ${id}`);
  return d;
};
const heroAt = (state: GameState): Pos => {
  const p = getPlayer(state).c.pos;
  return { x: p?.x ?? -1, y: p?.y ?? -1 };
};
/** Takes the self offer with this mod action id; fails if it is not offered. */
function takeStairs(state: GameState, id: 'nh:down' | 'nh:up'): void {
  const offer = engine
    .query(state)
    .actionsFor({ kind: 'self' })
    .find((o) => o.action.type === 'mod' && o.action.action === id);
  if (!offer) throw new Error(`${id} is not offered at ${JSON.stringify(heroAt(state))}`);
  engine.step(state, offer.action);
}
const healthy = (state: GameState): void =>
  expect(checkInvariants(state, engine.registry)).toEqual([]);

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

describe('the Mines branch stairs', () => {
  test('down from the main dungeon lands on the Mines top branch stairs; up lands back on the main branch stairs', () => {
    const entries = new Set<number>();
    for (const seed of SEEDS) {
      const state = newGame(seed);
      const b = layout(state, 'nh:main').branches.find((x) => x.to === 'nh:mines');
      const dl = b?.dlevel ?? 0;
      entries.add(dl);
      const main = goTo(state, { dungeon: 'nh:main', dlevel: dl }, 'branch');
      expect(main.branch).toMatchObject({ dir: 'down', to: { dungeon: 'nh:mines', dlevel: 1 } });
      const mainBranch = main.branch?.pos;

      takeStairs(state, 'nh:down');
      const top = getLevel(state);
      expect(top).toMatchObject({ dungeon: 'nh:mines', dlevel: 1, depth: dl + 1 });
      expect(top.branch).toMatchObject({ dir: 'up', to: { dungeon: 'nh:main', dlevel: dl } });
      expect(heroAt(state)).toEqual(top.branch?.pos);

      takeStairs(state, 'nh:up');
      const back = getLevel(state);
      expect(back.id).toBe(main.id);
      expect(heroAt(state)).toEqual(mainBranch);
      // the branch staircase, not the level's ordinary stairs
      expect(heroAt(state)).not.toEqual(back.up);
      expect(heroAt(state)).not.toEqual(back.down);
      healthy(state);

      // the same level's ordinary down stairs stay in the main dungeon
      goTo(state, { dungeon: 'nh:main', dlevel: dl }, 'down');
      takeStairs(state, 'nh:down');
      expect(getLevel(state)).toMatchObject({ dungeon: 'nh:main', dlevel: dl + 1 });
      expect(heroAt(state)).toEqual(getLevel(state).up);
      healthy(state);
    }
    expect(entries.size).toBeGreaterThan(1); // the seeds cover more than one entry level
  });
});

/**
 * Puts a hidden trap door on plain floor next to the hero, with nobody on it, and returns the
 * direction to it. If her own neighbours are all taken (caves are cramped), she is first moved to
 * the first free floor cell, in cell order, that has such a neighbour.
 */
function trapDoorBeside(state: GameState): (typeof DIR_LIST)[number] {
  const level = getLevel(state);
  const taken = new Set<string>();
  for (const id of sortedIds(state)) {
    const p = state.entities[String(id)]?.c.pos;
    if (p?.level === level.id && id !== state.playerId) taken.add(`${p.x},${p.y}`);
  }
  const free = (x: number, y: number): boolean =>
    isPlainFloor(defs, level, x, y) &&
    !taken.has(`${x},${y}`) &&
    !level.traps.some((t) => t.x === x && t.y === y);
  const spotFrom = (from: Pos): (typeof DIR_LIST)[number] | undefined =>
    DIR_LIST.find((d) => free(from.x + DIRS[d].x, from.y + DIRS[d].y));
  let here = heroAt(state);
  let dir = spotFrom(here);
  for (let i = 0; dir === undefined && i < level.cells.length; i++) {
    const p = { x: i % level.width, y: Math.floor(i / level.width) };
    if (!free(p.x, p.y)) continue;
    dir = spotFrom(p);
    if (dir === undefined) continue;
    const pos = getPlayer(state).c.pos;
    if (pos) Object.assign(pos, p);
    here = p;
  }
  if (dir === undefined) throw new Error('no free floor pair on the level');
  const x = here.x + DIRS[dir].x;
  const y = here.y + DIRS[dir].y;
  run(state, (ctx) => ctx.placeTrap(level.id, { def: TRAP.trapdoor as DefId, x, y, seen: false }));
  return dir;
}

describe('trap doors in the Mines', () => {
  test('fall to a deeper Mines level, never past the bottom', () => {
    const landed = new Set<number>();
    let falls = 0;
    for (const seed of SEEDS) {
      const state = newGame(seed);
      const n = layout(state, 'nh:mines').levels ?? 0;
      for (const from of [1, n - 2, n - 1]) {
        // the Mines' gnomes must not end the game before the fall is checked
        const hp = getPlayer(state).c.hp;
        if (hp) Object.assign(hp, { cur: 1000, max: 1000 });
        goTo(state, { dungeon: 'nh:mines', dlevel: from }, 'up');
        engine.step(state, { type: 'move', dir: trapDoorBeside(state) });
        const level = getLevel(state);
        expect(level.dungeon).toBe('nh:mines');
        expect(level.dlevel).toBeGreaterThan(from);
        expect(level.dlevel).toBeLessThanOrEqual(n);
        landed.add(level.dlevel - from);
        falls++;
        healthy(state);
      }
    }
    expect(falls).toBe(SEEDS.length * 3);
    expect(landed.size).toBeGreaterThan(1); // sometimes more than one level at once
  });

  test('on the bottom Mines level a trap door does not drop the hero', () => {
    for (const seed of SEEDS.slice(0, 3)) {
      const state = newGame(seed);
      const n = layout(state, 'nh:mines').levels ?? 0;
      goTo(state, { dungeon: 'nh:mines', dlevel: n }, 'up');
      const dir = trapDoorBeside(state);
      const from = heroAt(state);
      engine.step(state, { type: 'move', dir });
      expect(getLevel(state)).toMatchObject({ dungeon: 'nh:mines', dlevel: n });
      // she stepped onto the trap door (now seen) and stayed
      const at = heroAt(state);
      expect(at).toEqual({ x: from.x + DIRS[dir].x, y: from.y + DIRS[dir].y });
      expect(getLevel(state).traps.find((t) => t.x === at.x && t.y === at.y)?.seen).toBe(true);
      healthy(state);
    }
  });
});

describe('the bottom of the Mines', () => {
  test('has no down stairs, so going down is never offered there', () => {
    const sizes = new Set<number>();
    for (const seed of SEEDS) {
      const state = newGame(seed);
      const n = layout(state, 'nh:mines').levels ?? 0;
      sizes.add(n);
      const level = goTo(state, { dungeon: 'nh:mines', dlevel: n }, 'up');
      expect(level.down).toBeNull();
      expect(level.branch).toBeNull();
      const downs = level.cells.filter((c) => {
        const id = level.palette[c];
        return id !== undefined && defs.terrain(id).stairs === 'down';
      });
      expect(downs).toEqual([]);
      // the level above does lead down to it
      expect(goTo(state, { dungeon: 'nh:mines', dlevel: n - 1 }, 'up').down).not.toBeNull();
    }
    expect([...sizes].sort()).toEqual([8, 9]);
  });
});
