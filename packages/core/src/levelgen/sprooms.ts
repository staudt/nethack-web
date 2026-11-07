// LevelDef rooms: 5x5-grid and random rooms, subrooms, room doors, random corridors, and the
// room-relative features and stairs. The rooms are laid out on the ordinary generator's Grid
// (NetHack coordinates, x one more than ours), so create_room(), join() and dig_corridor() are
// shared with ordinary levels, then the cells they changed are written back to the level.
// ref: src/sp_lev.c lspo_room(), build_room(), create_room(), create_subroom(), create_door(),
//   lspo_random_corridors(); src/mklev.c add_subroom(), makecorridors()
import type { DefId, Pos } from '../types/common';
import type { Room } from '../types/level';
import type { FeatureDef, RoomDef, RoomDoorDef } from '../types/mod';
import { insideRoom, roomHas, roomSomexy } from '../rooms';
import { setFeature, type Builder, type Key } from './builder';
import { ensureConnected, makeCorridors, okdoor } from './corridors';
import { D_CLOSED, D_HORIZ, D_ISOPEN, D_LOCKED, Grid, isObstructed, T, type IRoom } from './grid';
import { RectList } from './rect';
import { createRoom, litstateRnd, type RoomParams } from './rooms';
import { roomDefPos } from './spdef';

/** Grid type and door mask of each terrain key; any other terrain is open furniture (T.FURN). */
const KEY_GRID: Partial<Record<Key, [number, number]>> = {
  stone: [T.STONE, 0],
  vwall: [T.VWALL, 0],
  hwall: [T.HWALL, 0],
  tlcorn: [T.TLCORNER, 0],
  trcorn: [T.TRCORNER, 0],
  blcorn: [T.BLCORNER, 0],
  brcorn: [T.BRCORNER, 0],
  // T-walls and crosses: walls where no door goes (okdoor() wants HWALL or VWALL)
  crwall: [T.TLCORNER, 0],
  tuwall: [T.TLCORNER, 0],
  tdwall: [T.TLCORNER, 0],
  tlwall: [T.TLCORNER, 0],
  trwall: [T.TLCORNER, 0],
  doorway: [T.DOOR, 0],
  door_open_v: [T.DOOR, D_ISOPEN],
  door_open_h: [T.DOOR, D_ISOPEN | D_HORIZ],
  door_closed: [T.DOOR, D_CLOSED],
  door_locked: [T.DOOR, D_LOCKED],
  sdoor_v: [T.SDOOR, D_CLOSED],
  sdoor_h: [T.SDOOR, D_CLOSED | D_HORIZ],
  sdoor_locked_v: [T.SDOOR, D_LOCKED],
  sdoor_locked_h: [T.SDOOR, D_LOCKED | D_HORIZ],
  floor: [T.ROOM, 0],
  corr: [T.CORR, 0],
  scorr: [T.SCORR, 0],
  tree: [T.TREE, 0],
};

const GRID_KEY: Key[] = [];
GRID_KEY[T.STONE] = 'stone';
GRID_KEY[T.VWALL] = 'vwall';
GRID_KEY[T.HWALL] = 'hwall';
GRID_KEY[T.TLCORNER] = 'tlcorn';
GRID_KEY[T.TRCORNER] = 'trcorn';
GRID_KEY[T.BLCORNER] = 'blcorn';
GRID_KEY[T.BRCORNER] = 'brcorn';
GRID_KEY[T.CORR] = 'corr';
GRID_KEY[T.ROOM] = 'floor';
GRID_KEY[T.SCORR] = 'scorr';
GRID_KEY[T.TREE] = 'tree';

/** Terrain key of a grid door or secret door from its mask. */
function doorKey(typ: number, mask: number): Key {
  const horiz = (mask & D_HORIZ) !== 0;
  if (typ === T.SDOOR)
    return mask & D_LOCKED
      ? horiz
        ? 'sdoor_locked_h'
        : 'sdoor_locked_v'
      : horiz
        ? 'sdoor_h'
        : 'sdoor_v';
  if (mask & D_LOCKED) return 'door_locked';
  if (mask & D_CLOSED) return 'door_closed';
  if (mask & D_ISOPEN) return horiz ? 'door_open_h' : 'door_open_v';
  return 'doorway';
}

/** The level as a Grid, cell for cell. */
function toGrid(b: Builder): Grid {
  const { level } = b;
  const g = new Grid(level.width, level.height);
  for (let y = 0; y < level.height; y++)
    for (let x = 0; x < level.width; x++) {
      const i = y * level.width + x;
      const k = b.key(i);
      const [typ, mask] = (k !== undefined && KEY_GRID[k]) || [T.FURN, 0];
      const gi = g.idx(x + 1, y);
      g.typ[gi] = typ;
      g.dmask[gi] = mask;
      g.lit[gi] = level.lit[i] ?? 0;
    }
  return g;
}

