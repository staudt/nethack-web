// Containers: #loot on a box or bag on the floor, applying a carried bag, taking things out and
// putting things in through menus, bags of holding (lighter contents, losses from a cursed one,
// the explosion of one bag of holding put into another).
// ref: src/pickup.c doloot_core(), able_to_loot(), do_loot_cont(), use_container(),
// in_or_out_menu(), menu_loot(), in_container(), out_container(), mbag_explodes(),
// do_boh_explosion(), boh_loss(), mbag_item_gone(), u_handsy(); src/mkobj.c add_to_container()
//
// Not ported (see DEVIATIONS.md): the ':' (look inside), 'r' (reversed) and 's' (stash one)
// choices, the object-class filter menu of menustyle:full, looting several containers through one
// "Loot which containers?" menu (each floor container has its own offer instead), reverse_loot()
// while confused, trapped boxes, bags of tricks, ice boxes, Schroedinger's cat, selling into a
// shop's container (6b3 step 4), scatter() of a bag of holding explosion (what survives lands at
// the hero's feet), the weight check when taking things out of a carried container, the
// "Continue?" confirmation for heavy items, water (an oilskin sack only matters there).
import {
  NORMAL_SPEED,
  contents,
  getPlayer,
  inventoryOf,
  isContainer,
  itemsAt,
  putIn,
  shownId,
  takeOut,
  type ActionDef,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type Json,
  type Msg,
  type Offer,
  type PromptOption,
} from '@nh/core';
import { losehp } from './hp';
import { carryCount, encumberMsg, invOption, prinv } from './itemactions';
import {
  addToInventory,
  invCount,
  mergable,
  merged,
  objKnown,
  placeOnFloor,
  removeFromInventory,
  setCknown,
  setLknown,
  splitStack,
} from './items';
import { snuffLit } from './light';
import { autokey, autounlock } from './lock';
import { checkCapacity } from './magic';
import { nearCapacity } from './stats';
import { xnameOf } from './objnam';
import { P, heroHas } from './props';
import { setSwapWep, swapWep } from './wield';
import { HERE } from './priority';
import { costlySpot } from './eshk';
import { addtobill } from './shk';

export const LOOT_ID: DefId = 'nh:loot';

/** The containers of the subset. ref: include/objects.h CONTAINER() */
export const BOX = {
  large: 'nh:large_box',
  chest: 'nh:chest',
  sack: 'nh:sack',
  oilskin: 'nh:oilskin_sack',
  holding: 'nh:bag_of_holding',
} as const;

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const hero = (ctx: Pick<Ctx, 'state'>): Entity => getPlayer(ctx.state);

/** ref: include/obj.h Is_mbag(): a bag of holding (no bags of tricks here) */
const isMbag = (ctx: Pick<Ctx, 'defs'>, e: Entity): boolean =>
  ctx.defs.object(e.def).container?.holding === true;
const isBox = (ctx: Pick<Ctx, 'defs'>, e: Entity): boolean =>
  ctx.defs.object(e.def).container?.box === true;
const hasContents = (ctx: Pick<Ctx, 'state'>, e: Entity): boolean =>
  contents(ctx.state, e.id).length > 0;

const held = (ctx: Pick<Ctx, 'state'>, box: Entity): boolean =>
  box.c.item?.carriedBy === ctx.state.playerId;

/** "your sack" (carried) or "the large box" (on the floor), as a message param. */
const ysimple = (ctx: Ctx, box: Entity, cap = false): Msg => ({
  key: held(ctx, box) ? (cap ? 'loot.Your' : 'loot.your') : cap ? 'loot.The' : 'loot.the',
  params: { item: xnameOf(ctx.state, ctx.defs, box) },
});

/** Floor containers at the hero's feet, top of the pile first. */
export function floorContainers(ctx: Ctx): Entity[] {
  const p = hero(ctx).c.pos;
  if (!p) return [];
  return itemsAt(ctx.defs, ctx.state, p.level, p.x, p.y).filter((e) => isContainer(ctx.defs, e));
}

