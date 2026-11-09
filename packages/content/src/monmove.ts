// Monster movement and turn logic: mcalcmove, disturb, mfndpos, m_move and dochug.
import { apAsThing } from './mimicstate';
import {
  cellIndex,
  cellRules,
  getLevel,
  getPlayer,
  inBounds,
  inRooms,
  isVisible,
  NORMAL_SPEED,
  type CellRules,
  type Ctx,
  type EntityId,
  type Entity,
  type Json,
  type Level,
  type MonsterDef,
  type Pos,
  type Rng,
  trapAt,
} from '@nh/core';
import { openDoorAt } from './actions';
import { beeEatJelly } from './beejelly';
import { doorTrapped } from './btrapstate';
import { blowDoor, mbTrapped } from './btrapped';
import { clearPath } from './clearpath';

export { clearPath };
import { monsterAttack } from './combat';
import { uswallow } from './engulfstate';
import { releaseHero } from './engulf';
import { ustuck } from './hackmove';
import { castmu } from './mcastu';
import { mRespond } from './mrespond';
import { cuss } from './cuss';
import { noteleportLevel, teleRestrict } from './teleport';
import { mnextoPos } from './generation';
import {
  canCarry,
  mDoWear,
  monFlag,
  monWieldItem,
  monWouldTakeItem,
  mpickstuff,
  mpickstuffSkips,
  setMonFlag,
} from './mongear';
import { mattackRanged } from './mthrowu';
import {
  findDefensive,
  findMisc,
  findOffensive,
  useDefensive,
  useMisc,
  useOffensive,
} from './muse';
import { uState } from './luck';
import { P, conflictOn, heroHas, resistConflict } from './props';
import { fightm, mattackm } from './mhitm';
import { M_ATTK } from './adtyping';
import { couldseeAt, invisTo, setApparxy } from './apparxy';
import { isFleeing, monflee, regainCourage } from './monflee';
import { acurrstr } from './stats';
import { monNam } from './perception';
import {
  isCancelled,
  isFrozen,
  isMConfused,
  isMStunned,
  mcansee,
  mspecUsed,
  setMConfused,
  setMStunned,
  setStoredMux,
  storedMux,
} from './mstate';
import { meating, setMeating } from './dog';
import { mHarmlessTrap, mintrap, rlocMon, rlocTo, trapRemovedMon } from './trap';
import { isMtrapped, monKnowsTraps } from './trapstate';
import { isWatch, watchOnDuty } from './watch';
import { maybeSpinWeb } from './web';
import {
  canHideUnderObj,
  hidesUnder,
  hideunder,
  isHider,
  isUndetected,
  maybeUnhideAt,
  restrap,
} from './hide';
import { monEatsHere } from './meat';
import { findgold } from './steal';
import { gdMoveLate, isGuard } from './vaultstate';
import { TEMPLE, epriOf, histempleAt, inYourSanctuary, templeOccupied } from './epri';
import { eshkOf, inAnyShop, inhishop, uShops } from './eshk';
import { onscary, scareCells } from './scary';
import { afterShkMove } from './rooms';
import {
  carriedPicks,
  fastWithPickHere,
  followmsg,
  hello,
  plname,
  rileShk,
  setFollowmsg,
  shkname,
} from './shk';
import { holetime, shkFixesDamage } from './shkdamage';
import { T, isObstructedId } from './terrain';
import {
  digAbility,
  mDigweaponCheck,
  mayDig,
  mayPasswall,
  mdigTunnel,
  needsPick,
  tunnels,
} from './mdig';
import { blockersOf, boulderCells } from './boulder';
import { isSokoban } from './sokoban';
import { heroInvisible, monInvisible } from './invis';
import { isUnicorn } from './mondata';
import { isWormTail, wormRec } from './wormstate';
import { wormCross, wormMove, wormNomove } from './worm';

/** ref: include/hack.h BOLT_LIM */
export const BOLT_LIM = 8;
/** ref: include/mondata.h MTSZ (length of mtrack) */
export const MTSZ = 4;
/** ref: include/hacklib.h dist2() */
export const dist2 = (x0: number, y0: number, x1: number, y1: number): number =>
  (x0 - x1) * (x0 - x1) + (y0 - y1) * (y0 - y1);

/**
 * Movement points a monster gains this turn: its speed, adjusted when slowed or hasted, randomly
 * rounded to a multiple of NORMAL_SPEED (so a speed-6 monster gets 12 half of the time, 0
 * otherwise). ref: src/mon.c mcalcmove() with m_moving TRUE; no steed.
 */
export function mcalcmove(rng: Rng, speed: number, mspeed: 'slow' | 'fast' | null = null): number {
  let mmove = speed;
  // MSLOW: lose 1/3 of the speed below 12 but 2/3 above; MFAST: gain 1/3
  if (mspeed === 'slow') {
    if (mmove < NORMAL_SPEED) mmove = Math.trunc((2 * mmove + 1) / 3);
    else mmove = 4 + Math.trunc(mmove / 3);
  } else if (mspeed === 'fast') mmove = Math.trunc((4 * mmove + 2) / 3);
  const mmoveAdj = mmove % NORMAL_SPEED;
  mmove -= mmoveAdj;
  if (rng.rn2(NORMAL_SPEED) < mmoveAdj) mmove += NORMAL_SPEED;
  return mmove;
}

/** ref: include/mondata.h verysmall(): msize < MZ_SMALL */
const verySmall = (def: MonsterDef): boolean => def.size === 'tiny';
/** ref: include/mondata.h bigmonst(): msize >= MZ_LARGE */
const bigMonst = (def: MonsterDef): boolean =>
  def.size === 'large' || def.size === 'huge' || def.size === 'gigantic';
/**
 * A leprechaun carrying more gold than the hero wants to avoid her.
 * ref: src/monmove.c leppie_avoidance()
 */
function leppieAvoidance(ctx: Ctx, id: EntityId, def: MonsterDef): boolean {
  if (def.id !== 'nh:leprechaun') return false;
  const lepgold = findgold(ctx, id);
  const ygold = findgold(ctx, ctx.state.playerId);
  return lepgold !== null && (lepgold.c.item?.quantity ?? 0) > (ygold?.c.item?.quantity ?? 0);
}

/** ref: include/mondata.h is_wanderer() */
const isWanderer = (def: MonsterDef): boolean => def.flags.includes('wander');
/** ref: include/mondata.h S_BAT class (every 'B' in our roster). */
const isBatClass = (def: MonsterDef): boolean => def.glyph.ch === 'B';

/** ref: include/hack.h NODIAG(): grid bugs cannot move or attack diagonally */
const noDiag = (def: MonsterDef): boolean => def.id === 'nh:grid_bug';

/** ref: src/mon.c monnear(): close enough to move or attack into (not diagonally for a grid bug) */
const monnear = (def: MonsterDef, mx: number, my: number, x: number, y: number): boolean => {
  const distance = dist2(mx, my, x, y);
  if (distance === 2 && noDiag(def)) return false;
  return distance < 3;
};

const monCount = (ctx: Ctx, id: EntityId) => {
  const e = ctx.state.entities[String(id)];
  const m = e?.c.monster;
  const pos = e?.c.pos;
  if (!e || !m || !pos) throw new Error(`Entity ${id} is not a placed monster`);
  return { e, m, pos, def: ctx.defs.monster(e.def) };
};

/**
 * Possibly awaken a sleeping monster; true if it woke up.
 * ref: src/monmove.c disturb(). The hero's line of sight is `couldsee()` (ignores light).
 * The Stealth test uses the hero's Stealth property (an ettin is surprised past it 9 times in 10);
 * nymphs, jabberwocks and leprechauns wake only 1 time in 50; a mimic posing as an object or
 * furniture is not woken by the 1 in 7.
 */
export function disturb(ctx: Ctx, id: EntityId): boolean {
  const { m, pos, def } = monCount(ctx, id);
  const hero = getPlayer(ctx.state);
  const hp = hero.c.pos;
  if (!hp) return false;
  const level = getLevel(ctx.state, pos.level);
  const stealth = heroHas(ctx.state, P.STEALTH);
  const ch = def.glyph.ch;
  if (
    dist2(pos.x, pos.y, hp.x, hp.y) <= 100 &&
    clearPath(
      level,
      cellRules(level, ctx.defs).opaque,
      hp.x,
      hp.y,
      pos.x,
      pos.y,
      blockersOf(ctx, level.id),
    ) &&
    (!stealth || (def.id === 'nh:ettin' && ctx.rng.rn2(10) !== 0)) &&
    (!(ch === 'n' || def.id === 'nh:jabberwock' || ch === 'l') || ctx.rng.rn2(50) === 0) &&
    (heroHas(ctx.state, P.AGGRAVATE_MONSTER) ||
      def.glyph.ch === 'd' ||
      def.glyph.ch === '@' ||
      (ctx.rng.rn2(7) === 0 && !apAsThing(ctx, id)))
  ) {
    // ref: src/mon.c wake_msg()
    const idx = cellIndex(level, pos.x, pos.y);
    if (m.asleep && isVisible(ctx.state, idx)) {
      const e = ctx.state.entities[String(id)];
      ctx.emit({
        type: 'msg',
        key: m.peaceful ? 'mon.wakes_up_calm' : 'mon.wakes_up',
        params: { mon: e ? monNam(ctx, e) : '@pronoun.it' },
      });
    }
    m.asleep = false;
    return true;
  }
  return false;
}

