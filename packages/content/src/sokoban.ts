// Sokoban: its rules, keyed on the live level flag (C's `svl.level.flags.sokoban_rules`), and its
// eight levels. A leaf module (core and luck only), so reading, zapping, pushing and traps can all
// import it.
import type { Ctx, DefId, Level, LevelContent, LevelDef, LevelId } from '@nh/core';
import { changeLuck } from './luck';

/**
 * The level still has Sokoban's rules (`Level.sokoban`, set from `LevelDef.flags.sokoban`).
 * ref: include/rm.h `Sokoban`
 */
export const isSokoban = (level: Readonly<Level>): boolean => level.sokoban === true;

/**
 * Cheating in Sokoban (squeezing past or breaking a boulder, reading earth) costs a point of
 * Luck; anywhere else it is nothing. No conduct is kept (`u.uconduct.sokocheat`) and nothing is
 * said, as in NetHack. ref: src/trap.c sokoban_guilt()
 */
export function sokobanGuilt(ctx: Pick<Ctx, 'state'>): void {
  const level = ctx.state.levels[ctx.state.currentLevel];
  if (level && isSokoban(level)) changeLuck(ctx, -1);
}

/**
 * After a pit or hole is gone (a boulder filled or plugged it): once the level has no pit or hole
 * left, its puzzle is solved and Sokoban's rules (luck penalties, no diagonal pushes or squeezes,
 * inescapable pits and holes) no longer apply there. Spiked pits and trap doors do not count, as
 * in NetHack, nor do pits and holes the hero dug (`madeby_u`); no livelog is kept.
 * ref: src/trap.c maybe_finish_sokoban(), deltrap()
 */
export function maybeFinishSokoban(ctx: Pick<Ctx, 'state'>, levelId: LevelId): void {
  const level = ctx.state.levels[levelId];
  if (!level || !isSokoban(level)) return;
  if (level.traps.some((t) => !madeByU(t.data) && (t.def === PIT || t.def === HOLE))) return;
  delete level.sokoban; // Sokoban = 0
}

/** A trap the hero made (its data's `madeby_u`, set by dig.ts). ref: include/trap.h madeby_u */
const madeByU = (data: unknown): boolean =>
  typeof data === 'object' && data !== null && (data as { madeby_u?: unknown }).madeby_u === true;

// The eight levels, transcribed from dat/soko*.lua (one of two variants per level; soko4 is the
// bottom level, the branch's entry, soko1 the top). Each is a stone solidfill with the map block
// centred (des.map's default), its stairs and branch stairs at the map's spots, lit over the
// block, `sokoban` and `premapped`, then its boulders, traps, scrolls of earth and random objects
// in the lua order. Ids are written out (not imported from boulder.ts or trap.ts) so this module
// stays a leaf.
//
// The level flags noteleport, hardfloor, mazelevel, solidify and des.non_diggable are a table in
// levelflags.ts. Not ported (DEVIATIONS "Sokoban"): the rolling boulder traps (their spots stay
// floor), des.non_passwall (nothing phases), the monster-generation exclusion regions (approximated: on a `sokoban` level
// random monster spots avoid trap squares, generation.ts), and on soko1 the two giant mimics.
// soko1's treasure zoo is a typed region filled by zoo.ts; its prize is a fixup there (the
// Elbereth engraving and the cursed scroll of scare monster beside it are not ported).

const SOLID_STONE = { style: 'solidfill', fg: 'nh:stone' } as const;
/** des.level_flags(..., "premapped", "sokoban", ...) */
const SOKOBAN_FLAGS = { sokoban: true, premapped: true } as const;

const B: DefId = 'nh:boulder';
const EARTH: DefId = 'nh:scroll_of_earth';
const PIT: DefId = 'nh:pit';
const HOLE: DefId = 'nh:hole';
/** zoo.ts ZOO */
const ZOO: DefId = 'nh:zoo';

