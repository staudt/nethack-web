// Long worms: the tail that follows and grows, shrinking when it cannot move, cutting a worm in
// two (wormcut.ts), the tail laid out behind a worm that appears somewhere new, and the diagonal squeeze
// between two of its segments. The records and the tail-to-worm lookup are in wormstate.ts.
// ref: src/worm.c initworm(), worm_move(), worm_nomove(), shrink_worm(),
// place_worm_tail_randomly(), remove_worm(), worm_cross(), wormhitu(); src/trap.c
// rnd_nextto_goodpos()
import { getLevel, type Ctx, type Entity, type EntityId, type Level, type Pos } from '@nh/core';
import { goodposMon } from './teleport';
import { setGiveWormTail } from './generation';
import { mspeed } from './mstate';
import {
  LONG_WORM,
  WORM_TAIL,
  anyWormTails,
  countWsegs,
  mAt,
  setWormRec,
  wormRec,
  wormgone,
  wormnoFree,
} from './wormstate';

/** ref: include/permonst.h NORMAL_SPEED */
const NORMAL_SPEED = 12;
/** ref: include/monst.h MHPMAX */
const MHPMAX = 500;

const ent = (ctx: Pick<Ctx, 'state'>, id: EntityId): Entity | undefined =>
  ctx.state.entities[String(id)];

/** A new tail segment entity at (x, y) of `level`. ref: place_worm_seg() */
function newSeg(ctx: Ctx, level: string, x: number, y: number): EntityId {
  return ctx.spawn({ def: WORM_TAIL, c: { pos: { level, x, y } } });
}

/**
 * The worm gets a worm number and a tail of `nsegs` segments, not yet on the map (callers lay it
 * with placeWormTailRandomly()); false when the level has no worm number left ("level infested
 * with worms"), and then it has no tail. ref: src/worm.c get_wormno(), initworm()
 */
export function initworm(ctx: Ctx, worm: EntityId, nsegs: number): boolean {
  const pos = ent(ctx, worm)?.c.pos;
  if (!pos || !wormnoFree(ctx.state, pos.level)) return false;
  const segs: EntityId[] = [];
  for (let i = 0; i < nsegs; i++) segs.push(ctx.spawn({ def: WORM_TAIL, c: {} }));
  setWormRec(ctx, worm, { segs, wgrowtime: 0 });
  return true;
}

/**
 * A random square next to (x, y) where the worm could stand, trying the eight directions in a
 * shuffled order. ref: src/trap.c rnd_nextto_goodpos() with goodpos(x, y, worm, 0) (the worm's
 * own squares count as taken)
 */
function rndNexttoGoodpos(ctx: Ctx, level: Level, worm: Entity, x: number, y: number): Pos | null {
  // ref: include/hack.h xdir[]/ydir[] (W, NW, N, NE, E, SE, S, SW)
  const XDIR = [-1, -1, 0, 1, 1, 1, 0, -1];
  const YDIR = [0, -1, -1, -1, 0, 1, 1, 1];
  const dirs = [0, 1, 2, 3, 4, 5, 6, 7];
  for (let i = 8; i > 0; --i) {
    const j = ctx.rng.rn2(i);
    const k = dirs[j] as number;
    dirs[j] = dirs[i - 1] as number;
    dirs[i - 1] = k;
  }
  for (const d of dirs) {
    const nx = x + (XDIR[d] as number);
    const ny = y + (YDIR[d] as number);
    if (goodposMon(ctx, level, nx, ny, worm.id)) return { x: nx, y: ny };
  }
  return null;
}

/**
 * Lays the worm's tail behind its head at (x, y), each segment on a random free square next to
 * the previous one; the rest of the tail goes when there is no room for it.
 * ref: src/worm.c place_worm_tail_randomly()
 */
