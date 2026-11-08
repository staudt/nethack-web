// Fountains: their state, drinking from one, and drying up (with the Watch's warning in town).
// ref: src/fountain.c drinkfountain(), dipfountain(), wash_hands(), dowatersnakes(),
// dowaterdemon(), dowaternymph(), dogushforth(), gush(), dofindgem(), dryup();
// src/potion.c mongrantswish()
//
// The state lives in `modData.nh.fountains[levelId][cellIndex]` as bits (C keeps them in the
// location: `blessedftn` and the `looted` flags). An entry is dropped when its bits are 0.
// Not ported (DEVIATIONS "Quaffing"): the enlightenment screen, pools from gushing
// water (the rolls are drawn, no pool is made), hallucinated snake and liquid names, exercise.
// Dipping (DEVIATIONS "Dipping"): no Excalibur (no artifacts; the only role is neutral, so the
// Lady of the Lake always refuses), no Glib, no livelog.
import {
  NORMAL_SPEED,
  cellIndex,
  getLevel,
  getPlayer,
  inTown,
  inventoryOf,
  isVisible,
  sortedIds,
  trapAt,
  type ActionDef,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type Json,
  type Level,
  type LevelId,
  type Msg,
  type Offer,
  type PlayerAction,
  type Pos,
} from '@nh/core';
import { adjattrib, type Attr } from './attrib';
import { monsterDetect } from './detect';
import { GLASS_GEMS, REAL_GEMS, gemLedger, rndClass } from './gem';
import { makemon } from './generation';
import { somegold } from './steal';
import { losehp, losestr } from './hp';
import { morehungry, newuhs, vomit } from './hunger';
import { uState } from './luck';
import { mkgold, removeFromInventory } from './items';
import { mksobjFull } from './mkobj';
import { moneyCnt } from './money';
import { monflee } from './monflee';
import { forgetMonster } from './mongear';
import { forgetMState } from './mstate';
import { monNam } from './perception';
import { P, hasProp, setIntrinsic, wornIn } from './props';
import { cantSeeSelf } from './invis';
import { clearArea } from './read';
import { T, setTerrain } from './terrain';
import { levitating } from './trapstate';
import { dungeonBottom, mintrap } from './trap';
import { angryGuards, watchmanWarnFountain } from './watch';
import { waterDamage, type WaterResult } from './water';
import { answerWish, askWish, type WishData } from './wish';

/** blessedftn: a magic fountain. */
export const FTN_MAGIC = 1;
/** F_LOOTED: the gem has been found (or the bath taken). */
export const FTN_LOOTED = 2;
/** F_WARNED: the Watch has warned the hero about this fountain. */
export const FTN_WARNED = 4;

type FountainTable = Record<LevelId, Record<string, number>>;

function fountainTable(state: Readonly<Ctx['state']>, create: boolean): FountainTable | null {
  const md = state.modData;
  const nh = md['nh'] as { fountains?: FountainTable } | undefined;
  if (nh?.fountains) return nh.fountains;
  if (!create) return null;
  const d = (md['nh'] ??= {}) as { fountains?: FountainTable };
  d.fountains = {};
  return d.fountains;
}

/** The state bits of the fountain at x,y (0 when none are set). */
export function fountainBits(
  state: Readonly<Ctx['state']>,
  level: LevelId,
  x: number,
  y: number,
): number {
  const l = state.levels[level];
  if (!l) return 0;
  return fountainTable(state, false)?.[level]?.[String(cellIndex(l, x, y))] ?? 0;
}

/** Sets the state bits of the fountain at x,y; 0 drops the entry. */
export function setFountainBits(
  ctx: Pick<Ctx, 'state'>,
  level: LevelId,
  x: number,
  y: number,
  bits: number,
): void {
  const l = ctx.state.levels[level];
  if (!l) return;
  const key = String(cellIndex(l, x, y));
  if (bits) {
    const t = fountainTable(ctx.state, true);
    if (t) (t[level] ??= {})[key] = bits;
    return;
  }
  const t = fountainTable(ctx.state, false);
  const lt = t?.[level];
  if (!t || !lt) return;
  delete lt[key];
  if (Object.keys(lt).length === 0) delete t[level];
}

