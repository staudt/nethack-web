// The Rogue level, a tribute to Rogue on DL15-18: three by three sections, each holding a room or
// a crossing, joined by a little maze walk with a few extra links; doorways with no doors (some
// secret), corridors with a few secret squares, the stairs in rooms.
// ref: src/extralev.c makeroguerooms(), miniwalk(), roguecorr(), roguejoin(), corr();
// src/mklev.c makelevel() (the Is_rogue_level() path), dodoor(), dosdoor(), sort_rooms(),
// generate_stairs(), generate_stairs_find_room(), find_branch_room(), place_branch();
// the tribute ghost: src/extralev.c makerogueghost(), src/do_name.c roguename()
//
// Translation notes (DEVIATIONS.md "The Rogue level"): the LevelDef is unlit stone with
// placeholder stairs (the castle's pattern: no draws), and its `before` fixup runs makelevel()'s
// rogue path in C's order: makeroguerooms(), makerogueghost(), sort_rooms(),
// generate_stairs(), place_branch(), then every room's fill_ordinary_room(). C's `goto skip0`
// leaves out the corridors pass, the niches, the vault and the special room. The fill runs here
// rather than in mklev's newLevel hook, which comes before the fixups. Any map size: a section is
// trunc((width - 2) / 3) columns by trunc(height / 3) rows, C's 26 by 7 at 80x21 (C's columns
// are ours + 1, so its `1 + 26 * x` is our `26 * x`), and the room limits follow from it so that
// 80x21 draws C's constants exactly. Below MIN_SECTION the level is an ordinary
// rooms-and-corridors level whose doors are all doorways or secret doors with no door behind.
import type { Ctx, DefId, EntityId, ItemComponent, Level, LevelDef, Pos, Room } from '@nh/core';
import { VANILLA_TERRAIN, generateLevel, insideRoom, levelStairs } from '@nh/core';
import { levelDifficulty } from './levdiff';
import { makemon } from './generation';
import { mksobj, placeOnFloor } from './items';
import { ROGUE } from './levelflags';
import { fillOrdinaryRooms, mkCorridorBoulders } from './mklev';
import { somexyspaceTry } from './somexy';
import { ROGUE_SYMSET } from './symset';
import { liftStairs, type SpLevFixup } from './sp_lev';
import { T, setTerrain, terrainIdAt } from './terrain';
import { mkVault } from './vault';

/**
 * ref: src/extralev.c makeroguerooms(), makelevel()'s rogue path. Placeholder stairs at Level
 * column 0 (lifted by the fixup, which makes the real ones in rooms).
 */
export const ROGUE_LEVEL: LevelDef = {
  id: ROGUE,
  init: { style: 'solidfill', fg: 'nh:stone', lit: false },
  // ref: src/do.c goto_level() assign_graphics(ROGUESET); src/hack.c doorless_door()
  symset: ROGUE_SYMSET.id,
  doorwaysBlockDiagonal: true,
  stairs: {
    up: { x: 0, y: 0, coords: 'level' },
    down: { x: 0, y: 1, coords: 'level' },
    branch: { x: 0, y: 2, coords: 'level' },
  },
};

const XL_UP = 1;
const XL_DOWN = 2;
const XL_LEFT = 4;
const XL_RIGHT = 8;

/** One of the nine sections. ref: src/extralev.c struct rogueroom (gr.r[x][y]) */
interface Section {
  real: boolean;
  /** A room's floor starts here (a crossing's square), relative to the section. */
  rlx: number;
  rly: number;
  /** A room's floor size. */
  dx: number;
  dy: number;
  doortable: number;
  /** A room's index in `Level.rooms`. */
  nroom: number;
}

/** The smallest section the 3x3 grid works with (C's is 26 x 7). */
export const MIN_SECTION = { w: 8, h: 6 } as const;

/** A section's size on a map of this size: C's 26 columns by 7 rows at 80x21. */
export function rogueSection(width: number, height: number): { sw: number; sh: number } {
  return { sw: Math.trunc((width - 2) / 3), sh: Math.trunc(height / 3) };
}

