// The Barbarian's quest: Pelias's camp by the river, with the ogres' siege beyond it (home), the
// ogres' and trolls' hold (locate), Thoth Amon's caves with the Heart of Ahriman on a cross-aligned
// altar (goal), and the dark mines-style fillers above and below the locate level.
// ref: dat/Bar-strt.lua, Bar-loca.lua, Bar-goal.lua, Bar-fila.lua, Bar-filb.lua
//
// Translation notes (DEVIATIONS.md "Quest levels (m24b)"): maps, lit regions, fixed stairs,
// doors, des.replace_terrain() (the forest) and contents are LevelDef data; "mazelevel",
// "noteleport", "hardfloor" and the non-diggable map are levelflags.ts entries ("noflip" needs
// nothing: levels are never flipped here). A level script's des.level_init({ style = "solidfill"
// }) before its mines-style init is not drawn (as minefill's). Fixups, in the script's order:
// the forest's guaranteed path (selection.randline()) and the portal's free spot, Pelias's
// custom inventory, the twelve besieging ogres on the river's far bank (selection.floodfill() &
// selection.area(), rndcoord(1) each), the goal's noncoaligned altar, the Heart of Ahriman
// (blessed, named through onameItem()), the goal's des.wallify(), and the home level's branch
// levregion (the portal), placed last as fixup_special() does.
import type { DefId, LevelContent, LevelDef, RegionDef } from '@nh/core';
import {
  selAnd,
  selArea,
  selFloodfill,
  selNew,
  selRandline,
  selRndcoord,
  setSel,
  setTer,
} from '../selection';
import { makeContents, mapToLevel, type SpLevFixup } from '../sp_lev';
import { T } from '../terrain';
import { TRAP } from '../trap';
import {
  altarAt,
  branchAt,
  cls,
  coaligned,
  hostile,
  mon,
  monWithInventory,
  noncoalignment,
  obj,
  questArtifact,
  times,
  trap,
  wallifyMap,
} from './common';

const OGRE = 'nh:ogre';
const TROLL = 'nh:rock_troll';
const lit = (x1: number, y1: number, x2: number, y2: number): RegionDef => ({
  area: [x1, y1, x2, y2],
  lit: true,
});
const unlit = (x1: number, y1: number, x2: number, y2: number): RegionDef => ({
  area: [x1, y1, x2, y2],
  lit: false,
});

// ---------------------------------------------------------------------------------------------
// Bar-strt: the home level

const STRT_MAP: readonly string[] = [
  '..................................PP........................................',
  '...................................PP.......................................',
  '...................................PP.......................................',
  '....................................PP......................................',
  '........--------------......-----....PPP....................................',
  '........|...S........|......+...|...PPP.....................................',
  '........|----........|......|...|....PP.....................................',
  '........|.\\..........+......-----...........................................',
  '........|----........|...............PP.....................................',
  '........|...S........|...-----.......PPP....................................',
  '........--------------...+...|......PPPPP...................................',
  '.........................|...|.......PPP....................................',
  '...-----......-----......-----........PP....................................',
  '...|...+......|...+..--+--.............PP...................................',
  '...|...|......|...|..|...|..............PP..................................',
  '...-----......-----..|...|.............PPPP.................................',
  '.....................-----............PP..PP................................',
  '.....................................PP...PP................................',
  '....................................PP...PP.................................',
  '....................................PP....PP................................',
];

