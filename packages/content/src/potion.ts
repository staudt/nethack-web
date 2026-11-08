// Potions: quaffing and the effects of the potions in our subset.
// ref: src/potion.c dodrink(), dopotion(), peffects(), healup()
import {
  NORMAL_SPEED,
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
import { ulycn, youUnwere } from './werestate';
import { heroEntity, useup } from './magic';
import { nomulNow } from './hunger';
import {
  P,
  hasIntrinsic,
  hasProp,
  incrItimeout,
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
}

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
 * ref: src/potion.c peffect_see_invisible(): the taste (no fruit juice, no diluted potions, no
 * hallucinated wording), sight restored unless cursed, then permanent (blessed, sometimes) or
 * timed see invisible; seeing herself invisible identifies it.
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
  // unholy water and a lycanthrope: you_were() turns her into the beast (7f)
  return { unknown: true };
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
    case 'nh:potion_of_water':
      return peffectWater(ctx, p);
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
  'nh:potion_of_water': dopotion,
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
