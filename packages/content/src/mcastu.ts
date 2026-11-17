// Monster spellcasting at the hero: the spell choice, the casting delay, fumbling, cursing when
// it cannot cast, and the mage spells. ref: src/mcastu.c castmu(), choose_monster_spell(),
// spell_would_be_useless(), is_undirected_spell(), cursetxt(), mcast_spell(), m_cure_self(),
// mcast_psi_bolt(), mcast_stun_you(), mcast_weaken_you(), the clerical mcast_open_wounds(),
// mcast_confuse_you(), mcast_paralyze(), mcast_blind_you(), mcast_insects(), mcast_lightning(),
// mcast_fire_pillar(), mcast_geyser(), mcast_destroy_armor(), mcast_summon_mons(),
// mcast_death_touch(), touch_of_death(), death_inflicted_by(); include/mcastu.h; src/wizard.c
// has_aggravatables(); src/minion.c monster_census()
//
// Callers: monsterAttack (combat.ts, an adjacent AT_MAGC attack: castmu(TRUE, TRUE)) and dochug
// (monmove.ts, an undirected spell while not attacking: castmu(FALSE, FALSE)). This module must
// never import combat, monmove, actions, zap, peaceful or dog (combat -> mcastu -> zap -> actions
// -> combat would be a cycle).
//
// A cancelled caster (`mcan`) only curses. An invisible hero is where the caster thinks she is
// (`ap`, C's mux/muy: apparxy.ts), so a directed spell may go "at thin air". Not ported (see
// DEVIATIONS.md "Monster spellcasting"): reading the M_SEEN resistance memory (`m_seenres()`;
// the AD_FIRE/AD_COLD casts record it), the hero's displacement, Deaf, Norep,
// shieldeff(). The AD_FIRE and AD_COLD AT_MAGC attacks (Asmodeus's) envelop her in flames or
// cover her in frost; the AD_MAGM one (a shower of missiles) scuffs the engraving under her
// (mon_spell_hits_spot()).
// Clone wizard is the Wizard's alone, while he is the only one ("Double Trouble..."). Insects are
// always "insects" (no hallucinated names); no melting ice. The touch of
// death's "he"/"she" follows the kind's gender flag, else "it" (monsters have no gender here).
import {
  NORMAL_SPEED,
  cellRules,
  getPlayer,
  isVisible,
  sortedIds,
  type AttackDef,
  type Ctx,
  type Entity,
  type EntityId,
  type Msg,
  type Pos,
} from '@nh/core';
import { burnAwaySlime } from './slimestate';
import { blockersOf } from './boulder';
import { flashburn, monSpellHitsSpot } from './buzz';
import { ureflects } from './reflect';
import { clearPath } from './clearpath';
import { destroyItems, erodeArmor } from './erode';
import { makemon, mkclass, mnextoPos } from './generation';
import { losehp, losestr } from './hp';
import { done } from './end';
import { clonewiz, nasty } from './nasty';
import { isWiz, noOfWizards } from './wizstate';
import { isDemon, nonliving } from './mondata';
import { inWTower } from './levelflags';
import { heroForm, rehumanize, upolyd } from './upoly';
import { nomulNow } from './hunger';
import { nhData } from './items';
import { igniteItems } from './light';
import { mdamageu } from './mhitu';
import { M_SEEN, monstseesu, monstunseesu } from './musestate';
import {
  aggravate,
  isCancelled,
  isFrozen,
  isMConfused,
  monAdjustSpeed,
  mspeed,
  mspecUsed,
  mstratOf,
  setMspecUsed,
} from './mstate';
import { canSpotMon, monNam, telepathSenses } from './perception';
import {
  maybeHalfPhys,
  maybeHalfSpell,
  P,
  hasIntrinsic,
  hasProp,
  makeBlinded,
  makeConfused,
  makeStunned,
  timeoutLeft,
} from './props';
import { rndcurse } from './sit';
import {
  canseemon,
  heroInvisible,
  invisBlocked,
  mapInvisible,
  monInvisible,
  perceives,
  seeInvisible,
  setMinvis,
} from './invis';

/** ref: include/mcastu.h MONSPELL() names, in their enum order */
export type McastSpell =
  | 'psi_bolt'
  | 'open_wounds'
  | 'cure_self'
  | 'haste_self'
  | 'confuse_you'
  | 'stun_you'
  | 'disappear'
  | 'paralyze'
  | 'blind_you'
  | 'weaken_you'
  | 'destry_armr'
  | 'insects'
  | 'curse_items'
  | 'lightning'
  | 'fire_pillar'
  | 'geyser'
  | 'aggravation'
  | 'summon_mons'
  | 'clone_wiz'
  | 'death_touch';

interface McastData {
  level: number;
  /** MCF_INDIRECT: untargeted (undirected) */
  indirect: boolean;
  /** MCF_SIGHT: the caster must be able to see the hero */
  sight: boolean;
  /** MCF_HOSTILE: hostile casters only */
  hostile: boolean;
}

