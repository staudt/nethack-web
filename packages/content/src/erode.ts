// Erosion (rust, corrosion, burning, rot) and elemental item destruction (burning scrolls,
// boiling and freezing potions, shocked rings and wands).
// ref: src/trap.c erode_obj(), acid_damage(); src/uhitm.c erode_armor(), passive_obj();
// src/mhitm.c rustm(); src/zap.c destroy_items(), maybe_destroy_item(), destroyable(),
// inventory_resistance_check(); include/objclass.h, src/mkobj.c is_flammable(), is_rottable()
//
// Not ported: grease (nothing can be greased yet, so EF_GREASE never protects), shop costs
// (EF_PAY), potionbreathe() for boiled potions,
// recharge() for shocked charged rings, the levitation-ring deferral, artifacts.
import {
  getPlayer,
  inventoryOf,
  isVisible,
  rnl,
  type Ctx,
  type Entity,
  type EntityId,
  type ErosionLevel,
  type Msg,
  type ObjectDef,
} from '@nh/core';
import { losehp } from './hp';
import {
  erosionMatters,
  isCorrodeable,
  isCrackable,
  isFlammable,
  isMetallic,
  isRottable,
  isRustprone,
} from './material';
import { removeFromInventory, rknown, setRknown } from './items';
import { luckOf } from './luck';
import { minvent, whichArmor } from './mongear';
import { xnameOf } from './objnam';
import { canSpotMon, monNam } from './perception';
import { P, hasProp } from './props';
import { ringGone } from './jewelry';
import { armorOff, isArmorSlot } from './dowear';
import { updateMonInvis } from './invis';
import { CHARGED_RINGS } from './objects';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

// ---------------------------------------------------------------------------------------------
// erode_obj

/** ref: include/hack.h ERODE_* */
export type ErodeType = 'burn' | 'rust' | 'rot' | 'corrode' | 'crack';
/** ref: include/hack.h ER_* */
export type ErodeResult = 'nothing' | 'greased' | 'damaged' | 'destroyed';
/** ref: include/hack.h EF_* (EF_GREASE and EF_PAY have no effect: no grease, no shops) */
export interface ErodeFlags {
  verbose?: boolean;
  destroy?: boolean;
}

const plural = (item: Entity): boolean => (item.c.item?.quantity ?? 1) !== 1;

/** The hero (or null) and monster carrying the item. */
function carrierOf(ctx: Ctx, item: Entity): Entity | null {
  const by = item.c.item?.carriedBy ?? null;
  return by === null ? null : (ctx.state.entities[String(by)] ?? null);
}

/** The item's "whose" phrase: "Your x", "The x" (seen on the floor), "The newt's x". */
function subject(ctx: Ctx, victim: Entity | null, vismon: boolean, item: Msg, cap: boolean): Msg {
  const c = cap ? 'cap' : 'low';
  if (victim && victim.id === ctx.state.playerId)
    return { key: `erode.subj.you.${c}`, params: { item } };
  if (vismon && victim)
    return { key: `erode.subj.mon.${c}`, params: { item, mon: monNam(ctx, victim) } };
  return { key: `erode.subj.the.${c}`, params: { item } };
}

/**
 * Erodes `obj` by one level of `type` (rust and burning raise `e1`, corrosion and rot `e2`),
 * with the messages for the hero's, a seen monster's or a seen floor object. `ostr` replaces
 * the item's name (xname()). An erodeproof item resists (and the hero learns it), a blessed one
 * resists one time in four (luck-adjusted); at the maximum level the item is destroyed only
 * with `flags.destroy`.
 * ref: src/trap.c erode_obj(). The floor-object check uses the object's own cell for
 * `bhitpos`. Not ported: grease, shop costs, crystal armor feedback for crysknives.
 */
