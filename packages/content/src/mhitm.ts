// Monster-vs-monster melee. ref: src/mhitm.c mattackm(), hitmm(), missmm(), mdamagem(),
// passivemm(), noises(); src/uhitm.c mhitm_ad_*() (the mdef-is-a-monster branches);
// src/mon.c monkilled(), mondied(); src/makemon.c grow_up()
//
// The damage types are adtyping.ts's (mhitm_adtyping()). Passive responses: acid, disenchantment,
// paralysis (floating eye), cold, stun, fire and elec. Hugs, gazes (gazemm()) and explosions
// (explmm()) are ported; not yet: engulfing, breath and spit (mattackm's switch has their cases,
// which do nothing until their m9 step), shades, silver, cloning puddings, petrification.
import {
  NORMAL_SPEED,
  getPlayer,
  sortedIds,
  type AttackDef,
  type Ctx,
  type Entity,
  type EntityId,
  type Msg,
} from '@nh/core';
import { hitval } from './combat';
import { mondead, monkilled, mondied } from './mondeath';
import { monExplodes } from './explode';

export { monkilled, mondied };
import { M_ATTK, drainItem, mhitmAdtyping, newMhm } from './adtyping';
import { heroSees, monWep, monWieldItem } from './mongear';
import {
  paralyzeMonst,
  isCancelled,
  isFrozen,
  setMStunned,
  isMStunned,
  isMConfused,
  mcansee,
} from './mstate';
import { canSpotMon, monNam } from './perception';
import { findMac } from './stats';
import { nhData } from './items';
import { xnameOf } from './objnam';
import { acidDamage, erodeArmor } from './erode';
import { mtrappedInPit } from './trapstate';
import { setUstuck, ustuck } from './hackmove';
import { resistConflict } from './props';

export { M_ATTK };

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

/** ref: src/mhitm.c mdamagem(): damage, death and growing up */
function mdamagem(
  ctx: Ctx,
  magr: Entity,
  mdef: Entity,
  atk: AttackDef,
  mwep: Entity | null,
  vis: boolean,
  dieroll: number,
): number {
  const mhm = newMhm(ctx.rng.d(atk.n, atk.d), dieroll);
  mhitmAdtyping(ctx, magr.id, atk, mdef.id, mhm, { vis, mwep, growUp });
  if (mhm.done) return mhm.hitflags;
  const damage = mhm.damage;
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
  dieroll: number,
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
                : atk.at === 'hug' && ustuck(ctx) !== magr.id
                  ? 'squeezes'
                  : 'hits';
    say(ctx, `mhitm.${verb}`, { magr: monNam(ctx, magr), mdef: monNam(ctx, mdef) });
  } else noises(ctx, magr);
  return mdamagem(ctx, magr, mdef, atk, mwep, vis, dieroll);
}

/** ref: include/mondata.h unsolid() */
const unsolid = (ctx: Ctx, mon: Entity): boolean =>
  ctx.defs.monster(mon.def).flags.includes('unsolid');

/**
 * A hold, wrap, sticky touch or swallow passes right through an unsolid target (lights, vortices,
 * most elementals): "The owlbear's grab attempt passes right through the yellow light!". Only
 * monster defenders here (the hero is never unsolid: no polymorph; no long worm tails).
 * ref: src/mhitm.c failed_grab()
 */
export function failedGrab(
  ctx: Ctx,
  magr: Entity,
  mdef: Entity,
  atk: AttackDef,
  vis: boolean,
): boolean {
  if (
    unsolid(ctx, mdef) &&
    (atk.at === 'hug' || atk.ad === 'wrap' || atk.ad === 'stck' || atk.ad === 'dgst')
  ) {
    if (vis && canSpotMon(ctx, mdef)) {
      const verb = atk.ad === 'dgst' ? 'gulp' : atk.ad === 'stck' ? 'adhere' : 'grab';
      say(ctx, 'mhitm.grab_passes', {
        magr: monNam(ctx, magr),
        verb: `@mhitm.verb.${verb}`,
        mdef: monNam(ctx, mdef),
      });
    }
    return true;
  }
  return false;
}

