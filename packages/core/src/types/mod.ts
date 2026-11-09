import type { ActionType, Dir, PlayerAction } from './action';
import type { DefId, EntityId, Glyph, Json, LevelId, Msg, Pos } from './common';
import type { ArmorSlot, Dice, Entity } from './entity';
import type { GameEvent } from './event';
import type { Level, LevelRef, Trap } from './level';
import type { ActionOffer, CoreQuery, Target } from './query';
import type { Rng } from './rng';
import type { GameOver, GameState } from './state';
import type { Prompt } from './prompt';

export interface TerrainDef {
  id: DefId;
  nameKey: string;
  passable: boolean;
  opaque: boolean;
  /** A locked door is a closed door that won't open (ref: rm.h D_LOCKED). */
  door?: 'closed' | 'locked' | 'open' | 'doorway';
  stairs?: 'up' | 'down';
  glyph: Glyph;
  /** Hidden terrain (secret doors/corridors) is shown to clients as this terrain instead. */
  looksLike?: DefId;
}

export interface RoleDef {
  id: DefId;
  nameKey: string;
  speed: number;
  /** The player's map glyph; the player entity's `def` is the role id. */
  glyph: Glyph;
  /** Movement gained at the end of each turn (ref: src/allmain.c u_calc_moveamt); defaults to speed. */
  movement?(ctx: Ctx, hero: EntityId): number;
}

/** ref: include/objclass.h enum obj_class_types (the classes implemented so far). */
export type ObjectClass =
  | 'weapon'
  | 'armor'
  | 'ring'
  | 'amulet'
  | 'tool'
  | 'food'
  | 'potion'
  | 'scroll'
  | 'spellbook'
  | 'wand'
  | 'coin'
  | 'gem'
  | 'rock'
  /** Spit venom (ref: VENOM_CLASS): made when spat, never generated at random. */
  | 'venom';

/** Where a wand is aimed (ref: include/objclass.h NODIR, IMMEDIATE, RAY). */
export type WandDir = 'nodir' | 'immediate' | 'ray';

/** An object type, ported from struct objclass (ref: include/objclass.h, include/objects.h). */
export interface ObjectDef {
  id: DefId;
  /** The actual name ("potion of healing"). */
  nameKey: string;
  class: ObjectClass;
  glyph: Glyph;
  /** Fixed unidentified description ("crude dagger"); classes with shuffled appearances leave it out. */
  descKey?: string;
  /** Generation probability within its class (oc_prob). */
  prob: number;
  /** oc_weight */
  weight: number;
  /** oc_cost */
  cost: number;
  /** One of NetHack's materials, lowercased ('iron', 'wood', 'cloth', 'glass', ...). */
  material: string;
  /** oc_merge: equal instances stack. */
  merge: boolean;
  /** oc_magic */
  magic: boolean;
  /** oc_delay: turns to put on/take off armor, or to eat. */
  delay: number;
  weapon?: {
    small: Dice;
    large: Dice;
    /** oc_hitbon */
    hitBonus: number;
    /** Weapon skill name, e.g. 'dagger', 'spear'. */
    skill: string;
    bimanual: boolean;
    kind: 'pierce' | 'slash' | 'whack';
    /**
     * Launchers fire ammo whose `skill` matches theirs (ref: objclass.h is_launcher/is_ammo, where
     * ammo has a negative oc_skill); missiles (darts) are thrown by hand (is_missile).
     */
    role?: 'launcher' | 'ammo' | 'missile';
  };
  armor?: { slot: ArmorSlot; ac: number; mc: number };
  food?: { nutrition: number };
  /**
   * The property this object confers while worn or carried, e.g. 'fire_res' (oc_oprop); keys are
   * content-defined, as in `Components.props`.
   */
  prop?: string;
  /** Wands: how the wand is aimed (oc_dir). */
  wand?: { dir: WandDir };
  /**
   * Containers (ref: objclass.h Is_container, Is_box). `capacity` is the weight limit, null for
   * none; `box` for large boxes and chests (they can be locked); `holding` for a bag of holding.
   */
  container?: { capacity: number | null; box: boolean; holding?: boolean };
  /** Spellbooks: the spell level 1..7 (oc_level), 0 for blank paper. */
  spellbook?: { level: number };
  /**
   * A boulder: it blocks sight like a wall where it lies on the floor and always lies on top of
   * its pile. Core uses it for vision (`sightBlockers`) and pile order only; pushing and every
   * other rule are content's. ref: src/vision.c does_block(), src/mkobj.c place_object()
   */
  boulder?: true;
  /**
   * A per-instance shown id (a legend key, usually an AppearanceDef) for this item, or null for
   * the usual one (`state.appearances[def]` or the def). Used wherever core shows a floor or
   * carried item: the view, object memory and `describe()`. Must read state only (no RNG).
   * Vanilla draws a statue as the monster it depicts. ref: include/display.h obj_to_glyph()
   */
  appearanceOf?(state: Readonly<GameState>, defs: Registry, item: Entity): DefId | null;
  /** Effect when quaffed or read; called by content's actions. */
  use?(ctx: Ctx, user: EntityId, item: EntityId): void;
  /**
   * Effect when zapped; called by content's actions. `dir` is a direction, 'self' (zapped at the
   * user) or null for a 'nodir' wand. ref: src/zap.c weffects()
   */
  zap?(ctx: Ctx, user: EntityId, item: EntityId, dir: Dir | 'self' | null): void;
}

