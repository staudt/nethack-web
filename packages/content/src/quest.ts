// The quest's rules: the arrival lines on the home, locate and goal levels, the leader's call on
// the main dungeon's portal level (m24 step 4), and (step 5) the leader's judgement when she talks
// to him (or he to her), the expulsion, the nemesis's, the guardians' and the prisoner's speech;
// (step 6) the nemesis's and the leader's deaths, the first touch of her artifact and its return.
// The gate on Home 1's descent is questgate.ts (a leaf the stairs and teleports can import).
// ref: src/quest.c; src/do.c goto_level(); src/sounds.c domonnoise(); src/monmove.c dochug();
// src/mon.c mondead(), m_detach(); src/invent.c addinv_core1()
import {
  getLevel,
  getPlayer,
  inventoryOf,
  type ActionDef,
  type Ctx,
  type EntityId,
  type Entity,
  type Json,
  type LevelChange,
  type LevelRef,
  type ModApi,
} from '@nh/core';
import { alignStr } from './align';
import { questPorted } from './branchportal';
import { canseemon } from './invis';
import { wizardMode } from './knoxstate';
import { atQuestEntrance, inQuest, isQgoal, isQlocate, isQstart, questEntry } from './levelflags';
import { adjalign, setU, uState, ualignBase, ualignCur } from './luck';
import { clearWaitMask, isFrozen, mstratOf, stratWaiting } from './mstate';
import { setmangry } from './peaceful';
import { monNam } from './perception';
import { MAGIC_PORTAL } from './portal';
import { notCapable, purity } from './questgate';
import { questMonDef } from './questmon';
import { comPager, findQuestArtifact, qtPager, type PagerCtx } from './questpgr';
import { questStatus, setQuest } from './queststate';
import { MIN_QUEST_ALIGN } from './questtab';
import { isQuestArtifact } from './artistate';
import { AMULET_OF_YENDOR, uHave } from './uhave';
import { setArtitouch } from './items';
import { setQuestDeath } from './mondeath';
import { theXname } from './objnam';
import { fullyIdentify } from './read';
import { roleIs } from './urole';
import { angryGuards } from './watch';

export { notCapable, okToQuest, purity, questDescentBlocked } from './questgate';

/** ref: include/objects.h FAKE_AMULET_OF_YENDOR */
const FAKE_AMULET = 'nh:fake_amulet_of_yendor';

const say = (ctx: Ctx, key: string, params?: Record<string, string | number>): void =>
  ctx.emit(params ? { type: 'msg', key, params } : { type: 'msg', key });

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

// ---------------------------------------------------------------------------------------------
// the leader's rules (step 5)

/** The prompt handler of wizard mode's "adjust?" (is_pure()'s yn_function()). */
export const QUEST_ADJUST_ID = 'nh:quest-adjust';

/**
 * A pending trip back to the main dungeon: C's schedule_goto() from expulsion(), done once the
 * talk is over (deferred_goto(): after the leader's anger in quest_chat()).
 */
export interface Expel {
  to: LevelRef;
  /** UTOTYPE_PORTAL: arrive on the portal there (not after an earlier sealing expulsion) */
  portal: boolean;
  /** UTOTYPE_RMPORTAL: remove the portal she arrives on */
  seal: boolean;
}

/**
 * Sends her back to the main dungeon's end of the quest's branch, on its portal. `seal` (never
 * used by quest.c's callers in NetHack 5.0) also removes both portals: the near one now, the far
 * one on arrival, and sets `qexpelled` (the leader's call then stays silent, and later trips in
 * either direction arrive at random). The trip itself is returned for `doExpel()`.
 * ref: src/quest.c expulsion() (no remdun_mapseen(): no #overview)
 */
export function expulsion(ctx: Ctx, seal: boolean): Expel | null {
  const to = questEntry(ctx.state);
  if (!to) return null;
  const q = questStatus(ctx.state);
  const expel: Expel = { to, portal: !q.qexpelled, seal };
  ctx.interrupt(); // nomul(0): stop running
  if (seal) {
    // remove the portal to the quest - sealing it off
    setQuest(ctx, { qexpelled: true });
    const level = getLevel(ctx.state);
    const t = level.traps.find((x) => x.def === MAGIC_PORTAL);
    if (t) ctx.removeTrap(level.id, { x: t.x, y: t.y });
  }
  return expel;
}

