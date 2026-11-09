// What the polymorphed hero's new form can no longer wear or wield: a big form breaks out of its
// suit (destroyed), its cloak's clasp breaks open (a mummy wrapping tears apart) and its shirt
// rips; a small, whirly or noncorporeal form lets them fall; horns push a hard helmet off; a
// handless or tiny form drops gloves (and its weapon), shield and helmet; a handless, tiny,
// slithy or centaur form loses its boots; a headless one its blindfold. A form that cannot
// wield drops its weapon ("You find you must drop your dagger!"), a welded one is let go.
// ref: src/polyself.c break_armor(), drop_weapon(), dropp()
//
// Not ported: dragon scales and mail (none exist), the alchemy smock, cancel_don() (armor is on
// at once here), lit armor, two-weapon combat, exercise; dropped items in a shop are not offered
// for sale (no sellobj()).
import { getLevel, getPlayer, type Ctx, type Entity, type Msg } from '@nh/core';
import { cloakName } from './breakarm';
import { dropx, isSword, welded } from './itemactions';
import { removeFromInventory } from './items';
import { blindfOff } from './jewelry';
import {
  breakarm,
  cantwield,
  hasHead,
  isWhirlyDef,
  nohands,
  numHorns,
  slithy,
  sliparm,
  verysmall,
  wrappingAllowed,
} from './mondata';
import { hardHelmet, isFlimsy } from './material';
import { xnameOf } from './objnam';
import { wornIn } from './props';

import { billUsedUp } from './shk';
import { removeWornItem } from './steal';
import { surfaceKey } from './terrain';
import { heroForm } from './upoly';
import { weaponDescr } from './web';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const worn = (ctx: Ctx, slot: string): Entity | null => wornIn(ctx.state, ctx.state.playerId, slot);

/** The worn item comes off and is used up (Armor_gone()/Cloak_off(), useup()). */
function destroyWorn(ctx: Ctx, obj: Entity): void {
  removeWornItem(ctx, obj);
  removeFromInventory(ctx, obj.id);
  billUsedUp(ctx, obj); // obfree(): an unpaid object stays on the bill, used up
  ctx.remove(obj.id);
}

/** The worn item comes off and drops where she stands (..._off(), dropp()). */
function dropWorn(ctx: Ctx, obj: Entity): void {
  removeWornItem(ctx, obj);
  dropx(ctx, obj);
}

/** "helm" for a hard helmet, else "hat". ref: src/objnam.c helm_simple_name() */
const helmName = (ctx: Ctx, obj: Entity): string =>
  hardHelmet(ctx.defs.object(obj.def)) ? '@polyarm.helm' : '@polyarm.hat';

/** "Your helm falls to the floor!" */
function helmFalls(ctx: Ctx, helm: Entity): void {
  const p = getPlayer(ctx.state).c.pos;
  const surface = p ? surfaceKey(ctx, getLevel(ctx.state, p.level), p.x, p.y) : '@surface.floor';
  say(ctx, 'polyarm.helm_falls', { helm: helmName(ctx, helm), surface });
  dropWorn(ctx, helm);
}

/** ref: src/do_wear.c racial_exception(): a hobbit keeps its elven mithril-coat */
const racialException = (formId: string, obj: Entity): boolean =>
  formId === 'nh:hobbit' && obj.def === 'nh:elven_mithril_coat';

/**
 * The hero's new form sheds what it cannot wear (see the header). Rings and the amulet stay on.
 * ref: src/polyself.c break_armor()
 */
