// Shopkeepers and their stock: a shop room gets its shopkeeper by the door and an object of its
// type (or now and then a mimic posing as one) on every other floor square when its level is
// made (the shop types are in shtypes.ts).
// ref: src/shknam.c shkinit(), nameshk(), good_shopdoor(), stock_room(), stock_room_goodpos(),
// mkshobj_at(), get_shop_item(), shkveg(), mkveggy_at(); src/sp_lev.c fill_special_room() (the
// shop branch); src/mkroom.c mkshop() (random dungeon shops)
//
// Not ported: the tribute novel, the "Closed for inventory" engraving of a locked shop door (no
// engravings), irregular shops (no Minetown shop is one), Orcus's ghost town, the scroll of
// charging shopkeepers carry (not in the object table: the roll is made).
import { mAt } from './wormstate';
import { doorTrapped, setDoorTrapped } from './btrapstate';
import {
  cellIndex,
  sortedIds,
  type Ctx,
  type EntityId,
  type Level,
  type ModApi,
  type ObjectDef,
  type Pos,
} from '@nh/core';
import { SHOPKEEPER, eshkOf, setEshk, shopDoors, type Eshk } from './eshk';
import { makemon, mkclass, rlocPos } from './generation';
import { mkobj, mksobjFull } from './mkobj';
import { mkmonmoney, mongets } from './mongear';
import { T, setTerrain } from './terrain';
import { monLearnsTraps } from './trapstate';
import {
  SHTYPES,
  SHK_GENERAL,
  SHK_LIGHT,
  SHK_RINGS,
  SHK_TOOLS,
  shopType,
  veggyItem,
  type ShopItem,
  type ShopType,
} from './shtypes';

export { SHTYPES, saleable, shopType, veggyItem, type ShopItem, type ShopType } from './shtypes';

/** A random vegetarian food type, by probability. ref: src/shknam.c shkveg() */
function shkveg(ctx: Pick<Ctx, 'rng' | 'defs'>): ObjectDef | null {
  // (a corpse type counts as veggy here only in C's view of an unmade one; it never had a
  // chance of being picked there either way, as corpses have oc_prob 0)
  const ok = ctx.defs.objects.filter(
    (d) => d.class === 'food' && d.id !== 'nh:corpse' && veggyItem(ctx, null, d),
  );
  const maxprob = ok.reduce((a, d) => a + d.prob, 0);
  if (maxprob < 1) return null;
  let prob = ctx.rng.rnd(maxprob);
  let j = 0;
  let pick = ok[0];
  while (pick && (prob -= pick.prob) > 0) pick = ok[++j];
  return pick ?? null;
}

// ---------------------------------------------------------------------------------------------
// stock

/**
 * The kind of object for a shop square: `for (j = rnd(100); (j -= iprob) > 0; i++)`. An entry
 * naming an object this port lacks is rolled again (see DEVIATIONS.md).
 * ref: src/shknam.c get_shop_item()
 */
export function getShopItem(ctx: Pick<Ctx, 'rng' | 'defs'>, shp: ShopType): ShopItem {
  for (;;) {
    let j = ctx.rng.rnd(100);
    let i = 0;
    while (i < shp.iprobs.length - 1 && (j -= shp.iprobs[i]?.prob ?? 0) > 0) i++;
    const item = shp.iprobs[i]?.item ?? 'random';
    if (typeof item !== 'object' || ctx.defs.isObject(item.def)) return item;
  }
}

/** MON_AT(x, y) on the level being made. */
function monAt(ctx: Pick<Ctx, 'state'>, level: Level, x: number, y: number): boolean {
  return mAt(ctx.state, level.id, x, y) !== null; // a worm's tail square holds the worm
}

/**
 * Makes one object of the shop's kinds on x,y, or, one time in 100 per level of depth, a mimic
 * there (makemon()'s set_mimic_sym() makes it pose as the shop's stock).
 * ref: src/shknam.c mkshobj_at(), mkveggy_at()
 */
function mkshobjAt(ctx: Ctx, level: Level, shp: ShopType, x: number, y: number): void {
  if (ctx.rng.rn2(100) < level.depth && !monAt(ctx, level, x, y)) {
    const ptr = mkclass(ctx, 'm', level.depth); // mkclass(S_MIMIC, 0)
    if (ptr && makemon(ctx, ptr, { x, y }, { level: level.id, inMklev: true }) !== null) return;
  }
  const at = { level: level.id, x, y };
  const gen = { level: level.id, inMklev: true };
  const item = getShopItem(ctx, shp);
  if (item === 'veggy') {
    const def = shkveg(ctx);
    if (def) mksobjFull(ctx, def, { at, artif: true }, gen);
  } else if (typeof item === 'object') {
    mksobjFull(ctx, ctx.defs.object(item.def), { at, artif: true }, gen);
  } else mkobj(ctx, item, { at, ...gen });
}

