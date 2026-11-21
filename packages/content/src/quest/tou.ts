// The Tourist's quest: Ankh-Morpork by the river Ankh with the Thieves' Guild besieging it (home),
// the city's streets with their shops, barracks, temple and zoo (locate), the Thieves' Guild Hall
// with the Master of Thieves and the Platinum Yendorian Express Card (goal), and the cavernous
// mines-style fillers above and below the locate level. ref: dat/Tou-strt.lua, Tou-loca.lua,
// Tou-goal.lua, Tou-fila.lua, Tou-filb.lua
//
// Translation notes (DEVIATIONS.md "Quest levels (m24b)"): maps, lit regions, the morgues,
// barracks, shops, the temple and the zoo (zoo.ts and shknam.ts fill them), the regions of random
// lighting, fixed stairs, doors and contents are LevelDef data; "mazelevel", "noteleport",
// "hardfloor" and the non-diggable areas are levelflags.ts entries ("noflip" needs nothing; the
// fillers' walled, joined mines-style map clears "mazelevel"). Monsters keep no names (Sergeant
// Colon, Corporal Nobbs, Bravd, the Weasel, Angua, Detritus, Rincewind, ..., Vimes): the port has
// none, nor their genders. Fixups, in the script's order: Twoflower's custom inventory amid the
// home level's contents, the Discworld peacefuls made without their inventory
// (keep_default_invent = false), the four historic wumpus statues emptied (`contents = 0`; the
// script's missing comma after `montype="wumpus"` read as meant), and the branch levregion (the
// portal), placed last as fixup_special() does; the locate and goal levels' traps on spots of
// their maps' floor outside the shops (selection rndcoord(1) each), the locate level's 10%
// visitors, the goal's Platinum Yendorian Express Card (blessed, named through onameItem()), its
// succubi and incubi made with the gender of their names, and des.wallify() at the end.
import type { Ctx, DefId, Level, LevelContent, LevelDef, Pos, RegionDef } from '@nh/core';
import { TEMPLE } from '../epri';
import { percent, selArea, selFilterMapchar, selRndcoord, type Sel } from '../selection';
import {
  createMonster,
  createObject,
  deleteContents,
  makeContents,
  mapToLevel,
  type SpLevFixup,
} from '../sp_lev';
import { BARRACKS, MORGUE, ZOO } from '../zoo';
import {
  branchAt,
  cls,
  hostile,
  mon,
  monNoInventory,
  monWithInventory,
  obj,
  questArtifact,
  times,
  trap,
  wallifyMap,
} from './common';

const SPIDER = 'nh:giant_spider';
const SHOP: DefId = 'nh:shop';
const lit = (x1: number, y1: number, x2: number, y2: number): RegionDef => ({
  area: [x1, y1, x2, y2],
  lit: true,
});
const unlit = (x1: number, y1: number, x2: number, y2: number): RegionDef => ({
  area: [x1, y1, x2, y2],
  lit: false,
});
/** des.region({ region, type = "ordinary" }) of a plain room: lit at random (litstate_rnd()). */
const ordinary = (x1: number, y1: number, x2: number, y2: number): RegionDef => ({
  area: [x1, y1, x2, y2],
});
/** A filled special room. */
const room = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  isLit: boolean,
  type: DefId,
): RegionDef => ({ area: [x1, y1, x2, y2], lit: isLit, type, filled: true });
/** des.monster({ id, peaceful = 1 }) */
const peaceful = (id: string): LevelContent => ({ ...mon(id), peaceful: true });
/** A content entry at a Level spot. */
const atLevel = (c: LevelContent, p: Pos | null): LevelContent =>
  p === null ? c : { ...c, x: p.x, y: p.y, coords: 'level' };

/**
 * `selection.area(00,00,75,19):filter_mapchar('.')` less the map rectangles `out`, then
 * `des.trap(validtraps:rndcoord(1))` `n` times (each spot taken out of the selection; none left:
 * a random spot). ref: src/nhlsel.c l_selection_filter_mapchar(), l_selection_rndcoord()
 */
