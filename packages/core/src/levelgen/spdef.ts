// LevelDef map blocks and coordinates: the legend, where a block goes, resolving an entry's
// coordinates, and the shape checks loadMods runs on the special-level fields.
// ref: src/sp_lev.c lspo_map(), get_location(); src/nhlua.c splev_chr2typ()
import type { Pos } from '../types/common';
import type { LevelCoords, LevelDef, LevelMap, LevelRect } from '../types/mod';
import type { LevelTerrain } from './terrain';

/**
 * Map characters and the terrain each makes; 'x' (null) keeps what is there.
 * ref: src/nhlua.c char2typ[] (the subset with terrain here)
 */
export const MAP_LEGEND: Readonly<Record<string, keyof LevelTerrain | null>> = {
  ' ': 'stone',
  '.': 'floor',
  '#': 'corr',
  '-': 'hwall',
  '|': 'vwall',
  '+': 'doorway',
  S: 'sdoor_v',
  H: 'scorr',
  '{': 'fountain',
  K: 'sink',
  T: 'tree',
  x: null,
};

const LEGEND_TEXT = "' ' . # - | + S H { K T x";

/** A placed map block, in Level coordinates. */
export interface MapBlock {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where `def.map` goes on a width x height level, or null without one. NetHack coordinates
 * inside (x one more than ours, COLNO = width + 1): aligns from x_maze_max/y_maze_max with an odd
 * start, then lspo_map()'s `ystart ± 2` retry. Unlike C, which clips a block at the right edge,
 * an aligned block that fits the level is moved inside it whole.
 * ref: src/sp_lev.c lspo_map(); src/decl.c x_maze_max, y_maze_max
 * @throws RangeError when the block is bigger than the level or does not fit at its `x`,`y`
 */
export function mapBlock(def: LevelDef, width: number, height: number): MapBlock | null {
  const map = def.map;
  if (!map) return null;
  const w = map.rows[0]?.length ?? 0;
  const h = map.rows.length;
  if (w > width || h > height)
    throw new RangeError(
      `LevelDef '${def.id}': the ${String(w)}x${String(h)} map does not fit the ` +
        `${String(width)}x${String(height)} level`,
    );
  if (map.x !== undefined && map.y !== undefined) {
    if (map.x + w > width || map.y + h > height)
      throw new RangeError(
        `LevelDef '${def.id}': the ${String(w)}x${String(h)} map at ${String(map.x)},` +
          `${String(map.y)} does not fit the ${String(width)}x${String(height)} level`,
      );
    return { x: map.x, y: map.y, w, h };
  }
  const COLNO = width + 1;
  const ROWNO = height;
  const xMazeMax = (COLNO - 1) & ~1;
  const yMazeMax = (ROWNO - 1) & ~1;
  const div = (a: number, b: number): number => Math.trunc(a / b);
  let xstart: number;
  switch (map.halign ?? 'center') {
    case 'left':
      xstart = 1; // splev_init_present: every LevelDef has an init
      break;
    case 'half-left':
      xstart = 2 + div(xMazeMax - 2 - w, 4);
      break;
    case 'center':
      xstart = 2 + div(xMazeMax - 2 - w, 2);
      break;
    case 'half-right':
      xstart = 2 + div((xMazeMax - 2 - w) * 3, 4);
      break;
    case 'right':
      xstart = xMazeMax - w - 1;
      break;
  }
  let ystart: number;
  switch (map.valign ?? 'center') {
    case 'top':
      ystart = 3;
      break;
    case 'center':
      ystart = 2 + div(yMazeMax - 2 - h, 2);
      break;
    case 'bottom':
      ystart = yMazeMax - h - 1;
      break;
  }
  if (xstart % 2 === 0) xstart++;
  if (ystart % 2 === 0) ystart++;
  if (ystart < 0 || ystart + h > ROWNO) {
    // try to move the start a bit
    ystart += ystart > 0 ? -2 : 2;
    if (h === ROWNO) ystart = 0;
    if (ystart < 0 || ystart + h > ROWNO) ystart = 0;
  }
  if (xstart + w > COLNO) xstart = COLNO - w;
  if (xstart < 1) xstart = 1;
  return { x: xstart - 1, y: ystart, w, h };
}

/** The area random spots come from: the map block, else the whole level. ref: get_location() */
export function levelDefArea(def: LevelDef, width: number, height: number): MapBlock {
  return mapBlock(def, width, height) ?? { x: 0, y: 0, w: width, h: height };
}

/** An entry's origin: 'map' when the LevelDef has a map block, unless it says otherwise. */
const coordsOf = (def: LevelDef, coords: LevelCoords | undefined): LevelCoords =>
  coords ?? (def.map ? 'map' : 'level');

/**
 * The Level position of an entry's `x`,`y`: relative to the map block (`coords` 'map', the
 * default with a block), or Level coordinates where a negative value counts from the far edge.
 * ref: src/sp_lev.c get_location() `*x += mx` for normal locations
 * @throws RangeError naming the LevelDef and `what` for a spot outside the level
 */
export function levelDefPos(
  def: LevelDef,
  width: number,
  height: number,
  x: number,
  y: number,
  coords: LevelCoords | undefined,
  what: string,
): Pos {
  let p: Pos;
  if (coordsOf(def, coords) === 'map') {
    const b = mapBlock(def, width, height) ?? { x: 0, y: 0 };
    p = { x: b.x + x, y: b.y + y };
  } else p = { x: x < 0 ? width + x : x, y: y < 0 ? height + y : y };
  if (p.x < 0 || p.y < 0 || p.x >= width || p.y >= height)
    throw new RangeError(
      `LevelDef '${def.id}': ${what} at ${String(x)},${String(y)} is outside the ` +
        `${String(width)}x${String(height)} level`,
    );
  return p;
}

/** Both corners of `r` through levelDefPos. @throws RangeError as levelDefPos, or x1 > x2 */
export function levelDefRect(
  def: LevelDef,
  width: number,
  height: number,
  r: LevelRect,
  coords: LevelCoords | undefined,
  what: string,
): LevelRect {
  const a = levelDefPos(def, width, height, r[0], r[1], coords, what);
  const b = levelDefPos(def, width, height, r[2], r[3], coords, what);
  if (a.x > b.x || a.y > b.y)
    throw new RangeError(`LevelDef '${def.id}': ${what} [${r.join(', ')}] is upside down`);
  return [a.x, a.y, b.x, b.y];
}

// ---------------------------------------------------------------------------------------------
// Shape checks (loadMods). Data may come from anywhere, so nothing is assumed about types.

type Issues = [string, string][];
type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);
const H_ALIGNS = ['left', 'half-left', 'center', 'half-right', 'right'];
const V_ALIGNS = ['top', 'center', 'bottom'];
const DOOR_STATES = ['open', 'closed', 'locked', 'nodoor', 'broken', 'random'];
const FEATURE_KINDS = ['fountain', 'sink', 'tree', 'altar'];
const ALIGNS = ['lawful', 'neutral', 'chaotic', 'noalign', 'random'];

