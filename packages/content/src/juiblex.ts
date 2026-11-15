// Juiblex's swamp: a level-wide swamp of moat with two boulder clearings, the lair in its middle
// with its fountain and three giant mimics posing as fountains, Juiblex with lemures and blobby
// monsters, and stairs at either end. ref: dat/juiblex.lua; src/sp_lev.c lvlfill_swamp()
//
// Translation notes (DEVIATIONS.md "Gehennom's lairs (m17)"): the LevelDef is unlit stone with
// the lair as its map (so the swamp room, the teleport regions and the contents are relative to
// it, as in the script) and placeholder stairs; core lays the lair on stone first, and the fixup
// runs the script in its order: the swamp over the whole level, the two clearings with their
// boulders, the lair again over the swamp, the shuffled classes, the fountain and the mimics, the
// fixed contents; the LevelDef's own contents (the unshuffled tail) follow, and the stairs go in
// their level regions last, as fixup_special() places them. The flags ("mazelevel",
// "shortsighted", "temperate") are levelflags.ts entries.
import type { Ctx, DefId, Level, LevelContent, LevelDef, LevelRect, MapBlock, Pos } from '@nh/core';
import { mapBlock, mazeMax } from '@nh/core';
import { mapCleanup } from './hellfill';
import { setTer } from './selection';
import {
  blockDef,
  desLevregion,
  desMap,
  liftStairs,
  makeContents,
  mapToLevel,
  rndcoord,
  shuffle,
  type SpLevFixup,
} from './sp_lev';
import { T, isFurnitureId, setTerrain, terrainIdAt } from './terrain';
import { SWAMP } from './zoo';

/** ref: dat/juiblex.lua: the first des.map(), at the bottom left */
const CLEARING_SW: readonly string[] = ['xxxxxxxx', 'xx...xxx', 'xxx...xx', 'xxxx.xxx', 'xxxxxxxx'];

/** ref: dat/juiblex.lua: the second des.map(), at the top right */
const CLEARING_NE: readonly string[] = ['xxxxxxxx', 'xxxx.xxx', 'xxx...xx', 'xx...xxx', 'xxxxxxxx'];

/** ref: dat/juiblex.lua: the lair */
const LAIR: readonly string[] = [
  'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  'xxxx.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.xxxx',
  'xxx...xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx...xxx',
  'xxxx.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.xxxx',
  'xxxxxxxxxxxxxxxxxxxxxxxx}}}xxxxxxxxxxxxxxx}}}}}xxxx',
  'xxxxxxxxxxxxxxxxxxxxxxx}}}}}xxxxxxxxxxxxx}.....}xxx',
  'xxxxxxxxxxxxxxxxxxxxxx}}...}}xxxxxxxxxxx}..P.P..}xx',
  'xxxxxxxxxxxxxxxxxxxxx}}..P..}}xxxxxxxxxxx}.....}xxx',
  'xxxxxxxxxxxxxxxxxxxxx}}.P.P.}}xxxxxxxxxxxx}...}xxxx',
  'xxxxxxxxxxxxxxxxxxxxx}}..P..}}xxxxxxxxxxxx}...}xxxx',
  'xxxxxxxxxxxxxxxxxxxxxx}}...}}xxxxxxxxxxxxxx}}}xxxxx',
  'xxxxxxxxxxxxxxxxxxxxxxx}}}}}xxxxxxxxxxxxxxxxxxxxxxx',
  'xxxxxxxxxxxxxxxxxxxxxxxx}}}xxxxxxxxxxxxxxxxxxxxxxxx',
  'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  'xxxx.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.xxxx',
  'xxx...xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx...xxx',
  'xxxx.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.xxxx',
  'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
];

/** The lair's area, the stairs' and arrivals' exclusion (des.levregion `exclude`, map-relative). */
const LAIR_AREA: LevelRect = [0, 0, 50, 17];

/** The fountain's and the mimics' spots (the `place` selection; map-relative). */
const PLACES: readonly Pos[] = [
  { x: 4, y: 2 },
  { x: 46, y: 2 },
  { x: 4, y: 15 },
  { x: 46, y: 15 },
];

