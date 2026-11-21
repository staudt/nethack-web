// The Rogue's quest: the Thieves' Guild Hall in the town's back streets, its four exits one real
// staircase and three mimics, the streets full of nymphs, leprechauns and chameleons (home), the
// leprechauns' and nagas' cavern (locate), the Master Assassin's stronghold by the shark pool with
// the Master Key of Thievery (goal), and the room-and-corridor fillers above and below the
// locate level. ref: dat/Rog-strt.lua, Rog-loca.lua, Rog-goal.lua, Rog-fila.lua, Rog-filb.lua
//
// Translation notes (DEVIATIONS.md "Quest levels (m24b)"): maps, lit regions, fixed stairs,
// doors and contents are LevelDef data; "mazelevel", "noteleport", "hardfloor", "nommap" and the
// non-diggable areas are levelflags.ts entries. Fixups, in the script's order: Rog-strt's streets
// (selection.floodfill(0,12) right after the map: core's down stairs went on a placeholder at one
// of the exits, lifted first), nhlib's shuffled exits (the down stairs on the first, a giant,
// large and small mimic looking like stairs on the others), the Master of Thieves' custom
// inventory (`d(2,4)` not-cursed daggers, drawn before they are made), the nymphs and
// leprechauns (`math.random(4,7)` pairs) and chameleons (`math.random(7,10)`) on the streets
// (rndcoord(1) each) and the branch levregion (the portal), placed last as fixup_special() does;
// Rog-loca's cursed scroll of teleportation; Rog-goal's Master Key of Thievery (blessed, named
// through onameItem()) after its spiked pit, and its up stairs' levregion on the left-hand side
// once the level is made (a placeholder on map floor until then). The fillers are the Oracle's
// kind of des.room level: six random rooms with their contents and random corridors.
import type { DefId, LevelContent, LevelDef, LevelRect, Pos, RegionDef } from '@nh/core';
import { selFloodfill, selRndcoord } from '../selection';
import {
  desLevregion,
  desStair,
  makeContents,
  mapToLevel,
  shuffle,
  type SpLevFixup,
} from '../sp_lev';
import { T, setTerrain } from '../terrain';
import { TRAP } from '../trap';
import {
  branchAt,
  cls,
  hostile,
  liftUpPlaceholder,
  mon,
  monWithInventory,
  obj,
  objectAt,
  questArtifact,
  times,
  trap,
} from './common';

const LEPRECHAUN = 'nh:leprechaun';
const NYMPH = 'nh:water_nymph';
const NAGA = 'nh:guardian_naga';
const CHAMELEON = 'nh:chameleon';
const wholeLit = (x2: number, y2: number): RegionDef => ({ area: [0, 0, x2, y2], lit: true });
/** A content entry at a Level spot. */
const atLevel = (c: LevelContent, p: Pos | null): LevelContent =>
  p === null ? c : { ...c, x: p.x, y: p.y, coords: 'level' };

// ---------------------------------------------------------------------------------------------
// Rog-strt: the home level

const STRT_MAP: readonly string[] = [
  '---------------------------------.------------------------------------------',
  '|.....|.||..........|....|......|.|.........|.......+............---.......|',
  '|.....|..+..........+....---....S.|...-S-----.-----.|............+.+.......|',
  '|.....+.||........---......|....|.|...|.....|.|...|.---.....------.--------|',
  '|-----|.-------|..|........------.-----.....|.--..|...-------..............|',
  '|.....|........------+------..........+.....|..--S---.........------.-----..',
  '|.....|.------...............-----.}}.--------.|....-------.---....|.+...--|',
  '|..-+--.|....|-----.--------.|...|.....+.....|.|....|.....+.+......|.--....|',
  '|..|....|....|....+.|......|.|...-----.|.....|.--...|.....|.|......|..|....|',
  '|..|.-----S----...|.+....-----...|...|.----..|..|.---....--.---S-----.|----|',
  '|..|.|........|...------.|.S.....|...|....-----.+.|......|..|.......|.|....|',
  '|---.-------..|...|....|.|.|.....|...----.|...|.|---.....|.|-.......|.---..|',
  '...........|..S...|....---.----S----..|...|...+.|..-------.---+-....|...--+|',
  '|---------.---------...|......|....S..|.---...|.|..|...........----.---....|',
  '|........|.........|...+.------....|---.---...|.--+-.----.----....|.+...--+|',
  '|........|.---+---.|----.--........|......-----......|..|..|.--+-.|.-S-.|..|',
  '|........|.|.....|........----------.----.......---.--..|-.|....|.-----.|..|',
  '|----....+.|.....----+---............|..|--------.+.|...SS.|....|.......|..|',
  '|...--+-----.....|......|.------------............---...||.------+--+----..|',
  '|..........S.....|......|.|..........S............|.....||...|.....|....|..|',
  '-------------------------.--------------------------------------------------',
];

