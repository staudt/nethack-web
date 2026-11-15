// Mazes: the `maze` and `mazegrid` LevelDef inits, the maze walk and random maze spots.
// ref: src/mkmaze.c create_maze(), walkfrom(), okay(), maze0xy(), maze_inbounds(),
// maze_remove_deadends(), mazexy(); src/sp_lev.c lvlfill_maze_grid()
import type { Level } from '../types/level';
import type { Pos } from '../types/common';
import type { Rng } from '../types/rng';
import type { LevelTerrain } from './terrain';

/** Working cell kinds of a maze being made (NetHack's STONE, HWALL, and ROOM or CORR). */
export const MZ_STONE = 0;
export const MZ_WALL = 1;
export const MZ_OPEN = 2;

/**
 * NetHack's `x_maze_max` and `y_maze_max` for a level of this size, in NetHack coordinates (x
 * one more than the Level's): `(COLNO - 1) & ~1` with COLNO = width + 1, and `(ROWNO - 1) & ~1`.
 * ref: src/mkmaze.c (set in mklev.c makelevel's clear_level_structures())
 */
export function mazeMax(width: number, height: number): { x: number; y: number } {
  return { x: width & ~1, y: (height - 1) & ~1 };
}

/** mz_move() directions 0..3: north, east, south, west. ref: src/mkmaze.c mz_move() */
const MZ_DIRS: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/**
 * What walkfrom() reads and writes, in Level coordinates. A node two steps away may be walked to
 * when it lies in `minX..maxX` x `minY..maxY` and is still `stone` (okay()).
 */
export interface MazeWalkGrid {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** levl[x][y].typ == STONE: a node not yet walked. */
  stone(x: number, y: number): boolean;
  /** IS_DOOR(): a node the walk passes without carving it. */
  door(x: number, y: number): boolean;
  /** Makes the cell the walk's floor (ROOM, or CORR in a corridor maze). */
  carve(x: number, y: number): void;
}

/**
 * The maze walk from `x`,`y`: carve it (unless a door), then repeatedly pick one of the
 * directions whose node two cells away is still stone (`rn2(n)` of those), carve the cell
 * between and that node (unless a door), and walk on from there; back up when no direction is
 * left. This is NetHack's iterative (MICRO) form, which draws the same rolls as the recursive one.
 * In NetHack coordinates `minX` is 3 - 1 = 2, `minY` 3 and the maxima `x_maze_max - 1` and
 * `y_maze_max`.
 * ref: src/mkmaze.c walkfrom(), okay()
 */
export function walkfrom(rng: Rng, g: MazeWalkGrid, x: number, y: number): void {
  const okay = (cx: number, cy: number, d: number): boolean => {
    const [dx, dy] = MZ_DIRS[d] as readonly [number, number];
    const nx = cx + 2 * dx;
    const ny = cy + 2 * dy;
    if (nx < g.minX || ny < g.minY || nx > g.maxX || ny > g.maxY) return false;
    return g.stone(nx, ny);
  };
  const stack: [number, number][] = [[x, y]];
  if (!g.door(x, y)) g.carve(x, y); // might still be on the edge of a map, so don't overwrite
  while (stack.length > 0) {
    const [tx, ty] = stack[stack.length - 1] as [number, number];
    const dirs: number[] = [];
    for (let a = 0; a < 4; a++) if (okay(tx, ty, a)) dirs.push(a);
    if (dirs.length === 0) {
      stack.pop();
      continue;
    }
    const [dx, dy] = MZ_DIRS[dirs[rng.rn2(dirs.length)] as number] as readonly [number, number];
    g.carve(tx + dx, ty + dy);
    const nx = tx + 2 * dx;
    const ny = ty + 2 * dy;
    if (!g.door(nx, ny)) g.carve(nx, ny);
    stack.push([nx, ny]);
  }
}

/** A maze being made: kinds MZ_* in NetHack coordinates (`colno` = width + 1). */
interface MazeCells {
  colno: number;
  typ: Uint8Array;
}

