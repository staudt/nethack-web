// The end of the hero's hmon() for a thrown object (or a boulder falling into a pit onto a
// monster): pet abuse, damage, the kill or hit message, waking, the Watch and priests.
// ref: src/uhitm.c hmon(), hmon_hitmon()
import type { Ctx, Entity, MonsterDef, Msg } from '@nh/core';
import { hurtPet } from './dog';
import { epriOf } from './epri';
import { experienceFor, gainExperience } from './hero';
import { heroEntity } from './magic';
import { monsterDied } from './mondeath';
import { wakeup } from './peaceful';
import { monNam } from './perception';
import { ghodHitsu } from './priest';
import { silverSearsMon } from './silver';
import { angryGuards, isWatch } from './watch';

/** The ordinal of a volley shot, "the 2nd dagger". ref: src/objnam.c mshot_xname() */
export interface Shot {
  i: number;
  n: number;
}

const msg = (ctx: Ctx, key: string, params?: Record<string, Msg | string | number>): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/** ref: src/zap.c exclam() */
const exclam = (force: number): string => (force < 0 ? '?' : force <= 4 ? '.' : '!');

/** ref: src/include/mondata.h nonliving(): undead and manes (our data has no other cases) */
export const nonliving = (def: MonsterDef): boolean =>
  def.flags.includes('undead') || def.id === 'nh:manes';

/** A message about a missile, with "the 2nd dagger" for a volley. */
export const missileMsg = (
  ctx: Ctx,
  key: string,
  shot: Shot,
  missile: Msg,
  params: Record<string, Msg | string | number>,
): void => {
  if (shot.n > 1) {
    msg(ctx, `${key}_nth`, { ...params, missile, nth: { key: `throw.ord.${shot.i}` } });
  } else msg(ctx, key, { ...params, missile });
};

/**
 * The rest of hmon() once a thrown object hit `mon` for `dmg` (at least 1): a pet is abused,
 * the monster loses the hit points and is killed ("You kill the newt!", experience) or told
 * "The dagger hits the newt." and woken; hitting a peaceful watchman or temple priest angers the
 * Watch, and a priest's god strikes 1 time in 2; `silverObj` sears a silver-hater ("Your silver
 * arrow sears the imp's flesh!"). Also used for a boulder falling on a monster
 * trapped in a pit (do.c flooreffects() calls hmon(HMON_THROWN)).
 * ref: src/uhitm.c hmon(), hmon_hitmon() (pet, damage, hmon_hitmon_msg_hit(), killed())
 */
export function hmonThrownHit(
  ctx: Ctx,
  mon: Entity,
  dmg: number,
  missile: Msg,
  shot: Shot = { i: 1, n: 1 },
  silverObj: Entity | null = null,
): void {
  const m = mon.c.monster;
  if (!m) return;
  const monId = mon.id;
  const mdef = ctx.defs.monster(mon.def);
  const name = monNam(ctx, mon);
  // ref: src/uhitm.c hmon(): hitting a peaceful watchman or temple priest angers the whole Watch
  // afterwards, and hitting a priest (even a killing blow) brings his god's lightning 1 time in 2
  const epri = epriOf(ctx, monId);
  const angerGuards = m.peaceful && (isWatch(mon.def) || epri !== null);
  const hp = mon.c.hp;
  // ref: src/uhitm.c hmon_hitmon_pet(): a pet hit by the hero's missile is abused and flees
  if (m.tame && dmg > 0) {
    const destroyed = !hp || hp.cur - dmg < 1;
    hurtPet(ctx, monId, destroyed ? 0 : 10 * ctx.rng.rnd(dmg), destroyed);
  }
  if (hp) hp.cur -= dmg;
  if (!hp || hp.cur < 1) {
    // ref: hmon_hitmon_msg_silver(): before killed()'s line
    if (silverObj) silverSearsMon(ctx, mon, silverObj);
    // ref: src/mon.c xkilled(): "You kill/destroy <mon>!" then experience()
    msg(ctx, nonliving(mdef) ? 'combat.you_destroy' : 'combat.you_kill', { mon: name });
    monsterDied(ctx, monId, true);
    gainExperience(ctx, heroEntity(ctx).id, experienceFor(mdef, m.level));
  } else {
    // ref: src/uhitm.c hmon_hitmon_msg_hit(): "The dagger hits the newt" + exclam(dmg)
    missileMsg(ctx, exclam(dmg) === '!' ? 'throw.hit_hard' : 'throw.hit', shot, missile, {
      mon: name,
    });
    if (silverObj) silverSearsMon(ctx, mon, silverObj);
    wakeup(ctx, monId); // angers a peaceful (not a pet)
  }
  if (epri && ctx.rng.rn2(2) === 0) ghodHitsu(ctx, epri);
  if (angerGuards) angryGuards(ctx, false);
}
