// Potions: quaffing and the effects of the potions in our subset.
// ref: src/potion.c dodrink(), dopotion(), peffects(), healup()
import {
  NORMAL_SPEED,
  cellIndex,
  dungeonLayout,
  getLevel,
  type ActionDef,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type Offer,
  type PlayerAction,
} from '@nh/core';
import { answerFountainWish, drinkfountain, heroOnFountain } from './fountain';
import { uState } from './luck';
import { newuhs, makeSick } from './hunger';
import { encumberMsg } from './itemactions';
import { bcsign } from './items';
import { discover, isKnown } from './o_init';
import { moreExperienced } from './urexp';
import { pluslvl, setUlevelmax, ulevelmax } from './hero';
import { polyself, youWere } from './polyself';
import { upolyd } from './upoly';
import { ulycn, youUnwere } from './werestate';
import { heroEntity, strangeFeeling, useup } from './magic';
import { abase, adjattrib, amax, poisontell, restoreAttr, type Attr } from './attrib';
import { doEnlightenmentEffect } from './enlightenment';
import { monsterDetect } from './detect';
import { losehp } from './hp';
import { rndexp } from './hero';
import { hungerData } from './uhunger';
import { isStoned, fixPetrification } from './stonestate';
import { isSlimed } from './slimestate';
import { pwOf, setPw } from './uenergy';
import { surfaceKey } from './terrain';
import { ceilingKey, hardHelmet } from './read';
import { levelAtDepth } from './teleport';
import { isSokoban } from './sokoban';
import { floatUp } from './levitation';
import { levitating, setLevAtWill } from './trapstate';
import { lookHere } from './itemactions';
import { nomulNow } from './hunger';
import {
  P,
  hasExtrinsic,
  hasFromForm,
  hasIntrinsic,
  hasProp,
  incrItimeout,
  isStrangled,
  setItimeout,
  wornIn,
  makeBlinded,
  makeConfused,
  makeHallucinated,
  setIntrinsic,
  timeoutLeft,
} from './props';
import { cantSeeSelf, heroInvisBlocked, heroInvisible, selfInvisMessage } from './invis';
import { aggravate } from './mstate';

/**
 * ref: src/potion.c healup(): heals `nhp` and, if that goes past the maximum, raises the maximum
 * by `nxtra` and sets HP to it, and cures blindness and sickness when asked.
 */
export function healup(
  ctx: Ctx,
  nhp: number,
  nxtra: number,
  curesick: boolean,
  cureblind: boolean,
): void {
  const hp = heroEntity(ctx).c.hp;
  if (!hp) return;
  if (nhp) {
    hp.cur += nhp;
    if (hp.cur > hp.max) {
      hp.max += nxtra;
      hp.cur = hp.max;
    }
  }
  if (cureblind) makeBlinded(ctx, 0, true); // ref: healup(): make_blinded(0L, TRUE)
  if (curesick) cureSick(ctx);
}

/**
 * ref: src/potion.c make_sick(0L, (char *) 0, TRUE, SICK_ALL), make_vomiting(0L, TRUE): cures
 * food poisoning (the only illness we have; there is no vomiting countdown).
 */
export function cureSick(ctx: Ctx): void {
  makeSick(ctx, 0, '', true);
}

/** u.uhunger += n; newuhs(FALSE). ref: src/potion.c peffect_water() */
function addNutrition(ctx: Ctx, n: number): void {
  const h = heroEntity(ctx).c.hunger;
  if (!h) return;
  h.nutrition += n;
  newuhs(ctx, false);
}

const msg = (ctx: Ctx, key: string): void => ctx.emit({ type: 'msg', key });

/**
 * Result flags of a potion effect: `unknown` = potion_unkn > 0 (the type is not revealed);
 * `nothing` = potion_nothing > 0 ("You have a peculiar feeling for a moment, then it passes.").
 */
interface Effect {
  unknown: boolean;
  nothing?: boolean;
  /** peffects() returned 1: strange_feeling() used the potion up, unidentified */
  consumed?: boolean;
}

const POT_RESTORE_ABILITY: DefId = 'nh:potion_of_restore_ability';
const POT_FRUIT_JUICE: DefId = 'nh:potion_of_fruit_juice';

const HUNGER_INDEX: Readonly<Record<string, number>> = {
  satiated: 0,
  not_hungry: 1,
  hungry: 2,
  weak: 3,
  fainting: 4,
  fainted: 5,
  starved: 6,
};

/** ref: src/potion.c peffect_confusion() */
function peffectConfusion(ctx: Ctx, p: Entity): Effect {
  const hero = heroEntity(ctx);
  const buc = p.c.item?.buc ?? 'uncursed';
  let unknown = false;
  let nothing = false;
  if (!hasProp(hero, P.CONFUSION)) {
    if (hasProp(hero, P.HALLUC)) {
      msg(ctx, 'potion.trippy');
      unknown = true;
    } else msg(ctx, 'potion.huh_what');
  } else nothing = true;
  const incr = ctx.rng.rn2(7) + 16 - 8 * bcsign(buc); // rn1(7, 16 - 8 * bcsign(otmp))
  makeConfused(ctx, timeoutLeft(ctx.state, hero, P.CONFUSION) + incr, false);
  return { unknown, nothing };
}

