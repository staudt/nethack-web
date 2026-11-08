// Monster inventories: starting gear, wearing armor, wielding weapons, picking things up and
// dropping everything on death.
// ref: src/makemon.c m_initweap(), m_initinv(), mongets(); src/worn.c m_dowear();
// src/weapon.c select_hwep(), mon_wield_item(); src/mon.c mpickstuff(); src/steal.c relobj()
import {
  cellIndex,
  inventoryOf,
  isVisible,
  itemsAt,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type ItemComponent,
  type Json,
  type MonsterDef,
  type ObjectDef,
} from '@nh/core';
import {
  addToInventory,
  mksobj,
  mksobjInit,
  placeOnFloor,
  removeFromInventory,
  splitStack,
  weight,
  type ItemCtx,
} from './items';
import { doname, xnameOf } from './objnam';
import { monFloorEffects } from './align';
import { ALIGNED_CLERIC } from './epri';
import { SHOPKEEPER, eshkOf, inAnyShop, inhishop } from './eshk';

/** What these functions need: a Ctx without the hero-facing parts. */
export type GearCtx = ItemCtx;

const hasFlag = (def: MonsterDef, f: string): boolean => def.flags.includes(f);
const isArmed = (def: MonsterDef): boolean => def.attacks.some((a) => a.at === 'weapon');
const isStrong = (def: MonsterDef): boolean => hasFlag(def, 'strong');
const isLord = (def: MonsterDef): boolean => hasFlag(def, 'lord');
/** ref: include/mondata.h is_mercenary(): M2_MERC */
const isMercenary = (def: MonsterDef): boolean => hasFlag(def, 'merc');
/** ref: include/mondata.h likes_gold() */
export const likesGold = (def: MonsterDef): boolean => hasFlag(def, 'greedy');
/** ref: include/mondata.h likes_gems() */
export const likesGems = (def: MonsterDef): boolean => hasFlag(def, 'jewels');
/** ref: include/mondata.h likes_objs(): M2_COLLECT or armed */
export const likesObjs = (def: MonsterDef): boolean => hasFlag(def, 'collect') || isArmed(def);

const monOf = (ctx: Pick<GearCtx, 'state' | 'defs'>, id: EntityId) => {
  const e = ctx.state.entities[String(id)];
  if (!e?.c.monster) throw new Error(`Entity ${id} is not a monster`);
  return { e, def: ctx.defs.monster(e.def) };
};

// ---------------------------------------------------------------------------------------------
// per-monster flags kept in modData (JSON), keyed by entity id

type JsonObj = { [k: string]: Json };
const isObj = (v: Json | undefined): v is JsonObj =>
  v !== null && v !== undefined && typeof v === 'object' && !Array.isArray(v);

function flagTable(ctx: Pick<GearCtx, 'state'>, key: string, create: boolean): JsonObj | null {
  const md = ctx.state.modData;
  let root = md['nh'];
  if (!isObj(root)) {
    if (!create) return null;
    root = {};
    md['nh'] = root;
  }
  let t = root[key];
  if (!isObj(t)) {
    if (!create) return null;
    t = {};
    root[key] = t;
  }
  return t;
}

/** Whether monster `id` has the named flag set (gearchk, nowep). */
export function monFlag(ctx: Pick<GearCtx, 'state'>, key: string, id: EntityId): boolean {
  return flagTable(ctx, key, false)?.[String(id)] === true;
}

/** Sets or clears a flag. */
export function setMonFlag(
  ctx: Pick<GearCtx, 'state'>,
  key: string,
  id: EntityId,
  on: boolean,
): void {
  if (on) {
    const t = flagTable(ctx, key, true);
    if (t) t[String(id)] = true;
  } else {
    const t = flagTable(ctx, key, false);
    if (t) delete t[String(id)];
  }
}

/** Forgets everything stored about a dead monster. */
export function forgetMonster(ctx: Pick<GearCtx, 'state'>, id: EntityId): void {
  for (const k of ['gearchk', 'nowep', 'mtrack', 'epri', 'eshk']) {
    const t = flagTable(ctx, k, false);
    if (t) delete t[String(id)];
  }
}

// ---------------------------------------------------------------------------------------------
// the inventory

/**
 * The monster's items in minvent order: newest first (add_to_minv prepends, and merging keeps
 * the old stack's place). ref: src/mkobj.c add_to_minv()
 */
export function minvent(ctx: Pick<GearCtx, 'state'>, id: EntityId): Entity[] {
  return inventoryOf(ctx.state, id).sort(
    (a, b) => (b.c.item?.placed ?? 0) - (a.c.item?.placed ?? 0) || b.id - a.id,
  );
}

/** The monster's wielded weapon, if any. ref: include/monst.h MON_WEP() */
export function monWep(ctx: Pick<GearCtx, 'state'>, id: EntityId): Entity | null {
  return minvent(ctx, id).find((o) => o.c.item?.equipped === 'weapon') ?? null;
}

