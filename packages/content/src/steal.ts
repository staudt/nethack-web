// Theft: leprechauns taking gold, nymphs and monkeys taking items (worn armor over several turns,
// through afternmv), and monsters picking up what they took.
// ref: src/steal.c somegold(), findgold(), stealgold(), thiefdead() (nomul.ts), unresponsive(),
// unstolenarm(), stealarm(), remove_worn_item(), worn_item_removal(), steal(), mpickobj();
// src/mhitu.c could_seduce()
//
// Not here: the hero as a thief (steal_it(), uhitm: polymorph, 7f), stealamulet() (no Amulet or
// quest artifacts), ball and chain, leashes, boulders in inventory. The hero is always female
// (the Valkyrie), so the nymph "charms" her; the male "seduces you and you take off" wording is
// not reachable.
import { minstapetrify } from './stoning';
import { petrifyingCorpse } from './stonetouch';
import {
  getPlayer,
  inventoryOf,
  itemsAt,
  type AttackDef,
  type Ctx,
  type Entity,
  type EntityId,
  type MonsterDef,
  type Msg,
} from '@nh/core';
import { stopOccupation } from './eat';
import { shopKeeper, insideShop, uShops } from './eshk';
import { encumberMsg } from './itemactions';
import { addToInventory, nhData, removeFromInventory, splitStack } from './items';
import { amuletOff, blindfOff, ringGone } from './jewelry';
import { moneyCnt } from './money';
import { canCarry, findGold, whichArmor } from './mongear';
import { monflee } from './monflee';
import { nomulNow } from './hunger';
import { setAfternmv, setAfternmvKey, setStealIds, stealIds } from './nomul';
import { armorSimpleName, doname, xnameOf } from './objnam';
import { canSpotMon, monNam, someMonNam } from './perception';
import { cloakOff, monInvisible, perceives, seeInvisible } from './invis';
import { P, hasProp, updateWornProps } from './props';
import { subfrombill } from './shk';
import { teleRestrict } from './teleport';
import { rlocMon } from './trap';
import { levitating } from './trapstate';
import { setSwapWep, swapWep } from './wield';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const hero = (ctx: Pick<Ctx, 'state'>): Entity => getPlayer(ctx.state);

/** ref: include/mondata.h is_animal() */
export const isAnimal = (def: MonsterDef): boolean => def.flags.includes('animal');

/** ref: S_NYMPH */
export const isNymph = (def: MonsterDef): boolean => def.glyph.ch === 'n';

/** The first gold stack `id` carries. ref: src/steal.c findgold() */
export const findgold = (ctx: Pick<Ctx, 'state' | 'defs'>, id: EntityId): Entity | null =>
  findGold(ctx, id);

/**
 * Some of a gold amount: all of it under 50, else a random part above a floor that grows with
 * it. ref: src/steal.c somegold()
 */
export function somegold(ctx: Pick<Ctx, 'rng'>, lmoney: number): number {
  const rn1 = (x: number, y: number): number => ctx.rng.rn2(x) + y;
  const igold = lmoney;
  if (igold < 50) return igold;
  if (igold < 100) return rn1(igold - 25 + 1, 25);
  if (igold < 500) return rn1(igold - 50 + 1, 50);
  if (igold < 1000) return rn1(igold - 100 + 1, 100);
  if (igold < 5000) return rn1(igold - 500 + 1, 500);
  if (igold < 10000) return rn1(igold - 1000 + 1, 1000);
  return rn1(igold - 5000 + 1, 5000);
}

/** The shopkeeper billing the hero for her unpaid items here. ref: shop_keeper(*u.ushops) */
function heroShk(ctx: Ctx): EntityId | null {
  const room = uShops(ctx)[0];
  const lvl = hero(ctx).c.pos?.level;
  return room === undefined || !lvl ? null : shopKeeper(ctx, lvl, room);
}

/**
 * The monster takes the object into its inventory (merging it into a stack it has); true when it
 * merged away. An unpaid object comes off the bill; a hero-owned object on a shop floor is no
 * longer free of charge. ref: src/steal.c mpickobj() (no light sources in engulfers, no
 * thrown/kicked object tracking, no forgotten object knowledge: objects keep what the hero knows)
 */
