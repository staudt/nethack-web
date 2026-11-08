// The Minetown Watch: watchmen and the watch captain keep the peace in town, warn a hero who damages
// a door or picks a lock in their sight, and all turn hostile together when she goes on.
// ref: src/mon.c angry_guards(), pacify_guards(), peacefuls_respond() (is_watch);
// src/monmove.c watch_on_duty(), mon_yells(); src/dokick.c watchman_thief_arrest(),
// watchman_door_damage(); src/uhitm.c hmon() `anger_guards`
//
// src/fountain.c watchman_warn_fountain(); src/dig.c watch_dig()
//
// Not ported: shops (6b3), the Deaf branches (the hero is never deaf) and the shrill-whistle sound
// effect.
import {
  cellIndex,
  cellRules,
  getPlayer,
  inTown,
  sortedIds,
  type Ctx,
  type Entity,
  type EntityId,
  type Msg,
} from '@nh/core';
import { blockersOf } from './boulder';
import { clearPath } from './clearpath';
import { diggingOf, isDigging, stopDigging } from './digstate';
import { pickingLock, stopPicking } from './lockstate';
import { isFrozen, mcansee, unfreezeMonst } from './mstate';
import { canSpotMon, monNam } from './perception';
import { invisTo } from './apparxy';
import { T, isSdoorId, isWallId, terrainIdAt } from './terrain';

export const WATCHMAN = 'nh:watchman';
export const WATCH_CAPTAIN = 'nh:watch_captain';

/** ref: include/mondata.h is_watch() */
export const isWatch = (def: string): boolean => def === WATCHMAN || def === WATCH_CAPTAIN;

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/** The living monsters on the hero's level, in id order (C's fmon list). */
function levelMonsters(ctx: Ctx): Entity[] {
  const out: Entity[] = [];
  for (const id of sortedIds(ctx.state)) {
    const e = ctx.state.entities[String(id)];
    if (e?.c.monster && e.c.pos?.level === ctx.state.currentLevel) out.push(e);
  }
  return out;
}

/**
 * couldsee(x, y): a clear line from the hero to the square, lit or not. ref: src/vision.c
 * couldsee()
 */
function couldSee(ctx: Ctx, mon: Entity): boolean {
  const p = mon.c.pos;
  const hp = getPlayer(ctx.state).c.pos;
  const level = p ? ctx.state.levels[p.level] : undefined;
  if (!p || !hp || !level || hp.level !== p.level) return false;
  const opaque = cellRules(level, ctx.defs).opaque;
  return clearPath(level, opaque, hp.x, hp.y, p.x, p.y, blockersOf(ctx, level.id));
}

/**
 * Angers every peaceful member of the Watch on the level; true if there was one. Unless `silent`,
 * says what the hero notices: the guards waking up, getting angry (one next to her) or
 * approaching (seen further away), or else a whistle. Sleeping and paralysed guards wake up.
 * ref: src/mon.c angry_guards()
 */
export function angryGuards(ctx: Ctx, silent: boolean): boolean {
  let ct = 0;
  let nct = 0;
  let sct = 0;
  let slct = 0;
  const hp = getPlayer(ctx.state).c.pos;
  for (const mon of levelMonsters(ctx)) {
    const m = mon.c.monster;
    const p = mon.c.pos;
    if (!m || !p || !isWatch(mon.def) || !m.peaceful) continue;
    ct++;
    const frozen = isFrozen(ctx, mon.id);
    if (canSpotMon(ctx, mon) && !frozen) {
      // m_next2u()
      if (hp && Math.abs(p.x - hp.x) <= 1 && Math.abs(p.y - hp.y) <= 1) nct++;
      else sct++;
    }
    if (m.asleep || frozen) {
      slct++;
      m.asleep = false;
      unfreezeMonst(ctx, mon.id);
    }
    m.peaceful = false;
  }
  if (!ct) return false;
  if (!silent) {
    if (slct) say(ctx, slct === 1 ? 'watch.guard_wakes' : 'watch.guards_wake');
    if (nct) say(ctx, nct === 1 ? 'watch.guard_angry' : 'watch.guards_angry');
    else if (sct) say(ctx, sct === 1 ? 'watch.guard_approaching' : 'watch.guards_approaching');
    else say(ctx, ct === 1 ? 'watch.whistle' : 'watch.whistles');
  }
  return true;
}

