// The effects of the scrolls of destroy armor, confuse monster, scare monster, create monster,
// taming, amnesia, fire and charging (read.ts dispatches; genocide is genocide.ts). Below
// read.ts, cast.ts and zap.ts, which call into it.
// ref: src/read.c seffect_destroy_armor(), seffect_confuse_monster(), seffect_scare_monster(),
// seffect_create_monster(), seffect_taming(), maybe_tame(), seffect_amnesia(), forget(),
// seffect_fire(), can_center_cloud(), seffect_charging(), charge_ok(), recharge(), stripspe(),
// p_glow1(), p_glow2(), wand_explode(), disintegrate_cursed_armor(); src/do_wear.c some_armor(),
// disintegrate_arm(), destroy_arm(), count_worn_armor(); src/makemon.c create_critters()
//
// Not ported (see DEVIATIONS.md "Scrolls"): attribute exercise, shop charges for altered
// objects (costly_alteration()), being underwater, the steed, the "Maud" name check, the
// rechargeable tools (none exist: every tool gives "a feeling of loss"), selftouch() for
// gloves lost while wielding a cockatrice corpse, artifacts.
import {
  NORMAL_SPEED,
  cellIndex,
  cellRules,
  getLevel,
  getPlayer,
  inventoryOf,
  shownId,
  sortedIds,
  type Ctx,
  type DefId,
  type ArmorSlot,
  type Buc,
  type Entity,
  type EntityId,
  type Json,
  type MonsterDef,
  type Msg,
  type ObjectDef,
  type Pos,
  type PromptOption,
} from '@nh/core';
import { resist } from './buzz';
import { monsterIdAt } from './combat';
import { tamedog } from './dog';
import { adjAbon, armorOff } from './dowear';
import { erodeObj, type ErodeType } from './erode';
import { explode } from './explode';
import { eshkOf } from './eshk';
import { isSwallowed } from './engulfstate';
import { makemon } from './generation';
import { hcolor } from './hcolor';
import { losehp } from './hp';
import { ustuck } from './hackmove';
import { cantSeeSelf } from './invis';
import { NOINVSYM } from './items';
import { rechargeRing, ringGone } from './jewelry';
import { strangeFeeling, useup } from './magic';
import { heroSees } from './mongear';
import { monflee, stopFleeing } from './monflee';
import { isFrozen, unfreezeMonst } from './mstate';
import {
  erosionMatters,
  isCorrodeable,
  isCrackable,
  isMetallic,
  isFlammable,
  isRottable,
  isRustprone,
} from './material';
import { CHARGED_RINGS } from './objects';
import { isKnown } from './o_init';
import { xnameOf } from './objnam';
import { setmangry } from './peaceful';
import { canSpotMon } from './perception';
import { P, hasProp, makeConfused, makeStunned, timeoutLeft } from './props';
import { askPosition, positionAnswer } from './getpos';
import { drainWeaponSkill } from './skills';
import { burnAwaySlime } from './slimestate';
import { losespells } from './spell';
import { surfaceKey } from './terrain';
import { pwOf, setPw, setUspell, uspellOf } from './uenergy';
import { heroForm } from './upoly';

const READ_ID: DefId = 'nh:read';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const hero = (ctx: Pick<Ctx, 'state'>): Entity => getPlayer(ctx.state);
const blind = (ctx: Ctx): boolean => hasProp(hero(ctx), P.BLINDED);

const wornIn = (ctx: Ctx, slot: string): Entity | undefined =>
  inventoryOf(ctx.state, ctx.state.playerId).find((o) => o.c.item?.equipped === slot);

/** Pairs and plural stacks take plural verbs ("Your boots glow"). ref: otense() */
const isPlural = (def: ObjectDef, e: Entity): boolean =>
  (e.c.item?.quantity ?? 1) !== 1 || def.armor?.slot === 'boots' || def.armor?.slot === 'gloves';

const plSuffix = (ctx: Ctx, e: Entity): string =>
  isPlural(ctx.defs.object(e.def), e) ? '_pl' : '';

/**
 * What reads: a scroll's blessing, or the spell's pseudo object (`spell`: resisted at her level,
 * blessed at Skilled). ref: seffects() `sobj`
 */
export interface ScrollSource {
  buc: Buc;
  spell?: true;
}

/** What a scroll's effect tells doread(): `known` (gk.known), `used` (already used up). */
export interface SeffectResult {
  known?: boolean;
  used?: boolean;
}

// ---------------------------------------------------------------------------------------------
// armor