/** The deferred goto of an expulsion. ref: src/do.c deferred_goto() (UTOTYPE_RMPORTAL) */
export function doExpel(ctx: Ctx, e: Expel | null): void {
  if (!e || ctx.state.gameOver) return;
  ctx.goToLevel(e.to, e.portal ? { trap: MAGIC_PORTAL } : 'random');
  if (!e.seal) return;
  const p = getPlayer(ctx.state).c.pos;
  const t = p ? getLevel(ctx.state).traps.find((x) => x.x === p.x && x.y === p.y) : undefined;
  if (p && t) ctx.removeTrap(p.level, { x: t.x, y: t.y });
}

/**
 * Her artifact back to the leader, by hand (#chat) or thrown at him (`obj`), or the Amulet shown
 * to him: "offeredit" the first time, then "offeredit2", with "quest_complete_no_bell" when she
 * lacks the Bell; "hasamulet" while she carries the real Amulet (he identifies it, never a fake).
 * `gotThanks`, and with an artifact `qcompleted` and the artifact fully identified (he imparts
 * what it is). An invocation item or an Amulet thrown at him (not her artifact) is only
 * identified and named: "hasamulet", "Sorry to say, this is a mere imitation of the true Amulet
 * of Yendor.", or "Ah, I see you've found the Bell of Opening.". ref: src/quest.c finish_quest()
 * (no Deaf)
 */
export function finishQuest(ctx: Ctx, obj: Entity | null): void {
  if (obj && !isQuestArtifact(ctx.state, obj)) {
    // tossed an invocation item (or [fake] AoY) at the quest leader; do ID first so that the
    // message identifying the item will refer to it by name
    fullyIdentify(ctx, obj);
    if (obj.def === AMULET_OF_YENDOR) qtPager(ctx, 'hasamulet');
    else if (obj.def === FAKE_AMULET) say(ctx, 'quest.mere_imitation');
    else
      ctx.emit({
        type: 'msg',
        key: 'quest.found_it',
        params: { obj: theXname(ctx.state, ctx.defs, obj) },
      });
    return;
  }
  if (uHave(ctx.state, 'amulet')) {
    // has the amulet in inventory -- most likely she has already completed the quest and
    // stopped in on her way back up
    qtPager(ctx, 'hasamulet');
    // leader IDs the real amulet but ignores any fakes
    const amulet = inventoryOf(ctx.state, ctx.state.playerId).find(
      (o) => o.def === AMULET_OF_YENDOR,
    );
    if (amulet) fullyIdentify(ctx, amulet);
  } else {
    // normal quest completion; threw artifact or walked up carrying it
    qtPager(ctx, questStatus(ctx.state).gotThanks ? 'offeredit2' : 'offeredit');
    // should have obtained bell during quest; if not, suggest returning for it now
    if (!uHave(ctx.state, 'bell')) comPager(ctx, 'quest_complete_no_bell');
  }
  setQuest(ctx, { gotThanks: true });
  if (obj) {
    setQuest(ctx, { qcompleted: true }); // you did it!
    // behave as if leader imparts sufficient info about the quest artifact
    fullyIdentify(ctx, obj);
  }
}

/** The nemesis is dead: "killed_nemesis" once. ref: src/quest.c nemdead() */
export function nemdead(ctx: Ctx): void {
  if (questStatus(ctx.state).killedNemesis) return;
  setQuest(ctx, { killedNemesis: true });
  qtPager(ctx, 'killed_nemesis');
}

/** A quest leader is dead (silently: C's TODO). ref: src/quest.c leaddead() */
export function leaddead(ctx: Ctx): void {
  if (!questStatus(ctx.state).killedLeader) setQuest(ctx, { killedLeader: true });
}

/**
 * A monster's death, for the quest: her own leader (by entity, even polymorphed) is marked dead;
 * any nemesis row's death (by its sound, as mons[] after role_init()) is nemdead(), any leader
 * row's leaddead(). The Archeologist's, Cave Dweller's and Priest's nemeses leave no cloud of
 * gas (no gas-cloud regions). ref: src/mon.c mondead() "if it's a (possibly polymorphed) quest
 * leader", m_detach() (stinky_nemesis() not ported)
 */
function questMonDied(ctx: Ctx, mon: Entity): void {
  if (mon.id === questStatus(ctx.state).leaderId) setQuest(ctx, { leaderIsDead: true });
  const sound = questMonDef(ctx.state, ctx.defs.monster(mon.def)).sound;
  if (sound === 'nemesis') nemdead(ctx);
  if (sound === 'leader') leaddead(ctx);
}
setQuestDeath(questMonDied);

/**
 * Her quest artifact comes into her pack for the first time: "gotit" (`touchedArtifact`).
 * ref: src/quest.c artitouch() (no observe_object(): no dknown; no exercise(A_WIS))
 */