export interface Candidate {
  x: number;
  y: number;
  /** The square holds the hero, or is where the monster thinks she is (ALLOW_U). */
  hero: boolean;
  /** The monster on the square (only with `allowM`: ALLOW_M). */
  mon?: EntityId;
  /** A trap that can hurt the monster is there (ALLOW_TRAPS). */
  trap?: true;
  /**
   * The square is lined up with where the monster (seeing her) thinks the hero is (NOTONL in
   * mfndpos()'s info): a unicorn not on a no-teleport level never gets such a square.
   */
  lined?: true;
}

/**
 * mon_allowflags()'s ALLOW_U: hostile monsters, and under Conflict any monster that does not
 * resist it (rolled every time, as C does). ref: src/mon.c mon_allowflags()
 */
export function monAllowU(ctx: Ctx, mon: Entity): boolean {
  let allowU = !(mon.c.monster?.peaceful ?? false) && !((mon.c.monster?.tame ?? 0) > 0);
  if (conflictOn(ctx.state) && !resistConflict(ctx, mon)) allowU = true;
  return allowU;
}

/**
 * Squares the monster could move to this turn, in mfndpos() order (x outer, y inner).
 * ref: src/mon.c mfndpos() with mon_allowflags(): hostile monsters may "move" onto the hero
 * (ALLOW_U), monsters that can open doors may enter closed doors (OPENDOOR). Walls, other
 * monsters, intact-door diagonals, any diagonal for a grid bug (NODIAG) and tight squeezes (between
 * rock, walls or Sokoban boulders) for big
 * monsters are rejected. A monster avoids a harmful trap of a kind it knows unless `allowTraps`
 * (pets, which decide in dog_move()); a harmful trap is marked `trap`. A hostile monster outside
 * a temple may not step into it while it is the hero's sanctuary (no ALLOW_SANCT: peaceful and
 * tame monsters and priests have it). Boulder squares are never candidates (no ALLOW_ROCK).
 * With `allowDig` (ALLOW_DIG, a tunneller: canTunnel()) rock, walls and trees it can dig into
 * now are candidates, and so are closed and locked doors (thrudoor); intelligent peaceful ones
 * keep out of shop and temple walls from outside. A monster without ALLOW_SSM never steps onto a
 * square that scares it (onscary(): a scroll of scare monster), the hero's own included. A
 * monster that passes walls (passes_walls(): ALLOW_WALL, ALLOW_ROCK) goes into stone and walls
 * that are not non-passwall (may_passwall(): Sokoban's), through closed and locked doors, onto
 * boulders and through any tight squeeze. A unicorn (NOTONL, unless confused or on a no-teleport
 * level) never steps onto a square lined up with where it thinks the hero is while it can see her;
 * such squares are marked `lined` for every monster. No diagonal step passes between two
 * consecutive segments of a long worm (worm_cross()). Not ported: water/lava, Elbereth, iron bars.
 */
export function mfndpos(
  ctx: Ctx,
  level: Level,
  rules: CellRules,
  id: EntityId,
  heroPos: Pos,
  opts: {
    allowM?: boolean;
    allowTraps?: boolean;
    allowU?: boolean;
    allowDig?: boolean;
    /**
     * Where the monster thinks the hero is (C's mux/muy, setApparxy()): that square is an
     * ALLOW_U one too, with whatever monster stands there; when her own square is next to it,
     * the guess is set to her ("it found you").
     */
    guess?: Pos;
  } = {},
): Candidate[] {
  const { e, m, pos, def } = monCount(ctx, id);
  const canOpen = !(def.flags.includes('nohands') || verySmall(def));
  // ref: mfndpos() ALLOW_DIG: "need to be specific about what can currently be dug"
  const dig = opts.allowDig === true ? digAbility(ctx, e) : null;
  // ref: mon_allowflags(): `if (passes_walls(mtmp->data)) allowflags |= (ALLOW_ROCK | ALLOW_WALL)`
  const wallwalk = def.flags.includes('wallwalk');
  const thrudoor = wallwalk || (!!dig && (dig.rock || dig.tree));
  const shopOrTemple = (x: number, y: number): boolean =>
    inAnyShop(level, x, y) || inRooms(level, x, y).some((r) => level.rooms[r]?.type === TEMPLE);
  const avoidSpecialWalls =
    !!dig?.rock &&
    !def.flags.includes('mindless') &&
    (m.peaceful || (m.tame ?? 0) > 0) &&
    !shopOrTemple(pos.x, pos.y);
  const taken = new Map<number, EntityId>();
  for (const [key, ent] of Object.entries(ctx.state.entities)) {
    const p = ent.c.pos;
    // objects do not block (only creatures: monsters and the hero)
    if (p && p.level === level.id && Number(key) !== id && ent.c.item === undefined)
      taken.set(cellIndex(level, p.x, p.y), Number(key));
  }
  // ref: mfndpos() `checkobj && sobj_at(BOULDER, nx, ny)` without ALLOW_ROCK: no monster here
  // throws rocks or passes walls, so none steps onto a boulder
  const boulders = boulderCells(ctx, level);
  const soko = isSokoban(level);
  // ref: src/hack.c bad_rock(): rock and walls, and boulders in Sokoban
  const rock = (x: number, y: number): boolean => {
    if (!inBounds(level, x, y)) return true;
    if (soko && boulders.has(cellIndex(level, x, y))) return true;
    const i = level.cells[cellIndex(level, x, y)] ?? 0;
    return !rules.passable[i] && !rules.closedDoor[i];
  };
  const here = level.cells[cellIndex(level, pos.x, pos.y)] ?? 0;
  // ref: mfndpos(): `if (mon->mconf) { flag |= ALLOW_ALL; flag &= ~NOTONL; }`: a confused
  // monster walks into known traps and sanctuaries (ALLOW_TRAPS, ALLOW_SANCT); ALLOW_U for a
  // peaceful one and ALLOW_M are not ported (see DEVIATIONS.md)
  const conf = isMConfused(ctx, id);
  const allowTraps = opts.allowTraps === true || conf;
  // ref: mon_allowflags(): "unicorn may not be able to avoid hero on a noteleport level"
  // (NOTONL); mfndpos() `monseeu = mon->mcansee && (!Invis || perceives(mdat))`
  const notonl = !conf && isUnicorn(def) && !noteleportLevel(ctx, level);
  const monseeu = mcansee(ctx, id) && !invisTo(ctx, e);
  const onHerLevel = getPlayer(ctx.state).c.pos?.level === level.id;
  // ref: mfndpos() ALLOW_SANCT: `level.flags.has_temple && *in_rooms(nx, ny, TEMPLE) &&
  // !*in_rooms(x, y, TEMPLE) && in_your_sanctuary(0, nx, ny)` (it only prevents movement)
  const sanctCheck =
    !conf &&
    !m.peaceful &&
    level.id === ctx.state.currentLevel &&
    epriOf(ctx, id) === null &&
    level.rooms.some((r) => r.type === TEMPLE) &&
    templeOccupied(level, inRooms(level, pos.x, pos.y)) === null;
  // ref: mon_allowflags() ALLOW_SSM: pets, peacefuls, shopkeepers, priests, humans and minotaurs
  // (and a confused monster's ALLOW_ALL) may step onto a scroll of scare monster
  const scare = scareCells(ctx, level);
  const allowSSM =
    conf ||
    (m.tame ?? 0) > 0 ||
    m.peaceful ||
    eshkOf(ctx, id) !== null ||
    epriOf(ctx, id) !== null ||
    def.flags.includes('human') ||
    def.id === 'nh:minotaur';
  const out: Candidate[] = [];
  for (let nx = pos.x - 1; nx <= pos.x + 1; nx++) {
    for (let ny = pos.y - 1; ny <= pos.y + 1; ny++) {
      if ((nx === pos.x && ny === pos.y) || !inBounds(level, nx, ny)) continue;
      const to = level.cells[cellIndex(level, nx, ny)] ?? 0;
      const closed = rules.closedDoor[to] === true;
      if (!rules.passable[to] && !closed) {
        // ref: mfndpos(): `IS_OBSTRUCTED(ntyp) && !((IS_TREE(ntyp) ? treeok : rockok) &&
        // may_dig(nx, ny))`, then "intelligent peacefuls avoid digging shop/temple walls"
        const tid = level.palette[to];
        if (!isObstructedId(tid)) continue;
        if (!(wallwalk && mayPasswall(ctx, level, nx, ny))) {
          if (!dig) continue;
          if (!(tid === T.tree ? dig.tree : dig.rock) || !mayDig(ctx, level, nx, ny)) continue;
        }
        if (avoidSpecialWalls && shopOrTemple(nx, ny)) continue;
      }
      if (closed && !canOpen && !thrudoor) continue;
      // ref: mfndpos() UNLOCKDOOR/BUSTDOOR: none of our monsters carry keys or bust doors; a
      // digger goes through (thrudoor)
      if (rules.lockedDoor[to] && !thrudoor) continue;
      if (!wallwalk && boulders.has(cellIndex(level, nx, ny))) continue; // ALLOW_ROCK
      const diagonal = nx !== pos.x && ny !== pos.y;
      // ref: mfndpos() "first diagonal checks": no diagonal moves for a grid bug, and none into
      // or out of an intact door
      if (diagonal && (noDiag(def) || rules.intactDoor[here] || rules.intactDoor[to])) continue;
      // ref: mfndpos(): "mustn't pass between adjacent long worm segments"
      if (diagonal && wormCross(ctx, level.id, pos.x, pos.y, nx, ny)) continue;
      const realHero = nx === heroPos.x && ny === heroPos.y;
      const g = opts.guess;
      // ref: mfndpos(): "If it's right next to you, it found you, displaced or no."
      if (realHero && g) {
        g.x = heroPos.x;
        g.y = heroPos.y;
        if (storedMux(ctx, id)) setStoredMux(ctx, id, g); // kept while it can't see her
      }
      // ref: mfndpos(): `if (onscary(dispx, dispy, mon)) { if (!(flag & ALLOW_SSM)) continue; }`
      if (!allowSSM && scare.size > 0 && onscary(ctx, nx, ny, e, { level, cells: scare })) continue;
      const isHero = realHero || (g !== undefined && nx === g.x && ny === g.y);
      const occupant = realHero ? undefined : taken.get(cellIndex(level, nx, ny));
      if (isHero) {
        if (!(opts.allowU ?? !m.peaceful)) continue; // no ALLOW_U
      } else if (occupant !== undefined && !opts.allowM) {
        continue; // no ALLOW_M / ALLOW_MDISP
      } else if (occupant !== undefined && isWormTail(ctx.state.entities[String(occupant)])) {
        continue; // a worm is fought at its head only (DEVIATIONS.md "Long worms")
      }
      if (
        sanctCheck &&
        !isHero &&
        templeOccupied(level, inRooms(level, nx, ny)) !== null &&
        inYourSanctuary(ctx, null, nx, ny)
      )
        continue;
      // ref: mfndpos(): `if (monseeu && monlineu(mon, nx, ny))`: lined up with mux/muy
      let lined = false;
      if (monseeu && onHerLevel) {
        const ux = g?.x ?? heroPos.x;
        const uy = g?.y ?? heroPos.y;
        if (online2(nx, ny, ux, uy)) {
          if (notonl) continue;
          lined = true;
        }
      }
      // ref: mfndpos() tight squeeze: bad_rock on both sides and cant_squeeze_thru() (too big;
      // never for a monster that passes walls)
      if (diagonal && !wallwalk && rock(pos.x, ny) && rock(nx, pos.y) && bigMonst(def)) continue;
      // ref: mfndpos(): "The monster avoids a particular type of trap if it's familiar with the
      // trap type"; harmless traps are neither avoided nor marked
      const ttmp = trapAt(level, nx, ny);
      let harmful = false;
      if (ttmp && !mHarmlessTrap(ctx, e, ttmp)) {
        if (!allowTraps && monKnowsTraps(ctx, id, ttmp.def)) continue;
        harmful = true;
      }
      out.push({
        x: nx,
        y: ny,
        hero: isHero,
        ...(occupant !== undefined ? { mon: occupant } : {}),
        ...(harmful ? { trap: true as const } : {}),
        ...(lined ? { lined: true as const } : {}),
      });
    }
  }
  return out;
}