/** A randomized description ("ruby potion") with its glyph; assigned per game via `state.appearances`. */
export interface AppearanceDef {
  id: DefId;
  nameKey: string;
  class: ObjectClass;
  glyph: Glyph;
}

/** A bottom-line field computed from state (AC, gold, hunger); null leaves it out. ref: src/botl.c */
export interface StatusDef {
  id: DefId;
  /** Key in `ViewSnapshot.status`; a def may replace a built-in field. */
  field: string;
  value(state: Readonly<GameState>, defs: Registry): string | number | null;
}

/**
 * How the hero perceives the map, beyond plain sight: blindness, extra senses (telepathy) and
 * altered appearances (hallucination). Core vision and the view consult every registered def.
 * All functions read state only and must be deterministic (no RNG): derive any "random" choice
 * from state, e.g. from `turn` and the entity id. ref: src/display.c, src/vision.c
 */
export interface PerceptionDef {
  id: DefId;
  /** True when the hero cannot see; if any def says so, no cell is visible. */
  blind?(state: Readonly<GameState>, defs: Registry): boolean;
  /** True to show this monster although its cell is not visible (telepathy, warning…). */
  senses?(state: Readonly<GameState>, defs: Registry, mon: Entity): boolean;
  /**
   * A legend key (a monster, object or appearance def) to show instead of this creature's or
   * floor object's own glyph, or null for no change. The first def that answers wins.
   */
  shownAs?(state: Readonly<GameState>, defs: Registry, e: Entity): DefId | null;
  /**
   * True when the hero does not see this monster although its cell is visible (invisibility).
   * A hidden monster is left out of the view, `describe()`, `actionsFor()` and monster memory
   * (its cell counts as empty, but a marker there stays) unless some `senses` is true.
   * ref: src/display.h mon_visible()
   */
  hides?(state: Readonly<GameState>, defs: Registry, mon: Entity): boolean;
  /**
   * How the hero is shown to herself: `g` replaces her glyph (a legend key, e.g. a polymorph
   * form) and `unseen` says she cannot see herself (invisible without see invisible). The first
   * non-null answer wins. ref: src/display.c display_self(), src/display.h canspotself()
   */
  self?(state: Readonly<GameState>, defs: Registry): SelfView | null;
  /**
   * Light sources (lit lamps, a lit monster): cells within `radius` that the source can see are
   * lit for the hero, as if `Level.lit` were set. Radius is clamped to 0..15; sources on other
   * levels are ignored. ref: src/light.c do_light_sources()
   */
  lights?(state: Readonly<GameState>, defs: Registry): LightSource[];
}

/** How the hero is shown (`PerceptionDef.self`). */
export interface SelfView {
  /** The legend key drawn for her instead of her role's glyph. */
  g?: DefId;
  /** She cannot see herself; renderers may draw her dimmed or not at all. */
  unseen?: true;
}

/** A light source at a cell (ref: src/light.c struct ls_t). */
export interface LightSource {
  level: LevelId;
  x: number;
  y: number;
  radius: number;
}

/** A kind of trap; its effects belong to content (ref: include/trap.h, src/trap.c dotrap). */
export interface TrapDef {
  id: DefId;
  nameKey: string;
  glyph: Glyph;
  /** A trap door or hole: falling through leads to a lower level. */
  hole?: boolean;
}

