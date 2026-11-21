// The Knight's quest: Camelot, King Arthur's castle on a lit field, besieged by quasits (home),
// the Isle of Glass with its temple atop the Tor in the swamps (locate), Ixoth's caverns with the
// Magic Mirror of Merlin (goal), and the swampy mines-style fillers above and below the locate
// level. ref: dat/Kni-strt.lua, Kni-loca.lua, Kni-goal.lua, Kni-fila.lua, Kni-filb.lua
//
// Translation notes (DEVIATIONS.md "Quest levels (m24b)"): maps, lit regions, the throne room (a
// court that is not stocked, C's `filled = 2`, as the Castle's), the temple, fixed stairs, doors
// and contents are LevelDef data; "mazelevel", "noteleport", "hardfloor" and the non-diggable
// areas are levelflags.ts entries ("noflip" needs nothing). A level script's des.level_init({
// style = "solidfill" }) before its mines-style init is not drawn (as minefill's); Kni-strt's
// mines-style "lit field" is drawn as the script makes it. Fixups, in the script's order: the
// locate level's neutral shrine with its priest (priestini() with the altar), King Arthur's
// custom inventory (Excalibur named through onameItem(), so it exists from then on), the
// `2 + nh.rn2(3)` peaceful warhorses with a saddle half the time (put on when given, as
// create_object() does for a saddle in a monster's inventory), the Magic Mirror of Merlin
// (blessed, named) and the home level's branch levregion (the portal), placed last as
// fixup_special() does.
import type { DefId, LevelContent, LevelDef, RegionDef } from '@nh/core';
import { A_NEUTRAL } from '../aligntyp';
import { TEMPLE } from '../epri';
import { setWornSaddle } from '../items';
import { minvent, mDoWear } from '../mongear';
import { percent } from '../selection';
import { createMonster, createObject, makeContents, type SpLevFixup } from '../sp_lev';
import { mpickobj } from '../steal';
import { TRAP } from '../trap';
import { COURT } from '../zoo';
import {
  altarAt,
  branchAt,
  cls,
  hostile,
  mon,
  monWithInventory,
  obj,
  questArtifact,
  times,
  trap,
} from './common';

const QUASIT = 'nh:quasit';
const JELLY = 'nh:ochre_jelly';
const lit = (x1: number, y1: number, x2: number, y2: number): RegionDef => ({
  area: [x1, y1, x2, y2],
  lit: true,
});
const unlit = (x1: number, y1: number, x2: number, y2: number): RegionDef => ({
  area: [x1, y1, x2, y2],
  lit: false,
});

// ---------------------------------------------------------------------------------------------
// Kni-strt: the home level

const STRT_MAP: readonly string[] = [
  '..................................................',
  '.-----......................................-----.',
  '.|...|......................................|...|.',
  '.--|+-------------------++-------------------+|--.',
  '...|...................+..+...................|...',
  '...|.|-----------------|++|-----------------|.|...',
  '...|.|.................|..|.........|.......|.|...',
  '...|.|...\\.............+..+.........|.......|.|...',
  '...|.|.................+..+.........+.......|.|...',
  '...|.|.................|..|.........|.......|.|...',
  '...|.|--------------------------------------|.|...',
  '...|..........................................|...',
  '.--|+----------------------------------------+|--.',
  '.|...|......................................|...|.',
  '.-----......................................-----.',
  '..................................................',
];

/** ref: dat/Kni-strt.lua */
export const KNI_STRT: LevelDef = {
  id: 'nh:kni-strt',
  // This is a kludge to init the level as a lit field.
  init: {
    style: 'mines',
    fg: 'nh:floor',
    bg: 'nh:floor',
    smoothed: false,
    joined: false,
    lit: true,
    walled: false,
  },
  map: { rows: [...STRT_MAP] },
  // Dungeon Description
  regions: [
    lit(0, 0, 49, 15),
    unlit(4, 4, 45, 11),
    // the throne room: a court, not stocked (filled = 2: the room kind and level flags only)
    { area: [6, 6, 22, 9], lit: true, type: COURT, filled: false },
    lit(27, 6, 43, 9),
  ],
  stairs: { down: { x: 40, y: 7 } },
  doors: [
    // Outside Doors
    { x: 24, y: 3, state: 'locked' },
    { x: 25, y: 3, state: 'locked' },
    // Inside Doors
    { x: 23, y: 4, state: 'closed' },
    { x: 26, y: 4, state: 'closed' },
    { x: 24, y: 5, state: 'locked' },
    { x: 25, y: 5, state: 'locked' },
    { x: 23, y: 7, state: 'closed' },
    { x: 26, y: 7, state: 'closed' },
    { x: 23, y: 8, state: 'closed' },
    { x: 26, y: 8, state: 'closed' },
    { x: 36, y: 8, state: 'closed' },
    // Watchroom Doors
    { x: 4, y: 3, state: 'closed' },
    { x: 45, y: 3, state: 'closed' },
    { x: 4, y: 12, state: 'closed' },
    { x: 45, y: 12, state: 'closed' },
  ],
  // after King Arthur (the fixup makes him with his inventory first), before the warhorses
  contents: [
    // The treasure of King Arthur
    { kind: 'object', id: 'nh:chest', x: 9, y: 7 },
    // knight guards for the watchrooms
    ...(
      [
        [4, 2],
        [4, 13],
        [45, 2],
        [45, 13],
      ] as const
    ).map(([x, y]): LevelContent => ({
      kind: 'monster',
      id: 'nh:knight',
      x,
      y,
      peaceful: true,
    })),
    // page guards for the audience chamber
    ...(
      [
        [16, 6],
        [18, 6],
        [20, 6],
        [16, 9],
        [18, 9],
        [20, 9],
      ] as const
    ).map(([x, y]) => mon('nh:page', x, y)),
    // Random traps
    trap(TRAP.sleepGas, 24, 4),
    trap(TRAP.sleepGas, 25, 4),
    ...times(4, trap()),
    // Monsters on siege duty.
    ...[14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36].map((x) => hostile(QUASIT, x, 0)),
  ],
};

