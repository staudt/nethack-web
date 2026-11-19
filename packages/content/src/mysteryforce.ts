// The mysterious force: climbing out of Gehennom with the Amulet of Yendor sometimes keeps her on
// her level or sends her down instead. Used by the climbs that are goto_level() going up within
// a dungeon (stairs, ladders, the cursed potion of gain level).
// ref: src/do.c goto_level(); src/dungeon.c assign_rnd_level()
import { depthOf, getLevel, getPlayer, type Ctx, type LevelRef } from '@nh/core';
import { dungeonBottom, inHell, inWTower, onWTowerLevel } from './levelflags';
import { setU, uState } from './luck';
import { teleds } from './trap';
import { safeTeledsPos } from './teleport';
import { uHave } from './uhave';

/** What the force did: nothing; kept her on her level; or sends her to `to` instead. */
export type ForceResult = { kind: 'none' } | { kind: 'stay' } | { kind: 'down'; to: LevelRef };

const NONE: ForceResult = { kind: 'none' };

/**
 * goto_level()'s mysterious force, for her going from her level to `to`. It acts in Gehennom
 * while she carries the Amulet and goes up within the dungeon (not by a portal or into another
 * dungeon) from above its bottom four levels, 1 time in 4 + `mysteryForce`: by her alignment
 * (`rn2(3 + alignment)`, biased against law) she is sent 1 to 3 levels down (`rnd()` of that,
 * kept inside the dungeon; inside the Wizard's Tower only to another of its levels) or kept on
 * her level; "A mysterious force momentarily surrounds you..." and `mysteryForce` grows by
 * `rn2(levels down + 2)`. Kept on her level she lands on a random spot of it (safe_teleds())
 * and the climb still takes its time.
 * ref: src/do.c goto_level() (no next_to_u(): pets do not hold her back)
 */
export function mysteriousForce(ctx: Ctx, to: LevelRef, portal = false): ForceResult {
  const level = getLevel(ctx.state);
  if (portal || to.dungeon !== level.dungeon || !inHell(ctx.state, level)) return NONE;
  if (depthOf(ctx.state, to) >= level.depth || !uHave(ctx.state, 'amulet')) return NONE;
  const bottom = dungeonBottom(ctx.state, level); // dunlevs_in_dungeon()
  if (level.dlevel >= bottom - 3) return NONE;
  const u = uState(ctx.state);
  const force = u.mysteryForce ?? 0;
  if (ctx.rng.rn2(4 + force)) return NONE;
  const pos = getPlayer(ctx.state).c.pos;
  const wasInWTower = pos !== undefined && inWTower(ctx.state, level, pos.x, pos.y);
  const odds = 3 + u.alignType; // 2..4
  let diff = odds <= 1 ? 0 : ctx.rng.rn2(odds);
  let dlevel = level.dlevel;
  if (diff !== 0) {
    // assign_rnd_level(newlevel, &u.uz, diff): may have used a value less than diff
    dlevel = Math.min(Math.max(level.dlevel + ctx.rng.rnd(diff), 1), bottom);
    diff = dlevel - level.dlevel; // actual descent
    // if inside the tower, stay inside
    if (wasInWTower && !onWTowerLevel(ctx.state, { dungeon: level.dungeon, dlevel })) diff = 0;
  }
  if (diff === 0) dlevel = level.dlevel;
  ctx.emit({ type: 'msg', key: 'goto.mysterious_force' });
  // each time it kicks in, the chance of doing so again may drop, faster when sent down farther
  setU(ctx, { mysteryForce: force + ctx.rng.rn2(diff + 2) });
  if (dlevel === level.dlevel) {
    // safe_teleds(TELEDS_NO_FLAGS): no "You materialize" line
    const spot = safeTeledsPos(ctx, level);
    if (spot) teleds(ctx, spot.x, spot.y);
    return { kind: 'stay' };
  }
  return { kind: 'down', to: { dungeon: level.dungeon, dlevel } };
}