/** The item worn in an armor slot, if any. ref: src/worn.c which_armor() */
export function whichArmor(
  ctx: Pick<GearCtx, 'state'>,
  id: EntityId,
  slot: NonNullable<ItemComponent['equipped']>,
): Entity | null {
  return minvent(ctx, id).find((o) => o.c.item?.equipped === slot) ?? null;
}

/** Gold the monster carries. ref: src/invent.c findgold() */
export function findGold(ctx: Pick<GearCtx, 'state' | 'defs'>, id: EntityId): Entity | null {
  return inventoryOf(ctx.state, id).find((o) => ctx.defs.object(o.def).class === 'coin') ?? null;
}

const objDef = (ctx: Pick<GearCtx, 'defs'>, id: string): ObjectDef | null =>
  ctx.defs.isObject(id as DefId) ? ctx.defs.object(id as DefId) : null;

/**
 * Gives the monster a new object of type `otyp`; returns its stack, or null when the object
 * does not exist in this port (the caller has already made any rolls C makes before it).
 * ref: src/makemon.c mongets(). No demon, minion, player-monster or prince special cases
 * (none are in the roster).
 */
export function mongets(ctx: GearCtx, monId: EntityId, otyp: string): EntityId | null {
  const def = objDef(ctx, otyp);
  if (!def) return null;
  const id = mksobj(ctx, def, { carriedBy: monId });
  // demons never get blessed objects (the only S_DEMON here is the water demon)
  const it = ctx.state.entities[String(id)]?.c.item;
  if (it?.buc === 'blessed' && monOf(ctx, monId).def.glyph.ch === '&') it.buc = 'cursed';
  return id;
}

/**
 * Rolls mksobj_init() for an object this port lacks, to keep the random stream in step.
 * (Only the battle axe, two-handed sword and lucern hammer are still missing.)
 */
function burnWeapon(ctx: GearCtx): void {
  // (all three are iron, which matters for mkobj_erosions())
  const dummy = { id: 'nh:none' as DefId, class: 'weapon' as const, material: 'iron', cost: 0 };
  const it = { quantity: 1, buc: 'uncursed', spe: 0 } as ItemComponent;
  mksobjInit(ctx, dummy, it);
}

/**
 * A stack of 3..(oquan+2) missiles. ref: src/makemon.c m_initthrow(): `mksobj(otyp, TRUE, FALSE)`
 * (which rolls its own multigen quantity), then `quan = rn1(oquan, 3)`. Not ported: orcish
 * arrows being poisoned (`opoisoned`).
 */
function mInitThrow(ctx: GearCtx, monId: EntityId, otyp: string, oquan: number): void {
  const def = objDef(ctx, otyp);
  if (!def) {
    ctx.rng.rn2(oquan);
    return;
  }
  const id = mksobj(ctx, def, {});
  const it = ctx.state.entities[String(id)]?.c.item;
  if (it) it.quantity = ctx.rng.rn2(oquan) + 3;
  addToInventory(ctx, monId, id);
}

/** mongets() of a weapon: when the object is missing, its init rolls are still made. */
function getsOrBurn(ctx: GearCtx, monId: EntityId, otyp: string): void {
  if (mongets(ctx, monId, otyp) === null) burnWeapon(ctx);
}

/** ref: src/makemon.c mkmonmoney() */
export function mkmonmoney(ctx: GearCtx, monId: EntityId, amount: number): void {
  if (amount <= 0) return;
  const def = objDef(ctx, 'nh:gold_piece');
  if (def) mksobj(ctx, def, { init: false, quantity: amount, carriedBy: monId });
}

/**
 * The starting weapons and armor of an armed monster.
 * ref: src/makemon.c m_initweap(), for the roster's kobolds, gnomes, hobbit, orcs, dwarf,
 * the Watch and the water demon (S_DEMON falls through to the general case). Objects missing from
 * the object table (battle axe, two-handed sword, lucern hammer) are not given, but the
 * rolls C makes for them are. (In 5.0 only Uruk-hai are given orcish bows.)
 */