const isFountain = (level: Level, x: number, y: number): boolean =>
  level.palette[level.cells[cellIndex(level, x, y)] ?? 0] === T.fountain;

/** The hero's square when she stands on a fountain, else null. */
export function heroOnFountain(ctx: Pick<Ctx, 'state'>): Pos | null {
  const p = getPlayer(ctx.state).c.pos;
  const level = p ? ctx.state.levels[p.level] : undefined;
  if (!p || !level || !isFountain(level, p.x, p.y)) return null;
  return { x: p.x, y: p.y };
}

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const blind = (ctx: Ctx): boolean => hasProp(getPlayer(ctx.state), P.BLINDED);

/**
 * Takes a fountain away 1 time in 3 (always once warned about). In town the first time only
 * warns: a watchman in sight yells, else "The flow reduces to a trickle.". A dried fountain
 * becomes floor and, in town, angers the Watch. No wizard-mode "Dry up fountain?" question.
 * ref: src/fountain.c dryup()
 */
export function dryup(ctx: Ctx, x: number, y: number, isyou: boolean): void {
  const level = getLevel(ctx.state);
  if (!isFountain(level, x, y)) return;
  const bits = fountainBits(ctx.state, level.id, x, y);
  const warned = (bits & FTN_WARNED) !== 0;
  if (ctx.rng.rn2(3) && !warned) return;
  if (isyou && inTown(level, x, y) && !warned) {
    setFountainBits(ctx, level.id, x, y, bits | FTN_WARNED);
    // warn about future fountain use
    if (!watchmanWarnFountain(ctx)) say(ctx, 'fountain.trickle');
    return;
  }
  // cansee(x, y): only the hero's own fountain dries up here
  if (!blind(ctx)) say(ctx, 'fountain.dries_up');
  setTerrain(level, x, y, T.floor);
  setFountainBits(ctx, level.id, x, y, 0);
  if (isyou && inTown(level, x, y)) angryGuards(ctx, false);
}

/**
 * A sink broken by digging becomes a fountain with its gem already found: "The pipes break!
 * Water spurts out!". ref: src/fountain.c breaksink()
 */
export function breaksink(ctx: Ctx, x: number, y: number): void {
  const level = getLevel(ctx.state);
  const p = getPlayer(ctx.state).c.pos;
  const atU = p?.x === x && p.y === y;
  if (atU || isVisible(ctx.state, cellIndex(level, x, y))) say(ctx, 'fountain.pipes_break');
  setTerrain(level, x, y, T.fountain);
  setFountainBits(ctx, level.id, x, y, FTN_LOOTED); // SET_FOUNTAIN_LOOTED
}

const WATER_MOCCASIN: DefId = 'nh:water_moccasin';
const WATER_DEMON: DefId = 'nh:water_demon';
const WATER_NYMPH: DefId = 'nh:water_nymph';

/** A monster made at the hero's square falls into a trap there. */
function trapHere(ctx: Ctx, id: EntityId): void {
  const p = ctx.state.entities[String(id)]?.c.pos;
  const level = p ? ctx.state.levels[p.level] : undefined;
  if (p && level && trapAt(level, p.x, p.y)) mintrap(ctx, id);
}

/** Fountain of snakes: rn1(5, 2) water moccasins. ref: src/fountain.c dowatersnakes() */
function dowatersnakes(ctx: Ctx): void {
  // genocide and extinction are not tracked: the snakes always come
  let num = ctx.rng.rn2(5) + 2;
  say(ctx, blind(ctx) ? 'fountain.hissing' : 'fountain.snakes');
  const pos = getPlayer(ctx.state).c.pos;
  if (!pos) return;
  while (num-- > 0) {
    const id = makemon(ctx, ctx.defs.monster(WATER_MOCCASIN), pos, { adjacentOk: true });
    if (id !== null) trapHere(ctx, id);
  }
}