/**
 * A dungeon: a chain of levels. Every dungeon but one has an `entry`, a branch staircase (down
 * by default) from a level of another dungeon to its entry level (`entryLevel`, the top by
 * default); the one without is the root, whose levels have ids `dlvl<N>`. Without any DungeonDef
 * the engine uses one endless root dungeon, `core:dungeon`. A mod can attach its own dungeon to
 * another mod's.
 * ref: dat/dungeon.lua, src/dungeon.c init_dungeons()
 */
export interface DungeonDef {
  id: DefId;
  nameKey: string;
  /** Number of levels: `base + rn2(range)` (ref: rn1(range, base)); omitted for no bottom. */
  levels?: { base: number; range?: number };
  /** Where its branch stairs leave from. */
  entry?: DungeonEntryDef;
  /**
   * The level its branch stairs arrive on: 0 or omitted the top, `n > 0` level n, `n < 0`
   * counted from the bottom (-1 = the last level); clamped to the dungeon. A negative value needs
   * `levels`. ref: dat/dungeon.lua `entry`; src/dungeon.c init_dungeon_set_entry()
   */
  entryLevel?: number;
  /** LevelDef for its ordinary levels; omitted for the rooms-and-corridors generator. */
  filler?: DefId;
  /** Its fixed special levels, placed in this order when the layout is rolled. */
  special?: SpecialLevelDef[];
}

/**
 * A special level of a dungeon (ref: dat/dungeon.lua `levels`; src/dungeon.c init_level(),
 * place_level()). At new game it exists with `chance`% and goes on one of the levels
 * `base .. base + range - 1` that no earlier special level of the dungeon took; a negative `base`
 * counts from the bottom (-1 = the last level). When that level is first made one of `variants`
 * (LevelDef ids) is picked with `rnd(n)` (ref: src/mkmaze.c makemaz()).
 */
export interface SpecialLevelDef {
  id: DefId;
  nameKey: string;
  base: number;
  /** How many levels from `base` it may go on; default 1. */
  range?: number;
  /** 0..100, default 100; `rn2(100)` is drawn either way. */
  chance?: number;
  variants: DefId[];
  /** A town level: `Level.town` is set (ref: dungeon.lua flags "town"). */
  town?: boolean;
}

/** ref: dat/dungeon.lua branches; src/dungeon.c parent_dlevel(), level_range() */
export interface DungeonEntryDef {
  /** The DungeonDef whose level has the branch stairs. */
  from: DefId;
  /**
   * On level `base` of `from`, or one of `base .. base + range - 1`. With `chain` the levels
   * count from that special level's: `base` 1 is the level below it (`base` may then be any
   * integer that stays inside `from`).
   */
  base: number;
  range?: number;
  /**
   * A SpecialLevelDef id of `from` that `base` counts from; it must always exist (`chance` 100).
   * ref: dat/dungeon.lua `chainlevel`; src/dungeon.c level_range() (chain >= 0)
   */
  chain?: DefId;
  /**
   * Which way the stairs on `from` lead: `down` (default) or `up` into this dungeon, which then
   * lies above that level. ref: dat/dungeon.lua `direction`; src/dungeon.c init_dungeon_set_depth()
   */
  dir?: 'up' | 'down';
}

/**
 * A level written as plain data (no functions), the counterpart of a NetHack `dat/*.lua` file.
 * Core lays out the map (`init`) and the stairs the dungeon asks for, at random dry spots; content
 * then makes `contents` in order. See docs/ARCHITECTURE.md "Level definitions".
 * ref: src/sp_lev.c lspo_level_init(), lspo_stair(), lspo_monster(), lspo_object(), lspo_trap()
 */
