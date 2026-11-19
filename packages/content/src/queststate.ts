// The quest's scorecard: C's `svq.quest_status` and the quest's `u.uevent` flags, kept in
// `modData.nh.quest`. Every field is optional (absent is C's zero), so the steps that set them
// need no save bump. A leaf (core only). ref: include/quest.h struct q_score; include/you.h
// u.uevent.qcalled, qexpelled, qcompleted
import type { Ctx, EntityId, GameState, Json } from '@nh/core';

/** `modData.nh.quest`. ref: include/quest.h struct q_score (godgend is derived: gods.ts) */
export interface QuestStatus {
  /** only set the first time */
  firstStart?: true;
  /** has met the leader */
  metLeader?: true;
  /** rejected due to alignment, etc. (0..7) */
  notReady?: number;
  /** got the leader angry */
  pissedOff?: true;
  /** got the quest assignment */
  gotQuest?: true;
  /** killed the quest leader */
  killedLeader?: true;
  /** only set the first time */
  firstLocate?: true;
  /** used if the locate is a person */
  metIntermed?: true;
  /** got the final quest assignment */
  gotFinal?: true;
  /** times on the goal level (0..7) */
  madeGoal?: number;
  /** has met the nemesis before */
  metNemesis?: true;
  /** set when the nemesis is killed */
  killedNemesis?: true;
  /** set when the nemesis is fighting her */
  inBattle?: true;
  /** set if cheating was detected */
  cheater?: true;
  /** for a special message */
  touchedArtifact?: true;
  /** offered to the leader */
  offeredArtifact?: true;
  /** the leader's final message */
  gotThanks?: true;
  /**
   * the leader's and the nemesis's gender (0 male, 1 female, 2 neuter) when drawn at new game
   * (their rows give none); questmon.ts questGender() reads the row's otherwise
   */
  ldrgend?: 0 | 1 | 2;
  nemgend?: 0 | 1 | 2;
  leaderIsDead?: true;
  /** the hero's own leader's entity (C's leader_m_id), set when makemon() makes him */
  leaderId?: EntityId;
  /** u.uevent: the leader's call on the portal level; expelled; the artifact returned */
  qcalled?: true;
  qexpelled?: true;
  qcompleted?: true;
}

const EMPTY: Readonly<QuestStatus> = Object.freeze({});

/** The quest's scorecard (fields absent while zero). */
export function questStatus(state: Readonly<GameState>): Readonly<QuestStatus> {
  const nh = state.modData['nh'] as Record<string, Json> | undefined;
  const q = nh?.['quest'];
  return q !== null && typeof q === 'object' && !Array.isArray(q)
    ? (q as unknown as QuestStatus)
    : EMPTY;
}

/**
 * Updates the scorecard: each field of `patch` is set, or removed when it is `undefined`,
 * `false` or 0 (C's zero), so the stored object holds only what is set.
 */
export function setQuest(
  ctx: Pick<Ctx, 'state'>,
  patch: { [K in keyof QuestStatus]?: QuestStatus[K] | undefined | false },
): void {
  const nh = (ctx.state.modData['nh'] ??= {}) as Record<string, Json>;
  const q = { ...(questStatus(ctx.state) as Record<string, Json>) };
  for (const [k, v] of Object.entries(patch).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (v === undefined || v === false || v === 0) delete q[k];
    else q[k] = v as Json;
  }
  if (Object.keys(q).length) nh['quest'] = q;
  else delete nh['quest'];
}