export function breakArmor(ctx: Ctx): void {
  const uptr = heroForm(ctx);
  if (!uptr) return;
  let otmp: Entity | null;

  if (breakarm(uptr)) {
    if ((otmp = worn(ctx, 'body'))) {
      say(ctx, 'polyarm.break_out');
      destroyWorn(ctx, otmp);
    }
    // a mummy wrapping adapts to small and very big sizes
    if (
      (otmp = worn(ctx, 'cloak')) &&
      (otmp.def !== 'nh:mummy_wrapping' || !wrappingAllowed(uptr))
    ) {
      if (otmp.def === 'nh:mummy_wrapping') {
        // doesn't have a clasp to break open
        say(ctx, 'polyarm.cloak_tears', { cloak: cloakName(otmp) });
        destroyWorn(ctx, otmp);
      } else {
        say(ctx, 'polyarm.clasp_breaks', { cloak: cloakName(otmp) });
        dropWorn(ctx, otmp);
      }
    }
    if ((otmp = worn(ctx, 'shirt'))) {
      say(ctx, 'polyarm.shirt_rips');
      destroyWorn(ctx, otmp);
    }
  } else if (sliparm(uptr)) {
    if ((otmp = worn(ctx, 'body')) && !racialException(uptr.id, otmp)) {
      say(ctx, 'polyarm.armor_falls');
      dropWorn(ctx, otmp);
    }
    if (
      (otmp = worn(ctx, 'cloak')) &&
      (otmp.def !== 'nh:mummy_wrapping' || !wrappingAllowed(uptr))
    ) {
      say(ctx, isWhirlyDef(uptr) ? 'polyarm.cloak_unsupported' : 'polyarm.shrink_out', {
        cloak: cloakName(otmp),
      });
      dropWorn(ctx, otmp);
    }
    if ((otmp = worn(ctx, 'shirt'))) {
      say(ctx, isWhirlyDef(uptr) ? 'polyarm.seep_through' : 'polyarm.too_small_shirt');
      dropWorn(ctx, otmp);
    }
  }
  const horns = numHorns(uptr);
  if (horns > 0 && (otmp = worn(ctx, 'helm'))) {
    if (isFlimsy(ctx.defs.object(otmp.def))) {
      // future possibilities: this could damage/destroy the helmet
      say(ctx, horns === 1 ? 'polyarm.horn_pierces' : 'polyarm.horns_pierce', {
        item: xnameOf(ctx.state, ctx.defs, otmp),
      });
    } else helmFalls(ctx, otmp);
  }
  if (nohands(uptr) || verysmall(uptr)) {
    if ((otmp = worn(ctx, 'gloves'))) {
      // drop the weapon along with the gloves
      say(ctx, worn(ctx, 'weapon') ? 'polyarm.drop_gloves_weapon' : 'polyarm.drop_gloves');
      dropWeapon(ctx, false);
      dropWorn(ctx, otmp);
    }
    if ((otmp = worn(ctx, 'shield'))) {
      say(ctx, 'polyarm.no_shield');
      dropWorn(ctx, otmp);
    }
    if ((otmp = worn(ctx, 'helm'))) helmFalls(ctx, otmp);
  }
  if (nohands(uptr) || verysmall(uptr) || slithy(uptr) || uptr.glyph.ch === 'C') {
    if ((otmp = worn(ctx, 'boots'))) {
      if (isWhirlyDef(uptr)) say(ctx, 'polyarm.boots_fall_away');
      else say(ctx, verysmall(uptr) ? 'polyarm.boots_slide' : 'polyarm.boots_pushed');
      dropWorn(ctx, otmp);
    }
  }
  // eyewear shouldn't stay worn without a head to wear it on; the amulet stays worn
  if ((otmp = worn(ctx, 'blindfold')) && !hasHead(uptr)) {
    say(ctx, otmp.def === 'nh:lenses' ? 'polyarm.lenses_fall' : 'polyarm.eyewear_falls', {
      eyewear: `@${ctx.defs.object(otmp.def).nameKey}`,
    });
    blindfOff(ctx, otmp, false); // Blindf_off(NULL): no "You were wearing"
    dropx(ctx, otmp);
  }
  // rings stay worn even when no hands
}

/**
 * The form cannot hold its weapon: with `alone` (polymon()), only when it cannot wield ("You find
 * you must drop your dagger!"; a welded one is released and stays in the inventory: "You find you
 * must release your sword!"), and silently with the gloves otherwise. ref: src/polyself.c
 * drop_weapon() (no two-weapon combat)
 */
export function dropWeapon(ctx: Ctx, alone: boolean): void {
  const uwep = worn(ctx, 'weapon');
  if (!uwep) return;
  const form = heroForm(ctx);
  if (alone && !(form && cantwield(form))) return;
  const candropwep = !welded(ctx, uwep); // canletgo(uwep, "")
  if (alone) {
    const def = ctx.defs.object(uwep.def);
    const which = isSword(def) ? '@polyarm.sword' : weaponDescr(ctx, uwep);
    const pl = (uwep.c.item?.quantity ?? 1) !== 1;
    say(ctx, pl ? 'polyarm.must_drop_pl' : 'polyarm.must_drop', {
      what: candropwep ? '@polyarm.drop' : '@polyarm.release',
      whose: which === '@nh:corpse' ? '@polyarm.the' : '@polyarm.your',
      which,
    });
  }
  const it = uwep.c.item;
  if (it) it.equipped = null; // uwepgone()
  if (candropwep) dropx(ctx, uwep);
}
