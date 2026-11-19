// Level flags of the special levels, kept as a content table keyed by LevelDef id (a level with no
// LevelDef has none). Nothing is saved: the flags follow from `Level.def`.
// ref: dat/soko*.lua, dat/minend-*.lua, dat/minetn-5.lua, dat/valley.lua des.level_flags()
// ("noteleport", "hardfloor", "mazelevel", "solidify", "nommap", "temperate"),
// des.non_diggable(selection.area(...)) and
// des.non_passwall(selection.area(...));
// src/sp_lev.c lspo_level_flags(), set_wall_property(); src/mkmap.c mkmap() (cavernous levels);
// src/dungeon.c Can_dig_down(); src/hack.c may_dig()
import {
  dungeonLayout,
  levelDefArea,
  specialLevelAt,
  type Ctx,
  type DefId,
  type GameState,
  type Json,
  type Level,
  type LevelRef,
} from '@nh/core';
import { CASTLE, isDbWall } from './dbstate';
import { T } from './terrain';

/** A rectangle of map-relative cells, corners included (des.non_diggable(selection.area())). */
export interface FlagRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * ref: level.flags.noteleport, hardfloor, is_maze_lev, shortsighted (hostile monsters far from
 * her stop approaching: m_move()), nommap (magic mapping fails), temperature 0 on a Gehennom
 * level (`temperate`: neither hot nor cold; read from m17 step 3); W_NONDIGGABLE and
 * W_NONPASSWALL walls (`'all'`: every wall and, with `solidify`, the stone around the map block);
 * `medusa`: one of Medusa's levels (Is_medusa_level(): create_object()'s petrified statues,
 * fixup_special()'s statues).
 */
export interface LevelFlags {
  noteleport?: true;
  hardfloor?: true;
  maze?: true;
  shortsighted?: true;
  nommap?: true;
  temperate?: true;
  medusa?: true;
  /**
   * m24: "icedpools": the ice its mines map made melts into a pool, not a moat (C's ICED_POOL
   * set by finish_map(); the flag comes before the map in the script). Val-strt's flag comes
   * after its ice (a solid fill), which melts into a moat, so it is not set there.
   */
  icedpools?: true;
  nondiggable?: 'all' | readonly FlagRect[];
  nonpasswall?: 'all' | readonly FlagRect[];
}

/** The elemental planes' flags. */
const PLANE: LevelFlags = { noteleport: true, hardfloor: true, maze: true, shortsighted: true };

/**
 * The Sokoban levels: their non_diggable and non_passwall areas cover the whole map, and
 * `solidify` the rest (solidify_map() sets both bits).
 */
const SOKO: LevelFlags = { noteleport: true, maze: true, nondiggable: 'all', nonpasswall: 'all' };
/** soko4 (the entry level) also has a hard floor. ref: dat/soko4-1.lua, soko4-2.lua */
const SOKO_ENTRY: LevelFlags = { ...SOKO, hardfloor: true };

/**
 * The big rooms: "mazelevel", and des.non_diggable() of the whole level, but bigrm-10 (no
 * non_diggable). ref: dat/bigrm-1.lua .. bigrm-13.lua
 */
const BIGROOM_FLAGS: Readonly<Record<DefId, LevelFlags>> = Object.fromEntries(
  Array.from({ length: 13 }, (_, i): [DefId, LevelFlags] => [
    `nh:bigrm-${String(i + 1)}`,
    i + 1 === 10 ? { maze: true } : { maze: true, nondiggable: 'all' },
  ]),
);

/** wizard1.lua's des.non_diggable() and des.non_passwall() areas (the same four). */
const WIZ1_WALLS: readonly FlagRect[] = [
  { x1: 0, y1: 0, x2: 11, y2: 12 },
  { x1: 11, y1: 0, x2: 21, y2: 0 },
  { x1: 11, y1: 10, x2: 27, y2: 12 },
  { x1: 21, y1: 0, x2: 27, y2: 10 },
];
/** wizard3.lua's des.non_diggable() and des.non_passwall() areas (the same four). */
const WIZ3_WALLS: readonly FlagRect[] = [
  { x1: 0, y1: 0, x2: 6, y2: 12 },
  { x1: 6, y1: 0, x2: 27, y2: 2 },
  { x1: 16, y1: 2, x2: 27, y2: 12 },
  { x1: 6, y1: 12, x2: 16, y2: 12 },
];

/**
 * The stone around a map block of `w` x `h` cells, map-relative (solidify_map(): every stone or
 * wall cell outside the map gets W_NONDIGGABLE and W_NONPASSWALL).
 */
function outsideMap(w: number, h: number): readonly FlagRect[] {
  const far = 1000;
  return [
    { x1: -far, y1: -far, x2: -1, y2: far },
    { x1: w, y1: -far, x2: far, y2: far },
    { x1: 0, y1: -far, x2: w - 1, y2: -1 },
    { x1: 0, y1: h, x2: w - 1, y2: far },
  ];
}

/**
 * Vlad's Tower's upper levels: des.non_diggable() over the whole 15x11 map, and `solidify` the
 * stone around it (non-diggable and non-passwall); the walls inside the map stay passable to
 * phasing monsters. ref: dat/tower1.lua, dat/tower2.lua; src/sp_lev.c solidify_map()
 */
const TOWER12: LevelFlags = {
  noteleport: true,
  hardfloor: true,
  maze: true,
  nondiggable: 'all',
  nonpasswall: outsideMap(15, 11),
};

