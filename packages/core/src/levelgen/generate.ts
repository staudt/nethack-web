import type { Level, LevelRef, Room } from '../types/level';
import type { Pos } from '../types/common';
import type { Rng } from '../types/rng';
import { ensureConnected, makeCorridors } from './corridors';
import { D_CLOSED, D_LOCKED, D_HORIZ, D_ISOPEN, Grid, T, type IRoom } from './grid';
import { maxRooms, makeRooms, sortRooms } from './rooms';
import { PAL, PALETTE_KEYS, type LevelTerrain } from './terrain';
import { makeVault } from './vault';
import type { DefId, LevelId } from '../types/common';
import { DEFAULT_DUNGEON } from '../dungeon';

/**
 * Smallest supported map. NetHack's room placement (rect.c / create_room) needs a free rectangle
 * at least 9 rows and 10 columns across; below that no room can ever be placed.
 */
export const MIN_LEVEL_WIDTH = 10;
export const MIN_LEVEL_HEIGHT = 10;

/** How often an empty result (no rooms placed) is retried with the continuing RNG stream. */
const MAX_ATTEMPTS = 20;

export interface GenOptions {
  id: LevelId;
  depth: number;
  /** Defaults to the default dungeon and `depth`. */
  dungeon?: DefId;
  dlevel?: number;
  /** Make up stairs (default true); false on a branch dungeon's top level (ref: generate_stairs()). */
  up?: boolean;
  /** Make down stairs (default true); false on a dungeon's last level (ref: Is_botlevel()). */
  down?: boolean;
  /** Branch stairs to place (ref: src/mklev.c place_branch()). */
  branch?: { to: LevelRef; dir: 'up' | 'down' };
  width: number;
  height: number;
  terrain: LevelTerrain;
}

/** ref: src/mklev.c somexy() for plain (non-irregular, subroom-free) rooms */
function somexy(rng: Rng, r: IRoom): Pos {
  return { x: rng.rn2(r.hx - r.lx + 1) + r.lx, y: rng.rn2(r.hy - r.ly + 1) + r.ly };
}

/**
 * Choose rooms and cells for down and up stairs (each only when wanted).
 * ref: src/mklev.c generate_stairs() / generate_stairs_find_room(): down stairs in any room, up stairs
 * in a different room when one exists, else the same room (on a different cell).
 */
function placeStairs(
  g: Grid,
  rng: Rng,
  want: { up: boolean; down: boolean },
): { down: Pos | null; up: Pos | null } {
  const n = g.rooms.length;
  let downIdx = -1;
  let down: Pos | null = null;
  if (want.down) {
    downIdx = rng.rn2(n); // phase 2: every room is eligible
    down = somexy(rng, g.rooms[downIdx] as IRoom);
  }
  if (!want.up) return { down, up: null };

  const others: number[] = [];
  for (let i = 0; i < n; i++) if (i !== downIdx) others.push(i);
  const upIdx = others.length ? (others[rng.rn2(others.length)] as number) : downIdx;
  const upRoom = g.rooms[upIdx] as IRoom;
  let up = somexy(rng, upRoom);
  // Same-room case: avoid stacking both stairs on one cell (C would hit an impossible() here).
  for (let tries = 0; down && upIdx === downIdx && up.x === down.x && up.y === down.y; tries++) {
    if (tries < 100) {
      up = somexy(rng, upRoom);
    } else {
      up = { x: up.x === upRoom.hx ? upRoom.lx : up.x + 1, y: up.y };
    }
  }
  return { down, up };
}

/**
 * A cell for branch stairs: in a random room without stairs (any room if every room has some),
 * on a free floor cell. ref: src/mklev.c find_branch_room(), generate_stairs_find_room(),
 * src/mkroom.c somexyspace() (100 tries, then the first free cell)
 */
function placeBranch(g: Grid, rng: Rng, stairs: readonly (Pos | null)[]): Pos {
  const has = (r: IRoom, p: Pos | null): boolean =>
    p !== null && p.x >= r.lx && p.x <= r.hx && p.y >= r.ly && p.y <= r.hy;
  const free = g.rooms.filter((r) => !stairs.some((p) => has(r, p)));
  const pool = free.length ? free : g.rooms;
  const room = pool[rng.rn2(pool.length)] as IRoom;
  const ok = (p: Pos): boolean => !stairs.some((s) => s?.x === p.x && s.y === p.y);
  for (let tries = 0; tries <= 100; tries++) {
    const p = somexy(rng, room);
    if (ok(p)) return p;
  }
  for (let y = room.ly; y <= room.hy; y++)
    for (let x = room.lx; x <= room.hx; x++) if (ok({ x, y })) return { x, y };
  throw new Error('generateLevel: no free cell for branch stairs');
}