/** Whether the 3x3 grid fits a map of this size. */
export function rogueFits(width: number, height: number): boolean {
  const { sw, sh } = rogueSection(width, height);
  return sw >= MIN_SECTION.w && sh >= MIN_SECTION.h;
}

/**
 * Lays out the nine sections, walks the little maze between them, makes the rooms (lit 1 in 7)
 * with their walls, then the corridors and their doorways. `level` is stone.
 * ref: src/extralev.c makeroguerooms() (`rn1(22, 2)` is `rn1(sw - 4, 2)`, `rnd(23 - dx + 1)`
 * `rnd(sw - 3 - dx + 1)`, the last row one deeper), miniwalk(); src/mklev.c add_room()
 * (do_room_or_subroom())
 */
export function makeRogueRooms(ctx: Pick<Ctx, 'rng' | 'state'>, level: Level): void {
  const { rng } = ctx;
  const { sw, sh } = rogueSection(level.width, level.height);
  const r: Section[][] = [[], [], []];
  const at = (x: number, y: number): Section => r[x]?.[y] as Section;
  let nroom = 0;
  for (let y = 0; y < 3; y++)
    for (let x = 0; x < 3; x++) {
      const last = y === 2 ? 1 : 0;
      const here: Section = { real: false, rlx: 0, rly: 0, dx: 0, dy: 0, doortable: 0, nroom: -1 };
      // at least one room: if the first eight are all crossings, the last is a room
      if (rng.rn2(5) === 0 && (nroom > 0 || (x < 2 && y < 2))) {
        here.rlx = rng.rn2(sw - 4) + 2;
        here.rly = rng.rn2(sh - 4 + last) + 2;
      } else {
        here.real = true;
        here.dx = rng.rn2(sw - 4) + 2; // 2-23 long, plus walls
        here.dy = rng.rn2(sh - 4 + last) + 2; // 2-5 high, plus walls
        here.rlx = rng.rnd(sw - 3 - here.dx + 1);
        here.rly = rng.rnd(sh - 3 + last - here.dy + 1);
        nroom++;
      }
      (r[x] as Section[])[y] = here;
    }

  // ref: miniwalk(): walkfrom() on the 3x3 grid, each move from the square it moved to
  const miniwalk = (x0: number, y0: number): void => {
    let x = x0;
    let y = y0;
    for (;;) {
      const dirs: number[] = [];
      const doorhere = (): number => at(x, y).doortable;
      // Rogue levels aren't just 3 by 3 mazes; they have some extra connections (1 in 10)
      if (x > 0 && !(doorhere() & XL_LEFT) && (!at(x - 1, y).doortable || !rng.rn2(10)))
        dirs.push(0);
      if (x < 2 && !(doorhere() & XL_RIGHT) && (!at(x + 1, y).doortable || !rng.rn2(10)))
        dirs.push(1);
      if (y > 0 && !(doorhere() & XL_UP) && (!at(x, y - 1).doortable || !rng.rn2(10))) dirs.push(2);
      if (y < 2 && !(doorhere() & XL_DOWN) && (!at(x, y + 1).doortable || !rng.rn2(10)))
        dirs.push(3);
      if (dirs.length === 0) return;
      const dir = dirs[rng.rn2(dirs.length)];
      if (dir === 0) {
        at(x, y).doortable |= XL_LEFT;
        x--;
        at(x, y).doortable |= XL_RIGHT;
      } else if (dir === 1) {
        at(x, y).doortable |= XL_RIGHT;
        x++;
        at(x, y).doortable |= XL_LEFT;
      } else if (dir === 2) {
        at(x, y).doortable |= XL_UP;
        y--;
        at(x, y).doortable |= XL_DOWN;
      } else {
        at(x, y).doortable |= XL_DOWN;
        y++;
        at(x, y).doortable |= XL_UP;
      }
      miniwalk(x, y);
    }
  };
  // C's miniwalk(rn2(3), rn2(3)) leaves the order of its two draws to the compiler: x first here
  const sx = rng.rn2(3);
  miniwalk(sx, rng.rn2(3));

  for (let y = 0; y < 3; y++)
    for (let x = 0; x < 3; x++) {
      const here = at(x, y);
      if (!here.real) continue;
      here.nroom = level.rooms.length;
      const lowx = sw * x + here.rlx;
      const lowy = sh * y + here.rly;
      // Strictly speaking it should be lit only above level 10, "but since Rogue rooms are only
      // encountered below level 10, use !rn2(7)"
      addRoom(level, lowx, lowy, lowx + here.dx - 1, lowy + here.dy - 1, !rng.rn2(7));
    }

  /** ref: src/extralev.c corr(): a secret corridor square 1 time in 50 */
  const corr = (x: number, y: number): void =>
    setTerrain(level, x, y, rng.rn2(50) ? T.corr : T.scorr);

  /** ref: src/extralev.c roguejoin() */
  const roguejoin = (x1: number, y1: number, x2: number, y2: number, horiz: boolean): void => {
    if (horiz) {
      const middle = x1 + rng.rn2(x2 - x1 + 1);
      for (let x = Math.min(x1, middle); x <= Math.max(x1, middle); x++) corr(x, y1);
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) corr(middle, y);
      for (let x = Math.min(middle, x2); x <= Math.max(middle, x2); x++) corr(x, y2);
    } else {
      const middle = y1 + rng.rn2(y2 - y1 + 1);
      for (let y = Math.min(y1, middle); y <= Math.max(y1, middle); y++) corr(x1, y);
      for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) corr(x, middle);
      for (let y = Math.min(middle, y2); y <= Math.max(middle, y2); y++) corr(x2, y);
    }
  };

  /**
   * The corridor from section x,y down or right to the next one, with a doorway in each room's
   * wall it leaves by (a crossing's end is its square). ref: src/extralev.c roguecorr()
   */
  const roguecorr = (x: number, y: number, down: boolean): void => {
    const from = at(x, y);
    from.doortable &= ~(down ? XL_DOWN : XL_RIGHT);
    let fromx: number;
    let fromy: number;
    if (!from.real) {
      fromx = sw * x + from.rlx;
      fromy = sh * y + from.rly;
    } else if (down) {
      fromx = sw * x + from.rlx + rng.rn2(from.dx);
      fromy = sh * y + from.rly + from.dy;
      rogueDoor(ctx, level, fromx, fromy);
      fromy++;
    } else {
      fromx = sw * x + from.rlx + from.dx;
      fromy = sh * y + from.rly + rng.rn2(from.dy);
      rogueDoor(ctx, level, fromx, fromy);
      fromx++;
    }
    const tx = down ? x : x + 1;
    const ty = down ? y + 1 : y;
    const to = at(tx, ty);
    to.doortable &= ~(down ? XL_UP : XL_LEFT);
    let tox: number;
    let toy: number;
    if (!to.real) {
      tox = sw * tx + to.rlx;
      toy = sh * ty + to.rly;
    } else if (down) {
      tox = sw * tx + to.rlx + rng.rn2(to.dx);
      toy = sh * ty + to.rly - 1;
      rogueDoor(ctx, level, tox, toy);
      toy--;
    } else {
      tox = sw * tx + to.rlx - 1;
      toy = sh * ty + to.rly + rng.rn2(to.dy);
      rogueDoor(ctx, level, tox, toy);
      tox--;
    }
    roguejoin(fromx, fromy, tox, toy, !down);
  };

  // Now, add connecting corridors.
  for (let y = 0; y < 3; y++)
    for (let x = 0; x < 3; x++) {
      if (at(x, y).doortable & XL_DOWN) roguecorr(x, y, true);
      if (at(x, y).doortable & XL_RIGHT) roguecorr(x, y, false);
    }
}