const mon = (id: string, x?: number, y?: number): LevelContent =>
  x === undefined || y === undefined
    ? { kind: 'monster', id: id as DefId }
    : { kind: 'monster', id: id as DefId, x, y };
const cls = (c: string, x?: number, y?: number): LevelContent =>
  x === undefined || y === undefined
    ? { kind: 'monster', class: c }
    : { kind: 'monster', class: c, x, y };
const obj = (c: string, x?: number, y?: number): LevelContent =>
  x === undefined || y === undefined
    ? { kind: 'object', class: c }
    : { kind: 'object', class: c, x, y };
const trap = (id: string): LevelContent => ({ kind: 'trap', id: id as DefId });
const BOULDER: LevelContent = { kind: 'object', id: 'nh:boulder' };

/** The placeholder stairs core puts down first (Level column 0 stays stone). */
const PLACEHOLDERS = {
  up: { x: 0, y: 0, coords: 'level' },
  down: { x: 0, y: 1, coords: 'level' },
  branch: { x: 0, y: 2, coords: 'level' },
} as const;

/**
 * The LevelDef's id: its special level's own (GEHENNOM_SPECIALS.juiblex) is Juiblex's monster
 * id, and def ids are shared by every kind of def.
 */
export const JUIBLEX_SWAMP: DefId = 'nh:juiblex-swamp';

/** ref: dat/juiblex.lua */
export const JUIBLEX: LevelDef = {
  id: JUIBLEX_SWAMP,
  // des.level_init({ style = "swamp", lit = 0 }): the fixup's, over this stone
  init: { style: 'solidfill', fg: 'nh:stone', lit: false },
  map: { rows: [...LAIR] },
  // Dungeon description
  regions: [{ area: LAIR_AREA, lit: false, type: SWAMP, filled: false }],
  stairs: { ...PLACEHOLDERS },
  teleportRegions: [
    { area: [0, 0, 10, 20], coords: 'level', exclude: LAIR_AREA, dir: 'up' },
    { area: [68, 0, 78, 20], coords: 'level', exclude: LAIR_AREA, dir: 'down' },
  ],
  // what follows the shuffled classes (the fixup's)
  contents: [
    cls('j'),
    cls('j'),
    cls('j'),
    cls('j'),
    cls('P'),
    cls('P'),
    cls('P'),
    cls('P'),
    cls('b'),
    cls('b'),
    cls('b'),
    cls('F'),
    cls('F'),
    cls('F'),
    cls('m'),
    cls('m'),
    mon('nh:jellyfish'),
    mon('nh:jellyfish'),
    // Some random objects
    obj('potion'),
    obj('potion'),
    obj('potion'),
    obj('food'),
    obj('food'),
    obj('food'),
    BOULDER,
    // Some traps
    trap('nh:sleeping_gas_trap'),
    trap('nh:sleeping_gas_trap'),
    trap('nh:anti_magic_field'),
    trap('nh:anti_magic_field'),
    trap('nh:magic_trap'),
    trap('nh:magic_trap'),
  ],
};

/**
 * des.level_init({ style = "swamp", fg = ".", bg = "}", lit = 0 }): moat from NetHack's x 2 to
 * x_maze_max and down to y_maze_max, then Jamis Buck's relaxed blockwise maze: each 2x2 block
 * from (2, 0) gets floor in its top-left corner and, when its other three cells are moat, in one
 * of them (`rn2(3)`). ref: src/sp_lev.c lvlfill_swamp(), lvlfill_solid()
 */
