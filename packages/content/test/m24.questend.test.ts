// m24 step 6: the nemesis and the artifact. Lord Surtur's death (killed_nemesis, the Bell left
// on the floor, the alignment bonus unless she killed her leader), the Orb of Fate's first touch
// ("gotit" once), its return to the Norn by #chat and thrown at her (caught, acknowledged, handed
// or tossed back; identified; `qcompleted`), with and without the Bell; the Bell or a fake Amulet
// thrown at her; killing the Norn (the penalties, her warriors angry, the Luck base) or a
// warrior; the Knight's doubled damage with her artifact; the quest artifact's other sites.
// ref: src/quest.c nemdead(), leaddead(), artitouch(), finish_quest(); src/mon.c xkilled(),
// m_detach(); src/dothrow.c thitmonst(); src/timeout.c nh_timeout(); src/zap.c bhitm(), zhitm()
import {
  createEngine,
  getLevel,
  getPlayer,
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
import { zhitm } from '../src/buzz';
import { dogfood, APPORT, TABU } from '../src/dog';
import { throwObj } from '../src/dothrow';
import { makemon } from '../src/generation';
import { vanillaMod } from '../src/index';
import { addToInventory, mksobj } from '../src/items';
import { QUEST } from '../src/levelflags';
import { alignLim, setU, uState } from '../src/luck';
import { autokey } from '../src/lock';
import { mongone, monsterDied } from '../src/mondeath';
import { okToQuest, questChat } from '../src/quest';
import { questStatus, setQuest } from '../src/queststate';
import { roleDefId, type RoleKey } from '../src/urole';
import { bhitm } from '../src/zap';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'qe',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'qe:run',
      labelKey: 'qe',
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

const run = (state: GameState, fn: (ctx: Ctx) => void): GameEvent[] => {
  probe.fn = fn;
  return engine.step(state, { type: 'mod', action: 'qe:run' as DefId }).events;
};
/** The quest texts and quest keys of some events, one per text (as m24.questrules's). */
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
const keys = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [e.key] : []));
const fresh = (seed: number, role: RoleKey = 'valkyrie'): GameState => {
  const state = engine.newGame({ seed, character: { role: roleDefId(role) } }).state;
  getPlayer(state).c.hp = { cur: 999, max: 999 };
  return state;
};
const goTo = (state: GameState, dlevel: number): void => {
  run(state, (ctx) => ctx.goToLevel({ dungeon: QUEST, dlevel }, 'random'));
};
const ent = (state: GameState, id: EntityId): Entity => state.entities[String(id)]!;
const here = (state: GameState, def: DefId): Entity | undefined =>
  Object.values(state.entities).find((x) => x.def === def && x.c.pos?.level === getLevel(state).id);
const orbOf = (state: GameState): Entity =>
  Object.values(state.entities).find((x) => x.c.item?.artifact === QUEST_ARTIFACT.valkyrie)!;
/** On the goal level; Lord Surtur. */
const goal = (state: GameState): Entity => {
  goTo(state, state.dungeons.find((x) => x.id === QUEST)!.levels!);
  return here(state, 'nh:lord_surtur')!;
};
const norn = (state: GameState): Entity => ent(state, questStatus(state).leaderId!);
const isFloor = (state: GameState, x: number, y: number): boolean => {
  const l = getLevel(state);
  const occupied = Object.values(state.entities).some(
    (e) => e.c.monster && e.c.pos?.level === l.id && e.c.pos.x === x && e.c.pos.y === y,
  );
  return !occupied && l.palette[l.cells[y * l.width + x]!] === 'nh:floor';
};
const DIRS: Record<string, [number, number]> = {
  n: [0, -1],
  s: [0, 1],
  e: [1, 0],
  w: [-1, 0],
  ne: [1, -1],
  nw: [-1, -1],
  se: [1, 1],
  sw: [-1, 1],
};
/**
 * On Home 1, `dist` squares from the Norn on a free straight line of floor; the direction from
 * her square towards the Norn.
 */