export function placeWormTailRandomly(ctx: Ctx, worm: EntityId, x: number, y: number): void {
  const w = ent(ctx, worm);
  const rec = wormRec(ctx.state, worm);
  const lv = w?.c.pos?.level;
  if (!w || !rec || lv === undefined || rec.segs.length === 0) return;
  const level = getLevel(ctx.state, lv);
  // remove_worm()/unplaced segments: none of them blocks the new layout
  for (const s of rec.segs) {
    const e = ent(ctx, s);
    if (e) delete e.c.pos;
  }
  // nearest the head first; the record keeps the tail end first
  const order = [...rec.segs].reverse();
  const placed: EntityId[] = [];
  let ox = x;
  let oy = y;
  for (let i = 0; i < order.length; i++) {
    const s = order[i] as EntityId;
    const p = rndNexttoGoodpos(ctx, level, w, ox, oy);
    const e = ent(ctx, s);
    if (!p || !e) {
      // "Oops. Truncate because there is no place for rest of it."
      for (const r of order.slice(i)) if (ent(ctx, r)) ctx.remove(r);
      break;
    }
    e.c.pos = { level: lv, x: p.x, y: p.y };
    placed.push(s);
    ox = p.x;
    oy = p.y;
  }
  setWormRec(ctx, worm, { segs: placed.reverse(), wgrowtime: rec.wgrowtime });
}

/**
 * A long worm just made (makemon(), newcham(), arriving from another level) gets its worm number
 * and, if it has one, a tail of `nsegs` segments (`'random'`: rn2(5), drawn only once it has a
 * worm number) laid behind it.
 * ref: src/makemon.c makemon() `mndx == PM_LONG_WORM && (mtmp->wormno = get_wormno()) != 0`
 */
export function giveWormTail(ctx: Ctx, worm: EntityId, nsegs: number | 'random'): void {
  const p = ent(ctx, worm)?.c.pos;
  if (!p || !wormnoFree(ctx.state, p.level)) return;
  if (!initworm(ctx, worm, nsegs === 'random' ? ctx.rng.rn2(5) : nsegs)) return;
  if (countWsegs(ctx.state, worm) > 0) placeWormTailRandomly(ctx, worm, p.x, p.y);
}

/** The tail end goes. ref: src/worm.c shrink_worm() */
export function shrinkWorm(ctx: Ctx, worm: EntityId): void {
  const rec = wormRec(ctx.state, worm);
  if (!rec || rec.segs.length === 0) return; // no tail
  const [end, ...rest] = rec.segs;
  setWormRec(ctx, worm, { segs: rest, wgrowtime: rec.wgrowtime });
  if (end !== undefined && ent(ctx, end)) ctx.remove(end);
}

/**
 * The worm's head has moved from `from`: a new segment takes the old head square, and the tail
 * end goes unless it is time to grow (then the worm also gains hit points, up to a limit that
 * rises with its length). ref: src/worm.c worm_move()
 */
export function wormMove(ctx: Ctx, worm: EntityId, from: Pos): void {
  const w = ent(ctx, worm);
  const rec = wormRec(ctx.state, worm);
  const lv = w?.c.pos?.level;
  if (!w || !rec || lv === undefined) return;
  const segs = [...rec.segs, newSeg(ctx, lv, from.x, from.y)];
  let wgrowtime = rec.wgrowtime;
  if (wgrowtime <= ctx.state.turn) {
    let wsegs = segs.length;
    // "first set up for the next time to grow"
    if (!wgrowtime) {
      // new worm; usually grow a tail segment on its next turn
      wgrowtime = ctx.state.turn + ctx.rng.rnd(5);
    } else {
      // mcalcmove(worm, FALSE): its speed, adjusted for MSLOW/MFAST, not rounded
      let mmove = ctx.defs.monster(w.def).speed;
      const ms = mspeed(ctx, worm);
      if (ms === 'slow')
        mmove = mmove < NORMAL_SPEED ? Math.trunc((2 * mmove + 1) / 3) : 4 + Math.trunc(mmove / 3);
      else if (ms === 'fast') mmove = Math.trunc((4 * mmove + 2) / 3);
      let incr = ctx.rng.rn2(10) + 2; // rn1(10, 2): 2..12
      incr = Math.trunc((incr * NORMAL_SPEED) / Math.max(mmove, 1));
      wgrowtime = ctx.state.turn + incr;
    }
    // "increase HP based on number of segments"
    const mlev = w.c.monster?.level ?? 0;
    let whplimit = !mlev ? 4 : 8 * mlev;
    if (wsegs > 33) {
      whplimit += 2 * (wsegs - 33);
      wsegs = 33;
    }
    if (wsegs > 22) {
      whplimit += 4 * (wsegs - 22);
      wsegs = 22;
    }
    if (wsegs > 11) {
      whplimit += 6 * (wsegs - 11);
      wsegs = 11;
    }
    whplimit += 8 * wsegs;
    if (whplimit > MHPMAX) whplimit = MHPMAX;
    const hp = w.c.hp;
    if (hp) {
      const prev = hp.cur;
      hp.cur += ctx.rng.d(2, 2);
      const whpcap = Math.max(whplimit, hp.max);
      if (hp.cur < whpcap) {
        if (hp.cur > whplimit) hp.cur = Math.max(prev, whplimit);
        if (hp.cur > hp.max) hp.max = hp.cur;
      } else if (hp.cur > hp.max) hp.cur = hp.max;
    }
    setWormRec(ctx, worm, { segs, wgrowtime });
  } else {
    // "The worm doesn't grow, so the last segment goes away."
    setWormRec(ctx, worm, { segs, wgrowtime });
    shrinkWorm(ctx, worm);
  }
}

