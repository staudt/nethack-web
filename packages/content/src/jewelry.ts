// Rings and amulets: putting them on (P), removing them (R) and what happens as they go on and
// off; the strangulation and restful-sleep timers. What a worn item does while worn comes from its
// `prop` (see props.ts updateWornProps) and is read where NetHack reads the property.
// ref: src/do_wear.c doputon(), accessory_or_armor_on(), doremring(), armor_or_accessory_off(),
// select_off(), cursed(), on_msg(), off_msg(), Ring_on(), Ring_off_or_gone(), Amulet_on(),
// Amulet_off(), learnring(), adjust_attrib(); src/timeout.c nh_timeout(), choke_dialogue(),
// sleep_dialogue()
//
// Not ported: slippery fingers (Glib), handedness (the hero is right-handed), polymorphed forms
// without hands or limbs, retouch_object() (silver), the rings and amulets outside our subset.
import {
  NORMAL_SPEED,
  getPlayer,
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
import { abon, acurrClamp, addAbon, type Attr } from './attrib';
import { stopOccupation } from './eat';
import { done } from './end';
import { nomulNow } from './hunger';
import { prinv } from './itemactions';
import { removeFromInventory } from './items';
import { uState } from './luck';
import { hcolor } from './magic';
import { discover, isKnown } from './o_init';
import { CHARGED_RINGS } from './objects';
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
const isAccessory = (ctx: Pick<Ctx, 'defs'>, e: Entity): boolean => {
  const cls = ctx.defs.object(e.def).class;
  return cls === 'ring' || cls === 'amulet';
};

/** The wielded weapon when it is welded (cursed), which also reveals the curse. ref: src/wield.c welded() */
function weldedUwep(ctx: Ctx): Entity | null {
  const w = worn(ctx, 'weapon');
  if (!w?.c.item || w.c.item.buc !== 'cursed' || ctx.defs.object(w.def).class !== 'weapon')
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
    case 'nh:amulet_of_restful_sleep': {
      const newnap = ctx.rng.rnd(98) + 2;
      const oldnap = timeoutLeft(ctx.state, h, P.SLEEPY);
      if (newnap < oldnap || oldnap === 0) setItimeout(ctx.state, h, P.SLEEPY, newnap);
      break;
    }
    default:
      // ESP, life saving, versus poison, reflection and the imitation: nothing happens now
      break;
  }
  if (!onMsgDone) prinv(ctx, amul); // on_msg(): "z - a circular amulet (being worn)."
}

/** ref: src/do_wear.c Amulet_off(), with its off_msg() after the amulet is off */
function amuletOff(ctx: Ctx, amul: Entity): void {
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
        say(ctx, 'amulet.breathe_easier');
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
// P and R

/** Whether the accessory can be put on now (quietly, for the offer). ref: accessory_or_armor_on() */
function canPutOn(ctx: Ctx, obj: Entity): boolean {
  const it = obj.c.item;
  if (!it || !isAccessory(ctx, obj)) return false;
  if (it.equipped !== null && it.equipped !== 'weapon') return false;
  if (ctx.defs.object(obj.def).class === 'amulet') return worn(ctx, 'amulet') === null;
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
    if (cls !== 'ring') {
      say(ctx, 'wear.cant');
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
function cursedWorn(ctx: Ctx, obj: Entity): boolean {
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
    return e && (isRingSlot(slot) || slot === 'amulet')
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
    if (!obj || !(isRingSlot(slot) || slot === 'amulet')) {
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
      // (no Breathless forms)
      if (ctx.rng.rn2(50) === 0) say(ctx, `choke.neck.${5 - i}`);
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
