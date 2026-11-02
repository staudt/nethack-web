// Laying out a level from a LevelDef: the map init style, then the stairs the dungeon asks for.
// Content fills in `contents` afterwards (newLevel hook).
import type { Level } from '../types/level';
import type { Pos } from '../types/common';
import type { LevelDef } from '../types/mod';
import type { Rng } from '../types/rng';
import { DEFAULT_DUNGEON } from '../dungeon';
import { generateLevel, type GenOptions } from './generate';
import { PAL, PALETTE_KEYS } from './terrain';

/**
 * Builds a level from `def`. The `rooms` style is the ordinary generator; other styles lay out
 * the map, then put up stairs, down stairs and branch stairs (as `opts` asks) on random spots.
 * ref: src/sp_lev.c splev_initlev(), lspo_stair(); src/mkmaze.c fixup_special() place_lregion()
 * @throws RangeError for an empty map size; Error when no spot is left for a staircase
 */
export function buildLevel(rng: Rng, opts: GenOptions, def: LevelDef): Level {
  if (def.init.style === 'rooms') return { ...generateLevel(rng, opts), def: def.id };
  const { width, height } = opts;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new RangeError(`buildLevel: bad size ${String(width)}x${String(height)}`);

  // ref: splev_initlev() LVLINIT_SOLIDFILL: lit BOOL_RANDOM is rn2(2); lvlfill_solid()
  const palette = PALETTE_KEYS.map((k) => opts.terrain[k]);
  let fg = palette.indexOf(def.init.fg);
  if (fg === -1) fg = palette.push(def.init.fg) - 1;
  const lit = (def.init.lit ?? rng.rn2(2) === 1) ? 1 : 0;
  const cells = new Array<number>(width * height).fill(fg);
  const level: Level = {
    id: opts.id,
    depth: opts.depth,
    dungeon: opts.dungeon ?? DEFAULT_DUNGEON.id,
    dlevel: opts.dlevel ?? opts.depth,
    width,
    height,
    palette,
    cells,
    lit: new Array<0 | 1>(width * height).fill(lit),
    rooms: [],
    up: null,
    down: null,
    branch: null,
    def: def.id,
    traps: [],
  };

  // minefill.lua: des.stair("up") then des.stair("down"); the branch comes later (fixup_special)
  const floor = palette.indexOf(opts.terrain.floor);
  const corr = palette.indexOf(opts.terrain.corr);
  const good = (p: Pos): boolean => {
    const c = cells[p.y * width + p.x];
    return c === floor || c === corr;
  };
  if (opts.up ?? true) {
    level.up = randomSpot(rng, level, good, 100);
    cells[level.up.y * width + level.up.x] = PAL.stairs_up;
  }
  if (opts.down ?? true) {
    level.down = randomSpot(rng, level, good, 100);
    cells[level.down.y * width + level.down.x] = PAL.stairs_down;
  }
  if (opts.branch) {
    const pos = randomSpot(rng, level, good, 200);
    cells[pos.y * width + pos.x] = opts.branch.dir === 'up' ? PAL.stairs_up : PAL.stairs_down;
    level.branch = { pos, to: opts.branch.to, dir: opts.branch.dir };
  }
  return level;
}

/**
 * A random spot that passes `good`: `tries` random picks, then the first in column order.
 * Stairs go on floor or corridor (ref: src/sp_lev.c get_location() with good_stair_loc(), 100
 * tries); branch stairs likewise (ref: src/mkmaze.c place_lregion(), 200 tries).
 */
function randomSpot(rng: Rng, level: Level, good: (p: Pos) => boolean, tries: number): Pos {
  for (let i = 0; i < tries; i++) {
    const p = { x: rng.rn2(level.width), y: rng.rn2(level.height) };
    if (good(p)) return p;
  }
  for (let x = 0; x < level.width; x++)
    for (let y = 0; y < level.height; y++) if (good({ x, y })) return { x, y };
  throw new Error(`buildLevel: no spot for stairs on '${level.id}'`);
}
