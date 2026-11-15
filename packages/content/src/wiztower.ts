// The Wizard's Tower: three levels (wizard1 at the top, wizard2 and wizard3 below it) whose
// middle holds the same moated tower, entered only through the magic portal from the first fake
// tower into wizard3 and climbed by its ladders; hell's tweaks outside it. ref: dat/wizard1.lua,
// dat/wizard2.lua, dat/wizard3.lua
//
// Translation notes (DEVIATIONS.md "The Wizard's Tower (m17)"): as the lairs (asmodeus.ts), each
// LevelDef is unlit stone with its tower map (so its regions and contents are relative to it, as in
// the script), the typed rooms (the morgues, wizard2's zoo, wizard3's beehive) marked unfilled,
// placeholder stairs and the teleport region, whose exclusion is the tower's boundary
// (levelflags.ts inWTower()). The `before` fixup lays the maze grid (des.level_init mazegrid), the
// map again over it, then the script's region doors, doors, maze walk (stocked:
// fill_empty_maze()) and ladders in its order; the LevelDef's contents are the monsters, traps and
// objects; the `after` fixup runs hell_tweaks() outside the grid's inside and the map, joins the
// walls, puts the stairs, the branch and wizard3's portal in their level regions as
// fixup_special() does, and only then fills the zoo and the beehive as lspo_finalize_level() does
// (the morgues are `filled = 2`: typed, never filled). The "ordinary" arrival rooms make no Room
// here (no monster arrival `wander`): wizard3's is only where its secret door goes. The map lands
// two columns right of NetHack's (this port's x_maze_max is two more). "vampire lord" is a random
// monster until vampires exist.
import type { Ctx, DefId, Level, LevelContent, LevelDef, LevelRect, MapBlock } from '@nh/core';
import { mapBlock, VANILLA_TERRAIN, wallifyLevel } from '@nh/core';
import { desMazeGrid, mapCleanup } from './hellfill';
import { gridInside, hellTweaks } from './helltweaks';
import { LADDER_SPOTS } from './ladder';
import { GEHENNOM_SPECIALS as G, setMadeLevelFlags } from './levelflags';
import { spLevMap } from './mazefill';
import { mazewalk } from './mazewalk';
import { MAGIC_PORTAL, PORTAL_SPOTS, portalData } from './portal';
import { selNegate, selOr, selWhere, type Sel } from './selection';
import {
  desDoor,
  desLevregion,
  desMap,
  desRoomDoor,
  liftStairs,
  mapToLevel,
  orientDoors,
  placeLregion,
  type RoomWall,
  type SpLevFixup,
} from './sp_lev';
import { T, setTerrain } from './terrain';
import { maketrap } from './trap';
import { BEEHIVE, MORGUE, ZOO, fillZoo } from './zoo';

/** ref: dat/wizard1.lua: the top (real) wizard level ("Keeping the Moat for old-time's sake") */
const WIZ1: readonly string[] = [
  '----------------------------x',
  '|.......|..|.........|.....|x',
  '|.......S..|.}}}}}}}.|.....|x',
  '|..--S--|..|.}}---}}.|---S-|x',
  '|..|....|..|.}--.--}.|..|..|x',
  '|..|....|..|.}|...|}.|..|..|x',
  '|..--------|.}--.--}.|..|..|x',
  '|..|.......|.}}---}}.|..|..|x',
  '|..S.......|.}}}}}}}.|..|..|x',
  '|..|.......|.........|..|..|x',
  '|..|.......|-----------S-S-|x',
  '|..|.......S...............|x',
  '----------------------------x',
];

/** ref: dat/wizard2.lua */
const WIZ2: readonly string[] = [
  '----------------------------x',
  '|.....|.S....|.............|x',
  '|.....|.-------S--------S--|x',
  '|.....|.|.........|........|x',
  '|..-S--S|.........|........|x',
  '|..|....|.........|------S-|x',
  '|..|....|.........|.....|..|x',
  '|-S-----|.........|.....|..|x',
  '|.......|.........|S--S--..|x',
  '|.......|.........|.|......|x',
  '|-----S----S-------.|......|x',
  '|............|....S.|......|x',
  '----------------------------x',
];

