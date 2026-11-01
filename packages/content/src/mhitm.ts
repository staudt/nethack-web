// Monster-vs-monster melee. ref: src/mhitm.c mattackm(), hitmm(), missmm(), mdamagem(),
// passivemm(), noises(); src/uhitm.c mhitm_ad_*() (the mdef-is-a-monster branches);
// src/mon.c monkilled(), mondied(); src/makemon.c grow_up()
//
// Ported damage types: phys (with the wielded weapon), fire, cold, elec, sleep, poison
// (drst/drdx/drco), acid, stun and paralysis; any other type does plain damage. Passive
// responses: acid, paralysis (floating eye), cold, stun, fire and elec. Not ported: engulfing,
// hugs, gazes, breath, spit and explosions (mattackm skips those attack types), item damage
// (destroy_items, erosion), shades, silver, cloning puddings, petrification.
import {
  getPlayer,
  type AttackDef,
  type Ctx,
  type Entity,
  type EntityId,
  type Msg,
} from '@nh/core';
import { dmgval, hitval, nonliving } from './combat';
import { xkilledCorpse } from './corpses';
import { magicNegation } from './mhitu';
import { forgetMonster, monWep, monWieldItem, relobj } from './mongear';
import { paralyzeMonst, forgetMState, isFrozen, setMStunned, isMStunned } from './mstate';
import { canSpotMon, monNam } from './perception';
import { findMac } from './stats';
import { nhData } from './items';
import { xnameOf } from './objnam';

/** ref: include/mhitm.h M_ATTK_* */
export const M_ATTK = { MISS: 0, HIT: 1, DEF_DIED: 2, AGR_DIED: 4, AGR_DONE: 8 } as const;

/** The melee attack types mattackm() rolls to hit with. */
const MELEE_AT = new Set<AttackDef['at']>([
  'weapon',
  'claw',
  'kick',
  'bite',
  'sting',
  'touch',
  'butt',
  'tentacle',
]);

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const ent = (ctx: Ctx, id: EntityId): Entity | undefined => ctx.state.entities[String(id)];
const alive = (ctx: Ctx, id: EntityId): boolean => ent(ctx, id)?.c.monster !== undefined;

const distmin = (a: Entity, b: Entity): number => {
  const p = a.c.pos;
  const q = b.c.pos;
  if (!p || !q || p.level !== q.level) return Infinity;
  return Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y));
};

/** ref: include/mondata.h helpless(): asleep or paralyzed */
const helpless = (ctx: Ctx, id: EntityId): boolean =>
  ent(ctx, id)?.c.monster?.asleep === true || isFrozen(ctx, id);

const resists = (ctx: Ctx, mon: Entity, mr: string): boolean =>
  ctx.defs.monster(mon.def).resists.includes(mr);

/**
 * "You hear some noises." for fights the hero cannot see, at most every 10 turns unless the
 * distance changes. ref: src/mhitm.c noises() (the hero is never Deaf here)
 */
function noises(ctx: Ctx, magr: Entity): void {
  const hp = getPlayer(ctx.state).c.pos;
  const p = magr.c.pos;
  if (!hp || !p) return;
  const far = (p.x - hp.x) ** 2 + (p.y - hp.y) ** 2 > 15;
  const d = nhData(ctx) as unknown as { noise?: { far: boolean; time: number } };
  const n = d.noise ?? { far: false, time: -1000 };
  if (far !== n.far || ctx.state.turn - n.time > 10) {
    d.noise = { far, time: ctx.state.turn };
    say(ctx, far ? 'mhitm.noises_far' : 'mhitm.noises');
  }
}

/**
 * The monster dies by another monster's hand (or a monster's missile): "The X is killed!" when
 * the hero sees its square, a sad feeling for an unseen pet; its things drop and a corpse may
 * be left (no treasure drop, no experience). ref: src/mon.c monkilled() -> mondied()
 */
