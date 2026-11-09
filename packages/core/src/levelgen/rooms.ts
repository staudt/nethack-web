import type { Pos } from '../types/common';
import type { Rng } from '../types/rng';
import { Grid, T, type IRoom } from './grid';
import { RectList, XLIM, YLIM, type NhRect } from './rect';

/** ref: include/global.h MAXNROFROOMS (40) scaled by map area vs 80x21. See DEVIATIONS.md. */
export function maxRooms(width: number, height: number): number {
  return Math.max(40, Math.floor((40 * width * height) / (80 * 21)));
}

/** ref: src/mkmap.c litstate_rnd() with litstate < 0 */
export function litstateRnd(rng: Rng, depth: number): boolean {
  return rng.rnd(1 + Math.abs(depth)) < 11 && rng.rn2(77) !== 0;
}

interface RoomBox {
  lowx: number;
  ddx: number;
  lowy: number;
  ddy: number;
}

/**
 * Shrink/shift a candidate room until it fits in stone, or give up. A vault keeps one more
 * square of stone around it. ref: src/sp_lev.c check_room() (no themed rooms)
 */
export function checkRoom(g: Grid, rng: Rng, box: RoomBox, vault = false): RoomBox | null {
  const { colno: COLNO, rowno: ROWNO } = g;
  const xlim = XLIM + (vault ? 1 : 0);
  const ylim = YLIM + (vault ? 1 : 0);
  let { lowx, lowy } = box;
  let hix = lowx + box.ddx;
  let hiy = lowy + box.ddy;
  if (lowx < 3) lowx = 3;
  if (lowy < 2) lowy = 2;
  if (hix > COLNO - 3) hix = COLNO - 3;
  if (hiy > ROWNO - 3) hiy = ROWNO - 3;
  for (;;) {
    if (hix <= lowx || hiy <= lowy) return null;
    let retry = false;
    scan: for (let x = lowx - xlim; x <= hix + xlim; x++) {
      if (x <= 0 || x >= COLNO) continue;
      const ymax = Math.min(hiy + ylim, ROWNO - 1);
      for (let y = Math.max(lowy - ylim, 0); y <= ymax; y++) {
        if (g.get(x, y) === T.STONE) continue;
        if (rng.rn2(3) === 0) return null;
        if (x < lowx) lowx = x + xlim + 1;
        else hix = x - xlim - 1;
        if (y < lowy) lowy = y + ylim + 1;
        else hiy = y - ylim - 1;
        retry = true;
        break scan; // C: goto chk
      }
    }
    if (!retry) return { lowx, ddx: hix - lowx, lowy, ddy: hiy - lowy };
  }
}

/**
 * Draw walls, floor and lighting for a room. Rooms only (no subrooms, no "special" rooms).
 * ref: src/mklev.c do_room_or_subroom() / add_room()
 */
export function addRoom(
  g: Grid,
  lowx: number,
  lowy: number,
  hix: number,
  hiy: number,
  lit: boolean,
): void {
  if (!lowx) lowx++;
  if (!lowy) lowy++;
  if (hix >= g.colno - 1) hix = g.colno - 2;
  if (hiy >= g.rowno - 1) hiy = g.rowno - 2;

  if (lit) {
    for (let x = lowx - 1; x <= hix + 1; x++)
      for (let y = Math.max(lowy - 1, 0); y <= hiy + 1; y++) g.lit[g.idx(x, y)] = 1;
  }
  g.rooms.push({ lx: lowx, ly: lowy, hx: hix, hy: hiy, lit });

  for (let x = lowx - 1; x <= hix + 1; x++)
    for (let y = lowy - 1; y <= hiy + 1; y += hiy - lowy + 2) g.set(x, y, T.HWALL);
  for (let x = lowx - 1; x <= hix + 1; x += hix - lowx + 2)
    for (let y = lowy; y <= hiy; y++) g.set(x, y, T.VWALL);
  for (let x = lowx; x <= hix; x++) for (let y = lowy; y <= hiy; y++) g.set(x, y, T.ROOM);
  g.set(lowx - 1, lowy - 1, T.TLCORNER);
  g.set(hix + 1, lowy - 1, T.TRCORNER);
  g.set(lowx - 1, hiy + 1, T.BLCORNER);
  g.set(hix + 1, hiy + 1, T.BRCORNER);
}

/**
 * create_room() parameters; -1 = random. Aligns: 1 left/top (SPLEV_LEFT, TOP), 3 center, 5
 * right/bottom.
 */