export function mpickobj(ctx: Ctx, monId: EntityId, item: Entity): boolean {
  const it = item.c.item;
  if (!it) return false;
  if (it.unpaid) {
    let shk: EntityId | null = null;
    if (it.carriedBy === ctx.state.playerId) shk = heroShk(ctx);
    else if (item.c.pos) {
      const level = ctx.state.levels[item.c.pos.level];
      const room = level ? insideShop(level, item.c.pos.x, item.c.pos.y) : null;
      if (level && room !== null) shk = shopKeeper(ctx, level.id, room);
    }
    if (shk !== null) subfrombill(ctx, item, shk);
  }
  delete it.noCharge;
  const into = addToInventory(ctx, monId, item.id);
  return into !== item.id;
}

/**
 * Leprechauns steal gold: from the floor under her ("snatches some gold from between your
 * feet!") or from her purse ("Your purse feels lighter."), then usually teleport away and flee.
 * ref: src/steal.c stealgold() (no steed, no slithy hero)
 */
export function stealgold(ctx: Ctx, mon: Entity): void {
  const h = hero(ctx);
  const p = h.c.pos;
  if (!p) return;
  const fgold =
    itemsAt(ctx.defs, ctx.state, p.level, p.x, p.y).find((o) => o.def === 'nh:gold_piece') ?? null;
  const ygold = findgold(ctx, h.id);
  const yq = ygold?.c.item?.quantity ?? 0;
  if (fgold && (!ygold || (fgold.c.item?.quantity ?? 0) > yq || !ctx.rng.rn2(5))) {
    mpickobj(ctx, mon.id, fgold); // obj_extract_self(), add_to_minv()
    // (no Flying)
    say(ctx, levitating(ctx) ? 'steal.snatches_beneath' : 'steal.snatches_between', {
      mon: monNam(ctx, mon),
    });
    if (!ygold || !ctx.rng.rn2(5)) {
      if (!teleRestrict(ctx, mon)) rlocMon(ctx, mon, true);
      monflee(ctx, mon.id, 0, false, false);
    }
  } else if (ygold) {
    // gold_price is 1
    const tmp = Math.min(somegold(ctx, moneyCnt(ctx, h.id)), yq);
    const taken = tmp < yq ? ctx.state.entities[String(splitStack(ctx, ygold.id, tmp))] : ygold;
    if (!taken) return;
    removeFromInventory(ctx, taken.id); // freeinv()
    addToInventory(ctx, mon.id, taken.id); // add_to_minv()
    say(ctx, 'steal.purse_lighter');
    if (!teleRestrict(ctx, mon)) rlocMon(ctx, mon, true);
    monflee(ctx, mon.id, 0, false, false);
  }
}

/**
 * The hero cannot respond to seduction: helpless and asleep, fainted, unconscious, frozen or
 * paralyzed. ref: src/steal.c unresponsive() (unconscious() by the helplessness reason)
 */
export function unresponsive(ctx: Pick<Ctx, 'state'>): boolean {
  const r = hero(ctx).c.helpless?.reasonKey;
  if (r === undefined) return false;
  return (
    r === 'helpless.asleep' ||
    r === 'helpless.fainted' ||
    r === 'helpless.rotten_food' ||
    r === 'helpless.passed_out' ||
    r.startsWith('helpless.frozen') ||
    r.startsWith('helpless.paralyzed')
  );
}

const ARMOR_SLOTS: ReadonlySet<string> = new Set([
  'body',
  'cloak',
  'shirt',
  'helm',
  'gloves',
  'boots',
  'shield',
]);
const ACCESSORY_SLOTS: ReadonlySet<string> = new Set(['ringL', 'ringR', 'amulet', 'blindfold']);

const isArmorWorn = (o: Entity): boolean => ARMOR_SLOTS.has(o.c.item?.equipped ?? '');
const isAccessoryWorn = (o: Entity): boolean => ACCESSORY_SLOTS.has(o.c.item?.equipped ?? '');

/**
 * The hero's worn or wielded item comes off (its "off" effects, silently for armor and rings).
 * ref: src/steal.c remove_worn_item() (Armor_off() and the others have no messages for the
 * armor this port has; Amulet_off() says "You were wearing ...", Blindf_off() may say "You can
 * see again.")
 */