/** ref: dat/Bar-strt.lua */
export const BAR_STRT: LevelDef = {
  id: 'nh:bar-strt',
  // des.level_init({ style = "solidfill", fg = " " }) (lit omitted: the coin flip is drawn)
  init: { style: 'solidfill', fg: 'nh:stone' },
  map: { rows: [...STRT_MAP] },
  // the forest beyond the river (drawn before the regions, which draw nothing)
  edits: [
    { replace: { from: '.', to: 'T', area: [37, 0, 59, 19], chance: 5 } },
    { replace: { from: '.', to: 'T', area: [60, 0, 64, 19], chance: 10 } },
    { replace: { from: '.', to: 'T', area: [65, 0, 75, 19], chance: 20 } },
  ],
  // Dungeon Description
  regions: [
    lit(0, 0, 75, 19),
    unlit(9, 5, 11, 5),
    lit(9, 7, 11, 7),
    unlit(9, 9, 11, 9),
    lit(13, 5, 20, 9),
    lit(29, 5, 31, 6),
    lit(26, 10, 28, 11),
    lit(4, 13, 6, 14),
    lit(15, 13, 17, 14),
    lit(22, 14, 24, 15),
  ],
  stairs: { down: { x: 9, y: 9 } },
  doors: [
    { x: 12, y: 5, state: 'locked' },
    { x: 12, y: 9, state: 'locked' },
    { x: 21, y: 7, state: 'closed' },
    { x: 7, y: 13, state: 'open' },
    { x: 18, y: 13, state: 'open' },
    { x: 23, y: 13, state: 'open' },
    { x: 25, y: 10, state: 'open' },
    { x: 28, y: 5, state: 'open' },
  ],
  // after Pelias (the fixup makes him with his inventory first), before the ogres
  contents: [
    // The treasure of Pelias
    { kind: 'object', id: 'nh:chest', x: 9, y: 5 },
    // chieftain guards for the audience chamber
    ...(
      [
        [10, 5],
        [10, 9],
        [11, 5],
        [11, 9],
        [14, 5],
        [14, 9],
        [16, 5],
        [16, 9],
      ] as const
    ).map(([x, y]) => mon('nh:chieftain', x, y)),
    // One trap to keep the ogres at bay.
    trap(TRAP.spikedPit, 37, 7),
    // Eels in the river
    mon('nh:giant_eel', 36, 1),
    mon('nh:giant_eel', 37, 9),
    mon('nh:giant_eel', 39, 15),
  ],
};

const STRT_FIXUP: SpLevFixup = {
  before(ctx, level, def) {
    // guarantee a path and free spot for the portal
    const a = mapToLevel(def, level, 37, 7);
    const b = mapToLevel(def, level, 62, 2);
    setSel(level, selRandline(ctx.rng, level, selNew(level), a.x, a.y, b.x, b.y, 7), '.');
    setTer(level, b.x, b.y, T.floor);
  },
  contents(ctx, level, def) {
    // Elder
    monWithInventory(ctx, level, def, 'nh:pelias', 10, 7, [
      ['nh:runesword', 5],
      ['nh:chain_mail', 5],
    ]);
    makeContents(ctx, level, def, def.contents ?? []);
    // Monsters on siege duty: selection.floodfill(37,7) & selection.area(40,03, 45,20)
    const o = mapToLevel(def, level, 0, 0);
    const f = mapToLevel(def, level, 37, 7);
    const ogrelocs = selAnd(
      selFloodfill(level, f.x, f.y),
      selArea(level, o.x + 40, o.y + 3, o.x + 45, o.y + 20),
    );
    for (let i = 0; i <= 11; i++) {
      // ogrelocs:rndcoord(1): a spot, taken out of the selection (none left: a random spot)
      const p = selRndcoord(ctx.rng, level, ogrelocs);
      const c: LevelContent =
        p === null ? hostile(OGRE) : { ...hostile(OGRE), x: p.x, y: p.y, coords: 'level' as const };
      if (p !== null) ogrelocs[p.y * level.width + p.x] = false;
      makeContents(ctx, level, def, [c]);
    }
  },
  after(ctx, level, def) {
    // Portal arrival point: des.levregion({ region = {62,02,62,02}, type="branch" })
    branchAt(ctx, level, def, 62, 2);
  },
};

// ---------------------------------------------------------------------------------------------
// Bar-loca: the locate level