export interface LevelDef {
  id: DefId;
  init: LevelInit;
  /**
   * A hand-drawn block laid over the `init` map. Once a LevelDef has one, the coordinates of its
   * regions, edits, doors, features, stairs and contents are relative to the block's top-left
   * corner unless the entry says `coords: 'level'` (ref: src/sp_lev.c lspo_map(),
   * get_location()). At most one block per LevelDef.
   */
  map?: LevelMap;
  /**
   * Walled rooms, placed on NetHack's 5x5 grid or at random, with subrooms, doors, features,
   * stairs and contents of their own. ref: src/sp_lev.c lspo_room(), create_room()
   */
  rooms?: RoomDef[];
  /** `random`: join the top-level rooms with corridors. ref: src/sp_lev.c lspo_random_corridors() */
  corridors?: 'random';
  /** Lit or unlit areas, and typed rooms over map areas. ref: src/sp_lev.c lspo_region() */
  regions?: RegionDef[];
  /** Terrain changes, some at random. ref: src/sp_lev.c lspo_terrain() with nhlib percent() */
  edits?: TerrainEdit[];
  /** ref: src/sp_lev.c lspo_door() */
  doors?: DoorDef[];
  /** ref: src/sp_lev.c lspo_feature(), lspo_altar() */
  features?: FeatureDef[];
  /**
   * Where the up and down stairs go; the dungeon still decides which exist. Omitted: a random
   * floor or corridor cell (inside the map block when there is one).
   * `branch` places the branch stairs, when the dungeon gives the level some; omitted they go
   * on a random floor or corridor cell of the whole level.
   * ref: src/sp_lev.c lspo_stair(), lspo_levregion() (type "branch"); src/mkmaze.c
   * place_lregion()
   */
  stairs?: { up?: StairPlace; down?: StairPlace; branch?: StairPlace };
  /**
   * `inaccessibles`: join every open area to the stairs (ref: src/sp_lev.c ensure_way_out()).
   * `sokoban`: the level is built with `Level.sokoban` set, Sokoban's rules, which the mod that
   * owns them clears once the puzzle is solved (ref: sp_lev.c level flag "sokoban",
   * `level.flags.sokoban_rules`). `premapped`: the whole level is known on the first arrival;
   * core only stores the flag, the owning mod maps the level (ref: level flag "premapped",
   * src/mkmaze.c sokoban_detect()).
   */
  flags?: { inaccessibles?: boolean; sokoban?: boolean; premapped?: boolean };
  contents?: LevelContent[];
}

/**
 * Which origin an entry's coordinates use. `map` (the default when the LevelDef has a map
 * block): relative to the block's top-left, inside the block. `level`: Level coordinates, where a
 * negative value counts from the right or bottom edge (-1 = the last column or row); NetHack's
 * level x is one more than ours (its column 0 is unused). ref: lua `region_islev`
 */
export type LevelCoords = 'map' | 'level';

/** An area `[x1, y1, x2, y2]`, corners inclusive. */
export type LevelRect = [x1: number, y1: number, x2: number, y2: number];

/**
 * A hand-drawn map block (ref: src/sp_lev.c lspo_map(); src/nhlua.c splev_chr2typ()). `rows` are
 * equal-length strings of: ' ' stone, '.' floor, '#' corridor, '-' and '|' walls (corners and
 * T-walls are worked out), '+' doorway (a `doors` entry gives it a door), 'S' secret door,
 * 'H' secret corridor, '{' fountain, 'K' sink, 'T' tree, 'x' keep what `init` made there.
 * Placed by `halign`/`valign` (both default 'center'), or with its top-left at Level `x`,`y`.
 * `lit` (default false) lights or darkens every cell it sets.
 */
export interface LevelMap {
  rows: string[];
  halign?: 'left' | 'half-left' | 'center' | 'half-right' | 'right';
  valign?: 'top' | 'center' | 'bottom';
  x?: number;
  y?: number;
  lit?: boolean;
}

/**
 * Lights (`lit: true`, which also lights the cells around it) or darkens `area`; omitted `lit` is
 * random as for rooms. With `type` the area also becomes a Room of that type (`filled` false by
 * default). ref: src/sp_lev.c lspo_region(), light_region(); src/mklev.c do_room_or_subroom()
 */
export interface RegionDef {
  area: LevelRect;
  coords?: LevelCoords;
  lit?: boolean;
  type?: DefId;
  filled?: boolean;
}

/** `random` picks one of nodoor, broken, open, closed, locked. ref: src/sp_lev.c rnddoor() */
export type DoorState = 'open' | 'closed' | 'locked' | 'nodoor' | 'broken' | 'random';

/** A door at a spot (made a door if it is not one). ref: src/sp_lev.c lspo_door(), sel_set_door() */
export interface DoorDef {
  x: number;
  y: number;
  coords?: LevelCoords;
  state: DoorState;
}

/**
 * A dungeon feature at a spot; nothing happens on stairs or another feature. An altar's `align`
 * defaults to random (lawful, neutral or chaotic); `shrine` is kept for the temple (6b2).
 * ref: src/sp_lev.c lspo_feature(), sel_set_feature(), lspo_altar(), create_altar()
 */
