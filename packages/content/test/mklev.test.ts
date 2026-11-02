// Generation of milestone 5b: appearance shuffles, traps per room (mktrap), boxes and their
// contents (mkbox_cnts) and erosion of new objects (mkobj_erosions).
import {
  contents,
  createEngine,
  getLevel,
  isPlainFloor,
  type Ctx,
  type DefId,
  type GameState,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import {
  BOX_PROBS,
  DUNGEON_BOTTOM,
  TRAP,
  holeDestination,
  mkboxCnts,
  mkobj,
  mksobj,
  mktrap,
  traptypeRnd,
  vanillaMod,
} from '../src/index';
import { bareState, ctxFor, defs } from './itemHelpers';

// A probe mod: its action runs a callback with a real Ctx (no time passes).
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
function withCtx(state: GameState, fn: (ctx: Ctx) => void): void {
  probe.fn = fn;
  engine.step(state, { type: 'mod', action: 'probe:run' });
}

const SHUFFLED_CLASSES = ['amulet', 'potion', 'ring', 'scroll', 'spellbook', 'wand'];

describe('appearance shuffle', () => {
  test('rings, amulets, wands and spellbooks are shuffled at game start, per seed', () => {
    const a = engine.newGame({ seed: 31 }).state.appearances;
    const b = engine.newGame({ seed: 31 }).state.appearances;
    const c = engine.newGame({ seed: 32 }).state.appearances;
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    for (const cls of SHUFFLED_CLASSES) {
      const objs = defs.objects.filter((o) => o.class === cls && o.descKey === undefined);
      expect(objs.length).toBeGreaterThan(0);
      const apps = objs.map((o) => a[o.id]);
      for (const ap of apps) expect(ap).toBeDefined();
      expect(new Set(apps).size).toBe(apps.length); // distinct within the class
    }
    // fixed descriptions are not shuffled
    expect(a['nh:fake_amulet_of_yendor']).toBeUndefined();
    expect(a['nh:spellbook_of_blank_paper']).toBeUndefined();
  });
});

describe('mktrap', () => {
  const kinds = (lvl: number, n = 4000): Map<string, number> => {
    const ctx = ctxFor(bareState(41 + lvl));
    const out = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      const k = traptypeRnd(ctx, lvl) ?? 'none';
      out.set(k, (out.get(k) ?? 0) + 1);
    }
    return out;
  };

  test('trap kinds respect the level difficulty; holes are rare', () => {
    const shallow = kinds(1);
    expect(shallow.has(TRAP.sleepGas)).toBe(false);
    const deeper = kinds(2);
    expect(deeper.has(TRAP.sleepGas)).toBe(true);
    for (const k of deeper.keys()) expect(['none', ...Object.values(TRAP)]).toContain(k);
    // 1 in 25 each; holes are kept only 1 time in 7
    const n = (k: string) => deeper.get(k) ?? 0;
    expect(n(TRAP.trapdoor)).toBeGreaterThan(4 * n(TRAP.hole));
    expect(n(TRAP.hole)).toBeGreaterThan(0);
  });

  test('traps go on free plain floor of the room only; no holes at the bottom', () => {
    for (const depth of [1, 3, DUNGEON_BOTTOM]) {
      const { state } = engine.newGame({ seed: 50 + depth });
      const seen = new Set<string>();
      withCtx(state, (ctx) => {
        const level = getLevel(ctx.state);
        level.depth = depth;
        const room = level.rooms[0]!;
        for (let i = 0; i < 300; i++) {
          level.traps = [];
          mktrap(ctx, level, room);
          for (const t of level.traps) {
            seen.add(t.def);
            expect(t.x).toBeGreaterThanOrEqual(room.lx);
            expect(t.x).toBeLessThanOrEqual(room.hx);
            expect(t.y).toBeGreaterThanOrEqual(room.ly);
            expect(t.y).toBeLessThanOrEqual(room.hy);
            expect(isPlainFloor(ctx.defs, level, t.x, t.y)).toBe(true);
          }
        }
        level.traps = [];
      });
      if (depth === 1) expect(seen.has(TRAP.sleepGas)).toBe(false);
      if (depth === 3) {
        expect(seen.has(TRAP.sleepGas)).toBe(true);
        expect(seen.has(TRAP.trapdoor)).toBe(true);
      }
      if (depth === DUNGEON_BOTTOM) {
        expect(seen.has(TRAP.trapdoor)).toBe(false);
        expect(seen.has(TRAP.hole)).toBe(false);
        expect(seen.has(TRAP.rock)).toBe(true);
      }
    }
  });

  test('a new level has traps only on plain floor inside rooms', () => {
    let traps = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { state } = engine.newGame({ seed });
      const level = getLevel(state);
      for (const t of level.traps) {
        traps++;
        expect(isPlainFloor(engine.registry, level, t.x, t.y)).toBe(true);
        expect(
          level.rooms.some((r) => t.x >= r.lx && t.x <= r.hx && t.y >= r.ly && t.y <= r.hy),
        ).toBe(true);
        expect(t.def).not.toBe(TRAP.sleepGas);
      }
    }
    expect(traps).toBeGreaterThan(20);
  });

  test('holes and trap doors lead no deeper than the dungeon bottom', () => {
    const ctx = ctxFor(bareState(3));
    for (let i = 0; i < 200; i++) {
      expect(holeDestination(ctx, DUNGEON_BOTTOM - 1)).toBe(DUNGEON_BOTTOM);
      const d = holeDestination(ctx, DUNGEON_BOTTOM - 3);
      expect(d).toBeGreaterThan(DUNGEON_BOTTOM - 3);
      expect(d).toBeLessThanOrEqual(DUNGEON_BOTTOM);
    }
    // below the bottom (reached by stairs) a hole leads one level down
    expect(holeDestination(ctx, DUNGEON_BOTTOM + 4)).toBe(DUNGEON_BOTTOM + 5);
  });
});

