// Laying out a level from a LevelDef: the map init style, the map block and the other special-level
// fields, then the stairs the dungeon asks for. Content fills in `contents` afterwards (newLevel hook).
import type { Level } from '../types/level';
import type { DefId, Pos } from '../types/common';
import type {
  FeatureDef,
  LevelDef,
  LevelRect,
  RegionDef,
  StairPlace,
  TerrainEdit,
  TerrainSet,
} from '../types/mod';
import type { Rng } from '../types/rng';
import { DEFAULT_DUNGEON } from '../dungeon';
import {
  DOOR_KEYS,
  has,
  makeBuilder,
  MK_WALL,
  OBSTRUCTED_KEYS,
  SDOOR_KEYS,
  setFeature,
  WALL_KEYS,
  WALL_MK,
  type Builder,
  type Key,
} from './builder';
import { generateLevel, type GenOptions } from './generate';
import { MK, MK_DOOR, mkmap, wallifyKinds } from './mkmap';
import { litstateRnd } from './rooms';
import { placeRooms, roomStair } from './sprooms';
import {
  levelDefArea,
  levelDefPos,
  levelDefRect,
  MAP_LEGEND,
  mapBlock,
  type MapBlock,
} from './spdef';
import { CAVE_PALETTE_KEYS, PAL, PALETTE_KEYS } from './terrain';

/**
 * Builds a level from `def`. The `rooms` style is the ordinary generator; other styles lay out
 * the `init` map, then the map block, rooms and corridors, regions, edits, doors and features,
 * then put up stairs,
 * down stairs and branch stairs (as `opts` asks), then join inaccessible areas, set door
 * orientations and fix the walls. Cave (`mines`) levels have CAVE_PALETTE_KEYS after
 * PALETTE_KEYS in their palette; other terrains are appended as they are used.
 * ref: src/sp_lev.c splev_initlev(), lspo_map(), lspo_room(), lspo_random_corridors(),
 *   lspo_region(), lspo_terrain(), lspo_door(),
 *   lspo_feature(), lspo_stair(), lspo_finalize_level(); src/mkmaze.c fixup_special()
 *   place_lregion()
 * @throws RangeError for an empty map size, a `mines` map below MIN_MKMAP_WIDTH x
 *   MIN_MKMAP_HEIGHT, a map block that does not fit or a spot outside the level; Error when no
 *   spot is left for a staircase
 */