/** ref: dat/wizard3.lua */
const WIZ3: readonly string[] = [
  '----------------------------x',
  '|..|............S..........|x',
  '|..|..------------------S--|x',
  '|..|..|.........|..........|x',
  '|..S..|.}}}}}}}.|..........|x',
  '|..|..|.}}---}}.|-S--------|x',
  '|..|..|.}--.--}.|..|.......|x',
  '|..|..|.}|...|}.|..|.......|x',
  '|..---|.}--.--}.|..|.......|x',
  '|.....|.}}---}}.|..|.......|x',
  '|.....S.}}}}}}}.|..|.......|x',
  '|.....|.........|..|.......|x',
  '----------------------------x',
];

const mon = (id?: string, x?: number, y?: number): LevelContent => ({
  kind: 'monster',
  ...(id !== undefined ? { id: id as DefId } : {}),
  ...(x !== undefined && y !== undefined ? { x, y } : {}),
});
const cls = (c: string, x?: number, y?: number): LevelContent => ({
  kind: 'monster',
  class: c,
  ...(x !== undefined && y !== undefined ? { x, y } : {}),
});
const obj = (c: string, x?: number, y?: number): LevelContent => ({
  kind: 'object',
  class: c,
  ...(x !== undefined && y !== undefined ? { x, y } : {}),
});
const trap = (id: string, x?: number, y?: number): LevelContent => ({
  kind: 'trap',
  id: id as DefId,
  ...(x !== undefined && y !== undefined ? { x, y } : {}),
});
const board = (x: number, y: number): LevelContent => trap('nh:squeaky_board', x, y);

/** The common parts of the three tower LevelDefs. */
const towerDef = (
  id: DefId,
  rows: readonly string[],
  regions: LevelDef['regions'],
  contents: LevelContent[],
): LevelDef => ({
  id,
  // des.level_init({ style = "mazegrid", bg = "-" }): the fixup's, before the map
  init: { style: 'solidfill', fg: 'nh:stone', lit: false },
  map: { rows: [...rows], halign: 'center', valign: 'center' },
  ...(regions ? { regions } : {}),
  // placeholders (Level column 0 is stone in the grid); the fixups make the stairs
  stairs: {
    up: { x: 0, y: 0, coords: 'level' },
    down: { x: 0, y: 1, coords: 'level' },
    branch: { x: 0, y: 2, coords: 'level' },
  },
  // des.teleport_region({ region = {01,00,79,20}, region_islev = 1, exclude = {0,0,27,12} })
  teleportRegions: [{ area: [0, 0, 78, 20], coords: 'level', exclude: [0, 0, 27, 12] }],
  contents,
});