const LOCA_MAP: readonly string[] = [
  '..........PPP.........................................                      ',
  '...........PP..........................................        .......      ',
  '..........PP...........-----..........------------------     ..........     ',
  '...........PP..........+...|..........|....S...........|..  ............    ',
  '..........PPP..........|...|..........|-----...........|...  .............  ',
  '...........PPP.........-----..........+....+...........|...  .............  ',
  '..........PPPPPPPPP...................+....+...........S.................   ',
  '........PPPPPPPPPPPPP.........-----...|-----...........|................    ',
  '......PPPPPPPPPPPPPP..P.......+...|...|....S...........|          ...       ',
  '.....PPPPPPP......P..PPPP.....|...|...------------------..         ...      ',
  '....PPPPPPP.........PPPPPP....-----........................      ........   ',
  '...PPPPPPP..........PPPPPPP..................................   ..........  ',
  '....PPPPPPP........PPPPPPP....................................  ..........  ',
  '.....PPPPP........PPPPPPP.........-----........................   ........  ',
  '......PPP..PPPPPPPPPPPP...........+...|.........................    .....   ',
  '..........PPPPPPPPPPP.............|...|.........................     ....   ',
  '..........PPPPPPPPP...............-----.........................       .    ',
  '..............PPP.................................................          ',
  '...............PP....................................................       ',
  '................PPP...................................................      ',
];

/** ref: dat/Bar-loca.lua */
export const BAR_LOCA: LevelDef = {
  id: 'nh:bar-loca',
  init: { style: 'solidfill', fg: 'nh:stone' },
  map: { rows: [...LOCA_MAP] },
  // Dungeon Description
  regions: [
    lit(0, 0, 75, 19),
    unlit(24, 3, 26, 4),
    unlit(31, 8, 33, 9),
    unlit(35, 14, 37, 15),
    lit(39, 3, 54, 8),
    unlit(56, 0, 75, 8),
    unlit(64, 9, 75, 16),
  ],
  doors: [
    { x: 23, y: 3, state: 'open' },
    { x: 30, y: 8, state: 'open' },
    { x: 34, y: 14, state: 'open' },
    { x: 38, y: 5, state: 'locked' },
    { x: 38, y: 6, state: 'locked' },
    { x: 43, y: 3, state: 'closed' },
    { x: 43, y: 5, state: 'closed' },
    { x: 43, y: 6, state: 'closed' },
    { x: 43, y: 8, state: 'closed' },
    { x: 55, y: 6, state: 'locked' },
  ],
  stairs: { up: { x: 5, y: 2 }, down: { x: 70, y: 13 } },
  contents: [
    // Objects
    ...times(3, obj(42, 3)),
    ...times(4, obj(41, 3)),
    ...times(2, obj(41, 8)),
    ...times(3, obj(42, 8)),
    ...times(3, obj(71, 13)),
    // Random traps
    trap(TRAP.spikedPit, 10, 13),
    trap(TRAP.spikedPit, 21, 7),
    trap(TRAP.spikedPit, 67, 8),
    trap(TRAP.spikedPit, 68, 9),
    ...times(4, trap()),
    // Random monsters.
    ...(
      [
        [12, 9],
        [18, 11],
        [45, 5],
        [45, 6],
        [47, 5],
        [46, 5],
        [56, 3],
        [56, 4],
        [56, 5],
        [56, 6],
        [57, 3],
        [57, 4],
        [57, 5],
        [57, 6],
      ] as const
    ).map(([x, y]) => hostile(OGRE, x, y)),
    ...times(3, hostile(OGRE)),
    cls('O', false),
    cls('T', false),
    ...(
      [
        [46, 6],
        [47, 6],
        [56, 7],
        [57, 7],
        [70, 13],
      ] as const
    ).map(([x, y]) => hostile(TROLL, x, y)),
    ...times(2, hostile(TROLL)),
    cls('T', false),
  ],
};

// ---------------------------------------------------------------------------------------------
// Bar-goal: Thoth Amon's caves

