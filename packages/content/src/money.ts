// Gold carried by the hero and by monsters, and moving it between them.
// ref: src/invent.c money_cnt(); src/shk.c money2mon(), money2u()
import { inventoryOf, type Ctx, type EntityId } from '@nh/core';
import { addToInventory, removeFromInventory, splitStack } from './items';

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