/**
 * The flags of each special level that has any. Minetown's minetn-1 (Orcish Town) and minetn-6
 * say "mazelevel" too, but their mines-style map makes them cavernous instead (mkmap() clears
 * is_maze_lev), as are the Mines' filler levels; see {@link cavernous}.
 */
export const LEVEL_FLAGS: Readonly<Record<DefId, LevelFlags>> = {
  'nh:soko1-1': SOKO,
  'nh:soko1-2': SOKO,
  'nh:soko2-1': SOKO,
  'nh:soko2-2': SOKO,
  'nh:soko3-1': SOKO,
  'nh:soko3-2': SOKO,
  'nh:soko4-1': SOKO_ENTRY,
  'nh:soko4-2': SOKO_ENTRY,
  /** ref: src/mkmaze.c makemaz(""): `level.flags.is_maze_lev = 1` */
  'nh:mazefill': { maze: true },
  /**
   * ref: dat/hellfill.lua des.level_flags("mazelevel", "noflip"): a walled, joined mines map
   * (its first kind of level) clears it again (MadeLevelFlags)
   */
  'nh:hellfill': { maze: true },
  /** ref: dat/minetn-5.lua (Grotto town is a solidfill map, so it stays a maze level) */
  'nh:minetn-5': { maze: true },
  /** ref: dat/minend-1.lua */
  'nh:minend-1': { maze: true, nondiggable: [{ x1: 0, y1: 0, x2: 74, y2: 17 }] },
  /** ref: dat/minend-2.lua */
  'nh:minend-2': {
    maze: true,
    nondiggable: [
      { x1: 0, y1: 0, x2: 52, y2: 17 },
      { x1: 53, y1: 0, x2: 74, y2: 0 },
      { x1: 53, y1: 17, x2: 74, y2: 17 },
      { x1: 74, y1: 1, x2: 74, y2: 16 },
      { x1: 53, y1: 7, x2: 55, y2: 7 },
      { x1: 53, y1: 14, x2: 61, y2: 14 },
    ],
  },
  ...BIGROOM_FLAGS,
  /** ref: dat/medusa-1.lua */
  'nh:medusa-1': {
    medusa: true,
    noteleport: true,
    maze: true,
    nondiggable: [{ x1: 30, y1: 6, x2: 46, y2: 13 }],
  },
  /** ref: dat/medusa-2.lua */
  'nh:medusa-2': {
    medusa: true,
    noteleport: true,
    maze: true,
    nondiggable: [
      { x1: 1, y1: 2, x2: 6, y2: 17 },
      { x1: 60, y1: 2, x2: 73, y2: 17 },
    ],
  },
  /** ref: dat/medusa-3.lua ("4th room has diggable walls as Medusa is never placed there") */
  'nh:medusa-3': {
    medusa: true,
    noteleport: true,
    maze: true,
    shortsighted: true,
    nondiggable: [
      { x1: 6, y1: 4, x2: 10, y2: 8 },
      { x1: 64, y1: 3, x2: 68, y2: 7 },
      { x1: 44, y1: 13, x2: 48, y2: 17 },
    ],
  },
  /** ref: dat/medusa-4.lua */
  'nh:medusa-4': {
    medusa: true,
    noteleport: true,
    maze: true,
    nondiggable: [{ x1: 1, y1: 1, x2: 22, y2: 14 }],
  },
  /** ref: dat/castle.lua ("noflipy": no flipping here) */
  'nh:castle': { noteleport: true, maze: true, nondiggable: [{ x1: 0, y1: 0, x2: 62, y2: 16 }] },
  /** ref: dat/minend-3.lua (the Catacombs) */
  'nh:minend-3': {
    maze: true,
    nommap: true,
    nondiggable: [
      { x1: 67, y1: 3, x2: 73, y2: 7 },
      { x1: 0, y1: 12, x2: 2, y2: 16 },
    ],
  },
  /** ref: dat/valley.lua ("Non diggable walls - everywhere!": the whole map) */
  'nh:valley': {
    noteleport: true,
    hardfloor: true,
    maze: true,
    nommap: true,
    temperate: true,
    nondiggable: [{ x1: 0, y1: 0, x2: 75, y2: 19 }],
  },
  /**
   * ref: dat/sanctum.lua ("mazelevel", "noteleport", "hardfloor", "nommap"; non-diggable walls
   * over the whole map; the invisible barrier between its halves, columns 37-39, which the
   * script extends one row up above the map)
   */
  'nh:sanctum': {
    noteleport: true,
    hardfloor: true,
    maze: true,
    nommap: true,
    nondiggable: [{ x1: 0, y1: 0, x2: 75, y2: 19 }],
    nonpasswall: [{ x1: 37, y1: -1, x2: 39, y2: 19 }],
  },
  /** ref: dat/juiblex.lua ("mazelevel", "shortsighted", "noflip", "temperate") */
  'nh:juiblex-swamp': { maze: true, shortsighted: true, temperate: true },
  /**
   * ref: dat/asmodeus.lua: the first part's non-diggable walls (the second part's is the
   * fixup's, MadeLevelFlags)
   */
  'nh:asmodeus-lair': { maze: true, nondiggable: [{ x1: 0, y1: 0, x2: 20, y2: 11 }] },
  /** ref: dat/orcus.lua ("mazelevel", "shortsighted") */
  'nh:orcus-town': { maze: true, shortsighted: true },
  /** ref: dat/wizard1.lua ("Walls inside the moat stay diggable") */
  'nh:wizard1': {
    noteleport: true,
    hardfloor: true,
    maze: true,
    nondiggable: WIZ1_WALLS,
    nonpasswall: WIZ1_WALLS,
  },
  /** ref: dat/wizard2.lua ("Non diggable walls everywhere") */
  'nh:wizard2': {
    noteleport: true,
    hardfloor: true,
    maze: true,
    nondiggable: [{ x1: 0, y1: 0, x2: 27, y2: 12 }],
    nonpasswall: [{ x1: 0, y1: 0, x2: 27, y2: 12 }],
  },
  /** ref: dat/wizard3.lua ("Walls inside the moat stay diggable") */
  'nh:wizard3': {
    noteleport: true,
    hardfloor: true,
    maze: true,
    nondiggable: WIZ3_WALLS,
    nonpasswall: WIZ3_WALLS,
  },
  /** ref: dat/knox.lua ("mazelevel", "noteleport"; non_diggable over the whole map) */
  'nh:knox': { noteleport: true, maze: true, nondiggable: [{ x1: 0, y1: 0, x2: 75, y2: 19 }] },
  /** ref: dat/tower1.lua ("mazelevel", "noteleport", "hardfloor", "solidify") */
  'nh:tower1': TOWER12,
  /** ref: dat/tower2.lua */
  'nh:tower2': TOWER12,
  /** ref: dat/tower3.lua */
  'nh:tower3': {
    noteleport: true,
    hardfloor: true,
    maze: true,
    nondiggable: 'all',
    nonpasswall: outsideMap(19, 13),
  },
  /**
   * ref: dat/earth.lua, fire.lua, air.lua, water.lua ("mazelevel", "noteleport", "hardfloor",
   * "shortsighted"; Fire's "hot" and "fumaroles" and Air's "stormy" are not modelled). Nothing is
   * non-diggable: bound_digging() leaves Earth alone and the others have no walls.
   */
  'nh:plane-earth': PLANE,
  'nh:plane-fire': PLANE,
  'nh:plane-air': PLANE,
  'nh:plane-water': PLANE,
  /**
   * ref: dat/astral.lua ("mazelevel", "noteleport", "hardfloor", "nommap", "shortsighted",
   * "solidify"; non_diggable and non_passwall over the whole map)
   */
  'nh:plane-astral': {
    ...PLANE,
    nommap: true,
    nondiggable: 'all',
    nonpasswall: 'all',
  },
  /** ref: dat/fakewiz1.lua, dat/fakewiz2.lua ("mazelevel") */
  'nh:fakewiz1': { maze: true },
  'nh:fakewiz2': { maze: true },
  /**
   * ref: dat/baalz.lua des.non_diggable(selection.area(00,00,47,12)) less the two cells west of
   * each eye, which src/mkmaze.c baalz_fixup() makes diggable ("novelty effect; allowing digging
   * in front of 'eyes'")
   */
  'nh:baalz': {
    maze: true,
    nondiggable: [
      { x1: 0, y1: 0, x2: 47, y2: 3 },
      { x1: 2, y1: 4, x2: 47, y2: 4 },
      { x1: 0, y1: 5, x2: 47, y2: 7 },
      { x1: 2, y1: 8, x2: 47, y2: 8 },
      { x1: 0, y1: 9, x2: 47, y2: 12 },
    ],
  },
  // m24: the Valkyrie's quest ("noflip" needs nothing: levels are never flipped here)
  /** ref: dat/Val-strt.lua ("mazelevel", "noteleport", "hardfloor", "icedpools") */
  'nh:val-strt': {
    noteleport: true,
    hardfloor: true,
    maze: true,
    nondiggable: [{ x1: 26, y1: 7, x2: 43, y2: 13 }],
  },
  /** ref: dat/Val-loca.lua ("mazelevel", "hardfloor", "icedpools") */
  'nh:val-loca': {
    hardfloor: true,
    maze: true,
    icedpools: true,
    nondiggable: [{ x1: 0, y1: 0, x2: 39, y2: 12 }],
  },
  /** ref: dat/Val-goal.lua ("mazelevel", "icedpools") */
  'nh:val-goal': { maze: true, icedpools: true, nondiggable: [{ x1: 0, y1: 0, x2: 34, y2: 16 }] },
  /** ref: dat/Val-fila.lua ("mazelevel", "icedpools", "noflip") */
  'nh:val-fila': { maze: true, icedpools: true },
  /** ref: dat/Val-filb.lua ("mazelevel", "icedpools", "noflip") */
  'nh:val-filb': { maze: true, icedpools: true },
};

