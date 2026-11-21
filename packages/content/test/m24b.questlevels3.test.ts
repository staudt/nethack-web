// m24 step 9: the Priest's, Rogue's and Ranger's quest levels. For each role and several seeds:
// the home level with the leader (his custom inventory), the guardians peaceful, the portal on
// the branch spot (Ran-strt: anywhere in its right-hand region) leading back to the main
// dungeon's portal level; the fillers and the locate level with their stairs; the goal with the
// nemesis carrying the Bell and the named quest artifact; no monster or object in rock. Then
// each role through the main dungeon's portal and back, and the levels' own pieces (the Priest's
// graveyard levels, Pri-strt's besiegers on the open field, Pri-loca's morgues, unaligned shrine
// and hostile cleric, the Mitre erodeproof; Rog-strt's stairs and stair mimics on the shuffled
// exits, the street crowd and the Master's daggers, Rog-loca's cursed scroll, Rog-goal's up
// stairs region and tin; Ran-strt's woods off the map, Ran-loca's sleeping wumpus and its pits'
// "Fortunately it has a bottom after all...", Ran-fila's treed caves, Ran-goal's walls).
// Outcomes over seeds, never a lucky one.
// ref: dat/Pri-*.lua, Rog-*.lua, Ran-*.lua; src/sp_lev.c; src/mkmaze.c fixup_special();
// src/trap.c trapeffect_pit()
import {
  createEngine,
  getLevel,
  getPlayer,
  playerPos,
  trapAt,
  type Ctx,
  type DefId,
  type Entity,
  type GameEvent,
  type GameState,
  type Level,
  type LevelDef,
  type LevelRect,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import { A_NONE, altarAlign } from '../src/aligntyp';
import { chamOf } from '../src/chamstate';
import { epriOf } from '../src/epri';
import { isGraveyard } from '../src/graveyard';
import { QUEST, isQgoal, isQlocate, isQstart, levelFlags, questEntry } from '../src/levelflags';
import { mappearance } from '../src/mimicstate';
import { minvent } from '../src/mongear';
import { findPortal, portalDest } from '../src/portal';
import { PRI_GOAL, PRI_LOCA, PRI_STRT } from '../src/quest/pri';
import { RAN_GOAL, RAN_LOCA, RAN_STRT, RAN_STRT_BRANCH } from '../src/quest/ran';
import { ROG_GOAL, ROG_GOAL_UP_REGION, ROG_LOCA, ROG_STRT } from '../src/quest/rog';
import { mapToLevel } from '../src/sp_lev';
import { T, terrainIdAt } from '../src/terrain';
import { TRAP, dotrap, maketrap } from '../src/trap';
import { BELL_OF_OPENING } from '../src/uhave';
import { roleDefId } from '../src/urole';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'qc',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'qc:run',
      labelKey: 'qc',
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
const run = (state: GameState, fn: (ctx: Ctx) => void): readonly GameEvent[] => {
  probe.fn = fn;
  return engine.step(state, { type: 'mod', action: 'qc:run' as DefId }).events;
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
const xy = (p: { x: number; y: number }): [number, number] => [p.x, p.y];
const levels = (state: GameState): number => state.dungeons.find((d) => d.id === QUEST)!.levels!;
const inRect = (p: { x: number; y: number }, [x1, y1, x2, y2]: LevelRect): boolean =>
  p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2;
const msgs = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [e.key] : []));

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
  /** The portal's spot (map), or the levregion it falls in (Level coordinates). */
  branch: [number, number] | LevelRect;
  /** Where the down stairs may be (Rog-strt: one of its four exits). */
  down: [number, number][];
  /** null: des.stair() at random. */
  locaUp: [number, number] | null;
  locaDown: [number, number] | null;
  nemesis: DefId;
  artifact: DefId;
  base: DefId;
  /** Where the artifact and the nemesis may be (Pri-goal draws one of two spots). */
  artifactAt: [number, number][];
  /** The goal's up stairs (map), or the levregion they fall in (Level coordinates). */
  goalUp: [number, number] | LevelRect;
}