/**
 * A walled room with its floor at lowx..hix, lowy..hiy, lit with its walls when `lit`.
 * ref: src/mklev.c add_room(), do_room_or_subroom() (not special, a room)
 */
function addRoom(
  level: Level,
  lowx: number,
  lowy: number,
  hix: number,
  hiy: number,
  lit: boolean,
): void {
  if (lit)
    for (let x = lowx - 1; x <= hix + 1; x++)
      for (let y = lowy - 1; y <= hiy + 1; y++) level.lit[y * level.width + x] = 1;
  for (let x = lowx - 1; x <= hix + 1; x++) {
    setTerrain(level, x, lowy - 1, T.hwall);
    setTerrain(level, x, hiy + 1, T.hwall);
  }
  for (let y = lowy; y <= hiy; y++) {
    setTerrain(level, lowx - 1, y, T.vwall);
    setTerrain(level, hix + 1, y, T.vwall);
  }
  for (let x = lowx; x <= hix; x++)
    for (let y = lowy; y <= hiy; y++) setTerrain(level, x, y, T.floor);
  setTerrain(level, lowx - 1, lowy - 1, T.tlcorn);
  setTerrain(level, hix + 1, lowy - 1, T.trcorn);
  setTerrain(level, lowx - 1, hiy + 1, T.blcorn);
  setTerrain(level, hix + 1, hiy + 1, T.brcorn);
  level.rooms.push({ lx: lowx, ly: lowy, hx: hix, hy: hiy, lit });
}

