// What is in a tin: the tin varieties (tintxts[]), choosing one (set_tin_variety()) and reading
// it back (tin_variety()). A leaf (core and mondata only), so items.ts, objnam.ts, the wish code
// and the shops can use it without importing eat.ts. Opening and eating tins are m19 step 5.
// ref: src/eat.c tintxts[], set_tin_variety(), tin_variety(), tin_variety_txt()
//
// A tin's monster is `corpseOf` (C's corpsenm; absent is NON_PM: empty, or spinach) and its
// variety `spe`: 1 spinach, -(variety + 1) a chosen variety, 0 none chosen (drawn when opened).
import type { DefId, ItemComponent, Registry, Rng } from '@nh/core';
import { vegetarian } from './mondata';

export const TIN = 'nh:tin';

/** ref: include/hack.h ROTTEN_TIN, HOMEMADE_TIN, SPINACH_TIN */
export const ROTTEN_TIN = 0;
export const HOMEMADE_TIN = 1;
export const SPINACH_TIN = -1;

export interface TinVariety {
  /** The message key of its text ("tin.variety.<index>"). */
  txtKey: string;
  /** Nutrition. */
  nut: number;
  /** Fodder: a health food store may stock it (HEALTHY_TIN). */
  fodder: boolean;
  /** Greasy: eating it may make the fingers slippery. */
  greasy: boolean;
}

/** The varieties, in C's order (TTSZ - 1 = 15 of them). ref: src/eat.c tintxts[] */
export const TINTXT: readonly TinVariety[] = (
  [
    [-50, 0, 0], // rotten
    [50, 1, 0], // homemade
    [20, 1, 0], // soup made from
    [40, 0, 1], // french fried
    [40, 1, 0], // pickled
    [50, 1, 0], // boiled
    [50, 1, 0], // smoked
    [55, 1, 0], // dried
    [60, 0, 1], // deep fried
    [70, 1, 0], // szechuan
    [80, 0, 0], // broiled
    [80, 0, 1], // stir fried
    [95, 0, 0], // sauteed
    [100, 1, 0], // candied
    [500, 1, 0], // pureed
  ] as const
).map(([nut, fodder, greasy], i) => ({
  txtKey: `tin.variety.${i}`,
  nut,
  fodder: fodder === 1,
  greasy: greasy === 1,
}));

/** ref: src/eat.c nonrotting_corpse(): lizards and lichens never rot (eat.ts has the same) */
const nonrotting = (mon: DefId | undefined): boolean => mon === 'nh:lizard' || mon === 'nh:lichen';

/**
 * The variety a tin holds; `displ` true only looks (no draws): a cursed tin is always rotten, an
 * unchosen one draws one, a homemade one of a non-blessed tin goes bad 1 time in 7, and a lizard
 * or lichen tin is never rotten. ref: src/eat.c tin_variety()
 */
export function tinVariety(rng: Rng | null, it: ItemComponent, displ: boolean): number {
  let r: number;
  if (it.spe === 1) r = SPINACH_TIN;
  else if (it.buc === 'cursed')
    r = ROTTEN_TIN; // always rotten if cursed
  else if (it.spe < 0)
    r = -it.spe - 1; // get rid of the offset
  else r = rng && !displ ? rng.rn2(TINTXT.length) : ROTTEN_TIN;
  // some homemade tins go bad
  if (!displ && rng && r === HOMEMADE_TIN && it.buc !== 'blessed' && !rng.rn2(7)) r = ROTTEN_TIN;
  if (r === ROTTEN_TIN && nonrotting(it.corpseOf)) r = HOMEMADE_TIN; // lizards don't rot
  return r;
}

/**
 * Sets a tin's contents: `'spinach'`, a variety index, `'random'` (any but rotten for lizards
 * and lichens) or `'healthy'` (spinach for an empty tin or a meat one, else a fodder variety,
 * rotten only when cursed). ref: src/eat.c set_tin_variety()
 */
export function setTinVariety(
  rng: Rng,
  defs: Registry,
  it: ItemComponent,
  force: 'spinach' | 'random' | 'healthy' | number,
): void {
  const mnum = it.corpseOf;
  const veggy = mnum !== undefined && defs.isMonster(mnum) && vegetarian(defs.monster(mnum));
  let r: number;
  if (force === 'spinach' || (force === 'healthy' && (mnum === undefined || !veggy))) {
    delete it.corpseOf; // not based on any monster
    it.spe = 1; // spinach
    return;
  } else if (force === 'healthy') {
    r = tinVariety(rng, it, false);
    if (r < 0 || r >= TINTXT.length) r = ROTTEN_TIN; // shouldn't happen
    while ((r === ROTTEN_TIN && it.buc !== 'cursed') || !TINTXT[r]?.fodder)
      r = rng.rn2(TINTXT.length);
  } else if (typeof force === 'number' && force >= 0 && force < TINTXT.length) {
    r = force;
  } else {
    r = rng.rn2(TINTXT.length); // take your pick
    if (r === ROTTEN_TIN && nonrotting(mnum)) r = HOMEMADE_TIN; // lizards don't rot
  }
  it.spe = -(r + 1); // offset by 1 to allow index 0
}

/**
 * The variety a typed description starts with ("smoked newt meat"), as its index and the
 * length to skip (with the space), or null; `txts` are the varieties' texts in lower case.
 * ref: src/eat.c tin_variety_txt()
 */
export function tinVarietyTxt(
  s: string,
  txts: readonly string[],
): { variety: number; skip: number } | null {
  for (let k = 0; k < txts.length; k++) {
    const txt = txts[k] ?? '';
    if (txt !== '' && s.length > txt.length && s.startsWith(txt) && s[txt.length] === ' ')
      return { variety: k, skip: txt.length + 1 };
  }
  return null;
}
