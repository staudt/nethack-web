// The Priest's quest: the Great Temple on a wooded field, besieged by human zombies (home), the
// temple of Moloch among the morgues of the great graveyard (locate), Nalzok's lava field with
// the Mitre of Holiness (goal), and the room-and-corridor fillers with their morgues above and
// below the locate level. Every one of the five is a graveyard level: fixup_special() flags any
// quest level a Priest is on ("less chance for undead corpses"), and only a Priest gets these.
// ref: dat/Pri-strt.lua, Pri-loca.lua, Pri-goal.lua, Pri-fila.lua, Pri-filb.lua; src/mkmaze.c
// fixup_special()
//
// Translation notes (DEVIATIONS.md "Quest levels (m24b)"): maps, lit regions, the temples, the
// morgues (zoo.ts stocks them), des.replace_terrain() (the woods), fixed stairs, doors, the home
// level's unaligned altar and contents are LevelDef data; "mazelevel", "noteleport", "hardfloor"
// and the non-diggable areas are levelflags.ts entries ("noflip" needs nothing). Pri-loca's
// irregular temple is a TEMPLE room on its flood fill's rectangle (its walls and doors are its
// edge, so core's lit rectangle is the flood fill's lighting). Fixups, in the script's order:
// Pri-strt's open field (des.terrain({05,04}, ".") then selection.floodfill(05,04)), the Arch
// Priest's custom inventory, the dart traps and the human zombies on its spots (rndcoord(1)
// each); Pri-loca's unaligned shrine with its priest (priestini() with the altar) and its up
// stairs off the map (a placeholder on map floor until then); Pri-goal's spot (`math.random(1,
// #place)`) for the Mitre of Holiness (blessed, erodeproof, named through onameItem()) and
// Nalzok; the home level's branch levregion (the portal), placed last as fixup_special() does,
// and every level's graveyard flag.
import type { DefId, LevelContent, LevelDef, Pos, RegionDef, RoomDef } from '@nh/core';
import { A_NONE } from '../aligntyp';
import { TEMPLE } from '../epri';
import { setGraveyard } from '../graveyard';
import { selFloodfill, selRndcoord, setTer } from '../selection';
import { desStair, makeContents, mapToLevel, type SpLevFixup } from '../sp_lev';
import { T } from '../terrain';
import { TRAP } from '../trap';
import { MORGUE } from '../zoo';
import {
  altarAt,
  branchAt,
  cls,
  liftUpPlaceholder,
  mon,
  monWithInventory,
  obj,
  questArtifact,
  times,
  trap,
} from './common';

const ZOMBIE = 'nh:human_zombie';
const WRAITH = 'nh:wraith';
const lit = (x1: number, y1: number, x2: number, y2: number): RegionDef => ({
  area: [x1, y1, x2, y2],
  lit: true,
});
/** A content entry at a Level spot. */
const atLevel = (c: LevelContent, p: Pos | null): LevelContent =>
  p === null ? c : { ...c, x: p.x, y: p.y, coords: 'level' };

/** fixup_special(): `else if (Role_if(PM_CLERIC) && In_quest(&u.uz)) graveyard = 1`. */
const graveyard: NonNullable<SpLevFixup['after']> = (ctx, level) => setGraveyard(ctx, level.id);

// ---------------------------------------------------------------------------------------------
// Pri-strt: the home level

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

/** ref: dat/Pri-strt.lua */
export const PRI_STRT: LevelDef = {
  id: 'nh:pri-strt',
  // des.level_init({ style = "solidfill", fg = " " }) (lit omitted: the coin flip is drawn)
  init: { style: 'solidfill', fg: 'nh:stone' },
  map: { rows: [...STRT_MAP] },
  // Dungeon Description (the temple's filled = 2: the room kind only)
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
  // after the Arch Priest (the fixup makes him with his inventory first)
  contents: [
    // The treasure of High Priest
    { kind: 'object', id: 'nh:chest', x: 27, y: 10 },
    // knight guards for the audience chamber
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
    ).map(([x, y]) => mon('nh:acolyte', x, y)),
  ],
};

