// The Samurai's quest: Lord Sato's castle by the river, besieged by ninja and wolves (home), the
// Shogun's castle with its storerooms (locate), Ashikaga Takauji's ringed fortress with the
// Tsurugi of Muramasa (goal), the swampy mines-style filler above the locate level and the
// fortified filler below it. ref: dat/Sam-strt.lua, Sam-loca.lua, Sam-goal.lua, Sam-fila.lua,
// Sam-filb.lua
//
// Translation notes (DEVIATIONS.md "Quest levels (m24b)"): maps, lit regions, the throne room (a
// court that is not stocked, C's `filled = 2`, as Kni-strt's), fixed stairs, doors and contents
// are LevelDef data; "mazelevel", "noteleport", "hardfloor" and the non-diggable areas are
// levelflags.ts entries ("noflip" needs nothing). Sam-fila's mines-style map has pools for
// background: C's wallify_map() walls only stone, so it gets no walls (and its walled, joined
// map clears "mazelevel"). Fixups, in the script's order: Lord Sato's custom inventory (not
// cursed, erodeproof) and the branch levregion anywhere in its rectangle (the portal), placed last
// as fixup_special() does; Sam-goal's up stairs on one of two spots and its three openings, each
// `math.random(1, #place)`, then the Tsurugi of Muramasa (blessed, named through onameItem()).
// pager.c's "pond" for the home level's two moat squares is liquid.ts's.
import type { DefId, LevelContent, LevelDef, LevelRect, RegionDef } from '@nh/core';
import { desLevregion, desStair, makeContents, mapToLevel, type SpLevFixup } from '../sp_lev';
import { T, setTerrain } from '../terrain';
import { TRAP } from '../trap';
import { COURT } from '../zoo';
import {
  cls,
  hostile,
  liftUpPlaceholder,
  mon,
  monWithInventory,
  obj,
  questArtifact,
  times,
  trap,
} from './common';

const NINJA = 'nh:ninja';
const WOLF = 'nh:wolf';
const STALKER = 'nh:stalker';
const SAMURAI = 'nh:samurai';
const lit = (x1: number, y1: number, x2: number, y2: number): RegionDef => ({
  area: [x1, y1, x2, y2],
  lit: true,
});
const unlit = (x1: number, y1: number, x2: number, y2: number): RegionDef => ({
  area: [x1, y1, x2, y2],
  lit: false,
});
/** des.monster(class, x, y) */
const clsAt = (c: string, x: number, y: number): LevelContent => ({
  kind: 'monster',
  class: c,
  x,
  y,
});
/** des.object(class, x, y): '*' gems, '[' armor, ')' weapons, '(' tools. */
const OBJ_CLASS = { '*': 'gem', '[': 'armor', ')': 'weapon', '(': 'tool' } as const;
const objAt = (c: keyof typeof OBJ_CLASS, x: number, y: number): LevelContent => ({
  kind: 'object',
  class: OBJ_CLASS[c],
  x,
  y,
});

// ---------------------------------------------------------------------------------------------
// Sam-strt: the home level

const STRT_MAP: readonly string[] = [
  '..............................................................PP............',
  '...............................................................PP...........',
  '..........---------------------------------------------------...PPP.........',
  '..........|......|.........|...|..............|...|.........|....PPPPP......',
  '......... |......|.........S...|..............|...S.........|.....PPPP......',
  '..........|......|.........|---|..............|---|.........|.....PPP.......',
  '..........+......|.........+...-------++-------...+.........|......PP.......',
  '..........+......|.........|......................|.........|......PP.......',
  '......... |......---------------------++--------------------|........PP.....',
  '..........|.................................................|.........PP....',
  '..........|.................................................|...........PP..',
  '..........----------------------------------------...-------|............PP.',
  '..........................................|.................|.............PP',
  '.............. ................. .........|.................|..............P',
  '............. } ............... } ........|.................|...............',
  '.............. ........PP....... .........|.................|...............',
  '.....................PPP..................|.................|...............',
  '......................PP..................-------------------...............',
  '............................................................................',
  '............................................................................',
];

/** Sam-strt's branch levregion {62,12,70,17}, map-relative (not region_islev). */
export const SAM_STRT_BRANCH: LevelRect = [62, 12, 70, 17];

