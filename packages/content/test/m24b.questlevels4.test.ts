// m24 step 10: the Samurai's, Tourist's and Wizard's quest levels, and every role's quest. For each
// role and several seeds: the home level with the leader (his custom inventory), the guardians
// peaceful, the portal on the branch spot (Sam-strt: anywhere in its rectangle) leading back to
// the main dungeon's portal level; the fillers and the locate level with their stairs; the goal
// with the nemesis carrying the Bell and the named quest artifact; no monster or object in rock.
// Then each role through the main dungeon's portal and back, the levels' own pieces (Lord Sato's
// erodeproof kit, the "ponds", Sam-goal's random stairs and openings; Tou-strt's historic
// statues and kitless visitors, Tou-loca's special rooms and street traps, Tou-goal's amorous
// demons, prisoners and wallify; Wiz-strt's clouds, Wiz-loca's secret doors, Wiz-goal's
// non-coaligned altar and prisoners), and every RoleDef's five quest levels and portal.
// Outcomes over seeds, never a lucky one.
// ref: dat/Sam-*.lua, Tou-*.lua, Wiz-*.lua; src/sp_lev.c; src/pager.c waterbody_name()
import {
  contents,
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
import { altarAlign } from '../src/aligntyp';
import { epriOf } from '../src/epri';
import { monFemale } from '../src/gender';
import {
  QUEST,
  QSTART,
  isQgoal,
  isQlocate,
  isQstart,
  levelFlags,
  questEntry,
} from '../src/levelflags';
import { waterbodyName } from '../src/liquid';
import { ualignBase } from '../src/luck';
import { minvent } from '../src/mongear';
import { findPortal, portalDest } from '../src/portal';
import {
  SAM_GOAL,
  SAM_GOAL_GAPS,
  SAM_GOAL_UP,
  SAM_LOCA,
  SAM_STRT,
  SAM_STRT_BRANCH,
} from '../src/quest/sam';
import { TOU_GOAL, TOU_LOCA, TOU_STRT } from '../src/quest/tou';
import { WIZ_GOAL, WIZ_LOCA, WIZ_LOCA_RINGS, WIZ_STRT } from '../src/quest/wiz';
import { mapToLevel } from '../src/sp_lev';
import { isHistoric } from '../src/statuestate';
import { T, isSdoorId, isWallId, terrainIdAt } from '../src/terrain';
import { dotrap } from '../src/trap';
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
const same = (a: { x: number; y: number }, b: { x: number; y: number }): boolean =>
  a.x === b.x && a.y === b.y;
/** A map rectangle in Level coordinates. */
const mapRect = (
  def: LevelDef,
  l: Level,
  [x1, y1, x2, y2]: readonly [number, number, number, number],
): LevelRect => {
  const a = at(def, l, x1, y1);
  const b = at(def, l, x2, y2);
  return [a.x, a.y, b.x, b.y];
};

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
  /** The portal's spot (map), or the map rectangle of its levregion. */
  branch: [number, number] | { rect: LevelRect };
  down: [number, number];
  locaUp: [number, number];
  locaDown: [number, number];
  nemesis: DefId;
  artifact: DefId;
  base: DefId;
  artifactAt: [number, number];
  /** Where the goal's up stairs may be (map spots). */
  goalUp: readonly (readonly [number, number])[];
}