export function monkilled(ctx: Ctx, id: EntityId, fltxt: boolean): void {
  const mon = ent(ctx, id);
  if (!mon?.c.monster) return;
  const def = ctx.defs.monster(mon.def);
  if (fltxt && canSpotMon(ctx, mon))
    say(ctx, nonliving(def) ? 'mhitm.is_destroyed' : 'mhitm.is_killed', { mon: monNam(ctx, mon) });
  else if ((mon.c.monster.tame ?? 0) > 0) say(ctx, 'mhitm.sad_feeling');
  mondied(ctx, id);
}

/** ref: src/mon.c mondied(): mondead() and maybe a corpse */
export function mondied(ctx: Ctx, id: EntityId): void {
  const mon = ent(ctx, id);
  if (!mon?.c.monster) return;
  const def = ctx.defs.monster(mon.def);
  const at = mon.c.pos ? { ...mon.c.pos } : undefined;
  relobj(ctx, id, at);
  forgetMonster(ctx, id);
  forgetMState(ctx, id);
  ctx.remove(id);
  if (at) xkilledCorpse(ctx, def, at);
}

/**
 * ref: src/makemon.c little_to_big(): the grown-up form, from the defs' `grows into` table.
 * Only the domestic animals grow up here.
 */
export const GROWS_INTO: Readonly<Record<string, string>> = {
  'nh:kitten': 'nh:housecat',
  'nh:housecat': 'nh:large_cat',
  'nh:little_dog': 'nh:dog',
  'nh:dog': 'nh:large_dog',
};

/**
 * A monster that killed `victim` gains hit points and maybe a level, growing into its bigger
 * form ("The kitten grows up into a housecat."). Returns false if it died (never here).
 * ref: src/makemon.c grow_up() (with a victim; golems and elementals are not special here)
 */
export function growUp(ctx: Ctx, id: EntityId, victimLevel: number): boolean {
  const mon = ent(ctx, id);
  const m = mon?.c.monster;
  const hp = mon?.c.hp;
  if (!mon || !m || !hp) return false;
  const oldDef = ctx.defs.monster(mon.def);
  const newType = GROWS_INTO[mon.def];
  const newDef =
    newType && ctx.defs.isMonster(newType as never) ? ctx.defs.monster(newType as never) : oldDef;
  const hpThreshold = m.level ? m.level * 8 : 4;
  let levLimit = Math.trunc((3 * oldDef.level) / 2);
  if (newDef !== oldDef && newDef.level > levLimit) levLimit = newDef.level;
  let maxIncrease = ctx.rng.rnd(victimLevel + 1);
  if (hp.max + maxIncrease > hpThreshold + 1) maxIncrease = Math.max(hpThreshold + 1 - hp.max, 0);
  const curIncrease = maxIncrease > 1 ? ctx.rng.rn2(maxIncrease) : 0;
  hp.max += maxIncrease;
  hp.cur += curIncrease;
  if (hp.max <= hpThreshold) return true;
  if (levLimit < 5) levLimit = 5;
  else if (levLimit > 49) levLimit = oldDef.level > 49 ? 50 : 49;
  m.level++;
  if (m.level >= newDef.level && newDef !== oldDef) {
    if (canSpotMon(ctx, mon)) {
      const name = monNam(ctx, mon);
      mon.def = newDef.id;
      say(ctx, 'mhitm.grows_up', { mon: name, into: `@${newDef.id}` });
    } else mon.def = newDef.id;
    levLimit = m.level;
  }
  if (m.level > levLimit) {
    m.level--;
    if (hp.max === hpThreshold + 1) hp.max--;
  }
  if (hp.max > 50 * 8) hp.max = 50 * 8;
  if (hp.cur > hp.max) hp.cur = hp.max;
  return true;
}

