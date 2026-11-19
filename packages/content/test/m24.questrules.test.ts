// m24 step 5: the leader's rules. #chat with the Norn at level 13 (badlevel, back on the main
// dungeon's portal), converted (banished, the Norn angry), with a low record (badalign) and
// worthy (assignquest, then the stairs down); the leader speaking on his own when she comes next
// to him, the angry leader's last words once; the nemesis's lines in order, its battle flag, the
// guardians' talk, the prisoner freed; Home 1's descent gate; wizard mode's "adjust?".
// ref: src/quest.c; src/do.c goto_level(); src/monmove.c dochug(); src/sounds.c domonnoise()
import {
  createEngine,
  getLevel,
  getPlayer,
  inventoryOf,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type GameEvent,
  type GameState,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { QUEST_ARTIFACT } from '../src/artilist';
import { CHAT_ID } from '../src/chat';
import { makemon } from '../src/generation';
import { vanillaMod, wizardMod } from '../src/index';
import { QUEST, inQuest, isQstart, questEntry } from '../src/levelflags';
import { setU, uState, ualignBase } from '../src/luck';
import { mstratOf, setStrat } from '../src/mstate';
import { MAGIC_PORTAL } from '../src/portal';
import {
  doExpel,
  expulsion,
  okToQuest,
  questChat,
  questDescentBlocked,
  questStatCheck,
  questTalk,
} from '../src/quest';
import { questStatus, setQuest } from '../src/queststate';
import { levelTele } from '../src/trap';
import { roleDefId } from '../src/urole';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'qr',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'qr:run',
      labelKey: 'qr',
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
const wiz = createEngine([vanillaMod, wizardMod, probeMod]);
type Engine = typeof engine;

const run = (state: GameState, fn: (ctx: Ctx) => void, e: Engine = engine): GameEvent[] => {
  probe.fn = fn;
  return e.step(state, { type: 'mod', action: 'qr:run' as DefId }).events;
};
/**
 * The quest messages of some events, one per text: `quest.val.leader_first` for its window, its
 * synopsis and its lines alike (`quest.val.encourage` for a drawn line), and quest.c's own keys.
 */
const said = (events: readonly GameEvent[]): string[] => {
  const out: string[] = [];
  const add = (key: string): void => {
    if (!key.startsWith('quest.')) return;
    const base = key.replace(/\.(synopsis|\d+)$/, '');
    if (out[out.length - 1] !== base) out.push(base);
  };
  for (const e of events) {
    if (e.type === 'msg') add(e.key);
    else if (e.type === 'list') for (const m of e.items) add(m.key);
  }
  return out;
};
const fresh = (seed: number, e: Engine = engine): GameState => {
  const state = e.newGame({ seed, character: { role: roleDefId('valkyrie') } }).state;
  getPlayer(state).c.hp = { cur: 999, max: 999 };
  return state;
};
const goTo = (state: GameState, dungeon: DefId, dlevel: number, e: Engine = engine): void => {
  run(state, (ctx) => ctx.goToLevel({ dungeon, dlevel }, 'random'), e);
};
/** Her experience level and alignment record. */
const hero = (state: GameState, level: number, record: number, e: Engine = engine): void => {
  getPlayer(state).c.experience!.level = level;
  run(state, (ctx) => setU(ctx, { alignRecord: record }), e);
};
const ent = (state: GameState, id: EntityId): Entity => state.entities[String(id)]!;
const norn = (state: GameState): Entity => ent(state, questStatus(state).leaderId!);

/** On Home 1, next to the Norn (on a free floor cell beside her); her direction from there. */
function besideNorn(state: GameState, e: Engine = engine): string {
  goTo(state, QUEST, 1, e);
  const n = norn(state);
  const l = getLevel(state);
  const taken = new Set(
    Object.values(state.entities).flatMap((x) =>
      x.c.monster && x.c.pos?.level === l.id && x.id !== state.playerId
        ? [`${x.c.pos.x},${x.c.pos.y}`]
        : [],
    ),
  );
  const dirs: Record<string, [number, number]> = {
    n: [0, -1],
    s: [0, 1],
    e: [1, 0],
    w: [-1, 0],
    ne: [1, -1],
    nw: [-1, -1],
    se: [1, 1],
    sw: [-1, 1],
  };
  for (const [d, [dx, dy]] of Object.entries(dirs)) {
    const x = n.c.pos!.x - dx;
    const y = n.c.pos!.y - dy;
    if (l.palette[l.cells[y * l.width + x]!] !== 'nh:floor' || taken.has(`${x},${y}`)) continue;
    getPlayer(state).c.pos = { level: l.id, x, y };
    return d;
  }
  throw new Error('no room beside the Norn');
}
const chat = (state: GameState, dir: string, e: Engine = engine): GameEvent[] =>
  e.step(state, { type: 'mod', action: CHAT_ID, args: { dir } }).events;
/** She stands on the main dungeon's portal level, on its portal. */
const onMainPortal = (state: GameState): boolean => {
  const e = questEntry(state)!;
  const l = getLevel(state);
  const p = getPlayer(state).c.pos!;
  return (
    l.dungeon === e.dungeon &&
    l.dlevel === e.dlevel &&
    l.traps.some((t) => t.def === MAGIC_PORTAL && t.x === p.x && t.y === p.y)
  );
};

describe("the leader's judgement (#chat)", () => {
  test('below level 14: leader_first, badlevel, and back on the main dungeon portal', () => {
    const state = fresh(3);
    const d = besideNorn(state);
    hero(state, 13, 20);
    expect(said(chat(state, d))).toEqual(['quest.val.leader_first', 'quest.val.badlevel']);
    expect(onMainPortal(state)).toBe(true);
    expect(questStatus(state).metLeader).toBe(true);
    expect(norn(state).c.monster!.peaceful).toBe(true);
    // the second time: leader_next
    const d2 = besideNorn(state);
    expect(said(chat(state, d2))).toEqual(['quest.val.leader_next', 'quest.val.badlevel']);
    expect(onMainPortal(state)).toBe(true);
  });

  test('converted: banished, the Norn angry, sent back (NetHack 5.0 leaves the portals)', () => {
    const state = fresh(3);
    const d = besideNorn(state);
    hero(state, 14, 30);
    run(state, (ctx) => setU(ctx, { alignCur: -ualignBase(state) || -1, alignType: -1 }));
    const record = uState(state).alignRecord;
    // setmangry(): her own leader angered, his warriors too (qst_guardians_respond())
    expect(said(chat(state, d))).toEqual([
      'quest.val.leader_first',
      'quest.common.banished',
      'quest.guardians_angry',
    ]);
    expect(questStatus(state).pissedOff).toBe(true);
    expect(norn(state).c.monster!.peaceful).toBe(false);
    expect(uState(state).alignRecord).toBeLessThan(record); // setmangry()'s -1
    expect(onMainPortal(state)).toBe(true);
    expect(questStatus(state).qexpelled).toBeUndefined();
    // back through the portal: she arrives on the home portal; the Norn has nothing to say
    const d2 = besideNorn(state);
    expect(said(chat(state, d2))).toEqual([]);
  });

  test('a low record: badalign (notReady), then nexttime on the next arrival', () => {
    const state = fresh(3);
    const d = besideNorn(state);
    hero(state, 14, 5);
    expect(said(chat(state, d))).toEqual(['quest.val.leader_first', 'quest.val.badalign']);
    expect(questStatus(state).notReady).toBe(1);
    expect(onMainPortal(state)).toBe(true);
    const e = questEntry(state)!;
    goTo(state, e.dungeon, e.dlevel - 1);
    expect(
      said(run(state, (ctx) => ctx.goToLevel({ dungeon: QUEST, dlevel: 1 }, 'random'))),
    ).toEqual(['quest.val.nexttime']);
  });

  test('worthy: assignquest, then encourage; the stairs down open', () => {
    const state = fresh(3);
    const d = besideNorn(state);
    hero(state, 14, 20);
    expect(okToQuest(state)).toBe(false);
    // before: the mysterious force
    const l = getLevel(state);
    const at = { ...getPlayer(state).c.pos! };
    getPlayer(state).c.pos = { level: l.id, x: l.down!.x, y: l.down!.y };
    const down = engine.step(state, { type: 'mod', action: 'nh:down' as DefId }).events;
    expect(said(down)).toEqual(['quest.descend_blocked']);
    expect(isQstart(state)).toBe(true);
    getPlayer(state).c.pos = at;
    expect(said(chat(state, d))).toEqual(['quest.val.leader_first', 'quest.val.assignquest']);
    expect(questStatus(state).gotQuest).toBe(true);
    expect(isQstart(state)).toBe(true);
    expect(okToQuest(state)).toBe(true);
    expect(said(chat(state, besideNorn(state)))).toEqual(['quest.val.encourage']);
    getPlayer(state).c.pos = { level: l.id, x: l.down!.x, y: l.down!.y };
    engine.step(state, { type: 'mod', action: 'nh:down' as DefId });
    expect(getLevel(state).dungeon).toBe(QUEST);
    expect(getLevel(state).dlevel).toBe(2);
  });

  test('ok_to_quest(): a converted hero loses it; killing the leader opens the way', () => {
    const state = fresh(3);
    run(state, (ctx) => setQuest(ctx, { gotQuest: true }));
    hero(state, 14, 20);
    expect(okToQuest(state)).toBe(true);
    run(state, (ctx) => setU(ctx, { alignRecord: 19 }));
    expect(okToQuest(state)).toBe(false);
    run(state, (ctx) => setQuest(ctx, { killedLeader: true }));
    expect(okToQuest(state)).toBe(true);
  });
});

describe('the leader speaks on his own', () => {
  test('next to the waiting Norn she hears him out without #chat', () => {
    const state = fresh(3);
    besideNorn(state);
    hero(state, 13, 20);
    expect(mstratOf({ state }, norn(state).id).close).toBe(true);
    const heard: string[] = [];
    for (let i = 0; i < 5 && inQuest(state); i++)
      heard.push(...said(engine.step(state, { type: 'wait' }).events));
    expect(heard).toEqual(['quest.val.leader_first', 'quest.val.badlevel']);
    expect(onMainPortal(state)).toBe(true);
  });

  test("an attacked leader's last words once; he stops waiting", () => {
    const state = fresh(3);
    besideNorn(state);
    const n = norn(state);
    n.c.monster!.peaceful = false;
    expect(said(run(state, (ctx) => questTalk(ctx, n.id)))).toEqual(['quest.val.leader_last']);
    expect(questStatus(state).pissedOff).toBe(true);
    expect(mstratOf({ state }, n.id).close).toBeUndefined();
    expect(said(run(state, (ctx) => questTalk(ctx, n.id)))).toEqual([]);
    expect(isQstart(state)).toBe(true);
  });
});

describe('the nemesis, the guardians, the prisoner', () => {
  const goal = (state: GameState): Entity => {
    const n = state.dungeons.find((x) => x.id === QUEST)!.levels!;
    goTo(state, QUEST, n);
    return Object.values(state.entities).find(
      (x) => x.def === 'nh:lord_surtur' && x.c.pos?.level === getLevel(state).id,
    )!;
  };

  test("the nemesis's lines: first, next, other, then rarely; wantsit; in battle", () => {
    const state = fresh(5);
    const s = goal(state); // madeGoal 1
    const talk = (): string[] => said(run(state, (ctx) => questTalk(ctx, s.id)));
    expect(talk()).toEqual(['quest.val.nemesis_first']);
    expect(questStatus(state).metNemesis).toBe(true);
    expect(talk()).toEqual(['quest.val.nemesis_next']); // madeGoal 2
    expect(talk()).toEqual(['quest.val.nemesis_next']); // 3
    expect(talk()).toEqual(['quest.val.nemesis_other']); // 4
    expect(talk()).toEqual(['quest.val.nemesis_other']);
    expect(talk()).toEqual(['quest.val.nemesis_other']); // 6
    expect(questStatus(state).madeGoal).toBe(7);
    const later = new Set<string>();
    for (let i = 0; i < 40; i++) later.add(talk().join());
    expect([...later].sort()).toEqual(['', 'quest.val.discourage']);
    expect(questStatus(state).madeGoal).toBe(7);
    // she holds the Orb: it wants it
    const orb = Object.values(state.entities).find((x) => x.c.item?.artifact === 'nh:orb_of_fate')!;
    orb.c.item!.carriedBy = state.playerId;
    delete orb.c.pos;
    expect(talk()).toEqual(['quest.val.nemesis_wantsit']);
    // in battle only maledictions
    run(state, (ctx) => setQuest(ctx, { inBattle: true }));
    const fight = new Set<string>();
    for (let i = 0; i < 40; i++) fight.add(talk().join());
    expect([...fight].sort()).toEqual(['', 'quest.val.discourage']);
  });

  test('#chat with the nemesis: discourage; quest_stat_check(): in battle when next to her', () => {
    const state = fresh(5);
    const s = goal(state);
    expect(said(run(state, (ctx) => questChat(ctx, s.id)))).toEqual(['quest.val.discourage']);
    expect(questStatus(state).metNemesis).toBe(true);
    const l = getLevel(state);
    const p = s.c.pos!;
    getPlayer(state).c.pos = { level: l.id, x: p.x + 1, y: p.y };
    s.c.monster!.asleep = false;
    run(state, (ctx) => questStatCheck(ctx, s.id));
    expect(questStatus(state).inBattle).toBe(true);
    s.c.monster!.asleep = true;
    run(state, (ctx) => questStatCheck(ctx, s.id));
    expect(questStatus(state).inBattle).toBeUndefined();
  });

  test('a guardian: guardtalk_before, guardtalk_after once the nemesis is dead and she has it', () => {
    const state = fresh(3);
    goTo(state, QUEST, 1);
    const w = Object.values(state.entities).find(
      (x) => x.def === 'nh:warrior' && x.c.pos?.level === getLevel(state).id,
    )!;
    expect(said(run(state, (ctx) => questChat(ctx, w.id)))).toEqual(['quest.val.guardtalk_before']);
    run(state, (ctx) => setQuest(ctx, { killedNemesis: true }));
    expect(said(run(state, (ctx) => questChat(ctx, w.id)))).toEqual(['quest.val.guardtalk_before']);
    // her own quest artifact in her pack (any carried item made the Orb will do for uhave)
    const it = inventoryOf(state, state.playerId)[0]!;
    it.c.item!.artifact = QUEST_ARTIFACT.valkyrie;
    expect(said(run(state, (ctx) => questChat(ctx, w.id)))).toEqual(['quest.val.guardtalk_after']);
  });

  test('the waiting prisoner: "I\'m finally free!", peaceful, +3 alignment, the watch angry', () => {
    const state = fresh(3);
    let pid: EntityId | null = null;
    let wid: EntityId | null = null;
    const h = getPlayer(state).c.pos!;
    run(state, (ctx) => {
      pid = makemon(ctx, ctx.defs.monster('nh:prisoner'), null, {});
      wid = makemon(ctx, ctx.defs.monster('nh:watchman'), null, {});
    });
    const p = ent(state, pid!);
    p.c.monster!.peaceful = false;
    p.c.pos = { level: h.level, x: h.x + 1, y: h.y };
    ent(state, wid!).c.monster!.peaceful = true;
    run(state, (ctx) => setStrat(ctx, pid!, 'waitForU'));
    const before = uState(state).alignRecord;
    const ev = run(state, (ctx) => questTalk(ctx, pid!));
    expect(said(ev)).toEqual(['quest.prisoner_speaks', 'quest.finally_free']);
    expect(p.c.monster!.peaceful).toBe(true);
    expect(mstratOf({ state }, pid!).waitForU).toBeUndefined();
    expect(uState(state).alignRecord).toBe(Math.min(before + 3, 10 + Math.trunc(state.turn / 200)));
    expect(ent(state, wid!).c.monster!.peaceful).toBe(false);
    // not waiting any more: nothing
    expect(said(run(state, (ctx) => questTalk(ctx, pid!)))).toEqual([]);
  });
});

describe("Home 1's gate", () => {
  test('a level teleport deeper is stopped; another dungeon is not', () => {
    const state = fresh(3);
    goTo(state, QUEST, 1);
    let blocked: boolean[] = [];
    run(state, (ctx) => {
      blocked = [
        questDescentBlocked(ctx, { dungeon: QUEST, dlevel: 3 }),
        questDescentBlocked(ctx, questEntry(ctx.state)!),
      ];
    });
    expect(blocked).toEqual([true, false]);
    // a cursed scroll's random level teleport inside the quest: the force, no "materialize"
    const ev = run(state, (ctx) => levelTele(ctx));
    if (!isQstart(state)) throw new Error('left Home 1');
    expect(ev.some((e) => e.type === 'msg' && e.key === 'tele.materialize_level')).toBe(false);
    // from Home 1 with the quest given
    run(state, (ctx) => setQuest(ctx, { gotQuest: true }));
    hero(state, 14, 20);
    run(state, (ctx) => {
      blocked = [questDescentBlocked(ctx, { dungeon: QUEST, dlevel: 3 })];
    });
    expect(blocked).toEqual([false]);
  });
});

describe('the sealing expulsion', () => {
  test('both portals go, qexpelled; the trips arrive at random and the call is silent', () => {
    const state = fresh(3);
    goTo(state, QUEST, 1);
    const home = getLevel(state);
    expect(home.traps.some((t) => t.def === MAGIC_PORTAL)).toBe(true);
    run(state, (ctx) => doExpel(ctx, expulsion(ctx, true)));
    expect(questStatus(state).qexpelled).toBe(true);
    expect(home.traps.some((t) => t.def === MAGIC_PORTAL)).toBe(false);
    const e = questEntry(state)!;
    const main = getLevel(state);
    expect([main.dungeon, main.dlevel]).toEqual([e.dungeon, e.dlevel]);
    expect(main.traps.some((t) => t.def === MAGIC_PORTAL)).toBe(false);
  });
});

describe("wizard mode's adjust?", () => {
  test('a low record: the wizard lines, "adjust?", yes: assignquest', () => {
    const state = fresh(3, wiz);
    const d = besideNorn(state, wiz);
    hero(state, 14, 3, wiz);
    const r = wiz.step(state, { type: 'mod', action: CHAT_ID, args: { dir: d } });
    expect(said(r.events)).toEqual(['quest.val.leader_first', 'quest.wiz.record']);
    expect(r.prompt?.id).toBe('quest-adjust');
    const a = wiz.step(state, { type: 'answer', promptId: 'quest-adjust', value: true });
    expect(said(a.events)).toEqual(['quest.val.assignquest']);
    expect(uState(state).alignRecord).toBe(20);
    expect(questStatus(state).gotQuest).toBe(true);
  });

  test('no: badalign and back to the main dungeon', () => {
    const state = fresh(3, wiz);
    const d = besideNorn(state, wiz);
    hero(state, 14, 3, wiz);
    wiz.step(state, { type: 'mod', action: CHAT_ID, args: { dir: d } });
    const a = wiz.step(state, { type: 'answer', promptId: 'quest-adjust', value: false });
    expect(said(a.events)).toEqual(['quest.val.badalign']);
    expect(onMainPortal(state)).toBe(true);
  });
});
