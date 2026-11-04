// Shop prices. Pure functions of the state, so the item namer can show them: what a shopkeeper
// charges for an object (getprice(), get_cost()), what an unpaid object costs on his bill
// (unpaid_cost()) and what a shop object costs where it lies (get_cost_of_shop_item()).
// ref: src/shk.c getprice(), corpsenm_price_adj(), oid_price_adjustment(), get_cost(),
// contained_cost(), contained_gold(), unpaid_cost(), get_cost_of_shop_item(), is_unpaid()
//
// Not ported: artifacts, globs (get_pricing_units() is the quantity), glass gems (none exist),
// the dunce cap and Hawaiian shirt (neither exists; the checks are made), selling prices
// (set_cost(): step 4).
import {
  contents,
  getPlayer,
  inRooms,
  inventoryOf,
  type Entity,
  type EntityId,
  type GameState,
  type HungerState,
  type PosComponent,
  type Registry,
} from '@nh/core';
import {
  billOf,
  eshkOf,
  inhishop,
  insideShop,
  isShopType,
  shopKeeper,
  uShops,
  type Eshk,
} from './eshk';
import { isKnown } from './o_init';

type S = Readonly<GameState>;
const at = (state: S): { state: S } => ({ state });

/** ref: include/hack.h u.uhs values (SATIATED 0 .. STARVED 6) */
const UHS: Record<HungerState, number> = {
  satiated: 0,
  not_hungry: 1,
  hungry: 2,
  weak: 3,
  fainting: 4,
  fainted: 5,
  starved: 6,
};

/** ref: include/obj.h Is_candle() */
const isCandle = (id: string): boolean => id === 'nh:tallow_candle' || id === 'nh:wax_candle';

/**
 * The intrinsics a corpse can convey and what each adds to its price (teleportitis and teleport
 * control do not exist). ref: src/shk.c corpsenm_price_adj() icost[]
 */
const ICOST: readonly [string, number][] = [
  ['fire', 2],
  ['sleep', 3],
  ['cold', 2],
  ['disint', 5],
  ['elec', 4],
  ['poison', 2],
  ['acid', 1],
  ['stone', 3],
];
/** ref: include/mondata.h telepathic() */
const TELEPATHIC = new Set(['nh:floating_eye', 'nh:mind_flayer', 'nh:master_mind_flayer']);

/** ref: src/shk.c corpsenm_price_adj() (corpses only: no tins or eggs) */
function corpsenmPriceAdj(defs: Registry, obj: Entity): number {
  const mon = obj.c.item?.corpseOf;
  if (obj.def !== 'nh:corpse' || mon === undefined || !defs.isMonster(mon)) return 0;
  const ptr = defs.monster(mon);
  let tmp = 1;
  for (const [mr, cost] of ICOST) if (ptr.conveys.includes(mr)) tmp += cost;
  if (TELEPATHIC.has(ptr.id)) tmp += 5;
  if (ptr.genFlags.includes('unique')) tmp += 50;
  let val = Math.max(1, (ptr.level - 1) * 2);
  val += Math.max(1, Math.trunc(ptr.nutrition / 30));
  return val * tmp;
}

/** The base price of one of the object. ref: src/shk.c getprice() */
export function getprice(state: S, defs: Registry, obj: Entity, shkBuying: boolean): number {
  const def = defs.object(obj.def);
  const it = obj.c.item;
  let tmp = def.cost;
  switch (def.class) {
    case 'food': {
      tmp += corpsenmPriceAdj(defs, obj);
      // simpler hunger check, (2-4)*cost
      const uhs = UHS[getPlayer(state).c.hunger?.state ?? 'not_hungry'];
      if (uhs >= UHS.hungry && !shkBuying) tmp *= uhs;
      if (it?.eaten) tmp = 0;
      break;
    }
    case 'wand':
      if (it?.spe === -1) tmp = 0;
      break;
    case 'potion':
      if (obj.def === 'nh:potion_of_water' && it?.buc === 'uncursed') tmp = 0;
      break;
    case 'armor':
    case 'weapon':
      if ((it?.spe ?? 0) > 0) tmp += 10 * (it?.spe ?? 0);
      break;
    case 'tool':
      if (isCandle(obj.def) && (it?.age ?? 0) < 20 * def.cost) tmp = Math.trunc(tmp / 2);
      break;
    default:
      break;
  }
  return tmp;
}

