// Gehennom's filler level: one of seven kinds of level (lava caves, a maze with hell's tweaks,
// three maze styles with lava, iron bars or walls of lava, a cold maze with ice and water, an open
// cavern), sometimes with prefabs (open areas, moated drawbridge forts, a temple of Moloch, a caged
// or moated monster, lava or water pools, open strips), then its stairs (the vibrating square on
// the invocation level) and populatemaze()'s things.
// ref: dat/hellfill.lua; dat/nhlib.lua hell_tweaks() (helltweaks.ts); src/sp_lev.c
// splev_initlev(), lspo_map(), lspo_stair(), lspo_region(), create_altar(), lspo_finalize_level(),
// map_cleanup(); src/mkmaze.c create_maze(); src/sp_lev.c lvlfill_maze_grid(); src/mkmap.c mkmap()
//
// Translation notes (DEVIATIONS.md "Dungeon bottom"): the LevelDef is unlit stone with fixed
// placeholder stairs, which the fixup lifts at once; the script then runs in its order through
// core's exported builders (createMaze(), mazeGrid(), mkmap()) and the selection helpers, and the
// fixup puts the stairs where the script does. The level's own random flags (cold, a cavernous
// map, a prefab's non-diggable walls) are content state (levelflags.ts MadeLevelFlags). Not kept:
// the prefabs' des.exclusion() teleport zones (core has no per-level ones), the hellobjects(),
// hellmonsters() and helltraps() helpers (the script never calls them).
import type { Ctx, DefId, Level, LevelContent, LevelDef, MapBlock, Pos } from '@nh/core';
import {
  cellIndex,
  createMaze,
  itemsAt,
  mazeGrid,
  mkmap,
  MK,
  MZ_OPEN,
  MZ_WALL,
  trapAt,
  VANILLA_TERRAIN,
  wallifyLevel,
} from '@nh/core';
import { BOULDER } from './boulder';
import { createDrawbridge } from './dbridge';
import type { DbDir } from './dbstate';
import { delEngrAt } from './engr';
import { TEMPLE } from './epri';
import { hellTweaks } from './helltweaks';
import { pickVibrasquareLocation } from './invocation';
import { invocationLev, madeLevelFlags, setMadeLevelFlags } from './levelflags';
import { isPoolOrLava } from './liquid';
import { mazewalk } from './mazewalk';
import { priestini } from './priest';
import {
  pick,
  percent,
  replaceMapfrag,
  replaceTerrain,
  selArea,
  selBounds,
  selFilterMapchar,
  selGrow,
  selMatch,
  selNegate,
  selPercentage,
  selRect,
  selWhere,
  setSel,
  eachSel,
  type Sel,
} from './selection';
import { createMonster, desGold, desMap, makeContents, shuffle, type SpLevFixup } from './sp_lev';
import { T, setTerrain, terrainIdAt } from './terrain';
import { TRAP, maketrap } from './trap';

/**
 * hellfill: unlit stone (des.level_init solidfill " ", lit 0) whose fixup lays out the level;
 * core's stairs go on fixed placeholder spots the fixup lifts first.
 */
export const HELLFILL: LevelDef = {
  id: 'nh:hellfill',
  init: { style: 'solidfill', fg: 'nh:stone', lit: false },
  stairs: { up: { x: 0, y: 0 }, down: { x: 1, y: 0 }, branch: { x: 2, y: 0 } },
};

/** Lava as set_levltyp() makes it: lit. */
const LAVA_LIT = { litLava: true } as const;

/** The cells of `kinds` (one per cell, in cellIndex() order) laid on the level. */
function layKinds(level: Level, kinds: readonly number[], terrain: (k: number) => DefId): void {
  for (let y = 0; y < level.height; y++)
    for (let x = 0; x < level.width; x++)
      setTerrain(level, x, y, terrain(kinds[cellIndex(level, x, y)] ?? 0));
}

