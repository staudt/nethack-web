// Mines' End: NetHack 5.0's three variants, as LevelDefs plus fixups. ref: dat/minend-1.lua,
// dat/minend-2.lua, dat/minend-3.lua
//
// Translation notes (see DEVIATIONS.md "Mines' End"): the vampires (`V`) of minend-3, the engravings, the arrival and teleport regions, the
// non-diggable walls and the achievements are left out. minend-2's potion of object detection is
// a random potion (no such potion yet). The fountains come from the map ('{'); they are not magic.
// Shuffled niches, "not-cursed" luckstones, minend-2's conditional locked door and minend-3's
// maze walk and level teleporters (on the shuffled `place` spots) are fixups (sp_lev.ts SpLevFixup), as C's are lua code.
import type { Ctx, DefId, Level, LevelContent, LevelDef } from '@nh/core';
import { cellIndex, isPlainFloor, VANILLA_TERRAIN, wallifyLevel } from '@nh/core';
import { mazewalk } from './mazewalk';
import { mktrap } from './mklev';
import { mksobjFull } from './mkobj';
import { createMonster, mapToLevel, shuffle, type SpLevFixup } from './sp_lev';
import { TRAP } from './trap';

type Spot = readonly [x: number, y: number];

const mon = (id: string, count?: number): LevelContent => ({
  kind: 'monster',
  id: `nh:${id}`,
  ...(count === undefined ? {} : { count }),
});
const cls = (c: string, count?: number): LevelContent => ({
  kind: 'monster',
  class: c,
  ...(count === undefined ? {} : { count }),
});
const obj = (cls: string, count?: number, at?: Spot): LevelContent => ({
  kind: 'object',
  class: cls,
  ...(count === undefined ? {} : { count }),
  ...(at === undefined ? {} : { x: at[0], y: at[1] }),
});
const objId = (id: string, at?: Spot): LevelContent => ({
  kind: 'object',
  id: `nh:${id}`,
  ...(at === undefined ? {} : { x: at[0], y: at[1] }),
});
const ANY_OBJECT: LevelContent = { kind: 'object' };

const SOLID_STONE = { style: 'solidfill', fg: 'nh:stone' } as const;

/** The scattered objects, traps and gnomes of minend-1 and minend-2. */
const GNOME_END: LevelContent[] = [
  obj('gem', 7),
  obj('tool', 2),
  { ...ANY_OBJECT, count: 3 },
  { kind: 'trap', count: 6 },
  mon('gnome_king'),
  mon('gnome_lord', 3),
  mon('gnomish_wizard', 2),
  mon('gnome', 9),
  mon('hobbit', 2),
  mon('dwarf', 3),
  cls('h'),
];

/** des.object({ id, coord, buc = "not-cursed" or random }) at a map spot. ref: create_object() */
function objectAt(ctx: Ctx, level: Level, def: LevelDef, id: string, at: Spot, notCursed = false) {
  const p = mapToLevel(def, level, at[0], at[1]);
  const e = mksobjFull(
    ctx,
    ctx.defs.object(`nh:${id}`),
    { at: { level: level.id, x: p.x, y: p.y } },
    { level: level.id, inMklev: true },
  );
  const item = ctx.state.entities[String(e)]?.c.item;
  if (notCursed && item?.buc === 'cursed') item.buc = 'uncursed'; // case 4: uncurse()
}

/** "Mimic of the Mines". ref: dat/minend-1.lua */
export const MINEND_1: LevelDef = {
  id: 'nh:minend-1',
  init: SOLID_STONE,
  map: {
    rows: [
      '------------------------------------------------------------------   ------',
      '|                        |.......|     |.......-...|       |.....|.       |',
      '|    ---------        ----.......-------...........|       ---...-S-      |',
      '|    |.......|        |..........................-S-      --.......|      |',
      '|    |......-------   ---........................|.       |.......--      |',
      '|    |..--........-----..........................|.       -.-..----       |',
      '|    --..--.-----........-.....................---        --..--          |',
      '|     --..--..| -----------..................---.----------..--           |',
      '|      |...--.|    |..S...S..............---................--            |',
      '|     ----..-----  ------------........--- ------------...---             |',
      '|     |.........--            ----------              ---...-- -----      |',
      '|    --.....---..--                           --------  --...---...--     |',
      '| ----..-..-- --..---------------------      --......--  ---........|     |',
      '|--....-----   --..-..................---    |........|    |.......--     |',
      '|.......|       --......................S..  --......--    ---..----      |',
      '|--.--.--        ----.................---     ------..------...--         |',
      '| |....S..          |...............-..|         ..S...........|          |',
      '--------            --------------------           ------------------------',
    ],
  },
  // the arrival room region {26,01,32,01} is left out (no arrival rooms)
  regions: [
    { area: [20, 8, 21, 8], lit: false },
    { area: [23, 8, 25, 8], lit: false },
  ],
  doors: [
    { x: 7, y: 16, state: 'locked' },
    { x: 22, y: 8, state: 'locked' },
    { x: 26, y: 8, state: 'locked' },
    { x: 40, y: 14, state: 'locked' },
    { x: 50, y: 3, state: 'locked' },
    { x: 51, y: 16, state: 'locked' },
    { x: 66, y: 2, state: 'locked' },
  ],
  stairs: { up: { x: 36, y: 4 } },
  contents: GNOME_END,
};

