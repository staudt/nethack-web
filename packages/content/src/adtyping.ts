// The damage types (AD_*) of monster attacks: one function per type, each holding the mhitu
// (the defender is the hero) and mhitm (monster vs monster) branches, as NetHack 3.7 does.
// ref: src/uhitm.c mhitm_adtyping(), mhitm_ad_*(), mhitm_mgc_atk_negated(); include/hack.h
// struct mhitm_data
//
// The hero's own branch (`magr == &gy.youmonst`, C's uhitm) is only reachable when she is
// polymorphed (hmonas.ts damageum()); it comes first in each handler. The hit message (C's hitmsg() at the top of most mhitu
// branches, gv.vis's "X hits Y." in hitmm()) is given by the callers (combat.ts, mhitm.ts);
// `NO_HITMSG` lists the types whose mhitu branch gives none. Types not handled here yet (later
// m9 steps) do physical damage, as before.
import {
  getPlayer,
  inventoryOf,
  type AttackDef,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type MonsterDef,
  type Msg,
} from '@nh/core';
import { burnAwaySlime } from './slimestate';
import { stopOccupation } from './eat';
import { heroFemale } from './gender';
import { poisoned } from './attrib';
import { setUstuck, ustuck } from './hackmove';
import { SICK_NONVOMITABLE, hungerData, makeSick, morehungry, nomulNow } from './hunger';
import {
  P,
  hasExtrinsic,
  hasIntrinsic,
  hasProp,
  makeBlinded,
  makeConfused,
  makeStunned,
  ringBonus,
  timeoutLeft,
  uSlowDown,
} from './props';
import { canSpotMon, monNam } from './perception';
import {
  isCancelled,
  isFrozen,
  isMConfused,
  mblinded,
  mcansee,
  monAdjustSpeed,
  mspecUsed,
  mspeed,
  paralyzeMonst,
  setCancelled,
  setMConfused,
  setMStunned,
  setMblinded,
  setMspecUsed,
  forgetMState,
} from './mstate';
import { acidDamage, destroyItems, erodeArmor, rustm, type ErodeType } from './erode';
import { igniteItems } from './light';
import { dmgval } from './dmgval';
import { forgetMonster, minvent, monWep, setMonFlag, whichArmor } from './mongear';
import { mondied, monkilled, monsterDied } from './mondeath';
import { experienceFor, gainExperience } from './hero';
import { drainEn } from './uenergy';
import { setWoundedLegs, LEFT_SIDE, RIGHT_SIDE } from './legs';
import { uInAir } from './trapstate';
import { canseemon, tele, teleControlled, rlocMon, uTeleportMon } from './trap';
import { teleRestrict } from './teleport';

export { teleRestrict };
import { attrcurse } from './pray';
import { costlyAlteration } from './shk';
import { CHARGED_RINGS } from './objects';
import { hardHelmet, isWeptool } from './material';
import { doname, xnameOf } from './objnam';
import { abon, acurrClamp, addAbon, adjattrib, type Attr } from './attrib';
import { unaware } from './btrapped';
import { findgold, isAnimal, isNymph, steal, stealgold } from './steal';
import { monflee } from './monflee';
import { addToInventory, invCount, placeOnFloor, removeFromInventory } from './items';
import { corpseChanceSwallowed } from './corpses';
import { edogOf, swallowedNutrition } from './dog';
import { wakeNearto } from './noise';
import { doStoneU, minstapetrify, monstone } from './stoning';
import { losexp, resistsDrliHero } from './exper';
import { isHumanForm, isWere, setUlycn, ulycn } from './werestate';
import { wereChange } from './were';
import { heroForm } from './upoly';
import { hasHead, noncorporeal, nonliving } from './mondata';
import { engulfingU, flaming } from './engulfstate';
import { isSlimed, makeSlimed, slimeproof } from './slimestate';
import { fleshPetrifies, isStoned, makeStoned, resistsSton, touchPetrifies } from './stonestate';
import { done } from './end';
import { losespells } from './spell';
import { drainWeaponSkill } from './skills';

/** ref: include/mhitm.h M_ATTK_* */
export const M_ATTK = { MISS: 0, HIT: 1, DEF_DIED: 2, AGR_DIED: 4, AGR_DONE: 8 } as const;

/** The result of one attack. ref: include/hack.h struct mhitm_data */
export interface Mhm {
  damage: number;
  /** M_ATTK bits */
  hitflags: number;
  /** the handler resolved the attack: the caller returns `hitflags` */
  done: boolean;
  permdmg: number;
  specialdmg: number;
  dieroll: number;
}

/** What C's mhitm branches read from globals: gv.vis and mattackm()'s `mwep`. */
export interface AdEnv {
  vis: boolean;
  /** the attacker's wielded weapon for this attack (AT_WEAP or AT_CLAW), else null */
  mwep: Entity | null;
  /** grow_up() for a monster that killed its defender (mhitm.ts; late-bound to avoid a cycle) */
  growUp?: (ctx: Ctx, id: EntityId, victimLevel: number) => boolean;
  /** steal_it(): the polymorphed hero's theft (hmonas.ts; it sits above this module) */
  uStealIt?: (ctx: Ctx, mdef: Entity, atk: AttackDef) => void;
}

export const newMhm = (damage: number, dieroll = 0): Mhm => ({
  damage,
  hitflags: M_ATTK.MISS,
  done: false,
  permdmg: 0,
  specialdmg: 0,
  dieroll,
});

/**
 * The damage types whose mhitu branch gives no hitmsg() (they print their own line, or nothing).
 * ref: src/uhitm.c mhitm_ad_blnd(), mhitm_ad_legs(), mhitm_ad_halu(), mhitm_ad_heal()
 */
export const NO_HITMSG: ReadonlySet<string> = new Set(['blnd', 'legs', 'halu', 'wrap', 'heal']);

/** The theft and seduction types: their mhitu branch gives hitmsg() only for animals (monkeys). */
const SEDU_TYPES: ReadonlySet<string> = new Set(['sitm', 'sedu', 'ssex']);

/**
 * Whether hitmu() gives the hit message for this attack: not for NO_HITMSG's types, nor for a
 * physical hug (mhitm_ad_phys()'s AT_HUGS branch prints "grabs you!" or "being crushed" itself),
 * nor for a nymph's theft (mhitm_ad_sedu() prints its own lines; an animal's gets the hitmsg()).
 */
export const hitmsgFor = (atk: AttackDef, animal = false): boolean =>
  !NO_HITMSG.has(atk.ad) &&
  !(atk.at === 'hug' && atk.ad === 'phys') &&
  !(SEDU_TYPES.has(atk.ad) && !animal);

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const ent = (ctx: Ctx, id: EntityId): Entity | undefined => ctx.state.entities[String(id)];

const resists = (ctx: Ctx, mon: Entity, mr: string): boolean =>
  ctx.defs.monster(mon.def).resists.includes(mr);

// ---------------------------------------------------------------------------------------------
// magic cancellation

/**
 * The magic cancellation of the hero (or of monster `who`): the best worn armor's MC.
 * ref: src/mhitu.c magic_negation(): extrinsic Protection (the hero's ring, a worn cloak of
 * protection) adds 1, at most 3. Not ported: intrinsic Protection's minimum of 1, the amulet of
 * guarding, high priests' innate protection.
 */
export function magicNegation(ctx: Ctx, who: EntityId = ctx.state.playerId): number {
  let mc = 0;
  for (const o of inventoryOf(ctx.state, who)) {
    const slot = o.c.item?.equipped;
    if (!slot || slot === 'weapon') continue;
    mc = Math.max(mc, ctx.defs.object(o.def).armor?.mc ?? 0);
  }
  // a monster's worn item that gives Protection counts as the hero's extrinsic (protects():
  // the cloak of protection; no artifacts or high priests here)
  const gotprot =
    who === ctx.state.playerId
      ? hasExtrinsic(ctx.state.entities[String(who)], P.PROTECTION)
      : inventoryOf(ctx.state, who).some((o) => {
          const eq = o.c.item?.equipped;
          return !!eq && eq !== 'weapon' && ctx.defs.object(o.def).prop === P.PROTECTION;
        });
  if (gotprot) mc = Math.min(mc + 1, 3);
  return mc;
}

/**
 * Whether magical cancellation blocks the special effect of the attack of `magr` on the hero:
 * always when it is cancelled (no roll, no message), else rn2(10) against the hero's MC.
 * ref: src/uhitm.c mhitm_mgc_atk_negated() with `mdef == &gy.youmonst`
 */
export function mgcAtkNegated(ctx: Ctx, magr: Entity, verbosely: boolean): boolean {
  // no message if attacker has been cancelled
  if (isCancelled(ctx, magr.id)) return true;
  const armpro = magicNegation(ctx);
  const negated = !(ctx.rng.rn2(10) >= 3 * armpro);
  if (negated && verbosely) say(ctx, 'mhitu.avoid_harm');
  return negated;
}

/**
 * The same against a monster defender ("The jackal avoids harm." when seen).
 * ref: src/uhitm.c mhitm_mgc_atk_negated() with magic_negation(mdef)
 */
function mgcAtkNegatedMon(
  ctx: Ctx,
  magr: Entity,
  mdef: Entity,
  verbosely: boolean,
  vis: boolean,
): boolean {
  if (isCancelled(ctx, magr.id)) return true;
  const neg = !(ctx.rng.rn2(10) >= 3 * magicNegation(ctx, mdef.id));
  if (neg && verbosely && vis && canSpotMon(ctx, mdef))
    say(ctx, 'mhitm.avoids_harm', { mon: monNam(ctx, mdef) });
  return neg;
}

// ---------------------------------------------------------------------------------------------
// helpers

/**
 * A hold, wrap, sticky touch or swallow passes right through an unsolid target (lights, vortices,
 * most elementals, or the hero in such a form): "The owlbear's grab attempt passes right through
 * the yellow light!", "Your grab attempt passes right through the fog cloud!", "The owlbear's
 * grab attempt passes right through you!". The hero always hears of it. ref: src/mhitm.c
 * failed_grab() (no long worm tails)
 */
export function failedGrab(
  ctx: Ctx,
  magr: Entity,
  mdef: Entity,
  atk: AttackDef,
  vis: boolean,
): boolean {
  const hero = ctx.state.playerId;
  const pd = mdef.id === hero ? heroForm(ctx) : ctx.defs.monster(mdef.def);
  if (
    pd?.flags.includes('unsolid') &&
    (atk.at === 'hug' || atk.ad === 'wrap' || atk.ad === 'stck' || atk.ad === 'dgst')
  ) {
    if ((vis && canSpotMon(ctx, mdef)) || magr.id === hero || mdef.id === hero) {
      const verb = `@mhitm.verb.${atk.ad === 'dgst' ? 'gulp' : atk.ad === 'stck' ? 'adhere' : 'grab'}`;
      if (magr.id === hero) say(ctx, 'uhitm.grab_passes', { verb, mdef: monNam(ctx, mdef) });
      else if (mdef.id === hero) say(ctx, 'mhitu.grab_passes', { magr: monNam(ctx, magr), verb });
      else
        say(ctx, 'mhitm.grab_passes', { magr: monNam(ctx, magr), verb, mdef: monNam(ctx, mdef) });
    }
    return true;
  }
  return false;
}

/** The polymorphed hero is the aggressor (C's `magr == &gy.youmonst`). */
const isU = (ctx: Ctx, e: Entity): boolean => e.id === ctx.state.playerId;

/** Blind: the hero can't see the effect. */
const uBlind = (ctx: Ctx): boolean => hasProp(getPlayer(ctx.state), P.BLINDED);

/**
 * mhitm_mgc_atk_negated() with the hero attacking: she is never cancelled, and hmonas() sets
 * gv.vis, so "The jackal avoids harm." needs only that she sees it. ref: src/uhitm.c
 */
function uNegated(ctx: Ctx, mdef: Entity, verbosely: boolean): boolean {
  const neg = !(ctx.rng.rn2(10) >= 3 * magicNegation(ctx, mdef.id));
  if (neg && verbosely && canSpotMon(ctx, mdef))
    say(ctx, 'mhitm.avoids_harm', { mon: monNam(ctx, mdef) });
  return neg;
}

/** xkilled(mdef, XKILL_NOMSG): the hero kills it (alignment, luck, experience). ref: src/mon.c */
function uXkilled(ctx: Ctx, mdef: Entity, nocorpse = false): void {
  const level = mdef.c.monster?.level ?? 0;
  const def = ctx.defs.monster(mdef.def);
  monsterDied(ctx, mdef.id, true, false, nocorpse);
  gainExperience(ctx, ctx.state.playerId, experienceFor(def, level));
}

