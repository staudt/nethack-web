// Object instances: creation, weight, stacking and inventory handling.
import {
  allContents,
  contents,
  inventoryOf,
  itemsAt,
  type Buc,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type GameState,
  type ItemComponent,
  type LevelId,
  type MonsterDef,
  type Msg,
  type ObjectDef,
  type Registry,
  type Rng,
} from '@nh/core';
import {
  erosionMatters,
  isCorrodeable,
  isCrackable,
  isDamageable,
  isFlammable,
  isRottable,
  isRustprone,
} from './material';
import { setBoxTknown, setBoxTrapped } from './btrapstate';
import { CHARGED_RINGS } from './objects';
import { mergeBills, samePrice, splitbill } from './eshk';
import { EGG, attachEggHatchTimeout, deadSpecies, eggHatchAt, splitEggTimer } from './eggstate';
import { FIGURINE, carryObjEffects, stopFigTransform } from './figurinestate';
import { MAX_OIL_IN_FLASK, POT_OIL } from './dilute';
import { TIN, setTinVariety } from './tins';
import { isCandle, mergeBurn, splitBurn } from './burnstate';
import { roleIs } from './urole';
import { mkArtifactConvert, nartifactExist, onameItem } from './artistate';

/** What the item functions need from a `Ctx` (tests can supply a minimal one). */
export type ItemCtx = Pick<
  Ctx,
  'state' | 'rng' | 'defs' | 'emit' | 'spawn' | 'remove' | 'schedule'
>;

/**
 * Number of successes of a 1/x chance, capped; ref: src/rnd.c rne().
 * `heroLevel` is u.ulevel: the cap is 5 below level 15, else level / 3.
 */
export function rne(rng: Rng, x: number, heroLevel: number): number {
  const utmp = heroLevel < 15 ? 5 : Math.trunc(heroLevel / 3);
  let tmp = 1;
  while (tmp < utmp && rng.rn2(x) === 0) tmp++;
  return tmp;
}

const heroLevelOf = (ctx: Pick<ItemCtx, 'state'>): number =>
  ctx.state.entities[String(ctx.state.playerId)]?.c.experience?.level ?? 1;

/** ref: src/mkobj.c blessorcurse() */
function blessorcurse(rng: Rng, it: ItemComponent, chance: number): void {
  if (it.buc !== 'uncursed') return;
  if (rng.rn2(chance) === 0) it.buc = rng.rn2(2) === 0 ? 'cursed' : 'blessed';
}

/** ref: src/mkobj.c curse() (the BUC part) */
const curse = (it: ItemComponent): void => {
  it.buc = 'cursed';
};

/** The object fields mksobj_init() and mkobj_erosions() look at. */
export type InitDef = Pick<
  ObjectDef,
  'id' | 'class' | 'weapon' | 'wand' | 'material' | 'prop' | 'cost'
>;

/**
 * A small fraction of new weapons and armor are made eroded or erodeproof.
 * ref: src/mkobj.c mkobj_erosions(), may_generate_eroded(). The objects that may not be eroded
 * are those that cannot erode (erosion_matters(), is_damageable()) and the hero's starting
 * inventory (`moves <= 1 && !in_mklev`, passed in by the caller), worm teeth and unicorn horns,
 * and artifacts. Grease is not ported: its 1 in 1000 roll is made.
 */
export function mkobjErosions(rng: Rng, def: InitDef, it: ItemComponent): void {
  const d = def as ObjectDef;
  if (it.erodeproof || !erosionMatters(d) || !isDamageable(d)) return;
  // part of a monster's body and produced when it dies
  if (d.id === 'nh:unicorn_horn' || d.id === 'nh:worm_tooth') return;
  // artifacts cannot be generated eroded
  if (it.artifact !== undefined) return;
  if (!rng.rn2(100)) {
    it.erodeproof = true;
  } else {
    let e1 = 0;
    let e2 = 0;
    if (!rng.rn2(80) && (isFlammable(d) || isRustprone(d) || isCrackable(d))) {
      do e1++;
      while (e1 < 3 && !rng.rn2(9));
    }
    if (!rng.rn2(80) && (isRottable(d) || isCorrodeable(d))) {
      do e2++;
      while (e2 < 3 && !rng.rn2(9));
    }
    if (e1 || e2) it.erosion = { e1: e1 as 0 | 1 | 2 | 3, e2: e2 as 0 | 1 | 2 | 3 };
  }
  rng.rn2(1000); // greased: not ported
}

/** The magic instruments: rn1(5, 4) charges. ref: src/mkobj.c mksobj_init() TOOL_CLASS */
const MAGIC_INSTRUMENTS: readonly string[] = [
  'nh:magic_flute',
  'nh:magic_harp',
  'nh:frost_horn',
  'nh:fire_horn',
  'nh:drum_of_earthquake',
];

/** The armor mksobj_init() curses 9 times in 10. ref: src/mkobj.c mksobj_init() ARMOR_CLASS */
const ALWAYS_CURSED_ARMOR: readonly string[] = [
  'nh:fumble_boots',
  'nh:levitation_boots',
  'nh:helm_of_opposite_alignment',
  'nh:gauntlets_of_fumbling',
];

/**
 * A Samurai's splint mail made at the start of the game is lacquered: erodeproof, and she knows
 * it. ref: src/mkobj.c mksobj_init() ARMOR_CLASS (`moves <= 1 || In_quest()`; no quest)
 */
const lacqueredForSamurai = (state: Readonly<GameState>, id: string): boolean =>
  id === 'nh:splint_mail' && state.turn <= 1 && roleIs(state, 'samurai');

/**
 * Random initialization of an object's BUC, enchantment, quantity and erosion.
 * ref: src/mkobj.c mksobj_init() for every class of the subset, ending with mkobj_erosions()
 * (`erode` false for the hero's starting inventory). Simplified: poisonable weapons roll for
 * poison but are never poisoned; food has no corpse/slime-mold special cases
 * (the corpse is made through mkcorpse(), which supplies the monster; mksobj() rolls the egg's
 * monster and the tin's contents first).
 */
