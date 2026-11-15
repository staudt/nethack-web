// A random engraving's text. ref: src/engrave.c random_engraving()
//
// A leaf (rumors.ts and engr.ts) so that zap.ts (a down zap of polymorph), engrave.ts and level
// creation can all use it.
import type { Ctx } from '@nh/core';
import { wipeoutText } from './engr';
import { getRndText, getrumor } from './rumors';

/**
 * A rumor 3 times in 4, else a line of the engrave file, with a quarter of its letters worn:
 * `text` is what is there, `pristine` the line as it was. ref: src/engrave.c random_engraving()
 */
export function randomEngraving(ctx: Pick<Ctx, 'rng'>): { text: string; pristine: string } {
  // a random engraving may come from the "rumors" file, or from the "engrave" file
  let pristine = '';
  if (ctx.rng.rn2(4)) pristine = getrumor(ctx, 0, true);
  if (!pristine) pristine = getRndText(ctx, 'engrave');
  return { text: wipeoutText(ctx.rng, pristine, Math.trunc(pristine.length / 4), 0), pristine };
}