const spell = (level: number, flags: string): McastData => ({
  level,
  indirect: flags.includes('I'),
  sight: flags.includes('S'),
  hostile: flags.includes('H'),
});

/** ref: include/mcastu.h MONSPELL(def, lvl, flags): H hostile, S sight, I indirect */
export const MCAST_DATA: Readonly<Record<McastSpell, McastData>> = {
  psi_bolt: spell(0, 'HS'),
  open_wounds: spell(0, 'HS'),
  cure_self: spell(1, 'I'),
  haste_self: spell(2, 'I'),
  confuse_you: spell(2, 'HS'),
  stun_you: spell(3, 'HS'),
  disappear: spell(4, 'I'),
  paralyze: spell(4, 'HS'),
  blind_you: spell(6, 'HS'),
  weaken_you: spell(6, 'HS'),
  destry_armr: spell(8, 'HS'),
  insects: spell(8, 'HIS'),
  curse_items: spell(10, 'HS'),
  lightning: spell(11, 'HS'),
  fire_pillar: spell(12, 'HS'),
  geyser: spell(13, 'HS'),
  aggravation: spell(13, 'IHS'),
  summon_mons: spell(15, 'HIS'),
  clone_wiz: spell(18, 'HIS'),
  death_touch: spell(20, 'HS'),
};

/** ref: src/mcastu.c mon_cleric_spells[] (ascending level order) */
const MON_CLERIC_SPELLS: readonly McastSpell[] = [
  'open_wounds',
  'cure_self',
  'confuse_you',
  'paralyze',
  'blind_you',
  'insects',
  'curse_items',
  'lightning',
  'fire_pillar',
  'geyser',
];

/** ref: src/mcastu.c mon_wizard_spells[] (ascending level order) */
const MON_WIZARD_SPELLS: readonly McastSpell[] = [
  'psi_bolt',
  'cure_self',
  'haste_self',
  'stun_you',
  'disappear',
  'weaken_you',
  'destry_armr',
  'curse_items',
  'aggravation',
  'summon_mons',
  'clone_wiz',
  'death_touch',
];

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/** couldsee(mx, my): a clear line from the hero to the monster, lit or not. ref: src/vision.c */
function couldsee(ctx: Ctx, mon: Entity): boolean {
  const p = mon.c.pos;
  const hp = getPlayer(ctx.state).c.pos;
  const level = p ? ctx.state.levels[p.level] : undefined;
  if (!p || !hp || !level || hp.level !== p.level) return false;
  const opaque = cellRules(level, ctx.defs).opaque;
  return clearPath(level, opaque, hp.x, hp.y, p.x, p.y, blockersOf(ctx, level.id));
}

/** ref: src/mcastu.c is_undirected_spell() */
export const isUndirectedSpell = (s: McastSpell): boolean => MCAST_DATA[s].indirect;

/**
 * Some monster on the level waits for the hero, is asleep or cannot move, on her side of the
 * Wizard's Tower's walls and the caster's (none when those differ).
 * ref: src/wizard.c has_aggravatables()
 */
function hasAggravatables(ctx: Ctx, mon: Entity): boolean {
  const mp = mon.c.pos;
  const level = mp?.level;
  const lev = level !== undefined ? ctx.state.levels[level] : undefined;
  const inTower = !!mp && inWTower(ctx.state, lev, mp.x, mp.y);
  const hp = getPlayer(ctx.state).c.pos;
  if (inTower !== (!!hp && inWTower(ctx.state, lev, hp.x, hp.y))) return false;
  for (const id of sortedIds(ctx.state)) {
    const e = ctx.state.entities[String(id)];
    const p = e?.c.pos;
    if (!e?.c.monster || !p || p.level !== level) continue;
    if (inWTower(ctx.state, lev, p.x, p.y) !== inTower) continue;
    if (mstratOf(ctx, e.id).waitForU || e.c.monster.asleep || isFrozen(ctx, e.id)) return true;
  }
  return false;
}

/** destroy_arm(): seffect.ts registers it (it sits far above this module) */
let destroyArmFn: ((ctx: Ctx) => boolean) | null = null;
export function setDestroyArm(fn: (ctx: Ctx) => boolean): void {
  destroyArmFn = fn;
}

