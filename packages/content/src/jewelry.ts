// Rings, amulets and the blindfold: putting them on (P), removing them (R) and what happens as
// they go on and off; the strangulation and restful-sleep timers. What a worn item does while
// worn comes from its `prop` (see props.ts updateWornProps) and is read where NetHack reads the
// property.
// ref: src/do_wear.c doputon(), accessory_or_armor_on(), doremring(), armor_or_accessory_off(),
// select_off(), cursed(), on_msg(), off_msg(), Ring_on(), Ring_off_or_gone(), Amulet_on(),
// Amulet_off(), Blindf_on(), Blindf_off(), learnring(), adjust_attrib(); src/timeout.c
// nh_timeout(), choke_dialogue(), sleep_dialogue()
//
// Not ported: slippery fingers (Glib), handedness (the hero is right-handed), polymorphed forms
// without hands or limbs, retouch_object() (silver), the rings and amulets outside our subset.
import {
  NORMAL_SPEED,
  getPlayer,
  inventoryOf,
  type ActionDef,
  type Ctx,
  type DefId,
  type Entity,
  type EquipSlot,
  type Json,
  type ModApi,
  type Msg,
  type PlayerAction,
} from '@nh/core';
import { isWeaponOrWeptool } from './material';
import {
  cantSeeSelf,
  heroInvisBlocked,
  heroInvisible,
  seeInvisible,
  selfInvisMessage,
} from './invis';
import { abon, acurrClamp, addAbon, type Attr } from './attrib';
import { stopOccupation } from './eat';
import { done } from './end';
import { changeSex, heroFemale, polyGender } from './gender';
import { nomulNow } from './hunger';
import { prinv } from './itemactions';
import { removeFromInventory } from './items';
import { uState } from './luck';
import { hcolor } from './magic';
import { discover, isKnown } from './o_init';
import { floatDown, floatUp, levitating, otherLevitation } from './levitation';
import { CHARGED_RINGS } from './objects';
import { hasHead, nolimbs } from './mondata';
import { xnameOf } from './objnam';
import { heroForm } from './upoly';
import { isSlimed, makeSlimed } from './slimestate';
import {
  P,
  hasExtrinsic,
  hasIntrinsic,
  hasProp,
  incrItimeout,
  isStrangled,
  setItimeout,
  timeoutLeft,
  updateWornProps,
  wornIn,
} from './props';
import { setSwapWep, swapWep } from './wield';

export const PUTON_ID: DefId = 'nh:puton';
export const REMOVE_ID: DefId = 'nh:remove';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const hero = (ctx: Pick<Ctx, 'state'>): Entity => getPlayer(ctx.state);
const blind = (ctx: Pick<Ctx, 'state'>): boolean => hasProp(hero(ctx), P.BLINDED);
const worn = (ctx: Pick<Ctx, 'state'>, slot: EquipSlot): Entity | null =>
  wornIn(ctx.state, ctx.state.playerId, slot);

/** The hero's item with this id, or null. */
function heroItem(ctx: Ctx, id: unknown): Entity | null {
  if (typeof id !== 'number') return null;
  const e = ctx.state.entities[String(id)];
  return e?.c.item?.carriedBy === ctx.state.playerId ? e : null;
}

function itemArg(action: PlayerAction): unknown {
  if (action.type !== 'mod') return undefined;
  return (action.args as { item?: unknown } | undefined)?.item;
}

const isRingSlot = (slot: EquipSlot | null | undefined): slot is 'ringL' | 'ringR' =>
  slot === 'ringL' || slot === 'ringR';
/** Eyewear worn in the 'blindfold' slot (ublindf): the blindfold of the subset. */
export const isEyewear = (def: string): boolean => def === 'nh:blindfold';
const isAccessory = (ctx: Pick<Ctx, 'defs'>, e: Entity): boolean => {
  const cls = ctx.defs.object(e.def).class;
  return cls === 'ring' || cls === 'amulet' || isEyewear(e.def);
};

/** The wielded weapon when it is welded (cursed), which also reveals the curse. ref: src/wield.c welded() */
function weldedUwep(ctx: Ctx): Entity | null {
  const w = worn(ctx, 'weapon');
  if (!w?.c.item || w.c.item.buc !== 'cursed' || !isWeaponOrWeptool(ctx.defs.object(w.def)))
    return null;
  w.c.item.known.buc = true;
  return w;
}

