// m17 step 8a: the Wizard's Tower (wizard1-3) and the two fake towers. Each level builds on 80x21
// with its tower map in the maze grid, its rooms, ladders, doors, fixed monsters, boards and
// treasures, its stairs outside the tower; climbing every ladder both ways lands on the matching
// ladder (on a level made then or before); the magic portal between the first fake tower and
// wizard3 works both ways, for the hero and for monsters; the tower's boundary keeps monsters,
// objects and arrivals on their side of it. Outcomes are asserted over many seeds.
// ref: dat/wizard1.lua, wizard2.lua, wizard3.lua, fakewiz1.lua, fakewiz2.lua; src/do.c
// goto_level(); src/teleport.c domagicportal(), rloc_pos_ok(), tele_jump_ok(), rloco();
// src/dungeon.c In_W_tower(), Can_rise_up(); src/dog.c migrate_to_level(), mon_arrive()
import {
  createEngine,
  getLevel,
  getPlayer,
  levelIdFor,
  trapAt,
  type Ctx,
  type DefId,
  type Entity,
  type GameState,
  type Level,
  type LevelDef,
  type Mod,
  type Pos,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import { FAKEWIZ1, FAKEWIZ2 } from '../src/fakewiz';
import { isGraveyard } from '../src/graveyard';
import { LADDER_SPOTS } from '../src/ladder';
import {
  GEHENNOM,
  GEHENNOM_SPECIALS as G,
  inWTower,
  levelFlags,
  nonDiggable,
  nonPasswall,
} from '../src/levelflags';
import { migrateToLevel } from '../src/migrate';
import { useDefensive } from '../src/muse';
import { MAGIC_PORTAL, portalDest } from '../src/portal';
import { canRiseUp } from '../src/potion';
import { rlocoPos } from '../src/teleport';
import { dotrap, mintrap, rlocMon } from '../src/trap';
import { mapToLevel } from '../src/sp_lev';
import { P, hasProp } from '../src/props';
import { T, isSdoorId, isWallId, terrainIdAt } from '../src/terrain';
import { BEEHIVE, MORGUE, ZOO } from '../src/zoo';
import { WIZARD1, WIZARD2, WIZARD3 } from '../src/wiztower';
import { addMon } from './helpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'oc',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'oc:run',
      labelKey: 'oc',
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
const run = (state: GameState, fn: (ctx: Ctx) => void): StepResult => {
  probe.fn = fn;
  return engine.step(state, { type: 'mod', action: 'oc:run' as DefId });
};
const keys = (r: StepResult): string[] =>
  r.events.flatMap((e) => (e.type === 'msg' ? [e.key] : []));

const dlevelOf = (state: GameState, sp: DefId): number =>
  state.dungeons.find((x) => x.id === GEHENNOM)!.special.find((s) => s.id === sp)!.dlevel;

/** A sturdy hero, so that the tower's residents cannot kill her during a test. */
function sturdy(state: GameState): void {
  getPlayer(state).c.hp = { cur: 999, max: 999 };
}

/** The hero goes to Gehennom's special level `sp` (at random) and returns it. */
function goTo(state: GameState, sp: DefId): Level {
  const dlevel = dlevelOf(state, sp);
  run(state, (ctx) => {
    ctx.goToLevel({ dungeon: GEHENNOM, dlevel }, 'random');
    made = JSON.parse(JSON.stringify(ctx.state)) as GameState;
  });
  return getLevel(state);
}
/** The game as the last goTo() left it on arrival, before anything moved. */
let made: GameState | null = null;

/**
 * A new game whose hero went to `sp`: the game, the level and the game as it was on arrival
 * (`made`: the level as built, before its monsters moved).
 */
function arrive(seed: number, sp: DefId): { state: GameState; level: Level; made: GameState } {
  const { state } = engine.newGame({ seed });
  sturdy(state);
  const level = goTo(state, sp);
  return { state, level, made: made! };
}

/** A squeaky board, or one of the random traps the script makes after the boards. */
const BOARD_OR_LATER = [
  'nh:squeaky_board',
  'nh:spiked_pit',
  'nh:sleeping_gas_trap',
  'nh:anti_magic_field',
  'nh:magic_trap',
];
const SEEDS = Array.from({ length: 6 }, (_, i) => i + 1);
const ter = (l: Level, p: Pos): DefId => terrainIdAt(l, p.x, p.y)!;
const monAt = (state: GameState, l: Level, p: Pos): Entity | undefined =>
  Object.values(state.entities).find(
    (e) => e.c.monster && e.c.pos?.level === l.id && e.c.pos.x === p.x && e.c.pos.y === p.y,
  );
const itemsAt = (state: GameState, l: Level, p: Pos): Entity[] =>
  Object.values(state.entities).filter(
    (e) => e.c.item && e.c.pos?.level === l.id && e.c.pos.x === p.x && e.c.pos.y === p.y,
  );
const hero = (state: GameState): Pos => getPlayer(state).c.pos!;
const isAmulet = (e: Entity): boolean => engine.registry.object(e.def).class === 'amulet';
const at = (def: LevelDef, l: Level, x: number, y: number): Pos => mapToLevel(def, l, x, y);
/** The hero stands on `p` of the current level (no move: nothing goes off). */
const put = (state: GameState, p: Pos): void => {
  const h = getPlayer(state);
  h.c.pos = { level: state.currentLevel, x: p.x, y: p.y };
};
const inBox = (def: LevelDef, l: Level, p: Pos, x2: number, y2: number): boolean => {
  const o = at(def, l, 0, 0);
  return p.x >= o.x && p.x <= o.x + x2 && p.y >= o.y && p.y <= o.y + y2;
};

/** Each map cell is still its map terrain, but where `skip` says the script changed it. */
function checkMap(l: Level, def: LevelDef, skip: (x: number, y: number) => boolean): void {
  const o = at(def, l, 0, 0);
  def.map!.rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (skip(x, y)) return;
      const id = ter(l, { x: o.x + x, y: o.y + y });
      // (a wall may have become a region's secret door)
      if (ch === '-' || ch === '|')
        expect(isWallId(id) || isSdoorId(id), `${ch} at ${x},${y}`).toBe(true);
      else if (ch === '.') expect([T.floor, T.grave], `. at ${x},${y}`).toContain(id);
      else if (ch === '}') expect(id, `} at ${x},${y}`).toBe(T.moat);
      else if (ch === 'S') expect(isSdoorId(id), `S at ${x},${y}`).toBe(true);
    }),
  );
}