/** The monster's recent positions, newest first, flat [x0,y0,x1,y1,...]. ref: mtmp->mtrack */
export function getTrack(ctx: Ctx, id: EntityId): number[] {
  const nh = ctx.state.modData['nh'];
  if (nh === null || typeof nh !== 'object' || Array.isArray(nh)) return [];
  const all = nh['mtrack'];
  if (all === null || typeof all !== 'object' || Array.isArray(all)) return [];
  const t = all[String(id)];
  return Array.isArray(t) ? (t.filter((v) => typeof v === 'number') as number[]) : [];
}

/** ref: src/monmove.c mon_track_add() */
export function trackAdd(ctx: Ctx, id: EntityId, x: number, y: number): void {
  const t = [x, y, ...getTrack(ctx, id)].slice(0, MTSZ * 2);
  const md = ctx.state.modData;
  const nh = md['nh'];
  const root: { [k: string]: Json } =
    nh !== null && typeof nh === 'object' && !Array.isArray(nh) ? nh : {};
  const prev = root['mtrack'];
  const all: { [k: string]: Json } =
    prev !== null && typeof prev === 'object' && !Array.isArray(prev) ? prev : {};
  all[String(id)] = t;
  root['mtrack'] = all;
  md['nh'] = root;
}

/**
 * MMOVE_MOVED, MMOVE_NOTHING (may still attack), MMOVE_DONE (picked something up) and
 * MMOVE_DIED (died or left the level in a trap)
 */
/** m_move()'s result: MMOVE_MOVED, MMOVE_NOTHING, MMOVE_DONE, MMOVE_DIED, MMOVE_NOMOVES. */
type MoveStatus = 'moved' | 'nothing' | 'done' | 'died' | 'nomoves';

/** ref: include/hacklib.h distmin() */
const distmin = (x0: number, y0: number, x1: number, y1: number): number =>
  Math.max(Math.abs(x0 - x1), Math.abs(y0 - y1));

/** ref: src/monmove.c SQSRCHRADIUS: max distmin() for a monster to look for items */
const SQSRCHRADIUS = 5;

/**
 * Whether the monster is lined up with the hero within bolt range and sees her.
 * ref: src/mthrowu.c lined_up() / linedup(): same row, column or diagonal, distmin < BOLT_LIM
 */
function linedUp(
  level: Level,
  opaque: readonly boolean[],
  blocked: ReadonlySet<number>,
  mon: Pos,
  hero: Pos,
): boolean {
  const tbx = hero.x - mon.x;
  const tby = hero.y - mon.y;
  if (tbx === 0 && tby === 0) return false;
  if (
    (tbx === 0 || tby === 0 || Math.abs(tbx) === Math.abs(tby)) &&
    distmin(tbx, tby, 0, 0) < BOLT_LIM
  )
    return clearPath(level, opaque, hero.x, hero.y, mon.x, mon.y, blocked);
  return false;
}

/**
 * The monster looks for an item it wants within a few squares and makes it its goal.
 * ref: src/monmove.c m_search_items(): closest first (a later one at equal distance wins),
 * only items in view that it would take and can carry; rocks are never worth a trip; in a shop
 * it usually does not look (a shopkeeper never). Not ported: traps, scary squares, water, the immobile-monster-on-top check, mercenaries.
 * Returns whether it is already standing on one (MMOVE_DONE).
 */
function mSearchItems(
  ctx: Ctx,
  id: EntityId,
  level: Level,
  opaque: readonly boolean[],
  blocked: ReadonlySet<number>,
  goal: Pos,
  heroPos: Pos,
): boolean {
  const { m, pos } = monCount(ctx, id);
  let minr = SQSRCHRADIUS;
  if (distmin(heroPos.x, heroPos.y, pos.x, pos.y) < SQSRCHRADIUS && !m.peaceful) minr--;
  // in shop, usually skip
  if (inAnyShop(level, pos.x, pos.y) && (ctx.rng.rn2(25) !== 0 || eshkOf(ctx, id) !== null))
    return false;
  // the objects of the level by cell, top of each pile first
  const piles = new Map<number, Entity[]>();
  for (const e of Object.values(ctx.state.entities)) {
    const p = e.c.pos;
    if (!p || p.level !== level.id || !e.c.item) continue;
    const k = cellIndex(level, p.x, p.y);
    const list = piles.get(k);
    if (list) list.push(e);
    else piles.set(k, [e]);
  }
  for (const list of piles.values())
    list.sort((a, b) => (b.c.item?.placed ?? 0) - (a.c.item?.placed ?? 0) || a.id - b.id);
  const hmx = Math.min(level.width - 1, pos.x + minr);
  const hmy = Math.min(level.height - 1, pos.y + minr);
  const lmx = Math.max(1, pos.x - minr);
  const lmy = Math.max(0, pos.y - minr);
  for (let xx = lmx; xx <= hmx; xx++) {
    for (let yy = lmy; yy <= hmy; yy++) {
      const pile = piles.get(cellIndex(level, xx, yy));
      if (!pile) continue;
      if (minr < distmin(pos.x, pos.y, xx, yy)) continue; // found an object closer already
      if (!clearPath(level, opaque, pos.x, pos.y, xx, yy, blocked)) continue; // m_cansee()
      for (const o of pile) {
        // rocks are never worth a trip; the corpses (and untouchables) 5.0's mpickstuff()
        // refuses after the monster has walked to one would leave it stuck on the square (C's
        // search checks only can_touch_safely())
        if (o.def === 'nh:rock') continue;
        if (
          monWouldTakeItem(ctx, id, o) &&
          canCarry(ctx, id, o) > 0 &&
          !mpickstuffSkips(ctx, id, o)
        ) {
          minr = distmin(pos.x, pos.y, xx, yy);
          goal.x = xx;
          goal.y = yy;
          if (xx === pos.x && yy === pos.y) return true;
          break; // skip the rest of the pile
        }
      }
    }
  }
  return false;
}