/** A mines-style cave map's kinds as terrain: `bg`, floor and the wall shapes. */
function caveTerrain(bg: DefId): (k: number) => DefId {
  const walls: Record<number, DefId> = {
    [MK.VWALL]: T.vwall,
    [MK.HWALL]: T.hwall,
    [MK.TLCORN]: T.tlcorn,
    [MK.TRCORN]: T.trcorn,
    [MK.BLCORN]: T.blcorn,
    [MK.BRCORN]: T.brcorn,
    [MK.CRWALL]: T.crwall,
    [MK.TUWALL]: T.tuwall,
    [MK.TDWALL]: T.tdwall,
    [MK.TLWALL]: T.tlwall,
    [MK.TRWALL]: T.trwall,
  };
  return (k) => (k === MK.BG ? bg : k === MK.FG ? T.floor : (walls[k] ?? T.stone));
}

/**
 * des.level_init({ style = "mines", fg = ".", bg, smoothed, joined, lit = 0, walled }); a walled,
 * joined map makes the level cavernous rather than a maze. ref: src/sp_lev.c splev_initlev()
 * LVLINIT_MINES; src/mkmap.c mkmap()
 */
function minesInit(ctx: Ctx, level: Level, bg: DefId, walled: boolean): void {
  const kinds = mkmap(ctx.rng, {
    width: level.width,
    height: level.height,
    smoothed: true,
    joined: true,
    walled,
  });
  layKinds(level, kinds, caveTerrain(bg));
  if (walled) setMadeLevelFlags(ctx, level.id, { maze: false, cavernous: true });
}

/**
 * des.level_init({ style = "maze", wallthick, corrwid }) (dead ends kept): create_maze() with
 * horizontal walls and floor corridors, as the walls are joined at the end.
 * ref: src/sp_lev.c splev_initlev() LVLINIT_MAZE; src/mkmaze.c create_maze()
 */
function mazeInit(ctx: Ctx, level: Level, wallthick: number, corrwid?: number): void {
  const kinds = createMaze(ctx.rng, level.width, level.height, {
    ...(corrwid !== undefined ? { corrwid } : {}),
    wallthick,
    rmDeadends: false,
    corrmaze: false,
  });
  layKinds(level, kinds, (k) => (k === MZ_WALL ? T.hwall : k === MZ_OPEN ? T.floor : T.stone));
}

// ---------------------------------------------------------------------------------------------
// The prefabs. ref: dat/hellfill.lua hell_prefabs, rnd_halign(), rnd_valign()

const rndHalign = (ctx: Ctx): 'half-left' | 'center' | 'half-right' =>
  pick(ctx, ['half-left', 'center', 'half-right'] as const);
const rndValign = (ctx: Ctx): 'top' | 'center' | 'bottom' =>
  pick(ctx, ['top', 'center', 'bottom'] as const);

const OPEN_16: readonly string[] = Array.from({ length: 16 }, () => '......');
const ROUND: readonly string[] = [
  'xxxxxx.....xxxxxx',
  'xxxx.........xxxx',
  'xx.............xx',
  'xx.............xx',
  'x...............x',
  'x...............x',
  '.................',
  '.................',
  '.................',
  '.................',
  '.................',
  'x...............x',
  'x...............x',
  'xx.............xx',
  'xx.............xx',
  'xxxx.........xxxx',
  'xxxxxx.....xxxxxx',
];
const FORT: readonly string[] = [
  'xxxxxx.xxxxxx',
  'xLLLLLLLLLLLx',
  'xL---------Lx',
  'xL|.......|Lx',
  'xL|.......|Lx',
  '.L|.......|L.',
  'xL|.......|Lx',
  'xL|.......|Lx',
  'xL---------Lx',
  'xLLLLLLLLLLLx',
  'xxxxxx.xxxxxx',
];
const WIDE: readonly string[] = Array.from({ length: 5 }, () => '.'.repeat(62));
const LIT_SQUARE: readonly string[] = [
  'x.....x',
  '.......',
  '.......',
  '.......',
  '.......',
  '.......',
  'x.....x',
];
const SHRINE: readonly string[] = [
  'BBBBBBB',
  'B.....B',
  'B.....B',
  'B.....B',
  'B.....B',
  'B.....B',
  'BBBBBBB',
];
const CAGE: readonly string[] = [
  '..........',
  '..........',
  '..........',
  '...FFFF...',
  '...F..F...',
  '...F..F...',
  '...FFFF...',
  '..........',
  '..........',
  '..........',
];
const MOATED: readonly string[] = [
  '.........',
  '.}}}}}}}.',
  '.}}---}}.',
  '.}--.--}.',
  '.}|...|}.',
  '.}--.--}.',
  '.}}---}}.',
  '.}}}}}}}.',
  '.........',
];
const LAVA_POOL: readonly string[] = ['.....', '.LLL.', '.LZL.', '.LLL.', '.....'];
const WATER_POOL: readonly string[] = ['.....', '.PPP.', '.PWP.', '.PPP.', '.....'];
const STRIP: readonly string[] = Array.from({ length: 17 }, () => '...');

