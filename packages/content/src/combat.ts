// Melee combat: the hero attacking monsters and monsters attacking the hero.
import { isVampshifter, monHatesSilver } from './chamstate';
import { isPool } from './liquid';
import { isEel } from './mondata';
import { uinwater } from './uwater';
import { EGG } from './eggstate';
import { mAt, wormRec } from './wormstate';
import { isAxe } from './mdig';
import { hitWithEgg } from './egghit';
import { minstapetrify } from './stoning';
import { corpseName, petrifyingCorpse } from './stonetouch';
import { munstone, resistsSton } from './stonestate';
import {
  NORMAL_SPEED,
  getPlayer,
  isVisible,
  itemsAt,
  type AttackDef,
  type AttackType,
  type Ctx,
  type EntityId,
  type Entity,
  type ObjectDef,
  inventoryOf,
  type MonsterDef,
  type Pos,
  type Rng,
} from '@nh/core';
import { explmu, gazemu, gulpmu, mdamageu } from './mhitu';
import { isSwallowed, uswallow } from './engulfstate';
import {
  M_ATTK,
  failedGrab,
  hitmsgFor,
  mhitmAdtyping,
  newMhm,
  resetSkipdrin,
  skipsDrin,
} from './adtyping';
import { passiveum } from './passiveum';
import { touchPetrifies } from './stonestate';
import { castmu } from './mcastu';
import { monsterDied } from './mondeath';
import { isFleeing, monflee } from './monflee';
import { wakeup } from './peaceful';
import { passive, type PassiveTarget } from './uhitm_passive';
import { doname, xnameOf } from './objnam';
import { dryATowel, isWetTowel } from './glib';
import { hidesUnder, isUndetected, setUndetected } from './hidestate';
import { stopOccupation } from './eat';
import { experienceFor, gainExperience } from './hero';
import { gethungry } from './hunger';
import { MSIZE, weight } from './items';
import { heroSees, monWep, monWieldItem } from './mongear';
import { findAc, findMac, nearCapacity } from './stats';
import {
  P_BASIC,
  P_UNSKILLED,
  BARE_HANDED,
  martialBonus,
  skillLevel,
  useSkill as useSkillPoints,
  isBlade,
  isPole,
  weaponDamBonus,
  weaponHitBonus,
} from './skills';
import { monNam } from './perception';
import { hurtPet } from './dog';
import { adjalign, luckOf, uState } from './luck';
import { ustuck } from './hackmove';
import { canSpotMon, telepathSenses } from './perception';
import {
  isCancelled,
  isFrozen,
  isMConfused,
  isMStunned,
  mcansee,
  mspecUsed,
  setMConfused,
} from './mstate';
import { resist } from './buzz';
import { hcolor } from './hcolor';
import { setUspell, uspellOf } from './uenergy';
import { P, conflictOn, hasProp, ringBonus, wornIn } from './props';
import { roleIs } from './urole';
import { A_LAWFUL } from './aligntyp';
import { ROLES_TAB } from './roletab';
import { isMtrapped, mtrappedInPit, utrap } from './trapstate';
import {
  MZ_SMALL,
  amorphous,
  isBig,
  isDemon,
  isFlyer,
  isFloater,
  msize,
  noncorporeal,
  nonliving,
  hatesBlessings,
  nolimbs,
  slithy,
} from './mondata';
import { msummon } from './minion';
import { inHell } from './levelflags';
import {
  formHatesBlessings,
  formHatesSilver,
  heroHatesSilver,
  isSilver,
  silverRingBonus,
  silverSearsMon,
  silverSearsYou,
} from './silver';
import { adjLev } from './generation';
import { heroForm } from './upoly';
import { polydRace } from './race';
import { dmgval, dmgvalSized, shadeGlare } from './dmgval';
import { isShade, shadeAware, shadeMiss } from './shade';
import { angryGuards, isWatch } from './watch';
import { epriOf } from './epri';
import { ghodHitsu } from './priest';
import { cloneMon } from './clone';
import { canseemon, mintrap } from './trap';
import { summonWereMu } from './were';
import { isWere } from './werestate';
import { cantSeeSelf, heroInvisible, mapInvisible } from './invis';
import { invisTo } from './apparxy';
import { couldSeduce } from './steal';
import { digests, isWhirly } from './engulfstate';
import { uWipeEngr } from './engr';
import { swapWep } from './wield';
import { deaths } from './vanquished';
import { specAbon, specDbon } from './artifact';
import { artifactHitHook as artifactHit } from './artihook';
import { isArt, isQuestArtifact, uWieldArt } from './artistate';
import { XDIR, YDIR, xytodir } from './trapstate';
import { unmapInvisible } from './invis';
import { setU } from './luck';

export { isBig, nonliving, dmgval, dmgvalSized };

/** ref: include/attrib.h STR18 */
const STR18 = (x: number): number => 18 + x;

/** ref: src/weapon.c abon(): to-hit bonus from Str and Dex (never polymorphed). */
export function abon(str: number, dex: number, level: number): number {
  let sbon: number;
  if (str < 6) sbon = -2;
  else if (str < 8) sbon = -1;
  else if (str < 17) sbon = 0;
  else if (str < STR18(50)) sbon = 1;
  else if (str < STR18(100)) sbon = 2;
  else sbon = 3;
  // Game tuning kludge: make it a bit easier for a low level character to hit
  sbon += level < 3 ? 1 : 0;
  if (dex < 4) return sbon - 3;
  if (dex < 6) return sbon - 2;
  if (dex < 8) return sbon - 1;
  if (dex < 14) return sbon;
  return sbon + dex - 14;
}

/** ref: src/weapon.c dbon(): damage bonus from Str. */
export function dbon(str: number): number {
  if (str < 6) return -1;
  if (str < 16) return 0;
  if (str < 18) return 1;
  if (str === 18) return 2;
  if (str <= STR18(75)) return 3;
  if (str <= STR18(90)) return 4;
  if (str < STR18(100)) return 5;
  return 6;
}

/** ref: include/hack.h AC_VALUE(): a negative AC is randomized to -rnd(-AC). */
export function acValue(rng: Rng, ac: number): number {
  return ac >= 0 ? ac : -rng.rnd(-ac);
}

/** ref: src/weapon.c kebabable[]: S_XORN, S_DRAGON, S_JABBERWOCK, S_NAGA, S_GIANT (by glyph letter). */
const KEBABABLE = 'XDJNH';

/**
 * ref: src/weapon.c hitval(): enchantment (weapons only), the object's own to-hit bonus, the
 * spear bonus against kebabable monsters and, given `arti` (who is hit), an artifact's
 * spec_abon() (drawn). Not ported: blessed vs undead/demons, trident vs swimmers, picks vs xorns.
 * The hero's melee adds spec_abon() itself (find_roll_to_hit()).
 */
export function hitval(
  item: Entity,
  def: ObjectDef,
  mon: MonsterDef | null,
  arti?: { ctx: Ctx; target: EntityId },
): number {
  let tmp = 0;
  const w = def.weapon;
  if (w) tmp += item.c.item?.spe ?? 0;
  tmp += w?.hitBonus ?? 0;
  if (w?.skill === 'spear' && mon && KEBABABLE.includes(mon.glyph.ch)) tmp += 2;
  // Check specially named weapon "to hit" bonuses
  if (arti && item.c.item?.artifact !== undefined) tmp += specAbon(arti.ctx, item, arti.target);
  return tmp;
}

/**
 * A monster's attack `indx`, possibly substituted (getmattk()): the barrow wight's, Nazgul's and
 * erinys's weapon attack for non-physical damage does physical damage when the monster is
 * cancelled or its weapon is interesting enough (a cockatrice corpse, Stormbringer, Vorpal
 * Blade), unless its second attack is a physical weapon attack. The other substitutions are made
 * where their attacks are handled. ref: src/mhitu.c getmattk()
 */
export function getmattk(ctx: Ctx, magr: Entity, indx: number): AttackDef | undefined {
  const attks = ctx.defs.monster(magr.def).attacks;
  const attk = attks[indx];
  if (!attk || indx !== 0 || attk.at !== 'weapon' || attk.ad === 'phys') return attk;
  const second = attks[1];
  if (second?.at === 'weapon' && second.ad === 'phys') return attk;
  const weap = monWep(ctx, magr.id);
  const corpse = weap?.def === 'nh:corpse' ? weap.c.item?.corpseOf : undefined;
  if (
    isCancelled(ctx, magr.id) ||
    (corpse !== undefined &&
      ctx.defs.isMonster(corpse) &&
      touchPetrifies(ctx.defs.monster(corpse))) ||
    isArt(weap, 'nh:stormbringer') ||
    isArt(weap, 'nh:vorpal_blade')
  )
    return { ...attk, ad: 'phys' };
  return attk;
}

/** The hero's wielded object, its def and her level in its skill; null = bare hands. */
export interface HeroWeapon {
  item: Entity;
  def: ObjectDef;
  /** Skill level (see skills.ts) for the weapon's skill; unused for non-weapons. */
  skill: number;
}

export interface HeroCombatStats {
  str: number;
  dex: number;
  level: number;
  /** near_capacity(): 0..5 */
  encumbrance?: number;
  /** Level in bare-handed combat; defaults to Unskilled. */
  bareSkill?: number;
  /** Luck (u.uluck + u.moreluck); defaults to 0. */
  luck?: number;
  /** Rings of increase accuracy (u.uhitinc); defaults to 0. */
  hitinc?: number;
  /** abon() when it is not from Str and Dex (a polymorphed hero: see abonU()). */
  abon?: number;
  /** false: not a weapon or claw attack, so no hitval() and no weapon skill bonus (default true) */
  weaponBonus?: boolean;
  /** martial_bonus(): a Samurai's or Monk's bare-handed skill bonus is doubled (default false) */
  martial?: boolean;
}