export function buildLevel(rng: Rng, opts: GenOptions, def: LevelDef): Level {
  if (def.init.style === 'rooms') return { ...generateLevel(rng, opts), def: def.id };
  const { width, height } = opts;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new RangeError(`buildLevel: bad size ${String(width)}x${String(height)}`);

  const init = def.init;
  const cave = init.style === 'mines';
  const palette = [...PALETTE_KEYS, ...(cave ? CAVE_PALETTE_KEYS : [])].map((k) => opts.terrain[k]);
  const pal = (id: DefId): number => {
    const i = palette.indexOf(id);
    return i === -1 ? palette.push(id) - 1 : i;
  };
  const fg = pal(init.fg);
  // ref: splev_initlev() LVLINIT_SOLIDFILL and LVLINIT_MINES: lit BOOL_RANDOM is rn2(2)
  const litOn = init.lit ?? rng.rn2(2) === 1;
  let cells: number[];
  let lit: (0 | 1)[];
  if (cave) {
    // ref: src/mkmap.c mkmap(); finish_map() lights fg cells and (when walled) walls
    const kinds = mkmap(rng, {
      width,
      height,
      smoothed: init.smoothed ?? false,
      joined: init.joined ?? false,
      walled: init.walled ?? false,
    });
    const toPal = caveKindPalette(pal(init.bg ?? opts.terrain.stone), fg);
    cells = kinds.map((k) => toPal[k] as number);
    lit = kinds.map((k) => (litOn && k !== MK.BG ? 1 : 0));
  } else {
    // ref: lvlfill_solid()
    cells = new Array<number>(width * height).fill(fg);
    lit = new Array<0 | 1>(width * height).fill(litOn ? 1 : 0);
  }
  const level: Level = {
    id: opts.id,
    depth: opts.depth,
    dungeon: opts.dungeon ?? DEFAULT_DUNGEON.id,
    dlevel: opts.dlevel ?? opts.depth,
    width,
    height,
    palette,
    cells,
    lit,
    rooms: [],
    up: null,
    down: null,
    branch: null,
    def: def.id,
    traps: [],
  };

  const special =
    def.map !== undefined ||
    def.rooms !== undefined ||
    def.corridors !== undefined ||
    def.regions !== undefined ||
    def.edits !== undefined ||
    def.doors !== undefined ||
    def.features !== undefined ||
    def.stairs !== undefined ||
    def.flags !== undefined;
  const b = makeBuilder(rng, level, def, opts);
  let stairRooms: { up?: number; down?: number } = {};
  if (special) {
    placeMap(b);
    stairRooms = placeRooms(b);
    for (const [i, r] of (def.regions ?? []).entries()) placeRegion(b, r, `regions[${i}]`);
    for (const [i, e] of (def.edits ?? []).entries()) applyEdit(b, e, `edits[${i}]`);
    placeDoors(b);
    for (const [i, f] of (def.features ?? []).entries()) placeFeature(b, f, `features[${i}]`);
  }

  // minefill.lua: des.stair("up") then des.stair("down"); the branch comes later (fixup_special)
  const floor = palette.indexOf(opts.terrain.floor);
  const corr = palette.indexOf(opts.terrain.corr);
  const good = (p: Pos): boolean => {
    const c = cells[p.y * width + p.x];
    return c === floor || c === corr;
  };
  const area = levelDefArea(def, width, height);
  if (opts.up ?? true) {
    level.up =
      stairRooms.up !== undefined
        ? roomStair(b, stairRooms.up, good)
        : placeStair(b, def.stairs?.up, area, good, 'stairs.up');
    cells[level.up.y * width + level.up.x] = PAL.stairs_up;
  }
  if (opts.down ?? true) {
    level.down =
      stairRooms.down !== undefined
        ? roomStair(b, stairRooms.down, good)
        : placeStair(b, def.stairs?.down, area, good, 'stairs.down');
    cells[level.down.y * width + level.down.x] = PAL.stairs_down;
  }
  if (opts.branch) {
    const whole = { x: 0, y: 0, w: width, h: height };
    const pos = randomSpot(rng, level, whole, good, 200);
    cells[pos.y * width + pos.x] = opts.branch.dir === 'up' ? PAL.stairs_up : PAL.stairs_down;
    level.branch = { pos, to: opts.branch.to, dir: opts.branch.dir };
  }

  if (special) {
    // ref: lspo_finalize_level(): link_doors_rooms(), ensure_way_out(), wallification()
    if (def.flags?.inaccessibles === true) ensureWayOut(b);
    orientDoors(b);
    wallification(b);
  }
  return level;
}

/** The map block's cells over the `init` map. ref: src/sp_lev.c lspo_map(), sel_set_ter() */
function placeMap(b: Builder): void {
  const { level, def } = b;
  const block = mapBlock(def, level.width, level.height);
  if (!block || !def.map) return;
  const lit = def.map.lit === true ? 1 : 0;
  for (let y = 0; y < block.h; y++) {
    const row = def.map.rows[y] ?? '';
    for (let x = 0; x < block.w; x++) {
      const k = MAP_LEGEND[row[x] ?? 'x'];
      if (k === null || k === undefined) continue; // 'x': see-through
      const i = (block.y + y) * level.width + block.x + x;
      b.put(i, k);
      level.lit[i] = lit;
    }
  }
}

/** Sets lit over x1..x2, y1..y2 clipped to the level. */
function lightArea(level: Level, r: LevelRect, on: boolean): void {
  const [x1, y1, x2, y2] = r;
  for (let x = Math.max(x1, 0); x <= Math.min(x2, level.width - 1); x++)
    for (let y = Math.max(y1, 0); y <= Math.min(y2, level.height - 1); y++)
      level.lit[y * level.width + x] = on ? 1 : 0;
}