export function mInitWeap(ctx: GearCtx, monId: EntityId): void {
  const { def } = monOf(ctx, monId);
  const rng = ctx.rng;
  const ch = def.glyph.ch;
  if (ch === '@' && isMercenary(def)) {
    mercWeapons(ctx, monId, def);
  } else if (ch === '@') {
    // ref: m_initweap() S_HUMAN `ptr->msound == MS_PRIEST`: a mace, +1..+3, cursed half the time
    if (def.id === ALIGNED_CLERIC) {
      const mace = objDef(ctx, 'nh:mace');
      if (mace) {
        const id = mksobj(ctx, mace, { init: false, carriedBy: monId });
        const it = ctx.state.entities[String(id)]?.c.item;
        if (it) {
          it.spe = rng.rnd(3);
          if (rng.rn2(2) === 0) it.buc = 'cursed';
        }
      }
    }
    // (no other S_HUMAN monster in the roster is armed: they get nothing here)
  } else if (ch === 'h' && def.id === 'nh:hobbit') {
    switch (rng.rn2(3)) {
      case 0:
        mongets(ctx, monId, 'nh:dagger');
        break;
      case 1:
        mongets(ctx, monId, 'nh:elven_dagger');
        break;
      default:
        mongets(ctx, monId, 'nh:sling');
        mInitThrow(ctx, monId, rng.rn2(4) === 0 ? 'nh:flint_stone' : 'nh:rock', 6);
        break;
    }
    if (rng.rn2(10) === 0) mongets(ctx, monId, 'nh:elven_mithril_coat');
    if (rng.rn2(10) === 0) mongets(ctx, monId, 'nh:dwarvish_cloak');
  } else if (ch === 'h' && hasFlag(def, 'dwarf')) {
    if (rng.rn2(7) !== 0) mongets(ctx, monId, 'nh:dwarvish_cloak');
    if (rng.rn2(7) !== 0) mongets(ctx, monId, 'nh:iron_shoes');
    if (rng.rn2(4) === 0) {
      mongets(ctx, monId, 'nh:dwarvish_short_sword');
      // note: you can't use a mattock with a shield
      if (rng.rn2(2) !== 0) mongets(ctx, monId, 'nh:dwarvish_mattock');
      else {
        mongets(ctx, monId, rng.rn2(2) !== 0 ? 'nh:axe' : 'nh:dwarvish_spear');
        mongets(ctx, monId, 'nh:dwarvish_roundshield');
      }
      mongets(ctx, monId, 'nh:dwarvish_iron_helm');
      if (rng.rn2(3) === 0) mongets(ctx, monId, 'nh:dwarvish_mithril_coat');
    } else {
      // a pick-axe 1 time in 3, else a dagger
      if (rng.rn2(3) === 0) mongets(ctx, monId, 'nh:pick_axe');
      else mongets(ctx, monId, 'nh:dagger');
    }
  } else if (ch === 'h') {
    // other S_HUMANOID monsters get nothing here
  } else if (ch === 'o') {
    if (rng.rn2(2) !== 0) mongets(ctx, monId, 'nh:orcish_helm');
    // an orc-captain is equipped as a Mordor orc or an Uruk-hai
    const mm = def.id !== 'nh:orc_captain' ? def.id : rng.rn2(2) ? 'nh:mordor_orc' : 'nh:uruk_hai';
    if (mm === 'nh:mordor_orc') {
      if (!rng.rn2(3)) mongets(ctx, monId, 'nh:scimitar');
      if (!rng.rn2(3)) mongets(ctx, monId, 'nh:orcish_shield');
      if (!rng.rn2(3)) mongets(ctx, monId, 'nh:knife');
      if (!rng.rn2(3)) mongets(ctx, monId, 'nh:orcish_chain_mail');
    } else if (mm === 'nh:uruk_hai') {
      if (!rng.rn2(3)) mongets(ctx, monId, 'nh:orcish_cloak');
      if (!rng.rn2(3)) mongets(ctx, monId, 'nh:orcish_short_sword');
      if (!rng.rn2(3)) mongets(ctx, monId, 'nh:iron_shoes');
      if (!rng.rn2(3)) {
        mongets(ctx, monId, 'nh:orcish_bow');
        mInitThrow(ctx, monId, 'nh:orcish_arrow', 12);
      }
      if (!rng.rn2(3)) mongets(ctx, monId, 'nh:uruk_hai_shield');
    } else if (def.id !== 'nh:orc_shaman' && rng.rn2(2) !== 0) {
      // the other orcs: a goblin always gets the orcish dagger; others pick the dagger or a
      // scimitar
      mongets(
        ctx,
        monId,
        def.id === 'nh:goblin' || rng.rn2(2) === 0 ? 'nh:orcish_dagger' : 'nh:scimitar',
      );
    }
  } else if (ch === 'k') {
    if (rng.rn2(4) === 0) mInitThrow(ctx, monId, 'nh:dart', 12);
  } else {
    // The general case. ref: m_initweap() `default:` (gnomes and any other armed monster)
    const bias = isLord(def) ? 1 : 0;
    switch (rng.rnd(14 - 2 * bias)) {
      case 1:
        if (isStrong(def)) getsOrBurn(ctx, monId, 'nh:battle_axe');
        else mInitThrow(ctx, monId, 'nh:dart', 12);
        break;
      case 2:
        if (isStrong(def)) getsOrBurn(ctx, monId, 'nh:two_handed_sword');
        else {
          mongets(ctx, monId, 'nh:crossbow');
          mInitThrow(ctx, monId, 'nh:crossbow_bolt', 12);
        }
        break;
      case 3:
        mongets(ctx, monId, 'nh:bow');
        mInitThrow(ctx, monId, 'nh:arrow', 12);
        break;
      case 4:
        if (isStrong(def)) mongets(ctx, monId, 'nh:long_sword');
        else mInitThrow(ctx, monId, 'nh:dagger', 3);
        break;
      case 5:
        if (isStrong(def)) getsOrBurn(ctx, monId, 'nh:lucern_hammer');
        else mongets(ctx, monId, 'nh:aklys');
        break;
      default:
        break;
    }
  }
  // `if ((int) mtmp->m_lev > rn2(75)) mongets(mtmp, rnd_offensive_item(mtmp));`
  // (offensive items are wands, potions and scrolls this port cannot choose yet)
  rng.rn2(75); // the roll is made against m_lev; the item it would give is not
}

