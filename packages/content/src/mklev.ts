// Filling the rooms of a new level with a monster, traps, gold, a box and objects.
// ref: src/mklev.c fill_ordinary_room(), makelevel(), mktrap()
import type { Ctx, DefId, Level, ModApi, Pos, Room } from '@nh/core';
import { cellIndex, trapAt } from '@nh/core';
import { makemon } from './generation';
import { mkgold } from './items';
import { mkobjAt, mksobjFull } from './mkobj';
import { TRAP, canFallThru, isHole, maketrap } from './trap';

/**
 * A random free floor square in the room, or null after 100 failed tries (101 attempts).
 * ref: src/mkroom.c somexyspace(): somexy() = rn1(hx - lx + 1, lx), rn1(hy - ly + 1, ly), which
 * must be plain ROOM floor and not `occupied()` (a trap or furniture; monsters are ignored).
 * Stairs stand in for all furniture, as no other exists.
 */
export function somexyspace(ctx: Pick<Ctx, 'rng'>, level: Level, room: Room): Pos | null {
  for (let trycnt = 0; trycnt <= 100; trycnt++) {
    const x = room.lx + ctx.rng.rn2(room.hx - room.lx + 1);
    const y = room.ly + ctx.rng.rn2(room.hy - room.ly + 1);
    const t = level.palette[level.cells[cellIndex(level, x, y)] ?? 0];
    if (t === 'nh:floor' && !trapAt(level, x, y)) return { x, y };
  }
  return null;
}

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
  null, // 6 LANDMINE
  null, // 7 ROLLING_BOULDER_TRAP
  TRAP.sleepGas, // 8 SLP_GAS_TRAP
  TRAP.rust, // 9 RUST_TRAP
  null, // 10 FIRE_TRAP
  null, // 11 PIT
  null, // 12 SPIKED_PIT
  TRAP.hole, // 13 HOLE
  TRAP.trapdoor, // 14 TRAPDOOR
  null, // 15 TELEP_TRAP
  null, // 16 LEVEL_TELEP
  null, // 17 MAGIC_PORTAL
  null, // 18 WEB
  null, // 19 STATUE_TRAP
  null, // 20 MAGIC_TRAP
  null, // 21 ANTI_MAGIC
  null, // 22 POLY_TRAP
  null, // 23 VIBRATING_SQUARE
  null, // 24 TRAPPED_DOOR
  null, // 25 TRAPPED_CHEST
];

/**
 * A random trap kind for a level of difficulty `lvl`, or null for NO_TRAP ("too hard", or a
 * kind this port does not have). ref: src/mklev.c traptype_rnd(): `kind = rnd(TRAPNUM - 1)`;
 * sleeping gas needs level 2; holes are made only 1 time in 7. The restrictions of the kinds we
 * lack draw no random numbers.
 */
export function traptypeRnd(ctx: Pick<Ctx, 'rng'>, lvl: number): DefId | null {
  const kind = ctx.rng.rnd(TRAPNUM_KINDS.length - 1);
  const def = TRAPNUM_KINDS[kind] ?? null;
  if (def === TRAP.sleepGas && lvl < 2) return null;
  if (def === TRAP.hole && ctx.rng.rn2(7)) return null;
  return def;
}

/**
 * Makes a trap of `kind` (random when null) on a free floor square of the room, or at a given
 * spot (as sp_lev.c create_trap() passes `tm`). ref: src/mklev.c mktrap(); with a room: the kind is rerolled until one is allowed; a hole or trap door
 * where one cannot fall through becomes a falling rock trap; the square comes from somexyspace()
 * (which already avoids occupied squares, so the retry loop never repeats). The dead
 * adventurer (`mktrap_victim()`) is not made, but its `rnd(4)` roll is (see DEVIATIONS.md).
 */
export function mktrap(ctx: Ctx, level: Level, room: Room | Pos, kind: DefId | null = null): void {
  const lvl = level.depth; // level_difficulty()
  while (kind === null) kind = traptypeRnd(ctx, lvl);
  if (isHole(kind) && !canFallThru(ctx.state, level)) kind = TRAP.rock;
  const m = 'lx' in room ? somexyspace(ctx, level, room) : room;
  if (!m) return;
  maketrap(ctx, level.id, m.x, m.y, kind);
  // gi.in_mklev && kind != NO_TRAP && !(mktrapflags & MKTRAP_NOVICTIM) && lvl <= rnd(4) ...
  ctx.rng.rnd(4);
}

/**
 * One ordinary room's contents, in mklev's order: a monster (1 in 3), traps (while 1 in x,
 * x = 8 - depth / 6, at least 2), gold (1 in 3), a large box or chest (1 in nroom * 5 / 2),
 * then random objects (1 in 3 for the first, then 1 in 5 for each further one).
 * ref: src/mklev.c fill_ordinary_room(). Mimics, fountains, sinks, altars, graves, statues,
 * engravings and the bonus items do not exist, and so do not roll.
 */
export function fillOrdinaryRoom(ctx: Ctx, level: Level, room: Room): void {
  let pos: Pos | null;
  let trycnt = 0;
  // put a sleeping monster inside
  if (ctx.rng.rn2(3) === 0 && (pos = somexyspace(ctx, level, room)))
    makemon(ctx, null, pos, { level: level.id, nogroup: true });
  // put traps inside
  let x = 8 - Math.trunc(level.depth / 6);
  if (x <= 1) x = 2;
  while (ctx.rng.rn2(x) === 0 && ++trycnt < 1000) mktrap(ctx, level, room);
  if (ctx.rng.rn2(3) === 0 && (pos = somexyspace(ctx, level, room)))
    mkgold(ctx, 0, { level: level.id, x: pos.x, y: pos.y });
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

/** Registers level population: ordinary levels and `rooms` LevelDefs (see sp_lev.ts for the rest). */
export function registerMklev(api: ModApi): void {
  api.on('newLevel', (ctx, level) => {
    if (level.def === undefined || ctx.defs.level(level.def).init.style === 'rooms')
      for (const room of level.rooms)
        if (room.parent === undefined) fillOrdinaryRoom(ctx, level, room); // not subrooms
  });
}
