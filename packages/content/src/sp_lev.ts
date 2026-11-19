// Making the contents of a LevelDef: monsters, objects and traps at fixed or random dry spots.
// ref: src/sp_lev.c create_monster(), create_object(), create_trap(), get_location(),
// is_ok_location(), pm_to_humidity()
import type {
  Ctx,
  DefId,
  DoorState,
  EntityId,
  Level,
  LevelContent,
  LevelCount,
  LevelDef,
  LevelRect,
  MapBlock,
  ModApi,
  MonsterDef,
  ObjectClass,
  Pos,
} from '@nh/core';
import {
  cellIndex,
  contents,
  inBounds,
  isPlainFloor,
  levelDefArea,
  levelDefPos,
  levelDefRoom,
  levelStairs,
  roomDefPos,
  roomHas,
  roomSomexy,
  trapAt,
  VANILLA_TERRAIN,
} from '@nh/core';
import { boulderAt } from './boulder';
import { premapDetect } from './detect';
import { makeEngrAt, type EngrType } from './engr';
import { isExtinct, isGenocided, isGone, propagate } from './vanquished';
import { makemon, mkclass } from './generation';
import { chamOf, vampshifted } from './chamstate';
import { setStrat } from './mstate';
import { newcham } from './newcham';
import { yourRace } from './race';
import { raceIs } from './urole';
import { polyWhenStoned } from './golem';
import { levelFlags } from './levelflags';
import { isLava, isPool } from './liquid';
import { setMappearance } from './mimicstate';
import { protFromShapeChangers } from './props';
import { mkobjAt, mksobjFull, rndmonnum } from './mkobj';
import {
  amphibiousMon,
  isEel,
  isFloater,
  isFlyer,
  isSwimmer,
  likesLava,
  noncorporeal,
} from './mondata';
import { mongone } from './mondeath';
import { minvent } from './mongear';
import { mkgold, removeFromInventory } from './items';
import { resistsSton } from './stonestate';
import { STATUE, setHistoric } from './statuestate';
import { mktrap } from './mklev';
import { setTer, ter } from './selection';
import { undestroyableTrap } from './invocation';
import {
  T,
  isFurnitureId,
  isObstructedId,
  isSdoorId,
  isWallId,
  setTerrain,
  terrainIdAt,
} from './terrain';

/**
 * A random spot that passes `ok`: in room `room` (outside its subrooms) when given, else inside
 * the LevelDef's map block when it has one, else the whole level. 100 random picks, then the
 * first in column order; null when there is none (C calls impossible()).
 * ref: src/sp_lev.c get_location() (with croom: somexy(); without: xstart, xsize of the map)
 */
function getLocation(
  ctx: Ctx,
  level: Level,
  def: LevelDef,
  ok: (p: Pos) => boolean,
  room?: number,
): Pos | null {
  if (room !== undefined) {
    for (let cpt = 0; cpt < 100; cpt++) {
      const p = roomSomexy(ctx.rng, level, room);
      if (p && ok(p)) return p;
    }
    const r = level.rooms[room];
    if (!r) return null;
    for (let x = r.lx; x <= r.hx; x++)
      for (let y = r.ly; y <= r.hy; y++)
        if (roomHas(level, room, x, y) && ok({ x, y })) return { x, y };
    return null;
  }
  const a = levelDefArea(def, level.width, level.height);
  for (let cpt = 0; cpt < 100; cpt++) {
    const p = { x: a.x + ctx.rng.rn2(a.w), y: a.y + ctx.rng.rn2(a.h) };
    if (ok(p)) return p;
  }
  for (let x = a.x; x < a.x + a.w; x++)
    for (let y = a.y; y < a.y + a.h; y++) if (ok({ x, y })) return { x, y };
  return null;
}

/** Furniture other than stairs: not DRY (C's DRY is ROOM, CORR, ICE, AIR or CLOUD). */
const NOT_DRY: ReadonlySet<DefId> = new Set([
  VANILLA_TERRAIN.fountain,
  VANILLA_TERRAIN.sink,
  VANILLA_TERRAIN.altar_lawful,
  VANILLA_TERRAIN.altar_neutral,
  VANILLA_TERRAIN.altar_chaotic,
  VANILLA_TERRAIN.altar_unaligned,
]);

/**
 * DRY: walkable ground that is not a door, a liquid (m15: pools, moats, lava sort before DOOR,
 * so SPACE_POS() refuses them) or a fountain, sink or altar, so floor, corridor, ice, clouds and
 * stairs, with no boulder on it. ref: src/sp_lev.c is_ok_location() DRY (`!bould`),
 * include/rm.h SPACE_POS()
 */
export function dry(ctx: Ctx, level: Level, p: Pos): boolean {
  const id = level.palette[level.cells[cellIndex(level, p.x, p.y)] ?? -1];
  if (id === undefined || NOT_DRY.has(id)) return false;
  const t = ctx.defs.terrain(id);
  return (
    t.passable &&
    t.door === undefined &&
    t.liquid === undefined &&
    !boulderAt(ctx, level.id, p.x, p.y)
  );
}