/** ref: dat/Sam-strt.lua */
export const SAM_STRT: LevelDef = {
  id: 'nh:sam-strt',
  // des.level_init({ style = "solidfill", fg = " " }) (lit omitted: the coin flip is drawn)
  init: { style: 'solidfill', fg: 'nh:stone' },
  map: { rows: [...STRT_MAP] },
  // Dungeon Description (the throne room's filled = 2: the room kind and level flags only)
  regions: [lit(0, 0, 75, 19), { area: [18, 3, 26, 7], lit: true, type: COURT, filled: false }],
  stairs: { down: { x: 29, y: 4 } },
  doors: [
    // Doors
    { x: 10, y: 6, state: 'locked' },
    { x: 10, y: 7, state: 'locked' },
    { x: 27, y: 4, state: 'closed' },
    { x: 27, y: 6, state: 'closed' },
    { x: 38, y: 6, state: 'closed' },
    { x: 38, y: 8, state: 'locked' },
    { x: 39, y: 6, state: 'closed' },
    { x: 39, y: 8, state: 'locked' },
    { x: 50, y: 4, state: 'closed' },
    { x: 50, y: 6, state: 'closed' },
  ],
  // after Lord Sato (the fixup makes him with his inventory first)
  contents: [
    // The treasure of Lord Sato
    { kind: 'object', id: 'nh:chest', x: 20, y: 4 },
    // roshi guards for the audience chamber
    ...(
      [
        [18, 4],
        [18, 5],
        [18, 6],
        [18, 7],
        [26, 4],
        [26, 5],
        [26, 6],
        [26, 7],
      ] as const
    ).map(([x, y]) => mon('nh:roshi', x, y)),
    // Random traps
    ...times(6, trap()),
    // Monsters on siege duty.
    hostile(NINJA, 64, 0),
    mon(WOLF, 65, 1),
    hostile(NINJA, 67, 2),
    hostile(NINJA, 69, 5),
    hostile(NINJA, 69, 6),
    mon(WOLF, 69, 7),
    hostile(NINJA, 70, 6),
    hostile(NINJA, 70, 7),
    hostile(NINJA, 72, 1),
    mon(WOLF, 75, 9),
    hostile(NINJA, 73, 5),
    hostile(NINJA, 68, 2),
    mon(STALKER),
  ],
};

const STRT_FIXUP: SpLevFixup = {
  contents(ctx, level, def) {
    monWithInventory(ctx, level, def, 'nh:lord_sato', 20, 4, [
      ['nh:splint_mail', 5, { buc: 'not-cursed', erodeproof: true }],
      ['nh:katana', 4, { buc: 'not-cursed', erodeproof: true }],
    ]);
    makeContents(ctx, level, def, def.contents ?? []);
  },
  after(ctx, level, def) {
    // Portal arrival zone: des.levregion({ region = {62,12,70,17}, type="branch" })
    const [x1, y1, x2, y2] = SAM_STRT_BRANCH;
    const a = mapToLevel(def, level, x1, y1);
    const b = mapToLevel(def, level, x2, y2);
    desLevregion(ctx, level, 'branch', [a.x, a.y, b.x, b.y], null);
  },
};

// ---------------------------------------------------------------------------------------------
// Sam-loca: the Shogun's castle

const LOCA_MAP: readonly string[] = [
  '............................................................................',
  '............................................................................',
  '........-----..................................................-----........',
  '........|...|..................................................|...|........',
  '........|...---..}..--+------------------------------+--..}..---...|........',
  '........|-|...|.....|...|....|....|....|....|....|.|...|.....|...|-|........',
  '..........|...-------...|....|....|....|....|....S.|...-------...|..........',
  '..........|-|.........------+----+-+-------+-+--------.........|-|..........',
  '............|..--------.|}........................}|.--------..|............',
  '............|..+........+..........................+........+..|............',
  '............|..+........+..........................+........+..|............',
  '............|..--------.|}........................}|.--------..|............',
  '..........|-|.........--------+-+-------+-+----+------.........|-|..........',
  '..........|...-------...|.S....|....|....|....|....|...-------...|..........',
  '........|-|...|.....|...|.|....|....|....|....|....|...|.....|...|-|........',
  '........|...---..}..--+------------------------------+--..}..---...|........',
  '........|...|..................................................|...|........',
  '........-----..................................................-----........',
  '............................................................................',
  '............................................................................',
];

