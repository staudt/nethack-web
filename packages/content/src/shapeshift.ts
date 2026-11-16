// Vampire shapeshifters: when a shapeshifter changes form on its own (decide_to_shapeshift(), once
// a turn from m_calcdistress()), a killed vampire bat, fog cloud or wolf rising as the vampire it
// was (vamprises()), a stoned one reverting instead (vamp_stone()), and the shift into a fog cloud
// to pass under a closed door (vamp_shift()). The true kind is chamstate.ts's `cham`; the shape
// pick is newcham.ts's pickvampshape(). Registered into mstate.ts, mondeath.ts, stoning.ts and
// monmove.ts/dogmove.ts at load (they sit below newcham.ts).
// ref: src/mon.c decide_to_shapeshift(), vamprises(), vamp_stone(); src/monmove.c vamp_shift()
//
// Not ported: chameleons, doppelgangers and sandestins (m18 step 3: no rows yet; their
// decide_to_shapeshift() branch is here), monster genders (a vampire keeps none), Vlad, the
// hero's own vampire shapeshifting, `gd.disintegested` (a digested or disintegrated vampshifter
// "transforms" unless its form is amorphous).
import {
  getLevel,
  getPlayer,
  type Ctx,
  type Entity,
  type Level,
  type MonsterDef,
  type Msg,
} from '@nh/core';
import { blowDoor, mbTrapped } from './btrapped';
import { doorTrapped } from './btrapstate';
import { canFog, chamOf, FOG_CLOUD, isVampire, isVampshifter, setCham } from './chamstate';
import { expels, unstuck } from './engulf';
import { engulfingU, uswallow, ustuck } from './engulfstate';
import { mnextoPos } from './generation';
import { setFogUnderDoor } from './monmove';
import { canseemon } from './invis';
import { amorphous, isFlyer, noncorporeal, nonliving } from './mondata';
import { heroSees } from './mongear';
import { setVampRises } from './mondeath';
import { mspecUsed, mstratOf, setDecideToShapeshift, setMspecUsed, unfreezeMonst } from './mstate';
import { newcham, pickvampshape } from './newcham';
import { canSpotMon, monNam } from './perception';
import { setVampStone } from './stoning';
import { surfaceKey, terrainIdAt } from './terrain';
import { rlocTo } from './trap';
import { isGenocided } from './vanquished';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/** gv.vamp_rise_msg: vamprises() told of the rising (xkilled() then says no "Maybe not..."). */
let riseMsg = false;

/** ref: include/hack.h BOLT_LIM */
const BOLT_LIM = 8;

const alive = (ctx: Ctx, mon: Entity): boolean =>
  ctx.state.entities[String(mon.id)]?.c.monster !== undefined;

/** ref: include/rm.h closed_door(): a closed or locked door */
function closedDoor(ctx: Pick<Ctx, 'defs'>, level: Level, x: number, y: number): boolean {
  const id = terrainIdAt(level, x, y);
  const d = id === undefined ? undefined : ctx.defs.terrain(id).door;
  return d === 'closed' || d === 'locked';
}

/** `mdistu(mon) > BOLT_LIM * BOLT_LIM` or not seen: it may change unobserved. */
function unobserved(ctx: Ctx, mon: Entity): boolean {
  const p = mon.c.pos;
  const hp = getPlayer(ctx.state).c.pos;
  const far =
    !p || !hp || p.level !== hp.level || (p.x - hp.x) ** 2 + (p.y - hp.y) ** 2 > BOLT_LIM ** 2;
  return !canseemon(ctx, mon) || far;
}

/** Asleep, fainted or knocked out. ref: src/hack.c unconscious() (Unaware) */
function unaware(ctx: Ctx): boolean {
  const r = getPlayer(ctx.state).c.helpless?.reasonKey;
  return r === 'helpless.asleep' || r === 'helpless.fainted' || r === 'helpless.rotten_food';
}

/** set_mon_min_mhpmax(mtmp, 10): hit points to max(maximum, m_lev + 1, 10), then full. */
function minMhpmax(mon: Entity): void {
  const hp = mon.c.hp;
  if (!hp) return;
  hp.max = Math.max(hp.max, (mon.c.monster?.level ?? 0) + 1, 10);
  hp.cur = hp.max;
}

/**
 * A shapeshifter may change form, once a turn. A vampire shifted into a bat, fog cloud or wolf
 * goes back to its own form 3 times in 4 once its hit points fall to a sixth of its maximum
 * (stepping off a closed door it was flowing under), and a fog cloud at full health picks
 * another shape 1 time in 4 when the hero does not see it close by; a vampire in its own form
 * at nine tenths of its health or more shifts 1 time in 6, unobserved. Nothing while it waits
 * for the hero. Other shapeshifters change 1 time in 6 when their special ability is ready (none
 * exist yet). ref: src/mon.c decide_to_shapeshift()
 */
