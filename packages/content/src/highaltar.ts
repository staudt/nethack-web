// High altars (C's AM_SANCTUM): the Sanctum's altar of Moloch and the Astral Plane's three. A
// content table by LevelDef id of map-relative spots (des.altar({ type = "sanctum" })), like
// LADDER_SPOTS and PORTAL_SPOTS: nothing is saved, the flag follows from `Level.def`. A high
// altar is also a shrine (core `Level.shrines`, C's AM_SHRINE | AM_SANCTUM); its alignment is the
// terrain's, as for every altar. Its temple's priest is a high priest (priest.ts priestini()).
// ref: src/sp_lev.c create_altar() (`a->shrine == 2`); include/rm.h AM_SANCTUM
import { levelDefArea, type Ctx, type DefId, type Level } from '@nh/core';
import { altarAlign } from './aligntyp';
import { terrainIdAt } from './terrain';

/**
 * The high altars' map-relative spots, by LevelDef id. ref: dat/sanctum.lua, dat/astral.lua
 * des.altar({ type = "sanctum" })
 */
export const HIGH_ALTARS: Readonly<Record<DefId, readonly (readonly [number, number])[]>> = {
  'nh:sanctum': [[18, 8]],
  'nh:plane-astral': [
    [7, 9],
    [37, 5],
    [67, 9],
  ],
};

/** Whether (x, y) of `level` is a high altar (an altar on one of its LevelDef's spots). */
export function isHighAltar(
  ctx: Pick<Ctx, 'defs'>,
  level: Readonly<Level>,
  x: number,
  y: number,
): boolean {
  const def = level.def;
  if (def === undefined || !Object.hasOwn(HIGH_ALTARS, def)) return false;
  const id = terrainIdAt(level, x, y);
  if (id === undefined || altarAlign(id) === null) return false;
  const a = levelDefArea(ctx.defs.level(def), level.width, level.height);
  return (HIGH_ALTARS[def] ?? []).some(([mx, my]) => a.x + mx === x && a.y + my === y);
}