/** get_location() humidity bits. ref: include/sp_lev.h DRY, WET, HOT, SOLID */
const DRY = 1;
const WET = 2;
const HOT = 4;
const SOLID = 8;

/**
 * Where a monster of `def` may be put at random: dry ground, but water for sea monsters,
 * amphibians and swimmers (and nothing dry), water and lava too for flyers and floaters, rock for
 * wall-walkers and ghosts, lava for fire lovers. ref: src/sp_lev.c pm_to_humidity()
 */
function pmToHumidity(def: MonsterDef | null): number {
  let loc = DRY;
  if (!def) return loc;
  if (isEel(def) || amphibiousMon(def) || isSwimmer(def)) loc = WET;
  if (isFlyer(def) || isFloater(def)) loc |= HOT | WET;
  if (def.flags.includes('wallwalk') || noncorporeal(def)) loc |= SOLID;
  // likes_fire(): the fire vortex, the flaming sphere, likes_lava()
  if (def.id === 'nh:fire_vortex' || def.id === 'nh:flaming_sphere' || likesLava(def)) loc |= HOT;
  return loc;
}

/**
 * Rock (stone, walls, trees, secret doors and corridors: below POOL in C's terrain order) for
 * SOLID, DRY ground (a boulder only with SOLID), water for WET, lava for HOT.
 * ref: src/sp_lev.c is_ok_location()
 */
function isOkLocation(ctx: Ctx, level: Level, p: Pos, humidity: number): boolean {
  const id = level.palette[level.cells[cellIndex(level, p.x, p.y)] ?? -1];
  if (id === undefined) return false;
  const t = ctx.defs.terrain(id);
  // IS_OBSTRUCTED(typ): not passable, not a liquid, not iron bars or a door
  if (
    humidity & SOLID &&
    !t.passable &&
    t.liquid === undefined &&
    t.door === undefined &&
    id !== VANILLA_TERRAIN.iron_bars
  )
    return true;
  if (humidity & DRY) {
    if (dry(ctx, level, p)) return true;
    if (humidity & SOLID && boulderAt(ctx, level.id, p.x, p.y)) {
      // SPACE_POS() with a boulder, which a SOLID creature does not mind
      const t2 = ctx.defs.terrain(id);
      if (t2.passable && t2.door === undefined && t2.liquid === undefined && !NOT_DRY.has(id))
        return true;
    }
  }
  if (humidity & WET && isPool(ctx, level, p.x, p.y)) return true;
  if (humidity & HOT && isLava(ctx, level, p.x, p.y)) return true;
  return false;
}

/** A random DRY spot inside the LevelDef's map block (or the level): get_location(DRY). */
export function randomDrySpot(ctx: Ctx, level: Level, def: LevelDef): Pos | null {
  return getLocation(ctx, level, def, (p) => dry(ctx, level, p));
}

/** ref: nhlua math.random(min, max) = min + rn2(max - min + 1) */
function rollCount(ctx: Ctx, count: LevelCount | undefined): number {
  if (count === undefined) return 1;
  if (typeof count === 'number') return count;
  return count.min + ctx.rng.rn2(count.max - count.min + 1);
}

/**
 * The entry's fixed spot (in a room: relative to its top-left floor cell, core's roomDefPos;
 * else relative to the map block when there is one, else Level coordinates where a negative
 * value counts from the far edge, core's levelDefPos), or a random dry one. A fixed spot is used
 * as it is, with no terrain check. ref: src/sp_lev.c get_location() `if (*x >= 0)` (normal
 * locations), get_location_coord()
 * @throws RangeError for a spot outside the level
 */
function contentSpot(
  ctx: Ctx,
  level: Level,
  c: LevelContent,
  def: LevelDef,
  room?: number,
): Pos | null {
  if (c.x === undefined || c.y === undefined)
    return getLocation(ctx, level, def, (p) => dry(ctx, level, p), room);
  const r = room === undefined ? undefined : level.rooms[room];
  if (r) return roomDefPos(def, level.width, level.height, r, c.x, c.y, c.kind);
  return levelDefPos(def, level.width, level.height, c.x, c.y, c.coords, c.kind);
}

/**
 * des.monster's `appear_as` on a mimic made with its own disguise (set_mimic_sym() in makemon()):
 * a piece of furniture, an object (with no shape for a corpse or statue), or a monster (its own
 * kind: no disguise). Other monsters refuse it (the scripts give no shapeshifter one), and
 * nothing happens while the hero has protection from shape changers. 5.0's screening of a
 * boulder disguise on a trap, boulder or closed door never runs (`m->x` is the monster's square
 * by then), so none is made. ref: src/sp_lev.c create_monster() (the m_ap_type branch)
 */