/**
 * des.monster(spec, x, y) at a spot of a placed map: a class letter, or a monster's name; a kind
 * this port does not have (the Angel) is a random monster.
 */
function monsterAt(ctx: Ctx, level: Level, b: MapBlock, spec: string, x: number, y: number): void {
  const lx = b.x + x;
  const ly = b.y + y;
  if (lx < 0 || ly < 0 || lx >= level.width || ly >= level.height) return;
  const c: LevelContent = { kind: 'monster', x: lx, y: ly };
  if (spec.length === 1) c.class = spec;
  else {
    const id: DefId = `nh:${spec.toLowerCase()}`;
    if (ctx.defs.monsters.some((m) => m.id === id)) c.id = id;
  }
  createMonster(ctx, level, c, HELLFILL);
}

/** des.non_diggable(selection.area(...)) of map-relative corners. */
function nonDiggableArea(ctx: Ctx, level: Level, b: MapBlock, r: readonly number[]): void {
  const [x1, y1, x2, y2] = r as [number, number, number, number];
  const prev = madeLevelFlags(ctx.state, level.id).nondiggable ?? [];
  setMadeLevelFlags(ctx, level.id, {
    nondiggable: [...prev, [b.x + x1, b.y + y1, b.x + x2, b.y + y2]],
  });
}

/** litstate_rnd(-1): `rnd(1 + depth) < 11 && rn2(77)`. ref: src/mklev.c litstate_rnd() */
const litstateRnd = (ctx: Ctx, depth: number): boolean =>
  ctx.rng.rnd(1 + Math.abs(depth)) < 11 && ctx.rng.rn2(77) !== 0;

/** A prefab: `repeatable` ones are tables in the script (they may be stamped again). */
interface Prefab {
  repeatable: boolean;
  /** Stamps the prefab; returns its maps' blocks. */
  make(ctx: Ctx, level: Level, coldhell: boolean): MapBlock[];
}

