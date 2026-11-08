// Shop repairs: the shopkeeper repairs the damage on the list (shopdamage.ts) a few turns later
// by magic, as he moves or when the hero comes back to his level; and comes to her as the hole
// she digs in his shop nears completion. Paying for it is shkpay.ts.
// ref: src/shk.c shk_impaired(), repairable_damage(), find_damage(), shk_fixes_damage(),
// litter_getpos(), litter_scatter(), repair_damage(), fix_shop_damage(); src/dig.c holetime();
// src/do.c goto_level() fix_shop_damage()
//
// Not ported: balls and chains, engravings (del_engr_at()), walls passed through.
import {
  getLevel,
  inBounds,
  inRooms,
  itemsAt,
  sortedIds,
  trapAt,
  type Ctx,
  type DefId,
  type EntityId,
  type ModApi,
} from '@nh/core';
import { DIG_ID, diggingOf } from './digstate';
import { costlySpot, eshkOf, inhishop, insideShop, onbill, uShops } from './eshk';
import { addToInventory, mksobj, placeOnFloor } from './items';
import { pickingLock, stopPicking } from './lockstate';
import { canSpotMon } from './perception';
import { costlyAdjacent, findObjowner, helpless, shkname, subfrombill } from './shk';
import { BOLT_LIM, cansee, dist2, heroXY, monAt, posOf, say } from './shkpay';
import {
  REPAIR_DELAY,
  damageList,
  discardDamage,
  isDoorId,
  isRoomTyp,
  type ShopDamage,
} from './shopdamage';
import { T, isWallId, setTerrain, terrainIdAt } from './terrain';
import { TRAP, deltrap, isPit } from './trap';
import { isMtrapped } from './trapstate';

// ---------------------------------------------------------------------------------------------
// repairs

/**
 * He cannot act: gone, out of his shop, helpless or following the hero.
 * ref: src/shk.c shk_impaired()
 */
function shkImpaired(ctx: Ctx, shk: EntityId): boolean {
  const e = eshkOf(ctx, shk);
  if (!e || !ctx.state.entities[String(shk)]?.c.monster || !inhishop(ctx, shk)) return true;
  return helpless(ctx, shk) || e.following;
}

/**
 * Whether he can repair it now: not too soon, nobody in the wall's way, nobody in its trap, and
 * in his shop. ref: src/shk.c repairable_damage() (nothing passes walls)
 */
function repairableDamage(ctx: Ctx, dam: ShopDamage, shk: EntityId): boolean {
  if (shkImpaired(ctx, shk)) return false;
  const level = getLevel(ctx.state);
  const { x, y } = dam;
  // too soon to fix it?
  if (ctx.state.turn - dam.when < REPAIR_DELAY) return false;
  const h = heroXY(ctx);
  const uAt = h.x === x && h.y === y;
  // is it a wall? don't fix if anyone is in the way
  if (!isRoomTyp(ctx, dam.typ)) {
    const sp = posOf(ctx, shk);
    if (uAt || (sp.x === x && sp.y === y) || monAt(ctx, level, x, y)) return false;
  }
  // is it a trap? don't fix if hero or monster is in it
  if (trapAt(level, x, y)) {
    if (uAt) return false;
    const m = monAt(ctx, level, x, y);
    if (m && isMtrapped(ctx, m.id)) return false;
  }
  // does it belong to shk?
  const e = eshkOf(ctx, shk);
  return e !== null && inRooms(level, x, y).includes(e.shoproom);
}

/** The first damage he could repair, or null. ref: src/shk.c find_damage() */
function findDamage(ctx: Ctx, shk: EntityId): ShopDamage | null {
  if (shkImpaired(ctx, shk)) return null;
  return damageList(ctx, ctx.state.currentLevel).find((d) => repairableDamage(ctx, d, shk)) ?? null;
}

/**
 * The shopkeeper's move begins with repairing one damaged spot whose time has come: "Izchak
 * whispers an incantation." (or "something" from afar; unseen but near, "You hear someone
 * muttering an incantation."). ref: src/shk.c shk_fixes_damage()
 */
export function shkFixesDamage(ctx: Ctx, shk: EntityId): void {
  const dam = findDamage(ctx, shk);
  const mon = ctx.state.entities[String(shk)];
  const e = eshkOf(ctx, shk);
  if (!dam || !mon?.c.pos || !e) return;
  const h = heroXY(ctx);
  const closeby = dist2(mon.c.pos.x, mon.c.pos.y, h.x, h.y) <= (BOLT_LIM / 2) * (BOLT_LIM / 2);
  if (canSpotMon(ctx, mon))
    say(ctx, closeby ? 'shk.damage.whispers_incantation' : 'shk.damage.whispers_something', {
      shk: shkname(ctx, e),
    });
  else if (closeby) say(ctx, 'shk.damage.hear_muttering');
  repairDamage(ctx, shk, dam, false);
  discardDamage(ctx, ctx.state.currentLevel, dam);
}

