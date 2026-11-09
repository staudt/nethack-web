// Zoo-like special rooms: their fill (fill_zoo()) and the hero's first entry into one.
// A typed room (`Room.type` one of the kinds below) is filled when its level is made: by
// makelevel()'s special-room chain (mkroom.ts types it, this fills it) or a LevelDef region
// (`type: 'nh:zoo', filled: true`, Sokoban's zoo; its prize is in sokoprize.ts).
// ref: src/mkroom.c fill_zoo(), mk_zoo_thronemon(); src/sp_lev.c fill_special_room();
// src/hack.c check_special_room()
//
// Not ported (DEVIATIONS.md "Special rooms"): `level.flags.has_*` (no level sounds) and the
// irregular room shape: a LevelDef zoo is the rectangle of its region, filled on its open squares
// and treated as irregular (the squares next to its first door stay empty), which is what
// Sokoban's zoo is. Beehives, morgues, barracks, cockatrice nests and antholes have no fill yet:
// the chain never types a room with them.
import {
  cellIndex,
  getLevel,
  inBounds,
  insideRoom,
  putIn,
  sortedIds,
  type Ctx,
  type DefId,
  type Level,
  type ModApi,
  type MonsterDef,
  type Pos,
  type Room,
} from '@nh/core';
import { makemon } from './generation';
import { mkgold, mksobj } from './items';
import { mksobjFull } from './mkobj';
import { heroSees, mongets } from './mongear';
import { monNam } from './perception';
import { P, heroHas } from './props';
import { courtmon } from './roommon';
import { somexyspaceTry } from './somexy';
import { T, setTerrain, terrainIdAt } from './terrain';

/** ref: include/mkroom.h ZOO */
export const ZOO: DefId = 'nh:zoo';
/** ref: include/mkroom.h COURT (a throne room) */
export const COURT: DefId = 'nh:court';
/** ref: include/mkroom.h LEPREHALL */
export const LEPREHALL: DefId = 'nh:leprechaun_hall';
/** ref: include/mkroom.h BEEHIVE */
export const BEEHIVE: DefId = 'nh:beehive';
/** ref: include/mkroom.h MORGUE */
export const MORGUE: DefId = 'nh:morgue';
/** ref: include/mkroom.h BARRACKS */
export const BARRACKS: DefId = 'nh:barracks';
/** ref: include/mkroom.h SWAMP */
export const SWAMP: DefId = 'nh:swamp';
/** ref: include/mkroom.h COCKNEST */
export const COCKNEST: DefId = 'nh:cockatrice_nest';
/** ref: include/mkroom.h ANTHOLE */
export const ANTHOLE: DefId = 'nh:anthole';

/** The kinds fill_special_room() hands to fill_zoo(). */
const ZOO_KINDS: readonly DefId[] = [
  COURT,
  ZOO,
  BEEHIVE,
  ANTHOLE,
  COCKNEST,
  LEPREHALL,
  MORGUE,
  BARRACKS,
];

/** The kinds fill_zoo() can fill so far (the others arrive with their monsters). */
export const FILLED_ZOO_KINDS: readonly DefId[] = [COURT, ZOO, LEPREHALL];

/** ref: src/sp_lev.c fill_special_room() (the fill_zoo() cases) */
export function isZooKind(type: DefId | undefined): boolean {
  return type !== undefined && ZOO_KINDS.includes(type);
}

const SDOORS: ReadonlySet<DefId> = new Set([
  T.sdoor_v,
  T.sdoor_h,
  T.sdoor_locked_v,
  T.sdoor_locked_h,
]);

/**
 * The room's doors, in the order NetHack links them (link_doors_rooms(): y outer, x inner, each
 * new door inserted at `fdoor`), so the last one found is `doors[sroom->fdoor]`. A door is on
 * the room's boundary, orthogonally next to one of its squares (shared_with_room()). `secret`:
 * secret doors count too (add_door() keeps them, so a random room's doorct does).
 * ref: src/sp_lev.c link_doors_rooms(), maybe_add_door(); src/mklev.c add_door()
 */
export function roomDoors(
  ctx: Pick<Ctx, 'defs'>,
  level: Level,
  roomIndex: number,
  secret = false,
): Pos[] {
  const r = level.rooms[roomIndex];
  if (!r) return [];
  const out: Pos[] = [];
  for (let y = r.ly - 1; y <= r.hy + 1; y++)
    for (let x = r.lx - 1; x <= r.hx + 1; x++) {
      const edgeX = x === r.lx - 1 || x === r.hx + 1;
      const edgeY = y === r.ly - 1 || y === r.hy + 1;
      if (edgeX === edgeY || !inBounds(level, x, y)) continue; // inside, or a corner
      const id = level.palette[level.cells[cellIndex(level, x, y)] ?? 0];
      if (id === undefined) continue;
      if (ctx.defs.terrain(id).door !== undefined || (secret && SDOORS.has(id))) out.push({ x, y });
    }
  return out;
}