/** ref: dat/wizard1.lua. Its id is its special level's (no monster has it). */
export const WIZARD1: LevelDef = towerDef(
  G.wizard1,
  WIZ1,
  [
    // the morgue (filled = 2: typed, not filled), its secret door the fixup's
    { area: [12, 1, 20, 9], lit: false, type: MORGUE, filled: false },
    // another region to constrain monster arrival (no Room here: an unlit area)
    { area: [1, 1, 10, 11], lit: false },
  ],
  [
    // The wizard and his guards
    { ...mon('nh:wizard_of_yendor', 16, 5), asleep: true },
    mon('nh:hell_hound', 15, 5),
    mon(undefined, 17, 5), // "vampire lord": a random monster until vampires exist
    // The local treasure
    { kind: 'object', id: 'nh:book_of_the_dead' as DefId, x: 16, y: 5 },
    // Surrounding terror
    mon('nh:kraken', 14, 2),
    mon('nh:giant_eel', 17, 2),
    mon('nh:kraken', 13, 4),
    mon('nh:giant_eel', 13, 6),
    mon('nh:kraken', 19, 4),
    mon('nh:giant_eel', 19, 6),
    mon('nh:kraken', 15, 8),
    mon('nh:giant_eel', 17, 8),
    mon('nh:piranha', 15, 2),
    mon('nh:piranha', 19, 8),
    // Random monsters
    cls('D'),
    cls('H'),
    cls('&'),
    cls('&'),
    cls('&'),
    cls('&'),
    // And to make things a little harder.
    board(16, 4),
    board(16, 6),
    board(15, 5),
    board(17, 5),
    // Random traps.
    trap('nh:spiked_pit'),
    trap('nh:sleeping_gas_trap'),
    trap('nh:anti_magic_field'),
    trap('nh:magic_trap'),
    // Some random loot.
    { kind: 'object', id: 'nh:ruby' },
    obj('potion'),
    obj('potion'),
    obj('scroll'),
    obj('scroll'),
    obj('spellbook'),
    obj('spellbook'),
    obj('spellbook'),
  ],
);

/** ref: dat/wizard2.lua */
export const WIZARD2: LevelDef = towerDef(
  G.wizard2,
  WIZ2,
  [
    // entire tower in a region, constrains monster migration (no Room here)
    { area: [1, 1, 26, 11], lit: false },
    // the zoo (filled = 1), filled by the fixup at the end
    { area: [9, 3, 17, 9], lit: false, type: ZOO, filled: false },
  ],
  [
    // Random traps.
    trap('nh:spiked_pit'),
    trap('nh:sleeping_gas_trap'),
    trap('nh:anti_magic_field'),
    trap('nh:magic_trap'),
    // Some random loot.
    obj('potion'),
    obj('potion'),
    obj('scroll'),
    obj('scroll'),
    obj('spellbook'),
    // treasures
    obj('amulet', 4, 6),
  ],
);

/** ref: dat/wizard3.lua */
export const WIZARD3: LevelDef = towerDef(
  G.wizard3,
  WIZ3,
  [
    // the morgue (filled = 2) and the beehive (filled = 1, filled by the fixup at the end)
    { area: [7, 3, 15, 11], lit: false, type: MORGUE, filled: false },
    { area: [17, 6, 18, 11], lit: false, type: BEEHIVE, filled: false },
    // the entry chamber, "a real room; it affects monster arrival" (no Room here); its secret
    // door is the fixup's
    { area: [20, 6, 26, 11], lit: false },
  ],
  [
    cls('L', 10, 7),
    mon(undefined, 12, 7), // "vampire lord": a random monster until vampires exist
    // Some surrounding horrors
    mon('nh:kraken', 8, 5),
    mon('nh:giant_eel', 8, 8),
    mon('nh:kraken', 14, 5),
    mon('nh:giant_eel', 14, 8),
    // Other monsters
    cls('L'),
    cls('D'),
    cls('D', 26, 9),
    cls('&'),
    cls('&'),
    cls('&'),
    // And to make things a little harder.
    board(10, 7),
    board(12, 7),
    board(11, 6),
    board(11, 8),
    // Some loot
    obj('weapon'),
    obj('potion'),
    obj('scroll'),
    obj('scroll'),
    obj('tool'),
    // treasures
    obj('amulet', 11, 7),
  ],
);

/** The tower LevelDefs, top first. */
export const WIZARD_TOWER: readonly LevelDef[] = [WIZARD1, WIZARD2, WIZARD3];

/** The selection des.map() returns: the map's cells but its see-through 'x' ones. */
export function mapSel(level: Level, b: MapBlock, rows: readonly string[]): Sel {
  return selWhere(level, (x, y) => {
    const ch = rows[y - b.y]?.[x - b.x];
    return ch !== undefined && ch !== 'x';
  });
}