const NONE: LevelFlags = {};

/** What reads the level flags: the registry, and the game state for the flags a level got. */
type FlagCtx = Pick<Ctx, 'defs'> & { readonly state?: Readonly<GameState> };

/**
 * Flags a level got from its own random choices while it was made (`modData.nh.levflags` by
 * level id; hellfill.ts): its kind of hellfill level, `maze` (des.level_flags("mazelevel"), cleared again by a walled,
 * joined mines map), `cavernous` (that map: mkmap()'s is_cavernous_lev), `temperature` (-1 for
 * "cold"; read by temperature.ts) and `nondiggable` rectangles in Level coordinates (a prefab's
 * des.non_diggable()). ref: src/sp_lev.c lspo_level_flags(), set_wallprop_in_selection();
 * src/mkmap.c mkmap()
 */
export interface MadeLevelFlags {
  /** hellfill.lua's kind of level (1..7, `hellno`), for wizard mode and tests. */
  hellfill?: number;
  maze?: boolean;
  cavernous?: true;
  temperature?: -1 | 0 | 1;
  nondiggable?: [number, number, number, number][];
  /**
   * The Wizard's Tower's boundary on wizard1-3 (Level coordinates, corners included): the
   * exclusion of their teleport region, C's `dndest.nl*`.
   */
  wtower?: [number, number, number, number];
  /**
   * The hero has arrived on it (C's VISITED level_info flag), kept only for levels whose first
   * arrival says something (the Rogue level). ref: src/do.c goto_level() `new`
   */
  visited?: true;
  /**
   * des.exclusion({ type = "monster-generation" }) areas (Level coordinates, corners included):
   * random new monsters are never placed in them (Fort Ludios's treasury and corner towers).
   * ref: src/sp_lev.c lspo_exclusion(); src/mkmaze.c is_exclusion_zone()
   */
  mongenExclude?: [number, number, number, number][];
}