/** Map block size from data that may be malformed; null when there is no usable block. */
function blockSize(map: unknown): { w: number; h: number } | null {
  if (!isObj(map) || !Array.isArray(map.rows) || map.rows.length === 0) return null;
  const first: unknown = map.rows[0];
  return typeof first === 'string' && first.length > 0
    ? { w: first.length, h: map.rows.length }
    : null;
}

function mapIssues(map: unknown, out: Issues): void {
  if (!isObj(map)) return void out.push(['map', 'must be an object']);
  const { rows, halign, valign, x, y, lit } = map as Partial<Record<keyof LevelMap, unknown>>;
  if (!Array.isArray(rows) || rows.length === 0)
    out.push(['map.rows', 'must be a non-empty array of strings']);
  else {
    const w = typeof rows[0] === 'string' ? rows[0].length : 0;
    rows.forEach((row: unknown, i) => {
      if (typeof row !== 'string' || row.length === 0)
        return void out.push([`map.rows[${i}]`, 'must be a non-empty string']);
      if (row.length !== w)
        out.push([`map.rows[${i}]`, `is ${row.length} wide; every row must be ${w} wide`]);
      const bad = [...row].findIndex((ch) => !Object.hasOwn(MAP_LEGEND, ch));
      if (bad !== -1)
        out.push([
          `map.rows[${i}]`,
          `unknown map character '${[...row][bad] ?? ''}' at column ${bad} (use ${LEGEND_TEXT})`,
        ]);
    });
  }
  if (halign !== undefined && !H_ALIGNS.includes(halign as string))
    out.push(['map.halign', `must be one of ${H_ALIGNS.join(', ')}`]);
  if (valign !== undefined && !V_ALIGNS.includes(valign as string))
    out.push(['map.valign', `must be one of ${V_ALIGNS.join(', ')}`]);
  if ((x === undefined) !== (y === undefined))
    out.push([`map.${x === undefined ? 'x' : 'y'}`, 'give both x and y, or neither']);
  for (const [k, v] of [
    ['x', x],
    ['y', y],
  ] as const)
    if (v !== undefined && (!isInt(v) || v < 0))
      out.push([`map.${k}`, 'must be an integer >= 0 (Level coordinates of the top-left)']);
  if (x !== undefined && (halign !== undefined || valign !== undefined))
    out.push(['map.x', 'give x,y or halign/valign, not both']);
  if (lit !== undefined && typeof lit !== 'boolean') out.push(['map.lit', 'must be a boolean']);
}

