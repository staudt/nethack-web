// Weapon damage. ref: src/weapon.c dmgval()
import type { Entity, MonsterDef, ObjectDef, Rng } from '@nh/core';
import { artiOf } from './artistate';
import { greatestErosion } from './material';
import { hatesBlessings, hatesSilver, isBig } from './mondata';

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

/** What dmgval() asks of its target besides its size: ref: src/weapon.c dmgval() */
export interface DmgvalTarget {
  /** a shade: only silver (shade_glare()) does its base damage */
  shade?: boolean;
  /** mon_hates_blessings(): a blessed weapon adds `rnd(4)` */
  blessHater?: boolean;
  /**
   * The artifact's damage bonus against this target (`spec_dbon(otmp, mon, tmp)`, artifact.ts
   * specDbon()): asked with 25 when the type bonuses come to more than 1, and when it doubles
   * the damage (25 or more) they are halved, so they come after the doubling in effect.
   */
  artiDbon?: (tmp: number) => number;
}

/**
 * ref: src/weapon.c dmgval(): the weapon die by target size, the per-type extra, plus
 * enchantment, never below 0, nothing against a shade unless silver (shade_glare()), a blessed
 * weapon's `rnd(4)` against undead and demons (mon_hates_blessings()), an axe's `rnd(4)`
 * against a wood golem (is_wooden()), a silver weapon's `rnd(20)` against a silver-hater, less
 * the greatest erosion (at least 1). `vampshifter`: the target is a vampire shapeshifter, which
 * hates silver and blessings in any form; an artifact that will double the damage halves these
 * bonuses (`artiDbon`, see DmgvalTarget). Not ported: thick skins, Sunsword's light.
 */
export function dmgval(
  rng: Rng,
  item: Entity,
  def: ObjectDef,
  mon: MonsterDef,
  vampshifter = false,
  artiDbon?: (tmp: number) => number,
): number {
  const silver = vampshifter || hatesSilver(mon);
  return dmgvalSized(rng, item, def, isBig(mon), silver, mon.id === 'nh:wood_golem', {
    shade: mon.id === 'nh:shade',
    blessHater: vampshifter || hatesBlessings(mon),
    ...(artiDbon ? { artiDbon } : {}),
  });
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
  wooden = false,
  target: DmgvalTarget = {},
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
  if (target.shade === true && !shadeGlare(def, item)) tmp = 0;
  // weapon vs. monster type damage bonuses (weapons, weptools and gems only)
  if (w || def.class === 'gem') {
    let bonus = 0;
    if (item.c.item?.buc === 'blessed' && target.blessHater === true) bonus += rng.rnd(4);
    if (w && w.skill === 'axe' && wooden) bonus += rng.rnd(4); // is_axe(otmp) && is_wooden(ptr)
    if (def.material === 'silver' && silverHater) bonus += rng.rnd(20);
    // if the weapon is going to get a double damage bonus, adjust this bonus so that
    // effectively it's added after the doubling
    if (bonus > 1 && item.c.item?.artifact !== undefined && (target.artiDbon?.(25) ?? 0) >= 25)
      bonus = Math.trunc((bonus + 1) / 2);
    tmp += bonus;
  }
  // "always subtract erosion even for blunt weapons"
  if (tmp > 0) {
    tmp -= greatestErosion(item);
    if (tmp < 1) tmp = 1;
  }
  return tmp;
}

/**
 * Harms a shade: any silver object, and an artifact made to slay undead (Sunsword).
 * ref: src/artifact.c shade_glare()
 */
export const shadeGlare = (def: ObjectDef, item?: Entity): boolean => {
  // any silver object is effective
  if (def.material === 'silver') return true;
  // non-silver artifacts with bonus against undead also are effective
  const b = artiOf(item)?.bane;
  return b?.kind === 'flag' && b.flag === 'undead';
};