const CASES: readonly RoleCase[] = [
  {
    role: 'priest',
    strt: PRI_STRT,
    loca: PRI_LOCA,
    goal: PRI_GOAL,
    fila: 'nh:pri-fila',
    filb: 'nh:pri-filb',
    leader: 'nh:arch_priest',
    leaderAt: [28, 10],
    leaderGear: [
      ['nh:mace', 4],
      ['nh:robe', 4],
    ],
    guardian: 'nh:acolyte',
    guardians: 8,
    branch: [5, 4],
    down: [[52, 9]],
    locaUp: [43, 5],
    locaDown: [20, 6],
    nemesis: 'nh:nalzok',
    artifact: 'nh:mitre_of_holiness',
    base: 'nh:helm_of_brilliance',
    artifactAt: [
      [14, 4],
      [13, 7],
    ],
    goalUp: [20, 5],
  },
  {
    role: 'rogue',
    strt: ROG_STRT,
    loca: ROG_LOCA,
    goal: ROG_GOAL,
    fila: 'nh:rog-fila',
    filb: 'nh:rog-filb',
    leader: 'nh:master_of_thieves',
    leaderAt: [36, 11],
    leaderGear: [
      ['nh:dagger', 2],
      ['nh:leather_armor', 5],
      ['nh:silver_dagger', 4],
    ],
    guardian: 'nh:thug',
    guardians: 9,
    branch: [19, 9],
    down: [
      [33, 0],
      [0, 12],
      [25, 20],
      [75, 5],
    ],
    locaUp: null,
    locaDown: null,
    nemesis: 'nh:master_assassin',
    artifact: 'nh:master_key_of_thievery',
    base: 'nh:skeleton_key',
    artifactAt: [[38, 10]],
    goalUp: ROG_GOAL_UP_REGION,
  },
  {
    role: 'ranger',
    strt: RAN_STRT,
    loca: RAN_LOCA,
    goal: RAN_GOAL,
    fila: 'nh:ran-fila',
    filb: 'nh:ran-filb',
    leader: 'nh:orion',
    leaderAt: [20, 10],
    leaderGear: [
      ['nh:leather_armor', 4],
      ['nh:ya', 4],
      ['nh:yumi', 4],
    ],
    guardian: 'nh:hunter',
    guardians: 8,
    branch: RAN_STRT_BRANCH,
    down: [[10, 10]],
    locaUp: [25, 5],
    locaDown: [27, 18],
    nemesis: 'nh:scorpius',
    artifact: 'nh:longbow_of_diana',
    base: 'nh:bow',
    artifactAt: [[37, 10]],
    goalUp: [19, 10],
  },
];

/** The spot a case names: a map spot, or any spot of a Level rectangle. */
const spotOk = (
  def: LevelDef,
  l: Level,
  s: [number, number] | LevelRect,
  p: { x: number; y: number },
) => (s.length === 2 ? p.x === at(def, l, ...s).x && p.y === at(def, l, ...s).y : inRect(p, s));

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
      expect(c.down.map(([x, y]) => at(c.strt, home, x, y))).toContainEqual(home.down);
      expect(terrainIdAt(home, ...xy(home.down!))).toBe(T.stairs_down);
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
      expect(spotOk(c.strt, home, c.branch, portal)).toBe(true);
      expect(terrainIdAt(home, portal.x, portal.y)).toBe(T.floor);
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
      const fila = goTo(state, QUEST, 2);
      expect(fila.def).toBe(c.fila);
      expect(fila.up).not.toBeNull();
      expect(fila.down).not.toBeNull();
      nothingInRock(state, fila);
      const loca = goTo(state, QUEST, 3);
      expect(loca.def).toBe(c.loca.id);
      expect(isQlocate(state, loca)).toBe(true);
      expect(terrainIdAt(loca, ...xy(loca.up!))).toBe(T.stairs_up);
      expect(terrainIdAt(loca, ...xy(loca.down!))).toBe(T.stairs_down);
      if (c.locaUp) expect(loca.up).toEqual(at(c.loca, loca, ...c.locaUp));
      if (c.locaDown) expect(loca.down).toEqual(at(c.loca, loca, ...c.locaDown));
      nothingInRock(state, loca);
      for (let d = 4; d < levels(state); d++) {
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
      const goal = goTo(state, QUEST, levels(state));
      expect(goal.def).toBe(c.goal.id);
      expect(isQgoal(state, goal)).toBe(true);
      expect(goal.down).toBeNull();
      expect(spotOk(c.goal, goal, c.goalUp, goal.up!)).toBe(true);
      expect(terrainIdAt(goal, ...xy(goal.up!))).toBe(T.stairs_up);
      const arti = on(state, goal).find((e) => e.c.item?.artifact === c.artifact)!;
      expect(arti.def).toBe(c.base);
      const spots = c.artifactAt.map(([x, y]) => at(c.goal, goal, x, y));
      expect(spots).toContainEqual({ x: arti.c.pos!.x, y: arti.c.pos!.y });
      expect(arti.c.item).toMatchObject({ buc: 'blessed', spe: 0 });
      const nemesis = monsOn(state, goal).find((m) => m.def === c.nemesis)!;
      expect(nemesis.c.pos).toMatchObject({ x: arti.c.pos!.x, y: arti.c.pos!.y });
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
    const back = findPortal(home)!;
    expect(playerPos(state)).toEqual({ x: back.x, y: back.y });
    run(state, (ctx) => dotrap(ctx, back));
    expect(getLevel(state).id).toBe(main.id);
    expect(playerPos(state)).toEqual({ x: p.x, y: p.y });
  });
});