describe("the Wizard's Tower levels", () => {
  const WIZ = [
    { sp: G.wizard1, def: WIZARD1 },
    { sp: G.wizard2, def: WIZARD2 },
    { sp: G.wizard3, def: WIZARD3 },
  ];

  test('each builds on 80x21: its map centred in the maze grid, stairs outside, the boundary', () => {
    for (const seed of SEEDS) {
      const { state } = engine.newGame({ seed });
      sturdy(state);
      for (const { sp, def } of WIZ) {
        const l = goTo(state, sp);
        expect(l.def).toBe(def.id);
        expect([l.width, l.height]).toEqual([80, 21]);
        // halign/valign "center" (two columns right of NetHack's: x_maze_max)
        expect(at(def, l, 0, 0)).toEqual({ x: 26, y: 5 });
        const spots = LADDER_SPOTS[def.id]!;
        const ladderAt = (x: number, y: number): boolean =>
          (spots.up?.[0] === x && spots.up[1] === y) ||
          (spots.down?.[0] === x && spots.down[1] === y);
        checkMap(l, def, ladderAt);
        if (spots.up) expect(ter(l, at(def, l, ...spots.up))).toBe(T.ladder_up);
        if (spots.down) expect(ter(l, at(def, l, ...spots.down))).toBe(T.ladder_down);
        // up and down stairs outside the map's {0,0,28,12}, no branch
        for (const s of [l.up!, l.down!]) {
          expect([T.stairs_up, T.stairs_down]).toContain(ter(l, s));
          expect(inBox(def, l, s, 28, 12)).toBe(false);
        }
        expect(l.branch).toBeNull();
        // the boundary is the teleport region's exclusion {0,0,27,12}
        const o = at(def, l, 0, 0);
        expect(inWTower(state, l, o.x, o.y)).toBe(true);
        expect(inWTower(state, l, o.x + 27, o.y + 12)).toBe(true);
        expect(inWTower(state, l, o.x + 28, o.y + 5)).toBe(false);
        expect(inWTower(state, l, o.x - 1, o.y)).toBe(false);
        // the hero, arriving at random, lands outside it
        expect(inWTower(state, l, hero(state).x, hero(state).y)).toBe(false);
        const f = levelFlags({ defs: engine.registry, state }, l);
        expect(f).toMatchObject({ noteleport: true, hardfloor: true, maze: true });
      }
    }
  });

  test('wizard1: the morgue with its secret door, the guards, the moat, the boards, the walls', () => {
    for (const seed of SEEDS) {
      const { state, level: l, made: m0 } = arrive(seed, G.wizard1);
      const def = WIZARD1;
      expect(l.rooms.map((r) => r.type)).toEqual([MORGUE]);
      const m = l.rooms[0]!;
      expect([m.lx, m.ly, m.hx, m.hy]).toEqual([
        ...Object.values(at(def, l, 12, 1)),
        ...Object.values(at(def, l, 20, 9)),
      ]);
      expect(isGraveyard(state, l.id)).toBe(true);
      // filled = 2: no graves made
      for (let x = m.lx; x <= m.hx; x++)
        for (let y = m.ly; y <= m.hy; y++) expect(ter(l, { x, y })).not.toBe(T.grave);
      // one more secret door on its south, west or east wall
      const o = at(def, l, 0, 0);
      const added: Pos[] = [];
      def.map!.rows.forEach((row, y) =>
        [...row].forEach((ch, x) => {
          if (ch !== 'S' && isSdoorId(ter(l, { x: o.x + x, y: o.y + y }))) added.push({ x, y });
        }),
      );
      expect(added).toHaveLength(1);
      const d = added[0]!;
      expect(
        (d.y === 10 && d.x >= 12 && d.x <= 20) ||
          (d.x === 11 && d.y >= 1 && d.y <= 9) ||
          (d.x === 21 && d.y >= 1 && d.y <= 9),
      ).toBe(true);
      // (as made, before anything moved)
      expect(monAt(m0, l, at(def, l, 15, 5))?.def).toBe('nh:hell_hound');
      expect(monAt(m0, l, at(def, l, 17, 5))).toBeDefined(); // a vampire lord's spot
      for (const [id, x, y] of [
        ['nh:kraken', 14, 2],
        ['nh:giant_eel', 17, 2],
        ['nh:kraken', 13, 4],
        ['nh:giant_eel', 13, 6],
        ['nh:kraken', 19, 4],
        ['nh:giant_eel', 19, 6],
        ['nh:kraken', 15, 8],
        ['nh:giant_eel', 17, 8],
        ['nh:piranha', 15, 2],
        ['nh:piranha', 19, 8],
      ] as const)
        expect(monAt(m0, l, at(def, l, x, y))?.def).toBe(id);
      // the Wizard's spot waits for m17 step 8b
      expect(monAt(m0, l, at(def, l, 16, 5))).toBeUndefined();
      // (a random trap made later may replace a board, as mktrap() does)
      for (const [x, y] of [
        [16, 4],
        [16, 6],
        [15, 5],
        [17, 5],
      ] as const)
        expect(BOARD_OR_LATER).toContain(trapAt(l, at(def, l, x, y).x, at(def, l, x, y).y)?.def);
      expect(
        Object.values(state.entities).some((e) => e.def === 'nh:ruby' && e.c.pos?.level === l.id),
      ).toBe(true);
      // "Walls inside the moat stay diggable"; the outer walls neither dig nor pass
      const c = { defs: engine.registry, state };
      const p = (x: number, y: number) => at(def, l, x, y);
      expect(nonDiggable(c, l, p(0, 0).x, p(0, 0).y)).toBe(true);
      expect(nonPasswall(c, l, p(21, 5).x, p(21, 5).y)).toBe(true);
      expect(nonDiggable(c, l, p(15, 3).x, p(15, 3).y)).toBe(false);
      expect(nonPasswall(c, l, p(15, 3).x, p(15, 3).y)).toBe(false);
    }
  });

  test('wizard2: the zoo is filled, its doors closed, the amulet; non-diggable everywhere', () => {
    for (const seed of SEEDS) {
      const { state, level: l } = arrive(seed, G.wizard2);
      const def = WIZARD2;
      expect(l.rooms.map((r) => r.type)).toEqual([ZOO]);
      const z = l.rooms[0]!;
      let mons = 0;
      for (let x = z.lx; x <= z.hx; x++)
        for (let y = z.ly; y <= z.hy; y++) if (monAt(state, l, { x, y })) mons++;
      expect(mons).toBeGreaterThan(20);
      // des.door("closed") on the two secret doors: they stay secret
      expect(isSdoorId(ter(l, at(def, l, 15, 2)))).toBe(true);
      expect(isSdoorId(ter(l, at(def, l, 11, 10)))).toBe(true);
      expect(itemsAt(made!, l, at(def, l, 4, 6)).some((e) => isAmulet(e))).toBe(true);
      const c = { defs: engine.registry, state };
      const p = at(def, l, 13, 4);
      expect(nonDiggable(c, l, p.x, p.y)).toBe(true);
    }
  });

  test('wizard3: the beehive, the unfilled morgue, the entry chamber door, the guards', () => {
    for (const seed of SEEDS) {
      const { state, level: l, made: m0 } = arrive(seed, G.wizard3);
      const def = WIZARD3;
      expect(l.rooms.map((r) => r.type)).toEqual([MORGUE, BEEHIVE]);
      const hive = l.rooms[1]!;
      const bees: Entity[] = [];
      for (let x = hive.lx; x <= hive.hx; x++)
        for (let y = hive.ly; y <= hive.hy; y++) {
          const m = monAt(state, l, { x, y });
          if (m) bees.push(m);
        }
      expect(bees.some((b) => b.def === 'nh:killer_bee' || b.def === 'nh:queen_bee')).toBe(true);
      expect(isGraveyard(state, l.id)).toBe(true);
      // the entry chamber's secret door on its north or west wall
      const o = at(def, l, 0, 0);
      const added: Pos[] = [];
      def.map!.rows.forEach((row, y) =>
        [...row].forEach((ch, x) => {
          if (ch !== 'S' && isSdoorId(ter(l, { x: o.x + x, y: o.y + y }))) added.push({ x, y });
        }),
      );
      expect(added).toHaveLength(1);
      const d = added[0]!;
      expect((d.y === 5 && d.x >= 20 && d.x <= 26) || (d.x === 19 && d.y >= 6 && d.y <= 11)).toBe(
        true,
      );
      expect(isSdoorId(ter(l, at(def, l, 18, 5)))).toBe(true);
      // (as made, before anything moved)
      expect(ctxClass(monAt(m0, l, at(def, l, 10, 7)))).toBe('L');
      for (const [id, x, y] of [
        ['nh:kraken', 8, 5],
        ['nh:giant_eel', 8, 8],
        ['nh:kraken', 14, 5],
        ['nh:giant_eel', 14, 8],
      ] as const)
        expect(monAt(m0, l, at(def, l, x, y))?.def).toBe(id);
      // a dragon at (26,9), or next to it when the random lich made before took the spot
      const dd = at(def, l, 26, 9);
      expect(
        Object.values(m0.entities).some(
          (e) =>
            e.c.monster &&
            e.c.pos?.level === l.id &&
            Math.max(Math.abs(e.c.pos.x - dd.x), Math.abs(e.c.pos.y - dd.y)) <= 1 &&
            ctxClass(e) === 'D',
        ),
      ).toBe(true);
      expect(itemsAt(m0, l, at(def, l, 11, 7)).some((e) => isAmulet(e))).toBe(true);
      // the portal to the first fake tower, hidden
      const pp = at(def, l, 25, 11);
      const t = trapAt(l, pp.x, pp.y)!;
      expect(t.def).toBe(MAGIC_PORTAL);
      expect(t.seen).toBe(false);
      expect(portalDest(t)).toEqual({ dungeon: GEHENNOM, dlevel: dlevelOf(state, G.fakewiz1) });
    }
  });

  /** A monster's class glyph. */
  function ctxClass(m: Entity | undefined): string | undefined {
    return m ? engine.registry.monster(m.def).glyph.ch : undefined;
  }
});