/** ref: include/rm.h IS_ROOM(typ): floor, stairs, altars and fountains; not doors or corridors */
function isRoomCell(ctx: Pick<Ctx, 'defs'>, level: Level, x: number, y: number): boolean {
  const id = level.palette[level.cells[cellIndex(level, x, y)] ?? -1];
  if (id === undefined) return false;
  const t = ctx.defs.terrain(id);
  return t.passable && t.door === undefined && t.id !== T.corr;
}

// ---------------------------------------------------------------------------------------------
// the shopkeeper

/**
 * Where the shopkeeper stands for the door `d` of room `r`: one step inside.
 * ref: src/shknam.c good_shopdoor() (a regular room)
 */
function shkSpot(r: Level['rooms'][number], d: Pos): Pos | null {
  if (d.x === r.lx - 1) return { x: d.x + 1, y: d.y };
  if (d.x === r.hx + 1) return { x: d.x - 1, y: d.y };
  if (d.y === r.ly - 1) return { x: d.x, y: d.y + 1 };
  if (d.y === r.hy + 1) return { x: d.x, y: d.y - 1 };
  return null;
}

/**
 * A level ordinal standing in for ledger_no(): the dungeon's index in `state.dungeons` times
 * 100 plus the level number (only its value modulo the name list's length matters).
 */
function ledgerNo(ctx: Pick<Ctx, 'state'>, level: Level): number {
  const d = ctx.state.dungeons.findIndex((x) => x.id === level.dungeon);
  return Math.max(d, 0) * 100 + level.dlevel;
}

/**
 * Picks the shopkeeper's name from his shop type's list, different from every other living
 * shopkeeper's on the level: the town's lighting shop is always Izchak's; otherwise a name
 * that varies from game to game (from `state.seed`, standing in for the hero's birthday) and
 * level to level, random ones when it is taken, the general store's list when that runs dry,
 * and "Lucrezia" or "Dirk" at last. The tool shop list is always drawn at random.
 * ref: src/shknam.c nameshk()
 */
export function nameshk(
  ctx: Ctx,
  level: Level,
  shkId: EntityId,
  names: readonly string[],
): { shknam: string; female: boolean } {
  if (names === SHK_LIGHT && level.town === true) return { shknam: '+Izchak', female: false };
  let nlp = names;
  const nseed = Math.trunc(ctx.state.seed / 257);
  let nameWanted = shkId + ledgerNo(ctx, level) + (nseed % 13) - (nseed % 5);
  if (nameWanted < 0) nameWanted += 13 + 5;
  let female = (nameWanted & 1) === 1;
  let namesAvail = nlp.length;
  nameWanted = nameWanted % namesAvail;
  const taken = new Set<string>();
  for (const id of sortedIds(ctx.state)) {
    const e = eshkOf(ctx, id);
    const p = ctx.state.entities[String(id)]?.c.pos;
    if (id !== shkId && e && p?.level === level.id && ctx.state.entities[String(id)]?.c.monster)
      taken.add(e.shknam);
  }
  let shname = '';
  for (let trycnt = 0; trycnt < 50; trycnt++) {
    if (nlp === SHK_TOOLS) {
      shname = SHK_TOOLS[ctx.rng.rn2(namesAvail)] ?? '';
      female = false; // reversed below for '_' prefix
    } else if (nameWanted < namesAvail) {
      shname = nlp[nameWanted] ?? '';
    } else {
      const i = ctx.rng.rn2(namesAvail);
      if (i !== 0) shname = nlp[i - 1] ?? '';
      else if (nlp !== SHK_GENERAL) {
        nlp = SHK_GENERAL; // try general names
        namesAvail = nlp.length;
        continue; // next `trycnt' iteration
      } else shname = female ? '-Lucrezia' : '+Dirk';
    }
    const c = shname.charAt(0);
    if (c === '_' || c === '-') female = true;
    else if (c === '|' || c === '+') female = false;
    // is name already in use on this level?
    if (!taken.has(shname)) break; // new name
    nameWanted = namesAvail; // try a random name
  }
  return { shknam: shname, female };
}

/**
 * Makes the shopkeeper of shop `room`: at the first door of its walls, one step inside (any
 * monster there is moved away), peaceful, awake, knowing every trap, with 1030 to 4000 gold
 * and his name. Returns him, or null when the room has no door or he could not be made.
 * ref: src/shknam.c shkinit(), good_shopdoor()
 */
