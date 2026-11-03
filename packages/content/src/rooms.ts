// Entering special rooms: u.urooms is brought up to date after each hero move and level change,
// and a room just entered may give its entry messages (temples now; shops in 6b3).
// ref: src/hack.c check_special_room(), move_update(); src/do.c goto_level()
// (`check_special_room(TRUE)` on leaving, `check_special_room(FALSE)` on arrival); src/save.c
// savemon() -> forget_temple_entry()
//
// Not ported: the other special rooms (zoos, courts, morgues... are not generated), the Minetown
// achievement, room_discovered() (no overview).
import { getPlayer, getLevel, sortedIds, type Ctx, type ModApi } from '@nh/core';
import { TEMPLE, epriOf, forgetTempleEntry } from './epri';
import { intemple } from './priest';
import { setURooms, specialRoomsAt, uRooms } from './urooms';

/**
 * Updates u.urooms from the hero's square (`newlev`: clears it, she is leaving the level) and
 * gives the entry messages of the typed rooms she has just entered.
 * ref: src/hack.c check_special_room(), move_update()
 */
export function checkSpecialRoom(ctx: Ctx, newlev: boolean): void {
  const rooms0 = uRooms(ctx);
  if (newlev) {
    setURooms(ctx, []);
    return;
  }
  const hp = getPlayer(ctx.state).c.pos;
  if (!hp || hp.level !== ctx.state.currentLevel) return;
  const level = getLevel(ctx.state);
  const rooms = specialRoomsAt(level, hp.x, hp.y);
  setURooms(ctx, rooms);
  for (const roomno of rooms) {
    if (rooms0.includes(roomno)) continue; // not just entered (u.uentered)
    // temples remain TEMPLEs and give their message on each entry
    if (level.rooms[roomno]?.type === TEMPLE) intemple(ctx, roomno, rooms0);
  }
}

/**
 * On arrival on a level: the priests there forget the hero's last visit (C does it when the
 * level is saved on leaving), then u.urooms starts afresh and she may have arrived in a temple.
 */
export function registerRooms(api: ModApi): void {
  api.on('levelChange', (ctx, change) => {
    for (const id of sortedIds(ctx.state)) {
      const epri = epriOf(ctx, id);
      if (epri && epri.shrlevel === change.to) forgetTempleEntry(epri);
    }
    checkSpecialRoom(ctx, true);
    checkSpecialRoom(ctx, false);
  });
}