/** ref: src/hack.c distmin() */
const distmin = (x1: number, y1: number, x2: number, y2: number): number =>
  Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));

/**
 * The ruler of a throne room on his throne square: an ogre king (`rnd(level_difficulty())` above
 * 9), an Elvenking (above 5), a dwarf king (above 2) or a gnome king, asleep, hostile, with a
 * mace "to pound in judgment". ref: src/mkroom.c mk_zoo_thronemon()
 */
function mkZooThronemon(
  ctx: Ctx,
  level: Level,
  pos: Pos,
  difficulty: number,
  inMklev: boolean,
): void {
  const i = ctx.rng.rnd(difficulty);
  const pm =
    i > 9 ? 'nh:ogre_king' : i > 5 ? 'nh:elvenking' : i > 2 ? 'nh:dwarf_king' : 'nh:gnome_king';
  const id = makemon(ctx, ctx.defs.monster(pm), pos, { level: level.id, inMklev });
  const m = id === null ? undefined : ctx.state.entities[String(id)]?.c.monster;
  if (id === null || !m) return;
  m.asleep = true;
  m.peaceful = false; // set_malign(): computed from peacefulness here
  mongets(ctx, id, 'nh:mace');
}

/**
 * Fills a zoo-like room: on each of its squares a sleeping monster of the room's kind (alone),
 * and for zoos and leprechaun halls a pile of gold that grows with the distance from the room's
 * door (`doors[fdoor]`), out of `500 * level_difficulty()` in all (then `5 * level_difficulty()`
 * a square). A throne room gets its ruler on a free square first, courtiers made hostile, then
 * the throne under the ruler and the royal coffers: a chest holding `rn1(50 *
 * level_difficulty(), 10)` gold. A regular room (one level generation made) leaves out the
 * squares on the side of its door; a LevelDef region is irregular: the squares within one of that
 * door are left out. level_difficulty() is the level's depth (no builds-up adjustment, see
 * DEVIATIONS.md "Sokoban"). `inMklev`: made with the level (false for the wizard's mkroom).
 * ref: src/mkroom.c fill_zoo()
 */
export function fillZoo(ctx: Ctx, level: Level, roomIndex: number, inMklev = true): void {
  const room = level.rooms[roomIndex];
  const type = room?.type;
  if (!room || type === undefined) return;
  const difficulty = level.depth; // level_difficulty()
  // a LevelDef region (Sokoban's zoo) is irregular; rooms made by level generation or a RoomDef are not
  const irregular = level.def !== undefined && room.defPath === undefined;
  const doors = roomDoors(ctx, level, roomIndex, !irregular);
  const door = doors[doors.length - 1]; // svd.doors[sroom->fdoor]
  let goldlim = 0;
  let throne: Pos = { x: 0, y: 0 };
  if (type === COURT) {
    const placed = findThrone(level, room);
    if (placed) throne = placed;
    else {
      // don't place throne on top of stairs
      let i = 100;
      let tried: { pos: Pos; ok: boolean };
      do tried = somexyspaceTry(ctx, level, room);
      while (!tried.ok && --i > 0); // occupied(tx, ty): somexyspace() already checked it
      throne = tried.pos;
    }
    mkZooThronemon(ctx, level, throne, difficulty, inMklev);
  } else if (type === ZOO || type === LEPREHALL) goldlim = 500 * difficulty;

  for (let sx = room.lx; sx <= room.hx; sx++)
    for (let sy = room.ly; sy <= room.hy; sy++) {
      const id = terrainIdAt(level, sx, sy);
      const t = id === undefined ? undefined : ctx.defs.terrain(id);
      if (!t?.passable || t.door !== undefined) continue; // !SPACE_POS(), not a room square
      if (door) {
        if (irregular) {
          if (distmin(sx, sy, door.x, door.y) <= 1) continue;
        } else if (
          (sx === room.lx && door.x === sx - 1) ||
          (sx === room.hx && door.x === sx + 1) ||
          (sy === room.ly && door.y === sy - 1) ||
          (sy === room.hy && door.y === sy + 1)
        )
          continue;
      }
      // don't place monster on explicitly placed throne
      if (type === COURT && id === T.throne) continue;
      const mdef = zooMonster(ctx, type, difficulty);
      const mon = makemon(
        ctx,
        mdef,
        { x: sx, y: sy },
        { level: level.id, asleep: true, nogroup: true, inMklev },
      );
      const m = mon === null ? undefined : ctx.state.entities[String(mon)]?.c.monster;
      if (m) {
        m.asleep = true;
        if (type === COURT && m.peaceful) m.peaceful = false; // set_malign() follows it
      }
      if (type === ZOO || type === LEPREHALL) {
        let i: number;
        if (door) {
          const distval = (sx - door.x) ** 2 + (sy - door.y) ** 2; // dist2()
          i = distval * distval; // sq(distval)
        } else i = goldlim;
        if (i >= goldlim) i = 5 * difficulty;
        goldlim -= i;
        mkgold(ctx, ctx.rng.rn2(i) + 10, { level: level.id, x: sx, y: sy }); // rn1(i, 10)
      }
    }
  if (type === COURT) {
    setTerrain(level, throne.x, throne.y, T.throne);
    const mm = somexyspaceTry(ctx, level, room).pos;
    const quan = ctx.rng.rn2(50 * difficulty) + 10; // rn1(50 * level_difficulty(), 10)
    // the royal coffers
    const chest = mksobjFull(
      ctx,
      ctx.defs.object('nh:chest'),
      { at: { level: level.id, x: mm.x, y: mm.y } },
      { level: level.id, inMklev },
    );
    addGold(ctx, chest, quan);
    const it = ctx.state.entities[String(chest)]?.c.item;
    if (it) it.spe = 2; // so it can be found later
  }
}