/** The wish in progress from a water demon, with the fountain to dry up after it. */
export interface FountainWishData extends WishData {
  fountain: { x: number; y: number };
}

/**
 * mongone(): the monster leaves the game with everything it carries.
 * ref: src/mon.c mongone() (discard_minvent(), m_detach())
 */
function mongone(ctx: Ctx, id: EntityId): void {
  for (const o of inventoryOf(ctx.state, id)) ctx.remove(o.id);
  forgetMonster(ctx, id);
  forgetMState(ctx, id);
  ctx.remove(id);
}

/**
 * Water demon: hostile, or 1 time in (20 - depth) per 100 grateful and granting a wish (the
 * wish prompt is left pending for `action`; returns true then). ref: src/fountain.c
 * dowaterdemon(), src/potion.c mongrantswish()
 */
function dowaterdemon(ctx: Ctx, action: DefId, at: Pos): boolean {
  const id = makemon(ctx, ctx.defs.monster(WATER_DEMON), at, { adjacentOk: true });
  const mon = id === null ? undefined : ctx.state.entities[String(id)];
  if (id === null || !mon) return false;
  if (!blind(ctx)) say(ctx, 'fountain.unleash', { mon: monNam(ctx, mon) });
  else say(ctx, 'fountain.presence_of_evil');
  // give those on low levels a (slightly) better chance of survival
  if (ctx.rng.rnd(100) > 80 + getLevel(ctx.state).depth) {
    say(ctx, 'fountain.grateful');
    mongone(ctx, id);
    const data: FountainWishData = { tries: 0, wizard: false, fountain: { x: at.x, y: at.y } };
    askWish(ctx, action, data);
    return true;
  }
  trapHere(ctx, id);
  return false;
}

/**
 * Water nymph: "You attract a water nymph!" (or "You hear a seductive voice." blind), awake;
 * if none can be made (no room), the bubble. ref: src/fountain.c dowaternymph() (genocide and
 * extinction are not tracked)
 */
function dowaternymph(ctx: Ctx): void {
  const pos = getPlayer(ctx.state).c.pos;
  const id = pos ? makemon(ctx, ctx.defs.monster(WATER_NYMPH), pos, { adjacentOk: true }) : null;
  const mon = id === null ? undefined : ctx.state.entities[String(id)];
  if (id !== null && mon?.c.monster) {
    if (!blind(ctx))
      say(ctx, 'fountain.attract', { mon: monNam(ctx, mon) }); // a_monnam()
    else say(ctx, 'fountain.seductive_voice');
    mon.c.monster.asleep = false;
    trapHere(ctx, id);
  } else say(ctx, blind(ctx) ? 'fountain.loud_pop' : 'fountain.bubble_pops');
}

/** ref: rm.h IS_DOOR() || SDOOR on the eight squares around x,y. ref: src/mkroom.c nexttodoor() */
function nexttodoor(ctx: Ctx, level: Level, x: number, y: number): boolean {
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= level.width || ny >= level.height) continue;
      const tid = level.palette[level.cells[cellIndex(level, nx, ny)] ?? 0];
      if (tid === undefined) continue;
      if (ctx.defs.terrain(tid).door !== undefined || SDOORS.has(tid)) return true;
    }
  return false;
}

const SDOORS: ReadonlySet<DefId> = new Set([
  T.sdoor_v,
  T.sdoor_h,
  T.sdoor_locked_v,
  T.sdoor_locked_h,
]);

/**
 * Gushing water: gush() is tried on every square the hero could see within 7, with its rolls,
 * but no pool terrain exists, so none is made and the hero is told so ("Your thirst is
 * quenched." / "Water sprays all over you."). ref: src/fountain.c dogushforth(), gush()
 */