export function erodeObj(
  ctx: Ctx,
  obj: Entity,
  ostr: Msg | null,
  type: ErodeType,
  flags: ErodeFlags = {},
): ErodeResult {
  const it = obj.c.item;
  if (!it) return 'nothing';
  const def = ctx.defs.object(obj.def);
  const victim = carrierOf(ctx, obj);
  const uvictim = victim !== null && victim.id === ctx.state.playerId;
  const vismon = victim !== null && !uvictim && canSpotMon(ctx, victim);
  const pos = obj.c.pos;
  const level = pos ? ctx.state.levels[pos.level] : undefined;
  const visobj =
    victim === null &&
    pos !== undefined &&
    level !== undefined &&
    pos.level === ctx.state.currentLevel &&
    isVisible(ctx.state, pos.y * level.width + pos.x);
  const print = flags.verbose === true;

  let vulnerable: boolean;
  let isPrimary = true;
  switch (type) {
    case 'burn':
      if (uvictim && inventoryResistanceCheck(ctx, 'fire')) return 'nothing';
      vulnerable = isFlammable(def);
      break;
    case 'rust':
      vulnerable = isRustprone(def);
      break;
    case 'rot':
      vulnerable = isRottable(def);
      isPrimary = false;
      break;
    case 'corrode':
      if (uvictim && inventoryResistanceCheck(ctx, 'acid')) return 'nothing';
      vulnerable = isCorrodeable(def);
      isPrimary = false;
      break;
    case 'crack':
      vulnerable = isCrackable(def);
      break;
  }
  const erosion = isPrimary ? (it.erosion?.e1 ?? 0) : (it.erosion?.e2 ?? 0);
  const name = ostr ?? xnameOf(ctx.state, ctx.defs, obj);
  const pl = plural(obj) ? '_pl' : '';

  if (!erosionMatters(def)) return 'nothing';
  if (!vulnerable || (it.erodeproof && rknown(ctx.state, obj.id))) {
    if (print && (uvictim || vismon))
      say(ctx, `erode.not_affected${pl}`, {
        subj: subject(ctx, victim, vismon, name, true),
        by: { key: `erode.by.${type}` },
      });
    return 'nothing';
  }
  if (it.erodeproof || (it.buc === 'blessed' && rnl(ctx.rng, 4, luckOf(ctx.state)) === 0)) {
    if ((print || it.erodeproof) && (uvictim || vismon || visobj))
      say(ctx, `erode.somehow${pl}`, {
        subj: subject(ctx, victim, vismon, name, false),
        by: { key: `erode.by.${type}` },
      });
    // a blessed item shows some wear; an erodeproof one is now known to be
    if (it.erodeproof) setRknown(ctx, obj.id, true);
    return 'nothing';
  }
  if (erosion < 3) {
    if (uvictim || vismon || visobj)
      say(ctx, 'erode.erodes', {
        subj: subject(ctx, victim, vismon, name, true),
        verb: { key: `erode.verb.${type}${pl}` },
        adv:
          erosion + 1 === 3
            ? { key: 'erode.adv.completely' }
            : erosion
              ? { key: 'erode.adv.further' }
              : '',
      });
    const e = (it.erosion ??= { e1: 0, e2: 0 });
    if (isPrimary) e.e1 = (e.e1 + 1) as ErosionLevel;
    else e.e2 = (e.e2 + 1) as ErosionLevel;
    return 'damaged';
  }
  if (flags.destroy) {
    if (uvictim || vismon || visobj)
      say(ctx, type === 'crack' ? 'erode.shatters' : 'erode.away', {
        subj: subject(ctx, victim, vismon, name, true),
        verb: { key: `erode.verb.${type}${pl}` },
      });
    const wasWorn = it.equipped;
    it.equipped = null; // remove_worn_item() / extract_from_minvent()
    // Cloak_off() / update_mon_extrinsics(): only invisibility has on/off effects here
    if (wasWorn && wasWorn !== 'weapon') {
      if (uvictim) {
        if (isArmorSlot(wasWorn)) armorOff(ctx, obj, wasWorn);
      } else if (victim) updateMonInvis(ctx, victim, obj, false);
    }
    if (uvictim) removeFromInventory(ctx, obj.id);
    ctx.remove(obj.id); // delobj()
    setRknown(ctx, obj.id, false);
    return 'destroyed';
  }
  if (print && (uvictim || vismon || visobj)) {
    const blind = uvictim && hasProp(getPlayer(ctx.state), P.BLINDED);
    say(ctx, `erode.completely${pl}`, {
      subj: subject(ctx, victim, vismon, name, true),
      look: { key: blind ? `erode.feel${pl}` : `erode.look${pl}` },
      what: { key: `erode.done.${type}` },
    });
  }
  return 'nothing';
}

/**
 * Erodes a random piece of the victim's armor; the body (cloak, else suit, else shirt) is
 * always a target, other slots only if worn and erodible, so the loop always ends. Returns true
 * when the body was the target, which is burnarmor()'s "body hit" result.
 * ref: src/uhitm.c erode_armor(), src/trap.c burnarmor()
 */
