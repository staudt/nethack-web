// Bringing corpses back to life: the wand of undead turning hitting a corpse on the floor, under
// her (a down zap), in her pack (zapped at herself) or in a monster's pack.
// ref: src/zap.c revive(), unturn_dead(); src/read.c cant_revive(); src/shk.c shk_your()
//
// Not ported (see DEVIATIONS.md "Wand effects"): eggs (nothing hatches yet), corpses inside
// containers, buried corpses, ghosts drawn back into their bodies, saved monster traits
// (`omonst`: a pet's corpse rises as a new, untame monster of its kind), named corpses, eels
// out of water, `mrevived` (no kill counts), and the corpses cant_revive() turns into a human
// zombie or a doppelganger (aligned priests, unique monsters): neither monster exists, so those
// corpses do not rise.
import {
  getLevel,
  getPlayer,
  inRooms,
  inventoryOf,
  type Ctx,
  type Entity,
  type Json,
  type ModApi,
  type Msg,
} from '@nh/core';
import { costlySpot, isShopType, shopKeeper } from './eshk';
import { makemon, mnextoPos } from './generation';
import { hungerData } from './hunger';
import { encumberMsg } from './itemactions';
import { eatenStat, placeObject, removeFromInventory, splitStack } from './items';
import { heroSees } from './mongear';
import { nonliving } from './mondata';
import { xnameOf } from './objnam';
import { canSpotMon, monNam } from './perception';
import { billUsedUp, stolenValue } from './shk';

const CORPSE = 'nh:corpse';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/** A revived monster, and whether revive() said "<corpse> glows iridescently." */
export interface Revived {
  mon: Entity;
  glowed: boolean;
}

/**
 * Whose the object is, for "your jackal corpse", "the jackal corpse", "Izchak's jackal corpse"
 * or "the gnome's jackal corpse" (`cap`: at the start of a sentence). ref: src/shk.c shk_your()
 * (shk_owns(), mon_owns())
 */
export function shkYour(ctx: Ctx, obj: Entity, cap: boolean): Msg {
  const it = obj.c.item;
  const p = obj.c.pos;
  if (it && p && p.level === ctx.state.currentLevel && costlySpot(ctx, p.x, p.y) && !it.noCharge) {
    const shk = shopAt(ctx, p.x, p.y);
    if (shk)
      return { key: cap ? 'zap.owner.Mon' : 'zap.owner.mon', params: { mon: monNam(ctx, shk) } };
  }
  const carrier = it?.carriedBy ?? null;
  if (carrier !== null && carrier !== ctx.state.playerId) {
    const m = ctx.state.entities[String(carrier)];
    if (m) return { key: cap ? 'zap.owner.Mon' : 'zap.owner.mon', params: { mon: monNam(ctx, m) } };
  }
  if (carrier === ctx.state.playerId) return { key: cap ? 'zap.owner.Your' : 'zap.owner.your' };
  return { key: cap ? 'zap.owner.The' : 'zap.owner.the' };
}

/** The shopkeeper of the shop at x,y of her level. ref: shop_keeper(*in_rooms(x, y, SHOPBASE)) */
export function shopAt(ctx: Ctx, x: number, y: number): Entity | null {
  const level = getLevel(ctx.state);
  const room = inRooms(level, x, y).find((r) => isShopType(level.rooms[r]?.type));
  const id = room === undefined ? null : shopKeeper(ctx, level.id, room);
  return id === null ? null : (ctx.state.entities[String(id)] ?? null);
}

/** The object's name as one of it ("jackal corpse"). ref: src/objnam.c cxname_singular() */
export function cxnameSingular(ctx: Ctx, obj: Entity): Msg {
  const it = obj.c.item;
  if (!it || it.quantity === 1) return xnameOf(ctx.state, ctx.defs, obj);
  const q = it.quantity;
  it.quantity = 1;
  const name = xnameOf(ctx.state, ctx.defs, obj);
  it.quantity = q;
  return name;
}

/** Where the object is: the floor, or its carrier's square. */
function objLocation(ctx: Ctx, obj: Entity): { level: string; x: number; y: number } | null {
  if (obj.c.pos) return obj.c.pos;
  const carrier = obj.c.item?.carriedBy;
  if (carrier === undefined || carrier === null) return null; // contained: not ported
  return ctx.state.entities[String(carrier)]?.c.pos ?? null;
}

/**
 * Brings a corpse back to life: its monster rises at the corpse's spot, or next to it when
 * someone is there, and the corpse (one of a stack) is used up; a partly eaten corpse gives a
 * wounded monster. `byHero`: "<corpse> glows iridescently." when she sees the spot, and shop
 * goods are charged. Null when nothing rose (the corpse stays). ref: src/zap.c revive()
 */
