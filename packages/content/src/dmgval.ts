// Weapon damage. ref: src/weapon.c dmgval()
import type { Entity, MonsterDef, ObjectDef, Rng } from '@nh/core';
import { greatestErosion } from './material';
import { isBig } from './mondata';

/**
 * Extra damage some weapons do beyond their die: [small, large] dice or constants.
 * ref: src/weapon.c dmgval() switch (otyp), for the weapons in our subset.
 */
function dmgvalExtra(rng: Rng, id: string, big: boolean): number {
  switch (id) {
    case 'nh:mace': // d6+1 vs small
      return big ? 0 : 1;
    case 'nh:dwarvish_mattock': // d12 + 2d6 vs large
      return big ? rng.d(2, 6) : 0;
    default:
      return 0;
  }
}

/**
 * ref: src/weapon.c dmgval(): the weapon die by target size, the per-type extra, plus
 * enchantment, never below 0, less the greatest erosion (at least 1). Not ported: silver/blessed
 * bonuses, artifacts.
 */
export function dmgval(rng: Rng, item: Entity, def: ObjectDef, mon: MonsterDef): number {
  return dmgvalSized(rng, item, def, isBig(mon));
}

/** dmgval() against a target whose size class is already known (the hero is not big). */
export function dmgvalSized(rng: Rng, item: Entity, def: ObjectDef, big: boolean): number {
  const w = def.weapon;
  let tmp = 0;
  if (w) {
    const dice = big ? w.large : w.small;
    // rnd(oc_wsdam) / rnd(oc_wldam): the data stores them as [1, sides]
    tmp = rng.d(dice[0], dice[1]);
    tmp += dmgvalExtra(rng, def.id, big);
    tmp += item.c.item?.spe ?? 0;
    if (tmp < 0) tmp = 0;
  } else if (def.id === 'nh:splash_of_acid_venom') {
    // objects.h ACID_VENOM: oc_wsdam = oc_wldam = 6
    tmp = rng.rnd(6) + (item.c.item?.spe ?? 0);
    if (tmp < 0) tmp = 0;
  } else if (def.boulder === true) {
    // objects.h BOULDER: oc_wsdam = oc_wldam = 20
    tmp = rng.rnd(20) + (item.c.item?.spe ?? 0);
    if (tmp < 0) tmp = 0;
  }
  // "always subtract erosion even for blunt weapons"
  if (tmp > 0) {
    tmp -= greatestErosion(item);
    if (tmp < 1) tmp = 1;
  }
  return tmp;
}