/** ref: src/do_wear.c some_armor(): the outer layer, or sometimes a helmet, gloves, boots, shield */
export function someArmor(ctx: Ctx): Entity | null {
  let h = wornIn(ctx, 'cloak') ?? wornIn(ctx, 'body') ?? wornIn(ctx, 'shirt') ?? null;
  for (const slot of ['helm', 'gloves', 'boots', 'shield']) {
    const o = wornIn(ctx, slot);
    if (o && (!h || ctx.rng.rn2(4) === 0)) h = o;
  }
  return h;
}

/** The worn armor in C's uarm, uarmc, uarmh, uarms, uarmg, uarmf, uarmu order. */
const ARMOR_ORDER = ['body', 'cloak', 'helm', 'shield', 'gloves', 'boots', 'shirt'] as const;

const wornArmor = (ctx: Ctx): Entity[] =>
  ARMOR_ORDER.map((s) => wornIn(ctx, s)).filter((o): o is Entity => o !== undefined);

/** ref: src/objnam.c cloak_simple_name(), suit_simple_name(), helm_simple_name(), shield_simple_name() */
function simpleName(ctx: Ctx, obj: Entity, slot: string): string {
  switch (slot) {
    case 'cloak':
      if (obj.def === 'nh:robe') return 'robe';
      if (obj.def === 'nh:mummy_wrapping') return 'wrapping';
      if (obj.def === 'nh:alchemy_smock')
        return isKnown(ctx.state, ctx.defs, obj.def) ? 'smock' : 'apron';
      return 'cloak';
    case 'body':
      return obj.def.endsWith('_mail') ? 'mail' : obj.def.endsWith('_jacket') ? 'jacket' : 'suit';
    case 'helm':
      return isMetallic(ctx.defs.object(obj.def)) ? 'helm' : 'hat';
    case 'shield':
      return obj.def === 'nh:shield_of_reflection' ? 'smooth_shield' : 'shield';
    default:
      return slot;
  }
}

/**
 * The armor piece `atmp` (or, null, the first in the cloak, suit, shirt, helmet, gloves, boots,
 * shield order; a cloak or suit that resists protects what is under it) crumbles to dust; true
 * when something was destroyed. Ordinary objects never resist, but the roll is made.
 * ref: src/do_wear.c disintegrate_arm(), maybe_destroy_armor(), wornarm_destroyed()
 */
export function disintegrateArm(ctx: Ctx, atmp: Entity | null): boolean {
  const resists = (): boolean => ctx.rng.rn2(100) < 0; // obj_resists(armor, 0, 90)
  const maybe = (slot: string): Entity | null => {
    const armor = wornIn(ctx, slot);
    if (armor && (!atmp || atmp.id === armor.id) && !resists()) return armor;
    return null;
  };
  let otmp: Entity | null = null;
  let slot: ArmorSlot | null = null;
  for (const s of ['cloak', 'body', 'shirt', 'helm', 'gloves', 'boots', 'shield'] as const) {
    otmp = maybe(s);
    if (otmp) {
      slot = s;
      break;
    }
  }
  if (!otmp || !slot) return false; // could not destroy anything
  const p = hero(ctx).c.pos;
  const level = getLevel(ctx.state);
  say(ctx, `scroll.disint.${slot}`, {
    name: { key: `scroll.armor_name.${simpleName(ctx, otmp, slot)}` },
    ...(p ? { surface: { key: surfaceKey(ctx, level, p.x, p.y) } } : {}),
  });
  // cancel_don() (no multi-turn donning), Cloak_off()/Armor_off()/&c, and useup()
  armorOff(ctx, otmp, slot);
  useup(ctx, otmp.id);
  ctx.interrupt(); // stop_occupation()
  return true;
}

/** ref: src/read.c disintegrate_cursed_armor(): a random cursed worn piece */
function disintegrateCursedArmor(ctx: Ctx): boolean {
  const armors = wornArmor(ctx).filter((o) => o.c.item?.buc === 'cursed');
  if (armors.length === 0) return false;
  return disintegrateArm(ctx, armors[ctx.rng.rn2(armors.length)] ?? null);
}

/** ref: src/do_wear.c obj_erode_type() */
function objErodeType(def: ObjectDef): ErodeType | null {
  if (isFlammable(def)) return 'burn';
  if (isRustprone(def)) return 'rust';
  if (isCrackable(def)) return 'crack';
  if (isRottable(def)) return 'rot';
  if (isCorrodeable(def)) return 'corrode';
  return null;
}

/**
 * 1 to 4 hits on random worn armor (non-erodeable pieces included): each erodes the piece by
 * its kind of erosion, destroying it past the worst; true when anything happened.
 * ref: src/do_wear.c destroy_arm()
 */
