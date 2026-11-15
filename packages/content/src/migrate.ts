// Monsters that leave the map for another level and wait there until the hero arrives.
// ref: src/dog.c migrate_to_level() (MIGR_RANDOM, MIGR_STAIRS_UP/DOWN, MIGR_SSTAIRS,
// MIGR_LADDER_UP/DOWN, MIGR_PORTAL; the Wizard's Tower bit of `xyflags`)
import type { Ctx, Entity, Level, LevelId, Pos } from '@nh/core';
import { findTerrain } from './ladder';
import { inWTower } from './levelflags';
import { findPortal } from './portal';
import { T } from './terrain';
import { setMtrapped, trapTable } from './trapstate';
import { wormMigrate } from './wormstate';

/**
 * How a migrating monster arrives: on the up stairs (it went down them: C's MIGR_STAIRS_UP), on
 * the down stairs (MIGR_STAIRS_DOWN), on the branch stairs (MIGR_SSTAIRS), on the up or down
 * ladder (MIGR_LADDER_UP/DOWN) or on the magic portal (MIGR_PORTAL); none is MIGR_RANDOM.
 */
export type MigrVia =
  'stairs_up' | 'stairs_down' | 'sstairs' | 'ladder_up' | 'ladder_down' | 'portal';

const VIAS: readonly string[] = [
  'stairs_up',
  'stairs_down',
  'sstairs',
  'ladder_up',
  'ladder_down',
  'portal',
];

/**
 * The monster leaves the map until the hero gets to level `to` (which may not exist yet); then
 * it comes out at a random spot, or by the stairs `via` says (trap.ts monArrivals).
 * ref: src/dog.c migrate_to_level()
 */
export function migrateToLevel(
  ctx: Pick<Ctx, 'state' | 'remove'>,
  mon: Entity,
  to: LevelId,
  via?: MigrVia,
): void {
  // `if (In_W_tower(mx, my, &u.uz)) xyflags |= 2`: an arrival at random stays inside or outside
  const p = mon.c.pos;
  const inTower = !!p && inWTower(ctx.state, ctx.state.levels[p.level], p.x, p.y);
  const wt = trapTable(ctx, 'migrWTower', inTower);
  if (wt) {
    if (inTower) wt[String(mon.id)] = true;
    else delete wt[String(mon.id)];
  }
  setMtrapped(ctx, mon.id, false);
  wormMigrate(ctx, mon.id); // ref: migrate_to_level() -> mon_leave(): the tail is dropped
  delete mon.c.pos;
  const t = trapTable(ctx, 'migrating', true);
  if (t) t[String(mon.id)] = to;
  if (via) {
    const v = trapTable(ctx, 'migrVia', true);
    if (v) v[String(mon.id)] = via;
  } else {
    const v = trapTable(ctx, 'migrVia', false);
    if (v) delete v[String(mon.id)];
  }
}

/** How the migrating monster arrives (and forgets it, unless `keep`), or null for a random spot. */
export function takeMigrVia(ctx: Pick<Ctx, 'state'>, id: number, keep = false): MigrVia | null {
  const v = trapTable(ctx, 'migrVia', false);
  const via = v?.[String(id)];
  if (v && !keep) delete v[String(id)];
  return typeof via === 'string' && VIAS.includes(via) ? (via as MigrVia) : null;
}

/**
 * Whether the migrating monster left from inside the Wizard's Tower (and forgets it, unless
 * `keep`): C's `xyflags & 2`, for rloc_pos_ok().
 */
export function takeMigrWTower(ctx: Pick<Ctx, 'state'>, id: number, keep = false): boolean {
  const t = trapTable(ctx, 'migrWTower', false);
  const v = t?.[String(id)] === true;
  if (t && !keep) delete t[String(id)];
  return v;
}

/**
 * The stairs of `level` a monster arriving `via` comes out on, or null (none: it arrives at a
 * random spot). ref: src/dog.c mon_arrive() stairway_find_from(), stairway_find()
 */
export function arrivalStairs(level: Readonly<Level>, via: MigrVia): Pos | null {
  if (via === 'stairs_up') return level.up ?? null;
  if (via === 'stairs_down') return level.down ?? null;
  if (via === 'ladder_up') return findTerrain(level, T.ladder_up);
  if (via === 'ladder_down') return findTerrain(level, T.ladder_down);
  if (via === 'portal') {
    const t = findPortal(level);
    return t ? { x: t.x, y: t.y } : null;
  }
  return level.branch?.pos ?? null;
}