/**
 * Untyped: lights the area and the cells around it, or darkens just the area (light_region()).
 * Typed: a wall-less Room, its bounds kept off the level edge, lit (with its edge) when lit
 * (add_room() with special = TRUE). ref: src/sp_lev.c lspo_region(), light_region();
 * src/mklev.c do_room_or_subroom()
 */
function placeRegion(b: Builder, r: RegionDef, what: string): void {
  const { level, def, rng } = b;
  const [x1, y1, x2, y2] = levelDefRect(def, level.width, level.height, r.area, r.coords, what);
  const lit = r.lit ?? litstateRnd(rng, level.depth);
  if (r.type === undefined) {
    lightArea(level, lit ? [x1 - 1, y1 - 1, x2 + 1, y2 + 1] : [x1, y1, x2, y2], lit);
    return;
  }
  // NetHack x is ours + 1, so its `if (!lowx) lowx++` never applies here
  const ly = y1 === 0 ? 1 : y1;
  const hx = x2 >= level.width - 1 ? level.width - 2 : x2;
  const hy = y2 >= level.height - 1 ? level.height - 2 : y2;
  if (lit) lightArea(level, [x1 - 1, ly - 1, hx + 1, hy + 1], true);
  level.rooms.push({ lx: x1, ly, hx, hy, lit, type: r.type, filled: r.filled ?? false });
}

/** Spots of one TerrainSet. ref: nhlsel.c l_selection_line(), l_selection_area(); selvar.c */
function editSpots(b: Builder, s: TerrainSet, what: string): Pos[] {
  const { level, def } = b;
  if (s.at) return [levelDefPos(def, level.width, level.height, s.at[0], s.at[1], s.coords, what)];
  const r = s.line ?? s.area;
  if (!r) return [];
  const [x1, y1, x2, y2] = levelDefRect(def, level.width, level.height, r, s.coords, what);
  if (s.area) {
    const out: Pos[] = [];
    for (let x = x1; x <= x2; x++) for (let y = y1; y <= y2; y++) out.push({ x, y });
    return out;
  }
  return selectionLine(x1, y1, x2, y2);
}

/** Bresenham's line from corner to corner. ref: src/selvar.c selection_do_line() */
function selectionLine(x1: number, y1: number, x2: number, y2: number): Pos[] {
  const xi = x1 < x2 ? 1 : -1;
  const dx = Math.abs(x2 - x1);
  const yi = y1 < y2 ? 1 : -1;
  const dy = Math.abs(y2 - y1);
  const out: Pos[] = [{ x: x1, y: y1 }];
  let x = x1;
  let y = y1;
  if (dx === 0 && dy === 0) return out;
  if (dx > dy) {
    const ai = (dy - dx) * 2;
    const bi = dy * 2;
    let d0 = bi - dx;
    do {
      if (d0 >= 0) {
        y += yi;
        d0 += ai;
      } else d0 += bi;
      x += xi;
      out.push({ x, y });
    } while (x !== x2);
  } else {
    const ai = (dx - dy) * 2;
    const bi = dx * 2;
    let d0 = bi - dy;
    do {
      if (d0 >= 0) {
        x += xi;
        d0 += ai;
      } else d0 += bi;
      y += yi;
      out.push({ x, y });
    } while (y !== y2);
  }
  return out;
}

/**
 * A `percent` roll (rn2(100) < percent, ref: nhlib.lua percent()), then `set` and `then`, or
 * `else`. Stairs are not overwritten; lighting is unchanged. ref: src/sp_lev.c lspo_terrain(),
 * sel_set_ter(); src/mkmaze.c set_levltyp() CAN_OVERWRITE_TERRAIN
 */
