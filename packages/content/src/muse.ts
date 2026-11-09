// Monsters using items and the level to save themselves: find_defensive() picks what to do,
// use_defensive() does it (in the same move: nothing about the choice is kept): the item-free
// escapes (up or down the stairs, the branch stairs, into a trap door or hole, onto a
// teleportation trap, out of the dungeon from the first level's up stairs), the healing potions,
// the unicorn horn, the lizard corpse, the bugle, the wands of digging, teleportation, create
// monster and undead turning, and the scrolls of teleportation and create monster.
// ref: src/muse.c find_defensive(), use_defensive(), precheck(), mzapwand(), mreadmsg(),
// mquaffmsg(), m_use_healing(), m_sees_sleepy_soldier(), m_tele(), reveal_trap(), mon_escape(),
// mon_consume_unstone(), mbhit(), mbhitm() (undead turning); include/hack.h WAND_BACKFIRE_CHANCE
//
// Not ported: the ghost in a milky potion and the djinni in a smoky one (precheck(); as for the
// hero's quaff), ladders, Pestilence, the Wizard, monsters carrying the Amulet (mon_has_amulet(),
// mon_has_special(): never, so MUSE_WAN_TELEPORTATION, zapping her, is never chosen), Fort
// Ludios (m_next2m(): never reached), deafness (never deaf), tins (no lizard tin), pools, lava,
// ice and drawbridges (no such terrain), `trycall()` (naming unknown types).
import {
  cellIndex,
  cellRules,
  getLevel,
  getPlayer,
  inBounds,
  itemsAt,
  levelIdFor,
  NORMAL_SPEED,
  rootDungeon,
  trapAt,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type Level,
  type Msg,
  type Pos,
  type Trap,
} from '@nh/core';
import { couldseeAt } from './apparxy';
import { clearPath } from './clearpath';
import { blockersOf, boulderAt } from './boulder';
import { resist, wakeGently } from './buzz';
import { bypassObj, clearBypasses } from './bypass';
import { uwepOf } from './combat';
import { dogNutrition, edogOf } from './dog';
import { stopOccupation } from './eat';
import { uswallow } from './engulfstate';
import { epriOf } from './epri';
import { useOne } from './erode';
import { eshkOf, inhishop } from './eshk';
import { fillPit } from './flooreffects';
import { makemon, mnextoPos } from './generation';
import { isGenocided } from './vanquished';
import { polyWhenStoned } from './golem';
import { ustuck } from './hackmove';
import { maybeUnhideAt } from './hide';
import { canseemon, mapInvisible } from './invis';
import { canDigDown, nonDiggable } from './levelflags';
import { migrateToLevel } from './migrate';
import { amorphous, isFlyer, isUnicorn, nohands, nolimbs, slithy } from './mondata';
import { mongone, monkilled } from './mondeath';
import { minvent } from './mongear';
import { isFleeing, monflee } from './monflee';
import { healmon, isMConfused, isMStunned, mcansee, setMConfused, setMStunned } from './mstate';
import { linedUp } from './mthrowu';
import { BUGLE, awakenSoldiers } from './music';
import { mcureblindness } from './musestate';
import { discover } from './o_init';
import { doname, xnameOf } from './objnam';
import { canSpotMon, monNam, someMonNam } from './perception';
import { unturnDead } from './revive';
import { helpless } from './shk';
import { resistsSton, touchPetrifies } from './stonestate';
import { onscary } from './scary';
import { isAnimal } from './steal';
import { T, isFurnitureId, isStwallId, setTerrain, surfaceKey, terrainIdAt } from './terrain';
import { TRAP, canFallThru, cansee, isHole, maketrap, mintrap, rlocMon, seetrap } from './trap';
import { isMtrapped, isPit, monKnowsTraps, monLearnsTraps } from './trapstate';
import {
  SOKOBAN_DUNGEON,
  levelAtDepth,
  noteleportLevel,
  randomTeleportLevel,
  teleRestrict,
} from './teleport';
import { UNICORN_HORN } from './unicorn';
import { isGuard } from './vaultstate';
import { wormMove } from './worm';
import { bhito } from './zap';
import { mAt, wormRec } from './wormstate';

/** The defensive choices. ref: src/muse.c MUSE_* (the defensive ones; no ladders) */
export type MuseDef =
  | 'scr_tele'
  | 'wan_tele_self'
  | 'wan_tele'
  | 'pot_healing'
  | 'pot_extra_healing'
  | 'pot_full_healing'
  | 'wan_digging'
  | 'trapdoor'
  | 'teleport_trap'
  | 'upstairs'
  | 'downstairs'
  | 'sstairs'
  | 'wan_create_monster'
  | 'scr_create_monster'
  | 'bugle'
  | 'unicorn_horn'
  | 'lizard_corpse'
  | 'wan_undead_turning';

/**
 * A monster's choice: C's gm.m.has_defense/defensive, gt.trapx/trapy for a trap, and for a wand
 * zapped at the hero where the monster thinks she is (mux/muy).
 */
export interface MuseChoice<K> {
  kind: K;
  obj: EntityId | null;
  trap?: Pos;
  aim?: Pos;
}

/** 0: nothing happened; 1: the monster died; 2: it acted (and can't attack this move). */
export type MuseResult = 0 | 1 | 2;

/** ref: include/hack.h WAND_BACKFIRE_CHANCE */
const WAND_BACKFIRE_CHANCE = 100;
/** ref: include/hack.h BOLT_LIM */
const BOLT_LIM = 8;

const POT_HEALING: DefId = 'nh:potion_of_healing';
const POT_EXTRA_HEALING: DefId = 'nh:potion_of_extra_healing';
const POT_FULL_HEALING: DefId = 'nh:potion_of_full_healing';
const WAN_DIGGING: DefId = 'nh:wand_of_digging';
const WAN_TELEPORTATION: DefId = 'nh:wand_of_teleportation';
const WAN_CREATE_MONSTER: DefId = 'nh:wand_of_create_monster';
const WAN_UNDEAD_TURNING: DefId = 'nh:wand_of_undead_turning';
const SCR_TELEPORTATION: DefId = 'nh:scroll_of_teleportation';
const SCR_CREATE_MONSTER: DefId = 'nh:scroll_of_create_monster';
const CORPSE: DefId = 'nh:corpse';
const LIZARD: DefId = 'nh:lizard';
const ACID_BLOB: DefId = 'nh:acid_blob';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const dist2 = (x0: number, y0: number, x1: number, y1: number): number =>
  (x0 - x1) * (x0 - x1) + (y0 - y1) * (y0 - y1);