function trapsOnFloor(
  ctx: Ctx,
  level: Level,
  def: LevelDef,
  n: number,
  out: readonly (readonly [number, number, number, number])[],
): void {
  const area = (x1: number, y1: number, x2: number, y2: number): Sel => {
    const a = mapToLevel(def, level, x1, y1);
    const b = mapToLevel(def, level, x2, y2);
    return selArea(level, a.x, a.y, b.x, b.y);
  };
  const valid = selFilterMapchar(level, area(0, 0, 75, 19), '.');
  for (const r of out) area(...r).forEach((v, i) => v && (valid[i] = false));
  for (let i = 1; i <= n; i++) {
    const p = selRndcoord(ctx.rng, level, valid);
    if (p !== null) valid[p.y * level.width + p.x] = false;
    makeContents(ctx, level, def, [atLevel(trap(), p)]);
  }
}

// ---------------------------------------------------------------------------------------------
// Tou-strt: the home level

const STRT_MAP: readonly string[] = [
  '.......}}....---------..-------------------------------------------------...',
  '........}}...|.......|..|.-------------------------------------------...|...',
  '.........}}..|.......|..|.|......|......|.............|......|......|...|...',
  '..........}}.|.......|..|.|......+......+.............+......+..\\...|...|...',
  '...........}}}..........|.|......|......|.............|......|......|...|...',
  '.............}}.........|.|----S-|--S---|S----------S-|---S--|------|...|...',
  '..............}}}.......|...............................................|...',
  '................}}}.....----S------++--S----------S----------S-----------...',
  '..................}}...........   ....   ...................................',
  '......-------......}}}}........}}}}..}}}}..}}}}..}}}}.......................',
  '......|.....|.......}}}}}}..}}}}  ....  }}}}..}}}}..}}}.....................',
  '......|.....+...........}}}}}}........................}}}..}}}}..}}}..}}}...',
  '......|.....|...........................................}}}}..}}}..}}}}.}}}}',
  '......-------...............................................................',
  '............................................................................',
  '...-------......-------.....................................................',
  '...|.....|......|.....|.....................................................',
  '...|.....+......+.....|.....................................................',
  '...|.....|......|.....|.....................................................',
  '...-------......-------.....................................................',
];

/** des.object({ id = "statue", montype = "wumpus", x, y, historic = 1, contents = 0 }) */
const STRT_STATUES: readonly (readonly [number, number])[] = [
  [34, 8],
  [37, 8],
  [34, 10],
  [37, 10],
];

/** Monsters on siege duty, before Twoflower. */
const STRT_SIEGE: readonly LevelContent[] = [
  ...times(12, mon(SPIDER)),
  ...times(2, cls('s')),
  ...times(8, mon('nh:forest_centaur')),
  cls('C'),
];

/** After Twoflower: his treasure, the guides, the path guards and the river's monsters. */
const STRT_GUARDS: readonly LevelContent[] = [
  // The treasure of Twoflower
  { kind: 'object', id: 'nh:chest', x: 64, y: 3 },
  // guides for the audience chamber
  ...(
    [
      [29, 3],
      [32, 4],
      [35, 2],
      [38, 3],
      [45, 3],
      [48, 2],
      [49, 4],
      [51, 3],
      [57, 3],
      [62, 4],
      [66, 4],
    ] as const
  ).map(([x, y]) => mon('nh:guide', x, y)),
  // path guards (Sergeant Colon and Corporal Nobbs: no names)
  mon('nh:watchman', 35, 8),
  mon('nh:watchman', 36, 8),
  // river monsters
  mon('nh:giant_eel', 62, 12),
  mon('nh:piranha', 47, 10),
  mon('nh:piranha', 29, 11),
  mon('nh:kraken', 34, 9),
  mon('nh:kraken', 37, 9),
];

