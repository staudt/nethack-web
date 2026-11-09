// Treasure vaults: core's level generator makes the closed 2x2 room and the teleporter's niche
// and hands them over as `Level.vaultSpot` / `Level.vaultTeleSpot`; this module types the room,
// fills it with gold and keeps the once-only teleporter. Then the vault guard: after
// VAULT_GUARD_TIME turns in the vault he comes through the wall, asks her name (a text prompt
// raised at the end of the turn), makes her drop her gold and leads her out along a fake
// corridor that closes behind them.
// ref: src/mklev.c makelevel() do_vault block, makevtele(), makeniche(TELEP_TRAP);
// src/sp_lev.c fill_special_room() VAULT; src/vault.c; src/allmain.c moveloop_core() invault()
//
// Not ported (DEVIATIONS.md "Special rooms"): the Fort Ludios portal (mk_knox_portal()) and the
// "ad aerarium" engraving by the niche. NetHack's teleporter sits on the secret corridor square
// itself; here traps live only on plain floor, so it is kept aside (vaultstate.ts) and made on
// the square once the corridor is found (searching, digging, a wand of secret door detection...),
// after the hero's action or at the end of the turn, before she can step there.
//
// The guard (DEVIATIONS.md "Vaults"): C keeps a dismissed or dead guard on the monster list at
// <0,0> until his corridor is gone; here the monster is removed and his record (vaultstate.ts
// `Egd.parked`) closes the corridor at the end of each turn. A guard killed by any means is
// noticed after the hero's action or at the end of the turn (grddead()). No deaf hero, no hero
// hiding or mimicking, no gold eating (the guard never witnesses it), no Croesus (so his name
// always sends the guard away), no Punishment, no graves (paygd()'s grave for Croesus).
import { mAt } from './wormstate';
import {
  cellIndex,
  cellRules,
  getLevel,
  getPlayer,
  inRooms,
  inventoryOf,
  isPlainFloor,
  itemsAt,
  trapAt,
  type ActionDef,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type Json,
  type Level,
  type ModApi,
  type Pos,
} from '@nh/core';
import { sticks } from './adtyping';
import { blockersOf, BOULDER, ROCK, fractureRock } from './boulder';
import { clearPath } from './clearpath';
import { makemon, mnextoPos } from './generation';
import { isHelpless } from './hunger';
import { mapInvisible, monVisible } from './invis';
import { mkgold, placeOnFloor, stackobj } from './items';
import { forgetMonster, minvent } from './mongear';
import { moneyCnt } from './money';
import { forgetMState } from './mstate';
import { unmulNow } from './nomul';
import { mungspaces } from './objnam_read';
import { canSpotMon, monNam } from './perception';
import { P, hasProp, isStrangled } from './props';
import { containedGold } from './price';
import { T, isObstructedId, isStwallId, isWallId, setTerrain, terrainIdAt } from './terrain';
import { TRAP, cansee, maketrap, rlocMon, rlocTo } from './trap';
import { heroForm } from './upoly';
import { uRooms } from './urooms';
import { ustuck } from './hackmove';
import {
  VAULT,
  VAULT_GUARD_TIME,
  deleteEgd,
  egdIds,
  egdOf,
  findgd,
  pendingVaultTele,
  pendingVaultTeles,
  setEgd,
  setGuardCode,
  setPendingVaultTele,
  setUinvault,
  uinvault,
  vaultOccupied,
  type Egd,
} from './vaultstate';
import { deaths } from './vanquished';
import { uswallow } from './engulfstate';
import { mpickobj } from './steal';

/**
 * Turns level generation's vault request into the `nh:vault` room (lit, after the other rooms
 * as C adds it), fills it with gold and keeps the teleporter request; deletes both requests, so
 * no saved level has them. Run first in mklev's `newLevel` hook: the vault exists before the
 * special-room chain, which counts it. ref: src/mklev.c makelevel() do_vault block
 */
export function mkVault(ctx: Ctx, level: Level): void {
  const spot = level.vaultSpot;
  const tele = level.vaultTeleSpot;
  delete level.vaultSpot;
  delete level.vaultTeleSpot;
  if (!spot) return;
  const idx =
    level.rooms.push({
      lx: spot.x,
      ly: spot.y,
      hx: spot.x + 1,
      hy: spot.y + 1,
      lit: true,
      type: VAULT,
    }) - 1;
  fillVault(ctx, level, idx); // fill_special_room() at once
  if (tele) setPendingVaultTele(ctx, level.id, cellIndex(level, tele.x, tele.y));
}

/**
 * Gold on every square of the vault, `rn1(100 * depth, 51)` pieces each, added to any gold
 * there. ref: src/sp_lev.c fill_special_room() case VAULT
 */
export function fillVault(ctx: Ctx, level: Level, roomIndex: number): void {
  const r = level.rooms[roomIndex];
  if (!r) return;
  const depth = Math.abs(level.depth);
  for (let x = r.lx; x <= r.hx; x++)
    for (let y = r.ly; y <= r.hy; y++)
      mkgold(ctx, ctx.rng.rn2(depth * 100) + 51, { level: level.id, x, y });
}

/**
 * Makes each hidden vault teleporter whose secret corridor is no longer secret: a once-only
 * teleportation trap, unseen. ref: src/mklev.c makeniche() maketrap(), `ttmp->once = 1`
 */
export function revealVaultTele(ctx: Ctx): void {
  for (const lid of pendingVaultTeles(ctx.state)) {
    const cell = pendingVaultTele(ctx.state, lid);
    const level = ctx.state.levels[lid];
    if (cell === null || !level) continue;
    const x = cell % level.width;
    const y = Math.trunc(cell / level.width);
    const id = terrainIdAt(level, x, y);
    if (id === T.scorr) continue;
    setPendingVaultTele(ctx, lid, null);
    // found, the secret corridor is a corridor (anything else: the square is no longer the niche)
    if (id === T.corr && isPlainFloor(ctx.defs, level, x, y) && !trapAt(level, x, y))
      maketrap(ctx, lid, x, y, TRAP.tele).once = true;
  }
}

