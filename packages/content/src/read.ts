// Scrolls: reading and the effects of the scrolls in our subset.
// The scrolls of destroy armor, confuse monster, scare monster, create monster, taming, amnesia,
// fire and charging are in seffect.ts, genocide in genocide.ts.
// ref: src/read.c doread(), seffects(), seffect_identify(), seffect_enchant_weapon(),
// seffect_enchant_armor(), seffect_remove_curse(), seffect_light(), seffect_earth(),
// seffect_blank_paper(), seffect_teleportation(), litroom(), drop_boulder_on_player(), drop_boulder_on_monster();
// seffect_genocide(); src/wield.c chwepon(); src/invent.c identify_pack(), menu_identify()
import { EGG, learnEggType } from './eggstate';
import {
  doMapping,
  foodDetect,
  goldDetect,
  revealSecretDoors,
  trapDetect,
  type Detector,
} from './detectobj';
import { adjAbon } from './dowear';
import {
  NORMAL_SPEED,
  cellIndex,
  computeVisible,
  cellRules,
  inRooms,
  inventoryOf,
  shownId,
  type ActionDef,
  type Buc,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type Json,
  type Level,
  type MonsterDef,
  type Msg,
  type ObjectDef,
  type Offer,
  type PlayerAction,
  type PromptOption,
} from '@nh/core';
import { figBucChanged } from './figurinestate';
import { BOULDER, ROCK, blockersOf } from './boulder';
import { killedByHero, wakeGently } from './buzz';
import { mondied } from './mondeath';
import { monsterIdAt } from './combat';
import { dmgvalSized } from './dmgval';
import { templeOccupied } from './epri';
import { isShopType } from './eshk';
import { boulderDmgval, boulderFlooreffects } from './flooreffects';
import { losehp } from './hp';
import { encumberMsg, prinv } from './itemactions';
import {
  NOINVSYM,
  mksobj,
  objKnown,
  placeObject,
  setCknown,
  setLknown,
  setRknown,
  stackobj,
} from './items';
import { isBig } from './mondata';
import { heroSees, whichArmor } from './mongear';
import { wakeNearto } from './noise';
import { wakeup } from './peaceful';
import { canSpotMon, monNam } from './perception';
import { mapInvisible, monInvisible } from './invis';
import { sokobanGuilt } from './sokoban';
import { CHARGED_RINGS } from './objects';
import { erosionMatters, hardHelmet, isWeaponOrWeptool } from './material';
import { discover, isKnown } from './o_init';
import { moreExperienced } from './urexp';
import { doname, xnameOf } from './objnam';
import { checkCapacity, color, hcolor, heroEntity, strangeFeeling, useup, useupall } from './magic';
import { P, hasProp } from './props';
import { snuffLit } from './light';
import {
  answerSeffect,
  confuseMonster,
  confusedLight,
  isSeffectAsk,
  seffectAmnesia,
  seffectCharging,
  seffectCreateMonster,
  seffectDestroyArmor,
  seffectFire,
  seffectScareMonster,
  seffectTaming,
  someArmor,
  type SeffectResult,
} from './seffect';
import { PLAYER, REALLY, answerGenocide, doClassGenocide, doGenocide, isGenoAsk } from './genocide';
import { levelTele, tele } from './trap';
import { luckOf } from './luck';
import { answerStudy, continuesStudy, isStudyAsk, studyBook } from './spell';
import { isReadableWear, readWear } from './shirt';

export const READ_ID: DefId = 'nh:read';

const msg = (ctx: Ctx, key: string, params?: Record<string, Msg | string | number>): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const wornIn = (ctx: Ctx, slot: string): Entity | undefined =>
  inventoryOf(ctx.state, ctx.state.playerId).find((o) => o.c.item?.equipped === slot);

/** Armor pairs and plural stacks take plural verbs ("Your boots glow"). ref: otense() */
const isPlural = (def: ObjectDef, e: Entity): boolean =>
  (e.c.item?.quantity ?? 1) !== 1 || def.armor?.slot === 'boots' || def.armor?.slot === 'gloves';

// ---------------------------------------------------------------------------------------------
// identify

/**
 * ref: src/objnam.c not_fully_identified(), without its rknown test (see items.ts rknown(): the
 * flag is only recorded for erodeproof items)
 */
function notFullyIdentified(ctx: Ctx, e: Entity): boolean {
  const it = e.c.item;
  if (!it) return false;
  const def = ctx.defs.object(e.def);
  if (def.class === 'coin') return false;
  if (!it.known.buc) return true;
  if (usesKnown(def) && !it.known.spe) return true;
  if (!isKnown(ctx.state, ctx.defs, def)) return true;
  // ref: (!cknown && Is_container) || (!lknown && Is_box)
  return (
    (!!def.container && !objKnown(ctx.state, 'cknown', e.id)) ||
    (!!def.container?.box && !objKnown(ctx.state, 'lknown', e.id))
  );
}

/**
 * Whether obj->known matters for the type (oc_uses_known; for the others NetHack sets it at
 * creation): weapons, armor, wands, charged rings and eggs.
 */
const usesKnown = (def: ObjectDef): boolean =>
  def.id === EGG ||
  isWeaponOrWeptool(def) ||
  def.class === 'armor' ||
  def.class === 'wand' ||
  CHARGED_RINGS.has(def.id);

/** ref: src/invent.c identify(): fully_identify_obj(), then "d - ..." */
function identify(ctx: Ctx, e: Entity): void {
  if (!e.c.item) return;
  fullyIdentify(ctx, e);
  prinv(ctx, e);
}

/**
 * A scroll type learned by reading it: discovered, and 10 points of score the first time.
 * ref: src/read.c learnscrolltyp()
 */
function learnscrolltyp(ctx: Ctx, def: ObjectDef): void {
  if (isKnown(ctx.state, ctx.defs, def)) return;
  discover(ctx, def);
  moreExperienced(ctx, 0, 10);
}

/**
 * Type, BUC, enchantment and container knowledge, silently. ref: src/invent.c
 * fully_identify_obj(); src/end.c really_done()'s loop does the same per object.
 */
