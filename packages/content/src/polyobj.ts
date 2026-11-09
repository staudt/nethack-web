// Polymorphing objects: poly_obj() (a random object of the same class, or a given type for stone
// to flesh and the polymorph trap's boots), and polypiling's helpers: objects that resist, the
// ones that shudder and are destroyed ("You feel shuddering vibrations."). Sits under zap.ts,
// stoneflesh.ts and polyself.ts.
// ref: src/zap.c poly_obj(), obj_resists(), obj_shudders(), do_osshock(), obj_unpolyable(),
// create_polymon(), zapsetup(), zapwrapup()
//
// Not ported: golems (create_polymon() makes none: no golem exists, DEVIATIONS.md Polymorph),
// eggs, leashes, lamps, markers, potions of oil, poisoned ammo, mail, the Amulet and other
// invocation items (none exist), artifacts (every object resists as an ordinary one), polypile
// conduct.
import {
  contents,
  getLevel,
  getPlayer,
  inRooms,
  type Ctx,
  type DefId,
  type Entity,
  type Msg,
} from '@nh/core';
import { BOULDER } from './boulder';
import { isBoxTrapped, setBoxTrapped } from './btrapstate';
import { isBypassed } from './bypass';
import { costlySpot, eshkOf, inhishop, uShops } from './eshk';
import { mksobj, placeObject, splitStack } from './items';
import { ringGone } from './jewelry';
import { luckOf } from './luck';
import {
  erosionMatters,
  isCorrodeable,
  isCrackable,
  isDamageable,
  isFlammable,
  isRottable,
  isRustprone,
} from './material';
import { mkobj } from './mkobj';
import { shopAt } from './revive';
import { addtobill, billUsedUp, hotPursuit, makeAngryShk, shkname, stolenValue } from './shk';
import { sokobanGuilt } from './sokoban';
import { BLANK_PAPER, MAX_SPELL_STUDY, setStudied, studied } from './spell';
import { STATUE, setHistoric } from './statuestate';
import { rndClass } from './gem';
import { setSwapWep, swapWep } from './wield';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const CORPSE: DefId = 'nh:corpse';
const ROCK: DefId = 'nh:rock';
const WAN_WISHING: DefId = 'nh:wand_of_wishing';
const WAN_POLYMORPH: DefId = 'nh:wand_of_polymorph';
const POT_POLYMORPH: DefId = 'nh:potion_of_polymorph';
const SPE_POLYMORPH: DefId = 'nh:spellbook_of_polymorph';
const AMULET_OF_UNCHANGING: DefId = 'nh:amulet_of_unchanging';

/** The shopkeeper's name as a message param. */
function nameOf(ctx: Ctx, shk: number): string {
  const e = eshkOf(ctx, shk);
  return e ? shkname(ctx, e) : '@pronoun.someone';
}

/** Where the object is: the floor, or (in an inventory) its carrier's square. ref: get_obj_location() */
export function objLocation(ctx: Ctx, obj: Entity): { level: string; x: number; y: number } | null {
  if (obj.c.pos) return obj.c.pos;
  const carrier = obj.c.item?.carriedBy;
  if (carrier === undefined || carrier === null) return null;
  return ctx.state.entities[String(carrier)]?.c.pos ?? null;
}

/** ref: src/zap.c charged_objs[]: classes whose charge count carries over */
const CHARGED: readonly string[] = ['wand', 'weapon', 'armor'];

/** The object types of `cls` in objects.h order, up to and including `last`. ref: rnd_class() ranges */
function classRange(ctx: Ctx, cls: string, last: DefId | null = null): DefId[] {
  const all = ctx.defs.objects.filter((o) => o.class === cls).map((o) => o.id);
  const i = last === null ? -1 : all.indexOf(last);
  return i < 0 ? all : all.slice(0, i + 1);
}