const levflagsTable = (state: Readonly<GameState>): Record<string, Json> | undefined => {
  const nh = state.modData['nh'] as Record<string, Json> | undefined;
  return nh?.['levflags'] as Record<string, Json> | undefined;
};

/**
 * Whether (x, y) of `level` is in one of its monster-generation exclusion areas: goodpos() with
 * GP_AVOID_MONPOS (makemon()'s) refuses it. ref: src/mkmaze.c is_exclusion_zone(LR_MONGEN);
 * src/teleport.c goodpos()
 */
export function mongenExcluded(
  state: Readonly<GameState>,
  level: Readonly<Level>,
  x: number,
  y: number,
): boolean {
  const ex = madeLevelFlags(state, level.id).mongenExclude;
  return ex?.some(([x1, y1, x2, y2]) => x >= x1 && x <= x2 && y >= y1 && y <= y2) === true;
}

/** The flags level `levelId` got as it was made (none for most levels). */
export function madeLevelFlags(state: Readonly<GameState>, levelId: string): MadeLevelFlags {
  const t = levflagsTable(state);
  return (t && Object.hasOwn(t, levelId) ? t[levelId] : {}) as MadeLevelFlags;
}

/** Records flags of level `levelId` as it is made (merged over what it has). */
export function setMadeLevelFlags(
  ctx: Pick<Ctx, 'state'>,
  levelId: string,
  flags: MadeLevelFlags,
): void {
  const nh = (ctx.state.modData['nh'] ??= {}) as Record<string, Json>;
  const t = (nh['levflags'] ??= {}) as Record<string, Json>;
  t[levelId] = { ...madeLevelFlags(ctx.state, levelId), ...flags } as Json;
}

/** The level's flags (none for an ordinary level), with the `maze` flag it got when made. */
export function levelFlags(ctx: FlagCtx, level: Readonly<Level>): LevelFlags {
  const base = (level.def !== undefined ? LEVEL_FLAGS[level.def] : undefined) ?? NONE;
  const made = ctx.state ? madeLevelFlags(ctx.state, level.id) : {};
  if (made.maze === undefined) return base;
  const { maze: _maze, ...rest } = base;
  return made.maze ? { ...rest, maze: true } : rest;
}

/**
 * A walled, joined mines-style level is cavernous, not mazelike: zapped walls there become
 * corridor rather than doorways. ref: src/mkmap.c mkmap() `if (walled && join)`
 */
export function cavernous(ctx: FlagCtx, level: Readonly<Level>): boolean {
  if (ctx.state && madeLevelFlags(ctx.state, level.id).cavernous === true) return true;
  if (level.def === undefined) return false;
  const init = ctx.defs.level(level.def).init;
  return init.style === 'mines' && init.walled === true && init.joined === true;
}

/**
 * The cell's W_NONDIGGABLE bit: inside one of the level's des.non_diggable() areas (map-relative,
 * placed through the LevelDef's map block), or anywhere on a level whose flags say 'all', or a
 * raised drawbridge's portcullis (ref: src/dbridge.c create_drawbridge(), close_drawbridge():
 * "Drawbridges are non-diggable."). Only stone, walls and trees care (may_dig()).
 */
export function nonDiggable(ctx: FlagCtx, level: Readonly<Level>, x: number, y: number): boolean {
  return (
    isDbWall(level, x, y) ||
    inFlagArea(ctx, level, levelFlags(ctx, level).nondiggable, x, y) ||
    (ctx.state !== undefined &&
      (madeLevelFlags(ctx.state, level.id).nondiggable ?? []).some(
        ([x1, y1, x2, y2]) => x >= x1 && x <= x2 && y >= y1 && y <= y2,
      ))
  );
}

/**
 * The cell's W_NONPASSWALL bit, like {@link nonDiggable} for des.non_passwall(): only stone and
 * walls care (may_passwall()). ref: src/sp_lev.c set_wallprop_in_selection(), solidify_map()
 */
export function nonPasswall(ctx: FlagCtx, level: Readonly<Level>, x: number, y: number): boolean {
  return inFlagArea(ctx, level, levelFlags(ctx, level).nonpasswall, x, y);
}

