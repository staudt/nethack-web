// Engravings: one per square, as content state. ref: include/engrave.h struct engr;
// src/engrave.c engr_at(), sengr_at(), make_engr_at(), del_engr_at(), del_engr(), wipeout_text(),
// wipe_engr_at(), u_wipe_engr(); src/hack.c maybe_smudge_engr()
//
// `modData.nh.engr[levelId][cellIndex]` holds each square's engraving (C's engr_at() list). The
// text is a data string that wears letter by letter as C's buffer does, never a message key.
// A leaf (state, rng, the level's terrain and reach.ts): everything that writes, wipes or deletes
// an engraving imports it; reading it is engrread.ts, the `E` command engrave.ts.
// Not kept: `eread`, `erevealed` and the remembered text (engravings are not drawn on the map;
// DEVIATIONS.md "Engravings"); `exercise(A_WIS, TRUE)` for a typed "Elbereth" (no exercise).
import {
  cellIndex,
  getPlayer,
  type Ctx,
  type Json,
  type Level,
  type ModApi,
  type Rng,
} from '@nh/core';
import { isIce } from './liquid';
import { canReachFloor } from './reach';

/** ref: include/engrave.h DUST .. HEADSTONE (ENGR_BLOOD is 'blood') */
export type EngrType = 'dust' | 'engrave' | 'burn' | 'mark' | 'blood' | 'headstone';

/** `rnd(N_ENGRAVE - 1)`: a random type is DUST .. ENGR_BLOOD, in C's order. */
export const RANDOM_ENGR_TYPES: readonly EngrType[] = ['dust', 'engrave', 'burn', 'mark', 'blood'];

/** ref: include/engrave.h struct engr */
export interface Engr {
  /** engr_txt[actual_text]: what is there now, leading blanks trimmed after a wipe. */
  text: string;
  /** engr_txt[pristine_text]: as written (a random one: before its wear). */
  pristine: string;
  /** How many leading characters the wipes trimmed (read_engr_at()'s `off`). */
  off?: number;
  type: EngrType;
  /** engr_time: the turn it is (will be) finished. */
  time: number;
  /** guardobjects: an "Elbereth" that scares monsters off the objects on it. */
  guard?: true;
  /** nowipeout: never degrades. */
  nowipe?: true;
}

type EngrTable = Record<string, Record<string, Engr>>;

const table = (ctx: Pick<Ctx, 'state'>, create: boolean): EngrTable | null => {
  const md = ctx.state.modData;
  let nh = md['nh'] as Record<string, Json> | undefined;
  if (typeof nh !== 'object' || nh === null || Array.isArray(nh)) {
    if (!create) return null;
    nh = {};
    md['nh'] = nh;
  }
  const t = nh['engr'];
  if (t && typeof t === 'object' && !Array.isArray(t)) return t as unknown as EngrTable;
  if (!create) return null;
  const fresh: EngrTable = {};
  nh['engr'] = fresh as unknown as Json;
  return fresh;
};

