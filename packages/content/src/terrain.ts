// ref: include/defsym.h PCHAR2 entries (cmap symbols); default chars and colors match NetHack.
import {
  cellIndex,
  type Ctx,
  type DefId,
  type Level,
  type Registry,
  type TerrainDef,
} from '@nh/core';

const GRAY = '#aaaaaa';
const BROWN = '#aa5500';
const BLACK = '#000000';
const WHITE = '#ffffff';
const GREEN = '#33aa33';
const BRIGHT_BLUE = '#5555ff';
const CYAN = '#33bbbb';
const YELLOW = '#ffff55';
const BLUE = '#4466ff';
const RED = '#cc3333';
const ORANGE = '#ff8800';

export const TERRAIN: readonly TerrainDef[] = [
  // ref: defsym.h S_stone ' ' (NO_COLOR)
  {
    id: 'nh:stone',
    nameKey: 'terrain.stone',
    passable: false,
    opaque: true,
    glyph: { ch: ' ', fg: BLACK },
  },
  // ref: defsym.h S_vwall '|', S_hwall '-', S_tlcorn/S_trcorn/S_blcorn/S_brcorn '-'
  {
    id: 'nh:vwall',
    nameKey: 'terrain.wall',
    passable: false,
    opaque: true,
    glyph: { ch: '|', fg: GRAY },
  },
  {
    id: 'nh:hwall',
    nameKey: 'terrain.wall',
    passable: false,
    opaque: true,
    glyph: { ch: '-', fg: GRAY },
  },
  {
    id: 'nh:tlcorn',
    nameKey: 'terrain.wall',
    passable: false,
    opaque: true,
    glyph: { ch: '-', fg: GRAY },
  },
  {
    id: 'nh:trcorn',
    nameKey: 'terrain.wall',
    passable: false,
    opaque: true,
    glyph: { ch: '-', fg: GRAY },
  },
  {
    id: 'nh:blcorn',
    nameKey: 'terrain.wall',
    passable: false,
    opaque: true,
    glyph: { ch: '-', fg: GRAY },
  },
  {
    id: 'nh:brcorn',
    nameKey: 'terrain.wall',
    passable: false,
    opaque: true,
    glyph: { ch: '-', fg: GRAY },
  },
  // ref: defsym.h S_crwall '-', S_tuwall '-', S_tdwall '-', S_tlwall '|', S_trwall '|'
  // (T-walls of cave maps; ref: src/mkmaze.c fix_wall_spines())
  ...(
    [
      ['nh:crwall', '-'],
      ['nh:tuwall', '-'],
      ['nh:tdwall', '-'],
      ['nh:tlwall', '|'],
      ['nh:trwall', '|'],
    ] as const
  ).map(([id, ch]): TerrainDef => ({
    id,
    nameKey: 'terrain.wall',
    passable: false,
    opaque: true,
    glyph: { ch, fg: GRAY },
  })),
  // ref: defsym.h S_room '.' (CLR_GRAY)
  {
    id: 'nh:floor',
    nameKey: 'terrain.floor',
    passable: true,
    opaque: false,
    glyph: { ch: '.', fg: GRAY },
  },
  // ref: defsym.h S_corr '#' (CLR_GRAY)
  {
    id: 'nh:corr',
    nameKey: 'terrain.corr',
    passable: true,
    opaque: false,
    glyph: { ch: '#', fg: GRAY },
  },
  // ref: defsym.h S_ndoor '.' (CLR_GRAY), "doorway"
  {
    id: 'nh:doorway',
    nameKey: 'terrain.doorway',
    passable: true,
    opaque: false,
    door: 'doorway',
    glyph: { ch: '.', fg: GRAY },
  },
  // ref: defsym.h S_vodoor '-' (open door in vertical wall), S_hodoor '|' (horizontal wall), CLR_BROWN
  {
    id: 'nh:door_open_v',
    nameKey: 'terrain.door_open',
    passable: true,
    opaque: false,
    door: 'open',
    glyph: { ch: '-', fg: BROWN },
  },
  {
    id: 'nh:door_open_h',
    nameKey: 'terrain.door_open',
    passable: true,
    opaque: false,
    door: 'open',
    glyph: { ch: '|', fg: BROWN },
  },
  // ref: defsym.h S_vcdoor/S_hcdoor '+' (CLR_BROWN)
  {
    id: 'nh:door_closed',
    nameKey: 'terrain.door_closed',
    passable: false,
    opaque: true,
    door: 'closed',
    glyph: { ch: '+', fg: BROWN },
  },
  // A locked door looks like any closed door (ref: defsym.h S_vcdoor/S_hcdoor, rm.h D_LOCKED).
  {
    id: 'nh:door_locked',
    nameKey: 'terrain.door_closed',
    passable: false,
    opaque: true,
    door: 'locked',
    glyph: { ch: '+', fg: BROWN },
    looksLike: 'nh:door_closed',
  },
  // ref: defsym.h S_upstair '<' (CLR_GRAY)
  {
    id: 'nh:stairs_up',
    nameKey: 'terrain.stairs_up',
    passable: true,
    opaque: false,
    stairs: 'up',
    glyph: { ch: '<', fg: GRAY },
  },
  // ref: defsym.h S_dnstair '>' (CLR_GRAY)
  {
    id: 'nh:stairs_down',
    nameKey: 'terrain.stairs_down',
    passable: true,
    opaque: false,
    stairs: 'down',
    glyph: { ch: '>', fg: GRAY },
  },
  // Secret doors and corridors look like what they hide (ref: defsym.h S_vwall/S_hwall/S_stone).
  {
    id: 'nh:sdoor_v',
    nameKey: 'terrain.wall',
    passable: false,
    opaque: true,
    glyph: { ch: '|', fg: GRAY },
    looksLike: 'nh:vwall',
  },
  {
    id: 'nh:sdoor_h',
    nameKey: 'terrain.wall',
    passable: false,
    opaque: true,
    glyph: { ch: '-', fg: GRAY },
    looksLike: 'nh:hwall',
  },
  // Locked secret doors (ref: mklev.c dosdoor() SDOOR branch, doormask D_LOCKED).
  {
    id: 'nh:sdoor_locked_v',
    nameKey: 'terrain.wall',
    passable: false,
    opaque: true,
    glyph: { ch: '|', fg: GRAY },
    looksLike: 'nh:vwall',
  },
  {
    id: 'nh:sdoor_locked_h',
    nameKey: 'terrain.wall',
    passable: false,
    opaque: true,
    glyph: { ch: '-', fg: GRAY },
    looksLike: 'nh:hwall',
  },
  {
    id: 'nh:scorr',
    nameKey: 'terrain.stone',
    passable: false,
    opaque: true,
    glyph: { ch: ' ', fg: BLACK },
    looksLike: 'nh:stone',
  },
  // Dungeon features of special levels. ref: defsym.h S_tree '#' (CLR_GREEN), S_sink '{'
  // (CLR_WHITE), S_fountain '{' (CLR_BRIGHT_BLUE), S_altar '_' (CLR_GRAY); rm.h IS_OBSTRUCTED()
  // covers trees (they block movement and sight), the others are walkable ground (SPACE_POS).
  {
    id: 'nh:fountain',
    nameKey: 'terrain.fountain',
    passable: true,
    opaque: false,
    glyph: { ch: '{', fg: BRIGHT_BLUE },
  },
  {
    id: 'nh:sink',
    nameKey: 'terrain.sink',
    passable: true,
    opaque: false,
    glyph: { ch: '{', fg: WHITE },
  },
  // ref: defsym.h S_throne '\\' (HI_GOLD = CLR_YELLOW): furniture of throne rooms, walkable
  {
    id: 'nh:throne',
    nameKey: 'terrain.throne',
    passable: true,
    opaque: false,
    glyph: { ch: '\\', fg: YELLOW },
  },
  {
    id: 'nh:tree',
    nameKey: 'terrain.tree',
    passable: false,
    opaque: true,
    glyph: { ch: '#', fg: GREEN },
  },
  // ref: defsym.h S_bars '#' (HI_METAL = CLR_CYAN); rm.h IS_OBSTRUCTED() is false for IRONBARS:
  // they block movement but not sight (Orcish Town's barricades)
  {
    id: 'nh:iron_bars',
    nameKey: 'terrain.iron_bars',
    passable: false,
    opaque: false,
    glyph: { ch: '#', fg: CYAN },
  },
  // Liquids (ref: rm.h POOL, MOAT, WATER, LAVAPOOL, LAVAWALL; src/dbridge.c is_pool(),
  // is_lava()): S_pool '}' (CLR_BLUE) for pools and moats, S_water '}' (CLR_BRIGHT_BLUE) for
  // walls of water, S_lava '}' (CLR_RED), S_lavawall '}' (CLR_ORANGE). The hero and monsters
  // can enter them (none is ACCESSIBLE() in C, but test_move() lets her in); walls of water and
  // lava block sight (ref: src/vision.c does_block()). Names as src/pager.c waterbody_name().
  {
    id: 'nh:pool',
    nameKey: 'terrain.pool',
    passable: true,
    opaque: false,
    liquid: 'water',
    glyph: { ch: '}', fg: BLUE },
  },
  {
    id: 'nh:moat',
    nameKey: 'terrain.moat',
    passable: true,
    opaque: false,
    liquid: 'water',
    glyph: { ch: '}', fg: BLUE },
  },
  {
    id: 'nh:water',
    nameKey: 'terrain.water',
    passable: true,
    opaque: true,
    liquid: 'water',
    glyph: { ch: '}', fg: BRIGHT_BLUE },
  },
  {
    id: 'nh:lava',
    nameKey: 'terrain.lava',
    passable: true,
    opaque: false,
    liquid: 'lava',
    glyph: { ch: '}', fg: RED },
  },
  {
    id: 'nh:lavawall',
    nameKey: 'terrain.lavawall',
    passable: true,
    opaque: true,
    liquid: 'lava',
    glyph: { ch: '}', fg: ORANGE },
  },
  // ref: defsym.h S_ice '.' (CLR_CYAN), S_cloud '#' (CLR_GRAY): walkable; a cloud blocks sight
  {
    id: 'nh:ice',
    nameKey: 'terrain.ice',
    passable: true,
    opaque: false,
    glyph: { ch: '.', fg: CYAN },
  },
  {
    id: 'nh:cloud',
    nameKey: 'terrain.cloud',
    passable: true,
    opaque: true,
    glyph: { ch: '#', fg: GRAY },
  },
  // Drawbridges (ref: include/rm.h DRAWBRIDGE_UP, DRAWBRIDGE_DOWN, DBWALL; src/display.c
  // back_to_glyph()). The raised bridge's span shows what lies under it and is that (C's
  // is_pool(), is_lava() and is_ice() read DB_UNDER of `drawbridgemask`), one terrain per kind
  // (the direction is dbstate.ts's): over the moat it is water (S_pool), over lava lava (S_lava),
  // else ice (S_ice) or floor (S_room). None is ACCESSIBLE() in C, but test_move() lets her in
  // as into water. The lowered bridge is S_vodbridge/S_hodbridge '.' (CLR_BROWN), "lowered
  // drawbridge"; the raised portcullis S_vcdbridge/S_hcdbridge '#' (CLR_BROWN), "raised
  // drawbridge", a wall (IS_WALL()) that blocks sight.
  ...(
    [
      ['nh:drawbridge_up', 'nh:moat', 'water'],
      ['nh:drawbridge_up_lava', 'nh:lava', 'lava'],
      ['nh:drawbridge_up_ice', 'nh:ice', null],
      ['nh:drawbridge_up_floor', 'nh:floor', null],
    ] as const
  ).map(([id, under, liquid]): TerrainDef => ({
    id,
    nameKey: `terrain.${under.slice(3)}`,
    passable: true,
    opaque: false,
    ...(liquid ? { liquid } : {}),
    glyph:
      under === 'nh:moat'
        ? { ch: '}', fg: BLUE }
        : under === 'nh:lava'
          ? { ch: '}', fg: RED }
          : { ch: '.', fg: under === 'nh:ice' ? CYAN : GRAY },
    looksLike: under,
  })),
  ...(['h', 'v'] as const).map((o): TerrainDef => ({
    id: `nh:drawbridge_down_${o}`,
    nameKey: 'terrain.drawbridge_down',
    passable: true,
    opaque: false,
    glyph: { ch: '.', fg: BROWN },
  })),
  ...(['h', 'v'] as const).map((o): TerrainDef => ({
    id: `nh:dbwall_${o}`,
    nameKey: 'terrain.dbwall',
    passable: false,
    opaque: true,
    glyph: { ch: '#', fg: BROWN },
  })),
  // One altar per alignment, all drawn alike; the alignment shows in its name.
  ...(['lawful', 'neutral', 'chaotic', 'unaligned'] as const).map((a): TerrainDef => ({
    id: `nh:altar_${a}`,
    nameKey: 'terrain.altar',
    passable: true,
    opaque: false,
    glyph: { ch: '_', fg: GRAY },
  })),
  // ref: defsym.h S_grave '|' (CLR_WHITE), "grave": furniture (rm.h IS_FURNITURE()), walkable;
  // its headstone is an engraving (grave.ts)
  {
    id: 'nh:grave',
    nameKey: 'terrain.grave',
    passable: true,
    opaque: false,
    glyph: { ch: '|', fg: WHITE },
  },
  // ref: defsym.h S_upladder '<', S_dnladder '>' (CLR_BROWN): the Wizard's Tower's ladders (m17;
  // ladder.ts), stairs for every rule that asks for stairs (On_stairs(), IS_FURNITURE())
  {
    id: 'nh:ladder_up',
    nameKey: 'terrain.ladder_up',
    passable: true,
    opaque: false,
    stairs: 'up',
    glyph: { ch: '<', fg: BROWN },
  },
  {
    id: 'nh:ladder_down',
    nameKey: 'terrain.ladder_down',
    passable: true,
    opaque: false,
    stairs: 'down',
    glyph: { ch: '>', fg: BROWN },
  },
];

