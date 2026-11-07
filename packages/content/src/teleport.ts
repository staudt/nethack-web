// Where teleports go: the safe spots for the hero, monsters and objects, the random level of a
// level teleport, and which levels forbid teleporting. A leaf module (core and leaves only); the
// moves themselves (teleds(), tele(), level_tele(), rloc(), rloco()...) are in trap.ts, because
// teleds() ends in the trap code and the traps call back into it.
// ref: src/teleport.c noteleport_level(), goodpos(), teleok(), collect_coords(), safe_teleds(),
// rloc(), rloc_pos_ok(), rloco(), random_teleport_level(); src/dungeon.c get_level()
//
// Not ported (see DEVIATIONS.md "Teleportation"): the demon court of Gehennom, covetous
// monsters, the teleport regions of special levels (`dndest`/`updest`, tele_jump_ok()), the
// onscary() test of rloc_pos_ok() (nothing here scares a monster off a square), the Wizard's
// stairs, water and lava (none exist), Passes_walls.
import {
  cellIndex,
  cellRules,
  dungeonLayout,
  getPlayer,
  inBounds,
  inRooms,
  sortedIds,
  trapAt,
  type CellRules,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type Level,
  type LevelRef,
  type Pos,
} from '@nh/core';
import { boulderCells } from './boulder';
import { epriOf, inhistemple } from './epri';
import { eshkOf, inhishop } from './eshk';
import { dungeonBottom, levelFlags } from './levelflags';

/** The Sokoban dungeon. ref: In_sokoban() */
export const SOKOBAN_DUNGEON: DefId = 'nh:sokoban';

/**
 * Teleporting is impossible on this level. ref: src/teleport.c noteleport_level() (the level's
 * `noteleport` flag; the wand of stasis comes later)
 */
export function noteleportLevel(ctx: Pick<Ctx, 'defs'>, level: Readonly<Level>): boolean {
  return levelFlags(ctx, level).noteleport === true;
}

/** What goodpos() needs of a level, gathered once per search. */
interface Occupancy {
  level: Level;
  rules: CellRules;
  /** Cell index -> the monster there (the hero is not a monster). */
  mons: Map<number, EntityId>;
  boulders: Set<number>;
  /** The hero's cell on this level, or -1. */
  hero: number;
}

function occupancy(ctx: Pick<Ctx, 'state' | 'defs'>, level: Level): Occupancy {
  const mons = new Map<number, EntityId>();
  for (const id of sortedIds(ctx.state)) {
    const e = ctx.state.entities[String(id)];
    const p = e?.c.pos;
    if (e?.c.monster && p?.level === level.id && id !== ctx.state.playerId)
      mons.set(cellIndex(level, p.x, p.y), id);
  }
  const hp = getPlayer(ctx.state).c.pos;
  return {
    level,
    rules: cellRules(level, ctx.defs),
    mons,
    boulders: boulderCells(ctx, level),
    hero: hp?.level === level.id ? cellIndex(level, hp.x, hp.y) : -1,
  };
}

/** ref: accessible(x, y) and !closed_door(x, y) (ACCESSIBLE() counts closed doors) */
const accessible = (o: Occupancy, i: number): boolean => {
  const t = o.level.cells[i] ?? 0;
  return o.rules.passable[t] === true && !o.rules.closedDoor[t];
};

/**
 * ref: src/teleport.c goodpos(x, y, mtmp, 0): on the map, not the hero's square (unless `who` is
 * the hero), no other monster there when placing one (`who` null places an object: monsters do
 * not matter), accessible, and no boulder.
 */
function goodpos(o: Occupancy, x: number, y: number, who: EntityId | null): boolean {
  if (!inBounds(o.level, x, y)) return false;
  const i = cellIndex(o.level, x, y);
  const heroIsWho = who !== null && i === o.hero;
  if (i === o.hero && !heroIsWho) return false;
  if (who !== null) {
    const m = o.mons.get(i);
    if (m !== undefined && m !== who) return false;
  }
  return accessible(o, i) && !o.boulders.has(i);
}

/**
 * The hero may land at (x, y) of her level: not on a trap unless `trapok`, and a good position.
 * ref: src/teleport.c teleok() (no Levitation or Flying exemption for pits and holes yet)
 */
export function teleok(
  ctx: Pick<Ctx, 'state' | 'defs'>,
  level: Level,
  x: number,
  y: number,
  trapok: boolean,
): boolean {
  if (!trapok && inBounds(level, x, y) && trapAt(level, x, y)) return false;
  return goodpos(occupancy(ctx, level), x, y, ctx.state.playerId);
}

/**
 * The squares of `level` in rings of growing Chebyshev distance around (cx, cy), each ring (or
 * pair of rings) shuffled unless `unshuffled`. Column 0 is not used. `skipMons` drops squares
 * with a monster; squares a zap cannot cross (rock, walls) are always dropped (CC_SKIP_INACCS:
 * nothing here passes walls).
 * ref: src/teleport.c collect_coords() (maxradius 0: the whole map)
 */