export function destroyArm(ctx: Ctx): boolean {
  const armors = wornArmor(ctx);
  const hits = ctx.rng.rn2(4) + 1;
  if (armors.length === 0) return false;
  let ret = false;
  for (let i = 0; i < hits; i++) {
    const otmp = armors[ctx.rng.rn2(armors.length)];
    if (!otmp || !ctx.state.entities[String(otmp.id)]) continue;
    const def = ctx.defs.object(otmp.def);
    const erosion = objErodeType(def);
    if (!erosionMatters(def) || erosion === null || otmp.c.item?.erodeproof) continue;
    const r = erodeObj(ctx, otmp, null, erosion, { verbose: true, destroy: true });
    if (r !== 'nothing') ret = true;
    if (r === 'destroyed') break;
  }
  if (ret) ctx.interrupt();
  return ret;
}

/** "Your <armor> glows purple for a moment." (blind: vibrates briefly). ref: p_glow2() */
function pGlow2(ctx: Ctx, obj: Entity, clr: 'purple' | 'blue'): void {
  const item = xnameOf(ctx.state, ctx.defs, obj);
  if (blind(ctx)) say(ctx, `scroll.vibrate_moment${plSuffix(ctx, obj)}`, { item });
  else say(ctx, `scroll.glow_moment${plSuffix(ctx, obj)}`, { item, color: hcolor(ctx, clr) });
}

/** "Your <obj> glows briefly." (blind: vibrates). ref: p_glow1() */
function pGlow1(ctx: Ctx, obj: Entity): void {
  const item = xnameOf(ctx.state, ctx.defs, obj);
  say(ctx, `scroll.${blind(ctx) ? 'vibrate' : 'glow'}_briefly${plSuffix(ctx, obj)}`, { item });
}

/** "Your <obj> glows feebly blue for a moment." ref: p_glow3() */
function pGlow3(ctx: Ctx, obj: Entity): void {
  const item = xnameOf(ctx.state, ctx.defs, obj);
  if (blind(ctx)) say(ctx, `scroll.vibrate_feebly${plSuffix(ctx, obj)}`, { item });
  else say(ctx, `scroll.glow_feebly${plSuffix(ctx, obj)}`, { item, color: hcolor(ctx, 'blue') });
}

/** ref: src/read.c seffect_destroy_armor() */
export function seffectDestroyArmor(
  ctx: Ctx,
  scroll: Entity,
  confused: boolean,
  wasKnown: boolean,
): SeffectResult {
  const otmp = someArmor(ctx);
  const buc = scroll.c.item?.buc ?? 'uncursed';
  if (confused) {
    if (!otmp) {
      strangeFeeling(ctx, scroll.id, 'scroll.bones_itch');
      return { used: true };
    }
    const it = otmp.c.item;
    if (!it) return {};
    pGlow2(ctx, otmp, 'purple');
    if (buc === 'cursed') it.erodeproof = true;
    else delete it.erodeproof;
    return {};
  }
  if (buc === 'cursed') {
    if (otmp?.c.item?.buc === 'cursed') {
      // armor and scroll both cursed
      const it = otmp.c.item;
      say(ctx, `scroll.vibrates${plSuffix(ctx, otmp)}`, {
        item: xnameOf(ctx.state, ctx.defs, otmp),
      });
      if (it.spe >= -6) {
        it.spe += -1;
        adjAbon(ctx, otmp, -1);
      }
      makeStunned(ctx, timeoutLeft(ctx.state, hero(ctx), P.STUNNED) + ctx.rng.rn2(10) + 10, true);
      return {};
    }
    return disintegrateArm(ctx, otmp) ? { known: true } : {};
  }
  if (otmp && buc === 'blessed' && wornArmor(ctx).length > 1) {
    if (!wasKnown) say(ctx, 'scroll.this_is', { what: '@nh:scroll_of_destroy_armor' });
    // the choice is asked once the scroll is gone
    useup(ctx, scroll.id);
    askArmor(ctx, otmp.id);
    return { known: true, used: true };
  }
  if (buc === 'blessed' && disintegrateCursedArmor(ctx)) return { known: true };
  if (!destroyArm(ctx)) {
    strangeFeeling(ctx, scroll.id, 'scroll.skin_itches');
    return { used: true };
  }
  return { known: true };
}

function askArmor(ctx: Ctx, fallback: EntityId): void {
  ctx.ask(
    {
      id: 'destroy-armor',
      kind: 'menu',
      key: 'scroll.what_destroy',
      options: wornArmor(ctx).map((e) => invOption(ctx, e)),
    },
    READ_ID,
    { stage: 'destroy_armor', fallback } as unknown as Json,
  );
}

/** The blessed scroll's choice: the picked worn armor, or some_armor()'s pick. */
function answerDestroyArmor(ctx: Ctx, value: Json, raw: Json): void {
  const fallback = (raw as { fallback?: unknown }).fallback;
  const picked = typeof value === 'number' ? value : null;
  const worn = wornArmor(ctx);
  const otmp = worn.find((o) => o.id === picked) ?? worn.find((o) => o.id === fallback) ?? null;
  disintegrateArm(ctx, otmp);
}

