// A shapeshifter's true kind (C's `mon->cham`): the content table `modData.nh.cham`
// (`{ [monsterId]: defId }`, absent = NON_PM) kept beside mstate.ts's per-monster tables (copied by
// copyMState(), dropped by forgetMState()). A leaf (core and mondata.ts only), so the silver and
// blessing predicates, mfndpos(), onscary(), dogfood() and life saving can ask whether a
// monster is a vampire shapeshifter without importing shapeshift.ts.
// ref: include/monst.h cham, is_vampshifter(); src/makemon.c pm_to_cham();
// src/mondata.c mon_hates_silver(), mon_hates_blessings(); src/monmove.c can_fog(),
// stuff_prevents_passage()
import {
  contents,
  inventoryOf,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type Json,
  type MonsterDef,
} from '@nh/core';
import { hatesBlessings, hatesSilver } from './mondata';
import { isGenocided } from './vanquished';

export const VAMPIRE: DefId = 'nh:vampire';
export const VAMPIRE_LORD: DefId = 'nh:vampire_lord';
/** Vlad is not ported (his Tower is out); the id is kept for the C tests that name him. */
export const VLAD_THE_IMPALER: DefId = 'nh:vlad_the_impaler';
export const FOG_CLOUD: DefId = 'nh:fog_cloud';
export const VAMPIRE_BAT: DefId = 'nh:vampire_bat';
export const WOLF: DefId = 'nh:wolf';

type Table = { [k: string]: Json };
const isObj = (v: unknown): v is Table => v !== null && typeof v === 'object' && !Array.isArray(v);

function table(ctx: Pick<Ctx, 'state'>, create: boolean): Table | null {
  const md = ctx.state.modData;
  let root = md['nh'];
  if (!isObj(root)) {
    if (!create) return null;
    root = {};
    md['nh'] = root;
  }
  let t = root['cham'];
  if (!isObj(t)) {
    if (!create) return null;
    t = {};
    root['cham'] = t;
  }
  return t;
}

/** `mon->cham`: the shapeshifter's own kind, or null (NON_PM) for any other monster. */
export function chamOf(ctx: Pick<Ctx, 'state'>, id: EntityId): DefId | null {
  const v = table(ctx, false)?.[String(id)];
  return typeof v === 'string' ? (v as DefId) : null;
}

/** `mon->cham = pm` (null drops the entry). */
export function setCham(ctx: Pick<Ctx, 'state'>, id: EntityId, pm: DefId | null): void {
  const t = table(ctx, pm !== null);
  if (!t) return;
  if (pm === null) delete t[String(id)];
  else t[String(id)] = pm;
}

/** ref: include/mondata.h is_shapeshifter(): M2_SHAPESHIFTER */
export const isShapeshifter = (def: MonsterDef): boolean => def.flags.includes('shapeshifter');

/** The kind itself if it is a shapeshifter, else null. ref: src/makemon.c pm_to_cham() */
export const pmToCham = (def: MonsterDef): DefId | null => (isShapeshifter(def) ? def.id : null);

/** ref: include/mondata.h is_vampire(): the S_VAMPIRE class */
export const isVampire = (def: MonsterDef): boolean => def.glyph.ch === 'V';

/**
 * A vampire, vampire lord (or Vlad) whatever form it wears now. ref: include/monst.h
 * is_vampshifter()
 */
export function isVampshifter(ctx: Pick<Ctx, 'state'>, mon: Entity): boolean {
  const c = chamOf(ctx, mon.id);
  return c === VAMPIRE || c === VAMPIRE_LORD || c === VLAD_THE_IMPALER;
}

/** ref: include/monst.h vampshifted(): a vampshifter not in vampire form */
export const vampshifted = (ctx: Pick<Ctx, 'state' | 'defs'>, mon: Entity): boolean =>
  isVampshifter(ctx, mon) && !isVampire(ctx.defs.monster(mon.def));

