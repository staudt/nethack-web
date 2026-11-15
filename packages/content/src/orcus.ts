// Orcus Town: a ruined town right-aligned in a maze grid, its shops stocked and then deserted
// (the shopkeepers are removed: "it's a ghost town"), a morgue, an unaligned altar, Orcus and his
// undead companions, hell's tweaks outside the town. ref: dat/orcus.lua
//
// Translation notes (DEVIATIONS.md "Orcus Town (m17)"): as the lairs (asmodeus.ts), the LevelDef
// is unlit stone with the town's map (so its regions, rooms and contents are relative to it, as
// in the script) and placeholder stairs. Its `before` fixup lays the maze grid over the level
// (des.level_init mazegrid), the map again over it, walks the maze from its west edge (stocked:
// fill_empty_maze()), then the down stairs, the doors and the altar (none of which draws); the
// LevelDef's contents are the boulders, traps and objects; the `after` fixup draws the magic
// marker or magic lamp coin (neither object exists yet: nothing is made), makes the monsters,
// runs hell_tweaks() outside the grid's inside and the map, joins the walls, puts the up stairs
// (and a branch) in their level region as fixup_special() does, and only then fills the rooms
// in room order as lspo_finalize_level() does (the morgue, then the two shops, each shop's
// keeper removed once it is stocked: src/shknam.c stock_room()'s ghost-town hack). The altar is
// an ordinary unaligned one: create_altar() makes a high altar (AM_SANCTUM) only in a temple
// room, and this one stands in none. The map lands two columns right of NetHack's (this port's
// x_maze_max is two more). "vampire" and "vampire lord" are random monsters until vampires exist.
import type { Ctx, DefId, Level, LevelContent, LevelDef, MapBlock } from '@nh/core';
import { mapBlock, VANILLA_TERRAIN, wallifyLevel } from '@nh/core';
import { shopKeeper } from './eshk';
import { desMazeGrid, mapCleanup } from './hellfill';
import { blockSel, gridInside, hellTweaks } from './helltweaks';
import { spLevMap } from './mazefill';
import { mazewalk } from './mazewalk';
import { mongone } from './mondeath';
import { selNegate, selOr } from './selection';
import { stockRoom } from './shknam';
import { shopType } from './shtypes';
import {
  desDoor,
  desLevregion,
  desMap,
  desStair,
  liftStairs,
  makeContents,
  mapToLevel,
  orientDoors,
  type SpLevFixup,
} from './sp_lev';
import { T, setTerrain } from './terrain';
import { MORGUE, fillZoo } from './zoo';

/** ref: dat/orcus.lua: a ghost town */
const ORCUS1: readonly string[] = [
  '.|....|....|....|..............|....|........',
  '.|....|....|....|..............|....|........',
  '.|....|....|....|--...-+-------|.............',
  '.|....|....|....|..............+.............',
  '.|.........|....|..............|....|........',
  '.--+-...-+----+--....-------...--------.-+---',
  '.....................|.....|.................',
  '.....................|.....|.................',
  '.--+----....-+---....|.....|...----------+---',
  '.|....|....|....|....---+---...|......|......',
  '.|.........|....|..............|......|......',
  '.----...---------.....-----....+......|......',
  '.|........................|....|......|......',
  '.----------+-...--+--|....|....----------+---',
  '.|....|..............|....+....|.............',
  '.|....+.......|......|....|....|.............',
  '.|....|.......|......|....|....|.............',
];

const mon = (id?: string, x?: number, y?: number): LevelContent => ({
  kind: 'monster',
  ...(id !== undefined ? { id: id as DefId } : {}),
  ...(x !== undefined && y !== undefined ? { x, y } : {}),
});
const boulder = (x: number, y: number): LevelContent => ({
  kind: 'object',
  id: 'nh:boulder',
  x,
  y,
});
const trap = (id: string): LevelContent => ({ kind: 'trap', id: id as DefId });

