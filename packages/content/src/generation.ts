// Monster generation: rndmonst, makemon, level population and random spawning.
import {
  cellIndex,
  cellRules,
  getLevel,
  getPlayer,
  inBounds,
  isVisible,
  type CellRules,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type GameState,
  type Level,
  type LevelId,
  type ModApi,
  type MonsterDef,
  type Pos,
} from '@nh/core';
import { uWieldArt } from './artistate';
import { golemhp } from './golem';
import { boulderCells } from './boulder';
import { isSokoban } from './sokoban';
import { givePossessions, mongets } from './mongear';
import { uState } from './luck';
import { raceHostile, racePeaceful } from './race';
import { raceIs } from './urole';
import { isGenocided, isGone, propagate } from './vanquished';
import { inHell, isRogueLevel, madeLevelFlags } from './levelflags';
import { temperatureShift } from './temperature';
import { hideunder } from './hide';
import { setMimicSym } from './mimicstate';
import { pmToCham, setCham, VLAD_THE_IMPALER } from './chamstate';
import { protFromShapeChangers } from './props';
import { setMinvis } from './invis';
import { mInAir, monLiquidOk } from './liquid';
import {
  isBat,
  isCovetous,
  isDprince,
  isEel,
  isFloater,
  isFlyer,
  isMplayer,
  isNdemon,
  isUnicorn,
  upperSym,
} from './mondata';
import { setIsWiz, WIZARD_OF_YENDOR } from './wizstate';
import { setMspeed, setStrat } from './mstate';
import { AMOROUS_DEMON, setMonFemale } from './gender';
import { setEmin } from './emin';
import type { Aligntyp } from './aligntyp';

/** ref: src/allmain.c maybe_generate_rnd_mon(): 1 in 70 per turn above the Castle's depth */
export const SPAWN_ODDS = 70;

const heroLevel = (ctx: Pick<Ctx, 'state'>): number =>
  getPlayer(ctx.state).c.experience?.level ?? 1;

/** ref: include/monst.h monmin_difficulty() */
export const monminDifficulty = (levdif: number): number => Math.trunc(levdif / 6);
/** ref: include/monst.h monmax_difficulty() */
export const monmaxDifficulty = (levdif: number, ulevel: number): number =>
  Math.trunc((levdif + ulevel) / 2);

/**
 * ref: src/makemon.c uncommon(): not randomly generated (nogen/unique), genocided or extinct
 * (G_GONE), or outside Gehennom Gehennom-only ('hell' genFlag); in Gehennom lawful.
 */
function uncommon(state: Readonly<GameState>, def: MonsterDef): boolean {
  if (def.genFlags.includes('nogen') || def.genFlags.includes('uniq')) return true;
  if (isGone(state, def.id)) return true;
  if (inHell(state)) return def.alignment > 0; // maligntyp > A_NEUTRAL
  return def.genFlags.includes('hell');
}

/** ref: src/makemon.c align_shift(): the Dungeons of Doom are unaligned (AM_NONE), so 0. */
function alignShift(_def: MonsterDef): number {
  return 0;
}

/**
 * A random monster type appropriate for a level of difficulty `depth` (and the hero's level),
 * its difficulty window moved by `minadj`/`maxadj` (rndmonst_adj(); 0, 0 is rndmonst()). `level`
 * is where it is made (NetHack's u.uz while a level is made; the hero's level when omitted): in
 * Gehennom no G_NOHELL kind, on the Rogue level only uppercase kinds, and on a hot or cold level
 * resistant kinds weigh 3 more.
 * ref: src/makemon.c rndmonst_adj() weighted reservoir sampling, temperature_shift(); returns
 * null if none qualify.
 */
export function rndmonst(
  ctx: Pick<Ctx, 'state' | 'rng' | 'defs'>,
  depth: number,
  minadj = 0,
  maxadj = 0,
  level: Readonly<Level> | undefined = ctx.state.levels[ctx.state.currentLevel],
): MonsterDef | null {
  const minmlev = monminDifficulty(depth) + minadj;
  const maxmlev = monmaxDifficulty(depth, heroLevel(ctx)) + maxadj;
  const hell = inHell(ctx.state, level);
  const upper = isRogueLevel(level); // prefer uppercase only on rogue level
  let total = 0;
  let selected: MonsterDef | null = null;
  for (const def of ctx.defs.monsters) {
    if (def.difficulty < minmlev || def.difficulty > maxmlev) continue; // montooweak/strong
    if (upper && !upperSym(def.glyph.ch)) continue;
    if (uncommon(ctx.state, def)) continue;
    if (hell && def.genFlags.includes('nohell')) continue;
    const weight =
      def.frequency + alignShift(def) + (level ? temperatureShift(ctx, level, def) : 0);
    if (weight > 0) {
      total += weight;
      if (ctx.rng.rn2(total) < weight) selected = def;
    }
  }
  return selected;
}