function collectCoords(
  ctx: Pick<Ctx, 'rng' | 'defs'>,
  o: Occupancy,
  cx: number,
  cy: number,
  flags: { inclCenter?: true; unshuffled?: true; ringPairs?: true; skipMons?: true },
): Pos[] {
  const { level } = o;
  const w = level.width;
  const h = level.height;
  const scramble = flags.unshuffled !== true;
  const ringPairs = scramble && flags.ringPairs === true;
  const rowrange = cy < Math.trunc(h / 2) ? h - 1 - cy : cy;
  const colrange = cx < Math.trunc(w / 2) ? w - 1 - cx : cx;
  const maxradius = Math.max(rowrange, colrange);
  const out: Pos[] = [];
  let pass = 0; // start of the entries of the current radius (or pair)
  for (let radius = flags.inclCenter ? 0 : 1; radius <= maxradius; ++radius) {
    const newpass = !ringPairs || radius % 2 !== 0 || radius === 0;
    const passend = !ringPairs || radius % 2 === 0 || radius === maxradius;
    if (newpass) pass = out.length;
    const lox = cx - radius;
    const hix = cx + radius;
    const loy = cy - radius;
    const hiy = cy + radius;
    for (let y = Math.max(loy, 0); y <= hiy && y <= h - 1; ++y)
      for (let x = Math.max(lox, 1); x <= hix && x <= w - 1; ++x) {
        if (x !== lox && x !== hix && y !== loy && y !== hiy) continue; // not on the ring
        const i = cellIndex(level, x, y);
        if (flags.skipMons && o.mons.has(i)) continue;
        // !ZAP_POS(): rock, walls and secret doors (doors and floor pass)
        const t = level.palette[level.cells[i] ?? 0];
        const def = t === undefined ? undefined : ctx.defs.terrain(t);
        if (!def || !(def.passable || def.door !== undefined)) continue;
        out.push({ x, y });
      }
    if (scramble && passend) {
      // shuffle the entries gathered for this radius (or pair)
      let n = out.length - pass;
      let at = pass;
      while (n > 1) {
        const k = ctx.rng.rn2(n);
        if (k) {
          const a = out[at] as Pos;
          out[at] = out[at + k] as Pos;
          out[at + k] = a;
        }
        ++at;
        --n;
      }
    }
  }
  return out;
}

/**
 * Where a hero teleporting at random lands: 40 random tries off traps, then every square in
 * shuffled rings (pairs of rings) around her, the nearest acceptable one, else the first
 * acceptable trap square met; null when there is none. Her own square counts in the random
 * tries ("You materialize in the same location!").
 * ref: src/teleport.c safe_teleds() (the spot; trap.ts teleds() moves her)
 */
export function safeTeledsPos(ctx: Pick<Ctx, 'state' | 'defs' | 'rng'>, level: Level): Pos | null {
  const o = occupancy(ctx, level);
  const me = ctx.state.playerId;
  const ok = (x: number, y: number, trapok: boolean): boolean =>
    (trapok || !trapAt(level, x, y)) && goodpos(o, x, y, me);
  for (let tcnt = 0; tcnt < 40; ++tcnt) {
    const nux = ctx.rng.rnd(level.width - 1);
    const nuy = ctx.rng.rn2(level.height);
    if (ok(nux, nuy, false)) return { x: nux, y: nuy };
  }
  const hp = getPlayer(ctx.state).c.pos;
  if (!hp) return null;
  let backup: Pos | null = null;
  for (const c of collectCoords(ctx, o, hp.x, hp.y, { ringPairs: true, skipMons: true })) {
    if (ok(c.x, c.y, false)) return c;
    if (!backup && trapAt(level, c.x, c.y) && ok(c.x, c.y, true)) backup = c;
  }
  return backup;
}

/**
 * A resident shopkeeper or temple priest stays in his room when he can. ref: src/teleport.c
 * rloc_pos_ok() (goodpos() and the room test; no onscary(), no teleport regions)
 */
function rlocPosOk(
  ctx: Pick<Ctx, 'state'>,
  o: Occupancy,
  x: number,
  y: number,
  mon: Entity,
): boolean {
  if (!goodpos(o, x, y, mon.id)) return false;
  const eshk = eshkOf(ctx, mon.id);
  if (eshk && inhishop(ctx, mon.id)) return inRooms(o.level, x, y).includes(eshk.shoproom);
  const epri = epriOf(ctx, mon.id);
  if (epri && inhistemple(ctx, mon.id)) return inRooms(o.level, x, y).includes(epri.shroom);
  return true;
}

