// The Planes of Water and Air: Water's air bubbles and Air's clouds. Both levels are made of
// their element (WATER or AIR); bubbles of a few fixed shapes drift over it, bouncing off the
// level's edges and now and then turning. On Water a bubble is open air carrying the hero,
// monsters, objects and traps (the magic portal among them) inside it; on Air it is a cloud that
// moves slowly (1 time in 6) and carries nothing, and the Air level's edges get random clouds
// each turn. The bubbles move once a turn on the hero's level and when she arrives (C's
// moveloop_core() and goto_level()); the hero remembers nothing on either level (C's
// `hero_memory = 0`): every cell she does not see shows the level's element.
//
// The bubbles are content state, `modData.nh.bubbles[levelId]` (C's file-scope bubble list and
// its static `up`, saved with the game here); the terrain is rewritten with setTerrain().
// The bounds are the level's size less a margin, as C's (`xmin` 3, `ymin` 1, `xmax` COLNO - 2,
// `ymax` ROWNO - 1 on the 80 x 21 map), so a level of any size is covered.
// ref: src/mkmaze.c setup_waterlevel(), mk_bubble(), movebubbles(), mv_bubble(),
// maybe_adjust_hero_bubble(), water_friction(); src/hack.c air_turbulence(), water_turbulence();
// src/allmain.c moveloop_core(); src/do.c goto_level()
//
// Not ported: set_wportal() (the portal is a trap, carried like any other), the ball and chain,
// long worms' tails (no worm lives on the Water level), elemental_clog() (a monster with no room
// left goes to a random spot, or stays where it was).
import {
  cellIndex,
  getLevel,
  getPlayer,
  inBounds,
  sortedIds,
  type Ctx,
  type Dir,
  type Entity,
  type Json,
  type Level,
  type ModApi,
  type Msg,
  type Pos,
  type Trap,
} from '@nh/core';
import { isSwallowed, ustuck } from './engulfstate';
import { mnextoPos, rlocPos } from './generation';
import { placeObject, stackobj } from './items';
import { isAirLevel, isWaterLevel } from './levelflags';
import { isPool } from './liquid';
import { levitating, flying } from './trapstate';
import { nearCapacity } from './stats';
import { goodposMon } from './teleport';
import { T, setTerrain, terrainIdAt } from './terrain';
import { swimming, uinwater } from './uwater';

/** One bubble (or cloud): its top-left corner, its drift and its shape (BUBBLE_SHAPES index). */
export interface Bubble {
  x: number;
  y: number;
  dx: number;
  dy: number;
  n: number;
}

/**
 * A level's bubbles in C's chain order, the direction the next move walks the chain (C's static
 * `up`) and the bubble the hero was carried in by the last move (C's `hero_bubble`, an index).
 */
export interface BubbleLevel {
  list: Bubble[];
  up: boolean;
  hero?: number;
}

/**
 * The bubbles' bit masks: width, height, then one row mask per line (bit i is column i). They
 * look round on a 25x80 terminal, hence not symmetric. ref: src/mkmaze.c mk_bubble() bmask
 */
export const BUBBLE_SHAPES: readonly (readonly number[])[] = [
  [2, 1, 0x3],
  [3, 2, 0x7, 0x7],
  [4, 3, 0x6, 0xf, 0x6],
  [5, 3, 0xe, 0x1f, 0xe],
  [6, 4, 0x1e, 0x3f, 0x3f, 0x1e],
  [7, 4, 0x3e, 0x7f, 0x7f, 0x3e],
  [8, 4, 0x7e, 0xff, 0xff, 0x7e],
];

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit(params ? { type: 'msg', key, params } : { type: 'msg', key });

/**
 * The area bubbles move in (C's gbxmin..gbxmax, gbymin..gbymax): `xmin` 3 and `ymin` 1, `xmax`
 * the level's width - 2 and `ymax` its height - 1 (78 and 20 on the 80 x 21 map), each one in.
 */
export function bubbleBounds(level: Readonly<Level>): {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
} {
  return { xmin: 3 + 1, ymin: 1 + 1, xmax: level.width - 2 - 1, ymax: level.height - 1 - 1 };
}

const shape = (b: Bubble): readonly number[] => BUBBLE_SHAPES[b.n] ?? [2, 1, 0x3];

