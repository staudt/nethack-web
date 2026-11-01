// The hero's perception beyond plain sight, from the registered PerceptionDefs.
// ref: src/display.c, src/vision.c (Blind, sensemon(), Hallucination)
import type { DefId } from './types/common';
import type { Entity } from './types/entity';
import type { Registry } from './types/mod';
import type { GameState } from './types/state';

/** True when some perception def blinds the hero. */
export function heroBlind(registry: Registry, state: Readonly<GameState>): boolean {
  return registry.perceptions.some((p) => p.blind?.(state, registry) === true);
}

/** True when some perception def lets the hero sense this monster without seeing it. */
export function senses(registry: Registry, state: Readonly<GameState>, mon: Entity): boolean {
  return registry.perceptions.some((p) => p.senses?.(state, registry, mon) === true);
}

/** The id to show for a creature or floor object: the first perception override, else `fallback`. */
export function shownAs(
  registry: Registry,
  state: Readonly<GameState>,
  e: Entity,
  fallback: DefId,
): DefId {
  for (const p of registry.perceptions) {
    const id = p.shownAs?.(state, registry, e);
    if (id !== null && id !== undefined) return id;
  }
  return fallback;
}
