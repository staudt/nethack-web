// Filling the rooms of a new level with a monster, traps, gold, a box and objects.
// ref: src/mklev.c fill_ordinary_room(), makelevel(), mktrap()
// makelevel()'s special room (mkroom.ts) is picked before the rooms are filled.
import { pruneDoorTraps, setDoorTrapped } from './btrapstate';
import type { Ctx, DefId, Level, ModApi, Pos, Room } from '@nh/core';
import { cellIndex, trapAt } from '@nh/core';
import { A_LAWFUL, altarOf, type Aligntyp } from './aligntyp';
import { BOULDER, boulderAt } from './boulder';
import { FTN_MAGIC, setFountainBits } from './fountain';
import { makemon } from './generation';
import { mkgold } from './items';
import { mkobjAt, mksobjFull } from './mkobj';
import { mkSpecialRoom } from './mkroom';
import { somexyspace } from './somexy';
import { mkcorpstat } from './statue';
import { levelFlags } from './levelflags';
import { T, setTerrain } from './terrain';
import { mkVault } from './vault';
import { TRAP, canFallThru, isHole, isPit, maketrap } from './trap';

/**
 * NetHack's trap numbers 1..25 (include/trap.h), with the kinds this port has; the others are
 * null and count as NO_TRAP, so mktrap() rolls again.
 */
const TRAPNUM_KINDS: readonly (DefId | null)[] = [
  null, // 0 NO_TRAP
  TRAP.arrow, // 1 ARROW_TRAP
  TRAP.dart, // 2 DART_TRAP
  TRAP.rock, // 3 ROCKTRAP
  TRAP.squeaky, // 4 SQKY_BOARD
  TRAP.bear, // 5 BEAR_TRAP
  TRAP.landmine, // 6 LANDMINE
  TRAP.rolling, // 7 ROLLING_BOULDER_TRAP
  TRAP.sleepGas, // 8 SLP_GAS_TRAP
  TRAP.rust, // 9 RUST_TRAP
  null, // 10 FIRE_TRAP
  TRAP.pit, // 11 PIT
  TRAP.spikedPit, // 12 SPIKED_PIT
  TRAP.hole, // 13 HOLE
  TRAP.trapdoor, // 14 TRAPDOOR
  TRAP.tele, // 15 TELEP_TRAP
  TRAP.levelTele, // 16 LEVEL_TELEP
  null, // 17 MAGIC_PORTAL
  TRAP.web, // 18 WEB
  TRAP.statue, // 19 STATUE_TRAP
  TRAP.magic, // 20 MAGIC_TRAP
  TRAP.antiMagic, // 21 ANTI_MAGIC
  TRAP.poly, // 22 POLY_TRAP
  null, // 23 VIBRATING_SQUARE
  null, // 24 TRAPPED_DOOR
  null, // 25 TRAPPED_CHEST
];

/**
 * A random trap kind for a level of difficulty `lvl`, or null for NO_TRAP ("too hard", or a
 * kind this port does not have). ref: src/mklev.c traptype_rnd(): `kind = rnd(TRAPNUM - 1)`;
 * rolling boulder traps and sleeping gas need level 2, spiked pits level 5, land mines level 6,
 * webs level 7 (unless no spider comes with them, `noSpiderOnWeb`), statue and polymorph traps level 8; level teleporters need level 5 and a level
 * that allows teleporting (`noteleport`: the level's flag), as teleportation traps do; holes are
 * made only 1 time in 7. The restrictions of the kinds we lack draw no random numbers (and there
 * is no single-level branch, Fort Ludios).
 */
export function traptypeRnd(
  ctx: Pick<Ctx, 'rng'>,
  lvl: number,
  noteleport = false,
  noSpiderOnWeb = false,
): DefId | null {
  const kind = ctx.rng.rnd(TRAPNUM_KINDS.length - 1);
  const def = TRAPNUM_KINDS[kind] ?? null;
  if ((def === TRAP.rolling || def === TRAP.sleepGas) && lvl < 2) return null;
  if (def === TRAP.levelTele && (lvl < 5 || noteleport)) return null;
  if (def === TRAP.spikedPit && lvl < 5) return null;
  if (def === TRAP.landmine && lvl < 6) return null;
  if (def === TRAP.web && lvl < 7 && !noSpiderOnWeb) return null;
  if ((def === TRAP.statue || def === TRAP.poly) && lvl < 8) return null;
  if (def === TRAP.tele && noteleport) return null;
  if (def === TRAP.hole && ctx.rng.rn2(7)) return null;
  return def;
}

/**
 * Makes a trap of `kind` (random when null) on a free floor square of the room, or at a given
 * spot (as sp_lev.c create_trap() passes `tm`). ref: src/mklev.c mktrap(); with a room: the kind is rerolled until one is allowed; a hole or trap door
 * where one cannot fall through becomes a falling rock trap; the square comes from somexyspace()
 * (which already avoids occupied squares; the retry loop repeats only for a pit or hole on a
 * boulder). A web gets a giant spider on it (made with the level, so it may get an object under
 * it), unless `noSpiderOnWeb` (MKTRAP_NOSPIDERONWEB). The dead
 * adventurer (`mktrap_victim()`) is not made, but its `rnd(4)` roll is (see DEVIATIONS.md).
 */
