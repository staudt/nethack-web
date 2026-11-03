// Temple priests: made with their temple, and the god's anger when the hero attacks one.
// ref: src/priest.c priestini(), ghod_hitsu(); src/sp_lev.c create_altar() (`croom_is_temple`)
//
// The priest's table and the questions about it are in epri.ts; his movement (pri_move(),
// move_special()) is in monmove.ts. Not ported: high priests and the Sanctum, roaming priests
// (angry_priest()'s conversion to a minion), the Amulet, conflict, the exercise of Wisdom.
import {
  DIRS,
  DIR_LIST,
  cellIndex,
  cellRules,
  getLevel,
  getPlayer,
  inBounds,
  inRooms,
  sortedIds,
  type Ctx,
  type Dir,
  type EntityId,
  type Level,
  type ModApi,
  type Pos,
} from '@nh/core';
import { alignGname, altarAlign } from './align';
import { buzzFrom } from './buzz';
import { clearPath } from './clearpath';
import { ALIGNED_CLERIC, hasShrine, pCoaligned, setEpri, templeOccupied, type Epri } from './epri';
import { makemon, rlocPos } from './generation';
import { addToInventory } from './items';
import { mkobj } from './mkobj';
import { whichArmor } from './mongear';
import { monLearnsTraps } from './trapstate';

/** ref: include/hack.h BOLT_LIM */
const BOLT_LIM = 8;

/** ref: src/decl.c xdir[], ydir[]: W, NW, N, NE, E, SE, S, SW */
const XDIR = [-1, -1, 0, 1, 1, 1, 0, -1] as const;
const YDIR = [0, -1, -1, -1, 0, 1, 1, 1] as const;

/** ref: src/sp_lev.c pm_good_location() -> is_ok_location(DRY): SPACE_POS (no doors) */
function goodLocation(ctx: Ctx, level: Level, x: number, y: number): boolean {
  if (!inBounds(level, x, y)) return false;
  const id = level.palette[level.cells[cellIndex(level, x, y)] ?? -1];
  if (id === undefined) return false;
  const t = ctx.defs.terrain(id);
  return t.passable && t.door === undefined;
}

/**
 * Makes the priest of the temple `room` next to its shrine at `altar` (on the altar itself when
 * no neighbour is good), moving any monster already there away: peaceful, awake, knowing every
 * trap, with 2 to 4 spellbooks, and his robe uncursed (coaligned) or cursed half the time.
 * ref: src/priest.c priestini() (not the Sanctum's high priest)
 */
export function priestini(ctx: Ctx, level: Level, room: number, altar: Pos): EntityId | null {
  const si = ctx.rng.rn2(8);
  let px = altar.x;
  let py = altar.y;
  let i = 0;
  for (; i < 8; i++) {
    const d = (i + si) % 8;
    px = altar.x + (XDIR[d] ?? 0);
    py = altar.y + (YDIR[d] ?? 0);
    if (goodLocation(ctx, level, px, py)) break;
  }
  if (i === 8) {
    px = altar.x;
    py = altar.y;
  }
  // "insurance": move a monster out of the way (rloc(RLOC_NOMSG))
  for (const id of sortedIds(ctx.state)) {
    const p = ctx.state.entities[String(id)]?.c.pos;
    const isMon = ctx.state.entities[String(id)]?.c.monster !== undefined;
    if (!isMon || !p || p.level !== level.id || p.x !== px || p.y !== py) continue;
    const to = rlocPos(ctx, level);
    if (to) {
      p.x = to.x;
      p.y = to.y;
    }
  }
  const id = makemon(ctx, ctx.defs.monster(ALIGNED_CLERIC), { x: px, y: py }, { level: level.id });
  const priest = id === null ? undefined : ctx.state.entities[String(id)];
  if (id === null || !priest?.c.monster) return null;
  const altarId = level.palette[level.cells[cellIndex(level, altar.x, altar.y)] ?? -1];
  const shralign = altarId === undefined ? null : altarAlign(altarId);
  const epri: Epri = {
    shroom: room,
    shralign: shralign ?? 0,
    shrpos: { x: altar.x, y: altar.y },
    shrlevel: level.id,
    intoneTime: 0,
    enterTime: 0,
    peacefulTime: 0,
    hostileTime: 0,
    cheapskate: 0,
  };
  setEpri(ctx, id, epri);
  for (const t of ctx.defs.traps) monLearnsTraps(ctx, id, t.id); // traps are known
  priest.c.monster.peaceful = true;
  priest.c.monster.asleep = false;
  // (set_malign(): the malign is computed when it is needed, from the shrine's alignment)

  // 2 to 4 spellbooks
  for (let cnt = ctx.rng.rn2(3) + 2; cnt > 0; --cnt) {
    const book = mkobj(ctx, 'spellbook', { artif: false, level: level.id, inMklev: true });
    if (book !== null) addToInventory(ctx, id, book);
  }
  // robe [via makemon()]
  if (ctx.rng.rn2(2) !== 0) {
    const robe = whichArmor(ctx, id, 'cloak')?.c.item;
    if (robe) {
      if (pCoaligned(ctx, epri)) {
        if (robe.buc === 'cursed') robe.buc = 'uncursed'; // uncurse()
      } else robe.buc = 'cursed'; // curse()
    }
  }
  return id;
}