/** ref: litter[] flags */
const LITTER_UPDATE = 1;
const LITTER_OPEN = 2;
const LITTER_INSHOP = 4;
const horiz = (i: number): number => (i % 3) - 1;
const vert = (i: number): number => Math.trunc(i / 3) - 1;

/** ZAP_POS(typ): not rock, a wall, a tree, a secret door or corridor (iron bars count). */
const zapPosId = (id: DefId | undefined): boolean =>
  id !== undefined &&
  id !== T.stone &&
  !isWallId(id) &&
  id !== T.tree &&
  id !== T.scorr &&
  id !== T.sdoor_v &&
  id !== T.sdoor_h &&
  id !== T.sdoor_locked_v &&
  id !== T.sdoor_locked_h;

/**
 * The open spots around a gap in the wall being repaired that hold objects, and which of them
 * are in his shop; returns how many are. ref: src/shk.c litter_getpos()
 */
function litterGetpos(ctx: Ctx, litter: number[], x: number, y: number, shk: EntityId): number {
  const level = getLevel(ctx.state);
  const e = eshkOf(ctx, shk);
  let k = 0;
  litter.fill(0);
  const id = terrainIdAt(level, x, y);
  if (!e || itemsAt(ctx.defs, ctx.state, level.id, x, y).length === 0 || isRoomTyp(ctx, id))
    return 0;
  for (let i = 0; i < 9; i++) {
    const ix = x + horiz(i);
    const iy = y + vert(i);
    if (i === 4 || !inBounds(level, ix, iy) || !zapPosId(terrainIdAt(level, ix, iy))) continue;
    litter[i] = LITTER_OPEN;
    if (insideShop(level, ix, iy) === e.shoproom) {
      litter[i] = (litter[i] ?? 0) | LITTER_INSHOP;
      ++k;
    }
  }
  return k;
}

/**
 * The objects in the repaired gap are moved into his shop (boulders and rocks merge into the
 * wall); an unpaid one moved all the way in comes off the bill. ref: src/shk.c litter_scatter()
 * (no ball and chain)
 */
function litterScatter(ctx: Ctx, litter: number[], x: number, y: number, shk: EntityId): void {
  const level = getLevel(ctx.state);
  for (;;) {
    const objs = itemsAt(ctx.defs, ctx.state, level.id, x, y);
    const otmp = objs[0];
    if (!otmp) break;
    // don't mess w/ boulders -- just merge into wall
    if (otmp.def === 'nh:boulder' || otmp.def === 'nh:rock') {
      ctx.remove(otmp.id);
      continue;
    }
    let trylimit = 10;
    let i = ctx.rng.rn2(9);
    // otmp must be moved otherwise the loop won't terminate
    do {
      i = (i + 1) % 9;
    } while (--trylimit && !((litter[i] ?? 0) & LITTER_INSHOP));
    let ix: number;
    let iy: number;
    if (((litter[i] ?? 0) & (LITTER_OPEN | LITTER_INSHOP)) !== 0) {
      ix = x + horiz(i);
      iy = y + vert(i);
    } else {
      // we know shk isn't at <x,y> because repair is deferred in that situation
      const sp = posOf(ctx, shk);
      ix = sp.x;
      iy = sp.y;
    }
    const it = otmp.c.item;
    if (it?.unpaid) {
      // moved all the way into the shop: take it off the bill
      let oshk: EntityId | null = shk;
      if (
        costlySpot(ctx, ix, iy) &&
        (onbill(ctx, otmp.id, shk) ||
          ((oshk = findObjowner(ctx, otmp, ix, iy)) !== null && onbill(ctx, otmp.id, oshk)))
      )
        subfrombill(ctx, otmp, oshk);
    }
    if (it?.noCharge && !costlySpot(ctx, ix, iy) && !costlyAdjacent(ctx, shk, ix, iy))
      delete it.noCharge;
    placeOnFloor(ctx, otmp.id, level.id, ix, iy);
    litter[i] = (litter[i] ?? 0) | LITTER_UPDATE;
  }
}

/**
 * Repairs one damaged spot: a trap there goes (a land mine or bear trap into his pack: "Izchak
 * untraps a land mine.", "The pit is filled in.", "The X vanishes."), then a wall or door that
 * is still broken is rebuilt (a door closed), objects in the gap are moved into the shop, and
 * "Suddenly, a section of the wall closes up!" / "Suddenly, the shop door reappears!" (unseen:
 * "You feel more claustrophobic than before." inside, else 1 in 10 "The dungeon acoustics
 * noticeably change."). `catchup`: done while she was away, silently. Returns 0 if postponed,
 * 1 silent, 2 normal, 3 untrap. ref: src/shk.c repair_damage()
 */