export function erodeArmor(ctx: Ctx, victimId: EntityId, hurt: ErodeType): boolean {
  const worn = (slot: 'helm' | 'cloak' | 'body' | 'shirt' | 'shield' | 'gloves' | 'boots') =>
    whichArmor(ctx, victimId, slot);
  const tryOne = (target: Entity | null): boolean =>
    target !== null &&
    erodeObj(ctx, target, xnameOf(ctx.state, ctx.defs, target), hurt) !== 'nothing';
  for (;;) {
    switch (ctx.rng.rn2(5)) {
      case 0:
        if (!tryOne(worn('helm'))) continue;
        return false;
      case 1: {
        const target = worn('cloak') ?? worn('body') ?? worn('shirt');
        if (target)
          erodeObj(ctx, target, xnameOf(ctx.state, ctx.defs, target), hurt, { verbose: true });
        return true;
      }
      case 2:
        if (!tryOne(worn('shield'))) continue;
        return false;
      case 3:
        if (!tryOne(worn('gloves'))) continue;
        return false;
      default:
        if (!tryOne(worn('boots'))) continue;
        return false;
    }
  }
}

/**
 * Acid splashes an object: scrolls would fade to blank paper (no such scroll yet), anything
 * else corrodes. ref: src/trap.c acid_damage()
 */
export function acidDamage(ctx: Ctx, obj: Entity | null): void {
  if (!obj?.c.item) return;
  const victim = carrierOf(ctx, obj);
  if (victim?.id === ctx.state.playerId && inventoryResistanceCheck(ctx, 'acid')) return;
  // SCROLL_CLASS: becomes SCR_BLANK_PAPER, which this port does not have; our callers only pass
  // wielded weapons, so the branch cannot be reached.
  if (ctx.defs.object(obj.def).class === 'scroll') return;
  erodeObj(ctx, obj, null, 'corrode', { verbose: true });
}

/**
 * A monster's weapon hits a monster whose attacks corrode, rust or burn it.
 * ref: src/mhitm.c rustm() (dmgtype() looks at all of the defender's attacks)
 */
export function rustm(ctx: Ctx, mdef: Entity, obj: Entity | null): void {
  if (!obj) return;
  const pd = ctx.defs.monster(mdef.def);
  const has = (ad: string): boolean => pd.attacks.some((a) => a.ad === ad);
  let type: ErodeType | null = null;
  let chance = 1;
  if (has('corr')) type = 'corrode';
  else if (has('rust')) type = 'rust';
  else if (has('fire') && pd.id !== 'nh:steam_vortex') {
    type = 'burn';
    chance = 6;
  }
  if (type !== null && ctx.rng.rn2(chance) === 0) erodeObj(ctx, obj, null, type, { verbose: true });
}

/**
 * The monster's passive attack damages the object that hit it (the hero's weapon).
 * `mcan`: the monster is cancelled. ref: src/uhitm.c passive_obj() (no rust, corrosion or
 * disenchanting monsters in the roster, but their cases are kept)
 */
export function passiveObj(ctx: Ctx, monDef: string, obj: Entity, mcan: boolean): void {
  const pd = ctx.defs.monster(monDef as Entity['def']);
  const atk = pd.attacks.find((a) => a.at === 'passive');
  if (!atk) return;
  switch (atk.ad) {
    case 'fire':
      if (ctx.rng.rn2(6) === 0 && !mcan && pd.id !== 'nh:steam_vortex')
        erodeObj(ctx, obj, null, 'burn');
      break;
    case 'acid':
      if (ctx.rng.rn2(6) === 0) erodeObj(ctx, obj, null, 'corrode');
      break;
    case 'rust':
      if (!mcan) erodeObj(ctx, obj, null, 'rust');
      break;
    case 'corr':
      if (!mcan) erodeObj(ctx, obj, null, 'corrode');
      break;
    default:
      break; // AD_ENCH (drain_item()): adtyping.ts drainItem(), called by passive()/passivemm()
  }
}

// ---------------------------------------------------------------------------------------------
// destroy_items

/** The elemental damage types that destroy items. */
export type DestroyType = 'fire' | 'cold' | 'elec';

const AD_PROP: Record<DestroyType | 'acid', string> = {
  fire: P.FIRE_RES,
  cold: P.COLD_RES,
  elec: P.SHOCK_RES,
  acid: P.ACID_RES,
};

/**
 * The hero's chance (percent) that a worn item protects her inventory from the damage type:
 * 99 for an equipped item conferring the resistance, 90 for a worn dwarvish cloak against fire
 * and cold. ref: src/zap.c u_adtyp_resistance_obj()
 */