function applyAppearAs(ctx: Ctx, id: EntityId, ap: NonNullable<LevelContent['appearAs']>): void {
  const mon = ctx.state.entities[String(id)];
  if (!mon || ctx.defs.monster(mon.def).glyph.ch !== 'm') return; // mlet == S_MIMIC
  if (protFromShapeChangers(ctx.state)) return;
  if (ap.kind === 'furniture') setMappearance(ctx, id, { type: 'furniture', id: ap.id });
  else if (ap.kind === 'object') setMappearance(ctx, id, { type: 'object', id: ap.id });
  else if (ap.id === mon.def)
    setMappearance(ctx, id, null); // forced to appear as itself
  else setMappearance(ctx, id, { type: 'monster', id: ap.id });
}

/** The Gnomish Mines (C's In_mines()) */
const MINES = 'nh:mines';

/**
 * ref: src/sp_lev.c create_monster(); a random spot suits the monster's kind (pm_to_humidity():
 * a water-liking one tries without DRY first, then with it); an occupied spot moves to a close
 * one (`if (MON_AT(x, y) && enexto(...))`); `appearAs` disguises a mimic; `peaceful` overrides
 * peace_minded() (`if (m->peaceful > BOOL_RANDOM) mtmp->mpeaceful = m->peaceful`); `asleep` is
 * MM_ASLEEP; `waiting` is STRAT_WAITFORU (a vampire born shifted turns back). `align` (mk_roamer())
 * comes with m23 step 3 and throws until then. A unique that was already made (extinct) is not made again; any other genocided or
 * extinct kind is made at random instead, and so are 2 in 3 of a dwarf or gnome hero's own kind
 * in the Mines.
 */
export function createMonster(
  ctx: Ctx,
  level: Level,
  c: LevelContent,
  ldef: LevelDef,
  room?: number,
): void {
  if (c.align !== undefined)
    throw new Error(`${ldef.id}: des.monster align needs mk_roamer() (m23 step 3)`);
  let def =
    c.id !== undefined
      ? ctx.defs.monster(c.id)
      : c.class !== undefined
        ? mkclass(ctx, c.class, level.depth, ['nogen'], { level }) // mkclass(class, G_NOGEN)
        : null;
  if (def && c.id !== undefined) {
    if (def.genFlags.includes('uniq') && isExtinct(ctx.state, def.id)) return;
    if (isGone(ctx.state, def.id)) def = null; // genocided or extinct: make random monster
  }
  // a dwarf or gnome hero meets fewer of her own kind in the Mines (u.uz is the new level)
  if (
    def &&
    level.dungeon === MINES &&
    yourRace(ctx.state, def) &&
    (raceIs(ctx.state, 'dwarf') || raceIs(ctx.state, 'gnome')) &&
    ctx.rng.rn2(3)
  )
    def = null;
  let pos: Pos | null;
  if (def && (c.x === undefined || c.y === undefined)) {
    // "If water-liking monster, first try is without DRY"
    let loc = pmToHumidity(def);
    const spot = (): Pos | null =>
      getLocation(ctx, level, ldef, (p) => isOkLocation(ctx, level, p, loc), room);
    pos = spot();
    if (!pos) {
      loc |= DRY;
      pos = spot();
    }
  } else pos = contentSpot(ctx, level, c, ldef, room);
  // someone already there: a close place instead (makemon's enexto)
  if (!pos) return;
  const id = makemon(ctx, def, pos, {
    level: level.id,
    adjacentOk: true,
    inMklev: true,
    ...(c.asleep ? { asleep: true } : {}),
  });
  if (id !== null && c.appearAs) applyAppearAs(ctx, id, c.appearAs);
  const m = id === null ? undefined : ctx.state.entities[String(id)]?.c.monster;
  if (m && c.peaceful !== undefined) m.peaceful = c.peaceful; // malign follows (luck.ts)
  if (id !== null && c.waiting) {
    // m23: `if (m->waiting)`: STRAT_WAITFORU; "if this is a vampire that got created already
    // shifted into bat/fog/wolf form and the special level or theme room didn't explicitly
    // request that, shift back to vampire"
    setStrat(ctx, id, 'waitForU');
    const e = ctx.state.entities[String(id)];
    const cham = chamOf(ctx, id);
    if (e && cham !== null && vampshifted(ctx, e) && c.appearAs?.kind !== 'monster')
      newcham(ctx, e, ctx.defs.monster(cham));
  }
}

/** ref: src/sp_lev.c create_object() */
function createObject(
  ctx: Ctx,
  level: Level,
  c: LevelContent,
  ldef: LevelDef,
  room?: number,
): void {
  // lspo_object(): `montype` is read (a class letter rolled with mkclass(class, G_NOGEN |
  // G_IGNORE)) before create_object() picks the spot and makes the object
  const mon =
    c.montype === undefined
      ? undefined
      : [...c.montype].length === 1
        ? mkclass(ctx, c.montype, level.depth, ['nogen'], { level, ignoreGone: true })?.id
        : (c.montype as DefId);
  const pos = contentSpot(ctx, level, c, ldef, room);
  if (!pos) return;
  const at = { level: level.id, x: pos.x, y: pos.y };
  if (c.id !== undefined) {
    // create_object(): mksobj_at(id, x, y, TRUE, ...), then set_corpsenm(montype) and the
    // historic flag
    const id = mksobjFull(
      ctx,
      ctx.defs.object(c.id),
      { at, ...(mon !== undefined ? { corpseOf: mon } : {}) },
      { level: level.id, inMklev: true },
    );
    if (c.historic && c.id === STATUE) setHistoric(ctx, id, true);
    if (c.id === STATUE && mon === undefined && levelFlags(ctx, level).medusa === true)
      petrifiedStatue(ctx, level, id);
  } else mkobjAt(ctx, (c.class as ObjectClass | undefined) ?? 'random', at, true);
}