/** ref: dat/Tou-strt.lua */
export const TOU_STRT: LevelDef = {
  id: 'nh:tou-strt',
  // (lit omitted: the coin flip is drawn)
  init: { style: 'solidfill', fg: 'nh:stone' },
  map: { rows: [...STRT_MAP] },
  // Dungeon Description
  regions: [
    lit(0, 0, 75, 19),
    room(14, 1, 20, 3, false, MORGUE),
    unlit(7, 10, 11, 12),
    unlit(4, 16, 8, 18),
    unlit(17, 16, 21, 18),
    unlit(27, 2, 32, 4),
    unlit(34, 2, 39, 4),
    unlit(41, 2, 53, 4),
    unlit(55, 2, 60, 4),
    lit(62, 2, 67, 4),
  ],
  stairs: { down: { x: 66, y: 3 } },
  doors: [
    ...(
      [
        [31, 5],
        [36, 5],
        [41, 5],
        [52, 5],
        [58, 5],
        [28, 7],
        [39, 7],
        [50, 7],
        [61, 7],
      ] as const
    ).map(([x, y]) => ({ x, y, state: 'locked' as const })),
    { x: 33, y: 3, state: 'closed' },
    { x: 40, y: 3, state: 'closed' },
    { x: 54, y: 3, state: 'closed' },
    { x: 61, y: 3, state: 'closed' },
    { x: 12, y: 11, state: 'open' },
    { x: 9, y: 17, state: 'open' },
    { x: 16, y: 17, state: 'open' },
    { x: 35, y: 7, state: 'locked' },
    { x: 36, y: 7, state: 'locked' },
  ],
  // the fixup makes them in the script's order with Twoflower, the Discworld peacefuls and the
  // statues between
  contents: [...STRT_SIEGE, ...STRT_GUARDS, ...times(9, trap())],
};

const STRT_FIXUP: SpLevFixup = {
  contents(ctx, level, def) {
    makeContents(ctx, level, def, STRT_SIEGE);
    monWithInventory(ctx, level, def, 'nh:twoflower', 64, 3, [
      ['nh:low_boots', 3], // walking shoes
      ['nh:hawaiian_shirt', 3],
    ]);
    makeContents(ctx, level, def, STRT_GUARDS);
    // a few more Discworld NPCs for flavour (Bravd, the Weasel, Angua, Detritus: no names)
    monNoInventory(ctx, level, def, peaceful('nh:barbarian'));
    monNoInventory(ctx, level, def, peaceful('nh:rogue'));
    makeContents(ctx, level, def, [peaceful('nh:werewolf'), peaceful('nh:rock_troll')]);
    // the Brass Bridge is lined with statues of 'hippos'
    for (const [x, y] of STRT_STATUES) {
      const s = createObject(
        ctx,
        level,
        { kind: 'object', id: 'nh:statue', x, y, montype: 'nh:wumpus', historic: true },
        def,
      );
      if (s !== null) deleteContents(ctx, s);
    }
    // Random traps
    makeContents(ctx, level, def, times(9, trap()));
  },
  after(ctx, level, def) {
    // Portal arrival point: des.levregion({ region = {68,14,68,14}, type="branch" })
    branchAt(ctx, level, def, 68, 14);
  },
};

// ---------------------------------------------------------------------------------------------
// Tou-loca: the streets of Ankh-Morpork

