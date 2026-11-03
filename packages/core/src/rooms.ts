// Room queries on a level. ref: src/mkroom.c inside_room(), src/hack.c in_town()
import type { Level, Room } from './types/level';

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
