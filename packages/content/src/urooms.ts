// The special rooms the hero stands in (u.urooms), kept in `modData.nh.urooms` as
// `{ level, rooms }` and updated by checkSpecialRoom() (rooms.ts) after every hero move and level
// change. Only typed rooms (`Room.type`: temples, shops) are kept, since only they give entry
// messages, sanctuary or shopkeeping; the entry is absent while she is in none, so levels without
// typed rooms leave the state untouched. ref: include/you.h u.urooms; src/hack.c move_update()
import { inRooms, type Ctx, type Json, type Level } from '@nh/core';

type Table = { [k: string]: Json };
const isObj = (v: Json | undefined): v is Table =>
  v !== null && v !== undefined && typeof v === 'object' && !Array.isArray(v);

/** The typed rooms holding x,y, innermost first. ref: src/hack.c in_rooms(x, y, 0) */
export function specialRoomsAt(level: Level, x: number, y: number): number[] {
  return inRooms(level, x, y).filter((r) => level.rooms[r]?.type !== undefined);
}

/** The typed rooms the hero is in on the current level (u.urooms), innermost first. */
export function uRooms(ctx: Pick<Ctx, 'state'>): number[] {
  const nh = ctx.state.modData['nh'];
  const u = isObj(nh) ? nh['urooms'] : undefined;
  if (!isObj(u) || u['level'] !== ctx.state.currentLevel || !Array.isArray(u['rooms'])) return [];
  return u['rooms'].filter((r): r is number => typeof r === 'number');
}

/** Sets u.urooms on the current level (absent when empty). */
export function setURooms(ctx: Pick<Ctx, 'state'>, rooms: readonly number[]): void {
  const md = ctx.state.modData;
  let nh = md['nh'];
  if (rooms.length === 0) {
    if (isObj(nh)) delete nh['urooms'];
    return;
  }
  if (!isObj(nh)) {
    nh = {};
    md['nh'] = nh;
  }
  nh['urooms'] = { level: ctx.state.currentLevel, rooms: [...rooms] };
}