const LOCA_MAP: readonly string[] = [
  '----------------------------------------------------------------------------',
  '|....|......|..........|......|......|...|....|.....|......|...............|',
  '|....|......|.|------|.|......|......|.|.|....|..}..|......|.|----------|..|',
  '|....|--+----.|......|.|-S---+|+-----|.|.S....|.....|---+--|.|..........+..|',
  '|....|........|......|.|...|.........|.|------|..............|..........|-+|',
  '|....+...}}...+......|.|...|.|-----|.|..............|--+----------------|..|',
  '|----|........|------|.|---|.|.....|......|-----+-|.|.......|...........|--|',
  '|............................|.....|.|--+-|.......|.|.......|...........|..|',
  '|----|.....|-------------|...|--+--|.|....|.......|.|-----------+-------|..|',
  '|....+.....+.........S...|...........|....|-------|........................|',
  '|....|.....|.........|...|.|---------|....|.........|-------|.|----------|.|',
  '|....|.....|---------|---|.|......|..+....|-------|.|.......|.+......S.\\.|.|',
  '|....|.....+.........S...|.|......|..|....|.......|.|.......|.|......|...|.|',
  '|-------|..|.........|---|.|+-------------------+-|.|.......+.|----------|.|',
  '|.......+..|---------|.........|.........|..........|.......|.|..........|.|',
  '|.......|..............|--+--|.|.........|.|----+-----------|.|..........|.|',
  '|---------+-|--+-----|-|.....|.|.........|.|........|.|.....+.|..........+.|',
  '|...........|........|.S.....|.|----+----|.|--------|.|.....|.|----------|.|',
  '|...........|........|.|.....|........................|.....|..............|',
  '----------------------------------------------------------------------------',
];

/** The locate level's shops (map rectangles), where no trap goes. */
const LOCA_SHOPS: readonly (readonly [number, number, number, number])[] = [
  [15, 3, 20, 5],
  [62, 3, 71, 4],
];

/**
 * The locate level's visitors, each there 1 time in 10, and whether it keeps its kit (Rincewind,
 * Cohen, Hrun, Ridcully, the Bursar, Mightily Oats, Vimes, Cheery, Dorfl, Gladys: no names).
 */
const LOCA_VISITORS: readonly (readonly [DefId, boolean])[] = [
  ['nh:wizard', false],
  ['nh:barbarian', false],
  ['nh:barbarian', false],
  ['nh:wizard', false],
  ['nh:wizard', false],
  ['nh:aligned_cleric', false],
  ['nh:watch_captain', true],
  ['nh:dwarf', false], // no pick-axe
  ['nh:clay_golem', false],
  ['nh:clay_golem', false],
];

