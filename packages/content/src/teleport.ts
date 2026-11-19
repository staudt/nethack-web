// Where teleports go: the safe spots for the hero, monsters and objects, the random level of a
// level teleport, and which levels forbid teleporting. A leaf module (core and leaves only); the
// moves themselves (teleds(), tele(), level_tele(), rloc(), rloco()...) are in trap.ts, because
// teleds() ends in the trap code and the traps call back into it.
// ref: src/teleport.c noteleport_level(), goodpos(), teleok(), collect_coords(), safe_teleds(),
// rloc(), rloc_pos_ok(), rloco(), random_teleport_level(); src/dungeon.c get_level();
// src/engrave.c rloc_engr()
//
// Not ported (see DEVIATIONS.md "Teleportation"): the teleport regions of special levels
// (`dndest`/`updest`, tele_jump_ok()) but the Wizard's Tower's boundary, the Wizard's stairs,
// Passes_walls.
import { questMonDef } from './questmon';
import {
  cellIndex,
  cellRules,
  dungeonLayout,
  getPlayer,
  inBounds,
  inRooms,
  sortedIds,
  trapAt,
  type CellRules,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type GameState,
  type Level,
  type LevelId,
  type LevelRef,
  type Pos,
} from '@nh/core';
import { onscary, scareCells } from './scary';
import { boulderCells } from './boulder';
import { engrAt, moveEngr } from './engr';
import { epriOf, inhistemple } from './epri';
import { eshkOf, inhishop } from './eshk';
import {
  dngBottom,
  dungeonBottom,
  inEndgame,
  inHell,
  inWTower,
  levelFlags,
  singleLevelBranch,
} from './levelflags';
import { isCovetous, isDlord, isDprince } from './mondata';
import { canSpotMon, monNam } from './perception';
import { isWormTail, wormRec } from './wormstate';
import { heroLiquidOk } from './uwater';
import { heroForm } from './upoly';
import { mInAir, monLiquidOk } from './liquid';
import { T } from './terrain';
import { VIBRATING_SQUARE } from './invocation';
import { findTerrain } from './ladder';
import { isWiz } from './wizstate';

/** The Sokoban dungeon. ref: In_sokoban() */
export const SOKOBAN_DUNGEON: DefId = 'nh:sokoban';

/**
 * The turn until which a wand of stasis stops teleporting on each level, by level id
 * (`modData.nh.stasis`; svl.level.flags.stasis_until, an absolute turn as C keeps it).
 */
function stasisTable(state: Readonly<GameState>): Readonly<Record<string, number>> | undefined {
  const nh = state.modData['nh'];
  if (nh === null || typeof nh !== 'object' || Array.isArray(nh)) return undefined;
  const t = nh['stasis'];
  if (t === null || typeof t !== 'object' || Array.isArray(t)) return undefined;
  return t as Readonly<Record<string, number>>;
}

/** A wand of stasis is in effect on the level. ref: `svl.level.flags.stasis_until >= svm.moves` */
export function inStasis(state: Readonly<GameState>, levelId: LevelId): boolean {
  const until = stasisTable(state)?.[levelId];
  return typeof until === 'number' && until >= state.turn;
}

/**
 * The wand of stasis: teleporting stops on the level until turn `until`, keeping the longest
 * duration when zapped again. ref: src/zap.c zapnodir() WAN_STASIS
 */
export function setStasis(ctx: Pick<Ctx, 'state'>, levelId: LevelId, until: number): void {
  const md = ctx.state.modData;
  let nh = md['nh'];
  if (nh === null || typeof nh !== 'object' || Array.isArray(nh)) {
    nh = {};
    md['nh'] = nh;
  }
  let t = nh['stasis'];
  if (t === null || typeof t !== 'object' || Array.isArray(t)) {
    t = {};
    nh['stasis'] = t;
  }
  const old = t[levelId];
  if (typeof old !== 'number' || until > old) t[levelId] = until;
}

/** A demon lord or prince (the hero is neither). ref: src/teleport.c m_blocks_teleporting() */
function mBlocksTeleporting(ctx: Pick<Ctx, 'defs'>, e: Entity | undefined): boolean {
  if (!e?.c.monster || !ctx.defs.isMonster(e.def)) return false;
  const def = ctx.defs.monster(e.def);
  return isDlord(def) || isDprince(def);
}