// ---------------------------------------------------------------------------------------------
// ring and amulet effects

/**
 * Discovers the ring when its effect was observed, and learns a charged ring's enchantment once
 * its type is known. ref: src/do_wear.c learnring() (rings are always seen: dknown)
 */
function learnring(ctx: Ctx, ring: Entity, observed: boolean): void {
  const def = ctx.defs.object(ring.def);
  if (observed && !isKnown(ctx.state, ctx.defs, def)) discover(ctx, def);
  if (isKnown(ctx.state, ctx.defs, def) && CHARGED_RINGS.has(def.id) && ring.c.item)
    ring.c.item.known.spe = true;
}

/** ref: src/attrib.c extremeattr(): the attribute is at 3 or at its top (25, Str 125) */
function extremeattr(ctx: Ctx, which: Attr): boolean {
  const cur = hero(ctx).c.attributes?.[which] ?? 10;
  return cur === 3 || cur === (which === 'str' ? 125 : 25);
}

/**
 * ABON(which) += val, with ACURR recomputed, and the ring learned when the change shows (or when
 * a +0 ring is not stuck at a limit). ref: src/do_wear.c adjust_attrib()
 */
function adjustAttrib(ctx: Ctx, ring: Entity, which: Attr, val: number): void {
  const a = hero(ctx).c.attributes;
  if (!a) return;
  const old = a[which];
  const base = old - abon(ctx.state, which);
  addAbon(ctx, which, val);
  a[which] = acurrClamp(which, base + abon(ctx.state, which));
  const observable = old !== a[which];
  if (observable || !extremeattr(ctx, which)) learnring(ctx, ring, observable);
}

/**
 * Stealth from something other than `obj`: intrinsic or timed, or another worn item (no BStealth:
 * no steeds). ref: src/do_wear.c toggle_stealth() `oldprop`, HStealth
 */
function otherStealth(ctx: Ctx, obj: Entity): boolean {
  const h = hero(ctx);
  const p = h.c.props?.[P.STEALTH];
  if (p && (p.intrinsic || p.timeout > 0)) return true;
  return inventoryOf(ctx.state, h.id).some((o) => {
    const eq = o.c.item?.equipped;
    return o.id !== obj.id && !!eq && eq !== 'weapon' && ctx.defs.object(o.def).prop === P.STEALTH;
  });
}

/**
 * Putting on or taking off an item which confers stealth: feedback, and the ring learned, only
 * when her stealth changes. ref: src/do_wear.c toggle_stealth() (rings only: no elven cloak or
 * boots, no steed)
 */
function toggleStealth(ctx: Ctx, obj: Entity, on: boolean): void {
  if (otherStealth(ctx, obj)) return;
  learnring(ctx, obj, true);
  say(ctx, on ? 'ring.move_quietly' : 'ring.noisy');
}

/** HFoo: the property from an intrinsic or a timeout (not from worn items). */
function hprop(ctx: Ctx, name: string): boolean {
  const p = hero(ctx).c.props?.[name];
  return !!p && (p.intrinsic || p.timeout > 0);
}

/** `oldprop`: another worn item than `obj` confers the property. ref: Ring_on() */
function otherWorn(ctx: Ctx, obj: Entity, prop: string): boolean {
  return inventoryOf(ctx.state, hero(ctx).id).some((o) => {
    const eq = o.c.item?.equipped;
    return o.id !== obj.id && !!eq && eq !== 'weapon' && ctx.defs.object(o.def).prop === prop;
  });
}