/** A throne already in the room (one a LevelDef or a wish put there). ref: fill_zoo() COURT */
function findThrone(level: Level, room: Room): Pos | null {
  for (let tx = room.lx; tx <= room.hx; tx++)
    for (let ty = room.ly; ty <= room.hy; ty++)
      if (terrainIdAt(level, tx, ty) === T.throne) return { x: tx, y: ty };
  return null;
}

/** add_to_container() of a new gold stack: merged with gold the chest already holds. */
function addGold(ctx: Ctx, chest: number, quan: number): void {
  for (const id of sortedIds(ctx.state)) {
    const it = ctx.state.entities[String(id)];
    if (it?.def === 'nh:gold_piece' && it.c.item?.containedIn === chest) {
      it.c.item.quantity += quan;
      return;
    }
  }
  const gold = mksobj(ctx, ctx.defs.object('nh:gold_piece'), { init: false, quantity: quan });
  putIn(ctx.defs, ctx.state, chest, gold);
}

/** The monster fill_zoo() makes on a square of a room of `type`; null: a random one. */
function zooMonster(ctx: Ctx, type: DefId, difficulty: number): MonsterDef | null {
  if (type === COURT) return courtmon(ctx, difficulty);
  if (type === LEPREHALL) return ctx.defs.monster('nh:leprechaun');
  return null;
}

/**
 * Fills the zoo-like rooms of a new level that are not marked unfilled, in room order, after the
 * ordinary rooms and the shops. ref: src/sp_lev.c fill_special_room(), src/mklev.c makelevel()
 */
export function registerZoo(api: ModApi): void {
  api.on('newLevel', (ctx, level) => {
    for (let i = 0; i < level.rooms.length; i++) {
      const r = level.rooms[i];
      if (isZooKind(r?.type) && r?.filled !== false) fillZoo(ctx, level, i);
    }
  });
}

/**
 * The hero enters a zoo-like room for the first time: its entry message ("Welcome to David's
 * treasure zoo!", "You enter an opulent throne room!" (no throne: "an opulent room!"), "You enter
 * a leprechaun hall!"), then it becomes an ordinary room and, for zoos and throne rooms, each
 * monster in it wakes one time in three unless she is stealthy. ref: src/hack.c
 * check_special_room() cases ZOO, COURT, LEPREHALL, wake_msg()
 */
export function enterZoo(ctx: Ctx, roomno: number): void {
  const level = getLevel(ctx.state);
  const room = level.rooms[roomno];
  const rt = room?.type;
  if (!room || rt === undefined) return;
  if (rt === ZOO) ctx.emit({ type: 'msg', key: 'zoo.welcome' });
  else if (rt === COURT)
    ctx.emit({
      type: 'msg',
      key: furniturePresent(level, room, T.throne) ? 'mkroom.court' : 'mkroom.court_no_throne',
    });
  else if (rt === LEPREHALL) ctx.emit({ type: 'msg', key: 'mkroom.leprehall' });
  delete room.type; // rtype = OROOM (before the room's monsters may wake)
  if (rt !== COURT && rt !== ZOO && rt !== SWAMP && rt !== MORGUE) return;
  for (const id of sortedIds(ctx.state)) {
    const e = ctx.state.entities[String(id)];
    const m = e?.c.monster;
    const p = e?.c.pos;
    if (!e || !m || id === ctx.state.playerId || p?.level !== level.id) continue;
    if (!insideRoom(room, p.x, p.y)) continue;
    if (heroHas(ctx.state, P.STEALTH) || ctx.rng.rn2(3) !== 0) continue;
    if (m.asleep && heroSees(ctx, p))
      ctx.emit({ type: 'msg', key: 'mon.wakes_up_calm', params: { mon: monNam(ctx, e) } });
    m.asleep = false;
  }
}

/** Some square of the room holds terrain `id`. ref: src/hack.c furniture_present() */
function furniturePresent(level: Level, room: Room, id: DefId): boolean {
  for (let x = room.lx; x <= room.hx; x++)
    for (let y = room.ly; y <= room.hy; y++) if (terrainIdAt(level, x, y) === id) return true;
  return false;
}
