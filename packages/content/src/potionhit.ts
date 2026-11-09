// Potions that break: on the hero or a monster (thrown by her, by a monster, or propelled), and
// the vapors she breathes from a breaking potion nearby (or a boiled or shattered one).
// ref: src/potion.c potionhit(), potionbreathe(), bottlename(); src/dothrow.c breakobj()
// (POT_WATER, "really, all potions")
//
// Not ported: the potion of oil (no such object), saddles (no steeds), wet towels
// (Half_gas_damage: no towels), the polymorphed gremlin hero splitting in water vapor (split_mon()
// is for monsters only), deafness (make_deaf()), exercise(), Half_physical_damage, trycall()
// (naming unknown types), hallucinatory bottle names, Pestilence, vampire shapeshifters,
// Protection_from_shape_changers (no such ring), body parts of polymorphed forms (always "head"
// and "eyes") and a hit on a long worm's tail (gn.notonhead: always the head).
import { getPlayer, isVisible, type Ctx, type Entity, type Msg } from '@nh/core';
import { abase, amax, setAbase, type Attr } from './attrib';
import { unaware } from './btrapped';
import { killedByHero, resist, resistsMagm, sleepMonst, sleptMonst } from './buzz';
import { splitMon } from './clone';
import { engulfingU } from './engulfstate';
import { setPotionbreathe } from './erode';
import { eshkOf, shopKeeper, uShops } from './eshk';
import { losehp } from './hp';
import { nomulNow } from './hunger';
import { canseemon, monInvisible, mapInvisible, setMinvis } from './invis';
import { monkilled } from './mondeath';
import { hasHead } from './mondata';
import {
  healmon,
  isFrozen,
  mblinded,
  mcansee,
  monAdjustSpeed,
  paralyzeMonst,
  setMConfused,
  setMblinded,
} from './mstate';
import { M_SEEN, mcureblindness, monstseesu } from './musestate';
import { newcham } from './newcham';
import { wakeNearto } from './noise';
import { discover } from './o_init';
import { xnameOf } from './objnam';
import { wakeup } from './peaceful';
import { canSpotMon, monNam } from './perception';
import { polyself, youWere } from './polyself';
import { isUnpaid } from './price';
import { P, hasProp, incrItimeout, makeBlinded, makeConfused, timeoutLeft } from './props';
import { stolenValue, subfrombill } from './shk';
import { heroForm, heroFormId, ownHp, upolyd } from './upoly';
import { newWere } from './were';
import { isWere, ulycn, youUnwere } from './werestate';

/** Who threw the potion. ref: include/hack.h POTHIT_HERO_THROW, _MONST_THROW, _OTHER_THROW */
export type PotionHow = 'hero_thrown' | 'mon_thrown' | 'other';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/** ref: src/potion.c bottlenames[] (as force.ts) */
const BOTTLES = 7;

const ATTRS: readonly Attr[] = ['str', 'int', 'wis', 'dex', 'con', 'cha'];

const POT = {
  restoreAbility: 'nh:potion_of_restore_ability',
  gainAbility: 'nh:potion_of_gain_ability',
  fullHealing: 'nh:potion_of_full_healing',
  extraHealing: 'nh:potion_of_extra_healing',
  healing: 'nh:potion_of_healing',
  sickness: 'nh:potion_of_sickness',
  hallucination: 'nh:potion_of_hallucination',
  confusion: 'nh:potion_of_confusion',
  booze: 'nh:potion_of_booze',
  invisibility: 'nh:potion_of_invisibility',
  paralysis: 'nh:potion_of_paralysis',
  sleeping: 'nh:potion_of_sleeping',
  speed: 'nh:potion_of_speed',
  blindness: 'nh:potion_of_blindness',
  water: 'nh:potion_of_water',
  acid: 'nh:potion_of_acid',
  polymorph: 'nh:potion_of_polymorph',
} as const;

const dist2 = (x1: number, y1: number, x2: number, y2: number): number =>
  (x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2);

/** cansee(x, y) on the hero's level */
function canseeAt(ctx: Ctx, x: number, y: number): boolean {
  const level = ctx.state.levels[ctx.state.currentLevel];
  if (!level || x < 0 || y < 0 || x >= level.width || y >= level.height) return false;
  return isVisible(ctx.state, y * level.width + x);
}

