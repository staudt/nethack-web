// The Wizard's quest: the Lonely Tower in a field of clouds by a lake (home), the Tower of Darkness
// ringed by a moat, its walls within walls hiding secret doors (locate), the Dark One's temple
// and dungeon cells with the Eye of the Aethiopica (goal), and the room-and-corridor fillers above
// and below the locate level. ref: dat/Wiz-strt.lua, Wiz-loca.lua, Wiz-goal.lua, Wiz-fila.lua,
// Wiz-filb.lua
//
// Translation notes (DEVIATIONS.md "Quest levels (m24b)"): maps, lit regions, des.replace_terrain()
// (the clouds, the lake's shore, the moat's fords), des.terrain(), the temple, fixed stairs,
// doors and contents are LevelDef data; "mazelevel", "noteleport", "hardfloor" and the
// non-diggable areas are levelflags.ts entries. The irregular regions light or darken their flood
// fill and make no room (lightIrregular()); Wiz-loca's five also run their `contents`, a secret
// door on a wall of the room (create_door() on the flood fill's rectangle, which is the region's
// own here). Monsters keep no names (Pug, Newt: the port has none). Fixups, in the script's order:
// Wiz-strt's irregular region, Neferet the Green's custom inventory and the branch levregion (the
// portal), placed last as fixup_special() does; Wiz-loca's irregular regions and their secret
// doors; Wiz-goal's non-coaligned altar (no priest: a plain altar in the temple) and the Eye of
// the Aethiopica (blessed, named through onameItem()) on it.
import type { Ctx, DefId, Level, LevelContent, LevelDef, RegionDef } from '@nh/core';
import { TEMPLE } from '../epri';
import {
  desRoomDoor,
  makeContents,
  mapToLevel,
  orientDoors,
  type RoomWall,
  type SpLevFixup,
} from '../sp_lev';
import { TRAP } from '../trap';
import {
  altarAt,
  branchAt,
  cls,
  coaligned,
  lightIrregular,
  mon,
  monWithInventory,
  noncoalignment,
  obj,
  questArtifact,
  times,
  trap,
} from './common';

const BAT = 'nh:vampire_bat';
const lit = (x1: number, y1: number, x2: number, y2: number): RegionDef => ({
  area: [x1, y1, x2, y2],
  lit: true,
});
const unlit = (x1: number, y1: number, x2: number, y2: number): RegionDef => ({
  area: [x1, y1, x2, y2],
  lit: false,
});
/** des.monster({ class, x, y, peaceful = 0 }) */
const hostileCls = (c: string, x: number, y: number): LevelContent => ({
  kind: 'monster',
  class: c,
  x,
  y,
  peaceful: false,
});

// ---------------------------------------------------------------------------------------------
// Wiz-strt: the home level

const STRT_MAP: readonly string[] = [
  '............................................................................',
  '.....................C....CC.C........................C.....................',
  '..........CCC.....................CCC.......................................',
  '........CC........-----------.......C.C...C...C....C........................',
  '.......C.....---------------------...C..C..C..C.............................',
  '......C..C...------....\\....------....C.....C...............................',
  '........C...||....|.........|....||.........................................',
  '.......C....||....|.........+....||.........................................',
  '.......C...||---+--.........|....|||........................................',
  '......C....||...............|--S--||........................................',
  '...........||--+--|++----|---|..|.SS..........C......C......................',
  '........C..||.....|..|...|...|--|.||..CC..C.....C..........C................',
  '.......C...||.....|..|.--|.|.|....||.................C..C...................',
  '.....C......||....|..|.....|.|.--||..C..C..........C...........}}}..........',
  '......C.C...||....|..-----.|.....||...C.C.C..............C....}}}}}}........',
  '.........C...------........|------....C..C.....C..CC.C......}}}}}}}}}}}.....',
  '.........CC..---------------------...C.C..C.....CCCCC.C.......}}}}}}}}......',
  '.........C........-----------..........C.C.......CCC.........}}}}}}}}}......',
  '..........C.C.........................C............C...........}}}}}........',
  '......................CCC.C.................................................',
];

