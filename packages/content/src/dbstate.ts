// Drawbridges: which squares hold one, which way it faces and what lies under it; the castle
// tune and the hero's drawbridge events. A leaf over the terrain table, so the modules that
// meet a drawbridge (water, boulders, zaps, kicks, prayer) can ask about it without reaching the
// entity code of dbridge.ts.
// ref: include/rm.h DB_NORTH .. DB_WEST, DB_MOAT, DB_LAVA, DB_ICE, DB_FLOOR (`drawbridgemask`),
// IS_DRAWBRIDGE(); src/dbridge.c is_drawbridge_wall(), is_db_wall(), find_drawbridge(),
// get_wall_for_db(), db_under_typ(); include/you.h u.uevent.uheard_tune, uopened_dbridge;
// src/dungeon.c init_castle_tune() (`svt.tune`)
//
// `modData.nh.drawbridges[levelId][cellIndex]` holds C's `drawbridgemask` of each bridge's span
// (its direction and what lies under it); the span's terrain says whether it is raised or
// lowered (and, raised, shows what is under it: terrain.ts), the portcullis's terrain is a
// raised drawbridge (DBWALL) or a doorway. `modData.nh.tune` is the passtune (five notes A-G),
// `uheardTune` C's u.uevent.uheard_tune (0 none, 1 heard of it, 2 knows it, 3 the bridge is
// gone) and `uopenedDbridge` u.uevent.uopened_dbridge; each is written only once it is set.
import {
  cellIndex,
  inBounds,
  type Ctx,
  type DefId,
  type Json,
  type Level,
  type Pos,
} from '@nh/core';
import { T, setTerrain, terrainIdAt } from './terrain';

/** ref: include/rm.h DB_NORTH, DB_SOUTH, DB_EAST, DB_WEST: where the portcullis is */
export type DbDir = 'north' | 'south' | 'east' | 'west';

/** ref: include/rm.h DB_MOAT, DB_LAVA, DB_ICE, DB_FLOOR: what lies under the span */
export type DbUnder = 'moat' | 'lava' | 'ice' | 'floor';

/** C's `drawbridgemask` of a span. */
export interface DrawbridgeData {
  dir: DbDir;
  under: DbUnder;
}

/** The Castle (C's Is_stronghold()): its LevelDef id. */
export const CASTLE: DefId = 'nh:castle';

type DbTable = Record<string, Record<string, DrawbridgeData>>;

const nhData = (ctx: Pick<Ctx, 'state'>, create: boolean): Record<string, Json> | null => {
  const nh = ctx.state.modData['nh'] as Record<string, Json> | undefined;
  if (nh || !create) return nh ?? null;
  const fresh: Record<string, Json> = {};
  ctx.state.modData['nh'] = fresh;
  return fresh;
};

const table = (ctx: Pick<Ctx, 'state'>, create: boolean): DbTable | null => {
  const nh = nhData(ctx, create);
  if (!nh) return null;
  const t = nh['drawbridges'];
  if (t && typeof t === 'object' && !Array.isArray(t)) return t as unknown as DbTable;
  if (!create) return null;
  const fresh: DbTable = {};
  nh['drawbridges'] = fresh as unknown as Json;
  return fresh;
};

/** The span's direction and what lies under it, or null (no drawbridge span at x, y). */
export function drawbridgeData(
  ctx: Pick<Ctx, 'state'>,
  level: Readonly<Level>,
  x: number,
  y: number,
): DrawbridgeData | null {
  if (!inBounds(level, x, y)) return null;
  return table(ctx, false)?.[level.id]?.[String(cellIndex(level, x, y))] ?? null;
}

