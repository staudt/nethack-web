import type { DefId } from './types/common';
import { cellRules } from './movement';
import { isItem, itemShownId, itemsAt } from './objects';
import { perceivesMonster, selfView, shownAs } from './perception';
import { findPath } from './path';
import { getLevel, isVisible, playerPos } from './state';
import { trapAt } from './traps';
import type { Pos } from './types/common';
import type { Ctx, Registry } from './types/mod';
import type { CoreQuery, Description, Target } from './types/query';
import type { GameState } from './types/state';
import { cellIndex, inBounds, sortedIds } from './util';
import type { Rng } from './types/rng';

const NO_RNG: Rng = new Proxy({} as Rng, {
  get() {
    throw new Error('Queries must not use the RNG');
  },
});

const shownTerrain = (registry: Registry, id: DefId | undefined): DefId | null =>
  id === undefined ? null : (registry.terrain(id).looksLike ?? id);

const forbidden = (what: string) => (): never => {
  throw new Error(`offer() must not ${what}`);
};

/** Read-only queries, answered from player knowledge (memory + current vision). */
export function createQuery(registry: Registry, state: GameState): CoreQuery {
  /** An entity target the hero may ask about: a creature on her level she sees or senses. */
  const entityShown = (id: number): boolean => {
    const e = state.entities[String(id)];
    const p = e?.c.pos;
    if (!e || isItem(registry, e)) return true; // items and unknown ids: the offers decide
    if (!p || p.level !== state.currentLevel) return false;
    const level = getLevel(state);
    return perceivesMonster(registry, state, e, isVisible(state, cellIndex(level, p.x, p.y)));
  };

  const query: CoreQuery = {
    describe(pos: Pos): Description {
      const level = getLevel(state);
      const none: Description = {
        terrain: null,
        remembered: false,
        visible: false,
        entities: [],
        objects: [],
        trap: null,
      };
      if (!inBounds(level, pos.x, pos.y)) return none;
      const i = cellIndex(level, pos.x, pos.y);
      const mem = state.memory[level.id]?.[i] ?? -1;
      const visible = isVisible(state, i);
      // Creatures are listed when seen or sensed (telepathy); perception may disguise them.
      const entities = sortedIds(state).flatMap((id) => {
        const e = state.entities[String(id)];
        const p = e?.c.pos;
        if (!e || !p || p.level !== level.id || p.x !== pos.x || p.y !== pos.y) return [];
        if (isItem(registry, e)) return [];
        if (id === state.playerId)
          return [{ id: e.id, def: selfView(registry, state)?.g ?? e.def }];
        if (!perceivesMonster(registry, state, e, visible)) return [];
        return [{ id: e.id, def: shownAs(registry, state, e, e.def) }];
      });
      const objects = visible
        ? itemsAt(registry, state, level.id, pos.x, pos.y).map((e) => ({
            id: e.id,
            def: shownAs(registry, state, e, itemShownId(registry, state, e)),
            name: registry.itemName(state, e),
          }))
        : [];
      return {
        terrain: mem >= 0 ? shownTerrain(registry, level.palette[mem]) : null,
        remembered: mem >= 0,
        visible,
        entities,
        objects,
        trap: query.trapAt(level.id, pos)?.def ?? null,
      };
    },

    actionsFor(target: Target) {
      const t: Target =
        target.kind === 'entity' && target.id === state.playerId ? { kind: 'self' } : target;
      const ctx: Ctx = {
        state,
        rng: NO_RNG,
        cosmetic: NO_RNG,
        defs: registry,
        query,
        emit: forbidden('emit events'),
        schedule: forbidden('schedule timers'),
        spawn: forbidden('spawn entities'),
        remove: forbidden('remove entities'),
        goToLevel: forbidden('change level'),
        placeTrap: forbidden('place traps'),
        removeTrap: forbidden('remove traps'),
        ask: forbidden('ask prompts'),
        interrupt: forbidden('interrupt'),
        endGame: forbidden('end the game'),
      };
      if (state.gameOver || state.pendingPrompt) return [];
      if (t.kind === 'item' && state.entities[String(t.id)]?.c.item?.carriedBy !== state.playerId)
        return [];
      // ref: src/display.h canspotmon(): no offers about a creature the hero neither sees nor senses
      if (t.kind === 'entity' && !entityShown(t.id)) return [];
      // a stable sort: equal priorities keep registration order
      return registry.actions
        .flatMap((def) => def.offer(ctx, t).map((o) => ({ ...o, source: def.mod })))
        .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    },

    pathTo(pos: Pos) {
      const level = getLevel(state);
      const memory = state.memory[level.id];
      if (!memory) return null;
      return findPath(level, cellRules(level, registry), memory, playerPos(state), pos);
    },

    trapAt(id, pos) {
      const level = state.levels[id];
      const t = level ? trapAt(level, pos.x, pos.y) : undefined;
      return t?.seen ? t : null;
    },
  };
  return query;
}