/** Makes the whole Watch on the level peaceful again. ref: src/mon.c pacify_guards() */
export function pacifyGuards(ctx: Ctx): void {
  for (const mon of levelMonsters(ctx)) {
    const m = mon.c.monster;
    if (m && isWatch(mon.def)) m.peaceful = true;
  }
}

/** '"A watchman yells:"' (or "You hear someone yell:") and the shout. ref: mon_yells() */
export function monYells(ctx: Ctx, mon: Entity, shout: string): void {
  if (canSpotMon(ctx, mon)) say(ctx, 'watch.yells', { mon: monNam(ctx, mon) });
  else say(ctx, 'watch.someone_yells');
  say(ctx, shout);
}

// D_WARNED: a door the Watch has warned the hero about, kept by level and cell index in
// `modData.nh.watchWarned` (C keeps it in the location's `looted` bits).
type Warned = Record<string, number[]>;

function warnedTable(ctx: Ctx, create: boolean): Warned | null {
  const md = ctx.state.modData;
  const nh = md['nh'] as { watchWarned?: Warned } | undefined;
  if (nh?.watchWarned) return nh.watchWarned;
  if (!create) return null;
  const d = (md['nh'] ??= {}) as { watchWarned?: Warned };
  d.watchWarned = {};
  return d.watchWarned;
}

function isWarned(ctx: Ctx, level: string, x: number, y: number): boolean {
  const l = ctx.state.levels[level];
  if (!l) return false;
  return warnedTable(ctx, false)?.[level]?.includes(cellIndex(l, x, y)) ?? false;
}

function setWarned(ctx: Ctx, level: string, x: number, y: number): void {
  const l = ctx.state.levels[level];
  const t = warnedTable(ctx, true);
  if (!l || !t) return;
  const list = (t[level] ??= []);
  const i = cellIndex(l, x, y);
  if (!list.includes(i)) {
    list.push(i);
    list.sort((a, b) => a - b);
  }
}

/** A peaceful watchman the hero could see, the first in id order (get_iter_mons()). */
function watchmanInSight(ctx: Ctx): Entity | null {
  for (const mon of levelMonsters(ctx))
    if (isWatch(mon.def) && mon.c.monster?.peaceful && couldSee(ctx, mon)) return mon;
  return null;
}

/**
 * A peaceful watchman that sees the hero, the first in id order (get_iter_mons()).
 * ref: src/dig.c watchman_canseeu(): mcansee && m_canseeu()
 */
function watchmanCanSeeU(ctx: Ctx): Entity | null {
  for (const mon of levelMonsters(ctx))
    if (
      isWatch(mon.def) &&
      mon.c.monster?.peaceful &&
      mcansee(ctx, mon.id) &&
      !invisTo(ctx, mon) &&
      couldSee(ctx, mon)
    )
      return mon;
  return null;
}

/**
 * The hero used a town fountain: a peaceful watchman she could see yells "Hey, stop using that
 * fountain!". Returns whether one did. ref: src/fountain.c watchman_warn_fountain() through
 * get_iter_mons() (the hero is never deaf)
 */
export function watchmanWarnFountain(ctx: Ctx): boolean {
  const mon = watchmanInSight(ctx);
  if (!mon) return false;
  say(ctx, 'watch.yells', { mon: monNam(ctx, mon) });
  say(ctx, 'watch.stop_fountain');
  return true;
}

/**
 * The hero broke a door in town: a watchman in sight arrests her.
 * ref: src/dokick.c kick_door() `get_iter_mons(watchman_thief_arrest)`
 */
export function watchmanThiefArrest(ctx: Ctx, x: number, y: number): void {
  const level = ctx.state.levels[ctx.state.currentLevel];
  if (!level || !inTown(level, x, y)) return;
  const mon = watchmanInSight(ctx);
  if (!mon) return;
  monYells(ctx, mon, 'watch.halt_thief');
  angryGuards(ctx, false);
}

/**
 * The hero damaged a door in town without breaking it: a watchman in sight warns her, and
 * arrests her if the door was already warned about.
 * ref: src/dokick.c kick_door() `get_iter_mons_xy(watchman_door_damage, x, y)`
 */
export function watchmanDoorDamage(ctx: Ctx, x: number, y: number): void {
  const level = ctx.state.levels[ctx.state.currentLevel];
  if (!level || !inTown(level, x, y)) return;
  const mon = watchmanInSight(ctx);
  if (!mon) return;
  if (isWarned(ctx, level.id, x, y)) {
    monYells(ctx, mon, 'watch.halt_vandal');
    angryGuards(ctx, false);
  } else {
    monYells(ctx, mon, 'watch.stop_damaging_door');
    setWarned(ctx, level.id, x, y);
  }
}