/** Some spells are useless under some circumstances. ref: src/mcastu.c spell_would_be_useless() */
export function spellWouldBeUseless(ctx: Ctx, mon: Entity, s: McastSpell): boolean {
  const data = MCAST_DATA[s];
  // spell is only cast by hostile monsters
  if (data.hostile && mon.c.monster?.peaceful) return true;
  // spell needs the monster to see hero
  if (data.sight && !couldsee(ctx, mon)) return true;
  const hero = getPlayer(ctx.state);
  switch (s) {
    case 'disappear':
      // invisibility when already invisible
      if (monInvisible(ctx, mon) || invisBlocked(ctx, mon)) return true;
      // peaceful monster won't cast invisibility if you can't see invisible
      if (mon.c.monster?.peaceful && !seeInvisible(ctx.state)) return true;
      break;
    case 'death_touch':
      if ((hasProp(hero, P.ANTIMAGIC) || hasProp(hero, P.HALLUC)) && !ctx.rng.rn2(2)) return true;
      break;
    // only the Wizard is allowed to clone himself
    case 'clone_wiz':
      if (!isWiz(ctx, mon.id) || noOfWizards(ctx) > 1) return true;
      break;
    case 'geyser':
      if (!ctx.rng.rn2(5)) return true;
      break;
    case 'aggravation':
      // aggravation (global wakeup) when everyone is already active
      if (!hasAggravatables(ctx, mon)) return ctx.rng.rn2(100) !== 0;
      break;
    case 'haste_self':
      // haste self when already fast
      if (mspeed(ctx, mon.id) === 'fast') return true;
      break;
    case 'cure_self': {
      // healing when already healed
      const hp = mon.c.hp;
      if (!hp || hp.cur === hp.max) return true;
      break;
    }
    case 'blind_you':
      // Blinded: the timed or intrinsic blindness, not a blindfold
      if (timeoutLeft(ctx.state, hero, P.BLINDED) > 0 || hasIntrinsic(hero, P.BLINDED)) return true;
      break;
    default:
      break;
  }
  return false;
}

/** Chooses a spell for the monster to cast. ref: src/mcastu.c choose_monster_spell() */
function chooseMonsterSpell(ctx: Ctx, mon: Entity, ad: string): McastSpell {
  const list = ad === 'spel' ? MON_WIZARD_SPELLS : ad === 'clrc' ? MON_CLERIC_SPELLS : null;
  const last = list?.[list.length - 1];
  if (!list || !last) return 'psi_bolt';
  // max spell level in this monster spell list
  const maxlev = MCAST_DATA[last].level;
  // which level spell to cast?
  let spellval = ctx.rng.rn2(mon.c.monster?.level ?? 0);
  if (spellval > maxlev && ctx.rng.rn2(maxlev)) spellval = ctx.rng.rn2(maxlev);
  // find the highest spell in the list we could cast
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i];
    if (s && MCAST_DATA[s].level <= spellval && !spellWouldBeUseless(ctx, mon, s)) return s;
  }
  // or return the first spell in the list
  return list[0] ?? 'psi_bolt';
}

/** The hero is invisible to the caster and it guesses wrong. */
const missesInvisible = (ctx: Ctx, mon: Entity, ap: Pos): boolean => {
  const hp = getPlayer(ctx.state).c.pos;
  return (
    heroInvisible(ctx.state) &&
    !perceives(ctx.defs.monster(mon.def)) &&
    (!hp || ap.x !== hp.x || ap.y !== hp.y)
  );
};

/** Feedback when a frustrated monster couldn't cast a spell. ref: src/mcastu.c cursetxt() */
export function cursetxt(ctx: Ctx, mon: Entity, undirected: boolean, ap: Pos): void {
  if (canseemon(ctx, mon) && couldsee(ctx, mon)) {
    // spellcasting monsters are impolite (no hidden or displaced hero)
    say(
      ctx,
      undirected
        ? 'mcastu.points_all_around'
        : missesInvisible(ctx, mon, ap)
          ? 'mcastu.points_general_direction'
          : 'mcastu.points_at_you',
      { mon: monNam(ctx, mon) },
    );
  } else if (ctx.state.turn % 4 === 0 || !ctx.rng.rn2(4)) {
    say(ctx, 'mcastu.mumbled_curse');
  }
}

const isSpellAttack = (atk: AttackDef): boolean => atk.ad === 'spel' || atk.ad === 'clrc';

/**
 * The monster `monId` casts with its AT_MAGC attack `atk`. Three cases: it is attacking the
 * hero (search for a useful spell); it thinks it is (`foundYou` false: a directed spell then
 * fails, after the delay is set); it is not attacking (`thinksItFoundYou` false: one choice,
 * and only an undirected useful spell is cast). True when a spell was cast (M_ATTK_HIT). `ap` is
 * where the caster thinks the hero is (mux/muy), by default her square.
 * ref: src/mcastu.c castmu()
 */
