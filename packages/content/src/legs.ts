// Wounded legs. ref: src/do.c set_wounded_legs()
import { getPlayer, type Ctx } from '@nh/core';
import { encumberMsg } from './itemactions';
import { nhData } from './items';
import { P, hasProp, setItimeout, timeoutLeft } from './props';

const hero = (ctx: Ctx) => getPlayer(ctx.state);

/** ref: src/do.c set_wounded_legs(): the right leg, `timex` turns (the Dex penalty is not ported) */
export function setWoundedLegs(ctx: Ctx, timex: number): void {
  const h = hero(ctx);
  if (!hasProp(h, P.WOUNDED_LEGS) || timeoutLeft(ctx.state, h, P.WOUNDED_LEGS) < timex)
    setItimeout(ctx.state, h, P.WOUNDED_LEGS, timex);
  (nhData(ctx) as unknown as { legsHurt?: boolean }).legsHurt = true;
  encumberMsg(ctx); // Wounded_legs reduces carrying capacity
}
