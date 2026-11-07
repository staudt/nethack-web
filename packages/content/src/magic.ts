// Shared helpers for quaffing, reading and throwing: using up objects and the "strange feeling" fallback.
// ref: src/invent.c useup(), src/shk.c obfree(), src/potion.c strange_feeling(),
// src/hack.c check_capacity()
import type { Ctx, Entity, EntityId, Params } from '@nh/core';
import { getPlayer } from '@nh/core';
import { encumberMsg } from './itemactions';
import { removeFromInventory } from './items';
import { billUsedUp } from './shk';
import { nearCapacity } from './stats';
import { urexp } from './urexp';

export const heroEntity = (ctx: Pick<Ctx, 'state'>): Entity => getPlayer(ctx.state);

/** ref: include/hack.h EXT_ENCUMBER (Overtaxed) in near_capacity() terms */
const EXT_ENCUMBER = 4;

/**
 * ref: src/hack.c check_capacity(): "You can't do that while carrying so much stuff.", or the
 * message `key` given.
 */
export function checkCapacity(ctx: Ctx, key = 'magic.cant_do_that'): boolean {
  if (nearCapacity(ctx.state, ctx.defs, ctx.state.playerId) >= EXT_ENCUMBER) {
    ctx.emit({ type: 'msg', key });
    return true;
  }
  return false;
}

/**
 * Uses up one object of the stack, or the whole item when it is the last. ref: src/invent.c
 * useup(), useupall(). The item must be in the hero's inventory.
 */
export function useup(ctx: Ctx, id: EntityId): void {
  const e = ctx.state.entities[String(id)];
  const it = e?.c.item;
  if (!e || !it) return;
  if (it.quantity > 1) {
    it.quantity--; // an unpaid stack keeps its billed quantity: the difference is used up
  } else {
    removeFromInventory(ctx, id);
    billUsedUp(ctx, e); // obfree(): an unpaid object stays on the bill, used up
    ctx.remove(id);
  }
  encumberMsg(ctx);
}

/** Uses up the whole stack. ref: src/invent.c useupall() */
export function useupall(ctx: Ctx, id: EntityId): void {
  removeFromInventory(ctx, id);
  const e = ctx.state.entities[String(id)];
  if (e) billUsedUp(ctx, e);
  ctx.remove(id);
  encumberMsg(ctx);
}

/**
 * ref: include/flag.h flags.beginner: true until the score `u.urexp` reaches 2000 (src/exper.c
 * more_experienced(); the score only grows, so the flag never comes back).
 */
export function isBeginner(ctx: Pick<Ctx, 'state'>): boolean {
  return urexp(ctx.state) < 2000;
}

/**
 * "You have a strange feeling for a moment, then it passes." for beginners, else the specific
 * message; then the object is used up. ref: src/potion.c strange_feeling() (without the
 * trycall: naming unknown types is not implemented).
 */
export function strangeFeeling(
  ctx: Ctx,
  item: EntityId | null,
  key: string | null,
  params?: Params,
): void {
  if (isBeginner(ctx) || key === null) ctx.emit({ type: 'msg', key: 'magic.strange_feeling' });
  else ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });
  if (item !== null) useup(ctx, item);
}

export { color, hcolor, type ColorName } from './hcolor';