function inFlagArea(
  ctx: FlagCtx,
  level: Readonly<Level>,
  nd: LevelFlags['nondiggable'],
  x: number,
  y: number,
): boolean {
  if (nd === undefined) return false;
  if (nd === 'all') return true;
  if (level.def === undefined) return false;
  const area = levelDefArea(ctx.defs.level(level.def), level.width, level.height);
  const mx = x - area.x;
  const my = y - area.y;
  return nd.some((r) => mx >= r.x1 && mx <= r.x2 && my >= r.y1 && my <= r.y2);
}

/**
 * Whether a hole can be dug through the level's floor: no hard floor, not the last level of its
 * dungeon (the main dungeon has none) and not the invocation level.
 * ref: src/dungeon.c Can_dig_down()
 */
export function canDigDown(ctx: Pick<Ctx, 'defs' | 'state'>, level: Readonly<Level>): boolean {
  if (levelFlags(ctx, level).hardfloor) return false;
  if (invocationLev(ctx.state, level)) return false;
  return level.dlevel < (dungeonLayout(ctx.state, level.dungeon).levels ?? Infinity);
}

/**
 * The bottom of a dungeon without one for holes, trap doors and level teleports. NetHack's
 * Dungeons of Doom has `rn1(5, 25)` levels (dat/dungeon.lua base 25, range 5) with the Castle at
 * the bottom, and so has this port's main dungeon from m15 on; a game saved before m15 keeps its
 * endless main dungeon (the layout is in the save) and uses the smallest of those, 25, as its
 * bottom (see DEVIATIONS.md "Dungeon bottom"). Stairs still lead deeper there.
 */
export const DUNGEON_BOTTOM = 25;

/**
 * The last level of `level`'s dungeon: its last level, or for an endless dungeon DUNGEON_BOTTOM
 * (one below `level` once past it). ref: src/dungeon.c dunlevs_in_dungeon()
 */
export function dungeonBottom(state: Readonly<GameState>, level: Readonly<Level>): number {
  const n = dungeonLayout(state, level.dungeon).levels;
  return n ?? Math.max(DUNGEON_BOTTOM, level.dlevel + 1);
}

/**
 * u.uevent.invoked: the invocation has opened the way to the Sanctum (luck.ts UState `invoked`,
 * read here directly: luck.ts sits above this module). ref: include/you.h struct u_event
 */
export function uInvoked(state: Readonly<GameState>): boolean {
  const nh = state.modData['nh'];
  const u = nh !== null && typeof nh === 'object' && !Array.isArray(nh) ? nh['u'] : undefined;
  return u !== null && typeof u === 'object' && !Array.isArray(u) && u['invoked'] === true;
}

/**
 * The last level holes, trap doors and random level teleports reach in `level`'s dungeon: its
 * last level ({@link dungeonBottom}), but in Gehennom before the invocation the invocation level
 * above it (the Sanctum is out of reach until then).
 * In the Quest, the locate level until she has reached it.
 * ref: src/trap.c dng_bottom()
 */
export function dngBottom(state: Readonly<GameState>, level: Readonly<Level> | LevelRef): number {
  const n = dungeonLayout(state, level.dungeon).levels;
  const bottom = n ?? Math.max(DUNGEON_BOTTOM, level.dlevel + 1);
  // when in the upper half of the quest, don't fall past the middle "quest locate" level if the
  // hero hasn't been there yet
  if (level.dungeon === QUEST) {
    const qlocate = qlocateDlevel(state);
    return qlocate !== null && questDunlevReached(state) < qlocate ? qlocate : bottom;
  }
  return HELLISH.includes(level.dungeon) && n !== null && !uInvoked(state) ? bottom - 1 : bottom;
}

// ---------------------------------------------------------------------------------------------
// the Quest (m24)

/** The Quest's dungeon, behind a magic portal six or seven levels below the Oracle. */
export const QUEST: DefId = 'nh:quest';
/** The Quest's special levels (dungeon.lua's "x-strt", "x-loca", "x-goal"). */
export const QSTART: DefId = 'nh:qstart';
export const QLOCATE: DefId = 'nh:qlocate';
export const QGOAL: DefId = 'nh:qgoal';

/** Whether `level` (the hero's by default) is in the Quest. ref: src/dungeon.c In_quest() */
export function inQuest(state: Readonly<GameState>, level?: Readonly<Level> | LevelRef): boolean {
  const ref = level ?? state.levels[state.currentLevel];
  return ref?.dungeon === QUEST;
}

/** The Quest's special level on `level` (the hero's by default), or null. */
function questSpecial(
  state: Readonly<GameState>,
  level?: Readonly<Level> | LevelRef,
): DefId | null {
  const ref = level ?? state.levels[state.currentLevel];
  if (ref?.dungeon !== QUEST) return null;
  return specialLevelAt(state, { dungeon: ref.dungeon, dlevel: ref.dlevel })?.id ?? null;
}

/** The Quest's home level, its first. ref: include/dungeon.h Is_qstart() (qstart_level) */
export const isQstart = (state: Readonly<GameState>, level?: Readonly<Level> | LevelRef): boolean =>
  questSpecial(state, level) === QSTART;