/** ref: dat/Sam-loca.lua */
export const SAM_LOCA: LevelDef = {
  id: 'nh:sam-loca',
  // (lit omitted: the coin flip is drawn)
  init: { style: 'solidfill', fg: 'nh:stone' },
  map: { rows: [...LOCA_MAP] },
  // Dungeon Description
  regions: [lit(0, 0, 75, 19)],
  stairs: { up: { x: 10, y: 10 }, down: { x: 25, y: 14 } },
  doors: [
    ...(
      [
        [22, 4],
        [22, 15],
        [53, 4],
        [53, 15],
        [49, 6],
        [26, 13],
        [28, 7],
        [30, 12],
        [33, 7],
        [32, 12],
        [35, 7],
        [40, 12],
        [43, 7],
        [42, 12],
        [45, 7],
        [47, 12],
      ] as const
    ).map(([x, y]) => ({ x, y, state: 'locked' as const })),
    ...(
      [
        [15, 9],
        [15, 10],
        [24, 9],
        [24, 10],
        [51, 9],
        [51, 10],
        [60, 9],
        [60, 10],
      ] as const
    ).map(([x, y]) => ({ x, y, state: 'closed' as const })),
  ],
  contents: [
    // Objects: the storerooms' gems, armor, weapons and tools
    ...(
      [
        ['*', 25, 28, 5],
        ['[', 40, 43, 5],
        [')', 27, 30, 13],
        ['(', 37, 40, 13],
      ] as const
    ).flatMap(([c, x1, x2, y]) =>
      [y, y + 1].flatMap((yy) =>
        Array.from({ length: x2 - x1 + 1 }, (_, i) => objAt(c, x1 + i, yy)),
      ),
    ),
    // Random traps
    ...times(6, trap()),
    // Random monsters.
    hostile(NINJA, 15, 5),
    hostile(NINJA, 16, 5),
    mon(WOLF, 17, 5),
    mon(WOLF, 18, 5),
    hostile(NINJA, 19, 5),
    mon(WOLF, 15, 14),
    mon(WOLF, 16, 14),
    hostile(NINJA, 17, 14),
    hostile(NINJA, 18, 14),
    mon(WOLF, 56, 5),
    hostile(NINJA, 57, 5),
    mon(WOLF, 58, 5),
    mon(WOLF, 59, 5),
    hostile(NINJA, 56, 14),
    mon(WOLF, 57, 14),
    hostile(NINJA, 58, 14),
    clsAt('d', 59, 14),
    mon(WOLF, 60, 14),
    ...times(9, mon(STALKER)),
    hostile(SAMURAI, 30, 5),
    hostile(SAMURAI, 31, 5),
    hostile(SAMURAI, 32, 5),
    hostile(SAMURAI, 32, 14),
    hostile(SAMURAI, 33, 14),
    hostile(SAMURAI, 34, 14),
  ],
};

// ---------------------------------------------------------------------------------------------
// Sam-goal: Ashikaga Takauji's fortress

const GOAL_MAP: readonly string[] = [
  '                                             ',
  '           .......................           ',
  '       ......-------------------......       ',
  '    ......----.................----......    ',
  '   ....----.....-------------.....----....   ',
  '  ....--.....----...........----.....--....  ',
  '  ...||....---....---------....---....||...  ',
  '  ...|....--....---.......---....--....|...  ',
  ' ....|...||...---...--+--...---...||...|.... ',
  ' ....|...|....|....|-...-|....|....|...|.... ',
  ' ....|...|....|....+.....+....|....|...|.... ',
  ' ....|...|....|....|-...-|....|....|...|.... ',
  ' ....|...||...---...--+--...---...||...|.... ',
  '  ...|....--....---.......---....--....|...  ',
  '  ...||....---....---------....---....||...  ',
  '  ....--.....----...........----.....--....  ',
  '   ....----.....-------------.....----....   ',
  '    ......----.................----......    ',
  '       ......-------------------......       ',
  '           .......................           ',
];

/** The up stairs' two spots (`math.random(1, #place)`); core puts them on the first. */
export const SAM_GOAL_UP: readonly (readonly [number, number])[] = [
  [2, 11],
  [42, 9],
];
/** The three openings in the fortress's rings, one spot of each list. */
export const SAM_GOAL_GAPS: readonly (readonly (readonly [number, number])[])[] = [
  [
    [22, 14],
    [30, 10],
    [22, 6],
    [14, 10],
  ],
  [
    [22, 4],
    [35, 10],
    [22, 16],
    [9, 10],
  ],
  [
    [22, 2],
    [22, 18],
  ],
];

