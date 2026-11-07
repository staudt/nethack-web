// Trapped boxes and doors: which boxes are trapped (obj->otrapped) and known to be (obj->tknown),
// and which doors are booby-trapped (doormask D_TRAPPED). The core item and terrain have no such
// fields, so they live in `modData.nh` by item id and by level and cell index (a leaf module:
// items.ts, objnam.ts and the door code read it).
// ref: include/obj.h otrapped, tknown; include/rm.h D_TRAPPED; src/mkobj.c mksobj_init();
// src/mklev.c dosdoor(); src/sp_lev.c create_door()
import {
  cellIndex,
  type Ctx,
  type DefId,
  type EntityId,
  type GameState,
  type Level,
  type LevelId,
  type Registry,
} from '@nh/core';
import { isSdoorId } from './terrain';

interface BtrapData {
  /** Trapped boxes, by item id (obj->otrapped). */
  otrapped?: Record<string, true>;
  /** Boxes whose trap state the hero knows, by item id (obj->tknown). */
  tknown?: Record<string, true>;
  /** Booby-trapped doors, by level: sorted cell indices (doormask & D_TRAPPED). */
  doorTraps?: Record<string, number[]>;
}

const read = (state: Readonly<GameState>): BtrapData | undefined =>
  state.modData['nh'] as unknown as BtrapData | undefined;

function data(ctx: Pick<Ctx, 'state'>): BtrapData {
  const md = ctx.state.modData;
  let d = md['nh'] as unknown as BtrapData | undefined;
  if (typeof d !== 'object' || d === null) {
    d = {};
    md['nh'] = d as unknown as (typeof md)[string];
  }
  return d;
}

function setFlag(
  ctx: Pick<Ctx, 'state'>,
  flag: 'otrapped' | 'tknown',
  id: EntityId,
  on: boolean,
): void {
  const d = data(ctx);
  if (on) (d[flag] ??= {})[String(id)] = true;
  else if (d[flag]) {
    delete d[flag][String(id)];
    if (Object.keys(d[flag]).length === 0) delete d[flag];
  }
}

/** obj->otrapped */
export const isBoxTrapped = (state: Readonly<GameState>, id: EntityId): boolean =>
  read(state)?.otrapped?.[String(id)] === true;

/** Sets or clears obj->otrapped. */
export const setBoxTrapped = (ctx: Pick<Ctx, 'state'>, id: EntityId, on: boolean): void =>
  setFlag(ctx, 'otrapped', id, on);

/** obj->tknown */
export const boxTknown = (state: Readonly<GameState>, id: EntityId): boolean =>
  read(state)?.tknown?.[String(id)] === true;

/** Sets or clears obj->tknown. */
export const setBoxTknown = (ctx: Pick<Ctx, 'state'>, id: EntityId, on: boolean): void =>
  setFlag(ctx, 'tknown', id, on);

/** Drops the records of boxes that no longer exist. */
export function pruneBoxTraps(ctx: Pick<Ctx, 'state'>): void {
  const d = read(ctx.state);
  if (!d) return;
  for (const flag of ['otrapped', 'tknown'] as const) {
    const t = d[flag];
    if (!t) continue;
    for (const k of Object.keys(t).sort()) if (!ctx.state.entities[k]) delete t[k];
    if (Object.keys(t).length === 0) delete d[flag];
  }
}

// ---------------------------------------------------------------------------------------------
// doors

/** A door that can hold a trap: closed, locked or secret (open doors and doorways never do). */
function canBeTrapped(defs: Registry, level: Readonly<Level>, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= level.width || y >= level.height) return false;
  const id: DefId | undefined = level.palette[level.cells[cellIndex(level, x, y)] ?? 0];
  if (id === undefined || !defs.hasTerrain(id)) return false;
  if (isSdoorId(id)) return true;
  const door = defs.terrain(id).door;
  return door === 'closed' || door === 'locked';
}

/**
 * Whether the door at x,y is booby-trapped (doormask & D_TRAPPED). A door that is no longer
 * closed, locked or secret has lost its trap (opening a trapped door always sets it off).
 */
export function doorTrapped(
  ctx: Pick<Ctx, 'state' | 'defs'>,
  levelId: LevelId,
  x: number,
  y: number,
): boolean {
  const level = ctx.state.levels[levelId];
  if (!level) return false;
  const list = read(ctx.state)?.doorTraps?.[levelId];
  if (!list?.includes(cellIndex(level, x, y))) return false;
  return canBeTrapped(ctx.defs, level, x, y);
}

/** Sets or clears D_TRAPPED on the door at x,y. */
export function setDoorTrapped(
  ctx: Pick<Ctx, 'state'>,
  levelId: LevelId,
  x: number,
  y: number,
  on: boolean,
): void {
  const level = ctx.state.levels[levelId];
  if (!level) return;
  const i = cellIndex(level, x, y);
  const d = data(ctx);
  const list = d.doorTraps?.[levelId] ?? [];
  const has = list.includes(i);
  if (on === has) return;
  const next = on ? [...list, i].sort((a, b) => a - b) : list.filter((c) => c !== i);
  if (next.length > 0) (d.doorTraps ??= {})[levelId] = next;
  else if (d.doorTraps) {
    delete d.doorTraps[levelId];
    if (Object.keys(d.doorTraps).length === 0) delete d.doorTraps;
  }
}

/**
 * Forgets the traps of the doors on `level` that are no longer closed, locked or secret (a door
 * opened, broken or dug out by a path that did not set its trap off).
 */
export function pruneDoorTraps(ctx: Pick<Ctx, 'state' | 'defs'>, level: Readonly<Level>): void {
  const list = read(ctx.state)?.doorTraps?.[level.id];
  if (!list) return;
  for (const i of list) {
    const x = i % level.width;
    const y = Math.floor(i / level.width);
    if (!canBeTrapped(ctx.defs, level, x, y)) setDoorTrapped(ctx, level.id, x, y, false);
  }
}
