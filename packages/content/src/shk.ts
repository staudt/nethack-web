// Shopkeeping: what happens as the hero comes into a shop and leaves it, and the bill: picking up
// shop goods puts them on it, putting them back takes them off, using them up keeps them there;
// selling what she drops, charging for what she throws or kicks out and for using unpaid goods;
// robbery, his anger and making up, and what he says when she chats with him (6b3 steps 2-5).
// Never import actions, itemactions, monmove, combat, peaceful, chat, priest, dothrow or rooms
// here: they import this module.
// ref: src/shk.c u_entered_shop(), u_left_shop(), deserted_shop(), pacify_shk(), shkname(),
// addtobill(), add_one_tobill(), bill_box_content(), billable(), picked_container(),
// dropped_container(), sub_one_frombill(), subfrombill(), obfree(), shk_names_obj(),
// append_honorific(), sellobj_state(), sellobj(), check_credit(), pay(), rouse_shk(),
// find_objowner(), costly_adjacent(), stolen_container(), stolen_value(), cost_per_charge(),
// check_unpaid_usage(), rob_shop(), call_kops(), setpaid(), clear_unpaid(), clear_no_charge(),
// hot_pursuit(), rile_shk(), make_happy_shk(), make_happy_shoppers(), home_shk(),
// make_angry_shk(), shkgone(), shk_chat(), shop_object(), price_quote(), shk_embellish();
// src/mkobj.c costly_alteration(), bill_dummy_object(); src/invent.c count_contents();
// src/dothrow.c check_shop_obj(); src/role.c Hello(); src/dog.c losedogs() (dismiss_kops)
//
// Not ported: invisible heroes and steeds (neither exists), deafness and mute keepers, the
// pick-axe (no such object: only the dwarvish mattock is checked), the shop achievement, globs,
// gold picked up in a shop (no loan: costly_gold()), gold dropped in a shop (no credit for gold:
// donate_gold(); DEVIATIONS), remembered price quotes (record_price_quote()), special_stock()
// (no Candelabrum), balls and chains, the spellbook, oil, horn and bag usage fees (no callers
// yet), Keystone Kops (call_kops() only sounds the alarm; DEVIATIONS), remote_burglary().
import {
  NORMAL_SPEED,
  contents,
  getLevel,
  getPlayer,
  inRooms,
  inventoryOf,
  itemsAt,
  roomHas,
  sortedIds,
  type Ctx,
  type Entity,
  type EntityId,
  type Json,
  type Level,
  type Params,
  type Pos,
  type Prompt,
} from '@nh/core';
import {
  BILLSZ,
  billOf,
  costlySpot,
  dropBillEntry,
  eshkOf,
  inhishop,
  insideShop,
  isShopType,
  onbill,
  shkName,
  shopKeeper,
  uShops,
  usedUpEntry,
  type BillEntry,
  type Eshk,
} from './eshk';
import { mnextoPos } from './generation';
import { isCandle } from './items';
import { adjalign, uState } from './luck';
import { money2mon, money2u, moneyCnt } from './money';
import { isFrozen, unfreezeMonst } from './mstate';
import { discover, isKnown } from './o_init';
import { doname, paydoname, xnameOf, zorkmids } from './objnam';
import { canSpotMon } from './perception';
import {
  containedCost,
  containedGold,
  containedSellCost,
  countUnpaid,
  getCost,
  isUnpaid,
  setCost,
  topContainer,
  unpaidCost,
} from './price';
import { P, hasProp } from './props';
import { SHTYPES, saleable, shopType } from './shtypes';
import { emptyShops, setEmptyShops, setURooms, uRooms } from './urooms';
import { angryGuards, pacifyGuards } from './watch';

const MATTOCK = 'nh:dwarvish_mattock';

/**
 * The shopkeeper's name as a proper-name param; while the hero hallucinates, a random name from a
 * random non-unique shop type's list. ref: src/shknam.c shkname()
 */
export function shkname(ctx: Pick<Ctx, 'state' | 'cosmetic'>, e: Eshk): string {
  if (hasProp(getPlayer(ctx.state), P.HALLUC) && !ctx.state.gameOver) {
    const num = SHTYPES.findIndex((t) => t.prob === 0);
    const types = num === -1 ? SHTYPES : SHTYPES.slice(0, num);
    const names = types[ctx.cosmetic.rn2(types.length)]?.names ?? [];
    const n = names[ctx.cosmetic.rn2(names.length)];
    if (n !== undefined) return shkName({ ...e, shknam: n });
  }
  return shkName(e);
}

/** The role's greeting, as a message key param. ref: src/role.c Hello() (to a shopkeeper) */
export function hello(ctx: Pick<Ctx, 'state'>): string {
  switch (getPlayer(ctx.state).c.player?.role) {
    case 'nh:knight':
      return '@shk.hello.knight';
    case 'nh:samurai':
      return '@shk.hello.samurai';
    case 'nh:tourist':
      return '@shk.hello.tourist';
    case 'nh:valkyrie':
      return '@shk.hello.valkyrie';
    default:
      return '@shk.hello';
  }
}

/**
 * The hero's name as a message param: the role's name, since the port has no player name
 * (DEVIATIONS). ref: svp.plname
 */
export function plname(ctx: Pick<Ctx, 'state' | 'defs'>): string {
  const role = getPlayer(ctx.state).c.player?.role;
  return role === undefined ? '@shk.customer' : `@${ctx.defs.role(role).nameKey}`;
}

/** The shop's name as a message param ("lighting store"). ref: shtypes[].name */
export function shopNameParam(level: Level, room: number): string {
  const t = shopType(level.rooms[room]?.type);
  return t ? `@${t.nameKey}` : '@shop.name.general';
}

/** Makes him peaceful, taking back the anger surcharge on the bill. ref: src/shk.c pacify_shk() */
export function pacifyShk(ctx: Pick<Ctx, 'state'>, shk: EntityId, clearSurcharge: boolean): void {
  const m = ctx.state.entities[String(shk)]?.c.monster;
  const e = eshkOf(ctx, shk);
  if (m) m.peaceful = true;
  if (clearSurcharge && e?.surcharge) {
    e.surcharge = false;
    for (const bp of e.bill) bp.price -= Math.trunc((bp.price + 3) / 4); // undo 33% increase
  }
}

/** The mattocks the hero carries. ref: carrying(DWARVISH_MATTOCK) and its count */
export function carriedPicks(ctx: Pick<Ctx, 'state'>): number {
  return inventoryOf(ctx.state, ctx.state.playerId).filter((o) => o.def === MATTOCK).length;
}

/** She is fast with a mattock at her feet, so could pick it up inside. ref: `Fast && sobj_at()` */
export function fastWithPickHere(ctx: Pick<Ctx, 'state' | 'defs'>): boolean {
  const hero = getPlayer(ctx.state);
  const p = hero.c.pos;
  if (!p || !hasProp(hero, P.FAST)) return false;
  return itemsAt(ctx.defs, ctx.state, p.level, p.x, p.y).some((o) => o.def === MATTOCK);
}

/** The monster stands still and silent (asleep or paralyzed). ref: helpless() in muteshk() */
export function helpless(ctx: Pick<Ctx, 'state'>, id: EntityId): boolean {
  const m = ctx.state.entities[String(id)]?.c.monster;
  return !m || m.asleep || isFrozen(ctx, id);
}

/**
 * The message on entering a shop whose keeper is dead or away: "deserted" when the hero knows
 * no one is in it, "untended" when someone is; "is" when she sees them all, "seems to be" else.
 * ref: src/shk.c deserted_shop()
 */
function desertedShop(ctx: Ctx, level: Level, room: number): void {
  const r = level.rooms[room];
  if (!r) return;
  const hero = getPlayer(ctx.state);
  const hp = hero.c.pos;
  let m = 0;
  let n = 0;
  for (const id of sortedIds(ctx.state)) {
    const mon = ctx.state.entities[String(id)];
    const p = mon?.c.pos;
    if (!mon?.c.monster || !p || p.level !== level.id) continue;
    if (p.x < r.lx || p.x > r.hx || p.y < r.ly || p.y > r.hy) continue;
    if (hp && p.x === hp.x && p.y === hp.y) continue;
    ++n;
    if (canSpotMon(ctx, mon)) ++m; // sensemon() || canseemon() (no mimics)
  }
  // force feedback to be less specific
  if (hasProp(hero, P.BLINDED) && !hasProp(hero, P.TELEPAT)) ++n;
  ctx.emit({
    type: 'msg',
    key: n === 0 ? 'shk.deserted' : m < n ? 'shk.seems_untended' : 'shk.untended',
  });
}

/**
 * The hero has just come into shop `room` (its door or floor). With no keeper in it: the deserted
 * message once, and she counts as in no shop (u.ushops cleared) until he is back. Else a new
 * customer is welcomed (and he is pacified), an angry keeper or one with a surcharge warns her, one
 * who was robbed mutters; at the door with a mattock she is asked to leave it outside and he gets
 * an extra move to block her way in.
 * ref: src/shk.c u_entered_shop()
 */
