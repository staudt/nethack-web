// Monsters that leave the map for another level and wait there until the hero arrives.
// ref: src/dog.c migrate_to_level() (MIGR_RANDOM, MIGR_STAIRS_UP/DOWN, MIGR_SSTAIRS)
import type { Ctx, Entity, Level, LevelId, Pos } from '@nh/core';
import { setMtrapped, trapTable } from './trapstate';
import { wormMigrate } from './wormstate';

/**
 * How a migrating monster arrives: on the up stairs (it went down them: C's MIGR_STAIRS_UP), on
 * the down stairs (MIGR_STAIRS_DOWN) or on the branch stairs (MIGR_SSTAIRS); none is MIGR_RANDOM.
 */
export type MigrVia = 'stairs_up' | 'stairs_down' | 'sstairs';

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

/** How the migrating monster arrives (and forgets it), or null for a random spot. */
export function takeMigrVia(ctx: Pick<Ctx, 'state'>, id: number): MigrVia | null {
  const v = trapTable(ctx, 'migrVia', false);
  const via = v?.[String(id)];
  if (v) delete v[String(id)];
  return via === 'stairs_up' || via === 'stairs_down' || via === 'sstairs' ? via : null;
}

/**
 * The stairs of `level` a monster arriving `via` comes out on, or null (none: it arrives at a
 * random spot). ref: src/dog.c mon_arrive() stairway_find_from(), stairway_find()
 */
export function arrivalStairs(level: Readonly<Level>, via: MigrVia): Pos | null {
  if (via === 'stairs_up') return level.up ?? null;
  if (via === 'stairs_down') return level.down ?? null;
  return level.branch?.pos ?? null;
}
