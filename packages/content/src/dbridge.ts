// Drawbridges: making one, lowering, raising and destroying it, and what happens to whoever is on
// its span or under its portcullis at the time (C's two "entities": crushed, thrown clear, riding
// the bridge in, falling into the moat).
// ref: src/dbridge.c create_drawbridge(), e_at(), m_to_e(), u_to_e(), set_entity(), e_nam(),
// E_phrase(), e_survives_at(), e_died(), automiss(), e_missed(), e_jumps(), do_entity(),
// nokiller(), close_drawbridge(), open_drawbridge(), destroy_drawbridge()
//
// Which squares are drawbridges (and the tune) is dbstate.ts, a leaf; this module has the entity
// code and needs drowning (drown.ts), monsters in water (minliquid.ts) and deaths, so the zap,
// kick and music code call it directly and lower modules late-bind it.
// Not ported: revive_nasty() (no Riders), Deafness (she always hears), the iron chains a
// destroyed bridge scatters (there is no iron chain: the rolls are drawn, nothing is made), the
// Underwater view (she always sees the bridge "coming"), a long worm's tail riding the bridge (a
// tail segment stays where it is), steeds.
import {
  getPlayer,
  itemsAt,
  trapAt,
  type Ctx,
  type Entity,
  type Level,
  type MonsterDef,
  type Msg,
  type Pos,
} from '@nh/core';
import { BOULDER } from './boulder';
import { unaware } from './btrapped';
import {
  CASTLE,
  dbwallTerrain,
  drawbridgeData,
  findDrawbridge,
  isDbWall,
  isDrawbridge,
  isLoweredSpan,
  isRaisedSpan,
  loweredTerrain,
  raisedTerrain,
  setDrawbridgeData,
  setUheardTune,
  setUopenedDbridge,
  wallForDb,
} from './dbstate';
import { drown, lavaEffects, pooleffects } from './drown';
import { done } from './end';
import { flooreffects } from './flooreffects';
import { mnextoPos } from './generation';
import { experienceFor, gainExperience } from './hero';
import { setIcedpool } from './icestate';
import { canseemon } from './invis';
import { isLava, isPool } from './liquid';
import { minliquid } from './minliquid';
import { isFloater, isFlyer, isSwimmer, likesLava, noncorporeal, nonliving } from './mondata';
import { monkilled, monsterDied } from './mondeath';
import { isFrozen, isMConfused, isMStunned } from './mstate';
import { wakeNearto } from './noise';
import { canSpotMon, monNam } from './perception';
import { P, hasProp } from './props';
import { T, setTerrain, terrainIdAt, isWallId } from './terrain';
import { cansee, deltrap, teleds } from './trap';
import { flying, levitating } from './trapstate';
import { heroForm } from './upoly';
import { amphibious, breathless, swimming, wwalking } from './uwater';
import { mAt, wormRec } from './wormstate';
import type { DbDir } from './dbstate';
import { delEngrAt } from './engr';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/**
 * Makes a drawbridge on (x, y) facing `dir` (its portcullis is the wall that way), lowered when
 * `open`; over lava when (x, y) is lava, else over the moat. False when there is no wall for the
 * portcullis. The raised portcullis is nondiggable (levelflags.ts nonDiggable()).
 * ref: src/dbridge.c create_drawbridge(); src/sp_lev.c lspo_drawbridge()
 */
export function createDrawbridge(
  ctx: Ctx,
  level: Level,
  x: number,
  y: number,
  dir: DbDir,
  open: boolean,
): boolean {
  const lava = terrainIdAt(level, x, y) === T.lava; // assume initialized map
  const w = wallForDb(dir, x, y);
  if (w.x < 0 || w.y < 0 || w.x >= level.width || w.y >= level.height) return false;
  if (!isWallId(terrainIdAt(level, w.x, w.y))) return false;
  const under = lava ? 'lava' : 'moat';
  if (open) {
    setTerrain(level, x, y, loweredTerrain(dir));
    setTerrain(level, w.x, w.y, T.doorway); // DOOR, D_NODOOR
  } else {
    setTerrain(level, x, y, raisedTerrain(under));
    setTerrain(level, w.x, w.y, dbwallTerrain(dir));
  }
  setDrawbridgeData(ctx, level, x, y, { dir, under });
  return true;
}

