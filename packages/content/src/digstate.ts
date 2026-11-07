// The dig in progress with a pick-axe or mattock (context.digging), shared by digging and the
// Watch, which stops a hero digging through town walls. A leaf module: watch.ts reads it, dig.ts
// (which imports watch.ts) writes it.
// ref: include/context.h struct dig_info; src/dig.c is_digging(); src/allmain.c stop_occupation()
import type { Ctx, DefId } from '@nh/core';

/** The occupation's mod action (C's `set_occupation(dig, "digging", 0)`). */
export const DIG_ID: DefId = 'nh:dig';

/**
 * context.digging: where she digs (a level id and a square; `level` empty once the dig is done,
 * C's `digging.level.dlevel = -1`), whether down, the effort so far, whether the Watch warned her
 * (`warned`), `quiet` (no message on success), the turn of the last finished dig, and C's
 * `did_dig_msg` ("You hit the rock with all your might." once per attempt). `chew` is always
 * false (the hero never eats through walls), so it is not kept.
 */
export interface Digging {
  level: string;
  x: number;
  y: number;
  down: boolean;
  effort: number;
  warned: boolean;
  quiet: boolean;
  lastdigtime: number;
  didmsg: boolean;
}

interface DigData {
  digging?: Digging;
}

function nh(ctx: Pick<Ctx, 'state'>): DigData {
  const md = ctx.state.modData;
  let d = md['nh'] as unknown as DigData | undefined;
  if (typeof d !== 'object' || d === null) {
    d = {};
    md['nh'] = d as unknown as (typeof md)[string];
  }
  return d;
}

/** The dig context, or null when there has never been one (or it was reset). */
export const diggingOf = (ctx: Pick<Ctx, 'state'>): Digging | null =>
  (ctx.state.modData['nh'] as unknown as DigData | undefined)?.digging ?? null;

/** Replaces the dig context; null clears it (C's `memset(&context.digging, 0, ...)`). */
export function setDigging(ctx: Pick<Ctx, 'state'>, d: Digging | null): void {
  if (d) nh(ctx).digging = d;
  else if (diggingOf(ctx)) delete nh(ctx).digging;
}

/** Whether digging is the hero's occupation. ref: src/dig.c is_digging() */
export function isDigging(ctx: Pick<Ctx, 'state'>): boolean {
  const occ = ctx.state.occupation?.action;
  return occ?.type === 'mod' && occ.action === DIG_ID && occ.args === undefined;
}

/** "You stop digging." and the occupation ends. ref: src/allmain.c stop_occupation() */
export function stopDigging(ctx: Ctx): void {
  if (!isDigging(ctx)) return;
  ctx.emit({ type: 'msg', key: 'dig.stop' });
  ctx.interrupt();
}
