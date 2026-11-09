// What fire, cold and lightning do to flesh and iron golems besides (or instead of) hurting them,
// for monsters and for a hero in a golem form.
// ref: src/mon.c golemeffects(); src/polyself.c ugolemeffects()
import { cellIndex, isVisible, type Ctx, type Entity } from '@nh/core';
import { monAdjustSpeed, mspeed } from './mstate';
import { monNam } from './perception';
import { heroFormId } from './upoly';

/** The elemental damage types golemeffects() looks at. */
export type GolemAd = 'fire' | 'cold' | 'elec';

const say = (ctx: Ctx, key: string, params?: Record<string, string>): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/**
 * A flesh golem is healed by lightning ((dam + 5) / 6) and slowed by fire and cold; an iron golem
 * is slowed by lightning and healed by fire (the full damage). "The flesh golem seems healthier."
 * when its square is seen. ref: src/mon.c golemeffects(), healmon(mon, heal, 0)
 */
export function golemeffects(ctx: Ctx, mon: Entity, damtype: GolemAd, dam: number): void {
  let heal = 0;
  let slow = false;
  if (mon.def === 'nh:flesh_golem') {
    if (damtype === 'elec') heal = Math.trunc((dam + 5) / 6);
    else slow = true;
  } else if (mon.def === 'nh:iron_golem') {
    if (damtype === 'elec') slow = true;
    else if (damtype === 'fire') heal = dam;
  } else return;
  if (slow && mspeed(ctx, mon.id) !== 'slow') monAdjustSpeed(ctx, mon, -1);
  const hp = mon.c.hp;
  if (heal && hp) {
    // healmon(): the maximum rises with the hit points (no overheal)
    const old = hp.cur;
    hp.cur += heal;
    if (hp.cur > hp.max) hp.max = hp.cur;
    const p = mon.c.pos;
    const level = p ? ctx.state.levels[p.level] : undefined;
    if (
      hp.cur > old &&
      p &&
      level &&
      p.level === ctx.state.currentLevel &&
      isVisible(ctx.state, cellIndex(level, p.x, p.y))
    )
      say(ctx, 'golem.seems_healthier', { mon: monNam(ctx, mon) });
  }
}

/**
 * The hero as a flesh golem is healed by lightning, as an iron golem by fire ("Strangely, you
 * feel better than before."); no slowing (her speed has no monster-style slow).
 * ref: src/polyself.c ugolemeffects() (no exercise())
 */
export function ugolemeffects(ctx: Ctx, damtype: string, dam: number): void {
  const form = heroFormId(ctx.state);
  if (form !== 'nh:flesh_golem' && form !== 'nh:iron_golem') return;
  let heal = 0;
  if (damtype === 'elec' && form === 'nh:flesh_golem') heal = Math.trunc((dam + 5) / 6);
  else if (damtype === 'fire' && form === 'nh:iron_golem') heal = dam;
  const mh = ctx.state.entities[String(ctx.state.playerId)]?.c.hp;
  if (heal && mh && mh.cur < mh.max) {
    mh.cur = Math.min(mh.cur + heal, mh.max);
    say(ctx, 'golem.feel_better');
  }
}