export function mksobjInit(
  ctx: Pick<ItemCtx, 'state' | 'rng'>,
  def: InitDef,
  it: ItemComponent,
  artif = false,
  erode = true,
): { otrapped: boolean; tknown: boolean } | null {
  const rng = ctx.rng;
  let trap: { otrapped: boolean; tknown: boolean } | null = null;
  const lvl = heroLevelOf(ctx);
  switch (def.class) {
    case 'weapon': {
      // ref: is_multigen(): ammunition and missiles come in stacks of rn1(6, 6)
      const multigen = def.weapon?.role === 'ammo' || def.weapon?.role === 'missile';
      if (multigen) it.quantity = rng.rn2(6) + 6;
      if (rng.rn2(11) === 0) {
        it.spe = rne(rng, 3, lvl);
        it.buc = rng.rn2(2) === 0 ? 'uncursed' : 'blessed';
      } else if (rng.rn2(10) === 0) {
        it.buc = 'cursed';
        it.spe = -rne(rng, 3, lvl);
      } else blessorcurse(rng, it, 10);
      // is_poisonable(): the roll is made, but poison is not ported (see DEVIATIONS.md)
      if (multigen) rng.rn2(100);
      // ref: mksobj_init(): mk_artifact() with otmp and A_NONE
      if (artif && !rng.rn2(20 + 10 * nartifactExist(ctx.state)))
        mkArtifactConvert(ctx, def.id, it, true);
      break;
    }
    case 'gem':
      // ref: mksobj_init() GEM_CLASS: a loadstone is cursed; rocks come in rn1(6, 6); other
      // gems and stones (not luckstones) are a pair 1 time in 6
      if (def.id === 'nh:loadstone') curse(it);
      else if (def.id === 'nh:rock') it.quantity = rng.rn2(6) + 6;
      else if (def.id !== 'nh:luckstone' && rng.rn2(6) === 0) it.quantity = 2;
      else it.quantity = 1;
      break;
    case 'food':
      it.eaten = 0;
      if (def.id !== 'nh:corpse' && rng.rn2(6) === 0) it.quantity = 2;
      break;
    case 'potion':
    case 'scroll':
      blessorcurse(rng, it, 4);
      break;
    case 'armor':
      // fumble and levitation boots, the helm of opposite alignment and gauntlets of fumbling
      // are cursed 9 times in 10, the rest 1 in 11 of those
      if (rng.rn2(10) !== 0 && (ALWAYS_CURSED_ARMOR.includes(def.id) || rng.rn2(11) === 0)) {
        it.buc = 'cursed';
        it.spe = -rne(rng, 3, lvl);
      } else if (rng.rn2(10) === 0) {
        it.buc = rng.rn2(2) === 0 ? 'uncursed' : 'blessed';
        it.spe = rne(rng, 3, lvl);
      } else blessorcurse(rng, it, 10);
      // ref: mksobj_init(): mk_artifact() with otmp and A_NONE
      if (artif && !rng.rn2(40 + 10 * nartifactExist(ctx.state)))
        mkArtifactConvert(ctx, def.id, it, true);
      // simulate lacquered armor for samurai (mksobj() marks it rknown); no quest
      if (lacqueredForSamurai(ctx.state, def.id)) it.erodeproof = true;
      break;
    case 'wand':
      // ref: mksobj_init() WAND_CLASS: wishing 1, stasis rn1(4, 3), else
      // spe = rn1(5, NODIR ? 11 : 4); blessorcurse(otmp, 17). recharged stays 0 (absent).
      if (def.id === 'nh:wand_of_wishing') it.spe = 1;
      else if (def.id === 'nh:wand_of_stasis') it.spe = rng.rn2(4) + 3;
      else it.spe = rng.rn2(5) + (def.wand?.dir === 'nodir' ? 11 : 4);
      blessorcurse(rng, it, 17);
      break;
    case 'tool':
      // ref: mksobj_init() TOOL_CLASS (the tools of the subset)
      if (def.id === 'nh:tallow_candle' || def.id === 'nh:wax_candle') {
        it.spe = 1;
        it.age = 20 * def.cost; // 400 or 200 turns of light (lamplit stays off)
        it.quantity = 1 + (rng.rn2(2) ? rng.rn2(7) : 0);
        blessorcurse(rng, it, 5);
      } else if (def.id === 'nh:brass_lantern' || def.id === 'nh:oil_lamp') {
        it.spe = 1;
        it.age = rng.rn2(500) + 1000; // rn1(500, 1000)
        blessorcurse(rng, it, 5);
      } else if (def.id === 'nh:magic_lamp') {
        it.spe = 1; // the djinni is inside; it burns no fuel (age is never read)
        blessorcurse(rng, it, 2);
      } else if (
        def.id === 'nh:expensive_camera' ||
        def.id === 'nh:tinning_kit' ||
        def.id === 'nh:magic_marker'
      ) {
        it.spe = rng.rn2(70) + 30; // rn1(70, 30)
      } else if (def.id === 'nh:horn_of_plenty') {
        it.spe = rng.rn2(18) + 3; // rn1(18, 3): 3..20
      } else if (MAGIC_INSTRUMENTS.includes(def.id)) {
        it.spe = rng.rn2(5) + 4; // rn1(5, 4)
      } else if (def.id === FIGURINE) {
        // the monster (rndmonnum_adj(5, 10), not human) was rolled first, in mksobj()
        blessorcurse(rng, it, 4);
      } else if (def.id === 'nh:chest' || def.id === 'nh:large_box') {
        if (rng.rn2(5)) it.locked = true;
        // the caller records them (btrapstate.ts: the item has no id yet)
        const otrapped = !rng.rn2(10);
        trap = { otrapped, tknown: otrapped && !rng.rn2(100) }; // obvious trap
      }
      // the contents (mkbox_cnts() in mkobj.ts) are made once the box exists
      break;
    case 'amulet':
      // ref: mksobj_init() AMULET_CLASS
      if (
        rng.rn2(10) &&
        (def.id === 'nh:amulet_of_strangulation' ||
          def.id === 'nh:amulet_of_change' ||
          def.id === 'nh:amulet_of_restful_sleep')
      )
        curse(it);
      else blessorcurse(rng, it, 10);
      break;
    case 'spellbook':
      // ref: mksobj_init() SPBOOK_CLASS: spestudied = 0 (no entry in modData.nh.spestudied)
      blessorcurse(rng, it, 17);
      break;
    case 'ring':
      // ref: mksobj_init() RING_CLASS
      if (CHARGED_RINGS.has(def.id)) {
        blessorcurse(rng, it, 3);
        if (rng.rn2(10)) {
          if (rng.rn2(10) && bcsign(it.buc)) it.spe = bcsign(it.buc) * rne(rng, 3, lvl);
          else it.spe = rng.rn2(2) ? rne(rng, 3, lvl) : -rne(rng, 3, lvl);
        }
        // make useless +0 rings much less common
        if (it.spe === 0) it.spe = rng.rn2(4) - rng.rn2(3);
        // negative rings are usually cursed
        if (it.spe < 0 && rng.rn2(5)) curse(it);
      } else if (
        rng.rn2(10) &&
        (def.id === 'nh:ring_of_teleportation' ||
          def.id === 'nh:ring_of_polymorph' ||
          def.id === 'nh:ring_of_aggravate_monster' ||
          def.id === 'nh:ring_of_hunger' ||
          !rng.rn2(9))
      )
        curse(it);
      break;
    case 'coin':
      break;
  }
  if (erode) mkobjErosions(rng, def, it);
  return trap;
}