/** `breathless(youmonst.data)`: her form does not breathe (her own form does) */
const uBreathless = (ctx: Ctx): boolean => heroForm(ctx)?.flags.includes('breathless') === true;
/** `haseyes(youmonst.data)` */
const uHasEyes = (ctx: Ctx): boolean => heroForm(ctx)?.flags.includes('noeyes') !== true;

/** ref: include/mondata.h mon_hates_blessings(): undead or demons (no vampshifters) */
const hatesBlessings = (ctx: Ctx, mon: Entity): boolean => {
  const f = ctx.defs.monster(mon.def).flags;
  return f.includes('undead') || f.includes('demon');
};

/** ref: include/mondata.h is_silent() */
const isSilent = (ctx: Ctx, mon: Entity): boolean =>
  (ctx.defs.monster(mon.def).sound ?? 'silent') === 'silent';

const alive = (ctx: Ctx, mon: Entity): boolean =>
  ctx.state.entities[String(mon.id)]?.c.monster !== undefined;

/**
 * The potion hits the hero or a monster and breaks: "The flask crashes on your head and breaks
 * into shards." (`rnd(2)` damage) or "The jar crashes on the jackal's head and breaks into
 * shards." ("Crash!" out of sight, and the monster may lose a hit point), "The potion
 * evaporates.", then its effect: on her polymorph and acid, on a monster C's cases (healing,
 * sickness, confusion, invisibility, sleeping, paralysis, speed, blindness, water, acid,
 * polymorph); a monster is woken (and angered when it was her potion, unless it helps). She
 * breathes the vapors when it broke on her, or by chance next to her. An unpaid potion is paid
 * for. The potion is used up. ref: src/potion.c potionhit()
 */
export function potionhit(ctx: Ctx, target: Entity | 'hero', obj: Entity, how: PotionHow): void {
  const bottle = { key: `force.bottle.${ctx.rng.rn2(BOTTLES)}` }; // bottlename()
  const hero = getPlayer(ctx.state);
  const hpos = hero.c.pos;
  const isyou = target === 'hero';
  const yourFault = how === 'hero_thrown';
  const it = obj.c.item;
  const buc = it?.buc ?? 'uncursed';
  let distance: number;
  let tx: number;
  let ty: number;
  if (isyou) {
    tx = hpos?.x ?? 0;
    ty = hpos?.y ?? 0;
    distance = 0;
    say(ctx, 'potionhit.crash_you', { bottle });
    losehp(
      ctx,
      ctx.rng.rnd(2),
      how === 'other' ? '@killer.potionhit.propelled' : '@killer.potionhit.thrown',
    );
  } else {
    const mon = target;
    tx = mon.c.pos?.x ?? 0;
    ty = mon.c.pos?.y ?? 0;
    distance = hpos ? dist2(tx, ty, hpos.x, hpos.y) : 99;
    if (!canseeAt(ctx, tx, ty)) say(ctx, 'potionhit.crash');
    else
      say(
        ctx,
        hasHead(ctx.defs.monster(mon.def)) ? 'potionhit.crash_mon_head' : 'potionhit.crash_mon',
        { bottle, mon: monNam(ctx, mon) },
      );
    const hp = mon.c.hp;
    if (ctx.rng.rn2(5) && hp && hp.cur > 1) hp.cur--;
  }
  if (ctx.state.gameOver) return;

  // (oil doesn't instantly evaporate: no oil)
  if (canseeAt(ctx, tx, ty))
    say(ctx, 'potionhit.evaporates', { item: xnameOf(ctx.state, ctx.defs, obj) });

  if (isyou) {
    switch (obj.def) {
      case POT.polymorph:
        say(ctx, hasProp(hero, P.HALLUC) ? 'poly.potion.halluc' : 'poly.potion');
        if (!hasProp(hero, P.UNCHANGING) && !hasProp(hero, P.ANTIMAGIC)) polyself(ctx);
        break;
      case POT.acid:
        if (!hasProp(hero, P.ACID_RES)) {
          say(
            ctx,
            buc === 'blessed'
              ? 'potion.burns_little'
              : buc === 'cursed'
                ? 'potion.burns_lot'
                : 'potionhit.burns',
          );
          const dmg = ctx.rng.d(buc === 'cursed' ? 2 : 1, buc === 'blessed' ? 4 : 8);
          losehp(ctx, dmg, '@killer.potion.acid');
        }
        break;
    }
  } else {
    monPotionEffect(ctx, target, obj, yourFault, tx, ty);
  }
  if (ctx.state.gameOver) return;

  // "Note: potionbreathe() does its own docall()"
  if (
    (distance === 0 ||
      (distance < 3 && !ctx.rng.rn2(Math.trunc((1 + (hero.c.attributes?.dex ?? 10)) / 2)))) &&
    (!uBreathless(ctx) || uHasEyes(ctx))
  )
    potionbreathe(ctx, obj);
  if (ctx.state.gameOver) return;

  // an unpaid potion: the hero's own throw is stolen, a monster's comes off the bill
  const shops = uShops(ctx);
  if (shops.length > 0 && isUnpaid(ctx.state, obj) && hpos) {
    const shk = shopKeeper(ctx, ctx.state.currentLevel, shops[0] ?? -1);
    if (shk !== null && eshkOf(ctx, shk)) {
      if (!yourFault) subfrombill(ctx, obj, shk);
      else {
        const peaceful = ctx.state.entities[String(shk)]?.c.monster?.peaceful === true;
        stolenValue(ctx, obj, hpos.x, hpos.y, peaceful, false);
      }
    }
  }
  if (ctx.state.entities[String(obj.id)]) ctx.remove(obj.id); // obfree()
}