/** Puts the detached or carried item `item` into the statue (add_to_container()). */
export function addToStatue(ctx: Ctx, statue: EntityId, item: EntityId): void {
  const it = ctx.state.entities[String(item)]?.c.item;
  if (!it) return;
  if (it.carriedBy !== null) removeFromInventory(ctx, item);
  it.equipped = null; // obj->owornmask = 0
  it.containedIn = statue;
  it.placed = ctx.state.seq++;
}

/** Empties a container: an explicit empty `contents` (SP_OBJ_CONTAINER: delete_contents()). */
export function deleteContents(ctx: Ctx, box: EntityId): void {
  for (const o of contents(ctx.state, box)) ctx.remove(o.id);
}

/**
 * "Medusa level special case: statues are petrified monsters, so they are not stone-resistant
 * and have monster inventory." The statue (made empty: every such statue in the scripts says
 * `contents=0`) shows the first kind, starting with its own random one and then rndmonnum(),
 * that makemon() can make somewhere on the level and that neither resists stoning nor turns into
 * a stone golem (up to 1000 tries); that monster's things go into the statue and the monster
 * leaves (mongone()); its birth is counted only for the kind kept (MM_NOCOUNTBIRTH, then
 * propagate()). ref: src/sp_lev.c create_object()
 */
function petrifiedStatue(ctx: Ctx, level: Level, statue: EntityId): void {
  deleteContents(ctx, statue);
  const it = ctx.state.entities[String(statue)]?.c.item;
  if (!it) return;
  let wastyp: DefId = it.corpseOf ?? rndmonnum(ctx, level.depth).id;
  let was: EntityId | null = null;
  // prevent endless loop in case makemon always fails
  for (let i = 0; i < 1000; i++, wastyp = rndmonnum(ctx, level.depth).id) {
    // makemon without rndmonst() might create a group
    was = makemon(ctx, ctx.defs.monster(wastyp), null, {
      level: level.id,
      inMklev: true,
      noCountBirth: true,
    });
    if (was !== null) {
      const mon = ctx.state.entities[String(was)];
      const def = ctx.defs.monster(wastyp);
      if (
        mon &&
        !resistsSton(ctx, mon) &&
        !polyWhenStoned(def, isGenocided(ctx.state, 'nh:stone_golem'))
      ) {
        propagate(ctx, def, true);
        break;
      }
      mongone(ctx, was);
      was = null;
    }
  }
  if (was === null) return;
  it.corpseOf = wastyp; // set_corpsenm() (the weight follows the monster)
  for (const o of minvent(ctx, was)) addToStatue(ctx, statue, o.id);
  mongone(ctx, was);
}

/**
 * ref: src/sp_lev.c create_trap(): a DRY spot that is not stairs (100 tries), then
 * mklev.c mktrap() there. Here the spot must be plain floor, where traps may go; a fixed spot
 * that is not makes no trap.
 */
function createTrap(ctx: Ctx, level: Level, c: LevelContent, ldef: LevelDef, room?: number): void {
  if (c.x !== undefined) {
    const at = contentSpot(ctx, level, c, ldef, room);
    if (at && isPlainFloor(ctx.defs, level, at.x, at.y)) mktrap(ctx, level, at, c.id ?? null);
    return;
  }
  let pos: Pos | null = null;
  for (let trycnt = 0; trycnt <= 100; trycnt++) {
    pos = getLocation(ctx, level, ldef, (p) => dry(ctx, level, p), room);
    if (!pos || isPlainFloor(ctx.defs, level, pos.x, pos.y)) break;
  }
  if (pos && isPlainFloor(ctx.defs, level, pos.x, pos.y)) mktrap(ctx, level, pos, c.id ?? null);
}

/** Makes one contents list (in room `room` when given). */
export function makeContents(
  ctx: Ctx,
  level: Level,
  def: LevelDef,
  list: readonly LevelContent[],
  room?: number,
): void {
  for (const c of list) {
    if (c.percent !== undefined && ctx.rng.rn2(100) >= c.percent) continue;
    const n = rollCount(ctx, c.count);
    for (let i = 0; i < n; i++) {
      if (c.kind === 'monster') createMonster(ctx, level, c, def, room);
      else if (c.kind === 'object') createObject(ctx, level, c, def, room);
      else createTrap(ctx, level, c, def, room);
    }
  }
}

/**
 * Makes the contents of each room built from a RoomDef (in `Level.rooms` order), then
 * `def.contents`, each list in order: each entry first rolls its `percent` (ref: nhlua percent(),
 * rn2(100) < n), then its count, then makes that many things.
 */
