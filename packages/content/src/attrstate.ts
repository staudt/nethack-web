// The hero's attributes under acurr()'s worn-armor overrides: gauntlets of power hold Str at 25,
// a dunce cap holds Int and Wis at 6. A leaf (props.ts only), so hp.ts, end.ts and hunger.ts can
// change attributes through it. ref: src/attrib.c acurr()
import { getPlayer, type AttributesComponent, type Ctx, type GameState } from '@nh/core';
import { wornIn } from './props';

export type Attr = keyof AttributesComponent;

/** ref: src/attrib.c acurr(): 3..125 for (encoded) Str, 3..25 for the others */
export const acurrClamp = (which: Attr, n: number): number =>
  Math.max(3, Math.min(which === 'str' ? 125 : 25, n));

/**
 * ABON: the attribute bonus of worn rings (u.abon), the raw sum of their enchantments, kept in
 * `modData.nh.abon`. The stored attribute is ACURR (ABASE + ABON, clamped by acurr()).
 */
export function abon(state: Readonly<GameState>, which: Attr): number {
  const nh = state.modData['nh'] as { abon?: Partial<Record<Attr, number>> } | undefined;
  return nh?.abon?.[which] ?? 0;
}

/** Adds `n` to ABON; drops the record when it is back to zero. */
export function addAbon(ctx: Pick<Ctx, 'state'>, which: Attr, n: number): void {
  const nh = (ctx.state.modData['nh'] ??= {}) as { abon?: Partial<Record<Attr, number>> };
  const ab = (nh.abon ??= {});
  const v = (ab[which] ?? 0) + n;
  if (v) ab[which] = v;
  else delete ab[which];
  if (Object.keys(ab).length === 0) delete nh.abon;
}

/**
 * ABON(which) += n with ACURR recomputed (the hidden value while an override applies).
 * ref: src/do_wear.c adjust_attrib(), adj_abon()
 */
export function adjustAbon(ctx: Pick<Ctx, 'state'>, which: Attr, n: number): void {
  if (!getPlayer(ctx.state).c.attributes || !n) return;
  const base = rawAttr(ctx.state, which) - abon(ctx.state, which);
  addAbon(ctx, which, n);
  setRawAttr(ctx, which, acurrClamp(which, base + abon(ctx.state, which)));
}

type AttrRecord = Partial<Record<Attr, number>>;

const ATTRS: readonly Attr[] = ['str', 'int', 'wis', 'dex', 'con', 'cha'];

/**
 * acurr()'s worn-armor overrides: gauntlets of power make Str 25 (encoded 125), a dunce cap
 * makes Int and Wis 6; null when none applies. ref: src/attrib.c acurr()
 */
export function attrOverride(state: Readonly<GameState>, which: Attr): number | null {
  if (which === 'str')
    return wornIn(state, state.playerId, 'gloves')?.def === 'nh:gauntlets_of_power' ? 125 : null;
  if (which === 'int' || which === 'wis')
    return wornIn(state, state.playerId, 'helm')?.def === 'nh:dunce_cap' ? 6 : null;
  return null;
}

/**
 * While an override applies, the stored attribute is the override and the value it hides (the
 * stored ACURR without it) waits in `modData.nh.attrHeld`, written only then.
 */
const heldOf = (state: Readonly<GameState>): AttrRecord | undefined =>
  (state.modData['nh'] as { attrHeld?: AttrRecord } | undefined)?.attrHeld;

/** The stored attribute without acurr()'s armor override (ABASE + ABON + ATEMP, clamped). */
export function rawAttr(state: Readonly<GameState>, which: Attr): number {
  return heldOf(state)?.[which] ?? getPlayer(state).c.attributes?.[which] ?? 10;
}

/**
 * Sets the attribute's value without the override (an override still shows in the stored
 * attribute). Every change of a hero attribute goes through here or {@link adjattrib}.
 */
export function setRawAttr(ctx: Pick<Ctx, 'state'>, which: Attr, v: number): void {
  const a = getPlayer(ctx.state).c.attributes;
  if (!a) return;
  const held = heldOf(ctx.state);
  if (held?.[which] !== undefined) held[which] = v;
  else a[which] = v;
  syncAttrOverrides(ctx);
}

/**
 * Applies or lifts the armor overrides after the hero's gloves or helmet changed: the stored
 * attribute shows acurr()'s value, the hidden one comes back when the override ends.
 */
export function syncAttrOverrides(ctx: Pick<Ctx, 'state'>): void {
  const a = getPlayer(ctx.state).c.attributes;
  if (!a) return;
  const nh = (ctx.state.modData['nh'] ??= {}) as { attrHeld?: AttrRecord };
  for (const k of ATTRS) {
    const ov = attrOverride(ctx.state, k);
    const held = nh.attrHeld?.[k];
    if (ov !== null) {
      if (held === undefined) (nh.attrHeld ??= {})[k] = a[k];
      a[k] = ov;
    } else if (held !== undefined && nh.attrHeld) {
      a[k] = held;
      delete nh.attrHeld[k];
    }
  }
  if (nh.attrHeld && Object.keys(nh.attrHeld).length === 0) delete nh.attrHeld;
}
