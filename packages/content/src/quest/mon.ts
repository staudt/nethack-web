// The Monk's quest: the Monastery of the Earth-Lord on a wooded field, besieged by earth
// elementals and xorns (home), the "wu wei" formation of lava in the caves (locate), Master
// Kaen's lava field with the Eyes of the Overworld on an unaligned altar (goal), and the
// room-and-corridor fillers above and below the locate level.
// ref: dat/Mon-strt.lua, Mon-loca.lua, Mon-goal.lua, Mon-fila.lua, Mon-filb.lua
//
// Translation notes (DEVIATIONS.md "Quest levels (m24b)"): maps, lit regions, the unattended
// temple, des.replace_terrain() (the woods), fixed stairs, doors, the home level's unaligned altar
// and contents are LevelDef data; "mazelevel", "noteleport", "hardfloor" and the non-diggable
// areas are levelflags.ts entries ("noflip" needs nothing). Fixups, in the script's order:
// Mon-strt's open field (selection.floodfill(05,04) after the woods) with the portal's spot
// cleared, the Grand Master's custom inventory, the dart traps and the besiegers on its spots
// (rndcoord(1) each), the tins of spinach and the food rations; Mon-loca whole: its caves'
// floor grown over their walls (selection.match(".") grown), the level's edge made stone
// (selection.rect()), the formation laid in the middle (des.map() with an empty contents
// function), des.wallify() round it, then the stairs and every random thing inside the
// formation's block (get_location() uses the last map's block), and the blessed tins of spinach
// under a burnt Elbereth on a random floor spot of the level (selection.negate():
// filter_mapchar(".")); Mon-goal's spot (`math.random(1, #place)`) for the Eyes of the Overworld
// (blessed, named through onameItem()), Master Kaen and the unaligned altar made after him; and
// the home level's branch levregion (the portal), placed last as fixup_special() does. The
// fillers are the Oracle's kind of des.room level: six random rooms with their contents and
// random corridors.
import type { DefId, LevelContent, LevelDef, Pos, RegionDef } from '@nh/core';
import { A_NONE } from '../aligntyp';
import { TEMPLE } from '../epri';
import {
  selFilterMapchar,
  selFloodfill,
  selGrow,
  selMatch,
  selNegate,
  selNew,
  selRect,
  selRndcoord,
  setSel,
  setTer,
} from '../selection';
import { desEngraving, desMap, makeContents, mapToLevel, type SpLevFixup } from '../sp_lev';
import { T, setTerrain } from '../terrain';
import { TRAP } from '../trap';
import {
  altarAt,
  branchAt,
  cls,
  mon,
  monWithInventory,
  obj,
  objectAt,
  questArtifact,
  stairAtRandom,
  times,
  trap,
  wallifyMap,
} from './common';

const EARTH_ELEMENTAL = 'nh:earth_elemental';
const XORN = 'nh:xorn';
const lit = (x1: number, y1: number, x2: number, y2: number): RegionDef => ({
  area: [x1, y1, x2, y2],
  lit: true,
});
/** A content entry at a Level spot. */
const atLevel = (c: LevelContent, p: Pos | null): LevelContent =>
  p === null ? c : { ...c, x: p.x, y: p.y, coords: 'level' };

// ---------------------------------------------------------------------------------------------
// Mon-strt: the home level

const STRT_MAP: readonly string[] = [
  '............................................................................',
  '............................................................................',
  '............................................................................',
  '....................------------------------------------....................',
  '....................|................|.....|.....|.....|....................',
  '....................|..------------..|--+-----+-----+--|....................',
  '....................|..|..........|..|.................|....................',
  '....................|..|..........|..|+---+---+-----+--|....................',
  '..................---..|..........|......|...|...|.....|....................',
  '..................+....|..........+......|...|...|.....|....................',
  '..................+....|..........+......|...|...|.....|....................',
  '..................---..|..........|......|...|...|.....|....................',
  '....................|..|..........|..|+-----+---+---+--|....................',
  '....................|..|..........|..|.................|....................',
  '....................|..------------..|--+-----+-----+--|....................',
  '....................|................|.....|.....|.....|....................',
  '....................------------------------------------....................',
  '............................................................................',
  '............................................................................',
  '............................................................................',
];

/** The portal's spot, cleared and kept as the branch levregion. */
const STRT_BRANCH = [5, 4] as const;

