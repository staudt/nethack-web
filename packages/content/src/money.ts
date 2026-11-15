// Gold carried by the hero and by monsters, and moving it between them.
// ref: src/invent.c money_cnt(); src/shk.c money2mon(), money2u(); src/minion.c bribe()
import { inventoryOf, type Ctx, type EntityId, type Json } from '@nh/core';
import { addToInventory, removeFromInventory, splitStack } from './items';
import { monNam } from './perception';

/** The gold `id` carries. ref: src/invent.c money_cnt() */
export function moneyCnt(ctx: Pick<Ctx, 'state' | 'defs'>, id: EntityId): number {
  let n = 0;
  for (const o of inventoryOf(ctx.state, id))
    if (ctx.defs.object(o.def).class === 'coin') n += o.c.item?.quantity ?? 0;
  return n;
}

/** Moves `amount` gold (no more than `from` has) to `to`'s inventory. */
function moneyTransfer(ctx: Ctx, from: EntityId, to: EntityId, amount: number): void {
  for (const o of inventoryOf(ctx.state, from)) {
    if (amount <= 0) return;
    const q = o.c.item?.quantity ?? 0;
    if (ctx.defs.object(o.def).class !== 'coin' || q <= 0) continue;
    const moved = q <= amount ? o.id : splitStack(ctx, o.id, amount);
    if (moved === o.id) removeFromInventory(ctx, o.id);
    addToInventory(ctx, to, moved);
    amount -= Math.min(q, amount);
  }
}

/** The hero gives `amount` of her gold to monster `mon`. ref: src/shk.c money2mon() */
export function money2mon(ctx: Ctx, mon: EntityId, amount: number): void {
  moneyTransfer(ctx, ctx.state.playerId, mon, amount);
}

/** Monster `mon` gives `amount` of his gold to the hero. ref: src/shk.c money2u() */
export function money2u(ctx: Ctx, mon: EntityId, amount: number): void {
  moneyTransfer(ctx, mon, ctx.state.playerId, amount);
}

/** The amount a getlin() answer offers, as sscanf("%ld"): 0 when it is not a number. */
function parseOffer(answer: Json): number {
  if (typeof answer !== 'string') return 0;
  const m = /^\s*([+-]?\d+)/.exec(answer);
  return m?.[1] ? Number.parseInt(m[1], 10) : 0;
}

/**
 * The hero hands monster `mon` the gold she answered with (a getlin() answer): a negative amount
 * "fumbles", none refuses, more than she has is all her gold. Returns the amount given.
 * ref: src/minion.c bribe() after getlin()
 */
export function bribe(ctx: Ctx, mon: EntityId, answer: Json): number {
  const m = ctx.state.entities[String(mon)];
  const name = m ? monNam(ctx, m) : '@pronoun.it';
  const say = (key: string, params?: Record<string, string | number>): void =>
    ctx.emit(params ? { type: 'msg', key, params } : { type: 'msg', key });
  let offer = parseOffer(answer);
  const umoney = moneyCnt(ctx, ctx.state.playerId);
  if (offer < 0) {
    say('bribe.shortchange', { mon: name });
    return 0;
  } else if (offer === 0) {
    say('bribe.refuse');
    return 0;
  } else if (offer >= umoney) {
    say('bribe.all', { mon: name });
    offer = umoney;
  } else say(offer === 1 ? 'bribe.give_one' : 'bribe.give', { mon: name, n: offer });
  money2mon(ctx, mon, offer);
  return offer;
}