/** ref: src/potion.c peffect_blindness() (no blindfolds: BBlinded never applies) */
function peffectBlindness(ctx: Ctx, p: Entity): Effect {
  const hero = heroEntity(ctx);
  const buc = p.c.item?.buc ?? 'uncursed';
  const blind = hasProp(hero, P.BLINDED);
  const incr = ctx.rng.rn2(200) + 250 - 125 * bcsign(buc); // rn1(200, 250 - 125 * bcsign)
  makeBlinded(ctx, timeoutLeft(ctx.state, hero, P.BLINDED) + incr, !blind);
  return { unknown: false, nothing: blind };
}

/**
 * ref: src/potion.c peffect_hallucination(). Not ported: Halluc_resistance (no Grayswandir) and
 * the enlightenment ("You perceive yourself..."), whose 1 in 3 / 1 in 6 roll is still made.
 */
function peffectHallucination(ctx: Ctx, p: Entity): Effect {
  const hero = heroEntity(ctx);
  const buc = p.c.item?.buc ?? 'uncursed';
  const nothing = hasProp(hero, P.HALLUC);
  const incr = ctx.rng.rn2(200) + 600 - 300 * bcsign(buc); // rn1(200, 600 - 300 * bcsign)
  makeHallucinated(ctx, timeoutLeft(ctx.state, hero, P.HALLUC) + incr, true);
  if (buc === 'blessed') ctx.rng.rn2(3);
  else if (buc !== 'cursed') ctx.rng.rn2(6);
  return { unknown: false, nothing };
}

/** ref: src/potion.c peffect_booze() (potions are never diluted; no exercise) */
function peffectBooze(ctx: Ctx, p: Entity): Effect {
  const hero = heroEntity(ctx);
  const buc = p.c.item?.buc ?? 'uncursed';
  msg(ctx, hasProp(hero, P.HALLUC) ? 'potion.booze_dandelion' : 'potion.booze_fire');
  if (buc !== 'blessed') {
    // booze hits harder if drinking on an empty stomach
    const uhs = HUNGER_INDEX[hero.c.hunger?.state ?? 'not_hungry'] ?? 1;
    makeConfused(ctx, timeoutLeft(ctx.state, hero, P.CONFUSION) + ctx.rng.d(2 + uhs, 8), false);
  }
  healup(ctx, 1, 0, false, false); // the whiskey makes us feel better
  addNutrition(ctx, 10 * (2 + bcsign(buc)));
  if (buc === 'cursed') {
    msg(ctx, 'potion.pass_out');
    nomulNow(ctx, ctx.rng.rnd(15), 'helpless.passed_out', { key: 'potion.awake_headache' });
  }
  return { unknown: true };
}

/** ref: src/potion.c peffect_sleeping() with fall_asleep() */
function peffectSleeping(ctx: Ctx, p: Entity): Effect {
  const hero = heroEntity(ctx);
  const buc = p.c.item?.buc ?? 'uncursed';
  if (hasProp(hero, P.SLEEP_RES) || hasProp(hero, P.FREE_ACTION)) msg(ctx, 'potion.yawn');
  else {
    msg(ctx, 'potion.fall_asleep');
    const turns = ctx.rng.rn2(10) + 25 - 12 * bcsign(buc); // rn1(10, 25 - 12 * bcsign(otmp))
    nomulNow(ctx, turns, 'helpless.asleep', { key: 'eat.wake_up' });
  }
  return { unknown: false };
}

/** ref: src/potion.c peffect_healing() */
function peffectHealing(ctx: Ctx, p: Entity): Effect {
  const buc = p.c.item?.buc ?? 'uncursed';
  msg(ctx, 'potion.better');
  healup(
    ctx,
    8 + ctx.rng.d(4 + 2 * bcsign(buc), 4),
    buc !== 'cursed' ? 1 : 0,
    buc === 'blessed',
    buc !== 'cursed',
  );
  return { unknown: false };
}

/** ref: src/potion.c peffect_extra_healing() */
function peffectExtraHealing(ctx: Ctx, p: Entity): Effect {
  const buc = p.c.item?.buc ?? 'uncursed';
  msg(ctx, 'potion.much_better');
  healup(
    ctx,
    16 + ctx.rng.d(4 + 2 * bcsign(buc), 8),
    buc === 'blessed' ? 5 : buc !== 'cursed' ? 2 : 0,
    buc !== 'cursed',
    true,
  );
  return { unknown: false };
}

/**
 * ref: src/potion.c peffect_full_healing(): a blessed one restores one lost level ("when
 * multiple levels have been lost, drinking multiple potions will only get half of them back").
 * Not ported: wounded legs, hallucination.
 */
