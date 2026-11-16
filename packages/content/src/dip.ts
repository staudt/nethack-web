// #dip: dipping an object (or her hands) into a fountain, a pool or a potion, and "Dip into"
// from the potion's side. Holy and unholy water, plain water, alchemy, polymorph, acid, oil (rust
// and corrosion, filling lamps, lit oil), the unicorn horn and the amethyst.
// ref: src/potion.c dodip(), dip_into(), dip_ok(), dip_hands_ok(), potion_dip(),
// H2Opotion_dip(), mixtype(), dip_potion_explosion(), hold_potion(), poof();
// src/do_wear.c inaccessible_equipment(); src/shk.c alter_cost()
//
// Not ported (DEVIATIONS "Dipping"): sinks, steeds, poisoning weapons in sickness (no
// `opoisoned`), naming the old potion type after a unicorn horn or amethyst changed it (docall())
// and trycall(), exercise, livelog and the polypile conduct; Glib from cursed oil comes in m19
// step 8 (the spill is only described).
import {
  NORMAL_SPEED,
  getLevel,
  getPlayer,
  inventoryOf,
  type ActionDef,
  type Ctx,
  type DefId,
  type Entity,
  type Json,
  type Msg,
  type Offer,
  type PlayerAction,
  type Registry,
  type Rng,
} from '@nh/core';
import { MAGIC_LAMP, OIL_LAMP } from './burnstate';
import { ucreamed } from './creamed';
import { POT_OIL, fixupOil, isDiluted, setDiluted } from './dilute';
import { erodeObj } from './erode';
import { explode } from './explode';
import { figBucChanged } from './figurinestate';
import { fireDamage } from './flooreffects';
import { answerFountainWish, dipfountain, heroOnFountain, washHands } from './fountain';
import { hcolor, type ColorName } from './hcolor';
import { losehp } from './hp';
import { invOption, prinv } from './itemactions';
import { removeFromInventory, splitStack } from './items';
import { shkYour } from './light';
import { floatingAbove } from './levitation';
import { isPool, waterbodyName } from './liquid';
import { useup, useupall } from './magic';
import { isCorrodeable, isRustprone, isWeptool } from './material';
import { mkobj } from './mkobj';
import { wakeNearto } from './noise';
import { discover } from './o_init';
import { doname, xnameOf } from './objnam';
import { objUnpolyable, polyObj } from './polyobj';
import { potionbreathe } from './potionhit';
import { P, hasExtrinsic, hasIntrinsic, hasProp, timeoutLeft, wornIn } from './props';
import { canReachFloor } from './reach';
import { alterCost, checkUnpaid, costlyAlteration } from './shk';
import { nearCapacity } from './stats';
import { heroForm } from './upoly';
import { POT_ACID, POT_WATER, waterDamage, type WaterNote } from './water';
import { holdAnotherObject } from './wish';

export const DIP_ID: DefId = 'nh:dip';
export const DIP_INTO_ID: DefId = 'nh:dip_into';

const POT = {
  gainAbility: 'nh:potion_of_gain_ability',
  confusion: 'nh:potion_of_confusion',
  blindness: 'nh:potion_of_blindness',
  speed: 'nh:potion_of_speed',
  levitation: 'nh:potion_of_levitation',
  hallucination: 'nh:potion_of_hallucination',
  seeInvisible: 'nh:potion_of_see_invisible',
  healing: 'nh:potion_of_healing',
  extraHealing: 'nh:potion_of_extra_healing',
  gainLevel: 'nh:potion_of_gain_level',
  enlightenment: 'nh:potion_of_enlightenment',
  gainEnergy: 'nh:potion_of_gain_energy',
  fullHealing: 'nh:potion_of_full_healing',
  polymorph: 'nh:potion_of_polymorph',
  booze: 'nh:potion_of_booze',
  sickness: 'nh:potion_of_sickness',
  fruitJuice: 'nh:potion_of_fruit_juice',
  acid: POT_ACID,
  oil: POT_OIL,
  water: POT_WATER,
} as const;

const UNICORN_HORN: DefId = 'nh:unicorn_horn';
const AMETHYST: DefId = 'nh:amethyst';
const ALCHEMY_SMOCK: DefId = 'nh:alchemy_smock';
const TOWEL: DefId = 'nh:towel';
const CORPSE: DefId = 'nh:corpse';
const LICHEN: DefId = 'nh:lichen';
/** ref: include/hack.h BOLT_LIM */
const BOLT_LIM = 8;

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const blind = (ctx: Ctx): boolean => hasProp(getPlayer(ctx.state), P.BLINDED);
const halluc = (ctx: Ctx): boolean => hasProp(getPlayer(ctx.state), P.HALLUC);
const pl = (e: Entity): string => ((e.c.item?.quantity ?? 1) !== 1 ? '_pl' : '');