export function uEnteredShop(ctx: Ctx, room: number): void {
  const level = getLevel(ctx.state);
  const shk = shopKeeper(ctx, level.id, room);
  const eshk = shk === null ? null : eshkOf(ctx, shk);
  if (shk === null || !eshk || !inhishop(ctx, shk)) {
    // (C's in_rooms() comparison for the no-keeper case is folded into empty_shops)
    if (!emptyShops(ctx).includes(room)) desertedShop(ctx, level, room);
    setEmptyShops(ctx, uShops(ctx));
    setURooms(ctx, uRooms(ctx), []);
    return;
  }
  const mon = ctx.state.entities[String(shk)];
  if (!eshk.customer) {
    // You seem to be new here (C: `(!visitct || *customer) && customer != plname`; there is only
    // one hero, so that is her first visit)
    eshk.visitct = 0;
    eshk.following = false;
    eshk.customer = true;
    pacifyShk(ctx, shk, true);
  }
  if (helpless(ctx, shk) || eshk.following) return; // no dialog

  const shop = shopNameParam(level, room);
  const name = plname(ctx);
  if (!mon?.c.monster?.peaceful) {
    ctx.emit({
      type: 'msg',
      key: 'shk.dare_return',
      params: { name, shk: shkname(ctx, eshk), shop },
    });
  } else if (eshk.surcharge) {
    ctx.emit({ type: 'msg', key: 'shk.back_again', params: { name } });
  } else if (eshk.robbed > 0) {
    ctx.emit({ type: 'msg', key: 'shk.mutters', params: { shk: shkname(ctx, eshk) } });
  } else {
    ctx.emit({
      type: 'msg',
      key: eshk.visitct++ ? 'shk.welcome_again' : 'shk.welcome',
      params: { hello: hello(ctx), name, shk: shkname(ctx, eshk), shop },
    });
  }
  // can't do anything about blocking if teleported in
  const hp = getPlayer(ctx.state).c.pos;
  if (!hp || insideShop(level, hp.x, hp.y) !== null) return;
  const notUpset = !eshk.surcharge;
  const cnt = carriedPicks(ctx);
  let shouldBlock: boolean;
  if (cnt > 0) {
    // [ALI] Shopkeeper identifies mattock(s)
    if (!hasProp(getPlayer(ctx.state), P.BLINDED)) discover(ctx, MATTOCK);
    ctx.emit({
      type: 'msg',
      key: notUpset ? 'shk.leave_outside_please' : 'shk.leave_outside',
      params: { tool: cnt > 1 ? '@shk.mattocks' : '@shk.mattock' },
    });
    shouldBlock = true;
  } else shouldBlock = fastWithPickHere(ctx);
  // shk gets extra move (C calls dochug(); here a turn's worth of energy, so he moves next)
  const actor = mon?.c.actor;
  if (shouldBlock && actor) actor.energy += NORMAL_SPEED;
}

// ---------------------------------------------------------------------------------------------
// leaving a shop

/** On a room's wall or door: C's `levl[x][y].edge`. */
function isEdge(level: Level, x: number, y: number): boolean {
  return inRooms(level, x, y).some((r) => !roomHas(level, r, x, y));
}

/**
 * The hero was in a shop before her last move (u.ushops0) and `left` are the shops she has left.
 * Stepping from the floor onto the door with an unpaid bill or debt gets a warning (unless he is
 * asleep or paralysed); leaving with them is robbery and sounds the alarm. `from`: her square
 * before the move (u.ux0/u.uy0), when known. `newlev`: she is leaving the level (the caller has
 * the old level current). ref: src/shk.c u_left_shop()
 */
export function uLeftShop(
  ctx: Ctx,
  ushops0: readonly number[],
  left: readonly number[],
  newlev: boolean,
  from?: Pos,
): void {
  const level = getLevel(ctx.state);
  const hp = getPlayer(ctx.state).c.pos;
  if (left.length === 0) {
    // she didn't leave outright: nothing to do unless she just stepped from the shop floor onto
    // its edge
    if (newlev || !hp || !from || !isEdge(level, hp.x, hp.y) || isEdge(level, from.x, from.y))
      return;
  }
  const room = left[0] ?? ushops0[0];
  const shk = room === undefined ? null : shopKeeper(ctx, level.id, room);
  const e = shk === null ? null : eshkOf(ctx, shk);
  if (shk === null || !e || !inhishop(ctx, shk)) return; // shk died, teleported, changed levels...
  if (e.bill.length === 0 && e.debit === 0) return; // bill is settled
  if (left.length === 0 && !helpless(ctx, shk)) {
    // Player just stepped onto shop-boundary: try to intimidate him into paying his bill
    // (a mute keeper cannot, and she has robbed him)
    ctx.emit({
      type: 'msg',
      key: e.surcharge ? 'shk.dont_leave' : 'shk.pay_before_leaving',
      params: { name: plname(ctx) },
    });
    return;
  }
  if (robShop(ctx, shk, e)) callKops(ctx);
}

// ---------------------------------------------------------------------------------------------
// the bill

/** A free object id for a used-up bill entry's object. ref: src/mkobj.c next_ident() */
function nextIdent(ctx: Pick<Ctx, 'state'>): EntityId {
  return ctx.state.nextEntityId++;
}

/** A copy of the object for a used-up bill entry (billobjs). */
function snapshot(obj: Entity, quantity: number): NonNullable<BillEntry['gone']> {
  const it = obj.c.item;
  if (!it) throw new Error('snapshot: not an item');
  const item = {
    ...it,
    known: { ...it.known },
    ...(it.erosion ? { erosion: { ...it.erosion } } : {}),
    quantity,
    carriedBy: null,
    letter: null,
    equipped: null,
  };
  delete item.containedIn;
  delete item.lit;
  delete item.unpaid;
  delete item.noCharge;
  return { def: obj.def, item };
}

/** The object a bill entry is for: the live one, or the used-up copy. ref: src/shk.c bp_to_obj() */
export function bpToObj(ctx: Pick<Ctx, 'state'>, bp: BillEntry): Entity | null {
  if (bp.useup) return bp.gone ? { id: bp.oid, def: bp.gone.def, c: { item: bp.gone.item } } : null;
  return ctx.state.entities[String(bp.oid)] ?? null;
}

/** Clears no_charge on everything inside `obj`. ref: src/shk.c picked_container() */
function pickedContainer(ctx: Ctx, obj: Entity): void {
  for (const o of contents(ctx.state, obj.id)) {
    if (ctx.defs.object(o.def).class === 'coin') continue;
    if (o.c.item) delete o.c.item.noCharge;
    pickedContainer(ctx, o);
  }
}

/**
 * Marks everything inside `obj` that is not on the bill (nor just sold to him: `sale`) as
 * no-charge. ref: src/shk.c dropped_container()
 */
function droppedContainer(ctx: Ctx, obj: Entity, e: Eshk, sale: boolean): void {
  for (const o of contents(ctx.state, obj.id)) {
    const it = o.c.item;
    if (!it || ctx.defs.object(o.def).class === 'coin') continue;
    if (!it.unpaid && !(sale && saleable(ctx, e, o))) it.noCharge = true;
    droppedContainer(ctx, o, e, sale);
  }
}

/** The outermost container of `obj` is not carried, and lies on the keeper's own spot. */
function floorState(ctx: Ctx, obj: Entity, e: Eshk): { onFloor: boolean; freespot: boolean } {
  const top = topContainer(ctx.state, obj);
  // pick_obj() takes it off the floor before billing: a free object counts as on the floor, at
  // the hero's feet
  const onFloor = top.c.item?.carriedBy === null;
  const p = (onFloor ? top.c.pos : null) ?? getPlayer(ctx.state).c.pos;
  return { onFloor, freespot: onFloor && !!p && p.x === e.shk.x && p.y === e.shk.y };
}

/**
 * The keeper of shop `roomno` when he is there and thinks the object is his to bill (it is not
 * on his bill yet, nor eaten into; a no-charge object only for its contents, and picking it up
 * clears no_charge: `resetNocharge`). ref: src/shk.c billable()
 */
function billable(
  ctx: Ctx,
  obj: Entity,
  roomno: number | undefined,
  resetNocharge: boolean,
  known: EntityId | null = null,
): EntityId | null {
  let shk = known;
  if (shk === null) {
    if (roomno === undefined) return null;
    shk = shopKeeper(ctx, ctx.state.currentLevel, roomno);
    if (shk === null || !inhishop(ctx, shk)) return null;
  }
  const e = eshkOf(ctx, shk);
  const it = obj.c.item;
  if (!e || !it) return null;
  // perhaps we threw it away earlier
  if (onbill(ctx, obj.id, shk) || (ctx.defs.object(obj.def).class === 'food' && it.eaten))
    return null;
  // outer container might be marked no_charge but still have contents which should be charged
  // for; clear no_charge when picking things up
  if (it.noCharge) {
    let ok = true;
    const { onFloor, freespot } = floorState(ctx, obj, e);
    if (
      contents(ctx.state, obj.id).length === 0 ||
      (containedGold(ctx.state, ctx.defs, obj) === 0 &&
        containedCost(ctx.state, ctx.defs, obj, e, 0, !resetNocharge, onFloor, freespot) === 0)
    )
      ok = false; // not billable
    if (resetNocharge && !ok && ctx.defs.object(obj.def).class !== 'coin') {
      delete it.noCharge;
      pickedContainer(ctx, obj);
    }
    if (!ok) return null;
  }
  return shk;
}

/** Puts the object on `shk`'s bill (`dummy`: a used-up copy). ref: src/shk.c add_one_tobill() */
function addOneTobill(ctx: Ctx, obj: Entity, dummy: boolean, shk: EntityId): void {
  const e = eshkOf(ctx, shk);
  const it = obj.c.item;
  if (!e || !it) return;
  if (billable(ctx, obj, undefined, true, shk) === null) return; // shk doesn't want it
  if (e.bill.length >= BILLSZ) {
    ctx.emit({ type: 'msg', key: 'shk.free' }); // shk's bill is completely full
    return;
  }
  const bp: BillEntry = {
    oid: obj.id,
    bquan: it.quantity,
    price: getCost(ctx.state, ctx.defs, obj, e),
    useup: dummy,
  };
  if (dummy) bp.gone = snapshot(obj, it.quantity);
  e.bill.push(bp);
  it.unpaid = true;
}