function applyEdit(b: Builder, e: TerrainEdit, what: string): void {
  if (e.percent !== undefined && b.rng.rn2(100) >= e.percent) {
    if (e.else) applyEdit(b, e.else, `${what}.else`);
    return;
  }
  for (const [i, s] of (e.set ?? []).entries()) {
    const k = MAP_LEGEND[s.char];
    if (k === null || k === undefined) continue;
    for (const p of editSpots(b, s, `${what}.set[${i}]`)) {
      const c = p.y * b.level.width + p.x;
      const old = b.key(c);
      if (old === 'stairs_up' || old === 'stairs_down') continue;
      b.put(c, k);
    }
  }
  if (e.then) applyEdit(b, e.then, `${what}.then`);
}

const RND_DOOR = ['nodoor', 'broken', 'open', 'closed', 'locked'] as const;

/**
 * Each door entry makes its spot a door (a secret door stays secret) with its state; `random`
 * is rnddoor(). Orientation is set at the end (orientDoors). ref: src/sp_lev.c lspo_door(),
 * sel_set_door(), rnddoor()
 */
function placeDoors(b: Builder): void {
  const { level, def, rng } = b;
  for (const [n, d] of (def.doors ?? []).entries()) {
    const p = levelDefPos(def, level.width, level.height, d.x, d.y, d.coords, `doors[${n}]`);
    const state = d.state === 'random' ? (RND_DOOR[rng.rn2(5)] as string) : d.state;
    const i = p.y * level.width + p.x;
    if (has(SDOOR_KEYS, b.key(i))) b.put(i, state === 'locked' ? 'sdoor_locked_v' : 'sdoor_v');
    else
      b.put(
        i,
        state === 'open'
          ? 'door_open_v'
          : state === 'closed'
            ? 'door_closed'
            : state === 'locked'
              ? 'door_locked'
              : 'doorway', // nodoor and broken
      );
  }
}

/** A `features` entry at its spot. */
function placeFeature(b: Builder, f: FeatureDef, what: string): void {
  const { level, def } = b;
  const p = levelDefPos(def, level.width, level.height, f.x, f.y, f.coords, what);
  setFeature(b, p.y * level.width + p.x, f);
}

/**
 * The stairs' spot: fixed (used as it is, ref: l_create_stairway()), in a region outside its
 * exclusion (ref: src/mkmaze.c place_lregion(), put_lregion_here(), bad_location()), or random
 * in `area` (the map block or the level).
 */
function placeStair(
  b: Builder,
  place: StairPlace | undefined,
  area: MapBlock,
  good: (p: Pos) => boolean,
  what: string,
): Pos {
  const { level, def, rng } = b;
  if (place === undefined) return randomSpot(rng, level, area, good, 100);
  if ('x' in place)
    return levelDefPos(def, level.width, level.height, place.x, place.y, place.coords, what);
  const [lx, ly, hx, hy] = levelDefRect(
    def,
    level.width,
    level.height,
    place.region,
    place.coords,
    `${what}.region`,
  );
  const ex = place.exclude
    ? levelDefRect(
        def,
        level.width,
        level.height,
        place.exclude,
        place.excludeCoords,
        `${what}.exclude`,
      )
    : null;
  const ok = (p: Pos): boolean =>
    good(p) && !(ex && p.x >= ex[0] && p.x <= ex[2] && p.y >= ex[1] && p.y <= ex[3]);
  for (let trycnt = 0; trycnt < 200; trycnt++) {
    const p = { x: rng.rn2(hx - lx + 1) + lx, y: rng.rn2(hy - ly + 1) + ly }; // rn1()
    if (ok(p)) return p;
  }
  for (let x = lx; x <= hx; x++) for (let y = ly; y <= hy; y++) if (ok({ x, y })) return { x, y };
  throw new Error(`buildLevel: no spot for ${what} in its region on '${level.id}'`);
}

/**
 * A random spot of `area` that passes `good`: `tries` random picks, then the first in column
 * order. Stairs go on floor or corridor (ref: src/sp_lev.c get_location() with good_stair_loc(),
 * 100 tries); branch stairs likewise (ref: src/mkmaze.c place_lregion(), 200 tries).
 */