/**
 * The aggressor gazes at the defender: nothing happens when it is cancelled or blind, or the
 * defender is blind or asleep; else the gaze's damage type acts as a hit (mdamagem()).
 * ref: src/mhitm.c gazemm() (no Archon, no Medusa: her reflection and stoning are step 6; no
 * invisible monsters)
 */
function gazemm(ctx: Ctx, magr: Entity, mdef: Entity, atk: AttackDef, vis: boolean): number {
  if (vis) {
    say(ctx, canSpotMon(ctx, mdef) ? 'mhitm.gazes_at' : 'mhitm.gazes_at_something', {
      magr: monNam(ctx, magr),
      mdef: monNam(ctx, mdef),
    });
  }
  if (
    isCancelled(ctx, magr.id) ||
    !mcansee(ctx, mdef.id) ||
    !mcansee(ctx, magr.id) ||
    mdef.c.monster?.asleep === true
  ) {
    if (vis && canSpotMon(ctx, mdef)) say(ctx, 'mhitm.nothing_happens');
    return M_ATTK.MISS;
  }
  return mdamagem(ctx, magr, mdef, atk, null, vis, 0);
}

/**
 * The aggressor explodes at the defender ("The yellow light explodes!") and dies: a sphere's
 * fire, cold or electricity in a real explosion, the rest (lights) as a hit on the defender.
 * A pet's death gives "You have a melancholy feeling." ref: src/mhitm.c explmm() (no leashes,
 * no life saving)
 */
function explmm(ctx: Ctx, magr: Entity, mdef: Entity, atk: AttackDef, vis: boolean): number {
  if (isCancelled(ctx, magr.id)) return M_ATTK.MISS;
  const at = magr.c.pos ? { ...magr.c.pos } : null;
  if (at && heroSees(ctx, at)) say(ctx, 'mhitm.explodes', { mon: monNam(ctx, magr) });
  else noises(ctx, magr);
  const tame = (magr.c.monster?.tame ?? 0) > 0;
  let result: number;
  if (atk.ad === 'fire' || atk.ad === 'cold' || atk.ad === 'elec') {
    if (at) monExplodes(ctx, magr.def, at, atk, false, magr.id);
    // unconditionally set AGR_DIED here; lifesaving is accounted below
    result = M_ATTK.AGR_DIED | (alive(ctx, mdef.id) ? 0 : M_ATTK.DEF_DIED);
  } else result = mdamagem(ctx, magr, mdef, atk, null, vis, 0);
  // kill off aggressor if it didn't die
  if (!(result & M_ATTK.AGR_DIED)) {
    mondead(ctx, magr.id);
    result |= M_ATTK.AGR_DIED;
  }
  if (tame) say(ctx, 'mhitm.melancholy'); // give this one even if it was visible
  return result;
}

/** ref: src/mhitm.c missmm() (no seduction) */
function missmm(ctx: Ctx, magr: Entity, mdef: Entity, vis: boolean): void {
  if (vis) say(ctx, 'mhitm.misses', { magr: monNam(ctx, magr), mdef: monNam(ctx, mdef) });
  else noises(ctx, magr);
}

/**
 * ref: src/mhitm.c passivemm(): the defender's passive response hits the attacker (`mwep`: the
 * weapon it hit with, which a disenchanter drains)
 */