describe("the Priest's levels", () => {
  test('every quest level is a graveyard; the besiegers on the open field', () => {
    for (const seed of [1, 2, 3]) {
      const state = fresh(seed, 'priest');
      heal(state);
      const home = goTo(state, QUEST, 1);
      // outside the temple's walls (map columns 20..55, rows 3..16, and its gate's 18..19,
      // rows 8..11): selection.floodfill(05,04) taken once 05,04 is floor is the open field
      const o = at(PRI_STRT, home, 0, 0);
      const zombies = monsOn(state, home).filter((m) => m.def === 'nh:human_zombie');
      expect(zombies).toHaveLength(12);
      for (const z of zombies) {
        const x = z.c.pos!.x - o.x;
        const y = z.c.pos!.y - o.y;
        const inside =
          (x >= 20 && x <= 55 && y >= 3 && y <= 16) || (x >= 18 && y >= 8 && y <= 11 && x <= 19);
        expect(inside, `${x},${y}`).toBe(false);
      }
      expect(altarAlign(terrainIdAt(home, ...xy(at(PRI_STRT, home, 28, 9)))!)).toBe(A_NONE);
      expect(home.shrines ?? []).toEqual([]);
      expect(home.rooms.filter((r) => r.type === 'nh:temple')).toHaveLength(1);
      for (let d = 1; d <= levels(state); d++) {
        const l = goTo(state, QUEST, d);
        expect(isGraveyard(state, l.id), l.def).toBe(true);
      }
    }
    // another role's quest levels are not
    const val = fresh(1, 'valkyrie');
    heal(val);
    expect(isGraveyard(val, goTo(val, QUEST, 1).id)).toBe(false);
  });

  test('Pri-loca: the morgues, the unaligned shrine with its priest, the hostile cleric', () => {
    for (const seed of [1, 2, 3]) {
      const state = fresh(seed, 'priest');
      heal(state);
      const loca = goTo(state, QUEST, 3);
      // four morgues (one becomes ordinary when she arrives in it: check_special_room())
      expect(loca.rooms).toHaveLength(5);
      expect(loca.rooms.filter((r) => r.type === 'nh:morgue').length).toBeGreaterThanOrEqual(3);
      expect(loca.rooms.filter((r) => r.type === 'nh:temple')).toHaveLength(1);
      const altar = at(PRI_LOCA, loca, 20, 7);
      expect(altarAlign(terrainIdAt(loca, altar.x, altar.y)!)).toBe(A_NONE);
      expect(loca.shrines).toEqual([altar]);
      const clerics = monsOn(state, loca).filter((m) => m.def === 'nh:aligned_cleric');
      const priest = clerics.find((m) => epriOf({ state }, m.id) !== null);
      expect(priest).toBeDefined();
      const roamer = clerics.find((m) => epriOf({ state }, m.id) === null)!;
      expect(roamer.c.pos).toMatchObject(altar);
      expect(roamer.c.monster?.peaceful).toBe(false);
      // the morgues are stocked (the level has no other random monsters)
      expect(monsOn(state, loca).length).toBeGreaterThan(clerics.length);
    }
  });

  test('Pri-goal: the Mitre is erodeproof; the fillers have morgue rooms', () => {
    let morgues = 0;
    for (const seed of [1, 2, 3]) {
      const state = fresh(seed, 'priest');
      heal(state);
      const goal = goTo(state, QUEST, levels(state));
      const mitre = on(state, goal).find((e) => e.c.item?.artifact === 'nh:mitre_of_holiness')!;
      expect(mitre.c.item?.erodeproof).toBe(true);
      morgues += goTo(state, QUEST, 2).rooms.filter((r) => r.type === 'nh:morgue').length;
    }
    expect(morgues).toBeGreaterThan(0);
  });
});