/** Bills the shop goods inside `obj`, nested too. ref: src/shk.c bill_box_content() */
function billBoxContent(ctx: Ctx, obj: Entity, dummy: boolean, shk: EntityId): void {
  for (const o of contents(ctx.state, obj.id)) {
    if (ctx.defs.object(o.def).class === 'coin') continue;
    // the "top" box is added in addtobill()
    if (!o.c.item?.noCharge) addOneTobill(ctx, o, dummy, shk);
    billBoxContent(ctx, o, dummy, shk);
  }
}

/** ref: src/shk.c append_honorific() (no udemigod, vampires or elves: a human lady) */
function honorific(ctx: Ctx): { hon: string; title: string } {
  return { hon: `@shk.hon.${ctx.rng.rn2(4)}`, title: '@shk.lady' };
}

/** The object's name, singular. ("fool xname() into giving singular") */
function xname1(ctx: Ctx, obj: Entity) {
  const it = obj.c.item;
  if (!it || it.quantity === 1) return xnameOf(ctx.state, ctx.defs, obj);
  return xnameOf(ctx.state, ctx.defs, { ...obj, c: { ...obj.c, item: { ...it, quantity: 1 } } });
}

/**
 * Puts a shop object the hero takes on the bill of the shop she is in (`roomno`: the shop it lay
 * in, as pick_obj() fakes u.ushops) and tells her the price: "For you, esteemed lady; only 13
 * zorkmids for this tallow candle." (`ininv`: she has it), "The X will cost you N zorkmids." A
 * container is billed with its contents, each its own entry. `dummy`: a used-up copy (eating
 * floor food). ref: src/shk.c addtobill()
 */
export function addtobill(
  ctx: Ctx,
  obj: Entity,
  ininv: boolean,
  dummy: boolean,
  silent: boolean,
  roomno: number | undefined = uShops(ctx)[0],
): void {
  const shk = billable(ctx, obj, roomno, true);
  const e = shk === null ? null : eshkOf(ctx, shk);
  const it = obj.c.item;
  if (shk === null || !e || !it) return;
  if (ctx.defs.object(obj.def).class === 'coin') return; // costly_gold(): no loan (DEVIATIONS)
  if (e.bill.length >= BILLSZ) {
    if (!silent) ctx.emit({ type: 'msg', key: 'shk.free' });
    return;
  }
  let ltmp = 0;
  const container = contents(ctx.state, obj.id).length > 0;
  if (!it.noCharge) ltmp = getCost(ctx.state, ctx.defs, obj, e);
  if (it.noCharge && !container) {
    delete it.noCharge;
    return;
  }
  let contentscount = 0;
  if (container) {
    const { onFloor, freespot } = floorState(ctx, obj, e);
    const cltmp = containedCost(ctx.state, ctx.defs, obj, e, 0, false, onFloor, freespot);
    const gltmp = containedGold(ctx.state, ctx.defs, obj);
    if (ltmp) addOneTobill(ctx, obj, dummy, shk);
    if (cltmp) billBoxContent(ctx, obj, dummy, shk);
    pickedContainer(ctx, obj); // reset contained obj->no_charge
    ltmp += cltmp;
    if (gltmp && !ltmp) return; // costly_gold(): no loan
    delete it.noCharge;
    contentscount = countUnpaid(ctx.state, obj);
  } else addOneTobill(ctx, obj, dummy, shk);
  if (silent) return;
  const zm = ltmp === 1 ? '@shk.zorkmid' : '@shk.zorkmids';
  const shkn = shkname(ctx, e);
  if (helpless(ctx, shk)) {
    // muteshk()
    if (ltmp)
      ctx.emit({
        type: 'msg',
        key: contentscount && !it.unpaid ? 'shk.list_price_contents' : 'shk.list_price',
        params: {
          item: xnameOf(ctx.state, ctx.defs, obj),
          contents: contentscount && it.unpaid ? '@shk.and_its_contents' : '',
          n: ltmp,
          zm,
          each: it.quantity > 1 ? '@shk.each' : '',
        },
      });
    else ctx.emit({ type: 'msg', key: 'shk.does_not_notice', params: { shk: shkn } });
    return;
  }
  if (!ltmp) {
    ctx.emit({
      type: 'msg',
      key: 'shk.no_interest',
      params: { shk: shkn, item: xnameOf(ctx.state, ctx.defs, obj) },
    });
    return;
  }
  if (!ininv) {
    ctx.emit({
      type: 'msg',
      key: 'shk.will_cost',
      params: {
        item: xnameOf(ctx.state, ctx.defs, obj),
        n: ltmp,
        zm,
        each: it.quantity > 1 ? '@shk.each' : '',
      },
    });
    return;
  }
  const angry = !ctx.state.entities[String(shk)]?.c.monster?.peaceful;
  const params = {
    n: ltmp,
    zm,
    per:
      it.quantity > 1
        ? '@shk.per'
        : contentscount && !it.unpaid
          ? '@shk.for_contents_of_this'
          : '@shk.for_this',
    item: xname1(ctx, obj),
    contents: contentscount && it.unpaid ? '@shk.and_its_contents' : '',
  };
  if (angry) ctx.emit({ type: 'msg', key: 'shk.for_you_scum', params });
  else if (!e.surcharge)
    ctx.emit({ type: 'msg', key: 'shk.for_you', params: { ...params, ...honorific(ctx) } });
  else ctx.emit({ type: 'msg', key: 'shk.for_you_plain', params });
}

/**
 * The object goes back to `shk`: off his bill, and when part of the billed stack was used up,
 * that part stays on it as used up. ref: src/shk.c sub_one_frombill()
 */
function subOneFrombill(ctx: Ctx, obj: Entity, shk: EntityId): void {
  const it = obj.c.item;
  if (!it) return;
  const bp = onbill(ctx, obj.id, shk);
  delete it.unpaid;
  if (!bp) return;
  if (bp.bquan > it.quantity) {
    bp.oid = nextIdent(ctx);
    bp.bquan -= it.quantity;
    bp.useup = true;
    bp.gone = snapshot(obj, bp.bquan);
    return;
  }
  dropBillEntry(ctx, shk, bp);
}

/** Takes the object and its contents off `shk`'s bill. ref: src/shk.c subfrombill() */
export function subfrombill(ctx: Ctx, obj: Entity, shk: EntityId): void {
  subOneFrombill(ctx, obj, shk);
  for (const o of contents(ctx.state, obj.id)) {
    if (ctx.defs.object(o.def).class === 'coin') continue;
    subfrombill(ctx, o, shk);
  }
}

/**
 * An unpaid object (and what it holds) is about to be deleted after being used up: it stays on
 * the bill as used up. Call before `ctx.remove`. ref: src/shk.c obfree(obj, NULL)
 */
export function billUsedUp(ctx: Ctx, obj: Entity): void {
  for (const o of contents(ctx.state, obj.id)) billUsedUp(ctx, o);
  const it = obj.c.item;
  if (!it?.unpaid) return;
  const found = billOf(ctx, obj.id);
  delete it.unpaid;
  if (!found) return;
  found.bp.useup = true;
  found.bp.gone = snapshot(obj, it.quantity);
}

/**
 * A copy of the object goes on the bill as used up and the object itself is no longer the
 * shop's (no-charge where it lies on the floor). ref: src/mkobj.c bill_dummy_object()
 */
function billDummyObject(ctx: Ctx, obj: Entity, onFloor: boolean): void {
  const it = obj.c.item;
  if (!it) return;
  let cost = 0;
  if (it.unpaid) {
    cost = unpaidCost(ctx.state, ctx.defs, obj, 'single');
    const found = billOf(ctx, obj.id);
    if (found) subfrombill(ctx, obj, found.shk);
  }
  const item = { ...it, known: { ...it.known } };
  delete item.lit;
  delete item.unpaid;
  const dummy: Entity = { id: nextIdent(ctx), def: obj.def, c: { item } };
  addtobill(ctx, dummy, false, true, true);
  if (cost) {
    // alter_cost(dummy, -cost)
    const bp = usedUpEntry(ctx, dummy.id);
    if (bp) bp.price = cost;
  }
  // no_charge is only valid for some locations
  if (onFloor) it.noCharge = true;
  else delete it.noCharge;
  delete it.unpaid;
}

/**
 * The hero has just altered a shop object (bitten into food): she pays for it. `at`: where it
 * lies on the floor, or null when she has it. ref: src/mkobj.c costly_alteration() (COST_BITE)
 */
export function costlyAlteration(ctx: Ctx, obj: Entity, how: 'bite', at: Pos | null): void {
  const it = obj.c.item;
  if (!it) return;
  const level = getLevel(ctx.state);
  const those = it.quantity === 1 ? '@shk.that' : '@shk.those';
  const them = it.quantity === 1 ? '@pronoun.it' : '@pronoun.them';
  const verb = `@shk.alter.${how}`;
  if (at === null) {
    if (!it.unpaid) return;
    ctx.emit({
      type: 'msg',
      key: 'shk.alter_inv',
      params: { verb, those, item: xnameOf(ctx.state, ctx.defs, obj), them },
    });
    billDummyObject(ctx, obj, false);
    return;
  }
  if (!costlySpot(ctx, at.x, at.y)) return;
  const objroom = inRooms(level, at.x, at.y).find((r) => isShopType(level.rooms[r]?.type));
  // if no shop cares about it, we're done
  if (billable(ctx, obj, objroom, false) === null) return;
  const hp = getPlayer(ctx.state).c.pos;
  if (hp && costlySpot(ctx, hp.x, hp.y) && objroom === uShops(ctx)[0]) {
    ctx.emit({ type: 'msg', key: 'shk.alter_floor', params: { verb, those, them } });
    billDummyObject(ctx, obj, true);
  } else stolenValue(ctx, obj, at.x, at.y, false, false);
}