// ---------------------------------------------------------------------------------------------
// The entities.

/** One of C's `occupants[]`: the hero, a monster (or a long worm's tail segment), or nobody. */
interface Occupant {
  /** 'you', the monster, or null (C's null `edata`) */
  who: 'you' | Entity | null;
  /** a tail segment of the worm `who` (C's `edata == &mons[PM_LONG_WORM_TAIL]`) */
  tail: boolean;
  x: number;
  y: number;
}

/** The state of one drawbridge operation: C's `go.occupants[]`, `svk.killer` and mon_moving. */
interface Run {
  level: Level;
  occ: [Occupant, Occupant];
  /** the death reason the hero dies of, when one is set (C's `svk.killer`) */
  killer: string | null;
  /** C's `context.mon_moving`: a monster caused it (its kills are not hers) */
  monMoving: boolean;
}

const nobody = (): Occupant => ({ who: null, tail: false, x: 0, y: 0 });

const isU = (e: Occupant): boolean => e.who === 'you';

const monOf = (e: Occupant): Entity | null => (e.who === 'you' ? null : e.who);

/** `etmp->edata`: her form, the monster's kind, or the long worm's tail. */
function edata(ctx: Ctx, e: Occupant): MonsterDef | null {
  if (e.who === null) return null;
  if (e.who === 'you') return heroForm(ctx);
  return ctx.defs.monster(e.tail ? 'nh:long_worm_tail' : e.who.def);
}

const passesWallsDef = (d: MonsterDef | null): boolean => d?.flags.includes('wallwalk') === true;

/** ref: Passes_walls (a wall-walking form) */
const uPassesWalls = (ctx: Ctx): boolean => passesWallsDef(heroForm(ctx));

/** ref: src/dbridge.c e_at() */
const eAt = (run: Run, x: number, y: number): Occupant | null =>
  run.occ.find((e) => e.who !== null && e.x === x && e.y === y) ?? null;

/** ref: src/dbridge.c set_entity(), u_to_e(), m_to_e() (m_at() holds the worm on its tail) */
function setEntity(ctx: Ctx, run: Run, x: number, y: number, e: Occupant): void {
  const hp = getPlayer(ctx.state).c.pos;
  e.x = x;
  e.y = y;
  e.tail = false;
  if (hp && hp.level === run.level.id && hp.x === x && hp.y === y) {
    e.who = 'you';
    return;
  }
  const mon = mAt(ctx.state, run.level.id, x, y); // m_at() might yield Null; that's ok
  e.who = mon;
  if (!mon) {
    e.x = e.y = 0;
    return;
  }
  const p = mon.c.pos;
  e.tail = wormRec(ctx.state, mon.id) !== null && (p?.x !== x || p.y !== y);
}

/** ref: e_canseemon(): the hero, or a monster she sees */
const eCanseemon = (ctx: Ctx, e: Occupant): boolean => {
  const m = monOf(e);
  return isU(e) || (m !== null && canseemon(ctx, m));
};

/** "You"/"The soldier" for E_phrase() and "you"/"the soldier" for e_nam(): a key per case. */
const eMsg = (ctx: Ctx, e: Occupant, key: string, params: Msg['params'] = {}): void => {
  const m = monOf(e);
  if (m === null) say(ctx, `${key}.you`, params);
  else say(ctx, `${key}.mon`, { ...params, mon: monNam(ctx, m) });
};

/** Simple-minded "can it be here?" routine. ref: src/dbridge.c e_survives_at() */
function eSurvivesAt(ctx: Ctx, run: Run, e: Occupant, x: number, y: number): boolean {
  const d = edata(ctx, e);
  const level = run.level;
  if (d && noncorporeal(d)) return true;
  if (isPool(ctx, level, x, y))
    return (
      (isU(e) &&
        (wwalking(ctx) ||
          amphibious(ctx) ||
          breathless(ctx) ||
          swimming(ctx) ||
          flying(ctx) ||
          levitating(ctx))) ||
      (d !== null && (isSwimmer(d) || isFlyer(d) || isFloater(d)))
    );
  // must force call to lava_effects in e_died if is_u
  if (isLava(ctx, level, x, y))
    return (
      (isU(e) && (levitating(ctx) || flying(ctx))) || (d !== null && (likesLava(d) || isFlyer(d)))
    );
  if (isDbWall(level, x, y)) return isU(e) ? uPassesWalls(ctx) : passesWallsDef(d);
  return true;
}