export function fillSpecialLevel(ctx: Ctx, level: Level, def: LevelDef): void {
  for (const [i, room] of level.rooms.entries()) {
    const contents = room.defPath && levelDefRoom(def, room.defPath)?.contents;
    if (contents) makeContents(ctx, level, def, contents, i);
  }
  makeContents(ctx, level, def, def.contents ?? []);
}

/**
 * Level-specific work the LevelDef format cannot say (shuffled spots, BUC, a maze walk, ...),
 * keyed by LevelDef id, as NetHack's own fixup_special() is: `before` runs before
 * fillSpecialLevel (terrain that later random spots must see), `after` once the contents exist.
 */
export interface SpLevFixup {
  before?(ctx: Ctx, level: Level, def: LevelDef): void;
  after?(ctx: Ctx, level: Level, def: LevelDef): void;
}

/** Shuffles `list` in place. ref: dat/nhlib.lua shuffle() (j = math.random(i) = 1 + rn2(i)) */
export function shuffle<T>(ctx: Pick<Ctx, 'rng'>, list: T[]): void {
  for (let i = list.length - 1; i >= 1; i--) {
    const j = ctx.rng.rn2(i + 1);
    const t = list[i] as T;
    list[i] = list[j] as T;
    list[j] = t;
  }
}

/**
 * place:rndcoord(1): one of the spots, removed from the list (the selection walks its spots
 * column by column). ref: src/selvar.c selection_rndcoord()
 */
export function rndcoord(ctx: Pick<Ctx, 'rng'>, spots: Pos[]): Pos {
  spots.sort((a, b) => a.x - b.x || a.y - b.y);
  const [p] = spots.splice(ctx.rng.rn2(spots.length), 1);
  return p as Pos;
}

/**
 * The LevelDef as a script sees it after a run-time des.map() of `rows` placed at `b` (desMap()):
 * its contents' fixed spots are relative to that block and their random spots inside it.
 * ref: src/sp_lev.c lspo_map() (xstart, ystart, xsize, ysize), get_location()
 */
export const blockDef = (def: LevelDef, rows: readonly string[], b: MapBlock): LevelDef => ({
  ...def,
  map: { rows: [...rows], x: b.x, y: b.y },
});

/** The Level position of a LevelDef spot (map-relative when the LevelDef has a map block). */
export function mapToLevel(def: LevelDef, level: Level, x: number, y: number): Pos {
  return levelDefPos(def, level.width, level.height, x, y, undefined, `${def.id} fixup`);
}

/**
 * des.engraving() at a fixed spot of a LevelDef (map-relative): `text` of `type`, finished at
 * turn 0, made with the level; then C's options overwrite what make_engr_at() set:
 * `guardobjects` (default false, so even an "Elbereth" guards no objects) and `degrade` (default
 * true; false is `nowipeout`). ref: src/sp_lev.c lspo_engraving()
 */
export function desEngraving(
  ctx: Pick<Ctx, 'state' | 'rng'>,
  level: Level,
  def: LevelDef,
  spot: Pos,
  type: EngrType,
  text: string,
  opts: { degrade?: boolean; guardobjects?: boolean } = {},
): void {
  const p = mapToLevel(def, level, spot.x, spot.y);
  const e = makeEngrAt(ctx, level, p.x, p.y, text, null, 0, type, { inMklev: true });
  if (opts.guardobjects === true) e.guard = true;
  else delete e.guard;
  if (opts.degrade === false) e.nowipe = true;
  else delete e.nowipe;
}

/** des.map()'s `halign`. */
export type Halign = 'left' | 'half-left' | 'center' | 'half-right' | 'right';
/** des.map()'s `valign`. */
export type Valign = 'top' | 'center' | 'bottom';

/**
 * des.map() at run time, for a fixup that stamps a map where the script draws it: `rows` placed
 * by `halign`/`valign` (from x_maze_max and y_maze_max, then moved to odd NetHack coordinates and
 * within the rows as lspo_map() does) or with its top-left at Level `x`,`y`; its cells but the
 * see-through 'x' become their terrain (`B`, an invisible boundary, becomes floor), lit when `lit`
 * (lava always), cut at the level's edges. Returns the placed block in Level coordinates (its
 * contents' spots are relative to it). ref: src/sp_lev.c lspo_map(), sel_set_ter()
 */
export function desMap(
  level: Level,
  rows: readonly string[],
  place: { halign?: Halign; valign?: Valign; x?: number; y?: number; lit?: boolean },
): MapBlock {
  const b = desMapPlace(level, rows, place);
  const { w, h } = b;
  const xstart = b.x + 1;
  const ystart = b.y;
  const COLNO = level.width + 1;
  const ROWNO = level.height;
  const lit = place.lit === true ? 1 : 0;
  for (let y = ystart; y < Math.min(ROWNO, ystart + h); y++)
    for (let cx = xstart; cx < Math.min(COLNO, xstart + w); cx++) {
      const ch = rows[y - ystart]?.[cx - xstart] ?? 'x';
      if (ch === 'x' || cx < 1) continue;
      setTer(level, cx - 1, y, ch === 'B' ? T.floor : ter(ch), { lit, litLava: true });
    }
  return b;
}

