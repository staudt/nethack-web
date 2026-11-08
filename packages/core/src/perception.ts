// The hero's perception beyond plain sight, from the registered PerceptionDefs.
// ref: src/display.c, src/vision.c (Blind, sensemon(), Hallucination)
import type { DefId } from './types/common';
import type { Entity } from './types/entity';
import type { LightSource, Registry, SelfView } from './types/mod';
import type { GameState } from './types/state';

/** True when some perception def blinds the hero. */
export function heroBlind(registry: Registry, state: Readonly<GameState>): boolean {
  return registry.perceptions.some((p) => p.blind?.(state, registry) === true);
}

/** True when some perception def lets the hero sense this monster without seeing it. */
export function senses(registry: Registry, state: Readonly<GameState>, mon: Entity): boolean {
  return registry.perceptions.some((p) => p.senses?.(state, registry, mon) === true);
}

/** True when some perception def hides this monster from sight (invisible). ref: mon_visible() */
export function hides(registry: Registry, state: Readonly<GameState>, mon: Entity): boolean {
  return registry.perceptions.some((p) => p.hides?.(state, registry, mon) === true);
}

/**
 * Whether the hero perceives this monster, given whether its cell is visible: seen on a visible
 * cell unless hidden, or sensed anywhere (`senses` overrides `hides`).
 * ref: src/display.c newsym() see_it (mon_visible() || tp_sensemon() || warned)
 */
export function perceivesMonster(
  registry: Registry,
  state: Readonly<GameState>,
  mon: Entity,
  cellVisible: boolean,
): boolean {
  if (cellVisible && !hides(registry, state, mon)) return true;
  return senses(registry, state, mon);
}

/** How the hero is shown: the first non-null `self` answer, else null. ref: display_self() */
export function selfView(registry: Registry, state: Readonly<GameState>): SelfView | null {
  for (const p of registry.perceptions) {
    const v = p.self?.(state, registry);
    if (v !== null && v !== undefined) return v;
  }
  return null;
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