describe("the Rogue's levels", () => {
  test('Rog-strt: stairs on a shuffled exit, stair mimics on the others, the street crowd', () => {
    const stairSpots = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5]) {
      const state = fresh(seed, 'rogue');
      heal(state);
      const home = goTo(state, QUEST, 1);
      expect(levelFlags({ defs, state }, home).nommap).toBe(true);
      const exits = (
        [
          [33, 0],
          [0, 12],
          [25, 20],
          [75, 5],
        ] as const
      ).map(([x, y]) => at(ROG_STRT, home, x, y));
      const o = at(ROG_STRT, home, 0, 0);
      stairSpots.add(`${home.down!.x - o.x},${home.down!.y - o.y}`);
      // (a chameleon may be a mimic too: only the three on the exits look like stairs)
      const mimics = monsOn(state, home).filter(
        (m) =>
          ['nh:giant_mimic', 'nh:large_mimic', 'nh:small_mimic'].includes(m.def) &&
          exits.some((p) => p.x === m.c.pos!.x && p.y === m.c.pos!.y),
      );
      expect(mimics.map((m) => m.def).sort()).toEqual([
        'nh:giant_mimic',
        'nh:large_mimic',
        'nh:small_mimic',
      ]);
      for (const m of mimics)
        expect(mappearance({ state }, m.id)).toEqual({ type: 'furniture', id: T.stairs_down });
      expect(exits).toContainEqual(home.down);
      // 4 of each at the exits, then 4 to 7 pairs on the streets
      // (not counting chameleons in those forms)
      const real = monsOn(state, home).filter((m) => chamOf({ state }, m.id) === null);
      const nymphs = real.filter((m) => m.def === 'nh:water_nymph');
      const leps = real.filter((m) => m.def === 'nh:leprechaun');
      expect(nymphs.length).toBe(leps.length);
      expect(nymphs.length).toBeGreaterThanOrEqual(8);
      expect(nymphs.length).toBeLessThanOrEqual(11);
      expect([...nymphs, ...leps].every((m) => m.c.monster?.peaceful === false)).toBe(true);
      // the Master's daggers: d(2,4) of them, not cursed
      const master = monsOn(state, home).find((m) => m.def === 'nh:master_of_thieves')!;
      const daggers = gear(state, master.id).find((x) => x.def === 'nh:dagger')!;
      expect(daggers.c.item!.quantity).toBeGreaterThanOrEqual(2);
      expect(daggers.c.item!.quantity).toBeLessThanOrEqual(8);
      expect(daggers.c.item!.buc).not.toBe('cursed');
    }
    expect(stairSpots.size).toBeGreaterThan(1);
  });

  test("Rog-loca's cursed scroll; Rog-goal's up stairs, tin and sharks", () => {
    for (const seed of [1, 2, 3]) {
      const state = fresh(seed, 'rogue');
      heal(state);
      const loca = goTo(state, QUEST, 3);
      const scroll = on(state, loca).find((e) => e.def === 'nh:scroll_of_teleportation')!;
      expect(scroll.c.pos).toMatchObject(at(ROG_LOCA, loca, 11, 18));
      expect(scroll.c.item?.buc).toBe('cursed');
      const goal = goTo(state, QUEST, levels(state));
      const a = at(ROG_GOAL, goal, 1, 18);
      const b = at(ROG_GOAL, goal, 4, 20);
      expect(inRect(goal.up!, [a.x, a.y, b.x, b.y])).toBe(false);
      expect(terrainIdAt(goal, ...xy(at(ROG_GOAL, goal, 1, 1)))).toBe(T.floor);
      const tin = on(state, goal).find((e) => e.def === 'nh:tin')!;
      expect(tin.c.pos).toMatchObject(at(ROG_GOAL, goal, 26, 12));
      expect(tin.c.item?.corpseOf).toBe('nh:chameleon');
      const sharks = monsOn(state, goal).filter((m) => m.def === 'nh:shark');
      expect(sharks).toHaveLength(4);
      expect(trapAt(goal, ...xy(at(ROG_GOAL, goal, 37, 7)))?.def).toBe(TRAP.spikedPit);
    }
  });
});

