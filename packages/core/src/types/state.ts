import type { DefId, Json, LevelId, ModRef, RngState, EntityId } from './common';
import type { Entity } from './entity';
import type { Level } from './level';
import type { GameEvent } from './event';
import type { Prompt } from './prompt';
import type { PlayerAction } from './action';

export interface Timer {
  at: number;
  seq: number;
  kind: DefId;
  data: Json;
}

export interface GameOver {
  /** 'quit' (m8): the player gave up (content's `#quit`); like 'escaped', no killer. */
  kind: 'died' | 'escaped' | 'quit';
  /** Message param for the cause: a key, or '@' + a def id (e.g. '@nh:newt'). */
  killer: string;
  turn: number;
  depth: number;
  level: number;
}

/**
 * Where a dungeon sits, rolled once at new game from its DungeonDef.
 * ref: include/dungeon.h struct dungeon (num_dunlevs, depth_start) and struct branch
 */
export interface DungeonLayout {
  id: DefId;
  /** Absolute depth of its top level. */
  depthStart: number;
  /** How many levels it has; null for no bottom. */
  levels: number | null;
  /**
   * The level its branch stairs arrive on (ref: struct dungeon entry_lev); absent = 1, the top.
   * Absent on the root dungeon.
   */
  entry?: number;
  /**
   * Where the dungeons entered from it leave it, in `registry.dungeons` order. `dir` is the way
   * the stairs here lead (ref: struct branch end1_up); absent = down.
   */
  branches: { to: DefId; dlevel: number; dir?: 'up' }[];
  /** Where its special levels went, in `DungeonDef.special` order; absent ones are left out. */
  special: { id: DefId; dlevel: number }[];
}

/** A question awaiting the player's `{ type: 'answer' }`; `handler` is the ActionDef whose `answer` runs. */
export interface PendingPrompt {
  prompt: Prompt;
  handler: DefId;
  data: Json;
}

/** The whole game. JSON-plain: no classes, Map, Set, functions or typed arrays. */
export interface GameState {
  version: 8;
  seed: number;
  turn: number;
  nextEntityId: number;
  /** Monotonic tiebreaker for timers and other ordered records. */
  seq: number;
  rng: { core: RngState; cosmetic: RngState };
  /** Game mods in load order. */
  mods: ModRef[];
  /** Keyed by id; iterate with `sortedIds()`, never by key order. */
  entities: Record<string, Entity>;
  /** The dungeon layout: the root dungeon first, then each branch after its parent. */
  dungeons: DungeonLayout[];
  levels: Record<LevelId, Level>;
  currentLevel: LevelId;
  playerId: EntityId;
  /** Remembered palette index per cell; -1 = never seen. */
  memory: Record<LevelId, number[]>;
  /** Remembered top object per cell, as a shown id; keyed by cell index. */
  objectMemory: Record<LevelId, Record<string, DefId>>;
  /** A monster stays shown where last seen until that cell is seen again; keyed by cell index. */
  monsterMemory: Record<LevelId, Record<string, DefId>>;
  /** Object def -> appearance def for randomized descriptions (ref: src/o_init.c shuffle_all). */
  appearances: Record<DefId, DefId>;
  /** Object defs whose identity the hero knows, sorted (ref: src/o_init.c discover_object). */
  discovered: DefId[];
  /** Sorted cell indices currently visible to the player. */
  visible: number[];
  /** Sorted by (at, seq). */
  timers: Timer[];
  /** Per-mod persistent data, keyed by mod id. */
  modData: Record<string, Json>;
  /** Set when the game has ended; every further action is rejected. */
  gameOver: GameOver | null;
  pendingPrompt: PendingPrompt | null;
  /**
   * A multi-turn action in progress (travel, running, eating), advanced one move per
   * `{ type: 'continue' }` step; any other action cancels it. `data` belongs to the action.
   * ref: NetHack's occupation / multi.
   */
  occupation: Occupation | null;
}

export interface Occupation {
  action: PlayerAction;
  data: Json;
}

export interface StepResult {
  state: GameState;
  events: GameEvent[];
  prompt: Prompt | null;
  /** True while `state.occupation` is set: send `{ type: 'continue' }` for the next move. */
  continuing: boolean;
}