export interface RoomParams {
  x: number;
  y: number;
  w: number;
  h: number;
  xal: number;
  yal: number;
}
const ALL_RANDOM: RoomParams = { x: -1, y: -1, w: -1, h: -1, xal: -1, yal: -1 };
const SPLEV_CENTER = 3;
const SPLEV_RIGHT = 5;

/**
 * Try to create one room: a totally random one from the free-rectangle list, or one on the 5x5
 * grid (special levels) where `x`,`y` (1..5), `w`,`h` and the aligns may each be random. Returns
 * the new room (pushed to `g.rooms`), or null. The grid uses COLNO/5 and ROWNO/5, so it scales
 * with the level. ref: src/sp_lev.c create_room() (no themed rooms; vaults: {@link createVault})
 */
export function createRoom(
  g: Grid,
  rects: RectList,
  rng: Rng,
  depth: number,
  p: RoomParams = ALL_RANDOM,
  lit?: boolean,
): IRoom | null {
  const rlit = lit ?? litstateRnd(rng, depth);
  const r = placeRoom(g, rects, rng, p, false);
  if (!r) return null;
  const nroom = g.rooms.length;
  g.smeq[nroom] = nroom;
  addRoom(g, r.xabs, r.yabs, r.xabs + r.wtmp - 1, r.yabs + r.htmp - 1, rlit);
  return g.rooms[nroom] as IRoom;
}

/**
 * Try to place a vault: a random 2x2 spot in a free rectangle with two squares of stone round
 * its walls, carved out of the rectangle list but not made (no walls, not in `g.rooms`): its
 * top-left floor square, or null. ref: src/mklev.c create_vault(), src/sp_lev.c create_room()
 * with VAULT (the room's `lx`, `ly`; C's `hx = -1` until do_vault makes it)
 */
export function createVault(g: Grid, rects: RectList, rng: Rng): Pos | null {
  // create_room(-1, -1, 2, 2, -1, -1, VAULT, TRUE): litstate_rnd(TRUE) draws nothing
  const r = placeRoom(g, rects, rng, { x: -1, y: -1, w: 2, h: 2, xal: -1, yal: -1 }, true);
  return r && { x: r.xabs, y: r.yabs };
}

