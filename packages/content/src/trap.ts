// Traps: arrow, dart, falling rock, squeaky board, bear trap, sleeping gas, rust, trap door and
// hole. ref: include/trap.h, include/defsym.h, src/trap.c maketrap(), dotrap(), mintrap(),
// trapeffect_*(), fall_through(), thitm(), m_harmless_trap(), src/mondata.c mons_see_trap(),
// src/teleport.c mlevel_tele_trap(), src/hack.c trapmove(), src/pager.c doidtrap()
import {
  DIRS,
  DIR_LIST,
  NORMAL_SPEED,
  cellIndex,
  dungeonLayout,
  levelIdFor,
  rootDungeon,
  type GameState,
  type LevelId,
  cellRules,
  getLevel,
  getPlayer,
  inBounds,
  isVisible,
  sortedIds,
  trapAt,
  type ActionDef,
  type Ctx,
  type DefId,
  type Dir,
  type Entity,
  type EntityId,
  type Level,
  type LevelChange,
  type ModApi,
  type Msg,
  type Pos,
  type Trap,
  type TrapDef,
} from '@nh/core';
import { poisoned } from './attrib';
import { dmgval, dmgvalSized } from './dmgval';
import { setWoundedLegs } from './legs';
import { wakeNearto } from './noise';
import { erodeObj, type ErodeResult } from './erode';
import { rlocPos } from './generation';
import { ustuck } from './hackmove';
import { losehp } from './hp';
import { nomulNow } from './hunger';
import { mksobj, placeOnFloor } from './items';
import { lookHere } from './itemactions';
import { isCrackable, isMetallic, isRustprone } from './material';
import { monkilled } from './mondeath';
import { monWep, whichArmor } from './mongear';
import { clearPath } from './clearpath';
import { isFrozen, paralyzeMonst } from './mstate';
import { doname, xnameOf } from './objnam';
import { monNam } from './perception';
import { P, hasProp } from './props';
import { findAc, findMac } from './stats';
import {
  forgetMonTraps,
  isMtrapped,
  monKnowsTraps,
  monLearnsTraps,
  setMtrapped,
  setUtrap,
  trapTable,
  utrap,
} from './trapstate';

/** The vanilla trap ids. */
export const TRAP = {
  arrow: 'nh:arrow_trap',
  dart: 'nh:dart_trap',
  rock: 'nh:falling_rock_trap',
  squeaky: 'nh:squeaky_board',
  bear: 'nh:bear_trap',
  sleepGas: 'nh:sleeping_gas_trap',
  rust: 'nh:rust_trap',
  trapdoor: 'nh:trap_door',
  hole: 'nh:hole',
} as const;

// Colors as in include/color.h (HI_METAL = CYAN, HI_ZAP = BRIGHT_BLUE).
const CYAN = '#33bbbb';
const GRAY = '#aaaaaa';
const BROWN = '#aa5500';
const BLUE = '#4466ff';
const BRIGHT_BLUE = '#5555ff';

/** ref: include/defsym.h S_arrow_trap .. S_trap_door */
export const TRAPS: readonly TrapDef[] = [
  { id: TRAP.arrow, nameKey: TRAP.arrow, glyph: { ch: '^', fg: CYAN } },
  { id: TRAP.dart, nameKey: TRAP.dart, glyph: { ch: '^', fg: CYAN } },
  { id: TRAP.rock, nameKey: TRAP.rock, glyph: { ch: '^', fg: GRAY } },
  { id: TRAP.squeaky, nameKey: TRAP.squeaky, glyph: { ch: '^', fg: BROWN } },
  { id: TRAP.bear, nameKey: TRAP.bear, glyph: { ch: '^', fg: CYAN } },
  { id: TRAP.sleepGas, nameKey: TRAP.sleepGas, glyph: { ch: '^', fg: BRIGHT_BLUE } },
  { id: TRAP.rust, nameKey: TRAP.rust, glyph: { ch: '^', fg: BLUE } },
  { id: TRAP.trapdoor, nameKey: TRAP.trapdoor, glyph: { ch: '^', fg: BROWN }, hole: true },
  { id: TRAP.hole, nameKey: TRAP.hole, glyph: { ch: '^', fg: BROWN }, hole: true },
];

/** ref: include/trap.h is_hole() */
export const isHole = (def: DefId): boolean => def === TRAP.trapdoor || def === TRAP.hole;

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const trapName = (t: Trap): string => `@${t.def}`;

/** Per-trap data: the squeaky board's note (tnote) and a hole's destination depth (dst). */
interface TrapData {
  tnote?: number;
  dst?: number;
}

function dataOf(t: Trap): TrapData {
  const d = t.data;
  if (d === null || d === undefined || typeof d !== 'object' || Array.isArray(d)) return {};
  const out: TrapData = {};
  if (typeof d['tnote'] === 'number') out.tnote = d['tnote'];
  if (typeof d['dst'] === 'number') out.dst = d['dst'];
  return out;
}

/**
 * The bottom of a dungeon without one for holes and trap doors. NetHack's Dungeons of Doom has
 * `rn1(5, 25)` levels (dat/dungeon.lua base 25, range 5) with the Castle at the bottom; this
 * port's main dungeon is endless and uses the smallest of those, 25 (see DEVIATIONS.md). Stairs
 * still lead deeper.
 */
export const DUNGEON_BOTTOM = 25;

/**
 * The last level holes lead to in `level`'s dungeon: its last level, or for an endless dungeon
 * DUNGEON_BOTTOM (one below `level` once past it). ref: src/trap.c dng_bottom()
 */
export function dungeonBottom(state: Readonly<GameState>, level: Readonly<Level>): number {
  const n = dungeonLayout(state, level.dungeon).levels;
  return n ?? Math.max(DUNGEON_BOTTOM, level.dlevel + 1);
}