/**
 * 1 when an object of unknown type with id `oid` gets the unidentified surcharge, else 0.
 * ref: src/shk.c oid_price_adjustment() (dknown is always set here)
 */
export function oidPriceAdjustment(state: S, defs: Registry, obj: Entity, oid: EntityId): number {
  if (isKnown(state, defs, obj.def)) return 0;
  return oid % 4 === 0 ? 1 : 0;
}

/**
 * What the shopkeeper charges for one of the object: the base price with the unidentified
 * surcharge, the sucker markup, Charisma, and his anger surcharge. ref: src/shk.c get_cost()
 */
export function getCost(state: S, defs: Registry, obj: Entity, shk: Eshk | null): number {
  let tmp = getprice(state, defs, obj, false);
  let multiplier = 1;
  let divisor = 1;
  if (!tmp) tmp = 5;
  // shopkeeper may notice if the player isn't very knowledgeable
  if (oidPriceAdjustment(state, defs, obj, obj.id) > 0) {
    // unid'd, arbitrarily impose surcharge: tmp *= 4/3
    multiplier *= 4;
    divisor *= 3;
  }
  const hero = getPlayer(state);
  const worn = (slot: string): Entity | undefined =>
    inventoryOf(state, hero.id).find((o) => o.c.item?.equipped === slot);
  if (worn('helm')?.def === 'nh:dunce_cap') {
    multiplier *= 4;
    divisor *= 3;
  } else if (
    (hero.c.player?.role === 'nh:tourist' && (hero.c.experience?.level ?? 1) < 15) ||
    (worn('shirt') && !worn('body') && !worn('cloak')) // touristy shirt visible
  ) {
    multiplier *= 4;
    divisor *= 3;
  }
  const cha = hero.c.attributes?.cha ?? 10;
  if (cha > 18) divisor *= 2;
  else if (cha === 18) {
    multiplier *= 2;
    divisor *= 3;
  } else if (cha >= 16) {
    multiplier *= 3;
    divisor *= 4;
  } else if (cha <= 5) multiplier *= 2;
  else if (cha <= 7) {
    multiplier *= 3;
    divisor *= 2;
  } else if (cha <= 10) {
    multiplier *= 4;
    divisor *= 3;
  }
  // tmp = (tmp * multiplier) / divisor [with roundoff tweak]
  tmp *= multiplier;
  if (divisor > 1) {
    tmp = Math.trunc((tmp * 10) / divisor);
    tmp = Math.trunc((tmp + 5) / 10);
  }
  if (tmp <= 0) tmp = 1;
  // anger surcharge should match rile_shk's
  if (shk?.surcharge) tmp += Math.trunc((tmp + 2) / 3);
  return tmp;
}

/** The outermost container holding `obj` (itself when it is in none). */
export function topContainer(state: S, obj: Entity): Entity {
  let top = obj;
  for (let up = top.c.item?.containedIn; up !== undefined; up = top.c.item?.containedIn) {
    const e = state.entities[String(up)];
    if (!e) break;
    top = e;
  }
  return top;
}

/**
 * Where the object is: its own square, its outermost container's, or its carrier's. Null for a
 * detached object. ref: src/mkobj.c get_obj_location(CONTAINED_TOO)
 */
export function objLocation(state: S, obj: Entity): PosComponent | null {
  const top = topContainer(state, obj);
  const by = top.c.item?.carriedBy;
  const p = by === null || by === undefined ? top.c.pos : state.entities[String(by)]?.c.pos;
  return p ?? null;
}

/**
 * The price of the shop goods inside `obj` (nested too; not the container itself, not gold).
 * `onFloor`: the outermost container lies on the floor (else it is carried or being picked up),
 * `freespot`: on the shopkeeper's own square. ref: src/shk.c contained_cost() (buying)
 */
export function containedCost(
  state: S,
  defs: Registry,
  obj: Entity,
  shk: Eshk,
  price: number,
  unpaidOnly: boolean,
  onFloor: boolean,
  freespot: boolean,
): number {
  for (const o of contents(state, obj.id)) {
    const it = o.c.item;
    if (!it || defs.object(o.def).class === 'coin') continue;
    if (onFloor ? !it.noCharge && !freespot : it.unpaid || !unpaidOnly)
      price += getCost(state, defs, o, shk) * it.quantity;
    if (contents(state, o.id).length > 0)
      price = containedCost(state, defs, o, shk, price, unpaidOnly, onFloor, freespot);
  }
  return price;
}