export function dogushforth(ctx: Ctx, drinking: boolean): void {
  const level = getLevel(ctx.state);
  const u = getPlayer(ctx.state).c.pos;
  if (!u) return;
  for (const i of clearArea(ctx, 7)) {
    const x = i % level.width;
    const y = (i - x) / level.width;
    if ((x + y) % 2 || (x === u.x && y === u.y)) continue;
    const distmin = Math.max(Math.abs(x - u.x), Math.abs(y - u.y));
    if (ctx.rng.rn2(1 + distmin)) continue;
    if (level.palette[level.cells[i] ?? 0] !== T.floor) continue;
    if (nexttodoor(ctx, level, x, y)) continue;
    // a pool would be made here (no boulders or pools exist)
  }
  say(ctx, drinking ? 'fountain.thirst_quenched' : 'fountain.water_sprays');
}

/**
 * A gem or a piece of glass in the sparkling waters (once per fountain).
 * ref: src/fountain.c dofindgem(): rnd_class(DILITHIUM_CRYSTAL, LUCKSTONE - 1)
 */
function dofindgem(ctx: Ctx, at: Pos): void {
  say(ctx, blind(ctx) ? 'fountain.feel_gem' : 'fountain.spot_gem');
  const level = getLevel(ctx.state);
  const id = rndClass(
    ctx.rng,
    ctx.defs,
    [...REAL_GEMS, ...GLASS_GEMS],
    gemLedger(ctx.state, level.id),
  );
  mksobjFull(ctx, ctx.defs.object(id), {
    init: false,
    at: { level: level.id, x: at.x, y: at.y },
  });
  setFountainBits(
    ctx,
    level.id,
    at.x,
    at.y,
    fountainBits(ctx.state, level.id, at.x, at.y) | FTN_LOOTED,
  );
}

/** ref: include/attrib.h A_STR..A_CHA */
const ATTRS: readonly Attr[] = ['str', 'int', 'wis', 'dex', 'con', 'cha'];

/**
 * Drinks from the fountain the hero stands on: the outcome of rnd(30), then dryup(). Returns
 * the time taken (0 while a wish prompt is pending: the move is spent when it is answered,
 * see answerFountainWish()). ref: src/fountain.c drinkfountain()
 */