/** ref: include/mondata.h mindless(): M1_MINDLESS */
const mindless = (ctx: Ctx, mon: Entity): boolean =>
  ctx.defs.monster(mon.def).flags.includes('mindless');

/** ref: include/mondata.h is_floater(): S_EYE and S_LIGHT */
const isFloater = (ctx: Ctx, mon: Entity): boolean => {
  const ch = ctx.defs.monster(mon.def).glyph.ch;
  return ch === 'e' || ch === 'y';
};

/** ref: include/mondata.h verysmall(), throws_rocks(), passes_walls() */
const ignoresBoulders = (ctx: Ctx, mon: Entity): boolean => {
  const def = ctx.defs.monster(mon.def);
  return def.size === 'tiny' || def.flags.includes('rockthrow') || def.flags.includes('wallwalk');
};

/** ref: include/mondata.h NODIAG(): the grid bug */
const noDiag = (mon: Entity): boolean => mon.def === 'nh:grid_bug';

/** isshk, isgd, ispriest */
const isShkGdPriest = (ctx: Ctx, id: EntityId): boolean =>
  eshkOf(ctx, id) !== null || isGuard(ctx.state, id) || epriOf(ctx, id) !== null;

/** ref: include/mondata.h haseyes(): not M1_NOEYES */
const haseyes = (ctx: Ctx, mon: Entity): boolean =>
  !ctx.defs.monster(mon.def).flags.includes('noeyes');

/** ref: include/mondata.h is_mercenary(): M2_MERC */
const isMercenary = (ctx: Ctx, mon: Entity): boolean =>
  ctx.defs.monster(mon.def).flags.includes('merc');

/** ref: include/mondata.h is_bat(): the bat, giant bat and vampire bat */
const isBat = (mon: Entity): boolean =>
  mon.def === 'nh:bat' || mon.def === 'nh:giant_bat' || mon.def === 'nh:vampire_bat';

const sgn = (n: number): -1 | 0 | 1 => (n > 0 ? 1 : n < 0 ? -1 : 0);

const spe = (o: Entity): number => o.c.item?.spe ?? 0;

/** ref: src/mkobj.c bcsign() */
const bcsign = (o: Entity): number =>
  o.c.item?.buc === 'blessed' ? 1 : o.c.item?.buc === 'cursed' ? -1 : 0;

/** The first carried object of type `otyp` in minvent order. ref: src/invent.c m_carrying() */
const mCarrying = (ctx: Ctx, id: EntityId, otyp: DefId): Entity | null =>
  minvent(ctx, id).find((o) => o.def === otyp) ?? null;

/** The terrain's stairs at (x, y): 'up', 'down' or undefined. ref: levl[x][y].typ == STAIRS */
function stairsAt(ctx: Ctx, level: Level, x: number, y: number): 'up' | 'down' | undefined {
  const t = level.palette[level.cells[cellIndex(level, x, y)] ?? 0];
  return t === undefined ? undefined : ctx.defs.terrain(t).stairs;
}

/** ledger_no(&u.uz) == 1: the first level of the Dungeons of Doom. */
const firstLevel = (ctx: Ctx, level: Level): boolean =>
  level.dungeon === rootDungeon(ctx.state).id && level.dlevel === 1;

/**
 * Whether a monster close to "seeing" range is near enough to be heard nearby: the same near/far
 * threshold as mzapwand(): within 9 squares where the hero could see it, 5 otherwise.
 */
function heardNearby(ctx: Ctx, mon: Entity): boolean {
  const p = mon.c.pos;
  const hp = getPlayer(ctx.state).c.pos;
  if (!p || !hp) return false;
  const range = couldseeAt(ctx, p.x, p.y) ? BOLT_LIM + 1 : BOLT_LIM - 3;
  return dist2(p.x, p.y, hp.x, hp.y) <= range * range;
}

/**
 * Whatever can go wrong before the monster uses `obj`: a cursed wand blows up one time in 100
 * (`d(spe + 2, 6)` to the monster, "The kobold zaps a wand of striking, which suddenly
 * explodes!", or "You hear a zap and an explosion nearby." unseen). Returns 1 when that killed it,
 * -1 when the wand blew up (the choice is gone: use_defensive() does nothing more), else 0.
 * ref: src/muse.c precheck() (not ported: the milky potion's ghost and the smoky potion's djinni)
 */
export function precheck(ctx: Ctx, id: EntityId, obj: Entity | null): -1 | 0 | 1 {
  const mon = ctx.state.entities[String(id)];
  const p = mon?.c.pos;
  const it = obj?.c.item;
  if (!mon || !p || !obj || !it) return 0;
  const vis = cansee(ctx, p.level, p.x, p.y);
  if (ctx.defs.object(obj.def).class !== 'wand' || it.buc !== 'cursed') return 0;
  if (ctx.rng.rn2(WAND_BACKFIRE_CHANCE)) return 0;
  const dam = ctx.rng.d(it.spe + 2, 6);
  if (vis)
    say(ctx, 'muse.wand_explodes', {
      mon: monNam(ctx, mon),
      item: xnameOf(ctx.state, ctx.defs, obj),
    });
  else say(ctx, heardNearby(ctx, mon) ? 'muse.hear_zap_explode_near' : 'muse.hear_zap_explode_far');
  useOne(ctx, id, obj);
  const hp = mon.c.hp;
  if (hp) {
    hp.cur -= dam;
    if (hp.cur <= 0) {
      monkilled(ctx, id, true); // AD_RBRE
      return 1;
    }
  }
  return -1;
}

/**
 * Whether the monster is lined up with where it thinks the hero is (`mu`): same row, column or
 * diagonal within BOLT_LIM, with a clear path (her line of sight when `mu` is her square).
 * ref: src/mthrowu.c lined_up(), m_lined_up(), linedup() (the boulder handling and her
 * concealment are not ported, as for the other ranged attacks)
 */
