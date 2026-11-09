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
  type EntityId,
  type GameState,
  type Level,
  type LevelId,
  type ModApi,
  type MonsterDef,
  type Pos,
} from '@nh/core';
import { boulderCells } from './boulder';
import { isSokoban } from './sokoban';
import { givePossessions } from './mongear';
import { uState } from './luck';
import { isGenocided } from './vanquished';
import { hideunder } from './hide';
import { setMimicSym } from './mimicstate';

/**
 * The stub hero is a neutral human Valkyrie; neutral is alignment type 0 and the Valkyrie's
 * initial alignment record is 0 (it never changes in this port).
 * ref: src/role.c roles[] Valkyrie initrecord 0; include/align.h A_NEUTRAL
 */
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
 * ref: src/makemon.c uncommon(): not randomly generated (nogen/unique), genocided (G_GONE; no
 * extinction), or Gehennom-only ('hell' genFlag). We are never in Gehennom.
 */
function uncommon(state: Readonly<GameState>, def: MonsterDef): boolean {
  return (
    def.genFlags.includes('nogen') ||
    def.genFlags.includes('uniq') ||
    isGenocided(state, def.id) ||
    def.genFlags.includes('hell')
  );
}

/** ref: src/makemon.c align_shift(): the Dungeons of Doom are unaligned (AM_NONE), so 0. */
function alignShift(_def: MonsterDef): number {
  return 0;
}

/**
 * A random monster type appropriate for a level of difficulty `depth` (and the hero's level),
 * its difficulty window moved by `minadj`/`maxadj` (rndmonst_adj(); 0, 0 is rndmonst()).
 * ref: src/makemon.c rndmonst_adj() weighted reservoir sampling; returns null if none qualify.
 */
