// m23 step 2: Vlad's Tower and the endgame's place in the dungeon. The `nh:vlad` dungeon (three
// levels entered at the bottom by stairs up from Gehennom 9-13) and `nh:planes` (six levels above
// DL1, unreachable stand-ins until m23b); tower1-3 built as their scripts say (Vlad with the
// Candelabrum, the waiting vampire lords, the chests of candles, the ladders, tower3's branch);
// the Gehennom end of the branch on every special level that can hold it; the Candelabrum of
// Invocation (attaching candles, lighting it, its light and burn, its name and weight, the wish,
// the container refusal). Outcomes over searched seeds, never a lucky one.
// ref: dat/dungeon.lua; dat/tower1.lua, tower2.lua, tower3.lua; src/makemon.c makemon();
// src/apply.c use_candelabrum(), use_candle(), snuff_candle(); src/light.c candle_light_range();
// src/timeout.c begin_burn(), burn_object(); src/sp_lev.c create_monster(); src/objnam.c
// doname_base(), readobjnam(); src/mkobj.c weight(); src/pickup.c in_container(); src/mon.c
// pickvampshape(); src/muse.c mon_escape()
import {
  createEngine,
  createRng,
  getLevel,
  getPlayer,
  inventoryOf,
  levelDefPos,
  levelStairs,
  rollDungeons,
  seedRng,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type GameState,
  type Level,
  type LevelDef,
  type Mod,
  type Pos,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import { CANDELABRUM, isUniqueRelic, monHasSpecial } from '../src/uhave';
import { chamOf } from '../src/chamstate';
import { emin } from '../src/emin';
import { A_NONE } from '../src/aligntyp';
import { makemon } from '../src/generation';
import { LADDER_SPOTS } from '../src/ladder';
import {
  GEHENNOM,
  GEHENNOM_SPECIALS as G,
  PLANES,
  PLANE_LEVELS,
  TOWER_LEVELS,
  VLAD,
  inVladsTower,
  levelFlags,
  nonDiggable,
  nonPasswall,
} from '../src/levelflags';
import { objLights } from '../src/light';
import { weight } from '../src/items';
import { mstratOf } from '../src/mstate';
import { pickvampshape } from '../src/newcham';
import { objResists } from '../src/material';
import { createMonster, mapToLevel } from '../src/sp_lev';
import { T, terrainIdAt } from '../src/terrain';
import { TOWER1, TOWER2, TOWER3 } from '../src/tower';
import { mkWished } from '../src/wish';
import { readobjnam, wishNames } from '../src/objnam_read';
import { messagesEn } from '../src/messages.en';
import { defs, levelSetup, render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'vt',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'vt:run',
      labelKey: 'vt',
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
const textOf = (r: StepResult): string[] =>
  r.events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );
const run = (state: GameState, fn: (ctx: Ctx) => void): string[] => {
  probe.fn = fn;
  return textOf(engine.step(state, { type: 'mod', action: 'vt:run' as DefId }));
};
const ter = (l: Level, p: Pos): DefId => terrainIdAt(l, p.x, p.y)!;
const at = (def: LevelDef, l: Level, x: number, y: number): Pos => mapToLevel(def, l, x, y);
const monsOn = (state: GameState, l: Level): Entity[] =>
  Object.values(state.entities).filter(
    (e) => e.c.monster && e.c.pos?.level === l.id && e.id !== state.playerId,
  );
const monAt = (state: GameState, l: Level, p: Pos): Entity | undefined =>
  monsOn(state, l).find((e) => e.c.pos!.x === p.x && e.c.pos!.y === p.y);
const itemsAt = (state: GameState, l: Level, p: Pos): Entity[] =>
  Object.values(state.entities).filter(
    (e) => e.c.item && e.c.pos?.level === l.id && e.c.pos.x === p.x && e.c.pos.y === p.y,
  );
const inside = (state: GameState, box: Entity): Entity[] =>
  Object.values(state.entities).filter((e) => e.c.item?.containedIn === box.id);

/** The hero arrives on Vlad's Tower level `dlevel` at map spot `spot` of `def`. */
function toTower(seed: number, dlevel: number, def: LevelDef, spot: [number, number]): GameState {
  const { state } = engine.newGame({ seed });
  getPlayer(state).c.hp = { cur: 999, max: 999 };
  const p = levelDefPos(def, 80, 21, spot[0], spot[1], undefined, 'test');
  run(state, (ctx) => ctx.goToLevel({ dungeon: VLAD, dlevel }, p));
  return state;
}

const SEEDS = [1, 2, 3, 4, 5, 6];

describe('the layout', () => {
  test("Vlad's Tower above Gehennom 9-13, the Planes above DL1, over seeds", () => {
    const branchLevels = new Set<number>();
    for (let seed = 1; seed <= 200; seed++) {
      const layout = rollDungeons(createRng(seedRng(seed)), engine.registry.dungeons);
      const main = layout.find((d) => d.id === 'nh:main')!;
      const hell = layout.find((d) => d.id === GEHENNOM)!;
      const vlad = layout.find((d) => d.id === VLAD)!;
      const planes = layout.find((d) => d.id === PLANES)!;
      // Vlad's Tower: three levels, entered at its bottom from Gehennom 9-13 by stairs up
      const b = hell.branches.find((x) => x.to === VLAD)!;
      expect(b.dir).toBe('up');
      expect(b.stairs).toBeUndefined();
      expect([9, 10, 11, 12, 13]).toContain(b.dlevel);
      branchLevels.add(b.dlevel);
      expect(vlad).toMatchObject({ levels: 3, entry: 3 });
      // the branch level's depth, one up, less the two levels above the entry
      expect(vlad.depthStart).toBe(hell.depthStart + b.dlevel - 1 - 1 - 2);
      expect(vlad.special).toEqual([
        { id: TOWER_LEVELS.tower1, dlevel: 1 },
        { id: TOWER_LEVELS.tower2, dlevel: 2 },
        { id: TOWER_LEVELS.tower3, dlevel: 3 },
      ]);
      // the Planes: six levels above DL1 (Astral -4 .. Earth 0, the dummy 1), entered on Earth
      const pb = main.branches.find((x) => x.to === PLANES)!;
      expect(pb).toEqual({ to: PLANES, dlevel: 1, dir: 'up', stairs: 'child' });
      expect(planes).toMatchObject({ levels: 6, entry: 5, depthStart: -4 });
      expect(planes.special.map((s) => s.id)).toEqual(Object.values(PLANE_LEVELS));
      expect(planes.special.map((s) => s.dlevel)).toEqual([1, 2, 3, 4, 5, 6]);
    }
    expect([...branchLevels].sort((a, b) => a - b)).toEqual([9, 10, 11, 12, 13]);
  });

  test('DL1 keeps only its up stairs, out of the dungeon; no stairs lead to the Planes', () => {
    const { state } = engine.newGame({ seed: 3 });
    const l = getLevel(state);
    expect(levelStairs(state, { dungeon: 'nh:main', dlevel: 1 })).toEqual({ up: true, down: true });
    expect(l.up).not.toBeNull();
    expect(l.branch === null || l.branch.to.dungeon !== PLANES).toBe(true);
  });

  test('the Planes have no stairs at all; the Astral Plane is a stand-in (lit floor) until step 8', () => {
    const { state } = engine.newGame({ seed: 4 });
    run(state, (ctx) => ctx.goToLevel({ dungeon: PLANES, dlevel: 5 }, 'random'));
    const earth = getLevel(state);
    expect(earth.def).toBe(PLANE_LEVELS.earth);
    expect(earth.depth).toBe(0);
    expect([earth.up, earth.down, earth.branch]).toEqual([null, null, null]);
    run(state, (ctx) => ctx.goToLevel({ dungeon: PLANES, dlevel: 1 }, 'random'));
    const l = getLevel(state);
    expect(l.depth).toBe(-4);
    expect([l.up, l.down, l.branch]).toEqual([null, null, null]);
    expect(l.cells.every((c) => l.palette[c] === T.floor)).toBe(true);
  });
});

describe('the Gehennom end of the branch', () => {
  test('the stairs up to the Tower on every special level that can hold them', () => {
    // a seed whose branch level is each such special level (Baalzebub's lair on 9, Orcus Town
    // and the Wizard's Tower levels on 10-13) and one where it is an ordinary level
    const want = [G.baalz, G.orcus, G.wizard1, G.wizard2, G.wizard3, 'ordinary'];
    const found = new Map<string, number>();
    for (let seed = 1; seed <= 400 && found.size < want.length; seed++) {
      const layout = rollDungeons(createRng(seedRng(seed)), engine.registry.dungeons);
      const hell = layout.find((d) => d.id === GEHENNOM)!;
      const dl = hell.branches.find((x) => x.to === VLAD)!.dlevel;
      const sp = hell.special.find((s) => s.dlevel === dl)?.id ?? 'ordinary';
      if (want.includes(sp) && !found.has(sp)) found.set(sp, seed);
    }
    expect([...found.keys()].sort()).toEqual([...want].sort());
    for (const [sp, seed] of found) {
      const { state } = engine.newGame({ seed });
      const hell = state.dungeons.find((d) => d.id === GEHENNOM)!;
      const dlevel = hell.branches.find((x) => x.to === VLAD)!.dlevel;
      run(state, (ctx) => ctx.goToLevel({ dungeon: GEHENNOM, dlevel }, 'random'));
      const l = getLevel(state);
      expect(
        sp === 'ordinary' || hell.special.some((s) => s.id === sp && s.dlevel === l.dlevel),
      ).toBe(true);
      expect(l.branch?.dir).toBe('up');
      expect(l.branch?.to).toEqual({ dungeon: VLAD, dlevel: 3 });
      expect(ter(l, l.branch!.pos)).toBe(T.stairs_up);
      // up the branch stairs onto tower3's branch spot, its stairs down
      getPlayer(state).c.pos = { level: l.id, ...l.branch!.pos };
      engine.step(state, { type: 'mod', action: 'nh:up' as DefId });
      const t3 = getLevel(state);
      expect(t3.def).toBe(TOWER3.id);
      expect(t3.branch?.pos).toEqual(at(TOWER3, t3, 2, 5));
      expect(getPlayer(state).c.pos).toEqual({ level: t3.id, ...at(TOWER3, t3, 2, 5) });
      expect(ter(t3, t3.branch!.pos)).toBe(T.stairs_down);
    }
  });
});

describe('the Tower levels', () => {
  test('tower1: Vlad on his throne with the Candelabrum, his court, the brides, six chests', () => {
    for (const seed of SEEDS) {
      const state = toTower(seed, 1, TOWER1, [11, 5]);
      const l = getLevel(state);
      expect(l.def).toBe(TOWER1.id);
      expect(inVladsTower(state, l)).toBe(true);
      expect([l.up, l.down, l.branch]).toEqual([null, null, null]);
      expect(ter(l, at(TOWER1, l, 11, 5))).toBe(T.ladder_down);
      expect(ter(l, at(TOWER1, l, 6, 5))).toBe(T.throne);
      expect(ter(l, at(TOWER1, l, 10, 5))).toBe(T.door_locked);
      expect(ter(l, at(TOWER1, l, 3, 4))).toBe(T.door_closed);
      // Vlad, himself, holding the Candelabrum with no candles, unlit and uncursed
      const vlad = monAt(state, l, at(TOWER1, l, 6, 5))!;
      expect(vlad.def).toBe('nh:vlad_the_impaler');
      const menorah = inventoryOf(state, vlad.id).filter((o) => o.def === CANDELABRUM);
      expect(menorah).toHaveLength(1);
      expect(menorah[0]!.c.item).toMatchObject({ spe: 0, age: 0, buc: 'uncursed' });
      expect(menorah[0]!.c.item!.lit).toBeUndefined();
      expect(mstratOf({ state }, vlad.id).waitForU).toBe(true); // M3_WAITFORU
      // the niches: three V, three waiting vampire lords in vampire form; chests everywhere
      const niches = [
        [3, 1],
        [3, 9],
        [7, 1],
        [7, 9],
        [11, 1],
        [11, 9],
      ].map(([x, y]) => at(TOWER1, l, x!, y!));
      // (a "V" may be born shifted into a bat, fog cloud or wolf; the waiting ones may not)
      const ms = niches.map((p) => monAt(state, l, p));
      expect(ms.every((m) => m !== undefined)).toBe(true);
      const lords = ms.filter((m) => m && mstratOf({ state }, m.id).waitForU);
      expect(lords.length).toBeGreaterThanOrEqual(3);
      for (const m of lords) expect(['nh:vampire_lord', 'nh:vlad_the_impaler']).toContain(m!.def);
      const chests = [...niches, at(TOWER1, l, 7, 5)].map((p) =>
        itemsAt(state, l, p).filter((o) => o.def === 'nh:chest'),
      );
      expect(chests.every((c) => c.length === 1)).toBe(true);
      const candles = chests.flatMap((c) => inside(state, c[0]!));
      const wax = candles.filter((o) => o.def === 'nh:wax_candle');
      const tallow = candles.filter((o) => o.def === 'nh:tallow_candle');
      expect(wax).toHaveLength(1);
      expect(tallow).toHaveLength(1);
      for (const c of [wax[0]!, tallow[0]!]) {
        expect(c.c.item!.quantity).toBeGreaterThanOrEqual(4);
        expect(c.c.item!.quantity).toBeLessThanOrEqual(8);
        // alone in its chest
        expect(inside(state, state.entities[String(c.c.item!.containedIn)]!)).toHaveLength(1);
      }
      // flags: no teleport, hard floor, nothing dug; the stone around the map not passable
      const f = levelFlags({ defs: engine.registry, state }, l);
      expect(f).toMatchObject({ noteleport: true, hardfloor: true, maze: true });
      const corner = at(TOWER1, l, 0, 0);
      expect(nonDiggable({ defs: engine.registry, state }, l, corner.x, corner.y)).toBe(true);
      expect(nonPasswall({ defs: engine.registry, state }, l, corner.x, corner.y)).toBe(false);
      expect(nonPasswall({ defs: engine.registry, state }, l, corner.x - 1, corner.y)).toBe(true);
    }
  });

  test('tower2: its niches hold the demons, pups, wolf, chests, boots, mail and a spellbook', () => {
    const books = [
      'invisibility',
      'cone_of_cold',
      'create_familiar',
      'clairvoyance',
      'charm_monster',
      'stone_to_flesh',
      'polymorph',
    ].map((b) => `nh:spellbook_of_${b}`);
    const place = [
      [3, 1],
      [7, 1],
      [11, 1],
      [1, 3],
      [13, 3],
      [1, 7],
      [13, 7],
      [3, 9],
      [7, 9],
      [11, 9],
    ];
    for (const seed of SEEDS) {
      const state = toTower(seed, 2, TOWER2, [11, 5]);
      const l = getLevel(state);
      expect(l.def).toBe(TOWER2.id);
      expect(ter(l, at(TOWER2, l, 11, 5))).toBe(T.ladder_up);
      expect(ter(l, at(TOWER2, l, 3, 7))).toBe(T.ladder_down);
      const spots = place.map(([x, y]) => at(TOWER2, l, x!, y!));
      const things = spots.map((p) => ({
        mon: monAt(state, l, p),
        items: itemsAt(state, l, p),
      }));
      expect(things.filter((t) => t.mon?.def === 'nh:hell_hound_pup')).toHaveLength(2);
      expect(things.filter((t) => t.mon?.def === 'nh:winter_wolf')).toHaveLength(1);
      const has = (id: string): number =>
        things.filter((t) => t.items.some((o) => o.def === id)).length;
      expect(has('nh:water_walking_boots')).toBe(1);
      expect(has('nh:crystal_plate_mail')).toBe(1);
      expect(books.reduce((n, b) => n + has(b), 0)).toBe(1);
      const chestStuff = things
        .flatMap((t) => t.items.filter((o) => o.def === 'nh:chest'))
        .map((c) => inside(state, c).map((o) => o.def));
      expect(chestStuff.sort()).toEqual([
        ['nh:amulet_of_life_saving'],
        ['nh:amulet_of_strangulation'],
      ]);
    }
  });

  test('tower3: the branch stairs down behind the locked door, the loot on its traps', () => {
    for (const seed of SEEDS) {
      const state = toTower(seed, 3, TOWER3, [5, 7]);
      const l = getLevel(state);
      expect(l.def).toBe(TOWER3.id);
      expect(l.up).toBeNull();
      expect(l.down).toBeNull();
      expect(l.branch).toMatchObject({ pos: at(TOWER3, l, 2, 5), dir: 'down' });
      expect(l.branch?.to.dungeon).toBe(GEHENNOM);
      expect(ter(l, at(TOWER3, l, 2, 5))).toBe(T.stairs_down);
      expect(ter(l, at(TOWER3, l, 5, 7))).toBe(T.ladder_up);
      expect(ter(l, at(TOWER3, l, 14, 5))).toBe(T.door_locked);
      for (const [id, x, y] of [
        ['nh:long_sword', 3, 3],
        ['nh:lock_pick', 5, 1],
        ['nh:elven_cloak', 9, 1],
        ['nh:blindfold', 13, 1],
      ] as const) {
        const p = at(TOWER3, l, x, y);
        expect(itemsAt(state, l, p).some((o) => o.def === id)).toBe(true);
        expect(l.traps.some((t) => t.x === p.x && t.y === p.y)).toBe(true);
      }
      // nine monsters at least: the dragon (or what a genocide left), two by the door, six more
      expect(monsOn(state, l).length).toBeGreaterThanOrEqual(9);
    }
  });

  test('the ladders join the three levels both ways', () => {
    const state = toTower(2, 3, TOWER3, [5, 7]);
    const climb = (dir: 'up' | 'down'): Level => {
      engine.step(state, { type: 'mod', action: `nh:${dir}` as DefId });
      return getLevel(state);
    };
    const hero = (): Pos => getPlayer(state).c.pos!;
    let l = climb('up');
    expect(l.def).toBe(TOWER2.id);
    expect(hero()).toMatchObject(at(TOWER2, l, ...LADDER_SPOTS[TOWER2.id]!.down!));
    getPlayer(state).c.pos = { level: l.id, ...at(TOWER2, l, 11, 5) };
    l = climb('up');
    expect(l.def).toBe(TOWER1.id);
    expect(hero()).toMatchObject(at(TOWER1, l, 11, 5));
    l = climb('down');
    expect(l.def).toBe(TOWER2.id);
    expect(hero()).toMatchObject(at(TOWER2, l, 11, 5));
  });
});

describe("des.monster's waiting and align", () => {
  test('a waiting monster waits; a vampire born shifted turns back; align makes a minion', () => {
    const s = levelSetup(['........', '...@....', '........'], 3);
    const shifted = new Set<string>();
    for (let i = 0; i < 12; i++) {
      run(s.state, (ctx) => {
        const level = getLevel(ctx.state);
        const before = new Set(monsOn(ctx.state, level).map((m) => m.id));
        createMonster(
          ctx,
          level,
          { kind: 'monster', id: 'nh:vampire' as DefId, waiting: true },
          {
            id: 'vt:x',
            init: { style: 'rooms' },
          },
        );
        const m = monsOn(ctx.state, level).find((e) => !before.has(e.id))!;
        expect(m.def).toBe('nh:vampire');
        expect(chamOf(ctx, m.id)).toBe('nh:vampire');
        expect(mstratOf(ctx, m.id).waitForU).toBe(true);
        shifted.add(m.def);
        ctx.remove(m.id);
      });
    }
    expect([...shifted]).toEqual(['nh:vampire']);
    // align (m23 step 3): a roaming minion of that god, peaceful unless the entry says not
    run(s.state, (ctx) => {
      const level = getLevel(ctx.state);
      const before = new Set(monsOn(ctx.state, level).map((m) => m.id));
      createMonster(
        ctx,
        level,
        { kind: 'monster', align: 'noalign' },
        { id: 'vt:x', init: { style: 'rooms' } },
      );
      const m = monsOn(ctx.state, level).find((e) => !before.has(e.id))!;
      expect(emin(ctx.state, m.id)).toMatchObject({ minAlign: A_NONE, renegade: false });
      expect(m.c.monster!.peaceful).toBe(true);
    });
  });

  test('Vlad with the Candelabrum keeps his own shape; Vlad without it may shift', () => {
    const s = levelSetup(['........', '...@....', '........'], 5);
    run(s.state, (ctx) => {
      const id = makemon(ctx, defs.monster('nh:vlad_the_impaler' as DefId), { x: 6, y: 1 }, {})!;
      const vlad = ctx.state.entities[String(id)]!;
      expect(monHasSpecial(ctx.state, id)).toBe(true);
      for (let i = 0; i < 50; i++) expect(pickvampshape(ctx, vlad)).toBe('nh:vlad_the_impaler');
      for (const o of inventoryOf(ctx.state, id)) ctx.remove(o.id);
      expect(monHasSpecial(ctx.state, id)).toBe(false);
      const forms = new Set<string | null>();
      for (let i = 0; i < 50; i++) forms.add(pickvampshape(ctx, vlad));
      expect(forms.size).toBeGreaterThan(1);
    });
  });
});

describe('the Candelabrum of Invocation', () => {
  /** A room with the Candelabrum and `n` wax candles in her pack. */
  function kit(seed: number, n: number, spe = 0) {
    const s = levelSetup(['.......', '...@...', '.......'], seed);
    const menorah = s.carry(CANDELABRUM);
    Object.assign(s.state.entities[String(menorah)]!.c.item!, { spe, age: spe ? 300 : 0 });
    let candles: EntityId | null = null;
    if (n > 0) {
      candles = s.carry('nh:wax_candle', { quantity: n });
      Object.assign(s.state.entities[String(candles)]!.c.item!, { age: 400, buc: 'uncursed' });
    }
    return { s, menorah, candles };
  }
  const item = (s: { state: GameState }, id: EntityId) => s.state.entities[String(id)]?.c.item;
  const apply = (s: ReturnType<typeof kit>['s'], id: EntityId): string[] =>
    s.text(s.mod('nh:apply', { item: id }));
  const answer = (s: ReturnType<typeof kit>['s'], value: boolean): string[] => {
    const p = s.state.pendingPrompt!.prompt;
    return s.text(engine.step(s.state, { type: 'answer', promptId: p.id, value }));
  };
  const name = (s: { state: GameState }, id: EntityId): string =>
    render(defs.itemName(s.state, s.state.entities[String(id)]!));

  test('applying candles asks to attach them; seven at most, the rest stay in the pack', () => {
    const { s, menorah, candles } = kit(1, 9);
    expect(apply(s, candles!)).toEqual([]);
    expect(s.state.pendingPrompt?.prompt.key).toBe('menorah.attach_q');
    expect(render({ key: 'menorah.attach_q', params: s.state.pendingPrompt!.prompt.params! })).toBe(
      'Attach your candles to your candelabrum?',
    );
    expect(answer(s, true)).toEqual(['You attach 7 candles to the candelabrum.']);
    expect(item(s, menorah)).toMatchObject({ spe: 7, age: 400 });
    expect(item(s, candles!)?.quantity).toBe(2); // the two left over
    expect(name(s, menorah)).toMatch(/candelabrum \(7 of 7 candles attached\)$/);
    // 10 + 7 tallow-candle weights
    expect(weight(defs, s.state.entities[String(menorah)]!, s.state)).toBe(10 + 7 * 2);
    // full: the candles are only lit now
    expect(apply(s, candles!)).toEqual(["Your candles' flames burn brightly!"]);
  });

  test('a few more on a partly filled one; "no" lights the candles instead', () => {
    const { s, menorah, candles } = kit(2, 3, 4);
    apply(s, candles!);
    expect(answer(s, true)).toEqual([
      'You attach 3 more candles to the candelabrum.',
      'The candelabrum now has seven candles attached.',
    ]);
    expect(item(s, candles!)).toBeUndefined();
    // the least fuel of the candles and its own
    expect(item(s, menorah)).toMatchObject({ spe: 7, age: 300 });
    const k2 = kit(3, 2, 1);
    apply(k2.s, k2.candles!);
    expect(answer(k2.s, false)).toEqual(["Your candles' flames burn brightly!"]);
    expect(item(k2.s, k2.candles!)?.lit).toBe(true);
  });

  test('lighting it: no candles, only some, all seven; snuffing; cursed', () => {
    let k = kit(4, 2);
    expect(apply(k.s, k.menorah)).toEqual([
      'This candelabrum has no candles.',
      'To attach candles, apply them instead of the candelabrum.',
    ]);
    k = kit(4, 0, 3);
    expect(apply(k.s, k.menorah)).toEqual([
      'There are only 3 candles in the candelabrum.',
      'They are lit.  The candelabrum shines dimly.',
      'The candles are being rapidly consumed!',
    ]);
    // away from the vibrating square the fuel is halved, rounding up: 300 -> 150, then the
    // first stretch (150 - 75) is on the timer
    expect(item(k.s, k.menorah)).toMatchObject({ lit: true, age: 75 });
    expect(name(k.s, k.menorah)).toMatch(/\(3 of 7 candles, lit\)$/);
    expect(apply(k.s, k.menorah)).toEqual(['You snuff the candles.']);
    expect(item(k.s, k.menorah)?.lit).toBeUndefined();
    k = kit(5, 0, 7);
    expect(apply(k.s, k.menorah)).toEqual([
      "The candelabrum's candles burn brightly!",
      'The candles are being rapidly consumed!',
    ]);
    k = kit(5, 0, 7);
    item(k.s, k.menorah)!.buc = 'cursed';
    expect(apply(k.s, k.menorah)).toEqual(['The candles flicker for a moment, then die.']);
    expect(item(k.s, k.menorah)?.lit).toBeUndefined();
  });

  test('its light: 2 for 1-3 candles, 3 for 4-6, 4 for 7', () => {
    for (const [spe, r] of [
      [1, 2],
      [3, 2],
      [4, 3],
      [6, 3],
      [7, 4],
    ] as const) {
      const k = kit(6, 0, spe);
      apply(k.s, k.menorah);
      const p = getPlayer(k.s.state).c.pos!;
      expect(objLights(k.s.state)).toContainEqual({ level: p.level, x: p.x, y: p.y, radius: r });
    }
  });

  test('it burns down: getting short, flickering low, the flames die and the candles are gone', () => {
    const k = kit(7, 0, 7);
    item(k.s, k.menorah)!.age = 200; // halved to 100 when lit
    apply(k.s, k.menorah);
    const seen: string[] = [];
    for (let i = 0; i < 120 && item(k.s, k.menorah)?.lit; i++)
      seen.push(...k.s.text(k.s.step({ type: 'wait' })));
    expect(seen).toEqual(
      expect.arrayContaining([
        "Your candelabrum's candles are getting short.",
        "Your candelabrum's candles' flames flicker low!",
        "Your candelabrum's flames die.",
      ]),
    );
    expect(item(k.s, k.menorah)).toMatchObject({ spe: 0 });
    expect(item(k.s, k.menorah)?.lit).toBeUndefined();
  });

  test('a unique relic: no containers, never destroyed; a wish outside wizard mode is a candle', () => {
    expect(isUniqueRelic(CANDELABRUM)).toBe(true);
    const { s, menorah } = kit(8, 0);
    const e = s.state.entities[String(menorah)]!;
    for (let i = 0; i < 20; i++) expect(objResists(s.ctx, e, 0, 0)).toBe(true);
    const spec = readobjnam('Candelabrum of Invocation', wishNames(s.state, defs, messagesEn));
    if (spec === null || spec === 'nothing') throw new Error('not parsed');
    const got = new Set<string>();
    run(s.state, (ctx) => {
      for (let i = 0; i < 40; i++) {
        const id = mkWished(ctx, spec, { wizard: false });
        if (id !== null) got.add(ctx.state.entities[String(id)]!.def);
      }
      const w = mkWished(ctx, spec, { wizard: true });
      expect(ctx.state.entities[String(w)]!.def).toBe(CANDELABRUM);
    });
    expect([...got].sort()).toEqual(['nh:tallow_candle', 'nh:wax_candle']);
  });
});