/** The monster side of potionhit(). ref: src/potion.c potionhit() (`else` branch) */
function monPotionEffect(
  ctx: Ctx,
  mon: Entity,
  obj: Entity,
  yourFault: boolean,
  tx: number,
  ty: number,
): void {
  const m = mon.c.monster;
  const hp = mon.c.hp;
  if (!m) return;
  const def = ctx.defs.monster(mon.def);
  const buc = obj.c.item?.buc ?? 'uncursed';
  let angermon = yourFault;
  let cureblind = false;
  const doHealing = (): void => {
    angermon = false;
    if (hp && hp.cur < hp.max) {
      healmon(mon, hp.max, 0);
      if (canseemon(ctx, mon)) say(ctx, 'potionhit.sound_hale', { mon: monNam(ctx, mon) });
    }
    if (cureblind) mcureblindness(ctx, mon, canseemon(ctx, mon));
  };
  const killedBy = (fault: boolean): void => {
    if (fault) killedByHero(ctx, mon);
    else monkilled(ctx, mon.id, true);
  };
  switch (obj.def) {
    case POT.fullHealing:
    case POT.extraHealing:
    case POT.healing:
      if (obj.def === POT.fullHealing) cureblind = true;
      if (obj.def !== POT.healing && buc !== 'cursed') cureblind = true;
      if (buc === 'blessed') cureblind = true;
      doHealing();
      break;
    case POT.restoreAbility:
    case POT.gainAbility:
      doHealing();
      break;
    case POT.sickness:
      // (no Pestilence; AD_DISE and AD_PEST monsters are unharmed as the poison resistant)
      if (
        def.attacks.some((a) => a.ad === 'dise' || a.ad === 'pest') ||
        def.resists.includes('poison')
      ) {
        if (canseemon(ctx, mon)) say(ctx, 'potionhit.unharmed', { mon: monNam(ctx, mon) });
        break;
      }
      if (hp && hp.cur > 2) {
        hp.cur = Math.trunc(hp.cur / 2);
        if (canseemon(ctx, mon)) say(ctx, 'potionhit.rather_ill', { mon: monNam(ctx, mon) });
      }
      break;
    case POT.confusion:
    case POT.booze:
      if (!resist(ctx, mon, 0, 'potion')) setMConfused(ctx, mon.id, true);
      break;
    case POT.invisibility: {
      const sawit = canSpotMon(ctx, mon);
      const cursedPotion = buc === 'cursed';
      angermon = monInvisible(ctx, mon) && cursedPotion;
      setMinvis(ctx, mon, cursedPotion);
      if (sawit && !canSpotMon(ctx, mon)) {
        if (canseeAt(ctx, tx, ty)) mapInvisible(ctx, tx, ty);
      } else if (sawit && cursedPotion) {
        say(ctx, 'potionhit.briefly_transparent', { mon: monNam(ctx, mon) });
      } else if (!sawit && canSpotMon(ctx, mon)) {
        say(ctx, 'potionhit.appears', { mon: monNam(ctx, mon) });
      }
      break;
    }
    case POT.sleeping:
      // "wakeup() doesn't rouse victims of temporary sleep"
      if (sleepMonst(ctx, mon, ctx.rng.rnd(12), 'potion')) {
        say(ctx, 'potionhit.falls_asleep', { mon: monNam(ctx, mon) });
        sleptMonst(ctx, mon);
      }
      break;
    case POT.paralysis:
      if (!isFrozen(ctx, mon.id)) paralyzeMonst(ctx, mon.id, ctx.rng.rnd(25));
      break;
    case POT.speed:
      angermon = false;
      monAdjustSpeed(ctx, mon, 1);
      break;
    case POT.blindness:
      // haseyes() && !mon_perma_blind()
      if (
        !def.flags.includes('noeyes') &&
        !(!mcansee(ctx, mon.id) && mblinded(ctx, mon.id) === 0)
      ) {
        let btmp = 64 + ctx.rng.rn2(32);
        const r = ctx.rng.rn2(32);
        btmp += r * (resist(ctx, mon, 0, 'potion') ? 0 : 1);
        btmp += mblinded(ctx, mon.id);
        setMblinded(ctx, mon.id, Math.min(btmp, 127));
      }
      break;
    case POT.water:
      if (hatesBlessings(ctx, mon) || isWere(def)) {
        if (buc === 'blessed') {
          const silent = isSilent(ctx, mon);
          say(ctx, 'potionhit.in_pain', {
            mon: monNam(ctx, mon),
            verb: { key: silent ? 'potionhit.writhes' : 'potionhit.shrieks' },
          });
          if (!silent) wakeNearto(ctx, tx, ty, def.level * 10);
          if (hp) hp.cur -= ctx.rng.d(2, 6);
          // "should only be by you"
          if (!hp || hp.cur < 1) killedByHero(ctx, mon);
          else if (isWere(def) && !def.flags.includes('human')) newWere(ctx, mon); // revert
        } else if (buc === 'cursed') {
          angermon = false;
          if (canseemon(ctx, mon)) say(ctx, 'potionhit.healthier', { mon: monNam(ctx, mon) });
          healmon(mon, ctx.rng.d(2, 6), 0);
          if (isWere(def) && def.flags.includes('human')) newWere(ctx, mon); // into beast
        }
      } else if (mon.def === 'nh:gremlin') {
        angermon = false;
        splitMon(ctx, mon.id, !yourFault);
      } else if (mon.def === 'nh:iron_golem') {
        if (canseemon(ctx, mon)) say(ctx, 'potionhit.rusts', { mon: monNam(ctx, mon) });
        if (hp) hp.cur -= ctx.rng.d(1, 6);
        if (!hp || hp.cur < 1) killedByHero(ctx, mon); // "should only be by you"
      }
      break;
    case POT.acid:
      if (!def.resists.includes('acid') && !resist(ctx, mon, 0, 'potion')) {
        const silent = isSilent(ctx, mon);
        say(ctx, 'potionhit.in_pain', {
          mon: monNam(ctx, mon),
          verb: { key: silent ? 'potionhit.writhes' : 'potionhit.shrieks' },
        });
        if (!silent) wakeNearto(ctx, tx, ty, def.level * 10);
        if (hp) hp.cur -= ctx.rng.d(buc === 'cursed' ? 2 : 1, buc === 'blessed' ? 4 : 8);
        if (!hp || hp.cur < 1) killedBy(yourFault); // monkilled(mon, "", AD_ACID)
      }
      break;
    case POT.polymorph:
      potionPolymorph(ctx, mon, obj, yourFault);
      break;
    // gain level, levitation, fruit juice, monster and object detection, gain energy,
    // hallucination, enlightenment, see invisible: nothing
  }
  // "target might have been killed"
  if (alive(ctx, mon)) {
    if (angermon) wakeup(ctx, mon.id);
    else m.asleep = false;
  }
}

