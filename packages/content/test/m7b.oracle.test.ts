// Milestone 7b step 5: the Oracle level (dat/oracle.lua) on DL5-9, the Oracle, the Delphi
// greeting, and an up-branch chained to the Oracle in the wizard's dungeon overview.
import {
  cellIndex,
  createEngine,
  createRng,
  getLevel,
  getPlayer,
  rollDungeons,
  seedRng,
  sortedIds,
  type Ctx,
  type Entity,
  type GameEvent,
  type GameState,
  type Level,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import { DELPHI, ORACLE } from '../src/oracle';
import { P, setIntrinsic } from '../src/props';
import { checkSpecialRoom } from '../src/rooms';
import { passive } from '../src/uhitm_passive';
import { printDungeon } from '../src/wizard/where';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'op',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'op:run',
      labelKey: 'op',
      handles: 'mod',
      offer: () => [],
      perform(ctx) {
        probe.fn(ctx);
        return 0;
      },
    });
  },
};
/** An up-branch chained to the Oracle, as dungeon.lua's Sokoban. */
const upMod: Mod = {
  id: 'tt',
  version: '1',
  dependsOn: ['nh'],
  register(api) {
    api.defineDungeon({
      id: 'tt:up',
      nameKey: 'tt',
      levels: { base: 4 },
      entryLevel: -1,
      entry: { from: 'nh:main', chain: 'nh:oracle', base: 1, dir: 'up' },
    });
  },
};
const engine = createEngine([vanillaMod, probeMod]);

function run(state: GameState, fn: (ctx: Ctx) => void): GameEvent[] {
  probe.fn = fn;
  return engine.step(state, { type: 'mod', action: 'op:run' }).events;
}
const msgs = (events: GameEvent[]) =>
  events.flatMap((e) => (e.type === 'msg' ? [{ key: e.key, params: e.params }] : []));

/** A new game with the hero on the Oracle level's up stairs. */
function oracleLevel(seed: number): { state: GameState; level: Level } {
  const { state } = engine.newGame({ seed });
  const at = state.dungeons[0]?.special.find((s) => s.id === 'nh:oracle');
  if (!at) throw new Error('no Oracle');
  run(state, (ctx) => ctx.goToLevel({ dungeon: 'nh:main', dlevel: at.dlevel }, 'up'));
  return { state, level: getLevel(state) };
}
const terrain = (level: Level, x: number, y: number): string =>
  level.palette[level.cells[cellIndex(level, x, y)] ?? -1] ?? '';
const theOracle = (state: GameState, level: Level): Entity[] =>
  sortedIds(state)
    .map((id) => state.entities[String(id)] as Entity)
    .filter((e) => e.def === ORACLE && e.c.pos?.level === level.id);
const delphiOf = (level: Level): number => level.rooms.findIndex((r) => r.type === DELPHI);