/** The worm did not move: it shrinks and loses hit points. ref: src/worm.c worm_nomove() */
export function wormNomove(ctx: Ctx, worm: EntityId): void {
  shrinkWorm(ctx, worm);
  const hp = ent(ctx, worm)?.c.hp;
  if (hp && hp.cur > countWsegs(ctx.state, worm)) {
    hp.cur -= ctx.rng.d(2, 2); // mhpmax not changed
    if (hp.cur < 1) hp.cur = 1;
  }
}

/**
 * Would a move from (x1, y1) to (x2, y2) pass between two consecutive segments of the same worm?
 * Only diagonal moves can. ref: src/worm.c worm_cross()
 */
export function wormCross(
  ctx: Pick<Ctx, 'state'>,
  level: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): boolean {
  if (x1 === x2 || y1 === y2 || !anyWormTails(ctx.state)) return false;
  // "is the same monster at <x1,y2> and at <x2,y1>?"
  const worm = mAt(ctx.state, level, x1, y2);
  if (!worm || mAt(ctx.state, level, x2, y1)?.id !== worm.id) return false;
  const rec = wormRec(ctx.state, worm.id);
  if (!rec) return false;
  // C's list ends with the hidden segment under the head
  const at = [...rec.segs.map((s) => ent(ctx, s)?.c.pos), worm.c.pos];
  for (let i = 0; i + 1 < at.length; i++) {
    const cur = at[i];
    const nxt = at[i + 1];
    if (!cur || !nxt) continue;
    if (cur.x === x1 && cur.y === y2) return nxt.x === x2 && nxt.y === y1;
    if (cur.x === x2 && cur.y === y1) return nxt.x === x1 && nxt.y === y2;
  }
  return false;
}

/**
 * Takes the worm's tail off the map before the worm is put somewhere else, keeping the
 * segments (placeWormTailRandomly() lays them again). ref: src/worm.c remove_worm()
 */
export function removeWorm(ctx: Pick<Ctx, 'state'>, worm: EntityId): void {
  for (const s of wormRec(ctx.state, worm)?.segs ?? []) {
    const e = ent(ctx, s);
    if (e) delete e.c.pos;
  }
}

/**
 * The worm leaves its level: the tail is dropped and its length returned, so that it can grow
 * one again where it arrives (wormArrive()). ref: src/dog.c mon_leave() (num_segs, capped at
 * MAX_NUM_WORMS - 1), wormgone()
 */
export function wormLeave(ctx: Ctx, worm: EntityId): number {
  const rec = wormRec(ctx.state, worm);
  if (!rec) return 0;
  const n = Math.min(rec.segs.length, 31);
  wormgone(ctx, worm);
  return n;
}

/**
 * A long worm (not a baby) arriving on a level gets a worm number and its `nsegs` segments back,
 * laid behind it. ref: src/dog.c mon_arrive() (`initworm(mtmp, num_segs)`), then rloc_to()'s
 * place_worm_tail_randomly()
 */
export function wormArrive(ctx: Ctx, worm: EntityId, nsegs: number): void {
  const e = ent(ctx, worm);
  if (e?.def === LONG_WORM) giveWormTail(ctx, worm, nsegs);
}
setGiveWormTail(giveWormTail);
