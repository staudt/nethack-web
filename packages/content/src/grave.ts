// Graves: the grave terrain with its headstone, and disturbing it.
// ref: src/engrave.c make_grave(), disturb_grave()
//
// A leaf over engr.ts, rumors.ts and the terrain (plus makemon() for the ghoul), so level
// creation (mklev.ts, zoo.ts's morgues, special levels), the `E` command and the wizard terrain
// wish all make graves the same way. A grave's `disturbed` bit (C's `levl[x][y].disturbed`, which
// overlays the location's flags) is content state: `modData.nh.graves[levelId]` lists the cell
// indices of the disturbed graves, sorted.
// Not ported: buried objects and corpses (no burial), the bell, digging graves up (ROADMAP),
// exercise(A_WIS, FALSE) on disturbing one (no exercise).
import { cellIndex, getLevel, trapAt, type Ctx, type Json, type Level } from '@nh/core';
import { delEngrAt, makeEngrAt } from './engr';
import { makemon } from './generation';
import { getRndText } from './rumors';
import { T, setTerrain, terrainIdAt } from './terrain';

/** ref: include/rm.h IS_GRAVE() */
export const isGrave = (level: Readonly<Level>, x: number, y: number): boolean =>
  terrainIdAt(level, x, y) === T.grave;

/**
 * Makes a grave at (x, y) of a floor or grave square without a trap, with a headstone reading
 * `str` (null: a random epitaph), finished at turn 0; any engraving there is replaced. Nothing
 * happens elsewhere. True when the square is a grave afterwards. ref: src/engrave.c make_grave()
 */
export function makeGrave(
  ctx: Pick<Ctx, 'state' | 'rng'>,
  level: Level,
  x: number,
  y: number,
  str: string | null,
): boolean {
  const typ = terrainIdAt(level, x, y);
  // Can we put a grave here?
  if ((typ !== T.floor && typ !== T.grave) || trapAt(level, x, y)) return false;
  // Make the grave
  setTerrain(level, x, y, T.grave);
  // Engrave the headstone
  delEngrAt(ctx, level, x, y);
  makeEngrAt(ctx, level, x, y, str ?? getRndText(ctx, 'epitaph'), null, 0, 'headstone');
  return true;
}

type GraveTable = Record<string, number[]>;

function graveTable(state: Ctx['state'], create: boolean): GraveTable | null {
  const md = state.modData;
  const nh = md['nh'] as Record<string, Json> | undefined;
  const t = nh?.['graves'];
  if (t && typeof t === 'object' && !Array.isArray(t)) return t as unknown as GraveTable;
  if (!create) return null;
  const d = (md['nh'] ??= {}) as Record<string, Json>;
  const fresh: GraveTable = {};
  d['graves'] = fresh as unknown as Json;
  return fresh;
}

/** Whether the grave at (x, y) was disturbed. ref: include/rm.h `levl[x][y].disturbed` */
export function graveDisturbed(
  ctx: Pick<Ctx, 'state'>,
  level: Readonly<Level>,
  x: number,
  y: number,
): boolean {
  return graveTable(ctx.state, false)?.[level.id]?.includes(cellIndex(level, x, y)) === true;
}

/** Sets or clears the grave's `disturbed` bit (it goes with the grave when the terrain changes). */
export function setGraveDisturbed(
  ctx: Pick<Ctx, 'state'>,
  level: Readonly<Level>,
  x: number,
  y: number,
  on: boolean,
): void {
  const i = cellIndex(level, x, y);
  const t = graveTable(ctx.state, on);
  if (!t) return;
  const cells = (t[level.id] ?? []).filter((c) => c !== i);
  if (on) cells.push(i);
  cells.sort((a, b) => a - b);
  if (cells.length) t[level.id] = cells;
  else delete t[level.id];
  if (Object.keys(t).length === 0)
    delete (ctx.state.modData['nh'] as Record<string, Json>)['graves'];
}

/**
 * Engraving on (or kicking) a grave the first time: "You disturb the undead!" and a ghoul comes
 * out of it (next to the hero when she stands on it); it happens once per grave.
 * ref: src/engrave.c disturb_grave()
 */
export function disturbGrave(ctx: Ctx, x: number, y: number): void {
  const level = getLevel(ctx.state);
  if (!isGrave(level, x, y) || graveDisturbed(ctx, level, x, y)) return; // impossible()
  ctx.emit({ type: 'msg', key: 'engr.disturb_undead' });
  setGraveDisturbed(ctx, level, x, y, true);
  makemon(ctx, ctx.defs.monster('nh:ghoul'), { x, y }, { level: level.id, adjacentOk: true });
  // exercise(A_WIS, FALSE): no exercise
}