function uAdtypResistanceObj(ctx: Ctx, ad: DestroyType | 'acid'): number {
  const prop = AD_PROP[ad];
  for (const o of inventoryOf(ctx.state, ctx.state.playerId)) {
    if (o.c.item?.equipped && ctx.defs.object(o.def).prop === prop) return 99;
  }
  const cloak = whichArmor(ctx, ctx.state.playerId, 'cloak');
  if (cloak?.def === 'nh:dwarvish_cloak' && (ad === 'cold' || ad === 'fire')) return 90;
  return 0;
}

/** ref: src/zap.c inventory_resistance_check() */
export function inventoryResistanceCheck(ctx: Ctx, ad: DestroyType | 'acid'): boolean {
  const prob = uAdtypResistanceObj(ctx, ad);
  if (!prob) return false;
  return ctx.rng.rn2(100) < prob;
}

/** ref: src/zap.c destroyable() (no artifacts, nothing is in use) */
function destroyable(def: ObjectDef, ad: DestroyType): boolean {
  switch (ad) {
    case 'fire':
      if (def.id === 'nh:scroll_of_fire' || def.id === 'nh:spellbook_of_fireball') return false;
      return def.class === 'potion' || def.class === 'scroll' || def.class === 'spellbook';
    case 'cold':
      return def.class === 'potion' && def.id !== 'nh:potion_of_oil';
    case 'elec':
      if (def.class !== 'ring' && def.class !== 'wand') return false;
      return def.id !== 'nh:ring_of_shock_resistance' && def.id !== 'nh:wand_of_lightning';
  }
}

/** ref: src/zap.c destroy_strings[] indexes */
const DSTR = ['freeze', 'boil', 'oil', 'scroll', 'book', 'ring', 'wand'] as const;

/** Uses up one of the hero's or a monster's stack. ref: src/invent.c useup(), m_useup() */
function useOne(ctx: Ctx, carrier: EntityId, obj: Entity): void {
  const it = obj.c.item;
  if (!it) return;
  if (it.quantity > 1) {
    it.quantity--;
    return;
  }
  if (carrier === ctx.state.playerId) removeFromInventory(ctx, obj.id);
  ctx.remove(obj.id);
  setRknown(ctx, obj.id, false);
}

/**
 * One stack picked by destroy_items(): each item of it goes with a 1-in-3 chance; the hero
 * takes the damage (and may die), a monster's damage is returned.
 * ref: src/zap.c maybe_destroy_item()
 */