/** ref: dat/Wiz-strt.lua */
export const WIZ_STRT: LevelDef = {
  id: 'nh:wiz-strt',
  // (lit omitted: the coin flip is drawn)
  init: { style: 'solidfill', fg: 'nh:stone' },
  map: { rows: [...STRT_MAP] },
  // Dungeon Description (the irregular {19,11,33,15} is the fixup's)
  regions: [lit(0, 0, 75, 19), unlit(35, 0, 49, 3), unlit(43, 12, 49, 16), unlit(30, 10, 31, 10)],
  edits: [
    // clouds over the field, but none within the tower's walls
    { replace: { from: '.', to: 'C', area: [0, 0, 75, 19], chance: 10 } },
    { replace: { from: 'C', to: '.', area: [13, 5, 33, 15], chance: 100 } },
    // the portal's spot stays clear
    { set: [{ char: '.', at: [63, 6] }] },
  ],
  stairs: { down: { x: 30, y: 10 } },
  doors: [
    { x: 31, y: 9, state: 'closed' },
    { x: 16, y: 8, state: 'closed' },
    { x: 28, y: 7, state: 'closed' },
    { x: 34, y: 10, state: 'locked' },
    { x: 35, y: 10, state: 'locked' },
    { x: 15, y: 10, state: 'closed' },
    { x: 19, y: 10, state: 'locked' },
    { x: 20, y: 10, state: 'locked' },
  ],
  // after Neferet the Green (the fixup makes her with her inventory first)
  contents: [
    // The treasure of the lord
    { kind: 'object', id: 'nh:chest', x: 24, y: 5 },
    // apprentice guards for the audience chamber
    ...(
      [
        [30, 7],
        [24, 6],
        [15, 6],
        [15, 12],
        [26, 11],
        [27, 11],
        [19, 9],
        [20, 9],
      ] as const
    ).map(([x, y]) => mon('nh:apprentice', x, y)),
    // Eels in the pond
    mon('nh:giant_eel', 62, 14),
    mon('nh:giant_eel', 69, 15),
    mon('nh:giant_eel', 67, 17),
    // Random traps
    ...times(6, trap()),
    // Monsters on siege duty.
    hostileCls('B', 60, 9),
    hostileCls('W', 60, 10),
    hostileCls('B', 60, 11),
    hostileCls('B', 60, 12),
    hostileCls('i', 60, 13),
    hostileCls('B', 61, 10),
    hostileCls('B', 61, 11),
    hostileCls('B', 61, 12),
    hostileCls('B', 35, 3),
    hostileCls('i', 35, 17),
    hostileCls('B', 36, 17),
    hostileCls('B', 34, 16),
    hostileCls('i', 34, 17),
    hostileCls('W', 67, 2),
    hostileCls('B', 10, 19),
  ],
};

const STRT_FIXUP: SpLevFixup = {
  before(_ctx, level, def) {
    // des.region({ region={19,11,33,15}, lit=0, type="ordinary", irregular=1 })
    lightIrregular(level, def, STRT_MAP, 19, 11, false);
  },
  contents(ctx, level, def) {
    monWithInventory(ctx, level, def, 'nh:neferet_the_green', 23, 5, [
      ['nh:elven_cloak', 5],
      ['nh:quarterstaff', 5],
    ]);
    makeContents(ctx, level, def, def.contents ?? []);
  },
  after(ctx, level, def) {
    // Portal arrival point: des.levregion({ region = {63,06,63,06}, type="branch" })
    branchAt(ctx, level, def, 63, 6);
  },
};

// ---------------------------------------------------------------------------------------------
// Wiz-loca: the Tower of Darkness