// ---------------------------------------------------------------------------------------------
// paying and being paid

/** The price is taken from her credit first. ref: src/shk.c check_credit() */
export function checkCredit(ctx: Ctx, tmp: number, e: Eshk): number {
  const credit = e.credit;
  if (credit === 0) return tmp;
  if (credit >= tmp) {
    ctx.emit({ type: 'msg', key: 'pay.credit_deducted' });
    e.credit -= tmp;
    return 0;
  }
  ctx.emit({ type: 'msg', key: 'pay.credit_partial' });
  e.credit = 0;
  return tmp - credit;
}

/** She pays him `tmp` (he pays her when it is negative). ref: src/shk.c pay() */
export function shkPay(ctx: Ctx, tmp: number, shk: EntityId, e: Eshk): void {
  const balance = tmp <= 0 ? tmp : checkCredit(ctx, tmp, e);
  if (balance > 0) money2mon(ctx, shk, balance);
  else if (balance < 0) money2u(ctx, shk, -balance);
  if (e.robbed) e.robbed = Math.max(0, e.robbed - tmp);
}

/** Wakes an asleep or paralyzed keeper: "Izchak wakes up." ref: src/shk.c rouse_shk() */
export function rouseShk(ctx: Ctx, shk: Entity, e: Eshk): void {
  const m = shk.c.monster;
  if (!m || !helpless(ctx, shk.id)) return;
  // greed induced recovery...
  if (canSpotMon(ctx, shk))
    ctx.emit({
      type: 'msg',
      key: m.asleep ? 'pay.wakes_up' : 'pay.can_move_again',
      params: { shk: shkname(ctx, e) },
    });
  m.asleep = false;
  unfreezeMonst(ctx, shk.id);
}

// ---------------------------------------------------------------------------------------------
// selling

/** How a drop sells. ref: SELL_NORMAL, SELL_DELIBERATE, SELL_DONTSELL */
export type SellHow = 'normal' | 'deliberate' | 'dontsell';

/**
 * One command's selling state: how it sells, the answer given for all ('y' or 'n' after "a" or
 * "q"; '' asks), and whether all credit offers are accepted.
 * ref: gs.sell_how, gs.sell_response, ga.auto_credit
 */
export interface SellState {
  how: SellHow;
  response: '' | 'y' | 'n';
  autoCredit: boolean;
}

/**
 * The state for a command that drops things. A deliberate drop asks; anything else that lands
 * on a costly spot is sold without asking. ref: src/shk.c sellobj_state()
 */
export function sellobjState(how: SellHow): SellState {
  return { how, response: how !== 'normal' ? '' : 'y', autoCredit: false };
}

/** A pending question of sellobj(): the shopkeeper's offer, or credit when he has no gold. */
export interface SellOffer {
  shk: EntityId;
  obj: EntityId;
  /** "Will you accept N zorkmids in credit for X?" (else "Izchak offers N gold pieces ...") */
  credit: boolean;
  /** The gold or credit offered. */
  offer: number;
  ltmp: number;
  cltmp: number;
  saleitem: boolean;
  partial: boolean;
  key: string;
  params: Params;
}

/** Her answer to a sell question. */
export type SellReply = 'y' | 'n' | 'a' | 'q';

/**
 * The question to ask for a pending offer: a yn prompt for a single drop, else a menu of
 * y/n/a/q (C's nyaq/ynaq; dismissing it is 'q').
 */
export function sellPrompt(o: SellOffer, multi: boolean): Prompt {
  if (!multi) return { id: 'sell', kind: 'yn', key: o.key, params: o.params, cancellable: true };
  return {
    id: 'sell',
    kind: 'menu',
    key: o.key,
    params: o.params,
    cancellable: true,
    options: (['y', 'n', 'a', 'q'] as const).map((c) => ({
      value: c,
      key: `shk.sell.${c}`,
      letter: c,
    })),
  };
}

/** The answer to sellPrompt(): yes/no for the yn prompt, the letter for the menu. */
export function sellReply(value: Json): SellReply {
  if (value === true) return 'y';
  if (value === 'y' || value === 'n' || value === 'a') return value;
  return value === false ? 'n' : 'q';
}

/**
 * The objects in `obj`, nested too (`quantity`: counting each one of a stack): all, or only the
 * shop's: unpaid, and with `newdrop` false, the not no-charge ones when it lies on a costly spot.
 * ref: src/invent.c count_contents(nested = TRUE)
 */
function countContents(
  ctx: Ctx,
  obj: Entity,
  quantity: boolean,
  everything: boolean,
  newdrop: boolean,
): number {
  let shoppy = false;
  if (!everything && !newdrop) {
    const top = topContainer(ctx.state, obj);
    const p = top.c.item?.carriedBy === null ? top.c.pos : undefined;
    shoppy = !!p && p.level === ctx.state.currentLevel && costlySpot(ctx, p.x, p.y);
  }
  let count = 0;
  for (const o of contents(ctx.state, obj.id)) {
    if (contents(ctx.state, o.id).length > 0)
      count += countContents(ctx, o, quantity, everything, newdrop);
    const it = o.c.item;
    if (everything || it?.unpaid || (shoppy && !it?.noCharge))
      count += quantity ? (it?.quantity ?? 1) : 1;
  }
  return count;
}

/** The shop room at x,y on the hero's level. ref: `*in_rooms(x, y, SHOPBASE)` */
function shopRoomAt(level: Level, x: number, y: number): number | undefined {
  return inRooms(level, x, y).find((r) => isShopType(level.rooms[r]?.type));
}

/**
 * The hero has just put her object down on x,y in a shop (it is not yet merged with a pile).
 * An unpaid one goes back off the bill; one of hers he wants he offers to buy: null when that
 * is settled, else the question to ask (sellAnswer() takes the reply). An angry keeper takes
 * it ("Thank you, scum!"); one who does not deal in it "seems uninterested" and it stays hers
 * (no charge); one with no gold offers credit. ref: src/shk.c sellobj()
 */
export function sellobj(
  ctx: Ctx,
  obj: Entity,
  x: number,
  y: number,
  st: SellState,
): SellOffer | null {
  const ushop = uShops(ctx)[0];
  const it = obj.c.item;
  if (ushop === undefined || !it) return null; // do cheapest exclusion test first
  const level = getLevel(ctx.state);
  const room = shopRoomAt(level, x, y);
  const shk = room === undefined ? null : shopKeeper(ctx, level.id, room);
  const shkMon = shk === null ? undefined : ctx.state.entities[String(shk)];
  const e = shk === null ? null : eshkOf(ctx, shk);
  if (shk === null || !shkMon || !e || !inhishop(ctx, shk) || !costlySpot(ctx, x, y)) return null;
  const container = contents(ctx.state, obj.id).length > 0;
  const def = ctx.defs.object(obj.def);
  const isgold = def.class === 'coin';
  if (it.unpaid && !container && !isgold) {
    subOneFrombill(ctx, obj, shk);
    return null;
  }
  // the price of content before subfrombill (contained gold buys nothing: no credit for gold)
  const cltmp = container ? containedSellCost(ctx.state, ctx.defs, obj, e, shk, 0) : 0;
  const saleitem = saleable(ctx, e, obj);
  const ltmp = !isgold && !it.unpaid && saleitem ? setCost(ctx.state, ctx.defs, obj, shk) : 0;
  let offer = ltmp + cltmp;

  // you dropped something of your own - probably want to sell it
  rouseShk(ctx, shkMon, e); // wake up sleeping or paralyzed shk
  if (!shkMon.c.monster?.peaceful) {
    // they become shop-objects, no pay
    ctx.emit({ type: 'msg', key: 'shk.thank_you_scum' });
    subfrombill(ctx, obj, shk);
    return null;
  }
  if (isgold) {
    // gold stays hers: no credit for gold dropped in a shop (DEVIATIONS)
    it.noCharge = true;
    return null;
  }
  // get one case out of the way: nothing to sell
  if (offer === 0 || st.how === 'dontsell') {
    const unpaid = isUnpaid(ctx.state, obj);
    if (container) {
      droppedContainer(ctx, obj, e, false);
      if (!it.unpaid) it.noCharge = true;
      if (unpaid) subfrombill(ctx, obj, shk);
    } else it.noCharge = true;
    if (!unpaid && st.how !== 'dontsell')
      ctx.emit({ type: 'msg', key: 'shk.uninterested', params: { shk: shkname(ctx, e) } });
    return null;
  }
  if (e.robbed) {
    // shop robbed by previous customer. C's `(robbed -= offer < 0L)` subtracts nothing and then
    // clears it: any contribution makes up for the robbery
    e.robbed = 0;
    ctx.emit({ type: 'msg', key: 'shk.restock_thanks' });
    subfrombill(ctx, obj, shk);
    return null;
  }
  if (
    (!saleitem && !(container && cltmp > 0)) ||
    e.bill.length >= BILLSZ ||
    offer === 0 ||
    (def.class === 'food' && it.eaten) ||
    (isCandle(obj.def) && (it.age ?? 0) < 20 * def.cost)
  ) {
    ctx.emit({ type: 'msg', key: 'shk.uninterested', params: { shk: shkname(ctx, e) } });
    if (container) droppedContainer(ctx, obj, e, false);
    it.noCharge = true;
    return null;
  }
  const base = { shk, obj: obj.id, ltmp, cltmp, saleitem };
  const shkmoney = moneyCnt(ctx, shk);
  if (!shkmoney) {
    const tmpcr = Math.trunc((offer * 9) / 10) + (offer <= 1 ? 1 : 0);
    const o: SellOffer = {
      ...base,
      credit: true,
      offer: tmpcr,
      partial: false,
      key: 'shk.credit_prompt',
      params: { n: tmpcr, zm: zorkmids(tmpcr), item: paydoname(ctx.state, ctx.defs, obj) },
    };
    if (st.how === 'normal' || st.autoCredit) {
      sellAnswer(ctx, o, 'y', st);
      return null;
    }
    if (st.response === 'n') {
      // previously specified "quit"
      sellAnswer(ctx, o, 'n', st);
      return null;
    }
    ctx.emit({ type: 'msg', key: 'shk.cannot_pay', params: { shk: shkname(ctx, e) } });
    return o;
  }
  const shortFunds = offer > shkmoney;
  if (shortFunds) offer = shkmoney;
  let yourc = 0;
  let partial = false;
  if (container) {
    // number of items owned by shk, and by you
    const shksc = countContents(ctx, obj, true, false, true);
    yourc = countContents(ctx, obj, true, true, true) - shksc;
    partial = shksc > 0 && yourc > 0;
  }
  const one = !ltmp ? yourc === 1 : it.quantity === 1 && !cltmp;
  const o: SellOffer = {
    ...base,
    credit: false,
    offer,
    partial,
    key: 'shk.sell_offer',
    params: {
      shk: shkname(ctx, e),
      only: shortFunds ? '@shk.only' : '',
      n: offer,
      gp: offer === 1 ? '@shk.gold_piece' : '@shk.gold_pieces',
      inside: cltmp && !ltmp ? (yourc === 1 ? '@shk.your_item_in' : '@shk.your_items_in') : '',
      whose: it.unpaid ? '@shk.the' : '@shk.your',
      item: xnameOf(ctx.state, ctx.defs, obj),
      suffix:
        cltmp && ltmp
          ? partial
            ? yourc === 1
              ? '@shk.and_item_inside'
              : '@shk.and_items_inside'
            : '@shk.and_its_contents'
          : '',
      it: one ? '@pronoun.it' : '@pronoun.them',
    },
  };
  if (st.response) {
    sellAnswer(ctx, o, st.response, st);
    return null;
  }
  return o;
}

