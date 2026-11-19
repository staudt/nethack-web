// The quest's rules. Step 4 of m24: the arrival lines on the home, locate and goal levels and the
// leader's call on the main dungeon's portal level, delivered through the quest pager.
// ref: src/quest.c onquest(), on_start(), on_locate(), on_goal(); src/do.c goto_level()
import type { Ctx, LevelChange, ModApi } from '@nh/core';
import { questPorted } from './branchportal';
import { atQuestEntrance, inQuest, isQgoal, isQlocate, isQstart } from './levelflags';
import { comPager, findQuestArtifact, qtPager } from './questpgr';
import { questStatus, setQuest } from './queststate';
import { roleIs } from './urole';

/**
 * On the home level: "firsttime" on the first arrival, then on an arrival from another dungeon
 * or from above "nexttime", or "othertime" once she was turned away more than twice.
 * ref: src/quest.c on_start()
 */
function onStart(ctx: Ctx, change: LevelChange): void {
  const q = questStatus(ctx.state);
  const from = change.from === null ? undefined : ctx.state.levels[change.from];
  const to = ctx.state.levels[change.to];
  if (!q.firstStart) {
    qtPager(ctx, 'firsttime');
    setQuest(ctx, { firstStart: true });
  } else if (from && to && (from.dungeon !== to.dungeon || from.dlevel < to.dlevel)) {
    qtPager(ctx, (q.notReady ?? 0) <= 2 ? 'nexttime' : 'othertime');
  }
}

/**
 * On the locate level: "locate_first" or "locate_next", only when she arrives from above (the
 * texts make sense only then), nothing after the nemesis's death. ref: src/quest.c on_locate()
 */
function onLocate(ctx: Ctx, change: LevelChange): void {
  const q = questStatus(ctx.state);
  const from = change.from === null ? undefined : ctx.state.levels[change.from];
  const to = ctx.state.levels[change.to];
  const fromAbove = !!from && !!to && from.dlevel < to.dlevel;
  if (q.killedNemesis) return;
  if (!q.firstLocate) {
    if (fromAbove) qtPager(ctx, 'locate_first');
    // from below this is a lie, but a later visit from above would find the level seen
    setQuest(ctx, { firstLocate: true });
  } else if (fromAbove) qtPager(ctx, 'locate_next');
}

/**
 * On the goal level: "goal_first", then "goal_next" while her quest artifact is still on the
 * level (on the floor or carried by a monster; hers does not count), else "goal_alt" (falling
 * back to "goal_next"); nothing after the nemesis's death. `madeGoal` counts the visits up to 7.
 * ref: src/quest.c on_goal()
 */
function onGoal(ctx: Ctx, change: LevelChange): void {
  const q = questStatus(ctx.state);
  const level = ctx.state.levels[change.to];
  if (q.killedNemesis || !level) return;
  if (!q.madeGoal) {
    qtPager(ctx, 'goal_first');
    setQuest(ctx, { madeGoal: 1 });
  } else {
    const qarti = findQuestArtifact(ctx.state, level, ['floor', 'minvent']);
    qtPager(ctx, qarti ? 'goal_next' : 'goal_alt');
    if (q.madeGoal < 7) setQuest(ctx, { madeGoal: q.madeGoal + 1 });
  }
}

/**
 * Arriving on a quest level: its arrival lines, unless the quest is done or she is on the same
 * level (Not_firsttime). ref: src/quest.c onquest()
 */
export function onquest(ctx: Ctx, change: LevelChange): void {
  if (questStatus(ctx.state).qcompleted || change.from === change.to) return;
  if (isQstart(ctx.state)) onStart(ctx, change);
  else if (isQlocate(ctx.state)) onLocate(ctx, change);
  else if (isQgoal(ctx.state)) onGoal(ctx, change);
}

/**
 * Arriving on the main dungeon's portal level from outside the quest: her leader's call, the
 * first time "quest_portal" (`qcalled`), then the reminder ("quest_portal_demand" for a Rogue),
 * not once the quest is done, she was expelled or her leader is dead. Only for a role whose quest
 * levels exist (`questPorted()`: the others get no portal until m24b).
 * ref: src/do.c goto_level() "main dungeon message from your quest leader"
 */
function questCall(ctx: Ctx, change: LevelChange): void {
  const from = change.from === null ? undefined : ctx.state.levels[change.from];
  if (!from || inQuest(ctx.state, from) || !atQuestEntrance(ctx.state)) return;
  const q = questStatus(ctx.state);
  if (q.qcompleted || q.qexpelled || q.leaderIsDead || !questPorted(ctx)) return;
  if (!q.qcalled) {
    setQuest(ctx, { qcalled: true });
    comPager(ctx, 'quest_portal');
  } else comPager(ctx, roleIs(ctx.state, 'rogue') ? 'quest_portal_demand' : 'quest_portal_again');
}

export function registerQuest(api: ModApi): void {
  // ref: src/do.c goto_level(): `In_quest(&u.uz) -> onquest()`, else the leader's call
  api.on('levelChange', (ctx, change) => {
    if (change.from === null) return;
    if (inQuest(ctx.state)) onquest(ctx, change);
    else questCall(ctx, change);
  });
}
