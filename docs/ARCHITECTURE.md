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
type Params = { [k: string]: string | number | Msg }; // '@key' strings are keys too
type RngState = [number, number, number, number]; // sfc32
interface ModRef {
  id: string;
  version: string;
}

interface GameState {
  version: 7;
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
}

interface Room {
  lx: number;
  ly: number;
  hx: number;
  hy: number;
  lit: boolean;
} // interior bounds, inclusive
// ref: include/dungeon.h struct dungeon, struct branch
interface DungeonLayout {
  id: DefId; // DungeonDef
  depthStart: number; // absolute depth of its top level
  levels: number | null; // null = no bottom
  branches: { to: DefId; dlevel: number }[]; // where its branches leave it
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
  traps: Trap[]; // sorted by cell index; plain floor only
}
// ref: include/trap.h struct trap
interface Trap { def: DefId; x: number; y: number; seen: boolean; once?: boolean; data?: Json }
```

The state is JSON-plain: saving is `JSON.stringify`, and `stateHash(state)` is a hash of canonical (key-sorted) JSON. The level size is a parameter, and 80×21 is only the default.

**Dungeons.** A `DungeonDef` (`{ id, nameKey, levels?: { base, range? }, entry?: { from, base, range? }, filler? }`) describes a chain of levels; `levels` omitted means no bottom. Every dungeon but the root has an `entry`: branch stairs down from level `base` (or one of `range` levels from it) of dungeon `from` to its top level, so a mod can attach a dungeon to another mod's. Without any DungeonDef the engine uses `DEFAULT_DUNGEON` (`core:dungeon`, endless). `loadMods` reports an unknown `entry.from`, an entry below its parent's bottom, a missing or second root and loops; `registry.dungeons` is root first, then breadth-first with each dungeon's children in registration order. At new game, before the `newGame` hooks, `rollDungeons` rolls each size as `base + rn2(range)` and each entry's level in its parent (cut at the parent's bottom, skipping levels that already hold a branch end); a branch dungeon starts one level below its branch level (ref: src/dungeon.c init_dungeons(), parent_dlevel(), init_dungeon_set_depth()). Fixed sizes and no branches draw no random numbers. Vanilla registers `nh:main` (endless) and `nh:mines`, the Gnomish Mines: `levels: { base: 8, range: 2 }`, `entry: { from: 'nh:main', base: 2, range: 3 }`, `filler: 'nh:minefill'` (a port of `minefill.lua` in `packages/content/src/dungeon.ts`, a worked example of a LevelDef). Helpers: `rootDungeon(state)`, `dungeonLayout(state, id)`, `levelIdFor(state, ref)`, `depthOf(state, ref)`, `levelStairs(state, ref)`.

**Stairs.** `levelStairs` decides a new level's stairs (ref: src/mklev.c generate_stairs(), place_branch()): up stairs except on a branch dungeon's top level, down stairs except on a dungeon's last level, and `Level.branch` (`{ pos, to: LevelRef, dir }`) on the level a branch leaves from (down) and on the branch's top level (up). The generator puts branch stairs after the corridors, in a random room without stairs when there is one, using the ordinary stair terrain. Content's `>`/`<` on branch stairs call `goToLevel(branch.to, 'branch')`, arriving on the other end's branch stairs. Only one branch per level is supported.

**Level definitions.** A `LevelDef` is a level written as plain JSON data, with no functions, so a mod (or an AI reading this section) can add a level by writing one object. It is the counterpart of a NetHack `dat/*.lua` file. A dungeon uses it for its ordinary levels through `DungeonDef.filler`; without a filler they come from the rooms-and-corridors generator.

```ts
interface LevelDef {
  id: DefId; // 'mymod:name'
  init: // how the map starts (ref: src/sp_lev.c splev_initlev())
    | { style: 'rooms' } // the ordinary generator; its rooms are filled as usual
    | { style: 'solidfill'; fg: DefId; lit?: boolean } // every cell is terrain fg; lit omitted = coin flip
    | { style: 'mines'; fg: DefId; bg?: DefId; smoothed?: boolean; joined?: boolean;
        walled?: boolean; lit?: boolean }; // a cave of fg in bg (default stone); see below
  contents?: LevelContent[]; // made in order, after the map and stairs
}
interface LevelContent {
  kind: 'monster' | 'object' | 'trap';
  id?: DefId; // a MonsterDef, ObjectDef or TrapDef
  class?: string; // monster: a glyph character ('G'); object: an ObjectClass ('gem'); traps have none
  count?: number | { min: number; max: number }; // default 1; min..max inclusive
  percent?: number; // 0..100, rolled once for the whole entry before its count
}
```

With neither `id` nor `class` the thing is random: `makemon` with a random type (and its group), `mkobj` of a random class, or a random trap kind for the level's difficulty. A monster class picks with `mkclass()` (ref: src/makemon.c), which may choose `nogen` monsters as special levels do. Every thing goes on a random *dry* spot of the whole map: passable terrain that is not a door, so floor, corridor or stairs (ref: src/sp_lev.c get_location(), is_ok_location() DRY; 100 random tries, then the first in column order); a monster whose spot is taken goes to a close free one (`enexto`); traps need plain floor. Holes become falling rock traps where one cannot fall through (ref: src/mklev.c mktrap()).

Stairs are not part of the LevelDef: the dungeon decides which a level gets (see Stairs), and core puts them on random floor or corridor cells, up stairs first, then down, then branch stairs (ref: src/sp_lev.c lspo_stair() with good_stair_loc(); src/mkmaze.c place_lregion()). A `solidfill` map with no floor or corridor cannot hold stairs and throws when built.

`loadMods` validates every LevelDef and reports each problem with its path: an unknown `init.style`, a missing `fg`, a `bg` that is not a string, a `smoothed`/`joined`/`walled`/`lit` that is not a boolean, an unknown `contents[i].kind`, both `id` and `class`, a class on a trap, an object class that is not an ObjectClass, a monster class longer than one character, a bad `count` (`min > max`, negative, not an integer) or `percent` outside 0..100; and, once every mod has registered, a `fg` or `bg` that is not a terrain, an `id` that is not a def of its kind, a monster class no monster has, and a `filler` that is not a LevelDef. `registry.level(id)` and `registry.levels` list them.

The `mines` style is NetHack's cellular-automaton cave (ref: src/mkmap.c mkmap()); `minefill.lua` uses `{ style: 'mines', fg: 'nh:floor', smoothed: true, joined: true, walled: true }`. About 2/5 of the inner cells start as `fg`, then a birth/death pass and a thinning pass run; `smoothed` adds two passes that drop cells with fewer than 3 open neighbours; `joined` fills in regions of 3 cells or fewer and digs a winding path of `fg` from each region to an earlier one, so all open cells are one 8-connected area; `walled` turns each `bg` cell next to `fg` into a wall and then picks the wall piece that joins its neighbours (corners, T-walls `tuwall tdwall tlwall trwall` and `crwall`, ref: src/sp_lev.c wallify_map(); src/mkmaze.c wall_cleanup(), fix_wall_spines()). `lit` omitted is a coin flip; a lit cave lights its `fg` cells and walls, never `bg`. Open cells never touch the map edge, so the walls fit. Cave levels have the five T-wall terrains (`LevelTerrain` keys `CAVE_PALETTE_KEYS`) after the usual palette, and no rooms. The map must be at least `MIN_MKMAP_WIDTH` x `MIN_MKMAP_HEIGHT` (10x10); a small map that comes out with fewer than 4 open cells is made again from the continuing RNG stream. Stairs go on its `fg` cells when `fg` is the floor terrain.

Core's `buildLevel(rng, opts, def)` lays out the terrain and stairs and sets `Level.def`; content's `newLevel` hooks fill it (`mklev.ts` fills the rooms of ordinary and `rooms` levels, then `sp_lev.ts` makes `contents`).

**Terrain rules.** `cellRules(level, registry)` flattens the palette into per-cell flag arrays: `passable`, `opaque`, `closedDoor` (closed *or* locked, so travel paths go through doors as `test_move` does for `TEST_TRAV`), `lockedDoor` (locked only) and `intactDoor` (doors that block diagonal moves). `checkStep` returns `ok` or a reason: `bounds`, `blocked`, `closedDoor`, `lockedDoor` or `diagonalDoor`. `lockedDoor` is checked before `closedDoor`; content turns it into "This door is locked." with no time passing. Levelgen draws NetHack's exact `dodoor`/`dosdoor` rolls and so makes locked doors (about 1/3 * 4/5 * 1/6 of doors) and locked secret doors (1 in 5 below depth 2); trapped doors are not made, though their rolls are still drawn.

**Vision.** A cell is seen when it is in line of sight and either adjacent to the hero or lit. A lit cell that blocks sight (a wall or closed door) is seen from afar only if its neighbor one step toward the hero is also lit, which hides lit room walls at the end of dark corridors (ref: src/vision.c vision_recalc()).

**Perception.** Every `PerceptionDef` is consulted. If any `blind` returns true, `refreshVision` makes no cell visible, so nothing new is remembered (content may "feel" cells by writing `state.memory` itself). A monster on a cell that is not visible is still in `ViewSnapshot.entities` and in `describe().entities` when some `senses` returns true. `shownAs` replaces the shown id of creatures (not the hero) and of live floor objects in the view and in `describe()`. Memory always keeps the true shown id.

**Light sources.** Each `PerceptionDef.lights` returns light sources; those on the current level light, for the hero, every cell within the source's circle (`circle_data`, radius clamped to 0..15) that the source can see, as if `Level.lit` were set there (ref: src/light.c do_light_sources). A source on the hero's cell uses her own line of sight; any other source uses shadowcasting from its cell. The hero still needs line of sight, and the dark-corridor rule for walls and doors applies to light from both kinds. `computeVisible(level, rules, from, lights?)` takes them; core's `heroLights(registry, state)` collects them.

**Containers.** An item inside a container has `containedIn` set, no `pos` and `carriedBy: null`, so floor piles (`itemsAt`, `topObjects`), `inventoryOf`, `describe()` and the view never see it. Core's `objects.ts` helpers keep the one-place rule: `contents(state, box)` lists what is directly inside, newest first; `putIn(registry, state, box, item)` requires a detached item (like `add_to_container()` requires a free object), refuses non-containers and nesting loops, and does not merge stacks (content merges first); `takeOut(state, item)` leaves the item detached for the caller to place. `allContents(state, box)` lists nested contents too. Testkit checks that a contained item's container is an existing container item, with no loop.

**Traps.** A `TrapDef` (`{ id, nameKey, glyph, hole? }`) only names and draws a trap; its effects belong to content. Traps live in `Level.traps` and change only through `ctx.placeTrap` (which replaces a trap on the same cell and throws unless the cell is *plain floor*: passable terrain with no `door`, `stairs` or `looksLike`) and `ctx.removeTrap`. Game logic finds traps with core's `trapAt(level, x, y)`, seen or not. Players only learn of a trap when content sets `seen` (it went off, or a search found it): `query.trapAt` and `describe().trap` report seen traps only, and the snapshot shows them as `ViewCell.t`, visible or remembered. Renderers draw monster > object > trap > terrain.

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
  | { type: 'list'; titleKey: string; items: Msg[] } // informational sheet (discoveries)
  | { type: 'mod'; mod: string; name: string; data: Json };

interface Prompt {
  id: string;
  kind: 'yn' | 'direction' | 'menu' | 'text'; // 'text' is answered with a string of at most maxLength characters (null cancels)
  key: string;
  params?: Params;
  options?: { value: Json; key: string; params?: Params; glyph?: DefId; max?: number }[]; // max: a count 1..max may be chosen (a stack size)
  multi?: boolean; // menus only: the answer is the array of chosen values ([] = none); an option with max may be answered as { value, count }
  maxLength?: number; // text prompts: the longest accepted answer
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

Messages are always keys plus params. English text lives in `content/src/messages.en.ts` and is loaded on the client side.
A string param that starts with `@` is itself a message key, which the UI translates before interpolating. For example, `{ key: 'welcome', params: { role: '@role.valkyrie' } }` becomes "… You are a Valkyrie.".

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
}
interface ObjectDef {
  // ref: include/objclass.h struct objclass
  id: DefId; nameKey: string;
  class: 'weapon' | 'armor' | 'ring' | 'amulet' | 'tool' | 'food' | 'potion' | 'scroll' | 'spellbook' | 'wand' | 'coin' | 'gem';
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
  endGame(over: GameOver): void;
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

`status` always has `dlvl` and `turn`. When the hero has the matching components it also has `hp`, `hpmax`, `ac`, `xl`, `xp` and `str`/`int`/`wis`/`dex`/`con`/`cha`. After the game ends it adds `dead` (`'died' | 'escaped'`), `killer`, `endTurn`, `endDepth` and `endLevel`. Mods add fields with `defineStatus` (content adds `ac`, `gold`, `hunger`, `encumbrance`). The legend covers terrain, roles, monsters, objects, appearances and traps.

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
  bindKey(key: string, cmd: UiCommand): void; // key = KeyboardEvent.key or .code
  addMessages(locale: string, catalog: Record<string, string>): void;
  setGlyph(id: DefId, glyph: { ch: string; fg: string }): void;
  onEvent(fn: (e: GameEvent) => void): void;
  addMenuItem(item: { id: string; labelKey: string; run(): void }): void;
}
```

Client mods run in the UI and are never saved. The default keymap is itself a client mod.

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
// Save text = JSON.stringify({ format: 'nh-ts', version: 7, mods, state, replay }) // v3-v6 saves migrate by adding occupation: null, monsterMemory: {} and traps: [] on every level, a root-only layout (no bottom, no branches) and dungeon/dlevel = root/depth and branch: null on every level
```

After `new` or `load`, the host sends a full snapshot. After each `act`, it sends a delta. Every action, including each `continue`, is appended to the replay, and replaying `{ seed, width, height, mods, actions }` must reproduce `stateHash`.

## Package boundaries

| Package                                    | May depend on                             |
| ------------------------------------------ | ----------------------------------------- |
| core                                       | nothing                                   |
| content, testkit                           | core (testkit tests may also use content) |
| ui, render-ascii, render-canvas, modern-ui | core, `import type` only                  |
| app                                        | everything                                |

`vendor/nethack` is reference only. dependency-cruiser enforces this table (`pnpm boundaries`).