/** ref: src/do_wear.c Ring_on(): the ring is already worn as uleft or uright */
function ringOn(ctx: Ctx, ring: Entity): void {
  const spe = ring.c.item?.spe ?? 0;
  switch (ring.def) {
    case 'nh:ring_of_gain_strength':
      adjustAttrib(ctx, ring, 'str', spe);
      break;
    case 'nh:ring_of_gain_constitution':
      adjustAttrib(ctx, ring, 'con', spe);
      break;
    case 'nh:ring_of_adornment':
      adjustAttrib(ctx, ring, 'cha', spe);
      break;
    case 'nh:ring_of_levitation':
      // `!oldprop && !HLevitation`; nothing blocks it from outside (no solid rock to stand in)
      if (!otherLevitation(ctx, ring)) {
        floatUp(ctx);
        learnring(ctx, ring, true);
        // `if (Levitation) spoteffects(FALSE)` is for sinks (none exist)
      }
      break;
    case 'nh:ring_of_stealth':
      toggleStealth(ctx, ring, true);
      break;
    case 'nh:ring_of_warning':
      // see_monsters(): the view shows the warning digits from the next snapshot on
      break;
    case 'nh:ring_of_see_invisible':
      // can now see invisible monsters (see_monsters(): the next snapshot shows them)
      if (
        heroInvisible(ctx.state) &&
        !otherWorn(ctx, ring, P.SEE_INVIS) &&
        !hprop(ctx, P.SEE_INVIS) &&
        !blind(ctx)
      ) {
        say(ctx, 'ring.transparent_but_there');
        learnring(ctx, ring, true);
      }
      break;
    case 'nh:ring_of_invisibility':
      if (
        !otherWorn(ctx, ring, P.INVIS) &&
        !hprop(ctx, P.INVIS) &&
        !heroInvisBlocked(ctx.state) &&
        !blind(ctx)
      ) {
        learnring(ctx, ring, true);
        selfInvisMessage(ctx);
      }
      break;
    case 'nh:ring_of_protection':
      // usually learn enchantment and discover type; won't happen if it's +0 and the type hasn't
      // been discovered yet (AC follows from find_ac)
      learnring(ctx, ring, spe !== 0);
      break;
    default:
      // increase accuracy and damage are summed where they are used (u.uhitinc, u.udaminc);
      // the other rings only confer their property
      break;
  }
}

/** ref: src/do_wear.c Ring_off_or_gone(): `gone` when the ring is being destroyed */
function ringOffOrGone(ctx: Ctx, ring: Entity): void {
  const it = ring.c.item;
  if (!it || !isRingSlot(it.equipped)) return;
  it.equipped = null; // setworn(NULL, mask) / setnotworn()
  updateWornProps(ctx.state, ctx.defs, ctx.state.playerId);
  const spe = it.spe;
  switch (ring.def) {
    case 'nh:ring_of_gain_strength':
      adjustAttrib(ctx, ring, 'str', -spe);
      break;
    case 'nh:ring_of_gain_constitution':
      adjustAttrib(ctx, ring, 'con', -spe);
      break;
    case 'nh:ring_of_adornment':
      adjustAttrib(ctx, ring, 'cha', -spe);
      break;
    case 'nh:ring_of_protection':
      learnring(ctx, ring, spe !== 0);
      break;
    case 'nh:ring_of_levitation':
      floatDown(ctx);
      if (!levitating(ctx)) learnring(ctx, ring, true);
      break;
    case 'nh:ring_of_stealth':
      toggleStealth(ctx, ring, false);
      break;
    case 'nh:ring_of_see_invisible':
      // make invisible monsters go away (see_monsters(): from the next snapshot on)
      if (cantSeeSelf(ctx.state) && !blind(ctx)) {
        say(ctx, 'ring.cannot_see_self');
        learnring(ctx, ring, true);
      }
      break;
    case 'nh:ring_of_invisibility':
      if (!heroInvisible(ctx.state) && !heroInvisBlocked(ctx.state) && !blind(ctx)) {
        say(ctx, seeInvisible(ctx.state) ? 'ring.unfade_completely' : 'ring.unfade');
        learnring(ctx, ring, true);
      }
      break;
    default:
      break;
  }
}

/** A worn ring is being destroyed (shocked to dust): its effects end silently. ref: Ring_gone() */
export function ringGone(ctx: Ctx, ring: Entity): void {
  ringOffOrGone(ctx, ring);
}

/** ref: src/do_wear.c Ring_off() with off_msg() first: "You were wearing a ring (on left hand)." */
function ringOff(ctx: Ctx, ring: Entity): void {
  say(ctx, 'takeoff.were_wearing', { item: ctx.defs.itemName(ctx.state, ring) });
  ringOffOrGone(ctx, ring);
}

/** Wears the item in `slot`, taking it out of the weapon slots. ref: setworn(), remove_worn_item() */
function setworn(ctx: Ctx, obj: Entity, slot: EquipSlot): void {
  const it = obj.c.item;
  if (!it) return;
  if (swapWep(ctx)?.id === obj.id) setSwapWep(ctx, null);
  it.equipped = slot; // replaces 'weapon' when the ring was wielded (setuwep(NULL))
  updateWornProps(ctx.state, ctx.defs, ctx.state.playerId);
}

