import type { DefId, EntityId, LevelId } from './types/common';
import type { Entity } from './types/entity';
import type { Level } from './types/level';
import type { Registry } from './types/mod';
import type { GameState } from './types/state';
import { sortedIds } from './util';

/** The id a player sees for an object def: its per-game appearance, or the def itself. */
export function shownId(state: Readonly<GameState>, def: DefId): DefId {
  return state.appearances[def] ?? def;
}

/**
 * The id a player sees for this item: its def's `appearanceOf` answer (a statue drawn as its
 * monster), else `shownId()` of its def.
 */
export function itemShownId(registry: Registry, state: Readonly<GameState>, e: Entity): DefId {
  const def = registry.isObject(e.def) ? registry.object(e.def) : undefined;
  return def?.appearanceOf?.(state, registry, e) ?? shownId(state, e.def);
}

/** True for an entity whose def is a registered object. */
export function isItem(registry: Registry, e: Entity): boolean {
  return e.c.item !== undefined && registry.isObject(e.def);
}

/** 1 for a boulder (ObjectDef.boulder), else 0: boulders lie on top of their pile. */
const boulderRank = (registry: Registry, e: Entity): number =>
  registry.object(e.def).boulder === true ? 1 : 0;

/**
 * Objects on the floor at (x, y) of `level`, top of the pile first: boulders, then the most
 * recently placed. ref: src/mkobj.c place_object() puts a boulder on top and anything else
 * under the boulders already there.
 */
export function itemsAt(
  registry: Registry,
  state: Readonly<GameState>,
  level: LevelId,
  x: number,
  y: number,
): Entity[] {
  const out: Entity[] = [];
  for (const id of sortedIds(state)) {
    const e = state.entities[String(id)];
    const p = e?.c.pos;
    if (e && p && p.level === level && p.x === x && p.y === y && isItem(registry, e)) out.push(e);
  }
  return out.sort(
    (a, b) =>
      boulderRank(registry, b) - boulderRank(registry, a) ||
      (b.c.item?.placed ?? 0) - (a.c.item?.placed ?? 0) ||
      a.id - b.id,
  );
}

/** Cell index -> the top object entity (as `itemsAt` orders a pile), for every floor object on `level`. */
export function topObjectEntities(
  registry: Registry,
  state: Readonly<GameState>,
  level: Level,
): Map<number, Entity> {
  const best = new Map<number, Entity>();
  for (const id of sortedIds(state)) {
    const e = state.entities[String(id)];
    const p = e?.c.pos;
    if (!e || !p || p.level !== level.id || !isItem(registry, e)) continue;
    const i = p.y * level.width + p.x;
    const cur = best.get(i);
    // Ties go to the lower id (ids are visited in order), matching itemsAt.
    const rank = boulderRank(registry, e) - (cur ? boulderRank(registry, cur) : 0);
    if (!cur || rank > 0 || (rank === 0 && (e.c.item?.placed ?? 0) > (cur.c.item?.placed ?? 0)))
      best.set(i, e);
  }
  return best;
}

/**
 * Cell indices of `level` that a floor object blocks sight on (a boulder, `ObjectDef.boulder`),
 * for `computeVisible`'s `blocked` and content's line-of-sight checks.
 * ref: src/vision.c does_block()
 */
export function sightBlockers(
  registry: Registry,
  state: Readonly<GameState>,
  level: LevelId,
): Set<number> {
  const out = new Set<number>();
  const width = state.levels[level]?.width;
  if (width === undefined) return out;
  for (const id of sortedIds(state)) {
    const e = state.entities[String(id)];
    const p = e?.c.pos;
    if (e && p && p.level === level && isItem(registry, e) && registry.object(e.def).boulder)
      out.add(p.y * width + p.x);
  }
  return out;
}

/** Cell index -> the top object's shown id (`itemShownId`), for every floor object on `level`. */
export function topObjects(
  registry: Registry,
  state: Readonly<GameState>,
  level: Level,
): Map<number, DefId> {
  const out = new Map<number, DefId>();
  for (const [i, e] of topObjectEntities(registry, state, level))
    out.set(i, itemShownId(registry, state, e));
  return out;
}