/** des.door(state, x, y) of the town, in the script's order (map coordinates). */
const DOORS: readonly (readonly [number, number, 'closed' | 'open' | 'nodoor'])[] = [
  [23, 2, 'closed'],
  [31, 3, 'open'],
  [3, 5, 'nodoor'],
  [9, 5, 'closed'],
  [14, 5, 'closed'],
  [41, 5, 'closed'],
  [3, 8, 'open'],
  [13, 8, 'nodoor'],
  [41, 8, 'open'],
  [24, 9, 'closed'],
  [31, 11, 'closed'],
  [11, 13, 'open'],
  [18, 13, 'closed'],
  [41, 13, 'closed'],
  [26, 14, 'open'],
  [6, 15, 'closed'],
];

/** The resident nasty and his companions, after the marker-or-lamp coin. */
const MONSTERS: readonly LevelContent[] = [
  // The resident nasty
  mon('nh:orcus', 33, 15),
  // And its preferred companions ("vampire", "vampire lord": random monsters until they exist)
  mon('nh:human_zombie', 32, 15),
  mon('nh:shade', 32, 14),
  mon('nh:shade', 32, 16),
  mon(undefined, 35, 16),
  mon(undefined, 35, 14),
  mon(undefined, 36, 14),
  mon(undefined, 36, 15),
  // Randomly placed companions
  { kind: 'monster', id: 'nh:skeleton', count: 5 },
  { kind: 'monster', id: 'nh:shade', count: 4 },
  { kind: 'monster', id: 'nh:giant_zombie', count: 3 },
  { kind: 'monster', id: 'nh:ettin_zombie', count: 3 },
  { kind: 'monster', id: 'nh:human_zombie', count: 3 },
  { kind: 'monster', count: 3 }, // vampires
  { kind: 'monster', count: 2 }, // vampire lords
  // A few more for the party
  { kind: 'monster', count: 5 },
];

/**
 * ref: dat/orcus.lua. Its id is not its special level's (GEHENNOM_SPECIALS.orcus), which is
 * Orcus's monster id.
 */
export const ORCUS_TOWN: LevelDef = {
  id: 'nh:orcus-town',
  // des.level_init({ style = "mazegrid", bg = "-" }): the fixup's, before the map
  init: { style: 'solidfill', fg: 'nh:stone', lit: false },
  map: { rows: [...ORCUS1], halign: 'right', valign: 'center' },
  regions: [
    // Entire main area
    { area: [1, 0, 44, 16], lit: false },
    // Special rooms (filled by the fixup, in this order, after the stairs)
    { area: [22, 12, 25, 16], lit: false, type: MORGUE, filled: false },
    { area: [32, 9, 37, 12], lit: true, type: 'nh:shop', filled: false },
    { area: [12, 0, 15, 4], lit: true, type: 'nh:shop', filled: false },
  ],
  // placeholders (Level column 0 is stone in the grid); the fixups make the stairs
  stairs: {
    up: { x: 0, y: 0, coords: 'level' },
    down: { x: 0, y: 1, coords: 'level' },
    branch: { x: 0, y: 2, coords: 'level' },
  },
  // des.teleport_region({ region = {01,00,12,20}, region_islev = 1, exclude = {20,01,70,20},
  // exclude_islev = 1 })
  teleportRegions: [
    { area: [0, 0, 11, 20], coords: 'level', exclude: [19, 1, 69, 20], excludeCoords: 'level' },
  ],
  contents: [
    // Wall "ruins"
    ...(
      [
        [19, 2],
        [20, 2],
        [21, 2],
        [36, 2],
        [36, 3],
        [6, 4],
        [5, 5],
        [6, 5],
        [7, 5],
        [39, 5],
        [8, 8],
        [9, 8],
        [10, 8],
        [11, 8],
        [6, 10],
        [5, 11],
        [6, 11],
        [7, 11],
        [21, 11],
        [21, 12],
        [13, 13],
        [14, 13],
        [15, 13],
        [14, 14],
      ] as const
    ).map(([x, y]) => boulder(x, y)),
    // (doors and the altar: the fixup's, which draw nothing; then the special rooms)
    // Some traps.
    trap('nh:spiked_pit'),
    trap('nh:sleeping_gas_trap'),
    trap('nh:anti_magic_field'),
    trap('nh:fire_trap'),
    trap('nh:fire_trap'),
    trap('nh:fire_trap'),
    trap('nh:magic_trap'),
    trap('nh:magic_trap'),
    // Some random objects
    { kind: 'object', count: 10 },
  ],
};

