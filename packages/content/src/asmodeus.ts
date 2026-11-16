// Asmodeus's lair: his rooms half-left in a maze grid, a corridor half-right whose maze walk
// fills the rest, hell's tweaks outside them, fire traps. ref: dat/asmodeus.lua
//
// Translation notes (DEVIATIONS.md "Gehennom's lairs (m17)"): the LevelDef is unlit stone with
// the first map (so its contents, its unlit region and the non-diggable walls are relative to it,
// as in the script) and placeholder stairs. Its `before` fixup lays the maze grid over the level
// (des.level_init mazegrid), the first map again over it, its doors and down stairs; the
// LevelDef's contents are the first map's; the `after` fixup stamps the second map, walks the
// maze from it (stocked: fill_empty_maze()), makes its contents, runs hell_tweaks() outside the
// grid's inside and the two maps, joins the walls and puts the up stairs (and a branch) in their
// level region, as fixup_special() does. The second part goes where it shares its first column
// with the first part's last, as on NetHack's 80 columns (this port's wider x_maze_max would
// overlap them by three and wall up two of the first part's doors).
import type { Ctx, DefId, Level, LevelContent, LevelDef, MapBlock } from '@nh/core';
import { mapBlock, VANILLA_TERRAIN, wallifyLevel } from '@nh/core';
import { desMazeGrid, mapCleanup } from './hellfill';
import { blockSel, gridInside, hellTweaks } from './helltweaks';
import { madeLevelFlags, setMadeLevelFlags } from './levelflags';
import { spLevMap } from './mazefill';
import { mazewalk } from './mazewalk';
import { selNegate, selOr } from './selection';
import {
  blockDef,
  desDoor,
  desLevregion,
  desMap,
  desMapPlace,
  desStair,
  liftStairs,
  makeContents,
  mapToLevel,
  orientDoors,
  type SpLevFixup,
} from './sp_lev';

/** ref: dat/asmodeus.lua: the first part */
const ASMO1: readonly string[] = [
  '---------------------',
  '|.............|.....|',
  '|.............S.....|',
  '|---+------------...|',
  '|.....|.........|-+--',
  '|..---|.........|....',
  '|..|..S.........|....',
  '|..|..|.........|....',
  '|..|..|.........|-+--',
  '|..|..-----------...|',
  '|..S..........|.....|',
  '---------------------',
];

/** ref: dat/asmodeus.lua: the second part */
const ASMO2: readonly string[] = [
  '---------------------------------',
  '................................|',
  '................................+',
  '................................|',
  '---------------------------------',
];

const mon = (id: string, x?: number, y?: number): LevelContent =>
  x === undefined || y === undefined
    ? { kind: 'monster', id: id as DefId }
    : { kind: 'monster', id: id as DefId, x, y };
const cls = (c: string): LevelContent => ({ kind: 'monster', class: c });
const obj = (c: string): LevelContent => ({ kind: 'object', class: c });
const trap = (id: string, x?: number, y?: number): LevelContent =>
  x === undefined || y === undefined
    ? { kind: 'trap', id: id as DefId }
    : { kind: 'trap', id: id as DefId, x, y };

/**
 * ref: dat/asmodeus.lua. Its id is not its special level's (GEHENNOM_SPECIALS.asmodeus), which
 * is Asmodeus's monster id.
 */
export const ASMODEUS: LevelDef = {
  id: 'nh:asmodeus-lair',
  // des.level_init({ style = "mazegrid", bg = "-" }): the fixup's, before the first map
  init: { style: 'solidfill', fg: 'nh:stone', lit: false },
  map: { rows: [...ASMO1], halign: 'half-left', valign: 'center' },
  // Entire main area
  regions: [{ area: [1, 1, 20, 10], lit: false }],
  // placeholders (Level column 0 is stone in the grid); the fixups make the stairs
  stairs: {
    up: { x: 0, y: 0, coords: 'level' },
    down: { x: 0, y: 1, coords: 'level' },
    branch: { x: 0, y: 2, coords: 'level' },
  },
  teleportRegions: [
    { area: [0, 0, 5, 20], coords: 'level', exclude: [5, 1, 69, 16], excludeCoords: 'level' },
  ],
  // the first part's contents, after its doors and stairs
  contents: [
    // The fellow in residence
    mon('nh:asmodeus', 12, 7),
    // Some random weapons and armor.
    obj('armor'),
    obj('armor'),
    obj('weapon'),
    obj('weapon'),
    obj('gem'),
    obj('potion'),
    obj('potion'),
    obj('scroll'),
    obj('scroll'),
    obj('scroll'),
    // Some traps.
    trap('nh:spiked_pit', 5, 2),
    trap('nh:fire_trap', 8, 6),
    trap('nh:sleeping_gas_trap'),
    trap('nh:anti_magic_field'),
    trap('nh:fire_trap'),
    trap('nh:magic_trap'),
    trap('nh:magic_trap'),
    // Random monsters.
    mon('nh:ghost', 11, 7),
    mon('nh:horned_devil', 10, 5),
    cls('L'),
    // Some Vampires for good measure
    { kind: 'monster', class: 'V', count: 3 },
  ],
};