export function mktrap(
  ctx: Ctx,
  level: Level,
  room: Room | Pos,
  kind: DefId | null = null,
  noSpiderOnWeb = false,
): void {
  const lvl = level.depth; // level_difficulty()
  const noteleport = levelFlags(ctx, level).noteleport === true; // svl.level.flags.noteleport
  while (kind === null) kind = traptypeRnd(ctx, lvl, noteleport, noSpiderOnWeb);
  if (isHole(kind) && !canFallThru(ctx.state, level)) kind = TRAP.rock;
  let m: Pos | null;
  if ('lx' in room) {
    // a pit or hole avoids boulder squares (somexyspace() already skips occupied ones)
    const avoidBoulder = isPit(kind) || isHole(kind);
    let tryct = 0;
    do {
      if (++tryct > 200) return;
      m = somexyspace(ctx, level, room);
      if (!m) return;
    } while (avoidBoulder && boulderAt(ctx, level.id, m.x, m.y));
  } else m = room;
  maketrap(ctx, level.id, m.x, m.y, kind, { inMklev: true });
  if (kind === TRAP.web && !noSpiderOnWeb)
    makemon(ctx, ctx.defs.monster(GIANT_SPIDER), m, { level: level.id, inMklev: true });
  // gi.in_mklev && kind != NO_TRAP && !(mktrapflags & MKTRAP_NOVICTIM) && lvl <= rnd(4) ...
  ctx.rng.rnd(4);
}

/**
 * One ordinary room's contents, in mklev's order: a monster (1 in 3; a giant spider gets a web
 * under it), traps (while 1 in x,
 * x = 8 - depth / 6, at least 2), gold (1 in 3), a large box or chest (1 in nroom * 5 / 2),
 * a fountain (1 in 10), a sink (1 in 60), an altar (1 in 60), a statue (1 in 20), then random
 * objects (1 in 3 for the first, then 1 in 5 for each further one). ref: src/mklev.c
 * fill_ordinary_room(). Mimics, graves, engravings and the bonus items do not exist, and so do
 * not roll.
 */
export function fillOrdinaryRoom(ctx: Ctx, level: Level, room: Room): void {
  let pos: Pos | null;
  let trycnt = 0;
  // put a sleeping monster inside
  if (ctx.rng.rn2(3) === 0 && (pos = somexyspace(ctx, level, room))) {
    const tmonst = makemon(ctx, null, pos, { level: level.id, nogroup: true, inMklev: true });
    // !occupied(): somexyspace() found no trap or furniture there
    const tdef = tmonst === null ? undefined : ctx.state.entities[String(tmonst)]?.def;
    if (tdef === GIANT_SPIDER && !trapAt(level, pos.x, pos.y))
      maketrap(ctx, level.id, pos.x, pos.y, TRAP.web);
  }
  // put traps inside
  let x = 8 - Math.trunc(level.depth / 6);
  if (x <= 1) x = 2;
  while (ctx.rng.rn2(x) === 0 && ++trycnt < 1000) mktrap(ctx, level, room);
  if (ctx.rng.rn2(3) === 0 && (pos = somexyspace(ctx, level, room)))
    mkgold(ctx, 0, { level: level.id, x: pos.x, y: pos.y });
  if (ctx.rng.rn2(10) === 0) mkfount(ctx, level, room);
  if (ctx.rng.rn2(60) === 0) mksink(ctx, level, room);
  if (ctx.rng.rn2(60) === 0) mkaltar(ctx, level, room);
  // (the grave roll is not drawn: no graves, DEVIATIONS.md "Special rooms")
  // put statues inside
  if (ctx.rng.rn2(20) === 0 && (pos = somexyspace(ctx, level, room)))
    mkcorpstat(ctx, null, { level: level.id, x: pos.x, y: pos.y }, { init: true, inMklev: true });
  // put box/chest inside
  const nroom = level.rooms.filter((r) => r.parent === undefined).length; // svr.rooms[] only
  if (ctx.rng.rn2(Math.trunc((nroom * 5) / 2)) === 0 && (pos = somexyspace(ctx, level, room))) {
    const def = ctx.defs.object(ctx.rng.rn2(3) ? 'nh:large_box' : 'nh:chest');
    mksobjFull(
      ctx,
      def,
      { at: { level: level.id, x: pos.x, y: pos.y } },
      { level: level.id, inMklev: true },
    );
  }
  if (ctx.rng.rn2(3) === 0 && (pos = somexyspace(ctx, level, room))) {
    mkobjAt(ctx, 'random', { level: level.id, x: pos.x, y: pos.y }, true);
    for (trycnt = 0; ctx.rng.rn2(5) === 0;) {
      if (++trycnt > 100) break; // impossible("trycnt overflow4")
      if ((pos = somexyspace(ctx, level, room)))
        mkobjAt(ctx, 'random', { level: level.id, x: pos.x, y: pos.y }, true);
    }
  }
}

