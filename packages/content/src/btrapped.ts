// Door booby traps going off: the hero opening, unlocking, kicking or digging a trapped door
// (b_trapped()), a monster opening one or being at a door struck by a wand (mb_trapped()).
// ref: src/trap.c b_trapped(); src/monmove.c mb_trapped()
import { getPlayer, type Ctx, type Entity, type Level, type Msg } from '@nh/core';
import { setDoorTrapped } from './btrapstate';
import { losehp } from './hp';
import { heroSees } from './mongear';
import { mondied } from './mondeath';
import { setMStunned } from './mstate';
import { wakeNearto } from './noise';
import { P, makeStunned, timeoutLeft } from './props';
import { T, setTerrain } from './terrain';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/** Asleep, fainted or knocked out. ref: src/hack.c unconscious() (Unaware) */
export function unaware(ctx: Pick<Ctx, 'state'>): boolean {
  const r = getPlayer(ctx.state).c.helpless?.reasonKey;
  return r === 'helpless.asleep' || r === 'helpless.fainted' || r === 'helpless.rotten_food';
}

/** wake_nearby(FALSE): monsters within u.ulevel * 20 of the hero. ref: src/mon.c wake_nearby() */
export function wakeNearby(ctx: Ctx): void {
  const h = getPlayer(ctx.state);
  const p = h.c.pos;
  if (p) wakeNearto(ctx, p.x, p.y, (h.c.experience?.level ?? 1) * 20);
}

/** The trapped door at x,y is blown away: an empty doorway (D_NODOOR), no trap any more. */
export function blowDoor(ctx: Ctx, level: Level, x: number, y: number): void {
  setDoorTrapped(ctx, level.id, x, y, false);
  setTerrain(level, x, y, T.doorway);
  ctx.emit({ type: 'doorOpened', pos: { x, y } });
}

/**
 * "KABOOM!!  The door was booby-trapped!": `rnd(5 + (lvl < 5 ? lvl : 2 + lvl / 2))` damage
 * ("killed by an explosion") and as many more turns of stun. The caller has already made the door
 * a doorway (D_NODOOR) and forgotten its trap. No exercise. ref: src/trap.c b_trapped()
 */
export function bTrapped(ctx: Ctx, item: 'door' | 'secret_door'): void {
  const level = ctx.state.levels[ctx.state.currentLevel];
  const lvl = level?.depth ?? 1; // level_difficulty()
  const dmg = ctx.rng.rnd(5 + (lvl < 5 ? lvl : 2 + Math.trunc(lvl / 2)));
  say(ctx, 'btrap.kaboom', { item: { key: `btrap.item.${item}` } });
  wakeNearby(ctx);
  losehp(ctx, dmg, '@killer.explosion');
  if (ctx.state.gameOver) return;
  const hero = getPlayer(ctx.state);
  makeStunned(ctx, timeoutLeft(ctx.state, hero, P.STUNNED) + dmg, true);
}

/**
 * A monster set off a trapped door (opening it, or it stood in a door struck by a wand):
 * "KABOOM!!  You see a door explode." or "You hear a distant (nearby) explosion.", it is stunned
 * and loses rnd(15) hit points. Returns true if it died. mon_learns_traps() is not modelled.
 * ref: src/monmove.c mb_trapped()
 */
export function mbTrapped(ctx: Ctx, mon: Entity, canseeit: boolean): boolean {
  const p = mon.c.pos;
  if (!p) return false;
  const hp0 = getPlayer(ctx.state).c.pos;
  if (canseeit && !unaware(ctx)) say(ctx, 'btrap.see_door_explode');
  else {
    const d2 = hp0 && hp0.level === p.level ? (hp0.x - p.x) ** 2 + (hp0.y - p.y) ** 2 : Infinity;
    say(ctx, d2 > 7 * 7 ? 'btrap.hear_distant' : 'btrap.hear_nearby');
  }
  if (p.level === ctx.state.currentLevel) wakeNearto(ctx, p.x, p.y, 7 * 7);
  setMStunned(ctx, mon.id, true);
  const hp = mon.c.hp;
  if (hp) {
    hp.cur -= ctx.rng.rnd(15);
    if (hp.cur <= 0) {
      mondied(ctx, mon.id);
      return true;
    }
  }
  return false;
}

/** Whether the hero sees the cell (cansee()). */
export const seesCell = (ctx: Pick<Ctx, 'state'>, level: string, x: number, y: number): boolean =>
  heroSees(ctx, { level, x, y });
