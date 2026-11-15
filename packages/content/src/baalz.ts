// Baalzebub's lair: a level-sized beetle of walls in solid rock, its rooms inside, a maze walked
// west of it, Baalzebub with his devils, fire traps. ref: dat/baalz.lua; src/mkmaze.c
// baalz_fixup(), fixup_special()
//
// Translation notes (DEVIATIONS.md "Gehennom's lairs (m17)"): the LevelDef is unlit stone with
// the beetle as its map (its contents, stairs and non-diggable walls are relative to it, as in
// the script) and placeholder stairs. Core joins the walls of every map it lays, which takes the
// beetle's legs away (walls with only rock around), so the `before` fixup lays the map again,
// walks the maze west of it (stocked: fill_empty_maze()), makes the down stairs and the locked
// door; the LevelDef's contents follow; the `after` fixup orients the doors, puts the up stairs
// (and a branch) in their level region and runs baalz_fixup(). The level is a "corrmaze" one,
// which in NetHack only stops the finishing wall pass (baalz_fixup() joins the beetle's walls
// itself), so `Level.corrmaze` is not set. The two cells west of each eye (iron bars) that
// baalz_fixup() makes diggable are left out of levelflags.ts's non-diggable area.
import type { Ctx, DefId, Level, LevelContent, LevelDef, LevelRect, MapBlock, Pos } from '@nh/core';
import { mapBlock, VANILLA_TERRAIN, wallifyLevel } from '@nh/core';
import { mapCleanup } from './hellfill';
import { GEHENNOM_SPECIALS, nonDiggable } from './levelflags';
import { mazewalk } from './mazewalk';
import {
  desDoor,
  desLevregion,
  desMap,
  desStair,
  liftStairs,
  mapToLevel,
  orientDoors,
  type SpLevFixup,
} from './sp_lev';
import { T, isStwallId, setTerrain, terrainIdAt } from './terrain';
import { rlocMon } from './trap';
import { mAt } from './wormstate';

/**
 * ref: dat/baalz.lua ("the two pools are fakes used to mark spots which need special wall
 * fixups; the two iron bars are eyes and spots to their left will be made diggable")
 */
const BEETLE: readonly string[] = [
  '-------------------------------------------------',
  '|                   ----               ----      ',
  '|          ----     |     -----------  |         ',
  '| ------      |  ---------|.........|--P         ',
  '| F....|  -------|...........--------------      ',
  '---....|--|..................S............|----  ',
  '+...--....S..----------------|............S...|  ',
  '---....|--|..................|............|----  ',
  '| F....|  -------|...........-----S--------      ',
  '| ------      |  ---------|.........|--P         ',
  '|          ----     |     -----------  |         ',
  '|                   ----               ----      ',
  '-------------------------------------------------',
];

const mon = (id: string, x?: number, y?: number): LevelContent =>
  x === undefined || y === undefined
    ? { kind: 'monster', id: id as DefId }
    : { kind: 'monster', id: id as DefId, x, y };
const cls = (c: string): LevelContent => ({ kind: 'monster', class: c });
const obj = (c: string): LevelContent => ({ kind: 'object', class: c });
const trap = (id: string): LevelContent => ({ kind: 'trap', id: id as DefId });

/** ref: dat/baalz.lua */
export const BAALZ: LevelDef = {
  id: GEHENNOM_SPECIALS.baalz,
  init: { style: 'solidfill', fg: 'nh:stone', lit: false },
  map: { rows: [...BEETLE], halign: 'right', valign: 'center' },
  // placeholders (Level column 0 is never walked); the fixups make the stairs
  stairs: {
    up: { x: 0, y: 0, coords: 'level' },
    down: { x: 0, y: 1, coords: 'level' },
    branch: { x: 0, y: 2, coords: 'level' },
  },
  teleportRegions: [
    { area: [0, 0, 14, 20], coords: 'level', exclude: [14, 1, 69, 16], excludeCoords: 'level' },
  ],
  contents: [
    // The fellow in residence
    mon('nh:baalzebub', 35, 6),
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
    trap('nh:spiked_pit'),
    trap('nh:fire_trap'),
    trap('nh:sleeping_gas_trap'),
    trap('nh:anti_magic_field'),
    trap('nh:fire_trap'),
    trap('nh:magic_trap'),
    trap('nh:magic_trap'),
    // Random monsters.
    mon('nh:ghost', 37, 7),
    mon('nh:horned_devil', 32, 5),
    mon('nh:barbed_devil', 38, 7),
    cls('L'),
    // Some Vampires for good measure ("V": a random monster until vampires exist)
    { kind: 'monster', count: 3 },
  ],
};

/**
 * W_NONDIGGABLE as set_wall_property() gives it: only rock, walls, trees and iron bars carry it.
 * ref: src/sp_lev.c set_wall_property()
 */
function wallNondiggable(ctx: Ctx, level: Level, x: number, y: number): boolean {
  const id = terrainIdAt(level, x, y);
  return (isStwallId(id) || id === T.tree || id === T.iron_bars) && nonDiggable(ctx, level, x, y);
}

