// The shopkeeper's memory of his shop (ESHK) and the questions asked about shops. A shopkeeper
// is an ordinary monster with an entry in `modData.nh.eshk` (keyed by entity id): `isshk` is
// "has an entry", and forgetMonster() drops it when he dies. The room does not store its
// resident: shopKeeper() finds the monster whose entry names the room (as findpriest()).
// ref: include/mextra.h struct eshk, struct bill_x; src/shk.c inside_shop(), inhishop(),
// shop_keeper(), costly_spot(); src/shknam.c shkname(), shkname_is_pname()
import {
  cellIndex,
  inRooms,
  roomHas,
  sortedIds,
  type Ctx,
  type DefId,
  type EntityId,
  type ItemComponent,
  type Json,
  type Level,
  type LevelId,
  type Pos,
  type Registry,
} from '@nh/core';
import { uShopRooms } from './urooms';

/** The shopkeeper's monster. ref: include/monsters.h PM_SHOPKEEPER */
export const SHOPKEEPER = 'nh:shopkeeper';

/** The most entries a bill holds. ref: include/mextra.h BILLSZ */
export const BILLSZ = 200;

/**
 * The room types of shops, in shknam.c shtypes[] order (shknam.ts SHTYPES describes each).
 * Minetown's food shop is `nh:food_shop` (the delicatessen) and its lighting shop
 * `nh:candle_shop`. ref: include/mkroom.h SHOPBASE.., src/shknam.c shtypes[]
 */
export const SHOP_TYPES: readonly DefId[] = [
  'nh:shop',
  'nh:armor_shop',
  'nh:scroll_shop',
  'nh:potion_shop',
  'nh:weapon_shop',
  'nh:food_shop',
  'nh:ring_shop',
  'nh:wand_shop',
  'nh:tool_shop',
  'nh:book_shop',
  'nh:health_food_shop',
  'nh:candle_shop',
];

/** One line of a bill. ref: include/mextra.h struct bill_x */
export interface BillEntry {
  oid: EntityId;
  bquan: number;
  /** Per unit. */
  price: number;
  useup: boolean;
  /** A snapshot of a used-up object, for naming it (billobjs). */
  gone?: { def: DefId; item: ItemComponent };
}

/** ref: include/mextra.h struct eshk (no loan, no billct: `bill.length`) */
export interface Eshk {
  /** The shop's index in `Level.rooms`. */
  shoproom: number;
  shoplevel: LevelId;
  shoptype: DefId;
  /** His usual spot, just inside the door. */
  shk: Pos;
  /** The shop door. */
  shd: Pos;
  robbed: number;
  credit: number;
  debit: number;
  following: boolean;
  surcharge: boolean;
  bill: BillEntry[];
  visitct: number;
  /** He has met the hero (C's `customer`: there is only one hero per game). */
  customer: boolean;
  /** With its prefix: '-' / '_' female, '+' / '|' male, '=' unspecified; '-+=' personal. */
  shknam: string;
  female: boolean;
  /** Paid off on another level and sent home: the Watch here calms down on her next arrival. */
  dismissKops?: true;
}

type Table = { [k: string]: Json };
const isObj = (v: Json | undefined): v is Table =>
  v !== null && v !== undefined && typeof v === 'object' && !Array.isArray(v);

function table(ctx: Pick<Ctx, 'state'>, create: boolean): Table | null {
  const md = ctx.state.modData;
  let nh = md['nh'];
  if (!isObj(nh)) {
    if (!create) return null;
    nh = {};
    md['nh'] = nh;
  }
  let t = nh['eshk'];
  if (!isObj(t)) {
    if (!create) return null;
    t = {};
    nh['eshk'] = t;
  }
  return t;
}

/** The shopkeeper's shop memory, or null for any other monster (ref: mtmp->isshk). */
export function eshkOf(ctx: Pick<Ctx, 'state'>, id: EntityId): Eshk | null {
  const e = table(ctx, false)?.[String(id)];
  return isObj(e) ? (e as unknown as Eshk) : null;
}

/** Makes monster `id` a shopkeeper. ref: src/shknam.c neweshk() */
export function setEshk(ctx: Pick<Ctx, 'state'>, id: EntityId, e: Eshk): void {
  const t = table(ctx, true);
  if (t) t[String(id)] = e as unknown as Json;
}