/**
 * A random monster of glyph class `cls` for a level of difficulty `depth`, or null. Candidates are
 * the class in difficulty order (ref: init_mongen_order()); `allow` lifts generation flags
 * ('nogen' for special levels, as G_NOGEN); genocided and extinct species are skipped
 * (mk_gen_ok()'s G_GONE) unless `opts.ignoreGone` (C's G_IGNORE); 8 times in 9 (always for liches) not Gehennom-only, or in Gehennom not
 * never-in-Gehennom. The player monsters are not candidates: C's loop stops at the end of the
 * class's first run of rows, and theirs is a second run of '@' rows after the long worm tail.
 * `opts.atyp` (an alignment sign) keeps only the kinds of that alignment's sign
 * (mkclass_aligned(); omitted is A_NONE, any alignment); `opts.level` is where it is made (C's
 * u.uz while a level is made; the hero's level when omitted), for Inhell.
 * ref: src/makemon.c mkclass(), mkclass_aligned()
 */
export function mkclass(
  ctx: Pick<Ctx, 'state' | 'rng' | 'defs'>,
  cls: string,
  depth: number,
  allow: readonly string[] = [],
  opts: { atyp?: number; level?: Readonly<Level>; ignoreGone?: boolean } = {},
): MonsterDef | null {
  const { atyp } = opts;
  const list = ctx.defs.monsters
    .filter((m) => m.glyph.ch === cls && !isMplayer(m))
    .map((m, i) => ({ m, i }))
    .sort((a, b) => a.m.difficulty - b.m.difficulty || a.i - b.i)
    .map(({ m }) => m);
  const maxmlev = depth >> 1;
  const ulevel = heroLevel(ctx);
  const zeroFreq = list.every((m) => m.frequency === 0);
  const hell = inHell(ctx.state, opts.level);
  const nums: number[] = list.map(() => 0);
  let num = 0;
  for (let last = 0; last < list.length; last++) {
    const m = list[last] as MonsterDef;
    if (atyp !== undefined && Math.sign(m.alignment) !== Math.sign(atyp)) continue;
    const mask = ['nogen', 'uniq'];
    if (ctx.rng.rn2(9) || cls === 'L') mask.push(hell ? 'nohell' : 'hell');
    if (!opts.ignoreGone && isGone(ctx.state, m.id)) continue; // mk_gen_ok(): mvflags & mv_mask
    if (m.genFlags.some((f) => mask.includes(f) && !allow.includes(f))) continue;
    const prev = list[last - 1];
    if (num && m.difficulty > maxmlev && prev && m.difficulty > prev.difficulty && ctx.rng.rn2(2))
      break;
    const k = m.frequency > 0 ? m.frequency : zeroFreq ? 1 : 0;
    if (k > 0) {
      nums[last] = k + 1 - (adjLev(m, depth, ulevel) > ulevel * 2 ? 1 : 0);
      num += nums[last] as number;
    }
  }
  if (!num) return null;
  let first = 0;
  for (num = ctx.rng.rnd(num); first < list.length; first++)
    if ((num -= nums[first] as number) <= 0) break;
  return nums[first] ? (list[first] ?? null) : null;
}

/**
 * ref: src/makemon.c adj_lev(): "special" demons and devils (above level 49) are level 50, and
 * no level goes past 49 otherwise (no Wizard of Yendor yet)
 */
export function adjLev(def: MonsterDef, depth: number, ulevel: number): number {
  let tmp = def.level;
  if (tmp > 49) return 50; // "special" demons/devils
  let tmp2 = depth - tmp;
  if (tmp2 < 0) tmp--;
  else tmp += Math.trunc(tmp2 / 5);
  tmp2 = ulevel - def.level;
  if (tmp2 > 0) tmp += Math.trunc(tmp2 / 4);
  tmp2 = Math.trunc((3 * def.level) / 2); // crude upper limit
  if (tmp2 > 49) tmp2 = 49; // hard upper limit
  return tmp > tmp2 ? tmp2 : tmp > 0 ? tmp : 0;
}

/**
 * ref: src/makemon.c newmonhp(): golems have a fixed amount of hit points by kind (golemhp());
 * no dragons or riders.
 */
export function newmonhp(ctx: Ctx, mlev: number, id?: DefId): number {
  if (id !== undefined && golemhp(id) > 0) return golemhp(id);
  let basehp: number;
  let hp: number;
  if (!mlev) {
    basehp = 1;
    hp = ctx.rng.rnd(4);
  } else {
    basehp = mlev;
    hp = ctx.rng.d(basehp, 8);
  }
  if (hp === basehp) hp += 1;
  return hp;
}

/**
 * Alignment toward the hero decides peacefulness.
 * ref: src/makemon.c peace_minded(). The erinyes are peaceful only to a hero who never abused
 * her alignment (`!u.ualign.abuse`). Then her race's love and hate (race_peaceful(),
 * race_hostile(): a dwarf's kin are dwarves and gnomes, a human hates gnomes and orcs). A
 * co-aligned minion is peaceful unless she has strayed at all. Not ported: quest/guardian
 * sounds, Amulet.
 */
