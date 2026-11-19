// The Archeologist's quest: Lord Carnarvon's moated college, besieged by snakes and mummies
// (home), the three unattended temples of the locate level, the tomb of the Minion of Huhetotl
// with the Orb of Detection (goal), and the room-and-corridor fillers above and below the locate
// level. ref: dat/Arc-strt.lua, Arc-loca.lua, Arc-goal.lua, Arc-fila.lua, Arc-filb.lua
//
// Translation notes (DEVIATIONS.md "Quest levels (m24b)"): maps, lit regions, the temples, fixed
// stairs, doors and contents are LevelDef data; "mazelevel", "noteleport", "hardfloor" and the
// non-diggable map are levelflags.ts entries. Fixups, in the script's order: Lord Carnarvon's
// custom inventory, the locate level's altars of nhlib's shuffled `align[]` (drawn first, as
// astral.ts) and its four "X marks the spot." engravings between the objects and the traps, its
// unlit irregular regions (their flood fills, no rooms), the Orb of Detection (blessed, +5,
// named through onameItem()) and the home level's branch levregion (the portal), placed last as
// fixup_special() does. The fillers are the Oracle's kind of des.room level: six random rooms
// with their contents and random corridors.
import type { DefId, LevelContent, LevelDef, RegionDef } from '@nh/core';
import type { Aligntyp } from '../aligntyp';
import { TEMPLE } from '../epri';
import { makeContents, shuffle, type SpLevFixup } from '../sp_lev';
import { TRAP } from '../trap';
import {
  altarAt,
  branchAt,
  cls,
  engraveRandom,
  lightIrregular,
  mon,
  monWithInventory,
  obj,
  questArtifact,
  times,
  trap,
} from './common';

const STUDENT = 'nh:student';
const MUMMY = 'nh:human_mummy';
const at = (c: LevelContent, x: number, y: number): LevelContent => ({ ...c, x, y });
const lit = (x1: number, y1: number, x2: number, y2: number): RegionDef => ({
  area: [x1, y1, x2, y2],
  lit: true,
});
const unlit = (x1: number, y1: number, x2: number, y2: number): RegionDef => ({
  area: [x1, y1, x2, y2],
  lit: false,
});

// ---------------------------------------------------------------------------------------------
// Arc-strt: the home level

const STRT_MAP: readonly string[] = [
  '............................................................................',
  '............................................................................',
  '............................................................................',
  '............................................................................',
  '....................}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}.................',
  '....................}-------------------------------------}.................',
  '....................}|..S......+.................+.......|}.................',
  '....................}-S---------------+----------|.......|}.................',
  '....................}|.|...............|.......+.|.......|}.................',
  '....................}|.|...............---------.---------}.................',
  '....................}|.S.\\.............+.................+..................',
  '....................}|.|...............---------.---------}.................',
  '....................}|.|...............|.......+.|.......|}.................',
  '....................}-S---------------+----------|.......|}.................',
  '....................}|..S......+.................+.......|}.................',
  '....................}-------------------------------------}.................',
  '....................}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}.................',
  '............................................................................',
  '............................................................................',
  '............................................................................',
];

