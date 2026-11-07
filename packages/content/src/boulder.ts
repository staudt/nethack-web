// The boulder object and the questions everyone asks about it. A leaf module (core and the
// sokoban.ts leaf only), so monster movement, travel, zapping and reading can all import it.
import {
  cellIndex,
  itemsAt,
  sightBlockers,
  sortedIds,
  topObjects,
  type Ctx,
  type DefId,
  type Entity,
  type Level,
  type LevelId,
} from '@nh/core';
import { isSokoban, sokobanGuilt } from './sokoban';

/** ref: include/objects.h BOULDER */
export const BOULDER: DefId = 'nh:boulder';

/**
 * The boulder on top of the pile at (x, y), or null. ref: src/invent.c sobj_at(BOULDER, x, y)
 * (boulders lie on top of their pile, so the first one found is the top one)
 */
export function boulderAt(
  ctx: Pick<Ctx, 'state' | 'defs'>,
  level: LevelId,
  x: number,
  y: number,
): Entity | null {
  return itemsAt(ctx.defs, ctx.state, level, x, y).find((e) => e.def === BOULDER) ?? null;
}

/** Cell indices of the floor boulders on `level`. */
export function boulderCells(ctx: Pick<Ctx, 'state'>, level: Level): Set<number> {
  const out = new Set<number>();
  for (const id of sortedIds(ctx.state)) {
    const e = ctx.state.entities[String(id)];
    const p = e?.c.pos;
    if (e?.def === BOULDER && e.c.item && p?.level === level.id)
      out.add(cellIndex(level, p.x, p.y));
  }
  return out;
}

/**
 * The cells of `level` that block sight because of an object on them (boulders), for
 * `clearPath()` and `computeVisible()`. ref: src/vision.c does_block()
 */
export const blockersOf = (ctx: Pick<Ctx, 'state' | 'defs'>, level: LevelId): Set<number> =>
  sightBlockers(ctx.defs, ctx.state, level);

/**
 * A boulder that counts as rock for tight diagonal squeezes: only on a level with Sokoban's
 * rules. ref: src/hack.c bad_rock() `Sokoban && sobj_at(BOULDER, x, y)`
 */
export const sokobanBoulder = (
  ctx: Pick<Ctx, 'state' | 'defs'>,
  level: Level,
  x: number,
  y: number,
): boolean => isSokoban(level) && boulderAt(ctx, level.id, x, y) !== null;

/** Whether the hero remembers a boulder at (x, y) (the object glyph shown there). */
export function rememberedBoulder(
  ctx: Pick<Ctx, 'state'>,
  level: Level,
  x: number,
  y: number,
): boolean {
  return ctx.state.objectMemory[level.id]?.[String(cellIndex(level, x, y))] === BOULDER;
}

/**
 * The hero learns what lies on top at (x, y) without seeing it. ref: src/display.c
 * feel_location() / map_object() for the object part (the terrain is remembered already)
 */
export function feelObjects(
  ctx: Pick<Ctx, 'state' | 'defs'>,
  level: Level,
  x: number,
  y: number,
): void {
  const i = cellIndex(level, x, y);
  const mem = (ctx.state.objectMemory[level.id] ??= {});
  const top = topObjects(ctx.defs, ctx.state, level).get(i);
  if (top === undefined) delete mem[String(i)];
  else mem[String(i)] = top;
}

/** ref: include/objects.h ROCK */
export const ROCK: DefId = 'nh:rock';

/**
 * A boulder (or, later, a statue) becomes 7..66 rocks where it lies, back on top of its pile; no
 * messages (the caller says what was seen or heard). Sight through the square is recomputed with
 * the rest of the view at the end of the step. The hero breaking a boulder (`byYou`) is cheating
 * in Sokoban. Shop billing (breakobj() in a costly spot) is not ported.
 * ref: src/zap.c fracture_rock()
 */
export function fractureRock(ctx: Pick<Ctx, 'state' | 'rng'>, obj: Entity, byYou: boolean): void {
  const it = obj.c.item;
  if (!it) return;
  if (byYou && obj.def === BOULDER) sokobanGuilt(ctx);
  obj.def = ROCK;
  it.quantity = ctx.rng.rn2(60) + 7; // rn1(60, 7)
  // dknown = bknown = rknown = 0 (`known` is not modelled for objects without it)
  it.known = { buc: false, spe: false };
  // obj_extract_self() + place_object(): back on top of the pile
  if (obj.c.pos) it.placed = ctx.state.seq++;
}