/**
 * Settles a sell question with her reply: sold (he pays her, or credits her), or kept (no
 * charge). 'a' answers yes and 'q' no for the rest of the command. ref: src/shk.c sellobj()
 */
export function sellAnswer(ctx: Ctx, o: SellOffer, reply: SellReply, st: SellState): void {
  const obj = ctx.state.entities[String(o.obj)];
  const it = obj?.c.item;
  const e = eshkOf(ctx, o.shk);
  if (!obj || !it || !e) return;
  const container = contents(ctx.state, obj.id).length > 0;
  let c = reply;
  if (o.credit) {
    if (c === 'a') {
      c = 'y';
      st.autoCredit = true;
    }
    if (c === 'y') {
      shkNamesObj(
        ctx,
        e,
        obj,
        st.how !== 'normal' ? 'traded_credit' : 'relinquish_credit',
        o.offer,
        e.credit > 0,
      );
      e.credit += o.offer;
      if (container) droppedContainer(ctx, obj, e, true);
      subfrombill(ctx, obj, o.shk);
    } else {
      if (c === 'q') st.response = 'n';
      if (container) droppedContainer(ctx, obj, e, false);
      if (!it.unpaid) it.noCharge = true;
      subfrombill(ctx, obj, o.shk);
    }
    return;
  }
  if (c === 'q') st.response = 'n';
  if (c === 'a') st.response = 'y';
  if (c === 'n' || c === 'q') {
    if (container) droppedContainer(ctx, obj, e, false);
    if (!it.unpaid) it.noCharge = true;
    subfrombill(ctx, obj, o.shk);
    return;
  }
  if (container) droppedContainer(ctx, obj, e, true);
  if (!it.unpaid && !o.saleitem) it.noCharge = true;
  subfrombill(ctx, obj, o.shk);
  shkPay(ctx, -o.offer, o.shk, e);
  shkNamesObj(
    ctx,
    e,
    obj,
    st.how !== 'normal' ? (!o.ltmp && o.cltmp && o.partial ? 'sold_some' : 'sold') : 'relinquish',
    o.offer,
  );
}

/** The wording of shk_names_obj(): "You bought X for N gold pieces." and its kin. */
export type ShkNamesFmt =
  | 'bought'
  | 'paid_for'
  | 'sold'
  | 'sold_some'
  | 'relinquish'
  | 'traded_credit'
  | 'relinquish_credit';

/**
 * "You bought X for N gold pieces." (or paid for, sold, relinquished...); ordinary weapons,
 * armor, scrolls and books the shop deals in are named first ("X; you bought it ...").
 * `additional`: "in additional credit". ref: src/shk.c shk_names_obj()
 */
export function shkNamesObj(
  ctx: Ctx,
  e: Eshk,
  obj: Entity,
  fmt: ShkNamesFmt,
  amt: number,
  additional = false,
): void {
  let wasUnknown = false; // (dknown is always set)
  const def = ctx.defs.object(obj.def);
  if (
    !def.magic &&
    saleable(ctx, e, obj) &&
    (def.class === 'weapon' ||
      def.class === 'armor' ||
      def.class === 'scroll' ||
      def.class === 'spellbook' ||
      obj.def === 'nh:mirror')
  ) {
    wasUnknown ||= !isKnown(ctx.state, ctx.defs, def);
    discover(ctx, def);
  }
  const quan = obj.c.item?.quantity ?? 1;
  ctx.emit({
    type: 'msg',
    key: `shk.${fmt}${wasUnknown ? '_unknown' : ''}`,
    params: {
      item: paydoname(ctx.state, ctx.defs, obj),
      it: quan > 1 ? '@pronoun.them' : '@pronoun.it',
      n: amt,
      gp: amt === 1 ? '@shk.gold_piece' : '@shk.gold_pieces',
      zm: zorkmids(amt),
      additional: additional ? '@shk.additional' : '',
    },
  });
}

// ---------------------------------------------------------------------------------------------
// stolen goods

/**
 * The keeper whose shop at x,y has the object on his bill, else the first keeper there.
 * ref: src/shk.c find_objowner()
 */
export function findObjowner(ctx: Ctx, obj: Entity, x: number, y: number): EntityId | null {
  const level = getLevel(ctx.state);
  let deflt: EntityId | null = null;
  for (const r of inRooms(level, x, y)) {
    if (!isShopType(level.rooms[r]?.type)) continue;
    const shk = shopKeeper(ctx, level.id, r);
    if (shk === null) continue;
    if (onbill(ctx, obj.id, shk)) return shk;
    deflt ??= shk;
  }
  return deflt;
}

/**
 * x,y is a wall or door of his shop, or his own spot, while he is in it.
 * ref: src/shk.c costly_adjacent()
 */
export function costlyAdjacent(ctx: Ctx, shk: EntityId, x: number, y: number): boolean {
  const e = eshkOf(ctx, shk);
  if (!e || !inhishop(ctx, shk)) return false;
  // adjacent if <x,y> is a shop wall spot, including door; also treat "free spot" one step
  // inside the door as adjacent
  return isEdge(getLevel(ctx.state), x, y) || (x === e.shk.x && y === e.shk.y);
}

/** The value of the shop goods inside `obj`, taken off the bill. ref: stolen_container() */
function stolenContainer(
  ctx: Ctx,
  obj: Entity,
  shk: EntityId,
  e: Eshk,
  price: number,
  ininv: boolean,
): number {
  for (const o of contents(ctx.state, obj.id)) {
    const it = o.c.item;
    if (!it || ctx.defs.object(o.def).class === 'coin') continue;
    let billamt = 0;
    if (billable(ctx, o, undefined, true, shk) === null) {
      // billable() returns false for objects already on bill
      const bp = onbill(ctx, o.id, shk);
      if (!bp) continue;
      billamt = bp.bquan * bp.price;
      subOneFrombill(ctx, o, shk); // avoid double billing
    }
    if (billamt) price += billamt;
    else if (ininv ? it.unpaid : !it.noCharge)
      price += it.quantity * getCost(ctx.state, ctx.defs, o, e);
    if (contents(ctx.state, o.id).length > 0) price = stolenContainer(ctx, o, shk, e, price, ininv);
  }
  return price;
}

/**
 * The shop object (or shop goods in it) left the shop or was destroyed by the hero: its price
 * comes off the bill and is owed: a peaceful keeper adds it to her debt ("You owe Izchak 10
 * zorkmids for it!"), after her credit; an angry one counts it as robbed. Not peaceful: "you are a
 * thief!" (hot pursuit and the Watch: step 5). Returns the value. `ininv`: the object is
 * carried or detached (in flight), else it lies somewhere. ref: src/shk.c stolen_value()
 */