/**
 * `who` (the hero or a monster) cannot teleport on this level: in Gehennom a demon lord or prince
 * on the level stops everybody else (the demon court), the level's `noteleport` flag (which a
 * covetous monster bypasses), or a wand of stasis in effect. ref: src/teleport.c
 * noteleport_level()
 */
export function noteleportLevel(
  ctx: Pick<Ctx, 'defs' | 'state'>,
  level: Readonly<Level>,
  who: EntityId,
): boolean {
  // demon court in Gehennom prevent others from teleporting
  if (
    inHell(ctx.state, level) &&
    !mBlocksTeleporting(ctx, ctx.state.entities[String(who)]) &&
    sortedIds(ctx.state).some((id) => {
      const e = ctx.state.entities[String(id)];
      return e?.c.pos?.level === level.id && mBlocksTeleporting(ctx, e);
    })
  )
    return true;
  // natural no-teleport level; covetous monsters can bypass these
  // (the hero's form for the hero: `noteleport_level(&youmonst)`)
  const e = ctx.state.entities[String(who)];
  const form =
    who === ctx.state.playerId
      ? heroForm(ctx)
      : e?.c.monster
        ? questMonDef(ctx.state, ctx.defs.monster(e.def))
        : null;
  const covetous = form !== null && isCovetous(form);
  if (levelFlags(ctx, level).noteleport === true && !covetous) return true;
  // wand of stasis prevents teleportation while the effect is active (even for covetous monsters)
  return inStasis(ctx.state, level.id);
}

/** What goodpos() needs of a level, gathered once per search. */
interface Occupancy {
  level: Level;
  rules: CellRules;
  /** Cell index -> the monster there (the hero is not a monster). */
  mons: Map<number, EntityId>;
  boulders: Set<number>;
  /** The hero's cell on this level, or -1. */
  hero: number;
  /** The hero's entity id. */
  heroId: EntityId;
  /** Placing a worm that has a worm number. */
  worm?: true;
  /** goodpos()'s water and lava rules for the hero: water, a wall of water, lava. */
  heroLiquid: { water: boolean; waterwall: boolean; lava: boolean };
  /** goodpos()'s water and lava rules for monster `who` at (x, y) (monLiquidOk()). */
  monLiquid: (who: EntityId, x: number, y: number) => boolean;
}

type OccCtx = Pick<Ctx, 'state' | 'defs'> & { rng?: Ctx['rng'] };

function occupancy(ctx: OccCtx, level: Level): Occupancy {
  const mons = new Map<number, EntityId>();
  for (const id of sortedIds(ctx.state)) {
    const e = ctx.state.entities[String(id)];
    const p = e?.c.pos;
    // a worm's tail segments are the worm (m_at()); they block like any monster
    if ((e?.c.monster || isWormTail(e)) && p?.level === level.id && id !== ctx.state.playerId)
      mons.set(cellIndex(level, p.x, p.y), id);
  }
  const hp = getPlayer(ctx.state).c.pos;
  return {
    level,
    rules: cellRules(level, ctx.defs),
    mons,
    boulders: boulderCells(ctx, level),
    hero: hp?.level === level.id ? cellIndex(level, hp.x, hp.y) : -1,
    heroId: ctx.state.playerId,
    heroLiquid: {
      water: heroLiquidOk(ctx, 'water', false),
      waterwall: heroLiquidOk(ctx, 'water', true),
      lava: heroLiquidOk(ctx, 'lava', false),
    },
    monLiquid: (who, x, y) => {
      const e = ctx.state.entities[String(who)];
      const { rng } = ctx;
      // (every caller placing a monster passes the RNG; without it no liquid is good)
      if (!e?.c.monster || !rng)
        return (
          (cellRules(level, ctx.defs).liquid[level.cells[cellIndex(level, x, y)] ?? 0] ?? null) ===
          null
        );
      return monLiquidOk(
        { defs: ctx.defs, rng },
        level,
        x,
        y,
        ctx.defs.monster(e.def),
        mInAir(ctx, e),
      );
    },
  };
}

/** ref: accessible(x, y) and !closed_door(x, y) (ACCESSIBLE() counts closed doors) */
const accessible = (o: Occupancy, i: number): boolean => {
  const t = o.level.cells[i] ?? 0;
  return o.rules.passable[t] === true && !o.rules.closedDoor[t];
};

/**
 * The monster cannot teleport here ("A mysterious force prevents the jackal from teleporting!"
 * when seen). ref: src/teleport.c tele_restrict()
 */