/**
 * ref: src/potion.c mixtype(): the potion type made when `o1` is dipped into `o2`, or null
 * (STRANGE_OBJECT). Potions dipped into gain level, gain energy, the healing potions,
 * enlightenment or fruit juice swap the two first; two cases draw rn2(3).
 */
export function mixtype(defs: Registry, o1: DefId, o2: DefId, rng: Pick<Rng, 'rn2'>): DefId | null {
  let o1typ = o1;
  let o2typ = o2;
  // cut down on the number of cases below
  if (
    defs.object(o1).class === 'potion' &&
    (o2 === POT.gainLevel ||
      o2 === POT.gainEnergy ||
      o2 === POT.healing ||
      o2 === POT.extraHealing ||
      o2 === POT.fullHealing ||
      o2 === POT.enlightenment ||
      o2 === POT.fruitJuice)
  ) {
    o1typ = o2;
    o2typ = o1;
  }
  const unihornCase = (): DefId | null => {
    switch (o2typ) {
      case POT.sickness:
        return POT.fruitJuice;
      case POT.hallucination:
      case POT.blindness:
      case POT.confusion:
        return POT.water;
    }
    return null;
  };
  switch (o1typ) {
    case POT.healing:
    case POT.extraHealing:
    case POT.fullHealing:
      if (o1typ === POT.healing && o2typ === POT.speed) return POT.extraHealing;
      if (o2typ === POT.gainLevel || o2typ === POT.gainEnergy)
        return o1typ === POT.healing
          ? POT.extraHealing
          : o1typ === POT.extraHealing
            ? POT.fullHealing
            : POT.gainAbility;
      return unihornCase(); // FALLTHRU to UNICORN_HORN
    case UNICORN_HORN:
      return unihornCase();
    case AMETHYST: // "a-methyst" == "not intoxicated"
      return o2typ === POT.booze ? POT.fruitJuice : null;
    case POT.gainLevel:
    case POT.gainEnergy:
      switch (o2typ) {
        case POT.confusion:
          return rng.rn2(3) ? POT.booze : POT.enlightenment;
        case POT.healing:
          return POT.extraHealing;
        case POT.extraHealing:
          return POT.fullHealing;
        case POT.fullHealing:
          return POT.gainAbility;
        case POT.fruitJuice:
          return POT.seeInvisible;
        case POT.booze:
          return POT.hallucination;
      }
      return null;
    case POT.fruitJuice:
      switch (o2typ) {
        case POT.sickness:
          return POT.sickness;
        case POT.enlightenment:
        case POT.speed:
          return POT.booze;
        case POT.gainLevel:
        case POT.gainEnergy:
          return POT.seeInvisible;
      }
      return null;
    case POT.enlightenment:
      switch (o2typ) {
        case POT.levitation:
          if (rng.rn2(3)) return POT.gainLevel;
          return null;
        case POT.fruitJuice:
          return POT.booze;
        case POT.booze:
          return POT.confusion;
      }
      return null;
  }
  return null;
}

/**
 * The description word of a potion type as the hero sees it ("ruby", "clear"; a random colour
 * while hallucinating). ref: hcolor(OBJ_DESCR(objects[otyp]))
 */
function potionDescr(ctx: Ctx, def: DefId): Msg {
  if (halluc(ctx)) return hcolor(ctx, 'blue'); // any colour: a hallucinatory one
  const app = ctx.state.appearances[def];
  const key =
    app !== undefined && ctx.defs.isAppearance(app)
      ? ctx.defs.appearance(app).nameKey
      : (ctx.defs.object(def).descKey ?? ctx.defs.object(def).nameKey);
  return { key: `dip.descr.${key}` };
}

/**
 * The armor covering `obj` that keeps her from reaching it: a suit under a cloak, a shirt under
 * a suit or cloak, a ring under gloves. ref: src/do_wear.c inaccessible_equipment() (any
 * covering, not only a known-cursed one)
 */
function coveringOf(ctx: Ctx, obj: Entity): Entity[] {
  const slot = obj.c.item?.equipped;
  if (!slot || obj.c.item?.carriedBy !== ctx.state.playerId) return [];
  const worn = (s: string): Entity | null => wornIn(ctx.state, ctx.state.playerId, s);
  const cloak = worn('cloak');
  const suit = worn('body');
  if (slot === 'body' && cloak) return [cloak];
  if (slot === 'shirt' && (suit || cloak)) return [cloak, suit].filter((e) => e !== null);
  if ((slot === 'ringL' || slot === 'ringR') && worn('gloves')) return [worn('gloves')!];
  return [];
}