export function peaceMinded(ctx: Ctx, def: MonsterDef): boolean {
  if (def.flags.includes('peaceful')) return true;
  if (def.flags.includes('hostile')) return false;
  if (def.id === ERINYS) return uState(ctx.state).alignAbuse === 0;
  if (racePeaceful(ctx.state, def)) return true;
  if (raceHostile(ctx.state, def)) return false;
  const mal = def.alignment;
  const u = uState(ctx.state);
  if (Math.sign(mal) !== Math.sign(u.alignType)) return false;
  // minions are hostile to players that have strayed at all
  if (def.flags.includes('minion')) return u.alignRecord >= 0;
  // a co-aligned monster may still be hostile, more so when the hero has strayed
  return (
    ctx.rng.rn2(16 + (u.alignRecord < -15 ? -15 : u.alignRecord)) !== 0 &&
    ctx.rng.rn2(2 + Math.abs(mal)) !== 0
  );
}

const occupiedSet = (ctx: Ctx, level: Level): Set<number> => {
  const s = new Set<number>();
  for (const e of Object.values(ctx.state.entities)) {
    const p = e.c.pos;
    if (p && p.level === level.id && e.c.item === undefined) s.add(cellIndex(level, p.x, p.y));
  }
  return s;
};

/**
 * `taken` plus the boulder squares: goodpos() skips boulder locations for creatures that do not
 * throw rocks (none here). An explicit makemon() spot ignores boulders, as in NetHack.
 * ref: src/teleport.c goodpos() `sobj_at(BOULDER, x, y) && !throws_rocks(mdat)`
 */
const withBoulders = (ctx: Ctx, level: Level, taken: Set<number>): Set<number> => {
  const s = new Set(taken);
  for (const i of boulderCells(ctx, level)) s.add(i);
  return s;
};

/**
 * `taken` plus, on a level with Sokoban's rules, every trap square: random new monsters stay off
 * the pits and holes. This stands in for the levels' `des.exclusion` "monster-generation"
 * regions (DEVIATIONS.md "Sokoban"). ref: src/makemon.c makemon_rnd_goodpos() (bad_location()
 * with the exclusion regions)
 */
const withSokobanTraps = (level: Level, taken: Set<number>): Set<number> => {
  if (!isSokoban(level)) return taken;
  for (const t of level.traps) taken.add(cellIndex(level, t.x, t.y));
  return taken;
};

/**
 * `taken` plus the level's monster-generation exclusion areas (Fort Ludios's treasury and corner
 * towers): makemon()'s goodpos() checks pass GP_AVOID_MONPOS, so neither a random spot, nor the
 * spot next to a taken one, nor a random kind's fit for a given spot is ever there. The same set
 * unchanged when the level has none. ref: src/makemon.c makemon(), makemon_rnd_goodpos()
 * (GP_AVOID_MONPOS); src/teleport.c goodpos() `avoid_monpos && is_exclusion_zone(LR_MONGEN, x, y)`
 */
function withExclusions(ctx: Pick<Ctx, 'state'>, level: Level, taken: Set<number>): Set<number> {
  const ex = madeLevelFlags(ctx.state, level.id).mongenExclude;
  if (!ex || ex.length === 0) return taken;
  const s = new Set(taken);
  for (const [x1, y1, x2, y2] of ex)
    for (let x = x1; x <= x2; x++)
      for (let y = y1; y <= y2; y++) if (inBounds(level, x, y)) s.add(cellIndex(level, x, y));
  return s;
}

/** The creature goodpos() places: its type and m_in_air() (a new one: it flies or floats). */
export interface GpMon {
  def: MonsterDef;
  inAir: boolean;
}

/** goodpos()'s view of an existing monster, or of a new one of type `def`. */
export function gpMon(ctx: Pick<Ctx, 'state' | 'defs'>, mon: Entity | MonsterDef): GpMon {
  if ('c' in mon) return { def: ctx.defs.monster(mon.def), inAir: mInAir(ctx, mon) };
  return { def: mon, inAir: isFlyer(mon) || isFloater(mon) };
}

/**
 * ref: src/teleport.c goodpos(): nobody (and no boulder) there, passable and not a closed door.
 * Water and lava take a creature only as monLiquidOk() says (an eel out of water draws its
 * `rn2(13)`); with no creature (C's null `mtmp`) they are never good (not ACCESSIBLE()).
 */
