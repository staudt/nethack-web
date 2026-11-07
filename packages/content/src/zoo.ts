// Treasure zoos: a typed `nh:zoo` room (a LevelDef region with `type: 'nh:zoo', filled: true`)
// is filled when its level is made, greets the hero on her first entry, and Sokoban's top level
// puts its prize beside one. ref: src/mkroom.c fill_zoo(); src/hack.c check_special_room() ZOO;
// dat/soko1-1.lua, dat/soko1-2.lua
//
// Not ported (DEVIATIONS.md "Sokoban"): random zoos (mkroom(ZOO)), the other kinds of special
// room, `level.flags.has_zoo` (no zoo sounds), and the irregular room shape: a zoo is the
// rectangle of its region, filled on its open squares and treated as irregular (the squares next
// to its first door stay empty), which is what Sokoban's zoo is.
import {
  cellIndex,
  getLevel,
  inBounds,
  insideRoom,
  sortedIds,
  type Ctx,
  type DefId,
  type Level,
  type LevelDef,
  type ModApi,
  type Pos,
} from '@nh/core';
import { makemon } from './generation';
import { mkgold } from './items';
import { mksobjFull } from './mkobj';
import { heroSees } from './mongear';
import { monNam } from './perception';
import { P, heroHas } from './props';
import { mapToLevel, type SpLevFixup } from './sp_lev';

/** ref: include/mkroom.h ZOO */
export const ZOO: DefId = 'nh:zoo';

/**
 * The room's doors, in the order NetHack links them (link_doors_rooms(): y outer, x inner, each
 * new door inserted at `fdoor`), so the last one found is `doors[sroom->fdoor]`. A door is on
 * the room's boundary, orthogonally next to one of its squares (shared_with_room()).
 * ref: src/sp_lev.c link_doors_rooms(), maybe_add_door(); src/mklev.c add_door()
 */
function roomDoors(ctx: Ctx, level: Level, roomIndex: number): Pos[] {
  const r = level.rooms[roomIndex];
  if (!r) return [];
  const out: Pos[] = [];
  for (let y = r.ly - 1; y <= r.hy + 1; y++)
    for (let x = r.lx - 1; x <= r.hx + 1; x++) {
      const edgeX = x === r.lx - 1 || x === r.hx + 1;
      const edgeY = y === r.ly - 1 || y === r.hy + 1;
      if (edgeX === edgeY || !inBounds(level, x, y)) continue; // inside, or a corner
      const id = level.palette[level.cells[cellIndex(level, x, y)] ?? 0];
      if (id !== undefined && ctx.defs.terrain(id).door !== undefined) out.push({ x, y });
    }
  return out;
}

/** ref: src/hack.c distmin() */
const distmin = (x1: number, y1: number, x2: number, y2: number): number =>
  Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));

/**
 * Fills a treasure zoo: on each open square a random monster, asleep and alone, on a pile of
 * gold that grows with the distance from the room's first door, out of `500 *
 * level_difficulty()` in all (then `5 * level_difficulty()` a square). Squares next to that
 * door stay empty (the irregular-room rule). level_difficulty() is the level's depth here (no
 * builds-up adjustment, see DEVIATIONS.md "Sokoban"). ref: src/mkroom.c fill_zoo() ZOO
 */