function linedUpHero(ctx: Ctx, mon: Entity, mu: Pos): boolean {
  const p = mon.c.pos;
  if (!p) return false;
  const level = getLevel(ctx.state, p.level);
  const hp = getPlayer(ctx.state).c.pos;
  const opaque = cellRules(level, ctx.defs).opaque;
  const blocked = blockersOf(ctx, level.id);
  return linedUp(p, mu, (ax, ay, bx, by) =>
    hp && hp.level === level.id && hp.x === ax && hp.y === ay
      ? couldseeAt(ctx, bx, by)
      : clearPath(level, opaque, ax, ay, bx, by, blocked),
  );
}

/**
 * Whether the monster sees a sleeping (helpless) soldier within 3 squares: a mercenary other
 * than a vault guard. ref: src/muse.c m_sees_sleepy_soldier()
 */
function mSeesSleepySoldier(ctx: Ctx, mon: Entity): boolean {
  const p = mon.c.pos;
  if (!p) return false;
  const level = getLevel(ctx.state, p.level);
  for (let xx = p.x - 3; xx <= p.x + 3; xx++)
    for (let yy = p.y - 3; yy <= p.y + 3; yy++) {
      if (!inBounds(level, xx, yy) || (xx === p.x && yy === p.y)) continue;
      const o = mAt(ctx.state, level.id, xx, yy);
      if (o && isMercenary(ctx, o) && o.def !== 'nh:guard' && helpless(ctx, o.id)) return true;
    }
  return false;
}

/** ref: src/muse.c m_use_healing(): full, then extra, then plain healing */
function mUseHealing(ctx: Ctx, id: EntityId): MuseChoice<MuseDef> | null {
  for (const [otyp, kind] of [
    [POT_FULL_HEALING, 'pot_full_healing'],
    [POT_EXTRA_HEALING, 'pot_extra_healing'],
    [POT_HEALING, 'pot_healing'],
  ] as const) {
    const o = mCarrying(ctx, id, otyp);
    if (o) return { kind, obj: o.id };
  }
  return null;
}

/**
 * Looks for a defensive item or escape for the monster: null when there is none. `tryescape`
 * (m_move(): it has nowhere to go) skips the distance and wound checks. `mux` is where it thinks
 * the hero is (default: its kept guess, else her square).
 * ref: src/muse.c find_defensive() (the unicorn horn, lizard corpse, bugle, undead turning and the
 * wands and scrolls of the inventory loop come with the next step; Pestilence is not ported)
 */
