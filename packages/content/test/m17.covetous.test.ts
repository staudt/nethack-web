// m17 step 5: covetous monsters, the princes' bribes, the liches. The strategy bits makemon()
// sets (Medusa and the other M3_WAITFORU kinds wait until they see the hero or are hurt), the
// covetous tactics (healing on the stairs, harassing), the covetous bypass of no-teleport levels,
// Asmodeus and Baalzebub born peaceful and invisible with their "Demonic Blackmail!", the master
// lich and arch-lich rows and gear, and the high mage spells (destroy armor, summon nasties, touch
// of death). Outcomes are found by burning RNG draws (a seed search) with pinned monsters.
// ref: src/wizard.c strategy(), tactics(), choose_stairs(), nasty(), pick_nasty(), aggravate();
// src/monmove.c dochug(); src/makemon.c makemon(), m_initinv(); src/minion.c demon_talk(),
// bribe(); src/mcastu.c mcast_destroy_armor(), mcast_summon_mons(), mcast_death_touch(),
// touch_of_death(); src/teleport.c noteleport_level(), rloc_to_core()
import {
  createEngine,
  getLevel,
  getPlayer,
  inventoryOf,
  sortedIds,
  type Ctx,
  type DefId,
  type Entity,
  type GameState,
  type Json,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { makemon, vanillaMod } from '../src/index';
import { chooseStairs, tactics } from '../src/covetous';
import { answerBribe, demonTalk, demonicBlackmail } from '../src/demontalk';
import { dochug } from '../src/monmove';
import { mcastSpell } from '../src/mcastu';
import { pickNasty } from '../src/nasty';
import { tamedog } from '../src/dog';
import { setmangry } from '../src/peaceful';
import { aggravate, mspecUsed, mstratOf, setStrat } from '../src/mstate';
import { monInvisible } from '../src/invis';
import { isCovetous } from '../src/mondata';
import { moneyCnt } from '../src/money';
import { polymon } from '../src/polyself';
import { P, setIntrinsic } from '../src/props';
import { noteleportLevel } from '../src/teleport';
import { rlocTo } from '../src/trap';
import { addMon } from './helpers';
import { defs, levelSetup, render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'cov-probe',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'cov-probe:run',
      labelKey: 'cov-probe',
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

/** Runs `fn` with a real Ctx (no time passes) and returns the message text. */
function run(state: GameState, fn: (ctx: Ctx) => void): string[] {
  probe.fn = fn;
  const r = engine.step(state, { type: 'mod', action: 'cov-probe:run' });
  return r.events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );
}

/** Every outcome of `fn` over the first `tries` RNG offsets, each on a copy of `state`. */
function outcomes(
  state: GameState,
  fn: (ctx: Ctx) => void,
  tries = 200,
): { k: number; state: GameState; text: string[] }[] {
  const out = [];
  for (let k = 0; k < tries; k++) {
    const st = structuredClone(state);
    const text = run(st, (ctx) => {
      for (let i = 0; i < k; i++) ctx.rng.rn2(2);
      fn(ctx);
    });
    out.push({ k, state: st, text });
  }
  return out;
}

const ROOM = [
  '..............................',
  '..............................',
  '..............................',
  '...@..........................',
  '..............................',
  '..............................',
];

/** A lit room, the hero at (3,3) with 500 HP and a pinned `def` at (x,y). */
function setup(def: string, x = 4, y = 3, rows = ROOM) {
  const s = levelSetup(rows);
  const id = addMon(s.state, def, x, y);
  const e = s.state.entities[String(id)]!;
  e.c.hp = { cur: 200, max: 200 };
  e.c.actor!.speed = 0;
  e.c.monster!.level = Math.min(50, defs.monster(def as DefId).level);
  s.step({ type: 'wait' }); // see the level
  return { s, id, e };
}

const monsOn = (st: GameState): Entity[] =>
  sortedIds(st)
    .map((i) => st.entities[String(i)]!)
    .filter((e) => e.c.monster && e.id !== st.playerId && e.c.pos);

const made = (st: GameState, def: string, x: number, y: number, o = {}): Entity => {
  let id: number | null = null;
  run(st, (ctx) => {
    id = makemon(ctx, defs.monster(def as DefId), { x, y }, o);
  });
  return st.entities[String(id)]!;
};

describe('the rows', () => {
  test("master lich and arch-lich follow the demilich in C's order and covet the Book", () => {
    const ids: string[] = defs.monsters.map((m) => m.id);
    const at = (id: string): number => ids.indexOf(id);
    expect(at('nh:demilich')).toBeLessThan(at('nh:master_lich'));
    expect(at('nh:master_lich') + 1).toBe(at('nh:arch_lich'));
    for (const id of ['nh:master_lich', 'nh:arch_lich']) {
      expect(defs.monster(id as DefId).flags).toContain('wantsbook');
      expect(isCovetous(defs.monster(id as DefId))).toBe(true);
    }
    expect(isCovetous(defs.monster('nh:lich' as DefId))).toBe(false);
    expect(render({ key: 'tele.mon_appears', params: { mon: '@nh:arch_lich', where: '' } })).toBe(
      'The arch-lich appears!',
    );
  });

  test('an arch-lich is sometimes made with an athame or quarterstaff of at least +1', () => {
    const { s } = setup('nh:newt', 20, 0);
    const armed = outcomes(
      s.state,
      (ctx) => {
        makemon(ctx, defs.monster('nh:arch_lich' as DefId), { x: 10, y: 3 });
      },
      40,
    ).flatMap((o) => {
      const lich = monsOn(o.state).find((e) => e.def === 'nh:arch_lich')!;
      return inventoryOf(o.state, lich.id).filter(
        (w) => w.def === 'nh:athame' || w.def === 'nh:quarterstaff',
      );
    });
    expect(armed.length).toBeGreaterThan(0);
    for (const w of armed) expect(w.c.item!.spe).toBeGreaterThanOrEqual(1);
  });
});

describe('strategies from makemon()', () => {
  test('Medusa waits for the hero; covetous kinds announce their arrival; MM_NOWAIT sets none', () => {
    const { s } = setup('nh:newt', 20, 0);
    expect(mstratOf({ state: s.state }, made(s.state, 'nh:medusa', 10, 1).id)).toEqual({
      waitForU: true,
      appearMsg: true,
    });
    expect(mstratOf({ state: s.state }, made(s.state, 'nh:arch_lich', 12, 1).id)).toEqual({
      appearMsg: true,
    });
    expect(mstratOf({ state: s.state }, made(s.state, 'nh:jackal', 14, 1).id)).toEqual({});
    const quiet = made(s.state, 'nh:medusa', 16, 1, { noWait: true });
    expect(mstratOf({ state: s.state }, quiet.id)).toEqual({});
  });

  test('Asmodeus and Baalzebub are born peaceful and invisible; Orcus is not', () => {
    const { s } = setup('nh:newt', 20, 0);
    for (const id of ['nh:asmodeus', 'nh:baalzebub']) {
      const p = made(s.state, id, 10, 1);
      expect(p.c.monster!.peaceful).toBe(true);
      expect(monInvisible({ state: s.state }, p)).toBe(true);
      delete s.state.entities[String(p.id)]; // out of the way
    }
    const o = made(s.state, 'nh:orcus', 10, 1);
    expect(o.c.monster!.peaceful).toBe(false);
    expect(monInvisible({ state: s.state }, o)).toBe(false);
  });
});

describe('waiting', () => {
  // the hero at (3,3); a stone wall from column 8 to 9 hides the east part
  const WALLED = [
    '........  ..........',
    '........  ..........',
    '........  ..........',
    '...@....  ..........',
    '........  ..........',
    '........  ..........',
  ];

  test('Medusa does nothing out of sight, and stops waiting when she sees the (blind) hero', () => {
    const s = levelSetup(WALLED);
    setIntrinsic(getPlayer(s.state), P.BLINDED, true); // her gaze is harmless
    const m = made(s.state, 'nh:medusa', 15, 3);
    m.c.monster!.asleep = false;
    for (let i = 0; i < 6; i++) s.step({ type: 'wait' });
    expect(m.c.pos).toMatchObject({ x: 15, y: 3 });
    expect(mstratOf({ state: s.state }, m.id).waitForU).toBe(true);
    // she comes into the hero's line of sight
    getPlayer(s.state).c.pos!.x = 12;
    run(s.state, (ctx) => dochug(ctx, m.id));
    expect(mstratOf({ state: s.state }, m.id).waitForU).toBeUndefined();
  });

  test('a hurt waiting monster stops waiting; anger, aggravation and paralysis end the wait', () => {
    const s = levelSetup(WALLED);
    const ids = [15, 16, 17, 18].map((x) => {
      const id = addMon(s.state, 'nh:jackal', x, 3);
      run(s.state, (ctx) => setStrat(ctx, id, 'waitForU', 'appearMsg'));
      return id;
    });
    const [a, b, c, d] = ids as [number, number, number, number];
    s.state.entities[String(a)]!.c.hp = { cur: 2, max: 5 };
    run(s.state, (ctx) => dochug(ctx, a));
    expect(mstratOf({ state: s.state }, a).waitForU).toBeUndefined();
    run(s.state, (ctx) => setmangry(ctx, b, false));
    expect(mstratOf({ state: s.state }, b).waitForU).toBeUndefined();
    run(s.state, (ctx) => aggravate(ctx));
    expect(mstratOf({ state: s.state }, c)).toEqual({});
    run(s.state, (ctx) => setStrat(ctx, d, 'waitForU'));
    expect(mstratOf({ state: s.state }, d).waitForU).toBe(true);
  });

  test('a monster with STRAT_APPEARMSG "suddenly appears" once, even unseen moving', () => {
    const { s, id } = setup('nh:jackal', 15, 0);
    run(s.state, (ctx) => setStrat(ctx, id, 'appearMsg'));
    const e = s.state.entities[String(id)]!;
    const t = run(s.state, (ctx) => rlocTo(ctx, e, 4, 3, false));
    expect(t).toEqual(['The jackal vanishes and reappears next to you.']);
    expect(mstratOf({ state: s.state }, id)).toEqual({});
    // unseen before, it suddenly appears
    e.c.pos = { level: 'dlvl1', x: 25, y: 5 };
    const s2 = structuredClone(s.state);
    const e2 = s2.entities[String(id)]!;
    run(s2, (ctx) => setStrat(ctx, id, 'appearMsg'));
    s2.visible = s2.visible.map((v, i) => (i === 5 * 30 + 25 ? 0 : v));
    expect(run(s2, (ctx) => rlocTo(ctx, e2, 5, 3, false))).toEqual([
      'A jackal suddenly appears close by!',
    ]);
  });
});

describe('covetous tactics', () => {
  /** The level gets up stairs at (28,0) and down stairs at (29,5), far from the hero. */
  function stairs(st: GameState) {
    const level = getLevel(st);
    level.up = { x: 28, y: 0 };
    level.down = { x: 29, y: 5 };
    return level;
  }

  test('choose_stairs(): down stairs forward, up stairs back, the other ones when missing', () => {
    const { s } = setup('nh:newt', 20, 0);
    const level = stairs(s.state);
    const ctx = { state: s.state, defs };
    expect(chooseStairs(ctx, level.id, true)).toEqual({ x: 29, y: 5 });
    expect(chooseStairs(ctx, level.id, false)).toEqual({ x: 28, y: 0 });
    level.down = null;
    expect(chooseStairs(ctx, level.id, true)).toEqual({ x: 28, y: 0 });
    level.branch = { pos: { x: 10, y: 0 }, to: { dungeon: 'nh:mines', dlevel: 1 }, dir: 'down' };
    expect(chooseStairs(ctx, level.id, true)).toEqual({ x: 10, y: 0 });
  });

  test('a badly hurt arch-lich holes up on its stairs and heals rnd(8) out of her sight', () => {
    const { s, id, e } = setup('nh:arch_lich', 20, 1);
    stairs(s.state);
    e.c.hp = { cur: 10, max: 100 };
    run(s.state, (ctx) => void tactics(ctx, id));
    const want = id % 2 === 1 ? { x: 29, y: 5 } : { x: 28, y: 0 };
    expect(e.c.pos).toMatchObject(want);
    expect(e.c.hp.cur).toBeGreaterThanOrEqual(11);
    expect(e.c.hp.cur).toBeLessThanOrEqual(18);
    expect(mstratOf({ state: s.state }, id).strat).toBe('heal');
  });

  test('near the hero it does not heal; at full strength it harasses her, 1 time in 5', () => {
    const { s, id, e } = setup('nh:arch_lich', 20, 1);
    stairs(s.state);
    getLevel(s.state).up = { x: 5, y: 3 };
    getLevel(s.state).down = { x: 6, y: 3 };
    e.c.hp = { cur: 10, max: 100 };
    run(s.state, (ctx) => void tactics(ctx, id));
    expect(e.c.hp.cur).toBe(10);
    // full strength: no strategy, now and then next to her
    const s2 = setup('nh:arch_lich', 25, 1);
    const res = outcomes(s2.s.state, (ctx) => void tactics(ctx, s2.id), 40);
    const next = res.filter((o) => {
      const p = o.state.entities[String(s2.id)]!.c.pos!;
      return Math.max(Math.abs(p.x - 3), Math.abs(p.y - 3)) === 1;
    });
    expect(next.length).toBeGreaterThan(0);
    expect(next.length).toBeLessThan(res.length);
    expect(next[0]!.text).toEqual(['The arch-lich vanishes and reappears next to you.']);
    expect(mstratOf({ state: next[0]!.state }, s2.id).strat).toBeUndefined();
  });

  test('covetous monsters teleport on no-teleport levels; others (and the hero) do not', () => {
    const { s, id } = setup('nh:master_lich', 20, 1);
    const j = addMon(s.state, 'nh:jackal', 22, 1);
    const level = getLevel(s.state);
    level.def = 'nh:valley' as DefId;
    const ctx = { state: s.state, defs };
    expect(noteleportLevel(ctx, level, id)).toBe(false);
    expect(noteleportLevel(ctx, level, j)).toBe(true);
    expect(noteleportLevel(ctx, level, s.state.playerId)).toBe(true);
  });

  test('covetous monsters cannot be tamed', () => {
    const { s, id } = setup('nh:master_lich', 20, 1);
    let tamed = true;
    run(s.state, (ctx) => {
      tamed = tamedog(ctx, id, null, false, () => undefined);
    });
    expect(tamed).toBe(false);
    expect(s.state.entities[String(id)]!.c.monster!.tame).toBeUndefined();
  });
});

describe('Demonic Blackmail!', () => {
  /** Asmodeus made peaceful and invisible next to the hero, who carries `gold`. */
  function prince(gold: number) {
    const { s } = setup('nh:newt', 20, 0);
    const a = made(s.state, 'nh:asmodeus', 4, 3);
    a.c.actor!.speed = 0;
    if (gold > 0) s.carry('nh:gold_piece', { quantity: gold });
    return { s, a };
  }

  test('he appears, demands gold, and vanishes laughing when paid', () => {
    const { s, a } = prince(500);
    let quiet = false;
    const t = run(s.state, (ctx) => {
      quiet = demonTalk(ctx, a.id);
    });
    expect(quiet).toBe(true);
    expect(t[0]).toBe('Asmodeus appears before you.');
    const m = /^Asmodeus demands (\d+) zorkmids? for safe passage\.$/.exec(t[1] ?? '');
    expect(m).not.toBeNull();
    const demand = Number(m![1]);
    // her gold times 21..100%, not halved (she is not lawful)
    expect(demand).toBeGreaterThanOrEqual(105);
    expect(demand).toBeLessThanOrEqual(500);
    expect(s.state.pendingPrompt?.prompt.id).toBe('demon-bribe');
    const r = s.step({ type: 'answer', promptId: 'demon-bribe', value: String(demand) });
    expect(s.text(r).slice(0, 2)).toEqual([
      `You give Asmodeus ${demand} zorkmids.`,
      'Asmodeus vanishes, laughing about cowardly mortals.',
    ]);
    expect(s.state.entities[String(a.id)]).toBeUndefined();
    expect(moneyCnt({ state: s.state, defs }, s.state.playerId)).toBe(500 - demand);
  });

  test('too little: he scowls and vanishes or gets angry; nothing: he gets angry', () => {
    const { s, a } = prince(500);
    run(s.state, (ctx) => void demonTalk(ctx, a.id));
    const data = s.state.pendingPrompt!.data as { demand: number };
    s.state.pendingPrompt = null;
    const offer = Math.max(1, data.demand - 30);
    const res = outcomes(
      s.state,
      (ctx) => void answerBribe(ctx, String(offer), data as unknown as Json),
      60,
    );
    const scowled = res.filter((o) =>
      o.text.includes('Asmodeus scowls at you menacingly, then vanishes.'),
    );
    const angry = res.filter((o) => o.text.includes('Asmodeus gets angry...'));
    expect(scowled.length + angry.length).toBe(res.length);
    expect(scowled.length).toBeGreaterThan(0);
    expect(angry.length).toBeGreaterThan(0);
    for (const o of scowled) expect(o.state.entities[String(a.id)]).toBeUndefined();
    for (const o of angry) expect(o.state.entities[String(a.id)]!.c.monster!.peaceful).toBe(false);
    const refused = structuredClone(s.state);
    expect(run(refused, (ctx) => void answerBribe(ctx, '0', data as unknown as Json))).toEqual([
      'You refuse.',
      'Asmodeus gets angry...',
    ]);
  });

  test('a hero without gold angers him at once; a demon form is wished good hunting', () => {
    const p = prince(0);
    let quiet = true;
    run(p.s.state, (ctx) => {
      quiet = demonTalk(ctx, p.a.id);
    });
    expect(quiet).toBe(false);
    expect(p.a.c.monster!.peaceful).toBe(false);
    expect(p.s.state.pendingPrompt).toBeNull();
    const q = prince(100);
    for (const o of inventoryOf(q.s.state, q.s.state.playerId))
      if (o.def !== 'nh:gold_piece') delete q.s.state.entities[String(o.id)];
    run(q.s.state, (ctx) => void polymon(ctx, 'nh:horned_devil' as DefId, false));
    const t = run(q.s.state, (ctx) => void demonTalk(ctx, q.a.id));
    expect(t).toContain('Asmodeus says, "Good hunting, Sister."');
    expect(q.s.state.pendingPrompt).toBeNull();
    expect(q.a.c.monster!.peaceful).toBe(true);
  });

  test('guessing her square wrong he whispers at thin air and gets angry', () => {
    const { s, a } = prince(100);
    const t = run(s.state, (ctx) => void demonicBlackmail(ctx, a.id, { x: 3, y: 4 }, true));
    // (still invisible when he whispers: "It")
    expect(t).toEqual(['It whispers at thin air.', 'Asmodeus gets angry!']);
    expect(a.c.monster!.peaceful).toBe(false);
    expect(monInvisible({ state: s.state }, a)).toBe(false);
  });

  test('coming near her on his own move, and #chat, ask for the bribe', () => {
    const { s, a } = prince(300);
    a.c.actor!.speed = 12;
    a.c.actor!.energy = 12;
    s.step({ type: 'wait' });
    expect(s.state.pendingPrompt?.prompt.id).toBe('demon-bribe');
    const c = prince(300);
    const t = run(c.s.state, (ctx) => {
      const r = engine.registry.actions.find((x) => x.id === ('nh:chat' as DefId));
      r?.perform(ctx, { type: 'mod', action: 'nh:chat' as DefId, args: { dir: 'e' } });
    });
    expect(t.some((x) => x.includes('for safe passage.'))).toBe(true);
    expect(c.s.state.pendingPrompt?.prompt.id).toBe('demon-bribe');
  });
});

describe('the high mage spells', () => {
  test('destroy armor: her worn armor suffers, else her skin itches; magic resistance shields her', () => {
    const { s, id, e } = setup('nh:arch_lich');
    const worn = inventoryOf(s.state, s.state.playerId).filter((o) => o.c.item?.equipped);
    expect(worn.length).toBeGreaterThan(0);
    const res = outcomes(
      s.state,
      (ctx) => mcastSpell(ctx, e, 1, 'destry_armr', { x: 3, y: 3 }),
      30,
    );
    expect(res.some((o) => !o.text.includes('Your skin itches.') && o.text.length > 0)).toBe(true);
    const bare = structuredClone(s.state);
    for (const o of inventoryOf(bare, bare.playerId))
      if (o.c.item?.equipped && o.c.item.equipped !== 'weapon') delete bare.entities[String(o.id)];
    const be = bare.entities[String(id)]!;
    const left = inventoryOf(bare, bare.playerId).filter(
      (o) => o.c.item?.equipped && defs.object(o.def).class === 'armor',
    );
    expect(left.length).toBe(0);
    expect(run(bare, (ctx) => mcastSpell(ctx, be, 1, 'destry_armr', { x: 3, y: 3 }))).toEqual([
      'Your skin itches.',
    ]);
    setIntrinsic(getPlayer(s.state), P.ANTIMAGIC, true);
    expect(run(s.state, (ctx) => mcastSpell(ctx, e, 1, 'destry_armr', { x: 3, y: 3 }))).toEqual([
      'A field of force surrounds you!',
    ]);
  });

  test('summon nasties: hostile, awake nasties around her, their spells delayed', () => {
    const { s, e } = setup('nh:arch_lich', 6, 3);
    const before = monsOn(s.state).length;
    const res = outcomes(
      s.state,
      (ctx) => mcastSpell(ctx, e, 0, 'summon_mons', { x: 3, y: 3 }),
      20,
    );
    const got = res.filter((o) => monsOn(o.state).length > before);
    expect(got.length).toBeGreaterThan(0);
    for (const o of got) {
      const n = monsOn(o.state).length - before;
      expect(o.text).toEqual([
        n === 1 ? 'A monster appears from nowhere!' : 'Monsters appear from nowhere!',
      ]);
      for (const m of monsOn(o.state).filter((x) => x.id !== e.id)) {
        expect(m.c.monster!.peaceful).toBe(false);
        expect(m.c.monster!.asleep).toBe(false);
      }
    }
    const direct = got.flatMap((o) =>
      monsOn(o.state).filter((x) => x.id !== e.id && mspecUsed({ state: o.state }, x.id) > 0),
    );
    expect(direct.length).toBeGreaterThan(0);
  });

  test('pick_nasty(): an arch-lich becomes a master lich outside Gehennom', () => {
    const { s } = setup('nh:newt', 20, 0);
    const picks = (st: GameState): Set<string> => {
      const out = new Set<string>();
      for (let k = 0; k < 400; k++) {
        const c = structuredClone(st);
        run(c, (ctx) => {
          for (let i = 0; i < k; i++) ctx.rng.rn2(2);
          out.add(pickNasty(ctx, 0));
        });
      }
      return out;
    };
    const outside = picks(s.state);
    expect(outside.has('nh:master_lich')).toBe(true);
    expect(outside.has('nh:arch_lich')).toBe(false);
    getLevel(s.state).dungeon = 'nh:gehennom';
    const inside = picks(s.state);
    expect(inside.has('nh:arch_lich')).toBe(true);
  });

  test('touch of death: drains her maximum HP, kills a frail hero; magic resistance and undeath save her', () => {
    const { s, e } = setup('nh:arch_lich');
    e.c.monster!.level = 30;
    const cast = (ctx: Ctx): void => mcastSpell(ctx, e, 1, 'death_touch', { x: 3, y: 3 });
    const res = outcomes(s.state, cast, 30);
    const hit = res.filter((o) => o.text.includes('You feel drained...'));
    const missed = res.filter((o) => o.text.includes("Lucky for you, it didn't work!"));
    expect(hit.length).toBeGreaterThan(0);
    expect(missed.length).toBeGreaterThan(0);
    for (const o of hit) {
      expect(o.text[0]).toBe("Oh no, it's using the touch of death!");
      const hp = getPlayer(o.state).c.hp!;
      const dmg = 500 - hp.cur;
      expect(dmg).toBeGreaterThanOrEqual(58);
      expect(500 - hp.max).toBe(Math.trunc(dmg / 2));
    }
    // frail: the drain is at least her maximum
    const weak = structuredClone(s.state);
    getPlayer(weak).c.hp = { cur: 40, max: 40 };
    const dead = outcomes(weak, cast, 30).find((o) => o.state.gameOver !== null);
    expect(dead).toBeDefined();
    expect(String(dead!.state.gameOver!.killer)).toBe('@killer.touch_of_death.nh:arch_lich');
    expect(render({ key: 'killer.touch_of_death.nh:arch_lich' })).toBe(
      'the touch of death inflicted by an arch-lich',
    );
    expect(render({ key: 'killer.touch_of_death.nh:orcus' })).toBe(
      'the touch of death inflicted by Orcus',
    );
    // magic resistance: always lucky
    const mr = structuredClone(s.state);
    setIntrinsic(getPlayer(mr), P.ANTIMAGIC, true);
    expect(run(mr, cast)).toEqual([
      "Oh no, it's using the touch of death!",
      "Lucky for you, it didn't work!",
    ]);
    // an undead form
    const und = structuredClone(s.state);
    for (const o of inventoryOf(und, und.playerId)) delete und.entities[String(o.id)];
    run(und, (ctx) => void polymon(ctx, 'nh:human_zombie' as DefId, false));
    expect(run(und, cast)).toEqual([
      "Oh no, it's using the touch of death!",
      'You seem no deader than before.',
    ]);
  });
});