/** ref: dat/Arc-strt.lua */
export const ARC_STRT: LevelDef = {
  id: 'nh:arc-strt',
  // des.level_init({ style = "solidfill", fg = " " }) (lit omitted: the coin flip is drawn)
  init: { style: 'solidfill', fg: 'nh:stone' },
  map: { rows: [...STRT_MAP] },
  // Dungeon Description
  regions: [
    lit(0, 0, 75, 19),
    unlit(22, 6, 23, 6),
    unlit(25, 6, 30, 6),
    unlit(32, 6, 48, 6),
    lit(50, 6, 56, 8),
    unlit(40, 8, 46, 8),
    unlit(22, 8, 22, 12),
    unlit(24, 8, 38, 12),
    lit(48, 8, 48, 8),
    lit(40, 10, 56, 10),
    lit(48, 12, 48, 12),
    unlit(40, 12, 46, 12),
    lit(50, 12, 56, 14),
    unlit(22, 14, 23, 14),
    unlit(25, 14, 30, 14),
    unlit(32, 14, 48, 14),
  ],
  stairs: { down: { x: 55, y: 7 } },
  doors: [
    { x: 22, y: 7, state: 'closed' },
    { x: 38, y: 7, state: 'closed' },
    { x: 47, y: 8, state: 'locked' },
    { x: 23, y: 10, state: 'locked' },
    { x: 39, y: 10, state: 'locked' },
    { x: 57, y: 10, state: 'locked' },
    { x: 47, y: 12, state: 'locked' },
    { x: 22, y: 13, state: 'closed' },
    { x: 38, y: 13, state: 'closed' },
    { x: 24, y: 14, state: 'locked' },
    { x: 31, y: 14, state: 'closed' },
    { x: 49, y: 14, state: 'locked' },
  ],
  // after Lord Carnarvon (the fixup makes him with his inventory first)
  contents: [
    // The treasure of Lord Carnarvon
    { kind: 'object', id: 'nh:chest', x: 25, y: 10 },
    // student guards for the audience chamber
    ...(
      [
        [26, 9],
        [27, 9],
        [28, 9],
        [26, 10],
        [28, 10],
        [26, 11],
        [27, 11],
        [28, 11],
      ] as const
    ).map(([x, y]) => mon(STUDENT, x, y)),
    // city watch guards in the antechambers
    mon('nh:watchman', 50, 6),
    mon('nh:watchman', 50, 14),
    // Eels in the moat
    mon('nh:giant_eel', 20, 10),
    mon('nh:giant_eel', 45, 4),
    mon('nh:giant_eel', 33, 16),
    // Random traps
    ...times(6, trap()),
    // Monsters on siege duty.
    ...(
      [
        ['S', 60, 9],
        ['M', 60, 10],
        ['S', 60, 11],
        ['S', 60, 12],
        ['M', 60, 13],
        ['S', 61, 10],
        ['S', 61, 11],
        ['S', 61, 12],
        ['S', 30, 3],
        ['M', 20, 17],
        ['S', 67, 2],
        ['S', 10, 19],
      ] as const
    ).map(([c, x, y]) => at(cls(c), x, y)),
  ],
};

const STRT_FIXUP: SpLevFixup = {
  contents(ctx, level, def) {
    monWithInventory(ctx, level, def, 'nh:lord_carnarvon', 25, 10, [
      ['nh:fedora', 5],
      ['nh:bullwhip', 4],
    ]);
    makeContents(ctx, level, def, def.contents ?? []);
  },
  after(ctx, level, def) {
    // Portal arrival point: des.levregion({ region = {63,06,63,06}, type="branch" })
    branchAt(ctx, level, def, 63, 6);
  },
};

// ---------------------------------------------------------------------------------------------
// Arc-loca: the locate level

const LOCA_MAP: readonly string[] = [
  '............................................................................',
  '............................................................................',
  '............................................................................',
  '........................-------------------------------.....................',
  '........................|....|.S......................|.....................',
  '........................|....|.|.|+------------------.|.....................',
  '........................|....|.|.|.|.........|......|.|.....................',
  '........................|....|.|.|.|.........|......|.|.....................',
  '........................|---+-.|.|.|..---....+......|.|.....................',
  '........................|....|.|.|.---|.|....|......|.|.....................',
  '........................|....S.|.|.+..S.|--S-----S--|.|.....................',
  '........................|....|.|.|.---|.|....|......+.|.....................',
  '........................|---+-.|.|.|..---....|.------.|.....................',
  '........................|....|.|.|.|.........|.|....+.|.....................',
  '........................|....|.|.|.|.........|+|....|-|.....................',
  '........................|....|.|.|------------+------.S.....................',
  '........................|....|.S......................|.....................',
  '........................-------------------------------.....................',
  '............................................................................',
  '............................................................................',
];

/** The 15 random objects, made before the engravings. */
const LOCA_OBJECTS: readonly LevelContent[] = times(15, obj());