// ---------------------------------------------------------------------------------------------
// the vault guard

/** ref: include/monsters.h PM_GUARD */
export const GUARD = 'nh:guard';
/** The action that answers the guard's question (offered nowhere). */
export const VAULT_GUARD_ID = 'nh:vault_guard';
/** ref: include/global.h PL_NSIZ - 1 */
const NAME_MAX = 31;

type GdMoveResult = -2 | -1 | 0 | 1;

const say = (ctx: Ctx, key: string, params?: Record<string, string | number>): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const heroP = (ctx: Ctx): Pos & { level: string } => {
  const p = getPlayer(ctx.state).c.pos;
  if (!p) throw new Error('Player has no position');
  return p;
};

const monOf = (ctx: Ctx, id: EntityId): Entity | null => {
  const e = ctx.state.entities[String(id)];
  return e?.c.monster && e.c.pos ? e : null;
};

/** ref: include/hack.h um_dist(): farther than n squares from the hero */
const umDist = (ctx: Ctx, x: number, y: number, n: number): boolean => {
  const h = heroP(ctx);
  return Math.abs(h.x - x) > n || Math.abs(h.y - y) > n;
};

const heroAt = (ctx: Ctx, x: number, y: number): boolean => {
  const h = heroP(ctx);
  return h.x === x && h.y === y;
};

/** ref: include/rm.h IS_ROOM(): floor and what stands on it, not doors or corridors */
const isRoomTyp = (ctx: Ctx, id: DefId | undefined): boolean =>
  id !== undefined &&
  ctx.defs.terrain(id).door === undefined &&
  !isObstructedId(id) &&
  id !== T.corr &&
  id !== T.iron_bars;

/** ref: include/rm.h `typ == DOOR` (any door, not a secret one) */
const isDoorTyp = (ctx: Ctx, id: DefId | undefined): boolean =>
  id !== undefined && ctx.defs.terrain(id).door !== undefined;

/** ref: include/rm.h ACCESSIBLE(): a door or anything walkable */
const accessibleTyp = (id: DefId | undefined): boolean =>
  id !== undefined && !isObstructedId(id) && id !== T.iron_bars;

/** couldsee(): a line of sight from the hero, lit or not. ref: src/vision.c */
function couldsee(ctx: Ctx, level: Level, x: number, y: number): boolean {
  const h = heroP(ctx);
  if (h.level !== level.id) return false;
  const opaque = cellRules(level, ctx.defs).opaque;
  return clearPath(level, opaque, h.x, h.y, x, y, blockersOf(ctx, level.id));
}

/** map_location(x, y, 1): the hero's map shows the square as it is now, seen or not. */
function mapLocation(ctx: Ctx, level: Level, x: number, y: number): void {
  const memory = ctx.state.memory[level.id];
  const i = cellIndex(level, x, y);
  if (memory && memory[i] !== undefined) memory[i] = level.cells[i] ?? 0;
}

const goldAt = (ctx: Ctx, level: Level, x: number, y: number): Entity[] =>
  itemsAt(ctx.defs, ctx.state, level.id, x, y).filter(
    (o) => ctx.defs.object(o.def).class === 'coin',
  );

/**
 * The gold in the hero's containers. ref: src/vault.c hidden_gold(TRUE) (statues hold none here)
 */
export function hiddenGold(ctx: Ctx): number {
  let value = 0;
  for (const o of inventoryOf(ctx.state, ctx.state.playerId))
    value += containedGold(ctx.state, ctx.defs, o);
  return value;
}

const uCarryGold = (ctx: Ctx): boolean =>
  moneyCnt(ctx, ctx.state.playerId) > 0 || hiddenGold(ctx) > 0;

/** ref: src/vault.c in_fcorridor() */
function inFcorridor(egd: Egd, x: number, y: number): boolean {
  for (let i = egd.fcbeg; i < egd.fakecorr.length; i++) {
    const f = egd.fakecorr[i];
    if (f && f.x === x && f.y === y) return true;
  }
  return false;
}

/**
 * The corridor square she is led to: the nearest one (in rings from distance 2) whose square
 * toward her is rock or corridor. ref: src/vault.c find_guard_dest() (with no corridor at all C
 * teleports her: never on a level with a vault)
 */
function findGuardDest(ctx: Ctx, level: Level, guard: EntityId | null): Pos | null {
  const h = heroP(ctx);
  const g = guard === null ? null : monOf(ctx, guard);
  const egd = guard === null ? null : egdOf(ctx.state, guard);
  for (let dd = 2; dd < level.height || dd < level.width; dd++) {
    let next = false;
    for (let y = h.y - dd; y <= h.y + dd && !next; y++) {
      if (y < 0 || y > level.height - 1) continue;
      for (let x = h.x - dd; x <= h.x + dd; x++) {
        if (y !== h.y - dd && y !== h.y + dd && x !== h.x - dd) x = h.x + dd;
        if (x < 1 || x > level.width - 1) continue;
        if (g?.c.pos && g.c.pos.x === x && g.c.pos.y === y) continue;
        if (egd && inFcorridor(egd, x, y)) continue;
        if (terrainIdAt(level, x, y) === T.corr) {
          const lx = x < h.x ? x + 1 : x > h.x ? x - 1 : x;
          const ly = y < h.y ? y + 1 : y > h.y ? y - 1 : y;
          const t = terrainIdAt(level, lx, ly);
          if (t !== T.stone && t !== T.corr) {
            next = true; // goto incr_radius
            break;
          }
          return { x, y };
        }
      }
    }
  }
  return null;
}