/** Checks one coordinate pair at `path` against its origin. */
function posIssues(
  path: string,
  x: unknown,
  y: unknown,
  coords: unknown,
  block: { w: number; h: number } | null,
  hasMap: boolean,
  out: Issues,
): void {
  if (!isInt(x) || !isInt(y)) return void out.push([path, 'needs integer x and y']);
  if ((coords ?? (hasMap ? 'map' : 'level')) !== 'map') return;
  if (block && (x < 0 || y < 0 || x >= block.w || y >= block.h))
    out.push([
      path,
      `${x},${y} is outside the ${block.w}x${block.h} map (map coordinates run from 0,0; ` +
        "use coords: 'level' for Level coordinates)",
    ]);
}

function coordsIssues(
  path: string,
  coords: unknown,
  hasMap: boolean,
  out: Issues,
  key = 'coords',
): void {
  if (coords === undefined) return;
  if (coords !== 'map' && coords !== 'level')
    out.push([`${path}.${key}`, "must be 'map' or 'level'"]);
  else if (coords === 'map' && !hasMap)
    out.push([`${path}.${key}`, "'map' needs a map block in the LevelDef"]);
}

function rectIssues(
  path: string,
  r: unknown,
  coords: unknown,
  block: { w: number; h: number } | null,
  hasMap: boolean,
  out: Issues,
): void {
  if (!Array.isArray(r) || r.length !== 4 || !r.every(isInt))
    return void out.push([path, 'must be [x1, y1, x2, y2] integers']);
  const [x1, y1, x2, y2] = r as number[] as LevelRect;
  const n = out.length;
  posIssues(path, x1, y1, coords, block, hasMap, out);
  if (out.length === n) posIssues(path, x2, y2, coords, block, hasMap, out);
  const sameSign = (a: number, b: number): boolean => a < 0 === b < 0;
  if (out.length === n && ((sameSign(x1, x2) && x1 > x2) || (sameSign(y1, y2) && y1 > y2)))
    out.push([path, 'x1,y1 must be the top-left corner and x2,y2 the bottom-right']);
}

function editIssues(
  path: string,
  e: unknown,
  block: { w: number; h: number } | null,
  hasMap: boolean,
  out: Issues,
): void {
  if (!isObj(e)) return void out.push([path, 'must be an object']);
  const { percent, set, then, else: other } = e;
  if (percent !== undefined && (!isInt(percent) || percent < 0 || percent > 100))
    out.push([`${path}.percent`, 'must be an integer 0..100']);
  if (set !== undefined) {
    if (!Array.isArray(set)) out.push([`${path}.set`, 'must be an array']);
    else
      set.forEach((s: unknown, i) => {
        const at = `${path}.set[${i}]`;
        if (!isObj(s)) return void out.push([at, 'must be an object']);
        if (typeof s.char !== 'string' || !Object.hasOwn(MAP_LEGEND, s.char) || s.char === 'x')
          out.push([`${at}.char`, `must be one map character (${LEGEND_TEXT.slice(0, -2)})`]);
        coordsIssues(at, s.coords, hasMap, out);
        const given = (['at', 'line', 'area'] as const).filter((k) => s[k] !== undefined);
        if (given.length !== 1) out.push([at, 'give exactly one of at, line, area']);
        if (s.at !== undefined) {
          const p: unknown = s.at;
          if (!Array.isArray(p) || p.length !== 2) out.push([`${at}.at`, 'must be [x, y]']);
          else posIssues(`${at}.at`, p[0], p[1], s.coords, block, hasMap, out);
        }
        for (const k of ['line', 'area'] as const)
          if (s[k] !== undefined) rectIssues(`${at}.${k}`, s[k], s.coords, block, hasMap, out);
      });
  }
  if (then !== undefined) editIssues(`${path}.then`, then, block, hasMap, out);
  if (other !== undefined) {
    if (percent === undefined) out.push([`${path}.else`, 'needs a percent']);
    editIssues(`${path}.else`, other, block, hasMap, out);
  }
}

