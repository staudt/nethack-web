// Filling the rooms of a new level with a monster, traps, gold, a box and objects.
// ref: src/mklev.c fill_ordinary_room(), makelevel(), mktrap()
// makelevel()'s special room (mkroom.ts) is picked before the rooms are filled.
import { uHave } from './uhave';
import { levelDifficulty } from './levdiff';
import { pruneDoorTraps, setDoorTrapped } from './btrapstate';
import type { Ctx, DefId, Level, ModApi, Pos, Room } from '@nh/core';
import { cellIndex, mazexy, trapAt, VANILLA_TERRAIN } from '@nh/core';
import { A_LAWFUL, altarOf, type Aligntyp } from './aligntyp';
import { BOULDER, boulderAt } from './boulder';
import { FTN_MAGIC, setFountainBits } from './fountain';
import { makemon, mkclass } from './generation';
import { setMimicSym } from './mimicstate';
import { isGone } from './vanquished';
import { mkgold } from './items';
import { mkobj, mkobjAt, mksobjFull } from './mkobj';
import { mkSpecialRoom } from './mkroom';
import { somexyspace, somexyspaceTry } from './somexy';
import { makeEngrAt } from './engr';
import { makeGrave } from './grave';
import { randomEngraving } from './rndengr';
import { mkcorpstat } from './statue';
import { canDigDown, inHell, isRogueLevel, levelFlags, singleLevelBranch } from './levelflags';
import { T, setTerrain, terrainIdAt } from './terrain';
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
  TRAP.fire, // 10 FIRE_TRAP
  TRAP.pit, // 11 PIT
  TRAP.spikedPit, // 12 SPIKED_PIT
  TRAP.hole, // 13 HOLE
  TRAP.trapdoor, // 14 TRAPDOOR
  TRAP.tele, // 15 TELEP_TRAP
  TRAP.levelTele, // 16 LEVEL_TELEP
  null, // 17 MAGIC_PORTAL (TRAP.portal: never random)
  TRAP.web, // 18 WEB
  TRAP.statue, // 19 STATUE_TRAP
  TRAP.magic, // 20 MAGIC_TRAP
  TRAP.antiMagic, // 21 ANTI_MAGIC
  TRAP.poly, // 22 POLY_TRAP
  null, // 23 VIBRATING_SQUARE (TRAP.vibrating: never random)
  null, // 24 TRAPPED_DOOR
  null, // 25 TRAPPED_CHEST
];

/**
 * A random trap kind for a level of difficulty `lvl`, or null for NO_TRAP ("too hard", or a
 * kind this port does not have). ref: src/mklev.c traptype_rnd(): `kind = rnd(TRAPNUM - 1)`;
 * rolling boulder traps and sleeping gas need level 2, spiked pits level 5, land mines level 6,
 * webs level 7 (unless no spider comes with them, `noSpiderOnWeb`), statue and polymorph traps level 8; level teleporters need level 5 and a level
 * that allows teleporting (`noteleport`: the level's flag), as teleportation traps do; fire traps
 * are made only in Gehennom (`inhell`); holes are made only 1 time in 7. The restrictions of the
 * kinds we lack draw no random numbers. `single_level_branch()` needs nothing here: Fort Ludios,
 * the only one, is a no-teleport level.
 */
export function traptypeRnd(
  ctx: Pick<Ctx, 'rng'>,
  lvl: number,
  noteleport = false,
  noSpiderOnWeb = false,
  inhell = false,
): DefId | null {
  const kind = ctx.rng.rnd(TRAPNUM_KINDS.length - 1);
  const def = TRAPNUM_KINDS[kind] ?? null;
  if (def === TRAP.fire && !inhell) return null;
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
 * A random trap kind for a special level's stocked maze (fill_empty_maze()): any kind but holes,
 * trap doors where one cannot dig down, and teleportation traps and level teleporters on a
 * no-teleport level, rerolled until one is allowed (the kinds this port lacks reroll too). Fire
 * traps are allowed on every level: C's rndtrap() has no fire case (traptype_rnd() keeps them to
 * Gehennom). ref: src/sp_lev.c rndtrap()
 */