/**
 * baalz_fixup(): the beetle's walls joined without losing its legs. The non-diggable area's row
 * through the level's middle and its column next to the left edge give the inner area (one cell
 * inside the area's edge), where walls with only rock around stay and join only to walls; the two
 * pools in it become walls and mark the rear legs' first joints, which the wall pass (over the
 * area and two cells round it) gives a bogus link to the rooms: they become corners again, and a
 * monster on such a spot is moved away. ref: src/mkmaze.c baalz_fixup()
 */
export function baalzFixup(ctx: Ctx, level: Level): void {
  const W = level.width;
  const H = level.height;
  // find low and high x for to-be-wallified portion of level
  let y = Math.trunc(H / 2);
  let x1 = W;
  let lastx: number | null = null;
  let x: number;
  for (x = 0; x < W; x++)
    if (wallNondiggable(ctx, level, x, y)) {
      if (lastx === null) x1 = x + 1;
      lastx = x;
    }
  const x2 = (lastx !== null && lastx > x1 ? lastx : x) - 1;
  // find low and high y for to-be-wallified portion of level
  let y1 = H;
  let lasty: number | null = null;
  for (y = 0; y < H; y++)
    if (wallNondiggable(ctx, level, x1, y)) {
      if (lasty === null) y1 = y + 1;
      lasty = y;
    }
  const y2 = (lasty !== null && lasty > y1 ? lasty : y) - 1;
  // two pools mark where special post-wallify fix-ups are needed
  let del1: Pos | null = null;
  let del2: Pos | null = null;
  for (let px = x1; px <= x2; px++)
    for (let py = y1; py <= y2; py++)
      if (terrainIdAt(level, px, py) === T.pool) {
        setTerrain(level, px, py, T.hwall);
        if (!del1) del1 = { x: px, y: py };
        else del2 = { x: px, y: py };
      }
  const inarea: LevelRect = [x1, y1, x2, y2];
  wallifyLevel(level, VANILLA_TERRAIN, [0, 0, -1, -1], {
    area: [
      Math.max(x1 - 2, 0),
      Math.max(y1 - 2, 0),
      Math.min(x2 + 2, W - 1),
      Math.min(y2 + 2, H - 1),
    ],
    keep: inarea,
  });
  // bughack hack for rear-most legs on baalz level; first joint on both top and bottom gets a
  // bogus extra connection to room area, producing unwanted rectangles; change back to separated
  // legs
  const tee = (p: Pos): boolean => {
    const id = terrainIdAt(level, p.x, p.y);
    return id === T.tlwall || id === T.trwall;
  };
  const moveOff = (p: Pos): void => {
    const m = mAt(ctx.state, level.id, p.x, p.y);
    if (m) rlocMon(ctx, m, false); // something at temporary pool...
  };
  if (del1 && tee(del1) && terrainIdAt(level, del1.x, del1.y + 1) === T.tuwall) {
    const tl = terrainIdAt(level, del1.x, del1.y) === T.tlwall;
    setTerrain(level, del1.x, del1.y, tl ? T.brcorn : T.blcorn);
    setTerrain(level, del1.x, del1.y + 1, T.hwall);
    moveOff(del1);
  }
  if (del2 && tee(del2) && terrainIdAt(level, del2.x, del2.y - 1) === T.tdwall) {
    const tl = terrainIdAt(level, del2.x, del2.y) === T.tlwall;
    setTerrain(level, del2.x, del2.y, tl ? T.trcorn : T.tlcorn);
    setTerrain(level, del2.x, del2.y - 1, T.hwall);
    moveOff(del2);
  }
}

/** Baalzebub's lair: the script in its order, then fixup_special()'s parts. */
export const BAALZ_FIXUP: SpLevFixup = {
  before(ctx, level, def) {
    liftStairs(level);
    // core joined the map's walls, which loses the legs: the map as the script lays it
    const b = mapBlock(def, level.width, level.height) as MapBlock;
    desMap(level, BEETLE, { x: b.x, y: b.y });
    // Non diggable walls: levelflags.ts ("this actually leaves the farthest right column
    // diggable")
    mazewalk(ctx, level, def, 0, 6, 'west', true, true);
    desStair(ctx, level, 'down', mapToLevel(def, level, 44, 6));
    const door = mapToLevel(def, level, 0, 6);
    desDoor(ctx, level, door.x, door.y, 'locked');
  },
  after(ctx, level) {
    // lspo_finalize_level(): no wallification() on a "corrmaze" level
    orientDoors(ctx, level);
    mapCleanup(ctx, level);
    // fixup_special(): the level regions, then baalz_fixup()
    desLevregion(ctx, level, 'stair-up', [0, 0, 14, 20], [14, 1, 69, 16]);
    desLevregion(ctx, level, 'branch', [0, 0, 14, 20], [14, 1, 69, 16]);
    baalzFixup(ctx, level);
  },
};