/** The cells of bubble `b`, row by row within each column, as C walks its mask. */
export function bubbleCells(b: Bubble): Pos[] {
  const bm = shape(b);
  const out: Pos[] = [];
  for (let i = 0; i < (bm[0] ?? 0); i++)
    for (let j = 0; j < (bm[1] ?? 0); j++)
      if (((bm[j + 2] ?? 0) & (1 << i)) !== 0) out.push({ x: b.x + i, y: b.y + j });
  return out;
}

const store = (ctx: Pick<Ctx, 'state'>): Record<string, Json> => {
  const nh = (ctx.state.modData['nh'] ??= {}) as Record<string, Json>;
  return (nh['bubbles'] ??= {}) as Record<string, Json>;
};

/** The bubbles of level `id`, or null on a level without them. */
export function bubblesOf(ctx: Pick<Ctx, 'state'>, id: string): BubbleLevel | null {
  const nh = ctx.state.modData['nh'] as { bubbles?: Record<string, BubbleLevel> } | undefined;
  return nh?.bubbles?.[id] ?? null;
}

const setLit = (level: Level, x: number, y: number, lit: 0 | 1): void => {
  level.lit[cellIndex(level, x, y)] = lit;
};

/**
 * Turns the Plane of Water or Air into its element (stone becomes water or air) and makes its
 * bubbles: on Water one every 10-19 columns and 4-7 rows, on Air one every 6-9 columns and 3-5
 * rows, each of a random shape drifting a random way. From the level's fixup, before its portal
 * is placed (in a bubble: water is no place for one). ref: src/mkmaze.c setup_waterlevel(),
 * fixup_special()
 */
export function setupWaterlevel(ctx: Ctx, level: Level): void {
  const water = isWaterLevel(ctx.state, level);
  if (!water && !isAirLevel(ctx.state, level)) return;
  const typ = water ? T.water : T.air;
  // set unspecified terrain (stone) to water or air
  for (let x = 1; x <= level.width - 1; x++)
    for (let y = 0; y <= level.height - 1; y++)
      if (terrainIdAt(level, x, y) === T.stone) setTerrain(level, x, y, typ);
  const bl: BubbleLevel = { list: [], up: false };
  store(ctx)[level.id] = bl as unknown as Json;
  const xskip = water ? 10 + ctx.rng.rn2(10) : 6 + ctx.rng.rn2(4);
  const yskip = water ? 4 + ctx.rng.rn2(4) : 3 + ctx.rng.rn2(3);
  const { xmin, ymin, xmax, ymax } = bubbleBounds(level);
  for (let x = xmin; x <= xmax; x += xskip)
    for (let y = ymin; y <= ymax; y += yskip) mkBubble(ctx, level, bl, x, y, ctx.rng.rn2(7));
}

/** A new bubble of shape `n` at (x, y), kept inside the bounds. ref: src/mkmaze.c mk_bubble() */
function mkBubble(ctx: Ctx, level: Level, bl: BubbleLevel, x: number, y: number, n: number): void {
  const { xmax, ymax } = bubbleBounds(level);
  if (x >= xmax || y >= ymax) return;
  const bm = BUBBLE_SHAPES[Math.min(n, BUBBLE_SHAPES.length - 1)] ?? [2, 1, 0x3];
  if (x + (bm[0] ?? 0) - 1 > xmax) x = xmax - (bm[0] ?? 0) + 1;
  if (y + (bm[1] ?? 0) - 1 > ymax) y = ymax - (bm[1] ?? 0) + 1;
  const dx = 1 - ctx.rng.rn2(3);
  const dy = 1 - ctx.rng.rn2(3);
  const b: Bubble = { x, y, dx, dy, n: Math.min(n, BUBBLE_SHAPES.length - 1) };
  bl.list.push(b);
  mvBubble(ctx, level, b, 0, 0, true, null);
}

/** What a Water bubble picked up, with the cell it was on (C's `struct container`). */
type Cons =
  | { what: 'obj'; x: number; y: number; ids: number[] }
  | { what: 'mon'; x: number; y: number; id: number }
  | { what: 'hero'; x: number; y: number }
  | { what: 'trap'; x: number; y: number; trap: Trap };

