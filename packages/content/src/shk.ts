// Shopkeeping: what happens as the hero comes into a shop and leaves it, and the bill: picking up
// shop goods puts them on it, putting them back takes them off, using them up keeps them there
// (6b3 steps 2-3; selling, fees and robbery come in the later steps). Never import actions,
// itemactions, monmove, combat, peaceful, chat, priest or dothrow here: they import this module.
// ref: src/shk.c u_entered_shop(), u_left_shop(), deserted_shop(), pacify_shk(), shkname(),
// addtobill(), add_one_tobill(), bill_box_content(), billable(), picked_container(),
// dropped_container(), sub_one_frombill(), subfrombill(), obfree(), shk_names_obj(),
// append_honorific(), sellobj() (its first branch); src/mkobj.c costly_alteration(),
// bill_dummy_object(); src/role.c Hello()
//
// Not ported: invisible heroes and steeds (neither exists), deafness, the pick-axe (no such
// object: only the dwarvish mattock is checked), the shop achievement, globs, gold picked up in a
// shop (no loan: costly_gold()), price quotes (record_price_quote()).
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
  type Level,
  type Pos,
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
import { isFrozen } from './mstate';
import { discover, isKnown } from './o_init';
import { paydoname, xnameOf } from './objnam';
import { canSpotMon } from './perception';
import {
  containedCost,
  containedGold,
  countUnpaid,
  getCost,
  isUnpaid,
  topContainer,
  unpaidCost,
} from './price';
import { P, hasProp } from './props';
import { SHTYPES, saleable, shopType } from './shtypes';
import { emptyShops, setEmptyShops, setURooms, uRooms } from './urooms';

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
 * Stepping from the floor onto the door with an unpaid bill or debt gets a warning. Leaving with
 * them (robbery) comes in step 5. `from`: her square before the move (u.ux0/u.uy0), when known.
 * ref: src/shk.c u_left_shop()
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
  if (left.length === 0) {
    // C falls through to rob_shop() for a mute keeper here; nothing is robbed until step 5
    if (helpless(ctx, shk)) return;
    // Player just stepped onto shop-boundary: try to intimidate him into paying his bill
    ctx.emit({
      type: 'msg',
      key: e.surcharge ? 'shk.dont_leave' : 'shk.pay_before_leaving',
      params: { name: plname(ctx) },
    });
  }
  // rob_shop() and call_kops(): step 5
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

/** Marks everything inside `obj` that is not on the bill as no-charge. ref: dropped_container() */
function droppedContainer(ctx: Ctx, obj: Entity): void {
  for (const o of contents(ctx.state, obj.id)) {
    const it = o.c.item;
    if (!it || ctx.defs.object(o.def).class === 'coin') continue;
    if (!it.unpaid) it.noCharge = true; // (sale && saleable(): step 4)
    droppedContainer(ctx, o);
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
  }
  // else stolen_value(): step 4
}

/**
 * The hero has just put her object down on x,y: an unpaid one goes back off the bill, her own
 * becomes no-charge (selling is step 4: until then she keeps what she drops). Call before the
 * object is placed (placeOnFloor merges, C's stackobj() comes after sellobj()).
 * ref: src/shk.c sellobj() (its first branch and the "nothing to sell" one)
 */
export function sellobj(ctx: Ctx, obj: Entity, x: number, y: number): void {
  const ushop = uShops(ctx)[0];
  const it = obj.c.item;
  if (ushop === undefined || !it) return; // do cheapest exclusion test first
  const level = getLevel(ctx.state);
  const room = inRooms(level, x, y).find((r) => isShopType(level.rooms[r]?.type));
  const shk = room === undefined ? null : shopKeeper(ctx, level.id, room);
  if (shk === null || !inhishop(ctx, shk) || !costlySpot(ctx, x, y)) return;
  const container = contents(ctx.state, obj.id).length > 0;
  const isgold = ctx.defs.object(obj.def).class === 'coin';
  if (it.unpaid && !container && !isgold) {
    subOneFrombill(ctx, obj, shk);
    return;
  }
  if (isgold) return; // gold dropped in a shop: step 4
  const unpaid = isUnpaid(ctx.state, obj);
  if (container) droppedContainer(ctx, obj);
  if (!it.unpaid) it.noCharge = true;
  if (unpaid) subfrombill(ctx, obj, shk);
}

/**
 * "You bought X for N gold pieces." (`consumed`: "You paid for X at a cost of ..."); ordinary
 * weapons, armor, scrolls and books the shop deals in are named first.
 * ref: src/shk.c shk_names_obj()
 */
export function shkNamesObj(ctx: Ctx, e: Eshk, obj: Entity, consumed: boolean, amt: number): void {
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
    key: `shk.${consumed ? 'paid_for' : 'bought'}${wasUnknown ? '_unknown' : ''}`,
    params: {
      item: paydoname(ctx.state, ctx.defs, obj),
      it: quan > 1 ? '@pronoun.them' : '@pronoun.it',
      n: amt,
      gp: amt === 1 ? '@shk.gold_piece' : '@shk.gold_pieces',
    },
  });
}

/** The gold in containers the hero carries. ref: src/vault.c hidden_gold(TRUE) */
export function hiddenGold(ctx: Pick<Ctx, 'state' | 'defs'>): number {
  let n = 0;
  for (const o of inventoryOf(ctx.state, ctx.state.playerId))
    n += containedGold(ctx.state, ctx.defs, o);
  return n;
}