export function teleRestrict(ctx: Ctx, mon: Entity): boolean {
  const p = mon.c.pos;
  const level = p ? ctx.state.levels[p.level] : undefined;
  if (level && noteleportLevel(ctx, level, mon.id)) {
    if (canSpotMon(ctx, mon))
      ctx.emit({ type: 'msg', key: 'adtyp.tele_restrict', params: { mon: monNam(ctx, mon) } });
    return true;
  }
  return false;
}

/**
 * ref: src/teleport.c goodpos(x, y, mtmp, 0): on the map, not the hero's square (unless `who` is
 * the hero), no other monster there when placing one (`who` null places an object: monsters do
 * not matter), accessible, and no boulder. The hero and monsters go into water or lava only as
 * goodpos() allows (an eel stays out of dry squares 12 times in 13); an object never does (not
 * ACCESSIBLE()).
 */
function goodpos(o: Occupancy, x: number, y: number, who: EntityId | null): boolean {
  if (!inBounds(o.level, x, y)) return false;
  const i = cellIndex(o.level, x, y);
  const heroIsWho = who === o.heroId;
  if (i === o.hero && !heroIsWho) return false;
  if (who !== null) {
    // `mtmp2 && (mtmp2 != mtmp || mtmp->wormno)`: a worm with a tail does not fit on its own
    // square either (its segments return the same m_at())
    const m = o.mons.get(i);
    if (m !== undefined && (m !== who || o.worm)) return false;
  }
  const liquid = o.rules.liquid[o.level.cells[i] ?? 0] ?? null;
  if (liquid !== null && (who === null || heroIsWho)) {
    if (who === null) return false;
    const wall = o.level.palette[o.level.cells[i] ?? 0] === T.water;
    const ok =
      liquid === 'lava' ? o.heroLiquid.lava : wall ? o.heroLiquid.waterwall : o.heroLiquid.water;
    return ok; // goodpos() returns here: no boulder check in water or lava
  }
  if (who !== null && !heroIsWho && !o.monLiquid(who, x, y)) return false;
  return accessible(o, i) && !o.boulders.has(i);
}

/** goodpos() for the hero at (x, y) of `level`, traps allowed. ref: src/teleport.c goodpos() */
export function goodposHero(
  ctx: Pick<Ctx, 'state' | 'defs'>,
  level: Level,
  x: number,
  y: number,
): boolean {
  return goodpos(occupancy(ctx, level), x, y, ctx.state.playerId);
}

/**
 * goodpos() with no creature: not the hero's square, accessible, dry and no boulder (monsters do
 * not matter). ref: src/teleport.c goodpos(x, y, (struct monst *) 0, 0)
 */
export function goodposNone(
  ctx: Pick<Ctx, 'state' | 'defs' | 'rng'>,
  level: Level,
  x: number,
  y: number,
): boolean {
  return goodpos(occupancy(ctx, level), x, y, null);
}

/** goodpos() for monster `who` at (x, y) of `level`. ref: src/teleport.c goodpos(x, y, mtmp, 0) */
export function goodposMon(
  ctx: Pick<Ctx, 'state' | 'defs' | 'rng'>,
  level: Level,
  x: number,
  y: number,
  who: EntityId,
): boolean {
  const o = occupancy(ctx, level);
  return goodpos(wormRec(ctx.state, who) ? { ...o, worm: true } : o, x, y, who);
}

/**
 * The hero may land at (x, y) of her level: not on a trap unless `trapok` (the vibrating square,
 * "not a real trap", is always fine), and a good position.
 * ref: src/teleport.c teleok() (no Levitation or Flying exemption for pits and holes yet)
 */
export function teleok(
  ctx: Pick<Ctx, 'state' | 'defs'>,
  level: Level,
  x: number,
  y: number,
  trapok: boolean,
): boolean {
  if (!trapok && inBounds(level, x, y)) {
    const t = trapAt(level, x, y);
    if (t && t.def !== VIBRATING_SQUARE) return false;
  }
  return goodpos(occupancy(ctx, level), x, y, ctx.state.playerId);
}

/**
 * The squares of `level` in rings of growing Chebyshev distance around (cx, cy), each ring (or
 * pair of rings) shuffled unless `unshuffled`. Column 0 is not used. `skipMons` drops squares
 * with a monster; squares a zap cannot cross (rock, walls) are always dropped (CC_SKIP_INACCS:
 * nothing here passes walls).
 * ref: src/teleport.c collect_coords() (maxradius 0: the whole map)
 */