export function findDefensive(
  ctx: Ctx,
  id: EntityId,
  tryescape: boolean,
  mux?: Pos,
): MuseChoice<MuseDef> | null {
  const mon = ctx.state.entities[String(id)];
  const p = mon?.c.pos;
  const m = mon?.c.monster;
  if (!mon || !p || !m) return null;
  const def = ctx.defs.monster(mon.def);
  const level = getLevel(ctx.state, p.level);
  const { x, y } = p;
  const stuck = ustuck(ctx) === id;
  const immobile = def.speed === 0;
  const hp = getPlayer(ctx.state).c.pos;
  const mu = mux ?? hp ?? p;

  if (isAnimal(def) || mindless(ctx, mon)) return null;
  if (!tryescape && dist2(x, y, mu.x, mu.y) > 25) return null;
  // (Fort Ludios' m_next2m() test: there is no Fort Ludios)
  if (uswallow(ctx) && stuck) return null;

  // "Since unicorn horns don't get used up, the monster would look silly trying to use the same
  // cursed horn round after round, so skip cursed unicorn horns. Unicorns use their own horns;
  // they're excluded from inventory scanning by nohands()." (no Ki-rin)
  const conf = isMConfused(ctx, id);
  const stun = isMStunned(ctx, id);
  if (conf || stun || !mcansee(ctx, id)) {
    const horn = nohands(def)
      ? null
      : (minvent(ctx, id).find((o) => o.def === UNICORN_HORN && o.c.item?.buc !== 'cursed') ??
        null);
    if (horn || isUnicorn(def)) return { kind: 'unicorn_horn', obj: horn?.id ?? null };
  }
  if (conf || stun) {
    // (no tins: only the corpse)
    const liz = minvent(ctx, id).find((o) => o.def === CORPSE && o.c.item?.corpseOf === LIZARD);
    if (liz) return { kind: 'lizard_corpse', obj: liz.id };
  }

  // "the first case is when the monster is blind (healing cures blindness)"
  if (!mcansee(ctx, id) && !nohands(def)) {
    const c = mUseHealing(ctx, id);
    if (c) return c;
  }

  // "monsters aren't given wands of undead turning but if they happen to have picked one up, use
  // it against corpse wielder; when applicable, use it now even if 'mtmp' isn't wounded"
  const uwep = uwepOf(ctx);
  const cnm = uwep?.def === CORPSE ? uwep.c.item?.corpseOf : undefined;
  if (
    !m.peaceful &&
    !nohands(def) &&
    cnm !== undefined &&
    ctx.defs.isMonster(cnm) &&
    touchPetrifies(ctx.defs.monster(cnm)) &&
    !polyWhenStoned(def, isGenocided(ctx.state, 'nh:stone_golem')) &&
    !resistsSton(ctx, mon) &&
    linedUpHero(ctx, mon, mu)
  ) {
    const w = minvent(ctx, id).find((o) => o.def === WAN_UNDEAD_TURNING && spe(o) > 0);
    if (w) return { kind: 'wan_undead_turning', obj: w.id, aim: { x: mu.x, y: mu.y } };
  }

  if (!tryescape) {
    // "do we try to heal?"
    const ulevel = getPlayer(ctx.state).c.experience?.level ?? 1;
    const fraction = ulevel < 10 ? 5 : ulevel < 14 ? 4 : 3;
    const cur = mon.c.hp?.cur ?? 0;
    const max = mon.c.hp?.max ?? 0;
    if (cur >= max || (cur >= 10 && cur * fraction >= max)) return null;
    if (m.peaceful) return nohands(def) ? null : mUseHealing(ctx, id);
  }

  let choice: MuseChoice<MuseDef> | null = null;
  if (stuck || immobile || isMtrapped(ctx, id)) {
    // "fleeing by stairs or traps is not possible"
  } else if (stairsAt(ctx, level, x, y) !== undefined) {
    const b = level.branch;
    if (b && b.pos.x === x && b.pos.y === y) {
      if (b.dir === 'up' || !isFloater(ctx, mon)) choice = { kind: 'sstairs', obj: null };
    } else if (stairsAt(ctx, level, x, y) === 'down') {
      if (!isFloater(ctx, mon)) choice = { kind: 'downstairs', obj: null };
    } else choice = { kind: 'upstairs', obj: null };
  } else {
    // "Note: trap doors take precedence over teleport traps."; the monster's own square first,
    // then its neighbours (x outer, y inner)
    const diagOk = !noDiag(mon);
    const locs: Pos[] = [{ x, y }];
    for (let xx = x - 1; xx <= x + 1; xx++)
      for (let yy = y - 1; yy <= y + 1; yy++)
        if (xx >= 0 && yy >= 0 && xx < level.width && yy < level.height && (xx !== x || yy !== y))
          locs.push({ x: xx, y: yy });
    for (const l of locs) {
      // not the hero's square, not a diagonal for a grid bug, no other monster there
      if (hp && hp.level === level.id && hp.x === l.x && hp.y === l.y) continue;
      if (l.x !== x && l.y !== y && !diagOk) continue;
      if ((l.x !== x || l.y !== y) && mAt(ctx.state, level.id, l.x, l.y)) continue;
      const t = trapAt(level, l.x, l.y);
      if (
        !t ||
        (!ignoresBoulders(ctx, mon) && boulderAt(ctx, level.id, l.x, l.y)) ||
        onscary(ctx, l.x, l.y, mon)
      )
        continue;
      if (
        isHole(t.def) &&
        !isFloater(ctx, mon) &&
        !isShkGdPriest(ctx, id) &&
        canFallThru(ctx.state, level)
      ) {
        choice = { kind: 'trapdoor', obj: null, trap: { x: l.x, y: l.y } };
        break; // "no need to look at any other spots"
      } else if (t.def === TRAP.tele) {
        choice = { kind: 'teleport_trap', obj: null, trap: { x: l.x, y: l.y } };
      }
    }
  }

  if (nohands(def)) return choice; // "can't use objects"

  if (isMercenary(ctx, mon)) {
    const bugle = mCarrying(ctx, id, BUGLE);
    if (bugle && mSeesSleepySoldier(ctx, mon)) choice = { kind: 'bugle', obj: bugle.id };
  }

  // "use immediate physical escape prior to attempting magic" (stairs, trap door or tele-trap,
  // bugle alert)
  if (choice) return choice;

  // "kludge to cut down on trap destruction (particularly portals)": a pit, web or bear trap
  // here is ok for the monster to dig in
  const here = trapAt(level, x, y);
  const trapHere =
    here !== undefined && !(isPit(here.def) || here.def === TRAP.web || here.def === TRAP.bear);
  const hereId = terrainIdAt(level, x, y);
  const canZapDig =
    !stuck &&
    !trapHere &&
    !isShkGdPriest(ctx, id) &&
    !isFloater(ctx, mon) &&
    // "monsters digging in Sokoban can ruin things"
    level.dungeon !== SOKOBAN_DUNGEON &&
    // "digging wouldn't be effective; assume they know that" (W_NONDIGGABLE is only ever set on
    // stone, walls and trees)
    !(nonDiggable(ctx, level, x, y) && (isStwallId(hereId) || hereId === T.tree)) &&
    // !Is_botlevel()
    canFallThru(ctx.state, level);
  // "use the TELEP_TRAP bit to determine if they know about noteleport on this level or not"
  const teleOk = !noteleportLevel(ctx, level) || !monKnowsTraps(ctx, id, TRAP.tele);
  const reads = mcansee(ctx, id) && haseyes(ctx, mon);
  // a cursed scroll (a level teleport) is not for a shopkeeper in his shop, a guard or a priest
  const mayLeave = !(
    (eshkOf(ctx, id) !== null && inhishop(ctx, id)) ||
    isGuard(ctx.state, id) ||
    epriOf(ctx, id) !== null
  );

  // the inventory loop, in minvent order; "don't always use the same selection pattern"
  // (`nomore(x)`: once x is chosen, later objects of its kind are passed over)
  const is = (k: MuseDef): boolean => choice?.kind === k;
  for (const obj of minvent(ctx, id)) {
    if (choice && !ctx.rng.rn2(3)) break;
    if (is('wan_digging')) break;
    if (obj.def === WAN_DIGGING && spe(obj) > 0 && canZapDig)
      choice = { kind: 'wan_digging', obj: obj.id };
    if (is('wan_tele_self') || is('wan_tele')) continue;
    // (mon_has_amulet(): never, so never MUSE_WAN_TELEPORTATION)
    if (obj.def === WAN_TELEPORTATION && spe(obj) > 0 && teleOk)
      choice = { kind: 'wan_tele_self', obj: obj.id };
    if (is('scr_tele')) continue;
    if (
      obj.def === SCR_TELEPORTATION &&
      reads &&
      (obj.c.item?.buc !== 'cursed' || mayLeave) &&
      teleOk
    )
      choice = { kind: 'scr_tele', obj: obj.id };
    // (not Pestilence)
    if (is('pot_full_healing')) continue;
    if (obj.def === POT_FULL_HEALING) choice = { kind: 'pot_full_healing', obj: obj.id };
    if (is('pot_extra_healing')) continue;
    if (obj.def === POT_EXTRA_HEALING) choice = { kind: 'pot_extra_healing', obj: obj.id };
    if (is('wan_create_monster')) continue;
    if (obj.def === WAN_CREATE_MONSTER && spe(obj) > 0)
      choice = { kind: 'wan_create_monster', obj: obj.id };
    if (is('pot_healing')) continue;
    if (obj.def === POT_HEALING) choice = { kind: 'pot_healing', obj: obj.id };
    if (is('scr_create_monster')) continue;
    if (obj.def === SCR_CREATE_MONSTER) choice = { kind: 'scr_create_monster', obj: obj.id };
  }
  return choice;
}

/**
 * A monster deliberately entering a trap in a niche opens the niche: a secret corridor there
 * becomes a corridor; the trap is seen when `seeit`. ref: src/muse.c reveal_trap()
 */
function revealTrap(ctx: Ctx, level: Level, t: Trap, seeit: boolean): void {
  const i = cellIndex(level, t.x, t.y);
  if (level.palette[level.cells[i] ?? 0] === T.scorr) setTerrain(level, t.x, t.y, T.corr);
  if (seeit) seetrap(t);
}

