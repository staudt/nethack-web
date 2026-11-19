// The Cave Dweller's quest: Shaman Karnov's caves with their temple, besieged by bugbears (home),
// the bugbears' and hill giants' caverns (locate), the Chromatic Dragon's lair with the Sceptre
// of Might (goal), and the walled mines-style fillers above and below the locate level.
// ref: dat/Cav-strt.lua, Cav-loca.lua, Cav-goal.lua, Cav-fila.lua, Cav-filb.lua
//
// Translation notes (DEVIATIONS.md "Quest levels (m24b)"): maps, lit regions, fixed stairs,
// doors and contents are LevelDef data; "mazelevel", "noteleport", "hardfloor" and the
// non-diggable map are levelflags.ts entries ("noflip" needs nothing). The maps' 'B' boundaries
// are floor from the start (core maps have no 'B'; remove_boundary_syms() makes them floor once
// the regions are laid out). The irregular regions: the temple is the rectangle of its flood
// fill (a room, as the port's other irregular rooms), lit on its flood fill only; the untyped
// ones light their flood fills and make no room. A level script's des.level_init({ style =
// "solidfill" }) before its mines-style init is not drawn (as minefill's). Fixups, in the
// script's order: the irregular regions' lighting, the coaligned shrine with its priest
// (priestini() with the altar), Shaman Karnov's custom inventory, the Sceptre of Might (blessed,
// named through onameItem()), des.wallify() and the home level's branch levregion (the portal),
// placed last as fixup_special() does.
import type { DefId, LevelDef } from '@nh/core';
import { TEMPLE } from '../epri';
import { makeContents, mapToLevel, type SpLevFixup } from '../sp_lev';
import { TRAP } from '../trap';
import {
  altarAt,
  branchAt,
  cls,
  coaligned,
  hostile,
  lightIrregular,
  mon,
  monWithInventory,
  obj,
  questArtifact,
  times,
  trap,
  unbounded,
  wallifyMap,
} from './common';

const BUGBEAR = 'nh:bugbear';
const HILL_GIANT = 'nh:hill_giant';

// ---------------------------------------------------------------------------------------------
// Cav-strt: the home level

/** The script's map, its 'B' boundaries kept for the irregular regions' flood fills. */
const STRT_MAP: readonly string[] = [
  '                                                                            ',
  '  ......     ..........................       ...        ....  ......       ',
  ' ......       ..........................     ........       ....    .....   ',
  '  ..BB      .............................    .........            ....  ..  ',
  '     ..    ......................              .......      ..     ....  .. ',
  '     ..     ....................                     ..  .......    ..  ... ',
  '   ..              S   BB                .....     .......   ....      .... ',
  '    ..        ...  .   ..               ........  ..     ..   ..       ...  ',
  '     ..      ......     ..             ............       ..          ...   ',
  '       .      ....       ..             ........           ..  ...........  ',
  '  ...   ..     ..        .............                  ................... ',
  ' .....   .....            ...............................      ...........  ',
  '  .....B................            ...                               ...   ',
  '  .....     .  ..........        .... .      ...  ..........           ...  ',
  '   ...     ..          .............  ..    ...................        .... ',
  '          BB       ..   .........      BB    ...  ..........  ..   ...  ... ',
  '       ......    .....  B          ........         ..         .. ....  ... ',
  '     ..........  ..........         ..... ...      .....        ........    ',
  '       ..  ...    .  .....         ....    ..       ...            ..       ',
  '                                                                            ',
];

/** The temple's irregular region: the rectangle its flood fill from {13,01} covers. */
const STRT_TEMPLE = [11, 1, 40, 5] as const;

