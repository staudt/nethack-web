// m24 step 7: the Archeologist's, Barbarian's and Cave Dweller's quest levels. For each role and
// several seeds: the home level with the leader (his custom inventory), the guardians peaceful,
// the portal on the branch spot leading back to the main dungeon's portal level; the fillers and
// the locate level with their stairs; the goal with the nemesis carrying the Bell and the named
// quest artifact; no monster or object in rock. Then each role through the main dungeon's portal
// and back, and the levels' own pieces (Arc-loca's three altars and engravings, Cav-strt's shrine
// and priest, Bar-goal's cross-aligned altar, Bar-strt's ogres beyond the river). Outcomes over
// seeds, never a lucky one.
// ref: dat/Arc-*.lua, Bar-*.lua, Cav-*.lua; src/sp_lev.c; src/mkmaze.c fixup_special()
import {
  createEngine,
  getLevel,
  getPlayer,
  playerPos,
  type Ctx,
  type DefId,
  type Entity,
  type GameState,
  type Level,
  type LevelDef,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import { altarAlign } from '../src/aligntyp';
import { engravingsOn } from '../src/engr';
import { epriOf } from '../src/epri';
import { QUEST, isQgoal, isQlocate, isQstart, levelFlags, questEntry } from '../src/levelflags';
import { ualignBase } from '../src/luck';
import { minvent } from '../src/mongear';
import { findPortal, portalDest } from '../src/portal';
import { ARC_GOAL, ARC_LOCA, ARC_STRT } from '../src/quest/arc';
import { BAR_GOAL, BAR_LOCA, BAR_STRT } from '../src/quest/bar';
import { CAV_GOAL, CAV_LOCA, CAV_STRT } from '../src/quest/cav';
import { mapToLevel } from '../src/sp_lev';
import { T, terrainIdAt } from '../src/terrain';
import { dotrap } from '../src/trap';
import { BELL_OF_OPENING } from '../src/uhave';
import { roleDefId } from '../src/urole';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'qb',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'qb:run',
      labelKey: 'qb',
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
const run = (state: GameState, fn: (ctx: Ctx) => void): void => {
  probe.fn = fn;
  engine.step(state, { type: 'mod', action: 'qb:run' as DefId });
};
const fresh = (seed: number, role: string): GameState =>
  engine.newGame({ seed, character: { role: roleDefId(role as never) } }).state;
const goTo = (state: GameState, dungeon: DefId, dlevel: number): Level => {
  run(state, (ctx) => ctx.goToLevel({ dungeon, dlevel }, 'random'));
  return getLevel(state);
};
const heal = (state: GameState): void => {
  getPlayer(state).c.hp = { cur: 999, max: 999 };
};
const on = (state: GameState, l: Level): Entity[] =>
  Object.values(state.entities).filter((e) => e.c.pos?.level === l.id && e.id !== state.playerId);
const monsOn = (state: GameState, l: Level): Entity[] => on(state, l).filter((e) => e.c.monster);
const gear = (state: GameState, id: number): Entity[] => minvent({ state, defs } as never, id);
const at = (def: LevelDef, l: Level, x: number, y: number) => mapToLevel(def, l, x, y);

/** No monster or object stands in rock (stone, walls, trees, secret doors). */
function nothingInRock(state: GameState, l: Level): void {
  for (const e of on(state, l)) {
    const pos = e.c.pos;
    if (!pos || (!e.c.monster && !e.c.item)) continue;
    const t = defs.terrain(terrainIdAt(l, pos.x, pos.y)!);
    if (e.c.monster && (defs.monster(e.def).flags as string[]).includes('wallwalk')) continue;
    expect(t.passable || t.liquid !== undefined, `${e.def} at ${pos.x},${pos.y}`).toBe(true);
  }
}

interface RoleCase {
  role: string;
  strt: LevelDef;
  loca: LevelDef;
  goal: LevelDef;
  fila: DefId;
  filb: DefId;
  leader: DefId;
  leaderAt: [number, number];
  leaderGear: [DefId, number][];
  guardian: DefId;
  guardians: number;
  branch: [number, number];
  down: [number, number];
  locaUp: [number, number];
  locaDown: [number, number];
  nemesis: DefId;
  artifact: DefId;
  base: DefId;
  artifactAt: [number, number];
  spe: number;
  goalUp: [number, number] | null;
}

const CASES: readonly RoleCase[] = [
  {
    role: 'archeologist',
    strt: ARC_STRT,
    loca: ARC_LOCA,
    goal: ARC_GOAL,
    fila: 'nh:arc-fila',
    filb: 'nh:arc-filb',
    leader: 'nh:lord_carnarvon',
    leaderAt: [25, 10],
    leaderGear: [
      ['nh:bullwhip', 4],
      ['nh:fedora', 5],
    ],
    guardian: 'nh:student',
    guardians: 8,
    branch: [63, 6],
    down: [55, 7],
    locaUp: [3, 17],
    locaDown: [39, 10],
    nemesis: 'nh:minion_of_huhetotl',
    artifact: 'nh:orb_of_detection',
    base: 'nh:crystal_ball',
    artifactAt: [50, 14],
    spe: 5,
    goalUp: [38, 10],
  },
  {
    role: 'barbarian',
    strt: BAR_STRT,
    loca: BAR_LOCA,
    goal: BAR_GOAL,
    fila: 'nh:bar-fila',
    filb: 'nh:bar-filb',
    leader: 'nh:pelias',
    leaderAt: [10, 7],
    leaderGear: [
      ['nh:chain_mail', 5],
      ['nh:runesword', 5],
    ],
    guardian: 'nh:chieftain',
    guardians: 8,
    branch: [62, 2],
    down: [9, 9],
    locaUp: [5, 2],
    locaDown: [70, 13],
    nemesis: 'nh:thoth_amon',
    artifact: 'nh:heart_of_ahriman',
    base: 'nh:luckstone',
    artifactAt: [63, 4],
    spe: 0,
    goalUp: [36, 5],
  },
  {
    role: 'caveman',
    strt: CAV_STRT,
    loca: CAV_LOCA,
    goal: CAV_GOAL,
    fila: 'nh:cav-fila',
    filb: 'nh:cav-filb',
    leader: 'nh:shaman_karnov',
    leaderAt: [35, 2],
    leaderGear: [
      ['nh:club', 5],
      ['nh:leather_armor', 5],
    ],
    guardian: 'nh:neanderthal',
    guardians: 8,
    branch: [71, 9],
    down: [2, 3],
    locaUp: [4, 3],
    locaDown: [73, 10],
    nemesis: 'nh:chromatic_dragon',
    artifact: 'nh:sceptre_of_might',
    base: 'nh:mace',
    artifactAt: [23, 10],
    spe: 0,
    goalUp: null, // des.stair("up") at random
  },
];

describe.each(CASES)("the $role's levels", (c) => {
  test('the home level: the leader armed, the guardians, the stairs, the portal home', () => {
    for (const seed of [1, 2, 3]) {
      const state = fresh(seed, c.role);
      heal(state);
      const e = questEntry(state)!;
      const home = goTo(state, QUEST, 1);
      expect(home.def).toBe(c.strt.id);
      expect(isQstart(state, home)).toBe(true);
      expect(home.up).toBeNull();
      expect(home.down).toEqual(at(c.strt, home, ...c.down));
      const mons = monsOn(state, home);
      const leader = mons.find((m) => m.def === c.leader)!;
      expect(leader.c.pos).toMatchObject(at(c.strt, home, ...c.leaderAt));
      expect(leader.c.monster?.peaceful).toBe(true);
      expect(
        gear(state, leader.id)
          .map((o) => [o.def, o.c.item?.spe])
          .sort(),
      ).toEqual(c.leaderGear);
      const guards = mons.filter((m) => m.def === c.guardian);
      expect(guards).toHaveLength(c.guardians);
      expect(guards.every((m) => m.c.monster?.peaceful === true)).toBe(true);
      const portal = findPortal(home)!;
      expect({ x: portal.x, y: portal.y }).toEqual(at(c.strt, home, ...c.branch));
      expect(portalDest(portal)).toEqual({ dungeon: e.dungeon, dlevel: e.dlevel });
      expect(levelFlags({ defs, state }, home)).toMatchObject({
        noteleport: true,
        hardfloor: true,
      });
      nothingInRock(state, home);
    }
  });

  test('the fillers and the locate level, with their stairs', () => {
    for (const seed of [1, 2]) {
      const state = fresh(seed, c.role);
      heal(state);
      const n = state.dungeons.find((d) => d.id === QUEST)!.levels!;
      const fila = goTo(state, QUEST, 2);
      expect(fila.def).toBe(c.fila);
      expect(fila.up).not.toBeNull();
      expect(fila.down).not.toBeNull();
      nothingInRock(state, fila);
      const loca = goTo(state, QUEST, 3);
      expect(loca.def).toBe(c.loca.id);
      expect(isQlocate(state, loca)).toBe(true);
      expect(loca.up).toEqual(at(c.loca, loca, ...c.locaUp));
      expect(loca.down).toEqual(at(c.loca, loca, ...c.locaDown));
      nothingInRock(state, loca);
      for (let d = 4; d < n; d++) {
        const filb = goTo(state, QUEST, d);
        expect(filb.def).toBe(c.filb);
        expect(filb.up).not.toBeNull();
        expect(filb.down).not.toBeNull();
        nothingInRock(state, filb);
      }
    }
  });

  test('the goal: the nemesis with the Bell, the named artifact', () => {
    for (const seed of [1, 2, 3]) {
      const state = fresh(seed, c.role);
      heal(state);
      const n = state.dungeons.find((d) => d.id === QUEST)!.levels!;
      const goal = goTo(state, QUEST, n);
      expect(goal.def).toBe(c.goal.id);
      expect(isQgoal(state, goal)).toBe(true);
      expect(goal.down).toBeNull();
      expect(goal.up).not.toBeNull();
      if (c.goalUp) expect(goal.up).toEqual(at(c.goal, goal, ...c.goalUp));
      const spot = at(c.goal, goal, ...c.artifactAt);
      const arti = on(state, goal).find((e) => e.c.item?.artifact === c.artifact)!;
      expect(arti.def).toBe(c.base);
      expect(arti.c.pos).toMatchObject(spot);
      expect(arti.c.item).toMatchObject({ buc: 'blessed', spe: c.spe });
      const nemesis = monsOn(state, goal).find((m) => m.def === c.nemesis)!;
      expect(nemesis.c.pos).toMatchObject(spot);
      expect(nemesis.c.monster?.peaceful).toBe(false);
      expect(gear(state, nemesis.id).map((o) => o.def)).toContain(BELL_OF_OPENING);
      nothingInRock(state, goal);
    }
  });

  test('through the main dungeon portal to the home level and back', () => {
    const state = fresh(3, c.role);
    heal(state);
    const e = questEntry(state)!;
    const main = goTo(state, e.dungeon, e.dlevel);
    const p = findPortal(main)!;
    expect(portalDest(p)).toEqual({ dungeon: QUEST, dlevel: 1 });
    getPlayer(state).c.pos = { level: main.id, x: p.x, y: p.y };
    run(state, (ctx) => dotrap(ctx, p));
    const home = getLevel(state);
    expect(home.def).toBe(c.strt.id);
    expect(home.depth).toBe(main.depth);
    expect(playerPos(state)).toEqual(at(c.strt, home, ...c.branch));
    // the leader's call was heard on the portal level, the home level's text on arrival
    const back = findPortal(home)!;
    run(state, (ctx) => dotrap(ctx, back));
    expect(getLevel(state).id).toBe(main.id);
    expect(playerPos(state)).toEqual({ x: p.x, y: p.y });
  });
});

describe("the levels' own pieces", () => {
  test("Arc-loca: three unattended altars of the three gods, four 'X marks the spot.'", () => {
    const seen = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const state = fresh(seed, 'archeologist');
      heal(state);
      const loca = goTo(state, QUEST, 3);
      const aligns = [
        [26, 5],
        [26, 10],
        [26, 15],
      ].map(([x, y]) => altarAlign(terrainIdAt(loca, ...xy(at(ARC_LOCA, loca, x!, y!)))!));
      expect([...aligns].sort()).toEqual([-1, 0, 1]);
      seen.add(aligns.join());
      expect(loca.shrines ?? []).toEqual([]);
      const marks = engravingsOn({ state }, loca).filter((g) => g.e.text === 'X marks the spot.');
      expect(marks.length).toBeGreaterThanOrEqual(3); // two may share a spot
      expect(loca.rooms.filter((r) => r.type === 'nh:temple')).toHaveLength(3);
    }
    expect(seen.size).toBeGreaterThan(1); // shuffled per game
  });

  test('Cav-strt: the coaligned shrine with its priest; the Chromatic Dragon asleep', () => {
    for (const seed of [1, 2]) {
      const state = fresh(seed, 'caveman');
      heal(state);
      const home = goTo(state, QUEST, 1);
      const altar = at(CAV_STRT, home, 36, 2);
      expect(altarAlign(terrainIdAt(home, altar.x, altar.y)!)).toBe(ualignBase(state));
      expect(home.shrines).toEqual([altar]);
      const priest = monsOn(state, home).find((m) => epriOf({ state }, m.id) !== null)!;
      expect(priest.c.monster?.peaceful).toBe(true);
      // the walls round the caves (des.wallify())
      const wall = at(CAV_STRT, home, 1, 0);
      expect(terrainIdAt(home, wall.x, wall.y)).not.toBe(T.stone);
      const n = state.dungeons.find((d) => d.id === QUEST)!.levels!;
      const goal = goTo(state, QUEST, n);
      const dragon = monsOn(state, goal).find((m) => m.def === 'nh:chromatic_dragon')!;
      expect(dragon.c.monster?.asleep).toBe(true);
    }
  });

  test('Bar-goal: the altar is not hers; Bar-strt: a dozen ogres beyond the river', () => {
    for (const seed of [1, 2, 3]) {
      const state = fresh(seed, 'barbarian');
      heal(state);
      const home = goTo(state, QUEST, 1);
      const o = at(BAR_STRT, home, 0, 0);
      const ogres = monsOn(state, home).filter((m) => m.def === 'nh:ogre');
      expect(ogres).toHaveLength(12);
      for (const m of ogres) {
        expect(m.c.monster?.peaceful).toBe(false);
        expect(m.c.pos!.x - o.x).toBeGreaterThanOrEqual(40);
        expect(m.c.pos!.x - o.x).toBeLessThanOrEqual(45);
      }
      // the path to the portal is clear
      const p = at(BAR_STRT, home, 62, 2);
      expect(terrainIdAt(home, p.x, p.y)).toBe(T.floor);
      const n = state.dungeons.find((d) => d.id === QUEST)!.levels!;
      const goal = goTo(state, QUEST, n);
      const altar = at(BAR_GOAL, goal, 63, 4);
      const al = altarAlign(terrainIdAt(goal, altar.x, altar.y)!);
      expect(al).not.toBeNull();
      expect(al).not.toBe(ualignBase(state));
      // the secret doors stay secret
      const d = at(BAR_GOAL, goal, 22, 9);
      expect(terrainIdAt(goal, d.x, d.y)).toMatch(/sdoor/);
    }
  });
});

const xy = (p: { x: number; y: number }): [number, number] => [p.x, p.y];