/**
 * The hero's to-hit number: a hit needs `tmp > rnd(20)`.
 * ref: src/uhitm.c find_roll_to_hit(): Luck adds `sgn(Luck) * ((|Luck| + 2) / 3)`; +2 against a
 * stunned or sleeping target, +4 against one that can't move; rings add u.uhitinc. The caller
 * adds the +2 against a fleeing one and the -3 for a hero caught in a trap. `def.ac` should be the defender's find_mac(); pass `mac` to override
 * (monsters wearing armor). Encumbrance subtracts (2 * level - 1).
 */
export function heroToHit(
  hero: HeroCombatStats,
  def: MonsterDef,
  target: { asleep: boolean; stunned?: boolean; frozen?: boolean },
  weapon: HeroWeapon | null,
  mac: number = def.ac,
): number {
  const luck = hero.luck ?? 0;
  let tmp =
    1 +
    (hero.abon ?? abon(hero.str, hero.dex, hero.level)) +
    mac +
    (hero.hitinc ?? 0) +
    Math.sign(luck) * Math.trunc((Math.abs(luck) + 2) / 3) +
    hero.level;
  if (target.stunned) tmp += 2; // mstun
  if (target.asleep) tmp += 2; // msleeping
  if (target.frozen) tmp += 4; // !mcanmove
  const enc = hero.encumbrance ?? 0;
  if (enc !== 0) tmp -= enc * 2 - 1;
  if (hero.weaponBonus === false) return tmp;
  if (weapon) {
    tmp += hitval(weapon.item, weapon.def, def);
    tmp += weaponHitBonus(weapon.skill, weapon.def);
  } else tmp += weaponHitBonus(hero.bareSkill ?? P_UNSKILLED, null, hero.martial ?? false);
  return tmp;
}

/** ref: src/zap.c exclam() */
const exclam = (force: number): string => (force < 0 ? '?' : force <= 4 ? '.' : '!');

const monsterAt = (ctx: Ctx, pos: Pos, level: string): EntityId | null =>
  mAt(ctx.state, level, pos.x, pos.y)?.id ?? null;

/**
 * The monster entity at `pos` on `level`, if any (attacks do not need to see it); on a long
 * worm's tail square, the worm. ref: m_at()
 */
export const monsterIdAt = monsterAt;

let hmonasFn: ((ctx: Ctx, targetId: EntityId) => void) | null = null;

/** hmonas.ts hands down hmonas() (it sits above this module). */
export function setHmonas(fn: (ctx: Ctx, targetId: EntityId) => void): void {
  hmonasFn = fn;
}

type Cutworm = (
  ctx: Ctx,
  worm: EntityId,
  x: number,
  y: number,
  cuttier: boolean,
  monMoving?: boolean,
) => void;
let cutwormFn: Cutworm | null = null;
/** wormcut.ts hands down cutworm() (it sits above this module, over clone.ts). */
export function setCutworm(fn: Cutworm): void {
  cutwormFn = fn;
}

/**
 * A blow that hit a long worm with a worm number, landing on (x, y): maybe it cuts the tail
 * there. ref: src/worm.c cutworm() (callers check `mon->wormno`)
 */
export function cutwormAt(
  ctx: Ctx,
  worm: EntityId,
  at: Pos | undefined,
  cuttier: boolean,
  monMoving = false,
): void {
  if (!at || !wormRec(ctx.state, worm) || !ctx.state.entities[String(worm)]?.c.monster) return;
  if (!cutwormFn) throw new Error('cutworm: wormcut.ts is not loaded');
  cutwormFn(ctx, worm, at.x, at.y, cuttier, monMoving);
}

/** ref: include/obj.h is_blade() || is_axe(): a hit that may cut a worm well */
export const sliceOrChop = (def: ObjectDef | undefined): boolean =>
  !!def && (isBlade(def) || isAxe(def));

/**
 * ref: src/mondata.c noattacks(): a form whose only attacks are passive ones (AT_NONE; AT_BOOM,
 * the gas spore's death explosion, isn't an attack here)
 */
export const noattacks = (def: MonsterDef): boolean =>
  def.attacks.every((a) => a.at === 'passive' || a.at === 'boom');

/** The hero's wielded weapon (uwep), or null. */
export const uwepOf = (ctx: Ctx): Entity | null =>
  inventoryOf(ctx.state, ctx.state.playerId).find((o) => o.c.item?.equipped === 'weapon') ?? null;

/** The wielded weapon with its skill level, as the to-hit and damage code wants it. */
export function heroWeapon(ctx: Ctx, wielded: Entity | null): HeroWeapon | null {
  if (!wielded) return null;
  const def = ctx.defs.object(wielded.def);
  return { item: wielded, def, skill: skillLevel(ctx, def.weapon?.skill ?? '') };
}

/** The monster as passive() needs it after the blow (it may be dead and gone by then). */
export function passiveSnap(ctx: Ctx, targetId: EntityId): PassiveTarget | null {
  const target = ctx.state.entities[String(targetId)];
  const mon = target?.c.monster;
  if (!target || !mon || !target.c.pos) return null;
  return {
    id: targetId,
    def: ctx.defs.monster(target.def),
    level: mon.level,
    pos: { ...target.c.pos },
    mcan: isCancelled(ctx, targetId),
  };
}

/**
 * abon() for the hero: a polymorphed hero's to-hit bonus comes from her form's adjusted level,
 * not from Str and Dex. ref: src/weapon.c abon() (`if (Upolyd) return adj_lev(&mons[u.umonnum]) -
 * 3`; level_difficulty() is the depth)
 */
export function abonU(ctx: Ctx): number {
  const h = getPlayer(ctx.state);
  const level = h.c.experience?.level ?? 1;
  const form = heroForm(ctx);
  if (form) {
    const depth = h.c.pos ? (ctx.state.levels[h.c.pos.level]?.depth ?? 1) : 1;
    return adjLev(form, depth, level) - 3;
  }
  return abon(h.c.attributes?.str ?? 10, h.c.attributes?.dex ?? 10, level);
}

/** dbon() for the hero: no Str damage bonus while polymorphed. ref: src/weapon.c dbon() */
export function dbonU(ctx: Ctx): number {
  if (heroForm(ctx)) return 0;
  return dbon(getPlayer(ctx.state).c.attributes?.str ?? 10);
}

/**
 * It is unchivalrous for a Knight to attack the defenseless or from behind: a lawful Knight
 * hitting at a helpless (asleep or unable to move) or fleeing monster that is not undead says
 * "You caitiff!" and loses a point of alignment; a Samurai attacking a peaceful one "dishonorably
 * attack[s] the innocent!" (-1). Nothing once her alignment record is down to -10. A fleeing
 * monster's `mavenge` (it attacked her first) is not kept, so it never excuses her.
 * ref: src/uhitm.c check_caitiff()
 */
export function checkCaitiff(ctx: Ctx, mon: Entity): void {
  const u = uState(ctx.state);
  if (u.alignRecord <= -10) return;
  const m = mon.c.monster;
  if (!m) return;
  if (
    roleIs(ctx.state, 'knight') &&
    u.alignType === A_LAWFUL &&
    !ctx.defs.monster(mon.def).flags.includes('undead') &&
    (m.asleep || isFrozen(ctx, mon.id) || isFleeing(ctx, mon.id)) // helpless() || mflee
  ) {
    ctx.emit({ type: 'msg', key: 'uhitm.caitiff' });
    adjalign(ctx, -1);
  } else if (roleIs(ctx.state, 'samurai') && m.peaceful) {
    // attacking peaceful creatures is bad for the samurai's giri
    ctx.emit({ type: 'msg', key: 'uhitm.dishonorably_attack' });
    adjalign(ctx, -1);
  }
}

/**
 * C's `attk_count` and `role_roll_penalty` of find_roll_to_hit(): the attacks made so far in this
 * round (check_caitiff() comes only with the first) and the Monk's suit penalty of the last roll
 * (missum()'s "Your armor is rather cumbersome..." when the hit was lost to it).
 */
export interface RollState {
  attknum: number;
  armorpenalty: number;
}

/**
 * The hero's to-hit number against the monster for one attack of type `aatyp` (a hit needs
 * `tmp > rnd(20)`). A polymorphed hero uses her form's level for her own and abonU(); an elf
 * form gets +1 against orcs. hitval() and the weapon skill's to-hit bonus count only for a
 * weapon or claw attack (and the bare-handed skill for a weaponless one); a martial artist's kick
 * takes the bare-handed (martial arts) bonus too. The first attack of a round may be a Knight's or
 * Samurai's breach of conduct (checkCaitiff()). A Monk in her own form loses her role's
 * `spelarmr` while wearing body armor (kept in `roll.armorpenalty`), and gains `ulevel / 3 + 2`
 * fighting with neither weapon nor shield. An artifact adds its to-hit die against what it
 * applies to (specAbon(), hitval()'s spec_abon()).
 * ref: src/uhitm.c find_roll_to_hit(), src/weapon.c hitval()
 */
