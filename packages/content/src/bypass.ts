// Objects the current zap (or breaking wand) must not hit again: a corpse left by an undead the
// same zap destroyed, the gear a polymorphed monster dropped. A leaf module: zap.ts reads it,
// newcham.ts and were.ts write it. It is never part of the game state: it lives for one zap.
// ref: src/worn.c bypass_obj(), clear_bypasses(); context.bypasses, obj->bypass
import type { EntityId } from '@nh/core';

const bypassed = new Set<EntityId>();

/** ref: src/worn.c bypass_obj() */
export function bypassObj(id: EntityId): void {
  bypassed.add(id);
}

/** Whether the object is bypassed by the current zap (obj->bypass). */
export const isBypassed = (id: EntityId): boolean => bypassed.has(id);

/** A new zap (or a wand breaking) starts: nothing is bypassed. ref: clear_bypasses() */
export function clearBypasses(): void {
  bypassed.clear();
}
