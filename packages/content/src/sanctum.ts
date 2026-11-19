// Moloch's Sanctum: Gehennom's last level, below the vibrating square, with Moloch's temple
// (its high priest holds the Amulet of Yendor), the ring of fire traps around it, a morgue and
// Moloch's horde of roaming priests. ref: dat/sanctum.lua
//
// Translation notes (DEVIATIONS.md "Moloch's Sanctum (m23)"): pure LevelDef data and one fixup.
// The temple is `filled = 2` (typed, not stocked); its shrine is a high altar (highaltar.ts) and
// gets its high priest as any temple's shrine does (priest.ts templePriests()). The temple's
// secret door on a random wall (the region's contents) is the fixup's, made after the priest
// (C: before him). The irregular morgue is the rectangle its flood fill from {41,06} covers
// (as the Valley's), which also takes in one floor square of the corridor east of it. The nine
// aligned clerics with `align = "noalign"` are roaming priests of Moloch (sp_lev.ts
// createMonster() -> priest.ts mkRoamer()). The flags ("mazelevel", "noteleport", "hardfloor",
// "nommap"), the non-diggable map and the invisible barrier between the halves are levelflags.ts
// entries. Until the invocation (m23 step 4) the level is reached only by wizard mode's
// levelport.
import type { DefId, LevelContent, LevelDef } from '@nh/core';
import { TEMPLE } from './epri';
import { GEHENNOM_SPECIALS } from './levelflags';
import { desRoomDoor, mapToLevel, orientDoors, type SpLevFixup } from './sp_lev';
import { MORGUE } from './zoo';

/** ref: dat/sanctum.lua des.map() */
const MAP: readonly string[] = [
  '----------------------------------------------------------------------------',
  '|             --------------                                               |',
  '|             |............|             -------                           |',
  '|       -------............-----         |.....|                           |',
  '|       |......................|        --.....|            ---------      |',
  '|    ----......................---------|......----         |.......|      |',
  '|    |........---------..........|......+.........|     ------+---..|      |',
  '|  ---........|.......|..........--S----|.........|     |........|..|      |',
  '|  |..........|.......|.............|   |.........-------..----------      |',
  '|  |..........|.......|..........----   |..........|....|..|......|        |',
  '|  |..........|.......|..........|      --.......----+---S---S--..|        |',
  '|  |..........---------..........|       |.......|.............|..|        |',
  '|  ---...........................|       -----+-------S---------S---       |',
  '|    |...........................|          |...| |......|    |....|--     |',
  '|    ----.....................----          |...---....---  ---......|     |',
  '|       |.....................|             |..........|    |.....----     |',
  '|       -------...........-----             --...-------    |.....|        |',
  '|             |...........|                  |...|          |.....|        |',
  '|             -------------                  -----          -------        |',
  '----------------------------------------------------------------------------',
];

const trap = (id: string, x?: number, y?: number): LevelContent =>
  x === undefined || y === undefined
    ? { kind: 'trap', id: id as DefId }
    : { kind: 'trap', id: id as DefId, x, y };
const obj = (cls: string): LevelContent => ({ kind: 'object', class: cls });
const hostile = (id: string, x: number, y: number): LevelContent => ({
  kind: 'monster',
  id: id as DefId,
  x,
  y,
  peaceful: false,
});
const cls = (c: string): LevelContent => ({ kind: 'monster', class: c });

/** The ring of fire around the temple: rows 5 and 12 (x 13..23), columns 13 and 23 (y 6..11). */
const FIRE_RING: readonly (readonly [number, number])[] = [
  ...Array.from({ length: 11 }, (_, i) => [13 + i, 5] as const),
  ...Array.from({ length: 11 }, (_, i) => [13 + i, 12] as const),
  ...Array.from({ length: 6 }, (_, i) => [13, 6 + i] as const),
  ...Array.from({ length: 6 }, (_, i) => [23, 6 + i] as const),
];

