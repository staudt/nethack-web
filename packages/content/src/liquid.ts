// Liquid terrain: which squares are water, lava or ice, and what the water there is called.
// ref: src/dbridge.c is_waterwall(), is_pool(), is_lava(), is_pool_or_lava(), is_ice(),
// is_moat(); src/pager.c waterbody_name()
//
// A leaf over the registry's terrain defs (`TerrainDef.liquid`), so any game module can import
// it. Raised drawbridges (m15 step 7) are water through their terrain's `liquid`; what lies under
// them (moat, lava, ice) is the drawbridge module's business.
// Not ported: the Juiblex swamp, Medusa's "shallow sea", the samurai's "pond", the Plane of
// Water's "limitless water" (none of those levels exist yet) and hallucinatory liquids
// (hliquid()).
import { cellIndex, inBounds, type Ctx, type DefId, type Level } from '@nh/core';
import { T, terrainIdAt } from './terrain';

type Defs = Pick<Ctx, 'defs'>;

const liquidAt = (
  ctx: Defs,
  level: Readonly<Level>,
  x: number,
  y: number,
): 'water' | 'lava' | null => {
  if (!inBounds(level, x, y)) return null;
  const id = level.palette[level.cells[cellIndex(level, x, y)] ?? -1];
  return id === undefined ? null : (ctx.defs.terrain(id).liquid ?? null);
};

/** ref: src/dbridge.c is_waterwall(): a wall of water (rm.h WATER) */
export const isWaterwall = (_ctx: Defs, level: Readonly<Level>, x: number, y: number): boolean =>
  inBounds(level, x, y) && terrainIdAt(level, x, y) === T.water;

/** ref: src/dbridge.c is_pool(): a pool, a moat, a wall of water or other water terrain */
export const isPool = (ctx: Defs, level: Readonly<Level>, x: number, y: number): boolean =>
  liquidAt(ctx, level, x, y) === 'water';

/** ref: src/dbridge.c is_lava(): a pool or wall of lava */
export const isLava = (ctx: Defs, level: Readonly<Level>, x: number, y: number): boolean =>
  liquidAt(ctx, level, x, y) === 'lava';

/** ref: src/dbridge.c is_pool_or_lava() */
export const isPoolOrLava = (ctx: Defs, level: Readonly<Level>, x: number, y: number): boolean =>
  liquidAt(ctx, level, x, y) !== null;

/** ref: src/dbridge.c is_moat() (no Juiblex level) */
export const isMoat = (_ctx: Defs, level: Readonly<Level>, x: number, y: number): boolean =>
  inBounds(level, x, y) && terrainIdAt(level, x, y) === T.moat;

/** ref: src/dbridge.c is_ice() */
export const isIce = (_ctx: Defs, level: Readonly<Level>, x: number, y: number): boolean =>
  inBounds(level, x, y) && terrainIdAt(level, x, y) === T.ice;

/** Whether terrain id `id` is a liquid of either kind. */
export const isLiquidId = (ctx: Defs, id: DefId | undefined): boolean =>
  id !== undefined && ctx.defs.terrain(id).liquid !== undefined;

/**
 * What the liquid at (x, y) is called, as a message key ("pool of water", "moat", "wall of
 * water", "molten lava", "wall of lava", "ice"; "water" for anything else). ref: src/pager.c
 * waterbody_name()
 */
export function waterbodyName(ctx: Defs, level: Readonly<Level>, x: number, y: number): string {
  const id = inBounds(level, x, y) ? terrainIdAt(level, x, y) : undefined;
  switch (id) {
    case T.lava:
      return 'liquid.name.lava';
    case T.ice:
      return 'liquid.name.ice';
    case T.pool:
      return 'liquid.name.pool';
    case T.moat:
      return 'liquid.name.moat';
    case T.water:
      return 'liquid.name.waterwall';
    case T.lavawall:
      return 'liquid.name.lavawall';
    default:
      return isPool(ctx, level, x, y) ? 'liquid.name.moat' : 'liquid.name.water';
  }
}
