// Making the contents of a LevelDef: monsters, objects and traps at fixed or random dry spots.
// ref: src/sp_lev.c create_monster(), create_object(), create_trap(), get_location(),
// is_ok_location(), pm_to_humidity()
import type {
  Ctx,
  DefId,
  EntityId,
  Level,
  LevelContent,
  LevelCount,
  LevelDef,
  ModApi,
  MonsterDef,
  ObjectClass,
  Pos,
} from '@nh/core';
import {
  cellIndex,
  contents,
  isPlainFloor,
  levelDefArea,
  levelDefPos,
  levelDefRoom,
  roomDefPos,
  roomHas,
  roomSomexy,
  VANILLA_TERRAIN,
} from '@nh/core';
import { boulderAt } from './boulder';
import { premapDetect } from './detect';
import { isGenocided } from './vanquished';
import { makemon, mkclass } from './generation';
import { polyWhenStoned } from './golem';
import { levelFlags } from './levelflags';
import { isLava, isPool } from './liquid';
import { setMappearance } from './mimicstate';
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
import { removeFromInventory } from './items';
import { resistsSton } from './stonestate';
import { STATUE, setHistoric } from './statuestate';
import { mktrap } from './mklev';

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
 * kind: no disguise). Other monsters refuse it (no shapeshifters exist). 5.0's screening of a
 * boulder disguise on a trap, boulder or closed door never runs (`m->x` is the monster's square
 * by then), so none is made. ref: src/sp_lev.c create_monster() (the m_ap_type branch)
 */
function applyAppearAs(ctx: Ctx, id: EntityId, ap: NonNullable<LevelContent['appearAs']>): void {
  const mon = ctx.state.entities[String(id)];
  if (!mon || ctx.defs.monster(mon.def).glyph.ch !== 'm') return; // mlet == S_MIMIC
  if (ap.kind === 'furniture') setMappearance(ctx, id, { type: 'furniture', id: ap.id });
  else if (ap.kind === 'object') setMappearance(ctx, id, { type: 'object', id: ap.id });
  else if (ap.id === mon.def)
    setMappearance(ctx, id, null); // forced to appear as itself
  else setMappearance(ctx, id, { type: 'monster', id: ap.id });
}

/**
 * ref: src/sp_lev.c create_monster(); a random spot suits the monster's kind (pm_to_humidity():
 * a water-liking one tries without DRY first, then with it); an occupied spot moves to a close
 * one (`if (MON_AT(x, y) && enexto(...))`); `appearAs` disguises a mimic; `peaceful` overrides
 * peace_minded() (`if (m->peaceful > BOOL_RANDOM) mtmp->mpeaceful = m->peaceful`); `asleep` is
 * MM_ASLEEP. A genocided kind is made at random instead (a genocided unique: nothing).
 */
export function createMonster(
  ctx: Ctx,
  level: Level,
  c: LevelContent,
  ldef: LevelDef,
  room?: number,
): void {
  let def =
    c.id !== undefined
      ? ctx.defs.monster(c.id)
      : c.class !== undefined
        ? mkclass(ctx, c.class, level.depth, ['nogen']) // mkclass(class, G_NOGEN)
        : null;
  if (def && c.id !== undefined && isGenocided(ctx.state, def.id)) {
    if (def.genFlags.includes('uniq')) return; // G_UNIQ and G_EXTINCT
    def = null; // genocided: make random monster
  }
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
        ? mkclass(ctx, c.montype, level.depth, ['nogen'])?.id
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
 * leaves (mongone()). ref: src/sp_lev.c create_object() (no birth counts: propagate())
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
    was = makemon(ctx, ctx.defs.monster(wastyp), null, { level: level.id, inMklev: true });
    if (was !== null) {
      const mon = ctx.state.entities[String(was)];
      const def = ctx.defs.monster(wastyp);
      if (
        mon &&
        !resistsSton(ctx, mon) &&
        !polyWhenStoned(def, isGenocided(ctx.state, 'nh:stone_golem'))
      )
        break;
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

/** The Level position of a LevelDef spot (map-relative when the LevelDef has a map block). */
export function mapToLevel(def: LevelDef, level: Level, x: number, y: number): Pos {
  return levelDefPos(def, level.width, level.height, x, y, undefined, `${def.id} fixup`);
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