const CASES: readonly RoleCase[] = [
  {
    role: 'samurai',
    strt: SAM_STRT,
    loca: SAM_LOCA,
    goal: SAM_GOAL,
    fila: 'nh:sam-fila',
    filb: 'nh:sam-filb',
    leader: 'nh:lord_sato',
    leaderAt: [20, 4],
    leaderGear: [
      ['nh:katana', 4],
      ['nh:splint_mail', 5],
    ],
    guardian: 'nh:roshi',
    guardians: 8,
    branch: { rect: SAM_STRT_BRANCH },
    down: [29, 4],
    locaUp: [10, 10],
    locaDown: [25, 14],
    nemesis: 'nh:ashikaga_takauji',
    artifact: 'nh:tsurugi_of_muramasa',
    base: 'nh:tsurugi',
    artifactAt: [22, 10],
    goalUp: SAM_GOAL_UP,
  },
  {
    role: 'tourist',
    strt: TOU_STRT,
    loca: TOU_LOCA,
    goal: TOU_GOAL,
    fila: 'nh:tou-fila',
    filb: 'nh:tou-filb',
    leader: 'nh:twoflower',
    leaderAt: [64, 3],
    leaderGear: [
      ['nh:hawaiian_shirt', 3],
      ['nh:low_boots', 3],
    ],
    guardian: 'nh:guide',
    guardians: 11,
    branch: [68, 14],
    down: [66, 3],
    locaUp: [10, 4],
    locaDown: [73, 5],
    nemesis: 'nh:master_of_thieves',
    artifact: 'nh:platinum_yendorian_express_card',
    base: 'nh:credit_card',
    artifactAt: [4, 1],
    goalUp: [[70, 8]],
  },
  {
    role: 'wizard',
    strt: WIZ_STRT,
    loca: WIZ_LOCA,
    goal: WIZ_GOAL,
    fila: 'nh:wiz-fila',
    filb: 'nh:wiz-filb',
    leader: 'nh:neferet_the_green',
    leaderAt: [23, 5],
    leaderGear: [
      ['nh:elven_cloak', 5],
      ['nh:quarterstaff', 5],
    ],
    guardian: 'nh:apprentice',
    guardians: 8,
    branch: [63, 6],
    down: [30, 10],
    locaUp: [3, 17],
    locaDown: [48, 10],
    nemesis: 'nh:dark_one',
    artifact: 'nh:eye_of_the_aethiopica',
    base: 'nh:amulet_of_esp',
    artifactAt: [16, 11],
    goalUp: [[55, 5]],
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
      if ('rect' in c.branch)
        expect(inRect(portal, mapRect(c.strt, home, c.branch.rect))).toBe(true);
      else expect(portal).toMatchObject(at(c.strt, home, ...c.branch));
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
      expect(loca.up).toEqual(at(c.loca, loca, ...c.locaUp));
      expect(loca.down).toEqual(at(c.loca, loca, ...c.locaDown));
      expect(terrainIdAt(loca, ...xy(loca.up!))).toBe(T.stairs_up);
      expect(terrainIdAt(loca, ...xy(loca.down!))).toBe(T.stairs_down);
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
      expect(c.goalUp.map(([x, y]) => at(c.goal, goal, x, y))).toContainEqual(goal.up);
      expect(terrainIdAt(goal, ...xy(goal.up!))).toBe(T.stairs_up);
      const arti = on(state, goal).find((e) => e.c.item?.artifact === c.artifact)!;
      expect(arti.def).toBe(c.base);
      expect(arti.c.pos).toMatchObject(at(c.goal, goal, ...c.artifactAt));
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

describe("the Samurai's levels", () => {
  test("Sam-strt: Lord Sato's kit erodeproof, the throne room, the ponds", () => {
    const portals = new Set<string>();
    for (const seed of [1, 2, 3, 4]) {
      const state = fresh(seed, 'samurai');
      heal(state);
      const home = goTo(state, QUEST, 1);
      const sato = monsOn(state, home).find((m) => m.def === 'nh:lord_sato')!;
      for (const o of gear(state, sato.id)) {
        expect(o.c.item?.erodeproof).toBe(true);
        expect(o.c.item?.buc).not.toBe('cursed');
      }
      expect(home.rooms.filter((r) => r.type === 'nh:court')).toHaveLength(1);
      // pager.c: the two moat squares are ponds here, a moat elsewhere
      for (const [x, y] of [
        [14, 14],
        [32, 14],
      ] as const) {
        const p = at(SAM_STRT, home, x, y);
        expect(terrainIdAt(home, p.x, p.y)).toBe(T.moat);
        expect(waterbodyName({ defs }, home, p.x, p.y)).toBe('liquid.name.pond');
      }
      const loca = goTo(state, QUEST, 3);
      const moat = at(SAM_LOCA, loca, 17, 4);
      expect(waterbodyName({ defs }, loca, moat.x, moat.y)).toBe('liquid.name.moat');
      const p = findPortal(home)!;
      portals.add(`${p.x},${p.y}`);
    }
    // the portal's spot is drawn in the rectangle
    expect(portals.size).toBeGreaterThan(1);
  });

  test('Sam-goal: the up stairs on one of two spots, one opening of each ring', () => {
    const ups = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const state = fresh(seed, 'samurai');
      heal(state);
      const goal = goTo(state, QUEST, levels(state));
      ups.add(`${goal.up!.x},${goal.up!.y}`);
      for (const ring of SAM_GOAL_GAPS) {
        const open = ring.filter(
          ([x, y]) => terrainIdAt(goal, ...xy(at(SAM_GOAL, goal, x, y))) === T.floor,
        );
        expect(open).toHaveLength(1);
      }
      // the placeholder is floor again unless the stairs were drawn there
      const ph = at(SAM_GOAL, goal, 2, 11);
      expect([T.floor, T.stairs_up]).toContain(terrainIdAt(goal, ph.x, ph.y));
      expect(trapAt(goal, ...xy(at(SAM_GOAL, goal, 24, 10)))?.def).toBe('nh:squeaky_board');
    }
    expect(ups.size).toBe(2);
  });

  test('Sam-fila: pools and floor, no walls; Sam-filb a maze level', () => {
    const state = fresh(1, 'samurai');
    heal(state);
    const fila = goTo(state, QUEST, 2);
    expect(fila.palette.includes(T.pool)).toBe(true);
    for (let i = 0; i < fila.cells.length; i++)
      expect(isWallId(fila.palette[fila.cells[i]!])).toBe(false);
    expect(levelFlags({ defs, state }, fila).maze).toBeUndefined();
    const filb = goTo(state, QUEST, 4);
    expect(levelFlags({ defs, state }, filb).maze).toBe(true);
  });
});

describe("the Tourist's levels", () => {
  test('Tou-strt: the historic wumpus statues, empty; the visitors without their kit', () => {
    for (const seed of [1, 2, 3]) {
      const state = fresh(seed, 'tourist');
      heal(state);
      const home = goTo(state, QUEST, 1);
      const statues = on(state, home).filter((e) => e.def === 'nh:statue');
      for (const [x, y] of [
        [34, 8],
        [37, 8],
        [34, 10],
        [37, 10],
      ] as const) {
        const s = statues.find((e) => same(e.c.pos!, at(TOU_STRT, home, x, y)))!;
        expect(s.c.item?.corpseOf).toBe('nh:wumpus');
        expect(isHistoric(state, s.id)).toBe(true);
        expect(contents(state, s.id)).toEqual([]);
      }
      const mons = monsOn(state, home);
      for (const id of ['nh:barbarian', 'nh:rogue']) {
        const m = mons.find((e) => e.def === id)!;
        expect(m.c.monster?.peaceful).toBe(true);
        expect(gear(state, m.id)).toEqual([]);
      }
      for (const id of ['nh:werewolf', 'nh:rock_troll'])
        expect(mons.find((e) => e.def === id)?.c.monster?.peaceful).toBe(true);
      const watch = mons.filter((e) => e.def === 'nh:watchman');
      expect(watch.map((m) => m.c.pos)).toEqual(
        expect.arrayContaining([
          expect.objectContaining(at(TOU_STRT, home, 35, 8)),
          expect.objectContaining(at(TOU_STRT, home, 36, 8)),
        ]),
      );
      expect(home.rooms.filter((r) => r.type === 'nh:morgue')).toHaveLength(1);
    }
  });

  test("Tou-loca: its shops, barracks, temple and zoo; no trap in a shop; the visitors' kit", () => {
    for (const seed of [1, 2, 3, 4]) {
      const state = fresh(seed, 'tourist');
      heal(state);
      const loca = goTo(state, QUEST, 3);
      const kinds = loca.rooms.map((r) => r.type).filter((t) => t !== undefined);
      expect(kinds.filter((t) => t === 'nh:barracks')).toHaveLength(3);
      expect(kinds.filter((t) => t === 'nh:temple')).toHaveLength(1);
      expect(kinds.filter((t) => t === 'nh:shop')).toHaveLength(2);
      const shks = monsOn(state, loca).filter((m) => m.def === 'nh:shopkeeper');
      expect(shks).toHaveLength(2);
      const shops = [
        mapRect(TOU_LOCA, loca, [15, 3, 20, 5]),
        mapRect(TOU_LOCA, loca, [62, 3, 71, 4]),
      ];
      // the script's nine traps and any the zoo or the barracks bring: none in a shop
      for (const t of loca.traps)
        expect(
          shops.some((r) => inRect(t, r)),
          t.def,
        ).toBe(false);
      const paper = on(state, loca).filter((e) => e.def === 'nh:scroll_of_blank_paper');
      expect(
        paper.filter((e) => same(e.c.pos!, at(TOU_LOCA, loca, 71, 12))).length,
      ).toBeGreaterThan(0);
      const peacefulWizards = monsOn(state, loca).filter(
        (m) =>
          ['nh:wizard', 'nh:aligned_cleric', 'nh:dwarf'].includes(m.def) && m.c.monster?.peaceful,
      );
      // a visitor comes without its kit (keep_default_invent = false)
      for (const m of peacefulWizards) expect(gear(state, m.id)).toEqual([]);
      nothingInRock(state, loca);
    }
  });

  test("Tou-goal: the amorous demons' genders, the prisoners, the Kops, the wallified gap", () => {
    for (const seed of [1, 2, 3]) {
      const state = fresh(seed, 'tourist');
      heal(state);
      const goal = goTo(state, QUEST, levels(state));
      const ctx = { state, defs };
      const demons = monsOn(state, goal).filter((m) => m.def === 'nh:incubus');
      const female = (x: number, y: number): boolean | undefined => {
        const d = demons.find((m) => same(m.c.pos!, at(TOU_GOAL, goal, x, y)));
        return d && monFemale(ctx, d);
      };
      expect([female(2, 8), female(8, 8)]).toEqual([true, true]);
      expect([female(2, 14), female(8, 14), female(2, 17), female(8, 17)]).toEqual([
        false,
        false,
        false,
        false,
      ]);
      const prisoners = monsOn(state, goal).filter((m) => m.def === 'nh:prisoner');
      expect(prisoners.map((m) => xy(m.c.pos!)).sort()).toEqual(
        [
          [19, 13],
          [21, 13],
          [24, 13],
        ]
          .map(([x, y]) => xy(at(TOU_GOAL, goal, x!, y!)))
          .sort(),
      );
      const kops = monsOn(state, goal).filter((m) =>
        ['nh:kop_kaptain', 'nh:kop_lieutenant', 'nh:keystone_kop'].includes(m.def),
      );
      expect(kops.length).toBeGreaterThanOrEqual(9);
      expect(kops.every((m) => m.c.monster?.peaceful === false)).toBe(true);
      // des.wallify(): the stone beside the passage between the secret doors became walls
      for (const y of [9, 11])
        expect(isWallId(terrainIdAt(goal, ...xy(at(TOU_GOAL, goal, 35, y))))).toBe(true);
      const shops = mapRect(TOU_GOAL, goal, [60, 14, 71, 18]);
      for (const t of goal.traps) expect(inRect(t, shops)).toBe(false);
      expect(goal.rooms.filter((r) => r.type === 'nh:barracks')).toHaveLength(3);
      expect(monsOn(state, goal).filter((m) => m.def === 'nh:shopkeeper')).toHaveLength(2);
    }
  });

  test('Tou-fila and Tou-filb: walled caves, not maze levels', () => {
    const state = fresh(2, 'tourist');
    heal(state);
    for (const d of [2, 4]) {
      const l = goTo(state, QUEST, d);
      expect(levelFlags({ defs, state }, l).maze).toBeUndefined();
      expect(monsOn(state, l).some((m) => m.def === 'nh:soldier')).toBe(true);
    }
  });
});

describe("the Wizard's levels", () => {
  test('Wiz-strt: clouds on the field, none in the tower; the dark hall; the portal spot', () => {
    for (const seed of [1, 2, 3]) {
      const state = fresh(seed, 'wizard');
      heal(state);
      const home = goTo(state, QUEST, 1);
      const box = mapRect(WIZ_STRT, home, [13, 5, 33, 15]);
      let clouds = 0;
      for (let y = 0; y < home.height; y++)
        for (let x = 0; x < home.width; x++) {
          if (terrainIdAt(home, x, y) !== T.cloud) continue;
          clouds++;
          expect(inRect({ x, y }, box), `${x},${y}`).toBe(false);
        }
      expect(clouds).toBeGreaterThan(50);
      // the irregular hall (from 19,11) is dark, the field lit
      const hall = at(WIZ_STRT, home, 19, 11);
      expect(home.lit[hall.y * home.width + hall.x]).toBe(0);
      const field = at(WIZ_STRT, home, 5, 0);
      expect(home.lit[field.y * home.width + field.x]).toBe(1);
      expect(findPortal(home)).toMatchObject(at(WIZ_STRT, home, 63, 6));
    }
  });

  test("Wiz-loca: a secret door in each ring's walls, the chambers lit", () => {
    for (const seed of [1, 2, 3, 4]) {
      const state = fresh(seed, 'wizard');
      heal(state);
      const loca = goTo(state, QUEST, 3);
      let sdoors = 0;
      for (let y = 0; y < loca.height; y++)
        for (let x = 0; x < loca.width; x++) if (isSdoorId(terrainIdAt(loca, x, y))) sdoors++;
      expect(sdoors).toBe(WIZ_LOCA_RINGS.length);
      for (const r of WIZ_LOCA_RINGS) {
        const [x1, y1, x2, y2] = mapRect(WIZ_LOCA, loca, r.area);
        // on the ring of walls just outside the region
        let here = 0;
        for (let y = y1 - 1; y <= y2 + 1; y++)
          for (let x = x1 - 1; x <= x2 + 1; x++) {
            const edge = x === x1 - 1 || x === x2 + 1 || y === y1 - 1 || y === y2 + 1;
            if (edge && isSdoorId(terrainIdAt(loca, x, y))) {
              here++;
              // the chambers' own walls (the corridor between them has its door on either)
              const wall =
                y === y1 - 1 ? 'north' : y === y2 + 1 ? 'south' : x === x1 - 1 ? 'west' : 'east';
              const corridor = y === at(WIZ_LOCA, loca, 0, 10).y;
              if (r.walls && !corridor) expect(r.walls).toContain(wall);
            }
          }
        expect(here).toBeGreaterThanOrEqual(1);
        expect(loca.lit[y1 * loca.width + x1]).toBe(r.lit ? 1 : 0);
      }
      expect(trapAt(loca, ...xy(at(WIZ_LOCA, loca, 53, 10)))?.def).toBe('nh:anti_magic_field');
    }
  });

  test("Wiz-goal: the Dark One's non-coaligned altar, no priest; the captives peaceful", () => {
    for (const seed of [1, 2, 3]) {
      const state = fresh(seed, 'wizard');
      heal(state);
      const goal = goTo(state, QUEST, levels(state));
      const altar = at(WIZ_GOAL, goal, 16, 11);
      const al = altarAlign(terrainIdAt(goal, altar.x, altar.y)!);
      expect(al).not.toBeNull();
      expect(al).not.toBe(ualignBase(state));
      expect(goal.shrines ?? []).toEqual([]);
      expect(monsOn(state, goal).some((m) => epriOf({ state }, m.id) !== null)).toBe(false);
      expect(goal.rooms.filter((r) => r.type === 'nh:temple')).toHaveLength(1);
      const prisoners = monsOn(state, goal).filter((m) => m.def === 'nh:prisoner');
      expect(prisoners).toHaveLength(2);
      expect(prisoners.every((m) => m.c.monster?.peaceful === true)).toBe(true);
      // (a random monster may stand on a captive's spot: it is made next to it)
      for (const id of ['nh:rogue', 'nh:owlbear', 'nh:wizard', 'nh:hill_giant', 'nh:grey_elf']) {
        const m = monsOn(state, goal).find((e) => e.def === id);
        expect(m?.c.monster?.peaceful, id).toBe(true);
      }
    }
  });

  test('Wiz-fila and Wiz-filb: six rooms joined by corridors', () => {
    const state = fresh(1, 'wizard');
    heal(state);
    for (const d of [2, 4]) {
      const l = goTo(state, QUEST, d);
      expect(l.rooms.filter((r) => r.parent === undefined).length).toBeGreaterThanOrEqual(5);
      expect(l.palette.includes(T.corr)).toBe(true);
    }
  });
});

describe('every role', () => {
  test('has its five quest levels and its home portal', () => {
    const quest = defs.dungeon(QUEST);
    const special = (id: DefId) => quest.special!.find((s) => s.id === id)!;
    const ids = new Set<DefId>();
    expect(defs.roles.length).toBe(13);
    for (const role of defs.roles) {
      const [strt, loca, goal] = (['nh:qstart', 'nh:qlocate', 'nh:qgoal'] as DefId[]).map(
        (s) => special(s).roleVariants![role.id]!,
      );
      const fill = quest.roleFiller!.byRole[role.id]!;
      const five = [strt![0]!, loca![0]!, goal![0]!, fill[0], fill[1]];
      for (const id of five) {
        expect(defs.level(id).id, role.id).toBe(id);
        ids.add(id);
      }
      // the home level's portal back to the main dungeon
      const state = engine.newGame({ seed: 2, character: { role: role.id } }).state;
      heal(state);
      const home = goTo(state, QUEST, 1);
      expect(home.def).toBe(strt![0]);
      expect(special(QSTART).id).toBe(QSTART);
      expect(portalDest(findPortal(home)!)).toEqual(questEntry(state));
    }
    expect(ids.size).toBe(13 * 5);
  });
});