export function artitouch(ctx: PagerCtx, _obj: Entity): void {
  if (questStatus(ctx.state).touchedArtifact) return;
  // only give this message once
  setQuest(ctx, { touchedArtifact: true });
  qtPager(ctx, 'gotit');
}
setArtitouch(artitouch);

/** How the wizard-mode "adjust?" prompt came: her #chat or the leader's own speech. */
interface AdjustData {
  leader: EntityId;
  chat: boolean;
}

/**
 * is_pure(TRUE): in wizard mode first says why she is not pure ("You are currently chaotic
 * instead of lawful.", "You have converted.", or "You are currently 3 and require 20." with the
 * "adjust?" prompt, answered through {@link QUEST_ADJUST_ID}: 'ask' then); else her purity.
 * ref: src/quest.c is_pure()
 */
function isPureTalk(ctx: Ctx, data: AdjustData): -1 | 0 | 1 | 'ask' {
  if (wizardMode(ctx.state)) {
    const u = uState(ctx.state);
    const original = ualignBase(ctx.state);
    if (u.alignType !== original)
      say(ctx, 'quest.wiz.instead', { cur: alignStr(u.alignType), orig: alignStr(original) });
    else if (ualignCur(ctx.state) !== original) say(ctx, 'quest.wiz.converted');
    else if (u.alignRecord < MIN_QUEST_ALIGN) {
      say(ctx, 'quest.wiz.record', { cur: u.alignRecord, req: MIN_QUEST_ALIGN });
      ctx.ask(
        { id: 'quest-adjust', kind: 'yn', key: 'quest.wiz.adjust', cancellable: true },
        QUEST_ADJUST_ID,
        data as unknown as Json,
      );
      return 'ask';
    }
  }
  return purity(ctx.state);
}

/**
 * Rule 5's verdict once her purity is known: banished (converted: "banished", `pissedOff`, sent
 * back), "badalign" (`notReady`, sent back), or "assignquest" (`gotQuest`: she may go down).
 * ref: src/quest.c chat_with_leader() (no livelog)
 */
function leaderVerdict(ctx: Ctx, pure: -1 | 0 | 1): Expel | null {
  if (pure < 0) {
    if (questStatus(ctx.state).pissedOff) return null;
    comPager(ctx, 'banished');
    setQuest(ctx, { pissedOff: true });
    return expulsion(ctx, false);
  }
  if (pure === 0) {
    qtPager(ctx, 'badalign');
    setQuest(ctx, { notReady: 1 });
    // exercise(A_WIS, TRUE): no attribute exercise
    return expulsion(ctx, false);
  }
  // you are worthy!
  qtPager(ctx, 'assignquest');
  setQuest(ctx, { gotQuest: true });
  return null;
}

/**
 * Her leader hears her out (peaceful and not yet angered): Rule 0 marks a cheater who holds the
 * artifact without having met the nemesis; once thanked she hears "posthanks" (or about the
 * Amulet she carries); with the artifact she completes the quest; with the quest given,
 * "encourage"; else "leader_first" or "leader_next", then on Home 1 the verdict: below level 14
 * "badlevel" and back to the main dungeon, else by her purity (`leaderVerdict()`). 'ask' while
 * wizard mode's "adjust?" waits. ref: src/quest.c chat_with_leader()
 */
function chatWithLeader(ctx: Ctx, id: EntityId, chat: boolean): Expel | null | 'ask' {
  const m = ctx.state.entities[String(id)]?.c.monster;
  const q = questStatus(ctx.state);
  if (!m?.peaceful || q.pissedOff) return null;
  // Rule 0: cheater checks
  if (uHave(ctx.state, 'questart') && !q.metNemesis) setQuest(ctx, { cheater: true });
  if (q.gotThanks) {
    // Rule 1: back with the Amulet; Rule 2: back before going for it
    if (uHave(ctx.state, 'amulet')) finishQuest(ctx, null);
    else qtPager(ctx, 'posthanks');
    return null;
  }
  if (uHave(ctx.state, 'questart')) {
    // Rule 3: back with the artifact to return it
    const art = inventoryOf(ctx.state, ctx.state.playerId).find((o) =>
      isQuestArtifact(ctx.state, o),
    );
    finishQuest(ctx, art ?? null);
    return null;
  }
  // Rule 4: not got the artifact yet
  if (q.gotQuest) {
    qtPager(ctx, 'encourage');
    return null;
  }
  // Rule 5: not yet acceptable - or is she?
  if (!q.metLeader) {
    qtPager(ctx, 'leader_first');
    setQuest(ctx, { metLeader: true, notReady: 0 });
  } else qtPager(ctx, 'leader_next');
  // the quest leader might have passed through the portal into the regular dungeon; none of the
  // remaining make sense there
  if (!isQstart(ctx.state)) return null;
  if (notCapable(ctx.state)) {
    qtPager(ctx, 'badlevel');
    // exercise(A_WIS, TRUE): no attribute exercise
    return expulsion(ctx, false);
  }
  const pure = isPureTalk(ctx, { leader: id, chat });
  return pure === 'ask' ? 'ask' : leaderVerdict(ctx, pure);
}

