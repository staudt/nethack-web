// The maze levels below Medusa: NetHack's own filler maze (`nh:mazefill`, makemaz("")) and what
// populate_maze() puts in it; fill_empty_maze() for a stocked des.mazewalk.
// ref: src/mkmaze.c makemaz(), populate_maze(), mazexy(); src/sp_lev.c fill_empty_maze(),
// maze1xy()
import type { Ctx, Level, LevelDef, Pos } from '@nh/core';
import { levelDefPos, mapBlock, mazeMax, mazexy, trapAt, VANILLA_TERRAIN } from '@nh/core';
import { BOULDER, boulderAt } from './boulder';
import { makemon } from './generation';
import { mkgold } from './items';
import { mktrap, rndtrap } from './mklev';
import { mkobjAt, mksobjFull } from './mkobj';
import { dry, type SpLevFixup } from './sp_lev';
import { TRAP, isHole, isPit, maketrap } from './trap';
import { pickVibrasquareLocation } from './invocation';
import { invocationLev } from './levelflags';
import { T, setTerrain } from './terrain';

const MINOTAUR = 'nh:minotaur';

/**
 * makemaz("")'s maze: core's `maze` init with `filler` (a corridor maze 1 time in 3, random or
 * one-wide corridors and walls, stairs on random maze spots), stocked by its fixup.
 * ref: src/mkmaze.c makemaz() with an empty protofile
 */
export const MAZEFILL: LevelDef = { id: 'nh:mazefill', init: { style: 'maze', filler: true } };

/**
 * Objects, boulders, minotaurs, monsters, gold and traps at random maze spots (mazexy()):
 * 11..18 objects (gems half the time), 2..11 boulders, 0..2 minotaurs, 7..11 random monsters,
 * 7..12 piles of gold and 7..12 traps. ref: src/mkmaze.c populate_maze()
 */
export function populateMaze(ctx: Ctx, level: Level): void {
  const rng = ctx.rng;
  const spot = (): { level: string; x: number; y: number } | null => {
    const p = mazexy(rng, level, VANILLA_TERRAIN);
    return p && { level: level.id, x: p.x, y: p.y };
  };
  const gen = { level: level.id, inMklev: true };
  for (let i = rng.rn2(8) + 11; i; i--) {
    const at = spot();
    const cls = rng.rn2(2) ? 'gem' : 'random';
    if (at) mkobjAt(ctx, cls, at, true);
  }
  for (let i = rng.rn2(10) + 2; i; i--) {
    const at = spot();
    if (at) mksobjFull(ctx, ctx.defs.object(BOULDER), { at }, gen);
  }
  for (let i = rng.rn2(3); i; i--) {
    const at = spot();
    if (at) makemon(ctx, ctx.defs.monster(MINOTAUR), at, gen);
  }
  for (let i = rng.rn2(5) + 7; i; i--) {
    const at = spot();
    if (at) makemon(ctx, null, at, gen);
  }
  for (let i = rng.rn2(6) + 7; i; i--) {
    const at = spot();
    if (at) mkgold(ctx, 0, at);
  }
  for (let i = rng.rn2(6) + 7; i; i--) mktrap(ctx, level, 'maze');
}

/**
 * The invocation level (Gehennom's last but one) of a makemaz("") maze: no down stairs (core put
 * them: they are lifted back to the maze's floor) and the vibrating square instead.
 * ref: src/mkmaze.c makemaz() `if (!Invocation_lev(&u.uz)) ... else { pick_vibrasquare_location();
 * maketrap(..., VIBRATING_SQUARE); }`
 */
function invocationSquare(ctx: Ctx, level: Level): void {
  const down = level.down;
  if (down) {
    setTerrain(level, down.x, down.y, level.corrmaze === true ? T.corr : T.floor);
    level.down = null;
  }
  const p = pickVibrasquareLocation(ctx, level);
  maketrap(ctx, level.id, p.x, p.y, TRAP.vibrating, { inMklev: true });
}

/**
 * `nh:mazefill`'s fixup: on the invocation level the vibrating square for the down stairs, then
 * populate_maze() once core has made the maze and its stairs.
 */
export const MAZEFILL_FIXUP: SpLevFixup = {
  after(ctx, level) {
    if (invocationLev(ctx.state, level)) invocationSquare(ctx, level);
    populateMaze(ctx, level);
  },
};

/**
 * The cells a special level's own map set (SpLev_Map): its map block but the see-through 'x'
 * cells, and its doors. Stairs are core's and not counted. ref: src/sp_lev.c lspo_map(),
 * sel_set_door()
 */
