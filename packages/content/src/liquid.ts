// Liquid terrain: which squares are water, lava or ice, and what the water there is called.
// ref: src/dbridge.c is_waterwall(), is_pool(), is_lava(), is_pool_or_lava(), is_ice(),
// is_moat(); src/pager.c waterbody_name()
//
// A leaf over the registry's terrain defs (`TerrainDef.liquid`), so any game module can import
// it. A raised drawbridge's span is its own terrain for each thing that can lie under it
// (terrain.ts): over the moat it is water and a moat, over lava lava, over ice ice.
// Not ported: the Juiblex swamp, Medusa's "shallow sea", the samurai's "pond", the Plane of
// Water's "limitless water" (none of those levels exist yet) and hallucinatory liquids
// (hliquid()).
import {
  cellIndex,
  inBounds,
  type Ctx,
  type DefId,
  type Entity,
  type Level,
  type MonsterDef,
  type Rng,
} from '@nh/core';
import { isUndetected } from './hidestate';
import { isClinger, isEel, isFlyer, isFloater, isSwimmer, likesLava } from './mondata';
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

/** ref: src/dbridge.c is_moat() (no Juiblex level): a moat, or one under a raised drawbridge */
export const isMoat = (_ctx: Defs, level: Readonly<Level>, x: number, y: number): boolean => {
  const id = inBounds(level, x, y) ? terrainIdAt(level, x, y) : undefined;
  return id === T.moat || id === T.drawbridge_up;
};

/** ref: src/dbridge.c is_ice(): ice, or ice under a raised drawbridge */
export const isIce = (_ctx: Defs, level: Readonly<Level>, x: number, y: number): boolean => {
  const id = inBounds(level, x, y) ? terrainIdAt(level, x, y) : undefined;
  return id === T.ice || id === T.drawbridge_up_ice;
};

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
  // a raised drawbridge: what lies under it (`ltyp = db_under_typ(drawbridgemask)`)
  switch (id) {
    case T.drawbridge_up_lava:
    case T.lava:
      return 'liquid.name.lava';
    case T.drawbridge_up_ice:
    case T.ice:
      return 'liquid.name.ice';
    case T.pool:
      return 'liquid.name.pool';
    case T.drawbridge_up:
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

/**
 * The monster is above the ground: it flies, floats, or clings hidden to the ceiling (every
 * level here has one). ref: src/mon.c m_in_air()
 */
export function mInAir(ctx: Pick<Ctx, 'state' | 'defs'>, mon: Entity): boolean {
  const def = ctx.defs.monster(mon.def);
  return isFlyer(def) || isFloater(def) || (isClinger(def) && isUndetected(ctx, mon.id));
}

/**
 * goodpos()'s water and lava rules for a creature of `def` (not the hero) at (x, y): in water
 * only a swimmer, or one in the air above it (not in a wall of water); an eel out of water is
 * refused 12 times in 13 (`rn2(13)`, drawn only then); over lava one in the air or that likes
 * lava, never a floating eye. `inAir` is m_in_air() (a monster being made: flyer or floater).
 * `ignoreWater`/`ignoreLava` are MM_IGNOREWATER/MM_IGNORELAVA. Returns false when refused, true
 * when the square's other tests still apply. ref: src/teleport.c goodpos()
 */
export function monLiquidOk(
  ctx: Pick<Ctx, 'defs'> & { rng: Pick<Rng, 'rn2'> },
  level: Readonly<Level>,
  x: number,
  y: number,
  def: MonsterDef,
  inAir: boolean,
  ignoreWater = false,
  ignoreLava = false,
): boolean {
  if (isPool(ctx, level, x, y) && !ignoreWater)
    return isSwimmer(def) || (!isWaterwall(ctx, level, x, y) && inAir);
  if (isEel(def) && !ignoreWater && ctx.rng.rn2(13)) return false;
  if (isLava(ctx, level, x, y) && !ignoreLava) {
    // 3.6.3: floating eye can levitate over lava but it avoids that due the effect of the heat
    // causing it to dry out
    if (def.id === 'nh:floating_eye') return false;
    return inAir || likesLava(def);
  }
  return true;
}