/**
 * Whether one can fall through the floor of `level`: not on its dungeon's last level (or
 * DUNGEON_BOTTOM and below for an endless one). ref: src/dungeon.c Can_fall_thru()
 */
export const canFallThru = (state: Readonly<GameState>, level: Readonly<Level>): boolean =>
  level.dlevel < (dungeonLayout(state, level.dungeon).levels ?? DUNGEON_BOTTOM);

/**
 * The level number in its dungeon that a hole or trap door on `level` leads to: the next level,
 * and one more each time 1 in 4 comes up, never past the bottom.
 * ref: src/trap.c hole_destination(), dng_bottom()
 */
export function holeDestination(ctx: Pick<Ctx, 'rng' | 'state'>, level: Readonly<Level>): number {
  const bottom = dungeonBottom(ctx.state, level);
  let d = level.dlevel;
  while (d < bottom) {
    d++;
    if (ctx.rng.rn2(4) !== 0) break;
  }
  return d;
}

/** A note no other squeaky board on the level uses, if any. ref: src/trap.c choose_trapnote() */
function chooseTrapnote(ctx: Pick<Ctx, 'rng'>, level: Level, x: number, y: number): number {
  const used = new Set<number>();
  for (const t of level.traps) {
    if (t.def !== TRAP.squeaky || (t.x === x && t.y === y)) continue;
    const n = dataOf(t).tnote;
    if (n !== undefined) used.add(n);
  }
  const pick: number[] = [];
  for (let k = 0; k < 12; k++) if (!used.has(k)) pick.push(k);
  return pick.length > 0 ? (pick[ctx.rng.rn2(pick.length)] ?? 0) : ctx.rng.rn2(12);
}

/**
 * Makes a trap of type `def` at (x, y) of `levelId`: holes are always seen, squeaky boards get
 * a note, holes and trap doors a destination. Returns the trap as stored.
 * ref: src/trap.c maketrap() (the parts for our trap types)
 */
export function maketrap(ctx: Ctx, levelId: string, x: number, y: number, def: DefId): Trap {
  const level = getLevel(ctx.state, levelId);
  const old = trapAt(level, x, y);
  // ref: maketrap(): a hero caught in a bear trap that is replaced by another kind is let go
  const hp = getPlayer(ctx.state).c.pos;
  if (old && def !== TRAP.bear && hp?.level === levelId && hp.x === x && hp.y === y)
    setUtrap(ctx, 0, 'beartrap');
  const t: Trap = { def, x, y, seen: def === TRAP.hole }; // unhideable_trap()
  if (def === TRAP.squeaky) t.data = { tnote: chooseTrapnote(ctx, level, x, y) };
  else if (isHole(def)) t.data = { dst: holeDestination(ctx, level) };
  ctx.placeTrap(levelId, t);
  return trapAt(level, x, y) ?? t;
}

/** The trap in state (the core keeps its own copy). */
const liveTrap = (ctx: Ctx, levelId: string, t: Pick<Trap, 'x' | 'y'>): Trap | undefined => {
  const level = ctx.state.levels[levelId];
  return level ? trapAt(level, t.x, t.y) : undefined;
};

/** ref: src/trap.c seetrap(), feeltrap() */
const seetrap = (t: Trap): void => {
  t.seen = true;
};

/** ref: src/trap.c deltrap() */
const deltrap = (ctx: Ctx, levelId: string, t: Trap): void =>
  ctx.removeTrap(levelId, { x: t.x, y: t.y });

const heroEnt = (ctx: Ctx): Entity => getPlayer(ctx.state);

const heroPos = (ctx: Ctx): { level: string; x: number; y: number } => {
  const p = heroEnt(ctx).c.pos;
  if (!p) throw new Error('Player has no position');
  return p;
};

/** ref: cansee(x, y) on the current level */
function cansee(ctx: Ctx, levelId: string, x: number, y: number): boolean {
  const level = ctx.state.levels[levelId];
  return (
    levelId === ctx.state.currentLevel &&
    !!level &&
    inBounds(level, x, y) &&
    isVisible(ctx.state, cellIndex(level, x, y))
  );
}

/** ref: canseemon(): the monster's square is in view (there is no invisibility here) */
function canseemon(ctx: Ctx, mon: Entity): boolean {
  const p = mon.c.pos;
  return !!p && cansee(ctx, p.level, p.x, p.y);
}

/** ref: t_missile(): one arrow, dart or rock, made with mksobj(otyp, TRUE, FALSE) */
function tMissile(ctx: Ctx, otyp: DefId): Entity {
  const id = mksobj(ctx, ctx.defs.object(otyp), { quantity: 1 });
  const e = ctx.state.entities[String(id)];
  if (!e) throw new Error('t_missile: no object');
  return e;
}

/** Drops a missile on the floor (place_object() and stackobj()). */
const dropAt = (ctx: Ctx, obj: Entity, levelId: string, x: number, y: number): void =>
  void placeOnFloor(ctx, obj.id, levelId, x, y);

// ---------------------------------------------------------------------------------------------
// the hero

/** ref: src/zap.c exclam() */
const exclam = (force: number): string => (force < 0 ? '?' : force <= 4 ? '.' : '!');

/**
 * A trap's missile may hit the hero. ref: src/mthrowu.c thitu() with a name ("arrow",
 * "little dart"): `u.uac + tlev <= rnd(20)` misses ("misses you" by 2 or more, else "almost
 * hit"); a hit costs `dam` hit points.
 */