/** The wall shape of the vault's wall square x,y. ref: src/vault.c invault(), wallify_vault() */
function vaultWallTyp(level: Level, vroom: number, x: number, y: number): DefId | null {
  const r = level.rooms[vroom];
  if (!r) return null;
  const lox = r.lx - 1;
  const hix = r.hx + 1;
  const loy = r.ly - 1;
  const hiy = r.hy + 1;
  if (x === lox) return y === loy ? T.tlcorn : y === hiy ? T.blcorn : T.vwall;
  if (x === hix) return y === loy ? T.trcorn : y === hiy ? T.brcorn : T.vwall;
  if (y === loy || y === hiy) return T.hwall;
  return null;
}

/**
 * Removes the guard monster and his things (mongone()); his record stays while his corridor
 * does (parkguard()).
 */
function removeGuardMonster(ctx: Ctx, id: EntityId): void {
  const e = ctx.state.entities[String(id)];
  if (!e) return;
  for (const o of minvent(ctx, id)) ctx.remove(o.id);
  forgetMonster(ctx, id);
  forgetMState(ctx, id);
  ctx.remove(id);
}

/** ref: src/vault.c parkguard(): the guard leaves the map until his corridor is gone */
function parkguard(ctx: Ctx, id: EntityId, egd: Egd): void {
  removeGuardMonster(ctx, id);
  egd.parked = true;
  egd.ogx = 0;
  egd.ogy = 0;
}

/**
 * Takes back the fake corridor from its vault end, square by square, while no one stands on
 * it and (unless `forceshow`) the hero could not see it change; true once it is all gone.
 * ref: src/vault.c clear_fcorr(), blackout() (no ball and chain, no engravings)
 */
function clearFcorr(ctx: Ctx, id: EntityId, egd: Egd, forceshow: boolean): boolean {
  if (egd.gdlevel !== ctx.state.currentLevel) return true;
  const level = getLevel(ctx.state, egd.gdlevel);
  const h = heroP(ctx);
  const dead = egd.dead === true;
  let sawcorridor = false;
  while (egd.fcbeg < egd.fakecorr.length) {
    const fc = egd.fakecorr[egd.fcbeg];
    if (!fc) break;
    if ((dead || !inFcorridor(egd, h.x, h.y)) && egd.gddone) forceshow = true;
    if ((heroAt(ctx, fc.x, fc.y) && !dead) || (!forceshow && couldsee(ctx, level, fc.x, fc.y)))
      return false;
    const mon = monAt(ctx, level, fc.x, fc.y);
    if (mon) {
      if (egdOf(ctx.state, mon.id)) return false;
      rlocMon(ctx, mon, true); // (m_into_limbo() when there is no room: not ported)
    }
    if (terrainIdAt(level, fc.x, fc.y) === T.corr && cansee(ctx, level.id, fc.x, fc.y))
      sawcorridor = true;
    setTerrain(level, fc.x, fc.y, fc.ftyp);
    if (isStwallId(fc.ftyp)) {
      // destroy any trap here when the spot reverts to stone
      if (trapAt(level, fc.x, fc.y)) ctx.removeTrap(level.id, { x: fc.x, y: fc.y });
      // undo light affecting this spot
      if (fc.ftyp === T.stone) blackout(level, fc.x, fc.y);
    }
    mapLocation(ctx, level, fc.x, fc.y);
    egd.fcbeg++;
  }
  if (sawcorridor) say(ctx, 'vault.corridor_disappears');
  if (isObstructedId(terrainIdAt(level, h.x, h.y)) && (getPlayer(ctx.state).c.hp?.cur ?? 0) > 0)
    say(ctx, 'vault.encased');
  return true;
}

/** ref: src/vault.c blackout(): rock around a closed corridor square is unlit */
function blackout(level: Level, x: number, y: number): void {
  for (let i = x - 1; i <= x + 1; i++)
    for (let j = y - 1; j <= y + 1; j++) {
      if (i < 0 || j < 0 || i >= level.width || j >= level.height) continue;
      if (terrainIdAt(level, i, j) === T.stone) level.lit[cellIndex(level, i, j)] = 0;
    }
}

const monAt = (ctx: Ctx, level: Level, x: number, y: number): Entity | null =>
  mAt(ctx.state, level.id, x, y); // a worm's tail square holds the worm

/** The guard is gone (or will be) once his corridor is. ref: src/vault.c restfakecorr() */
function restfakecorr(ctx: Ctx, id: EntityId, egd: Egd): void {
  // it seems you left the corridor - let the guard disappear
  if (clearFcorr(ctx, id, egd, false)) {
    removeGuardMonster(ctx, id);
    deleteEgd(ctx, id);
  }
}

/**
 * The guard has died (by any means): his corridor goes at once if it can, else he is kept
 * parked until it can. ref: src/vault.c grddead() (his gold vanished in relobj())
 */
function grddead(ctx: Ctx, id: EntityId, egd: Egd): void {
  egd.dead = true;
  egd.parked = true;
  egd.ogx = 0;
  egd.ogy = 0;
  if (clearFcorr(ctx, id, egd, true)) deleteEgd(ctx, id);
}

/**
 * The guard goes away (C's mongone() of a guard): removed at once, his corridor as soon as it
 * can be. ref: src/mon.c mongone() -> grddead()
 */
function guardGone(ctx: Ctx, id: EntityId): void {
  const egd = egdOf(ctx.state, id);
  removeGuardMonster(ctx, id);
  if (!egd) return;
  egd.parked = true;
  if (clearFcorr(ctx, id, egd, true)) deleteEgd(ctx, id);
}

/** ref: src/vault.c move_gold(): gold on the vault's wall goes back inside */
function moveGold(ctx: Ctx, level: Level, gold: Entity, vroom: number): void {
  const r = level.rooms[vroom];
  if (!r) return;
  const nx = r.lx + ctx.rng.rn2(2);
  const ny = r.ly + ctx.rng.rn2(2);
  delete gold.c.pos; // remove_object()
  const id = placeOnFloor(ctx, gold.id, level.id, nx, ny);
  stackobj(ctx, id);
}