/** These are never directly affected by a bridge or portcullis. ref: src/dbridge.c automiss() */
function automiss(ctx: Ctx, e: Occupant): boolean {
  const d = edata(ctx, e);
  return (isU(e) ? uPassesWalls(ctx) : passesWallsDef(d)) || (d !== null && noncorporeal(d));
}

/** ref: helpless(): asleep or unable to move */
const monHelpless = (ctx: Ctx, m: Entity): boolean =>
  m.c.monster?.asleep === true || isFrozen(ctx, m.id);

/**
 * Does the falling drawbridge or portcullis (or, `chunks`, its debris) miss it? Out of 8: a
 * flyer that can move 5, a floater (or a levitating hero) 3, debris over water 2, 3 fewer under
 * the portcullis; `rnd(8)` is always drawn. ref: src/dbridge.c e_missed()
 */
function eMissed(ctx: Ctx, run: Run, e: Occupant, chunks: boolean): boolean {
  if (automiss(ctx, e)) return true;
  const d = edata(ctx, e);
  const m = monOf(e);
  let misses: number;
  if (d && isFlyer(d) && (isU(e) ? !unaware(ctx) : m !== null && !monHelpless(ctx, m)))
    misses = 5; // flying requires mobility
  else if ((d && isFloater(d)) || (isU(e) && levitating(ctx)))
    misses = 3; // doesn't require mobility
  else if (chunks && isPool(ctx, run.level, e.x, e.y))
    misses = 2; // sitting ducks
  else misses = 0;
  if (isDbWall(run.level, e.x, e.y)) misses -= 3; // less airspace
  return misses >= ctx.rng.rnd(8);
}

/**
 * Can it jump from death? 4 in 10, 2 fewer when confused, 3 when stunned, 2 under the
 * portcullis; never when helpless, immobile or a long worm. ref: src/dbridge.c e_jumps()
 */
function eJumps(ctx: Ctx, run: Run, e: Occupant): boolean {
  const hero = getPlayer(ctx.state);
  const m = monOf(e);
  let tmp = 4; // out of 10
  if (isU(e) ? unaware(ctx) || hasProp(hero, P.FUMBLING) : m === null) return false;
  if (m !== null) {
    const d = edata(ctx, e);
    if (monHelpless(ctx, m) || !d?.speed || wormRec(ctx.state, m.id) !== null) return false;
  }
  if (m === null ? hasProp(hero, P.CONFUSION) : isMConfused(ctx, m.id)) tmp -= 2;
  if (m === null ? hasProp(hero, P.STUNNED) : isMStunned(ctx, m.id)) tmp -= 3;
  if (isDbWall(run.level, e.x, e.y)) tmp -= 2; // less room to maneuver
  return tmp >= ctx.rng.rnd(10);
}

/** Pronoun params of a monster ('@uhitm.pron.he.m' ...; monsters have no gender of their own). */
const mhe = (ctx: Ctx, m: Entity): string => {
  const f = ctx.defs.monster(m.def).flags;
  return `@uhitm.pron.he.${f.includes('female') ? 'f' : f.includes('neuter') ? 'n' : 'm'}`;
};

/**
 * The hero's kill (xkilled(): "You kill it!" with `givemsg`, experience) or, when a monster
 * caused it, monkilled() ("The soldier is killed!" with `givemsg`). `nocorpse`: XKILL_NOCORPSE
 * (monkilled()'s AD_DGST).
 */
