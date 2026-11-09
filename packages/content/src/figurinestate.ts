// Figurines' state: the transform timer of a cursed carried figurine. A leaf (core and
// eggstate.ts only), so items.ts (addinv/freeinv), the BUC changes (curse(), uncurse(), bless())
// and figurine.ts can all reach it.
// ref: src/timeout.c attach_fig_transform_timeout(); src/invent.c carry_obj_effects(),
// freeinv_core(); src/mkobj.c curse(), uncurse(), bless(), set_corpsenm() FIGURINE
import type { Ctx, DefId, EntityId, GameState } from '@nh/core';
import { deadSpecies } from './eggstate';

export const FIGURINE: DefId = 'nh:figurine';

/** The transform timer's kind; its data is `{ id }` (the figurine). ref: FIG_TRANSFORM */
export const FIG_TRANSFORM: DefId = 'nh:fig_transform';

const timerOf = (t: { kind: DefId; data: unknown }, id: EntityId): boolean =>
  t.kind === FIG_TRANSFORM && (t.data as { id?: unknown } | null)?.id === id;

/** The figurine's transform turn, or null without a timer (obj->timed for a figurine). */
export function figTransformAt(state: Readonly<GameState>, id: EntityId): number | null {
  const t = state.timers.find((x) => timerOf(x, id));
  return t ? t.at : null;
}

/** ref: stop_timer(FIG_TRANSFORM, obj) */
export function stopFigTransform(ctx: Pick<Ctx, 'state'>, id: EntityId): void {
  if (figTransformAt(ctx.state, id) === null) return;
  ctx.state.timers = ctx.state.timers.filter((t) => !timerOf(t, id));
}

/**
 * The figurine will transform in `rnd(9000) + 200` turns (a running timer is replaced).
 * ref: src/timeout.c attach_fig_transform_timeout()
 */
export function attachFigTransformTimeout(
  ctx: Pick<Ctx, 'state' | 'rng' | 'schedule'>,
  id: EntityId,
): void {
  // stop previous timer, if any
  stopFigTransform(ctx, id);
  ctx.schedule(ctx.rng.rnd(9000) + 200, FIG_TRANSFORM, { id });
}

/** A figurine of a live species: `corpsenm != NON_PM && !dead_species(corpsenm, TRUE)`. */
function liveFigurine(ctx: Pick<Ctx, 'state' | 'defs'>, id: EntityId): boolean {
  const e = ctx.state.entities[String(id)];
  return e?.def === FIGURINE && !deadSpecies(ctx.state, ctx.defs, e.c.item?.corpseOf, true);
}

/**
 * Cursed figurines can spontaneously transform when carried: called after the item joined the
 * hero's or a monster's inventory. ref: src/invent.c carry_obj_effects() (addinv(), mpickobj())
 */
export function carryObjEffects(
  ctx: Pick<Ctx, 'state' | 'rng' | 'schedule' | 'defs'>,
  id: EntityId,
): void {
  const it = ctx.state.entities[String(id)]?.c.item;
  if (it?.buc === 'cursed' && liveFigurine(ctx, id)) attachFigTransformTimeout(ctx, id);
}

/**
 * The figurine side of a BUC change, called after it: curse() starts (or restarts) the timer of
 * a carried figurine of a live species; uncurse() and bless() stop it.
 * ref: src/mkobj.c curse(), uncurse(), bless()
 */
export function figBucChanged(
  ctx: Pick<Ctx, 'state' | 'rng' | 'schedule' | 'defs'>,
  id: EntityId,
): void {
  const it = ctx.state.entities[String(id)]?.c.item;
  if (!it || ctx.state.entities[String(id)]?.def !== FIGURINE) return;
  if (it.buc !== 'cursed') stopFigTransform(ctx, id);
  else if (it.carriedBy !== null && liveFigurine(ctx, id)) attachFigTransformTimeout(ctx, id);
}