/** ref: dat/Tou-loca.lua */
export const TOU_LOCA: LevelDef = {
  id: 'nh:tou-loca',
  // (lit omitted: the coin flip is drawn)
  init: { style: 'solidfill', fg: 'nh:stone' },
  map: { rows: [...LOCA_MAP] },
  regions: [
    lit(0, 0, 75, 19),
    room(1, 1, 4, 5, false, MORGUE),
    room(15, 3, 20, 5, true, SHOP),
    room(62, 3, 71, 4, true, SHOP),
    room(1, 17, 11, 18, true, BARRACKS),
    room(12, 9, 20, 10, true, BARRACKS),
    room(53, 11, 59, 14, true, ZOO),
    room(63, 14, 72, 16, true, BARRACKS),
    room(32, 14, 40, 16, true, TEMPLE),
    ordinary(6, 1, 11, 2),
    ordinary(24, 1, 29, 2),
    ordinary(31, 1, 36, 2),
    ordinary(42, 1, 45, 3),
    ordinary(53, 1, 58, 2),
    ordinary(24, 4, 26, 5),
    ordinary(30, 6, 34, 7),
    unlit(73, 5, 74, 5),
    ordinary(1, 9, 4, 12),
    ordinary(1, 14, 7, 15),
    ordinary(12, 12, 20, 13),
    ordinary(13, 17, 20, 18),
    ordinary(22, 9, 24, 10),
    ordinary(22, 12, 24, 12),
    ordinary(24, 16, 28, 18),
    ordinary(28, 11, 33, 12),
    lit(35, 11, 36, 12),
    ordinary(38, 8, 41, 12),
    ordinary(43, 7, 49, 8),
    ordinary(43, 12, 49, 12),
    ordinary(44, 16, 51, 16),
    ordinary(53, 6, 59, 7),
    ordinary(61, 6, 71, 7),
    ordinary(55, 16, 59, 18),
    ordinary(63, 11, 68, 12),
    ordinary(70, 11, 72, 12),
  ],
  stairs: { up: { x: 10, y: 4 }, down: { x: 73, y: 5 } },
  doors: [
    ...(
      [
        [5, 5],
        [5, 9],
        [8, 14],
        [8, 3],
        [11, 9],
        [11, 12],
        [10, 16],
        [14, 5],
        [15, 16],
      ] as const
    ).map(([x, y]) => ({ x, y, state: 'closed' as const })),
    { x: 21, y: 9, state: 'locked' },
    { x: 21, y: 12, state: 'locked' },
    ...(
      [
        [23, 17],
        [25, 3],
        [26, 15],
        [29, 3],
        [28, 13],
        [31, 3],
        [32, 8],
        [37, 11],
        [36, 17],
      ] as const
    ).map(([x, y]) => ({ x, y, state: 'closed' as const })),
    { x: 41, y: 3, state: 'locked' },
    ...(
      [
        [40, 7],
        [48, 6],
        [48, 13],
        [48, 15],
        [56, 3],
        [55, 5],
        [72, 3],
      ] as const
    ).map(([x, y]) => ({ x, y, state: 'closed' as const })),
    { x: 74, y: 4, state: 'locked' },
    ...(
      [
        [64, 8],
        [62, 11],
        [69, 11],
        [60, 13],
        [60, 16],
        [73, 16],
      ] as const
    ).map(([x, y]) => ({ x, y, state: 'closed' as const })),
  ],
  // the fixup makes them with the traps on the streets' floor between
  contents: [
    ...times(14, obj()),
    { kind: 'object', id: 'nh:scroll_of_blank_paper', x: 71, y: 12 },
    { kind: 'object', id: 'nh:scroll_of_blank_paper', x: 71, y: 12 },
    ...times(16, mon(SPIDER)),
    ...times(2, cls('s')),
  ],
};

const LOCA_FIXUP: SpLevFixup = {
  contents(ctx, level, def) {
    const list = def.contents ?? [];
    const objects = 16;
    makeContents(ctx, level, def, list.slice(0, objects));
    trapsOnFloor(ctx, level, def, 9, LOCA_SHOPS);
    makeContents(ctx, level, def, list.slice(objects));
    for (const [id, keep] of LOCA_VISITORS) {
      if (!percent(ctx, 10)) continue;
      if (keep) makeContents(ctx, level, def, [peaceful(id)]);
      else monNoInventory(ctx, level, def, peaceful(id));
    }
  },
};

// ---------------------------------------------------------------------------------------------
// Tou-goal: the Thieves' Guild Hall

const GOAL_MAP: readonly string[] = [
  '----------------------------------------------------------------------------',
  '|.........|.........|..........|..| |.................|........|........|..|',
  '|.........|.........|..........|..| |....--------.....|........|........|..|',
  '|------S--|--+-----------+------..| |....|......|.....|........|........|..|',
  '|.........|.......................| |....|......+.....--+-------------+--..|',
  '|.........|.......................| |....|......|..........................|',
  '|-S-----S-|......----------.......| |....|......|..........................|',
  '|..|..|...|......|........|.......| |....-----------.........----..........|',
  '|..+..+...|......|........|.......| |....|.........|.........|}}|..........|',
  '|..|..|...|......+........|.......| |....|.........+.........|}}|..........|',
  '|..|..|...|......|........|.......S.S....|.........|.........----..........|',
  '|---..----|......|........|.......| |....|.........|.......................|',
  '|.........+......|+F-+F-+F|.......| |....-----------.......................|',
  '|---..----|......|..|..|..|.......| |......................--------------..|',
  '|..|..|...|......--F-F--F--.......| |......................+............|..|',
  '|..+..+...|.......................| |--.---...-----+-----..|............|..|',
  '|--|..----|--+-----------+------..| |.....|...|.........|..|------------|..|',
  '|..+..+...|.........|..........|..| |.....|...|.........|..+............|..|',
  '|..|..|...|.........|..........|..| |.....|...|.........|..|............|..|',
  '----------------------------------------------------------------------------',
];

