// The big room: NetHack 5.0's thirteen variants, as LevelDefs plus fixups.
// ref: dat/bigrm-1.lua .. dat/bigrm-13.lua
//
// Translation notes (see DEVIATIONS.md "Big room"): maps, lit regions, fountains, bigrm-10's
// teleport region and up-stairs region, bigrm-11's maze init and bigrm-12's replace_terrain
// blocks are LevelDef data; the 15 random objects, 6 traps and 28 monsters (bigrm-3's at fixed
// spots) are `contents`. What the lua does with random choices and selections (bigrm-1's
// shapes, bigrm-2's darkness, bigrm-3's and bigrm-11's `selection.match`, bigrm-4/7/8/10's
// random terrain, bigrm-5's percentage and grow, bigrm-10's fog maze walk, bigrm-12's
// des.wallify(), bigrm-13's pillars) are fixups. Core has placed the stairs before a fixup runs,
// while the lua makes them after its terrain: a fixup lifts them, changes the terrain as the
// script does (seeing the floor under them), then puts each back on its spot, or on a new random
// floor spot of the map when its spot is no longer floor (bigrm-10's down stairs always, after
// the maze walk). `mazelevel` and `non_diggable` are levelflags.ts entries; `noflip`/`noflipy`
// are moot (no level flipping).
import type { Ctx, DefId, Level, LevelContent, LevelDef, LevelRect, Pos } from '@nh/core';
import { levelDefArea, mapBlock, trapAt, VANILLA_TERRAIN, wallifyLevel } from '@nh/core';
import { mazewalk } from './mazewalk';
import { mksobjFull } from './mkobj';
import { mapToLevel, type SpLevFixup } from './sp_lev';
import {
  eachCell,
  percent,
  pick,
  replaceTerrain,
  selArea,
  selGrow,
  selMatch,
  selNew,
  selOr,
  selPercentage,
  setSel,
  ter,
  type Sel,
} from './selection';
import { setTerrain, T, terrainIdAt } from './terrain';

