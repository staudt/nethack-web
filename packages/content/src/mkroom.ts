// makelevel()'s special room: up to one shop, throne room, leprechaun hall, zoo... per ordinary
// level, by depth. The chain only types the room (`Room.type`); shknam.ts stocks shops and zoo.ts
// fills the others with the rest of the level, as fill_special_room() does.
// ref: src/mklev.c makelevel(); src/mkroom.c do_mkroom(), pick_room(), mkzoo(), has_upstairs(),
// has_dnstairs()
//
// Not ported (DEVIATIONS.md "Special rooms"): temples, beehives, morgues, antholes, barracks,
// swamps and cockatrice nests are not made yet: their roll is drawn and, when it hits, no room
// is made (the chain stops there, as C's would with that room); the wizard-mode SHOPTYPE and
// pick_room()'s `|| wizard`.
import type { Ctx, DefId, Level, Room } from '@nh/core';
import { TEMPLE } from './epri';
import { antholemon } from './roommon';
import { mkshop } from './shknam';
import { isGenocided } from './vanquished';
import {
  ANTHOLE,
  BARRACKS,
  BEEHIVE,
  COCKNEST,
  COURT,
  FILLED_ZOO_KINDS,
  LEPREHALL,
  MORGUE,
  SWAMP,
  ZOO,
  roomDoors,
} from './zoo';

const inside = (r: Room, x: number, y: number): boolean =>
  x >= r.lx && x <= r.hx && y >= r.ly && y <= r.hy;

/**
 * Up stairs (or a ladder) inside the room. The branch stairs count as up stairs: C places them
 * after the special room, outside it (place_branch() avoids typed rooms), and here they already
 * exist. ref: src/mkroom.c has_upstairs()
 */
export function hasUpstairs(level: Level, room: Room): boolean {
  const b = level.branch?.pos;
  return (
    (level.up !== null && inside(room, level.up.x, level.up.y)) ||
    (b !== undefined && inside(room, b.x, b.y))
  );
}

/** Down stairs inside the room. ref: src/mkroom.c has_dnstairs() */
export function hasDnstairs(level: Level, room: Room): boolean {
  return level.down !== null && inside(room, level.down.x, level.down.y);
}

/** The indexes of NetHack's `svr.rooms[]`: the rooms that are not subrooms. */
const topRooms = (level: Level): number[] =>
  level.rooms.flatMap((r, i) => (r.parent === undefined ? [i] : []));

/**
 * An unused room, preferably with only one door: starting at a random room and wrapping round,
 * the first ordinary room with no up stairs (not strict: down stairs only 1 time in 3; strict:
 * none) that has one door, or else passes a 1 in 5 roll. ref: src/mkroom.c pick_room() (no
 * vault ends the list yet; no wizard shortcut)
 */
export function pickRoom(ctx: Ctx, level: Level, strict: boolean): number | null {
  const rooms = topRooms(level);
  const nroom = rooms.length;
  if (nroom === 0) return null;
  let k = ctx.rng.rn2(nroom);
  for (let i = nroom; i-- > 0; k++) {
    if (k === nroom) k = 0;
    const idx = rooms[k] as number;
    const sroom = level.rooms[idx] as Room;
    if (sroom.type !== undefined) continue; // rtype != OROOM
    if (!strict) {
      if (hasUpstairs(level, sroom) || (hasDnstairs(level, sroom) && ctx.rng.rn2(3))) continue;
    } else if (hasUpstairs(level, sroom) || hasDnstairs(level, sroom)) continue;
    if (roomDoors(ctx, level, idx, true).length === 1 || !ctx.rng.rn2(5)) return idx;
  }
  return null;
}

/**
 * Types a room for a zoo-like kind (it is filled with the rest of the level). ref: src/mkroom.c
 * mkzoo()
 */
export function mkzoo(ctx: Ctx, level: Level, type: DefId): void {
  const sroom = pickRoom(ctx, level, false);
  const r = sroom === null ? undefined : level.rooms[sroom];
  if (r) r.type = type; // needfill = FILL_NORMAL: `filled` absent
}

/**
 * Makes a special room of `type`: a shop for any shop type, else a zoo-like room. The kinds not
 * built yet make nothing. ref: src/mkroom.c do_mkroom()
 */
export function doMkroom(ctx: Ctx, level: Level, type: DefId | 'shop'): void {
  if (type === 'shop') mkshop(ctx, level);
  else if (FILLED_ZOO_KINDS.includes(type)) mkzoo(ctx, level, type);
}

/**
 * Makes up to one special room on an ordinary level, by depth: a shop below the first level
 * when there are at least 3 rooms (4 on a branch level) `rn2(depth) < 3` of the time (no Medusa
 * level yet, so no lower bound), else below DL4 a throne room 1 time in 6, below DL5 a
 * leprechaun hall 1 in 8, below DL6 a zoo 1 in 7, below DL8 a temple 1 in 5, below DL9 a
 * beehive 1 in 5, below DL11 a morgue 1 in 6, below DL12 an anthole 1 in 8, below DL14 barracks
 * 1 in 4, below DL15 a swamp 1 in 6, below DL16 a cockatrice nest 1 in 8; the leprechaun hall,
 * beehive, barracks and nest only while their monster is not genocided, the anthole while an
 * ant is left. ref: src/mklev.c makelevel() (no vault, so the threshold never rises)
 */
export function mkSpecialRoom(ctx: Ctx, level: Level): void {
  const nroom = topRooms(level).length;
  const roomThreshold = level.branch ? 4 : 3; // minimum number of rooms for a special room
  const uDepth = level.depth;
  const rn2 = (n: number): number => ctx.rng.rn2(n);
  const gone = (id: DefId): boolean => isGenocided(ctx.state, id);
  if (uDepth > 1 && nroom >= roomThreshold && rn2(uDepth) < 3) doMkroom(ctx, level, 'shop');
  else if (uDepth > 4 && !rn2(6)) doMkroom(ctx, level, COURT);
  else if (uDepth > 5 && !rn2(8) && !gone('nh:leprechaun')) doMkroom(ctx, level, LEPREHALL);
  else if (uDepth > 6 && !rn2(7)) doMkroom(ctx, level, ZOO);
  else if (uDepth > 8 && !rn2(5)) doMkroom(ctx, level, TEMPLE);
  else if (uDepth > 9 && !rn2(5) && !gone('nh:killer_bee')) doMkroom(ctx, level, BEEHIVE);
  else if (uDepth > 11 && !rn2(6)) doMkroom(ctx, level, MORGUE);
  else if (uDepth > 12 && !rn2(8) && antholemon(ctx.state, ctx.defs, uDepth))
    doMkroom(ctx, level, ANTHOLE);
  else if (uDepth > 14 && !rn2(4) && !gone('nh:soldier')) doMkroom(ctx, level, BARRACKS);
  else if (uDepth > 15 && !rn2(6)) doMkroom(ctx, level, SWAMP);
  else if (uDepth > 16 && !rn2(8) && !gone('nh:cockatrice')) doMkroom(ctx, level, COCKNEST);
}