const GOAL_MAP: readonly string[] = [
  '                                                                            ',
  '                               .............                                ',
  '                             ..................                             ',
  '        ....              .........................          ....           ',
  '      .......          ..........................           .......         ',
  '      ......             ........................          .......          ',
  '      ..  ......................................             ..             ',
  '       ..                 .....................             ..              ',
  '        ..                 ..................              ..               ',
  '         ..         ..S...S..............   ................                ',
  '          ..                   ........                ...                  ',
  '       .........                                         ..                 ',
  '       ......  ..                                         ...  ....         ',
  '      .. ...    ..                             ......       ........        ',
  '   ....          .. ..................        ........       ......         ',
  '  ......          ......................       ......         ..            ',
  '   ....             ..................              ...........             ',
  '                      ..............                                        ',
  '                        ...........                                         ',
  '                                                                            ',
];

/** ref: dat/Bar-goal.lua */
export const BAR_GOAL: LevelDef = {
  id: 'nh:bar-goal',
  init: { style: 'solidfill', fg: 'nh:stone' },
  map: { rows: [...GOAL_MAP] },
  // Dungeon Description
  regions: [unlit(0, 0, 75, 19)],
  // Secret doors
  doors: [
    { x: 22, y: 9, state: 'locked' },
    { x: 26, y: 9, state: 'locked' },
  ],
  stairs: { up: { x: 36, y: 5 } },
  // after the Heart of Ahriman (the fixup makes it first)
  contents: [
    ...times(14, obj()),
    // Random traps
    ...times(6, trap()),
    // Random monsters.
    hostile('nh:thoth_amon', 63, 4),
    ...times(16, hostile(OGRE)),
    ...times(2, cls('O', false)),
    ...times(8, hostile(TROLL)),
    cls('T', false),
  ],
};

const GOAL_FIXUP: SpLevFixup = {
  before(ctx, level, def) {
    // The altar.  Unattended.
    altarAt(ctx, level, def, 63, 4, noncoalignment(ctx, coaligned(ctx)));
  },
  contents(ctx, level, def) {
    questArtifact(ctx, level, def, 'nh:luckstone', 63, 4, 0, 'The Heart of Ahriman');
    makeContents(ctx, level, def, def.contents ?? []);
  },
  after(_ctx, level, def) {
    wallifyMap(level, def);
  },
};

// ---------------------------------------------------------------------------------------------
// the fillers

/** ref: dat/Bar-fila.lua: between the home and the locate level */
export const BAR_FILA: LevelDef = {
  id: 'nh:bar-fila',
  init: {
    style: 'mines',
    fg: 'nh:floor',
    bg: 'nh:floor',
    smoothed: true,
    joined: true,
    lit: false,
    walled: false,
  },
  contents: [
    ...times(8, obj()),
    ...times(4, trap()),
    hostile(OGRE),
    hostile(OGRE),
    cls('O', false),
    hostile(TROLL),
  ],
};

/** ref: dat/Bar-filb.lua: between the locate and the goal level */
export const BAR_FILB: LevelDef = {
  id: 'nh:bar-filb',
  init: {
    style: 'mines',
    fg: 'nh:floor',
    bg: 'nh:stone',
    smoothed: true,
    joined: true,
    lit: false,
    walled: true,
  },
  contents: [
    ...times(11, obj()),
    ...times(4, trap()),
    ...times(7, hostile(OGRE)),
    cls('O', false),
    ...times(3, hostile(TROLL)),
    cls('T', false),
  ],
};

/** The Barbarian's five levels. */
export const BAR_LEVELS: readonly LevelDef[] = [BAR_STRT, BAR_LOCA, BAR_GOAL, BAR_FILA, BAR_FILB];

/** Their fixups, by LevelDef id. */
export const BAR_FIXUPS: Readonly<Record<DefId, SpLevFixup>> = {
  [BAR_STRT.id]: STRT_FIXUP,
  [BAR_GOAL.id]: GOAL_FIXUP,
};