export interface FeatureDef {
  kind: 'fountain' | 'sink' | 'tree' | 'altar';
  x: number;
  y: number;
  coords?: LevelCoords;
  align?: 'lawful' | 'neutral' | 'chaotic' | 'noalign' | 'random';
  shrine?: boolean;
}

/**
 * A door on a wall of its room: `wall` (default any wall) and `pos` (cells from the wall's
 * top or left end; default random). `random` state rolls create_door()'s table (doorway 2/3,
 * else open, locked or closed). ref: src/sp_lev.c lspo_door() without x,y, create_door()
 */
export interface RoomDoorDef {
  state: DoorState;
  wall?: 'north' | 'south' | 'east' | 'west' | 'random';
  pos?: number;
}

/**
 * A walled room (ref: src/sp_lev.c lspo_room(), build_room(), create_room(), create_subroom()).
 * Top level: `x`,`y` pick a cell 1..5 of a 5x5 grid over the level and `xalign`/`yalign` place the
 * room in it; omitted they are random, and with no `x`,`y`,`w`,`h` or aligns at all the room is
 * placed like an ordinary random room. Subroom (in `rooms` of a room): `x`,`y` are the offset of
 * its floor in the parent's floor. `w`,`h` are the floor size (both or neither; omitted random).
 * `percent` (0..100) decides whether the room exists at all (lua `if percent(n)`), `chance`
 * (0..100) whether it gets its `type` (else it is ordinary). `lit` omitted is random. `filled`
 * (typed rooms; default true) lets the type's owner stock it. `features`, `contents` and the
 * `x`,`y` of an altar are relative to the room's floor (0,0 = its top-left floor cell); without
 * `x`,`y` contents go on a random spot of the room outside its subrooms. `stairs` puts the
 * dungeon's up or down stairs on a random floor spot of the room.
 */
export interface RoomDef {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  xalign?: 'left' | 'center' | 'right';
  yalign?: 'top' | 'center' | 'bottom';
  type?: DefId;
  chance?: number;
  percent?: number;
  lit?: boolean;
  filled?: boolean;
  doors?: RoomDoorDef[];
  features?: FeatureDef[];
  stairs?: ('up' | 'down')[];
  contents?: LevelContent[];
  rooms?: RoomDef[];
}

/**
 * Stairs at a fixed spot, or on a random floor or corridor cell of `region` outside `exclude`
 * (ref: lua levregion `region`, `exclude`, `region_islev`, `exclude_islev`).
 */
export type StairPlace =
  | { x: number; y: number; coords?: LevelCoords }
  | { region: LevelRect; exclude?: LevelRect; coords?: LevelCoords; excludeCoords?: LevelCoords };

/**
 * Terrain changes. With `percent` (0..100) a roll decides: `set` then `then` on success, `else`
 * otherwise; without it they always apply. ref: nhlib.lua percent(); src/sp_lev.c lspo_terrain()
 */
export interface TerrainEdit {
  percent?: number;
  set?: TerrainSet[];
  then?: TerrainEdit;
  else?: TerrainEdit;
}

/**
 * One map character (as in LevelMap, but not 'x') at a spot `at`, along a `line` (from corner
 * to corner, ref: selvar.c selection_do_line()) or over a filled `area`; give exactly one.
 */
export interface TerrainSet {
  char: string;
  at?: [x: number, y: number];
  line?: LevelRect;
  area?: LevelRect;
  coords?: LevelCoords;
}

/**
 * How the map starts. `rooms`: the ordinary rooms-and-corridors generator, rooms filled as usual.
 * `solidfill`: every cell is terrain `fg`; `lit` omitted is a coin flip.
 * `mines`: a cellular-automaton cave of `fg` in `bg` (default the generator's stone), see
 * LevelInitMines. ref: src/sp_lev.c splev_initlev()
 */
export type LevelInit =
  { style: 'rooms' } | { style: 'solidfill'; fg: DefId; lit?: boolean } | LevelInitMines;

/**
 * A cave map (ref: src/mkmap.c mkmap()). Booleans default to false, as in des.level_init().
 * `smoothed`: two extra smoothing passes; `joined`: every open region is dug through to the others
 * and regions of 3 cells or fewer are filled in; `walled`: `bg` cells next to `fg` become walls,
 * with corners and T-walls; `lit` omitted is a coin flip, and lights the `fg` cells and walls.
 */
