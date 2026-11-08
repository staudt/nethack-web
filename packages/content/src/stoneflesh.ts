// Stone to flesh on objects: boulders become enormous meatballs, statues come to life (or turn
// into meatballs when their monster is not made of flesh), stone rings into meat rings, the marble
// wand into a meat stick, rocks and gems into meatballs. Sits under zap.ts.
// ref: src/zap.c stone_to_flesh_obj(), poly_obj() (the part for a fixed new type)
//
// Not ported: figurines and golems (none exist), the Heart of Ahriman (no artifacts: every object
// resists 2 times in 100), saved monster traits, vegetarian conduct (the smell is always "the odor
// of meat": DEVIATIONS.md "Stone to flesh"), poly_obj()'s random new types (polymorph, 7f-d).
import {
  contents,
  getPlayer,
  inRooms,
  getLevel,
  type Ctx,
  type DefId,
  type Entity,
  type Msg,
} from '@nh/core';
import { BOULDER } from './boulder';
import { costlySpot, eshkOf, inhishop, uShops } from './eshk';
import { placeObject, mksobj } from './items';
import { ringGone } from './jewelry';
import { vegetarian } from './mondata';
import { shopAt } from './revive';
import { billUsedUp, hotPursuit, makeAngryShk, shkname } from './shk';
import { sokobanGuilt } from './sokoban';
import { animateStatue } from './statue';
import { STATUE, setHistoric } from './statuestate';
import { setSwapWep, swapWep } from './wield';

/** ref: include/objects.h MEATBALL, MEAT_STICK, ENORMOUS_MEATBALL, MEAT_RING */
export const MEAT = {
  meatball: 'nh:meatball',
  stick: 'nh:meat_stick',
  enormous: 'nh:enormous_meatball',
  ring: 'nh:meat_ring',
} as const;

const CORPSE: DefId = 'nh:corpse';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/** The shopkeeper's name as a message param. */
function nameOf(ctx: Ctx, shk: number): string {
  const e = eshkOf(ctx, shk);
  return e ? shkname(ctx, e) : '@pronoun.someone';
}

/** Where the object is: the floor, or (in her pack) the hero's square. ref: get_obj_location() */
function objLocation(ctx: Ctx, obj: Entity): { level: string; x: number; y: number } | null {
  if (obj.c.pos) return obj.c.pos;
  const carrier = obj.c.item?.carriedBy;
  if (carrier === undefined || carrier === null) return null;
  return ctx.state.entities[String(carrier)]?.c.pos ?? null;
}

/**
 * The object is replaced by a new one of type `otyp` (mksobj(id, FALSE, FALSE)) where it lies or
 * in the same inventory slot, keeping its quantity (1 for a type that does not merge), BUC, the
 * shopkeeper's (lack of) interest, a statue's monster for a corpse, and a weapon slot; a worn ring
 * comes off first. A shop's goods changed this way anger the shopkeeper; an unpaid object stays
 * on the bill as used up. Breaking up a boulder in Sokoban costs Luck. Returns the new object.
 * ref: src/zap.c poly_obj() with a given `id`
 */
