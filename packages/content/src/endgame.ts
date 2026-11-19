// Entering the endgame: climbing out of DL1 (the up stairs or a cursed potion of gain level)
// with the Amulet of Yendor takes the hero to the Plane of Earth instead of out of the dungeon,
// and only with the Amulet: a hero without it cannot reach the Planes. Arrivals on the Planes
// (the stairs, the portals between them) land on a random spot of the level's teleport region
// for the way she came, never on a portal (they have none back). A leaf (core and level flags),
// so the stairs, the potion and the portals can use it.
// ref: src/do.c goto_level() ("must have the Amulet", the endgame's u_on_rndspot());
// src/dungeon.c prev_level(); src/dog.c mon_arrive() (MIGR_PORTAL in the endgame)
import {
  levelDefRect,
  type Ctx,
  type DefId,
  type GameState,
  type Level,
  type LevelRect,
  type LevelRef,
} from '@nh/core';
import { PLANES, PLANE_LEVELS, inEndgame } from './levelflags';
import { uHave } from './uhave';

/** The Plane of Earth, the endgame's first level. ref: earth_level */
export function earthLevel(state: Readonly<GameState>): LevelRef | null {
  const d = state.dungeons.find((x) => x.id === PLANES);
  const sp = d?.special.find((s) => s.id === PLANE_LEVELS.earth);
  return d && sp ? { dungeon: d.id, dlevel: sp.dlevel } : null;
}

/**
 * Whether a level change to `to` is refused: the first endgame level needs the Amulet of
 * Yendor ("must have the Amulet": goto_level() returns before anything happens).
 * ref: src/do.c goto_level() `if (newdungeon) { if (In_endgame(newlevel)) { if
 * (!u.uhave.amulet) return;`
 */
export function endgameRefused(state: Readonly<GameState>, to: LevelRef): boolean {
  return inEndgame(state, to) && !inEndgame(state) && !uHave(state, 'amulet');
}

/**
 * prev_level() from DL1 with the Amulet: goto_level(&earth_level), at a random spot of Earth's
 * teleport region (u_on_rndspot(): there are no stairs). False when there is no endgame to go to
 * (a dungeon without the Planes, or no Amulet): the caller escapes the dungeon instead.
 * ref: src/dungeon.c prev_level(); src/do.c goto_level()
 */
export function enterEndgame(ctx: Ctx): boolean {
  const earth = earthLevel(ctx.state);
  if (!earth || endgameRefused(ctx.state, earth)) return false;
  ctx.goToLevel(earth, 'random');
  return true;
}

/**
 * The area a monster coming through a portal onto an endgame level arrives in: the level's
 * teleport region for arrivals from below (C's `updest`, "the current endgame levels always build
 * upwards"), or the whole level without one. ref: src/dog.c mon_arrive() MIGR_PORTAL
 */
export function endgameUpdest(ctx: Pick<Ctx, 'defs'>, level: Readonly<Level>): LevelRect {
  const whole: LevelRect = [0, 0, level.width - 1, level.height - 1];
  if (level.def === undefined) return whole;
  const def = ctx.defs.level(level.def);
  let region: NonNullable<typeof def.teleportRegions>[number] | undefined;
  for (const r of def.teleportRegions ?? []) if (r.dir === undefined || r.dir === 'up') region = r;
  if (!region) return whole;
  return levelDefRect(def, level.width, level.height, region.area, region.coords, 'updest');
}

/**
 * The des.message() lines each plane says on the hero's first arrival, by LevelDef id (Water's
 * waits for its bubbles: m23 step 10). ref: dat/earth.lua, air.lua; src/do.c goto_level()
 * deliver_splev_message()
 */
export const PLANE_MESSAGES: Readonly<Record<DefId, readonly string[]>> = {
  [PLANE_LEVELS.earth]: ['planes.earth_1', 'planes.earth_2', 'planes.earth_3'],
  [PLANE_LEVELS.air]: ['planes.air_1', 'planes.air_2'],
};