export function castmu(
  ctx: Ctx,
  monId: EntityId,
  atk: AttackDef,
  thinksItFoundYou: boolean,
  foundYou: boolean,
  ap?: Pos,
): boolean {
  const mon = ctx.state.entities[String(monId)];
  const m = mon?.c.monster;
  if (!mon || !m) return false;
  const hp = getPlayer(ctx.state).c.pos;
  const aim: Pos = ap ?? (hp ? { x: hp.x, y: hp.y } : { x: 0, y: 0 });
  const ml = m.level;
  let spellnum: McastSpell = 'psi_bolt';

  if (isSpellAttack(atk) && ml) {
    let cnt = 40;
    do {
      spellnum = chooseMonsterSpell(ctx, mon, atk.ad);
      // not trying to attack?  don't allow directed spells
      if (!thinksItFoundYou) {
        if (!isUndirectedSpell(spellnum) || spellWouldBeUseless(ctx, mon, spellnum)) return false;
        break;
      }
    } while (--cnt > 0 && spellWouldBeUseless(ctx, mon, spellnum));
    if (cnt === 0) return false;
  }

  // monster unable to cast spells?
  if (isCancelled(ctx, monId) || mspecUsed(ctx, monId) || !ml) {
    cursetxt(ctx, mon, isUndirectedSpell(spellnum), aim);
    return false;
  }

  if (isSpellAttack(atk)) setMspecUsed(ctx, monId, ml < 8 ? 10 - ml : 2);

  // casting a directed spell at the wrong place (after the delay is set)
  if (!foundYou && thinksItFoundYou && !isUndirectedSpell(spellnum)) {
    say(ctx, canseemon(ctx, mon) ? 'mcastu.thin_air' : 'mcastu.something_thin_air', {
      mon: monNam(ctx, mon),
    });
    return false;
  }

  ctx.interrupt(); // nomul(0)
  if (ctx.rng.rn2(ml * 10) < (isMConfused(ctx, monId) ? 100 : 20)) {
    // fumbled attack
    if (canseemon(ctx, mon)) say(ctx, 'mcastu.air_crackles', { mon: monNam(ctx, mon) });
    return false;
  }
  const undirected = isUndirectedSpell(spellnum);
  if (canSpotMon(ctx, mon) || !undirected) {
    const who = canSpotMon(ctx, mon) ? 'casts' : 'something_casts';
    const at = undirected ? '' : missesInvisible(ctx, mon, aim) ? '_near_you' : '_at_you';
    say(ctx, `mcastu.${who}${at}`, { mon: monNam(ctx, mon) });
  }

  // As these are spells, the damage is related to the level of the monster casting the spell.
  let dmg: number;
  if (!foundYou) {
    dmg = 0;
    if (!isSpellAttack(atk)) return false; // impossible(): a hand-to-hand version of the spell
  } else if (atk.d) dmg = ctx.rng.d(Math.trunc(ml / 2) + atk.n, atk.d);
  else dmg = ctx.rng.d(Math.trunc(ml / 2) + 1, 6);
  dmg = maybeHalfSpell(ctx.state, dmg);

  // the switch on the attack's damage type
  if (atk.ad === 'fire') {
    say(ctx, 'mcastu.enveloped_flames');
    if (hasProp(getPlayer(ctx.state), P.FIRE_RES)) {
      say(ctx, 'mcastu.resist_effects'); // (shieldeff() is display only)
      monstseesu(ctx, M_SEEN.fire);
      dmg = 0;
    } else monstunseesu(ctx, M_SEEN.fire);
    burnAwaySlime(ctx);
    // burn up flammable items on the floor, melt ice terrain
    if (hp) monSpellHitsSpot(ctx, 'fire', hp.x, hp.y);
  } else if (atk.ad === 'cold') {
    say(ctx, 'mcastu.covered_frost');
    if (hasProp(getPlayer(ctx.state), P.COLD_RES)) {
      say(ctx, 'mcastu.resist_effects');
      monstseesu(ctx, M_SEEN.cold);
      dmg = 0;
    } else monstunseesu(ctx, M_SEEN.cold);
    // freeze water or lava terrain
    if (hp) monSpellHitsSpot(ctx, 'cold', hp.x, hp.y);
  } else if (atk.ad === 'magm') {
    say(ctx, 'mcastu.missiles');
    if (hasProp(getPlayer(ctx.state), P.ANTIMAGIC)) {
      say(ctx, 'mcastu.missiles_bounce');
      dmg = 0;
    } else dmg = ctx.rng.d(Math.trunc(ml / 2) + 1, 6);
    // shower of magic missiles scuffs an engraving
    if (hp) monSpellHitsSpot(ctx, 'magic_missile', hp.x, hp.y);
  } else if (isSpellAttack(atk)) {
    mcastSpell(ctx, mon, dmg, spellnum, aim);
    dmg = 0; // done by the spell casting functions
  }
  if (dmg) mdamageu(ctx, dmg, `@${mon.def}`);
  return true;
}

/** ref: src/mcastu.c m_cure_self(): heals d(3,6) when hurt, and no damage is done */
function mCureSelf(ctx: Ctx, mon: Entity, dmg: number): number {
  const hp = mon.c.hp;
  if (hp && hp.cur < hp.max) {
    if (canseemon(ctx, mon)) say(ctx, 'zap.looks_better', { mon: monNam(ctx, mon) });
    // healmon(mtmp, d(3, 6), 0)
    const n = ctx.rng.d(3, 6);
    hp.cur = Math.min(hp.cur + n, hp.max);
    dmg = 0;
  }
  return dmg;
}

/** ref: src/mcastu.c mcast_psi_bolt(): magic resistance halves it */
function mcastPsiBolt(ctx: Ctx, dmg: number): number {
  if (hasProp(getPlayer(ctx.state), P.ANTIMAGIC)) dmg = Math.trunc((dmg + 1) / 2);
  if (dmg <= 5) say(ctx, 'mcastu.psi.slight');
  else if (dmg <= 10) say(ctx, 'mcastu.psi.fire');
  else if (dmg <= 20) say(ctx, 'mcastu.psi.aches');
  else say(ctx, 'mcastu.psi.very');
  return dmg;
}