export function rndtrap(ctx: Ctx, level: Level): DefId {
  const noteleport = levelFlags(ctx, level).noteleport === true;
  for (;;) {
    const def = TRAPNUM_KINDS[ctx.rng.rnd(TRAPNUM_KINDS.length - 1)] ?? null;
    if (def === null || def === TRAP.hole) continue;
    if (def === TRAP.trapdoor && !canDigDown(ctx, level)) continue;
    if ((def === TRAP.tele || def === TRAP.levelTele) && noteleport) continue;
    return def;
  }
}

/** The Rogue level's trap kinds, by `rn2(7)`. ref: src/mklev.c traptype_roguelvl() */
const ROGUE_TRAPS: readonly DefId[] = [
  TRAP.bear,
  TRAP.arrow,
  TRAP.dart,
  TRAP.trapdoor,
  TRAP.pit,
  TRAP.sleepGas,
  TRAP.rust,
];

/** A random trap kind for the Rogue level. ref: src/mklev.c traptype_roguelvl() */
export function traptypeRogue(ctx: Pick<Ctx, 'rng'>): DefId {
  return ROGUE_TRAPS[ctx.rng.rn2(ROGUE_TRAPS.length)] as DefId;
}

/**
 * Makes a trap of `kind` (random when null) on a free floor square of the room, at a given
 * spot (as sp_lev.c create_trap() passes `tm`), or on a maze level at mazexy() spots without a
 * trap (`'maze'`, MKTRAP_MAZEFLAG). ref: src/mklev.c mktrap(); a random kind is one of
 * traptype_roguelvl()'s seven on the Rogue level, a fire trap 1 time in 5 in Gehennom, else
 * rerolled until one is allowed; a hole or trap door where one cannot fall through becomes a falling rock trap; the square comes from somexyspace()
 * (which already avoids occupied squares; the retry loop repeats only for a pit or hole on a
 * boulder). A web gets a giant spider on it (made with the level, so it may get an object under
 * it), unless `noSpiderOnWeb` (MKTRAP_NOSPIDERONWEB). The dead
 * adventurer (`mktrap_victim()`) is not made, but its `rnd(4)` roll is (see DEVIATIONS.md).
 */