export function findRollToHit(
  ctx: Ctx,
  targetId: EntityId,
  aatyp: AttackType,
  weapon: HeroWeapon | null,
  roll: RollState = { attknum: 0, armorpenalty: 0 },
): number {
  roll.armorpenalty = 0; // default is `none'
  const hero = getPlayer(ctx.state);
  const target = ctx.state.entities[String(targetId)];
  const mon = target?.c.monster;
  if (!target || !mon) return 0;
  // some actions should occur only once during multiple attacks: knight's chivalry or samurai's
  // giri
  if (!roll.attknum++) checkCaitiff(ctx, target);
  const def = ctx.defs.monster(target.def);
  const form = heroForm(ctx);
  const attrs = hero.c.attributes;
  const martial = martialBonus(ctx.state);
  const stats: HeroCombatStats = {
    str: attrs?.str ?? 10,
    dex: attrs?.dex ?? 10,
    // maybe_polyd(youmonst.data->mlevel, u.ulevel)
    level: form ? form.level : (hero.c.experience?.level ?? 1),
    encumbrance: nearCapacity(ctx.state, ctx.defs, hero.id),
    bareSkill: skillLevel(ctx, BARE_HANDED),
    luck: luckOf(ctx.state),
    hitinc: ringBonus(ctx.state, 'nh:ring_of_increase_accuracy'),
    abon: abonU(ctx),
    weaponBonus: aatyp === 'weapon' || aatyp === 'claw',
    martial,
  };
  // role/race adjustments
  let roleAdj = 0;
  if (roleIs(ctx.state, 'monk') && !form) {
    if (wornIn(ctx.state, hero.id, 'body')) roleAdj -= roll.armorpenalty = ROLES_TAB.monk.spelarmr;
    else if (!uwepOf(ctx) && !wornIn(ctx.state, hero.id, 'shield'))
      roleAdj += Math.trunc((hero.c.experience?.level ?? 1) / 3) + 2;
  }
  // hitval(): `if (otmp->oartifact) tmp += spec_abon(otmp, mon)` (the only draw here)
  const artiAbon =
    stats.weaponBonus && weapon?.item.c.item?.artifact !== undefined
      ? specAbon(ctx, weapon.item, targetId)
      : 0;
  return (
    heroToHit(
      stats,
      def,
      { asleep: mon.asleep, stunned: isMStunned(ctx, targetId), frozen: isFrozen(ctx, targetId) },
      weapon,
      findMac(ctx.state, ctx.defs, targetId),
    ) +
    artiAbon +
    (isFleeing(ctx, targetId) ? 2 : 0) + // `if (mtmp->mflee) tmp += 2`
    roleAdj +
    // `is_orc(mtmp->data) && maybe_polyd(is_elf(youmonst.data), Race_if(PM_ELF))`
    (def.flags.includes('orc') && polydRace(ctx, 'elf') ? 1 : 0) -
    (utrap(ctx) ? 3 : 0) + // `if (u.utrap) tmp -= 3`
    // `else if (aatyp == AT_KICK && martial_bonus()) tmp += weapon_hit_bonus((struct obj *) 0)`
    (aatyp === 'kick' && martial ? weaponHitBonus(stats.bareSkill ?? P_UNSKILLED, null, true) : 0)
  );
}

/**
 * The hero missed: "You miss the jackal." (a nymph form "pretends to be friendly"), and the
 * monster wakes. `wouldHaveHit`: a Monk missed because of her suit's penalty ("Your armor is
 * rather cumbersome..." first). ref: src/uhitm.c missum()
 */
export function missum(
  ctx: Ctx,
  targetId: EntityId,
  atk: AttackDef | null,
  wouldHaveHit = false,
): void {
  const target = ctx.state.entities[String(targetId)];
  if (!target) return;
  // monk is missing due to penalty for wearing suit
  if (wouldHaveHit) ctx.emit({ type: 'msg', key: 'uhitm.armor_cumbersome' });
  const hero = getPlayer(ctx.state);
  const name = monNam(ctx, target);
  if (couldSeduce(ctx, hero, target, atk))
    ctx.emit({ type: 'msg', key: 'uhitm.pretend_friendly', params: { mon: name } });
  else ctx.emit({ type: 'msg', key: 'combat.you_miss', params: { mon: name } });
  wakeup(ctx, targetId);
}

/**
 * The hero attacks the monster entity `targetId`; returns the energy cost.
 * ref: src/hack.c domove() -> src/uhitm.c do_attack() -> hitum() (or, polymorphed, hmonas()).
 * A form with passive attacks only cannot attack ("You have no way to attack monsters
 * physically."). Not ported: knockback, two-weapon. (The peaceful confirmation is asked by the
 * callers, see peaceful.ts; `bloodthirst`: Stormbringer attacks a peaceful one unasked.)
 */
export function heroAttack(ctx: Ctx, targetId: EntityId, at?: Pos, bloodthirst = false): number {
  const hero = getPlayer(ctx.state);
  const target = ctx.state.entities[String(targetId)];
  if (!target?.c.monster) throw new Error(`Entity ${targetId} is not a monster`);
  // ref: do_attack(): `if (Upolyd && noattacks(youmonst.data))`: certain "pacifist" monsters
  // don't attack
  const form = heroForm(ctx);
  if (form && noattacks(form)) {
    ctx.emit({ type: 'msg', key: 'uhitm.no_way_to_attack' });
    return NORMAL_SPEED;
  }
  // ref: src/uhitm.c do_attack() -> src/hack.c overexertion(): combat increases metabolism, and
  // the hero may faint from it, which cancels the attack. (The HVY_ENCUMBER HP loss is not ported.)
  gethungry(ctx);
  if (hero.c.helpless || ctx.state.gameOver) return NORMAL_SPEED;
  // ref: do_attack(): "andrew@orca: prevent unlimited pick-axe attacks"
  uWipeEngr(ctx, 3);
  // Stormbringer overrode the peaceful confirmation (attack_checks()); known_hitum() says so
  if (bloodthirst) ctx.emit({ type: 'msg', key: 'arti.bloodthirsty' });
  if (form && hmonasFn) hmonasFn(ctx, targetId);
  else hitum(ctx, targetId, at);
  return NORMAL_SPEED;
}

type Mhurtle = (ctx: Ctx, mon: Entity, dx: number, dy: number, range: number) => void;
let mhurtleFn: Mhurtle | null = null;
/** mhurtle.ts hands down mhurtle() (it sits above this module). */
export function setMhurtle(fn: Mhurtle): void {
  mhurtleFn = fn;
}

/**
 * The verb of a monster staggering from a blow: "wobbles" for a floater, "flutters" for a small
 * flyer, "falters" for a slithy or limbless one, "trembles" for an amorphous one, "pulsates" for
 * one that cannot move, else "staggers". ref: src/mondata.c stagger()
 */
function staggerVerb(def: MonsterDef): string {
  if (isFloater(def)) return 'wobbles';
  if (isFlyer(def)) return msize(def) <= MZ_SMALL ? 'flutters' : 'staggers';
  if (slithy(def)) return 'falters';
  if (amorphous(def)) return 'trembles';
  if (!def.speed) return 'pulsates';
  if (nolimbs(def)) return 'falters';
  return 'staggers';
}

/**
 * The very small chance of an unarmed blow (no weapon, suit or shield) stunning the monster: when
 * `rnd(100)` is below her bare-handed skill, and it is neither big nor thick-skinned, "The jackal
 * staggers from your powerful strike!" and, if the blow of `dmg` will not kill it, it is hurtled
 * a square along `dir` (mhurtle(): stunned, and maybe into a trap). Returns 'killed' when that
 * killed it. ref: src/uhitm.c hmon_hitmon_stagger(), mhurtle_to_doom()
 */
function staggerBlow(
  ctx: Ctx,
  mon: Entity,
  dmg: number,
  dir: { x: number; y: number },
): 'none' | 'staggered' | 'killed' {
  const def = ctx.defs.monster(mon.def);
  if (!(
    ctx.rng.rnd(100) < skillLevel(ctx, BARE_HANDED) &&
    !isBig(def) &&
    !def.flags.includes('thick_hide')
  ))
    return 'none';
  if (canSpotMon(ctx, mon))
    ctx.emit({
      type: 'msg',
      key: 'uhitm.strike_stagger',
      params: { mon: monNam(ctx, mon), verb: { key: `uhitm.verb.${staggerVerb(def)}` } },
    });
  // only hurtle if pending physical damage isn't going to kill mon
  if (dmg < (mon.c.hp?.cur ?? 0)) {
    if (!mhurtleFn) throw new Error('mhurtle: mhurtle.ts is not loaded');
    mhurtleFn(ctx, mon, dir.x, dir.y, 1);
    if (!ctx.state.entities[String(mon.id)]?.c.monster) return 'killed';
  }
  return 'staggered';
}

/**
 * Whether a Rogue can stab the monster in the back: it is solid (not amorphous, whirly or
 * noncorporeal, no blob, eye or fungus), she sees it, and it flees or is helpless.
 * ref: src/uhitm.c backstabbable()
 */
export function backstabbable(ctx: Ctx, mon: Entity): boolean {
  const def = ctx.defs.monster(mon.def);
  return (
    !amorphous(def) &&
    !isWhirly(def) &&
    !noncorporeal(def) &&
    !'beF'.includes(def.glyph.ch) && // S_BLOB, S_EYE, S_FUNGUS
    canseemon(ctx, mon) &&
    (isFleeing(ctx, mon.id) || !!mon.c.monster?.asleep || isFrozen(ctx, mon.id))
  );
}

/**
 * A second bare-handed blow: fighting with neither weapon nor shield, Skilled in bare hands (or
 * martial arts) gives a 20% chance, Expert 40%, Master 60% and Grand Master 80%.
 * ref: src/uhitm.c double_punch()
 */
function doublePunch(ctx: Ctx): boolean {
  // note: P_BARE_HANDED_COMBAT and P_MARTIAL_ARTS are equivalent
  const sklLvl = skillLevel(ctx, BARE_HANDED);
  if (!uwepOf(ctx) && !wornIn(ctx.state, ctx.state.playerId, 'shield') && sklLvl > P_BASIC)
    return sklLvl - P_BASIC > ctx.rng.rn2(5);
  return false;
}