/** ref: src/mcastu.c mcast_stun_you() */
function mcastStunYou(ctx: Ctx): void {
  const hero = getPlayer(ctx.state);
  const stunned = hasProp(hero, P.STUNNED);
  if (hasProp(hero, P.ANTIMAGIC) || hasProp(hero, P.FREE_ACTION)) {
    if (!stunned) say(ctx, 'mcastu.disoriented');
    makeStunned(ctx, 1, false);
  } else {
    say(ctx, stunned ? 'mcastu.struggle' : 'mcastu.reel');
    const dmg = maybeHalfSpell(
      ctx.state,
      ctx.rng.d((hero.c.attributes?.dex ?? 10) < 12 ? 6 : 4, 4),
    );
    makeStunned(ctx, timeoutLeft(ctx.state, hero, P.STUNNED) + dmg, false);
  }
}

/** ref: src/mcastu.c mcast_weaken_you(): drains rnd(m_lev - 6) Str (at least 1) */
function mcastWeakenYou(ctx: Ctx, mon: Entity): void {
  if (hasProp(getPlayer(ctx.state), P.ANTIMAGIC)) {
    say(ctx, 'mcastu.momentarily_weakened');
    return;
  }
  say(ctx, 'mcastu.weaker');
  let dmg = (mon.c.monster?.level ?? 0) - 6;
  if (dmg < 1) dmg = 1; // paranoia since only chosen when m_lev is high
  dmg = maybeHalfSpell(ctx.state, dmg);
  losestr(ctx, ctx.rng.rnd(dmg), '@killer.strength_loss');
}

/**
 * Physical damage (force, not heat): d(8,6), whatever the hero resists, halved by
 * Half_physical_damage. ref: src/mcastu.c mcast_geyser()
 */
function mcastGeyser(ctx: Ctx): number {
  say(ctx, 'mcastu.geyser');
  return maybeHalfPhys(ctx.state, ctx.rng.d(8, 6));
}

/**
 * d(8,6) fire damage (none with fire resistance); armor may burn, carried items may burn or
 * catch light, and scrolls and books on her square may burn. ref: src/mcastu.c
 * mcast_fire_pillar(); src/trap.c burnarmor()
 */
function mcastFirePillar(ctx: Ctx): number {
  const hero = getPlayer(ctx.state);
  say(ctx, 'mcastu.fire_pillar');
  const origDmg = ctx.rng.d(8, 6);
  const dmg = maybeHalfSpell(ctx.state, hasProp(hero, P.FIRE_RES) ? 0 : origDmg);
  burnAwaySlime(ctx);
  erodeArmor(ctx, hero.id, 'burn'); // burnarmor()
  // item destruction dmg
  destroyItems(ctx, hero.id, 'fire', origDmg);
  if (ctx.state.gameOver) return 0;
  igniteItems(ctx, hero.id);
  // burn up flammable items on the floor
  const p = hero.c.pos;
  if (p) monSpellHitsSpot(ctx, 'fire', p.x, p.y);
  return dmg;
}

/**
 * d(8,6) shock damage: reflection stops it all, shock resistance stops the damage but not the
 * item destruction or the flash. ref: src/mcastu.c mcast_lightning()
 */
function mcastLightning(ctx: Ctx): number {
  const hero = getPlayer(ctx.state);
  say(ctx, 'mcastu.lightning');
  const reflects = ureflects(ctx, 'mcastu.bounces');
  const origDmg = ctx.rng.d(8, 6);
  if (reflects) return 0;
  const dmg = maybeHalfSpell(ctx.state, hasProp(hero, P.SHOCK_RES) ? 0 : origDmg);
  destroyItems(ctx, hero.id, 'elec', origDmg);
  if (ctx.state.gameOver) return 0;
  const p = hero.c.pos;
  if (p) monSpellHitsSpot(ctx, 'lightning', p.x, p.y); // no iron bars: nothing happens
  // blind hero; no effect if already blind
  flashburn(ctx, ctx.rng.rnd(100));
  return dmg;
}

/** Monsters on the hero's level that she can see or sense. ref: src/minion.c monster_census(TRUE) */
function monsterCensus(ctx: Ctx): number {
  const level = getPlayer(ctx.state).c.pos?.level;
  let count = 0;
  for (const id of sortedIds(ctx.state)) {
    const e = ctx.state.entities[String(id)];
    if (e?.c.monster && e.c.pos?.level === level && canSpotMon(ctx, e)) count++;
  }
  return count;
}

/**
 * At least four hostile ants (mkclass(S_ANT): giant ants, killer bees, soldier ants...) appear
 * around the hero, or snakes when no ant can be made. ref: src/mcastu.c mcast_insects()
 */