/** A wielded cursed two-hander leaves no hand free. ref: src/wield.c freehand() */
function freehand(ctx: Ctx): boolean {
  const w = inventoryOf(ctx.state, ctx.state.playerId).find((o) => o.c.item?.equipped === 'weapon');
  if (!w?.c.item) return true;
  return !(w.c.item.buc === 'cursed' && ctx.defs.object(w.def).weapon?.bimanual === true);
}

// ---------------------------------------------------------------------------------------------
// bag of holding

/**
 * Whether putting `obj` into a bag of holding makes it explode: another bag of holding, or one
 * inside it. ref: src/pickup.c mbag_explodes() (no wands of cancellation or bags of tricks)
 */
function mbagExplodes(ctx: Ctx, obj: Entity, depthin: number): boolean {
  // odds: 1/1, 2/2, 3/4, 4/8, 5/16, 6/32, 7/64, 8/128, 9/128, 10/128,...
  if (isMbag(ctx, obj) && ctx.rng.rn2(1 << (depthin > 7 ? 7 : depthin)) <= depthin) return true;
  for (const o of contents(ctx.state, obj.id)) if (mbagExplodes(ctx, o, depthin + 1)) return true;
  return false;
}

/** ref: src/pickup.c is_boh_item_gone() */
const bohItemGone = (ctx: Ctx): boolean => !ctx.rng.rn2(13);

/** An object inside a cursed bag of holding is destroyed. ref: src/pickup.c mbag_item_gone() */
function mbagItemGone(ctx: Ctx, item: Entity, silent: boolean): void {
  if (!silent) {
    const pl = (item.c.item?.quantity ?? 1) !== 1;
    say(ctx, pl ? 'loot.vanished_pl' : 'loot.vanished', {
      item: ctx.defs.itemName(ctx.state, item),
    });
  }
  ctx.remove(item.id);
}

/**
 * The contents of an exploding bag of holding: some are destroyed, the rest land at the hero's
 * feet (scatter() is not ported). ref: src/pickup.c do_boh_explosion()
 */
function bohExplosion(ctx: Ctx, boh: Entity): void {
  const p = hero(ctx).c.pos;
  for (const o of contents(ctx.state, boh.id)) {
    takeOut(ctx.state, o.id);
    if (bohItemGone(ctx)) mbagItemGone(ctx, o, true);
    else if (p) placeOnFloor(ctx, o.id, p.level, p.x, p.y);
    else ctx.remove(o.id);
  }
}

/** Sometimes tosses objects out of a cursed magic bag. ref: src/pickup.c boh_loss() */
function bohLoss(ctx: Ctx, box: Entity): boolean {
  if (!isMbag(ctx, box) || box.c.item?.buc !== 'cursed' || !hasContents(ctx, box)) return false;
  let lost = false;
  for (const o of contents(ctx.state, box.id)) {
    if (bohItemGone(ctx)) {
      takeOut(ctx.state, o.id);
      mbagItemGone(ctx, o, false);
      lost = true;
    }
  }
  return lost;
}

// ---------------------------------------------------------------------------------------------
// in and out

/** Adds a detached object to the container, merging with a stack there. ref: add_to_container() */
function addToContainer(ctx: Ctx, box: Entity, obj: Entity): void {
  for (const o of contents(ctx.state, box.id)) if (merged(ctx, o, obj)) return;
  putIn(ctx.defs, ctx.state, box.id, obj.id);
}