/**
 * A door in a room's wall, with every draw of dodoor() and dosdoor(), which on the Rogue level
 * always leave no door: a doorway, or a secret door with nothing behind it (roguecorr() sets
 * D_NODOOR after dosdoor(); dosdoor() itself already does for a door, so no trap and no mimic).
 * ref: src/mklev.c dodoor() (maybe_sdoor(8)), dosdoor() (no shop door here)
 */
function rogueDoor(ctx: Pick<Ctx, 'rng' | 'state'>, level: Level, x: number, y: number): void {
  const { rng } = ctx;
  const horiz = terrainIdAt(level, x, y) === T.hwall;
  const difficulty = levelDifficulty(ctx, level);
  if (level.depth > 2 && rng.rn2(8) === 0) {
    rng.rn2(5); // D_LOCKED or D_CLOSED
    if (difficulty >= 4) rng.rn2(20); // D_TRAPPED
    setTerrain(level, x, y, horiz ? T.sdoor_h : T.sdoor_v);
    return;
  }
  if (rng.rn2(3) === 0) {
    // a locked door, closed, or open
    const open = rng.rn2(5) === 0;
    if (!open) rng.rn2(6);
    if (!open && difficulty >= 5) rng.rn2(25); // D_TRAPPED
  }
  setTerrain(level, x, y, T.doorway);
}

/**
 * The ghost of a fallen Rogue player, asleep in a random room on its pile: 3 times in 4 rnd(7)
 * food rations; a +rnd(3) mace or a rnd(5)-2 two-handed sword; a +1 bow; rn1(10, 25) +0
 * arrows; ring mail +rn2(3) or plate mail rnd(5)-2, erodeproof 1 time in 3; every weapon and
 * armor cursed 3 times in 4; half the time a known cheap plastic imitation of the Amulet of
 * Yendor. The ghost's name (Michael Toy, Kenneth Arnold or Glenn Wichman) is drawn but not
 * given: monsters have no names here (DEVIATIONS.md "The Rogue level"), and makemon()'s
 * rndghostname() is drawn before it as in C. ref: src/extralev.c makerogueghost();
 * src/do_name.c roguename() (no ROGUEOPTS)
 */
