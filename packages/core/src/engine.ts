import {
  depthOf,
  dungeonLayout,
  levelIdFor,
  levelStairs,
  rollDungeons,
  specialLevelAt,
  rootDungeon,
} from './dungeon';
import {
  buildLevel,
  generateLevel,
  VANILLA_TERRAIN,
  type GenOptions,
  type LevelTerrain,
} from './levelgen/index';
import { cellRules } from './movement';
import { allContents, sightBlockers, topObjects } from './objects';
import { createQuery } from './query';
import { loadMods, requireTerrains } from './registry';
import { createRng, newRngStates } from './rng';
import { parseSave, serializeSave } from './save';
import { getLevel, getPlayer, playerPos } from './state';
import { advanceTime } from './turn';
import type { PlayerAction } from './types/action';
import type { DefId, Json, Pos } from './types/common';
import { NORMAL_SPEED } from './types/entity';
import type { GameEvent } from './types/event';
import type { Level, LevelRef } from './types/level';
import type { ActionDef, Ctx, Mod, Registry } from './types/mod';
import type { Replay } from './types/protocol';
import type { Rng } from './types/rng';
import type { CoreQuery } from './types/query';
import type { GameState, StepResult } from './types/state';
import { DIR_LIST, DIRS, cellIndex, inBounds, sortedIds } from './util';
import { computeVisible, newMemory, updateMemory } from './vision';
import { heroBlind, heroLights, perceivesMonster } from './perception';
import { isMarker } from './memory';
import { placeTrapOn, removeTrapOn, trapAt } from './traps';

export const DEFAULT_WIDTH = 80;
export const DEFAULT_HEIGHT = 21;
/** Upper bound on the moves `stepAll` performs for one multi-turn action. */
export const MAX_REPEAT = 1000;

export interface NewGameOptions {
  seed: number;
  width?: number;
  height?: number;
  /** Defaults to the first registered role. */
  role?: DefId;
}

export interface Engine {
  readonly registry: Registry;
  newGame(opts: NewGameOptions): StepResult;
  /**
   * Mutates `state` in place and returns it in the result. A multi-turn action performs one
   * move; while `continuing`, send `{ type: 'continue' }` for each further move.
   */
  step(state: GameState, action: PlayerAction): StepResult;
  /** `step`, then `continue` until the multi-turn action ends; events are concatenated. */
  stepAll(state: GameState, action: PlayerAction): StepResult;
  query(state: GameState): CoreQuery;
  save(state: GameState, replay: Replay): string;
  load(text: string): { state: GameState; replay: Replay };
}

export interface EngineOptions {
  /** Terrain ids the level generator uses. Defaults to the vanilla `nh:` set. */
  terrain?: LevelTerrain;
}

export class UnknownActionError extends Error {
  constructor(action: PlayerAction) {
    super(`No registered action handles ${JSON.stringify(action)}`);
    this.name = 'UnknownActionError';
  }
}

/**
 * A position prompt's answer must be null (cancelled) or `{ x, y }`, integers inside `level`;
 * anything else throws before the handler sees it, and the prompt stays pending.
 */
function checkPosition(level: Level, value: Json): void {
  if (value === null) return;
  const p = value as { x?: unknown; y?: unknown };
  const ok =
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === 2 &&
    Number.isInteger(p.x) &&
    Number.isInteger(p.y) &&
    inBounds(level, p.x as number, p.y as number);
  if (!ok) throw new Error(`A position answer must be null or {x, y} on the level`);
}