type Spot = readonly [x: number, y: number];
/** des.object(id, x, y) at each spot */
const at = (id: DefId, ...spots: Spot[]): LevelContent[] =>
  spots.map(([x, y]) => ({ kind: 'object', id, x, y }));
/** des.trap(id, x, y) at each spot */
const trapsAt = (id: DefId, ...spots: Spot[]): LevelContent[] =>
  spots.map(([x, y]) => ({ kind: 'trap', id, x, y }));
/** Every level ends with des.object({ class = "%" }) four times, then "=" and "/". */
const RANDOM_OBJECTS: LevelContent[] = [
  { kind: 'object', class: 'food', count: 4 },
  { kind: 'object', class: 'ring' },
  { kind: 'object', class: 'wand' },
];

/** ref: dat/soko1-1.lua */
export const SOKO1_1: LevelDef = {
  id: 'nh:soko1-1',
  init: SOLID_STONE,
  map: {
    rows: [
      '--------------------------',
      '|........................|',
      '|.......|---------------.|',
      '-------.------         |.|',
      ' |...........|         |.|',
      ' |...........|         |.|',
      '--------.-----         |.|',
      '|............|         |.|',
      '|............|         |.|',
      '-----.--------   ------|.|',
      ' |..........|  --|.....|.|',
      ' |..........|  |.+.....|.|',
      ' |.........|-  |-|.....|.|',
      '-------.----   |.+.....+.|',
      '|........|     |-|.....|--',
      '|........|     |.+.....|  ',
      '|...|-----     --|.....|  ',
      '-----            -------  ',
    ],
  },
  regions: [
    { area: [0, 0, 25, 17], lit: true },
    // des.region({ region={18,10, 22,16}, lit = 1, type = "zoo", filled = 1, irregular = 1 })
    { area: [18, 10, 22, 16], lit: true, type: ZOO, filled: true },
  ],
  doors: [
    { x: 23, y: 13, state: 'locked' },
    { x: 17, y: 11, state: 'closed' },
    { x: 17, y: 13, state: 'closed' },
    { x: 17, y: 15, state: 'closed' },
  ],
  stairs: { down: { x: 1, y: 1 } },
  flags: SOKOBAN_FLAGS,
  contents: [
    ...at(
      B,
      [3, 5],
      [5, 5],
      [7, 5],
      [9, 5],
      [11, 5],
      [4, 7],
      [4, 8],
      [6, 7],
      [9, 7],
      [11, 7],
      [3, 12],
      [4, 10],
      [5, 12],
      [6, 10],
      [7, 11],
      [8, 10],
      [9, 12],
      [3, 14],
    ),
    ...trapsAt(HOLE, [7, 1]),
    // rolling boulder trap at [8, 1] (not ported: the spot stays floor)
    ...trapsAt(
      HOLE,
      [9, 1],
      [10, 1],
      [11, 1],
      [12, 1],
      [13, 1],
      [14, 1],
      [15, 1],
      [16, 1],
      [17, 1],
      [18, 1],
      [19, 1],
      [20, 1],
      [21, 1],
      [22, 1],
      [23, 1],
    ),
    ...RANDOM_OBJECTS,
  ],
};