/** 1: put in, 0: not put in, -1: stop (the container is gone). ref: src/pickup.c in_container() */
function inContainer(ctx: Ctx, box: Entity, obj: Entity): -1 | 0 | 1 {
  const it = obj.c.item;
  if (!it) return 0;
  if (obj.id === box.id) {
    say(ctx, 'loot.topological');
    return 0;
  }
  if (it.equipped !== null && it.equipped !== 'weapon') {
    say(ctx, 'loot.wearing');
    return 0;
  }
  if (it.equipped === 'weapon') {
    if (it.buc === 'cursed' && ctx.defs.object(obj.def).class === 'weapon') {
      // welded(): weldmsg()
      it.known.buc = true;
      const bi = ctx.defs.object(obj.def).weapon?.bimanual === true;
      say(ctx, `wield.welded${it.quantity !== 1 ? '_pl' : ''}${bi ? '_hands' : ''}`, {
        item: xnameOf(ctx.state, ctx.defs, obj),
      });
      return 0;
    }
    it.equipped = null; // setuwep((struct obj *) 0)
  } else if (swapWep(ctx)?.id === obj.id) setSwapWep(ctx, null);

  // boxes can't fit into any container
  if (isBox(ctx, obj)) {
    say(ctx, 'loot.cant_fit', {
      item: xnameOf(ctx.state, ctx.defs, obj),
      box: xnameOf(ctx.state, ctx.defs, box),
    });
    return 0;
  }

  removeFromInventory(ctx, obj.id); // freeinv()
  snuffLit(ctx, obj); // obj_is_burning(): this used to be part of freeinv()

  if (isMbag(ctx, box) && mbagExplodes(ctx, obj, 0)) {
    // explicitly mention what item is triggering the explosion
    say(ctx, 'loot.explosion', { item: ctx.defs.itemName(ctx.state, obj) });
    // one bag of holding into another
    if (isMbag(ctx, obj)) bohExplosion(ctx, obj);
    ctx.remove(obj.id);
    bohExplosion(ctx, box);
    if (held(ctx, box)) removeFromInventory(ctx, box.id);
    ctx.remove(box.id);
    losehp(ctx, ctx.rng.d(6, 6), '@killer.magical_explosion');
    return -1;
  }
  say(ctx, 'loot.put_in', {
    item: ctx.defs.itemName(ctx.state, obj),
    box: xnameOf(ctx.state, ctx.defs, box),
  });
  addToContainer(ctx, box, obj);
  return 1;
}

/**
 * Takes `count` of `obj` out into the hero's inventory. 1: taken, 0: not taken, -1: stop.
 * ref: src/pickup.c out_container(), lift_object() (no "Continue?" confirmation)
 */
function outContainer(
  ctx: Ctx,
  box: Entity,
  obj: Entity,
  count: number,
  enc: { n: number },
): -1 | 0 | 1 {
  const it = obj.c.item;
  if (!it) return 0;
  let qq = Math.min(count, it.quantity);
  if (!held(ctx, box)) {
    const cc = carryCount(ctx, obj, qq);
    if (cc.qq < 1) return -1;
    qq = cc.qq;
  }
  const isCoin = ctx.defs.object(obj.def).class === 'coin';
  const merges = inventoryOf(ctx.state, ctx.state.playerId).some((o) =>
    mergable(ctx.defs, o, obj, ctx.state),
  );
  if (!isCoin && invCount(ctx, ctx.state.playerId) >= 52 && !merges) {
    say(ctx, 'pickup.full');
    return -1;
  }
  const part = qq < it.quantity ? splitStack(ctx, obj.id, qq) : obj.id;
  takeOut(ctx.state, part);
  // shop goods taken out of a floor container in a shop go on the bill
  const partObj = ctx.state.entities[String(part)];
  const bp = box.c.pos;
  if (partObj && !partObj.c.item?.unpaid && !held(ctx, box) && bp && costlySpot(ctx, bp.x, bp.y))
    addtobill(ctx, partObj, false, false, false);
  const stack = ctx.state.entities[String(addToInventory(ctx, ctx.state.playerId, part))];
  if (!stack) return 0;
  // pickup_prinv(otmp, count, "removing"): the load prefix when it changed
  const near = nearCapacity(ctx.state, ctx.defs, ctx.state.playerId);
  let prefix: Msg | null = null;
  if (near !== enc.n) {
    prefix = near >= 1 ? { key: 'loot.removing', params: { load: loadKey(near) } } : null;
    enc.n = near;
  }
  prinv(ctx, stack, qq, prefix);
  return 1;
}

