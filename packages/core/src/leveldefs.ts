import type { DefId } from './types/common';
import type { LevelDef, Registry } from './types/mod';

// A per-registry index of the registered LevelDefs (registries are frozen, so it never goes stale).
const index = new WeakMap<Registry, ReadonlyMap<DefId, LevelDef>>();

/**
 * The registered LevelDef a level was built from, or undefined for an ordinary level (no `def`)
 * and for one built from a LevelDef no mod registered (`buildLevel()` takes any).
 */
export function registeredLevelDef(
  registry: Registry,
  id: DefId | undefined,
): LevelDef | undefined {
  if (id === undefined) return undefined;
  let byId = index.get(registry);
  if (!byId) {
    byId = new Map(registry.levels.map((l): [DefId, LevelDef] => [l.id, l]));
    index.set(registry, byId);
  }
  return byId.get(id);
}