/**
 * The monster leaves the dungeon by the first level's up stairs, for good (with all it carries):
 * "The hill orc escapes the dungeon!" when seen. ref: src/muse.c mon_escape() (no Amulet or
 * invocation items, no Wizard)
 */
function monEscape(ctx: Ctx, mon: Entity, vismon: boolean): MuseResult {
  if (vismon) say(ctx, 'muse.escapes_dungeon', { mon: monNam(ctx, mon) });
  mongone(ctx, mon.id);
  return 2;
}

/**
 * The verb for the monster getting onto a trap: jumps, or floats, flies, slithers, oozes or
 * crawls. ref: include/mondata.h locomotion(ptr, "jump"), vtense()
 */
function jumpVerb(ctx: Ctx, mon: Entity): Msg {
  const def = ctx.defs.monster(mon.def);
  const v = isFloater(ctx, mon)
    ? 'float'
    : isFlyer(def)
      ? 'fly'
      : slithy(def)
        ? 'slither'
        : amorphous(def)
          ? 'ooze'
          : def.speed === 0
            ? 'wiggle'
            : nolimbs(def)
              ? 'crawl'
              : 'jump';
  return { key: `muse.loco.${v}` };
}

/**
 * The monster moves onto the trap square it chose (not rloc_to(): "worm tails must move").
 * ref: src/muse.c use_defensive() remove_monster()/place_monster()/worm_move()
 */
function stepOnto(ctx: Ctx, mon: Entity, to: Pos): void {
  const p = mon.c.pos;
  if (!p || (p.x === to.x && p.y === to.y)) return;
  const from = { x: p.x, y: p.y };
  p.x = to.x;
  p.y = to.y;
  ctx.emit({ type: 'moved', id: mon.id, from, to: { x: to.x, y: to.y } });
  if (wormRec(ctx.state, mon.id)) wormMove(ctx, mon.id, from);
}

/**
 * The monster teleports: by an object `how` (the wand or scroll of teleportation: rloc() with
 * its message, the object known when `oseen`), or (`how` null) by the trap it chose to step on,
 * which goes off under it. Unless the level forbids it ("A mysterious force prevents the gnome
 * from teleporting!"; the object known when the monster is seen), and then it learns that
 * teleport traps do not work here. ref: src/muse.c m_tele() (no Amulet or Wizard's Tower)
 */
function mTele(ctx: Ctx, mon: Entity, vismon: boolean, oseen: boolean, how: DefId | null): void {
  const p = mon.c.pos;
  if (!p) return;
  if (teleRestrict(ctx, mon)) {
    if (vismon && how) discover(ctx, how);
    if (noteleportLevel(ctx, getLevel(ctx.state, p.level))) monLearnsTraps(ctx, mon.id, TRAP.tele);
  } else if (how) {
    // "teleporation has been triggered by an object"
    if (oseen) discover(ctx, how);
    rlocMon(ctx, mon, true);
  } else mintrap(ctx, mon.id, { force: true });
}

/**
 * Does what findDefensive() chose; call it right after. Returns 0 (nothing happened), 1 (it
 * died) or 2 (it acted: it can't attack). A monster that runs away flees for
 * `33 - 30 * hp / maxhp` turns unless it already flees (the `m_flee` macro).
 * ref: src/muse.c use_defensive() (the healing potions and the item-free escapes)
 */