const MAP_1: readonly string[] = [
  '---------------------------------------------------------------------------',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '---------------------------------------------------------------------------',
];
const MAP_2: readonly string[] = [
  '---------------------------------------------------------------------------',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '---------------------------------------------------------------------------',
];
const MAP_3: readonly string[] = [
  '---------------------------------------------------------------------------',
  '|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|..............---.......................................---..............|',
  '|...............|.........................................|...............|',
  '|.....|.|.|.|.|---|.|.|.|.|...................|.|.|.|.|.|---|.|.|.|.|.....|',
  '|.....|--------   --------|...................|----------   --------|.....|',
  '|.....|.|.|.|.|---|.|.|.|.|...................|.|.|.|.|.|---|.|.|.|.|.....|',
  '|...............|.........................................|...............|',
  '|..............---.......................................---..............|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|',
  '---------------------------------------------------------------------------',
];
const MAP_4: readonly string[] = [
  '-----------                                                     -----------',
  '|.........|                                                     |.........|',
  '|.........-------------                             -------------.........|',
  '---...................------------       ------------...................---',
  '  --.............................---------.............................--  ',
  '   --.................................................................--   ',
  '    --...............................................................--    ',
  '     --......LLLLL.......................................LLLLL......--     ',
  '      --.....LLLLL.......................................LLLLL.....--      ',
  '      --.....LLLLL.......................................LLLLL.....--      ',
  '     --......LLLLL.......................................LLLLL......--     ',
  '    --...............................................................--    ',
  '   --.................................................................--   ',
  '  --.............................---------.............................--  ',
  '---...................------------       ------------...................---',
  '|.........-------------                             -------------.........|',
  '|.........|                                                     |.........|',
  '-----------                                                     -----------',
];
const MAP_5: readonly string[] = [
  '                            ------------------                            ',
  '                    ---------................---------                    ',
  '              -------................................-------              ',
  '         ------............................................------         ',
  '      ----......................................................----      ',
  '    ---............................................................---    ',
  '  ---................................................................---  ',
  '---....................................................................---',
  '|........................................................................|',
  '|........................................................................|',
  '|........................................................................|',
  '---....................................................................---',
  '  ---................................................................---  ',
  '    ---............................................................---    ',
  '      ----......................................................----      ',
  '         ------............................................------         ',
  '              -------................................-------              ',
  '                    ---------................---------                    ',
  '                            ------------------                            ',
];
const MAP_6: readonly string[] = [
  '     ---------         ---------         ---------         ---------     ',
  '   ---.......---     ---.......---     ---.......---     ---.......---   ',
  '  --...........--   --...........--   --...........--   --...........--  ',
  ' --.............-- --.............-- --.............-- --.............-- ',
  ' -...............- -...............- -...............- -...............- ',
  '--...............---...............---...............---...............--',
  '|.................-.................-.................-.................|',
  '|........T.................T.................T.................T........|',
  '|.......................................................................|',
  '|......T.{.....................................................{.T......|',
  '|.......................................................................|',
  '|........T.................T.................T.................T........|',
  '|.................-.................-.................-.................|',
  '--...............---...............---...............---...............--',
  ' -...............- -...............- -...............- -...............- ',
  ' --.............-- --.............-- --.............-- --.............-- ',
  '  --...........--   --...........--   --...........--   --...........--  ',
  '   ---.......---     ---.......---     ---.......---     ---.......---   ',
  '     ---------         ---------         ---------         ---------     ',
];
const MAP_7: readonly string[] = [
  '                                                        -----              ',
  '                                                ---------...---            ',
  '                                        ---------.........L...---          ',
  '                                ---------.......................---        ',
  '                        ---------.................................---      ',
  '                ---------...........................................---    ',
  '        ---------.....................................................---  ',
  '---------...............................................................---',
  '|.........................................................................|',
  '|.L.....................................................................L.|',
  '|.........................................................................|',
  '---...............................................................---------',
  '  ---.....................................................---------        ',
  '    ---...........................................---------                ',
  '      ---.................................---------                        ',
  '        ---.......................---------                                ',
  '          ---...L.........---------                                        ',
  '            ---...---------                                                ',
  '              -----                                                        ',
];
const MAP_8: readonly string[] = [
  '----------------------------------------------                             ',
  '|............................................---                           ',
  '--.............................................---                         ',
  ' ---......................................FF.....---                       ',
  '   ---...................................FF........---                     ',
  '     ---................................FF...........---                   ',
  '       ---.............................FF..............---                 ',
  '         ---..........................FF.................---               ',
  '           ---.......................FF....................---             ',
  '             ---....................FF.......................---           ',
  '               ---.................FF..........................---         ',
  '                 ---..............FF.............................---       ',
  '                   ---...........FF................................----    ',
  '                     ---........FF...................................---   ',
  '                       ---.....FF......................................--- ',
  '                         ---.............................................--',
  '                           ---............................................|',
  '                             ----------------------------------------------',
];
const MAP_9: readonly string[] = [
  '}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}',
  '}}}}}}}}}}}}}}}}}}}}}}}}}}}}}................}}}}}}}}}}}}}}}}}}}}}}}}}}}}}',
  '}}}}}}}}}}}}}}}}}}}}}................................}}}}}}}}}}}}}}}}}}}}}',
  '}}}}}}}}}}}}}}}............................................}}}}}}}}}}}}}}}',
  '}}}}}}}}}}......................................................}}}}}}}}}}',
  '}}}}}}}............................................................}}}}}}}',
  '}}}}}.......................LLLLLLLLLLLLLLLLLL.......................}}}}}',
  '}}}....................LLLLLLLLLLLLLLLLLLLLLLLLLLL.....................}}}',
  '}....................LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL....................}',
  '}....................LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL....................}',
  '}....................LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL....................}',
  '}}}....................LLLLLLLLLLLLLLLLLLLLLLLLLLL.....................}}}',
  '}}}}}.......................LLLLLLLLLLLLLLLLLL.......................}}}}}',
  '}}}}}}}............................................................}}}}}}}',
  '}}}}}}}}}}......................................................}}}}}}}}}}',
  '}}}}}}}}}}}}}}}............................................}}}}}}}}}}}}}}}',
  '}}}}}}}}}}}}}}}}}}}}}................................}}}}}}}}}}}}}}}}}}}}}',
  '}}}}}}}}}}}}}}}}}}}}}}}}}}}}}................}}}}}}}}}}}}}}}}}}}}}}}}}}}}}',
  '}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}',
];
const MAP_10: readonly string[] = [
  '.......................................................................',
  '.......................................................................',
  '.......................................................................',
  '.......................................................................',
  '...C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C...',
  '...CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC...',
  '...C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C...',
  '...CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC...',
  '...C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C...',
  '...CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC...',
  '...C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C...',
  '...CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC...',
  '...C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C...',
  '...CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC...',
  '...C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C...',
  '.......................................................................',
  '.......................................................................',
  '.......................................................................',
  '.......................................................................',
];
// bigrm-11: no map
const MAP_12: readonly string[] = [
  '                                                                           ',
  '         .......................           .......................         ',
  '        .........................         .........................        ',
  '       ...........................       ...........................       ',
  '      .............................     .............................      ',
  '     ........PPPPPPPPPPPPPPP........   ........LLLLLLLLLLLLLLL........     ',
  '    ........PPPPPPPPPPPPPPPPP........ ........LLLLLLLLLLLLLLLLL........    ',
  '   ........PPPWWWWWWWWWWWWWPPP...............LLLZZZZZZZZZZZZZLLL........   ',
  '  ........PPPWWWWWWWWWWWWWWWPPP.............LLLZZZZZZZZZZZZZZZLLL........  ',
  ' ........PPPWWWWWWWWWWWWWWWWWPPP...........LLLZZZZZZZZZZZZZZZZZLLL........ ',
  '  ........PPPWWWWWWWWWWWWWWWPPP.............LLLZZZZZZZZZZZZZZZLLL........  ',
  '   ........PPPWWWWWWWWWWWWWPPP...............LLLZZZZZZZZZZZZZLLL........   ',
  '    ........PPPPPPPPPPPPPPPPP........ ........LLLLLLLLLLLLLLLLL........    ',
  '     ........PPPPPPPPPPPPPPP........   ........LLLLLLLLLLLLLLL........     ',
  '      .............................     .............................      ',
  '       ...........................       ...........................       ',
  '        .........................         .........................        ',
  '         .......................           .......................         ',
  '                                                                           ',
];
const MAP_13: readonly string[] = [
  '---------------------------------------------------------------------------',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '|.........................................................................|',
  '---------------------------------------------------------------------------',
];