const LOCA_MAP: readonly string[] = [
  '.............        .......................................................',
  '..............       .............}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}.......',
  '..............      ..............}.................................}.......',
  '..............      ..............}.-------------------------------.}.......',
  '...............     .........C....}.|.............................|.}.......',
  '...............    ..........C....}.|.---------------------------.|.}.......',
  '...............    .........CCC...}.|.|.........................|.|.}.......',
  '................   ....C....CCC...}.|.|.-----------------------.|.|.}.......',
  '.......C..C.....  .....C....CCC...}.|.|.|......+.......+......|.|.|.}.......',
  '.............C..CC.....C....CCC...}.|.|.|......|-------|......|.|.|.}.......',
  '................   ....C....CCC...}.|.|.|......|.......|......|.|.|.}.......',
  '......C..C.....    ....C....CCC...}.|.|.|......|-------|......|.|.|.}.......',
  '............C..     ...C....CCC...}.|.|.|......+.......+......|.|.|.}.......',
  '........C......    ....C....CCC...}.|.|.-----------------------.|.|.}.......',
  '....C......C...     ........CCC...}.|.|.........................|.|.}.......',
  '......C..C....      .........C....}.|.---------------------------.|.}.......',
  '..............      .........C....}.|.............................|.}.......',
  '.............       ..............}.-------------------------------.}.......',
  '.............        .............}.................................}.......',
  '.............        .............}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}.......',
  '.............        .......................................................',
];

/**
 * Wiz-loca's irregular regions in the script's order: the region (its flood fill's rectangle),
 * lit or not, and the walls its secret door may go on (`math.random(1, #walls)` picks one where
 * the script lists them; all four for "random").
 */
export const WIZ_LOCA_RINGS: readonly {
  area: readonly [number, number, number, number];
  lit: boolean;
  walls: readonly RoomWall[] | null;
}[] = [
  { area: [37, 4, 65, 16], lit: false, walls: null },
  { area: [39, 6, 63, 14], lit: false, walls: null },
  { area: [41, 8, 46, 12], lit: true, walls: ['north', 'south', 'west'] },
  { area: [56, 8, 61, 12], lit: true, walls: ['north', 'south', 'east'] },
  { area: [48, 10, 54, 10], lit: false, walls: null },
];

/** ref: dat/Wiz-loca.lua */
export const WIZ_LOCA: LevelDef = {
  id: 'nh:wiz-loca',
  // (lit omitted: the coin flip is drawn)
  init: { style: 'solidfill', fg: 'nh:stone' },
  map: { rows: [...LOCA_MAP] },
  // Dungeon Description (the irregular regions are the fixup's)
  regions: [lit(0, 0, 75, 20), unlit(48, 8, 54, 8), unlit(48, 12, 54, 12)],
  edits: [
    { replace: { from: '.', to: 'C', area: [0, 0, 30, 20], chance: 15 } },
    { replace: { from: '.', to: '}', area: [68, 0, 75, 20], chance: 25 } },
    { replace: { from: '}', to: '.', area: [34, 1, 68, 19], chance: 2 } },
    { set: [{ char: '.', at: [3, 17] }] },
  ],
  stairs: { up: { x: 3, y: 17 }, down: { x: 48, y: 10 } },
  doors: [
    { x: 55, y: 8, state: 'locked' },
    { x: 55, y: 12, state: 'locked' },
    { x: 47, y: 8, state: 'locked' },
    { x: 47, y: 12, state: 'locked' },
  ],
  contents: [
    ...times(15, obj()),
    // Random traps
    trap(TRAP.spikedPit, 24, 2),
    trap(TRAP.spikedPit, 7, 10),
    trap(TRAP.spikedPit, 23, 5),
    trap(TRAP.spikedPit, 26, 19),
    trap(TRAP.spikedPit, 72, 2),
    trap(TRAP.spikedPit, 72, 12),
    trap(TRAP.rock, 45, 16),
    trap(TRAP.rock, 65, 13),
    trap(TRAP.rock, 55, 6),
    trap(TRAP.rock, 39, 11),
    trap(TRAP.rock, 57, 9),
    trap(TRAP.magic),
    trap(TRAP.statue),
    trap(TRAP.statue),
    trap(TRAP.poly),
    trap(TRAP.antiMagic, 53, 10),
    trap(TRAP.sleepGas),
    trap(TRAP.sleepGas),
    trap(TRAP.dart),
    trap(TRAP.dart),
    trap(TRAP.dart),
    // Random monsters.
    ...times(12, cls('B', false)),
    ...times(7, cls('i', false)),
    ...times(7, mon(BAT)),
    cls('i', false),
  ],
};

