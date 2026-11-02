// The hero's perception beyond plain sight, from the registered PerceptionDefs.
// ref: src/display.c, src/vision.c (Blind, sensemon(), Hallucination)
import type { DefId } from './types/common';
import type { Entity } from './types/entity';
import type { LightSource, Registry } from './types/mod';
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

/**
 * Light sources on the hero's current level from every perception def, in def order.
 * ref: src/light.c do_light_sources()
 */
export function heroLights(registry: Registry, state: Readonly<GameState>): LightSource[] {
  const out: LightSource[] = [];
  for (const p of registry.perceptions) {
    for (const l of p.lights?.(state, registry) ?? []) {
      if (l.level === state.currentLevel) out.push(l);
    }
  }
  return out;
}