const invOption = (ctx: Ctx, e: Entity): PromptOption => ({
  value: e.id,
  key: 'inv.menu_item',
  ...(e.c.item?.letter ? { letter: e.c.item.letter } : {}),
  params: { letter: e.c.item?.letter ?? NOINVSYM, item: ctx.defs.itemName(ctx.state, e) },
  glyph: shownId(ctx.state, e.def),
});

// ---------------------------------------------------------------------------------------------
// confuse monster

/**
 * Confuse monster: the hero's hands glow red (umconf charges: a scroll 3 + 1-2, blessed 3 + 2-9;
 * the spell without the 3; one more once she has 40), and her next hand-to-hand hits confuse
 * monsters (combat.ts). A cursed scroll, or any read in a non-human form, confuses her instead
 * ("You feel confused."); confused, the glow is purple and confuses her more; blessed, it cures
 * her confusion. Blind or invisible, she feels a tingle. ref: src/read.c seffect_confuse_monster()
 */
export function confuseMonster(ctx: Ctx, blessed: boolean, cursed: boolean, scroll: boolean): void {
  const h = hero(ctx);
  const altfeedback = hasProp(h, P.BLINDED) || cantSeeSelf(ctx.state); // Blind || Invisible
  const conf = timeoutLeft(ctx.state, h, P.CONFUSION);
  const form = heroForm(ctx);
  if ((form && form.glyph.ch !== '@') || cursed) {
    if (!hasProp(h, P.CONFUSION)) say(ctx, 'scroll.feel_confused');
    makeConfused(ctx, conf + ctx.rng.rnd(100), false);
    return;
  }
  if (hasProp(h, P.CONFUSION)) {
    if (!blessed) {
      if (altfeedback) say(ctx, 'cast.hands_begin_tingle');
      else say(ctx, 'cast.hands_begin_glow', { color: hcolor(ctx, 'purple') });
      makeConfused(ctx, conf + ctx.rng.rnd(100), false);
    } else {
      if (altfeedback) say(ctx, 'cast.head_buzz');
      else say(ctx, 'cast.head_glow', { color: hcolor(ctx, 'red') });
      makeConfused(ctx, 0, true);
    }
    return;
  }
  const { umconf } = uspellOf(ctx.state);
  let incr = scroll ? 3 : 0; // scroll vs spell
  if (!blessed) {
    if (altfeedback) say(ctx, umconf ? 'cast.hands_tingle_more' : 'cast.hands_tingle');
    else if (!umconf) say(ctx, 'cast.hands_begin_glow', { color: hcolor(ctx, 'red') });
    else say(ctx, 'cast.glow_intensifies', { color: hcolor(ctx, 'red') });
    incr += ctx.rng.rnd(2);
  } else {
    if (altfeedback) say(ctx, umconf ? 'cast.hands_sharply_more' : 'cast.hands_sharply');
    else
      say(ctx, umconf ? 'cast.hands_brilliant_more' : 'cast.hands_brilliant', {
        color: hcolor(ctx, 'red'),
      });
    incr += ctx.rng.rn2(8) + 2; // rn1(8, 2)
  }
  // after a while, repeated uses become less effective
  if (umconf >= 40) incr = 1;
  setUspell(ctx, { umconf: umconf + incr });
}

// ---------------------------------------------------------------------------------------------
// scare monster

/**
 * Every monster the hero can see flees (unless it resists), or, confused or cursed, is woken
 * and stops fleeing; then "You hear maniacal laughter close by." (sad wailing when confused or
 * cursed; "in the distance" when only pets, or nothing, were in sight).
 * ref: src/read.c seffect_scare_monster()
 */
export function seffectScareMonster(ctx: Ctx, src: ScrollSource, confused: boolean): void {
  const cursed = src.buc === 'cursed';
  const oclass = src.spell ? 'spell' : 'scroll';
  let ct = 0;
  const lvl = ctx.state.currentLevel;
  for (const id of sortedIds(ctx.state)) {
    const mtmp = ctx.state.entities[String(id)];
    const m = mtmp?.c.monster;
    const p = mtmp?.c.pos;
    if (!mtmp || !m || id === ctx.state.playerId || p?.level !== lvl) continue;
    if (!heroSees(ctx, p)) continue;
    if (confused || cursed) {
      stopFleeing(ctx, id);
      if (isFrozen(ctx, id)) unfreezeMonst(ctx, id);
      m.asleep = false;
    } else if (!resist(ctx, mtmp, 0, oclass)) monflee(ctx, id, 0, false, false);
    if (!m.tame) ct++; // pets don't laugh at you
  }
  // the spell of cause fear is heard only when nothing was in sight
  if (src.spell && ct) return;
  say(ctx, confused || cursed ? 'scroll.scare.wailing' : 'scroll.scare.laughter', {
    where: { key: ct ? 'scroll.scare.close_by' : 'scroll.scare.distance' },
  });
}

