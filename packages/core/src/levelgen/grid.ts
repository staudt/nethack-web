import type { NhRect } from './rect';

/**
 * Internal working grid. Uses NetHack coordinates: x in 1..colno-1 (x = 0 unused), y in 0..rowno-1,
 * where colno = width + 1 and rowno = height. Output x = internal x - 1.
 * ref: include/rm.h levl[][], include/global.h COLNO ROWNO
 */
export const T = {
  STONE: 0,
  VWALL: 1,
  HWALL: 2,
  TLCORNER: 3,
  TRCORNER: 4,
  BLCORNER: 5,
  BRCORNER: 6,
  DOOR: 7,
  CORR: 8,
  ROOM: 9,
  /** Secret door (ref: rm.h SDOOR); the D_HORIZ bit of its mask tells wall orientation. */
  SDOOR: 10,
  /** Secret corridor (ref: rm.h SCORR). */
  SCORR: 11,
  /** Special levels only: a tree (obstructed, ref: rm.h TREE). */
  TREE: 12,
  /** Special levels only: other open terrain (fountains, altars, stairs ...). */
  FURN: 13,
} as const;

/** Door state bits (ref: include/rm.h D_NODOOR D_ISOPEN D_CLOSED). 0 = no door. */
export const D_ISOPEN = 1;
export const D_CLOSED = 2;
/** Door sits in a horizontal wall (ref: rm.h levl[x][y].horizontal). */
export const D_HORIZ = 4;
/** ref: include/rm.h D_LOCKED */
export const D_LOCKED = 8;

/** ref: include/rm.h IS_WALL() (includes corners, excludes stone) */
export const isWall = (t: number): boolean => t >= T.VWALL && t <= T.BRCORNER;
/** ref: include/rm.h IS_OBSTRUCTED() for the types we have: stone, walls and trees */
export const isObstructed = (t: number): boolean => t <= T.BRCORNER || t === T.TREE;

/** A room in internal coordinates; ref: include/mkroom.h struct mkroom */
export interface IRoom extends NhRect {
  lit: boolean;
  /** Subrooms (special levels only); their cells and walls are not part of this room. */
  sub?: IRoom[];
}

/** In `r` or on its walls. ref: src/mkroom.c inside_room() */
export const inRoomBox = (r: NhRect, x: number, y: number): boolean =>
  x >= r.lx - 1 && x <= r.hx + 1 && y >= r.ly - 1 && y <= r.hy + 1;

/** Whether x,y is in a subroom of `r` (walls included): not `r`'s own (roomno differs). */
export const inSubroom = (r: IRoom, x: number, y: number): boolean =>
  r.sub !== undefined && r.sub.some((s) => inRoomBox(s, x, y));

/** A floor cell of `r` outside its subrooms (the first in row order), for flood fills. */
export function roomCell(r: IRoom): { x: number; y: number } {
  if (r.sub)
    for (let y = r.ly; y <= r.hy; y++)
      for (let x = r.lx; x <= r.hx; x++) if (!inSubroom(r, x, y)) return { x, y };
  return { x: r.lx, y: r.ly };
}

export class Grid {
  readonly colno: number;
  readonly rowno: number;
  readonly typ: Uint8Array;
  readonly dmask: Uint8Array;
  readonly lit: Uint8Array;
  rooms: IRoom[] = [];
  smeq: number[] = [];
  /** Corridor cells that got a boulder (dig_corridor()'s nxcor roll), in digging order. */
  boulders: { x: number; y: number }[] = [];

  constructor(width: number, height: number) {
    this.colno = width + 1;
    this.rowno = height;
    this.typ = new Uint8Array(this.colno * this.rowno);
    this.dmask = new Uint8Array(this.colno * this.rowno);
    this.lit = new Uint8Array(this.colno * this.rowno);
  }

  idx(x: number, y: number): number {
    return y * this.colno + x;
  }

  /** ref: include/hack.h isok() */
  isok(x: number, y: number): boolean {
    return x >= 1 && x <= this.colno - 1 && y >= 0 && y <= this.rowno - 1;
  }

  get(x: number, y: number): number {
    return this.typ[this.idx(x, y)] as number;
  }

  set(x: number, y: number, t: number): void {
    this.typ[this.idx(x, y)] = t;
  }

  getMask(x: number, y: number): number {
    return this.dmask[this.idx(x, y)] as number;
  }

  setMask(x: number, y: number, m: number): void {
    this.dmask[this.idx(x, y)] = m;
  }
}
