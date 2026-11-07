// Land mines: the hero or a monster sets one off, a pushed boulder sets one off; the blast
// scatters the objects there and leaves a pit. ref: src/trap.c trapeffect_landmine(),
// blow_up_landmine(), fill_pit(); src/hack.c moverock() LANDMINE
//
// Module graph: the blast needs scatter.ts (mthrowu, flooreffects), so this module sits above
// trap.ts and hands its effects in at registration (`setTrapEffect`), as magictrap.ts does;
// moverock.ts gets the pushed-boulder case the same way (`setLandminePush`).
//
// Not ported: setting land mines (`use_trap()`) so none is ever the hero's (madeby_u), the
// levitating or flying hero's "There is a trigger in a pile of soil below you." (dotrap() never
// reaches it here: a floating hero passes over, and no forced trap reaches a floating hero),
// steeds, engravings (del_engr_at()), doors and drawbridges under the mine (traps lie only on
// plain floor), the water and air levels, pools filling the pit (fillholetyp()), the sleeping
// hero's "The explosion awakens you!", Dex exercise, deafness, digging down on a land mine.
import { getPlayer, trapAt, type Ctx, type Entity, type Msg, type Trap } from '@nh/core';
import { fillPit } from './flooreffects';
import { losehp } from './hp';
import { setWoundedLegs } from './legs';
import { setLandminePush } from './moverock';
import { wakeNearto } from './noise';
import { monNam } from './perception';
import { scatter } from './scatter';
import {
  TRAP,
  caughtOr,
  canseemon,
  dataOf,
  dotrap,
  ironShoes,
  mintrap,
  seetrap,
  setTrapEffect,
  thitm,
  type TrapResult,
} from './trap';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/** ref: include/weight.h WT_ELF / 2: a monster lighter than this never sets one off */
const MINE_TRIGGER_WT = 800 / 2;

/** The trap becomes an ordinary, unconcealed pit that is not the hero's. */
function toPit(t: Trap): void {
  const rest = dataOf(t);
  delete rest.madeby_u;
  t.def = TRAP.pit;
  t.data = { ...rest };
  seetrap(t);
}

/**
 * The blast of a land mine at the trap's square of the hero's level: the objects there scatter
 * (`scatter(x, y, 4, MAY_DESTROY | MAY_HIT | MAY_FRACTURE | VIS_EFFECTS)`), monsters within 20
 * squares wake, the mine becomes a pit and a boulder lying there fills it.
 * ref: src/trap.c blow_up_landmine()
 */
export function blowUpLandmine(ctx: Ctx, trap: Trap, monMoving = false): void {
  const { x, y } = trap;
  scatter(ctx, x, y, 4, {
    mayDestroy: true,
    mayHit: true,
    mayFracture: true,
    visEffects: true,
    monMoving,
  });
  wakeNearto(ctx, x, y, 400);
  const level = ctx.state.levels[ctx.state.currentLevel];
  const t = level ? trapAt(level, x, y) : undefined;
  if (t) toPit(t); // the explosion creates a pit (fillholetyp() is ROOM: no pools)
  fillPit(ctx, x, y, monMoving);
}

/**
 * The hero sets one off: "KAABLAMM!!!  You triggered a land mine!", both legs wounded for
 * `rn1(35, 41)` turns, `rnd(16)` damage (a quarter, rounded up, in iron shoes), the blast, and
 * she falls into the new pit (dotrap() again: a seen pit, so she may escape it 1 time in 5).
 * ref: src/trap.c trapeffect_landmine()
 */
