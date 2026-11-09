// Eggs' state: which monster an egg holds, its hatch timer, and which eggs the hero recognises.
// A leaf (core only), so items.ts, mkobj.ts, objnam.ts and egg.ts can all read it.
// ref: src/mon.c can_be_hatched(), egg_type_from_parent(), dead_species(); src/mondata.c
// little_to_big(), big_to_little(); src/timeout.c attach_egg_hatch_timeout(), kill_egg(),
// learn_egg_type(); src/mkobj.c set_corpsenm() EGG; include/obj.h stale_egg()
import type {
  Ctx,
  DefId,
  EntityId,
  GameState,
  ItemComponent,
  MonsterDef,
  Registry,
} from '@nh/core';
import { isGenocided } from './vanquished';

export const EGG: DefId = 'nh:egg';

/** The hatch timer's kind; its data is `{ id }` (the egg). ref: HATCH_EGG */
export const HATCH_EGG: DefId = 'nh:hatch_egg';

/** ref: include/hack.h MAX_EGG_HATCH_TIME */
export const MAX_EGG_HATCH_TIME = 200;

/**
 * The growing-up pairs (little, big). ref: src/mondata.c grownups[] (the whole table: a pair whose
 * monsters are not registered is skipped by the lookups below)
 */
const GROWNUPS: readonly (readonly [string, string])[] = [
  ['chickatrice', 'cockatrice'],
  ['little_dog', 'dog'],
  ['dog', 'large_dog'],
  ['hell_hound_pup', 'hell_hound'],
  ['winter_wolf_cub', 'winter_wolf'],
  ['kitten', 'housecat'],
  ['housecat', 'large_cat'],
  ['pony', 'horse'],
  ['horse', 'warhorse'],
  ['kobold', 'large_kobold'],
  ['large_kobold', 'kobold_leader'],
  ['gnome', 'gnome_leader'],
  ['gnome_leader', 'gnome_ruler'],
  ['dwarf', 'dwarf_leader'],
  ['dwarf_leader', 'dwarf_ruler'],
  ['mind_flayer', 'master_mind_flayer'],
  ['orc', 'orc_captain'],
  ['hill_orc', 'orc_captain'],
  ['mordor_orc', 'orc_captain'],
  ['uruk_hai', 'orc_captain'],
  ['sewer_rat', 'giant_rat'],
  ['cave_spider', 'giant_spider'],
  ['ogre', 'ogre_leader'],
  ['ogre_leader', 'ogre_tyrant'],
  ['elf', 'elf_noble'],
  ['woodland_elf', 'elf_noble'],
  ['green_elf', 'elf_noble'],
  ['grey_elf', 'elf_noble'],
  ['elf_noble', 'elven_monarch'],
  ['lich', 'demilich'],
  ['demilich', 'master_lich'],
  ['master_lich', 'arch_lich'],
  ['vampire', 'vampire_leader'],
  ['bat', 'giant_bat'],
  ['baby_gray_dragon', 'gray_dragon'],
  ['baby_gold_dragon', 'gold_dragon'],
  ['baby_silver_dragon', 'silver_dragon'],
  ['baby_red_dragon', 'red_dragon'],
  ['baby_white_dragon', 'white_dragon'],
  ['baby_orange_dragon', 'orange_dragon'],
  ['baby_black_dragon', 'black_dragon'],
  ['baby_blue_dragon', 'blue_dragon'],
  ['baby_green_dragon', 'green_dragon'],
  ['baby_yellow_dragon', 'yellow_dragon'],
  ['red_naga_hatchling', 'red_naga'],
  ['black_naga_hatchling', 'black_naga'],
  ['golden_naga_hatchling', 'golden_naga'],
  ['guardian_naga_hatchling', 'guardian_naga'],
  ['small_mimic', 'large_mimic'],
  ['large_mimic', 'giant_mimic'],
  ['baby_long_worm', 'long_worm'],
  ['baby_purple_worm', 'purple_worm'],
  ['baby_crocodile', 'crocodile'],
  ['soldier', 'sergeant'],
  ['sergeant', 'lieutenant'],
  ['lieutenant', 'captain'],
  ['watchman', 'watch_captain'],
  ['aligned_cleric', 'high_cleric'],
  ['student', 'archeologist'],
  ['attendant', 'healer'],
  ['page', 'knight'],
  ['acolyte', 'cleric'],
  ['apprentice', 'wizard'],
  ['manes', 'lemure'],
  ['keystone_kop', 'kop_sergeant'],
  ['kop_sergeant', 'kop_lieutenant'],
  ['kop_lieutenant', 'kop_kaptain'],
];

