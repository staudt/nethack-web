// The Castle (the stronghold): a moated fortress in a maze, with its drawbridge, four
// storerooms, the wand of wishing in one of its towers, soldiers, dragons, sea monsters and the
// court of its throne room. ref: dat/castle.lua; src/mkmaze.c fixup_special() (Is_stronghold)
//
// Translation notes (see DEVIATIONS.md "The Castle"): the maze grid, the map, the doors, the
// fountain, the teleport regions and the lit, unlit and typed regions are LevelDef data (the
// throne room is a court that is not stocked, C's `filled = 2`; the barracks are stocked by
// zoo.ts); "noteleport", "mazelevel" and the non_diggable area are levelflags.ts entries. The
// fixup does what depends on the shuffled class lists and on the maze: the contents in the
// script's order, the two stocked maze walks, the drawbridge (closed, facing east: dbridge.ts)
// and the up stairs in their region of the left-hand maze, which only exists once walked (core
// puts them on a fixed spot of the courtyard first). The stronghold is a graveyard level (undead
// seldom leave corpses: graveyard.ts).
import type { Ctx, DefId, Level, LevelContent, LevelDef, LevelRect, Pos } from '@nh/core';
import { VANILLA_TERRAIN, levelDefRect, trapAt, wallifyLevel } from '@nh/core';
import { boulderAt } from './boulder';
import { setBoxTrapped } from './btrapstate';
import { createDrawbridge } from './dbridge';
import { CASTLE } from './dbstate';
import { setGraveyard } from './graveyard';
import { isStronghold } from './levelflags';
import { mazewalk } from './mazewalk';
import { mksobjFull } from './mkobj';
import {
  addToStatue,
  deleteContents,
  desEngraving,
  makeContents,
  mapToLevel,
  rndcoord,
  shuffle,
  type SpLevFixup,
} from './sp_lev';
import { T, setTerrain, terrainIdAt } from './terrain';
import { mAt } from './wormstate';
import { BARRACKS, COURT } from './zoo';

const MAP: readonly string[] = [
  '}}}}}}}}}.............................................}}}}}}}}}',
  '}-------}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}-------}',
  '}|.....|-----------------------------------------------|.....|}',
  '}|.....+...............................................+.....|}',
  '}-------------------------------+-----------------------------}',
  '}}}}}}|........|..........+...........|.......S.S.......|}}}}}}',
  '.....}|........|..........|...........|.......|.|.......|}.....',
  '.....}|........------------...........---------S---------}.....',
  '.....}|...{....+..........+.........\\.S.................+......',
  '.....}|........------------...........---------S---------}.....',
  '.....}|........|..........|...........|.......|.|.......|}.....',
  '}}}}}}|........|..........+...........|.......S.S.......|}}}}}}',
  '}-------------------------------+-----------------------------}',
  '}|.....+...............................................+.....|}',
  '}|.....|-----------------------------------------------|.....|}',
  '}-------}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}-------}',
  '}}}}}}}}}.............................................}}}}}}}}}',
];

const lit = (area: LevelRect) => ({ area, lit: true });
const unlit = (area: LevelRect) => ({ area, lit: false });

/** Where core first puts the up stairs: the left courtyard (the fixup moves them). */
const UP_PLACEHOLDER: Pos = { x: 0, y: 8 };

