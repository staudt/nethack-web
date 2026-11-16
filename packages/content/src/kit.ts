// The hero's starting inventory, attributes, skills and discoveries for every role and race, and
// the u_init hook that makes them at new game. Nothing imports this module but index.ts, so it
// may use the object makers, spells and the hero's stats.
// ref: src/u_init.c u_init_misc(), u_init_inventory_attrs(), u_init_role(), u_init_race(),
// ini_inv(), ini_inv_mkobj_filter(), ini_inv_obj_substitution(), ini_inv_adjust_obj(),
// ini_inv_use_obj(), knows_object(), knows_class(), u_init_carry_attr_boost(),
// u_init_skills_discoveries(); src/weapon.c skill_init(); src/spell.c initialspell(),
// skill_based_spellbook_id()
import {
  inventoryOf,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type ModApi,
  type ObjectClass,
  type ObjectDef,
} from '@nh/core';
import { initPantheon, uInitAlign } from './align';
import { adjattrib } from './attrstate';
import { setBoxTrapped } from './btrapstate';
import { POT_OIL } from './dilute';
import { initialAttributes, newhp, newpw } from './hero';
import { addToInventory, nhData, rne, setObjKnown, setRknown } from './items';
import {
  ELF_INSTRUMENTS,
  EXTRAS,
  INV_SUBS,
  JAPANESE_ITEMS,
  KITS,
  RACE_KNOWS,
  UNDEF,
  instrument,
  type TrObj,
} from './kittab';
import { useupall } from './magic';
import { isWeptool } from './material';
import { mkobj, mksobjFull } from './mkobj';
import { discover, isKnown } from './o_init';
import { CHARGED_RINGS } from './objects';
import { setIntrinsic, updateWornProps, wornIn } from './props';
import { ROLES_TAB } from './roletab';
import { isPole, skillInit, skillLevel, P_BASIC, P_EXPERT, P_SKILLED } from './skills';
import { SKILL_TAB } from './skilltab';
import { BLANK_PAPER, initialspell, knownSpells } from './spell';
import { roleSpellSkill, spellLevPw } from './spellcalc';
import { invWeight } from './stats';
import { pwOf, setPw } from './uenergy';
import { type RaceKey, type RoleKey, urace, urole } from './urole';
import { setSwapWep, swapWep } from './wield';

const MAGIC_MARKER = 'nh:magic_marker';
const FLINT = 'nh:flint_stone';
const ROCK = 'nh:rock';
const TIN_OPENER = 'nh:tin_opener';
const OIL_LAMP = 'nh:oil_lamp';
const PANCAKE = 'nh:pancake';
const WAN_WISHING = 'nh:wand_of_wishing';
const SPE_FORCE_BOLT = 'nh:spellbook_of_force_bolt';
/** ref: include/obj.h is_graystone() */
const GRAYSTONES: ReadonlySet<string> = new Set([
  'nh:luckstone',
  'nh:loadstone',
  'nh:touchstone',
  FLINT,
]);

/**
 * Random items a kit never starts with: overly powerful (the wand of wishing, the ring of
 * levitation) or really useless ones. (Punishment isn't "useless": some players read it at once
 * and use the iron ball as a weapon.) The novel is not in the object table.
 * ref: src/u_init.c ini_inv_mkobj_filter()
 */
const NEVER_RANDOM: ReadonlySet<string> = new Set([
  WAN_WISHING,
  'nh:ring_of_levitation',
  'nh:potion_of_hallucination',
  'nh:potion_of_acid',
  'nh:scroll_of_amnesia',
  'nh:scroll_of_fire',
  'nh:scroll_of_blank_paper',
  BLANK_PAPER,
  'nh:ring_of_aggravate_monster',
  'nh:ring_of_hunger',
  'nh:wand_of_nothing',
]);

/**
 * The u_init state that lasts across the role's ini_inv() calls: gn.nocreate..nocreate4 (the
 * polymorph / polymorph control pair and no two equal rings or spellbooks) and u.umoney0.
 */