export function fullyIdentify(ctx: Ctx, e: Entity): void {
  const it = e.c.item;
  if (!it) return;
  discover(ctx, e.def);
  it.known.buc = true;
  it.known.spe = true;
  if (it.erodeproof) setRknown(ctx, e.id, true);
  // ref: set_cknown_lknown()
  const def = ctx.defs.object(e.def);
  if (def.container) setCknown(ctx, e.id, true);
  if (def.container?.box) setLknown(ctx, e.id, true);
  if (e.def === EGG && it.corpseOf) learnEggType(ctx, it.corpseOf);
}

const unidentified = (ctx: Ctx): Entity[] =>
  inventoryOf(ctx.state, ctx.state.playerId).filter((e) => notFullyIdentified(ctx, e));

interface IdentifyData {
  stage: 'identify';
  /** How many more items may be identified. */
  limit: number;
  first: boolean;
  tryct: number;
  /** The identify scroll was just learned (affects the "all/the rest" message). */
  learning: boolean;
}

const invOption = (ctx: Ctx, e: Entity): PromptOption => ({
  value: e.id,
  key: 'inv.menu_item',
  ...(e.c.item?.letter ? { letter: e.c.item.letter } : {}),
  params: { letter: e.c.item?.letter ?? NOINVSYM, item: ctx.defs.itemName(ctx.state, e) },
  glyph: shownId(ctx.state, e.def),
});

/**
 * One round of ref: src/invent.c menu_identify(): asks which of the unidentified items to
 * identify (up to the limit). Returns true when a prompt was raised.
 */
function askIdentify(ctx: Ctx, data: IdentifyData): boolean {
  const list = unidentified(ctx);
  if (list.length === 0) {
    msg(ctx, 'identify.that_was_all');
    return false;
  }
  ctx.ask(
    {
      id: 'identify-menu',
      kind: 'menu',
      key: data.first ? 'identify.what_first' : 'identify.what_next',
      params: { n: data.limit },
      options: list.map((e) => invOption(ctx, e)),
      multi: true,
    },
    READ_ID,
    data as unknown as Json,
  );
  return true;
}

/**
 * ref: src/invent.c identify_pack(): identifies `limit` items (0 = all). Returns true when it
 * is waiting for the player's choice.
 */
export function identifyPack(ctx: Ctx, limit: number, learning: boolean): boolean {
  const list = unidentified(ctx);
  if (list.length === 0) {
    msg(ctx, learning ? 'identify.already_rest' : 'identify.already_all');
    return false;
  }
  if (limit === 0 || limit >= list.length) {
    for (const e of list) identify(ctx, e);
    return false;
  }
  return askIdentify(ctx, { stage: 'identify', limit, first: true, tryct: 5, learning });
}

/** The answer to the identify menu. ref: src/invent.c menu_identify() loop. Returns true if it asked again. */
function identifyAnswer(ctx: Ctx, value: Json, data: IdentifyData): boolean {
  const chosen = Array.isArray(value) ? value : [];
  const picks = unidentified(ctx).filter((e) => chosen.includes(e.id));
  if (picks.length > 0) {
    const n = Math.min(picks.length, data.limit);
    for (const e of picks.slice(0, n)) identify(ctx, e);
    data.limit -= n;
    data.first = false;
    return data.limit > 0 ? askIdentify(ctx, data) : false;
  }
  if (!--data.tryct) {
    msg(ctx, 'identify.enough_tries');
    return false;
  }
  msg(ctx, 'identify.choose');
  return askIdentify(ctx, data);
}

/** ref: src/read.c seffect_identify(): the scroll is used up first, so it never identifies itself. */
/**
 * The spell of identify: the scroll's effect with the type already known and nothing used up
 * ("You're not carrying anything to be identified."). ref: seffect_identify() for a spell
 */
function spellIdentify(ctx: Ctx, buc: Buc): void {
  if (inventoryOf(ctx.state, ctx.state.playerId).length === 0) {
    msg(ctx, 'identify.nothing');
    return;
  }
  let cval = 1;
  if (buc === 'blessed' || (buc === 'uncursed' && ctx.rng.rn2(5) === 0)) {
    cval = ctx.rng.rn2(5); // 0 identifies everything
    if (cval === 1 && buc === 'blessed' && luckOf(ctx.state) > 0) cval++;
  }
  identifyPack(ctx, cval, false);
}

function seffectIdentify(ctx: Ctx, scroll: Entity, wasKnown: boolean): void {
  const def = ctx.defs.object(scroll.def);
  const buc = scroll.c.item?.buc ?? 'uncursed';
  const confused = hasProp(heroEntity(ctx), P.CONFUSION);
  useup(ctx, scroll.id);
  // a confused reader, or a cursed scroll of an unknown type, only identifies itself
  const self = confused || (buc === 'cursed' && !wasKnown);
  if (self) msg(ctx, 'identify.identify_this_as');
  else if (!wasKnown) msg(ctx, 'identify.this_is');
  if (!wasKnown) learnscrolltyp(ctx, def);
  if (self) return;
  if (inventoryOf(ctx.state, ctx.state.playerId).length === 0) {
    msg(ctx, 'identify.nothing_else');
    return;
  }
  let cval = 1;
  if (buc === 'blessed' || (buc === 'uncursed' && ctx.rng.rn2(5) === 0)) {
    cval = ctx.rng.rn2(5); // 0 identifies everything
    // a lucky reader of a blessed scroll identifies one more
    if (cval === 1 && buc === 'blessed' && luckOf(ctx.state) > 0) cval++;
  }
  identifyPack(ctx, cval, !wasKnown);
}

// ---------------------------------------------------------------------------------------------
// enchant weapon

/**
 * ref: src/wield.c chwepon(). Returns false when the scroll was used up by a strange feeling.
 * A worm tooth enchanted (any non-negative amount) becomes a crysknife, a stack fusing into one;
 * a crysknife disenchanted turns back. Not ported: artifacts, blindness.
 */