/** ref: include/rm.h IS_ROOM(typ): floor, stairs, altars and fountains; not doors or corridors */
function isRoomCell(ctx: Ctx, level: Level, x: number, y: number): boolean {
  const id = level.palette[level.cells[cellIndex(level, x, y)] ?? -1];
  if (id === undefined) return false;
  const t = ctx.defs.terrain(id);
  return t.passable && t.door === undefined && t.id !== T.corr;
}

/** ref: src/hacklib.c online2(): on a row, column or diagonal through (x1, y1) */
const online2 = (x0: number, y0: number, x1: number, y1: number): boolean => {
  const dx = x0 - x1;
  const dy = y0 - y1;
  return !dy || !dx || dy === dx || dy === -dx;
};

/** Options of {@link moveSpecial}: approach `goal` (or wander), avoiding lines through the hero. */
export interface MoveSpecialOpts {
  appr: -1 | 0 | 1;
  avoid: boolean;
  goal: Pos;
  /** A shopkeeper's move: whether he is in his shop, following the hero, she is on his door. */
  shk?: { inHisShop: boolean; following: boolean; uondoor: boolean };
}

/**
 * A step for a priest or a shopkeeper toward `goal`, on room squares only (never doors or
 * corridors, which keeps him in his room; a shopkeeper out of his shop or following the hero
 * goes anywhere): with `avoid`, not onto a square lined up with the hero; a priest who stands
 * lined up himself and cannot find one gives up avoiding, and so does a shopkeeper with the hero
 * on his door when every square is lined up. The hero's own square is never stepped onto (0).
 * Returns 1 moved, 0 did not, -2 died.
 * A confused one neither avoids nor approaches. ref: src/priest.c move_special() (no boulders
 * or ALLOW_M)
 */
export function moveSpecial(ctx: Ctx, id: EntityId, heroPos: Pos, o: MoveSpecialOpts): -2 | 0 | 1 {
  const { pos } = monCount(ctx, id);
  const omx = pos.x;
  const omy = pos.y;
  const ggx = o.goal.x;
  const ggy = o.goal.y;
  if (omx === ggx && omy === ggy) return 0;
  let avoid = o.avoid;
  let appr = o.appr;
  if (isMConfused(ctx, id)) {
    avoid = false;
    appr = 0;
  }
  const level = getLevel(ctx.state, pos.level);
  const cands = mfndpos(ctx, level, cellRules(level, ctx.defs), id, heroPos);
  const gdist = (x: number, y: number): number => dist2(x, y, ggx, ggy);
  let nix = omx;
  let niy = omy;
  let onHero = false;
  const shk = o.shk;
  // perhaps we cannot avoid him
  if (shk && avoid && shk.uondoor && cands.every((c) => online2(c.x, c.y, heroPos.x, heroPos.y)))
    avoid = false;
  const anywhere = shk !== undefined && (!shk.inHisShop || shk.following);
  const pickMove = (): void => {
    let chcnt = 0;
    for (const c of cands) {
      if (!anywhere && !isRoomCell(ctx, level, c.x, c.y)) continue;
      // NOTONL: mfndpos() marks squares lined up with where the monster thinks the hero is
      if (avoid && online2(c.x, c.y, heroPos.x, heroPos.y)) continue;
      if ((!appr && !ctx.rng.rn2(++chcnt)) || (appr && gdist(c.x, c.y) < gdist(nix, niy))) {
        nix = c.x;
        niy = c.y;
        onHero = c.hero;
      }
    }
  };
  pickMove();
  if (!shk && avoid && nix === omx && niy === omy && online2(omx, omy, heroPos.x, heroPos.y)) {
    // might as well move closer as long it's going to stay lined up
    avoid = false;
    pickMove();
  }
  if (nix === omx && niy === omy) return 0;
  if (onHero) return 0;
  pos.x = nix;
  pos.y = niy;
  ctx.emit({ type: 'moved', id, from: { x: omx, y: omy }, to: { x: nix, y: niy } });
  return 1;
}

/**
 * A temple priest's move: -1 outside his temple (the normal AI moves him). Peaceful, he mills
 * around his altar keeping out of the hero's lines; angry, he attacks her when next to her and
 * chases her while she is in his temple and he sees her. Returns as {@link moveSpecial}.
 * Under Conflict a peaceful priest that does not resist acts as an angry one. A peaceful one does
 * not keep out of the lines of an invisible hero; an angry one chases her only while he can see
 * her. `ap` is where he thinks she is (mattacku()'s target).
 * ref: src/priest.c pri_move() (no displacement)
 */
export function priMove(ctx: Ctx, id: EntityId, heroPos: Pos, ap: Pos = heroPos): -2 | -1 | 0 | 1 {
  const { e, m, pos, def } = monCount(ctx, id);
  const epri = epriOf(ctx, id);
  if (!epri || !histempleAt(ctx, epri, pos.x, pos.y)) return -1;
  const temple = epri.shroom;
  // mill around the altar
  let ggx = epri.shrpos.x + ctx.rng.rn2(3) - 1;
  let ggy = epri.shrpos.y + ctx.rng.rn2(3) - 1;
  let avoid = true;
  if (!m.peaceful || (conflictOn(ctx.state) && !resistConflict(ctx, e))) {
    if (monnear(def, pos.x, pos.y, heroPos.x, heroPos.y)) {
      mattacku(ctx, id, ap, null);
      return ctx.state.entities[String(id)]?.c.monster ? 0 : -2;
    }
    const level = getLevel(ctx.state, pos.level);
    if (inRooms(level, heroPos.x, heroPos.y).includes(temple)) {
      // chase the hero if inside the temple and he can see her (mcansee && m_canseeu())
      const opaque = cellRules(level, ctx.defs).opaque;
      if (
        mcansee(ctx, id) &&
        !invisTo(ctx, e) &&
        clearPath(level, opaque, pos.x, pos.y, heroPos.x, heroPos.y, blockersOf(ctx, level.id))
      ) {
        ggx = heroPos.x;
        ggy = heroPos.y;
      }
      avoid = false;
    }
  } else if (heroInvisible(ctx.state)) avoid = false;
  return moveSpecial(ctx, id, heroPos, { appr: 1, avoid, goal: { x: ggx, y: ggy } });
}

/**
 * A shopkeeper's move. Next to the hero, an angry one attacks her, and one following her asks
 * "Didn't you forget to pay?" (every few turns; 1 in 9 he gets angry). Following her (or angry
 * and seeing her) he goes for her, leaving it to the normal AI (-1) when she is far and owes
 * nothing; -1 too off his shop level when not following her. Peaceful, he keeps to his spot by
 * the door: within two squares of it he rests unless lined up with the hero (on the spot itself
 * he wanders a little instead), and he steps out of her lines when she is in the shop and more
 * than two squares from the spot. Returns as {@link moveSpecial}.
 * Under Conflict a peaceful one next to her that does not resist attacks her too.
 * In his shop he first repairs damage whose time has come (shk_fixes_damage()); while she digs a
 * hole in his shop he comes to her as it nears completion (holetime()).
 * An invisible hero gets none of the peaceful keeper's manners: he heads for his spot by the door
 * and stays there, in her way; angry, he goes for her only while he can see her. `ap` is where
 * he thinks she is (mattacku()'s target).
 * ref: src/shk.c shk_move() (no displacement or steeds)
 */
