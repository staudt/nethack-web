// Monster-vs-monster melee. ref: src/mhitm.c mattackm(), hitmm(), missmm(), mdamagem(),
// passivemm(), noises(); src/uhitm.c mhitm_ad_*() (the mdef-is-a-monster branches);
// src/mon.c monkilled(), mondied(); src/makemon.c grow_up()
//
// The damage types are adtyping.ts's (mhitm_adtyping()). Passive responses: acid, disenchantment,
// paralysis (floating eye), cold, stun, fire and elec. Hugs, gazes (gazemm()) and explosions
// (explmm()) are ported; not yet: engulfing, breath and spit (mattackm's switch has their cases,
// which do nothing until their m9 step), shades, cloning puddings. Touching a cockatrice
// turns the attacker to stone (mdamagem()).
import { golemeffects } from './golemfx';
import { isGolem } from './golem';
import {
  NORMAL_SPEED,
  cellIndex,
  getLevel,
  getPlayer,
  sortedIds,
  trapAt,
  type AttackDef,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type Msg,
} from '@nh/core';
import { hitval } from './combat';
import { mondead, monkilled, mondied } from './mondeath';
import { monExplodes } from './explode';

export { monkilled, mondied };
import {
  M_ATTK,
  drainItem,
  failedGrab,
  mhitmAdtyping,
  newMhm,
  resetSkipdrin,
  skipsDrin,
} from './adtyping';
import { heroSees, minvent, monWep, monWieldItem } from './mongear';
import {
  paralyzeMonst,
  isCancelled,
  isFrozen,
  setMStunned,
  isMStunned,
  isMConfused,
  mcansee,
} from './mstate';
import { canSpotMon, monNam, sensemon } from './perception';
import { isUndetected, setUndetected } from './hidestate';
import { mApType, seemimic } from './mimicstate';
import { findMac } from './stats';
import { couldSeduce } from './steal';
import { nhData } from './items';
import { xnameOf } from './objnam';
import { acidDamage, erodeArmor } from './erode';
import { mtrappedInPit } from './trapstate';
import { monReflects } from './musestate';
import { setUstuck, ustuck } from './hackmove';
import { digests, enfolds, engulfingU, flaming, setMswallower } from './engulfstate';
import { engulfTarget } from './engulf';
import { snuffLit } from './light';
import { mintrap } from './trap';
import { cloneMon } from './clone';
import { resistConflict } from './props';
import { monPolyWhenStoned, monToStone, monstone } from './stoning';
import { attkProtection, resistsSton, touchPetrifies } from './stonestate';
import { canseemon, monInvisible, perceives } from './invis';
import { hatesSilver, nonliving } from './mondata';
import { littleToBig } from './eggstate';
import { isGenocided } from './vanquished';
import { isSilver, silverSearsMm } from './silver';

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
 * A monster that killed `victim` gains hit points and maybe a level, growing into its bigger
 * form ("The kitten grows up into a housecat."). With no victim (`null`: a wraith corpse, as a
 * potion of gain level would) it always goes up a level, a killer bee into a queen bee. The
 * bigger form is little_to_big()'s; growing into a genocided one kills it. Returns false if it
 * died. ref: src/makemon.c grow_up() (home elementals are not special here; no gender change)
 */