/** ref: dat/soko1-2.lua */
export const SOKO1_2: LevelDef = {
  id: 'nh:soko1-2',
  init: SOLID_STONE,
  map: {
    rows: [
      '  ------------------------',
      '  |......................|',
      '  |..-------------------.|',
      '----.|    -----        |.|',
      '|..|.--  --...|        |.|',
      '|.....|--|....|        |.|',
      '|.....|..|....|        |.|',
      '--....|......--        |.|',
      ' |.......|...|   ------|.|',
      ' |....|..|...| --|.....|.|',
      ' |....|--|...| |.+.....|.|',
      ' |.......|..-- |-|.....|.|',
      ' ----....|.--  |.+.....+.|',
      '    ---.--.|   |-|.....|--',
      '     |.....|   |.+.....|  ',
      '     |..|..|   --|.....|  ',
      '     -------     -------  ',
    ],
  },
  regions: [
    { area: [0, 0, 25, 16], lit: true },
    // des.region({ region={18,09, 22,15}, lit = 1, type = "zoo", filled = 1, irregular = 1 })
    { area: [18, 9, 22, 15], lit: true, type: ZOO, filled: true },
  ],
  doors: [
    { x: 23, y: 12, state: 'locked' },
    { x: 17, y: 10, state: 'closed' },
    { x: 17, y: 12, state: 'closed' },
    { x: 17, y: 14, state: 'closed' },
  ],
  stairs: { down: { x: 6, y: 15 } },
  flags: SOKOBAN_FLAGS,
  contents: [
    ...at(
      B,
      [4, 4],
      [2, 6],
      [3, 6],
      [4, 7],
      [5, 7],
      [2, 8],
      [5, 8],
      [3, 9],
      [4, 9],
      [3, 10],
      [5, 10],
      [6, 12],
      [7, 14],
      [11, 5],
      [12, 6],
      [10, 7],
      [11, 7],
      [10, 8],
      [12, 9],
      [11, 10],
    ),
    // rolling boulder trap at [5, 1] (not ported: the spot stays floor)
    ...trapsAt(
      HOLE,
      [6, 1],
      [7, 1],
      [8, 1],
      [9, 1],
      [10, 1],
      [11, 1],
      [12, 1],
      [13, 1],
      [14, 1],
      [15, 1],
      [16, 1],
      [17, 1],
      [18, 1],
      [19, 1],
      [20, 1],
      [21, 1],
      [22, 1],
      [23, 1],
    ),
    ...RANDOM_OBJECTS,
  ],
};

/** ref: dat/soko2-1.lua */
export const SOKO2_1: LevelDef = {
  id: 'nh:soko2-1',
  init: SOLID_STONE,
  map: {
    rows: [
      '--------------------',
      '|........|...|.....|',
      '|.....-..|.-.|.....|',
      '|..|.....|...|.....|',
      '|-.|..-..|.-.|.....|',
      '|...--.......|.....|',
      '|...|...-...-|.....|',
      '|...|..|...--|.....|',
      '|-..|..|----------+|',
      '|..................|',
      '|...|..|------------',
      '--------            ',
    ],
  },
  regions: [{ area: [0, 0, 19, 11], lit: true }],
  doors: [{ x: 18, y: 8, state: 'locked' }],
  stairs: { up: { x: 16, y: 4 }, down: { x: 6, y: 10 } },
  flags: SOKOBAN_FLAGS,
  contents: [
    ...at(
      B,
      [2, 2],
      [3, 2],
      [5, 3],
      [7, 3],
      [7, 2],
      [8, 2],
      [10, 3],
      [11, 3],
      [2, 7],
      [2, 8],
      [3, 9],
      [5, 7],
      [6, 6],
    ),
    // rolling boulder trap at [7, 9] (not ported: the spot stays floor)
    ...trapsAt(
      HOLE,
      [8, 9],
      [9, 9],
      [10, 9],
      [11, 9],
      [12, 9],
      [13, 9],
      [14, 9],
      [15, 9],
      [16, 9],
      [17, 9],
    ),
    ...RANDOM_OBJECTS,
  ],
};