/** minend-1's niches (`place`, shuffled; place[6] stays empty). */
export const MINEND_1_PLACES: readonly Spot[] = [
  [8, 16],
  [13, 7],
  [21, 8],
  [41, 14],
  [50, 4],
  [50, 16],
  [66, 1],
];

/**
 * The niche gems and stones, before the scattered objects as in the lua, with the four mimics
 * posing as a luckstone, loadstone, flint and touchstone (des.monster({ class = "m", coord,
 * appear_as = "obj:..." })) after the objects of their niches.
 */
const MINEND_1_FIXUP: SpLevFixup = {
  before(ctx, level, def) {
    const place = [...MINEND_1_PLACES];
    shuffle(ctx, place);
    const p = (n: number): Spot => place[n - 1] as Spot; // lua is 1-based
    const at = (id: string, n: number, notCursed = false): void =>
      objectAt(ctx, level, def, id, p(n), notCursed);
    const mimic = (id: string, n: number): void => {
      const [x, y] = p(n);
      createMonster(
        ctx,
        level,
        { kind: 'monster', class: 'm', x, y, appearAs: { kind: 'object', id: `nh:${id}` } },
        def,
      );
    };
    at('diamond', 7);
    at('emerald', 7);
    at('worthless_piece_of_violet_glass', 7);
    mimic('luckstone', 7);
    at('worthless_piece_of_white_glass', 1);
    at('emerald', 1);
    at('amethyst', 1);
    mimic('loadstone', 1);
    at('diamond', 2);
    at('worthless_piece_of_green_glass', 2);
    at('amethyst', 2);
    mimic('flint_stone', 2);
    at('worthless_piece_of_white_glass', 3);
    at('emerald', 3);
    at('worthless_piece_of_violet_glass', 3);
    mimic('touchstone', 3);
    at('worthless_piece_of_red_glass', 4);
    at('ruby', 4);
    at('loadstone', 4);
    at('ruby', 5);
    at('worthless_piece_of_red_glass', 5);
    at('luckstone', 5, true);
  },
};

/** The treasure chamber's luckstone (minend-2). */
const MINEND_2_LUCKSTONE: Spot = [70, 5];