/** ref: dat/Arc-loca.lua */
export const ARC_LOCA: LevelDef = {
  id: 'nh:arc-loca',
  init: { style: 'solidfill', fg: 'nh:stone' },
  map: { rows: [...LOCA_MAP] },
  // Dungeon Description; the four unlit irregular regions are the fixup's (their flood fills)
  regions: [
    lit(0, 0, 75, 19),
    { area: [25, 4, 28, 7], lit: true, type: TEMPLE, filled: false },
    { area: [25, 9, 28, 11], lit: false, type: TEMPLE, filled: false },
    { area: [25, 13, 28, 16], lit: true, type: TEMPLE, filled: false },
    lit(30, 4, 30, 16),
    unlit(32, 4, 32, 16),
    unlit(36, 10, 37, 10),
    unlit(39, 9, 39, 11),
    unlit(46, 6, 51, 9),
    unlit(48, 13, 51, 14),
  ],
  doors: [
    { x: 31, y: 4, state: 'closed' },
    { x: 28, y: 8, state: 'closed' },
    { x: 29, y: 10, state: 'locked' },
    { x: 28, y: 12, state: 'closed' },
    { x: 31, y: 16, state: 'closed' },
    { x: 34, y: 5, state: 'locked' },
    { x: 35, y: 10, state: 'locked' },
    { x: 38, y: 10, state: 'locked' },
    { x: 43, y: 10, state: 'closed' },
    { x: 45, y: 8, state: 'closed' },
    { x: 46, y: 14, state: 'locked' },
    { x: 46, y: 15, state: 'locked' },
    { x: 49, y: 10, state: 'locked' },
    { x: 52, y: 11, state: 'locked' },
    { x: 52, y: 13, state: 'closed' },
    { x: 54, y: 15, state: 'closed' },
  ],
  stairs: { up: { x: 3, y: 17 }, down: { x: 39, y: 10 } },
  // after the objects and the engravings (the fixup makes those first)
  contents: [
    // Random traps
    trap(TRAP.spikedPit, 24, 2),
    trap(TRAP.spikedPit, 37, 0),
    trap(TRAP.spikedPit, 23, 5),
    trap(TRAP.spikedPit, 26, 19),
    trap(TRAP.spikedPit, 55, 10),
    trap(TRAP.spikedPit, 55, 8),
    trap(TRAP.pit, 51, 1),
    trap(TRAP.pit, 23, 18),
    trap(TRAP.pit, 31, 18),
    trap(TRAP.pit, 48, 19),
    trap(TRAP.pit, 55, 15),
    trap(TRAP.magic, 60, 4),
    trap(TRAP.statue, 72, 7),
    trap(TRAP.statue),
    trap(TRAP.statue),
    trap(TRAP.antiMagic, 64, 12),
    trap(TRAP.sleepGas),
    trap(TRAP.sleepGas),
    ...times(3, trap(TRAP.dart)),
    trap(TRAP.rolling, 32, 10),
    trap(TRAP.rolling, 40, 16),
    // Random monsters.
    ...times(18, cls('S')),
    cls('M'),
    ...times(7, mon(MUMMY)),
    cls('M'),
  ],
};

/** The altars' spots, for nhlib's shuffled `align[1]`, `align[2]`, `align[3]`. */
const LOCA_ALTARS: readonly (readonly [number, number])[] = [
  [26, 5],
  [26, 10],
  [26, 15],
];

const LOCA_FIXUP: SpLevFixup = {
  before(ctx, level, def) {
    // nhlib.lua: align = { "law", "neutral", "chaos" }; shuffle(align) (before the script)
    const align: Aligntyp[] = [1, 0, -1];
    shuffle(ctx, align);
    // the unlit irregular regions, in the script's order (after the lit ones they cannot undo)
    for (const [x, y] of [
      [33, 4],
      [36, 6],
      [36, 12],
      [46, 11],
    ] as const)
      lightIrregular(level, def, LOCA_MAP, x, y, false);
    // Altars - three types.  All are unattended.
    for (const [k, [x, y]] of LOCA_ALTARS.entries()) altarAt(ctx, level, def, x, y, align[k] ?? 1);
  },
  contents(ctx, level, def) {
    makeContents(ctx, level, def, LOCA_OBJECTS);
    // Treasure?
    for (let i = 0; i < 4; i++) engraveRandom(ctx, level, def, 'engrave', 'X marks the spot.');
    makeContents(ctx, level, def, def.contents ?? []);
  },
};

// ---------------------------------------------------------------------------------------------
// Arc-goal: the tomb of the Minion of Huhetotl

const GOAL_MAP: readonly string[] = [
  '                                                                            ',
  '                                  ---------                                 ',
  '                                  |..|.|..|                                 ',
  '                       -----------|..S.S..|-----------                      ',
  '                       |.|........|+-|.|-+|........|.|                      ',
  '                       |.S........S..|.|..S........S.|                      ',
  '                       |.|........|..|.|..|........|.|                      ',
  '                    ------------------+------------------                   ',
  '                    |..|..........|.......|..........|..|                   ',
  '                    |..|..........+.......|..........S..|                   ',
  '                    |..S..........|.......+..........|..|                   ',
  '                    |..|..........|.......|..........|..|                   ',
  '                    ------------------+------------------                   ',
  '                       |.|........|..|.|..|........|.|                      ',
  '                       |.S........S..|.|..S........S.|                      ',
  '                       |.|........|+-|.|-+|........|.|                      ',
  '                       -----------|..S.S..|-----------                      ',
  '                                  |..|.|..|                                 ',
  '                                  ---------                                 ',
  '                                                                            ',
];

