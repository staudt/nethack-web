// The hiding flag of monsters (C's `mtmp->mundetected`) and the hider tests. A leaf over core so
// that invis.ts (mon_visible()), perception.ts (the `nh:hiding` perception) and the behaviour in
// hide.ts share it. The flag lives in `modData.nh.mundetected: { [monsterId]: true }` and goes
// with the monster (mstate.ts KEYS: forgetMState()); a clone never starts hidden (clone_mon()).
// ref: include/monst.h mundetected; include/mondata.h is_hider(), hides_under(), ceiling_hider()
import type { Ctx, EntityId, Json, MonsterDef } from '@nh/core';

type Table = { [k: string]: Json };
const isObj = (v: unknown): v is Table => v !== null && typeof v === 'object' && !Array.isArray(v);

function table(ctx: Pick<Ctx, 'state'>, create: boolean): Table | null {
  const md = ctx.state.modData;
  let root = md['nh'];
  if (!isObj(root)) {
    if (!create) return null;
    root = {};
    md['nh'] = root;
  }
  let t = root['mundetected'];
  if (!isObj(t)) {
    if (!create) return null;
    t = {};
    root['mundetected'] = t;
  }
  return t;
}

/** `mtmp->mundetected`: the monster is hiding (under an object, or on the ceiling). */
export function isUndetected(ctx: Pick<Ctx, 'state'>, id: EntityId): boolean {
  return table(ctx, false)?.[String(id)] === true;
}

/** Sets or clears `mtmp->mundetected`. */
export function setUndetected(ctx: Pick<Ctx, 'state'>, id: EntityId, on: boolean): void {
  if (on) {
    const t = table(ctx, true);
    if (t) t[String(id)] = true;
  } else {
    const t = table(ctx, false);
    if (t) delete t[String(id)];
  }
}

/** ref: include/mondata.h is_hider(): M1_HIDE (piercers, trappers, lurkers above, mimics) */
export const isHider = (d: Readonly<MonsterDef>): boolean => d.flags.includes('hide');

/** ref: include/mondata.h hides_under(): M1_CONCEAL (snakes, some spiders) */
export const hidesUnder = (d: Readonly<MonsterDef>): boolean => d.flags.includes('conceal');

/**
 * ref: include/mondata.h ceiling_hider(): a hider that clings (not a mimic) or flies (the lurker
 * above)
 */
export const ceilingHider = (d: Readonly<MonsterDef>): boolean =>
  isHider(d) && ((d.flags.includes('cling') && d.glyph.ch !== 'm') || d.flags.includes('fly'));