/**
 * A mercenary's weapons. ref: src/makemon.c m_initweap() S_HUMAN `is_mercenary(ptr)`, for the
 * Watch (the only mercenaries in the roster). There are no polearms or silver sabers in the object
 * table yet: a watchman's polearm is a spear and a watch captain's silver saber a long sword
 * (DEVIATIONS.md); the rolls are C's.
 */
function mercWeapons(ctx: GearCtx, monId: EntityId, def: MonsterDef): void {
  const rng = ctx.rng;
  let w1: string | null = null;
  let w2: string | null = null;
  if (def.id === 'nh:watchman') {
    if (rng.rn2(3) === 0) {
      w1 = 'nh:spear'; // a random polearm (partisan .. bec de corbin) in C
      w2 = rng.rn2(2) !== 0 ? 'nh:dagger' : 'nh:knife';
    } else w1 = rng.rn2(2) !== 0 ? 'nh:spear' : 'nh:short_sword';
  } else if (def.id === 'nh:watch_captain') {
    rng.rn2(2); // LONG_SWORD : SILVER_SABER
    w1 = 'nh:long_sword';
  } else {
    // default: other mercenaries (none in the roster)
    if (rng.rn2(4) === 0) w1 = 'nh:dagger';
    if (rng.rn2(7) === 0) w2 = 'nh:spear';
  }
  if (w1) mongets(ctx, monId, w1);
  if (!w2 && w1 !== 'nh:dagger' && rng.rn2(4) === 0) w2 = 'nh:knife';
  if (w2) mongets(ctx, monId, w2);
}

/** The armor class each mercenary's armor approximates. ref: m_initinv() `mac` */
const MERC_AC: Readonly<Record<string, number>> = { 'nh:watchman': 3, 'nh:watch_captain': -2 };

/**
 * A mercenary's armor, in five rounds that stop once it is armored enough.
 * ref: src/makemon.c m_initinv() S_HUMAN `is_mercenary(ptr)`. Armor missing from the object
 * table (plate mail, crystal plate mail, splint and banded mail, studded leather armor, helmet,
 * dented pot, large shield, low and high boots, leather cloak) and the watchman's tin whistle
 * are not given, and their creation rolls are not made (DEVIATIONS.md).
 */
function mercArmor(ctx: GearCtx, monId: EntityId, def: MonsterDef): void {
  const rng = ctx.rng;
  let mac = MERC_AC[def.id] ?? 0;
  // add_ac(): the armor's bonus counts toward the target
  const add = (otyp: string): void => {
    const id = mongets(ctx, monId, otyp);
    const o = id === null ? undefined : ctx.state.entities[String(id)];
    if (o) mac += armorBonus(ctx, o);
  };
  // round 1: body armor
  if (mac < -1 && rng.rn2(5) !== 0)
    add(rng.rn2(5) !== 0 ? 'nh:plate_mail' : 'nh:crystal_plate_mail');
  else if (mac < 3 && rng.rn2(5) !== 0) add(rng.rn2(3) !== 0 ? 'nh:splint_mail' : 'nh:banded_mail');
  else if (rng.rn2(5) !== 0) add(rng.rn2(3) !== 0 ? 'nh:ring_mail' : 'nh:studded_leather_armor');
  else add('nh:leather_armor');
  // rounds 2 to 5: helmet, shield, boots, gloves or cloak
  const rounds: [string, string][] = [
    ['nh:helmet', 'nh:dented_pot'],
    ['nh:small_shield', 'nh:large_shield'],
    ['nh:low_boots', 'nh:high_boots'],
    ['nh:leather_gloves', 'nh:leather_cloak'],
  ];
  for (const [first, second] of rounds) {
    if (mac < 10 && rng.rn2(3) !== 0) add(first);
    else if (mac < 10 && rng.rn2(2) !== 0) add(second);
  }
  // watch captains get a better weapon instead; most watchmen carry a tin whistle (not in the
  // table: `if (rn2(3)) mongets(mtmp, TIN_WHISTLE)`, only the roll is made)
  if (def.id === 'nh:watchman') rng.rn2(3);
}

/**
 * The extra items of a monster, and its pocket money.
 * ref: src/makemon.c m_initinv(); `depth` is level_difficulty(). No S_DEMON items (the water
 * demon gets none); mummies get their wrapping, nymphs roll for a mirror and a potion of object
 * detection (neither is in the table yet: only the rolls), leprechauns get d(depth, 30) gold, and
 * gnomes roll for a candle (not in the table).
 */
