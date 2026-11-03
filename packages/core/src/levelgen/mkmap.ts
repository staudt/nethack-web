// Cellular-automaton cave maps: the `mines` LevelDef init style.
// ref: src/mkmap.c; src/sp_lev.c wallify_map(), dig_corridor(); src/mkmaze.c wallification()
import type { Rng } from '../types/rng';

/**
 * Cell kinds of a cave map. BG plays NetHack's STONE (walls grow into it) and FG its ROOM; the
 * wall kinds follow include/rm.h (VWALL..TRWALL).
 */
export const MK = {
  BG: 0,
  FG: 1,
  VWALL: 2,
  HWALL: 3,
  TLCORN: 4,
  TRCORN: 5,
  BLCORN: 6,
  BRCORN: 7,
  CRWALL: 8,
  TUWALL: 9,
  TDWALL: 10,
  TLWALL: 11,
  TRWALL: 12,
} as const;

/** Smallest cave map (same as the rooms generator, so any dungeon size works for both). */
export const MIN_MKMAP_WIDTH = 10;
export const MIN_MKMAP_HEIGHT = 10;

/** Open cells a cave needs: room for up, down and branch stairs (and more than a tiny hole). */
const MIN_OPEN = 4;
/** Tries before giving up on a map with no open area. */
const MAX_ATTEMPTS = 50;

export interface MkmapOptions {
  width: number;
  height: number;
  /** Two extra smoothing passes (pass_three). */
  smoothed: boolean;
  /** Join every open region to the others; regions of 3 cells or fewer are filled in. */
  joined: boolean;
  /** Put walls (with T-junctions) between open cells and BG. */
  walled: boolean;
}

/** ref: src/mkmap.c dirs[] */
const DIRS = [-1, -1, -1, 0, -1, 1, 0, -1, 0, 1, 1, -1, 1, 0, 1, 1] as const;

/** ref: src/mkmap.c N_P1_ITER, N_P2_ITER, N_P3_ITER */
const N_P1_ITER = 1;
const N_P2_ITER = 1;
const N_P3_ITER = 2;

/**
 * Works in NetHack coordinates like `Grid`: x in 1..COLNO-1, y in 0..ROWNO-1 with COLNO = width + 1
 * and ROWNO = height, so mkmap's WIDTH = COLNO - 2 and HEIGHT = ROWNO - 1. Open cells only ever
 * appear at x 2..WIDTH, y 1..HEIGHT-1, which leaves room for a wall all around.
 */
class CaveMap {
  readonly colno: number;
  readonly rowno: number;
  readonly W: number; // ref: mkmap.c WIDTH
  readonly H: number; // ref: mkmap.c HEIGHT
  readonly typ: Uint8Array;
  readonly roomno: Int32Array; // 0 = NO_ROOM, else region index + 1
  readonly newLoc: Uint8Array; // ref: gn.new_locations

  constructor(width: number, height: number) {
    this.colno = width + 1;
    this.rowno = height;
    this.W = this.colno - 2;
    this.H = this.rowno - 1;
    this.typ = new Uint8Array(this.colno * this.rowno); // init_map(): every cell BG
    this.roomno = new Int32Array(this.colno * this.rowno);
    this.newLoc = new Uint8Array(this.colno * this.rowno);
  }

  i(x: number, y: number): number {
    return y * this.colno + x;
  }

  /** ref: include/hack.h isok() */
  isok(x: number, y: number): boolean {
    return x >= 1 && x <= this.colno - 1 && y >= 0 && y <= this.rowno - 1;
  }

  at(x: number, y: number): number {
    return this.typ[this.i(x, y)] as number;
  }

  set(x: number, y: number, t: number): void {
    this.typ[this.i(x, y)] = t;
  }

  /** ref: src/mkmap.c get_map() */
  getMap(x: number, y: number): number {
    if (x <= 0 || y < 0 || x > this.W || y >= this.H) return MK.BG;
    return this.at(x, y);
  }

  /** Neighbours of (x, y) that are FG. */
  fgAround(x: number, y: number): number {
    let count = 0;
    for (let dr = 0; dr < 8; dr++)
      if (this.getMap(x + (DIRS[dr * 2] as number), y + (DIRS[dr * 2 + 1] as number)) === MK.FG)
        count++;
    return count;
  }
}