/** des.object() x15, des.trap() x6, des.monster() x28, as every variant ends. */
const OBJECTS: LevelContent = { kind: 'object', count: 15 };
const TRAPS: LevelContent = { kind: 'trap', count: 6 };
const MONSTERS: LevelContent = { kind: 'monster', count: 28 };

/** des.level_init({ style = "solidfill", fg = " " }) (lit omitted: the coin flip is drawn) */
const STONE = { style: 'solidfill', fg: 'nh:stone' } as const;

/** des.region(selection.area(...), "lit") over the map */
const lit = (area: LevelRect) => ({ area, lit: true });

/** A plain big room: map, lit region, random stairs and the usual contents. */
const plain = (id: DefId, rows: readonly string[], area: LevelRect): LevelDef => ({
  id,
  init: STONE,
  map: { rows: [...rows] },
  regions: [lit(area)],
  contents: [OBJECTS, TRAPS, MONSTERS],
});

/** ref: dat/bigrm-1.lua (the shapes are BIGRM_FIXUPS') */
export const BIGRM_1: LevelDef = plain('nh:bigrm-1', MAP_1, [1, 1, 73, 16]);
/** ref: dat/bigrm-2.lua (the darkness and its ice are the fixup's) */
export const BIGRM_2: LevelDef = plain('nh:bigrm-2', MAP_2, [1, 1, 73, 16]);
/** ref: dat/bigrm-3.lua (the replaced walls are the fixup's) */
export const BIGRM_3: LevelDef = {
  ...plain('nh:bigrm-3', MAP_3, [1, 1, 73, 16]),
  contents: [
    OBJECTS,
    TRAPS,
    ...(
      [
        [1, 1],
        [13, 1],
        [25, 1],
        [37, 1],
        [49, 1],
        [61, 1],
        [73, 1],
        [7, 7],
        [13, 7],
        [25, 7],
        [37, 7],
        [49, 7],
        [61, 7],
        [67, 7],
        [7, 9],
        [13, 9],
        [25, 9],
        [37, 9],
        [49, 9],
        [61, 9],
        [67, 9],
        [1, 16],
        [13, 16],
        [25, 16],
        [37, 16],
        [49, 16],
        [61, 16],
        [73, 16],
      ] as const
    ).map(([x, y]): LevelContent => ({ kind: 'monster', x, y })),
  ],
};
/** ref: dat/bigrm-4.lua (the lava's replacement is the fixup's) */
export const BIGRM_4: LevelDef = {
  ...plain('nh:bigrm-4', MAP_4, [1, 1, 73, 16]),
  features: [
    { kind: 'fountain', x: 5, y: 2 },
    { kind: 'fountain', x: 5, y: 15 },
    { kind: 'fountain', x: 69, y: 2 },
    { kind: 'fountain', x: 69, y: 15 },
  ],
};
/** ref: dat/bigrm-5.lua (the ice or clouds are the fixup's) */
export const BIGRM_5: LevelDef = plain('nh:bigrm-5', MAP_5, [0, 0, 72, 18]);
/** ref: dat/bigrm-6.lua: four round rooms with trees and fountains */
export const BIGRM_6: LevelDef = plain('nh:bigrm-6', MAP_6, [1, 1, 72, 17]);
/** ref: dat/bigrm-7.lua (the lava's replacement is the fixup's) */
export const BIGRM_7: LevelDef = plain('nh:bigrm-7', MAP_7, [1, 1, 73, 17]);
/** ref: dat/bigrm-8.lua (the bars' replacement is the fixup's) */
export const BIGRM_8: LevelDef = plain('nh:bigrm-8', MAP_8, [1, 1, 73, 16]);
/** ref: dat/bigrm-9.lua: an eye in a moat, unlit but three lit areas around the "pupil" */
export const BIGRM_9: LevelDef = {
  ...plain('nh:bigrm-9', MAP_9, [0, 0, 73, 18]),
  regions: [
    { area: [0, 0, 73, 18], lit: false },
    lit([26, 4, 47, 14]),
    lit([21, 5, 51, 13]),
    lit([19, 6, 54, 12]),
  ],
};
/**
 * ref: dat/bigrm-10.lua: when falling down onto this level she never ends up in the fog maze,
 * and the up stairs are not in it either (des.levregion stair-up); the replacements and the
 * maze walk are the fixup's.
 */