export function stolenValue(
  ctx: Ctx,
  obj: Entity,
  x: number,
  y: number,
  peaceful: boolean,
  silent: boolean,
): number {
  const it = obj.c.item;
  if (!it) return 0;
  const level = getLevel(ctx.state);
  const owner = findObjowner(ctx, obj, x, y);
  const roomno = owner !== null ? eshkOf(ctx, owner)?.shoproom : shopRoomAt(level, x, y);
  // gather information for message(s) prior to manipulating bill
  const wasUnpaid = !!it.unpaid;
  const container = contents(ctx.state, obj.id).length > 0;
  const cCount = container ? countContents(ctx, obj, false, true, false) : 0;
  const uCount = container ? countContents(ctx, obj, false, false, false) : 0;

  const shk = roomno === undefined ? null : shopKeeper(ctx, level.id, roomno);
  const e = shk === null ? null : eshkOf(ctx, shk);
  if (shk === null || !e || !inhishop(ctx, shk)) return 0;
  let billamt = 0;
  if (billable(ctx, obj, undefined, true, shk) === null) {
    // things already on the bill yield a not-billable result, so we need to check bill before
    // deciding that shk doesn't care
    const bp = onbill(ctx, obj.id, shk);
    if (bp) {
      // shk does care; take obj off bill to avoid double billing
      billamt = bp.bquan * bp.price;
      subOneFrombill(ctx, obj, shk);
    }
    if (!bp && !uCount) return 0;
  }
  let value = 0;
  // (gold: no loan, so shop gold is never charged here)
  if (ctx.defs.object(obj.def).class !== 'coin') {
    if (billamt) value += billamt;
    else if (!it.noCharge) value += it.quantity * getCost(ctx.state, ctx.defs, obj, e);
    if (container) {
      const ininv = it.carriedBy === ctx.state.playerId || (it.carriedBy === null && !obj.c.pos);
      value += stolenContainer(ctx, obj, shk, e, 0, ininv);
    }
  }
  if (value === 0) return 0;

  const shkMon = ctx.state.entities[String(shk)];
  if (peaceful) {
    const creditUse = !!e.credit;
    value = checkCredit(ctx, value, e);
    // 'peaceful' affects general treatment, but doesn't affect the fact that other code
    // expects that all charges after the shopkeeper is angry are included in robbed, not debit
    if (!shkMon?.c.monster?.peaceful) e.robbed += value;
    else e.debit += value;
    if (!silent) {
      let still = '';
      if (creditUse) {
        if (e.credit) {
          ctx.emit({
            type: 'msg',
            key: 'shk.credit_remaining',
            params: { n: e.credit, zm: zorkmids(e.credit) },
          });
          return value;
        } else if (!value) {
          ctx.emit({ type: 'msg', key: 'shk.no_credit_remaining' });
          return 0;
        }
        still = '@shk.still';
      }
      ctx.emit({
        type: 'msg',
        key: 'shk.owe',
        params: {
          still,
          shk: shkname(ctx, e),
          n: value,
          zm: zorkmids(value),
          forwhat: uCount
            ? {
                key: 'shk.for_contents',
                params: {
                  it: wasUnpaid ? '@shk.it_and' : '',
                  some: cCount > uCount ? '@shk.some_of' : '',
                },
              }
            : it.quantity > 1
              ? '@shk.for_them'
              : '@shk.for_it',
        },
      });
    }
  } else {
    e.robbed += value;
    if (!silent) {
      if (shkMon && canSpotMon(ctx, shkMon))
        ctx.emit({
          type: 'msg',
          key: 'shk.thief',
          params: { shk: shkname(ctx, e), name: plname(ctx) },
        });
      else ctx.emit({ type: 'msg', key: 'shk.thief_scream' });
    }
    hotPursuit(ctx, shk);
    angryGuards(ctx, false);
  }
  return value;
}

/**
 * The hero's thrown object has landed on x,y (or broke: `broken`) while she is in a shop:
 * thrown out of the shop (or into another), unpaid goods are owed; thrown onto his floor, unpaid
 * goods go back to him and her own are sold without asking. ref: src/dothrow.c check_shop_obj()
 * (no levitation recoil: u.ushops0 is not needed)
 */
export function checkShopObj(ctx: Ctx, obj: Entity, x: number, y: number, broken: boolean): void {
  const ushop = uShops(ctx)[0];
  const level = getLevel(ctx.state);
  const shk = ushop === undefined ? null : shopKeeper(ctx, level.id, ushop);
  const it = obj.c.item;
  if (shk === null || !it) return;
  const costlyXy = costlySpot(ctx, x, y);
  const hp = getPlayer(ctx.state).c.pos;
  const peaceful = !!ctx.state.entities[String(shk)]?.c.monster?.peaceful;
  if (broken || !costlyXy || shopRoomAt(level, x, y) !== ushop) {
    // thrown out of a shop or into a different shop
    if (isUnpaid(ctx.state, obj) && hp) stolenValue(ctx, obj, hp.x, hp.y, peaceful, false);
    if (broken) it.noCharge = true;
    return;
  }
  if (isUnpaid(ctx.state, obj)) subfrombill(ctx, obj, shk);
  else {
    const sp = ctx.state.entities[String(shk)]?.c.pos;
    if (!sp || x !== sp.x || y !== sp.y) sellobj(ctx, obj, x, y, sellobjState('normal'));
  }
}

// ---------------------------------------------------------------------------------------------
// usage fees

/**
 * What one use of an unpaid object costs, making its exhaustive use dearer than buying it.
 * ref: src/shk.c cost_per_charge() (the objects that exist)
 */
function costPerCharge(ctx: Ctx, shk: EntityId, e: Eshk, obj: Entity): number {
  if (!inhishop(ctx, shk)) return 0; // insurance
  let tmp = getCost(ctx.state, ctx.defs, obj, e);
  const def = ctx.defs.object(obj.def);
  if (obj.def === 'nh:oil_lamp' || obj.def === 'nh:brass_lantern' || def.class === 'wand') {
    if ((obj.c.item?.spe ?? 0) > 1) tmp = Math.trunc(tmp / 4);
  } else if (def.class === 'spellbook') tmp -= Math.trunc(tmp / 5);
  return tmp;
}

/**
 * Charges for one use of an unpaid object (zapping a wand, lighting a lamp): "Usage fee, N
 * zorkmids." goes on her debt. ref: src/shk.c check_unpaid_usage(), check_unpaid()
 */
export function checkUnpaid(ctx: Ctx, obj: Entity): void {
  const it = obj.c.item;
  const ushop = uShops(ctx)[0];
  if (!it?.unpaid || ushop === undefined) return;
  if (it.spe <= 0 && ctx.defs.object(obj.def).class === 'wand') return; // oc_charged
  const shk = shopKeeper(ctx, ctx.state.currentLevel, ushop);
  const e = shk === null ? null : eshkOf(ctx, shk);
  if (shk === null || !e || !inhishop(ctx, shk)) return;
  const tmp = costPerCharge(ctx, shk, e, obj);
  if (tmp === 0) return;
  const hey = ctx.rng.rn2(3) === 0 ? '@shk.hey' : '';
  const ahem = ctx.rng.rn2(3) === 0 ? '@shk.ahem' : '';
  if (!helpless(ctx, shk))
    ctx.emit({
      type: 'msg',
      key: 'shk.usage_fee',
      params: { hey, ahem, n: tmp, zm: zorkmids(tmp) },
    });
  e.debit += tmp;
}

/** The gold in containers the hero carries. ref: src/vault.c hidden_gold(TRUE) */
export function hiddenGold(ctx: Pick<Ctx, 'state' | 'defs'>): number {
  let n = 0;
  for (const o of inventoryOf(ctx.state, ctx.state.playerId))
    n += containedGold(ctx.state, ctx.defs, o);
  return n;
}

// ---------------------------------------------------------------------------------------------
// robbery, anger and making up

/** His pronouns as message params. ref: noit_mhis(), noit_mhe(), noit_mhim() */
export function shkPronouns(e: Eshk): { his: string; he: string; him: string } {
  return e.female
    ? { his: '@shk.pron.her', he: '@shk.pron.she', him: '@shk.pron.her' }
    : { his: '@shk.pron.his', he: '@shk.pron.he', him: '@shk.pron.him' };
}

/** What the bill comes to. ref: src/shk.c addupbill() */
export function addupbill(e: Eshk): number {
  let total = 0;
  for (const bp of e.bill) total += bp.price * bp.bquan;
  return total;
}

/** ref: Role_if(PM_ROGUE): stealing is lawful for a Rogue */
const isRogue = (ctx: Ctx): boolean => getPlayer(ctx.state).c.player?.role === 'nh:rogue';

/** The sign of the hero's alignment type. ref: sgn(u.ualign.type) */
const alignSgn = (ctx: Ctx): number => Math.sign(uState(ctx.state).alignType);

/** The item entities, in id order. */
function allItems(ctx: Ctx): Entity[] {
  const out: Entity[] = [];
  for (const id of sortedIds(ctx.state)) {
    const o = ctx.state.entities[String(id)];
    if (o?.c.item) out.push(o);
  }
  return out;
}

/**
 * Clears no_charge on the floor objects of the hero's level (and what they hold): with `shk`,
 * only those in his shop, outside any shop or in a deserted one; with null, all of them.
 * ref: src/shk.c clear_no_charge(), clear_no_charge_obj() (no buried objects)
 */
function clearNoCharge(ctx: Ctx, shk: EntityId | null): void {
  const level = getLevel(ctx.state);
  for (const o of allItems(ctx)) {
    const it = o.c.item;
    if (!it?.noCharge) continue;
    const top = topContainer(ctx.state, o);
    const p = top.c.item?.carriedBy === null ? top.c.pos : undefined;
    if (!p || p.level !== level.id) continue; // OBJ_FLOOR or OBJ_CONTAINED on this level only
    const rno = shopRoomAt(level, p.x, p.y);
    const resident = rno === undefined ? null : residentOf(ctx, level, rno);
    if (shk === null || resident === null || resident === shk) delete it.noCharge;
  }
}

/** The shopkeeper of room `rno` while he is on its level. ref: rooms[].resident */
function residentOf(ctx: Ctx, level: Level, rno: number): EntityId | null {
  const shk = shopKeeper(ctx, level.id, rno);
  return shk !== null && ctx.state.entities[String(shk)]?.c.pos?.level === level.id ? shk : null;
}

/** Clears no_charge on what the hero's pets carry. ref: src/shk.c clear_no_charge_pets() */
function clearNoChargePets(ctx: Ctx): void {
  for (const o of allItems(ctx)) {
    const it = o.c.item;
    if (!it?.noCharge) continue;
    const top = topContainer(ctx.state, o);
    const by = top.c.item?.carriedBy;
    const m = by === null || by === undefined ? undefined : ctx.state.entities[String(by)];
    if (m?.c.monster?.tame && m.c.pos?.level === ctx.state.currentLevel) delete it.noCharge;
  }
}

