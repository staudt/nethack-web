// m24 step 8: the Healer's, Knight's and Monk's quest levels. For each role and several seeds:
// the home level with the leader (his custom inventory), the guardians peaceful, the portal on the
// branch spot leading back to the main dungeon's portal level; the fillers and the locate level
// with their stairs; the goal with the nemesis carrying the Bell and the named quest artifact; no
// monster or object in rock. Then each role through the main dungeon's portal and back, and the
// levels' own pieces (Hea-loca's chaotic shrine, Kni-strt's Excalibur, throne room and
// warhorses, Kni-loca's shrine, Mon-strt's besiegers on the open field and its tins, Mon-loca's
// formation, stairs and Elbereth, Mon-goal's unaligned altar under Master Kaen). Outcomes over
// seeds, never a lucky one.
// ref: dat/Hea-*.lua, Kni-*.lua, Mon-*.lua; src/sp_lev.c; src/mkmaze.c fixup_special()
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
import { A_NONE, altarAlign } from '../src/aligntyp';
import { engravingsOn } from '../src/engr';
import { epriOf } from '../src/epri';
import { wornSaddle } from '../src/items';
import { QUEST, isQgoal, isQlocate, isQstart, levelFlags, questEntry } from '../src/levelflags';
import { minvent } from '../src/mongear';
import { findPortal, portalDest } from '../src/portal';
import { HEA_GOAL, HEA_LOCA, HEA_STRT } from '../src/quest/hea';
import { KNI_GOAL, KNI_LOCA, KNI_STRT } from '../src/quest/kni';
import { MON_GOAL, MON_LOCA, MON_STRT } from '../src/quest/mon';
import { desMapPlace, mapToLevel } from '../src/sp_lev';
import { T, terrainIdAt } from '../src/terrain';
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
const run = (state: GameState, fn: (ctx: Ctx) => void): void => {
  probe.fn = fn;
  engine.step(state, { type: 'mod', action: 'qc:run' as DefId });
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
  /** null: des.stair() at random. */
  locaUp: [number, number] | null;
  locaDown: [number, number] | null;
  nemesis: DefId;
  artifact: DefId;
  base: DefId;
  /** Where the artifact and the nemesis may be (Mon-goal draws one of two spots). */
  artifactAt: [number, number][];
  goalUp: [number, number];
}

const CASES: readonly RoleCase[] = [
  {
    role: 'healer',
    strt: HEA_STRT,
    loca: HEA_LOCA,
    goal: HEA_GOAL,
    fila: 'nh:hea-fila',
    filb: 'nh:hea-filb',
    leader: 'nh:hippocrates',
    leaderAt: [37, 10],
    leaderGear: [['nh:silver_dagger', 5]],
    guardian: 'nh:attendant',
    guardians: 8,
    branch: [4, 12],
    down: [37, 9],
    locaUp: [4, 4],
    locaDown: [20, 6],
    nemesis: 'nh:cyclops',
    artifact: 'nh:staff_of_aesculapius',
    base: 'nh:quarterstaff',
    artifactAt: [[20, 6]],
    goalUp: [39, 10],
  },
  {
    role: 'knight',
    strt: KNI_STRT,
    loca: KNI_LOCA,
    goal: KNI_GOAL,
    fila: 'nh:kni-fila',
    filb: 'nh:kni-filb',
    leader: 'nh:king_arthur',
    leaderAt: [9, 7],
    leaderGear: [
      ['nh:long_sword', 4],
      ['nh:plate_mail', 4],
    ],
    guardian: 'nh:page',
    guardians: 6,
    branch: [20, 14],
    down: [40, 7],
    locaUp: [38, 0],
    locaDown: [18, 5],
    nemesis: 'nh:ixoth',
    artifact: 'nh:magic_mirror_of_merlin',
    base: 'nh:mirror',
    artifactAt: [[50, 6]],
    goalUp: [3, 8],
  },
  {
    role: 'monk',
    strt: MON_STRT,
    loca: MON_LOCA,
    goal: MON_GOAL,
    fila: 'nh:mon-fila',
    filb: 'nh:mon-filb',
    leader: 'nh:grand_master',
    leaderAt: [28, 10],
    leaderGear: [['nh:robe', 6]],
    guardian: 'nh:abbot',
    guardians: 8,
    branch: [5, 4],
    down: [52, 9],
    locaUp: null,
    locaDown: null,
    nemesis: 'nh:master_kaen',
    artifact: 'nh:eyes_of_the_overworld',
    base: 'nh:lenses',
    artifactAt: [
      [14, 4],
      [13, 7],
    ],
    goalUp: [20, 5],
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
      const fila = goTo(state, QUEST, 2);
      expect(fila.def).toBe(c.fila);
      expect(fila.up).not.toBeNull();
      expect(fila.down).not.toBeNull();
      nothingInRock(state, fila);
      const loca = goTo(state, QUEST, 3);
      expect(loca.def).toBe(c.loca.id);
      expect(isQlocate(state, loca)).toBe(true);
      expect(loca.up).not.toBeNull();
      expect(loca.down).not.toBeNull();
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
      expect(goal.up).toEqual(at(c.goal, goal, ...c.goalUp));
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
    expect(playerPos(state)).toEqual(at(c.strt, home, ...c.branch));
    const back = findPortal(home)!;
    run(state, (ctx) => dotrap(ctx, back));
    expect(getLevel(state).id).toBe(main.id);
    expect(playerPos(state)).toEqual({ x: p.x, y: p.y });
  });
});

