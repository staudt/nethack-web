// Levitation: floating up and down, and what a floating hero cannot reach.
// ref: src/trap.c float_up(), float_down(), src/engrave.c can_reach_floor(),
// src/fountain.c floating_above(), src/trap.c reset_utrap(); src/do_wear.c Ring_on(),
// Ring_off_or_gone() (RIN_LEVITATION)
//
// The only source is a worn ring of levitation (no potion, spell, boots or artifact, so no
// Lev_at_will and no timeout), and the hero never flies, rides, swims or is engulfed. A bear trap
// holds her to the floor (BLevitation): `levitating()` (trapstate.ts) is C's `Levitation`.
// Not ported: the air and water levels, pools, lava and sinks (dosinkfall()), the ball and
// chain, hurtling and the steed (DEVIATIONS.md "Levitation").
//
// Module graph: float_down() ends in dotrap(), but trap.ts sits above this module (its rust trap
// reaches jewelry.ts, which calls floatDown(), through erode.ts), so trap.ts hands its trigger in
// at registration (`setFloatDownTrap`).
import { engulferOf } from './engulfstate';
import {
  getLevel,
  getPlayer,
  inventoryOf,
  trapAt,
  type Ctx,
  type Entity,
  type EntityId,
  type ModApi,
  type Msg,
  type Trap,
} from '@nh/core';
import { ustuck, setUstuck } from './hackmove';
import { losehp } from './hp';
import { encumberMsg, lookHere } from './itemactions';
import { monNam } from './perception';
import { P, hasProp } from './props';
import { isSokoban } from './sokoban';
import { surfaceKey } from './terrain';
import { levitating, setUtrap, utrap } from './trapstate';

export { levitating };

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const hero = (ctx: Pick<Ctx, 'state'>): Entity => getPlayer(ctx.state);

/** float_down()'s trap at her feet: trap.ts's dotrap() with float_down()'s exceptions. */
let floatDownTrap: ((ctx: Ctx, trap: Trap) => void) | null = null;

/** Set by trap.ts's registerTraps() (see the header). */
export function setFloatDownTrap(fn: (ctx: Ctx, trap: Trap) => void): void {
  floatDownTrap = fn;
}

/**
 * Whether the hero can reach the floor: not while swallowed or floating. ref: src/engrave.c
 * can_reach_floor() (no hugging stickers, steeds, hiders or polymorph; the seen-pit edge is not
 * ported)
 */
export const canReachFloor = (ctx: Pick<Ctx, 'state'>): boolean =>
  engulferOf(ctx.state) === null && !levitating(ctx);

/**
 * Whether another source than `ring` gives levitation: Ring_on()'s `oldprop` (a second ring of
 * levitation) and HLevitation (nothing sets it yet).
 */
export function otherLevitation(ctx: Pick<Ctx, 'state' | 'defs'>, ring: Entity): boolean {
  const h = hero(ctx);
  const p = h.c.props?.[P.LEVITATION];
  if (p && (p.intrinsic || p.timeout > 0)) return true;
  return inventoryOf(ctx.state, h.id).some((o) => {
    const eq = o.c.item?.equipped;
    return (
      o.id !== ring.id && !!eq && eq !== 'weapon' && ctx.defs.object(o.def).prop === P.LEVITATION
    );
  });
}

/**
 * "You are floating high above the {what}." ref: src/fountain.c floating_above() (nothing holds
 * her in the floor: TT_INFLOOR and TT_LAVA do not exist)
 */
export function floatingAbove(ctx: Ctx, what: string): void {
  say(ctx, 'lev.floating_above', { what });
}

/**
 * The hero starts to float: out of a pit, or held by a bear trap's jaws (which block the
 * levitation until she is free), else "You start to float in the air!". Levitation gives the
 * maximum carrying capacity. ref: src/trap.c float_up()
 */
export function floatUp(ctx: Ctx): void {
  const u = utrap(ctx);
  if (u) {
    if (u.type === 'pit') {
      setUtrap(ctx, 0, 'pit'); // reset_utrap(FALSE)
      say(ctx, 'lev.float_out_of_pit');
      // fill_pit(): a boulder never rests on a pit (flooreffects() fills it)
    } else {
      say(ctx, 'lev.float_up_leg_stuck');
    }
  } else if (hasProp(hero(ctx), P.HALLUC)) {
    say(ctx, 'lev.up_up_away');
  } else {
    say(ctx, 'lev.start_to_float');
  }
  encumberMsg(ctx);
}

/**
 * The hero stops floating (the ring is off): unless something still holds her up she comes down
 * (a sticky monster lets go; in Sokoban the air currents knock her over), the trap here goes off
 * unless she is already in it (a hole or trap door only where there is a level below), then she
 * sees what is on the floor. False when she was not floating after all.
 * ref: src/trap.c float_down(0, 0)
 */
export function floatDown(ctx: Ctx): boolean {
  if (levitating(ctx)) return false; // maybe another ring
  const h = hero(ctx);
  const held = utrap(ctx);
  if (held && held.type !== 'pit') {
    // BLevitation from being stuck in the floor: she never left it
    say(ctx, 'lev.no_longer_trying');
    encumberMsg(ctx);
    return false;
  }
  ctx.interrupt(); // nomul(0)
  const stuck: EntityId | null = ustuck(ctx);
  if (stuck !== null) {
    const m = ctx.state.entities[String(stuck)];
    if (m) say(ctx, 'lev.startled', { mon: monNam(ctx, m) });
    setUstuck(ctx, null);
  }
  const p = h.c.pos;
  if (!p) return true;
  const level = getLevel(ctx.state, p.level);
  const trap = trapAt(level, p.x, p.y);
  if (isSokoban(level) && trap) {
    // the additional force of the air currents knocks her off her feet (no selftouch())
    say(ctx, hasProp(h, P.HALLUC) ? 'lev.crashed' : 'lev.fall_over');
    losehp(ctx, ctx.rng.rnd(2), '@killer.lev.dangerous_winds');
  } else if (hasProp(h, P.HALLUC)) {
    say(ctx, 'lev.hit_ground');
  } else {
    say(ctx, 'lev.float_gently', { surface: surfaceKey(ctx, level, p.x, p.y) });
  }
  encumberMsg(ctx);
  if (ctx.state.gameOver) return true;
  const levelId = p.level;
  if (trap && floatDownTrap) floatDownTrap(ctx, trap);
  // falling through a trap door does its own pickup(1)
  if (!ctx.state.gameOver && hero(ctx).c.pos?.level === levelId) lookHere(ctx);
  return true;
}

/**
 * reset_utrap(TRUE) after `wasLevitating` was taken: she is free of a bear trap, so a ring of
 * levitation lifts her now. ref: src/trap.c reset_utrap()
 */
export function resumeLevitation(ctx: Ctx, wasLevitating: boolean): void {
  if (!wasLevitating && levitating(ctx)) floatUp(ctx);
}

/** The "Lev" status condition. ref: src/botl.c BL_MASK_LEV */
export function registerLevitation(api: ModApi): void {
  api.defineStatus({
    id: 'nh:levitation',
    field: 'lev',
    value: (state) => (levitating({ state }) ? 1 : null),
  });
}