export function growUp(ctx: Ctx, id: EntityId, victimLevel: number | null): boolean {
  const mon = ent(ctx, id);
  const m = mon?.c.monster;
  const hp = mon?.c.hp;
  if (!mon || !m || !hp) return false;
  const oldDef = ctx.defs.monster(mon.def);
  const newType =
    mon.def === 'nh:killer_bee' && victimLevel === null
      ? ('nh:queen_bee' as DefId)
      : littleToBig(ctx.defs, mon.def);
  const newDef = ctx.defs.isMonster(newType) ? ctx.defs.monster(newType) : oldDef;
  let hpThreshold: number;
  let levLimit: number;
  let maxIncrease: number;
  let curIncrease: number;
  if (victimLevel !== null) {
    hpThreshold = !m.level
      ? 4
      : isGolem(oldDef) // strange creatures
        ? (Math.trunc(hp.max / 10) + 1) * 10 - 1
        : m.level * 8;
    levLimit = Math.trunc((3 * oldDef.level) / 2);
    if (newDef !== oldDef && newDef.level > levLimit) levLimit = newDef.level;
    maxIncrease = ctx.rng.rnd(victimLevel + 1);
    if (hp.max + maxIncrease > hpThreshold + 1) maxIncrease = Math.max(hpThreshold + 1 - hp.max, 0);
    curIncrease = maxIncrease > 1 ? ctx.rng.rn2(maxIncrease) : 0;
  } else {
    // a gain level potion or wraith corpse; always go up a level unless already at maximum
    maxIncrease = curIncrease = ctx.rng.rnd(8);
    hpThreshold = 0; // smaller than `mhpmax + max_increase'
    levLimit = 50; // recalc below
  }
  hp.max += maxIncrease;
  hp.cur += curIncrease;
  if (hp.max <= hpThreshold) return true;
  if (levLimit < 5) levLimit = 5;
  else if (levLimit > 49) levLimit = oldDef.level > 49 ? 50 : 49;
  m.level++;
  if (m.level >= newDef.level && newDef !== oldDef) {
    if (isGenocided(ctx.state, newDef.id)) {
      // "As <mon> grows up into <a newtype>, it dies!" (allow G_EXTINCT)
      if (canSpotMon(ctx, mon))
        say(ctx, nonliving(newDef) ? 'mhitm.grows_up_expires' : 'mhitm.grows_up_dies', {
          mon: monNam(ctx, mon),
          into: `@${newDef.id}`,
        });
      mon.def = newDef.id; // set_mon_data(): keep the counts accurate
      mondied(ctx, mon.id);
      return false;
    }
    if (canSpotMon(ctx, mon)) {
      const name = monNam(ctx, mon);
      mon.def = newDef.id;
      say(ctx, newDef.flags.includes('humanoid') ? 'mhitm.becomes' : 'mhitm.grows_up', {
        mon: name,
        into: `@${newDef.id}`,
      });
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
  // touching a cockatrice (or digesting Medusa) without the armor that protects this attack
  const pd = ctx.defs.monster(mdef.def);
  if (
    (touchPetrifies(pd) || (atk.ad === 'dgst' && pd.id === 'nh:medusa')) &&
    !resistsSton(ctx, magr)
  ) {
    const protector = attkProtection(atk.at);
    // a wielded weapon gives the same protection as gloves here
    const worn = (slot: string): boolean =>
      (slot === 'gloves' && mwep !== null) ||
      minvent(ctx, magr.id).some((o) => o.c.item?.equipped === slot);
    if (protector !== 'never' && (protector.length === 0 || !protector.every(worn))) {
      if (monPolyWhenStoned(ctx, magr)) {
        monToStone(ctx, magr);
        return M_ATTK.HIT; // no damage during the polymorph
      }
      if (vis && canSpotMon(ctx, magr)) say(ctx, 'stone.mon_turns_x', { mon: monNam(ctx, magr) });
      const tame = (magr.c.monster?.tame ?? 0) > 0;
      monstone(ctx, magr);
      if (alive(ctx, magr.id)) return M_ATTK.HIT; // lifesaved
      if (tame && !vis) say(ctx, 'stone.peculiarly_sad');
      return M_ATTK.AGR_DIED;
    }
  }
  mhitmAdtyping(ctx, magr.id, atk, mdef.id, mhm, { vis, mwep, growUp });
  if (mhm.done) return mhm.hitflags;
  const damage = mhm.damage;
  // C returns mhm.hitflags (a thief that teleported away: AGR_DONE)
  if (!damage) return mhm.hitflags !== M_ATTK.MISS ? mhm.hitflags : M_ATTK.HIT;
  const hp = mdef.c.hp;
  if (!hp) return M_ATTK.HIT;
  hp.cur -= damage;
  if (hp.cur < 1) {
    const victimLevel = mdef.c.monster?.level ?? 0;
    monkilled(ctx, mdef.id, true, undefined, atk.ad === 'dgst' ? 'dgst' : undefined);
    if (alive(ctx, mdef.id)) return M_ATTK.HIT; // mdef lifesaved
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
  const compat = !isCancelled(ctx, magr.id) ? couldSeduce(ctx, magr, mdef, atk) : 0;
  if (vis && compat) {
    // "The water nymph smiles at the jackal seductively."
    say(ctx, mcansee(ctx, mdef.id) ? 'mhitm.smiles_at' : 'mhitm.talks_to', {
      magr: monNam(ctx, magr),
      mdef: monNam(ctx, mdef),
      how: { key: compat === 2 ? 'mhitm.engagingly' : 'mhitm.seductively' },
    });
  } else if (vis) {
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
    // ref: src/mhitm.c hitmm(): a silver weapon sears a silver-hater
    if (mwep && isSilver(ctx, mwep) && hatesSilver(ctx.defs.monster(mdef.def)))
      silverSearsMm(ctx, magr, mdef, mwep);
  } else noises(ctx, magr);
  return mdamagem(ctx, magr, mdef, atk, mwep, vis, dieroll);
}

/** ref: include/mondata.h unsolid() */
const unsolid = (ctx: Ctx, mon: Entity): boolean =>
  ctx.defs.monster(mon.def).flags.includes('unsolid');

export { failedGrab };

/**
 * The aggressor gazes at the defender: nothing happens when it is cancelled or blind, or the
 * defender is blind or asleep; else the gaze's damage type acts as a hit (mdamagem()).
 * ref: src/mhitm.c gazemm() (no Archon; Medusa is not in the roster, so her gaze's reflection
 * and stoning are not ported; no invisible monsters)
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
 * A pet's death gives "You have a melancholy feeling." ref: src/mhitm.c explmm() (no leashes)
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
    if (alive(ctx, magr.id)) return result; // life saved
    result |= M_ATTK.AGR_DIED;
  }
  if (tame) say(ctx, 'mhitm.melancholy'); // give this one even if it was visible
  return result;
}

/**
 * The aggressor swallows the defender ("The purple worm swallows the newt."): it moves onto the
 * defender's square for the damage (a digester eats it whole), then, if both live, lets it out
 * ("The newt is regurgitated!") and goes back. A dead defender leaves the aggressor on its
 * square, unless that square is no good for it; a trap there may catch it.
 * ref: src/mhitm.c gulpmm() (no vampire shapeshifters, no pools)
 */
function gulpmm(ctx: Ctx, magr: Entity, mdef: Entity, atk: AttackDef, vis: boolean): number {
  if (!engulfTarget(ctx, magr, mdef)) return M_ATTK.MISS;
  const pa = ctx.defs.monster(magr.def);
  if (vis)
    say(ctx, 'mhitm.engulfs', {
      magr: monNam(ctx, magr),
      verb: {
        key: digests(pa)
          ? 'mhitm.verb.swallows'
          : enfolds(pa)
            ? 'mhitm.verb.encloses'
            : 'mhitm.verb.engulfs',
      },
      mdef: monNam(ctx, mdef),
    });
  if (!flaming(pa)) for (const o of minvent(ctx, mdef.id)) snuffLit(ctx, o);
  const ap = magr.c.pos;
  const dp = mdef.c.pos;
  if (!ap || !dp) return M_ATTK.MISS;
  const a = { ...ap };
  const d = { ...dp };
  // leave the defender where it is, but not on the map; the aggressor moves onto its square
  magr.c.pos = { ...d };
  ctx.emit({ type: 'moved', id: magr.id, from: { x: a.x, y: a.y }, to: { x: d.x, y: d.y } });
  setMswallower(magr.id); // corpse_chance() wants this
  let status = mdamagem(ctx, magr, mdef, atk, null, vis, 0);
  setMswallower(null);
  const agrDied = !alive(ctx, magr.id);
  const defDied = !alive(ctx, mdef.id);
  if (agrDied) status |= M_ATTK.AGR_DIED;
  if (defDied) status |= M_ATTK.DEF_DIED;
  const back = (): void => {
    const p = magr.c.pos;
    if (!p) return;
    magr.c.pos = { ...a };
    ctx.emit({ type: 'moved', id: magr.id, from: { x: p.x, y: p.y }, to: { x: a.x, y: a.y } });
  };
  if (agrDied && defDied) {
    // both died -- do nothing
  } else if (defDied) {
    // if the gulp targeted an inhospitable location, magr returns to its previous spot
    if (!goodposFor(ctx, magr, d)) back();
    // aggressor moves to <dx,dy> and might encounter trouble there (no pools)
    else if (trapAt(getLevel(ctx.state, d.level), d.x, d.y)) {
      mintrap(ctx, magr.id);
      if (!alive(ctx, magr.id)) status |= M_ATTK.AGR_DIED;
    }
  } else if (agrDied) {
    // aggressor died: the defender is back on the map where it was
  } else {
    // both alive, put them back
    if (heroSees(ctx, d))
      say(ctx, 'mhitm.let_out', {
        mon: monNam(ctx, mdef),
        how: {
          key: digests(pa)
            ? 'mhitm.regurgitated'
            : enfolds(pa)
              ? 'mhitm.released'
              : 'mhitm.expelled',
        },
      });
    back();
  }
  return status;
}

/** goodpos() for the aggressor at the dead defender's square (the square is free now) */
function goodposFor(ctx: Ctx, mon: Entity, p: { level: string; x: number; y: number }): boolean {
  const level = getLevel(ctx.state, p.level);
  const id = level.palette[level.cells[cellIndex(level, p.x, p.y)] ?? 0];
  if (id === undefined || !ctx.defs.terrain(id).passable) return false;
  for (const oid of sortedIds(ctx.state)) {
    if (oid === mon.id) continue;
    const e = ctx.state.entities[String(oid)];
    const q = e?.c.pos;
    if (e && !e.c.item && q && q.level === p.level && q.x === p.x && q.y === p.y) return false;
  }
  return true;
}

/** ref: src/mhitm.c missmm(): "The nymph pretends to be friendly to the jackal." */
function missmm(ctx: Ctx, magr: Entity, mdef: Entity, atk: AttackDef, vis: boolean): void {
  if (vis) {
    const friendly = !isCancelled(ctx, magr.id) && couldSeduce(ctx, magr, mdef, atk) !== 0;
    say(ctx, friendly ? 'mhitm.pretends_friendly' : 'mhitm.misses', {
      magr: monNam(ctx, magr),
      mdef: monNam(ctx, mdef),
    });
  } else noises(ctx, magr);
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
            // `magr->mcansee && haseyes(madat) && mdef->mcansee && (perceives(madat) ||
            // !mdef->minvis)`
            if (
              mcansee(ctx, magr.id) &&
              !ctx.defs.monster(magr.def).flags.includes('noeyes') &&
              mcansee(ctx, mdef.id) &&
              (perceives(ctx.defs.monster(magr.def)) || !monInvisible(ctx, mdef))
            ) {
              if (
                monReflects(ctx, magr, canseemon(ctx, magr) ? 'muse.reflect.gaze_by' : null, {
                  by: monNam(ctx, mdef),
                })
              )
                return res;
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
            if (seenAgr) {
              say(ctx, 'mhitm.mildly_chilly', { mon: name() });
              golemeffects(ctx, magr, 'cold', tmp); // (only when seen: C as is)
            }
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
            if (seenAgr) {
              say(ctx, 'mhitm.mildly_warmed', { mon: name() });
              golemeffects(ctx, magr, 'fire', tmp); // (only when seen: C as is)
            }
            tmp = 0;
            break;
          }
          if (seenAgr) say(ctx, 'mhitm.very_hot', { mon: name() });
          break;
        case 'elec':
          if (resists(ctx, magr, 'elec')) {
            if (seenAgr) {
              say(ctx, 'mhitm.mildly_tingled', { mon: name() });
              golemeffects(ctx, magr, 'elec', tmp); // (only when seen: C as is)
            }
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
  // mundetected monsters become un-hidden if they are attacked: "Suddenly, you notice a garter
  // snake." when she now sees it (not asleep: no dreams; no "emerges from hiding"); an attacker
  // comes out too (pre_mm_attack())
  if (isUndetected(ctx, mdefId)) {
    setUndetected(ctx, mdefId, false);
    if (canseemon(ctx, mdef) && !sensemon(ctx, mdef))
      ctx.emit({ type: 'msg', key: 'hide.suddenly_notice', params: { mon: monNam(ctx, mdef) } });
  }
  setUndetected(ctx, magr.id, false);
  // ref: pre_mm_attack(): unmimicking happens even if she can't see it, because the formerly
  // concealed monster is now in action
  if (mApType(ctx, mdefId) !== null) seemimic(ctx, mdefId);
  if (mApType(ctx, magr.id) !== null) seemimic(ctx, magr.id);
  // elves hate orcs
  if (pa.flags.includes('elf') && ctx.defs.monster(mdef.def).flags.includes('orc')) tmp++;

  const vis = canSpotMon(ctx, magr) || canSpotMon(ctx, mdef);
  const bhitpos = { ...dp };
  let struck = false;
  const res: number[] = [];
  resetSkipdrin();
  for (let i = 0; i < pa.attacks.length; i++) {
    res[i] = M_ATTK.MISS;
    const atk = pa.attacks[i];
    if (!atk || skipsDrin(atk)) continue;
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
        // (C's "monsters won't attack cockatrices physically if they have a weapon instead" test
        // reads `mwep`, which is only set for AT_WEAP: it never applies, so it is not ported)
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
          // ref: mattackm(): a pudding hit with an iron or metal weapon divides
          const mdefHp = ctx.state.entities[String(mdefId)]?.c.hp;
          const mat = mwep ? ctx.defs.object(mwep.def).material : null;
          if (
            (mdef.def === 'nh:black_pudding' || mdef.def === 'nh:brown_pudding') &&
            (mat === 'iron' || mat === 'metal') &&
            mdefHp !== undefined &&
            mdefHp.cur > 1 &&
            !isCancelled(ctx, mdefId)
          ) {
            const mclone = cloneMon(ctx, mdefId, true);
            if (mclone !== null) {
              if (vis && canSpotMon(ctx, mdef))
                say(ctx, 'mhitm.divides', { mdef: monNam(ctx, mdef), magr: monNam(ctx, magr) });
              mintrap(ctx, mclone);
              if (!alive(ctx, magrId)) res[i] = (res[i] ?? 0) | M_ATTK.AGR_DIED;
            }
          }
        } else missmm(ctx, magr, mdef, atk, vis);
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
      case 'engulf': {
        // (no shades, no steeds)
        // D: Prevent engulf from a distance
        if (distmin(magr, mdef) > 1) continue;
        // Engulfing attacks are directed at the hero if possible. -dlc
        if (engulfingU(ctx, magrId)) {
          strike = false;
          break;
        }
        strike = tmp > ctx.rng.rnd(20 + i);
        if (strike) {
          if (failedGrab(ctx, magr, mdef, atk, vis))
            strike = false; // purple worm can't swallow unsolid mons
          else res[i] = gulpmm(ctx, magr, mdef, atk, vis);
        } else missmm(ctx, magr, mdef, atk, vis);
        break;
      }
      // AT_BREA and AT_SPIT (step 5): no attack yet
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