interface UInitState {
  role: RoleKey;
  race: RaceKey;
  nocreate: (string | null)[];
  umoney0: number;
}

const freshNocreate = (): (string | null)[] => [null, null, null, null];

/** ref: src/u_init.c trquan(): randomizes the quantity; the end of a list is 1, not drawn. */
function trquan(ctx: Ctx, trop: TrObj | undefined): number {
  if (!trop) return 1;
  return trop.qmin + ctx.rng.rn2(trop.qmax - trop.qmin + 1);
}

/**
 * Marks the type known (not yet encountered: the port has no oc_encountered). A type without a
 * description is known anyway, so only the described ones are recorded. ref: src/u_init.c
 * knows_object() -> discover_object(obj, TRUE, FALSE, FALSE) (no pauper)
 */
export function knowsObject(ctx: Ctx, id: DefId): void {
  if (!ctx.defs.isObject(id)) return;
  const def = ctx.defs.object(id);
  if (!isKnown(ctx.state, ctx.defs, def)) discover(ctx, def);
}

/**
 * Knows the ordinary (non-magical) objects of a class, like all gems except the loadstone and
 * luckstone; never small shields (they look like two magical shields), cornuthaums or dunce
 * caps (they look the same). Weapons: only Knights and Samurai recognize polearms; Rangers know
 * only launchers, ammo and spears, Rogues only daggers. ref: src/u_init.c knows_class()
 */
export function knowsClass(ctx: Ctx, cls: ObjectClass, role: RoleKey): void {
  for (const def of ctx.defs.objects) {
    if (def.class !== cls) continue;
    if (def.id === 'nh:cornuthaum' || def.id === 'nh:dunce_cap' || def.id === 'nh:small_shield')
      continue;
    if (cls === 'weapon') {
      // arbitrary: only knights and samurai recognize polearms
      if (role !== 'knight' && role !== 'samurai' && isPole(def)) continue;
      // rangers know all launchers (bows, &c), ammo (arrows, &c), and spears regardless of
      // race/species, but not other weapons
      const r = def.weapon?.role;
      if (role === 'ranger' && r !== 'launcher' && r !== 'ammo' && def.weapon?.skill !== 'spear')
        continue;
      // rogues know daggers, regardless of racial variations
      if (role === 'rogue' && def.weapon?.skill !== 'dagger') continue;
    }
    if (!def.magic) knowsObject(ctx, def.id);
  }
}

/** Whether her role's skill list leaves the book's school restricted. ref: restricted_spell_discipline() */
const restrictedSpellDiscipline = (role: RoleKey, book: DefId): boolean =>
  SKILL_TAB[role][roleSpellSkill(book, role)] === undefined;

/**
 * A random object of the class, without the too powerful or useless ones; a spellbook must be
 * level 1 (up to 3 once a level 1 book was given) and of a school her role may learn. After 1000
 * tries, a pancake. ref: src/u_init.c ini_inv_mkobj_filter() (mkobj(oclass, FALSE))
 */
function iniInvMkobjFilter(ctx: Ctx, cls: ObjectClass, gotSp1: boolean, st: UInitState): EntityId {
  const make = (): EntityId => {
    const id = mkobj(ctx, cls, { artif: false });
    if (id === null) throw new Error(`ini_inv: no object of class ${cls}`);
    return id;
  };
  let obj = make();
  let trycnt = 0;
  for (;;) {
    const made = ctx.state.entities[String(obj)];
    if (!made) throw new Error('ini_inv: no object');
    const otyp = made.def;
    const def = ctx.defs.object(otyp);
    const reject =
      NEVER_RANDOM.has(otyp) ||
      st.nocreate.includes(otyp) ||
      // orcs start with poison resistance
      (otyp === 'nh:ring_of_poison_resistance' && st.race === 'orc') ||
      // Monks don't use weapons
      (otyp === 'nh:scroll_of_enchant_weapon' && st.role === 'monk') ||
      // wizard patch -- they already have one
      (otyp === SPE_FORCE_BOLT && st.role === 'wizard') ||
      // powerful spells are either useless to low level players or unbalancing; also spells in
      // restricted skill categories
      (def.class === 'spellbook' &&
        ((def.spellbook?.level ?? 0) > (gotSp1 ? 3 : 1) ||
          restrictedSpellDiscipline(st.role, otyp)));
    if (!reject) return obj;
    ctx.remove(obj); // dealloc_obj()
    if (++trycnt > 1000) {
      // This lonely pancake's potential will never be realized.
      return mksobjFull(ctx, ctx.defs.object(PANCAKE), { init: true, initialInventory: true });
    }
    obj = make();
  }
}