/** ref: src/mkmap.c init_fill() */
function initFill(m: CaveMap, rng: Rng): void {
  const limit = Math.floor((m.W * m.H * 2) / 5);
  let count = 0;
  while (count < limit) {
    const x = rng.rn2(m.W - 1) + 2; // rn1(WIDTH - 1, 2)
    const y = rng.rnd(m.H - 1);
    if (m.at(x, y) === MK.BG) {
      m.set(x, y, MK.FG);
      count++;
    }
  }
}

/** ref: src/mkmap.c pass_one() (updates in place, as in C) */
function passOne(m: CaveMap): void {
  for (let x = 2; x <= m.W; x++)
    for (let y = 1; y < m.H; y++) {
      const count = m.fgAround(x, y);
      if (count <= 2) m.set(x, y, MK.BG);
      else if (count >= 5) m.set(x, y, MK.FG);
    }
}

/**
 * A cell whose FG-neighbour count passes `toBg` becomes BG, every cell at once: pass_two() with
 * count == 5, pass_three() with count < 3. ref: src/mkmap.c pass_two(), pass_three()
 */
function passBuffered(m: CaveMap, toBg: (count: number) => boolean): void {
  for (let x = 2; x <= m.W; x++)
    for (let y = 1; y < m.H; y++)
      m.newLoc[m.i(x, y)] = toBg(m.fgAround(x, y)) ? MK.BG : m.getMap(x, y);
  for (let x = 2; x <= m.W; x++)
    for (let y = 1; y < m.H; y++) m.set(x, y, m.newLoc[m.i(x, y)] as number);
}

interface Region {
  lx: number;
  ly: number;
  hx: number;
  hy: number;
}

/**
 * Marks the 8-connected FG region containing (sx, sy) with `rmno`; returns its bounding box and
 * cell count. An explicit stack instead of C's recursion (deep on large maps); the cells marked are
 * the same. ref: src/mkmap.c flood_fill_rm() with anyroom FALSE, lit FALSE
 */
function floodFill(m: CaveMap, sx: number, sy: number, rmno: number): Region & { n: number } {
  const r = { lx: sx, ly: sy, hx: sx, hy: sy, n: 0 };
  const stack = [m.i(sx, sy)];
  m.roomno[m.i(sx, sy)] = rmno;
  while (stack.length) {
    const idx = stack.pop() as number;
    const x = idx % m.colno;
    const y = (idx - x) / m.colno;
    r.n++;
    if (x < r.lx) r.lx = x;
    if (x > r.hx) r.hx = x;
    if (y < r.ly) r.ly = y;
    if (y > r.hy) r.hy = y;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (!m.isok(nx, ny)) continue;
        const j = m.i(nx, ny);
        if (m.typ[j] === MK.FG && m.roomno[j] !== rmno) {
          m.roomno[j] = rmno;
          stack.push(j);
        }
      }
  }
  return r;
}

/**
 * A random cell of region `rmno` (index + 1): 100 random tries in its box, then the first in
 * column order. ref: src/mkroom.c somexy() for an irregular room
 */
function somexy(m: CaveMap, rng: Rng, r: Region, rmno: number): { x: number; y: number } | null {
  for (let tries = 0; tries < 100; tries++) {
    const x = rng.rn2(r.hx - r.lx + 1) + r.lx; // somex(): rn1(hx - lx + 1, lx)
    const y = rng.rn2(r.hy - r.ly + 1) + r.ly;
    if (m.roomno[m.i(x, y)] === rmno) return { x, y };
  }
  for (let x = r.lx; x <= r.hx; x++)
    for (let y = r.ly; y <= r.hy; y++) if (m.roomno[m.i(x, y)] === rmno) return { x, y };
  return null;
}

/**
 * Digs FG through BG from `org` to `dest`. Only the nxcor = FALSE, ftyp != CORR case (no boulders,
 * no secret corridors, no random stop). The C step limit of 500 is raised to 2 * (w + h) on larger
 * maps, as in corridors.ts, so a long join always arrives (DEVIATIONS.md).
 * corridors.ts digCorridor() is the ftyp = CORR case of the same function, on the rooms Grid.
 * ref: src/sp_lev.c dig_corridor()
 */
