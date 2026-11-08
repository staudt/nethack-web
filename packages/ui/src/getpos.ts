import type { Dir, Glyph, Pos, UiCommand, ViewCell, ViewEntity } from '@nh/core';
import { dirOf } from './chord';
import type { KeyLike } from './keymap';

/**
 * The keyboard position cursor of NetHack's getpos() (ref: src/getpos.c getpos()), as a pure
 * state machine over the UI's mirror of the view. The host turns keys into {@link GetposInput}s
 * with {@link getposInput} and draws `cursor`. Look mode and the core's position prompt both use
 * it; a tap moves the cursor there.
 */

/** What the cursor may look at: the UI's copy of the last view, never GameState. */
export interface GetposView {
  width: number;
  height: number;
  cells: readonly ViewCell[];
  entities: readonly ViewEntity[];
  player: Pos;
  glyphOf(id: string): Glyph | undefined;
  /** Object ids that `o`/`O` skip (NetHack skips boulders and rocks). */
  skipObjects?: ReadonlySet<string>;
  /** A position prompt's valid cells (its hint), which `z`/`Z` cycle through. */
  valid?: readonly Pos[];
}

export type GlocKind = 'mons' | 'objs' | 'valid';

export type GetposInput =
  | { type: 'move'; dir: Dir; fast: boolean }
  | { type: 'pick' }
  | { type: 'cancel' }
  | { type: 'self' }
  | { type: 'gloc'; gloc: GlocKind; prev: boolean }
  | { type: 'feature'; ch: string }
  /** A tap: the cursor goes to that cell. */
  | { type: 'to'; pos: Pos };

export type GetposResult =
  | { type: 'moved' }
  | { type: 'pick'; pos: Pos }
  | { type: 'cancel' }
  | { type: 'notfound'; ch: string };

export interface Getpos {
  readonly cursor: Pos;
  input(i: GetposInput): GetposResult;
}

const DELTA: Record<Dir, Pos> = {
  n: { x: 0, y: -1 },
  ne: { x: 1, y: -1 },
  e: { x: 1, y: 0 },
  se: { x: 1, y: 1 },
  s: { x: 0, y: 1 },
  sw: { x: -1, y: 1 },
  w: { x: -1, y: 0 },
  nw: { x: -1, y: -1 },
};
const isDir = (d: string | null): d is Dir => d !== null && d in DELTA;

/** ref: src/getpos.c getpos(): the pick keys `.` `,` `;` `:` (LOOK_TRADITIONAL..LOOK_VERBOSE) */
const PICK_KEYS = new Set(['.', ',', ';', ':']);
/**
 * Dungeon features the cursor jumps to by their map symbol: stairs (and ladders, which share
 * `<`/`>`), altars, fountains and traps (ref: src/getpos.c getpos(), the `matching[]` search).
 */
export const FEATURE_KEYS: ReadonlySet<string> = new Set(['<', '>', '_', '{', '^']);

/**
 * The cursor input a key means, or null if none. `cmd` is the key resolved through the keymap,
 * so the direction keys are whatever the layout binds (hjklyubn only with vi keys, like
 * NetHack's movecmd()); Shift or a capital letter moves 8 (ref: getpos(), MV_RUSH/MV_RUN).
 */
export function getposInput(e: KeyLike, cmd: UiCommand | undefined): GetposInput | null {
  if (e.key === 'Escape') return { type: 'cancel' };
  if (PICK_KEYS.has(e.key)) return { type: 'pick' };
  if (e.key === '@') return { type: 'self' };
  if (e.key === 'm' || e.key === 'M') return { type: 'gloc', gloc: 'mons', prev: e.key === 'M' };
  if (e.key === 'o' || e.key === 'O') return { type: 'gloc', gloc: 'objs', prev: e.key === 'O' };
  // ref: src/cmd.c NHKF_GETPOS_VALID_NEXT 'z', NHKF_GETPOS_VALID_PREV 'Z'
  if (e.key === 'z' || e.key === 'Z') return { type: 'gloc', gloc: 'valid', prev: e.key === 'Z' };
  if (FEATURE_KEYS.has(e.key)) return { type: 'feature', ch: e.key };
  const d = cmd ? dirOf(cmd) : null;
  if (!isDir(d)) return null;
  return { type: 'move', dir: d, fast: e.shiftKey === true || /^[A-Z]$/.test(e.key) };
}

const sgn = (n: number): number => (n > 0 ? 1 : n < 0 ? -1 : 0);

/** Adds dx,dy to the cursor, truncating at map edges. ref: src/getpos.c truncate_to_map() */
export function truncateToMap(c: Pos, dx: number, dy: number, w: number, h: number): Pos {
  // diagonal moves complicate this...
  if (c.x + dx < 0) {
    dy -= sgn(dy) * (0 - (c.x + dx));
    dx = 0 - c.x;
  } else if (c.x + dx > w - 1) {
    dy += sgn(dy) * (w - 1 - (c.x + dx));
    dx = w - 1 - c.x;
  }
  if (c.y + dy < 0) {
    dx -= sgn(dx) * (0 - (c.y + dy));
    dy = 0 - c.y;
  } else if (c.y + dy > h - 1) {
    dx += sgn(dx) * (h - 1 - (c.y + dy));
    dy = h - 1 - c.y;
  }
  return { x: c.x + dx, y: c.y + dy };
}