function thituNamed(ctx: Ctx, tlev: number, dam: number, name: string, killer: string): boolean {
  const uac = findAc(ctx.state, ctx.defs, ctx.state.playerId);
  const dieroll = ctx.rng.rnd(20);
  const obj = { key: `trap.missile.${name}` };
  if (uac + tlev <= dieroll) {
    say(ctx, uac + tlev <= dieroll - 2 ? 'trap.thitu.miss' : 'trap.thitu.almost', { obj });
    return false;
  }
  say(ctx, 'trap.thitu.hit', { obj, ex: exclam(dam) });
  losehp(ctx, dam, killer);
  return true;
}

function arrowTrapYou(ctx: Ctx, levelId: string, trap: Trap): void {
  if (trap.once && trap.seen && ctx.rng.rn2(15) === 0) {
    say(ctx, 'trap.arrow.click');
    deltrap(ctx, levelId, trap);
    return;
  }
  trap.once = true;
  seetrap(trap);
  say(ctx, 'trap.arrow.shoots');
  const otmp = tMissile(ctx, 'nh:arrow');
  const dam = dmgvalSized(ctx.rng, otmp, ctx.defs.object(otmp.def), false);
  if (thituNamed(ctx, 8, dam, 'arrow', '@killer.trap.arrow')) ctx.remove(otmp.id);
  else dropAt(ctx, otmp, levelId, trap.x, trap.y);
}

function dartTrapYou(ctx: Ctx, levelId: string, trap: Trap): void {
  if (trap.once && trap.seen && ctx.rng.rn2(15) === 0) {
    say(ctx, 'trap.dart.click');
    deltrap(ctx, levelId, trap);
    return;
  }
  trap.once = true;
  seetrap(trap);
  say(ctx, 'trap.dart.shoots');
  const otmp = tMissile(ctx, 'nh:dart');
  // the dart object cannot carry poison (no opoisoned yet); the roll decides the hit's poison
  const poisonedDart = ctx.rng.rn2(6) === 0;
  const dam = dmgvalSized(ctx.rng, otmp, ctx.defs.object(otmp.def), false);
  if (thituNamed(ctx, 7, dam, 'little_dart', '@killer.trap.little_dart')) {
    if (poisonedDart && !ctx.state.gameOver)
      poisoned(ctx, { key: 'trap.dart.poisoned' }, 'con', '@killer.trap.little_dart', 10, true);
    ctx.remove(otmp.id);
  } else dropAt(ctx, otmp, levelId, trap.x, trap.y);
}

function rockTrapYou(ctx: Ctx, levelId: string, trap: Trap): void {
  if (trap.once && trap.seen && ctx.rng.rn2(15) === 0) {
    say(ctx, 'trap.rock.nothing');
    deltrap(ctx, levelId, trap);
    return;
  }
  let dmg = ctx.rng.d(2, 6);
  trap.once = true;
  seetrap(trap);
  const otmp = tMissile(ctx, 'nh:rock');
  say(ctx, 'trap.rock.falls', { obj: xnameOf(ctx.state, ctx.defs, otmp) });
  const uarmh = whichArmor(ctx, ctx.state.playerId, 'helm');
  if (uarmh) {
    const hdef = ctx.defs.object(uarmh.def);
    if (isMetallic(hdef) || isCrackable(hdef)) {
      // ref: do_wear.c hard_helmet()
      say(ctx, 'trap.rock.hard_helmet');
      dmg = 2;
    } else say(ctx, 'trap.rock.no_protect', { obj: xnameOf(ctx.state, ctx.defs, uarmh) });
  }
  dropAt(ctx, otmp, levelId, trap.x, trap.y);
  losehp(ctx, dmg, '@killer.trap.falling_rock');
}

const noteOf = (ctx: Ctx, level: Level, trap: Trap): Msg => {
  let n = dataOf(trap).tnote;
  if (n === undefined) {
    // a trap placed without maketrap(): give it its note now
    n = chooseTrapnote(ctx, level, trap.x, trap.y);
    trap.data = { tnote: n };
  }
  return { key: `trap.note.${n}` };
};

function squeakyYou(ctx: Ctx, levelId: string, trap: Trap): void {
  seetrap(trap);
  say(ctx, 'trap.squeak.you', { note: noteOf(ctx, getLevel(ctx.state, levelId), trap) });
  // ref: src/mon.c wake_nearby(): u.ulevel * 20
  const p = heroPos(ctx);
  wakeNearto(ctx, p.x, p.y, (heroEnt(ctx).c.experience?.level ?? 1) * 20);
}

/** ref: src/trap.c wearing_iron_shoes() */
function ironShoes(ctx: Ctx, id: EntityId): Entity | null {
  const boots = whichArmor(ctx, id, 'boots');
  return boots && ctx.defs.object(boots.def).material === 'iron' ? boots : null;
}

function bearTrapYou(ctx: Ctx, trap: Trap): void {
  const dmg = ctx.rng.d(2, 4);
  seetrap(trap); // feeltrap()
  // the hero is never small, amorphous, whirly or unsolid (no polymorph)
  setUtrap(ctx, ctx.rng.rn2(4) + 4, 'beartrap'); // rn1(4, 4)
  say(ctx, 'trap.bear.closes');
  const boots = ironShoes(ctx, ctx.state.playerId);
  if (boots) say(ctx, 'trap.bear.protects', { obj: xnameOf(ctx.state, ctx.defs, boots) });
  else {
    ctx.rng.rn2(2); // RIGHT_SIDE : LEFT_SIDE (only the right leg is tracked)
    setWoundedLegs(ctx, ctx.rng.rn2(10) + 10); // rn1(10, 10)
    losehp(ctx, dmg, '@killer.trap.bear_trap');
  }
}

function sleepGasYou(ctx: Ctx, trap: Trap): void {
  seetrap(trap);
  if (hasProp(heroEnt(ctx), P.SLEEP_RES)) say(ctx, 'trap.gas.enveloped');
  else {
    say(ctx, 'trap.gas.sleep');
    // ref: src/timeout.c fall_asleep(-rnd(25), TRUE)
    nomulNow(ctx, ctx.rng.rnd(25), 'helpless.asleep', { key: 'eat.wake_up' });
  }
}

