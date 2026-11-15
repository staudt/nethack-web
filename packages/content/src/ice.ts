// Fire and cold over water, lava and ice: fire boils a pool away (a pit is left) or evaporates
// some of a moat, and melts ice; cold freezes pools and moats into ice that melts again later
// (C's melt timer) and cools lava into floor (or a wall of lava into a wall, now and then).
// ref: src/zap.c zap_over_floor() ZT_FIRE and ZT_COLD water/lava/ice parts, melt_ice(),
// melt_ice_away(); src/trap.c trap_ice_effects()
//
// Not ported: steam clouds (create_gas_cloud(): no gas regions), burying and unearthing the
// objects in a pool that freezes (they lie on the ice: DEVIATIONS "Water"), fix_wall_spines()
// after a wall of lava freezes, corpse aging on ice (obj_ice_effects()), the Plane of Water and
// level temperature. Under a raised drawbridge only what lies under it changes (C's
// `drawbridgemask`: dbstate.ts setDrawbridgeUnder()), so the bridge stays.
import {
  cellIndex,
  getPlayer,
  isVisible,
  itemsAt,
  trapAt,
  type Ctx,
  type Entity,
  type Json,
  type Level,
  type ModApi,
} from '@nh/core';
import { BOULDER } from './boulder';
import { drawbridgeData, isDrawbridge, isRaisedSpan, setDrawbridgeUnder } from './dbstate';
import { setLiquidRay } from './buzz';
import { monsterIdAt } from './combat';
import { boulderHitsPool } from './flooreffects';
import { isUndetected, setUndetected } from './hidestate';
import { isIce, isLava, isMoat, isPool, isWaterwall, waterbodyName } from './liquid';
import { minliquid } from './minliquid';
import { isSwimmer } from './mondata';
import { xnameOf } from './objnam';
import {
  MELT_ICE_AWAY,
  icedpool,
  meltTimeLeft,
  setIcedpool,
  startMeltIceTimeout,
  stopMeltTimer,
} from './icestate';
import { T, isWallId, setTerrain, terrainIdAt } from './terrain';
import { TRAP, dotrap, maketrap, mintrap } from './trap';
import { isMtrapped, setMtrapped, setUtrap, utrap } from './trapstate';
import { cnvTrapObj } from './untrap';
import { poolEffects, setUinwater, uinwater } from './uwater';

const say = (ctx: Ctx, key: string, params?: Record<string, string | { key: string }>): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const heroAt = (ctx: Ctx, level: Level, x: number, y: number): boolean => {
  const p = getPlayer(ctx.state).c.pos;
  return p?.level === level.id && p.x === x && p.y === y;
};

const seen = (ctx: Ctx, level: Level, x: number, y: number): boolean =>
  level.id === ctx.state.currentLevel && isVisible(ctx.state, cellIndex(level, x, y));

const monAt = (ctx: Ctx, level: Level, x: number, y: number): Entity | null => {
  const id = monsterIdAt(ctx, { x, y }, level.id);
  return id === null || id === ctx.state.playerId ? null : (ctx.state.entities[String(id)] ?? null);
};

/**
 * The ice under a trap melts: whoever it held is let go; a land mine or bear trap falls into the
 * water as an object, any other trap is gone. ref: src/trap.c trap_ice_effects(x, y, TRUE)
 */
function trapIceEffects(ctx: Ctx, level: Level, x: number, y: number): void {
  const t = trapAt(level, x, y);
  if (!t) return;
  const mon = monAt(ctx, level, x, y);
  if (mon && isMtrapped(ctx, mon.id)) setMtrapped(ctx, mon.id, false);
  if (t.def === TRAP.landmine || t.def === TRAP.bear) {
    // landmine or bear trap set on top of the ice falls into the water
    cnvTrapObj(ctx, level.id, t, t.def === TRAP.landmine ? 'nh:land_mine' : 'nh:beartrap', 1);
  } else {
    const u = utrap(ctx);
    if (u && heroAt(ctx, level, x, y)) setUtrap(ctx, 0, u.type);
    ctx.removeTrap(level.id, { x, y });
  }
}

/**
 * The ice at (x, y) melts back into the pool or moat it was ("The ice crackles and melts.", or
 * `msg`, when seen or underfoot): its timer stops, a trap on it goes, a boulder on it settles
 * into the water ("A boulder settles..."), then the hero there is in water (spoteffects()) or a
 * monster there meets it (minliquid(); `monMoving` false when the hero melted it, so a kill is
 * hers). ref: src/zap.c melt_ice()
 */