/** The cells the rooms and corridors changed, and the lighting, back on the level. */
function fromGrid(b: Builder, g: Grid, typ0: Uint8Array, mask0: Uint8Array): void {
  const { level } = b;
  for (let y = 0; y < level.height; y++)
    for (let x = 0; x < level.width; x++) {
      const i = y * level.width + x;
      const gi = g.idx(x + 1, y);
      const typ = g.typ[gi] as number;
      const mask = g.dmask[gi] as number;
      level.lit[i] = g.lit[gi] ? 1 : 0;
      if (typ === typ0[gi] && mask === mask0[gi]) continue;
      b.put(i, typ === T.DOOR || typ === T.SDOOR ? doorKey(typ, mask) : (GRID_KEY[typ] as Key));
    }
  // dig_corridor()'s boulders, for content to make (see Level.boulderSpots)
  if (g.boulders.length > 0)
    level.boulderSpots = [
      ...(level.boulderSpots ?? []),
      ...g.boulders.map((p) => ({ x: p.x - 1, y: p.y })),
    ];
  // trapped doors, for content to keep (see Level.trappedDoorSpots)
  if (g.trappedDoors.length > 0)
    level.trappedDoorSpots = [
      ...(level.trappedDoorSpots ?? []),
      ...g.trappedDoors.map((p) => ({ x: p.x - 1, y: p.y })),
    ];
}

const XALIGN = { left: 1, center: 3, right: 5 } as const;
const YALIGN = { top: 1, center: 3, bottom: 5 } as const;

/**
 * Walls, floor and lighting of a subroom. Corners are left to the level's final wallification.
 * ref: src/mklev.c add_subroom(), do_room_or_subroom() with is_room FALSE
 */
function addSubroom(
  g: Grid,
  proom: IRoom,
  lowx: number,
  lowy: number,
  hix: number,
  hiy: number,
  lit: boolean,
): IRoom {
  if (lit)
    for (let x = lowx - 1; x <= hix + 1; x++)
      for (let y = Math.max(lowy - 1, 0); y <= hiy + 1; y++) g.lit[g.idx(x, y)] = 1;
  for (let x = lowx - 1; x <= hix + 1; x++)
    for (let y = lowy - 1; y <= hiy + 1; y += hiy - lowy + 2) g.set(x, y, T.HWALL);
  for (let x = lowx - 1; x <= hix + 1; x += hix - lowx + 2)
    for (let y = lowy; y <= hiy; y++) g.set(x, y, T.VWALL);
  for (let x = lowx; x <= hix; x++) for (let y = lowy; y <= hiy; y++) g.set(x, y, T.ROOM);
  const room: IRoom = { lx: lowx, ly: lowy, hx: hix, hy: hiy, lit };
  (proom.sub ??= []).push(room);
  return room;
}

/**
 * A subroom at x,y (offset of its floor in the parent's floor) of size w,h, any of them random.
 * A position next to the parent's wall moves onto it (shared wall). A subroom whose walls would
 * leave the level is not made (C would write outside the map).
 * ref: src/sp_lev.c create_subroom()
 */
function createSubroom(
  g: Grid,
  b: Builder,
  proom: IRoom,
  rd: RoomDef,
  lit: boolean | undefined,
): IRoom | null {
  const { rng, level } = b;
  const width = proom.hx - proom.lx + 1;
  const height = proom.hy - proom.ly + 1;
  // there is a minimum size for the parent room
  if (width < 4 || height < 4) return null;
  let w = rd.w ?? -1;
  let h = rd.h ?? -1;
  let x = rd.x ?? -1;
  let y = rd.y ?? -1;
  if (w === -1) w = rng.rnd(width - 3);
  if (h === -1) h = rng.rnd(height - 3);
  if ((x === -1 && width - w < 1) || (y === -1 && height - h < 1)) return null;
  if (x === -1) x = rng.rnd(width - w);
  if (y === -1) y = rng.rnd(height - h);
  if (x === 1) x = 0;
  if (y === 1) y = 0;
  if (x + w + 1 === width) x++;
  if (y + h + 1 === height) y++;
  const rlit = lit ?? litstateRnd(rng, level.depth);
  const lowx = proom.lx + x;
  const lowy = proom.ly + y;
  const hix = lowx + w - 1;
  const hiy = lowy + h - 1;
  if (lowx - 1 < 1 || lowy - 1 < 0 || hix + 1 > g.colno - 1 || hiy + 1 > g.rowno - 1) return null;
  return addSubroom(g, proom, lowx, lowy, hix, hiy, rlit);
}