/** Race-specific items in place of the role's, random ones too (only the type changes). ref: ini_inv_obj_substitution() */
function iniInvObjSubstitution(ctx: Ctx, obj: Entity, race: RaceKey): void {
  if (race === 'human') return;
  const sub = INV_SUBS.find((s) => s.race === race && s.from === obj.def);
  if (sub && ctx.defs.isObject(sub.to)) obj.def = sub.to;
}

/**
 * The kit line's fixes: gold takes u.umoney0; anything else is identified (BUC, enchantment,
 * erodeproofing, a container's contents and lock), never cursed; weapons and tools take the
 * line's quantity (and end the line); gray stones other than flint are single; the line's
 * enchantment (a magic marker's 19 + rn2(4)), else a charged ring at +0 or less gets rne(3);
 * the line's blessedness. Returns whether the line is done. Poison is not ported (no
 * opoisoned). ref: src/u_init.c ini_inv_adjust_obj()
 */
function iniInvAdjustObj(ctx: Ctx, trop: TrObj, obj: Entity, st: UInitState): boolean {
  const it = obj.c.item;
  if (!it) return false;
  const def = ctx.defs.object(obj.def);
  let stop = false;
  if (trop.cls === 'coin') {
    // no "blessed" or "identified" money
    it.quantity = st.umoney0;
    return false;
  }
  it.known = { buc: true, spe: true };
  if (it.erodeproof) setRknown(ctx, obj.id, true);
  if (def.container) {
    setObjKnown(ctx, 'cknown', obj.id, true);
    setObjKnown(ctx, 'lknown', obj.id, true);
    if (def.container.box) setBoxTrapped(ctx, obj.id, false);
  }
  if (it.buc === 'cursed') it.buc = 'uncursed';
  if (def.class === 'weapon' || def.class === 'tool') {
    it.quantity = trquan(ctx, trop);
    stop = true;
  } else if (def.class === 'gem' && GRAYSTONES.has(obj.def) && obj.def !== FLINT) {
    it.quantity = 1;
  }
  if (trop.spe !== UNDEF) {
    it.spe = trop.spe;
    if (trop.id === MAGIC_MARKER && it.spe < 96) it.spe += ctx.rng.rn2(4);
  } else if (def.class === 'ring' && CHARGED_RINGS.has(obj.def) && it.spe <= 0) {
    // Don't start with +0 or negative rings
    it.spe = rne(
      ctx.rng,
      3,
      ctx.state.entities[String(ctx.state.playerId)]?.c.experience?.level ?? 1,
    );
  }
  if (trop.bless !== UNDEF) it.buc = trop.bless ? 'blessed' : 'uncursed';
  return stop;
}

/**
 * Makes a kit list into her inventory: each line's object (a random one for UNDEF_TYP, which
 * may forbid later ones), the race's substitute, the line's fixes, then into the pack; the
 * line's quantity makes that many objects, except weapons and tools, which take it as one
 * stack. ref: src/u_init.c ini_inv() (no pauper, no nudist)
 */
