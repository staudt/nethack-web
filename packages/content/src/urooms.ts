// The special rooms the hero stands in (u.urooms), kept in `modData.nh.urooms` as
// `{ level, rooms, ushops?, emptyShops? }` and updated by checkSpecialRoom() (rooms.ts) after every
// hero move and level change. Only typed rooms (`Room.type`: temples, shops) are kept, since only
// they give entry messages, sanctuary or shopkeeping; the entry is absent while she is in none and
// remembers no empty shop, so levels without typed rooms leave the state untouched.
// `ushops` (u.ushops) is the shops among `rooms`, unless entering an untended shop cleared it;
// `emptyShops` is shk.c's `empty_shops`, the untended shops already announced.
// ref: include/you.h u.urooms, u.ushops; src/hack.c move_update(); src/shk.c u_entered_shop()
import { inRooms, type Ctx, type Json, type Level } from '@nh/core';

type Table = { [k: string]: Json };
const isObj = (v: Json | undefined): v is Table =>
  v !== null && v !== undefined && typeof v === 'object' && !Array.isArray(v);

/** The typed rooms holding x,y, innermost first. ref: src/hack.c in_rooms(x, y, 0) */
export function specialRoomsAt(level: Level, x: number, y: number): number[] {
  return inRooms(level, x, y).filter((r) => level.rooms[r]?.type !== undefined);
}

function entry(ctx: Pick<Ctx, 'state'>): Table | null {
  const nh = ctx.state.modData['nh'];
  const u = isObj(nh) ? nh['urooms'] : undefined;
  return isObj(u) && u['level'] === ctx.state.currentLevel ? u : null;
}

function list(u: Table | null, key: string): number[] {
  const v = u?.[key];
  return Array.isArray(v) ? v.filter((r): r is number => typeof r === 'number') : [];
}

/** The typed rooms the hero is in on the current level (u.urooms), innermost first. */
export function uRooms(ctx: Pick<Ctx, 'state'>): number[] {
  return list(entry(ctx), 'rooms');
}

/** The shops the hero is in on the current level (u.ushops), innermost first. */
export function uShopRooms(ctx: Pick<Ctx, 'state'>): number[] {
  return list(entry(ctx), 'ushops');
}

/** The untended shops whose message was given (shk.c `empty_shops`). */
export function emptyShops(ctx: Pick<Ctx, 'state'>): number[] {
  return list(entry(ctx), 'emptyShops');
}

function write(
  ctx: Pick<Ctx, 'state'>,
  rooms: readonly number[],
  ushops: readonly number[],
  empty: readonly number[],
): void {
  const md = ctx.state.modData;
  let nh = md['nh'];
  if (rooms.length === 0 && empty.length === 0) {
    if (isObj(nh)) delete nh['urooms'];
    return;
  }
  if (!isObj(nh)) {
    nh = {};
    md['nh'] = nh;
  }
  const u: Table = { level: ctx.state.currentLevel, rooms: [...rooms] };
  if (ushops.length > 0) u['ushops'] = [...ushops];
  if (empty.length > 0) u['emptyShops'] = [...empty];
  nh['urooms'] = u;
}

/**
 * Sets u.urooms and u.ushops on the current level, keeping the empty-shop memory (`newlev`: she
 * is leaving the level, which forgets it too).
 */
export function setURooms(
  ctx: Pick<Ctx, 'state'>,
  rooms: readonly number[],
  ushops: readonly number[],
  newlev = false,
): void {
  write(ctx, rooms, ushops, newlev ? [] : emptyShops(ctx));
}

/** Sets shk.c's `empty_shops`. */
export function setEmptyShops(ctx: Pick<Ctx, 'state'>, shops: readonly number[]): void {
  write(ctx, uRooms(ctx), uShopRooms(ctx), shops);
}