export function useDefensive(ctx: Ctx, id: EntityId, c: MuseChoice<MuseDef>): MuseResult {
  const mon = ctx.state.entities[String(id)];
  const p = mon?.c.pos;
  if (!mon?.c.monster || !p) return 0;
  const otmp = c.obj === null ? null : (ctx.state.entities[String(c.obj)] ?? null);
  const pre = precheck(ctx, id, otmp);
  if (pre === 1) return 1;
  if (pre === -1) return 0; // "case 0: i.e. an exploded wand"
  const level = getLevel(ctx.state, p.level);
  const vis = cansee(ctx, p.level, p.x, p.y);
  const vismon = canseemon(ctx, mon);
  const oseen = otmp !== null && vismon;
  const hp = mon.c.hp ?? { cur: 1, max: 1 };
  // "when using defensive choice to run away, we want monster to avoid rushing right straight
  // back; don't override if already scared"
  const fleetim = !isFleeing(ctx, id) ? 33 - Math.trunc((30 * hp.cur) / Math.max(1, hp.max)) : 0;
  const mFlee = (): void => {
    if (fleetim) monflee(ctx, id, fleetim, false, false);
  };
  const name = (): string => monNam(ctx, mon);

  switch (c.kind) {
    case 'trapdoor': {
      // "trap doors on 'bottom' levels of dungeons are rock-drop trap doors"
      if (!canFallThru(ctx.state, level) || !c.trap) return 0;
      mFlee();
      const t = trapAt(level, c.trap.x, c.trap.y);
      if (!t) return 0;
      if (vis)
        say(ctx, 'muse.jumps_into', { mon: name(), verb: jumpVerb(ctx, mon), trap: `@${t.def}` });
      revealTrap(ctx, level, t, vis);
      stepOnto(ctx, mon, c.trap);
      migrateToLevel(
        ctx,
        mon,
        levelIdFor(ctx.state, { dungeon: level.dungeon, dlevel: level.dlevel + 1 }),
      );
      return 2;
    }
    case 'upstairs': {
      mFlee();
      if (stairsAt(ctx, level, p.x, p.y) !== 'up') return 0;
      // "impossible; level 1 upstairs are SSTAIRS"
      if (firstLevel(ctx, level)) return monEscape(ctx, mon, vismon);
      if (vismon) say(ctx, 'muse.escapes_upstairs', { mon: name() });
      migrateToLevel(
        ctx,
        mon,
        levelIdFor(ctx.state, { dungeon: level.dungeon, dlevel: level.dlevel - 1 }),
        'stairs_down',
      );
      return 2;
    }
    case 'downstairs': {
      mFlee();
      if (stairsAt(ctx, level, p.x, p.y) !== 'down') return 0;
      if (vismon) say(ctx, 'muse.escapes_downstairs', { mon: name() });
      migrateToLevel(
        ctx,
        mon,
        levelIdFor(ctx.state, { dungeon: level.dungeon, dlevel: level.dlevel + 1 }),
        'stairs_up',
      );
      return 2;
    }
    case 'sstairs': {
      mFlee();
      const b = level.branch;
      if (!b || b.pos.x !== p.x || b.pos.y !== p.y) return 0;
      if (firstLevel(ctx, level)) return monEscape(ctx, mon, vismon);
      if (vismon)
        say(ctx, b.dir === 'up' ? 'muse.escapes_upstairs' : 'muse.escapes_downstairs', {
          mon: name(),
        });
      migrateToLevel(ctx, mon, levelIdFor(ctx.state, b.to), 'sstairs');
      return 2;
    }
    case 'teleport_trap': {
      if (!c.trap) return 0;
      mFlee();
      const t = trapAt(level, c.trap.x, c.trap.y);
      if (!t) return 0;
      if (vis)
        say(ctx, 'muse.jumps_onto', { mon: name(), verb: jumpVerb(ctx, mon), trap: `@${t.def}` });
      revealTrap(ctx, level, t, vis);
      stepOnto(ctx, mon, c.trap);
      maybeUnhideAt(ctx, level.id, c.trap.x, c.trap.y);
      mTele(ctx, mon, vismon, false, null);
      return 2;
    }
    case 'pot_healing': {
      if (!otmp) return 0;
      mquaffmsg(ctx, mon, otmp);
      const i = ctx.rng.d(6 + 2 * bcsign(otmp), 4);
      healmon(mon, i, 1);
      if (otmp.c.item?.buc !== 'cursed' && !mcansee(ctx, id)) mcureblindness(ctx, mon, vismon);
      if (vismon) say(ctx, 'muse.looks_better', { mon: name() });
      if (oseen) discover(ctx, POT_HEALING);
      useOne(ctx, id, otmp);
      return 2;
    }
    case 'pot_extra_healing': {
      if (!otmp) return 0;
      mquaffmsg(ctx, mon, otmp);
      const i = ctx.rng.d(6 + 2 * bcsign(otmp), 8);
      healmon(mon, i, otmp.c.item?.buc === 'blessed' ? 5 : 2);
      if (!mcansee(ctx, id)) mcureblindness(ctx, mon, vismon);
      if (vismon) say(ctx, 'muse.looks_much_better', { mon: name() });
      if (oseen) discover(ctx, POT_EXTRA_HEALING);
      useOne(ctx, id, otmp);
      return 2;
    }
    case 'pot_full_healing': {
      if (!otmp) return 0;
      mquaffmsg(ctx, mon, otmp);
      healmon(mon, hp.max, otmp.c.item?.buc === 'blessed' ? 8 : 4);
      if (!mcansee(ctx, id)) mcureblindness(ctx, mon, vismon);
      if (vismon) say(ctx, 'muse.looks_completely_healed', { mon: name() });
      if (oseen) discover(ctx, otmp.def);
      useOne(ctx, id, otmp);
      return 2;
    }
    case 'unicorn_horn': {
      // "unlike most defensive cases, unicorn horn object is optional"
      if (vismon) {
        if (otmp) say(ctx, 'muse.uses_unicorn_horn', { mon: name() });
        else say(ctx, 'muse.horn_tip_glows', { mon: name() });
      }
      if (!mcansee(ctx, id)) mcureblindness(ctx, mon, vismon);
      else if (isMConfused(ctx, id) || isMStunned(ctx, id)) {
        setMConfused(ctx, id, false);
        setMStunned(ctx, id, false);
        if (vismon) say(ctx, 'muse.steadier', { mon: name() });
      }
      return 2;
    }
    case 'bugle': {
      if (!otmp) return 0;
      if (vismon) say(ctx, 'muse.plays', { mon: name(), item: doname(ctx.state, ctx.defs, otmp) });
      else say(ctx, 'muse.hear_bugle');
      awakenSoldiers(ctx, mon);
      return 2;
    }
    case 'wan_tele_self': {
      if (!otmp) return 0;
      if (
        (eshkOf(ctx, id) !== null && inhishop(ctx, id)) ||
        isGuard(ctx.state, id) ||
        epriOf(ctx, id)
      )
        return 2;
      mFlee();
      mzapwand(ctx, mon, otmp, true);
      mTele(ctx, mon, vismon, oseen, WAN_TELEPORTATION);
      return 2;
    }
    case 'scr_tele': {
      if (!otmp) return 0;
      const cursed = otmp.c.item?.buc === 'cursed';
      if (isShkGdPriest(ctx, id)) return 2;
      mFlee();
      // "we want to be able to access otmp after the teleport but it might get destroyed if
      // still in mtmp's inventory ... so take it out in advance"
      mreadmsg(ctx, mon, otmp);
      useOne(ctx, id, otmp);
      if (cursed || isMConfused(ctx, id)) {
        const nlev = randomTeleportLevel(ctx, level);
        if (nlev === level.depth) {
          if (vismon) say(ctx, 'muse.shudders', { mon: name() });
        } else migrateToLevel(ctx, mon, levelIdFor(ctx.state, levelAtDepth(ctx, level, nlev)));
      } else mTele(ctx, mon, vismon, oseen, SCR_TELEPORTATION);
      return 2;
    }
    case 'wan_digging': {
      if (!otmp) return 0;
      const { x, y } = p;
      mFlee();
      mzapwand(ctx, mon, otmp, false);
      if (oseen) discover(ctx, WAN_DIGGING);
      // furniture (stairs included) or stairs (no drawbridges)
      if (isFurnitureId(ctx.defs, terrainIdAt(level, x, y))) {
        say(ctx, 'muse.digging_ineffective');
        return 2;
      }
      const surface = surfaceKey(ctx, level, x, y);
      if (!canDigDown(ctx, level)) {
        // "can't dig further if there's already a pit (or other trap) here"
        if (trapAt(level, x, y)) {
          if (vismon) say(ctx, 'dig.too_hard_here', { surface });
          return 2;
        }
        const t = maketrap(ctx, level.id, x, y, TRAP.pit);
        if (vis) {
          seetrap(t);
          say(ctx, 'muse.made_pit', { mon: name(), surface });
        }
        fillPit(ctx, x, y, true);
        return mintrap(ctx, id, { force: true }) === 'killed' ? 1 : 2;
      }
      const t = maketrap(ctx, level.id, x, y, TRAP.hole);
      seetrap(t);
      if (vis) {
        say(ctx, 'muse.made_hole', { mon: name(), surface });
        say(ctx, isFlyer(ctx.defs.monster(mon.def)) ? 'muse.dives_through' : 'muse.falls_through', {
          mon: name(),
        });
      } else say(ctx, 'muse.hear_crash', { surface });
      fillPit(ctx, x, y, true);
      // "we made sure that there is a level for mtmp to go to"
      migrateToLevel(
        ctx,
        mon,
        levelIdFor(ctx.state, { dungeon: level.dungeon, dlevel: level.dlevel + 1 }),
      );
      return 2;
    }
    case 'wan_undead_turning': {
      if (!otmp) return 0;
      mzapwand(ctx, mon, otmp, false);
      const hp0 = getPlayer(ctx.state).c.pos;
      const aim = c.aim ?? (hp0 ? { x: hp0.x, y: hp0.y } : { x: p.x, y: p.y });
      mbhit(ctx, mon, ctx.rng.rn2(8) + 6, otmp, oseen, aim); // rn1(8, 6)
      return 2;
    }
    case 'wan_create_monster': {
      if (!otmp) return 0;
      // (no pools: always a random monster)
      const cc = mnextoPos(ctx, level, null, { x: p.x, y: p.y });
      if (!cc) return 0;
      mzapwand(ctx, mon, otmp, false);
      const nid = makemon(ctx, null, cc, { level: level.id });
      const nmon = nid === null ? undefined : ctx.state.entities[String(nid)];
      if (nmon && canSpotMon(ctx, nmon) && oseen) discover(ctx, WAN_CREATE_MONSTER);
      return 2;
    }
    case 'scr_create_monster': {
      if (!otmp) return 0;
      let cnt = 1;
      if (!ctx.rng.rn2(73)) cnt += ctx.rng.rnd(4);
      const conf = isMConfused(ctx, id);
      if (conf || otmp.c.item?.buc === 'cursed') cnt += 12;
      const pm = conf && ctx.defs.isMonster(ACID_BLOB) ? ctx.defs.monster(ACID_BLOB) : null;
      mreadmsg(ctx, mon, otmp);
      let known = false;
      while (cnt--) {
        const cc = mnextoPos(ctx, level, null, { x: p.x, y: p.y });
        if (!cc) break;
        const nid = makemon(ctx, pm, cc, { level: level.id });
        const nmon = nid === null ? undefined : ctx.state.entities[String(nid)];
        if (nmon && canSpotMon(ctx, nmon)) known = true;
      }
      // "The only case where we don't use oseen."
      if (known) discover(ctx, SCR_CREATE_MONSTER);
      useOne(ctx, id, otmp);
      return 2;
    }
    case 'lizard_corpse': {
      if (!otmp) return 0;
      // "not actually called for its unstoning effect"
      monConsumeUnstone(ctx, mon, otmp);
      return 2;
    }
    default:
      return 0; // MUSE_WAN_TELEPORTATION: never chosen (no Amulet)
  }
}

