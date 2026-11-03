// Color words, as the hero sees them. ref: src/hack.c hcolor(), hcolors[]
// (a leaf module, so align.ts can use it without an import cycle through magic.ts)
import { getPlayer, type Ctx, type Msg } from '@nh/core';
import { P, hasProp } from './props';

export type ColorName = 'blue' | 'black' | 'silver' | 'amber' | 'golden' | 'purple' | 'light_blue';

/** A color name message (not hallucinating). */
export const color = (name: ColorName): Msg => ({
  key: `color.${name}`,
});

/** ref: src/hack.c hcolors[]: the colors a hallucinating hero sees (a subset) */
const HCOLORS = ['ultraviolet', 'infrared', 'bluish_orange', 'reddish_green', 'dark_white'];

/** A color as the hero sees it: a random one while hallucinating. ref: src/hack.c hcolor() */
export function hcolor(ctx: Pick<Ctx, 'state' | 'cosmetic'>, name: ColorName): Msg {
  if (!hasProp(getPlayer(ctx.state), P.HALLUC)) return color(name);
  return { key: `color.${HCOLORS[ctx.cosmetic.rn2(HCOLORS.length)] ?? 'ultraviolet'}` };
}