function arrayOf(d: Obj, key: string, out: Issues, each: (v: Obj, path: string) => void): void {
  const list = d[key];
  if (list === undefined) return;
  if (!Array.isArray(list)) return void out.push([key, 'must be an array']);
  list.forEach((v: unknown, i) => {
    const path = `${key}[${i}]`;
    if (!isObj(v)) out.push([path, 'must be an object']);
    else each(v, path);
  });
}

/**
 * Shape problems of a LevelDef's map block, regions, edits, doors, features, stairs and flags,
 * and of the `coords` of its contents, as [path, reason].
 */
export function specialLevelIssues(def: LevelDef): Issues {
  const out: Issues = [];
  const d = def as unknown as Obj;
  const hasMap = d.map !== undefined;
  if (hasMap) mapIssues(d.map, out);
  const block = blockSize(d.map);

  arrayOf(d, 'regions', out, (r, path) => {
    coordsIssues(path, r.coords, hasMap, out);
    rectIssues(`${path}.area`, r.area, r.coords, block, hasMap, out);
    if (r.lit !== undefined && typeof r.lit !== 'boolean')
      out.push([`${path}.lit`, 'must be a boolean']);
    if (r.type !== undefined && (typeof r.type !== 'string' || r.type === ''))
      out.push([`${path}.type`, 'must be a room type id']);
    if (r.filled !== undefined && typeof r.filled !== 'boolean')
      out.push([`${path}.filled`, 'must be a boolean']);
    else if (r.filled !== undefined && r.type === undefined)
      out.push([`${path}.filled`, 'only a typed region (a room) can be filled']);
  });
  const edits = d.edits;
  if (edits !== undefined) {
    if (!Array.isArray(edits)) out.push(['edits', 'must be an array']);
    else edits.forEach((e: unknown, i) => editIssues(`edits[${i}]`, e, block, hasMap, out));
  }
  arrayOf(d, 'doors', out, (o, path) => {
    coordsIssues(path, o.coords, hasMap, out);
    posIssues(path, o.x, o.y, o.coords, block, hasMap, out);
    if (!DOOR_STATES.includes(o.state as string))
      out.push([`${path}.state`, `must be one of ${DOOR_STATES.join(', ')}`]);
  });
  arrayOf(d, 'features', out, (f, path) => {
    coordsIssues(path, f.coords, hasMap, out);
    posIssues(path, f.x, f.y, f.coords, block, hasMap, out);
    if (!FEATURE_KINDS.includes(f.kind as string))
      out.push([`${path}.kind`, `must be one of ${FEATURE_KINDS.join(', ')}`]);
    if (f.align !== undefined && !ALIGNS.includes(f.align as string))
      out.push([`${path}.align`, `must be one of ${ALIGNS.join(', ')}`]);
    if (f.shrine !== undefined && typeof f.shrine !== 'boolean')
      out.push([`${path}.shrine`, 'must be a boolean']);
    if ((f.align !== undefined || f.shrine !== undefined) && f.kind !== 'altar')
      out.push([path, 'only an altar has align and shrine']);
  });
  if (d.stairs !== undefined) {
    if (!isObj(d.stairs)) out.push(['stairs', 'must be an object']);
    else
      for (const dir of ['up', 'down'] as const) {
        const s = d.stairs[dir];
        const path = `stairs.${dir}`;
        if (s === undefined) continue;
        if (!isObj(s)) {
          out.push([path, 'must be an object']);
          continue;
        }
        coordsIssues(path, s.coords, hasMap, out);
        if (s.region !== undefined) {
          if (s.x !== undefined || s.y !== undefined)
            out.push([path, 'give x,y or region, not both']);
          rectIssues(`${path}.region`, s.region, s.coords, block, hasMap, out);
          if (s.exclude !== undefined) {
            coordsIssues(path, s.excludeCoords, hasMap, out, 'excludeCoords');
            rectIssues(`${path}.exclude`, s.exclude, s.excludeCoords, block, hasMap, out);
          }
        } else posIssues(path, s.x, s.y, s.coords, block, hasMap, out);
      }
  }
  if (d.flags !== undefined) {
    if (!isObj(d.flags)) out.push(['flags', 'must be an object']);
    else if (d.flags.inaccessibles !== undefined && typeof d.flags.inaccessibles !== 'boolean')
      out.push(['flags.inaccessibles', 'must be a boolean']);
  }
  if (Array.isArray(d.contents))
    d.contents.forEach((c: unknown, i) => {
      if (!isObj(c)) return;
      const path = `contents[${i}]`;
      coordsIssues(path, c.coords, hasMap, out);
      if (isInt(c.x) && isInt(c.y)) posIssues(path, c.x, c.y, c.coords, block, hasMap, out);
    });
  return out;
}