/** ref: dat/soko2-2.lua */
export const SOKO2_2: LevelDef = {
  id: 'nh:soko2-2',
  init: SOLID_STONE,
  map: {
    rows: [
      '  --------            ',
      '--|.|....|            ',
      '|........|----------  ',
      '|.-...-..|.|.......|  ',
      '|...-......|.......|  ',
      '|.-....|...|.......|  ',
      '|....-.--.-|.......|  ',
      '|..........|.......|  ',
      '|.--...|...|.......---',
      '|....-.|---|.......+.|',
      '--|....|------------.|',
      '  |................+.|',
      '  --------------------',
    ],
  },
  regions: [{ area: [0, 0, 21, 12], lit: true }],
  doors: [
    { x: 19, y: 9, state: 'locked' },
    { x: 19, y: 11, state: 'locked' },
  ],
  stairs: { up: { x: 15, y: 6 }, down: { x: 6, y: 11 } },
  flags: SOKOBAN_FLAGS,
  contents: [
    ...at(
      B,
      [4, 2],
      [4, 3],
      [5, 3],
      [7, 3],
      [8, 3],
      [2, 4],
      [3, 4],
      [5, 5],
      [6, 6],
      [9, 6],
      [3, 7],
      [4, 7],
      [7, 7],
      [6, 9],
      [5, 10],
      [5, 11],
    ),
    // rolling boulder trap at [7, 11] (not ported: the spot stays floor)
    ...trapsAt(
      HOLE,
      [8, 11],
      [9, 11],
      [10, 11],
      [11, 11],
      [12, 11],
      [13, 11],
      [14, 11],
      [15, 11],
      [16, 11],
      [17, 11],
      [18, 11],
    ),
    ...RANDOM_OBJECTS,
  ],
};

/** ref: dat/soko3-1.lua */
export const SOKO3_1: LevelDef = {
  id: 'nh:soko3-1',
  init: SOLID_STONE,
  map: {
    rows: [
      '-----------       -----------',
      '|....|....|--     |.........|',
      '|....|......|     |.........|',
      '|.........|--     |.........|',
      '|....|....|       |.........|',
      '|-.---------      |.........|',
      '|....|.....|      |.........|',
      '|....|.....|      |.........|',
      '|..........|      |.........|',
      '|....|.....|---------------+|',
      '|....|......................|',
      '-----------------------------',
    ],
  },
  regions: [{ area: [0, 0, 28, 11], lit: true }],
  doors: [{ x: 27, y: 9, state: 'locked' }],
  stairs: { up: { x: 23, y: 4 }, down: { x: 11, y: 2 } },
  flags: SOKOBAN_FLAGS,
  contents: [
    ...at(
      B,
      [3, 2],
      [4, 2],
      [6, 2],
      [6, 3],
      [7, 2],
      [3, 6],
      [2, 7],
      [3, 7],
      [3, 8],
      [2, 9],
      [3, 9],
      [4, 9],
      [6, 7],
      [6, 9],
      [8, 7],
      [8, 10],
      [9, 8],
      [9, 9],
      [10, 7],
      [10, 10],
    ),
    // rolling boulder trap at [11, 10] (not ported: the spot stays floor)
    ...trapsAt(
      HOLE,
      [12, 10],
      [13, 10],
      [14, 10],
      [15, 10],
      [16, 10],
      [17, 10],
      [18, 10],
      [19, 10],
      [20, 10],
      [21, 10],
      [22, 10],
      [23, 10],
      [24, 10],
      [25, 10],
      [26, 10],
    ),
    ...RANDOM_OBJECTS,
  ],
};

/** ref: dat/soko3-2.lua */
export const SOKO3_2: LevelDef = {
  id: 'nh:soko3-2',
  init: SOLID_STONE,
  map: {
    rows: [
      ' ----          -----------',
      '-|..|-------   |.........|',
      '|..........|   |.........|',
      '|..-----.-.|   |.........|',
      '|..|...|...|   |.........|',
      '|.........-|   |.........|',
      '|.......|..|   |.........|',
      '|.----..--.|   |.........|',
      '|........|.--  |.........|',
      '|.---.-.....------------+|',
      '|...|...-................|',
      '|.........----------------',
      '----|..|..|               ',
      '    -------               ',
    ],
  },
  regions: [{ area: [0, 0, 25, 13], lit: true }],
  doors: [{ x: 24, y: 9, state: 'locked' }],
  stairs: { up: { x: 20, y: 4 }, down: { x: 3, y: 1 } },
  flags: SOKOBAN_FLAGS,
  contents: [
    ...at(
      B,
      [2, 3],
      [8, 3],
      [9, 4],
      [2, 5],
      [4, 5],
      [9, 5],
      [2, 6],
      [5, 6],
      [6, 7],
      [3, 8],
      [7, 8],
      [5, 9],
      [10, 9],
      [7, 10],
      [10, 10],
      [3, 11],
    ),
    // rolling boulder trap at [11, 10] (not ported: the spot stays floor)
    ...trapsAt(
      HOLE,
      [12, 10],
      [13, 10],
      [14, 10],
      [15, 10],
      [16, 10],
      [17, 10],
      [18, 10],
      [19, 10],
      [20, 10],
      [21, 10],
      [22, 10],
      [23, 10],
    ),
    ...RANDOM_OBJECTS,
  ],
};