/**
 * The hero's weapon (or bare-handed) attack, then the monster's passive response; skilled
 * unarmed fighting may punch a second time (doublePunch()), unless the first blow killed the
 * monster or moved it, or left her helpless. The second blow's to-hit takes the alternate
 * weapon's hitval() and skill bonus, as C passes uswapwep (no two-weapon combat: the blow itself
 * is bare-handed), and only a hit gets a second passive response.
 * ref: src/uhitm.c hitum() -> known_hitum() -> hmon(), then passive()
 */
function hitum(ctx: Ctx, targetId: EntityId, at?: Pos): void {
  const snap = passiveSnap(ctx, targetId);
  const pos = at ?? ctx.state.entities[String(targetId)]?.c.pos;
  const uwep = uwepOf(ctx);
  // Cleaver attacks three spots, 'mon' and one on either side of 'mon' (no two-weapon combat)
  const form0 = heroForm(ctx);
  if (
    uWieldArt(ctx.state, 'nh:cleaver') &&
    !isSwallowed(ctx) &&
    ustuck(ctx) === null &&
    form0?.id !== 'nh:grid_bug' // !NODIAG(u.umonnum)
  ) {
    hitumCleave(ctx, targetId, at);
    return;
  }
  // 0: single hit, 1: first of two hits; affects strength bonus and silver rings
  const twohits = uwep ? 0 : doublePunch(ctx) ? 1 : 0;
  const weapon = heroWeapon(ctx, uwep);
  const roll: RollState = { attknum: 0, armorpenalty: 0 };
  let tmp = findRollToHit(ctx, targetId, 'weapon', weapon, roll);
  let dieroll = ctx.rng.rnd(20);
  // `mhit = (tmp > dieroll || u.uswallow)`: from inside, she always hits
  let mhit = tmp > dieroll || isSwallowed(ctx);
  const lifesaved = hasProp(getPlayer(ctx.state), P.LIFESAVED);
  const hit = { mhit };
  let malive = knownHitum(ctx, targetId, weapon, mhit, null, at, {
    wouldHaveHit: tmp + roll.armorpenalty > dieroll,
    twohits,
    dieroll,
    hit,
  });
  // ref: hitum(): passive(mon, uwep, mhit, malive, AT_WEAP, ...) (a Vorpal Blade hit known_hitum()
  // converted to a miss is one)
  if (snap) passive(ctx, snap, hit.mhit, malive, uwepOf(ctx), 'weapon');
  // second attack for skilled unarmed combat; won't occur if hero became paralyzed by passive
  // counter-attack, or if hero was killed by passive counter-attack and got life-saved, or if
  // monster was killed or knocked to different location
  const target = ctx.state.entities[String(targetId)];
  const hero = getPlayer(ctx.state);
  if (
    twohits &&
    !hero.c.helpless &&
    !ctx.state.gameOver &&
    !(lifesaved && !hasProp(hero, P.LIFESAVED)) && // u.umortality > oldumort
    malive &&
    target?.c.monster &&
    pos &&
    hero.c.pos &&
    mAt(ctx.state, hero.c.pos.level, pos.x, pos.y)?.id === targetId // m_at(x, y) == mon
  ) {
    const snap2 = passiveSnap(ctx, targetId);
    tmp = findRollToHit(ctx, targetId, 'weapon', heroWeapon(ctx, swapWep(ctx)), roll);
    dieroll = ctx.rng.rnd(20);
    mhit = tmp > dieroll || isSwallowed(ctx);
    malive = knownHitum(ctx, targetId, null, mhit, null, at, {
      wouldHaveHit: tmp + roll.armorpenalty > dieroll,
      twohits: 2, // second of 2 hits
      dieroll,
    });
    // second passive counter-attack only occurs if second attack hits
    if (mhit && snap2) passive(ctx, snap2, mhit, malive, null, 'weapon');
  }
}

/**
 * The end of a blow an artifact left at no damage: hmon() returns at once (only the priest's god
 * and the Watch react), and known_hitum() may still scare the monster and counts the blow as a
 * miss. ref: src/uhitm.c hmon(), known_hitum()
 */
function artiNoHit(
  ctx: Ctx,
  target: Entity,
  epri: ReturnType<typeof epriOf>,
  angerGuards: boolean,
  hit: { mhit: boolean } | undefined,
): boolean {
  if (epri && ctx.rng.rn2(2) === 0) ghodHitsu(ctx, epri);
  if (angerGuards) angryGuards(ctx, false);
  const hp = target.c.hp;
  if (hp && ctx.rng.rn2(25) === 0 && hp.cur < Math.trunc(hp.max / 2))
    monflee(ctx, target.id, ctx.rng.rn2(3) === 0 ? ctx.rng.rnd(100) : 0, false, true);
  // Vorpal Blade hit converted to miss
  if (hit) hit.mhit = false;
  return true;
}

/**
 * Cleaver hits the monster next to her and the monsters to the left and right of it: three
 * blows (each with its own to-hit roll and passive response), adjacent to the target, the target,
 * then adjacent on the other side, swung alternately clockwise and counter-clockwise from one
 * attack to the next (C's static `clockwise`, kept in `modData.nh.u.cleaveCw`). An empty spot
 * forgets a remembered unseen monster. It stops when the weapon is gone or she is helpless or
 * was killed and life-saved. ref: src/uhitm.c hitum_cleave()
 */
function hitumCleave(ctx: Ctx, targetId: EntityId, at?: Pos): void {
  const hero = getPlayer(ctx.state);
  const hp = hero.c.pos;
  const tp = at ?? ctx.state.entities[String(targetId)]?.c.pos;
  if (!hp || !tp) return;
  const level = ctx.state.levels[hp.level];
  // find the direction toward primary target
  let i = xytodir(tp.x - hp.x, tp.y - hp.y);
  if (i < 0 || !level) return; // "hitum_cleave: unknown target direction"
  const clockwise = uState(ctx.state).cleaveCw === true;
  // adjust direction by two so that loop's increment (for clockwise) or decrement (for
  // counter-clockwise) will point at the spot next to primary target
  i = clockwise ? (i + 6) % 8 : (i + 2) % 8; // DIR_LEFT2 : DIR_RIGHT2
  const lifesaved = hasProp(hero, P.LIFESAVED); // umort = u.umortality
  // Three attacks: adjacent to primary, primary, adjacent on other side. The first attack might
  // kill the primary target, so it isn't assumed to still be present on the second.
  for (let count = 3; count > 0; --count) {
    i = clockwise ? (i + 1) % 8 : (i + 7) % 8; // DIR_RIGHT : DIR_LEFT
    const tx = hp.x + (XDIR[i] ?? 0);
    const ty = hp.y + (YDIR[i] ?? 0);
    if (tx < 0 || ty < 0 || tx >= level.width || ty >= level.height) continue; // !isok()
    const mtmp = mAt(ctx.state, hp.level, tx, ty);
    if (!mtmp) {
      unmapInvisible(ctx, tx, ty); // only when an `I` is remembered there
      continue;
    }
    const snap = passiveSnap(ctx, mtmp.id);
    const roll: RollState = { attknum: 0, armorpenalty: 0 };
    const tmp = findRollToHit(ctx, mtmp.id, 'weapon', heroWeapon(ctx, uwepOf(ctx)), roll);
    const dieroll = ctx.rng.rnd(20);
    const hit = { mhit: tmp > dieroll };
    // (bhitpos is the spot hit: notonhead for a long worm's tail there)
    const malive = knownHitum(
      ctx,
      mtmp.id,
      heroWeapon(ctx, uwepOf(ctx)),
      hit.mhit,
      null,
      { x: tx, y: ty },
      { wouldHaveHit: tmp + roll.armorpenalty > dieroll, dieroll, hit },
    );
    if (snap) passive(ctx, snap, hit.mhit, malive, uwepOf(ctx), 'weapon', !uwepOf(ctx));
    // stop attacking if weapon is gone or hero got paralyzed or killed (and then life-saved) by
    // passive counter-attack
    const h = getPlayer(ctx.state);
    if (
      !uwepOf(ctx) ||
      h.c.helpless ||
      ctx.state.gameOver ||
      (lifesaved && !hasProp(h, P.LIFESAVED))
    )
      break;
  }
  // set up for next time
  setU(ctx, { cleaveCw: !clockwise }); // alternate
}

/**
 * The hero's weapon (or bare-handed) blow at the monster: a miss (missum()) or hmon(), then a
 * chance that the hurt monster flees. Returns whether the monster is still alive.
 * A blow that did damage to a long worm, landing on its tail (`at`, C's bhitpos), may cut it.
 * A martial artist's bare hands do rnd(4) (else rnd(2)) with her tripled skill damage bonus; a
 * Rogue's weapon stabs a fleeing or helpless monster in the back ("You strike the jackal from
 * behind!", +rnd(level)); an unarmed blow may stagger it (staggerBlow()). `opts.wouldHaveHit`:
 * a miss the Monk's suit caused; `opts.twohits`: C's gt.twohits (doublePunch()), for the silver
 * rings and the 3/4 Str bonus.
 * An artifact weapon's special hit (artifactHit()) comes after the base damage, the Healer's and
 * the Rogue's bonuses (Cleaver never stabs from behind) and before the Str and skill bonuses: it
 * may give the hit message, and a blow it leaves at no damage (Vorpal Blade missing a headless
 * monster wildly) does nothing more and counts as a miss (`opts.hit.mhit` false). `opts.dieroll`
 * is the d20 that hit (Magicbane, the beheading blades).
 * ref: src/uhitm.c known_hitum(), hmon(), hmon_hitmon(), hmon_hitmon_barehands(),
 * hmon_hitmon_weapon_melee() (no weapon shattering); a Healer's knife adds `min(3, died / 6)`
 * for the monster's kind
 */
