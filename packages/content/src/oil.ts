// Potions of oil as fire: lit by applying them (a dim light), and exploding in flames when a
// burning one breaks. Above light.ts and explode.ts (explode.ts lights items through light.ts,
// so the explosion cannot live in light.ts).
// ref: src/apply.c light_cocktail(); src/explode.c explode_oil(), splatter_burning_oil()
import { getPlayer, type Ctx, type Entity } from '@nh/core';
import { POT_OIL, isDiluted } from './dilute';
import { uswallow } from './engulfstate';
import { costlySpot } from './eshk';
import { explode } from './explode';
import { addToInventory, removeFromInventory, splitStack } from './items';
import { beginBurn, endBurn, shkYour } from './light';
import { discover } from './o_init';
import { doname } from './objnam';
import { P, heroHas } from './props';
import { billDummyObject, checkUnpaid } from './shk';
import { uinwater } from './uwater';
import { holdAnotherObject } from './wish';

const say = (ctx: Ctx, key: string, params?: Record<string, unknown>): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params: params as never } : {}) });

/**
 * Burning oil splatters: a fiery explosion of d(4, 4) (d(3, 4) diluted) centred on x, y, the
 * hero's ("caught herself in her own burning oil") unless a monster caused it (`by: 'other'`).
 * ref: src/explode.c splatter_burning_oil() (explode(ZT_SPELL(ZT_FIRE), BURNING_OIL))
 */
export function splatterBurningOil(
  ctx: Ctx,
  x: number,
  y: number,
  diluted: boolean,
  by: 'hero' | 'other',
): void {
  const dmg = ctx.rng.d(diluted ? 3 : 4, 4);
  explode(ctx, x, y, { oil: true, by }, dmg, 'fiery');
}

/**
 * A lit potion of oil is exploding: extinguish it as a light source first, then the blast. The
 * caller disposes of the potion. ref: src/explode.c explode_oil()
 */
export function explodeOil(
  ctx: Ctx,
  obj: Entity,
  x: number,
  y: number,
  by: 'hero' | 'other' = 'hero',
): void {
  const it = obj.c.item;
  if (!it?.lit) return; // impossible("exploding unlit oil")
  const diluted = isDiluted(it);
  endBurn(ctx, obj, true);
  splatterBurningOil(ctx, x, y, diluted, by);
}

/**
 * Applying a potion of oil: a lit one is snuffed (and rejoins its stack), else one potion of
 * the stack is lit ("It gives off a dim light."), costing extra in a shop, and is identified.
 * ref: src/apply.c light_cocktail()
 */
export function lightCocktail(ctx: Ctx, obj: Entity): void {
  const it = obj.c.item;
  if (!it) return;
  if (uswallow(ctx)) {
    say(ctx, 'apply.no_elbow_room');
    return;
  }
  if (it.lit) {
    say(ctx, 'oil.snuff');
    endBurn(ctx, obj, true);
    // free & add to re-merge potion (this will average the age of the potions); not when worn
    if (it.equipped === null) {
      removeFromInventory(ctx, obj.id); // freeinv()
      addToInventory(ctx, ctx.state.playerId, obj.id); // addinv()
    }
    return;
  } else if (uinwater(ctx)) {
    say(ctx, 'oil.no_oxygen');
    return;
  }
  const whose = shkYour(ctx, obj, false);
  const split1off = it.quantity > 1;
  const lit = split1off ? ctx.state.entities[String(splitStack(ctx, obj.id, 1))] : obj;
  const lt = lit?.c.item;
  if (!lit || !lt) return;
  say(ctx, heroHas(ctx.state, P.BLINDED) ? 'oil.light_blind' : 'oil.light', { whose });
  const hp = getPlayer(ctx.state).c.pos;
  if (lt.unpaid && hp && costlySpot(ctx, hp.x, hp.y)) {
    // normally, we shouldn't both partially and fully charge for an item, but (Yendorian
    // Fuel) Taxes are inevitable...
    checkUnpaid(ctx, lit);
    say(ctx, 'oil.in_addition');
    billDummyObject(ctx, lit, false);
  }
  discover(ctx, POT_OIL);
  beginBurn(ctx, lit, false); // after shop billing
  if (split1off) {
    // a burning potion never merges with the rest of the stack
    holdAnotherObject(ctx, lit.id, {
      key: 'oil.drop',
      params: { item: doname(ctx.state, ctx.defs, lit) },
    });
  }
}
