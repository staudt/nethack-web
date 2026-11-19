// Vlad's Tower: three levels above a Gehennom level, climbed by ladders. tower3 at the bottom
// holds the branch stairs down to Gehennom behind a locked door and a dragon; tower2 has demons,
// hell hound pups, a winter wolf and loot in its niches; tower1 at the top holds Vlad the Impaler
// (with the Candelabrum of Invocation, makemon()'s) on his throne, his court of vampires, three
// vampire ladies waiting for the hero and six chests, two of them full of candles.
// ref: dat/tower1.lua, dat/tower2.lua, dat/tower3.lua
//
// Translation notes (DEVIATIONS.md "Vlad's Tower"): each LevelDef is solidfill stone (lit
// omitted: the coin flip is drawn) with its map half-left, its fixed doors and placeholder
// stairs (the tower has no stairs but tower3's branch: the `before` fixup lifts what core put
// there); "mazelevel", "noteleport", "hardfloor", "solidify" and the non_diggable area are
// levelflags.ts entries. The `before` fixup runs the script in its order: the shuffled niches,
// the ladders (LADDER_SPOTS), the monsters, the objects (a chest's `contents` empties it, then
// makes its candles: their math.random() count is drawn first, as the Lua call evaluates its
// table before des.object() runs; no random spot is drawn for a contained object, as castle.ts);
// the `after` fixup joins the walls and puts tower3's branch in its level region as
// fixup_special() does. tower1's "vampire lady"s are vampire lords, unnamed (no monster genders
// or names; `nh.is_genocided("vampire")` only picks the names). The lords are `waiting`.
import type { Ctx, DefId, DoorDef, Level, LevelContent, LevelDef } from '@nh/core';
import { VANILLA_TERRAIN, wallifyLevel } from '@nh/core';
import { TOWER_LEVELS } from './levelflags';
import { mksobjFull } from './mkobj';
import {
  addToStatue,
  deleteContents,
  desLevregion,
  liftStairs,
  makeContents,
  mapToLevel,
  orientDoors,
  shuffle,
  type SpLevFixup,
} from './sp_lev';
import { desLadders } from './wiztower';

type Spot = readonly [number, number];

/** ref: dat/tower1.lua (the upper stage: tower2.lua and the map rows differ) */
const TOWER1_MAP: readonly string[] = [
  '  --- --- ---  ',
  '  |.| |.| |.|  ',
  '---S---S---S---',
  '|.......+.+...|',
  '---+-----.-----',
  '  |...\\.|.+.|  ',
  '---+-----.-----',
  '|.......+.+...|',
  '---S---S---S---',
  '  |.| |.| |.|  ',
  '  --- --- ---  ',
];

/** ref: dat/tower2.lua */
const TOWER2_MAP: readonly string[] = [
  '  --- --- ---  ',
  '  |.| |.| |.|  ',
  '---S---S---S---',
  '|.S.........S.|',
  '---.------+----',
  '  |......|..|  ',
  '--------.------',
  '|.S......+..S.|',
  '---S---S---S---',
  '  |.| |.| |.|  ',
  '  --- --- ---  ',
];

/** ref: dat/tower3.lua */
const TOWER3_MAP: readonly string[] = [
  '    --- --- ---    ',
  '    |.| |.| |.|    ',
  '  ---S---S---S---  ',
  '  |.S.........S.|  ',
  '-----.........-----',
  '|...|.........+...|',
  '|.---.........---.|',
  '|.|.S.........S.|.|',
  '|.---S---S---S---.|',
  '|...|.|.|.|.|.|...|',
  '---.---.---.---.---',
  '  |.............|  ',
  '  ---------------  ',
];

const door = (state: DoorDef['state'], x: number, y: number): DoorDef => ({ x, y, state });

/** The common parts of the three LevelDefs. */
const towerDef = (id: DefId, rows: readonly string[], doors: DoorDef[]): LevelDef => ({
  id,
  // des.level_init({ style = "solidfill", fg = " " })
  init: { style: 'solidfill', fg: 'nh:stone' },
  map: { rows: [...rows], halign: 'half-left', valign: 'center' },
  doors,
  // placeholders (Level column 0 is stone); the fixup lifts them, tower3's branch goes to its
  // level region
  stairs: {
    up: { x: 0, y: 0, coords: 'level' },
    down: { x: 0, y: 1, coords: 'level' },
    branch: { x: 0, y: 2, coords: 'level' },
  },
});