export function removeWornItem(ctx: Ctx, obj: Entity): void {
  const it = obj.c.item;
  if (!it) return;
  const slot = it.equipped;
  if (slot === 'amulet') amuletOff(ctx, obj);
  else if (slot === 'ringL' || slot === 'ringR') ringGone(ctx, obj);
  else if (slot === 'blindfold') blindfOff(ctx, obj);
  else if (slot) {
    it.equipped = null; // Armor_off() .. Shirt_off(), uwepgone()
    updateWornProps(ctx.state, ctx.defs, ctx.state.playerId);
    if (slot === 'cloak') cloakOff(ctx, obj);
  }
  if (swapWep(ctx)?.id === obj.id) setSwapWep(ctx, null); // uswapwepgone()
}

/** The item's doname with its worn suffix changed as worn_item_removal() does. */
function removalName(ctx: Ctx, obj: Entity): Msg {
  const d = doname(ctx.state, ctx.defs, obj);
  const params = { ...(d.params ?? {}) };
  const worn = params['worn'];
  const wkey = typeof worn === 'object' && worn !== null && 'key' in worn ? worn.key : '';
  // "(being worn)" and "(alternate weapon; not wielded)" go; "(on left hand)" becomes "(from ...)"
  if (wkey === 'obj.worn' || wkey.startsWith('obj.alternate')) params['worn'] = '';
  else if (wkey === 'obj.on_left_hand') params['worn'] = { key: 'steal.from_left_hand' };
  else if (wkey === 'obj.on_right_hand') params['worn'] = { key: 'steal.from_right_hand' };
  return { ...d, params };
}

/**
 * "The water nymph takes off your +0 leather cloak." before the item comes off; true when the
 * removal itself printed nothing (C's PLNMSG_MON_TAKES_OFF_ITEM stays the last message).
 * ref: src/steal.c worn_item_removal()
 */
function wornItemRemoval(ctx: Ctx, mon: Entity, obj: Entity): boolean {
  const slot = obj.c.item?.equipped ?? null;
  const isWeapon = slot === 'weapon' || swapWep(ctx)?.id === obj.id;
  const verb = isWeapon ? 'disarms' : isAccessoryWorn(obj) ? 'removes' : 'takes_off';
  say(ctx, `steal.${verb}`, { mon: someMonNam(ctx, mon), item: removalName(ctx, obj) });
  removeWornItem(ctx, obj);
  return slot !== 'amulet' && slot !== 'blindfold';
}

/** "your cloak" for worn armor, else yname(). */
const stealName = (ctx: Ctx, obj: Entity): Msg =>
  isArmorWorn(obj)
    ? { key: 'steal.your', params: { item: armorSimpleName(ctx.defs.object(obj.def)) } }
    : { key: 'steal.your', params: { item: xnameOf(ctx.state, ctx.defs, obj) } };

/** The hero's items, not counting gold. ref: src/invent.c inv_cnt(FALSE) */
const heroItems = (ctx: Ctx): Entity[] =>
  inventoryOf(ctx.state, ctx.state.playerId).filter((o) => ctx.defs.object(o.def).class !== 'coin');

const worn = (ctx: Ctx, slot: string): Entity | null =>
  inventoryOf(ctx.state, ctx.state.playerId).find((o) => o.c.item?.equipped === slot) ?? null;

const welded = (o: Entity | null): boolean => o !== null && o.c.item?.buc === 'cursed';

/**
 * A nymph or monkey next to the hero steals an item. Returns C's result: 1 when something was
 * taken (or the thief should flee now), 0 when not (or the hero is helpless, taking off armor
 * for it: `stealarm()` finishes the theft through afternmv), -1 if the thief died; and the
 * stolen item's name (C's objnambuf) for the monkey's "tries to run away with" line.
 * ref: src/steal.c steal() (no ball and chain, leashes, boulders, food being eaten, donning or
 * doffing in progress: wearing and taking off take effect at their start in this port)
 */
