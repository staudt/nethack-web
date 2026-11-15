// Rumors and random text lines. ref: src/rumors.c getrumor(), get_rnd_text()
//
// A leaf (the rng and the text tables). One `rn2(lines)` picks a line, uniform over the lines as
// C's random byte seek over a padded file is (m16 plan Q5). Not ported: exercise(A_WIS) for a
// rumor read outside level creation (no exercise), the Oracle and fortune cookies (outrumor()).
import type { Ctx } from '@nh/core';
import { ENGRAVE_TEXTS } from './engravetxt';
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
  return buf;
}

/** A random line of a text file (the engrave file for now). ref: src/rumors.c get_rnd_text() */
export function getRndText(ctx: Pick<Ctx, 'rng'>, file: 'engrave'): string {
  switch (file) {
    case 'engrave':
      return pick(ctx, ENGRAVE_TEXTS);
  }
}
