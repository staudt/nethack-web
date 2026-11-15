// Monsters in water and lava: drowning, teleporting out, gremlins multiplying, iron golems
// rusting, burning in lava, eels gasping on land.
// ref: src/mon.c minliquid(), minliquid_core()
//
// Called before every monster move (movemon_singlemon()), once a turn for immobile monsters
// (m_calcdistress()) and wherever a monster is put on a square by force (hurtled, a gulp's
// landing). Not ported: steeds, the Plane of Water (no "above the surface" there), vampire
// shapeshifters reverting in the air, deal_with_overcrowding() (a monster with nowhere to go
// stays where it is), the "You have a sad feeling" for an unseen pet (iflags.sad_feeling).
import { type Ctx, type Entity, type Msg } from '@nh/core';
import { fireDamageChain } from './flooreffects';
import { dryup, setGushMinliquid } from './fountain';
import { experienceFor, gainExperience } from './hero';
import { isLava, isPool, isWaterwall, mInAir } from './liquid';
import { mondead, mondied, monsterDied } from './mondeath';
import { minvent } from './mongear';
import {
  breathlessMon,
  cantDrown,
  isClinger,
  isEel,
  isFloater,
  isFlyer,
  likesLava,
} from './mondata';
import { monflee } from './monflee';
import { setMinliquidHook } from './mstate';
import { monNam } from './perception';
import { cansee, rlocMon } from './trap';
import { teleRestrict } from './teleport';
import { T, terrainIdAt } from './terrain';
import { waterDamageChain } from './water';
import { splitMon } from './clone';
import { uswallow } from './engulfstate';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const alive = (ctx: Ctx, mon: Entity): boolean =>
  ctx.state.entities[String(mon.id)]?.c.monster !== undefined;

/**
 * on_fire()'s wording for a monster dying in lava: "boils away" (water elemental, fog cloud,
 * steam vortex), "melts away" (ice vortex, glass golem), else "burns to a crisp".
 * ref: src/mondata.c on_fire()
 */
function lavaDeathKey(id: string): string {
  if (id === 'nh:water_elemental' || id === 'nh:fog_cloud' || id === 'nh:steam_vortex')
    return 'liquid.mon_boils_away';
  if (id === 'nh:ice_vortex' || id === 'nh:glass_golem') return 'liquid.mon_melts_away';
  return 'liquid.mon_burns_crisp';
}

/**
 * The hero killed it (melted ice under it, displaced it): xkilled(mtmp, XKILL_NOMSG), with
 * experience unless it was life-saved.
 */
function heroKilled(ctx: Ctx, mon: Entity, nocorpse: boolean): void {
  const def = ctx.defs.monster(mon.def);
  const level = mon.c.monster?.level ?? 0;
  monsterDied(ctx, mon.id, true, false, nocorpse);
  if (!alive(ctx, mon)) gainExperience(ctx, ctx.state.playerId, experienceFor(def, level));
}

/** Can teleport at will and is not stopped by the level: `can_teleport() && !tele_restrict()` */
const teleportsAway = (ctx: Ctx, mon: Entity): boolean =>
  ctx.defs.monster(mon.def).flags.includes('tport') && !teleRestrict(ctx, mon);

/**
 * Checks the monster against the water or lava (or fountain) on its square: 1 when it died, else
 * 0. `monMoving` is C's `context.mon_moving` (false: the hero caused it, so a death is hers).
 * ref: src/mon.c minliquid(), minliquid_core()
 */