export function steal(ctx: Ctx, mon: Entity): { stolen: Msg | null; result: number } {
  const def = ctx.defs.monster(mon.def);
  const monkeyBusiness = isAnimal(def);
  const seen = canSpotMon(ctx, mon);
  const h = hero(ctx);
  const mp = mon.c.pos;
  const hp = h.c.pos;
  // the following is true if successful on first of two attacks
  if (
    !mp ||
    !hp ||
    mp.level !== hp.level ||
    Math.max(Math.abs(mp.x - hp.x), Math.abs(mp.y - hp.y)) > 1
  )
    return { stolen: null, result: 0 };
  // remember the name as it is now ("Someone" if unseen)
  let monnambuf = someMonNam(ctx, mon);

  const nothingToSteal = (): { stolen: null; result: number } => {
    // (no ball and chain, no buried ball)
    if (hasProp(h, P.BLINDED)) say(ctx, 'steal.nothing_blind');
    else if (findgold(ctx, h.id)) say(ctx, 'steal.not_gold', { mon: monnambuf });
    else say(ctx, 'steal.nothing', { mon: monnambuf });
    return { stolen: null, result: 1 }; // let her flee
  };
  if (heroItems(ctx).length === 0) return nothingToSteal();

  const uarm = worn(ctx, 'body');
  const uarmc = worn(ctx, 'cloak');
  const uarmu = worn(ctx, 'shirt');
  const uarmg = worn(ctx, 'gloves');
  const uleft = worn(ctx, 'ringL');
  const uright = worn(ctx, 'ringR');
  const uwep = worn(ctx, 'weapon');
  const adorn = (r: Entity | null): boolean => r?.def === 'nh:ring_of_adornment';

  let otmp: Entity | null = null;
  // skip ring special cases for animals and when gloves are worn
  if (!monkeyBusiness && !uarmg) {
    if (adorn(uleft)) otmp = uleft;
    else if (adorn(uright)) otmp = uright;
  }
  if (!otmp) {
    const eligible = (o: Entity): boolean => !uarm || o.id !== uarmc?.id;
    const weight = (o: Entity): number => (isArmorWorn(o) || isAccessoryWorn(o) ? 5 : 1);
    let tmp = 0;
    for (const o of heroItems(ctx)) if (eligible(o)) tmp += weight(o);
    if (!tmp) return nothingToSteal();
    tmp = ctx.rng.rn2(tmp);
    for (const o of heroItems(ctx)) {
      if (!eligible(o)) continue;
      tmp -= weight(o);
      if (tmp < 0) {
        otmp = o;
        break;
      }
    }
    if (!otmp) return { stolen: null, result: 0 }; // impossible("Steal fails!")
    // can't steal ring(s) while wearing gloves
    if ((otmp.id === uleft?.id || otmp.id === uright?.id) && uarmg) otmp = uarmg;
    // can't steal gloves while wielding - so steal the wielded item
    if (otmp.id === uarmg?.id && uwep) otmp = uwep;
    // can't steal armor while wearing cloak - so steal the cloak
    else if (otmp.id === uarm?.id && uarmc) otmp = uarmc;
    // can't steal shirt while wearing cloak or suit
    else if (otmp.id === uarmu?.id && uarmc) otmp = uarmc;
    else if (otmp.id === uarmu?.id && uarm) otmp = uarm;
  }
  // gotobj:
  if (otmp.id === stealIds(ctx).oid) return { stolen: null, result: 0 };

  const it = otmp.c.item;
  if (!it) return { stolen: null, result: 0 };
  const cantTake = (): { stolen: null; result: number } => {
    const how = ['steal', 'snatch', 'grab', 'take'][ctx.rng.rn2(4)] ?? 'steal';
    say(ctx, 'steal.gives_up', {
      mon: monnambuf,
      how: { key: `steal.how.${how}` },
      item: otmp ? stealName(ctx, otmp) : '',
    });
    // the fewer items you have, the less likely the thief is going to stick around to try again
    // (0) instead of running away (1)
    return {
      stolen: null,
      result: !ctx.rng.rn2(Math.trunc(heroItems(ctx).length / 5) + 2) ? 1 : 0,
    };
  };
  // animals can't overcome curse stickiness
  if (monkeyBusiness) {
    const slot = it.equipped;
    const bimanual = uwep ? ctx.defs.object(uwep.def).weapon?.bimanual === true : false;
    const ostuck =
      swapWep(ctx)?.id === otmp.id
        ? false // not really worn; curse doesn't matter (no quiver)
        : (it.buc === 'cursed' && slot !== null) ||
          // nymphs can steal rings from under cursed weapon but animals can't
          (slot === 'ringR' && welded(uwep)) || // RING_ON_PRIMARY
          (slot === 'ringL' && welded(uwep) && bimanual);
    if (ostuck || canCarry(ctx, mon.id, otmp) === 0) return cantTake();
  }

  // (no leashes; no donning or doffing in progress to stop: olddelay is 0)
  stopOccupation(ctx); // you're going to notice the theft...

  let named = 0;
  let quietRemoval = false;
  if (isArmorWorn(otmp) || isAccessoryWorn(otmp)) {
    if (isAccessoryWorn(otmp)) {
      quietRemoval = wornItemRemoval(ctx, mon, otmp);
    } else {
      const armordelay = ctx.defs.object(otmp.def).delay;
      if (monkeyBusiness || unresponsive(ctx)) {
        // animals usually don't have enough patience to take off items which require extra
        // time; unconscious or paralyzed hero can't be charmed into taking off her own armor
        if (armordelay >= 1 && ctx.rng.rn2(10)) return cantTake();
        quietRemoval = wornItemRemoval(ctx, mon, otmp);
      } else {
        const curssv = it.buc === 'cursed';
        const helpless = h.c.helpless !== undefined;
        const slowly = armordelay >= 1 || helpless;
        // flags.female: "She charms you.  You gladly hand over your cloak."
        say(ctx, 'steal.charms', {
          mon: !seen ? '@pronoun.she' : monnambuf,
          how: {
            key: curssv
              ? 'steal.charm.let_her_take'
              : !slowly
                ? 'steal.charm.hand_over'
                : 'steal.charm.start_removing',
          },
          item: armorSimpleName(ctx.defs.object(otmp.def)),
        });
        named++;
        // the following is to set multi for later on: nomul(-armordelay), "taking off clothes",
        // nomovemsg = 0 ("You can move again."); a longer helplessness is kept (nomul()'s
        // `if (multi < nval) return`)
        if (helpless) {
          const hl = h.c.helpless;
          if (hl) hl.reasonKey = 'helpless.taking_off_clothes';
          nhData(ctx).nomovemsg = { key: 'eat.can_move_again' };
        } else
          nomulNow(ctx, armordelay, 'helpless.taking_off_clothes', {
            key: 'eat.can_move_again',
          });
        removeWornItem(ctx, otmp); // the curse is ignored (curssv)
        if (h.c.helpless !== undefined) {
          setStealIds(ctx, otmp.id, mon.id);
          setAfternmvKey(ctx, 'stealarm');
          return { stolen: null, result: 0 };
        }
      }
    }
    // hero's blindfold might have just been stolen; if so, replace "Someone" with Monnam
    if (!seen && canSpotMon(ctx, mon)) monnambuf = monNam(ctx, mon);
  } else if (it.equipped !== null || swapWep(ctx)?.id === otmp.id) {
    // weapon
    quietRemoval = wornItemRemoval(ctx, mon, otmp);
  }

  // do this before removing it from inventory
  const stolen = stealName(ctx, otmp);
  // (no mavenge: knights' retaliation penalty is not ported)
  if (it.unpaid) {
    const shk = heroShk(ctx);
    if (shk !== null) subfrombill(ctx, otmp, shk);
  }
  removeFromInventory(ctx, otmp.id); // freeinv()
  // if we just gave a message about removing a worn item and there have been no intervening
  // messages, shorten '<mon> stole <item>' message
  if (quietRemoval && isNymph(def)) ++named;
  say(ctx, 'steal.stole', {
    mon: named ? '@pronoun.she' : monnambuf,
    item: doname(ctx.state, ctx.defs, otmp),
  });
  encumberMsg(ctx);
  const couldPetrify = petrifyingCorpse(ctx, otmp);
  mpickobj(ctx, mon.id, otmp);
  // a stolen cockatrice corpse petrifies a gloveless thief
  if (couldPetrify && !whichArmor(ctx, mon.id, 'gloves')) {
    minstapetrify(ctx, mon, true);
    return { stolen, result: -1 };
  }
  return { stolen, result: h.c.helpless !== undefined ? 0 : 1 };
}

