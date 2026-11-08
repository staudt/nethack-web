// Melee combat: the hero attacking monsters and monsters attacking the hero.
import {
  NORMAL_SPEED,
  getPlayer,
  sortedIds,
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
import { explmu, gazemu, mdamageu } from './mhitu';
import { M_ATTK, hitmsgFor, mhitmAdtyping, newMhm } from './adtyping';
import { castmu } from './mcastu';
import { monsterDied } from './mondeath';
import { isFleeing, monflee } from './monflee';
import { wakeup } from './peaceful';
import { passive, type PassiveTarget } from './uhitm_passive';
import { xnameOf } from './objnam';
import { stopOccupation } from './eat';
import { experienceFor, gainExperience } from './hero';
import { gethungry } from './hunger';
import { weight } from './items';
import { heroSees, monWep, monWieldItem } from './mongear';
import { findAc, findMac, nearCapacity } from './stats';
import {
  P_UNSKILLED,
  BARE_HANDED,
  skillLevel,
  useSkill as useSkillPoints,
  weaponDamBonus,
  weaponHitBonus,
} from './skills';
import { monNam } from './perception';
import { hurtPet } from './dog';
import { luckOf, uState } from './luck';
import { ustuck } from './hackmove';
import { canSpotMon } from './perception';
import { isCancelled, isFrozen, isMConfused, isMStunned, setMConfused } from './mstate';
import { resist } from './buzz';
import { hcolor } from './hcolor';
import { setUspell, uspellOf } from './uenergy';
import { P, hasProp, ringBonus } from './props';
import { isMtrapped, mtrappedInPit, utrap } from './trapstate';
import { isBig, nonliving } from './mondata';
import { dmgval, dmgvalSized } from './dmgval';
import { angryGuards, isWatch } from './watch';
import { epriOf } from './epri';
import { ghodHitsu } from './priest';

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
 * ref: src/weapon.c hitval(): enchantment (weapons only), the object's own to-hit bonus and the
 * spear bonus against kebabable monsters. Not ported: blessed vs undead/demons, trident vs
 * swimmers, picks vs xorns, artifacts.
 */
export function hitval(item: Entity, def: ObjectDef, mon: MonsterDef | null): number {
  let tmp = 0;
  const w = def.weapon;
  if (w) tmp += item.c.item?.spe ?? 0;
  tmp += w?.hitBonus ?? 0;
  if (w?.skill === 'spear' && mon && KEBABABLE.includes(mon.glyph.ch)) tmp += 2;
  return tmp;
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
    abon(hero.str, hero.dex, hero.level) +
    mac +
    (hero.hitinc ?? 0) +
    Math.sign(luck) * Math.trunc((Math.abs(luck) + 2) / 3) +
    hero.level;
  if (target.stunned) tmp += 2; // mstun
  if (target.asleep) tmp += 2; // msleeping
  if (target.frozen) tmp += 4; // !mcanmove
  const enc = hero.encumbrance ?? 0;
  if (enc !== 0) tmp -= enc * 2 - 1;
  if (weapon) {
    tmp += hitval(weapon.item, weapon.def, def);
    tmp += weaponHitBonus(weapon.skill, weapon.def);
  } else tmp += weaponHitBonus(hero.bareSkill ?? P_UNSKILLED, null);
  return tmp;
}

/** ref: src/zap.c exclam() */
const exclam = (force: number): string => (force < 0 ? '?' : force <= 4 ? '.' : '!');

const monsterAt = (ctx: Ctx, pos: Pos, level: string): EntityId | null => {
  for (const id of sortedIds(ctx.state)) {
    const e = ctx.state.entities[String(id)];
    const p = e?.c.pos;
    if (e?.c.monster && p && p.level === level && p.x === pos.x && p.y === pos.y) return id;
  }
  return null;
};

/** The monster entity at `pos` on `level`, if any (attacks do not need to see it). */
export const monsterIdAt = monsterAt;

/**
 * The hero attacks the monster entity `targetId`; returns the energy cost.
 * ref: src/hack.c domove() -> src/uhitm.c do_attack() -> hitum() -> known_hitum() -> hmon().
 * The monster's passive attack answers each blow (ref: hitum() -> passive()). Not ported:
 * knockback, two-weapon. (The peaceful confirmation is asked by the callers, see
 * peaceful.ts.)
 */
export function heroAttack(ctx: Ctx, targetId: EntityId): number {
  const hero = getPlayer(ctx.state);
  const target = ctx.state.entities[String(targetId)];
  const mon = target?.c.monster;
  if (!target || !mon) throw new Error(`Entity ${targetId} is not a monster`);
  const def = ctx.defs.monster(target.def);
  const name = monNam(ctx, target);
  const snap: PassiveTarget | null = target.c.pos
    ? {
        id: targetId,
        def,
        level: mon.level,
        pos: { ...target.c.pos },
        mcan: isCancelled(ctx, targetId),
      }
    : null;
  /** ref: src/uhitm.c hitum(): passive(mon, uwep, mhit, malive, AT_WEAP, ...) */
  const answer = (mhit: boolean, malive: boolean): number => {
    const uwep = inventoryOf(ctx.state, hero.id).find((o) => o.c.item?.equipped === 'weapon');
    if (snap) passive(ctx, snap, mhit, malive, uwep ?? null, 'weapon');
    return NORMAL_SPEED;
  };
  const attrs = hero.c.attributes;
  const wielded = inventoryOf(ctx.state, hero.id).find((o) => o.c.item?.equipped === 'weapon');
  const wdef = wielded ? ctx.defs.object(wielded.def) : null;
  const weapon: HeroWeapon | null =
    wielded && wdef
      ? { item: wielded, def: wdef, skill: skillLevel(ctx, wdef.weapon?.skill ?? '') }
      : null;
  // ref: src/uhitm.c do_attack() -> src/hack.c overexertion(): combat increases metabolism, and
  // the hero may faint from it, which cancels the attack. (The HVY_ENCUMBER HP loss is not ported.)
  gethungry(ctx);
  if (hero.c.helpless || ctx.state.gameOver) return NORMAL_SPEED;
  const stats: HeroCombatStats = {
    str: attrs?.str ?? 10,
    dex: attrs?.dex ?? 10,
    level: hero.c.experience?.level ?? 1,
    encumbrance: nearCapacity(ctx.state, ctx.defs, hero.id),
    bareSkill: skillLevel(ctx, BARE_HANDED),
    luck: luckOf(ctx.state),
    hitinc: ringBonus(ctx.state, 'nh:ring_of_increase_accuracy'),
  };

  // ref: src/uhitm.c hitum()
  // ref: src/uhitm.c find_roll_to_hit(): +2 against a fleeing monster
  const tmp =
    heroToHit(
      stats,
      def,
      { asleep: mon.asleep, stunned: isMStunned(ctx, targetId), frozen: isFrozen(ctx, targetId) },
      weapon,
      findMac(ctx.state, ctx.defs, targetId),
    ) +
    (isFleeing(ctx, targetId) ? 2 : 0) -
    (utrap(ctx) ? 3 : 0); // ref: find_roll_to_hit(): `if (u.utrap) tmp -= 3`
  const dieroll = ctx.rng.rnd(20);
  if (!(tmp > dieroll)) {
    // ref: src/uhitm.c missum(): "You miss <mon>." then wakeup(mdef, TRUE)
    ctx.emit({ type: 'msg', key: 'combat.you_miss', params: { mon: name } });
    wakeup(ctx, targetId);
    return answer(false, true);
  }

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
  if (!weapon) {
    // hmon_hitmon_barehands: rnd(2) (rnd(4) for martial arts, which we lack)
    dmg = ctx.rng.rnd(2);
    useSkill = true;
    train = dmg > 1; // ref: hmon_hitmon_barehands(): train_weapon_skill = (dmg > 1)
  } else if (weapon.def.weapon) {
    dmg = dmgval(ctx.rng, weapon.item, weapon.def, def);
    useSkill = true;
    train = dmg > 1; // ref: hmon_hitmon_weapon_melee(): a minimal hit doesn't exercise proficiency
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
  }
  if (dmg > 0) {
    if (strBonus) {
      // ref: hmon_hitmon_dmg_recalc(): `dmgbonus = u.udaminc` (rings of increase damage)
      dmg += ringBonus(ctx.state, 'nh:ring_of_increase_damage');
      let sb = dbon(stats.str);
      if (weapon?.def.weapon?.bimanual) {
        sb = Math.trunc((3 * Math.abs(sb) + 1) / 2) * Math.sign(sb);
      }
      dmg += sb;
    }
    if (useSkill) {
      // ref: hmon_hitmon_dmg_recalc(): a real hit trains the skill (use_skill(wtype, 1))
      if (train) useSkillPoints(ctx, weapon?.def.weapon?.skill ?? BARE_HANDED, 1);
      dmg += weaponDamBonus(
        weapon ? weapon.skill : (stats.bareSkill ?? P_UNSKILLED),
        weapon?.def ?? null,
      );
    }
    if (dmg < 1) dmg = 1;
  } else if (strBonus) dmg = 1;
  else dmg = 0;

  const hp = target.c.hp;
  // ref: src/uhitm.c hmon_hitmon_pet(): hitting a pet abuses it, and if it lives on it flees
  if (mon.tame && dmg > 0) {
    const destroyed = !hp || hp.cur - dmg < 1;
    hurtPet(ctx, targetId, destroyed ? 0 : 10 * ctx.rng.rnd(dmg), destroyed);
  }
  if (hp) hp.cur -= dmg;
  if (!hp || hp.cur < 1) {
    // ref: src/mon.c xkilled(): "You kill/destroy <mon>!" then experience()
    ctx.emit({
      type: 'msg',
      key: nonliving(def) ? 'combat.you_destroy' : 'combat.you_kill',
      params: { mon: name },
    });
    monsterDied(ctx, targetId, true);
    gainExperience(ctx, hero.id, experienceFor(def, mon.level));
    if (epri && ctx.rng.rn2(2) === 0) ghodHitsu(ctx, epri);
    if (angerGuards) angryGuards(ctx, false);
    return answer(true, false);
  }
  // ref: src/uhitm.c hmon_hitmon_msg_hit(): "You hit <mon>" + exclam(dmg)
  ctx.emit({
    type: 'msg',
    key: exclam(dmg) === '!' ? 'combat.you_hit_hard' : 'combat.you_hit',
    params: { mon: name },
  });
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
  return answer(true, true);
}

/**
 * Monster to-hit: `tmp > rnd(20 + i)` for attack index i.
 * ref: src/mhitu.c mattacku(): tmp = AC_VALUE(u.uac) + 10; tmp += m_lev; if (tmp <= 0) tmp = 1.
 * (Hero not invisible, monster can see; a trapped monster has -2.)
 */
export function monsterToHit(
  rng: Rng,
  heroAc: number,
  monLevel: number,
  heroHelpless = false,
  monTrapped = false,
): number {
  let tmp = acValue(rng, heroAc) + 10;
  tmp += monLevel;
  if (heroHelpless) tmp += 4; // multi < 0
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
 * ref: src/mhitu.c hitmu(), hitmsg(), mdamageu(); src/uhitm.c mhitm_ad_phys() "hand to hand
 * weapon" (no artifacts, silver, poisoned weapons or puddings)
 */
export function hitmu(
  ctx: Ctx,
  mon: Entity,
  atk: AttackDef,
  mwep: Entity | null,
  again: boolean,
  ac: number,
): number {
  const name = monNam(ctx, mon);
  let dmg = ctx.rng.d(atk.n, atk.d);
  // (no midnight(): undead get no extra damage)
  if (atk.at === 'weapon' && mwep && atk.ad === 'phys') {
    // ref: src/uhitm.c mhitm_ad_phys() "hand to hand weapon": damage += dmgval(otmp, hero)
    dmg += dmgvalSized(ctx.rng, mwep, ctx.defs.object(mwep.def), false);
    if (dmg <= 0) dmg = 1;
  }
  // hitmsg(): given at the top of the damage type's mhitu branch, except for those that print
  // their own line (and a physical hug)
  if (hitmsgFor(atk, ctx.defs.monster(mon.def).flags.includes('animal')))
    ctx.emit({
      type: 'msg',
      key: `combat.mon_${hitVerb(atk.at)}${again ? '_again' : ''}`,
      params: { mon: name },
    });
  // ref: src/uhitm.c mhitm_adtyping(): the damage type's effect (resistances, sleep, poison, ...)
  const mhm = newMhm(dmg);
  mhitmAdtyping(ctx, mon.id, atk, ctx.state.playerId, mhm);
  if (mhm.done) return mhm.hitflags;
  dmg = mhm.damage;
  if (ctx.state.gameOver) {
    stopOccupation(ctx);
    return M_ATTK.HIT;
  }
  // Negative armor class reduces damage done instead of fully protecting against hits.
  if (dmg > 0 && ac < 0) {
    dmg -= ctx.rng.rnd(-ac);
    if (dmg < 1) dmg = 1;
  }
  if (dmg > 0) mdamageu(ctx, dmg, `@${mon.def}`); // ref: src/mhitu.c mdamageu() -> done_in_by()
  stopOccupation(ctx); // ref: stop_occupation() / nomul(0)
  return M_ATTK.HIT; // passiveum(): only a polymorphed hero has passive attacks (7f)
}

/** The monster is next to the hero (C's `!range2` with `u_at(bhitpos)`). */
function nextToHero(ctx: Ctx, mon: Entity): boolean {
  const p = mon.c.pos;
  const hp = getPlayer(ctx.state).c.pos;
  return (
    !!p && !!hp && p.level === hp.level && Math.max(Math.abs(p.x - hp.x), Math.abs(p.y - hp.y)) <= 1
  );
}

/**
 * The monster `monId` makes all its attacks at the hero (it is adjacent), following mattacku()'s
 * switch on the attack type with the results `sum[]`.
 * ref: src/mhitu.c mattacku(), missmu(). A hug is automatic after the two attacks before it hit
 * (or while it holds her); gazes (gazemu()) and explosions (explmu()) need no to-hit roll.
 * Engulfing (step 4), breath and spit (step 5, at range) do nothing yet; a monster at range is
 * not handled here (mattackRanged() in mthrowu.ts, through monmove.ts).
 */
export function monsterAttack(ctx: Ctx, monId: EntityId): void {
  const hero = getPlayer(ctx.state);
  const mon = ctx.state.entities[String(monId)];
  const m = mon?.c.monster;
  const hp = hero.c.hp;
  if (!mon || !m || !hp) throw new Error(`Entity ${monId} cannot attack`);
  const def = ctx.defs.monster(mon.def);
  const name = monNam(ctx, mon);
  // ref: src/mhitu.c mattacku(): "in the midst of successful prayer" monsters won't attack
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
  );

  const sum: number[] = [];
  let prevHit = -1; // index of the previous attack if it hit (ref: hitmsg_prev)
  for (let i = 0; i < def.attacks.length; i++) {
    sum[i] = M_ATTK.MISS;
    // counterattack against attack [i-1] might have been fatal
    if (!ctx.state.entities[String(monId)]?.c.monster) return;
    // recalc in case a prior attack moved the hero (a quantum mechanic's teleport)
    if (i > 0 && !nextToHero(ctx, mon)) continue;
    const atk = def.attacks[i];
    if (!atk) continue;
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
        const j = ctx.rng.rnd(20 + i);
        if (tmp > j)
          sum[i] = hitmu(
            ctx,
            mon,
            atk,
            null,
            prevHit === i - 1 && def.attacks[i - 1]?.at === atk.at,
            ac,
          );
        else missmu(ctx, name, tmp === j);
        break;
      }
      case 'weapon': {
        // ref: src/mhitu.c mattacku() AT_WEAP: wield a weapon first if one is wanted (the move
        // is spent), then add the weapon's to-hit and announce the swing before rolling
        if (monWieldItem(ctx, monId)) break;
        const mwep = monWep(ctx, monId);
        let attackTmp = tmp;
        if (mwep) {
          attackTmp += hitval(mwep, ctx.defs.object(mwep.def), null);
          if (mon.c.pos && heroSees(ctx, mon.c.pos)) mswings(ctx, mon, mwep);
        }
        const j = ctx.rng.rnd(20 + i);
        if (attackTmp > j)
          sum[i] = hitmu(
            ctx,
            mon,
            atk,
            mwep,
            prevHit === i - 1 && def.attacks[i - 1]?.at === atk.at,
            ac,
          );
        else missmu(ctx, name, attackTmp === j);
        break;
      }
      case 'magic':
        // ref: src/mhitu.c mattacku() AT_MAGC: next to the hero (range2 is false), so
        // castmu(mtmp, mattk, TRUE, foundyou) with no to-hit roll; buzzmu() is the ranged case
        castmu(ctx, monId, atk, true, true);
        break;
      case 'hug':
        // automatic if prev two attacks succeed, or while it holds her (`!range2`: next to her);
        // failed_grab() never fails against the hero (she is never unsolid: no polymorph)
        if ((i >= 2 && sum[i - 1] && sum[i - 2]) || ustuck(ctx) === monId)
          sum[i] = hitmu(ctx, mon, atk, null, false, ac);
        break;
      case 'gaze':
        // can affect her either ranged or not (Medusa's gaze works through m_respond(): step 6)
        if (mon.def !== 'nh:medusa') sum[i] = gazemu(ctx, mon, atk);
        break;
      case 'explode':
        // automatic hit if next to, and aimed at her
        sum[i] = explmu(ctx, mon, atk, true);
        break;
      // AT_ENGL (step 4), AT_BREA, AT_SPIT (step 5, at range)
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

/** ref: src/mhitu.c missmu(): "just misses" when the roll equals tmp exactly (verbose) */
function missmu(ctx: Ctx, name: string, nearmiss: boolean): void {
  ctx.emit({
    type: 'msg',
    key: nearmiss ? 'combat.mon_just_misses' : 'combat.mon_misses',
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
  const altfeedback = hasProp(getPlayer(ctx.state), P.BLINDED); // Blind || Invisible
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