/** ref: dat/tower1.lua */
export const TOWER1: LevelDef = towerDef(TOWER_LEVELS.tower1, TOWER1_MAP, [
  door('closed', 8, 3),
  door('closed', 10, 3),
  door('closed', 3, 4),
  door('locked', 10, 5),
  door('locked', 8, 7),
  door('locked', 10, 7),
  door('closed', 3, 6),
]);

/** ref: dat/tower2.lua */
export const TOWER2: LevelDef = towerDef(TOWER_LEVELS.tower2, TOWER2_MAP, [
  door('locked', 10, 4),
  door('locked', 9, 7),
]);

/** ref: dat/tower3.lua ("Entry door is, of course, locked") */
export const TOWER3: LevelDef = towerDef(TOWER_LEVELS.tower3, TOWER3_MAP, [door('locked', 14, 5)]);

/** Vlad's Tower's LevelDefs, top first. */
export const VLAD_TOWER: readonly LevelDef[] = [TOWER1, TOWER2, TOWER3];

const at = (s: Spot) => ({ x: s[0], y: s[1] });
const mon = (id: string, s: Spot, more: Partial<LevelContent> = {}): LevelContent => ({
  kind: 'monster',
  ...(id.length === 1 ? { class: id } : { id: id as DefId }),
  ...at(s),
  ...more,
});
const obj = (id: string, s: Spot): LevelContent => ({ kind: 'object', id: id as DefId, ...at(s) });
const trap = (s: Spot): LevelContent => ({ kind: 'trap', ...at(s) });
const nth = <T>(list: readonly T[], i: number): T => list[i - 1] as T;

/**
 * des.object({ id = "chest", coord = s, contents = function() <candles> end }): a chest (with
 * its random contents) emptied, then the candles: `math.random(min, max)` of them made inside,
 * or nothing for a chest with no contents function. ref: src/sp_lev.c create_object()
 * (SP_OBJ_CONTAINER: delete_contents(); SP_OBJ_CONTENT: add_to_container())
 */
function desChest(
  ctx: Ctx,
  level: Level,
  def: LevelDef,
  s: Spot,
  inside?: { id: DefId; quantity?: { min: number; max: number } },
): void {
  const p = mapToLevel(def, level, s[0], s[1]);
  const gen = { level: level.id, inMklev: true };
  const chest = mksobjFull(
    ctx,
    ctx.defs.object('nh:chest'),
    { at: { level: level.id, x: p.x, y: p.y } },
    gen,
  );
  if (!inside) return;
  deleteContents(ctx, chest);
  const q = inside.quantity;
  const n = q ? q.min + ctx.rng.rn2(q.max - q.min + 1) : 0;
  const id = mksobjFull(ctx, ctx.defs.object(inside.id), { init: true }, gen);
  const it = ctx.state.entities[String(id)]?.c.item;
  if (it && n > 0 && ctx.defs.object(inside.id).merge) it.quantity = n; // `o->quan > 0 && oc_merge`
  addToStatue(ctx, chest, id);
}

/** tower1: the script in its order. */
const TOWER1_FIXUP: SpLevFixup = {
  before(ctx, level, def) {
    liftStairs(level);
    const niches: Spot[] = [
      [3, 1],
      [3, 9],
      [7, 1],
      [7, 9],
      [11, 1],
      [11, 9],
    ];
    shuffle(ctx, niches);
    desLadders(level, def);
    makeContents(ctx, level, def, [
      // The lord and his court
      mon('nh:vlad_the_impaler', [6, 5]),
      mon('V', nth(niches, 1)),
      mon('V', nth(niches, 2)),
      mon('V', nth(niches, 3)),
      // The brides ("vampire lady"; marking them as 'waiting' forces them to start in vampire
      // form instead of vampshifted into bat/fog/wolf form)
      mon('nh:vampire_lord', nth(niches, 4), { waiting: true }),
      mon('nh:vampire_lord', nth(niches, 5), { waiting: true }),
      mon('nh:vampire_lord', nth(niches, 6), { waiting: true }),
    ]);
    // treasures
    desChest(ctx, level, def, [7, 5]);
    desChest(ctx, level, def, nth(niches, 6));
    desChest(ctx, level, def, nth(niches, 1));
    desChest(ctx, level, def, nth(niches, 2));
    desChest(ctx, level, def, nth(niches, 3));
    desChest(ctx, level, def, nth(niches, 4), {
      id: 'nh:wax_candle',
      quantity: { min: 4, max: 8 },
    });
    desChest(ctx, level, def, nth(niches, 5), {
      id: 'nh:tallow_candle',
      quantity: { min: 4, max: 8 },
    });
  },
  after(ctx, level) {
    finishTower(ctx, level);
  },
};