export function drinkfountain(ctx: Ctx, action: DefId): number {
  const at = heroOnFountain(ctx);
  if (!at) return 0;
  if (levitating(ctx)) {
    say(ctx, 'lev.floating_above', { what: '@surface.fountain' }); // floating_above()
    return 0;
  }
  const level = getLevel(ctx.state);
  const hero = getPlayer(ctx.state);
  const bits = fountainBits(ctx.state, level.id, at.x, at.y);
  const mgkftn = (bits & FTN_MAGIC) !== 0;
  const fate = ctx.rng.rnd(30);
  const uluck = uState(ctx.state).luck;

  if (mgkftn && uluck >= 0 && fate >= 10) {
    const littleluck = uluck < 4;
    say(ctx, 'fountain.feel_great');
    // blessed restore ability: no peak values (AMAX) are kept, so nothing to restore
    // gain ability, blessed if "natural" luck is high
    let i = ctx.rng.rn2(ATTRS.length); // start at a random attribute
    for (let ii = 0; ii < ATTRS.length; ii++) {
      if (adjattrib(ctx, ATTRS[i] as Attr, 1, true) && littleluck) break;
      if (++i >= ATTRS.length) i = 0;
    }
    say(ctx, 'fountain.wisp');
    setFountainBits(ctx, level.id, at.x, at.y, bits & ~FTN_MAGIC);
    return NORMAL_SPEED;
  }

  if (fate < 10) {
    say(ctx, 'fountain.cool_draught');
    const h = hero.c.hunger;
    if (h) {
      h.nutrition += ctx.rng.rnd(10); // don't choke on water
      newuhs(ctx, false);
    }
    if (mgkftn) return NORMAL_SPEED;
  } else {
    switch (fate) {
      case 19: // self-knowledge
        say(ctx, 'fountain.self_knowledgeable');
        say(ctx, 'fountain.feeling_subsides');
        break;
      case 20: // foul water
        say(ctx, 'fountain.foul');
        morehungry(ctx, ctx.rng.rn2(20) + 11);
        vomit(ctx);
        break;
      case 21: // poisonous
        say(ctx, 'fountain.contaminated');
        if (hasProp(hero, P.POISON_RES)) {
          say(ctx, 'fountain.fruit_farm');
          losehp(ctx, ctx.rng.rnd(4), '@killer.unrefrigerated_juice');
          break;
        }
        {
          // poison_strdmg(rn1(4, 3), rnd(10), ...)
          const strloss = ctx.rng.rn2(4) + 3;
          const dmg = ctx.rng.rnd(10);
          losestr(ctx, strloss, '@killer.contaminated_water');
          if (!ctx.state.gameOver) losehp(ctx, dmg, '@killer.contaminated_water');
        }
        break;
      case 22: // fountain of snakes!
        dowatersnakes(ctx);
        break;
      case 23: // water demon
        if (dowaterdemon(ctx, action, at)) return 0;
        break;
      case 24: {
        // maybe curse some items; more severe than rndcurse()
        say(ctx, 'fountain.no_good');
        morehungry(ctx, ctx.rng.rn2(20) + 11);
        for (const obj of inventoryOf(ctx.state, ctx.state.playerId)) {
          const it = obj.c.item;
          if (!it || ctx.defs.object(obj.def).class === 'coin') continue;
          if (it.buc !== 'cursed' && !ctx.rng.rn2(5)) it.buc = 'cursed';
        }
        break;
      }
      case 25: // see invisible
        if (blind(ctx)) {
          if (cantSeeSelf(ctx.state)) say(ctx, 'fountain.feel_transparent');
          else {
            say(ctx, 'fountain.self_conscious');
            say(ctx, 'fountain.then_passes');
          }
        } else {
          say(ctx, 'fountain.stalking_image');
          say(ctx, 'fountain.it_disappears');
        }
        setIntrinsic(getPlayer(ctx.state), P.SEE_INVIS, true); // HSee_invisible |= FROMOUTSIDE
        break;
      case 26: // see monsters
        if (monsterDetect(ctx)) say(ctx, 'fountain.tastes_like_nothing');
        break;
      case 27: // find a gem in the sparkling waters
        if (!(bits & FTN_LOOTED)) dofindgem(ctx, at);
        else dowaternymph(ctx); // C falls through to the nymph
        break;
      case 28: // water nymph
        dowaternymph(ctx);
        break;
      case 29: // scare
        say(ctx, 'fountain.bad_breath');
        for (const id of sortedIds(ctx.state)) {
          const e = ctx.state.entities[String(id)];
          if (e?.c.monster && id !== ctx.state.playerId && e.c.pos?.level === level.id)
            monflee(ctx, id, 0, false, false);
        }
        break;
      case 30: // gushing forth in this room
        dogushforth(ctx, true);
        break;
      default:
        say(ctx, 'fountain.tepid');
        break;
    }
  }
  if (ctx.state.gameOver) return NORMAL_SPEED;
  dryup(ctx, at.x, at.y, true);
  return NORMAL_SPEED;
}

/**
 * The answer to a water demon's wish prompt: the wish, then (once it is made) the fountain may
 * dry up, in C's message order. Returns the time taken: 0 while the prompt is asked again.
 */
export function answerFountainWish(ctx: Ctx, action: DefId, value: Json, raw: Json): number {
  const data = raw as unknown as FountainWishData;
  answerWish(ctx, action, value, data);
  if (ctx.state.pendingPrompt) return 0;
  if (!ctx.state.gameOver) dryup(ctx, data.fountain.x, data.fountain.y, true);
  return NORMAL_SPEED;
}

/**
 * Washing the hero's hands: worn gloves get wet (no Glib exists). ref: src/fountain.c
 * wash_hands()
 */
