// Gems and gray stones: the depth-dependent gem probabilities and the luckstone's Luck.
// ref: src/o_init.c setgemprobs(); src/attrib.c stone_luck(), set_moreluck();
// src/artifact.c confers_luck(); src/objnam.c rnd_class()
//
// A leaf module (core only): mkobj.ts, luck.ts, price.ts and others import it, never the reverse.
import {
  type DefId,
  type Entity,
  type GameState,
  type LevelId,
  type ObjectDef,
  type Registry,
  type Rng,
} from '@nh/core';

/**
 * The real gems, FIRST_REAL_GEM..LAST_REAL_GEM in objects.h order; setgemprobs() zeroes a
 * prefix of this list on shallow levels.
 */
export const REAL_GEMS: readonly DefId[] = [
  'nh:dilithium_crystal',
  'nh:diamond',
  'nh:ruby',
  'nh:jacinth',
  'nh:sapphire',
  'nh:black_opal',
  'nh:emerald',
  'nh:turquoise',
  'nh:citrine',
  'nh:aquamarine',
  'nh:amber',
  'nh:topaz',
  'nh:jet',
  'nh:opal',
  'nh:chrysoberyl',
  'nh:garnet',
  'nh:amethyst',
  'nh:jasper',
  'nh:fluorite',
  'nh:obsidian',
  'nh:agate',
  'nh:jade',
];

/** FIRST_GLASS_GEM..LAST_GLASS_GEM in objects.h order. */
export const GLASS_GEMS: readonly DefId[] = [
  'nh:worthless_piece_of_white_glass',
  'nh:worthless_piece_of_blue_glass',
  'nh:worthless_piece_of_red_glass',
  'nh:worthless_piece_of_yellowish_brown_glass',
  'nh:worthless_piece_of_orange_glass',
  'nh:worthless_piece_of_yellow_glass',
  'nh:worthless_piece_of_black_glass',
  'nh:worthless_piece_of_green_glass',
  'nh:worthless_piece_of_violet_glass',
];

/** DILITHIUM_CRYSTAL..LOADSTONE, the range mkbox_cnts() turns a rock into. */
export const BOX_ROCK_GEMS: readonly DefId[] = [
  ...REAL_GEMS,
  ...GLASS_GEMS,
  'nh:luckstone',
  'nh:loadstone',
];

/**
 * The position of a gem or glass after FIRST_REAL_GEM (`otyp - FIRST_REAL_GEM`), or -1.
 * ref: src/shk.c set_cost()
 */
export function gemOffset(id: DefId): number {
  const i = REAL_GEMS.indexOf(id);
  if (i >= 0) return i;
  const g = GLASS_GEMS.indexOf(id);
  return g >= 0 ? REAL_GEMS.length + g : -1;
}

/**
 * The two gems an unidentified piece of glass of each colour is priced as. ref: src/shk.c
 * get_cost(): `pseudorand ? first : second`, in GLASS_GEMS order.
 */
export const GLASS_PRICED_AS: readonly (readonly [DefId, DefId])[] = [
  ['nh:diamond', 'nh:opal'], // white
  ['nh:sapphire', 'nh:aquamarine'], // blue
  ['nh:ruby', 'nh:jasper'], // red
  ['nh:amber', 'nh:topaz'], // yellowish brown
  ['nh:jacinth', 'nh:agate'], // orange
  ['nh:citrine', 'nh:chrysoberyl'], // yellow
  ['nh:black_opal', 'nh:jet'], // black
  ['nh:emerald', 'nh:jade'], // green
  ['nh:amethyst', 'nh:fluorite'], // violet
];

/** Gems with oc_tough (HARDGEM(mohs): Mohs hardness 8 or more). ref: include/objects.h */
export const HARD_GEMS: ReadonlySet<DefId> = new Set([
  'nh:diamond',
  'nh:ruby',
  'nh:jacinth',
  'nh:sapphire',
  'nh:black_opal',
  'nh:emerald',
  'nh:aquamarine',
  'nh:topaz',
]);

/** Items that confer Luck when carried. ref: src/artifact.c confers_luck() (no artifacts) */
export const LUCK_ITEMS: ReadonlySet<DefId> = new Set(['nh:luckstone']);

/** ref: include/you.h LUCKADD: the bonus of a carried luck item */
export const LUCKADD = 3;