export function createEngine(mods: readonly Mod[], opts: EngineOptions = {}): Engine {
  const registry = loadMods(mods);
  const terrain = opts.terrain ?? VANILLA_TERRAIN;
  requireTerrains(registry, Object.values(terrain), 'levelgen');

  /** New level `ref`: its dungeon's filler LevelDef, else the rooms-and-corridors generator. */
  const makeLevel = (
    state: GameState,
    rng: Rng,
    ref: LevelRef,
    width: number,
    height: number,
  ): Level => {
    const opts: GenOptions = {
      id: levelIdFor(state, ref),
      depth: depthOf(state, ref),
      ...ref,
      ...levelStairs(state, ref),
      width,
      height,
      terrain,
    };
    const dungeon = registry.dungeon(ref.dungeon);
    const at = specialLevelAt(state, ref);
    const special = at && dungeon.special?.find((s) => s.id === at.id);
    if (special) {
      // ref: src/mkmaze.c makemaz(): "%s-%d" with rnd(sp->rndlevs), before anything else
      const variant = special.variants[rng.rnd(special.variants.length) - 1] as DefId;
      const level = buildLevel(rng, opts, registry.level(variant));
      if (special.town === true) level.town = true;
      return level;
    }
    return dungeon.filler === undefined
      ? generateLevel(rng, opts)
      : buildLevel(rng, opts, registry.level(dungeon.filler));
  };

  /** A creature (not an object) stands on x,y, other than `except`. ref: src/mon.c m_at() */
  const occupied = (
    state: GameState,
    level: Level,
    x: number,
    y: number,
    except: number,
  ): boolean =>
    sortedIds(state).some((id) => {
      const e = state.entities[String(id)];
      const p = e?.c.pos;
      return (
        id !== except &&
        !e?.c.item &&
        p !== undefined &&
        p.level === level.id &&
        p.x === x &&
        p.y === y
      );
    });

  /**
   * Nearest passable cell to `from` with no creature on it (objects do not count), breadth-first.
   * ref: src/teleport.c enexto(), goodpos()
   */
  const nearestFree = (state: GameState, level: Level, from: Pos, except: number): Pos | null => {
    const rules = cellRules(level, registry);
    const seen = new Set<number>([cellIndex(level, from.x, from.y)]);
    const queue: Pos[] = [from];
    for (let q = 0; q < queue.length; q++) {
      const p = queue[q] as Pos;
      for (const dir of DIR_LIST) {
        const x = p.x + DIRS[dir].x;
        const y = p.y + DIRS[dir].y;
        const i = cellIndex(level, x, y);
        if (!inBounds(level, x, y) || seen.has(i)) continue;
        seen.add(i);
        if (!rules.passable[level.cells[i] ?? 0]) continue;
        if (!occupied(state, level, x, y, except)) return { x, y };
        queue.push({ x, y });
      }
    }
    return null;
  };

  const makeCtx = (state: GameState, events: GameEvent[]): Ctx & { interrupted: boolean } => {
    const ctx: Ctx & { interrupted: boolean } = {
      state,
      rng: createRng(state.rng.core),
      cosmetic: createRng(state.rng.cosmetic),
      defs: registry,
      query: createQuery(registry, state),
      interrupted: false,
      emit: (e) => void events.push(e),
      schedule(delay, kind, data: Json) {
        if (!Number.isInteger(delay) || delay < 1)
          throw new RangeError('Timer delay must be an integer >= 1');
        if (!registry.hasTimer(kind)) throw new Error(`Unknown timer '${kind}'`);
        const t = { at: state.turn + delay, seq: state.seq++, kind, data };
        const i = state.timers.findIndex((o) => o.at > t.at);
        state.timers.splice(i === -1 ? state.timers.length : i, 0, t);
      },
      spawn(e) {
        const id = state.nextEntityId++;
        state.entities[String(id)] = { ...e, id };
        return id;
      },
      remove(id) {
        if (id === state.playerId) throw new Error('The hero cannot be removed');
        // ref: src/shk.c obfree(): deleting a container deletes its contents
        for (const inner of allContents(state, id)) delete state.entities[String(inner)];
        delete state.entities[String(id)];
      },
      goToLevel(to, at) {
        const layout = dungeonLayout(state, to.dungeon);
        if (
          !Number.isInteger(to.dlevel) ||
          to.dlevel < 1 ||
          to.dlevel > (layout.levels ?? Infinity)
        )
          throw new RangeError(`No level ${to.dlevel} in dungeon '${to.dungeon}'`);
        const id = levelIdFor(state, to);
        const current = getLevel(state);
        const fromPos = playerPos(state);
        let level = state.levels[id];
        if (!level) {
          level = makeLevel(state, ctx.rng, to, current.width, current.height);
          state.levels[id] = level;
          state.memory[id] = newMemory(level);
          for (const h of registry.hooks('newLevel')) h.fn(ctx, level);
        }
        placeHero(
          state,
          level,
          at === 'up'
            ? level.up
            : at === 'down'
              ? level.down
              : at === 'branch'
                ? (level.branch?.pos ?? null)
                : randomSpot(ctx.rng, level),
        );
        const change = { from: current.id, fromPos: { x: fromPos.x, y: fromPos.y }, to: level.id };
        for (const h of registry.hooks('levelChange')) h.fn(ctx, change);
      },
      placeTrap(id, t) {
        placeTrapOn(registry, getLevel(state, id), t);
      },
      removeTrap(id, pos) {
        removeTrapOn(getLevel(state, id), pos.x, pos.y);
      },
      ask(prompt, handler, data) {
        const def = registry.actions.find((a) => a.id === handler);
        if (!def?.answer) throw new Error(`Prompt handler '${handler}' has no answer()`);
        state.pendingPrompt = { prompt, handler, data };
      },
      interrupt() {
        ctx.interrupted = true;
      },
      endGame(over) {
        if (state.gameOver) return;
        if (registry.hooks('beforeGameOver').some((h) => h.fn(ctx, over) === 'cancel')) return;
        state.gameOver = over;
      },
    };
    return ctx;
  };

  /**
   * A random room floor cell without a trap, or null for none: 200 random tries, then the first
   * such cell in column order. ref: src/mkmaze.c place_lregion(), bad_location()
   */
  const randomSpot = (rng: Rng, level: Level): Pos | null => {
    const ok = (x: number, y: number): boolean =>
      level.palette[level.cells[cellIndex(level, x, y)] ?? -1] === terrain.floor &&
      trapAt(level, x, y) === undefined;
    for (let tries = 0; tries < 200; tries++) {
      const x = rng.rn2(level.width);
      const y = rng.rn2(level.height);
      if (ok(x, y)) return { x, y };
    }
    for (let x = 0; x < level.width; x++)
      for (let y = 0; y < level.height; y++) if (ok(x, y)) return { x, y };
    return null;
  };

  /**
   * Puts the hero on `target` (or any stairs) of `level` and makes it current. A monster on
   * that spot is moved to the nearest free cell; objects there stay under the hero.
   * ref: src/do.c goto_level() u_on_newpos(), mnexto()
   */
  const placeHero = (state: GameState, level: Level, target: Pos | null): void => {
    const spot = target ?? level.up ?? level.down ?? level.branch?.pos;
    if (!spot) throw new Error(`Level '${level.id}' has no stairs to arrive on`);
    const hero = getPlayer(state);
    for (const id of sortedIds(state)) {
      const e = state.entities[String(id)];
      const p = e?.c.pos;
      if (!e || id === hero.id || !p || p.level !== level.id || p.x !== spot.x || p.y !== spot.y)
        continue;
      if (e.c.item) continue; // only m_at() is moved
      const free = nearestFree(state, level, spot, id);
      if (free) e.c.pos = { level: level.id, x: free.x, y: free.y };
    }
    hero.c.pos = { level: level.id, x: spot.x, y: spot.y };
    state.currentLevel = level.id;
  };

  const refreshVision = (state: GameState): void => {
    const level = getLevel(state);
    // ref: src/vision.c vision_recalc(): a blind hero sees no cell (content "feels" cells itself)
    const visible = heroBlind(registry, state)
      ? []
      : computeVisible(
          level,
          cellRules(level, registry),
          playerPos(state),
          heroLights(registry, state),
          sightBlockers(registry, state, level.id),
        );
    const memory = (state.memory[level.id] ??= newMemory(level));
    updateMemory(memory, level, visible);
    // ref: src/display.c map_object(): seen cells remember their top object (or its absence)
    const objMemory = (state.objectMemory[level.id] ??= {});
    const top = topObjects(registry, state, level);
    for (const i of visible) {
      const o = top.get(i);
      if (o === undefined) delete objMemory[String(i)];
      else objMemory[String(i)] = o;
    }
    // ref: src/display.c newsym(): a monster's glyph stays on a cell until the cell is seen
    // again; on a seen cell a perceived monster is remembered (replacing a marker), a marker
    // (the remembered-unseen `I`) stays while no perceived monster is there, else it is cleared;
    // the hero's own seen cell never keeps one (map_invisible() skips it, newsym() maps over it)
    const monMemory = (state.monsterMemory[level.id] ??= {});
    const vis = new Set(visible);
    const hp = playerPos(state);
    const heroAt = hp.y * level.width + hp.x;
    const mons = new Map<number, DefId>();
    for (const id of sortedIds(state)) {
      const e = state.entities[String(id)];
      const p = e?.c.pos;
      if (!e || !p || p.level !== level.id || id === state.playerId || !registry.isMonster(e.def))
        continue;
      const i = p.y * level.width + p.x;
      if (vis.has(i) && perceivesMonster(registry, state, e, true)) mons.set(i, e.def);
    }
    for (const i of visible) {
      const m = mons.get(i);
      const k = String(i);
      if (m !== undefined) monMemory[k] = m;
      else {
        const old = monMemory[k];
        if (old !== undefined && (i === heroAt || !isMarker(registry, old))) delete monMemory[k];
      }
    }
    state.visible = visible;
  };

  const findHandler = (action: PlayerAction): ActionDef => {
    const def = registry.actions.find((a) =>
      action.type === 'mod'
        ? a.handles === 'mod' && a.id === action.action
        : a.handles === action.type,
    );
    if (!def) throw new UnknownActionError(action);
    return def;
  };

  const spend = (state: GameState, def: ActionDef, cost: number): void => {
    if (!Number.isInteger(cost) || cost < 0)
      throw new Error(`Action ${def.id} returned invalid energy cost ${cost}`);
    const actor = getPlayer(state).c.actor;
    if (!actor) throw new Error('Player has no actor component');
    actor.energy -= cost;
  };

  const result = (state: GameState, events: GameEvent[]): StepResult => ({
    state,
    events,
    prompt: state.pendingPrompt?.prompt ?? null,
    continuing: state.occupation !== null,
  });

  const engine: Engine = {
    registry,

    newGame({ seed, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT, role }) {
      const roleDef = role ? registry.role(role) : registry.roles[0];
      if (!roleDef) throw new Error('No player role registered');
      const s = seed >>> 0;
      const state: GameState = {
        version: 8,
        seed: s,
        turn: 1,
        nextEntityId: 1,
        seq: 0,
        rng: newRngStates(s),
        mods: registry.mods.map((m) => ({ id: m.id, version: m.version })),
        entities: {},
        dungeons: [],
        levels: {},
        currentLevel: '',
        playerId: 0,
        memory: {},
        objectMemory: {},
        monsterMemory: {},
        appearances: {},
        discovered: [],
        visible: [],
        timers: [],
        modData: {},
        gameOver: null,
        pendingPrompt: null,
        occupation: null,
      };
      const events: GameEvent[] = [];
      const ctx = makeCtx(state, events);
      // ref: src/allmain.c newgame(): u_init() before mklev() so generation can use the hero's level
      const id = state.nextEntityId++;
      state.playerId = id;
      state.entities[String(id)] = {
        id,
        def: roleDef.id,
        c: {
          // Hero can move on the first turn.
          actor: { energy: NORMAL_SPEED, speed: roleDef.speed },
          player: { role: roleDef.id },
        },
      };
      // ref: src/allmain.c newgame(): init_dungeons() before u_init()
      state.dungeons = rollDungeons(ctx.rng, registry.dungeons);
      for (const h of registry.hooks('newGame')) h.fn(ctx, id);
      const top = { dungeon: rootDungeon(state).id, dlevel: 1 };
      const level = makeLevel(state, ctx.rng, top, width, height);
      state.currentLevel = level.id;
      state.levels[level.id] = level;
      state.memory[level.id] = newMemory(level);
      for (const h of registry.hooks('newLevel')) h.fn(ctx, level);
      // ref: src/allmain.c newgame() u_on_upstairs(), then makedog() and the like
      placeHero(state, level, level.up ?? level.branch?.pos ?? null);
      for (const h of registry.hooks('levelChange'))
        h.fn(ctx, { from: null, fromPos: null, to: level.id });
      refreshVision(state);
      events.unshift({ type: 'msg', key: 'welcome', params: { role: `@${roleDef.nameKey}` } });
      return result(state, events);
    },

    step(state, action) {
      if (state.gameOver) throw new Error('The game is over');
      const events: GameEvent[] = [];
      const ctx = makeCtx(state, events);

      const pending = state.pendingPrompt;
      if (pending || action.type === 'answer') {
        if (!pending) throw new Error('There is no prompt to answer');
        if (action.type !== 'answer' || action.promptId !== pending.prompt.id)
          throw new Error(`Prompt '${pending.prompt.id}' must be answered first`);
        const def = registry.actions.find((a) => a.id === pending.handler);
        if (!def?.answer) throw new Error(`Prompt handler '${pending.handler}' has no answer()`);
        if (pending.prompt.kind === 'position') checkPosition(getLevel(state), action.value);
        state.pendingPrompt = null;
        state.occupation = null;
        // An answer may start a multi-turn action by setting `state.occupation` (e.g. a run).
        const cost = def.answer(ctx, action.value, pending.data);
        spend(state, def, cost);
        advanceTime(ctx);
        refreshVision(state);
        if (cost === 0 || ctx.interrupted || state.gameOver || state.pendingPrompt)
          state.occupation = null;
        return result(state, events);
      }

      // A multi-turn action runs one move per step: `continue` performs its next move, any
      // other action cancels it first (ref: NetHack interrupting an occupation).
      let act: PlayerAction = action;
      if (action.type === 'continue') {
        if (!state.occupation) return result(state, events);
        act = state.occupation.action;
      } else {
        state.occupation = null;
      }
      const def = findHandler(act);
      if (action.type !== 'continue' && def.continues)
        state.occupation = { action: JSON.parse(JSON.stringify(act)) as PlayerAction, data: null };
      if (registry.hooks('beforeAction').some((h) => h.fn(ctx, act) === 'cancel')) {
        state.occupation = null;
        return result(state, events);
      }
      const cost = def.perform(ctx, act);
      spend(state, def, cost);
      refreshVision(state);
      for (const h of registry.hooks('afterAction')) h.fn(ctx, act);
      advanceTime(ctx);
      refreshVision(state);
      const keep =
        state.occupation !== null &&
        cost > 0 &&
        !ctx.interrupted &&
        !state.gameOver &&
        !state.pendingPrompt &&
        (def.continues?.(ctx, act) ?? false);
      if (!keep) state.occupation = null;
      return result(state, events);
    },

    stepAll(state, action) {
      let r = engine.step(state, action);
      const events = [...r.events];
      for (let i = 0; r.continuing && i < MAX_REPEAT; i++) {
        r = engine.step(state, { type: 'continue' });
        events.push(...r.events);
      }
      return { ...r, events };
    },

    query: (state) => createQuery(registry, state),
    save: (state, replay) => serializeSave(state, replay),
    load: (text) => parseSave(text, registry),
  };
  return engine;
}