/**
 * The down stairs is at one of the 4 "exits". The others are mimics, mimicking stairwells.
 * `local place = { {33,0}, {0,12}, {25,20}, {75,05} }`; core first puts the stairs on the first.
 */
const STRT_EXITS: readonly (readonly [number, number])[] = [
  [33, 0],
  [0, 12],
  [25, 20],
  [75, 5],
];

/** The mimics on the second, third and fourth shuffled exits. */
const STRT_MIMICS: readonly DefId[] = ['nh:giant_mimic', 'nh:large_mimic', 'nh:small_mimic'];

/** ref: dat/Rog-strt.lua */
export const ROG_STRT: LevelDef = {
  id: 'nh:rog-strt',
  // des.level_init({ style = "solidfill", fg = " " }) (lit omitted: the coin flip is drawn)
  init: { style: 'solidfill', fg: 'nh:stone' },
  map: { rows: [...STRT_MAP] },
  // (no region: --REGION:(00,00,75,20),lit,"ordinary")
  // the fixup lifts them and makes them on the first shuffled exit
  stairs: { down: { x: 33, y: 0 } },
  doors: [
    // Doors (secret)
    ...(
      [
        [32, 2],
        [63, 9],
        [27, 10],
        [31, 12],
        [35, 13],
        [69, 15],
        [56, 17],
        [57, 17],
        [11, 19],
        [37, 19],
        [39, 2],
        [49, 5],
        [10, 9],
        [14, 12],
      ] as const
    ).map(([x, y]) => ({ x, y, state: 'locked' as const })),
    // Doors (regular)
    ...(
      [
        [52, 1],
        [9, 2],
        [20, 2],
        [65, 2],
        [67, 2],
        [6, 3],
        [21, 5],
        [38, 5],
        [69, 6],
        [4, 7],
        [39, 7],
        [58, 7],
        [60, 7],
        [18, 8],
        [20, 9],
        [48, 10],
        [46, 12],
        [62, 12],
        [74, 12],
        [23, 14],
        [23, 14],
        [50, 14],
        [68, 14],
        [74, 14],
        [14, 15],
        [63, 15],
        [9, 17],
        [21, 17],
        [50, 17],
        [6, 18],
        [65, 18],
        [68, 18],
      ] as const
    ).map(([x, y]) => ({ x, y, state: 'closed' as const })),
  ],
  // after the Master of Thieves (the fixup makes him with his inventory first)
  contents: [
    // The treasure of Master of Thieves
    { kind: 'object', id: 'nh:chest', x: 36, y: 11 },
    // thug guards, rooms #1, #2 and #3
    ...(
      [
        [28, 10],
        [29, 11],
        [30, 9],
        [31, 7],
        [31, 13],
        [33, 14],
        [30, 15],
        [35, 9],
        [36, 13],
      ] as const
    ).map(([x, y]) => mon('nh:thug', x, y)),
    // Random traps
    ...times(16, trap()),
    // Monsters to get in the way: the west, north, east and south exits.
    ...(
      [
        [LEPRECHAUN, 1, 12],
        [NYMPH, 2, 12],
        [NYMPH, 33, 1],
        [LEPRECHAUN, 33, 2],
        [NYMPH, 74, 5],
        [LEPRECHAUN, 74, 4],
        [LEPRECHAUN, 25, 19],
        [NYMPH, 25, 18],
      ] as const
    ).map(([id, x, y]) => hostile(id, x, y)),
  ],
};