export interface LevelInitMines {
  style: 'mines';
  fg: DefId;
  bg?: DefId;
  smoothed?: boolean;
  joined?: boolean;
  walled?: boolean;
  lit?: boolean;
}

/** A fixed count, or `min..max` inclusive (ref: nhlua math.random(min, max)). */
export type LevelCount = number | { min: number; max: number };

/**
 * Things to make at random dry spots (or at `x`,`y`). `id` names a def; a monster `class` is a
 * monster glyph character ('G'), an object `class` an ObjectClass ('gem'); neither picks at
 * random. `percent` (0..100) is rolled once for the entry, then `count` (default 1) things are made.
 */
export interface LevelContent {
  kind: 'monster' | 'object' | 'trap';
  id?: DefId;
  class?: string;
  count?: LevelCount;
  percent?: number;
  /**
   * A fixed spot instead of a random dry one; give both or neither. Relative to the map block
   * when there is one, else Level coordinates (see LevelCoords). A random spot is inside the map
   * block when there is one (ref: src/sp_lev.c get_location()).
   */
  x?: number;
  y?: number;
  coords?: LevelCoords;
  /** Monsters: forced peaceful (true) or hostile (false); omitted = peace_minded() as usual. */
  peaceful?: boolean;
  /**
   * Objects that show a monster (corpses, statues): a monster def id, or a one-character monster
   * class for a random monster of that class (des.object `montype`).
   */
  montype?: DefId | string;
  /** Statues: a historic statue (des.object `historic`). */
  historic?: true;
}

/** Names an item for the player, from player knowledge only (ref: src/objnam.c doname). */
export type ItemNamer = (state: Readonly<GameState>, defs: Registry, item: Entity) => Msg;

/** An offer as returned by `ActionDef.offer`; the engine adds `source`. */
export type Offer = Omit<ActionOffer, 'source'>;

export interface ActionDef {
  id: DefId;
  labelKey: string;
  /** Which PlayerAction type this def performs. Built-ins use their own type; mod actions use 'mod' and match on `action.action === id`. */
  handles: ActionType;
  /** Offers this action contributes to `actionsFor(target)`. */
  offer(ctx: Ctx, target: Target): Offer[];
  /** Performs the action; returns the energy cost (0 = no time passes). */
  perform(ctx: Ctx, action: PlayerAction): number;
  /** Handles the answer to a prompt this action raised with `ctx.ask`; returns the energy cost. */
  answer?(ctx: Ctx, value: Json, data: Json): number;
  /**
   * Multi-turn actions (travel, running, eating). After a move that took time and wasn't
   * interrupted, returning true keeps `state.occupation` set, so the next
   * `{ type: 'continue' }` performs the action again. Per-action progress belongs in
   * `state.occupation.data` (null on the first move), never in module variables.
   */
  continues?(ctx: Ctx, action: PlayerAction): boolean;
}

/** ref: include/monattk.h AT_* */
export type AttackType =
  | 'claw'
  | 'bite'
  | 'kick'
  | 'butt'
  | 'touch'
  | 'sting'
  | 'hug'
  | 'spit'
  | 'engulf'
  | 'breath'
  | 'explode'
  | 'boom'
  | 'gaze'
  | 'tentacle'
  | 'weapon'
  | 'magic'
  /** AT_NONE: a passive response when the monster is hit (molds, floating eye, acid blob). */
  | 'passive';

/** ref: include/monattk.h. `ad` is the lowercased AD_ name without the prefix ('phys', 'elec', 'plys', ...). */
export interface AttackDef {
  at: AttackType;
  ad: string;
  n: number;
  d: number;
}