/** Short names for terrain ids, for convenient reuse. */
export const T = {
  stone: 'nh:stone',
  vwall: 'nh:vwall',
  hwall: 'nh:hwall',
  tlcorn: 'nh:tlcorn',
  trcorn: 'nh:trcorn',
  blcorn: 'nh:blcorn',
  brcorn: 'nh:brcorn',
  floor: 'nh:floor',
  corr: 'nh:corr',
  doorway: 'nh:doorway',
  door_open_v: 'nh:door_open_v',
  door_open_h: 'nh:door_open_h',
  door_closed: 'nh:door_closed',
  stairs_up: 'nh:stairs_up',
  stairs_down: 'nh:stairs_down',
  sdoor_v: 'nh:sdoor_v',
  sdoor_h: 'nh:sdoor_h',
  scorr: 'nh:scorr',
  door_locked: 'nh:door_locked',
  sdoor_locked_v: 'nh:sdoor_locked_v',
  sdoor_locked_h: 'nh:sdoor_locked_h',
  tuwall: 'nh:tuwall',
  tdwall: 'nh:tdwall',
  tlwall: 'nh:tlwall',
  trwall: 'nh:trwall',
  crwall: 'nh:crwall',
  fountain: 'nh:fountain',
  sink: 'nh:sink',
  throne: 'nh:throne',
  tree: 'nh:tree',
  iron_bars: 'nh:iron_bars',
  pool: 'nh:pool',
  moat: 'nh:moat',
  water: 'nh:water',
  lava: 'nh:lava',
  lavawall: 'nh:lavawall',
  ice: 'nh:ice',
  cloud: 'nh:cloud',
  drawbridge_up: 'nh:drawbridge_up',
  drawbridge_up_lava: 'nh:drawbridge_up_lava',
  drawbridge_up_ice: 'nh:drawbridge_up_ice',
  drawbridge_up_floor: 'nh:drawbridge_up_floor',
  drawbridge_down_h: 'nh:drawbridge_down_h',
  drawbridge_down_v: 'nh:drawbridge_down_v',
  dbwall_h: 'nh:dbwall_h',
  dbwall_v: 'nh:dbwall_v',
  altar_lawful: 'nh:altar_lawful',
  altar_neutral: 'nh:altar_neutral',
  altar_chaotic: 'nh:altar_chaotic',
  altar_unaligned: 'nh:altar_unaligned',
  grave: 'nh:grave',
  ladder_up: 'nh:ladder_up',
  ladder_down: 'nh:ladder_down',
} as const;

