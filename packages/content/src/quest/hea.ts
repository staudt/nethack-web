// The Healer's quest: Hippocrates's temple of healing on an island in the swamp, besieged by rats,
// eels, dragons and snakes (home), the swamp's chaotic temple (locate), the Cyclops's island
// with the Staff of Aesculapius (goal), and the swampy mines-style fillers above and below the
// locate level. ref: dat/Hea-strt.lua, Hea-loca.lua, Hea-goal.lua, Hea-fila.lua, Hea-filb.lua
//
// Translation notes (DEVIATIONS.md "Quest levels (m24b)"): maps, lit regions, the temple,
// des.replace_terrain() (the swamp's dry spots), fixed stairs, doors, the home level's altar and
// contents are LevelDef data; "mazelevel", "noteleport", "hardfloor" and the non-diggable areas
// are levelflags.ts entries ("noflip" needs nothing). A level script's des.level_init({ style =
// "solidfill" }) before its mines-style init is not drawn (as minefill's). Fixups, in the
// script's order: the locate level's chaotic shrine with its priest (priestini() with the altar),
// Hippocrates's custom inventory, the Staff of Aesculapius (blessed, named through onameItem())
// and the home level's branch levregion (the portal), placed last as fixup_special() does.
import type { DefId, LevelDef, RegionDef } from '@nh/core';
import { A_CHAOTIC } from '../aligntyp';
import { TEMPLE } from '../epri';
import { makeContents, type SpLevFixup } from '../sp_lev';
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

const RAT = 'nh:rabid_rat';
const EEL = 'nh:giant_eel';
const ELECTRIC_EEL = 'nh:electric_eel';
const SHARK = 'nh:shark';
const lit = (x1: number, y1: number, x2: number, y2: number): RegionDef => ({
  area: [x1, y1, x2, y2],
  lit: true,
});

// ---------------------------------------------------------------------------------------------
// Hea-strt: the home level

const STRT_MAP: readonly string[] = [
  'PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP',
  'PPPP........PPPP.....PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP.P..PPPPP......PPPPPPPP',
  'PPP..........PPPP...PPPPP.........................PPPP..PPPPP........PPPPPPP',
  'PP............PPPPPPPP..............................PPP...PPPP......PPPPPPPP',
  'P.....PPPPPPPPPPPPPPP................................PPPPPPPPPPPPPPPPPPPPPPP',
  'PPPP....PPPPPPPPPPPP...................................PPPPP.PPPPPPPPPPPPPPP',
  'PPPP........PPPPP.........-----------------------........PP...PPPPPPP.....PP',
  'PPP............PPPPP....--|.|......S..........S.|--.....PPPP.PPPPPPP.......P',
  'PPPP..........PPPPP.....|.S.|......-----------|S|.|......PPPPPP.PPP.......PP',
  'PPPPPP......PPPPPP......|.|.|......|...|......|.|.|.....PPPPPP...PP.......PP',
  'PPPPPPPPPPPPPPPPPPP.....+.|.|......S.\\.S......|.|.+......PPPPPP.PPPP.......P',
  'PPP...PPPPP...PPPP......|.|.|......|...|......|.|.|.......PPPPPPPPPPP.....PP',
  'PP.....PPP.....PPP......|.|S|-----------......|.S.|......PPPPPPPPPPPPPPPPPPP',
  'PPP..PPPPP...PPPP.......--|.S..........S......|.|--.....PPPPPPPPP....PPPPPPP',
  'PPPPPPPPPPPPPPPP..........-----------------------..........PPPPP..........PP',
  'PPPPPPPPPPPPPPPPP........................................PPPPPP............P',
  'PPP.............PPPP...................................PPP..PPPP..........PP',
  'PP...............PPPPP................................PPPP...PPPP........PPP',
  'PPP.............PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP....PPPPPP',
  'PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP',
];