/**
 * ref: include/mondata.h sticks(): a monster that holds what it hits (a sticky touch, a wrap
 * that isn't an engulf, a hug)
 */
export const sticks = (def: MonsterDef): boolean =>
  def.attacks.some(
    (a) => a.ad === 'stck' || (a.ad === 'wrap' && !def.attacks.some((b) => b.at === 'engulf')),
  ) || def.attacks.some((a) => a.at === 'hug');

/** ref: src/mhitm.c slept_monst(): a sleeping grabber lets go */
function sleptMonst(ctx: Ctx, mon: Entity): void {
  if (ustuck(ctx) === mon.id && isFrozen(ctx, mon.id)) {
    say(ctx, 'zap.grip_relaxes', { mon: monNam(ctx, mon) });
    setUstuck(ctx, null);
  }
}

/** ref: src/mhitu.c mpoisons_subj(): how a poison attack was delivered (a message key) */
function poisonSubj(at: AttackDef['at']): string {
  switch (at) {
    case 'weapon':
      return '@poison.subj.attack';
    case 'touch':
      return '@poison.subj.contact';
    case 'gaze':
      return '@poison.subj.gaze';
    case 'bite':
      return '@poison.subj.bite';
    default:
      return '@poison.subj.sting';
  }
}

/** ref: src/mondata.c on_fire() for the monsters we have: hugs roast, the rest set you on fire */
const onFire = (at: AttackDef['at']): string => (at === 'hug' ? '@mhitu.roasted' : '@mhitu.fire');

/** ref: src/mhitm.c sleep_monst() (no resist() roll: how = -1) */
function sleepMonst(ctx: Ctx, mdef: Entity, amt: number): boolean {
  if (resists(ctx, mdef, 'sleep')) return false;
  if (isFrozen(ctx, mdef.id)) return false;
  paralyzeMonst(ctx, mdef.id, amt);
  return true;
}

/** ref: include/mondata.h haseyes() */
const haseyes = (ctx: Ctx, mon: Entity): boolean =>
  mon.id === ctx.state.playerId
    ? !heroForm(ctx)?.flags.includes('noeyes')
    : !ctx.defs.monster(mon.def).flags.includes('noeyes');

/**
 * The defender (the hero or a monster) cannot be blinded: already blind, unconscious, eyeless,
 * asleep, or a monster with a blinding explosion or gaze of its own. ref: src/mondata.c
 * resists_blnd() (no Sunsword)
 */
export function resistsBlnd(ctx: Ctx, mon: Entity): boolean {
  if (mon.id === ctx.state.playerId) {
    if (hasProp(mon, P.BLINDED) || unaware(ctx)) return true;
  } else if (
    !mcansee(ctx, mon.id) ||
    !haseyes(ctx, mon) ||
    mon.c.monster?.asleep === true // msleeping
  )
    return true;
  // a form (or monster) with a blinding explosion or gaze of its own
  const def = mon.id === ctx.state.playerId ? heroForm(ctx) : ctx.defs.monster(mon.def);
  return !!def?.attacks.some((a) => a.ad === 'blnd' && (a.at === 'explode' || a.at === 'gaze'));
}

/**
 * Whether the attack of `magr` (null: no specific aggressor) of type `aatyp` can blind `mdef`.
 * `obj`: the object thrown or spat (blinding venom). ref: src/mondata.c can_blnd(). Not ported:
 * cream pies (no `u.ucreamed`), potions of blindness, visored helmets (helmet appearances are not shuffled here, so no helmet
 * is a "visored helmet").
 */
export function canBlnd(
  ctx: Ctx,
  magr: Entity | null,
  mdef: Entity,
  aatyp: AttackDef['at'],
  obj: Entity | null = null,
): boolean {
  const isYou = mdef.id === ctx.state.playerId;
  // no eyes protect against all attacks for now
  if (!haseyes(ctx, mdef)) return false;
  // if monster has been permanently blinded, the deed is already done (mon_perma_blind())
  if (!isYou && !mcansee(ctx, mdef.id) && mblinded(ctx, mdef.id) === 0) return false;
  // a crow will not pluck out the eye of another crow
  const formOf = (e: Entity): string =>
    e.id === ctx.state.playerId ? (heroForm(ctx)?.id ?? e.def) : e.def;
  if (magr && formOf(magr) === 'nh:raven' && formOf(mdef) === 'nh:raven') return false;
  const ublindf = isYou && whichArmor(ctx, mdef.id, 'blindfold') !== null;
  switch (aatyp) {
    case 'explode':
    case 'boom':
    case 'gaze':
    case 'magic':
    case 'breath':
      // light-based attacks may be cancelled or resisted
      if (magr && isCancelled(ctx, magr.id)) return false;
      return !resistsBlnd(ctx, mdef);
    case 'weapon':
    case 'spit':
    case 'passive':
      // an object is used (thrown/spit/other)
      if (obj?.def !== 'nh:splash_of_blinding_venom') return false; // other objects cannot cause blindness yet
      // all ublindf, including lenses, protect (no u.ucreamed; no visored helmet: see above)
      if (isYou && ublindf) return false;
      break;
    case 'engulf':
      if (isYou && (ublindf || unaware(ctx))) return false;
      if (!isYou && mdef.c.monster?.asleep) return false;
      break;
    case 'claw':
      // e.g. raven: all ublindf, including lenses, protect
      if (ublindf) return false;
      break;
    case 'touch':
    case 'sting':
      // some physical, blind-inducing attacks can be cancelled
      if (magr && isCancelled(ctx, magr.id)) return false;
      break;
    default:
      break;
  }
  return true;
}

/**
 * Takes one point of enchantment or charge off an object (a worn ring's attribute bonus with it);
 * false if it has none to lose, or resists (1 time in 10). `byYou`: the hero did it (a shop bills
 * her for its own goods). ref: src/zap.c drain_item() (no artifacts: defends(AD_DRLI) is never
 * true; no gauntlets of dexterity or helms of brilliance in the subset, their cases kept)
 */
export function drainItem(ctx: Ctx, obj: Entity | null, byYou: boolean): boolean {
  const it = obj?.c.item;
  if (!obj || !it) return false;
  const def = ctx.defs.object(obj.def);
  const charged = def.class === 'wand' || CHARGED_RINGS.has(def.id);
  if (
    (!charged && def.class !== 'weapon' && def.class !== 'armor' && !isWeptool(def)) ||
    it.spe <= 0
  )
    return false;
  if (ctx.rng.rn2(100) < 10) return false; // obj_resists(obj, 10, 90)
  // charge for the cost of the object
  if (byYou && it.carriedBy === ctx.state.playerId) costlyAlteration(ctx, obj, 'drain', null);
  it.spe--;
  const uRing =
    it.carriedBy === ctx.state.playerId && (it.equipped === 'ringL' || it.equipped === 'ringR');
  const attr: Attr | null =
    obj.def === 'nh:ring_of_gain_strength'
      ? 'str'
      : obj.def === 'nh:ring_of_gain_constitution'
        ? 'con'
        : obj.def === 'nh:ring_of_adornment'
          ? 'cha'
          : null;
  // rings of increase accuracy/damage and protection are summed where they are used
  const a = getPlayer(ctx.state).c.attributes;
  if (attr && uRing && a) {
    const base = a[attr] - abon(ctx.state, attr);
    addAbon(ctx, attr, -1);
    a[attr] = acurrClamp(attr, base + abon(ctx.state, attr));
  }
  return true;
}

/**
 * A piece of the victim's armor: the cloak, suit or shirt, sometimes (1 in 4 each) the helmet,
 * gloves, boots or shield instead. ref: src/do_wear.c some_armor()
 */
export function someArmor(ctx: Ctx, victim: EntityId): Entity | null {
  let otmph =
    whichArmor(ctx, victim, 'cloak') ??
    whichArmor(ctx, victim, 'body') ??
    whichArmor(ctx, victim, 'shirt');
  for (const slot of ['helm', 'gloves', 'boots', 'shield'] as const) {
    const otmp = whichArmor(ctx, victim, slot);
    if (otmp && (!otmph || !ctx.rng.rn2(4))) otmph = otmp;
  }
  return otmph;
}

/** "Your X seems less effective." ref: Yobjnam2(obj, "seem") */
function lessEffective(ctx: Ctx, obj: Entity): void {
  const pl = (obj.c.item?.quantity ?? 1) !== 1 ? '_pl' : '';
  say(ctx, `adtyp.less_effective${pl}`, { item: xnameOf(ctx.state, ctx.defs, obj) });
}

/**
 * Hero or monster drained a monster's spell energy: casters and breathers wait d(2,2) more turns
 * ("The kobold shaman seems lethargic."). ref: src/mhitm.c xdrainenergym()
 */
export function xdrainenergym(ctx: Ctx, mon: Entity, givemsg: boolean): void {
  const def = ctx.defs.monster(mon.def);
  if (
    mspecUsed(ctx, mon.id) < 20 && // limit draining
    def.attacks.some((a) => a.at === 'magic' || a.at === 'breath')
  ) {
    setMspecUsed(ctx, mon.id, mspecUsed(ctx, mon.id) + ctx.rng.d(2, 2));
    if (givemsg) say(ctx, 'adtyp.lethargic', { mon: monNam(ctx, mon) });
  }
}

/** ref: include/mondata.h completelyrusts(), completelyrots() */
const completely = (type: ErodeType, def: string): boolean =>
  type === 'rust'
    ? def === 'nh:iron_golem'
    : type === 'rot'
      ? def === 'nh:wood_golem' || def === 'nh:leather_golem'
      : false;

/** The hero's ACURR(A_DEX) and ACURR(A_CON). */
const acurr = (ctx: Ctx, a: 'dex' | 'con'): number => getPlayer(ctx.state).c.attributes?.[a] ?? 10;

// ---------------------------------------------------------------------------------------------
// the damage types

/**
 * Whether slippery clothing protects the hero from a hug or wrap: a greased or oilskin cloak (or
 * suit, or shirt; the helmet against AD_DRIN), 1 time in 3 failing when cursed. Nothing is ever
 * greased and there is no oilskin cloak yet, so it never does; the rolls are C's.
 * ref: src/mhitu.c u_slip_free()
 */
export function uSlipFree(ctx: Ctx, magr: Entity, atk: AttackDef): boolean {
  // greased armor does not protect against AT_ENGL+AD_WRAP
  if (atk.at === 'engulf') return false;
  const hero = ctx.state.playerId;
  let obj = whichArmor(ctx, hero, 'cloak') ?? whichArmor(ctx, hero, 'body');
  if (!obj) obj = whichArmor(ctx, hero, 'shirt');
  if (atk.ad === 'drin') obj = whichArmor(ctx, hero, 'helm');
  // (no `greased` flag on objects)
  if (
    obj &&
    obj.def === 'nh:oilskin_cloak' &&
    (obj.c.item?.buc !== 'cursed' || ctx.rng.rn2(3) !== 0)
  ) {
    say(ctx, atk.ad === 'wrap' ? 'mhitu.slips_off' : 'mhitu.cannot_hold', {
      mon: monNam(ctx, magr),
      item: xnameOf(ctx.state, ctx.defs, obj),
    });
    return true;
  }
  return false;
}

/** ref: include/mondata.h slithy() with S_SNAKE or S_NAGA: a coiling wrap */
const coils = (ctx: Ctx, mon: Entity): boolean => {
  const d = mon.id === ctx.state.playerId ? heroForm(ctx) : ctx.defs.monster(mon.def);
  return !!d && d.flags.includes('slithy') && (d.glyph.ch === 'S' || d.glyph.ch === 'N');
};

/**
 * mhitm_ad_phys(): the mhitm part, and the mhitu AT_HUGS hold (the mhitu weapon damage is added
 * by combat.ts). A hug that is not a hold yet grabs her half the time ("The owlbear grabs you!");
 * one that holds her crushes ("You are being crushed."); otherwise it just does its damage.
 */