export interface MksobjOpts {
  /** Random BUC/enchantment/quantity (mksobj's `init`); default true. */
  init?: boolean;
  /** Overrides the quantity after init. */
  quantity?: number;
  /** Place on the floor (merging into a pile) ... */
  at?: { level: LevelId; x: number; y: number };
  /** ... or put into this entity's inventory (merging). Neither: the item is left detached. */
  carriedBy?: EntityId;
  /** Corpses (required), statues and eggs: the monster. */
  corpseOf?: DefId;
  /** The level whose difficulty a random monster (an egg's) follows; default `at`'s, else the hero's. */
  level?: LevelId;
  /** mksobj's `artif`: weapons and armor may become a random artifact of their type. */
  artif?: boolean;
  /** The hero's starting inventory (`moves <= 1 && !in_mklev`): never made eroded. */
  initialInventory?: boolean;
}

/**
 * Creates an object instance. ref: src/mkobj.c mksobj(). The returned id is the resulting stack:
 * if the object merged into an existing stack on the floor or in the inventory, that stack's id.
 * A detached item (no `at`/`carriedBy`) is in no place yet and must be placed by the caller
 * before the step ends. Corpses must pass `corpseOf` (random corpses are not implemented).
 */
/**
 * mksobj_init()'s EGG roll: `!rn2(3)` then up to 200 tries of can_be_hatched(rndmonnum()) for a
 * typed egg. mkobj.ts registers it (rndmonnum() sits above this module); null: a generic egg.
 */
export type EggInit = (ctx: ItemCtx, level: LevelId) => DefId | null;
let eggInit: EggInit | null = null;
/**
 * A figurine's monster: with `init`, mksobj_init()'s `rndmonnum_adj(5, 10)` re-rolled up to 30
 * times past humans; without, mksobj()'s plain rndmonnum(). mkobj.ts registers it.
 */
type FigurineInit = (ctx: ItemCtx, level: LevelId, init: boolean) => DefId;
let figurineInit: FigurineInit | null = null;
/**
 * mksobj_init()'s TIN roll: spinach 1 time in 6, else up to 200 tries of
 * undead_to_corpse(rndmonnum()) for a monster with corpse nutrition and a corpse; null leaves
 * the tin empty. mkobj.ts registers it (rndmonnum() sits above this module).
 */
export type TinInit = (ctx: ItemCtx, level: LevelId) => DefId | 'spinach' | null;
let tinInit: TinInit | null = null;
export function setTinInit(fn: TinInit): void {
  tinInit = fn;
}
export function setFigurineInit(fn: FigurineInit): void {
  figurineInit = fn;
}
export function setEggInit(fn: EggInit): void {
  eggInit = fn;
}

export function mksobj(ctx: ItemCtx, def: ObjectDef, opts: MksobjOpts = {}): EntityId {
  const { state } = ctx;
  const it: ItemComponent = {
    quantity: 1,
    buc: 'uncursed',
    spe: 0,
    known: { buc: false, spe: false },
    carriedBy: null,
    letter: null,
    equipped: null,
    placed: state.seq++,
    age: Math.max(state.turn, 1),
  };
  if (def.id === 'nh:corpse') {
    if (!opts.corpseOf) throw new Error('mksobj: a corpse needs corpseOf (use mkcorpse)');
    it.corpseOf = opts.corpseOf;
  } else if (def.id === 'nh:statue' && opts.corpseOf) it.corpseOf = opts.corpseOf;
  const egg = def.id === EGG;
  if (egg) {
    // ref: mksobj_init() EGG (before the food's quantity roll); a given monster overrides it
    // as set_corpsenm() would after mksobj()
    const level = opts.level ?? opts.at?.level ?? state.currentLevel;
    const mon = (opts.init ?? true) && eggInit ? eggInit(ctx, level) : null;
    if (mon) it.corpseOf = mon;
    if (opts.corpseOf) it.corpseOf = opts.corpseOf;
  }
  if (def.id === TIN) {
    // ref: mksobj_init() TIN (before the food's quantity roll): its contents and variety, then
    // blessorcurse(10); a given monster (a wish, the tinning kit) is set by the caller
    if ((opts.init ?? true) && tinInit) {
      const what = tinInit(ctx, opts.level ?? opts.at?.level ?? state.currentLevel);
      if (what === 'spinach') setTinVariety(ctx.rng, ctx.defs, it, 'spinach');
      else if (what !== null) {
        it.corpseOf = what;
        setTinVariety(ctx.rng, ctx.defs, it, 'random');
      }
      blessorcurse(ctx.rng, it, 10);
    }
    if (opts.corpseOf) it.corpseOf = opts.corpseOf;
  }
  if (def.id === FIGURINE) {
    // ref: mksobj_init() FIGURINE (before its blessorcurse()), or mksobj()'s STATUE/FIGURINE
    // case without init; a given monster overrides it as set_corpsenm() would (and a given one
    // without init skips the throwaway roll, as statues do)
    const level = opts.level ?? opts.at?.level ?? state.currentLevel;
    const init = opts.init ?? true;
    const mon = figurineInit && (init || !opts.corpseOf) ? figurineInit(ctx, level, init) : null;
    if (mon) it.corpseOf = mon;
    if (opts.corpseOf) it.corpseOf = opts.corpseOf;
  }
  const trap =
    (opts.init ?? true)
      ? mksobjInit(ctx, def, it, opts.artif === true, !opts.initialInventory)
      : null;
  if (opts.quantity !== undefined) it.quantity = opts.quantity;
  // ref: mksobj(): a potion of oil holds MAX_OIL_IN_FLASK of fuel (init or not)
  if (def.id === POT_OIL) it.age = MAX_OIL_IN_FLASK;
  const id = ctx.spawn({ def: def.id, c: { item: it } });
  if ((opts.init ?? true) && lacqueredForSamurai(state, def.id)) setRknown(ctx, id, true);
  // ref: mksobj() -> set_corpsenm(): a viable egg gets its hatch timer (before it can merge)
  if (egg && !deadSpecies(ctx.state, ctx.defs, it.corpseOf)) attachEggHatchTimeout(ctx, id, 0);
  if (trap?.otrapped) setBoxTrapped(ctx, id, true);
  if (trap?.tknown) setBoxTknown(ctx, id, true);
  if (opts.at) return placeOnFloor(ctx, id, opts.at.level, opts.at.x, opts.at.y);
  if (opts.carriedBy !== undefined) return addToInventory(ctx, opts.carriedBy, id);
  return id;
}