/** ref: dat/Hea-strt.lua */
export const HEA_STRT: LevelDef = {
  id: 'nh:hea-strt',
  // des.level_init({ style = "solidfill", fg = " " }) (lit omitted: the coin flip is drawn)
  init: { style: 'solidfill', fg: 'nh:stone' },
  map: { rows: [...STRT_MAP] },
  edits: [{ replace: { from: 'P', to: '.', area: [1, 1, 74, 18], chance: 10 } }],
  // Dungeon Description
  regions: [lit(0, 0, 75, 19)],
  stairs: { down: { x: 37, y: 9 } },
  // altar for the Temple
  features: [{ kind: 'altar', x: 32, y: 9, align: 'neutral' }],
  doors: [
    { x: 24, y: 10, state: 'locked' },
    { x: 26, y: 8, state: 'closed' },
    { x: 27, y: 12, state: 'closed' },
    { x: 28, y: 13, state: 'locked' },
    { x: 35, y: 7, state: 'closed' },
    { x: 35, y: 10, state: 'locked' },
    { x: 39, y: 10, state: 'locked' },
    { x: 39, y: 13, state: 'closed' },
    { x: 46, y: 7, state: 'locked' },
    { x: 47, y: 8, state: 'closed' },
    { x: 48, y: 12, state: 'closed' },
    { x: 50, y: 10, state: 'locked' },
  ],
  // after Hippocrates (the fixup makes him with his inventory first)
  contents: [
    // The treasure of Hippocrates
    { kind: 'object', id: 'nh:chest', x: 37, y: 10 },
    // intern guards for the audience chamber
    ...(
      [
        [29, 8],
        [29, 9],
        [29, 10],
        [29, 11],
        [40, 9],
        [40, 10],
        [40, 11],
        [40, 13],
      ] as const
    ).map(([x, y]) => mon('nh:attendant', x, y)),
    // Random traps
    ...times(6, trap()),
    // Monsters on siege duty.
    ...times(10, mon(RAT)),
    mon(EEL),
    mon(SHARK),
    cls(';'),
    ...times(5, cls('D', false)),
    ...times(5, cls('S', false)),
  ],
};

const STRT_FIXUP: SpLevFixup = {
  contents(ctx, level, def) {
    monWithInventory(ctx, level, def, 'nh:hippocrates', 37, 10, [['nh:silver_dagger', 5]]);
    makeContents(ctx, level, def, def.contents ?? []);
  },
  after(ctx, level, def) {
    // Portal arrival point: des.levregion({ region = {04,12,04,12}, type="branch" })
    branchAt(ctx, level, def, 4, 12);
  },
};

// ---------------------------------------------------------------------------------------------
// Hea-loca: the locate level

const LOCA_MAP: readonly string[] = [
  'PPPPPPPPPPPPP.......PPPPPPPPPPP',
  'PPPPPPPP...............PPPPPPPP',
  'PPPP.....-------------...PPPPPP',
  'PPPPP....|.S.........|....PPPPP',
  'PPP......+.|.........|...PPPPPP',
  'PPP......+.|.........|..PPPPPPP',
  'PPPP.....|.S.........|..PPPPPPP',
  'PPPPP....-------------....PPPPP',
  'PPPPPPPP...............PPPPPPPP',
  'PPPPPPPPPPP........PPPPPPPPPPPP',
];

/** The swamp's mines-style map (lit). */
const SWAMP_INIT: LevelDef['init'] = {
  style: 'mines',
  fg: 'nh:floor',
  bg: 'nh:pool',
  smoothed: true,
  joined: true,
  lit: true,
  walled: false,
};

/** ref: dat/Hea-loca.lua */
export const HEA_LOCA: LevelDef = {
  id: 'nh:hea-loca',
  init: SWAMP_INIT,
  map: { rows: [...LOCA_MAP] },
  // Dungeon Description
  regions: [lit(0, 0, 30, 9), { area: [12, 3, 20, 6], lit: true, type: TEMPLE, filled: true }],
  doors: [
    { x: 9, y: 4, state: 'closed' },
    { x: 9, y: 5, state: 'closed' },
    { x: 11, y: 3, state: 'locked' },
    { x: 11, y: 6, state: 'locked' },
  ],
  stairs: { up: { x: 4, y: 4 }, down: { x: 20, y: 6 } },
  contents: [
    // Objects
    ...times(15, obj()),
    // Random traps
    ...times(6, trap()),
    // Random monsters.
    ...times(8, mon(RAT)),
    cls('r', false),
    ...times(5, mon(EEL)),
    ...times(2, mon(ELECTRIC_EEL)),
    mon('nh:kraken'),
    ...times(2, mon(SHARK)),
    ...times(2, cls(';', false)),
    ...times(5, cls('D', false)),
    ...times(9, cls('S', false)),
  ],
};