function iniInv(ctx: Ctx, heroId: EntityId, trops: readonly TrObj[], st: UInitState): void {
  let gotSp1 = false; // got a level 1 spellbook?
  let i = 0;
  let quan = trquan(ctx, trops[0]);
  while (i < trops.length) {
    const trop = trops[i];
    if (!trop) break;
    let objId: EntityId;
    if (trop.id !== null) {
      objId = mksobjFull(ctx, ctx.defs.object(trop.id), { init: true, initialInventory: true });
    } else {
      objId = iniInvMkobjFilter(ctx, trop.cls, gotSp1, st);
      const otyp = ctx.state.entities[String(objId)]?.def ?? PANCAKE;
      // Heavily relies on the facts that 1) we create wands before rings, that 2) we create
      // rings before spellbooks, and that 3) not more than 1 object of a particular symbol is
      // to be prohibited.
      switch (otyp) {
        case 'nh:wand_of_polymorph':
        case 'nh:ring_of_polymorph':
        case 'nh:potion_of_polymorph':
          st.nocreate[0] = 'nh:ring_of_polymorph_control';
          break;
        case 'nh:ring_of_polymorph_control':
          st.nocreate[0] = 'nh:ring_of_polymorph';
          st.nocreate[1] = 'nh:spellbook_of_polymorph';
          st.nocreate[2] = 'nh:potion_of_polymorph';
      }
      // Don't have 2 of the same ring or spellbook
      const cls = ctx.defs.object(otyp).class;
      if (cls === 'ring' || cls === 'spellbook') st.nocreate[3] = otyp;
    }
    const obj = ctx.state.entities[String(objId)];
    if (!obj) throw new Error('ini_inv: no object');
    iniInvObjSubstitution(ctx, obj, st.race);
    if (iniInvAdjustObj(ctx, trop, obj, st)) quan = 1;
    const def = ctx.defs.object(obj.def);
    addToInventory(ctx, heroId, objId);
    // First spellbook should be level 1 - did we get it?
    if (def.class === 'spellbook' && def.spellbook?.level === 1) gotSp1 = true;
    if (--quan) continue; // make a similar object
    i++;
    quan = trquan(ctx, trops[i]);
  }
}

/**
 * The role's kit, extras and object knowledge. rn2(100) > 50 is necessary for some choices
 * because some random number generators are bad enough to seriously skew the results if we use
 * rn2(2)... --KAA. ref: src/u_init.c u_init_role()
 */