/** "You need to take off your cloak to dip your suit." when it is covered. */
function inaccessible(ctx: Ctx, obj: Entity): boolean {
  const cover = coveringOf(ctx, obj);
  if (cover.length === 0) return false;
  const yname = (e: Entity): Msg => ({
    key: 'dip.yname',
    params: { whose: shkYour(ctx, e, false), item: xnameOf(ctx.state, ctx.defs, e) },
  });
  say(ctx, cover.length > 1 ? 'dip.take_off2' : 'dip.take_off', {
    cover: yname(cover[0]!),
    ...(cover[1] ? { cover2: xnameOf(ctx.state, ctx.defs, cover[1]) } : {}),
    item: yname(obj),
  });
  return true;
}

/** Whether #dip lists `obj`: no coins, nothing covered by other armor. ref: dip_ok() */
const dipOk = (ctx: Ctx, obj: Entity): boolean =>
  ctx.defs.object(obj.def).class !== 'coin' && coveringOf(ctx, obj).length === 0;

const heroItem = (ctx: Pick<Ctx, 'state'>, id: unknown): Entity | null => {
  if (typeof id !== 'number') return null;
  const e = ctx.state.entities[String(id)];
  return e?.c.item?.carriedBy === ctx.state.playerId ? e : null;
};

/** The pool or fountain under the hero, as dodip() looks at it (sinks are not ported). */
function waterHere(ctx: Ctx): { kind: 'fountain' } | { kind: 'pool'; name: string } | null {
  if (heroOnFountain(ctx)) return { kind: 'fountain' };
  const p = getPlayer(ctx.state).c.pos;
  const level = getLevel(ctx.state);
  if (p && isPool(ctx, level, p.x, p.y))
    return { kind: 'pool', name: `@${waterbodyName(ctx, level, p.x, p.y)}` };
  return null;
}

/** The questions of a dip in progress (the prompt's data). */
type DipData =
  | { stage: 'here'; obj: number | 'hands' }
  | { stage: 'potion'; obj: number | 'hands' }
  | { stage: 'into'; potion: number };

const isDipData = (data: Json): boolean =>
  typeof data === 'object' && data !== null && !Array.isArray(data) && 'stage' in data;

/** "your hands" or the object's full name, for the questions. */
const objWord = (ctx: Ctx, obj: Entity | 'hands'): Msg =>
  obj === 'hands'
    ? { key: 'dip.your_hands' }
    : { key: 'dip.an', params: { item: doname(ctx.state, ctx.defs, obj) } };

/**
 * "What do you want to dip X into?": a menu of her potions (none: "You don't have anything to
 * dip X into."). Returns 0 (the time is taken by the answer). ref: dodip() getobj(drink_ok)
 */
function askPotion(ctx: Ctx, obj: Entity | 'hands'): number {
  const potions = inventoryOf(ctx.state, ctx.state.playerId).filter(
    (e) => ctx.defs.object(e.def).class === 'potion',
  );
  const item = objWord(ctx, obj);
  if (potions.length === 0) {
    say(ctx, 'dip.nothing_to_dip_into', { item });
    return 0;
  }
  ctx.ask(
    {
      id: 'dip-potion',
      kind: 'menu',
      key: 'dip.into_what',
      params: { item },
      cancellable: true,
      options: potions.map((e) => invOption(ctx, e)),
    },
    DIP_ID,
    {
      stage: 'potion',
      obj: obj === 'hands' ? 'hands' : obj.id,
    } satisfies DipData as unknown as Json,
  );
  return 0;
}

/**
 * #dip: on a fountain or pool she can reach, "Dip X into the fountain?" first; otherwise (or on
 * "no") the potion menu. ref: src/potion.c dodip()
 */
function dodip(ctx: Ctx, obj: Entity | 'hands'): number {
  if (obj !== 'hands' && inaccessible(ctx, obj)) return 0;
  const here = waterHere(ctx);
  if (here && canReachFloor(ctx, false)) {
    const item = objWord(ctx, obj);
    ctx.ask(
      {
        id: 'dip-here',
        kind: 'yn',
        key: 'dip.into_here',
        params: { item, what: here.kind === 'fountain' ? '@terrain.fountain' : here.name },
        cancellable: true,
      },
      DIP_ID,
      {
        stage: 'here',
        obj: obj === 'hands' ? 'hands' : obj.id,
      } satisfies DipData as unknown as Json,
    );
    return 0;
  }
  return askPotion(ctx, obj);
}