export function lvlfillSwamp(ctx: Pick<Ctx, 'rng'>, level: Level): void {
  const COLNO = level.width + 1;
  const ROWNO = level.height;
  const max = mazeMax(level.width, level.height);
  const set = (x: number, y: number, id: DefId): void => setTer(level, x - 1, y, id, { lit: 0 });
  const isBg = (x: number, y: number): boolean => terrainIdAt(level, x - 1, y) === T.moat;
  for (let x = 2; x <= max.x; x++) for (let y = 0; y <= max.y; y++) set(x, y, T.moat);
  for (let x = 2; x <= Math.min(max.x, COLNO - 2); x += 2)
    for (let y = 0; y <= Math.min(max.y, ROWNO - 2); y += 2) {
      set(x, y, T.floor);
      const c = Number(isBg(x + 1, y)) + Number(isBg(x, y + 1)) + Number(isBg(x + 1, y + 1));
      if (c !== 3) continue;
      const r = ctx.rng.rn2(3);
      if (r === 0) set(x + 1, y, T.floor);
      else if (r === 1) set(x, y + 1, T.floor);
      else set(x + 1, y + 1, T.floor);
    }
}

/** The lair's exclusion rectangle in Level coordinates. */
function lairExclusion(def: LevelDef, level: Level): LevelRect {
  const a = mapToLevel(def, level, LAIR_AREA[0], LAIR_AREA[1]);
  const b = mapToLevel(def, level, LAIR_AREA[2], LAIR_AREA[3]);
  return [a.x, a.y, b.x, b.y];
}

/** Juiblex's swamp: the script in its order, the stairs at the end. */
export const JUIBLEX_FIXUP: SpLevFixup = {
  before(ctx, level, def) {
    liftStairs(level);
    lvlfillSwamp(ctx, level);
    // guarantee at least one open spot to ensure successful stair placement
    const sw = desMap(level, CLEARING_SW, { halign: 'left', valign: 'bottom' });
    makeContents(ctx, level, blockDef(def, CLEARING_SW, sw), [BOULDER]);
    const ne = desMap(level, CLEARING_NE, { halign: 'right', valign: 'top' });
    makeContents(ctx, level, blockDef(def, CLEARING_NE, ne), [BOULDER]);
    // lair (core laid it on the stone; the swamp went over it)
    const lair = mapBlock(def, level.width, level.height) as MapBlock;
    desMap(level, LAIR, { x: lair.x, y: lair.y });
    // Random registers
    const monster = ['j', 'b', 'P', 'F'];
    shuffle(ctx, monster);
    const m = (i: number): string => monster[i - 1] as string;
    const place = PLACES.map((p) => ({ ...p }));
    // des.feature("fountain", place:rndcoord(1))
    const f = rndcoord(ctx, place);
    const fp = mapToLevel(def, level, f.x, f.y);
    if (!isFurnitureId(ctx.defs, terrainIdAt(level, fp.x, fp.y)))
      setTerrain(level, fp.x, fp.y, T.fountain);
    for (let i = 0; i < 3; i++) {
      const p = rndcoord(ctx, place);
      makeContents(ctx, level, def, [
        { ...mon('nh:giant_mimic', p.x, p.y), appearAs: { kind: 'furniture', id: T.fountain } },
      ]);
    }
    makeContents(ctx, level, def, [
      // The demon of the swamp
      mon('nh:juiblex', 25, 8),
      // And a couple demons
      mon('nh:lemure', 43, 8),
      mon('nh:lemure', 44, 8),
      mon('nh:lemure', 45, 8),
      // Some liquids and gems
      obj('gem', 43, 6),
      obj('gem', 45, 6),
      obj('potion', 43, 9),
      obj('potion', 44, 9),
      obj('potion', 45, 9),
      // And lots of blobby monsters
      cls(m(4), 25, 6),
      cls(m(1), 24, 7),
      cls(m(2), 26, 7),
      cls(m(3), 23, 8),
      cls(m(3), 27, 8),
      cls(m(2), 24, 9),
      cls(m(1), 26, 9),
      cls(m(4), 25, 10),
    ]);
  },
  after(ctx, level, def) {
    mapCleanup(ctx, level); // (no walls to join)
    const ex = lairExclusion(def, level);
    desLevregion(ctx, level, 'stair-down', [0, 0, 10, 20], ex);
    desLevregion(ctx, level, 'stair-up', [68, 0, 78, 20], ex);
    desLevregion(ctx, level, 'branch', [0, 0, 10, 20], ex);
  },
};