function randomSpot(
  rng: Rng,
  level: Level,
  area: MapBlock,
  good: (p: Pos) => boolean,
  tries: number,
): Pos {
  for (let i = 0; i < tries; i++) {
    const p = { x: area.x + rng.rn2(area.w), y: area.y + rng.rn2(area.h) };
    if (good(p)) return p;
  }
  for (let x = area.x; x < area.x + area.w; x++)
    for (let y = area.y; y < area.y + area.h; y++) if (good({ x, y })) return { x, y };
  throw new Error(`buildLevel: no spot for stairs on '${level.id}'`);
}

/**
 * Joins every open area to the first staircase: flood from it (diagonals too, through secret
 * doors and corridors), and for each open cell not reached, in column order, turn a wall between
 * its area and a reached cell into a secret door, picking area cells at random. When no wall
 * qualifies, core (which makes no traps or objects) digs a corridor along a shortest path
 * instead of NetHack's hole, trapdoor or escape item. Runs after all stairs are placed.
 * ref: src/sp_lev.c ensure_way_out(), generate_way_out_method(),
 *   floodfillchk_match_accessible(); src/selvar.c selection_floodfill(), selection_rndcoord()
 */
function ensureWayOut(b: Builder): void {
  const { level, rng } = b;
  const { width: W, height: H } = level;
  const accessible = (i: number): boolean => !has(OBSTRUCTED_KEYS, b.key(i));
  const floodOk = (i: number): boolean => {
    const k = b.key(i);
    return accessible(i) || has(SDOOR_KEYS, k) || k === 'scorr';
  };
  const isWall = (i: number): boolean => has(WALL_KEYS, b.key(i));
  const flood = (sel: Uint8Array, start: number): void => {
    const stack = [start];
    sel[start] = 1;
    while (stack.length) {
      const c = stack.pop() as number;
      const x = c % W;
      const y = (c - x) / W;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (!sel[j] && floodOk(j)) {
            sel[j] = 1;
            stack.push(j);
          }
        }
    }
  };
  const ov = new Uint8Array(W * H);
  let reached = false;
  const seed = level.up ?? level.down ?? level.branch?.pos ?? null;
  if (seed) {
    flood(ov, seed.y * W + seed.x);
    reached = true;
  }
  for (;;) {
    let start = -1;
    scan: for (let x = 0; x < W; x++)
      for (let y = 0; y < H; y++)
        if (!ov[y * W + x] && accessible(y * W + x)) {
          start = y * W + x;
          break scan;
        }
    if (start === -1) return;
    if (reached) wayOut(start);
    flood(ov, start);
    reached = true;
  }

  function wayOut(start: number): void {
    const ov2 = new Uint8Array(W * H);
    flood(ov2, start);
    const ov3: number[] = [];
    for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (ov2[y * W + x]) ov3.push(y * W + x);
    const at = (x: number, y: number): number =>
      x < 0 || y < 0 || x >= W || y >= H ? -1 : y * W + x;
    while (ov3.length) {
      const c = ov3.splice(rng.rn2(ov3.length), 1)[0] as number;
      const x = c % W;
      const y = (c - x) / W;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const n1 = at(x + dx, y + dy);
        const n2 = at(x + 2 * dx, y + 2 * dy);
        if (n1 >= 0 && !ov[n1] && isWall(n1) && n2 >= 0 && ov[n2] && accessible(n2)) {
          b.put(n1, 'sdoor_v');
          return;
        }
      }
    }
    // dig: breadth-first from the area to the nearest reached cell
    const from = new Int32Array(W * H).fill(-2);
    const queue: number[] = [];
    for (let i = 0; i < W * H; i++)
      if (ov2[i]) {
        from[i] = -1;
        queue.push(i);
      }
    for (let q = 0; q < queue.length; q++) {
      const c = queue[q] as number;
      const x = c % W;
      const y = (c - x) / W;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const n = at(x + dx, y + dy);
        if (n < 0 || from[n] !== -2) continue;
        from[n] = c;
        if (ov[n]) {
          for (let p = c; !ov2[p]; p = from[p] as number)
            if (!accessible(p))
              b.put(p, has(WALL_KEYS, b.key(p)) || has(SDOOR_KEYS, b.key(p)) ? 'doorway' : 'corr');
          return;
        }
        queue.push(n);
      }
    }
  }
}

