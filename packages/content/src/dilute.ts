// Diluted potions and the potion of oil's fuel. A leaf (core only), so items.ts, objnam.ts, the
// wish code and polyobj.ts can use it.
// ref: include/obj.h `#define odiluted oeroded`, MAX_OIL_IN_FLASK; src/mkobj.c fixup_oil()
//
// A diluted potion is `erosion.e1 >= 1`, exactly as C keeps it in oeroded: mergable() already
// compares e1 (diluted and undiluted potions never stack) and splitStack() copies it; potions
// are not damageable, so no erosion word is ever shown for them.
import type { ItemComponent } from '@nh/core';

export const POT_OIL = 'nh:potion_of_oil';

/** ref: include/obj.h MAX_OIL_IN_FLASK: the oil in a potion of oil (its `age`) */
export const MAX_OIL_IN_FLASK = 400;

/** ref: include/obj.h odiluted */
export const isDiluted = (it: ItemComponent): boolean => (it.erosion?.e1 ?? 0) > 0;

/** Sets or clears a potion's dilution (C's `obj->odiluted = on`). */
export function setDiluted(it: ItemComponent, on: boolean): void {
  const e2 = it.erosion?.e2 ?? 0;
  if (on) it.erosion = { e1: 1, e2 };
  else if (e2) it.erosion = { e1: 0, e2 };
  else delete it.erosion;
}

/**
 * Potions of oil keep their fuel in `age`, others the turn they were made: after a potion's
 * type changed to or from oil, fix it up. `source` is the potion of oil it was made from, if any
 * (a partly used one leaves the new potion diluted); `turn` is the current turn (svm.moves).
 * ref: src/mkobj.c fixup_oil()
 */
export function fixupOil(
  potion: { def: string; it: ItemComponent },
  source: { def: string; it: ItemComponent } | null,
  turn: number,
): void {
  if (potion.def === POT_OIL) {
    // potion of oil being used to set potion's otyp to oil; source might be partly used, or
    // non-oil is being turned into oil (absolute age becomes the fuel left)
    potion.it.age = source?.def === POT_OIL ? (source.it.age ?? 0) : MAX_OIL_IN_FLASK;
  } else if (source?.def === POT_OIL) {
    // potion is no longer oil, being turned into non-oil
    if (potion.it.age === source.it.age) potion.it.age = turn;
    // when source is a partly used oil, mark potion as diluted
    if ((source.it.age ?? 0) < MAX_OIL_IN_FLASK) setDiluted(potion.it, true);
  }
}