export function fillZoo(ctx: Ctx, level: Level, roomIndex: number): void {
  const room = level.rooms[roomIndex];
  if (!room) return;
  const difficulty = level.depth; // level_difficulty()
  let goldlim = 500 * difficulty;
  const doors = roomDoors(ctx, level, roomIndex);
  const door = doors[doors.length - 1]; // svd.doors[sroom->fdoor]
  for (let sx = room.lx; sx <= room.hx; sx++)
    for (let sy = room.ly; sy <= room.hy; sy++) {
      const id = level.palette[level.cells[cellIndex(level, sx, sy)] ?? 0];
      const t = id === undefined ? undefined : ctx.defs.terrain(id);
      if (!t?.passable || t.door !== undefined) continue; // not a room square
      if (door && distmin(sx, sy, door.x, door.y) <= 1) continue;
      makemon(ctx, null, { x: sx, y: sy }, { level: level.id, asleep: true, nogroup: true });
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

/**
 * Fills the zoos of a new level that are not marked unfilled, in room order, after its LevelDef
 * contents. ref: src/sp_lev.c fill_special_room() (the ZOO branch), sp_level_coder()
 */
export function registerZoo(api: ModApi): void {
  api.on('newLevel', (ctx, level) => {
    for (let i = 0; i < level.rooms.length; i++) {
      const r = level.rooms[i];
      if (r?.type === ZOO && r.filled !== false) fillZoo(ctx, level, i);
    }
  });
}

/**
 * The hero enters a zoo: "Welcome to David's treasure zoo!", then (unless she is stealthy) each
 * monster in it wakes one time in three. The caller makes it an ordinary room afterwards.
 * ref: src/hack.c check_special_room() case ZOO, wake_msg()
 */
export function enterZoo(ctx: Ctx, roomno: number): void {
  const level = getLevel(ctx.state);
  const room = level.rooms[roomno];
  if (!room) return;
  ctx.emit({ type: 'msg', key: 'zoo.welcome' });
  if (heroHas(ctx.state, P.STEALTH)) return;
  for (const id of sortedIds(ctx.state)) {
    const e = ctx.state.entities[String(id)];
    const m = e?.c.monster;
    const p = e?.c.pos;
    if (!e || !m || id === ctx.state.playerId || p?.level !== level.id) continue;
    if (!insideRoom(room, p.x, p.y)) continue;
    if (ctx.rng.rn2(3) !== 0) continue;
    if (m.asleep && heroSees(ctx, p))
      ctx.emit({ type: 'msg', key: 'mon.wakes_up_calm', params: { mon: monNam(ctx, e) } });
    m.asleep = false;
  }
}

type Spot = readonly [x: number, y: number];

/**
 * Sokoban's prize, beside the zoo on the top level: at one of the listed map spots
 * (`selection.rndcoord(place)`, x then y order), a bag of holding `chance` percent of the time,
 * else an amulet of reflection, not cursed. Its Elbereth engraving and cursed scroll of scare
 * monster are not ported (DEVIATIONS.md "Sokoban"); no achievement is recorded.
 * ref: dat/soko1-1.lua, dat/soko1-2.lua ("Rewards"); src/sp_lev.c create_object() buc
 * "not-cursed"
 */
function sokobanPrize(chance: number, place: readonly Spot[]): SpLevFixup {
  return {
    after(ctx: Ctx, level: Level, def: LevelDef): void {
      const spot = place[ctx.rng.rn2(place.length)];
      if (!spot) return;
      const id = ctx.rng.rn2(100) < chance ? 'nh:bag_of_holding' : 'nh:amulet_of_reflection';
      const p = mapToLevel(def, level, spot[0], spot[1]);
      const e = mksobjFull(
        ctx,
        ctx.defs.object(id),
        { at: { level: level.id, x: p.x, y: p.y } },
        { level: level.id, inMklev: true },
      );
      const item = ctx.state.entities[String(e)]?.c.item;
      if (item?.buc === 'cursed') item.buc = 'uncursed'; // case 4 "not cursed": uncurse()
    },
  };
}

/** The prize fixups of the two top-level variants (soko1-2's bag is the 25% case). */
export const SOKOBAN_PRIZE_FIXUPS: Readonly<Record<DefId, SpLevFixup>> = {
  'nh:soko1-1': sokobanPrize(75, [
    [16, 11],
    [16, 13],
    [16, 15],
  ]),
  'nh:soko1-2': sokobanPrize(25, [
    [16, 10],
    [16, 12],
    [16, 14],
  ]),
};