/**
 * A corpse of `mon`. ref: src/mkobj.c mkcorpstat(). Simplified: no gender (corpse spe), no rot
 * timer yet (the age is recorded for it), no revive timer.
 */
export function mkcorpse(
  ctx: ItemCtx,
  mon: MonsterDef,
  where: Pick<MksobjOpts, 'at' | 'carriedBy'>,
): EntityId {
  return mksobj(ctx, ctx.defs.object('nh:corpse'), {
    init: false,
    corpseOf: mon.id,
    ...where,
  });
}

/**
 * A pile of gold on the floor, added to gold already there. ref: src/mkobj.c mkgold():
 * `amount <= 0` rolls the amount from the level depth.
 */
export function mkgold(
  ctx: ItemCtx,
  amount: number,
  at: { level: LevelId; x: number; y: number },
): EntityId {
  if (amount <= 0) {
    const depth = ctx.state.levels[at.level]?.depth ?? 1;
    const mul = ctx.rng.rnd(Math.trunc(30 / Math.max(12 - depth, 2)));
    amount = 1 + ctx.rng.rnd(depth + 2) * mul;
  }
  return mksobj(ctx, ctx.defs.object('nh:gold_piece'), { init: false, quantity: amount, at });
}

// ---------------------------------------------------------------------------------------------
// weight

/** ref: include/monflag.h MZ_TINY .. MZ_GIGANTIC */
export const MSIZE: Readonly<Record<string, number>> = {
  tiny: 0,
  small: 1,
  medium: 2,
  large: 3,
  huge: 4,
  gigantic: 7,
};

/** ref: src/eat.c eaten_stat(): weight of partly eaten food scales with the nutrition left. */
export function eatenStat(base: number, full: number, left: number): number {
  const uneaten = Math.min(left, full);
  const w = full ? Math.trunc((base * uneaten) / full) : 0;
  return w < 1 ? 1 : w;
}

/**
 * ref: src/mkobj.c weight(). A container weighs its contents too (pass `state`; without it only
 * the empty container is counted). Gold weighs (n + 50) / 100, at least 1; a corpse weighs its
 * monster's corpse weight; partly eaten food is scaled by eaten_stat() (full nutrition is the
 * def's, or the monster's for a corpse; ref: src/eat.c obj_nutrition(), without the lembas/cram
 * race adjustments).
 */
export function weight(defs: Registry, item: Entity, state?: Readonly<GameState>): number {
  const it = item.c.item;
  if (!it) return 0;
  const def = defs.object(item.def);
  if (def.container && state) {
    // ref: weight(): the container plus its contents; a bag of holding's contents weigh half
    // (rounded up), a quarter when blessed (rounded up), twice when cursed
    let cwt = 0;
    for (const o of contents(state, item.id)) cwt += weight(defs, o, state);
    if (def.container.holding)
      cwt =
        it.buc === 'cursed'
          ? cwt * 2
          : it.buc === 'blessed'
            ? Math.trunc((cwt + 3) / 4)
            : Math.trunc((cwt + 1) / 2);
    return def.weight * it.quantity + cwt;
  }
  if (def.id === 'nh:statue' && state) {
    // ref: weight(): 1.5 times the corpse weight, at least (2 * msize + 1) * 100 for monsters
    // that are tiny or leave no corpse; plus what the statue holds
    let wt = def.weight * it.quantity;
    if (it.corpseOf && defs.isMonster(it.corpseOf)) {
      const mon = defs.monster(it.corpseOf);
      const msize = MSIZE[mon.size] ?? 0;
      wt = Math.max(Math.trunc((3 * mon.weight) / 2), (2 * msize + 1) * 100) * it.quantity;
    }
    for (const o of contents(state, item.id)) wt += weight(defs, o, state);
    return wt;
  }
  if (def.id === 'nh:corpse' && it.corpseOf && defs.isMonster(it.corpseOf)) {
    const mon = defs.monster(it.corpseOf);
    const wt = it.quantity * mon.weight;
    return it.eaten ? eatenStat(wt, mon.nutrition, it.eaten) : wt;
  }
  if (def.class === 'food' && it.eaten) {
    return eatenStat(it.quantity * def.weight, def.food?.nutrition ?? 0, it.eaten);
  }
  if (def.class === 'coin') return Math.max(Math.trunc((it.quantity + 50) / 100), 1);
  // ref: weight(): the Candelabrum weighs its candles too (each a tallow candle's weight)
  if (def.id === 'nh:candelabrum_of_invocation' && it.spe)
    return def.weight + it.spe * defs.object('nh:tallow_candle').weight;
  return def.weight ? def.weight * it.quantity : (it.quantity + 1) >> 1;
}

