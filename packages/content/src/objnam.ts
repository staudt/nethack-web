// Naming objects for the player. ref: src/objnam.c xname(), doname()
import type {
  ArmorSlot,
  Entity,
  GameState,
  ItemNamer,
  Msg,
  ObjectDef,
  Params,
  Registry,
} from '@nh/core';
import { contents } from '@nh/core';
import { objKnown, rknown } from './items';
import {
  isCorrodeable,
  isCrackable,
  isDamageable,
  isFlammable,
  isRottable,
  isRustprone,
} from './material';
import { isKnown } from './o_init';
import { CHARGED_RINGS } from './objects';
import { isSwapWep } from './wield';

/**
 * The message for the item's name without quantity, BUC or suffixes (xname()): the real name
 * when the hero knows the object type, else its appearance (potions, scrolls) or fixed
 * description ("crude dagger"). Plural (`.plural` keys) when the quantity is not 1.
 * Boots and gloves read "pair of ..." in the catalog's names. Corpses nest the monster as `mon`.
 */
function xname(state: Readonly<GameState>, defs: Registry, def: ObjectDef, item: Entity): Msg {
  const it = item.c.item;
  const plural = it !== undefined && it.quantity !== 1 ? '.plural' : '';
  if (def.id === 'nh:corpse' && it?.corpseOf) {
    return { key: `${def.nameKey}${plural}`, params: { mon: `@${it.corpseOf}` } };
  }
  // ref: xname() AMULET_CLASS: the imitation Amulet is identified one by one (obj->known)
  if (def.id === FAKE_AMULET) {
    return { key: `${it?.known.spe ? def.nameKey : (def.descKey ?? def.nameKey)}${plural}` };
  }
  if (isKnown(state, defs, def)) {
    // ref: objnam.c xname() POTION_CLASS: holy/unholy water when the BUC is known
    if (def.id === 'nh:potion_of_water' && it?.known.buc && it.buc !== 'uncursed') {
      return { key: `obj.${it.buc === 'blessed' ? 'holy' : 'unholy'}_water${plural}` };
    }
    return { key: `${def.nameKey}${plural}` };
  }
  const un = calledName(state, def);
  if (un !== null) {
    // ref: xname() "xcalled(buf, size, prefix, un)": "<description> called <name>"; potions and
    // scrolls give just their class ("potion called healing?"), armor its simple name
    const pre: Msg =
      def.class === 'potion' ||
      def.class === 'scroll' ||
      def.class === 'ring' ||
      def.class === 'amulet' ||
      def.class === 'wand'
        ? { key: `obj.generic.${def.class}${plural}` }
        : def.class === 'armor' && def.armor
          ? { key: `kind.${ARMOR_SIMPLE[def.armor.slot]}` }
          : { key: `${def.descKey ?? def.nameKey}${plural}` };
    return { key: 'obj.called', params: { pre, name: un } };
  }
  const app = state.appearances[def.id];
  const base = app !== undefined && defs.isAppearance(app) ? defs.appearance(app).nameKey : null;
  return { key: `${base ?? def.descKey ?? def.nameKey}${plural}` };
}

const FAKE_AMULET = 'nh:fake_amulet_of_yendor';

/** ref: src/objnam.c armor_simple_name(): the `kind.*` word for an armor slot */
const ARMOR_SIMPLE: Record<ArmorSlot, string> = {
  body: 'suit',
  cloak: 'cloak',
  shirt: 'shirt',
  helm: 'helm',
  gloves: 'gloves',
  boots: 'boots',
  shield: 'shield',
};

/**
 * The name the hero gave this unidentified type (oc_uname), or null. Only classes the call
 * command accepts (see call.ts) show it. Read-only: never creates the mod data.
 */
function calledName(state: Readonly<GameState>, def: ObjectDef): string | null {
  const md = state.modData['nh'] as unknown as { called?: Record<string, string> } | undefined;
  const un = md?.called?.[def.id];
  return un !== undefined && un !== '' ? un : null;
}

/** The item's name without article, quantity, BUC or suffixes. ref: src/objnam.c xname() */
export function xnameOf(state: Readonly<GameState>, defs: Registry, item: Entity): Msg {
  return xname(state, defs, defs.object(item.def), item);
}

/**
 * The full item name, nested in the message `obj.doname` whose template joins the pieces:
 * `{count}{buc}{eaten}{erosion}{spe}{name}{charges}{worn}`. Each piece is '' or carries its own spacing
 * (count and prefixes end with a space, suffixes start with one). The name has no article; the
 * UI adds it with the `{item|an}` modifier, which must not add one when the text starts with a
 * digit (a counted stack). ref: src/objnam.c doname_base(), with implicit_uncursed on, the hero
 * not a Cleric, no poison/grease/prices/trapped boxes, and `dknown` always true.
 */