export function shkinit(ctx: Ctx, level: Level, room: number, shp: ShopType): EntityId | null {
  const r = level.rooms[room];
  const shd = shopDoors(ctx.defs, level, room)[0];
  const spot = r && shd ? shkSpot(r, shd) : null;
  if (!shd || !spot) return null;
  // insurance: move a monster out of the way (rloc(RLOC_NOMSG))
  for (const id of sortedIds(ctx.state)) {
    const e = ctx.state.entities[String(id)];
    const p = e?.c.pos;
    if (!e?.c.monster || !p || p.level !== level.id || p.x !== spot.x || p.y !== spot.y) continue;
    const to = rlocPos(ctx, level);
    if (to) {
      p.x = to.x;
      p.y = to.y;
    }
  }
  const id = makemon(ctx, ctx.defs.monster(SHOPKEEPER), spot, { level: level.id });
  const shk = id === null ? undefined : ctx.state.entities[String(id)];
  if (id === null || !shk?.c.monster) return null;
  shk.c.monster.peaceful = true;
  shk.c.monster.asleep = false;
  // (set_malign(): the malign is computed when it is needed)
  for (const t of ctx.defs.traps) monLearnsTraps(ctx, id, t.id); // we know all the traps already
  const eshk: Eshk = {
    shoproom: room,
    shoplevel: level.id,
    shoptype: shp.id,
    shk: { ...spot },
    shd: { ...shd },
    robbed: 0,
    credit: 0,
    debit: 0,
    following: false,
    surcharge: false,
    bill: [],
    visitct: 0,
    customer: false,
    shknam: '',
    female: false,
  };
  setEshk(ctx, id, eshk);
  mkmonmoney(ctx, id, 1000 + 30 * ctx.rng.rnd(100)); // initial capital
  // a touchstone for a ring shop's keeper; a scroll of charging for the tool, wand, some ring
  // and general shops' (it does not exist: only the rolls are made)
  if (shp.names === SHK_RINGS) {
    mongets(ctx, id, 'nh:touchstone');
    ctx.rng.rn2(2);
  } else if (shp.names === SHK_GENERAL) ctx.rng.rn2(5);
  Object.assign(eshk, nameshk(ctx, level, id, shp.names));
  return id;
}

/**
 * Not a square for stock: the row (or column) along the wall of the shop door, and anything
 * but room floor. ref: src/shknam.c stock_room_goodpos() (a regular room)
 */
function stockGoodpos(
  ctx: Pick<Ctx, 'defs'>,
  level: Level,
  r: Level['rooms'][number],
  d: Pos,
  x: number,
  y: number,
): boolean {
  if (
    (x === r.lx && d.x === x - 1) ||
    (x === r.hx && d.x === x + 1) ||
    (y === r.ly && d.y === y - 1) ||
    (y === r.hy && d.y === y + 1)
  )
    return false;
  return isRoomCell(ctx, level, x, y);
}

/**
 * Stocks a new shop: its shopkeeper first (nothing more without one), a doorway or broken door
 * made an open door, a secret door a door and a trapped door a locked one, then one object of the shop's kinds on each good
 * square, column by column. ref: src/shknam.c stock_room()
 */
export function stockRoom(ctx: Ctx, level: Level, room: number, shp: ShopType): void {
  const shk = shkinit(ctx, level, room, shp);
  const e = shk === null ? null : eshkOf(ctx, shk);
  const r = level.rooms[room];
  if (!e || !r) return;
  // make sure no doorways without doors, and no secret doors, in shops
  const { x, y } = e.shd;
  const id = level.palette[level.cells[cellIndex(level, x, y)] ?? -1];
  const vertical = x === r.lx - 1 || x === r.hx + 1; // a door in a left or right wall
  if (id === T.doorway) setTerrain(level, x, y, vertical ? T.door_open_v : T.door_open_h);
  else if (id === T.sdoor_v || id === T.sdoor_h) setTerrain(level, x, y, T.door_closed);
  else if (id === T.sdoor_locked_v || id === T.sdoor_locked_h)
    setTerrain(level, x, y, T.door_locked);
  // a trapped shop door becomes a locked one (the trap is gone)
  if (doorTrapped(ctx, level.id, x, y)) {
    setDoorTrapped(ctx, level.id, x, y, false);
    setTerrain(level, x, y, T.door_locked);
  }
  for (let sx = r.lx; sx <= r.hx; sx++)
    for (let sy = r.ly; sy <= r.hy; sy++)
      if (stockGoodpos(ctx, level, r, e.shd, sx, sy)) mkshobjAt(ctx, level, shp, sx, sy);
}

/**
 * Stocks the shops of a new level, as fill_special_room() does for each top-level room in
 * order, its subrooms first: a shop room not marked unfilled gets its shopkeeper and stock.
 * ref: src/sp_lev.c fill_special_room() (the shop branch), sp_level_coder() / makelevel()
 */