/** create_room()'s search and rectangle split; the caller makes the room. */
function placeRoom(
  g: Grid,
  rects: RectList,
  rng: Rng,
  p: RoomParams,
  vault: boolean,
): { xabs: number; yabs: number; wtmp: number; htmp: number } | null {
  const { colno: COLNO, rowno: ROWNO } = g;
  const div = (a: number, b: number): number => Math.trunc(a / b);
  const xlim = XLIM + (vault ? 1 : 0);
  const ylim = YLIM + (vault ? 1 : 0);
  let r1: NhRect | null;
  let r2: NhRect = { lx: 0, ly: 0, hx: 0, hy: 0 };
  let xabs = 0;
  let yabs = 0;
  let wtmp: number;
  let htmp: number;
  let trycnt = 0;
  do {
    wtmp = p.w;
    htmp = p.h;
    let xtmp = p.x;
    let ytmp = p.y;
    let xaltmp = p.xal;
    let yaltmp = p.yal;
    if ((xtmp < 0 && ytmp < 0 && wtmp < 0 && xaltmp < 0 && yaltmp < 0) || vault) {
      // a totally random room (or a vault)
      r1 = rects.rnd(rng);
      if (!r1) return null; // no more free rectangles
      const { hx, hy, lx, ly } = r1;
      let dx = 1;
      let dy = 1;
      if (!vault) {
        dx = 2 + rng.rn2(hx - lx > 28 ? 12 : 8);
        dy = 2 + rng.rn2(4);
        if (dx * dy > 50) dy = Math.floor(50 / dx);
      }
      const xborder = lx > 0 && hx < COLNO - 1 ? 2 * xlim : xlim + 1;
      const yborder = ly > 0 && hy < ROWNO - 1 ? 2 * ylim : ylim + 1;
      if (hx - lx < dx + 3 + xborder || hy - ly < dy + 3 + yborder) {
        r1 = null;
        continue;
      }
      xabs = lx + (lx > 0 ? xlim : 3) + rng.rn2(hx - (lx > 0 ? lx : 3) - dx - xborder + 1);
      yabs = ly + (ly > 0 ? ylim : 2) + rng.rn2(hy - (ly > 0 ? ly : 2) - dy - yborder + 1);
      let ddy = dy;
      const nroom = g.rooms.length;
      if (
        ly === 0 &&
        hy >= ROWNO - 1 &&
        (nroom === 0 || rng.rn2(nroom) === 0) &&
        yabs + dy > Math.floor(ROWNO / 2)
      ) {
        yabs = rng.rn2(3) + 2; // rn1(3, 2)
        if (nroom < 4 && dy > 1) ddy--;
      }
      const box = checkRoom(g, rng, { lowx: xabs, ddx: dx, lowy: yabs, ddy }, vault);
      if (!box) {
        r1 = null;
        continue;
      }
      xabs = box.lowx;
      yabs = box.lowy;
      wtmp = box.ddx + 1;
      htmp = box.ddy + 1;
      r2 = { lx: xabs - 1, ly: yabs - 1, hx: xabs + wtmp, hy: yabs + htmp };
    } else {
      // only some parameters are random
      let rndpos = 0;
      if (xtmp < 0 && ytmp < 0) {
        xtmp = rng.rnd(5);
        ytmp = rng.rnd(5);
        rndpos = 1;
      }
      if (wtmp < 0 || htmp < 0) {
        wtmp = rng.rn2(15) + 3; // rn1(15, 3)
        htmp = rng.rn2(8) + 2; // rn1(8, 2)
      }
      if (xaltmp === -1) xaltmp = rng.rnd(3); // 2 (half-left) does not move the room
      if (yaltmp === -1) yaltmp = rng.rnd(3);
      xabs = div((xtmp - 1) * COLNO, 5) + 1;
      yabs = div((ytmp - 1) * ROWNO, 5) + 1;
      if (xaltmp === SPLEV_RIGHT) xabs += div(COLNO, 5) - wtmp;
      else if (xaltmp === SPLEV_CENTER) xabs += div(div(COLNO, 5) - wtmp, 2);
      if (yaltmp === SPLEV_RIGHT)
        yabs += div(ROWNO, 5) - htmp; // BOTTOM
      else if (yaltmp === SPLEV_CENTER) yabs += div(div(ROWNO, 5) - htmp, 2);
      if (xabs + wtmp - 1 > COLNO - 2) xabs = COLNO - wtmp - 3;
      if (xabs < 2) xabs = 2;
      if (yabs + htmp - 1 > ROWNO - 2) yabs = ROWNO - htmp - 3;
      if (yabs < 2) yabs = 2;
      // try to find a rectangle that fits the room
      r2 = { lx: xabs - 1, ly: yabs - 1, hx: xabs + wtmp + rndpos, hy: yabs + htmp + rndpos };
      r1 = rects.find(r2);
      if (r1) {
        const box = checkRoom(g, rng, { lowx: xabs, ddx: wtmp, lowy: yabs, ddy: htmp }, vault);
        if (!box) r1 = null;
        else {
          // C keeps wtmp, htmp: only the corner moves
          xabs = box.lowx;
          yabs = box.lowy;
        }
      }
    }
  } while (++trycnt <= 100 && !r1);
  if (!r1) return null;
  rects.split({ ...r1 }, r2);
  return { xabs, yabs, wtmp, htmp };
}

/**
 * Make rooms until the rectangle list or the room cap is exhausted. Once there are a sixth of
 * the room cap, each pass flips a coin for the vault, which is tried once: its spot is returned
 * (not a room yet; see makeVault). ref: src/mklev.c makerooms() (no themed rooms)
 */
export function makeRooms(
  g: Grid,
  rng: Rng,
  depth: number,
  maxRoomCount: number,
): { rects: RectList; vault: Pos | null } {
  const rects = new RectList(g.colno, g.rowno);
  let triedVault = false;
  let vault: Pos | null = null;
  while (g.rooms.length < maxRoomCount - 1 && rects.rnd(rng)) {
    // C: nroom >= MAXNROFROOMS / 6 && rn2(2) && !tried_vault (the coin is drawn every pass)
    if (g.rooms.length >= Math.trunc(maxRoomCount / 6) && rng.rn2(2) !== 0 && !triedVault) {
      triedVault = true;
      vault = createVault(g, rects, rng);
    } else if (!createRoom(g, rects, rng, depth)) break;
  }
  return { rects, vault };
}

/**
 * Order rooms left to right. Stable for equal lx (C qsort is unspecified there).
 * ref: src/mklev.c sort_rooms()
 */
export function sortRooms(g: Grid): void {
  g.rooms.sort((a, b) => a.lx - b.lx);
}