/** ref: dat/Mon-strt.lua */
export const MON_STRT: LevelDef = {
  id: 'nh:mon-strt',
  // des.level_init({ style = "solidfill", fg = " " }) (lit omitted: the coin flip is drawn)
  init: { style: 'solidfill', fg: 'nh:stone' },
  map: { rows: [...STRT_MAP] },
  // Dungeon Description
  regions: [lit(0, 0, 75, 19), { area: [24, 6, 33, 13], lit: true, type: TEMPLE, filled: false }],
  // the woods on either side
  edits: [
    { replace: { from: '.', to: 'T', area: [0, 0, 10, 19], chance: 10 } },
    { replace: { from: '.', to: 'T', area: [65, 0, 75, 19], chance: 10 } },
  ],
  stairs: { down: { x: 52, y: 9 } },
  doors: [
    { x: 18, y: 9, state: 'locked' },
    { x: 18, y: 10, state: 'locked' },
    { x: 34, y: 9, state: 'closed' },
    { x: 34, y: 10, state: 'closed' },
    { x: 40, y: 5, state: 'closed' },
    { x: 46, y: 5, state: 'closed' },
    { x: 52, y: 5, state: 'closed' },
    { x: 38, y: 7, state: 'locked' },
    { x: 42, y: 7, state: 'closed' },
    { x: 46, y: 7, state: 'closed' },
    { x: 52, y: 7, state: 'closed' },
    { x: 38, y: 12, state: 'locked' },
    { x: 44, y: 12, state: 'closed' },
    { x: 48, y: 12, state: 'closed' },
    { x: 52, y: 12, state: 'closed' },
    { x: 40, y: 14, state: 'closed' },
    { x: 46, y: 14, state: 'closed' },
    { x: 52, y: 14, state: 'closed' },
  ],
  // Unattended Altar - unaligned due to conflict - player must align it.
  features: [{ kind: 'altar', x: 28, y: 9, align: 'noalign' }],
  // after the Grand Master (the fixup makes him with his inventory first); no treasure chest!
  contents: [
    // guards for the audience chamber
    ...(
      [
        [32, 7],
        [32, 8],
        [32, 11],
        [32, 12],
        [33, 7],
        [33, 8],
        [33, 11],
        [33, 12],
      ] as const
    ).map(([x, y]) => mon('nh:abbot', x, y)),
  ],
};

const STRT_FIXUP: SpLevFixup = {
  contents(ctx, level, def) {
    // local spacelocs = selection.floodfill(05,04) (after the woods: when 05,04 became a tree,
    // these are the trees joined to it, as in C, and the rest go at random)
    const b = mapToLevel(def, level, ...STRT_BRANCH);
    const spacelocs = selFloodfill(level, b.x, b.y);
    // Portal arrival point: des.terrain({05,04}, ".") (the levregion is placed last)
    setTer(level, b.x, b.y, T.floor);
    // The Grand Master
    monWithInventory(ctx, level, def, 'nh:grand_master', 28, 10, [['nh:robe', 6]]);
    makeContents(ctx, level, def, def.contents ?? []);
    // spacelocs:rndcoord(1): a spot, taken out of the selection (none left: a random spot)
    const space = (): Pos | null => {
      const p = selRndcoord(ctx.rng, level, spacelocs);
      if (p !== null) spacelocs[p.y * level.width + p.x] = false;
      return p;
    };
    // Random traps
    for (let i = 1; i <= 2; i++) makeContents(ctx, level, def, [atLevel(trap(TRAP.dart), space())]);
    makeContents(ctx, level, def, times(4, trap()));
    // Monsters on siege duty.
    for (let i = 1; i <= 8; i++)
      makeContents(ctx, level, def, [atLevel(mon(EARTH_ELEMENTAL), space())]);
    for (let i = 1; i <= 4; i++) makeContents(ctx, level, def, [atLevel(mon(XORN), space())]);
    // next to leader, so possibly tricky to pick up if not ready for quest yet; there's no
    // protection against a xorn eating these tins; BUC state is random
    objectAt(ctx, level, def, 'nh:tin', mapToLevel(def, level, 29, 9), {
      quantity: 2,
      spinach: true,
    });
    // ensure enough vegetarian food generates for vegetarian games
    objectAt(ctx, level, def, 'nh:food_ration', mapToLevel(def, level, 46, 4), { quantity: 4 });
  },
  after(ctx, level, def) {
    // des.levregion({ region = {05,04,05,04}, type="branch" })
    branchAt(ctx, level, def, ...STRT_BRANCH);
  },
};