const LOCA_FIXUP: SpLevFixup = {
  before(ctx, level, def) {
    // Altar in the temple (a shrine: its priest is made with it)
    altarAt(ctx, level, def, 13, 5, A_CHAOTIC, true);
  },
};

// ---------------------------------------------------------------------------------------------
// Hea-goal: the Cyclops's island

const GOAL_MAP: readonly string[] = [
  '.P....................................PP.',
  'PP.......PPPPPPP....PPPPPPP....PPPP...PP.',
  '...PPPPPPP....PPPPPPP.....PPPPPP..PPP...P',
  '...PP..............................PPP...',
  '..PP..............................PP.....',
  '..PP..............................PPP....',
  '..PPP..............................PP....',
  '.PPP..............................PPPP...',
  '...PP............................PPP...PP',
  '..PPPP...PPPPP..PPPP...PPPPP.....PP...PP.',
  'P....PPPPP...PPPP..PPPPP...PPPPPPP...PP..',
  'PPP..................................PPP.',
];

/** ref: dat/Hea-goal.lua */
export const HEA_GOAL: LevelDef = {
  id: 'nh:hea-goal',
  init: { ...SWAMP_INIT, smoothed: false },
  map: { rows: [...GOAL_MAP] },
  // Dungeon Description
  regions: [lit(0, 0, 40, 11)],
  stairs: { up: { x: 39, y: 10 } },
  // after the Staff of Aesculapius (the fixup makes it first)
  contents: [
    { kind: 'object', id: 'nh:wand_of_lightning', x: 20, y: 6 },
    ...times(14, obj()),
    // Random traps
    ...times(6, trap()),
    // Random monsters.
    hostile('nh:cyclops', 20, 6),
    ...times(3, mon(RAT)),
    ...times(2, cls('r', false)),
    ...times(6, mon(EEL)),
    ...times(2, mon(ELECTRIC_EEL)),
    ...times(2, mon(SHARK)),
    cls(';', false),
    ...times(5, cls('D', false)),
    ...times(10, cls('S', false)),
  ],
};

const GOAL_FIXUP: SpLevFixup = {
  contents(ctx, level, def) {
    questArtifact(ctx, level, def, 'nh:quarterstaff', 20, 6, 0, 'The Staff of Aesculapius');
    makeContents(ctx, level, def, def.contents ?? []);
  },
};

// ---------------------------------------------------------------------------------------------
// the fillers

/** The fillers' swamp: unsmoothed (lit). */
const FILL_INIT: LevelDef['init'] = { ...SWAMP_INIT, smoothed: false };

/** ref: dat/Hea-fila.lua: between the home and the locate level */
export const HEA_FILA: LevelDef = {
  id: 'nh:hea-fila',
  init: FILL_INIT,
  contents: [
    ...times(8, obj()),
    mon(RAT),
    ...times(2, cls('r', false)),
    ...times(2, mon(EEL)),
    mon(ELECTRIC_EEL),
    ...times(4, cls('D', false)),
    ...times(3, cls('S', false)),
    ...times(4, trap()),
  ],
};

/** ref: dat/Hea-filb.lua: between the locate and the goal level */
export const HEA_FILB: LevelDef = {
  id: 'nh:hea-filb',
  init: FILL_INIT,
  contents: [
    ...times(11, obj()),
    ...times(2, mon(RAT)),
    ...times(2, cls('r', false)),
    ...times(5, mon(EEL)),
    ...times(2, mon(ELECTRIC_EEL)),
    ...times(4, cls('D', false)),
    ...times(3, cls('S', false)),
    ...times(4, trap()),
  ],
};

/** The Healer's five levels. */
export const HEA_LEVELS: readonly LevelDef[] = [HEA_STRT, HEA_LOCA, HEA_GOAL, HEA_FILA, HEA_FILB];

/** Their fixups, by LevelDef id. */
export const HEA_FIXUPS: Readonly<Record<DefId, SpLevFixup>> = {
  [HEA_STRT.id]: STRT_FIXUP,
  [HEA_LOCA.id]: LOCA_FIXUP,
  [HEA_GOAL.id]: GOAL_FIXUP,
};