/**
 * The ledger number setgemprobs() reads for a level. ref: src/dungeon.c ledger_no(): in the main
 * dungeon it is the level number. Every other dungeon (the Mines) comes after the Dungeons of
 * Doom and Gehennom in C's ledger, past the last gem cutoff, so it gets 27 (all gems allowed).
 */
export function gemLedger(state: Readonly<GameState>, levelId: LevelId): number {
  const level = state.levels[levelId];
  if (!level) return 1;
  return level.dungeon === state.dungeons[0]?.id ? level.dlevel : ALL_GEMS_LEDGER;
}

/** A ledger past every setgemprobs() cutoff (`9 - lev / 3 <= 0`). */
export const ALL_GEMS_LEDGER = 27;

/**
 * An object's generation probability at a ledger: the real gems follow setgemprobs(), the
 * first `9 - lev / 3` getting 0 and the rest `(171 + j - first) / (LAST_REAL_GEM + 1 - first)`;
 * everything else keeps its static prob. ref: src/o_init.c setgemprobs()
 */
export function gemProb(def: ObjectDef, ledger: number): number {
  const j = REAL_GEMS.indexOf(def.id);
  if (j < 0) return def.prob;
  const first = Math.max(0, 9 - Math.trunc(ledger / 3));
  if (j < first) return 0;
  return Math.trunc((171 + j - first) / (REAL_GEMS.length - first));
}

/**
 * A type from `ids` by probability at the ledger, or uniformly when they are all 0.
 * ref: src/objnam.c rnd_class()
 */
export function rndClass(
  rng: Pick<Rng, 'rnd' | 'rn2'>,
  defs: Registry,
  ids: readonly DefId[],
  ledger: number,
): DefId {
  const list = ids.filter((id) => defs.isObject(id));
  const prob = (id: DefId): number => gemProb(defs.object(id), ledger);
  const sum = list.reduce((a, id) => a + prob(id), 0);
  if (!sum) return list[rng.rn2(list.length)] ?? (ids[0] as DefId); // rn1(last - first + 1, first)
  let x = rng.rnd(sum);
  for (const id of list) if ((x -= prob(id)) <= 0) return id;
  return list[list.length - 1] as DefId;
}

/**
 * The hero's carried luck items. Luck is read often (every rnl()), so this scans the entities
 * without sorting them: the callers only count, so the order cannot matter.
 */
function luckItems(state: Readonly<GameState>): Entity[] {
  const out: Entity[] = [];
  for (const e of Object.values(state.entities))
    if (e.c.item?.carriedBy === state.playerId && LUCK_ITEMS.has(e.def)) out.push(e);
  return out;
}

/** Whether the hero carries a luckstone. ref: src/invent.c carrying(LUCKSTONE) */
export const carryingLuckstone = (state: Readonly<GameState>): boolean =>
  luckItems(state).some((o) => o.def === 'nh:luckstone');

/**
 * The sign of the carried luck items' pull: +quantity for each blessed one (and uncursed with
 * `includeUncursed`), -quantity for each cursed one. ref: src/attrib.c stone_luck()
 */
export function stoneLuck(state: Readonly<GameState>, includeUncursed: boolean): number {
  let bonchance = 0;
  for (const o of luckItems(state)) {
    const it = o.c.item;
    if (!it) continue;
    if (it.buc === 'cursed') bonchance -= it.quantity;
    else if (it.buc === 'blessed' || includeUncursed) bonchance += it.quantity;
  }
  return Math.sign(bonchance);
}

/**
 * u.moreluck, worked out from the inventory whenever Luck is read (C stores it and calls
 * set_moreluck() whenever the inventory changes). ref: src/attrib.c set_moreluck()
 */
export function moreluck(state: Readonly<GameState>): number {
  const luckbon = stoneLuck(state, true);
  if (!luckbon && !carryingLuckstone(state)) return 0;
  return luckbon >= 0 ? LUCKADD : -LUCKADD;
}

/**
 * Whether carried luck items stop Luck timing out: `nostone` is false while the hero carries a
 * luckstone or a luck item pulls; `timeLuck` is stone_luck(FALSE). ref: src/timeout.c nh_timeout()
 */
export function luckTimeout(state: Readonly<GameState>): { nostone: boolean; timeLuck: number } {
  return {
    nostone: !carryingLuckstone(state) && !stoneLuck(state, true),
    timeLuck: stoneLuck(state, false),
  };
}