describe('the Oracle level', () => {
  test('always placed, on DL5-9 of the main dungeon, each over seeds', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 200; seed++) {
      const [main] = rollDungeons(createRng(seedRng(seed)), engine.registry.dungeons);
      expect(main?.special).toHaveLength(1);
      const at = main?.special[0];
      expect(at?.id).toBe('nh:oracle');
      expect([5, 6, 7, 8, 9]).toContain(at?.dlevel);
      seen.add(at?.dlevel ?? 0);
    }
    expect([...seen].sort()).toEqual([5, 6, 7, 8, 9]);
  });

  test('the lit centre room holds Delphi: four fountains around the peaceful Oracle', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const { state, level } = oracleLevel(seed);
      expect(level.def).toBe('nh:oracle_level');
      const oracles = theOracle(state, level);
      expect(oracles).toHaveLength(1);
      const oracle = oracles[0]!;
      expect(oracle.c.monster?.peaceful).toBe(true);
      const d = delphiOf(level);
      const room = level.rooms[d]!;
      expect([room.hx - room.lx, room.hy - room.ly]).toEqual([2, 2]);
      expect(room.lit).toBe(true);
      const centre = level.rooms[room.parent ?? -1]!;
      expect([centre.hx - centre.lx, centre.hy - centre.ly]).toEqual([10, 8]);
      expect(centre.lit).toBe(true);
      const { x, y } = oracle.c.pos!;
      expect({ x, y }).toEqual({ x: room.lx + 1, y: room.ly + 1 });
      for (const [dx, dy] of [
        [0, -1],
        [-1, 0],
        [1, 0],
        [0, 1],
      ] as const)
        expect(terrain(level, x + dx, y + dy)).toBe('nh:fountain');
      for (const [dx, dy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const)
        expect(terrain(level, x + dx, y + dy)).toBe('nh:floor');
      // one doorway (no door) into Delphi
      const walls: string[] = [];
      for (let wx = room.lx - 1; wx <= room.hx + 1; wx++)
        for (let wy = room.ly - 1; wy <= room.hy + 1; wy++)
          if (wx < room.lx || wx > room.hx || wy < room.ly || wy > room.hy)
            walls.push(terrain(level, wx, wy));
      expect(walls.filter((t) => t === 'nh:doorway')).toHaveLength(1);
      // the stairs are in the random rooms around it
      for (const p of [level.up, level.down]) {
        expect(p).not.toBeNull();
        expect(
          p!.x >= centre.lx - 1 &&
            p!.x <= centre.hx + 1 &&
            p!.y >= centre.ly - 1 &&
            p!.y <= centre.hy + 1,
        ).toBe(false);
      }
    }
  });

  test('entering Delphi: the greeting, once; an angry Oracle; no Oracle', () => {
    /** From the centre room's corner into Delphi's (room `d`, Delphi when the level was made). */
    const enter = (state: GameState, level: Level, d = delphiOf(level)): GameEvent[] => {
      const room = level.rooms[d]!;
      const centre = level.rooms[room.parent ?? -1]!;
      return run(state, (ctx) => {
        const hero = getPlayer(ctx.state);
        hero.c.pos = { level: level.id, x: centre.lx, y: centre.ly };
        checkSpecialRoom(ctx, false);
        hero.c.pos = { level: level.id, x: room.lx, y: room.ly };
        checkSpecialRoom(ctx, false);
      });
    };
    const { state, level } = oracleLevel(1);
    const d = delphiOf(level);
    const role = engine.registry.role(getPlayer(state).c.player!.role).nameKey;
    expect(msgs(enter(state, level))).toEqual([
      { key: 'oracle.welcome', params: { hello: '@shk.hello.valkyrie', name: `@${role}` } },
    ]);
    // then an ordinary room (rtype = OROOM): no second greeting
    expect(level.rooms[d]?.type).toBeUndefined();
    expect(msgs(enter(state, level, d))).toEqual([]);

    const angry = oracleLevel(1);
    theOracle(angry.state, angry.level)[0]!.c.monster!.peaceful = false;
    expect(msgs(enter(angry.state, angry.level))).toEqual([
      { key: 'oracle.in_delphi', params: { name: `@${role}` } },
    ]);

    const gone = oracleLevel(1);
    delete gone.state.entities[String(theOracle(gone.state, gone.level)[0]!.id)];
    const gd = delphiOf(gone.level);
    expect(msgs(enter(gone.state, gone.level, gd))).toEqual([]);
    expect(gone.level.rooms[gd]?.type).toBeUndefined(); // no longer Delphi either
  });

  test('hitting the Oracle: magic missiles, unless the hero has magic resistance', () => {
    const { state, level } = oracleLevel(2);
    const oracle = theOracle(state, level)[0]!;
    const target = {
      id: oracle.id,
      def: engine.registry.monster(ORACLE),
      level: 12,
      pos: oracle.c.pos!,
      mcan: false,
    };
    const hero = getPlayer(state);
    hero.c.hp = { cur: 500, max: 500 };
    const hit = run(state, (ctx) => passive(ctx, target, false, true, null, 'weapon'));
    expect(msgs(hit).map((m) => m.key)).toContain('passive.magm_hit');
    // d(m_lev + 1, 4) = 13..52
    expect(500 - hero.c.hp.cur).toBeGreaterThanOrEqual(13);
    expect(500 - hero.c.hp.cur).toBeLessThanOrEqual(52);
    setIntrinsic(hero, P.ANTIMAGIC, true);
    const cur = hero.c.hp.cur;
    const miss = run(state, (ctx) => passive(ctx, target, true, true, null, 'weapon'));
    expect(msgs(miss).map((m) => m.key)).toContain('passive.magm_miss');
    expect(hero.c.hp.cur).toBe(cur);
  });
});

describe('an up-branch chained to the Oracle', () => {
  test('wiz:where says "Stairs up to" on the level below the Oracle', () => {
    const e = createEngine([vanillaMod, probeMod, upMod]);
    const { state } = e.newGame({ seed: 3 });
    const main = state.dungeons[0]!;
    const oracle = main.special.find((s) => s.id === 'nh:oracle')!;
    expect(main.branches.find((b) => b.to === 'tt:up')).toEqual({
      to: 'tt:up',
      dlevel: oracle.dlevel + 1,
      dir: 'up',
    });
    probe.fn = (ctx) => printDungeon(ctx);
    const events = e.step(state, { type: 'mod', action: 'op:run' }).events;
    expect(msgs(events)).toContainEqual({
      key: 'wiz.where.branch_up',
      params: { dungeon: '@tt', depth: oracle.dlevel + 1 },
    });
  });
});