/** ref: include/permonst.h struct permonst */
export interface MonsterDef {
  id: DefId;
  nameKey: string;
  glyph: Glyph;
  level: number;
  speed: number;
  ac: number;
  mr: number;
  alignment: number;
  attacks: AttackDef[];
  size: 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gigantic';
  /** Lowercased M1_/M2_/M3_ flag names without prefix, e.g. 'animal', 'nohands', 'hostile'. */
  flags: string[];
  /** Generation frequency 0..7 (G_FREQ); 0 = never randomly generated. */
  frequency: number;
  group: 'small' | 'large' | null;
  /** Extra generation flags, e.g. 'nogen', 'nohell', 'genocidable'. */
  genFlags: string[];
  difficulty: number;
  /** Resistances (mresists), lowercased MR_ names without the prefix: 'fire', 'cold', 'sleep', 'disint', 'elec', 'poison', 'acid', 'stone'. */
  resists: string[];
  /** Resistances its corpse can convey (mconveys), same names. */
  conveys: string[];
  /** Corpse weight (cwt). */
  weight: number;
  /** Corpse nutrition (cnutrit). */
  nutrition: number;
  /** BrainDef that runs this monster's turns. */
  brain: DefId;
  /** What #chat gets from it (msound); absent means silent. ref: include/permonst.h msound */
  sound?: MonsterSound;
}

/**
 * The noise a monster makes when the hero chats with it: NetHack's MS_ names lowercased (MS_SQEEK
 * is 'squeak'). Only the sounds the vanilla content can answer are listed; a mod adds more by
 * extending this union in core. ref: include/monflag.h ms_sounds
 */
export type MonsterSound =
  | 'silent'
  | 'bark'
  | 'mew'
  | 'growl'
  | 'roar'
  | 'squeak'
  | 'hiss'
  | 'buzz'
  | 'grunt'
  | 'moo'
  | 'bellow'
  | 'chirp'
  | 'orc'
  | 'humanoid'
  | 'soldier'
  | 'priest'
  | 'sell'
  | 'groan'
  | 'djinni'
  | 'oracle'
  | 'seduce'
  | 'laugh'
  | 'shriek'
  | 'cuss'
  | 'sqawk'
  | 'neigh'
  | 'trumpet'
  | 'imitate'
  | 'burble'
  | 'boast'
  | 'were'
  | 'spell'
  | 'nurse'
  | 'guard';

/** Runs a non-hero actor's turn. The engine deducts NORMAL_SPEED before calling `act`. */
export interface BrainDef {
  id: DefId;
  act(ctx: Ctx, self: EntityId): void;
  /** Movement gained at the end of each turn (ref: src/mon.c mcalcmove); defaults to actor speed. */
  movement?(ctx: Ctx, self: EntityId): number;
}

/** Fires when a scheduled timer comes due at end of turn. */
export interface TimerDef {
  id: DefId;
  fire(ctx: Ctx, data: Json): void;
}

export interface Ctx {
  readonly state: GameState;
  rng: Rng;
  cosmetic: Rng;
  defs: Registry;
  emit(e: GameEvent): void;
  query: CoreQuery;
  /** Schedule a registered timer to fire `delay` (>= 1) turns from now. */
  schedule(delay: number, kind: DefId, data: Json): void;
  /** Adds an entity and returns its new id. */
  spawn(e: Omit<Entity, 'id'>): EntityId;
  /** Removes an entity (never the hero). */
  remove(id: EntityId): void;
  /**
   * Moves the hero to level `to`, generating it on first visit, arriving on its up, down or
   * branch staircase, or on a random room floor cell without a trap ('random', for falling
   * through a trap door; ref: src/dungeon.c u_on_rndspot()). Throws for a level outside the
   * layout.
   */
  goToLevel(to: LevelRef, at: 'up' | 'down' | 'branch' | 'random'): void;
  /**
   * Puts a trap on `level`, replacing any trap already on that cell (ref: src/trap.c
   * maketrap()). Throws unless the cell is plain floor (see `isPlainFloor`) or the def is unknown.
   */
  placeTrap(level: LevelId, t: Trap): void;
  /** Removes the trap at `pos` of `level`, if any. ref: src/trap.c deltrap() */
  removeTrap(level: LevelId, pos: Pos): void;
  /** Ends this step with `prompt`; the next action must answer it and is routed to `handler`. */
  ask(prompt: Prompt, handler: DefId, data: Json): void;
  /** Stops a multi-turn action after the current step. */
  interrupt(): void;
  endGame(over: GameOver): void;
}

/**
 * Passed to the `levelChange` hook: where the hero was just before `ctx.goToLevel`, or null
 * when she has just arrived on the first level of a new game.
 */
export interface LevelChange {
  from: LevelId | null;
  fromPos: Pos | null;
  to: LevelId;
}