/**
 * bhitm() with a potion of polymorph: magic resistance or a resisted roll (attack level 6)
 * protect; else 1 in 25 kills it by system shock ("The jackal shudders!", no corpse) or it
 * changes form (seen: the potion is learned). ref: src/zap.c bhitm() POT_POLYMORPH
 */
function potionPolymorph(ctx: Ctx, mon: Entity, obj: Entity, yourFault: boolean): void {
  if (resistsMagm(ctx, mon)) return;
  if (resist(ctx, mon, 0, 'potion')) {
    // bhitm(): `if (wake) wakeup(mtmp, TRUE)` (the zap's attack)
    if (yourFault) wakeup(ctx, mon.id);
    return;
  }
  const giveMsg =
    !hasProp(getPlayer(ctx.state), P.HALLUC) && (canseemon(ctx, mon) || engulfingU(ctx, mon.id));
  let learnIt = false;
  if (!ctx.rng.rn2(25)) {
    if (canseemon(ctx, mon)) {
      say(ctx, 'zap.shudders', { mon: monNam(ctx, mon) });
      learnIt = true;
    }
    killedByHero(ctx, mon, true); // xkilled(XKILL_NOCORPSE)
  } else if (newcham(ctx, mon, null, { polyspot: false, msg: giveMsg })) {
    if (giveMsg && (canSpotMon(ctx, mon) || engulfingU(ctx, mon.id))) learnIt = true;
  }
  if (learnIt) discover(ctx, obj.def); // learnwand()
  if (yourFault && alive(ctx, mon)) wakeup(ctx, mon.id);
}