export function rndmonst(
  ctx: Pick<Ctx, 'state' | 'rng' | 'defs'>,
  depth: number,
  minadj = 0,
  maxadj = 0,
): MonsterDef | null {
  const minmlev = monminDifficulty(depth) + minadj;
  const maxmlev = monmaxDifficulty(depth, heroLevel(ctx)) + maxadj;
  let total = 0;
  let selected: MonsterDef | null = null;
  for (const def of ctx.defs.monsters) {
    if (def.difficulty < minmlev || def.difficulty > maxmlev) continue; // montooweak/strong
    if (uncommon(ctx.state, def)) continue;
    const weight = def.frequency + alignShift(def);
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
 * ('nogen' for special levels, as G_NOGEN); genocided species are skipped (mk_gen_ok()'s G_GONE,
 * no extinction), and no level is in Gehennom. ref: src/makemon.c mkclass(), mkclass_aligned() with A_NONE
 */
export function mkclass(
  ctx: Pick<Ctx, 'state' | 'rng' | 'defs'>,
  cls: string,
  depth: number,
  allow: readonly string[] = [],
): MonsterDef | null {
  const list = ctx.defs.monsters
    .filter((m) => m.glyph.ch === cls)
    .map((m, i) => ({ m, i }))
    .sort((a, b) => a.m.difficulty - b.m.difficulty || a.i - b.i)
    .map(({ m }) => m);
  const maxmlev = depth >> 1;
  const ulevel = heroLevel(ctx);
  const zeroFreq = list.every((m) => m.frequency === 0);
  const nums: number[] = list.map(() => 0);
  let num = 0;
  for (let last = 0; last < list.length; last++) {
    const m = list[last] as MonsterDef;
    const mask = ['nogen', 'uniq'];
    if (ctx.rng.rn2(9) || cls === 'L') mask.push('hell');
    if (isGenocided(ctx.state, m.id)) continue; // mk_gen_ok(): mvflags & G_GONE
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

/** ref: src/makemon.c adj_lev() */
export function adjLev(def: MonsterDef, depth: number, ulevel: number): number {
  let tmp = def.level;
  let tmp2 = depth - tmp;
  if (tmp2 < 0) tmp--;
  else tmp += Math.trunc(tmp2 / 5);
  tmp2 = ulevel - def.level;
  if (tmp2 > 0) tmp += Math.trunc(tmp2 / 4);
  tmp2 = Math.trunc((3 * def.level) / 2);
  return tmp > tmp2 ? tmp2 : tmp > 0 ? tmp : 0;
}

/** ref: src/makemon.c newmonhp() (ordinary monsters only; no golems, dragons, riders). */
export function newmonhp(ctx: Ctx, mlev: number): number {
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
 * ref: src/makemon.c peace_minded(). Race: human hates gnomes and orcs, loves nothing.
 * Not ported: minions, quest/guardian sounds, Amulet, Erinys.
 */
export function peaceMinded(ctx: Ctx, def: MonsterDef): boolean {
  if (def.flags.includes('peaceful')) return true;
  if (def.flags.includes('hostile')) return false;
  if (def.flags.includes('gnome') || def.flags.includes('orc')) return false;
  const mal = def.alignment;
  const u = uState(ctx.state);
  if (Math.sign(mal) !== Math.sign(u.alignType)) return false;
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

/** ref: src/teleport.c goodpos(): passable, not a closed door, nobody (and no boulder) there. */
function goodpos(
  level: Level,
  rules: CellRules,
  taken: Set<number>,
  x: number,
  y: number,
): boolean {
  if (!inBounds(level, x, y)) return false;
  const i = cellIndex(level, x, y);
  const t = level.cells[i] ?? 0;
  return rules.passable[t] === true && !rules.closedDoor[t] && !taken.has(i);
}

/**
 * A random free square on `level` for a monster arriving there (a migrating monster).
 * ref: src/teleport.c rloc(): 50 random tries of `rnd(COLNO - 1), rn2(ROWNO)`, then every
 * candidate square in a shuffled order; null when the level is full.
 */
export function rlocPos(ctx: Ctx, level: Level): Pos | null {
  const rules = cellRules(level, ctx.defs);
  const taken = withBoulders(ctx, level, occupiedSet(ctx, level));
  for (let tries = 0; tries < 50; tries++) {
    const x = ctx.rng.rnd(level.width - 1);
    const y = ctx.rng.rn2(level.height);
    if (goodpos(level, rules, taken, x, y)) return { x, y };
  }
  const candy: Pos[] = [];
  for (let x = 0; x < level.width; x++)
    for (let y = 0; y < level.height; y++)
      if (goodpos(level, rules, taken, x, y)) candy.push({ x, y });
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
    for (const p of ring) if (goodpos(level, rules, taken, p.x, p.y)) return p;
  }
  return null;
}

/**
 * The nearest free square to `from` on `level` for monster `id` (which does not block itself).
 * ref: src/mon.c mnexto() / src/teleport.c enexto()
 */
export function mnextoPos(ctx: Ctx, level: Level, id: EntityId | null, from: Pos): Pos | null {
  const taken = occupiedSet(ctx, level);
  const self = id === null ? undefined : ctx.state.entities[String(id)]?.c.pos;
  if (self && self.level === level.id) taken.delete(cellIndex(level, self.x, self.y));
  // goodpos(): the hero's square is never free for a monster (an engulfer shares it)
  const hp = ctx.state.entities[String(ctx.state.playerId)]?.c.pos;
  if (id !== ctx.state.playerId && hp && hp.level === level.id)
    taken.add(cellIndex(level, hp.x, hp.y));
  return enexto(ctx, level, cellRules(level, ctx.defs), withBoulders(ctx, level, taken), from);
}

/**
 * A random square for a new monster, out of the hero's sight.
 * ref: src/makemon.c makemon_rnd_goodpos(): 50 random tries, then a scan of the whole map
 * (first skipping visible squares, then not). Coordinates exclude the outermost columns/rows
 * like NetHack's rn1(COLNO-3, 2) / rn2(ROWNO).
 */
function randomGoodPos(ctx: Ctx, level: Level, rules: CellRules, taken: Set<number>): Pos | null {
  const sees = (x: number, y: number): boolean =>
    level.id === ctx.state.currentLevel && isVisible(ctx.state, cellIndex(level, x, y));
  let nx = 0;
  let ny = 0;
  for (let tries = 0; tries < 50; tries++) {
    nx = 1 + ctx.rng.rn2(Math.max(1, level.width - 3));
    ny = ctx.rng.rn2(level.height);
    if (!sees(nx, ny) && goodpos(level, rules, taken, nx, ny)) return { x: nx, y: ny };
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let dx = 0; dx < level.width; dx++)
      for (let dy = 0; dy < level.height; dy++) {
        const x = (dx + nx) % level.width;
        const y = (dy + ny) % level.height;
        if (pass === 0 && sees(x, y)) continue;
        if (goodpos(level, rules, taken, x, y)) return { x, y };
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
}

type LevelObjectAt = (ctx: Ctx, at: { level: LevelId; x: number; y: number }) => void;
/** mkobj_at(RANDOM_CLASS, x, y, TRUE): mkobj.ts registers it (it sits above generation.ts) */
let levelObjectAt: LevelObjectAt | null = null;
export function setLevelObjectAt(fn: LevelObjectAt): void {
  levelObjectAt = fn;
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

  let at: Pos;
  if (pos === null) {
    const p = randomGoodPos(
      ctx,
      level,
      rules,
      withSokobanTraps(level, withBoulders(ctx, level, taken)),
    );
    if (!p) return null;
    at = p;
  } else if (taken.has(cellIndex(level, pos.x, pos.y))) {
    if (!opts.adjacentOk) return null;
    const p = enexto(ctx, level, rules, withBoulders(ctx, level, taken), pos);
    if (!p) return null;
    at = p;
  } else at = pos;
  if (!inBounds(level, at.x, at.y)) return null;

  // ref: makemon(): "if you are to make a specific monster and it has already been genocided,
  // return"
  if (def && isGenocided(ctx.state, def.id)) return null;
  const mdef = def ?? rndmonst(ctx, level.depth);
  if (!mdef) return null;

  const ulevel = heroLevel(ctx);
  const mlev = adjLev(mdef, level.depth, ulevel);
  const hp = newmonhp(ctx, mlev);
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
  // leprechauns sleep, nymphs 4 times in 5 (no Amulet)
  const mon = ctx.state.entities[String(id)]?.c.monster;
  const mlet = mdef.glyph.ch;
  if (mlet === 'm') setMimicSym(ctx, id, opts.inMklev === true);
  else if ((mlet === 'S' || mlet === 's') && opts.inMklev) {
    if (!levelObjectAt) throw new Error('makemon: mkobj.ts has not registered mkobj_at()');
    levelObjectAt(ctx, { level: level.id, x: at.x, y: at.y });
    hideunder(ctx, id, true);
  } else if (mon && mlet === 'l') mon.asleep = true;
  else if (mon && mlet === 'n' && ctx.rng.rn2(5)) mon.asleep = true;
  // ref: makemon(): `mndx == PM_GHOST && !(mmflags & MM_NONAME)`: christen_monst(rndghostname());
  // monsters have no names here, so only the rolls are drawn (DEVIATIONS.md "Special rooms")
  if (mdef.id === GHOST) rndghostname(ctx);
  if ((anymon || opts.group === true) && !opts.nogroup) {
    if (mdef.group === 'small' && ctx.rng.rn2(2) === 0) initgrp(ctx, mdef, at, 3, opts, level.id);
    else if (mdef.group === 'large') {
      if (ctx.rng.rn2(3) !== 0) initgrp(ctx, mdef, at, 10, opts, level.id);
      else initgrp(ctx, mdef, at, 3, opts, level.id);
    }
  }
  // ref: makemon(): after any group, "equip with weapons / armor" (m_initweap, m_initinv,
  // m_dowear(creation))
  if (!opts.noInventory) givePossessions(ctx, id, level.depth);
  return id;
}

const GHOST: DefId = 'nh:ghost';

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
    const p = enexto(ctx, level, rules, withBoulders(ctx, level, occupiedSet(ctx, level)), mm);
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
