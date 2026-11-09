// Weapon damage. ref: src/weapon.c dmgval()
import type { Entity, MonsterDef, ObjectDef, Rng } from '@nh/core';
import { greatestErosion } from './material';
import { hatesSilver, isBig } from './mondata';

/**
 * Extra damage some weapons do beyond their die, against large and small targets.
 * ref: src/weapon.c dmgval() switch (otyp). Not ported: the iron chain (no ball and chain).
 */
function dmgvalExtra(rng: Rng, id: string, big: boolean): number {
  if (big) {
    switch (id) {
      case 'nh:crossbow_bolt':
      case 'nh:morning_star':
      case 'nh:partisan':
      case 'nh:runesword':
      case 'nh:elven_broadsword':
      case 'nh:broadsword':
        return 1;
      case 'nh:flail':
      case 'nh:ranseur':
      case 'nh:voulge':
        return rng.rnd(4);
      case 'nh:halberd':
      case 'nh:spetum':
        return rng.rnd(6);
      case 'nh:battle_axe':
      case 'nh:bardiche':
      case 'nh:trident':
        return rng.d(2, 4);
      case 'nh:tsurugi':
      case 'nh:dwarvish_mattock':
      case 'nh:two_handed_sword':
        return rng.d(2, 6);
      default:
        return 0;
    }
  }
  switch (id) {
    case 'nh:crossbow_bolt':
    case 'nh:mace':
    case 'nh:silver_mace':
    case 'nh:war_hammer':
    case 'nh:flail':
    case 'nh:spetum':
    case 'nh:trident':
      return 1;
    case 'nh:battle_axe':
    case 'nh:bardiche':
    case 'nh:bill_guisarme':
    case 'nh:guisarme':
    case 'nh:lucern_hammer':
    case 'nh:morning_star':
    case 'nh:ranseur':
    case 'nh:broadsword':
    case 'nh:elven_broadsword':
    case 'nh:runesword':
    case 'nh:voulge':
      return rng.rnd(4);
    default:
      return 0;
  }
}

/**
 * ref: src/weapon.c dmgval(): the weapon die by target size, the per-type extra, plus
 * enchantment, never below 0, a silver weapon's `rnd(20)` against a silver-hater, less the
 * greatest erosion (at least 1). Not ported: blessed and axe-versus-wooden bonuses, shades,
 * artifacts.
 */
export function dmgval(rng: Rng, item: Entity, def: ObjectDef, mon: MonsterDef): number {
  return dmgvalSized(rng, item, def, isBig(mon), hatesSilver(mon));
}

/**
 * dmgval() against a target whose size class is already known (the hero is not big);
 * `silverHater`: the target is harmed by silver (mon_hates_silver(), for the hero her form).
 */
export function dmgvalSized(
  rng: Rng,
  item: Entity,
  def: ObjectDef,
  big: boolean,
  silverHater = false,
): number {
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
  // weapon vs. monster type damage bonuses (weapons, weptools and gems only)
  if ((w || def.class === 'gem') && def.material === 'silver' && silverHater) tmp += rng.rnd(20);
  // "always subtract erosion even for blunt weapons"
  if (tmp > 0) {
    tmp -= greatestErosion(item);
    if (tmp < 1) tmp = 1;
  }
  return tmp;
}