function chwepon(ctx: Ctx, scroll: Entity, amount: number): boolean {
  const uwep = inventoryOf(ctx.state, ctx.state.playerId).find(
    (o) => o.c.item?.equipped === 'weapon',
  );
  const it = uwep?.c.item;
  const def = uwep ? ctx.defs.object(uwep.def) : null;
  if (!uwep || !it || !def || !isWeaponOrWeptool(def)) {
    strangeFeeling(ctx, scroll.id, amount >= 0 ? 'enchant.hands_twitch' : 'enchant.hands_itch');
    return false;
  }
  const sdef = ctx.defs.object(scroll.def);
  // ref: chwepon(): `uwep->otyp == WORM_TOOTH && amount >= 0` / `CRYSKNIFE && amount < 0`
  if (
    (uwep.def === 'nh:worm_tooth' && amount >= 0) ||
    (uwep.def === 'nh:crysknife' && amount < 0)
  ) {
    const sharper = amount >= 0;
    const multiple = it.quantity > 1;
    msg(ctx, `enchant.${sharper ? 'tooth' : 'crysknife'}${multiple ? '_fuse' : ''}`);
    uwep.def = sharper ? 'nh:crysknife' : 'nh:worm_tooth';
    delete it.erodeproof;
    if (multiple) it.quantity = 1;
    if (sharper && it.buc === 'cursed') it.buc = 'uncursed';
    // (an unpaid tooth's bill is not re-priced: see DEVIATIONS.md "Long worms")
    if (sharper || scroll.c.item?.known.buc) discover(ctx, sdef);
    if (multiple) encumberMsg(ctx);
    return true;
  }
  const clr = color(amount < 0 ? 'black' : 'blue');
  const pl = isPlural(def, uwep) ? '_pl' : '';
  const item = xnameOf(ctx.state, ctx.defs, uwep);
  // there is a (soft) upper and lower limit to uwep->spe
  if (((it.spe > 5 && amount >= 0) || (it.spe < -5 && amount < 0)) && ctx.rng.rn2(3) !== 0) {
    msg(ctx, `enchant.weapon.evaporate${pl}`, { item, color: clr });
    useupall(ctx, uwep.id); // let all of them disappear
    return true;
  }
  msg(ctx, `enchant.weapon.glow${pl}`, {
    item,
    violently: amount === 0 ? { key: 'enchant.violently' } : '',
    color: clr,
    time: { key: amount * amount === 1 ? 'enchant.moment' : 'enchant.while' },
  });
  const sit = scroll.c.item;
  if (it.known.spe && (amount > 0 || (amount < 0 && sit?.known.buc))) discover(ctx, sdef);
  it.spe += amount;
  if (amount > 0 && it.buc === 'cursed') it.buc = 'uncursed';
  // an elven magic clue: weapons vibrate warningly when enchanted beyond a limit
  if (it.spe > 5 && ctx.rng.rn2(7) === 0) msg(ctx, `enchant.vibrate${pl}`, { item });
  return true;
}

/**
 * The confused enchant scrolls: the item becomes erodeproof (uncursed or blessed scroll) or loses
 * its erodeproofing (cursed), and the hero learns which unless blind; proofing also repairs
 * erosion. ref: src/read.c seffect_enchant_weapon() / seffect_enchant_armor() confused branches
 */
function erodeproof(
  ctx: Ctx,
  obj: Entity,
  scursed: boolean,
  what: 'shield' | 'layer',
  warm: () => void,
): void {
  const def = ctx.defs.object(obj.def);
  const it = obj.c.item;
  if (!it) return;
  const blind = hasProp(heroEntity(ctx), P.BLINDED);
  const newProof = !scursed;
  // rknown: lost when blind, else learned (only recorded for erodeproof items)
  setRknown(ctx, obj.id, !blind && newProof);
  if (blind) warm();
  else {
    msg(ctx, `enchant.erodeproof${isPlural(def, obj) ? '_pl' : ''}`, {
      item: xnameOf(ctx.state, ctx.defs, obj),
      how: { key: scursed ? 'enchant.erodeproof.mottled' : 'enchant.erodeproof.shimmering' },
      color: hcolor(ctx, scursed ? (what === 'shield' ? 'purple' : 'black') : 'golden'),
      what: { key: `enchant.erodeproof.${scursed ? 'glow' : what}` },
    });
  }
  if (newProof && it.erosion && (it.erosion.e1 || it.erosion.e2)) {
    delete it.erosion;
    msg(ctx, 'erode.good_as_new', {
      item: xnameOf(ctx.state, ctx.defs, obj),
      look: { key: `erode.${blind ? 'feel' : 'look'}${isPlural(def, obj) ? '_pl' : ''}` },
    });
  }
  // costly_alteration(): no shops
  if (newProof) it.erodeproof = true;
  else delete it.erodeproof;
}

/** ref: src/read.c seffect_enchant_weapon() */
function seffectEnchantWeapon(ctx: Ctx, scroll: Entity): boolean {
  const buc = scroll.c.item?.buc ?? 'uncursed';
  const uwep = inventoryOf(ctx.state, ctx.state.playerId).find(
    (o) => o.c.item?.equipped === 'weapon',
  );
  if (
    hasProp(heroEntity(ctx), P.CONFUSION) &&
    uwep &&
    erosionMatters(ctx.defs.object(uwep.def)) &&
    ctx.defs.object(uwep.def).class !== 'armor'
  ) {
    erodeproof(ctx, uwep, buc === 'cursed', 'shield', () => msg(ctx, 'enchant.weapon_warm'));
    return false;
  }
  const spe = uwep?.c.item?.spe ?? 0;
  const s =
    buc === 'cursed'
      ? -1
      : !uwep
        ? 1
        : spe >= 9
          ? ctx.rng.rn2(spe) === 0
            ? 1
            : 0
          : buc === 'blessed'
            ? ctx.rng.rnd(3 - Math.trunc(spe / 3))
            : 1;
  const ok = chwepon(ctx, scroll, s);
  const it = uwep?.c.item;
  if (it && ctx.state.entities[String(uwep?.id)]) it.spe = Math.max(-99, Math.min(99, it.spe)); // cap_spe()
  return !ok;
}

// ---------------------------------------------------------------------------------------------
// enchant armor

/**
 * ref: src/read.c seffect_enchant_armor(). Returns true when the scroll was already used up.
 * Not ported: dragon scales, artifacts,
 * Dex/Int armor bonuses (adj_abon).
 */
