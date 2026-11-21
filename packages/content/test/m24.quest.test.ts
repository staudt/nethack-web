// m24 step 3: the Quest's dungeon (5-6 levels behind a portal branch 6-7 levels below the Oracle,
// at the portal level's depth), its portals at both ends (an ordinary level, the big room and the
// Rogue level at the main end; the home level's branch region), Fort Ludios on the portal branch
// type, the Valkyrie's five levels, the Quest's level rules (falling and random level teleports
// stop at the locate level until she has reached it, no level teleport out, the quest enemies,
// "Home N"). Outcomes over searched seeds, never a lucky one.
// ref: dat/dungeon.lua; dat/Val-strt.lua, Val-loca.lua, Val-goal.lua, Val-fila.lua, Val-filb.lua;
// src/dungeon.c init_dungeon_set_depth(); src/mklev.c place_branch(); src/mkmaze.c
// fixup_special(); src/teleport.c random_teleport_level(), level_tele(); src/trap.c dng_bottom();
// src/makemon.c rndmonst_adj(); src/questpgr.c qt_montype()
import {
  buildSnapshot,
  createEngine,
  createRng,
  getLevel,
  getPlayer,
  playerPos,
  rollDungeons,
  seedRng,
  trapAt,
  type Ctx,
  type DefId,
  type Entity,
  type GameState,
  type Level,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import {
  LUDIOS,
  QGOAL,
  QLOCATE,
  QSTART,
  QUEST,
  dngBottom,
  inQuest,
  isQgoal,
  isQlocate,
  isQstart,
  levelFlags,
  nonDiggable,
  questEntry,
} from '../src/levelflags';
import { MAGIC_PORTAL, findPortal, portalDest } from '../src/portal';
import { dotrap, levelTele } from '../src/trap';
import { P, setIntrinsic } from '../src/props';
import { randomTeleportLevel } from '../src/teleport';
import { rndmonst } from '../src/generation';
import { mapToLevel } from '../src/sp_lev';
import { VAL_GOAL, VAL_LOCA, VAL_STRT } from '../src/quest/val';
import { BELL_OF_OPENING } from '../src/uhave';
import { minvent } from '../src/mongear';
import { T, terrainIdAt } from '../src/terrain';
import { roleDefId } from '../src/urole';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'qt',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'qt:run',
      labelKey: 'qt',
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
const run = (state: GameState, fn: (ctx: Ctx) => void): void => {
  probe.fn = fn;
  engine.step(state, { type: 'mod', action: 'qt:run' as DefId });
};
const fresh = (seed: number, role = 'valkyrie'): GameState =>
  engine.newGame({ seed, character: { role: roleDefId(role as never) } }).state;
const monsOn = (state: GameState, l: Level): Entity[] =>
  Object.values(state.entities).filter(
    (e) => e.c.monster && e.c.pos?.level === l.id && e.id !== state.playerId,
  );
const goTo = (state: GameState, dungeon: DefId, dlevel: number): Level => {
  run(state, (ctx) => ctx.goToLevel({ dungeon, dlevel }, 'random'));
  return getLevel(state);
};
const heal = (state: GameState): void => {
  getPlayer(state).c.hp = { cur: 999, max: 999 };
};

describe('the layout', () => {
  test('the Quest 6-7 below the Oracle at its depth, 5-6 levels; Ludios on DL18-21', () => {
    const depths = new Set<number>();
    for (let seed = 1; seed <= 200; seed++) {
      const layout = rollDungeons(createRng(seedRng(seed)), engine.registry.dungeons);
      expect(layout.map((d) => d.id).slice(0, 5)).toEqual([
        'nh:main',
        'nh:gehennom',
        'nh:mines',
        QUEST,
        'nh:sokoban',
      ]);
      const main = layout.find((d) => d.id === 'nh:main')!;
      const quest = layout.find((d) => d.id === QUEST)!;
      const oracle = main.special.find((s) => s.id === 'nh:oracle')!.dlevel;
      const b = main.branches.find((x) => x.to === QUEST)!;
      expect(b).toEqual({ to: QUEST, dlevel: b.dlevel, stairs: 'portal' });
      expect([oracle + 6, oracle + 7]).toContain(b.dlevel);
      expect(quest.depthStart).toBe(main.depthStart + b.dlevel - 1);
      expect([5, 6]).toContain(quest.levels);
      expect(quest.special).toEqual([
        { id: QSTART, dlevel: 1 },
        { id: QLOCATE, dlevel: 3 },
        { id: QGOAL, dlevel: quest.levels },
      ]);
      const ludios = layout.find((d) => d.id === LUDIOS)!;
      const lb = main.branches.find((x) => x.to === LUDIOS)!;
      expect(lb.stairs).toBe('portal');
      expect([18, 19, 20, 21]).toContain(lb.dlevel);
      expect(ludios.depthStart).toBe(lb.dlevel); // "portals stay on the same depth"
      depths.add(b.dlevel);
    }
    expect([...depths].sort((a, b) => a - b)).toEqual([11, 12, 13, 14, 15, 16]);
  });
});

/** Seeds whose quest branch level is an ordinary level, the big room and the Rogue level. */
function branchSeeds(): Map<string, number> {
  const found = new Map<string, number>();
  for (let seed = 1; seed <= 3000 && found.size < 3; seed++) {
    const layout = rollDungeons(createRng(seedRng(seed)), engine.registry.dungeons);
    const main = layout.find((d) => d.id === 'nh:main')!;
    const dl = main.branches.find((x) => x.to === QUEST)!.dlevel;
    const sp = main.special.find((s) => s.dlevel === dl)?.id ?? 'ordinary';
    if (!found.has(sp)) found.set(sp, seed);
  }
  return found;
}

describe('the portals', () => {
  test('the main end on an ordinary level, the big room and the Rogue level', () => {
    const found = branchSeeds();
    expect([...found.keys()].sort()).toEqual(['nh:bigroom', 'nh:rogue', 'ordinary']);
    for (const [, seed] of found) {
      const state = fresh(seed);
      heal(state);
      const e = questEntry(state)!;
      const l = goTo(state, e.dungeon, e.dlevel);
      const portals = l.traps.filter((t) => t.def === MAGIC_PORTAL);
      expect(portals).toHaveLength(1);
      expect(portalDest(portals[0]!)).toEqual({ dungeon: QUEST, dlevel: 1 });
      expect(portals[0]!.seen).toBe(false);
      expect(l.branch).toBeNull(); // no stairs at either end
    }
  });

  test('every role gets the main dungeon portal to its own home level (m24b)', () => {
    for (const role of ['samurai', 'tourist', 'wizard']) {
      const state = fresh(7, role);
      heal(state);
      const e = questEntry(state)!;
      const l = goTo(state, e.dungeon, e.dlevel);
      expect(portalDest(findPortal(l)!)).toEqual({ dungeon: QUEST, dlevel: 1 });
      expect(goTo(state, QUEST, 1).def).toBe(`nh:${role.slice(0, 3)}-strt`);
    }
  });

  test('through the portal and back: each end arrives on the other portal', () => {
    const state = fresh(3);
    heal(state);
    const e = questEntry(state)!;
    const main = goTo(state, e.dungeon, e.dlevel);
    const p = findPortal(main)!;
    getPlayer(state).c.pos = { level: main.id, x: p.x, y: p.y };
    run(state, (ctx) => dotrap(ctx, p));
    const home = getLevel(state);
    expect(home.id).toBe(`${QUEST}/1`);
    expect(home.def).toBe(VAL_STRT.id);
    expect(home.depth).toBe(main.depth);
    const back = findPortal(home)!;
    expect(playerPos(state)).toEqual({ x: back.x, y: back.y });
    expect(back).toEqual({ ...back, x: mapToLevel(VAL_STRT, home, 66, 17).x });
    expect(portalDest(back)).toEqual({ dungeon: e.dungeon, dlevel: e.dlevel });
    run(state, (ctx) => dotrap(ctx, back));
    expect(getLevel(state).id).toBe(main.id);
    expect(playerPos(state)).toEqual({ x: p.x, y: p.y });
  });
});

describe("the Valkyrie's levels", () => {
  test('the home level: the Norn armed, her guards, the stairs, the portal, the flags', () => {
    for (const seed of [1, 2, 3]) {
      const state = fresh(seed);
      heal(state);
      const home = goTo(state, QUEST, 1);
      expect(isQstart(state, home)).toBe(true);
      expect(home.up).toBeNull();
      expect(home.down).toEqual(mapToLevel(VAL_STRT, home, 18, 1));
      const mons = monsOn(state, home);
      const norn = mons.find((m) => m.def === 'nh:norn')!;
      expect(norn.c.pos).toMatchObject(mapToLevel(VAL_STRT, home, 35, 10));
      expect(norn.c.monster?.peaceful).toBe(true);
      const gear = minvent({ state, defs: engine.registry } as never, norn.id);
      expect(gear.map((o) => [o.def, o.c.item?.spe]).sort()).toEqual([
        ['nh:banded_mail', 5],
        ['nh:long_sword', 4],
      ]);
      // a huge Norn cannot wear the mail (m_dowear()'s cantweararm()): she carries it
      expect(gear.find((o) => o.def === 'nh:banded_mail')?.c.item?.equipped).toBeNull();
      expect(mons.filter((m) => m.def === 'nh:warrior')).toHaveLength(8);
      expect(mons.filter((m) => m.def === 'nh:fire_giant' && !m.c.monster?.peaceful)).toHaveLength(
        2,
      );
      // six fire traps (one may land on another, or on the portal's spot, as in C)
      const fire = home.traps.filter((t) => t.def === 'nh:fire_trap').length;
      expect(fire).toBeGreaterThanOrEqual(4);
      expect(fire).toBeLessThanOrEqual(6);
      expect(terrainIdAt(home, ...xy(mapToLevel(VAL_STRT, home, 26, 10)))).toBe(T.door_locked);
      expect(levelFlags({ defs: engine.registry, state }, home)).toMatchObject({
        noteleport: true,
        hardfloor: true,
      });
      const wall = mapToLevel(VAL_STRT, home, 26, 7);
      expect(nonDiggable({ defs: engine.registry, state }, home, wall.x, wall.y)).toBe(true);
      // the hall keeps its map; lava and water only where the map keeps the ice
      const hall = mapToLevel(VAL_STRT, home, 30, 10);
      expect(terrainIdAt(home, hall.x, hall.y)).toBe(T.floor);
      const liquids = home.cells.filter((c) => {
        const id = home.palette[c];
        return id === T.lava || id === T.pool;
      });
      expect(liquids.length).toBeGreaterThan(13);
    }
  });

  test('the fillers above and below the locate level, the locate and the goal level', () => {
    const state = fresh(2);
    heal(state);
    const n = state.dungeons.find((d) => d.id === QUEST)!.levels!;
    expect(goTo(state, QUEST, 2).def).toBe('nh:val-fila');
    const loca = goTo(state, QUEST, 3);
    expect(loca.def).toBe(VAL_LOCA.id);
    expect(isQlocate(state, loca)).toBe(true);
    expect(loca.up).toEqual(mapToLevel(VAL_LOCA, loca, 48, 14));
    expect(loca.down).toEqual(mapToLevel(VAL_LOCA, loca, 20, 6));
    expect(terrainIdAt(loca, ...xy(mapToLevel(VAL_LOCA, loca, 7, 2)))).toBe(T.floor);
    expect(goTo(state, QUEST, 4).def).toBe('nh:val-filb');
    const goal = goTo(state, QUEST, n);
    expect(goal.def).toBe(VAL_GOAL.id);
    expect(isQgoal(state, goal)).toBe(true);
    expect(goal.down).toBeNull();
    expect(goal.up).toEqual(mapToLevel(VAL_GOAL, goal, 45, 10));
    const ph = mapToLevel(VAL_GOAL, goal, 6, 0);
    expect(terrainIdAt(goal, ph.x, ph.y)).toBe(T.floor);
  });

  test('the goal: the Orb of Fate, Lord Surtur with the Bell, the drawbridges', () => {
    for (const seed of [1, 2, 3, 4]) {
      const state = fresh(seed);
      heal(state);
      const n = state.dungeons.find((d) => d.id === QUEST)!.levels!;
      const goal = goTo(state, QUEST, n);
      const at = mapToLevel(VAL_GOAL, goal, 17, 8);
      const orb = Object.values(state.entities).find(
        (e) => e.def === 'nh:crystal_ball' && e.c.pos?.level === goal.id,
      )!;
      expect(orb.c.pos).toMatchObject(at);
      expect(orb.c.item).toMatchObject({ artifact: 'nh:orb_of_fate', buc: 'blessed', spe: 5 });
      const surtur = monsOn(state, goal).find((m) => m.def === 'nh:lord_surtur')!;
      expect(surtur.c.pos).toMatchObject(at);
      expect(
        minvent({ state, defs: engine.registry } as never, surtur.id).map((o) => o.def),
      ).toContain(BELL_OF_OPENING);
      const north = mapToLevel(VAL_GOAL, goal, 17, 2);
      expect(terrainIdAt(goal, north.x, north.y)).toMatch(/drawbridge/);
      const south = mapToLevel(VAL_GOAL, goal, 17, 14);
      expect(terrainIdAt(goal, south.x, south.y)).toMatch(/drawbridge/);
    }
  });
});

const xy = (p: { x: number; y: number }): [number, number] => [p.x, p.y];

describe("the Quest's rules", () => {
  test('falling and random level teleports stop at the locate level until she reaches it', () => {
    const state = fresh(5);
    heal(state);
    const quest = state.dungeons.find((d) => d.id === QUEST)!;
    const home = goTo(state, QUEST, 1);
    expect(dngBottom(state, home)).toBe(3);
    const seen = new Set<number>();
    const ctx = { state, rng: createRng(seedRng(9)), defs: engine.registry };
    for (let i = 0; i < 500; i++) seen.add(randomTeleportLevel(ctx, home));
    expect(Math.min(...seen)).toBe(quest.depthStart);
    expect(Math.max(...seen)).toBe(quest.depthStart + 2);
    goTo(state, QUEST, 3);
    expect(dngBottom(state, home)).toBe(quest.levels);
    seen.clear();
    for (let i = 0; i < 500; i++) seen.add(randomTeleportLevel(ctx, home));
    expect(Math.min(...seen)).toBe(quest.depthStart);
    expect(Math.max(...seen)).toBe(quest.depthStart + 3); // up to current + 3
  });

  test('a controlled level teleport counts from the Quest\'s first level ("Home 1")', () => {
    const state = fresh(8);
    heal(state);
    goTo(state, QUEST, 2);
    // (from Home 1 the leader's gate would hold her: m24 step 5)
    for (const [want, dlevel] of [
      ['3', 3],
      ['1', 1],
    ] as const) {
      setIntrinsic(getPlayer(state), P.TELEPORT_CONTROL, true);
      run(state, (ctx) => levelTele(ctx));
      expect(state.pendingPrompt?.prompt.id).toBe('tele-level');
      engine.step(state, { type: 'answer', promptId: 'tele-level', value: want });
      expect(getLevel(state).id).toBe(`${QUEST}/${dlevel}`);
    }
  });

  test('the quest enemies: 6 in 7 of a Valkyrie quest level are fire ants or giants', () => {
    const state = fresh(6);
    heal(state);
    const filler = goTo(state, QUEST, 2);
    expect(inQuest(state, filler)).toBe(true);
    const ctx = { state, rng: createRng(seedRng(4)), defs: engine.registry };
    let enemies = 0;
    const N = 700;
    for (let i = 0; i < N; i++) {
      const m = rndmonst(ctx, 15, 0, 0, filler);
      if (m && (m.glyph.ch === 'a' || m.glyph.ch === 'H')) enemies++;
    }
    // qt_montype() 6 times in 7, and some of the rest are a or H anyway
    expect(enemies / N).toBeGreaterThan(0.8);
  });

  test('"Home N" on the status line in the Quest, Dlvl elsewhere', () => {
    const state = fresh(4);
    heal(state);
    expect(buildSnapshot(engine.registry, state).status['home']).toBeUndefined();
    goTo(state, QUEST, 2);
    expect(buildSnapshot(engine.registry, state).status['home']).toBe(2);
  });

  test('no trap on the portal spot is left behind and the portal is never seen at first', () => {
    const state = fresh(3);
    heal(state);
    const home = goTo(state, QUEST, 1);
    const p = findPortal(home)!;
    expect(trapAt(home, p.x, p.y)?.def).toBe(MAGIC_PORTAL);
  });
});