/** quest_chat()'s ending: the leader angered by the talk turns hostile, then the trip home. */
function afterLeaderChat(ctx: Ctx, id: EntityId, chat: boolean, expel: Expel | null): void {
  if (chat && questStatus(ctx.state).pissedOff) setmangry(ctx, id, false);
  doExpel(ctx, expel);
}

/**
 * The leader speaks when she comes next to him: an attacked (hostile) leader says "leader_last"
 * once (`pissedOff`) and stops waiting; on Home 1 a calm one talks as if she chatted.
 * ref: src/quest.c leader_speaks()
 */
function leaderSpeaks(ctx: Ctx, id: EntityId): void {
  const m = ctx.state.entities[String(id)]?.c.monster;
  if (!m) return;
  // maybe you attacked leader?
  if (!m.peaceful) {
    // don't end it permanently if the leader gets angry, but only show this once
    if (!questStatus(ctx.state).pissedOff) qtPager(ctx, 'leader_last');
    setQuest(ctx, { pissedOff: true });
    clearWaitMask(ctx, id); // end the inaction
  }
  // the quest leader might have passed through the portal into the regular dungeon; if so,
  // mustn't perform "backwards expulsion"
  if (!isQstart(ctx.state)) return;
  if (questStatus(ctx.state).pissedOff) return;
  const r = chatWithLeader(ctx, id, false);
  if (r !== 'ask') doExpel(ctx, r);
}

/** "discourage" (the nemesis does most of the talking), `metNemesis`. ref: chat_with_nemesis() */
function chatWithNemesis(ctx: Ctx): void {
  qtPager(ctx, 'discourage');
  setQuest(ctx, { metNemesis: true });
}

/**
 * The nemesis near her: out of battle "nemesis_wantsit" while she holds the artifact, else
 * "nemesis_first" (the first goal visit, or never met), "nemesis_next" (visits 2-3),
 * "nemesis_other" (4-6), then a "discourage" one time in five; `madeGoal` counts up to 7 and
 * `metNemesis` is set. In battle, a "discourage" one time in five. ref: src/quest.c
 * nemesis_speaks()
 */
function nemesisSpeaks(ctx: Ctx): void {
  const q = questStatus(ctx.state);
  if (q.inBattle) {
    // he will spit out random maledictions
    if (!ctx.rng.rn2(5)) qtPager(ctx, 'discourage');
    return;
  }
  const made = q.madeGoal ?? 0;
  if (uHave(ctx.state, 'questart')) qtPager(ctx, 'nemesis_wantsit');
  else if (made === 1 || !q.metNemesis) qtPager(ctx, 'nemesis_first');
  else if (made < 4) qtPager(ctx, 'nemesis_next');
  else if (made < 7) qtPager(ctx, 'nemesis_other');
  else if (!ctx.rng.rn2(5)) qtPager(ctx, 'discourage');
  setQuest(ctx, { madeGoal: made < 7 ? made + 1 : made, metNemesis: true });
}

/** "guardtalk_after" once she holds the artifact and the nemesis is dead, else "_before". */
function chatWithGuardian(ctx: Ctx): void {
  const q = questStatus(ctx.state);
  qtPager(
    ctx,
    uHave(ctx.state, 'questart') && q.killedNemesis ? 'guardtalk_after' : 'guardtalk_before',
  );
}

/** The prisoner of the Tourist's and the Wizard's goal levels (m24b). */
const PRISONER = 'nh:prisoner';

/**
 * The waiting prisoner next to her: "<Mon> speaks:" (when seen), "I'm finally free!"; he stops
 * waiting and turns peaceful, her god is pleased (+3 alignment), but the guards get angry.
 * ref: src/quest.c prisoner_speaks()
 */
function prisonerSpeaks(ctx: Ctx, mon: Entity): void {
  const m = mon.c.monster;
  if (mon.def !== PRISONER || !m || !stratWaiting(ctx, mon.id)) return;
  if (canseemon(ctx, mon)) say(ctx, 'quest.prisoner_speaks', { mon: monNam(ctx, mon) });
  say(ctx, 'quest.finally_free');
  clearWaitMask(ctx, mon.id);
  m.peaceful = true;
  adjalign(ctx, 3); // your god is happy...
  angryGuards(ctx, false); // ...but the guards are not
}