function killMon(ctx: Ctx, run: Run, m: Entity, nocorpse: boolean, givemsg: boolean): void {
  if (run.monMoving) {
    monkilled(ctx, m.id, givemsg, undefined, nocorpse ? 'dgst' : undefined);
    return;
  }
  const def = ctx.defs.monster(m.def);
  const lvl = m.c.monster?.level ?? 0;
  if (givemsg)
    say(ctx, nonliving(def) ? 'combat.you_destroy' : 'combat.you_kill', { mon: monNam(ctx, m) });
  monsterDied(ctx, m.id, true, false, nocorpse);
  if (!ctx.state.entities[String(m.id)]?.c.monster)
    gainExperience(ctx, ctx.state.playerId, experienceFor(def, lvl, ctx.state));
}

const alive = (ctx: Ctx, m: Entity): boolean =>
  ctx.state.entities[String(m.id)]?.c.monster !== undefined;

/** Moves the hero at once (C's `u.ux = newx`: no spoteffects()). */
function moveHero(ctx: Ctx, x: number, y: number): void {
  const h = getPlayer(ctx.state);
  const p = h.c.pos;
  if (!p) return;
  const from = { x: p.x, y: p.y };
  h.c.pos = { level: p.level, x, y };
  ctx.emit({ type: 'moved', id: h.id, from, to: { x, y } });
}

/**
 * The entity dies: the hero drowns (drown()), burns (lava_effects()) or is crushed (done(), with
 * "falling drawbridge" unless a reason is set); a life-saved hero left where she cannot live is
 * moved next to it ("A strange force teleports you away..."). A monster is killed (twice when
 * life-saved: "Unfortunately for the soldier, he is still crushed.") and leaves the occupants.
 * ref: src/dbridge.c e_died()
 */
function eDied(
  ctx: Ctx,
  run: Run,
  e: Occupant,
  flags: { nocorpse: boolean; givemsg: boolean },
  how: 'drowning' | 'burning' | 'crushing',
): void {
  if (isU(e)) {
    if (how === 'drowning') {
      run.killer = null; // drown() sets its own killer
      drown(ctx);
    } else if (how === 'burning') {
      run.killer = null; // lava_effects() sets own killer
      lavaEffects(ctx);
    } else {
      // use more specific killer if specified
      done(ctx, run.killer ?? '@killer.dbridge.falling', 'crushing');
      // So, you didn't die
      if (!ctx.state.gameOver && !eSurvivesAt(ctx, run, e, e.x, e.y)) {
        const xy = mnextoPos(ctx, run.level, ctx.state.playerId, { x: e.x, y: e.y });
        if (xy) {
          say(
            ctx,
            hasProp(getPlayer(ctx.state), P.HALLUC)
              ? 'dbridge.normal_force'
              : 'dbridge.strange_force',
          );
          teleds(ctx, xy.x, xy.y);
        }
        // otherwise on top of the drawbridge is the only viable spot in the dungeon
      }
    }
    // we might have crawled out of the moat to survive
    const p = getPlayer(ctx.state).c.pos;
    if (p) {
      e.x = p.x;
      e.y = p.y;
    }
    return;
  }
  const m = monOf(e);
  if (!m) return;
  run.killer = null;
  killMon(ctx, run, m, flags.nocorpse, flags.givemsg);
  // if etmp gets life-saved, kill it again; otherwise we might end up trying to place another
  // monster (probably a xorn) on same spot
  if (alive(ctx, m)) {
    const seeit = canSpotMon(ctx, m);
    killMon(ctx, run, m, flags.nocorpse, false);
    if (!alive(ctx, m) && seeit)
      say(ctx, 'dbridge.still_crushed', { mon: monNam(ctx, m), he: mhe(ctx, m) });
  }
  // dead long worm handling
  for (const o of run.occ) if (o !== e && o.who === m) o.who = null;
  e.who = null;
}

/**
 * What the bridge or portcullis does to the entity: a wall-walker or a ghost it passes through;
 * missed, it stays if it can live there, else it jumps (from under the portcullis) or rides the
 * bridge in; hit, it is crushed under a lowered bridge, or must jump clear (to the bridge from
 * the portcullis, or back off the bridge) or be crushed. Where it ends: under the closed
 * portcullis it is crushed unless it passes walls ("You tumble towards the closed
 * portcullis!"); on the span, now water or lava, it drowns or burns unless it can live there.
 * ref: src/dbridge.c do_entity()
 */