function peffectFullHealing(ctx: Ctx, p: Entity): Effect {
  const buc = p.c.item?.buc ?? 'uncursed';
  msg(ctx, 'potion.completely_healed');
  healup(ctx, 400, 4 + 4 * bcsign(buc), buc !== 'cursed', true);
  const h = heroEntity(ctx);
  const xp = h.c.experience;
  if (buc === 'blessed' && xp && xp.level < ulevelmax(ctx, xp.level)) {
    setUlevelmax(ctx, ulevelmax(ctx, xp.level) - 1, xp.level);
    pluslvl(ctx, h.id, false);
  }
  return { unknown: false };
}

/**
 * ref: src/potion.c peffect_invisibility() (the potion: the spell is not in the subset). A
 * blessed potion may make it permanent; a cursed one aggravates and takes permanent invisibility
 * away, leaving the timed part.
 */
function peffectInvisibility(ctx: Ctx, p: Entity): Effect {
  const buc = p.c.item?.buc ?? 'uncursed';
  const h = heroEntity(ctx);
  let nothing = false;
  if (heroInvisible(ctx.state) || hasProp(h, P.BLINDED) || heroInvisBlocked(ctx.state))
    nothing = true;
  else selfInvisMessage(ctx);
  if (buc === 'blessed' && !ctx.rng.rn2(hasIntrinsic(h, P.INVIS) || hInvisTimed(ctx) ? 15 : 30))
    setIntrinsic(h, P.INVIS, true);
  else incrItimeout(ctx.state, h, P.INVIS, ctx.rng.d(6 - 3 * bcsign(buc), 100) + 100);
  if (buc === 'cursed') {
    msg(ctx, 'potion.presence_known');
    aggravate(ctx);
    // temporary invisibility, but no permanent invisibility
    setIntrinsic(h, P.INVIS, false);
  }
  return nothing ? { unknown: false, nothing: true } : { unknown: false };
}

/** HInvis's timed part (C's HInvis is nonzero for either part). */
const hInvisTimed = (ctx: Ctx): boolean => timeoutLeft(ctx.state, heroEntity(ctx), P.INVIS) > 0;

/**
 * ref: src/potion.c peffect_see_invisible(): the taste (no diluted potions, no hallucinated
 * wording; fruit juice only feeds her), sight restored unless cursed, then permanent (blessed,
 * sometimes) or timed see invisible; seeing herself invisible identifies it.
 */
function peffectSeeInvisible(ctx: Ctx, p: Entity): Effect {
  const buc = p.c.item?.buc ?? 'uncursed';
  const h = heroEntity(ctx);
  const showMsg = cantSeeSelf(ctx.state) && !hasProp(h, P.BLINDED);
  const hInvis = hasIntrinsic(h, P.INVIS) || hInvisTimed(ctx);
  const hSee = hasIntrinsic(h, P.SEE_INVIS) || timeoutLeft(ctx.state, h, P.SEE_INVIS) > 0;
  const permchance = 10 - (hInvis ? 3 : 0) - (hSee ? 6 : 0);
  let unknown = true;
  msg(ctx, buc === 'cursed' ? 'potion.tastes_rotten' : 'potion.tastes_juice');
  if (p.def === POT_FRUIT_JUICE) {
    addNutrition(ctx, 10 * (2 + bcsign(buc)));
    return { unknown: true };
  }
  // tell them they can see again immediately, which will help them identify the potion
  if (buc !== 'cursed') makeBlinded(ctx, 0, true);
  if (buc === 'blessed' && !ctx.rng.rn2(permchance)) setIntrinsic(h, P.SEE_INVIS, true);
  else incrItimeout(ctx.state, h, P.SEE_INVIS, ctx.rng.rn2(100) + 750); // rn1(100, 750)
  // see_monsters(): the next snapshot shows invisible monsters
  if (showMsg && !hasProp(h, P.BLINDED)) {
    msg(ctx, 'potion.see_through_visible');
    unknown = false;
  }
  return { unknown };
}

/**
 * ref: src/potion.c peffect_water(). The hero is neutral and alive, so the chaotic and undead
 * branches do not apply: holy water is "full of awe" (and cures lycanthropy: "You feel
 * purified."), unholy "full of dread", plain water feeds a little (and identifies the type).
 */
function peffectWater(ctx: Ctx, p: Entity): Effect {
  const buc = p.c.item?.buc ?? 'uncursed';
  if (buc === 'uncursed') {
    msg(ctx, 'potion.water_plain');
    addNutrition(ctx, ctx.rng.rnd(10));
    return { unknown: false };
  }
  if (buc === 'blessed') {
    msg(ctx, 'potion.water_holy');
    cureSick(ctx);
    if (ulycn(ctx.state) !== null) youUnwere(ctx, true); // "Purified"
  } else if (uState(ctx.state).alignType === 1) {
    // lawful heroes are burned; unreachable while the hero is neutral
    msg(ctx, 'potion.water_burns');
    const hp = heroEntity(ctx).c.hp;
    if (hp) hp.cur -= ctx.rng.d(2, 6);
  } else msg(ctx, 'potion.water_unholy');
  // unholy water and a lycanthrope in her own form: she turns into the beast
  if (buc === 'cursed' && ulycn(ctx.state) !== null && !upolyd(ctx.state)) youWere(ctx);
  return { unknown: true };
}

