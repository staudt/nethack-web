// The hero's attributes under acurr()'s worn-armor overrides: gauntlets of power hold Str at 25,
// a dunce cap holds Int and Wis at 6. A leaf (props.ts only), so hp.ts, end.ts and hunger.ts can
// change attributes through it. ref: src/attrib.c acurr()
import { getPlayer, type AttributesComponent, type Ctx, type GameState } from '@nh/core';
import { P, hasProp, wornIn } from './props';

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

// ---------------------------------------------------------------------------------------------
// AMAX: the peak an attribute may be restored to. ref: include/attrib.h AMAX(), ABASE()

/**
 * ATEMP(A_STR): the Strength Weak hunger took away (`modData.nh.strLoss`, uhunger.ts), which
 * the stored attribute includes but ABASE does not.
 */
const atemp = (state: Readonly<GameState>, which: Attr): number =>
  which === 'str' ? -((state.modData['nh'] as { strLoss?: number } | undefined)?.strLoss ?? 0) : 0;

/** ABASE: the stored attribute (without the armor override) less ABON and ATEMP. */
export function abase(state: Readonly<GameState>, which: Attr): number {
  return rawAttr(state, which) - abon(state, which) - atemp(state, which);
}

const amaxRecord = (state: Readonly<GameState>): AttrRecord | undefined =>
  (state.modData['nh'] as { amax?: AttrRecord } | undefined)?.amax;

/**
 * AMAX: the recorded peak (`modData.nh.amax`, kept only while it is above ABASE), else ABASE
 * itself: any raise of ABASE past the peak lifts it. ref: include/attrib.h AMAX()
 */
export function amax(state: Readonly<GameState>, which: Attr): number {
  const b = abase(state, which);
  const r = amaxRecord(state)?.[which];
  return r !== undefined && r > b ? r : b;
}

/** Sets AMAX (only recorded while above ABASE). */
export function setAmax(ctx: Pick<Ctx, 'state'>, which: Attr, v: number): void {
  const nh = (ctx.state.modData['nh'] ??= {}) as { amax?: AttrRecord };
  if (v > abase(ctx.state, which)) (nh.amax ??= {})[which] = v;
  else if (nh.amax) delete nh.amax[which];
  pruneAmax(ctx);
}

/** Drops the peaks ABASE has reached again, and the record when it is empty. */
export function pruneAmax(ctx: Pick<Ctx, 'state'>): void {
  const nh = ctx.state.modData['nh'] as { amax?: AttrRecord } | undefined;
  if (!nh?.amax) return;
  for (const k of ATTRS) {
    const r = nh.amax[k];
    if (r !== undefined && r <= abase(ctx.state, k)) delete nh.amax[k];
  }
  if (Object.keys(nh.amax).length === 0) delete nh.amax;
}

/** The whole AMAX record (u.amax) for polymon() to park; undefined when nothing was lost. */
export function amaxSnapshot(state: Readonly<GameState>): AttrRecord | undefined {
  const r = amaxRecord(state);
  return r ? { ...r } : undefined;
}

/** u.amax = saved: polyman() puts her own peaks back. */
export function restoreAmaxSnapshot(ctx: Pick<Ctx, 'state'>, saved: AttrRecord | undefined): void {
  const nh = (ctx.state.modData['nh'] ??= {}) as { amax?: AttrRecord };
  if (saved) nh.amax = { ...saved };
  else delete nh.amax;
  pruneAmax(ctx);
}

/**
 * Sets ABASE (the stored attribute follows with ABON and ATEMP, clamped by acurr()); AMAX
 * keeps its record.
 */
export function setAbase(ctx: Pick<Ctx, 'state'>, which: Attr, v: number): void {
  const peak = amax(ctx.state, which);
  const nh = (ctx.state.modData['nh'] ??= {}) as { amax?: AttrRecord };
  if (peak > v) (nh.amax ??= {})[which] = peak;
  setRawAttr(ctx, which, acurrClamp(which, v + abon(ctx.state, which) + atemp(ctx.state, which)));
  pruneAmax(ctx);
}