export const BIGRM_10: LevelDef = {
  ...plain('nh:bigrm-10', MAP_10, [0, 0, 70, 18]),
  teleportRegions: [{ area: [0, 0, 70, 18], exclude: [2, 3, 68, 15], dir: 'down' }],
  stairs: { up: { region: [0, 0, 70, 18], exclude: [2, 3, 68, 15] } },
};
/**
 * ref: dat/bigrm-11.lua: `des.level_init({ style = "maze", corrwid = 3 + nh.rn2(3),
 * wallthick = 1, deadends = t_or_f() })`, lit (selection.area(00,00,75,18): NetHack x - 1, no
 * map); its walls between two floor cells become boulders (the fixup) and its six traps are
 * rolling boulder traps.
 */
export const BIGRM_11: LevelDef = {
  id: 'nh:bigrm-11',
  init: { style: 'maze', corrwid: { min: 3, max: 5 }, wallthick: 1, deadends: { percent: 50 } },
  regions: [lit([0, 0, 74, 18])],
  contents: [OBJECTS, { kind: 'trap', id: 'nh:rolling_boulder_trap', count: 6 }, MONSTERS],
};
/**
 * ref: dat/bigrm-12.lua: maybe stone walls for the walls of water and lava, maybe floor for the
 * pools and lava (and then pools and lava for those walls), maybe both sides alike; the region
 * (00,00,75,19) is cut at the map; des.wallify() is the fixup's.
 */