/**
 * Moves the bubbles of the hero's level (Water or Air): on Water everything inside a bubble is
 * picked up and every bubble cell turns to water; on Air the level turns back to air with random
 * clouds along its edges; then each bubble moves (the chain walked one way, then the other, so
 * that what changes hands where bubbles overlap does not pile up in the last one) and is drawn
 * again, the hero and what it held carried along. ref: src/mkmaze.c movebubbles()
 */
export function movebubbles(ctx: Ctx): void {
  const level = getLevel(ctx.state);
  const bl = bubblesOf(ctx, level.id);
  if (!bl) return;
  const water = isWaterLevel(ctx.state, level);
  const air = isAirLevel(ctx.state, level);
  delete bl.hero;
  const order = (): number[] => {
    const idx = bl.list.map((_, i) => i);
    return bl.up ? idx : idx.reverse();
  };
  const held = new Map<number, Cons[]>();
  if (water) {
    // pick up everything inside of a bubble then fill all bubble locations
    const at = contentsByCell(ctx, level);
    const hero = getPlayer(ctx.state);
    const hp = hero.c.pos;
    const swallowed = isSwallowed(ctx);
    for (const bi of order()) {
      const b = bl.list[bi] as Bubble;
      const cons: Cons[] = [];
      for (const { x, y } of bubbleCells(b)) {
        if (!inBounds(level, x, y)) continue;
        const i = cellIndex(level, x, y);
        const here = at.get(i);
        // pick up objects, monsters, hero, and traps (each put in front of the list)
        if (here && here.objs.length > 0) {
          const ids = here.objs.map((e) => e.id);
          for (const e of here.objs) delete e.c.pos;
          cons.unshift({ what: 'obj', x, y, ids });
          here.objs = [];
        }
        if (here?.mon) {
          cons.unshift({ what: 'mon', x, y, id: here.mon.id });
          delete here.mon.c.pos;
          delete here.mon;
        }
        if (!swallowed && hp && hp.x === x && hp.y === y) {
          cons.unshift({ what: 'hero', x, y });
          bl.hero = bi;
        }
        // (the hero and traps stay on the map, so overlapping bubbles each take them along and
        // the last one moved wins, as C)
        const t = level.traps.find((tr) => tr.x === x && tr.y === y);
        if (t) cons.unshift({ what: 'trap', x, y, trap: t });
        setTerrain(level, x, y, T.water);
        setLit(level, x, y, 0);
      }
      held.set(bi, cons);
    }
  } else if (air) {
    const { xmin, ymin, xmax, ymax } = bubbleBounds(level);
    for (let x = 1; x <= level.width - 1; x++)
      for (let y = 0; y <= level.height - 1; y++) {
        setTerrain(level, x, y, T.air);
        setLit(level, x, y, 1);
        // all air or all cloud around the perimeter of the Air level tends to look strange;
        // break up the pattern
        const xedge = x < xmin || x > xmax;
        const yedge = y < ymin || y > ymax;
        if ((xedge || yedge) && !ctx.rng.rn2(xedge ? 3 : 5)) setTerrain(level, x, y, T.cloud);
      }
  }
  // every second time traverse down
  bl.up = !bl.up;
  for (const bi of order()) {
    const b = bl.list[bi] as Bubble;
    const rx = ctx.rng.rn2(3);
    const ry = ctx.rng.rn2(3);
    mvBubble(
      ctx,
      level,
      b,
      b.dx + 1 - (!b.dx ? rx : rx ? 1 : 0),
      b.dy + 1 - (!b.dy ? ry : ry ? 1 : 0),
      false,
      held.get(bi) ?? null,
    );
  }
  if (water) level.traps.sort((a, b) => cellIndex(level, a.x, a.y) - cellIndex(level, b.x, b.y));
}

/** Floor objects (bottom of the pile first) and the monster on each cell of `level`. */
function contentsByCell(ctx: Ctx, level: Level): Map<number, { objs: Entity[]; mon?: Entity }> {
  const out = new Map<number, { objs: Entity[]; mon?: Entity }>();
  const cell = (i: number) => {
    let c = out.get(i);
    if (!c) out.set(i, (c = { objs: [] }));
    return c;
  };
  for (const id of sortedIds(ctx.state)) {
    const e = ctx.state.entities[String(id)];
    const p = e?.c.pos;
    if (!e || !p || p.level !== level.id || id === ctx.state.playerId) continue;
    const i = cellIndex(level, p.x, p.y);
    if (e.c.item) cell(i).objs.push(e);
    else if (e.c.monster) cell(i).mon = e;
  }
  // a pile is placed back bottom first, so that it keeps its order
  for (const c of out.values())
    c.objs.sort((a, b) => (a.c.item?.placed ?? 0) - (b.c.item?.placed ?? 0) || a.id - b.id);
  return out;
}

