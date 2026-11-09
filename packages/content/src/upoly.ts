// The polymorphed hero's state (D5/D6 of the m7f plan): `modData.nh.upoly` while she is in a
// monster form, absent otherwise. The hero entity keeps the role def; the form is a MonsterDef id
// here. While polymorphed `c.hp` holds the form's hit points (C's u.mh/u.mhmax) and her own (C's
// u.uhp/u.uhpmax) are parked in `uhp`, so every damage path keeps working on `c.hp`. A leaf
// module (core only): hp.ts, end.ts, exper.ts, gender.ts, werestate.ts and perception.ts read it,
// and polyself.ts (high in the graph) hands its rehumanize() and you_unwere() down through
// `setRehumanize()`/`setUnwere()`.
// ref: include/you.h u.umonnum, u.mtimedone, u.mh, u.mhmax, u.mfemale, u.macurr; include/youprop.h
// Upolyd
import {
  getPlayer,
  type AttributesComponent,
  type Ctx,
  type DefId,
  type GameState,
  type HpComponent,
  type MonsterDef,
} from '@nh/core';

/** The polymorphed hero. ref: include/you.h */
export interface UPoly {
  /** u.umonnum: the form's MonsterDef id */
  form: DefId;
  /** u.mtimedone: turns left in the form (0: no countdown) */
  mtimedone: number;
  /** u.uhp/u.uhpmax: her own hit points, parked while `c.hp` holds the form's (u.mh/u.mhmax) */
  uhp: HpComponent;
  /** u.mfemale: her own sex, restored by polyman() (flags.female follows the form meanwhile) */
  mfemale: boolean;
  /** u.macurr: her own attributes (without ring bonuses), restored by polyman() */
  macurr: AttributesComponent;
  /** u.mamax: her own attribute peaks (the AMAX record, attrstate.ts), when any was lost */
  mamax?: Partial<AttributesComponent>;
  /** poly_gender() is 2: the form is neuter or not humanoid */
  neuter?: true;
}

type Table = Record<string, unknown>;
const isObj = (v: unknown): v is Table => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The polymorphed hero's state, or null when she is in her own form. */
export function upolyOf(state: Readonly<GameState>): UPoly | null {
  const nh = state.modData['nh'];
  if (!isObj(nh)) return null;
  const u = nh['upoly'];
  return isObj(u) && typeof u['form'] === 'string' ? (u as unknown as UPoly) : null;
}

/** Sets (or, with null, clears) the polymorphed hero's state. */
export function setUpoly(state: GameState, u: UPoly | null): void {
  let nh = state.modData['nh'];
  if (!isObj(nh)) {
    if (u === null) return;
    nh = {};
    state.modData['nh'] = nh as GameState['modData'][string];
  }
  const t = nh as Table;
  if (u === null) delete t['upoly'];
  else t['upoly'] = u;
}

/** Upolyd. ref: include/youprop.h */
export const upolyd = (state: Readonly<GameState>): boolean => upolyOf(state) !== null;

/** The form's MonsterDef id while polymorphed (u.umonnum), else null. */
export const heroFormId = (state: Readonly<GameState>): DefId | null =>
  upolyOf(state)?.form ?? null;

/** `Upolyd ? youmonst.data : null`: the form's MonsterDef. */
export function heroForm(ctx: Pick<Ctx, 'state' | 'defs'>): MonsterDef | null {
  const id = heroFormId(ctx.state);
  return id !== null && ctx.defs.isMonster(id) ? ctx.defs.monster(id) : null;
}

/**
 * Her own hit points (u.uhp/u.uhpmax): the parked ones while polymorphed, else `c.hp`. The
 * active pool (C's `Upolyd ? u.mh : u.uhp`) is always `c.hp`.
 */
export function ownHp(state: GameState): HpComponent | null {
  const u = upolyOf(state);
  if (u) return u.uhp;
  return getPlayer(state).c.hp ?? null;
}

let rehumanizeFn: ((ctx: Ctx) => void) | null = null;
let unwereFn: ((ctx: Ctx) => void) | null = null;
let polymonFn: ((ctx: Ctx, mntmp: DefId) => boolean) | null = null;

/** polyself.ts hands down its rehumanize() (hp.ts and friends stay below it). */
export function setRehumanize(fn: (ctx: Ctx) => void): void {
  rehumanizeFn = fn;
}

/** polyself.ts hands down the polymorphed half of you_unwere() (werestate.ts stays a leaf). */
export function setUnwere(fn: (ctx: Ctx) => void): void {
  unwereFn = fn;
}

/** polyself.ts hands down its polymon() (eat.ts stays below it). */
export function setPolymon(fn: (ctx: Ctx, mntmp: DefId) => boolean): void {
  polymonFn = fn;
}

/** polymon(), late bound. ref: src/polyself.c polymon() */
export function polymonLate(ctx: Ctx, mntmp: DefId): boolean {
  return polymonFn?.(ctx, mntmp) ?? false;
}

/** rehumanize(), late bound. ref: src/polyself.c rehumanize() */
export function rehumanize(ctx: Ctx): void {
  rehumanizeFn?.(ctx);
}

/** you_unwere()'s polymorphed half, late bound. ref: src/were.c you_unwere() */
export function unwereForm(ctx: Ctx): void {
  unwereFn?.(ctx);
}

/**
 * Hit points per level of the hero's form for level gain and drain: d8, but rnd(4) for a level 0
 * monster -- and youmonst.m_lev is never set, so after the d8 every form uses rnd(4) (C as is).
 * ref: src/makemon.c monhp_per_lvl() (no golems, no forms above level 49, no adult dragons)
 */
export function monhpPerLvl(ctx: Pick<Ctx, 'rng'>): number {
  ctx.rng.rnd(8); // default is d8 (drawn, then replaced)
  return ctx.rng.rnd(4); // !mon->m_lev: level 0 monsters use 1d4 instead of Nd8
}
