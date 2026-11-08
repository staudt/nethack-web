// Attacking peaceful monsters: the confirmation, waking monsters and making them angry.
// ref: src/uhitm.c attack_checks(), src/mon.c wakeup(), setmangry(), peacefuls_respond()
import { engulfingU } from './engulfstate';
import {
  getPlayer,
  inRooms,
  sortedIds,
  type Ctx,
  type DefId,
  type EntityId,
  type Json,
} from '@nh/core';
import { monflee } from './monflee';
import { heroSees } from './mongear';
import { P, hasProp } from './props';
import { canSpotMon, monNam } from './perception';
import { adjalign } from './luck';
import { growl } from './dog';
import { angryGuards, isWatch } from './watch';
import { epriOf, pCoaligned, templeOccupied } from './epri';
import { ghodHitsu } from './priest';
import { eshkOf, uShops } from './eshk';
import { hotPursuit } from './shk';

const say = (ctx: Ctx, key: string, params?: Record<string, string | number>): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/**
 * Whether the hero must confirm before attacking monster `id` ("Really attack the dwarf?"): it is
 * peaceful, she can see it, and she is not confused, hallucinating or stunned.
 * ref: src/uhitm.c attack_checks() `flags.confirm && mtmp->mpeaceful && !Confusion &&
 * !Hallucination && !Stunned` and `canspotmon(mtmp)`. Not ported: Stormbringer, hidden and
 * invisible monsters, mimics.
 */
export function needsAttackConfirm(ctx: Ctx, id: EntityId): boolean {
  const mon = ctx.state.entities[String(id)];
  if (!mon?.c.monster?.peaceful || !mon.c.pos) return false;
  if (engulfingU(ctx, id)) return false; // attack_checks(): `if (engulfing_u(mtmp)) return FALSE`
  const hero = getPlayer(ctx.state);
  if (hasProp(hero, P.STUNNED) || hasProp(hero, P.CONFUSION) || hasProp(hero, P.HALLUC))
    return false;
  return canSpotMon(ctx, mon);
}

/**
 * Asks "Really attack the X?"; the answer goes to the action `handler` with `data`.
 * ref: src/uhitm.c attack_checks() paranoid_query(ParanoidHit, "Really attack %s?")
 */
export function askReallyAttack(ctx: Ctx, id: EntityId, handler: DefId, data: Json): void {
  const mon = ctx.state.entities[String(id)];
  ctx.ask(
    {
      id: 'attack-peaceful',
      kind: 'yn',
      key: 'attack.confirm',
      cancellable: true,
      params: { mon: mon ? monNam(ctx, mon) : '@pronoun.it' },
    },
    handler,
    data,
  );
}

/** ref: include/mondata.h humanoid() */
const humanoid = (ctx: Ctx, id: EntityId): boolean => {
  const mon = ctx.state.entities[String(id)];
  return mon !== undefined && ctx.defs.monster(mon.def).flags.includes('humanoid');
};

/**
 * Other peaceful monsters that see the attack react: humanoids may turn to flee, and always turn
 * hostile; a watchman arrests the hero, which angers the whole Watch. ref: src/mon.c
 * peacefuls_respond(); temple priests never turn hostile here. Not ported: the gasp / exclaim lines
 * (and their random draw), shopkeepers, the quest, and the same-letter big-little match for
 * non-humanoids (growling and fleeing).
 */
function peacefulsRespond(ctx: Ctx, victim: EntityId): void {
  for (const id of sortedIds(ctx.state)) {
    const mon = ctx.state.entities[String(id)];
    const m = mon?.c.monster;
    if (!mon || !m || id === victim || !mon.c.pos) continue;
    const def = ctx.defs.monster(mon.def);
    // couldsee() && m_canseeu(): approximated by the hero seeing its square
    if (
      def.flags.includes('mindless') ||
      !m.peaceful ||
      m.tame ||
      m.asleep ||
      !heroSees(ctx, mon.c.pos)
    )
      continue;
    const priest = epriOf(ctx, id) !== null;
    if (!humanoid(ctx, id) && !priest) continue;
    if (isWatch(mon.def)) {
      // verbalize()
      say(ctx, 'watch.halt_arrest');
      angryGuards(ctx, false);
      continue;
    }
    // temple priests might gasp in surprise, but they won't become angry here
    if (priest) continue;
    // the monster is scared when its level is below a d10 roll
    if (def.level < ctx.rng.rn2(10)) monflee(ctx, id, ctx.rng.rn2(50) + 25, true, true);
    m.peaceful = false;
    say(ctx, 'mon.gets_angry', { mon: monNam(ctx, mon) });
  }
}

/**
 * The monster turns hostile (costing a point of alignment), with "gets angry!" when the hero sees
 * a humanoid do so, or a growl. ref: src/mon.c setmangry(mtmp, TRUE). Not ported: Elbereth
 * hypocrisy, shopkeepers, guards. A temple priest costs 5 points of alignment when he is the hero's
 * own, and earns 2 otherwise.
 */
export function setmangry(ctx: Ctx, id: EntityId): void {
  const mon = ctx.state.entities[String(id)];
  const m = mon?.c.monster;
  if (!mon || !m || !m.peaceful) return;
  if (m.tame) return; // pets stay peaceful (abuse_dog has lowered tameness)
  m.peaceful = false;
  const epri = epriOf(ctx, id);
  if (epri)
    adjalign(ctx, pCoaligned(ctx, epri) ? -5 : 2); // very bad / attacking an infidel's
  else adjalign(ctx, -1); // attacking peaceful monsters is bad
  if (mon.c.pos && heroSees(ctx, mon.c.pos)) {
    if (humanoid(ctx, id)) say(ctx, 'mon.gets_angry', { mon: monNam(ctx, mon) });
    else growl(ctx, mon);
  }
  peacefulsRespond(ctx, id);
}

/**
 * Wakes a monster that the hero attacked, which also angers it; a peaceful temple priest
 * attacked in a temple brings down his god's anger (ghod_hitsu()), and a peaceful shopkeeper
 * attacked while she is in no shop goes after her (hot_pursuit()).
 * ref: src/mon.c wakeup(mtmp, TRUE): wake_msg(), `msleeping = 0`, setmangry()
 */
export function wakeup(ctx: Ctx, id: EntityId): void {
  const mon = ctx.state.entities[String(id)];
  const m = mon?.c.monster;
  if (!mon || !m) return;
  if (m.asleep && mon.c.pos && heroSees(ctx, mon.c.pos))
    say(ctx, 'mon.wakes_up', { mon: monNam(ctx, mon) });
  m.asleep = false;
  const wasPeaceful = m.peaceful;
  setmangry(ctx, id);
  // a peaceful priest attacked in a temple: his god strikes at the hero
  const epri = epriOf(ctx, id);
  const p = mon.c.pos;
  if (wasPeaceful && epri && p && p.level === ctx.state.currentLevel) {
    const level = ctx.state.levels[p.level];
    if (level && templeOccupied(level, inRooms(level, p.x, p.y)) !== null) ghodHitsu(ctx, epri);
  }
  // a peaceful shopkeeper attacked while she is in no shop goes after her
  if (wasPeaceful && eshkOf(ctx, id) && uShops(ctx).length === 0) hotPursuit(ctx, id);
}