function washHands(ctx: Ctx): WaterResult {
  const gloves = wornIn(ctx.state, ctx.state.playerId, 'gloves');
  say(ctx, gloves ? 'fountain.wash_gloved_hands' : 'fountain.wash_hands');
  return gloves ? waterDamage(ctx, gloves, null, true) : 'nothing';
}

/** The bath: a tenth of somegold() is lost from the coin stacks. ref: dipfountain() case 28 */
function takeBath(ctx: Ctx, at: Pos): void {
  let money = moneyCnt(ctx, ctx.state.playerId);
  if (money <= 10) return;
  // amount to lose; might get rounded up as fountains don't pay change
  money = Math.trunc(somegold(ctx, money) / 10);
  for (const otmp of inventoryOf(ctx.state, ctx.state.playerId)) {
    if (money <= 0) break;
    const def = ctx.defs.object(otmp.def);
    const it = otmp.c.item;
    if (def.class !== 'coin' || !it) continue;
    const denomination = def.cost;
    const coinLoss = Math.min(Math.trunc((money + denomination - 1) / denomination), it.quantity);
    it.quantity -= coinLoss;
    money -= coinLoss * denomination;
    if (!it.quantity) {
      removeFromInventory(ctx, otmp.id);
      ctx.remove(otmp.id); // delobj()
    }
  }
  say(ctx, 'fountain.lost_gold');
  const level = getLevel(ctx.state);
  setFountainBits(
    ctx,
    level.id,
    at.x,
    at.y,
    fountainBits(ctx.state, level.id, at.x, at.y) & ~FTN_LOOTED,
  );
}

const LONG_SWORD: DefId = 'nh:long_sword';

/**
 * Dips an item (or the hero's hands) into the fountain she stands on: the Lady of the Lake for
 * a long sword, else water damage and then the outcome of rnd(30), then dryup(). Returns the
 * time taken (0 while a water demon's wish prompt is pending). ref: src/fountain.c
 * dipfountain()
 */
export function dipfountain(ctx: Ctx, action: DefId, obj: Entity | 'hands'): number {
  const at = heroOnFountain(ctx);
  if (!at) return 0;
  if (levitating(ctx)) {
    say(ctx, 'lev.floating_above', { what: '@surface.fountain' }); // floating_above()
    return 0;
  }
  const level = getLevel(ctx.state);
  const hero = getPlayer(ctx.state);
  const isHands = obj === 'hands';
  const it = isHands ? undefined : obj.c.item;

  if (
    !isHands &&
    it &&
    obj.def === LONG_SWORD &&
    (hero.c.experience?.level ?? 1) >= 5 &&
    !ctx.rng.rn2(30) && // no Knights: rn2(6) is theirs
    it.quantity === 1 &&
    // no artifacts: the sword is never one and Excalibur never exists
    uState(ctx.state).alignType !== 1 // a lawful hero would get Excalibur (no artifacts)
  ) {
    // Ha!  Trying to cheat her.
    say(ctx, 'fountain.freezing_mist');
    say(ctx, 'fountain.disappears');
    it.buc = 'cursed';
    if (it.spe > -6 && !ctx.rng.rn2(3)) it.spe--;
    delete it.erodeproof;
    setTerrain(level, at.x, at.y, T.floor);
    setFountainBits(ctx, level.id, at.x, at.y, 0);
    if (inTown(level, at.x, at.y)) angryGuards(ctx, false);
    return NORMAL_SPEED;
  }
  const er: WaterResult =
    isHands || (it?.equipped === 'gloves' && it.carriedBy === ctx.state.playerId)
      ? washHands(ctx)
      : waterDamage(ctx, obj, null, true);

  if (er === 'destroyed' || (er !== 'nothing' && !ctx.rng.rn2(2))) return NORMAL_SPEED; // no further effect

  const bits = (): number => fountainBits(ctx.state, level.id, at.x, at.y);
  const dipped = it ?? null; // not destroyed: the item is still there
  switch (ctx.rng.rnd(30)) {
    case 16: // curse the item
      if (!isHands && dipped && ctx.defs.object(obj.def).class !== 'coin') dipped.buc = 'cursed';
      break;
    case 17:
    case 18:
    case 19:
    case 20: // uncurse the item
      if (dipped?.buc === 'cursed') {
        if (!blind(ctx)) say(ctx, 'fountain.water_glows');
        dipped.buc = 'uncursed';
      } else say(ctx, 'fountain.feeling_of_loss');
      break;
    case 21: // water demon
      if (dowaterdemon(ctx, action, at)) return 0;
      break;
    case 22: // water nymph
      dowaternymph(ctx);
      break;
    case 23: // an endless stream of snakes
      dowatersnakes(ctx);
      break;
    case 24: // find a gem
      if (!(bits() & FTN_LOOTED)) {
        dofindgem(ctx, at);
        break;
      }
      dogushforth(ctx, false); // C falls through to the gush
      break;
    case 25: // water gushes forth
      dogushforth(ctx, false);
      break;
    case 26: // strange feeling
      say(ctx, 'fountain.tingling');
      break;
    case 27: // strange feeling
      say(ctx, 'fountain.sudden_chill');
      break;
    case 28: // strange feeling
      say(ctx, 'fountain.bath_urge');
      takeBath(ctx, at);
      break;
    case 29: {
      // you see coins: more of them the closer to the surface
      if (bits() & FTN_LOOTED) break;
      setFountainBits(ctx, level.id, at.x, at.y, bits() | FTN_LOOTED);
      const n = dungeonBottom(ctx.state, level) - level.dlevel + 1;
      mkgold(ctx, ctx.rng.rnd(n * 2) + 5, { level: level.id, x: at.x, y: at.y });
      if (!blind(ctx)) say(ctx, 'fountain.coins');
      break;
    }
    default:
      if (er === 'nothing') say(ctx, 'fountain.nothing_happens');
      break;
  }
  if (ctx.state.gameOver) return NORMAL_SPEED;
  dryup(ctx, at.x, at.y, true);
  return NORMAL_SPEED;
}