/**
 * The guard repairs the vault's walls (dug through, or holding gold, rocks or boulders) outside
 * his own corridor: monsters there are moved off, gold goes back in, rocks, boulders and traps
 * vanish. `at` is where the guard is (null once parked).
 * ref: src/vault.c wallify_vault() (no engravings)
 */
function wallifyVault(ctx: Ctx, id: EntityId, egd: Egd): void {
  const level = getLevel(ctx.state, egd.gdlevel);
  const r = level.rooms[egd.vroom];
  if (!r) return;
  const lox = r.lx - 1;
  const hix = r.hx + 1;
  const loy = r.ly - 1;
  const hiy = r.hy + 1;
  let fixed = false;
  let movedgold = false;
  for (let x = lox; x <= hix; x++)
    for (let y = loy; y <= hiy; y++) {
      // if not on the room boundary, skip ahead
      if (x !== lox && x !== hix && y !== loy && y !== hiy) continue;
      const here = itemsAt(ctx.defs, ctx.state, level.id, x, y);
      const rocky = here.some((o) => o.def === ROCK || o.def === BOULDER);
      const gold = goldAt(ctx, level, x, y);
      if (
        (!isWallId(terrainIdAt(level, x, y)) || gold.length > 0 || rocky) &&
        !inFcorridor(egd, x, y)
      ) {
        const mon = monAt(ctx, level, x, y);
        if (mon && mon.id !== id) rlocMon(ctx, mon, true); // (no yelp, no m_into_limbo())
        // move gold at wall locations into the vault
        for (const g of gold) {
          moveGold(ctx, level, g, egd.vroom);
          movedgold = true;
        }
        // destroy rocks and boulders (subsume them into the walls)
        for (const o of here) if (o.def === ROCK || o.def === BOULDER) ctx.remove(o.id);
        if (trapAt(level, x, y)) ctx.removeTrap(level.id, { x, y });
        const typ = vaultWallTyp(level, egd.vroom, x, y);
        if (typ) setTerrain(level, x, y, typ);
        // the hero knows the walls are restored because of the message: show them
        const memory = ctx.state.memory[level.id];
        if (memory) memory[cellIndex(level, x, y)] = level.cells[cellIndex(level, x, y)] ?? 0;
        fixed = true;
      }
    }
  if (movedgold || fixed) {
    const g = monOf(ctx, id);
    const gp = g?.c.pos;
    if (g && gp && (inFcorridor(egd, gp.x, gp.y) || cansee(ctx, gp.level, gp.x, gp.y)))
      say(ctx, 'vault.incantation', { mon: monNam(ctx, g) });
    else say(ctx, 'vault.distant_chant');
    if (movedgold) say(ctx, 'vault.gold_moved');
    if (fixed) say(ctx, 'vault.walls_restored');
  }
}

/** "Out of my way, scum!": a monster on the guard's next square is moved off. ref: gd_mv_monaway() */
function gdMvMonaway(ctx: Ctx, id: EntityId, level: Level, nx: number, ny: number): void {
  const mon = monAt(ctx, level, nx, ny);
  if (mon && mon.id !== id) {
    say(ctx, 'vault.out_of_my_way');
    rlocMon(ctx, mon, true); // (m_into_limbo() when there is no room: not ported)
  }
}

/** mpickgold(): the guard takes the gold at x,y. */
function guardTakesGold(ctx: Ctx, id: EntityId, level: Level, x: number, y: number): void {
  for (const g of goldAt(ctx, level, x, y)) {
    delete g.c.pos; // obj_extract_self()
    mpickobj(ctx, id, g);
  }
}

/**
 * The guard picks up the gold lying in his corridor (from under the hero too). C moves him to
 * the gold and back for the message; here he stays put (only the display differed).
 * ref: src/vault.c gd_pick_corridor_gold()
 */
function gdPickCorridorGold(ctx: Ctx, id: EntityId, egd: Egd, gx: number, gy: number): void {
  const level = getLevel(ctx.state, egd.gdlevel);
  const g = monOf(ctx, id);
  if (!g?.c.pos) return;
  const underU = heroAt(ctx, gx, gy);
  const seeIt = cansee(ctx, level.id, gx, gy);
  if (!underU && !(gx === g.c.pos.x && gy === g.c.pos.y)) gdMvMonaway(ctx, id, level, gx, gy);
  guardTakesGold(ctx, id, level, gx, gy);
  const calms = g.c.monster?.peaceful === true && egd.warncnt > 5;
  if (seeIt)
    say(ctx, `vault.picks_up_gold${calms ? '_calm' : ''}${underU ? '_under' : ''}`, {
      mon: canSpotMon(ctx, g) ? monNam(ctx, g) : '@vault.someone',
    });
}
/**
 * An angry guard lets her know he is coming. ref: src/vault.c gd_letknow()
 */
function gdLetknow(ctx: Ctx, g: Entity): void {
  const p = g.c.pos;
  if (!p) return;
  if (!cansee(ctx, p.level, p.x, p.y) || !monVisible(ctx, g)) {
    const whistle = minvent(ctx, g.id).some((o) => o.def === 'nh:tin_whistle');
    say(ctx, whistle ? 'vault.hear_whistle' : 'vault.hear_shouting');
  } else
    say(ctx, umDist(ctx, p.x, p.y, 2) ? 'vault.see_approaching' : 'vault.confronted', {
      mon: `@${g.def}`,
    });
}

/**
 * The guard's work is over: he leaves the map, the walls are repaired and the corridor closes
 * when it can. Returns 1 ("moved") when the hero sees him go, else -2.
 * ref: src/vault.c gd_move_cleanup()
 */