/** ref: src/sp_lev.c set_door_orientation() */
function horizontalDoor(b: Builder, x: number, y: number): boolean {
  const { width: W, height: H } = b.level;
  const ok = (xx: number, yy: number): boolean => xx >= 0 && yy >= 0 && xx < W && yy < H;
  const joins = (xx: number, yy: number): boolean => {
    const k = b.key(yy * W + xx);
    return has(WALL_KEYS, k) || has(DOOR_KEYS, k) || has(SDOOR_KEYS, k);
  };
  const side = (dx: number, dy: number): boolean => ok(x + dx, y + dy) && joins(x + dx, y + dy);
  let wleft = side(-1, 0);
  let wright = side(1, 0);
  let wup = side(0, -1);
  let wdown = side(0, 1);
  if (!wleft && !wright && !wup && !wdown) {
    // out of bounds counts as wall; IS_DOORJOIN() is IS_OBSTRUCTED() or iron bars
    const join = (dx: number, dy: number): boolean =>
      !ok(x + dx, y + dy) || has(OBSTRUCTED_KEYS, b.key((y + dy) * W + x + dx));
    wleft = join(-1, 0);
    wright = join(1, 0);
    wup = join(0, -1);
    wdown = join(0, 1);
  }
  return (wleft || wright) && !(wup && wdown);
}

/** Open and secret doors face their walls. ref: src/sp_lev.c link_doors_rooms() */
function orientDoors(b: Builder): void {
  const { width: W, height: H } = b.level;
  const pairs: [Key, Key][] = [
    ['door_open_v', 'door_open_h'],
    ['sdoor_v', 'sdoor_h'],
    ['sdoor_locked_v', 'sdoor_locked_h'],
  ];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const k = b.key(i);
      const pair = pairs.find((p) => p[0] === k || p[1] === k);
      if (pair) b.put(i, horizontalDoor(b, x, y) ? pair[1] : pair[0]);
    }
}

/** Walls of the whole level made to join up. ref: src/mkmaze.c wallification() */
function wallification(b: Builder): void {
  const { level } = b;
  const kinds = level.cells.map((_, i) => {
    const k = b.key(i);
    if (k === 'stone') return MK.BG;
    if (k !== undefined && WALL_MK[k] !== undefined) return WALL_MK[k];
    return has(DOOR_KEYS, k) || has(SDOOR_KEYS, k) ? MK_DOOR : MK.FG;
  });
  const fixed = wallifyKinds(level.width, level.height, kinds);
  for (let i = 0; i < fixed.length; i++) {
    const k = fixed[i] as number;
    if (k === kinds[i]) continue;
    b.put(i, k === MK.BG ? 'stone' : (MK_WALL[k] as Key));
  }
}

/** Palette index for each MK cell kind of a cave map, given the bg and fg indices. */
function caveKindPalette(bg: number, fg: number): number[] {
  const out: number[] = [];
  out[MK.BG] = bg;
  out[MK.FG] = fg;
  out[MK.VWALL] = PAL.vwall;
  out[MK.HWALL] = PAL.hwall;
  out[MK.TLCORN] = PAL.tlcorn;
  out[MK.TRCORN] = PAL.trcorn;
  out[MK.BLCORN] = PAL.blcorn;
  out[MK.BRCORN] = PAL.brcorn;
  out[MK.CRWALL] = PAL.crwall;
  out[MK.TUWALL] = PAL.tuwall;
  out[MK.TDWALL] = PAL.tdwall;
  out[MK.TLWALL] = PAL.tlwall;
  out[MK.TRWALL] = PAL.trwall;
  return out;
}