// ---------------------------------------------------------------------------------------------
// create monster

/** ref: src/makemon.c create_critters(): true when the hero sees a new monster */
export function createCritters(ctx: Ctx, cnt: number, mptr: MonsterDef | null): boolean {
  let known = false;
  const p = hero(ctx).c.pos;
  if (!p) return false;
  while (cnt-- > 0) {
    const id = makemon(ctx, mptr, { x: p.x, y: p.y }, { adjacentOk: true });
    if (id === null) continue; // try again
    const mon = ctx.state.entities[String(id)];
    if (mon && canSpotMon(ctx, mon)) known = true;
  }
  return known;
}

/**
 * One monster (13 when confused or cursed, acid blobs when confused), and 1 time in 73 an
 * unblessed scroll adds 1-4 more. ref: src/read.c seffect_create_monster()
 */
export function seffectCreateMonster(
  ctx: Ctx,
  src: ScrollSource,
  confused: boolean,
): SeffectResult {
  const buc = src.buc;
  const cnt =
    1 +
    (confused || buc === 'cursed' ? 12 : 0) +
    (buc === 'blessed' || ctx.rng.rn2(73) ? 0 : ctx.rng.rnd(4));
  const acid = ctx.defs.isMonster('nh:acid_blob') ? ctx.defs.monster('nh:acid_blob') : null;
  return { known: createCritters(ctx, cnt, confused ? acid : null) };
}

// ---------------------------------------------------------------------------------------------
// taming

/**
 * The monster is hit by the scroll's taming: a cursed scroll angers it (-1 when a peaceful one
 * turns hostile), else it is tamed unless it resists (a shopkeeper is always pacified); 1 when
 * it became peaceful or tamer. ref: src/read.c maybe_tame()
 */
function maybeTame(ctx: Ctx, mtmp: Entity, buc: string, spell: boolean): number {
  const m = mtmp.c.monster;
  if (!m) return 0;
  const wasTame = m.tame ?? 0;
  const wasPeaceful = m.peaceful;
  if (buc === 'cursed') {
    setmangry(ctx, mtmp.id);
    return wasPeaceful && !m.peaceful ? -1 : 0;
  }
  if (!resist(ctx, mtmp, 0, spell ? 'spell' : 'scroll') || eshkOf(ctx, mtmp.id))
    tamedog(ctx, mtmp.id, null, false, () => undefined, buc === 'blessed');
  const after = ctx.state.entities[String(mtmp.id)]?.c.monster;
  if (!after) return 0;
  return (!wasPeaceful && after.peaceful) || wasTame !== (after.tame ?? 0) ? 1 : 0;
}

/**
 * The monsters next to the hero (within 5 squares when confused; her engulfer when swallowed)
 * may become tame: "The neighborhood is friendlier." (or "unfriendlier", "seems" when she saw no
 * change), "Nothing interesting seems to happen." ref: src/read.c seffect_taming()
 */
export function seffectTaming(ctx: Ctx, src: ScrollSource, confused: boolean): SeffectResult {
  const buc = src.buc;
  let candidates = 0;
  let results = 0;
  let visResults = 0;
  const stuck = ustuck(ctx);
  if (stuck !== null && isSwallowed(ctx)) {
    const mtmp = ctx.state.entities[String(stuck)];
    candidates = 1;
    if (mtmp) results = visResults = maybeTame(ctx, mtmp, buc, src.spell === true);
  } else {
    const p = hero(ctx).c.pos;
    const level = getLevel(ctx.state);
    const bd = confused ? 5 : 1;
    for (let i = -bd; i <= bd; i++)
      for (let j = -bd; j <= bd; j++) {
        if (!p) continue;
        const x = p.x + i;
        const y = p.y + j;
        if (x < 0 || y < 0 || x >= level.width || y >= level.height) continue; // isok()
        const id = monsterIdAt(ctx, { x, y }, level.id);
        if (id === null || id === ctx.state.playerId) continue;
        const mtmp = ctx.state.entities[String(id)];
        if (!mtmp) continue;
        ++candidates;
        const res = maybeTame(ctx, mtmp, buc, src.spell === true);
        results += res;
        if (ctx.state.entities[String(id)] && canSpotMon(ctx, mtmp)) visResults += res;
      }
  }
  if (!results) {
    say(ctx, candidates ? 'scroll.taming.nothing_seems' : 'scroll.taming.nothing');
    return {};
  }
  say(ctx, 'scroll.taming.neighborhood', {
    is: { key: visResults ? 'scroll.taming.is' : 'scroll.taming.seems' },
    un: results < 0 ? 'un' : '',
  });
  return { known: visResults > 0 };
}