/**
 * A zapped wand: "The kobold zaps a wand of digging!" (stopping her occupation), "The kobold zaps
 * itself with a wand of teleportation (0:5)!", or unseen "You hear a nearby zap." / "You hear a
 * distant zap." (and she forgets what she knew of the wand); a charge is used.
 * ref: src/muse.c mzapwand()
 */
function mzapwand(ctx: Ctx, mon: Entity, otmp: Entity, self: boolean): void {
  const it = otmp.c.item;
  if (!it || it.spe < 1) return; // "Mon zapping wand with %d charges?"
  if (!canseemon(ctx, mon)) {
    say(ctx, heardNearby(ctx, mon) ? 'muse.hear_zap_near' : 'muse.hear_zap_far');
    it.known = { buc: false, spe: false }; // unknow_object()
  } else if (self) {
    say(ctx, 'muse.zaps_self', { mon: monNam(ctx, mon), item: doname(ctx.state, ctx.defs, otmp) });
  } else {
    say(ctx, 'muse.zaps', { mon: monNam(ctx, mon), item: xnameOf(ctx.state, ctx.defs, otmp) });
    stopOccupation(ctx);
  }
  it.spe -= 1;
}

/**
 * A read scroll: "The gnome lord reads a scroll of teleportation!" when seen; otherwise "You hear
 * someone reading a scroll labeled FOO." (a square she could see within 10 remembers an unseen
 * monster), and confused "Being confused, the gnome lord mispronounces the magic words..."
 * ref: src/muse.c mreadmsg() (never deaf; the unseen reader is "someone"/"something": no
 * meverseen; the "incant" rewording of an unknown label is not ported)
 */
function mreadmsg(ctx: Ctx, mon: Entity, otmp: Entity): void {
  const it = otmp.c.item;
  const one: Entity = it ? { ...otmp, c: { ...otmp.c, item: { ...it, quantity: 1 } } } : otmp;
  if (canseemon(ctx, mon)) {
    say(ctx, 'muse.reads', { mon: monNam(ctx, mon), item: doname(ctx.state, ctx.defs, one) });
  } else {
    const p = mon.c.pos;
    const hp = getPlayer(ctx.state).c.pos;
    if (
      p &&
      hp &&
      !canSpotMon(ctx, mon) &&
      couldseeAt(ctx, p.x, p.y) &&
      dist2(p.x, p.y, hp.x, hp.y) <= 10 * 10
    )
      mapInvisible(ctx, p.x, p.y);
    // x_monnam(ARTICLE_A, AUGMENT_IT): "a gnome lord" when sensed, else "someone"/"something"
    const who = someMonNam(ctx, mon);
    say(ctx, 'muse.hear_reading', {
      mon: who.startsWith('@pronoun.') ? who : { key: 'muse.a_mon', params: { mon: who } },
      item: xnameOf(ctx.state, ctx.defs, one),
    });
  }
  if (isMConfused(ctx, mon.id)) say(ctx, 'muse.mispronounces', { mon: monNam(ctx, mon) });
}

/**
 * The monster eats a lizard corpse to cure its confusion and stun: "The gnome eats a lizard
 * corpse." (unseen: "You hear chewing."), "The gnome seems steadier now." (not for bats and
 * stalkers); a pet's hunger is put off by the meal's nutrition, and the meal takes its next move.
 * ref: src/muse.c mon_consume_unstone() with `stoning` false (the stoning half, acid potions and
 * acidic corpses come with munstone())
 */
