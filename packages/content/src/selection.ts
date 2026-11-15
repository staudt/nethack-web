// Selections of level cells, as the special-level scripts use them: one flag per cell, walked
// column by column (NetHack's selection_iterate() order) wherever the order draws random numbers.
// A leaf over core and terrain.ts: bigroom.ts, helltweaks.ts and hellfill.ts use it.
// ref: src/selvar.c; src/nhlsel.c; src/sp_lev.c mapfrag_match(), match_maptyps(),
// lspo_replace_terrain(), lspo_terrain(), set_levltyp(); dat/nhlib.lua percent()
//
// A selection never goes into the game state. NetHack's selections also cover column 0, which
// is off the map (this port's Level x is NetHack's x - 1); here they cover only the level's cells.
import type { Ctx, DefId, Level, Pos, Rng } from '@nh/core';
import { cellIndex, MAP_LEGEND, VANILLA_TERRAIN } from '@nh/core';
import { isStwallId, setTerrain, T, terrainIdAt } from './terrain';

/** One flag per cell of a level, in `cellIndex()` order. */
export type Sel = boolean[];

/** ref: dat/nhlib.lua percent(): `math.random(0, 99) < n` */
export const percent = (ctx: Pick<Ctx, 'rng'>, n: number): boolean => ctx.rng.rn2(100) < n;

/** One of `list`: nhlua `list[math.random(1, #list)]` (1 + rn2(n)). */
export const pick = <V>(ctx: Pick<Ctx, 'rng'>, list: readonly V[]): V =>
  list[ctx.rng.rn2(list.length)] as V;

/** The terrain a map character makes (des.terrain(), des.map()). */
export function ter(ch: string): DefId {
  const k = MAP_LEGEND[ch];
  if (k === null || k === undefined) throw new Error(`selection: no terrain for '${ch}'`);
  return VANILLA_TERRAIN[k];
}

/** selection.new(): nothing selected. */
export const selNew = (level: Readonly<Level>): Sel =>
  new Array<boolean>(level.cells.length).fill(false);

/** Calls `fn` for every cell, columns then rows (selection_iterate()). */
export function eachCell(
  level: Readonly<Level>,
  fn: (x: number, y: number, i: number) => void,
): void {
  for (let x = 0; x < level.width; x++)
    for (let y = 0; y < level.height; y++) fn(x, y, cellIndex(level, x, y));
}

/** Calls `fn` for every selected cell, columns then rows. ref: src/selvar.c selection_iterate() */
export function eachSel(
  level: Readonly<Level>,
  sel: Sel,
  fn: (x: number, y: number, i: number) => void,
): void {
  eachCell(level, (x, y, i) => {
    if (sel[i] === true) fn(x, y, i);
  });
}

/** sel:numpoints() */
export const selCount = (sel: Sel): number => sel.reduce((n, v) => (v ? n + 1 : n), 0);

/** `a | b` */
export const selOr = (a: Sel, b: Sel): Sel => a.map((v, i) => v || b[i] === true);

/** `a & b` */
export const selAnd = (a: Sel, b: Sel): Sel => a.map((v, i) => v && b[i] === true);

/** sel:negate(). ref: src/selvar.c selection_not() */
export const selNegate = (sel: Sel): Sel => sel.map((v) => !v);

/** The cells that pass `fn`. */
export function selWhere(level: Readonly<Level>, fn: (x: number, y: number) => boolean): Sel {
  const sel = selNew(level);
  eachCell(level, (x, y, i) => {
    if (fn(x, y)) sel[i] = true;
  });
  return sel;
}