function goodpos(
  ctx: Pick<Ctx, 'rng' | 'defs'>,
  level: Level,
  rules: CellRules,
  taken: Set<number>,
  x: number,
  y: number,
  mon: GpMon | null,
): boolean {
  if (!inBounds(level, x, y)) return false;
  const i = cellIndex(level, x, y);
  if (taken.has(i)) return false;
  const t = level.cells[i] ?? 0;
  if (mon) {
    if (!monLiquidOk(ctx, level, x, y, mon.def, mon.inAir)) return false;
  } else if ((rules.liquid[t] ?? null) !== null) return false;
  return rules.passable[t] === true && !rules.closedDoor[t];
}

/**
 * A random free square on `level` for monster `mon` arriving there (a migrating monster; no
 * monster: no water or lava). ref: src/teleport.c rloc(): 50 random tries of `rnd(COLNO - 1),
 * rn2(ROWNO)`, then every candidate square in a shuffled order; null when the level is full.
 */
export function rlocPos(
  ctx: Ctx,
  level: Level,
  mon?: Entity,
  ok?: (x: number, y: number) => boolean,
): Pos | null {
  const rules = cellRules(level, ctx.defs);
  const taken = withBoulders(ctx, level, occupiedSet(ctx, level));
  const gm = mon ? gpMon(ctx, mon) : null;
  const good = (x: number, y: number): boolean =>
    goodpos(ctx, level, rules, taken, x, y, gm) && (!ok || ok(x, y));
  for (let tries = 0; tries < 50; tries++) {
    const x = ctx.rng.rnd(level.width - 1);
    const y = ctx.rng.rn2(level.height);
    if (good(x, y)) return { x, y };
  }
  const candy: Pos[] = [];
  for (let x = 0; x < level.width; x++)
    for (let y = 0; y < level.height; y++) if (good(x, y)) candy.push({ x, y });
  if (candy.length === 0) return null;
  return candy[ctx.rng.rn2(candy.length)] ?? null;
}

/**
 * The nearest good square to `from`: rings of increasing Chebyshev radius, each searched in
 * random order. ref: src/teleport.c enexto_core() (collect_coords)
 */
function enexto(
  ctx: Ctx,
  level: Level,
  rules: CellRules,
  taken: Set<number>,
  from: Pos,
  mon: GpMon | null,
): Pos | null {
  const maxR = Math.max(level.width, level.height);
  for (let r = 1; r <= maxR; r++) {
    const ring: Pos[] = [];
    for (let x = from.x - r; x <= from.x + r; x++)
      for (let y = from.y - r; y <= from.y + r; y++)
        if (Math.max(Math.abs(x - from.x), Math.abs(y - from.y)) === r) ring.push({ x, y });
    for (let i = ring.length - 1; i > 0; i--) {
      const j = ctx.rng.rn2(i + 1);
      const t = ring[i] as Pos;
      ring[i] = ring[j] as Pos;
      ring[j] = t;
    }
    for (const p of ring) if (goodpos(ctx, level, rules, taken, p.x, p.y, mon)) return p;
  }
  return null;
}

/**
 * The nearest free square to `from` on `level` for monster `id` (which does not block itself), or
 * for a new monster of type `def` (no id). With neither, water and lava are never good.
 * ref: src/mon.c mnexto() / src/teleport.c enexto()
 */
export function mnextoPos(
  ctx: Ctx,
  level: Level,
  id: EntityId | null,
  from: Pos,
  def?: MonsterDef | null,
): Pos | null {
  const taken = occupiedSet(ctx, level);
  const self = id === null ? undefined : ctx.state.entities[String(id)]?.c.pos;
  if (self && self.level === level.id) taken.delete(cellIndex(level, self.x, self.y));
  // goodpos(): the hero's square is never free for a monster (an engulfer shares it)
  const hp = ctx.state.entities[String(ctx.state.playerId)]?.c.pos;
  if (id !== ctx.state.playerId && hp && hp.level === level.id)
    taken.add(cellIndex(level, hp.x, hp.y));
  const e = id === null || id === ctx.state.playerId ? undefined : ctx.state.entities[String(id)];
  const gm = e?.c.monster ? gpMon(ctx, e) : def ? gpMon(ctx, def) : null;
  return enexto(ctx, level, cellRules(level, ctx.defs), withBoulders(ctx, level, taken), from, gm);
}

/**
 * A random square for a new monster, out of the hero's sight.
 * ref: src/makemon.c makemon_rnd_goodpos(): 50 random tries, then a scan of the whole map
 * (first skipping visible squares, then not). Coordinates exclude the outermost columns/rows
 * like NetHack's rn1(COLNO-3, 2) / rn2(ROWNO).
 */