function passivemm(
  ctx: Ctx,
  magr: Entity,
  mdef: Entity,
  mhit: boolean,
  mdead: number,
  mwep: Entity | null,
): number {
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
    if (mhit && ctx.rng.rn2(2) === 0) {
      if (seenAgr) say(ctx, 'mhitm.splashed', { mon: name(), by: monNam(ctx, mdef) });
      if (resists(ctx, magr, 'acid')) {
        if (seenAgr) say(ctx, 'mhitm.not_affected', { mon: name() });
        tmp = 0;
      }
    } else tmp = 0;
    if (ctx.rng.rn2(30) === 0) erodeArmor(ctx, magr.id, 'corrode');
    if (ctx.rng.rn2(6) === 0) acidDamage(ctx, monWep(ctx, magr.id));
    assess = true;
  } else if (atk.ad === 'ench') {
    // KMH -- remove enchantment (disenchanter); no message
    if (mhit && !isCancelled(ctx, mdef.id) && mwep) drainItem(ctx, mwep, false);
  }
  if (!assess) {
    if (mdead || isCancelled(ctx, mdef.id)) return res;
    // these only if the defender is still alive
    if (ctx.rng.rn2(3) !== 0) {
      switch (atk.ad) {
        case 'plys':
          if (tmp > 127) tmp = 127;
          if (mdef.def === 'nh:floating_eye') {
            if (ctx.rng.rn2(4) === 0) tmp = 127;
            // `magr->mcansee && haseyes(madat) && mdef->mcansee` (no invisibility; no
            // reflection: mon_reflects() needs worn shields and amulets of reflection on monsters)
            if (
              mcansee(ctx, magr.id) &&
              !ctx.defs.monster(magr.def).flags.includes('noeyes') &&
              mcansee(ctx, mdef.id)
            ) {
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
  if (isMConfused(ctx, mdefId) || helpless(ctx, mdefId)) {
    tmp += 4;
    mdef.c.monster.asleep = false;
  }
  // elves hate orcs
  if (pa.flags.includes('elf') && ctx.defs.monster(mdef.def).flags.includes('orc')) tmp++;

  const vis = canSpotMon(ctx, magr) || canSpotMon(ctx, mdef);
  const bhitpos = { ...dp };
  let struck = false;
  const res: number[] = [];
  for (let i = 0; i < pa.attacks.length; i++) {
    res[i] = M_ATTK.MISS;
    const atk = pa.attacks[i];
    if (!atk) continue;
    // the target might no longer be there
    const at = mdef.c.pos;
    if (
      i > 0 &&
      (!alive(ctx, mdefId) ||
        !alive(ctx, magrId) ||
        !at ||
        at.x !== bhitpos.x ||
        at.y !== bhitpos.y ||
        at.level !== bhitpos.level)
    )
      continue;
    let mwep: Entity | null = null;
    let attk = true;
    let strike = false;
    switch (atk.at) {
      case 'weapon':
      case 'claw':
      case 'kick':
      case 'bite':
      case 'sting':
      case 'touch':
      case 'butt':
      case 'tentacle': {
        if (atk.at === 'weapon') {
          // "hand to hand" attacks; at a distance C's thrwmm() fires (not ported here)
          if (distmin(magr, mdef) > 1) continue;
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
        if (atk.at === 'kick' && mtrappedInPit(ctx, magrId)) continue;
        // Nymph that teleported away on first attack?
        if (distmin(magr, mdef) > 1) continue;
        // (monsters won't attack cockatrices physically with a weapon in hand: step 6)
        const dieroll = ctx.rng.rnd(20 + i);
        strike = tmp > dieroll;
        // KMH -- don't accumulate to-hit bonuses
        if (mwep) tmp -= hitval(mwep, ctx.defs.object(mwep.def), ctx.defs.monster(mdef.def));
        if (strike) {
          // for eel AT_TUCH+AD_WRAP attack: can't grab an unsolid target
          if (unsolid(ctx, mdef) && failedGrab(ctx, magr, mdef, atk, vis)) {
            strike = false;
            break;
          }
          res[i] = hitmm(ctx, magr, mdef, atk, mwep, vis, dieroll);
        } else missmm(ctx, magr, mdef, vis);
        break;
      }
      case 'hug': // automatic if prev two attacks succeed
        strike = i >= 2 && res[i - 1] === M_ATTK.HIT && res[i - 2] === M_ATTK.HIT;
        if (strike) {
          if (failedGrab(ctx, magr, mdef, atk, vis)) strike = false;
          else res[i] = hitmm(ctx, magr, mdef, atk, null, vis, 0);
        }
        break;
      case 'gaze':
        strike = false;
        res[i] = gazemm(ctx, magr, mdef, atk, vis);
        break;
      case 'explode':
        // prevent explosions from a distance
        if (distmin(magr, mdef) > 1) continue;
        res[i] = explmm(ctx, magr, mdef, atk, vis);
        if (res[i] === M_ATTK.MISS) {
          // cancelled--no attack
          strike = false;
          attk = false;
        } else strike = true; // automatic hit
        break;
      // AT_ENGL (step 4), AT_BREA and AT_SPIT (step 5): no attack yet
      default: // no attack
        attk = false;
        break;
    }
    let r = res[i] ?? M_ATTK.MISS;
    if (attk && !(r & M_ATTK.AGR_DIED) && alive(ctx, magrId)) {
      const d = ent(ctx, mdefId);
      if (!d || distmin(magr, d) <= 1)
        r = passivemm(ctx, magr, d ?? mdef, strike, r & M_ATTK.DEF_DIED, mwep);
    }
    res[i] = r;
    if (r & M_ATTK.DEF_DIED) return r;
    if (r & M_ATTK.AGR_DIED) return r;
    // return if aggressor can no longer attack
    if (r & M_ATTK.AGR_DONE || helpless(ctx, magrId)) return r;
    if (r & M_ATTK.HIT) struck = true; // at least one hit
  }
  return struck ? M_ATTK.HIT : M_ATTK.MISS;
}

/** ref: src/mon.c monnear(): next to it (not diagonally for a grid bug) */
function monnear(a: Entity, b: Entity): boolean {
  const p = a.c.pos;
  const q = b.c.pos;
  if (!p || !q || p.level !== q.level) return false;
  const dx = Math.abs(p.x - q.x);
  const dy = Math.abs(p.y - q.y);
  if (a.def === 'nh:grid_bug' && dx !== 0 && dy !== 0) return false;
  return dx <= 1 && dy <= 1;
}

/**
 * Conflict: the monster attacks the first other monster next to it (in id order, C's fmon list),
 * which may hit back. Returns true when it attacked and hit (or died), so it does not also move.
 * The hero is never engulfed or sticky here (no itsstuck(), no engulfing). ref: src/mhitm.c
 * fightm()
 */
export function fightm(ctx: Ctx, mtmpId: EntityId): boolean {
  const mtmp = ent(ctx, mtmpId);
  if (!mtmp?.c.monster) return false;
  // perhaps the monster will resist Conflict
  if (resistConflict(ctx, mtmp)) return false;
  for (const id of sortedIds(ctx.state)) {
    if (id === mtmpId) continue;
    const mon = ent(ctx, id);
    if (!mon?.c.monster || !monnear(mtmp, mon)) continue;
    if (ustuck(ctx) === mtmpId) {
      if (!ctx.rng.rn2(4)) {
        setUstuck(ctx, null);
        say(ctx, 'conflict.releases_you', { mon: monNam(ctx, mtmp) });
      } else break;
    }
    // mtmp can be killed
    const result = mattackm(ctx, mtmpId, id);
    if (result & M_ATTK.AGR_DIED) return true; // mtmp died
    // allow attacked monsters a chance to hit back, primarily to allow monsters that resist
    // conflict to respond
    const actor = mon.c.actor;
    if (
      (result & (M_ATTK.HIT | M_ATTK.DEF_DIED)) === M_ATTK.HIT &&
      ctx.rng.rn2(4) &&
      actor &&
      actor.energy > ctx.rng.rn2(NORMAL_SPEED)
    ) {
      actor.energy = actor.energy > NORMAL_SPEED ? actor.energy - NORMAL_SPEED : 0;
      mattackm(ctx, id, mtmpId); // return attack
    }
    return (result & M_ATTK.HIT) !== 0;
  }
  return false;
}