const HELL_PREFABS: readonly Prefab[] = [
  {
    repeatable: true,
    make: (ctx, level) => [desMap(level, OPEN_16, { halign: rndHalign(ctx), valign: 'center' })],
  },
  {
    repeatable: true,
    make: (ctx, level) => [desMap(level, ROUND, { halign: rndHalign(ctx), valign: 'center' })],
  },
  {
    // a fort in a lava moat (a water moat on a cold level) with 1-4 drawbridges, a crowd inside
    repeatable: false,
    make(ctx, level, coldhell) {
      const halign = rndHalign(ctx);
      const b = desMap(level, FORT, { halign, valign: rndValign(ctx) });
      nonDiggableArea(ctx, level, b, [2, 2, 10, 8]);
      // des.region(selection.area(4,4, 8,6), "lit"): the area grown by one is lit
      const lit = selGrow(level, selArea(level, b.x + 4, b.y + 4, b.x + 8, b.y + 6));
      eachSel(level, lit, (_x, _y, i) => (level.lit[i] = 1));
      if (coldhell)
        replaceTerrain(ctx, level, selArea(level, b.x + 1, b.y + 1, b.x + 11, b.y + 9), 'L', 'P');
      const dblocs: { x: number; y: number; dir: DbDir }[] = [
        { x: 1, y: 5, dir: 'east' },
        { x: 11, y: 5, dir: 'west' },
        { x: 6, y: 1, dir: 'south' },
        { x: 6, y: 9, dir: 'north' },
      ];
      shuffle(ctx, dblocs);
      const n = 1 + ctx.rng.rn2(dblocs.length);
      for (const d of dblocs.slice(0, n)) {
        const x = b.x + d.x;
        const y = b.y + d.y;
        if (x >= 0 && y >= 0 && x < level.width && y < level.height)
          createDrawbridge(ctx, level, x, y, d.dir, false);
      }
      const mons = ['H', 'T', '@'];
      shuffle(ctx, mons);
      const count = 3 + 1 + ctx.rng.rn2(5);
      for (let i = 0; i < count; i++) monsterAt(ctx, level, b, mons[0] as string, 6, 5);
      return [b];
    },
  },
  {
    repeatable: true,
    make: (_ctx, level) => [desMap(level, WIDE, { halign: 'center', valign: 'center' })],
  },
  {
    repeatable: true,
    make(ctx, level) {
      const halign = rndHalign(ctx);
      return [desMap(level, LIT_SQUARE, { halign, valign: rndValign(ctx), lit: true })];
    },
  },
  {
    // a temple of Moloch: an unaligned altar, a shrine with its priest 1 time in 4
    repeatable: false,
    make(ctx, level) {
      const halign = rndHalign(ctx);
      const b = desMap(level, SHRINE, { halign, valign: rndValign(ctx) });
      // des.region({ region={2,2, 2,2}, type="temple", filled=1, irregular=1 }): the floor
      // inside the boundary, lit by litstate_rnd() with its edge
      const rlit = litstateRnd(ctx, level.depth);
      const idx =
        level.rooms.push({
          lx: b.x + 1,
          ly: b.y + 1,
          hx: b.x + 5,
          hy: b.y + 5,
          lit: rlit,
          type: TEMPLE,
        }) - 1;
      if (rlit)
        eachSel(level, selArea(level, b.x, b.y, b.x + 6, b.y + 6), (_x, _y, i) => {
          level.lit[i] = 1;
        });
      // des.altar({ x=3, y=3, align="noalign", type=percent(75) and "altar" or "shrine" })
      const shrine = !percent(ctx, 75);
      const at: Pos = { x: b.x + 3, y: b.y + 3 };
      if (at.x >= level.width || at.y >= level.height) return [b];
      setTerrain(level, at.x, at.y, T.altar_unaligned);
      if (!shrine) return [b];
      priestini(ctx, level, idx, at);
      if (!level.shrines?.some((p) => p.x === at.x && p.y === at.y))
        (level.shrines ??= []).push(at);
      return [b];
    },
  },
  {
    // a monster in an iron-bar cage
    repeatable: false,
    make(ctx, level) {
      const halign = rndHalign(ctx);
      const b = desMap(level, CAGE, { halign, valign: rndValign(ctx) });
      monsterAt(ctx, level, b, pick(ctx, ['Angel', 'D', 'H', 'L']), 4, 4);
      return [b];
    },
  },
  {
    // a lich in a moated tower
    repeatable: false,
    make(ctx, level) {
      const halign = rndHalign(ctx);
      const b = desMap(level, MOATED, { halign, valign: rndValign(ctx) });
      monsterAt(ctx, level, b, 'L', 4, 4);
      return [b];
    },
  },
  {
    // five pools of lava round a lava wall, or of water round a wall of water
    repeatable: false,
    make(ctx, level) {
      const rows = percent(ctx, 30) ? LAVA_POOL : WATER_POOL;
      const out: MapBlock[] = [];
      for (let dx = 1; dx <= 5; dx++)
        out.push(desMap(level, rows, { x: dx * 14 - 4 - 1, y: 3 + ctx.rng.rn2(13) }));
      return out;
    },
  },
  {
    // three open strips
    repeatable: true,
    make(ctx, level) {
      const out: MapBlock[] = [];
      for (let dx = 1; dx <= 3; dx++)
        out.push(desMap(level, STRIP, { x: 3 + ctx.rng.rn2(73) - 1, y: 3 }));
      return out;
    },
  },
];

/**
 * rnd_hell_prefab(coldhell): a random prefab; a repeatable one goes again unless
 * `math.random(0, nloops * 2)` is 0, up to six in all. ref: dat/hellfill.lua rnd_hell_prefab()
 */