/** ref: dat/castle.lua */
export const CASTLE_LEVEL: LevelDef = {
  id: CASTLE,
  // des.level_init({ style="mazegrid", bg ="-" })
  init: { style: 'mazegrid', bg: VANILLA_TERRAIN.hwall },
  map: { rows: [...MAP] },
  teleportRegions: [
    { area: [0, 0, 9, 20], coords: 'level', exclude: [1, 1, 61, 15], dir: 'down' },
    { area: [68, 0, 78, 20], coords: 'level', exclude: [1, 1, 61, 15], dir: 'up' },
  ],
  // des.levregion({ region = {01,00,10,20}, region_islev=1, exclude={0,0,62,16},
  // type="stair-up" }): the fixup's, once the maze is walked
  stairs: { up: UP_PLACEHOLDER },
  features: [{ kind: 'fountain', x: 10, y: 8 }],
  doors: [
    { x: 7, y: 3, state: 'closed' },
    { x: 55, y: 3, state: 'closed' },
    { x: 32, y: 4, state: 'locked' },
    { x: 26, y: 5, state: 'locked' },
    { x: 46, y: 5, state: 'locked' },
    { x: 48, y: 5, state: 'locked' },
    { x: 47, y: 7, state: 'locked' },
    { x: 15, y: 8, state: 'closed' },
    { x: 26, y: 8, state: 'closed' },
    { x: 38, y: 8, state: 'locked' },
    { x: 56, y: 8, state: 'locked' },
    { x: 47, y: 9, state: 'locked' },
    { x: 26, y: 11, state: 'locked' },
    { x: 46, y: 11, state: 'locked' },
    { x: 48, y: 11, state: 'locked' },
    { x: 32, y: 12, state: 'locked' },
    { x: 7, y: 13, state: 'closed' },
    { x: 55, y: 13, state: 'closed' },
  ],
  regions: [
    // Entire castle area
    unlit([0, 0, 62, 16]),
    // Courtyards
    lit([0, 5, 5, 11]),
    lit([57, 5, 62, 11]),
    // Throne room: a court, not stocked (filled = 2: the room kind and level flags only)
    { area: [27, 5, 37, 11], lit: true, type: COURT, filled: false },
    // Antechamber
    lit([7, 5, 14, 11]),
    // Storerooms
    lit([39, 5, 45, 6]),
    lit([39, 10, 45, 11]),
    lit([49, 5, 55, 6]),
    lit([49, 10, 55, 11]),
    // Corners
    lit([2, 2, 6, 3]),
    lit([56, 2, 60, 3]),
    lit([2, 13, 6, 14]),
    lit([56, 13, 60, 14]),
    // Barracks
    { area: [16, 5, 25, 6], lit: true, type: BARRACKS, filled: true },
    { area: [16, 10, 25, 11], lit: true, type: BARRACKS, filled: true },
    // Hallways
    unlit([8, 3, 54, 3]),
    unlit([8, 13, 54, 13]),
    unlit([16, 8, 25, 8]),
    unlit([39, 8, 55, 8]),
    // Storeroom alcoves
    unlit([47, 5, 47, 6]),
    unlit([47, 10, 47, 11]),
  ],
};

const monAt = (id: string, x: number, y: number): LevelContent => ({
  kind: 'monster',
  id: id as DefId,
  x,
  y,
});
const clsAt = (c: string, x: number, y: number): LevelContent => ({
  kind: 'monster',
  class: c,
  x,
  y,
});
const objAt = (cls: string, x: number, y: number): LevelContent => ({
  kind: 'object',
  class: cls,
  x,
  y,
});

/** des.object("[") and so on: the storerooms' classes. */
const OBJECT_CLASSES = ['armor', 'weapon', 'gem', 'food'] as const;

/** The court's classes. */
const COURT_CLASSES = ['L', 'N', 'E', 'H', 'M', 'O', 'R', 'T', 'X', 'Z'] as const;

/** Each storeroom: two rows of seven objects of its class, row by row. */
function storeroom(cls: string, x1: number, y1: number): LevelContent[] {
  const out: LevelContent[] = [];
  for (let y = y1; y <= y1 + 1; y++) for (let x = x1; x <= x1 + 6; x++) out.push(objAt(cls, x, y));
  return out;
}

/**
 * The wand of wishing in one of the four towers: a locked, untrapped chest holding only a wand of
 * wishing and a potion of gain level, a burned "Elbereth" under it (guarding no objects:
 * des.engraving()'s default) and on it a cursed scroll of scare monster.
 * ref: dat/castle.lua; src/sp_lev.c lspo_engraving(), create_object() (SP_OBJ_CONTAINER:
 * delete_contents(), then the contents; `locked`, `trapped`, `buc`)
 */
