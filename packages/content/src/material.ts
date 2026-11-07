// Object materials and erosion levels: the material tests, greatest_erosion and ARM_BONUS.
// ref: include/objclass.h, include/obj.h, include/hack.h ARM_BONUS(), src/mkobj.c
// is_flammable(), is_rottable(), src/objnam.c erosion_matters()
import type { Ctx, Entity, ObjectDef } from '@nh/core';

// ---------------------------------------------------------------------------------------------
// materials

/** ref: include/objclass.h enum obj_material_types (the order matters for the macros) */
const MATERIALS = [
  'none',
  'liquid',
  'wax',
  'veggy',
  'flesh',
  'paper',
  'cloth',
  'leather',
  'wood',
  'bone',
  'dragon_hide',
  'iron',
  'metal',
  'copper',
  'silver',
  'gold',
  'platinum',
  'mithril',
  'plastic',
  'glass',
  'gemstone',
  'mineral',
] as const;
const mat = (def: ObjectDef): number => MATERIALS.indexOf(def.material as never);
const LIQUID = 1;
const WOOD = 8;
const DRAGON_HIDE = 10;
const IRON = 11;
const COPPER = 13;
const MITHRIL = 17;
const PLASTIC = 18;
const GLASS = 19;

/** ref: include/objclass.h is_rustprone() */
export const isRustprone = (def: ObjectDef): boolean => mat(def) === IRON;
/** ref: include/objclass.h is_corrodeable() */
export const isCorrodeable = (def: ObjectDef): boolean => mat(def) === COPPER || mat(def) === IRON;
/** ref: include/objclass.h is_crackable() */
export const isCrackable = (def: ObjectDef): boolean => mat(def) === GLASS && def.class === 'armor';
/** ref: include/objclass.h is_metallic() */
export const isMetallic = (def: ObjectDef): boolean => mat(def) >= IRON && mat(def) <= MITHRIL;

const CANDLES = new Set(['nh:tallow_candle', 'nh:wax_candle']);

/** ref: src/mkobj.c is_flammable() */
export function isFlammable(def: ObjectDef): boolean {
  if (CANDLES.has(def.id)) return false; // Is_candle()
  if (def.prop === 'fire_res' || def.id === 'nh:wand_of_fire') return false;
  const m = mat(def);
  return (m <= WOOD && m !== LIQUID) || m === PLASTIC;
}

/** ref: src/mkobj.c is_rottable() */
export function isRottable(def: ObjectDef): boolean {
  const m = mat(def);
  return (m <= WOOD && m !== LIQUID) || m === DRAGON_HIDE;
}

/** ref: include/objclass.h is_damageable() */
export const isDamageable = (def: ObjectDef): boolean =>
  isRustprone(def) || isFlammable(def) || isRottable(def) || isCorrodeable(def) || isCrackable(def);

/** A tool with a weapon skill (the pick-axe). ref: include/obj.h is_weptool() */
export const isWeptool = (def: ObjectDef): boolean =>
  def.class === 'tool' && def.weapon !== undefined;

/** Weapons and weapon-tools (doname() treats a weapon-tool as WEAPON_CLASS). */
export const isWeaponOrWeptool = (def: ObjectDef): boolean =>
  def.class === 'weapon' || isWeptool(def);

/** ref: src/objnam.c erosion_matters(): weapons, armor and weapon-tools (no balls or chains) */
export function erosionMatters(def: ObjectDef): boolean {
  if (def.class === 'tool') return isWeptool(def);
  return def.class === 'weapon' || def.class === 'armor';
}

/** ref: include/obj.h greatest_erosion() */
export function greatestErosion(item: Entity): number {
  const e = item.c.item?.erosion;
  return e ? Math.max(e.e1, e.e2) : 0;
}

/** ref: include/hack.h ARM_BONUS(): a_ac + spe - min(greatest_erosion, a_ac) */
export function armBonus(def: ObjectDef, item: Entity): number {
  const ac = def.armor?.ac ?? 0;
  return ac + (item.c.item?.spe ?? 0) - Math.min(greatestErosion(item), ac);
}

/**
 * Whether the object breaks when it hits something hard: potions and glass (not gems); 1% resist.
 * Eggs, cream pies, melons, venom and cameras do not exist. ref: src/dothrow.c breaktest()
 */
export function breaktest(ctx: Pick<Ctx, 'rng' | 'defs'>, e: Entity): boolean {
  const od = ctx.defs.object(e.def);
  if (ctx.rng.rn2(100) < 1) return false; // obj_resists(obj, 1, 99)
  return od.class === 'potion' || (od.material === 'glass' && od.class !== 'gem');
}
