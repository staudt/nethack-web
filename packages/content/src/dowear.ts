// What happens when the hero's armor goes on or comes off, after the slot is set (C's Type_on())
// or cleared (Type_off(), Type_gone()): the worn properties are rebuilt (setworn()), acurr()'s
// armor overrides are applied or lifted (gauntlets of power, the dunce cap), then the
// armor-specific effects run.
// ref: src/do_wear.c Boots_on(), Boots_off(), Cloak_on(), Cloak_off(), Helmet_on(),
// Helmet_off(), Gloves_on(), Gloves_off(), Shield_on(), Shield_off(), Shirt_on(), Shirt_off(),
// Armor_on(), Armor_off(), toggle_stealth(), toggle_displacement(), adj_abon();
// src/attrib.c uchangealign()
//
// Not ported: dragon scales, the Archeologist's fedora luck and the Wizard's cornuthaum (no
// roles: the cornuthaum always costs Cha and blocks clairvoyance), water (water walking boots do
// nothing; levitation boots over a sink), steeds and BStealth, flying (float_vs_flight()), the
// Furies a helm of opposite alignment can summon (no erinyes: DEVIATIONS), artifacts
// (retouch_equipment()), wielding_corpse() and slippery fingers when gloves come off, and
// see_monsters() (the view is rebuilt after every action, so the helms of telepathy and caution
// show their monsters then). Levitation boots float through levitation.ts (late-bound, see
// setBootsLevitation()), which sits above this module.
import {
  getPlayer,
  inventoryOf,
  type ArmorSlot,
  type Ctx,
  type Entity,
  type EquipSlot,
  type ModApi,
  type Msg,
} from '@nh/core';
import { adjustAbon, rawAttr, syncAttrOverrides, type Attr } from './attrstate';
import { engulferOf } from './engulfstate';
import { hcolor } from './hcolor';
import { cantSeeSelf, cloakOff, cloakOn } from './invis';
import { A_CHAOTIC, A_LAWFUL, A_NEUTRAL } from './aligntyp';
import { HERO_ALIGN_TYPE, adjalign, setU, uState } from './luck';
import { discover } from './o_init';
import { xnameOf } from './objnam';
import {
  P,
  hasExtrinsic,
  hasProp,
  incrItimeout,
  makeConfused,
  setItimeout,
  timeoutLeft,
  updateWornProps,
} from './props';
import { levitating } from './trapstate';

type WearCtx = Ctx;