export interface Hooks {
  beforeAction(ctx: Ctx, a: PlayerAction): 'continue' | 'cancel';
  afterAction(ctx: Ctx, a: PlayerAction): void;
  endOfTurn(ctx: Ctx): void;
  /** Once, after the hero entity exists and before the first level is generated. */
  newGame(ctx: Ctx, hero: EntityId): void;
  newLevel(ctx: Ctx, level: Level): void;
  /**
   * After the hero arrives on a level: once at the start of a new game (`from` null, after she
   * is placed on the up stairs; ref: src/allmain.c newgame() makedog()), and after each
   * `ctx.goToLevel` (after `newLevel` on a first visit). Companions that follow
   * (ref: src/dog.c keepdogs(), losedogs()) move here.
   */
  levelChange(ctx: Ctx, change: LevelChange): void;
  /**
   * In `ctx.endGame()`, before the game ends: any hook may return 'cancel' to keep it going
   * (the game is then not over, and the caller of `endGame` must check `state.gameOver`).
   * Wizard mode's "Die?" uses it. Not called once the game is already over.
   */
  beforeGameOver(ctx: Ctx, over: GameOver): 'continue' | 'cancel';
}

export type HookName = keyof Hooks;

export interface HookOptions {
  /** Higher runs first. Default 0. */
  priority?: number;
}

export interface ModApi {
  defineTerrain(d: TerrainDef): void;
  defineRole(d: RoleDef): void;
  defineAction(d: ActionDef): void;
  defineTimer(d: TimerDef): void;
  defineMonster(d: MonsterDef): void;
  defineBrain(d: BrainDef): void;
  defineObject(d: ObjectDef): void;
  defineAppearance(d: AppearanceDef): void;
  defineStatus(d: StatusDef): void;
  definePerception(d: PerceptionDef): void;
  defineTrap(d: TrapDef): void;
  defineDungeon(d: DungeonDef): void;
  defineLevel(d: LevelDef): void;
  /** Replaces the item namer; the last mod to set it wins. */
  setItemNamer(fn: ItemNamer): void;
  on<K extends HookName>(hook: K, fn: Hooks[K], opts?: HookOptions): void;
}

export interface Mod {
  id: string;
  version: string;
  dependsOn?: string[];
  register(api: ModApi): void;
}

export interface RegisteredHook<K extends HookName = HookName> {
  mod: string;
  priority: number;
  fn: Hooks[K];
}

/** Read-only view of everything loaded mods registered. Arrays are in deterministic order. */
export interface Registry {
  readonly mods: readonly { id: string; version: string }[];
  terrain(id: DefId): TerrainDef;
  hasTerrain(id: DefId): boolean;
  role(id: DefId): RoleDef;
  timer(id: DefId): TimerDef;
  hasTimer(id: DefId): boolean;
  monster(id: DefId): MonsterDef;
  isMonster(id: DefId): boolean;
  brain(id: DefId): BrainDef;
  object(id: DefId): ObjectDef;
  isObject(id: DefId): boolean;
  appearance(id: DefId): AppearanceDef;
  isAppearance(id: DefId): boolean;
  trap(id: DefId): TrapDef;
  isTrap(id: DefId): boolean;
  dungeon(id: DefId): DungeonDef;
  /**
   * The root dungeon first, then breadth-first: each dungeon's children (those entered from it)
   * in registration order;
   * `[DEFAULT_DUNGEON]` when no mod defines one.
   */
  readonly dungeons: readonly DungeonDef[];
  level(id: DefId): LevelDef;
  /** In registration order. */
  readonly levels: readonly LevelDef[];
  /** Names an item with the active namer (a default one if no mod set it). */
  itemName(state: Readonly<GameState>, item: Entity): Msg;
  /** In registration order. */
  readonly monsters: readonly MonsterDef[];
  /** In registration order. */
  readonly objects: readonly ObjectDef[];
  /** In registration order. */
  readonly appearances: readonly AppearanceDef[];
  /** In registration order (later defs win for the same field). */
  readonly statuses: readonly StatusDef[];
  /** In registration order. */
  readonly perceptions: readonly PerceptionDef[];
  /** In registration order. */
  readonly traps: readonly TrapDef[];
  readonly roles: readonly RoleDef[];
  readonly terrains: readonly TerrainDef[];
  /** In registration order. */
  readonly actions: readonly (ActionDef & { mod: string })[];
  /** Sorted: priority desc, then mod load order, then registration order. */
  hooks<K extends HookName>(name: K): readonly RegisteredHook<K>[];
}
