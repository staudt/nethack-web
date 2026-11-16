// Keystone Kops: robbing a shop sounds the alarm and brings them, around the hero if she merely
// stepped out of the door, else near the down stairs and the shopkeeper; paying him off sends
// them away; a dead Kop may come back. ref: src/shk.c call_kops(), makekops(), kops_gone(),
// make_happy_shoppers(); src/mon.c mondead() (S_KOP)
//
// shk.ts and mondeath.ts sit below this module (shk.ts is imported by trap.ts, which
// covetous.ts and generation's callers reach), so they reach it through the hooks set at the
// bottom. Not ported: deafness (the alarm is always heard), remote_burglary() (no telekinesis or
// grappling hook), flags.verbose (always on).
import { getLevel, sortedIds, type Ctx, type DefId, type Entity, type Pos } from '@nh/core';
import { makemon, mnextoPos } from './generation';
import { chooseStairs, stairwayDir } from './ladder';
import { mongone, setKopReturns } from './mondeath';
import { canSpotMon } from './perception';
import { setKopsHooks } from './shk';
import { isGone } from './vanquished';
import { angryGuards } from './watch';

/** ref: makekops() k_mndx[] */
const KOPS: readonly DefId[] = [
  'nh:keystone_kop',
  'nh:kop_sergeant',
  'nh:kop_lieutenant',
  'nh:kop_kaptain',
];

/** S_KOP */
export const isKop = (ctx: Pick<Ctx, 'defs'>, def: DefId): boolean =>
  ctx.defs.isMonster(def) && ctx.defs.monster(def).glyph.ch === 'K';

const say = (ctx: Ctx, key: string, params?: Record<string, number>): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/** Every Kop kind is genocided, extinct or has no row. */
const noKops = (ctx: Ctx): boolean =>
  KOPS.every((id) => !ctx.defs.isMonster(id) || isGone(ctx.state, id));

/**
 * A swarm of Kops around `mm` on the current level: `abs(depth) + rnd(5)` Keystone Kops, a third
 * of that plus one sergeants, a sixth lieutenants, a ninth kaptains; each goes on the free
 * square nearest to the last one placed (enexto() moves `mm`); a gone kind is skipped and the
 * first empty count stops the rest. ref: src/shk.c makekops()
 */
export function makekops(ctx: Ctx, mm: Pos): void {
  const level = getLevel(ctx.state);
  const cnt0 = Math.abs(level.depth) + ctx.rng.rnd(5);
  const counts = [cnt0, Math.trunc(cnt0 / 3) + 1, Math.trunc(cnt0 / 6), Math.trunc(cnt0 / 9)];
  let at: Pos = { x: mm.x, y: mm.y };
  for (let k = 0; k < 4; k++) {
    let cnt = counts[k] ?? 0;
    if (cnt === 0) break;
    const id = KOPS[k] as DefId;
    if (!ctx.defs.isMonster(id) || isGone(ctx.state, id)) continue;
    const def = ctx.defs.monster(id);
    while (cnt--) {
      const p = mnextoPos(ctx, level, null, at, def);
      if (!p) continue;
      at = p;
      makemon(ctx, def, p);
    }
  }
}

/**
 * "An alarm sounds!": the Watch turns on her ("But no one seems to respond to it." when there is
 * no Watch and every Kop kind is gone), then the Kops come: "The Keystone Kops appear!" around
 * her when she merely stepped out (`nearshop`), else "The Keystone Kops are after you!" with a
 * swarm near the down stairs (hindering her return) and one near the shopkeeper.
 * ref: src/shk.c call_kops()
 */
export function callKops(ctx: Ctx, shk: Entity, nearshop: boolean): void {
  say(ctx, 'shk.alarm');
  const nokops = noKops(ctx);
  if (!angryGuards(ctx, false) && nokops) {
    say(ctx, 'shk.no_one_responds');
    return;
  }
  if (nokops) return;
  const level = getLevel(ctx.state);
  const stairs = chooseStairs(ctx, level.id, true);
  const hp = ctx.state.entities[String(ctx.state.playerId)]?.c.pos;
  if (nearshop && hp) {
    // create swarm around you, if you merely "stepped out"
    say(ctx, 'kops.appear');
    makekops(ctx, { x: hp.x, y: hp.y });
    return;
  }
  say(ctx, 'kops.after_you');
  // create swarm near down staircase (hinders return to level)
  if (stairs) makekops(ctx, stairs);
  // create swarm near shopkeeper (hinders return to shop)
  if (shk.c.pos?.level === level.id) makekops(ctx, { x: shk.c.pos.x, y: shk.c.pos.y });
}

/**
 * Every Kop on the hero's level leaves the game: "The Kops (disappointed) vanish into thin air."
 * for those she could see, unless `silent`. ref: src/shk.c kops_gone()
 */
export function kopsGone(ctx: Ctx, silent: boolean): void {
  let cnt = 0;
  for (const id of sortedIds(ctx.state)) {
    const mon = ctx.state.entities[String(id)];
    if (!mon?.c.monster || mon.c.pos?.level !== ctx.state.currentLevel) continue;
    if (!isKop(ctx, mon.def)) continue;
    if (canSpotMon(ctx, mon)) cnt++;
    mongone(ctx, id);
  }
  if (cnt && !silent) say(ctx, cnt === 1 ? 'kops.vanish_one' : 'kops.vanish', { n: cnt });
}

/**
 * "Dead Kops may come back": 1 in 5 one of its kind near the down stairs (at random when there
 * are none), 1 in 5 at random. ref: src/mon.c mondead() (`mtmp->data->mlet == S_KOP`)
 */
export function kopReturns(ctx: Ctx, mon: Entity): void {
  if (!isKop(ctx, mon.def)) return;
  const levelId = mon.c.pos?.level ?? ctx.state.currentLevel;
  const level = ctx.state.levels[levelId];
  if (!level) return;
  const def = ctx.defs.monster(mon.def);
  const r = ctx.rng.rnd(5);
  if (r === 1) {
    const stway = stairwayDir(level, false);
    if (stway) {
      makemon(ctx, def, stway, { level: levelId });
      return;
    }
  }
  if (r === 1 || r === 2) makemon(ctx, def, null, { level: levelId });
}

setKopsHooks(callKops, kopsGone);
setKopReturns(kopReturns);