function doEntity(ctx: Ctx, run: Run, e: Occupant): void {
  if (e.who === null || ctx.state.gameOver) return;
  const level = run.level;
  let eInview = eCanseemon(ctx, e);
  const oldx = e.x;
  const oldy = e.y;
  const atPortcullis = isDbWall(level, oldx, oldy);
  if (automiss(ctx, e) && eSurvivesAt(ctx, run, e, oldx, oldy)) {
    if (eInview && (atPortcullis || isDrawbridge(level, oldx, oldy)))
      eMsg(ctx, e, 'dbridge.passes_through', {
        what: atPortcullis ? '@dbridge.portcullis' : '@dbridge.drawbridge',
      });
    if (isU(e)) pooleffects(ctx, false); // spoteffects(FALSE)
    return;
  }
  let mustJump = false;
  let relocates = false;
  if (eMissed(ctx, run, e, false)) {
    if (atPortcullis) eMsg(ctx, e, 'dbridge.portcullis_misses');
    if (eSurvivesAt(ctx, run, e, oldx, oldy)) return;
    // Mon can't survive here
    if (atPortcullis) mustJump = true;
    else relocates = true; // just ride drawbridge in
  } else {
    if (isLoweredSpan(level, oldx, oldy)) {
      if (isU(e)) run.killer = '!@killer.dbridge.crushed';
      eMsg(ctx, e, 'dbridge.crushed_under'); // no jump
      eDied(ctx, run, e, { nocorpse: true, givemsg: eInview }, 'crushing'); // no corpse
      return; // Note: Beyond this point, we know we're not at an opened drawbridge, since all
    } // *missable* creatures survive on the square, and all the unmissed ones die.
    mustJump = true;
  }
  if (mustJump) {
    if (atPortcullis) {
      if (eJumps(ctx, run, e)) relocates = true;
      else {
        if (eInview) eMsg(ctx, e, 'dbridge.crushed_portcullis');
        else say(ctx, 'dbridge.hear_crushing');
        eDied(ctx, run, e, { nocorpse: true, givemsg: eInview }, 'crushing'); // no corpse
        return;
      }
    } else relocates = !eJumps(ctx, run, e); // tries to jump off bridge to original square
  }
  // Here's where we try to do relocation: to the span from the portcullis, to the portcullis
  // from the span.
  const span = findDrawbridge(ctx, level, oldx, oldy) ?? { x: oldx, y: oldy };
  let to: Pos = span;
  if (span.x === oldx && span.y === oldy) {
    const d = drawbridgeData(ctx, level, oldx, oldy);
    if (d) to = wallForDb(d.dir, oldx, oldy);
  }
  if (relocates && eAt(run, to.x, to.y)) {
    // Standoff problem: one or both entities must die, and/or both switch places. Avoid infinite
    // recursion by checking first whether the other entity is staying put.
    const other = eAt(run, to.x, to.y) as Occupant;
    if (eSurvivesAt(ctx, run, other, to.x, to.y) && automiss(ctx, other))
      relocates = false; // "other" won't budge
    else {
      // (each round the other either moves or dies, or rolls again: cap it against a stuck one)
      for (let guard = 0; guard < 1000; guard++) {
        const o = eAt(run, to.x, to.y);
        if (!o || o === e || ctx.state.gameOver) break;
        doEntity(ctx, run, other);
      }
      if (eAt(run, oldx, oldy) !== e) return; // moved or died in recursion somewhere
    }
  }
  if (relocates && !eAt(run, to.x, to.y) && !e.tail) {
    const m = monOf(e);
    if (m) {
      const p = m.c.pos;
      if (p) m.c.pos = { level: p.level, x: to.x, y: to.y };
    } else moveHero(ctx, to.x, to.y);
    e.x = to.x;
    e.y = to.y;
    eInview = eCanseemon(ctx, e);
  }
  if (isDbWall(level, e.x, e.y)) {
    // in portcullis chamber
    if (eInview) {
      if (isU(e)) {
        say(ctx, 'dbridge.tumble');
        say(ctx, automiss(ctx, e) ? 'dbridge.pass_through_it' : 'dbridge.closes_in');
      } else eMsg(ctx, e, 'dbridge.disappears_behind');
    }
    if (!eSurvivesAt(ctx, run, e, e.x, e.y)) {
      run.killer = '@killer.dbridge.closing';
      eDied(ctx, run, e, { nocorpse: false, givemsg: false }, 'crushing');
    }
    return;
  }
  // on drawbridge square
  const pool = isPool(ctx, level, e.x, e.y);
  const lava = isLava(ctx, level, e.x, e.y);
  if (pool && !eInview) say(ctx, 'dbridge.hear_splash');
  if (eSurvivesAt(ctx, run, e, e.x, e.y)) {
    const d = edata(ctx, e);
    if (eInview && !(d && (isFlyer(d) || isFloater(d)))) eMsg(ctx, e, 'dbridge.fall_from');
    return;
  }
  // cannot survive on the drawbridge square
  const m = monOf(e);
  if ((pool || lava) && eInview && m) {
    // drown() will supply msgs if nec.
    const halluc = hasProp(getPlayer(ctx.state), P.HALLUC);
    say(ctx, halluc ? 'dbridge.drinks_and_disappears' : 'dbridge.falls_into', {
      mon: monNam(ctx, m),
      what: lava ? '@dbridge.lava' : '@dbridge.moat',
    });
  }
  run.killer = '!@killer.dbridge.fell';
  eDied(
    ctx,
    run,
    e,
    { nocorpse: true, givemsg: eInview },
    pool ? 'drowning' : lava ? 'burning' : 'crushing',
  );
}