/** The LevelDef's map block, re-laid over the maze grid (core laid it on the stone first). */
export function relayMap(level: Level, def: LevelDef, rows: readonly string[]): MapBlock {
  const b = mapBlock(def, level.width, level.height) as MapBlock;
  desMap(level, rows, { x: b.x, y: b.y });
  return b;
}

/** des.ladder(dir, x, y) at a map spot of the LevelDef (its LADDER_SPOTS entry). */
function desLadders(level: Level, def: LevelDef): void {
  const spots = LADDER_SPOTS[def.id] ?? {};
  for (const dir of ['up', 'down'] as const) {
    const s = spots[dir];
    if (!s) continue;
    const p = mapToLevel(def, level, s[0], s[1]);
    setTerrain(level, p.x, p.y, dir === 'up' ? T.ladder_up : T.ladder_down);
  }
}

/**
 * des.levregion({ region = {01,00,79,20}, region_islev = 1, exclude = <map rect>, type = ... })
 * for the up and down stairs and the branch, in that order (the exclusion is map-relative).
 */
export function towerLevregions(
  ctx: Ctx,
  level: Level,
  b: MapBlock,
  ex: readonly [number, number, number, number],
): void {
  const exclude: LevelRect = [b.x + ex[0], b.y + ex[1], b.x + ex[2], b.y + ex[3]];
  desLevregion(ctx, level, 'stair-up', [0, 0, 78, 20], exclude);
  desLevregion(ctx, level, 'stair-down', [0, 0, 78, 20], exclude);
  desLevregion(ctx, level, 'branch', [0, 0, 78, 20], exclude);
}

/**
 * des.levregion({ region = {x,y,x,y}, type = "portal", name = <special level> }): a magic portal
 * at its (map-relative) spot leading to Gehennom's special level `to`; none when the dungeon has
 * no such level. ref: src/mkmaze.c fixup_special() (LR_PORTAL), place_lregion(), mkportal()
 */
export function desPortal(ctx: Ctx, level: Level, def: LevelDef, to: DefId): void {
  const spot = PORTAL_SPOTS[def.id];
  const sp = ctx.state.dungeons
    .find((d) => d.id === level.dungeon)
    ?.special.find((s) => s.id === to);
  if (!spot) return;
  const p0 = mapToLevel(def, level, spot[0], spot[1]);
  const p = placeLregion(ctx, level, [p0.x, p0.y, p0.x, p0.y], null);
  if (!p || !sp) return;
  const t = maketrap(ctx, level.id, p.x, p.y, MAGIC_PORTAL, { inMklev: true });
  t.data = portalData({ dungeon: level.dungeon, dlevel: sp.dlevel });
}

/**
 * The end of a tower script and of fixup_special(): hell_tweaks() outside the maze grid's inside
 * and the map, doors facing their walls, nothing on liquids, the walls joined, the stairs and the
 * branch in their level regions (and a portal), then the zoo-like rooms filled.
 */
export function finishTower(
  ctx: Ctx,
  level: Level,
  def: LevelDef,
  rows: readonly string[],
  stairsExclude: readonly [number, number, number, number],
  portalTo?: DefId,
): void {
  const b = mapBlock(def, level.width, level.height) as MapBlock;
  // local protected = bounds2:negate() | wizN; hell_tweaks(protected)
  hellTweaks(ctx, level, selOr(selNegate(gridInside(level)), mapSel(level, b, rows)));
  orientDoors(ctx, level);
  mapCleanup(ctx, level);
  wallifyLevel(level, VANILLA_TERRAIN, [0, 0, -1, -1]); // wallification() only
  towerLevregions(ctx, level, b, stairsExclude);
  if (portalTo !== undefined) desPortal(ctx, level, def, portalTo);
  // lspo_finalize_level(): fill_special_room() in room order (the morgues are filled = 2)
  for (let i = 0; i < level.rooms.length; i++) {
    const t = level.rooms[i]?.type;
    if (t === ZOO || t === BEEHIVE) fillZoo(ctx, level, i);
  }
}