function inLineWithNorn(state: GameState, dist: number): string {
  goTo(state, 1);
  const n = norn(state).c.pos!;
  for (const [d, [dx, dy]] of Object.entries(DIRS)) {
    let ok = true;
    for (let k = 1; k <= dist && ok; k++) ok = isFloor(state, n.x - dx * k, n.y - dy * k);
    if (!ok) continue;
    getPlayer(state).c.pos = { level: getLevel(state).id, x: n.x - dx * dist, y: n.y - dy * dist };
    return d;
  }
  throw new Error('no line to the Norn');
}
/** The Orb into her pack (addinv()); the goal level is made first if need be. */
function takeOrb(state: GameState): GameEvent[] {
  if (!Object.values(state.entities).some((x) => x.c.item?.artifact === QUEST_ARTIFACT.valkyrie)) {
    const back = getLevel(state);
    goal(state);
    run(state, (ctx) => ctx.goToLevel({ dungeon: back.dungeon, dlevel: back.dlevel }, 'random'));
  }
  return run(state, (ctx) => addToInventory(ctx, state.playerId, orbOf(state).id));
}
const give = (state: GameState, def: DefId): Entity => {
  let id: EntityId | null = null;
  run(state, (ctx) => {
    id = mksobj(ctx, ctx.defs.object(def), { carriedBy: state.playerId, init: false });
  });
  return ent(state, id!);
};
const carried = (state: GameState, e: Entity): boolean =>
  state.entities[String(e.id)]?.c.item?.carriedBy === state.playerId;

describe("the nemesis's death", () => {
  test('Lord Surtur killed: killed_nemesis, the Bell on the floor, the alignment bonus', () => {
    const state = fresh(5);
    const s = goal(state);
    const at = { ...s.c.pos! };
    run(state, (ctx) => setU(ctx, { alignRecord: -100 }));
    const ev = run(state, (ctx) => monsterDied(ctx, s.id, true));
    expect(said(ev)).toEqual(['quest.val.killed_nemesis']);
    expect(questStatus(state).killedNemesis).toBe(true);
    const bell = here(state, 'nh:bell_of_opening')!;
    expect(bell.c.pos).toMatchObject(at);
    // the bonus: ALIGNLIM / 4 (and the row's malign), but none once she killed her leader
    const gained = uState(state).alignRecord + 100;
    const other = fresh(5);
    const s2 = goal(other);
    run(other, (ctx) => setU(ctx, { alignRecord: -100 }));
    run(other, (ctx) => setQuest(ctx, { killedLeader: true }));
    run(other, (ctx) => monsterDied(ctx, s2.id, true));
    expect(gained - (uState(other).alignRecord + 100)).toBe(Math.trunc(alignLim(state) / 4));
  });

  test('a nemesis killed by a monster: the same text, once', () => {
    const state = fresh(5);
    const s = goal(state);
    expect(said(run(state, (ctx) => monsterDied(ctx, s.id, false)))).toEqual([
      'quest.val.killed_nemesis',
    ]);
    expect(here(state, 'nh:bell_of_opening')).toBeDefined();
  });
});

describe("the artifact's first touch", () => {
  test('"gotit" the first time the Orb comes into her pack, never again', () => {
    const state = fresh(5);
    goal(state);
    expect(said(takeOrb(state))).toEqual(['quest.val.gotit']);
    expect(questStatus(state).touchedArtifact).toBe(true);
    const orb = orbOf(state);
    orb.c.item!.carriedBy = null;
    orb.c.pos = { ...getPlayer(state).c.pos! };
    expect(said(takeOrb(state))).toEqual([]);
    expect(carried(state, orb)).toBe(true);
  });
});