/** A new random object of the class, made with mkobj(oclass, FALSE), or null. */
function mkobjOfClass(ctx: Ctx, obj: Entity): Entity | null {
  const od = ctx.defs.object(obj.def);
  // try up to 3 times to make the magic-or-not status of the new item the same as the old item
  const magic = od.magic;
  let otmp: Entity | null = null;
  let tryLimit = 3;
  do {
    if (otmp) ctx.remove(otmp.id);
    const id = mkobj(ctx, od.class, { artif: false });
    otmp = id === null ? null : (ctx.state.entities[String(id)] ?? null);
  } while (--tryLimit > 0 && otmp && ctx.defs.object(otmp.def).magic !== magic);
  return otmp;
}

/**
 * The object is replaced by a new one where it lies, in the same inventory slot or container: a
 * random object of its class (`id` null, the magic-or-not status kept if 3 tries allow it), or
 * of type `id` (a corpse or statue keeps its monster). The new object keeps the quantity (a type
 * that does not merge, or 1 time in 1000 per item for a random one, fuses them into 1), BUC,
 * charges of wands, weapons and armor, the recharge count, erosion where it matters, a box's
 * trap and the shopkeeper's (lack of) interest; it loses any contents. A wand never becomes a
 * wand of wishing or polymorph and degrades (`recharged`), a potion or spellbook never one of
 * polymorph, a spellbook counts one more reading (more than 3: blank paper), mineral gems
 * turning into non-minerals may backfire into half as many rocks. Worn or wielded, it stays in
 * the slot it fits (a worn ring comes off first). A shop's goods changed this way anger the
 * shopkeeper; an unpaid object stays on the bill as used up. A boulder costs Luck in Sokoban.
 * Returns the new object. ref: src/zap.c poly_obj()
 */