/**
 * "You feel a little strange." and, unless Unchanging, she polymorphs; a blessed one gives
 * control (a low one) when she is in her own form, and the form lasts rn2(15) + 10 turns at most.
 * ref: src/potion.c peffect_polymorph()
 */
function peffectPolymorph(ctx: Ctx, p: Entity): Effect {
  const h = heroEntity(ctx);
  msg(ctx, hasProp(h, P.HALLUC) ? 'poly.potion.halluc' : 'poly.potion');
  if (!hasProp(h, P.UNCHANGING)) {
    if (p.c.item?.buc !== 'blessed' || upolyd(ctx.state)) polyself(ctx);
    // controlled, then the form's time capped (after the prompt's answer)
    else polyself(ctx, { controlled: true, low: true, cap: true });
  }
  return { unknown: false };
}

/** stairway_at(u.ux, u.uy)->up */
function upStairsHere(ctx: Ctx): boolean {
  const pos = heroEntity(ctx).c.pos;
  if (!pos) return false;
  const level = getLevel(ctx.state);
  const id = level.palette[level.cells[cellIndex(level, pos.x, pos.y)] ?? 0];
  return id !== undefined && ctx.defs.terrain(id).stairs === 'up';
}

/** The attributes in C's A_STR..A_CHA order (rn2(A_MAX) picks among them). */
const ATTRS: readonly Attr[] = ['str', 'int', 'wis', 'dex', 'con', 'cha'];

/**
 * Troubles the potion of restore ability cannot fix (a blessed one then says "better", not
 * "great"). ref: src/apply.c unfixable_trouble_count(FALSE) (no Wounded_legs Dex loss, no
 * deafness)
 */
function unfixableTroubleCount(ctx: Ctx): number {
  const h = heroEntity(ctx);
  const hd = hungerData(ctx);
  const uhs = HUNGER_INDEX[h.c.hunger?.state ?? 'not_hungry'] ?? 1;
  let n = 0;
  if (isStoned(ctx.state)) n++;
  if (isSlimed(ctx.state)) n++;
  if (isStrangled(h)) n++;
  if (hd.strLoss > 0 && uhs >= HUNGER_INDEX['weak']!) n++;
  if (hd.sick) n++;
  if (hasProp(h, P.STUNNED)) n++;
  if (hasProp(h, P.CONFUSION)) n++;
  if (hasProp(h, P.HALLUC)) n++;
  if (hd.vomiting > 0) n++;
  return n;
}

/**
 * Cursed: "Ulch!  This makes you feel mediocre!". Else every lost attribute (the first one found
 * from a random start unless blessed) goes back up to its peak (AMAX), even under sustain
 * ability, and lost experience levels come back (one, or all when blessed).
 * ref: src/potion.c peffect_restore_ability()
 */
function peffectRestoreAbility(ctx: Ctx, p: Entity): Effect {
  const buc = p.c.item?.buc ?? 'uncursed';
  if (buc === 'cursed') {
    msg(ctx, 'potion.ulch_mediocre');
    return { unknown: true };
  }
  const blessed = buc === 'blessed';
  msg(
    ctx,
    !blessed
      ? 'potion.wow_good'
      : unfixableTroubleCount(ctx)
        ? 'potion.wow_better'
        : 'potion.wow_great',
  );
  let i = ctx.rng.rn2(ATTRS.length); // start at a random point
  for (let ii = 0; ii < ATTRS.length; ii++) {
    const k = ATTRS[i] as Attr;
    if (abase(ctx.state, k) < amax(ctx.state, k)) {
      restoreAttr(ctx, k);
      if (!blessed) break; // only first found if not blessed
    }
    if (++i >= ATTRS.length) i = 0;
  }
  // the potion (not the spell) also restores lost levels
  const h = heroEntity(ctx);
  const xp = h.c.experience;
  if (p.def === POT_RESTORE_ABILITY && xp && xp.level < ulevelmax(ctx, xp.level)) {
    do pluslvl(ctx, h.id, false);
    while (xp.level < ulevelmax(ctx, xp.level) && blessed);
  }
  return { unknown: true };
}

/**
 * Cursed: "You have an uneasy feeling..."; else (blessed: Int and Wis +1 first) the
 * enlightenment. ref: src/potion.c peffect_enlightenment()
 */
function peffectEnlightenment(ctx: Ctx, p: Entity): Effect {
  const buc = p.c.item?.buc ?? 'uncursed';
  if (buc === 'cursed') {
    msg(ctx, 'potion.uneasy_dots');
    return { unknown: true };
  }
  if (buc === 'blessed') {
    adjattrib(ctx, 'int', 1, 'always');
    adjattrib(ctx, 'wis', 1, 'always');
  }
  doEnlightenmentEffect(ctx);
  return { unknown: false };
}

/**
 * Unless she has free action ("You stiffen momentarily."), her feet are frozen to the floor
 * ("You are motionlessly suspended." while levitating) for rn1(10, 25 - 12 * bcsign) turns.
 * ref: src/potion.c peffect_paralysis()
 */