/**
 * Gets an item wet. ref: src/trap.c water_damage() with `force`: the luck check is skipped.
 * Only the erosion branch is ported (scrolls, potions, spellbooks and containers are spared).
 */
function waterDamage(ctx: Ctx, obj: Entity | null): ErodeResult {
  if (!obj) return 'nothing';
  const def = ctx.defs.object(obj.def);
  if (
    def.class === 'scroll' ||
    def.class === 'potion' ||
    def.class === 'spellbook' ||
    def.container
  )
    return 'nothing';
  return erodeObj(ctx, obj, null, 'rust');
}

/** The hero's wielded weapon (uwep). */
const uwep = (ctx: Ctx): Entity | null => monWep(ctx, ctx.state.playerId);

function rustTrapYou(ctx: Ctx, trap: Trap): void {
  seetrap(trap);
  const id = ctx.state.playerId;
  const gloves = (): void => void waterDamage(ctx, whichArmor(ctx, id, 'gloves'));
  switch (ctx.rng.rn2(5)) {
    case 0:
      say(ctx, 'trap.rust.head');
      waterDamage(ctx, whichArmor(ctx, id, 'helm'));
      break;
    case 1: {
      say(ctx, 'trap.rust.left_arm');
      if (waterDamage(ctx, whichArmor(ctx, id, 'shield')) !== 'nothing') break;
      const w = uwep(ctx);
      if (w && ctx.defs.object(w.def).weapon?.bimanual) waterDamage(ctx, w);
      gloves();
      break;
    }
    case 2:
      say(ctx, 'trap.rust.right_arm');
      waterDamage(ctx, uwep(ctx));
      gloves();
      break;
    default:
      say(ctx, 'trap.rust.body');
      waterDamage(
        ctx,
        whichArmor(ctx, id, 'cloak') ?? whichArmor(ctx, id, 'body') ?? whichArmor(ctx, id, 'shirt'),
      );
  }
}

/**
 * The hero falls through a trap door or hole. ref: src/trap.c fall_through(TRUE, ...) and
 * src/do.c goto_level() (u_on_rndspot(), the fall damage `d(max(dist, 1), 6)`, pickup(1)).
 * `plunged` is TOOKPLUNGE (the hero jumped in with '>').
 */
function fallThrough(ctx: Ctx, levelId: string, trap: Trap, plunged: boolean): void {
  seetrap(trap);
  if (!plunged) say(ctx, trap.def === TRAP.trapdoor ? 'trap.door.opens' : 'trap.hole.gaping');
  if (ustuck(ctx) !== null) {
    // ref: fall_through(): `Levitation || u.ustuck || ...` -> "You don't fall in."
    say(ctx, 'trap.dont_fall');
    return;
  }
  const level = getLevel(ctx.state, levelId);
  let dst = dataOf(trap).dst;
  if (dst === undefined || dst <= level.dlevel) {
    // a trap placed without maketrap(): its destination is rolled now
    dst = holeDestination(ctx, level);
    trap.data = { dst };
  }
  if (dst <= level.dlevel) {
    // the bottom level of its dungeon (ref: fall_through(): !Can_fall_thru() -> "don't fall in")
    say(ctx, 'trap.dont_fall');
    return;
  }
  const dist = dst - level.dlevel;
  if (dist > 1)
    say(ctx, dist > 3 ? 'trap.shaft_very_deep' : dist > 2 ? 'trap.shaft_deep' : 'trap.shaft');
  ctx.goToLevel({ dungeon: level.dungeon, dlevel: dst }, 'random');
  losehp(ctx, ctx.rng.d(Math.max(dist, 1), 6), '@killer.trap.mine_shaft');
  if (!ctx.state.gameOver) lookHere(ctx);
}

/** Monsters that see a trap go off learn about that kind. ref: src/mondata.c mons_see_trap() */
export function monsSeeTrap(ctx: Ctx, levelId: string, trap: Trap): void {
  const level = ctx.state.levels[levelId];
  if (!level) return;
  const opaque = cellRules(level, ctx.defs).opaque;
  const maxdist = level.lit[cellIndex(level, trap.x, trap.y)] ? 7 * 7 : 2;
  for (const id of sortedIds(ctx.state)) {
    const mon = ctx.state.entities[String(id)];
    const p = mon?.c.pos;
    if (!mon?.c.monster || !p || p.level !== levelId) continue;
    const def = ctx.defs.monster(mon.def);
    if (def.flags.includes('animal') || def.flags.includes('mindless')) continue;
    if (def.flags.includes('noeyes')) continue; // !haseyes()
    if ((p.x - trap.x) ** 2 + (p.y - trap.y) ** 2 > maxdist) continue;
    if (!clearPath(level, opaque, p.x, p.y, trap.x, trap.y)) continue; // m_cansee()
    monLearnsTraps(ctx, id, trap.def);
  }
}

/**
 * The hero sets off the trap she is standing on. ref: src/trap.c dotrap(): a seen trap is
 * escaped one time in five ("You escape a bear trap."), unless she jumped into a hole on
 * purpose (`plunged`) or the trap is forced on her (`force`: FORCETRAP, e.g. a wand of locking).
 * The hero never flies, levitates or fumbles.
 */