/** The start of a tower script: the maze grid, the map laid again over it. */
function startTower(level: Level, def: LevelDef, rows: readonly string[]): MapBlock {
  liftStairs(level);
  desMazeGrid(level);
  return relayMap(level, def, rows);
}

/**
 * Records the tower's boundary for inWTower(): the teleport region's exclusion {0,0,27,12}, map-
 * relative (C's `dndest.nlx`...).
 */
function setTowerBounds(ctx: Pick<Ctx, 'state'>, level: Level, b: MapBlock): void {
  setMadeLevelFlags(ctx, level.id, { wtower: [b.x, b.y, b.x + 27, b.y + 12] });
}

const at = (def: LevelDef, level: Level, x: number, y: number) => mapToLevel(def, level, x, y);

/** A room's inside in Level coordinates from its map-relative region. */
const roomAt = (def: LevelDef, level: Level, r: readonly [number, number, number, number]) => {
  const a = at(def, level, r[0], r[1]);
  const c = at(def, level, r[2], r[3]);
  return { lx: a.x, ly: a.y, hx: c.x, hy: c.y };
};

/** wizard1: the script in its order around the LevelDef's contents. */
export const WIZARD1_FIXUP: SpLevFixup = {
  before(ctx, level, def) {
    const b = startTower(level, def, WIZ1);
    setTowerBounds(ctx, level, b);
    // the morgue's contents: des.door({ wall = sdwall[math.random(1, #sdwall)], state = "secret" })
    const sdwall: RoomWall[] = ['south', 'west', 'east'];
    const wall = sdwall[ctx.rng.rn2(sdwall.length)] as RoomWall;
    desRoomDoor(ctx, level, roomAt(def, level, [12, 1, 20, 9]), [wall]);
    mazewalk(ctx, level, def, 28, 5, 'east', true, true, spLevMap(level, def));
    desLadders(level, def);
    // Non diggable walls, non passable walls: levelflags.ts ("Walls inside the moat stay
    // diggable")
  },
  after(ctx, level, def) {
    finishTower(ctx, level, def, WIZ1, [0, 0, 28, 12]);
  },
};

/** wizard2: the script in its order around the LevelDef's contents. */
export const WIZARD2_FIXUP: SpLevFixup = {
  before(ctx, level, def) {
    const b = startTower(level, def, WIZ2);
    setTowerBounds(ctx, level, b);
    for (const [x, y] of [
      [15, 2],
      [11, 10],
    ] as const) {
      const p = at(def, level, x, y);
      desDoor(ctx, level, p.x, p.y, 'closed');
    }
    mazewalk(ctx, level, def, 28, 5, 'east', true, true, spLevMap(level, def));
    desLadders(level, def);
  },
  after(ctx, level, def) {
    finishTower(ctx, level, def, WIZ2, [0, 0, 28, 12]);
  },
};

/** wizard3: the script in its order around the LevelDef's contents. */
export const WIZARD3_FIXUP: SpLevFixup = {
  before(ctx, level, def) {
    const b = startTower(level, def, WIZ3);
    setTowerBounds(ctx, level, b);
    mazewalk(ctx, level, def, 28, 9, 'east', true, true, spLevMap(level, def));
    // the entry chamber's contents: local w = "north"; if percent(50) then w = "west" end
    const w: RoomWall = ctx.rng.rn2(100) < 50 ? 'west' : 'north';
    desRoomDoor(ctx, level, roomAt(def, level, [20, 6, 26, 11]), [w]);
    const d = at(def, level, 18, 5);
    desDoor(ctx, level, d.x, d.y, 'closed');
    desLadders(level, def);
  },
  after(ctx, level, def) {
    // des.levregion({ region = {25,11,25,11}, type = "portal", name = "fakewiz1" })
    finishTower(ctx, level, def, WIZ3, [0, 0, 28, 12], G.fakewiz1);
  },
};