/** ref: mhitm_mgc_atk_negated() with magic_negation(mdef): always rolls rn2(10) */
function negated(ctx: Ctx, mdef: Entity, vis: boolean): boolean {
  const neg = !(ctx.rng.rn2(10) >= 3 * magicNegation(ctx, mdef.id));
  if (neg && vis && canSpotMon(ctx, mdef))
    say(ctx, 'mhitm.avoids_harm', { mon: monNam(ctx, mdef) });
  return neg;
}

/** ref: src/mhitm.c sleep_monst() (no resist() roll: how = -1) */
function sleepMonst(ctx: Ctx, mdef: Entity, amt: number): boolean {
  if (resists(ctx, mdef, 'sleep')) return false;
  if (isFrozen(ctx, mdef.id)) return false;
  paralyzeMonst(ctx, mdef.id, amt);
  return true;
}

/** The damage type's effect on a monster; returns the damage. ref: src/uhitm.c mhitm_adtyping() */
function adtyping(
  ctx: Ctx,
  magr: Entity,
  atk: AttackDef,
  mdef: Entity,
  mwep: Entity | null,
  damage: number,
  vis: boolean,
): number {
  const mdefName = (): string => monNam(ctx, mdef);
  const seen = vis && canSpotMon(ctx, mdef);
  const phys = (dmg: number): number => {
    // ref: mhitm_ad_phys() mhitm: a kick against a thick-skinned monster does nothing; a weapon
    // (on AT_WEAP or AT_CLAW) adds dmgval()
    const pd = ctx.defs.monster(mdef.def);
    if (atk.at === 'kick' && pd.flags.includes('thick_hide')) return 0;
    if (mwep && (atk.at === 'weapon' || atk.at === 'claw')) {
      dmg += dmgval(ctx.rng, mwep, ctx.defs.object(mwep.def), pd);
      if (dmg < 1) dmg = 1;
    }
    return dmg;
  };
  switch (atk.ad) {
    case 'fire':
      if (negated(ctx, mdef, vis)) return 0;
      if (seen) say(ctx, 'mhitm.on_fire', { mon: mdefName() });
      if (resists(ctx, mdef, 'fire')) {
        if (seen) say(ctx, 'mhitm.fire_no_burn', { mon: mdefName() });
        return 0;
      }
      return damage;
    case 'cold':
      if (negated(ctx, mdef, vis)) return 0;
      if (seen) say(ctx, 'mhitm.frost', { mon: mdefName() });
      if (resists(ctx, mdef, 'cold')) {
        if (seen) say(ctx, 'mhitm.frost_no_chill', { mon: mdefName() });
        return 0;
      }
      return damage;
    case 'elec':
      if (negated(ctx, mdef, vis)) return 0;
      if (seen) say(ctx, 'mhitm.zapped', { mon: mdefName() });
      if (resists(ctx, mdef, 'elec')) {
        if (seen) say(ctx, 'mhitm.zap_no_shock', { mon: mdefName() });
        return 0;
      }
      return damage;
    case 'slee':
      // ref: mhitm_ad_slee(): `sleep_monst(rnd(10)) && sleep_monst(rnd(10))`. As in NetHack the
      // second call fails (the target can no longer move), so it sleeps without the message.
      if (
        !mdef.c.monster?.asleep &&
        sleepMonst(ctx, mdef, ctx.rng.rnd(10)) &&
        sleepMonst(ctx, mdef, ctx.rng.rnd(10))
      ) {
        if (vis && canSpotMon(ctx, mdef))
          say(ctx, 'mhitm.put_to_sleep', { mon: mdefName(), by: monNam(ctx, magr) });
      }
      return damage;
    case 'drst':
    case 'drdx':
    case 'drco': {
      // ref: mhitm_ad_drst(): `!negated && !rn2(8)` -> mhitm_really_poison()
      const neg = negated(ctx, mdef, false);
      if (!neg && ctx.rng.rn2(8) === 0) {
        if (vis && canSpotMon(ctx, magr))
          say(ctx, 'mhitm.was_poisoned', { mon: monNam(ctx, magr) });
        if (resists(ctx, mdef, 'poison')) {
          if (vis && canSpotMon(ctx, mdef) && canSpotMon(ctx, magr))
            say(ctx, 'mhitm.poison_no_effect', { mon: mdefName() });
        } else {
          damage += ctx.rng.rn2(10) + 6; // rn1(10, 6)
          if (damage >= (mdef.c.hp?.cur ?? 0) && vis && canSpotMon(ctx, mdef))
            say(ctx, 'mhitm.poison_deadly');
        }
      }
      return damage;
    }
    case 'acid':
      if (resists(ctx, mdef, 'acid')) {
        if (seen) say(ctx, 'mhitm.acid_harmless', { mon: mdefName() });
        damage = 0;
      } else if (seen) {
        say(ctx, 'mhitm.acid', { mon: mdefName() });
        say(ctx, 'mhitm.acid_burns', { mon: mdefName() });
      }
      ctx.rng.rn2(30); // `!rn2(30)` erode_armor(): not ported
      ctx.rng.rn2(6); // `!rn2(6)` acid_damage(): not ported
      return damage;
    case 'stun':
      if (canSpotMon(ctx, mdef)) say(ctx, 'mhitm.staggers', { mon: mdefName() });
      setMStunned(ctx, mdef.id, true);
      return phys(damage);
    case 'plys':
      if (!isFrozen(ctx, mdef.id) && ctx.rng.rn2(3) === 0 && !negated(ctx, mdef, vis)) {
        if (vis && canSpotMon(ctx, mdef))
          say(ctx, 'mhitm.frozen_by', { mon: mdefName(), by: monNam(ctx, magr) });
        paralyzeMonst(ctx, mdef.id, ctx.rng.rnd(10));
      }
      return damage;
    default:
      return phys(damage);
  }
}