describe('the fake towers', () => {
  test('each builds: the moated tower in a maze, the lich, the kraken, the boards; the portal', () => {
    for (const seed of SEEDS) {
      const { state } = engine.newGame({ seed });
      sturdy(state);
      for (const def of [FAKEWIZ1, FAKEWIZ2]) {
        const l = goTo(state, def.id);
        const m0 = made!;
        expect(l.def).toBe(def.id);
        expect([l.width, l.height]).toEqual([80, 21]);
        checkMap(l, def, () => false);
        // (as made, before anything moved)
        const lich = monAt(m0, l, at(def, l, 4, 4));
        expect(lich && engine.registry.monster(lich.def).glyph.ch).toBe('L');
        expect(monAt(m0, l, at(def, l, 6, 6))?.def).toBe('nh:kraken');
        for (const [x, y] of [
          [4, 3],
          [4, 5],
          [3, 4],
          [5, 4],
        ] as const)
          expect(trapAt(l, at(def, l, x, y).x, at(def, l, x, y).y)?.def).toBe('nh:squeaky_board');
        for (const s of [l.up!, l.down!]) expect(inBox(def, l, s, 8, 8)).toBe(false);
        expect(levelFlags({ defs: engine.registry, state }, l)).toEqual({ maze: true });
        expect(inWTower(state, l, at(def, l, 4, 4).x, at(def, l, 4, 4).y)).toBe(false);
        const c = at(def, l, 4, 4);
        if (def === FAKEWIZ1) {
          const t = trapAt(l, c.x, c.y)!;
          expect(t.def).toBe(MAGIC_PORTAL);
          expect(t.seen).toBe(false);
          expect(portalDest(t)).toEqual({ dungeon: GEHENNOM, dlevel: dlevelOf(state, G.wizard3) });
        } else {
          expect(l.traps.some((t) => t.def === MAGIC_PORTAL)).toBe(false);
          expect(itemsAt(m0, l, c).some((e) => isAmulet(e))).toBe(true);
        }
      }
    }
  });
});