function adPhys(ctx: Ctx, magr: Entity, atk: AttackDef, mdef: Entity, mhm: Mhm, env: AdEnv): void {
  if (isU(ctx, magr)) {
    // uhitm (no shades)
    mhm.damage += mhm.specialdmg;
    if (atk.at === 'weapon') {
      // hmonas() uses known_hitum() to deal physical damage, then also damageum() for
      // non-AD_PHYS; don't inflict extra physical damage for unusual damage types
      mhm.damage = 0;
    } else if (atk.at === 'kick' || atk.at === 'claw' || atk.at === 'touch' || atk.at === 'hug') {
      if (ctx.defs.monster(mdef.def).flags.includes('thick_hide'))
        mhm.damage = atk.at === 'kick' ? 0 : Math.trunc((mhm.damage + 1) / 2);
      // add ring(s) of increase damage
      const udaminc = ringBonus(ctx.state, 'nh:ring_of_increase_damage');
      if (udaminc > 0) {
        mhm.damage += udaminc; // applies even if damage was 0
      } else if (mhm.damage > 0) {
        // ring(s) might be negative; avoid converting 0 to non-0 or positive to non-positive
        mhm.damage += udaminc;
        if (mhm.damage < 1) mhm.damage = 1;
      }
    }
    return;
  }
  if (mdef.id === ctx.state.playerId) {
    // (the hero is never sticky: no polymorph)
    if (atk.at === 'hug') {
      if (ustuck(ctx) === null && ctx.rng.rn2(2)) {
        if (uSlipFree(ctx, magr, atk)) {
          mhm.damage = 0;
        } else {
          setUstuck(ctx, magr.id);
          say(ctx, 'mhitu.grabs_you', { mon: monNam(ctx, magr) });
          mhm.hitflags |= M_ATTK.HIT;
        }
      } else if (ustuck(ctx) === magr.id) {
        // exercise(A_STR, FALSE): no exercise
        say(ctx, magr.def === 'nh:rope_golem' ? 'mhitu.being_choked' : 'mhitu.being_crushed');
      }
    }
    return; // mhitu: combat.ts did dmgval()
  }
  // a kick against a thick-skinned monster does nothing; a weapon (on AT_WEAP or AT_CLAW) adds
  // dmgval()
  const pd = ctx.defs.monster(mdef.def);
  if (atk.at === 'kick' && pd.flags.includes('thick_hide')) {
    mhm.damage = 0;
    return;
  }
  const mwep = env.mwep;
  if (mwep && (atk.at === 'weapon' || atk.at === 'claw')) {
    mhm.damage += dmgval(ctx.rng, mwep, ctx.defs.object(mwep.def), pd);
    if (mhm.damage < 1) mhm.damage = 1;
    rustm(ctx, mdef, mwep); // `if (mhm->damage) rustm(mdef, mwep)`: damage is at least 1
  } else if (magr.def === 'nh:purple_worm' && mdef.def === 'nh:shrieker') {
    // "we don't want purple worm's bite attack to kill a shrieker because then it won't swallow
    // the corpse; but if the target survives, the subsequent engulf attack should accomplish that"
    const mhp = mdef.c.hp?.cur ?? 0;
    if (mhm.damage >= mhp && mhp > 1) mhm.damage = mhp - 1;
  }
}

function adElec(ctx: Ctx, magr: Entity, _atk: AttackDef, mdef: Entity, mhm: Mhm, env: AdEnv): void {
  const damage = mhm.damage;
  if (isU(ctx, magr)) {
    if (uNegated(ctx, mdef, true)) {
      mhm.damage = 0;
      return;
    }
    if (!uBlind(ctx)) say(ctx, 'uhitm.zapped', { mon: monNam(ctx, mdef) });
    if (resists(ctx, mdef, 'elec')) {
      if (!uBlind(ctx)) say(ctx, 'mhitm.zap_no_shock', { mon: monNam(ctx, mdef) });
      mhm.damage = 0; // (no golemeffects(): no golems)
    }
    mhm.damage += destroyItems(ctx, mdef.id, 'elec', damage);
    return;
  }
  if (mdef.id === ctx.state.playerId) {
    if (!mgcAtkNegated(ctx, magr, true)) {
      say(ctx, 'mhitu.zapped');
      if (hasProp(mdef, P.SHOCK_RES)) {
        say(ctx, 'mhitu.zap_no_shock');
        mhm.damage = 0;
      }
      if ((magr.c.monster?.level ?? 0) > ctx.rng.rn2(20))
        destroyItems(ctx, mdef.id, 'elec', damage);
    } else mhm.damage = 0;
    return;
  }
  if (mgcAtkNegatedMon(ctx, magr, mdef, true, env.vis)) {
    mhm.damage = 0;
    return;
  }
  const seen = env.vis && canSpotMon(ctx, mdef);
  if (seen) say(ctx, 'mhitm.zapped', { mon: monNam(ctx, mdef) });
  if (resists(ctx, mdef, 'elec')) {
    if (seen) say(ctx, 'mhitm.zap_no_shock', { mon: monNam(ctx, mdef) });
    mhm.damage = 0;
  }
  mhm.damage += destroyItems(ctx, mdef.id, 'elec', damage);
}

function adFire(ctx: Ctx, magr: Entity, atk: AttackDef, mdef: Entity, mhm: Mhm, env: AdEnv): void {
  const damage = mhm.damage;
  if (isU(ctx, magr)) {
    if (uNegated(ctx, mdef, true)) {
      mhm.damage = 0;
      return;
    }
    if (!uBlind(ctx)) say(ctx, 'mhitm.on_fire', { mon: monNam(ctx, mdef) });
    // (completelyburns(): no paper or straw golems)
    if (resists(ctx, mdef, 'fire')) {
      if (!uBlind(ctx)) say(ctx, 'uhitm.fire_no_heat', { mon: monNam(ctx, mdef) });
      mhm.damage = 0;
    }
    mhm.damage += destroyItems(ctx, mdef.id, 'fire', damage);
    igniteItems(ctx, mdef.id);
    return;
  }
  if (mdef.id === ctx.state.playerId) {
    if (!mgcAtkNegated(ctx, magr, true)) {
      say(ctx, 'mhitu.on_fire', { how: onFire(atk.at) });
      if (hasProp(mdef, P.FIRE_RES)) {
        say(ctx, 'mhitu.fire_not_hot');
        mhm.damage = 0;
      }
      if ((magr.c.monster?.level ?? 0) > ctx.rng.rn2(20)) {
        destroyItems(ctx, mdef.id, 'fire', damage);
        igniteItems(ctx, mdef.id);
      }
      burnAwaySlime(ctx);
    } else mhm.damage = 0;
    return;
  }
  if (mgcAtkNegatedMon(ctx, magr, mdef, true, env.vis)) {
    mhm.damage = 0;
    return;
  }
  const seen = env.vis && canSpotMon(ctx, mdef);
  if (seen) say(ctx, 'mhitm.on_fire', { mon: monNam(ctx, mdef) });
  if (resists(ctx, mdef, 'fire')) {
    if (seen) say(ctx, 'mhitm.fire_no_burn', { mon: monNam(ctx, mdef) });
    mhm.damage = 0;
  }
  // the defender's carried items burn, with the attack's original damage
  const burnt = destroyItems(ctx, mdef.id, 'fire', damage);
  igniteItems(ctx, mdef.id);
  mhm.damage += burnt;
}

function adCold(ctx: Ctx, magr: Entity, _atk: AttackDef, mdef: Entity, mhm: Mhm, env: AdEnv): void {
  const damage = mhm.damage;
  if (isU(ctx, magr)) {
    if (uNegated(ctx, mdef, true)) {
      mhm.damage = 0;
      return;
    }
    if (!uBlind(ctx)) say(ctx, 'mhitm.frost', { mon: monNam(ctx, mdef) });
    if (resists(ctx, mdef, 'cold')) {
      if (!uBlind(ctx)) say(ctx, 'uhitm.frost_no_chill', { mon: monNam(ctx, mdef) });
      mhm.damage = 0;
    }
    mhm.damage += destroyItems(ctx, mdef.id, 'cold', damage);
    return;
  }
  if (mdef.id === ctx.state.playerId) {
    if (!mgcAtkNegated(ctx, magr, true)) {
      say(ctx, 'mhitu.frost');
      if (hasProp(mdef, P.COLD_RES)) {
        say(ctx, 'mhitu.frost_not_cold');
        mhm.damage = 0;
      }
      if ((magr.c.monster?.level ?? 0) > ctx.rng.rn2(20))
        destroyItems(ctx, mdef.id, 'cold', damage);
    } else mhm.damage = 0;
    return;
  }
  if (mgcAtkNegatedMon(ctx, magr, mdef, true, env.vis)) {
    mhm.damage = 0;
    return;
  }
  const seen = env.vis && canSpotMon(ctx, mdef);
  if (seen) say(ctx, 'mhitm.frost', { mon: monNam(ctx, mdef) });
  if (resists(ctx, mdef, 'cold')) {
    if (seen) say(ctx, 'mhitm.frost_no_chill', { mon: monNam(ctx, mdef) });
    mhm.damage = 0;
  }
  mhm.damage += destroyItems(ctx, mdef.id, 'cold', damage);
}

function adAcid(ctx: Ctx, magr: Entity, _atk: AttackDef, mdef: Entity, mhm: Mhm, env: AdEnv): void {
  if (isU(ctx, magr)) {
    if (resists(ctx, mdef, 'acid')) mhm.damage = 0;
    return;
  }
  if (mdef.id === ctx.state.playerId) {
    // one hit in three splashes you (a cancelled monster never)
    if (!isCancelled(ctx, magr.id) && ctx.rng.rn2(3) === 0) {
      if (hasProp(mdef, P.ACID_RES)) {
        say(ctx, 'mhitu.acid_harmless');
        mhm.damage = 0;
      } else say(ctx, 'mhitu.acid_burns');
    } else mhm.damage = 0;
    return;
  }
  if (isCancelled(ctx, magr.id)) {
    mhm.damage = 0;
    return;
  }
  const seen = env.vis && canSpotMon(ctx, mdef);
  if (resists(ctx, mdef, 'acid')) {
    if (seen) say(ctx, 'mhitm.acid_harmless', { mon: monNam(ctx, mdef) });
    mhm.damage = 0;
  } else if (seen) {
    say(ctx, 'mhitm.acid', { mon: monNam(ctx, mdef) });
    say(ctx, 'mhitm.acid_burns', { mon: monNam(ctx, mdef) });
  }
  if (ctx.rng.rn2(30) === 0) erodeArmor(ctx, mdef.id, 'corrode');
  if (ctx.rng.rn2(6) === 0) acidDamage(ctx, monWep(ctx, mdef.id));
}

function adSlee(ctx: Ctx, magr: Entity, _atk: AttackDef, mdef: Entity, mhm: Mhm, env: AdEnv): void {
  if (isU(ctx, magr)) {
    if (
      !mdef.c.monster?.asleep &&
      !uNegated(ctx, mdef, false) &&
      sleepMonst(ctx, mdef, ctx.rng.rnd(10))
    ) {
      if (!uBlind(ctx)) say(ctx, 'uhitm.put_to_sleep', { mon: monNam(ctx, mdef) });
      sleptMonst(ctx, mdef);
    }
    return;
  }
  if (mdef.id === ctx.state.playerId) {
    if (!mdef.c.helpless && ctx.rng.rn2(5) === 0 && !mgcAtkNegated(ctx, magr, true)) {
      if (hasProp(mdef, P.SLEEP_RES)) return;
      // ref: src/timeout.c fall_asleep(-rnd(10), TRUE)
      stopOccupation(ctx);
      nomulNow(ctx, ctx.rng.rnd(10), 'helpless.asleep', { key: 'eat.wake_up' });
      say(ctx, 'mhitu.put_to_sleep', { mon: monNam(ctx, magr) });
    }
    return;
  }
  // `sleep_monst(rnd(10)) && sleep_monst(rnd(10))`. As in NetHack the second call fails (the
  // target can no longer move), so it sleeps without the message.
  if (
    !mdef.c.monster?.asleep &&
    sleepMonst(ctx, mdef, ctx.rng.rnd(10)) &&
    sleepMonst(ctx, mdef, ctx.rng.rnd(10))
  ) {
    if (env.vis && canSpotMon(ctx, mdef))
      say(ctx, 'mhitm.put_to_sleep', { mon: monNam(ctx, mdef), by: monNam(ctx, magr) });
  }
}