/** The room type is a shop. ref: include/mkroom.h IS_SHOP() */
export function isShopType(type: DefId | undefined): boolean {
  return type !== undefined && SHOP_TYPES.includes(type);
}

/** x,y is in a shop, its walls or its door. ref: src/hack.c `*in_rooms(x, y, SHOPBASE)` */
export function inAnyShop(level: Level, x: number, y: number): boolean {
  return inRooms(level, x, y).some((r) => isShopType(level.rooms[r]?.type));
}

/** The door cells of the room's walls, in order: top wall, bottom, left, right, each ascending. */
export function shopDoors(defs: Registry, level: Level, room: number): Pos[] {
  const r = level.rooms[room];
  if (!r) return [];
  const isDoor = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= level.width || y >= level.height) return false;
    const id = level.palette[level.cells[cellIndex(level, x, y)] ?? -1];
    if (id === undefined) return false;
    return defs.terrain(id).door !== undefined || SECRET_DOORS.has(id);
  };
  const out: Pos[] = [];
  for (const y of [r.ly - 1, r.hy + 1])
    for (let x = r.lx; x <= r.hx; x++) if (isDoor(x, y)) out.push({ x, y });
  for (const x of [r.lx - 1, r.hx + 1])
    for (let y = r.ly; y <= r.hy; y++) if (isDoor(x, y)) out.push({ x, y });
  return out;
}

/** ref: include/rm.h SDOOR (content's secret door terrains) */
const SECRET_DOORS: ReadonlySet<string> = new Set([
  'nh:sdoor_v',
  'nh:sdoor_h',
  'nh:sdoor_locked_v',
  'nh:sdoor_locked_h',
]);

/**
 * The shop whose floor (not its walls or door) holds x,y, or null.
 * ref: src/shk.c inside_shop() (`levl[x][y].edge` is the walls and doors)
 */
export function insideShop(level: Level, x: number, y: number): number | null {
  for (let i = level.rooms.length - 1; i >= 0; i--)
    if (isShopType(level.rooms[i]?.type) && roomHas(level, i, x, y)) return i;
  return null;
}

/**
 * The living shopkeeper of shop `room` on level `levelId`, wherever he is, or null.
 * ref: src/shk.c shop_keeper() (`rooms[].resident`; the rile_shk() of an angry one without a
 * surcharge is left to the callers that need it)
 */
export function shopKeeper(
  ctx: Pick<Ctx, 'state'>,
  levelId: LevelId,
  room: number,
): EntityId | null {
  for (const id of sortedIds(ctx.state)) {
    const e = eshkOf(ctx, id);
    if (!e || e.shoproom !== room || e.shoplevel !== levelId) continue;
    if (ctx.state.entities[String(id)]?.c.monster) return id;
  }
  return null;
}

/**
 * The shopkeeper is in his shop (its floor, walls or door) on his shop level, which the hero is
 * on. ref: src/shk.c inhishop()
 */
export function inhishop(ctx: Pick<Ctx, 'state'>, id: EntityId): boolean {
  const e = eshkOf(ctx, id);
  const p = ctx.state.entities[String(id)]?.c.pos;
  if (!e || !p || e.shoplevel !== ctx.state.currentLevel || p.level !== e.shoplevel) return false;
  const level = ctx.state.levels[e.shoplevel];
  return level !== undefined && inRooms(level, p.x, p.y).includes(e.shoproom);
}

/**
 * x,y on the hero's level is shop floor whose shopkeeper is in his shop, and not his own spot:
 * where objects are for sale. ref: src/shk.c costly_spot()
 */
export function costlySpot(ctx: Pick<Ctx, 'state'>, x: number, y: number): boolean {
  const level = ctx.state.levels[ctx.state.currentLevel];
  if (!level) return false;
  const room = insideShop(level, x, y);
  if (room === null) return false;
  const shk = shopKeeper(ctx, level.id, room);
  const e = shk === null ? null : eshkOf(ctx, shk);
  if (shk === null || !e || !inhishop(ctx, shk)) return false;
  return !(x === e.shk.x && y === e.shk.y);
}

/**
 * The shops the hero is in on the current level, innermost first (none while she is in an
 * untended one). ref: u.ushops
 */
export function uShops(ctx: Pick<Ctx, 'state'>): number[] {
  return uShopRooms(ctx);
}

/**
 * The shopkeeper's name without its prefix, as a proper-name message param ('=Izchak': no
 * article, "Izchak's"). ref: src/shknam.c shkname()
 */