export function knownHitum(
  ctx: Ctx,
  targetId: EntityId,
  weapon: HeroWeapon | null,
  mhit: boolean,
  uattk: AttackDef | null,
  at?: Pos,
  opts: {
    wouldHaveHit?: boolean;
    twohits?: number;
    dieroll?: number;
    hit?: { mhit: boolean };
  } = {},
): boolean {
  const target = ctx.state.entities[String(targetId)];
  const mon = target?.c.monster;
  if (!target || !mon) return false;
  if (!mhit) {
    missum(ctx, targetId, uattk, opts.wouldHaveHit ?? false);
    return true;
  }
  const twohits = opts.twohits ?? 0;
  const martial = martialBonus(ctx.state);
  const form = heroForm(ctx);
  const def = ctx.defs.monster(target.def);
  const name = monNam(ctx, target);
  const hero = getPlayer(ctx.state);
  const bareSkill = skillLevel(ctx, BARE_HANDED);

  // ref: src/uhitm.c hmon(): hitting a peaceful watchman or temple priest angers the whole Watch
  // afterwards, and hitting a priest (even a killing blow) brings his god's lightning 1 time in 2
  const epri = epriOf(ctx, targetId);
  const angerGuards = mon.peaceful && (isWatch(target.def) || epri !== null);

  // ref: src/uhitm.c hmon_hitmon(): the base damage, then (if above 0) the Str bonus (3/2 of
  // it for a two-handed melee weapon) and the weapon-skill bonus, and a minimum of 1.
  let dmg: number;
  let useSkill = false;
  let train = false;
  let strBonus = true;
  let hittxt = false;
  // hmon_hitmon_msg_silver(): a silver ring (barehand_silver_rings) or object (silverobj)
  let silverMsg = false;
  // a wet towel: "You lash", and it dries a little after the hit message
  let lash = false;
  let dryit = false;
  // ref: src/uhitm.c hmon_hitmon_*(): attacking a shade is normally useless
  const shade = isShade(def);
  if (!weapon) {
    // hmon_hitmon_barehands: rnd(2), rnd(4) for martial arts; nothing to a shade
    if (shade) dmg = 0;
    else {
      // note: 1..2 or 1..4 can be substantially increased by strength bonus or skill bonus,
      // usually both...
      dmg = ctx.rng.rnd(martial ? 4 : 2);
      useSkill = true;
      train = dmg > 1; // ref: hmon_hitmon_barehands(): train_weapon_skill = (dmg > 1)
    }
    // ref: special_dmgval(): no gloves, a silver ring against a silver-hater (one hand's ring
    // for each of two punches)
    const ring = silverRingBonus(ctx, target, twohits);
    dmg += ring;
    silverMsg = ring > 0;
  } else if (weapon.def.weapon) {
    const role = weapon.def.weapon.role;
    const silverHit = weapon.def.material === 'silver' && monHatesSilver(ctx, target);
    // ref: src/uhitm.c hmon_hitmon_weapon(): striking with a launcher, a missile or ammo in
    // hand, or a polearm or lance at short range (no steeds) is not a melee weapon blow
    if (role === 'launcher' || role === 'missile' || role === 'ammo' || isPole(weapon.def)) {
      // ref: hmon_hitmon_weapon_ranged(): 1-2 points, no skill used or trained; silver adds
      // `rnd(dmg ? 20 : 10)`; nothing to a shade unless silver (shade_glare())
      dmg = shade && !shadeGlare(weapon.def, weapon.item) ? 0 : ctx.rng.rnd(2);
      if (silverHit) dmg += ctx.rng.rnd(dmg ? 20 : 10);
    } else {
      const arti = weapon.item.c.item?.artifact !== undefined;
      dmg = dmgval(
        ctx.rng,
        weapon.item,
        weapon.def,
        def,
        isVampshifter(ctx, target),
        arti ? (t) => specDbon(ctx, weapon.item, targetId, t).bonus : undefined,
      ); // silver's rnd(20) included
      useSkill = true;
      train = dmg > 1; // ref: hmon_hitmon_weapon_melee(): a minimal hit doesn't exercise proficiency
      // Healer with anatomy knowledge
      if (
        roleIs(ctx.state, 'healer') &&
        weapon.def.class === 'weapon' &&
        weapon.def.weapon.skill === 'knife'
      )
        dmg += Math.min(3, Math.trunc(deaths(ctx.state, target.def) / 6));
      // special attack actions: a Rogue stabs a fleeing or helpless monster in the back (no
      // two-weapon combat); Cleaver can hit up to three targets at once so don't let it also
      // hit from behind
      if (!train || targetId === ustuck(ctx) || isArt(weapon.item, 'nh:cleaver')) {
        // no special bonuses
      } else if (roleIs(ctx.state, 'rogue') && backstabbable(ctx, target) && !form) {
        ctx.emit({ type: 'msg', key: 'uhitm.backstab', params: { mon: name } });
        dmg += ctx.rng.rnd(hero.c.experience?.level ?? 1);
        hittxt = true;
      }
      if (arti) {
        const d = { n: dmg };
        // (bhitpos: a blow at a long worm's tail is not on its head)
        const tpos = target.c.pos;
        const notonhead = !!at && !!tpos && (at.x !== tpos.x || at.y !== tpos.y);
        if (artifactHit(ctx, hero.id, targetId, weapon.item, d, opts.dieroll ?? 0, { notonhead })) {
          dmg = d.n;
          // artifact_hit updates 'tmp' but doesn't inflict any damage; however, it might cause
          // carried items to be destroyed and they might do so
          const t = ctx.state.entities[String(targetId)];
          if (!t?.c.monster || (t.c.hp?.cur ?? 0) < 1) return false; // artifact killed monster
          // perhaps artifact tried to behead a headless monster
          if (dmg === 0) return artiNoHit(ctx, target, epri, angerGuards, opts.hit);
          hittxt = true;
        } else dmg = d.n;
      }
    }
    silverMsg = silverHit;
  } else if (shade && !shadeAware(ctx, weapon.item)) {
    // ref: hmon_hitmon(): a non-weapon that cannot affect a shade does nothing to it
    dmg = 0;
  } else if (weapon.item.def === EGG) {
    // hmon_hitmon_misc_obj() EGG: nominal physical damage, no bonus, the message always given;
    // a cockatrice egg stones the monster and hmon() returns
    dmg = 1;
    strBonus = false;
    hittxt = true;
    if (hitWithEgg(ctx, target, weapon.item, false) === 'stoned')
      return ctx.state.entities[String(targetId)]?.c.monster !== undefined;
  } else if (weapon.item.def === 'nh:corpse') {
    // hmon_hitmon_misc_obj() CORPSE: a cockatrice corpse turns the monster to stone
    if (petrifyingCorpse(ctx, weapon.item)) {
      dmg = 1;
      hittxt = true;
      ctx.emit({
        type: 'msg',
        key: 'stone.hit_with',
        params: { mon: name, item: corpseName(weapon.item) },
      });
      if (!munstone(ctx, target, true)) minstapetrify(ctx, target, true);
      // note: hp may be <= 0 even if munstoned
      if (!resistsSton(ctx, target))
        return ctx.state.entities[String(targetId)]?.c.monster !== undefined;
    } else {
      const of = weapon.item.c.item?.corpseOf;
      dmg = (of && ctx.defs.isMonster(of) ? (MSIZE[ctx.defs.monster(of).size] ?? 0) : 0) + 1;
    }
  } else if (weapon.def.material === 'veggy' || weapon.def.material === 'paper') {
    // hmon_hitmon_misc_obj default: vegetables and paper do no damage
    dmg = 0;
    strBonus = false;
  } else {
    // non-weapons damage by weight, at most 6
    const owt = weight(ctx.defs, weapon.item);
    dmg = Math.trunc((owt + 99) / 100);
    dmg = dmg <= 1 ? 1 : ctx.rng.rnd(dmg);
    if (dmg > 6) dmg = 6;
    // wet towel has modest damage bonus beyond its weight, based on its wetness
    if (isWetTowel(weapon.item)) {
      const spe = weapon.item.c.item?.spe ?? 0;
      dmg += spe * (def.id === 'nh:iron_golem' ? 2 : 1);
      dmg = ctx.rng.rnd(dmg); // wet towel damage not capped at 6
      // usually lose some wetness but defer doing so until after hit message
      dryit = ctx.rng.rn2(spe + 1) > 0;
      lash = true;
    }
    // "things like silver wands can arrive here so we need another silver check"
    if (weapon.def.material === 'silver' && monHatesSilver(ctx, target)) {
      dmg += ctx.rng.rnd(20);
      silverMsg = true;
    }
  }
  if (dmg > 0) {
    if (strBonus) {
      // ref: hmon_hitmon_dmg_recalc(): `dmgbonus = u.udaminc` (rings of increase damage)
      dmg += ringBonus(ctx.state, 'nh:ring_of_increase_damage');
      // for dual attacks, 3/4 of the strength bonus is used; a two-handed weapon uses 3/2
      let sb = dbonU(ctx);
      if (twohits) sb = Math.trunc((3 * Math.abs(sb) + 2) / 4) * Math.sign(sb);
      else if (weapon?.def.weapon?.bimanual) {
        sb = Math.trunc((3 * Math.abs(sb) + 1) / 2) * Math.sign(sb);
      }
      dmg += sb;
    }
    if (useSkill) {
      // ref: hmon_hitmon_dmg_recalc(): a real hit trains the skill (use_skill(wtype, 1))
      if (train) useSkillPoints(ctx, weapon?.def.weapon?.skill ?? BARE_HANDED, 1);
      dmg += weaponDamBonus(weapon ? weapon.skill : bareSkill, weapon?.def ?? null, martial);
    }
    if (dmg < 1) dmg = 1;
  }
  if (dmg < 1) {
    // make sure that negative damage adjustment can't result in inadvertently boosting the
    // victim's hit points; a shade gets "harmlessly passes through" (every blow here is hand
    // to hand)
    dmg = strBonus && !shade ? 1 : 0;
    if (shade && !hittxt) hittxt = shadeMiss(ctx, hero, target, weapon?.item ?? null, false, true);
  }
  // ref: hmon_hitmon(): `hmd.unarmed && hmd.dmg > 1 && !thrown && !obj && !Upolyd`
  if (
    !weapon &&
    !form &&
    dmg > 1 &&
    !wornIn(ctx.state, hero.id, 'body') &&
    !wornIn(ctx.state, hero.id, 'shield')
  ) {
    const hp0 = hero.c.pos;
    const tp = at ?? target.c.pos;
    const dir = hp0 && tp ? { x: tp.x - hp0.x, y: tp.y - hp0.y } : { x: 0, y: 0 };
    const st = staggerBlow(ctx, target, dmg, dir);
    if (st !== 'none') hittxt = true;
    if (st === 'killed') return false; // already_killed
  }

  const hp = target.c.hp;
  // ref: src/uhitm.c hmon_hitmon_pet(): hitting a pet abuses it, and if it lives on it flees
  if (mon.tame && dmg > 0) {
    const destroyed = !hp || hp.cur - dmg < 1;
    hurtPet(ctx, targetId, destroyed ? 0 : 10 * ctx.rng.rnd(dmg), destroyed);
  }
  if (hp) {
    hp.cur -= dmg;
    // adjustments might have made tmp become less than what a level-draining artifact has
    // already done to max HP
    if (hp.cur > hp.max) hp.cur = hp.max;
  }
  if (!hp || hp.cur < 1) {
    // ref: src/uhitm.c hmon_hitmon(): the silver line comes before killed()'s
    if (silverMsg) silverSearsMon(ctx, target, weapon?.item ?? null);
    // ref: src/mon.c xkilled(): "You kill/destroy <mon>!" then experience()
    ctx.emit({
      type: 'msg',
      key: nonliving(def) ? 'combat.you_destroy' : 'combat.you_kill',
      params: { mon: name },
    });
    monsterDied(ctx, targetId, true);
    if (ctx.state.entities[String(targetId)]?.c.monster) return true; // life-saved
    gainExperience(ctx, hero.id, experienceFor(def, mon.level));
    if (epri && ctx.rng.rn2(2) === 0) ghodHitsu(ctx, epri);
    if (angerGuards) angryGuards(ctx, false);
    return false;
  }
  // ref: src/uhitm.c hmon_hitmon_splitmon(): a pudding that is "alive and healthy enough to
  // split", hit hand to hand with a wielded iron or metal object (not ammo or a missile), divides
  // (no two-weapon combat, no mon_moving: the hero is attacking)
  if (
    (def.id === 'nh:black_pudding' || def.id === 'nh:brown_pudding') &&
    hp.cur > 1 &&
    !isCancelled(ctx, targetId) &&
    weapon &&
    (weapon.def.material === 'iron' || weapon.def.material === 'metal') &&
    weapon.def.weapon?.role !== 'ammo' && // !is_ammo()
    weapon.def.weapon?.role !== 'missile' // !is_missile()
  ) {
    const mclone = cloneMon(ctx, targetId, false);
    if (mclone !== null) {
      ctx.emit({ type: 'msg', key: 'combat.divides', params: { mon: name } });
      hittxt = true;
      mintrap(ctx, mclone);
    }
  }
  // ref: src/uhitm.c hmon_hitmon_msg_hit(): "You hit <mon>" + exclam(dmg)
  if (!hittxt)
    ctx.emit({
      type: 'msg',
      key: `combat.you_${lash ? 'lash' : 'hit'}${exclam(dmg) === '!' ? '_hard' : ''}`,
      params: { mon: name },
    });
  // dryit implies wet towel, so the weapon is still intact
  if (dryit && weapon) dryATowel(ctx, weapon.item, -1, true);
  if (silverMsg) silverSearsMon(ctx, target, weapon?.item ?? null);
  // ref: src/uhitm.c hmon_hitmon(): `else if (u.umconf && hmd.hand_to_hand)` (every blow here
  // is hand-to-hand: thrown and fired objects hit through dothrow.ts)
  if (uspellOf(ctx.state).umconf) {
    nohandglow(ctx, target);
    if (!isMConfused(ctx, targetId) && !resist(ctx, target, 0, 'spell')) {
      setMConfused(ctx, targetId, true);
      if (
        !isMStunned(ctx, targetId) &&
        !mon.asleep &&
        !isFrozen(ctx, targetId) &&
        target.c.pos &&
        heroSees(ctx, target.c.pos)
      )
        ctx.emit({ type: 'msg', key: 'combat.appears_confused', params: { mon: name } });
    }
  }
  // ref: src/uhitm.c known_hitum(): a hit that left it below half its hit points sometimes scares
  // it (`!rn2(25) && mon->mhp < mon->mhpmax / 2`); hmon_hitmon_msg_hit()'s wakeup() comes first
  wakeup(ctx, targetId);
  if (epri && ctx.rng.rn2(2) === 0) ghodHitsu(ctx, epri);
  if (angerGuards) angryGuards(ctx, false);
  if (ctx.rng.rn2(25) === 0 && hp.cur < Math.trunc(hp.max / 2)) {
    // ref: src/uhitm.c known_hitum() (the hero's sticky hold is released inside monflee())
    monflee(ctx, targetId, ctx.rng.rn2(3) === 0 ? ctx.rng.rnd(100) : 0, false, true);
  }
  // ref: known_hitum(): a blow that did no damage counts as a miss; `if (mon->wormno && *mhit)
  // cutworm(mon, gb.bhitpos.x, gb.bhitpos.y, slice_or_chop)`
  if (dmg > 0) cutwormAt(ctx, targetId, at, sliceOrChop(weapon?.def));
  return true;
}

