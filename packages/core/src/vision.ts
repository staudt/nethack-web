import type { Pos } from './types/common';
import type { Level } from './types/level';
import type { CellRules } from './movement';

/**
 * Symmetric recursive shadowcasting (Albert Ford) from (ox, oy), out to `maxDepth` steps along
 * each quadrant's axis: 1 for cells in line of sight. Opaque cells that bound the view are
 * included.
 */
function lineOfSight(
  level: Level,
  rules: CellRules,
  ox: number,
  oy: number,
  maxDepth: number,
  blocked: ReadonlySet<number>,
) {
  const { width, height, cells } = level;
  const los = new Uint8Array(width * height);
  if (ox < 0 || oy < 0 || ox >= width || oy >= height) return los;
  los[oy * width + ox] = 1;

  const opaque = rules.opaque;
  // quadrant k: 0 north, 1 east, 2 south, 3 west
  const tileX = (q: number, depth: number, col: number): number =>
    q === 0 || q === 2 ? ox + col : q === 1 ? ox + depth : ox - depth;
  const tileY = (q: number, depth: number, col: number): number =>
    q === 1 || q === 3 ? oy + col : q === 0 ? oy - depth : oy + depth;

  // Slopes are exact fractions sn/sd (sd > 0).
  const scan = (
    q: number,
    depth: number,
    sn0: number,
    sd0: number,
    en0: number,
    ed0: number,
  ): void => {
    if (depth > maxDepth) return;
    let sn = sn0;
    let sd = sd0;
    // min_col = round_ties_up(depth * start) ; max_col = round_ties_down(depth * end)
    const minCol = Math.floor((2 * depth * sn + sd) / (2 * sd));
    const maxCol = Math.ceil((2 * depth * en0 - ed0) / (2 * ed0));
    let prevWall = -1; // -1 none, 1 wall, 0 floor
    for (let col = minCol; col <= maxCol; col++) {
      const x = tileX(q, depth, col);
      const y = tileY(q, depth, col);
      const inb = x >= 0 && y >= 0 && x < width && y < height;
      const idx = y * width + x;
      const wall = !inb || opaque[cells[idx] ?? 0] === true || blocked.has(idx);
      // is_symmetric: col in [depth*start, depth*end]
      const sym = col * sd >= depth * sn && col * ed0 <= depth * en0;
      if (inb && (wall || sym)) los[idx] = 1;
      if (prevWall === 1 && !wall) {
        sn = 2 * col - 1;
        sd = 2 * depth;
      }
      if (prevWall === 0 && wall) {
        scan(q, depth + 1, sn, sd, 2 * col - 1, 2 * depth);
      }
      prevWall = wall ? 1 : 0;
    }
    if (prevWall === 0) scan(q, depth + 1, sn, sd, en0, ed0);
  };
  for (let q = 0; q < 4; q++) scan(q, 1, -1, 1, 1, 1);
  return los;
}

const NO_BLOCKERS: ReadonlySet<number> = new Set();

/** ref: src/vision.c circle_data[] and circle_start[]: half-widths of each row of a circle. */
const CIRCLE_DATA = [
  0, 1, 1, 2, 2, 1, 3, 3, 2, 1, 4, 4, 4, 3, 2, 5, 5, 5, 4, 3, 2, 6, 6, 6, 5, 5, 4, 2, 7, 7, 7, 6, 6,
  5, 4, 2, 8, 8, 8, 7, 7, 6, 6, 4, 2, 9, 9, 9, 9, 8, 8, 7, 6, 5, 3, 10, 10, 10, 10, 9, 9, 8, 7, 6,
  5, 3, 11, 11, 11, 11, 10, 10, 9, 9, 8, 7, 5, 3, 12, 12, 12, 12, 11, 11, 10, 10, 9, 8, 7, 5, 3, 13,
  13, 13, 13, 12, 12, 12, 11, 10, 10, 9, 7, 6, 3, 14, 14, 14, 14, 13, 13, 13, 12, 12, 11, 10, 9, 8,
  6, 3, 15, 15, 15, 15, 14, 14, 14, 13, 13, 12, 11, 10, 9, 8, 6, 3,
];
/** ref: include/vision.h MAX_RADIUS */
export const MAX_LIGHT_RADIUS = 15;

/** A light source for `computeVisible`: a cell and a radius (clamped to 0..MAX_LIGHT_RADIUS). */
export interface LightAt {
  x: number;
  y: number;
  radius: number;
}