export function shkMove(ctx: Ctx, id: EntityId, heroPos: Pos, ap: Pos = heroPos): -2 | -1 | 0 | 1 {
  const eshk = eshkOf(ctx, id);
  if (!eshk) return -1;
  if (eshk.shoplevel !== monCount(ctx, id).pos.level && !eshk.following) return -1;
  if (inhishop(ctx, id)) shkFixesDamage(ctx, id);
  const { e, m, pos } = monCount(ctx, id);
  const omx = pos.x;
  const omy = pos.y;
  const udist = dist2(omx, omy, heroPos.x, heroPos.y);
  if (udist < 3) {
    // ANGRY(shkp) || (Conflict && !resist_conflict(shkp))
    if (!m.peaceful || (conflictOn(ctx.state) && !resistConflict(ctx, e))) {
      mattacku(ctx, id, ap, null);
      return ctx.state.entities[String(id)]?.c.monster ? 0 : -2;
    }
    if (eshk.following) {
      // (the customer is always this hero: no "I was looking for")
      if (ctx.state.turn > followmsg(ctx) + 4) {
        ctx.emit({
          type: 'msg',
          key: 'shk.forget_to_pay',
          params: { hello: hello(ctx), name: plname(ctx) },
        });
        setFollowmsg(ctx, ctx.state.turn);
        if (!ctx.rng.rn2(9)) {
          ctx.emit({ type: 'msg', key: 'shk.doesnt_like', params: { shk: shkname(ctx, eshk) } });
          rileShk(ctx, id);
        }
      }
      if (udist < 2) return 0;
    }
  }
  let appr: -1 | 0 | 1 = 1;
  let gtx = eshk.shk.x;
  let gty = eshk.shk.y;
  const satdoor = gtx === omx && gty === omy;
  let avoid = false;
  let uondoor = false;
  const z = holetime(ctx);
  if (eshk.following || (z >= 0 && z * z <= udist)) {
    if (udist > 4 && eshk.following && eshk.bill.length === 0) return -1; // leave it to m_move
    gtx = heroPos.x;
    gty = heroPos.y;
  } else if (!m.peaceful) {
    // move towards the hero if the shopkeeper can see him (mcansee && m_canseeu())
    const level = getLevel(ctx.state, pos.level);
    const opaque = cellRules(level, ctx.defs).opaque;
    if (
      mcansee(ctx, id) &&
      !invisTo(ctx, e) &&
      clearPath(level, opaque, omx, omy, heroPos.x, heroPos.y, blockersOf(ctx, level.id))
    ) {
      gtx = heroPos.x;
      gty = heroPos.y;
    }
  } else if (heroInvisible(ctx.state)) {
    avoid = false; // (`Invis || u.usteed`)
  } else {
    uondoor = heroPos.x === eshk.shd.x && heroPos.y === eshk.shd.y;
    // she is on his door with a mattock: he stands in her way
    const badinv = uondoor && (carriedPicks(ctx) > 0 || fastWithPickHere(ctx));
    if (satdoor && badinv) return 0;
    avoid = uondoor ? !badinv : uShops(ctx).length > 0 && dist2(gtx, gty, heroPos.x, heroPos.y) > 8;
    const owed = eshk.robbed > 0 || eshk.bill.length > 0 || eshk.debit > 0;
    if ((!owed || avoid) && dist2(omx, omy, gtx, gty) < 3) {
      if (!badinv && !online2(omx, omy, heroPos.x, heroPos.y)) return 0;
      if (satdoor) {
        appr = 0;
        gtx = 0;
        gty = 0;
      }
    }
  }
  const moved = moveSpecial(ctx, id, heroPos, {
    appr,
    avoid,
    goal: { x: gtx, y: gty },
    shk: { inHisShop: inhishop(ctx, id), following: eshk.following, uondoor },
  });
  if (moved > 0) afterShkMove(ctx, id);
  return moved;
}

/**
 * Chooses and performs one step. ref: src/monmove.c m_move() and postmov().
 * The goal is where the monster thinks the hero is (`ap`, set_apparxy(), guessed again here unless
 * dochug()'s guess found her; mfndpos() sets it to her when she is next to it). appr is 1
 * (approach) for hostiles, -1 (flee) for fleeing monsters, 0 (wander) for peacefuls, blind
 * monsters, 10 times in 11 for one she is invisible to that should see her, and, one time in
 * three, for bats. Monsters walk to and pick up items they want (m_search_items, mpickstuff).
 * Stepping toward the wrong guess attacks whatever monster is there (m_move_aggress()). Not
 * ported: ranged "balking", tracking the hero's trail, tunneling, special movers, traps.
 */
function mMove(ctx: Ctx, id: EntityId, heroPos: Pos, ap: Pos): MoveStatus {
  const { m, pos, def } = monCount(ctx, id);
  const level = getLevel(ctx.state, pos.level);
  const rules = cellRules(level, ctx.defs);
  // ref: m_move(): "Where does 'mtmp' think you are?"
  Object.assign(ap, setApparxy(ctx, monCount(ctx, id).e, ap));

  // ref: m_move(): "likewise for shopkeeper, guard, or priest"; -1 (a priest outside his
  // temple, a shopkeeper following the hero, an angry guard) goes on with the normal AI
  if (epriOf(ctx, id) || eshkOf(ctx, id) || isGuard(ctx.state, id)) {
    const xm = epriOf(ctx, id)
      ? priMove(ctx, id, heroPos, ap)
      : eshkOf(ctx, id)
        ? shkMove(ctx, id, heroPos, ap)
        : gdMoveLate(ctx, id);
    // a guard leaving the map (parked until his corridor is gone) is as good as dead here
    if (xm === -2 || !ctx.state.entities[String(id)]?.c.monster) return 'died';
    if (xm === 1) return postmovMoved(ctx, id, level, rules);
    if (xm === 0) return 'nothing';
  }
  // ref: m_move(): "teleport if that lies in our nature": a tengu jumps one time in five, to a
  // random spot when hurt (under 7 HP), peaceful or half the time, else next to the hero
  // (mnexto(); with no room it stays: deal_with_overcrowding() is not ported)
  if (def.id === TENGU && !ctx.rng.rn2(5) && !isCancelled(ctx, id)) {
    const me = ctx.state.entities[String(id)];
    if (me && !teleRestrict(ctx, me)) {
      if ((me.c.hp?.cur ?? 0) < 7 || m.peaceful || ctx.rng.rn2(2)) rlocMon(ctx, me, true);
      else {
        const to = mnextoPos(ctx, level, id, heroPos);
        if (to) rlocTo(ctx, me, to.x, to.y, true);
      }
      return postmovMoved(ctx, id, level, rules);
    }
  }
  // ref: m_move() not_special: while the hero is swallowed, other monsters do not come for her
  // (and the engulfer holding her stays where she is: DEVIATIONS "Engulfing")
  const sw = uswallow(ctx);
  if (sw && (sw.mon === id || !isFleeing(ctx, id))) return sw.mon === id ? 'nothing' : 'moved';
  const goal: Pos = { x: ap.x, y: ap.y };

  // ref: m_move(): `appr = mtmp->mflee ? -1 : 1`, 0 for a confused monster, else overridden to
  // 0 for blind ones, mostly for one that should see her but she is invisible to, peacefuls and
  // erratic bats
  let appr = isFleeing(ctx, id) ? -1 : 1;
  if (isMConfused(ctx, id)) appr = 0;
  else {
    const gi = cellIndex(level, goal.x, goal.y);
    const oi = cellIndex(level, pos.x, pos.y);
    const shouldSee =
      couldseeAt(ctx, pos.x, pos.y) &&
      (level.lit[gi] === 1 || level.lit[oi] !== 1) &&
      dist2(pos.x, pos.y, goal.x, goal.y) <= 36;
    if (
      !mcansee(ctx, id) ||
      (shouldSee && invisTo(ctx, monCount(ctx, id).e) && ctx.rng.rn2(11)) ||
      m.peaceful ||
      (isBatClass(def) && ctx.rng.rn2(3) === 0)
    )
      appr = 0;
    // ref: m_move(): a leprechaun with more gold than she has keeps away
    if (appr === 1 && leppieAvoidance(ctx, id, def)) appr = -1;
  }
  if (isMStunned(ctx, id)) appr = 0;

  // ref: m_move(): hostile monsters (and peaceful ones 1 time in 10) look for items unless they
  // are closing in on a hero they are lined up with ("monsters in combat won't pick stuff up")
  if (!m.peaceful || ctx.rng.rn2(10) === 0) {
    const str = acurrstr(getPlayer(ctx.state).c.attributes?.str ?? 10);
    const blocked = blockersOf(ctx, level.id);
    const inLine =
      linedUp(level, rules.opaque, blocked, pos, ap) &&
      distmin(pos.x, pos.y, ap.x, ap.y) <= Math.trunc(str / 2) + 1;
    if ((appr !== 1 || !inLine) && mSearchItems(ctx, id, level, rules.opaque, blocked, goal, ap)) {
      // standing on something wanted: postmov() -> eating, then mpickstuff()
      if (monEatsHere(ctx, id)) return 'died';
      mpickstuff(ctx, id);
      return 'done';
    }
    // ref: m_search_items() finish_search: a fleeing monster that found something to go for heads
    // for it, unless the hero is within 3 squares (then it keeps running from her). (Found an item
    // = the goal moved off the hero; an item on the hero's own square is not told apart.)
    if (appr === -1 && (goal.x !== ap.x || goal.y !== ap.y)) {
      if (distmin(pos.x, pos.y, ap.x, ap.y) <= 3) {
        goal.x = ap.x;
        goal.y = ap.y;
      } else appr = 1;
    }
  }
  const ggx = goal.x;
  const ggy = goal.y;

  const e = ctx.state.entities[String(id)];
  const canTunnel = e !== undefined && canTunnelNow(ctx, e, ap);
  const cands = mfndpos(
    ctx,
    level,
    rules,
    id,
    heroPos,
    e ? { allowU: monAllowU(ctx, e), allowDig: canTunnel, guess: ap } : { guess: ap },
  );
  const cnt = cands.length;
  const unicorn = isUnicorn(def);
  if (cnt === 0 && !unicorn) {
    // ref: m_move(): cornered, `if (find_defensive(mtmp, TRUE) && use_defensive(mtmp)) return
    // MMOVE_DONE;` (a monster that left the level or died is done with this move)
    const c = findDefensive(ctx, id, true);
    if (c && useDefensive(ctx, id, c) !== 0)
      return ctx.state.entities[String(id)]?.c.pos ? 'done' : 'died';
    return 'nomoves'; // MMOVE_NOMOVES
  }
  // ref: m_move(): "on noteleport levels, perhaps we cannot avoid hero": a unicorn there keeps
  // off her lines while it has a square that is not on one
  const avoid = unicorn && noteleportLevel(ctx, level) && cands.some((c) => !c.lined);
  const track = getTrack(ctx, id);
  const jcnt = Math.min(MTSZ, cnt - 1);
  let chcnt = 0;
  let chosen: Candidate | null = null;
  let nidist = dist2(pos.x, pos.y, ggx, ggy);
  for (const c of cands) {
    if (avoid && c.lined) continue;
    if (appr !== 0) {
      // ref: m_move() "mtrack" avoidance of recently visited squares
      let skip = false;
      for (let j = 0; j < jcnt && !skip; j++) {
        if (track[2 * j] === c.x && track[2 * j + 1] === c.y && ctx.rng.rn2(4 * (cnt - j)) !== 0)
          skip = true;
      }
      if (skip) continue;
    }
    const ndist = dist2(c.x, c.y, ggx, ggy);
    const nearer = ndist < nidist;
    if (
      (appr === 1 && nearer) ||
      (appr === -1 && !nearer) ||
      (appr === 0 && ctx.rng.rn2(++chcnt) === 0) ||
      chosen === null
    ) {
      chosen = c;
      nidist = ndist;
    }
  }
  if (chosen === null) {
    // ref: m_move(): a unicorn that could not move teleports half the time
    // (`is_unicorn(ptr) && rn2(2) && !tele_restrict(mtmp)`: rloc(mtmp, RLOC_MSG), MMOVE_MOVED)
    if (unicorn && e && ctx.rng.rn2(2) && !teleRestrict(ctx, e)) {
      rlocMon(ctx, e, true);
      return 'moved';
    }
    // ref: m_move(): "for a long worm, shrink it (by discarding end of tail) when it has failed
    // to move"
    if (wormRec(ctx.state, id)) wormNomove(ctx, id);
    return 'nothing';
  }
  // ref: m_move(): `if (mmoved == MMOVE_MOVED && m_digweapon_check(mtmp, nix, niy)) return
  // MMOVE_DONE`: wielding a pick to dig there takes the move
  if (e && mDigweaponCheck(ctx, e, chosen.x, chosen.y)) return 'done';
  // ref: m_move() "if ALLOW_U, attack this spot": the monster stays put and attacks in dochug()
  // when it is her; else it mistakes the spot for her (m_move_aggress())
  // (an ALLOW_U square is her own or the guess, which mfndpos() set to her when she is near)
  if (chosen.hero) {
    if (ap.x === heroPos.x && ap.y === heroPos.y) return 'nothing';
    return mMoveAggress(ctx, id, chosen.mon ?? null);
  }

  const from = { x: pos.x, y: pos.y };
  trackAdd(ctx, id, from.x, from.y);
  pos.x = chosen.x;
  pos.y = chosen.y;
  ctx.emit({ type: 'moved', id, from, to: { x: chosen.x, y: chosen.y } });
  // ref: m_move(): "for a long worm, insert a new segment to reconnect the head with the tail"
  if (wormRec(ctx.state, id)) wormMove(ctx, id, from);
  maybeUnhideAt(ctx, level.id, chosen.x, chosen.y); // ref: m_move() after place_monster()
  return postmovMoved(ctx, id, level, rules, canTunnel);
}