/** The Quest's locate level. ref: include/dungeon.h Is_qlocate() */
export const isQlocate = (
  state: Readonly<GameState>,
  level?: Readonly<Level> | LevelRef,
): boolean => questSpecial(state, level) === QLOCATE;
/** The Quest's goal level, its last. ref: include/dungeon.h Is_nemesis() */
export const isQgoal = (state: Readonly<GameState>, level?: Readonly<Level> | LevelRef): boolean =>
  questSpecial(state, level) === QGOAL;

/** The locate level's dlevel in this game's layout, or null in a game without the Quest. */
export function qlocateDlevel(state: Readonly<GameState>): number | null {
  const d = state.dungeons.find((x) => x.id === QUEST);
  return d?.special.find((s) => s.id === QLOCATE)?.dlevel ?? null;
}

/**
 * The main dungeon's end of the Quest's branch (its portal level), or null in a game without
 * the Quest. ref: src/dungeon.c dungeon_branch("The Quest") end1
 */
export function questEntry(state: Readonly<GameState>): LevelRef | null {
  for (const d of state.dungeons) {
    const b = d.branches.find((x) => x.to === QUEST);
    if (b) return { dungeon: d.id, dlevel: b.dlevel };
  }
  return null;
}

/**
 * Whether `level` (the hero's by default) is the main dungeon's end of the Quest's branch.
 * ref: src/dungeon.c at_dgn_entrance("The Quest")
 */
export function atQuestEntrance(
  state: Readonly<GameState>,
  level?: Readonly<Level> | LevelRef,
): boolean {
  const ref = level ?? state.levels[state.currentLevel];
  const e = questEntry(state);
  return !!ref && !!e && ref.dungeon === e.dungeon && ref.dlevel === e.dlevel;
}

/**
 * The deepest Quest level the hero has reached (levels exist once visited); 0 before any.
 * ref: src/dungeon.c dunlev_reached() (dunlev_ureached of the Quest)
 */
export function questDunlevReached(state: Readonly<GameState>): number {
  let n = 0;
  for (const id of Object.keys(state.levels).sort()) {
    const lv = state.levels[id];
    if (lv?.dungeon === QUEST && lv.dlevel > n) n = lv.dlevel;
  }
  return n;
}

/**
 * Whether `level` is the last level of its dungeon (DUNGEON_BOTTOM and below for an endless one).
 * ref: src/dungeon.c Is_botlevel()
 */
export const isBotlevel = (state: Readonly<GameState>, level: Readonly<Level>): boolean =>
  level.dlevel >= (dungeonLayout(state, level.dungeon).levels ?? DUNGEON_BOTTOM);

/** Gehennom: the hellish dungeon below the Castle. */
export const GEHENNOM: DefId = 'nh:gehennom';

/**
 * Gehennom's special levels (SpecialLevelDef ids) in dungeon.lua's order. Until a level's own
 * LevelDef lands, its one variant is Gehennom's filler, so it builds as an ordinary Gehennom
 * level while these predicates already know it by its id. ref: dat/dungeon.lua "Gehennom" levels
 */
export const GEHENNOM_SPECIALS = {
  valley: 'nh:valley',
  sanctum: 'nh:sanctum',
  juiblex: 'nh:juiblex',
  baalz: 'nh:baalz',
  asmodeus: 'nh:asmodeus',
  wizard1: 'nh:wizard1',
  wizard2: 'nh:wizard2',
  wizard3: 'nh:wizard3',
  orcus: 'nh:orcus',
  fakewiz1: 'nh:fakewiz1',
  fakewiz2: 'nh:fakewiz2',
} as const;

/**
 * The Gehennom special level on `level` (the hero's by default), or null on an ordinary level,
 * outside Gehennom and in a game without the layout (made before m17).
 * ref: src/dungeon.c Is_special() for the levels of dungeon.lua's "Gehennom"
 */
export function gehennomSpecial(
  state: Readonly<GameState>,
  level?: Readonly<Level> | LevelRef,
): DefId | null {
  const ref = level ?? state.levels[state.currentLevel];
  if (!ref || !HELLISH.includes(ref.dungeon)) return null;
  return specialLevelAt(state, { dungeon: ref.dungeon, dlevel: ref.dlevel })?.id ?? null;
}

/** The Valley of the Dead, Gehennom's first level. ref: include/dungeon.h Is_valley() */
export const isValley = (state: Readonly<GameState>, level?: Readonly<Level> | LevelRef): boolean =>
  gehennomSpecial(state, level) === GEHENNOM_SPECIALS.valley;

/** Moloch's Sanctum, Gehennom's last level. ref: include/dungeon.h Is_sanctum() */
export const isSanctum = (
  state: Readonly<GameState>,
  level?: Readonly<Level> | LevelRef,
): boolean => gehennomSpecial(state, level) === GEHENNOM_SPECIALS.sanctum;

/**
 * The level above Gehennom's bottom, with the vibrating square and no down stairs (any game
 * with a Gehennom, the layout's special levels or not). ref: src/dungeon.c Invocation_lev()
 */
export function invocationLev(
  state: Readonly<GameState>,
  level?: Readonly<Level> | LevelRef,
): boolean {
  const ref = level ?? state.levels[state.currentLevel];
  if (!ref || !HELLISH.includes(ref.dungeon)) return false;
  const n = dungeonLayout(state, ref.dungeon).levels;
  return n !== null && ref.dlevel === n - 1;
}

/**
 * A level holding the Wizard's Tower: wizard1, wizard2 or wizard3 (by its special level id, as
 * C's Is_wiz1_level()...). ref: src/dungeon.c On_W_tower_level()
 */