function digCorridor(
  m: CaveMap,
  rng: Rng,
  org: { x: number; y: number },
  dest: { x: number; y: number },
): boolean {
  const ftyp = MK.FG;
  const btyp = MK.BG;
  let xx = org.x;
  let yy = org.y;
  const tx = dest.x;
  const ty = dest.y;
  if (xx <= 0 || yy <= 0 || tx <= 0 || ty <= 0) return false;
  if (xx > m.colno - 1 || tx > m.colno - 1 || yy > m.rowno - 1 || ty > m.rowno - 1) return false;
  let dx = 0;
  let dy = 0;
  if (tx > xx) dx = 1;
  else if (ty > yy) dy = 1;
  else if (tx < xx) dx = -1;
  else dy = -1;

  const open = (x: number, y: number): boolean => {
    const t = m.at(x, y);
    return t === btyp || t === ftyp;
  };
  const maxSteps = Math.max(500, 2 * (m.colno + m.rowno));
  xx -= dx;
  yy -= dy;
  let cct = 0;
  while (xx !== tx || yy !== ty) {
    if (cct++ > maxSteps) return false;
    xx += dx;
    yy += dy;
    if (xx >= m.colno - 1 || xx <= 0 || yy <= 0 || yy >= m.rowno - 1) return false;

    const t = m.at(xx, yy);
    if (t === btyp) m.set(xx, yy, ftyp);
    else if (t !== ftyp) return false;

    // find next corridor position
    let dix = Math.abs(xx - tx);
    let diy = Math.abs(yy - ty);
    if (dix > diy && diy && !rng.rn2(dix - diy + 1)) dix = 0;
    else if (diy > dix && dix && !rng.rn2(diy - dix + 1)) diy = 0;

    // do we have to change direction?
    if (dy && dix > diy) {
      const ddx = xx > tx ? -1 : 1;
      if (open(xx + ddx, yy)) {
        dx = ddx;
        dy = 0;
        continue;
      }
    } else if (dx && diy > dix) {
      const ddy = yy > ty ? -1 : 1;
      if (open(xx, yy + ddy)) {
        dy = ddy;
        dx = 0;
        continue;
      }
    }
    // continue straight on?
    if (open(xx + dx, yy + dy)) continue;
    // no, what must we do now??
    if (dx) {
      dx = 0;
      dy = ty < yy ? -1 : 1;
    } else {
      dy = 0;
      dx = tx < xx ? -1 : 1;
    }
    if (open(xx + dx, yy + dy)) continue;
    dy = -dy;
    dx = -dx;
  }
  return true;
}

/**
 * Finds the FG regions (column order), fills in those of 3 cells or fewer, then digs from each
 * region to an earlier one. NetHack stops collecting at MAXNROFROOMS * 2 regions; there is no
 * limit here, so large maps stay connected (DEVIATIONS.md).
 * ref: src/mkmap.c join_map(), join_map_cleanup()
 */
function joinMap(m: CaveMap, rng: Rng): void {
  const regions: Region[] = [];
  for (let x = 2; x <= m.W; x++)
    for (let y = 1; y < m.H; y++) {
      if (m.at(x, y) !== MK.FG || m.roomno[m.i(x, y)] !== 0) continue;
      const rmno = regions.length + 1;
      const r = floodFill(m, x, y, rmno);
      if (r.n > 3) {
        regions.push({ lx: r.lx, ly: r.ly, hx: r.hx, hy: r.hy });
      } else {
        // a tiny hole; erase it so the hero can't end up there with no way out
        for (let sx = r.lx; sx <= r.hx; sx++)
          for (let sy = r.ly; sy <= r.hy; sy++)
            if (m.roomno[m.i(sx, sy)] === rmno) {
              m.set(sx, sy, MK.BG);
              m.roomno[m.i(sx, sy)] = 0;
            }
      }
    }

  let a = 0;
  for (let b = 1; b < regions.length; b++) {
    const croom = regions[a] as Region;
    const croom2 = regions[b] as Region;
    const sm = somexy(m, rng, croom, a + 1);
    const em = somexy(m, rng, croom2, b + 1);
    // somexy always finds a cell: every kept region has more than 3
    if (sm && em) digCorridor(m, rng, sm, em);
    // only advance croom if croom and croom2 don't overlap
    if (
      croom2.lx > croom.hx ||
      ((croom2.ly > croom.hy || croom2.hy < croom.ly) && rng.rn2(3) !== 0)
    )
      a = b;
  }
  m.roomno.fill(0);
}