export function mInitInv(ctx: GearCtx, monId: EntityId, depth: number): void {
  const { def } = monOf(ctx, monId);
  const rng = ctx.rng;
  // candle for gnomes (not in the table; not in the Mines), then the defensive and misc item
  // rolls (wands, potions and scrolls this port cannot choose yet): only the rolls are made
  if (def.glyph.ch === '@' && isMercenary(def)) mercArmor(ctx, monId, def);
  else if (def.id === SHOPKEEPER) {
    // ref: m_initinv() S_HUMAN PM_SHOPKEEPER: a skeleton key, then from rn2(4) on (falling
    // through): a wand of magic missile, a potion of extra healing, of healing, a wand of striking
    mongets(ctx, monId, 'nh:skeleton_key');
    const r = rng.rn2(4);
    if (r <= 0) mongets(ctx, monId, 'nh:wand_of_magic_missile');
    if (r <= 1) mongets(ctx, monId, 'nh:potion_of_extra_healing');
    if (r <= 2) mongets(ctx, monId, 'nh:potion_of_healing');
    mongets(ctx, monId, 'nh:wand_of_striking');
  } else if (def.id === ALIGNED_CLERIC) {
    // ref: m_initinv() S_HUMAN MS_PRIEST: a robe (a cloak of protection or of magic resistance
    // 1 time in 7, which this port lacks: a robe then too, after C's roll), a small shield and
    // rn1(10, 20) gold
    if (rng.rn2(7) === 0) rng.rn2(3);
    mongets(ctx, monId, 'nh:robe');
    mongets(ctx, monId, 'nh:small_shield');
    mkmonmoney(ctx, monId, rng.rn2(10) + 20);
  }
  // ref: m_initinv() S_MUMMY
  if (def.glyph.ch === 'M' && rng.rn2(7)) mongets(ctx, monId, 'nh:mummy_wrapping');
  // ref: m_initinv() S_NYMPH, S_LEPRECHAUN
  if (def.glyph.ch === 'n') {
    if (!rng.rn2(2)) mongets(ctx, monId, 'nh:mirror');
    if (!rng.rn2(2)) mongets(ctx, monId, 'nh:potion_of_object_detection');
  }
  if (def.glyph.ch === 'l') mkmonmoney(ctx, monId, rng.d(depth, 30));
  if (def.glyph.ch === 'G') rng.rn2(60);
  rng.rn2(50);
  rng.rn2(100);
  if (likesGold(def) && !findGold(ctx, monId) && rng.rn2(5) === 0) {
    const has = inventoryOf(ctx.state, monId).length > 0;
    mkmonmoney(ctx, monId, rng.d(depth, has ? 5 : 10));
  }
}

// ---------------------------------------------------------------------------------------------
// armor

const armorBonus = (ctx: Pick<GearCtx, 'defs'>, o: Entity): number =>
  (ctx.defs.object(o.def).armor?.ac ?? 0) + (o.c.item?.spe ?? 0);

/** ref: include/mondata.h cantweararm(): small (or tiny) monsters slip out of suits. */
const sliparm = (def: MonsterDef): boolean => def.size === 'tiny' || def.size === 'small';
const breakarm = (def: MonsterDef): boolean =>
  !sliparm(def) &&
  (def.size === 'large' ||
    def.size === 'huge' ||
    def.size === 'gigantic' ||
    (def.size !== 'small' && !hasFlag(def, 'humanoid')));
const cantWearArm = (def: MonsterDef): boolean => breakarm(def) || sliparm(def);
/** ref: include/obj.h WrappingAllowed() (cloaks): humanoid, small to huge */
const wrappingAllowed = (def: MonsterDef): boolean =>
  hasFlag(def, 'humanoid') && def.size !== 'tiny' && def.size !== 'gigantic';

type ArmorSlotName = 'shirt' | 'cloak' | 'helm' | 'shield' | 'gloves' | 'boots' | 'body';

