// Ice made by cold: what it was (a pool or a moat: C's `rm.icedpool`) and the timer that melts
// it. ref: src/zap.c start_melt_ice_timeout(); src/timeout.c spot_time_left(),
// spot_stop_timers() (MELT_ICE_AWAY)
//
// A leaf: the trap and digging code stop the timer when a pit replaces the ice, the zap code
// starts it, and ice.ts (melt_ice()) fires it. `modData.nh.icedpool[levelId][cellIndex]` is
// 'pool' or 'moat' (ICED_POOL / ICED_MOAT), written only while some ice remembers its water.
// Timers are global here (core `state.timers`): the melt timer carries its level and fires
// wherever the hero is (C keeps level timers with their level and runs the elapsed ones on
// arrival).
import { cellIndex, type Ctx, type Json, type Level, type Timer } from '@nh/core';

/** The melt timer's kind. ref: include/timeout.h MELT_ICE_AWAY */
export const MELT_ICE_AWAY = 'nh:melt_ice_away';

/** What a frozen square was: C's ICED_POOL / ICED_MOAT. */
export type IcedPool = 'pool' | 'moat';

type IceTable = Record<string, Record<string, IcedPool>>;

const table = (ctx: Pick<Ctx, 'state'>, create: boolean): IceTable | null => {
  const nh = ctx.state.modData['nh'] as Record<string, Json> | undefined;
  if (!nh) {
    if (!create) return null;
    ctx.state.modData['nh'] = {};
  }
  const root = ctx.state.modData['nh'] as Record<string, Json>;
  const t = root['icedpool'];
  if (t && typeof t === 'object' && !Array.isArray(t)) return t as unknown as IceTable;
  if (!create) return null;
  const fresh: IceTable = {};
  root['icedpool'] = fresh as unknown as Json;
  return fresh;
};

/** The water under the ice at (x, y), or null (ice that was never water: a moat). */
export function icedpool(
  ctx: Pick<Ctx, 'state'>,
  level: Level,
  x: number,
  y: number,
): IcedPool | null {
  return table(ctx, false)?.[level.id]?.[String(cellIndex(level, x, y))] ?? null;
}

/** Remembers (or with null forgets) what froze at (x, y). ref: `lev->icedpool = ...` */
export function setIcedpool(
  ctx: Pick<Ctx, 'state'>,
  level: Level,
  x: number,
  y: number,
  v: IcedPool | null,
): void {
  const key = String(cellIndex(level, x, y));
  if (v) {
    const t = table(ctx, true) as IceTable;
    (t[level.id] ??= {})[key] = v;
    return;
  }
  const t = table(ctx, false);
  const lv = t?.[level.id];
  if (!t || !lv || !(key in lv)) return;
  delete lv[key];
  if (Object.keys(lv).length === 0) delete t[level.id];
  if (Object.keys(t).length === 0)
    delete (ctx.state.modData['nh'] as Record<string, Json>)['icedpool'];
}

interface MeltData {
  level: string;
  x: number;
  y: number;
}

const isMelt = (t: Timer, levelId: string, x: number, y: number): boolean => {
  if (t.kind !== MELT_ICE_AWAY) return false;
  const d = t.data as unknown as MeltData | null;
  return d?.level === levelId && d.x === x && d.y === y;
};

/** Turns until the ice at (x, y) melts, 0 without a timer. ref: src/timeout.c spot_time_left() */
export function meltTimeLeft(
  ctx: Pick<Ctx, 'state'>,
  levelId: string,
  x: number,
  y: number,
): number {
  const t = ctx.state.timers.find((o) => isMelt(o, levelId, x, y));
  return t ? Math.max(0, t.at - ctx.state.turn) : 0;
}

/** Stops the ice's melt timer. ref: src/timeout.c spot_stop_timers(x, y, MELT_ICE_AWAY) */
export function stopMeltTimer(
  ctx: Pick<Ctx, 'state'>,
  levelId: string,
  x: number,
  y: number,
): void {
  if (!ctx.state.timers.some((o) => isMelt(o, levelId, x, y))) return;
  ctx.state.timers = ctx.state.timers.filter((o) => !isMelt(o, levelId, x, y));
}

const MIN_ICE_TIME = 50;
const MAX_ICE_TIME = 2000;

/**
 * Usually starts a melt timer; sometimes the ice becomes permanent instead. `minTime` is the old
 * timeout of ice being firmed up. ref: src/zap.c start_melt_ice_timeout()
 */
export function startMeltIceTimeout(
  ctx: Pick<Ctx, 'rng' | 'schedule'>,
  levelId: string,
  x: number,
  y: number,
  minTime = 0,
): void {
  let when = Math.max(minTime, MIN_ICE_TIME - 1);
  // random timeout; surrounding ice locations ought to be a factor...
  while (++when <= MAX_ICE_TIME) if (!ctx.rng.rn2(MAX_ICE_TIME - when + MIN_ICE_TIME)) break;
  // if we're within MAX_ICE_TIME, install a melt timer; otherwise, omit it to leave this ice
  // permanent
  if (when <= MAX_ICE_TIME) ctx.schedule(when, MELT_ICE_AWAY, { level: levelId, x, y });
}