// ---------------------------------------------------------------------------------------------
// stacking

/**
 * Whether `obj` could merge into the stack `into`. ref: src/invent.c mergable(). Our fields:
 * same def, `merge` flag, same BUC and enchantment (coins always merge), same eaten amount for
 * food, same monster for corpses. Differences in the known flags do not prevent merging (they
 * only would when blind or hallucinating, which is not implemented). Worn status does not
 * matter: a picked-up dagger joins the wielded stack, as in NetHack.
 * Candles merge only when their ages are close. Shop state must match (unpaid, no charge), and
 * unpaid stacks only merge at the same price on the same bill (`state` is needed for that; without
 * it unpaid stacks never merge). Eggs merge only with the same monster and no hatch timer.
 * Lit and unlit stacks never merge, nor do burning potions of oil. Two named objects merge
 * only with the same name (a corpse also never with an unnamed one), and artifacts never.
 * Not ported: grease, reviving corpses.
 */
export function mergable(
  defs: Registry,
  into: Entity,
  obj: Entity,
  state?: Readonly<GameState>,
): boolean {
  const a = into.c.item;
  const b = obj.c.item;
  if (!a || !b || into.id === obj.id || into.def !== obj.def) return false;
  const def = defs.object(obj.def);
  if (!def.merge) return false;
  if (def.class === 'coin') return true;
  if (a.buc !== b.buc || a.spe !== b.spe) return false;
  if ((a.unpaid ?? false) !== (b.unpaid ?? false)) return false;
  if ((a.noCharge ?? false) !== (b.noCharge ?? false)) return false;
  // ref: mergable(): oeroded, oeroded2 and (when erosion matters) oerodeproof must match
  if ((a.erosion?.e1 ?? 0) !== (b.erosion?.e1 ?? 0)) return false;
  if ((a.erosion?.e2 ?? 0) !== (b.erosion?.e2 ?? 0)) return false;
  if (erosionMatters(def) && (a.erodeproof ?? false) !== (b.erodeproof ?? false)) return false;
  if (def.class === 'food' && (a.eaten ?? 0) !== (b.eaten ?? 0)) return false;
  if ((def.id === 'nh:corpse' || def.id === EGG || def.id === TIN) && a.corpseOf !== b.corpseOf)
    return false;
  // hatching eggs don't merge (a typed egg's timer is unknown without the state)
  if (
    def.id === EGG &&
    (state
      ? eggHatchAt(state, into.id) !== null || eggHatchAt(state, obj.id) !== null
      : a.corpseOf !== undefined)
  )
    return false;
  // ref: mergable(): `obj->lamplit != otmp->lamplit`
  if ((a.lit ?? false) !== (b.lit ?? false)) return false;
  // allow candle merging only if their ages are close
  if (isCandle(def.id) && Math.trunc((a.age ?? 0) / 25) !== Math.trunc((b.age ?? 0) / 25))
    return false;
  // burning potions of oil never merge
  if (def.id === POT_OIL && b.lit) return false;
  // don't merge surcharged item with base-cost item
  if (b.unpaid && (!state || !samePrice({ state }, obj.id, into.id))) return false;
  // if they have names, make sure they're the same
  const an = a.name ?? '';
  const bn = b.name ?? '';
  if (
    (an.length !== bn.length && ((an && bn) || def.id === 'nh:corpse')) ||
    (an && bn && an !== bn)
  )
    return false;
  // should be moot since matching artifacts wouldn't be unique
  if (a.artifact !== b.artifact) return false;
  return true;
}

export { isCandle } from './burnstate';

/**
 * Merges `obj` into `into` if they are mergable, removing `obj`; returns whether it did.
 * ref: src/invent.c merged(). The age becomes the quantity-weighted average (so corpses
 * merge), known flags are ORed (with the "learn more by comparing" message when the hero
 * carries the stack and something was learned), a worn `obj` passes its slot on, and its name
 * goes to an unnamed `into`.
 */
export function merged(ctx: ItemCtx, into: Entity, obj: Entity): boolean {
  if (!mergable(ctx.defs, into, obj, ctx.state)) return false;
  const a = into.c.item;
  const b = obj.c.item;
  if (!a || !b) return false;
  if (b.unpaid) mergeBills(ctx, into.id, obj.id); // obfree(obj, otmp): bill->otmp
  // don't do the age manipulation if lit (the burn would have to stop on both items first)
  if (!b.lit)
    a.age = Math.trunc(
      ((a.age ?? 0) * a.quantity + (b.age ?? 0) * b.quantity) / (a.quantity + b.quantity),
    );
  a.quantity += b.quantity;
  // the merged stack takes the absorbed part's name when it has none
  if (!a.name && b.name) onameItem(ctx, into.def, a, b.name);
  // obj_merge_light_sources(): the absorbed part's light and timer go; the target keeps its own
  if (b.lit) mergeBurn(ctx, obj.id);
  const isCoin = ctx.defs.object(into.def).class === 'coin';
  let learned = false;
  if (isCoin) {
    a.known.buc = false;
  } else {
    if (b.known.spe !== a.known.spe) {
      a.known.spe = true;
      learned = true;
    }
    if (b.known.buc !== a.known.buc) {
      a.known.buc = true;
      if (!roleIs(ctx.state, 'priest')) learned = true; // a Priest knew it already
    }
    if (rknown(ctx.state, obj.id) !== rknown(ctx.state, into.id) && a.erodeproof) {
      setRknown(ctx, into.id, true);
      learned = true;
    }
  }
  setRknown(ctx, obj.id, false);
  if (b.equipped !== null && a.carriedBy !== null && a.equipped === null) a.equipped = b.equipped;
  ctx.remove(obj.id);
  if (learned && a.carriedBy === ctx.state.playerId) ctx.emit({ type: 'msg', key: 'item.compare' });
  return true;
}

// ---------------------------------------------------------------------------------------------
// inventory

