// Shopkeeping: what happens as the hero comes into a shop (6b3 step 2; bills, selling and robbery
// come in the later steps). Never import actions, itemactions, monmove, combat, peaceful, chat,
// priest or dothrow here: they import this module.
// ref: src/shk.c u_entered_shop(), deserted_shop(), pacify_shk(), shkname(); src/role.c Hello()
//
// Not ported: invisible heroes and steeds (neither exists), deafness, the pick-axe (no such
// object: only the dwarvish mattock is checked), the shop achievement.
import {
  NORMAL_SPEED,
  getLevel,
  getPlayer,
  inventoryOf,
  itemsAt,
  sortedIds,
  type Ctx,
  type EntityId,
  type Level,
} from '@nh/core';
import { eshkOf, inhishop, insideShop, shkName, shopKeeper, uShops, type Eshk } from './eshk';
import { isFrozen } from './mstate';
import { discover } from './o_init';
import { canSpotMon } from './perception';
import { P, hasProp } from './props';
import { SHTYPES, shopType } from './shknam';
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
function shopNameParam(level: Level, room: number): string {
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
function helpless(ctx: Pick<Ctx, 'state'>, id: EntityId): boolean {
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
