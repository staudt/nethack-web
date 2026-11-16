// The hero and water: walking into it, falling in, crawling out and drowning.
// ref: src/hack.c swim_move_danger(), u_simple_floortyp(), pooleffects(), crawl_destination();
// src/trap.c drown(), emergency_disrobe(), rnd_nextto_goodpos(), back_on_ground(),
// rescued_from_terrain(); src/teleport.c dotele() (the teleport try)
//
// The hero who cannot swim falls in, gets her pack wet, may teleport out, crawls out (dropping
// gear until she is no worse than burdened) or drowns; life saving puts her somewhere safe.
// Swimming, amphibious and breathless forms go into the water (u.uinwater, `uwater.ts`) but see
// and act as on land (DEVIATIONS "Water"). Lava burns her up, or (fire resistant) she sinks into
// it and must pull herself out. ref: src/trap.c lava_effects(), sink_into_lava()
//
// Not ported: steeds, leashes, the ball and chain, the Plane of Water, a ceiling-hiding form, the
// teleport-away spell route and check_capacity() of dotele(), a polymorphed gremlin multiplying,
// switch_terrain() (walls of water and lava do not block levitation and flight: they are entered
// whatever holds her up), hallucinatory liquids.
import {
  cellIndex,
  cellRules,
  getLevel,
  getPlayer,
  inBounds,
  inventoryOf,
  type Ctx,
  type Entity,
  type Level,
  type ModApi,
  type Msg,
  type Pos,
} from '@nh/core';
import { sokobanBoulder } from './boulder';
import { destroyItems } from './erode';
import { igniteItems } from './light';
import { useupall } from './magic';
import { isOrganic } from './material';
import { M_SEEN, monstseesu } from './musestate';
import { xnameOf } from './objnam';
import { burnAwaySlime, isSlimed } from './slimestate';
import { unaware } from './btrapped';
import { done } from './end';
import { ustuck } from './hackmove';
import { losehp } from './hp';
import { morehungry } from './hunger';
import { nhData } from './items';
import { dropx, welded } from './itemactions';
import { isLava, isPool, isPoolOrLava, isWaterwall, waterbodyName } from './liquid';
import { luckOf } from './luck';
import { stealIds, unmulNow } from './nomul';
import { P, hasProp, setItimeout, timeoutLeft, wornIn } from './props';
import { invWeight, nearCapacity, weightCap } from './stats';
import { removeWornItem } from './steal';
import { noteleportLevel, goodposHero, SOKOBAN_DUNGEON } from './teleport';
import { surfaceKey } from './terrain';
import { safeTeleds, teleds } from './trap';
import { XDIR, YDIR, flying, levitating, setUtrap, takeUmoved, utrap } from './trapstate';
import { pwOf, setPw } from './uenergy';
import { heroForm, heroFormId } from './upoly';
import {
  amphibious,
  breathless,
  knownWwalking,
  likesLavaId,
  setPoolFx,
  setUinwater,
  swimming,
  uinwater,
  wwalking,
} from './uwater';
import { waterDamageChain } from './water';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const hero = (ctx: Pick<Ctx, 'state'>): Entity => getPlayer(ctx.state);

function heroAt(ctx: Pick<Ctx, 'state'>): { level: Level; x: number; y: number } {
  const p = hero(ctx).c.pos;
  if (!p) throw new Error('Hero has no position');
  return { level: getLevel(ctx.state, p.level), x: p.x, y: p.y };
}

/** ref: include/hack.h SLT_ENCUMBER: crawling out works up to Burdened */
const SLT_ENCUMBER = 1;
/** ref: include/weight.h WT_TOOMUCH_DIAGONAL */
const WT_TOOMUCH_DIAGONAL = 600;

/** ref: src/hack.c bad_rock() for a hero who cannot tunnel (as actions.ts badRock()) */
function badRock(ctx: Ctx, level: Level, x: number, y: number): boolean {
  if (!inBounds(level, x, y)) return true;
  if (sokobanBoulder(ctx, level, x, y)) return true;
  const id = level.palette[level.cells[cellIndex(level, x, y)] ?? 0];
  if (id === undefined) return true;
  const t = ctx.defs.terrain(id);
  return !t.passable && t.door === undefined;
}

/** C's `newtyp` of u_simple_floortyp(): what the hero would be on at (x, y). */
type Floor = 'water' | 'waterwall' | 'lava' | 'lavawall' | 'room';