interface NhData {
  lastinvnr: number;
  /** Hero skill levels by skill name (ref: u.weapon_skills); absent = restricted. */
  skills?: Record<string, number>;
  /** The most each skill can reach (P_MAX_SKILL); absent = the role's list (SKILL_V). */
  skillMax?: Record<string, number>;
  /** Practice points per skill (P_ADVANCE). */
  skillAdvance?: Record<string, number>;
  /** Unused skill slots (u.weapon_slots). */
  weaponSlots?: number;
  /** How many skill advancements were made (u.skills_advanced, limit P_SKILL_LIMIT). */
  skillsAdvanced?: number;
  /** The skills advanced, in order (u.skill_record); lose_weapon_skill() takes back the last. */
  skillRecord?: string[];
  /** The alternate weapon's item id (uswapwep); it must still be carried to count. */
  uswapwep?: number | null;
  /**
   * Saddles worn by monsters: item id -> monster id (obj->leashmon with W_SADDLE in owornmask;
   * core's EquipSlot has no saddle slot). Leaving the monster's inventory takes it off.
   */
  saddled?: Record<string, number>;
  /** Names the hero gave object types ("called"), by object def id (oc_uname). */
  called?: Record<string, string>;
  /** The hero's last encumbrance level, for encumber_msg(). */
  oldcap?: number;
  /** Message shown when the current helplessness ends (ref: nomovemsg). */
  nomovemsg?: Msg | null;
  /** The function to run when the helplessness ends, by setAfternmv() key (ref: afternmv). */
  afternmv?: string;
  /** The monster a polymorphed hero swallowed whole, for its corpse effects once digested
   * (gc.corpsenm_digested); see hmonas.ts gulpum(). */
  corpsenmDigested?: DefId;
  /** The worn armor being taken off for a thief, and the thief (ref: stealoid, stealmid). */
  stealoid?: number;
  stealmid?: number;
  /** Items whose erodeproofing the hero knows, by item id (obj->rknown); see rknown(). */
  rknown?: Record<string, true>;
  /** Boxes whose lock state the hero knows, by item id (obj->lknown); see objKnown(). */
  lknown?: Record<string, true>;
  /** Containers whose contents the hero knows, by item id (obj->cknown); see objKnown(). */
  cknown?: Record<string, true>;
  /** She can tell edible food (u.uedibility, a blessed food detection); see detectobj.ts. */
  uedibility?: true;
  /** The turn of the next clairvoyant vision (context.seer_turn); see detect.ts. */
  seerTurn?: number;
  /**
   * The last boulder pushed and the turn of that push, for dopush()'s message throttle
   * (gb.bldrpush_oid, gb.bldrpushtime); see moverock.ts.
   */
  bldrpush?: { oid: number; time: number };
}

/** The content mod's persistent data (gl.lastinvnr and friends). */
export function nhData(ctx: Pick<ItemCtx, 'state'>): NhData {
  const md = ctx.state.modData;
  let d = md['nh'] as unknown as NhData | undefined;
  if (typeof d !== 'object' || d === null || Array.isArray(d)) {
    // ref: src/nhlua.c: gl.lastinvnr = 51 -- the next letter tried is 'a'
    d = { lastinvnr: 51 };
    md['nh'] = d as unknown as (typeof md)[string];
  }
  // another module may have made the table first (the passtune is drawn before the kit)
  if (typeof d.lastinvnr !== 'number') d.lastinvnr = 51;
  return d;
}

// ---------------------------------------------------------------------------------------------
// The worn saddle (W_SADDLE): put on by put_saddle_on_mon() (dog.ts), taken off when it leaves the
// monster's inventory (removeFromInventory()). There is no riding.

/** Whether the item is a saddle its carrier wears. ref: obj->owornmask & W_SADDLE */
export function isWornSaddle(state: Readonly<GameState>, item: Entity): boolean {
  const md = state.modData['nh'] as unknown as { saddled?: Record<string, number> } | undefined;
  const mon = md?.saddled?.[String(item.id)];
  return mon !== undefined && item.c.item?.carriedBy === mon;
}

/** The saddle the monster wears, or null. ref: src/worn.c which_armor(mon, W_SADDLE) */
export function wornSaddle(state: Readonly<GameState>, monId: EntityId): Entity | null {
  return inventoryOf(state, monId).find((o) => isWornSaddle(state, o)) ?? null;
}

/** Marks the saddle, carried by `monId`, as worn. ref: src/steed.c put_saddle_on_mon() */
export function setWornSaddle(ctx: Pick<Ctx, 'state'>, itemId: EntityId, monId: EntityId): void {
  (nhData(ctx).saddled ??= {})[String(itemId)] = monId;
}

/**
 * obj->bknown as the hero has it: a Priest knows the blessed/cursed state of every object she
 * names or counts (xname() and count_buc() set bknown; coins excepted), so for her it is always
 * known. ref: src/objnam.c xname() `if (Role_if(PM_CLERIC)) obj->bknown = 1`; src/invent.c
 * count_buc()
 */
export function bknownOf(state: Readonly<GameState>, defs: Registry, item: Entity): boolean {
  if (item.c.item?.known.buc) return true;
  return roleIs(state, 'priest') && defs.object(item.def).class !== 'coin';
}

// ---------------------------------------------------------------------------------------------
// rknown: whether the hero knows the item's erodeproofing (obj->rknown). It lives in
// `modData.nh.rknown` by item id, as the core item component has no such field, and is only
// recorded for erodeproof items: for the others it would only matter to not_fully_identified()
// (see DEVIATIONS.md, scroll of identify).

/** ref: obj->rknown */
export function rknown(state: Readonly<GameState>, id: EntityId): boolean {
  const md = state.modData['nh'] as unknown as { rknown?: Record<string, true> } | undefined;
  return md?.rknown?.[String(id)] === true;
}

/** Sets or clears obj->rknown. */
export function setRknown(ctx: Pick<Ctx, 'state'>, id: EntityId, on: boolean): void {
  const d = nhData(ctx);
  if (on) (d.rknown ??= {})[String(id)] = true;
  else if (d.rknown) {
    delete d.rknown[String(id)];
    if (Object.keys(d.rknown).length === 0) delete d.rknown;
  }
}