/**
 * The hero breathes the vapors of a breaking potion (or they get in her eyes): restore and gain
 * ability raise one lowered attribute (all when blessed; cursed: "Ulch!  That potion smells
 * terrible!"), the healing potions give a hit point each step and may cure blindness, sickness
 * takes 5 hit points, confusion and booze confuse ("You feel somewhat dizzy."), invisibility
 * ("For an instant you couldn't see yourself!"), paralysis ("Something seems to be holding
 * you.") and sleeping ("You feel rather tired.") hold her `rnd(5)` turns unless she has free
 * action (or sleep resistance: "You yawn."), speed ("Your knees seem more flexible now."),
 * blindness ("It suddenly gets dark."), holy or unholy water on a lycanthrope. A potion whose
 * effect she noticed is identified. The caller uses the potion up. ref: src/potion.c
 * potionbreathe()
 */
export function potionbreathe(ctx: Ctx, obj: Entity): void {
  const hero = getPlayer(ctx.state);
  const buc = obj.c.item?.buc ?? 'uncursed';
  let kn = false;
  let cureblind = false;
  const heal1 = (): void => {
    const hp = hero.c.hp;
    if (upolyd(ctx.state) && hp && hp.cur < hp.max) hp.cur++;
    const own = ownHp(ctx.state); // her own hit points (c.hp itself when not polymorphed)
    if (own && own.cur < own.max) own.cur++;
  };
  const helpless = (turns: number, reasonKey: string): void => {
    // nomul(-n): "if (gm.multi < nval) return" (already helpless for longer)
    const h = hero.c.helpless;
    if (h && h.until - ctx.state.turn - 1 >= turns) return;
    nomulNow(ctx, turns, reasonKey, { key: 'eat.can_move_again' });
  };
  switch (obj.def) {
    case POT.restoreAbility:
    case POT.gainAbility:
      if (buc === 'cursed') {
        if (!uBreathless(ctx)) say(ctx, 'vapor.smells_terrible');
        else if (uHasEyes(ctx)) say(ctx, 'vapor.eyes_sting');
      } else {
        let i = ctx.rng.rn2(ATTRS.length); // start at a random point
        let isdone = false;
        for (let ii = 0; !isdone && ii < ATTRS.length; ii++) {
          const k = ATTRS[i] as Attr;
          if (abase(ctx.state, k) < amax(ctx.state, k)) {
            setAbase(ctx, k, abase(ctx.state, k) + 1);
            isdone = buc !== 'blessed'; // only first found if not blessed
          }
          if (++i >= ATTRS.length) i = 0;
        }
      }
      break;
    case POT.fullHealing:
    case POT.extraHealing:
    case POT.healing:
      if (obj.def === POT.fullHealing) {
        heal1();
        cureblind = true;
      }
      if (obj.def !== POT.healing) {
        heal1();
        if (buc !== 'cursed') cureblind = true;
      }
      heal1();
      if (buc === 'blessed') cureblind = true;
      if (cureblind) makeBlinded(ctx, 0, true); // (no cream; never deaf)
      break;
    case POT.sickness: {
      // (the hero is never a Healer)
      const hp = hero.c.hp; // Upolyd ? u.mh : u.uhp
      if (hp) hp.cur = hp.cur <= 5 ? 1 : hp.cur - 5;
      break;
    }
    case POT.hallucination:
      say(ctx, 'vapor.momentary_vision');
      break;
    case POT.confusion:
    case POT.booze:
      if (!hasProp(hero, P.CONFUSION)) say(ctx, 'vapor.dizzy');
      makeConfused(ctx, timeoutLeft(ctx.state, hero, P.CONFUSION) + ctx.rng.rnd(5), false);
      break;
    case POT.invisibility:
      if (!hasProp(hero, P.BLINDED) && !hasProp(hero, P.INVIS)) {
        kn = true;
        say(ctx, hasProp(hero, P.SEE_INVIS) ? 'vapor.see_through' : 'vapor.cant_see_self');
      }
      break;
    case POT.paralysis:
      kn = true;
      if (!hasProp(hero, P.FREE_ACTION)) {
        say(ctx, 'vapor.holding');
        helpless(ctx.rng.rnd(5), 'helpless.frozen_potion');
      } else say(ctx, 'potion.stiffen');
      break;
    case POT.sleeping:
      kn = true;
      if (!hasProp(hero, P.FREE_ACTION) && !hasProp(hero, P.SLEEP_RES)) {
        say(ctx, 'vapor.tired');
        helpless(ctx.rng.rnd(5), 'helpless.magical_draught');
      } else {
        say(ctx, 'potion.yawn');
        monstseesu(ctx, M_SEEN.sleep);
      }
      break;
    case POT.speed:
      if (!hasProp(hero, P.FAST)) say(ctx, 'vapor.knees');
      incrItimeout(ctx.state, hero, P.FAST, ctx.rng.rnd(5));
      break;
    case POT.blindness: {
      const sees = (): boolean => !hasProp(hero, P.BLINDED) && !unaware(ctx);
      if (sees()) {
        kn = true;
        say(ctx, 'vapor.dark');
      }
      makeBlinded(ctx, timeoutLeft(ctx.state, hero, P.BLINDED) + ctx.rng.rnd(5), false);
      if (sees()) say(ctx, 'mthrow.vision_clears');
      break;
    }
    case POT.water: {
      // (a gremlin hero does not split: split_mon() is for monsters here)
      const lycn = ulycn(ctx.state);
      if (lycn !== null) {
        // vapor from [un]holy water will trigger transformation but won't cure lycanthropy
        if (buc === 'blessed' && heroFormId(ctx.state) === lycn) youUnwere(ctx, false);
        else if (buc === 'cursed' && !upolyd(ctx.state)) youWere(ctx);
      }
      break;
    }
    // acid and polymorph: exercise only (not ported); the others: nothing
  }
  // (dknown is always set here)
  if (kn) discover(ctx, obj.def);
}

