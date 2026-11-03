// Room queries on a level. ref: src/mkroom.c inside_room(), somexy(); src/hack.c in_town()
import type { Pos } from './types/common';
import type { Level, Room } from './types/level';
import type { Rng } from './types/rng';

/** In the room or on its walls. ref: src/mkroom.c inside_room() for a regular room */
export function insideRoom(room: Room, x: number, y: number): boolean {
  return x >= room.lx - 1 && x <= room.hx + 1 && y >= room.ly - 1 && y <= room.hy + 1;
}

/**
 * Whether x,y is in the town of a town level: inside a top-level room that has subrooms, or
 * anywhere on the level when no room has any. ref: src/hack.c in_town()
 */
export function inTown(level: Level, x: number, y: number): boolean {
  if (level.town !== true) return false;
  let hasSubrooms = false;
  for (let i = 0; i < level.rooms.length; i++) {
    const room = level.rooms[i];
    if (!room || room.parent !== undefined || !level.rooms.some((r) => r.parent === i)) continue;
    hasSubrooms = true;
    if (insideRoom(room, x, y)) return true;
  }
  return !hasSubrooms;
}

/**
 * Whether x,y is on the floor of `level.rooms[index]` and not in one of its subrooms (or their
 * walls): the room's own cells (ref: levl[x][y].roomno == the room's number).
 */
export function roomHas(level: Level, index: number, x: number, y: number): boolean {
  const room = level.rooms[index];
  if (!room || x < room.lx || x > room.hx || y < room.ly || y > room.hy) return false;
  return !level.rooms.some((r) => r.parent === index && insideRoom(r, x, y));
}

/**
 * A random floor cell of `level.rooms[index]`; a room with subrooms (an irregular room in
 * NetHack) tries 100 random cells outside them, then takes the first in column order, or null.
 * ref: src/mkroom.c somexy()
 */
export function roomSomexy(rng: Rng, level: Level, index: number): Pos | null {
  const room = level.rooms[index];
  if (!room) return null;
  const pick = (): Pos => ({
    x: room.lx + rng.rn2(room.hx - room.lx + 1),
    y: room.ly + rng.rn2(room.hy - room.ly + 1),
  });
  if (!level.rooms.some((r) => r.parent === index)) return pick();
  for (let tries = 0; tries < 100; tries++) {
    const p = pick();
    if (roomHas(level, index, p.x, p.y)) return p;
  }
  for (let x = room.lx; x <= room.hx; x++)
    for (let y = room.ly; y <= room.hy; y++) if (roomHas(level, index, x, y)) return { x, y };
  return null;
}

/**
 * The rooms whose cells or walls hold x,y, innermost (highest index) first: a room's own floor
 * and walls, not the inside of its subrooms, so a subroom's wall or door counts for both the
 * subroom and its parent (NetHack's SHARED roomno). Empty outside every room.
 * ref: src/hack.c in_rooms(x, y, 0), with `levl[x][y].roomno` from src/mklev.c topologize()
 */
export function inRooms(level: Level, x: number, y: number): number[] {
  const out: number[] = [];
  for (let i = level.rooms.length - 1; i >= 0; i--) {
    const room = level.rooms[i];
    if (!room || !insideRoom(room, x, y)) continue;
    const inSub = level.rooms.some(
      (r) => r.parent === i && x >= r.lx && x <= r.hx && y >= r.ly && y <= r.hy,
    );
    if (!inSub) out.push(i);
  }
  return out;
}
