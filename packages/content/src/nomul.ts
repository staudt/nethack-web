// Multi-turn helplessness. ref: src/hack.c nomul() with a negative count, unmul(), nomovemsg,
// afternmv
import { NORMAL_SPEED, getPlayer, type Ctx, type EntityId, type ModApi, type Msg } from '@nh/core';
import { nhData } from './items';

/**
 * What runs when the helplessness ends (C's `afternmv` function pointer), by key; modules
 * register theirs at load (`setAfternmv('stealarm', stealarm)` in steal.ts). Late-bound, as the
 * functions sit above this leaf.
 */
const AFTERNMV: Record<string, (ctx: Ctx) => void> = {};

/** Registers the function `nomul(..., after)` runs by `key` when the helplessness ends. */
export function setAfternmv(key: string, fn: (ctx: Ctx) => void): void {
  AFTERNMV[key] = fn;
}

/** The pending afternmv key, if any (ref: ga.afternmv). */
export const afternmv = (ctx: Pick<Ctx, 'state'>): string | null =>
  (ctx.state.modData['nh'] as { afternmv?: string } | undefined)?.afternmv ?? null;

/** Sets or clears the pending afternmv key (written only while set). */
export function setAfternmvKey(ctx: Pick<Ctx, 'state'>, key: string | null): void {
  const d = nhData(ctx);
  if (key === null) delete d.afternmv;
  else d.afternmv = key;
}

/**
 * Makes the hero helpless for `turns` more moves after the current action, and returns the
 * extra energy the caller must add to the action's cost (`turns * 12`), so monsters get their
 * turns while she is occupied. `reasonKey` says why (ref: multi_reason); `finish` is shown when
 * it ends (ref: nomovemsg); `after` names a function registered with `setAfternmv()` to run
 * then (ref: afternmv). The helpless component is cleared at the end of the last turn.
 * Example: `return NORMAL_SPEED + nomul(ctx, delay, 'helpless.dressing', finishMsg)`.
 */
export function nomul(
  ctx: Ctx,
  turns: number,
  reasonKey: string,
  finish: Msg | null = null,
  after?: string,
): number {
  if (turns <= 0) return 0;
  const hero = getPlayer(ctx.state);
  hero.c.helpless = { until: ctx.state.turn + 1 + turns, reasonKey };
  nhData(ctx).nomovemsg = finish;
  if (after !== undefined) setAfternmvKey(ctx, after);
  return turns * NORMAL_SPEED;
}

/**
 * Ends helplessness now, with the finishing message, then runs the pending afternmv function
 * (cleared before it is called). ref: src/hack.c unmul()
 */
export function unmulNow(ctx: Ctx): void {
  const hero = getPlayer(ctx.state);
  delete hero.c.helpless;
  const data = nhData(ctx);
  const msg = data.nomovemsg;
  data.nomovemsg = null;
  if (msg) ctx.emit({ type: 'msg', key: msg.key, ...(msg.params ? { params: msg.params } : {}) });
  const key = afternmv(ctx);
  if (key !== null) {
    setAfternmvKey(ctx, null);
    AFTERNMV[key]?.(ctx);
  }
}

/**
 * The theft of worn armor in progress (C's gs.stealoid, gs.stealmid): the item the hero is
 * taking off for a thief, and the thief. Kept in `modData.nh.stealoid` / `stealmid` while set.
 */
export function stealIds(ctx: Pick<Ctx, 'state'>): {
  oid: EntityId | null;
  mid: EntityId | null;
} {
  const d = ctx.state.modData['nh'] as { stealoid?: number; stealmid?: number } | undefined;
  return { oid: d?.stealoid ?? null, mid: d?.stealmid ?? null };
}

/** Sets (or, with nulls, clears) the theft in progress. */
export function setStealIds(
  ctx: Pick<Ctx, 'state'>,
  oid: EntityId | null,
  mid: EntityId | null,
): void {
  const d = nhData(ctx);
  if (oid === null) delete d.stealoid;
  else d.stealoid = oid;
  if (mid === null) delete d.stealmid;
  else d.stealmid = mid;
}

/**
 * The monster stealing from the hero has just died (or left): the armor she is taking off stays
 * with her ("You finish taking off your cloak." when done). ref: src/steal.c thiefdead()
 */
export function thiefdead(ctx: Pick<Ctx, 'state'>, id: EntityId): void {
  const d = ctx.state.modData['nh'] as { stealoid?: number; stealmid?: number } | undefined;
  if (d?.stealmid !== id) return;
  delete d.stealmid; // gs.stealmid = 0
  if (afternmv(ctx) === 'stealarm') {
    setAfternmvKey(ctx, 'unstolenarm');
    nhData(ctx).nomovemsg = null;
  }
}

/** Ends helplessness when its time is up, with the finishing message. ref: src/hack.c unmul() */
export function registerNomul(api: ModApi): void {
  api.on('endOfTurn', (ctx) => {
    const h = getPlayer(ctx.state).c.helpless;
    if (!h || ctx.state.turn < h.until) return;
    unmulNow(ctx);
  });
}
