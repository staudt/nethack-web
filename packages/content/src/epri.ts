// The temple priest's memory of his shrine (EPRI) and the questions asked about it. A priest is
// an ordinary monster with an entry in `modData.nh.epri` (keyed by entity id): `ispriest` is
// "has an entry", and forgetMonster() drops it when he dies.
// ref: include/mextra.h struct epri; src/priest.c histemple_at(), inhistemple(), has_shrine(),
// temple_occupied(), findpriest(), p_coaligned(), mon_aligntyp(), priestname()
import {
  cellIndex,
  inRooms,
  sortedIds,
  type Ctx,
  type EntityId,
  type Json,
  type Level,
  type LevelId,
  type Pos,
} from '@nh/core';
import { A_NONE, altarAlign, type Aligntyp } from './aligntyp';
import { uState } from './luck';

/** The temple priest's monster. ref: include/monsters.h PM_ALIGNED_CLERIC */
export const ALIGNED_CLERIC = 'nh:aligned_cleric';

/** The room type of a temple. ref: include/mkroom.h TEMPLE */
export const TEMPLE = 'nh:temple';

/** ref: include/mextra.h struct epri (times are `state.turn` values) */
export interface Epri {
  /** The temple's index in `Level.rooms`. */
  shroom: number;
  shralign: Aligntyp;
  shrpos: Pos;
  shrlevel: LevelId;
  intoneTime: number;
  enterTime: number;
  peacefulTime: number;
  hostileTime: number;
  cheapskate: number;
}

type Table = { [k: string]: Json };
const isObj = (v: Json | undefined): v is Table =>
  v !== null && v !== undefined && typeof v === 'object' && !Array.isArray(v);

function table(ctx: Pick<Ctx, 'state'>, create: boolean): Table | null {
  const md = ctx.state.modData;
  let nh = md['nh'];
  if (!isObj(nh)) {
    if (!create) return null;
    nh = {};
    md['nh'] = nh;
  }
  let t = nh['epri'];
  if (!isObj(t)) {
    if (!create) return null;
    t = {};
    nh['epri'] = t;
  }
  return t;
}

/** The priest's shrine memory, or null for any other monster (ref: mtmp->ispriest). */
export function epriOf(ctx: Pick<Ctx, 'state'>, id: EntityId): Epri | null {
  const e = table(ctx, false)?.[String(id)];
  return isObj(e) ? (e as unknown as Epri) : null;
}

/** Makes monster `id` a temple priest. ref: src/priest.c newepri() */
export function setEpri(ctx: Pick<Ctx, 'state'>, id: EntityId, epri: Epri): void {
  const t = table(ctx, true);
  if (t) t[String(id)] = epri as unknown as Json;
}

/** The first temple among `rooms` (an inRooms() list), or null. ref: priest.c temple_occupied() */
export function templeOccupied(level: Level, rooms: readonly number[]): number | null {
  for (const r of rooms) if (level.rooms[r]?.type === TEMPLE) return r;
  return null;
}

/**
 * x,y on the hero's level is in the priest's own temple. ref: src/priest.c histemple_at()
 * (`EPRI->shroom == *in_rooms(x, y, TEMPLE)` on his shrine level)
 */
export function histempleAt(ctx: Pick<Ctx, 'state'>, epri: Epri, x: number, y: number): boolean {
  if (epri.shrlevel !== ctx.state.currentLevel) return false;
  const level = ctx.state.levels[epri.shrlevel];
  return level !== undefined && templeOccupied(level, inRooms(level, x, y)) === epri.shroom;
}

/**
 * The priest's altar is still a shrine of his alignment. ref: src/priest.c has_shrine()
 * (on his shrine level, which is where it is asked)
 */
export function hasShrine(ctx: Pick<Ctx, 'state'>, epri: Epri): boolean {
  const level = ctx.state.levels[epri.shrlevel];
  if (!level) return false;
  const { x, y } = epri.shrpos;
  const id = level.palette[level.cells[cellIndex(level, x, y)] ?? -1];
  if (id === undefined || altarAlign(id) !== epri.shralign) return false;
  return level.shrines?.some((p) => p.x === x && p.y === y) === true;
}

/** The monster is a priest in his own temple, which still has his shrine. ref: inhistemple() */
export function inhistemple(ctx: Pick<Ctx, 'state'>, id: EntityId): boolean {
  const epri = epriOf(ctx, id);
  const p = ctx.state.entities[String(id)]?.c.pos;
  if (!epri || !p || p.level !== ctx.state.currentLevel) return false;
  return histempleAt(ctx, epri, p.x, p.y) && hasShrine(ctx, epri);
}

/** The living priest of temple `room` on the hero's level, inside it. ref: findpriest() */
export function findpriest(ctx: Pick<Ctx, 'state'>, room: number): EntityId | null {
  for (const id of sortedIds(ctx.state)) {
    const mon = ctx.state.entities[String(id)];
    const p = mon?.c.pos;
    const epri = epriOf(ctx, id);
    if (!mon?.c.monster || !p || !epri || p.level !== ctx.state.currentLevel) continue;
    if (epri.shroom === room && histempleAt(ctx, epri, p.x, p.y)) return id;
  }
  return null;
}

/** The priest's alignment as an aligntyp. ref: src/priest.c mon_aligntyp() for ispriest */
export function monAligntyp(epri: Epri): Aligntyp {
  const a = epri.shralign;
  if (a === A_NONE) return A_NONE;
  return a > 0 ? 1 : a < 0 ? -1 : 0;
}

/** The hero shares the priest's alignment. ref: src/priest.c p_coaligned() */
export function pCoaligned(ctx: Pick<Ctx, 'state'>, epri: Epri): boolean {
  return uState(ctx.state).alignType === monAligntyp(epri);
}

/**
 * "priest of Odin" as a message param (for `{mon|the}`). ref: src/priest.c priestname() (no
 * priestesses: monsters have no gender; no invisible, renegade or high priests)
 */
export function priestName(epri: Epri): string {
  const a = monAligntyp(epri);
  if (a === A_NONE) return '@priest.of.unaligned';
  return a > 0 ? '@priest.of.lawful' : a < 0 ? '@priest.of.chaotic' : '@priest.of.neutral';
}
