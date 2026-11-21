// The Ranger's quest: Orion's camp in the middle of a forest of concentric paths, besieged by
// centaurs (home), the cave of the wumpus (locate), Scorpius's throne among the centaurs with
// the Longbow of Diana (goal), and the forest and cave fillers above and below the locate level.
// ref: dat/Ran-strt.lua, Ran-loca.lua, Ran-goal.lua, Ran-fila.lua, Ran-filb.lua
//
// Translation notes (DEVIATIONS.md "Quest levels (m24b)"): maps, lit regions, fixed stairs,
// doors and contents are LevelDef data; "mazelevel", "noteleport", "hardfloor" and the
// non-diggable areas are levelflags.ts entries ("noflip" needs nothing; "arboreal", stone drawn
// as trees, is not ported). Fixups, in the script's order: Ran-strt's woods
// (des.replace_terrain() over the whole lit field before its map: drawn for every cell of the
// field, a tree kept only where the map does not cover it), Orion's custom inventory and the
// branch levregion anywhere on the right-hand side of the level (the portal), placed last as
// fixup_special() does; Ran-goal's Longbow of Diana (blessed, named through onameItem()) and
// des.wallify() at the end. Ran-fila's mines-style map has trees for background: C's
// wallify_map() walls only stone, so it gets no walls.
import type { Ctx, DefId, Level, LevelDef, LevelRect, RegionDef } from '@nh/core';
import { eachSel, selArea, setTer } from '../selection';
import { desLevregion, makeContents, mapToLevel, type SpLevFixup } from '../sp_lev';
import { T } from '../terrain';
import { TRAP } from '../trap';
import {
  cls,
  hostile,
  mon,
  monWithInventory,
  obj,
  questArtifact,
  times,
  trap,
  wallifyMap,
} from './common';

const FOREST = 'nh:forest_centaur';
const PLAINS = 'nh:plains_centaur';
const MOUNTAIN = 'nh:mountain_centaur';
const SCORPION = 'nh:scorpion';
const lit = (x1: number, y1: number, x2: number, y2: number): RegionDef => ({
  area: [x1, y1, x2, y2],
  lit: true,
});

// ---------------------------------------------------------------------------------------------
// Ran-strt: the home level

const STRT_MAP: readonly string[] = [
  '                                       xx',
  '   ...................................  x',
  '  ..                                 ..  ',
  ' ..  ...............F...............  .. ',
  ' .  ..             .F.             ..  . ',
  ' . ..  .............F.............  .. . ',
  ' . .  ..                         ..  . . ',
  ' . . ..  .......................  .. ... ',
  ' . . .  ..                     ..  .     ',
  ' ... . ..  .|..................... ......',
  ' FFF . .  ..S..................          ',
  ' ... . ..  .|.................  .... ... ',
  ' . . .  ..                     ..  . . . ',
  ' . . ..  .......................  .. . . ',
  ' . .  ..                         ..  . . ',
  ' . ..  .............F.............  .. . ',
  ' .  ..             .F.             ..  . ',
  ' ..  ...............F...............  .. ',
  '  ..                                 ..  ',
  '   ...................................  x',
  '                                       xx',
];