const loadKey = (level: number): Msg => ({
  key:
    level >= 4
      ? 'load.extreme'
      : level >= 3
        ? 'load.much'
        : level >= 2
          ? 'load.moderate'
          : 'load.slight',
});

// ---------------------------------------------------------------------------------------------
// use_container()

/** Serializable progress of one use_container() through its menus. */
interface LootData {
  box: EntityId;
  /** Time was used (ECMD_TIME) by something already done. */
  used: boolean;
  stage: 'what' | 'out' | 'in';
  /** After taking out ('b'), put in. */
  thenIn?: boolean;
}

/** Whether the hero carries anything other than the container itself. */
const inokay = (ctx: Ctx, box: Entity): boolean =>
  inventoryOf(ctx.state, ctx.state.playerId).some((o) => o.id !== box.id);

/** The cost of a finished use_container(): a move if anything was done. */
function finish(ctx: Ctx, data: LootData): number {
  const box = ctx.state.entities[String(data.box)];
  if (data.used && box) setCknown(ctx, box.id, true);
  encumberMsg(ctx);
  return data.used ? NORMAL_SPEED : 0;
}

/**
 * Opens a container that the hero carries (apply) or that lies at her feet (#loot).
 * ref: src/pickup.c use_container()
 */
export function useContainer(ctx: Ctx, box: Entity): number {
  if (!freehand(ctx)) {
    say(ctx, 'loot.no_free_hand'); // u_handsy()
    return 0;
  }
  const it = box.c.item;
  if (!it) return 0;
  setLknown(ctx, box.id, true);
  if (it.locked) {
    say(ctx, 'loot.is_locked', { box: xnameOf(ctx.state, ctx.defs, box) });
    if (held(ctx, box)) say(ctx, 'loot.put_down');
    return 0;
  }
  const data: LootData = { box: box.id, used: false, stage: 'what' };
  // cursed_mbag: sometimes toss objects
  const cursedMbag = isMbag(ctx, box) && it.buc === 'cursed' && hasContents(ctx, box);
  if (cursedMbag && bohLoss(ctx, box)) data.used = true;
  const outokay = hasContents(ctx, box);
  const inOk = inokay(ctx, box);
  const outmaybe = outokay || !objKnown(ctx.state, 'cknown', box.id);
  // nothing to take out, nothing to put in; trying to do both will yield proper feedback
  if (!inOk && !outmaybe) return chooseAction(ctx, data, 'b', cursedMbag);
  const options: PromptOption[] = [];
  if (outmaybe) options.push({ value: 'o', key: 'loot.menu.out', letter: 'o' });
  if (inOk) options.push({ value: 'i', key: 'loot.menu.in', letter: 'i' });
  if (outmaybe)
    options.push({ value: 'b', key: inOk ? 'loot.menu.both' : 'loot.menu.out_in', letter: 'b' });
  options.push({
    value: 'q',
    key: data.used ? 'loot.menu.done' : 'loot.menu.nothing',
    letter: 'q',
  });
  ctx.ask(
    {
      id: 'loot-what',
      kind: 'menu',
      key: outmaybe ? 'loot.do_what' : 'loot.empty_do_what',
      params: { box: ysimple(ctx, box, !outmaybe), cursed: cursedMbag ? 'now ' : '' },
      options,
      cancellable: true,
    },
    LOOT_ID,
    { ...data, cursedMbag } as unknown as Json,
  );
  return 0;
}