/**
 * The irregular regions in order: each lights or darkens its flood fill, then its `contents`
 * puts a secret door on one of its walls.
 */
function towerRings(ctx: Ctx, level: Level, def: LevelDef): void {
  for (const r of WIZ_LOCA_RINGS) {
    const [x1, y1, x2, y2] = r.area;
    lightIrregular(level, def, LOCA_MAP, x1, y1, r.lit);
    // des.door({ state="secret", wall=walls[math.random(1, #walls)] }), or wall="random"
    const walls: readonly RoomWall[] = r.walls
      ? [r.walls[ctx.rng.rn2(r.walls.length)] as RoomWall]
      : ['north', 'south', 'west', 'east'];
    const a = mapToLevel(def, level, x1, y1);
    const b = mapToLevel(def, level, x2, y2);
    desRoomDoor(ctx, level, { lx: a.x, ly: a.y, hx: b.x, hy: b.y }, walls);
  }
  orientDoors(ctx, level);
}

const LOCA_FIXUP: SpLevFixup = {
  before(ctx, level, def) {
    towerRings(ctx, level, def);
  },
};

// ---------------------------------------------------------------------------------------------
// Wiz-goal: the Dark One's temple

const GOAL_MAP: readonly string[] = [
  '                                                                            ',
  '                                                                            ',
  '                                                                            ',
  '                   -------------                 -------------              ',
  '                   |...........|                 |...........|              ',
  '            -------|...........-------------------...........|              ',
  '            |......S...........|..|..|..|..|..|..|...........|              ',
  '            |......|...........|..|..|..|..|..|..|...........|              ',
  '            |......|...........-F+-F+-F+-F+-F+-F+-...........|              ',
  '            --S----|...........S.................+...........|              ',
  '            |......|...........-F+-F+-F+-F+-F+-F+-...........|              ',
  '            |......|...........|..|..|..|..|..|..|...........|              ',
  '            |......|...........|..|..|..|..|..|..|...........|              ',
  '            -------|...........-------------------...........|              ',
  '                   |...........|                 |...........|              ',
  '                   -------------                 -------------              ',
  '                                                                            ',
  '                                                                            ',
  '                                                                            ',
  '                                                                            ',
];