const letterRank = (l: string | null): number => {
  if (l === null) return 1000;
  if (l === '$') return 0;
  const c = l.charCodeAt(0);
  if (c >= 97 && c <= 122) return c - 96; // a-z: 1..26
  if (c >= 65 && c <= 90) return c - 64 + 26; // A-Z: 27..52
  return 100 + c;
};

/** Items carried by `owner`, in inventory-letter order ('$', a-z, A-Z), then by id. */
export function inventoryOf(state: Readonly<GameState>, owner: EntityId): Entity[] {
  const out: Entity[] = [];
  for (const id of sortedIds(state)) {
    const e = state.entities[String(id)];
    if (e?.c.item?.carriedBy === owner) out.push(e);
  }
  return out.sort(
    (a, b) =>
      letterRank(a.c.item?.letter ?? null) - letterRank(b.c.item?.letter ?? null) || a.id - b.id,
  );
}

/** True for an item whose def is a container (ref: include/obj.h Is_container). */
export function isContainer(registry: Registry, e: Entity): boolean {
  return isItem(registry, e) && registry.object(e.def).container !== undefined;
}

/**
 * Items directly inside the container `box`, newest first (ref: src/mkobj.c add_to_container()
 * prepends to obj->cobj). Nested contents are not included.
 */
export function contents(state: Readonly<GameState>, box: EntityId): Entity[] {
  const out: Entity[] = [];
  for (const id of sortedIds(state)) {
    const e = state.entities[String(id)];
    if (e?.c.item?.containedIn === box) out.push(e);
  }
  return out.sort((a, b) => (b.c.item?.placed ?? 0) - (a.c.item?.placed ?? 0) || a.id - b.id);
}

/**
 * Puts a detached item (no `pos`, `carriedBy` null, not contained: freshly made, or taken off
 * the floor, out of an inventory or out of another container) into the container `box`; it
 * becomes the newest item there. ref: src/mkobj.c add_to_container(), which also requires a
 * free object. Unlike it, core does not merge stacks (merge rules are content's): merge first.
 * Throws if `box` is not a container item, or if `item` is `box` or holds it (nesting loop).
 */
export function putIn(registry: Registry, state: GameState, box: EntityId, item: EntityId): void {
  const b = state.entities[String(box)];
  const e = state.entities[String(item)];
  const it = e?.c.item;
  if (!b || !isContainer(registry, b)) throw new Error(`putIn: ${box} is not a container`);
  if (!e || !it) throw new Error(`putIn: ${item} is not an item`);
  if (e.c.pos !== undefined || it.carriedBy !== null || it.containedIn !== undefined)
    throw new Error(`putIn: item ${item} is not detached`);
  // Walk up from the box: the item must not be the box or any container holding it.
  for (let cur: Entity | undefined = b; cur;) {
    if (cur.id === item) throw new Error(`putIn: item ${item} would contain itself`);
    const up: EntityId | undefined = cur.c.item?.containedIn;
    cur = up === undefined ? undefined : state.entities[String(up)];
  }
  it.equipped = null;
  it.containedIn = box;
  it.placed = state.seq++;
}

/**
 * Takes an item out of its container and leaves it detached: the caller must place it (on the
 * floor, in an inventory, in another container) or remove it before the step ends.
 * ref: src/mkobj.c obj_extract_self() for OBJ_CONTAINED. Throws if it is not in a container.
 */
export function takeOut(state: GameState, item: EntityId): void {
  const it = state.entities[String(item)]?.c.item;
  if (it?.containedIn === undefined) throw new Error(`takeOut: item ${item} is not in a container`);
  delete it.containedIn;
}

/**
 * The ids of every item inside `box`, nested contents included, in id order. Used to delete a
 * container with what it holds. ref: src/shk.c obfree() delete_contents()
 */
export function allContents(state: Readonly<GameState>, box: EntityId): EntityId[] {
  const inside = new Set<EntityId>([box]);
  const out: EntityId[] = [];
  // Ids only grow, but a container may be newer than what it holds: repeat until stable.
  for (let grew = true; grew;) {
    grew = false;
    for (const id of sortedIds(state)) {
      const c = state.entities[String(id)]?.c.item?.containedIn;
      if (c !== undefined && inside.has(c) && !inside.has(id)) {
        inside.add(id);
        out.push(id);
        grew = true;
      }
    }
  }
  return out.sort((a, b) => a - b);
}
