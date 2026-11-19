// m24 step 4: the quest texts. questParams() for a Valkyrie (the Norn's "the", Lord Surtur's
// proper name and pronoun, the Orb's shortened name), the pager's delivery (a text window and
// its synopsis, plines, a drawn line, the fallbacks), the arrival lines on the home, locate and
// goal levels, and the leader's call on the main dungeon's portal level.
// ref: dat/quest.lua; src/questpgr.c; src/quest.c onquest(), on_start(), on_locate(), on_goal();
// src/do.c goto_level()
import {
  createEngine,
  getLevel,
  getPlayer,
  type Ctx,
  type DefId,
  type GameEvent,
  type GameState,
  type Level,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import { alignGname } from '../src/gods';
import { QUEST, questEntry } from '../src/levelflags';
import { ualignBase } from '../src/luck';
import { comPager, findQuestArtifact, qtPager, questParams } from '../src/questpgr';
import { questStatus, setQuest } from '../src/queststate';
import { QUEST_TEXT } from '../src/questtxt';
import { roleDefId } from '../src/urole';
import { render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'qx',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'qx:run',
      labelKey: 'qx',
      handles: 'mod',
      offer: () => [],
      perform(ctx) {
        probe.fn(ctx);
        return 0;
      },
    });
  },
};
const engine = createEngine([vanillaMod, probeMod]);
/** The quest pager's events of one step: `msg` keys and `list` items' keys (as "list:<key>"). */
const run = (state: GameState, fn: (ctx: Ctx) => void): GameEvent[] => {
  probe.fn = fn;
  return engine.step(state, { type: 'mod', action: 'qx:run' as DefId }).events;
};
const questKeys = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) =>
    e.type === 'msg' && e.key.startsWith('quest.')
      ? [e.key]
      : e.type === 'list' && e.titleKey === 'quest.title'
        ? e.items.map((m) => `list:${m.key}`)
        : [],
  );
const fresh = (seed: number, role = 'valkyrie'): GameState => {
  const state = engine.newGame({ seed, character: { role: roleDefId(role as never) } }).state;
  getPlayer(state).c.hp = { cur: 999, max: 999 };
  return state;
};
const goTo = (state: GameState, dungeon: DefId, dlevel: number): string[] =>
  questKeys(run(state, (ctx) => ctx.goToLevel({ dungeon, dlevel }, 'random')));
const questLevels = (state: GameState): number =>
  state.dungeons.find((d) => d.id === QUEST)!.levels!;

describe('the generated texts', () => {
  test('every role has its 28 messages (4 also goal_alt); common has the call', () => {
    const codes = Object.keys(QUEST_TEXT);
    expect(codes).toEqual([
      'common',
      ...[
        'arc',
        'bar',
        'cav',
        'hea',
        'kni',
        'mon',
        'pri',
        'ran',
        'rog',
        'sam',
        'tou',
        'val',
        'wiz',
      ],
    ]);
    for (const code of codes.slice(1)) {
      const n = Object.keys(QUEST_TEXT[code]!).length;
      expect([28, 29], code).toContain(n);
    }
    expect(QUEST_TEXT['common']!['quest_portal']).toEqual({
      output: 'pline',
      synopsis: false,
      lines: 4,
    });
  });
});