const WALL_BITS = { north: 1, south: 2, east: 4, west: 8 } as const;
const W_ANY = 15;
const STATE_MASK: Record<string, number> = {
  open: D_ISOPEN,
  closed: D_CLOSED,
  locked: D_LOCKED,
  nodoor: 0,
  broken: 0, // D_BROKEN: a doorway here, as dokick makes
};

/**
 * A door on a wall of `room`: a random wall among those allowed whose outside is open, at `pos`
 * or a random cell of it, where okdoor() allows (100 tries, else no door). A `random` state is
 * create_door()'s table (lspo_door() draws rnddoor() first, unused). A trapped door goes into
 * `g.trappedDoors`. ref: src/sp_lev.c lspo_door(), create_door()
 */
function createDoor(g: Grid, b: Builder, room: IRoom, dd: RoomDoorDef): void {
  const { rng } = b;
  const dwall = dd.wall === undefined || dd.wall === 'random' ? W_ANY : WALL_BITS[dd.wall];
  const dpos = dd.pos ?? -1;
  let mask: number;
  let trapped = false;
  if (dd.state === 'random') {
    rng.rn2(5); // rnddoor()
    if (rng.rn2(3) === 0) {
      if (rng.rn2(5) === 0) mask = D_ISOPEN;
      else if (rng.rn2(6) === 0) mask = D_LOCKED;
      else mask = D_CLOSED;
      if (mask !== D_ISOPEN && rng.rn2(25) === 0) trapped = true; // D_TRAPPED
    } else mask = 0; // D_NODOOR
  } else mask = STATE_MASK[dd.state] ?? 0;
  const open = (x: number, y: number): boolean => g.isok(x, y) && !isObstructed(g.get(x, y));
  for (let trycnt = 0; trycnt < 100; trycnt++) {
    let x: number;
    let y: number;
    switch (rng.rn2(4)) {
      case 0:
        if (!(dwall & WALL_BITS.north)) continue;
        y = room.ly - 1;
        x = room.lx + (dpos === -1 ? rng.rn2(1 + room.hx - room.lx) : dpos);
        if (!open(x, y - 1)) continue;
        break;
      case 1:
        if (!(dwall & WALL_BITS.south)) continue;
        y = room.hy + 1;
        x = room.lx + (dpos === -1 ? rng.rn2(1 + room.hx - room.lx) : dpos);
        if (!open(x, y + 1)) continue;
        break;
      case 2:
        if (!(dwall & WALL_BITS.west)) continue;
        x = room.lx - 1;
        y = room.ly + (dpos === -1 ? rng.rn2(1 + room.hy - room.ly) : dpos);
        if (!open(x - 1, y)) continue;
        break;
      default:
        if (!(dwall & WALL_BITS.east)) continue;
        x = room.hx + 1;
        y = room.ly + (dpos === -1 ? rng.rn2(1 + room.hy - room.ly) : dpos);
        if (!open(x + 1, y)) continue;
        break;
    }
    if (!g.isok(x, y) || !okdoor(g, x, y)) continue;
    const horiz = g.get(x, y) === T.HWALL ? D_HORIZ : 0;
    g.set(x, y, T.DOOR);
    g.setMask(x, y, mask | horiz);
    if (trapped) g.trappedDoors.push({ x, y });
    return;
  }
  // C: impossible("create_door: Can't find a proper place!")
}

/** A room made from a RoomDef, before it is added to the level. */
interface Built {
  room: IRoom;
  rd: RoomDef;
  path: number[];
  parent: number | undefined; // index in the built list
  type: DefId | undefined;
}

/**
 * Makes `def.rooms` (each room, then its subrooms in order, then its doors) and, with
 * `corridors: 'random'`, joins the top-level rooms in the order they were made (sp_lev does not
 * sort them) and makes sure all are connected. Rooms go to `Level.rooms` parent first, each
 * subroom after its parent; then the room features are placed. Returns the Level.rooms index of
 * the rooms that asked for the up and down stairs.
 * ref: src/sp_lev.c lspo_room(), build_room(), spo_endroom(), lspo_random_corridors(),
 *   create_corridor(); src/mklev.c makecorridors()
 */
