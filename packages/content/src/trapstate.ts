// Who is caught in or knows about traps. ref: include/you.h u.utrap/u.utraptype,
// include/monst.h mtrapped/mtrapseen, src/trap.c set_utrap(), reset_utrap(),
// src/mondata.c mon_knows_traps(), mon_learns_traps()
//
// The core components have no such fields, so the content mod keeps them in `modData.nh`:
// `utrap: { n, type }` while the hero is caught, `mtrapped: { [monsterId]: true }`,
// `mtrapseen: { [monsterId]: trapDefId[] }` (sorted) and `migrating: { [monsterId]: levelId }`
// for monsters that fell to a level the hero is not on. Tables are only created on write.
import { trapAt, type Ctx, type DefId, type EntityId, type Json } from '@nh/core';

type Table = { [k: string]: Json };

const isObj = (v: unknown): v is Table => v !== null && typeof v === 'object' && !Array.isArray(v);

type Key = 'mtrapped' | 'mtrapseen' | 'migrating';

function root(ctx: Pick<Ctx, 'state'>, create: boolean): Table | null {
  const md = ctx.state.modData;
  let r = md['nh'];
  if (!isObj(r)) {
    if (!create) return null;
    r = {};
    md['nh'] = r;
  }
  return r;
}

export function trapTable(ctx: Pick<Ctx, 'state'>, key: Key, create: boolean): Table | null {
  const r = root(ctx, create);
  if (!r) return null;
  let t = r[key];
  if (!isObj(t)) {
    if (!create) return null;
    t = {};
    r[key] = t;
  }
  return t;
}

/** The hero's trap (u.utrap turns, u.utraptype): TT_BEARTRAP or TT_PIT. */
export interface UTrap {
  n: number;
  type: 'beartrap' | 'pit';
}

/** ref: u.utrap / u.utraptype */
export function utrap(ctx: Pick<Ctx, 'state'>): UTrap | null {
  const v = root(ctx, false)?.['utrap'];
  if (!isObj(v) || typeof v['n'] !== 'number' || v['n'] <= 0) return null;
  return { n: v['n'], type: v['type'] === 'pit' ? 'pit' : 'beartrap' };
}

/** The hero is caught in a pit or spiked pit. ref: `u.utrap && u.utraptype == TT_PIT` */
export const uInPit = (ctx: Pick<Ctx, 'state'>): boolean => utrap(ctx)?.type === 'pit';

/** ref: include/trap.h is_pit(): PIT or SPIKED_PIT */
export const isPit = (def: DefId): boolean => def === 'nh:pit' || def === 'nh:spiked_pit';

/** ref: include/trap.h is_hole() */
export const isHole = (def: DefId): boolean => def === 'nh:trap_door' || def === 'nh:hole';

/**
 * Whether the monster is trapped in a pit (or spiked pit). ref: src/mhitu.c mtrapped_in_pit()
 * (the hero's case is uInPit())
 */
export function mtrappedInPit(ctx: Pick<Ctx, 'state'>, id: EntityId): boolean {
  if (!isMtrapped(ctx, id)) return false;
  const p = ctx.state.entities[String(id)]?.c.pos;
  const level = p ? ctx.state.levels[p.level] : undefined;
  const t = level && p ? trapAt(level, p.x, p.y) : undefined;
  return !!t && isPit(t.def);
}

/** ref: src/trap.c set_utrap(); 0 turns is reset_utrap() */
export function setUtrap(ctx: Pick<Ctx, 'state'>, n: number, type: UTrap['type']): void {
  if (n > 0) {
    const r = root(ctx, true);
    if (r) r['utrap'] = { n, type };
  } else {
    const r = root(ctx, false);
    if (r && 'utrap' in r) delete r['utrap'];
  }
}

/** ref: mtmp->mtrapped */
export function isMtrapped(ctx: Pick<Ctx, 'state'>, id: EntityId): boolean {
  return trapTable(ctx, 'mtrapped', false)?.[String(id)] === true;
}

export function setMtrapped(ctx: Pick<Ctx, 'state'>, id: EntityId, on: boolean): void {
  if (on) {
    const t = trapTable(ctx, 'mtrapped', true);
    if (t) t[String(id)] = true;
  } else {
    const t = trapTable(ctx, 'mtrapped', false);
    if (t) delete t[String(id)];
  }
}

/** ref: src/mondata.c mon_knows_traps() */
export function monKnowsTraps(ctx: Pick<Ctx, 'state'>, id: EntityId, trap: DefId): boolean {
  const v = trapTable(ctx, 'mtrapseen', false)?.[String(id)];
  return Array.isArray(v) && v.includes(trap);
}

/** ref: src/mondata.c mon_learns_traps() */
export function monLearnsTraps(ctx: Pick<Ctx, 'state'>, id: EntityId, trap: DefId): void {
  if (monKnowsTraps(ctx, id, trap)) return;
  const t = trapTable(ctx, 'mtrapseen', true);
  if (!t) return;
  const prev = t[String(id)];
  const list = Array.isArray(prev) ? (prev.filter((x) => typeof x === 'string') as string[]) : [];
  t[String(id)] = [...list, trap].sort();
}

/** Drops a monster's trap records (it died or left). ref: src/mon.c m_detach() mtrapped = 0 */
export function forgetMonTraps(ctx: Pick<Ctx, 'state'>, id: EntityId): void {
  for (const k of ['mtrapped', 'mtrapseen', 'migrating'] as const) {
    const t = trapTable(ctx, k, false);
    if (t) delete t[String(id)];
  }
}
