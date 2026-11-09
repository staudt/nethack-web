// Who is caught in or knows about traps. ref: include/you.h u.utrap/u.utraptype,
// include/monst.h mtrapped/mtrapseen, src/trap.c set_utrap(), reset_utrap(),
// src/mondata.c mon_knows_traps(), mon_learns_traps()
//
// The core components have no such fields, so the content mod keeps them in `modData.nh`:
// `utrap: { n, type }` while the hero is caught, `mtrapped: { [monsterId]: true }`,
// `mtrapseen: { [monsterId]: trapDefId[] }` (sorted) and `migrating: { [monsterId]: levelId }`
// for monsters that fell to a level the hero is not on. Tables are only created on write.
import {
  getPlayer,
  inBounds,
  trapAt,
  type Ctx,
  type DefId,
  type EntityId,
  type Json,
  type Level,
  type Trap,
} from '@nh/core';
import { P, hasProp } from './props';

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

/** The hero's trap (u.utrap turns, u.utraptype): TT_BEARTRAP, TT_PIT or TT_WEB. */
export interface UTrap {
  n: number;
  type: 'beartrap' | 'pit' | 'web';
}

/** ref: u.utrap / u.utraptype */
export function utrap(ctx: Pick<Ctx, 'state'>): UTrap | null {
  const v = root(ctx, false)?.['utrap'];
  if (!isObj(v) || typeof v['n'] !== 'number' || v['n'] <= 0) return null;
  const t = v['type'];
  // older saves and unknown kinds read as a bear trap
  return { n: v['n'], type: t === 'pit' || t === 'web' ? t : 'beartrap' };
}

/**
 * The hero is floating: a ring of levitation is on (HLevitation || ELevitation) and nothing holds
 * her to the floor. A bear trap or a web blocks it (BLevitation, set by float_vs_flight() while she is
 * stuck in the floor); a pit does not. ref: include/youprop.h Levitation; src/polyself.c
 * float_vs_flight()
 */
export function levitating(ctx: Pick<Ctx, 'state'>): boolean {
  if (!hasProp(getPlayer(ctx.state), P.LEVITATION)) return false;
  const u = utrap(ctx);
  return !u || u.type === 'pit';
}

/**
 * The hero flies: her form flies (no amulet of flying exists), and neither levitation (any
 * source, even blocked) nor being stuck in the floor blocks it (BFlying, float_vs_flight()).
 * ref: include/youprop.h Flying; src/polyself.c float_vs_flight()
 */
export function flying(ctx: Pick<Ctx, 'state'>): boolean {
  const h = getPlayer(ctx.state);
  if (!hasProp(h, P.FLYING) || hasProp(h, P.LEVITATION)) return false;
  const u = utrap(ctx);
  return !u || u.type === 'pit';
}

/** u_locomotion(): "float" while levitating, "fly" while flying, else null (she steps). */
export const uLocomotion = (ctx: Pick<Ctx, 'state'>): 'float' | 'fly' | null =>
  levitating(ctx) ? 'float' : flying(ctx) ? 'fly' : null;

/** Levitation or Flying: she is in the air (the hero side of check_in_air() without hurtling). */
export const uInAir = (ctx: Pick<Ctx, 'state'>): boolean => levitating(ctx) || flying(ctx);

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

// ---------------------------------------------------------------------------------------------
// conjoined pits (ttmp->conjoined): bit `i` of a pit's mask links it to the pit in C's direction
// `i` (xdir[]/ydir[] order: W, NW, N, NE, E, SE, S, SW). Kept on `Trap.data.conjoined` (TrapData
// in trap.ts reads it back); this leaf has the helpers so movement and boulders can use them.

/** ref: src/decl.c xdir[], ydir[] */
export const XDIR = [-1, -1, 0, 1, 1, 1, 0, -1] as const;
export const YDIR = [0, -1, -1, -1, 0, 1, 1, 1] as const;

/** C's direction index of a one-square step, or -1 (DIR_ERR). ref: src/cmd.c xytodir() */
export function xytodir(dx: number, dy: number): number {
  for (let i = 0; i < 8; i++) if (XDIR[i] === dx && YDIR[i] === dy) return i;
  return -1;
}

/** ref: include/hack.h DIR_180() */
export const dir180 = (i: number): number => (i + 4) % 8;

/** The pit's conjoined mask (0 when none). */
export function conjoinedOf(t: Readonly<Trap>): number {
  const d = t.data;
  if (d === null || d === undefined || typeof d !== 'object' || Array.isArray(d)) return 0;
  const v = d['conjoined'];
  return typeof v === 'number' ? v : 0;
}

/** Sets the pit's conjoined mask, keeping its other data (0 drops the field). */
export function setConjoined(t: Trap, mask: number): void {
  const d = t.data;
  const rest: { [k: string]: Json } =
    d !== null && d !== undefined && typeof d === 'object' && !Array.isArray(d) ? { ...d } : {};
  delete rest['conjoined'];
  if (mask !== 0) rest['conjoined'] = mask;
  if (Object.keys(rest).length > 0) t.data = rest;
  else delete t.data;
}

/** Links two pits next to each other both ways: `from`'s bit `dir`, `to`'s bit DIR_180(dir). */
export function joinPits(from: Trap, to: Trap, dir: number): void {
  setConjoined(from, conjoinedOf(from) | (1 << dir));
  setConjoined(to, conjoinedOf(to) | (1 << dir180(dir)));
}

/**
 * Whether `trap2` and `trap1` are next to each other, both pits, and linked both ways; with
 * `uEntering` only while the hero is in a pit. ref: src/trap.c conjoined_pits()
 */
export function conjoinedPits(
  ctx: Pick<Ctx, 'state'>,
  trap2: Readonly<Trap> | null | undefined,
  trap1: Readonly<Trap> | null | undefined,
  uEntering: boolean,
): boolean {
  if (!trap1 || !trap2 || !isPit(trap2.def) || !isPit(trap1.def)) return false;
  if (uEntering && !uInPit(ctx)) return false;
  const diridx = xytodir(Math.sign(trap2.x - trap1.x), Math.sign(trap2.y - trap1.y));
  if (diridx < 0) return false;
  return (
    (conjoinedOf(trap1) & (1 << diridx)) !== 0 && (conjoinedOf(trap2) & (1 << dir180(diridx))) !== 0
  );
}

/**
 * A pit going away (filled, removed, turned into something else) unlinks itself from its
 * neighbours. ref: src/trap.c clear_conjoined_pits() (called by deltrap())
 */
export function clearConjoinedPits(level: Level, trap: Trap | null | undefined): void {
  if (!trap || !isPit(trap.def)) return;
  const mask = conjoinedOf(trap);
  for (let i = 0; i < 8; i++) {
    if ((mask & (1 << i)) === 0) continue;
    const x = trap.x + (XDIR[i] ?? 0);
    const y = trap.y + (YDIR[i] ?? 0);
    const t = inBounds(level, x, y) ? trapAt(level, x, y) : undefined;
    if (t && isPit(t.def)) setConjoined(t, conjoinedOf(t) & ~(1 << dir180(i)));
  }
  setConjoined(trap, 0);
}
