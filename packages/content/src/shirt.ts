// Reading a T-shirt, a Hawaiian shirt or an alchemy smock (apron).
// ref: src/read.c doread() (the shirt and apron branch), tshirt_text(), apron_text(),
// hawaiian_motif(), hawaiian_design(); src/objnam.c suit_simple_name()
//
// Not ported (see DEVIATIONS.md): erode_obj_text() (an eroded shirt's slogan reads the same; the
// text is a message key, so wiping letters out is the renderer's business), the literacy conduct.
// The game's seed stands in for the hero's birthday (`ubirthday`), as in shknam.ts.
import { getPlayer, inventoryOf, type Ctx, type DefId, type Entity, type Msg } from '@nh/core';
import { P, hasProp } from './props';

export const T_SHIRT: DefId = 'nh:t_shirt';
export const HAWAIIAN_SHIRT: DefId = 'nh:hawaiian_shirt';
export const ALCHEMY_SMOCK: DefId = 'nh:alchemy_smock';

/** The lengths of C's text lists (shirt.en.ts holds the text, in C's order). */
export const SHIRT_COUNTS = { tshirt: 71, apron: 10, motif: 16, bg: 11 } as const;

/** Objects with something written or drawn on them. */
export const isReadableWear = (def: DefId): boolean =>
  def === T_SHIRT || def === HAWAIIAN_SHIRT || def === ALCHEMY_SMOCK;

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/** "mail", "jacket" or "suit". ref: src/objnam.c suit_simple_name() (no dragon scales here) */
function suitSimpleName(suit: Entity): string {
  if (suit.def.endsWith('_mail')) return 'mail';
  if (suit.def.endsWith('_jacket')) return 'jacket';
  return 'suit';
}

/** `x ^ seed` as C's unsigned arithmetic. */
const xorU = (a: number, b: number): number => (a ^ b) >>> 0;

/**
 * "The design features flamingos on a purple background."
 * ref: src/read.c hawaiian_design(), hawaiian_motif()
 */
function hawaiianDesign(ctx: Ctx, shirt: Entity): Msg {
  const seed = ctx.state.seed | 0;
  const motif = xorU(shirt.id, seed) % SHIRT_COUNTS.motif;
  const bg = xorU(shirt.id, ~seed) % SHIRT_COUNTS.bg;
  return {
    key: 'shirt.features',
    params: { motifs: { key: `shirt.motif.${motif}` }, bg: { key: `shirt.bg.${bg}` } },
  };
}

/**
 * Reads the shirt or apron. Returns whether it took time.
 * ref: src/read.c doread() T_SHIRT, ALCHEMY_SMOCK, HAWAIIAN_SHIRT
 */
export function readWear(ctx: Ctx, obj: Entity): boolean {
  const h = getPlayer(ctx.state);
  if (hasProp(h, P.BLINDED)) {
    say(ctx, 'shirt.braille');
    return false;
  }
  // can't read shirt worn under suit (under cloak is ok though)
  const suit = inventoryOf(ctx.state, h.id).find((o) => o.c.item?.equipped === 'body');
  if (obj.def !== ALCHEMY_SMOCK && suit && obj.c.item?.equipped === 'shirt') {
    say(ctx, obj.c.item.unpaid ? 'shirt.obscured_unpaid' : 'shirt.obscured', {
      suit: { key: `shirt.suit.${suitSimpleName(suit)}` },
    });
    return false;
  }
  if (obj.def === HAWAIIAN_SHIRT) {
    const m = hawaiianDesign(ctx, obj);
    say(ctx, m.key, m.params);
    return true;
  }
  say(ctx, 'shirt.reads');
  if (obj.def === T_SHIRT) say(ctx, `shirt.tshirt.${obj.id % SHIRT_COUNTS.tshirt}`);
  else say(ctx, `shirt.apron.${obj.id % SHIRT_COUNTS.apron}`);
  return true;
}