/** ref: dat/soko4-1.lua */
export const SOKO4_1: LevelDef = {
  id: 'nh:soko4-1',
  init: SOLID_STONE,
  map: {
    rows: [
      '------  ----- ',
      '|....|  |...| ',
      '|....----...| ',
      '|...........| ',
      '|..|-|.|-|..| ',
      '---------|.---',
      '|......|.....|',
      '|..----|.....|',
      '--.|   |.....|',
      ' |.|---|.....|',
      ' |...........|',
      ' |..|---------',
      ' ----         ',
    ],
  },
  regions: [{ area: [0, 0, 13, 12], lit: true }],
  stairs: { up: { x: 6, y: 6 }, branch: { x: 6, y: 4 } },
  flags: SOKOBAN_FLAGS,
  contents: [
    ...at(B, [2, 2], [2, 3], [10, 2], [9, 3], [10, 4], [8, 7], [9, 8], [9, 9], [8, 10], [10, 10]),
    ...trapsAt(PIT, [4, 6], [2, 6], [2, 7], [2, 8]),
    // rolling boulder trap at [2, 9] (not ported: the spot stays floor)
    ...trapsAt(PIT, [2, 10], [3, 10], [4, 10], [5, 10], [6, 10]),
    // rolling boulder trap at [7, 10] (not ported: the spot stays floor)
    ...at(EARTH, [2, 11], [3, 11]),
    ...RANDOM_OBJECTS,
  ],
};

/** ref: dat/soko4-2.lua */
export const SOKO4_2: LevelDef = {
  id: 'nh:soko4-2',
  init: SOLID_STONE,
  map: {
    rows: [
      '-------- ------',
      '|.|....|-|....|',
      '|.|-..........|',
      '|.||....|.....|',
      '|.||....|.....|',
      '|.|-----|.-----',
      '|.|    |......|',
      '|.-----|......|',
      '|.............|',
      '|..|---|......|',
      '----   --------',
    ],
  },
  regions: [{ area: [0, 0, 14, 10], lit: true }],
  stairs: { up: { x: 1, y: 1 }, branch: { x: 3, y: 1 } },
  flags: SOKOBAN_FLAGS,
  contents: [
    ...at(
      B,
      [5, 2],
      [6, 2],
      [6, 3],
      [7, 3],
      [9, 5],
      [10, 3],
      [11, 2],
      [12, 3],
      [7, 8],
      [8, 8],
      [9, 8],
      [10, 8],
    ),
    ...trapsAt(PIT, [1, 2], [1, 3], [1, 4], [1, 5], [1, 6]),
    // rolling boulder trap at [1, 7] (not ported: the spot stays floor)
    ...trapsAt(PIT, [1, 8], [2, 8], [3, 8], [4, 8], [5, 8]),
    // rolling boulder trap at [6, 8] (not ported: the spot stays floor)
    ...at(EARTH, [1, 9], [2, 9]),
    ...RANDOM_OBJECTS,
  ],
};

/** The variants of each Sokoban level, top (soko1) to bottom (soko4). */
export const SOKOBAN_VARIANTS: readonly (readonly [LevelDef, LevelDef])[] = [
  [SOKO1_1, SOKO1_2],
  [SOKO2_1, SOKO2_2],
  [SOKO3_1, SOKO3_2],
  [SOKO4_1, SOKO4_2],
];