/**
 * The monster steps at the spot where it thinks the hero is, which is not her: it attacks the
 * monster there (`target`), which may hit back; the move is spent either way.
 * ref: src/monmove.c m_move_aggress()
 */
function mMoveAggress(ctx: Ctx, id: EntityId, target: EntityId | null): MoveStatus {
  let mstatus: number = M_ATTK.MISS;
  if (target !== null) mstatus = mattackm(ctx, id, target);
  if (mstatus & M_ATTK.AGR_DIED || !ctx.state.entities[String(id)]?.c.monster) return 'died';
  const actor = target === null ? undefined : ctx.state.entities[String(target)]?.c.actor;
  if (
    (mstatus & (M_ATTK.HIT | M_ATTK.DEF_DIED)) === M_ATTK.HIT &&
    ctx.rng.rn2(4) &&
    actor &&
    actor.energy > ctx.rng.rn2(NORMAL_SPEED) &&
    target !== null
  ) {
    actor.energy = actor.energy > NORMAL_SPEED ? actor.energy - NORMAL_SPEED : 0;
    mstatus = mattackm(ctx, target, id); // return attack
    if (mstatus & M_ATTK.DEF_DIED) return 'died';
  }
  return 'done';
}

/**
 * m_move()'s can_tunnel: a tunneller, unless it needs a pick and is a hostile (or, under
 * Conflict, any) monster within reach of where it thinks the hero is ("don't tunnel if hostile
 * and close enough to prefer a weapon"; mon_allowflags() uses the same test for ALLOW_DIG). It
 * need not carry a pick: one without digs nothing but doors it steps onto. ref:
 * src/monmove.c m_move(); src/mon.c mon_allowflags() (no Rogue level)
 */
function canTunnelNow(ctx: Ctx, mon: Entity, heroPos: Pos): boolean {
  const def = ctx.defs.monster(mon.def);
  const p = mon.c.pos;
  if (!tunnels(def) || !p) return false;
  const hostile = !(mon.c.monster?.peaceful ?? false) || conflictOn(ctx.state);
  return !(needsPick(def) && hostile && dist2(p.x, p.y, heroPos.x, heroPos.y) <= 8);
}

/**
 * What happens after a monster stepped (MMOVE_MOVED): traps, opening a door it stepped onto (a
 * tunneller breaks it instead), digging the square it stepped into, picking things up.
 * ref: src/monmove.c postmov()
 */
function postmovMoved(
  ctx: Ctx,
  id: EntityId,
  level: Level,
  rules: CellRules,
  canTunnel = false,
): MoveStatus {
  const { e, pos, def } = monCount(ctx, id);
  // ref: postmov(): `trapret = mintrap(mtmp)`; killed or moved off the level is MMOVE_DIED
  if (trapRemovedMon(mintrap(ctx, id))) return 'died';

  // ref: postmov(): open a closed door the monster just stepped onto, `!passes_walls(ptr)`
  // ("doesn't need to open doors") and `!can_tunnel` ("taken care of below")
  const here = level.cells[cellIndex(level, pos.x, pos.y)] ?? 0;
  const opens = rules.closedDoor[here] === true && !def.flags.includes('wallwalk') && !canTunnel;
  if (opens && doorTrapped(ctx, level.id, pos.x, pos.y)) {
    const didsee = isVisible(ctx.state, cellIndex(level, pos.x, pos.y));
    blowDoor(ctx, level, pos.x, pos.y); // D_NODOOR
    if (mbTrapped(ctx, e, didsee || isVisible(ctx.state, cellIndex(level, pos.x, pos.y))))
      return 'died';
  } else if (opens) {
    openDoorAt(ctx, level, pos);
    const seen = isVisible(ctx.state, cellIndex(level, pos.x, pos.y));
    ctx.emit({ type: 'doorOpened', pos: { x: pos.x, y: pos.y } });
    ctx.emit(
      seen
        ? { type: 'msg', key: 'door.mon_opens', params: { mon: `@${def.id}` } }
        : { type: 'msg', key: 'door.hear_open' },
    );
  }
  // ref: postmov(): "possibly dig"
  if (canTunnel && mayDig(ctx, level, pos.x, pos.y) && mdigTunnel(ctx, e)) return 'died';
  // ref: postmov(): rock moles and rust monsters eat metal, gelatinous cubes eat and engulf
  // objects, purple worms and ghouls eat corpses (meat.ts)
  if (monEatsHere(ctx, id)) return 'died';
  // ref: postmov(): a monster that moved picks up something it likes on the new square
  if (mpickstuff(ctx, id)) return 'done';
  // ref: postmov(): `if (mtmp->isshk) after_shk_move(mtmp)`
  if (eshkOf(ctx, id)) afterShkMove(ctx, id);
  return 'moved';
}