/**
 * Finish stealing an item of armor which took several turns to take off: the thief takes it,
 * flees and teleports away, if it is still there next to her and still steals.
 * ref: src/steal.c stealarm()
 */
function stealarm(ctx: Ctx): void {
  const { oid, mid } = stealIds(ctx);
  setStealIds(ctx, null, null);
  if (oid === null || mid === null) return;
  const otmp = ctx.state.entities[String(oid)];
  if (otmp?.c.item?.carriedBy !== ctx.state.playerId) return;
  const mon = ctx.state.entities[String(mid)];
  if (!mon?.c.monster) return;
  const def = ctx.defs.monster(mon.def);
  // maybe the thief lost its steal attack, or the hero moved away
  const mp = mon.c.pos;
  const hp = hero(ctx).c.pos;
  if (
    !def.attacks.some((a) => a.ad === 'sitm') ||
    !mp ||
    !hp ||
    mp.level !== hp.level ||
    (mp.x - hp.x) ** 2 + (mp.y - hp.y) ** 2 > 2
  )
    return;
  if (otmp.c.item?.unpaid) {
    const shk = heroShk(ctx);
    if (shk !== null) subfrombill(ctx, otmp, shk);
  }
  removeFromInventory(ctx, otmp.id); // freeinv()
  say(ctx, 'steal.steals', { mon: monNam(ctx, mon), item: doname(ctx.state, ctx.defs, otmp) });
  mpickobj(ctx, mon.id, otmp);
  // implies seduction, "you gladly hand over ..." so we don't set mavenge bit here
  monflee(ctx, mon.id, 0, false, false);
  if (!teleRestrict(ctx, mon)) rlocMon(ctx, mon, true);
}