export function placeRooms(b: Builder): { up?: number; down?: number } {
  const { def, level, rng } = b;
  if (def.rooms === undefined && def.corridors === undefined) return {};
  const g = toGrid(b);
  const typ0 = g.typ.slice();
  const mask0 = g.dmask.slice();
  const rects = new RectList(g.colno, g.rowno);
  const built: Built[] = [];

  const build = (list: readonly RoomDef[], parent: number | undefined, prefix: number[]): void => {
    for (const [n, rd] of list.entries()) {
      // lua `if percent(n) then des.room(...)`
      if (rd.percent !== undefined && rng.rn2(100) >= rd.percent) continue;
      // build_room(): rtype = (!chance || rn2(100) < chance) ? type : OROOM
      const type = rd.chance !== undefined && rng.rn2(100) >= rd.chance ? undefined : rd.type;
      const proom = parent === undefined ? undefined : (built[parent] as Built).room;
      let room: IRoom | null;
      if (proom) room = createSubroom(g, b, proom, rd, rd.lit);
      else {
        const p: RoomParams = {
          x: rd.x ?? -1,
          y: rd.y ?? -1,
          w: rd.w ?? -1,
          h: rd.h ?? -1,
          xal: rd.xalign === undefined ? -1 : XALIGN[rd.xalign],
          yal: rd.yalign === undefined ? -1 : YALIGN[rd.yalign],
        };
        room = createRoom(g, rects, rng, level.depth, p, rd.lit);
      }
      // a room that failed takes its subrooms and contents with it
      if (!room) continue;
      const at = built.push({ room, rd, path: [...prefix, n], parent, type }) - 1;
      if (rd.rooms) build(rd.rooms, at, [...prefix, n]);
      for (const dd of rd.doors ?? []) createDoor(g, b, room, dd);
    }
  };
  build(def.rooms ?? [], undefined, []);

  if (def.corridors === 'random') {
    makeCorridors(g, rng, level.depth);
    ensureConnected(g);
  }
  fromGrid(b, g, typ0, mask0);

  // Level.rooms: parent first, subrooms after it (depth-first)
  const base = level.rooms.length;
  const order: number[] = [];
  const visit = (i: number): void => {
    order.push(i);
    built.forEach((e, j) => {
      if (e.parent === i) visit(j);
    });
  };
  built.forEach((e, i) => {
    if (e.parent === undefined) visit(i);
  });
  const levelIndex = new Map<number, number>();
  order.forEach((i, k) => levelIndex.set(i, base + k));
  for (const i of order) {
    const e = built[i] as Built;
    const r = e.room;
    const room: Room = { lx: r.lx - 1, ly: r.ly, hx: r.hx - 1, hy: r.hy, lit: r.lit };
    if (e.type !== undefined) {
      room.type = e.type;
      room.filled = e.rd.filled ?? true;
    }
    if (e.parent !== undefined) room.parent = levelIndex.get(e.parent) as number;
    room.defPath = e.path;
    level.rooms.push(room);
  }

  const stairs: { up?: number; down?: number } = {};
  for (const i of order) {
    const e = built[i] as Built;
    const idx = levelIndex.get(i) as number;
    for (const [n, f] of (e.rd.features ?? []).entries())
      roomFeature(b, idx, f, `rooms${e.path.map((p) => `[${p}]`).join('.rooms')}.features[${n}]`);
    for (const dir of e.rd.stairs ?? []) stairs[dir] = idx;
  }
  return stairs;
}

/**
 * A room feature at its room-relative spot. A spot a subroom covers is skipped (in lua the
 * feature comes first and the subroom is built over it). An altar off the floor moves to a random
 * floor spot of the room (100 tries). ref: src/sp_lev.c lspo_feature() with get_location() in
 * croom, create_altar() with get_free_room_loc()
 */
function roomFeature(b: Builder, index: number, f: FeatureDef, what: string): void {
  const { level, def, rng } = b;
  const room = level.rooms[index] as Room;
  let p: Pos | null = roomDefPos(def, level.width, level.height, room, f.x, f.y, what);
  const at = p;
  if (level.rooms.some((r) => r.parent === index && insideRoom(r, at.x, at.y))) return;
  const floor = (q: Pos): boolean => b.key(q.y * level.width + q.x) === 'floor';
  if (f.kind === 'altar' && !floor(p)) {
    p = null;
    for (let trycnt = 0; trycnt <= 100 && !p; trycnt++) {
      const q = roomSomexy(rng, level, index);
      if (q && floor(q)) p = q;
    }
    if (!p) return; // C panics
  }
  setFeature(b, p.y * level.width + p.x, f);
}

/**
 * The spot for stairs a room asked for: a random good cell of the room outside its subrooms
 * (100 tries), then the first in column order. ref: src/sp_lev.c l_create_stairway() with
 * get_location() in croom and good_stair_loc()
 */
export function roomStair(b: Builder, index: number, good: (p: Pos) => boolean): Pos {
  const { level, rng } = b;
  for (let cpt = 0; cpt < 100; cpt++) {
    const p = roomSomexy(rng, level, index);
    if (p && good(p)) return p;
  }
  const room = level.rooms[index] as Room;
  for (let x = room.lx; x <= room.hx; x++)
    for (let y = room.ly; y <= room.hy; y++)
      if (roomHas(level, index, x, y) && good({ x, y })) return { x, y };
  throw new Error(`buildLevel: no spot for stairs in room ${String(index)} on '${level.id}'`);
}