/**
 * One monster action. ref: src/monmove.c dochug().
 * Phase one: sleeping monsters stay asleep unless disturb() wakes them. Phase three: a monster
 * that is not next to the hero, is peaceful, or (wanderers, e.g. bats) rolls 1/4, moves via
 * m_move(); one that moved does not attack in the same action. Phase four: a hostile adjacent
 * monster attacks. A fleeing monster always tries to move (away from the hero) and attacks only
 * when it could not (cornered). A hostile monster next to the hero in her sanctuary is scared:
 * it flees and attacks only when it has nowhere to go (panicattk). A confused or stunned monster
 * moves (at random) and attacks only when it did not. A spellcaster that is not attacking may
 * cast an undirected spell instead of moving. After distfleeck() a monster may drink a healing
 * potion or flee by the stairs or a trap (find_defensive(): muse.ts). Not ported: other scares
 * (Elbereth), invisibility, misc item use, special per-monster behavior. A pet's move is `petMove` (dog_move).
 */
export function dochug(
  ctx: Ctx,
  id: EntityId,
  petMove: (ctx: Ctx, id: EntityId) => 'moved' | 'nothing' | 'done' | 'died' = () => 'moved',
): void {
  const { m, pos } = monCount(ctx, id);
  const hero = getPlayer(ctx.state);
  const hp = hero.c.pos;
  if (!hp || hp.level !== pos.level) return;

  // ref: src/mon.c m_move_aggress()/movemon_singlemon(): after picking something up a monster
  // reassesses its armor, when it thinks the hero is not near (or is peaceful); putting
  // something on spends the turn. (No donning delay.)
  if (monFlag(ctx, 'gearchk', id) && (m.peaceful || dist2(pos.x, pos.y, hp.x, hp.y) > 9)) {
    setMonFlag(ctx, 'gearchk', id, false);
    if (mDoWear(ctx, id, false)) return;
  }

  // ref: src/mon.c movemon_singlemon(): "unwatched mimics and piercers may hide again"
  // (restrap()), and a hiding hider does not move at all; a hider-underer whose object went away
  // comes out (maybe_unhide_at(): no draw, a guard for the object paths that do not call it)
  const me00 = ctx.state.entities[String(id)];
  if (me00) {
    const d00 = ctx.defs.monster(me00.def);
    if (isHider(d00)) {
      if (restrap(ctx, me00)) return;
      if (apAsThing(ctx, id)) return; // a disguised mimic stays put
      if (isUndetected(ctx, id)) return;
    } else maybeUnhideAt(ctx, pos.level, pos.x, pos.y);
  }

  // ref: src/mon.c movemon_singlemon(): "continue if the monster died fighting": under Conflict
  // a monster that sees her and that she sees within BOLT_LIM fights a neighbour instead of
  // moving (Conflict does not take effect in the first round: a monster stepping into the area
  // still swings at her). Her seeing its square stands in for couldsee() in m_canseeu().
  const me0 = ctx.state.entities[String(id)];
  if (
    conflictOn(ctx.state) &&
    isVisible(ctx.state, cellIndex(getLevel(ctx.state, pos.level), pos.x, pos.y)) &&
    me0 !== undefined &&
    !invisTo(ctx, me0) &&
    dist2(pos.x, pos.y, hp.x, hp.y) <= BOLT_LIM * BOLT_LIM &&
    fightm(ctx, id)
  )
    return; // mon might have died

  // ref: dochug(): a monster that can't move does nothing; a confused or stunned one may recover
  if (isFrozen(ctx, id)) return;
  if (m.asleep && !disturb(ctx, id)) return;
  if (isMConfused(ctx, id) && ctx.rng.rn2(50) === 0) setMConfused(ctx, id, false);
  if (isMStunned(ctx, id) && ctx.rng.rn2(10) === 0) setMStunned(ctx, id, false);

  const heroPos = { x: hp.x, y: hp.y };
  const prevHero = m.lastHero; // where it last saw her (stands in for u.ux0/u.uy0)
  m.lastHero = heroPos;

  const def = ctx.defs.monster(ctx.state.entities[String(id)]?.def ?? 'nh:none');
  const self = ctx.state.entities[String(id)];
  // ref: dochug(): "Some monsters teleport. Teleportation costs a turn." (no Wizard of Yendor;
  // `leppie_stash()` is not ported: see DEVIATIONS "Theft")
  if (
    self &&
    isFleeing(ctx, id) &&
    !ctx.rng.rn2(40) &&
    canTeleport(def) &&
    !noteleportLevel(ctx, getLevel(ctx.state, pos.level))
  ) {
    rlocMon(ctx, self, true);
    return;
  }
  // ref: dochug(): "some monsters have special abilities" (m_respond(): the shrieker's shriek)
  if (self) mRespond(ctx, self);
  // ref: dochug(): "fleeing monsters might regain courage"
  regainCourage(ctx, id);
  // ref: dochug(): "Cease conflict-induced swallow/grab if conflict has ended. Releasing the hero
  // in this way uses up the monster's turn."
  if (ustuck(ctx) === id && m.peaceful && !isMConfused(ctx, id) && !conflictOn(ctx.state)) {
    releaseHero(ctx, id);
    return;
  }
  // ref: dochug() PHASE TWO: "The monster decides where it thinks you are" (set_apparxy()); the
  // guess `ap` is this move's mux/muy (m_move() may guess again or find her)
  const ap = self ? setApparxy(ctx, self) : { x: heroPos.x, y: heroPos.y };
  // ref: src/monmove.c distfleeck(): inrange, nearby and scared; a scary square where it thinks
  // the hero is (onscary(): a scroll of scare monster) and the hero's sanctuary scare (no
  // Elbereth or flees_light; no bravegremlin roll) -- see DEVIATIONS.md
  let inrange = false;
  let nearby = false;
  let scared = false;
  const distfleeck = (): void => {
    const p = ctx.state.entities[String(id)]?.c.pos ?? pos;
    inrange = dist2(p.x, p.y, ap.x, ap.y) <= BOLT_LIM * BOLT_LIM;
    nearby = inrange && monnear(def, p.x, p.y, ap.x, ap.y);
    const e = ctx.state.entities[String(id)];
    // the monster sees the scare where it thinks the hero is when it cannot see her
    const seescary = e && (!mcansee(ctx, id) || invisTo(ctx, e)) ? ap : heroPos;
    const sawscary = e !== undefined && onscary(ctx, seescary.x, seescary.y, e);
    scared =
      nearby && e !== undefined && (sawscary || (!m.peaceful && inYourSanctuary(ctx, e, 0, 0)));
    if (scared) monflee(ctx, id, ctx.rng.rnd(ctx.rng.rn2(7) ? 10 : 100), true, true);
  };
  distfleeck();
  // ref: dochug(): "search for and potentially use defensive or miscellaneous items" (a use
  // that did something ends the move)
  const dchoice = findDefensive(ctx, id, false, ap);
  if (dchoice) {
    if (useDefensive(ctx, id, dchoice) !== 0) return;
  } else {
    const mchoice = findMisc(ctx, id, ap);
    if (mchoice && useMisc(ctx, id, mchoice) !== 0) return;
  }
  const fleeing = isFleeing(ctx, id);

  // ref: dochug(): "the watch will look around and see if you are up to no good :-)"
  if (isWatch(def.id)) watchOnDuty(ctx, id);

  // ref: dochug(): "If monster is nearby you, and has to wield a weapon, do so. This costs the
  // monster a move, of course."
  if (
    (!m.peaceful || conflictOn(ctx.state)) &&
    inrange &&
    dist2(pos.x, pos.y, ap.x, ap.y) <= 8 &&
    def.attacks.some((a) => a.at === 'weapon') &&
    monWieldItem(ctx, id)
  )
    return;

  // ref: dochug() PHASE THREE: "A killer bee may eat honey in order to turn into a queen bee,
  // costing it a move."
  if (def.id === 'nh:killer_bee' && beeEatJelly(ctx, id) >= 0) return;

  // phase four's attitude test: hostile, or (rolled each time) not resisting Conflict
  const hostileNow = (): boolean => {
    if (!m.peaceful) return true;
    const me = ctx.state.entities[String(id)];
    return !!me && conflictOn(ctx.state) && !resistConflict(ctx, me);
  };
  let status: MoveStatus = 'nothing';
  let panicattk = false;
  if (
    !nearby ||
    fleeing ||
    scared ||
    isMConfused(ctx, id) ||
    isMStunned(ctx, id) ||
    (monInvisible(ctx, monCount(ctx, id).e) && !ctx.rng.rn2(3)) ||
    // a leprechaun moves on (rather than standing to fight) when she has no gold: always if it
    // has some, else half the time
    (def.glyph.ch === 'l' &&
      !findgold(ctx, ctx.state.playerId) &&
      (findgold(ctx, id) !== null || ctx.rng.rn2(2) !== 0)) ||
    (isWanderer(def) && ctx.rng.rn2(4) === 0) ||
    conflictOn(ctx.state) || // `Conflict && !mtmp->iswiz`
    (!mcansee(ctx, id) && ctx.rng.rn2(4) === 0) ||
    m.peaceful
  ) {
    // ref: dochug(): "Possibly cast an undirected spell if not attacking you" -- within 7
    // squares ("to keep monster far away from you from having cast dozens of sticks-to-snakes");
    // most of the time castmu() picks a directed spell and does nothing, so the monster moves
    // normally. A cast bypasses m_move() (MMOVE_DONE), so it comes before the trap check.
    if (!mspecUsed(ctx, id) && dist2(pos.x, pos.y, heroPos.x, heroPos.y) <= 49) {
      for (const a of def.attacks) {
        if (a.at !== 'magic' || (a.ad !== 'spel' && a.ad !== 'clrc')) continue;
        if (castmu(ctx, id, a, false, false)) {
          status = 'done';
          break;
        }
      }
    }
    if (status === 'done')
      distfleeck(); // recalc
    else {
      // ref: m_move(): a trapped monster tries to get free first; still caught, it does not move
      // (but may attack)
      const caught = isMtrapped(ctx, id) ? mintrap(ctx, id) : 'finished';
      if (trapRemovedMon(caught)) return;
      if (caught !== 'caught') {
        // ref: m_move(): a monster in the middle of a meal keeps eating (MMOVE_DONE)
        const meal = meating(ctx, id);
        if (meal) {
          setMeating(ctx, id, meal - 1);
          return;
        }
        // ref: m_move(): a hider-underer on a pile it can hide under does not leave its hiding
        // place 9 times in 10 (MMOVE_NOTHING, before the pet branch)
        const here = ctx.state.entities[String(id)]?.c.pos;
        if (
          hidesUnder(def) &&
          here &&
          canHideUnderObj(ctx, here.level, here.x, here.y) &&
          ctx.rng.rn2(10)
        )
          status = 'nothing';
        // ref: m_move(): `if (mtmp->mtame) { mmoved = dog_move(mtmp, after); goto postmov; }`;
        // a pet that did nothing goes on to phase four, where only Conflict makes it attack her
        // (`if (mtmp->wormno) goto not_special`: a tame worm with a worm number moves as any
        // monster does, keeping its tail)
        else if ((m.tame ?? 0) > 0 && !wormRec(ctx.state, id)) status = petMove(ctx, id);
        else status = mMove(ctx, id, heroPos, ap);
        if (status === 'died') return;
        // ref: m_move() postmov: `maybe_spin_web(mtmp)` after MMOVE_MOVED or MMOVE_DONE (m_move()
        // returns early, skipping postmov, while the hero is swallowed by another monster), then
        // a hider-underer hides (again): "Always set--or reset--mundetected if it's already
        // hidden ... usually set mundetected unless monster can't move."
        if (status === 'moved' || status === 'done') {
          const sw = uswallow(ctx);
          const me = ctx.state.entities[String(id)];
          if (me && (!sw || sw.mon === id)) {
            maybeSpinWeb(ctx, me);
            const mm = me.c.monster;
            if (
              ctx.state.entities[String(id)]?.c.monster &&
              hidesUnder(ctx.defs.monster(me.def)) &&
              (isUndetected(ctx, id) ||
                (!isFrozen(ctx, id) && !(mm?.asleep ?? false) && ctx.rng.rn2(5)))
            )
              hideunder(ctx, id);
          }
        }
        distfleeck(); // recalc
        if (status === 'nomoves' && scared) panicattk = true;
        if (status === 'moved') {
          // ref: dochug(): "Monsters can move and then shoot on same turn": a monster with a
          // weapon or a ranged attack (C's ranged_attk_available(): breath, spit or gaze; AT_MAGC
          // too, but buzzmu() casters are not ported) that is still not next to the hero uses
          // its ranged attack (phase four's attitude test: hostile, or not resisting Conflict)
          const np = ctx.state.entities[String(id)]?.c.pos;
          if (
            np &&
            !nearby &&
            (def.attacks.some(
              (a) => a.at === 'weapon' || a.at === 'gaze' || a.at === 'breath' || a.at === 'spit',
            ) ||
              findOffensive(ctx, id, ap) !== null)
          ) {
            if (hostileNow() && inrange) mattacku(ctx, id, ap, prevHero, true);
            maybeCuss(ctx, id, inrange, heroPos); // phase four goes on to the cussing
          }
          return;
        }
      }
    }
  }
  // MMOVE_DONE (picked something up) means no attack this move
  // ref: dochug() `!mtmp->mpeaceful || (Conflict && !resist_conflict(mtmp))`, then
  // `((inrange && !scared) || panicattk)`
  const hostile = status !== 'done' && hostileNow();
  const mayAttack = hostile && ((inrange && !scared) || panicattk);
  // ref: mattacku(): range2 is `!monnear(mtmp, mtmp->mux, mtmp->muy)`
  if (mayAttack && monnear(def, pos.x, pos.y, ap.x, ap.y)) {
    mattacku(ctx, id, ap, prevHero);
  } else if (mayAttack && inrange) {
    // ref: mattacku() with range2: a weapon attack at a distance throws or shoots
    mattacku(ctx, id, ap, prevHero, true);
  }
  // ref: dochug(): `if (mtmp->wormno) wormhitu(mtmp)`
  if (hostile && wormRec(ctx.state, id)) wormhitu(ctx, id, ap);
  maybeCuss(ctx, id, inrange, heroPos);
}