export function doname(state: Readonly<GameState>, defs: Registry, item: Entity): Msg {
  const it = item.c.item;
  if (!it) return { key: item.def };
  const def = defs.object(item.def);
  const params: Params = {
    count: '',
    buc: '',
    eaten: '',
    erosion: '',
    spe: '',
    name: '',
    charges: '',
    worn: '',
  };

  params.name = xname(state, defs, def, item);
  if (it.quantity !== 1) params.count = { key: 'obj.count', params: { n: it.quantity } };

  // Known holy/unholy water says so in its name instead of a BUC prefix.
  const holyWater =
    def.id === 'nh:potion_of_water' &&
    isKnown(state, defs, def) &&
    it.known.buc &&
    it.buc !== 'uncursed';
  // With implicit_uncursed, "uncursed" is printed unless the item is charged and fully known;
  // only rings are oc_charged here, and rings always print it. The imitation Amulet never says
  // "uncursed", and while unidentified it is "the Amulet of Yendor" (the_unique_obj()).
  const fake = def.id === FAKE_AMULET;
  if (fake && !it.known.spe) params.count = 'the ';
  // A wand is oc_charged: once its charges are known, "uncursed" is implied.
  const impliedUncursed = def.class === 'wand' && it.known.spe && it.buc === 'uncursed';
  if (
    it.known.buc &&
    def.class !== 'coin' &&
    !holyWater &&
    !(fake && it.buc === 'uncursed') &&
    !impliedUncursed
  )
    params.buc = { key: `obj.buc.${it.buc}` };

  if (def.class === 'food' && it.eaten) params.eaten = { key: 'obj.eaten' };

  // ref: doname_base(): "empty " goes before the BUC (containers never stack, so it takes the
  // count's place), "locked "/"unlocked "/"broken " after it, " containing N items" after the
  // name; a burning lamp is " (lit)"
  if (def.container) {
    const cknown = objKnown(state, 'cknown', item.id);
    const n = cknown ? contents(state, item.id).length : 0;
    if (cknown && n === 0 && it.quantity === 1) params.count = { key: 'obj.empty' };
    if (def.container.box && objKnown(state, 'lknown', item.id))
      params.eaten = { key: it.broken ? 'obj.broken' : it.locked ? 'obj.locked' : 'obj.unlocked' };
    if (n > 0)
      params.charges = { key: n === 1 ? 'obj.containing1' : 'obj.containing', params: { n } };
  }
  if (it.lit) params.charges = { key: 'obj.lit' };

  // ref: doname_base() ARMOR_CLASS / WEAPON_CLASS: add_erosion_words() before the enchantment
  if (def.class === 'weapon' || def.class === 'armor')
    params.erosion = erosionWords(state, defs, item);

  if (
    (def.class === 'weapon' || def.class === 'armor' || CHARGED_RINGS.has(def.id)) &&
    it.known.spe
  ) {
    params.spe = `${it.spe >= 0 ? '+' : '-'}${Math.abs(it.spe)} `; // "%+d "
  }

  // ref: doname_base() WAND_CLASS: " (%d:%d)" recharged:spe when known
  if (def.class === 'wand' && it.known.spe)
    params.charges = { key: 'obj.charges', params: { recharged: it.recharged ?? 0, spe: it.spe } };

  if (it.equipped === 'weapon') {
    // ref: doname_base() W_WEP: stacks and non-weapons are "(wielded)", a single weapon is
    // "(weapon in hand)" / "(weapon in hands)" when bimanual. (No ammo/missiles in our subset.)
    if (it.quantity !== 1 || def.class !== 'weapon') params.worn = { key: 'obj.wielded' };
    else {
      params.worn = { key: def.weapon?.bimanual ? 'obj.weapon_in_hands' : 'obj.weapon_in_hand' };
    }
  } else if (it.equipped === 'ringL' || it.equipped === 'ringR') {
    // ref: doname_base() RING_CLASS: "(on left hand)"
    params.worn = { key: it.equipped === 'ringL' ? 'obj.on_left_hand' : 'obj.on_right_hand' };
  } else if (it.equipped !== null) {
    params.worn = { key: 'obj.worn' }; // "(being worn)"; no donning/doffing state yet
  } else if (isSwapWep(state, item)) {
    // ref: doname_base() W_SWAPWEP: "(alternate weapon; not wielded)" (no two-weapon combat)
    params.worn = { key: `obj.alternate${it.quantity !== 1 ? '.plural' : ''}` };
  }
  return { key: 'obj.doname', params };
}

/**
 * The namer's erosion prefix ("very rusty ", "thoroughly corroded ", "rustproof "), or ''.
 * ref: src/objnam.c add_erosion_words() (no crysknives)
 */
function erosionWords(state: Readonly<GameState>, defs: Registry, item: Entity): Msg | '' {
  const it = item.c.item;
  if (!it) return '';
  const def = defs.object(item.def);
  if (!isDamageable(def)) return '';
  const params: Msg['params'] = { a1: '', w1: '', a2: '', w2: '', proof: '' };
  const e = it.erosion;
  if (e?.e1) {
    if (e.e1 > 1) params['a1'] = { key: `erode.word.adv${e.e1}` };
    params['w1'] = {
      key: isRustprone(def)
        ? 'erode.word.rusty'
        : isCrackable(def)
          ? 'erode.word.cracked'
          : 'erode.word.burnt',
    };
  }
  if (e?.e2) {
    if (e.e2 > 1) params['a2'] = { key: `erode.word.adv${e.e2}` };
    params['w2'] = { key: isCorrodeable(def) ? 'erode.word.corroded' : 'erode.word.rotted' };
  }
  if (it.erodeproof && rknown(state, item.id)) {
    const proof = isRustprone(def)
      ? 'rustproof'
      : isCorrodeable(def)
        ? 'corrodeproof'
        : isFlammable(def)
          ? 'fireproof'
          : isCrackable(def)
            ? 'tempered'
            : isRottable(def)
              ? 'rotproof'
              : null;
    if (proof) params['proof'] = { key: `erode.word.${proof}` };
  }
  if (!params['w1'] && !params['w2'] && !params['proof']) return '';
  return { key: 'erode.words', params };
}

/** The item namer registered with the registry (`api.setItemNamer`). */
export const nameItem: ItemNamer = doname;