const clampToMap = (p: Pos, v: { width: number; height: number }): Pos => ({
  x: Math.min(Math.max(0, p.x), v.width - 1),
  y: Math.min(Math.max(0, p.y), v.height - 1),
});

/**
 * Spots for `m`/`o`/`z`: the hero's spot first, then the shown monsters (or objects, or the
 * prompt's valid cells) nearest first, ties by row then column. Without valid cells `z` only
 * returns to the hero (C falls back to its "interesting" spots, not ported).
 * ref: src/getpos.c gather_locs(), gather_locs_interesting() (GLOC_VALID), cmp_coord_distu()
 */
export function gatherLocs(v: GetposView, gloc: GlocKind): Pos[] {
  const u = v.player;
  const at = (x: number, y: number): boolean => x === u.x && y === u.y;
  const shownMon = new Set(v.entities.map((e) => e.y * v.width + e.x));
  const out: Pos[] = [{ x: u.x, y: u.y }];
  if (gloc === 'mons') {
    for (const e of v.entities) if (!at(e.x, e.y)) out.push({ x: e.x, y: e.y });
  } else if (gloc === 'valid') {
    for (const p of v.valid ?? []) if (!at(p.x, p.y)) out.push({ x: p.x, y: p.y });
  } else {
    v.cells.forEach((c, i) => {
      const x = i % v.width;
      const y = Math.floor(i / v.width);
      // The shown glyph must be the object: no creature (seen or remembered) drawn over it.
      if (c.o === undefined || at(x, y) || shownMon.has(i) || (!c.v && c.m !== undefined)) return;
      if (v.skipObjects?.has(c.o)) return;
      out.push({ x, y });
    });
  }
  const dist = (p: Pos): number => Math.max(Math.abs(u.x - p.x), Math.abs(u.y - p.y));
  // de-duplicate (two entities never share a cell, but be safe) and sort
  const seen = new Set<number>();
  return out
    .filter((p) => {
      const k = p.y * v.width + p.x;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => dist(a) - dist(b) || a.y - b.y || a.x - b.x);
}

/**
 * The next cell after `from` in reading order (wrapping, ending on `from` itself) whose shown
 * terrain or trap has symbol `ch`; `^` matches any seen trap.
 * ref: src/getpos.c getpos(), the `matching[]` passes
 */
export function findFeature(v: GetposView, from: Pos, ch: string): Pos | null {
  const n = v.width * v.height;
  const start = from.y * v.width + from.x;
  for (let k = 1; k <= n; k++) {
    const i = (start + k) % n;
    const c = v.cells[i];
    if (!c || c.g === null) continue;
    const hit =
      (c.t !== undefined && (ch === '^' || v.glyphOf(c.t)?.ch === ch)) || v.glyphOf(c.g)?.ch === ch;
    if (hit) return { x: i % v.width, y: Math.floor(i / v.width) };
  }
  return null;
}

/**
 * Starts a cursor on `start` (a position prompt's), else on the hero. `view` is read again on
 * each input (the mirror may change).
 */
export function createGetpos(view: () => GetposView, start?: Pos): Getpos {
  const v0 = view();
  const s0 = start ?? v0.player;
  let cursor: Pos = clampToMap(s0, v0);
  const garr: Partial<Record<GlocKind, Pos[]>> = {};
  const gidx: Record<GlocKind, number> = { mons: 0, objs: 0, valid: 0 };
  return {
    get cursor() {
      return cursor;
    },
    input(i) {
      const v = view();
      switch (i.type) {
        case 'cancel':
          return { type: 'cancel' };
        case 'pick':
          return { type: 'pick', pos: cursor };
        case 'move': {
          const d = DELTA[i.dir];
          const n = i.fast ? 8 : 1;
          cursor = truncateToMap(cursor, d.x * n, d.y * n, v.width, v.height);
          return { type: 'moved' };
        }
        case 'self':
          // reset 'm&M', 'o&O' so the next one starts from the nearest again
          gidx.mons = gidx.objs = gidx.valid = 0;
          cursor = { x: v.player.x, y: v.player.y };
          return { type: 'moved' };
        case 'gloc': {
          const arr = (garr[i.gloc] ??= gatherLocs(v, i.gloc));
          const len = arr.length;
          gidx[i.gloc] = i.prev ? (gidx[i.gloc] - 1 + len) % len : (gidx[i.gloc] + 1) % len;
          const p = arr[gidx[i.gloc]];
          if (p) cursor = { x: p.x, y: p.y };
          return { type: 'moved' };
        }
        case 'to':
          cursor = clampToMap(i.pos, v);
          return { type: 'moved' };
        case 'feature': {
          const p = findFeature(v, cursor, i.ch);
          if (!p) return { type: 'notfound', ch: i.ch };
          cursor = p;
          return { type: 'moved' };
        }
      }
    },
  };
}