/** One slot of m_dowear(); returns the item newly worn, if any. ref: src/worn.c m_dowear_type() */
function mDoWearType(
  ctx: GearCtx,
  monId: EntityId,
  slot: ArmorSlotName,
  creation: boolean,
  racialException: boolean,
): boolean {
  const { def } = monOf(ctx, monId);
  const items = minvent(ctx, monId);
  const old = items.find((o) => o.c.item?.equipped === slot) ?? null;
  if (old?.c.item?.buc === 'cursed') return false;
  let best: Entity | null = old;
  for (const o of items) {
    const od = ctx.defs.object(o.def);
    if (od.armor?.slot !== slot) continue;
    // mummy wrapping is the only cloak allowed when bigger than human
    if (
      slot === 'cloak' &&
      (def.size === 'large' || def.size === 'huge' || def.size === 'gigantic') &&
      o.def !== 'nh:mummy_wrapping'
    )
      continue;
    // ref: m_dowear_type() W_ARM with the racial exception: hobbits wear elven armor
    if (slot === 'body' && racialException && !(def.id === 'nh:hobbit' && /elven/.test(o.def)))
      continue;
    if (o.c.item?.equipped) continue;
    if (best && armorBonus(ctx, best) >= armorBonus(ctx, o)) continue;
    best = o;
  }
  if (!best || best === old) return false;

  if (!creation) {
    const pos = ctx.state.entities[String(monId)]?.c.pos;
    if (pos && sees(ctx, pos)) {
      ctx.emit(
        old
          ? {
              type: 'msg',
              key: 'mon.removes_puts_on',
              params: {
                mon: `@${def.id}`,
                old: doname(ctx.state, ctx.defs, old),
                item: doname(ctx.state, ctx.defs, best),
              },
            }
          : {
              type: 'msg',
              key: 'mon.puts_on',
              params: { mon: `@${def.id}`, item: doname(ctx.state, ctx.defs, best) },
            },
      );
    }
  }
  if (old?.c.item) old.c.item.equipped = null;
  const bi = best.c.item;
  if (bi) bi.equipped = slot;
  return true;
}

/**
 * The monster puts on the best armor it carries in each slot; returns whether anything changed.
 * ref: src/worn.c m_dowear(). Simplifications: the donning delay (mfrozen) is not applied, and
 * amulets and the other special cases do not exist.
 */
export function mDoWear(ctx: GearCtx, monId: EntityId, creation: boolean): boolean {
  const { def } = monOf(ctx, monId);
  if (def.size === 'tiny' || hasFlag(def, 'nohands') || hasFlag(def, 'animal')) return false;
  // give mummies a chance to wear their wrappings (no skeletons here)
  if (hasFlag(def, 'mindless') && (!creation || def.glyph.ch !== 'M')) return false;
  let changed = false;
  const canWearArmor = !cantWearArm(def);
  if (canWearArmor && !whichArmor(ctx, monId, 'body'))
    changed = mDoWearType(ctx, monId, 'shirt', creation, false) || changed;
  if (canWearArmor || wrappingAllowed(def))
    changed = mDoWearType(ctx, monId, 'cloak', creation, false) || changed;
  changed = mDoWearType(ctx, monId, 'helm', creation, false) || changed;
  const wep = monWep(ctx, monId);
  if (!wep || !ctx.defs.object(wep.def).weapon?.bimanual)
    changed = mDoWearType(ctx, monId, 'shield', creation, false) || changed;
  changed = mDoWearType(ctx, monId, 'gloves', creation, false) || changed;
  if (!hasFlag(def, 'slithy'))
    changed = mDoWearType(ctx, monId, 'boots', creation, false) || changed;
  changed = mDoWearType(ctx, monId, 'body', creation, !canWearArmor) || changed;
  return changed;
}

/** Whether the hero can see the cell. */
function sees(ctx: Pick<GearCtx, 'state'>, pos: { level: string; x: number; y: number }): boolean {
  if (pos.level !== ctx.state.currentLevel) return false;
  const level = ctx.state.levels[pos.level];
  return level !== undefined && isVisible(ctx.state, cellIndex(level, pos.x, pos.y));
}
export { sees as heroSees };

// ---------------------------------------------------------------------------------------------
// weapons

/**
 * Weapons in order of preference, restricted to those in the object table.
 * ref: src/weapon.c hwep[]
 */
const HWEP: readonly string[] = [
  'nh:dwarvish_mattock',
  'nh:long_sword',
  'nh:scimitar',
  'nh:dwarvish_short_sword',
  'nh:short_sword',
  'nh:mace',
  'nh:axe',
  'nh:dwarvish_spear',
  'nh:spear',
  'nh:aklys',
  'nh:club',
  'nh:pick_axe',
  'nh:elven_dagger',
  'nh:dagger',
  'nh:orcish_dagger',
  'nh:knife',
];

/**
 * The best hand-to-hand weapon the monster carries. ref: src/weapon.c select_hwep(): only
 * strong monsters without a shield may use two-handed weapons. Not ported: artifacts,
 * giants' clubs, cockatrice corpses, silver-haters.
 */
export function selectHwep(ctx: GearCtx, monId: EntityId): Entity | null {
  const { def } = monOf(ctx, monId);
  const strong = isStrong(def);
  const wearingShield = whichArmor(ctx, monId, 'shield') !== null;
  const items = minvent(ctx, monId);
  for (const id of HWEP) {
    const od = objDef(ctx, id);
    if (!od?.weapon) continue;
    if (!((strong && !wearingShield) || !od.weapon.bimanual)) continue;
    const o = items.find((x) => x.def === id);
    if (o) return o;
  }
  return null;
}

/** ref: include/obj.h mwelded(): a wielded cursed weapon cannot be put down */
const welded = (o: Entity): boolean => o.c.item?.buc === 'cursed' && o.c.item.equipped === 'weapon';