const STRT_FIXUP: SpLevFixup = {
  contents(ctx, level, def) {
    // core's down stairs, on the first exit, go back to floor until the shuffle places them
    const [px, py] = STRT_EXITS[0] ?? [33, 0];
    const ph = mapToLevel(def, level, px, py);
    setTerrain(level, ph.x, ph.y, T.floor);
    level.down = null;
    // local streets = selection.floodfill(0,12)
    const w = mapToLevel(def, level, 0, 12);
    const streets = selFloodfill(level, w.x, w.y);
    // shuffle(place); the stairs on place[1], the mimics on the others
    const place = STRT_EXITS.map(([x, y]) => mapToLevel(def, level, x, y));
    shuffle(ctx, place);
    const [stairs, ...mimicSpots] = place;
    if (stairs) desStair(ctx, level, 'down', stairs);
    for (const [k, id] of STRT_MIMICS.entries())
      makeContents(ctx, level, def, [
        {
          ...atLevel(mon(id), mimicSpots[k] ?? null),
          appearAs: { kind: 'furniture', id: T.stairs_down },
        },
      ]);
    // Master of Thieves
    monWithInventory(ctx, level, def, 'nh:master_of_thieves', 36, 11, [
      ['nh:leather_armor', 5],
      ['nh:silver_dagger', 4],
      ['nh:dagger', 2, { quantity: { dice: [2, 4] }, buc: 'not-cursed' }],
    ]);
    makeContents(ctx, level, def, def.contents ?? []);
    // streets:rndcoord(1): a spot, taken out of the selection (none left: a random spot)
    const street = (): Pos | null => {
      const p = selRndcoord(ctx.rng, level, streets);
      if (p !== null) streets[p.y * level.width + p.x] = false;
      return p;
    };
    // Wandering the streets: math.random(4,7) pairs, then math.random(7,10) chameleons
    const pairs = 4 + ctx.rng.rn2(4);
    for (let i = 1; i <= pairs; i++) {
      makeContents(ctx, level, def, [atLevel(hostile(NYMPH), street())]);
      makeContents(ctx, level, def, [atLevel(hostile(LEPRECHAUN), street())]);
    }
    const chams = 7 + ctx.rng.rn2(4);
    for (let i = 1; i <= chams; i++)
      makeContents(ctx, level, def, [atLevel(hostile(CHAMELEON), street())]);
  },
  after(ctx, level, def) {
    // Portal arrival point: des.levregion({ region = {19,09,19,09}, type="branch" })
    branchAt(ctx, level, def, 19, 9);
  },
};

// ---------------------------------------------------------------------------------------------
// Rog-loca: the cavern

const LOCA_MAP: readonly string[] = [
  '             ----------------------------------------------------   --------',
  '           ---.................................................-    --.....|',
  '         ---...--------........-------.......................---     ---...|',
  '       ---.....-      ---......-     ---..................----         --.--',
  '     ---.....----       --------       --..................--         --..| ',
  '   ---...-----                       ----.----.....----.....---      --..|| ',
  '----..----                       -----..---  |...---  |.......---   --...|  ',
  '|...---                       ----....---    |.---    |.........-- --...||  ',
  '|...-                      ----.....---     ----      |..........---....|   ',
  '|...----                ----......---       |         |...|.......-....||   ',
  '|......-----          ---.........-         |     -----...|............|    ',
  '|..........-----   ----...........---       -------......||...........||    ',
  '|..............-----................---     |............|||..........|     ',
  '|------...............................---   |...........|| |.........||     ',
  '|.....|..............------.............-----..........||  ||........|      ',
  '|.....|.............--    ---.........................||    |.......||      ',
  '|.....|.............-       ---.....................--|     ||......|       ',
  '|-S----------.......----      --.................----        |.....||       ',
  '|...........|..........--------..............-----           ||....|        ',
  '|...........|............................-----                |....|        ',
  '------------------------------------------                    ------        ',
];