/** The goal level's shops (map rectangle), where no trap goes. */
const GOAL_SHOPS: readonly (readonly [number, number, number, number])[] = [[60, 14, 71, 18]];

/** After the traps: the Master of Thieves and his guild, before the amorous demons. */
const GOAL_GUILD: readonly LevelContent[] = [
  hostile('nh:master_of_thieves', 4, 1),
  ...times(16, mon(SPIDER)),
  ...times(2, cls('s')),
];

/** des.monster("succubus" | "incubus", x, y): female or male by its name. */
const GOAL_DEMONS: readonly (readonly [number, number, boolean])[] = [
  [2, 8, true],
  [8, 8, true],
  [2, 14, false],
  [8, 14, false],
  [2, 17, false],
  [8, 17, false],
];

/** After the amorous demons: the Kops, the prisoners and the watchman. */
const GOAL_JAIL: readonly LevelContent[] = [
  hostile('nh:kop_kaptain', 24, 9),
  hostile('nh:kop_lieutenant', 20, 9),
  hostile('nh:kop_lieutenant', 22, 11),
  hostile('nh:kop_lieutenant', 22, 7),
  hostile('nh:keystone_kop', 19, 7),
  hostile('nh:keystone_kop', 19, 8),
  hostile('nh:keystone_kop', 22, 9),
  hostile('nh:keystone_kop', 24, 11),
  hostile('nh:keystone_kop', 19, 11),
  mon('nh:prisoner', 19, 13),
  mon('nh:prisoner', 21, 13),
  mon('nh:prisoner', 24, 13),
  hostile('nh:watchman', 33, 10),
];

/** ref: dat/Tou-goal.lua */
export const TOU_GOAL: LevelDef = {
  id: 'nh:tou-goal',
  // (lit omitted: the coin flip is drawn)
  init: { style: 'solidfill', fg: 'nh:stone' },
  map: { rows: [...GOAL_MAP] },
  // Dungeon Description
  regions: [
    lit(0, 0, 75, 19),
    lit(1, 1, 9, 2),
    room(1, 4, 9, 5, true, BARRACKS),
    unlit(1, 7, 2, 10),
    unlit(7, 7, 9, 10),
    unlit(1, 14, 2, 15),
    unlit(7, 14, 9, 15),
    unlit(1, 17, 2, 18),
    unlit(7, 17, 9, 18),
    room(11, 1, 19, 2, false, BARRACKS),
    unlit(21, 1, 30, 2),
    room(11, 17, 19, 18, false, BARRACKS),
    unlit(21, 17, 30, 18),
    lit(18, 7, 25, 11),
    unlit(18, 13, 19, 13),
    unlit(21, 13, 22, 13),
    unlit(24, 13, 25, 13),
    unlit(42, 3, 47, 6),
    unlit(42, 8, 50, 11),
    room(37, 16, 41, 18, false, MORGUE),
    unlit(47, 16, 55, 18),
    unlit(55, 1, 62, 3),
    unlit(64, 1, 71, 3),
    room(60, 14, 71, 15, true, SHOP),
    room(60, 17, 71, 18, true, SHOP),
  ],
  stairs: { up: { x: 70, y: 8 } },
  doors: [
    { x: 7, y: 3, state: 'locked' },
    { x: 2, y: 6, state: 'locked' },
    { x: 8, y: 6, state: 'locked' },
    { x: 3, y: 8, state: 'closed' },
    { x: 6, y: 8, state: 'closed' },
    { x: 10, y: 12, state: 'open' },
    { x: 3, y: 15, state: 'closed' },
    { x: 6, y: 15, state: 'closed' },
    { x: 3, y: 17, state: 'closed' },
    { x: 6, y: 17, state: 'closed' },
    { x: 13, y: 3, state: 'closed' },
    { x: 25, y: 3, state: 'random' },
    { x: 13, y: 16, state: 'closed' },
    { x: 25, y: 16, state: 'random' },
    { x: 17, y: 9, state: 'locked' },
    { x: 18, y: 12, state: 'locked' },
    { x: 21, y: 12, state: 'locked' },
    { x: 24, y: 12, state: 'locked' },
    { x: 34, y: 10, state: 'locked' },
    { x: 36, y: 10, state: 'locked' },
    { x: 48, y: 4, state: 'random' },
    { x: 56, y: 4, state: 'random' },
    { x: 70, y: 4, state: 'random' },
    { x: 51, y: 9, state: 'random' },
    { x: 51, y: 15, state: 'random' },
    { x: 59, y: 14, state: 'open' },
    { x: 59, y: 17, state: 'open' },
  ],
  // after the Platinum Yendorian Express Card (the fixup makes it first, then these with the
  // traps and the amorous demons between)
  contents: [...times(14, obj()), ...GOAL_GUILD, ...GOAL_JAIL],
};