const at = (m: MazeCells, x: number, y: number): number => y * m.colno + x;

/**
 * Opens a wall next to each dead end (a node with three closed sides, the map edge counting as
 * closed): one of the walls that has an open node behind it, picked with `rn2(n)`. Nodes are
 * visited column by column, seeing the walls already opened.
 * ref: src/mkmaze.c maze_remove_deadends(), maze_inbounds()
 */
function removeDeadends(rng: Rng, m: MazeCells, xmax: number, ymax: number): void {
  const inbounds = (x: number, y: number): boolean => x >= 2 && y >= 2 && x < xmax && y < ymax;
  const open = (x: number, y: number): boolean => m.typ[at(m, x, y)] === MZ_OPEN; // ACCESSIBLE()
  for (let x = 2; x < xmax; x++)
    for (let y = 2; y < ymax; y++) {
      if (!open(x, y) || !(x % 2) || !(y % 2)) continue;
      const dirok: number[] = [];
      let idx2 = 0;
      for (let dir = 0; dir < 4; dir++) {
        const [ddx, ddy] = MZ_DIRS[dir] as readonly [number, number];
        if (!inbounds(x + ddx, y + ddy)) {
          idx2++;
          continue;
        }
        if (!inbounds(x + 2 * ddx, y + 2 * ddy)) {
          idx2++;
          continue;
        }
        if (!open(x + ddx, y + ddy) && open(x + 2 * ddx, y + 2 * ddy)) {
          dirok.push(dir);
          idx2++;
        }
      }
      if (idx2 >= 3 && dirok.length > 0) {
        const [ddx, ddy] = MZ_DIRS[dirok[rng.rn2(dirok.length)] as number] as readonly [
          number,
          number,
        ];
        m.typ[at(m, x + ddx, y + ddy)] = MZ_OPEN;
      }
    }
}

/**
 * A maze over a stone level of `width` x `height`, as MZ_* kinds row-major in Level
 * coordinates. `corrwid` and `wallthick` (1..5, clamped) are the corridor and wall widths;
 * omitted they are random: `rnd(4)`, then `rnd(4) - corrwid`. A one-wide maze of walls and stone
 * nodes over x 2..rdx*2, y 2..rdy*2 (NetHack coordinates, rdx = x_maze_max / (corrwid +
 * wallthick)), or all stone for a corridor maze (`corrmaze`, no walls), is walked from a random
 * odd node (maze0xy()), its dead ends opened when `rmDeadends`, then scaled up to the wanted
 * widths. A level too small for two nodes in a row walks from (3, 3) alone.
 * ref: src/mkmaze.c create_maze(), maze0xy()
 */