function spLevMap(level: Level, def: LevelDef): Set<number> {
  const out = new Set<number>();
  const block = mapBlock(def, level.width, level.height);
  if (block && def.map)
    for (let y = 0; y < block.h; y++)
      for (let x = 0; x < block.w; x++)
        if ((def.map.rows[y]?.[x] ?? 'x') !== 'x')
          out.add((block.y + y) * level.width + block.x + x);
  for (const d of def.doors ?? []) {
    const p = levelDefPos(def, level.width, level.height, d.x, d.y, d.coords, 'doors');
    out.add(p.y * level.width + p.x);
  }
  return out;
}

/**
 * A random DRY spot on odd NetHack coordinates outside the special level's own map: `rn1(x_maze_max
 * - 3, 3)`, `rn1(y_maze_max - 3, 3)` up to 2000 times, then the last one tried whatever it is.
 * ref: src/sp_lev.c maze1xy()
 */
function maze1xy(ctx: Ctx, level: Level, map: ReadonlySet<number>): Pos {
  const max = mazeMax(level.width, level.height);
  let tryct = 2000;
  let x: number;
  let y: number;
  do {
    x = ctx.rng.rn2(max.x - 3) + 3;
    y = ctx.rng.rn2(max.y - 3) + 3;
    if (--tryct < 0) break;
  } while (
    !(x % 2) ||
    !(y % 2) ||
    map.has(y * level.width + x - 1) ||
    !dry(ctx, level, { x: x - 1, y })
  );
  return { x: x - 1, y };
}

/**
 * Stocks the maze around a special level's map in proportion to its size: when more than a
 * tenth of half the maze area lies outside the map (`mapfact` percent of that half), up to
 * 20 * mapfact / 100 objects (gems half the time), 12 * mapfact / 100 boulders (none on a pit
 * or hole), a minotaur half the time, 12 * mapfact / 100 random monsters, fewer than
 * 15 * mapfact / 100 piles of gold and as many random special-level traps (no pit or hole on a
 * boulder), each on a maze1xy() spot. ref: src/sp_lev.c fill_empty_maze()
 */
export function fillEmptyMaze(ctx: Ctx, level: Level, def: LevelDef): void {
  const rng = ctx.rng;
  const max = mazeMax(level.width, level.height);
  const map = spLevMap(level, def);
  let mapcount = (max.x - 2) * (max.y - 2);
  const mapcountmax = Math.trunc(mapcount / 2);
  for (let x = 2; x < max.x; x++)
    for (let y = 0; y < max.y; y++) if (map.has(y * level.width + x - 1)) mapcount--;
  if (mapcount <= Math.trunc(mapcountmax / 10)) return;
  const mapfact = Math.trunc((mapcount * 100) / mapcountmax);
  const gen = { level: level.id, inMklev: true };
  const here = (p: Pos): { level: string; x: number; y: number } => ({ level: level.id, ...p });
  for (let x = rng.rnd(Math.trunc((20 * mapfact) / 100)); x; x--) {
    const p = maze1xy(ctx, level, map);
    mkobjAt(ctx, rng.rn2(2) ? 'gem' : 'random', here(p), true);
  }
  for (let x = rng.rnd(Math.trunc((12 * mapfact) / 100)); x; x--) {
    const p = maze1xy(ctx, level, map);
    const t = trapAt(level, p.x, p.y);
    if (t && (isPit(t.def) || isHole(t.def))) continue;
    mksobjFull(ctx, ctx.defs.object(BOULDER), { at: here(p) }, gen);
  }
  for (let x = rng.rn2(2); x; x--)
    makemon(ctx, ctx.defs.monster(MINOTAUR), maze1xy(ctx, level, map), gen);
  for (let x = rng.rnd(Math.trunc((12 * mapfact) / 100)); x; x--)
    makemon(ctx, null, maze1xy(ctx, level, map), gen);
  for (let x = rng.rn2(Math.trunc((15 * mapfact) / 100)); x; x--)
    mkgold(ctx, 0, here(maze1xy(ctx, level, map)));
  for (let x = rng.rn2(Math.trunc((15 * mapfact) / 100)); x; x--) {
    const p = maze1xy(ctx, level, map);
    let trytrap = rndtrap(ctx, level);
    if (boulderAt(ctx, level.id, p.x, p.y))
      while (isPit(trytrap) || isHole(trytrap)) trytrap = rndtrap(ctx, level);
    maketrap(ctx, level.id, p.x, p.y, trytrap, { inMklev: true });
  }
}