describe('the return', () => {
  test('by #chat with the Bell: offeredit, qcompleted, the Orb identified; then offeredit2 is posthanks', () => {
    const state = fresh(3);
    takeOrb(state);
    inLineWithNorn(state, 1);
    give(state, 'nh:bell_of_opening');
    run(state, (ctx) => setQuest(ctx, { metNemesis: true, gotQuest: true }));
    const orb = orbOf(state);
    expect(orb.c.item!.known.buc).toBe(false);
    const ev = run(state, (ctx) => questChat(ctx, norn(state).id));
    expect(said(ev)).toEqual(['quest.val.offeredit']);
    const q = questStatus(state);
    expect(q.qcompleted).toBe(true);
    expect(q.gotThanks).toBe(true);
    expect(q.cheater).toBeUndefined();
    expect(orb.c.item!.known).toEqual({ buc: true, spe: true });
    expect(carried(state, orb)).toBe(true);
    expect(said(run(state, (ctx) => questChat(ctx, norn(state).id)))).toEqual([
      'quest.val.posthanks',
    ]);
  });

  test('without the Bell: the no-Bell line; without meeting Lord Surtur: a cheater', () => {
    const state = fresh(3);
    takeOrb(state);
    inLineWithNorn(state, 1);
    const ev = run(state, (ctx) => questChat(ctx, norn(state).id));
    expect(said(ev)).toEqual(['quest.val.offeredit', 'quest.common.quest_complete_no_bell']);
    expect(questStatus(state).cheater).toBe(true);
    expect(questStatus(state).qcompleted).toBe(true);
  });

  test('thrown from afar: caught, acknowledged and tossed back; next to her: handed back', () => {
    const state = fresh(3);
    getPlayer(state).c.attributes!.str = 18;
    takeOrb(state);
    const d = inLineWithNorn(state, 3);
    const orb = orbOf(state);
    const ev = run(state, (ctx) => {
      throwObj(ctx, orb, d as never);
    });
    expect(said(ev)).toEqual([
      'quest.catches',
      'quest.val.offeredit',
      'quest.common.quest_complete_no_bell',
      'quest.tosses_back',
    ]);
    expect(carried(state, orb)).toBe(true);
    expect(questStatus(state).qcompleted).toBe(true);
    expect(orb.c.item!.known).toEqual({ buc: true, spe: true });
    const d2 = inLineWithNorn(state, 1);
    const ev2 = run(state, (ctx) => {
      throwObj(ctx, orbOf(state), d2 as never);
    });
    expect(said(ev2)).toEqual([
      'quest.catches',
      'quest.val.offeredit2',
      'quest.common.quest_complete_no_bell',
      'quest.hands_back',
    ]);
    expect(carried(state, orb)).toBe(true);
  });

  test('the Bell thrown: named and handed back; after the invocation he keeps it', () => {
    const state = fresh(3);
    const d = inLineWithNorn(state, 1);
    const bell = give(state, 'nh:bell_of_opening');
    const ev = run(state, (ctx) => {
      throwObj(ctx, bell, d as never);
    });
    expect(said(ev)).toEqual(['quest.catches', 'quest.found_it', 'quest.hands_back']);
    expect(carried(state, bell)).toBe(true);
    expect(questStatus(state).qcompleted).toBeUndefined();
    expect(bell.c.item!.known.spe).toBe(true);
    // the invocation done: "...part in this is finished.", kept
    run(state, (ctx) => setU(ctx, { invoked: true }));
    const ev2 = run(state, (ctx) => {
      throwObj(ctx, bell, d as never);
    });
    expect(said(ev2)).toEqual(['quest.catches', 'quest.part_finished', 'quest.guard_it']);
    expect(ent(state, bell.id).c.item!.carriedBy).toBe(norn(state).id);
  });

  test('a fake Amulet she does not know for one: "a mere imitation"', () => {
    const state = fresh(3);
    const d = inLineWithNorn(state, 1);
    const fake = give(state, 'nh:fake_amulet_of_yendor');
    fake.c.item!.known.spe = false;
    const ev = run(state, (ctx) => {
      throwObj(ctx, fake, d as never);
    });
    expect(said(ev)).toEqual(['quest.catches', 'quest.mere_imitation', 'quest.hands_back']);
    expect(carried(state, fake)).toBe(true);
    // now known: an ordinary throw (it hits or misses the Norn)
    const ev2 = run(state, (ctx) => {
      throwObj(ctx, fake, d as never);
    });
    expect(said(ev2)).not.toContain('quest.catches');
  });

  test('an angry Norn keeps what she catches', () => {
    const state = fresh(3);
    takeOrb(state);
    const d = inLineWithNorn(state, 1);
    norn(state).c.monster!.peaceful = false;
    const orb = orbOf(state);
    const ev = run(state, (ctx) => {
      throwObj(ctx, orb, d as never);
    });
    expect(said(ev)).toEqual(['quest.catches']);
    expect(ent(state, orb.id).c.item!.carriedBy).toBe(norn(state).id);
    expect(questStatus(state).qcompleted).toBeUndefined();
  });
});

describe('killing the leader or a guardian', () => {
  test('the Norn: "That was a bad idea...", -20 Luck, god anger, her warriors angry', () => {
    const state = fresh(3);
    goTo(state, 1);
    const n = norn(state);
    run(state, (ctx) => setU(ctx, { alignRecord: 10, luck: 0 }));
    const ev = run(state, (ctx) => monsterDied(ctx, n.id, true));
    expect(keys(ev)).toContain('quest.bad_idea');
    const u = uState(state);
    expect(u.luck).toBe(-10);
    expect(u.ugangr).toBe(7);
    // her record + ALIGNLIM / 2 taken (and the row's malign)
    expect(u.alignRecord).toBeLessThanOrEqual(-Math.trunc(alignLim(state) / 2));
    const q = questStatus(state);
    expect(q.killedLeader).toBe(true);
    expect(q.leaderIsDead).toBe(true);
    expect(okToQuest(state)).toBe(true);
    const warriors = Object.values(state.entities).filter(
      (x) => x.def === 'nh:warrior' && x.c.pos?.level === getLevel(state).id,
    );
    expect(warriors.length).toBeGreaterThan(0);
    expect(warriors.every((w) => !w.c.monster!.peaceful)).toBe(true);
    // the Luck base is -4 now: her Luck of -3 drifts down, not up (every 300 turns: god anger)
    run(state, (ctx) => setU(ctx, { luck: -3 }));
    state.turn = 299;
    engine.step(state, { type: 'wait' });
    expect(uState(state).luck).toBe(-4);
  });

  test('after the quest: "That was probably a bad idea..."', () => {
    const state = fresh(3);
    goTo(state, 1);
    run(state, (ctx) => setQuest(ctx, { qcompleted: true }));
    const ev = run(state, (ctx) => monsterDied(ctx, norn(state).id, true));
    expect(keys(ev)).toContain('quest.probably_bad_idea');
  });

  test('a warrior: "That was probably a bad idea...", -4 Luck, god anger 1', () => {
    const state = fresh(3);
    goTo(state, 1);
    const w = here(state, 'nh:warrior')!;
    run(state, (ctx) => setU(ctx, { luck: 0 }));
    const ev = run(state, (ctx) => monsterDied(ctx, w.id, true));
    expect(keys(ev)).toContain('quest.probably_bad_idea');
    // -4 (and the murder of a peaceful human's -2, maybe -1 more)
    expect(uState(state).luck).toBeLessThanOrEqual(-4);
    expect(uState(state).ugangr).toBe(1);
    expect(questStatus(state).killedLeader).toBeUndefined();
  });
});