/**
 * She paid, left the shop or he died: nothing is unpaid to him any more, the no-charge goods in
 * his shop are his again, and the bill (used-up goods too), credit and debt are gone.
 * ref: src/shk.c setpaid(), clear_unpaid()
 */
export function setpaid(ctx: Ctx, shk: EntityId): void {
  for (const o of allItems(ctx))
    if (o.c.item?.unpaid && onbill(ctx, o.id, shk)) delete o.c.item.unpaid;
  clearNoCharge(ctx, shk);
  const e = eshkOf(ctx, shk);
  if (!e) return;
  e.bill = [];
  e.credit = 0;
  e.debit = 0;
}

/** Makes him angry and puts the anger surcharge on the bill. ref: src/shk.c rile_shk() */
export function rileShk(ctx: Ctx, shk: EntityId): void {
  const m = ctx.state.entities[String(shk)]?.c.monster;
  const e = eshkOf(ctx, shk);
  if (m) m.peaceful = false; // make angry
  if (e && !e.surcharge) {
    e.surcharge = true;
    for (const bp of e.bill) bp.price += Math.trunc((bp.price + 2) / 3);
  }
}

/**
 * He goes after the hero: angry, following her (off the level too), and every floor object on
 * the level is fair game again ("shopkeeper networking"). ref: src/shk.c hot_pursuit()
 */
export function hotPursuit(ctx: Ctx, shk: EntityId): void {
  const e = eshkOf(ctx, shk);
  if (!e) return;
  rileShk(ctx, shk);
  e.customer = true;
  e.following = true;
  clearNoCharge(ctx, null);
  clearNoChargePets(ctx);
}

/**
 * She left the shop with goods or a debt: paid from her credit, or robbery: "You escaped the shop
 * without paying!", "You stole N zorkmids worth of merchandise.", alignment and hot pursuit.
 * Returns whether he was robbed. ref: src/shk.c rob_shop()
 */
function robShop(ctx: Ctx, shk: EntityId, e: Eshk): boolean {
  const mon = ctx.state.entities[String(shk)];
  if (mon) rouseShk(ctx, mon, e);
  let total = addupbill(e) + e.debit;
  if (e.credit >= total) {
    ctx.emit({
      type: 'msg',
      key: 'shk.credit_covers',
      params: { n: e.credit, zm: zorkmids(e.credit) },
    });
    total = 0; // credit gets cleared by setpaid()
  } else {
    ctx.emit({ type: 'msg', key: 'shk.escaped' });
    total -= e.credit;
  }
  setpaid(ctx, shk);
  if (!total) return false;
  // by this point, we know an actual robbery has taken place
  e.robbed += total;
  ctx.emit({ type: 'msg', key: 'shk.stole', params: { n: total, zm: zorkmids(total) } });
  if (!isRogue(ctx)) adjalign(ctx, -alignSgn(ctx)); // stealing is unlawful
  hotPursuit(ctx, shk);
  return true;
}

/**
 * "An alarm sounds!": the Watch turns on her, or "But no one seems to respond to it." No Keystone
 * Kops (DEVIATIONS). ref: src/shk.c call_kops()
 */
function callKops(ctx: Ctx): void {
  ctx.emit({ type: 'msg', key: 'shk.alarm' });
  if (!angryGuards(ctx, false)) ctx.emit({ type: 'msg', key: 'shk.no_one_responds' });
}

/** A shopkeeper on the hero's level is angry. ref: src/shk.c angry_shk_exists() */
function angryShkExists(ctx: Ctx): boolean {
  for (const id of sortedIds(ctx.state)) {
    const m = ctx.state.entities[String(id)];
    if (m?.c.monster && m.c.pos?.level === ctx.state.currentLevel && eshkOf(ctx, id))
      if (!m.c.monster.peaceful) return true;
  }
  return false;
}

/** With no angry shopkeeper left, the Watch calms down. ref: src/shk.c make_happy_shoppers() */
export function makeHappyShoppers(ctx: Ctx): void {
  if (!angryShkExists(ctx)) pacifyGuards(ctx); // (no Kops to send away)
}

/** No monster (nor the hero) stands on x,y of the level. */
function spotFree(ctx: Ctx, levelId: string, x: number, y: number): EntityId | true {
  for (const id of sortedIds(ctx.state)) {
    const p = ctx.state.entities[String(id)]?.c.pos;
    if (p?.level === levelId && p.x === x && p.y === y && !ctx.state.entities[String(id)]?.c.item)
      return id;
  }
  return true;
}

/**
 * Puts him on his spot on his shop level: a monster standing there is moved next to it; with the
 * hero there, he goes next to it. ref: src/mon.c mnearto(move_other = TRUE)
 */
function putHome(ctx: Ctx, shk: EntityId, e: Eshk): void {
  const mon = ctx.state.entities[String(shk)];
  const level = ctx.state.levels[e.shoplevel];
  if (!mon?.c.pos || !level) return;
  const { x, y } = e.shk;
  if (mon.c.pos.level === level.id && mon.c.pos.x === x && mon.c.pos.y === y) return;
  const other = spotFree(ctx, level.id, x, y);
  let to: Pos | null = { x, y };
  if (other === ctx.state.playerId) to = mnextoPos(ctx, level, shk, e.shk);
  else if (other !== true) {
    const o = ctx.state.entities[String(other)];
    const away = mnextoPos(ctx, level, other, e.shk);
    if (o?.c.pos && away) o.c.pos = { level: level.id, x: away.x, y: away.y };
    else to = mnextoPos(ctx, level, shk, e.shk);
  }
  if (!to) return;
  mon.c.pos = { level: level.id, x: to.x, y: to.y };
}

/**
 * She is in his shop's rooms but not counted in it (she came in while he was away): with him
 * back, her shop occupancy is checked again and he greets her.
 * ref: src/shk.c after_shk_move() -> check_special_room(FALSE) (the shop half; rooms.ts has
 * the whole, which imports this module)
 */
function afterHome(ctx: Ctx, shk: EntityId, e: Eshk): void {
  if (ctx.state.gameOver || e.shoplevel !== ctx.state.currentLevel) return;
  const rooms = uRooms(ctx);
  const ushops0 = uShops(ctx);
  if (!rooms.includes(e.shoproom) || ushops0.includes(e.shoproom) || !inhishop(ctx, shk)) return;
  const level = getLevel(ctx.state);
  const ushops = rooms.filter((r) => isShopType(level.rooms[r]?.type));
  setURooms(ctx, rooms, ushops);
  const entered = ushops.find((r) => !ushops0.includes(r));
  if (entered !== undefined) uEnteredShop(ctx, entered);
}

/**
 * He is paid off (or tamed): peaceful, no longer following or robbed, and back to his shop:
 * "Izchak returns to his shop." on his level, "Satisfied, Izchak suddenly disappears!" from
 * another one (he is put straight back on his spot: levels persist), or "Izchak calms down." in
 * his shop. ref: src/shk.c make_happy_shk(), home_shk()
 */
export function makeHappyShk(ctx: Ctx, shk: EntityId): void {
  const mon = ctx.state.entities[String(shk)];
  const e = eshkOf(ctx, shk);
  if (!mon?.c.monster || !e) return;
  const wasmad = !mon.c.monster.peaceful;
  pacifyShk(ctx, shk, false);
  e.following = false;
  e.robbed = 0;
  if (!isRogue(ctx)) adjalign(ctx, alignSgn(ctx));
  if (!inhishop(ctx, shk)) {
    const name = shkname(ctx, e);
    let vanished = canSpotMon(ctx, mon); // canseemon()
    if (e.shoplevel === ctx.state.currentLevel) {
      putHome(ctx, shk, e); // home_shk()
      afterHome(ctx, shk, e);
      if (canSpotMon(ctx, mon)) {
        ctx.emit({
          type: 'msg',
          key: 'shk.returns_home',
          params: { shk: shkname(ctx, e), his: shkPronouns(e).his },
        });
        vanished = false; // don't give 'Shk disappears' message
      }
    } else {
      // arrive at his shop (C migrates him near its door); the Watch there calms down when the
      // hero next arrives
      putHome(ctx, shk, e);
      e.dismissKops = true;
    }
    if (vanished) ctx.emit({ type: 'msg', key: 'shk.disappears', params: { shk: name } });
  } else if (wasmad)
    ctx.emit({ type: 'msg', key: 'shk.calms_down', params: { shk: shkname(ctx, e) } });
  makeHappyShoppers(ctx);
}

/**
 * Her pending transactions are past due: the bill, debt and credit become robbery, "Izchak gets
 * angry!" (or "is furious!") and he goes after her. For a keeper teleported or fallen out of his
 * shop, or damage done from outside it (no caller yet: no such teleports or damage).
 * ref: src/shk.c make_angry_shk()
 */
export function makeAngryShk(ctx: Ctx, shk: EntityId): void {
  const mon = ctx.state.entities[String(shk)];
  const e = eshkOf(ctx, shk);
  if (!mon?.c.monster || !e) return;
  if (e.bill.length || e.debit || e.credit) {
    e.robbed = Math.max(0, e.robbed + addupbill(e) + e.debit - e.credit);
    setpaid(ctx, shk);
  }
  ctx.emit({
    type: 'msg',
    key: mon.c.monster.peaceful ? 'shk.gets_angry' : 'shk.is_furious',
    params: { shk: shkname(ctx, e) },
  });
  hotPursuit(ctx, shk);
}

/**
 * The shopkeeper dies (call before his Eshk is dropped): on his level the goods on his shop's
 * floor are ordinary objects again and, when the hero is in his shop, her bill is void and she
 * counts as in no shop. ref: src/shk.c shkgone() (no damage list)
 */
