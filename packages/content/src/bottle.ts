// Bottle occupants: the ghost in a milky potion and the djinni in a smoky one (or in a magic
// lamp). A leaf (core and vanquished.ts), so muse.ts's precheck() can draw for a monster's
// potion without the hero's side (djinni.ts).
// ref: include/hack.h POTION_OCCUPANT_CHANCE; src/potion.c dodrink(); src/muse.c precheck()
import type { Ctx, DefId, GameState } from '@nh/core';
import { born, isGone } from './vanquished';

export const GHOST: DefId = 'nh:ghost';
export const DJINNI: DefId = 'nh:djinni';
export const MAGIC_LAMP: DefId = 'nh:magic_lamp';

/** The potion descriptions with an occupant (their appearance ids). */
export const MILKY: DefId = 'nh:milky_potion';
export const SMOKY: DefId = 'nh:smoky_potion';

/**
 * Whether the object's type has the description `app` (an appearance id). ref: src/objnam.c
 * objdescr_is()
 */
export const objdescrIs = (state: Readonly<GameState>, def: DefId, app: DefId): boolean =>
  state.appearances[def] === app;

/**
 * ref: include/hack.h POTION_OCCUPANT_CHANCE(n): 13 + 2 * n, n being how many of the kind were
 * ever born, so each one made makes the next less likely
 */
export const potionOccupantChance = (n: number): number => 13 + 2 * n;

/**
 * Whether a milky (`GHOST`) or smoky (`DJINNI`) potion being opened holds its occupant: never
 * once the kind is genocided or extinct (no draw then), else 1 in POTION_OCCUPANT_CHANCE(born).
 * ref: src/potion.c dodrink(), src/muse.c precheck()
 */
export function occupantDraw(ctx: Pick<Ctx, 'state' | 'rng'>, kind: DefId): boolean {
  if (isGone(ctx.state, kind)) return false; // mvflags & G_GONE
  return !ctx.rng.rn2(potionOccupantChance(born(ctx.state, kind)));
}