/** ref: src/mondata.c little_to_big(): one step up the table (the first pair that matches) */
export function littleToBig(defs: Pick<Registry, 'isMonster'>, mon: DefId): DefId {
  for (const [l, b] of GROWNUPS) {
    if (`nh:${l}` === mon) return defs.isMonster(`nh:${b}`) ? (`nh:${b}` as DefId) : mon;
  }
  return mon;
}

/** ref: src/mondata.c big_to_little(): one step down the table (the first pair that matches) */
export function bigToLittle(defs: Pick<Registry, 'isMonster'>, mon: DefId): DefId {
  for (const [l, b] of GROWNUPS) {
    if (`nh:${b}` === mon) return defs.isMonster(`nh:${l}`) ? (`nh:${l}` as DefId) : mon;
  }
  return mon;
}

/** ref: include/mondata.h lays_eggs() */
export const laysEggs = (def: MonsterDef): boolean => def.flags.includes('oviparous');

/** ref: include/mondata.h eggs_in_water(): oviparous swimmers of the eel class */
export const eggsInWater = (def: MonsterDef): boolean =>
  laysEggs(def) && def.glyph.ch === ';' && def.flags.includes('swim');

/** ref: src/mon.c BREEDER_EGG: sometimes an egg will be special */
const breederEgg = (ctx: Pick<Ctx, 'rng'>): boolean => ctx.rng.rn2(77) === 0;

/**
 * The monster an egg of `mon` holds, or null when it cannot be hatched. Queen bees lay killer
 * bee eggs (usually), but killer bees don't grow into queen bees; ditto for [winged-]gargoyles.
 * ref: src/mon.c can_be_hatched() (no Scorpius)
 */
export function canBeHatched(ctx: Pick<Ctx, 'rng' | 'defs'>, mon: DefId): DefId | null {
  const m = littleToBig(ctx.defs, mon);
  if (!ctx.defs.isMonster(m)) return null;
  if (
    m === 'nh:killer_bee' ||
    m === 'nh:gargoyle' ||
    (laysEggs(ctx.defs.monster(m)) &&
      (breederEgg(ctx) || (m !== 'nh:queen_bee' && m !== 'nh:winged_gargoyle')))
  )
    return m;
  return null;
}

/** The type of egg laid by #sit; usually matches the parent. ref: src/mon.c egg_type_from_parent() */
export function eggTypeFromParent(
  ctx: Pick<Ctx, 'rng'>,
  mon: DefId,
  forceOrdinary: boolean,
): DefId {
  if (forceOrdinary || !breederEgg(ctx)) {
    if (mon === 'nh:queen_bee') return 'nh:killer_bee';
    if (mon === 'nh:winged_gargoyle') return 'nh:gargoyle';
  }
  return mon;
}

/**
 * Whether an egg (or tin) of the type is not viable: generic eggs (no monster) are unhatchable,
 * and so are those of a genocided species; for an egg, genociding either the baby or the adult
 * form counts (no extinction). ref: src/mon.c dead_species()
 */
export function deadSpecies(
  state: Readonly<GameState>,
  defs: Pick<Registry, 'isMonster'>,
  mon: DefId | null | undefined,
  egg = true,
): boolean {
  if (!mon) return true;
  const alt = egg ? bigToLittle(defs, mon) : mon;
  return isGenocided(state, mon) || isGenocided(state, alt);
}

/** ref: include/obj.h stale_egg(): older than 2 * MAX_EGG_HATCH_TIME */
export const staleEgg = (state: Readonly<GameState>, it: Readonly<ItemComponent>): boolean =>
  state.turn - (it.age ?? 0) > 2 * MAX_EGG_HATCH_TIME;