function collectCoords(
  ctx: Pick<Ctx, 'rng' | 'defs'>,
  o: Occupancy,
  cx: number,
  cy: number,
  flags: { inclCenter?: true; unshuffled?: true; ringPairs?: true; skipMons?: true },
): Pos[] {
  const { level } = o;
  const w = level.width;
  const h = level.height;
  const scramble = flags.unshuffled !== true;
  const ringPairs = scramble && flags.ringPairs === true;
  const rowrange = cy < Math.trunc(h / 2) ? h - 1 - cy : cy;
  const colrange = cx < Math.trunc(w / 2) ? w - 1 - cx : cx;
  const maxradius = Math.max(rowrange, colrange);
  const out: Pos[] = [];
  let pass = 0; // start of the entries of the current radius (or pair)
  for (let radius = flags.inclCenter ? 0 : 1; radius <= maxradius; ++radius) {
    const newpass = !ringPairs || radius % 2 !== 0 || radius === 0;
    const passend = !ringPairs || radius % 2 === 0 || radius === maxradius;
    if (newpass) pass = out.length;
    const lox = cx - radius;
    const hix = cx + radius;
    const loy = cy - radius;
    const hiy = cy + radius;
    for (let y = Math.max(loy, 0); y <= hiy && y <= h - 1; ++y)
      for (let x = Math.max(lox, 1); x <= hix && x <= w - 1; ++x) {
        if (x !== lox && x !== hix && y !== loy && y !== hiy) continue; // not on the ring
        const i = cellIndex(level, x, y);
        if (flags.skipMons && o.mons.has(i)) continue;
        // !ZAP_POS(): rock, walls and secret doors (doors and floor pass)
        const t = level.palette[level.cells[i] ?? 0];
        const def = t === undefined ? undefined : ctx.defs.terrain(t);
        if (!def || !(def.passable || def.door !== undefined)) continue;
        out.push({ x, y });
      }
    if (scramble && passend) {
      // shuffle the entries gathered for this radius (or pair)
      let n = out.length - pass;
      let at = pass;
      while (n > 1) {
        const k = ctx.rng.rn2(n);
        if (k) {
          const a = out[at] as Pos;
          out[at] = out[at + k] as Pos;
          out[at + k] = a;
        }
        ++at;
        --n;
      }
    }
  }
  return out;
}

/**
 * Where a hero teleporting at random lands: 40 random tries off traps, then every square in
 * shuffled rings (pairs of rings) around her, the nearest acceptable one, else the first
 * acceptable trap square met; null when there is none. Her own square counts in the random
 * tries ("You materialize in the same location!").
 * ref: src/teleport.c safe_teleds() (the spot; trap.ts teleds() moves her)
 */
export function safeTeledsPos(ctx: Pick<Ctx, 'state' | 'defs' | 'rng'>, level: Level): Pos | null {
  const o = occupancy(ctx, level);
  const me = ctx.state.playerId;
  const ok = (x: number, y: number, trapok: boolean): boolean =>
    (trapok || !trapAt(level, x, y)) && goodpos(o, x, y, me);
  for (let tcnt = 0; tcnt < 40; ++tcnt) {
    const nux = ctx.rng.rnd(level.width - 1);
    const nuy = ctx.rng.rn2(level.height);
    if (ok(nux, nuy, false)) return { x: nux, y: nuy };
  }
  const hp = getPlayer(ctx.state).c.pos;
  if (!hp) return null;
  let backup: Pos | null = null;
  for (const c of collectCoords(ctx, o, hp.x, hp.y, { ringPairs: true, skipMons: true })) {
    if (ok(c.x, c.y, false)) return c;
    if (!backup && trapAt(level, c.x, c.y) && ok(c.x, c.y, true)) backup = c;
  }
  return backup;
}

/**
 * A resident shopkeeper or temple priest stays in his room when he can; no monster lands where
 * it would be scared (a scroll of scare monster); on the Wizard's Tower's levels a monster inside
 * the tower stays inside and one outside stays outside. ref: src/teleport.c rloc_pos_ok() (goodpos()
 * with GP_CHECKSCARY, the room test, tele_jump_ok() for the tower's boundary only: no other
 * teleport regions)
 */
