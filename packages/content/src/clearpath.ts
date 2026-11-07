// Line of sight between two squares. ref: src/vision.c clear_path()
import { cellIndex, inBounds, type Level } from '@nh/core';

/**
 * Whether the straight (Bresenham) line from (x1,y1) to (x2,y2) is free of opaque cells and of
 * the `blocked` cell indices (boulders: boulder.ts `blockersOf()`); the end points themselves are
 * not checked. Out-of-bounds counts as blocked.
 * ref: src/vision.c clear_path() / q1_path..q4_path() (viz_clear: does_block())
 */
export function clearPath(
  level: Level,
  opaque: readonly boolean[],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  blocked: ReadonlySet<number>,
): boolean {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const sx = Math.sign(x2 - x1);
  const sy = Math.sign(y2 - y1);
  let x = x1;
  let y = y1;
  const clear = (): boolean => {
    if (!inBounds(level, x, y)) return false;
    const i = cellIndex(level, x, y);
    return opaque[level.cells[i] ?? 0] !== true && !blocked.has(i);
  };
  if (dy > dx) {
    let err = 2 * dx - dy;
    for (let k = dy - 1; k > 0; k--) {
      if (err >= 0) {
        x += sx;
        err -= 2 * dy;
      }
      y += sy;
      err += 2 * dx;
      if (!clear()) return false;
    }
  } else {
    let err = 2 * dy - dx;
    for (let k = dx - 1; k > 0; k--) {
      if (err >= 0) {
        y += sy;
        err -= 2 * dx;
      }
      x += sx;
      err += 2 * dy;
      if (!clear()) return false;
    }
  }
  return true;
}