function uInitRole(ctx: Ctx, heroId: EntityId, st: UInitState): void {
  const rn2 = (n: number): number => ctx.rng.rn2(n);
  const ini = (trops: readonly TrObj[]): void => iniInv(ctx, heroId, trops, st);
  const knows = (s: string): void => knowsObject(ctx, `nh:${s}` as DefId);
  const role = st.role;
  switch (role) {
    case 'archeologist':
      ini(KITS.archeologist);
      if (!rn2(10)) ini(EXTRAS.tinopener);
      else if (!rn2(4)) ini(EXTRAS.lamp);
      else if (!rn2(5)) ini(EXTRAS.magicmarker);
      knows('sack');
      knows('touchstone');
      break;
    case 'barbarian':
      if (rn2(100) >= 50) ini(KITS.barbarian);
      else ini(KITS.barbarian_1);
      if (!rn2(6)) ini(EXTRAS.lamp);
      knowsClass(ctx, 'weapon', role); // excluding polearms
      knowsClass(ctx, 'armor', role);
      break;
    case 'caveman':
      ini(KITS.caveman);
      break;
    case 'healer':
      st.umoney0 = rn2(1000) + 1001; // rn1(1000, 1001)
      ini(KITS.healer);
      if (!rn2(25)) ini(EXTRAS.lamp);
      knows('potion_of_full_healing');
      break;
    case 'knight':
      ini(KITS.knight);
      knowsClass(ctx, 'weapon', role); // all weapons
      knowsClass(ctx, 'armor', role);
      // give knights chess-like mobility--idea from wooledge@..cwru.edu
      setIntrinsic(ctx.state.entities[String(heroId)] as Entity, 'jumping', true);
      break;
    case 'monk': {
      const mSpell = [EXTRAS.healingBook, EXTRAS.protectionBook, EXTRAS.confuseMonsterBook];
      ini(KITS.monk);
      ini(mSpell[Math.trunc(rn2(90) / 30)] ?? EXTRAS.healingBook); // [0..2]
      if (!rn2(4)) ini(EXTRAS.magicmarker);
      else if (!rn2(10)) ini(EXTRAS.lamp);
      knowsClass(ctx, 'armor', role);
      // sufficiently martial-arts oriented item to ignore language issue
      knows('shuriken');
      break;
    }
    case 'priest':
      ini(KITS.priest);
      if (!rn2(5)) ini(EXTRAS.magicmarker);
      else if (!rn2(10)) ini(EXTRAS.lamp);
      knows('potion_of_water');
      break;
    case 'ranger':
      ini(KITS.ranger);
      knowsClass(ctx, 'weapon', role); // bows, arrows, spears only
      break;
    case 'rogue':
      st.umoney0 = 0;
      ini(KITS.rogue);
      if (!rn2(5)) ini(EXTRAS.blindfold);
      knows('sack');
      knowsClass(ctx, 'weapon', role); // daggers only
      break;
    case 'samurai':
      ini(KITS.samurai);
      if (!rn2(5)) ini(EXTRAS.blindfold);
      knowsClass(ctx, 'weapon', role); // all weapons
      knowsClass(ctx, 'armor', role);
      // in order to assist non-Japanese speakers, pre-discover items that switch to Japanese
      // names when playing as a Samurai (not the magic koto)
      for (const id of JAPANESE_ITEMS)
        if (ctx.defs.isObject(id) && !ctx.defs.object(id).magic) knowsObject(ctx, id);
      break;
    case 'tourist':
      st.umoney0 = ctx.rng.rnd(1000);
      ini(KITS.tourist);
      // the first of these rolls that comes up: if (!rn2(25)) ... else if (!rn2(25)) ...
      for (const [n, extra] of [
        [25, EXTRAS.tinopener],
        [25, EXTRAS.leash],
        [25, EXTRAS.towel],
        [20, EXTRAS.magicmarker],
      ] as const) {
        if (!rn2(n)) {
          ini(extra);
          break;
        }
      }
      break;
    case 'valkyrie':
      ini(KITS.valkyrie);
      if (!rn2(6)) ini(EXTRAS.lamp);
      knowsClass(ctx, 'weapon', role); // excludes polearms
      knowsClass(ctx, 'armor', role);
      break;
    case 'wizard':
      ini(KITS.wizard);
      if (!rn2(5)) ini(EXTRAS.blindfold);
      break;
  }
  st.nocreate = freshNocreate();
}

/**
 * The race's extras and object knowledge: an elven Priest or Wizard gets a non-magic instrument
 * (elves are people of music and song, or they are warriors), an orc other than a Wizard extra
 * food (to compensate for generally inferior equipment). ref: src/u_init.c u_init_race()
 */
function uInitRace(ctx: Ctx, heroId: EntityId, st: UInitState): void {
  if (st.race === 'elf' && (st.role === 'priest' || st.role === 'wizard')) {
    const pick = ELF_INSTRUMENTS[ctx.rng.rn2(ELF_INSTRUMENTS.length)] ?? 'nh:wooden_flute';
    iniInv(ctx, heroId, instrument(pick), st); // ROLL_FROM(trotyp)
  }
  if (st.race === 'orc' && st.role !== 'wizard') iniInv(ctx, heroId, EXTRAS.xtraFood, st);
  for (const id of RACE_KNOWS[st.race]) knowsObject(ctx, id);
}

/**
 * Raises Str, then Con, until she can carry everything (especially for Tourists).
 * ref: src/u_init.c u_init_carry_attr_boost()
 */