/** Moloch's horde: aligned clerics of no god (mk_roamer()), hostile. */
const HORDE: readonly (readonly [number, number])[] = [
  [20, 3],
  [15, 4],
  [11, 5],
  [11, 7],
  [11, 9],
  [11, 12],
  [15, 13],
  [17, 13],
  [21, 13],
];

/** The temple's inside, map-relative. */
const TEMPLE_AREA = [15, 7, 21, 10] as const;

/** ref: dat/sanctum.lua */
export const SANCTUM: LevelDef = {
  id: GEHENNOM_SPECIALS.sanctum,
  // des.level_init({ style = "solidfill", fg = " " })
  init: { style: 'solidfill', fg: 'nh:stone' },
  map: { rows: [...MAP] },
  regions: [
    { area: [...TEMPLE_AREA], lit: true, type: TEMPLE, filled: false },
    // irregular: the rectangle of its flood fill from {41,06}
    { area: [41, 3, 50, 11], lit: false, type: MORGUE, filled: true },
  ],
  // the up stairs; Gehennom's bottom has no down stairs
  stairs: { up: { x: 63, y: 15 } },
  // "Teleporting to this level is allowed after the invocation creates its entrance. Force
  // arrival in that case to be on rightmost third of level." (region_islev {54,1,79,18})
  teleportRegions: [{ area: [53, 1, 78, 18], coords: 'level', dir: 'down' }],
  doors: [
    { x: 40, y: 6, state: 'closed' },
    { x: 62, y: 6, state: 'locked' },
    { x: 46, y: 12, state: 'closed' },
    { x: 53, y: 10, state: 'closed' },
  ],
  features: [{ kind: 'altar', x: 18, y: 8, align: 'noalign', shrine: true }],
  contents: [
    // Surround the temple with fire
    ...FIRE_RING.map(([x, y]) => trap('nh:fire_trap', x, y)),
    // Some traps.
    trap('nh:spiked_pit'),
    trap('nh:fire_trap'),
    trap('nh:sleeping_gas_trap'),
    trap('nh:anti_magic_field'),
    trap('nh:fire_trap'),
    trap('nh:magic_trap'),
    // Some random objects
    obj('armor'),
    obj('armor'),
    obj('armor'),
    obj('armor'),
    obj('weapon'),
    obj('weapon'),
    obj('gem'),
    obj('potion'),
    obj('potion'),
    obj('potion'),
    obj('potion'),
    obj('scroll'),
    obj('scroll'),
    obj('scroll'),
    obj('scroll'),
    obj('scroll'),
    // Some monsters.
    hostile('nh:horned_devil', 14, 12),
    hostile('nh:barbed_devil', 18, 8),
    hostile('nh:erinys', 10, 4),
    hostile('nh:marilith', 7, 9),
    hostile('nh:nalfeshnee', 27, 8),
    // Moloch's horde
    ...HORDE.map(([x, y]): LevelContent => ({
      kind: 'monster',
      id: 'nh:aligned_cleric',
      x,
      y,
      align: 'noalign',
      peaceful: false,
    })),
    // A few nasties
    cls('L'),
    cls('L'),
    cls('V'),
    cls('V'),
    cls('V'),
  ],
};

/**
 * The temple's secret door: des.door({ wall = "random", state = "secret" }) in the region's
 * contents. ref: dat/sanctum.lua; src/sp_lev.c create_door()
 */
export const SANCTUM_FIXUP: SpLevFixup = {
  before(ctx, level, def) {
    const a = mapToLevel(def, level, TEMPLE_AREA[0], TEMPLE_AREA[1]);
    const b = mapToLevel(def, level, TEMPLE_AREA[2], TEMPLE_AREA[3]);
    desRoomDoor(ctx, level, { lx: a.x, ly: a.y, hx: b.x, hy: b.y }, [
      'north',
      'south',
      'west',
      'east',
    ]);
    orientDoors(ctx, level);
  },
};