function rlocPosOk(
  ctx: Pick<Ctx, 'state' | 'defs'>,
  o: Occupancy,
  x: number,
  y: number,
  mon: Entity,
  scare: Set<number>,
): boolean {
  if (!goodpos(o, x, y, mon.id)) return false;
  if (onscary(ctx, x, y, mon, { level: o.level, cells: scare })) return false;
  const eshk = eshkOf(ctx, mon.id);
  if (eshk && inhishop(ctx, mon.id)) return inRooms(o.level, x, y).includes(eshk.shoproom);
  const epri = epriOf(ctx, mon.id);
  if (epri && inhistemple(ctx, mon.id)) return inRooms(o.level, x, y).includes(epri.shroom);
  const p = mon.c.pos;
  if (p && inWTower(ctx.state, o.level, p.x, p.y) !== inWTower(ctx.state, o.level, x, y))
    return false;
  return true;
}

/**
 * Where the Wizard, teleporting on his level, goes: the up stairs of the dungeon (not a branch's)
 * while the hero is outside the Wizard's Tower; while she is inside it, the tower's up ladder,
 * or its down ladder at the top of the tower, which has none. ref: src/teleport.c rloc() (the
 * `mtmp->iswiz && mtmp->mx` block), stairway_find_forwiz()
 */
function wizStairs(ctx: Pick<Ctx, 'state'>, level: Level): Pos | null {
  const hp = ctx.state.entities[String(ctx.state.playerId)]?.c.pos;
  const heroInTower = hp?.level === level.id && inWTower(ctx.state, level, hp.x, hp.y);
  if (!heroInTower) return level.up;
  return findTerrain(level, T.ladder_up) ?? findTerrain(level, T.ladder_down);
}

/**
 * Where a monster teleported at random lands: 50 random tries, then every square in a shuffled
 * order, else the first plain good position met; null when the level is full. The Wizard goes
 * to the stairs (wizStairs()) when he is free, "to block the player's escaping before he's
 * healed". ref: src/teleport.c rloc() (no steed or wizard-mode control)
 */
export function rlocMonPos(
  ctx: Pick<Ctx, 'state' | 'defs' | 'rng'>,
  level: Level,
  mon: Entity,
): Pos | null {
  const o0 = occupancy(ctx, level);
  const o: Occupancy = wormRec(ctx.state, mon.id) ? { ...o0, worm: true } : o0;
  // the Wizard, not just arriving (deliberately goodpos() rather than rloc_pos_ok())
  if (isWiz(ctx, mon.id) && mon.c.pos?.level === level.id) {
    const s = wizStairs(ctx, level);
    if (s && goodpos(o, s.x, s.y, mon.id)) return s;
  }
  const scare = scareCells(ctx, level);
  for (let trycount = 0; trycount < 50; ++trycount) {
    const x = ctx.rng.rnd(level.width - 1);
    const y = ctx.rng.rn2(level.height);
    if (rlocPosOk(ctx, o, x, y, mon, scare)) return { x, y };
  }
  const candy = collectCoords(ctx, o, Math.trunc(level.width / 2), Math.trunc(level.height / 2), {
    inclCenter: true,
    unshuffled: true,
    skipMons: true,
  });
  let backup: Pos | null = null;
  for (let i = 0; i < candy.length; ++i) {
    const j = ctx.rng.rn2(candy.length - i);
    if (j > 0) {
      const c = candy[i] as Pos;
      candy[i] = candy[i + j] as Pos;
      candy[i + j] = c;
    }
    const c = candy[i] as Pos;
    if (rlocPosOk(ctx, o, c.x, c.y, mon, scare)) return c;
    if (!backup && goodpos(o, c.x, c.y, mon.id)) backup = c;
  }
  return backup;
}

/**
 * Where a teleported object lands: `rn1(COLNO - 3, 2), rn2(ROWNO)` until a good position (no
 * boulder, not the hero's square; monsters do not matter) that keeps an object from `from` inside
 * the Wizard's Tower inside it and one outside outside it, giving up after 4000 tries on the last
 * square tried, as rloco() does. ref: src/teleport.c rloco() (no `restricted_fall`)
 */