export function shkName(e: Eshk): string {
  const n = e.shknam;
  return `=${/^[A-Za-z]/.test(n) ? n : n.slice(1)}`;
}

/** The name is a personal one (no "Mr." / "Ms."). ref: src/shknam.c shkname_is_pname() */
export function shknameIsPname(e: Eshk): boolean {
  const c = e.shknam.charAt(0);
  return c === '-' || c === '+' || c === '=';
}

// ---------------------------------------------------------------------------------------------
// bills: the entries of an object, kept apart from shk.ts so that items.ts (splitting, merging)
// can keep them right. ref: src/shk.c onbill(), next_shkp(), splitbill(), same_price(), obfree()

/** The shopkeepers with a bill entry, in id order (any level). ref: src/shk.c next_shkp() */
function shopkeepers(ctx: Pick<Ctx, 'state'>): EntityId[] {
  const t = table(ctx, false);
  if (!t) return [];
  return Object.keys(t)
    .map(Number)
    .sort((a, b) => a - b);
}

/**
 * The unpaid (not used-up) entry of object `oid` on `shk`'s bill, or null. Used-up entries are
 * found only through the bill: their object is gone. ref: src/shk.c onbill()
 */
export function onbill(ctx: Pick<Ctx, 'state'>, oid: EntityId, shk: EntityId): BillEntry | null {
  return eshkOf(ctx, shk)?.bill.find((bp) => bp.oid === oid && !bp.useup) ?? null;
}

/** The shopkeeper whose bill has object `oid` and the entry, or null. */
export function billOf(
  ctx: Pick<Ctx, 'state'>,
  oid: EntityId,
): { shk: EntityId; bp: BillEntry } | null {
  for (const shk of shopkeepers(ctx)) {
    const bp = onbill(ctx, oid, shk);
    if (bp) return { shk, bp };
  }
  return null;
}

/** The used-up entry of object `oid` on any bill, or null. */
export function usedUpEntry(ctx: Pick<Ctx, 'state'>, oid: EntityId): BillEntry | null {
  for (const shk of shopkeepers(ctx)) {
    const bp = eshkOf(ctx, shk)?.bill.find((b) => b.oid === oid && b.useup);
    if (bp) return bp;
  }
  return null;
}

/** Takes entry `bp` off `shk`'s bill (C moves the last entry into its slot; order is kept here). */
export function dropBillEntry(ctx: Pick<Ctx, 'state'>, shk: EntityId, bp: BillEntry): void {
  const e = eshkOf(ctx, shk);
  if (!e) return;
  const i = e.bill.indexOf(bp);
  if (i >= 0) e.bill.splice(i, 1);
}

/**
 * `child` (`n` of them) has just been split off the unpaid stack `parent`: it gets its own entry
 * at the same price, or is free when the bill is full. ref: src/shk.c splitbill()
 */
export function splitbill(
  ctx: Pick<Ctx, 'state'>,
  parent: EntityId,
  child: EntityId,
  n: number,
): void {
  const found = billOf(ctx, parent);
  const e = found ? eshkOf(ctx, found.shk) : null;
  const it = ctx.state.entities[String(child)]?.c.item;
  if (!found || !e || !it) {
    if (it) delete it.unpaid;
    return;
  }
  found.bp.bquan -= n;
  if (e.bill.length >= BILLSZ) delete it.unpaid;
  else e.bill.push({ oid: child, bquan: n, price: found.bp.price, useup: false });
}

/**
 * Two unpaid stacks are on the same shopkeeper's bill at the same price, so may merge.
 * ref: src/shk.c same_price()
 */
export function samePrice(ctx: Pick<Ctx, 'state'>, a: EntityId, b: EntityId): boolean {
  const ba = billOf(ctx, a);
  const bb = billOf(ctx, b);
  return !!ba && !!bb && ba.shk === bb.shk && ba.bp.price === bb.bp.price;
}

/**
 * The unpaid stack `obj` merges into `into`: its billed quantity joins `into`'s entry.
 * ref: src/shk.c obfree(obj, merge)
 */
export function mergeBills(ctx: Pick<Ctx, 'state'>, into: EntityId, obj: EntityId): void {
  const bo = billOf(ctx, obj);
  if (!bo) return;
  const bm = onbill(ctx, into, bo.shk);
  if (!bm) return;
  bm.bquan += bo.bp.bquan;
  dropBillEntry(ctx, bo.shk, bo.bp);
}