/** "Yes" to the fountain or pool question. ref: dodip() */
function dipHere(ctx: Ctx, obj: Entity | 'hands'): number {
  const here = waterHere(ctx);
  if (!here) return 0;
  if (here.kind === 'fountain') return dipfountain(ctx, DIP_ID, obj);
  if (hasProp(getPlayer(ctx.state), P.LEVITATION)) {
    floatingAbove(ctx, here.name);
  } else if (obj === 'hands' || obj.c.item?.equipped === 'gloves') {
    washHands(ctx);
  } else {
    // (a potion of acid explodes in water_damage(): never kept in_use)
    waterDamage(ctx, obj, null, true);
  }
  return NORMAL_SPEED;
}

/**
 * hold_potion(): the changed potion leaves her pack and comes back (merging with a stack of its
 * kind, or dropped with `dropKey` when it no longer fits), never dropped for the current
 * burden. ref: src/potion.c hold_potion()
 */
function holdPotion(ctx: Ctx, potion: Entity, dropKey: string): void {
  const cap = nearCapacity(ctx.state, ctx.defs, ctx.state.playerId);
  if (potion.c.item?.carriedBy === ctx.state.playerId) removeFromInventory(ctx, potion.id);
  holdAnotherObject(
    ctx,
    potion.id,
    { key: dropKey, params: { item: doname(ctx.state, ctx.defs, potion) } },
    null,
    cap,
  );
}

/** ref: src/potion.c poof(): the potion is used up (trycall() is not ported). */
const poof = (ctx: Ctx, potion: Entity): void => useup(ctx, potion.id);

/** ref: include/hack.h Blindfolded_only: the blindfold is the only thing keeping her blind */
function blindfoldedOnly(ctx: Ctx): boolean {
  const h = getPlayer(ctx.state);
  return (
    hasExtrinsic(h, P.BLINDED) &&
    !hasIntrinsic(h, P.BLINDED) &&
    timeoutLeft(ctx.state, h, P.BLINDED) === 0 &&
    ucreamed(ctx.state) === 0
  );
}

/**
 * An object dipped into a potion of water: holy water uncurses a cursed object ("Your X glows
 * amber.") or blesses an uncursed one ("... with a light blue aura."), unholy water unblesses a
 * blessed one (brown) or curses an uncursed one (black), plain water gets it wet. Unseen, she
 * forgets what she knew of its BUC unless she knows the water's. Unpaid water changes price
 * (or must be paid for). True when something happened (the water is used up).
 * ref: src/potion.c H2Opotion_dip()
 */
export function h2oPotionDip(ctx: Ctx, potion: Entity, targ: Entity, useeit: boolean): boolean {
  const pit = potion.c.item;
  const it = targ.c.item;
  if (!pit || !it || potion.def !== POT_WATER) return false;
  let to: 'blessed' | 'uncursed' | 'cursed' | null = null;
  let color: ColorName = 'amber';
  let cost: 'alter' | 'uncurse' | 'unbless' = 'alter';
  let aura = false;
  if (pit.buc === 'blessed') {
    if (it.buc === 'cursed') {
      to = 'uncursed';
      color = 'amber';
      cost = 'uncurse';
    } else if (it.buc !== 'blessed') {
      to = 'blessed';
      color = 'light_blue';
      aura = true;
    }
  } else if (pit.buc === 'cursed') {
    if (it.buc === 'blessed') {
      to = 'uncursed';
      color = 'brown';
      cost = 'unbless';
    } else if (it.buc !== 'cursed') {
      to = 'cursed';
      color = 'black';
      aura = true;
    }
  } else {
    // dipping into uncursed water (the target is always carried here)
    const note: WaterNote = {};
    const res = waterDamage(ctx, targ, null, true, note) !== 'nothing';
    if (note.mentionedWater) discover(ctx, POT_WATER);
    return res;
  }
  if (to === null) return false;
  // give feedback before altering the target object
  if (useeit) {
    const shown = hcolor(ctx, color);
    say(ctx, `dip.glow${aura ? '_aura' : ''}${pl(targ)}`, {
      whose: shkYour(ctx, targ, true),
      item: xnameOf(ctx.state, ctx.defs, targ),
      color: shown,
    });
    it.known.buc = !halluc(ctx);
  } else if (!pit.known.buc) {
    // didn't see what happened: forget the BUC state unless the water's is known
    it.known.buc = false;
  }
  // potions of water are the only shop goods whose price depends on their BUC
  if (it.unpaid && targ.def === POT_WATER) {
    if (cost === 'alter') alterCost(ctx, targ, 0);
    else costlyAlteration(ctx, targ, cost, null);
  }
  it.buc = to;
  figBucChanged(ctx, targ.id);
  return true;
}