/**
 * Drops the shrines of `level` that are not in a temple room (create_altar() makes a shrine
 * only in a temple) and makes a priest for each of the others. ref: src/sp_lev.c create_altar()
 */
export function templePriests(ctx: Ctx, level: Level): void {
  const shrines = level.shrines;
  if (!shrines) return;
  const kept: Pos[] = [];
  for (const s of shrines) {
    const room = templeOccupied(level, inRooms(level, s.x, s.y));
    if (room === null) continue; // !croom_is_temple: a plain altar
    kept.push(s);
    priestini(ctx, level, room, s);
  }
  if (kept.length > 0) level.shrines = kept;
  else delete level.shrines;
}

/** The direction of (dx, dy), each -1, 0 or 1 and not both 0. */
function dirOf(dx: number, dy: number): Dir | null {
  return DIR_LIST.find((d) => DIRS[d].x === dx && DIRS[d].y === dy) ?? null;
}

/**
 * (x, y) is in a straight line (orthogonal or diagonal) from the hero, within bolt range and
 * not blocked. ref: src/mthrowu.c linedup(u.ux, u.uy, x, y, 1) (no boulders here)
 */
function linedupHero(ctx: Ctx, level: Level, hp: Pos, x: number, y: number): boolean {
  const tbx = hp.x - x;
  const tby = hp.y - y;
  if (!tbx && !tby) return false;
  if (tbx && tby && Math.abs(tbx) !== Math.abs(tby)) return false;
  if (Math.max(Math.abs(tbx), Math.abs(tby)) >= BOLT_LIM) return false;
  return clearPath(level, cellRules(level, ctx.defs).opaque, hp.x, hp.y, x, y);
}

const GHOD_LINES = ['priest.ghod.roars_anger', 'priest.ghod.voice_booms', 'priest.ghod.roars'];

/**
 * The god of the temple the hero stands in strikes at her for attacking its priest: a bolt of
 * lightning (6d6, a monster spell) from the altar, or when she is not lined up with it, from the
 * temple's far wall in her row or column (the one across from her doorway). Nothing when she is
 * not in a temple, the priest's shrine is gone, or no line works. ref: src/priest.c ghod_hitsu()
 * (no exercise of Wisdom)
 */
export function ghodHitsu(ctx: Ctx, epri: Epri): void {
  const hp = getPlayer(ctx.state).c.pos;
  if (!hp || hp.level !== ctx.state.currentLevel) return;
  const level = getLevel(ctx.state);
  const roomno = templeOccupied(level, inRooms(level, hp.x, hp.y));
  if (roomno === null || !hasShrine(ctx, epri)) return;
  const troom = level.rooms[roomno];
  if (!troom) return;
  const ax = epri.shrpos.x;
  const ay = epri.shrpos.y;
  let x = ax;
  let y = ay;
  if ((hp.x === x && hp.y === y) || !linedupHero(ctx, level, hp, x, y)) {
    const here = level.palette[level.cells[cellIndex(level, hp.x, hp.y)] ?? -1];
    if (here !== undefined && ctx.defs.terrain(here).door !== undefined) {
      if (hp.x === troom.lx - 1) {
        x = troom.hx;
        y = hp.y;
      } else if (hp.x === troom.hx + 1) {
        x = troom.lx;
        y = hp.y;
      } else if (hp.y === troom.ly - 1) {
        x = hp.x;
        y = troom.hy;
      } else if (hp.y === troom.hy + 1) {
        x = hp.x;
        y = troom.ly;
      }
    } else {
      switch (ctx.rng.rn2(4)) {
        case 0:
          x = hp.x;
          y = troom.ly;
          break;
        case 1:
          x = hp.x;
          y = troom.hy;
          break;
        case 2:
          x = troom.lx;
          y = hp.y;
          break;
        default:
          x = troom.hx;
          y = hp.y;
          break;
      }
    }
    if (!linedupHero(ctx, level, hp, x, y)) return;
  }
  // a_gname_at(ax, ay): the god of the altar
  const god = alignGname(epri.shralign);
  ctx.emit({
    type: 'msg',
    key: GHOD_LINES[ctx.rng.rn2(3)] ?? 'priest.ghod.roars',
    params: { god },
  });
  // bolt of lightning cast by unspecified monster
  const dir = dirOf(Math.sign(hp.x - x), Math.sign(hp.y - y));
  if (dir) buzzFrom(ctx, 'lightning', 6, { x, y }, dir, { by: 'spell' });
}

/** Makes the temple priests of each new level (before its other contents, as create_altar()). */
export function registerPriest(api: ModApi): void {
  api.on('newLevel', (ctx, level) => templePriests(ctx, level));
}