// lknown and cknown: whether the hero knows a box's lock state (obj->lknown) and a container's
// contents (obj->cknown). Like rknown they live in `modData.nh` by item id, as the core item
// component has no such fields.

export type ObjKnownFlag = 'lknown' | 'cknown';

/** ref: obj->lknown, obj->cknown */
export function objKnown(state: Readonly<GameState>, flag: ObjKnownFlag, id: EntityId): boolean {
  const md = state.modData['nh'] as unknown as Partial<Record<ObjKnownFlag, Record<string, true>>>;
  return md?.[flag]?.[String(id)] === true;
}

/** Sets or clears obj->lknown / obj->cknown. */
export function setObjKnown(
  ctx: Pick<Ctx, 'state'>,
  flag: ObjKnownFlag,
  id: EntityId,
  on: boolean,
): void {
  const d = nhData(ctx);
  if (on) (d[flag] ??= {})[String(id)] = true;
  else if (d[flag]) {
    delete d[flag][String(id)];
    if (Object.keys(d[flag]).length === 0) delete d[flag];
  }
}

/** Drops the lknown/cknown records of objects that no longer exist. */
export function pruneObjKnown(ctx: Pick<Ctx, 'state'>): void {
  const d = ctx.state.modData['nh'] as unknown as NhData | undefined;
  if (!d) return;
  for (const flag of ['lknown', 'cknown'] as const) {
    const t = d[flag];
    if (!t) continue;
    for (const k of Object.keys(t).sort()) if (!ctx.state.entities[k]) delete t[k];
    if (Object.keys(t).length === 0) delete d[flag];
  }
}

export const setLknown = (ctx: Pick<Ctx, 'state'>, id: EntityId, on: boolean): void =>
  setObjKnown(ctx, 'lknown', id, on);
export const setCknown = (ctx: Pick<Ctx, 'state'>, id: EntityId, on: boolean): void =>
  setObjKnown(ctx, 'cknown', id, on);

const INVLET_BASIC = 52;
const letterIndex = (l: string | null): number => {
  if (l === null || l.length !== 1) return -1;
  const c = l.charCodeAt(0);
  if (c >= 97 && c <= 122) return c - 97;
  if (c >= 65 && c <= 90) return c - 65 + 26;
  return -1;
};
const indexLetter = (i: number): string =>
  i < 26 ? String.fromCharCode(97 + i) : String.fromCharCode(65 + i - 26);

/** The marker for "no free letter". ref: include/hack.h NOINVSYM */
export const NOINVSYM = '#';

/**
 * Gives `itemId` an inventory letter (it must not be in `owner`'s inventory yet or must be
 * excluded). ref: src/invent.c assigninvlet() with the default `fixinv`: coins are '$'; the
 * item's old letter (obj->invlet, kept while it lay on the floor) is reused when free among
 * the owner's items; otherwise the first free letter after the last one assigned, cycling a-z
 * then A-Z.
 */
export function assigninvlet(ctx: ItemCtx, owner: EntityId, itemId: EntityId): void {
  const item = ctx.state.entities[String(itemId)];
  const it = item?.c.item;
  if (!item || !it) return;
  if (ctx.defs.object(item.def).class === 'coin') {
    it.letter = '$';
    return;
  }
  const data = nhData(ctx);
  const inuse: boolean[] = Array.from({ length: INVLET_BASIC }, () => false);
  for (const o of inventoryOf(ctx.state, owner)) {
    if (o.id === itemId) continue;
    const i = letterIndex(o.c.item?.letter ?? null);
    if (i >= 0) inuse[i] = true;
  }
  const want = it.letter;
  const wi = letterIndex(want);
  if (wi >= 0 && !inuse[wi]) {
    it.letter = want;
    return;
  }
  let i = data.lastinvnr + 1;
  for (; i !== data.lastinvnr; i++) {
    if (i === INVLET_BASIC) {
      i = -1;
      continue;
    }
    if (!inuse[i]) break;
  }
  it.letter = inuse[i] ? NOINVSYM : indexLetter(i);
  data.lastinvnr = i;
}

/** Number of items (stacks) `owner` carries. ref: src/invent.c inv_cnt() */
export function invCount(ctx: Pick<ItemCtx, 'state'>, owner: EntityId, incGold = false): number {
  return inventoryOf(ctx.state, owner).filter((e) => incGold || e.c.item?.letter !== '$').length;
}

/**
 * Puts the item into `owner`'s inventory, merging into an existing stack when possible, and
 * returns the id of the resulting stack. ref: src/invent.c addinv_core0()/addinv(). Only the
 * hero gets letters. The item may be detached or on the floor; it leaves the floor.
 */
export function addToInventory(ctx: ItemCtx, owner: EntityId, itemId: EntityId): EntityId {
  const item = ctx.state.entities[String(itemId)];
  const it = item?.c.item;
  if (!item || !it) throw new Error(`addToInventory: ${itemId} is not an item`);
  if (it.carriedBy !== null) removeFromInventory(ctx, itemId);
  delete item.c.pos;
  if (owner === ctx.state.playerId) {
    // ref: src/invent.c addinv_core0(): no_charge is never set in the hero's inventory
    // (addtobill() clears it, but not for gold or in an untended shop); picked_container()
    delete it.noCharge;
    const picked = (box: EntityId, depth: number): void => {
      for (const o of contents(ctx.state, box)) {
        if (ctx.defs.object(o.def).class === 'coin' || !o.c.item) continue;
        delete o.c.item.noCharge;
        if (depth < 100) picked(o.id, depth + 1);
      }
    };
    picked(itemId, 0);
  }
  for (const other of inventoryOf(ctx.state, owner)) {
    if (merged(ctx, other, item)) return other.id;
  }
  it.carriedBy = owner;
  it.equipped = null;
  it.placed = ctx.state.seq++;
  if (owner === ctx.state.playerId) assigninvlet(ctx, owner, itemId);
  else it.letter = null;
  // carrying affects the obj: a cursed figurine's transform timer
  if (item.def === FIGURINE) carryObjEffects(ctx, itemId);
  return itemId;
}