/** mhitm_ad_drst(): AD_DRST, AD_DRDX and AD_DRCO */
function adDrst(ctx: Ctx, magr: Entity, atk: AttackDef, mdef: Entity, mhm: Mhm, env: AdEnv): void {
  if (isU(ctx, magr)) {
    const negated = uNegated(ctx, mdef, false);
    if (!negated && !ctx.rng.rn2(8)) {
      say(ctx, 'uhitm.was_poisoned', { subj: poisonSubj(atk.at) });
      if (resists(ctx, mdef, 'poison')) {
        say(ctx, 'mhitm.poison_no_effect', { mon: monNam(ctx, mdef) });
      } else if (!ctx.rng.rn2(10)) {
        say(ctx, 'uhitm.poison_deadly');
        mhm.damage = mdef.c.hp?.cur ?? 0;
      } else mhm.damage += ctx.rng.rn2(10) + 6; // rn1(10, 6)
    }
    return;
  }
  if (mdef.id === ctx.state.playerId) {
    const typ = atk.ad === 'drco' ? 'con' : atk.ad === 'drdx' ? 'dex' : 'str';
    const negated = mgcAtkNegated(ctx, magr, false);
    if (!negated && ctx.rng.rn2(8) === 0) {
      const name = monNam(ctx, magr);
      poisoned(
        ctx,
        { key: 'mhitu.was_poisoned', params: { mon: name, subj: poisonSubj(atk.at) } },
        typ,
        name,
        30,
      );
    }
    return;
  }
  // `!negated && !rn2(8)` -> mhitm_really_poison()
  const neg = mgcAtkNegatedMon(ctx, magr, mdef, false, env.vis);
  if (!neg && ctx.rng.rn2(8) === 0) {
    if (env.vis && canSpotMon(ctx, magr))
      say(ctx, 'mhitm.was_poisoned', { mon: monNam(ctx, magr) });
    if (resists(ctx, mdef, 'poison')) {
      if (env.vis && canSpotMon(ctx, mdef) && canSpotMon(ctx, magr))
        say(ctx, 'mhitm.poison_no_effect', { mon: monNam(ctx, mdef) });
    } else {
      mhm.damage += ctx.rng.rn2(10) + 6; // rn1(10, 6)
      if (mhm.damage >= (mdef.c.hp?.cur ?? 0) && env.vis && canSpotMon(ctx, mdef))
        say(ctx, 'mhitm.poison_deadly');
    }
  }
}

function adStun(ctx: Ctx, magr: Entity, atk: AttackDef, mdef: Entity, mhm: Mhm, env: AdEnv): void {
  if (isU(ctx, magr)) {
    if (!uBlind(ctx)) say(ctx, 'mhitm.staggers', { mon: monNam(ctx, mdef) });
    setMStunned(ctx, mdef.id, true);
    adPhys(ctx, magr, atk, mdef, mhm, env);
    return;
  }
  if (mdef.id === ctx.state.playerId) {
    if (!isCancelled(ctx, magr.id) && ctx.rng.rn2(4) === 0) {
      makeStunned(ctx, timeoutLeft(ctx.state, mdef, P.STUNNED) + mhm.damage, true);
      mhm.damage = Math.trunc(mhm.damage / 2);
    }
    return;
  }
  if (isCancelled(ctx, magr.id)) return;
  if (canSpotMon(ctx, mdef)) say(ctx, 'mhitm.staggers', { mon: monNam(ctx, mdef) });
  setMStunned(ctx, mdef.id, true);
  adPhys(ctx, magr, atk, mdef, mhm, env);
}

function adPlys(ctx: Ctx, magr: Entity, _atk: AttackDef, mdef: Entity, mhm: Mhm, env: AdEnv): void {
  if (isU(ctx, magr)) {
    if (!ctx.rng.rn2(3) && mhm.damage < (mdef.c.hp?.cur ?? 0) && !uNegated(ctx, mdef, true)) {
      if (!uBlind(ctx)) say(ctx, 'uhitm.frozen_by_you', { mon: monNam(ctx, mdef) });
      paralyzeMonst(ctx, mdef.id, ctx.rng.rnd(10));
    }
    return;
  }
  if (mdef.id === ctx.state.playerId) {
    if (!mdef.c.helpless && ctx.rng.rn2(3) === 0 && !mgcAtkNegated(ctx, magr, true)) {
      if (hasProp(mdef, P.FREE_ACTION)) say(ctx, 'free_action.stiffen');
      else {
        say(ctx, 'mhitu.frozen_by', { mon: monNam(ctx, magr) });
        nomulNow(ctx, ctx.rng.rnd(10), 'helpless.paralyzed', { key: 'eat.can_move_again' });
      }
    }
    return;
  }
  if (
    !isFrozen(ctx, mdef.id) &&
    ctx.rng.rn2(3) === 0 &&
    !mgcAtkNegatedMon(ctx, magr, mdef, true, env.vis)
  ) {
    if (env.vis && canSpotMon(ctx, mdef))
      say(ctx, 'mhitm.frozen_by', { mon: monNam(ctx, mdef), by: monNam(ctx, magr) });
    paralyzeMonst(ctx, mdef.id, ctx.rng.rnd(10));
  }
}

function adStck(ctx: Ctx, magr: Entity, atk: AttackDef, mdef: Entity, mhm: Mhm, env: AdEnv): void {
  if (isU(ctx, magr)) {
    // `!negated && !sticks(pd) && m_next2u(mdef)`: set_ustuck(mdef), it's now stuck to you --
    // not ported: the hero never holds a monster (DEVIATIONS "Polymorph")
    uNegated(ctx, mdef, false);
    return;
  }
  if (mdef.id === ctx.state.playerId) {
    const negated = mgcAtkNegated(ctx, magr, false);
    if (!negated && ustuck(ctx) === null) setUstuck(ctx, magr.id); // set_ustuck(magr)
    return;
  }
  // C's mhitm branch draws the negation roll (`if (negated) damage = 0`); the port has always
  // treated it as plain damage (see the plan's step 1 notes)
  adPhys(ctx, magr, atk, mdef, mhm, env);
}

/**
 * mhitm_ad_wrap(): a python or eel swinging (or coiling) itself around the hero, 1 time in 10,
 * then holding her; while held a hug crushes. Drowning needs pools (none yet). A monster target
 * is only brushed against when the damage comes to nothing.
 */
function adWrap(ctx: Ctx, magr: Entity, atk: AttackDef, mdef: Entity, mhm: Mhm, _env: AdEnv): void {
  const coil = coils(ctx, magr);
  if (isU(ctx, magr)) {
    if (!sticks(ctx.defs.monster(mdef.def))) {
      if (ustuck(ctx) === null && !ctx.rng.rn2(10)) {
        // (m_slips_free(): no monster wears greased armor or an oilskin cloak here)
        say(ctx, coil ? 'uhitm.coil_around' : 'uhitm.swing_around', { mon: monNam(ctx, mdef) });
        // set_ustuck(mdef): not ported, the hero never holds a monster
      } else if (ustuck(ctx) === mdef.id) {
        // (no pools to drown it in)
        if (atk.at === 'hug') say(ctx, 'uhitm.being_crushed', { mon: monNam(ctx, mdef) });
      } else {
        mhm.damage = 0;
        say(ctx, coil ? 'uhitm.brush_against' : 'uhitm.brush_leg', { mon: monNam(ctx, mdef) });
      }
    } else mhm.damage = 0;
    return;
  }
  if (mdef.id === ctx.state.playerId) {
    // (`!sticks(pd)`: the hero is never sticky)
    if (!isCancelled(ctx, magr.id) || ustuck(ctx) === magr.id) {
      if (ustuck(ctx) === null && ctx.rng.rn2(10) === 0) {
        if (uSlipFree(ctx, magr, atk)) {
          mhm.damage = 0;
        } else {
          setUstuck(ctx, magr.id); // before message, for botl update
          say(ctx, coil ? 'mhitu.coils_around' : 'mhitu.swings_around', {
            mon: monNam(ctx, magr),
          });
        }
      } else if (ustuck(ctx) === magr.id) {
        // pools: "X drowns you..." on a pool or moat square (no water terrain yet)
        if (atk.at === 'hug') say(ctx, 'mhitu.being_crushed');
      } else {
        mhm.damage = 0;
        say(ctx, coil ? 'mhitu.brushes_against' : 'mhitu.brushes_leg', {
          mon: monNam(ctx, magr),
        });
      }
    } else mhm.damage = 0;
    return;
  }
  // mhitm
  if (isCancelled(ctx, magr.id)) mhm.damage = 0;
  if (!mhm.damage && (canSpotMon(ctx, magr) || canSpotMon(ctx, mdef)))
    say(ctx, 'mhitm.brushes_against', { magr: monNam(ctx, magr), mdef: monNam(ctx, mdef) });
}

/** mhitm_ad_rust(), mhitm_ad_corr(), mhitm_ad_dcay(): erode a random piece of armor */
function adErode(
  type: ErodeType,
): (ctx: Ctx, magr: Entity, atk: AttackDef, mdef: Entity, mhm: Mhm, env: AdEnv) => void {
  return (ctx, magr, _atk, mdef, mhm, env) => {
    if (isU(ctx, magr)) {
      // (completelyrusts(), completelyrots(): no golems)
      erodeArmor(ctx, mdef.id, type);
      mhm.damage = 0;
      return;
    }
    if (mdef.id === ctx.state.playerId) {
      if (isCancelled(ctx, magr.id)) return;
      // (completelyrusts(youmonst.data): no golem forms)
      erodeArmor(ctx, mdef.id, type);
      return;
    }
    if (isCancelled(ctx, magr.id)) return;
    if (completely(type, mdef.def)) {
      // the life-saved case is hypothetical because life-saving doesn't work for golems
      if (env.vis && canSpotMon(ctx, mdef))
        say(ctx, 'adtyp.falls_to_pieces', { mon: monNam(ctx, mdef) });
      const victimLevel = mdef.c.monster?.level ?? 0;
      monkilled(ctx, mdef.id, false); // monkilled(mdef, (char *) 0, AD_RUST)
      mhm.done = true;
      if (ent(ctx, mdef.id)?.c.monster) {
        mhm.hitflags = M_ATTK.MISS;
        return;
      }
      const grew = env.growUp ? env.growUp(ctx, magr.id, victimLevel) : true;
      mhm.hitflags = M_ATTK.DEF_DIED | (grew ? 0 : M_ATTK.AGR_DIED);
      return;
    }
    erodeArmor(ctx, mdef.id, type);
    mhm.damage = 0;
  };
}

function adDren(ctx: Ctx, magr: Entity, atk: AttackDef, mdef: Entity, mhm: Mhm, env: AdEnv): void {
  if (isU(ctx, magr)) {
    if (!uNegated(ctx, mdef, false) && !ctx.rng.rn2(4)) xdrainenergym(ctx, mdef, true);
    mhm.damage = 0;
    return;
  }
  if (mdef.id === ctx.state.playerId) {
    const negated = mgcAtkNegated(ctx, magr, false);
    if (!negated && !ctx.rng.rn2(4)) drainEn(ctx, mhm.damage, false); // 25% chance
    mhm.damage = 0;
    return;
  }
  const negated = mgcAtkNegatedMon(ctx, magr, mdef, false, env.vis);
  if (!negated && !ctx.rng.rn2(4))
    xdrainenergym(ctx, mdef, env.vis && canSpotMon(ctx, mdef) && atk.at !== 'engulf');
  mhm.damage = 0;
}

function adTlpt(ctx: Ctx, magr: Entity, _atk: AttackDef, mdef: Entity, mhm: Mhm, env: AdEnv): void {
  if (isU(ctx, magr)) {
    if (mhm.damage <= 0) mhm.damage = 1;
    if (uNegated(ctx, mdef, true)) {
      say(ctx, 'mhitm.not_affected', { mon: monNam(ctx, mdef) });
    } else {
      const uSawMon = canseemon(ctx, mdef) || engulfingU(ctx, mdef.id);
      // record the name before losing sight of monster
      const name = monNam(ctx, mdef);
      if (
        uTeleportMon(ctx, mdef, false) &&
        uSawMon &&
        !(canseemon(ctx, mdef) || engulfingU(ctx, mdef.id))
      )
        say(ctx, 'adtyp.suddenly_disappears', { mon: name });
      const hp = mdef.c.hp;
      if (hp && mhm.damage >= hp.cur) {
        // see hitmu(mhitu.c)
        if (hp.cur === 1) hp.cur++;
        mhm.damage = hp.cur - 1;
      }
    }
    return;
  }
  if (mdef.id === ctx.state.playerId) {
    if (mgcAtkNegated(ctx, magr, false)) say(ctx, 'adtyp.you_not_affected');
    else {
      // flags.verbose; "very " unless she controls it (and is awake)
      say(
        ctx,
        teleControlled(ctx) && !unaware(ctx)
          ? 'adtyp.position_uncertain_ctrl'
          : 'adtyp.position_uncertain',
      );
      tele(ctx); // controlled: the cell is asked for once the monster's move stops
      // make sure the damage isn't fatal (no Half_physical_damage, no polymorph)
      const hp = getPlayer(ctx.state).c.hp;
      if (hp && mhm.damage >= hp.cur) {
        mhm.damage = hp.cur - 1;
        if (mhm.damage < 1) {
          // implies hp <= 1: the caller takes it straight back off
          mhm.damage = 1;
          if (hp.cur === 1) hp.cur++;
        }
      }
    }
    return;
  }
  const hp = mdef.c.hp;
  if (isCancelled(ctx, magr.id) || mhm.damage >= (hp?.cur ?? 0) || teleRestrict(ctx, mdef)) {
    // no negation message
  } else if (mgcAtkNegatedMon(ctx, magr, mdef, true, env.vis)) {
    if (env.vis) say(ctx, 'mhitm.not_affected', { mon: monNam(ctx, mdef) });
  } else {
    const wasseen = canSpotMon(ctx, mdef);
    const name = monNam(ctx, mdef);
    rlocMon(ctx, mdef, false);
    if (env.vis && wasseen && !canSpotMon(ctx, mdef))
      say(ctx, 'adtyp.suddenly_disappears', { mon: name });
    if (hp && mhm.damage >= hp.cur) {
      if (hp.cur === 1) hp.cur++;
      mhm.damage = hp.cur - 1;
    }
  }
}

