// The shop damage list: walls, doors and floor of a shop that the hero (or a monster) dug, broke
// or burnt, waiting for the shopkeeper to repair them (shkdamage.ts). C keeps it per level
// (`level.damagelist`, newest first); here it is `modData.nh.damage[levelId]`, plain JSON, newest
// first too, so find_damage() looks at the same entry first.
// A leaf: the many places that damage a shop (dig.ts, mdig.ts, buzz.ts, zap.ts, dokick.ts,
// lock.ts, btrapped.ts...) import it; it must not import them.
// ref: include/rm.h struct damage; src/shk.c add_damage(), discard_damage_owned_by();
// include/hack.h SHOP_*_COST; include/mextra.h REPAIR_DELAY
import {
  getLevel,
  inRooms,
  type Ctx,
  type DefId,
  type EntityId,
  type Json,
  type Level,
  type LevelId,
} from '@nh/core';
import { eshkOf, isShopType, shopKeeper } from './eshk';
import { T, isObstructedId, terrainIdAt } from './terrain';

/** ref: include/hack.h SHOP_DOOR_COST: a destroyed shop door */
export const SHOP_DOOR_COST = 400;
/** ref: include/hack.h SHOP_HOLE_COST: a hole or trap door */
export const SHOP_HOLE_COST = 200;
/** ref: include/hack.h SHOP_WALL_COST: a destroyed wall */
export const SHOP_WALL_COST = 200;
/** ref: include/hack.h SHOP_PIT_COST: a pit */
export const SHOP_PIT_COST = 100;
/** ref: include/mextra.h REPAIR_DELAY: the minimum delay between shop damage and repair */
export const REPAIR_DELAY = 5;

/**
 * One damaged spot. `typ` is the terrain it had (C's `typ` plus the `flags` that go with it:
 * the terrain id carries the wall's shape and the door's state). ref: include/rm.h struct damage
 */
export interface ShopDamage {
  x: number;
  y: number;
  /** The turn of the (latest) damage. */
  when: number;
  cost: number;
  typ: DefId;
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
  let t = nh['damage'];
  if (!isObj(t)) {
    if (!create) return null;
    t = {};
    nh['damage'] = t;
  }
  return t;
}

/** The level's damage list, newest first (empty when none). ref: level.damagelist */
export function damageList(ctx: Pick<Ctx, 'state'>, levelId: LevelId): ShopDamage[] {
  const l = table(ctx, false)?.[levelId];
  return Array.isArray(l) ? (l as unknown as ShopDamage[]) : [];
}

/** Replaces the level's list; an empty one is dropped. */
export function setDamageList(ctx: Pick<Ctx, 'state'>, levelId: LevelId, list: ShopDamage[]): void {
  if (list.length === 0) {
    const t = table(ctx, false);
    if (t) delete t[levelId];
    return;
  }
  const t = table(ctx, true);
  if (t) t[levelId] = list as unknown as Json;
}

/** The entry is gone. ref: src/shk.c discard_damage_struct() */
export function discardDamage(ctx: Pick<Ctx, 'state'>, levelId: LevelId, dam: ShopDamage): void {
  setDamageList(
    ctx,
    levelId,
    damageList(ctx, levelId).filter((d) => d !== dam && !(d.x === dam.x && d.y === dam.y)),
  );
}

/** The terrain is a door of any state (C's IS_DOOR(): doorways too). */
export const isDoorId = (ctx: Pick<Ctx, 'defs'>, id: DefId | undefined): boolean =>
  id !== undefined && ctx.defs.terrain(id).door !== undefined;

/**
 * IS_ROOM(typ): floor and what stands on it (stairs, fountains, sinks, altars), not doors,
 * corridors, rock, walls, trees or iron bars. ref: include/rm.h IS_ROOM()
 */
export const isRoomTyp = (ctx: Pick<Ctx, 'defs'>, id: DefId | undefined): boolean =>
  id !== undefined &&
  !isDoorId(ctx, id) &&
  !isObstructedId(id) &&
  id !== T.corr &&
  id !== T.iron_bars;

/** The shop rooms whose walls, door or floor hold x,y. ref: in_rooms(x, y, SHOPBASE) */
export function shopRoomsAt(level: Level, x: number, y: number): number[] {
  return inRooms(level, x, y).filter((r) => isShopType(level.rooms[r]?.type));
}

/**
 * The spot of the hero's level is damaged: a new entry remembers its terrain now (call it before
 * changing the terrain), an existing one adds the cost and moves its time to now. A door counts
 * only when it is a shop's real entrance (its keeper's door). ref: src/shk.c add_damage() (the
 * seen wall is remembered as a wall by the display already)
 */
export function addDamage(ctx: Ctx, x: number, y: number, cost: number): void {
  const level = getLevel(ctx.state);
  const id = terrainIdAt(level, x, y);
  if (isDoorId(ctx, id)) {
    // don't schedule for repair unless it's a real shop entrance
    const real = shopRoomsAt(level, x, y).some((r) => {
      const shk = shopKeeper(ctx, level.id, r);
      const e = shk === null ? null : eshkOf(ctx, shk);
      return e !== null && e.shd.x === x && e.shd.y === y;
    });
    if (!real) return;
  }
  const list = damageList(ctx, level.id);
  const old = list.find((d) => d.x === x && d.y === y);
  if (old) {
    old.cost += cost;
    old.when = ctx.state.turn; // needed by pay_for_damage()
    return;
  }
  if (id === undefined) return;
  setDamageList(ctx, level.id, [{ x, y, when: ctx.state.turn, cost, typ: id }, ...list]);
}

/**
 * Adds damage at x,y when it is part of a shop (its floor, walls or door). ref: the callers'
 * `if (*in_rooms(x, y, SHOPBASE)) add_damage(x, y, cost)`
 */
export function addShopDamage(ctx: Ctx, x: number, y: number, cost: number): boolean {
  const level = getLevel(ctx.state);
  if (shopRoomsAt(level, x, y).length === 0) return false;
  addDamage(ctx, x, y, cost);
  return true;
}

/**
 * The shopkeeper died: the damage to his shop will never be repaired.
 * ref: src/shk.c discard_damage_owned_by()
 */
export function discardDamageOwnedBy(ctx: Ctx, shk: EntityId): void {
  const e = eshkOf(ctx, shk);
  if (!e) return;
  const level = ctx.state.levels[e.shoplevel];
  if (!level) return;
  setDamageList(
    ctx,
    level.id,
    damageList(ctx, level.id).filter((d) => !inRooms(level, d.x, d.y).includes(e.shoproom)),
  );
}