describe("the quest artifact's other sites", () => {
  /** Damage dealt to a fresh, sturdy target by `fn`, with and without the Mirror in her pack. */
  function knightDamage(fn: (ctx: Ctx, mon: Entity) => void): [number, number] {
    const out: number[] = [];
    for (const withMirror of [false, true]) {
      const state = fresh(7, 'knight');
      // a mirror in both games (the same draws), the Magic Mirror of Merlin in one
      const mirror = give(state, 'nh:mirror');
      if (withMirror) mirror.c.item!.artifact = QUEST_ARTIFACT.knight;
      const h = getPlayer(state).c.pos!;
      let mid: EntityId | null = null;
      run(state, (ctx) => {
        mid = makemon(ctx, ctx.defs.monster('nh:hill_orc'), { x: h.x + 1, y: h.y }, {});
      });
      const m = ent(state, mid!);
      m.c.hp = { cur: 999, max: 999 };
      run(state, (ctx) => fn(ctx, m));
      out.push(999 - ent(state, mid!).c.hp!.cur);
    }
    return [out[0]!, out[1]!];
  }

  test("a Knight's spell ray with the Magic Mirror of Merlin does double damage", () => {
    const [plain, doubled] = knightDamage((ctx, m) => {
      zhitm(ctx, m, 'magic_missile', 2, true, false);
    });
    expect(plain).toBeGreaterThan(0);
    expect(doubled).toBe(2 * plain);
  });

  test("a Knight's wand of striking with the Mirror at least doubles", () => {
    const [plain, doubled] = knightDamage((ctx, m) => {
      const wand = mksobj(ctx, ctx.defs.object('nh:wand_of_striking'), {
        carriedBy: ctx.state.playerId,
        init: false,
      });
      bhitm(ctx, m, { kind: 'wand', item: ctx.state.entities[String(wand)]! }, m.c.pos!);
    });
    expect(doubled).toBeGreaterThanOrEqual(2 * plain);
  });

  test('a monster leaving the game drops her quest artifact', () => {
    const state = fresh(5);
    const s = goal(state);
    const at = { ...s.c.pos! };
    const orb = orbOf(state);
    run(state, (ctx) => {
      addToInventory(ctx, s.id, orb.id);
      mongone(ctx, s.id);
    });
    expect(ent(state, orb.id).c.pos).toMatchObject(at);
    // the Bell he carried stays too
    expect(here(state, 'nh:bell_of_opening')?.c.pos).toMatchObject(at);
  });

  test('pets apport her quest artifact (a cursed one is taboo)', () => {
    const state = fresh(5);
    goal(state);
    const orb = orbOf(state);
    const pet = Object.values(state.entities).find((x) => x.c.monster && x.id !== state.playerId)!;
    let v = 0;
    run(state, (ctx) => {
      v = dogfood(ctx, pet, orb);
    });
    expect(v).toBe(APPORT);
    orb.c.item!.buc = 'cursed';
    run(state, (ctx) => {
      v = dogfood(ctx, pet, orb);
    });
    expect(v).toBe(TABU);
  });

  test("autokey() takes another role's Master Key only when nothing else will do", () => {
    const state = fresh(3);
    const master = give(state, 'nh:skeleton_key');
    master.c.item!.artifact = QUEST_ARTIFACT.rogue;
    let k: Entity | null = null;
    run(state, (ctx) => {
      k = autokey(ctx, true);
    });
    expect(k!.id).toBe(master.id);
    const pick = give(state, 'nh:lock_pick');
    run(state, (ctx) => {
      k = autokey(ctx, true);
    });
    expect(k!.id).toBe(pick.id);
  });
});