function randomGoodPos(
  ctx: Ctx,
  level: Level,
  rules: CellRules,
  taken: Set<number>,
  mon: GpMon | null,
): Pos | null {
  const sees = (x: number, y: number): boolean =>
    level.id === ctx.state.currentLevel && isVisible(ctx.state, cellIndex(level, x, y));
  let nx = 0;
  let ny = 0;
  for (let tries = 0; tries < 50; tries++) {
    nx = 1 + ctx.rng.rn2(Math.max(1, level.width - 3));
    ny = ctx.rng.rn2(level.height);
    if (!sees(nx, ny) && goodpos(ctx, level, rules, taken, nx, ny, mon)) return { x: nx, y: ny };
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let dx = 0; dx < level.width; dx++)
      for (let dy = 0; dy < level.height; dy++) {
        const x = (dx + nx) % level.width;
        const y = (dy + ny) % level.height;
        if (pass === 0 && sees(x, y)) continue;
        if (goodpos(ctx, level, rules, taken, x, y, mon)) return { x, y };
      }
  }
  return null;
}

export interface MakemonOpts {
  /** Level to create on; defaults to the hero's current level. */
  level?: LevelId;
  /** Never make a group (MM_NOGRP). */
  nogroup?: boolean;
  /** Make a group even though the type was given (random types always may). */
  group?: boolean;
  /** Start asleep (MM_ASLEEP). */
  asleep?: boolean;
  /** Always hostile (MM_ANGRY). */
  angry?: boolean;
  /** Use enexto() when the spot is taken (MM_ADJACENTOK). */
  adjacentOk?: boolean;
  /** No starting weapons, armor or gold (MM_NOINVENT). */
  noInventory?: boolean;
  /** Made while a level is being created (gi.in_mklev): snakes and spiders get an object. */
  inMklev?: boolean;
  /** A long worm gets no tail segments (MM_NOTAIL; it still grows one). */
  noTail?: boolean;
  /** No waiting strategy from its kind's M3 flags (MM_NOWAIT). */
  noWait?: boolean;
  /** The birth is not counted (MM_NOCOUNTBIRTH: revival, statue traps); a unique still becomes
   * extinct. */
  noCountBirth?: boolean;
  /** MM_FEMALE (true) or MM_MALE (false) for a kind that is neither male, female nor neuter. */
  female?: boolean;
  /**
   * The caller makes the monster a temple priest or a minion itself (MM_EPRI, MM_EMIN): an
   * aligned cleric or Angel gets no god of its own here.
   */
  extra?: 'epri' | 'emin';
}

type LevelObjectAt = (ctx: Ctx, at: { level: LevelId; x: number; y: number }) => void;
/** mkobj_at(RANDOM_CLASS, x, y, TRUE): mkobj.ts registers it (it sits above generation.ts) */
let levelObjectAt: LevelObjectAt | null = null;
export function setLevelObjectAt(fn: LevelObjectAt): void {
  levelObjectAt = fn;
}

type GiveWormTail = (ctx: Ctx, worm: EntityId, nsegs: number | 'random') => void;
/** worm.ts's giveWormTail() (worm.ts sits above generation.ts) */
let giveWormTail: GiveWormTail | null = null;
export function setGiveWormTail(fn: GiveWormTail): void {
  giveWormTail = fn;
}

type BirthNewcham = (ctx: Ctx, mon: Entity) => boolean;
/** newcham(mtmp, NULL, NO_NC_FLAGS) for a newborn shapeshifter (newcham.ts sits above this) */
let birthNewcham: BirthNewcham | null = null;
export function setMakemonNewcham(fn: BirthNewcham): void {
  birthNewcham = fn;
}

/**
 * Creates a monster; null def means a random type, null pos a random out-of-sight spot.
 * ref: src/makemon.c makemon(). New monsters have 0 movement (zeroed struct). Gender, items,
 * special-class setup and group chains of peaceful members follow only what applies here.
 */