/** The menus after the "Do what?" choice. */
function chooseAction(ctx: Ctx, data: LootData, c: string, nowEmpty: boolean): number {
  const box = ctx.state.entities[String(data.box)];
  if (!box || c === 'q' || (c !== 'o' && c !== 'i' && c !== 'b')) return finish(ctx, data);
  const lootOut = c === 'o' || c === 'b';
  if (lootOut) {
    if (!hasContents(ctx, box)) {
      // "<whatever> is empty."
      say(ctx, nowEmpty ? 'loot.now_empty' : 'loot.is_empty', { box: ysimple(ctx, box, true) });
      if (!objKnown(ctx.state, 'cknown', box.id)) data.used = true;
      setCknown(ctx, box.id, true);
    } else {
      setCknown(ctx, box.id, true);
      return askOut(ctx, box, { ...data, stage: 'out', thenIn: c === 'b' });
    }
  }
  return afterOut(ctx, box, data, c === 'i' || c === 'b');
}

/** The put-in part, after any taking out. */
function afterOut(ctx: Ctx, box: Entity, data: LootData, lootIn: boolean): number {
  if (!lootIn) return finish(ctx, data);
  if (!inokay(ctx, box)) {
    const any = inventoryOf(ctx.state, ctx.state.playerId).length > 0;
    say(ctx, any ? 'loot.nothing_else_in' : 'loot.nothing_in');
    return finish(ctx, data);
  }
  ctx.ask(
    {
      id: 'loot-in',
      kind: 'menu',
      key: 'loot.put_in_what',
      options: inventoryOf(ctx.state, ctx.state.playerId).map((e) => invOption(ctx, e)),
      multi: true,
    },
    LOOT_ID,
    { ...data, stage: 'in' } as unknown as Json,
  );
  return 0;
}

/** "Take out what?" over the contents. ref: menu_loot(0, FALSE) */
function askOut(ctx: Ctx, box: Entity, data: LootData): number {
  const options: PromptOption[] = contents(ctx.state, box.id).map((e) => ({
    value: e.id,
    key: 'pickup.item',
    params: { item: ctx.defs.itemName(ctx.state, e) },
    glyph: shownId(ctx.state, e.def),
    ...((e.c.item?.quantity ?? 1) > 1 ? { max: e.c.item?.quantity ?? 1 } : {}),
  }));
  ctx.ask(
    { id: 'loot-out', kind: 'menu', key: 'loot.take_out_what', options, multi: true },
    LOOT_ID,
    data as unknown as Json,
  );
  return 0;
}

/** A multi menu answer: ids with optional counts (as itemactions' parseChosen). */
function chosen(value: unknown): { id: number; count?: number }[] {
  if (!Array.isArray(value)) return [];
  const out: { id: number; count?: number }[] = [];
  for (const v of value) {
    if (typeof v === 'number') out.push({ id: v });
    else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      const { value: id, count } = v as { value?: unknown; count?: unknown };
      if (typeof id !== 'number') continue;
      out.push(typeof count === 'number' && count >= 1 ? { id, count: Math.trunc(count) } : { id });
    }
  }
  return out;
}