const WALL_IDS: ReadonlySet<DefId> = new Set<DefId>([
  T.vwall,
  T.hwall,
  T.tlcorn,
  T.trcorn,
  T.blcorn,
  T.brcorn,
  T.tuwall,
  T.tdwall,
  T.tlwall,
  T.trwall,
  T.crwall,
  T.dbwall_h, // IS_WALL(): STONE < typ <= DBWALL
  T.dbwall_v,
]);
const SDOOR_IDS: ReadonlySet<DefId> = new Set<DefId>([
  T.sdoor_v,
  T.sdoor_h,
  T.sdoor_locked_v,
  T.sdoor_locked_h,
]);

/** ref: include/rm.h IS_WALL(): a wall of any shape (not stone, a secret door or a tree) */
export const isWallId = (id: DefId | undefined): boolean => id !== undefined && WALL_IDS.has(id);
/** ref: include/rm.h `typ == SDOOR` */
export const isSdoorId = (id: DefId | undefined): boolean => id !== undefined && SDOOR_IDS.has(id);
/** ref: include/rm.h IS_STWALL(): stone or a wall */
export const isStwallId = (id: DefId | undefined): boolean => id === T.stone || isWallId(id);
/** ref: include/rm.h IS_OBSTRUCTED(): stone, walls, trees, secret doors and secret corridors */
export const isObstructedId = (id: DefId | undefined): boolean =>
  isStwallId(id) || id === T.tree || isSdoorId(id) || id === T.scorr;