/** ref: src/do_wear.c Amulet_on() */
function amuletOn(ctx: Ctx, amul: Entity): void {
  setworn(ctx, amul, 'amulet');
  const h = hero(ctx);
  let onMsgDone = false;
  switch (amul.def) {
    case 'nh:amulet_of_strangulation':
      // (humans can be strangled; it might already be going on)
      if (!isStrangled(h)) {
        discover(ctx, amul.def);
        setItimeout(ctx.state, h, P.STRANGLED, 6);
        prinv(ctx, amul);
        onMsgDone = true;
        say(ctx, 'amulet.constricts');
      }
      break;
    case 'nh:amulet_of_unchanging':
      if (isSlimed(ctx.state)) makeSlimed(ctx, 0, null);
      break;
    case 'nh:amulet_of_change': {
      const origSex = polyGender(ctx.state);
      // in normal play it's not possible to put on an amulet of change while already wearing an
      // amulet of unchanging, but Unchanging may come from elsewhere (wizard mode in C)
      if (!hasProp(h, P.UNCHANGING)) changeSex(ctx);
      const newSex = polyGender(ctx.state);
      if (newSex !== origSex) discover(ctx, amul.def);
      prinv(ctx, amul); // on_msg(): "z - an amulet of change (being worn)."
      onMsgDone = true;
      // don't use same message as polymorph
      if (newSex !== origSex)
        say(ctx, heroFemale(ctx.state) ? 'amulet.change.feminine' : 'amulet.change.masculine');
      // (already polymorphed into a single-gender monster: only the base sex changed; or
      // Unchanging); trycall() is not ported
      else say(ctx, 'amulet.change.not_yourself');
      say(ctx, 'amulet.disintegrates');
      useupAmulet(ctx);
      break;
    }
    case 'nh:amulet_of_restful_sleep': {
      const newnap = ctx.rng.rnd(98) + 2;
      const oldnap = timeoutLeft(ctx.state, h, P.SLEEPY);
      if (newnap < oldnap || oldnap === 0) setItimeout(ctx.state, h, P.SLEEPY, newnap);
      break;
    }
    default:
      // ESP, life saving, versus poison, reflection, magical breathing (no poison gas regions)
      // and the imitation: nothing happens now
      break;
  }
  if (!onMsgDone) prinv(ctx, amul); // on_msg(): "z - a circular amulet (being worn)."
}

/** ref: src/do_wear.c Amulet_off(), with its off_msg() after the amulet is off */
export function amuletOff(ctx: Ctx, amul: Entity): void {
  const it = amul.c.item;
  if (!it) return;
  it.equipped = null;
  updateWornProps(ctx.state, ctx.defs, ctx.state.playerId);
  say(ctx, 'takeoff.were_wearing', { item: ctx.defs.itemName(ctx.state, amul) });
  const h = hero(ctx);
  switch (amul.def) {
    case 'nh:amulet_of_strangulation':
      if (isStrangled(h)) {
        setItimeout(ctx.state, h, P.STRANGLED, 0);
        // Breathless (magical breathing from elsewhere; no breathless forms)
        say(
          ctx,
          hasProp(h, P.MAGICAL_BREATHING) ? 'amulet.neck_unconstricted' : 'amulet.breathe_easier',
        );
        discover(ctx, amul.def);
      }
      break;
    case 'nh:amulet_of_restful_sleep':
      // avoid clobbering an intrinsic (no amulet of restful sleep can be eaten here)
      if (!hasExtrinsic(h, P.SLEEPY) && !hasIntrinsic(h, P.SLEEPY))
        setItimeout(ctx.state, h, P.SLEEPY, 0);
      break;
    default:
      break;
  }
}

/** Uses up the worn amulet without Amulet_off() feedback. ref: src/invent.c useup() */
export function useupAmulet(ctx: Ctx): void {
  const uamul = worn(ctx, 'amulet');
  if (!uamul) return;
  removeFromInventory(ctx, uamul.id);
  ctx.remove(uamul.id);
  updateWornProps(ctx.state, ctx.defs, ctx.state.playerId);
}

/**
 * Prayer cures strangulation: a strangling amulet vanishes. ref: src/pray.c fix_worst_trouble()
 * TROUBLE_STRANGLED
 */