function adBlnd(ctx: Ctx, magr: Entity, atk: AttackDef, mdef: Entity, mhm: Mhm, env: AdEnv): void {
  if (isU(ctx, magr)) {
    if (canBlnd(ctx, magr, mdef, atk.at)) {
      if (!uBlind(ctx) && mcansee(ctx, mdef.id))
        say(ctx, 'adtyp.is_blinded', { mon: monNam(ctx, mdef) });
      mhm.damage += mblinded(ctx, mdef.id);
      if (mhm.damage > 127) mhm.damage = 127;
      setMblinded(ctx, mdef.id, mhm.damage);
    }
    mhm.damage = 0;
    return;
  }
  if (mdef.id === ctx.state.playerId) {
    if (canBlnd(ctx, magr, mdef, atk.at)) {
      if (!hasProp(mdef, P.BLINDED)) say(ctx, 'adtyp.blinds_you', { mon: monNam(ctx, magr) });
      makeBlinded(ctx, timeoutLeft(ctx.state, mdef, P.BLINDED) + mhm.damage, false);
      // `if (!Blind) Your1(vision_clears)`: the Eyes of the Overworld do not exist
    }
    mhm.damage = 0;
    return;
  }
  if (canBlnd(ctx, magr, mdef, atk.at)) {
    if (env.vis && mcansee(ctx, mdef.id) && canSpotMon(ctx, mdef))
      say(ctx, 'adtyp.is_blinded', { mon: monNam(ctx, mdef) }); // no Archon
    let rndTmp = ctx.rng.d(atk.n, atk.d);
    if ((rndTmp += mblinded(ctx, mdef.id)) > 127) rndTmp = 127;
    setMblinded(ctx, mdef.id, rndTmp);
  }
  mhm.damage = 0;
}

/** ref: src/hacklib.c night(): there is no clock (see DEVIATIONS.md "No clock") */
const night = (): boolean => false;

function adCurs(ctx: Ctx, magr: Entity, _atk: AttackDef, mdef: Entity, mhm: Mhm, env: AdEnv): void {
  if (isU(ctx, magr)) {
    // `night() && !rn2(10) && !mdef->mcan`: never, there is no clock (no clay golems either)
    if (night() && !ctx.rng.rn2(10) && !isCancelled(ctx, mdef.id)) {
      setCancelled(ctx, mdef.id);
      say(ctx, 'uhitm.chuckle');
    }
    mhm.damage = 0;
    return;
  }
  if (mdef.id === ctx.state.playerId) {
    if (!night() && magr.def === 'nh:gremlin') return;
    if (!isCancelled(ctx, magr.id) && !ctx.rng.rn2(10)) {
      // never Deaf
      if (hasProp(mdef, P.BLINDED)) say(ctx, 'adtyp.hear_laughter');
      else say(ctx, 'adtyp.chuckles', { mon: monNam(ctx, magr) });
      // (u.umonnum == PM_CLAY_GOLEM: no golem forms)
      attrcurse(ctx); // mon_give_prop(magr, ...): monsters' intrinsics are not modelled
    }
    return;
  }
  if (!night() && magr.def === 'nh:gremlin') return;
  if (!isCancelled(ctx, magr.id) && !ctx.rng.rn2(10)) {
    setCancelled(ctx, mdef.id); // cancelled regardless of lifesave
    const pd = ctx.defs.monster(mdef.def);
    if (isWere(pd) && !isHumanForm(pd)) wereChange(ctx, mdef);
    if (mdef.def === 'nh:clay_golem') {
      if (env.vis && canSpotMon(ctx, mdef)) {
        say(ctx, 'adtyp.writing_vanishes', { mon: monNam(ctx, mdef) });
        say(ctx, 'mhitm.is_destroyed', { mon: monNam(ctx, mdef) });
      }
      const victimLevel = mdef.c.monster?.level ?? 0;
      mondied(ctx, mdef.id);
      mhm.done = true;
      if (ent(ctx, mdef.id)?.c.monster) {
        mhm.hitflags = M_ATTK.MISS;
        return;
      }
      const grew = env.growUp ? env.growUp(ctx, magr.id, victimLevel) : true;
      mhm.hitflags = M_ATTK.DEF_DIED | (grew ? 0 : M_ATTK.AGR_DIED);
      return;
    }
    if (!env.vis) say(ctx, 'adtyp.hear_laughter');
    else if (canSpotMon(ctx, magr)) say(ctx, 'adtyp.chuckles', { mon: monNam(ctx, magr) });
  }
}

function adEnch(
  ctx: Ctx,
  magr: Entity,
  _atk: AttackDef,
  mdef: Entity,
  _mhm: Mhm,
  _env: AdEnv,
): void {
  // uhitm and mhitm: there's no msomearmor() function, so just do damage
  if (mdef.id !== ctx.state.playerId) return;
  const negated = mgcAtkNegated(ctx, magr, false);
  // uncancelled is sufficient enough; please don't make this attack less frequent
  if (negated) return;
  let obj = someArmor(ctx, mdef.id);
  if (!obj) {
    // some rings are susceptible; amulets and blindfolds aren't (at present)
    const slot = (['', 'ringR', 'ringL', 'amulet', 'blindfold'] as const)[ctx.rng.rn2(5)];
    obj = slot ? whichArmor(ctx, mdef.id, slot) : null;
  }
  if (obj && drainItem(ctx, obj, false)) lessEffective(ctx, obj);
}

function adSlow(
  ctx: Ctx,
  magr: Entity,
  _atk: AttackDef,
  mdef: Entity,
  _mhm: Mhm,
  env: AdEnv,
): void {
  const isYou = mdef.id === ctx.state.playerId;
  const negated = isU(ctx, magr)
    ? uNegated(ctx, mdef, false)
    : isYou
      ? mgcAtkNegated(ctx, magr, false)
      : mgcAtkNegatedMon(ctx, magr, mdef, false, env.vis);
  if (isU(ctx, magr)) {
    if (!negated && mspeed(ctx, mdef.id) !== 'slow') {
      const oldspeed = mspeed(ctx, mdef.id);
      monAdjustSpeed(ctx, mdef, -1);
      if (mspeed(ctx, mdef.id) !== oldspeed && canseemon(ctx, mdef))
        say(ctx, 'adtyp.slows_down', { mon: monNam(ctx, mdef) });
    }
    return;
  }
  // defended(mdef, AD_SLOW): no artifacts
  if (isYou) {
    // HFast: the intrinsic or a timed speed, not speed boots
    const hfast = hasIntrinsic(mdef, P.FAST) || timeoutLeft(ctx.state, mdef, P.FAST) > 0;
    if (!negated && hfast && !ctx.rng.rn2(4)) uSlowDown(ctx);
    return;
  }
  if (!negated && mspeed(ctx, mdef.id) !== 'slow') {
    const oldspeed = mspeed(ctx, mdef.id);
    monAdjustSpeed(ctx, mdef, -1);
    if (mspeed(ctx, mdef.id) !== oldspeed && env.vis && canSpotMon(ctx, mdef))
      say(ctx, 'adtyp.slows_down', { mon: monNam(ctx, mdef) });
  }
}

function adConf(ctx: Ctx, magr: Entity, _atk: AttackDef, mdef: Entity, mhm: Mhm, env: AdEnv): void {
  if (isU(ctx, magr)) {
    if (!isMConfused(ctx, mdef.id)) {
      if (canseemon(ctx, mdef))
        say(ctx, 'adtyp.looks_confused', { mon: monNam(ctx, mdef), more: '' });
      setMConfused(ctx, mdef.id, true);
    }
    return;
  }
  if (mdef.id === ctx.state.playerId) {
    if (!isCancelled(ctx, magr.id) && !ctx.rng.rn2(4) && !mspecUsed(ctx, magr.id)) {
      setMspecUsed(ctx, magr.id, mspecUsed(ctx, magr.id) + (mhm.damage + ctx.rng.rn2(6)));
      say(ctx, hasProp(mdef, P.CONFUSION) ? 'adtyp.more_confused' : 'adtyp.getting_confused');
      // make_confused(HConfusion + damage, FALSE)
      makeConfused(ctx, timeoutLeft(ctx.state, mdef, P.CONFUSION) + mhm.damage, false);
    }
    mhm.damage = 0;
    return;
  }
  // Since confusing another monster doesn't have a real time limit, setting spec_used would not
  // really be right (though we still should check for it).
  if (!isCancelled(ctx, magr.id) && !isMConfused(ctx, mdef.id) && !mspecUsed(ctx, magr.id)) {
    if (env.vis && canSpotMon(ctx, mdef))
      say(ctx, 'adtyp.looks_confused', { mon: monNam(ctx, mdef), more: '' });
    setMConfused(ctx, mdef.id, true);
  }
}

function adHalu(ctx: Ctx, magr: Entity, _atk: AttackDef, mdef: Entity, mhm: Mhm, env: AdEnv): void {
  if (!isU(ctx, magr) && mdef.id !== ctx.state.playerId) {
    if (!isCancelled(ctx, magr.id) && haseyes(ctx, mdef) && mcansee(ctx, mdef.id)) {
      if (env.vis && canSpotMon(ctx, mdef))
        say(ctx, 'adtyp.looks_confused', {
          mon: monNam(ctx, mdef),
          more: isMConfused(ctx, mdef.id) ? '@adtyp.more' : '',
        });
      setMConfused(ctx, mdef.id, true);
    }
  }
  mhm.damage = 0;
}

function adLegs(ctx: Ctx, magr: Entity, atk: AttackDef, mdef: Entity, mhm: Mhm, env: AdEnv): void {
  if (isU(ctx, magr)) {
    adPhys(ctx, magr, atk, mdef, mhm, env);
    return;
  }
  if (mdef.id !== ctx.state.playerId) {
    if (isCancelled(ctx, magr.id)) {
      mhm.damage = 0;
      return;
    }
    adPhys(ctx, magr, atk, mdef, mhm, env);
    return;
  }
  const side = ctx.rng.rn2(2) ? RIGHT_SIDE : LEFT_SIDE;
  const params = {
    mon: monNam(ctx, magr),
    side: `@adtyp.${side === RIGHT_SIDE ? 'right' : 'left'}`,
  };
  // This case is too obvious to ignore, but NetHack is not in general very good at considering
  // height--most short monsters still _can_ attack you when you're flying or mounted.
  if (uInAir(ctx) && !ctx.defs.monster(magr.def).flags.includes('fly')) {
    say(ctx, 'adtyp.tries_to_reach', params);
    mhm.damage = 0;
  } else if (isCancelled(ctx, magr.id)) {
    say(ctx, 'adtyp.nuzzles', params);
    mhm.damage = 0;
  } else {
    const uarmf = whichArmor(ctx, mdef.id, 'boots');
    if (uarmf) {
      if (ctx.rng.rn2(2) && (uarmf.def === 'nh:low_boots' || uarmf.def === 'nh:iron_shoes'))
        say(ctx, 'adtyp.pricks_exposed', params);
      else if (!ctx.rng.rn2(5)) say(ctx, 'adtyp.pricks_boot', params);
      else {
        say(ctx, 'adtyp.scratches_boot', params);
        mhm.damage = 0;
        return;
      }
    } else say(ctx, 'adtyp.pricks', params);
    setWoundedLegs(ctx, ctx.rng.rnd(60 - acurr(ctx, 'dex')), side);
    // exercise(A_STR, FALSE), exercise(A_DEX, FALSE): no exercise
  }
}

