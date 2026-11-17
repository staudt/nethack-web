// Artifact rules that need more than the table and the state: which names the hero may not give
// an object, naming an object with what C's oname() does after it became an artifact, and the
// special attacks' to-hit and damage bonuses against what an artifact is made to slay.
// Above artistate.ts (the leaf); items.ts and mkobj.ts must not import it.
// ref: src/artifact.c restrict_name(), spec_applies(), spec_abon(), spec_dbon(), attacks(),
// spec_ability(); src/do_name.c oname(); src/o_init.c obj_shuffle_range()
import {
  getPlayer,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type GameState,
  type MonsterDef,
  type ObjectDef,
  type Registry,
} from '@nh/core';
import { A_NONE } from './aligntyp';
import { defended } from './artidef';
import { ARTIFACTS, type ArtiAd, type ArtifactDef, type Spfx } from './artilist';
import { artiAlign, artiOf, isArt, oname, type ArtiOrigin } from './artistate';
import { resistsDrliHero } from './exper';
import { uState } from './luck';
import { resists, resistsDrli } from './mresist';
import { P, hasProp } from './props';
import { RACES_TAB } from './racetab';
import { roleMonId } from './roletab';
import { heroForm } from './upoly';
import { urace, urole } from './urole';
import { ulycn } from './werestate';
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

// ---------------------------------------------------------------------------------------------
// the special attacks: what they apply to, to-hit and damage

/** C's NO_ATTK: PHYS(0, 0). */
const NO_ATTK = { ad: 'phys', damn: 0, damd: 0 } as const;

/** The artifact's attack, NO_ATTK for none. */
export const artiAttk = (a: ArtifactDef): { ad: ArtiAd; damn: number; damd: number } =>
  a.attk ?? NO_ATTK;

/** The object is an artifact whose special attack is of type `ad`. ref: src/artifact.c attacks() */
export function attacks(ad: ArtiAd, obj: Entity | null | undefined): boolean {
  const a = artiOf(obj);
  return a !== null && artiAttk(a).ad === ad;
}

/** The artifact has the property when wielded or worn. ref: src/artifact.c spec_ability() */
export const specAbility = (obj: Entity | null | undefined, spfx: Spfx): boolean =>
  artiOf(obj)?.spfx.includes(spfx) ?? false;

/**
 * The hero as a monster kind (youmonst.data): her form while polymorphed, else her role's
 * monster (urole.mnum), or null when the registry has neither.
 */
export function heroData(ctx: Pick<Ctx, 'state' | 'defs'>): MonsterDef | null {
  const form = heroForm(ctx);
  if (form) return form;
  const id: DefId = roleMonId(urole(ctx.state));
  return ctx.defs.isMonster(id) ? ctx.defs.monster(id) : null;
}

/**
 * Whether the artifact's special attacks apply against `target` (the hero or a monster): an
 * artifact with neither a bane nor SPFX_ATTK applies against everything when its attack is
 * physical; a bane applies to its monster, class, flag (for the hero also her own race's flags
 * while in her own form, and the were flag while she is a lycanthrope) or to another alignment
 * (a monster's kind: unaligned or of another sign); an elemental attack applies unless the
 * target is defended against it (defended()) or resists it (Magicbane's stun and magic missiles
 * against magic resistance: a monster saves with `rn2(100) < mr`, which is drawn).
 * ref: src/artifact.c spec_applies()
 */
export function specApplies(ctx: Ctx, a: ArtifactDef, target: EntityId): boolean {
  const atk = artiAttk(a);
  if (a.bane === null && !a.spfx.includes('attk')) return atk.ad === 'phys';
  const yours = target === ctx.state.playerId;
  const mon = ctx.state.entities[String(target)];
  if (!mon) return false;
  const ptr = yours ? heroData(ctx) : ctx.defs.monster(mon.def);
  const b = a.bane;
  if (b?.kind === 'mons') return ptr?.id === b.mon;
  if (b?.kind === 'class') return ptr?.glyph.ch === b.ch;
  if (b?.kind === 'flag') {
    if (ptr?.flags.includes(b.flag)) return true;
    // (SPFX_DFLAG1 and SPFX_DFLAG2 are one kind here: the hero's race only has M2 flags)
    return (
      yours &&
      ((!heroForm(ctx) && RACES_TAB[urace(ctx.state)].selfmask.includes(b.flag)) ||
        (b.flag === 'were' && ulycn(ctx.state) !== null))
    );
  }
  if (b?.kind === 'align') {
    const al = artiAlign(ctx.state, a);
    if (yours) return uState(ctx.state).alignType !== al;
    const malign = ptr?.alignment ?? 0;
    return malign === A_NONE || Math.sign(malign) !== al;
  }
  // SPFX_ATTK
  if (defended(ctx, target, atk.ad)) return false;
  const hero = getPlayer(ctx.state);
  switch (atk.ad) {
    case 'fire':
      return !(yours ? hasProp(hero, P.FIRE_RES) : resists(ctx, mon, 'fire'));
    case 'cold':
      return !(yours ? hasProp(hero, P.COLD_RES) : resists(ctx, mon, 'cold'));
    case 'elec':
      return !(yours ? hasProp(hero, P.SHOCK_RES) : resists(ctx, mon, 'elec'));
    case 'magm':
    case 'stun':
      return !(yours ? hasProp(hero, P.ANTIMAGIC) : ctx.rng.rn2(100) < (ptr?.mr ?? 0));
    case 'drst':
      return !(yours ? hasProp(hero, P.POISON_RES) : resists(ctx, mon, 'poison'));
    case 'drli':
      return !(yours ? hasProp(hero, P.DRAIN_RES) || resistsDrliHero(ctx) : resistsDrli(ctx, mon));
    default:
      // "Weird weapon special attack."
      return false;
  }
}

/**
 * The artifact's to-hit bonus against `target`: `rnd(damn)` when its attack applies (no draw
 * for an artifact without a to-hit die). ref: src/artifact.c spec_abon()
 */
export function specAbon(ctx: Ctx, obj: Entity, target: EntityId): number {
  const a = artiOf(obj);
  if (a === null) return 0;
  const atk = artiAttk(a);
  return atk.damn && specApplies(ctx, a, target) ? ctx.rng.rnd(atk.damn) : 0;
}

/**
 * The artifact's damage bonus against `target` on a hit doing `tmp`: `rnd(damd)`, or double
 * damage (`max(tmp, 1)`) for an artifact without a damage die, when its attack applies;
 * Grimtooth's applies against everyone. `applies` is C's gs.spec_dbon_applies, returned with
 * the bonus instead of kept in a global (artifact_hit() and Mb_hit() read it).
 * ref: src/artifact.c spec_dbon()
 */
export function specDbon(
  ctx: Ctx,
  obj: Entity,
  target: EntityId,
  tmp: number,
): { bonus: number; applies: boolean } {
  const a = artiOf(obj);
  const atk = a === null ? NO_ATTK : artiAttk(a);
  let applies: boolean;
  if (a === null || (atk.ad === 'phys' && atk.damn === 0 && atk.damd === 0)) applies = false;
  // Grimtooth has SPFX settings to warn against elves but we want its damage bonus to apply to
  // all targets, so bypass spec_applies()
  else if (isArt(obj, 'nh:grimtooth')) applies = true;
  else applies = specApplies(ctx, a, target);
  if (!applies) return { bonus: 0, applies };
  return { bonus: atk.damd ? ctx.rng.rnd(atk.damd) : Math.max(tmp, 1), applies };
}
