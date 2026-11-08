// Engulfing: who may swallow whom, letting the hero go and being expelled. gulpmu() is in
// mhitu.ts and gulpmm() in mhitm.ts (as in C); this module sits below both so that monflee,
// end, zap and dig can expel her.
// ref: src/mhitu.c expels(); src/mhitm.c engulf_target(); src/mon.c unstuck();
// src/monmove.c release_hero()
import {
  cellIndex,
  getLevel,
  getPlayer,
  type Ctx,
  type Entity,
  type EntityId,
  type Msg,
} from '@nh/core';
import { digests, enfolds, isWhirly, uswallow } from './engulfstate';
import { setSavelifeExpels } from './end';
import { setUstuck, ustuck } from './hackmove';
import { mnextoPos } from './generation';
import { mspecUsed, setMspecUsed } from './mstate';
import { monNam } from './perception';
import { T } from './terrain';
import { isMtrapped } from './trapstate';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const SIZES = ['tiny', 'small', 'medium', 'large', 'huge', 'gigantic'] as const;
const msize = (s: string): number => SIZES.indexOf(s as (typeof SIZES)[number]);
/** ref: include/monflag.h MZ_HUGE */
const MZ_HUGE = 4;
/** The hero's size: always human-sized (no polymorph). */
const HERO_SIZE = 2;

/**
 * Whether `magr` may swallow `mdef` (`'hero'` for her): not something too big, not while either
 * is trapped, and not into or out of solid rock, a closed door, a tree or (unless whirly) iron
 * bars. ref: src/mhitm.c engulf_target() (no one passes walls here; the hero is never trapped
 * in the monster sense: C reads youmonst.mtrapped, never set)
 */
export function engulfTarget(ctx: Ctx, magr: Entity, mdef: Entity | 'hero'): boolean {
  const pa = ctx.defs.monster(magr.def);
  const dsize = mdef === 'hero' ? HERO_SIZE : msize(ctx.defs.monster(mdef.def).size);
  if (dsize >= MZ_HUGE || (msize(pa.size) < dsize && !isWhirly(pa))) return false;
  if (isMtrapped(ctx, magr.id) || (mdef !== 'hero' && isMtrapped(ctx, mdef.id))) return false;
  const dp = mdef === 'hero' ? getPlayer(ctx.state).c.pos : mdef.c.pos;
  const ap = magr.c.pos;
  if (!dp || !ap) return false;
  const blocked = (x: number, y: number, otherWhirly: boolean): boolean => {
    const level = getLevel(ctx.state, ap.level);
    const id = level.palette[level.cells[cellIndex(level, x, y)] ?? 0];
    if (id === undefined) return true;
    const t = ctx.defs.terrain(id);
    if (!t.passable && t.door === undefined && id !== T.iron_bars) return true; // IS_OBSTRUCTED
    if (t.door === 'closed' || t.door === 'locked') return true;
    if (id === T.tree) return true;
    return id === T.iron_bars && !otherWhirly;
  };
  if (blocked(dp.x, dp.y, isWhirly(pa))) return false;
  const dWhirly = mdef !== 'hero' && isWhirly(ctx.defs.monster(mdef.def));
  return !blocked(ap.x, ap.y, dWhirly);
}

/**
 * Lets go of the hero: no longer stuck to or inside `mon`, and a holder or engulfer waits a turn
 * or two before grabbing again. ref: src/mon.c unstuck() (she already stands on its square)
 */
export function unstuck(ctx: Ctx, mon: Entity): void {
  if (ustuck(ctx) !== mon.id) return;
  setUstuck(ctx, null);
  const pa = ctx.defs.monster(mon.def);
  if (
    !mspecUsed(ctx, mon.id) &&
    pa.attacks.some((a) => a.ad === 'stck' || a.at === 'engulf' || a.at === 'hug')
  )
    setMspecUsed(ctx, mon.id, ctx.rng.rnd(2));
}

/**
 * The engulfer lets the hero out: "You get regurgitated!" (a digester), "The trapper unfolds and
 * you are released!" (an enfolder), else "You get expelled from the fog cloud!" (with " in a
 * shower of sparks" / " in a blast of frost" for an electric or freezing vortex, " with a
 * squelch" for the rest), then it moves to a square next to her.
 * ref: src/mhitu.c expels() (no ball and chain)
 */
export function expels(ctx: Ctx, mon: Entity, message: boolean): void {
  const pa = ctx.defs.monster(mon.def);
  if (message) {
    if (digests(pa)) say(ctx, 'engulf.regurgitated');
    else if (enfolds(pa)) say(ctx, 'engulf.unfolds', { mon: monNam(ctx, mon) });
    else {
      const attk = pa.attacks.find((a) => a.at === 'engulf');
      let blast = 'engulf.blast.none';
      if (isWhirly(pa)) {
        if (attk?.ad === 'elec') blast = 'engulf.blast.sparks';
        else if (attk?.ad === 'cold') blast = 'engulf.blast.frost';
      } else blast = 'engulf.blast.squelch';
      say(ctx, 'engulf.expelled_from', { mon: monNam(ctx, mon), blast: { key: blast } });
    }
  }
  unstuck(ctx, mon);
  // mnexto(mtmp, RLOC_NOMSG)
  const p = mon.c.pos;
  if (!p) return;
  const spot = mnextoPos(ctx, getLevel(ctx.state, p.level), mon.id, p);
  if (spot) {
    const from = { x: p.x, y: p.y };
    mon.c.pos = { level: p.level, x: spot.x, y: spot.y };
    ctx.emit({ type: 'moved', id: mon.id, from, to: spot });
  }
}

/**
 * A holder or engulfer lets the hero go when it flees: expelled ("You get expelled ..."), or just
 * released. ref: src/monmove.c release_hero() (the plain hold keeps this port's silent release)
 */
export function releaseHero(ctx: Ctx, id: EntityId): void {
  if (ustuck(ctx) !== id) return;
  const mon = ctx.state.entities[String(id)];
  if (mon && uswallow(ctx)?.mon === id) expels(ctx, mon, true);
  else setUstuck(ctx, null);
}

// ref: src/end.c savelife(): `if (u.uswallow) expels(u.ustuck, u.ustuck->data, TRUE)`
setSavelifeExpels((ctx, mon) => expels(ctx, mon, true));