/** ref: src/mhitm.c mdamagem(): damage, death and growing up */
function mdamagem(
  ctx: Ctx,
  magr: Entity,
  mdef: Entity,
  atk: AttackDef,
  mwep: Entity | null,
  vis: boolean,
): number {
  let damage = ctx.rng.d(atk.n, atk.d);
  damage = adtyping(ctx, magr, atk, mdef, mwep, damage, vis);
  if (!damage) return M_ATTK.HIT;
  const hp = mdef.c.hp;
  if (!hp) return M_ATTK.HIT;
  hp.cur -= damage;
  if (hp.cur < 1) {
    const victimLevel = mdef.c.monster?.level ?? 0;
    monkilled(ctx, mdef.id, true);
    return M_ATTK.DEF_DIED | (growUp(ctx, magr.id, victimLevel) ? 0 : M_ATTK.AGR_DIED);
  }
  return M_ATTK.HIT;
}

/** ref: src/mhitm.c hitmm(): the hit message, then mdamagem() */
function hitmm(
  ctx: Ctx,
  magr: Entity,
  mdef: Entity,
  atk: AttackDef,
  mwep: Entity | null,
  vis: boolean,
): number {
  if (vis) {
    const verb =
      atk.at === 'bite'
        ? 'bites'
        : atk.at === 'sting'
          ? 'stings'
          : atk.at === 'butt'
            ? 'butts'
            : atk.at === 'touch'
              ? 'touches'
              : atk.at === 'tentacle'
                ? 'tentacles'
                : 'hits';
    say(ctx, `mhitm.${verb}`, { magr: monNam(ctx, magr), mdef: monNam(ctx, mdef) });
  } else noises(ctx, magr);
  return mdamagem(ctx, magr, mdef, atk, mwep, vis);
}

/** ref: src/mhitm.c missmm() (no seduction) */
function missmm(ctx: Ctx, magr: Entity, mdef: Entity, vis: boolean): void {
  if (vis) say(ctx, 'mhitm.misses', { magr: monNam(ctx, magr), mdef: monNam(ctx, mdef) });
  else noises(ctx, magr);
}

