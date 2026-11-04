// Monsters that leave the map for another level and wait there until the hero arrives.
// ref: src/dog.c migrate_to_level() (MIGR_RANDOM)
import type { Ctx, Entity, LevelId } from '@nh/core';
import { setMtrapped, trapTable } from './trapstate';

/**
 * The monster leaves the map until the hero gets to level `to` (which may not exist yet); then
 * it comes out at a random spot (trap.ts monArrivals). ref: src/dog.c migrate_to_level()
 */
export function migrateToLevel(ctx: Pick<Ctx, 'state'>, mon: Entity, to: LevelId): void {
  setMtrapped(ctx, mon.id, false);
  delete mon.c.pos;
  const t = trapTable(ctx, 'migrating', true);
  if (t) t[String(mon.id)] = to;
}