export function minliquid(ctx: Ctx, mon: Entity, monMoving = true): 0 | 1 {
  const p = mon.c.pos;
  const level = p ? ctx.state.levels[p.level] : undefined;
  if (!p || !level || !mon.c.monster) return 0;
  const { x, y } = p;
  const def = ctx.defs.monster(mon.def);
  const airborne = isFlyer(def) || isFloater(def);
  const waterwall = isWaterwall(ctx, level, x, y);
  // [ceiling clingers are handled below]
  const inpool = isPool(ctx, level, x, y) && !airborne;
  const inlava = isLava(ctx, level, x, y) && !airborne;
  const infountain = terrainIdAt(level, x, y) === T.fountain;
  const seen = cansee(ctx, p.level, x, y);

  // Gremlin multiplying won't go on forever since the hit points keep going down, and when it
  // gets to 1 hit point the clone function will fail.
  if (def.id === 'nh:gremlin' && (inpool || infountain) && ctx.rng.rn2(3)) {
    if (splitMon(ctx, mon.id, monMoving) !== null && level.id === ctx.state.currentLevel)
      dryup(ctx, x, y, false);
    if (inpool) waterDamageChain(ctx, minvent(ctx, mon.id));
    return 0;
  } else if (def.id === 'nh:iron_golem' && inpool && !ctx.rng.rn2(5)) {
    const dam = ctx.rng.d(2, 6);
    if (seen) say(ctx, 'liquid.mon_rusts', { mon: monNam(ctx, mon) });
    const hp = mon.c.hp;
    if (hp) {
      hp.cur -= dam;
      if (hp.max > dam) hp.max -= dam;
      if (hp.cur < 1) {
        mondied(ctx, mon.id);
        if (!alive(ctx, mon)) return 1;
      }
    }
    waterDamageChain(ctx, minvent(ctx, mon.id));
    return 0;
  }

  if (inlava) {
    // Lava effects much as water effects. Lava likers are able to protect their stuff. Fire
    // resistant monsters can only protect themselves --ALI
    if (!isClinger(def) && !likesLava(def)) {
      // not fair...?  hero doesn't automatically teleport away from lava, just from water
      if (teleportsAway(ctx, mon) && rlocMon(ctx, mon, true)) return 0;
      if (!def.resists.includes('fire')) {
        if (seen) say(ctx, lavaDeathKey(def.id), { mon: monNam(ctx, mon) });
        if (monMoving)
          mondead(ctx, mon.id); // no corpse
        else heroKilled(ctx, mon, true);
      } else {
        const hp = mon.c.hp;
        if (hp) hp.cur -= 1;
        if (hp && hp.cur < 1) {
          if (seen) say(ctx, 'liquid.mon_surrenders', { mon: monNam(ctx, mon) });
          mondead(ctx, mon.id); // no corpse
        } else if (seen) say(ctx, 'liquid.mon_burns_slightly', { mon: monNam(ctx, mon) });
      }
      if (alive(ctx, mon)) {
        if (!mInAir(ctx, mon) && !likesLava(def)) {
          const p = mon.c.pos;
          if (p) fireDamageChain(ctx, minvent(ctx, mon.id), false, p.x, p.y);
          rlocMon(ctx, mon, true);
        }
        return 0;
      }
      return 1;
    }
  } else if (inpool || waterwall) {
    // Most monsters drown in pools. flooreffects() will take care of water damage to dead
    // monsters' inventory, but survivors need to be handled here. Swimmers are able to protect
    // their stuff...
    if ((waterwall || !isClinger(def)) && !cantDrown(def)) {
      // like hero with teleport intrinsic or spell, teleport away if possible
      if (teleportsAway(ctx, mon) && rlocMon(ctx, mon, true)) return 0;
      if (seen)
        say(ctx, monMoving ? 'liquid.mon_drowns' : 'liquid.you_drown_mon', {
          mon: monNam(ctx, mon),
        });
      const sw = uswallow(ctx);
      if (sw?.mon === mon.id)
        // This can happen after a purple worm plucks you off a flying steed while you are over
        // water.
        say(ctx, 'liquid.engulfer_sinks', { mon: monNam(ctx, mon) });
      if (monMoving)
        mondied(ctx, mon.id); // ok to leave corpse despite water
      else heroKilled(ctx, mon, false);
      if (alive(ctx, mon)) {
        if (!mInAir(ctx, mon)) {
          waterDamageChain(ctx, minvent(ctx, mon.id));
          rlocMon(ctx, mon, false);
        }
        return 0;
      }
      return 1;
    }
  } else if (isEel(def) && !breathlessMon(def)) {
    // but eels have a difficult time outside; as mhp gets lower, the rate of further loss
    // slows down
    const hp = mon.c.hp;
    if (hp && hp.cur > 1 && ctx.rng.rn2(hp.cur) > ctx.rng.rn2(8)) hp.cur--;
    monflee(ctx, mon.id, 2, false, false);
  }
  return 0;
}

setMinliquidHook((ctx, mon) => minliquid(ctx, mon) === 1);
setGushMinliquid((ctx, mon) => void minliquid(ctx, mon, false));