/**
 * Where a monster teleported at random lands: 50 random tries, then every square in a shuffled
 * order, else the first plain good position met; null when the level is full.
 * ref: src/teleport.c rloc() (no steed, Wizard or wizard-mode control)
 */
export function rlocMonPos(
  ctx: Pick<Ctx, 'state' | 'defs' | 'rng'>,
  level: Level,
  mon: Entity,
): Pos | null {
  const o = occupancy(ctx, level);
  for (let trycount = 0; trycount < 50; ++trycount) {
    const x = ctx.rng.rnd(level.width - 1);
    const y = ctx.rng.rn2(level.height);
    if (rlocPosOk(ctx, o, x, y, mon)) return { x, y };
  }
  const candy = collectCoords(ctx, o, Math.trunc(level.width / 2), Math.trunc(level.height / 2), {
    inclCenter: true,
    unshuffled: true,
    skipMons: true,
  });
  let backup: Pos | null = null;
  for (let i = 0; i < candy.length; ++i) {
    const j = ctx.rng.rn2(candy.length - i);
    if (j > 0) {
      const c = candy[i] as Pos;
      candy[i] = candy[i + j] as Pos;
      candy[i + j] = c;
    }
    const c = candy[i] as Pos;
    if (rlocPosOk(ctx, o, c.x, c.y, mon)) return c;
    if (!backup && goodpos(o, c.x, c.y, mon.id)) backup = c;
  }
  return backup;
}

/**
 * Where a teleported object lands: `rn1(COLNO - 3, 2), rn2(ROWNO)` until a good position (no
 * boulder, not the hero's square; monsters do not matter), giving up after 4000 tries on the
 * last square tried, as rloco() does. ref: src/teleport.c rloco()
 */
export function rlocoPos(ctx: Pick<Ctx, 'state' | 'defs' | 'rng'>, level: Level): Pos {
  const o = occupancy(ctx, level);
  let tryLimit = 4000;
  let tx: number;
  let ty: number;
  do {
    tx = ctx.rng.rn2(Math.max(1, level.width - 3)) + 2;
    ty = ctx.rng.rn2(level.height);
    if (!--tryLimit) break;
  } while (!goodpos(o, tx, ty, null));
  return { x: tx, y: ty };
}

/**
 * The depth an uncontrolled level teleport from `level` goes to: the current depth 1 time in 5
 * (no teleport), else `rn2(cur + 3 - min) + min` skipping the current depth, kept within the
 * dungeon (from depth 1 to its bottom; the main dungeon's is DUNGEON_BOTTOM, as for holes).
 * ref: src/teleport.c random_teleport_level() (no quest, Knox, Gehennom or endgame)
 */
export function randomTeleportLevel(
  ctx: Pick<Ctx, 'state' | 'rng'>,
  level: Readonly<Level>,
): number {
  const layout = dungeonLayout(ctx.state, level.dungeon);
  const curDepth = layout.depthStart + level.dlevel - 1;
  if (!ctx.rng.rn2(5)) return curDepth;
  const minDepth = 1;
  const bottom = dungeonBottom(ctx.state, level);
  const maxDepth = bottom + (layout.depthStart - 1);
  // Get a random value relative to the current dungeon; range is 1 to current+3, current not
  // counting
  let nlev = ctx.rng.rn2(curDepth + 3 - minDepth) + minDepth;
  if (nlev >= curDepth) nlev++;
  if (nlev > maxDepth) {
    nlev = maxDepth;
    // teleport up if already on bottom
    if (level.dlevel === layout.levels) nlev -= ctx.rng.rnd(3);
  }
  if (nlev < minDepth) {
    nlev = minDepth;
    if (nlev === curDepth) {
      nlev += ctx.rng.rnd(3);
      if (nlev > maxDepth) nlev = maxDepth;
    }
  }
  return nlev;
}

/**
 * The level at absolute `depth` as seen from `level`: in its dungeon, or the parent dungeon's
 * (and so on up) for a depth above its top; past its bottom, its last level (the main dungeon's
 * last is DUNGEON_BOTTOM). ref: src/dungeon.c get_level()
 */
export function levelAtDepth(
  ctx: Pick<Ctx, 'state'>,
  level: Readonly<Level>,
  depth: number,
): LevelRef {
  let dgn = dungeonLayout(ctx.state, level.dungeon);
  if (depth <= 0) return { dungeon: level.dungeon, dlevel: level.dlevel };
  const last = dgn.levels ?? dungeonBottom(ctx.state, level);
  if (depth > dgn.depthStart + last - 1) return { dungeon: dgn.id, dlevel: last };
  while (depth < dgn.depthStart) {
    // the parent dungeon: the one with a branch to this one
    const id = dgn.id;
    const parent = ctx.state.dungeons.find((d) => d.branches.some((b) => b.to === id));
    if (!parent) break;
    dgn = parent;
  }
  return { dungeon: dgn.id, dlevel: depth - dgn.depthStart + 1 };
}