// ---------------------------------------------------------------------------------------------
// the hatch timer (a core timer whose data is the egg's id)

const timerOf = (t: { kind: DefId; data: unknown }, id: EntityId): boolean =>
  t.kind === HATCH_EGG && (t.data as { id?: unknown } | null)?.id === id;

/** The egg's hatch turn, or null without a timer (obj->timed for an egg). */
export function eggHatchAt(state: Readonly<GameState>, id: EntityId): number | null {
  const t = state.timers.find((x) => timerOf(x, id));
  return t ? t.at : null;
}

/** Stops the egg's hatch timer; returns the turns that were left (0 without one). ref: stop_timer() */
export function killEgg(ctx: Pick<Ctx, 'state'>, id: EntityId): number {
  const at = eggHatchAt(ctx.state, id);
  if (at === null) return 0;
  ctx.state.timers = ctx.state.timers.filter((t) => !timerOf(t, id));
  return at - ctx.state.turn;
}

/**
 * Attaches a hatch timer to the egg: `when` turns from now, or (0) a random time that mimics the
 * old hatch_it(), which tried once a turn from age 151 to 200 rolling `rnd(age) > 150` (it
 * hatches more than 99.9993% of the time). ref: src/timeout.c attach_egg_hatch_timeout()
 */
export function attachEggHatchTimeout(
  ctx: Pick<Ctx, 'state' | 'rng' | 'schedule'>,
  id: EntityId,
  when: number,
): void {
  // stop previous timer, if any
  killEgg(ctx, id);
  if (!when) {
    for (let i = MAX_EGG_HATCH_TIME - 50 + 1; i <= MAX_EGG_HATCH_TIME; i++)
      if (ctx.rng.rnd(i) > 150) {
        // egg will hatch
        when = i;
        break;
      }
  }
  if (when) ctx.schedule(Math.max(when, 1), HATCH_EGG, { id });
}

/**
 * Makes the egg one of `mon` (null: a generic egg), keeping a running hatch timer's time.
 * ref: src/mkobj.c set_corpsenm() EGG
 */
export function setEggCorpsenm(
  ctx: Pick<Ctx, 'state' | 'rng' | 'schedule' | 'defs'>,
  id: EntityId,
  mon: DefId | null,
): void {
  const it = ctx.state.entities[String(id)]?.c.item;
  if (!it) return;
  const when = killEgg(ctx, id);
  if (mon) it.corpseOf = mon;
  else delete it.corpseOf;
  if (!deadSpecies(ctx.state, ctx.defs, mon)) attachEggHatchTimeout(ctx, id, when);
}

/** obj_split_timers() for an egg: the split-off part hatches at the same time. */
export function splitEggTimer(
  ctx: Pick<Ctx, 'state' | 'schedule'>,
  from: EntityId,
  to: EntityId,
): void {
  const at = eggHatchAt(ctx.state, from);
  if (at !== null) ctx.schedule(Math.max(at - ctx.state.turn, 1), HATCH_EGG, { id: to });
}

// ---------------------------------------------------------------------------------------------
// MV_KNOWS_EGG: `modData.nh.knowsEgg`, the sorted ids of the (grown-up) monsters whose eggs the
// hero recognises; absent while empty

function knownList(state: Readonly<GameState>): readonly string[] {
  const v = (state.modData['nh'] as { knowsEgg?: unknown } | undefined)?.knowsEgg;
  return Array.isArray(v) ? (v as string[]) : [];
}

/** svm.mvitals[mon].mvflags & MV_KNOWS_EGG */
export const knowsEgg = (state: Readonly<GameState>, mon: DefId): boolean =>
  knownList(state).includes(mon);

/** Learn to recognize eggs of the given type (baby monsters hatch from grown-up eggs). ref: learn_egg_type() */
export function learnEggType(ctx: Pick<Ctx, 'state' | 'defs'>, mon: DefId): void {
  const m = littleToBig(ctx.defs, mon);
  if (knowsEgg(ctx.state, m)) return;
  const md = ctx.state.modData;
  const nh = (md['nh'] ??= {}) as { knowsEgg?: string[] };
  nh.knowsEgg = [...knownList(ctx.state), m].sort();
}
