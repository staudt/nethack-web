// The invocation's change of the level: around the vibrating square (where the hero reads the
// Book) the maze gives way to rings of lit floor, a ring of fire traps and a wide moat, and the
// square becomes the stairs down to the Sanctum. Imported by deadbook.ts (and minliquid.ts, which
// registers itself here).
// ref: src/mklev.c mkinvokearea(), mkinvpos(), mkinvk_check_wall()
//
// Not ported: the buried ball (no ball and chain), the --More-- and the ring-by-ring display
// delay (the view is recomputed once, at the end of the action).
import {
  cellIndex,
  getLevel,
  getPlayer,
  itemsAt,
  mazeMax,
  type Ctx,
  type Entity,
  type Level,
} from '@nh/core';
import { BOULDER, fractureRock } from './boulder';
import { isPool } from './liquid';
import { mappearance, seemimic } from './mimicstate';
import { T, isStwallId, setTerrain, terrainIdAt } from './terrain';
import { TRAP, maketrap, mintrap } from './trap';
import { setUtrap, utrap } from './trapstate';
import { mAt } from './wormstate';

const say = (ctx: Ctx, key: string): void => ctx.emit({ type: 'msg', key });

/** minliquid() with the hero moving (minliquid.ts registers it at load: it sits above this leaf) */
let minliquidHook: ((ctx: Ctx, mon: Entity) => void) | null = null;
export function setInvokeMinliquid(fn: (ctx: Ctx, mon: Entity) => void): void {
  minliquidHook = fn;
}

/** Stone, a wall or iron bars: the walls that "bend and crumble". ref: src/mklev.c mkinvk_check_wall() */
function checkWall(level: Readonly<Level>, x: number, y: number): number {
  if (x < 0 || x >= level.width || y < 0 || y >= level.height) return 0; // !isok()
  const id = terrainIdAt(level, x, y);
  return isStwallId(id) || id === T.iron_bars ? 1 : 0;
}

/**
 * One square of the ring at distance `dist` (0 the middle): its trap goes, its boulders too (one
 * left as rocks where neither moat nor fire trap goes), it is lit (but the outer ring) and becomes
 * floor, floor with a seen fire trap (ring 1, unless it is a pool) or moat (rings 4 and 5); a
 * monster there shows itself if it was mimicking and meets the trap or the water. Squares outside
 * the maze's bounds are left alone. ref: src/mklev.c mkinvpos()
 */
function mkinvpos(ctx: Ctx, level: Level, x: number, y: number, dist: number): void {
  // clip at existing map borders if necessary (C's x_maze_min 2, y_maze_min 2; our columns are
  // one less than C's)
  const max = mazeMax(level.width, level.height);
  if (x + 1 < 2 || y < 2 || x + 1 > max.x || y > max.y) return;
  // clear traps
  if (level.traps.some((t) => t.x === x && t.y === y)) ctx.removeTrap(level.id, { x, y });
  // clear boulders; leave some rocks for non-{moat|trap} locations
  let makeRocks = dist !== 1 && dist !== 4 && dist !== 5;
  for (;;) {
    const b = itemsAt(ctx.defs, ctx.state, level.id, x, y).find((e) => e.def === BOULDER);
    if (!b) break;
    if (makeRocks) {
      fractureRock(ctx, b, false);
      makeRocks = false; // don't bother with more rocks
    } else ctx.remove(b.id); // obj_extract_self(), obfree()
  }
  if (dist < 6) level.lit[cellIndex(level, x, y)] = 1;
  switch (dist) {
    case 1: // fire traps
      if (isPool(ctx, level, x, y)) break;
      setTerrain(level, x, y, T.floor);
      maketrap(ctx, level.id, x, y, TRAP.fire).seen = true;
      break;
    case 4: // pools (aka a wide moat)
    case 5:
      setTerrain(level, x, y, T.moat); // No kelp!
      break;
    default: // 0, 2, 3: lit room locations; 6: unlit room locations
      setTerrain(level, x, y, T.floor);
      break;
  }
  const mon = mAt(ctx.state, level.id, x, y);
  if (mon) {
    // wake up mimics, don't want to deal with them blocking vision
    if (mappearance(ctx, mon.id)) seemimic(ctx, mon.id);
    if (level.traps.some((t) => t.x === x && t.y === y)) mintrap(ctx, mon.id);
    else minliquidHook?.(ctx, mon);
  }
}

/**
 * The invocation done: "The floor shakes violently under you!", "The walls around you begin to
 * bend and crumble!" when stone, walls or iron bars stand within the area, the hero let out of any
 * trap, the area rebuilt ring by ring out from her (mkinvpos(); the area is wider than it is high:
 * ring 3 adds no rows), then "You are standing at the top of a stairwell leading down!" and the
 * down stairs under her. ref: src/mklev.c mkinvokearea()
 */
export function mkinvokearea(ctx: Ctx): void {
  const p = getPlayer(ctx.state).c.pos;
  if (!p) return;
  const level = getLevel(ctx.state, p.level);
  // slightly odd if levitating, but not wrong
  say(ctx, 'invoke.floor_shakes');
  // decide whether to issue the crumbling walls message: the loop below, stopping at a wall
  let xmin = p.x;
  let xmax = p.x;
  let ymin = p.y;
  let ymax = p.y;
  let wallct = checkWall(level, xmin, ymin);
  for (let dist = 1; !wallct && dist < 7; ++dist) {
    xmin--;
    xmax++;
    // top and bottom
    if (dist !== 3) {
      ymin--;
      ymax++;
      for (let i = xmin + 1; i < xmax; i++)
        wallct += checkWall(level, i, ymin) + checkWall(level, i, ymax);
    }
    // left and right
    if (!wallct)
      for (let i = ymin; i <= ymax; i++)
        wallct += checkWall(level, xmin, i) + checkWall(level, xmax, i);
  }
  if (wallct) say(ctx, 'invoke.walls_crumble');

  // any trap hero is stuck in will be going away now
  const u = utrap(ctx);
  if (u) setUtrap(ctx, 0, u.type); // reset_utrap(FALSE)

  xmin = xmax = p.x; // reset after the check for walls
  ymin = ymax = p.y;
  mkinvpos(ctx, level, xmin, ymin, 0); // middle, before placing stairs
  for (let dist = 1; dist < 7; dist++) {
    xmin--;
    xmax++;
    // top and bottom
    if (dist !== 3) {
      // the area is wider that it is high
      ymin--;
      ymax++;
      for (let i = xmin + 1; i < xmax; i++) {
        mkinvpos(ctx, level, i, ymin, dist);
        mkinvpos(ctx, level, i, ymax, dist);
      }
    }
    // left and right
    for (let i = ymin; i <= ymax; i++) {
      mkinvpos(ctx, level, xmin, i, dist);
      mkinvpos(ctx, level, xmax, i, dist);
    }
  }
  say(ctx, 'invoke.stairwell');
  // mkstairs(u.ux, u.uy, 0, NULL, FALSE): down
  setTerrain(level, p.x, p.y, T.stairs_down);
  level.down = { x: p.x, y: p.y };
}