export const BIGRM_12: LevelDef = {
  ...plain('nh:bigrm-12', MAP_12, [0, 0, 74, 18]),
  edits: [
    {
      percent: 20,
      then: {
        percent: 50,
        replace: { from: 'W', to: '-' },
        then: { percent: 50, replace: { from: 'Z', to: '-' } },
        else: { percent: 50, replace: { from: 'Z', to: '-' } },
      },
    },
    {
      percent: 25,
      replace: { from: 'P', to: '.' },
      then: { percent: 75, replace: { from: 'W', to: 'P' } },
    },
    {
      percent: 25,
      replace: { from: 'L', to: '.' },
      then: { percent: 75, replace: { from: 'Z', to: 'L' } },
    },
    {
      percent: 20,
      then: {
        // both are lava, else both are water
        percent: 50,
        replace: { from: 'P', to: 'L' },
        then: { replace: { from: 'W', to: 'Z' } },
        else: { replace: { from: 'L', to: 'P' }, then: { replace: { from: 'Z', to: 'W' } } },
      },
    },
  ],
};
/**
 * ref: dat/bigrm-13.lua (the pillars are the fixup's; its region (00,00,75,18) is in Level
 * coordinates there, taken here as the whole map)
 */
export const BIGRM_13: LevelDef = plain('nh:bigrm-13', MAP_13, [0, 0, 74, 18]);

/** The thirteen variants, `rnd(13)` (ref: dat/dungeon.lua bigrm nlevels 13). */
export const BIGROOM_VARIANTS: readonly LevelDef[] = [
  BIGRM_1,
  BIGRM_2,
  BIGRM_3,
  BIGRM_4,
  BIGRM_5,
  BIGRM_6,
  BIGRM_7,
  BIGRM_8,
  BIGRM_9,
  BIGRM_10,
  BIGRM_11,
  BIGRM_12,
  BIGRM_13,
];

// ---------------------------------------------------------------------------------------------
// Fixup helpers: map-relative selections (selection.ts) and the stairs.

/** A map-relative rectangle in Level coordinates, cut at the level (get_location() ANY_LOC). */
function mapRect(def: LevelDef, level: Level, r: LevelRect): LevelRect {
  const b = mapBlock(def, level.width, level.height) ?? { x: 0, y: 0 };
  return [
    Math.max(b.x + r[0], 0),
    Math.max(b.y + r[1], 0),
    Math.min(b.x + r[2], level.width - 1),
    Math.min(b.y + r[3], level.height - 1),
  ];
}

/** selection.area() of map-relative rectangles, or'ed together. */
function areas(def: LevelDef, level: Level, rects: readonly LevelRect[]): Sel {
  let sel = selNew(level);
  for (const r of rects) sel = selOr(sel, selArea(level, ...mapRect(def, level, r)));
  return sel;
}

/**
 * Joins the walls again after a fixup's changes, as lspo_finalize_level()'s wallification(),
 * without des.wallify()'s new walls (an empty wallify area).
 */
const rejoinWalls = (level: Level): void => wallifyLevel(level, VANILLA_TERRAIN, [0, 0, -1, -1]);

type Which = 'up' | 'down' | 'branch';

/** Where staircase `which` is, or null. */
function stairsPos(level: Level, which: Which): Pos | null {
  return which === 'branch' ? (level.branch?.pos ?? null) : level[which];
}

/** The terrain of staircase `which`. */
function stairsId(level: Level, which: Which): DefId {
  const up = which === 'up' || (which === 'branch' && level.branch?.dir === 'up');
  return up ? T.stairs_up : T.stairs_down;
}

/**
 * Puts staircase `which` on a random floor or corridor spot of the map with no trap, as core
 * places random stairs (get_location(): 100 tries, then the first in column order); the old
 * spot must already have other terrain. False when there is no spot.
 */