/**
 * A peaceful watchman's look around on its turn: a hero picking the lock of a locked door in town
 * is warned once, then arrested, and stops; one digging into a town wall, door or tree is warned,
 * then arrested (watch_dig()). `in_town(u.ux + u.dx, u.uy + u.dy)` is the door's square while she
 * picks a lock, the dug square while she digs sideways, else her own (u.dx is not kept); the
 * 1-in-3 roll is drawn either way, as in C. ref: src/monmove.c watch_on_duty()
 */
export function watchOnDuty(ctx: Ctx, id: EntityId): void {
  const mon = ctx.state.entities[String(id)];
  const m = mon?.c.monster;
  const hp = getPlayer(ctx.state).c.pos;
  const level = hp ? ctx.state.levels[hp.level] : undefined;
  if (!mon || !m || !m.peaceful || !hp || !level) return;
  const door = pickingLock(ctx);
  const dig = isDigging(ctx) ? diggingOf(ctx) : null;
  const at =
    door && door.level === hp.level ? door : dig && !dig.down && dig.level === hp.level ? dig : hp;
  // mcansee && m_canseeu()
  if (
    !inTown(level, at.x, at.y) ||
    !mcansee(ctx, id) ||
    invisTo(ctx, mon) ||
    !couldSee(ctx, mon) ||
    ctx.rng.rn2(3) !== 0
  )
    return;
  if (!door || door.level !== hp.level) {
    if (dig) watchDigBy(ctx, mon, dig.x, dig.y, false);
    return;
  }
  const tid = level.palette[level.cells[cellIndex(level, door.x, door.y)] ?? 0];
  if (tid === undefined || ctx.defs.terrain(tid).door !== 'locked') return;
  // couldsee(mtmp->mx, mtmp->my) again in C: the same test here
  if (isWarned(ctx, level.id, door.x, door.y)) {
    monYells(ctx, mon, 'watch.halt_thief');
    angryGuards(ctx, false);
  } else {
    monYells(ctx, mon, 'watch.stop_picking');
    setWarned(ctx, level.id, door.x, door.y);
  }
  stopPicking(ctx);
}

/**
 * The hero zaps digging at a town door, secret door, wall, fountain or tree (C: or a tree): a
 * peaceful watchman that sees her says "Halt, vandal!  You're under arrest!" and the Watch turns
 * hostile. Call it before the terrain changes. ref: src/dig.c watch_dig() with `zap` TRUE and
 * watchman_canseeu()
 */
export function watchDig(ctx: Ctx, x: number, y: number): void {
  watchDigBy(ctx, null, x, y, true);
}

/**
 * Town Watchmen frown on damage to the town walls, doors, trees or fountains (digging holes in
 * the ground is fine): `mon` (else a peaceful watchman that sees her) warns her once ("Hey, stop
 * damaging that wall!") while she digs with a pick, and arrests her ("Halt, vandal!") for a zap
 * or when already warned; either way the digging stops. ref: src/dig.c watch_dig()
 */
function watchDigBy(ctx: Ctx, mon: Entity | null, x: number, y: number, zap: boolean): void {
  const level = ctx.state.levels[ctx.state.currentLevel];
  if (!level || !inTown(level, x, y)) return;
  const id = terrainIdAt(level, x, y);
  const door = id === undefined ? undefined : ctx.defs.terrain(id).door;
  const closed = door === 'closed' || door === 'locked';
  if (!closed && !isSdoorId(id) && !isWallId(id) && id !== T.fountain && id !== T.tree) return;
  const mtmp = mon ?? watchmanCanSeeU(ctx);
  if (!mtmp) return;
  const dig = diggingOf(ctx);
  if (zap || dig?.warned) {
    say(ctx, 'watch.halt_vandal'); // verbalize()
    angryGuards(ctx, false);
  } else {
    // IS_DOOR(): a closed door (a secret door is still a wall); IS_OBSTRUCTED(): wall
    const what = closed ? 'door' : id === T.tree ? 'tree' : id === T.fountain ? 'fountain' : 'wall';
    say(ctx, `watch.stop_damaging_${what}`);
    if (dig) dig.warned = true;
  }
  stopDigging(ctx); // if (is_digging()) stop_occupation()
}