function seffectEnchantArmor(ctx: Ctx, scroll: Entity, wasKnown: boolean): boolean {
  const sbuc = scroll.c.item?.buc ?? 'uncursed';
  const sdef = ctx.defs.object(scroll.def);
  const sblessed = sbuc === 'blessed';
  const scursed = sbuc === 'cursed';
  const otmp = someArmor(ctx);
  if (!otmp?.c.item) {
    strangeFeeling(ctx, scroll.id, 'enchant.skin');
    return true;
  }
  if (hasProp(heroEntity(ctx), P.CONFUSION)) {
    const odef = ctx.defs.object(otmp.def);
    erodeproof(ctx, otmp, scursed, odef.armor?.slot === 'shield' ? 'layer' : 'shield', () =>
      msg(ctx, `enchant.armor_warm${isPlural(odef, otmp) ? '_pl' : ''}`, {
        item: xnameOf(ctx.state, ctx.defs, otmp),
      }),
    );
    return false;
  }
  const it = otmp.c.item;
  const def = ctx.defs.object(otmp.def);
  const item = xnameOf(ctx.state, ctx.defs, otmp);
  const pl = isPlural(def, otmp) ? '_pl' : '';
  const specialArmor = otmp.def.includes('elven'); // ref: is_elven_armor()
  const clr = color(scursed ? 'black' : 'silver');
  // KMH -- catch underflow
  let s = scursed ? -it.spe : it.spe;
  if (s > (specialArmor ? 5 : 3) && ctx.rng.rn2(s) !== 0) {
    msg(ctx, `enchant.armor.evaporate${pl}`, { item, color: clr });
    useup(ctx, otmp.id);
    return false;
  }
  if (s < -100) s = -100;
  // Base power: 2 for -1 to +0 armor, 1 for +1 to +2, 0 for +3 to +4, ...
  s = Math.trunc((4 - s) / 2);
  if (specialArmor) ++s;
  if (!def.magic) ++s;
  if (sblessed) ++s;
  if (s <= 0) {
    s = 0;
    if (it.spe > 0 && ctx.rng.rn2(it.spe) === 0) s = 1;
  } else s = ctx.rng.rnd(s);
  if (s > 11) s = 11;
  if (scursed) s = -s;
  msg(ctx, `enchant.armor.glow${pl}`, {
    item,
    violently: s === 0 ? { key: 'enchant.violently' } : '',
    color: clr,
    time: { key: s * s > 1 ? 'enchant.while' : 'enchant.moment' },
  });
  let buc: Buc = it.buc;
  if (scursed && buc !== 'cursed') buc = 'cursed';
  else if (sblessed && buc !== 'blessed') buc = 'blessed';
  else if (!scursed && buc === 'cursed') buc = 'uncursed';
  it.buc = buc;
  let known = false;
  if (s) {
    const oldspe = it.spe;
    it.spe = Math.max(-99, Math.min(99, it.spe + s));
    // adjust armor bonus for Dex or Int+Wis
    if (it.spe !== oldspe) adjAbon(ctx, otmp, it.spe - oldspe);
    known = it.known.spe; // gk.known = otmp->known
  }
  if (known && !wasKnown) learnscrolltyp(ctx, sdef); // gk.known -> learnscroll()
  if (it.spe > (specialArmor ? 5 : 3) && (specialArmor || ctx.rng.rn2(7) === 0)) {
    msg(ctx, `enchant.vibrate${pl}`, { item });
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
// remove curse

/**
 * ref: src/read.c seffect_remove_curse(). A confused reader randomly blesses or curses
 * (blessorcurse(obj, 2)) instead and forgets those items' states. Loadstones count as worn.
 * Not ported: leashes, punishment, the steed's saddle. Returns whether the scroll type becomes known.
 */
function seffectRemoveCurse(ctx: Ctx, scroll: Entity): boolean {
  const confused = hasProp(heroEntity(ctx), P.CONFUSION);
  return removeCurse(ctx, scroll.c.item?.buc ?? 'uncursed', confused, scroll);
}

/**
 * The remove curse effect of a scroll (`scroll`, hidden from itself) or of a pseudo spellbook
 * (`scroll` null: the magic trap's SPE_REMOVE_CURSE, read unconfused). Returns whether a
 * known-cursed item is now known not to be. ref: src/read.c seffect_remove_curse()
 */
export function removeCurse(ctx: Ctx, buc: Buc, confused: boolean, scroll: Entity | null): boolean {
  const hero = heroEntity(ctx);
  msg(
    ctx,
    hasProp(hero, P.HALLUC)
      ? confused
        ? 'remove_curse.force'
        : 'remove_curse.oneness'
      : confused
        ? 'remove_curse.need_help'
        : 'remove_curse.helping',
  );
  if (buc === 'cursed') {
    msg(ctx, 'remove_curse.disintegrates');
    return false;
  }
  let learned = false;
  for (const obj of inventoryOf(ctx.state, ctx.state.playerId)) {
    const it = obj.c.item;
    if (!it || ctx.defs.object(obj.def).class === 'coin') continue; // gold isn't subject to cursing
    // hide the scroll being read from itself
    if (obj.id === scroll?.id && it.quantity === 1) continue;
    if (buc === 'blessed' || it.equipped !== null || obj.def === 'nh:loadstone') {
      if (confused) {
        // ref: src/mkobj.c blessorcurse(obj, 2)
        if (it.buc === 'uncursed' && ctx.rng.rn2(2) === 0) {
          it.buc = ctx.rng.rn2(2) === 0 ? 'cursed' : 'blessed';
          figBucChanged(ctx, obj.id); // curse() or bless()
        }
        it.known.buc = false;
      } else if (it.buc === 'cursed') {
        it.buc = 'uncursed';
        figBucChanged(ctx, obj.id); // uncurse()
        // if the object was known to be cursed and is now known not to be, learn the scroll
        if (it.known.buc) learned = true;
      }
    }
  }
  return learned;
}

// ---------------------------------------------------------------------------------------------
// light

/**
 * ref: src/vision.c circle_data[] rows for do_clear_area() radius 5, 7, 8 (BOLT_LIM) and 9: the
 * largest |dx| at each |dy|.
 */
const CIRCLE: Readonly<Record<number, readonly number[]>> = {
  5: [5, 5, 5, 4, 3, 2],
  7: [7, 7, 7, 6, 6, 5, 4, 2],
  8: [8, 8, 8, 7, 7, 6, 6, 4, 2],
  9: [9, 9, 9, 9, 8, 8, 7, 6, 5, 3],
};

/**
 * The cells around the hero that she could see from where she stands (couldsee(): line of
 * sight regardless of the lighting) within a circle of radius 5, 7, 8 or 9, as cell indices.
 * ref: src/vision.c do_clear_area() centered on the hero
 */
export function clearArea(ctx: Ctx, radius: 5 | 7 | 8 | 9): number[] {
  const pos = heroEntity(ctx).c.pos;
  const level: Level | undefined = pos ? ctx.state.levels[pos.level] : undefined;
  if (!pos || !level) return [];
  const rules = cellRules(level, ctx.defs);
  const dark: Level = { ...level, lit: level.lit.map(() => 1) };
  const circle = CIRCLE[radius] ?? [];
  const out: number[] = [];
  for (const i of computeVisible(dark, rules, pos, [], blockersOf(ctx, level.id))) {
    const x = i % level.width;
    const y = (i - x) / level.width;
    const lim = circle[Math.abs(y - pos.y)];
    if (lim === undefined || Math.abs(x - pos.x) > lim) continue;
    out.push(i);
  }
  return out.sort((a, b) => a - b);
}

/**
 * ref: src/read.c litroom(): lights (or darkens) the cells around the hero that she could see
 * from where she stands, within a circle of radius 5 (9 for a blessed scroll). That includes
 * walls and doorways but nothing behind them, so in a room it is the room and its walls (within
 * range), in a corridor a stretch of it. Darkening douses the hero's lit lamps first. Not
 * ported: artifact lights, gremlins, the Rogue level, being swallowed or underwater,
 * light-sensitive monsters (lightdamage).
 */
export function litroom(ctx: Ctx, on: boolean, blessed: boolean): void {
  if (!on) {
    for (const obj of inventoryOf(ctx.state, ctx.state.playerId)) snuffLit(ctx, obj);
  }
  msg(ctx, on ? 'light.lit_field' : 'light.darkness');
  const pos = heroEntity(ctx).c.pos;
  const level: Level | undefined = pos ? ctx.state.levels[pos.level] : undefined;
  if (!level) return;
  for (const i of clearArea(ctx, blessed ? 9 : 5)) level.lit[i] = on ? 1 : 0;
}

// ---------------------------------------------------------------------------------------------
// earth

/** ref: src/do_wear.c hard_helmet() */
export { hardHelmet };

/**
 * What is above (x, y) of the hero's level, as a message key. ref: src/dig.c ceiling(), for the
 * places that exist here: temples, shops, room floors, doors and walls ("ceiling") and
 * corridors ("rock cavern"); no vaults, water, air, fire or quest levels.
 */
export function ceilingKey(ctx: Ctx, level: Level, x: number, y: number): string {
  const rooms = inRooms(level, x, y);
  if (templeOccupied(level, rooms) !== null) return 'earth.ceiling.temple';
  if (rooms.some((r) => isShopType(level.rooms[r]?.type))) return 'earth.ceiling.shop';
  const t = ctx.defs.terrain(level.palette[level.cells[cellIndex(level, x, y)] ?? 0] ?? 'nh:stone');
  return t.id === 'nh:corr' ? 'earth.ceiling.rock_cavern' : 'earth.ceiling.ceiling';
}

/**
 * The boulder (or, confused, the 2..6 rocks) that falls, not yet placed.
 * ref: src/read.c drop_boulder_on_player() / drop_boulder_on_monster(): `mksobj(confused ? ROCK
 * : BOULDER, FALSE, FALSE)`, `quan = confused ? rn1(5, 2) : 1`
 */
function fallingObject(ctx: Ctx, confused: boolean): Entity {
  const id = mksobj(ctx, ctx.defs.object(confused ? ROCK : BOULDER), { init: false });
  const obj = ctx.state.entities[String(id)];
  const it = obj?.c.item;
  if (!obj || !it) throw new Error('fallingObject: no object');
  if (confused) it.quantity = ctx.rng.rn2(5) + 2;
  return obj;
}

/**
 * `dmgval(otmp2, target) * otmp2->quan`: a boulder's `rnd(20)`, a rock's `rnd(3)`, times the
 * count (one roll). ref: src/weapon.c dmgval()
 */
const fallingDamage = (ctx: Ctx, obj: Entity, big: boolean): number =>
  (obj.def === BOULDER
    ? boulderDmgval(ctx)
    : dmgvalSized(ctx.rng, obj, ctx.defs.object(obj.def), big)) * (obj.c.item?.quantity ?? 1);

/**
 * The fallen object lands at (x, y): into a pit or hole there (a boulder), else on the floor.
 * Not ported: rocks tumbling into the pit (or through the hole) at the edge of which the hero
 * stands (flooreffects()'s uteetering_at_seen_pit() branch: no ship_object()).
 */
function landFalling(ctx: Ctx, obj: Entity, x: number, y: number): void {
  if (boulderFlooreffects(ctx, obj, x, y, 'fall')) return;
  placeObject(ctx, obj.id, ctx.state.currentLevel, x, y);
  stackobj(ctx, obj.id);
}

const monsterOn = (ctx: Ctx, x: number, y: number): Entity | null => {
  const id = monsterIdAt(ctx, { x, y }, ctx.state.currentLevel);
  return id === null || id === ctx.state.playerId ? null : (ctx.state.entities[String(id)] ?? null);
};

/** ref: src/do_name.c mhim() from the species (no monster instance has a gender here) */
const mhim = (def: MonsterDef): string =>
  def.flags.includes('neuter')
    ? '@pronoun.it'
    : def.flags.includes('female')
      ? '@pronoun.her'
      : '@pronoun.him';

/**
 * A boulder (rocks when confused) falls on the hero: "You are hit by a boulder!", the damage
 * (a hard helmet caps it at 2 when `helmetProtects`), nearby monsters woken, the boulder lands
 * on her square (filling a pit she is in) and then she takes the damage. Not ported: being
 * engulfed (no engulfers), Half_physical_damage (no source), polymorphed forms.
 * ref: src/read.c drop_boulder_on_player()
 */
export function dropBoulderOnPlayer(ctx: Ctx, confused: boolean, helmetProtects: boolean): void {
  const p = heroEntity(ctx).c.pos;
  if (!p) return;
  const obj = fallingObject(ctx, confused);
  msg(ctx, 'earth.you_hit', { obj: doname(ctx.state, ctx.defs, obj) });
  let dmg = fallingDamage(ctx, obj, false);
  const uarmh = wornIn(ctx, 'helm');
  if (uarmh && helmetProtects) {
    if (hardHelmet(ctx.defs.object(uarmh.def))) {
      msg(ctx, 'trap.rock.hard_helmet');
      if (dmg > 2) dmg = 2;
    } else msg(ctx, 'trap.rock.no_protect', { obj: xnameOf(ctx.state, ctx.defs, uarmh) });
  }
  wakeNearto(ctx, p.x, p.y, 4 * 4);
  landFalling(ctx, obj, p.x, p.y); // before the losehp(), as C
  if (dmg) losehp(ctx, dmg, '@killer.earth');
}

/**
 * A boulder (rocks when confused) falls at (x, y) of the hero's level: a solid monster there
 * is hit ("The jackal is hit by a boulder!"; a hard helmet caps the damage at 2), killed with
 * the hero's credit or woken and angered, and the monsters around woken; then the boulder lands
 * (filling a pit or plugging a hole). Not `byu` (a monster read the scroll): "The jackal is
 * killed." without credit, or woken without anger. Not ported: engulfers (none).
 * ref: src/read.c drop_boulder_on_monster()
 */
export function dropBoulderOnMonster(
  ctx: Ctx,
  x: number,
  y: number,
  confused: boolean,
  byu = true,
): boolean {
  const obj = fallingObject(ctx, confused);
  const mtmp = monsterOn(ctx, x, y);
  const mdef = mtmp ? ctx.defs.monster(mtmp.def) : null;
  // no passes_walls or noncorporeal monster exists
  if (mtmp && mdef && !mdef.flags.includes('amorphous') && !mdef.flags.includes('unsolid')) {
    const helmet = whichArmor(ctx, mtmp.id, 'helm');
    if (heroSees(ctx, { level: ctx.state.currentLevel, x, y })) {
      msg(ctx, 'earth.mon_hit', {
        mon: monNam(ctx, mtmp),
        obj: doname(ctx.state, ctx.defs, obj),
      });
      if (monInvisible(ctx, mtmp) && !canSpotMon(ctx, mtmp)) mapInvisible(ctx, x, y);
    }
    let mdmg = fallingDamage(ctx, obj, isBig(mdef));
    if (helmet) {
      if (hardHelmet(ctx.defs.object(helmet.def))) {
        if (canSpotMon(ctx, mtmp)) msg(ctx, 'earth.mon_hard_helmet', { mon: monNam(ctx, mtmp) });
        else msg(ctx, 'earth.clang'); // the hero is never Deaf
        if (mdmg > 2) mdmg = 2;
      } else if (canSpotMon(ctx, mtmp)) {
        msg(ctx, 'earth.mon_no_protect', {
          mon: monNam(ctx, mtmp),
          obj: xnameOf(ctx.state, ctx.defs, helmet),
          him: mhim(mdef),
        });
      }
    }
    const hp = mtmp.c.hp;
    if (hp) hp.cur -= mdmg;
    if (!hp || hp.cur < 1) {
      if (byu)
        killedByHero(ctx, mtmp); // killed(mtmp)
      else {
        msg(ctx, 'earth.mon_killed', { mon: monNam(ctx, mtmp) });
        mondied(ctx, mtmp.id);
      }
    } else if (byu)
      wakeup(ctx, mtmp.id); // wakeup(mtmp, TRUE)
    else wakeGently(ctx, mtmp); // wakeup(mtmp, FALSE)
    wakeNearto(ctx, x, y, 4 * 4);
  }
  landFalling(ctx, obj, x, y);
  return true;
}

/**
 * The scroll of earth: "The ceiling rumbles above you!" (around, blessed); a boulder falls on
 * each open square around the hero unless the scroll is cursed, and on the hero unless it is
 * blessed (her helmet does not help against a cursed one); confused, rocks fall instead. It is
 * always identified, and it is cheating in Sokoban. Every level has a ceiling here (no
 * endgame, Rogue level or quest; no steeds, no engulfing).
 * ref: src/read.c seffect_earth()
 */
function seffectEarth(ctx: Ctx, scroll: Entity, confused: boolean): void {
  const buc = scroll.c.item?.buc;
  const p = heroEntity(ctx).c.pos;
  const level = p ? ctx.state.levels[p.level] : undefined;
  if (!p || !level) return;
  msg(ctx, 'earth.rumbles', {
    ceiling: { key: ceilingKey(ctx, level, p.x, p.y) },
    where: { key: buc === 'blessed' ? 'earth.around' : 'earth.above' },
  });
  sokobanGuilt(ctx);
  let nboulders = 0;
  if (buc !== 'cursed') {
    const rules = cellRules(level, ctx.defs);
    for (let x = p.x - 1; x <= p.x + 1; x++) {
      for (let y = p.y - 1; y <= p.y + 1; y++) {
        if (x < 0 || y < 0 || x >= level.width || y >= level.height) continue; // isok()
        if (x === p.x && y === p.y) continue;
        const t = level.cells[cellIndex(level, x, y)] ?? 0;
        const tdef = ctx.defs.terrain(level.palette[t] ?? 'nh:stone');
        // !closed_door() && !IS_OBSTRUCTED() (rock, walls, secret doors); no air
        if (rules.closedDoor[t] === true || (!tdef.passable && tdef.door === undefined)) continue;
        if (dropBoulderOnMonster(ctx, x, y, confused)) nboulders++;
      }
    }
  }
  if (buc !== 'blessed') dropBoulderOnPlayer(ctx, confused, buc !== 'cursed');
  else if (nboulders === 0) msg(ctx, 'earth.nothing_else');
}

// ---------------------------------------------------------------------------------------------
// reading

const heroScroll = (ctx: Ctx, id: unknown): Entity | null => {
  if (typeof id !== 'number') return null;
  const e = ctx.state.entities[String(id)];
  return e?.c.item?.carriedBy === ctx.state.playerId ? e : null;
};

/**
 * Reads a scroll: the message, the effect, discovery and using it up. ref: src/read.c doread()
 * (the part after the checks), seffects(), learnscroll(). Not ported: confusion, blindness, the
 * score for learning a type, `trycall` (naming unidentified types). An identify scroll may leave
 * a prompt pending (`ctx.state.pendingPrompt`), answered through the `nh:read` action.
 */
function readScroll(ctx: Ctx, _user: EntityId, itemId: EntityId): void {
  const scroll = ctx.state.entities[String(itemId)];
  const it = scroll?.c.item;
  if (!scroll || !it) return;
  const def = ctx.defs.object(scroll.def);
  const wasKnown = isKnown(ctx.state, ctx.defs, def);
  const nodisappear = def.id === 'nh:scroll_of_remove_curse' && it.buc === 'cursed';
  const hero = heroEntity(ctx);
  const blind = hasProp(hero, P.BLINDED);
  const confused = hasProp(hero, P.CONFUSION);
  const blank = def.id === 'nh:scroll_of_blank_paper';
  if (!blank) {
    if (blind) msg(ctx, nodisappear ? 'read.blind_you_read' : 'read.blind_disappears');
    else msg(ctx, nodisappear ? 'read.you_read' : 'read.disappears');
    if (confused) msg(ctx, hasProp(hero, P.HALLUC) ? 'read.trippy' : 'read.confused');
  }

  let known = false; // gk.known
  let used = false; // the scroll has already been used up
  const apply = (r: SeffectResult): void => {
    if (r.known) known = true;
    if (r.used) used = true;
  };
  switch (def.id) {
    case 'nh:scroll_of_identify':
      seffectIdentify(ctx, scroll, wasKnown);
      used = true;
      break;
    case 'nh:scroll_of_enchant_weapon':
      used = seffectEnchantWeapon(ctx, scroll);
      break;
    case 'nh:scroll_of_enchant_armor':
      used = seffectEnchantArmor(ctx, scroll, wasKnown);
      break;
    case 'nh:scroll_of_remove_curse':
      known = seffectRemoveCurse(ctx, scroll);
      break;
    case 'nh:scroll_of_light':
      // ref: seffect_light(). Confused, tame cancelled lights around her (seffect.ts).
      if (confused) known = confusedLight(ctx, it.buc);
      else {
        litroom(ctx, it.buc !== 'cursed', it.buc === 'blessed');
        known = !blind;
      }
      break;
    case 'nh:scroll_of_teleportation':
      // ref: seffect_teleportation(): confused or cursed, a level teleport (its message makes
      // the scroll known); else scrolltele(), which always learns it
      // (controlled, the prompt's answer spends the move)
      if (confused || it.buc === 'cursed') levelTele(ctx, { cost: NORMAL_SPEED });
      else tele(ctx, { blessed: it.buc === 'blessed', cost: NORMAL_SPEED });
      known = true;
      break;
    case 'nh:scroll_of_earth':
      seffectEarth(ctx, scroll, confused);
      known = true;
      break;
    case 'nh:scroll_of_blank_paper':
      // ref: seffect_blank_paper(); the scroll is not used up
      msg(ctx, blind ? 'read.blank_blind' : 'read.blank');
      known = true;
      break;
    case 'nh:scroll_of_destroy_armor':
      apply(seffectDestroyArmor(ctx, scroll, confused, wasKnown));
      break;
    case 'nh:scroll_of_confuse_monster':
      confuseMonster(ctx, it.buc === 'blessed', it.buc === 'cursed', true);
      break;
    case 'nh:scroll_of_scare_monster':
      seffectScareMonster(ctx, { buc: it.buc }, confused);
      break;
    case 'nh:scroll_of_create_monster':
      apply(seffectCreateMonster(ctx, { buc: it.buc }, confused));
      break;
    case 'nh:scroll_of_taming':
      apply(seffectTaming(ctx, { buc: it.buc }, confused));
      break;
    case 'nh:scroll_of_amnesia':
      apply(seffectAmnesia(ctx, scroll));
      break;
    case 'nh:scroll_of_fire':
      seffectFire(ctx, scroll, confused, wasKnown, () => learnscrolltyp(ctx, def));
      used = true;
      break;
    case 'nh:scroll_of_charging':
      apply(seffectCharging(ctx, scroll, confused, wasKnown, () => learnscrolltyp(ctx, def)));
      break;
    case 'nh:scroll_of_gold_detection': {
      // ref: seffect_gold_detection(): confused or cursed, trap detection
      const sobj: Detector = { buc: it.buc, cls: 'scroll', item: itemId };
      if (confused || it.buc === 'cursed') used = trapDetect(ctx, sobj);
      else {
        const r = goldDetect(ctx, sobj);
        used = r.nothing;
        if (r.known) known = true;
      }
      break;
    }
    case 'nh:scroll_of_food_detection': {
      const r = foodDetect(ctx, { buc: it.buc, cls: 'scroll', item: itemId });
      used = r.nothing;
      if (r.known) known = true;
      break;
    }
    case 'nh:scroll_of_magic_mapping':
      // ref: seffect_magic_mapping(): blessed, secret doors are found too (no level here
      // forbids magic mapping)
      if (it.buc === 'blessed') revealSecretDoors(ctx);
      known = true;
      magicMapping(ctx, it.buc === 'cursed', confused);
      break;
    case 'nh:scroll_of_genocide':
      // ref: seffect_genocide(): known at once; the scroll is used up before the prompt
      if (!wasKnown) msg(ctx, 'scroll.genocide.found');
      learnscrolltyp(ctx, def);
      useup(ctx, itemId);
      used = true;
      if (it.buc === 'blessed') doClassGenocide(ctx);
      else doGenocide(ctx, (it.buc !== 'cursed' ? REALLY : 0) | (confused ? PLAYER : 0));
      break;
    default:
      break;
  }
  if (!wasKnown && known) learnscrolltyp(ctx, def); // learnscroll()
  if (used) return;
  if (!blank) useup(ctx, itemId);
}

/**
 * "A map coalesces in your mind!" and the level is mapped; a cursed source (not confused)
 * maps it as a confused one would: "Unfortunately, you can't grasp the details."
 * ref: src/read.c seffect_magic_mapping() after the scroll's own part
 */
function magicMapping(ctx: Ctx, cursed: boolean, confused: boolean): void {
  msg(ctx, 'read.map_coalesces');
  const cval = cursed && !confused;
  doMapping(ctx, confused || cval); // HConfusion = 1 to screw up the map
  if (cval) msg(ctx, 'read.cant_grasp_details');
}

/**
 * A spell that duplicates a scroll (seffects() with the pseudo spellbook, blessed at Skilled):
 * remove curse, detect food, cause fear, identify, charm monster, magic mapping and create
 * monster (confuse monster is cast.ts's). ref: src/read.c seffects() SPE_* cases
 */
export function seffectsSpell(ctx: Ctx, book: DefId, blessed: boolean): void {
  const buc: Buc = blessed ? 'blessed' : 'uncursed';
  const confused = hasProp(heroEntity(ctx), P.CONFUSION);
  switch (book) {
    case 'nh:spellbook_of_remove_curse':
      removeCurse(ctx, buc, confused, null);
      break;
    case 'nh:spellbook_of_detect_food':
      foodDetect(ctx, { buc, cls: 'spellbook', item: null });
      break;
    case 'nh:spellbook_of_cause_fear':
      seffectScareMonster(ctx, { buc, spell: true }, confused);
      break;
    case 'nh:spellbook_of_identify':
      spellIdentify(ctx, buc);
      break;
    case 'nh:spellbook_of_charm_monster':
      seffectTaming(ctx, { buc, spell: true }, confused);
      break;
    case 'nh:spellbook_of_magic_mapping':
      magicMapping(ctx, false, confused);
      break;
    case 'nh:spellbook_of_create_monster':
      seffectCreateMonster(ctx, { buc, spell: true }, confused);
      break;
    default:
      break;
  }
}

/** `use` for every scroll in the subset (attached to the defs in index.ts). */
export const SCROLL_USES: Readonly<
  Record<string, (ctx: Ctx, user: EntityId, item: EntityId) => void>
> = {
  'nh:scroll_of_identify': readScroll,
  'nh:scroll_of_enchant_weapon': readScroll,
  'nh:scroll_of_enchant_armor': readScroll,
  'nh:scroll_of_remove_curse': readScroll,
  'nh:scroll_of_light': readScroll,
  'nh:scroll_of_teleportation': readScroll,
  'nh:scroll_of_gold_detection': readScroll,
  'nh:scroll_of_food_detection': readScroll,
  'nh:scroll_of_magic_mapping': readScroll,
  'nh:scroll_of_earth': readScroll,
  'nh:scroll_of_blank_paper': readScroll,
  'nh:scroll_of_destroy_armor': readScroll,
  'nh:scroll_of_confuse_monster': readScroll,
  'nh:scroll_of_scare_monster': readScroll,
  'nh:scroll_of_create_monster': readScroll,
  'nh:scroll_of_taming': readScroll,
  'nh:scroll_of_genocide': readScroll,
  'nh:scroll_of_amnesia': readScroll,
  'nh:scroll_of_fire': readScroll,
  'nh:scroll_of_charging': readScroll,
};

function itemArg(action: PlayerAction): unknown {
  return action.type === 'mod' ? (action.args as { item?: unknown } | undefined)?.item : undefined;
}

const read: ActionDef = {
  id: READ_ID,
  labelKey: 'action.nh:read',
  handles: 'mod',
  offer(ctx, target): Offer[] {
    if (target.kind !== 'item') return [];
    const e = heroScroll(ctx, target.id);
    const cls = e ? ctx.defs.object(e.def).class : null;
    if (!e || (cls !== 'scroll' && cls !== 'spellbook' && !isReadableWear(e.def))) return [];
    return [
      {
        action: { type: 'mod', action: READ_ID, args: { item: e.id } },
        labelKey: 'action.nh:read',
      },
    ];
  },
  // ref: src/read.c doread()
  perform(ctx, action) {
    const e = heroScroll(ctx, itemArg(action));
    if (!e) return 0;
    if (checkCapacity(ctx)) return 0;
    const def = ctx.defs.object(e.def);
    // ref: doread() T_SHIRT, ALCHEMY_SMOCK, HAWAIIAN_SHIRT
    if (isReadableWear(e.def)) return readWear(ctx, e) ? NORMAL_SPEED : 0;
    // ref: doread() `if (scroll->oclass == SPBOOK_CLASS) return study_book(scroll)`
    if (def.class === 'spellbook') return studyBook(ctx, e);
    if (def.class !== 'scroll' || !def.use) {
      msg(ctx, 'magic.silly_thing', { verb: { key: 'verb.read' } });
      return 0;
    }
    def.use(ctx, ctx.state.playerId, e.id);
    // an identify menu or a teleport prompt is waiting: the move is spent when it is answered
    return ctx.state.pendingPrompt ? 0 : NORMAL_SPEED;
  },
  answer(ctx, value, raw) {
    if (isStudyAsk(raw)) return answerStudy(ctx, value, raw);
    if (isGenoAsk(raw)) return answerGenocide(ctx, value, raw) ? 0 : NORMAL_SPEED;
    if (isSeffectAsk(raw)) return answerSeffect(ctx, value, raw);
    const data = raw as unknown as IdentifyData;
    if (data.stage !== 'identify') return 0;
    return identifyAnswer(ctx, value, data) ? 0 : NORMAL_SPEED;
  },
  // a spellbook starts the study occupation (nh:learn)
  continues: (ctx) => continuesStudy(ctx, false),
};

export const READ_ACTIONS: readonly ActionDef[] = [read];