function placeStairs(ctx: Ctx, level: Level, def: LevelDef, which: Which): boolean {
  const a = levelDefArea(def, level.width, level.height);
  const good = (x: number, y: number): boolean => {
    const id = terrainIdAt(level, x, y);
    return (id === T.floor || id === T.corr) && trapAt(level, x, y) === undefined;
  };
  let p: Pos | null = null;
  for (let i = 0; i < 100 && !p; i++) {
    const x = a.x + ctx.rng.rn2(a.w);
    const y = a.y + ctx.rng.rn2(a.h);
    if (good(x, y)) p = { x, y };
  }
  for (let x = a.x; x < a.x + a.w && !p; x++)
    for (let y = a.y; y < a.y + a.h && !p; y++) if (good(x, y)) p = { x, y };
  if (!p) return false;
  setTerrain(level, p.x, p.y, stairsId(level, which));
  if (which === 'branch') {
    if (level.branch) level.branch.pos = p;
  } else level[which] = p;
  return true;
}

/**
 * Runs `draw`, terrain changes NetHack's script makes before its stairs, with the stairs core
 * already made lifted (their spots are floor meanwhile, as in NetHack); then each goes back on
 * its spot when that is still floor, else on a new random one.
 */
function beforeStairs(ctx: Ctx, level: Level, def: LevelDef, draw: () => void): void {
  const lifted: Which[] = [];
  for (const which of ['up', 'down', 'branch'] as const) {
    const p = stairsPos(level, which);
    if (!p) continue;
    setTerrain(level, p.x, p.y, T.floor);
    lifted.push(which);
  }
  draw();
  for (const which of lifted) {
    const p = stairsPos(level, which) as Pos;
    if (terrainIdAt(level, p.x, p.y) === T.floor)
      setTerrain(level, p.x, p.y, stairsId(level, which));
    else placeStairs(ctx, level, def, which);
  }
}

/** A straight (horizontal or vertical) selection.line(), map-relative. */
function line(def: LevelDef, level: Level, x1: number, y1: number, x2: number, y2: number): Sel {
  return areas(def, level, [[x1, y1, x2, y2]]);
}

/** selection.rect(): the outline of a map-relative rectangle. */
function outline(def: LevelDef, level: Level, x1: number, y1: number, x2: number, y2: number): Sel {
  const sides: LevelRect[] = [
    [x1, y1, x2, y1],
    [x1, y2, x2, y2],
    [x1, y1, x1, y2],
    [x2, y1, x2, y2],
  ];
  return areas(def, level, sides);
}

// ---------------------------------------------------------------------------------------------
// The fixups, in each script's order.

/** bigrm-1: 80% of the time a line, two lines, a plus, brackets or a snake of one terrain. */
const FIXUP_1: SpLevFixup = {
  before(ctx, level, def) {
    beforeStairs(ctx, level, def, () => {
      if (!percent(ctx, 80)) return;
      const terrain = pick(ctx, ['-', 'F', 'L', 'T', 'C']);
      const choice = ctx.rng.rn2(6); // math.random(0, 5)
      if (choice === 0) setSel(level, line(def, level, 10, 8, 65, 8), terrain);
      else if (choice === 1)
        setSel(
          level,
          selOr(line(def, level, 15, 4, 15, 13), line(def, level, 59, 4, 59, 13)),
          terrain,
        );
      else if (choice === 2)
        setSel(
          level,
          selOr(line(def, level, 10, 8, 64, 8), line(def, level, 37, 3, 37, 14)),
          terrain,
        );
      else if (choice === 3) {
        // brackets: [  ]
        setSel(level, outline(def, level, 4, 4, 70, 13), terrain);
        setSel(level, selOr(line(def, level, 25, 4, 50, 4), line(def, level, 25, 13, 50, 13)), '.');
      } else if (choice === 4) {
        // snake
        setSel(level, areas(def, level, [[5, 5, 69, 12]]), terrain);
        for (let i = 0; i <= 7; i++) {
          const x = 6 + i * 8;
          const y = 5 + (i % 2);
          setSel(level, areas(def, level, [[x, y, x + 6, y + 6]]), '.');
        }
      }
      rejoinWalls(level);
    });
  },
};