const STRT_FIXUP: SpLevFixup = {
  contents(ctx, level, def) {
    // des.terrain({05,04}, "."); local spacelocs = selection.floodfill(05,04)
    const b = mapToLevel(def, level, ...STRT_BRANCH);
    setTer(level, b.x, b.y, T.floor);
    const spacelocs = selFloodfill(level, b.x, b.y);
    // High Priest
    monWithInventory(ctx, level, def, 'nh:arch_priest', 28, 10, [
      ['nh:robe', 4],
      ['nh:mace', 4],
    ]);
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
    for (let i = 1; i <= 12; i++) makeContents(ctx, level, def, [atLevel(mon(ZOMBIE), space())]);
  },
  after(ctx, level, def) {
    // Portal arrival point: des.levregion({ region = {05,04,05,04}, type="branch" })
    branchAt(ctx, level, def, ...STRT_BRANCH);
    graveyard(ctx, level, def);
  },
};

// ---------------------------------------------------------------------------------------------
// Pri-loca: the temple of Moloch in the graveyard

const LOCA_MAP: readonly string[] = [
  '........................................',
  '........................................',
  '..........----------+----------.........',
  '..........|........|.|........|.........',
  '..........|........|.|........|.........',
  '..........|----.----.----.----|.........',
  '..........+...................+.........',
  '..........+...................+.........',
  '..........|----.----.----.----|.........',
  '..........|........|.|........|.........',
  '..........|........|.|........|.........',
  '..........----------+----------.........',
  '........................................',
  '........................................',
];

/** des.stair("up", 43,05): "intentionally" off the map; core first puts them on map floor. */
const LOCA_UP = { x: 43, y: 5 } as const;
const LOCA_UP_PLACEHOLDER = { x: 39, y: 0 } as const;

/** ref: dat/Pri-loca.lua */
export const PRI_LOCA: LevelDef = {
  id: 'nh:pri-loca',
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
  map: { rows: [...LOCA_MAP] },
  // Dungeon Description: the four morgues around the temple; the temple is irregular, the
  // rectangle of its flood fill from {11,03} (the whole inside of its walls)
  regions: [
    { area: [0, 0, 9, 13], lit: false, type: MORGUE, filled: true },
    { area: [9, 0, 30, 1], lit: false, type: MORGUE, filled: true },
    { area: [9, 12, 30, 13], lit: false, type: MORGUE, filled: true },
    { area: [31, 0, 39, 13], lit: false, type: MORGUE, filled: true },
    { area: [11, 3, 29, 10], lit: true, type: TEMPLE, filled: true },
  ],
  doors: [
    { x: 10, y: 6, state: 'locked' },
    { x: 10, y: 7, state: 'locked' },
    { x: 20, y: 2, state: 'locked' },
    { x: 20, y: 11, state: 'locked' },
    { x: 30, y: 6, state: 'locked' },
    { x: 30, y: 7, state: 'locked' },
  ],
  // the up stairs lie off the map: core first puts them on a map floor placeholder
  stairs: { up: { ...LOCA_UP_PLACEHOLDER }, down: { x: 20, y: 6 } },
  // after the shrine and its priest (the fixup makes them first)
  contents: [
    { kind: 'monster', id: 'nh:aligned_cleric', x: 20, y: 7, align: 'noalign', peaceful: false },
    // Objects (inside the antechambers).
    ...(
      [
        [14, 3],
        [15, 3],
        [16, 3],
        [14, 10],
        [15, 10],
        [16, 10],
        [17, 10],
        [24, 3],
        [25, 3],
        [26, 3],
        [27, 3],
        [24, 10],
        [25, 10],
        [26, 10],
        [27, 10],
      ] as const
    ).map(([x, y]) => obj(x, y)),
    // Random traps
    ...(
      [
        [15, 4],
        [25, 4],
        [15, 9],
        [25, 9],
      ] as const
    ).map(([x, y]) => trap(undefined, x, y)),
    ...times(2, trap()),
    // No random monsters - the morgue generation will put them in.
  ],
};

const LOCA_FIXUP: SpLevFixup = {
  before(ctx, level, def) {
    // The altar inside the temple: des.altar({ x=20,y=07, align="noalign", type="shrine" })
    altarAt(ctx, level, def, 20, 7, A_NONE, true);
    // Stairs: "The up stairs are *intentionally* off of the map."
    liftUpPlaceholder(level, def, LOCA_UP_PLACEHOLDER);
    desStair(ctx, level, 'up', mapToLevel(def, level, LOCA_UP.x, LOCA_UP.y));
  },
  after: graveyard,
};

