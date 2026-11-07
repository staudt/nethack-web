# Architecture

This document holds the contracts between packages. The type definitions live in `packages/core/src/types/`; this file explains them. If code and this file disagree, fix one of them in the same commit.

## Data flow

```
 ┌──────────── main thread ──────────────┐        ┌─────────── Web Worker ──────────┐
 │ app ── ui (client mods, input, menus) │ ToCore │ host (core/host.ts)             │
 │   │      │                            │ ─────▶ │   engine = createEngine(mods)   │
 │   │      └─▶ Renderer (render-ascii)  │        │   state: GameState (private)    │
 │   │                                   │ ◀───── │   view diff, events, replies    │
 │   └─ storage (IndexedDB saves)        │FromCore│                                 │
 └───────────────────────────────────────┘        └─────────────────────────────────┘
```

- `GameState` exists only inside the worker. The UI sees a `ViewSnapshot` once, then `ViewDelta`s, plus `GameEvent[]`.
- The UI changes the game only by sending a `PlayerAction`. It reads only through `CoreQuery`, which is async across the worker boundary.
- `core/host.ts` is the whole protocol handler. It is pure (it takes a `post` callback), so tests drive it in Node; `app/src/worker.ts` is a thin shim around it.

## State

```ts
type EntityId = number;
type LevelId = string;
type DefId = `${string}:${string}`; // namespaced: "nh:floor"
interface Pos {
  x: number;
  y: number;
}
type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
interface Msg { key: string; params?: Params } // a message; item names nest inside sentences
type Params = { [k: string]: string | number | Msg }; // '@key' strings are keys too, '=Name' proper names
type RngState = [number, number, number, number]; // sfc32
interface ModRef {
  id: string;
  version: string;
}

interface GameState {
  version: 8;
  seed: number;
  turn: number;
  nextEntityId: number;
  seq: number; // monotonically increasing tiebreaker (timers etc.)
  rng: { core: RngState; cosmetic: RngState };
  mods: ModRef[]; // load order
  entities: Record<string, Entity>; // iterate via sortedIds(), never key order
  dungeons: DungeonLayout[]; // rolled at new game: the root dungeon first, then each branch after its parent
  levels: Record<LevelId, Level>;
  currentLevel: LevelId;
  playerId: EntityId;
  memory: Record<LevelId, number[]>; // remembered palette index per cell, -1 = never seen
  objectMemory: Record<LevelId, Record<string, DefId>>; // cell index -> remembered top object (shown id)
  monsterMemory: Record<LevelId, Record<string, DefId>>; // cell index -> monster def last seen there; set/cleared by refreshVision for visible cells
  appearances: Record<DefId, DefId>; // object def -> appearance def, shuffled per game
  discovered: DefId[]; // object defs the hero has identified, sorted
  visible: number[]; // sorted cell indices visible to the player now
  timers: Timer[]; // { at, seq, kind: DefId, data: Json }; sorted by (at, seq)
  modData: Record<string, Json>; // per-mod persistent data, keyed by mod id
  gameOver: { kind: 'died' | 'escaped'; killer: string; turn: number; depth: number; level: number } | null;
  pendingPrompt: { prompt: Prompt; handler: DefId; data: Json } | null; // next action must answer it
  occupation: { action: PlayerAction; data: Json } | null; // multi-turn action in progress (travel, run, eating)
}

interface Entity {
  id: EntityId;
  def: DefId;
  c: Components;
}
interface Components {
  pos?: { level: LevelId; x: number; y: number };
  actor?: { energy: number; speed: number }; // NORMAL_SPEED = 12
  player?: { role: DefId };
  hp?: { cur: number; max: number };
  attributes?: { str; int; wis; dex; con; cha }; // NetHack encoding; Str 18/xx stored as 19..118
  experience?: { level: number; points: number };
  monster?: { level: number; peaceful: boolean; asleep: boolean; lastHero: Pos | null; tame?: number }; // tame = mtame 1..20, absent when not tame
  item?: ItemComponent;
  hunger?: { nutrition: number; state: HungerState }; // u.uhunger, u.uhs
  helpless?: { until: number; reasonKey: string }; // nomul() with negative multi
  props?: Record<string, PropState>; // intrinsic and timed properties (ref: prop.h); keys are content-defined, e.g. 'cold_res', 'stunned'
}
// timeout is the turn the property ends; 0 means none (permanent if intrinsic)
interface PropState { intrinsic: boolean; timeout: number }
// ref: include/obj.h struct obj. An item is in exactly one place: the floor (`pos`), carried, or in a container.
interface ItemComponent {
  quantity: number;
  buc: 'blessed' | 'uncursed' | 'cursed';
  spe: number; // enchantment or charges
  known: { buc: boolean; spe: boolean };
  carriedBy: EntityId | null; // set => no pos
  letter: string | null; // the hero's inventory letter
  equipped: EquipSlot | null; // 'weapon' | ArmorSlot | 'ringL' | 'ringR' | 'amulet' | 'blindfold'
  placed: number; // from state.seq; highest on a cell is the top of the pile
  corpseOf?: DefId; age?: number; eaten?: number;
  containedIn?: EntityId; // set => no pos, carriedBy null (obj->ocontainer)
  locked?: true; broken?: true; lit?: true; // olocked, obroken, lamplit
  erosion?: { e1: 0 | 1 | 2 | 3; e2: 0 | 1 | 2 | 3 }; erodeproof?: true; // oeroded, oeroded2, oerodeproof
  recharged?: number;
  // shop state (6b3): on a shopkeeper's bill (obj->unpaid); in a shop but not for sale (obj->no_charge).
  // The bill itself is content data (modData.nh.eshk); content's mergable() keeps flagged and
  // unflagged stacks apart.
  unpaid?: true; noCharge?: true;
}

interface Room {
  lx: number;
  ly: number;
  hx: number;
  hy: number;
  lit: boolean;
  type?: DefId; // special room kind ('nh:temple', 'nh:tool_shop'...); absent = ordinary
  parent?: number; // index in Level.rooms of the enclosing room; subrooms follow their parent
  filled?: boolean; // false = a typed room left empty
} // interior bounds, inclusive
// ref: include/dungeon.h struct dungeon, struct branch
interface DungeonLayout {
  id: DefId; // DungeonDef
  depthStart: number; // absolute depth of its top level
  levels: number | null; // null = no bottom
  entry?: number; // the level its branch stairs arrive on; absent = 1 (ref: entry_lev)
  branches: { to: DefId; dlevel: number; dir?: 'up' }[]; // where its branches leave it; dir absent = down
  special: { id: DefId; dlevel: number }[]; // where its special levels went
}
interface LevelRef { dungeon: DefId; dlevel: number } // ref: d_level
interface Level {
  id: LevelId; // root dungeon: dlvl<N>; others: <dungeonId>/<N>
  depth: number; // absolute, shown as Dlvl (ref: depth())
  dungeon: DefId;
  dlevel: number; // 1 = top of its dungeon
  width: number;
  height: number;
  palette: DefId[]; // terrain defs used on this level
  cells: number[]; // row-major (i = y * width + x), index into palette
  lit: (0 | 1)[];
  rooms: Room[];
  up: Pos | null;
  down: Pos | null;
  branch: { pos: Pos; to: LevelRef; dir: 'up' | 'down' } | null; // stairs into another dungeon
  def?: DefId; // the LevelDef it was built from; absent for an ordinary level
  town?: true; // a town level (ref: level.flags.has_town), see inTown
  sokoban?: true; // Sokoban's rules in force (ref: level.flags.sokoban_rules); content clears it when solved
  shrines?: Pos[]; // shrine altars (ref: AM_SHRINE); absent when none
  traps: Trap[]; // sorted by cell index; plain floor only
  boulderSpots?: Pos[]; // transient: corridor boulders asked for by levelgen; content makes and deletes them
}
// ref: include/trap.h struct trap
interface Trap { def: DefId; x: number; y: number; seen: boolean; once?: boolean; data?: Json }
```

The state is JSON-plain: saving is `JSON.stringify`, and `stateHash(state)` is a hash of canonical (key-sorted) JSON. The level size is a parameter, and 80×21 is only the default.