const STRT_FIXUP: SpLevFixup = {
  contents(ctx, level, def) {
    monWithInventory(ctx, level, def, 'nh:king_arthur', 9, 7, [
      ['nh:long_sword', 4, { buc: 'blessed', name: 'Excalibur' }],
      ['nh:plate_mail', 4],
    ]);
    makeContents(ctx, level, def, def.contents ?? []);
    // Some warhorses: des.monster({ id = "warhorse", peaceful = 1, inventory = function() if
    // percent(50) then des.object("saddle"); end end })
    const n = 2 + ctx.rng.rn2(3);
    for (let i = 1; i <= n; i++) {
      const m = createMonster(
        ctx,
        level,
        { kind: 'monster', id: 'nh:warhorse', peaceful: true },
        def,
      );
      if (m !== null) for (const o of minvent(ctx, m)) ctx.remove(o.id);
      if (percent(ctx, 50)) {
        const s = createObject(ctx, level, { kind: 'object', id: 'nh:saddle' }, def);
        const e = s === null ? undefined : ctx.state.entities[String(s)];
        // a saddle given to a monster that can wear one (a warhorse can) goes on it
        if (m !== null && e) {
          mpickobj(ctx, m, e);
          setWornSaddle(ctx, e.id, m);
        }
      }
      if (m !== null) mDoWear(ctx, m, true);
    }
  },
  after(ctx, level, def) {
    // Portal arrival point: des.levregion({ region = {20,14,20,14}, type="branch" })
    branchAt(ctx, level, def, 20, 14);
  },
};

// ---------------------------------------------------------------------------------------------
// Kni-loca: the Isle of Glass

const LOCA_MAP: readonly string[] = [
  'xxxxxxxxx......xxxx...........xxxxxxxxxx',
  'xxxxxxx.........xxx.............xxxxxxxx',
  'xxxx..............................xxxxxx',
  'xx.................................xxxxx',
  '....................................xxxx',
  '.......................................x',
  '........................................',
  'xx...................................xxx',
  'xxxx..............................xxxxxx',
  'xxxxxx..........................xxxxxxxx',
  'xxxxxxxx.........xx..........xxxxxxxxxxx',
  'xxxxxxxxx.......xxxxxx.....xxxxxxxxxxxxx',
];

/** The swamps' mines-style map (lit, unsmoothed). */
const SWAMP_INIT: LevelDef['init'] = {
  style: 'mines',
  fg: 'nh:floor',
  bg: 'nh:pool',
  smoothed: false,
  joined: true,
  lit: true,
  walled: false,
};

/** ref: dat/Kni-loca.lua */
export const KNI_LOCA: LevelDef = {
  id: 'nh:kni-loca',
  init: SWAMP_INIT,
  map: { rows: [...LOCA_MAP] },
  // Dungeon Description: the Isle of Glass is a Tor rising out of the swamps surrounding it; the
  // top area of the Tor is a holy site (filled = 2: the room kind only; the altar makes the
  // priest)
  regions: [lit(0, 0, 39, 11), { area: [9, 2, 27, 9], lit: true, type: TEMPLE, filled: false }],
  stairs: { up: { x: 38, y: 0 }, down: { x: 18, y: 5 } },
  contents: [
    // Objects
    ...times(15, obj()),
    // Random traps: all of the avenues are guarded by magic except for the East.
    // South
    ...[8, 9, 10, 11, 12, 13, 14, 15, 16, 20, 21, 22, 23, 24, 25, 26, 27, 28].map((x) =>
      trap(TRAP.magic, x, 11),
    ),
    // West
    ...[3, 4, 5, 6].map((y) => trap(TRAP.magic, 0, y)),
    // North
    ...[6, 7, 8, 9, 10, 11, 12, 13, 14, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32].map(
      (x) => trap(TRAP.magic, x, 0),
    ),
    // Even so, there are magic "sinkholes" around.
    ...times(7, trap(TRAP.antiMagic)),
    // Random monsters.
    ...times(17, hostile(QUASIT)),
    cls('i', false),
    cls('j', false),
    ...times(7, hostile(JELLY)),
    cls('j', false),
  ],
};