function peffectParalysis(ctx: Ctx, p: Entity): Effect {
  const h = heroEntity(ctx);
  if (hasProp(h, P.FREE_ACTION)) msg(ctx, 'potion.stiffen');
  else {
    if (levitating(ctx)) msg(ctx, 'potion.suspended');
    else {
      const pos = h.c.pos;
      const level = getLevel(ctx.state);
      ctx.emit({
        type: 'msg',
        key: 'potion.feet_frozen',
        params: { surface: pos ? surfaceKey(ctx, level, pos.x, pos.y) : '@surface.floor' },
      });
    }
    const turns = ctx.rng.rn2(10) + 25 - 12 * bcsign(p.c.item?.buc ?? 'uncursed');
    nomulNow(ctx, turns, 'helpless.frozen_potion', { key: 'eat.can_move_again' });
  }
  return { unknown: false };
}

/**
 * Detect monsters (a blessed potion acts as an uncursed one: there is no timed Detect_monsters
 * yet, DEVIATIONS); a cursed one wakes them. On a level without monsters: "You feel threatened."
 * and the potion is used up unidentified. ref: src/potion.c peffect_monster_detection(),
 * src/detect.c monster_detect()
 */
function peffectMonsterDetection(ctx: Ctx, p: Entity): Effect {
  if (monsterDetect(ctx, p.c.item?.buc === 'cursed')) {
    const halluc = hasProp(heroEntity(ctx), P.HALLUC);
    strangeFeeling(ctx, p.id, halluc ? 'cast.heebie_jeebies' : 'spell.threatened');
    return { unknown: true, consumed: true };
  }
  return { unknown: false };
}

/**
 * "Yecch!  This stuff tastes like poison.": blessed, only stale fruit juice (1 HP); else an
 * attribute is poisoned (unless sustained) and she loses hit points (less with poison
 * resistance); it shocks her out of hallucination. She is no Healer. ref: src/potion.c
 * peffect_sickness()
 */
function peffectSickness(ctx: Ctx, p: Entity): Effect {
  const h = heroEntity(ctx);
  const buc = p.c.item?.buc ?? 'uncursed';
  msg(ctx, 'potion.tastes_poison');
  if (buc === 'blessed') {
    msg(ctx, 'potion.mildly_stale');
    losehp(ctx, 1, '@killer.potion.mildly_contaminated');
  } else {
    const resists = hasProp(h, P.POISON_RES);
    if (resists) msg(ctx, 'potion.biologically_contaminated');
    const typ = ATTRS[ctx.rng.rn2(ATTRS.length)] as Attr;
    const killer = resists ? '@killer.potion.mildly_contaminated' : '@killer.potion.contaminated';
    if (!hasProp(h, P.FIXED_ABIL)) {
      poisontell(ctx, typ, false);
      adjattrib(ctx, typ, resists ? -1 : -(ctx.rng.rn2(4) + 3), false);
    }
    if (!resists) losehp(ctx, ctx.rng.rnd(10) + (buc === 'cursed' ? 5 : 0), killer);
    // rnd loss is so that unblessed poorer than blessed
    else losehp(ctx, 1 + ctx.rng.rn2(2), killer);
  }
  if (ctx.state.gameOver) return { unknown: false };
  if (hasProp(heroEntity(ctx), P.HALLUC)) {
    msg(ctx, 'potion.shocked_senses');
    makeHallucinated(ctx, 0, false);
  }
  return { unknown: false };
}

/**
 * Cursed: "Ulch!  That potion tasted foul!"; else one attribute up (up to six random tries,
 * the last saying why it failed), or every one when blessed; nothing under sustain ability.
 * ref: src/potion.c peffect_gain_ability()
 */
function peffectGainAbility(ctx: Ctx, p: Entity): Effect {
  const buc = p.c.item?.buc ?? 'uncursed';
  if (buc === 'cursed') {
    msg(ctx, 'potion.tasted_foul');
    return { unknown: true };
  }
  if (hasProp(heroEntity(ctx), P.FIXED_ABIL)) return { unknown: false, nothing: true };
  const blessed = buc === 'blessed';
  let i = -1;
  for (let ii = ATTRS.length; ii > 0; ii--) {
    i = blessed ? i + 1 : ctx.rng.rn2(ATTRS.length);
    // only give "your X is already as high as it can get" on the last attempt (except blessed)
    const m = blessed || ii === 1 ? 'always' : true;
    if (adjattrib(ctx, ATTRS[i] as Attr, 1, m) && !blessed) break;
  }
  return { unknown: false };
}

/**
 * Heals wounded legs instead (unless cursed); else very fast for a while and, unless cursed,
 * intrinsically fast: "Your quickness feels very natural." ref: src/potion.c peffect_speed()
 */