describe('mkbox_cnts', () => {
  const fill = (def: string, locked: boolean, seed: number, inMklev = true) => {
    const state = bareState(seed);
    const ctx = ctxFor(state);
    const counts: number[] = [];
    const classes = new Set<string>();
    for (let i = 0; i < 600; i++) {
      const box = mksobj(ctx, defs.object(def as DefId), { init: false });
      const it = state.entities[String(box)]!.c.item!;
      if (locked) it.locked = true;
      mkboxCnts(ctx, box, { level: state.currentLevel, inMklev });
      const inside = contents(state, box);
      counts.push(inside.length);
      for (const e of inside) {
        const d = defs.object(e.def);
        classes.add(d.class);
        expect(d.container).toBeUndefined(); // no nested boxes
        if (d.class === 'coin') expect(e.c.item!.quantity).toBeLessThanOrEqual(3 * 75);
      }
      ctx.remove(box);
    }
    return { max: Math.max(...counts), min: Math.min(...counts), classes };
  };

  test('boxes hold rn2(n + 1) objects: chest 7 locked / 5, large box 5 / 3', () => {
    expect(fill('nh:chest', true, 1)).toMatchObject({ min: 0, max: 7 });
    expect(fill('nh:chest', false, 2)).toMatchObject({ min: 0, max: 5 });
    expect(fill('nh:large_box', true, 3)).toMatchObject({ min: 0, max: 5 });
    const big = fill('nh:large_box', false, 4);
    expect(big).toMatchObject({ min: 0, max: 3 });
    const boxClasses = BOX_PROBS.flatMap((p) => (p.cls ? [p.cls] : []));
    for (const c of fill('nh:chest', true, 5).classes) expect(boxClasses).toContain(c);
  });

  test('bags hold at most one object; the starting inventory sack is empty', () => {
    expect(fill('nh:bag_of_holding', false, 6)).toMatchObject({ min: 0, max: 1 });
    expect(fill('nh:sack', false, 7)).toMatchObject({ min: 0, max: 1 });
    expect(fill('nh:sack', false, 8, false)).toMatchObject({ min: 0, max: 0 }); // turn 1
  });

  test('new levels get large boxes and chests with contents', () => {
    let boxes = 0;
    let filled = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const { state } = engine.newGame({ seed });
      for (const e of Object.values(state.entities)) {
        if (e.def !== 'nh:large_box' && e.def !== 'nh:chest') continue;
        if (!e.c.pos) continue;
        boxes++;
        const n = contents(state, e.id).length;
        expect(n).toBeLessThanOrEqual(e.def === 'nh:chest' ? 7 : 5);
        if (n > 0) filled++;
      }
    }
    expect(boxes).toBeGreaterThan(10);
    expect(filled).toBeGreaterThan(0);
  });
});

describe('mkobj_erosions', () => {
  test('a few new weapons are eroded or erodeproof; never the starting kit', () => {
    const state = bareState(9);
    const ctx = ctxFor(state);
    let eroded = 0;
    let proof = 0;
    for (let i = 0; i < 6000; i++) {
      const id = mkobj(ctx, 'weapon');
      const it = state.entities[String(id!)]!.c.item!;
      if (it.erosion) eroded++;
      if (it.erodeproof) proof++;
      expect(it.erosion && it.erodeproof).toBeFalsy();
    }
    // about 1/100 erodeproof; non-proof iron/wood weapons erode about 1/80
    expect(proof).toBeGreaterThan(30);
    expect(proof).toBeLessThan(100);
    expect(eroded).toBeGreaterThan(20);
    for (let seed = 1; seed <= 150; seed++) {
      const { state: s } = engine.newGame({ seed });
      for (const e of Object.values(s.entities)) {
        if (e.c.item?.carriedBy !== s.playerId) continue;
        expect(e.c.item.erosion).toBeUndefined();
        expect(e.c.item.erodeproof).toBeUndefined();
      }
    }
  });
});