/**
 * The thief died while she was taking off the armor for it: "You finish taking off your
 * cloak." ref: src/steal.c unstolenarm()
 */
function unstolenarm(ctx: Ctx): void {
  const { oid } = stealIds(ctx);
  setStealIds(ctx, null, null);
  const obj = oid === null ? undefined : ctx.state.entities[String(oid)];
  if (obj?.c.item?.carriedBy === ctx.state.playerId)
    say(ctx, 'steal.finish_taking_off', { item: armorSimpleName(ctx.defs.object(obj.def)) });
}

setAfternmv('stealarm', stealarm);
setAfternmv('unstolenarm', unstolenarm);

/**
 * Whether the attacker could seduce the defender with this attack (or at all, with `atk` null):
 * 0 no, 1 yes, 2 "wrong gender for a nymph" (still steals, "engagingly"). Only nymphs (and
 * incubi/succubi, not in the roster) with a theft or seduction damage type.
 * An invisible seducer cannot seduce a defender that does not see invisible.
 * ref: src/mhitu.c could_seduce() (the hero is female; monsters have no gender of their own yet,
 * so one not flagged female counts as male: DEVIATIONS "Theft")
 */
export function couldSeduce(
  ctx: Pick<Ctx, 'state' | 'defs'>,
  magr: Entity,
  mdef: Entity,
  atk: AttackDef | null,
): number {
  if (magr.id === ctx.state.playerId) return 0; // 7f: the polymorphed hero
  const pagr = ctx.defs.monster(magr.def);
  if (isAnimal(pagr)) return 0;
  const female = (e: Entity): number =>
    e.id === ctx.state.playerId ? 1 : ctx.defs.monster(e.def).flags.includes('female') ? 1 : 0;
  const has = (ad: string): boolean => pagr.attacks.some((a) => a.ad === ad);
  let adtyp = atk ? atk.ad : has('ssex') ? 'ssex' : has('sedu') ? 'sedu' : 'phys';
  if (adtyp === 'ssex') adtyp = 'sedu'; // !SYSOPT_SEDUCE: DECISIONS m9 taken default 7
  // agrinvis && !defperc
  const defperc =
    mdef.id === ctx.state.playerId
      ? seeInvisible(ctx.state)
      : perceives(ctx.defs.monster(mdef.def));
  if (monInvisible(ctx, magr) && !defperc && adtyp === 'sedu') return 0;
  if (!isNymph(pagr) || (adtyp !== 'sedu' && adtyp !== 'sitm')) return 0;
  return female(magr) === 1 - female(mdef) ? 1 : 2;
}