export function makemon(
  ctx: Ctx,
  def: MonsterDef | null,
  pos: Pos | null,
  opts: MakemonOpts = {},
): EntityId | null {
  const level = getLevel(ctx.state, opts.level);
  const rules = cellRules(level, ctx.defs);
  const taken = occupiedSet(ctx, level);
  const anymon = def === null;

  // goodpos() for the given type (`fakemon`), or none for a random one: no water or lava
  const gm = def ? gpMon(ctx, def) : null;
  // goodpos()'s GP_AVOID_MONPOS: the exclusion areas count as taken (not for MON_AT() below)
  const avoid = withExclusions(ctx, level, taken);
  let at: Pos;
  if (pos === null) {
    const p = randomGoodPos(
      ctx,
      level,
      rules,
      withSokobanTraps(level, withBoulders(ctx, level, avoid)),
      gm,
    );
    if (!p) return null;
    at = p;
  } else if (taken.has(cellIndex(level, pos.x, pos.y))) {
    if (!opts.adjacentOk) return null;
    const p = enexto(ctx, level, rules, withBoulders(ctx, level, avoid), pos, gm);
    if (!p) return null;
    at = p;
  } else at = pos;
  if (!inBounds(level, at.x, at.y)) return null;

  // ref: makemon(): "if you are to make a specific monster and it has already been genocided,
  // return" (an extinct one is still made when asked for by name)
  if (def && isGenocided(ctx.state, def.id)) return null;
  let mdef = def;
  if (!mdef) {
    // ref: makemon(): "make a random (common) monster that can survive here" (special levels
    // ask for random monsters on water): up to 50 rndmonst() until goodpos() takes it; the spot
    // is free, and an explicit spot's boulder does not matter here (see withBoulders())
    let tryct = 0;
    do {
      mdef = rndmonst(ctx, level.depth, 0, 0, level);
      if (!mdef) return null;
    } while (++tryct <= 50 && !goodpos(ctx, level, rules, avoid, at.x, at.y, gpMon(ctx, mdef)));
  }
  if (!mdef) return null;
  // ref: makemon(): `(void) propagate(mndx, countbirth, FALSE)`: the birth counts from here on
  // (makemon() cannot fail past this point; a caller that rejects the monster uses unmakemon())
  propagate(ctx, mdef, opts.noCountBirth !== true);

  const ulevel = heroLevel(ctx);
  const mlev = adjLev(mdef, level.depth, ulevel);
  const hp = newmonhp(ctx, mlev, mdef.id);
  // ref: makemon(): `mtmp->female = femaleok ? rn2(2) : 0` for a kind that is neither male,
  // female nor neuter; drawn for the amorous demon only (DEVIATIONS "Monster generation")
  const femaleok = !['male', 'female', 'neuter'].some((f) => mdef.flags.includes(f));
  const female =
    femaleok &&
    (opts.female !== undefined ? opts.female : mdef.id === AMOROUS_DEMON && ctx.rng.rn2(2) === 1);
  const peaceful = opts.angry ? false : peaceMinded(ctx, mdef);
  const id = ctx.spawn({
    def: mdef.id,
    c: {
      pos: { level: level.id, x: at.x, y: at.y },
      actor: { energy: 0, speed: mdef.speed },
      hp: { cur: hp, max: hp },
      monster: { level: mlev, peaceful, asleep: opts.asleep === true, lastHero: null },
    },
  });

  // ref: makemon() switch (ptr->mlet): a mimic takes a disguise (set_mimic_sym()); snakes and
  // spiders made with the level get an object on their square and hide under it (hideunder()),
  // eels made with the level hide in their water,
  // the stalker and the black light are invisible for good, leprechauns sleep, jabberwocks and
  // nymphs 4 times in 5 (no Amulet), co-aligned unicorns are peaceful
  if (female) setMonFemale(ctx, id, true);
  const mon = ctx.state.entities[String(id)]?.c.monster;
  const mlet = mdef.glyph.ch;
  if (mlet === 'm') setMimicSym(ctx, id, opts.inMklev === true);
  else if ((mlet === 'S' || mlet === 's') && opts.inMklev) {
    if (!levelObjectAt) throw new Error('makemon: mkobj.ts has not registered mkobj_at()');
    levelObjectAt(ctx, { level: level.id, x: at.x, y: at.y });
    hideunder(ctx, id, true);
  } else if (isEel(mdef) && opts.inMklev) {
    hideunder(ctx, id, true); // S_EEL: `if (gi.in_mklev) (void) hideunder(mtmp);`
  } else if (mdef.id === 'nh:stalker' || mdef.id === 'nh:black_light') {
    // S_LIGHT, S_ELEMENTAL: `mtmp->perminvis = TRUE; mtmp->minvis = TRUE;`
    const e = ctx.state.entities[String(id)];
    if (e) setMinvis(ctx, e);
  } else if (mon && mlet === 'l') mon.asleep = true;
  else if (mon && (mlet === 'n' || mlet === 'J') && ctx.rng.rn2(5)) mon.asleep = true;
  // ref: makemon() S_ORC: `if (Race_if(PM_ELF)) mtmp->mpeaceful = FALSE`
  else if (mon && mlet === 'o' && raceIs(ctx.state, 'elf')) mon.peaceful = false;
  // ref: makemon() S_UNICORN: a unicorn of the hero's alignment is peaceful (MM_ANGRY too)
  else if (
    mon &&
    isUnicorn(mdef) &&
    Math.sign(uState(ctx.state).alignType) === Math.sign(mdef.alignment)
  )
    mon.peaceful = true;
  // ref: makemon() S_BAT: `if (Inhell && is_bat(ptr)) mon_adjust_speed(mtmp, 2, NULL)`, made
  // fast for good (no message)
  if (mon && isBat(mdef) && inHell(ctx.state, level)) setMspeed(ctx, id, 'fast');
  // ref: makemon(): `mtmp->cham = NON_PM`, unless it is a shapechanger (pm_to_cham()) and the
  // hero has no protection from shape changers: it keeps its kind in `cham` and newcham() picks
  // its first shape (Vlad stays himself); one born shifted gets no inventory (`allow_minvent`)
  let allowMinvent = opts.noInventory !== true;
  const mcham = protFromShapeChangers(ctx.state) ? null : pmToCham(mdef);
  if (mcham !== null) {
    setCham(ctx, id, mcham);
    const e = ctx.state.entities[String(id)];
    if (!birthNewcham) throw new Error('makemon: newcham.ts has not registered newcham()');
    if (mdef.id !== VLAD_THE_IMPALER && e && birthNewcham(ctx, e)) allowMinvent = false;
  }
  // ref: makemon(): `mndx == PM_GHOST && !(mmflags & MM_NONAME)`: christen_monst(rndghostname());
  // monsters have no names here, so only the rolls are drawn (DEVIATIONS.md "Special rooms")
  if (mdef.id === GHOST) rndghostname(ctx);
  // ref: makemon(): `mndx == PM_CROESUS`: `mitem = TWO_HANDED_SWORD`, given (mongets()) when
  // allow_minvent
  if (mdef.id === CROESUS && allowMinvent) mongets(ctx, id, 'nh:two_handed_sword');
  // ref: makemon(): `if (gi.in_mklev)`: minor demons, wumpuses, long worms and giant eels made with
  // the level sleep 4 times in 5 (no Amulet of Yendor here)
  if (mon && opts.inMklev && sleepsInMklev(mdef) && ctx.rng.rn2(5)) mon.asleep = true;
  // ref: makemon(): `mndx == PM_LONG_WORM && (mtmp->wormno = get_wormno()) != 0`:
  // initworm(mtmp, allowtail ? rn2(5) : 0), and the tail laid behind it
  if (mdef.id === 'nh:long_worm') {
    if (!giveWormTail) throw new Error('makemon: worm.ts has not registered giveWormTail()');
    giveWormTail(ctx, id, opts.noTail ? 0 : 'random');
  }
  // ref: makemon(): `is_dprince(ptr) && ptr->msound == MS_BRIBE`: Asmodeus and Baalzebub are born
  // peaceful and invisible for good, but not peaceful (nor tame) against a wielded Excalibur or
  // Demonbane (no mavenge)
  if (mon && isDprince(mdef) && mdef.sound === 'bribe') {
    mon.peaceful = true;
    const e = ctx.state.entities[String(id)];
    if (e) setMinvis(ctx, e);
    if (uWieldArt(ctx.state, 'nh:excalibur') || uWieldArt(ctx.state, 'nh:demonbane')) {
      mon.peaceful = false;
      delete mon.tame;
    }
  }
  // ref: makemon(): `mndx == PM_WIZARD_OF_YENDOR`: `mtmp->iswiz = TRUE; no_of_wizards++` (no
  // Earth level: never his spellbook of dig)
  if (mdef.id === WIZARD_OF_YENDOR) setIsWiz(ctx, id);
  // ref: makemon(): "it's possible to create an ordinary monster of some special types; make
  // sure their extended data is initialized to something sensible if caller hasn't specified
  // MM_EPRI|MM_EMIN": an aligned or high cleric becomes a roaming priest, an Angel 1 time in 3 a
  // minion, of a random god (no A_NONE), renegade 1 time in 3 (always with MM_ANGRY), peaceful
  // to a hero of its god unless renegade (and to another's only when renegade)
  const cleric = mdef.id === ALIGNED_CLERIC || mdef.id === HIGH_CLERIC;
  if (
    mon &&
    (cleric
      ? opts.extra === undefined
      : mdef.id === ANGEL && opts.extra !== 'emin' && !ctx.rng.rn2(3))
  ) {
    const minAlign = (ctx.rng.rn2(3) - 1) as Aligntyp;
    const renegade = opts.angry ? true : !ctx.rng.rn2(3);
    setEmin(ctx, id, { minAlign, renegade });
    mon.peaceful = minAlign === uState(ctx.state).alignType ? !renegade : renegade;
  }
  if ((anymon || opts.group === true) && !opts.nogroup) {
    if (mdef.group === 'small' && ctx.rng.rn2(2) === 0) initgrp(ctx, mdef, at, 3, opts, level.id);
    else if (mdef.group === 'large') {
      if (ctx.rng.rn2(3) !== 0) initgrp(ctx, mdef, at, 10, opts, level.id);
      else initgrp(ctx, mdef, at, 3, opts, level.id);
    }
  }
  // ref: makemon(): after any group, "equip with weapons / armor" (m_initweap, m_initinv,
  // m_dowear(creation))
  if (allowMinvent) givePossessions(ctx, id, level.depth, { inMklev: opts.inMklev === true });
  // ref: makemon(): `if (ptr->mflags3 && !(mmflags & MM_NOWAIT))`: M3_WAITFORU, M3_CLOSE, and
  // STRAT_APPEARMSG for those and the covetous kinds
  if (!opts.noWait) {
    const f = mdef.flags;
    const covetous = isCovetous(mdef);
    setStrat(
      ctx,
      id,
      ...(f.includes('waitforu') ? (['waitForU'] as const) : []),
      ...(f.includes('close') ? (['close'] as const) : []),
      ...(f.includes('waitforu') || f.includes('close') || covetous
        ? (['appearMsg'] as const)
        : []),
    );
  }
  return id;
}

