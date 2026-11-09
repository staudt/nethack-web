// Long worm tails: the records that tie each tail segment to its worm, and the creature-at-a-cell
// lookup that treats a tail square as the worm (C's m_at() on a segment returns the worm). A leaf
// over core so that combat, zap, throwing, kicking, perception and the monster loops share it.
//
// Each visible segment is an entity of def `nh:long_worm_tail` with a position and nothing else (no
// `monster`, `actor` or `hp` component): core draws it and keeps creatures off its square like
// any creature, while content's monster loops (which look for `c.monster`) never see it. A worm
// with a worm number (C's `wormno != 0`) has a record `modData.nh.worms[headId] = { segs,
// wgrowtime }`, `segs` from the tail end to the segment next to the head (C's wtails..wheads, minus
// the hidden segment under the head), and `modData.nh.wormTail[segId] = headId`.
// ref: src/worm.c (struct wseg, wheads[], wtails[], wgrowtime[]), include/mondata.h is_longworm()
import type { Ctx, DefId, Entity, EntityId, GameState, Json, LevelId } from '@nh/core';
import { sortedIds } from '@nh/core';

export const LONG_WORM: DefId = 'nh:long_worm';
export const WORM_TAIL: DefId = 'nh:long_worm_tail';
/** ref: src/worm.c MAX_NUM_WORMS: worm numbers 1..31 on a level */
export const MAX_NUM_WORMS = 32;

/** modData.nh.worms[headId] */
export interface WormRec {
  segs: EntityId[];
  wgrowtime: number;
}

type Table = { [k: string]: Json };
const isObj = (v: unknown): v is Table => v !== null && typeof v === 'object' && !Array.isArray(v);

function table(
  state: Readonly<GameState>,
  key: 'worms' | 'wormTail' | 'wormMigr',
  create: boolean,
): Table | null {
  const md = state.modData;
  let root = md['nh'];
  if (!isObj(root)) {
    if (!create) return null;
    root = {};
    md['nh'] = root;
  }
  let t = root[key];
  if (!isObj(t)) {
    if (!create) return null;
    t = {};
    root[key] = t;
  }
  return t;
}

/** A tail segment entity. */
export const isWormTail = (e: Readonly<Entity> | undefined): boolean => e?.def === WORM_TAIL;

/** The worm's record (its `wormno` is set), or null. */
export function wormRec(state: Readonly<GameState>, id: EntityId): WormRec | null {
  const v = table(state, 'worms', false)?.[String(id)];
  if (!isObj(v) || !Array.isArray(v['segs']) || typeof v['wgrowtime'] !== 'number') return null;
  return {
    segs: v['segs'].filter((s): s is number => typeof s === 'number'),
    wgrowtime: v['wgrowtime'],
  };
}

/** Stores (or with null drops) the worm's record and the segments' back links. */
export function setWormRec(ctx: Pick<Ctx, 'state'>, id: EntityId, rec: WormRec | null): void {
  const old = wormRec(ctx.state, id);
  const back = table(ctx.state, 'wormTail', rec !== null);
  if (old && back) for (const s of old.segs) delete back[String(s)];
  if (rec === null) {
    const t = table(ctx.state, 'worms', false);
    if (t) delete t[String(id)];
    return;
  }
  const t = table(ctx.state, 'worms', true);
  if (t) t[String(id)] = { segs: [...rec.segs], wgrowtime: rec.wgrowtime };
  if (back) for (const s of rec.segs) back[String(s)] = id;
}

/** The worm a tail segment belongs to, or null. */
export function tailOwner(state: Readonly<GameState>, seg: EntityId): EntityId | null {
  const v = table(state, 'wormTail', false)?.[String(seg)];
  return typeof v === 'number' ? v : null;
}

/** Some worm anywhere has a worm number (a quick test before scanning for segments). */
export function anyWormTails(state: Readonly<GameState>): boolean {
  const t = table(state, 'wormTail', false);
  return !!t && Object.keys(t).length > 0;
}

/** A tail segment's worm, else `id` itself. ref: m_at() on a worm segment */
export function wormHead(ctx: Pick<Ctx, 'state'>, id: EntityId): EntityId {
  return tailOwner(ctx.state, id) ?? id;
}