export function revive(ctx: Ctx, corpse: Entity, byHero: boolean): Revived | null {
  const it = corpse.c.item;
  const montype = it?.corpseOf;
  if (!it || corpse.def !== CORPSE || !montype || !ctx.defs.isMonster(montype)) return null;
  const at = objLocation(ctx, corpse);
  if (!at || at.level !== ctx.state.currentLevel) return null;
  const mptr = ctx.defs.monster(montype);
  // cant_revive(): aligned priests would rise as human zombies and unique monsters as
  // doppelgangers; neither exists here
  if (montype === 'nh:aligned_cleric' || mptr.genFlags.includes('uniq')) return null;

  // prepare for the monster: someone (C's MON_AT, or makemon()'s byyou for her own square) is
  // in the way: the nearest free spot
  const level = getLevel(ctx.state, at.level);
  let pos = { x: at.x, y: at.y };
  if (occupied(ctx, at.level, pos.x, pos.y)) {
    const p = mnextoPos(ctx, level, null, pos);
    if (p) pos = p;
  }
  // NO_MINVENT | MM_NOWAIT | MM_NOMSG | MM_NOCOUNTBIRTH
  const id = makemon(ctx, mptr, pos, { level: level.id, nogroup: true, noInventory: true });
  const mon = id === null ? undefined : ctx.state.entities[String(id)];
  if (!mon) return null;

  // one_of: only one of a stack is revived
  const oneOf = it.quantity > 1;
  let piece = corpse;
  if (oneOf) {
    const sid = splitStack(ctx, corpse.id, 1);
    const split = ctx.state.entities[String(sid)];
    if (split?.c.item) {
      if (corpse.c.pos) placeObject(ctx, sid, corpse.c.pos.level, corpse.c.pos.x, corpse.c.pos.y);
      else split.c.item.carriedBy = it.carriedBy;
      piece = split;
    }
  }

  // if this is caused by the hero there might be a shop charge
  let glowed = false;
  if (byHero) {
    const pit = piece.c.item;
    const carried = pit?.carriedBy === ctx.state.playerId;
    const shkp =
      pit && costlySpot(ctx, at.x, at.y) && (carried ? !!pit.unpaid : !pit.noCharge)
        ? shopAt(ctx, at.x, at.y)
        : null;
    if (heroSees(ctx, at)) {
      // "[one of ]<owner> <corpse[s]> glows iridescently."
      if (pit && oneOf) pit.quantity++; // force plural
      const name = xnameOf(ctx.state, ctx.defs, piece);
      if (pit && oneOf) pit.quantity--;
      say(ctx, oneOf ? 'zap.revive.glows_one' : 'zap.revive.glows', {
        owner: shkYour(ctx, piece, !oneOf),
        corpse: name,
      });
      glowed = true;
    } else if (shkp) say(ctx, 'zap.revive.resuscitated');
    // don't charge for the shopkeeper's own corpse if we just revived him
    if (shkp && shkp.id !== mon.id)
      stolenValue(ctx, piece, at.x, at.y, !!shkp.c.monster?.peaceful, false);
  }

  // partially eaten corpse yields wounded monster
  const eaten = piece.c.item?.eaten;
  if (eaten !== undefined && mon.c.hp)
    mon.c.hp.cur = eatenStat(mon.c.hp.cur, mptr.nutrition, eaten);

  // finally, get rid of the corpse--it's gone now
  if (piece.c.item?.carriedBy !== null && piece.c.item?.carriedBy !== undefined) {
    const mine = piece.c.item.carriedBy === ctx.state.playerId;
    removeFromInventory(ctx, piece.id);
    if (mine) billUsedUp(ctx, piece);
  }
  ctx.remove(piece.id);
  return { mon, glowed };
}

/** A monster, or the hero, stands at x,y. */
function occupied(ctx: Ctx, levelId: string, x: number, y: number): boolean {
  const hp = getPlayer(ctx.state).c.pos;
  if (hp && hp.level === levelId && hp.x === x && hp.y === y) return true;
  for (const e of Object.values(ctx.state.entities)) {
    const p = e.c.pos;
    if (e.c.monster && p && p.level === levelId && p.x === x && p.y === y) return true;
  }
  return false;
}

/**
 * Tries to revive every corpse `who` (a monster or 'hero') carries; the number that rose.
 * "Your jackal corpse suddenly comes alive!" ("It suddenly comes alive!" after revive()'s glow),
 * "reanimates" for a nonliving one; an unseen carrier's corpse: "<A jackal> suddenly appears!".
 * ref: src/zap.c unturn_dead() (eggs are not ported)
 */