/**
 * Moves bubble `b` by (dx, dy) (by at most one step; clouds only 1 time in 6), bouncing off the
 * bounds, draws it (air on Water, cloud on Air, lit) and puts back what it carried, moved with
 * it. A bubble that hit an edge turns away from it; else now and then (1 in 20, or 1 in 5 when
 * it stands still) it takes a new random drift. `ini`: its first drawing (no turn).
 * ref: src/mkmaze.c mv_bubble()
 */
function mvBubble(
  ctx: Ctx,
  level: Level,
  b: Bubble,
  dx: number,
  dy: number,
  ini: boolean,
  cons: readonly Cons[] | null,
): void {
  const air = isAirLevel(ctx.state, level);
  const water = isWaterLevel(ctx.state, level);
  const bm = shape(b);
  const w = bm[0] ?? 0;
  const h = bm[1] ?? 0;
  const { xmin, ymin, xmax, ymax } = bubbleBounds(level);
  let colli = 0;
  // clouds move slowly
  if (!air || !ctx.rng.rn2(6)) {
    // move bubble
    dx = Math.sign(dx);
    dy = Math.sign(dy);
    // collision with level borders? 1 = horizontal border, 2 = vertical, 3 = corner
    if (b.x <= xmin) colli |= 2;
    if (b.y <= ymin) colli |= 1;
    if (b.x + w - 1 >= xmax) colli |= 2;
    if (b.y + h - 1 >= ymax) colli |= 1;
    if (b.x < xmin) b.x = xmin;
    if (b.y < ymin) b.y = ymin;
    if (b.x + w - 1 > xmax) b.x = xmax - w + 1;
    if (b.y + h - 1 > ymax) b.y = ymax - h + 1;
    // bounce if we're trying to move off the border
    if (b.x === xmin && dx < 0) dx = -dx;
    if (b.x + w - 1 === xmax && dx > 0) dx = -dx;
    if (b.y === ymin && dy < 0) dy = -dy;
    if (b.y + h - 1 === ymax && dy > 0) dy = -dy;
    b.x += dx;
    b.y += dy;
  }
  // draw the bubbles
  for (const { x, y } of bubbleCells(b)) {
    if (!inBounds(level, x, y)) continue;
    if (water) setTerrain(level, x, y, T.air);
    else if (air) setTerrain(level, x, y, T.cloud);
    setLit(level, x, y, 1);
  }
  // replace contents of bubble
  if (water && cons) for (const c of cons) putBack(ctx, level, c, dx, dy);
  // boing?
  switch (colli) {
    case 1:
      b.dy = -b.dy;
      break;
    case 3:
      b.dy = -b.dy;
      b.dx = -b.dx;
      break;
    case 2:
      b.dx = -b.dx;
      break;
    default:
      // sometimes alter direction for fun anyway (higher probability for stationary bubbles)
      if (!ini && (b.dx || b.dy ? !ctx.rng.rn2(20) : !ctx.rng.rn2(5))) {
        b.dx = 1 - ctx.rng.rn2(3);
        b.dy = 1 - ctx.rng.rn2(3);
      }
  }
}

/** Puts one thing a bubble carried back, `(dx, dy)` from where it was. ref: mv_bubble() */
function putBack(ctx: Ctx, level: Level, c: Cons, dx: number, dy: number): void {
  const x = c.x + dx;
  const y = c.y + dy;
  switch (c.what) {
    case 'obj':
      for (const id of c.ids) {
        placeObject(ctx, id, level.id, x, y);
        stackobj(ctx, id);
      }
      break;
    case 'mon': {
      const mon = ctx.state.entities[String(c.id)];
      if (mon) mnearto(ctx, level, mon, x, y, { x: c.x, y: c.y });
      break;
    }
    case 'hero': {
      const hero = getPlayer(ctx.state);
      const from = hero.c.pos ? { x: hero.c.pos.x, y: hero.c.pos.y } : { x: c.x, y: c.y };
      hero.c.pos = { level: level.id, x, y };
      ctx.emit({ type: 'moved', id: hero.id, from, to: { x, y } });
      // a monster already there moves next to her (mnexto())
      const m = monsterOn(ctx, level, x, y);
      if (m) {
        const to = mnextoPos(ctx, level, m.id, { x, y });
        if (to) m.c.pos = { level: level.id, x: to.x, y: to.y };
      }
      break;
    }
    case 'trap':
      c.trap.x = x;
      c.trap.y = y;
      break;
  }
}