/** The gold inside `obj`, nested too. ref: src/shk.c contained_gold(even_if_unknown = TRUE) */
export function containedGold(state: S, defs: Registry, obj: Entity): number {
  let value = 0;
  for (const o of contents(state, obj.id)) {
    if (defs.object(o.def).class === 'coin') value += o.c.item?.quantity ?? 0;
    else value += containedGold(state, defs, o);
  }
  return value;
}

/** The unpaid objects inside `obj`, nested too. ref: src/invent.c count_unpaid() */
export function countUnpaid(state: S, obj: Entity): number {
  let n = 0;
  for (const o of contents(state, obj.id)) {
    if (o.c.item?.unpaid) n++;
    n += countUnpaid(state, o);
  }
  return n;
}

/** The object or something in it belongs to a shop. ref: src/shk.c is_unpaid() */
export function isUnpaid(state: S, obj: Entity): boolean {
  return !!obj.c.item?.unpaid || countUnpaid(state, obj) > 0;
}

/**
 * What the hero owes for the object: its bill price times its quantity (`single`: for one), plus
 * its unpaid contents (`withContents`). Looked up on whichever bill has it, not only the shop
 * she is in (she may carry unpaid goods out until robbery comes in step 5).
 * ref: src/shk.c unpaid_cost()
 */
export function unpaidCost(
  state: S,
  defs: Registry,
  obj: Entity,
  how: 'contents' | 'nocontents' | 'single',
): number {
  const it = obj.c.item;
  if (!it) return 0;
  const found = it.unpaid ? billOf(at(state), obj.id) : null;
  let amt = found ? found.bp.price * (how === 'single' ? 1 : it.quantity) : 0;
  if (how === 'contents' && contents(state, obj.id).length > 0) {
    const shk = found?.shk ?? residentOf(state);
    const e = shk === null ? null : eshkOf(at(state), shk);
    if (e) amt = containedCost(state, defs, obj, e, amt, true, false, false);
  }
  return amt;
}

/** The keeper of the shop the hero is in, if he is in it. */
function residentOf(state: S): EntityId | null {
  const room = uShops(at(state))[0];
  if (room === undefined) return null;
  const shk = shopKeeper(at(state), state.currentLevel, room);
  return shk !== null && inhishop(at(state), shk) ? shk : null;
}

/**
 * The price of a shop object where it lies (on the floor or in a container there, in the shop
 * the hero is in; carried objects only when unpaid), and whether it is no-charge (`noCharge`:
 * null when not in a shop). ref: src/shk.c get_cost_of_shop_item()
 */
export function shopItemCost(
  state: S,
  defs: Registry,
  obj: Entity,
): { cost: number; noCharge: boolean | null } {
  const none = { cost: 0, noCharge: null };
  const ushop = uShops(at(state))[0];
  if (ushop === undefined || defs.object(obj.def).class === 'coin') return none;
  const level = state.levels[state.currentLevel];
  const p = objLocation(state, obj);
  if (!level || !p || p.level !== level.id) return none;
  const shopRooms = inRooms(level, p.x, p.y).filter((r) => isShopType(level.rooms[r]?.type));
  if (shopRooms[0] !== ushop) return none;
  const room = insideShop(level, p.x, p.y);
  const shk = room === null ? null : shopKeeper(at(state), level.id, room);
  const e = shk === null ? null : eshkOf(at(state), shk);
  if (shk === null || !e || !inhishop(at(state), shk)) return none;
  const top = topContainer(state, obj);
  const onFloor = top.c.item?.carriedBy === null && top.c.pos !== undefined;
  const freespot = onFloor && p.x === e.shk.x && p.y === e.shk.y;
  // no_charge is only set for floor items inside shop proper; items on freespot are implicitly
  // 'no charge'
  const noCharge = onFloor && (!!obj.c.item?.noCharge || freespot);
  let cost = 0;
  if (!onFloor ? !!obj.c.item?.unpaid : !noCharge)
    cost = (obj.c.item?.quantity ?? 1) * getCost(state, defs, obj, e);
  if (!freespot && contents(state, obj.id).length > 0)
    cost += containedCost(state, defs, obj, e, 0, true, onFloor, freespot);
  return { cost, noCharge };
}