export function rlocoPos(ctx: Pick<Ctx, 'state' | 'defs' | 'rng'>, level: Level, from?: Pos): Pos {
  const o = occupancy(ctx, level);
  const inside = from ? inWTower(ctx.state, level, from.x, from.y) : null;
  let tryLimit = 4000;
  let tx: number;
  let ty: number;
  do {
    tx = ctx.rng.rn2(Math.max(1, level.width - 3)) + 2;
    ty = ctx.rng.rn2(level.height);
    if (!--tryLimit) break;
  } while (
    !goodpos(o, tx, ty, null) ||
    (inside !== null && inWTower(ctx.state, level, tx, ty) !== inside)
  );
  return { x: tx, y: ty };
}

/**
 * Moves the engraving at (x, y) of `level` to a random good position with no engraving: 200 tries
 * of `rn1(COLNO - 3, 2), rn2(ROWNO)` (scaled to the level), else it stays.
 * ref: src/engrave.c rloc_engr()
 */
export function rlocEngr(
  ctx: Pick<Ctx, 'state' | 'defs' | 'rng'>,
  level: Level,
  x: number,
  y: number,
): void {
  const o = occupancy(ctx, level);
  let tryct = 200;
  let tx: number;
  let ty: number;
  do {
    if (--tryct < 0) return;
    tx = ctx.rng.rn2(Math.max(1, level.width - 3)) + 2;
    ty = ctx.rng.rn2(level.height);
  } while (engrAt(ctx, level, tx, ty) || !goodpos(o, tx, ty, null));
  moveEngr(ctx, level, x, y, tx, ty);
}

/**
 * The depth an uncontrolled level teleport from `level` goes to: the current depth 1 time in 5
 * (no teleport), else `rn2(cur + 3 - min) + min` skipping the current depth, kept within the
 * dungeon (from depth 1 to its bottom; DUNGEON_BOTTOM for an old game's endless main dungeon, as
 * for holes; in Gehennom the invocation level, the Sanctum being out of reach).
 * On Fort Ludios and the Planes it stays (after the draw). ref: src/teleport.c
 * random_teleport_level() (no quest)
 */
export function randomTeleportLevel(
  ctx: Pick<Ctx, 'state' | 'rng'>,
  level: Readonly<Level>,
): number {
  const layout = dungeonLayout(ctx.state, level.dungeon);
  const curDepth = layout.depthStart + level.dlevel - 1;
  // (and none from Fort Ludios, the only single-level branch, or on the Planes, whose depths are
  // 0 and below: the caller says "disoriented" there)
  if (!ctx.rng.rn2(5) || singleLevelBranch(level) || inEndgame(ctx.state, level)) return curDepth;
  const minDepth = 1;
  // "can't reach Sanctum if the invocation hasn't been performed"
  const bottom = dngBottom(ctx.state, level);
  const maxDepth = bottom + (layout.depthStart - 1);
  // Get a random value relative to the current dungeon; range is 1 to current+3, current not
  // counting
  let nlev = ctx.rng.rn2(curDepth + 3 - minDepth) + minDepth;
  if (nlev >= curDepth) nlev++;
  if (nlev > maxDepth) {
    nlev = maxDepth;
    // teleport up if already on bottom
    if (level.dlevel === layout.levels) nlev -= ctx.rng.rnd(3);
  }
  if (nlev < minDepth) {
    nlev = minDepth;
    if (nlev === curDepth) {
      nlev += ctx.rng.rnd(3);
      if (nlev > maxDepth) nlev = maxDepth;
    }
  }
  return nlev;
}

/**
 * The level at absolute `depth` as seen from `level`: in its dungeon, or the parent dungeon's
 * (and so on up) for a depth above its top; past its bottom, its last level (the main dungeon's
 * last is DUNGEON_BOTTOM in an old game's endless one). ref: src/dungeon.c get_level()
 */
export function levelAtDepth(
  ctx: Pick<Ctx, 'state'>,
  level: Readonly<Level>,
  depth: number,
): LevelRef {
  let dgn = dungeonLayout(ctx.state, level.dungeon);
  if (depth <= 0) return { dungeon: level.dungeon, dlevel: level.dlevel };
  const last = dgn.levels ?? dungeonBottom(ctx.state, level);
  if (depth > dgn.depthStart + last - 1) return { dungeon: dgn.id, dlevel: last };
  while (depth < dgn.depthStart) {
    // the parent dungeon: the one with a branch to this one
    const id = dgn.id;
    const parent = ctx.state.dungeons.find((d) => d.branches.some((b) => b.to === id));
    if (!parent) break;
    dgn = parent;
  }
  return { dungeon: dgn.id, dlevel: depth - dgn.depthStart + 1 };
}