function uInitCarryAttrBoost(ctx: Ctx, heroId: EntityId): void {
  while (invWeight(ctx.state, ctx.defs, heroId) > 0) {
    if (adjattrib(ctx, 'str', 1, false)) continue;
    if (adjattrib(ctx, 'con', 1, false)) continue;
    // only get here when didn't boost strength or constitution
    break;
  }
}

/** u.umoney0, the starting gold, for the score (end.c); absent = 0. */
export function umoney0(state: Readonly<Ctx['state']>): number {
  const md = state.modData['nh'] as unknown as { umoney0?: number } | undefined;
  return md?.umoney0 ?? 0;
}

/**
 * The starting inventory and attributes of `role` and `race` (default: hers): any inventory is
 * used up first, then the role's and the race's kits and the starting gold; the attributes
 * (init_attr(75), vary_init_attr()) and the carry boost. Her sack starts empty, so no hidden
 * gold adds to u.umoney0. ref: src/u_init.c u_init_inventory_attrs() (no wizard-mode Wishing kit)
 */
export function uInitInventoryAttrs(
  ctx: Ctx,
  heroId: EntityId,
  role: RoleKey = urole(ctx.state),
  race: RaceKey = urace(ctx.state),
): void {
  for (const o of inventoryOf(ctx.state, heroId)) useupall(ctx, o.id);
  nhData(ctx).lastinvnr = 51;
  const st: UInitState = { role, race, nocreate: freshNocreate(), umoney0: 0 };
  uInitRole(ctx, heroId, st);
  uInitRace(ctx, heroId, st);
  if (st.umoney0) iniInv(ctx, heroId, EXTRAS.money, st);
  const md = nhData(ctx) as unknown as { umoney0?: number };
  if (st.umoney0) md.umoney0 = st.umoney0;
  else delete md.umoney0;
  const hero = ctx.state.entities[String(heroId)];
  if (hero) hero.c.attributes = initialAttributes(ctx, role, race); // init_attr(75), vary_init_attr()
  uInitCarryAttrBoost(ctx, heroId);
}

/** ref: include/obj.h inv_rank(): the order of the pack ('$' first, then a..z, A..Z) */
const invRank = (o: Entity): number => (o.c.item?.letter ?? '~').charCodeAt(0) ^ 0x20;

/**
 * A starting item's use: its type discovered (the oil lamp's oil too); armour worn in its free
 * slot (a shield only without a two-handed weapon); weapons, weapon-tools, the tin opener, flint
 * and rocks wielded, else made the alternate weapon (ammo and missiles would go to the quiver,
 * which the port lacks: they stay in the pack); spellbooks' spells known.
 * ref: src/u_init.c ini_inv_use_obj()
 */
function iniInvUseObj(ctx: Ctx, heroId: EntityId, obj: Entity): void {
  const it = obj.c.item;
  if (!it) return;
  const def = ctx.defs.object(obj.def);
  // Make the type known if necessary
  knowsObject(ctx, obj.def);
  if (obj.def === OIL_LAMP) knowsObject(ctx, POT_OIL);
  const uwep = wornIn(ctx.state, heroId, 'weapon');
  const uwepDef: ObjectDef | null = uwep ? ctx.defs.object(uwep.def) : null;
  if (def.class === 'armor' && def.armor) {
    const slot = def.armor.slot;
    if (slot === 'shield') {
      if (!wornIn(ctx.state, heroId, 'shield') && !uwepDef?.weapon?.bimanual)
        it.equipped = 'shield';
    } else if (!wornIn(ctx.state, heroId, slot)) it.equipped = slot;
  }
  if (
    def.class === 'weapon' ||
    isWeptool(def) ||
    obj.def === TIN_OPENER ||
    obj.def === FLINT ||
    obj.def === ROCK
  ) {
    const r = def.weapon?.role;
    if (r === 'ammo' || r === 'missile') {
      // setuqwep(): no quiver (DEVIATIONS "Firing")
    } else if (!uwep && (!wornIn(ctx.state, heroId, 'shield') || !def.weapon?.bimanual)) {
      it.equipped = 'weapon';
    } else if (!swapWep(ctx)) {
      setSwapWep(ctx, obj.id);
    }
  }
  if (def.class === 'spellbook' && obj.def !== BLANK_PAPER) initialspell(ctx, obj.def);
}