// ---------------------------------------------------------------------------------------------
// Raising, lowering and destroying.

const distu = (p: Pos | undefined, x: number, y: number): number =>
  p ? (p.x - x) ** 2 + (p.y - y) ** 2 : 0;

/** Deletes every object on (x, y): delallobj() (no shop bills on a drawbridge). */
function delallobj(ctx: Ctx, level: Level, x: number, y: number): void {
  for (const o of itemsAt(ctx.defs, ctx.state, level.id, x, y)) ctx.remove(o.id);
}

/** The trap and the engraving on (x, y) go (C deletes both squares' traps, then engravings). */
function deltrapAt(ctx: Ctx, level: Level, x: number, y: number): void {
  const t = trapAt(level, x, y);
  if (t) deltrap(ctx, level.id, t);
  delEngrAt(ctx, level, x, y);
}

/** The drawbridge operation's level (the hero's) and its span's data, or null. */
function setup(ctx: Ctx, opts: DbOpts): Run {
  return {
    level: ctx.state.levels[ctx.state.currentLevel] as Level,
    occ: [nobody(), nobody()],
    killer: null,
    monMoving: opts.monMoving === true,
  };
}

/** `monMoving`: a monster caused it (C's `context.mon_moving`). */
export interface DbOpts {
  monMoving?: boolean;
}

/**
 * Raises the lowered drawbridge at (x, y) of the hero's level: "You see a drawbridge coming
 * up!" ("going" when she is farther from the portcullis than the span and not in line with it),
 * else "You hear chains rattling and gears turning."; the span becomes what lies under it, the
 * portcullis a raised (nondiggable) drawbridge; whoever is on the span, then under the
 * portcullis, meets do_entity(); the objects on both are smashed ("You hear smashing and
 * crushing."), the traps deleted. ref: src/dbridge.c close_drawbridge()
 */