/**
 * Monster to-hit: `tmp > rnd(20 + i)` for attack index i.
 * ref: src/mhitu.c mattacku(): tmp = AC_VALUE(u.uac) + 10; tmp += m_lev; if (tmp <= 0) tmp = 1.
 * A monster that cannot see her (blind, or she is invisible to it) and a trapped one have -2.
 */
export function monsterToHit(
  rng: Rng,
  heroAc: number,
  monLevel: number,
  heroHelpless = false,
  monTrapped = false,
  unseen = false,
): number {
  let tmp = acValue(rng, heroAc) + 10;
  tmp += monLevel;
  if (heroHelpless) tmp += 4; // multi < 0
  if (unseen) tmp -= 2; // (Invis && !perceives(mdat)) || !mtmp->mcansee
  if (monTrapped) tmp -= 2; // mtmp->mtrapped
  if (tmp <= 0) tmp = 1;
  return tmp;
}

/**
 * "The dwarf swings its mattock." ref: src/mhitu.c mswings(), mswings_verb(): pierce-only
 * weapons thrust (dual-purpose ones would randomize), the rest swing. No gender, so "its".
 */
function mswings(ctx: Ctx, mon: Entity, weapon: Entity): void {
  const wdef = ctx.defs.object(weapon.def);
  const one = (weapon.c.item?.quantity ?? 1) > 1 ? '_one_of' : '';
  ctx.emit({
    type: 'msg',
    key: `mon.${wdef.weapon?.kind === 'pierce' ? 'thrusts' : 'swings'}${one}`,
    params: { mon: monNam(ctx, mon), weapon: xnameOf(ctx.state, ctx.defs, weapon) },
  });
}

/** ref: src/mhitu.c hitmsg(): the verb by attack type. */
function hitVerb(at: AttackType): string {
  switch (at) {
    case 'bite':
      return 'bites';
    case 'kick':
      return 'kicks';
    case 'sting':
      return 'stings';
    case 'butt':
      return 'butts';
    case 'touch':
      return 'touches';
    case 'explode':
    case 'boom':
      return 'explodes';
    default:
      return 'hits';
  }
}

const say0 = (ctx: Ctx, key: string, params?: Record<string, string>): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/**
 * The monster hit the hero with attack `i`: base damage d(damn, damd) (plus the wielded weapon's
 * dmgval() for a weapon attack), the hit message, the damage type's effect, then the damage after
 * her negative AC. Returns M_ATTK flags. `again`: the previous attack was of the same type and
 * hit (hitmsg's "again" wording).
 * An artifact weapon's special hit (artifactHit(), with `dieroll` the d20 that hit: C's
 * mhitu_dieroll) may replace the hit message; a hit it took all damage from (Vorpal Blade
 * missing a headless hero wildly) does nothing more.
 * ref: src/mhitu.c hitmu(), hitmsg(), mdamageu(); src/uhitm.c mhitm_ad_phys() "hand to hand
 * weapon" (silver included; no poisoned weapons or puddings)
 */