/** "Gnome King's Wine Cellar". ref: dat/minend-2.lua */
export const MINEND_2: LevelDef = {
  id: 'nh:minend-2',
  init: SOLID_STONE,
  map: {
    rows: [
      '---------------------------------------------------------------------------',
      '|...................................................|                     |',
      '|.|---------S--.--|...|--------------------------|..|                     |',
      '|.||---|   |.||-| |...|..........................|..|                     |',
      '|.||...| |-|.|.|---...|.............................|                ..   |',
      '|.||...|-|.....|....|-|..........................|..|.               ..   |',
      '|.||.....|-S|..|....|............................|..|..                   |',
      '|.||--|..|..|..|-|..|----------------------------|..|-.                   |',
      '|.|   |..|..|....|..................................|...                  |',
      '|.|   |..|..|----|..-----------------------------|..|....                 |',
      '|.|---|..|--|.......|----------------------------|..|.....                |',
      '|...........|----.--|......................|     |..|.......              |',
      '|-----------|...|.| |------------------|.|.|-----|..|.....|..             |',
      '|-----------|.{.|.|--------------------|.|..........|.....|....           |',
      '|...............|.S......................|-------------..-----...         |',
      '|.--------------|.|--------------------|.|.........................       |',
      '|.................|                    |.....................|........    |',
      '---------------------------------------------------------------------------',
    ],
  },
  // the first percent(50) also locks its secret door at 52,5 (MINEND_2_FIXUP)
  edits: [
    {
      percent: 50,
      set: [
        { char: '-', at: [55, 14] },
        { char: '-', at: [56, 14] },
        { char: '|', at: [61, 15] },
        { char: 'S', at: [52, 5] },
      ],
    },
    {
      percent: 50,
      set: [
        { char: '|', at: [18, 1] },
        { char: '.', area: [7, 12, 8, 13] },
      ],
    },
    {
      percent: 50,
      set: [
        { char: '|', at: [49, 4] },
        { char: '.', at: [21, 5] },
      ],
    },
    {
      percent: 50,
      then: {
        percent: 50,
        set: [{ char: '|', at: [22, 1] }],
        else: {
          set: [
            { char: '-', at: [50, 7] },
            { char: '-', at: [51, 7] },
          ],
        },
      },
    },
  ],
  // the teleport region {23,03,48,16} is left out (no teleport regions)
  regions: [
    { area: [23, 3, 48, 6], lit: true },
    { area: [21, 6, 22, 6], lit: true },
    { area: [14, 4, 14, 4], lit: false },
    { area: [10, 5, 14, 8], lit: false },
    { area: [10, 9, 11, 9], lit: false },
    { area: [15, 8, 16, 8], lit: false },
  ],
  doors: [
    { x: 12, y: 2, state: 'locked' },
    { x: 11, y: 6, state: 'locked' },
  ],
  stairs: { up: { x: 36, y: 4 } },
  contents: [
    // the wine cellar (no engravings; object detection is a random potion)
    objId('potion_of_booze', [10, 7]),
    objId('potion_of_booze', [10, 7]),
    obj('potion', undefined, [10, 7]),
    objId('potion_of_booze', [10, 8]),
    objId('potion_of_booze', [10, 8]),
    obj('potion', undefined, [10, 8]),
    objId('potion_of_booze', [10, 9]),
    objId('potion_of_booze', [10, 9]),
    obj('potion', undefined, [10, 9]),
    // the treasure chamber (its luckstone: MINEND_2_FIXUP)
    objId('diamond', [69, 4]),
    obj('gem', undefined, [69, 4]),
    objId('diamond', [69, 4]),
    obj('gem', undefined, [69, 4]),
    objId('emerald', [70, 4]),
    obj('gem', undefined, [70, 4]),
    objId('emerald', [70, 4]),
    obj('gem', undefined, [70, 4]),
    objId('emerald', [69, 5]),
    obj('gem', undefined, [69, 5]),
    objId('ruby', [69, 5]),
    obj('gem', undefined, [69, 5]),
    objId('ruby', [70, 5]),
    objId('amethyst', [70, 5]),
    obj('gem', undefined, [70, 5]),
    objId('amethyst', [70, 5]),
    ...GNOME_END,
  ],
};

/** Terrain ids of the secret doors and their locked forms. */
const LOCKED_SDOOR: Readonly<Record<DefId, DefId>> = {
  [VANILLA_TERRAIN.sdoor_v]: VANILLA_TERRAIN.sdoor_locked_v,
  [VANILLA_TERRAIN.sdoor_h]: VANILLA_TERRAIN.sdoor_locked_h,
};

const MINEND_2_FIXUP: SpLevFixup = {
  /** `des.door("locked", 52, 5)` inside the first percent(50): only when its 'S' was set */
  before(_ctx, level, def) {
    const p = mapToLevel(def, level, 52, 5);
    const i = cellIndex(level, p.x, p.y);
    const id = level.palette[level.cells[i] ?? -1];
    const locked = id !== undefined && Object.hasOwn(LOCKED_SDOOR, id) ? LOCKED_SDOOR[id] : null;
    if (!locked) return;
    let k = level.palette.indexOf(locked);
    if (k === -1) k = level.palette.push(locked) - 1;
    level.cells[i] = k;
  },
  /** des.object({ id = "luckstone", x = 70, y = 05, buc = "not-cursed" }) */
  after(ctx, level, def) {
    objectAt(ctx, level, def, 'luckstone', MINEND_2_LUCKSTONE, true);
  },
};