export function dotrap(
  ctx: Ctx,
  trap: Trap,
  opts: { plunged?: boolean; force?: boolean } = {},
): void {
  const levelId = heroPos(ctx).level;
  const t = liveTrap(ctx, levelId, trap) ?? trap;
  ctx.interrupt(); // nomul(0)
  if (t.seen && !opts.plunged && !opts.force && ctx.rng.rn2(5) === 0) {
    say(ctx, 'trap.escape', { trap: trapName(t) });
    return;
  }
  monsSeeTrap(ctx, levelId, t);
  switch (t.def) {
    case TRAP.arrow:
      return arrowTrapYou(ctx, levelId, t);
    case TRAP.dart:
      return dartTrapYou(ctx, levelId, t);
    case TRAP.rock:
      return rockTrapYou(ctx, levelId, t);
    case TRAP.squeaky:
      return squeakyYou(ctx, levelId, t);
    case TRAP.bear:
      return bearTrapYou(ctx, t);
    case TRAP.sleepGas:
      return sleepGasYou(ctx, t);
    case TRAP.rust:
      return rustTrapYou(ctx, t);
    case TRAP.trapdoor:
    case TRAP.hole:
      return fallThrough(ctx, levelId, t, opts.plunged === true);
    default:
      return; // another mod's trap: its effects are that mod's business
  }
}

/** spoteffects(): the trap under the hero, if any, goes off. ref: src/hack.c spoteffects() */
export function spotTrap(ctx: Ctx): void {
  const p = heroPos(ctx);
  const level = ctx.state.levels[p.level];
  const t = level ? trapAt(level, p.x, p.y) : undefined;
  if (t && !ctx.state.gameOver) dotrap(ctx, t);
}

/**
 * Moving while caught in a bear trap: "You are caught in a bear trap." and a diagonal move, or
 * one time in five, loosens it; at zero "You finally wriggle free.". Returns true if the hero
 * may move (she never does on the turn she gets free). ref: src/hack.c trapmove() TT_BEARTRAP
 */
export function trapmove(ctx: Ctx, dir: Dir): boolean {
  const u = utrap(ctx);
  if (!u) return true;
  say(ctx, 'trap.bear.caught');
  let n = u.n;
  if ((DIRS[dir].x !== 0 && DIRS[dir].y !== 0) || ctx.rng.rn2(5) === 0) n--;
  setUtrap(ctx, n, 'beartrap');
  if (n === 0) say(ctx, 'trap.bear.free');
  return false;
}

/**
 * The seen trap at `to` the hero must confirm stepping onto, or null. Rust traps are harmless
 * when she wears nothing rustprone. ref: src/hack.c avoid_trap_andor_region() with
 * paranoid_confirm:trap (on by default) and immune_to_trap(); never when stunned or confused.
 */
export function trapToConfirm(ctx: Ctx, to: Pos): Trap | null {
  const hero = heroEnt(ctx);
  if (hasProp(hero, P.STUNNED) || hasProp(hero, P.CONFUSION)) return null;
  const level = getLevel(ctx.state);
  const t = trapAt(level, to.x, to.y);
  if (!t?.seen) return null;
  if (t.def === TRAP.rust) {
    const worn = sortedIds(ctx.state).some((id) => {
      const o = ctx.state.entities[String(id)];
      const it = o?.c.item;
      return (
        !!o &&
        it?.carriedBy === hero.id &&
        it.equipped !== null &&
        isRustprone(ctx.defs.object(o.def))
      );
    });
    if (!worn) return null;
  }
  return t;
}

/** ref: src/trap.c into_vs_onto() */
export const intoTrap = (def: DefId): boolean => def === TRAP.bear || def === TRAP.hole;

// ---------------------------------------------------------------------------------------------
// monsters

/** What happened to a monster in a trap. ref: include/trap.h Trap_Effect_Finished etc. */
export type TrapResult = 'finished' | 'caught' | 'killed' | 'moved' | 'gone';

const inAir = (ctx: Ctx, mon: Entity): boolean => {
  const f = ctx.defs.monster(mon.def).flags;
  return f.includes('fly') || f.includes('float');
};

/**
 * A trap that cannot hurt this monster is neither avoided nor feared.
 * ref: src/trap.c m_harmless_trap() (all our traps are floor triggers)
 */
export function mHarmlessTrap(ctx: Ctx, mon: Entity, trap: Trap): boolean {
  const def = ctx.defs.monster(mon.def);
  if (inAir(ctx, mon)) return true;
  switch (trap.def) {
    case TRAP.bear:
      return (
        def.size === 'tiny' ||
        def.size === 'small' ||
        def.flags.includes('amorphous') ||
        def.flags.includes('whirly') ||
        def.flags.includes('unsolid')
      );
    case TRAP.sleepGas:
      return def.resists.includes('sleep');
    case TRAP.rust:
      return def.id !== 'nh:iron_golem';
    case TRAP.trapdoor:
    case TRAP.hole:
      return def.flags.includes('cling');
    default:
      return false;
  }
}

/**
 * A trap's missile (or a forced `dOverride` hit) on a monster. Returns true if it died.
 * ref: src/trap.c thitm(): `find_mac(mon) + tlev + obj->spe <= rnd(20)` hits; a missile that
 * missed (or a falling rock) lands on its square.
 */