export function polyObjTo(ctx: Ctx, obj: Entity, otyp: DefId): Entity {
  const old = obj.c.item;
  if (!old) return obj;
  if (obj.def === BOULDER) sokobanGuilt(ctx);
  const def = ctx.defs.object(otyp);
  const id = mksobj(ctx, def, {
    init: false,
    ...(otyp === CORPSE ? { corpseOf: old.corpseOf ?? 'nh:newt' } : {}),
  });
  const otmp = ctx.state.entities[String(id)];
  const it = otmp?.c.item;
  if (!otmp || !it) return obj;
  if (old.corpseOf !== undefined && (otyp === CORPSE || otyp === STATUE))
    it.corpseOf = old.corpseOf; // set_corpsenm()
  // preserve quantity; 'n' merged objects may be fused into 1 object
  it.quantity = def.merge ? old.quantity : 1;
  // preserve the shopkeeper's (lack of) interest
  if (old.noCharge) it.noCharge = true;
  it.buc = old.buc;
  const at = objLocation(ctx, obj);
  const hero = getPlayer(ctx.state);
  const carried = old.carriedBy === hero.id;
  // swap otmp for obj (replace_object(): same place in the pile or pack)
  if (old.carriedBy !== null && old.carriedBy !== undefined) {
    const slot = old.equipped;
    // remove_worn_item(): a worn ring comes off; the new form takes a weapon slot
    if (slot === 'ringL' || slot === 'ringR') ringGone(ctx, obj);
    it.carriedBy = old.carriedBy;
    it.letter = old.letter;
    it.placed = old.placed;
    if (slot === 'weapon') it.equipped = 'weapon';
    if (swapWep(ctx)?.id === obj.id) setSwapWep(ctx, otmp.id);
  } else if (old.containedIn !== undefined) {
    it.containedIn = old.containedIn;
    it.placed = old.placed;
  } else if (obj.c.pos) {
    otmp.c.pos = { ...obj.c.pos };
    it.placed = old.placed;
  } else if (at) placeObject(ctx, otmp.id, at.level, at.x, at.y);

  // note: if otmp is gone, billing for it was handled by useup()
  if (at && at.level === ctx.state.currentLevel && (!carried || old.unpaid)) {
    if (costlySpot(ctx, at.x, at.y)) {
      const shkp = shopAt(ctx, at.x, at.y);
      const shkId = shkp?.id;
      if (shkId !== undefined && !old.noCharge && inhishop(ctx, shkId)) {
        if (shkp?.c.monster?.peaceful) {
          const level = getLevel(ctx.state);
          const hp = hero.c.pos;
          const sp = shkp.c.pos;
          const sameRoom =
            !!hp &&
            !!sp &&
            uShops(ctx).length > 0 &&
            inRooms(level, hp.x, hp.y)[0] === inRooms(level, sp.x, sp.y)[0];
          if (sameRoom && hp && !costlySpot(ctx, hp.x, hp.y)) makeAngryShk(ctx, shkId);
          else {
            say(ctx, 'shk.gets_angry', { shk: nameOf(ctx, shkId) });
            hotPursuit(ctx, shkId);
          }
        } else say(ctx, 'shk.is_furious', { shk: nameOf(ctx, shkId) }); // Norep()
      }
    }
  }
  // delobj(obj): an unpaid object stays on the bill as used up
  if (old.unpaid) billUsedUp(ctx, obj);
  setHistoric(ctx, obj.id, false);
  ctx.remove(obj.id);
  return otmp;
}

/**
 * Stone to flesh hits the object (on the floor, or in her pack when she casts it at herself):
 * mineral and gemstone objects turn to meat, 2 times in 100 not. A boulder becomes an enormous
 * meatball; a statue comes to life (animate_statue()), or becomes a meatball when its monster is
 * not made of flesh, or its monster's corpse (its contents dropped) when it could not come to
 * life and the monster leaves a corpse; a ring a meat ring, a wand a meat stick, a rock or gem
 * a meatball. "You smell the odor of meat." Returns 1 when the object was affected.
 * ref: src/zap.c stone_to_flesh_obj()
 */
export function stoneToFleshObj(ctx: Ctx, obj: Entity): number {
  const od = ctx.defs.object(obj.def);
  if (od.material !== 'mineral' && od.material !== 'gemstone') return 0;
  // Heart of Ahriman usually resists; ordinary items rarely do: obj_resists(obj, 2, 98)
  if (ctx.rng.rn2(100) < 2) return 0;
  const at = objLocation(ctx, obj);
  if (!at) return 0;
  let res = 1;
  let smell = false;
  switch (od.class) {
    case 'rock': // boulders and statues (no figurines)
      if (obj.def === BOULDER) {
        polyObjTo(ctx, obj, MEAT.enormous);
        smell = true;
      } else if (obj.def === STATUE) {
        const montype = obj.c.item?.corpseOf;
        const ptr = montype && ctx.defs.isMonster(montype) ? ctx.defs.monster(montype) : null;
        if (ptr && vegetarian(ptr)) {
          // don't animate monsters that aren't flesh
          polyObjTo(ctx, obj, MEAT.meatball);
          smell = true;
          break;
        }
        const { mon } = animateStatue(ctx, obj, at.x, at.y, 'spell');
        if (mon) break;
        if (!ptr || ptr.genFlags.includes('nocorpse') || ptr.genFlags.includes('uniq')) {
          res = 0; // didn't revive but can't leave corpse either
        } else {
          // drop statue's contents (bypass_obj(): this zap does not hit them)
          for (const item of contents(ctx.state, obj.id)) {
            if (!item.c.item) continue;
            delete item.c.item.containedIn;
            placeObject(ctx, item.id, at.level, at.x, at.y);
          }
          polyObjTo(ctx, obj, CORPSE);
        }
      } else res = 0; // miscellaneous tool or unexpected rock...
      break;
    case 'ring': // some of the rings are stone
      polyObjTo(ctx, obj, MEAT.ring);
      smell = true;
      break;
    case 'wand': // marble wand
      polyObjTo(ctx, obj, MEAT.stick);
      smell = true;
      break;
    case 'gem': // stones & gems
      polyObjTo(ctx, obj, MEAT.meatball);
      smell = true;
      break;
    default:
      res = 0;
      break;
  }
  // (non-meat eaters smell meat, meat eaters its flavor: no conduct is kept)
  if (smell) say(ctx, 'zap.stf.smell_meat');
  return res;
}
