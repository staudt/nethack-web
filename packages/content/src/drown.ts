// The hero and water: walking into it, falling in, crawling out and drowning.
// ref: src/hack.c swim_move_danger(), u_simple_floortyp(), pooleffects(), crawl_destination();
// src/trap.c drown(), emergency_disrobe(), rnd_nextto_goodpos(), back_on_ground(),
// rescued_from_terrain(); src/teleport.c dotele() (the teleport try)
//
// The hero who cannot swim falls in, gets her pack wet, may teleport out, crawls out (dropping
// gear until she is no worse than burdened) or drowns; life saving puts her somewhere safe.
// Swimming, amphibious and breathless forms go into the water (u.uinwater, `uwater.ts`) but see
// and act as on land (DEVIATIONS "Water"). Lava is terrain here; what it does to her is m15
// step 3 (lava_effects()), until then entering it does nothing.
//
// Not ported: steeds, leashes, the ball and chain, the Plane of Water, a ceiling-hiding form, the
// teleport-away spell route and check_capacity() of dotele(), a polymorphed gremlin multiplying,
// switch_terrain() (walls of water and lava do not block levitation and flight: they are entered
// whatever holds her up), hallucinatory liquids.
import {
  cellIndex,
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
import { P, hasProp } from './props';
import { invWeight, nearCapacity, weightCap } from './stats';
import { removeWornItem } from './steal';
import { noteleportLevel, goodposHero, SOKOBAN_DUNGEON } from './teleport';
import { surfaceKey } from './terrain';
import { safeTeleds, teleds } from './trap';
import { XDIR, YDIR, flying, levitating } from './trapstate';
import { pwOf, setPw } from './uenergy';
import { heroForm, heroFormId } from './upoly';
import {
  amphibious,
  breathless,
  knownWwalking,
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
  else if (surf === '@surface.stairs' || surf === '@surface.lava') form = 'the';
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
      // lava_effects(): m15 step 3
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
 * a door or squeezing between rock while carrying over 600. ref: src/hack.c
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
  const id = level.palette[level.cells[cellIndex(level, x, y)] ?? -1];
  const door = id === undefined ? undefined : ctx.defs.terrain(id).door;
  // !doorless_door() || block_door(): only a doorway (no door, broken) lets her in diagonally
  if (door !== undefined && door !== 'doorway') return false;
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
  if (noteleportLevel(ctx, level)) {
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
    if (!p || (h.c.actor?.energy ?? b.energy) >= b.energy) return;
    if (p.level !== b.level || p.x !== b.x || p.y !== b.y) return;
    const { level, x, y } = heroAt(ctx);
    if (!uinwater(ctx) && !isPoolOrLava(ctx, level, x, y)) return;
    pooleffects(ctx, false);
  });
}