function peffectSpeed(ctx: Ctx, p: Entity): Effect {
  const h = heroEntity(ctx);
  const buc = p.c.item?.buc ?? 'uncursed';
  if (hasProp(h, P.WOUNDED_LEGS) && buc !== 'cursed') {
    // heal_legs(0) (only the right leg is ever hurt)
    setItimeout(ctx.state, h, P.WOUNDED_LEGS, 0);
    msg(ctx, 'timeout.legs_better');
    return { unknown: true };
  }
  speedUp(ctx, ctx.rng.rn2(10) + 100 + 60 * bcsign(buc));
  if (buc !== 'cursed' && !hasIntrinsic(h, P.FAST) && !hasFromForm(h, P.FAST)) {
    msg(ctx, 'potion.quickness_natural');
    setIntrinsic(h, P.FAST, true);
  }
  return { unknown: false };
}

/**
 * She is very fast for `duration` more turns: "You are suddenly moving much faster." (just
 * "faster" when already Fast), "Your legs get new energy." when already very fast (a timed Fast
 * or speed boots). ref: src/potion.c speed_up() (no exercise)
 */
export function speedUp(ctx: Ctx, duration: number): void {
  const h = heroEntity(ctx);
  const veryFast = timeoutLeft(ctx.state, h, P.FAST) > 0 || hasExtrinsic(h, P.FAST);
  if (!veryFast) msg(ctx, hasProp(h, P.FAST) ? 'zap.speed.faster' : 'zap.speed.much_faster');
  else msg(ctx, 'zap.speed.legs');
  incrItimeout(ctx.state, h, P.FAST, duration);
}

/**
 * Cursed: she rises through the ceiling to the level above (not from the first level, which
 * would need the Amulet, nor in Sokoban: "You have an uneasy feeling."). Else one experience
 * level; blessed puts her at a random point of the new level's range.
 * ref: src/potion.c peffect_gain_level(), src/dungeon.c Can_rise_up()
 */
function peffectGainLevel(ctx: Ctx, p: Entity): Effect {
  const h = heroEntity(ctx);
  const buc = p.c.item?.buc ?? 'uncursed';
  if (buc === 'cursed') {
    const level = getLevel(ctx.state);
    const layout = dungeonLayout(ctx.state, level.dungeon);
    // ledger 1 is the main dungeon's first level; other dungeons enter at their first level
    const canRise = !isSokoban(level) && (level.dlevel > 1 || layout.depthStart > 1);
    if (!canRise) {
      msg(ctx, 'potion.uneasy');
      return { unknown: true };
    }
    const depth = layout.depthStart + level.dlevel - 1;
    const to = levelAtDepth(ctx, level, depth - 1);
    if (to.dungeon === level.dungeon && to.dlevel === level.dlevel) {
      msg(ctx, 'potion.tasted_bad');
      return { unknown: true };
    }
    const pos = h.c.pos;
    ctx.emit({
      type: 'msg',
      key: 'potion.rise_up',
      params: {
        ceiling: { key: pos ? ceilingKey(ctx, level, pos.x, pos.y) : 'earth.ceiling.ceiling' },
      },
    });
    ctx.goToLevel(to, 'random'); // goto_level(): u_on_rndspot(), pickup(1)
    if (!ctx.state.gameOver) lookHere(ctx);
    return { unknown: true };
  }
  pluslvl(ctx, h.id, false);
  // blessed potions place you at a random spot in the middle of the new level
  const xp = h.c.experience;
  if (buc === 'blessed' && xp) xp.points = rndexp(ctx, xp.level, xp.points, true);
  return { unknown: false };
}

/**
 * Energy: d(3/2/1, 6) to the maximum (taken away when cursed: "You feel lackluster."), three
 * times that to the current. ref: src/potion.c peffect_gain_energy() (no exercise)
 */
function peffectGainEnergy(ctx: Ctx, p: Entity): Effect {
  const buc = p.c.item?.buc ?? 'uncursed';
  msg(ctx, buc === 'cursed' ? 'potion.lackluster' : 'potion.magical_energies');
  let num = ctx.rng.d(buc === 'blessed' ? 3 : buc !== 'cursed' ? 2 : 1, 6);
  if (buc === 'cursed') num = -num; // subtract instead of add when cursed
  const pw = pwOf(ctx.state);
  let uenmax = pw.uenmax + num;
  let uenpeak = pw.uenpeak;
  if (uenmax > uenpeak) uenpeak = uenmax;
  else if (uenmax <= 0) uenmax = 0;
  let uen = pw.uen + 3 * num;
  if (uen > uenmax) uen = uenmax;
  else if (uen <= 0) uen = 0;
  setPw(ctx, { uen, uenmax, uenpeak });
  return { unknown: false };
}

/**
 * She starts to float (unless she already is: nothing new). Cursed: no coming down at will, and
 * she goes up the stairs she is on or hits her head on the ceiling; blessed: 250..299 more turns,
 * ended at will with `>`; uncursed: 10..149. The timeout's end brings her down.
 * ref: src/potion.c peffect_levitation() (no sinks, air or water levels)
 */