/**
 * ref: include/rm.h IS_FURNITURE(): stairs, ladders, fountains, thrones, sinks, graves and altars
 * here
 */
export const isFurnitureId = (defs: Pick<Registry, 'terrain'>, id: DefId | undefined): boolean =>
  id !== undefined &&
  (id === T.fountain ||
    id === T.throne ||
    id === T.sink ||
    id === T.grave ||
    id.startsWith('nh:altar_') ||
    defs.terrain(id).stairs !== undefined);

/** The terrain id at (x, y) of `level`. */
export const terrainIdAt = (level: Readonly<Level>, x: number, y: number): DefId | undefined =>
  level.palette[level.cells[cellIndex(level, x, y)] ?? -1];

/** Sets a cell to terrain `id`, adding it to the level palette when missing. */
export function setTerrain(level: Level, x: number, y: number, id: DefId): void {
  let pi = level.palette.indexOf(id);
  if (pi === -1) pi = level.palette.push(id) - 1;
  level.cells[cellIndex(level, x, y)] = pi;
}

/**
 * What the hero digs into at (x, y), as a message param. ref: src/dungeon.c surface() for the
 * terrain that exists here (no Underwater "bottom")
 */
export function surfaceKey(
  ctx: Pick<Ctx, 'defs'>,
  level: Readonly<Level>,
  x: number,
  y: number,
): string {
  const id = terrainIdAt(level, x, y);
  // IS_AIR(): a cloud; is_pool() (no Underwater "bottom"), is_ice(), is_lava()
  if (id === T.cloud) return '@surface.cloud';
  if (id === T.pool || id === T.moat || id === T.water || id === T.drawbridge_up)
    return '@surface.water';
  if (id === T.ice || id === T.drawbridge_up_ice) return '@surface.ice';
  if (id === T.lava || id === T.lavawall || id === T.drawbridge_up_lava) return '@surface.lava';
  if (id === T.drawbridge_down_h || id === T.drawbridge_down_v) return '@surface.bridge';
  if (id?.startsWith('nh:altar_') === true) return '@surface.altar';
  if (id === T.grave) return '@surface.headstone';
  if (id === T.fountain) return '@surface.fountain';
  if (id === undefined) return '@surface.ground';
  const t = ctx.defs.terrain(id);
  if (id === T.ladder_up || id === T.ladder_down) return '@surface.ladder';
  if (t.stairs !== undefined) return '@surface.stairs';
  if (isWallId(id) || isSdoorId(id)) return '@surface.wall';
  if (t.door !== undefined) return '@surface.doorway';
  // IS_ROOM(): floor and furniture; corridors and rock are "ground"
  return id === T.corr || id === T.stone || id === T.scorr ? '@surface.ground' : '@surface.floor';
}

/** IS_DOOR() || SDOOR on the eight squares around (x, y). ref: src/mkroom.c nexttodoor() */
export function nexttodoor(ctx: Pick<Ctx, 'defs'>, level: Level, x: number, y: number): boolean {
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= level.width || ny >= level.height) continue;
      const tid = level.palette[level.cells[cellIndex(level, nx, ny)] ?? 0];
      if (tid === undefined) continue;
      if (ctx.defs.terrain(tid).door !== undefined || isSdoorId(tid)) return true;
    }
  return false;
}