/** ref: dat/Cav-strt.lua */
export const CAV_STRT: LevelDef = {
  id: 'nh:cav-strt',
  // des.level_init({ style = "solidfill", fg = " " }) (lit omitted: the coin flip is drawn)
  init: { style: 'solidfill', fg: 'nh:stone' },
  map: { rows: unbounded(STRT_MAP) },
  // Dungeon Description; the occupied rooms (irregular, lit) are the fixup's
  regions: [
    { area: [0, 0, 75, 19], lit: false },
    { area: [...STRT_TEMPLE], lit: true, type: TEMPLE, filled: true },
  ],
  stairs: { down: { x: 2, y: 3 } },
  doors: [{ x: 19, y: 6, state: 'locked' }],
  // after Shaman Karnov (the fixup makes him with his inventory first)
  contents: [
    // The treasure of Shaman Karnov
    { kind: 'object', id: 'nh:chest', x: 34, y: 2 },
    // neanderthal guards for the audience chamber
    ...(
      [
        [20, 3],
        [20, 2],
        [20, 1],
        [21, 3],
        [21, 2],
        [21, 1],
        [22, 1],
        [26, 9],
      ] as const
    ).map(([x, y]) => mon('nh:neanderthal', x, y)),
    // Random traps
    trap(TRAP.pit, 47, 11),
    trap(TRAP.pit, 57, 10),
    ...times(4, trap()),
    // Monsters on siege duty (in the outer caves).
    ...(
      [
        [47, 2],
        [48, 3],
        [49, 4],
        [67, 3],
        [69, 4],
        [51, 13],
        [53, 14],
        [55, 15],
        [63, 10],
        [65, 9],
        [67, 10],
        [69, 11],
      ] as const
    ).map(([x, y]) => hostile(BUGBEAR, x, y)),
  ],
};

const STRT_FIXUP: SpLevFixup = {
  before(ctx, level, def) {
    // the temple is lit on its flood fill only (core lit its rectangle and the cells around it)
    const a = mapToLevel(def, level, STRT_TEMPLE[0] - 1, STRT_TEMPLE[1] - 1);
    const b = mapToLevel(def, level, STRT_TEMPLE[2] + 1, STRT_TEMPLE[3] + 1);
    for (let y = a.y; y <= b.y; y++)
      for (let x = a.x; x <= b.x; x++) level.lit[y * level.width + x] = 0;
    lightIrregular(level, def, STRT_MAP, 13, 1, true);
    // The occupied rooms.
    for (const [x, y] of [
      [2, 1],
      [1, 11],
      [13, 8],
      [5, 17],
      [17, 16],
      [35, 16],
    ] as const)
      lightIrregular(level, def, STRT_MAP, x, y, true);
    // The temple altar (this will force a priest(ess) to be created)
    altarAt(ctx, level, def, 36, 2, coaligned(ctx), true);
  },
  contents(ctx, level, def) {
    monWithInventory(ctx, level, def, 'nh:shaman_karnov', 35, 2, [
      ['nh:leather_armor', 5],
      ['nh:club', 5],
    ]);
    makeContents(ctx, level, def, def.contents ?? []);
  },
  after(ctx, level, def) {
    wallifyMap(level, def);
    // Portal arrival point: des.levregion({ region = {71,09,71,09}, type="branch" })
    branchAt(ctx, level, def, 71, 9);
  },
};

// ---------------------------------------------------------------------------------------------
// Cav-loca: the locate level

/** The script's map, its 'B' boundaries kept for the irregular region's flood fill. */
const LOCA_MAP: readonly string[] = [
  '                                                                            ',
  '    .............                     ...........                           ',
  '   ...............                   .............                          ',
  '    .............                  ...............        ..........        ',
  '     ...........                    .............      ...............      ',
  '        ...                                    ...   ..................     ',
  '         ...                ..........          ... ..................      ',
  '          ...              ............          BBB...................     ',
  '           ...              ..........          ......................      ',
  '            .....                 ..      .....B........................    ',
  '  ....       ...............      .    ........B..........................  ',
  ' ......     .. .............S..............         ..................      ',
  '  ....     ..                ...........             ...............        ',
  '     ..  ...                                    ....................        ',
  '      ....                                      BB...................       ',
  '         ..                 ..                 ..  ...............          ',
  '          ..   .......     ....  .....  ....  ..     .......   S            ',
  '           ............     ....... ..  .......       .....    ...  ....    ',
  '               .......       .....   ......                      .......    ',
  '                                                                            ',
];

/** ref: dat/Cav-loca.lua */
export const CAV_LOCA: LevelDef = {
  id: 'nh:cav-loca',
  init: { style: 'solidfill', fg: 'nh:stone' },
  map: { rows: unbounded(LOCA_MAP) },
  // Dungeon Description; the lit irregular region is the fixup's
  regions: [{ area: [0, 0, 75, 19], lit: false }],
  doors: [{ x: 28, y: 11, state: 'locked' }],
  stairs: { up: { x: 4, y: 3 }, down: { x: 73, y: 10 } },
  contents: [
    ...times(15, obj()),
    // Random traps
    ...times(6, trap()),
    // Random monsters.
    ...(
      [
        [2, 10],
        [3, 11],
        [4, 12],
        [2, 11],
        [16, 16],
        [17, 17],
        [18, 18],
        [19, 16],
        [30, 6],
        [31, 7],
        [32, 8],
        [33, 6],
        [34, 7],
      ] as const
    ).map(([x, y]) => hostile(BUGBEAR, x, y)),
    ...times(4, hostile(BUGBEAR)),
    cls('h', false),
    cls('H', false),
    hostile(HILL_GIANT, 3, 12),
    hostile(HILL_GIANT, 20, 17),
    hostile(HILL_GIANT, 35, 8),
    ...times(4, hostile(HILL_GIANT)),
    cls('H', false),
  ],
};