/**
 * The monster wields its best hand-to-hand weapon; returns true if that cost it its move
 * (it wielded something, or tried and found its weapon welded).
 * ref: src/weapon.c mon_wield_item() with weapon_check == NEED_HTH_WEAPON. A monster whose
 * weapon is welded stops trying (NO_WEAPON_WANTED, the `nowep` flag).
 */
export function monWieldItem(ctx: GearCtx, monId: EntityId): boolean {
  if (monFlag(ctx, 'nowep', monId)) return false;
  const obj = selectHwep(ctx, monId);
  if (!obj) return false;
  return monWield(ctx, monId, obj);
}

/**
 * The common tail of mon_wield_item(): wield `obj` (already chosen by select_hwep() or
 * select_rwep(), or a digging tool), unless it is wielded already. Returns true if that cost the
 * monster its move. `exclaim`: "wields X!" when it means to attack, "wields X." when it only plans
 * to dig. ref: src/weapon.c mon_wield_item()
 */
export function monWield(ctx: GearCtx, monId: EntityId, obj: Entity, exclaim = true): boolean {
  const { e, def } = monOf(ctx, monId);
  const cur = monWep(ctx, monId);
  if (cur && cur.def === obj.def) return false; // already wielding it
  const pos = e.c.pos;
  const seen = pos !== undefined && sees(ctx, pos);
  if (cur && welded(cur)) {
    if (seen) {
      ctx.emit({
        type: 'msg',
        key: 'mon.tries_to_wield',
        params: { mon: `@${def.id}`, item: doname(ctx.state, ctx.defs, obj) },
      });
      ctx.emit({
        type: 'msg',
        key: (cur.c.item?.quantity ?? 1) > 1 ? 'mon.weapon_welded_plural' : 'mon.weapon_welded',
        params: { mon: `@${def.id}`, obj: xnameOf(ctx.state, ctx.defs, cur) },
      });
    }
    setMonFlag(ctx, 'nowep', monId, true);
    return true;
  }
  if (seen) {
    ctx.emit({
      type: 'msg',
      key: exclaim ? 'mon.wields' : 'mon.wields_dig',
      params: { mon: `@${def.id}`, item: doname(ctx.state, ctx.defs, obj) },
    });
  }
  if (cur?.c.item) cur.c.item.equipped = null;
  if (obj.c.item) obj.c.item.equipped = 'weapon';
  if (welded(obj) && seen) {
    ctx.emit({
      type: 'msg',
      key: (obj.c.item?.quantity ?? 1) > 1 ? 'mon.welds_plural' : 'mon.welds',
      params: { mon: `@${def.id}`, obj: xnameOf(ctx.state, ctx.defs, obj) },
    });
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
// picking things up

/** ref: src/mon.c max_mon_load(); MAX_CARR_CAP 1000, WT_HUMAN 1450 */
export function maxMonLoad(def: MonsterDef): number {
  const MAX_CARR_CAP = 1000;
  const WT_HUMAN = 1450;
  let maxload: number;
  if (!def.weight) {
    const MZ = { tiny: 0, small: 1, medium: 2, large: 3, huge: 4, gigantic: 7 } as const;
    maxload = Math.trunc((MAX_CARR_CAP * MZ[def.size]) / MZ.medium);
  } else if (!isStrong(def) || def.weight > WT_HUMAN) {
    maxload = Math.trunc((MAX_CARR_CAP * def.weight) / WT_HUMAN);
  } else maxload = MAX_CARR_CAP;
  if (!isStrong(def)) maxload = Math.trunc(maxload / 2);
  return Math.max(maxload, 1);
}

/** ref: src/mon.c curr_mon_load() */
export function currMonLoad(ctx: Pick<GearCtx, 'state' | 'defs'>, id: EntityId): number {
  let n = 0;
  for (const o of inventoryOf(ctx.state, id)) n += weight(ctx.defs, o, ctx.state);
  return n;
}

/** Potions the roster's thinking monsters look for. ref: src/muse.c searches_for_item() */
const SEARCHED = new Set([
  'nh:potion_of_healing',
  'nh:potion_of_extra_healing',
  'nh:potion_of_full_healing',
]);

/**
 * Whether the monster would love to have the floor item. ref: src/monmove.c
 * mon_would_take_item(): useful potions for thinking monsters; gold for the greedy; gems for
 * jewel lovers (not stones); weapons, armor, gems and food (`practical[]`) for object lovers; all only while
 * the monster's load is under a limit. Not ported: unicorns, gelatinous cubes, boulder
 * throwers, magic lovers (nothing in the roster has M2_MAGIC).
 */
export function monWouldTakeItem(
  ctx: Pick<GearCtx, 'state' | 'defs'>,
  monId: EntityId,
  item: Entity,
): boolean {
  const { def } = monOf(ctx, monId);
  const od = ctx.defs.object(item.def);
  const pctload = Math.trunc((currMonLoad(ctx, monId) * 100) / maxMonLoad(def));
  if (!hasFlag(def, 'mindless') && !hasFlag(def, 'animal') && pctload < 75 && SEARCHED.has(od.id))
    return true;
  if (likesGold(def) && od.class === 'coin' && pctload < 95) return true;
  if (likesGems(def) && od.class === 'gem' && od.material !== 'mineral' && pctload < 85)
    return true;
  if (
    likesObjs(def) &&
    (od.class === 'weapon' || od.class === 'armor' || od.class === 'gem' || od.class === 'food') &&
    pctload < 75
  )
    return true;
  return false;
}

/**
 * How many of the stack the monster could carry (0 = none). ref: src/mon.c can_carry():
 * handless monsters take one, peacefuls (not pets) take nothing, and the load must stay under
 * the maximum.
 */
export function canCarry(
  ctx: Pick<GearCtx, 'state' | 'defs'>,
  monId: EntityId,
  item: Entity,
): number {
  const { e, def } = monOf(ctx, monId);
  const iquan = item.c.item?.quantity ?? 1;
  if (iquan > 1 && hasFlag(def, 'nohands')) return 1;
  if (e.c.monster?.peaceful && !e.c.monster.tame) return 0; // mpeaceful && !mtame
  // nymphs deal in stolen merchandise, but not boulders or statues
  if (def.glyph.ch === 'n') return ctx.defs.object(item.def).class === 'rock' ? 0 : iquan;
  if (currMonLoad(ctx, monId) + weight(ctx.defs, item, ctx.state) > maxMonLoad(def)) return 0;
  return iquan;
}

/**
 * The monster picks up one item stack from the cell it stands on.
 * ref: src/mon.c mpickstuff(). A shopkeeper in his shop never picks up, and other monsters but
 * pets rarely do in a shop. Only nymphs pick up corpses (the cockatrice, lizard and acidic
 * exceptions are step 6's). The monster then wants to re-check its gear.
 */
export function mpickstuff(ctx: GearCtx, monId: EntityId): boolean {
  const { e, def } = monOf(ctx, monId);
  const pos = e.c.pos;
  if (!pos) return false;
  // prevent shopkeepers from leaving the door of their shop
  if (eshkOf(ctx, monId) && inhishop(ctx, monId)) return false;
  // non-tame monsters normally don't go shopping
  const level = ctx.state.levels[pos.level];
  if (!e.c.monster?.tame && level && inAnyShop(level, pos.x, pos.y) && ctx.rng.rn2(25) !== 0)
    return false;
  for (const o of itemsAt(ctx.defs, ctx.state, pos.level, pos.x, pos.y)) {
    if (!monWouldTakeItem(ctx, monId, o)) continue;
    // nymphs take everything; most monsters don't pick up corpses (no cockatrices, lizards or
    // acidic corpses for the others yet)
    if (o.def === 'nh:corpse' && def.glyph.ch !== 'n') continue;
    const carry = canCarry(ctx, monId, o);
    if (carry === 0) continue;
    let take = o.id;
    if (carry !== (o.c.item?.quantity ?? 1)) take = splitStack(ctx, o.id, carry);
    if (sees(ctx, pos)) {
      const shown = ctx.state.entities[String(take)];
      if (shown) {
        ctx.emit({
          type: 'msg',
          key: 'mon.picks_up',
          params: { mon: `@${def.id}`, item: doname(ctx.state, ctx.defs, shown) },
        });
      }
    }
    addToInventory(ctx, monId, take);
    setMonFlag(ctx, 'gearchk', monId, true); // check_gear_next_turn()
    setMonFlag(ctx, 'nowep', monId, false); // weapon_check = NEED_WEAPON
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
// dropping

/**
 * Drops everything the monster carries onto the floor where it is (or `at`), newest item
 * first, so the oldest ends on top. `monMoving` (svc.context.mon_moving: a drop during the
 * monsters' turn) shows the drops on an altar the hero sees. ref: src/steal.c relobj() /
 * mdrop_obj() -> src/do.c flooreffects()
 */
export function relobj(
  ctx: Ctx,
  monId: EntityId,
  at?: { level: string; x: number; y: number },
  monMoving = false,
): void {
  const pos = at ?? ctx.state.entities[String(monId)]?.c.pos;
  for (const o of minvent(ctx, monId)) {
    if (pos && monMoving) monFloorEffects(ctx, o, pos);
    if (pos) placeOnFloor(ctx, o.id, pos.level, pos.x, pos.y);
    else {
      removeFromInventory(ctx, o.id);
      ctx.remove(o.id);
    }
  }
}

/** Gear step for a freshly made monster. ref: src/makemon.c makemon() "allow_minvent" */
export function givePossessions(ctx: GearCtx, monId: EntityId, depth: number): void {
  const { def } = monOf(ctx, monId);
  if (isArmed(def)) mInitWeap(ctx, monId);
  mInitInv(ctx, monId, depth);
  mDoWear(ctx, monId, true);
}