const LOCA_FIXUP: SpLevFixup = {
  before(ctx, level, def) {
    // The altar atop the Tor and its attendant (creating altar makes the priest).
    altarAt(ctx, level, def, 17, 5, A_NEUTRAL, true);
  },
};

// ---------------------------------------------------------------------------------------------
// Kni-goal: Ixoth's caverns

const GOAL_MAP: readonly string[] = [
  '....PPPP..PPP..                                                             ',
  '.PPPPP...PP..     ..........     .................................          ',
  '..PPPPP...P..    ...........    ...................................         ',
  '..PPP.......   ...........    ......................................        ',
  '...PPP.......    .........     ...............   .....................      ',
  '...........    ............    ............     ......................      ',
  '............   .............      .......     .....................         ',
  '..............................            .........................         ',
  '...............................   ..................................        ',
  '.............................    ....................................       ',
  '.........    ......................................................         ',
  '.....PP...    .....................................................         ',
  '.....PPP....    ....................................................        ',
  '......PPP....   ..............   ....................................       ',
  '.......PPP....  .............    .....................................      ',
  '........PP...    ............    ......................................     ',
  '...PPP........     ..........     ..................................        ',
  '..PPPPP........     ..........     ..............................           ',
  '....PPPPP......       .........     ..........................              ',
  '.......PPPP...                                                              ',
];

/** ref: dat/Kni-goal.lua */
export const KNI_GOAL: LevelDef = {
  id: 'nh:kni-goal',
  // des.level_init({ style = "solidfill", fg = " " }) (lit omitted: the coin flip is drawn)
  init: { style: 'solidfill', fg: 'nh:stone' },
  map: { rows: [...GOAL_MAP] },
  // Dungeon Description
  regions: [lit(0, 0, 14, 19), unlit(15, 0, 75, 19)],
  stairs: { up: { x: 3, y: 8 } },
  // after the Magic Mirror of Merlin (the fixup makes it first)
  contents: [
    ...[33, 34, 35].flatMap((x) => [1, 2, 3, 4, 5].map((y) => obj(x, y))),
    ...times(6, obj()),
    // Random traps
    trap(TRAP.spikedPit, 13, 7),
    trap(TRAP.spikedPit, 12, 8),
    trap(TRAP.spikedPit, 12, 9),
    ...times(5, trap()),
    // Random monsters.
    hostile('nh:ixoth', 50, 6),
    ...times(16, hostile(QUASIT)),
    ...times(2, cls('i', false)),
    ...times(8, hostile(JELLY)),
    cls('j', false),
  ],
};

const GOAL_FIXUP: SpLevFixup = {
  contents(ctx, level, def) {
    questArtifact(ctx, level, def, 'nh:mirror', 50, 6, 0, 'The Magic Mirror of Merlin');
    makeContents(ctx, level, def, def.contents ?? []);
  },
};

// ---------------------------------------------------------------------------------------------
// the fillers

/** ref: dat/Kni-fila.lua: between the home and the locate level */
export const KNI_FILA: LevelDef = {
  id: 'nh:kni-fila',
  init: SWAMP_INIT,
  contents: [
    ...times(8, obj()),
    ...times(4, hostile(QUASIT)),
    cls('i', false),
    hostile(JELLY),
    ...times(4, trap()),
  ],
};

/** ref: dat/Kni-filb.lua: between the locate and the goal level */
export const KNI_FILB: LevelDef = {
  id: 'nh:kni-filb',
  init: SWAMP_INIT,
  contents: [
    ...times(11, obj()),
    ...times(4, hostile(QUASIT)),
    cls('i', false),
    ...times(3, hostile(JELLY)),
    ...times(4, trap()),
  ],
};

/** The Knight's five levels. */
export const KNI_LEVELS: readonly LevelDef[] = [KNI_STRT, KNI_LOCA, KNI_GOAL, KNI_FILA, KNI_FILB];

/** Their fixups, by LevelDef id. */
export const KNI_FIXUPS: Readonly<Record<DefId, SpLevFixup>> = {
  [KNI_STRT.id]: STRT_FIXUP,
  [KNI_LOCA.id]: LOCA_FIXUP,
  [KNI_GOAL.id]: GOAL_FIXUP,
};
