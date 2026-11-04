// A maze carved through the stone of a special level's map block. ref: src/sp_lev.c
// lspo_mazewalk(); src/mkmaze.c walkfrom(), okay(), mz_move()
import type { Ctx, DefId, Level, LevelDef } from '@nh/core';
import { cellIndex, levelDefPos, mapBlock, VANILLA_TERRAIN } from '@nh/core';

/** IS_DOOR(): a door in any state, doorways included (not secret doors). */
const DOORS: ReadonlySet<DefId> = new Set([
  VANILLA_TERRAIN.doorway,
  VANILLA_TERRAIN.door_open_v,
  VANILLA_TERRAIN.door_open_h,
  VANILLA_TERRAIN.door_closed,
  VANILLA_TERRAIN.door_locked,
]);

/** mz_move() directions 0..3: north, east, south, west. */
const MZ: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/**
 * des.mazewalk({ x, y, dir, stocked = false }) with the floor type ROOM: from the map spot `x`,`y`
 * one step `dir`, that cell becomes floor (unless a door), the walk start is moved onto odd
 * NetHack coordinates, and walkfrom() carves a maze through the stone, two cells per step.
 *
 * NetHack's okay() needs the target node to be STONE when the walk runs, before the level's
 * final wall cleanup. Here core's wall cleanup has already run and turned walls surrounded by rock
 * into stone, so a node counts as stone only when its LevelDef map character is ' ' (stone) and
 * the walk has not carved it yet; spots outside the map block were never stone. The bounds and
 * the parity are NetHack's, in its coordinates (x one more than ours; x_maze_max and y_maze_max
 * from the level size). The caller wallifies afterwards (core's wallifyLevel).
 * ref: src/sp_lev.c lspo_mazewalk(); src/mkmaze.c walkfrom() (the MICRO iterative form, which
 * draws the same rolls as the recursive one), okay()
 */
export function mazewalk(
  ctx: Pick<Ctx, 'rng'>,
  level: Level,
  def: LevelDef,
  x: number,
  y: number,
  dir: 'north' | 'south' | 'east' | 'west',
): void {
  const block = mapBlock(def, level.width, level.height);
  const rows = def.map?.rows ?? [];
  const xMazeMax = level.width & ~1; // (COLNO - 1) & ~1 with COLNO = width + 1
  const yMazeMax = (level.height - 1) & ~1;
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
  /** ref: src/mkmaze.c okay(): the node two steps away is in bounds and still stone */
  const okay = (cx: number, cy: number, d: number): boolean => {
    const [dx, dy] = MZ[d] as readonly [number, number];
    const nx = cx + 2 * dx;
    const ny = cy + 2 * dy;
    if (nx < 3 || ny < 3 || nx > xMazeMax || ny > yMazeMax) return false;
    if (!block) return false;
    const mx = nx - 1 - block.x;
    const my = ny - block.y;
    if (rows[my]?.[mx] !== ' ') return false;
    return level.cells[at(nx, ny)] === stone;
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

  // ref: walkfrom()
  const stack: [number, number][] = [[cx, cy]];
  if (!isDoor(cx, cy)) carve(cx, cy);
  while (stack.length > 0) {
    const top = stack[stack.length - 1] as [number, number];
    const [tx, ty] = top;
    const dirs: number[] = [];
    for (let a = 0; a < 4; a++) if (okay(tx, ty, a)) dirs.push(a);
    if (dirs.length === 0) {
      stack.pop();
      continue;
    }
    const d = dirs[ctx.rng.rn2(dirs.length)] as number;
    const [dx, dy] = MZ[d] as readonly [number, number];
    carve(tx + dx, ty + dy);
    const nx = tx + 2 * dx;
    const ny = ty + 2 * dy;
    if (!isDoor(nx, ny)) carve(nx, ny);
    stack.push([nx, ny]);
  }
}