/**
 * A door or secret door, only in wallifyKinds() grids: it joins walls (iswall()) but is not one
 * (IS_WALL()) and is not solid.
 */
export const MK_DOOR = 13;

const isWallKind = (t: number): boolean => t >= MK.VWALL && t <= MK.TRWALL;

/**
 * BG next to FG (8 neighbours) becomes wall: horizontal when the first such neighbour (row by row)
 * is on another row, else vertical. ref: src/sp_lev.c wallify_map() over the whole map
 */
function wallifyMap(m: CaveMap): void {
  const x1 = 1;
  const y1 = 0;
  const x2 = m.colno - 1;
  const y2 = m.rowno - 1;
  for (let y = y1; y <= y2; y++) {
    const loY = y > 0 ? y - 1 : 0;
    const hiY = y < y2 ? y + 1 : y2;
    for (let x = x1; x <= x2; x++) {
      if (m.at(x, y) !== MK.BG) continue;
      const loX = x > 1 ? x - 1 : 1;
      const hiX = x < x2 ? x + 1 : x2;
      search: for (let yy = loY; yy <= hiY; yy++)
        for (let xx = loX; xx <= hiX; xx++)
          if (m.at(xx, yy) === MK.FG) {
            m.set(x, y, yy !== y ? MK.HWALL : MK.VWALL);
            break search;
          }
    }
  }
}

/** ref: src/mkmaze.c iswall() (walls and doors; no bars or water here) */
const iswall = (m: CaveMap, x: number, y: number): boolean =>
  m.isok(x, y) && (isWallKind(m.at(x, y)) || m.at(x, y) === MK_DOOR);
/** ref: src/mkmaze.c iswall_or_stone() */
const iswallOrStone = (m: CaveMap, x: number, y: number): boolean =>
  !m.isok(x, y) || m.at(x, y) === MK.BG || iswall(m, x, y);
/** ref: src/mkmaze.c is_solid() */
const isSolid = (m: CaveMap, x: number, y: number): boolean =>
  !m.isok(x, y) || m.at(x, y) === MK.BG || isWallKind(m.at(x, y));

/** Walls surrounded by rock become rock. ref: src/mkmaze.c wall_cleanup() */
function wallCleanup(m: CaveMap): void {
  for (let x = 1; x <= m.colno - 1; x++)
    for (let y = 0; y <= m.rowno - 1; y++) {
      if (!isWallKind(m.at(x, y))) continue;
      let solid = true;
      for (let dx = -1; dx <= 1 && solid; dx++)
        for (let dy = -1; dy <= 1 && solid; dy++)
          if ((dx || dy) && !isSolid(m, x + dx, y + dy)) solid = false;
      if (solid) m.set(x, y, MK.BG);
    }
}

/** locale[x][y] for the 3x3 around a wall. ref: src/mkmaze.c extend_spine() */
function extendSpine(locale: boolean[][], wallThere: boolean, dx: number, dy: number): number {
  if (!wallThere) return 0;
  const nx = 1 + dx;
  const ny = 1 + dy;
  const at = (x: number, y: number): boolean => (locale[x] as boolean[])[y] as boolean;
  if (dx) return at(1, 0) && at(1, 2) && at(nx, 0) && at(nx, 2) ? 0 : 1;
  return at(0, 1) && at(2, 1) && at(0, ny) && at(2, ny) ? 0 : 1;
}

/** ref: src/mkmaze.c fix_wall_spines() spine_array[] */
const SPINE_ARRAY = [
  MK.VWALL,
  MK.HWALL,
  MK.HWALL,
  MK.HWALL,
  MK.VWALL,
  MK.TRCORN,
  MK.TLCORN,
  MK.TDWALL,
  MK.VWALL,
  MK.BRCORN,
  MK.BLCORN,
  MK.TUWALL,
  MK.VWALL,
  MK.TLWALL,
  MK.TRWALL,
  MK.CRWALL,
] as const;