**Dungeons.** A `DungeonDef` (`{ id, nameKey, levels?: { base, range? }, entry?: { from, base, range?, chain?, dir? }, entryLevel?, filler? }`) describes a chain of levels; `levels` omitted means no bottom. Every dungeon but the root has an `entry`: branch stairs from level `base` (or one of `range` levels from it) of dungeon `from` to its entry level, so a mod can attach a dungeon to another mod's. `entry.chain` names a special level of `from` that `base` counts from (base 1 = the level below it; ref: dungeon.lua `chainlevel`, level_range()); it must always exist (`chance` 100). `entry.dir: 'up'` makes the stairs on `from` lead up, so the dungeon lies above that level (ref: `direction`). `entryLevel` is the level the stairs arrive on: 0 or omitted the top, `n > 0` level n, negative from the bottom (-1 = the last), clamped (ref: dungeon.lua `entry`, init_dungeon_set_entry()); the name differs from dungeon.lua's because `entry` is the branch. Sokoban is `{ levels: { base: 4 }, entryLevel: -1, entry: { from: 'nh:main', chain: 'nh:oracle', base: 1, dir: 'up' } }`: up stairs on the level below the Oracle lead to its bottom level, as deep as the Oracle. Without any DungeonDef the engine uses `DEFAULT_DUNGEON` (`core:dungeon`, endless). `loadMods` reports an unknown `entry.from`, an entry below its parent's bottom, a missing or second root and loops; `registry.dungeons` is root first, then breadth-first with each dungeon's children in registration order. At new game, before the `newGame` hooks, `rollDungeons` rolls each size as `base + rn2(range)` and each entry's level in its parent (counted from the chain level, cut at the parent's bottom, skipping levels that already hold a branch end: the parent's own entry level and earlier branches); its depth is `depthStart = branch level's depth + (dir up ? -1 : 1) - (entryLevel - 1)` (ref: src/dungeon.c init_dungeons(), parent_dlevel(), init_dungeon_set_entry(), init_dungeon_set_depth()). `DungeonLayout.entry` is the entry level when it is not 1, and a `branches` item has `dir: 'up'` for an up-branch. A chained branch needs its parent's special levels placed, which they are: each dungeon's specials are placed right after its own size and entry, before its children. `loadMods` also reports a `chain` that is not an always-made special level of `from`, a chained `base` that lands above the top or below the bottom of `from`, a `dir` other than up/down, an `entryLevel` on the root, a non-integer one and a negative one on an endless dungeon. Fixed sizes, no branches and no special levels draw no random numbers. Vanilla registers `nh:main` (endless, with the Oracle on DL5-9), `nh:sokoban` (above, as said; four special levels `nh:soko1`..`nh:soko4` of two variants each, in `packages/content/src/sokoban.ts`) and `nh:mines`, the Gnomish Mines: `levels: { base: 8, range: 2 }`, `entry: { from: 'nh:main', base: 2, range: 3 }`, `filler: 'nh:minefill'` (a port of `minefill.lua` in `packages/content/src/dungeon.ts`, a worked example of a LevelDef). Helpers: `rootDungeon(state)`, `dungeonLayout(state, id)`, `levelIdFor(state, ref)`, `depthOf(state, ref)`, `levelStairs(state, ref)`.

*Special levels.* `DungeonDef.special` lists a dungeon's fixed special levels: `{ id, nameKey, base, range?, chance?, variants, town? }` (ref: dat/dungeon.lua `levels`). After its size and entry, `rollDungeons` draws `rn2(100)` for each (it exists unless `chance` (default 100) `<= ` the roll; NetHack skips the roll in wizard mode, we never do), then places them in order, each on a level of `base .. base + range - 1` (range default 1, cut at the bottom; a negative base counts from the bottom, -1 = last) that no earlier one took, picked with `rn2(n)`; when a later one finds no level the earlier choice is undone and another tried, and if nothing fits the roll throws (ref: src/dungeon.c init_level(), possible_places(), pick_level(), place_level(), level_range()). The result is `DungeonLayout.special: { id, dlevel }[]` (in def order; left-out ones are absent), and `specialLevelAt(state, ref)` finds the one on a level. When that level is first made the engine draws `rnd(variants.length)` before anything else, builds that `LevelDef` (`Level.def` is the variant id) and sets `Level.town` for `town: true` (ref: src/mkmaze.c makemaz()). `loadMods` reports a missing id or nameKey, a duplicate id, a `base` of 0 or outside the fewest levels the dungeon can roll (or negative on an endless dungeon), a bad `range`, a `chance` outside 0..100, empty `variants`, a variant that is not a LevelDef and a non-boolean `town`. Vanilla's `nh:mines` has `{ id: 'nh:minetown', nameKey: 'nh:minetown', base: 3, range: 2, town: true }` with the six variants of `packages/content/src/minetown.ts` (ports of `minetn-2.lua` .. `minetn-7.lua`, worked examples of rooms and map blocks); wizard mode's `wiz:where` lists each special level under its dungeon (`*` on the hero's level).

**Stairs.** `levelStairs` decides a new level's stairs (ref: src/mklev.c generate_stairs(), place_branch()): up stairs except on a branch dungeon's top level, down stairs except on a dungeon's last level, and `Level.branch` (`{ pos, to: LevelRef, dir }`) on the level a branch leaves from (the branch's way, to the child's entry level) and on the child's entry level (the other way back). So Sokoban's bottom (entry) level has up stairs and down branch stairs but no down stairs, and its top no up stairs, as in NetHack. The generator puts branch stairs after the corridors, in a random room without stairs when there is one, using the ordinary stair terrain. Content's `>`/`<` on branch stairs call `goToLevel(branch.to, 'branch')`, arriving on the other end's branch stairs. Only one branch per level is supported.

**Level definitions.** A `LevelDef` is a level written as plain JSON data, with no functions, so a mod (or an AI reading this section) can add a level by writing one object. It is the counterpart of a NetHack `dat/*.lua` file. A dungeon uses it for its ordinary levels through `DungeonDef.filler`; without a filler they come from the rooms-and-corridors generator.

```ts
interface LevelDef {
  id: DefId; // 'mymod:name'
  init: // how the map starts (ref: src/sp_lev.c splev_initlev())
    | { style: 'rooms' } // the ordinary generator; its rooms are filled as usual
    | { style: 'solidfill'; fg: DefId; lit?: boolean } // every cell is terrain fg; lit omitted = coin flip
    | { style: 'mines'; fg: DefId; bg?: DefId; smoothed?: boolean; joined?: boolean;
        walled?: boolean; lit?: boolean }; // a cave of fg in bg (default stone); see below
  map?: LevelMap; // a hand-drawn block; see Map blocks
  rooms?: RoomDef[]; corridors?: 'random'; // walled rooms; see Rooms
  regions?: RegionDef[]; edits?: TerrainEdit[]; doors?: DoorDef[]; features?: FeatureDef[];
  stairs?: { up?: StairPlace; down?: StairPlace; branch?: StairPlace };
  flags?: { inaccessibles?: boolean; sokoban?: boolean; premapped?: boolean };
  contents?: LevelContent[]; // made in order, after the map and stairs
}
interface LevelContent {
  kind: 'monster' | 'object' | 'trap';
  id?: DefId; // a MonsterDef, ObjectDef or TrapDef
  class?: string; // monster: a glyph character ('G'); object: an ObjectClass ('gem'); traps have none
  count?: number | { min: number; max: number }; // default 1; min..max inclusive
  percent?: number; // 0..100, rolled once for the whole entry before its count
  x?: number; y?: number; // a fixed spot (both or neither); see Map blocks for the origin
  coords?: 'map' | 'level';
  peaceful?: boolean; // monsters: forced peaceful or hostile; omitted = peace_minded()
}
```

An entry with `x`,`y` goes on that spot as given, with no terrain check (ref: src/sp_lev.c get_location() for fixed coordinates); in Level coordinates -1 is the last column or row, and a spot outside the level throws a RangeError naming the LevelDef. A monster whose spot is taken goes to a close free one; a trap whose spot is not plain floor is not made. `peaceful` sets the monster's peacefulness after it is made (ref: create_monster() `m->peaceful > BOOL_RANDOM`); members of its group are unaffected. `loadMods` reports an `x` without `y` (or the reverse), a non-integer coordinate, a `peaceful` that is not a boolean and `peaceful` on a non-monster.

With neither `id` nor `class` the thing is random: `makemon` with a random type (and its group), `mkobj` of a random class, or a random trap kind for the level's difficulty. A monster class picks with `mkclass()` (ref: src/makemon.c), which may choose `nogen` monsters as special levels do. Every thing goes on a random *dry* spot of the map block, or of the whole level without one: passable terrain that is not a door, so floor, corridor or stairs (ref: src/sp_lev.c get_location(), is_ok_location() DRY; 100 random tries, then the first in column order); a monster whose spot is taken goes to a close free one (`enexto`); traps need plain floor. Holes become falling rock traps where one cannot fall through (ref: src/mklev.c mktrap()).

The dungeon decides which stairs a level gets (see Stairs); `LevelDef.stairs` only says where. Without an entry core puts them on random floor or corridor cells (of the map block when there is one), up stairs first, then down, then branch stairs anywhere on the level, or where `stairs.branch` says (des.levregion type "branch") (ref: src/sp_lev.c lspo_stair() with good_stair_loc(), lspo_levregion(); src/mkmaze.c place_lregion()). `flags.sokoban: true` builds the level with `Level.sokoban` set (sp_lev.c level flag "sokoban"); `flags.premapped` is only stored on the LevelDef: content's sp_lev newLevel hook maps such a level for the hero once its contents and fixups are made (ref: sp_lev.c load_special() then premap_detect()). A `solidfill` map with no floor or corridor cannot hold stairs and throws when built.

`loadMods` validates every LevelDef and reports each problem with its path: an unknown `init.style`, a missing `fg`, a `bg` that is not a string, a `smoothed`/`joined`/`walled`/`lit` that is not a boolean, an unknown `contents[i].kind`, both `id` and `class`, a class on a trap, an object class that is not an ObjectClass, a monster class longer than one character, a bad `count` (`min > max`, negative, not an integer) or `percent` outside 0..100; and, once every mod has registered, a `fg` or `bg` that is not a terrain, an `id` that is not a def of its kind, a monster class no monster has, and a `filler` that is not a LevelDef. `registry.level(id)` and `registry.levels` list them.

The `mines` style is NetHack's cellular-automaton cave (ref: src/mkmap.c mkmap()); `minefill.lua` uses `{ style: 'mines', fg: 'nh:floor', smoothed: true, joined: true, walled: true }`. About 2/5 of the inner cells start as `fg`, then a birth/death pass and a thinning pass run; `smoothed` adds two passes that drop cells with fewer than 3 open neighbours; `joined` fills in regions of 3 cells or fewer and digs a winding path of `fg` from each region to an earlier one, so all open cells are one 8-connected area; `walled` turns each `bg` cell next to `fg` into a wall and then picks the wall piece that joins its neighbours (corners, T-walls `tuwall tdwall tlwall trwall` and `crwall`, ref: src/sp_lev.c wallify_map(); src/mkmaze.c wall_cleanup(), fix_wall_spines()). `lit` omitted is a coin flip; a lit cave lights its `fg` cells and walls, never `bg`. Open cells never touch the map edge, so the walls fit. Cave levels have the five T-wall terrains (`LevelTerrain` keys `CAVE_PALETTE_KEYS`) after the usual palette, and no rooms. The map must be at least `MIN_MKMAP_WIDTH` x `MIN_MKMAP_HEIGHT` (10x10); a small map that comes out with fewer than 4 open cells is made again from the continuing RNG stream. Stairs go on its `fg` cells when `fg` is the floor terrain.

**Map blocks.** The special-level fields are applied in this order after `init`: `map`, `rooms` (with their subrooms, doors and `corridors`, then room features), `regions`, `edits`, `doors`, `features`, `stairs`; then `flags.inaccessibles`, door orientation and wall fixing; content makes `contents` last. A LevelDef without any of them builds exactly as before.

```ts
type LevelCoords = 'map' | 'level';
type LevelRect = [x1: number, y1: number, x2: number, y2: number]; // corners inclusive
interface LevelMap {
  rows: string[]; // equal-length rows: ' ' stone . floor # corridor - | walls + doorway S secret door
                  // H secret corridor { fountain K sink T tree x keep what init made
  halign?: 'left' | 'half-left' | 'center' | 'half-right' | 'right'; // default center
  valign?: 'top' | 'center' | 'bottom'; // default center
  x?: number; y?: number; // instead of the aligns: Level coordinates of the top-left
  lit?: boolean; // default false: every cell the block sets is lit or dark
}
interface RegionDef { area: LevelRect; coords?: LevelCoords; lit?: boolean; type?: DefId; filled?: boolean }
interface DoorDef { x: number; y: number; coords?: LevelCoords;
  state: 'open' | 'closed' | 'locked' | 'nodoor' | 'broken' | 'random' }
interface FeatureDef { kind: 'fountain' | 'sink' | 'tree' | 'altar'; x: number; y: number; coords?: LevelCoords;
  align?: 'lawful' | 'neutral' | 'chaotic' | 'noalign' | 'random'; shrine?: boolean }
type StairPlace = { x: number; y: number; coords?: LevelCoords }
  | { region: LevelRect; exclude?: LevelRect; coords?: LevelCoords; excludeCoords?: LevelCoords };
interface TerrainEdit { percent?: number; set?: TerrainSet[]; then?: TerrainEdit; else?: TerrainEdit }
interface TerrainSet { char: string; at?: [number, number]; line?: LevelRect; area?: LevelRect; coords?: LevelCoords }
```

*Coordinates.* A LevelDef has at most one map block. Once it has one, every `x`,`y`, `area`, `region`, `exclude`, `at`, `line` and content spot is relative to the block's top-left corner (0,0) and must lie inside the block, as lua coordinates are after `des.map` (ref: src/sp_lev.c get_location(), cvt_to_abscoord()). An entry with `coords: 'level'` (`excludeCoords` for a stair exclusion, lua's `region_islev`/`exclude_islev`) uses Level coordinates instead, where a negative value counts from the right or bottom edge (-1 = last column or row), so a spot can stay at an edge on any map size. Without a block, coordinates are Level coordinates. NetHack's level x is one more than ours (its column 0 is unused): lua `region_islev` x1 = 1 is our 0. Core exports `mapBlock(def, width, height)` (the placed block, or null), `levelDefArea` (the block or the whole level: where random spots come from), `levelDefPos` and `levelDefRect` (an entry's Level position; a RangeError naming the LevelDef for a spot off the level), which content uses for `contents`. Placement is a pure function of the def and the level size, so nothing is stored on the Level. Example, a shop in a 9x4 block centred on any level, its stairs near the right edge:

```ts
{ id: 'mymod:hamlet', init: { style: 'solidfill', fg: 'nh:floor', lit: true },
  map: { rows: ['---------', '|...|...|', '|...+...+', '---------'] },
  regions: [{ area: [1, 1, 3, 2], lit: true, type: 'nh:tool_shop' }],
  doors: [{ x: 4, y: 2, state: 'closed' }, { x: 8, y: 2, state: 'random' }],
  features: [{ kind: 'fountain', x: 6, y: 1 }],
  stairs: { down: { region: [-6, 0, -1, -1], coords: 'level' } },
  contents: [{ kind: 'monster', id: 'nh:gnome', x: 2, y: 1, peaceful: true }] }
```

*Map.* Aligned blocks follow lspo_map(): `left` starts at our column 0, `center` at `2 + (x_maze_max - 2 - w) / 2` in NetHack columns (C division, odd start), `top` at row 3, and a block that runs off the bottom moves up 2 rows or to row 0; a block that fits the level is then moved inside it whole (C clips at the right edge). A block bigger than the level, or one that does not fit at its `x`,`y`, throws a RangeError naming the level and both sizes; a block the size of the level covers it exactly. `'-'` and `'|'` are plain walls: after everything else the whole level goes through wallification (walls with only rock around become rock, then each wall becomes the corner, T-wall or cross that joins its neighbours, doors counting as wall; ref: src/mkmaze.c wallification()). Stairs are never overwritten by a block or an edit.

*Regions* light `area` and the cells around it (`lit: true`, ref: light_region()), or darken just the area (`lit: false`); omitted `lit` is random as for rooms (litstate_rnd()). With `type` the area also becomes a wall-less `Room` of that type (kept off the level edge, lit with its edge when lit, never darkened; `filled` default false). *Edits* roll `percent` (`rn2(100) < percent`, nhlib percent()) and apply `set` and `then`, or `else`; without `percent` they always apply. *Doors* make their spot a door with that state (`random` = rnddoor(): nodoor, broken, open, closed or locked; nodoor and broken are both `nh:doorway`); a secret door stays secret (locked or not). A map `+` with no door entry is a doorway. Open and secret doors face their walls (ref: set_door_orientation()). *Features* do nothing on stairs or another feature (an altar only refuses stairs); an altar's `align` defaults to random (lawful, neutral or chaotic); a `shrine: true` altar that is placed is also appended to `Level.shrines` (both the top-level and the room feature paths; ref: sp_lev.c create_altar() AM_SHRINE). The shrine lives on the level, not on a priest, because it outlives him; core does not know temples, so the mod that owns them decides what a shrine outside a temple room means (C gives it no AM_SHRINE: vanilla's `newLevel` drops it from `Level.shrines` and makes a temple priest for each shrine left). *Stairs* at `x`,`y` go there as given; with `region` they go on a random floor or corridor cell of it outside `exclude` (200 tries, then the first in column order, ref: place_lregion()); a region with no such cell throws. *`inaccessibles`* (ref: ensure_way_out()) floods from the first staircase and, for each open area it does not reach, turns a wall between that area and a reached cell into a secret door; where no wall qualifies it digs a corridor (doorways through walls) along a shortest path (DEVIATIONS.md).

`loadMods` reports, with paths: rows that are missing, empty, of unequal width or with a character outside the legend (naming it and its column), a bad `halign`/`valign`, `x` without `y`, both `x`,`y` and aligns, a non-boolean `lit`/`filled`/`shrine`/`inaccessibles`, an unknown door state, feature kind or alignment, `align`/`shrine` on a non-altar, `filled` on an untyped region, a rect that is not four integers or upside down, an edit `set` with not exactly one of `at`/`line`/`area` or with `'x'`, an `else` without `percent`, stairs with both a spot and a region, a `coords` other than `map`/`level`, `coords: 'map'` without a block, and a map coordinate outside the block.

**Rooms.** `rooms` are walled rooms as in `des.room` (ref: src/sp_lev.c lspo_room(), build_room(), create_room(), create_subroom(), create_door(); src/mklev.c makecorridors()). Every field is optional:

```ts
interface RoomDef {
  x?: number; y?: number; // top level: a cell 1..5 of the 5x5 level grid; subroom: offset of its floor in the parent's floor
  w?: number; h?: number; // floor size (both or neither); omitted = random
  xalign?: 'left' | 'center' | 'right'; yalign?: 'top' | 'center' | 'bottom'; // top level only; omitted = random
  type?: DefId; chance?: number; // the room type, kept with chance% (rn2(100) < chance); else ordinary
  percent?: number; // the room exists with percent% (lua `if percent(n) then des.room(...)`)
  lit?: boolean; // omitted = random (litstate_rnd())
  filled?: boolean; // typed rooms: default true (the type's owner stocks it)
  doors?: RoomDoorDef[]; // on the room's walls
  features?: FeatureDef[]; // x,y relative to the room's top-left floor cell; no coords
  stairs?: ('up' | 'down')[]; // the dungeon's stairs go on a random floor cell of this room
  contents?: LevelContent[]; // in this room: x,y room-relative, else a random spot outside its subrooms
  rooms?: RoomDef[]; // subrooms
}
interface RoomDoorDef { state: DoorState; wall?: 'north' | 'south' | 'east' | 'west' | 'random'; pos?: number }
```

*Placement.* Rooms are built in order, each followed by its subrooms, then its doors. A top-level room with none of `x`,`y`,`w`,`h`,`xalign`,`yalign` is placed like an ordinary random room (a free rectangle of the level, ref: rect.c rnd_rect(), check_room(), split_rects()). Otherwise `x`,`y` (random: rnd(5) each) pick a cell of a 5x5 grid of `(width + 1) / 5` by `height / 5` cells (NetHack's COLNO/5 and ROWNO/5, C division), so the grid scales with the level; `xalign` puts the room at the cell's left, centre or right (random: rnd(3), which is left two times in three and centre otherwise, as in C), the room is clamped 2 cells from the edges, and it is made only where it fits in a free rectangle and in stone (100 tries); a room that cannot be placed is skipped with its subrooms, doors and contents. Random `w`,`h` are 3..17 by 2..9. A subroom needs a parent floor of at least 4x4; an offset of 1 moves onto the parent's wall (shared wall), as does an offset that leaves one floor cell on the far side; random sizes and offsets follow create_subroom(). Subrooms are not checked against the parent at build time (loadMods checks fixed ones). `percent` is drawn first, then `chance` (only when given), then the light.

*Doors* go on a random allowed wall (`wall` omitted = any) at `pos` cells from its top or left end (default random), only where the cell beyond the wall is open and okdoor() allows (no door next to a door; 100 tries, else no door). So a top-level room in solid stone gets its doors from `corridors` only, as in NetHack. `random` uses create_door()'s table: a doorway 2/3 of the time, else open (1/5), locked (1/6 of the rest) or closed. *`corridors: 'random'`* joins the top-level rooms in the order they were made (ref: makecorridors(); sp_lev does not sort them), never into a subroom, then core makes sure every top-level room is connected, as for ordinary levels (DEVIATIONS.md). *Features* of a room go at their room-relative spot, except on a cell a subroom covers (lua builds the subroom over it); an altar that is not on floor moves to a random floor cell of the room (ref: get_free_room_loc()). *Stairs* named by a room replace the random spot (not with `LevelDef.stairs` for the same direction; at most one room per direction).

Each room goes to `Level.rooms`, a parent before its subrooms, with `defPath`: its indexes in `LevelDef.rooms` and then each `rooms` (`[0, 6]` = `rooms[0].rooms[6]`). Content resolves it with `levelDefRoom(def, path)` and makes each room's `contents` in `Level.rooms` order, then `LevelDef.contents`. Core exports `roomHas(level, i, x, y)` (a floor cell of room `i` outside its subrooms), `roomSomexy(rng, level, i)` (ref: mkroom.c somexy(): 100 tries outside the subrooms, then the first such cell) and `roomDefPos(def, width, height, room, x, y, what)` (a room-relative spot; a RangeError off the level). Example, a town square with a temple and a shop, a stair room and a dwarf's room:

```ts
{ id: 'mymod:square', init: { style: 'solidfill', fg: 'nh:stone' },
  rooms: [
    { x: 3, y: 3, xalign: 'center', yalign: 'center', w: 20, h: 9, lit: true,
      features: [{ kind: 'fountain', x: 10, y: 4 }],
      contents: [{ kind: 'monster', id: 'nh:watchman', peaceful: true, count: 2 }],
      rooms: [
        { type: 'nh:temple', x: 2, y: 2, w: 4, h: 4, lit: true, doors: [{ state: 'closed', wall: 'east' }],
          features: [{ kind: 'altar', x: 2, y: 2, align: 'random', shrine: true }] },
        { type: 'nh:tool_shop', chance: 90, x: 13, y: 2, w: 3, h: 3, doors: [{ state: 'closed', wall: 'west' }] },
        { percent: 75, x: 13, y: 7, w: 2, h: 2, doors: [{ state: 'locked', wall: 'north' }] } ] },
    { stairs: ['up'] },
    { stairs: ['down'], contents: [{ kind: 'trap' }] },
    { contents: [{ kind: 'monster', id: 'nh:dwarf' }] } ],
  corridors: 'random' }
```

`loadMods` reports, with paths: `x` without `y`, `w` without `h`, a top-level `x`,`y` outside 1..5, a negative subroom offset, a size below 1, an unknown align, aligns on a subroom, a fixed subroom that does not fit its fixed parent, `chance`/`percent` outside 0..100, `chance` or `filled` without `type`, a non-boolean `lit`/`filled`, a door with `x`,`y`, an unknown door state or wall, a `pos` without a wall or past the wall's end, room features and contents with `coords` or a spot outside a fixed floor, a stair direction that is not `up`/`down` or already placed (by `LevelDef.stairs` or another room), a `corridors` other than `random`, and room contents as for `LevelDef.contents` (including unknown ids).

**Features and rooms.** `LevelTerrain` also names the dungeon features of special levels: `fountain`, `sink`, `tree` and one altar per alignment (`altar_lawful`, `altar_neutral`, `altar_chaotic`, `altar_unaligned`), so a 6b2 altar conversion swaps the terrain. They are not in `PALETTE_KEYS`; a level that uses one appends it to its own palette, so ordinary levels and saves are unchanged. Content draws them as NetHack does (`{` bright blue fountain, `{` white sink, `#` green tree that blocks movement and sight, `_` altar named "neutral altar" and so on); altars are the only ones with behaviour so far (content `align.ts`: the altar's god and alignment, curse status shown on a drop, its wrath when kicked). `Room.type` marks a special room; core does not check the id, the owning mod gives it meaning. Subrooms (`parent`) come after their parent in `Level.rooms` (see Rooms; `defPath` links a room to its `RoomDef`); code that wants NetHack's top-level `rooms[]` (mklev's room filling, `nroom`) filters `parent === undefined`. `inTown(level, x, y)` ports in_town(): false unless `level.town`; then inside (walls included) a top-level room that has subrooms, or anywhere when no room has any (ref: src/hack.c in_town(), src/mkroom.c inside_room(); `insideRoom` is exported too). `inRooms(level, x, y)` ports in_rooms(x, y, 0): the indexes of the rooms whose floor or walls hold the cell, innermost first, where a subroom's interior belongs to the subroom only but its walls and doors to both it and its parent (NetHack's SHARED roomno), so standing in a temple's doorway counts as in the temple.

Core's `buildLevel(rng, opts, def)` lays out the terrain and stairs and sets `Level.def`; content's `newLevel` hooks fill it (`mklev.ts` fills the rooms of ordinary and `rooms` levels, then `sp_lev.ts` makes `contents`).

**Corridor boulders: `Level.boulderSpots`** (added in m7b step 2). NetHack's dig_corridor() puts a boulder on a new cell of an extra (`nxcor`) corridor 1 time in 50 (`mksobj_at(BOULDER)`, after the secret-corridor roll). Core levelgen draws that roll exactly there but makes no objects, so `generateLevel` (and a LevelDef's `corridors: 'random'`) records the cells, in digging order, as `Level.boulderSpots`, absent when there are none. The mod that owns boulders turns them into objects in its first `newLevel` hook and deletes the field (vanilla: `mklev.ts` `mkCorridorBoulders()`, before any room is filled, as C makes them while digging; a boulder draws no random numbers in mksobj()), so a level in a save never has it and a level from an older save simply had none. A mod without boulders can ignore or delete the field. It is optional, so no SAVE_VERSION bump (ref: src/sp_lev.c dig_corridor()).

**Changing a built level: `wallifyLevel(level, terrain, area?)`** (added in m7c for Mines' End). Content that changes the terrain of a level after `buildLevel` (the Catacombs' maze walk; Orcish Town's broken walls) calls it to redo the wall pass: stone next to open ground (`floor`, the furniture, `crwall`; 8 neighbours) inside `area` (default the whole level) becomes wall as `des.wallify()` does, then the whole level goes through wallification as at the end of `buildLevel`. `terrain` is the `LevelTerrain` the level was built with (vanilla: `VANILLA_TERRAIN`). It is an additive export: no type, `LevelDef` field or save shape changed (ref: src/sp_lev.c wallify_map(), src/mkmaze.c wallification()).

**Level fixups (content).** What a lua level does that the `LevelDef` format cannot say (shuffled spots, `buc`, a maze walk, a door that exists only when a `percent` block ran) is a content `SpLevFixup` keyed by LevelDef id, as NetHack's own `fixup_special()` is: `registerSpLev(api, fixups)` runs `before(ctx, level, def)` ahead of `fillSpecialLevel` (terrain that later random spots must see) and `after` once the contents are made. dungeon.ts builds the table (`SPLEV_FIXUPS`) from minesend.ts (Mines' End) and orctown.ts (Orcish Town: iron bars, corpses, the orc horde and `stolenBooty()`, whose gang waits in content's `modData.nh.migrating` table, through migrate.ts, until the hero reaches its level); sp_lev.ts never imports the level modules. Terrain a LevelDef map cannot draw is set by a fixup: Orcish Town draws its iron bars as walls (so wallification joins walls to them, as NetHack's `iswall()` counts bars), calls `wallifyLevel` with the map area plus one cell (`des.wallify()`), and only then sets the content terrain `nh:iron_bars` (impassable, not opaque). A later mod-platform milestone may expose this as a `LevelDef` hook.

**Terrain rules.** `cellRules(level, registry)` flattens the palette into per-cell flag arrays: `passable`, `opaque`, `closedDoor` (closed *or* locked, so travel paths go through doors as `test_move` does for `TEST_TRAV`), `lockedDoor` (locked only) and `intactDoor` (doors that block diagonal moves). `checkStep` returns `ok` or a reason: `bounds`, `blocked`, `closedDoor`, `lockedDoor` or `diagonalDoor`. `lockedDoor` is checked before `closedDoor`; content turns it into "This door is locked." with no time passing. Levelgen draws NetHack's exact `dodoor`/`dosdoor` rolls and so makes locked doors (about 1/3 * 4/5 * 1/6 of doors) and locked secret doors (1 in 5 below depth 2); trapped doors are not made, though their rolls are still drawn.

**Vision.** A cell is seen when it is in line of sight and either adjacent to the hero or lit. A lit cell that blocks sight (a wall or closed door) is seen from afar only if its neighbor one step toward the hero is also lit, which hides lit room walls at the end of dark corridors (ref: src/vision.c vision_recalc()).

**Boulders (m7b).** An `ObjectDef` with `boulder: true` (vanilla: `nh:boulder`, the one object of the `'rock'` class) is the only object core treats specially, in two places. Sight: `sightBlockers(registry, state, levelId)` returns the cell indices holding such an object on the floor, and `computeVisible(level, rules, from, lights?, blocked?)` treats those cells like opaque terrain (seen themselves, shadowing what lies behind, and under the dark-corridor rule above); the engine's `refreshVision` passes them, and content's `clearPath()` takes the same set (ref: src/vision.c does_block()). Pile order: `itemsAt` and `topObjectEntities`/`topObjects` put boulders above every other object, then the most recently placed (ref: src/mkobj.c place_object()), so a boulder is what the map shows and remembers. Why a core change: vision runs in core and must not call into content each step; one flag on the def keeps the mod contract small (a separate `blocksSight`/`onTop` pair had no second user). `blocked` is optional, `ObjectDef.boulder` is optional and the class list only grew, so no existing mod, save or renderer changes; renderers only see `cls: 'rock'`. Pushing (`moverock()`), monsters avoiding boulder squares and every other rule are content's.

**Perception.** Every `PerceptionDef` is consulted. If any `blind` returns true, `refreshVision` makes no cell visible, so nothing new is remembered (content may "feel" cells by writing `state.memory` itself). A monster on a cell that is not visible is still in `ViewSnapshot.entities` and in `describe().entities` when some `senses` returns true. `shownAs` replaces the shown id of creatures (not the hero) and of live floor objects in the view and in `describe()`. Memory always keeps the true shown id.

**Light sources.** Each `PerceptionDef.lights` returns light sources; those on the current level light, for the hero, every cell within the source's circle (`circle_data`, radius clamped to 0..15) that the source can see, as if `Level.lit` were set there (ref: src/light.c do_light_sources). A source on the hero's cell uses her own line of sight; any other source uses shadowcasting from its cell. The hero still needs line of sight, and the dark-corridor rule for walls and doors applies to light from both kinds. `computeVisible(level, rules, from, lights?, blocked?)` takes them; core's `heroLights(registry, state)` collects them.

**Containers.** An item inside a container has `containedIn` set, no `pos` and `carriedBy: null`, so floor piles (`itemsAt`, `topObjects`), `inventoryOf`, `describe()` and the view never see it. Core's `objects.ts` helpers keep the one-place rule: `contents(state, box)` lists what is directly inside, newest first; `putIn(registry, state, box, item)` requires a detached item (like `add_to_container()` requires a free object), refuses non-containers and nesting loops, and does not merge stacks (content merges first); `takeOut(state, item)` leaves the item detached for the caller to place. `allContents(state, box)` lists nested contents too. Testkit checks that a contained item's container is an existing container item, with no loop.

**Traps.** A `TrapDef` (`{ id, nameKey, glyph, hole? }`) only names and draws a trap; its effects belong to content. Traps live in `Level.traps` and change only through `ctx.placeTrap` (which replaces a trap on the same cell and throws unless the cell is *plain floor*: passable terrain with no `door`, `stairs` or `looksLike`) and `ctx.removeTrap`. Game logic finds traps with core's `trapAt(level, x, y)`, seen or not. Players only learn of a trap when content sets `seen` (it went off, or a search found it): `query.trapAt` and `describe().trap` report seen traps only, and the snapshot shows them as `ViewCell.t`, visible or remembered. Renderers draw monster > object > trap > terrain. Vanilla's effects are content's `trap.ts` (`dotrap`, `mintrap`); a kind whose code sits above `trap.ts` in the module graph (the magic trap and the anti-magic field, `magictrap.ts`, which tames and uncurses through modules that import `trap.ts`) hands its effects in at registration with `setTrapEffect`. Per-level teleport and digging rules (Sokoban's `noteleport`, `hardfloor`, non-diggable walls) are a content table keyed by LevelDef id (`levelflags.ts`), as the level fixups are, so they add nothing to `Level` or the save.

**Monster memory.** `refreshVision` updates `monsterMemory` for the cells now visible: a live monster there is recorded, an empty cell is cleared. Cells out of view keep their entry, so a monster glyph stays where it was last seen until that cell is seen again. The snapshot exposes it as `ViewCell.m` on cells that are not visible, and live monsters stay in `entities` only, never duplicated as `m`. Deltas include `m` changes.

## Randomness

- `ctx.rng` (`state.rng.core`) drives every gameplay outcome. `ctx.cosmetic` (`state.rng.cosmetic`) is for flavour that never affects outcomes, so adding a cosmetic roll can't shift the gameplay stream.
- sfc32, seeded by splitmix32(seed), throws away its first 12 outputs. Helpers: `rn2(x)` ∈ [0, x), `rnd(x)` ∈ [1, x], `d(n, s)`. `Rng` is a thin wrapper that reads and writes the `RngState` array in place.
- `core` and `content` ban `Math.random`, `Date`, `performance`, `crypto` and `for…in` through lint.

## Actions, steps and turns

```ts
type Dir = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
type PlayerAction =
  | { type: 'move'; dir: Dir }
  | { type: 'wait' }
  | { type: 'search' }
  | { type: 'answer'; promptId: string; value: Json } // prompt reply
  | { type: 'continue' } // performs the next move of state.occupation (no-op without one)
  | { type: 'mod'; action: DefId; args?: Json }; // mod-defined action

interface StepResult {
  state: GameState;
  events: GameEvent[];
  prompt: Prompt | null;
  continuing: boolean; // state.occupation is set: send { type: 'continue' } for the next move
}

type GameEvent =
  | { type: 'msg'; key: string; params?: Record<string, string | number> }
  | { type: 'moved'; id: EntityId; from: Pos; to: Pos }
  | { type: 'doorOpened'; pos: Pos }
  | { type: 'blocked'; pos: Pos; terrain: DefId }
  | { type: 'turnEnded'; turn: number }
  | { type: 'searched' }
  | { type: 'list'; titleKey: string; items: Msg[]; ask?: string } // informational sheet (discoveries); ask: a y/n/q question first (game over)
  | { type: 'mod'; mod: string; name: string; data: Json };

interface Prompt {
  id: string;
  kind: 'yn' | 'direction' | 'menu' | 'text'; // 'text' is answered with a string of at most maxLength characters (null cancels)
  key: string;
  params?: Params;
  options?: { value: Json; key: string; params?: Params; glyph?: DefId; max?: number }[]; // max: a count 1..max may be chosen (a stack size)
  multi?: boolean; // menus only: the answer is the array of chosen values ([] = none); an option with max may be answered as { value, count }
  maxLength?: number; // text prompts: the longest accepted answer
  numeric?: boolean; // text prompts: a whole number (gold to donate); the UI shows a number pad and takes digits only, the answer stays a string
  cancellable?: boolean; // single-select menus and yn: Cancel and Escape answer null (NetHack's ESC)
}
```

`createEngine(mods: Mod[])` returns:

```ts
interface Engine {
  newGame(opts: { seed: number; width?: number; height?: number; role?: DefId }): StepResult; // events include 'welcome'
  step(state: GameState, action: PlayerAction): StepResult; // mutates state in place; ONE move of a multi-turn action
  stepAll(state: GameState, action: PlayerAction): StepResult; // step, then `continue` until done (up to MAX_REPEAT); for tests and tools
  query(state: GameState): CoreQuery;
  save(state: GameState, replay: Replay): string;
  load(text: string): { state: GameState; replay: Replay };
}
```

Each step does the following (ref: src/allmain.c moveloop_core):

1. If the game is over, the step throws. If a prompt is pending, the action must be its `answer`, which goes to the handler's `answer()`.
   Any action other than `continue` first clears `state.occupation` (this is how input cancels a multi-turn action). `continue` takes the action to perform from `state.occupation.action` instead (and does nothing without one). If the action's def has `continues`, the engine sets `state.occupation = { action: <clone>, data: null }` before performing a fresh action.
2. `beforeAction` hooks run, and any of them may cancel the action (which also clears the occupation).
3. The action's `perform` runs and returns its energy cost. The default cost is 12, and a cost of 0 means no time passes (for example, bumping a wall). Vision is refreshed.
4. `afterAction` hooks run.
5. Until the hero has 12 energy again (ref: src/mon.c movemon):
   - every monster on the current level with at least 12 energy pays 12 and runs its brain's `act`, in sorted id order;
   - this repeats while any monster can still act;
   - otherwise the turn ends: monsters gain `brain.movement()` (or their speed), the hero gains speed, `turn++`, due timers fire, and the `endOfTurn` hooks run.
6. Vision is recomputed and memory updated.
7. The occupation is kept only if the move took time (cost > 0), nothing called `ctx.interrupt()`, there is no game over or prompt, and the def's `continues(ctx, action)` returned true. Otherwise it is cleared. `StepResult.continuing` says whether it is still set. The step ends here: one move per `step()`.

A multi-turn action (travel, running, eating) is therefore a series of steps. The UI sends `{ type: 'continue' }` after a short delay while `continuing` is true, which animates the move and lets any other input cancel it by sending (or just swallowing and not sending) a different action. Per-move progress belongs in `state.occupation.data` (JSON; `null` on the first move), never in module variables, so the state can be saved, loaded and replayed in the middle of a travel. `engine.stepAll` loops `continue` until the occupation ends or `MAX_REPEAT` continues were made.

The game stops at once (mid-turn, too) when `ctx.endGame` is called or a prompt is raised.

**The end-of-game disclosure (m8).** At game over content identifies the pack (C's really_done() loop) and emits its disclosure lists as `'list'` events with `ask` set (a message key: "Do you want your possessions identified?"). The UI asks each question with Yes / No / Quit before showing the list (Quit skips every later asking list, C's `done_stopprint`), then shows the tombstone and the summary. The answers change nothing in the game, so they are UI questions: they never become actions, prompts or replay entries, and a dead hero needs no extra step. `ask` was added to the core event type for this; it is optional and additive (events are never saved or replayed, and a list without it shows at once as before). Content does this work in a `beforeGameOver` hook at priority -1000, so it runs only once every other hook has let the game end: **a mod's `beforeGameOver` hook must use a priority above -1000 to be able to cancel** a game over.

Messages are always keys plus params. English text lives in `content/src/messages.en.ts` and is loaded on the client side.
A string param that starts with `@` is itself a message key, which the UI translates before interpolating. For example, `{ key: 'welcome', params: { role: '@role.valkyrie' } }` becomes "… You are a Valkyrie.".
A string param that starts with `=` is a proper name (a shopkeeper's, 6b3): the UI prints the rest as is and the `|the`, `|The` and `|an` modifiers add no article (`{mon|The_s}` with `'=Izchak'` is "Izchak's").
`{mon|plural}` is the English plural of the param's text (m8, the vanquished list: `{ n: 3, mon: '@nh:jackal' }` in "{n} {mon|plural}" is "3 jackals"; a port of C's makeplural(), in `ui/src/plural.ts`), so monster names need no plural keys.

Due timers fire at the end of each turn, before the `endOfTurn` hooks, in `(at, seq)` order.

## Mods

```ts
interface Mod {
  id: string;
  version: string;
  dependsOn?: string[];
  register(api: ModApi): void;
}

interface TerrainDef {
  id: DefId;
  nameKey: string;
  passable: boolean;
  opaque: boolean;
  door?: 'closed' | 'locked' | 'open' | 'doorway'; // locked is a closed door that does not open (ref: rm.h D_LOCKED)
  stairs?: 'up' | 'down';
  glyph: { ch: string; fg: string };
}
interface RoleDef {
  id: DefId;
  nameKey: string;
  speed: number;
  glyph: { ch: string; fg: string }; // the player entity's def is the role id
  movement?(ctx: Ctx, hero: EntityId): number; // per-turn movement (ref: src/allmain.c u_calc_moveamt)
}
interface ActionDef {
  id: DefId;
  labelKey: string;
  offer(ctx: Ctx, target: Target): Omit<ActionOffer, 'source'>[]; // the engine adds `source`
  perform(ctx: Ctx, action: PlayerAction): number; // energy cost
  handles: PlayerAction['type']; // at most one handler per built-in type; mod actions use 'mod'
  answer?(ctx: Ctx, value: Json, data: Json): number; // answers a prompt this action raised
  continues?(ctx: Ctx, action: PlayerAction): boolean; // multi-turn actions: true keeps state.occupation set (see step 7)
}
interface MonsterDef {
  // ref: include/permonst.h struct permonst
  id: DefId; nameKey: string; glyph: { ch: string; fg: string };
  level: number; speed: number; ac: number; mr: number; alignment: number;
  attacks: { at: AttackType; ad: string; n: number; d: number }[]; // at most 6
  size: 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gigantic';
  flags: string[]; frequency: number; group: 'small' | 'large' | null; genFlags: string[];
  difficulty: number;
  resists: string[]; conveys: string[]; // mresists / mconveys, lowercased MR_ names: 'fire', 'cold', 'sleep', 'disint', 'elec', 'poison', 'acid', 'stone'
  weight: number; nutrition: number; // corpse cwt / cnutrit
  brain: DefId; // must name a registered BrainDef (checked after all mods load)
  sound?: MonsterSound; // msound, what #chat gets: 'bark' | 'mew' | 'squeak' | 'orc' | 'humanoid' | 'soldier' | 'priest' | 'sell' | 'groan' | 'djinni' | ... (MS_ names lowercased; 'groan' and 'djinni' added additively in m7c step 2 for zombies and the water demon); absent = silent
}
interface ObjectDef {
  // ref: include/objclass.h struct objclass
  id: DefId; nameKey: string;
  class: 'weapon' | 'armor' | 'ring' | 'amulet' | 'tool' | 'food' | 'potion' | 'scroll' | 'spellbook' | 'wand' | 'coin' | 'gem' | 'rock'; // 'rock' = ROCK_CLASS (m7b)
  glyph: { ch: string; fg: string };
  descKey?: string; // fixed unidentified description; shuffled classes use appearances instead
  prob: number; weight: number; cost: number; material: string;
  merge: boolean; magic: boolean; delay: number;
  weapon?: { small: Dice; large: Dice; hitBonus: number; skill: string; bimanual: boolean; kind: 'pierce' | 'slash' | 'whack'; role?: 'launcher' | 'ammo' | 'missile' }; // launchers fire ammo of the same skill; missiles (darts) are thrown by hand
  armor?: { slot: ArmorSlot; ac: number; mc: number };
  food?: { nutrition: number };
  prop?: string; // oc_oprop: property conferred when worn (content-defined key, as in props)
  wand?: { dir: 'nodir' | 'immediate' | 'ray' }; // oc_dir; required for class 'wand'
  container?: { capacity: number | null; box: boolean; holding?: boolean }; // box: large box/chest (lockable); holding: bag of holding
  spellbook?: { level: number }; // 1..7 (0 for blank paper); required for class 'spellbook'
  boulder?: true; // m7b: blocks sight where it lies (sightBlockers) and lies on top of its pile; pushing is content's
  use?(ctx: Ctx, user: EntityId, item: EntityId): void; // quaff/read effect
  zap?(ctx: Ctx, user: EntityId, item: EntityId, dir: Dir | 'self' | null): void; // weffects; null for nodir
}
interface AppearanceDef { id: DefId; nameKey: string; class: ObjectClass; glyph: Glyph } // "ruby potion"
interface StatusDef {
  id: DefId;
  field: string; // key in ViewSnapshot.status; may replace a built-in field
  value(state: Readonly<GameState>, defs: Registry): string | number | null; // null leaves it out
}
type ItemNamer = (state: Readonly<GameState>, defs: Registry, item: Entity) => Msg; // doname
interface BrainDef {
  id: DefId;
  act(ctx: Ctx, self: EntityId): void; // the engine has already deducted 12 energy
  movement?(ctx: Ctx, self: EntityId): number; // per-turn movement (ref: src/mon.c mcalcmove)
}
interface PerceptionDef {
  // how the hero perceives the map beyond plain sight; read-only and deterministic (no RNG)
  id: DefId;
  blind?(state: Readonly<GameState>, defs: Registry): boolean; // any true: no cell is visible
  senses?(state: Readonly<GameState>, defs: Registry, mon: Entity): boolean; // shown though unseen (telepathy)
  shownAs?(state: Readonly<GameState>, defs: Registry, e: Entity): DefId | null; // disguise (hallucination); first answer wins
  lights?(state: Readonly<GameState>, defs: Registry): { level: LevelId; x: number; y: number; radius: number }[]; // light sources (lit lamps)
}

interface ModApi {
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
  defineTrap(d: TrapDef): void; // { id, nameKey, glyph, hole? }
  defineDungeon(d: DungeonDef): void; // see Dungeons
  defineLevel(d: LevelDef): void; // see Level definitions
  setItemNamer(fn: ItemNamer): void; // the last mod to set it wins; core has a plain default
  on<K extends keyof Hooks>(hook: K, fn: Hooks[K], opts?: { priority?: number }): void;
}

interface Hooks {
  beforeAction(ctx: Ctx, a: PlayerAction): 'continue' | 'cancel';
  afterAction(ctx: Ctx, a: PlayerAction): void;
  endOfTurn(ctx: Ctx): void;
  newGame(ctx: Ctx, hero: EntityId): void; // once, before the first level exists
  newLevel(ctx: Ctx, level: Level): void; // when a level is first generated
  levelChange(ctx: Ctx, c: { from: LevelId | null; fromPos: Pos | null; to: LevelId }): void; // the hero arrived: at new game (from null, after placement) and after goToLevel (pets follow here)
  beforeGameOver(ctx: Ctx, over: GameOver): 'continue' | 'cancel'; // in ctx.endGame(), before the game ends; 'cancel' keeps it going (wizard mode's "Die?")
}

interface TimerDef {
  id: DefId;
  fire(ctx: Ctx, data: Json): void;
}

interface Ctx {
  readonly state: GameState;
  rng: Rng;
  cosmetic: Rng;
  schedule(delay: number, kind: DefId, data: Json): void; // timer fires `delay` turns from now
  defs: Registry;
  emit(e: GameEvent): void;
  query: CoreQuery;
  spawn(e: Omit<Entity, 'id'>): EntityId;
  remove(id: EntityId): void; // never the hero; a container takes its contents with it (obfree delete_contents)
  goToLevel(to: LevelRef, at: 'up' | 'down' | 'branch' | 'random'): void; // generates the level on first visit; arrive on that staircase, or on a random trap-free room floor cell (u_on_rndspot); throws outside the layout
  placeTrap(level: LevelId, t: Trap): void; // replaces a trap on the cell; throws unless plain floor
  removeTrap(level: LevelId, pos: Pos): void;
  ask(prompt: Prompt, handler: DefId, data: Json): void;
  interrupt(): void; // stop a multi-turn action
  endGame(over: GameOver): void; // runs the beforeGameOver hooks first; the caller checks state.gameOver afterwards
}
```

Inside `offer()` and queries, every mutating `Ctx` member throws, and so do `rng` and `emit`.

- Hooks run in a fixed order: priority descending, then mod load order, then registration order.
- The loader validates every definition and fails loudly with `ModLoadError { modId, defId?, path, reason }`. It rejects:
  - ids that aren't namespaced, or whose namespace isn't the registering mod's id
  - duplicate ids
  - missing references
  - unknown or cyclic `dependsOn`
  - unknown hook names
  - malformed fields
- **Vanilla gets no special access.** `@nh/content` exports `vanillaMod` (id `nh`), which registers terrain, the stub role, monsters, their brain, actions and its hooks (hero stats, regeneration, generation) through `ModApi`.
- Game mods are recorded in saves as `ModRef[]`. Loading a save with a different mod list fails with a clear error.
- **Wizard mode is an ordinary game mod.** `@nh/content` also exports `wizardMod` (id `wiz`, depends on `nh`, def ids `wiz:*`, code in `packages/content/src/wizard/`), NetHack's `-D` debug mode. It is not part of `vanillaMod`: the app loads `[vanillaMod, wizardMod]` for `?wizard=1`, and the save's mod list (`nh@…, wiz@…`) keeps a wizard game a wizard game (see Worker protocol). It registers only through `ModApi`: actions offered on `{ kind: 'self' }` (`wiz:map`, `wiz:where`, `wiz:levelport`, `wiz:wish`, `wiz:identify`, `wiz:genesis`), the `wiz:die` prompt handler and a `beforeGameOver` hook. Loading it draws no random numbers, so a seed builds the same game with or without it. "Die?": content's `done()` calls `ctx.endGame()`; the hook asks a yn prompt and cancels for deaths (not escapes); `done()` then sees the game still going and runs `savelife()`, as after life saving, and the engine's prompt pause stops time until the answer, which either ends the game with the recorded `GameOver` or says "OK, so you don't die." The hook is the one core interface the mod needed: a death happens deep inside a monster's move, and nothing else lets another mod stop the game from ending. A future score list must skip games whose mod list includes `wiz` (ROADMAP).
- **Typed names go through the message catalog.** The wish parser (`content/src/objnam_read.ts readobjnam()`) and genesis (`nameToMon()`) match what the player types against names built from the English catalog (`wishNames(state, defs, messagesEn)`): object names stripped to NetHack's `objects[]` form ("potion of healing" -> "healing"), this game's appearances, fixed descriptions, called names and monster names. The parser returns a plain `WishSpec`; making the object (`wish.ts mkWished()`, which draws the RNG) is separate, so a later wand of wishing reuses both. A different-language client would need its own catalog passed in.

## Queries

```ts
type Target =
  | { kind: 'self' }
  | { kind: 'cell'; pos: Pos }
  | { kind: 'entity'; id: EntityId }
  | { kind: 'item'; id: EntityId }; // the hero's own items only; anything else offers nothing
interface ActionOffer {
  action: PlayerAction;
  labelKey: string;
  params?: Record<string, string | number>;
  priority?: number; // higher first in actionsFor: what the place suggests (pick up, open a door)
  source: string;
}

interface CoreQuery {
  describe(pos: Pos): {
    terrain: DefId | null;
    remembered: boolean;
    visible: boolean;
    entities: { id: EntityId; def: DefId }[]; // creatures
    objects: { id: EntityId; def: DefId; name: Msg }[]; // top of the pile first, shown ids
    trap: DefId | null; // a trap the hero has seen here
  };
  actionsFor(target: Target): ActionOffer[]; // the union of every ActionDef.offer, by offer priority (higher first), then registration order
  pathTo(pos: Pos): Pos[] | null; // A*, 8-dir, over remembered passable cells; excludes start
  trapAt(level: LevelId, pos: Pos): Readonly<Trap> | null; // seen traps only
}
```

Queries only answer from what the player knows: memory and the currently visible cells. `actionsFor` is the single source of available actions. The UI's touch menus and the soak bot both use it, so no feature needs a keyboard.

## View boundary

```ts
interface ViewCell {
  g: DefId | null; // remembered terrain glyph key
  v: boolean; // visible now?
  o?: DefId; // top object's shown id: live when visible, remembered otherwise
  m?: DefId; // monster remembered on a cell not seen now; live monsters are only in `entities`
  t?: DefId; // a trap the hero has seen; drawn under objects
}
interface ViewItem { id: EntityId; letter: string | null; g: DefId; cls: ObjectClass; name: Msg; equipped: EquipSlot | null }
interface ViewEntity {
  id: EntityId;
  g: DefId; // perception may disguise it (hallucination)
  x: number;
  y: number;
  tame?: true; // the hero's pet (hilite_pet)
}
interface ViewSnapshot {
  kind: 'full';
  levelId: LevelId;
  width: number;
  height: number;
  legend: Record<DefId, { ch: string; fg: string }>; // default glyphs from defs; client mods may override
  cells: ViewCell[];
  entities: ViewEntity[];
  player: { id: EntityId; x: number; y: number };
  turn: number;
  status: Record<string, string | number>;
  inventory: ViewItem[]; // the hero's items in letter order
}
interface ViewDelta {
  kind: 'delta';
  turn: number;
  cells: [index: number, cell: ViewCell][]; // only changed cells
  entities: ViewEntity[]; // full visible list (small)
  player: { id: EntityId; x: number; y: number };
  status: Record<string, string | number>;
  inventory: ViewItem[]; // full list
}

interface Renderer {
  mount(el: HTMLElement): void;
  apply(v: ViewSnapshot | ViewDelta): void;
  setGlyph(id: DefId, glyph: { ch: string; fg: string }): void;
  cellAt(clientX: number, clientY: number): Pos | null;
  resize(): void;
  destroy(): void;
}
```

Renderers draw only the cells inside the camera. The camera follows the player with a dead zone, so levels of any size scroll.

`status` always has `dlvl` and `turn`. When the hero has the matching components it also has `hp`, `hpmax`, `ac`, `xl`, `xp` and `str`/`int`/`wis`/`dex`/`con`/`cha`. After the game ends it adds `dead` (`'died' | 'escaped'`), `killer`, `endTurn`, `endDepth` and `endLevel`. Mods add fields with `defineStatus` (content adds `ac`, `gold`, `hunger`, `encumbrance`, and `pw`/`pwmax` for spell energy, which the ui prints as `Pw:2(2)` after HP). Fountains (7c) needed none either: each fountain's magic, looted and warned bits live in `modData.nh.fountains` (`{ [levelId]: { [cellIndex]: bits } }`, dropped at 0), and the luckstone's Luck is worked out from the inventory on read. Spellcasting (7a) needed no core change: the hero's energy and spell state live in content's `modData.nh.pw` and `modData.nh.uspell`, monster spell delays and confusion in `modData.nh.mspecUsed` / `mconf`, like luck, hunger and shops before them. The legend covers terrain, roles, monsters, objects, appearances and traps.

**Objects never leak identity.** `entities` lists creatures only; objects appear as `ViewCell.o`, in `inventory` and in `describe().objects`, always by *shown id*: `state.appearances[def] ?? def`. Names come from the item namer, which only uses what the hero knows (`discovered`, `known`).

## Client mods

```ts
type UiCommand = { type: 'action'; action: PlayerAction } | { type: 'ui'; id: string };
interface ClientMod {
  id: string;
  version: string;
  register(api: ClientApi): void;
}
interface ClientApi {
  bindKey(key: string, cmd: UiCommand): void; // key = KeyboardEvent.key or .code, or 'Ctrl+d' / 'Alt+l'
  addMessages(locale: string, catalog: Record<string, string>): void;
  setGlyph(id: DefId, glyph: { ch: string; fg: string }): void;
  onEvent(fn: (e: GameEvent) => void): void;
  addMenuItem(item: { id: string; labelKey: string; run(): void }): void;
}
```

Client mods run in the UI and are never saved. The default keymap is itself a client mod.

**Position cursor.** Look (`;` or the Look button) puts a keyboard cursor on the hero (NetHack's `getpos()`, `packages/ui/src/getpos.ts`): direction keys resolved through the keymap move it, `.` `,` `;` `:` pick, Esc cancels, `m`/`o`/`@`/`<`/`>` jump. It works on the UI's own copy of the last `ViewUpdate` (never `GameState`); a tap still picks a cell directly. A renderer shows it by implementing the optional `setCursor(pos | null)` (feature-detected, like `flash()`), and the ASCII renderer's camera then follows the cursor instead of the hero. Core has no position prompt; any future one should reuse this cursor.

## Worker protocol

```ts
type ToCore =
  | { t: 'new'; seed: number; width: number; height: number }
  | { t: 'load'; save: string }
  | { t: 'act'; action: PlayerAction }
  | { t: 'query'; id: number; q: keyof CoreQuery; args: Json[] }
  | { t: 'save' }
  | { t: 'hash' };
type FromCore =
  | { t: 'view'; view: ViewSnapshot | ViewDelta; events: GameEvent[]; prompt: Prompt | null; continuing: boolean }
  | { t: 'reply'; id: number; result: Json }
  | { t: 'saved'; save: string }
  | { t: 'hash'; hash: string }
  | { t: 'error'; message: string };

interface Replay {
  seed: number;
  width: number;
  height: number;
  mods: ModRef[];
  actions: PlayerAction[];
}
// Save text = JSON.stringify({ format: 'nh-ts', version: 8, mods, state, replay }) // v3-v6 saves migrate by adding occupation: null, monsterMemory: {} and traps: [] on every level, a root-only layout (no bottom, no branches) and dungeon/dlevel = root/depth and branch: null on every level; v3-v7 layouts get special: [] (an old game has no special levels, so its Mines never gets a Minetown). M7b's layout `entry`, branch `dir` and `Level.sokoban` are optional and need no bump: an old game has no Oracle or Sokoban in its layout
```

After `new` or `load`, the host sends a full snapshot. After each `act`, it sends a delta. Every action, including each `continue`, is appended to the replay, and replaying `{ seed, width, height, mods, actions }` must reproduce `stateHash`.

The app's worker adds one message of its own in front of the host (`packages/app/src/modhost.ts`): `{ t: 'mods'; ids: string[] }` names the game mods (`nh`, `wiz`) and replaces the host, so the app sends it right before `new` or `load`. A stored save is loaded with the mods its file lists, so a wizard game stays a wizard game; new games load `[nh]`, or `[nh, wiz]` with `?wizard=1`. `wizard=1` over a save made without the wizard mod starts a new wizard game, like `new=1` or an explicit seed. The UI's "Wizard" status word comes from that mod list, not from `GameState`.

## Package boundaries

| Package                                    | May depend on                             |
| ------------------------------------------ | ----------------------------------------- |
| core                                       | nothing                                   |
| content, testkit                           | core (testkit tests may also use content) |
| ui, render-ascii, render-canvas, modern-ui | core, `import type` only                  |
| app                                        | everything                                |

`vendor/nethack` is reference only. dependency-cruiser enforces this table (`pnpm boundaries`).
