// Traps: arrow, dart, falling rock, squeaky board, bear trap, sleeping gas, rust, pit, spiked
// pit, trap door, hole, teleportation trap, level teleporter and web; the rolling boulder trap's
// launch spots (its effect is in rollboulder.ts). ref: include/trap.h, include/defsym.h,
// src/trap.c maketrap(), mkroll_launch(), find_random_launch_coord(), isclearpath(),
// dotrap(), mintrap(), trapeffect_*(), climb_pit(), fall_through(), thitm(), m_harmless_trap(),
// mu_maybe_destroy_web(),
// src/mondata.c mons_see_trap(), src/teleport.c tele_trap(), level_tele_trap(), mtele_trap(),
// mlevel_tele_trap(), src/hack.c trapmove(),
// src/pager.c doidtrap(). Also the teleport moves, which the trap code and teleds() share:
// src/teleport.c teleds(), safe_teleds(), tele(), scrolltele(), level_tele(), rloc(),
// rloc_to_core(), u_teleport_mon() (the spots come from teleport.ts)
import {
  DIRS,
  DIR_LIST,
  NORMAL_SPEED,
  cellIndex,
  dungeonLayout,
  levelIdFor,
  rootDungeon,
  type GameState,
  type Json,
  cellRules,
  getLevel,
  getPlayer,
  inBounds,
  inRooms,
  inventoryOf,
  isVisible,
  rnl,
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
import { BOULDER, blockersOf, boulderAt } from './boulder';
import { TEMPLE, epriOf } from './epri';
import { costlySpot, eshkOf, inhishop, onbill, uShops } from './eshk';
import { DUNGEON_BOTTOM, dungeonBottom } from './levelflags';
import { checkSpecialRoom } from './rooms';
import { findObjowner, makeAngryShk, stolenValue } from './shk';
import { shopdig } from './shkpay';
import { addShopDamage } from './shopdamage';
import {
  SOKOBAN_DUNGEON,
  inStasis,
  levelAtDepth,
  noteleportLevel,
  randomTeleportLevel,
  rlocMonPos,
  safeTeledsPos,
  teleok,
} from './teleport';
import { askPosition, positionAnswer } from './getpos';
import { unaware } from './btrapped';
import { poisoned } from './attrib';
import { resistsMagm } from './buzz';
import { dmgval, dmgvalSized } from './dmgval';
import { setWoundedLegs } from './legs';
import { wakeNearto } from './noise';
import { erodeObj, type ErodeResult } from './erode';
import { uhimKey } from './gender';
import { rlocPos } from './generation';
import { setUstuck, ustuck } from './hackmove';
import { losehp } from './hp';
import { luckOf, uState } from './luck';
import { done } from './end';
import { setEndHow } from './endstate';
import { surfaceKey } from './terrain';
import { nomulNow } from './hunger';
import { mksobj, placeOnFloor } from './items';
import { lookHere } from './itemactions';
import { setFloatDownTrap } from './levitation';
import { migrateToLevel } from './migrate';
import { isCrackable, isMetallic, isRustprone } from './material';
import { monkilled } from './mondeath';
import { minvent, monWep, whichArmor } from './mongear';
import { clearPath } from './clearpath';
import { isFrozen, paralyzeMonst, setMConfused } from './mstate';
import { flaming, isWhirly } from './engulfstate';
import { doname, xnameOf } from './objnam';
import { canSpotMon, monNam, telepathSenses } from './perception';
import { P, hasProp, makeConfused, timeoutLeft } from './props';
import { findAc, findMac } from './stats';
import { isSokoban, maybeFinishSokoban } from './sokoban';
import { canseemon as canseemonInvis } from './invis';
import {
  XDIR,
  YDIR,
  clearConjoinedPits,
  conjoinedPits,
  forgetMonTraps,
  isHole,
  isMtrapped,
  flying,
  isPit,
  levitating,
  monKnowsTraps,
  monLearnsTraps,
  setMtrapped,
  setUtrap,
  trapTable,
  uInAir,
  uInPit,
  uLocomotion,
  utrap,
} from './trapstate';
import { MZ_HUGE, isClinger, msize } from './mondata';
import { heroForm } from './upoly';

/** The vanilla trap ids. */
export const TRAP = {
  arrow: 'nh:arrow_trap',
  dart: 'nh:dart_trap',
  rock: 'nh:falling_rock_trap',
  squeaky: 'nh:squeaky_board',
  bear: 'nh:bear_trap',
  landmine: 'nh:landmine',
  rolling: 'nh:rolling_boulder_trap',
  sleepGas: 'nh:sleeping_gas_trap',
  rust: 'nh:rust_trap',
  pit: 'nh:pit',
  spikedPit: 'nh:spiked_pit',
  trapdoor: 'nh:trap_door',
  hole: 'nh:hole',
  tele: 'nh:teleportation_trap',
  levelTele: 'nh:level_teleporter',
  magic: 'nh:magic_trap',
  antiMagic: 'nh:anti_magic_field',
  web: 'nh:web',
  statue: 'nh:statue_trap',
  poly: 'nh:polymorph_trap',
} as const;

/** The two spiders that spin webs and walk them freely. ref: include/mondata.h webmaker() */
export const webmaker = (def: { id: DefId }): boolean =>
  def.id === 'nh:cave_spider' || def.id === 'nh:giant_spider';

/** ref: include/trap.h is_magical_trap() */
export const isMagicalTrap = (def: DefId): boolean =>
  def === TRAP.tele ||
  def === TRAP.levelTele ||
  def === TRAP.magic ||
  def === TRAP.antiMagic ||
  def === TRAP.poly;

// Colors as in include/color.h (HI_METAL = CYAN, HI_ZAP = BRIGHT_BLUE).
const CYAN = '#33bbbb';
const GRAY = '#aaaaaa';
const BROWN = '#aa5500';
const BLUE = '#4466ff';
const BRIGHT_BLUE = '#5555ff';
const BLACK = '#555555'; // CLR_BLACK, drawn dark gray as objects.ts does
const MAGENTA = '#bb44bb';
const RED = '#cc3333';
const BRIGHT_GREEN = '#55ff55';

/**
 * ref: include/defsym.h S_arrow_trap .. S_hole (S_land_mine CLR_RED), S_teleportation_trap, S_level_teleporter,
 * S_magic_trap, S_anti_magic_trap (HI_ZAP), S_web (CLR_GRAY)
 */
export const TRAPS: readonly TrapDef[] = [
  { id: TRAP.arrow, nameKey: TRAP.arrow, glyph: { ch: '^', fg: CYAN } },
  { id: TRAP.dart, nameKey: TRAP.dart, glyph: { ch: '^', fg: CYAN } },
  { id: TRAP.rock, nameKey: TRAP.rock, glyph: { ch: '^', fg: GRAY } },
  { id: TRAP.squeaky, nameKey: TRAP.squeaky, glyph: { ch: '^', fg: BROWN } },
  { id: TRAP.bear, nameKey: TRAP.bear, glyph: { ch: '^', fg: CYAN } },
  { id: TRAP.landmine, nameKey: TRAP.landmine, glyph: { ch: '^', fg: RED } },
  { id: TRAP.rolling, nameKey: TRAP.rolling, glyph: { ch: '^', fg: GRAY } },
  { id: TRAP.sleepGas, nameKey: TRAP.sleepGas, glyph: { ch: '^', fg: BRIGHT_BLUE } },
  { id: TRAP.rust, nameKey: TRAP.rust, glyph: { ch: '^', fg: BLUE } },
  { id: TRAP.pit, nameKey: TRAP.pit, glyph: { ch: '^', fg: BLACK } },
  { id: TRAP.spikedPit, nameKey: TRAP.spikedPit, glyph: { ch: '^', fg: BLACK } },
  { id: TRAP.trapdoor, nameKey: TRAP.trapdoor, glyph: { ch: '^', fg: BROWN }, hole: true },
  { id: TRAP.hole, nameKey: TRAP.hole, glyph: { ch: '^', fg: BROWN }, hole: true },
  { id: TRAP.tele, nameKey: TRAP.tele, glyph: { ch: '^', fg: MAGENTA } },
  { id: TRAP.levelTele, nameKey: TRAP.levelTele, glyph: { ch: '^', fg: MAGENTA } },
  { id: TRAP.magic, nameKey: TRAP.magic, glyph: { ch: '^', fg: BRIGHT_BLUE } },
  { id: TRAP.antiMagic, nameKey: TRAP.antiMagic, glyph: { ch: '^', fg: BRIGHT_BLUE } },
  { id: TRAP.web, nameKey: TRAP.web, glyph: { ch: '"', fg: GRAY } }, // S_web
  { id: TRAP.statue, nameKey: TRAP.statue, glyph: { ch: '^', fg: GRAY } }, // S_statue_trap
  { id: TRAP.poly, nameKey: TRAP.poly, glyph: { ch: '^', fg: BRIGHT_GREEN } }, // S_polymorph_trap
];

/**
 * Traps set off by touching the floor, which flyers and floaters pass over (the teleport,
 * magic and anti-magic traps and webs are not). ref: src/trap.c floor_trigger()
 */
export const floorTrigger = (def: DefId): boolean =>
  def !== TRAP.tele &&
  def !== TRAP.levelTele &&
  def !== TRAP.magic &&
  def !== TRAP.antiMagic &&
  def !== TRAP.web &&
  def !== TRAP.statue &&
  def !== TRAP.poly;

/**
 * The effects of a trap kind whose code sits above this module: the magic trap and the
 * anti-magic field (magictrap.ts, which reaches dog.ts and read.ts, both importers of this
 * module), handed in at registration as levitation.ts's float-down trap is. `made` runs when
 * maketrap() makes one (the statue trap's statue); `inMklev` is C's gi.in_mklev.
 */
export interface TrapEffect {
  you(ctx: Ctx, trap: Trap): void;
  mon(ctx: Ctx, mon: Entity, trap: Trap): TrapResult;
  made?(ctx: Ctx, levelId: string, trap: Trap, inMklev: boolean): void;
}
const lateEffects: Record<string, TrapEffect> = {};

/** Called by magictrap.ts's registerMagicTraps(). */
export function setTrapEffect(def: DefId, fx: TrapEffect): void {
  lateEffects[def] = fx;
}

export { isHole, isPit };

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const trapName = (t: Trap): string => `@${t.def}`;

/**
 * Per-trap data: the squeaky board's note (tnote), a hole's destination depth (dst), whether
 * the hero made it (madeby_u: pits and holes she dug, dig.ts), a pit's links to the pits next
 * to it (conjoined: C's 8-bit direction mask; helpers in trapstate.ts) and a rolling boulder
 * trap's two ends (launch, where its boulder waits, and launch2 across the trap; both the trap's
 * own square when no boulder was placed).
 */
export interface TrapData {
  tnote?: number;
  dst?: number;
  madeby_u?: true;
  conjoined?: number;
  launch?: XY;
  launch2?: XY;
}

/** A square as plain JSON (a type alias: `Pos` is an interface, which `Json` does not accept). */
export type XY = { x: number; y: number };

const posOf = (v: unknown): XY | undefined => {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  return typeof o['x'] === 'number' && typeof o['y'] === 'number'
    ? { x: o['x'], y: o['y'] }
    : undefined;
};

export function dataOf(t: Trap): TrapData {
  const d = t.data;
  if (d === null || d === undefined || typeof d !== 'object' || Array.isArray(d)) return {};
  const out: TrapData = {};
  if (typeof d['tnote'] === 'number') out.tnote = d['tnote'];
  if (typeof d['dst'] === 'number') out.dst = d['dst'];
  if (d['madeby_u'] === true) out.madeby_u = true;
  if (typeof d['conjoined'] === 'number') out.conjoined = d['conjoined'];
  const l1 = posOf(d['launch']);
  if (l1) out.launch = l1;
  const l2 = posOf(d['launch2']);
  if (l2) out.launch2 = l2;
  return out;
}

/** Sets some of the trap's data, keeping the rest. */
export function setTrapData(t: Trap, data: TrapData): void {
  t.data = { ...dataOf(t), ...data };
}

export { DUNGEON_BOTTOM, dungeonBottom };

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
 * a note, holes and trap doors a destination (in a shop on the hero's level, scheduled for repair:
 * `add_damage(x, y, 0L)`). Returns the trap as stored.
 * ref: src/trap.c maketrap() (the parts for our trap types)
 */
export function maketrap(
  ctx: Ctx,
  levelId: string,
  x: number,
  y: number,
  def: DefId,
  opts: { inMklev?: boolean } = {},
): Trap {
  const level = getLevel(ctx.state, levelId);
  const old = trapAt(level, x, y);
  // ref: maketrap(): a hero caught in a bear trap, web or pit that is replaced by another kind is
  // let go
  const hp = getPlayer(ctx.state).c.pos;
  const u = utrap(ctx);
  if (old && u && hp?.level === levelId && hp.x === x && hp.y === y) {
    if (
      (u.type === 'beartrap' && def !== TRAP.bear) ||
      (u.type === 'web' && def !== TRAP.web) ||
      (u.type === 'pit' && !isPit(def))
    )
      setUtrap(ctx, 0, u.type);
  }
  const t: Trap = { def, x, y, seen: def === TRAP.hole }; // unhideable_trap()
  if (def === TRAP.squeaky) t.data = { tnote: chooseTrapnote(ctx, level, x, y) };
  else if (isHole(def)) {
    t.data = { dst: holeDestination(ctx, level) };
    // schedule repair (a door or wall is digactualhole()'s: core keeps traps off them)
    if (levelId === ctx.state.currentLevel) addShopDamage(ctx, x, y, 0);
  } else if (def === TRAP.rolling) {
    // boulder will roll towards trigger
    const { launch, launch2 } = mkrollLaunch(ctx, level, x, y);
    t.data = { launch, launch2 };
  }
  ctx.placeTrap(levelId, t);
  const placed = trapAt(level, x, y) ?? t;
  // STATUE_TRAP: mk_trap_statue() (statue.ts)
  lateEffects[def]?.made?.(ctx, levelId, placed, opts.inMklev === true);
  return placed;
}

/**
 * Whether a boulder could roll `distance` squares from (x, y) in direction (dx, dy): every
 * square on the map, terrain a zap passes over but no closed door, and no pit, hole or
 * teleporter. The far end, or null. ref: src/trap.c isclearpath()
 */
function isclearpath(
  ctx: Pick<Ctx, 'defs'>,
  level: Readonly<Level>,
  x0: number,
  y0: number,
  distance: number,
  dx: number,
  dy: number,
): Pos | null {
  let x = x0;
  let y = y0;
  while (distance-- > 0) {
    x += dx;
    y += dy;
    if (!inBounds(level, x, y)) return null;
    const id = level.palette[level.cells[cellIndex(level, x, y)] ?? 0];
    const td = id === undefined ? undefined : ctx.defs.terrain(id);
    // !ZAP_POS(typ) || closed_door(x, y) (iron bars are ZAP_POS)
    if (!td || td.door === 'closed' || td.door === 'locked') return null;
    if (!td.passable && td.door === undefined && id !== 'nh:iron_bars') return null;
    const t = trapAt(level, x, y);
    // is_pit() || is_hole() || is_xport() (teleportation trap, level teleporter)
    if (t && (isPit(t.def) || isHole(t.def) || t.def === TRAP.tele || t.def === TRAP.levelTele))
      return null;
  }
  return { x, y };
}

/**
 * A spot 2..8 squares from the trap in a straight line where its boulder can wait, with a clear
 * path to the trap and as far again beyond it: a random distance `rn1(5, 4)` and a random first
 * direction, trying the eight directions in turn and coming one square nearer after each round
 * (down to 2). Never in Sokoban (no draws). ref: src/trap.c find_random_launch_coord() (the
 * des.trap `launchfrom` spot, `gl.launchplace`, is not ported: no level names one; with none
 * linedup() fails at once; there is no water)
 */
function findRandomLaunchCoord(
  ctx: Pick<Ctx, 'defs' | 'rng'>,
  level: Readonly<Level>,
  x: number,
  y: number,
): Pos | null {
  if (isSokoban(level)) return null;
  const mindist = 2; // ROLLING_BOULDER_TRAP
  let distance = 4 + ctx.rng.rn2(5); // rn1(5, 4): 4..8 away
  let tmp = ctx.rng.rn2(8); // randomly pick a direction to try first
  let trycount = 0;
  while (distance >= mindist) {
    const dx = XDIR[tmp] ?? 0;
    const dy = YDIR[tmp] ?? 0;
    const cc = isclearpath(ctx, level, x, y, distance, dx, dy);
    if (cc && isclearpath(ctx, level, x, y, distance, -dx, -dy)) return cc;
    if (++tmp > 7) tmp = 0;
    if (++trycount % 8 === 0) --distance;
  }
  return null;
}

/**
 * A rolling boulder trap's two ends: a boulder on the launch spot (findRandomLaunchCoord()) and
 * the spot as far on the other side; without a spot both ends are the trap and no boulder is made.
 * ref: src/trap.c mkroll_launch() (BOULDER, one)
 */
function mkrollLaunch(
  ctx: Ctx,
  level: Readonly<Level>,
  x: number,
  y: number,
): { launch: XY; launch2: XY } {
  const cc = findRandomLaunchCoord(ctx, level, x, y);
  if (!cc) return { launch: { x, y }, launch2: { x, y } };
  mksobj(ctx, ctx.defs.object(BOULDER), { at: { level: level.id, x: cc.x, y: cc.y } });
  return { launch: cc, launch2: { x: x - (cc.x - x), y: y - (cc.y - y) } };
}

/** The trap in state (the core keeps its own copy). */
const liveTrap = (ctx: Ctx, levelId: string, t: Pick<Trap, 'x' | 'y'>): Trap | undefined => {
  const level = ctx.state.levels[levelId];
  return level ? trapAt(level, t.x, t.y) : undefined;
};

/** ref: src/trap.c seetrap(), feeltrap() */
export const seetrap = (t: Trap): void => {
  t.seen = true;
};

/** ref: src/trap.c deltrap() */
export const deltrap = (ctx: Ctx, levelId: string, t: Trap): void => {
  const level = ctx.state.levels[levelId];
  if (level) clearConjoinedPits(level, liveTrap(ctx, levelId, t) ?? t);
  ctx.removeTrap(levelId, { x: t.x, y: t.y });
  maybeFinishSokoban(ctx, levelId);
};

/**
 * A pit or hole on a level with Sokoban's rules: it cannot be escaped, by the hero or by
 * monsters. ref: src/trap.c dotrap(), mintrap(), trapeffect_pit(), trapeffect_hole()
 * `Sokoban && (is_pit(ttype) || is_hole(ttype))` (dug ones too)
 */
const sokobanTrap = (ctx: Pick<Ctx, 'state'>, levelId: string, t: Trap): boolean => {
  const level = ctx.state.levels[levelId];
  return !!level && isSokoban(level) && (isPit(t.def) || isHole(t.def));
};

const heroEnt = (ctx: Ctx): Entity => getPlayer(ctx.state);

const heroPos = (ctx: Ctx): { level: string; x: number; y: number } => {
  const p = heroEnt(ctx).c.pos;
  if (!p) throw new Error('Player has no position');
  return p;
};

/** ref: cansee(x, y) on the current level */
export function cansee(ctx: Ctx, levelId: string, x: number, y: number): boolean {
  const level = ctx.state.levels[levelId];
  return (
    levelId === ctx.state.currentLevel &&
    !!level &&
    inBounds(level, x, y) &&
    isVisible(ctx.state, cellIndex(level, x, y))
  );
}

/** ref: canseemon() (invis.ts) */
export const canseemon = (ctx: Ctx, mon: Entity): boolean => canseemonInvis(ctx, mon);

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
    setTrapData(trap, { tnote: n });
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
export function ironShoes(ctx: Ctx, id: EntityId): Entity | null {
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

/**
 * How the hero comes into a pit from the square she stood on (u.ux0, u.uy0): from a pit linked
 * to it (`conj`, conjoined_pits()) or from any pit next to it (`adj`, adj_nonconjoined_pit(),
 * which is also true for a linked one). Both need her to be in the pit she leaves.
 * ref: src/trap.c conjoined_pits(), adj_nonconjoined_pit()
 */
function pitApproach(
  ctx: Ctx,
  levelId: string,
  trap: Trap,
  from: Pos | undefined,
): { conj: boolean; adj: boolean } {
  const level = ctx.state.levels[levelId];
  if (!from || !level || !inBounds(level, from.x, from.y)) return { conj: false, adj: false };
  const withU = trapAt(level, from.x, from.y);
  const conj = conjoinedPits(ctx, trap, withU, true);
  // xytodir(u.dx, u.dy) != DIR_ERR: she stepped one square
  const step = Math.max(Math.abs(trap.x - from.x), Math.abs(trap.y - from.y)) === 1;
  const adj = !!withU && uInPit(ctx) && isPit(withU.def) && isPit(trap.def) && step;
  return { conj, adj };
}

/**
 * The hero falls (or with '>' plunges) into a pit: "You fall into a pit!", the spikes, `rn1(6, 2)`
 * turns to climb out, `rnd(6)` damage (`rnd(10)` on spikes, poisoned 1 time in 6). Coming from a
 * pit next to it (`from`): "You move into an adjacent pit." when the two are conjoined (no
 * damage, `rnd(4)` on spikes), else "You stumble over debris." (`rnd(3)`, `rnd(6)` on spikes).
 * In Sokoban the air currents were the message; elsewhere a floating hero is not caught (only a
 * forced trap gets this far). ref: src/trap.c trapeffect_pit() for the hero: no Flying,
 * clinging, steed or `m` prefix; no exercise or selftouch()
 */
function pitYou(ctx: Ctx, levelId: string, trap: Trap, plunged: boolean, from?: Pos): void {
  const soko = sokobanTrap(ctx, levelId, trap);
  const { conj, adj } = pitApproach(ctx, levelId, trap, from);
  // "KMH -- You can't escape the Sokoban level traps"
  if (!soko && (levitating(ctx) || (flying(ctx) && !plunged))) return;
  seetrap(trap); // feeltrap()
  if (!soko) {
    if (conj) say(ctx, 'trap.pit.move_adjacent');
    else if (adj) say(ctx, ctx.rng.rn2(5) === 0 ? 'trap.pit.stumble_between' : 'trap.pit.stumble');
    else say(ctx, plunged ? 'trap.pit.plunge' : 'trap.pit.fall');
  }
  let spikes = trap.def === TRAP.spikedPit;
  const boots = spikes ? ironShoes(ctx, ctx.state.playerId) : null;
  if (boots) {
    say(ctx, 'trap.pit.spikes_protect', { obj: xnameOf(ctx.state, ctx.defs, boots) });
    spikes = false;
  } else if (spikes) say(ctx, conj ? 'trap.pit.spikes_step' : 'trap.pit.spikes');
  setUtrap(ctx, ctx.rng.rn2(6) + 2, 'pit'); // rn1(6, 2)
  if (spikes) {
    losehp(
      ctx,
      ctx.rng.rnd(conj ? 4 : adj ? 6 : 10),
      plunged
        ? '@killer.trap.plunged_spiked_pit'
        : conj
          ? '@killer.trap.stepped_spiked_pit'
          : adj
            ? '@killer.trap.stumbled_spiked_pit'
            : '@killer.trap.spiked_pit',
    );
    // "if damage triggered life-saving, poison is limited to attrib loss": there is no
    // life-saving, so a dead hero is simply not poisoned
    if (ctx.rng.rn2(6) === 0 && !ctx.state.gameOver)
      poisoned(
        ctx,
        { key: 'trap.pit.spikes_poisoned' },
        'str',
        conj || adj ? '@killer.trap.step_poison_spikes' : '@killer.trap.poison_spikes',
        8,
      );
  } else if (!conj)
    losehp(
      ctx,
      ctx.rng.rnd(adj ? 3 : 6),
      plunged ? '@killer.trap.plunged_pit' : '@killer.trap.pit',
    );
}

/**
 * A monster (or the hero) going through a web: an amorphous, whirly, flaming or unsolid one, or a
 * gelatinous cube, gets through; a flaming or acidic one destroys it ("The fire vortex burns a
 * spider web!"), the others flow through it ("The fog cloud flows through a spider web."). Returns
 * true if it got through. The hero is never any of these (no polymorph), so only monsters come
 * here; nobody makes webs of the hero's (`a_your[madeby_u]` is always "a").
 * ref: src/trap.c mu_maybe_destroy_web()
 */
export function muMaybeDestroyWeb(
  ctx: Ctx,
  levelId: string,
  mon: Entity,
  domsg: boolean,
  trap: Trap,
): boolean {
  const def = ctx.defs.monster(mon.def);
  if (
    !def.flags.includes('amorphous') &&
    !isWhirly(def) &&
    !flaming(def) &&
    !def.flags.includes('unsolid') &&
    def.id !== 'nh:gelatinous_cube'
  )
    return false;
  if (flaming(def) || def.flags.includes('acid')) {
    if (domsg)
      say(ctx, flaming(def) ? 'trap.web.mon_burns' : 'trap.web.mon_dissolves', {
        mon: monNam(ctx, mon),
      });
    deltrap(ctx, levelId, trap);
    return true;
  }
  if (domsg) {
    say(ctx, 'trap.web.mon_flows', { mon: monNam(ctx, mon) });
    seetrap(trap);
  }
  return true;
}

/**
 * The hero walks into a web: "You stumble into a spider web!" ("float into" while levitating,
 * "You are caught by a spider web!" when forced), then she is stuck for a time set by her
 * Strength: `rn1(6, 6)` at 3, down to `rnd(2)` at 15..17 and 1 at 18..18/50; from 18/51 she
 * tears through it ("You tear through a web!") and the web is gone. `msgok` false is NOWEBMSG
 * (the "web sticks to you" of a failed #untrap). ref: src/trap.c trapeffect_web() for the hero
 * (no steed, no polymorphed forms: she is never a webmaker nor goes through webs)
 */
function webYou(ctx: Ctx, levelId: string, trap: Trap, forced: boolean, msgok: boolean): void {
  seetrap(trap); // feeltrap()
  if (msgok)
    say(
      ctx,
      forced
        ? 'trap.web.caught_by'
        : uLocomotion(ctx) !== null
          ? `trap.web.${uLocomotion(ctx)}_into` // u_locomotion("stumble")
          : 'trap.web.stumble',
    );
  // time will be adjusted below
  setUtrap(ctx, 1, 'web');
  // Time stuck in the web depends on your strength (ACURR(A_STR), 18/xx encoded as 18 + xx).
  const str = heroEnt(ctx).c.attributes?.str ?? 10;
  const rng = ctx.rng;
  let tim: number;
  if (str <= 3)
    tim = rng.rn2(6) + 6; // rn1(6, 6)
  else if (str < 6)
    tim = rng.rn2(6) + 4; // rn1(6, 4)
  else if (str < 9)
    tim = rng.rn2(4) + 4; // rn1(4, 4)
  else if (str < 12)
    tim = rng.rn2(4) + 2; // rn1(4, 2)
  else if (str < 15)
    tim = rng.rn2(2) + 2; // rn1(2, 2)
  else if (str < 18) tim = rng.rnd(2);
  else if (str < 69) tim = 1;
  else {
    tim = 0;
    if (msgok) say(ctx, 'trap.web.tear_through');
    deltrap(ctx, levelId, trap);
  }
  setUtrap(ctx, tim, 'web');
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
 * `plunged` is TOOKPLUNGE (the hero jumped in with '>'). In Sokoban nothing more is said and
 * nothing holds her back ("You can't escape the Sokoban level traps"); elsewhere a floating hero
 * does not fall (only a forced trap gets this far), and when blind does not even notice.
 */
function fallThrough(ctx: Ctx, levelId: string, trap: Trap, plunged: boolean): void {
  const soko = sokobanTrap(ctx, levelId, trap);
  // "we'll fall even while levitating in Sokoban; otherwise, if we won't fall and won't be told
  // that we aren't falling, give up now"
  if (!soko && levitating(ctx) && hasProp(heroEnt(ctx), P.BLINDED)) return;
  seetrap(trap);
  if (!soko && !plunged)
    say(ctx, trap.def === TRAP.trapdoor ? 'trap.door.opens' : 'trap.hole.gaping');
  const form = heroForm(ctx);
  if (
    !soko &&
    (levitating(ctx) ||
      ustuck(ctx) !== null ||
      ((flying(ctx) || (form !== null && isClinger(form))) && !plunged))
  ) {
    // ref: fall_through(): `Levitation || u.ustuck || ...` -> "You don't fall in."
    say(ctx, 'trap.dont_fall');
    return;
  }
  if (!soko && form !== null && msize(form) >= MZ_HUGE) {
    say(ctx, 'trap.dont_fit');
    return;
  }
  const level = getLevel(ctx.state, levelId);
  let dst = dataOf(trap).dst;
  if (dst === undefined || dst <= level.dlevel) {
    // a trap placed without maketrap(): its destination is rolled now
    dst = holeDestination(ctx, level);
    setTrapData(trap, { dst });
  }
  if (dst <= level.dlevel) {
    // the bottom level of its dungeon (ref: fall_through(): !Can_fall_thru() -> "don't fall in")
    say(ctx, 'trap.dont_fall');
    return;
  }
  if (plunged && (flying(ctx) || (form !== null && isClinger(form)))) {
    const into = trap.def === TRAP.trapdoor ? 'trapdoor' : 'hole';
    say(ctx, flying(ctx) ? `trap.swoop.${into}` : `trap.drop.${into}`);
  }
  if (uShops(ctx).length > 0) shopdig(ctx, true);
  const dist = dst - level.dlevel;
  if (dist > 1)
    say(ctx, dist > 3 ? 'trap.shaft_very_deep' : dist > 2 ? 'trap.shaft_deep' : 'trap.shaft');
  // a flyer swoops down under control: no fall damage (UTOTYPE_NONE)
  fallToLevel(ctx, level, dst, !flying(ctx));
}

/**
 * The hero falls from `level` to level `dst` of its dungeon: a random spot there, `d(dist, 6)`
 * damage, then what is on the floor. ref: src/do.c goto_level() with `falling` (u_on_rndspot(),
 * do_fall_dmg, pickup(1))
 */
export function fallToLevel(ctx: Ctx, level: Readonly<Level>, dst: number, falling = true): void {
  const dist = dst - level.dlevel;
  ctx.goToLevel({ dungeon: level.dungeon, dlevel: dst }, 'random');
  if (falling) losehp(ctx, ctx.rng.d(Math.max(dist, 1), 6), '@killer.trap.mine_shaft');
  if (!ctx.state.gameOver) lookHere(ctx);
}

/** Monsters that see a trap go off learn about that kind. ref: src/mondata.c mons_see_trap() */
export function monsSeeTrap(ctx: Ctx, levelId: string, trap: Trap): void {
  const level = ctx.state.levels[levelId];
  if (!level) return;
  const opaque = cellRules(level, ctx.defs).opaque;
  const blocked = blockersOf(ctx, levelId);
  const maxdist = level.lit[cellIndex(level, trap.x, trap.y)] ? 7 * 7 : 2;
  for (const id of sortedIds(ctx.state)) {
    const mon = ctx.state.entities[String(id)];
    const p = mon?.c.pos;
    if (!mon?.c.monster || !p || p.level !== levelId) continue;
    const def = ctx.defs.monster(mon.def);
    if (def.flags.includes('animal') || def.flags.includes('mindless')) continue;
    if (def.flags.includes('noeyes')) continue; // !haseyes()
    if ((p.x - trap.x) ** 2 + (p.y - trap.y) ** 2 > maxdist) continue;
    if (!clearPath(level, opaque, p.x, p.y, trap.x, trap.y, blocked)) continue; // m_cansee()
    monLearnsTraps(ctx, id, trap.def);
  }
}

/**
 * The hero sets off the trap she is standing on. ref: src/trap.c dotrap(): a seen trap is
 * escaped one time in five ("You escape a bear trap."), unless she jumped into a hole on
 * purpose (`plunged`) or the trap is forced on her (`force`: FORCETRAP, e.g. a wand of locking).
 * In Sokoban a pit or hole is never escaped: "Air currents pull you down into a pit!". Elsewhere a
 * floating hero passes over a trap set off by the floor ("You float over a pit." when it is
 * seen). The hero never flies or fumbles.
 */
export function dotrap(
  ctx: Ctx,
  trap: Trap,
  opts: { plunged?: boolean; force?: boolean; from?: Pos; noWebMsg?: boolean } = {},
): void {
  const levelId = heroPos(ctx).level;
  const t = liveTrap(ctx, levelId, trap) ?? trap;
  // conj_pit || adj_pit: stepping from a pit into the next one is never escaped
  const fromPit = isPit(t.def) && pitApproach(ctx, levelId, t, opts.from).adj;
  ctx.interrupt(); // nomul(0)
  // "KMH -- You can't escape the Sokoban level traps"
  if (sokobanTrap(ctx, levelId, t)) say(ctx, 'trap.air_currents', { trap: trapName(t) });
  else if (!opts.force) {
    // floor_trigger() && check_in_air(): u_locomotion("step") is "float" or "fly"; a flyer who
    // plunged in does not fly over
    if (floorTrigger(t.def) && (levitating(ctx) || (flying(ctx) && !opts.plunged))) {
      if (t.seen)
        say(ctx, levitating(ctx) ? 'trap.float_over' : 'trap.fly_over', { trap: trapName(t) });
      return;
    }
    if (t.seen && t.def !== TRAP.antiMagic && !opts.plunged && !fromPit && ctx.rng.rn2(5) === 0) {
      say(ctx, 'trap.escape', { trap: trapName(t) });
      return;
    }
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
    case TRAP.pit:
    case TRAP.spikedPit:
      return pitYou(ctx, levelId, t, opts.plunged === true, opts.from);
    case TRAP.trapdoor:
    case TRAP.hole:
      return fallThrough(ctx, levelId, t, opts.plunged === true);
    case TRAP.tele:
      seetrap(t);
      return teleTrap(ctx);
    case TRAP.levelTele:
      seetrap(t);
      return levelTeleTrap(ctx, levelId, t, opts.force === true);
    case TRAP.web:
      return webYou(ctx, levelId, t, opts.force === true, opts.noWebMsg !== true);
    default:
      // the magic traps (magictrap.ts); another mod's trap: its effects are that mod's business
      lateEffects[t.def]?.you(ctx, t);
      return;
  }
}

/**
 * spoteffects(): the trap under the hero, if any, goes off. `from` is where she stepped from
 * (u.ux0, u.uy0), for pits next to each other. ref: src/hack.c spoteffects()
 */
export function spotTrap(ctx: Ctx, from?: Pos): void {
  const p = heroPos(ctx);
  const level = ctx.state.levels[p.level];
  const t = level ? trapAt(level, p.x, p.y) : undefined;
  if (t && !ctx.state.gameOver) dotrap(ctx, t, from ? { from } : {});
}

/** m_easy_escape_pit(): huge monsters (no pit fiend exists); the hero is never huge. */
const mEasyEscapePit = (ctx: Ctx, mon: Entity): boolean => {
  const size = ctx.defs.monster(mon.def).size;
  return size === 'huge' || size === 'gigantic';
};

/**
 * Trying to climb out of a pit: each try takes one turn off `u.utrap`; at zero "You crawl to the
 * edge of the pit." (she stays on the square), else "You are still in a pit.". With a boulder
 * on the square, one try in two her leg gets stuck in a crevice instead.
 * Floating in a Sokoban pit, she "struggles against the air currents and floats" to the edge.
 * ref: src/trap.c climb_pit() (no Passes_walls, Flying, clinging or steed;
 * fill_pit() is not needed: a boulder never rests on a pit, flooreffects() always fills it)
 */
export function climbPit(ctx: Ctx): void {
  const u = utrap(ctx);
  if (!u || u.type !== 'pit') return;
  const p = heroPos(ctx);
  if (ctx.rng.rn2(2) === 0 && boulderAt(ctx, p.level, p.x, p.y)) {
    say(ctx, 'trap.pit.crevice');
    say(ctx, 'trap.pit.free_leg');
    return;
  }
  const n = u.n - 1;
  setUtrap(ctx, n, 'pit');
  if (n === 0)
    say(
      ctx,
      isSokoban(getLevel(ctx.state, p.level)) && levitating(ctx)
        ? 'trap.pit.float_out'
        : 'trap.pit.crawl_out',
    );
  else say(ctx, 'trap.pit.still_in'); // u.dz || flags.verbose
}

/**
 * Moving while caught in a trap. Bear trap: "You are caught in a bear trap." and a diagonal
 * move, or one time in five, loosens it; at zero "You finally wriggle free.". Pit: a seen pit
 * at the destination (`desttrap`) is stepped into without climbing out, else climb_pit(). Web:
 * each try takes one turn off, "You are stuck to the web." / "You disentangle yourself." (no
 * Sting).
 * Returns true if the hero may move (she never does on the turn she gets free).
 * ref: src/hack.c trapmove() TT_BEARTRAP, TT_PIT (as 3.6's domove() calls it, with the trap at
 * the destination; 3.7's domove_core() passes NULL, see DEVIATIONS "Traps: the hero")
 */
export function trapmove(ctx: Ctx, dir: Dir, desttrap?: Trap | null): boolean {
  const u = utrap(ctx);
  if (!u) return true;
  if (u.type === 'pit') {
    if (desttrap?.seen && isPit(desttrap.def)) return true; // move into adjacent pit
    climbPit(ctx);
    return false;
  }
  if (u.type === 'web') {
    const n = u.n - 1;
    setUtrap(ctx, n, 'web');
    say(ctx, n ? 'trap.web.stuck' : 'trap.web.disentangle'); // (Norep, flags.verbose)
    return false;
  }
  say(ctx, 'trap.bear.caught');
  let n = u.n;
  if ((DIRS[dir].x !== 0 && DIRS[dir].y !== 0) || ctx.rng.rn2(5) === 0) n--;
  setUtrap(ctx, n, 'beartrap');
  if (n === 0) say(ctx, 'trap.bear.free');
  return false;
}

/**
 * The seen trap at `to` the hero must confirm stepping onto, or null. Rust traps are harmless
 * when she wears nothing rustprone, and the ground traps while she floats (not Sokoban's pits
 * and holes). ref: src/hack.c avoid_trap_andor_region() with
 * paranoid_confirm:trap (on by default) and immune_to_trap(); never when stunned or confused.
 */
export function trapToConfirm(ctx: Ctx, to: Pos): Trap | null {
  const hero = heroEnt(ctx);
  if (hasProp(hero, P.STUNNED) || hasProp(hero, P.CONFUSION)) return null;
  const level = getLevel(ctx.state);
  const t = trapAt(level, to.x, to.y);
  if (!t?.seen) return null;
  // immune_to_trap(): ground-based traps, which can be evaded by levitation or flight
  if (
    uInAir(ctx) &&
    (t.def === TRAP.bear ||
      t.def === TRAP.squeaky ||
      t.def === TRAP.landmine ||
      t.def === TRAP.rolling ||
      isPit(t.def) ||
      isHole(t.def)) &&
    !(isSokoban(level) && (isPit(t.def) || isHole(t.def)))
  )
    return null;
  // "not dangerous in Sokoban"
  if (t.def === TRAP.rolling && isSokoban(level)) return null;
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
export const intoTrap = (def: DefId): boolean =>
  def === TRAP.bear || def === TRAP.hole || def === TRAP.web || isPit(def);

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
 * ref: src/trap.c m_harmless_trap()
 */
export function mHarmlessTrap(ctx: Ctx, mon: Entity, trap: Trap): boolean {
  const def = ctx.defs.monster(mon.def);
  const lvl = mon.c.pos ? ctx.state.levels[mon.c.pos.level] : undefined;
  const soko = !!lvl && isSokoban(lvl);
  // `!Sokoban && floor_trigger() && check_in_air()`
  if (!soko && floorTrigger(trap.def) && inAir(ctx, mon)) return true;
  switch (trap.def) {
    case TRAP.bear:
      return (
        def.size === 'tiny' ||
        def.size === 'small' ||
        def.flags.includes('amorphous') ||
        def.flags.includes('whirly') ||
        def.flags.includes('unsolid')
      );
    case TRAP.rolling:
      return soko; // the Sokoban rolling boulder traps are not dangerous
    case TRAP.sleepGas:
      return def.resists.includes('sleep');
    case TRAP.rust:
      return def.id !== 'nh:iron_golem';
    case TRAP.pit:
    case TRAP.spikedPit:
    case TRAP.trapdoor:
    case TRAP.hole:
      return def.flags.includes('cling') && !soko;
    case TRAP.web:
      return (
        def.flags.includes('amorphous') ||
        webmaker(def) ||
        isWhirly(def) ||
        def.flags.includes('unsolid')
      );
    case TRAP.statue:
      return true;
    case TRAP.magic:
      return true; // usually
    case TRAP.antiMagic:
      return resistsMagm(ctx, mon); // (nothing grants AD_MAGM defense to a monster here)
    default:
      return false;
  }
}

/**
 * A trap's missile (or a forced `dOverride` hit) on a monster. Returns true if it died.
 * ref: src/trap.c thitm(): `find_mac(mon) + tlev + obj->spe <= rnd(20)` hits; a missile that
 * missed (or a falling rock) lands on its square.
 */
export function thitm(
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

export const caughtOr = (ctx: Ctx, mon: Entity, killed: boolean): TrapResult =>
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
    const opaque = cellRules(level, ctx.defs).opaque;
    const could = clearPath(level, opaque, hp.x, hp.y, p.x, p.y, blockersOf(ctx, level.id));
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

/**
 * A monster falls into a pit: held (mtrapped) and hurt `rnd(6)` (`rnd(10)` on spikes unless it
 * wears iron shoes). Flyers, floaters and clingers (every level has a ceiling) do not fall in,
 * except in Sokoban, where they are dragged in. ref: src/trap.c trapeffect_pit() for a monster
 * (no worms, passes_walls or mselftouch())
 */
function pitMon(ctx: Ctx, levelId: string, mon: Entity, trap: Trap): TrapResult {
  const def = ctx.defs.monster(mon.def);
  const inSight = canseemon(ctx, mon);
  let dragged = false;
  if (inAir(ctx, mon) || def.flags.includes('cling')) {
    // !grounded(): only a Sokoban pit is inescapable
    if (!sokobanTrap(ctx, levelId, trap)) return 'finished';
    dragged = true; // fallverb = "is dragged"
  }
  setMtrapped(ctx, mon.id, true);
  if (inSight) {
    say(ctx, dragged ? 'trap.pit.mon_dragged' : 'trap.pit.mon_falls', { mon: monNam(ctx, mon) });
    seetrap(trap);
  }
  const spikes = trap.def === TRAP.spikedPit && !ironShoes(ctx, mon.id);
  const killed = thitm(ctx, 0, mon, null, ctx.rng.rnd(spikes ? 10 : 6));
  return caughtOr(ctx, mon, killed);
}

/** ref: trapeffect_web(): the big monsters that tear through webs */
const TEARS_WEBS: readonly DefId[] = [
  'nh:titanothere',
  'nh:baluchitherium',
  'nh:purple_worm',
  'nh:jabberwock',
  'nh:iron_golem',
  'nh:balrog',
  'nh:kraken',
  'nh:mastodon',
  'nh:orion',
  'nh:norn',
  'nh:cyclops',
  'nh:lord_surtur',
];

/**
 * A monster in a web: a webmaker walks it, the ones that go through webs do
 * (mu_maybe_destroy_web()); giants (and the TEARS_WEBS list) tear through it ("The purple worm
 * tears through a spider web!"); anything else is caught ("The jackal is caught in a spider
 * web."; an owlbear or bugbear out of sight roars). Forced and not caught: "The X avoids a
 * spider web!". ref: src/trap.c trapeffect_web() for a monster (no dragons or long worms exist)
 */
function webMon(ctx: Ctx, levelId: string, mon: Entity, trap: Trap, force: boolean): TrapResult {
  const def = ctx.defs.monster(mon.def);
  const inSight = canseemon(ctx, mon);
  if (webmaker(def)) return 'finished';
  if (muMaybeDestroyWeb(ctx, levelId, mon, inSight, trap)) return 'finished';
  let tearWeb = false;
  if (TEARS_WEBS.includes(def.id)) tearWeb = true;
  else if ((def.id === 'nh:owlbear' || def.id === 'nh:bugbear') && !inSight) {
    say(ctx, 'trap.web.roaring');
    setMtrapped(ctx, mon.id, true);
  } else {
    // S_GIANT; (S_DRAGON && extra_nasty(), long worms with more than 5 segments: none here)
    if (def.glyph.ch === 'H') tearWeb = true;
    else if (inSight) {
      say(ctx, 'trap.web.mon_caught', { mon: monNam(ctx, mon) });
      seetrap(trap);
    }
    setMtrapped(ctx, mon.id, !tearWeb);
  }
  if (tearWeb) {
    if (inSight) say(ctx, 'trap.web.mon_tears', { mon: monNam(ctx, mon) });
    deltrap(ctx, levelId, trap);
  } else if (force && !isMtrapped(ctx, mon.id)) {
    if (inSight) {
      say(ctx, 'trap.web.mon_avoids', { mon: monNam(ctx, mon) });
      seetrap(trap);
    }
  }
  return isMtrapped(ctx, mon.id) ? 'caught' : 'finished';
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

type SplitMon = (ctx: Ctx, id: EntityId, monMoving: boolean) => EntityId | null;
/** split_mon(): clone.ts registers it (it sits above trap.ts, through dog.ts) */
let splitMonFn: SplitMon | null = null;
export function setSplitMon(fn: SplitMon): void {
  splitMonFn = fn;
}

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
  // completelyrusts() (iron golems): not in the roster
  if (mon.def === 'nh:gremlin' && ctx.rng.rn2(3)) splitMonFn?.(ctx, id, true);
  return caughtOr(ctx, mon, false);
}

/**
 * A monster falls to a deeper level and waits there until the hero arrives.
 * ref: src/trap.c trapeffect_hole() (not grounded or huge: nothing happens, except that a
 * Sokoban hole "yanks" it down),
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
  ) {
    if (!sokobanTrap(ctx, levelId, trap)) return 'finished';
    // inescapable: a Sokoban hole
    if (canseemon(ctx, mon)) {
      say(ctx, 'trap.hole.mon_yanked', { mon: monNam(ctx, mon) });
      seetrap(trap);
    }
  }
  if (ustuck(ctx) === mon.id) return 'finished'; // probably a vortex
  const level = getLevel(ctx.state, levelId);
  let dst = dataOf(trap).dst;
  if (dst === undefined || dst <= level.dlevel) {
    dst = holeDestination(ctx, level);
    setTrapData(trap, { dst });
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
 * With `force` (FORCETRAP, e.g. a wand of locking or opening), or on a Sokoban pit or hole, the
 * trap cannot be avoided. ref: src/trap.c mintrap(). Not ported: metallivores eating bear traps, hiders.
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
    const pit = isPit(trap.def);
    if (
      !trap.seen &&
      canseemon(ctx, mon) &&
      (trap.def === TRAP.bear || trap.def === TRAP.hole || trap.def === TRAP.web || pit)
    )
      seetrap(trap);
    // (a boulder never rests on a pit here, so the "pulls free..." fill_pit() case is not needed)
    if (ctx.rng.rn2(40) === 0 || (pit && mEasyEscapePit(ctx, mon))) {
      if (canseemon(ctx, mon)) {
        if (pit)
          say(
            ctx,
            mEasyEscapePit(ctx, mon) ? 'trap.pit.mon_climbs_easily' : 'trap.pit.mon_climbs',
            {
              mon: monNam(ctx, mon),
            },
          );
        else if (trap.def === TRAP.bear || trap.def === TRAP.web)
          say(ctx, 'trap.mon_pulls_free', { mon: monNam(ctx, mon), trap: trapName(trap) });
      }
      setMtrapped(ctx, monId, false);
    }
    return isMtrapped(ctx, monId) ? 'caught' : 'finished';
  }
  const def = ctx.defs.monster(mon.def);
  const alreadySeen =
    monKnowsTraps(ctx, monId, trap.def) ||
    (trap.def === TRAP.hole && !def.flags.includes('mindless'));
  if (!TRAPS.some((t) => t.id === trap.def)) return 'finished'; // another mod's trap
  // "Sokoban && (is_pit(tt) || is_hole(tt))": the trap effects handle it
  if (!opts.force && !sokobanTrap(ctx, p.level, trap)) {
    if (floorTrigger(trap.def) && inAir(ctx, mon)) return 'finished'; // check_in_air()
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
    case TRAP.pit:
    case TRAP.spikedPit:
      return pitMon(ctx, p.level, mon, trap);
    case TRAP.tele:
      mteleTrap(ctx, mon, trap, canseemon(ctx, mon));
      return 'moved'; // trapeffect_telep_trap(): Trap_Moved_Mon whatever happened
    case TRAP.levelTele:
      return mlevelTeleTrap(ctx, mon, trap, canseemon(ctx, mon));
    case TRAP.trapdoor:
    case TRAP.hole:
      return holeMon(ctx, p.level, mon, trap);
    case TRAP.web:
      return webMon(ctx, p.level, mon, trap, opts.force === true);
    default:
      return lateEffects[trap.def]?.mon(ctx, mon, trap) ?? 'finished';
  }
}

/**
 * A monster on a teleportation trap lands on a random spot of the level, unless the level forbids
 * teleporting: "The jackal seems disoriented." or "The jackal suddenly disappears!" when seen.
 * ref: src/teleport.c mtele_trap() (no leashes, vault teleporters or fixed destinations)
 */
function mteleTrap(ctx: Ctx, mon: Entity, trap: Trap, inSight: boolean): void {
  const p = mon.c.pos;
  const level = p ? ctx.state.levels[p.level] : undefined;
  // no feedback: a monster stepping on a trap and not teleporting from it isn't visible
  if (!level || noteleportLevel(ctx, level)) return;
  const monname = monNam(ctx, mon); // with pre-movement visibility
  rlocMon(ctx, mon, false);
  if (inSight) {
    say(ctx, canseemon(ctx, mon) ? 'tele.mon_disoriented' : 'tele.mon_disappears', {
      mon: monname,
    });
    seetrap(trap);
  }
}

/**
 * A monster on a level teleporter goes to a random level (C's random_teleport_level() from the
 * hero's level, which is its own), confused, and waits there for the hero: "Suddenly, the jackal
 * disappears out of sight." when seen, "The jackal shudders for a moment." when the level comes
 * up the same. ref: src/teleport.c mlevel_tele_trap() (LEVEL_TELEP; no Amulet, endgame or leashes)
 */
function mlevelTeleTrap(ctx: Ctx, mon: Entity, trap: Trap, inSight: boolean): TrapResult {
  if (ustuck(ctx) === mon.id) return 'finished'; // probably a vortex
  const p = mon.c.pos;
  const level = p ? ctx.state.levels[p.level] : undefined;
  if (!level) return 'finished';
  const nlev = randomTeleportLevel(ctx, level);
  if (nlev === dungeonLayout(ctx.state, level.dungeon).depthStart + level.dlevel - 1) {
    if (inSight) say(ctx, 'tele.mon_shudders', { mon: monNam(ctx, mon) });
    return 'finished';
  }
  const to = levelAtDepth(ctx, level, nlev); // get_level()
  if (inSight) {
    say(ctx, 'tele.mon_out_of_sight', { mon: monNam(ctx, mon) });
    seetrap(trap);
  }
  setMConfused(ctx, mon.id, true); // is_xport() && !control_teleport()
  migrateToLevel(ctx, mon, levelIdFor(ctx.state, to));
  return 'moved'; // no longer on this level
}

/** True when the outcome means the monster left its square (died or fell). */
export const trapRemovedMon = (r: TrapResult): boolean => r === 'killed' || r === 'moved';

// ---------------------------------------------------------------------------------------------
// teleporting the hero, monsters and objects (here because teleds() ends in dotrap() and the
// teleport traps call back into it; teleport.ts finds the spots)

/** ref: couldsee(x, y): a clear line from the hero to (x, y), lit or not */
function couldsee(ctx: Ctx, x: number, y: number): boolean {
  const p = heroPos(ctx);
  const level = ctx.state.levels[p.level];
  if (!level || !inBounds(level, x, y)) return false;
  return clearPath(
    level,
    cellRules(level, ctx.defs).opaque,
    p.x,
    p.y,
    x,
    y,
    blockersOf(ctx, p.level),
  );
}

/**
 * The hero moves at once to (x, y) of her level: out of any trap and grip, "You materialize in a
 * different location!" for a teleport (`teleport`), then spoteffects(): shop and room entry or
 * exit (walking out of a shop with its goods is robbery), the things here and the trap here (a
 * pit before the things, as a step). The view catches up at the end of the step.
 * ref: src/teleport.c teleds() (no ball and chain, engulfing, steeds, vaults or regions)
 */
export function teleds(ctx: Ctx, x: number, y: number, opts: { teleport?: boolean } = {}): void {
  const h = heroEnt(ctx);
  const p = heroPos(ctx);
  const u = utrap(ctx);
  if (u) setUtrap(ctx, 0, u.type); // reset_utrap(FALSE)
  setUstuck(ctx, null);
  const from = { x: p.x, y: p.y }; // u.ux0, u.uy0
  h.c.pos = { level: p.level, x, y }; // u_on_newpos()
  ctx.emit({ type: 'moved', id: h.id, from, to: { x, y } });
  ctx.interrupt(); // nomul(0)
  if (opts.teleport)
    say(ctx, x === from.x && y === from.y ? 'tele.materialize_same' : 'tele.materialize_different');
  // spoteffects(TRUE)
  checkSpecialRoom(ctx, false, from);
  const level = getLevel(ctx.state, p.level);
  const t = trapAt(level, x, y);
  if (t && isPit(t.def)) {
    spotTrap(ctx);
    if (!ctx.state.gameOver) lookHere(ctx);
  } else {
    lookHere(ctx);
    if (!ctx.state.gameOver) spotTrap(ctx);
  }
}

/**
 * The hero teleports to a random safe spot of her level; false when there is none.
 * ref: src/teleport.c safe_teleds(TELEDS_TELEPORT)
 */
export function safeTeleds(ctx: Ctx): boolean {
  const level = getLevel(ctx.state, heroPos(ctx).level);
  const to = safeTeledsPos(ctx, level);
  if (!to) return false;
  teleds(ctx, to.x, to.y, { teleport: true });
  return true;
}

/**
 * NetHack's `Teleport_control && !Stunned`: the hero steers her own teleports (the ring of
 * teleport control, a tengu corpse).
 */
export function teleControlled(ctx: Pick<Ctx, 'state'>): boolean {
  const h = getPlayer(ctx.state);
  return hasProp(h, P.TELEPORT_CONTROL) && !hasProp(h, P.STUNNED);
}

/**
 * The prompt handler of every controlled teleport but wizard ^T: the position prompt of
 * {@link tele}, the level prompt of {@link levelTele} and its "Go to Nowhere" question. Offered
 * nowhere (only those ask).
 */
export const TELE_ID: DefId = 'nh:tele';

/** What a teleport prompt carries to its answer. */
interface TeleData {
  stage: 'tele' | 'level' | 'nowhere';
  /** The move's energy, spent with the answer (a read leaves it to the answer; others paid it). */
  cost: number;
  /** A teleportation trap (tele_trap()'s guard) or a level teleporter (its messages after). */
  trap?: true;
  /** level_tele()'s `trycnt`: level prompts asked so far. */
  tries?: number;
}

export interface TeleOptions {
  /** A blessed scroll of teleportation: controlled even without Teleport_control. */
  blessed?: boolean;
  /** The move's energy when a prompt is raised, spent by the answer (default 0: already paid). */
  cost?: number;
  /** Set by tele_trap(). */
  trap?: boolean;
}

const teleData = (stage: TeleData['stage'], cost: number, trap: boolean): TeleData => ({
  stage,
  cost,
  ...(trap ? { trap: true as const } : {}),
});

/**
 * The hero teleports within the level: "A mysterious force prevents you from teleporting!" on a
 * no-teleport level; with teleport control or a blessed scroll, and not stunned, "Where do you
 * want to be teleported?" and the position prompt (answered through {@link TELE_ID}); else to a
 * random safe spot. Reading the scroll always makes it known, so the reader learns it whatever
 * happens. While another prompt is pending (two in one turn) the teleport is random.
 * ref: src/teleport.c tele(), scrolltele() (no Amulet, Wizard's Tower or wizard mode)
 */
export function tele(ctx: Ctx, opts: TeleOptions = {}): void {
  const level = getLevel(ctx.state, heroPos(ctx).level);
  if (noteleportLevel(ctx, level)) {
    say(ctx, 'tele.mysterious_force');
    return;
  }
  const h = heroEnt(ctx);
  if (
    (hasProp(h, P.TELEPORT_CONTROL) || opts.blessed === true) &&
    !hasProp(h, P.STUNNED) &&
    ctx.state.pendingPrompt === null
  ) {
    const data = teleData('tele', opts.cost ?? 0, opts.trap === true);
    askTeleport(ctx, TELE_ID, data as unknown as Json); // unconscious: random already
    return;
  }
  safeTeleds(ctx);
}

/**
 * The controlled half of scrolltele(): "Being unconscious, you cannot control your teleport."
 * (then a random teleport), else the position prompt "Where do you want to be teleported?",
 * whose answer `handler` passes to {@link answerTeleport}. The cursor starts on the hero (C:
 * `iflags.travelcc` when set; dotele() clears it first). True when the prompt was raised.
 * ref: src/teleport.c scrolltele() (the Teleport_control / wizard branch; no steed)
 */
export function askTeleport(ctx: Ctx, handler: DefId, data: Json): boolean {
  if (unaware(ctx)) {
    say(ctx, 'tele.unconscious_control');
    safeTeleds(ctx);
    return false;
  }
  askPosition(ctx, 'tele.where_to', handler, data, { id: 'tele-where' });
  return true;
}

/**
 * The answer to {@link askTeleport}: null aborts (nothing happens); a spot she may land on
 * (teleok(), traps refused) is where she materializes; anything else is "Sorry..." and a
 * random teleport.
 * ref: src/teleport.c scrolltele() after getpos()
 */
export function answerTeleport(ctx: Ctx, value: Json): void {
  const cc = positionAnswer(value);
  if (!cc) return; // abort
  const level = getLevel(ctx.state, heroPos(ctx).level);
  if (teleok(ctx, level, cc.x, cc.y, false)) {
    teleds(ctx, cc.x, cc.y, { teleport: true });
    return;
  }
  say(ctx, 'tele.sorry');
  safeTeleds(ctx);
}

/** The hero's depth (C's depth(&u.uz)). */
function heroDepth(ctx: Ctx, level: Readonly<Level>): number {
  return dungeonLayout(ctx.state, level.dungeon).depthStart + level.dlevel - 1;
}

/**
 * A level teleport: "You feel very disoriented for a moment." in Sokoban; with teleport control
 * (and not stunned) the prompt "To what level do you want to teleport?" (answered through
 * {@link TELE_ID}); else a random level: "You shudder for a moment." when it is this one, else
 * a random spot of the level at that depth ("You materialize on a different level!"). Leaving a
 * shop this way is leaving it by the stairs. A level teleporter's own messages (`trap`) come
 * once level_tele() is over, before the deferred goto_level() at the end of the turn (C's
 * schedule_goto()), on every outcome.
 * ref: src/teleport.c level_tele() (no Amulet, endgame, quest, Knox, Gehennom, leashed pets or
 * level names), random_teleport_level(); src/dungeon.c get_level()
 */
export function levelTele(ctx: Ctx, opts: { cost?: number; trap?: boolean } = {}): void {
  const level = getLevel(ctx.state, heroPos(ctx).level);
  const trap = opts.trap === true;
  if (level.dungeon === SOKOBAN_DUNGEON) {
    say(ctx, 'tele.very_disoriented');
    levelTeleTrapAfter(ctx, trap);
    return;
  }
  if (teleControlled(ctx) && ctx.state.pendingPrompt === null) {
    askLevel(ctx, { ...teleData('level', opts.cost ?? 0, trap), tries: 0 });
    return;
  }
  randomLevtport(ctx, trap);
}

/** One round of level_tele()'s getlin() loop. */
function askLevel(ctx: Ctx, data: TeleData): void {
  const tries = (data.tries ?? 0) + 1;
  ctx.ask(
    {
      id: 'tele-level',
      kind: 'text',
      // `++trycnt == 2` adds the hint, which stays for later tries
      key: tries >= 2 ? 'tele.level_prompt_again' : 'tele.level_prompt',
      maxLength: 32,
    },
    TELE_ID,
    { ...data, tries } as unknown as Json,
  );
}

/** C's atoi(): optional blanks and sign, then digits; 0 when there are none. */
function atoi(buf: string): number {
  const m = /^\s*([-+]?\d+)/.exec(buf);
  return m?.[1] ? parseInt(m[1], 10) : 0;
}

const isDigit = (c: string | undefined): boolean => c !== undefined && c >= '0' && c <= '9';

/**
 * The answer to the level prompt: "*" is a random level; a confused hero says "Oops..." and goes
 * to a random level 4 times in 5 (rnl(5)), even when she cancels; cancelling stays put; text that
 * is not a number asks again, up to 10 tries, then a random level; 0 asks "Go to Nowhere.  Are
 * you sure?"; any other number is the depth to go to.
 * ref: src/teleport.c level_tele() (the Teleport_control loop; lev_by_name() is not ported)
 */
function answerLevel(ctx: Ctx, value: Json, data: TeleData): void {
  const trap = data.trap === true;
  const buf = typeof value === 'string' ? value : null;
  if (buf === '*') return randomLevtport(ctx, trap);
  if (hasProp(heroEnt(ctx), P.CONFUSION) && rnl(ctx.rng, 5, luckOf(ctx.state)) !== 0) {
    say(ctx, 'tele.oops');
    return randomLevtport(ctx, trap);
  }
  if (buf === null) return levelTeleTrapAfter(ctx, trap); // cancelled
  const newlev = atoi(buf);
  const tries = data.tries ?? 1;
  const number = isDigit(buf[0]) || (buf[0] === '-' && isDigit(buf[1]));
  if (newlev === 0 && !number && tries < 10) return askLevel(ctx, data);
  // no dungeon escape via this route
  if (newlev === 0) {
    if (tries >= 10) return randomLevtport(ctx, trap);
    ctx.ask(
      { id: 'tele-nowhere', kind: 'yn', key: 'tele.nowhere_confirm', cancellable: true },
      TELE_ID,
      { ...data, stage: 'nowhere' } as unknown as Json,
    );
    return;
  }
  levelTeleTo(ctx, newlev, trap);
}

/**
 * "Go to Nowhere.  Are you sure?" answered: yes is suicide ("You scream in agony as your body
 * begins to warp..."); surviving it (life saving) rematerializes her where she was.
 * ref: src/teleport.c level_tele() `if (newlev == 0)`
 */
function answerNowhere(ctx: Ctx, value: Json, data: TeleData): void {
  const trap = data.trap === true;
  if (value !== true) return levelTeleTrapAfter(ctx, trap);
  say(ctx, 'tele.nowhere_warp');
  say(ctx, 'tele.nowhere_cease');
  const p = heroPos(ctx);
  const invent = inventoryOf(ctx.state, ctx.state.playerId).length > 0;
  if (invent)
    say(ctx, 'tele.nowhere_thud', {
      surface: surfaceKey(ctx, getLevel(ctx.state, p.level), p.x, p.y),
    });
  done(ctx, '!@killer.tele.suicide');
  if (ctx.state.gameOver) return;
  say(ctx, 'tele.nowhere_coalesce');
  say(ctx, invent ? 'tele.nowhere_rematerialize_gather' : 'tele.nowhere_rematerialize');
  levelTeleTrapAfter(ctx, trap);
}

/** level_tele()'s `random_levtport:` */
function randomLevtport(ctx: Ctx, trap: boolean): void {
  const level = getLevel(ctx.state, heroPos(ctx).level);
  const newlev = randomTeleportLevel(ctx, level);
  if (newlev === heroDepth(ctx, level)) {
    say(ctx, 'tele.shudder');
    levelTeleTrapAfter(ctx, trap);
    return;
  }
  levelTeleTo(ctx, newlev, trap);
}

/**
 * The rest of level_tele() once the depth is known. Above the dungeon (a negative depth): "You
 * arrive in heaven." at -10 or less (death), Cloud 9 at -9, else "You are now high above the
 * clouds..."; she floats down to earth when levitating (escaping the dungeon), else plummets to
 * her death; surviving a death there leaves her on the surface, out of the dungeon. Otherwise
 * the level at that depth (get_level()): "You can't get there from here." when that is this
 * level at another depth, nothing when it is this depth, else the goto.
 * ref: src/teleport.c level_tele() (no shop bills for the dead or escaped, no Flying)
 */
function levelTeleTo(ctx: Ctx, newlev: number, trap: boolean): void {
  const level = getLevel(ctx.state, heroPos(ctx).level);
  if (newlev < 0) {
    let killer: string | null = null;
    let escape: string | null = null;
    if (newlev <= -10) {
      say(ctx, 'tele.heaven');
      say(ctx, 'tele.heaven_admit');
      killer = '!@killer.tele.heaven';
    } else if (newlev === -9) {
      say(ctx, 'tele.cloud9_happy');
      say(ctx, 'tele.cloud9');
    } else say(ctx, 'tele.clouds');
    if (killer === null) {
      if (hasProp(heroEnt(ctx), P.LEVITATION)) escape = 'tele.escape_float';
      else {
        say(ctx, 'tele.cant_fly');
        say(ctx, 'tele.plummet');
        // "... fell to %s death", uhis()
        killer = uhimKey(ctx.state, '@killer.tele.plummet');
      }
    }
    if (killer !== null) {
      done(ctx, killer);
      if (ctx.state.gameOver) return;
      // can only get here via life-saving: the hero has now left the dungeon
      escape = 'tele.escape_surface';
    }
    say(ctx, escape ?? 'tele.escape_surface');
    levelTeleTrapAfter(ctx, trap);
    if (ctx.state.gameOver) return;
    // schedule_goto() to level 0: goto_level() -> done(ESCAPED)
    setEndHow(ctx, 'escaped');
    ctx.endGame({
      kind: 'escaped',
      killer: 'escaped',
      turn: ctx.state.turn,
      depth: 1,
      level: getPlayer(ctx.state).c.experience?.level ?? 1,
    });
    return;
  }
  const layout = dungeonLayout(ctx.state, level.dungeon);
  const to = levelAtDepth(ctx, level, newlev);
  if (to.dungeon === level.dungeon && to.dlevel === level.dlevel) {
    if (newlev !== heroDepth(ctx, level)) {
      const deepest = layout.depthStart + (layout.levels ?? dungeonBottom(ctx.state, level)) - 1;
      say(ctx, newlev > deepest ? 'tele.cant_get_there_anywhere' : 'tele.cant_get_there_here');
    }
    // the same depth: schedule_goto() to where she is does nothing
    levelTeleTrapAfter(ctx, trap);
    return;
  }
  levelTeleTrapAfter(ctx, trap);
  if (ctx.state.gameOver) return;
  ctx.goToLevel(to, 'random'); // schedule_goto() -> goto_level(): u_on_rndspot(), pickup(1)
  if (ctx.state.gameOver) return;
  lookHere(ctx);
  say(ctx, 'tele.materialize_level'); // the deferred goto's message
}

/** tele_trap()'s guard: a trap the hero lands on from a teleport trap does not go off. */
let inTeleTrap = false;

/**
 * The hero on a teleportation trap: "You feel a wrenching sensation." with magic resistance or on
 * a level that forbids teleporting, else a random teleport within the level.
 * ref: src/teleport.c tele_trap() (no endgame, leashes, vault teleporters or fixed destinations)
 */
export function teleTrap(ctx: Ctx): void {
  // a teleport could place the hero onto a second teleport trap; the recursive call from
  // spoteffects() must not trigger the trap at the destination
  if (inTeleTrap) return;
  inTeleTrap = true;
  try {
    const level = getLevel(ctx.state, heroPos(ctx).level);
    // shieldeff() with Antimagic is display only
    if (hasProp(heroEnt(ctx), P.ANTIMAGIC) || noteleportLevel(ctx, level))
      say(ctx, 'tele.wrenching');
    else tele(ctx, { trap: true });
  } finally {
    inTeleTrap = false;
  }
}

/**
 * The hero on a level teleporter: "You step onto a level teleport trap!" ("You trigger..." when
 * forced), "You feel a wrenching sensation." with magic resistance (unless forced), else the trap
 * is used up and she level-teleports (asked where with teleport control); then
 * {@link levelTeleTrapAfter}.
 * ref: src/teleport.c level_tele_trap() (no endgame)
 */
function levelTeleTrap(ctx: Ctx, levelId: string, trap: Trap, intentional: boolean): void {
  // "float onto" while levitating (u_locomotion())
  say(
    ctx,
    intentional ? 'tele.trap_level_trigger' : `tele.trap_level_${uLocomotion(ctx) ?? 'step'}`,
  );
  if (hasProp(heroEnt(ctx), P.ANTIMAGIC) && !intentional) {
    say(ctx, 'tele.wrenching');
    return;
  }
  deltrap(ctx, levelId, trap);
  levelTele(ctx, { trap: true });
}

/**
 * What a level teleporter adds once level_tele() is over (`trap`; nothing otherwise): "You
 * briefly feel centered." with teleport control ("oriented" when hallucinating), else "You feel
 * disoriented." ("even more" when confused) and 3 more turns of confusion.
 * ref: src/teleport.c level_tele_trap() after level_tele()
 */
function levelTeleTrapAfter(ctx: Ctx, trap: boolean): void {
  if (!trap || ctx.state.gameOver) return;
  const h = heroEnt(ctx);
  const control = hasProp(h, P.TELEPORT_CONTROL);
  if (hasProp(h, P.HALLUC) || control)
    say(ctx, hasProp(h, P.HALLUC) ? 'tele.briefly_oriented' : 'tele.briefly_centered');
  else say(ctx, hasProp(h, P.CONFUSION) ? 'tele.even_more_disoriented' : 'tele.disoriented');
  // in place of a magic portal's brief Stun, and only without control
  if (!control) makeConfused(ctx, timeoutLeft(ctx.state, h, P.CONFUSION) + 3, false);
}

/** The answer to a teleport prompt: see {@link TELE_ID}. */
export const teleAction: ActionDef = {
  id: TELE_ID,
  labelKey: 'action.nh:tele',
  handles: 'mod',
  offer: () => [],
  perform: () => 0,
  answer(ctx, value, raw) {
    const data = raw as unknown as TeleData;
    if (data.stage === 'tele') {
      if (data.trap) {
        // tele_trap()'s guard covers the landing, as when the trap teleports her at random
        inTeleTrap = true;
        try {
          answerTeleport(ctx, value);
        } finally {
          inTeleTrap = false;
        }
      } else answerTeleport(ctx, value);
    } else if (data.stage === 'level') answerLevel(ctx, value, data);
    else answerNowhere(ctx, value, data);
    // asked again: the move is spent with the last answer
    return ctx.state.pendingPrompt?.handler === TELE_ID ? 0 : data.cost;
  },
};

/**
 * Teleportitis: 1 turn in 85 she teleports within the level (not while praying).
 * ref: src/allmain.c moveloop_core() `Teleportation && !rn2(85)` (after regen_pw())
 */
export function registerTeleportitis(api: ModApi): void {
  api.on('endOfTurn', (ctx) => {
    if (ctx.state.gameOver || uState(ctx.state).uinvulnerable) return;
    if (hasProp(heroEnt(ctx), P.TELEPORT) && !ctx.rng.rn2(85)) tele(ctx);
  });
}

/**
 * The monster moves to (x, y) of its level: "The jackal vanishes and reappears close by.",
 * "The jackal vanishes!", "A jackal appears next to you!" (`domsg`, RLOC_MSG); a resident
 * shopkeeper taken out of his shop gets angry, and shop goods it carries out are stolen by the
 * hero; a trapped monster is checked against the trap where it lands.
 * ref: src/teleport.c rloc_to_core() (no worms, engulfing, hiders or STRAT_APPEARMSG)
 */
export function rlocTo(ctx: Ctx, mon: Entity, x: number, y: number, domsg: boolean): void {
  const p = mon.c.pos;
  if (!p) return;
  const oldx = p.x;
  const oldy = p.y;
  if (oldx === x && oldy === y) return; // that was easy
  const residentShk = eshkOf(ctx, mon.id) !== null && inhishop(ctx, mon.id);
  const hp = heroPos(ctx);
  const onHeroLevel = p.level === hp.level;
  let telemsg = false;
  if (domsg && onHeroLevel && canSpotMon(ctx, mon)) {
    if (couldsee(ctx, x, y) || telepathSenses(ctx.state, ctx.defs, mon)) telemsg = true;
    else say(ctx, 'tele.mon_vanishes', { mon: monNam(ctx, mon) });
  }
  mon.c.pos = { level: p.level, x, y };
  const stuck = ustuck(ctx);
  if (stuck === mon.id && Math.max(Math.abs(x - hp.x), Math.abs(y - hp.y)) > 1)
    setUstuck(ctx, null);
  if (domsg && onHeroLevel && canSpotMon(ctx, mon)) {
    const du = (x - hp.x) ** 2 + (y - hp.y) ** 2;
    const near = du <= 2 ? 'next' : du <= BOLT_LIM * BOLT_LIM ? 'close' : null;
    if (telemsg && (couldsee(ctx, x, y) || telepathSenses(ctx.state, ctx.defs, mon))) {
      const olddu = (oldx - hp.x) ** 2 + (oldy - hp.y) ** 2;
      const where = near ?? (olddu === du ? 'none' : du < olddu ? 'closer' : 'farther');
      say(ctx, 'tele.mon_vanishes_reappears', {
        mon: monNam(ctx, mon),
        where: { key: `tele.where.${where}` },
      });
    } else
      say(ctx, hasProp(heroEnt(ctx), P.BLINDED) ? 'tele.mon_arrives' : 'tele.mon_appears', {
        mon: monNam(ctx, mon),
        where: { key: `tele.where.${near ?? 'none'}` },
      });
  }
  // shopkeepers only teleport if you zap them with a wand of teleportation
  if (residentShk && !inhishop(ctx, mon.id)) makeAngryShk(ctx, mon.id);
  // a monster carrying shop goods out of the shop: the hero is blamed
  const inv = minvent(ctx, mon.id);
  if (onHeroLevel && inv.length > 0 && !costlySpot(ctx, x, y)) {
    const first = inv[0] as Entity;
    const shkp = findObjowner(ctx, first, oldx, oldy);
    const peaceful =
      shkp === null || ctx.state.entities[String(shkp)]?.c.monster?.peaceful === true;
    for (const o of inv) {
      const it = o.c.item;
      if (!it) continue;
      if (it.noCharge) delete it.noCharge;
      else if (shkp !== null && onbill(ctx, o.id, shkp))
        stolenValue(ctx, o, oldx, oldy, peaceful, false);
    }
  }
  // trapped monster teleported away
  if (isMtrapped(ctx, mon.id)) mintrap(ctx, mon.id);
}

/** ref: include/hack.h BOLT_LIM */
const BOLT_LIM = 8;

/**
 * The monster teleports to a random spot of its level; false when there is none.
 * ref: src/teleport.c rloc()
 */
export function rlocMon(ctx: Ctx, mon: Entity, domsg: boolean): boolean {
  const p = mon.c.pos;
  const level = p ? ctx.state.levels[p.level] : undefined;
  if (!level) return false;
  const to = rlocMonPos(ctx, level, mon);
  if (!to) return false;
  rlocTo(ctx, mon, to.x, to.y, domsg);
  return true;
}

/**
 * The hero teleports a monster (the wand's beam): a priest in a temple resists ("The priest of
 * Odin resists your magic!"), anything else lands on a random spot. False when it stays.
 * A wand of stasis in effect stops it: "A mysterious force prevents you teleporting the jackal!".
 * ref: src/teleport.c u_teleport_mon() (no engulfers, riders or monsters with teleport control
 * exist)
 */
export function uTeleportMon(ctx: Ctx, mon: Entity, feedback: boolean): boolean {
  const p = mon.c.pos;
  const level = p ? ctx.state.levels[p.level] : undefined;
  if (!p || !level) return false;
  if (inStasis(ctx.state, level.id)) {
    if (feedback) say(ctx, 'tele.stasis_mon', { mon: monNam(ctx, mon) });
    return false;
  }
  if (
    epriOf(ctx, mon.id) !== null &&
    inRooms(level, p.x, p.y).some((r) => level.rooms[r]?.type === TEMPLE)
  ) {
    if (feedback) say(ctx, 'tele.resists', { mon: monNam(ctx, mon) });
    return false;
  }
  return rlocMon(ctx, mon, true);
}

// ---------------------------------------------------------------------------------------------
// searching and looking

/**
 * Searching may find an unseen trap next to the hero. ref: src/detect.c dosearch0() `!rnl(8)`,
 * find_trap(); a statue trap is set off instead (activate_statue_trap()), which ends the search.
 * Returns 'found', 'statue' or null.
 */
export function findTrapAt(
  ctx: Ctx,
  level: Level,
  x: number,
  y: number,
  rnl8: () => number,
): 'found' | 'statue' | null {
  const t = trapAt(level, x, y);
  if (!t || t.seen || rnl8() !== 0) return null;
  ctx.interrupt(); // nomul(0)
  if (t.def === TRAP.statue) {
    lateEffects[t.def]?.you(ctx, t);
    return 'statue';
  }
  t.seen = true;
  say(ctx, 'trap.found', { trap: trapName(t) });
  return 'found';
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

/**
 * The seen hole, trap door or pit under the hero that '>' jumps into (not a pit she is already
 * in). ref: src/do.c dodown() uteetering_at_seen_pit(), uescaped_shaft()
 */
export function seenHoleHere(ctx: Ctx): Trap | null {
  const p = heroPos(ctx);
  const level = ctx.state.levels[p.level];
  const t = level ? trapAt(level, p.x, p.y) : undefined;
  if (!t?.seen) return null;
  if (isHole(t.def)) return t;
  return isPit(t.def) && utrap(ctx)?.type !== 'pit' ? t : null;
}

/** Jumping into a seen hole, trap door or pit with '>'. ref: src/do.c dodown() dotrap(TOOKPLUNGE) */
export function plunge(ctx: Ctx, t: Trap): number {
  dotrap(ctx, t, { plunged: true });
  return NORMAL_SPEED;
}

/**
 * The trap at her feet when she stops floating: none she is already caught in, and a hole or trap
 * door only where there is a level below and nothing holds her. ref: src/trap.c float_down()
 */
function floatDownTrap(ctx: Ctx, trap: Trap): void {
  if (trap.def === TRAP.statue) return;
  if (isHole(trap.def)) {
    const level = getLevel(ctx.state, heroPos(ctx).level);
    if (!canFallThru(ctx.state, level) || ustuck(ctx) !== null) return;
  }
  if (!utrap(ctx)) dotrap(ctx, trap);
}

export function registerTraps(api: ModApi): void {
  setFloatDownTrap(floatDownTrap);
  for (const t of TRAPS) api.defineTrap(t);
  for (const a of TRAP_ACTIONS) api.defineAction(a);
  api.on('levelChange', (ctx, change) => {
    if (change.from === null) return;
    // ref: src/do.c goto_level() reset_utrap(FALSE)
    const u = utrap(ctx);
    if (u) setUtrap(ctx, 0, u.type);
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
