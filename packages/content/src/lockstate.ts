// The lock being worked on (gx.xlock), shared by lock picking and the Watch, which stops a hero
// picking a town lock. ref: src/lock.c struct xlock_s, lock_action(), picking_lock();
// src/allmain.c stop_occupation()
import {
  cellIndex,
  type Ctx,
  type DefId,
  type Dir,
  type EntityId,
  type Msg,
  type TerrainDef,
} from '@nh/core';

export const PICKLOCK_ID: DefId = 'nh:picklock';

/** The lock tools. ref: include/objects.h SKELETON_KEY, LOCK_PICK, CREDIT_CARD */
export const KEY = {
  skeleton: 'nh:skeleton_key',
  pick: 'nh:lock_pick',
  card: 'nh:credit_card',
} as const;

/** gx.xlock: the lock being worked on, kept between attempts (ref: src/lock.c struct xlock_s). */
export interface Xlock {
  /** A box on the floor ... */
  box?: EntityId;
  /** ... or a door, with the direction it was approached from (u.dx, u.dy). */
  door?: { level: string; x: number; y: number; dir: Dir };
  chance: number;
  picktyp: string;
  usedtime: number;
  /** #force: prying with a blade or bashing with a blunt weapon (C's picktyp 1 or 0). */
  force?: 'blade' | 'blunt';
}

interface LockData {
  xlock?: Xlock;
}

export function lockData(ctx: Pick<Ctx, 'state'>): LockData {
  const md = ctx.state.modData;
  let d = md['nh'] as unknown as LockData | undefined;
  if (typeof d !== 'object' || d === null) {
    d = {};
    md['nh'] = d as unknown as (typeof md)[string];
  }
  return d;
}

export const xlockOf = (ctx: Pick<Ctx, 'state'>): Xlock | null =>
  (ctx.state.modData['nh'] as unknown as LockData | undefined)?.xlock ?? null;

function doorTerrain(ctx: Ctx, door: NonNullable<Xlock['door']>): TerrainDef | null {
  const level = ctx.state.levels[door.level];
  if (!level || door.x < 0 || door.y < 0 || door.x >= level.width || door.y >= level.height)
    return null;
  const id = level.palette[level.cells[cellIndex(level, door.x, door.y)] ?? 0];
  return id !== undefined ? ctx.defs.terrain(id) : null;
}

/** "unlocking the box", "picking the lock", "locking the door"... ref: src/lock.c lock_action() */
export function lockAction(ctx: Ctx, x: Xlock): Msg {
  // if the target is currently unlocked, we're trying to lock it now
  if (x.door) {
    if (doorTerrain(ctx, x.door)?.door !== 'locked') return { key: 'lock.act.lock_door' };
  } else if (x.box !== undefined) {
    const box = ctx.state.entities[String(x.box)];
    if (box && !box.c.item?.locked)
      return { key: box.def === 'nh:chest' ? 'lock.act.lock_chest' : 'lock.act.lock_box' };
  }
  // otherwise we're trying to unlock it
  if (x.picktyp === KEY.pick || x.picktyp === KEY.card) return { key: 'lock.act.pick' };
  if (x.door) return { key: 'lock.act.unlock_door' };
  if (x.box !== undefined) {
    const box = ctx.state.entities[String(x.box)];
    return { key: box?.def === 'nh:chest' ? 'lock.act.unlock_chest' : 'lock.act.unlock_box' };
  }
  return { key: 'lock.act.pick' };
}

/**
 * The door whose lock the hero is working on as her occupation, or null (boxes do not count).
 * ref: src/lock.c picking_lock(): `go.occupation == picklock`, at u.ux + u.dx, u.uy + u.dy
 */
export function pickingLock(ctx: Ctx): { level: string; x: number; y: number } | null {
  const occ = ctx.state.occupation?.action;
  if (occ?.type !== 'mod' || occ.action !== PICKLOCK_ID) return null;
  const x = xlockOf(ctx);
  if (!x?.door || !x.usedtime) return null;
  return { level: x.door.level, x: x.door.x, y: x.door.y };
}

/** "You stop picking the lock." ref: src/allmain.c stop_occupation() */
export function stopPicking(ctx: Ctx): void {
  const x = xlockOf(ctx);
  if (!x || ctx.state.occupation === null) return;
  ctx.emit({ type: 'msg', key: 'lock.stop', params: { action: lockAction(ctx, x) } });
  ctx.interrupt();
}