/**
 * Wizards know the spellbooks up to the level their skill in its school allows: 1 when unskilled
 * (most wizards know the basics), 3 at Basic, 5 at Skilled, 7 above.
 * ref: src/spell.c skill_based_spellbook_id() (no pauper)
 */
function skillBasedSpellbookId(ctx: Ctx, role: RoleKey): void {
  if (role !== 'wizard') return;
  for (const def of ctx.defs.objects) {
    if (def.class !== 'spellbook') continue;
    const skill = roleSpellSkill(def.id, role);
    if (!skill) continue;
    const lvl = skillLevel(ctx, skill);
    const knownUpTo = lvl >= P_EXPERT ? 7 : lvl === P_SKILLED ? 5 : lvl === P_BASIC ? 3 : 1;
    // makeknown(booktype) but don't exercise Wisdom or mark as encountered
    if ((def.spellbook?.level ?? 0) <= knownUpTo) knowsObject(ctx, def.id);
  }
}

/**
 * The side effects of the starting inventory and skills: every item used (worn, wielded,
 * learned), the skills (skill_init() with the role's special spell) and the Wizard's books by
 * skill; with a spell known, enough energy for a level 1 spell. ref: src/u_init.c
 * u_init_skills_discoveries() (no pauper; find_ac() is computed when needed)
 */
export function uInitSkillsDiscoveries(
  ctx: Ctx,
  heroId: EntityId,
  role: RoleKey = urole(ctx.state),
): void {
  const invent = [...inventoryOf(ctx.state, heroId)].sort((a, b) => invRank(a) - invRank(b));
  for (const o of invent) iniInvUseObj(ctx, heroId, o);
  updateWornProps(ctx.state, ctx.defs, heroId); // setworn()'s extrinsics
  skillInit(ctx, heroId, role, roleSpellSkill(ROLES_TAB[role].spelspec, role));
  skillBasedSpellbookId(ctx, role);
  // If we have at least one spell, force starting Pw to be enough, so hero can cast the level 1
  // spell they should have
  const lev1 = spellLevPw(1);
  if (knownSpells(ctx).length > 0 && pwOf(ctx.state).uenmax < lev1)
    setPw(ctx, { uen: lev1, uenmax: lev1, uenpeak: lev1 });
}

/** Registers the u_init hook through the public ModApi. */
export function registerKit(api: ModApi): void {
  // ref: src/role.c role_init() (the pantheon); src/u_init.c u_init_misc() (HP and Pw at level
  // 0, the alignment), u_init_inventory_attrs() (kit, attributes, carry boost),
  // u_init_skills_discoveries(). The port makes them before the first level, as 3.7's u_init()
  // (plan m22 Q9); the pet comes after placement (dog.ts).
  api.on('newGame', (ctx, heroId) => {
    const hero = ctx.state.entities[String(heroId)];
    if (!hero) return;
    initPantheon(ctx); // a Priest draws another role's gods
    const max = newhp(ctx, 0, 0); // no Con adjustment for initial hit points
    hero.c.hp = { cur: max, max };
    uInitAlign(ctx); // newhp() at moves 0: alignment and initrecord
    const en = newpw(ctx, 0, 0);
    setPw(ctx, { uen: en, uenmax: en, uenpeak: en });
    hero.c.experience = { level: 1, points: 0 };
    uInitInventoryAttrs(ctx, heroId);
    uInitSkillsDiscoveries(ctx, heroId);
  });
}