function landmineYou(ctx: Ctx, trap: Trap): void {
  let damage = ctx.rng.rnd(16);
  if (ironShoes(ctx, ctx.state.playerId)) damage = Math.trunc((damage + 3) / 4);
  seetrap(trap); // feeltrap()
  say(ctx, 'trap.landmine.you');
  // set_wounded_legs(LEFT_SIDE, ...), set_wounded_legs(RIGHT_SIDE, ...): one leg is tracked
  setWoundedLegs(ctx, ctx.rng.rn2(35) + 41);
  setWoundedLegs(ctx, ctx.rng.rn2(35) + 41);
  toPit(trap); // before losehp(), so bones would not keep the land mine
  losehp(ctx, damage, '@killer.trap.landmine');
  blowUpLandmine(ctx, trap);
  if (ctx.state.gameOver) return;
  // fall recursively into the pit...
  const p = getPlayer(ctx.state).c.pos;
  const level = p ? ctx.state.levels[p.level] : undefined;
  const t = p && level ? trapAt(level, p.x, p.y) : undefined;
  if (t) dotrap(ctx, t);
  if (p) fillPit(ctx, p.x, p.y);
}

const inAir = (ctx: Ctx, mon: Entity): boolean => {
  const f = ctx.defs.monster(mon.def).flags;
  return f.includes('fly') || f.includes('float');
};

/**
 * A monster sets one off, more likely the heavier it is (`rn2(cwt + 1) < WT_ELF / 2` does not):
 * "KAABLAMM!!!  The jackal triggers a land mine!" in sight, "Kaablamm!  You hear an explosion in
 * the distance!" out of it; a flyer forced onto it sets it off 1 time in 3 ("The air currents set
 * it off!"). It takes `rnd(16)` (a quarter in iron shoes; no one's kill) and falls into the new
 * pit. ref: src/trap.c trapeffect_landmine()
 */
function landmineMon(ctx: Ctx, mon: Entity, trap: Trap): TrapResult {
  let damage = ctx.rng.rnd(16);
  if (ironShoes(ctx, mon.id)) damage = Math.trunc((damage + 3) / 4);
  const inSight = canseemon(ctx, mon);
  const { x: tx, y: ty } = trap;
  if (ctx.rng.rn2(ctx.defs.monster(mon.def).weight + 1) < MINE_TRIGGER_WT) return 'finished';
  if (inAir(ctx, mon)) {
    const alreadySeen = trap.seen;
    if (inSight && !alreadySeen) {
      say(ctx, 'trap.landmine.mon_trigger_appears', { mon: monNam(ctx, mon) });
      seetrap(trap);
    }
    if (ctx.rng.rn2(3)) return 'finished';
    if (inSight)
      say(ctx, alreadySeen ? 'trap.landmine.air_currents_mine' : 'trap.landmine.air_currents');
  } else if (inSight) say(ctx, 'trap.landmine.mon_triggers', { mon: monNam(ctx, mon) });
  if (!inSight) say(ctx, 'trap.landmine.hear');
  blowUpLandmine(ctx, trap, true);
  const alive = (): boolean => !!ctx.state.entities[String(mon.id)]?.c.monster;
  let killed = !alive() || thitm(ctx, 0, mon, null, damage);
  // monsters recursively fall into new pit
  if (!killed && mintrap(ctx, mon.id, { force: true }) === 'killed') killed = true;
  // a boulder may fill the new pit, crushing monster
  fillPit(ctx, tx, ty, true);
  if (!alive()) killed = true;
  return caughtOr(ctx, mon, killed);
}

/**
 * The hero pushes a boulder onto a land mine and it goes off 9 times in 10: "KAABLAMM!!!  The
 * boulder triggers a land mine.", the boulder first moved onto it (it usually breaks apart in the
 * blast; if not, it fills the new pit). False when it did not go off (the push goes on as usual).
 * ref: src/hack.c moverock() LANDMINE
 */
function landminePush(ctx: Ctx, trap: Trap, boulder: Entity, what: Msg): boolean {
  if (!ctx.rng.rn2(10)) return false;
  boulder.c.pos = { level: ctx.state.currentLevel, x: trap.x, y: trap.y }; // place_object()
  if (boulder.c.item) boulder.c.item.placed = ctx.state.seq++;
  say(ctx, 'trap.landmine.boulder', { what });
  blowUpLandmine(ctx, trap); // ... and fill_pit() there
  return true;
}

export function registerLandmines(): void {
  setTrapEffect(TRAP.landmine, { you: landmineYou, mon: landmineMon });
  setLandminePush(landminePush);
}