function mcastInsects(ctx: Ctx, mon: Entity, ap: Pos): void {
  const p = getPlayer(ctx.state).c.pos;
  const level = p ? ctx.state.levels[p.level] : undefined;
  if (!p || !level) return;
  // Try for insects, and if there are none left, go for (sticks to) snakes.
  const pm = mkclass(ctx, 'a', level.depth);
  const cls = pm ? 'a' : 'S';
  let success = false;
  const oldseen = monsterCensus(ctx);
  const ml = mon.c.monster?.level ?? 0;
  let quan = ml < 2 ? 1 : ctx.rng.rnd(Math.trunc(ml / 2));
  if (quan < 3) quan = 3;
  for (let i = 0; i <= quan; i++) {
    // enexto(&bypos, mtmp->mux, mtmp->muy, mtmp->data)
    const bypos = mnextoPos(ctx, level, null, { x: ap.x, y: ap.y }, ctx.defs.monster(mon.def));
    if (!bypos) return;
    const def = mkclass(ctx, cls, level.depth);
    const id = def ? makemon(ctx, def, bypos, { angry: true }) : null; // MM_ANGRY | MM_NOMSG
    const m = id === null ? undefined : ctx.state.entities[String(id)]?.c.monster;
    if (m) {
      success = true;
      m.asleep = false;
      m.peaceful = false;
      delete m.tame;
    }
  }
  const newseen = monsterCensus(ctx);

  // not canspotmon() which includes unseen things sensed via warning
  const seecaster = canseemon(ctx, mon) || telepathSenses(ctx.state, ctx.defs, mon);
  const what = cls === 'S' ? '@mcastu.snakes' : '@mcastu.insects';
  if (!seecaster) {
    // unseen caster fails or summons unseen critters, or unconscious hero
    if (newseen <= oldseen || unconscious(ctx)) say(ctx, 'mcastu.hear_summoning', { what });
    else
      say(
        ctx,
        newseen === oldseen + 1 ? 'mcastu.hear_summoning_one' : 'mcastu.hear_summoning_many',
        {
          what: cls === 'S' ? '@mcastu.snake' : '@mcastu.insect',
        },
      );
  } else if (!success) say(ctx, 'mcastu.sticks', { mon: monNam(ctx, mon) });
  else if (cls === 'S') say(ctx, 'mcastu.transforms', { mon: monNam(ctx, mon), what });
  else if (missesInvisible(ctx, mon, ap))
    say(ctx, 'mcastu.summons_near_you', { mon: monNam(ctx, mon), what });
  else say(ctx, 'mcastu.summons', { mon: monNam(ctx, mon), what });
}

/** Asleep, fainted or knocked out. ref: src/hack.c unconscious() (Unaware) */
function unconscious(ctx: Ctx): boolean {
  const r = getPlayer(ctx.state).c.helpless?.reasonKey;
  return r === 'helpless.asleep' || r === 'helpless.fainted' || r === 'helpless.rotten_food';
}

/**
 * Blinds the hero for 200 turns (blindness resistance does not apply). Her vision never clears
 * at once: there are no Eyes of the Overworld. ref: src/mcastu.c mcast_blind_you()
 */
function mcastBlindYou(ctx: Ctx): void {
  // never chosen while Blinded (spellWouldBeUseless)
  if (timeoutLeft(ctx.state, getPlayer(ctx.state), P.BLINDED) > 0) return;
  say(ctx, 'mcastu.scales');
  makeBlinded(ctx, 200, false);
}

/**
 * Freezes the hero for 4 + m_lev turns (1 with magic resistance or Free action); the returned
 * count is also the damage done. C's nomul() keeps a longer helplessness, but the reason and
 * the "You can move again." are always replaced. ref: src/mcastu.c mcast_paralyze(),
 * src/hack.c nomul()
 */
function mcastParalyze(ctx: Ctx, mon: Entity): number {
  const hero = getPlayer(ctx.state);
  const helpless = hero.c.helpless;
  let dmg: number;
  if (hasProp(hero, P.ANTIMAGIC) || hasProp(hero, P.FREE_ACTION)) {
    if (!helpless) say(ctx, 'mcastu.stiffen');
    dmg = 1; // to produce nomul(-1), not actual damage
  } else {
    if (!helpless) say(ctx, 'mcastu.frozen');
    dmg = maybeHalfSpell(ctx.state, 4 + (mon.c.monster?.level ?? 0));
  }
  const finish = { key: 'eat.can_move_again' };
  if (!helpless) nomulNow(ctx, dmg, 'helpless.paralyzed_monster', finish);
  else {
    const until = ctx.state.turn + 1 + dmg;
    if (until > helpless.until) {
      const actor = hero.c.actor;
      if (actor) actor.energy -= (until - helpless.until) * NORMAL_SPEED;
      helpless.until = until;
    }
    helpless.reasonKey = 'helpless.paralyzed_monster'; // multi_reason
    nhData(ctx).nomovemsg = finish; // nomovemsg = 0: "You can move again."
  }
  return dmg;
}