export function polyObj(ctx: Ctx, obj: Entity, id: DefId | null): Entity {
  const old = obj.c.item;
  if (!old) return obj;
  if (obj.def === BOULDER) sokobanGuilt(ctx);
  const canMerge = id === null;
  let otmp: Entity | null;
  if (id === null) otmp = mkobjOfClass(ctx, obj);
  else {
    // literally replace obj with this new thing
    const nid = mksobj(ctx, ctx.defs.object(id), {
      init: false,
      ...(id === CORPSE ? { corpseOf: old.corpseOf ?? 'nh:newt' } : {}),
    });
    otmp = ctx.state.entities[String(nid)] ?? null;
    const it = otmp?.c.item;
    const usesCorpsenm = (t: DefId): boolean => t === CORPSE || t === STATUE;
    if (it && old.corpseOf !== undefined && usesCorpsenm(obj.def) && usesCorpsenm(id))
      it.corpseOf = old.corpseOf; // set_corpsenm()
  }
  const it = otmp?.c.item;
  if (!otmp || !it) return obj;

  // preserve quantity; preserve the shopkeeper's (lack of) interest
  it.quantity = old.quantity;
  if (old.noCharge) it.noCharge = true;
  else delete it.noCharge;
  // keep special fields (including charges on wands)
  if (CHARGED.includes(ctx.defs.object(otmp.def).class)) it.spe = old.spe;
  if (old.recharged !== undefined) it.recharged = old.recharged;
  else delete it.recharged;
  it.buc = old.buc;
  const nd = ctx.defs.object(otmp.def);
  if (erosionMatters(nd)) {
    const e1 = isFlammable(nd) || isRustprone(nd) || isCrackable(nd);
    const e2 = isCorrodeable(nd) || isRottable(nd);
    if (e1 || e2) {
      const oe = old.erosion ?? { e1: 0, e2: 0 };
      const ne = it.erosion ?? { e1: 0, e2: 0 };
      const next = { e1: e1 ? oe.e1 : ne.e1, e2: e2 ? oe.e2 : ne.e2 };
      if (next.e1 || next.e2) it.erosion = next;
      else delete it.erosion;
    }
    if (isDamageable(nd)) {
      if (old.erodeproof) it.erodeproof = true;
      else delete it.erodeproof;
    }
  }
  // keep chest/box traps if we may
  if (isBoxTrapped(ctx.state, obj.id) && nd.container?.box === true)
    setBoxTrapped(ctx, otmp.id, true);
  // (a crocodile corpse would turn into low boots: no low boots exist)
  // no box contents --KAA
  for (const o of contents(ctx.state, otmp.id)) ctx.remove(o.id);

  // 'n' merged objects may be fused into 1 object
  if (it.quantity > 1 && (!nd.merge || (canMerge && it.quantity > ctx.rng.rn2(1000))))
    it.quantity = 1;

  switch (nd.class) {
    case 'wand': {
      const wands = classRange(ctx, 'wand');
      while (otmp.def === WAN_WISHING || otmp.def === WAN_POLYMORPH)
        otmp.def = rndClass(ctx.rng, ctx.defs, wands, 0);
      // altering the object tends to degrade its quality
      if ((it.recharged ?? 0) < ctx.rng.rn2(7)) it.recharged = (it.recharged ?? 0) + 1;
      break;
    }
    case 'potion': {
      const potions = classRange(ctx, 'potion');
      while (otmp.def === POT_POLYMORPH) otmp.def = rndClass(ctx.rng, ctx.defs, potions, 0);
      break;
    }
    case 'spellbook': {
      const books = classRange(ctx, 'spellbook', BLANK_PAPER);
      while (otmp.def === SPE_POLYMORPH) otmp.def = rndClass(ctx.rng, ctx.defs, books, 0);
      // reduce spellbook abuse; non-blank books degrade
      if (otmp.def !== BLANK_PAPER && otmp.def !== 'nh:spellbook_of_novel') {
        const n = studied(ctx, obj.id) + 1;
        if (n > MAX_SPELL_STUDY) {
          otmp.def = BLANK_PAPER;
          setStudied(ctx, otmp.id, ctx.rng.rn2(n));
        } else setStudied(ctx, otmp.id, n);
      }
      break;
    }
    case 'gem': {
      const om = ctx.defs.object(obj.def).material;
      if (
        it.quantity > ctx.rng.rnd(4) &&
        om === 'mineral' &&
        ctx.defs.object(otmp.def).material !== 'mineral'
      ) {
        otmp.def = ROCK; // transmutation backfired
        it.quantity = Math.trunc(it.quantity / 2); // some material has been lost
      }
      break;
    }
    default:
      break;
  }

  const at = objLocation(ctx, obj);
  const hero = getPlayer(ctx.state);
  const carried = old.carriedBy === hero.id;
  // swap otmp for obj (replace_object(): same place in the pile, pack or container)
  if (old.carriedBy !== null && old.carriedBy !== undefined) {
    const slot = old.equipped;
    // remove_worn_item(): a worn ring comes off; the new form takes the slot it fits
    if (carried && (slot === 'ringL' || slot === 'ringR')) ringGone(ctx, obj);
    it.carriedBy = old.carriedBy;
    it.letter = old.letter;
    it.placed = old.placed;
    if (slot === 'weapon') it.equipped = 'weapon';
    else if (slot && ctx.defs.object(otmp.def).armor?.slot === slot) it.equipped = slot;
    if (carried && swapWep(ctx)?.id === obj.id) setSwapWep(ctx, otmp.id);
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
 * Whether the object resists: `ochance` percent of the time (no artifacts or invocation items
 * exist, so `achance` never applies). ref: src/zap.c obj_resists()
 */
export function objResists(ctx: Pick<Ctx, 'rng'>, ochance: number): boolean {
  return ctx.rng.rn2(100) < ochance;
}

/**
 * The object resists polymorph: the wand, potion and spellbook of polymorph and the amulet of
 * unchanging always, anything else 5 times in 100. ref: src/zap.c obj_unpolyable(), unpolyable()
 */
export function objUnpolyable(ctx: Ctx, obj: Entity): boolean {
  return (
    obj.def === WAN_POLYMORPH ||
    obj.def === SPE_POLYMORPH ||
    obj.def === POT_POLYMORPH ||
    obj.def === AMULET_OF_UNCHANGING ||
    objResists(ctx, 5)
  );
}

/**
 * Polypiling destroys the object instead: a wand or a cursed object 1 time in 3, a blessed one
 * 1 in 12, others 1 in 8; the odds halve for more than 4 of them. ref: src/zap.c obj_shudders()
 */
export function objShudders(ctx: Ctx, obj: Entity): boolean {
  if (isBypassed(obj.id)) return false;
  const it = obj.c.item;
  let zapOdds: number;
  if (ctx.defs.object(obj.def).class === 'wand') zapOdds = 3;
  else if (it?.buc === 'cursed') zapOdds = 3;
  else if (it?.buc === 'blessed') zapOdds = 12;
  else zapOdds = 8;
  // adjust for "large" quantities of identical things
  if ((it?.quantity ?? 1) > 4) zapOdds = Math.trunc(zapOdds / 2);
  return !ctx.rng.rn2(zapOdds);
}

/** go.obj_zapped: an object shuddered during this zap. */
let objZapped = false;

/** A zap or breaking wand starts. ref: src/zap.c zapsetup() */
export function zapsetup(): void {
  objZapped = false;
}

/** It ends: "You feel shuddering vibrations." when an object shuddered. ref: src/zap.c zapwrapup() */
export function zapwrapup(ctx: Ctx): void {
  if (objZapped) say(ctx, 'polyobj.shuddering');
  objZapped = false;
}

/**
 * The shuddering object on the floor at (x, y) is destroyed: with more than one, `rnd(n - 1)` of
 * them (the rest survive intact); a shop's goods are billed or owed. With `metamorph` each of
 * them may (1 in Luck + 45) make the pile meld into a monster: the material is returned for
 * create_polymon(), else null. ref: src/zap.c do_osshock()
 */
export function doOsshock(
  ctx: Ctx,
  obj: Entity,
  x: number,
  y: number,
  metamorph: boolean,
): string | null {
  const it = obj.c.item;
  if (!it) return null;
  objZapped = true;
  let material: string | null = null;
  if (metamorph) {
    // some may metamorphose
    for (let i = it.quantity; i; i--)
      if (!ctx.rng.rn2(luckOf(ctx.state) + 45)) {
        material = ctx.defs.object(obj.def).material;
        break;
      }
  }
  // if quan > 1 then some will survive intact
  let victim: Entity = obj;
  if (it.quantity > 1) {
    const part = splitStack(ctx, obj.id, ctx.rng.rnd(it.quantity - 1));
    victim = ctx.state.entities[String(part)] ?? obj;
  }
  // appropriately add damage to bill
  if (costlySpot(ctx, x, y)) {
    if (uShops(ctx).length > 0) addtobill(ctx, victim, false, false, false);
    else stolenValue(ctx, victim, x, y, false, false);
  }
  // zap the object
  ctx.remove(victim.id);
  return material;
}

/** ref: src/zap.c create_polymon(): the golem a material melds into */
function golemFor(ctx: Ctx, material: string): DefId {
  switch (material) {
    case 'iron':
    case 'metal':
    case 'mithril':
      return 'nh:iron_golem';
    case 'copper':
    case 'silver':
    case 'platinum':
    case 'gemstone':
    case 'mineral':
      return ctx.rng.rn2(2) ? 'nh:stone_golem' : 'nh:clay_golem';
    case 'flesh':
      return 'nh:flesh_golem';
    case 'wood':
      return 'nh:wood_golem';
    case 'leather':
      return 'nh:leather_golem';
    case 'cloth':
      return 'nh:rope_golem';
    case 'bone':
      return 'nh:skeleton'; // nearest thing to "bone golem"
    case 'gold':
      return 'nh:gold_golem';
    case 'glass':
      return 'nh:glass_golem';
    case 'paper':
      return 'nh:paper_golem';
    default:
      return 'nh:straw_golem'; // if all else fails...
  }
}

/**
 * Polypiling melds some of the pile at (x, y) into a golem of the shuddered material: none when
 * the pile is a single object. No golem exists yet, so nothing is made (the golem roll is still
 * made). ref: src/zap.c create_polymon()
 */
export function createPolymon(ctx: Ctx, pile: readonly Entity[], material: string): void {
  // bypassed objects are skipped (they end up on top of their pile)
  const left = pile.filter((o) => ctx.state.entities[String(o.id)] && !isBypassed(o.id));
  // no golems if you zap only one object -- not enough stuff
  if (left.length === 0 || (left.length === 1 && (left[0]?.c.item?.quantity ?? 1) === 1)) return;
  const pm = golemFor(ctx, material);
  if (!ctx.defs.isMonster(pm)) return; // DEVIATIONS.md Polymorph: no golems
}
