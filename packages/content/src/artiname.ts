// Naming objects with artifact names: which names the hero may not give an object, and naming an
// object with what C's oname() does after it became an artifact. Above artistate.ts and shk.ts.
// ref: src/artifact.c restrict_name(); src/do_name.c oname(); src/o_init.c obj_shuffle_range()
import type { Ctx, DefId, Entity, GameState, ObjectDef, Registry } from '@nh/core';
import { ARTIFACTS } from './artilist';
import { oname, type ArtiOrigin } from './artistate';
import { messagesEn } from './messages.en';
import { ARMOR_RANGES, isKnown } from './o_init';
import { alterCost } from './shk';

/** The type's description as text (C's OBJ_DESCR: fixed, or this game's appearance), or null. */
function descrOf(state: Readonly<GameState>, defs: Registry, def: ObjectDef): string | null {
  const app = state.appearances[def.id];
  const key =
    def.descKey ??
    (app !== undefined && defs.isAppearance(app) ? defs.appearance(app).nameKey : null);
  return key === null ? null : (messagesEn[key] ?? key);
}

/**
 * Both types share a pool of shuffled descriptions: an armor sub-range, or the shuffled types of
 * a whole class (C's ranges are the magic, non-unique types of the class: here exactly the ones
 * that took an appearance). ref: src/o_init.c obj_shuffle_range()
 */
function sameShuffleRange(state: Readonly<GameState>, a: ObjectDef, b: ObjectDef): boolean {
  if (a.class === 'armor')
    return ARMOR_RANGES.some((r) => r.objs.includes(a.id) && r.objs.includes(b.id));
  return state.appearances[a.id] !== undefined && state.appearances[b.id] !== undefined;
}

/**
 * Whether the hero may not give the object this artifact name: a NOGEN or restricted artifact of
 * its type, or of any undiscovered type it could be (same class and description, or the same
 * pool of shuffled descriptions), and any artifact name for a stack ("Bug fix: don't name
 * multiple elven daggers Sting"). A leading "the " is ignored on both sides; the rest must match
 * exactly. ref: src/artifact.c restrict_name()
 */
export function restrictName(ctx: Pick<Ctx, 'state' | 'defs'>, obj: Entity, name: string): boolean {
  if (!name) return false;
  const nm = name.replace(/^the /i, '');
  const { state, defs } = ctx;
  const def = defs.object(obj.def);
  // decide what types of objects are the same as otyp; if it's been discovered, then only
  // itself matches; otherwise, include all other undiscovered objects of the same class which
  // have the same description or share the same pool of shuffled descriptions
  const odesc = isKnown(state, defs, def) ? null : descrOf(state, defs, def);
  const sametype = (id: DefId): boolean => {
    if (id === def.id) return true;
    if (odesc === null || !defs.isObject(id)) return false;
    const o = defs.object(id);
    if (o.class !== def.class || isKnown(state, defs, o)) return false;
    const other = descrOf(state, defs, o);
    return other !== null && (other === odesc || sameShuffleRange(state, def, o));
  };
  for (const a of ARTIFACTS) {
    if (!sametype(a.base)) continue;
    if (a.name.replace(/^the /i, '') === nm)
      return (
        a.spfx.includes('nogen') || a.spfx.includes('restr') || (obj.c.item?.quantity ?? 1) > 1
      );
  }
  return false;
}

/**
 * oname() with what C's oname() does once the object became an artifact: an unpaid one's price
 * on the shop bill goes up (alter_cost()). The wielded weapon's intrinsics
 * (set_artifact_intrinsic(obj, TRUE, W_WEP): Sting's warning) come with the artifact
 * extrinsics in m20 step 5; there is no two-weapon combat to stop (untwoweapon()).
 * ref: src/do_name.c oname()
 */
export function onameObj(
  ctx: Ctx,
  obj: Entity,
  name: string,
  origin: ArtiOrigin,
  knowArti: boolean,
): void {
  oname(ctx, obj, name, origin, knowArti);
  if (obj.c.item?.artifact === undefined) return;
  // TODO(m20 step 5): if obj is uwep, set_artifact_intrinsic(obj, TRUE, W_WEP)
  // if obj is owned by a shop, increase your bill
  if (obj.c.item.unpaid) alterCost(ctx, obj, 0);
}