/** Palette index for an internal cell. */
function paletteIndex(typ: number, mask: number): number {
  switch (typ) {
    case T.DOOR:
      if (mask & D_LOCKED) return PAL.door_locked;
      if (mask & D_CLOSED) return PAL.door_closed;
      if (mask & D_ISOPEN) return mask & D_HORIZ ? PAL.door_open_h : PAL.door_open_v;
      return PAL.doorway;
    case T.SDOOR:
      if (mask & D_LOCKED) return mask & D_HORIZ ? PAL.sdoor_locked_h : PAL.sdoor_locked_v;
      return mask & D_HORIZ ? PAL.sdoor_h : PAL.sdoor_v;
    case T.SCORR:
      return PAL.scorr;
    case T.ROOM:
      return PAL.floor;
    case T.CORR:
      return PAL.corr;
    default:
      return typ; // T.STONE..T.BRCORNER share the palette order stone,vwall,hwall,corners
  }
}

/**
 * Generate a rooms-and-corridors level.
 * ref: src/mklev.c makelevel() (ordinary level branch)
 * @throws RangeError when the size is below MIN_LEVEL_WIDTH x MIN_LEVEL_HEIGHT
 */
export function generateLevel(rng: Rng, opts: GenOptions): Level {
  const { width, height, depth } = opts;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < MIN_LEVEL_WIDTH ||
    height < MIN_LEVEL_HEIGHT
  ) {
    throw new RangeError(
      `generateLevel: size ${String(width)}x${String(height)} is below the minimum ` +
        `${String(MIN_LEVEL_WIDTH)}x${String(MIN_LEVEL_HEIGHT)}`,
    );
  }

  let g = new Grid(width, height);
  let made: ReturnType<typeof makeRooms>;
  for (let attempt = 0; ; attempt++) {
    made = makeRooms(g, rng, depth, maxRooms(width, height));
    if (g.rooms.length > 0) break;
    if (attempt + 1 >= MAX_ATTEMPTS) {
      throw new Error(
        `generateLevel: no rooms could be placed on a ${String(width)}x${String(height)} map`,
      );
    }
    g = new Grid(width, height);
  }
  sortRooms(g);
  makeCorridors(g, rng, depth);
  ensureConnected(g);
  const { up, down } = placeStairs(g, rng, { up: opts.up ?? true, down: opts.down ?? true });
  // ref: makelevel(): the vault after the stairs and corridors, before the branch stairs
  const vault = made.vault && makeVault(g, rng, depth, made.rects, made.vault);
  // ref: makelevel(): place_branch() after the corridors and special rooms
  const branchPos = opts.branch ? placeBranch(g, rng, [up, down]) : null;

  const cells: number[] = new Array<number>(width * height);
  const lit: (0 | 1)[] = new Array<0 | 1>(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = g.idx(x + 1, y);
      cells[y * width + x] = paletteIndex(g.typ[i] as number, g.dmask[i] as number);
      lit[y * width + x] = g.lit[i] ? 1 : 0;
    }
  }
  if (down) cells[down.y * width + down.x - 1] = PAL.stairs_down;
  if (up) cells[up.y * width + up.x - 1] = PAL.stairs_up;
  if (branchPos && opts.branch)
    cells[branchPos.y * width + branchPos.x - 1] =
      opts.branch.dir === 'up' ? PAL.stairs_up : PAL.stairs_down;

  const rooms: Room[] = g.rooms.map((r) => ({
    lx: r.lx - 1,
    ly: r.ly,
    hx: r.hx - 1,
    hy: r.hy,
    lit: r.lit,
  }));

  return {
    id: opts.id,
    depth,
    dungeon: opts.dungeon ?? DEFAULT_DUNGEON.id,
    dlevel: opts.dlevel ?? depth,
    width,
    height,
    palette: PALETTE_KEYS.map((k) => opts.terrain[k]),
    cells,
    lit,
    rooms,
    up: up && { x: up.x - 1, y: up.y },
    down: down && { x: down.x - 1, y: down.y },
    branch:
      branchPos && opts.branch
        ? { pos: { x: branchPos.x - 1, y: branchPos.y }, to: opts.branch.to, dir: opts.branch.dir }
        : null,
    traps: [],
    ...(g.boulders.length > 0 && { boulderSpots: g.boulders.map((p) => ({ x: p.x - 1, y: p.y })) }),
    ...(g.trappedDoors.length > 0 && {
      trappedDoorSpots: g.trappedDoors.map((p) => ({ x: p.x - 1, y: p.y })),
    }),
    ...(vault && { vaultSpot: { x: vault.vault.x - 1, y: vault.vault.y } }),
    ...(vault?.tele && { vaultTeleSpot: { x: vault.tele.x - 1, y: vault.tele.y } }),
  };
}