export function unturnDead(ctx: Ctx, who: Entity | 'hero'): number {
  const isU = who === 'hero';
  const owner = isU ? getPlayer(ctx.state) : who;
  const youseeit = isU || (!!owner.c.pos && heroSees(ctx, owner.c.pos));
  let res = 0;
  // each corpse (a stack revives one); the list is taken first, as C's saved next pointer
  const pack = inventoryOf(ctx.state, owner.id).filter((o) => o.def === CORPSE);
  for (const otmp of pack) {
    if (!ctx.state.entities[String(otmp.id)]) continue;
    // save the name; the object is liable to go away
    const it = otmp.c.item;
    if (!it) continue;
    const corpseName = xnameOf(ctx.state, ctx.defs, otmp);
    const ownerMsg: Msg =
      it.quantity > 1
        ? { key: 'zap.owner.one_of', params: { owner: shkYour(ctx, otmp, false) } }
        : shkYour(ctx, otmp, true);
    const r = revive(ctx, otmp, true); // !context.mon_moving: only the hero zaps here
    if (!r) continue;
    res++;
    // a different type (cant_revive()'s zombie) cannot happen here
    const verb = nonliving(ctx.defs.monster(r.mon.def)) ? 'reanimates' : 'comes_alive';
    // after revive()'s "glows iridescently" the corpse is just "It"
    if (youseeit && r.glowed) say(ctx, `zap.unturn.it_${verb}`);
    else if (youseeit) say(ctx, `zap.unturn.${verb}`, { owner: ownerMsg, corpse: corpseName });
    else if (canSpotMon(ctx, r.mon)) say(ctx, 'zap.unturn.appears', { mon: monNam(ctx, r.mon) });
  }
  if (isU && res) encumberMsg(ctx);
  return res;
}

/**
 * A troll corpse's revival timer: the troll rises where the corpse is ("<The troll> rises from
 * the dead!", "The troll corpse disappears!" when only the spot is seen; "The troll corpse
 * writhes out of your grasp!" / "You feel squirming in your backpack!" from her pack; "<A
 * troll> suddenly appears!" from a monster's). A corpse that cannot rise (someone else's level,
 * inside a container) rots away instead: "You feel less hassled." ref: src/do.c revive_mon(),
 * revive_corpse() (no Riders, no displacers, no buried corpses)
 */
function reviveMon(ctx: Ctx, data: Json): void {
  const id = (data as { id?: unknown } | null)?.id;
  if (typeof id !== 'number') return;
  const body = ctx.state.entities[String(id)];
  const it = body?.c.item;
  if (!body || body.def !== CORPSE || !it) return; // eaten or gone
  const carrier = it.carriedBy ?? null;
  const inInvent = carrier === ctx.state.playerId;
  const isUwep = inInvent && it.equipped === 'weapon';
  const chewed = (it.eaten ?? 0) !== 0;
  const cname = cxnameSingular(ctx, body);
  const at = objLocation(ctx, body);
  const v = hungerData(ctx).victual;
  const r = revive(ctx, body, false);
  if (!r) {
    // ref: revive_mon(): rot this corpse away
    say(ctx, 'revive.less_hassled');
    const when = ctx.rng.d(5, 50) - (ctx.state.turn - (it.age ?? 0));
    ctx.schedule(Math.max(when, 1), 'nh:rot_corpse', { id });
    return;
  }
  // ref: src/eat.c food_disappears(): a meal on this corpse is over
  if (v && v.piece === id && !ctx.state.entities[String(id)]) {
    hungerData(ctx).victual = null;
    ctx.interrupt();
  }
  const mon = r.mon;
  const seen = !!mon.c.pos && heroSees(ctx, mon.c.pos);
  const mname = monNam(ctx, mon);
  if (inInvent) {
    if (isUwep) say(ctx, 'revive.writhes_grasp', { corpse: cname });
    else say(ctx, 'revive.squirming');
    encumberMsg(ctx);
  } else if (carrier !== null) {
    // ref: revive_corpse() OBJ_MINVENT
    const mcarry = ctx.state.entities[String(carrier)];
    if (seen) {
      if (mcarry?.c.pos && heroSees(ctx, mcarry.c.pos))
        say(ctx, canSpotMon(ctx, mon) ? 'revive.startled' : 'revive.startled_gone', {
          mon: monNam(ctx, mcarry),
          corpse: cname,
        });
      else if (canSpotMon(ctx, mon))
        say(ctx, chewed ? 'revive.appears_chewed' : 'revive.appears', { mon: mname });
    }
  } else if (at && (heroSees(ctx, at) || seen)) {
    // ref: revive_corpse() OBJ_FLOOR
    if (seen) say(ctx, chewed ? 'revive.rises_chewed' : 'revive.rises', { mon: mname });
    else say(ctx, 'revive.disappears', { corpse: cname });
  }
}

export function registerRevive(api: ModApi): void {
  api.defineTimer({ id: 'nh:revive_mon', fire: reviveMon });
}