/**
 * The dipped potions explode: cursed ones, acid, lit oil, else 1 time in 10 (30 in an alchemy
 * smock): "BOOM!  They explode!", she breathes the vapors, the stack is used up and the blast
 * does `dmg`. ref: src/potion.c dip_potion_explosion()
 */
function dipPotionExplosion(ctx: Ctx, obj: Entity, dmg: number): boolean {
  const it = obj.c.item;
  if (!it) return false;
  const smock = wornIn(ctx.state, ctx.state.playerId, 'cloak')?.def === ALCHEMY_SMOCK;
  if (
    it.buc === 'cursed' ||
    obj.def === POT.acid ||
    (obj.def === POT.oil && it.lit) ||
    !ctx.rng.rn2(smock ? 30 : 10)
  ) {
    say(ctx, 'dip.boom');
    const p = getPlayer(ctx.state).c.pos;
    if (p) wakeNearto(ctx, p.x, p.y, (BOLT_LIM + 1) * (BOLT_LIM + 1));
    const form = heroForm(ctx);
    const breathless = form?.flags.includes('breathless') === true;
    const haseyes = form?.flags.includes('noeyes') !== true;
    if (!breathless || haseyes) potionbreathe(ctx, obj);
    useupall(ctx, obj.id);
    losehp(ctx, dmg, '@killer.alchemic_blast'); // not physical damage
    return true;
  }
  return false;
}

/** Two potions of different kinds mix. ref: potion_dip() `obj->oclass == POTION_CLASS` */
function mixPotions(ctx: Ctx, objIn: Entity, potion: Entity): number {
  let obj = objIn;
  const oit = obj.c.item;
  const pit = potion.c.item;
  if (!oit || !pit) return 0;
  let amt = oit.quantity;
  const mixture = mixtype(ctx.defs, obj.def, potion.def, ctx.rng);
  const magic =
    mixture !== null
      ? ctx.defs.object(mixture).magic
      : ctx.defs.object(obj.def).magic || ctx.defs.object(potion.def).magic;
  const diluted = isDiluted(oit);
  let partial = false;
  if (amt > (diluted ? 2 : magic ? 3 : 7)) {
    // trying to dip multiple potions will usually affect only a subset: 3..8 for a magic
    // result, 7..N for a mundane one, only two diluted ones (a balance fix against mass
    // alchemy of healing into full healing)
    if (diluted) amt = 2;
    else if (magic) amt = ctx.rng.rnd(Math.min(amt, 8) - (3 - 1)) + (3 - 1);
    else amt = ctx.rng.rnd(amt - (7 - 1)) + (7 - 1);
    if (amt < oit.quantity) {
      const id = splitStack(ctx, obj.id, amt);
      obj = ctx.state.entities[String(id)]!;
      partial = true;
    }
  }
  const it = obj.c.item!;
  // [N of] the {obj(s)} mix(es) with [one of] {the potion}...
  say(
    ctx,
    `dip.mix_${partial ? 'n' : it.quantity === 1 ? 's' : 'p'}${pit.quantity > 1 ? '_of' : ''}`,
    {
      n: it.quantity,
      item: xnameOf(ctx.state, ctx.defs, obj),
      potion: xnameOf(ctx.state, ctx.defs, potion),
    },
  );
  useup(ctx, potion.id); // now gone
  // mixing potions is dangerous; acid is particularly unstable
  if (dipPotionExplosion(ctx, obj, amt + ctx.rng.rnd(9))) return NORMAL_SPEED;

  it.buc = 'uncursed';
  it.known.buc = false;
  figBucChanged(ctx, obj.id);
  if (mixture !== null) obj.def = mixture;
  else {
    switch (isDiluted(it) ? 1 : ctx.rng.rnd(8)) {
      case 1:
        obj.def = POT.water;
        break;
      case 2:
      case 3:
        obj.def = POT.sickness;
        break;
      case 4: {
        const id = mkobj(ctx, 'potion', { artif: false });
        const otmp = id === null ? undefined : ctx.state.entities[String(id)];
        if (otmp?.c.item) {
          obj.def = otmp.def;
          // oil uses the age field differently from other potions
          if (obj.def === POT.oil || otmp.def === POT.oil)
            fixupOil({ def: obj.def, it }, { def: otmp.def, it: otmp.c.item }, ctx.state.turn);
          ctx.remove(otmp.id);
        }
        break;
      }
      default:
        useupall(ctx, obj.id);
        say(ctx, blind(ctx) ? 'dip.evaporates_blind' : 'dip.evaporates');
        return NORMAL_SPEED;
    }
  }
  setDiluted(it, obj.def !== POT.water);
  if (obj.def === POT.water && !halluc(ctx)) {
    say(ctx, blind(ctx) ? 'dip.bubbles_blind' : 'dip.bubbles');
  } else if (!blind(ctx)) {
    say(ctx, 'dip.looks', { color: potionDescr(ctx, obj.def) });
  }
  // a split-off part gets its own slot, and either part may merge into a stack of its kind
  holdPotion(ctx, obj, 'dip.drop');
  return NORMAL_SPEED;
}