describe("the Ranger's levels", () => {
  test('Ran-strt: woods off the map only, the sleeping minotaur, the centaurs', () => {
    let trees = 0;
    for (const seed of [1, 2, 3]) {
      const state = fresh(seed, 'ranger');
      heal(state);
      const home = goTo(state, QUEST, 1);
      const o = at(RAN_STRT, home, 0, 0);
      expect(o).toEqual({ x: 0, y: 0 }); // halign "left", 21 rows
      const rows = RAN_STRT.map!.rows;
      for (let x = 0; x <= 40; x++)
        for (let y = 0; y <= 20; y++) {
          const ch = rows[y]![x]!;
          const id = terrainIdAt(home, x, y);
          if (ch === ' ') expect(id, `${x},${y}`).toBe(T.stone);
          if (ch === '.') expect(id === T.tree, `${x},${y}`).toBe(false);
        }
      // off the map, the lit field: floor, a tree 1 time in 20 (the region ends at row 19)
      for (let x = 41; x < home.width; x++)
        for (let y = 0; y < home.height; y++) {
          const id = terrainIdAt(home, x, y);
          if (id === T.tree) {
            expect(x <= 76 && y <= 19, `${x},${y}`).toBe(true);
            trees++;
          } else expect(id, `${x},${y}`).toBe(T.floor);
        }
      const mino = monsOn(state, home).find((m) => m.def === 'nh:minotaur')!;
      expect(mino.c.pos).toMatchObject(at(RAN_STRT, home, 33, 9));
      expect(mino.c.monster?.peaceful).toBe(false);
      expect(mino.c.monster?.asleep).toBe(true);
      const centaurs = monsOn(state, home).filter((m) => m.def === 'nh:forest_centaur');
      expect(centaurs).toHaveLength(18);
      expect(centaurs.every((m) => m.c.monster?.peaceful === false)).toBe(true);
    }
    // 5% of the 36 x 20 field cells off the map, over three games
    expect(trees).toBeGreaterThan(36 * 20 * 3 * 0.02);
    expect(trees).toBeLessThan(36 * 20 * 3 * 0.1);
  });

  test("Ran-loca: the wumpus asleep on the down stairs; a pit's bottom, once per pit", () => {
    for (const seed of [1, 2]) {
      const state = fresh(seed, 'ranger');
      heal(state);
      const loca = goTo(state, QUEST, 3);
      const wumpus = monsOn(state, loca).find((m) => m.def === 'nh:wumpus')!;
      expect(wumpus.c.pos).toMatchObject(loca.down!);
      expect(wumpus.c.monster?.asleep).toBe(true);
      const pit = loca.traps.find((t) => t.def === TRAP.spikedPit)!;
      const fall = (): string[] => {
        getPlayer(state).c.pos = { level: loca.id, x: pit.x, y: pit.y };
        return msgs(run(state, (ctx) => dotrap(ctx, pit)));
      };
      expect(fall()).toContain('trap.pit.bottom');
      expect(fall()).not.toContain('trap.pit.bottom');
    }
    // not for another role
    const state = fresh(1, 'priest');
    heal(state);
    const loca = goTo(state, QUEST, 3);
    const i = loca.cells.findIndex(
      (_, k) =>
        terrainIdAt(loca, k % loca.width, Math.floor(k / loca.width)) === T.floor &&
        !trapAt(loca, k % loca.width, Math.floor(k / loca.width)),
    );
    const [px, py] = [i % loca.width, Math.floor(i / loca.width)];
    let pit = null as ReturnType<typeof maketrap> | null;
    run(state, (ctx) => (pit = maketrap(ctx, loca.id, px, py, TRAP.pit)));
    getPlayer(state).c.pos = { level: loca.id, x: px, y: py };
    expect(msgs(run(state, (ctx) => dotrap(ctx, pit!)))).toContain('trap.pit.fall');
    expect(msgs(run(state, (ctx) => dotrap(ctx, pit!)))).not.toContain('trap.pit.bottom');
  });

  test('Ran-fila: treed caves with no walls; Ran-goal: walled, the Longbow on the throne', () => {
    for (const seed of [1, 2]) {
      const state = fresh(seed, 'ranger');
      heal(state);
      const fila = goTo(state, QUEST, 2);
      const kinds = new Set(
        fila.cells.map((_, i) => terrainIdAt(fila, i % fila.width, Math.floor(i / fila.width))),
      );
      expect(kinds.has(T.tree)).toBe(true);
      expect(kinds.has(T.vwall) || kinds.has(T.hwall)).toBe(false);
      const goal = goTo(state, QUEST, levels(state));
      expect(terrainIdAt(goal, ...xy(at(RAN_GOAL, goal, 37, 10)))).toBe(T.throne);
      // des.wallify(): the stone along the outer path is wall
      expect(terrainIdAt(goal, ...xy(at(RAN_GOAL, goal, 10, 1)))).toBe(T.hwall);
    }
  });
});