function gdMoveCleanup(
  ctx: Ctx,
  id: EntityId,
  egd: Egd,
  semiDead: boolean,
  disappearMsgSeen: boolean,
): GdMoveResult {
  const g = monOf(ctx, id);
  const at = g?.c.pos ? { x: g.c.pos.x, y: g.c.pos.y } : null;
  const seeGuard = g !== null && canSpotMon(ctx, g);
  const name = g ? monNam(ctx, g) : '';
  parkguard(ctx, id, egd); // move to <0,0>
  wallifyVault(ctx, id, egd);
  restfakecorr(ctx, id, egd);
  const h = heroP(ctx);
  if (!semiDead && at && (inFcorridor(egd, h.x, h.y) || cansee(ctx, egd.gdlevel, at.x, at.y))) {
    if (!disappearMsgSeen && seeGuard) say(ctx, 'vault.suddenly_disappears', { mon: name });
    return 1;
  }
  return -2;
}

/**
 * The guard's move: leads the hero out of the vault along the corridor he digs, warns her while
 * she lingers or keeps gold, gets angry when she does not listen. -1 lets the normal monster
 * move run (an angry guard, one teleported away), 0 he stays, 1 he moved, -2 he is gone.
 * ref: src/vault.c gd_move() (no deaf hero, no witnessed gold eating, no pools)
 */