/**
 * Oil on a weapon: lit, it burns it; cursed, it spills over her fingers; otherwise it takes
 * one level of rust and one of corrosion away ("Your dagger is less rusty."), or leaves an
 * oily sheen. The oil is used up. ref: potion_dip() POT_OIL
 */
function oilDip(ctx: Ctx, obj: Entity, potion: Entity): number | null {
  const it = obj.c.item!;
  const pit = potion.c.item!;
  const def = ctx.defs.object(obj.def);
  if (pit.lit) {
    // burning
    const p = getPlayer(ctx.state).c.pos;
    if (p) fireDamage(ctx, obj, true, p.x, p.y);
  } else if (pit.buc === 'cursed') {
    // (make_glib(): slippery fingers come in m19 step 8)
    const gloves = wornIn(ctx.state, ctx.state.playerId, 'gloves');
    say(ctx, gloves ? 'dip.oil_spills_gloves' : 'dip.oil_spills');
  } else if (def.class !== 'weapon' && !isWeptool(def)) {
    return null; // the following cases apply only to weapons: more_dips
  } else {
    const e1 = it.erosion?.e1 ?? 0;
    const e2 = it.erosion?.e2 ?? 0;
    const whose = shkYour(ctx, obj, true);
    const item = xnameOf(ctx.state, ctx.defs, obj);
    if ((!isRustprone(def) && !isCorrodeable(def)) || def.weapon?.role === 'ammo' || (!e1 && !e2)) {
      // uses up the potion, doesn't grease the object
      say(ctx, `${blind(ctx) ? 'dip.oily_feel' : 'dip.oily_sheen'}${pl(obj)}`, { whose, item });
    } else {
      const what = e1 && e2 ? 'both' : e1 ? 'rusty' : 'corroded';
      say(ctx, `${blind(ctx) ? 'dip.less_feel' : 'dip.less'}${pl(obj)}`, {
        whose,
        item,
        what: `@dip.less.${what}`,
      });
      const n1 = Math.max(e1 - 1, 0) as 0 | 1 | 2;
      const n2 = Math.max(e2 - 1, 0) as 0 | 1 | 2;
      if (n1 || n2) it.erosion = { e1: n1, e2: n2 };
      else delete it.erosion;
    }
  }
  discover(ctx, potion.def); // makeknown() (every object is dknown)
  useup(ctx, potion.id);
  return NORMAL_SPEED;
}

/** Oil into an oil lamp or a magic lamp. ref: potion_dip() "more_dips" */
function fillLamp(ctx: Ctx, obj: Entity, potion: Entity): number {
  const it = obj.c.item!;
  const pit = potion.c.item!;
  // turn off engine before fueling, turn off fuel too :-)
  if (it.lit || pit.lit) {
    useup(ctx, potion.id);
    const p = getPlayer(ctx.state).c.pos;
    if (p) explode(ctx, p.x, p.y, { spell: 'fire', by: 'hero' }, ctx.rng.d(6, 6), 'fiery');
    return NORMAL_SPEED;
  }
  // adding oil to an empty magic lamp renders it into an oil lamp
  if (obj.def === MAGIC_LAMP && it.spe === 0) {
    obj.def = OIL_LAMP;
    it.age = 0;
  }
  const item = xnameOf(ctx.state, ctx.defs, obj);
  if ((it.age ?? 0) > 1000) {
    say(ctx, `dip.lamp_full${pl(obj)}`, { whose: shkYour(ctx, obj, true), item });
  } else {
    say(ctx, 'dip.fill', { whose: shkYour(ctx, obj, false), item });
    checkUnpaid(ctx, potion); // Yendorian Fuel Tax
    // burns more efficiently in a lamp than in a bottle; a diluted potion gives less (the lamp
    // is not tracked as holding some non-oil)
    it.age = Math.min(
      (it.age ?? 0) + Math.trunc(((isDiluted(pit) ? 3 : 4) * (pit.age ?? 0)) / 2),
      1500,
    );
    useup(ctx, potion.id);
  }
  discover(ctx, POT_OIL); // (every object is dknown)
  it.spe = 1;
  return NORMAL_SPEED;
}