describe("the levels' own pieces", () => {
  test("Hea-loca: the chaotic shrine and its priest; Hea-strt's neutral altar", () => {
    for (const seed of [1, 2]) {
      const state = fresh(seed, 'healer');
      heal(state);
      const home = goTo(state, QUEST, 1);
      expect(altarAlign(terrainIdAt(home, ...xy(at(HEA_STRT, home, 32, 9)))!)).toBe(0);
      const loca = goTo(state, QUEST, 3);
      const altar = at(HEA_LOCA, loca, 13, 5);
      expect(altarAlign(terrainIdAt(loca, altar.x, altar.y)!)).toBe(-1);
      expect(loca.shrines).toEqual([altar]);
      expect(loca.rooms.filter((r) => r.type === 'nh:temple')).toHaveLength(1);
      const priest = monsOn(state, loca).find((m) => epriOf({ state }, m.id) !== null)!;
      expect(priest).toBeDefined();
    }
  });

  test('Kni-strt: Excalibur in King Arthur hands, the throne room, 2-4 warhorses', () => {
    const counts = new Set<number>();
    let saddled = 0;
    let bare = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const state = fresh(seed, 'knight');
      heal(state);
      const home = goTo(state, QUEST, 1);
      const arthur = monsOn(state, home).find((m) => m.def === 'nh:king_arthur')!;
      const sword = gear(state, arthur.id).find((o) => o.def === 'nh:long_sword')!;
      expect(sword.c.item).toMatchObject({ artifact: 'nh:excalibur', buc: 'blessed', spe: 4 });
      expect(terrainIdAt(home, ...xy(at(KNI_STRT, home, 9, 7)))).toBe(T.throne);
      expect(home.rooms.filter((r) => r.type === 'nh:court')).toHaveLength(1);
      const knights = monsOn(state, home).filter((m) => m.def === 'nh:knight');
      expect(knights).toHaveLength(4);
      expect(knights.every((m) => m.c.monster?.peaceful === true)).toBe(true);
      const horses = monsOn(state, home).filter((m) => m.def === 'nh:warhorse');
      expect(horses.length).toBeGreaterThanOrEqual(2);
      expect(horses.length).toBeLessThanOrEqual(4);
      counts.add(horses.length);
      for (const h of horses) {
        expect(h.c.monster?.peaceful).toBe(true);
        const s = wornSaddle(state, h.id);
        if (s) saddled++;
        else bare++;
        expect(gear(state, h.id).map((o) => o.def)).toEqual(s ? ['nh:saddle'] : []);
      }
      // the loca's neutral shrine on the Tor, with its priest
      const loca = goTo(state, QUEST, 3);
      const altar = at(KNI_LOCA, loca, 17, 5);
      expect(altarAlign(terrainIdAt(loca, altar.x, altar.y)!)).toBe(0);
      expect(loca.shrines).toEqual([altar]);
      expect(monsOn(state, loca).some((m) => epriOf({ state }, m.id) !== null)).toBe(true);
    }
    expect(counts.size).toBeGreaterThan(1);
    expect(saddled).toBeGreaterThan(0);
    expect(bare).toBeGreaterThan(0);
  });

  test('Mon-strt: the besiegers on the open field, the tins of spinach, the unaligned altar', () => {
    let open = 0;
    for (const seed of [1, 2, 3, 4]) {
      const state = fresh(seed, 'monk');
      heal(state);
      const home = goTo(state, QUEST, 1);
      // outside the monastery's walls (map columns 18..55, rows 3..16)
      const o = at(MON_STRT, home, 0, 0);
      const outside = (e: Entity): boolean => {
        const x = e.c.pos!.x - o.x;
        const y = e.c.pos!.y - o.y;
        return x < 18 || x > 55 || y < 3 || y > 16;
      };
      const besiegers = monsOn(state, home).filter(
        (m) => m.def === 'nh:earth_elemental' || m.def === 'nh:xorn',
      );
      expect(besiegers).toHaveLength(12);
      // selection.floodfill(05,04): the open field, or (1 game in 10: a tree grown on 05,04)
      // the trees joined to it, and the rest at random anywhere on the map
      if (besiegers.every(outside)) open++;
      const tin = on(state, home).find((e) => e.def === 'nh:tin')!;
      expect(tin.c.pos).toMatchObject(at(MON_STRT, home, 29, 9));
      expect(tin.c.item).toMatchObject({ quantity: 2, spe: 1 });
      expect(tin.c.item?.corpseOf).toBeUndefined();
      const food = on(state, home).find((e) => e.def === 'nh:food_ration')!;
      expect(food.c.pos).toMatchObject(at(MON_STRT, home, 46, 4));
      expect(food.c.item?.quantity).toBe(4);
      expect(altarAlign(terrainIdAt(home, ...xy(at(MON_STRT, home, 28, 9)))!)).toBe(A_NONE);
      expect(home.rooms.filter((r) => r.type === 'nh:temple')).toHaveLength(1);
      expect(home.shrines ?? []).toEqual([]);
    }
    expect(open).toBeGreaterThanOrEqual(2);
  });

  test('Mon-loca: the lava formation in the middle, the stairs in it, Elbereth over the tins', () => {
    for (const seed of [1, 2, 3]) {
      const state = fresh(seed, 'monk');
      heal(state);
      const loca = goTo(state, QUEST, 3);
      const rows = ['......................xxxx', '..L............L...L....xx'];
      const b = desMapPlace(loca, rows.concat(Array(11).fill('x'.repeat(26))), {
        halign: 'center',
        valign: 'center',
      });
      expect(terrainIdAt(loca, b.x + 2, b.y + 1)).toBe(T.lava);
      expect(terrainIdAt(loca, b.x + 15, b.y + 1)).toBe(T.lava);
      const inBlock = (p: { x: number; y: number }): boolean =>
        p.x >= b.x && p.x < b.x + 26 && p.y >= b.y && p.y < b.y + 13;
      expect(inBlock(loca.up!)).toBe(true);
      expect(inBlock(loca.down!)).toBe(true);
      // the level's edge is stone
      for (let x = 0; x < loca.width; x++) {
        expect(terrainIdAt(loca, x, 0)).toBe(T.stone);
        expect(terrainIdAt(loca, x, loca.height - 1)).toBe(T.stone);
      }
      const tin = on(state, loca).find((e) => e.def === 'nh:tin' && e.c.item?.buc === 'blessed')!;
      expect(tin.c.item).toMatchObject({ quantity: 2, spe: 1 });
      const p = tin.c.pos!;
      const words = engravingsOn({ state }, loca).filter(
        (g) => g.e.text === 'Elbereth' && g.x === p.x && g.y === p.y,
      );
      expect(words).toHaveLength(1);
      expect(words[0]!.e.type).toBe('burn');
      // every monster made inside the formation's block
      const mons = monsOn(state, loca).filter(
        (m) => m.def === 'nh:earth_elemental' || m.def === 'nh:xorn',
      );
      expect(mons.length).toBeGreaterThan(0);
      expect(mons.every((m) => inBlock(m.c.pos!))).toBe(true);
    }
  });

  test('Mon-goal: Master Kaen and the Eyes on an unaligned altar, at either spot', () => {
    const seen = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const state = fresh(seed, 'monk');
      heal(state);
      const goal = goTo(state, QUEST, levels(state));
      const kaen = monsOn(state, goal).find((m) => m.def === 'nh:master_kaen')!;
      const p = kaen.c.pos!;
      expect(altarAlign(terrainIdAt(goal, p.x, p.y)!)).toBe(A_NONE);
      const o = at(MON_GOAL, goal, 0, 0);
      seen.add(`${p.x - o.x},${p.y - o.y}`);
    }
    expect(seen).toEqual(new Set(['14,4', '13,7']));
  });
});