function thitm(
  ctx: Ctx,
  tlev: number,
  mon: Entity,
  obj: Entity | null,
  dOverride: number,
): boolean {
  const p = mon.c.pos;
  if (!p) return false;
  let strike: boolean;
  if (dOverride) strike = true;
  else if (obj)
    strike =
      findMac(ctx.state, ctx.defs, mon.id) + tlev + (obj.c.item?.spe ?? 0) <= ctx.rng.rnd(20);
  else strike = findMac(ctx.state, ctx.defs, mon.id) + tlev <= ctx.rng.rnd(20);
  const seen = cansee(ctx, p.level, p.x, p.y);
  let killed = false;
  if (!strike) {
    if (obj && seen)
      say(ctx, 'trap.thitm.almost', {
        mon: monNam(ctx, mon),
        obj: doname(ctx.state, ctx.defs, obj),
      });
  } else {
    if (obj && seen)
      say(ctx, 'trap.thitm.hit', { mon: monNam(ctx, mon), obj: doname(ctx.state, ctx.defs, obj) });
    let dam = 1;
    if (dOverride) dam = dOverride;
    else if (obj)
      dam = Math.max(dmgval(ctx.rng, obj, ctx.defs.object(obj.def), ctx.defs.monster(mon.def)), 1);
    const hp = mon.c.hp;
    if (hp) {
      hp.cur -= dam;
      if (hp.cur <= 0) {
        monkilled(ctx, mon.id, true);
        killed = !ctx.state.entities[String(mon.id)];
      }
    }
  }
  if (obj && (!strike || dOverride)) dropAt(ctx, obj, p.level, p.x, p.y);
  else if (obj) ctx.remove(obj.id);
  return killed;
}

const caughtOr = (ctx: Ctx, mon: Entity, killed: boolean): TrapResult =>
  killed ? 'killed' : isMtrapped(ctx, mon.id) ? 'caught' : 'finished';

/** Arrow, dart and falling rock traps on a monster. */
function missileTrapMon(ctx: Ctx, levelId: string, mon: Entity, trap: Trap): TrapResult {
  const p = mon.c.pos;
  if (!p) return 'finished';
  const inSight = canseemon(ctx, mon);
  const seeIt = cansee(ctx, p.level, p.x, p.y);
  if (trap.once && trap.seen && ctx.rng.rn2(15) === 0) {
    if (inSight && seeIt)
      say(ctx, trap.def === TRAP.rock ? 'trap.rock.mon_nothing' : 'trap.mon_nothing', {
        mon: monNam(ctx, mon),
      });
    deltrap(ctx, levelId, trap);
    return 'gone';
  }
  trap.once = true;
  let killed: boolean;
  if (trap.def === TRAP.arrow) {
    const otmp = tMissile(ctx, 'nh:arrow');
    if (inSight) seetrap(trap);
    killed = thitm(ctx, 8, mon, otmp, 0);
  } else if (trap.def === TRAP.dart) {
    const otmp = tMissile(ctx, 'nh:dart');
    ctx.rng.rn2(6); // otmp->opoisoned (darts cannot be poisoned yet)
    if (inSight) seetrap(trap);
    killed = thitm(ctx, 7, mon, otmp, 0);
  } else {
    const otmp = tMissile(ctx, 'nh:rock');
    if (inSight) seetrap(trap);
    killed = thitm(ctx, 0, mon, otmp, ctx.rng.d(2, 6));
  }
  return caughtOr(ctx, mon, killed);
}

function squeakyMon(ctx: Ctx, levelId: string, mon: Entity, trap: Trap): TrapResult {
  const p = mon.c.pos;
  if (!p || inAir(ctx, mon)) return 'finished';
  const level = getLevel(ctx.state, levelId);
  const note = noteOf(ctx, level, trap);
  if (canseemon(ctx, mon)) {
    say(ctx, 'trap.squeak.mon', { mon: monNam(ctx, mon), note });
    seetrap(trap);
  } else if (levelId === ctx.state.currentLevel) {
    // same near/far threshold as mzapmsg(): couldsee() ? BOLT_LIM + 1 : BOLT_LIM - 3
    const hp = heroPos(ctx);
    const could = clearPath(level, cellRules(level, ctx.defs).opaque, hp.x, hp.y, p.x, p.y);
    const range = could ? 9 : 5;
    const near = (p.x - hp.x) ** 2 + (p.y - hp.y) ** 2 <= range * range;
    say(ctx, near ? 'trap.squeak.hear_near' : 'trap.squeak.hear_far', { note });
  }
  wakeNearto(ctx, p.x, p.y, 40);
  return 'finished';
}

function bearTrapMon(ctx: Ctx, mon: Entity, trap: Trap): TrapResult {
  const def = ctx.defs.monster(mon.def);
  const inSight = canseemon(ctx, mon);
  if (
    def.size !== 'tiny' &&
    def.size !== 'small' &&
    !def.flags.includes('amorphous') &&
    !inAir(ctx, mon) &&
    !def.flags.includes('whirly') &&
    !def.flags.includes('unsolid')
  ) {
    setMtrapped(ctx, mon.id, true);
    if (inSight) {
      say(ctx, 'trap.bear.mon_caught', { mon: monNam(ctx, mon) });
      seetrap(trap);
    }
  }
  let killed = false;
  if (isMtrapped(ctx, mon.id) && !ironShoes(ctx, mon.id))
    killed = thitm(ctx, 0, mon, null, ctx.rng.d(2, 4));
  return caughtOr(ctx, mon, killed);
}

function sleepGasMon(ctx: Ctx, mon: Entity, trap: Trap): TrapResult {
  const def = ctx.defs.monster(mon.def);
  const inSight = canseemon(ctx, mon);
  const helpless = mon.c.monster?.asleep === true || isFrozen(ctx, mon.id);
  if (!def.resists.includes('sleep') && !def.flags.includes('breathless') && !helpless) {
    // ref: src/mhitm.c sleep_monst(mtmp, rnd(25), -1)
    paralyzeMonst(ctx, mon.id, ctx.rng.rnd(25));
    if (inSight) {
      say(ctx, 'trap.gas.mon_sleeps', { mon: monNam(ctx, mon) });
      seetrap(trap);
    }
  }
  return 'finished';
}

/** ref: src/polyself.c mbodypart(): animals have forelimbs, everyone else arms */
const armPart = (ctx: Ctx, mon: Entity): Msg => ({
  key: ctx.defs.monster(mon.def).flags.includes('animal') ? 'trap.part.forelimb' : 'trap.part.arm',
});