/**
 * She breathes a boiled or shattered potion's vapors unless her form neither breathes nor has
 * eyes. ref: src/zap.c maybe_destroy_item(), src/lock.c chest_shatter_msg()
 */
export function breatheVapors(ctx: Ctx, obj: Entity): void {
  if (!uBreathless(ctx) || uHasEyes(ctx)) potionbreathe(ctx, obj);
}
setPotionbreathe(breatheVapors);

/**
 * A potion breaking on the floor next to the hero (or on her square): "You smell a peculiar
 * odor..." ("Your eyes water." for a breathless form) and its vapors; water has no smell.
 * The caller says it shatters, handles the shop and uses it up. ref: src/dothrow.c breakobj()
 * POT_WATER ("really, all potions"; no oil, no wet towel)
 */
export function breakPotionVapors(ctx: Ctx, obj: Entity, x: number, y: number): void {
  const hp = getPlayer(ctx.state).c.pos;
  if (!hp || dist2(x, y, hp.x, hp.y) > 2) return; // next2u()
  if (uBreathless(ctx) && !uHasEyes(ctx)) return;
  if (obj.def !== POT.water) say(ctx, uBreathless(ctx) ? 'vapor.eyes_water' : 'vapor.smell');
  potionbreathe(ctx, obj);
}
