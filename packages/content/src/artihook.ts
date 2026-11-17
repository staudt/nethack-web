// The artifact special hit (artihit.ts artifactHit()) late-bound for the attack code below it:
// artihit.ts reaches zap.ts, potion.ts and the actions, which reach combat.ts and dothrow.ts, so
// those call it through here (set at artihit.ts's load). A leaf (core only).
import type { Ctx, Entity, EntityId } from '@nh/core';

/** The attack's damage, changed in place (C's `int *dmgptr`). */
export interface Dmg {
  n: number;
}

/** What artifact_hit() needs to know besides who hits whom. */
export interface ArtiHitOpts {
  /** C's gn.notonhead: the blow landed on a long worm's tail. */
  notonhead?: boolean;
}

export type ArtifactHitFn = (
  ctx: Ctx,
  magr: EntityId | null,
  mdef: EntityId,
  obj: Entity,
  dmg: Dmg,
  dieroll: number,
  opts?: ArtiHitOpts,
) => boolean;

let artifactHitFn: ArtifactHitFn | null = null;

/** artihit.ts hands its artifactHit() down at load. */
export function setArtifactHit(fn: ArtifactHitFn): void {
  artifactHitFn = fn;
}

/** artifact_hit() (artihit.ts); false (no message) before it is registered. */
export const artifactHitHook: ArtifactHitFn = (ctx, magr, mdef, obj, dmg, dieroll, opts) =>
  artifactHitFn?.(ctx, magr, mdef, obj, dmg, dieroll, opts) ?? false;
