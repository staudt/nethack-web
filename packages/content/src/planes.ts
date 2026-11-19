// The Elemental Planes: the endgame dungeon above DL1, entered only with the Amulet of Yendor by
// DL1's up stairs (endgame.ts). Earth, Fire, Air and Water are their scripts (Water's bubbles and
// Air's clouds are bubbles.ts's, made by the fixup before the portal as fixup_special() does), the
// Astral Plane is astral.ts's and the dummy level below Earth is a stand-in (lit open floor). Each level's portal
// leads to the next plane up (Earth -> Air -> Fire -> Water -> Astral), placed at a random spot of
// its des.levregion() by the fixup, after the script, as fixup_special() does; travellers
// arrive at a random spot of the next level's teleport region (endgame.ts). The planes have no
// stairs: the stairs core makes (at fixed spots here, so that they cost no draws) are lifted.
// The level flags ("mazelevel", "noteleport", "hardfloor", "shortsighted") are levelflags.ts
// entries; Fire's "hot" and "fumaroles" are not modelled (no gas clouds); Air's "stormy" is
// storms.ts's.
// ref: dat/dungeon.lua "The Elemental Planes"; dat/earth.lua, fire.lua, air.lua, water.lua;
// src/mkmaze.c fixup_special() (LR_PORTAL), place_lregion(), mkportal()
import type { Ctx, DefId, Level, LevelContent, LevelDef, LevelRect } from '@nh/core';
import { ASTRAL, astralBefore, astralContents } from './astral';
import { PLANES, PLANE_LEVELS } from './levelflags';
import { MAGIC_PORTAL, portalData } from './portal';
import { setupWaterlevel } from './bubbles';
import { mapToLevel, placeLregion, type SpLevFixup } from './sp_lev';
import { T, setTerrain } from './terrain';
import { maketrap } from './trap';

/** The Planes' stand-in level (m23 step 2): the dummy level below Earth. */
export const PLANE_STANDIN: LevelDef = {
  id: 'nh:plane-standin',
  init: { style: 'solidfill', fg: 'nh:floor', lit: true },
};

const mon = (id: string, x?: number, y?: number): LevelContent =>
  x === undefined || y === undefined
    ? { kind: 'monster', id: id as DefId }
    : { kind: 'monster', id: id as DefId, x, y };
const hostile = (id: string, x?: number, y?: number): LevelContent => ({
  ...mon(id, x, y),
  peaceful: false,
});
const cls = (c: string): LevelContent => ({ kind: 'monster', class: c });
const times = (n: number, c: LevelContent): LevelContent[] => Array.from({ length: n }, () => c);
const FIRE_TRAP: LevelContent = { kind: 'trap', id: 'nh:fire_trap' };
const BOULDER: LevelContent = { kind: 'object', id: 'nh:boulder' };

/**
 * Where core puts the stairs it gives a plane (Level coordinates; the fixup lifts them back to
 * `restore`): fixed, so that placing them draws nothing.
 */
const STAIR_SPOTS = (x: number, y: number) => ({
  up: { x, y, coords: 'level' as const },
  down: { x: x + 1, y, coords: 'level' as const },
  branch: { x: x + 2, y, coords: 'level' as const },
});