const onLevel = (level: Readonly<Level>, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < level.width && y < level.height;

/**
 * selection.area() / selection.fillrect(): the rectangle, corners included, cut at the level.
 * ref: src/nhlsel.c l_selection_fillrect()
 */
export function selArea(
  level: Readonly<Level>,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): Sel {
  const sel = selNew(level);
  for (let x = Math.max(x1, 0); x <= Math.min(x2, level.width - 1); x++)
    for (let y = Math.max(y1, 0); y <= Math.min(y2, level.height - 1); y++)
      sel[cellIndex(level, x, y)] = true;
  return sel;
}

/** selection.rect(): the rectangle's outline. ref: src/nhlsel.c l_selection_rect() */
export function selRect(
  level: Readonly<Level>,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): Sel {
  return [
    selArea(level, x1, y1, x2, y1),
    selArea(level, x1, y2, x2, y2),
    selArea(level, x1, y1, x1, y2),
    selArea(level, x2, y1, x2, y2),
  ].reduce(selOr);
}

/**
 * sel:bounds(): the smallest rectangle round the selected cells, or the whole level when nothing
 * is selected. ref: src/selvar.c selection_getbounds()
 */
export function selBounds(
  level: Readonly<Level>,
  sel: Sel,
): { lx: number; ly: number; hx: number; hy: number } {
  let lx = level.width;
  let ly = level.height;
  let hx = -1;
  let hy = -1;
  eachSel(level, sel, (x, y) => {
    lx = Math.min(lx, x);
    ly = Math.min(ly, y);
    hx = Math.max(hx, x);
    hy = Math.max(hy, y);
  });
  if (hx < 0) return { lx: 0, ly: 0, hx: level.width - 1, hy: level.height - 1 };
  return { lx, ly, hx, hy };
}

/**
 * Whether the cell's terrain matches map character `ch` of a map fragment: `w` any wall or stone
 * (IS_STWALL()), `x` anything, else exactly that terrain. ref: src/sp_lev.c match_maptyps()
 */
function matchChar(id: DefId | undefined, ch: string): boolean {
  if (ch === 'x') return true;
  if (ch === 'w') return isStwallId(id);
  return id === ter(ch);
}

/** The rows of a map fragment ("." or ".\nw\n."). */
const fragRows = (pattern: string): string[] => pattern.split('\n');

/**
 * Whether the map fragment centred on (x, y) matches the level (off the level counts as stone).
 * ref: src/sp_lev.c mapfrag_match()
 */
export function mapfragMatch(
  level: Readonly<Level>,
  rows: readonly string[],
  x: number,
  y: number,
): boolean {
  const hei = rows.length;
  const wid = rows[0]?.length ?? 0;
  for (let rx = -(wid >> 1); rx <= wid >> 1; rx++)
    for (let ry = -(hei >> 1); ry <= hei >> 1; ry++) {
      const ch = rows[ry + (hei >> 1)]?.[rx + (wid >> 1)] ?? 'x';
      const id = onLevel(level, x + rx, y + ry) ? terrainIdAt(level, x + rx, y + ry) : T.stone;
      if (!matchChar(id, ch)) return false;
    }
  return true;
}

/**
 * selection.match(fragment): every cell where the map fragment (odd width and height, rows split
 * by "\n") centred on it matches. ref: src/nhlsel.c l_selection_match()
 */
export function selMatch(level: Readonly<Level>, pattern: string): Sel {
  const rows = fragRows(pattern);
  return selWhere(level, (x, y) => mapfragMatch(level, rows, x, y));
}

/**
 * sel:percentage(n): each selected cell kept when `rn2(100) < n`, columns then rows.
 * ref: src/selvar.c selection_filter_percent()
 */
export function selPercentage(rng: Rng, level: Readonly<Level>, sel: Sel, n: number): Sel {
  const out = selNew(level);
  eachSel(level, sel, (_x, _y, i) => {
    if (rng.rn2(100) < n) out[i] = true;
  });
  return out;
}

/**
 * sel:filter_mapchar(ch): the selected cells of that terrain. ref: src/selvar.c
 * selection_filter_mapchar() (no `lit` filter)
 */
export function selFilterMapchar(level: Readonly<Level>, sel: Sel, ch: string): Sel {
  const out = selNew(level);
  eachSel(level, sel, (x, y, i) => {
    if (matchChar(terrainIdAt(level, x, y), ch)) out[i] = true;
  });
  return out;
}

export type GrowDir = 'all' | 'random' | 'north' | 'west' | 'east' | 'south';

const W_NORTH = 1;
const W_SOUTH = 2;
const W_EAST = 4;
const W_WEST = 8;
const GROW: Readonly<Record<Exclude<GrowDir, 'random'>, number>> = {
  all: W_NORTH | W_SOUTH | W_EAST | W_WEST,
  north: W_NORTH,
  south: W_SOUTH,
  east: W_EAST,
  west: W_WEST,
};

/**
 * sel:grow(dir): the cells plus those next to them that way (`all`: all eight neighbours; `west`
 * adds the cell west of each, and so on; `random` one of the four, `rn2(4)`).
 * ref: src/selvar.c selection_do_grow(); src/sp_lev.c random_wdir()
 */
export function selGrow(level: Readonly<Level>, sel: Sel, dir: GrowDir = 'all', rng?: Rng): Sel {
  let d: number;
  if (dir === 'random') {
    if (!rng) throw new Error('selGrow: a random direction needs the rng');
    d = [W_NORTH, W_SOUTH, W_EAST, W_WEST][rng.rn2(4)] as number;
  } else d = GROW[dir];
  const has = (x: number, y: number): boolean =>
    onLevel(level, x, y) && sel[cellIndex(level, x, y)] === true;
  const out = [...sel];
  eachCell(level, (x, y, i) => {
    if (
      (d & W_WEST && has(x + 1, y)) ||
      ((d & (W_WEST | W_NORTH)) === (W_WEST | W_NORTH) && has(x + 1, y + 1)) ||
      (d & W_NORTH && has(x, y + 1)) ||
      ((d & (W_NORTH | W_EAST)) === (W_NORTH | W_EAST) && has(x - 1, y + 1)) ||
      (d & W_EAST && has(x - 1, y)) ||
      ((d & (W_EAST | W_SOUTH)) === (W_EAST | W_SOUTH) && has(x - 1, y - 1)) ||
      (d & W_SOUTH && has(x, y - 1)) ||
      ((d & (W_SOUTH | W_WEST)) === (W_SOUTH | W_WEST) && has(x + 1, y - 1))
    )
      out[i] = true;
  });
  return out;
}

/**
 * selection.randline(sel, x1, y1, x2, y2, rough): `sel` plus a wobbly line between the two spots,
 * by recursive midpoints moved up to `rough` (shrinking by a third each step, 12 levels deep).
 * ref: src/selvar.c selection_do_randline(); src/nhlsel.c l_selection_randline()
 */
export function selRandline(
  rng: Rng,
  level: Readonly<Level>,
  sel: Sel,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rough: number,
): Sel {
  const out = [...sel];
  const set = (x: number, y: number): void => {
    if (onLevel(level, x, y)) out[cellIndex(level, x, y)] = true;
  };
  const line = (ax: number, ay: number, bx: number, by: number, r: number, rec: number): void => {
    if (rec < 1 || (bx === ax && by === ay)) return;
    const span = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    if (r > span) r = span;
    let mx: number;
    let my: number;
    if (r < 2) {
      mx = Math.trunc((ax + bx) / 2);
      my = Math.trunc((ay + by) / 2);
    } else {
      do {
        const dx = rng.rn2(r) - Math.trunc(r / 2);
        const dy = rng.rn2(r) - Math.trunc(r / 2);
        mx = Math.trunc((ax + bx) / 2) + dx;
        my = Math.trunc((ay + by) / 2) + dy;
      } while (!onLevel(level, mx, my));
    }
    set(mx, my);
    r = Math.trunc((r * 2) / 3);
    line(ax, ay, mx, my, r, rec - 1);
    line(mx, my, bx, by, r, rec - 1);
    set(bx, by);
  };
  line(x1, y1, x2, y2, rough, 12);
  return out;
}

/**
 * selection.rndcoord(sel): one of the selected cells (`rn2(count)`, counted columns then rows), or
 * null when there is none. ref: src/selvar.c selection_rndcoord()
 */
export function selRndcoord(rng: Rng, level: Readonly<Level>, sel: Sel): Pos | null {
  const n = selCount(sel);
  if (n === 0) return null;
  let c = rng.rn2(n);
  let out: Pos | null = null;
  eachSel(level, sel, (x, y) => {
    if (c-- === 0) out = { x, y };
  });
  return out;
}

/**
 * sel:set() with no spot: a random cell of the level (get_location() with ANY_LOC: `rn2` of the
 * width, then of the height) is added. ref: src/nhlsel.c l_selection_setpoint()
 */
export function selSetRandom(rng: Rng, level: Readonly<Level>, sel: Sel): Sel {
  const out = [...sel];
  const x = rng.rn2(level.width);
  const y = rng.rn2(level.height);
  out[cellIndex(level, x, y)] = true;
  return out;
}

/** Stairs keep their place (CAN_OVERWRITE_TERRAIN()). ref: src/mkmaze.c set_levltyp() */
const keeps = (id: DefId | undefined): boolean => id === T.stairs_up || id === T.stairs_down;

/** Lava and walls of lava (IS_LAVA()). */
const isLavaId = (id: DefId): boolean => id === T.lava || id === T.lavawall;

/**
 * Options of a terrain change: `lit` sets the cell's light (0 or 1); `litLava` lights cells made
 * lava as set_levltyp() does.
 */
export interface SetTerOpts {
  lit?: 0 | 1;
  litLava?: boolean;
}

/** One cell becomes terrain `id`. ref: src/mkmaze.c set_levltyp_lit() */
export function setTer(level: Level, x: number, y: number, id: DefId, opts: SetTerOpts = {}): void {
  if (keeps(terrainIdAt(level, x, y))) return;
  setTerrain(level, x, y, id);
  const i = cellIndex(level, x, y);
  if (opts.litLava === true && isLavaId(id)) level.lit[i] = 1;
  else if (opts.lit !== undefined) level.lit[i] = opts.lit;
}

/**
 * des.terrain(sel, ch): every selected cell becomes that terrain, columns then rows.
 * ref: src/sp_lev.c lspo_terrain(), sel_set_ter()
 */
export function setSel(level: Level, sel: Sel, ch: string, opts: SetTerOpts = {}): void {
  const id = ter(ch);
  eachSel(level, sel, (x, y) => setTer(level, x, y, id, opts));
}

/**
 * des.replace_terrain({ fromterrain, toterrain, chance }) over `sel` (null: the whole level): each
 * cell of terrain `from` (`w`: any wall or stone) draws `rn2(100)` and becomes `to` below
 * `chance`, columns then rows. ref: src/sp_lev.c lspo_replace_terrain()
 */
export function replaceTerrain(
  ctx: Pick<Ctx, 'rng'>,
  level: Level,
  sel: Sel | null,
  from: string,
  to: string,
  chance = 100,
  opts: SetTerOpts = {},
): void {
  const t = ter(to);
  eachCell(level, (x, y, i) => {
    if (sel && sel[i] !== true) return;
    if (matchChar(terrainIdAt(level, x, y), from) && ctx.rng.rn2(100) < chance)
      setTer(level, x, y, t, opts);
  });
}

/**
 * des.replace_terrain({ mapfragment, toterrain, chance }) over `sel` (null: the whole level): each
 * cell where the fragment matches the level as it is by then draws `rn2(100)` and becomes `to`
 * below `chance`, columns then rows. ref: src/sp_lev.c lspo_replace_terrain()
 */
export function replaceMapfrag(
  ctx: Pick<Ctx, 'rng'>,
  level: Level,
  sel: Sel | null,
  pattern: string,
  to: string,
  chance = 100,
  opts: SetTerOpts = {},
): void {
  const rows = fragRows(pattern);
  const t = ter(to);
  eachCell(level, (x, y, i) => {
    if (sel && sel[i] !== true) return;
    if (mapfragMatch(level, rows, x, y) && ctx.rng.rn2(100) < chance) setTer(level, x, y, t, opts);
  });
}
