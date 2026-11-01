// The alternate weapon (uswapwep). ref: src/wield.c setuswapwep(), doswapweapon()
//
// Core's `EquipSlot` has no alternate slot, so the item's id lives in `modData.nh.uswapwep`
// (JSON, saved). Leaving the inventory clears it (items.ts removeFromInventory(); ref:
// src/do.c dropx()), and a stale id (the item was used up) simply never matches a carried item.
import type { Entity, EntityId, GameState } from '@nh/core';
import { nhData, type ItemCtx } from './items';

/** Whether `item` is the hero's alternate weapon (doname's W_SWAPWEP). Read-only. */
export function isSwapWep(state: Readonly<GameState>, item: Entity): boolean {
  const md = state.modData['nh'] as unknown as { uswapwep?: number | null } | undefined;
  return (
    md?.uswapwep === item.id &&
    item.c.item !== undefined &&
    item.c.item.carriedBy === state.playerId
  );
}

/** The hero's alternate weapon, or null. */
export function swapWep(ctx: Pick<ItemCtx, 'state'>): Entity | null {
  const id = nhData(ctx).uswapwep;
  if (id === undefined || id === null) return null;
  const e = ctx.state.entities[String(id)];
  return e?.c.item?.carriedBy === ctx.state.playerId ? e : null;
}

/** ref: src/wield.c setuswapwep() */
export function setSwapWep(ctx: Pick<ItemCtx, 'state'>, id: EntityId | null): void {
  nhData(ctx).uswapwep = id;
}