/** The entity that stands for `e`: its worm for a tail segment, else `e`. */
export function wormHeadEntity(state: Readonly<GameState>, e: Entity): Entity {
  if (!isWormTail(e)) return e;
  const h = tailOwner(state, e.id);
  return (h === null ? undefined : state.entities[String(h)]) ?? e;
}

/**
 * The monster at (x, y) of `level`: a monster standing there, or the worm whose tail segment is
 * there. ref: src/mon.c m_at() (level.monsters[][] holds the worm on each of its segments)
 */
export function mAt(
  state: Readonly<GameState>,
  level: LevelId,
  x: number,
  y: number,
): Entity | null {
  for (const id of sortedIds(state as GameState)) {
    const e = state.entities[String(id)];
    const p = e?.c.pos;
    if (!e || !p || p.level !== level || p.x !== x || p.y !== y) continue;
    if (e.c.monster) return e;
    if (isWormTail(e)) {
      const h = tailOwner(state, e.id);
      const head = h === null ? undefined : state.entities[String(h)];
      if (head?.c.monster) return head;
    }
  }
  return null;
}

/** A tail segment of a live worm stands at (x, y) of `level`. */
export function wormTailAt(
  state: Readonly<GameState>,
  level: LevelId,
  x: number,
  y: number,
): boolean {
  const m = mAt(state, level, x, y);
  const p = m?.c.pos;
  return !!p && (p.x !== x || p.y !== y);
}

/** ref: src/worm.c count_wsegs(): the segments behind the head (0 without a worm number) */
export function countWsegs(state: Readonly<GameState>, id: EntityId): number {
  return wormRec(state, id)?.segs.length ?? 0;
}

/**
 * Every tail segment goes and the worm loses its worm number (it stays a long worm but no longer
 * grows or shrinks). ref: src/worm.c wormgone() (the head stays where it is: callers that take
 * it off the map do so themselves)
 */
export function wormgone(ctx: Pick<Ctx, 'state' | 'remove'>, id: EntityId): void {
  const rec = wormRec(ctx.state, id);
  if (!rec) return;
  setWormRec(ctx, id, null);
  for (const s of rec.segs) if (ctx.state.entities[String(s)]) ctx.remove(s);
}

/**
 * Whether another worm on `level` may get a worm number. ref: src/worm.c get_wormno() (numbers
 * 1..MAX_NUM_WORMS-1; "level infested with worms" otherwise)
 */
export function wormnoFree(state: Readonly<GameState>, level: LevelId): boolean {
  const t = table(state, 'worms', false);
  if (!t) return true;
  let n = 0;
  for (const k of Object.keys(t).sort()) if (state.entities[k]?.c.pos?.level === level) n++;
  return n < MAX_NUM_WORMS - 1;
}

/** Records of worms that no longer exist (removed by a path that did not call wormgone()). */
export function strayWorms(state: Readonly<GameState>): EntityId[] {
  const t = table(state, 'worms', false);
  if (!t) return [];
  return Object.keys(t)
    .sort((a, b) => Number(a) - Number(b))
    .filter((k) => !state.entities[k]?.c.monster)
    .map(Number);
}

/**
 * A long worm leaving its level (migrate_to_level()) drops its tail, and the number of segments
 * is kept until it arrives (C overloads `wormno` with it while the monster migrates).
 * ref: src/dog.c migrate_to_level() (`mtmp->wormno = num_segs`)
 */
export function wormMigrate(ctx: Pick<Ctx, 'state' | 'remove'>, id: EntityId): void {
  const rec = wormRec(ctx.state, id);
  if (!rec) return;
  const n = Math.min(rec.segs.length, MAX_NUM_WORMS - 1);
  wormgone(ctx, id);
  const t = table(ctx.state, 'wormMigr', true);
  if (t) t[String(id)] = n;
}

/** The segments a migrating worm had (and forgets them), or null for none. */
export function takeWormMigr(state: Readonly<GameState>, id: EntityId): number | null {
  const t = table(state, 'wormMigr', false);
  const v = t?.[String(id)];
  if (t) delete t[String(id)];
  return typeof v === 'number' ? v : null;
}
