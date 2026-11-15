// A maze carved through the stone of a special level's map block. ref: src/sp_lev.c
// lspo_mazewalk(); src/mkmaze.c walkfrom() (core's), okay()
import type { Ctx, DefId, Level, LevelDef } from '@nh/core';
import { cellIndex, levelDefPos, mapBlock, mazeMax, VANILLA_TERRAIN, walkfrom } from '@nh/core';
import { fillEmptyMaze } from './mazefill';

/** IS_DOOR(): a door in any state, doorways included (not secret doors). */
const DOORS: ReadonlySet<DefId> = new Set([
  VANILLA_TERRAIN.doorway,
  VANILLA_TERRAIN.door_open_v,
  VANILLA_TERRAIN.door_open_h,
  VANILLA_TERRAIN.door_closed,
  VANILLA_TERRAIN.door_locked,
]);

/**
 * des.mazewalk({ x, y, dir, stocked }) with the floor type ROOM: from the map spot `x`,`y`
 * one step `dir`, that cell becomes floor (unless a door), the walk start is moved onto odd
 * NetHack coordinates, and core's walkfrom() carves a maze through the stone, two cells per
 * step; `stocked` (lua's default true) then fills it (fill_empty_maze()).
 *
 * NetHack's okay() needs the target node to be STONE when the walk runs, before the level's
 * final wall cleanup. Here core's wall cleanup has already run and turned walls surrounded by rock
 * into stone, so a node counts as stone only when its LevelDef map character is ' ' (stone) and
 * the walk has not carved it yet; spots outside the map block were never stone, but on a
 * `mazegrid` level (the Castle), whose grid nodes there were stone and whose grid walls the
 * cleanup turned to stone, a spot outside the block is stone until carved. The bounds and
 * the parity are NetHack's, in its coordinates (x one more than ours; x_maze_max and y_maze_max
 * from the level size). The caller wallifies afterwards (core's wallifyLevel).
 * ref: src/sp_lev.c lspo_mazewalk(); src/mkmaze.c walkfrom(), okay()
 */
export function mazewalk(
  ctx: Ctx,
  level: Level,
  def: LevelDef,
  x: number,
  y: number,
  dir: 'north' | 'south' | 'east' | 'west',
  stocked = true,
): void {
  const block = mapBlock(def, level.width, level.height);
  // a maze grid's nodes outside the map block were stone (lvlfill_maze_grid())
  const grid = def.init.style === 'mazegrid';
  const rows = def.map?.rows ?? [];
  const max = mazeMax(level.width, level.height);
  let floor = level.palette.indexOf(VANILLA_TERRAIN.floor);
  if (floor === -1) floor = level.palette.push(VANILLA_TERRAIN.floor) - 1;
  const stone = level.palette.indexOf(VANILLA_TERRAIN.stone);
  const at = (cx: number, cy: number): number => cellIndex(level, cx - 1, cy);
  const isDoor = (cx: number, cy: number): boolean => {
    const id = level.palette[level.cells[at(cx, cy)] ?? -1];
    return id !== undefined && DOORS.has(id);
  };
  const carve = (cx: number, cy: number): void => {
    level.cells[at(cx, cy)] = floor;
  };

  // NetHack coordinates of the start
  const p = levelDefPos(def, level.width, level.height, x, y, undefined, `${def.id} mazewalk`);
  let cx = p.x + 1;
  let cy = p.y;
  if (dir === 'north') cy--;
  else if (dir === 'south') cy++;
  else if (dir === 'east') cx++;
  else cx--;
  if (!isDoor(cx, cy)) carve(cx, cy);
  if (cx % 2 === 0) {
    cx += dir === 'east' ? 1 : -1;
    carve(cx, cy); // no IS_DOOR check, as in C
  }
  if (cy % 2 === 0) cy += dir === 'south' ? 1 : -1;

  // ref: walkfrom(), okay(): a node in bounds, still stone (in Level coordinates here)
  walkfrom(
    ctx.rng,
    {
      minX: 2,
      minY: 3,
      maxX: max.x - 1,
      maxY: max.y,
      stone: (lx, ly) => {
        const inBlock =
          block !== null &&
          lx >= block.x &&
          lx < block.x + block.w &&
          ly >= block.y &&
          ly < block.y + block.h;
        if (inBlock) {
          if (rows[ly - block.y]?.[lx - block.x] !== ' ') return false;
        } else if (!grid) return false;
        return level.cells[cellIndex(level, lx, ly)] === stone;
      },
      door: (lx, ly) => isDoor(lx + 1, ly),
      carve: (lx, ly) => carve(lx + 1, ly),
    },
    cx - 1,
    cy,
  );
  if (stocked) fillEmptyMaze(ctx, level, def);
}