/** tower2: the script in its order. */
const TOWER2_FIXUP: SpLevFixup = {
  before(ctx, level, def) {
    liftStairs(level);
    // Random places are the 10 niches
    const place: Spot[] = [
      [3, 1],
      [7, 1],
      [11, 1],
      [1, 3],
      [13, 3],
      [1, 7],
      [13, 7],
      [3, 9],
      [7, 9],
      [11, 9],
    ];
    shuffle(ctx, place);
    desLadders(level, def);
    makeContents(ctx, level, def, [
      mon('&', nth(place, 10)),
      mon('&', nth(place, 1)),
      mon('nh:hell_hound_pup', nth(place, 2)),
      mon('nh:hell_hound_pup', nth(place, 3)),
      mon('nh:winter_wolf', nth(place, 4)),
    ]);
    desChest(ctx, level, def, nth(place, 5), { id: 'nh:amulet_of_life_saving' });
    desChest(ctx, level, def, nth(place, 6), { id: 'nh:amulet_of_strangulation' });
    makeContents(ctx, level, def, [
      obj('nh:water_walking_boots', nth(place, 7)),
      obj('nh:crystal_plate_mail', nth(place, 8)),
    ]);
    const spbooks: DefId[] = [
      'nh:spellbook_of_invisibility',
      'nh:spellbook_of_cone_of_cold',
      'nh:spellbook_of_create_familiar',
      'nh:spellbook_of_clairvoyance',
      'nh:spellbook_of_charm_monster',
      'nh:spellbook_of_stone_to_flesh',
      'nh:spellbook_of_polymorph',
    ];
    shuffle(ctx, spbooks);
    makeContents(ctx, level, def, [obj(nth(spbooks, 1), nth(place, 9))]);
  },
  after(ctx, level) {
    finishTower(ctx, level);
  },
};

/** tower3: the script in its order. */
const TOWER3_FIXUP: SpLevFixup = {
  before(ctx, level, def) {
    liftStairs(level);
    // Random places are the 10 niches (not shuffled here)
    const place: Spot[] = [
      [5, 1],
      [9, 1],
      [13, 1],
      [3, 3],
      [15, 3],
      [3, 7],
      [15, 7],
      [5, 9],
      [9, 9],
      [13, 9],
    ];
    desLadders(level, def);
    makeContents(ctx, level, def, [
      // Let's put a dragon behind the door, just for the fun...
      mon('D', [13, 5]),
      { kind: 'monster', x: 12, y: 4 },
      { kind: 'monster', x: 12, y: 6 },
      { kind: 'monster', count: 6 },
      obj('nh:long_sword', nth(place, 4)),
      trap(nth(place, 4)),
      obj('nh:lock_pick', nth(place, 1)),
      trap(nth(place, 1)),
      obj('nh:elven_cloak', nth(place, 2)),
      trap(nth(place, 2)),
      obj('nh:blindfold', nth(place, 3)),
      trap(nth(place, 3)),
    ]);
  },
  after(ctx, level, def) {
    finishTower(ctx, level);
    // des.levregion({ type="branch", region={02,05,02,05} })
    const p = mapToLevel(def, level, 2, 5);
    desLevregion(ctx, level, 'branch', [p.x, p.y, p.x, p.y], null);
  },
};

/** lspo_finalize_level(): doors facing their walls, the walls joined. */
function finishTower(ctx: Ctx, level: Level): void {
  orientDoors(ctx, level);
  wallifyLevel(level, VANILLA_TERRAIN);
}

/** The towers' fixups, by LevelDef id. */
export const TOWER_FIXUPS: Readonly<Record<DefId, SpLevFixup>> = {
  [TOWER1.id]: TOWER1_FIXUP,
  [TOWER2.id]: TOWER2_FIXUP,
  [TOWER3.id]: TOWER3_FIXUP,
};