// ---------------------------------------------------------------------------------------------
// Mon-loca: wu wei

/** The formation, laid in the middle of the caves (des.map halign, valign "center"). */
const FORMATION: readonly string[] = [
  '......................xxxx',
  '..L............L...L....xx',
  '..LLLLLLLLL.....L..L.....x',
  '.L.L.L.L.L....LLLLLLLLL..x',
  '...L.L.L.L........L...L...',
  '.LLLLLLLLLLL.....LLLLLLL..',
  '...L.L.L.L.......L.....L..',
  '...L.L.L.L......LLLLLLLLL.',
  '..LLLLLLLLL....L........L.',
  '..............L.L.L.L.L.L.',
  '..L.L..L..L.....L.L.L...L.',
  '.L...L..L..L...L..L....LL.',
  '..........................',
];

/** Placeholder stairs for core (the level's top edge, made stone by the script). */
const LOCA_PLACEHOLDERS = { up: { x: 0, y: 0 }, down: { x: 1, y: 0 } } as const;

/** ref: dat/Mon-loca.lua */
export const MON_LOCA: LevelDef = {
  id: 'nh:mon-loca',
  init: { style: 'mines', fg: 'nh:floor', smoothed: true, joined: true, lit: true, walled: true },
  // Dungeon Description (selection.area(00,00,78,20): the whole level)
  regions: [lit(0, 0, 78, 20)],
  // the fixup lays out the level and makes the stairs inside the formation
  stairs: { up: { ...LOCA_PLACEHOLDERS.up }, down: { ...LOCA_PLACEHOLDERS.down } },
  contents: [
    // Objects
    ...times(15, obj()),
  ],
};

/** Mon-loca as its random spots see it once the formation is laid: inside the formation. */
const LOCA_PLACED: LevelDef = { ...MON_LOCA, map: { rows: [...FORMATION], lit: true } };

/** After the tins: the traps and the monsters. */
const LOCA_LATER: readonly LevelContent[] = [
  // Random traps
  ...times(6, trap()),
  // Random monsters.
  ...times(14, mon(EARTH_ELEMENTAL)),
  ...times(9, mon(XORN)),
];

const LOCA_FIXUP: SpLevFixup = {
  before(ctx, level) {
    // core's placeholder stairs go (the edge becomes stone below)
    for (const p of [level.up, level.down]) if (p) setTerrain(level, p.x, p.y, T.stone);
    level.up = null;
    level.down = null;
    // local floor = selection.match("."):grow(); des.terrain({ selection = floor, typ = ".",
    // lit = 1 })
    setSel(level, selGrow(level, selMatch(level, '.')), '.', { lit: 1 });
    // des.terrain({ selection = selection.rect(00,00,78,20), typ = " " })
    setSel(level, selRect(level, 0, 0, 78, 20), ' ');
    // wu wei: des.map({ halign = "center", valign = "center", map = formation, lit = 1 })
    desMap(level, FORMATION, { halign: 'center', valign: 'center', lit: true });
    wallifyMap(level, LOCA_PLACED);
    // Stairs
    stairAtRandom(ctx, level, LOCA_PLACED, 'up');
    stairAtRandom(ctx, level, LOCA_PLACED, 'down');
  },
  contents(ctx, level, def) {
    makeContents(ctx, level, LOCA_PLACED, def.contents ?? []);
    // since vegetarian monks shouldn't eat giant corpses, give a chance for Str boost that
    // isn't throttled by exercise restrictions; make a modest effort (Elbereth only) to prevent
    // xorns from eating the tins
    const tinplace = selFilterMapchar(level, selNegate(selNew(level)), '.');
    const tinloc = selRndcoord(ctx.rng, level, tinplace);
    if (tinloc !== null) {
      objectAt(ctx, level, def, 'nh:tin', tinloc, { quantity: 2, buc: 'blessed', spinach: true });
      desEngraving(ctx, level, def, tinloc, 'burn', 'Elbereth');
    }
    makeContents(ctx, level, LOCA_PLACED, LOCA_LATER);
  },
};

// ---------------------------------------------------------------------------------------------
// Mon-goal: Master Kaen's lava field