export function mktrap(
  ctx: Ctx,
  level: Level,
  room: Room | Pos | 'maze',
  kind: DefId | null = null,
  noSpiderOnWeb = false,
): void {
  const lvl = levelDifficulty(ctx, level);
  const noteleport = levelFlags(ctx, level).noteleport === true; // svl.level.flags.noteleport
  const hell = inHell(ctx.state, level);
  if (kind === null && isRogueLevel(level)) kind = traptypeRogue(ctx);
  // bias the frequency of fire traps in Gehennom
  else if (kind === null && hell && !ctx.rng.rn2(5)) kind = TRAP.fire;
  while (kind === null) kind = traptypeRnd(ctx, lvl, noteleport, noSpiderOnWeb, hell);
  if (isHole(kind) && !canFallThru(ctx.state, level)) kind = TRAP.rock;
  let m: Pos | null;
  if (room === 'maze') {
    // MKTRAP_MAZEFLAG: mazexy() spots (maze floor or corridor, so occupied() is a trap there)
    const avoidBoulder = isPit(kind) || isHole(kind);
    let tryct = 0;
    do {
      if (++tryct > 200) return;
      m = mazexy(ctx.rng, level, VANILLA_TERRAIN);
      if (!m) return;
    } while (
      trapAt(level, m.x, m.y) !== undefined ||
      (avoidBoulder && boulderAt(ctx, level.id, m.x, m.y))
    );
  } else if ('lx' in room) {
    // a pit or hole avoids boulder squares (somexyspace() already skips occupied ones)
    const avoidBoulder = isPit(kind) || isHole(kind);
    let tryct = 0;
    do {
      if (++tryct > 200) return;
      m = somexyspace(ctx, level, room);
      if (!m) return;
    } while (avoidBoulder && boulderAt(ctx, level.id, m.x, m.y));
  } else m = room;
  // maketrap() makes no level teleporter in a branch of one level (Fort Ludios); kind = NO_TRAP
  // then, so no web spider and no victim either
  if (kind === TRAP.levelTele && singleLevelBranch(level)) return;
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
 * a fountain (1 in 10), a sink (1 in 60), an altar (1 in 60), a grave (1 in 80 - 2 * depth, at
 * least 2), a statue (1 in 20), graffiti (1 in 27 + 3 * depth), then random objects (1 in 3 for
 * the first, then 1 in 5 for each further one). On the Rogue level everything between the gold
 * and the objects is left out, draws included (C's `goto skip_nonrogue`).
 * ref: src/mklev.c fill_ordinary_room(). Mimics and the bonus items do not exist, and so do not
 * roll.
 */
export function fillOrdinaryRoom(ctx: Ctx, level: Level, room: Room): void {
  let pos: Pos | null;
  let trycnt = 0;
  // put a sleeping monster inside (always while she carries the Amulet)
  if (
    (uHave(ctx.state, 'amulet') || ctx.rng.rn2(3) === 0) &&
    (pos = somexyspace(ctx, level, room))
  ) {
    const tmonst = makemon(ctx, null, pos, { level: level.id, nogroup: true, inMklev: true });
    // !occupied(): somexyspace() found no trap or furniture there
    const tdef = tmonst === null ? undefined : ctx.state.entities[String(tmonst)]?.def;
    if (tdef === GIANT_SPIDER && !trapAt(level, pos.x, pos.y))
      maketrap(ctx, level.id, pos.x, pos.y, TRAP.web);
  }
  // put traps inside
  let x = 8 - Math.trunc(levelDifficulty(ctx, level) / 6);
  if (x <= 1) x = 2;
  while (ctx.rng.rn2(x) === 0 && ++trycnt < 1000) mktrap(ctx, level, room);
  if (ctx.rng.rn2(3) === 0 && (pos = somexyspace(ctx, level, room)))
    mkgold(ctx, 0, { level: level.id, x: pos.x, y: pos.y });
  if (!isRogueLevel(level)) fillNonRogue(ctx, level, room);
  // skip_nonrogue:
  if (ctx.rng.rn2(3) === 0 && (pos = somexyspace(ctx, level, room))) {
    mkobjAt(ctx, 'random', { level: level.id, x: pos.x, y: pos.y }, true);
    for (trycnt = 0; ctx.rng.rn2(5) === 0;) {
      if (++trycnt > 100) break; // impossible("trycnt overflow4")
      if ((pos = somexyspace(ctx, level, room)))
        mkobjAt(ctx, 'random', { level: level.id, x: pos.x, y: pos.y }, true);
    }
  }
}

/**
 * fill_ordinary_room()'s part that the Rogue level leaves out: a fountain, a sink, an altar, a
 * grave, a statue, a box and graffiti. ref: src/mklev.c fill_ordinary_room()
 */
function fillNonRogue(ctx: Ctx, level: Level, room: Room): void {
  let pos: Pos | null;
  if (ctx.rng.rn2(10) === 0) mkfount(ctx, level, room);
  if (ctx.rng.rn2(60) === 0) mksink(ctx, level, room);
  if (ctx.rng.rn2(60) === 0) mkaltar(ctx, level, room);
  let x = 80 - level.depth * 2;
  if (x < 2) x = 2;
  if (!ctx.rng.rn2(x)) mkgrave(ctx, level, room);
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
  // maybe make some graffiti
  if (!ctx.rng.rn2(27 + 3 * Math.abs(level.depth))) graffiti(ctx, level, room);
}

const GIANT_SPIDER: DefId = 'nh:giant_spider';

/**
 * A random engraving as graffiti (MARK, finished at turn 0) on a floor square of the room: the
 * spot is somexyspace()'s, tried again while it is not floor and `!rn2(40)`; on anything else
 * nothing is written. A worn text that reads exactly "Elbereth" guards the objects on it
 * (make_engr_at()'s `in_mklev`). ref: src/mklev.c fill_ordinary_room() "maybe make some graffiti"
 */
function graffiti(ctx: Ctx, level: Level, room: Room): void {
  const { text, pristine } = randomEngraving(ctx);
  let p: Pos;
  do p = somexyspaceTry(ctx, level, room).pos;
  while (terrainIdAt(level, p.x, p.y) !== T.floor && !ctx.rng.rn2(40));
  if (terrainIdAt(level, p.x, p.y) === T.floor)
    makeEngrAt(ctx, level, p.x, p.y, text, pristine, 0, 'mark', { inMklev: true });
}

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
 * A grave in an ordinary room, away from its doors, with an epitaph or, 1 time in 10, "Saved by
 * the bell!". What C buries in it (gold 1 time in 3, `rn2(5)` cursed random objects) is made and
 * thrown away, so the stream stays C's: there is no burial, and no bell (no such object).
 * ref: src/mklev.c mkgrave()
 */
export function mkgrave(ctx: Ctx, level: Level, room: Room): void {
  const dobell = !ctx.rng.rn2(10);
  if (room.type !== undefined) return; // croom->rtype != OROOM
  const m = findOkayRoompos(ctx, level, room);
  if (!m) return;
  // Put a grave at <m.x,m.y>
  makeGrave(ctx, level, m.x, m.y, dobell ? 'Saved by the bell!' : null);
  // Possibly fill it with objects
  if (!ctx.rng.rn2(3)) {
    // a loose stack of gold, buried: mksobj(GOLD_PIECE, TRUE, FALSE) draws nothing, then
    // `quan = rnd(20) + level_difficulty() * rnd(5)` (not buried here: DEVIATIONS.md "Graves")
    ctx.rng.rnd(20);
    ctx.rng.rnd(5);
  }
  for (let tryct = ctx.rng.rn2(5); tryct; tryct--) {
    // mkobj(RANDOM_CLASS, TRUE), cursed and buried: made for its draws, then thrown away
    const otmp = mkobj(ctx, 'random', { level: level.id, inMklev: true });
    if (otmp === null) return;
    ctx.remove(otmp);
  }
  // (no bell "in case we accidentally buried someone alive": mksobj_at(BELL) draws nothing)
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

/** ref: src/mklev.c dosdoor(): `svm.mvitals[PM_*_MIMIC].mvflags & G_GONE` for all three */
const MIMICS: readonly DefId[] = ['nh:small_mimic', 'nh:large_mimic', 'nh:giant_mimic'];

/**
 * Keeps the doors level generation made trapped (`Level.trappedDoorSpots`, core has no door
 * traps) in content state and deletes the request, so no saved level keeps it. A spot that is
 * no longer a closed, locked or secret door is dropped. From difficulty 9 a trapped (not
 * secret) door is, one time in 5 unless all three mimics are genocided or extinct, a doorway
 * with a mimic posing as the door instead; the roll is drawn here, in core's door order, after the level's
 * rooms and corridors (decision 8: C draws it while making the door). (Every trapped door with a
 * door state comes from dosdoor(): no LevelDef has a random-state door, create_door()'s.)
 * ref: src/mklev.c dosdoor(), src/sp_lev.c create_door() (doormask |= D_TRAPPED)
 */
export function keepTrappedDoors(ctx: Ctx, level: Level): void {
  const spots = level.trappedDoorSpots;
  if (spots === undefined) return;
  delete level.trappedDoorSpots;
  for (const p of spots) {
    const typ = terrainIdAt(level, p.x, p.y);
    if (
      (typ === T.door_closed || typ === T.door_locked) &&
      levelDifficulty(ctx, level) >= 9 &&
      !ctx.rng.rn2(5) &&
      !MIMICS.every((id) => isGone(ctx.state, id))
    ) {
      // make a mimic instead
      setTerrain(level, p.x, p.y, T.doorway);
      const id = makemon(ctx, mkclass(ctx, 'm', levelDifficulty(ctx, level)), p, {
        level: level.id,
        inMklev: true,
      });
      if (id !== null) setMimicSym(ctx, id, true);
      continue;
    }
    setDoorTrapped(ctx, level.id, p.x, p.y, true);
  }
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
      fillOrdinaryRooms(ctx, level);
  });
}

/**
 * Every ordinary room's contents, in room order: not subrooms, nor special rooms
 * (ROOM_IS_FILLABLE). The Rogue level's fixup (rogue.ts) runs it once its rooms exist.
 * ref: src/mklev.c makelevel() ("for each room: put things inside")
 */
export function fillOrdinaryRooms(ctx: Ctx, level: Level): void {
  for (const room of level.rooms)
    if (room.parent === undefined && room.type === undefined) fillOrdinaryRoom(ctx, level, room);
}