function repairDamage(ctx: Ctx, shk: EntityId, dam: ShopDamage, catchup: boolean): number {
  if (!repairableDamage(ctx, dam, shk)) return 0;
  const level = getLevel(ctx.state);
  const { x, y } = dam;
  const seeit = cansee(ctx, level, x, y);
  const mon = ctx.state.entities[String(shk)];
  const e = eshkOf(ctx, shk);
  if (!mon?.c.pos || !e) return 0;
  let disposition = 1;
  const ttmp = trapAt(level, x, y);
  if (ttmp) {
    const tname = `@${ttmp.def}`;
    const seenTrap = ttmp.seen && seeit;
    if (ttmp.def === TRAP.landmine || ttmp.def === TRAP.bear) {
      // convert to an object
      const otyp = ttmp.def === TRAP.landmine ? 'nh:land_mine' : 'nh:beartrap';
      const oid = mksobj(ctx, ctx.defs.object(otyp), { quantity: 1 });
      if (!catchup) {
        if (canSpotMon(ctx, mon) && dist2(x, y, mon.c.pos.x, mon.c.pos.y) <= 2)
          say(ctx, 'shk.damage.untraps', { shk: shkname(ctx, e), obj: `@${otyp}` });
        else if (seenTrap) say(ctx, 'shk.damage.trap_vanishes', { trap: tname });
      }
      addToInventory(ctx, shk, oid); // mpickobj()
    } else if (ttmp.def === TRAP.hole || isPit(ttmp.def)) {
      if (!catchup && seenTrap) say(ctx, 'shk.damage.filled_in', { trap: tname });
    } else if (!catchup && seenTrap) say(ctx, 'shk.damage.trap_vanishes', { trap: tname });
    deltrap(ctx, level.id, ttmp);
    if (!catchup) disposition = 3;
  }
  const cur = terrainIdAt(level, x, y);
  const curDoor = cur === undefined ? undefined : ctx.defs.terrain(cur).door;
  const sameTyp = isDoorId(ctx, dam.typ) ? isDoorId(ctx, cur) : dam.typ === cur;
  // no terrain fix necessary (trap removal or manually repaired)
  if (
    isRoomTyp(ctx, dam.typ) ||
    (sameTyp && (!isDoorId(ctx, dam.typ) || (curDoor !== 'doorway' && curDoor !== undefined)))
  )
    return disposition;

  const picking = pickingLock(ctx);
  const stopPick =
    (curDoor === 'closed' || curDoor === 'locked') &&
    picking !== null &&
    picking.level === level.id &&
    picking.x === x &&
    picking.y === y;
  // door or wall repair; trap, if any, is now gone: the original terrain (a door closed)
  setTerrain(level, x, y, isDoorId(ctx, dam.typ) ? T.door_closed : dam.typ);
  const litter: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  if (litterGetpos(ctx, litter, x, y, shk)) litterScatter(ctx, litter, x, y, shk);
  if (catchup) return 1; // repair occurred while off level so no messages

  if (seeit) {
    // the hero sees the actual repair process
    if (isWallId(dam.typ)) say(ctx, 'shk.damage.wall_closes');
    else if (isDoorId(ctx, dam.typ)) say(ctx, 'shk.damage.door_reappears');
  } else if (isWallId(dam.typ)) {
    const h = heroXY(ctx);
    if (insideShop(level, h.x, h.y) === e.shoproom) say(ctx, 'shk.damage.claustrophobic');
    else if (!ctx.rng.rn2(10)) say(ctx, 'shk.damage.acoustics'); // Norep()
  }
  if (stopPick) stopPicking(ctx);
  if (disposition < 3) disposition = 2;
  return disposition;
}

/**
 * Catching up on repairs on arrival at a level she visited before: each shopkeeper there who
 * can act repairs what he can, silently. ref: src/shk.c fix_shop_damage()
 */
export function fixShopDamage(ctx: Ctx): void {
  const levelId = ctx.state.currentLevel;
  if (damageList(ctx, levelId).length === 0) return;
  for (const id of sortedIds(ctx.state)) {
    const e = eshkOf(ctx, id);
    const m = ctx.state.entities[String(id)];
    if (!e || !m?.c.monster || m.c.pos?.level !== levelId) continue;
    if (shkImpaired(ctx, id)) continue;
    for (const dam of [...damageList(ctx, levelId)])
      if (repairDamage(ctx, id, dam, true)) discardDamage(ctx, levelId, dam);
  }
}

/**
 * On arrival at a level (after the special rooms are checked): shop repair is normally done when
 * shopkeepers move, but we may need to catch up for lost time here (a new level has no damage).
 * ref: src/do.c goto_level() `if (!new) fix_shop_damage()`
 */
export function registerShopDamage(api: ModApi): void {
  api.on('levelChange', (ctx) => fixShopDamage(ctx));
}

/**
 * When the hole she is digging in his shop will be through, roughly (the shopkeeper comes to
 * her when it is near); -1 when she is not digging in a shop. ref: src/dig.c holetime()
 */
export function holetime(ctx: Ctx): number {
  const occ = ctx.state.occupation?.action;
  const d = diggingOf(ctx);
  if (occ?.type !== 'mod' || occ.action !== DIG_ID || !d || uShops(ctx).length === 0) return -1;
  return Math.trunc((250 - d.effort) / 20);
}