describe('questParams()', () => {
  test("a Valkyrie's: the Norn, Lord Surtur, the Orb of Fate, her god", () => {
    const state = fresh(1);
    let p: ReturnType<typeof questParams> = {};
    run(state, (ctx) => {
      p = questParams(ctx);
    });
    expect(p['ql']).toEqual({ key: 'quest.the', params: { name: '@nh:norn' } });
    expect(p['qn']).toBe('=@nh:lord_surtur'); // M2_PNAME: no "the"
    expect(p['qo']).toBe('=the Orb of Fate');
    expect(p['qO']).toBe('=the Orb');
    expect(p['qn_he']).toBe('@pronoun.he');
    expect(p['ql_he']).toBe('@pronoun.she');
    expect(p['qo_he']).toBe('@pronoun.it');
    expect(p['qH']).toBe('@quest.home.valkyrie');
    expect(p['qi']).toBe('@quest.intermed.valkyrie');
    expect(p['qg']).toBe('@nh:warrior');
    expect(p['qd']).toBe(alignGname(state, ualignBase(state)));
    expect(p['qD']).toBe(alignGname(state, 1));
    const r = (key: string): string => render({ key, params: p });
    expect(r('quest.val.badlevel.synopsis')).toBe('[Come back when you are a Warrior.]');
    expect(r('quest.val.goal_next')).toBe("Once again, you stand in sight of Lord Surtur's lair.");
    expect(r('quest.val.guardtalk_before.3')).toBe(
      '"The Norn weakens.  Without the Orb of Fate, her foresight is dim."',
    );
    expect(r('quest.val.killed_nemesis.synopsis')).toBe('[Lord Surtur dies.]');
    expect(r('quest.common.quest_portal.1')).toBe(
      'You receive a faint telepathic message from the Norn:',
    );
  });

  test("a Monk's Eyes are plural (they); she senses while blind", () => {
    const state = fresh(1, 'monk');
    let p: ReturnType<typeof questParams> = {};
    run(state, (ctx) => {
      p = questParams(ctx);
    });
    expect(p['qo']).toBe('=the Eyes of the Overworld');
    expect(p['qO']).toBe('=the Eyes');
    expect([p['qo_he'], p['qo_him'], p['qo_his']]).toEqual([
      '@pronoun.they',
      '@pronoun.them',
      '@pronoun.their',
    ]);
    expect(p['qx']).toBe('@quest.see');
  });
});

describe('the pager', () => {
  test('a text window then its synopsis; plines; one drawn line; the fallbacks', () => {
    const state = fresh(2);
    const keys = (fn: (ctx: Ctx) => void): string[] => questKeys(run(state, fn));
    expect(keys((ctx) => qtPager(ctx, 'firsttime'))).toEqual([
      'list:quest.val.firsttime',
      'quest.val.firsttime.synopsis',
    ]);
    expect(keys((ctx) => comPager(ctx, 'quest_portal'))).toEqual(
      [1, 2, 3, 4].map((n) => `quest.common.quest_portal.${n}`),
    );
    const drawn = keys((ctx) => qtPager(ctx, 'encourage'));
    expect(drawn).toHaveLength(1);
    expect(drawn[0]).toMatch(/^quest\.val\.encourage\.([1-9]|10)$/);
    // the Valkyrie has no goal_alt: msg_fallbacks gives her goal_next; an Archeologist has one
    expect(keys((ctx) => qtPager(ctx, 'goal_alt'))).toEqual(['quest.val.goal_next']);
    // a message her role lacks comes from common
    expect(keys((ctx) => qtPager(ctx, 'banished'))).toEqual([
      'list:quest.common.banished',
      'quest.common.banished.synopsis',
    ]);
    const arc = fresh(2, 'archeologist');
    expect(questKeys(run(arc, (ctx) => qtPager(ctx, 'goal_alt')))).toEqual(['quest.arc.goal_alt']);
    // the list event's item carries the params
    const ev = run(state, (ctx) => qtPager(ctx, 'gotit')).find((e) => e.type === 'list');
    expect(
      ev?.type === 'list' && render(ev.items[0]!).startsWith('As you pick up the Orb of Fate,'),
    ).toBe(true);
  });
});

