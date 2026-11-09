// Monster cloning: a brown pudding hit with iron divides, a gremlin in water multiplies.
// ref: src/makemon.c clone_mon(); src/potion.c split_mon()
import { getLevel, getPlayer, type Ctx, type EntityId, type Pos } from '@nh/core';
import { mAt } from './wormstate';
import { mnextoPos } from './generation';
import { edogOf, tamedog } from './dog';
import { fleeTime, isFleeing, monflee } from './monflee';
import { copyMState } from './mstate';
import { luckOf } from './luck';
import { canSpotMon, monNam } from './perception';
import { setSplitMon } from './trap';

const heroAt = (ctx: Ctx, level: string, p: Pos): boolean => {
  const hp = getPlayer(ctx.state).c.pos;
  return hp?.level === level && hp.x === p.x && hp.y === p.y;
};

/**
 * A copy of the monster next to it (or on `where`, when that is free) ("copy condition of old monster"): same type, level, maximum
 * HP and conditions, current HP halved (the original keeps the odd point), no inventory, not
 * trapped. A clone of a peaceful or tame monster made by the hero stays so only
 * `rn2(max(2 + Luck, 2))` of the time; a tame one is tamed afresh with the original's pet record.
 * Returns null when the monster has 1 HP or less or there is no room.
 * ref: src/makemon.c clone_mon() (x == 0: next to the monster; no extinction, names, minions,
 * light sources or mon_track: none apply here)
 */
export function cloneMon(ctx: Ctx, id: EntityId, monMoving: boolean, where?: Pos): EntityId | null {
  const mon = ctx.state.entities[String(id)];
  const m = mon?.c.monster;
  const hp = mon?.c.hp;
  const pos = mon?.c.pos;
  if (!mon || !m || !hp || !pos || hp.cur <= 1) return null;
  const level = getLevel(ctx.state, pos.level);
  // `where` is the clone's preferred square (a cut worm's new head); `MON_AT(mm.x, mm.y)` is
  // always true for the default (next to the monster): enexto() for a free square
  const want = where ?? pos;
  const at =
    where && !mAt(ctx.state, pos.level, where.x, where.y) && !heroAt(ctx, pos.level, where)
      ? where
      : mnextoPos(ctx, level, id, want);
  if (!at) return null;

  const half = Math.trunc(hp.cur / 2);
  const m2 = ctx.spawn({
    def: mon.def,
    c: {
      pos: { level: pos.level, x: at.x, y: at.y },
      actor: { energy: mon.c.actor?.energy ?? 0, speed: mon.c.actor?.speed ?? 0 },
      hp: { cur: half, max: hp.max },
      monster: {
        level: m.level,
        peaceful: m.peaceful,
        asleep: m.asleep,
        lastHero: m.lastHero ? { ...m.lastHero } : null,
        ...(m.tame ? { tame: m.tame } : {}),
      },
    },
  });
  hp.cur -= half;
  copyMState(ctx, id, m2);
  if (isFleeing(ctx, id)) monflee(ctx, m2, fleeTime(ctx, id), false, false);

  const c2 = ctx.state.entities[String(m2)]?.c.monster;
  if (!c2) return m2;
  // "not all clones caused by player are tame or peaceful"
  if (!monMoving && m.peaceful) {
    const n = Math.max(2 + luckOf(ctx.state), 2);
    if (m.tame) {
      if (!ctx.rng.rn2(n)) delete c2.tame;
    } else c2.peaceful = ctx.rng.rn2(n) !== 0;
  }
  if (c2.tame) {
    // "m2 must be made non-tame to get initialized properly"
    delete c2.tame;
    if (tamedog(ctx, m2, null, false, () => {})) {
      const from = edogOf(ctx, id);
      const to = edogOf(ctx, m2);
      if (from && to) Object.assign(to, JSON.parse(JSON.stringify(from)));
    }
  }
  return m2;
}

/**
 * A gremlin splits in water: a clone (see `cloneMon`) takes half the maximum HP too, and "The
 * gremlin multiplies!" when the hero can spot it. Returns the new monster, or null.
 * ref: src/potion.c split_mon() (monsters only: no polymorphed hero; no attacker's heat)
 */
export function splitMon(ctx: Ctx, id: EntityId, monMoving: boolean): EntityId | null {
  const mon = ctx.state.entities[String(id)];
  const hp = mon?.c.hp;
  if (!mon || !hp) return null;
  if (hp.cur > hp.max) hp.cur = hp.max; // sanity precaution
  const m2 = hp.cur > 1 ? cloneMon(ctx, id, monMoving) : null;
  const hp2 = m2 === null ? undefined : ctx.state.entities[String(m2)]?.c.hp;
  if (m2 !== null && hp2) {
    hp2.max = Math.trunc(hp.max / 2);
    hp.max -= hp2.max;
    if (canSpotMon(ctx, mon))
      ctx.emit({ type: 'msg', key: 'clone.multiplies', params: { mon: monNam(ctx, mon) } });
  }
  return m2;
}

setSplitMon(splitMon);