describe('ladders', () => {
  const climb = (state: GameState, dir: 'up' | 'down'): StepResult =>
    engine.step(state, { type: 'mod', action: `nh:${dir}` as DefId });

  test('every ladder both ways lands on the matching ladder, the level new or made before', () => {
    for (const seed of SEEDS) {
      const { state } = engine.newGame({ seed });
      sturdy(state);
      // wizard1 first; wizard2 and wizard3 are first entered by their ladders
      let l = goTo(state, G.wizard1);
      const w1 = l.id;
      put(state, at(WIZARD1, l, 6, 5));
      expect(
        engine
          .query(state)
          .actionsFor({ kind: 'self' })
          .some(
            (o) => o.action.type === 'mod' && (o.action as { action: string }).action === 'nh:down',
          ),
      ).toBe(true);
      climb(state, 'down');
      l = getLevel(state);
      expect(l.def).toBe(WIZARD2.id);
      expect(hero(state)).toEqual({ level: l.id, ...at(WIZARD2, l, 12, 1) });
      expect(ter(l, hero(state))).toBe(T.ladder_up);
      put(state, at(WIZARD2, l, 14, 11));
      climb(state, 'down');
      l = getLevel(state);
      expect(l.def).toBe(WIZARD3.id);
      expect(hero(state)).toEqual({ level: l.id, ...at(WIZARD3, l, 11, 7) });
      // and back up, onto the ladders down of levels made before
      climb(state, 'up');
      l = getLevel(state);
      expect(l.def).toBe(WIZARD2.id);
      expect(hero(state)).toEqual({ level: l.id, ...at(WIZARD2, l, 14, 11) });
      put(state, at(WIZARD2, l, 12, 1));
      climb(state, 'up');
      l = getLevel(state);
      expect(l.id).toBe(w1);
      expect(hero(state)).toEqual({ level: l.id, ...at(WIZARD1, l, 6, 5) });
      // down again to levels made before
      climb(state, 'down');
      expect(hero(state)).toEqual({ level: getLevel(state).id, ...at(WIZARD2, l, 12, 1) });
    }
  });

  test('ordinary stairs still lead to the ordinary stairs', () => {
    const { state, level: l } = arrive(2, G.wizard2);
    put(state, l.down!);
    engine.step(state, { type: 'mod', action: 'nh:down' as DefId });
    const l3 = getLevel(state);
    expect(l3.def).toBe(WIZARD3.id);
    expect(hero(state)).toEqual({ level: l3.id, ...l3.up! });
  });

  test('a monster escaping up a ladder comes out by the ladder down above', () => {
    const { state } = engine.newGame({ seed: 3 });
    sturdy(state);
    const l1 = goTo(state, G.wizard1);
    const l2 = goTo(state, G.wizard2);
    const lad = at(WIZARD2, l2, 12, 1);
    for (const e of Object.values(state.entities))
      if (e.c.monster && e.c.pos?.level === l2.id && e.c.pos.x === lad.x && e.c.pos.y === lad.y)
        delete state.entities[String(e.id)];
    const id = addMon(state, 'nh:jackal', lad.x, lad.y);
    state.entities[String(id)]!.c.pos!.level = l2.id;
    const r = run(state, (ctx) => {
      expect(useDefensive(ctx, id, { kind: 'up_ladder', obj: null })).toBe(2);
    });
    void r;
    expect(state.entities[String(id)]!.c.pos).toBeUndefined();
    put(state, at(WIZARD1, l1, 1, 1)); // anywhere: she arrives at random
    run(state, (ctx) => ctx.goToLevel({ dungeon: GEHENNOM, dlevel: l1.dlevel }, 'random'));
    const p = state.entities[String(id)]!.c.pos!;
    const d = at(WIZARD1, l1, 6, 5);
    expect(p.level).toBe(l1.id);
    expect(Math.max(Math.abs(p.x - d.x), Math.abs(p.y - d.y))).toBeLessThanOrEqual(1);
  });
});

