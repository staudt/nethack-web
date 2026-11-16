// The burn state of lit objects: lamps, lanterns, candles, burning potions of oil and the magic
// lamp. A leaf (core and dilute.ts only), so items.ts can split and merge lit stacks, objnam.ts
// can name a partly used candle and mongear.ts can light a gnome's candle without light.ts.
// ref: src/timeout.c begin_burn(), end_burn(); src/light.c candle_light_range(),
// obj_split_light_source(), obj_merge_light_sources(); src/timeout.c obj_split_timers()
//
// The fuel is `ItemComponent.age` (obj->age: the fuel left once the current stretch has
// burnt) and the lit state `ItemComponent.lit` (obj->lamplit). A burning object has one
// `nh:burn_object` timer; NetHack stops that timer when the object is snuffed (stop_timer),
// which core timers cannot do, so the live timer is recorded in `modData.nh.burn[id] =
// { due, tok }` and a timer whose token does not match is ignored. The magic lamp burns
// without a timer (and so without a record). The light itself is derived from the lit objects
// each turn (light.ts objLights()), so a split or merged stack's radius follows its quantity.
import type { Ctx, DefId, Entity, EntityId, GameState } from '@nh/core';
import { POT_OIL, isDiluted } from './dilute';

export const BURN_TIMER: DefId = 'nh:burn_object';
export const MAGIC_LAMP: DefId = 'nh:magic_lamp';
export const OIL_LAMP: DefId = 'nh:oil_lamp';
export const BRASS_LANTERN: DefId = 'nh:brass_lantern';

/** ref: include/obj.h Is_candle() */
export const isCandle = (id: string): boolean =>
  id === 'nh:tallow_candle' || id === 'nh:wax_candle';

/** ref: include/vision.h MAX_RADIUS */
const MAX_RADIUS = 15;

/** The live burn timer of a lit object: the turn it fires and its token. */
export interface BurnRec {
  due: number;
  tok: number;
}

interface BurnData {
  burn?: Record<string, BurnRec>;
  burnTok?: number;
}

function burnData(state: Readonly<GameState>): BurnData | undefined {
  const d = state.modData['nh'] as unknown as BurnData | undefined;
  return typeof d === 'object' && d !== null ? d : undefined;
}

function burnDataW(ctx: Pick<Ctx, 'state'>): BurnData {
  const md = ctx.state.modData;
  let d = md['nh'] as unknown as BurnData | undefined;
  if (typeof d !== 'object' || d === null) {
    d = {};
    md['nh'] = d as unknown as (typeof md)[string];
  }
  return d;
}

/** The burn record of a lit object, if its timer is live. */
export function burnRec(state: Readonly<GameState>, id: EntityId): BurnRec | undefined {
  return burnData(state)?.burn?.[String(id)];
}

/** Sets (or with null deletes) a burn record; `modData.nh.burn` is absent while empty. */
export function setBurnRec(ctx: Pick<Ctx, 'state'>, id: EntityId, rec: BurnRec | null): void {
  const d = burnDataW(ctx);
  if (rec) (d.burn ??= {})[String(id)] = rec;
  else if (d.burn) {
    delete d.burn[String(id)];
    if (Object.keys(d.burn).length === 0) delete d.burn;
  }
}

/** Starts a burn timer of `turns` for the object and records it. */
function startBurnTimer(ctx: Pick<Ctx, 'state' | 'schedule'>, id: EntityId, turns: number): void {
  const d = burnDataW(ctx);
  const tok = (d.burnTok ?? 0) + 1;
  d.burnTok = tok;
  setBurnRec(ctx, id, { due: ctx.state.turn + turns, tok });
  ctx.schedule(turns, BURN_TIMER, { item: id, tok });
}

/**
 * Candlelight is proportional to the number of candles; minimum range is 2 rather than 1 for
 * playability: 1..3 candles range 2, 4..8 range 3, 9..15 range 4, &c. ref: src/light.c
 * candle_light_range()
 */
export function candleLightRange(quan: number): number {
  let radius = 1; // always incremented at least once
  while (radius * radius <= quan && radius < MAX_RADIUS) radius++;
  return radius;
}

/**
 * Starts a lit object burning: a timer to the next warning (lamps and lanterns 150, 100, 50,
 * 25 turns of fuel left, then 0; candles 75, 15, then 0; a potion of oil all its fuel, three
 * quarters of it when diluted) and the light; the magic lamp burns without a timer. Silent.
 * ref: src/timeout.c begin_burn() (no artifact lights, no candelabrum)
 */
export function beginBurn(
  ctx: Pick<Ctx, 'state' | 'schedule'>,
  obj: Entity,
  _alreadyLit = false,
): void {
  const it = obj.c.item;
  if (!it) return;
  const age = it.age ?? 0;
  if (age === 0 && obj.def !== MAGIC_LAMP) return;
  let turns: number;
  if (obj.def === MAGIC_LAMP) {
    it.lit = true; // do_timer = FALSE
    return;
  } else if (obj.def === POT_OIL) {
    turns = age;
    if (isDiluted(it)) turns = Math.trunc((3 * turns + 2) / 4);
  } else if (obj.def === OIL_LAMP || obj.def === BRASS_LANTERN) {
    // magic times are 150, 100, 50, 25, and 0
    if (age > 150) turns = age - 150;
    else if (age > 100) turns = age - 100;
    else if (age > 50) turns = age - 50;
    else if (age > 25) turns = age - 25;
    else turns = age;
  } else if (isCandle(obj.def)) {
    // magic times are 75, 15, and 0
    if (age > 75) turns = age - 75;
    else if (age > 15) turns = age - 15;
    else turns = age;
  } else return; // impossible("begin burn: unexpected %s")
  startBurnTimer(ctx, obj.id, turns);
  it.lit = true;
  it.age = age - turns;
}

/**
 * Puts the light out. With `timerAttached`, the unused fuel of the current stretch is given
 * back (cleanup_burn()). ref: src/timeout.c end_burn()
 */
export function endBurn(ctx: Pick<Ctx, 'state'>, obj: Entity, timerAttached: boolean): void {
  const it = obj.c.item;
  if (!it?.lit) return;
  const rec = burnRec(ctx.state, obj.id);
  if (rec) {
    // restore unused time (the magic lamp has no timer)
    if (timerAttached && obj.def !== MAGIC_LAMP)
      it.age = (it.age ?? 0) + Math.max(rec.due - ctx.state.turn, 0);
    setBurnRec(ctx, obj.id, null);
  }
  delete it.lit;
}

/**
 * A lit stack was split: the new part `to` burns too, with its own timer due on the same turn.
 * ref: src/light.c obj_split_light_source(), src/timeout.c obj_split_timers()
 */
export function splitBurn(
  ctx: Pick<Ctx, 'state' | 'schedule'>,
  from: EntityId,
  to: EntityId,
): void {
  const child = ctx.state.entities[String(to)]?.c.item;
  if (!child?.lit) return;
  const rec = burnRec(ctx.state, from);
  if (!rec) return; // the magic lamp (never a stack) or a stopped timer
  startBurnTimer(ctx, to, Math.max(rec.due - ctx.state.turn, 1));
}

/**
 * The lit stack `from` was merged into the lit stack `into`: its light and its timer are gone,
 * the target keeps its own (C does not merge the timeouts). ref: src/light.c
 * obj_merge_light_sources(), src/invent.c merged()
 */
export function mergeBurn(ctx: Pick<Ctx, 'state'>, from: EntityId): void {
  setBurnRec(ctx, from, null);
}