describe('the arrival lines', () => {
  test('the home level: firsttime, then nexttime or othertime from outside or above', () => {
    const state = fresh(3);
    expect(goTo(state, QUEST, 1)).toEqual([
      'list:quest.val.firsttime',
      'quest.val.firsttime.synopsis',
    ]);
    expect(questStatus(state).firstStart).toBe(true);
    expect(goTo(state, 'nh:main', 2)).toEqual([]);
    expect(goTo(state, QUEST, 1)).toEqual(['quest.val.nexttime']);
    goTo(state, QUEST, 2);
    expect(goTo(state, QUEST, 1)).toEqual([]); // from below: nothing
    run(state, (ctx) => setQuest(ctx, { notReady: 3 }));
    goTo(state, 'nh:main', 2);
    // two lines: a window and the bracketed text as its synopsis (com_pager_core())
    expect(goTo(state, QUEST, 1)).toEqual([
      'list:quest.val.othertime',
      'quest.val.othertime.synopsis',
    ]);
    run(state, (ctx) => setQuest(ctx, { qcompleted: true }));
    goTo(state, 'nh:main', 2);
    expect(goTo(state, QUEST, 1)).toEqual([]);
  });

  test('the locate level: only from above; the first arrival from below says nothing', () => {
    const state = fresh(3);
    goTo(state, QUEST, 2);
    expect(goTo(state, QUEST, 3)).toEqual([
      'list:quest.val.locate_first',
      'quest.val.locate_first.synopsis',
    ]);
    goTo(state, QUEST, 4);
    expect(goTo(state, QUEST, 3)).toEqual([]);
    goTo(state, QUEST, 2);
    expect(goTo(state, QUEST, 3)).toEqual(['quest.val.locate_next']);
    run(state, (ctx) => setQuest(ctx, { killedNemesis: true }));
    goTo(state, QUEST, 2);
    expect(goTo(state, QUEST, 3)).toEqual([]);

    const below = fresh(4);
    goTo(below, QUEST, 4);
    expect(goTo(below, QUEST, 3)).toEqual([]);
    expect(questStatus(below).firstLocate).toBe(true);
    goTo(below, QUEST, 2);
    expect(goTo(below, QUEST, 3)).toEqual(['quest.val.locate_next']);
  });

  test('the goal level: goal_first, then goal_next; madeGoal counts to 7', () => {
    const state = fresh(5);
    const goal = questLevels(state);
    goTo(state, QUEST, goal - 1);
    expect(goTo(state, QUEST, goal)).toEqual([
      'list:quest.val.goal_first',
      'quest.val.goal_first.synopsis',
    ]);
    for (let n = 2; n <= 9; n++) {
      goTo(state, QUEST, goal - 1);
      expect(goTo(state, QUEST, goal)).toEqual(['quest.val.goal_next']);
      expect(questStatus(state).madeGoal).toBe(Math.min(n, 7));
    }
    run(state, (ctx) => setQuest(ctx, { killedNemesis: true }));
    goTo(state, QUEST, goal - 1);
    expect(goTo(state, QUEST, goal)).toEqual([]);
  });

  test('goal_alt when the artifact is gone from the level (the Orb of Detection taken away)', () => {
    const state = fresh(5, 'archeologist');
    const goal = questLevels(state);
    goTo(state, QUEST, goal);
    expect(questKeys(run(state, () => undefined))).toEqual([]);
    // step 7: the Archeologist's goal now has the Orb; take it off the level
    run(state, (ctx) => {
      for (const e of Object.values(ctx.state.entities))
        if (e.c.item?.artifact === 'nh:orb_of_detection') ctx.remove(e.id);
    });
    goTo(state, QUEST, goal - 1);
    expect(goTo(state, QUEST, goal)).toEqual(['quest.arc.goal_alt']);
  });

  test('find_quest_artifact(): the Orb on the goal level, not once she carries it', () => {
    const state = fresh(5);
    const goal = questLevels(state);
    goTo(state, QUEST, goal);
    const level: Level = getLevel(state);
    const orb = findQuestArtifact(state, level, ['floor', 'minvent']);
    expect(orb?.def).toBe('nh:crystal_ball');
    const it = orb!.c.item!;
    it.carriedBy = state.playerId;
    delete orb!.c.pos;
    expect(findQuestArtifact(state, level, ['floor', 'minvent'])).toBeNull();
    expect(findQuestArtifact(state, level, ['invent'])?.id).toBe(orb!.id);
  });
});

describe("the leader's call on the portal level", () => {
  test('quest_portal once, then quest_portal_again; not from the quest or once expelled', () => {
    const state = fresh(3);
    const e = questEntry(state)!;
    expect(goTo(state, e.dungeon, e.dlevel)).toEqual(
      [1, 2, 3, 4].map((n) => `quest.common.quest_portal.${n}`),
    );
    expect(questStatus(state).qcalled).toBe(true);
    goTo(state, e.dungeon, e.dlevel - 1);
    expect(goTo(state, e.dungeon, e.dlevel)).toEqual(['quest.common.quest_portal_again']);
    goTo(state, QUEST, 2);
    expect(goTo(state, e.dungeon, e.dlevel)).toEqual([]); // back from the quest
    for (const patch of [
      { qexpelled: true },
      { leaderIsDead: true },
      { qcompleted: true },
    ] as const) {
      const s = fresh(3);
      run(s, (ctx) => setQuest(ctx, patch));
      expect(goTo(s, e.dungeon, e.dlevel)).toEqual([]);
    }
  });

  test('no call for a role whose quest levels are not ported (no portal until m24b)', () => {
    const state = fresh(3, 'samurai');
    const e = questEntry(state)!;
    expect(goTo(state, e.dungeon, e.dlevel)).toEqual([]);
    expect(questStatus(state).qcalled).toBeUndefined();
  });
});