/** ref: dat/earth.lua des.map() */
const EARTH_MAP: readonly string[] = [
  '                                                                            ',
  '  ...                                                                       ',
  ' ....                ..                                                     ',
  ' .....             ...                                      ..              ',
  '  ....              ....                                     ...            ',
  '   ....              ...                ....                 ...      .     ',
  '    ..                ..              .......                 .      ..     ',
  '                                      ..  ...                        .      ',
  '              .                      ..    .                         ...    ',
  '             ..  ..                  .     ..                         .     ',
  '            ..   ...                        .                               ',
  '            ...   ...                                                       ',
  '              .. ...                                 ..                     ',
  '               ....                                 ..                      ',
  '                          ..                                       ...      ',
  '                         ..                                       .....     ',
  '  ...                                                              ...      ',
  ' ....                                                                       ',
  '   ..                                                                       ',
  '                                                                            ',
];
/** ref: dat/fire.lua des.map() */
const FIRE_MAP: readonly string[] = [
  'LL.............LL..............L...LL.........LL.................LL...........L',
  'LL....LLLLLLLL............L...L.............LL....LLL.......................LL.',
  'L....LL...................L......................LLLL................LL........',
  '.....L.............LLLL...LL....LL...............LLLLL.............LLL.........',
  '.L.LLLL..............LL....L.....LLL..............LLLL..............LLLL......L',
  'LL..........LLLL...LLLL...LLL....LLL......L........LLLL....LL........LLL......L',
  'LL........LLLLLLL...LL.....L......L......LL.........LL......LL........LL...L...',
  'L.........LL..LLL..LL......LL......LLLL..L.........LL......LLL............LL...',
  '......L..LL....LLLLL.................LLLLLLL.......L......LL............LLLLLL.',
  '......L..L.....LL.LLLL.......L............L........LLLLL.LL......LL.........LL.',
  '......LL........L...LL......LL.............LLL.....L...LLL.......LLL.........L.',
  '.L.....LLLLLL........L.......LLL.............L....LL...L.LLL......LLLLLLL......',
  'LL..........LLLL............LL.L.............L....L...LL.........LLL..LLL......',
  '.L...........................LLLLL...........LL...L...L........LLLL..LLLLLL...L',
  '.L.....LLLL.............LL....LL.......LLL...LL.......L..LLL....LLLLLLL.......L',
  '.........LLL.........LLLLLLLLLLL......LLLLL...L...........LL...LL...LL.........',
  '...........LL.......LL.........LL.......LLL....L..LLL....LL.........LL.........',
  '............LLLLLLLLL...........LL....LLL.......LLLLL.....LL........LL.........',
  '.LL...............L.............LLLLLL............LL...LLLL.........LL.......L.',
  'LL.....L..........................LL....................LL..................LLL',
  'L.....LLL......................LLLLL.........L.........LLLLLLLL..............LL',
];

/** ref: dat/air.lua des.map(): 76 x 20 of air */
const AIR_MAP: readonly string[] = Array.from({ length: 20 }, () => 'A'.repeat(76));
/** ref: dat/water.lua des.map(): 76 x 20 of water */
const WATER_MAP: readonly string[] = Array.from({ length: 20 }, () => 'W'.repeat(76));

/** The Plane of Earth. ref: dat/earth.lua */
export const EARTH: LevelDef = {
  id: PLANE_LEVELS.earth,
  init: { style: 'solidfill', fg: 'nh:stone', lit: false },
  map: { rows: [...EARTH_MAP] },
  edits: [{ replace: { from: ' ', to: '.', area: [0, 0, 75, 19], chance: 5 } }],
  stairs: STAIR_SPOTS(0, 0),
  // "Since there are no stairs, this forces the hero's initial placement"
  teleportRegions: [{ area: [69, 16, 69, 16] }],
  contents: [
    // Some helpful monsters.  Making sure a pick axe and at least one wand of digging are
    // available.
    mon('nh:elvenking', 67, 16),
    mon('nh:minotaur', 67, 14),
    hostile('nh:earth_elemental', 52, 13),
    hostile('nh:earth_elemental', 53, 13),
    mon('nh:rock_troll', 53, 12),
    mon('nh:stone_giant', 54, 12),
    mon('nh:pit_viper', 70, 5),
    mon('nh:barbed_devil', 69, 6),
    mon('nh:stone_giant', 69, 8),
    mon('nh:stone_golem', 71, 8),
    mon('nh:pit_fiend', 70, 9),
    hostile('nh:earth_elemental', 70, 8),
    hostile('nh:earth_elemental', 60, 3),
    mon('nh:stone_giant', 61, 4),
    hostile('nh:earth_elemental', 62, 4),
    hostile('nh:earth_elemental', 61, 5),
    mon('nh:scorpion', 62, 5),
    mon('nh:rock_piercer', 63, 5),
    mon('nh:umber_hulk', 40, 5),
    mon('nh:dust_vortex', 42, 5),
    mon('nh:rock_troll', 38, 6),
    hostile('nh:earth_elemental', 39, 6),
    hostile('nh:earth_elemental', 41, 6),
    hostile('nh:earth_elemental', 38, 7),
    mon('nh:stone_giant', 39, 7),
    hostile('nh:earth_elemental', 43, 7),
    mon('nh:stone_golem', 37, 8),
    mon('nh:pit_viper', 43, 8),
    mon('nh:pit_viper', 43, 9),
    mon('nh:rock_troll', 44, 10),
    hostile('nh:earth_elemental', 2, 1),
    hostile('nh:earth_elemental', 3, 1),
    mon('nh:stone_golem', 1, 2),
    hostile('nh:earth_elemental', 2, 2),
    mon('nh:rock_troll', 4, 3),
    mon('nh:rock_troll', 3, 3),
    mon('nh:pit_fiend', 3, 4),
    hostile('nh:earth_elemental', 4, 5),
    mon('nh:pit_viper', 5, 6),
    hostile('nh:earth_elemental', 21, 2),
    hostile('nh:earth_elemental', 21, 3),
    mon('nh:minotaur', 21, 4),
    hostile('nh:earth_elemental', 21, 5),
    mon('nh:rock_troll', 22, 5),
    hostile('nh:earth_elemental', 22, 6),
    hostile('nh:earth_elemental', 23, 6),
    mon('nh:pit_viper', 14, 8),
    mon('nh:barbed_devil', 14, 9),
    hostile('nh:earth_elemental', 13, 10),
    mon('nh:rock_troll', 12, 11),
    hostile('nh:earth_elemental', 14, 12),
    hostile('nh:earth_elemental', 15, 13),
    mon('nh:stone_giant', 17, 13),
    mon('nh:stone_golem', 18, 13),
    mon('nh:pit_fiend', 18, 12),
    hostile('nh:earth_elemental', 18, 11),
    hostile('nh:earth_elemental', 18, 10),
    mon('nh:barbed_devil', 2, 16),
    hostile('nh:earth_elemental', 3, 16),
    mon('nh:rock_troll', 2, 17),
    hostile('nh:earth_elemental', 4, 17),
    hostile('nh:earth_elemental', 4, 18),
    BOULDER,
  ],
};