export function onWTowerLevel(
  state: Readonly<GameState>,
  level?: Readonly<Level> | LevelRef,
): boolean {
  const sp = gehennomSpecial(state, level);
  return (
    sp === GEHENNOM_SPECIALS.wizard1 ||
    sp === GEHENNOM_SPECIALS.wizard2 ||
    sp === GEHENNOM_SPECIALS.wizard3
  );
}

/**
 * Whether (x, y) of `level` is inside the Wizard's Tower: on a tower level built with its tower
 * (a stand-in of an older game has no boundary), within the exclusion of its teleport region.
 * ref: src/dungeon.c In_W_tower()
 */
export function inWTower(
  state: Readonly<GameState>,
  level: Readonly<Level> | undefined,
  x: number,
  y: number,
): boolean {
  if (!level || !onWTowerLevel(state, level)) return false;
  const b = madeLevelFlags(state, level.id).wtower;
  return !!b && x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
}

/** The hellish dungeons (dungeon.lua flags "hellish"). */
const HELLISH: readonly DefId[] = [GEHENNOM];

/** Whether `level` (the hero's by default) is in Gehennom. ref: src/dungeon.c In_hell(), Inhell */
export function inHell(state: Readonly<GameState>, level?: Readonly<Level>): boolean {
  const dungeon = level?.dungeon ?? state.levels[state.currentLevel]?.dungeon;
  return dungeon !== undefined && HELLISH.includes(dungeon);
}

/**
 * The gateway to Gehennom, its first level, or null in a game without it (old saves, other
 * mods' dungeons). ref: src/dungeon.c find_hell()
 */
export function findHell(state: Readonly<GameState>): LevelRef | null {
  const d = state.dungeons.find((x) => HELLISH.includes(x.id));
  return d ? { dungeon: d.id, dlevel: 1 } : null;
}

/**
 * Whether `level` is the stronghold: the Castle that Gehennom branches from. Its trap doors lead
 * to Gehennom (find_hell()). A Castle elsewhere (a test dungeon, an old save without Gehennom) is
 * an ordinary bottom level. ref: src/dungeon.c Is_stronghold()
 */
export function isStronghold(state: Readonly<GameState>, level: Readonly<Level>): boolean {
  if (level.def !== CASTLE) return false;
  const d = state.dungeons.find((x) => x.id === level.dungeon);
  return d?.branches.some((b) => b.dlevel === level.dlevel && HELLISH.includes(b.to)) === true;
}

/**
 * The depth of Medusa's level in this game, or Infinity when it has none (old saves): shops are
 * made only above it. ref: src/mklev.c makelevel() `u_depth < depth(&medusa_level)`
 */
export function medusaDepth(state: Readonly<GameState>): number {
  for (const d of state.dungeons) {
    const sp = d.special.find((s) => s.id === MEDUSA);
    if (sp) return d.depthStart + sp.dlevel - 1;
  }
  return Infinity;
}

/**
 * The depth of the stronghold (the Castle Gehennom branches from) in this game, or Infinity when
 * it has none (a test dungeon, an old save). ref: src/dungeon.c stronghold_level
 */
export function strongholdDepth(state: Readonly<GameState>): number {
  for (const d of state.dungeons) {
    const sp = d.special.find((s) => s.id === CASTLE);
    if (sp && d.branches.some((b) => b.dlevel === sp.dlevel && HELLISH.includes(b.to)))
      return d.depthStart + sp.dlevel - 1;
  }
  return Infinity;
}

/** The special level id of Medusa's island in the dungeon layout. */
const MEDUSA: DefId = 'nh:medusa';

/**
 * The Rogue level's LevelDef (rogue.ts). Its special level in the main dungeon is `nh:rogue`, as
 * dungeon.lua names it; the LevelDef needs another id, the rogue monster's being `nh:rogue`.
 */
export const ROGUE: DefId = 'nh:rogue-level';
/** Fort Ludios's level: its LevelDef and its special level (knox.ts). */
export const KNOX: DefId = 'nh:knox';
/** Fort Ludios's dungeon, a branch of one level reached by a magic portal. */
export const LUDIOS: DefId = 'nh:ludios';

/** Whether `level` is the Rogue level. ref: include/dungeon.h Is_rogue_level() */
export const isRogueLevel = (level: Readonly<Level> | undefined): boolean => level?.def === ROGUE;

/**
 * What a found secret door (`id`) becomes: on the Rogue level a doorway ("rogue didn't have doors,
 * only doorways"), elsewhere a door that keeps its lock (a newly exposed door is closed); a
 * doorway has no trap. ref: src/detect.c cvt_sdoor_to_door()
 */
export function cvtSdoorToDoor(level: Readonly<Level>, id: DefId | undefined): DefId {
  if (isRogueLevel(level)) return T.doorway;
  return id === T.sdoor_locked_v || id === T.sdoor_locked_h ? T.door_locked : T.door_closed;
}

/**
 * Whether a branch of the layout ends on `level`: stairs leaving it for a branch dungeon (Fort
 * Ludios's rolled level aside: C makes that end bogus until its portal is placed, so
 * Is_branchlev() never finds it), or a branch dungeon's entry level. ref: src/dungeon.c
 * Is_branchlev()
 */