export function meltIce(
  ctx: Ctx,
  level: Level,
  x: number,
  y: number,
  msg: string | null,
  monMoving = false,
): void {
  if (isDrawbridge(level, x, y)) {
    // revert to DB_MOAT
    if (drawbridgeData(ctx, level, x, y)?.under === 'ice')
      setDrawbridgeUnder(ctx, level, x, y, 'moat');
  } else {
    setTerrain(level, x, y, icedpool(ctx, level, x, y) === 'pool' ? T.pool : T.moat);
    setIcedpool(ctx, level, x, y, null);
  }
  stopMeltTimer(ctx, level.id, x, y); // no more ice to melt away
  trapIceEffects(ctx, level, x, y);
  const current = level.id === ctx.state.currentLevel;
  if (current && (seen(ctx, level, x, y) || heroAt(ctx, level, x, y)))
    say(ctx, msg ?? 'ice.crackles_melts'); // Norep()
  const boulderHere = (): Entity | undefined =>
    itemsAt(ctx.defs, ctx.state, level.id, x, y).find((o) => o.def === BOULDER);
  let otmp = current ? boulderHere() : undefined;
  if (otmp) {
    if (seen(ctx, level, x, y))
      say(ctx, 'ice.boulder_settles', { what: xnameOf(ctx.state, ctx.defs, otmp) });
    do {
      delete otmp.c.pos; // obj_extract_self(): the boulder isn't being pushed
      boulderHitsPool(ctx, otmp, x, y, false);
      // try again if there's another boulder and pool didn't fill
    } while (isPool(ctx, level, x, y) && (otmp = boulderHere()) !== undefined);
  }
  if (!current) return;
  if (heroAt(ctx, level, x, y)) {
    poolEffects(ctx, true); // spoteffects(TRUE): possibly drown
    return;
  }
  const mon = monAt(ctx, level, x, y);
  if (mon && isPool(ctx, level, x, y)) minliquid(ctx, mon, monMoving);
}

/** The melt timer: "Some ice melts away." ref: src/zap.c melt_ice_away() */
function meltIceAway(ctx: Ctx, data: Json): void {
  const d = data as { level?: string; x?: number; y?: number } | null;
  const level = d?.level ? ctx.state.levels[d.level] : undefined;
  if (!level || d?.x === undefined || d.y === undefined) return;
  // the ice under a drawbridge melts whether the bridge is raised or lowered
  if (!isIce(ctx, level, d.x, d.y) && drawbridgeData(ctx, level, d.x, d.y)?.under !== 'ice') return;
  // melt_ice -> minliquid -> mondead|xkilled shouldn't credit/blame hero
  meltIce(ctx, level, d.x, d.y, 'ice.melts_away', true);
}

/** An eel hiding in water that boils or freezes is forced out. */
function unhideSwimmer(ctx: Ctx, level: Level, x: number, y: number): void {
  const mon = monAt(ctx, level, x, y);
  if (mon && isSwimmer(ctx.defs.monster(mon.def)) && isUndetected(ctx, mon.id))
    setUndetected(ctx, mon.id, false);
}

/**
 * Fire over (x, y) of the hero's level: ice melts; a pool boils away into a pit ("The water
 * evaporates.", range -3) that the hero or a monster there falls into; other water only
 * steams ("Some water evaporates."; "You hear hissing gas." unseen). Returns the range change.
 * ref: src/zap.c zap_over_floor() ZT_FIRE
 */
export function fireOverLiquid(ctx: Ctx, level: Level, x: number, y: number): number {
  const seeIt = seen(ctx, level, x, y);
  if (isIce(ctx, level, x, y)) {
    meltIce(ctx, level, x, y, null);
    return 0;
  }
  if (!isPool(ctx, level, x, y)) return 0;
  let rangemod = 0;
  let msgtxt = 'zap.hissing_gas';
  const isPoolTyp = terrainIdAt(level, x, y) === T.pool;
  if (!isPoolTyp) {
    // MOAT or WATER
    if (seeIt) msgtxt = 'zap.some_water_evaporates';
  } else {
    rangemod -= 3;
    setTerrain(level, x, y, T.floor);
    if (seeIt) msgtxt = 'zap.water_evaporates';
  }
  say(ctx, msgtxt); // Norep()
  if (isPoolTyp) {
    unhideSwimmer(ctx, level, x, y);
    const t = maketrap(ctx, level.id, x, y, TRAP.pit);
    // if water walking/swimming/magical breathing, maybe fall into the new pit (after the water
    // evaporation message); if flying or levitating, nothing will happen
    if (heroAt(ctx, level, x, y)) dotrap(ctx, t);
    else {
      const mon = monAt(ctx, level, x, y);
      if (mon) mintrap(ctx, mon.id);
    }
  }
  return rangemod;
}