const say = (ctx: WearCtx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/** float_up() and float_down(0, 0) for levitation boots: levitation.ts sits above this module. */
let bootsFloat: { up: (ctx: Ctx) => void; down: (ctx: Ctx) => void } | null = null;

/** Set by levitation.ts's registerLevitation(). */
export function setBootsLevitation(up: (ctx: Ctx) => void, down: (ctx: Ctx) => void): void {
  bootsFloat = { up, down };
}

const ARMOR_SLOTS: readonly string[] = [
  'body',
  'cloak',
  'shirt',
  'helm',
  'gloves',
  'boots',
  'shield',
];

/** True for the armor slots, as opposed to weapon and accessory slots. */
export const isArmorSlot = (slot: EquipSlot | null | undefined): slot is ArmorSlot =>
  !!slot && ARMOR_SLOTS.includes(slot);

/**
 * `oldprop`: another worn item than `obj` gives the property (the extrinsic without `obj`'s
 * bit).
 */
function otherWorn(ctx: WearCtx, obj: Entity, prop: string): boolean {
  const h = getPlayer(ctx.state);
  return inventoryOf(ctx.state, h.id).some((o) => {
    const eq = o.c.item?.equipped;
    return o.id !== obj.id && !!eq && eq !== 'weapon' && ctx.defs.object(o.def).prop === prop;
  });
}

/** HFoo without its timeout: the permanent part (C's FROMOUTSIDE/FROMEXPER/FROMFORM bits). */
function permanent(ctx: WearCtx, prop: string): boolean {
  const h = getPlayer(ctx.state);
  return h.c.props?.[prop]?.intrinsic === true || h.c.props?.[`${prop}:form`] !== undefined;
}

/** `oldprop`: stealth from something other than `obj`, a worn item or HStealth (intrinsic or timed). */
function otherStealth(ctx: WearCtx, obj: Entity): boolean {
  const p = getPlayer(ctx.state).c.props?.[P.STEALTH];
  return (!!p && (p.intrinsic || p.timeout > 0)) || otherWorn(ctx, obj, P.STEALTH);
}

/**
 * Putting on or taking off an elven cloak or elven boots: the message and the discovery only when
 * her stealth changes. ref: src/do_wear.c toggle_stealth() (no steed)
 */
function toggleStealth(ctx: WearCtx, obj: Entity, on: boolean): void {
  if (otherStealth(ctx, obj)) return;
  discover(ctx, obj.def); // makeknown(): elven cloak or elven boots
  if (!on) say(ctx, 'ring.noisy');
  else if (ctx.defs.object(obj.def).armor?.slot !== 'boots') say(ctx, 'ring.move_quietly');
  else if (levitating(ctx) || hasProp(getPlayer(ctx.state), P.FLYING))
    say(ctx, 'wear.float_imperceptibly');
  else say(ctx, 'wear.walk_quietly');
}

/**
 * Putting on or taking off a cloak of displacement: the message and the discovery only when she
 * would notice monsters' trouble (she sees herself and her surroundings, or senses them by
 * telepathy). ref: src/do_wear.c toggle_displacement() (no Detect_monsters)
 */
function toggleDisplacement(ctx: WearCtx, obj: Entity, on: boolean): void {
  const h = getPlayer(ctx.state);
  if (otherWorn(ctx, obj, P.DISPLACED) || h.c.props?.[P.DISPLACED]) return;
  const blind = hasProp(h, P.BLINDED);
  const telepat = hasProp(h, P.TELEPAT);
  const sees = !blind && engulferOf(ctx.state) === null && !cantSeeSelf(ctx.state);
  // Unblind_telepat (worn telepathy) || (Blind_telepat && Blind)
  if (!(sees || hasExtrinsic(h, P.TELEPAT) || (telepat && blind))) return;
  discover(ctx, obj.def);
  say(ctx, on ? 'wear.displaced_on' : 'wear.displaced_off');
}

/** The attributes the worn `def` adds its enchantment to. ref: src/do_wear.c adj_abon() */
function abonAttrs(def: string, slot: string): readonly Attr[] {
  if (def === 'nh:gauntlets_of_dexterity' && slot === 'gloves') return ['dex'];
  if (def === 'nh:helm_of_brilliance' && slot === 'helm') return ['int', 'wis'];
  return [];
}

/**
 * The worn gauntlets of dexterity or helm of brilliance `obj` change her Dex or Int and Wis by
 * `delta` (they are learned when it is not 0). ref: src/do_wear.c adj_abon()
 */
export function adjAbon(ctx: WearCtx, obj: Entity, delta: number): void {
  const it = obj.c.item;
  if (!it || it.carriedBy !== ctx.state.playerId || !it.equipped) return;
  const attrs = abonAttrs(obj.def, it.equipped);
  if (!delta || attrs.length === 0) return;
  discover(ctx, obj.def);
  for (const a of attrs) adjustAbon(ctx, a, delta);
}

/**
 * The worn gauntlets of dexterity or helm of brilliance `obj` lose `n` points of enchantment
 * without being learned (cancellation, draining). ref: src/zap.c cancel_item(), drain_item()
 */
export function loseAbon(ctx: Pick<Ctx, 'state'>, obj: Entity, n: number): void {
  const it = obj.c.item;
  if (!it || it.carriedBy !== ctx.state.playerId || !it.equipped || !n) return;
  for (const a of abonAttrs(obj.def, it.equipped)) adjustAbon(ctx, a, -n);
}

/**
 * Putting on or taking off a helm of opposite alignment: her alignment changes, divine protection
 * and the alignment record are lost. ref: src/attrib.c uchangealign() A_CG_HELM_ON, A_CG_HELM_OFF
 * (no Astral Plane; no erinyes for summon_furies(), so the roll is made and nothing comes)
 */
function uchangealign(ctx: WearCtx, newalign: number, on: boolean): void {
  const oldalign = uState(ctx.state).alignType;
  setU(ctx, { ublessed: 0, alignType: newalign });
  const halluc = hasProp(getPlayer(ctx.state), P.HALLUC);
  if (on) {
    adjalign(ctx, -7); // for abuse -- record will be cleared shortly
    say(ctx, halluc ? 'wear.mind_oscillates_wildly' : 'wear.mind_oscillates');
    makeConfused(ctx, ctx.rng.rn2(2) + 3, false); // rn1(2, 3)
    ctx.rng.rn2(50); // < u.ualign.abuse: summon_furies(1), which finds no erinys to make
  } else {
    say(ctx, halluc ? 'wear.mind_muchness' : 'wear.mind_in_sync');
  }
  if (newalign !== oldalign) setU(ctx, { alignRecord: 0 }); // slate is wiped clean
}

/** The helm of opposite alignment and the dunce cap curse themselves. ref: Helmet_on() */
function helmAutocurse(ctx: WearCtx, obj: Entity): void {
  const it = obj.c.item;
  const h = getPlayer(ctx.state);
  if (it && it.buc !== 'cursed') {
    const item = xnameOf(ctx.state, ctx.defs, obj);
    if (hasProp(h, P.BLINDED)) say(ctx, 'wear.helm_vibrates', { item });
    else say(ctx, 'wear.helm_glows', { item, color: hcolor(ctx, 'black') });
    it.buc = 'cursed'; // curse()
    if (hasProp(h, P.BLINDED)) it.known.buc = false; // set_bknown(uarmh, 0)
  }
  if (hasProp(h, P.HALLUC)) say(ctx, 'wear.brain_hurts');
  else if (obj.def === 'nh:dunce_cap')
    // tracks the Int change (ignores Wis): ACURR(A_INT) <= ABASE + ABON + ATEMP
    say(ctx, 6 <= rawAttr(ctx.state, 'int') ? 'wear.sit_in_corner' : 'wear.giddy');
  else discover(ctx, 'nh:helm_of_opposite_alignment');
}

/** Fumble boots or gauntlets of fumbling start the trip timer. ref: Boots_on(), Gloves_on() */
function fumblingOn(ctx: WearCtx, obj: Entity): void {
  if (!otherWorn(ctx, obj, P.FUMBLING) && !permanent(ctx, P.FUMBLING))
    incrItimeout(ctx.state, getPlayer(ctx.state), P.FUMBLING, ctx.rng.rnd(20));
}

/** `HFumbling = EFumbling = 0` when nothing else makes her fumble. ref: Boots_off(), Gloves_off() */
function fumblingOff(ctx: WearCtx, obj: Entity): void {
  if (!otherWorn(ctx, obj, P.FUMBLING) && !permanent(ctx, P.FUMBLING))
    setItimeout(ctx.state, getPlayer(ctx.state), P.FUMBLING, 0);
}

/** Another source than `obj` holds her up: oldprop or HLevitation. */
function otherLevitation(ctx: WearCtx, obj: Entity): boolean {
  const p = getPlayer(ctx.state).c.props?.[P.LEVITATION];
  return (!!p && (p.intrinsic || p.timeout > 0)) || otherWorn(ctx, obj, P.LEVITATION);
}

/** Very_fast: a timed or worn Fast. ref: include/youprop.h Very_fast */
const veryFast = (ctx: WearCtx): boolean => {
  const h = getPlayer(ctx.state);
  return timeoutLeft(ctx.state, h, P.FAST) > 0 || hasExtrinsic(h, P.FAST);
};

/** The armor `obj`, just put on (its slot is set). ref: src/do_wear.c Type_on() */
export function armorOn(ctx: WearCtx, obj: Entity): void {
  updateWornProps(ctx.state, ctx.defs, ctx.state.playerId);
  syncAttrOverrides(ctx);
  const h = getPlayer(ctx.state);
  const spe = obj.c.item?.spe ?? 0;
  switch (ctx.defs.object(obj.def).armor?.slot) {
    case 'cloak':
      // ref: Cloak_on()
      if (obj.def === 'nh:cloak_of_protection') discover(ctx, obj.def);
      else if (obj.def === 'nh:elven_cloak') toggleStealth(ctx, obj, true);
      else if (obj.def === 'nh:cloak_of_displacement') toggleDisplacement(ctx, obj, true);
      else if (obj.def === 'nh:oilskin_cloak')
        say(ctx, 'wear.fits_tightly', { item: xnameOf(ctx.state, ctx.defs, obj) });
      else cloakOn(ctx, obj); // mummy wrapping, cloak of invisibility
      break;
    case 'boots':
      // ref: Boots_on()
      if (obj.def === 'nh:elven_boots') toggleStealth(ctx, obj, true);
      else if (obj.def === 'nh:speed_boots') {
        // speed boots are still better than intrinsic speed, though not better than potion speed
        if (!otherWorn(ctx, obj, P.FAST) && timeoutLeft(ctx.state, h, P.FAST) === 0) {
          discover(ctx, obj.def);
          say(ctx, permanent(ctx, P.FAST) ? 'wear.speed_up_more' : 'wear.speed_up');
        }
      } else if (obj.def === 'nh:fumble_boots') fumblingOn(ctx, obj);
      else if (obj.def === 'nh:levitation_boots') {
        if (!otherLevitation(ctx, obj)) {
          discover(ctx, obj.def);
          bootsFloat?.up(ctx);
        }
      }
      break;
    case 'helm':
      // ref: Helmet_on()
      if (obj.def === 'nh:helm_of_brilliance') adjAbon(ctx, obj, spe);
      else if (obj.def === 'nh:cornuthaum') {
        // it takes trained arrogance to pull it off (no Wizards here)
        adjustAbon(ctx, 'cha', -1);
        discover(ctx, obj.def);
      } else if (obj.def === 'nh:helm_of_opposite_alignment') {
        const ualign = uState(ctx.state).alignType;
        uchangealign(ctx, ualign !== A_NEUTRAL ? -ualign : obj.id % 2 ? A_CHAOTIC : A_LAWFUL, true);
        helmAutocurse(ctx, obj);
      } else if (obj.def === 'nh:dunce_cap') helmAutocurse(ctx, obj);
      break;
    case 'gloves':
      // ref: Gloves_on()
      if (obj.def === 'nh:gauntlets_of_fumbling') fumblingOn(ctx, obj);
      else if (obj.def === 'nh:gauntlets_of_power') discover(ctx, obj.def);
      else if (obj.def === 'nh:gauntlets_of_dexterity') adjAbon(ctx, obj, spe);
      break;
    default:
      // Shield_on(), Shirt_on(), Armor_on(): nothing for the armor of the port
      break;
  }
}

/**
 * The armor `obj` has come off from `slot` (already cleared: taken off, stolen, destroyed or
 * broken). ref: src/do_wear.c Type_off(), Type_gone()
 */
export function armorOff(ctx: WearCtx, obj: Entity, slot: ArmorSlot): void {
  updateWornProps(ctx.state, ctx.defs, ctx.state.playerId);
  syncAttrOverrides(ctx);
  const h = getPlayer(ctx.state);
  const spe = obj.c.item?.spe ?? 0;
  switch (slot) {
    case 'cloak':
      // ref: Cloak_off()
      if (obj.def === 'nh:elven_cloak') toggleStealth(ctx, obj, false);
      else if (obj.def === 'nh:cloak_of_displacement') toggleDisplacement(ctx, obj, false);
      else cloakOff(ctx, obj);
      break;
    case 'boots':
      // ref: Boots_off()
      if (obj.def === 'nh:elven_boots') toggleStealth(ctx, obj, false);
      else if (obj.def === 'nh:speed_boots') {
        if (!veryFast(ctx)) {
          discover(ctx, obj.def);
          say(ctx, hasProp(h, P.FAST) ? 'wear.slow_down_bit' : 'wear.slow_down');
        }
      } else if (obj.def === 'nh:fumble_boots') fumblingOff(ctx, obj);
      else if (obj.def === 'nh:levitation_boots') {
        if (!otherLevitation(ctx, obj)) {
          bootsFloat?.down(ctx);
          discover(ctx, obj.def);
        }
      }
      break;
    case 'helm':
      // ref: Helmet_off()
      if (obj.def === 'nh:cornuthaum') adjustAbon(ctx, 'cha', 1);
      else if (obj.def === 'nh:helm_of_brilliance') {
        for (const a of abonAttrs(obj.def, slot)) adjustAbon(ctx, a, -spe);
        if (spe) discover(ctx, obj.def);
      } else if (obj.def === 'nh:helm_of_opposite_alignment')
        uchangealign(ctx, HERO_ALIGN_TYPE, false); // u.ualignbase[A_CURRENT]
      break;
    case 'gloves':
      // ref: Gloves_off()
      if (obj.def === 'nh:gauntlets_of_fumbling') fumblingOff(ctx, obj);
      else if (obj.def === 'nh:gauntlets_of_power') discover(ctx, obj.def);
      else if (obj.def === 'nh:gauntlets_of_dexterity') {
        for (const a of abonAttrs(obj.def, slot)) adjustAbon(ctx, a, -spe);
        if (spe) discover(ctx, obj.def);
      }
      break;
    default:
      break;
  }
}

/** The overrides follow the hero's gloves and helmet (a safety net, as for the worn props). */
export function registerDowear(api: ModApi): void {
  api.on('afterAction', (ctx) => syncAttrOverrides(ctx));
}