/** The Plane of Fire. ref: dat/fire.lua */
export const FIRE: LevelDef = {
  id: PLANE_LEVELS.fire,
  init: { style: 'solidfill', fg: 'nh:stone', lit: false },
  map: { rows: [...FIRE_MAP] },
  stairs: STAIR_SPOTS(2, 0),
  teleportRegions: [{ area: [71, 16, 71, 16] }],
  contents: [
    FIRE_TRAP,
    FIRE_TRAP,
    FIRE_TRAP,
    FIRE_TRAP,
    FIRE_TRAP,
    FIRE_TRAP,
    FIRE_TRAP,
    FIRE_TRAP,
    FIRE_TRAP,
    FIRE_TRAP,
    FIRE_TRAP,
    FIRE_TRAP,
    FIRE_TRAP,
    FIRE_TRAP,
    FIRE_TRAP,
    FIRE_TRAP,
    FIRE_TRAP,
    FIRE_TRAP,
    FIRE_TRAP,
    FIRE_TRAP,
    FIRE_TRAP,
    FIRE_TRAP,
    FIRE_TRAP,
    FIRE_TRAP,
    FIRE_TRAP,
    FIRE_TRAP,
    FIRE_TRAP,
    FIRE_TRAP,
    FIRE_TRAP,
    FIRE_TRAP,
    FIRE_TRAP,
    FIRE_TRAP,
    FIRE_TRAP,
    FIRE_TRAP,
    FIRE_TRAP,
    FIRE_TRAP,
    FIRE_TRAP,
    FIRE_TRAP,
    FIRE_TRAP,
    FIRE_TRAP,
    mon('nh:red_dragon'),
    mon('nh:balrog'),
    hostile('nh:fire_elemental'),
    hostile('nh:fire_elemental'),
    mon('nh:fire_vortex'),
    mon('nh:hell_hound'),
    mon('nh:fire_giant'),
    mon('nh:barbed_devil'),
    mon('nh:hell_hound'),
    mon('nh:stone_golem'),
    mon('nh:pit_fiend'),
    hostile('nh:fire_elemental'),
    hostile('nh:fire_elemental'),
    mon('nh:hell_hound'),
    hostile('nh:fire_elemental'),
    hostile('nh:fire_elemental'),
    mon('nh:scorpion'),
    mon('nh:fire_giant'),
    mon('nh:hell_hound'),
    mon('nh:dust_vortex'),
    mon('nh:fire_vortex'),
    hostile('nh:fire_elemental'),
    hostile('nh:fire_elemental'),
    hostile('nh:fire_elemental'),
    mon('nh:hell_hound'),
    hostile('nh:fire_elemental'),
    mon('nh:stone_golem'),
    mon('nh:pit_viper'),
    mon('nh:pit_viper'),
    mon('nh:fire_vortex'),
    hostile('nh:fire_elemental'),
    hostile('nh:fire_elemental'),
    mon('nh:fire_giant'),
    hostile('nh:fire_elemental'),
    mon('nh:fire_vortex'),
    mon('nh:fire_vortex'),
    mon('nh:pit_fiend'),
    hostile('nh:fire_elemental'),
    mon('nh:pit_viper'),
    hostile('nh:salamander'),
    hostile('nh:salamander'),
    mon('nh:minotaur'),
    hostile('nh:salamander'),
    mon('nh:steam_vortex'),
    hostile('nh:salamander'),
    hostile('nh:salamander'),
    mon('nh:fire_giant'),
    mon('nh:barbed_devil'),
    hostile('nh:fire_elemental'),
    mon('nh:fire_vortex'),
    hostile('nh:fire_elemental'),
    hostile('nh:fire_elemental'),
    mon('nh:hell_hound'),
    mon('nh:fire_giant'),
    mon('nh:pit_fiend'),
    hostile('nh:fire_elemental'),
    hostile('nh:fire_elemental'),
    mon('nh:barbed_devil'),
    hostile('nh:salamander'),
    mon('nh:steam_vortex'),
    hostile('nh:salamander'),
    hostile('nh:salamander'),
    BOULDER,
    BOULDER,
    BOULDER,
    BOULDER,
    BOULDER,
  ],
};