function answerLoot(ctx: Ctx, value: Json, raw: Json): number {
  const data = raw as unknown as LootData & { cursedMbag?: boolean };
  const box = ctx.state.entities[String(data.box)];
  if (!box) return finish(ctx, data);
  switch (data.stage) {
    case 'what':
      return chooseAction(ctx, data, typeof value === 'string' ? value : 'q', !!data.cursedMbag);
    case 'out': {
      // ref: menu_loot(): each chosen object, split to the count asked
      const enc = { n: nearCapacity(ctx.state, ctx.defs, ctx.state.playerId) };
      for (const { id, count } of chosen(value)) {
        const o = ctx.state.entities[String(id)];
        if (!o?.c.item || o.c.item.containedIn !== box.id) continue;
        const res = outContainer(ctx, box, o, count ?? o.c.item.quantity, enc);
        if (res > 0) data.used = true;
        if (res < 0) break;
      }
      return afterOut(ctx, box, data, data.thenIn === true);
    }
    case 'in': {
      for (const { id, count } of chosen(value)) {
        let o = ctx.state.entities[String(id)];
        if (!o?.c.item || o.c.item.carriedBy !== ctx.state.playerId) continue;
        const q = o.c.item.quantity;
        let split = false;
        if (count !== undefined && count < q) {
          o = ctx.state.entities[String(splitStack(ctx, o.id, count))];
          if (!o) continue;
          split = true; // the split part is detached; in_container() takes it from there
        }
        const res = inContainer(ctx, box, o);
        if (res > 0) data.used = true;
        else if (split && res === 0 && ctx.state.entities[String(o.id)]) {
          // couldn't put selected item into container: merge it back (unsplitobj())
          addToInventory(ctx, ctx.state.playerId, o.id);
        }
        if (res < 0) {
          data.used = true;
          return finish(ctx, data);
        }
      }
      return finish(ctx, data);
    }
  }
  return finish(ctx, data);
}

// ---------------------------------------------------------------------------------------------
// #loot

/**
 * #loot one container at the hero's feet. ref: src/pickup.c doloot_core() with one container,
 * do_loot_cont()
 */
function doloot(ctx: Ctx, box: Entity): number {
  if (checkCapacity(ctx)) return 0; // "You can't do that while carrying so much stuff."
  if (heroHas(ctx.state, P.CONFUSION)) {
    // rn2(6) && reverse_loot(): not ported, it never applies
    ctx.rng.rn2(6);
    if (ctx.rng.rn2(2)) {
      say(ctx, 'loot.confused');
      return NORMAL_SPEED; // costs a turn
    }
  }
  if (!freehand(ctx)) {
    say(ctx, 'loot.no_free_hand_loot'); // able_to_loot()
    return 0;
  }
  const it = box.c.item;
  if (!it) return 0;
  if (it.locked) {
    say(ctx, objKnown(ctx.state, 'lknown', box.id) ? 'loot.is_locked' : 'loot.turns_out_locked', {
      box: xnameOf(ctx.state, ctx.defs, box),
    });
    setLknown(ctx, box.id, true);
    // flags.autounlock (default apply-key): offer to unlock it with a carried tool
    const tool = autokey(ctx, true);
    return tool ? autounlock(ctx, tool, box) : 0;
  }
  setLknown(ctx, box.id, true); // floor container, so no need for update_inventory()
  return useContainer(ctx, box);
}

const loot: ActionDef = {
  id: LOOT_ID,
  labelKey: 'action.nh:loot',
  handles: 'mod',
  offer(ctx, target): Offer[] {
    if (target.kind !== 'self') return [];
    return floorContainers(ctx).map((b) => ({
      action: { type: 'mod', action: LOOT_ID, args: { box: b.id } },
      labelKey: 'action.nh:loot',
      params: { box: ctx.defs.itemName(ctx.state, b) },
      priority: HERE,
    }));
  },
  perform(ctx, action) {
    if (action.type !== 'mod') return 0;
    const id = (action.args as { box?: unknown } | undefined)?.box;
    const box = typeof id === 'number' ? ctx.state.entities[String(id)] : undefined;
    if (!box || !isContainer(ctx.defs, box)) {
      say(ctx, 'loot.nothing_here');
      return 0;
    }
    if (held(ctx, box)) {
      // doapply() of a container: check_capacity, then use_container(held)
      if (checkCapacity(ctx)) return 0;
      return useContainer(ctx, box);
    }
    const p = hero(ctx).c.pos;
    const bp = box.c.pos;
    if (!p || !bp || bp.level !== p.level || bp.x !== p.x || bp.y !== p.y) {
      say(ctx, 'loot.nothing_here');
      return 0;
    }
    return doloot(ctx, box);
  },
  answer: answerLoot,
};

export const LOOT_ACTIONS: readonly ActionDef[] = [loot];