/** ref: dat/Wiz-goal.lua */
export const WIZ_GOAL: LevelDef = {
  id: 'nh:wiz-goal',
  // (lit omitted: the coin flip is drawn)
  init: { style: 'solidfill', fg: 'nh:stone' },
  map: { rows: [...GOAL_MAP] },
  // Dungeon Description (the temple's filled = 2: the room kind only)
  regions: [
    { area: [13, 10, 18, 12], lit: false, type: TEMPLE, filled: false },
    lit(13, 6, 18, 8),
    unlit(20, 4, 30, 14),
    ...[32, 35, 38, 41, 44, 47].map((x) => unlit(x, 6, x + 1, 7)),
    unlit(32, 9, 48, 9),
    ...[32, 35, 38, 41, 44, 47].map((x) => unlit(x, 11, x + 1, 12)),
    lit(50, 4, 60, 14),
  ],
  stairs: { up: { x: 55, y: 5 } },
  doors: [
    { x: 19, y: 6, state: 'locked' },
    { x: 14, y: 9, state: 'locked' },
    { x: 31, y: 9, state: 'locked' },
    ...[33, 36, 39, 42, 45, 48].map((x) => ({ x, y: 8, state: 'locked' as const })),
    ...[33, 36, 39, 42, 45, 48].map((x) => ({ x, y: 10, state: 'locked' as const })),
    { x: 49, y: 9, state: 'locked' },
  ],
  // after the Eye of the Aethiopica (the fixup makes it first)
  contents: [
    ...times(14, obj()),
    ...times(6, trap()),
    mon('nh:dark_one', 16, 11),
    ...times(11, cls('B', false)),
    ...times(7, cls('i', false)),
    ...times(8, mon(BAT)),
    cls('i', false),
    // Some captive peaceful monsters (Pug and Newt: no names)
    { ...mon('nh:rogue', 35, 6), peaceful: true },
    { ...mon('nh:owlbear', 47, 6), peaceful: true, asleep: true },
    { ...mon('nh:wizard', 32, 11), peaceful: true, asleep: true },
    { ...mon('nh:grey_elf', 44, 11), peaceful: true },
    { ...mon('nh:hill_giant', 47, 11), peaceful: true, asleep: true },
    { ...mon('nh:gnomish_wizard', 38, 6), peaceful: true },
    { ...mon('nh:prisoner', 35, 11), peaceful: true },
    { ...mon('nh:prisoner', 41, 11), peaceful: true, asleep: true },
  ],
};

const GOAL_FIXUP: SpLevFixup = {
  before(ctx, level, def) {
    // des.altar({ coord={16,11}, aligned="noncoaligned", type="altar" })
    altarAt(ctx, level, def, 16, 11, noncoalignment(ctx, coaligned(ctx)));
  },
  contents(ctx, level, def) {
    // Objects
    questArtifact(ctx, level, def, 'nh:amulet_of_esp', 16, 11, 0, 'The Eye of the Aethiopica');
    makeContents(ctx, level, def, def.contents ?? []);
  },
};

// ---------------------------------------------------------------------------------------------
// the fillers

/**
 * The fillers' six des.room({ type = "ordinary", contents }) rooms, placed as random rooms, with
 * random corridors; the first and third rooms' monster class differs (i above, X below). As the
 * Oracle's level, the level starts as dark stone. ref: dat/Wiz-fila.lua, Wiz-filb.lua
 */
function filler(id: DefId, first: string): LevelDef {
  return {
    id,
    init: { style: 'solidfill', fg: 'nh:stone', lit: false },
    rooms: [
      { stairs: ['up'], contents: [obj(), cls(first, false)] },
      { contents: [obj(), obj(), cls('i', false)] },
      {
        contents: [
          obj(),
          trap(),
          obj(),
          ...(first === 'i' ? [mon(BAT), mon(BAT)] : [cls(first, false)]),
        ],
      },
      { stairs: ['down'], contents: [obj(), trap(), cls('i', false), mon(BAT)] },
      { contents: [obj(), obj(), trap(), cls('i', false)] },
      { contents: [obj(), trap(), mon(BAT)] },
    ],
    corridors: 'random',
  };
}

/** ref: dat/Wiz-fila.lua: between the home and the locate level */
export const WIZ_FILA: LevelDef = filler('nh:wiz-fila', 'i');

/** ref: dat/Wiz-filb.lua: between the locate and the goal level */
export const WIZ_FILB: LevelDef = filler('nh:wiz-filb', 'X');

/** The Wizard's five levels. */
export const WIZ_LEVELS: readonly LevelDef[] = [WIZ_STRT, WIZ_LOCA, WIZ_GOAL, WIZ_FILA, WIZ_FILB];

/** Their fixups, by LevelDef id. */
export const WIZ_FIXUPS: Readonly<Record<DefId, SpLevFixup>> = {
  [WIZ_STRT.id]: STRT_FIXUP,
  [WIZ_LOCA.id]: LOCA_FIXUP,
  [WIZ_GOAL.id]: GOAL_FIXUP,
};