/**
 * Cold over (x, y) of the hero's level: a wall of water, and a wall of lava 4 times in 5 (`rn2(5)`),
 * only "freezes for a moment" and stops the ray; a pool or moat freezes into ice ("The water
 * freezes.", "The moat is bridged with ice!") with a melt timer, remembering what it was; lava
 * cools into floor ("The lava cools and solidifies."), a wall of lava into a wall; range -3. The
 * hero in the water is out of it; sinking into the lava, she is stuck in the rock (`rn1(50, 20)`
 * turns). Ice already timed is firmed up (its timer restarts from the time left). Returns the
 * range change. ref: src/zap.c zap_over_floor() ZT_COLD
 */
export function coldOverLiquid(ctx: Ctx, level: Level, x: number, y: number): number {
  const seeIt = seen(ctx, level, x, y);
  const lavawall = terrainIdAt(level, x, y) === T.lavawall;
  if (isPool(ctx, level, x, y) || isLava(ctx, level, x, y) || lavawall) {
    const lava = isLava(ctx, level, x, y) || lavawall;
    const moat = isMoat(ctx, level, x, y);
    const chance = Math.max(2, 5); // 5 + level temperature * 10
    if (isWaterwall(ctx, level, x, y) || (lavawall && ctx.rng.rn2(chance))) {
      // for now, don't let WATER freeze
      if (seeIt)
        say(ctx, 'zap.freezes_moment', { liquid: lavawall ? '@surface.lava' : '@surface.water' });
      else say(ctx, 'zap.soft_crackling');
      return -1000; // stop
    }
    const name = `@${waterbodyName(ctx, level, x, y)}`; // for MOAT
    if (isRaisedSpan(level, x, y)) {
      // the moat or lava under a raised drawbridge: DB_ICE or DB_FLOOR
      setDrawbridgeUnder(ctx, level, x, y, lava ? 'floor' : 'ice');
    } else {
      if (!lava)
        setIcedpool(ctx, level, x, y, terrainIdAt(level, x, y) === T.pool ? 'pool' : 'moat');
      if (lavawall) {
        const wallAt = (yy: number): boolean =>
          yy >= 0 && yy < level.height && isWallId(terrainIdAt(level, x, yy));
        setTerrain(level, x, y, wallAt(y - 1) || wallAt(y + 1) ? T.vwall : T.hwall);
      } else setTerrain(level, x, y, lava ? T.floor : T.ice);
    }
    if (seeIt) {
      if (lava) say(ctx, 'zap.lava_cools');
      else if (moat) say(ctx, 'zap.bridged_ice', { water: name });
      else say(ctx, 'zap.water_freezes');
    } else if (!lava) say(ctx, 'zap.crackling_sound');
    if (heroAt(ctx, level, x, y)) {
      const u = utrap(ctx);
      if (uinwater(ctx)) {
        // leave the no longer existent water
        setUinwater(ctx, false);
      } else if (u?.type === 'lava') {
        setUtrap(ctx, ctx.rng.rn2(50) + 20, 'infloor'); // rn1(50, 20)
        say(ctx, 'zap.stuck_cooling_rock');
      }
    } else unhideSwimmer(ctx, level, x, y);
    if (!lava) startMeltIceTimeout(ctx, level.id, x, y, 0);
    return -3;
  }
  if (isIce(ctx, level, x, y)) {
    // already ice here, so just firm it up; only ice that is already timed is affected
    const meltTime = meltTimeLeft(ctx, level.id, x, y);
    if (meltTime) {
      stopMeltTimer(ctx, level.id, x, y);
      startMeltIceTimeout(ctx, level.id, x, y, meltTime);
    }
  }
  return 0;
}

/** Registers the melt timer and the rays' water, lava and ice effects. */
export function registerIce(api: ModApi): void {
  api.defineTimer({ id: MELT_ICE_AWAY, fire: meltIceAway });
  setLiquidRay((ctx, level, x, y, ray) =>
    ray === 'fire' ? fireOverLiquid(ctx, level, x, y) : coldOverLiquid(ctx, level, x, y),
  );
}