/** "Catacombs" by Kelly Bailey. ref: dat/minend-3.lua */
export const MINEND_3: LevelDef = {
  id: 'nh:minend-3',
  init: { style: 'solidfill', fg: 'nh:hwall' },
  map: {
    halign: 'center',
    valign: 'bottom',
    rows: [
      ' - - - - - - - - - - -- -- - - . - - - - - - - - - -- - - -- - - - - . - - |',
      '------...---------.-----------...-----.-------.-------     ----------------|',
      ' - - - - - - - - - - - . - - - . - - - - - - - - - - -- - -- - . - - - - - |',
      '------------.---------...-------------------------.---   ------------------|',
      ' - - - - - - - - - - . . - - --- - . - - - - - - - - -- -- - - - - |.....| |',
      '--.---------------.......------------------------------- ----------|.....S-|',
      ' - - - - |.. ..| - ....... . - - - - |.........| - - - --- - - - - |.....| |',
      '----.----|.....|------.......--------|.........|--------------.------------|',
      ' - - - - |..{..| - - -.... . --- - -.S.........S - - - - - - - - - - - - - |',
      '---------|.....|--.---...------------|.........|---------------------------|',
      ' - - - - |.. ..| - - - . - - - - - - |.........| - --- . - - - - - - - - - |',
      '----------------------...-------.---------------------...------------------|',
      '---..| - - - - - - - - . --- - - - - - - - - - - - - - . - - --- - - --- - |',
      '-.S..|----.-------.------- ---------.-----------------...----- -----.-------',
      '---..| - - - - - - - -- - - -- . - - - - - . - - - . - . - - -- -- - - - -- ',
      '-.S..|--------.---.---       -...---------------...{.---------   ---------  ',
      '--|. - - - - - - - -- - - - -- . - - - --- - - - . . - - - - -- - - - - - - ',
    ],
  },
  regions: [
    { area: [0, 0, 75, 16], lit: false },
    { area: [38, 6, 46, 10], lit: true },
  ],
  doors: [
    { x: 37, y: 8, state: 'closed' },
    { x: 47, y: 8, state: 'closed' },
    { x: 73, y: 5, state: 'closed' },
    { x: 2, y: 15, state: 'closed' },
  ],
  stairs: { up: { x: 42, y: 8 } },
  contents: [
    objId('diamond'),
    obj('gem'),
    objId('diamond'),
    obj('gem'),
    objId('emerald'),
    obj('gem'),
    objId('emerald'),
    obj('gem'),
    objId('emerald'),
    obj('gem'),
    objId('ruby'),
    obj('gem'),
    objId('ruby'),
    objId('amethyst'),
    obj('gem'),
    objId('amethyst'),
    // the luckstone and the flint: MINEND_3_FIXUP
    obj('scroll', 5),
    obj('spellbook', 4),
    { ...ANY_OBJECT, count: 3 },
    { kind: 'trap', count: 7 },
    // the two level teleporters at place[2] and place[1]: MINEND_3_FIXUP
    cls('M', 5),
    mon('ettin_mummy'),
    cls('Z', 5), // the two "V" (vampires) are left out
    cls('e', 4),
  ],
};

/** minend-3's `place`: the luckstone goes on place[2], the flint on place[1]. */
export const MINEND_3_PLACES: readonly Spot[] = [
  [1, 15],
  [68, 6],
  [1, 13],
];

const MINEND_3_FIXUP: SpLevFixup = {
  /** des.mazewalk({ x = 36, y = 8, dir = "west", stocked = false }), then des.wallify() */
  before(ctx, level, def) {
    mazewalk(ctx, level, def, 36, 8, 'west');
    wallifyLevel(level, VANILLA_TERRAIN);
  },
  after(ctx, level, def) {
    const place = [...MINEND_3_PLACES];
    shuffle(ctx, place);
    objectAt(ctx, level, def, 'luckstone', place[1] as Spot, true);
    objectAt(ctx, level, def, 'flint_stone', place[0] as Spot);
    // -- One-time annoyance factor
    // des.trap("level teleport", place[2]); des.trap("level teleport", place[1])
    for (const at of [place[1], place[0]] as Spot[]) {
      const p = mapToLevel(def, level, at[0], at[1]);
      if (isPlainFloor(ctx.defs, level, p.x, p.y)) mktrap(ctx, level, p, TRAP.levelTele);
    }
  },
};

export const MINEND_VARIANTS: readonly LevelDef[] = [MINEND_1, MINEND_2, MINEND_3];

export const MINEND_FIXUPS: Readonly<Record<DefId, SpLevFixup>> = {
  [MINEND_1.id]: MINEND_1_FIXUP,
  [MINEND_2.id]: MINEND_2_FIXUP,
  [MINEND_3.id]: MINEND_3_FIXUP,
};

/** Spots (map-relative) where each variant's achievement luckstone may lie. */
export const MINEND_LUCKSTONE_SPOTS: Readonly<Record<DefId, readonly Spot[]>> = {
  [MINEND_1.id]: MINEND_1_PLACES,
  [MINEND_2.id]: [MINEND_2_LUCKSTONE],
  [MINEND_3.id]: MINEND_3_PLACES,
};

/**
 * Levels that magic mapping cannot map (lua level_flags "nommap"). Nothing reads it yet: the
 * scroll and spell of magic mapping are not ported, and C's #wizmap ignores the flag.
 * ref: src/sp_lev.c lspo_level_flags(); src/read.c do_mapping callers
 */
export const NOMMAP_LEVELS: ReadonlySet<DefId> = new Set([MINEND_3.id]);