/** ref: dat/Ran-strt.lua */
export const RAN_STRT: LevelDef = {
  id: 'nh:ran-strt',
  // des.level_init({ style = "mines", fg = ".", bg = ".", smoothed, joined, lit = 1 }): a lit
  // field (the solidfill before it is not drawn)
  init: {
    style: 'mines',
    fg: 'nh:floor',
    bg: 'nh:floor',
    smoothed: true,
    joined: true,
    lit: true,
    walled: false,
  },
  map: { rows: [...STRT_MAP], halign: 'left', valign: 'center' },
  // Dungeon Description
  regions: [lit(0, 0, 40, 20)],
  stairs: { down: { x: 10, y: 10 } },
  // after Orion (the fixup makes him with his inventory first)
  contents: [
    // The treasure of Orion
    { kind: 'object', id: 'nh:chest', x: 20, y: 10 },
    // Guards for the audience chamber
    ...(
      [
        [19, 9],
        [20, 9],
        [21, 9],
        [19, 10],
        [21, 10],
        [19, 11],
        [20, 11],
        [21, 11],
      ] as const
    ).map(([x, y]) => mon('nh:hunter', x, y)),
    // Traps
    trap(TRAP.arrow, 30, 9),
    trap(TRAP.arrow, 30, 10),
    trap(TRAP.pit, 40, 9),
    trap(TRAP.spikedPit),
    trap(TRAP.bear),
    trap(TRAP.bear),
    // Monsters on siege duty.
    { ...hostile('nh:minotaur', 33, 9), asleep: true },
    ...(
      [
        [19, 3],
        [19, 4],
        [19, 5],
        [21, 3],
        [21, 4],
        [21, 5],
        [1, 9],
        [2, 9],
        [3, 9],
        [1, 11],
        [2, 11],
        [3, 11],
        [19, 15],
        [19, 16],
        [19, 17],
        [21, 15],
        [21, 16],
        [21, 17],
      ] as const
    ).map(([x, y]) => hostile(FOREST, x, y)),
    ...times(6, hostile(PLAINS)),
    ...times(2, hostile(SCORPION)),
  ],
};

/** Ran-strt's branch levregion {51,2,77,18} (region_islev), in Level coordinates (NetHack x - 1). */
export const RAN_STRT_BRANCH: LevelRect = [50, 2, 76, 18];

/**
 * des.replace_terrain({ region = {00,00,76,19}, fromterrain = ".", toterrain = "T", chance = 5 })
 * before the map, on a field all floor: every cell of the region draws `rn2(100)` (columns then
 * rows), and a tree stays where the map laid after it keeps the field (its 'x' and the cells off
 * it). The region is in Level coordinates (no map yet: NetHack's xstart 1, so x - 1 here).
 * ref: src/sp_lev.c lspo_replace_terrain()
 */
function woodsBeforeMap(ctx: Ctx, level: Level, def: LevelDef): void {
  const o = mapToLevel(def, level, 0, 0);
  eachSel(level, selArea(level, 0, 0, 76, 19), (x, y) => {
    if (ctx.rng.rn2(100) >= 5) return;
    const ch = STRT_MAP[y - o.y]?.[x - o.x];
    if (ch === undefined || ch === 'x') setTer(level, x, y, T.tree);
  });
}

const STRT_FIXUP: SpLevFixup = {
  before(ctx, level, def) {
    woodsBeforeMap(ctx, level, def);
  },
  contents(ctx, level, def) {
    monWithInventory(ctx, level, def, 'nh:orion', 20, 10, [
      ['nh:leather_armor', 4],
      ['nh:yumi', 4],
      ['nh:ya', 4, { quantity: 50 }],
    ]);
    makeContents(ctx, level, def, def.contents ?? []);
  },
  after(ctx, level) {
    // Portal arrival point; just about anywhere on the right hand side of the map
    desLevregion(ctx, level, 'branch', RAN_STRT_BRANCH, null);
  },
};

// ---------------------------------------------------------------------------------------------
// Ran-loca: the cave of the wumpus

const LOCA_MAP: readonly string[] = [
  '              .......  .........  .......              ',
  '     ...................       ...................     ',
  '  ....        .......             .......        ....  ',
  '...    .....     .       .....       .     .....    ...',
  '.   .......... .....  ...........  ..... ..........   .',
  '.  ..  ..... ..........  .....  .......... .....  ..  .',
  '.  .     .     .....       .       .....     .     .  .',
  '.  .   .....         .............         .....   .  .',
  '.  .  ................  .......  ................  .  .',
  '.  .   .....            .......            .....   .  .',
  '.  .     .    ......               ......    .     .  .',
  '.  .     ...........   .........   ...........     .  .',
  '.  .          ..........       ..........          .  .',
  '.  ..  .....     .       .....       .     .....  ..  .',
  '.   .......... .....  ...........  ..... ..........   .',
  '.      ..... ..........  .....  .......... .....      .',
  '.        .     .....       .       .....     .        .',
  '...   .......           .......           .......   ...',
  '  ..............     .............     ..............  ',
  '      .......  .......  .......  .......  .......      ',
];

