import type { ActionType, PlayerAction } from './action';
import type { DefId, EntityId, Glyph, Json, LevelId, Msg, Pos } from './common';
import type { ArmorSlot, Dice, Entity } from './entity';
import type { GameEvent } from './event';
import type { Level, Trap } from './level';
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
export type ObjectClass = 'weapon' | 'armor' | 'food' | 'potion' | 'scroll' | 'coin' | 'gem';

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
  /** Effect when quaffed or read; called by content's actions. */
  use?(ctx: Ctx, user: EntityId, item: EntityId): void;
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
}

/** A kind of trap; its effects belong to content (ref: include/trap.h, src/trap.c dotrap). */
export interface TrapDef {
  id: DefId;
  nameKey: string;
  glyph: Glyph;
  /** A trap door or hole: falling through leads to a lower level. */
  hole?: boolean;
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
}

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
   * Moves the hero to dungeon level `depth`, generating it on first visit, arriving on its
   * up or down staircase, or on a random room floor cell without a trap ('random', for falling
   * through a trap door; ref: src/dungeon.c u_on_rndspot()).
   */
  goToLevel(depth: number, at: 'up' | 'down' | 'random'): void;
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