// ---------------------------------------------------------------------------------------------
// amnesia

/**
 * The scroll of amnesia: forgets spells (not when blessed: forget(0)) and some weapon skills
 * (rnd(5) unblessed, rnd(3) blessed), then "Who was that Maud person anyway?" or "Thinking of
 * Maud you forget everything else." (hallucinating, "Your mind releases itself from mundane
 * concerns."). ref: src/read.c seffect_amnesia(), forget() (no ball and chain; monsters'
 * meverseen does not exist)
 */
export function seffectAmnesia(ctx: Ctx, scroll: Entity): SeffectResult {
  const blessed = scroll.c.item?.buc === 'blessed';
  // forget(howmuch): ALL_SPELLS unless blessed
  if (!blessed) losespells(ctx);
  drainWeaponSkill(ctx, ctx.rng.rnd(!blessed ? 5 : 3));
  if (hasProp(hero(ctx), P.HALLUC)) say(ctx, 'scroll.amnesia.mundane');
  else if (ctx.rng.rn2(2)) say(ctx, 'scroll.amnesia.maud_who');
  else say(ctx, 'scroll.amnesia.maud_thinking');
  return { known: true };
}

// ---------------------------------------------------------------------------------------------
// fire

interface FireData {
  stage: 'fire';
  dam: number;
}

const distu = (p: Pos, x: number, y: number): number => (p.x - x) ** 2 + (p.y - y) ** 2;

/**
 * Where a blessed scroll of fire may centre its explosion: a square she can see, within
 * `distu < 32`, that can hold a gas cloud (ACCESSIBLE: floor, doors, corridors).
 * ref: src/read.c can_center_cloud(), valid_cloud_pos()
 */
function canCenterCloud(ctx: Ctx, x: number, y: number): boolean {
  const level = getLevel(ctx.state);
  const p = hero(ctx).c.pos;
  if (!p || x < 0 || y < 0 || x >= level.width || y >= level.height) return false;
  const rules = cellRules(level, ctx.defs);
  const t = level.cells[cellIndex(level, x, y)] ?? 0;
  const accessible = rules.passable[t] === true || rules.closedDoor[t] === true;
  return accessible && heroSees(ctx, { level: level.id, x, y }) && distu(p, x, y) < 32;
}

/**
 * The scroll of fire: confused, it only burns her hands (1 damage, nothing with fire
 * resistance); else an explosion of fire around her, of (2 * (rn1(3, 3) + 2 * bcsign) + 1) / 3
 * damage, five times that where a blessed reader chooses to centre it. Used up and learned
 * (`learn`) before the effect. ref: src/read.c seffect_fire()
 */
export function seffectFire(
  ctx: Ctx,
  scroll: Entity,
  confused: boolean,
  wasKnown: boolean,
  learn: () => void,
): void {
  const buc = scroll.c.item?.buc ?? 'uncursed';
  const cval = buc === 'blessed' ? 1 : buc === 'cursed' ? -1 : 0;
  let dam = Math.trunc((2 * (ctx.rng.rn2(3) + 3 + 2 * cval) + 1) / 3);
  useup(ctx, scroll.id);
  if (!wasKnown) learn();
  const h = hero(ctx);
  if (confused) {
    if (hasProp(h, P.FIRE_RES)) {
      say(ctx, blind(ctx) ? 'scroll.fire.pleasant_warmth' : 'scroll.fire.pretty_fire');
    } else {
      say(ctx, 'scroll.fire.burn_hands');
      losehp(ctx, 1, '@killer.scroll_of_fire');
    }
    return;
  }
  const p = h.c.pos;
  if (!p) return;
  if (buc === 'blessed') {
    if (!wasKnown) say(ctx, 'scroll.this_is_fire');
    dam *= 5;
    const valid: Pos[] = [];
    for (let dx = -6; dx <= 6; dx++)
      for (let dy = -6; dy <= 6; dy++) {
        const x = p.x + dx;
        const y = p.y + dy;
        if ((dx || dy) && canCenterCloud(ctx, x, y)) valid.push({ x, y });
      }
    askPosition(ctx, 'scroll.fire.where', READ_ID, { stage: 'fire', dam } as unknown as Json, {
      id: 'fire-center',
      start: { x: p.x, y: p.y },
      valid,
    });
    return;
  }
  fireAt(ctx, p.x, p.y, dam);
}

function fireAt(ctx: Ctx, x: number, y: number, dam: number): void {
  const p = hero(ctx).c.pos;
  if (p && p.x === x && p.y === y) {
    say(ctx, 'scroll.fire.tower');
    burnAwaySlime(ctx);
  }
  explode(ctx, x, y, { scroll: true, by: 'hero' }, dam, 'fiery');
}