/**
 * A unicorn horn or an amethyst dipped into a potion it neutralizes: one potion of the stack
 * becomes the mixture (uncursed water, or keeping the horn's curse), "The ruby potion turns
 * dark." ref: potion_dip() UNICORN_HORN / AMETHYST
 */
function neutralize(ctx: Ctx, obj: Entity, potion: Entity, mixture: DefId): number {
  const pit = potion.c.item!;
  const old = potionDescr(ctx, potion.def);
  const more = pit.quantity > 1;
  const single = more ? ctx.state.entities[String(splitStack(ctx, potion.id, 1))]! : potion;
  const sit = single.c.item!;
  costlyAlteration(ctx, single, 'neutralize', null);
  single.def = mixture;
  if (mixture === POT.water) {
    sit.buc = 'uncursed';
    setDiluted(sit, false);
  } else sit.buc = obj.c.item?.buc === 'cursed' ? 'cursed' : 'uncursed'; // diluted left as-is
  sit.known.buc = false;
  figBucChanged(ctx, single.id);
  if (!blind(ctx)) {
    const that = more ? '_that' : '';
    if (mixture === POT.water && !halluc(ctx)) say(ctx, `dip.clears${that}`, { old });
    else say(ctx, `dip.turns${that}`, { old, color: potionDescr(ctx, mixture) });
  }
  // remove the potion from her pack and put it back, possibly stacking it
  holdPotion(ctx, single, 'dip.juggle_drop');
  return NORMAL_SPEED;
}

/**
 * Dips `obj` (or her hands) into `potion`. Returns the time taken. ref: src/potion.c
 * potion_dip()
 */
export function potionDip(ctx: Ctx, obj: Entity | 'hands', potion: Entity): number {
  const pit = potion.c.item;
  if (!pit) return 0;
  if (obj !== 'hands' && potion.id === obj.id && pit.quantity === 1) {
    say(ctx, 'dip.klein');
    return 0;
  }
  if (obj === 'hands') {
    say(ctx, 'dip.hands_bottle');
    return 0;
  }
  const it = obj.c.item;
  if (!it) return 0;
  const odef = ctx.defs.object(obj.def);
  if (potion.def === POT.water) {
    const useeit = !blind(ctx) || (it.equipped === 'blindfold' && blindfoldedOnly(ctx));
    if (h2oPotionDip(ctx, potion, obj, useeit)) {
      poof(ctx, potion);
      return NORMAL_SPEED;
    }
  } else if (obj.def === POT.polymorph || potion.def === POT.polymorph) {
    // some objects can't be polymorphed
    if (objUnpolyable(ctx, obj.def === POT.polymorph ? potion : obj)) {
      say(ctx, 'dip.nothing_happens');
    } else {
      const saveOtyp = obj.def;
      const nobj = polyObj(ctx, obj, null);
      if (nobj.def !== saveOtyp) {
        discover(ctx, POT.polymorph);
        useup(ctx, potion.id);
        prinv(ctx, nobj);
      } else {
        say(ctx, 'dip.nothing_seems');
        poof(ctx, potion);
      }
    }
    return NORMAL_SPEED;
  } else if (odef.class === 'potion' && obj.def !== potion.def) {
    return mixPotions(ctx, obj, potion);
  }

  if (potion.def === POT.acid && obj.def === CORPSE && it.corpseOf === LICHEN) {
    say(ctx, `dip.lichen${pl(obj)}`, {
      item: xnameOf(ctx.state, ctx.defs, obj),
      color: blind(ctx) ? { key: 'dip.wrinkled' } : hcolor(ctx, isDiluted(pit) ? 'orange' : 'red'),
    });
    return NORMAL_SPEED; // didn't go poof
  }

  if (potion.def === POT.water && obj.def === TOWEL) {
    // (wetting the towel is water_damage()'s, m19 step 8)
    say(ctx, 'dip.towel_soaks');
    poof(ctx, potion);
    return NORMAL_SPEED;
  }

  // (poisoning weapons in sickness and healing the coating off: no `opoisoned` here)

  if (potion.def === POT.acid) {
    if (erodeObj(ctx, obj, null, 'corrode') !== 'nothing') {
      poof(ctx, potion);
      return NORMAL_SPEED;
    }
  }

  if (potion.def === POT.oil) {
    const t = oilDip(ctx, obj, potion);
    if (t !== null) return t;
  }

  // allow filling of magic lamps to prevent identification by player
  if ((obj.def === OIL_LAMP || obj.def === MAGIC_LAMP) && potion.def === POT.oil)
    return fillLamp(ctx, obj, potion);

  if (obj.def === UNICORN_HORN || obj.def === AMETHYST) {
    const mixture = mixtype(ctx.defs, obj.def, potion.def, ctx.rng);
    if (mixture !== null) return neutralize(ctx, obj, potion, mixture);
  }

  say(ctx, 'dip.interesting');
  return NORMAL_SPEED;
}