export function isBranchlev(
  state: Readonly<GameState>,
  level: Readonly<Pick<Level, 'dungeon' | 'dlevel'>>,
): boolean {
  for (const d of state.dungeons) {
    for (const b of d.branches) {
      if (d.id === level.dungeon && b.dlevel === level.dlevel && b.to !== LUDIOS) return true;
      if (b.to !== level.dungeon) continue;
      const child = state.dungeons.find((c) => c.id === b.to);
      if (child && level.dlevel === (child.entry ?? 1)) return true;
    }
  }
  return false;
}

/** Vlad's Tower: three levels above a Gehennom level, climbed by ladders. ref: dat/dungeon.lua */
export const VLAD: DefId = 'nh:vlad';
/** The Elemental Planes: the endgame dungeon above DL1 (m23b builds its levels). */
export const PLANES: DefId = 'nh:planes';

/** Vlad's Tower's levels, top first: their special levels' and LevelDefs' ids (tower.ts). */
export const TOWER_LEVELS = {
  tower1: 'nh:tower1',
  tower2: 'nh:tower2',
  tower3: 'nh:tower3',
} as const;

/**
 * The Elemental Planes' special levels in dungeon.lua's order (Astral at the top, the dummy
 * level below Earth). Their ids are not the levels' names, which are terrains or objects
 * (`nh:water`). ref: dat/dungeon.lua "The Elemental Planes" levels
 */
export const PLANE_LEVELS = {
  astral: 'nh:plane-astral',
  water: 'nh:plane-water',
  fire: 'nh:plane-fire',
  air: 'nh:plane-air',
  earth: 'nh:plane-earth',
  dummy: 'nh:plane-dummy',
} as const;

/** Whether `level` (the hero's by default) is on the Planes. ref: src/dungeon.c In_endgame() */
export function inEndgame(state: Readonly<GameState>, level?: Readonly<Level> | LevelRef): boolean {
  const ref = level ?? state.levels[state.currentLevel];
  return ref?.dungeon === PLANES;
}

/** Whether `level` (the hero's by default) is the Astral Plane. ref: Is_astralevel() */
export function isAstral(state: Readonly<GameState>, level?: Readonly<Level> | LevelRef): boolean {
  return planeLevel(state, level) === PLANE_LEVELS.astral;
}

/** The Planes' special level of `level` (the hero's by default), or null off the Planes. */
function planeLevel(state: Readonly<GameState>, level?: Readonly<Level> | LevelRef): DefId | null {
  const ref = level ?? state.levels[state.currentLevel];
  if (ref?.dungeon !== PLANES) return null;
  return specialLevelAt(state, { dungeon: ref.dungeon, dlevel: ref.dlevel })?.id ?? null;
}

/** Whether `level` (the hero's by default) is the Plane of Earth. ref: Is_earthlevel() */
export const isEarthLevel = (state: Readonly<GameState>, level?: Readonly<Level> | LevelRef) =>
  planeLevel(state, level) === PLANE_LEVELS.earth;
/** Whether `level` (the hero's by default) is the Plane of Fire. ref: Is_firelevel() */
export const isFireLevel = (state: Readonly<GameState>, level?: Readonly<Level> | LevelRef) =>
  planeLevel(state, level) === PLANE_LEVELS.fire;
/** Whether `level` (the hero's by default) is the Plane of Air. ref: Is_airlevel() */
export const isAirLevel = (state: Readonly<GameState>, level?: Readonly<Level> | LevelRef) =>
  planeLevel(state, level) === PLANE_LEVELS.air;
/** Whether `level` (the hero's by default) is the Plane of Water. ref: Is_waterlevel() */
export const isWaterLevel = (state: Readonly<GameState>, level?: Readonly<Level> | LevelRef) =>
  planeLevel(state, level) === PLANE_LEVELS.water;

/**
 * Whether monster kind `id` is an elemental on its own plane (`level`, the hero's by default):
 * an air elemental on Air, fire on Fire, earth on Earth, water on Water.
 * ref: src/makemon.c is_home_elemental()
 */
export function isHomeElemental(
  state: Readonly<GameState>,
  id: DefId,
  level?: Readonly<Level> | LevelRef,
): boolean {
  const home = HOME_PLANE[id];
  return home !== undefined && planeLevel(state, level) === home;
}

/** The elementals' home planes. */
const HOME_PLANE: Readonly<Record<DefId, DefId>> = {
  'nh:air_elemental': PLANE_LEVELS.air,
  'nh:fire_elemental': PLANE_LEVELS.fire,
  'nh:earth_elemental': PLANE_LEVELS.earth,
  'nh:water_elemental': PLANE_LEVELS.water,
};

/** Whether `level` (the hero's by default) is in Vlad's Tower. ref: src/dungeon.c In_V_tower() */
export function inVladsTower(
  state: Readonly<GameState>,
  level?: Readonly<Level> | LevelRef,
): boolean {
  const ref = level ?? state.levels[state.currentLevel];
  return ref?.dungeon === VLAD;
}

/** Whether `level` is Fort Ludios. ref: include/dungeon.h Is_knox() */
export const isKnox = (level: Readonly<Level> | undefined): boolean => level?.def === KNOX;

/**
 * Whether `level` is the only level of its branch: "Fort Ludios is the only single level branch
 * in the dungeon". ref: src/dungeon.c single_level_branch()
 */
export const singleLevelBranch = (level: Readonly<Level> | undefined): boolean => isKnox(level);