/**
 * The hero catches a terminal illness: "You feel deathly sick." (non-vomitable: no recovery
 * roll when it runs out). ref: src/mhitu.c diseasemu() (no Sick_resistance exists)
 */
export function diseasemu(ctx: Ctx, magr: Entity): boolean {
  const sick = hungerData(ctx).sick;
  const xtime = sick ? Math.trunc(sick.remaining / 3) + 1 : ctx.rng.rn2(acurr(ctx, 'con')) + 20; // rn1(ACURR(A_CON), 20)
  makeSick(ctx, xtime, `@${magr.def}`, true, SICK_NONVOMITABLE);
  return true;
}

function adDise(
  ctx: Ctx,
  magr: Entity,
  _atk: AttackDef,
  mdef: Entity,
  mhm: Mhm,
  _env: AdEnv,
): void {
  if (mdef.id === ctx.state.playerId) {
    if (!diseasemu(ctx, magr)) mhm.damage = 0;
    return;
  }
  // protected monsters use the same criteria as for a poly'd hero gaining sick resistance (no
  // artifacts or dragon scales guard against it here)
  const pd = ctx.defs.monster(mdef.def);
  if (pd.glyph.ch === 'F' || mdef.def === 'nh:ghoul') mhm.damage = 0;
  // else does ordinary damage
}

// ---------------------------------------------------------------------------------------------
// theft (steal.ts)

function adSgld(ctx: Ctx, magr: Entity, _atk: AttackDef, mdef: Entity, mhm: Mhm, env: AdEnv): void {
  if (isU(ctx, magr)) {
    const mongold = findgold(ctx, mdef.id);
    if (mongold) {
      const hero = ctx.state.playerId;
      const hasGold = findgold(ctx, hero) !== null; // merge_choice(): gold always merges
      if (hasGold || invCount(ctx, hero) < 52) {
        addToInventory(ctx, hero, mongold.id);
        say(ctx, 'uhitm.purse_heavier');
      } else {
        say(ctx, 'uhitm.grab_gold_no_room', { mon: monNam(ctx, mdef) });
        removeFromInventory(ctx, mongold.id);
        const hp = getPlayer(ctx.state).c.pos;
        if (hp) placeOnFloor(ctx, mongold.id, hp.level, hp.x, hp.y);
      }
    }
    // (exercise(A_DEX, TRUE): no exercise)
    mhm.damage = 0;
    return;
  }
  if (mdef.id === ctx.state.playerId) {
    // hitmsg() is the caller's; a leprechaun doesn't rob a leprechaun form
    const pd = heroForm(ctx);
    if (pd && pd.glyph.ch === ctx.defs.monster(magr.def).glyph.ch) return;
    if (!isCancelled(ctx, magr.id)) stealgold(ctx, magr);
    return;
  }
  mhm.damage = 0;
  if (isCancelled(ctx, magr.id)) return;
  // technically incorrect; no check for stealing gold from between mdef's feet...
  const gold = findgold(ctx, mdef.id);
  if (!gold) return;
  addToInventory(ctx, magr.id, gold.id); // obj_extract_self(), add_to_minv()
  // (no mstrategy)
  const name = monNam(ctx, magr);
  if (env.vis && canSpotMon(ctx, mdef))
    say(ctx, 'steal.steals_gold_from', { magr: name, mdef: monNam(ctx, mdef) });
  if (!teleRestrict(ctx, magr)) {
    const couldspot = canSpotMon(ctx, magr);
    mhm.hitflags = M_ATTK.AGR_DONE;
    rlocMon(ctx, magr, false);
    if (env.vis && couldspot && !canSpotMon(ctx, magr))
      say(ctx, 'adtyp.suddenly_disappears', { mon: name });
  }
}

/** ref: include/mondata.h locomotion() for "run": float, fly, slither, ooze, swim or run */
function locomotionRun(ctx: Ctx, mon: Entity): string {
  const f = ctx.defs.monster(mon.def).flags;
  return f.includes('float')
    ? 'float'
    : f.includes('fly')
      ? 'fly'
      : f.includes('slithy')
        ? 'slither'
        : f.includes('amorphous')
          ? 'ooze'
          : 'run';
}

function adSedu(ctx: Ctx, magr: Entity, atk: AttackDef, mdef: Entity, mhm: Mhm, env: AdEnv): void {
  if (isU(ctx, magr)) {
    env.uStealIt?.(ctx, mdef, atk);
    mhm.damage = 0;
    return;
  }
  const animal = isAnimal(ctx.defs.monster(magr.def));
  if (mdef.id === ctx.state.playerId) {
    const uform = heroForm(ctx);
    if (animal) {
      // hitmsg() is the caller's (hitmsgFor())
      if (isCancelled(ctx, magr.id)) return;
      // continue below
    } else if (uform?.attacks.some((a) => a.ad === 'sedu' || a.ad === 'ssex')) {
      // a nymph form: it brags or complains instead (never Deaf)
      say(ctx, minvent(ctx, magr.id).length > 0 ? 'uhitm.nymph_brags' : 'uhitm.nymph_remarks', {
        mon: monNam(ctx, magr),
      });
      if (!teleRestrict(ctx, magr)) rlocMon(ctx, magr, true);
      mhm.hitflags = M_ATTK.AGR_DONE; // return 3???
      mhm.done = true;
      return;
    } else if (isCancelled(ctx, magr.id)) {
      if (!hasProp(mdef, P.BLINDED))
        say(ctx, heroFemale(ctx.state) ? 'steal.plain_tries' : 'steal.plain_tries.male', {
          mon: monNam(ctx, magr),
        });
      if (ctx.rng.rn2(3)) {
        if (!teleRestrict(ctx, magr)) rlocMon(ctx, magr, true);
        mhm.hitflags = M_ATTK.AGR_DONE;
        mhm.done = true;
      }
      return;
    }
    const { stolen, result } = steal(ctx, magr);
    if (result === -1) {
      mhm.hitflags = M_ATTK.AGR_DIED;
      mhm.done = true;
      return;
    }
    if (result === 0) return;
    if (!animal && !teleRestrict(ctx, magr)) rlocMon(ctx, magr, true);
    if (animal && stolen && canseemon(ctx, magr))
      say(ctx, 'steal.tries_to_run_away', {
        mon: monNam(ctx, magr),
        how: { key: `steal.loco.${locomotionRun(ctx, magr)}` },
        item: stolen,
      });
    monflee(ctx, magr.id, 0, false, false);
    mhm.hitflags = M_ATTK.AGR_DONE;
    mhm.done = true;
    return;
  }
  if (isCancelled(ctx, magr.id)) return;
  // find an object to steal, non-cursed if magr is tame
  const tame = (magr.c.monster?.tame ?? 0) > 0;
  const obj = minvent(ctx, mdef.id).find((o) => !tame || o.c.item?.buc !== 'cursed');
  if (obj) {
    const mdefnam = monNam(ctx, mdef);
    // (no steeds or saddles)
    const wasWep = obj.c.item?.equipped === 'weapon';
    const onam = env.vis ? doname(ctx.state, ctx.defs, obj) : null;
    removeFromInventory(ctx, obj.id); // extract_from_minvent()
    addToInventory(ctx, magr.id, obj.id); // add_to_minv(): might merge
    const name = monNam(ctx, magr);
    if (env.vis && onam && canSpotMon(ctx, mdef))
      say(ctx, 'steal.steals_from', { magr: name, item: onam, mdef: mdefnam });
    if (wasWep) setMonFlag(ctx, 'nowep', mdef.id, false); // possibly_unwield()
    // (no mstrategy; mselftouch(): monsters never wield corpses here)
    if (isNymph(ctx.defs.monster(magr.def)) && !teleRestrict(ctx, magr)) {
      const couldspot = canSpotMon(ctx, magr);
      mhm.hitflags = M_ATTK.AGR_DONE;
      rlocMon(ctx, magr, false);
      if (env.vis && couldspot && !canSpotMon(ctx, magr))
        say(ctx, 'adtyp.suddenly_disappears', { mon: name });
    }
  }
  mhm.damage = 0;
}

/**
 * AD_SSEX acts as AD_SEDU (C's behaviour with SEDUCE=0) until monsters have genders and
 * doseduce() is ported: DECISIONS-PENDING "m9 taken defaults" 7, DEVIATIONS "Theft".
 * ref: src/uhitm.c mhitm_ad_ssex()
 */
const adSsex: Handler = (ctx, magr, atk, mdef, mhm, env) => adSedu(ctx, magr, atk, mdef, mhm, env);

/**
 * Digestion. Against the hero the engulfing attack does it (gulpmu()); a monster swallowed by
 * another is eaten whole: "Burrrrp!" (heard nearby), all its hit points as damage, a gas spore
 * explodes inside instead of leaving a corpse, and a pet is half fed by it.
 * ref: src/uhitm.c mhitm_ad_dgst() (no Riders; monsters' amulets of life saving are not worn)
 */
const adDgst: Handler = (ctx, magr, _atk, mdef, mhm) => {
  if (isU(ctx, magr) || mdef.id === ctx.state.playerId) {
    // uhitm: gulpum() digests it
    mhm.damage = 0;
    return;
  }
  const ap = magr.c.pos;
  // `flags.verbose && !Deaf`: verbalize("Burrrrp!")
  say(ctx, 'adtyp.burrrrp');
  if (ap) wakeNearto(ctx, ap.x, ap.y, 2 * 2); // Burrrrp!
  mhm.damage = mdef.c.hp?.cur ?? 0;
  // Is a corpse for nutrition possible?  It may kill magr
  const dp = mdef.c.pos;
  const pd = ctx.defs.monster(mdef.def);
  if (!dp || !corpseChanceSwallowed(ctx, pd, dp, magr.id) || !ent(ctx, magr.id)?.c.monster) return;
  // Pets get nutrition from swallowing monster whole; no nutrition from G_NOCORPSE monsters
  if ((magr.c.monster?.tame ?? 0) > 0 && !pd.genFlags.includes('nocorpse'))
    swallowedNutrition(ctx, magr, pd);
};

/**
 * A monster touched by a petrifying attack (or touching a cockatrice) turns to stone unless it
 * resists: "The jackal turns to stone!", a statue; the attacker may grow up from the kill. A
 * resisting defender takes no damage from AD_STON itself (1 from anything else).
 * ref: src/uhitm.c do_stone_mon() (no munstone(): monsters do not cure themselves; no golems'
 * mon_to_stone(): 7f; no monster life saving)
 */
function doStoneMon(ctx: Ctx, magr: Entity, atk: AttackDef, mdef: Entity, mhm: Mhm, env: AdEnv) {
  if (!resistsSton(ctx, mdef)) {
    if (env.vis && canSpotMon(ctx, mdef)) say(ctx, 'stone.mon_turns_x', { mon: monNam(ctx, mdef) });
    const tame = (mdef.c.monster?.tame ?? 0) > 0;
    const victimLevel = mdef.c.monster?.level ?? 0;
    monstone(ctx, mdef);
    if (tame && !env.vis) say(ctx, 'stone.peculiarly_sad');
    const grew = env.growUp ? env.growUp(ctx, magr.id, victimLevel) : true;
    mhm.hitflags = M_ATTK.DEF_DIED | (grew ? 0 : M_ATTK.AGR_DIED);
    mhm.done = true;
    return;
  }
  mhm.damage = atk.ad === 'ston' ? 0 : 1;
}

/**
 * A cockatrice's touch. Against the hero, 1 time in 3 it hisses ("You hear the cockatrice's
 * hissing!"; a cancelled one only coughs), and 1 time in 10 of those she starts turning to stone
 * (do_stone_u()); against a monster, it turns to stone unless cancelled or resistant.
 * ref: src/uhitm.c mhitm_ad_ston() (no moon phases: never a new moon; the hero is never deaf)
 */
const adSton: Handler = (ctx, magr, atk, mdef, mhm, env) => {
  if (isU(ctx, magr)) {
    // (munstone(): monsters do not cure themselves)
    minstapetrify(ctx, mdef, true);
    mhm.damage = 0;
    return;
  }
  if (mdef.id === ctx.state.playerId) {
    // (the hitmsg() is hitmu()'s)
    if (ctx.rng.rn2(3) !== 0) return;
    const name = monNam(ctx, magr);
    if (isCancelled(ctx, magr.id)) {
      say(ctx, 'stone.cough', { mon: name });
      return;
    }
    if (hasProp(mdef, P.HALLUC) && !hasProp(mdef, P.BLINDED)) {
      say(ctx, 'stone.hear_hissing');
      say(ctx, 'stone.blowing_kiss', { mon: name });
    } else say(ctx, 'stone.hissing', { mon: name });
    if (ctx.rng.rn2(10) === 0 && doStoneU(ctx, magr)) {
      mhm.hitflags = M_ATTK.HIT;
      mhm.done = true;
    }
    return;
  }
  // mhitm
  if (isCancelled(ctx, magr.id)) return;
  doStoneMon(ctx, magr, atk, mdef, mhm, env);
};