/** The blessed scroll's centre: too far or unseen (or cancelled), it is her own square. */
function answerFire(ctx: Ctx, value: Json, data: FireData): void {
  const p = hero(ctx).c.pos;
  if (!p) return;
  const at = positionAnswer(value);
  // try to reach too far, get burned
  const cc = at && canCenterCloud(ctx, at.x, at.y) ? at : { x: p.x, y: p.y };
  fireAt(ctx, cc.x, cc.y, data.dam);
}

// ---------------------------------------------------------------------------------------------
// charging

interface ChargeData {
  stage: 'charge';
  /** -1 cursed, 1 blessed, 0 uncursed */
  curseBless: number;
}

/** ref: src/read.c charge_ok(): 'suggest', 'selectable' or 'exclude' */
function chargeOk(ctx: Ctx, obj: Entity): 'suggest' | 'selectable' | 'exclude' {
  const def = ctx.defs.object(obj.def);
  if (def.class === 'wand') return 'suggest';
  if (def.class === 'ring' && CHARGED_RINGS.has(def.id) && isKnown(ctx.state, ctx.defs, def))
    return 'suggest';
  if (def.class === 'tool') return 'exclude'; // no chargeable tool exists (weptools excluded too)
  // why are weapons/armor considered charged anyway? selectable for the "feeling of loss"
  return 'selectable';
}

/**
 * The scroll of charging: confused, it restores (or, cursed, drains) her energy ("You feel
 * charged up!": d(4, 4), d(6, 4) blessed, raising the maximum when that is passed; "You feel
 * discharged."); else "This is a charging scroll." when unknown, then it is used up and she
 * picks what to charge. ref: src/read.c seffect_charging()
 */
export function seffectCharging(
  ctx: Ctx,
  scroll: Entity,
  confused: boolean,
  wasKnown: boolean,
  learn: () => void,
): SeffectResult {
  const buc = scroll.c.item?.buc ?? 'uncursed';
  if (confused) {
    if (buc === 'cursed') {
      say(ctx, 'scroll.charging.discharged');
      setPw(ctx, { uen: 0 });
    } else {
      say(ctx, 'scroll.charging.charged_up');
      const pw = pwOf(ctx.state);
      const uen = pw.uen + ctx.rng.d(buc === 'blessed' ? 6 : 4, 4);
      // if current energy is already at or near maximum, increase maximum; otherwise restore
      // current to max
      if (uen > pw.uenmax) setPw(ctx, { uen, uenmax: uen });
      else setPw(ctx, { uen: pw.uenmax });
    }
    return {};
  }
  if (!wasKnown) {
    say(ctx, 'scroll.charging.this_is');
    learn();
  }
  // use it up now to prevent it from showing in the getobj picklist
  useup(ctx, scroll.id);
  const options = inventoryOf(ctx.state, ctx.state.playerId)
    .filter((o) => chargeOk(ctx, o) !== 'exclude')
    .map((o) => invOption(ctx, o));
  if (options.length === 0) {
    say(ctx, 'scroll.charging.nothing');
    return { used: true };
  }
  ctx.ask({ id: 'charge', kind: 'menu', key: 'scroll.charging.what', options }, READ_ID, {
    stage: 'charge',
    curseBless: buc === 'cursed' ? -1 : buc === 'blessed' ? 1 : 0,
  } as unknown as Json);
  return { used: true };
}

/** "Your wand vibrates briefly." and its charges gone, or "Nothing happens.". ref: stripspe() */
function stripspe(ctx: Ctx, obj: Entity): void {
  const it = obj.c.item;
  if (!it) return;
  if (it.buc === 'blessed' || it.spe <= 0) say(ctx, 'zap.nothing_happens');
  else {
    say(ctx, `scroll.vibrate_briefly${plSuffix(ctx, obj)}`, {
      item: xnameOf(ctx.state, ctx.defs, obj),
    });
    it.spe = 0;
  }
}

/** ref: src/read.c wand_explode(): d(spe + chg, k) damage and the wand is gone */
export function wandExplode(ctx: Ctx, obj: Entity, chg: number): void {
  const it = obj.c.item;
  if (!it) return;
  const expl = chg ? 'scroll.wand.violently' : 'scroll.wand.suddenly';
  if (!chg) chg = 2; // zap/engrave adjustment
  const n = Math.max(2, it.spe + chg); // arbitrary minimum
  const k =
    obj.def === 'nh:wand_of_wishing'
      ? 12
      : [
            'nh:wand_of_cancellation',
            'nh:wand_of_death',
            'nh:wand_of_polymorph',
            'nh:wand_of_undead_turning',
          ].includes(obj.def)
        ? 10
        : [
              'nh:wand_of_cold',
              'nh:wand_of_fire',
              'nh:wand_of_lightning',
              'nh:wand_of_magic_missile',
            ].includes(obj.def)
          ? 8
          : obj.def === 'nh:wand_of_nothing'
            ? 4
            : 6;
  const dmg = ctx.rng.d(n, k);
  say(ctx, expl, { item: xnameOf(ctx.state, ctx.defs, obj) });
  useup(ctx, obj.id);
  losehp(ctx, dmg, '@killer.exploding_wand');
}