/** ref: dat/Arc-goal.lua */
export const ARC_GOAL: LevelDef = {
  id: 'nh:arc-goal',
  init: { style: 'solidfill', fg: 'nh:stone' },
  map: { rows: [...GOAL_MAP] },
  // Dungeon Description
  regions: [
    lit(0, 0, 75, 19),
    unlit(35, 2, 36, 3),
    unlit(40, 2, 41, 3),
    unlit(24, 4, 24, 6),
    lit(26, 4, 33, 6),
    unlit(38, 2, 38, 6),
    lit(43, 4, 50, 6),
    unlit(52, 4, 52, 6),
    unlit(35, 5, 36, 6),
    unlit(40, 5, 41, 6),
    unlit(21, 8, 22, 11),
    lit(24, 8, 33, 11),
    unlit(35, 8, 41, 11),
    lit(43, 8, 52, 11),
    unlit(54, 8, 55, 11),
    unlit(24, 13, 24, 15),
    unlit(26, 13, 33, 15),
    unlit(35, 13, 36, 14),
    unlit(35, 16, 36, 17),
    unlit(38, 13, 38, 17),
    unlit(40, 13, 41, 14),
    unlit(40, 16, 41, 17),
    { area: [43, 13, 50, 15], lit: false, type: TEMPLE, filled: false },
    unlit(52, 13, 52, 15),
  ],
  stairs: { up: { x: 38, y: 10 } },
  // The altar of Huhetotl.  Unattended.
  features: [{ kind: 'altar', x: 50, y: 14, align: 'chaotic' }],
  // after the Orb of Detection (the fixup makes it first)
  contents: [
    ...times(14, obj()),
    // Random traps
    ...times(6, trap()),
    trap(TRAP.rolling, 46, 14),
    // Random monsters.
    mon('nh:minion_of_huhetotl', 50, 14),
    ...times(18, cls('S')),
    ...times(8, mon(MUMMY)),
    cls('M'),
  ],
};

const GOAL_FIXUP: SpLevFixup = {
  contents(ctx, level, def) {
    questArtifact(ctx, level, def, 'nh:crystal_ball', 50, 14, 5, 'The Orb of Detection');
    makeContents(ctx, level, def, def.contents ?? []);
  },
};

// ---------------------------------------------------------------------------------------------
// the fillers

/**
 * The fillers' six des.room({ type = "ordinary", contents }) rooms, placed as random rooms, with
 * random corridors; the first three rooms' monster class differs (S above, M below). As the
 * Oracle's level, the level starts as dark stone. ref: dat/Arc-fila.lua, Arc-filb.lua
 */
function filler(id: DefId, first: string): LevelDef {
  return {
    id,
    init: { style: 'solidfill', fg: 'nh:stone', lit: false },
    rooms: [
      { stairs: ['up'], contents: [obj(), cls(first)] },
      { contents: [obj(), obj(), cls(first)] },
      { contents: [obj(), trap(), obj(), cls(first)] },
      { stairs: ['down'], contents: [obj(), trap(), cls('S'), mon(MUMMY)] },
      { contents: [obj(), obj(), trap(), cls('S')] },
      { contents: [obj(), trap(), cls('S')] },
    ],
    corridors: 'random',
  };
}

/** ref: dat/Arc-fila.lua: between the home and the locate level */
export const ARC_FILA: LevelDef = filler('nh:arc-fila', 'S');

/** ref: dat/Arc-filb.lua: between the locate and the goal level */
export const ARC_FILB: LevelDef = filler('nh:arc-filb', 'M');

/** The Archeologist's five levels. */
export const ARC_LEVELS: readonly LevelDef[] = [ARC_STRT, ARC_LOCA, ARC_GOAL, ARC_FILA, ARC_FILB];

/** Their fixups, by LevelDef id. */
export const ARC_FIXUPS: Readonly<Record<DefId, SpLevFixup>> = {
  [ARC_STRT.id]: STRT_FIXUP,
  [ARC_LOCA.id]: LOCA_FIXUP,
  [ARC_GOAL.id]: GOAL_FIXUP,
};