/** ref: src/mhitm.c passivemm(): the defender's passive response hits the attacker */
function passivemm(ctx: Ctx, magr: Entity, mdef: Entity, mhit: boolean, mdead: number): number {
  const ddef = ctx.defs.monster(mdef.def);
  const res = mdead | (mhit ? M_ATTK.HIT : M_ATTK.MISS);
  const atk = ddef.attacks.find((a) => a.at === 'passive');
  if (!atk) return res;
  const level = mdef.c.monster?.level ?? ddef.level;
  let tmp = atk.n ? ctx.rng.d(atk.n, atk.d) : atk.d ? ctx.rng.d(level + 1, atk.d) : 0;
  const seenAgr = canSpotMon(ctx, magr);
  const name = (): string => monNam(ctx, magr);
  let assess = false;
  // these affect the attacker even if the defender was killed
  if (atk.ad === 'acid') {
    if (mhit && ctx.rng.rn2(2) !== 0) {
      if (seenAgr) say(ctx, 'mhitm.splashed', { mon: name(), by: monNam(ctx, mdef) });
      if (resists(ctx, magr, 'acid')) {
        if (seenAgr) say(ctx, 'mhitm.not_affected', { mon: name() });
        tmp = 0;
      }
    } else tmp = 0;
    ctx.rng.rn2(30); // erode_armor
    ctx.rng.rn2(6); // acid_damage
    assess = true;
  }
  if (!assess) {
    if (mdead) return res;
    // these only if the defender is still alive
    if (ctx.rng.rn2(3) !== 0) {
      switch (atk.ad) {
        case 'plys':
          if (tmp > 127) tmp = 127;
          if (mdef.def === 'nh:floating_eye') {
            if (ctx.rng.rn2(4) === 0) tmp = 127;
            if (!ctx.defs.monster(magr.def).flags.includes('noeyes')) {
              if (seenAgr) say(ctx, 'mhitm.frozen_gaze', { mon: name(), by: monNam(ctx, mdef) });
              paralyzeMonst(ctx, magr.id, tmp);
            }
            return res;
          }
          if (seenAgr) say(ctx, 'mhitm.frozen_by', { mon: name(), by: monNam(ctx, mdef) });
          paralyzeMonst(ctx, magr.id, tmp);
          return res;
        case 'cold':
          if (resists(ctx, magr, 'cold')) {
            if (seenAgr) say(ctx, 'mhitm.mildly_chilly', { mon: name() });
            tmp = 0;
            break;
          }
          if (seenAgr) say(ctx, 'mhitm.very_cold', { mon: name() });
          {
            // healmon(mdef, tmp / 2, tmp / 2): the mold grows (never splits, see DEVIATIONS.md)
            const dh = mdef.c.hp;
            if (dh) {
              const h = Math.trunc(tmp / 2);
              dh.cur = Math.min(dh.cur + h, dh.max + h);
              dh.max += h;
            }
          }
          break;
        case 'stun':
          if (!isMStunned(ctx, magr.id)) {
            setMStunned(ctx, magr.id, true);
            if (seenAgr) say(ctx, 'mhitm.staggers_passive', { mon: name() });
          }
          tmp = 0;
          break;
        case 'fire':
          if (resists(ctx, magr, 'fire')) {
            if (seenAgr) say(ctx, 'mhitm.mildly_warmed', { mon: name() });
            tmp = 0;
            break;
          }
          if (seenAgr) say(ctx, 'mhitm.very_hot', { mon: name() });
          break;
        case 'elec':
          if (resists(ctx, magr, 'elec')) {
            if (seenAgr) say(ctx, 'mhitm.mildly_tingled', { mon: name() });
            tmp = 0;
            break;
          }
          if (seenAgr) say(ctx, 'mhitm.jolted', { mon: name() });
          break;
        default:
          tmp = 0;
          break;
      }
    } else tmp = 0;
  }
  const ahp = magr.c.hp;
  if (ahp && (ahp.cur -= tmp) <= 0) {
    monkilled(ctx, magr.id, true);
    return res | M_ATTK.AGR_DIED;
  }
  return res;
}