/**
 * Recharges a wand (it may explode after earlier rechargings), a charged ring (it may explode
 * if already well charged) or nothing else ("You have a feeling of loss.").
 * `curseBless`: -1 cursed, 1 blessed, 0 uncursed. ref: src/read.c recharge()
 */
export function recharge(ctx: Ctx, obj: Entity, curseBless: number): void {
  const it = obj.c.item;
  if (!it) return;
  const def = ctx.defs.object(obj.def);
  const isCursed = curseBless < 0;
  const isBlessed = curseBless > 0;
  if (def.class === 'wand') {
    const lim = obj.def === 'nh:wand_of_wishing' ? 1 : def.wand?.dir !== 'nodir' ? 8 : 15;
    // undo any prior cancellation, even when is_cursed
    if (it.spe === -1) it.spe = 0;
    // recharging might cause wands to explode
    const n = it.recharged ?? 0;
    if (n > 0 && (obj.def === 'nh:wand_of_wishing' || n * n * n > ctx.rng.rn2(7 * 7 * 7))) {
      wandExplode(ctx, obj, ctx.rng.rnd(lim));
      return;
    }
    // didn't explode, so increment the recharge count
    it.recharged = n + 1;
    if (isCursed) stripspe(ctx, obj);
    else {
      let m = lim === 1 ? 1 : ctx.rng.rn2(5) + lim + 1 - 5;
      if (!isBlessed) m = ctx.rng.rnd(m);
      if (it.spe < m) it.spe = m;
      else it.spe++;
      if (obj.def === 'nh:wand_of_wishing' && it.spe > 3) {
        wandExplode(ctx, obj, 1);
        return;
      }
      if (lim === 1) pGlow3(ctx, obj);
      else if (it.spe >= lim) pGlow2(ctx, obj, 'blue');
      else pGlow1(ctx, obj);
    }
  } else if (def.class === 'ring' && CHARGED_RINGS.has(def.id)) {
    // charging does not affect ring's curse/bless status
    let s = isBlessed ? ctx.rng.rnd(3) : isCursed ? -ctx.rng.rnd(2) : 1;
    // destruction depends on current state, not adjustment
    if (it.spe > ctx.rng.rn2(7) || it.spe <= -5) {
      say(ctx, 'scroll.ring.explodes', { item: xnameOf(ctx.state, ctx.defs, obj) });
      if (it.equipped === 'ringL' || it.equipped === 'ringR') ringGone(ctx, obj);
      s = ctx.rng.rnd(3 * Math.abs(it.spe)); // amount of damage
      useup(ctx, obj.id);
      losehp(ctx, s, '@killer.exploding_ring');
      return;
    }
    say(ctx, s < 0 ? 'scroll.ring.spins_counter' : 'scroll.ring.spins', {
      item: xnameOf(ctx.state, ctx.defs, obj),
    });
    rechargeRing(ctx, obj, s);
  } else {
    say(ctx, 'scroll.charging.loss');
  }
  // prevent enchantment from getting out of range
  it.spe = Math.max(-99, Math.min(99, it.spe)); // cap_spe()
}

function answerCharge(ctx: Ctx, value: Json, data: ChargeData): void {
  if (typeof value !== 'number') return;
  const obj = ctx.state.entities[String(value)];
  if (obj?.c.item?.carriedBy !== ctx.state.playerId) return;
  recharge(ctx, obj, data.curseBless);
}

// ---------------------------------------------------------------------------------------------
// the prompts

/** Whether the prompt data belongs to one of these scrolls. */
export const isSeffectAsk = (raw: Json): boolean => {
  const s = (raw as { stage?: unknown } | null)?.stage;
  return s === 'destroy_armor' || s === 'fire' || s === 'charge';
};

/** Answers a destroy armor, fire or charging prompt: the move's energy. */
export function answerSeffect(ctx: Ctx, value: Json, raw: Json): number {
  const stage = (raw as { stage?: unknown }).stage;
  if (stage === 'destroy_armor') answerDestroyArmor(ctx, value, raw);
  else if (stage === 'fire') answerFire(ctx, value, raw as unknown as FireData);
  else if (stage === 'charge') answerCharge(ctx, value, raw as unknown as ChargeData);
  return NORMAL_SPEED;
}