const monsterOn = (ctx: Ctx, level: Level, x: number, y: number): Entity | undefined => {
  for (const id of sortedIds(ctx.state)) {
    const e = ctx.state.entities[String(id)];
    const p = e?.c.pos;
    if (
      e?.c.monster &&
      id !== ctx.state.playerId &&
      p?.level === level.id &&
      p.x === x &&
      p.y === y
    )
      return e;
  }
  return undefined;
};

/**
 * Puts a carried monster (off the map) on (x, y), or the nearest good spot, moving a monster
 * standing there out of its way; with no room at all it goes to a random spot of the level, or
 * back where it was (C's elemental_clog() is not ported). An engulfer takes the hero with it.
 * ref: src/mon.c mnearto(move_other = TRUE)
 */
function mnearto(ctx: Ctx, level: Level, mon: Entity, x: number, y: number, was: Pos): void {
  const other = monsterOn(ctx, level, x, y);
  const otherWas = other?.c.pos ? { x: other.c.pos.x, y: other.c.pos.y } : null;
  // take othermon off the map; it might end up immediately returning
  if (other) delete other.c.pos;
  const place = (m: Entity, px: number, py: number, back: Pos): void => {
    const to =
      (goodposMon(ctx, level, px, py, m.id) ? { x: px, y: py } : null) ??
      mnextoPos(ctx, level, m.id, { x: px, y: py }) ??
      rlocPos(ctx, level, m) ??
      back;
    m.c.pos = { level: level.id, x: to.x, y: to.y };
  };
  place(mon, x, y, was);
  if (other && otherWas) place(other, x, y, otherWas);
  // rloc_to(): the hero inside an engulfer goes with it
  const stuck = ustuck(ctx);
  const p = mon.c.pos;
  if (stuck === mon.id && isSwallowed(ctx) && p) {
    const hero = getPlayer(ctx.state);
    hero.c.pos = { level: level.id, x: p.x, y: p.y };
  }
}

/**
 * The hero remembers nothing of the Planes of Water and Air: every cell she does not see shows
 * the level's element, no object or monster is remembered. Vision then marks what she sees.
 * ref: src/mkmaze.c fixup_special() `hero_memory = 0`, setup_waterlevel() (the remembered glyph)
 */
export function forgetPlane(ctx: Ctx, level: Level): void {
  const water = isWaterLevel(ctx.state, level);
  if (!water && !isAirLevel(ctx.state, level)) return;
  const id = water ? T.water : T.air;
  let pi = level.palette.indexOf(id);
  if (pi === -1) pi = level.palette.push(id) - 1;
  const mem = (ctx.state.memory[level.id] ??= new Array<number>(level.width * level.height).fill(
    -1,
  ));
  for (let x = 1; x <= level.width - 1; x++)
    for (let y = 0; y <= level.height - 1; y++) mem[cellIndex(level, x, y)] = pi;
  ctx.state.objectMemory[level.id] = {};
  ctx.state.monsterMemory[level.id] = {};
}

/**
 * After a move that took her somewhere on the Plane of Water, the bubble she rode last time may
 * (1 in 2) take her direction. ref: src/mkmaze.c maybe_adjust_hero_bubble()
 */
export function maybeAdjustHeroBubble(ctx: Ctx, dx: number, dy: number): void {
  if (!isWaterLevel(ctx.state)) return;
  if (!dx && !dy) return;
  const bl = bubblesOf(ctx, ctx.state.currentLevel);
  const b = bl?.hero === undefined ? undefined : bl.list[bl.hero];
  if (b && !ctx.rng.rn2(2)) {
    b.dx = dx;
    b.dy = dy;
  }
}

/**
 * The Plane of Air disturbs her steps 3 times in 4 unless she levitates or flies: "You tumble in
 * place.", "You can't control your movements very well." or "It's hard to walk in thin air."; the
 * move is lost (and takes its time). ref: src/hack.c air_turbulence() (no exercise)
 */