function wishingChest(ctx: Ctx, level: Level, def: LevelDef): void {
  const place = [
    { x: 4, y: 2 },
    { x: 58, y: 2 },
    { x: 4, y: 14 },
    { x: 58, y: 14 },
  ];
  const loc = rndcoord(ctx, place);
  const p = mapToLevel(def, level, loc.x, loc.y);
  const at = { level: level.id, x: p.x, y: p.y };
  const gen = { level: level.id, inMklev: true };
  const chest = mksobjFull(ctx, ctx.defs.object('nh:chest'), { at }, gen);
  const box = ctx.state.entities[String(chest)]?.c.item;
  if (box) {
    box.locked = true;
    delete box.broken;
  }
  setBoxTrapped(ctx, chest, false);
  deleteContents(ctx, chest);
  for (const id of ['nh:wand_of_wishing', 'nh:potion_of_gain_level'] as const)
    addToStatue(ctx, chest, mksobjFull(ctx, ctx.defs.object(id), { init: true }, gen));
  // des.engraving({ coord = loc, type="burn", text="Elbereth" }), before the scroll
  desEngraving(ctx, level, def, loc, 'burn', 'Elbereth');
  const scroll = mksobjFull(ctx, ctx.defs.object('nh:scroll_of_scare_monster'), { at }, gen);
  const it = ctx.state.entities[String(scroll)]?.c.item;
  if (it) it.buc = 'cursed';
}

/**
 * des.levregion({ type = "stair-up", region = {01,00,10,20}, region_islev = 1,
 * exclude = {0,0,62,16} }): the up stairs leave core's spot for a random floor or corridor spot
 * of the region outside the castle (200 tries, then the first in column order), no trap, boulder
 * or monster on it. ref: src/mkmaze.c place_lregion(), put_lregion_here(), bad_location()
 */
function placeUpStairs(ctx: Ctx, level: Level, def: LevelDef): void {
  const up = level.up;
  if (!up) return;
  setTerrain(level, up.x, up.y, T.floor);
  const [lx, ly, hx, hy] = levelDefRect(
    def,
    level.width,
    level.height,
    [0, 0, 9, 20],
    'level',
    'castle up stairs',
  );
  const ex = levelDefRect(
    def,
    level.width,
    level.height,
    [0, 0, 62, 16],
    'map',
    'castle up stairs',
  );
  const occupied = (x: number, y: number): boolean =>
    mAt(ctx.state, level.id, x, y) !== null || boulderAt(ctx, level.id, x, y) !== null;
  const good = (x: number, y: number): boolean => {
    if (x >= ex[0] && x <= ex[2] && y >= ex[1] && y <= ex[3]) return false;
    const id = terrainIdAt(level, x, y);
    return (id === T.floor || id === T.corr) && !trapAt(level, x, y) && !occupied(x, y);
  };
  let p: Pos | null = null;
  for (let trycnt = 0; trycnt < 200 && !p; trycnt++) {
    const x = lx + ctx.rng.rn2(hx - lx + 1);
    const y = ly + ctx.rng.rn2(hy - ly + 1);
    if (good(x, y)) p = { x, y };
  }
  for (let x = lx; x <= hx && !p; x++)
    for (let y = ly; y <= hy && !p; y++) if (good(x, y)) p = { x, y };
  const to = p ?? up; // (no spot: they stay where core put them)
  setTerrain(level, to.x, to.y, T.stairs_up);
  level.up = { ...to };
}