/**
 * Takes the item out of its carrier's inventory and leaves it detached (no place): the caller
 * must place it (placeOnFloor, addToInventory) or `ctx.remove` it. ref: src/invent.c freeinv().
 * Unequips it; it keeps its letter (obj->invlet) so picking it up again restores it if free.
 */
export function removeFromInventory(ctx: ItemCtx, itemId: EntityId): void {
  const it = ctx.state.entities[String(itemId)]?.c.item;
  if (!it) return;
  // ref: freeinv_core(): a figurine leaving the hero's pack stops transforming
  if (it.carriedBy === ctx.state.playerId && ctx.state.entities[String(itemId)]?.def === FIGURINE)
    stopFigTransform(ctx, itemId);
  it.carriedBy = null;
  it.equipped = null;
  // ref: src/do.c dropx()/dropz(): leaving the inventory clears the alternate-weapon slot
  const data = ctx.state.modData['nh'] as unknown as NhData | undefined;
  if (data && data.uswapwep === itemId) data.uswapwep = null;
  // a saddle taken from its monster is no longer worn (setnotworn())
  if (data?.saddled?.[String(itemId)] !== undefined) {
    delete data.saddled[String(itemId)];
    if (Object.keys(data.saddled).length === 0) delete data.saddled;
  }
}

/**
 * Things that change when no longer held, the item's contents included: a crysknife reverts to a
 * worm tooth (a fixed one 1 time in 10), losing its fixed flag. ref: src/do.c
 * obj_no_longer_held() (called by place_object(); no shop charge for the change, see
 * DEVIATIONS.md "Long worms")
 */
export function objNoLongerHeld(ctx: Pick<Ctx, 'state' | 'rng'>, itemId: EntityId): void {
  for (const id of [itemId, ...allContents(ctx.state, itemId)]) {
    const o = ctx.state.entities[String(id)];
    const it = o?.c.item;
    if (!o || !it || o.def !== 'nh:crysknife') continue;
    if (!it.erodeproof || !ctx.rng.rn2(10)) {
      o.def = 'nh:worm_tooth';
      delete it.erodeproof;
    }
  }
}

/**
 * Drops the item on the floor at (x, y), merging into a mergable stack there, and returns the
 * resulting stack's id. ref: src/mkobj.c place_object() followed by src/mkobj.c stackobj().
 * A new object is the top of the pile; a merged one keeps its stack's position.
 */
export function placeOnFloor(
  ctx: ItemCtx,
  itemId: EntityId,
  level: LevelId,
  x: number,
  y: number,
): EntityId {
  const item = ctx.state.entities[String(itemId)];
  const it = item?.c.item;
  if (!item || !it) throw new Error(`placeOnFloor: ${itemId} is not an item`);
  if (it.carriedBy !== null) removeFromInventory(ctx, itemId);
  it.equipped = null;
  delete item.c.pos;
  objNoLongerHeld(ctx, itemId);
  for (const other of itemsAt(ctx.defs, ctx.state, level, x, y)) {
    if (merged(ctx, other, item)) return other.id;
  }
  item.c.pos = { level, x, y };
  it.placed = ctx.state.seq++;
  return itemId;
}

/**
 * Puts the item on the floor at (x, y) as the top of the pile without merging it, for code that
 * must deal with it there before stackobj() (selling in a shop). ref: src/mkobj.c place_object()
 */
export function placeObject(
  ctx: ItemCtx,
  itemId: EntityId,
  level: LevelId,
  x: number,
  y: number,
): void {
  const item = ctx.state.entities[String(itemId)];
  const it = item?.c.item;
  if (!item || !it) throw new Error(`placeObject: ${itemId} is not an item`);
  if (it.carriedBy !== null) removeFromInventory(ctx, itemId);
  it.equipped = null;
  objNoLongerHeld(ctx, itemId);
  item.c.pos = { level, x, y };
  it.placed = ctx.state.seq++;
}

/**
 * Merges a floor item into a mergable stack on its square; returns the resulting stack's id.
 * ref: src/invent.c stackobj()
 */
export function stackobj(ctx: ItemCtx, itemId: EntityId): EntityId {
  const item = ctx.state.entities[String(itemId)];
  const p = item?.c.pos;
  if (!item || !p) return itemId;
  for (const other of itemsAt(ctx.defs, ctx.state, p.level, p.x, p.y)) {
    if (other.id !== itemId && merged(ctx, other, item)) return other.id;
  }
  return itemId;
}

/**
 * Splits `n` items off a stack and returns the new, detached stack (the caller places it, as
 * with removeFromInventory). The original keeps quantity - n and stays where it was, worn
 * status stays with it. ref: src/invent.c splitobj(); requires 0 < n < quantity.
 */
export function splitStack(ctx: ItemCtx, itemId: EntityId, n: number): EntityId {
  const it = ctx.state.entities[String(itemId)]?.c.item;
  if (!it) throw new Error(`splitStack: ${itemId} is not an item`);
  if (n <= 0 || it.quantity <= n)
    throw new Error(`splitStack: cannot split ${n} of ${it.quantity}`);
  const child: ItemComponent = {
    ...it,
    known: { ...it.known },
    ...(it.erosion ? { erosion: { ...it.erosion } } : {}),
    quantity: n,
    carriedBy: null,
    equipped: null,
    placed: ctx.state.seq++,
  };
  it.quantity -= n;
  const def = ctx.state.entities[String(itemId)]?.def;
  if (!def) throw new Error('splitStack: missing def');
  const id = ctx.spawn({ def, c: { item: child } });
  if (rknown(ctx.state, itemId)) setRknown(ctx, id, true);
  // obj_split_timers(): a hatching egg's split-off part keeps the timer
  if (def === EGG) splitEggTimer(ctx, itemId, id);
  // obj_split_light_source(): a lit part burns on with its own timer
  if (it.lit) splitBurn(ctx, itemId, id);
  if (it.unpaid) splitbill(ctx, itemId, id, n);
  return id;
}

/** Buc as a number: blessed +1, cursed -1. ref: src/mkobj.c bcsign() */
export function bcsign(buc: Buc): number {
  return buc === 'blessed' ? 1 : buc === 'cursed' ? -1 : 0;
}