const GOAL_MAP: readonly string[] = [
  'xxxxxx..xxxxxx...xxxxxxxxx',
  'xxxx......xx......xxxxxxxx',
  'xx.xx.............xxxxxxxx',
  'x....................xxxxx',
  '......................xxxx',
  '......................xxxx',
  'xx........................',
  'xxx......................x',
  'xxx................xxxxxxx',
  'xxxx.....x.xx.......xxxxxx',
  'xxxxx...xxxxxx....xxxxxxxx',
];

/** local place = { {14,04},{13,07} } */
const GOAL_PLACES: readonly (readonly [number, number])[] = [
  [14, 4],
  [13, 7],
];

/** ref: dat/Mon-goal.lua */
export const MON_GOAL: LevelDef = {
  id: 'nh:mon-goal',
  init: {
    style: 'mines',
    fg: 'nh:lava',
    bg: 'nh:floor',
    smoothed: false,
    joined: false,
    lit: false,
    walled: false,
  },
  map: { rows: [...GOAL_MAP] },
  // Dungeon Description
  regions: [{ area: [0, 0, 25, 10], lit: false }],
  stairs: { up: { x: 20, y: 5 } },
  // after the Eyes of the Overworld (the fixup makes them first), before Master Kaen
  contents: [
    ...times(14, obj()),
    // Random traps
    ...times(4, trap(TRAP.fire)),
    ...times(2, trap()),
  ],
};

/** After Master Kaen and his altar. */
const GOAL_LATER: readonly LevelContent[] = [
  ...times(9, mon(EARTH_ELEMENTAL)),
  ...times(9, mon(XORN)),
];

const GOAL_FIXUP: SpLevFixup = {
  contents(ctx, level, def) {
    // local placeidx = math.random(1, #place)
    const [x, y] = GOAL_PLACES[ctx.rng.rn2(GOAL_PLACES.length)] ?? [14, 4];
    questArtifact(ctx, level, def, 'nh:lenses', x, y, 0, 'The Eyes of the Overworld');
    makeContents(ctx, level, def, def.contents ?? []);
    // Random monsters.
    makeContents(ctx, level, def, [mon('nh:master_kaen', x, y)]);
    altarAt(ctx, level, def, x, y, A_NONE);
    makeContents(ctx, level, def, GOAL_LATER);
  },
};

// ---------------------------------------------------------------------------------------------
// the fillers

/**
 * The fillers' six des.room({ type = "ordinary", contents }) rooms, placed as random rooms, with
 * random corridors; the first two rooms' monster class and the third room's monsters differ. As
 * the Oracle's level, the level starts as dark stone. ref: dat/Mon-fila.lua, Mon-filb.lua
 */
function filler(id: DefId, first: string, third: readonly LevelContent[]): LevelDef {
  return {
    id,
    init: { style: 'solidfill', fg: 'nh:stone', lit: false },
    rooms: [
      { stairs: ['up'], contents: [obj(), cls(first, false)] },
      { contents: [obj(), obj(), cls(first, false)] },
      { contents: [obj(), trap(), obj(), ...third] },
      { stairs: ['down'], contents: [obj(), trap(), cls('E', false), mon(EARTH_ELEMENTAL)] },
      { contents: [obj(), obj(), trap(), cls('X', false)] },
      { contents: [obj(), trap(), mon(EARTH_ELEMENTAL)] },
    ],
    corridors: 'random',
  };
}

/** ref: dat/Mon-fila.lua: between the home and the locate level */
export const MON_FILA: LevelDef = filler('nh:mon-fila', 'E', [mon(XORN), mon(EARTH_ELEMENTAL)]);

/** ref: dat/Mon-filb.lua: between the locate and the goal level */
export const MON_FILB: LevelDef = filler('nh:mon-filb', 'X', [cls('E', false)]);

/** The Monk's five levels. */
export const MON_LEVELS: readonly LevelDef[] = [MON_STRT, MON_LOCA, MON_GOAL, MON_FILA, MON_FILB];

/** Their fixups, by LevelDef id. */
export const MON_FIXUPS: Readonly<Record<DefId, SpLevFixup>> = {
  [MON_STRT.id]: STRT_FIXUP,
  [MON_LOCA.id]: LOCA_FIXUP,
  [MON_GOAL.id]: GOAL_FIXUP,
};