const GHOST: DefId = 'nh:ghost';
/** ref: include/monsters.h PM_ALIGNED_CLERIC, PM_HIGH_CLERIC, PM_ANGEL */
const ALIGNED_CLERIC: DefId = 'nh:aligned_cleric';
const HIGH_CLERIC: DefId = 'nh:high_cleric';
const ANGEL: DefId = 'nh:angel';
const CROESUS: DefId = 'nh:croesus';
const ERINYS: DefId = 'nh:erinys';

/**
 * Some or all remaining erinyes around the hero: `limit` of them, or with 0 until the kind is
 * extinct (mk_gen_ok(PM_ERINYS, G_GONE, 0)). ref: src/makemon.c summon_furies()
 */
export function summonFuries(ctx: Ctx, limit: number): void {
  if (!ctx.defs.isMonster(ERINYS)) return;
  const at = getPlayer(ctx.state).c.pos;
  if (!at) return;
  let i = 0;
  while (!isGone(ctx.state, ERINYS) && (i < limit || !limit)) {
    const id = makemon(ctx, ctx.defs.monster(ERINYS), at, { adjacentOk: true, noWait: true });
    if (id === null && !limit) break; // no room left (C would try forever)
    i++;
  }
}

/** `is_ndemon(ptr) || mndx == PM_WUMPUS || mndx == PM_LONG_WORM || mndx == PM_GIANT_EEL` */
const sleepsInMklev = (def: MonsterDef): boolean =>
  isNdemon(def) || def.id === 'nh:wumpus' || def.id === 'nh:long_worm' || def.id === 'nh:giant_eel';