/**
 * Cells lit by light sources: those within each source's circle that the source can see.
 * A source on the hero's cell uses the hero's line of sight. ref: src/light.c do_light_sources()
 * (clear_path() from the source is replaced by shadowcasting from it, as for the hero).
 */
function tempLit(
  level: Level,
  rules: CellRules,
  heroLos: Uint8Array,
  ox: number,
  oy: number,
  lights: readonly LightAt[],
  blocked: ReadonlySet<number>,
): Uint8Array | null {
  if (lights.length === 0) return null;
  const { width, height } = level;
  const out = new Uint8Array(width * height);
  for (const l of lights) {
    const r = Math.max(0, Math.min(MAX_LIGHT_RADIUS, Math.trunc(l.radius)));
    if (!Number.isFinite(r) || l.x < 0 || l.y < 0 || l.x >= width || l.y >= height) continue;
    const los =
      l.x === ox && l.y === oy ? heroLos : lineOfSight(level, rules, l.x, l.y, r, blocked);
    const base = (r * (r + 1)) / 2; // circle_start[r]
    for (let dy = -r; dy <= r; dy++) {
      const y = l.y + dy;
      if (y < 0 || y >= height) continue;
      const half = CIRCLE_DATA[base + Math.abs(dy)] ?? 0;
      for (let x = Math.max(0, l.x - half); x <= Math.min(width - 1, l.x + half); x++) {
        const i = y * width + x;
        if (los[i] === 1) out[i] = 1;
      }
    }
  }
  return out;
}

/**
 * Cells the hero at `from` can see: in line of sight AND (adjacent OR lit), where a lit wall or
 * closed door also needs its neighbor toward the hero to be lit. A cell is lit when `Level.lit`
 * says so or a light source in `lights` lights it.
 * ref: src/vision.c vision_recalc() -- a position is IN_SIGHT if COULD_SEE and
 * (lev->lit || TEMP_LIT), or if it is next to the hero (night vision radius 1,
 * "We see this position because of night- or xray-vision").
 * Line of sight uses symmetric recursive shadowcasting (Albert Ford) rather than
 * vision.c's clear_path tables; see DEVIATIONS.md. `blocked` holds extra cell indices that block
 * sight like opaque terrain (boulders: `sightBlockers`; ref: src/vision.c does_block()).
 */
export function computeVisible(
  level: Level,
  rules: CellRules,
  from: Pos,
  lights: readonly LightAt[] = [],
  blocked: ReadonlySet<number> = NO_BLOCKERS,
): number[] {
  const { width, height, cells } = level;
  const ox = from.x;
  const oy = from.y;
  if (ox < 0 || oy < 0 || ox >= width || oy >= height) return [];
  const los = lineOfSight(level, rules, ox, oy, Infinity, blocked);
  const temp = tempLit(level, rules, los, ox, oy, lights, blocked);
  const opaque = rules.opaque;
  const n = width * height;
  const out: number[] = [];
  const lit = (i: number): boolean => level.lit[i] === 1 || temp?.[i] === 1;
  for (let i = 0; i < n; i++) {
    if (los[i] !== 1) continue;
    const x = i % width;
    const y = (i - x) / width;
    // Night vision: the hero always sees the cells next to her.
    if (Math.abs(x - ox) <= 1 && Math.abs(y - oy) <= 1) {
      out.push(i);
      continue;
    }
    if (!lit(i)) continue;
    // ref: vision_recalc() "Make sure doors, walls, boulders or mimics don't show up at the end
    // of dark hallways": a lit cell that blocks sight is seen only if the cell next to it,
    // one step toward the hero, is lit too.
    if (opaque[cells[i] ?? 0] === true || blocked.has(i)) {
      const nx = x + Math.sign(ox - x);
      const ny = y + Math.sign(oy - y);
      if (!lit(ny * width + nx)) continue;
    }
    out.push(i);
  }
  return out;
}

export function newMemory(level: Level): number[] {
  return new Array<number>(level.width * level.height).fill(-1);
}

/** Records currently visible terrain; returns the (sorted) indices whose remembered value changed. */
export function updateMemory(memory: number[], level: Level, visible: readonly number[]): number[] {
  const changed: number[] = [];
  for (const i of visible) {
    const v = level.cells[i] ?? 0;
    if (memory[i] !== v) {
      memory[i] = v;
      changed.push(i);
    }
  }
  return changed.sort((a, b) => a - b);
}