export function gdMove(ctx: Ctx, id: EntityId): GdMoveResult {
  const egd = egdOf(ctx.state, id);
  const g = monOf(ctx, id);
  if (!egd || !g?.c.pos || !g.c.monster) return -1;
  if (egd.gdlevel !== ctx.state.currentLevel) return -1;
  if (egd.gddone) return gdMoveCleanup(ctx, id, egd, false, false);
  const m = g.c.monster;
  const level = getLevel(ctx.state, egd.gdlevel);
  const h = heroP(ctx);
  const gp = g.c.pos;
  // u.urooms, from where she is (teleds() calls this before the room check updates it, as C
  // fakes u.urooms there)
  const uInVault = vaultOccupied(level, inRooms(level, h.x, h.y)) !== null;
  const grdInVault = vaultOccupied(level, inRooms(level, gp.x, gp.y)) !== null;
  if (!uInVault && !grdInVault) wallifyVault(ctx, id, egd);

  if (!m.peaceful) {
    if (
      !uInVault &&
      (grdInVault || (inFcorridor(egd, gp.x, gp.y) && !inFcorridor(egd, h.x, h.y)))
    ) {
      rlocMon(ctx, g, true);
      wallifyVault(ctx, id, egd);
      const np = g.c.pos;
      if (np && !inFcorridor(egd, np.x, np.y)) clearFcorr(ctx, id, egd, true);
      gdLetknow(ctx, g);
      return -1;
    }
    if (!inFcorridor(egd, gp.x, gp.y)) clearFcorr(ctx, id, egd, true);
    return -1;
  }
  if (Math.abs(egd.ogx - gp.x) > 1 || Math.abs(egd.ogy - gp.y) > 1) return -1; // teleported

  const umoney = moneyCnt(ctx, ctx.state.playerId);
  const carry = umoney > 0 || hiddenGold(ctx) > 0;
  const restoreEntry = (x: number, y: number): void => {
    const f0 = egd.fakecorr[0];
    if (f0) setTerrain(level, x, y, f0.ftyp);
    mapLocation(ctx, level, x, y);
  };
  if (egd.fakecorr.length === 1) {
    if (uInVault && (carry || umDist(ctx, gp.x, gp.y, 1))) {
      if (egd.warncnt === 3) {
        const what = carry ? (umoney === 0 ? 'hidden_gold' : 'gold') : 'none';
        if (egd.dropgoldcnt || !carry) say(ctx, `vault.repeat_follow.${what}`);
        else say(ctx, `vault.follow.${what}`);
        if (carry) egd.dropgoldcnt++;
      }
      if (egd.warncnt === 7) {
        const mx = gp.x;
        const my = gp.y;
        say(ctx, 'vault.warned_knave');
        m.peaceful = false;
        const to = mnextoPos(ctx, level, id, h);
        if (to) rlocTo(ctx, g, to.x, to.y, false);
        restoreEntry(mx, my);
        return -1;
      }
      // not fair to get mad when (s)he's fainted or paralyzed
      if (!isHelpless(ctx)) egd.warncnt++;
      return 0;
    }
    if (!uInVault) {
      if (carry) {
        // player teleported
        const mx = gp.x;
        const my = gp.y;
        rlocMon(ctx, g, true);
        restoreEntry(mx, my); // guard corridor goes away
        m.peaceful = false;
        gdLetknow(ctx, g);
        return -1;
      }
      if ((gp.x - h.x) ** 2 + (gp.y - h.y) ** 2 <= 100) say(ctx, 'vault.begone');
      egd.gddone = true;
      return gdMoveCleanup(ctx, id, egd, false, false);
    }
  }

  if (egd.fakecorr.length > 1) {
    const f0 = egd.fakecorr[0];
    if (
      egd.fakecorr.length > 2 &&
      inFcorridor(egd, gp.x, gp.y) &&
      !egd.gddone &&
      !inFcorridor(egd, h.x, h.y) &&
      f0 &&
      terrainIdAt(level, f0.x, f0.y) === f0.ftyp
    ) {
      say(ctx, 'vault.confused_disappears', { mon: monNam(ctx, g) });
      return gdMoveCleanup(ctx, id, egd, false, true);
    }
    if (carry && (inFcorridor(egd, h.x, h.y) || uInVault)) {
      if (egd.warncnt < 6) {
        egd.warncnt = 6;
        say(ctx, 'vault.drop_all_gold');
        return 0;
      }
      say(ctx, 'vault.so_be_it');
      m.peaceful = false;
      return -1;
    }
  }
  // gold in the corridor (new gold can appear: kicked out of the rock, wished for and dropped)
  let goldPos: Pos | null = null;
  for (let i = egd.fcbeg; i < egd.fakecorr.length; i++) {
    const f = egd.fakecorr[i];
    if (f && goldAt(ctx, level, f.x, f.y).length > 0) {
      goldPos = { x: f.x, y: f.y };
      break;
    }
  }
  if (goldPos && !egd.gddone) {
    gdPickCorridorGold(ctx, id, egd, goldPos.x, goldPos.y);
    if (!m.peaceful) return -1;
    egd.warncnt = 5;
    return 0;
  }
  if (umDist(ctx, gp.x, gp.y, 1) || egd.gddone) {
    if (!egd.gddone && !ctx.rng.rn2(10) && !uswallow(ctx)) {
      const stuck = ustuck(ctx);
      const form = heroForm(ctx);
      if (stuck === null || (form !== null && sticks(form))) say(ctx, 'vault.move_along');
    }
    restfakecorr(ctx, id, egd);
    return 0; // didn't move
  }
  const x = gp.x;
  const y = gp.y;
  let nx = x;
  let ny = y;
  let typ: DefId | undefined;
  let dig = true; // the square needs making (C's `goto proceed` / fall through), else newpos
  let found = false;

  if (!uInVault) {
    // look around (hor & vert only) for accessible places
    for (let ax = x - 1; ax <= x + 1 && !found; ax++)
      for (let ay = y - 1; ay <= y + 1; ay++) {
        if (!((ax === x || ay === y) && (ax !== x || ay !== y))) continue;
        if (ax < 0 || ay < 0 || ax >= level.width || ay >= level.height) continue;
        const t = terrainIdAt(level, ax, ay);
        if (isStwallId(t)) continue;
        if (inFcorridor(egd, ax, ay)) continue;
        if (vaultOccupied(level, inRooms(level, ax, ay)) !== null) continue;
        // seems we found a good place to leave him alone
        egd.gddone = true;
        nx = ax;
        ny = ay;
        typ = t;
        if (accessibleTyp(t)) dig = false;
        else setTerrain(level, ax, ay, t === T.scorr ? T.corr : T.doorway);
        found = true;
        break;
      }
  }
  if (!found) {
    // nextpos: dig toward the goal
    for (let tries = 0; ; tries++) {
      nx = x;
      ny = y;
      const ggx = egd.gdx;
      const ggy = egd.gdy;
      const dx = ggx > x ? 1 : ggx < x ? -1 : 0;
      let dy = ggy > y ? 1 : ggy < y ? -1 : 0;
      if (Math.abs(ggx - x) >= Math.abs(ggy - y)) nx += dx;
      else ny += dy;
      let made = false;
      while ((typ = terrainIdAt(level, nx, ny)) !== T.stone) {
        const ex = nx + nx - x;
        const ey = ny + ny - y;
        // in view of the above we must have IS_WALL(typ) or typ == POOL: must be a wall here
        if (
          ex >= 0 &&
          ey >= 0 &&
          ex < level.width &&
          ey < level.height &&
          isRoomTyp(ctx, terrainIdAt(level, ex, ey))
        ) {
          setTerrain(level, nx, ny, T.doorway);
          made = true;
          break;
        }
        if (dy && nx !== x) {
          nx = x;
          ny = y + dy;
          continue;
        }
        if (dx && ny !== y) {
          ny = y;
          nx = x + dx;
          dy = 0;
          continue;
        }
        // I don't like this, but ...
        if (isRoomTyp(ctx, typ)) {
          setTerrain(level, nx, ny, T.doorway);
          made = true;
          break;
        }
        break;
      }
      if (!made) setTerrain(level, nx, ny, T.corr);
      // proceed:
      if (nx !== ggx || ny !== ggy || x !== ggx || y !== ggy || egd.gddone) break;
      // we're stuck, so try to find a new destination
      const dest = findGuardDest(ctx, level, id);
      if (!dest || (dest.x === ggx && dest.y === ggy) || tries > 100) {
        say(ctx, 'vault.confused_disappears', { mon: monNam(ctx, g) });
        return gdMoveCleanup(ctx, id, egd, false, true);
      }
      egd.gdx = dest.x;
      egd.gdy = dest.y;
    }
  }
  const newspot = dig;
  if (dig) {
    if (nx !== egd.gdx || ny !== egd.gdy || x !== egd.gdx || y !== egd.gdy) {
      // (the corridor never outgrows FCSIZ: ROWNO + COLNO)
      if (egd.fakecorr.length < level.width + level.height)
        egd.fakecorr.push({ x: nx, y: ny, ftyp: typ ?? T.stone });
    }
  }
  // newpos:
  gdMvMonaway(ctx, id, level, nx, ny);
  if (egd.gddone) return gdMoveCleanup(ctx, id, egd, false, false);
  egd.ogx = x; // update old positions
  egd.ogy = y;
  gp.x = nx;
  gp.y = ny;
  ctx.emit({ type: 'moved', id, from: { x, y }, to: { x: nx, y: ny } });
  if (newspot && goldAt(ctx, level, nx, ny).length > 0) {
    // gold already here (most likely from mineralize()): he picks it up now
    guardTakesGold(ctx, id, level, nx, ny);
    if (canSpotMon(ctx, g)) say(ctx, 'vault.picks_up_some_gold', { mon: monNam(ctx, g) });
  }
  restfakecorr(ctx, id, egd);
  return monOf(ctx, id) ? 1 : -2;
}
/**
 * Each turn in the vault counts; every VAULT_GUARD_TIME / 2 turns from VAULT_GUARD_TIME on, a
 * guard comes through the wall nearest the corridor he will lead her to (boulders in his square
 * shatter), and unless she cannot answer (engulfed, strangled, a silent form, helpless) asks her
 * name: a text prompt answered through {@link VAULT_GUARD_ID}. Once a couple of guards have died,
 * the count goes on only now and then. The guard's door is made before the question (C makes
 * it after the answer; the guard does not stand in the wall while she answers).
 * ref: src/vault.c invault() (no deaf hero, no hero hiding or mimicking an object)
 */