function monConsumeUnstone(ctx: Ctx, mon: Entity, obj: Entity): void {
  const vis = canseemon(ctx, mon);
  const lizard = obj.def === CORPSE && obj.c.item?.corpseOf === LIZARD;
  const nutrit = dogNutrition(ctx, mon, obj); // also sets meating
  if (vis) {
    const it = obj.c.item;
    const one: Entity = it ? { ...obj, c: { ...obj.c, item: { ...it, quantity: 1 } } } : obj;
    say(ctx, 'muse.eats', { mon: monNam(ctx, mon), item: doname(ctx.state, ctx.defs, one) });
  } else say(ctx, 'muse.hear_chewing');
  useOne(ctx, mon.id, obj);
  const id = mon.id;
  if (lizard && (isMConfused(ctx, id) || isMStunned(ctx, id))) {
    setMConfused(ctx, id, false);
    setMStunned(ctx, id, false);
    if (vis && !isBat(mon) && mon.def !== 'nh:stalker')
      say(ctx, 'muse.steadier', { mon: monNam(ctx, mon) });
  }
  const edog = edogOf(ctx, id);
  if ((mon.c.monster?.tame ?? 0) > 0 && edog && nutrit > 0) {
    // (no minions)
    if (edog.hungrytime < ctx.state.turn) edog.hungrytime = ctx.state.turn;
    edog.hungrytime += nutrit;
    setMConfused(ctx, id, false);
  }
  // "use up monster's next move"
  if (mon.c.actor) mon.c.actor.energy -= NORMAL_SPEED;
}

/**
 * A monster's wand of undead turning hits the hero (her carried corpses come alive, "You shudder
 * in dread.") or a monster (its carried corpses; an undead one resists or takes `rnd(8)`, and
 * is woken); the wand is known when seen to do something. ref: src/muse.c mbhitm()
 * (WAN_UNDEAD_TURNING only; the other wands come with find_offensive())
 */
function mbhitm(ctx: Ctx, target: Entity | 'hero', oseen: boolean, bx: number, by: number): void {
  let learnit = false;
  if (target === 'hero') {
    // unturn_you() (the hero is never undead here, as for her own zap)
    unturnDead(ctx, 'hero', false);
    say(ctx, 'zap.self.shudder');
    learnit = oseen;
  } else {
    const levelId = target.c.pos?.level ?? ctx.state.currentLevel;
    let wake = false;
    let revealInvis = false;
    if (unturnDead(ctx, target, false)) wake = true; // "affects mtmp's invent, not mtmp"
    if (ctx.defs.monster(target.def).flags.includes('undead')) {
      wake = revealInvis = true;
      // context.bypasses: a corpse it leaves is not revived by this same zap
      const before = new Set(itemsAt(ctx.defs, ctx.state, levelId, bx, by).map((o) => o.id));
      resist(ctx, target, ctx.rng.rnd(8), 'wand', true);
      for (const o of itemsAt(ctx.defs, ctx.state, levelId, bx, by))
        if (!before.has(o.id)) bypassObj(o.id);
    }
    const alive = ctx.state.entities[String(target.id)] !== undefined;
    if (wake) {
      if (alive) wakeGently(ctx, target);
      learnit = oseen;
    }
    if (revealInvis && alive && cansee(ctx, levelId, bx, by) && !canSpotMon(ctx, target))
      mapInvisible(ctx, bx, by);
  }
  if (learnit) discover(ctx, WAN_UNDEAD_TURNING);
}

/**
 * The monster's wand of undead turning travels from it toward `aim` for `range` squares: the
 * hero or a monster on the way is hit (3 squares less), then the objects there (1 less); it stops
 * at a wall, rock or a closed door. ref: src/muse.c mbhit(), fhito_loc() (the striking door and
 * drawbridge cases come with find_offensive())
 */
function mbhit(ctx: Ctx, mon: Entity, range: number, wand: Entity, oseen: boolean, aim: Pos): void {
  const p = mon.c.pos;
  if (!p) return;
  const level = getLevel(ctx.state, p.level);
  const ddx = sgn(aim.x - p.x);
  const ddy = sgn(aim.y - p.y);
  let bx = p.x;
  let by = p.y;
  while (range-- > 0) {
    bx += ddx;
    by += ddy;
    if (!inBounds(level, bx, by)) break;
    const hp = getPlayer(ctx.state).c.pos;
    if (hp && hp.level === level.id && hp.x === bx && hp.y === by) {
      mbhitm(ctx, 'hero', oseen, bx, by);
      range -= 3;
    } else {
      const mtmp = mAt(ctx.state, level.id, bx, by);
      if (mtmp) {
        if (cansee(ctx, level.id, bx, by) && !canSpotMon(ctx, mtmp)) mapInvisible(ctx, bx, by);
        mbhitm(ctx, mtmp, oseen, bx, by);
        range -= 3;
      }
    }
    // fhito_loc(): every object there
    let hit = 0;
    for (const o of itemsAt(ctx.defs, ctx.state, level.id, bx, by))
      if (ctx.state.entities[String(o.id)])
        hit += bhito(ctx, o, { kind: 'wand', item: wand }, bx, by, false);
    if (hit) range--;
    // !ZAP_POS(typ) or a closed door
    const tid = terrainIdAt(level, bx, by);
    const t = tid === undefined ? undefined : ctx.defs.terrain(tid);
    if (
      !t ||
      t.door === 'closed' ||
      t.door === 'locked' ||
      (!t.passable && t.door === undefined && tid !== T.iron_bars)
    )
      break;
  }
  clearBypasses();
}

/**
 * "The hill orc drinks a potion of healing!" when seen, else "You hear a chugging sound."
 * ref: src/muse.c mquaffmsg() (observe_object(): the port's objects are always dknown)
 */
function mquaffmsg(ctx: Ctx, mon: Entity, otmp: Entity): void {
  const it = otmp.c.item;
  if (canseemon(ctx, mon)) {
    const one: Entity = it ? { ...otmp, c: { ...otmp.c, item: { ...it, quantity: 1 } } } : otmp;
    say(ctx, 'muse.drinks', { mon: monNam(ctx, mon), item: doname(ctx.state, ctx.defs, one) });
  } else say(ctx, 'muse.chugging');
}