const LOCA_FIXUP: SpLevFixup = {
  before(_ctx, level, def) {
    lightIrregular(level, def, LOCA_MAP, 52, 6, true);
  },
  after(_ctx, level, def) {
    wallifyMap(level, def);
  },
};

// ---------------------------------------------------------------------------------------------
// Cav-goal: the Chromatic Dragon's lair

const GOAL_MAP: readonly string[] = [
  '                                                                            ',
  '                          .....................                             ',
  '                         .......................                            ',
  '                        .........................                           ',
  '                       ...........................                          ',
  '                      .............................                         ',
  '                     ...............................                        ',
  '                    .................................                       ',
  '                   ...................................                      ',
  '                  .....................................                     ',
  '                 .......................................                    ',
  '                  .....................................                     ',
  '                   ...................................                      ',
  '                    .................................                       ',
  '                     ...............................                        ',
  '                      .............................                         ',
  '                       ...........................                          ',
  '                        .........................                           ',
  '                         .......................                            ',
  '                                                                            ',
];

/** ref: dat/Cav-goal.lua */
export const CAV_GOAL: LevelDef = {
  id: 'nh:cav-goal',
  init: { style: 'solidfill', fg: 'nh:stone' },
  map: { rows: [...GOAL_MAP] },
  // Dungeon Description
  regions: [{ area: [0, 0, 75, 19], lit: true }],
  // des.stair("up"): at random on the map
  // after the Sceptre of Might (the fixup makes it first)
  contents: [
    ...times(14, obj()),
    // monsters.
    { kind: 'monster', id: 'nh:chromatic_dragon', x: 23, y: 10, asleep: true },
    mon('nh:shrieker', 26, 13),
    mon('nh:shrieker', 25, 8),
    mon('nh:shrieker', 45, 11),
  ],
};

const GOAL_FIXUP: SpLevFixup = {
  contents(ctx, level, def) {
    questArtifact(ctx, level, def, 'nh:mace', 23, 10, 0, 'The Sceptre of Might');
    makeContents(ctx, level, def, def.contents ?? []);
  },
  after(_ctx, level, def) {
    wallifyMap(level, def);
  },
};

// ---------------------------------------------------------------------------------------------
// the fillers

/** The fillers' walled mines-style map (lit omitted: the coin flip is drawn). */
const FILL_INIT: LevelDef['init'] = {
  style: 'mines',
  fg: 'nh:floor',
  bg: 'nh:stone',
  smoothed: true,
  joined: true,
  walled: true,
};

/** ref: dat/Cav-fila.lua: between the home and the locate level */
export const CAV_FILA: LevelDef = {
  id: 'nh:cav-fila',
  init: FILL_INIT,
  contents: [
    ...times(7, obj()),
    ...times(4, trap()),
    ...times(5, hostile(BUGBEAR)),
    cls('h', false),
    hostile(HILL_GIANT),
  ],
};

/** ref: dat/Cav-filb.lua: between the locate and the goal level */
export const CAV_FILB: LevelDef = {
  id: 'nh:cav-filb',
  init: FILL_INIT,
  contents: [
    ...times(12, obj()),
    ...times(4, trap()),
    ...times(4, hostile(BUGBEAR)),
    ...times(2, cls('h', false)),
    ...times(2, hostile(HILL_GIANT)),
  ],
};

/** The Cave Dweller's five levels. */
export const CAV_LEVELS: readonly LevelDef[] = [CAV_STRT, CAV_LOCA, CAV_GOAL, CAV_FILA, CAV_FILB];

/** Their fixups, by LevelDef id. */
export const CAV_FIXUPS: Readonly<Record<DefId, SpLevFixup>> = {
  [CAV_STRT.id]: STRT_FIXUP,
  [CAV_LOCA.id]: LOCA_FIXUP,
  [CAV_GOAL.id]: GOAL_FIXUP,
};