/** isok(): C's engr_at() just finds nothing off the map. */
const inLevel = (level: Readonly<Level>, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < level.width && y < level.height;

/** The engraving at (x, y) of `level`, or null. ref: src/engrave.c engr_at() */
export function engrAt(
  ctx: Pick<Ctx, 'state'>,
  level: Readonly<Level>,
  x: number,
  y: number,
): Engr | null {
  if (!inLevel(level, x, y)) return null;
  return table(ctx, false)?.[level.id]?.[String(cellIndex(level, x, y))] ?? null;
}

/** Every engraving of `level`, in cell order (never key order). */
export function engravingsOn(
  ctx: Pick<Ctx, 'state'>,
  level: Readonly<Level>,
): { x: number; y: number; e: Engr }[] {
  const lv = table(ctx, false)?.[level.id];
  if (!lv) return [];
  return Object.keys(lv)
    .map(Number)
    .sort((a, b) => a - b)
    .map((i) => ({
      x: i % level.width,
      y: Math.floor(i / level.width),
      e: lv[String(i)] as Engr,
    }));
}

/** Deletes any engraving at (x, y). ref: src/engrave.c del_engr_at(), del_engr() */
export function delEngrAt(
  ctx: Pick<Ctx, 'state'>,
  level: Readonly<Level>,
  x: number,
  y: number,
): void {
  if (!inLevel(level, x, y)) return;
  const t = table(ctx, false);
  const lv = t?.[level.id];
  const key = String(cellIndex(level, x, y));
  if (!t || !lv || !(key in lv)) return;
  delete lv[key];
  if (Object.keys(lv).length === 0) delete t[level.id];
  if (Object.keys(t).length === 0) delete (ctx.state.modData['nh'] as Record<string, Json>)['engr'];
}

/**
 * Moves the engraving at (x, y) to (tx, ty) of the same level, as it is (C changes its
 * `engr_x`/`engr_y`). ref: src/engrave.c rloc_engr()
 */
export function moveEngr(
  ctx: Pick<Ctx, 'state'>,
  level: Readonly<Level>,
  x: number,
  y: number,
  tx: number,
  ty: number,
): void {
  const e = engrAt(ctx, level, x, y);
  if (!e) return;
  delEngrAt(ctx, level, x, y);
  const t = table(ctx, true) as EngrTable;
  (t[level.id] ??= {})[String(cellIndex(level, tx, ty))] = e;
}

/**
 * Writes `s` at (x, y), replacing what was there. `pristine` is the unworn text when `s` is
 * already worn (random engravings); `type` null picks a random one (`rnd(N_ENGRAVE - 1)`). An
 * "Elbereth" made with the level guards the objects on it (`in_mklev`).
 * ref: src/engrave.c make_engr_at()
 */
export function makeEngrAt(
  ctx: Pick<Ctx, 'state' | 'rng'>,
  level: Readonly<Level>,
  x: number,
  y: number,
  s: string,
  pristine: string | null,
  time: number,
  type: EngrType | null,
  opts?: { inMklev?: boolean },
): Engr {
  delEngrAt(ctx, level, x, y);
  const e: Engr = {
    text: s,
    pristine: pristine ?? s,
    // exercise(A_WIS, TRUE) for one the hero writes is not ported (no exercise)
    type: type ?? (RANDOM_ENGR_TYPES[ctx.rng.rnd(RANDOM_ENGR_TYPES.length) - 1] as EngrType),
    time,
  };
  if (s === 'Elbereth' && opts?.inMklev) e.guard = true;
  const t = table(ctx, true) as EngrTable;
  (t[level.id] ??= {})[String(cellIndex(level, x, y))] = e;
  return e;
}

/**
 * The engraving at (x, y) if it is `s` (strict: the whole text, any case) or contains it (any
 * case); never a headstone, nor one not finished yet. ref: src/engrave.c sengr_at()
 */
export function sengrAt(
  ctx: Pick<Ctx, 'state'>,
  s: string,
  level: Readonly<Level>,
  x: number,
  y: number,
  strict: boolean,
): Engr | null {
  const e = engrAt(ctx, level, x, y);
  if (!e || e.type === 'headstone' || e.time > ctx.state.turn) return null;
  const a = e.text.toLowerCase();
  const b = s.toLowerCase();
  return (strict ? a === b : a.includes(b)) ? e : null;
}

/** Partial rubouts for engraving characters (C's rubouts[] table in src/engrave.c). */
const RUBOUTS: Readonly<Record<string, string>> = {
  A: '^',
  B: 'Pb[',
  C: '(',
  D: '|)[',
  E: '|FL[_',
  F: '|-',
  G: 'C(',
  H: '|-',
  I: '|',
  K: '|<',
  L: '|_',
  M: '|',
  N: '|\\',
  O: 'C(',
  P: 'F',
  Q: 'C(',
  R: 'PF',
  T: '|',
  U: 'J',
  V: '/\\',
  W: 'V/\\',
  Z: '/',
  b: '|',
  d: 'c|',
  e: 'c',
  g: 'c',
  h: 'n',
  j: 'i',
  k: '|',
  l: '|',
  m: 'nr',
  n: 'r',
  o: 'c',
  q: 'c',
  w: 'v',
  y: 'v',
  ':': '.',
  ';': ',:',
  ',': '.',
  '=': '-',
  '+': '-|',
  '*': '+',
  '@': '0',
  '0': 'C(',
  '1': '|',
  '6': 'o',
  '7': '/',
  '8': '3o',
};

/** ref: include/global.h BUFSZ */
const BUFSZ = 256;

/** C's `seed *= 31, seed %= (BUFSZ - 1)` on an unsigned int. */
const nextSeed = (seed: number): number => (Math.imul(seed, 31) >>> 0) % (BUFSZ - 1);

/**
 * Degrades `cnt` random characters of `text`: small punctuation rubs out to a blank, a letter
 * with a rubout becomes one of its look-alikes 3 times in 4, anything else '?'; trailing blanks
 * are trimmed. A non-zero `seed` makes the wear reproducible instead of drawing from the game
 * RNG (C's naming hallucinations and T-shirt text; nothing uses it yet).
 * ref: src/engrave.c wipeout_text()
 */
export function wipeoutText(rng: Pick<Rng, 'rn2'>, text: string, cnt: number, seed = 0): string {
  const s = text.split('');
  const lth = s.length;
  let sd = seed >>> 0;
  if (lth && cnt > 0) {
    while (cnt--) {
      let nxt: number;
      let useRubout: number;
      if (!sd) {
        nxt = rng.rn2(lth);
        useRubout = rng.rn2(4);
      } else {
        nxt = sd % lth;
        sd = nextSeed(sd);
        useRubout = sd & 3;
      }
      const c = s[nxt] as string;
      if (c === ' ') continue;
      // rub out unreadable & small punctuation marks
      if ("?.,'`-|_".includes(c)) {
        s[nxt] = ' ';
        continue;
      }
      const to = useRubout ? RUBOUTS[c] : undefined;
      if (to !== undefined) {
        let j: number;
        if (!sd) {
          j = rng.rn2(to.length);
        } else {
          sd = nextSeed(sd);
          j = sd % to.length;
        }
        s[nxt] = to[j] as string;
      } else {
        // didn't pick rubout; use '?' for unreadable character
        s[nxt] = '?';
      }
    }
  }
  let n = lth;
  while (n && s[n - 1] === ' ') n--;
  return s.slice(0, n).join('');
}

/**
 * Wears `cnt` characters off the engraving at (x, y): never a headstone or a protected one; a
 * burned one only on ice or, half the time, to magic; anything but dust and blood loses at most
 * one character, rarely. The text loses its leading blanks and goes when nothing is left.
 * ref: src/engrave.c wipe_engr_at()
 */
export function wipeEngrAt(
  ctx: Pick<Ctx, 'state' | 'rng' | 'defs'>,
  level: Readonly<Level>,
  x: number,
  y: number,
  cnt: number,
  magical: boolean,
): void {
  const e = engrAt(ctx, level, x, y);
  // headstones and some specially marked engravings are indelible
  if (!e || e.type === 'headstone' || e.nowipe) return;
  if (e.type !== 'burn' || isIce(ctx, level, x, y) || (magical && !ctx.rng.rn2(2))) {
    if (e.type !== 'dust' && e.type !== 'blood')
      cnt = ctx.rng.rn2(1 + Math.trunc(50 / (cnt + 1))) ? 0 : 1;
    const worn = wipeoutText(ctx.rng, e.text, cnt, 0);
    let k = 0;
    while (worn[k] === ' ') k++;
    e.text = worn.slice(k);
    if (k) e.off = (e.off ?? 0) + k;
    if (!e.text) delEngrAt(ctx, level, x, y);
  }
}

/** Scuffs the engraving under the hero, if she can reach it. ref: src/engrave.c u_wipe_engr() */
export function uWipeEngr(ctx: Pick<Ctx, 'state' | 'rng' | 'defs'>, cnt: number): void {
  const pos = getPlayer(ctx.state).c.pos;
  const level = pos ? ctx.state.levels[pos.level] : undefined;
  if (!pos || !level) return;
  if (canReachFloor(ctx, true)) wipeEngrAt(ctx, level, pos.x, pos.y, cnt, false);
}

/**
 * After a walk or a rush that moved her: the engravings on the square she left and the one she
 * is on now (not headstones) each lose `rnd(5)` characters, if she can reach the floor.
 * ref: src/hack.c domove(), maybe_smudge_engr()
 */
export function maybeSmudgeEngr(
  ctx: Pick<Ctx, 'state' | 'rng' | 'defs'>,
  level: Readonly<Level>,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void {
  if (!canReachFloor(ctx, true)) return;
  const e1 = engrAt(ctx, level, x1, y1);
  if (e1 && e1.type !== 'headstone') wipeEngrAt(ctx, level, x1, y1, ctx.rng.rnd(5), false);
  const e2 = x2 !== x1 || y2 !== y1 ? engrAt(ctx, level, x2, y2) : null;
  if (e2 && e2.type !== 'headstone') wipeEngrAt(ctx, level, x2, y2, ctx.rng.rnd(5), false);
}

/**
 * Once a turn, after invault(): `!rn2(40 + 3 * Dex)` scuffs `rnd(3)` characters of the engraving
 * under the hero. ref: src/allmain.c moveloop_core()
 */
export function turnScuff(ctx: Pick<Ctx, 'state' | 'rng' | 'defs'>): void {
  if (ctx.state.gameOver) return;
  const dex = getPlayer(ctx.state).c.attributes?.dex ?? 10; // ACURR(A_DEX)
  if (!ctx.rng.rn2(40 + dex * 3)) uWipeEngr(ctx, ctx.rng.rnd(3));
}

export function registerEngr(api: ModApi): void {
  api.on('endOfTurn', turnScuff, { priority: -11 }); // invault() is -10
}