/**
 * Monster `magrId` makes its melee attacks on the adjacent monster `mdefId`. Returns M_ATTK
 * flags. ref: src/mhitm.c mattackm()
 */
export function mattackm(ctx: Ctx, magrId: EntityId, mdefId: EntityId): number {
  const magr = ent(ctx, magrId);
  const mdef = ent(ctx, mdefId);
  if (!magr?.c.monster || !mdef?.c.monster) return M_ATTK.MISS;
  if (helpless(ctx, magrId)) return M_ATTK.MISS;
  const pa = ctx.defs.monster(magr.def);
  const ap = magr.c.pos;
  const dp = mdef.c.pos;
  if (!ap || !dp) return M_ATTK.MISS;
  // grid bugs cannot attack at an angle
  if (magr.def === 'nh:grid_bug' && ap.x !== dp.x && ap.y !== dp.y) return M_ATTK.MISS;

  // the armour class differential
  let tmp = findMac(ctx.state, ctx.defs, mdefId) + magr.c.monster.level;
  if (helpless(ctx, mdefId)) {
    tmp += 4;
    mdef.c.monster.asleep = false;
  }
  // elves hate orcs
  if (pa.flags.includes('elf') && ctx.defs.monster(mdef.def).flags.includes('orc')) tmp++;

  const vis = canSpotMon(ctx, magr) || canSpotMon(ctx, mdef);
  let struck = false;
  for (let i = 0; i < pa.attacks.length; i++) {
    const atk = pa.attacks[i];
    if (!atk) continue;
    // the target might no longer be there
    if (i > 0 && (!alive(ctx, mdefId) || !alive(ctx, magrId))) continue;
    if (!MELEE_AT.has(atk.at)) continue; // not ported: hugs, gazes, engulfing, breath, ...
    if (distmin(magr, mdef) > 1) continue;
    let res: number = M_ATTK.MISS;
    let mwep: Entity | null = null;
    if (atk.at === 'weapon') {
      if (!monWep(ctx, magrId) && monWieldItem(ctx, magrId)) return M_ATTK.MISS;
      mwep = monWep(ctx, magrId);
      if (mwep) {
        if (vis) {
          const wdef = ctx.defs.object(mwep.def);
          say(ctx, `mhitm.${wdef.weapon?.kind === 'pierce' ? 'thrusts' : 'swings'}`, {
            magr: monNam(ctx, magr),
            mdef: monNam(ctx, mdef),
            weapon: xnameOf(ctx.state, ctx.defs, mwep),
          });
        }
        tmp += hitval(mwep, ctx.defs.object(mwep.def), ctx.defs.monster(mdef.def));
      }
    }
    const dieroll = ctx.rng.rnd(20 + i);
    const strike = tmp > dieroll;
    if (mwep) tmp -= hitval(mwep, ctx.defs.object(mwep.def), ctx.defs.monster(mdef.def));
    if (strike) res = hitmm(ctx, magr, mdef, atk, mwep, vis);
    else missmm(ctx, magr, mdef, vis);

    if (!(res & M_ATTK.AGR_DIED) && alive(ctx, magrId)) {
      const d = ent(ctx, mdefId);
      if (!d || distmin(magr, d) <= 1)
        res = passivemm(ctx, magr, d ?? mdef, strike, res & M_ATTK.DEF_DIED);
    }
    if (res & M_ATTK.DEF_DIED) return res;
    if (res & M_ATTK.AGR_DIED) return res;
    if (helpless(ctx, magrId)) return res;
    if (res & M_ATTK.HIT) struck = true;
  }
  return struck ? M_ATTK.HIT : M_ATTK.MISS;
}