/** Where desMap() puts `rows` (Level coordinates), without laying them. */
export function desMapPlace(
  level: Readonly<Level>,
  rows: readonly string[],
  place: { halign?: Halign; valign?: Valign; x?: number; y?: number },
): MapBlock {
  const w = Math.max(...rows.map((r) => r.length));
  const h = rows.length;
  const COLNO = level.width + 1;
  const ROWNO = level.height;
  const xMazeMax = (COLNO - 1) & ~1;
  const yMazeMax = (ROWNO - 1) & ~1;
  const div = (a: number, b: number): number => Math.trunc(a / b);
  let xstart: number;
  let ystart: number;
  if (place.x !== undefined && place.y !== undefined) {
    xstart = place.x + 1;
    ystart = place.y;
  } else {
    const ha = place.halign ?? 'center';
    xstart =
      ha === 'left'
        ? 1 // splev_init_present
        : ha === 'half-left'
          ? 2 + div(xMazeMax - 2 - w, 4)
          : ha === 'center'
            ? 2 + div(xMazeMax - 2 - w, 2)
            : ha === 'half-right'
              ? 2 + div((xMazeMax - 2 - w) * 3, 4)
              : xMazeMax - w - 1;
    const va = place.valign ?? 'center';
    ystart = va === 'top' ? 3 : va === 'center' ? 2 + div(yMazeMax - 2 - h, 2) : yMazeMax - h - 1;
    if (xstart % 2 === 0) xstart++;
    if (ystart % 2 === 0) ystart++;
  }
  if (ystart < 0 || ystart + h > ROWNO) {
    // try to move the start a bit
    ystart += ystart > 0 ? -2 : 2;
    if (h === ROWNO) ystart = 0;
    if (ystart < 0 || ystart + h > ROWNO) ystart = 0;
  }
  return { x: xstart - 1, y: ystart, w, h };
}

/**
 * des.gold() with no amount or spot: `rnd(200)` gold on a random DRY spot of the LevelDef's map
 * block (or the level). ref: src/sp_lev.c lspo_gold()
 */
export function desGold(ctx: Ctx, level: Level, def: LevelDef): void {
  const p = randomDrySpot(ctx, level, def);
  if (!p) return;
  mkgold(ctx, ctx.rng.rnd(200), { level: level.id, x: p.x, y: p.y });
}

/**
 * Fills levels built from a LevelDef, with their fixups, then maps a `premapped` one; runs after
 * mklev's own newLevel hook. ref: src/sp_lev.c load_special(): fixup_special(), then
 * premap_detect()
 */
export function registerSpLev(api: ModApi, fixups: Readonly<Record<DefId, SpLevFixup>> = {}): void {
  api.on('newLevel', (ctx, level) => {
    if (level.def === undefined) return;
    const def = ctx.defs.level(level.def);
    const fixup = Object.hasOwn(fixups, def.id) ? fixups[def.id] : undefined;
    fixup?.before?.(ctx, level, def);
    fillSpecialLevel(ctx, level, def);
    fixup?.after?.(ctx, level, def);
    if (def.flags?.premapped === true) premapDetect(ctx, level);
  });
}

/** IS_DOOR(): a door in any state, doorways included (not secret doors). */
const DOOR_IDS: ReadonlySet<DefId> = new Set([
  T.doorway,
  T.door_open_v,
  T.door_open_h,
  T.door_closed,
  T.door_locked,
]);

/** The door kinds that face their wall: [vertical, horizontal]. */
const ORIENTED: readonly (readonly [DefId, DefId])[] = [
  [T.door_open_v, T.door_open_h],
  [T.sdoor_v, T.sdoor_h],
  [T.sdoor_locked_v, T.sdoor_locked_h],
];

/**
 * A door or secret door at (x, y) faces its wall: horizontal when a wall, door or secret door is
 * to its left or right but not both above and below it; with none of those around, rock or iron
 * bars (or the level's edge) count instead. ref: src/sp_lev.c set_door_orientation()
 */
function horizontalDoor(
  ctx: Pick<Ctx, 'defs'>,
  level: Readonly<Level>,
  x: number,
  y: number,
): boolean {
  const joins = (dx: number, dy: number): boolean => {
    if (!inBounds(level, x + dx, y + dy)) return false;
    const id = terrainIdAt(level, x + dx, y + dy);
    return isWallId(id) || isSdoorId(id) || (id !== undefined && DOOR_IDS.has(id));
  };
  let wleft = joins(-1, 0);
  let wright = joins(1, 0);
  let wup = joins(0, -1);
  let wdown = joins(0, 1);
  if (!wleft && !wright && !wup && !wdown) {
    // IS_DOORJOIN(): IS_OBSTRUCTED() or iron bars; out of bounds is an implicit wall
    const doorjoin = (dx: number, dy: number): boolean => {
      if (!inBounds(level, x + dx, y + dy)) return true;
      const id = terrainIdAt(level, x + dx, y + dy);
      return (
        id === T.iron_bars ||
        (id !== undefined &&
          !ctx.defs.terrain(id).passable &&
          ctx.defs.terrain(id).liquid === undefined)
      );
    };
    wleft = doorjoin(-1, 0);
    wright = doorjoin(1, 0);
    wup = doorjoin(0, -1);
    wdown = doorjoin(0, 1);
  }
  return (wleft || wright) && !(wup && wdown);
}