export function fixStrangled(ctx: Ctx): void {
  if (worn(ctx, 'amulet')?.def === 'nh:amulet_of_strangulation') {
    say(ctx, 'amulet.vanishes');
    useupAmulet(ctx);
  }
  say(ctx, 'pray.breathe_again');
  setItimeout(ctx.state, hero(ctx), P.STRANGLED, 0);
}

// ---------------------------------------------------------------------------------------------
// eyewear

/** ref: src/do_wear.c Blindf_on() (no Eyes of the Overworld, no ball and chain) */
export function blindfOn(ctx: Ctx, obj: Entity): void {
  const alreadyBlind = hasProp(hero(ctx), P.BLINDED);
  // blindfold might be wielded; release it for wearing
  setworn(ctx, obj, 'blindfold');
  // on_msg() with flags.verbose: "You are now wearing a blindfold."
  say(ctx, 'puton.now_wearing', { item: xnameOf(ctx.state, ctx.defs, obj) });
  if (hasProp(hero(ctx), P.BLINDED) && !alreadyBlind) say(ctx, 'blindf.cant_see');
  // (vision follows the blindness after the action: toggle_blindness())
}

/** ref: src/do_wear.c Blindf_off() (`offMsg` false: Blindf_off(NULL), no "You were wearing") */
export function blindfOff(ctx: Ctx, obj: Entity, offMsg = true): void {
  const wasBlind = hasProp(hero(ctx), P.BLINDED);
  const it = obj.c.item;
  if (!it) return;
  it.equipped = null; // setworn((struct obj *) 0, otmp->owornmask)
  updateWornProps(ctx.state, ctx.defs, ctx.state.playerId);
  if (offMsg) say(ctx, 'takeoff.were_wearing', { item: ctx.defs.itemName(ctx.state, obj) }); // off_msg()
  if (hasProp(hero(ctx), P.BLINDED)) {
    if (wasBlind) say(ctx, 'blindf.still_cant_see');
  } else if (wasBlind) say(ctx, 'blind.see_again');
}

// ---------------------------------------------------------------------------------------------
// P and R

/** Whether the accessory can be put on now (quietly, for the offer). ref: accessory_or_armor_on() */
function canPutOn(ctx: Ctx, obj: Entity): boolean {
  const it = obj.c.item;
  if (!it || !isAccessory(ctx, obj)) return false;
  if (it.equipped !== null && it.equipped !== 'weapon') return false;
  if (ctx.defs.object(obj.def).class === 'amulet') return worn(ctx, 'amulet') === null;
  const form = heroForm(ctx);
  if (isEyewear(obj.def)) return worn(ctx, 'blindfold') === null && !(form && !hasHead(form));
  if (form && nolimbs(form)) return false;
  return worn(ctx, 'ringL') === null || worn(ctx, 'ringR') === null;
}

/** The ring part of accessory_or_armor_on() once the hand is chosen. */
function ringPutOn(ctx: Ctx, ring: Entity, mask: 'ringL' | 'ringR'): number {
  const gloves = worn(ctx, 'gloves');
  if (gloves?.c.item?.buc === 'cursed') {
    const res = !gloves.c.item.known.buc;
    gloves.c.item.known.buc = true;
    say(ctx, 'puton.gloves_cursed');
    return res ? NORMAL_SPEED : 0; // uses move iff we learned gloves are cursed
  }
  const uwep = worn(ctx, 'weapon');
  if (uwep?.c.item && ring.id !== uwep.id) {
    const res = !uwep.c.item.known.buc;
    const bimanual = ctx.defs.object(uwep.def).weapon?.bimanual === true;
    // the hero is right-handed (URIGHTY): her weapon hand is the right one
    if ((mask === 'ringR' || bimanual) && weldedUwep(ctx)) {
      say(ctx, bimanual ? 'puton.weapon_hands' : 'puton.weapon_hand');
      return res ? NORMAL_SPEED : 0; // uses move iff we learned weapon is cursed
    }
  }
  setworn(ctx, ring, mask);
  ringOn(ctx, ring);
  prinv(ctx, ring); // on_msg(): "q - a wooden ring (on left hand)."
  return NORMAL_SPEED;
}

const HAND_PROMPT = 'ring-hand';