/** Silver does it extra damage. ref: src/mondata.c mon_hates_silver() */
export const monHatesSilver = (ctx: Pick<Ctx, 'state' | 'defs'>, mon: Entity): boolean =>
  isVampshifter(ctx, mon) || hatesSilver(ctx.defs.monster(mon.def));

/** Blessed weapons and holy water hurt it. ref: src/mondata.c mon_hates_blessings() */
export const monHatesBlessings = (ctx: Pick<Ctx, 'state' | 'defs'>, mon: Entity): boolean =>
  isVampshifter(ctx, mon) || hatesBlessings(ctx.defs.monster(mon.def));

/** The objects that fit under a door (stuff_prevents_passage()'s list of allowed types). */
const PASSES: ReadonlySet<string> = new Set([
  // ARROW..BOOMERANG
  'nh:arrow',
  'nh:elven_arrow',
  'nh:orcish_arrow',
  'nh:silver_arrow',
  'nh:ya',
  'nh:crossbow_bolt',
  'nh:dart',
  'nh:shuriken',
  'nh:boomerang',
  // DAGGER..CRYSKNIFE
  'nh:dagger',
  'nh:elven_dagger',
  'nh:orcish_dagger',
  'nh:silver_dagger',
  'nh:athame',
  'nh:scalpel',
  'nh:knife',
  'nh:stiletto',
  'nh:worm_tooth',
  'nh:crysknife',
  'nh:sling',
  'nh:fedora',
  'nh:leather_jacket',
  'nh:credit_card',
  'nh:fortune_cookie',
  'nh:candy_bar',
  'nh:pancake',
  'nh:lembas_wafer',
  'nh:lump_of_royal_jelly',
  'nh:sack',
  'nh:bag_of_holding',
  'nh:bag_of_tricks',
  'nh:tallow_candle',
  'nh:wax_candle',
  'nh:oilskin_sack',
  'nh:leash',
  'nh:stethoscope',
  'nh:blindfold',
  'nh:towel',
  'nh:tin_whistle',
  'nh:magic_whistle',
  'nh:magic_marker',
  'nh:tin_opener',
  'nh:skeleton_key',
  'nh:lock_pick',
]);

/**
 * What the monster carries keeps it from squeezing under a door: more than 100 coins, a
 * container with something in it, or anything but gems, small missiles and blades, cloaks,
 * gloves, shirts and a few small tools, foods, amulets, rings and venom.
 * ref: src/monmove.c stuff_prevents_passage()
 */
export function stuffPreventsPassage(ctx: Pick<Ctx, 'state' | 'defs'>, mon: Entity): boolean {
  for (const obj of inventoryOf(ctx.state, mon.id)) {
    const it = obj.c.item;
    if (!it || !ctx.defs.isObject(obj.def)) continue;
    const od = ctx.defs.object(obj.def);
    if (od.class === 'coin' && it.quantity > 100) return true;
    const slot = od.armor?.slot;
    const corpseSmall =
      obj.def === 'nh:corpse' &&
      it.corpseOf !== undefined &&
      ctx.defs.isMonster(it.corpseOf) &&
      ctx.defs.monster(it.corpseOf).size === 'tiny';
    if (
      od.class !== 'gem' &&
      od.class !== 'amulet' &&
      od.class !== 'ring' &&
      od.class !== 'venom' &&
      slot !== 'cloak' &&
      slot !== 'gloves' &&
      slot !== 'shirt' &&
      !corpseSmall &&
      !PASSES.has(obj.def)
    )
      return true;
    if (od.container !== undefined && contents(ctx.state, obj.id).length > 0) return true;
  }
  return false;
}

/**
 * The monster can turn into a fog cloud to pass under a door: a vampire shapeshifter carrying
 * nothing bulky, while fog clouds are not genocided (no protection from shape changers exists).
 * ref: src/monmove.c can_fog()
 */
export function canFog(ctx: Pick<Ctx, 'state' | 'defs'>, mon: Entity): boolean {
  return (
    !isGenocided(ctx.state, FOG_CLOUD) && isVampshifter(ctx, mon) && !stuffPreventsPassage(ctx, mon)
  );
}