/**
 * Every open or secret door of the level faces its wall, as a map's '+' and 'S' do once the
 * level is done. ref: src/sp_lev.c link_doors_rooms() (set_door_orientation())
 */
export function orientDoors(ctx: Pick<Ctx, 'defs'>, level: Level): void {
  for (let y = 0; y < level.height; y++)
    for (let x = 0; x < level.width; x++) {
      const id = terrainIdAt(level, x, y);
      const pair = ORIENTED.find((p) => p[0] === id || p[1] === id);
      if (pair) setTerrain(level, x, y, horizontalDoor(ctx, level, x, y) ? pair[1] : pair[0]);
    }
}

/**
 * des.door(state, x, y) at a Level spot: a secret door stays secret (locked or not), any other
 * spot becomes a door in that state (`nodoor` and `broken` a doorway; `random` rolls rnddoor()).
 * Run orientDoors() once the walls are there. ref: src/sp_lev.c lspo_door(), sel_set_door(),
 * rnddoor()
 */
export function desDoor(
  ctx: Pick<Ctx, 'rng'>,
  level: Level,
  x: number,
  y: number,
  state: DoorState,
): void {
  const st =
    state === 'random'
      ? (['nodoor', 'broken', 'open', 'closed', 'locked'] as const)[ctx.rng.rn2(5)]
      : state;
  const id = terrainIdAt(level, x, y);
  if (isSdoorId(id)) {
    setTerrain(level, x, y, st === 'locked' ? T.sdoor_locked_v : T.sdoor_v);
    return;
  }
  setTerrain(
    level,
    x,
    y,
    st === 'open'
      ? T.door_open_v
      : st === 'closed'
        ? T.door_closed
        : st === 'locked'
          ? T.door_locked
          : T.doorway,
  );
}

/** A wall of a room, for {@link desRoomDoor}. */
export type RoomWall = 'north' | 'south' | 'west' | 'east';

/**
 * des.door({ state = "secret", wall = ... }) in a region's contents: a secret door on one of
 * `walls` of the room `r` (Level coordinates of its inside), at a random cell of that wall whose
 * outside is open, where okdoor() allows (a plain wall with no door or secret door orthogonally
 * next to it); 100 tries of a random wall, else no door. Run orientDoors() once the walls are
 * there. ref: src/sp_lev.c lspo_door(), create_door() (`secret`: no door-state draws); src/mklev.c
 * okdoor(), bydoor()
 */
export function desRoomDoor(
  ctx: Pick<Ctx, 'rng'>,
  level: Level,
  r: { lx: number; ly: number; hx: number; hy: number },
  walls: readonly RoomWall[],
): void {
  const open = (x: number, y: number): boolean =>
    inBounds(level, x, y) && !isObstructedId(terrainIdAt(level, x, y));
  const doorish = (x: number, y: number): boolean => {
    if (!inBounds(level, x, y)) return false;
    const id = terrainIdAt(level, x, y);
    return isSdoorId(id) || (id !== undefined && DOOR_IDS.has(id));
  };
  const okdoor = (x: number, y: number): boolean => {
    const id = terrainIdAt(level, x, y);
    return (
      (id === T.hwall || id === T.vwall) &&
      !doorish(x + 1, y) &&
      !doorish(x - 1, y) &&
      !doorish(x, y + 1) &&
      !doorish(x, y - 1)
    );
  };
  for (let trycnt = 0; trycnt < 100; trycnt++) {
    let x: number;
    let y: number;
    switch (ctx.rng.rn2(4)) {
      case 0:
        if (!walls.includes('north')) continue;
        y = r.ly - 1;
        x = r.lx + ctx.rng.rn2(1 + r.hx - r.lx);
        if (!open(x, y - 1)) continue;
        break;
      case 1:
        if (!walls.includes('south')) continue;
        y = r.hy + 1;
        x = r.lx + ctx.rng.rn2(1 + r.hx - r.lx);
        if (!open(x, y + 1)) continue;
        break;
      case 2:
        if (!walls.includes('west')) continue;
        x = r.lx - 1;
        y = r.ly + ctx.rng.rn2(1 + r.hy - r.ly);
        if (!open(x - 1, y)) continue;
        break;
      default:
        if (!walls.includes('east')) continue;
        x = r.hx + 1;
        y = r.ly + ctx.rng.rn2(1 + r.hy - r.ly);
        if (!open(x + 1, y)) continue;
        break;
    }
    if (inBounds(level, x, y) && okdoor(x, y)) {
      setTerrain(level, x, y, T.sdoor_v);
      return;
    }
  }
  // C: impossible("create_door: Can't find a proper place!")
}