export function shkgone(ctx: Ctx, shk: EntityId): void {
  const e = eshkOf(ctx, shk);
  if (!e || e.shoplevel !== ctx.state.currentLevel) return;
  const level = getLevel(ctx.state);
  const r = level.rooms[e.shoproom];
  if (!r) return;
  // items on shop floor revert to ordinary objects
  for (const o of allItems(ctx)) {
    const p = o.c.pos;
    if (o.c.item?.carriedBy !== null || !p || p.level !== level.id) continue;
    if (p.x >= r.lx && p.x <= r.hx && p.y >= r.ly && p.y <= r.hy) delete o.c.item.noCharge;
  }
  // make sure bill is set only when the dead shk is the resident shk
  const ushops = uShops(ctx);
  if (ushops.includes(e.shoproom)) {
    setpaid(ctx, shk);
    setURooms(
      ctx,
      uRooms(ctx),
      ushops.filter((x) => x !== e.shoproom),
    );
  }
}

/**
 * On arrival on a level: a shopkeeper paid off elsewhere and sent home here takes his Kops away
 * (none exist), so the Watch calms down if no shopkeeper is angry. ref: src/dog.c losedogs()
 * (dismiss_kops)
 */
export function shkArrivals(ctx: Ctx, levelId: string): void {
  let dismiss = false;
  for (const id of sortedIds(ctx.state)) {
    const e = eshkOf(ctx, id);
    const m = ctx.state.entities[String(id)];
    if (!e || !m?.c.monster || m.c.pos?.level !== levelId) continue;
    if (e.dismissKops) {
      delete e.dismissKops;
      dismiss = true;
    }
  }
  if (dismiss) makeHappyShoppers(ctx);
}

/** The turn of the last "Didn't you forget to pay?". ref: gf.followmsg */
export function followmsg(ctx: Pick<Ctx, 'state'>): number {
  const nh = ctx.state.modData['nh'];
  const v = nh !== null && typeof nh === 'object' && !Array.isArray(nh) ? nh['followmsg'] : 0;
  return typeof v === 'number' ? v : 0;
}

export function setFollowmsg(ctx: Pick<Ctx, 'state'>, turn: number): void {
  const md = ctx.state.modData;
  let nh = md['nh'];
  if (nh === null || typeof nh !== 'object' || Array.isArray(nh)) {
    nh = {};
    md['nh'] = nh;
  }
  nh['followmsg'] = turn;
}

// ---------------------------------------------------------------------------------------------
// chatting

const IZCHAK_SPEAKS = 9;

/**
 * What he says when she chats with him: his anger, "Didn't you forget to pay?" while following
 * her, the bill, debt or credit, the robbery, the surcharge, business, or small talk (Izchak's
 * sayings). ref: src/shk.c shk_chat() (no deafness or mute keepers)
 */
export function shkChat(ctx: Ctx, shk: EntityId): void {
  const mon = ctx.state.entities[String(shk)];
  const e = eshkOf(ctx, shk);
  if (!mon?.c.monster) return;
  const say = (key: string, params: Params = {}): void => ctx.emit({ type: 'msg', key, params });
  if (!e) {
    // a shopkeeper type that is no shopkeeper (an animated statue)
    say('shk.chat.untended_shops', { mon: `@${mon.def}` });
    return;
  }
  const shkn = shkname(ctx, e);
  const pr = shkPronouns(e);
  if (!mon.c.monster.peaceful) {
    say('shk.chat.dislikes', {
      shk: shkn,
      he: pr.he,
      which: e.robbed ? '@shk.chat.non_paying' : '@shk.chat.rude',
    });
  } else if (e.following) {
    // (the customer is always this hero: no "I was looking for")
    say('shk.chat.forget_to_pay', { hello: hello(ctx), name: plname(ctx) });
  } else if (e.bill.length) {
    const total = addupbill(e) + e.debit;
    say('shk.chat.bill', { shk: shkn, n: total, zm: zorkmids(total) });
  } else if (e.debit) {
    say('shk.chat.debit', { shk: shkn, him: pr.him, n: e.debit, zm: zorkmids(e.debit) });
  } else if (e.credit) {
    say('shk.chat.credit', { shk: shkn, n: e.credit, zm: zorkmids(e.credit) });
  } else if (e.robbed) {
    say('shk.chat.robbery', { shk: shkn });
  } else if (e.surcharge) {
    say('shk.chat.watching', { shk: shkn, he: pr.he });
  } else {
    const shkmoney = moneyCnt(ctx, shk);
    if (shkmoney < 50) say('shk.chat.business_bad', { shk: shkn });
    else if (shkmoney > 4000) say('shk.chat.business_good', { shk: shkn });
    else if (!hasProp(getPlayer(ctx.state), P.HALLUC) && shkName(e) === '=Izchak')
      say(`shk.chat.izchak.${ctx.rng.rn2(IZCHAK_SPEAKS)}`, { shk: shkn });
    else say('shk.chat.shoplifters', { shk: shkn });
  }
}

/**
 * Something other than gold lies on x,y, a costly spot of a shop whose keeper is there, peaceful
 * and awake: he will quote its price. ref: src/shk.c shop_object()
 */
export function shopObject(ctx: Ctx, x: number, y: number): Entity | null {
  const level = getLevel(ctx.state);
  const rno = shopRoomAt(level, x, y);
  const shk = rno === undefined ? null : shopKeeper(ctx, level.id, rno);
  if (shk === null || !inhishop(ctx, shk)) return null;
  const otmp = itemsAt(ctx.defs, ctx.state, level.id, x, y).find(
    (o) => ctx.defs.object(o.def).class !== 'coin',
  );
  const peaceful = !!ctx.state.entities[String(shk)]?.c.monster?.peaceful;
  return otmp && costlySpot(ctx, x, y) && peaceful && !helpless(ctx, shk) ? otmp : null;
}

/** ", a real bargain." and the like after a quoted price. ref: src/shk.c shk_embellish() */
function shkEmbellish(ctx: Ctx, itm: Entity, cost: number): string {
  if (!ctx.rng.rn2(3)) {
    let choice = ctx.rng.rn2(5);
    if (choice === 0) choice = cost < 100 ? 1 : cost < 500 ? 2 : 3;
    switch (choice) {
      case 4: {
        if (cost < 10) break;
        const def = ctx.defs.object(itm.def);
        const o = def.class;
        if (o === 'food') return '@shk.emb.gourmet';
        if (
          isKnown(ctx.state, ctx.defs, def)
            ? !!def.magic
            : o === 'amulet' ||
              o === 'ring' ||
              o === 'wand' ||
              o === 'potion' ||
              o === 'scroll' ||
              o === 'spellbook'
        )
          return '@shk.emb.developed';
        return '@shk.emb.craftsmanship';
      }
      case 3:
        return '@shk.emb.finest';
      case 2:
        return '@shk.emb.excellent';
      case 1:
        return '@shk.emb.bargain';
      default:
        break;
    }
  }
  return '@shk.emb.plain';
}

/**
 * He tells her the price of everything on her square (not gold): one object in a sentence
 * ("Tallow candle, price 13 zorkmids, a real bargain."), several in a list ("Fine goods for
 * sale:"). ref: src/shk.c price_quote() (no balls, chains or globs)
 */
export function priceQuote(ctx: Ctx, first: Entity): void {
  const hp = getPlayer(ctx.state).c.pos;
  const level = getLevel(ctx.state);
  const room = hp ? insideShop(level, hp.x, hp.y) : null;
  const shk = room === null ? null : shopKeeper(ctx, level.id, room);
  const e = shk === null ? null : eshkOf(ctx, shk);
  if (shk === null || !e || !inhishop(ctx, shk) || !hp) return;
  const lines: { key: string; params: Params }[] = [];
  let cost = 0;
  let contentsonly = false;
  for (const o of itemsAt(ctx.defs, ctx.state, level.id, hp.x, hp.y)) {
    if (ctx.defs.object(o.def).class === 'coin') continue;
    cost = o.c.item?.noCharge ? 0 : getCost(ctx.state, ctx.defs, o, e);
    contentsonly = !cost;
    if (contents(ctx.state, o.id).length > 0)
      cost += containedCost(ctx.state, ctx.defs, o, e, 0, false, true, false);
    const item = doname(ctx.state, ctx.defs, o, { noPrice: true });
    if (!cost) {
      contentsonly = false;
      lines.push({ key: 'shk.quote.line', params: { item, price: '@shk.quote.no_charge' } });
    } else {
      const price = {
        key: 'shk.quote.price',
        params: {
          n: cost,
          zm: zorkmids(cost),
          each: (o.c.item?.quantity ?? 1) > 1 ? '@shk.each' : '',
        },
      };
      lines.push({
        key: contentsonly ? 'shk.quote.line_contents' : 'shk.quote.line',
        params: { item, price },
      });
    }
  }
  if (lines.length > 1) {
    ctx.emit({ type: 'list', titleKey: 'shk.quote.title', items: lines });
    return;
  }
  if (lines.length !== 1) return;
  const item = doname(ctx.state, ctx.defs, first, { noPrice: true });
  if (!cost) {
    ctx.emit({ type: 'msg', key: 'shk.quote.one_free', params: { item } });
    return;
  }
  ctx.emit({
    type: 'msg',
    key: contentsonly ? 'shk.quote.one_contents' : 'shk.quote.one',
    params: {
      item,
      n: cost,
      zm: zorkmids(cost),
      each: (first.c.item?.quantity ?? 1) > 1 ? '@shk.each' : '',
      emb: contentsonly ? '@shk.emb.plain' : shkEmbellish(ctx, first, cost),
    },
  });
}
