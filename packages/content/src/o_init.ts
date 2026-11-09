// Randomized appearances and discoveries. ref: src/o_init.c
import {
  type Ctx,
  type DefId,
  type GameState,
  type ModApi,
  type ObjectClass,
  type ObjectDef,
  type Registry,
} from '@nh/core';

/**
 * Rings and amulets have shuffled appearances (ring colors and descriptions move together; a
 * ring keeps its own material, see DEVIATIONS.md). Amulets exclude the non-magic imitation,
 * which has a fixed description. Exported for tests that shuffle one class.
 */
export const JEWELRY_CLASSES: readonly ObjectClass[] = ['ring', 'amulet'];

/** Wands are shuffled as a whole class. */
export const WAND_CLASSES: readonly ObjectClass[] = ['wand'];

/**
 * Spellbooks are shuffled too, except blank paper, which has a fixed description (ref:
 * src/o_init.c obj_shuffle_range() SPBOOK_CLASS: magic, non-unique books only).
 */
export const SPELLBOOK_CLASSES: readonly ObjectClass[] = ['spellbook'];

/**
 * Classes whose descriptions are shuffled per game, in NetHack's order (venom does not exist;
 * the armor sub-ranges follow, see {@link ARMOR_RANGES}).
 * ref: src/o_init.c shuffle_all() shuffle_classes[]
 */
const SHUFFLED: readonly ObjectClass[] = [
  'amulet',
  'potion',
  'ring',
  'scroll',
  'spellbook',
  'wand',
];

/**
 * Assigns each shuffled object (those without a fixed `descKey`) a distinct random appearance of
 * its class. ref: src/o_init.c shuffle_all(), shuffle(): for each object j in order, swap its
 * description with that of a random object i in j..last. NetHack shuffles the descriptions of
 * its full object list; our object set is a subset, so drawing distinct descriptions from the
 * full appearance pool (a partial Fisher-Yates over it, the same swap loop) gives each of our
 * objects a uniformly random distinct description, equivalent to a full permutation restricted
 * to our objects.
 */
export function shuffleAll(
  ctx: Pick<Ctx, 'state' | 'rng' | 'defs'>,
  classes: readonly ObjectClass[] = SHUFFLED,
): void {
  const { state, defs, rng } = ctx;
  for (const cls of classes) {
    const pool = defs.appearances.filter((a) => a.class === cls).map((a) => a.id);
    const objs = defs.objects.filter((o) => o.class === cls && o.descKey === undefined);
    if (objs.length > pool.length) throw new Error(`shuffleAll: too few ${cls} appearances`);
    for (let j = 0; j < objs.length; j++) {
      const i = j + rng.rn2(pool.length - j);
      const a = pool[j];
      const b = pool[i];
      if (a === undefined || b === undefined) continue;
      pool[j] = b;
      pool[i] = a;
      const o = objs[j];
      if (o) state.appearances[o.id] = b;
    }
  }
}

/**
 * The armor sub-ranges shuffled after the whole classes, in NetHack's order: each object of a
 * range takes one of the range's descriptions. The gloves are left
 * out while leather gloves are the only gloves (it keeps "old gloves", as a range of one
 * cannot shuffle). ref: src/o_init.c shuffle_all() shuffle_types[], obj_shuffle_range()
 * (HELMET..HELM_OF_TELEPATHY, CLOAK_OF_PROTECTION..CLOAK_OF_DISPLACEMENT,
 * SPEED_BOOTS..LEVITATION_BOOTS); shuffle() with `domaterial` FALSE (the material stays).
 */
export interface ArmorRange {
  /** The objects of the range, in objects.h order (those missing from the table are skipped). */
  readonly objs: readonly DefId[];
  /** Its descriptions, in objects.h order. */
  readonly looks: readonly DefId[];
}

export const ARMOR_RANGES: readonly ArmorRange[] = [
  {
    objs: [
      'nh:helmet',
      'nh:helm_of_caution',
      'nh:helm_of_opposite_alignment',
      'nh:helm_of_telepathy',
    ],
    looks: ['nh:plumed_helmet', 'nh:etched_helmet', 'nh:crested_helmet', 'nh:visored_helmet'],
  },
  {
    objs: [
      'nh:cloak_of_protection',
      'nh:cloak_of_invisibility',
      'nh:cloak_of_magic_resistance',
      'nh:cloak_of_displacement',
    ],
    looks: ['nh:tattered_cape', 'nh:opera_cloak', 'nh:ornamental_cope', 'nh:piece_of_cloth'],
  },
  {
    objs: [
      'nh:speed_boots',
      'nh:water_walking_boots',
      'nh:jumping_boots',
      'nh:elven_boots',
      'nh:kicking_boots',
      'nh:fumble_boots',
      'nh:levitation_boots',
    ],
    looks: [
      'nh:combat_boots',
      'nh:jungle_boots',
      'nh:hiking_boots',
      'nh:mud_boots',
      'nh:buckled_boots',
      'nh:riding_boots',
      'nh:snow_boots',
    ],
  },
];

/**
 * Shuffles the armor sub-ranges the same way as {@link shuffleAll} does a class: each object of
 * the range in the table (without a fixed `descKey`) draws a distinct description of the range.
 */
export function shuffleArmor(
  ctx: Pick<Ctx, 'state' | 'rng' | 'defs'>,
  ranges: readonly ArmorRange[] = ARMOR_RANGES,
): void {
  const { state, defs, rng } = ctx;
  for (const r of ranges) {
    const pool = r.looks.filter((id) => defs.isAppearance(id));
    const objs = r.objs.filter((id) => defs.isObject(id) && defs.object(id).descKey === undefined);
    if (objs.length > pool.length) throw new Error('shuffleArmor: too few appearances');
    for (let j = 0; j < objs.length; j++) {
      const i = j + rng.rn2(pool.length - j);
      const a = pool[j];
      const b = pool[i];
      if (a === undefined || b === undefined) continue;
      pool[j] = b;
      pool[i] = a;
      const o = objs[j];
      if (o) state.appearances[o] = b;
    }
  }
}

/** Whether the hero knows what the object is. ref: objects[].oc_name_known (set at game start for objects with no description) */
export function isKnown(
  state: Readonly<GameState>,
  _defs: Registry,
  def: ObjectDef | DefId,
): boolean {
  const id = typeof def === 'string' ? def : def.id;
  if (state.discovered.includes(id)) return true;
  const d = typeof def === 'string' ? _defs.object(def) : def;
  return d.descKey === undefined && state.appearances[d.id] === undefined;
}

/** Marks the object type as identified, keeping `discovered` sorted. ref: src/o_init.c discover_object() */
export function discover(ctx: Pick<Ctx, 'state'>, def: ObjectDef | DefId): void {
  const id = typeof def === 'string' ? def : def.id;
  const list = ctx.state.discovered;
  if (list.includes(id)) return;
  list.push(id);
  list.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Registers the appearance shuffle, which runs first in newGame so later hooks see appearances. */
export function registerShuffle(api: ModApi): void {
  // ref: src/o_init.c init_objects() -> shuffle_all(), at game start
  api.on(
    'newGame',
    (ctx) => {
      shuffleAll(ctx);
      shuffleArmor(ctx);
    },
    { priority: 100 },
  );
}