function maybeDestroyItem(ctx: Ctx, carrier: Entity, obj: Entity, ad: DestroyType): number {
  const uCarry = carrier.id === ctx.state.playerId;
  const vis = !uCarry && canSpotMon(ctx, carrier);
  const def = ctx.defs.object(obj.def);
  const it = obj.c.item;
  if (!it) return 0;
  if (uCarry && inventoryResistanceCheck(ctx, ad)) return 0;
  const hero = getPlayer(ctx.state);
  // Fire_resistance / resists_fire(carrier), Shock_resistance / resists_elec(carrier)
  const resists = (prop: string, mr: string): boolean =>
    uCarry ? hasProp(hero, prop) : ctx.defs.monster(carrier.def).resists.includes(mr);
  let xresist = false;
  let skip = false;
  let chargeit = false;
  let dmg = 0;
  let dindx = 0;
  const quan = it.quantity;
  switch (ad) {
    case 'cold':
      dindx = 0;
      dmg = ctx.rng.rnd(4);
      break;
    case 'fire':
      xresist = def.class !== 'potion' && resists(P.FIRE_RES, 'fire');
      if (def.id === 'nh:book_of_the_dead') {
        // "The Book of the Dead glows a strange dark red, but remains intact." (not in our data)
        skip = true;
        break;
      }
      if (def.class === 'potion') {
        dindx = def.id !== 'nh:potion_of_oil' ? 1 : 2;
        dmg = ctx.rng.rnd(6);
      } else if (def.class === 'scroll') {
        dindx = 3;
        dmg = 1;
      } else if (def.class === 'spellbook') {
        dindx = 4;
        dmg = 1;
      }
      break;
    case 'elec':
      xresist = def.class !== 'ring' && resists(P.SHOCK_RES, 'elec');
      if (def.class === 'ring') {
        // C tests the hero's gloves (uarmg) even for a monster's ring
        const uarmg = whichArmor(ctx, ctx.state.playerId, 'gloves');
        const worn = it.equipped === 'ringL' || it.equipped === 'ringR';
        if (
          (worn && uarmg && !isMetallic(ctx.defs.object(uarmg.def))) ||
          def.id === 'nh:ring_of_shock_resistance'
        ) {
          skip = true;
          break;
        } else if (CHARGED_RINGS.has(def.id) && ctx.rng.rn2(3) !== 0) {
          chargeit = true;
          break;
        }
        dindx = 5;
        dmg = 0;
      } else if (def.class === 'wand') {
        dindx = 6;
        dmg = ctx.rng.rnd(10);
      }
      break;
  }
  if (chargeit) {
    // recharge(obj, 0) for the hero's ring: not ported yet
    return dmg;
  }
  if (skip) return dmg;
  let cnt = 0;
  for (let i = 0; i < quan; i++) if (ctx.rng.rn2(3) === 0) cnt++;
  if (!cnt) return 0;
  if (uCarry || vis) {
    const mult =
      cnt === 1
        ? quan === 1
          ? '1of1'
          : '1ofN'
        : cnt < quan
          ? 'some'
          : quan === 2
            ? 'both'
            : 'all';
    const name = DSTR[dindx] ?? 'boil';
    say(ctx, 'destroy.items', {
      mult: { key: `destroy.mult.${mult}.${uCarry ? 'you' : 'mon'}` },
      item: xnameOf(ctx.state, ctx.defs, obj),
      what: { key: `destroy.${name}${cnt > 1 ? '_pl' : ''}` },
    });
  }
  // potionbreathe() of a boiled potion: not ported
  if (uCarry && it.equipped) {
    if (it.equipped === 'ringL' || it.equipped === 'ringR') ringGone(ctx, obj);
    else it.equipped = null; // setnotworn()
  }
  for (let i = 0; i < cnt; i++) useOne(ctx, carrier.id, obj);
  if (dmg) {
    if (!uCarry) return xresist ? 0 : dmg;
    if (xresist) say(ctx, 'destroy.not_hurt');
    else {
      const name = DSTR[dindx] ?? 'boil';
      losehp(ctx, dmg, `@killer.destroy.${name}${cnt === 1 ? '' : '_pl'}`);
    }
  }
  return dmg;
}

/** ref: src/zap.c DMG_DESTROY_SCALE, MAX_ITEMS_DESTROYED */
const DMG_DESTROY_SCALE = 5;
const MAX_ITEMS_DESTROYED = 20;

/**
 * Fire, cold or lightning damages the items the hero or a monster carries: up to `dmgIn / 5`
 * stacks (rounded up at random) are picked by reservoir sampling over the inventory, then each
 * loses items one in three. Returns the damage the destroyed items do to a monster (the hero
 * takes hers directly; check `ctx.state.gameOver` afterwards).
 * ref: src/zap.c destroy_items()
 */
export function destroyItems(ctx: Ctx, monId: EntityId, ad: DestroyType, dmgIn: number): number {
  const mon = ctx.state.entities[String(monId)];
  if (!mon) return 0;
  const uCarry = monId === ctx.state.playerId;
  let limit = Math.trunc(dmgIn / DMG_DESTROY_SCALE);
  if (dmgIn % DMG_DESTROY_SCALE > ctx.rng.rn2(DMG_DESTROY_SCALE)) limit++;
  if (limit > MAX_ITEMS_DESTROYED) limit = MAX_ITEMS_DESTROYED;
  if (limit < 1) return 0;
  const chain = uCarry ? inventoryOf(ctx.state, monId) : minvent(ctx, monId);
  const picked: (Entity | undefined)[] = [];
  let elig = 0;
  for (const obj of chain) {
    if (!destroyable(ctx.defs.object(obj.def), ad)) continue;
    const i = elig < limit ? elig : ctx.rng.rn2(elig);
    elig++;
    if (i < 0 || i >= limit) continue;
    picked[i] = obj;
  }
  if (elig > limit) elig = limit;
  let dmgOut = 0;
  for (let i = 0; i < elig; i++) {
    const obj = picked[i];
    if (!obj || !ctx.state.entities[String(obj.id)]) continue;
    if (obj.c.item?.carriedBy !== monId) continue;
    dmgOut += maybeDestroyItem(ctx, mon, obj, ad);
    if (ctx.state.gameOver) break;
  }
  return dmgOut;
}