const dipArgs = (action: PlayerAction): { item?: unknown; hands?: unknown; potion?: unknown } =>
  action.type === 'mod'
    ? ((action.args ?? {}) as { item?: unknown; hands?: unknown; potion?: unknown })
    : {};

/**
 * #dip: offered on every carried object but coins and armor or rings under other armor, and on
 * herself ("Wash your hands") where a fountain or pool is under her. ref: src/potion.c dodip()
 */
const dip: ActionDef = {
  id: DIP_ID,
  labelKey: 'action.nh:dip',
  handles: 'mod',
  offer(ctx, target): Offer[] {
    if (target.kind === 'self') {
      if (!waterHere(ctx)) return [];
      return [
        {
          action: { type: 'mod', action: DIP_ID, args: { hands: true } },
          labelKey: 'action.nh:dip.hands',
        },
      ];
    }
    if (target.kind !== 'item') return [];
    const e = heroItem(ctx, target.id);
    if (!e || !dipOk(ctx, e)) return [];
    return [
      { action: { type: 'mod', action: DIP_ID, args: { item: e.id } }, labelKey: 'action.nh:dip' },
    ];
  },
  perform(ctx, action) {
    const args = dipArgs(action);
    if (args.hands) return dodip(ctx, 'hands');
    const e = heroItem(ctx, args.item);
    if (!e || ctx.defs.object(e.def).class === 'coin') return 0;
    return dodip(ctx, e);
  },
  answer(ctx, value, raw) {
    // a water demon's wish from the fountain
    if (!isDipData(raw)) return answerFountainWish(ctx, DIP_ID, value, raw);
    const data = raw as unknown as DipData;
    if (data.stage === 'into') {
      const potion = heroItem(ctx, data.potion);
      const obj = heroItem(ctx, value);
      if (!potion || !obj || ctx.defs.object(potion.def).class !== 'potion') return 0;
      if (inaccessible(ctx, obj)) return 0;
      return potionDip(ctx, obj, potion);
    }
    const obj = data.obj === 'hands' ? 'hands' : heroItem(ctx, data.obj);
    if (!obj) return 0;
    if (data.stage === 'here') {
      // y_n(): Escape answers "no"
      if (value === true) return dipHere(ctx, obj);
      return askPotion(ctx, obj);
    }
    const potion = heroItem(ctx, value);
    if (!potion || ctx.defs.object(potion.def).class !== 'potion') return 0;
    return potionDip(ctx, obj, potion);
  },
};

/**
 * "Dip into" a carried potion (C's #altdip): asks for the object to dip into it, never the
 * fountain or pool. ref: src/potion.c dip_into()
 */
const dipInto: ActionDef = {
  id: DIP_INTO_ID,
  labelKey: 'action.nh:dip_into',
  handles: 'mod',
  offer(ctx, target): Offer[] {
    if (target.kind !== 'item') return [];
    const e = heroItem(ctx, target.id);
    if (!e || ctx.defs.object(e.def).class !== 'potion') return [];
    return [
      {
        action: { type: 'mod', action: DIP_INTO_ID, args: { potion: e.id } },
        labelKey: 'action.nh:dip_into',
      },
    ];
  },
  perform(ctx, action) {
    const potion = heroItem(ctx, dipArgs(action).potion);
    if (!potion || ctx.defs.object(potion.def).class !== 'potion') return 0;
    const objs = inventoryOf(ctx.state, ctx.state.playerId).filter((e) => dipOk(ctx, e));
    ctx.ask(
      {
        id: 'dip-into',
        kind: 'menu',
        key: (potion.c.item?.quantity ?? 1) > 1 ? 'dip.what_into_of' : 'dip.what_into',
        params: { potion: xnameOf(ctx.state, ctx.defs, potion) },
        cancellable: true,
        options: objs.map((e) => invOption(ctx, e)),
      },
      DIP_ID,
      { stage: 'into', potion: potion.id } satisfies DipData as unknown as Json,
    );
    return 0;
  },
};

export const DIP_ACTIONS: readonly ActionDef[] = [dip, dipInto];