/**
 * Confuses the hero for m_lev more turns; magic resistance stops it. ref: src/mcastu.c
 * mcast_confuse_you()
 */
function mcastConfuseYou(ctx: Ctx, mon: Entity): void {
  const hero = getPlayer(ctx.state);
  if (hasProp(hero, P.ANTIMAGIC)) {
    say(ctx, 'mcastu.dizzy');
    return;
  }
  const oldprop = hasProp(hero, P.CONFUSION);
  const dmg = maybeHalfSpell(ctx.state, mon.c.monster?.level ?? 0);
  makeConfused(ctx, timeoutLeft(ctx.state, hero, P.CONFUSION) + dmg, true);
  if (hasProp(hero, P.HALLUC)) say(ctx, oldprop ? 'mcastu.trippier' : 'mcastu.trippy');
  else say(ctx, oldprop ? 'mcastu.more_confused' : 'mcastu.confused');
}

/** ref: src/mcastu.c mcast_open_wounds(): magic resistance halves it */
function mcastOpenWounds(ctx: Ctx, dmg: number): number {
  if (hasProp(getPlayer(ctx.state), P.ANTIMAGIC)) dmg = Math.trunc((dmg + 1) / 2);
  if (dmg <= 5) say(ctx, 'mcastu.wounds.itches');
  else if (dmg <= 10) say(ctx, 'mcastu.wounds.appear');
  else if (dmg <= 20) say(ctx, 'mcastu.wounds.severe');
  else say(ctx, 'mcastu.wounds.covered');
  return dmg;
}

/**
 * "The kobold shaman suddenly disappears!" (or "becomes transparent" when she sees invisible): the
 * caster becomes permanently invisible, and an `I` marks it on a square she sees when she can no
 * longer spot it. ref: src/mcastu.c mcast_disappear()
 */
function mcastDisappear(ctx: Ctx, mon: Entity): void {
  if (monInvisible(ctx, mon) || invisBlocked(ctx, mon)) return; // impossible()
  if (canseemon(ctx, mon))
    say(ctx, seeInvisible(ctx.state) ? 'mcastu.becomes_transparent' : 'mcastu.disappears', {
      mon: monNam(ctx, mon),
    });
  setMinvis(ctx, mon);
  const p = mon.c.pos;
  const level = p ? ctx.state.levels[p.level] : undefined;
  if (
    p &&
    level &&
    p.level === ctx.state.currentLevel &&
    isVisible(ctx.state, p.y * level.width + p.x) &&
    !canSpotMon(ctx, mon)
  )
    mapInvisible(ctx, p.x, p.y);
}

/**
 * The touch of death: 50 + d(8,6) damage and half that off her maximum HP; a polymorphed hero
 * returns to her own form, one whose maximum is no more than the drain dies.
 * ref: src/mcastu.c touch_of_death(), death_inflicted_by()
 */
function touchOfDeath(ctx: Ctx, mon: Entity): void {
  let dmg = 50 + ctx.rng.d(8, 6);
  const drain = Math.trunc(dmg / 2);
  // if we get here, we know that hero isn't magic resistant and isn't poly'd into an undead or
  // demon
  say(ctx, 'mcastu.drained');
  const killer = `@killer.touch_of_death.${mon.def}`;
  const hero = getPlayer(ctx.state);
  const hp = hero.c.hp;
  if (!hp) return;
  if (upolyd(ctx.state)) {
    hp.cur = 0; // u.mh = 0
    rehumanize(ctx); // fatal iff Unchanging
  } else if (drain >= hp.max) {
    done(ctx, killer);
  } else {
    // HP manipulation similar to poisoned(attrib.c)
    const olduhp = hp.cur;
    const uhpmin = Math.max(hero.c.experience?.level ?? 1, 3); // minuhpmax(3)
    hp.max = Math.max(hp.max - drain, uhpmin); // setuhpmax()
    if (hp.cur > hp.max) hp.cur = hp.max;
    // adjuhploss(): reduce pending damage if uhp has already been reduced due to drop in uhpmax
    if (hp.cur < olduhp) dmg -= olduhp - hp.cur;
    losehp(ctx, Math.max(dmg, 1), killer);
  }
}

/** ref: src/mcastu.c mcast_death_touch() */
function mcastDeathTouch(ctx: Ctx, mon: Entity): void {
  const def = ctx.defs.monster(mon.def);
  const he = !canSpotMon(ctx, mon)
    ? 'pronoun.it'
    : def.flags.includes('female')
      ? 'pronoun.she'
      : def.flags.includes('male')
        ? 'pronoun.he'
        : 'pronoun.it';
  say(ctx, 'mcastu.death_touch', { he: `@${he}` });
  const hero = getPlayer(ctx.state);
  const form = heroForm(ctx);
  if (form && (nonliving(form) || isDemon(form))) {
    say(ctx, 'mcastu.no_deader');
  } else if (!hasProp(hero, P.ANTIMAGIC) && ctx.rng.rn2(mon.c.monster?.level ?? 0) > 12) {
    if (hasProp(hero, P.HALLUC)) say(ctx, 'mcastu.out_of_body');
    else touchOfDeath(ctx, mon);
    monstunseesu(ctx, M_SEEN.magr);
  } else {
    if (hasProp(hero, P.ANTIMAGIC)) monstseesu(ctx, M_SEEN.magr); // (shieldeff() is display only)
    say(ctx, 'mcastu.lucky');
  }
}