export const DIP_ID: DefId = 'nh:dip';

const heroItem = (ctx: Pick<Ctx, 'state'>, id: unknown): Entity | null => {
  if (typeof id !== 'number') return null;
  const e = ctx.state.entities[String(id)];
  return e?.c.item?.carriedBy === ctx.state.playerId ? e : null;
};

const dipArgs = (action: PlayerAction): { item?: unknown; hands?: unknown } | undefined =>
  action.type === 'mod' ? (action.args as { item?: unknown; hands?: unknown }) : undefined;

/**
 * #dip into the fountain the hero stands on: every inventory item, and her hands ("Wash your
 * hands", C's `-`). Dipping into potions, pools and sinks is not ported. ref: src/potion.c
 * dodip()
 */
const dip: ActionDef = {
  id: DIP_ID,
  labelKey: 'action.nh:dip',
  handles: 'mod',
  offer(ctx, target): Offer[] {
    if (!heroOnFountain(ctx)) return [];
    if (target.kind === 'self')
      return [
        {
          action: { type: 'mod', action: DIP_ID, args: { hands: true } },
          labelKey: 'action.nh:dip.hands',
        },
      ];
    if (target.kind !== 'item') return [];
    const e = heroItem(ctx, target.id);
    if (!e) return [];
    return [
      { action: { type: 'mod', action: DIP_ID, args: { item: e.id } }, labelKey: 'action.nh:dip' },
    ];
  },
  perform(ctx, action) {
    const args = dipArgs(action);
    if (args?.hands) return dipfountain(ctx, DIP_ID, 'hands');
    const e = heroItem(ctx, args?.item);
    return e ? dipfountain(ctx, DIP_ID, e) : 0;
  },
  // a water demon's wish (the only prompt a dip asks)
  answer: (ctx, value, data) => answerFountainWish(ctx, DIP_ID, value, data),
};

export const FOUNTAIN_ACTIONS: readonly ActionDef[] = [dip];