function peffectLevitation(ctx: Ctx, p: Entity): Effect {
  const h = heroEntity(ctx);
  const buc = p.c.item?.buc ?? 'uncursed';
  let nothing = false;
  // !Levitation && !BLevitation: BLevitation is only set while she has the property
  if (!hasProp(h, P.LEVITATION)) {
    // kludge to ensure proper operation of float_up(); a cursed one floats down next turn
    setItimeout(ctx.state, h, P.LEVITATION, 1);
    floatUp(ctx);
  } else nothing = true; // already levitating, or can't levitate
  if (buc === 'cursed') {
    setLevAtWill(ctx, false); // can't descend upon demand
    if (!levitating(ctx)) {
      // rising via levitation is blocked
    } else if (upStairsHere(ctx)) {
      const up = ctx.defs.actions.find((a) => a.id === 'nh:up');
      up?.perform(ctx, { type: 'mod', action: 'nh:up' }); // doup()
      nothing = false; // not nothing after all
    } else {
      // has_ceiling(): every level here has one
      const helm = wornIn(ctx.state, h.id, 'helm');
      const dmg = ctx.rng.rnd(!helm ? 10 : !hardHelmet(ctx.defs.object(helm.def)) ? 6 : 3);
      const pos = h.c.pos;
      const level = getLevel(ctx.state);
      ctx.emit({
        type: 'msg',
        key: 'potion.hit_head',
        params: {
          ceiling: { key: pos ? ceilingKey(ctx, level, pos.x, pos.y) : 'earth.ceiling.ceiling' },
        },
      });
      losehp(ctx, dmg, '@killer.potion.ceiling');
      nothing = false;
    }
  } else if (buc === 'blessed') {
    // at this point, timeout is already at least 1
    incrItimeout(ctx.state, h, P.LEVITATION, ctx.rng.rn2(50) + 250);
    // can descend at will (stop levitating via '>')
    setLevAtWill(ctx, true);
  } else incrItimeout(ctx.state, h, P.LEVITATION, ctx.rng.rn2(140) + 10);
  return nothing ? { unknown: false, nothing: true } : { unknown: false };
}

/**
 * "This burns!" (a little when blessed, a lot when cursed) unless acid resistant ("This tastes
 * sour."); it cures stoning. ref: src/potion.c peffect_acid() (no Half_physical_damage, no
 * exercise)
 */
function peffectAcid(ctx: Ctx, p: Entity): Effect {
  const h = heroEntity(ctx);
  const buc = p.c.item?.buc ?? 'uncursed';
  if (hasProp(h, P.ACID_RES)) {
    // not necessarily a creature who _likes_ acid
    msg(ctx, hasProp(h, P.HALLUC) ? 'potion.tastes_tangy' : 'potion.tastes_sour');
  } else {
    msg(
      ctx,
      buc === 'blessed'
        ? 'potion.burns_little'
        : buc === 'cursed'
          ? 'potion.burns_lot'
          : 'potion.burns_acid',
    );
    const dmg = ctx.rng.d(buc === 'cursed' ? 2 : 1, buc === 'blessed' ? 4 : 8);
    losehp(ctx, dmg, '@killer.potion.acid');
  }
  if (!ctx.state.gameOver && isStoned(ctx.state)) fixPetrification(ctx);
  return { unknown: true }; // holy/unholy water can burn like acid too
}

/** ref: src/potion.c peffects() for the potions in our subset. */
function peffects(ctx: Ctx, p: Entity): Effect {
  switch (p.def) {
    case 'nh:potion_of_confusion':
      return peffectConfusion(ctx, p);
    case 'nh:potion_of_blindness':
      return peffectBlindness(ctx, p);
    case 'nh:potion_of_hallucination':
      return peffectHallucination(ctx, p);
    case 'nh:potion_of_booze':
      return peffectBooze(ctx, p);
    case 'nh:potion_of_sleeping':
      return peffectSleeping(ctx, p);
    case 'nh:potion_of_healing':
      return peffectHealing(ctx, p);
    case 'nh:potion_of_extra_healing':
      return peffectExtraHealing(ctx, p);
    case 'nh:potion_of_full_healing':
      return peffectFullHealing(ctx, p);
    case 'nh:potion_of_invisibility':
      return peffectInvisibility(ctx, p);
    case 'nh:potion_of_see_invisible':
      return peffectSeeInvisible(ctx, p);
    case 'nh:potion_of_polymorph':
      return peffectPolymorph(ctx, p);
    case 'nh:potion_of_water':
      return peffectWater(ctx, p);
    case 'nh:potion_of_restore_ability':
      return peffectRestoreAbility(ctx, p);
    case 'nh:potion_of_enlightenment':
      return peffectEnlightenment(ctx, p);
    case 'nh:potion_of_fruit_juice':
      return peffectSeeInvisible(ctx, p); // tastes like fruit juice in Rogue
    case 'nh:potion_of_paralysis':
      return peffectParalysis(ctx, p);
    case 'nh:potion_of_monster_detection':
      return peffectMonsterDetection(ctx, p);
    case 'nh:potion_of_sickness':
      return peffectSickness(ctx, p);
    case 'nh:potion_of_gain_ability':
      return peffectGainAbility(ctx, p);
    case 'nh:potion_of_speed':
      return peffectSpeed(ctx, p);
    case 'nh:potion_of_gain_level':
      return peffectGainLevel(ctx, p);
    case 'nh:potion_of_levitation':
      return peffectLevitation(ctx, p);
    case 'nh:potion_of_gain_energy':
      return peffectGainEnergy(ctx, p);
    case 'nh:potion_of_acid':
      return peffectAcid(ctx, p);
    default:
      return { unknown: true };
  }
}

