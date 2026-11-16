// Rumors and random text lines. ref: src/rumors.c getrumor(), get_rnd_text()
//
// A leaf (the rng and the text tables). One `rn2(lines)` picks a line, uniform over the lines as
// C's random byte seek over a padded file is (m16 plan Q5). Not ported: exercise(A_WIS) for a
// rumor read outside level creation (no exercise), the Oracle's outrumor(), BY_PAPER.
import { getPlayer, type Ctx } from '@nh/core';
import { P, hasProp } from './props';
import { ENGRAVE_TEXTS } from './engravetxt';
import { EPITAPH_TEXTS } from './epitaph';
import { FALSE_RUMORS, TRUE_RUMORS } from './rumortxt';

const COOKIE_MARKER = '[cookie] ';

/** One line of `lines`. */
const pick = (ctx: Pick<Ctx, 'rng'>, lines: readonly string[]): string =>
  lines[ctx.rng.rn2(lines.length)] ?? '';

/**
 * A rumor: true for `truth` 1, false for -1, either (a coin each try) for 0; with
 * `excludeCookie`, up to 50 re-picks skip the lines only fortune cookies say.
 * ref: src/rumors.c getrumor()
 */
export function getrumor(ctx: Pick<Ctx, 'rng'>, truth: -1 | 0 | 1, excludeCookie: boolean): string {
  let count = 0;
  let buf: string;
  do {
    // input 1, 0, -1 plus rn2(2): 2 or 1 is true, 0 or -1 false
    const adjtruth = truth + ctx.rng.rn2(2);
    buf = pick(ctx, adjtruth >= 1 ? TRUE_RUMORS : FALSE_RUMORS);
  } while (count++ < 50 && excludeCookie && buf.startsWith(COOKIE_MARKER));
  // remove cookie_marker from the string
  if (!excludeCookie && buf.startsWith(COOKIE_MARKER)) buf = buf.slice(COOKIE_MARKER.length);
  return buf;
}

/**
 * Reading a fortune cookie's rumor: nothing while fainted; blind "This cookie has a scrap of
 * paper inside." and "What a pity that you cannot read it!"; else that line, "It reads:" and the
 * rumor (true for a blessed cookie, false for a cursed one, either for an uncursed one). The
 * text goes out as a `msg` with the line as a literal param. Returns whether she read it (the
 * literacy conduct is not kept). ref: src/rumors.c outrumor() BY_COOKIE
 */
export function outrumorCookie(ctx: Ctx, truth: -1 | 0 | 1): boolean {
  const h = getPlayer(ctx.state);
  if (h.c.hunger?.state === 'fainted') return false;
  if (hasProp(h, P.BLINDED)) {
    ctx.emit({ type: 'msg', key: 'cookie.scrap' });
    ctx.emit({ type: 'msg', key: 'cookie.pity' });
    return false;
  }
  const line = getrumor(ctx, truth, false) || 'NetHack rumors file closed for renovation.';
  ctx.emit({ type: 'msg', key: 'cookie.scrap' });
  ctx.emit({ type: 'msg', key: 'cookie.reads' });
  ctx.emit({ type: 'msg', key: 'cookie.line', params: { line } });
  return true;
}

/** A random line of the engrave or epitaph file. ref: src/rumors.c get_rnd_text() */
export function getRndText(ctx: Pick<Ctx, 'rng'>, file: 'engrave' | 'epitaph'): string {
  switch (file) {
    case 'engrave':
      return pick(ctx, ENGRAVE_TEXTS);
    case 'epitaph':
      return pick(ctx, EPITAPH_TEXTS);
  }
}