/**
 * Each wall turns into the piece that joins its neighbouring walls (corners, T-walls, crosses);
 * a free-standing wall keeps its type. ref: src/mkmaze.c fix_wall_spines() over the whole map
 */
function fixWallSpines(m: CaveMap): void {
  for (let x = 1; x <= m.colno - 1; x++)
    for (let y = 0; y <= m.rowno - 1; y++) {
      if (!isWallKind(m.at(x, y))) continue;
      const locale: boolean[][] = [0, 1, 2].map((i) =>
        [0, 1, 2].map((j) => (i === 1 && j === 1) || iswallOrStone(m, x + i - 1, y + j - 1)),
      );
      const bits =
        (extendSpine(locale, iswall(m, x, y - 1), 0, -1) << 3) |
        (extendSpine(locale, iswall(m, x, y + 1), 0, 1) << 2) |
        (extendSpine(locale, iswall(m, x + 1, y), 1, 0) << 1) |
        extendSpine(locale, iswall(m, x - 1, y), -1, 0);
      if (bits) m.set(x, y, SPINE_ARRAY[bits] as number);
    }
}

/**
 * NetHack's wallification() of a whole map given as row-major `width * height` MK kinds (BG for
 * stone, FG for any other open or solid non-wall cell, MK_DOOR for doors): walls with only rock
 * around become BG, then every wall turns into the piece that joins its neighbours. Returns new
 * kinds; only walls change. ref: src/mkmaze.c wallification(), wall_cleanup(), fix_wall_spines()
 */
export function wallifyKinds(width: number, height: number, kinds: readonly number[]): number[] {
  const m = new CaveMap(width, height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) m.set(x + 1, y, kinds[y * width + x] as number);
  wallCleanup(m);
  fixWallSpines(m);
  const out = new Array<number>(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) out[y * width + x] = m.at(x + 1, y);
  return out;
}

/**
 * A cave map as MK kinds, row-major `width * height` (output x = internal x - 1). Lighting is the
 * caller's: NetHack rolls it before mkmap and lights FG cells and walls (finish_map()). A map
 * with fewer than MIN_OPEN open cells (small maps, now and then) is made again with the continuing
 * RNG stream; at 80x21 that does not happen in practice.
 * ref: src/mkmap.c mkmap(), finish_map(); src/sp_lev.c lspo_finalize_level() wallification()
 * @throws RangeError below MIN_MKMAP_WIDTH x MIN_MKMAP_HEIGHT; Error if every try comes out empty
 */
export function mkmap(rng: Rng, opts: MkmapOptions): number[] {
  const { width, height } = opts;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < MIN_MKMAP_WIDTH ||
    height < MIN_MKMAP_HEIGHT
  )
    throw new RangeError(
      `mkmap: size ${String(width)}x${String(height)} is below the minimum ` +
        `${String(MIN_MKMAP_WIDTH)}x${String(MIN_MKMAP_HEIGHT)}`,
    );
  let m = new CaveMap(width, height);
  for (let attempt = 1; ; attempt++) {
    initFill(m, rng);
    for (let i = 0; i < N_P1_ITER; i++) passOne(m);
    for (let i = 0; i < N_P2_ITER; i++) passBuffered(m, (c) => c === 5);
    if (opts.smoothed) for (let i = 0; i < N_P3_ITER; i++) passBuffered(m, (c) => c < 3);
    if (opts.joined) joinMap(m, rng);
    if (m.typ.filter((t) => t === MK.FG).length >= MIN_OPEN) break;
    if (attempt >= MAX_ATTEMPTS)
      throw new Error(`mkmap: no open area on a ${String(width)}x${String(height)} map`);
    m = new CaveMap(width, height);
  }
  if (opts.walled) {
    wallifyMap(m); // finish_map()
    wallCleanup(m); // lspo_finalize_level() wallification()
    fixWallSpines(m);
  }
  const out = new Array<number>(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) out[y * width + x] = m.at(x + 1, y);
  return out;
}