export function invault(ctx: Ctx): void {
  const level = getLevel(ctx.state);
  const vaultroom = vaultOccupied(level, uRooms(ctx));
  if (vaultroom === null) {
    setUinvault(ctx, 0);
    return;
  }
  // after a couple of guards don't come back from their trips to the vault, future guards
  // become more reluctant to turn up (even if summoned via whistle)
  const vgdeathcount = deaths(ctx.state, GUARD);
  if (vgdeathcount < 2 || (vgdeathcount < 50 && !ctx.rng.rn2(vgdeathcount * vgdeathcount)))
    setUinvault(ctx, uinvault(ctx.state) + 1);
  const n = uinvault(ctx.state);
  if (n < VAULT_GUARD_TIME || n % (VAULT_GUARD_TIME / 2) !== 0) return;
  if (findgd(ctx.state) !== null) return;
  if (!ctx.defs.isMonster(GUARD)) return;

  // first find the goal for the guard
  const dest = findGuardDest(ctx, level, null);
  if (!dest) return;
  const h = heroP(ctx);
  const at = (x: number, y: number): DefId | undefined => terrainIdAt(level, x, y);
  // next find a good place for a door in the wall
  let x = h.x;
  let y = h.y;
  if (at(x, y) !== T.floor) {
    // player dug a door and is in it
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
      [1, 1],
      [-1, -1],
      [1, -1],
      [-1, 1],
    ] as const)
      if (at(x + dx, y + dy) === T.floor) {
        x += dx;
        y += dy;
        break;
      }
  }
  while (at(x, y) === T.floor) {
    const dx = dest.x > x ? 1 : dest.x < x ? -1 : 0;
    const dy = dest.y > y ? 1 : dest.y < y ? -1 : 0;
    if (Math.abs(dest.x - x) >= Math.abs(dest.y - y)) x += dx;
    else y += dy;
  }
  if (x === h.x && y === h.y) {
    const hw = (t: DefId | undefined): boolean => t === T.hwall || isDoorTyp(ctx, t);
    const vw = (t: DefId | undefined): boolean => t === T.vwall || isDoorTyp(ctx, t);
    if (hw(at(x + 1, y))) x = x + 1;
    else if (hw(at(x - 1, y))) x = x - 1;
    else if (vw(at(x, y + 1))) y = y + 1;
    else if (vw(at(x, y - 1))) y = y - 1;
    else return;
  }

  // make something interesting happen
  const id = makemon(ctx, ctx.defs.monster(GUARD), { x, y }, { nogroup: true });
  const g = id === null ? null : monOf(ctx, id);
  if (id === null || !g?.c.monster) return;
  g.c.monster.peaceful = true;
  setEgd(ctx, id, {
    fcbeg: 0,
    vroom: vaultroom,
    gdx: dest.x,
    gdy: dest.y,
    ogx: x,
    ogy: y,
    gdlevel: level.id,
    warncnt: 0,
    gddone: false,
    dropgoldcnt: 0,
    fakecorr: [],
  });
  // ensure the guard doesn't respawn again next turn if killed immediately
  setUinvault(ctx, uinvault(ctx.state) + 1);
  // reset_faint(): if fainted - wake up
  if (getPlayer(ctx.state).c.helpless?.reasonKey === 'helpless.fainted') unmulNow(ctx);
  // boulders in the guard's way are destroyed
  let bcnt = 0;
  for (const o of itemsAt(ctx.defs, ctx.state, level.id, x, y))
    if (o.def === BOULDER) {
      bcnt++;
      fractureRock(ctx, o, false);
    }
  if (bcnt > 0)
    say(
      ctx,
      `vault.boulder${bcnt === 1 ? '' : 's'}_shatter${hasProp(getPlayer(ctx.state), P.BLINDED) ? '_hear' : ''}`,
    );
  const spotted = canSpotMon(ctx, g);
  if (spotted) say(ctx, 'vault.guard_enters');
  else {
    say(ctx, 'vault.someone_enters');
    // the hero who can't see the guard knows where the wall is breached
    mapInvisible(ctx, x, y);
  }
  if (uswallow(ctx)) {
    // can't interrogate hero, don't interrogate engulfer
    say(ctx, 'vault.whats_going_on');
    if (!spotted) say(ctx, 'vault.presence_vanishes');
    guardGone(ctx, id);
    return;
  }
  const form = heroForm(ctx);
  if (
    isStrangled(getPlayer(ctx.state)) ||
    (form !== null && (form.sound ?? 'silent') === 'silent') ||
    isHelpless(ctx)
  ) {
    say(ctx, 'vault.be_back');
    guardGone(ctx, id);
    return;
  }
  ctx.interrupt(); // stop_occupation()
  // the guard's entry point, where the confrontation takes place, becomes a doorway; a vault
  // wall dug into a doorway is remembered as the wall it was
  const egd = egdOf(ctx.state, id);
  if (!egd) return;
  let typ = at(x, y) ?? T.stone;
  if (!isWallId(typ)) typ = vaultWallTyp(level, vaultroom, x, y) ?? typ;
  egd.fakecorr.push({ x, y, ftyp: typ });
  setTerrain(level, x, y, T.doorway);
  askName(ctx, id, 5);
}

interface AskData {
  guard: EntityId;
  tries: number;
}

function askName(ctx: Ctx, guard: EntityId, tries: number): void {
  ctx.ask(
    { id: 'vault-guard', kind: 'text', key: 'vault.who_are_you', maxLength: NAME_MAX },
    VAULT_GUARD_ID,
    { guard, tries } satisfies AskData as unknown as Json,
  );
}

/**
 * Her answer: an empty one is asked again (five times in all); a lawful hero who does not give
 * her own name lies; "Croesus" (or Kroisos, Creosote) sends him away; anyone else
 * must drop her gold and follow him. ref: src/vault.c invault() after getlin()
 */