export function closeDrawbridge(ctx: Ctx, x: number, y: number, opts: DbOpts = {}): void {
  const run = setup(ctx, opts);
  const { level } = run;
  if (!isLoweredSpan(level, x, y)) return;
  const d = drawbridgeData(ctx, level, x, y);
  if (!d) return;
  const w = wallForDb(d.dir, x, y);
  const hp = getPlayer(ctx.state).c.pos;
  if (cansee(ctx, level.id, x, y) || cansee(ctx, level.id, w.x, w.y)) {
    const coming = hp?.x === x || hp?.y === y || distu(hp, w.x, w.y) < distu(hp, x, y);
    say(ctx, coming ? 'dbridge.see_up_coming' : 'dbridge.see_up_going');
  } else say(ctx, 'dbridge.hear_chains_gears'); // "5 gears turn" for castle drawbridge tune
  setTerrain(level, x, y, raisedTerrain(d.under));
  setTerrain(level, w.x, w.y, dbwallTerrain(d.dir));
  const [e0, e1] = run.occ;
  setEntity(ctx, run, x, y, e0);
  setEntity(ctx, run, w.x, w.y, e1);
  doEntity(ctx, run, e0); // Do set_entity after first
  setEntity(ctx, run, w.x, w.y, e1); // do_entity for worm tail
  doEntity(ctx, run, e1);
  if (itemsAt(ctx.defs, ctx.state, level.id, x, y).length > 0) say(ctx, 'dbridge.hear_smashing');
  delallobj(ctx, level, x, y);
  delallobj(ctx, level, w.x, w.y);
  deltrapAt(ctx, level, x, y);
  deltrapAt(ctx, level, w.x, w.y);
}

/**
 * Lowers the raised drawbridge at (x, y) of the hero's level: "You see a drawbridge coming
 * down!" ("going" when she is nearer the portcullis), else "You hear gears turning and chains
 * rattling."; the span becomes a lowered bridge and the portcullis an empty doorway; whoever is
 * on the span (crushed unless missed), then in the doorway, meets do_entity(); the objects on the
 * span are smashed, the traps on both deleted. On the Castle she has opened its drawbridge.
 * ref: src/dbridge.c open_drawbridge()
 */
export function openDrawbridge(ctx: Ctx, x: number, y: number, opts: DbOpts = {}): void {
  const run = setup(ctx, opts);
  const { level } = run;
  if (!isRaisedSpan(level, x, y)) return;
  const d = drawbridgeData(ctx, level, x, y);
  if (!d) return;
  const w = wallForDb(d.dir, x, y);
  const hp = getPlayer(ctx.state).c.pos;
  if (cansee(ctx, level.id, x, y) || cansee(ctx, level.id, w.x, w.y))
    say(
      ctx,
      distu(hp, w.x, w.y) < distu(hp, x, y) ? 'dbridge.see_down_going' : 'dbridge.see_down_coming',
    );
  else say(ctx, 'dbridge.hear_gears_chains'); // "5 gears turn" for castle drawbridge tune
  setTerrain(level, x, y, loweredTerrain(d.dir));
  setTerrain(level, w.x, w.y, T.doorway); // DOOR, D_NODOOR
  const [e0, e1] = run.occ;
  setEntity(ctx, run, x, y, e0);
  setEntity(ctx, run, w.x, w.y, e1);
  doEntity(ctx, run, e0); // do set_entity after first
  setEntity(ctx, run, w.x, w.y, e1); // do_entity for worm tails
  doEntity(ctx, run, e1);
  delallobj(ctx, level, x, y);
  deltrapAt(ctx, level, x, y);
  deltrapAt(ctx, level, w.x, w.y);
  if (level.def === CASTLE) setUopenedDbridge(ctx);
}

/**
 * Destroys the drawbridge at (x, y) of the hero's level, raised or lowered: over the moat or lava
 * it falls in ("The portcullis of the drawbridge falls into the moat!", "The drawbridge
 * collapses into the moat!", "You hear a loud *SPLASH*!") and a boulder on it falls in too;
 * else it disintegrates ("You hear a loud *CRASH*!") leaving floor or ice. Nearby monsters
 * wake; the portcullis is an empty doorway; `rn2(6)` pieces of debris are drawn (none made).
 * Whoever is in the doorway is blown apart by the debris unless it passes walls; whoever is on
 * the span is hit by a chunk of metal unless missed (then the water or lava there takes it). On
 * the Castle she has opened its drawbridge, and the tune is useless now.
 * ref: src/dbridge.c destroy_drawbridge()
 */