export function airTurbulence(ctx: Ctx): boolean {
  if (isAirLevel(ctx.state) && ctx.rng.rn2(4) && !levitating(ctx) && !flying(ctx)) {
    say(ctx, `bubbles.air_turbulence_${ctx.rng.rn2(3)}`);
    ctx.interrupt(); // nomul(0)
    return true;
  }
  return false;
}

const DIR_OF: Readonly<Record<string, Dir>> = {
  '0,-1': 'n',
  '1,-1': 'ne',
  '1,0': 'e',
  '1,1': 'se',
  '0,1': 's',
  '-1,1': 'sw',
  '-1,0': 'w',
  '-1,-1': 'nw',
};

/** ref: include/hack.h SLT_ENCUMBER, MOD_ENCUMBER */
const SLT_ENCUMBER = 1;
const MOD_ENCUMBER = 2;

/**
 * In the water her move may go astray: water_friction() (1 in 3, or less on a diagonal, the
 * step turns sideways onto water or stops: "Water turbulence affects your movements."; a natural
 * swimmer only 1 time in 4); then, off the Plane of Water, climbing out of the water while too
 * heavy ("You are carrying too much to climb out of the water.": stressed or more for a swimmer,
 * burdened or more otherwise) fails. Returns the direction she now moves in, or null when the
 * move ends here (it takes its time). ref: src/hack.c water_turbulence(); src/mkmaze.c
 * water_friction()
 */
export function waterTurbulence(ctx: Ctx, dir: Dir, dxy: Pos): Dir | null {
  if (!uinwater(ctx)) return dir;
  const hero = getPlayer(ctx.state);
  const p = hero.c.pos;
  if (!p) return dir;
  const level = getLevel(ctx.state, p.level);
  let { x: dx, y: dy } = dxy;
  if (!(swimming(ctx) && ctx.rng.rn2(4))) {
    let eff = false;
    if (dx && !ctx.rng.rn2(!dy ? 3 : 6)) {
      // cancel delta x and choose an arbitrary delta y value
      let ny: number;
      do {
        ny = ctx.rng.rn2(3) - 1;
      } while (ny && (!inBounds(level, p.x, p.y + ny) || !isPool(ctx, level, p.x, p.y + ny)));
      dx = 0;
      dy = ny;
      eff = true;
    } else if (dy && !ctx.rng.rn2(!dx ? 3 : 5)) {
      // cancel delta y and choose an arbitrary delta x value
      let nx: number;
      do {
        nx = ctx.rng.rn2(3) - 1;
      } while (nx && (!inBounds(level, p.x + nx, p.y) || !isPool(ctx, level, p.x + nx, p.y)));
      dy = 0;
      dx = nx;
      eff = true;
    }
    if (eff) say(ctx, 'bubbles.water_turbulence');
  }
  if (!dx && !dy) {
    ctx.interrupt();
    return null;
  }
  const x = p.x + dx;
  const y = p.y + dy;
  // are we trying to move out of water while carrying too much?
  if (
    inBounds(level, x, y) &&
    !isPool(ctx, level, x, y) &&
    !isWaterLevel(ctx.state, level) &&
    nearCapacity(ctx.state, ctx.defs, hero.id) > (swimming(ctx) ? MOD_ENCUMBER : SLT_ENCUMBER)
  ) {
    say(ctx, 'bubbles.too_much_to_climb_out');
    ctx.interrupt();
    return null;
  }
  return DIR_OF[`${dx},${dy}`] ?? dir;
}

/**
 * The bubbles move once a turn while she is on Water or Air (after the demigod's countdown, as
 * moveloop_core() orders them) and when she arrives there (after the pets came, as goto_level()
 * does it); each time what she does not see is forgotten.
 */
export function registerBubbles(api: ModApi): void {
  const step = (ctx: Ctx): void => {
    const level = getLevel(ctx.state);
    if (!bubblesOf(ctx, level.id)) return;
    movebubbles(ctx);
    forgetPlane(ctx, level);
  };
  api.on(
    'endOfTurn',
    (ctx) => {
      if (ctx.state.gameOver === null) step(ctx);
    },
    { priority: -12 },
  );
  api.on('levelChange', (ctx) => step(ctx), { priority: -1 });
}