export function makeRogueGhost(ctx: Ctx, level: Level): void {
  const { rng } = ctx;
  const rooms = level.rooms;
  if (rooms.length === 0) return; // Should never happen
  const croom = rooms[rng.rn2(rooms.length)] as Room;
  const x = croom.lx + rng.rn2(croom.hx - croom.lx + 1); // somex()
  const y = croom.ly + rng.rn2(croom.hy - croom.ly + 1); // somey()
  const ghost = makemon(ctx, ctx.defs.monster(GHOST), { x, y }, { level: level.id, inMklev: true });
  if (ghost === null) return;
  const m = ctx.state.entities[String(ghost)]?.c.monster;
  if (m) m.asleep = true;
  // christen_monst(ghost, roguename())
  if (rng.rn2(3)) rng.rn2(2);

  /** mksobj_at(otyp, x, y, init, FALSE), changed by `fix` before it lands on the pile. */
  const make = (otyp: DefId, init: boolean, fix: (it: ItemComponent) => void): void => {
    const id: EntityId = mksobj(ctx, ctx.defs.object(otyp), {
      init,
      artif: false,
      level: level.id,
    });
    const it = ctx.state.entities[String(id)]?.c.item;
    if (it) fix(it);
    placeOnFloor(ctx, id, level.id, x, y);
  };
  // curse(): its BUC (the pile is on the floor: nothing worn or wielded)
  const maybeCurse = (it: ItemComponent): void => {
    if (rng.rn2(4)) it.buc = 'cursed';
  };

  if (rng.rn2(4)) make('nh:food_ration', false, (it) => (it.quantity = rng.rnd(7)));
  if (rng.rn2(2))
    make('nh:mace', false, (it) => {
      it.spe = rng.rnd(3);
      maybeCurse(it);
    });
  else
    make('nh:two_handed_sword', false, (it) => {
      it.spe = rng.rnd(5) - 2;
      maybeCurse(it);
    });
  make('nh:bow', false, (it) => {
    it.spe = 1;
    maybeCurse(it);
  });
  make('nh:arrow', false, (it) => {
    it.spe = 0;
    it.quantity = rng.rn2(10) + 25; // rn1(10, 25)
    maybeCurse(it);
  });
  if (rng.rn2(2))
    make('nh:ring_mail', false, (it) => {
      it.spe = rng.rn2(3);
      if (!rng.rn2(3)) it.erodeproof = true;
      maybeCurse(it);
    });
  else
    make('nh:plate_mail', false, (it) => {
      it.spe = rng.rnd(5) - 2;
      if (!rng.rn2(3)) it.erodeproof = true;
      maybeCurse(it);
    });
  if (rng.rn2(2)) make(FAKE_AMULET, true, (it) => (it.known = { ...it.known, spe: true }));
}

const GHOST: DefId = 'nh:ghost';
const FAKE_AMULET: DefId = 'nh:fake_amulet_of_yendor';

/** Rooms left to right, ties kept in order. ref: src/mklev.c sort_rooms() */
function sortRooms(level: Level): void {
  level.rooms.sort((a, b) => a.lx - b.lx);
}

/**
 * A room for stairs: one without stairs, else any. ref: src/mklev.c generate_stairs_find_room()
 * (phases 2 and 1 alike here: no themed rooms; every room is joined)
 */
function stairsRoom(ctx: Pick<Ctx, 'rng'>, level: Level, stairs: readonly Pos[]): Room {
  const rooms = level.rooms.filter((r) => r.parent === undefined);
  for (let phase = 2; phase > -1; phase--) {
    const ok = rooms.filter(
      (r) => r.type === undefined && (phase < 1 || !stairs.some((p) => insideRoom(r, p.x, p.y))),
    );
    if (ok.length > 0) return ok[ctx.rng.rn2(ok.length)] as Room;
  }
  return rooms[ctx.rng.rn2(rooms.length)] as Room;
}

/** ref: src/mklev.c generate_stairs(): somexyspace(), else somex() and somey() */
function stairSpot(ctx: Pick<Ctx, 'rng'>, level: Level, room: Room): Pos {
  const r = somexyspaceTry(ctx, level, room);
  if (r.ok) return r.pos;
  return {
    x: room.lx + ctx.rng.rn2(room.hx - room.lx + 1),
    y: room.ly + ctx.rng.rn2(room.hy - room.ly + 1),
  };
}