// ---------------------------------------------------------------------------------------------
// Pri-goal: Nalzok's lava field

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

/** ref: dat/Pri-goal.lua */
export const PRI_GOAL: LevelDef = {
  id: 'nh:pri-goal',
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
  // after the Mitre of Holiness (the fixup makes it first), before Nalzok
  contents: [
    ...times(14, obj()),
    // Random traps
    ...times(4, trap(TRAP.fire)),
    ...times(2, trap()),
  ],
};

/** After Nalzok. */
const GOAL_LATER: readonly LevelContent[] = [
  ...times(16, mon(ZOMBIE)),
  ...times(2, cls('Z')),
  ...times(8, mon(WRAITH)),
  cls('W'),
];

const GOAL_FIXUP: SpLevFixup = {
  contents(ctx, level, def) {
    // local placeidx = math.random(1, #place)
    const [x, y] = GOAL_PLACES[ctx.rng.rn2(GOAL_PLACES.length)] ?? [14, 4];
    // Objects [note: eroded=-1 => obj->oerodeproof=1]
    const mitre = questArtifact(
      ctx,
      level,
      def,
      'nh:helm_of_brilliance',
      x,
      y,
      0,
      'The Mitre of Holiness',
    );
    const it = mitre === null ? undefined : ctx.state.entities[String(mitre)]?.c.item;
    if (it) it.erodeproof = true;
    makeContents(ctx, level, def, def.contents ?? []);
    // Random monsters.
    makeContents(ctx, level, def, [mon('nh:nalzok', x, y), ...GOAL_LATER]);
  },
  after: graveyard,
};

// ---------------------------------------------------------------------------------------------
// the fillers

/** des.room({ type = "ordinary" or "morgue", contents }). */
const room = (stairs: 'up' | 'down' | null, contents: LevelContent[], morgue = false): RoomDef => ({
  ...(stairs ? { stairs: [stairs] } : {}),
  ...(morgue ? { type: MORGUE } : {}),
  contents,
});

/**
 * The fillers' six des.room() rooms, two or three of them morgues (stocked by zoo.ts), placed as
 * random rooms, with random corridors. As the Oracle's level, the level starts as dark stone.
 * ref: dat/Pri-fila.lua, Pri-filb.lua
 */
function filler(id: DefId, rooms: RoomDef[]): LevelDef {
  return {
    id,
    init: { style: 'solidfill', fg: 'nh:stone', lit: false },
    rooms,
    corridors: 'random',
  };
}

/** ref: dat/Pri-fila.lua: between the home and the locate level */
export const PRI_FILA: LevelDef = filler('nh:pri-fila', [
  room('up', [obj(), mon(ZOMBIE)]),
  room(null, [obj(), obj()]),
  room(null, [obj(), trap(), obj(), mon(ZOMBIE)]),
  room('down', [obj(), trap()], true),
  room(null, [obj(), obj(), trap(), mon(WRAITH)]),
  room(null, [obj(), trap()], true),
]);

/** ref: dat/Pri-filb.lua: between the locate and the goal level */
export const PRI_FILB: LevelDef = filler('nh:pri-filb', [
  room('up', [obj(), mon(ZOMBIE), mon(WRAITH)]),
  room(null, [obj(), obj(), obj()], true),
  room(null, [obj(), trap(), obj(), mon(ZOMBIE), mon(WRAITH)]),
  room('down', [obj(), obj(), trap()], true),
  room(null, [obj(), obj(), trap(), mon(ZOMBIE), mon(WRAITH)]),
  room(null, [obj(), trap()], true),
]);

/** The Priest's five levels. */
export const PRI_LEVELS: readonly LevelDef[] = [PRI_STRT, PRI_LOCA, PRI_GOAL, PRI_FILA, PRI_FILB];

/** Their fixups, by LevelDef id: every one sets the graveyard flag. */
export const PRI_FIXUPS: Readonly<Record<DefId, SpLevFixup>> = {
  [PRI_STRT.id]: STRT_FIXUP,
  [PRI_LOCA.id]: LOCA_FIXUP,
  [PRI_GOAL.id]: GOAL_FIXUP,
  [PRI_FILA.id]: { after: graveyard },
  [PRI_FILB.id]: { after: graveyard },
};