/**
 * Drinks one potion of the stack: the effect, then discovery when the type was revealed, then
 * the potion is used up. ref: src/potion.c dopotion(). Not ported: the ghost in a milky potion
 * and the djinni in a smoky one, the score for identifying (more_experienced), and `trycall`
 * (naming an unidentified type).
 */
function dopotion(ctx: Ctx, _user: EntityId, itemId: EntityId): void {
  const p = ctx.state.entities[String(itemId)];
  if (!p?.c.item) return;
  const def = ctx.defs.object(p.def);
  const wasKnown = isKnown(ctx.state, ctx.defs, def);
  const eff = peffects(ctx, p);
  if (eff.consumed) return;
  let unknown = eff.unknown;
  if (eff.nothing) {
    unknown = true;
    msg(ctx, hasProp(heroEntity(ctx), P.HALLUC) ? 'potion.normal_feeling' : 'potion.peculiar');
  }
  if (!wasKnown && !unknown) {
    discover(ctx, def);
    moreExperienced(ctx, 0, 10); // ref: src/potion.c dodrink()
  }
  useup(ctx, itemId);
}

/** `use` for every potion in the subset (attached to the defs in index.ts). */
export const POTION_USES: Readonly<
  Record<string, (ctx: Ctx, user: EntityId, item: EntityId) => void>
> = {
  'nh:potion_of_confusion': dopotion,
  'nh:potion_of_blindness': dopotion,
  'nh:potion_of_hallucination': dopotion,
  'nh:potion_of_booze': dopotion,
  'nh:potion_of_sleeping': dopotion,
  'nh:potion_of_healing': dopotion,
  'nh:potion_of_extra_healing': dopotion,
  'nh:potion_of_full_healing': dopotion,
  'nh:potion_of_invisibility': dopotion,
  'nh:potion_of_see_invisible': dopotion,
  'nh:potion_of_polymorph': dopotion,
  'nh:potion_of_water': dopotion,
  'nh:potion_of_gain_ability': dopotion,
  'nh:potion_of_restore_ability': dopotion,
  'nh:potion_of_paralysis': dopotion,
  'nh:potion_of_speed': dopotion,
  'nh:potion_of_levitation': dopotion,
  'nh:potion_of_gain_level': dopotion,
  'nh:potion_of_enlightenment': dopotion,
  'nh:potion_of_monster_detection': dopotion,
  'nh:potion_of_gain_energy': dopotion,
  'nh:potion_of_sickness': dopotion,
  'nh:potion_of_fruit_juice': dopotion,
  'nh:potion_of_acid': dopotion,
};

const heroItem = (ctx: Ctx, id: unknown): Entity | null => {
  if (typeof id !== 'number') return null;
  const e = ctx.state.entities[String(id)];
  return e?.c.item?.carriedBy === ctx.state.playerId ? e : null;
};

function itemArg(action: PlayerAction): unknown {
  return action.type === 'mod' ? (action.args as { item?: unknown } | undefined)?.item : undefined;
}

export const QUAFF_ID: DefId = 'nh:quaff';

const quaff: ActionDef = {
  id: QUAFF_ID,
  labelKey: 'action.nh:quaff',
  handles: 'mod',
  offer(ctx, target): Offer[] {
    // "Drink from the fountain?" comes before the inventory (ref: dodrink())
    if (target.kind === 'self')
      return heroOnFountain(ctx)
        ? [
            {
              action: { type: 'mod', action: QUAFF_ID, args: { fountain: true } },
              labelKey: 'action.nh:quaff.fountain',
            },
          ]
        : [];
    if (target.kind !== 'item') return [];
    const e = heroItem(ctx, target.id);
    if (!e || ctx.defs.object(e.def).class !== 'potion') return [];
    return [
      {
        action: { type: 'mod', action: QUAFF_ID, args: { item: e.id } },
        labelKey: 'action.nh:quaff',
      },
    ];
  },
  // ref: src/potion.c dodrink() (no sinks; drinking from a fountain: fountain.ts)
  perform(ctx, action) {
    if (action.type === 'mod' && (action.args as { fountain?: unknown } | undefined)?.fountain)
      return drinkfountain(ctx, QUAFF_ID);
    const e = heroItem(ctx, itemArg(action));
    if (!e) return 0;
    const def = ctx.defs.object(e.def);
    if (def.class !== 'potion' || !def.use) {
      ctx.emit({ type: 'msg', key: 'magic.silly_thing', params: { verb: { key: 'verb.drink' } } });
      return 0;
    }
    def.use(ctx, ctx.state.playerId, e.id);
    encumberMsg(ctx);
    return NORMAL_SPEED;
  },
  // a water demon's wish (the only prompt a drink asks)
  answer: (ctx, value, data) => answerFountainWish(ctx, QUAFF_ID, value, data),
};

export const POTION_ACTIONS: readonly ActionDef[] = [quaff];