/**
 * Whether a monster resists level drain: undead, demons and were creatures.
 * ref: src/mondata.c resists_drli() (no Death, vampire shapeshifters or drain-resisting
 * artifacts; the hero's side is exper.ts resistsDrliHero())
 */
export function resistsDrli(ctx: Ctx, mon: Entity): boolean {
  const flags = ctx.defs.monster(mon.def).flags;
  return flags.includes('undead') || flags.includes('demon') || flags.includes('were');
}

/**
 * Level drain. Against the hero, 1 time in 3 unless magic cancellation stops it ("You avoid
 * harm."), she loses a level (losexp("life drainage")); a lycanthrope resists. Against a monster, 1 time in 3 unless
 * it resists or is protected: "The jackal becomes weaker!", 2d6 off its maximum hit points (never
 * below its level + 1) as the damage, and a level, or its life at level 0.
 * ref: src/uhitm.c mhitm_ad_drli() (no Death's touch, no Stormbringer)
 */
const adDrli: Handler = (ctx, magr, _atk, mdef, mhm, env) => {
  if (isU(ctx, magr)) {
    if (!ctx.rng.rn2(3) && !resistsDrli(ctx, mdef) && !uNegated(ctx, mdef, true)) {
      mhm.damage = ctx.rng.d(2, 6); // Stormbringer uses monhp_per_lvl (usually 1d8)
      say(ctx, 'adtyp.becomes_weaker', { mon: monNam(ctx, mdef) });
      const m = mdef.c.monster;
      const hp = mdef.c.hp;
      if (!m || !hp) return;
      if (hp.max - mhm.damage > m.level) hp.max -= mhm.damage;
      // limit floor of mhpmax reduction to current m_lev + 1; avoid increasing it if somehow
      // already less than that
      else if (hp.max > m.level) hp.max = m.level + 1;
      hp.cur -= mhm.damage;
      // !m_lev: level 0 monster is killed regardless of hit points rather than drop to level -1
      if (hp.cur < 1 || !m.level) {
        const pd = ctx.defs.monster(mdef.def);
        say(ctx, nonliving(pd) ? 'uhitm.expires' : 'uhitm.dies', { mon: monNam(ctx, mdef) });
        uXkilled(ctx, mdef);
      } else m.level--;
      mhm.damage = 0; // damage has already been inflicted
    }
    return;
  }
  if (mdef.id === ctx.state.playerId) {
    // (the hitmsg() is hitmu()'s)
    // `!Drain_resistance` (the shield of drain resistance), then losexp()'s resists_drli()
    if (
      !ctx.rng.rn2(3) &&
      !hasProp(getPlayer(ctx.state), P.DRAIN_RES) &&
      !resistsDrliHero(ctx) &&
      !mgcAtkNegated(ctx, magr, true)
    )
      losexp(ctx, '@killer.life_drainage');
    return;
  }
  if (
    !ctx.rng.rn2(3) &&
    !resistsDrli(ctx, mdef) &&
    !mgcAtkNegatedMon(ctx, magr, mdef, true, env.vis)
  ) {
    mhm.damage = ctx.rng.d(2, 6);
    if (env.vis && canSpotMon(ctx, mdef))
      say(ctx, 'adtyp.becomes_weaker', { mon: monNam(ctx, mdef) });
    const m = mdef.c.monster;
    const hp = mdef.c.hp;
    if (!m || !hp) return;
    if (hp.max - mhm.damage > m.level) hp.max -= mhm.damage;
    // limit floor of mhpmax reduction to current m_lev + 1
    else if (hp.max > m.level) hp.max = m.level + 1;
    if (m.level === 0)
      mhm.damage = hp.cur; // automatic kill if drained past level 0
    else m.level--;
  }
};

/**
 * A lycanthrope's bite. Against the hero, 1 time in 4 unless magic cancellation stops it, she
 * catches lycanthropy: "You feel feverish." (u.ulycn is the biter's form). Against a monster it
 * is a plain hit. ref: src/uhitm.c mhitm_ad_were() (no Protection_from_shape_changers, no
 * defending artifacts, no exercise(); retouch_equipment() is moot without silver items)
 */
const adWere: Handler = (ctx, magr, atk, mdef, mhm, env) => {
  if (isU(ctx, magr)) {
    adPhys(ctx, magr, atk, mdef, mhm, env);
    return;
  }
  if (mdef.id === ctx.state.playerId) {
    if (!ctx.rng.rn2(4) && ulycn(ctx.state) === null && !mgcAtkNegated(ctx, magr, true)) {
      say(ctx, 'were.feverish');
      setUlycn(ctx, magr.def as DefId);
    }
    return;
  }
  adPhys(ctx, magr, atk, mdef, mhm, env);
};

const GREEN_SLIME = 'nh:green_slime' as DefId;

/**
 * A green slime's touch. Against the hero, unless magic cancellation stops it ("You escape
 * harm."): a flaming form burns the slime away, Unchanging, a noncorporeal or green slime form is
 * unaffected, else "You don't feel very well." and she starts turning into a green slime (10
 * turns; "Yuck!" when she already is). Against a monster (and from a hero in green slime form),
 * 1 time in 4 when it is not slimeproof it turns into a green slime (newcham()).
 * ref: src/uhitm.c mhitm_ad_slim() (no munslime(): monsters do not burn the slime off)
 */
const adSlim: Handler = (ctx, magr, _atk, mdef, mhm, env) => {
  if (isU(ctx, magr)) {
    if (uNegated(ctx, mdef, false)) return; // physical damage only
    if (!ctx.rng.rn2(4) && !slimeproof(ctx.defs.monster(mdef.def))) {
      // this assumes newcham() won't fail; since hero has a slime attack, green slimes haven't
      // been geno'd
      say(ctx, 'slime.turn_into', { mon: monNam(ctx, mdef) });
      newcham(ctx, mdef, ctx.defs.monster(GREEN_SLIME));
      mhm.damage = 0;
    }
    return;
  }
  if (mdef.id === ctx.state.playerId) {
    // (the hitmsg() is hitmu()'s)
    if (mgcAtkNegated(ctx, magr, false)) {
      if (!isCancelled(ctx, magr.id)) say(ctx, 'mhitu.escape_harm');
      return;
    }
    const pd = heroForm(ctx);
    if (pd && flaming(pd)) {
      say(ctx, 'slime.burns_away');
      mhm.damage = 0;
    } else if (hasProp(mdef, P.UNCHANGING) || (pd && (noncorporeal(pd) || pd.id === GREEN_SLIME))) {
      say(ctx, 'slime.unaffected');
      mhm.damage = 0;
    } else if (!isSlimed(ctx.state)) {
      say(ctx, 'slime.dont_feel_well');
      makeSlimed(ctx, 10, null, `@${magr.def}`); // delayed_killer(SLIMED, KILLED_BY_AN, ...)
    } else say(ctx, 'slime.yuck');
    return;
  }
  // mhitm
  if (mgcAtkNegatedMon(ctx, magr, mdef, false, env.vis)) return; // physical damage only
  if (!ctx.rng.rn2(4) && !slimeproof(ctx.defs.monster(mdef.def))) {
    newcham(ctx, mdef, ctx.defs.monster(GREEN_SLIME), {
      msg: env.vis && canseemon(ctx, mdef),
    });
    // (no STRAT_WAITFORU)
    mhm.hitflags = M_ATTK.HIT;
    mhm.damage = 0;
  }
};

/** newcham() (newcham.ts sits above this module and registers it). */
type Newcham = (
  ctx: Ctx,
  mon: Entity,
  form: MonsterDef | null,
  flags?: { msg?: boolean },
) => boolean;
let newcham: Newcham = () => false;
export function setAdNewcham(fn: Newcham): void {
  newcham = fn;
}

/** mongone(): the monster leaves the game with everything it carries. ref: src/mon.c */
function mongone(ctx: Ctx, mon: Entity): void {
  for (const o of inventoryOf(ctx.state, mon.id)) ctx.remove(o.id);
  forgetMonster(ctx, mon.id);
  forgetMState(ctx, mon.id);
  ctx.remove(mon.id);
}

/**
 * A nurse's healing hands. Against an unarmed hero wearing no armor: "The nurse hits!  (I hope
 * you don't mind.)", up to 7 hit points back, 1 time in 7 a point more of maximum hit points
 * (her own: only below 5 per level plus 2d10 per level), sickness cured; then 1 time in 13 of
 * those the nurse is gone for good, else 1 time in 33 she teleports away and flees. A Healer
 * who isn't cooperating hears "Doc, I can't help you unless you cooperate." every fifth turn and
 * takes no damage; anyone else just gets hit, as by a cancelled nurse. Against a monster it is
 * a plain hit. ref: src/uhitm.c mhitm_ad_heal() (no exercise(): its rolls are kept)
 */
const adHeal: Handler = (ctx, magr, atk, mdef, mhm, env) => {
  if (isU(ctx, magr) || mdef.id !== ctx.state.playerId) {
    adPhys(ctx, magr, atk, mdef, mhm, env);
    return;
  }
  const hitmsg = (): void => say(ctx, 'combat.mon_hits', { mon: monNam(ctx, magr) });
  // a cancelled nurse is just an ordinary monster, nurses don't heal those that cause
  // petrification
  const form = heroForm(ctx);
  if (isCancelled(ctx, magr.id) || (form && touchPetrifies(form))) {
    hitmsg();
    return;
  }
  const hero = ctx.state.playerId;
  const uwep = whichArmor(ctx, hero, 'weapon');
  const od = uwep ? ctx.defs.object(uwep.def) : null;
  const armed = !!od && (od.class === 'weapon' || isWeptool(od));
  const armored = (['shirt', 'body', 'cloak', 'shield', 'gloves', 'boots', 'helm'] as const).some(
    (slot) => whichArmor(ctx, hero, slot) !== null,
  );
  if (!armed && !armored) {
    let goaway = false;
    say(ctx, 'nurse.hits', { mon: monNam(ctx, magr) });
    const hp = mdef.c.hp;
    if (hp) {
      hp.cur += ctx.rng.rnd(7);
      if (!ctx.rng.rn2(7)) {
        if (form)
          hp.max++; // no upper limit necessary; effect is temporary
        else {
          // hard upper limit via nurse care: 25 * ulevel
          const ulevel = mdef.c.experience?.level ?? 1;
          if (hp.max < 5 * ulevel + ctx.rng.d(2 * ulevel, 10)) hp.max++;
        }
        if (!ctx.rng.rn2(13)) goaway = true;
      }
      if (hp.cur > hp.max) hp.cur = hp.max;
    }
    ctx.rng.rn2(3); // exercise(A_STR, TRUE)
    ctx.rng.rn2(3); // exercise(A_CON, TRUE)
    if (hungerData(ctx).sick) makeSick(ctx, 0, '', false);
    if (goaway) {
      mongone(ctx, magr);
      mhm.done = true;
      mhm.hitflags = M_ATTK.DEF_DIED; // return 2???
      return;
    } else if (!ctx.rng.rn2(33)) {
      if (!teleRestrict(ctx, magr)) rlocMon(ctx, magr, true);
      monflee(ctx, magr.id, ctx.rng.d(3, 6), true, false);
      mhm.done = true;
      mhm.hitflags = M_ATTK.HIT | M_ATTK.DEF_DIED; // return 3???
      return;
    }
    mhm.damage = 0;
  } else if (getPlayer(ctx.state).c.player?.role === 'nh:healer') {
    // (the hero is never deaf)
    if (ctx.state.turn % 5 === 0) say(ctx, 'nurse.doc');
    mhm.damage = 0;
  } else hitmsg();
};

/** gs.skipdrin: a mind flayer's remaining tentacle attacks this turn are pointless. */
let skipdrin = false;
/** Resets gs.skipdrin at the start of an attack sequence (mattacku(), mattackm(), hmonas()). */
export const resetSkipdrin = (): void => {
  skipdrin = false;
};
/** Whether attack `atk` is one of the AT_TENT+AD_DRIN attacks to skip. */
export const skipsDrin = (atk: AttackDef): boolean =>
  skipdrin && atk.at === 'tentacle' && atk.ad === 'drin';