/** ref: dat/Sam-goal.lua */
export const SAM_GOAL: LevelDef = {
  id: 'nh:sam-goal',
  // (lit omitted: the coin flip is drawn)
  init: { style: 'solidfill', fg: 'nh:stone' },
  map: { rows: [...GOAL_MAP] },
  // Dungeon Description
  regions: [unlit(0, 0, 44, 19)],
  // a placeholder: the fixup puts them on one of their two spots
  stairs: { up: { x: 2, y: 11 } },
  doors: [
    { x: 19, y: 10, state: 'closed' },
    { x: 22, y: 8, state: 'closed' },
    { x: 22, y: 12, state: 'closed' },
    { x: 25, y: 10, state: 'closed' },
  ],
  // after the Tsurugi of Muramasa (the fixup makes it first)
  contents: [
    ...times(14, obj()),
    // Random traps
    trap(TRAP.squeaky, 22, 9),
    trap(TRAP.squeaky, 24, 10),
    trap(TRAP.squeaky, 22, 11),
    ...times(6, trap()),
    // Random monsters.
    mon('nh:ashikaga_takauji', 22, 10),
    ...times(5, hostile(SAMURAI)),
    ...times(5, hostile(NINJA)),
    ...times(4, mon(WOLF)),
    ...times(2, cls('d')),
    ...times(9, mon(STALKER)),
  ],
};

const GOAL_FIXUP: SpLevFixup = {
  before(ctx, level, def) {
    // des.stair({ dir = "up", coord = place[math.random(1, #place)] })
    liftUpPlaceholder(level, def, { x: 2, y: 11 });
    const [ux, uy] = SAM_GOAL_UP[ctx.rng.rn2(SAM_GOAL_UP.length)] as readonly [number, number];
    desStair(ctx, level, 'up', mapToLevel(def, level, ux, uy));
    // des.terrain(place[math.random(1, #place)], "."), three times
    for (const place of SAM_GOAL_GAPS) {
      const [x, y] = place[ctx.rng.rn2(place.length)] as readonly [number, number];
      const p = mapToLevel(def, level, x, y);
      setTerrain(level, p.x, p.y, T.floor);
    }
  },
  contents(ctx, level, def) {
    // Objects
    questArtifact(ctx, level, def, 'nh:tsurugi', 22, 10, 0, 'The Tsurugi of Muramasa');
    makeContents(ctx, level, def, def.contents ?? []);
  },
};

// ---------------------------------------------------------------------------------------------
// the fillers

/** ref: dat/Sam-fila.lua: between the home and the locate level */
export const SAM_FILA: LevelDef = {
  id: 'nh:sam-fila',
  // des.level_init({ style="mines", fg=".", bg="P", smoothed, joined, walled }) (lit omitted: the
  // coin flip is drawn); `walled` makes no walls of pools (wallify_map() walls stone only)
  init: {
    style: 'mines',
    fg: 'nh:floor',
    bg: 'nh:pool',
    smoothed: true,
    joined: true,
    walled: false,
  },
  contents: [
    ...times(9, obj()),
    cls('d'),
    ...times(5, mon(WOLF)),
    mon(STALKER),
    ...times(4, trap()),
  ],
};

const FILB_MAP: readonly string[] = [
  '-------------                                  -------------',
  '|...........|                                  |...........|',
  '|...-----...|----------------------------------|...-----...|',
  '|...|   |...|..................................|...|   |...|',
  '|...-----..........................................-----...|',
  '|...........|--S----------------------------S--|...........|',
  '----...--------.|..........................|.--------...----',
  '   |...|........+..........................+........|...|   ',
  '   |...|........+..........................+........|...|   ',
  '----...--------.|..........................|.--------...----',
  '|...........|--S----------------------------S--|...........|',
  '|...-----..........................................-----...|',
  '|...|   |...|..................................|...|   |...|',
  '|...-----...|----------------------------------|...-----...|',
  '|...........|                                  |...........|',
  '-------------                                  -------------',
];

/** ref: dat/Sam-filb.lua: between the locate and the goal level */
export const SAM_FILB: LevelDef = {
  id: 'nh:sam-filb',
  // (lit omitted: the coin flip is drawn)
  init: { style: 'solidfill', fg: 'nh:stone' },
  map: { rows: [...FILB_MAP] },
  regions: [unlit(0, 0, 59, 15)],
  doors: [
    { x: 16, y: 7, state: 'closed' },
    { x: 16, y: 8, state: 'closed' },
    { x: 43, y: 7, state: 'closed' },
    { x: 43, y: 8, state: 'closed' },
  ],
  // des.stair("up"), des.stair("down"): at random in the map
  contents: [
    ...times(9, obj()),
    cls('d'),
    ...times(4, mon(WOLF)),
    ...times(3, mon(STALKER)),
    ...times(4, trap()),
  ],
};

/** The Samurai's five levels. */
export const SAM_LEVELS: readonly LevelDef[] = [SAM_STRT, SAM_LOCA, SAM_GOAL, SAM_FILA, SAM_FILB];

/** Their fixups, by LevelDef id. */
export const SAM_FIXUPS: Readonly<Record<DefId, SpLevFixup>> = {
  [SAM_STRT.id]: STRT_FIXUP,
  [SAM_GOAL.id]: GOAL_FIXUP,
};