/**
 * #chat with a quest being: her own leader (by entity, even polymorphed: domonnoise()'s rule)
 * judges her and may send her home, angered by the talk he turns hostile; the nemesis and her
 * guardians have their lines; another role's leader says nothing (C's "unknown quest
 * character"). ref: src/quest.c quest_chat()
 */
export function questChat(ctx: Ctx, id: EntityId): void {
  const mon = ctx.state.entities[String(id)];
  if (!mon) return;
  if (id === questStatus(ctx.state).leaderId) {
    const r = chatWithLeader(ctx, id, true);
    if (r !== 'ask') afterLeaderChat(ctx, id, true, r);
    return;
  }
  const sound = questMonDef(ctx.state, ctx.defs.monster(mon.def)).sound;
  if (sound === 'nemesis') chatWithNemesis(ctx);
  else if (sound === 'guardian') chatWithGuardian(ctx);
}

/**
 * A quest being's own speech on its move: her leader, the nemesis, the prisoner.
 * ref: src/quest.c quest_talk()
 */
export function questTalk(ctx: Ctx, id: EntityId): void {
  const mon = ctx.state.entities[String(id)];
  if (!mon) return;
  if (id === questStatus(ctx.state).leaderId) {
    leaderSpeaks(ctx, id);
    return;
  }
  const sound = questMonDef(ctx.state, ctx.defs.monster(mon.def)).sound;
  if (sound === 'nemesis') nemesisSpeaks(ctx);
  else if (sound === 'djinni') prisonerSpeaks(ctx, mon);
}

/** ref: src/mon.c monnear() (a grid bug's diagonal excepted: no quest being is one) */
const nextToHero = (ctx: Ctx, mon: Entity): boolean => {
  const p = mon.c.pos;
  const h = getPlayer(ctx.state).c.pos;
  if (!p || !h || p.level !== h.level) return false;
  const d = (p.x - h.x) ** 2 + (p.y - h.y) ** 2;
  return d < 3 && !(d === 2 && mon.def === 'nh:grid_bug');
};

/**
 * The nemesis is in battle while it can move and stands next to her.
 * ref: src/quest.c quest_stat_check()
 */
export function questStatCheck(ctx: Ctx, id: EntityId): void {
  const mon = ctx.state.entities[String(id)];
  const m = mon?.c.monster;
  if (!mon || !m) return;
  if (questMonDef(ctx.state, ctx.defs.monster(mon.def)).sound !== 'nemesis') return;
  const helpless = m.asleep || isFrozen(ctx, id);
  const inBattle = !helpless && nextToHero(ctx, mon);
  if (inBattle !== !!questStatus(ctx.state).inBattle) setQuest(ctx, { inBattle });
}

/**
 * dochug()'s first point: a waiting leader (STRAT_CLOSE) who can move and is awake speaks when
 * she is next to him. ref: src/monmove.c dochug() "give the leaders a chance to speak"
 */
export function questTalkWaiting(ctx: Ctx, id: EntityId): void {
  const mon = ctx.state.entities[String(id)];
  if (!mon?.c.monster || mon.c.monster.asleep || isFrozen(ctx, id)) return;
  if (mstratOf(ctx, id).close && nextToHero(ctx, mon)) questTalk(ctx, id);
}

/**
 * Wizard mode's "adjust?" answered: yes sets her alignment record to 20; the leader's verdict
 * goes on from there (and the talk ends as it would have).
 */
const adjustAction: ActionDef = {
  id: QUEST_ADJUST_ID,
  labelKey: 'quest.wiz.adjust',
  handles: 'mod',
  offer: () => [],
  perform: () => 0,
  answer(ctx, value, raw) {
    const data = raw as unknown as AdjustData | null;
    if (value === true) setU(ctx, { alignRecord: MIN_QUEST_ALIGN });
    const expel = leaderVerdict(ctx, purity(ctx.state));
    if (data) afterLeaderChat(ctx, data.leader, data.chat, expel);
    else doExpel(ctx, expel);
    return 0;
  },
};

export function registerQuest(api: ModApi): void {
  api.defineAction(adjustAction);
  // ref: src/do.c goto_level(): `In_quest(&u.uz) -> onquest()`, else the leader's call
  api.on('levelChange', (ctx, change) => {
    if (change.from === null) return;
    if (inQuest(ctx.state)) onquest(ctx, change);
    else questCall(ctx, change);
  });
}
