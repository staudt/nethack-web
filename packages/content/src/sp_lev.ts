// Making the contents of a LevelDef: monsters, objects and traps at random dry spots.
// ref: src/sp_lev.c create_monster(), create_object(), create_trap(), get_location()
import type {
  Ctx,
  Level,
  LevelContent,
  LevelCount,
  LevelDef,
  ModApi,
  ObjectClass,
  Pos,
} from '@nh/core';
import { cellIndex, isPlainFloor } from '@nh/core';
import { makemon, mkclass } from './generation';
import { mkobjAt, mksobjFull } from './mkobj';
import { mktrap } from './mklev';

/**
 * A random spot that passes `ok`: 100 random picks, then the first in column order; null when
 * there is none (C calls impossible()). ref: src/sp_lev.c get_location() with no room
 */
function getLocation(ctx: Ctx, level: Level, ok: (p: Pos) => boolean): Pos | null {
  for (let cpt = 0; cpt < 100; cpt++) {
    const p = { x: ctx.rng.rn2(level.width), y: ctx.rng.rn2(level.height) };
    if (ok(p)) return p;
  }
  for (let x = 0; x < level.width; x++)
    for (let y = 0; y < level.height; y++) if (ok({ x, y })) return { x, y };
  return null;
}

/**
 * DRY: walkable ground that is not a door, so floor, corridor and stairs.
 * ref: src/sp_lev.c is_ok_location() DRY, include/rm.h SPACE_POS()
 */
function dry(ctx: Ctx, level: Level, p: Pos): boolean {
  const id = level.palette[level.cells[cellIndex(level, p.x, p.y)] ?? -1];
  if (id === undefined) return false;
  const t = ctx.defs.terrain(id);
  return t.passable && t.door === undefined;
}

/** ref: nhlua math.random(min, max) = min + rn2(max - min + 1) */
function rollCount(ctx: Ctx, count: LevelCount | undefined): number {
  if (count === undefined) return 1;
  if (typeof count === 'number') return count;
  return count.min + ctx.rng.rn2(count.max - count.min + 1);
}

/** ref: src/sp_lev.c create_monster() with no room and random coordinates */
function createMonster(ctx: Ctx, level: Level, c: LevelContent): void {
  const def =
    c.id !== undefined
      ? ctx.defs.monster(c.id)
      : c.class !== undefined
        ? mkclass(ctx, c.class, level.depth, ['nogen']) // mkclass(class, G_NOGEN)
        : null;
  const pos = getLocation(ctx, level, (p) => dry(ctx, level, p));
  if (pos) makemon(ctx, def, pos, { level: level.id });
}

/** ref: src/sp_lev.c create_object() with no room and random coordinates */
function createObject(ctx: Ctx, level: Level, c: LevelContent): void {
  const pos = getLocation(ctx, level, (p) => dry(ctx, level, p));
  if (!pos) return;
  const at = { level: level.id, x: pos.x, y: pos.y };
  if (c.id !== undefined)
    mksobjFull(ctx, ctx.defs.object(c.id), { at }, { level: level.id, inMklev: true });
  else mkobjAt(ctx, (c.class as ObjectClass | undefined) ?? 'random', at, true);
}

/**
 * ref: src/sp_lev.c create_trap() with no room: a DRY spot that is not stairs (100 tries), then
 * mklev.c mktrap() there. Here the spot must be plain floor, where traps may go.
 */
function createTrap(ctx: Ctx, level: Level, c: LevelContent): void {
  let pos: Pos | null = null;
  for (let trycnt = 0; trycnt <= 100; trycnt++) {
    pos = getLocation(ctx, level, (p) => dry(ctx, level, p));
    if (!pos || isPlainFloor(ctx.defs, level, pos.x, pos.y)) break;
  }
  if (pos && isPlainFloor(ctx.defs, level, pos.x, pos.y)) mktrap(ctx, level, pos, c.id ?? null);
}

/**
 * Makes `def.contents` in order: each entry first rolls its `percent` (ref: nhlua percent(),
 * rn2(100) < n), then its count, then makes that many things.
 */
export function fillSpecialLevel(ctx: Ctx, level: Level, def: LevelDef): void {
  for (const c of def.contents ?? []) {
    if (c.percent !== undefined && ctx.rng.rn2(100) >= c.percent) continue;
    const n = rollCount(ctx, c.count);
    for (let i = 0; i < n; i++) {
      if (c.kind === 'monster') createMonster(ctx, level, c);
      else if (c.kind === 'object') createObject(ctx, level, c);
      else createTrap(ctx, level, c);
    }
  }
}

/** Fills levels built from a LevelDef; runs after mklev's own newLevel hook. */
export function registerSpLev(api: ModApi): void {
  api.on('newLevel', (ctx, level) => {
    if (level.def !== undefined) fillSpecialLevel(ctx, level, ctx.defs.level(level.def));
  });
}
