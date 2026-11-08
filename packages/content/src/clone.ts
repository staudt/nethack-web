// Monster cloning: a brown pudding hit with iron divides. ref: src/makemon.c clone_mon()
import { getLevel, type Ctx, type EntityId } from '@nh/core';
import { mnextoPos } from './generation';
import { edogOf, tamedog } from './dog';
import { fleeTime, isFleeing, monflee } from './monflee';
import { copyMState } from './mstate';
import { luckOf } from './luck';

/**
 * A copy of the monster next to it ("copy condition of old monster"): same type, level, maximum
 * HP and conditions, current HP halved (the original keeps the odd point), no inventory, not
 * trapped. A clone of a peaceful or tame monster made by the hero stays so only
 * `rn2(max(2 + Luck, 2))` of the time; a tame one is tamed afresh with the original's pet record.
 * Returns null when the monster has 1 HP or less or there is no room.
 * ref: src/makemon.c clone_mon() (x == 0: next to the monster; no extinction, names, minions,
 * light sources or mon_track: none apply here)
 */
export function cloneMon(ctx: Ctx, id: EntityId, monMoving: boolean): EntityId | null {
  const mon = ctx.state.entities[String(id)];
  const m = mon?.c.monster;
  const hp = mon?.c.hp;
  const pos = mon?.c.pos;
  if (!mon || !m || !hp || !pos || hp.cur <= 1) return null;
  const level = getLevel(ctx.state, pos.level);
  // `MON_AT(mm.x, mm.y)` is always true here: enexto() for a free square
  const at = mnextoPos(ctx, level, id, pos);
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
