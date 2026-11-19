// The Riders' low parts: the touch of death (Death's touch and the monster spell), and a Rider's
// corpse reviving when it is handled, low enough for adtyping.ts, mcastu.ts and the pickup, eating,
// offering and tinning code to reach. The Riders themselves are mondata.ts's `isRider()`; their
// corpses' revival times corpses.ts's `riderRevivalTime()`; the revival itself revive.ts's
// `reviveCorpse()`, late-bound here (`setReviveCorpse()`, registered by index.ts: revive.ts sits
// far above these callers).
// ref: src/mcastu.c touch_of_death(); src/pickup.c rider_corpse_revival()
import { getPlayer, type Ctx, type Entity, type Msg } from '@nh/core';
import { done } from './end';
import { losehp } from './hp';
import { isRider } from './mondata';
import { rehumanize, upolyd } from './upoly';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/**
 * The touch of death: 50 + d(8,6) damage and half that off her maximum HP; a polymorphed hero
 * returns to her own form, one whose maximum is no more than the drain dies. "if we get here, we
 * know that hero isn't magic resistant and isn't poly'd into an undead or demon".
 * ref: src/mcastu.c touch_of_death(), death_inflicted_by()
 */
export function touchOfDeath(ctx: Ctx, mon: Entity): void {
  let dmg = 50 + ctx.rng.d(8, 6);
  const drain = Math.trunc(dmg / 2);
  say(ctx, 'mcastu.drained');
  const killer = `@killer.touch_of_death.${mon.def}`;
  const hero = getPlayer(ctx.state);
  const hp = hero.c.hp;
  if (!hp) return;
  if (upolyd(ctx.state)) {
    hp.cur = 0; // u.mh = 0
    rehumanize(ctx); // fatal iff Unchanging
  } else if (drain >= hp.max) {
    done(ctx, killer);
  } else {
    // HP manipulation similar to poisoned(attrib.c)
    const olduhp = hp.cur;
    const uhpmin = Math.max(hero.c.experience?.level ?? 1, 3); // minuhpmax(3)
    hp.max = Math.max(hp.max - drain, uhpmin); // setuhpmax()
    if (hp.cur > hp.max) hp.cur = hp.max;
    // adjuhploss(): reduce pending damage if uhp has already been reduced due to drop in uhpmax
    if (hp.cur < olduhp) dmg -= olduhp - hp.cur;
    losehp(ctx, Math.max(dmg, 1), killer);
  }
}

/** revive.ts's reviveCorpse(): true when the corpse rose (it is gone). */
export type ReviveCorpseFn = (ctx: Ctx, body: Entity) => boolean;
let reviveCorpseFn: ReviveCorpseFn | null = null;
export function setReviveCorpse(fn: ReviveCorpseFn): void {
  reviveCorpseFn = fn;
}

/** C's revive_corpse() from below revive.ts. */
export function reviveCorpseLate(ctx: Ctx, body: Entity): boolean {
  if (!reviveCorpseFn) throw new Error('rider.ts: revive.ts has not registered revive_corpse()');
  return reviveCorpseFn(ctx, body);
}

/** A Rider's corpse (C's `obj->otyp == CORPSE && is_rider(&mons[obj->corpsenm])`). */
export const isRiderCorpse = (obj: Readonly<Entity> | null | undefined): boolean =>
  !!obj && obj.def === 'nh:corpse' && isRider(obj.c.item?.corpseOf);

/**
 * Handling a Rider's corpse makes it revive: "At your touch, the corpse suddenly moves..."
 * ("At your attempted acquisition, ..." from afar). False when it is no Rider's corpse.
 * ref: src/pickup.c rider_corpse_revival() (no exercise())
 */
export function riderCorpseRevival(ctx: Ctx, obj: Entity | null, remotely: boolean): boolean {
  if (!obj || !isRiderCorpse(obj)) return false;
  say(ctx, remotely ? 'revive.rider_acquisition' : 'revive.rider_touch');
  reviveCorpseLate(ctx, obj);
  return true;
}