/**
 * `ABASE(i) = AMAX(i)` when it is lower: restores a lost attribute. Returns whether it rose.
 * ref: src/potion.c peffect_restore_ability(), src/pray.c fix_worst_trouble()
 */
export function restoreAttr(ctx: Pick<Ctx, 'state'>, which: Attr): boolean {
  const peak = amax(ctx.state, which);
  const before = abase(ctx.state, which);
  if (before >= peak) return false;
  setAbase(ctx, which, peak);
  return abase(ctx.state, which) > before;
}

// ---------------------------------------------------------------------------------------------
// adjattrib()

/** ref: include/attrib.h STR18 */
const STR18 = (x: number): number => 18 + x;
/** ref: src/role.c races[] human attrmin / attrmax */
const ATTRMIN = 3;
const ATTRMAX: Record<Attr, number> = {
  str: STR18(100),
  int: 18,
  wis: 18,
  dex: 18,
  con: 18,
  cha: 18,
};

/**
 * Raises or lowers an attribute. Returns whether it changed. `msg` shows "You feel weak!" etc.
 * when it changed (C's msgflg -1); 'always' also says why nothing changed (msgflg 0: "You're
 * already as strong as you can get.", "Your innate strength has improved."). A raise above
 * AMAX lifts it; a drop leaves it, except that a drop below the minimum lowers AMAX by a random
 * part of the excess. ref: src/attrib.c adjattrib() (a dunce cap holds Int and Wis: "Your cap
 * constricts briefly"). Not ported: abuse and exercise.
 */
export function adjattrib(
  ctx: Pick<Ctx, 'state' | 'rng' | 'emit'>,
  which: Attr,
  incr: number,
  msg: boolean | 'always',
): boolean {
  const hero = getPlayer(ctx.state);
  const a = hero.c.attributes;
  if (hasProp(hero, P.FIXED_ABIL) || !a || !incr) return false;
  if ((which === 'int' || which === 'wis') && attrOverride(ctx.state, which) !== null) {
    // the dunce cap
    if (msg) ctx.emit({ type: 'msg', key: 'attr.cap_constricts' });
    return false;
  }
  const oldAcurr = a[which];
  const oldAbase = abase(ctx.state, which);
  const oldAmax = amax(ctx.state, which);
  let base = oldAbase + incr; // when incr is negative, this reduces ABASE()
  let peak = oldAmax;
  let abonflg: boolean;
  if (incr > 0) {
    if (base > peak) {
      peak = base;
      if (peak > ATTRMAX[which]) base = peak = ATTRMAX[which];
    }
    abonflg = abon(ctx.state, which) < 0;
  } else {
    if (base < ATTRMIN) {
      // dropped below the minimum: take some (average half, possibly zero) of the excess from
      // the peak instead
      const decr = ctx.rng.rn2(ATTRMIN - base + 1);
      base = ATTRMIN;
      peak = Math.max(peak - decr, ATTRMIN);
    }
    abonflg = abon(ctx.state, which) > 0;
  }
  setAbase(ctx, which, base);
  setAmax(ctx, which, peak);
  if (a[which] === oldAcurr) {
    if (msg === 'always') {
      if (abase(ctx.state, which) === oldAbase && amax(ctx.state, which) === oldAmax)
        ctx.emit({
          type: 'msg',
          key: `attr.as_${incr > 0 ? 'plus' : 'minus'}.${which}`,
          params: { already: abonflg ? '@attr.word.currently' : '@attr.word.already' },
        });
      else
        ctx.emit({
          type: 'msg',
          key: `attr.innate_${incr > 0 ? 'improved' : 'declined'}.${which}`,
        });
    }
    return false;
  }
  if (msg) {
    ctx.emit({
      type: 'msg',
      key: `attr.${incr > 0 ? 'plus' : 'minus'}.${which}`,
      params: { very: incr > 1 || incr < -1 ? 'very ' : '' },
    });
  }
  return true;
}
