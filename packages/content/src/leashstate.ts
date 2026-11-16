// Which leash holds which pet. ref: include/obj.h obj->leashmon, include/monst.h mtmp->mleashed;
// src/apply.c number_leashed(), get_mleash(), o_unleash(), m_unleash(), unleash_all()
//
// Near a leaf (core and gender.ts). The core components have no such fields, so the content mod keeps
// `modData.nh.leash: { [leashItemId]: monsterId }`; a monster is leashed (mleashed) when a leash
// names it. Only the hero's leashes are ever attached, and the table is created on write.
import { type Ctx, type Entity, type EntityId, type Json, type Msg } from '@nh/core';
import { monGender } from './gender';

export const LEASH = 'nh:leash';

/** Two leashes at most. ref: src/apply.c MAXLEASHED */
export const MAXLEASHED = 2;

type Table = { [k: string]: Json };

const isObj = (v: unknown): v is Table => v !== null && typeof v === 'object' && !Array.isArray(v);

function table(ctx: Pick<Ctx, 'state'>, create: boolean): Table | null {
  const md = ctx.state.modData;
  let r = md['nh'];
  if (!isObj(r)) {
    if (!create) return null;
    r = {};
    md['nh'] = r;
  }
  let t = r['leash'];
  if (!isObj(t)) {
    if (!create) return null;
    t = {};
    r['leash'] = t;
  }
  return t;
}

/** The monster this leash is attached to (obj->leashmon), or null. */
export function leashMon(ctx: Pick<Ctx, 'state'>, leashId: EntityId): EntityId | null {
  const v = table(ctx, false)?.[String(leashId)];
  return typeof v === 'number' ? v : null;
}

/** The leashes in use, sorted by leash id: [leash, monster]. */
export function leashesInUse(ctx: Pick<Ctx, 'state'>): [EntityId, EntityId][] {
  const t = table(ctx, false);
  if (!t) return [];
  return Object.keys(t)
    .map((k) => [Number(k), t[k]] as const)
    .filter((p): p is readonly [number, number] => typeof p[1] === 'number')
    .map(([l, m]) => [l, m] as [EntityId, EntityId])
    .sort((a, b) => a[0] - b[0]);
}

/** The leash attached to this monster, or null. ref: src/apply.c get_mleash() */
export function getMleash(ctx: Pick<Ctx, 'state'>, monId: EntityId): EntityId | null {
  for (const [l, m] of leashesInUse(ctx)) if (m === monId) return l;
  return null;
}

/** mtmp->mleashed */
export const mleashed = (ctx: Pick<Ctx, 'state'>, monId: EntityId): boolean =>
  getMleash(ctx, monId) !== null;

/** The hero's leashes in use. ref: src/apply.c number_leashed() */
export const numberLeashed = (ctx: Pick<Ctx, 'state'>): number => leashesInUse(ctx).length;

/** Attaches the leash to the monster. */
export function setLeash(ctx: Pick<Ctx, 'state'>, leashId: EntityId, monId: EntityId): void {
  const t = table(ctx, true);
  if (t) t[String(leashId)] = monId;
}

/** The leash comes off whatever it held (it is about to be destroyed or stolen). ref: o_unleash() */
export function oUnleash(ctx: Pick<Ctx, 'state'>, leashId: EntityId): void {
  const t = table(ctx, false);
  if (t) delete t[String(leashId)];
}

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/**
 * The monster is about to die or become untame: its leash comes off; with `feedback`, "The
 * kitten pulls free of its leash!" when she sees it, else "Your leash falls slack."
 * `seen` and `name` are canseemon() and Monnam() (the caller's perception helpers).
 * ref: src/apply.c m_unleash()
 */
export function mUnleash(
  ctx: Ctx,
  mon: Entity,
  feedback: false | { seen: boolean; name: string },
): void {
  if (feedback) {
    if (feedback.seen) say(ctx, 'leash.pulls_free', { mon: feedback.name, his: hisOf(ctx, mon) });
    else say(ctx, 'leash.falls_slack');
  }
  const l = getMleash(ctx, mon.id);
  if (l !== null) oUnleash(ctx, l);
}

/** mhis(): "his", "her" or "its" as a message param. ref: include/extern.h mhis() */
export function hisOf(ctx: Pick<Ctx, 'state' | 'defs'>, mon: Entity): string {
  return ['@pronoun.his', '@pronoun.her', '@pronoun.its'][monGender(ctx, mon)] ?? '@pronoun.its';
}

/** Every leash comes off (the hero is about to die, for bones). ref: src/apply.c unleash_all() */
export function unleashAll(ctx: Pick<Ctx, 'state'>): void {
  const r = ctx.state.modData['nh'];
  if (isObj(r)) delete r['leash'];
}

type CheckLeash = (ctx: Ctx, x: number, y: number) => void;
/** leash.ts's checkLeash() (it sits above the movement code that calls it) */
let checkLeashFn: CheckLeash | null = null;
export function setCheckLeash(fn: CheckLeash): void {
  checkLeashFn = fn;
}

/** The hero moved from (x, y): her leashed pets pull. ref: src/hack.c domove() check_leash() */
export function checkLeashFrom(ctx: Ctx, x: number, y: number): void {
  if (checkLeashFn && leashesInUse(ctx).length > 0) checkLeashFn(ctx, x, y);
}
