// Being swallowed: u.uswallow and u.uswldtim, kept in the content mod's data next to u.ustuck
// (hackmove.ts). A leaf module: hackmove, combat, zap, buzz, dothrow, end, monmove and the
// perception read it; engulf.ts and mhitu.ts write it.
// ref: include/you.h u.uswallow, u.uswldtim; include/monst.h engulfing_u(); src/mon.c set_ustuck()
import type { Ctx, EntityId, MonsterDef } from '@nh/core';

/** The engulfer holding the hero (C's u.ustuck while u.uswallow) and u.uswldtim. */
export interface Uswallow {
  mon: EntityId;
  tim: number;
}

interface EngulfData {
  uswallow?: Uswallow | null;
  ustuck?: EntityId | null;
}

const data = (state: Ctx['state']): EngulfData | undefined => {
  const d = state.modData['nh'] as unknown as EngulfData | undefined;
  return typeof d === 'object' && d !== null ? d : undefined;
};

/**
 * The swallow record, or null when the hero is not swallowed. An engulfer that is gone, no longer
 * holds her (u.ustuck) or is not on her square any more has let go: the record is cleared (C's
 * unstuck() from m_detach() and the other places that release her).
 */
export function uswallow(ctx: Pick<Ctx, 'state'>): Uswallow | null {
  const d = data(ctx.state);
  const sw = d?.uswallow;
  if (!d || !sw) return null;
  if (engulferOf(ctx.state) === null) {
    delete d.uswallow;
    return null;
  }
  return sw;
}

/**
 * The engulfer's id while the hero is swallowed, read only (for the view: perception and
 * status); {@link uswallow} also drops a stale record.
 */
export function engulferOf(state: Readonly<Ctx['state']>): EntityId | null {
  const d = data(state as Ctx['state']);
  const sw = d?.uswallow;
  if (!d || !sw) return null;
  const m = state.entities[String(sw.mon)];
  const mp = m?.c.pos;
  const hp = state.entities[String(state.playerId)]?.c.pos;
  if (
    !m?.c.monster ||
    !mp ||
    !hp ||
    d.ustuck !== sw.mon ||
    mp.level !== hp.level ||
    mp.x !== hp.x ||
    mp.y !== hp.y
  )
    return null;
  return sw.mon;
}

/** u.uswallow */
export const isSwallowed = (ctx: Pick<Ctx, 'state'>): boolean => uswallow(ctx) !== null;

/** ref: include/monst.h engulfing_u(): `u.uswallow && u.ustuck == mon` */
export const engulfingU = (ctx: Pick<Ctx, 'state'>, id: EntityId): boolean =>
  uswallow(ctx)?.mon === id;

/** Sets or clears the swallow record (u.ustuck is set separately, with setUstuck()). */
export function setUswallow(ctx: Pick<Ctx, 'state'>, sw: Uswallow | null): void {
  const md = ctx.state.modData;
  let d = data(ctx.state);
  if (!d) {
    if (!sw) return;
    d = {};
    md['nh'] = d as unknown as (typeof md)[string];
  }
  if (sw) d.uswallow = sw;
  else if (d.uswallow !== undefined) delete d.uswallow;
}

/**
 * gm.mswallower: the monster engulfing the one being damaged, while gulpmm() runs mdamagem()
 * (corpse_chance() wants it: a gas spore exploding inside it). Transient: set and reset within
 * one call, never saved.
 */
let mswallower: EntityId | null = null;
export const mswallowerOf = (): EntityId | null => mswallower;
export function setMswallower(id: EntityId | null): void {
  mswallower = id;
}

/** ref: include/mondata.h is_whirly(): vortices and the air elemental */
export const isWhirly = (def: MonsterDef): boolean =>
  def.glyph.ch === 'v' || def.id === 'nh:air_elemental';

/** ref: include/mondata.h digests(): an engulfing attack that digests (purple worm) */
export const digests = (def: MonsterDef): boolean =>
  def.attacks.some((a) => a.at === 'engulf' && a.ad === 'dgst');

/** ref: include/mondata.h enfolds(): an engulfing attack that wraps (lurker above, trapper) */
export const enfolds = (def: MonsterDef): boolean =>
  def.attacks.some((a) => a.at === 'engulf' && a.ad === 'wrap');

/** ref: include/mondata.h flaming(): fire vortex, flaming sphere, fire elemental, salamander */
export const flaming = (def: MonsterDef): boolean =>
  def.id === 'nh:fire_vortex' ||
  def.id === 'nh:flaming_sphere' ||
  def.id === 'nh:fire_elemental' ||
  def.id === 'nh:salamander';