/** The Plane of Air (its clouds are bubbles.ts's). ref: dat/air.lua */
export const AIR: LevelDef = {
  id: PLANE_LEVELS.air,
  // setup_waterlevel() turns the stone around the map into air
  init: { style: 'solidfill', fg: 'nh:stone', lit: true },
  map: { rows: [...AIR_MAP], lit: true },
  stairs: STAIR_SPOTS(0, 0),
  teleportRegions: [
    {
      area: [0, 0, 23, 20],
      coords: 'level',
      exclude: [24, 0, 78, 20],
      excludeCoords: 'level',
      dir: 'up',
    },
    {
      area: [55, 0, 78, 20],
      coords: 'level',
      exclude: [0, 0, 54, 20],
      excludeCoords: 'level',
      dir: 'down',
    },
  ],
  contents: [
    hostile('nh:air_elemental'),
    hostile('nh:air_elemental'),
    hostile('nh:air_elemental'),
    hostile('nh:air_elemental'),
    hostile('nh:air_elemental'),
    hostile('nh:air_elemental'),
    hostile('nh:air_elemental'),
    hostile('nh:air_elemental'),
    hostile('nh:air_elemental'),
    hostile('nh:air_elemental'),
    hostile('nh:air_elemental'),
    hostile('nh:floating_eye'),
    hostile('nh:floating_eye'),
    hostile('nh:floating_eye'),
    hostile('nh:yellow_light'),
    hostile('nh:yellow_light'),
    hostile('nh:yellow_light'),
    mon('nh:couatl'),
    cls('D'),
    cls('D'),
    cls('D'),
    cls('D'),
    cls('D'),
    cls('E'),
    cls('E'),
    cls('E'),
    cls('J'),
    cls('J'),
    hostile('nh:djinni'),
    hostile('nh:djinni'),
    hostile('nh:djinni'),
    hostile('nh:fog_cloud'),
    hostile('nh:fog_cloud'),
    hostile('nh:fog_cloud'),
    hostile('nh:fog_cloud'),
    hostile('nh:fog_cloud'),
    hostile('nh:fog_cloud'),
    hostile('nh:fog_cloud'),
    hostile('nh:fog_cloud'),
    hostile('nh:fog_cloud'),
    hostile('nh:energy_vortex'),
    hostile('nh:energy_vortex'),
    hostile('nh:energy_vortex'),
    hostile('nh:energy_vortex'),
    hostile('nh:energy_vortex'),
    hostile('nh:steam_vortex'),
    hostile('nh:steam_vortex'),
    hostile('nh:steam_vortex'),
    hostile('nh:steam_vortex'),
    hostile('nh:steam_vortex'),
  ],
};

/**
 * The Plane of Water: water everywhere but in its air bubbles (bubbles.ts, made by the fixup),
 * "A fisherman's dream...". ref: dat/water.lua
 */