/**
 * Water or lava she would be in at (x, y): walls of water and lava whatever holds her up, pools
 * and lava only on foot. ref: src/hack.c u_simple_floortyp()
 */
function uSimpleFloortyp(ctx: Ctx, level: Level, x: number, y: number): Floor {
  const inAir = levitating(ctx) || flying(ctx);
  if (isWaterwall(ctx, level, x, y)) return 'waterwall';
  if (isLava(ctx, level, x, y) && isLavawall(level, x, y)) return 'lavawall';
  if (!inAir) {
    if (isPool(ctx, level, x, y)) return 'water';
    if (isLava(ctx, level, x, y)) return 'lava';
  }
  return 'room';
}

const isLavawall = (level: Level, x: number, y: number): boolean =>
  level.palette[level.cells[cellIndex(level, x, y)] ?? -1] === 'nh:lavawall';

/**
 * Is stepping to (x, y) a danger she should be asked about: water she cannot walk on, lava
 * (unless she knows she can walk on it or is on it already), a wall of water or lava, when she
 * knows the square (it is remembered), would change what she is in, and is neither stunned nor
 * confused. NetHack refuses the move ("You avoid stepping into the water.") and lets the `m`
 * prefix step in; here she is asked instead (DEVIATIONS "Water"). Returns the name of the
 * liquid (a message key) or null. ref: src/hack.c swim_move_danger() (no Known_lwalking:
 * nothing makes lava walking known; no Underwater exemption: walls of water are always asked
 * about)
 */
export function swimMoveDanger(ctx: Ctx, to: Pos): string | null {
  const { level, x: ux, y: uy } = heroAt(ctx);
  const { x, y } = to;
  if (!inBounds(level, x, y)) return null;
  const h = hero(ctx);
  if (hasProp(h, P.STUNNED) || hasProp(h, P.CONFUSION)) return null;
  const newtyp = uSimpleFloortyp(ctx, level, x, y);
  const liquidWall = newtyp === 'waterwall' || newtyp === 'lavawall';
  if (newtyp === uSimpleFloortyp(ctx, level, ux, uy)) return null;
  const seen = (ctx.state.memory[level.id]?.[cellIndex(level, x, y)] ?? -1) >= 0;
  if (!seen) return null;
  const pool = isPool(ctx, level, x, y);
  const lava = isLava(ctx, level, x, y);
  if (!pool && !lava && !liquidWall) return null;
  if ((pool && !knownWwalking(ctx)) || (lava && !isLava(ctx, level, ux, uy)) || liquidWall)
    return waterbodyName(ctx, level, x, y);
  return null;
}

// ---------------------------------------------------------------------------------------------
// back on the ground

/**
 * "You are back on solid ground." (or "You find yourself ..." when `rescued`), the surface
 * worded as C does: "solid ground" for floor and ground, "an altar", "the stairs", "in a
 * doorway". ref: src/trap.c back_on_ground()
 */
export function backOnGround(ctx: Ctx, rescued: boolean): void {
  const { level, x, y } = heroAt(ctx);
  let prep = levitating(ctx) || flying(ctx) ? 'over' : 'on';
  const surf = surfaceKey(ctx, level, x, y);
  let surface: string = surf;
  let form = 'plain';
  if (surf === '@surface.ice') form = 'plain';
  else if (surf === '@surface.floor' || surf === '@surface.ground')
    surface = '@liquid.solid_ground';
  else if (surf === '@surface.altar') form = 'an';
  else if (surf === '@surface.stairs' || surf === '@surface.ladder' || surf === '@surface.lava')
    form = 'the';
  else {
    // cloud, wall, fountain, doorway: "in a cloud"
    form = 'an';
    prep = 'in';
  }
  say(ctx, `liquid.${rescued ? 'find_yourself' : 'back'}.${form}`, {
    prep: `@liquid.prep.${prep}`,
    surface,
  });
}

/**
 * Life saving got her out of the water: "You find yourself on top of water." when she is still
 * on a pool (in the midst of a wall of water), else back on the ground.
 * ref: src/trap.c rescued_from_terrain(DROWNING)
 */
function rescuedFromDrowning(ctx: Ctx): void {
  const { level, x, y } = heroAt(ctx);
  if (isPool(ctx, level, x, y))
    say(ctx, isWaterwall(ctx, level, x, y) ? 'liquid.find_midst' : 'liquid.find_on_top');
  else backOnGround(ctx, true);
}