/**
 * Nasties appear about the spot the caster thinks she is at: "A monster appears from nowhere!",
 * "Monsters appear around a spot near you!" when she is invisible to it and it guessed wrong.
 * ref: src/mcastu.c mcast_summon_mons() (no Wizard, no displacement)
 */
function mcastSummonMons(ctx: Ctx, mon: Entity, ap: Pos): void {
  const count = nasty(ctx, mon, ap);
  if (!count) return; // nothing was created?
  const one = count === 1;
  if (isWiz(ctx, mon.id)) {
    say(ctx, one ? 'mcastu.destroy_thief' : 'mcastu.destroy_thief_pl');
    return;
  }
  const hp = getPlayer(ctx.state).c.pos;
  // messages not quite right if plural monsters created but only a single monster is seen
  if (
    heroInvisible(ctx.state) &&
    !perceives(ctx.defs.monster(mon.def)) &&
    hp &&
    (ap.x !== hp.x || ap.y !== hp.y)
  )
    say(ctx, one ? 'mcastu.monster_appears_spot' : 'mcastu.monsters_appear_spot');
  else say(ctx, one ? 'mcastu.monster_appears' : 'mcastu.monsters_appear');
}

/** ref: src/mcastu.c mcast_destroy_armor() */
function mcastDestroyArmor(ctx: Ctx): void {
  if (hasProp(getPlayer(ctx.state), P.ANTIMAGIC)) {
    monstseesu(ctx, M_SEEN.magr); // (shieldeff() is display only)
    say(ctx, 'mcastu.field_of_force');
  } else if (!destroyArmFn?.(ctx)) {
    say(ctx, 'mcastu.skin_itches');
  } else {
    // monsters only realize you aren't magic-protected if armor is actually destroyed
    monstunseesu(ctx, M_SEEN.magr);
  }
}

/** The spell's effect on the hero (or the caster). ref: src/mcastu.c mcast_spell() */
export function mcastSpell(ctx: Ctx, mon: Entity, dmg: number, s: McastSpell, ap: Pos): void {
  // dmg 0 with a directed spell is impossible() in C; it cannot happen here (foundyou)
  if (dmg === 0 && !isUndirectedSpell(s)) return;
  switch (s) {
    case 'aggravation':
      say(ctx, 'mcastu.aware');
      aggravate(ctx);
      dmg = 0;
      break;
    case 'curse_items':
      say(ctx, 'mcastu.need_help');
      rndcurse(ctx);
      dmg = 0;
      break;
    case 'weaken_you': // drain strength
      mcastWeakenYou(ctx, mon);
      dmg = 0;
      break;
    case 'stun_you':
      mcastStunYou(ctx);
      dmg = 0;
      break;
    case 'haste_self':
      monAdjustSpeed(ctx, mon, 1);
      dmg = 0;
      break;
    case 'cure_self':
      dmg = mCureSelf(ctx, mon, dmg);
      break;
    case 'psi_bolt':
      dmg = mcastPsiBolt(ctx, dmg);
      break;
    case 'death_touch':
      mcastDeathTouch(ctx, mon);
      dmg = 0;
      break;
    case 'clone_wiz':
      // (spellWouldBeUseless() keeps it to the Wizard while he is the only one)
      if (isWiz(ctx, mon.id) && noOfWizards(ctx) === 1) {
        say(ctx, 'mcastu.double_trouble');
        clonewiz(ctx);
      }
      dmg = 0;
      break;
    case 'summon_mons':
      mcastSummonMons(ctx, mon, ap);
      dmg = 0;
      break;
    case 'destry_armr':
      mcastDestroyArmor(ctx);
      dmg = 0;
      break;
    case 'disappear': // makes self invisible
      mcastDisappear(ctx, mon);
      dmg = 0;
      break;
    case 'geyser':
      dmg = mcastGeyser(ctx);
      break;
    case 'fire_pillar':
      dmg = mcastFirePillar(ctx);
      break;
    case 'lightning':
      dmg = mcastLightning(ctx);
      break;
    case 'insects':
      mcastInsects(ctx, mon, ap);
      dmg = 0;
      break;
    case 'blind_you':
      mcastBlindYou(ctx);
      dmg = 0;
      break;
    case 'paralyze':
      dmg = mcastParalyze(ctx, mon);
      break;
    case 'confuse_you':
      mcastConfuseYou(ctx, mon);
      dmg = 0;
      break;
    case 'open_wounds':
      dmg = mcastOpenWounds(ctx, dmg);
      break;
  }
  if (ctx.state.gameOver) return; // destroyed items killed her
  if (dmg) mdamageu(ctx, dmg, `@${mon.def}`);
}