/** ref: dat/Rog-loca.lua */
export const ROG_LOCA: LevelDef = {
  id: 'nh:rog-loca',
  init: { style: 'solidfill', fg: 'nh:stone' },
  map: { rows: [...LOCA_MAP] },
  // Dungeon Description; des.stair("up"), des.stair("down") at random
  regions: [wholeLit(75, 20)],
  // after the cursed scroll of teleportation (the fixup makes it first)
  contents: [
    ...times(14, obj()),
    // Random traps
    ...times(6, trap()),
    // Random monsters.
    ...times(17, hostile(LEPRECHAUN)),
    cls('l', false),
    ...times(7, hostile(NAGA)),
    ...times(3, cls('N', false)),
    ...times(5, hostile(CHAMELEON)),
  ],
};

const LOCA_FIXUP: SpLevFixup = {
  contents(ctx, level, def) {
    // des.object({ id = "scroll of teleportation", x=11, y=18, buc="cursed", spe=0 })
    objectAt(ctx, level, def, 'nh:scroll_of_teleportation', mapToLevel(def, level, 11, 18), {
      buc: 'cursed',
    });
    makeContents(ctx, level, def, def.contents ?? []);
  },
};

// ---------------------------------------------------------------------------------------------
// Rog-goal: the Master Assassin's stronghold

const GOAL_MAP: readonly string[] = [
  '-----      -------.......................................|-----------------|',
  '|...|  -----.....|.......................................|.................|',
  '|...----...|.....|.......................................|....---------....|',
  '|.---......---..--.................................------------.......|....|',
  '|...............|..................................|..|...|...----........-|',
  '|.....-----....--.................................|-..--..-|.....----S----| ',
  '|--S---...|....|.................................|-........-|....|........| ',
  '|.........---------.............................|-....}}....-|...|...|....| ',
  '|....|.....S......|............................|-.....}}.....-|..--.------| ',
  '|-----.....--.....|...........................|-...}}}}}}}}...-|....|.....--',
  '|...........--....------S-----...............|-....}}}}}}}}....-|..........|',
  '|............--........|...| |..............--.....}}.}}........----------S-',
  '|.............|........|...| |..............|......}}}}}}}}......|...|.....|',
  '|S-.---.---.---.---.---|...| ------------...--........}}.}}.....--..---....|',
  '|.---.---.---.---.-S-..----- |....|.....|....|-....}}}}}}}}....---..S.|--..|',
  '|...|.......|..........|...---....---...S.....|-...}}}}}}}}...-|.S..|...|..|',
  '|...|..|....|..........|............|..--..----|-.....}}.....-|..----...-S--',
  '|...|---....----.......|----- ......|...---|    |-....}}....-|...|..--.--..|',
  '-----.....---.....--.---....--...--------..|     |-........-|....|.........|',
  '    |.............|..........|.............S...   |S-------|.....|..-----..|',
  '    ----------------------------------------  ......       ----------   ----',
];

/** The up stairs' levregion: {01,00,15,20} (region_islev; NetHack x - 1 here). */
export const ROG_GOAL_UP_REGION: LevelRect = [0, 0, 14, 20];
/** Its exclusion, map-relative: {01,18,04,20}. */
const GOAL_UP_EXCLUDE = [1, 18, 4, 20] as const;
/** Core's up stairs before the levregion places them (map floor). */
const GOAL_UP_PLACEHOLDER = { x: 1, y: 1 } as const;