/**
 * The monster attacks the hero (where it thinks she is, `ap`): next to her its melee attacks
 * (monsterAttack()), from afar (`range2`) its ranged ones (mattackRanged(), `prevHero` is where it
 * last saw her). First, "unlike defensive stuff, don't let them use item _and_ attack": an attack
 * wand it chose (findOffensive()) that did something is its attack. Swallowed she is attacked
 * only by the engulfer, which uses no item (find_offensive() refuses), and while she prays nothing
 * is used. ref: src/mhitu.c mattacku() (the find_offensive() hook comes after the were creature's
 * summoning in C, which here comes inside monsterAttack())
 */
function mattacku(ctx: Ctx, id: EntityId, ap: Pos, prevHero: Pos | null, range2 = false): void {
  if (!uState(ctx.state).uinvulnerable) {
    const c = findOffensive(ctx, id, ap);
    if (c && useOffensive(ctx, id, c) !== 0) return;
  }
  const e = ctx.state.entities[String(id)];
  const p = e?.c.pos;
  if (!e?.c.monster || !p || ctx.state.gameOver) return;
  if (range2) mattackRanged(ctx, id, sightLine(ctx, p.level), prevHero, ap);
  else monsterAttack(ctx, id, ap);
}

/**
 * A worm whose tail lies next to the hero attacks once more for each such segment. As in NetHack
 * 5.0, mattacku() still measures from the head ("mattacku() thinks that the head is out of
 * range"), so only a worm whose head is also next to where it thinks she is gets the extra
 * attacks. ref: src/worm.c wormhitu()
 */
function wormhitu(ctx: Ctx, id: EntityId, ap: Pos): void {
  const rec = wormRec(ctx.state, id);
  const hp = getPlayer(ctx.state).c.pos;
  if (!rec || !hp) return;
  for (const s of rec.segs) {
    const w = ctx.state.entities[String(id)];
    const sp = ctx.state.entities[String(s)]?.c.pos;
    const wp = w?.c.pos;
    if (!w?.c.monster || !wp || ctx.state.gameOver) return; // "your passive ability killed the worm"
    if (!sp || dist2(sp.x, sp.y, hp.x, hp.y) >= 3) continue;
    // mattacku() with range2 (the head not next to mux/muy): the bites are skipped
    if (monnear(ctx.defs.monster(w.def), wp.x, wp.y, ap.x, ap.y)) mattacku(ctx, id, ap, null);
  }
}

/**
 * ref: dochug(): "extra emotional attack for vile monsters": a hostile MS_CUSS monster within
 * range on a square the hero could see, if it is not invisible, curses her one time in five.
 * Skipped when the monster died attacking or the game ended.
 */
function maybeCuss(ctx: Ctx, id: EntityId, inrange: boolean, heroPos: Pos): void {
  const mon = ctx.state.entities[String(id)];
  const p = mon?.c.pos;
  if (!mon?.c.monster || !p || ctx.state.gameOver || !inrange) return;
  if (ctx.defs.monster(mon.def).sound !== 'cuss' || mon.c.monster.peaceful) return;
  if (!sightLine(ctx, p.level)(heroPos.x, heroPos.y, p.x, p.y)) return;
  if (monInvisible(ctx, mon)) return;
  if (!ctx.rng.rn2(5)) cuss(ctx, mon);
}

/** ref: PM_TENGU */
const TENGU = 'nh:tengu';

/** ref: include/mondata.h can_teleport(): M1_TPORT */
const canTeleport = (def: MonsterDef): boolean => def.flags.includes('tport');

/** The hero's clear-line-of-sight test on a level (couldsee), for ranged attacks. */
function sightLine(ctx: Ctx, levelId: string) {
  const level = ctx.state.levels[levelId];
  if (!level) return () => false;
  const rules = cellRules(level, ctx.defs);
  const blocked = blockersOf(ctx, levelId);
  return (x1: number, y1: number, x2: number, y2: number): boolean =>
    clearPath(level, rules.opaque, x1, y1, x2, y2, blocked);
}