export function decideToShapeshift(ctx: Ctx, mon: Entity): void {
  let ptr: MonsterDef | null = null;
  let dochng = false;
  const cham = chamOf(ctx, mon.id);
  const hp = mon.c.hp;
  if (!hp || cham === null) return;
  if (!isVampshifter(ctx, mon)) {
    // regular shapeshifter; 'ptr' is Null
    if (!mspecUsed(ctx, mon.id) && !ctx.rng.rn2(6)) {
      dochng = true;
      setMspecUsed(ctx, mon.id, 3 + ctx.rng.rn2(10));
    }
  } else if (!mstratOf(ctx, mon.id).waitForU) {
    // The vampire has to be in good health (mhp) to maintain its shifted form.
    const def = ctx.defs.monster(mon.def);
    if (!isVampire(def)) {
      if (hp.cur <= Math.trunc((hp.max + 5) / 6) && ctx.rng.rn2(4)) {
        ptr = ctx.defs.monster(cham);
        dochng = true;
      } else if (
        mon.def === FOG_CLOUD &&
        hp.cur === hp.max &&
        !ctx.rng.rn2(4) &&
        unobserved(ctx, mon)
      ) {
        // if a fog cloud, maybe change to wolf or vampire bat; those are more likely to take
        // damage--at least when tame--and then switch back to vampire; they'll also switch to
        // fog cloud if they encounter a closed door
        const mndx = pickvampshape(ctx, mon);
        if (mndx !== null) {
          ptr = ctx.defs.monster(mndx);
          dochng = ptr.id !== mon.def;
        }
      }
      const p = mon.c.pos;
      if (dochng && p && amorphous(def)) {
        const level = getLevel(ctx.state, p.level);
        if (closedDoor(ctx, level, p.x, p.y)) {
          const to = mnextoPos(ctx, level, null, p, ptr);
          if (to) rlocTo(ctx, mon, to.x, to.y, false);
        }
      }
    } else if (hp.cur >= Math.trunc((9 * hp.max) / 10) && !ctx.rng.rn2(6) && unobserved(ctx, mon))
      dochng = true; // 'ptr' stays Null
  }
  // (a vampshifter's gender would be kept: monsters have none here)
  if (dochng) newcham(ctx, mon, ptr, { msg: true });
}

/**
 * A vampire shapeshifter killed in another form rises as itself instead of dying: "The
 * seemingly dead vampire bat suddenly transforms and rises as a vampire lord!" ("The fog cloud
 * suddenly reconstitutes and rises as a vampire!"; "You dream that..." while she is unaware),
 * able to move, with full hit points (at least `max(level + 1, 10)`), no longer a shapeshifter;
 * it lets go of the hero it held or engulfed. Risen on a closed door, it smashes the door ("The
 * door is smashed.", "You see a door being smashed.", "You hear a door being smashed."), and a
 * booby-trapped one explodes ("... and it explodes!") and may destroy it. True when it rose
 * (even if the door then killed it). ref: src/mon.c vamprises()
 */
export function vamprises(ctx: Ctx, mon: Entity): boolean {
  const mndx = chamOf(ctx, mon.id);
  // (protection from shape changers would keep it in its normal form: nothing to check)
  if (mndx === null || mndx === mon.def || isGenocided(ctx.state, mndx)) return false;
  const def = ctx.defs.monster(mon.def);
  // alternate message phrasing for some monster types
  const specMon = nonliving(def) || noncorporeal(def) || amorphous(def);
  const specDeath = noncorporeal(def) || amorphous(def);
  const p = mon.c.pos ? { ...mon.c.pos } : undefined;
  const dream = unaware(ctx);
  const name = monNam(ctx, mon); // the 'before' name
  unfreezeMonst(ctx, mon.id);
  minMhpmax(mon);
  // mtmp == u.ustuck can happen if previously a fog cloud or if poly'd hero is hugging a bat
  if (ustuck(ctx) === mon.id) {
    if (uswallow(ctx)) expels(ctx, mon, false);
    else unstuck(ctx, mon);
  }
  if (!newcham(ctx, mon, ctx.defs.monster(mndx))) return alive(ctx, mon);
  setCham(ctx, mon.id, mon.def === mndx ? null : mndx);
  if (canSpotMon(ctx, mon)) {
    riseMsg = true; // gv.vamp_rise_msg
    const key = `shapeshift.rises.${specMon ? 'plain' : 'dead'}_${specDeath ? 'reconst' : 'transf'}`;
    say(ctx, dream ? `${key}_dream` : key, { mon: name, into: `@${mon.def}` });
  }
  // revived vampire is in normal shape, so can't be amorphous; if on a closed door spot,
  // destroy the door and if trapped, blow it up
  if (p) {
    const level = getLevel(ctx.state, p.level);
    if (closedDoor(ctx, level, p.x, p.y)) {
      const trapped = doorTrapped(ctx, p.level, p.x, p.y);
      const seeit = p.level === ctx.state.currentLevel && heroSees(ctx, p);
      if (!seeit) say(ctx, trapped ? 'shapeshift.hear_explosion' : 'shapeshift.hear_door_smashed');
      else if (!canSpotMon(ctx, mon))
        say(ctx, trapped ? 'shapeshift.see_door_explode' : 'shapeshift.see_door_smashed');
      else if (!dream)
        say(ctx, trapped ? 'shapeshift.door_smashed_explodes' : 'shapeshift.door_smashed');
      blowDoor(ctx, level, p.x, p.y); // D_NODOOR
      if (trapped) {
        // suppress mb_trapped() messages; mtmp was a vampire so use unconditional "destroyed"
        const spotted = canSpotMon(ctx, mon);
        const name2 = monNam(ctx, mon);
        const trapKilled = mbTrapped(ctx, mon, seeit, false);
        if (trapKilled && spotted && !dream) say(ctx, 'shapeshift.destroyed', { mon: name2 });
      }
    }
  }
  return true;
}

