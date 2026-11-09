// What happens when the hero's armor goes on or comes off, after the slot is set (C's Type_on())
// or cleared (Type_off(), Type_gone()): the worn properties are rebuilt (setworn()), then the
// armor-specific effects run.
// ref: src/do_wear.c Boots_on(), Boots_off(), Cloak_on(), Cloak_off(), Helmet_on(),
// Helmet_off(), Shield_on(), Shield_off(), Shirt_on(), Shirt_off(), Armor_on(), Armor_off(),
// toggle_stealth()
//
// Not ported: the armor of the next step (speed, fumble and levitation boots, the oilskin cloak,
// the cloak of displacement, the helms of brilliance and opposite alignment, the cornuthaum and
// the dunce cap), dragon scales, the Archeologist's fedora luck (no roles), water (water walking
// boots do nothing), steeds and BStealth, and see_monsters() (the view is rebuilt after every
// action, so the helms of telepathy and caution show their monsters then).
import {
  getPlayer,
  inventoryOf,
  type ArmorSlot,
  type Ctx,
  type Entity,
  type EquipSlot,
} from '@nh/core';
import { cloakOff, cloakOn } from './invis';
import { discover } from './o_init';
import { P, hasProp, updateWornProps } from './props';
import { levitating } from './trapstate';

type WearCtx = Pick<Ctx, 'state' | 'defs' | 'emit'>;

const say = (ctx: WearCtx, key: string): void => ctx.emit({ type: 'msg', key });

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
 * `oldprop`: stealth from something other than `obj`, a worn item or HStealth (intrinsic or
 * timed).
 */
function otherStealth(ctx: WearCtx, obj: Entity): boolean {
  const h = getPlayer(ctx.state);
  const p = h.c.props?.[P.STEALTH];
  if (p && (p.intrinsic || p.timeout > 0)) return true;
  return inventoryOf(ctx.state, h.id).some((o) => {
    const eq = o.c.item?.equipped;
    return o.id !== obj.id && !!eq && eq !== 'weapon' && ctx.defs.object(o.def).prop === P.STEALTH;
  });
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

/** The armor `obj`, just put on (its slot is set). ref: src/do_wear.c Type_on() */
export function armorOn(ctx: WearCtx, obj: Entity): void {
  updateWornProps(ctx.state, ctx.defs, ctx.state.playerId);
  switch (ctx.defs.object(obj.def).armor?.slot) {
    case 'cloak':
      // ref: Cloak_on()
      if (obj.def === 'nh:cloak_of_protection') discover(ctx, obj.def);
      else if (obj.def === 'nh:elven_cloak') toggleStealth(ctx, obj, true);
      else cloakOn(ctx, obj); // mummy wrapping, cloak of invisibility
      break;
    case 'boots':
      // ref: Boots_on()
      if (obj.def === 'nh:elven_boots') toggleStealth(ctx, obj, true);
      break;
    default:
      // Helmet_on(), Shield_on(), Shirt_on(), Armor_on(): nothing for the armor of the port
      break;
  }
}

/**
 * The armor `obj` has come off from `slot` (already cleared: taken off, stolen, destroyed or
 * broken). ref: src/do_wear.c Type_off(), Type_gone()
 */
export function armorOff(ctx: WearCtx, obj: Entity, slot: ArmorSlot): void {
  updateWornProps(ctx.state, ctx.defs, ctx.state.playerId);
  switch (slot) {
    case 'cloak':
      // ref: Cloak_off()
      if (obj.def === 'nh:elven_cloak') toggleStealth(ctx, obj, false);
      else cloakOff(ctx, obj);
      break;
    case 'boots':
      // ref: Boots_off()
      if (obj.def === 'nh:elven_boots') toggleStealth(ctx, obj, false);
      break;
    default:
      break;
  }
}