/** Asmodeus's lair: the script in its order around the first map's contents. */
export const ASMODEUS_FIXUP: SpLevFixup = {
  before(ctx, level, def) {
    liftStairs(level);
    desMazeGrid(level);
    // First part (core laid it on the stone; the grid went over it)
    const b1 = mapBlock(def, level.width, level.height) as MapBlock;
    desMap(level, ASMO1, { x: b1.x, y: b1.y });
    const at = (x: number, y: number) => mapToLevel(def, level, x, y);
    // Doors
    for (const [x, y, st] of [
      [4, 3, 'closed'],
      [18, 4, 'locked'],
      [18, 8, 'closed'],
    ] as const) {
      const p = at(x, y);
      desDoor(ctx, level, p.x, p.y, st);
    }
    desStair(ctx, level, 'down', at(13, 7));
    // Non diggable walls: levelflags.ts; the unlit main area: the LevelDef's region
  },
  after(ctx, level, def) {
    // Second part
    const b1 = mapBlock(def, level.width, level.height) as MapBlock;
    // des.map({ halign = "half-right", valign = "center", ... }): on NetHack's 80 columns it
    // shares its first column with the first part's last one (the same wall and floor), which
    // keeps the first part's two doors there; this port's x_maze_max is two more, which would
    // make them overlap by three columns, so the second part goes where NetHack has it
    const p2 = desMapPlace(level, ASMO2, { halign: 'half-right', valign: 'center' });
    const b2 = desMap(level, ASMO2, { x: b1.x + b1.w - 1, y: p2.y });
    const def2 = blockDef(def, ASMO2, b2);
    const mapCells = spLevMap(level, def);
    for (let y = b2.y; y < b2.y + b2.h; y++)
      for (let x = b2.x; x < b2.x + b2.w; x++) mapCells.add(y * level.width + x);
    mazewalk(ctx, level, def2, 32, 2, 'east', true, true, mapCells);
    // Non diggable walls
    const prev = madeLevelFlags(ctx.state, level.id).nondiggable ?? [];
    setMadeLevelFlags(ctx, level.id, {
      nondiggable: [...prev, [b2.x, b2.y, b2.x + 32, b2.y + 4]],
    });
    const door = mapToLevel(def2, level, 32, 2);
    desDoor(ctx, level, door.x, door.y, 'closed');
    makeContents(ctx, level, def2, [
      cls('&'),
      cls('&'),
      cls('&'),
      trap('nh:anti_magic_field'),
      trap('nh:fire_trap'),
      trap('nh:magic_trap'),
    ]);
    // local protected = bounds2:negate() | asmo1 | asmo2; hell_tweaks(protected)
    hellTweaks(
      ctx,
      level,
      selOr(selOr(selNegate(gridInside(level)), blockSel(level, b1)), blockSel(level, b2)),
    );
    finishLair(ctx, level);
    // des.levregion({ region = {01,00,6,20}, region_islev = 1, exclude = {6,1,70,16},
    // exclude_islev = 1, type = "stair-up" }), and the branch's
    desLevregion(ctx, level, 'stair-up', [0, 0, 5, 20], [5, 1, 69, 16]);
    desLevregion(ctx, level, 'branch', [0, 0, 5, 20], [5, 1, 69, 16]);
  },
};

/**
 * The end of a lair script: doors facing their walls, nothing on liquids, the walls joined.
 * ref: src/sp_lev.c lspo_finalize_level() (link_doors_rooms(), map_cleanup(), wallification())
 */
function finishLair(ctx: Ctx, level: Level): void {
  orientDoors(ctx, level);
  mapCleanup(ctx, level);
  wallifyLevel(level, VANILLA_TERRAIN, [0, 0, -1, -1]); // wallification() only
}