function rustTrapMon(ctx: Ctx, mon: Entity, trap: Trap): TrapResult {
  const inSight = canseemon(ctx, mon);
  if (inSight) seetrap(trap);
  const id = mon.id;
  const name = monNam(ctx, mon);
  const gloves = (): void => void waterDamage(ctx, whichArmor(ctx, id, 'gloves'));
  switch (ctx.rng.rn2(5)) {
    case 0:
      if (inSight) say(ctx, 'trap.rust.mon_head', { mon: name, part: { key: 'trap.part.head' } });
      waterDamage(ctx, whichArmor(ctx, id, 'helm'));
      break;
    case 1: {
      if (inSight) say(ctx, 'trap.rust.mon_left_arm', { mon: name, part: armPart(ctx, mon) });
      if (waterDamage(ctx, whichArmor(ctx, id, 'shield')) !== 'nothing') break;
      const w = monWep(ctx, id);
      if (w && ctx.defs.object(w.def).weapon?.bimanual) waterDamage(ctx, w);
      gloves();
      break;
    }
    case 2:
      if (inSight) say(ctx, 'trap.rust.mon_right_arm', { mon: name, part: armPart(ctx, mon) });
      waterDamage(ctx, monWep(ctx, id));
      gloves();
      break;
    default:
      if (inSight) say(ctx, 'trap.rust.mon_body', { mon: name });
      waterDamage(
        ctx,
        whichArmor(ctx, id, 'cloak') ?? whichArmor(ctx, id, 'body') ?? whichArmor(ctx, id, 'shirt'),
      );
  }
  // completelyrusts() (iron golems) and gremlins: not in the roster
  return caughtOr(ctx, mon, false);
}

/**
 * A monster falls to a deeper level and waits there until the hero arrives.
 * ref: src/trap.c trapeffect_hole() (not grounded or huge: nothing happens),
 * src/teleport.c mlevel_tele_trap(), migrate_to_level() (MIGR_RANDOM)
 */
function holeMon(ctx: Ctx, levelId: string, mon: Entity, trap: Trap): TrapResult {
  const def = ctx.defs.monster(mon.def);
  // !grounded() (flyers, floaters, clingers) or too big to fit
  if (
    inAir(ctx, mon) ||
    def.flags.includes('cling') ||
    def.size === 'huge' ||
    def.size === 'gigantic'
  )
    return 'finished';
  if (ustuck(ctx) === mon.id) return 'finished'; // probably a vortex
  const level = getLevel(ctx.state, levelId);
  let dst = dataOf(trap).dst;
  if (dst === undefined || dst <= level.dlevel) {
    dst = holeDestination(ctx, level);
    trap.data = { dst };
  }
  if (dst <= level.dlevel) return 'finished'; // the bottom level of its dungeon
  if (canseemon(ctx, mon)) {
    say(ctx, trap.def === TRAP.hole ? 'trap.mon_falls_hole' : 'trap.mon_falls_door', {
      mon: monNam(ctx, mon),
    });
    seetrap(trap);
  }
  migrateToLevel(ctx, mon, levelIdFor(ctx.state, { dungeon: level.dungeon, dlevel: dst }));
  return 'moved';
}

/** ref: src/dog.c migrate_to_level(): the monster leaves the map until the hero gets there. */
function migrateToLevel(ctx: Ctx, mon: Entity, to: LevelId): void {
  setMtrapped(ctx, mon.id, false);
  delete mon.c.pos;
  const t = trapTable(ctx, 'migrating', true);
  if (t) t[String(mon.id)] = to;
}

/** Monsters that fell to the level the hero just arrived on come out at random spots. */
function monArrivals(ctx: Ctx, change: LevelChange): void {
  const t = trapTable(ctx, 'migrating', false);
  if (!t) return;
  const level = ctx.state.levels[change.to];
  if (!level) return;
  for (const key of Object.keys(t).sort((a, b) => Number(a) - Number(b))) {
    const to = t[key];
    // saves before v7 kept a root-dungeon depth
    const toId =
      typeof to === 'number'
        ? levelIdFor(ctx.state, { dungeon: rootDungeon(ctx.state).id, dlevel: to })
        : to;
    if (toId !== level.id) continue;
    const mon = ctx.state.entities[key];
    if (!mon?.c.monster) {
      delete t[key];
      continue;
    }
    const spot = rlocPos(ctx, level);
    if (!spot) continue; // no room: it keeps waiting
    mon.c.pos = { level: level.id, x: spot.x, y: spot.y };
    delete t[key];
  }
}

/**
 * A monster on a trap: one already caught tries to get free (1 in 40); otherwise a monster
 * that knows this kind of trap avoids it 3 times in 4, and the trap goes off.
 * With `force` (FORCETRAP, e.g. a wand of locking or opening) the trap cannot be avoided.
 * ref: src/trap.c mintrap(). Not ported: metallivores eating bear traps, hiders.
 */