describe('the magic portal', () => {
  /** Clears any monster off `p` of the hero's level and puts her there. */
  const stand = (state: GameState, p: Pos): void => {
    const l = getLevel(state);
    for (const e of Object.values(state.entities))
      if (e.c.monster && e.c.pos?.level === l.id && e.c.pos.x === p.x && e.c.pos.y === p.y)
        delete state.entities[String(e.id)];
    put(state, p);
  };
  const enter = (state: GameState): StepResult =>
    run(state, (ctx) => {
      const h = hero(state);
      dotrap(ctx, trapAt(getLevel(ctx.state), h.x, h.y)!);
    });

  test('fakewiz1 to wizard3 and back, onto the other portal, stunned', () => {
    for (const seed of SEEDS) {
      const { state } = engine.newGame({ seed });
      sturdy(state);
      let l = goTo(state, G.fakewiz1);
      const f1 = l.id;
      stand(state, at(FAKEWIZ1, l, 4, 4));
      let r = enter(state);
      expect(keys(r)).toContain('portal.activated');
      expect(keys(r)).toContain('portal.dizzy');
      expect(hasProp(getPlayer(state), P.STUNNED)).toBe(true);
      l = getLevel(state);
      expect(l.def).toBe(WIZARD3.id); // made by the trip
      const p3 = at(WIZARD3, l, 25, 11);
      expect(hero(state)).toEqual({ level: l.id, ...p3 });
      expect(trapAt(l, p3.x, p3.y)!.seen).toBe(true);
      // inside the tower
      expect(inWTower(state, l, p3.x, p3.y)).toBe(true);
      r = enter(state);
      expect(keys(r)).toContain('portal.activated');
      expect(keys(r)).toContain('portal.dizzier');
      l = getLevel(state);
      expect(l.id).toBe(f1);
      expect(hero(state)).toEqual({ level: f1, ...at(FAKEWIZ1, l, 4, 4) });
    }
  });

  test('a monster through the portal waits by the other one', () => {
    const { state } = engine.newGame({ seed: 4 });
    sturdy(state);
    const l = goTo(state, G.fakewiz1);
    const c = at(FAKEWIZ1, l, 4, 4);
    stand(state, at(FAKEWIZ1, l, 4, 3));
    const lich = Object.values(state.entities).find(
      (e) => e.c.monster && e.c.pos?.level === l.id && e.c.pos.x === c.x && e.c.pos.y === c.y,
    );
    if (lich) delete state.entities[String(lich.id)];
    const id = addMon(state, 'nh:jackal', c.x, c.y);
    state.entities[String(id)]!.c.pos!.level = l.id;
    run(state, (ctx) => {
      expect(mintrap(ctx, id, { force: true })).toBe('moved');
    });
    expect(state.entities[String(id)]!.c.pos).toBeUndefined();
    stand(state, c);
    enter(state);
    const l3 = getLevel(state);
    const p = state.entities[String(id)]!.c.pos!;
    const p3 = at(WIZARD3, l3, 25, 11);
    expect(p.level).toBe(l3.id);
    expect(Math.max(Math.abs(p.x - p3.x), Math.abs(p.y - p3.y))).toBe(1);
  });
});