/** Records (or with null forgets) the span at (x, y). */
export function setDrawbridgeData(
  ctx: Pick<Ctx, 'state'>,
  level: Readonly<Level>,
  x: number,
  y: number,
  data: DrawbridgeData | null,
): void {
  const key = String(cellIndex(level, x, y));
  if (data) {
    const t = table(ctx, true) as DbTable;
    (t[level.id] ??= {})[key] = { dir: data.dir, under: data.under };
    return;
  }
  const t = table(ctx, false);
  const row = t?.[level.id];
  if (!t || !row) return;
  delete row[key];
  if (Object.keys(row).length === 0) delete t[level.id];
}

const RAISED: Readonly<Record<DbUnder, DefId>> = {
  moat: T.drawbridge_up,
  lava: T.drawbridge_up_lava,
  ice: T.drawbridge_up_ice,
  floor: T.drawbridge_up_floor,
};
const RAISED_IDS: ReadonlySet<DefId> = new Set(Object.values(RAISED));

/** The raised span's terrain over `under` (DRAWBRIDGE_UP as back_to_glyph() shows it). */
export const raisedTerrain = (under: DbUnder): DefId => RAISED[under];

/**
 * The lowered span's terrain (DRAWBRIDGE_DOWN): `horizontal` (S_hodbridge) for a bridge that
 * runs east-west. ref: src/dbridge.c create_drawbridge() `levl[x][y].horizontal = !horiz`
 */
export const loweredTerrain = (dir: DbDir): DefId =>
  dir === 'east' || dir === 'west' ? T.drawbridge_down_h : T.drawbridge_down_v;

/** The raised portcullis's terrain (DBWALL), horizontal in a north or south wall. */
export const dbwallTerrain = (dir: DbDir): DefId =>
  dir === 'north' || dir === 'south' ? T.dbwall_h : T.dbwall_v;

/** ref: include/rm.h `typ == DRAWBRIDGE_UP` */
export const isRaisedSpan = (level: Readonly<Level>, x: number, y: number): boolean => {
  const id = inBounds(level, x, y) ? terrainIdAt(level, x, y) : undefined;
  return id !== undefined && RAISED_IDS.has(id);
};

/** ref: include/rm.h `typ == DRAWBRIDGE_DOWN` */
export const isLoweredSpan = (level: Readonly<Level>, x: number, y: number): boolean => {
  const id = inBounds(level, x, y) ? terrainIdAt(level, x, y) : undefined;
  return id === T.drawbridge_down_h || id === T.drawbridge_down_v;
};

/** ref: include/rm.h IS_DRAWBRIDGE(): the span, raised or lowered */
export const isDrawbridge = (level: Readonly<Level>, x: number, y: number): boolean =>
  isRaisedSpan(level, x, y) || isLoweredSpan(level, x, y);

/** The raised portcullis (DBWALL) stands at (x, y). ref: src/dbridge.c is_db_wall() */
export const isDbWall = (level: Readonly<Level>, x: number, y: number): boolean => {
  const id = inBounds(level, x, y) ? terrainIdAt(level, x, y) : undefined;
  return id === T.dbwall_h || id === T.dbwall_v;
};

const STEP: Readonly<Record<DbDir, readonly [number, number]>> = {
  north: [0, -1],
  south: [0, 1],
  east: [1, 0],
  west: [-1, 0],
};

/** The portcullis square of a span at (x, y) facing `dir`. ref: src/dbridge.c get_wall_for_db() */
export function wallForDb(dir: DbDir, x: number, y: number): Pos {
  const [dx, dy] = STEP[dir];
  return { x: x + dx, y: y + dy };
}

/**
 * Whether the door, doorway or raised portcullis at (x, y) is a drawbridge's portcullis: the
 * direction of that drawbridge (seen from its span), else null.
 * ref: src/dbridge.c is_drawbridge_wall() (`typ != DOOR && typ != DBWALL`: any door kind)
 */