export function hitmu(
  ctx: Ctx,
  mon: Entity,
  atk: AttackDef,
  mwep: Entity | null,
  again: boolean,
  ac: number,
  dieroll = 0,
): number {
  unseenAttacker(ctx, mon); // ref: hitmu(): `if (!canspotmon(mtmp)) map_invisible(...)`
  revealHiddenAttacker(ctx, mon);
  const olduasmon = heroForm(ctx);
  const name = monNam(ctx, mon);
  let dmg = ctx.rng.d(atk.n, atk.d);
  // (no midnight(): undead get no extra damage)
  const weaponHit = atk.at === 'weapon' && mwep !== null && atk.ad === 'phys';
  let artiMsg = false;
  if (weaponHit) {
    // ref: src/uhitm.c mhitm_ad_phys() "hand to hand weapon": damage += dmgval(otmp, hero)
    const heroId = ctx.state.playerId;
    dmg += dmgvalSized(
      ctx.rng,
      mwep,
      ctx.defs.object(mwep.def),
      false,
      formHatesSilver(ctx),
      false,
      {
        blessHater: formHatesBlessings(ctx),
        hatesLight: heroForm(ctx)?.id === 'nh:gremlin',
        artiDbon: (t) => specDbon(ctx, mwep, heroId, t).bonus,
      },
    );
    if (wornIn(ctx.state, mon.id, 'gloves')?.def === 'nh:gauntlets_of_power')
      dmg += ctx.rng.rn2(4) + 3; // rn1(4, 3): 3..6
    if (dmg <= 0) dmg = 1;
    if (mwep.c.item?.artifact !== undefined) {
      const d = { n: dmg };
      artiMsg = artifactHit(ctx, mon.id, heroId, mwep, d, dieroll);
      dmg = d.n;
    }
  }
  // hitmsg(): given at the top of the damage type's mhitu branch, except for those that print
  // their own line (and a physical hug), and an artifact's hit that gave its own
  if (!artiMsg && hitmsgFor(atk, ctx.defs.monster(mon.def).flags.includes('animal')))
    ctx.emit({
      type: 'msg',
      key: `combat.mon_${hitVerb(atk.at)}${again ? '_again' : ''}`,
      params: { mon: name },
    });
  // ref: src/uhitm.c mhitm_ad_phys(): `if (!mhm->damage) return;`, then "The silver sears your
  // flesh!" after the hit message
  if (weaponHit && dmg && isSilver(ctx, mwep) && heroHatesSilver(ctx)) silverSearsYou(ctx);
  // ref: src/uhitm.c mhitm_adtyping(): the damage type's effect (resistances, sleep, poison, ...)
  const mhm = newMhm(dmg);
  mhitmAdtyping(ctx, mon.id, atk, ctx.state.playerId, mhm);
  if (mhm.done) return mhm.hitflags;
  dmg = mhm.damage;
  if (ctx.state.gameOver) {
    stopOccupation(ctx);
    return M_ATTK.HIT;
  }
  const hhp = getPlayer(ctx.state).c.hp;
  if (hhp && hhp.cur < 1) {
    // already dead? call rehumanize() or done_in_by() as appropriate
    mdamageu(ctx, 1, `@${mon.def}`);
    dmg = 0;
    if (ctx.state.gameOver) return M_ATTK.HIT;
  }
  // Negative armor class reduces damage done instead of fully protecting against hits.
  if (dmg > 0 && ac < 0) {
    dmg -= ctx.rng.rnd(-ac);
    if (dmg < 1) dmg = 1;
  }
  // Half_physical_damage, or the Mitre of Holiness (even if not currently blessed) against a
  // monster that hates blessings
  if (
    dmg > 0 &&
    (hasProp(getPlayer(ctx.state), P.HALF_PHDAM) ||
      (roleIs(ctx.state, 'priest') &&
        isQuestArtifact(ctx.state, wornIn(ctx.state, ctx.state.playerId, 'helm')) &&
        hatesBlessings(ctx.defs.monster(mon.def))))
  )
    dmg = Math.trunc((dmg + 1) / 2);
  if (dmg > 0) mdamageu(ctx, dmg, `@${mon.def}`); // ref: src/mhitu.c mdamageu() -> done_in_by()
  // ref: hitmu(): `if (mhm.damage) res = passiveum(olduasmon, mtmp, mattk)`: only a form she had
  // when the blow landed has a passive response
  let res: number = M_ATTK.HIT;
  if (dmg && olduasmon && !ctx.state.gameOver) res = passiveum(ctx, olduasmon, mon, atk);
  stopOccupation(ctx); // ref: stop_occupation() / nomul(0)
  return res;
}

/** C's foundyou: `u_at(mtmp->mux, mtmp->muy)`, the guess `ap` is her square. */
function foundYou(ctx: Ctx, ap: Pos | undefined): boolean {
  const hp = getPlayer(ctx.state).c.pos;
  return !ap || (!!hp && ap.x === hp.x && ap.y === hp.y);
}

/**
 * The monster `monId` makes all its attacks at the hero (it is next to where it thinks she is,
 * `ap`: C's mux/muy, by default her square), following mattacku()'s switch on the attack type
 * with the results `sum[]`.
 * ref: src/mhitu.c mattacku(), missmu(). A hug is automatic after the two attacks before it hit
 * (or while it holds her); gazes (gazemu()) and explosions (explmu()) need no to-hit roll.
 * An engulfer swallows her (gulpmu()); while she is inside, only it attacks, with its engulfing
 * attack alone. A monster that guessed wrong (she is invisible to it) misses wildly (wildmiss())
 * and makes no more physical attacks, gulps air, explodes at thin air or casts at it. A monster
 * at range is not handled here (mattackRanged() in mthrowu.ts, through monmove.ts).
 */
export function monsterAttack(ctx: Ctx, monId: EntityId, ap?: Pos): void {
  const hero = getPlayer(ctx.state);
  const mon = ctx.state.entities[String(monId)];
  const m = mon?.c.monster;
  const hp = hero.c.hp;
  if (!mon || !m || !hp) throw new Error(`Entity ${monId} cannot attack`);
  // ref: mattacku(): if swallowed, u.ustuck->mux = u.ux (it knows where she is)
  let found = foundYou(ctx, ap) || uswallow(ctx)?.mon === monId;
  let def = ctx.defs.monster(mon.def);
  let name = monNam(ctx, mon);
  // ref: src/mhitu.c mattacku(): if swallowed, she can only be affected by u.ustuck, and
  // stomachs can't hurt her while she prays
  const swallower = uswallow(ctx)?.mon ?? null;
  if (swallower !== null && (swallower !== monId || uState(ctx.state).uinvulnerable)) return;
  // when not cancelled, many demons can summon more demons and were creatures can summon
  // critters and change form (summonmu(); no shapechangers here); a change that made it flee
  // ends the attack
  if (!isCancelled(ctx, monId) && isDemon(def)) {
    // ref: src/mhitu.c summonmu(): not the balrog or the amorous demon; more often in Gehennom
    if (
      def.id !== 'nh:balrog' &&
      def.id !== 'nh:incubus' &&
      !ctx.rng.rn2(inHell(ctx.state) ? 10 : 16)
    )
      msummon(ctx, mon);
  } else if (!isCancelled(ctx, monId) && isWere(def)) {
    if (summonWereMu(ctx, mon, canseemon(ctx, mon), ap ?? hero.c.pos)) return;
    def = ctx.defs.monster(mon.def); // update cached value in case of were change
    name = monNam(ctx, mon);
  }
  // "in the midst of successful prayer" monsters won't attack
  if (uState(ctx.state).uinvulnerable) {
    if (ustuck(ctx) === monId) say0(ctx, 'pray.loosens_grip', { mon: name });
    else if (canSpotMon(ctx, mon)) say0(ctx, 'pray.pulls_back', { mon: name });
    else say0(ctx, 'pray.something_moves');
    return;
  }
  const ac = findAc(ctx.state, ctx.defs, hero.id);
  const tmp = monsterToHit(
    ctx.rng,
    ac,
    m.level,
    hero.c.helpless !== undefined,
    isMtrapped(ctx, monId),
    invisTo(ctx, mon) || !mcansee(ctx, monId),
  );

  const firstFound = found;
  const startPos = hero.c.pos ? { x: hero.c.pos.x, y: hero.c.pos.y } : null; // bhitpos
  let skipnonmagc = false;
  resetSkipdrin(); // [see mattackm(mhitm.c)]
  const sum: number[] = [];
  let prevHit = -1; // index of the previous attack if it hit (ref: hitmsg_prev)
  for (let i = 0; i < def.attacks.length; i++) {
    sum[i] = M_ATTK.MISS;
    // counterattack against attack [i-1] might have been fatal
    if (!ctx.state.entities[String(monId)]?.c.monster) return;
    if (i > 0) {
      // recalc in case a prior attack moved the hero (a quantum mechanic's teleport); the
      // monster makes no new guess
      found = foundYou(ctx, ap) || uswallow(ctx)?.mon === monId;
      // if hero was found but isn't anymore, avoid wildmiss now
      if (firstFound && !found) continue;
      const now = getPlayer(ctx.state).c.pos;
      if (!startPos || !now || now.x !== startPos.x || now.y !== startPos.y) continue;
    }
    const atk = getmattk(ctx, mon, i);
    if (!atk) continue;
    if (isSwallowed(ctx) && atk.at !== 'engulf') continue;
    if (skipnonmagc && atk.at !== 'magic') continue;
    if (skipsDrin(atk)) continue;
    switch (atk.at) {
      case 'claw': // "hand to hand" attacks
      case 'kick':
      case 'bite':
      case 'sting':
      case 'touch':
      case 'butt':
      case 'tentacle': {
        // ref: mattacku(): `if (mattk->aatyp == AT_KICK && mtrapped_in_pit(mtmp)) continue;`
        if (atk.at === 'kick' && mtrappedInPit(ctx, monId)) continue;
        // `!MON_WEP(mtmp) || mtmp->mconf || Conflict || !touch_petrifies(youmonst.data)`: a
        // monster with a weapon won't touch a cockatrice form bare-handed
        const uform = heroForm(ctx);
        if (
          uform &&
          touchPetrifies(uform) &&
          monWep(ctx, monId) &&
          !isMConfused(ctx, monId) &&
          !conflictOn(ctx.state)
        )
          break;
        if (!found) {
          wildmiss(ctx, mon, atk);
          skipnonmagc = true; // skip any remaining non-spell attacks
          break;
        }
        const j = ctx.rng.rnd(20 + i);
        if (tmp > j) {
          // an unsolid form slips out of a grab; a thick-skinned one shrugs off kicks
          if (uform?.flags.includes('unsolid') && failedGrab(ctx, mon, hero, atk, false)) continue;
          if (atk.at !== 'kick' || !uform?.flags.includes('thick_hide'))
            sum[i] = hitmu(
              ctx,
              mon,
              atk,
              null,
              prevHit === i - 1 && def.attacks[i - 1]?.at === atk.at,
              ac,
            );
        } else missmu(ctx, mon, name, tmp === j, atk);
        break;
      }
      case 'weapon': {
        // ref: src/mhitu.c mattacku() AT_WEAP: wield a weapon first if one is wanted (the move
        // is spent), then add the weapon's to-hit and announce the swing before rolling
        if (monWieldItem(ctx, monId)) break;
        if (!found) {
          wildmiss(ctx, mon, atk);
          skipnonmagc = true;
          break;
        }
        const mwep = monWep(ctx, monId);
        let attackTmp = tmp;
        if (mwep) {
          attackTmp += hitval(mwep, ctx.defs.object(mwep.def), null, {
            ctx,
            target: hero.id,
          });
          if (mon.c.pos && heroSees(ctx, mon.c.pos)) mswings(ctx, mon, mwep);
        }
        const j = ctx.rng.rnd(20 + i); // gm.mhitu_dieroll
        if (attackTmp > j)
          sum[i] = hitmu(
            ctx,
            mon,
            atk,
            mwep,
            prevHit === i - 1 && def.attacks[i - 1]?.at === atk.at,
            ac,
            j,
          );
        else missmu(ctx, mon, name, attackTmp === j, atk);
        break;
      }
      case 'magic':
        // ref: src/mhitu.c mattacku() AT_MAGC: next to where it thinks she is (range2 is false),
        // so castmu(mtmp, mattk, TRUE, foundyou) with no to-hit roll; buzzmu() is the ranged case
        castmu(ctx, monId, atk, true, found, ap);
        break;
      case 'hug':
        // automatic if prev two attacks succeed, or while it holds her (`!range2`: next to her);
        // it can't grab an unsolid form (failed_grab())
        if (
          ((i >= 2 && sum[i - 1] && sum[i - 2]) || ustuck(ctx) === monId) &&
          !failedGrab(ctx, mon, hero, atk, false)
        )
          sum[i] = hitmu(ctx, mon, atk, null, false, ac);
        break;
      case 'gaze':
        // can affect her either ranged or not (Medusa's gaze works through m_respond(): step 6)
        if (mon.def !== 'nh:medusa') sum[i] = gazemu(ctx, mon, atk);
        break;
      case 'explode':
        // automatic hit if next to, and aimed at her
        sum[i] = explmu(ctx, mon, atk, found);
        break;
      case 'engulf': {
        let j = 0;
        if (found) {
          if (isSwallowed(ctx) || (!mspecUsed(ctx, monId) && tmp > (j = ctx.rng.rnd(20 + i))))
            sum[i] = gulpmu(ctx, mon, atk);
          else missmu(ctx, mon, name, tmp === j, atk);
        } else if (digests(def)) say0(ctx, 'combat.gulps_air', { mon: name });
        else if (canseemon(ctx, mon)) say0(ctx, 'combat.lunges_recoils', { mon: name });
        else say0(ctx, isWhirly(def) ? 'combat.hear_rushing' : 'combat.hear_splat');
        break;
      }
      // AT_BREA, AT_SPIT (step 5, at range)
      default: // no attack
        break;
    }
    prevHit = sum[i] ? i : -1;
    if (ctx.state.gameOver) return;
    const r = sum[i] ?? M_ATTK.MISS;
    if (r & M_ATTK.AGR_DIED) return; // attacker dead
    if (r & M_ATTK.AGR_DONE) break; // attacker teleported, no more attacks
  }
}

