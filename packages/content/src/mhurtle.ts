// A monster thrown back by a blow: the spell of knock's push. ref: src/dothrow.c mhurtle(),
// mhurtle_step(); src/mondata.c m_is_steadfast()
//
// Not ported: hurtling through regions or into water walls, the steed, a cockatrice touched
// on the way (minstapetrify()), grid bugs' diagonal rule (no grid bugs).
import { cellRules, getLevel, getPlayer, trapAt, type Ctx, type Entity, type Msg } from '@nh/core';
import { boulderCells } from './boulder';
import { monsterIdAt } from './combat';
import { isFlyer, msize } from './mondata';
import { minvent } from './mongear';
import { setMStunned } from './mstate';
import { wakeup } from './peaceful';
import { canSpotMon, monNam, someMonNam } from './perception';
import { mintrap } from './trap';
import { isMtrapped } from './trapstate';
import { ustuck } from './hackmove';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/** ref: include/monflag.h MZ_HUGE */
const MZ_HUGE = 4;

/**
 * The monster stands fast against a push: on the ground (no flyer or floater) and carrying a
 * loadstone (no Giantslayer). ref: src/mondata.c m_is_steadfast()
 */
export function mIsSteadfast(ctx: Ctx, mon: Entity): boolean {
  const def = ctx.defs.monster(mon.def);
  // is_floater(): the eyes and lights
  if (isFlyer(def) || def.glyph.ch === 'e' || def.glyph.ch === 'y') return false;
  return minvent(ctx, mon.id).some((o) => o.def === 'nh:loadstone');
}

/**
 * The monster is pushed `range` squares along (dx, dy) (signs only): it is woken, loses its
 * move and is stunned; a huge one, the one holding her or a trapped one "doesn't budge!". It
 * stops before a wall, boulder, closed door or another creature ("The jackal bumps into the
 * newt.", "... bumps into you."), and a trap where it stops is sprung.
 */
export function mhurtle(ctx: Ctx, mon: Entity, dx: number, dy: number, range: number): void {
  wakeup(ctx, mon.id);
  // at the very least, debilitate the monster
  if (mon.c.actor) mon.c.actor.energy = 0; // mon->movement = 0
  setMStunned(ctx, mon.id, true);
  const seen = canSpotMon(ctx, mon);
  // is the monster stuck or too heavy to push?
  if (
    msize(ctx.defs.monster(mon.def)) >= MZ_HUGE ||
    ustuck(ctx) === mon.id ||
    isMtrapped(ctx, mon.id)
  ) {
    if (seen) say(ctx, 'zap.doesnt_budge_hard', { mon: monNam(ctx, mon) });
    return;
  }
  dx = Math.sign(dx);
  dy = Math.sign(dy);
  if (!range || (!dx && !dy)) return;
  const level = getLevel(ctx.state);
  const rules = cellRules(level, ctx.defs);
  const boulders = boulderCells(ctx, level);
  const hp = getPlayer(ctx.state).c.pos;
  for (let n = 0; n < range; n++) {
    const p = mon.c.pos;
    if (!p) return;
    const x = p.x + dx;
    const y = p.y + dy;
    if (x < 0 || y < 0 || x >= level.width || y >= level.height) return;
    const i = y * level.width + x;
    const t = level.cells[i] ?? 0;
    const other = monsterIdAt(ctx, { x, y }, level.id);
    const heroThere = hp?.x === x && hp.y === y;
    // will_hurtle(): goodpos() for the monster
    if (
      other === null &&
      !heroThere &&
      rules.passable[t] === true &&
      !rules.closedDoor[t] &&
      !boulders.has(i)
    ) {
      mon.c.pos = { ...p, x, y };
      if (trapAt(level, x, y)) {
        const res = mintrap(ctx, mon.id);
        if (res === 'killed' || res === 'caught' || res === 'moved') return;
      }
      continue;
    }
    if (other !== null && other !== ctx.state.playerId) {
      const mtmp = ctx.state.entities[String(other)];
      if (mtmp) {
        if (canSpotMon(ctx, mon) || canSpotMon(ctx, mtmp))
          say(ctx, 'zap.bumps_into', { mon: monNam(ctx, mon), other: someMonNam(ctx, mtmp) });
        wakeup(ctx, mtmp.id);
      }
    } else if (heroThere) {
      say(ctx, 'zap.bumps_into_you', { mon: monNam(ctx, mon) });
      ctx.interrupt();
    }
    return;
  }
}