/**
 * The down stairs, then the up stairs, each in a room without stairs when there is one; then the
 * branch stairs (when the dungeon gives the level some) in such a room too.
 * ref: src/mklev.c generate_stairs(), mkstairs(), place_branch(), find_branch_room()
 */
function rogueStairs(ctx: Pick<Ctx, 'rng' | 'state'>, level: Level): void {
  const want = levelStairs(ctx.state, level);
  const stairs: Pos[] = [];
  if (want.down) {
    const p = stairSpot(ctx, level, stairsRoom(ctx, level, stairs));
    setTerrain(level, p.x, p.y, T.stairs_down);
    level.down = p;
    stairs.push(p);
  }
  if (want.up) {
    const p = stairSpot(ctx, level, stairsRoom(ctx, level, stairs));
    setTerrain(level, p.x, p.y, T.stairs_up);
    level.up = p;
    stairs.push(p);
  }
  const branch = level.branch;
  if (branch) {
    // find_branch_room(): somexyspace(), its last try even when it failed ("Can't place branch!")
    const p = somexyspaceTry(ctx, level, stairsRoom(ctx, level, stairs)).pos;
    setTerrain(level, p.x, p.y, branch.dir === 'up' ? T.stairs_up : T.stairs_down);
    branch.pos = p;
  }
}

/** Doors of any state as dosdoor() leaves them on the Rogue level: no door. */
const NO_DOOR: Readonly<Record<string, DefId>> = {
  [T.door_open_v]: T.doorway,
  [T.door_open_h]: T.doorway,
  [T.door_closed]: T.doorway,
  [T.door_locked]: T.doorway,
  [T.sdoor_locked_v]: T.sdoor_v,
  [T.sdoor_locked_h]: T.sdoor_h,
};

/**
 * A map too small for the 3x3 grid: an ordinary rooms-and-corridors level (still the Rogue level
 * for every other rule) whose doors are all doorways and secret doors with no door behind them,
 * so none is trapped; its corridor boulders and vault are made as on any ordinary level.
 */
function ordinaryRogueLevel(ctx: Ctx, level: Level): void {
  const made = generateLevel(ctx.rng, {
    id: level.id,
    depth: level.depth,
    dungeon: level.dungeon,
    dlevel: level.dlevel,
    ...levelStairs(ctx.state, level),
    width: level.width,
    height: level.height,
    terrain: VANILLA_TERRAIN,
  });
  level.palette = made.palette;
  level.cells = made.cells;
  level.lit = made.lit;
  level.rooms = made.rooms;
  level.up = made.up;
  level.down = made.down;
  level.branch = made.branch;
  if (made.boulderSpots) level.boulderSpots = made.boulderSpots;
  if (made.vaultSpot) level.vaultSpot = made.vaultSpot;
  if (made.vaultTeleSpot) level.vaultTeleSpot = made.vaultTeleSpot;
  for (let y = 0; y < level.height; y++)
    for (let x = 0; x < level.width; x++) {
      const id = terrainIdAt(level, x, y);
      const to = id !== undefined && Object.hasOwn(NO_DOOR, id) ? NO_DOOR[id] : undefined;
      if (to !== undefined) setTerrain(level, x, y, to);
    }
  mkCorridorBoulders(ctx, level);
  mkVault(ctx, level);
}

/** The Rogue level's fixup: makelevel()'s rogue path, then the rooms' fill. */
export const ROGUE_FIXUP: SpLevFixup = {
  before(ctx, level) {
    liftStairs(level);
    if (rogueFits(level.width, level.height)) {
      makeRogueRooms(ctx, level);
      makeRogueGhost(ctx, level);
      sortRooms(level);
      rogueStairs(ctx, level);
    } else {
      ordinaryRogueLevel(ctx, level);
      makeRogueGhost(ctx, level);
    }
    fillOrdinaryRooms(ctx, level);
  },
};