const puton: ActionDef = {
  id: PUTON_ID,
  labelKey: 'action.nh:puton',
  handles: 'mod',
  offer(ctx, target) {
    if (target.kind !== 'item') return [];
    const e = heroItem(ctx, target.id);
    return e && canPutOn(ctx, e)
      ? [
          {
            action: { type: 'mod', action: PUTON_ID, args: { item: e.id } },
            labelKey: 'action.nh:puton',
          },
        ]
      : [];
  },
  // ref: src/do_wear.c doputon() -> accessory_or_armor_on()
  perform(ctx, action) {
    const obj = heroItem(ctx, itemArg(action));
    const it = obj?.c.item;
    if (!obj || !it) return 0;
    if (it.equipped !== null && it.equipped !== 'weapon') {
      say(ctx, 'wear.already_that');
      return 0;
    }
    const cls = ctx.defs.object(obj.def).class;
    if (cls === 'amulet') {
      if (worn(ctx, 'amulet')) {
        say(ctx, 'puton.already_amulet');
        return 0;
      }
      amuletOn(ctx, obj);
      return NORMAL_SPEED;
    }
    if (isEyewear(obj.def)) {
      const form = heroForm(ctx);
      if (form && !hasHead(form)) {
        say(ctx, 'puton.no_head', { item: `@${ctx.defs.object(obj.def).nameKey}` }); // ansimpleoname()
        return 0;
      }
      if (worn(ctx, 'blindfold')) {
        say(ctx, 'puton.already_blindfold');
        return 0;
      }
      blindfOn(ctx, obj);
      return NORMAL_SPEED;
    }
    if (cls !== 'ring') {
      say(ctx, 'wear.cant');
      return 0;
    }
    const form = heroForm(ctx);
    if (form && nolimbs(form)) {
      say(ctx, 'puton.ring_stick');
      return 0;
    }
    const uleft = worn(ctx, 'ringL');
    const uright = worn(ctx, 'ringR');
    if (uleft && uright) {
      say(ctx, 'puton.no_fingers');
      return 0;
    }
    if (uleft) return ringPutOn(ctx, obj, 'ringR');
    if (uright) return ringPutOn(ctx, obj, 'ringL');
    // "Which ring-finger, Right or Left?" (escape cancels: no time passes)
    ctx.ask(
      {
        id: HAND_PROMPT,
        kind: 'menu',
        key: 'puton.which_hand',
        cancellable: true,
        options: [
          { value: 'r', key: 'puton.hand.right', letter: 'r' },
          { value: 'l', key: 'puton.hand.left', letter: 'l' },
        ],
      },
      PUTON_ID,
      { item: obj.id },
    );
    return 0;
  },
  answer(ctx, value: Json, data: Json) {
    if (value !== 'r' && value !== 'l') return 0;
    const ring = heroItem(ctx, (data as { item?: unknown } | null)?.item);
    if (!ring || !canPutOn(ctx, ring)) return 0;
    return ringPutOn(ctx, ring, value === 'r' ? 'ringR' : 'ringL');
  },
};

/** "You can't.  It is cursed." ref: src/do_wear.c cursed() */
export function cursedWorn(ctx: Ctx, obj: Entity): boolean {
  const it = obj.c.item;
  if (!it || it.buc !== 'cursed') return false;
  say(ctx, it.quantity > 1 ? 'takeoff.cursed_pl' : 'takeoff.cursed');
  it.known.buc = true;
  return true;
}

const remove: ActionDef = {
  id: REMOVE_ID,
  labelKey: 'action.nh:remove',
  handles: 'mod',
  offer(ctx, target) {
    if (target.kind !== 'item') return [];
    const e = heroItem(ctx, target.id);
    const slot = e?.c.item?.equipped;
    return e && (isRingSlot(slot) || slot === 'amulet' || slot === 'blindfold')
      ? [
          {
            action: { type: 'mod', action: REMOVE_ID, args: { item: e.id } },
            labelKey: 'action.nh:remove',
          },
        ]
      : [];
  },
  // ref: src/do_wear.c doremring() -> armor_or_accessory_off() -> select_off()
  perform(ctx, action) {
    const obj = heroItem(ctx, itemArg(action));
    const slot = obj?.c.item?.equipped;
    if (!obj || !(isRingSlot(slot) || slot === 'amulet' || slot === 'blindfold')) {
      say(ctx, 'takeoff.not_wearing');
      return 0;
    }
    if (isRingSlot(slot)) {
      // select_off(): special ring checks (RING_ON_PRIMARY is the right ring)
      const uwep = worn(ctx, 'weapon');
      const bimanual = uwep ? ctx.defs.object(uwep.def).weapon?.bimanual === true : false;
      const gloves = worn(ctx, 'gloves');
      if ((slot === 'ringR' || bimanual) && weldedUwep(ctx)) {
        say(ctx, 'remove.free_weapon_hand');
        return 0;
      }
      if (gloves?.c.item?.buc === 'cursed') {
        gloves.c.item.known.buc = true;
        say(ctx, 'remove.gloves');
        return 0;
      }
    }
    if (cursedWorn(ctx, obj)) return 0;
    if (isRingSlot(slot)) ringOff(ctx, obj);
    else if (slot === 'blindfold') blindfOff(ctx, obj);
    else amuletOff(ctx, obj);
    return NORMAL_SPEED;
  },
};