/** Lights a lit room and its walls again after the map was laid over it. ref: add_room() */
function relightRooms(level: Level): void {
  for (const r of level.rooms) {
    if (!r.lit) continue;
    for (let y = Math.max(r.ly - 1, 0); y <= Math.min(r.hy + 1, level.height - 1); y++)
      for (let x = Math.max(r.lx - 1, 0); x <= Math.min(r.hx + 1, level.width - 1); x++)
        level.lit[y * level.width + x] = 1;
  }
}

/**
 * The rooms' fill at the end of the level, in room order: the morgue's monsters and graves, and
 * each shop's stock, after which its shopkeeper is removed. ref: src/sp_lev.c
 * lspo_finalize_level() (fill_special_room()); src/shknam.c stock_room() (Orcus's level)
 */
function fillTown(ctx: Ctx, level: Level): void {
  for (let i = 0; i < level.rooms.length; i++) {
    const r = level.rooms[i];
    if (r?.type === MORGUE) fillZoo(ctx, level, i);
    const shp = shopType(r?.type);
    if (!shp) continue;
    stockRoom(ctx, level, i, shp);
    // it's a ghost town, get rid of shopkeepers
    const shk = shopKeeper(ctx, level.id, i);
    if (shk !== null) mongone(ctx, shk);
  }
}

/** Orcus Town: the script in its order around the LevelDef's contents. */
export const ORCUS_TOWN_FIXUP: SpLevFixup = {
  before(ctx, level, def) {
    liftStairs(level);
    desMazeGrid(level);
    // the town (core laid it on the stone; the grid went over it), unlit
    const b = mapBlock(def, level.width, level.height) as MapBlock;
    desMap(level, ORCUS1, { x: b.x, y: b.y });
    relightRooms(level);
    mazewalk(ctx, level, def, 0, 6, 'west', true, true, spLevMap(level, def));
    const at = (x: number, y: number) => mapToLevel(def, level, x, y);
    desStair(ctx, level, 'down', at(33, 15));
    // Doors
    for (const [x, y, st] of DOORS) {
      const p = at(x, y);
      desDoor(ctx, level, p.x, p.y, st);
    }
    // des.altar({ x = 24, y = 07, align = "noalign", type = "sanctum" }): no temple room here
    const a = at(24, 7);
    setTerrain(level, a.x, a.y, T.altar_unaligned);
  },
  after(ctx, level, def) {
    // An object that's worth most of a wish: `math.random(0, 1)`, then a magic marker or a
    // magic lamp, neither of which exists yet
    ctx.rng.rn2(2);
    makeContents(ctx, level, def, MONSTERS);
    // local protected = bounds2:negate() | orcus1; hell_tweaks(protected)
    const b = mapBlock(def, level.width, level.height) as MapBlock;
    hellTweaks(ctx, level, selOr(selNegate(gridInside(level)), blockSel(level, b)));
    orientDoors(ctx, level);
    mapCleanup(ctx, level);
    wallifyLevel(level, VANILLA_TERRAIN, [0, 0, -1, -1]); // wallification() only
    // des.levregion({ region = {01,00,12,20}, region_islev = 1, exclude = {20,01,70,20},
    // exclude_islev = 1, type = "stair-up" }), and the branch's
    desLevregion(ctx, level, 'stair-up', [0, 0, 11, 20], [19, 1, 69, 20]);
    desLevregion(ctx, level, 'branch', [0, 0, 11, 20], [19, 1, 69, 20]);
    fillTown(ctx, level);
  },
};
