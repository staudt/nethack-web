// The invocation level (the level above Gehennom's bottom) without the invocation: its vibrating
// square, where it goes, and the clue the hero feels standing on it. A leaf: trap.ts (the trap
// kind and its monster side), actions.ts (the move and '>') and mazefill.ts (the level) use it.
// ref: src/mkmaze.c pick_vibrasquare_location(); src/hack.c invocation_pos(),
// invocation_message(); src/mklev.c occupied()
import { getPlayer, mazeMax, trapAt, type Ctx, type DefId, type Level, type Pos } from '@nh/core';
import { setUvibrated } from './dbstate';
import { invocationLev } from './levelflags';
import { isPoolOrLava } from './liquid';
import { isFurnitureId, isObstructedId, terrainIdAt } from './terrain';
import { flying, levitating } from './trapstate';

/** The vibrating square's TrapDef id (VIBRATING_SQUARE): never random, never destroyed. */
export const VIBRATING_SQUARE: DefId = 'nh:vibrating_square';

/**
 * A trap kind nothing destroys, digs through or overwrites (the magic portal comes later).
 * ref: include/trap.h undestroyable_trap()
 */
export const undestroyableTrap = (def: DefId): boolean => def === VIBRATING_SQUARE;

/**
 * Where the vibrating square goes: a random spot inside the maze margins (C columns `rn1(x_range,
 * x_maze_min + 5)`, rows `rn1(y_range, y_maze_min + 4)`) that is not in line with the up stairs
 * (same row, column or diagonal), more than 11 squares from them, and open ground with no trap,
 * furniture, pool or lava; after 1000 tries the last one is taken. With no up stairs the first
 * spot is taken. ref: src/mkmaze.c pick_vibrasquare_location()
 */
export function pickVibrasquareLocation(ctx: Pick<Ctx, 'rng' | 'defs'>, level: Level): Pos {
  const X_MAZE_MIN = 2;
  const Y_MAZE_MIN = 2;
  const INVPOS_X_MARGIN = 6 - 2;
  const INVPOS_Y_MARGIN = 5 - 2;
  const INVPOS_DISTANCE = 11;
  const max = mazeMax(level.width, level.height);
  const xRange = Math.max(1, max.x - X_MAZE_MIN - 2 * INVPOS_X_MARGIN - 1);
  const yRange = Math.max(1, max.y - Y_MAZE_MIN - 2 * INVPOS_Y_MARGIN - 1);
  // C columns are one more than ours
  const up = level.up ? { x: level.up.x + 1, y: level.up.y } : null;
  const open = (cx: number, cy: number): boolean => {
    const x = cx - 1;
    if (x < 0 || x >= level.width || cy < 0 || cy >= level.height) return false;
    const id = terrainIdAt(level, x, cy);
    if (id === undefined || isObstructedId(id)) return false;
    const t = ctx.defs.terrain(id);
    // SPACE_POS() and not occupied(): no trap, furniture, pool or lava
    return (
      t.passable &&
      t.door === undefined &&
      !isFurnitureId(ctx.defs, id) &&
      !isPoolOrLava(ctx, level, x, cy) &&
      !trapAt(level, x, cy)
    );
  };
  let x: number;
  let y: number;
  let trycnt = 0;
  do {
    x = ctx.rng.rn2(xRange) + X_MAZE_MIN + INVPOS_X_MARGIN + 1;
    y = ctx.rng.rn2(yRange) + Y_MAZE_MIN + INVPOS_Y_MARGIN + 1;
    if (++trycnt > 1000) break;
  } while (
    up !== null &&
    (x === up.x ||
      y === up.y ||
      Math.abs(x - up.x) === Math.abs(y - up.y) ||
      Math.max(Math.abs(x - up.x), Math.abs(y - up.y)) <= INVPOS_DISTANCE ||
      !open(x, y))
  );
  return { x: x - 1, y };
}

/**
 * The hero is on the invocation position: the vibrating square of the invocation level.
 * ref: src/hack.c invocation_pos()
 */
export function invocationPos(
  ctx: Pick<Ctx, 'state'>,
  level: Readonly<Level>,
  x: number,
  y: number,
): boolean {
  return invocationLev(ctx.state, level) && trapAt(level, x, y)?.def === VIBRATING_SQUARE;
}

/**
 * After she moves onto the vibrating square (not by stairs): "You feel a strange vibration under
 * your feet." ("beneath you" when floating or flying), stopping a run. No Candelabrum yet.
 * ref: src/hack.c invocation_message() (no steed)
 */
export function invocationMessage(ctx: Ctx): void {
  const p = getPlayer(ctx.state).c.pos;
  const level = p ? ctx.state.levels[p.level] : undefined;
  if (!p || !level || !invocationPos(ctx, level, p.x, p.y)) return;
  const id = terrainIdAt(level, p.x, p.y);
  if (id !== undefined && ctx.defs.terrain(id).stairs !== undefined) return; // !On_stairs()
  ctx.interrupt(); // nomul(0): stop running or travelling
  ctx.emit({
    type: 'msg',
    key: levitating(ctx) || flying(ctx) ? 'invocation.vibration_beneath' : 'invocation.vibration',
  });
  setUvibrated(ctx);
}