/**
 * A spot for a level region of stairs or a branch (des.levregion() with `region` and `exclude`
 * in Level coordinates, corners inclusive; `area` is clamped to the level): 200 random spots,
 * then each in column order, the first that is floor (or corridor on a maze level) outside
 * `exclude` with no trap, furniture or liquid; in that last pass a trap that can be destroyed is
 * removed to make room. Null when there is none (C's impossible()).
 * ref: src/mkmaze.c place_lregion(), put_lregion_here(), bad_location(); src/mklev.c occupied()
 */
export function placeLregion(
  ctx: Ctx,
  level: Level,
  area: LevelRect,
  exclude: LevelRect | null,
): Pos | null {
  const lx = Math.max(area[0], 0);
  const ly = Math.max(area[1], 0);
  const hx = Math.min(area[2], level.width - 1);
  const hy = Math.min(area[3], level.height - 1);
  const maze = levelFlags(ctx, level).maze === true;
  const bad = (x: number, y: number): boolean => {
    const id = terrainIdAt(level, x, y);
    const occupied =
      !!trapAt(level, x, y) ||
      isFurnitureId(ctx.defs, id) ||
      (id !== undefined && ctx.defs.terrain(id).liquid !== undefined);
    const excluded =
      exclude !== null && x >= exclude[0] && x <= exclude[2] && y >= exclude[1] && y <= exclude[3];
    return occupied || excluded || !(id === T.floor || (id === T.corr && maze));
  };
  const here = (x: number, y: number, oneshot: boolean): boolean => {
    if (!bad(x, y)) return true;
    if (!oneshot) return false;
    // "Must make do with the only location possible; avoid failure due to a misplaced trap."
    const t = trapAt(level, x, y);
    if (t && !undestroyableTrap(t.def)) ctx.removeTrap(level.id, { x, y });
    return !bad(x, y);
  };
  const oneshot = lx === hx && ly === hy;
  for (let trycnt = 0; trycnt < 200; trycnt++) {
    const x = ctx.rng.rn2(hx - lx + 1) + lx; // rn1()
    const y = ctx.rng.rn2(hy - ly + 1) + ly;
    if (here(x, y, oneshot)) return { x, y };
  }
  for (let x = lx; x <= hx; x++)
    for (let y = ly; y <= hy; y++) if (here(x, y, true)) return { x, y };
  return null;
}

/**
 * des.levregion({ type = "stair-up" | "stair-down" | "branch", region, exclude }) as
 * fixup_special() places it once the level is done (placeLregion()): the stairs when the dungeon
 * gives the level such stairs (the spot is drawn either way, as mkstairs() refuses them after
 * it), the branch stairs when it has a branch. ref: src/mkmaze.c fixup_special() LR_UPSTAIR,
 * LR_DOWNSTAIR, LR_BRANCH; put_lregion_here(); src/mklev.c mkstairs(), place_branch()
 */
export function desLevregion(
  ctx: Ctx,
  level: Level,
  type: 'stair-up' | 'stair-down' | 'branch',
  area: LevelRect,
  exclude: LevelRect | null,
): void {
  const p = placeLregion(ctx, level, area, exclude);
  if (!p) return;
  if (type === 'branch') {
    const branch = level.branch;
    if (!branch) return;
    setTerrain(level, p.x, p.y, branch.dir === 'up' ? T.stairs_up : T.stairs_down);
    branch.pos = p;
    return;
  }
  const want = levelStairs(ctx.state, level);
  if (type === 'stair-up' && want.up) {
    setTerrain(level, p.x, p.y, T.stairs_up);
    level.up = p;
  } else if (type === 'stair-down' && want.down) {
    setTerrain(level, p.x, p.y, T.stairs_down);
    level.down = p;
  }
}

/**
 * Lifts the stairs core put on a LevelDef's placeholder spots (terrain back to stone, no stairs
 * yet), for a fixup that lays out the level itself and places them later (desLevregion(),
 * des.stair()). The branch keeps its record until its spot is chosen.
 */
export function liftStairs(level: Level): void {
  for (const p of [level.up, level.down, level.branch?.pos])
    if (p) setTerrain(level, p.x, p.y, T.stone);
  level.up = null;
  level.down = null;
}

/**
 * des.stair(dir, x, y) at a Level spot, when the dungeon gives the level such stairs.
 * ref: src/sp_lev.c l_create_stairway(); src/mklev.c mkstairs()
 */
export function desStair(ctx: Pick<Ctx, 'state'>, level: Level, dir: 'up' | 'down', p: Pos): void {
  const want = levelStairs(ctx.state, level);
  if (dir === 'up' ? !want.up : !want.down) return;
  setTerrain(level, p.x, p.y, dir === 'up' ? T.stairs_up : T.stairs_down);
  if (dir === 'up') level.up = { ...p };
  else level.down = { ...p };
}