/** ref: dat/Rog-goal.lua */
export const ROG_GOAL: LevelDef = {
  id: 'nh:rog-goal',
  init: { style: 'solidfill', fg: 'nh:stone' },
  map: { rows: [...GOAL_MAP] },
  // Dungeon Description
  regions: [wholeLit(75, 20)],
  stairs: { up: { ...GOAL_UP_PLACEHOLDER } },
  // after the spiked pit and the Master Key of Thievery (the fixup makes them first)
  contents: [
    { kind: 'object', id: 'nh:tin', x: 26, y: 12, montype: CHAMELEON },
    ...times(13, obj()),
    // Random traps
    ...times(11, trap()),
    // Random monsters.
    hostile('nh:master_assassin', 38, 10),
    ...times(16, hostile(LEPRECHAUN)),
    ...times(2, cls('l', false)),
    ...times(8, hostile(NAGA)),
    ...times(3, cls('N', false)),
    ...times(5, hostile(CHAMELEON)),
    ...(
      [
        [51, 14],
        [53, 9],
        [55, 15],
        [58, 10],
      ] as const
    ).map(([x, y]) => hostile('nh:shark', x, y)),
  ],
};

const GOAL_FIXUP: SpLevFixup = {
  before(_ctx, level, def) {
    liftUpPlaceholder(level, def, GOAL_UP_PLACEHOLDER);
  },
  contents(ctx, level, def) {
    // One trap to keep the gnomes at bay.
    makeContents(ctx, level, def, [trap(TRAP.spikedPit, 37, 7)]);
    // Objects
    questArtifact(ctx, level, def, 'nh:skeleton_key', 38, 10, 0, 'The Master Key of Thievery');
    makeContents(ctx, level, def, def.contents ?? []);
  },
  after(ctx, level, def) {
    // des.levregion({ region={01,00,15,20}, region_islev=1, exclude={01,18,04,20},
    // type="stair-up" }), placed by fixup_special()
    const a = mapToLevel(def, level, GOAL_UP_EXCLUDE[0], GOAL_UP_EXCLUDE[1]);
    const b = mapToLevel(def, level, GOAL_UP_EXCLUDE[2], GOAL_UP_EXCLUDE[3]);
    desLevregion(ctx, level, 'stair-up', ROG_GOAL_UP_REGION, [a.x, a.y, b.x, b.y]);
  },
};

// ---------------------------------------------------------------------------------------------
// the fillers

/**
 * The fillers' six des.room({ type = "ordinary", contents }) rooms, placed as random rooms, with
 * random corridors (Rog-fila and Rog-filb are the same). As the Oracle's level, the level starts
 * as dark stone. ref: dat/Rog-fila.lua, Rog-filb.lua
 */
function filler(id: DefId): LevelDef {
  return {
    id,
    init: { style: 'solidfill', fg: 'nh:stone', lit: false },
    rooms: [
      { stairs: ['up'], contents: [obj(), hostile(LEPRECHAUN)] },
      { contents: [obj(), obj(), hostile(LEPRECHAUN), hostile(NAGA)] },
      { contents: [obj(), trap(), trap(), obj(), hostile(NYMPH)] },
      { stairs: ['down'], contents: [obj(), trap(), trap(), cls('l', false), hostile(NAGA)] },
      { contents: [obj(), obj(), trap(), trap(), hostile(LEPRECHAUN)] },
      { contents: [obj(), trap(), trap(), hostile(LEPRECHAUN), hostile(NYMPH)] },
    ],
    corridors: 'random',
  };
}

/** ref: dat/Rog-fila.lua: between the home and the locate level */
export const ROG_FILA: LevelDef = filler('nh:rog-fila');

/** ref: dat/Rog-filb.lua: between the locate and the goal level */
export const ROG_FILB: LevelDef = filler('nh:rog-filb');

/** The Rogue's five levels. */
export const ROG_LEVELS: readonly LevelDef[] = [ROG_STRT, ROG_LOCA, ROG_GOAL, ROG_FILA, ROG_FILB];

/** Their fixups, by LevelDef id. */
export const ROG_FIXUPS: Readonly<Record<DefId, SpLevFixup>> = {
  [ROG_STRT.id]: STRT_FIXUP,
  [ROG_LOCA.id]: LOCA_FIXUP,
  [ROG_GOAL.id]: GOAL_FIXUP,
};