function answerName(ctx: Ctx, value: Json, data: Json): number {
  const d = data as unknown as AskData;
  const buf = typeof value === 'string' ? mungspaces(value) : '';
  if (!buf && d.tries - 1 > 0) {
    askName(ctx, d.guard, d.tries - 1);
    return 0;
  }
  const egd = egdOf(ctx.state, d.guard);
  const g = monOf(ctx, d.guard);
  if (!egd || !g) return 0;
  // a lawful hero who gives a name other than her own lies (adjalign(-1)): the port has no
  // player name (DEVIATIONS.md "Vaults"), and strncmpi() with an empty name always matches
  const lc = buf.toLowerCase();
  if (lc === 'croesus' || lc === 'kroisos' || lc === 'creosote') {
    // Croesus is never killed here: "Back from the dead, are you?" cannot happen
    say(ctx, 'vault.sorry_disturbed');
    guardGone(ctx, d.guard);
    return 0;
  }
  say(ctx, 'vault.dont_know_you');
  const umoney = moneyCnt(ctx, ctx.state.playerId);
  if (!umoney && !hiddenGold(ctx)) say(ctx, 'vault.please_follow');
  else {
    if (!umoney) say(ctx, 'vault.hidden_gold');
    say(ctx, 'vault.stolen');
    say(ctx, 'vault.please_drop');
    egd.dropgoldcnt++;
  }
  egd.warncnt = 1;
  return 0;
}

const vaultGuardAction: ActionDef = {
  id: VAULT_GUARD_ID,
  labelKey: 'vault.who_are_you',
  handles: 'mod',
  offer: () => [],
  perform: () => 0,
  answer: answerName,
};

/**
 * She teleported out of the vault while its guard was about: carrying gold and landing away
 * from him, he turns irate and gets an extra move. ref: src/vault.c uleftvault()
 */
export function uleftvault(ctx: Ctx, id: EntityId): void {
  const g = monOf(ctx, id);
  const egd = egdOf(ctx.state, id);
  if (!g?.c.pos || !g.c.monster || !egd || egd.parked) return;
  if (uCarryGold(ctx) && umDist(ctx, g.c.pos.x, g.c.pos.y, 1)) {
    if (g.c.monster.peaceful) {
      if (canSpotMon(ctx, g)) say(ctx, 'vault.irate', { mon: monNam(ctx, g) });
      g.c.monster.peaceful = false; // bypass setmangry()
    }
    // arriving outside his corridor: an extra move to deliver messages and to teleport out of
    // and remove that corridor
    const h = heroP(ctx);
    if (!inFcorridor(egd, h.x, h.y)) gdMove(ctx, id);
  }
}

/**
 * Dying or quitting with a vault guard about: in the vault, her gold goes into it ("the Magic
 * Memory Vault"); outside it an angry guard remits her gold to the vault; then the guard goes.
 * ref: src/vault.c paygd() (no grave with "To Croesus: ..."; no bones, so the gold only moves)
 */
export function paygd(ctx: Ctx, silently: boolean): void {
  const id = findgd(ctx.state);
  const umoney = moneyCnt(ctx, ctx.state.playerId);
  if (!umoney || id === null) return;
  const level = getLevel(ctx.state);
  const egd = egdOf(ctx.state, id);
  const g = monOf(ctx, id);
  let to: Pos | null = null;
  if (uinvault(ctx.state)) {
    if (!silently)
      say(ctx, 'vault.memory_vault', {
        n: umoney,
        currency: umoney === 1 ? '@shk.zorkmid' : '@shk.zorkmids',
      });
    to = heroP(ctx);
  } else if (g?.c.pos && g.c.monster && !g.c.monster.peaceful && egd) {
    const near = mnextoPos(ctx, level, id, heroP(ctx));
    if (near) rlocTo(ctx, g, near.x, near.y, false);
    if (!silently) say(ctx, 'vault.remits', { mon: monNam(ctx, g) });
    const r = level.rooms[egd.vroom];
    if (r) to = { x: r.lx + ctx.rng.rn2(2), y: r.ly + ctx.rng.rn2(2) };
  }
  if (to)
    for (const o of inventoryOf(ctx.state, ctx.state.playerId))
      if (ctx.defs.object(o.def).class === 'coin')
        stackobj(ctx, placeOnFloor(ctx, o.id, level.id, to.x, to.y));
  guardGone(ctx, id);
}

/**
 * Guards that died since the last check close their corridor (grddead()), and parked guards
 * (gone from the map, their corridor left) close it when they can: C's parked guard's gd_move()
 * each turn. ref: src/vault.c grddead(), gd_move() `semi_dead || !grd->mx || gddone`
 */
function tendGuards(ctx: Ctx, endOfTurn: boolean): void {
  for (const id of egdIds(ctx.state)) {
    const egd = egdOf(ctx.state, id);
    if (!egd) continue;
    if (!egd.parked) {
      if (!monOf(ctx, id)) grddead(ctx, id, egd);
      continue;
    }
    if (!endOfTurn || egd.gdlevel !== ctx.state.currentLevel) continue;
    egd.gddone = true;
    wallifyVault(ctx, id, egd);
    restfakecorr(ctx, id, egd);
  }
}

setGuardCode(gdMove, uleftvault);

export function registerVault(api: ModApi): void {
  // makelevel()'s last loop fills every special room again, the vault included: C's needfill
  // stays FILL_NORMAL after the do_vault block's fill, so 3.7 vaults get two piles' worth
  api.on('newLevel', (ctx, level) => {
    for (let i = 0; i < level.rooms.length; i++)
      if (level.rooms[i]?.type === VAULT) fillVault(ctx, level, i);
  });
  api.on('afterAction', (ctx) => {
    revealVaultTele(ctx);
    tendGuards(ctx, false);
  });
  api.on('endOfTurn', (ctx) => {
    revealVaultTele(ctx);
    tendGuards(ctx, true);
  });
  // ref: src/allmain.c moveloop_core(): invault() late in the once-a-turn block
  api.on('endOfTurn', invault, { priority: -10 });
  api.defineAction(vaultGuardAction);
  // ref: src/end.c really_done() paygd(): after any "Die?" (the wizard's hook may cancel first)
  api.on(
    'beforeGameOver',
    (ctx) => {
      paygd(ctx, false);
      return 'continue';
    },
    { priority: -100 },
  );
}
