// Where a monster thinks the hero is, and whether it can see her: an invisible hero is a guess.
// ref: src/monmove.c set_apparxy(); include/vision.h m_canseeu(); src/vision.c couldsee();
// src/monmove.c accessible()
//
// The guess (C's mtmp->mux/muy): dochug() makes it once per move and hands it to m_move(),
// mattacku() and the ranged attacks. It is kept between moves (mstate.ts `mux`) only while the
// monster cannot see her (she is invisible to it, or it is blind), the only case that reads it:
// a monster that found her keeps knowing where she is while she stays put. Not ported: displacement,
// Underwater, the xorn smelling gold, can_ooze()/can_fog() through closed doors (none of them
// exists).
import {
  cellIndex,
  cellRules,
  getPlayer,
  inBounds,
  type Ctx,
  type Entity,
  type Pos,
} from '@nh/core';
import { blockersOf } from './boulder';
import { clearPath } from './clearpath';
import { ustuck } from './hackmove';
import { heroInvisible, perceives } from './invis';
import { mcansee, setStoredMux, storedMux } from './mstate';

/** `Invis && !perceives(mon->data)`: the hero is invisible to this monster. */
export const invisTo = (ctx: Pick<Ctx, 'state' | 'defs'>, mon: Entity): boolean =>
  heroInvisible(ctx.state) && !perceives(ctx.defs.monster(mon.def));

/** couldsee(x, y): a clear line from the hero to the square of her level, lit or not. */
export function couldseeAt(ctx: Pick<Ctx, 'state' | 'defs'>, x: number, y: number): boolean {
  const hp = getPlayer(ctx.state).c.pos;
  const level = hp ? ctx.state.levels[hp.level] : undefined;
  if (!hp || !level || !inBounds(level, x, y)) return false;
  if (hp.x === x && hp.y === y) return true;
  const opaque = cellRules(level, ctx.defs).opaque;
  return clearPath(level, opaque, hp.x, hp.y, x, y, blockersOf(ctx, level.id));
}

/** couldsee(mon->mx, mon->my) for a monster on her level. */
export function couldseeMon(ctx: Pick<Ctx, 'state' | 'defs'>, mon: Entity): boolean {
  const p = mon.c.pos;
  const hp = getPlayer(ctx.state).c.pos;
  return !!p && !!hp && p.level === hp.level && couldseeAt(ctx, p.x, p.y);
}

/**
 * The monster could see the hero: she is not invisible to it and it stands in her line of sight
 * (its own blindness is the callers' `mcansee` test). ref: include/vision.h m_canseeu() (no
 * Underwater, burying)
 */
export const mCanSeeU = (ctx: Pick<Ctx, 'state' | 'defs'>, mon: Entity): boolean =>
  !invisTo(ctx, mon) && couldseeMon(ctx, mon);

/**
 * Where the monster thinks the hero is. A pet, the monster holding her, or one whose guess
 * `prev` (from earlier this move, else the one kept from its last move) is right knows; one that can see her knows; a blind one, or
 * one she is invisible to, finds her one time in three, else guesses a square next to her (or
 * hers) that it could stand on and she could see, not its own (200 tries, then hers).
 * ref: src/monmove.c set_apparxy() (only the `notseen` case: no displacement or Underwater)
 */
export function setApparxy(
  ctx: Pick<Ctx, 'state' | 'defs' | 'rng'>,
  mon: Entity,
  prev: Pos | null = null,
): Pos {
  const r = apparxy(ctx, mon, prev ?? storedMux(ctx, mon.id));
  // keep the guess while the monster cannot see her (mtmp->mux/muy outlive the move)
  const keep = !mcansee(ctx, mon.id) || invisTo(ctx, mon);
  setStoredMux(ctx, mon.id, keep ? r : null);
  return r;
}

function apparxy(ctx: Pick<Ctx, 'state' | 'defs' | 'rng'>, mon: Entity, prev: Pos | null): Pos {
  const hp = getPlayer(ctx.state).c.pos;
  const mp = mon.c.pos;
  if (!hp || !mp) return { x: mp?.x ?? 0, y: mp?.y ?? 0 };
  const u = { x: hp.x, y: hp.y };
  // pet knows your smell; grabber still has hold of you; monsters which know where you are
  // don't suddenly forget, if you haven't moved away
  if (
    (mon.c.monster?.tame ?? 0) > 0 ||
    ustuck(ctx) === mon.id ||
    (prev !== null && prev.x === u.x && prev.y === u.y)
  )
    return u;
  const notseen = !mcansee(ctx, mon.id) || invisTo(ctx, mon);
  if (!notseen) return u;
  const displ = 1;
  // without something like the following, invisibility and displacement are too powerful
  const gotu = !ctx.rng.rn2(3);
  if (gotu) return u;
  const level = ctx.state.levels[hp.level];
  if (!level) return u;
  const rules = cellRules(level, ctx.defs);
  const wallwalk = ctx.defs.monster(mon.def).flags.includes('wallwalk'); // passes_walls()
  // accessible(): ACCESSIBLE(typ) && !closed_door()
  const accessible = (x: number, y: number): boolean => {
    const t = level.cells[cellIndex(level, x, y)] ?? 0;
    return rules.passable[t] === true && rules.closedDoor[t] !== true;
  };
  let tryCnt = 0;
  for (;;) {
    if (++tryCnt > 200) return u; // punt
    const mx = u.x - displ + ctx.rng.rn2(2 * displ + 1);
    const my = u.y - displ + ctx.rng.rn2(2 * displ + 1);
    if (!inBounds(level, mx, my)) continue;
    if (mx === mp.x && my === mp.y) continue; // displ != 2
    const atU = mx === u.x && my === u.y;
    if (!atU && !wallwalk && !accessible(mx, my)) continue;
    if (!couldseeAt(ctx, mx, my)) continue;
    return { x: mx, y: my };
  }
}