/** bigrm-2: one of three darkness patterns (or none), a quarter of the time iced over. */
const FIXUP_2: SpLevFixup = {
  before(ctx, level, def) {
    beforeStairs(ctx, level, def, () => {
      const choice = ctx.rng.rn2(4); // math.random(0, 3)
      const rects: LevelRect[] =
        choice === 0
          ? [
              [1, 7, 22, 9],
              [24, 1, 50, 5],
              [24, 11, 50, 16],
              [52, 7, 73, 9],
            ]
          : choice === 1
            ? [[24, 1, 50, 16]]
            : choice === 2
              ? [
                  [1, 1, 22, 16],
                  [52, 1, 73, 16],
                ]
              : [];
      if (rects.length === 0) return;
      const darkness = areas(def, level, rects);
      darkness.forEach((d, i) => {
        if (d) level.lit[i] = 0; // des.region(darkness, "unlit")
      });
      if (percent(ctx, 25)) replaceTerrain(ctx, level, selGrow(level, darkness), '.', 'I');
    });
  },
};

/** bigrm-3: two times in three the walls between floor become bars, trees, water or lava. */
const FIXUP_3: SpLevFixup = {
  before(ctx, level, def) {
    beforeStairs(ctx, level, def, () => {
      if (!percent(ctx, 66)) return;
      const sel = selMatch(level, '.w.'); // selection.match("[.w.]")
      setSel(level, sel, pick(ctx, ['F', 'T', 'W', 'Z']));
      rejoinWalls(level);
    });
  },
};

/** bigrm-4: the lava squares become floor (4 in 10), pools, walls, trees or water or lava walls. */
const FIXUP_4: SpLevFixup = {
  before(ctx, level, def) {
    beforeStairs(ctx, level, def, () => {
      const to = pick(ctx, ['.', '.', '.', '.', 'P', 'L', '-', 'T', 'W', 'Z']);
      if (to !== 'L') replaceTerrain(ctx, level, null, 'L', to);
      rejoinWalls(level);
    });
  },
};

/** bigrm-5: a quarter of the time patches of ice or clouds around 2% of the floor. */
const FIXUP_5: SpLevFixup = {
  before(ctx, level, def) {
    beforeStairs(ctx, level, def, () => {
      if (!percent(ctx, 25)) return;
      const sel = selGrow(level, selPercentage(ctx.rng, level, selMatch(level, '.'), 2));
      replaceTerrain(ctx, level, sel, '.', percent(ctx, 50) ? 'I' : 'C');
    });
  },
};

/** bigrm-7: the three lava squares become lava, trees, fountains or floor. */
const FIXUP_7: SpLevFixup = {
  before(ctx, level, def) {
    beforeStairs(ctx, level, def, () => {
      const to = pick(ctx, ['L', 'T', '{', '.']);
      replaceTerrain(ctx, level, areas(def, level, [[0, 0, 74, 18]]), 'L', to);
    });
  },
};

/** bigrm-8: 40% of the time the diagonal bars become lava, moat, trees, floor, walls or clouds. */
const FIXUP_8: SpLevFixup = {
  before(ctx, level, def) {
    beforeStairs(ctx, level, def, () => {
      if (!percent(ctx, 40)) return;
      const to = pick(ctx, ['L', '}', 'T', '.', '-', 'C']);
      replaceTerrain(ctx, level, areas(def, level, [[0, 0, 74, 17]]), 'F', to);
      rejoinWalls(level);
    });
  },
};

/**
 * bigrm-10: 40% of the time the fog is broken up a bit and the rest becomes lava, moat, trees,
 * walls or bars; after the contents the fog maze is walked (unstocked) and the down stairs go
 * on a random spot, which may be in the maze.
 */
const FIXUP_10: SpLevFixup = {
  before(ctx, level, def) {
    if (!percent(ctx, 40)) return;
    const to = pick(ctx, ['L', '}', 'T', '-', 'F']);
    const region = areas(def, level, [[0, 0, 70, 18]]);
    replaceTerrain(ctx, level, region, 'C', '.', 5);
    replaceTerrain(ctx, level, region, 'C', to);
  },
  after(ctx, level, def) {
    const down = level.down;
    if (down) setTerrain(level, down.x, down.y, T.floor);
    mazewalk(ctx, level, def, 4, 2, 'south', false); // des.mazewalk({ ..., stocked = 0 })
    rejoinWalls(level);
    if (down) placeStairs(ctx, level, def, 'down'); // des.stair("down")
  },
};

