// flooreffects() (flooreffects.ts) for the modules below it that drop objects: the hero's drops
// (itemactions.ts) and a monster's (mongear.ts relobj()). A leaf; flooreffects.ts binds it at
// load. ref: src/do.c flooreffects()
import type { Ctx, Entity } from '@nh/core';

type FloorFx = (ctx: Ctx, obj: Entity, x: number, y: number, verb: 'drop' | 'fall') => boolean;
let fx: FloorFx | null = null;

export function setFloorEffects(fn: FloorFx): void {
  fx = fn;
}

/** flooreffects(): true when the free object `obj` landing at (x, y) is gone. */
export const floorEffectsLate = (
  ctx: Ctx,
  obj: Entity,
  x: number,
  y: number,
  verb: 'drop' | 'fall',
): boolean => fx?.(ctx, obj, x, y, verb) ?? false;

type Vapors = (ctx: Ctx, obj: Entity, x: number, y: number) => void;
let vapors: Vapors | null = null;

/** potionhit.ts hands down its breakPotionVapors() for flooreffects()'s hot ground. */
export function setPotionVapors(fn: Vapors): void {
  vapors = fn;
}

/** A potion breaking at (x, y): its vapors when next to the hero. ref: src/dothrow.c breakobj() */
export const potionVaporsLate = (ctx: Ctx, obj: Entity, x: number, y: number): void =>
  vapors?.(ctx, obj, x, y);
