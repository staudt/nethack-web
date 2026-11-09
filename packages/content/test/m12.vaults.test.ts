// m12 step 6: vaults. Core's level generator makes the closed 2x2 room and the teleporter's
// niche (core/test/m12.vault.test.ts); content types the room, fills it with gold, keeps the
// once-only teleporter until its secret corridor is found, and raises the shop threshold.
// ref: src/mklev.c makelevel() do_vault block, makevtele(); src/sp_lev.c fill_special_room();
// src/teleport.c tele_trap(), vault_tele(), mtele_trap(), mvault_tele()
import {
  cellIndex,
  createEngine,
  getLevel,
  getPlayer,
  itemsAt,
  trapAt,
  type Ctx,
  type GameState,
  type Level,
  type Mod,
  type Room,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import {
  TRAP,
  VAULT,
  mintrap,
  mkSpecialRoom,
  pendingVaultTele,
  vanillaMod,
  vaultRoom,
} from '../src/index';
import { T, setTerrain, terrainIdAt } from '../src/terrain';
import { addMon } from './helpers';
import { quiet } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'probe',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'probe:run',
      labelKey: 'probe',
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
function withCtx(state: GameState, fn: (ctx: Ctx) => void): void {
  probe.fn = fn;
  engine.step(state, { type: 'mod', action: 'probe:run' });
}
const inRoom = (r: Room, x: number, y: number): boolean =>
  x >= r.lx && x <= r.hx && y >= r.ly && y <= r.hy;

// main-dungeon levels 1..6 of a number of games, as made
const made: { level: Level; json: string }[] = [];
for (let seed = 1; seed <= 12; seed++) {
  const { state } = engine.newGame({ seed });
  for (let dlevel = 1; dlevel <= 6; dlevel++) {
    if (dlevel > 1) withCtx(state, (ctx) => ctx.goToLevel({ dungeon: 'nh:main', dlevel }, 'up'));
    const level = getLevel(state);
    if (level.def !== undefined) continue;
    const gold = (x: number, y: number) =>
      itemsAt(defs, state, level.id, x, y).filter((o) => o.def === 'nh:gold_piece');
    const vi = vaultRoom(level);
    if (vi !== null) {
      const r = level.rooms[vi]!;
      const piles = [];
      for (let x = r.lx; x <= r.hx; x++) for (let y = r.ly; y <= r.hy; y++) piles.push(gold(x, y));
      made.push({
        level: structuredClone(level),
        json: JSON.stringify(piles.map((p) => p.map((o) => o.c.item?.quantity))),
      });
    } else made.push({ level: structuredClone(level), json: '' });
  }
  // nothing level generation asked for is left in the state a save writes
  const saved = JSON.stringify(state);
  expect(saved).not.toContain('vaultSpot');
  expect(saved).not.toContain('vaultTeleSpot');
}

describe('the vault room', () => {
  test('a lit 2x2 nh:vault room after the others, its squares each holding one pile of gold', () => {
    const vaults = made.filter((m) => vaultRoom(m.level) !== null);
    expect(vaults.length).toBeGreaterThan(made.length / 5);
    for (const { level, json } of vaults) {
      const vi = vaultRoom(level)!;
      const r = level.rooms[vi]!;
      expect(vi).toBe(level.rooms.length - 1);
      expect(r).toMatchObject({ hx: r.lx + 1, hy: r.ly + 1, lit: true, type: VAULT });
      // fill_special_room() runs on it twice (do_vault, then makelevel()'s last loop): each
      // square has rn1(100 * depth, 51) pieces twice over, merged into one pile
      const piles = JSON.parse(json) as number[][];
      expect(piles).toHaveLength(4);
      for (const p of piles) {
        expect(p).toHaveLength(1);
        expect(p[0]).toBeGreaterThanOrEqual(2 * 51);
        expect(p[0]).toBeLessThanOrEqual(2 * (100 * level.depth + 50));
      }
      // no stairs in it, and no other room's typing
      for (const s of [level.up, level.down, level.branch?.pos])
        if (s) expect(inRoom(r, s.x, s.y)).toBe(false);
      expect(level.rooms.filter((o) => o.type === VAULT)).toHaveLength(1);
    }
  });

  test('the vault counts as a room and raises the shop threshold by one', () => {
    const base = made.find((m) => m.level.rooms.length >= 4)!.level;
    const ordinary = base.rooms.filter((r) => r.type === undefined).slice(0, 3);
    // three rooms on DL2 make the shop roll; two and a vault do not (nothing else rolls there)
    const roll = (rooms: Room[]): boolean => {
      const { state } = engine.newGame({ seed: 1 });
      let drew = false;
      withCtx(state, (ctx) => {
        const level: Level = { ...structuredClone(base), depth: 2, branch: null, rooms };
        const before = JSON.stringify(ctx.state.rng);
        mkSpecialRoom(ctx, level);
        drew = JSON.stringify(ctx.state.rng) !== before;
      });
      return drew;
    };
    expect(roll(structuredClone(ordinary))).toBe(true);
    const vault: Room = { lx: 1, ly: 1, hx: 2, hy: 2, lit: true, type: VAULT };
    expect(roll([...structuredClone(ordinary), vault])).toBe(true);
    expect(roll([...structuredClone(ordinary.slice(0, 2)), vault])).toBe(false);
  });
});

/** A new game whose first level has a hidden vault teleporter, the hero on it. */
function withTeleporter(): { state: GameState; level: Level; x: number; y: number } {
  for (let seed = 1; seed <= 200; seed++) {
    const { state } = engine.newGame({ seed });
    const level = getLevel(state);
    const cell = pendingVaultTele(state, level.id);
    if (cell === null) continue;
    quiet(state);
    return { state, level, x: cell % level.width, y: Math.trunc(cell / level.width) };
  }
  throw new Error('no vault teleporter in 200 seeds');
}

describe('the vault teleporter', () => {
  test('hidden in its secret corridor until found, then a once-only teleportation trap', () => {
    const { state, level, x, y } = withTeleporter();
    expect(terrainIdAt(level, x, y)).toBe(T.scorr);
    expect(trapAt(level, x, y)).toBeUndefined();
    engine.step(state, { type: 'wait' });
    expect(trapAt(level, x, y)).toBeUndefined();
    // found (by searching, digging, detection): it is there at once, unseen
    setTerrain(level, x, y, T.corr);
    engine.step(state, { type: 'wait' });
    expect(trapAt(level, x, y)).toMatchObject({ def: TRAP.tele, once: true, seen: false });
    expect(pendingVaultTele(state, level.id)).toBeNull();
  });

  test('stepping on it takes her into the vault and uses it up', () => {
    const { state, level, x, y } = withTeleporter();
    setTerrain(level, x, y, T.corr);
    // its door is above or below the niche; open it and stand there
    const dy = [-1, 1].find((d) => {
      const id = terrainIdAt(level, x, y + d);
      return id !== undefined && (defs.terrain(id).door !== undefined || id.startsWith('nh:sdoor'));
    })!;
    setTerrain(level, x, y + dy, T.doorway);
    const pos = getPlayer(state).c.pos!;
    pos.x = x;
    pos.y = y + dy;
    engine.step(state, { type: 'wait' });
    const ev = engine.step(state, { type: 'move', dir: dy === 1 ? 'n' : 's' }).events;
    expect(ev.some((e) => e.type === 'msg' && e.key === 'tele.materialize_different')).toBe(true);
    const vault = level.rooms[vaultRoom(level)!]!;
    const at = getPlayer(state).c.pos!;
    expect(inRoom(vault, at.x, at.y)).toBe(true);
    expect(trapAt(level, x, y)).toBeUndefined();
  });

  test('a monster on it lands in the vault and leaves it in place', () => {
    const { state, level, x, y } = withTeleporter();
    setTerrain(level, x, y, T.corr);
    engine.step(state, { type: 'wait' });
    const id = addMon(state, 'nh:jackal', x, y);
    expect(state.entities[String(id)]!.c.pos!.level).toBe(level.id);
    withCtx(state, (ctx) => mintrap(ctx, id));
    const vault = level.rooms[vaultRoom(level)!]!;
    const p = state.entities[String(id)]!.c.pos!;
    expect(inRoom(vault, p.x, p.y)).toBe(true);
    expect(trapAt(level, x, y)).toMatchObject({ def: TRAP.tele, once: true });
    expect(level.cells[cellIndex(level, x, y)]).toBe(level.palette.indexOf(T.corr));
  });
});