export function isDrawbridgeWall(
  ctx: Pick<Ctx, 'state' | 'defs'>,
  level: Readonly<Level>,
  x: number,
  y: number,
): DbDir | null {
  if (!inBounds(level, x, y)) return null;
  const id = terrainIdAt(level, x, y);
  if (id === undefined) return null;
  if (ctx.defs.terrain(id).door === undefined && !isDbWall(level, x, y)) return null;
  // the span west of it facing east has its portcullis here, and so on
  const tries: readonly (readonly [number, number, DbDir])[] = [
    [x + 1, y, 'west'],
    [x - 1, y, 'east'],
    [x, y - 1, 'south'],
    [x, y + 1, 'north'],
  ];
  for (const [sx, sy, dir] of tries)
    if (isDrawbridge(level, sx, sy) && drawbridgeData(ctx, level, sx, sy)?.dir === dir) return dir;
  return null;
}

/**
 * The span of the drawbridge at (x, y), its span or its portcullis, else null.
 * ref: src/dbridge.c find_drawbridge()
 */
export function findDrawbridge(
  ctx: Pick<Ctx, 'state' | 'defs'>,
  level: Readonly<Level>,
  x: number,
  y: number,
): Pos | null {
  if (isDrawbridge(level, x, y)) return { x, y };
  const dir = isDrawbridgeWall(ctx, level, x, y);
  if (dir === null) return null;
  const [dx, dy] = STEP[dir];
  return { x: x - dx, y: y - dy };
}

/** What the span leaves when it goes: C's db_under_typ() (DB_FLOOR is STONE there). */
export function dbUnderTerrain(under: DbUnder): DefId {
  return under === 'ice' ? T.ice : under === 'lava' ? T.lava : under === 'moat' ? T.moat : T.stone;
}

/**
 * What lies under the span at (x, y) changes (a boulder fills the moat under a raised bridge:
 * DB_FLOOR); a raised span shows it at once.
 * ref: src/do.c boulder_hits_pool() (`drawbridgemask &= ~DB_UNDER; drawbridgemask |= DB_FLOOR`)
 */
export function setDrawbridgeUnder(
  ctx: Pick<Ctx, 'state'>,
  level: Level,
  x: number,
  y: number,
  under: DbUnder,
): void {
  const d = drawbridgeData(ctx, level, x, y);
  if (!d) return;
  setDrawbridgeData(ctx, level, x, y, { dir: d.dir, under });
  if (isRaisedSpan(level, x, y)) setTerrain(level, x, y, raisedTerrain(under));
}

/** The Castle's passtune, five notes 'A'..'G' ('' before it is drawn). ref: svt.tune */
export function castleTune(ctx: Pick<Ctx, 'state'>): string {
  const t = nhData(ctx, false)?.['tune'];
  return typeof t === 'string' ? t : '';
}

/** Sets the passtune (init_castle_tune(); tests). */
export function setCastleTune(ctx: Pick<Ctx, 'state'>, tune: string): void {
  (nhData(ctx, true) as Record<string, Json>)['tune'] = tune;
}

/** u.uevent.uheard_tune: 0, 1 (heard of it), 2 (knows it) or 3 (the bridge is destroyed). */
export function uheardTune(ctx: Pick<Ctx, 'state'>): number {
  const v = nhData(ctx, false)?.['uheardTune'];
  return typeof v === 'number' ? v : 0;
}

/** Sets u.uevent.uheard_tune. */
export function setUheardTune(ctx: Pick<Ctx, 'state'>, v: 0 | 1 | 2 | 3): void {
  const nh = nhData(ctx, v !== 0);
  if (!nh) return;
  if (v === 0) delete nh['uheardTune'];
  else nh['uheardTune'] = v;
}

/** u.uevent.uopened_dbridge: she opened or destroyed the Castle's drawbridge. */
export const uopenedDbridge = (ctx: Pick<Ctx, 'state'>): boolean =>
  nhData(ctx, false)?.['uopenedDbridge'] === true;

/** Sets u.uevent.uopened_dbridge. */
export function setUopenedDbridge(ctx: Pick<Ctx, 'state'>): void {
  (nhData(ctx, true) as Record<string, Json>)['uopenedDbridge'] = true;
}