export function createMaze(
  rng: Rng,
  width: number,
  height: number,
  opts: { corrwid?: number; wallthick?: number; rmDeadends: boolean; corrmaze: boolean },
): number[] {
  let corrwid = opts.corrwid ?? rng.rnd(4);
  let wallthick = opts.wallthick ?? rng.rnd(4) - corrwid;
  wallthick = Math.min(Math.max(wallthick, 1), 5);
  corrwid = Math.min(Math.max(corrwid, 1), 5);
  const scale = corrwid + wallthick;
  const full = mazeMax(width, height);
  const rdx = Math.trunc(full.x / scale);
  const rdy = Math.trunc(full.y / scale);
  const m: MazeCells = { colno: width + 1, typ: new Uint8Array((width + 1) * height) };
  if (!opts.corrmaze)
    for (let x = 2; x <= rdx * 2; x++)
      for (let y = 2; y <= rdy * 2; y++) m.typ[at(m, x, y)] = x % 2 && y % 2 ? MZ_STONE : MZ_WALL;

  // the bounds for maze0xy() and walkfrom()
  const xmax = rdx * 2;
  const ymax = rdy * 2;
  // ref: maze0xy() (rn2() of at least 1 on a level too small for NetHack's)
  const sx = 3 + 2 * rng.rn2(Math.max((xmax >> 1) - 1, 1));
  const sy = 3 + 2 * rng.rn2(Math.max((ymax >> 1) - 1, 1));
  const inLevel = (x: number, y: number): boolean => x >= 1 && x <= width && y >= 0 && y < height;
  walkfrom(
    rng,
    {
      minX: 2,
      minY: 3,
      maxX: xmax - 1,
      maxY: ymax,
      stone: (x, y) => m.typ[at(m, x + 1, y)] === MZ_STONE,
      door: () => false,
      carve: (x, y) => {
        if (inLevel(x + 1, y)) m.typ[at(m, x + 1, y)] = MZ_OPEN;
      },
    },
    sx - 1,
    sy,
  );
  if (opts.rmDeadends) removeDeadends(rng, m, xmax, ymax);

  // scale the maze up if needed
  if (scale > 2) {
    const tmp = m.typ.slice();
    let x = 2;
    for (let rx = 2; rx < full.x; x++) {
      const mx = x % 2 ? corrwid : x === 2 || x === rdx * 2 ? 1 : wallthick;
      let y = 2;
      for (let ry = 2; ry < full.y; y++) {
        const my = y % 2 ? corrwid : y === 2 || y === rdy * 2 ? 1 : wallthick;
        for (let dx = 0; dx < mx; dx++)
          for (let dy = 0; dy < my; dy++) {
            if (rx + dx >= full.x || ry + dy >= full.y) break;
            m.typ[at(m, rx + dx, ry + dy)] = tmp[at(m, x, y)] as number;
          }
        ry += my;
      }
      rx += mx;
    }
  }
  return toLevelOrder(m, width, height);
}

/**
 * The `mazegrid` init: over x 2..x_maze_max, y 0..y_maze_max (NetHack coordinates) every cell
 * with both coordinates odd and every cell of the top two rows is stone, the others are `bg`
 * (MZ_WALL here); all stone for a corridor maze. ref: src/sp_lev.c lvlfill_maze_grid()
 */
export function mazeGrid(width: number, height: number, corrmaze: boolean): number[] {
  const full = mazeMax(width, height);
  const m: MazeCells = { colno: width + 1, typ: new Uint8Array((width + 1) * height) };
  for (let x = 2; x <= full.x; x++)
    for (let y = 0; y <= full.y; y++)
      m.typ[at(m, x, y)] = corrmaze || y < 2 || (x % 2 && y % 2) ? MZ_STONE : MZ_WALL;
  return toLevelOrder(m, width, height);
}

function toLevelOrder(m: MazeCells, width: number, height: number): number[] {
  const out = new Array<number>(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) out[y * width + x] = m.typ[at(m, x + 1, y)] as number;
  return out;
}

/**
 * A random spot of a maze level's corridors: floor, or corridor on a corridor maze
 * (`Level.corrmaze`): `rnd(x_maze_max)`, `rnd(y_maze_max)` (NetHack coordinates) 100 times,
 * then the first such cell column by column; null when there is none (NetHack panics).
 * ref: src/mkmaze.c mazexy()
 */
export function mazexy(
  rng: Rng,
  level: Readonly<Level>,
  terrain: Pick<LevelTerrain, 'floor' | 'corr'>,
): Pos | null {
  const allowed = level.palette.indexOf(level.corrmaze === true ? terrain.corr : terrain.floor);
  const max = mazeMax(level.width, level.height);
  const ok = (x: number, y: number): boolean => level.cells[y * level.width + x - 1] === allowed;
  for (let cpt = 0; cpt < 100; cpt++) {
    const x = rng.rnd(max.x);
    const y = rng.rnd(max.y);
    if (ok(x, y)) return { x: x - 1, y };
  }
  for (let x = 1; x <= max.x; x++)
    for (let y = 1; y <= max.y; y++) if (ok(x, y)) return { x: x - 1, y };
  return null;
}
