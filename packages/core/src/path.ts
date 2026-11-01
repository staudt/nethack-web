import type { Pos } from './types/common';
import type { Level } from './types/level';
import type { CellRules } from './movement';
import { DIR_LIST, DIRS, cellIndex, inBounds } from './util';

/**
 * A* over remembered cells. Closed doors are traversable (moving in auto-opens),
 * diagonal moves into/out of intact doors are forbidden (ref: src/hack.c test_move()).
 * Among the shortest paths it picks one with the fewest changes of direction, so travel walks
 * straight where it can instead of zigzagging across rooms (NetHack's travel is equally short
 * but makes no such promise; see DEVIATIONS.md).
 * Returns path excluding `from`, including `to`; [] if equal; null if unreachable.
 */
export function findPath(
  level: Level,
  rules: CellRules,
  memory: readonly number[],
  from: Pos,
  to: Pos,
): Pos[] | null {
  const { width, height } = level;
  if (!inBounds(level, from.x, from.y) || !inBounds(level, to.x, to.y)) return null;
  const start = cellIndex(level, from.x, from.y);
  const goal = cellIndex(level, to.x, to.y);
  if (start === goal) return [];

  const walkable = (i: number): boolean => {
    const m = memory[i] ?? -1;
    if (m < 0) return false;
    return rules.passable[m] === true || rules.closedDoor[m] === true;
  };
  if (!walkable(goal)) return null;

  // States are (cell, direction of the move that entered it); cost is [steps, turns], compared
  // lexicographically, so the step count stays optimal and turns only break ties.
  const D = DIR_LIST.length;
  const n = width * height;
  const steps = new Int32Array(n * D).fill(-1);
  const turns = new Int32Array(n * D).fill(0);
  const parent = new Int32Array(n * D).fill(-1);
  const h = (i: number): number => {
    const x = i % width;
    return Math.max(Math.abs(x - to.x), Math.abs((i - x) / width - to.y));
  };
  // Binary heap of [f, turns, h, state]; ties fall back to the state index for determinism.
  type Node = [number, number, number, number];
  const less = (a: Node, b: Node): boolean =>
    a[0] !== b[0]
      ? a[0] < b[0]
      : a[1] !== b[1]
        ? a[1] < b[1]
        : a[2] !== b[2]
          ? a[2] < b[2]
          : a[3] < b[3];
  const heap: Node[] = [];
  const push = (node: Node): void => {
    let i = heap.length;
    heap.push(node);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(node, heap[p] as Node)) break;
      heap[i] = heap[p] as Node;
      i = p;
    }
    heap[i] = node;
  };
  const pop = (): Node => {
    const top = heap[0] as Node;
    const last = heap.pop() as Node;
    if (heap.length > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= heap.length) break;
        if (c + 1 < heap.length && less(heap[c + 1] as Node, heap[c] as Node)) c++;
        if (!less(heap[c] as Node, last)) break;
        heap[i] = heap[c] as Node;
        i = c;
      }
      heap[i] = last;
    }
    return top;
  };

  // The start has no direction yet: seed its moves directly.
  const relax = (
    fromState: number,
    fromCell: number,
    fromDir: number,
    cs: number,
    ct: number,
  ): void => {
    const cx = fromCell % width;
    const cy = (fromCell - cx) / width;
    const curDoor = rules.intactDoor[memory[fromCell] as number] === true;
    for (let dir = 0; dir < D; dir++) {
      const d = DIRS[DIR_LIST[dir] as (typeof DIR_LIST)[number]];
      const nx = cx + d.x;
      const ny = cy + d.y;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = ny * width + nx;
      if (!walkable(ni)) continue;
      if (d.x !== 0 && d.y !== 0 && (curDoor || rules.intactDoor[memory[ni] as number] === true))
        continue;
      const ns = cs + 1;
      const nt = ct + (fromDir >= 0 && fromDir !== dir ? 1 : 0);
      const state = ni * D + dir;
      const os = steps[state] as number;
      if (os !== -1 && (os < ns || (os === ns && (turns[state] as number) <= nt))) continue;
      steps[state] = ns;
      turns[state] = nt;
      parent[state] = fromState;
      push([ns + h(ni), nt, h(ni), state]);
    }
  };
  relax(-1, start, -1, 0, 0);
  let found = -1;
  while (heap.length > 0) {
    const [f, t, , state] = pop();
    const cell = Math.floor(state / D);
    const cs = steps[state] as number;
    if (f !== cs + h(cell) || t !== turns[state]) continue; // stale entry
    if (cell === goal) {
      found = state;
      break;
    }
    relax(state, cell, state % D, cs, t);
  }
  if (found === -1) return null;
  const path: Pos[] = [];
  for (let st = found; st !== -1; st = parent[st] as number) {
    const i = Math.floor(st / D);
    const x = i % width;
    path.push({ x, y: (i - x) / width });
  }
  return path.reverse();
}
