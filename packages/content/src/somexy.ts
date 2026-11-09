// Random squares in a room. A leaf: mklev.ts, mkroom.ts and zoo.ts share it.
// ref: src/mkroom.c somexy(), somexyspace(); src/mklev.c occupied()
import type { Ctx, Level, Pos, Room } from '@nh/core';
import { cellIndex, trapAt } from '@nh/core';

/**
 * Whether x,y holds a trap or furniture. ref: src/mklev.c occupied() (t_at() or IS_FURNITURE();
 * no lava, pools or invocation square here). Anything but plain floor counts as furniture, as
 * the floor is the only room square that is not.
 */
export function occupied(level: Level, x: number, y: number): boolean {
  const t = level.palette[level.cells[cellIndex(level, x, y)] ?? 0];
  return t !== 'nh:floor' || trapAt(level, x, y) !== undefined;
}

/**
 * somexyspace() as C returns it: the last square tried and whether it is free plain floor (up
 * to 101 tries; `pos` is the last one even when `ok` is false, as callers that ignore the
 * result use it). ref: src/mkroom.c somexyspace(): somexy() = rn1(hx - lx + 1, lx),
 * rn1(hy - ly + 1, ly), which must be ROOM floor and not occupied() (monsters are ignored)
 */
export function somexyspaceTry(
  ctx: Pick<Ctx, 'rng'>,
  level: Level,
  room: Room,
): { pos: Pos; ok: boolean } {
  let pos: Pos = { x: room.lx, y: room.ly };
  for (let trycnt = 0; trycnt <= 100; trycnt++) {
    pos = {
      x: room.lx + ctx.rng.rn2(room.hx - room.lx + 1),
      y: room.ly + ctx.rng.rn2(room.hy - room.ly + 1),
    };
    if (!occupied(level, pos.x, pos.y)) return { pos, ok: true };
  }
  return { pos, ok: false };
}

/**
 * A random free floor square in the room, or null after 100 failed tries (101 attempts).
 * ref: src/mkroom.c somexyspace()
 */
export function somexyspace(ctx: Pick<Ctx, 'rng'>, level: Level, room: Room): Pos | null {
  const r = somexyspaceTry(ctx, level, room);
  return r.ok ? r.pos : null;
}