/** ref: src/do_name.c ghostnames[] */
const GHOSTNAMES: readonly string[] = [
  'Adri',
  'Andries',
  'Andreas',
  'Bert',
  'David',
  'Dirk',
  'Emile',
  'Frans',
  'Fred',
  'Greg',
  'Hether',
  'Jay',
  'John',
  'Jon',
  'Karnov',
  'Kay',
  'Kenny',
  'Kevin',
  'Maud',
  'Michiel',
  'Mike',
  'Peter',
  'Robert',
  'Ron',
  'Tom',
  'Wilmar',
  'Nick Danger',
  'Phoenix',
  'Jiro',
  'Mizue',
  'Stephan',
  'Lance Braccus',
  'Shadowhawk',
  'Murphy',
];

/**
 * A ghost's name: one of the ghost names six times in seven, else the hero's own (null here: the
 * port has no player name). ref: src/do_name.c rndghostname()
 */
export function rndghostname(ctx: Pick<Ctx, 'rng'>): string | null {
  return ctx.rng.rn2(7) ? (GHOSTNAMES[ctx.rng.rn2(GHOSTNAMES.length)] ?? null) : null;
}

/**
 * Extra members of a group around (x,y), each placed next to the previous one.
 * ref: src/makemon.c m_initgrp()
 */
function initgrp(
  ctx: Ctx,
  def: MonsterDef,
  at: Pos,
  n: number,
  opts: MakemonOpts,
  levelId: LevelId,
): void {
  const ul = heroLevel(ctx);
  let cnt = ctx.rng.rnd(n);
  cnt = Math.trunc(cnt / (ul < 3 ? 4 : ul < 5 ? 2 : 1));
  if (!cnt) cnt++;
  const level = getLevel(ctx.state, levelId);
  const rules = cellRules(level, ctx.defs);
  let mm = at;
  while (cnt-- > 0) {
    if (peaceMinded(ctx, def)) continue;
    const p = enexto(
      ctx,
      level,
      rules,
      withBoulders(ctx, level, occupiedSet(ctx, level)),
      mm,
      gpMon(ctx, def),
    );
    if (!p) continue;
    mm = p;
    makemon(ctx, def, p, { ...opts, level: levelId, nogroup: true, angry: true });
  }
}

/**
 * True when `modData.nh.debugMongen` is set: a debug switch (for tests) that stops random
 * monster generation; the 1 in 70 roll is still drawn. NetHack's flag stops every makemon();
 * here only the random spawns stop. ref: include/flag.h iflags.debug_mongen, src/makemon.c makemon()
 */
export function noMongen(state: Readonly<GameState>): boolean {
  const nh = state.modData['nh'] as { debugMongen?: boolean } | undefined;
  return nh?.debugMongen === true;
}

/**
 * Registers random spawning. (Level population is in mklev.ts, which fills each room.)
 */
export function registerGeneration(api: ModApi): void {
  // ref: src/allmain.c maybe_generate_rnd_mon()
  api.on('endOfTurn', (ctx) => {
    if (ctx.state.gameOver === null && ctx.rng.rn2(SPAWN_ODDS) === 0 && !noMongen(ctx.state))
      makemon(ctx, null, null);
  });
}