export function destroyDrawbridge(ctx: Ctx, x: number, y: number, opts: DbOpts = {}): void {
  const run = setup(ctx, opts);
  const { level } = run;
  if (!isDrawbridge(level, x, y)) return;
  const d = drawbridgeData(ctx, level, x, y);
  if (!d) return;
  const w = wallForDb(d.dir, x, y);
  const hp = getPlayer(ctx.state).c.pos;
  const uAt = (px: number, py: number): boolean =>
    hp?.level === level.id && hp.x === px && hp.y === py;
  if (d.under === 'moat' || d.under === 'lava') {
    const lava = d.under === 'lava';
    const what = lava ? '@dbridge.lava' : '@dbridge.moat';
    if (isRaisedSpan(level, x, y)) {
      if (cansee(ctx, level.id, w.x, w.y) || uAt(w.x, w.y))
        say(ctx, 'dbridge.portcullis_falls', { what });
      else say(ctx, 'dbridge.hear_loud_splash');
    } else if (cansee(ctx, level.id, x, y) || uAt(x, y)) say(ctx, 'dbridge.collapses', { what });
    else say(ctx, 'dbridge.hear_loud_splash');
    setTerrain(level, x, y, lava ? T.lava : T.moat);
    setDrawbridgeData(ctx, level, x, y, null);
    const boulder = itemsAt(ctx.defs, ctx.state, level.id, x, y).find((o) => o.def === BOULDER);
    if (boulder) {
      delete boulder.c.pos; // obj_extract_self()
      if (!flooreffects(ctx, boulder, x, y, 'fall')) boulder.c.pos = { level: level.id, x, y };
    }
  } else {
    // no moat beneath
    if (cansee(ctx, level.id, x, y) || uAt(x, y)) say(ctx, 'dbridge.disintegrates');
    else say(ctx, 'dbridge.hear_loud_crash');
    setTerrain(level, x, y, d.under === 'ice' ? T.ice : T.floor);
    if (d.under === 'ice') setIcedpool(ctx, level, x, y, 'moat'); // ICED_MOAT
    setDrawbridgeData(ctx, level, x, y, null);
  }
  wakeNearto(ctx, x, y, 500);
  setTerrain(level, w.x, w.y, T.doorway); // DOOR, D_NODOOR
  deltrapAt(ctx, level, x, y);
  deltrapAt(ctx, level, w.x, w.y);
  // scatter some debris: rn2(6) iron chains at <x|x2, y|y2> (no iron chains exist here)
  for (let i = ctx.rng.rn2(6); i > 0; --i) {
    ctx.rng.rn2(2);
    ctx.rng.rn2(2);
  }
  if (level.def === CASTLE) setUopenedDbridge(ctx);
  const [e1, e2] = run.occ;
  setEntity(ctx, run, w.x, w.y, e2); // currently only automissers can be here
  if (e2.who !== null) {
    const inview = eCanseemon(ctx, e2);
    if (!automiss(ctx, e2)) {
      if (inview) eMsg(ctx, e2, 'dbridge.blown_apart');
      run.killer = '@killer.dbridge.exploding';
      eDied(ctx, run, e2, { nocorpse: true, givemsg: inview }, 'crushing'); // no corpse
    } // nothing which is vulnerable can survive this
  }
  setEntity(ctx, run, x, y, e1);
  if (e1.who !== null && !ctx.state.gameOver) {
    const inview = eCanseemon(ctx, e1);
    if (eMissed(ctx, run, e1, true)) {
      // spared: if there is water or lava here, fall in now
      const m = monOf(e1);
      if (m === null)
        pooleffects(ctx, false); // spoteffects(FALSE)
      else minliquid(ctx, m, run.monMoving);
    } else {
      const m = monOf(e1);
      if (inview) {
        if (m && hasProp(getPlayer(ctx.state), P.HALLUC))
          say(ctx, 'dbridge.heavy_metal', { mon: monNam(ctx, m) });
        else eMsg(ctx, e1, 'dbridge.chunk_of_metal');
      } else if (m && !isPool(ctx, level, x, y)) say(ctx, 'dbridge.hear_crushing');
      run.killer = '@killer.dbridge.collapsing';
      eDied(ctx, run, e1, { nocorpse: true, givemsg: inview }, 'crushing'); // no corpse
      if (terrainIdAt(level, e1.x, e1.y) === T.moat) doEntity(ctx, run, e1);
    }
  }
  if (level.def === CASTLE) setUheardTune(ctx, 3); // bridge is gone so tune is now useless
}