export function mintrap(ctx: Ctx, monId: EntityId, opts: { force?: boolean } = {}): TrapResult {
  const mon = ctx.state.entities[String(monId)];
  const p = mon?.c.pos;
  if (!mon?.c.monster || !p) return 'finished';
  const level = ctx.state.levels[p.level];
  const trap = level ? trapAt(level, p.x, p.y) : undefined;
  if (!trap) {
    setMtrapped(ctx, monId, false); // perhaps teleported?
    return 'finished';
  }
  if (isMtrapped(ctx, monId)) {
    // "If you come upon an obviously trapped monster, then you must be able to see the trap"
    if (!trap.seen && canseemon(ctx, mon) && (trap.def === TRAP.bear || trap.def === TRAP.hole))
      seetrap(trap);
    if (ctx.rng.rn2(40) === 0) {
      if (canseemon(ctx, mon))
        say(ctx, 'trap.mon_pulls_free', { mon: monNam(ctx, mon), trap: trapName(trap) });
      setMtrapped(ctx, monId, false);
    }
    return isMtrapped(ctx, monId) ? 'caught' : 'finished';
  }
  const def = ctx.defs.monster(mon.def);
  const alreadySeen =
    monKnowsTraps(ctx, monId, trap.def) ||
    (trap.def === TRAP.hole && !def.flags.includes('mindless'));
  if (!TRAPS.some((t) => t.id === trap.def)) return 'finished'; // another mod's trap
  if (!opts.force) {
    if (inAir(ctx, mon)) return 'finished'; // floor_trigger() && check_in_air()
    if (alreadySeen && ctx.rng.rn2(4) !== 0) return 'finished';
  }
  monLearnsTraps(ctx, monId, trap.def);
  monsSeeTrap(ctx, p.level, trap);
  switch (trap.def) {
    case TRAP.arrow:
    case TRAP.dart:
    case TRAP.rock:
      return missileTrapMon(ctx, p.level, mon, trap);
    case TRAP.squeaky:
      return squeakyMon(ctx, p.level, mon, trap);
    case TRAP.bear:
      return bearTrapMon(ctx, mon, trap);
    case TRAP.sleepGas:
      return sleepGasMon(ctx, mon, trap);
    case TRAP.rust:
      return rustTrapMon(ctx, mon, trap);
    default:
      return holeMon(ctx, p.level, mon, trap);
  }
}

/** True when the outcome means the monster left its square (died or fell). */
export const trapRemovedMon = (r: TrapResult): boolean => r === 'killed' || r === 'moved';

// ---------------------------------------------------------------------------------------------
// searching and looking

/**
 * Searching may find an unseen trap next to the hero. ref: src/detect.c dosearch0() `!rnl(8)`,
 * find_trap(). Returns true when one was found.
 */
export function findTrapAt(
  ctx: Ctx,
  level: Level,
  x: number,
  y: number,
  rnl8: () => number,
): boolean {
  const t = trapAt(level, x, y);
  if (!t || t.seen || rnl8() !== 0) return false;
  ctx.interrupt(); // nomul(0)
  t.seen = true;
  say(ctx, 'trap.found', { trap: trapName(t) });
  return true;
}

interface IdArgs {
  dir?: Dir;
}

function idTarget(ctx: Ctx, args: IdArgs): Pos {
  const p = heroPos(ctx);
  const d = args.dir ? DIRS[args.dir] : { x: 0, y: 0 };
  return { x: p.x + d.x, y: p.y + d.y };
}

/**
 * `^`: "That is a bear trap." for a seen trap next to the hero or under her; no time passes.
 * ref: src/pager.c doidtrap()
 */
const idtrap: ActionDef = {
  id: 'nh:idtrap',
  labelKey: 'action.nh:idtrap',
  handles: 'mod',
  offer(ctx, target) {
    const p = heroPos(ctx);
    let dir: Dir | null = null;
    let at: Pos;
    if (target.kind === 'self') at = { x: p.x, y: p.y };
    else if (target.kind === 'cell') {
      at = target.pos;
      const dx = at.x - p.x;
      const dy = at.y - p.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) > 1) return [];
      dir = DIR_LIST.find((d) => DIRS[d].x === dx && DIRS[d].y === dy) ?? null;
    } else return [];
    const t = ctx.query.trapAt(p.level, at);
    if (!t) return [];
    return [
      {
        action: { type: 'mod', action: 'nh:idtrap', args: dir ? { dir } : {} },
        labelKey: 'action.nh:idtrap',
        params: { trap: `@${t.def}` },
      },
    ];
  },
  perform(ctx, action) {
    const raw = action.type === 'mod' ? (action.args as { dir?: unknown } | undefined)?.dir : null;
    const dir = DIR_LIST.find((d) => d === raw);
    const at = idTarget(ctx, dir ? { dir } : {});
    const t = ctx.query.trapAt(heroPos(ctx).level, at);
    if (t) say(ctx, 'trap.that_is', { trap: `@${t.def}` });
    else say(ctx, 'trap.cant_see');
    return 0;
  },
};

export const TRAP_ACTIONS: readonly ActionDef[] = [idtrap];

/** The seen hole or trap door under the hero, for '>'. ref: src/do.c dodown() uescaped_shaft() */
export function seenHoleHere(ctx: Ctx): Trap | null {
  const p = heroPos(ctx);
  const level = ctx.state.levels[p.level];
  const t = level ? trapAt(level, p.x, p.y) : undefined;
  return t && t.seen && isHole(t.def) ? t : null;
}

/** Jumping into a seen hole or trap door with '>'. ref: src/do.c dodown() dotrap(TOOKPLUNGE) */
export function plunge(ctx: Ctx, t: Trap): number {
  dotrap(ctx, t, { plunged: true });
  return NORMAL_SPEED;
}

export function registerTraps(api: ModApi): void {
  for (const t of TRAPS) api.defineTrap(t);
  for (const a of TRAP_ACTIONS) api.defineAction(a);
  api.on('levelChange', (ctx, change) => {
    if (change.from === null) return;
    // ref: src/do.c goto_level() reset_utrap(FALSE)
    if (utrap(ctx)) setUtrap(ctx, 0, 'beartrap');
    monArrivals(ctx, change);
  });
  // records of monsters that are gone are dropped
  api.on('endOfTurn', (ctx) => {
    for (const k of ['mtrapped', 'mtrapseen', 'migrating'] as const) {
      const t = trapTable(ctx, k, false);
      if (!t) continue;
      for (const key of Object.keys(t).sort())
        if (!ctx.state.entities[key]?.c.monster) forgetMonTraps(ctx, Number(key));
    }
  });
}