describe("the tower's boundary", () => {
  test('teleported monsters and objects stay on their side; arrivals keep theirs', () => {
    for (const seed of SEEDS.slice(0, 3)) {
      const { state } = engine.newGame({ seed });
      sturdy(state);
      const l2 = goTo(state, G.wizard2);
      const l3 = goTo(state, G.wizard3);
      const inside = at(WIZARD3, l3, 22, 8);
      const outside = { x: 2, y: 3 };
      const ids: number[] = [];
      for (const p of [inside, outside]) {
        for (const e of Object.values(state.entities))
          if (e.c.monster && e.c.pos?.level === l3.id && e.c.pos.x === p.x && e.c.pos.y === p.y)
            delete state.entities[String(e.id)];
        const id = addMon(state, 'nh:jackal', p.x, p.y);
        state.entities[String(id)]!.c.pos!.level = l3.id;
        ids.push(id);
      }
      run(state, (ctx) => {
        for (let i = 0; i < 20; i++)
          for (const [k, id] of ids.entries()) {
            const m = ctx.state.entities[String(id)]!;
            rlocMon(ctx, m, false);
            const p = m.c.pos!;
            expect(inWTower(ctx.state, l3, p.x, p.y)).toBe(k === 0);
          }
        for (let i = 0; i < 20; i++) {
          expect(
            inWTower(
              ctx.state,
              l3,
              ...(Object.values(rlocoPos(ctx, l3, inside)) as [number, number]),
            ),
          ).toBe(true);
          expect(
            inWTower(
              ctx.state,
              l3,
              ...(Object.values(rlocoPos(ctx, l3, outside)) as [number, number]),
            ),
          ).toBe(false);
        }
        // to wizard2 from each side: they arrive on the same side there
        for (const id of ids) {
          const m = ctx.state.entities[String(id)]!;
          migrateToLevel(ctx, m, levelIdFor(ctx.state, { dungeon: GEHENNOM, dlevel: l2.dlevel }));
        }
      });
      run(state, (ctx) => ctx.goToLevel({ dungeon: GEHENNOM, dlevel: l2.dlevel }, 'random'));
      for (const [k, id] of ids.entries()) {
        const p = state.entities[String(id)]!.c.pos!;
        expect(p.level).toBe(l2.id);
        expect(inWTower(state, l2, p.x, p.y)).toBe(k === 0);
      }
    }
  });

  test("no rising through the ceiling from inside wizard1's tower", () => {
    const { state, level: l } = arrive(1, G.wizard1);
    run(state, (ctx) => {
      const p = at(WIZARD1, l, 4, 4);
      expect(canRiseUp(ctx, l, p.x, p.y)).toBe(false);
      expect(canRiseUp(ctx, l, l.up!.x, l.up!.y)).toBe(true);
      const l2 =
        ctx.state.levels[levelIdFor(ctx.state, { dungeon: GEHENNOM, dlevel: l.dlevel + 1 })];
      void l2;
    });
  });

  test('outside the tower levels there is no boundary', () => {
    const { state, level: l } = arrive(1, G.fakewiz2);
    for (let x = 0; x < l.width; x++) expect(inWTower(state, l, x, 10)).toBe(false);
  });
});
