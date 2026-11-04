// Entering special rooms: u.urooms and u.ushops are brought up to date after each hero move and
// level change, and a room just entered may give its entry messages (temples, shops).
// ref: src/hack.c check_special_room(), move_update(); src/do.c goto_level()
// (`check_special_room(TRUE)` on leaving, `check_special_room(FALSE)` on arrival); src/save.c
// savemon() -> forget_temple_entry(); src/shk.c after_shk_move()
//
// Not ported: the other special rooms (zoos, courts, morgues... are not generated), the Minetown
// achievement, room_discovered() (no overview). u_left_shop() comes with bills (6b3 step 3).
import { getPlayer, getLevel, sortedIds, type Ctx, type EntityId, type ModApi } from '@nh/core';
import { TEMPLE, epriOf, forgetTempleEntry } from './epri';
import { eshkOf, inhishop, isShopType, uShops } from './eshk';
import { intemple } from './priest';
import { uEnteredShop } from './shk';
import { setURooms, specialRoomsAt, uRooms } from './urooms';

/**
 * Updates u.urooms and u.ushops from the hero's square (`newlev`: clears them, she is leaving the
 * level) and gives the entry messages of the shop and typed rooms she has just entered.
 * ref: src/hack.c check_special_room(), move_update()
 */
export function checkSpecialRoom(ctx: Ctx, newlev: boolean): void {
  const rooms0 = uRooms(ctx);
  const ushops0 = uShops(ctx);
  if (newlev) {
    setURooms(ctx, [], [], true);
    return;
  }
  const hp = getPlayer(ctx.state).c.pos;
  if (!hp || hp.level !== ctx.state.currentLevel) return;
  const level = getLevel(ctx.state);
  const rooms = specialRoomsAt(level, hp.x, hp.y);
  const ushops = rooms.filter((r) => isShopType(level.rooms[r]?.type));
  setURooms(ctx, rooms, ushops);
  const entered = rooms.filter((r) => !rooms0.includes(r)); // u.uentered
  const shopsEntered = ushops.filter((r) => !ushops0.includes(r)); // u.ushops_entered
  if (entered.length === 0 && shopsEntered.length === 0) return; // no entrance messages
  // Did we just enter a shop?
  const shop = shopsEntered[0];
  if (shop !== undefined) uEnteredShop(ctx, shop);
  for (const roomno of entered) {
    // temples remain TEMPLEs and give their message on each entry
    if (level.rooms[roomno]?.type === TEMPLE) intemple(ctx, roomno, rooms0);
  }
}

/**
 * After a shopkeeper moves: if he is back in the shop the hero entered while he was away (her
 * u.ushops was cleared), her occupancy is checked again, which greets her now.
 * ref: src/shk.c after_shk_move() (`bill_p == -1000`: his shop is in u.urooms, not in u.ushops)
 */
export function afterShkMove(ctx: Ctx, id: EntityId): void {
  const e = eshkOf(ctx, id);
  if (!e || ctx.state.gameOver || e.shoplevel !== ctx.state.currentLevel) return;
  if (!uRooms(ctx).includes(e.shoproom) || uShops(ctx).includes(e.shoproom)) return;
  if (inhishop(ctx, id)) checkSpecialRoom(ctx, false);
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
