// The boulder object and the questions everyone asks about it. A leaf module (core and items
// only), so monster movement, travel, zapping and reading can all import it.
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