/**
 * The monster attacks a spot where it thinks the hero is, but she is not there (she is invisible
 * to it): on a square she sees, a nymph "tries to touch you and misses!", others swing (snap,
 * kick, lunge) wildly and miss, attack a spot beside her or strike at thin air. No `I` is left
 * ("no way to tell where _this_ is coming from"). A monster that sees her but not where she is
 * (she is displaced) strikes at her displaced image. ref: src/mhitu.c wildmiss() (no Underwater;
 * flags.verbose is always on)
 */
function wildmiss(ctx: Ctx, mon: Entity, atk: AttackDef): void {
  const p = mon.c.pos;
  const level = p ? ctx.state.levels[p.level] : undefined;
  // no feedback if hero doesn't see the monster's spot
  if (!p || !level || p.level !== ctx.state.currentLevel) return;
  if (!isVisible(ctx.state, p.y * level.width + p.x)) return;
  const compat =
    atk.ad === 'sedu' || atk.ad === 'ssex' ? couldSeduce(ctx, mon, getPlayer(ctx.state), atk) : 0;
  const name = monNam(ctx, mon);
  if (!(!mcansee(ctx, mon.id) || invisTo(ctx, mon))) {
    // Displaced: it attacks her displaced image
    const inv = heroInvisible(ctx.state) ? '_inv' : '';
    if (compat)
      say0(ctx, `combat.displaced_smile_${compat === 2 ? 'engagingly' : 'seductively'}${inv}`, {
        mon: name,
      });
    else say0(ctx, `combat.displaced_strike${inv}`, { mon: name });
    return;
  }
  if (compat) {
    say0(ctx, 'combat.wild_touch', { mon: name });
    return;
  }
  const def = ctx.defs.monster(mon.def);
  const swings =
    atk.at === 'bite'
      ? 'snaps'
      : atk.at === 'kick'
        ? 'kicks'
        : atk.at === 'sting' || atk.at === 'butt' || def.flags.includes('nolimbs')
          ? 'lunges'
          : 'swings';
  switch (ctx.rng.rn2(3)) {
    case 0:
      say0(ctx, `combat.wild_${swings}`, { mon: name });
      break;
    case 1:
      say0(ctx, 'combat.wild_spot', { mon: name });
      break;
    default:
      say0(ctx, 'combat.wild_thin_air', { mon: name });
      break;
  }
}

/** A monster she can't spot attacks her: she remembers it as `I` where it is. */
/**
 * "If the monster is undetected & hits you, you should know where the attack came from": a
 * monster hiding under an object comes out, and unless she senses it by telepathy "The garter
 * snake was hidden under a dagger!" ("Something" when she still can't see it).
 * An eel in water she is not in "was hidden under the water!".
 * ref: src/mhitu.c hitmu() (no Detect_monsters; dknown is always set)
 */
function revealHiddenAttacker(ctx: Ctx, mon: Entity): void {
  const p = mon.c.pos;
  const mdef = ctx.defs.monster(mon.def);
  if (!p || !isUndetected(ctx, mon.id) || !(hidesUnder(mdef) || isEel(mdef))) return;
  setUndetected(ctx, mon.id, false);
  if (telepathSenses(ctx.state, ctx.defs, mon)) return;
  const obj = itemsAt(ctx.defs, ctx.state, p.level, p.x, p.y)[0];
  if (!obj) return;
  const lv = ctx.state.levels[p.level];
  // "the water" for an object under the water she is not in (no Underwater view)
  const water = !!lv && isPool(ctx, lv, p.x, p.y) && !uinwater(ctx);
  const item = water ? '' : doname(ctx.state, ctx.defs, obj);
  const suffix = water ? '_water' : '';
  if (canSpotMon(ctx, mon))
    ctx.emit({
      type: 'msg',
      key: `hide.was_hidden_under${suffix}`,
      params: { mon: monNam(ctx, mon), item },
    });
  else ctx.emit({ type: 'msg', key: `hide.something_was_hidden_under${suffix}`, params: { item } });
}

function unseenAttacker(ctx: Ctx, mon: Entity): void {
  const p = mon.c.pos;
  if (p && p.level === ctx.state.currentLevel && !canSpotMon(ctx, mon)) mapInvisible(ctx, p.x, p.y);
}

/**
 * ref: src/mhitu.c missmu(): "just misses" when the roll equals tmp exactly (verbose), "pretends
 * to be friendly" for a seducer (could_seduce(), not cancelled); an attacker she can't spot is
 * remembered as `I`
 */
function missmu(ctx: Ctx, mon: Entity, name: string, nearmiss: boolean, atk: AttackDef): void {
  unseenAttacker(ctx, mon);
  const friendly =
    couldSeduce(ctx, mon, getPlayer(ctx.state), atk) !== 0 && !isCancelled(ctx, mon.id);
  ctx.emit({
    type: 'msg',
    key: friendly
      ? 'combat.mon_pretends_friendly'
      : nearmiss
        ? 'combat.mon_just_misses'
        : 'combat.mon_misses',
    params: { mon: name },
  });
}

/**
 * A charge of the confuse monster glow is used on a monster that is not confused yet: "Your
 * hands stop glowing red." with the last one. ref: src/uhitm.c nohandglow()
 */
function nohandglow(ctx: Ctx, mon: Entity): void {
  const { umconf } = uspellOf(ctx.state);
  if (!umconf || isMConfused(ctx, mon.id)) return;
  const altfeedback = hasProp(getPlayer(ctx.state), P.BLINDED) || cantSeeSelf(ctx.state); // Blind || Invisible
  if (umconf === 1) {
    if (altfeedback) ctx.emit({ type: 'msg', key: 'combat.hands_stop_tingling' });
    else
      ctx.emit({
        type: 'msg',
        key: 'combat.hands_stop_glowing',
        params: { color: hcolor(ctx, 'red') },
      });
  } else if (altfeedback) ctx.emit({ type: 'msg', key: 'combat.tingling_lessens' });
  else
    ctx.emit({
      type: 'msg',
      key: 'combat.glow_less_bright',
      params: { color: hcolor(ctx, 'red') },
    });
  setUspell(ctx, { umconf: umconf - 1 });
}