export const WATER: LevelDef = {
  id: PLANE_LEVELS.water,
  // setup_waterlevel() turns the stone around the map into water
  init: { style: 'solidfill', fg: 'nh:stone' },
  map: { rows: [...WATER_MAP] },
  stairs: STAIR_SPOTS(0, 0),
  teleportRegions: [{ area: [0, 0, 25, 19] }],
  contents: [
    // A fisherman's dream...
    ...times(8, mon('nh:giant_eel')),
    ...times(8, mon('nh:electric_eel')),
    ...times(9, mon('nh:kraken')),
    ...times(4, mon('nh:shark')),
    ...times(4, mon('nh:piranha')),
    ...times(4, mon('nh:jellyfish')),
    ...times(4, cls(';')),
    // These guys feel like home here
    ...times(19, hostile('nh:water_elemental')),
  ],
};

/** The Planes' levels made from their scripts (dungeon.ts). */
export const PLANE_LEVEL_DEFS: readonly LevelDef[] = [EARTH, FIRE, AIR, WATER, ASTRAL];

/**
 * Each plane's des.levregion({ type = "portal" }): the area (and exclusion) its portal goes in
 * and the plane it leads to.
 */
const PORTALS: Readonly<
  Record<DefId, { area: LevelRect; exclude: LevelRect | null; level: boolean; to: DefId }>
> = {
  [EARTH.id]: {
    area: [0, 0, 75, 19],
    exclude: [65, 13, 75, 19],
    level: false,
    to: PLANE_LEVELS.air,
  },
  [AIR.id]: { area: [56, 1, 77, 19], exclude: null, level: true, to: PLANE_LEVELS.fire },
  [FIRE.id]: {
    area: [0, 0, 78, 19],
    exclude: [67, 13, 78, 19],
    level: false,
    to: PLANE_LEVELS.water,
  },
  [WATER.id]: { area: [51, 0, 75, 19], exclude: null, level: false, to: PLANE_LEVELS.astral },
};

/** Lifts every stair core made (up, down and the branch back to DL1 on Earth): the Planes have none. */
function liftPlaneStairs(level: Level, restore: DefId): void {
  for (const p of [level.up, level.down, level.branch?.pos])
    if (p) setTerrain(level, p.x, p.y, restore);
  level.up = null;
  level.down = null;
  level.branch = null;
}

/**
 * des.levregion({ type = "portal", name = <plane> }): a magic portal at a random good spot of the
 * region leading to that plane. ref: src/mkmaze.c fixup_special() LR_PORTAL, place_lregion()
 */
function placePlanePortal(ctx: Ctx, level: Level, def: LevelDef): void {
  const r = PORTALS[def.id];
  if (!r) return;
  const toLevel = (x: number, y: number) => (r.level ? { x, y } : mapToLevel(def, level, x, y));
  const a = toLevel(r.area[0], r.area[1]);
  const b = toLevel(r.area[2], r.area[3]);
  let ex: LevelRect | null = null;
  if (r.exclude) {
    const c = toLevel(r.exclude[0], r.exclude[1]);
    const d = toLevel(r.exclude[2], r.exclude[3]);
    ex = [c.x, c.y, d.x, d.y];
  }
  const p = placeLregion(ctx, level, [a.x, a.y, b.x, b.y], ex);
  const sp = ctx.state.dungeons.find((d) => d.id === PLANES)?.special.find((s) => s.id === r.to);
  if (!p || !sp) return;
  const t = maketrap(ctx, level.id, p.x, p.y, MAGIC_PORTAL, { inMklev: true });
  t.data = portalData({ dungeon: PLANES, dlevel: sp.dlevel });
}

/**
 * A plane's fixup: no stairs; after the script, Water's and Air's element and bubbles
 * ("water level is an odd beast - it has to be set up before calling place_lregions etc."),
 * then the portal. ref: src/mkmaze.c fixup_special()
 */
const planeFixup = (restore: DefId): SpLevFixup => ({
  before(_ctx, level) {
    liftPlaneStairs(level, restore);
  },
  after(ctx, level, def) {
    setupWaterlevel(ctx, level);
    placePlanePortal(ctx, level, def);
  },
});

/** The Planes' fixups, by LevelDef id. */
export const PLANE_FIXUPS: Readonly<Record<DefId, SpLevFixup>> = {
  [PLANE_STANDIN.id]: planeFixup(T.floor),
  [EARTH.id]: planeFixup(T.stone),
  [FIRE.id]: planeFixup(T.floor),
  [AIR.id]: planeFixup(T.stone),
  [WATER.id]: planeFixup(T.stone),
  // no portal: the Astral Plane is the top
  [ASTRAL.id]: {
    before(ctx, level, def) {
      liftPlaneStairs(level, T.stone);
      astralBefore(ctx, level, def);
    },
    contents: astralContents,
  },
};