export function rndHellPrefab(ctx: Ctx, level: Level, coldhell: boolean): void {
  let nloops = 0;
  let dorepeat: boolean;
  do {
    nloops++;
    const fab = HELL_PREFABS[ctx.rng.rn2(HELL_PREFABS.length)] as Prefab;
    fab.make(ctx, level, coldhell);
    dorepeat = fab.repeatable && ctx.rng.rn2(nloops * 2 + 1) !== 0;
  } while (dorepeat && nloops <= 5);
}

/** The ten prefabs' maps, in the script's order (for tests). */
export const HELL_PREFAB_MAPS: readonly (readonly (readonly string[])[])[] = [
  [OPEN_16],
  [ROUND],
  [FORT],
  [WIDE],
  [LIT_SQUARE],
  [SHRINE],
  [CAGE],
  [MOATED],
  [LAVA_POOL, WATER_POOL],
  [STRIP],
];

/** Prefab number `n` (1..10) made at once (for tests); its maps' blocks. */
export function makeHellPrefab(ctx: Ctx, level: Level, n: number, coldhell = false): MapBlock[] {
  return HELL_PREFABS[n - 1]?.make(ctx, level, coldhell) ?? [];
}

// ---------------------------------------------------------------------------------------------
// The seven hells. ref: dat/hellfill.lua hells

/** 1: "mines" style with lava. */
function hellMinesLava(ctx: Ctx, level: Level): void {
  minesInit(ctx, level, T.stone, true);
  replaceTerrain(ctx, level, null, ' ', 'L', 100, LAVA_LIT);
  replaceTerrain(ctx, level, null, '.', 'L', 5, LAVA_LIT);
  replaceMapfrag(ctx, level, null, 'w', 'L', 20, LAVA_LIT);
  replaceMapfrag(ctx, level, null, 'w', '.', 15, LAVA_LIT);
}

/** 2: mazes like the original, with some hell_tweaks. */
function hellMaze(ctx: Ctx, level: Level): void {
  // des.level_init({ style = "mazegrid", bg = "-" })
  layKinds(level, mazeGrid(level.width, level.height, false), (k) =>
    k === MZ_WALL ? T.hwall : T.stone,
  );
  mazewalk(ctx, level, HELLFILL, 1, 10, 'east', false, true);
  // selection.match("-"):bounds(), then selection.fillrect(lx, ly + 1, hx - 2, hy - 1), whose
  // corners get the map origin added (NetHack's x 1): the grid's inside
  const b = selBounds(level, selMatch(level, '-'));
  const protectedArea = selArea(level, b.lx + 1, b.ly + 1, b.hx - 1, b.hy - 1);
  hellTweaks(ctx, level, selNegate(protectedArea));
  if (percent(ctx, 25)) rndHellPrefab(ctx, level, false);
}

/** 3: mazes, style 1: walls one thick, random corridor width. */
function hellMazeThin(ctx: Ctx, level: Level): void {
  mazeInit(ctx, level, 1);
}

/** 4: mazes, style 2: the walls become iron bars or lava. */
function hellMazeBars(ctx: Ctx, level: Level): void {
  const cwid = 1 + ctx.rng.rn2(4);
  mazeInit(ctx, level, 1, cwid);
  const outsideWalls = selMatch(level, ' ');
  const wallterrain = ['F', 'L'];
  shuffle(ctx, wallterrain);
  const wall = wallterrain[0] as string;
  replaceMapfrag(ctx, level, null, 'w', wall, 100, LAVA_LIT);
  if (cwid === 1) {
    if (wall === 'F' && percent(ctx, 80)) {
      // replace some horizontal iron bars walls with floor
      const chance = 25 * (1 + ctx.rng.rn2(4));
      replaceMapfrag(ctx, level, null, '.\nF\n.', '.', chance, LAVA_LIT);
    } else if (percent(ctx, 25)) rndHellPrefab(ctx, level, false);
  }
  setSel(level, outsideWalls, ' '); // return the outside back to solid wall
}

