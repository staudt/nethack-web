// The hero's hunger data and its reset, apart from hunger.ts so that end.ts (life saving) can use
// them without an import cycle. ref: src/eat.c init_uhunger()
import { getPlayer, type Ctx, type HungerState } from '@nh/core';
import { nhData } from './items';
import { rawAttr, setRawAttr } from './attrstate';

/** The meal in progress. ref: include/context.h struct victual_info */
export interface Victual {
  /** Entity id of the (single, partly eaten) piece. */
  piece: number;
  usedtime: number;
  reqtime: number;
  /** Nutrition per bite (negative: that many per bite; positive: 1 on bites not divisible). */
  nmod: number;
  canchoke: boolean;
  fullwarn: boolean;
  /** The eat occupation is running (ref: occupation == eatfood). */
  eating: boolean;
  /** The engine will perform the action again right now (set by `continues`). */
  pending: boolean;
}

/** ref: include/you.h SICK_VOMITABLE, SICK_NONVOMITABLE, SICK_ALL (u.usick_type bits) */
export const SICK_VOMITABLE = 1;
export const SICK_NONVOMITABLE = 2;
export const SICK_ALL = SICK_VOMITABLE | SICK_NONVOMITABLE;

/** Sickness: food poisoning and illness. ref: Sick, u.usick_type */
export interface Sick {
  remaining: number;
  /** u.usick_type: SICK_VOMITABLE and/or SICK_NONVOMITABLE; absent (older saves) is vomitable. */
  type?: number;
  /** A killer message key. */
  killer: string;
}

export interface HungerData {
  victual: Victual | null;
  /** u.uhs saved while eating (save_hs); null when not eating. */
  savedHs: HungerState | null;
  /** Strength lost to Weak (ATEMP(A_STR)). */
  strLoss: number;
  sick: Sick | null;
  /** Turns until the hero vomits (Vomiting timeout); 0 = not nauseated. */
  vomiting: number;
}

/** The hunger-related persistent data, kept in the content mod's modData. */
export function hungerData(ctx: Pick<Ctx, 'state'>): HungerData {
  const d = nhData(ctx) as unknown as Partial<HungerData>;
  if (d.victual === undefined) d.victual = null;
  if (d.savedHs === undefined) d.savedHs = null;
  if (d.strLoss === undefined) d.strLoss = 0;
  if (d.sick === undefined) d.sick = null;
  if (d.vomiting === undefined) d.vomiting = 0;
  return d as HungerData;
}

/**
 * Back to 900 nutrition and Not Hungry, with Weak's lost strength restored (no messages).
 * ref: src/eat.c init_uhunger()
 */
export function initUhunger(ctx: Pick<Ctx, 'state'>): void {
  const hero = getPlayer(ctx.state);
  const h = hero.c.hunger;
  if (!h) return;
  h.nutrition = 900;
  h.state = 'not_hungry';
  const hd = hungerData(ctx);
  if (hd.strLoss > 0 && hero.c.attributes)
    setRawAttr(ctx, 'str', rawAttr(ctx.state, 'str') + hd.strLoss);
  hd.strLoss = 0;
}
