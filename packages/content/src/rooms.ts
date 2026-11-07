// Entering special rooms: u.urooms and u.ushops are brought up to date after each hero move and
// level change, and a room just entered may give its entry messages (temples, shops, Delphi,
// treasure zoos).
// ref: src/hack.c check_special_room(), move_update(); src/do.c goto_level()
// (`check_special_room(TRUE)` on leaving, `check_special_room(FALSE)` on arrival); src/save.c
// savemon() -> forget_temple_entry(); src/shk.c after_shk_move()
//
// Not ported: the other special rooms (courts, morgues... are not generated), the Minetown
// achievement, room_discovered() (no overview).
import {
  getPlayer,
  getLevel,
  insideRoom,
  sortedIds,
  type Ctx,
  type EntityId,
  type LevelId,
  type ModApi,
  type Pos,
} from '@nh/core';
import { TEMPLE, epriOf, forgetTempleEntry } from './epri';
import { eshkOf, inhishop, isShopType, uShops } from './eshk';
import { intemple } from './priest';
import { DELPHI, ORACLE } from './oracle';
import { hello, plname, shkArrivals, uEnteredShop, uLeftShop } from './shk';
import { setURooms, specialRoomsAt, storedUShops, uRooms } from './urooms';
import { ZOO, enterZoo } from './zoo';

/**
 * Updates u.urooms and u.ushops from the hero's square (`newlev`: clears them, she is leaving the
 * level), lets the shops she was in see her leave, and gives the entry messages of the shop and
 * typed rooms she has just entered. `from`: her square before the move (u.ux0/u.uy0), if any.
 * ref: src/hack.c check_special_room(), move_update()
 */
export function checkSpecialRoom(ctx: Ctx, newlev: boolean, from?: Pos): void {
  const rooms0 = uRooms(ctx);
  const ushops0 = uShops(ctx);
  if (newlev) {
    // (the shops she left with the level are seen to by leaveShops(), before her pets follow)
    setURooms(ctx, [], [], true);
    return;
  }
  const hp = getPlayer(ctx.state).c.pos;
  if (!hp || hp.level !== ctx.state.currentLevel) return;
  const level = getLevel(ctx.state);
  const rooms = specialRoomsAt(level, hp.x, hp.y);
  const ushops = rooms.filter((r) => isShopType(level.rooms[r]?.type));
  setURooms(ctx, rooms, ushops);
  if (ushops0.length > 0)
    uLeftShop(
      ctx,
      ushops0,
      ushops0.filter((r) => !ushops.includes(r)), // u.ushops_left
      false,
      from,
    );
  const entered = rooms.filter((r) => !rooms0.includes(r)); // u.uentered
  const shopsEntered = ushops.filter((r) => !ushops0.includes(r)); // u.ushops_entered
  if (entered.length === 0 && shopsEntered.length === 0) return; // no entrance messages
  // Did we just enter a shop?
  const shop = shopsEntered[0];
  if (shop !== undefined) uEnteredShop(ctx, shop);
  for (const roomno of entered) {
    const room = level.rooms[roomno];
    // temples remain TEMPLEs and give their message on each entry
    if (room?.type === TEMPLE) intemple(ctx, roomno, rooms0);
    else if (room?.type === DELPHI) {
      enterDelphi(ctx, roomno);
      delete room.type; // everything else gives its message only the first time: rtype = OROOM
    } else if (room?.type === ZOO) {
      delete room.type; // rtype = OROOM (before the zoo's monsters may wake)
      enterZoo(ctx, roomno);
    }
  }
}

/**
 * Entering Delphi: the Oracle, when she is in the room, greets the hero (or not, if angry).
 * ref: src/hack.c check_special_room() case DELPHI (verbalize, monstinroom())
 */
function enterDelphi(ctx: Ctx, roomno: number): void {
  const level = getLevel(ctx.state);
  const room = level.rooms[roomno];
  if (!room) return;
  const oracle = sortedIds(ctx.state)
    .map((id) => ctx.state.entities[String(id)])
    .find((e) => {
      const p = e?.c.pos;
      return (
        e?.def === ORACLE &&
        e.c.monster !== undefined &&
        p?.level === level.id &&
        insideRoom(room, p.x, p.y)
      );
    });
  if (!oracle) return;
  const name = plname(ctx);
  if (oracle.c.monster?.peaceful !== true)
    ctx.emit({ type: 'msg', key: 'oracle.in_delphi', params: { name } });
  else ctx.emit({ type: 'msg', key: 'oracle.welcome', params: { hello: hello(ctx, false), name } });
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
 * She has just left level `from` (at `fromPos`) while in a shop there: u_left_shop() as C runs it
 * from goto_level()'s check_special_room(TRUE), on the old level (made current again for the
 * call), so a robbery is seen there and a shopkeeper who starts following her can come along.
 * ref: src/do.c goto_level() (check_special_room(TRUE) before keepdogs()); src/shk.c
 * u_left_shop(newlev = TRUE)
 */
export function leaveShops(ctx: Ctx, from: LevelId, fromPos: Pos): void {
  const stored = storedUShops(ctx);
  if (!stored || stored.level !== from || stored.ushops.length === 0) return;
  const hero = getPlayer(ctx.state);
  const level = ctx.state.currentLevel;
  const pos = hero.c.pos;
  ctx.state.currentLevel = from;
  hero.c.pos = { level: from, x: fromPos.x, y: fromPos.y };
  try {
    uLeftShop(ctx, stored.ushops, stored.ushops, true);
  } finally {
    ctx.state.currentLevel = level;
    if (pos) hero.c.pos = pos;
    else delete hero.c.pos;
  }
}

/**
 * Registered before the pets (registerDog): leaving a level runs the shops' u_left_shop() first.
 */
export function registerLeaveShops(api: ModApi): void {
  api.on('levelChange', (ctx, change) => {
    if (change.from !== null && change.fromPos !== null)
      leaveShops(ctx, change.from, change.fromPos);
  });
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
    shkArrivals(ctx, change.to);
    checkSpecialRoom(ctx, false);
  });
}