/** 5: mazes with thick walls, half the time lava instead of walls. */
function hellMazeThick(ctx: Ctx, level: Level): void {
  const wwid = 1 + 1 + ctx.rng.rn2(2);
  mazeInit(ctx, level, wwid, 1 + ctx.rng.rn2(2));
  if (!percent(ctx, 50)) return;
  const outsideWalls = selMatch(level, ' ');
  replaceMapfrag(ctx, level, null, 'w', 'L', 100, LAVA_LIT);
  setSel(level, outsideWalls, ' ');
  if (wwid === 3 && percent(ctx, 40)) {
    const sel = selMatch(level, 'LLL\nLLL\nLLL');
    const n = 30 * (1 + ctx.rng.rn2(4));
    setSel(level, selPercentage(ctx.rng, level, sel, n), 'Z', LAVA_LIT);
  }
}

/** 6: a cold maze, with ice and water. */
function hellMazeCold(ctx: Ctx, level: Level): void {
  const cwid = 1 + ctx.rng.rn2(4);
  setMadeLevelFlags(ctx, level.id, { temperature: -1 }); // des.level_flags("cold")
  mazeInit(ctx, level, 1, cwid);
  const outsideWalls = selMatch(level, ' ');
  const all: Sel = selWhere(level, () => true); // selection.negate() of nothing
  const icey = selFilterMapchar(level, selGrow(level, selPercentage(ctx.rng, level, all, 10)), '.');
  setSel(level, icey, 'I');
  // turn some ice into wall of water
  if (cwid > 1) setSel(level, selPercentage(ctx.rng, level, icey, 1), 'W');
  setSel(level, selPercentage(ctx.rng, level, icey, 5), 'P');
  if (percent(ctx, 25)) setSel(level, selMatch(level, 'w'), 'W'); // walls of water
  if (cwid === 1 && percent(ctx, 25)) rndHellPrefab(ctx, level, true);
  setSel(level, outsideWalls, ' ');
}

/** 7: an open cavern, "mines" with more space; its walls are stone or lava. */
function hellCavern(ctx: Ctx, level: Level): void {
  const wter = percent(ctx, 50) ? ' ' : 'L';
  minesInit(ctx, level, wter === ' ' ? T.stone : T.lava, false);
  const sel = selGrow(level, selMatch(level, '.'));
  setSel(level, sel, '.', { lit: 0, litLava: true });
  // selection.rect(0,0, 78,20): the level's edge
  const border = selRect(level, 0, 0, level.width - 1, level.height - 1);
  setSel(level, border, wter, { lit: 0, litLava: true });
  wallifyLevel(level, VANILLA_TERRAIN); // des.wallify()
}

const HELLS: readonly ((ctx: Ctx, level: Level) => void)[] = [
  hellMinesLava,
  hellMaze,
  hellMazeThin,
  hellMazeBars,
  hellMazeThick,
  hellMazeCold,
  hellCavern,
];

// ---------------------------------------------------------------------------------------------
// Stairs, populatemaze() and the finish.

/**
 * des.stair() at a random spot: floor, corridor or ice (good_stair_loc()), 100 random cells of
 * the level, then the first in column order; a trap there is removed. Null when there is none.
 * ref: src/sp_lev.c l_create_stairway(), good_stair_loc(), get_location()
 */
function stairSpot(ctx: Ctx, level: Level): Pos | null {
  const good = (x: number, y: number): boolean => {
    const id = terrainIdAt(level, x, y);
    return id === T.floor || id === T.corr || id === T.ice;
  };
  let p: Pos | null = null;
  for (let cpt = 0; cpt < 100 && !p; cpt++) {
    const x = ctx.rng.rn2(level.width);
    const y = ctx.rng.rn2(level.height);
    if (good(x, y)) p = { x, y };
  }
  for (let x = 0; x < level.width && !p; x++)
    for (let y = 0; y < level.height && !p; y++) if (good(x, y)) p = { x, y };
  if (p && trapAt(level, p.x, p.y)) ctx.removeTrap(level.id, p);
  return p;
}