const GOAL_FIXUP: SpLevFixup = {
  contents(ctx, level, def) {
    questArtifact(
      ctx,
      level,
      def,
      'nh:credit_card',
      4,
      1,
      0,
      'The Platinum Yendorian Express Card',
    );
    makeContents(ctx, level, def, times(14, obj()));
    trapsOnFloor(ctx, level, def, 6, GOAL_SHOPS);
    makeContents(ctx, level, def, GOAL_GUILD);
    for (const [x, y, female] of GOAL_DEMONS)
      createMonster(ctx, level, mon('nh:incubus', x, y), def, undefined, female);
    makeContents(ctx, level, def, GOAL_JAIL);
  },
  after(_ctx, level, def) {
    wallifyMap(level, def);
  },
};

// ---------------------------------------------------------------------------------------------
// the fillers

/** The fillers' mines-style map: walled, joined caves. */
const CAVES: LevelDef['init'] = {
  style: 'mines',
  fg: 'nh:floor',
  bg: 'nh:stone',
  smoothed: true,
  joined: true,
  walled: true,
};

/** ref: dat/Tou-fila.lua: between the home and the locate level */
export const TOU_FILA: LevelDef = {
  id: 'nh:tou-fila',
  // (lit omitted: the coin flip is drawn)
  init: CAVES,
  contents: [
    ...times(7, obj()),
    ...times(4, trap()),
    ...times(5, hostile('nh:soldier')),
    cls('H', false),
    cls('C', false),
    peaceful('nh:dwarf'),
    { kind: 'monster', id: 'nh:dwarf', peaceful: true, percent: 50, count: 2 },
    { kind: 'monster', id: 'nh:rock_troll', peaceful: true, percent: 50, count: 2 },
  ],
};

/** ref: dat/Tou-filb.lua: between the locate and the goal level */
export const TOU_FILB: LevelDef = {
  id: 'nh:tou-filb',
  // (lit omitted: the coin flip is drawn)
  init: CAVES,
  contents: [
    ...times(11, obj()),
    ...times(4, trap()),
    hostile('nh:soldier'),
    ...times(2, hostile('nh:captain')),
    ...times(2, cls('H', false)),
    cls('C', false),
    cls('s'),
  ],
};

/** The Tourist's five levels. */
export const TOU_LEVELS: readonly LevelDef[] = [TOU_STRT, TOU_LOCA, TOU_GOAL, TOU_FILA, TOU_FILB];

/** Their fixups, by LevelDef id. */
export const TOU_FIXUPS: Readonly<Record<DefId, SpLevFixup>> = {
  [TOU_STRT.id]: STRT_FIXUP,
  [TOU_LOCA.id]: LOCA_FIXUP,
  [TOU_GOAL.id]: GOAL_FIXUP,
};