/**
 * A vampire shapeshifter turning to stone in another form reverts instead: "The lapidifying
 * vampire bat drops to the floor!" ("coalesces on" for a fog cloud, "writhes on" for a wolf),
 * then "A vampire rises from the floor with renewed agility!", healed as by vamprises(); a
 * shapeshifter whose own kind resists stoning (the sandestin) just returns to it. False when it
 * did not petrify. ref: src/mon.c vamp_stone()
 */
export function vampStone(ctx: Ctx, mon: Entity): boolean {
  const mndx = chamOf(ctx, mon.id);
  if (mndx === null) return true;
  const p = mon.c.pos;
  if (isVampshifter(ctx, mon)) {
    // this only happens if shapeshifted
    if (mndx !== mon.def && !isGenocided(ctx.state, mndx) && p) {
      const def = ctx.defs.monster(mon.def);
      const level = getLevel(ctx.state, p.level);
      const verb = amorphous(def) ? 'coalesces' : isFlyer(def) ? 'drops' : 'writhes';
      const surface = surfaceKey(ctx, level, p.x, p.y);
      const form = `@${mon.def}`; // (x_monnam() with SUPPRESS_HALLUCINATION)
      unfreezeMonst(ctx, mon.id);
      minMhpmax(mon);
      // this can happen if previously a fog cloud
      if (engulfingU(ctx, mon.id)) expels(ctx, mon, false);
      if (amorphous(def) && closedDoor(ctx, level, p.x, p.y)) {
        const to = mnextoPos(ctx, level, null, p, ctx.defs.monster(mndx));
        if (to) rlocTo(ctx, mon, to.x, to.y, false);
      }
      if (canSpotMon(ctx, mon)) say(ctx, `shapeshift.lapidifying.${verb}`, { mon: form, surface });
      newcham(ctx, mon, ctx.defs.monster(mndx));
      setCham(ctx, mon.id, mon.def === mndx ? null : mndx);
      if (canSpotMon(ctx, mon)) {
        const q = mon.c.pos ?? p;
        say(ctx, 'shapeshift.renewed_agility', {
          mon: monNam(ctx, mon),
          surface: surfaceKey(ctx, getLevel(ctx.state, q.level), q.x, q.y),
        });
      }
      return false; // didn't petrify
    }
  } else if (ctx.defs.isMonster(mndx) && ctx.defs.monster(mndx).resists.includes('stone')) {
    // sandestins are stoning-immune so if hit by stoning damage they revert to innate shape
    // rather than become a statue
    unfreezeMonst(ctx, mon.id);
    minMhpmax(mon);
    newcham(ctx, mon, ctx.defs.monster(mndx), { msg: true });
    return false; // didn't petrify
  }
  return true;
}

/**
 * A vampshifter about to move onto a closed door turns into a fog cloud first ("The vampire bat
 * turns into a fog cloud!" when `domsg`); true when it has that shape.
 * ref: src/monmove.c vamp_shift(), m_move()/postmov()'s call
 */
export function vampShift(ctx: Ctx, mon: Entity, domsg: boolean): boolean {
  if (mon.def === FOG_CLOUD) return true; // already right shape
  if (!isVampshifter(ctx, mon)) return false;
  return newcham(ctx, mon, ctx.defs.monster(FOG_CLOUD), { msg: domsg });
}

/**
 * m_move()/postmov(): a vampshifter not yet amorphous that moved onto a closed door turns into a
 * fog cloud (the message as seen before it moved: `seenBefore`, C's `seenflgs & 1`) so it can
 * pass under it; postmov() then has it flow under the door. ref: src/monmove.c postmov() l.1485
 */
export function vampFogAtDoor(ctx: Ctx, mon: Entity, seenBefore: boolean): void {
  const p = mon.c.pos;
  if (!p || !isVampshifter(ctx, mon) || amorphous(ctx.defs.monster(mon.def))) return;
  if (!closedDoor(ctx, getLevel(ctx.state, p.level), p.x, p.y) || !canFog(ctx, mon)) return;
  vampShift(ctx, mon, seenBefore);
}

setDecideToShapeshift(decideToShapeshift);
setVampRises((ctx, mon) => {
  riseMsg = false;
  return vamprises(ctx, mon) ? { msg: riseMsg } : null;
});
setVampStone(vampStone);
setFogUnderDoor(vampFogAtDoor);