/**
 * populatemaze(): 12..19 objects (gems half the time), 2..11 boulder-class objects, 1..3
 * hostile minotaurs, 8..12 hostile random monsters, 8..13 piles of gold and 8..13 traps, each on
 * a random DRY spot of the level. ref: dat/hellfill.lua populatemaze()
 */
export function populatemaze(ctx: Ctx, level: Level, def: LevelDef = HELLFILL): void {
  const rng = ctx.rng;
  const make = (c: LevelContent): void => makeContents(ctx, level, def, [c]);
  for (let i = 1 + rng.rn2(8) + 11; i > 0; i--)
    make(percent(ctx, 50) ? { kind: 'object', class: 'gem' } : { kind: 'object' });
  for (let i = 1 + rng.rn2(10) + 2; i > 0; i--) make({ kind: 'object', class: 'rock' });
  for (let i = 1 + rng.rn2(3); i > 0; i--)
    make({ kind: 'monster', id: 'nh:minotaur', peaceful: false });
  for (let i = 1 + rng.rn2(5) + 7; i > 0; i--) make({ kind: 'monster', peaceful: false });
  for (let i = 1 + rng.rn2(6) + 7; i > 0; i--) desGold(ctx, level, def);
  for (let i = 1 + rng.rn2(6) + 7; i > 0; i--) make({ kind: 'trap' });
}

/**
 * No boulder, trap (but the vibrating square) or engraving stays on lava or water.
 * ref: src/sp_lev.c map_cleanup()
 */
function mapCleanup(ctx: Ctx, level: Level): void {
  for (let x = 0; x < level.width; x++)
    for (let y = 0; y < level.height; y++) {
      const id = terrainIdAt(level, x, y);
      if (!isPoolOrLava(ctx, level, x, y) && id !== T.lavawall && id !== T.water) continue;
      for (const o of itemsAt(ctx.defs, ctx.state, level.id, x, y))
        if (o.def === BOULDER) ctx.remove(o.id);
      const t = trapAt(level, x, y);
      if (t && t.def !== TRAP.vibrating) ctx.removeTrap(level.id, { x, y });
      delEngrAt(ctx, level, x, y);
    }
}

/**
 * hellfill's fixup: the placeholder stairs lifted, `math.random(1, #hells)` and that hell, the up
 * stairs, the vibrating square on the invocation level or else the down stairs (each spot drawn
 * even where the dungeon wants no such stairs, as mkstairs() refuses them after the spot),
 * populatemaze(), the branch stairs if the dungeon puts any here, then the finish: map_cleanup()
 * and the walls joined.
 */
export const HELLFILL_FIXUP: SpLevFixup = {
  before(ctx, level) {
    const wantUp = level.up !== null;
    const wantDown = level.down !== null;
    const branch = level.branch;
    for (const p of [level.up, level.down, branch?.pos])
      if (p) setTerrain(level, p.x, p.y, T.stone);
    level.up = null;
    level.down = null;

    const hellno = 1 + ctx.rng.rn2(HELLS.length);
    setMadeLevelFlags(ctx, level.id, { hellfill: hellno });
    (HELLS[hellno - 1] as (ctx: Ctx, level: Level) => void)(ctx, level);

    const up = stairSpot(ctx, level);
    if (up && wantUp) {
      setTerrain(level, up.x, up.y, T.stairs_up);
      level.up = up;
    }
    if (invocationLev(ctx.state, level)) {
      const p = pickVibrasquareLocation(ctx, level);
      maketrap(ctx, level.id, p.x, p.y, TRAP.vibrating, { inMklev: true });
    } else {
      const down = stairSpot(ctx, level);
      if (down && wantDown) {
        setTerrain(level, down.x, down.y, T.stairs_down);
        level.down = down;
      }
    }
    populatemaze(ctx, level);
    if (branch) {
      // fixup_special()'s place_branch(): a random spot
      const p = stairSpot(ctx, level);
      if (p) {
        setTerrain(level, p.x, p.y, branch.dir === 'up' ? T.stairs_up : T.stairs_down);
        branch.pos = p;
      }
    }
    mapCleanup(ctx, level);
    wallifyLevel(level, VANILLA_TERRAIN, [0, 0, -1, -1]); // wallification() only
  },
};