/** mdamageu() (mhitu.ts sits above this module and registers it). */
let mdamageuFn: ((ctx: Ctx, n: number, killer: string) => void) | null = null;
export function setAdMdamageu(fn: (ctx: Ctx, n: number, killer: string) => void): void {
  mdamageuFn = fn;
}

/**
 * The brain eating of a mind flayer's tentacles: "Your brain is eaten!" / "The jackal's brain
 * is eaten!" / "You eat the jackal's brain!", a noncorporeal one is unharmed, a mindless one
 * doesn't notice, Medusa's brain petrifies its eater; the hero eater is fed, a monster eater adds
 * d10 damage. A hero at minimum Intelligence dies of brainlessness (after life saving too).
 * Returns M_ATTK flags. ref: src/eat.c eat_brains() (no Riders, no cannibalism or conduct; no
 * AMAX: the hero eater's lost Intelligence is not recovered)
 */
function eatBrains(ctx: Ctx, magr: Entity, mdef: Entity, visflag: boolean, mhm: Mhm | null) {
  const pd = mdef.id === ctx.state.playerId ? heroForm(ctx) : ctx.defs.monster(mdef.def);
  const xtraDmg = ctx.rng.rnd(10);
  if (pd && noncorporeal(pd)) {
    if (visflag)
      say(
        ctx,
        mdef.id === ctx.state.playerId ? 'drin.brain_unharmed.u' : 'drin.brain_unharmed.mon',
        { mon: monNam(ctx, mdef) },
      );
    return M_ATTK.MISS; // side-effects can't occur
  } else if (isU(ctx, magr)) say(ctx, 'drin.u_eat_brain', { mon: monNam(ctx, mdef) });
  else if (mdef.id === ctx.state.playerId) say(ctx, 'drin.u_brain_eaten');
  else if (visflag && canSpotMon(ctx, mdef))
    say(ctx, 'drin.mon_brain_eaten', { mon: monNam(ctx, mdef) });

  if (pd && fleshPetrifies(pd)) {
    // the mind flayer has eaten the brains of a petrification inducing critter
    if (isU(ctx, magr)) {
      if (!hasProp(magr, P.STONE_RES) && !isStoned(ctx.state))
        makeStoned(ctx, 5, null, `@${pd.id}`);
    } else {
      if (visflag && canseemon(ctx, magr))
        say(ctx, 'stone.mon_turns_x', { mon: monNam(ctx, magr) });
      const tame = (magr.c.monster?.tame ?? 0) > 0;
      monstone(ctx, magr);
      // (no monster life saving)
      if (tame && !visflag) say(ctx, 'stone.sad_thought');
      return M_ATTK.AGR_DIED;
    }
  }

  let giveNutrit = false;
  if (isU(ctx, magr)) {
    if (pd?.flags.includes('mindless')) {
      say(ctx, 'drin.doesnt_notice', { mon: monNam(ctx, mdef) });
      return M_ATTK.MISS; // all done; no extra harm inflicted upon target
    }
    morehungry(ctx, -ctx.rng.rnd(30)); // cannot choke
    // (no AMAX: lost Intelligence is not recovered)
    if (mhm) mhm.damage += xtraDmg;
  } else if (mdef.id === ctx.state.playerId) {
    // no such thing as mindless players
    const a = mdef.c.attributes;
    if (a && a.int - abon(ctx.state, 'int') <= 3) {
      const killer = '@killer.brainlessness';
      if (hasProp(mdef, P.LIFESAVED)) {
        done(ctx, killer);
        if (ctx.state.gameOver) return M_ATTK.HIT;
        // amulet of life saving has now been used up
        say(ctx, 'drin.still_gone');
      } else say(ctx, 'drin.last_thought');
      done(ctx, killer);
      if (ctx.state.gameOver) return M_ATTK.HIT;
      // only when the hero chose not to die: arbitrarily boost intelligence
      a.int = 3 + 2 + abon(ctx.state, 'int');
      say(ctx, 'drin.scarecrow');
    }
    giveNutrit = true; // in case a conflicted pet is doing this
    // caller handles Int and memory loss
  } else {
    if (pd?.flags.includes('mindless')) {
      if (visflag && canSpotMon(ctx, mdef))
        say(ctx, 'drin.doesnt_notice', { mon: monNam(ctx, mdef) });
      return M_ATTK.MISS;
    }
    if (mhm) {
      mhm.damage += xtraDmg;
      if (mhm.damage >= (mdef.c.hp?.cur ?? 0) && visflag && canSpotMon(ctx, mdef))
        say(ctx, 'drin.last_thought_mon', { mon: monNam(ctx, mdef) });
    }
    giveNutrit = true;
  }
  if (giveNutrit && (magr.c.monster?.tame ?? 0) > 0) {
    const edog = edogOf(ctx, magr.id);
    if (edog) edog.hungrytime += ctx.rng.rnd(60);
    setMConfused(ctx, magr.id, false);
  }
  return M_ATTK.HIT;
}

/** "helm" for a hard helmet, else "hat". ref: src/objnam.c helm_simple_name() */
const helmName = (ctx: Ctx, obj: Entity): string =>
  hardHelmet(ctx.defs.object(obj.def)) ? '@polyarm.helm' : '@polyarm.hat';

/**
 * A mind flayer's tentacle. Against the hero: a headless form "doesn't seem harmed" (and the
 * flayer skips its other tentacles), a helmet blocks 7 times in 8, else she takes the damage,
 * her brain is eaten (eatBrains()), she loses 1-2 points of Intelligence, 1 time in 5 she
 * forgets spells (losespells()) and 1 time in 5 some of her skill training
 * (drainWeaponSkill()); each of those ends the flayer's tentacle attacks this turn. Against a
 * monster (and from a hero in mind flayer form), a headless one is unharmed, a worn helmet blocks
 * 7 times in 8, else its brain is eaten for d10 more damage.
 * ref: src/uhitm.c mhitm_ad_drin() (no long worm tails, no defending artifacts, no dunce cap,
 * no Half_physical_damage, no greased helmets: m_slips_free() never holds)
 */
const adDrin: Handler = (ctx, magr, _atk, mdef, mhm, env) => {
  if (isU(ctx, magr)) {
    const pd = ctx.defs.monster(mdef.def);
    if (!hasHead(pd)) {
      say(ctx, 'drin.mon_not_harmed', { mon: monNam(ctx, mdef) });
      // hero should skip remaining AT_TENT+AD_DRIN attacks
      skipdrin = true;
      mhm.damage = 0;
      if (!hasProp(magr, P.UNCHANGING) && pd.id === GREEN_SLIME && !isSlimed(ctx.state)) {
        say(ctx, 'slime.suck_in');
        makeSlimed(ctx, 10, null);
      }
      return;
    }
    const helmet = whichArmor(ctx, mdef.id, 'helm');
    if (helmet && ctx.rng.rn2(8)) {
      say(ctx, 'drin.mon_helmet_blocks_u', { mon: monNam(ctx, mdef), helm: helmName(ctx, helmet) });
      return;
    }
    const amu = whichArmor(ctx, mdef.id, 'amulet');
    const lifsav = amu?.def === 'nh:amulet_of_life_saving';
    eatBrains(ctx, magr, mdef, true, mhm);
    // skip further AD_DRIN if amulet of life-saving got used up
    if (lifsav && !whichArmor(ctx, mdef.id, 'amulet')) skipdrin = true;
    return;
  }
  if (mdef.id === ctx.state.playerId) {
    // (the hitmsg() is hitmu()'s)
    const pd = heroForm(ctx);
    if (pd && !hasHead(pd)) {
      say(ctx, 'drin.u_not_harmed');
      skipdrin = true; // attacker should skip remaining AT_TENT+AD_DRIN attacks
      return;
    }
    if (uSlipFree(ctx, magr, _atk)) return;
    const uarmh = whichArmor(ctx, mdef.id, 'helm');
    if (uarmh && ctx.rng.rn2(8)) {
      say(ctx, 'drin.u_helmet_blocks', { helm: helmName(ctx, uarmh) });
      return;
    }
    // negative armor class doesn't reduce this damage (no Half_physical_damage)
    mdamageuFn?.(ctx, mhm.damage, `@${magr.def}`);
    mhm.damage = 0; // don't inflict a second dose below
    if (ctx.state.gameOver) return;
    // (no dunce cap) u.umortality: an amulet of life saving used up means she died
    const oldmort = hasProp(mdef, P.LIFESAVED);
    const r = eatBrains(ctx, magr, mdef, true, null);
    if (ctx.state.gameOver) return;
    // skip further AD_DRIN if hero's number of deaths went up
    if (oldmort && !hasProp(mdef, P.LIFESAVED)) skipdrin = true;
    if (r === M_ATTK.MISS) return;
    adjattrib(ctx, 'int', -ctx.rng.rnd(2), false);
    if (!ctx.rng.rn2(5)) {
      losespells(ctx);
      skipdrin = true;
    }
    if (!ctx.rng.rn2(5)) {
      drainWeaponSkill(ctx, ctx.rng.rnd(2));
      skipdrin = true;
    }
    return;
  }
  // mhitm
  const pd = ctx.defs.monster(mdef.def);
  if (!hasHead(pd)) {
    if (env.vis && canSpotMon(ctx, mdef))
      say(ctx, 'drin.mon_not_harmed', { mon: monNam(ctx, mdef) });
    mhm.damage = 0;
    // don't bother with additional DRIN attacks since they wouldn't be able to hit target on
    // head either
    skipdrin = true;
    return;
  }
  if (whichArmor(ctx, mdef.id, 'helm') && ctx.rng.rn2(8)) {
    if (env.vis && canSpotMon(ctx, magr) && canseemon(ctx, mdef))
      say(ctx, 'drin.mon_helmet_blocks', { mon: monNam(ctx, mdef), agr: monNam(ctx, magr) });
    return;
  }
  const amu = whichArmor(ctx, mdef.id, 'amulet');
  const lifsav = amu?.def === 'nh:amulet_of_life_saving';
  mhm.hitflags = eatBrains(ctx, magr, mdef, env.vis, mhm);
  // skip further AD_DRIN if amulet of life-saving got used up
  if (lifsav && !whichArmor(ctx, mdef.id, 'amulet')) skipdrin = true;
};

type Handler = (ctx: Ctx, magr: Entity, atk: AttackDef, mdef: Entity, mhm: Mhm, env: AdEnv) => void;

const HANDLERS: Readonly<Record<string, Handler>> = {
  stun: adStun,
  legs: adLegs,
  phys: adPhys,
  fire: adFire,
  cold: adCold,
  elec: adElec,
  acid: adAcid,
  tlpt: adTlpt,
  blnd: adBlnd,
  curs: adCurs,
  rust: adErode('rust'),
  corr: adErode('corrode'),
  dcay: adErode('rot'),
  dren: adDren,
  drst: adDrst,
  drdx: adDrst,
  drco: adDrst,
  stck: adStck,
  plys: adPlys,
  slee: adSlee,
  ench: adEnch,
  slow: adSlow,
  conf: adConf,
  dise: adDise,
  halu: adHalu,
  wrap: adWrap,
  sgld: adSgld,
  sitm: adSedu, // "for now these are the same"
  sedu: adSedu,
  ssex: adSsex,
  dgst: adDgst,
  ston: adSton,
  drli: adDrli,
  were: adWere,
  slim: adSlim,
  heal: adHeal,
  drin: adDrin,
};

/**
 * The effect of the attack's damage type: updates `mhm` (the damage left to apply, or `done` with
 * the result flags). `magr` attacks `mdef` (either may be the hero, `ctx.state.playerId`; the
 * hero attacks only while polymorphed, from hmonas.ts damageum()). The hero may die inside (instadeath poison): check `ctx.state.gameOver`.
 * ref: src/uhitm.c mhitm_adtyping(). C's default (`damage = 0`) is for types this port does not
 * have; the types no step ported yet (sliming, AD_HEAL, AD_DRIN...) still do plain damage here.
 */
export function mhitmAdtyping(
  ctx: Ctx,
  magrId: EntityId,
  atk: AttackDef,
  mdefId: EntityId,
  mhm: Mhm,
  env: AdEnv = { vis: false, mwep: null },
): void {
  const magr = ent(ctx, magrId);
  const mdef = ent(ctx, mdefId);
  if (!magr || !mdef) return;
  const h = HANDLERS[atk.ad] ?? adPhys;
  h(ctx, magr, atk, mdef, mhm, env);
}