/** ref: dat/Ran-loca.lua */
export const RAN_LOCA: LevelDef = {
  id: 'nh:ran-loca',
  init: { style: 'solidfill', fg: 'nh:stone' },
  map: { rows: [...LOCA_MAP] },
  // Dungeon Description
  regions: [lit(0, 0, 54, 19)],
  stairs: { up: { x: 25, y: 5 }, down: { x: 27, y: 18 } },
  contents: [
    // Objects
    ...times(8, obj()),
    // Random traps
    ...times(2, trap(TRAP.spikedPit)),
    ...times(2, trap(TRAP.tele)),
    ...times(2, trap(TRAP.arrow)),
    // Random monsters.
    { ...hostile('nh:wumpus', 27, 18), asleep: true },
    ...times(4, hostile('nh:giant_bat')),
    ...times(4, hostile(FOREST)),
    ...times(8, hostile(MOUNTAIN)),
    ...times(4, hostile(SCORPION)),
    ...times(2, cls('s', false)),
  ],
};

// ---------------------------------------------------------------------------------------------
// Ran-goal: Scorpius's throne

const GOAL_MAP: readonly string[] = [
  '                                                                            ',
  '  ...                                                                  ...  ',
  ' .......................................................................... ',
  '  ...                                +                                 ...  ',
  '   .     ............     .......    .                   .......        .   ',
  '   .  .............................  .       ........   .........S..    .   ',
  '   .   ............    .  ......     .       .      .    .......   ..   .   ',
  '   .     .........     .   ....      +       . ...  .               ..  .   ',
  '   .        S          .         .........   .S.    .S...............   .   ',
  '   .  ...   .     ...  .         .........          .                   .   ',
  '   . ........    .....S.+.......+....\\....+........+.                   .   ',
  '   .  ...         ...    S       .........           ..      .....      .   ',
  '   .                    ..       .........            ..      ......    .   ',
  '   .      .......     ...            +       ....    ....    .......... .   ',
  '   . ..............  ..              .      ......  ..  .............   .   ',
  '   .     .............               .     ..........          ......   .   ',
  '  ...                                +                                 ...  ',
  ' .......................................................................... ',
  '  ...                                                                  ...  ',
  '                                                                            ',
];

