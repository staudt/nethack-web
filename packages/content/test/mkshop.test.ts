// Milestone 6b3 step 6: random dungeon shops. An ordinary level below the first gets a shop
// when it has enough rooms (`rn2(depth) < 3` of the time): the first ordinary room with no
// stairs and exactly one door, lit to its walls, its type rolled over the shop probabilities
// (a big room is never a wand or book shop), stocked with its shopkeeper by the step-1 hook.
import {
  cellIndex,
  createEngine,
  getLevel,
  sortedIds,
  type Ctx,
  type GameState,
  type Level,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import {
  SHOPKEEPER,
  SHTYPES,
  eshkOf,
  mkSpecialRoom,
  shopDoors,
  shopType,
  vanillaMod,
} from '../src/index';

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

const top = (level: Level): Level['rooms'] => level.rooms.filter((r) => r.parent === undefined);
const holds = (r: Level['rooms'][number], p: { x: number; y: number } | null | undefined) =>
  !!p && p.x >= r.lx && p.x <= r.hx && p.y >= r.ly && p.y <= r.hy;
const hasStairs = (level: Level, r: Level['rooms'][number]): boolean =>
  holds(r, level.up) || holds(r, level.down) || holds(r, level.branch?.pos);

// main-dungeon levels 2..5 of a number of games, made by walking down
const levels: Level[] = [];
const firsts: Level[] = [];
const shkRooms = new Map<Level, number[]>();
for (let seed = 1; seed <= 30; seed++) {
  const { state } = engine.newGame({ seed });
  firsts.push(getLevel(state));
  for (let dlevel = 2; dlevel <= 5; dlevel++) {
    withCtx(state, (ctx) => ctx.goToLevel({ dungeon: 'nh:main', dlevel }, 'up'));
    const lv = getLevel(state);
    // the shopkeepers of this level, for the checks below
    const shks = sortedIds(state).filter(
      (id) => state.entities[String(id)]?.c.pos?.level === lv.id && eshkOf({ state }, id),
    );
    levels.push(lv);
    shkRooms.set(
      lv,
      shks.map((id) => eshkOf({ state }, id)?.shoproom ?? -1),
    );
    for (const id of shks)
      expect(state.entities[String(id)]?.def, `seed ${seed} dlevel ${dlevel}`).toBe(SHOPKEEPER);
  }
}

describe('random dungeon shops', () => {
  test('never on the first level', () => {
    for (const lv of firsts) expect(lv.rooms.filter((r) => r.type !== undefined)).toEqual([]);
  });

  test('the first room with one door and no stairs, lit, typed, with its shopkeeper', () => {
    let shops = 0;
    for (const lv of levels) {
      const typed = lv.rooms.flatMap((r, i) => (r.type !== undefined ? [i] : []));
      expect(typed.length).toBeLessThanOrEqual(1);
      const i = typed[0];
      const rooms = top(lv).length;
      const enough = rooms >= (lv.branch ? 4 : 3);
      if (i === undefined) {
        // depth 2 and 3 always roll (rn2(depth) < 3): no shop means no room could be one
        if (lv.depth <= 3 && enough)
          for (let j = 0; j < lv.rooms.length; j++) {
            const o = lv.rooms[j];
            if (!o || o.parent !== undefined || hasStairs(lv, o)) continue;
            if (shopDoors(defs, lv, j).length !== 1) continue;
            expect(o.hx - o.lx <= 1 || o.hy - o.ly <= 1, 'only a narrow room').toBe(true);
          }
        continue;
      }
      shops++;
      expect(enough).toBe(true);
      const r = lv.rooms[i];
      if (!r) throw new Error('no room');
      expect(shopType(r.type)).not.toBeNull();
      expect(hasStairs(lv, r)).toBe(false);
      expect(shopDoors(defs, lv, i)).toHaveLength(1);
      // no earlier ordinary room was eligible on stairs and doors alone (the shape rule may
      // pass over one more)
      for (let j = 0; j < i; j++) {
        const o = lv.rooms[j];
        if (!o || o.parent !== undefined) continue;
        const eligible = !hasStairs(lv, o) && shopDoors(defs, lv, j).length === 1;
        if (eligible) expect(o.hx - o.lx <= 1 || o.hy - o.ly <= 1, 'a narrow room').toBe(true);
      }
      // lit, walls included
      expect(r.lit).toBe(true);
      for (let x = r.lx - 1; x <= r.hx + 1; x++)
        for (let y = r.ly - 1; y <= r.hy + 1; y++) expect(lv.lit[cellIndex(lv, x, y)]).toBe(1);
      // a big room is no wand or book shop
      if ((r.hx - r.lx + 1) * (r.hy - r.ly + 1) > 20)
        expect(['nh:wand_shop', 'nh:book_shop']).not.toContain(r.type);
      // stocked: one shopkeeper for it
      expect(shkRooms.get(lv)).toEqual([i]);
    }
    expect(shops).toBeGreaterThan(levels.length / 4);
  });

  test('several shop types come up, never the lighting shop', () => {
    const types = new Set(levels.flatMap((lv) => lv.rooms.flatMap((r) => r.type ?? [])));
    expect(types.has('nh:shop')).toBe(true);
    expect(types.size).toBeGreaterThanOrEqual(3);
    expect(types.has('nh:candle_shop')).toBe(false);
  });

  test('too few rooms or the first level: no shop and no roll', () => {
    const sample = levels[0];
    if (!sample) throw new Error('no level');
    const room = (lx: number): Level['rooms'][number] => ({
      lx,
      ly: 2,
      hx: lx + 3,
      hy: 4,
      lit: false,
    });
    const branch: Level['branch'] = {
      pos: { x: 0, y: 0 },
      to: { dungeon: 'nh:mines', dlevel: 1 },
      dir: 'down',
    };
    const cases: [Partial<Level>, boolean][] = [
      [{ depth: 1, rooms: [room(2), room(10), room(20), room(30)] }, false],
      [{ depth: 3, rooms: [room(2), room(10)] }, false],
      [{ depth: 3, rooms: [room(2), room(10), room(20)], branch }, false], // 4 on a branch level
      [{ depth: 3, rooms: [room(2), room(10), room(20)], branch: null }, true], // the roll
    ];
    for (const [over, rolls] of cases) {
      const { state } = engine.newGame({ seed: 1 });
      const lv: Level = { ...structuredClone(sample), ...over };
      let before = '';
      let after = '';
      withCtx(state, (ctx) => {
        before = JSON.stringify(ctx.state.rng.core);
        mkSpecialRoom(ctx, lv);
        after = JSON.stringify(ctx.state.rng.core);
      });
      // (the made-up rooms have no doors, so no shop even when the roll is made)
      expect(lv.rooms.every((r) => r.type === undefined)).toBe(true);
      expect(after !== before).toBe(rolls);
    }
    expect(SHTYPES.reduce((a, s) => a + s.prob, 0)).toBe(100);
  });
});