// ---------------------------------------------------------------------------------------------
// pooleffects()

/**
 * Entering or leaving water, or staying in it: out of the water ("You are back on solid
 * ground.", "You pop out of the water like a cork!" levitating, "You fly out of the water.",
 * "You slowly rise above the surface." with water walking), then into water or lava she does not
 * float or fly over: drown() unless water walking keeps her on top (lava_effects(): m15 step 3).
 * `newspot`: she just arrived (spoteffects()); else the check of a turn spent in place; `from`:
 * the square she stepped from. True when she moved while surviving, so the rest of
 * spoteffects() is skipped.
 * ref: src/hack.c pooleffects() (no steed, ceiling hiders or Plane of Water)
 */
export function pooleffects(ctx: Ctx, newspot: boolean, from?: Pos): boolean {
  const { level, x, y } = heroAt(ctx);
  // check for leaving water
  if (uinwater(ctx)) {
    let stillInwater = false;
    if (!isPool(ctx, level, x, y)) {
      if (isLava(ctx, level, x, y)) say(ctx, 'liquid.leave_water');
      else backOnGround(ctx, false);
    } else if (levitating(ctx)) say(ctx, 'liquid.pop_out');
    else if (flying(ctx)) say(ctx, 'liquid.fly_out');
    else if (wwalking(ctx)) say(ctx, 'liquid.rise_above');
    else stillInwater = true;
    if (!stillInwater) setUinwater(ctx, false);
  }
  // check for entering water or lava (walls of water and lava whatever holds her up)
  const wall = isWaterwall(ctx, level, x, y) || isLavawall(level, x, y);
  if (
    ustuck(ctx) === null &&
    (wall || (!levitating(ctx) && !flying(ctx))) &&
    isPoolOrLava(ctx, level, x, y)
  ) {
    if (isLava(ctx, level, x, y)) {
      if (lavaEffects(ctx)) return true;
    } else if (
      (!wwalking(ctx) || isWaterwall(ctx, level, x, y)) &&
      (newspot || !uinwater(ctx) || !(swimming(ctx) || amphibious(ctx) || breathless(ctx)))
    ) {
      if (drown(ctx, from)) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
// drown()

/**
 * Where she could crawl to at (x, y) from her square: a good position, and diagonally not into
 * a door (any door on the Rogue level) or squeezing between rock while carrying over 600. ref: src/hack.c
 * crawl_destination() (no grid bugs or Passes_walls; Sokoban's no-squeeze rule as test_move())
 */
function crawlDestination(
  ctx: Ctx,
  level: Level,
  ux: number,
  uy: number,
  x: number,
  y: number,
): boolean {
  if (!goodposHero(ctx, level, x, y)) return false;
  if (x === ux || y === uy) return true;
  // !doorless_door() || block_door(): only a doorway (no door, broken) lets her in diagonally,
  // and on the Rogue level not even that (`intactDoor` holds every door there)
  if (cellRules(level, ctx.defs).intactDoor[level.cells[cellIndex(level, x, y)] ?? -1] === true)
    return false;
  if (!(badRock(ctx, level, ux, y) && badRock(ctx, level, x, uy))) return true;
  // cant_squeeze_thru(): too much to carry, or Sokoban
  const h = hero(ctx);
  const amt = invWeight(ctx.state, ctx.defs, h.id) + weightCap(ctx.state, ctx.defs, h.id);
  return !(amt > WT_TOOMUCH_DIAGONAL || level.dungeon === SOKOBAN_DUNGEON);
}

/**
 * A random square next to hers she can crawl to: the eight directions shuffled, the first good
 * one. ref: src/trap.c rnd_nextto_goodpos()
 */
function rndNexttoGoodpos(ctx: Ctx, level: Level, ux: number, uy: number): Pos | null {
  const dirs = [0, 1, 2, 3, 4, 5, 6, 7];
  for (let i = dirs.length; i > 0; --i) {
    const j = ctx.rng.rn2(i);
    const k = dirs[j] as number;
    dirs[j] = dirs[i - 1] as number;
    dirs[i - 1] = k;
  }
  for (const d of dirs) {
    const nx = ux + (XDIR[d] as number);
    const ny = uy + (YDIR[d] as number);
    if (crawlDestination(ctx, level, ux, uy, nx, ny)) return { x: nx, y: ny };
  }
  return null;
}

/**
 * Whether she keeps `obj` when dropping gear to crawl out: a cursed loadstone, the amulet, rings,
 * blindfold, body armor, cloak, gloves, boots and shirt, a cursed helmet or shield, a welded
 * weapon, armor being stolen. ref: src/trap.c emergency_disrobe() (no in_use objects)
 */
function undroppable(ctx: Ctx, obj: Entity): boolean {
  const it = obj.c.item;
  if (!it) return true;
  const eq = it.equipped;
  if (obj.def === 'nh:loadstone' && it.buc === 'cursed') return true;
  if (
    eq === 'amulet' ||
    eq === 'ringL' ||
    eq === 'ringR' ||
    eq === 'blindfold' ||
    eq === 'body' ||
    eq === 'cloak' ||
    eq === 'gloves' ||
    eq === 'boots' ||
    eq === 'shirt'
  )
    return true;
  if (it.buc === 'cursed' && (eq === 'helm' || eq === 'shield')) return true;
  if (eq === 'weapon' && it.buc === 'cursed' && welded(ctx, obj)) return true;
  return stealIds(ctx).oid === obj.id;
}

/**
 * She drops random gear until she is no worse than burdened: each time an index `rn2(invc)`
 * into her pack, and the droppable item last seen once past it (else the next droppable one).
 * False when nothing more can be dropped. ref: src/trap.c emergency_disrobe() (pack order is
 * the inventory-letter order here)
 */
function emergencyDisrobe(ctx: Ctx): { ok: boolean; lost: boolean } {
  const id = ctx.state.playerId;
  let invc = inventoryOf(ctx.state, id).length;
  let lost = false;
  while (nearCapacity(ctx.state, ctx.defs, id) > SLT_ENCUMBER) {
    let otmp: Entity | null = null;
    if (invc > 0) {
      let i = ctx.rng.rn2(invc);
      for (const obj of inventoryOf(ctx.state, id)) {
        if (!undroppable(ctx, obj)) otmp = obj;
        // reached the mark and found some stuff to drop?
        if (--i < 0 && otmp) break;
      }
    }
    if (!otmp) return { ok: false, lost }; // nothing to drop!
    if (otmp.c.item?.equipped) removeWornItem(ctx, otmp);
    lost = true;
    dropx(ctx, otmp);
    invc--;
  }
  return { ok: true, lost };
}

/**
 * The teleport try of a drowning hero with teleportitis (or a teleporting form) who is aware:
 * "You attempt a teleport spell."; on a no-teleport level "The attempted teleport spell
 * fails."; else dotele()'s rules for teleporting at will (experience level 12, or a form that
 * teleports; enough nutrition, strength and 30 energy), then a teleport to a random spot (even
 * with teleport control: DEVIATIONS "Water"). True when she left the water.
 * ref: src/trap.c drown(); src/teleport.c dotele(FALSE) (no teleport-away spell, no
 * check_capacity())
 */
function drownTeleport(ctx: Ctx): boolean {
  const h = hero(ctx);
  const form = heroForm(ctx);
  const canTeleport = form?.flags.includes('tport') === true;
  if (!(hasProp(h, P.TELEPORT) || canTeleport) || unaware(ctx)) return false;
  if (!(hasProp(h, P.TELEPORT_CONTROL) || ctx.rng.rn2(3) < luckOf(ctx.state) + 2)) return false;
  say(ctx, 'liquid.attempt_teleport');
  const { level } = heroAt(ctx);
  if (noteleportLevel(ctx, level, ctx.state.playerId)) {
    say(ctx, 'liquid.teleport_fails');
    return false;
  }
  // dotele(FALSE)
  if (!hasProp(h, P.TELEPORT) || ((h.c.experience?.level ?? 1) < 12 && !canTeleport)) {
    say(ctx, hasProp(h, P.TELEPORT) ? 'liquid.not_at_will' : 'liquid.dont_know_spell');
    return false;
  }
  const energy = 5 * 6; // 5 * spellev(SPE_TELEPORT_AWAY)
  const pw = pwOf(ctx.state);
  let cantdoit: string | null = null;
  if ((h.c.hunger?.nutrition ?? 900) <= 10) cantdoit = 'weak';
  else if ((h.c.attributes?.str ?? 18) < 4) cantdoit = 'strength';
  else if (energy > pw.uen) cantdoit = 'energy';
  if (cantdoit) {
    say(ctx, `liquid.cant_teleport.${cantdoit}`);
    return false;
  }
  setPw(ctx, { uen: pw.uen - energy });
  safeTeleds(ctx);
  morehungry(ctx, 100);
  const now = heroAt(ctx);
  return !isPool(ctx, now.level, now.x, now.y);
}

/** Her form's speed (youmonst.data->mmove): she must be able to move to crawl. */
const canCrawl = (ctx: Ctx): boolean => {
  if (hero(ctx).c.helpless) return false; // multi < 0
  const form = heroForm(ctx);
  return form ? form.speed > 0 : true;
};

/**
 * Wakes her (u.usleep: "Suddenly you wake up!") or revives her from a faint ("You revive."):
 * she must not crawl out of the water asleep. ref: src/trap.c drown(); src/eat.c reset_faint()
 */
function wakeInWater(ctx: Ctx): void {
  const r = hero(ctx).c.helpless?.reasonKey;
  if (r !== 'helpless.asleep' && r !== 'helpless.fainted') return;
  nhData(ctx).nomovemsg = { key: r === 'helpless.asleep' ? 'liquid.wake_up' : 'liquid.revive' };
  unmulNow(ctx);
}

/** The killer of drown(): "a pool of water", "a moat", "deep water" (KILLED_BY_AN / BY). */
function drownKiller(ctx: Ctx): string {
  const { level, x, y } = heroAt(ctx);
  const name = waterbodyName(ctx, level, x, y);
  const k = name.slice('liquid.name.'.length);
  return `@killer.drown.${k === 'water' ? 'deep' : k}`;
}

/**
 * She is in water she cannot walk on: "You fall into the water!" (or plunge into a wall of
 * water) and "You sink like a rock." unless she swims; her pack gets wet; an iron golem rusts;
 * a swimmer, amphibious or breathless form stays in the water ("But you aren't drowning." "You
 * touch bottom."), wading in the same pool gets things wet only 1 time in 5; else the teleport
 * try, waking up, crawling out ("You try to crawl out of the water." "Pheew!  That was close.",
 * dropping gear when too heavy: "You dump some of your gear to lose weight...", "But in vain.")
 * and "You drown.", which life saving (or wizard mode's "Die?") turns into a safe spot ("You're
 * still drowning." when there is none, then a second death). True when she moved while
 * surviving. `from` is the square she came from (u.ux - u.dx), default her own.
 * ref: src/trap.c drown() (no leashes, steeds, ball and chain, gremlin splitting)
 */
export function drown(ctx: Ctx, from?: Pos): boolean {
  const { level, x, y } = heroAt(ctx);
  const isSolid = isWaterwall(ctx, level, x, y);
  const back = from ?? { x, y };
  const swims = swimming(ctx);
  const safe = swims || amphibious(ctx) || breathless(ctx);
  let inpoolOk = false;
  // happily wading in the same contiguous pool
  if (uinwater(ctx) && isPool(ctx, level, back.x, back.y) && safe) {
    // water effects on objects every now and then
    if (!ctx.rng.rn2(5)) inpoolOk = true;
    else return false;
  }
  const h = hero(ctx);
  if (!uinwater(ctx)) {
    const water = `@${waterbodyName(ctx, level, x, y)}`;
    say(ctx, `liquid.${isSolid ? 'plunge' : 'fall'}${safe ? '' : '_bang'}`, { water });
    if (!swims && !isSolid) say(ctx, hasProp(h, P.HALLUC) ? 'liquid.sink_titanic' : 'liquid.sink');
  }
  waterDamageChain(ctx, inventoryOf(ctx.state, h.id));
  if (heroFormId(ctx.state) === 'nh:iron_golem') {
    say(ctx, 'liquid.you_rust');
    const i = ctx.rng.d(2, 6); // Maybe_Half_Phys(): no source
    const hp = h.c.hp;
    if (hp && hp.max > i) hp.max -= i;
    losehp(ctx, i, '@killer.rusting_away');
    if (ctx.state.gameOver) return true;
  }
  if (inpoolOk) return false;
  if (safe) {
    if (amphibious(ctx) || breathless(ctx)) {
      say(ctx, 'liquid.not_drowning');
      say(ctx, hasProp(h, P.HALLUC) ? 'liquid.keel' : 'liquid.touch_bottom');
    }
    setUinwater(ctx, true);
    return false;
  }
  if (drownTeleport(ctx)) return true;
  if (ctx.state.gameOver) return true;
  // if sleeping, wake up now so that we don't crawl out of water while still asleep
  wakeInWater(ctx);
  const here = heroAt(ctx);
  // have to be able to move in order to crawl
  const to = canCrawl(ctx) ? rndNexttoGoodpos(ctx, here.level, here.x, here.y) : null;
  if (to) {
    // time to do some strip-tease...
    const { ok, lost } = emergencyDisrobe(ctx);
    say(ctx, 'liquid.crawl');
    if (lost) say(ctx, 'liquid.dump_gear');
    if (ok) {
      say(ctx, 'liquid.pheew');
      teleds(ctx, to.x, to.y);
      return true;
    }
    // still too much weight
    say(ctx, 'liquid.in_vain');
  }
  setUinwater(ctx, true);
  say(ctx, 'liquid.drown');
  // the first death is survivable by an amulet of life saving or wizard mode's "Die?", the
  // second only by the latter
  for (let i = 0; i < 2; i++) {
    done(ctx, drownKiller(ctx), 'drowning');
    if (ctx.state.gameOver) return true;
    // oops, we're still alive.  better get out of the water.
    if (safeTeleds(ctx)) break; // successful life-save
    // nowhere safe to land; repeat drowning loop...
    say(ctx, 'liquid.still_drowning');
  }
  if (uinwater(ctx)) setUinwater(ctx, false);
  rescuedFromDrowning(ctx);
  return true;
}

// ---------------------------------------------------------------------------------------------
// lava

/** iflags.in_lava_effects: lava_effects() is not entered again (Boots_off() -> spoteffects()) */
let inLavaEffects = 0;

const LAVA_KILLER = '@killer.lava';

/** Her pack items lava would burn up: organic or potions, not fireproof. */
function lavaBurns(ctx: Ctx, obj: Entity): boolean {
  const def = ctx.defs.object(obj.def);
  return (
    (isOrganic(def) || def.class === 'potion') &&
    !obj.c.item?.erodeproof &&
    def.prop !== P.FIRE_RES &&
    obj.def !== 'nh:scroll_of_fire' &&
    obj.def !== 'nh:spellbook_of_fireball'
  );
}

/**
 * "You find yourself on water." (in it when she is), "You find yourself on top of molten lava."
 * or back on the ground, after life saving took her out of the lava.
 * ref: src/trap.c rescued_from_terrain(BURNING / DISSOLVED)
 */
function rescuedFromLava(ctx: Ctx): void {
  const { level, x, y } = heroAt(ctx);
  if (isPool(ctx, level, x, y))
    say(ctx, uinwater(ctx) ? 'lava.find_in_water' : 'lava.find_on_water');
  else if (isLava(ctx, level, x, y)) say(ctx, 'lava.find_on_lava');
  else backOnGround(ctx, true);
}

/**
 * She enters molten lava (or stays on it). A lava-loving form is unharmed. Boots that would burn
 * go first ("Your boots burst into flame!"). Without fire resistance, water walking keeps her on
 * top while `d(6, 6)` is less than her hit points ("The lava here burns you!"), else "You fall
 * into the molten lava!": her organic items and potions burn up, "You burn to a crisp..." and
 * done(BURNING); life saving puts her somewhere safe (twice at most, then 5 turns of fire
 * resistance and water walking). Fire resistant and not water walking, she sinks into it
 * (`TT_LAVA`: "You sink into the molten lava, but it only burns slightly!", 1 hit point). Then
 * fire destroys items in her pack and lights her lamps. True when she was killed and saved.
 * ref: src/trap.c lava_effects() (no steeds, protected stolen items, Book of the Dead)
 */
export function lavaEffects(ctx: Ctx): boolean {
  if (inLavaEffects) return false; // skipping recursive lava_effects()
  const h = hero(ctx);
  burnAwaySlime(ctx);
  if (likesLavaId(heroForm(ctx)?.id)) return false;
  const dmg = ctx.rng.d(6, 6); // only applicable for water walking
  const fireRes = hasProp(h, P.FIRE_RES);
  let usurvive = fireRes || (wwalking(ctx) && dmg < (h.c.hp?.cur ?? 0));
  // flag items to be destroyed before any messages
  const inUse = new Set<number>();
  if (!usurvive)
    for (const o of inventoryOf(ctx.state, h.id)) if (lavaBurns(ctx, o)) inUse.add(o.id);
  // burn away boots *first* so we know whether to make the player sink into the lava
  let burncount = 0;
  let burnmesgcount = 0;
  const uarmf = wornIn(ctx.state, h.id, 'boots');
  if (
    uarmf &&
    (inUse.has(uarmf.id) || (isOrganic(ctx.defs.object(uarmf.def)) && !uarmf.c.item?.erodeproof))
  ) {
    say(ctx, 'lava.burst', { item: xnameOf(ctx.state, ctx.defs, uarmf) });
    burnmesgcount++;
    inLavaEffects++;
    removeWornItem(ctx, uarmf); // Boots_off()
    useupall(ctx, uarmf.id);
    inLavaEffects--;
    inUse.delete(uarmf.id);
    burncount++;
  }
  if (!fireRes) {
    if (wwalking(ctx)) {
      say(ctx, 'lava.burns_you');
      if (usurvive) {
        losehp(ctx, dmg, LAVA_KILLER); // lava damage
        burnStuff(ctx, dmg);
        return false;
      }
    } else {
      const { level, x, y } = heroAt(ctx);
      say(ctx, 'liquid.fall_bang', { water: `@${waterbodyName(ctx, level, x, y)}` });
    }
    usurvive = hasProp(h, P.LIFESAVED);
    inLavaEffects++;
    for (const o of inventoryOf(ctx.state, h.id)) {
      if (!inUse.has(o.id)) continue;
      if (o.c.item?.equipped) {
        if (usurvive) {
          say(ctx, 'lava.burst', { item: xnameOf(ctx.state, ctx.defs, o) });
          burnmesgcount++;
        }
        removeWornItem(ctx, o);
      }
      useupall(ctx, o.id);
      burncount++;
    }
    if (usurvive && burncount > burnmesgcount) {
      const n = burncount - burnmesgcount;
      say(
        ctx,
        burnmesgcount > 0
          ? n === 1
            ? 'lava.inv_another'
            : 'lava.inv_other'
          : n === 1
            ? 'lava.inv_an'
            : 'lava.inv_some',
      );
    }
    // s/he died...
    const form = heroFormId(ctx.state);
    const boilAway =
      form === 'nh:water_elemental' || form === 'nh:steam_vortex' || form === 'nh:fog_cloud';
    // burn to death; if life-saved on the first pass, try to teleport to safety; if that fails,
    // burn all over again
    let pass = 0;
    for (; pass < 2; pass++) {
      if (h.c.hp) h.c.hp.cur = -1;
      say(ctx, boilAway ? 'lava.boil_away' : 'lava.burn_crisp');
      done(ctx, LAVA_KILLER, 'burning');
      if (ctx.state.gameOver) {
        inLavaEffects--;
        return true;
      }
      if (safeTeleds(ctx)) break; // successful life-save
      say(ctx, 'lava.still_burning'); // nowhere safe to land; repeat burning loop
    }
    inLavaEffects--;
    if (pass === 2) {
      // life-saved twice and failed to be teleported to safety both times: give the player a
      // chance to try something else instead of just immediately burning up all over again
      if (!hasProp(h, P.FIRE_RES)) setItimeout(ctx.state, h, P.FIRE_RES, 5);
      if (!wwalking(ctx)) setItimeout(ctx.state, h, P.WWALKING, 5);
      burnStuff(ctx, dmg);
      return false;
    }
    rescuedFromLava(ctx);
    return true;
  }
  const u = utrap(ctx);
  if (!wwalking(ctx) && u?.type !== 'lava') {
    // fire resistant: sinking in slowly
    const turns = ctx.rng.rn2(4) + 4; // rn1(4, 4)
    const depth = ctx.rng.rn2(4) + 12; // rn1(4, 12)
    setUtrap(ctx, turns + (depth << 8), 'lava');
    const { level, x, y } = heroAt(ctx);
    say(ctx, 'lava.sink_slightly', { water: `@${waterbodyName(ctx, level, x, y)}` });
    monstseesu(ctx, M_SEEN.fire);
    if ((h.c.hp?.cur ?? 0) > 1) losehp(ctx, 1, LAVA_KILLER); // lava damage
  }
  burnStuff(ctx, dmg);
  return false;
}

/** lava_effects()'s burn_stuff: destroy_items(AD_FIRE) and ignite_items() of her pack. */
function burnStuff(ctx: Ctx, dmg: number): void {
  if (ctx.state.gameOver) return;
  destroyItems(ctx, ctx.state.playerId, 'fire', dmg);
  if (ctx.state.gameOver) return;
  igniteItems(ctx, ctx.state.playerId);
}

/**
 * Once an action while she is sinking into lava (`TT_LAVA`): without fire resistance her hit
 * points drop to a third; she sinks one step deeper, and at the bottom "You sink below the
 * surface and die." (done(DISSOLVED), then life saving lets her out: levitation or flight, or a
 * safe teleport); else, when she did not try to move, "You sink deeper into the lava." (slime
 * burns away) and she is stuck `rnd(4)` turns longer. `umoved`: she moved or tried to.
 * ref: src/trap.c sink_into_lava() (no u.uinvulnerable)
 */
export function sinkIntoLava(ctx: Ctx, umoved: boolean): void {
  const u = utrap(ctx);
  if (!u || u.type !== 'lava') return;
  const { level, x, y } = heroAt(ctx);
  if (!isLava(ctx, level, x, y)) {
    setUtrap(ctx, 0, 'lava'); // reset_utrap(FALSE): this shouldn't happen either
    return;
  }
  const h = hero(ctx);
  if (!hasProp(h, P.FIRE_RES) && h.c.hp) h.c.hp.cur = Math.trunc((h.c.hp.cur + 2) / 3);
  const n = u.n - (1 << 8);
  if (n < 1 << 8) {
    setUtrap(ctx, n, 'lava');
    say(ctx, 'lava.sink_below');
    burnAwaySlime(ctx); // add insult to injury?
    done(ctx, LAVA_KILLER, 'dissolved');
    if (ctx.state.gameOver) return;
    // can only get here via life-saving; try to get away from lava
    setUtrap(ctx, 0, 'lava'); // reset_utrap(TRUE)
    // levitation or flight have become unblocked, otherwise Tport
    if (!levitating(ctx) && !flying(ctx)) safeTeleds(ctx);
  } else if (!umoved) {
    setUtrap(ctx, n + ctx.rng.rnd(4), 'lava');
    if (isSlimed(ctx.state) && ctx.rng.rnd(10 - 1) >= timeoutLeft(ctx.state, h, P.SLIMED)) {
      say(ctx, 'lava.sink_deeper');
      burnAwaySlime(ctx);
    } else say(ctx, 'lava.sink_deeper'); // Norep()
  } else setUtrap(ctx, n, 'lava');
}

/**
 * Her energy and square before the action, for the once-per-action pooleffects(FALSE); kept
 * outside the state for the length of one action.
 */
let before: { energy: number; level: string; x: number; y: number } | null = null;

/**
 * pooleffects(FALSE) after every action that took time and did not move her (the moveloop's
 * `!u.umoved` check), when she is in water or on liquid; registers the late-bound hooks.
 * ref: src/allmain.c moveloop_core()
 */
export function registerDrown(api: ModApi): void {
  setPoolFx({
    pooleffects: (ctx, newspot) => pooleffects(ctx, newspot),
    drown: (ctx) => drown(ctx),
  });
  api.on('beforeAction', (ctx) => {
    const h = hero(ctx);
    const p = h.c.pos;
    before = p ? { energy: h.c.actor?.energy ?? 0, level: p.level, x: p.x, y: p.y } : null;
    return 'continue';
  });
  api.on('afterAction', (ctx) => {
    const b = before;
    before = null;
    if (!b || ctx.state.gameOver || ctx.state.pendingPrompt) return;
    const h = hero(ctx);
    const p = h.c.pos;
    // the action took time and did not move her (u.umoved)
    if (!p || (h.c.actor?.energy ?? b.energy) >= b.energy) {
      takeUmoved();
      return;
    }
    // [fast hero who gets multiple moves per turn ends up sinking multiple times per turn]
    if (utrap(ctx)?.type === 'lava') {
      const moved = p.level !== b.level || p.x !== b.x || p.y !== b.y;
      sinkIntoLava(ctx, moved || takeUmoved());
      return;
    }
    // when/if hero escapes from lava, he can't just stay there (only when !u.umoved)
    if (takeUmoved()) return;
    if (p.level !== b.level || p.x !== b.x || p.y !== b.y) return;
    const { level, x, y } = heroAt(ctx);
    if (!uinwater(ctx) && !isPoolOrLava(ctx, level, x, y)) return;
    pooleffects(ctx, false);
  });
}