export function stockShops(ctx: Ctx, level: Level): void {
  const fill = (i: number): void => {
    for (let j = 0; j < level.rooms.length; j++) if (level.rooms[j]?.parent === i) fill(j);
    const r = level.rooms[i];
    const shp = shopType(r?.type);
    if (!r || !shp || r.filled === false) return;
    stockRoom(ctx, level, i, shp);
  };
  for (let i = 0; i < level.rooms.length; i++) if (level.rooms[i]?.parent === undefined) fill(i);
}

/** Stocks the shops of each new level (after the LevelDef contents, as fill_special_room()). */
export function registerShops(api: ModApi): void {
  api.on('newLevel', (ctx, level) => stockShops(ctx, level));
}

// ---------------------------------------------------------------------------------------------
// random dungeon shops

/** ref: src/mkroom.c isbig(): more than 20 squares */
function isbig(r: Level['rooms'][number]): boolean {
  return (r.hx - r.lx + 1) * (r.hy - r.ly + 1) > 20;
}

/** Plain room floor (`levl[x][y].typ == ROOM`: not stairs, doors or corridors). */
function isFloor(level: Level, x: number, y: number): boolean {
  return level.palette[level.cells[cellIndex(level, x, y)] ?? -1] === T.floor;
}

/**
 * A room whose shopkeeper, standing just inside the door, could only step to one other square
 * is no shop. ref: src/mkroom.c invalid_shop_shape()
 */
function invalidShopShape(level: Level, r: Level['rooms'][number], door: Pos): boolean {
  let insidex = 0;
  let insidey = 0;
  let insidect = 0;
  // first, identify squares inside the room and next to the door
  for (let x = Math.max(door.x - 1, r.lx); x <= Math.min(door.x + 1, r.hx); x++)
    for (let y = Math.max(door.y - 1, r.ly); y <= Math.min(door.y + 1, r.hy); y++)
      if (isFloor(level, x, y)) {
        insidex = x;
        insidey = y;
        insidect++;
      }
  if (insidect < 1) return true; // impossible("no squares inside door?")
  // if more than one, the shopkeeper already has alternate squares to move to
  if (insidect === 1) {
    insidect = 0;
    for (let x = Math.max(insidex - 1, r.lx); x <= Math.min(insidex + 1, r.hx); x++)
      for (let y = Math.max(insidey - 1, r.ly); y <= Math.min(insidey + 1, r.hy); y++)
        if ((x !== insidex || y !== insidey) && isFloor(level, x, y)) insidect++;
    if (insidect === 1) return true;
  }
  return false;
}

/** Whether stairs (up, down or the branch's) lie inside the room. ref: has_upstairs(), has_dnstairs() */
function hasStairs(level: Level, r: Level['rooms'][number]): boolean {
  return [level.up, level.down, level.branch?.pos ?? null].some(
    (p) => p !== null && p.x >= r.lx && p.x <= r.hx && p.y >= r.ly && p.y <= r.hy,
  );
}

/**
 * Makes the first ordinary room with no stairs, exactly one door and a good shape a shop: lit
 * (walls too), its type rolled `rnd(100)` over the shop probabilities, a big room never a wand or
 * book shop (a general store instead). It is stocked with the other shops (`stockShops`).
 * The branch stairs are already placed here (C places them after the shop, outside it), so a
 * room holding them is passed over. ref: src/mkroom.c mkshop() (no wizard-mode SHOPTYPE)
 */
export function mkshop(ctx: Ctx, level: Level): number | null {
  let room = -1;
  for (let i = 0; i < level.rooms.length; i++) {
    const r = level.rooms[i];
    if (!r || r.parent !== undefined) continue;
    if (r.type !== undefined) continue; // not an ordinary room
    if (hasStairs(level, r)) continue;
    const doors = shopDoors(ctx.defs, level, i);
    const door = doors[0];
    if (doors.length === 1 && door && !invalidShopShape(level, r, door)) {
      room = i;
      break;
    }
  }
  const sroom = level.rooms[room];
  if (!sroom) return null;
  if (!sroom.lit) {
    for (let x = sroom.lx - 1; x <= sroom.hx + 1; x++)
      for (let y = sroom.ly - 1; y <= sroom.hy + 1; y++) level.lit[cellIndex(level, x, y)] = 1;
    sroom.lit = true;
  }
  // pick a shop type at random
  let i = 0;
  for (let j = ctx.rng.rnd(100); i < SHTYPES.length - 1 && (j -= SHTYPES[i]?.prob ?? 0) > 0; i++);
  let shp = SHTYPES[i] ?? SHTYPES[0];
  // big rooms cannot be wand or book shops, so make them general stores
  if (isbig(sroom) && (shp?.symb === 'wand' || shp?.symb === 'spellbook')) shp = SHTYPES[0];
  if (shp) sroom.type = shp.id;
  return room;
}