export const JEWELRY_ACTIONS: readonly ActionDef[] = [puton, remove];

// ---------------------------------------------------------------------------------------------
// timers

/** Asleep, fainted or knocked out. ref: src/hack.c unconscious() */
function unconscious(ctx: Ctx): boolean {
  const r = hero(ctx).c.helpless?.reasonKey;
  return r === 'helpless.asleep' || r === 'helpless.fainted' || r === 'helpless.rotten_food';
}

/**
 * The Strangled and Sleepy timeouts, ahead of props.ts's countdown: the dialogues come before
 * the decrement, and the expiry is handled here. In NetHack terms the timeout value before the
 * decrement is our turns left + 1. ref: src/timeout.c nh_timeout(), choke_dialogue(),
 * sleep_dialogue(); STRANGLED and SLEEPY cases
 */
function jewelryTimeouts(ctx: Ctx): void {
  if (ctx.state.gameOver || uState(ctx.state).uinvulnerable) return;
  const h = hero(ctx);
  if (isStrangled(h)) {
    const i = timeoutLeft(ctx.state, h, P.STRANGLED) + 1;
    if (i >= 1 && i <= 5) {
      // Breathless: magical breathing (no breathless forms); it does not stop the strangling
      if (hasProp(h, P.MAGICAL_BREATHING) || ctx.rng.rn2(50) === 0) say(ctx, `choke.neck.${5 - i}`);
      else {
        say(ctx, `choke.text.${5 - i}`, i === 2 ? { color: hcolor(ctx, 'blue') } : undefined);
        stopOccupation(ctx);
      }
    }
    if (i === 1) {
      setItimeout(ctx.state, h, P.STRANGLED, 0);
      done(ctx, '@killer.strangulation');
      if (ctx.state.gameOver) return;
      // life-saved: treat like being cured of strangulation by prayer
      if (worn(ctx, 'amulet')?.def === 'nh:amulet_of_strangulation') {
        say(ctx, 'amulet.vanishes');
        useupAmulet(ctx);
      }
    }
  }
  const sleepy = h.c.props?.[P.SLEEPY]?.timeout ?? 0;
  if (sleepy > 0) {
    const i = timeoutLeft(ctx.state, h, P.SLEEPY) + 1;
    if (i === 4) say(ctx, 'sleepy.yawn');
    if (i === 1) {
      setItimeout(ctx.state, h, P.SLEEPY, 0);
      if (unconscious(ctx) || hasProp(h, P.SLEEP_RES)) {
        incrItimeout(ctx.state, h, P.SLEEPY, ctx.rng.rnd(100));
      } else if (hasProp(h, P.SLEEPY)) {
        say(ctx, 'sleepy.fall');
        const sleeptime = ctx.rng.rnd(20);
        // fall_asleep(-sleeptime, TRUE)
        nomulNow(ctx, sleeptime, 'helpless.asleep', { key: 'eat.wake_up' });
        incrItimeout(ctx.state, h, P.SLEEPY, sleeptime + ctx.rng.rnd(100));
      }
    }
  }
}

/** Registers the jewelry timers (ahead of props.ts's countdown) and the Strangled status. */
export function registerJewelry(api: ModApi): void {
  api.on('endOfTurn', jewelryTimeouts, { priority: 1 });
  // ref: src/botl.c bl_strngl: the "Strngl" condition
  api.defineStatus({
    id: 'nh:strangled',
    field: 'strngl',
    value: (state) => (isStrangled(getPlayer(state)) ? 1 : null),
  });
}