const GIANT_SPIDER: DefId = 'nh:giant_spider';

const SDOORS: readonly DefId[] = [T.sdoor_v, T.sdoor_h, T.sdoor_locked_v, T.sdoor_locked_h];

/** A door or secret door orthogonally next to x,y. ref: src/mklev.c bydoor() */
function bydoor(ctx: Ctx, level: Level, x: number, y: number): boolean {
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= level.width || ny >= level.height) continue;
    const tid = level.palette[level.cells[cellIndex(level, nx, ny)] ?? 0];
    if (tid !== undefined && (ctx.defs.terrain(tid).door !== undefined || SDOORS.includes(tid)))
      return true;
  }
  return false;
}

/**
 * A free floor square of the room not next to a door, or null (somexyspace() failing, or 200
 * tries). somexyspace() already leaves out occupied squares. ref: src/mklev.c find_okay_roompos()
 */
function findOkayRoompos(ctx: Ctx, level: Level, room: Room): Pos | null {
  for (let tryct = 1; tryct <= 200; tryct++) {
    const pos = somexyspace(ctx, level, room);
    if (!pos) return null;
    if (!bydoor(ctx, level, pos.x, pos.y)) return pos;
  }
  return null;
}

/** A fountain in the room, magic ("blessed") 1 time in 7. ref: src/mklev.c mkfount() */
export function mkfount(ctx: Ctx, level: Level, room: Room): void {
  const m = findOkayRoompos(ctx, level, room);
  if (!m) return;
  setTerrain(level, m.x, m.y, T.fountain);
  if (ctx.rng.rn2(7) === 0) setFountainBits(ctx, level.id, m.x, m.y, FTN_MAGIC);
}

/** A sink in the room. ref: src/mklev.c mksink() (no nsinks count: level sounds are not ported) */
export function mksink(ctx: Ctx, level: Level, room: Room): void {
  const m = findOkayRoompos(ctx, level, room);
  if (m) setTerrain(level, m.x, m.y, T.sink);
}

/**
 * An altar of a random alignment (chaotic, neutral or lawful) in an ordinary room; not a shrine.
 * ref: src/mklev.c mkaltar()
 */
export function mkaltar(ctx: Ctx, level: Level, room: Room): void {
  if (room.type !== undefined) return; // croom->rtype != OROOM
  const m = findOkayRoompos(ctx, level, room);
  if (!m) return;
  setTerrain(level, m.x, m.y, altarOf((ctx.rng.rn2(A_LAWFUL + 2) - 1) as Aligntyp));
}

/**
 * Makes the boulders level generation asked for in its extra corridors (`Level.boulderSpots`,
 * core makes no objects) and deletes the request, so no saved level keeps it. They come first,
 * as NetHack makes them while digging, before any room is filled. Boulders draw no random
 * numbers in mksobj(). ref: src/sp_lev.c dig_corridor() mksobj_at(BOULDER, xx, yy, TRUE, FALSE)
 */
export function mkCorridorBoulders(ctx: Ctx, level: Level): void {
  const spots = level.boulderSpots;
  if (spots === undefined) return;
  delete level.boulderSpots;
  const def = ctx.defs.object(BOULDER);
  for (const p of spots)
    mksobjFull(
      ctx,
      def,
      { at: { level: level.id, x: p.x, y: p.y } },
      { level: level.id, inMklev: true },
    );
}

/**
 * Keeps the doors level generation made trapped (`Level.trappedDoorSpots`, core has no door
 * traps) in content state and deletes the request, so no saved level keeps it. A spot that is
 * no longer a closed, locked or secret door is dropped. ref: src/mklev.c dosdoor(),
 * src/sp_lev.c create_door() (doormask |= D_TRAPPED)
 */
export function keepTrappedDoors(ctx: Ctx, level: Level): void {
  const spots = level.trappedDoorSpots;
  if (spots === undefined) return;
  delete level.trappedDoorSpots;
  for (const p of spots) setDoorTrapped(ctx, level.id, p.x, p.y, true);
  pruneDoorTraps(ctx, level);
}

/** Registers level population: ordinary levels and `rooms` LevelDefs (see sp_lev.ts for the rest). */
export function registerMklev(api: ModApi): void {
  api.on('newLevel', (ctx, level) => {
    mkCorridorBoulders(ctx, level);
    keepTrappedDoors(ctx, level);
    mkVault(ctx, level); // after the corridors, before the special room, as do_vault
    if (level.def === undefined) mkSpecialRoom(ctx, level);
    if (level.def === undefined || ctx.defs.level(level.def).init.style === 'rooms')
      for (const room of level.rooms)
        // not subrooms, nor special rooms (ROOM_IS_FILLABLE)
        if (room.parent === undefined && room.type === undefined)
          fillOrdinaryRoom(ctx, level, room);
  });
}