/** The Castle's fixup: the contents in the script's order, the maze, the drawbridge, the stairs. */
export const CASTLE_FIXUP: SpLevFixup = {
  before(ctx, level, def) {
    // ref: src/mkmaze.c fixup_special(): `else if (Is_stronghold(&u.uz)) graveyard = 1`
    if (isStronghold(ctx.state, level)) setGraveyard(ctx, level.id);
    // Random registers initialisation
    const object = [...OBJECT_CLASSES];
    shuffle(ctx, object);
    const monster = [...COURT_CLASSES];
    shuffle(ctx, monster);
    const o = (i: number): string => object[i - 1] as string;
    const m = (i: number): string => monster[i - 1] as string;
    makeContents(ctx, level, def, [
      ...storeroom(o(1), 39, 5),
      ...storeroom(o(2), 49, 5),
      ...storeroom(o(3), 39, 10),
      ...storeroom(o(4), 49, 10),
    ]);
    wishingChest(ctx, level, def);
    const court: [number, number, number][] = [
      [10, 27, 5],
      [1, 30, 5],
      [2, 33, 5],
      [3, 36, 5],
      [4, 28, 6],
      [5, 31, 6],
      [6, 34, 6],
      [7, 37, 6],
      [8, 27, 7],
      [9, 30, 7],
      [10, 33, 7],
      [1, 36, 7],
      [2, 28, 8],
      [3, 31, 8],
      [4, 34, 8],
      [5, 27, 9],
      [6, 30, 9],
      [7, 33, 9],
      [8, 36, 9],
      [9, 28, 10],
      [10, 31, 10],
      [1, 34, 10],
      [2, 37, 10],
      [3, 27, 11],
      [4, 30, 11],
      [5, 33, 11],
      [6, 36, 11],
    ];
    makeContents(ctx, level, def, [
      // The treasure of the lord
      { kind: 'object', id: 'nh:chest', x: 37, y: 8 },
      // Traps
      ...[40, 44, 48, 52, 55].map((x): LevelContent => ({
        kind: 'trap',
        id: 'nh:trap_door',
        x,
        y: 8,
      })),
      // Soldiers guarding the entry hall
      monAt('nh:soldier', 8, 6),
      monAt('nh:soldier', 9, 5),
      monAt('nh:soldier', 11, 5),
      monAt('nh:soldier', 12, 6),
      monAt('nh:soldier', 8, 10),
      monAt('nh:soldier', 9, 11),
      monAt('nh:soldier', 11, 11),
      monAt('nh:soldier', 12, 10),
      monAt('nh:lieutenant', 9, 8),
      // Soldiers guarding the towers
      monAt('nh:soldier', 3, 2),
      monAt('nh:soldier', 5, 2),
      monAt('nh:soldier', 57, 2),
      monAt('nh:soldier', 59, 2),
      monAt('nh:soldier', 3, 14),
      monAt('nh:soldier', 5, 14),
      monAt('nh:soldier', 57, 14),
      monAt('nh:soldier', 59, 14),
      // The four dragons that are guarding the storerooms
      clsAt('D', 47, 5),
      clsAt('D', 47, 6),
      clsAt('D', 47, 10),
      clsAt('D', 47, 11),
      // Sea monsters in the moat
      monAt('nh:giant_eel', 5, 7),
      monAt('nh:giant_eel', 5, 9),
      monAt('nh:giant_eel', 57, 7),
      monAt('nh:giant_eel', 57, 9),
      monAt('nh:shark', 5, 0),
      monAt('nh:shark', 5, 16),
      monAt('nh:shark', 57, 0),
      monAt('nh:shark', 57, 16),
      // The throne room and the court monsters
      ...court.map(([i, x, y]) => clsAt(m(i), x, y)),
    ]);
    // MazeWalks (stocked: fill_empty_maze() after each)
    mazewalk(ctx, level, def, 0, 10, 'west');
    mazewalk(ctx, level, def, 62, 6, 'east');
    wallifyLevel(level, VANILLA_TERRAIN);
    // The drawbridge (made after the walls are joined: they count it as a wall, as IS_WALL())
    const db = mapToLevel(def, level, 5, 8);
    createDrawbridge(ctx, level, db.x, db.y, 'east', false);
    placeUpStairs(ctx, level, def);
  },
};