/** des.object("boulder", x, y) */
function boulderAt(ctx: Ctx, level: Level, x: number, y: number): void {
  mksobjFull(
    ctx,
    ctx.defs.object('nh:boulder'),
    { at: { level: level.id, x, y } },
    { level: level.id, inMklev: true },
  );
}

/**
 * bigrm-11: every wall between two floor cells (across or up and down), then the corners left
 * between two floor cells across, becomes floor with a boulder.
 */
const FIXUP_11: SpLevFixup = {
  before(ctx, level, def) {
    beforeStairs(ctx, level, def, () => {
      const replace = (sel: Sel): void =>
        eachCell(level, (x, y, i) => {
          if (sel[i] !== true) return;
          setTerrain(level, x, y, T.floor);
          boulderAt(ctx, level, x, y);
        });
      replace(selOr(selMatch(level, '.w.'), selMatch(level, '.\nw\n.')));
      replace(selMatch(level, '.w.'));
      rejoinWalls(level);
    });
  },
};

/** bigrm-12: des.wallify() around the map, after the replacements. */
const FIXUP_12: SpLevFixup = {
  before(_ctx, level, def) {
    const a = levelDefArea(def, level.width, level.height);
    wallifyLevel(level, VANILLA_TERRAIN, [a.x - 1, a.y - 1, a.x + a.w, a.y + a.h]);
  },
};

/** One 3x3 pillar: `---`, `| |`, `---`. */
const PILLAR = ['---', '| |', '---'] as const;

/**
 * bigrm-13: pillars on a 7x3 grid by one of eight patterns (all, three columns, a checkerboard,
 * the centre row, the top and bottom rows, half at random, corners and centre, slanted), then
 * des.wallify(). NetHack puts them at (12 + 9x, 4 + 5y), its own coordinates; that is
 * (9 + 9x, 3 + 5y) of the map, which NetHack centres at (3, 1).
 */
const FIXUP_13: SpLevFixup = {
  before(ctx, level, def) {
    beforeStairs(ctx, level, def, () => {
      const filters: ((x: number, y: number) => boolean)[] = [
        () => true,
        (x) => x % 2 === 1,
        (x, y) => (x + y) % 2 === 0,
        (_x, y) => y % 2 === 1,
        (_x, y) => y % 2 === 0,
        () => ctx.rng.rn2(2) === 0, // math.random(0, 1) == 0
        (x, y) => (x / 3) % 2 === y % 2, // lua's float division: x = 0 and 6, or 3
        (x, y) => Math.floor((x + 1) / 3) === y,
      ];
      const filter = pick(ctx, filters);
      for (let y = 0; y <= 2; y++)
        for (let x = 0; x <= 6; x++) {
          if (!filter(x, y)) continue;
          for (let py = 0; py < 3; py++)
            for (let px = 0; px < 3; px++) {
              const p = mapToLevel(def, level, 9 + x * 9 + px, 3 + y * 5 + py);
              setTerrain(level, p.x, p.y, ter(PILLAR[py]?.[px] ?? ' '));
            }
        }
      wallifyLevel(level, VANILLA_TERRAIN);
    });
  },
};

/** The big rooms' fixups, by LevelDef id (registerSpLev). */
export const BIGROOM_FIXUPS: Readonly<Record<DefId, SpLevFixup>> = {
  [BIGRM_1.id]: FIXUP_1,
  [BIGRM_2.id]: FIXUP_2,
  [BIGRM_3.id]: FIXUP_3,
  [BIGRM_4.id]: FIXUP_4,
  [BIGRM_5.id]: FIXUP_5,
  [BIGRM_7.id]: FIXUP_7,
  [BIGRM_8.id]: FIXUP_8,
  [BIGRM_10.id]: FIXUP_10,
  [BIGRM_11.id]: FIXUP_11,
  [BIGRM_12.id]: FIXUP_12,
  [BIGRM_13.id]: FIXUP_13,
};