/** ref: dat/Ran-goal.lua */
export const RAN_GOAL: LevelDef = {
  id: 'nh:ran-goal',
  init: { style: 'solidfill', fg: 'nh:stone' },
  map: { rows: [...GOAL_MAP] },
  // Dungeon Description
  regions: [lit(0, 0, 75, 19)],
  stairs: { up: { x: 19, y: 10 } },
  doors: [
    { x: 12, y: 8, state: 'locked' },
    { x: 22, y: 10, state: 'closed' },
    { x: 24, y: 10, state: 'locked' },
    { x: 25, y: 11, state: 'closed' },
    { x: 32, y: 10, state: 'closed' },
    { x: 37, y: 3, state: 'closed' },
    { x: 37, y: 7, state: 'closed' },
    { x: 37, y: 13, state: 'closed' },
    { x: 37, y: 16, state: 'closed' },
    { x: 42, y: 10, state: 'closed' },
    { x: 46, y: 8, state: 'locked' },
    { x: 51, y: 10, state: 'closed' },
    { x: 53, y: 8, state: 'locked' },
    { x: 65, y: 5, state: 'closed' },
  ],
  // after the Longbow of Diana (the fixup makes it first)
  contents: [
    { kind: 'object', id: 'nh:chest', x: 37, y: 10 },
    ...(
      [
        [36, 9],
        [36, 10],
        [36, 11],
        [37, 9],
        [37, 11],
        [38, 9],
        [38, 10],
        [38, 11],
      ] as const
    ).map(([x, y]) => obj(x, y)),
    ...times(5, obj()),
    // Random traps
    ...times(6, trap()),
    // Random monsters.
    hostile('nh:scorpius', 37, 10),
    ...(
      [
        [FOREST, 36, 9],
        [FOREST, 36, 10],
        [FOREST, 36, 11],
        [FOREST, 37, 9],
        [FOREST, 37, 11],
        [FOREST, 38, 9],
        [MOUNTAIN, 38, 10],
        [MOUNTAIN, 38, 11],
        [MOUNTAIN, 2, 2],
        [MOUNTAIN, 71, 2],
        [MOUNTAIN, 2, 16],
        [MOUNTAIN, 71, 16],
      ] as const
    ).map(([id, x, y]) => hostile(id, x, y)),
    ...times(2, hostile(FOREST)),
    ...times(2, hostile(MOUNTAIN)),
    ...times(2, cls('C', false)),
    ...(
      [
        [3, 2],
        [72, 2],
        [3, 17],
        [72, 17],
        [41, 10],
        [33, 9],
      ] as const
    ).map(([x, y]) => hostile(SCORPION, x, y)),
    ...times(2, hostile(SCORPION)),
    cls('s', false),
  ],
};

const GOAL_FIXUP: SpLevFixup = {
  contents(ctx, level, def) {
    questArtifact(ctx, level, def, 'nh:bow', 37, 10, 0, 'The Longbow of Diana');
    makeContents(ctx, level, def, def.contents ?? []);
  },
  after(_ctx, level, def) {
    wallifyMap(level, def);
  },
};

// ---------------------------------------------------------------------------------------------
// the fillers

/** ref: dat/Ran-fila.lua: between the home and the locate level (a forest) */
export const RAN_FILA: LevelDef = {
  id: 'nh:ran-fila',
  // des.level_init({ style = "mines", fg = ".", bg = "T", smoothed, joined, walled }) (lit
  // omitted: the coin flip is drawn); `walled` makes no walls of trees (wallify_map() walls
  // stone only)
  init: {
    style: 'mines',
    fg: 'nh:floor',
    bg: 'nh:tree',
    smoothed: true,
    joined: true,
    walled: false,
  },
  contents: [
    ...times(7, obj()),
    ...times(4, trap()),
    ...times(2, hostile(MOUNTAIN)),
    ...times(3, hostile(FOREST)),
    cls('C', false),
    hostile(SCORPION),
  ],
};

/** ref: dat/Ran-filb.lua: between the locate and the goal level (a cave) */
export const RAN_FILB: LevelDef = {
  id: 'nh:ran-filb',
  // (lit omitted: the coin flip is drawn)
  init: {
    style: 'mines',
    fg: 'nh:floor',
    bg: 'nh:stone',
    smoothed: true,
    joined: true,
    walled: true,
  },
  contents: [
    ...times(11, obj()),
    ...times(4, trap()),
    ...times(4, hostile(MOUNTAIN)),
    cls('C', false),
    ...times(2, hostile(SCORPION)),
  ],
};

/** The Ranger's five levels. */
export const RAN_LEVELS: readonly LevelDef[] = [RAN_STRT, RAN_LOCA, RAN_GOAL, RAN_FILA, RAN_FILB];

/** Their fixups, by LevelDef id. */
export const RAN_FIXUPS: Readonly<Record<DefId, SpLevFixup>> = {
  [RAN_STRT.id]: STRT_FIXUP,
  [RAN_GOAL.id]: GOAL_FIXUP,
};
