// The quest's gate on Home 1: whether her leader has let her go deeper, and the mysterious force
// that stops her otherwise. A leaf (core, luck, the quest's state and level predicates) so the
// stairs, the level teleports, falling and wizard mode's levelport can ask it without reaching
// quest.ts (which sits above trap.ts through branchportal.ts).
// ref: src/quest.c ok_to_quest(), not_capable(), is_pure(); src/do.c goto_level()
import { getLevel, getPlayer, type Ctx, type GameState, type LevelRef } from '@nh/core';
import { isQstart } from './levelflags';
import { uState, ualignBase, ualignCur } from './luck';
import { questStatus } from './queststate';
import { MIN_QUEST_ALIGN, MIN_QUEST_LEVEL } from './questtab';

/** Her experience level is below the quest's 14. ref: src/quest.c not_capable() */
export const notCapable = (state: Readonly<GameState>): boolean =>
  (getPlayer(state).c.experience?.level ?? 1) < MIN_QUEST_LEVEL;

/**
 * Her purity: 1 when her alignment record is at least 20 and she has neither converted nor wears
 * a helm of opposite alignment, -1 when she has converted, else 0 (too low a record, or the
 * helm). The wizard-mode lines are quest.ts's. ref: src/quest.c is_pure(FALSE)
 */
export function purity(state: Readonly<GameState>): -1 | 0 | 1 {
  const u = uState(state);
  const original = ualignBase(state);
  if (u.alignRecord >= MIN_QUEST_ALIGN && u.alignType === original && ualignCur(state) === original)
    return 1;
  return ualignCur(state) !== original ? -1 : 0;
}

/**
 * Whether she may go past Home 1: the leader gave her the quest (or thanked her) and she is
 * still pure, or she killed him. ref: src/quest.c ok_to_quest()
 */
export function okToQuest(state: Readonly<GameState>): boolean {
  const q = questStatus(state);
  return ((q.gotQuest === true || q.gotThanks === true) && purity(state) > 0) || !!q.killedLeader;
}

/**
 * The gate of goto_level(): leaving Home 1 for another level of the quest (any way: stairs, a
 * level teleport, a fall, wizard mode's levelport) before the leader allows it says "A
 * mysterious force prevents you from descending." and she stays; true then. Going to another
 * dungeon (the portal) is never stopped. ref: src/do.c goto_level() "Prevent the player from
 * going past the first quest level"
 */
export function questDescentBlocked(ctx: Ctx, to: LevelRef): boolean {
  const here = getLevel(ctx.state);
  if (!isQstart(ctx.state, here) || to.dungeon !== here.dungeon || okToQuest(ctx.state))
    return false;
  ctx.emit({ type: 'msg', key: 'quest.descend_blocked' });
  return true;
}
