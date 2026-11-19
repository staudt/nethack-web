// m18 step 4: the remaining demons. The fourteen rows (erinys, marilith, vrock, hezrou, bone and
// ice devils, nalfeshnee, pit fiend, balrog, the amorous demon, Yeenoghu, Geryon, Dispater,
// Demogorgon), their gear (the balrog's bullwhip and broadsword, Yeenoghu's flail, Dispater's wand
// of striking, the ice devil's spear), their attacks on her over the existing damage-type code,
// Geryon's and Dispater's bribes, the erinyes' rules (peace only to a hero who never abused her
// alignment, their aggravation, the Furies of the helm of opposite alignment, three at most), the
// bone devil's skeleton, and makemon()'s in_mklev sleep. Outcomes are found by burning RNG draws
// (a seed search) with pinned monsters.
// ref: include/monsters.h; src/makemon.c m_initweap(), m_initinv(), makemon(), peace_minded(),
// summon_furies(); src/mon.c m_respond(); src/attrib.c uchangealign(); src/minion.c msummon();
// src/weapon.c select_hwep()
import {
  createEngine,
  getPlayer,
  inventoryOf,
  sortedIds,
  type AttackDef,
  type Ctx,
  type DefId,
  type Entity,
  type GameState,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { makemon, vanillaMod } from '../src/index';
import { peaceMinded, summonFuries } from '../src/generation';
import { hitmu, monsterAttack } from '../src/combat';
import { demonTalk } from '../src/demontalk';
import { hungerData } from '../src/hunger';
import { ustuck } from '../src/hackmove';
import { monInvisible } from '../src/invis';
import { adjalign, setU, uState } from '../src/luck';
import { msummon } from '../src/minion';
import { isDlord, isDprince, isNdemon } from '../src/mondata';
import { selectHwep } from '../src/mongear';
import { mRespond } from '../src/mrespond';
import { P, hasProp, setIntrinsic } from '../src/props';
import { born, isExtinct } from '../src/vanquished';
import { addMon } from './helpers';
import { defs, levelSetup, plainKit, render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'dm18-probe',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'dm18-probe:run',
      labelKey: 'dm18-probe',
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
  const r = engine.step(state, { type: 'mod', action: 'dm18-probe:run' });
  return r.events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );
}

/** Every outcome of `fn` over the first `tries` RNG offsets, each on a copy of `state`. */
function outcomes(
  state: GameState,
  fn: (ctx: Ctx) => void,
  tries = 100,
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
  '...............',
  '...............',
  '...............',
  '...@...........',
  '...............',
  '...............',
];

/** A lit room, the hero at (3,3) with 500 HP and a pinned `def` at (x,y), in Gehennom. */
function setup(def: string, x = 4, y = 3) {
  const s = levelSetup(ROOM);
  s.state.levels['dlvl1']!.dungeon = 'nh:gehennom';
  plainKit(s.state);
  const id = addMon(s.state, def, x, y);
  const e = s.state.entities[String(id)]!;
  e.c.hp = { cur: 200, max: 200 };
  e.c.actor!.speed = 0;
  e.c.monster!.level = Math.min(50, defs.monster(def as DefId).level);
  s.step({ type: 'wait' }); // see the level
  return { s, id };
}

const monsOn = (st: GameState): Entity[] =>
  sortedIds(st)
    .map((i) => st.entities[String(i)]!)
    .filter((e) => e.c.monster && e.id !== st.playerId && e.c.pos);
const attackOf = (def: string, at: AttackDef['at'], ad: string): AttackDef =>
  defs.monster(def as DefId).attacks.find((a) => a.at === at && a.ad === ad)!;
/** The monster's attack `atk` hits her (hitmu()), over `tries` RNG offsets. */
const hits = (state: GameState, id: number, atk: AttackDef, tries = 60) =>
  outcomes(
    state,
    (ctx) => void hitmu(ctx, ctx.state.entities[String(id)]!, atk, null, false, 10),
    tries,
  );
/** What a `def` made next to her carries, after `k` burnt draws. */
function carried(state: GameState, def: string, k: number): string[] {
  let kinds: string[] = [];
  run(structuredClone(state), (ctx) => {
    for (let i = 0; i < k; i++) ctx.rng.rn2(2);
    const id = makemon(ctx, defs.monster(def as DefId), { x: 10, y: 1 });
    kinds = inventoryOf(ctx.state, id!).map((o) => o.def);
  });
  return kinds;
}

const NEW_ROWS = [
  'nh:incubus',
  'nh:erinys',
  'nh:marilith',
  'nh:vrock',
  'nh:hezrou',
  'nh:bone_devil',
  'nh:ice_devil',
  'nh:nalfeshnee',
  'nh:pit_fiend',
  'nh:balrog',
  'nh:yeenoghu',
  'nh:geryon',
  'nh:dispater',
  'nh:demogorgon',
];

describe('the rows', () => {
  test("the S_DEMON class in C's order; the minor demons, the lords and the princes", () => {
    const ids: string[] = defs.monsters.filter((m) => m.glyph.ch === '&').map((m) => m.id);
    expect(ids).toEqual([
      'nh:water_demon',
      'nh:incubus',
      'nh:horned_devil',
      'nh:erinys',
      'nh:barbed_devil',
      'nh:marilith',
      'nh:vrock',
      'nh:hezrou',
      'nh:bone_devil',
      'nh:ice_devil',
      'nh:nalfeshnee',
      'nh:pit_fiend',
      'nh:sandestin',
      'nh:balrog',
      'nh:juiblex',
      'nh:yeenoghu',
      'nh:orcus',
      'nh:geryon',
      'nh:dispater',
      'nh:baalzebub',
      'nh:asmodeus',
      'nh:demogorgon',
      'nh:death', // m23 step 9
      'nh:pestilence',
      'nh:famine',
      'nh:djinni', // m19 step 3 (the mail daemon is not ported)
    ]);
    for (const id of NEW_ROWS.slice(0, 10)) expect(isNdemon(defs.monster(id as DefId))).toBe(true);
    expect(isDlord(defs.monster('nh:yeenoghu' as DefId))).toBe(true);
    for (const id of ['nh:geryon', 'nh:dispater', 'nh:demogorgon'])
      expect(isDprince(defs.monster(id as DefId))).toBe(true);
    expect(render({ key: 'nh:incubus' })).toBe('incubus');
    expect(
      render({
        key: 'minion.appears',
        params: { mon: '@nh:erinys', cloud: '@minion.cloud', what: '@minion.smoke' },
      }),
    ).toBe('An erinys appears in a cloud of smoke!');
  });
});

describe('starting gear', () => {
  test("the balrog's bullwhip and broadsword, Yeenoghu's flail, Dispater's wand of striking", () => {
    const { s } = setup('nh:newt', 12, 5);
    for (let k = 0; k < 5; k++) {
      expect(carried(s.state, 'nh:balrog', k)).toEqual(
        expect.arrayContaining(['nh:bullwhip', 'nh:broadsword']),
      );
      expect(carried(s.state, 'nh:yeenoghu', k)).toContain('nh:flail');
      expect(carried(s.state, 'nh:dispater', k)).toContain('nh:wand_of_striking');
    }
  });

  test('the ice devil carries a spear 1 time in 4', () => {
    const { s } = setup('nh:newt', 12, 5);
    let spears = 0;
    for (let k = 0; k < 200; k++)
      if (carried(s.state, 'nh:ice_devil', k).includes('nh:spear')) spears++;
    expect(spears / 200).toBeGreaterThan(0.15);
    expect(spears / 200).toBeLessThan(0.35);
  });

  test('the balrog takes its bullwhip against an armed hero, something else when she is not', () => {
    const { s } = setup('nh:newt', 12, 5);
    let id = 0;
    run(s.state, (ctx) => {
      id = makemon(ctx, defs.monster('nh:balrog' as DefId), { x: 10, y: 1 })!;
    });
    const sword = inventoryOf(s.state, s.state.playerId).find(
      (o) => o.c.item?.equipped === 'weapon',
    );
    expect(sword).toBeDefined();
    run(s.state, (ctx) => expect(selectHwep(ctx, id)?.def).toBe('nh:bullwhip'));
    sword!.c.item!.equipped = null;
    run(s.state, (ctx) => expect(selectHwep(ctx, id)?.def).not.toBe('nh:bullwhip'));
  });
});

describe('their attacks on her', () => {
  test("Yeenoghu's weapon confuses her, his claw paralyses her", () => {
    const { s, id } = setup('nh:yeenoghu');
    const conf = hits(s.state, id, attackOf('nh:yeenoghu', 'weapon', 'conf')).find((o) =>
      o.text.includes('You are getting confused.'),
    );
    expect(conf).toBeDefined();
    expect(hasProp(getPlayer(conf!.state), P.CONFUSION)).toBe(true);
    const plys = hits(s.state, id, attackOf('nh:yeenoghu', 'claw', 'plys')).find((o) =>
      o.text.includes('You are frozen by Yeenoghu!'),
    );
    expect(plys).toBeDefined();
    expect(getPlayer(plys!.state).c.helpless).toBeTruthy();
  });

  test("Demogorgon's claws make her sick", () => {
    const { s, id } = setup('nh:demogorgon');
    const claw = attackOf('nh:demogorgon', 'claw', 'dise');
    const [o] = hits(s.state, id, claw, 1);
    expect(hungerData({ state: o!.state } as Ctx).sick).toBeDefined();
  });

  test("the ice devil's sting is cold (she resists), its touch slows a fast hero", () => {
    const { s, id } = setup('nh:ice_devil');
    const [sting] = hits(s.state, id, attackOf('nh:ice_devil', 'sting', 'cold'), 1);
    expect(sting!.text).toEqual(
      expect.arrayContaining(["You're covered in frost!", "The frost doesn't seem cold!"]),
    );
    setIntrinsic(getPlayer(s.state), P.FAST, true);
    const slowed = hits(s.state, id, attackOf('nh:ice_devil', 'touch', 'slow')).find((o) =>
      o.text.includes('You slow down.'),
    );
    expect(slowed).toBeDefined();
    expect(hasProp(getPlayer(slowed!.state), P.FAST)).toBe(false);
  });

  test('the pit fiend grabs her after its two weapon hits, then crushes her', () => {
    const { s, id } = setup('nh:pit_fiend');
    const grabbed = outcomes(s.state, (ctx) => monsterAttack(ctx, id), 60).find((o) =>
      o.text.includes('The pit fiend grabs you!'),
    );
    expect(grabbed).toBeDefined();
    expect(ustuck({ state: grabbed!.state } as Ctx)).toBe(id);
    const crushed = outcomes(grabbed!.state, (ctx) => monsterAttack(ctx, id), 30).find((o) =>
      o.text.includes('You are being crushed.'),
    );
    expect(crushed).toBeDefined();
  });
});

describe('Geryon and Dispater', () => {
  test.each(['nh:geryon', 'nh:dispater'])(
    '%s is born peaceful and invisible and asks a bribe',
    (def) => {
      const { s } = setup('nh:newt', 12, 5);
      s.carry('nh:gold_piece', { quantity: 400 });
      let mon: Entity | undefined;
      run(s.state, (ctx) => {
        const id = makemon(ctx, defs.monster(def as DefId), { x: 4, y: 3 });
        mon = ctx.state.entities[String(id)];
      });
      expect(mon!.c.monster!.peaceful).toBe(true);
      expect(monInvisible({ state: s.state }, mon!)).toBe(true);
      mon!.c.actor!.speed = 0;
      const t = run(s.state, (ctx) => void demonTalk(ctx, mon!.id));
      const name = render({ key: def });
      expect(t[0]).toBe(`${name} appears before you.`);
      expect(t[1]).toMatch(new RegExp(`^${name} demands \\d+ zorkmids? for safe passage\\.$`));
      expect(s.state.pendingPrompt?.prompt.id).toBe('demon-bribe');
    },
  );
});

describe('the erinyes', () => {
  const ERINYS = defs.monster('nh:erinys' as DefId);

  test('peaceful only to a hero who never abused her alignment', () => {
    const { s } = setup('nh:newt', 12, 5);
    run(s.state, (ctx) => {
      expect(uState(ctx.state).alignAbuse).toBe(0);
      expect(peaceMinded(ctx, ERINYS)).toBe(true);
      adjalign(ctx, -1);
      expect(uState(ctx.state).alignAbuse).toBe(1);
      expect(peaceMinded(ctx, ERINYS)).toBe(false);
    });
  });

  test('a hostile erinys that sees her wakes the level; a peaceful one does not', () => {
    const { s, id } = setup('nh:erinys', 6, 3);
    const newt = addMon(s.state, 'nh:newt', 14, 0, { asleep: true });
    const sleeper = (): boolean => s.state.entities[String(newt)]!.c.monster!.asleep;
    s.state.entities[String(id)]!.c.monster!.peaceful = true;
    run(s.state, (ctx) => mRespond(ctx, ctx.state.entities[String(id)]!));
    expect(sleeper()).toBe(true);
    s.state.entities[String(id)]!.c.monster!.peaceful = false;
    run(s.state, (ctx) => mRespond(ctx, ctx.state.entities[String(id)]!));
    expect(sleeper()).toBe(false);
  });

  test('summon_furies(): three at most, hostile to an abuser; then none', () => {
    const { s } = setup('nh:newt', 12, 5);
    run(s.state, (ctx) => {
      adjalign(ctx, -3);
      summonFuries(ctx, 0);
    });
    const furies = monsOn(s.state).filter((e) => e.def === 'nh:erinys');
    expect(furies).toHaveLength(3);
    for (const f of furies) expect(f.c.monster!.peaceful).toBe(false);
    expect(born(s.state, 'nh:erinys' as DefId)).toBe(3);
    expect(isExtinct(s.state, 'nh:erinys' as DefId)).toBe(true);
    run(s.state, (ctx) => summonFuries(ctx, 1));
    expect(monsOn(s.state).filter((e) => e.def === 'nh:erinys')).toHaveLength(3);
  });

  test('the helm of opposite alignment calls an erinys when rn2(50) < her abuse', () => {
    const wearHelm = (abuse: number): number => {
      const { s } = setup('nh:newt', 12, 5);
      run(s.state, (ctx) => setU(ctx, { alignAbuse: abuse }));
      const helm = s.carry('nh:helm_of_opposite_alignment');
      s.mod('nh:wear', { item: helm });
      return monsOn(s.state).filter((e) => e.def === 'nh:erinys').length;
    };
    // the helm adds 7 (adjalign(-7)) before the roll: 43 + 7 = 50 always calls one
    expect(wearHelm(43)).toBe(1);
    // from no abuse, 7 in 50
    let called = 0;
    for (let seed = 0; seed < 40; seed++) {
      const { s } = setup('nh:newt', 12, 5);
      run(s.state, (ctx) => {
        for (let i = 0; i < seed; i++) ctx.rng.rn2(2);
      });
      const helm = s.carry('nh:helm_of_opposite_alignment');
      s.mod('nh:wear', { item: helm });
      if (monsOn(s.state).some((e) => e.def === 'nh:erinys')) called++;
    }
    expect(called).toBeGreaterThan(0);
    expect(called).toBeLessThan(20);
  });
});

describe('summoning', () => {
  test('a bone devil gates in a skeleton', () => {
    const { s, id } = setup('nh:bone_devil');
    let skeletons = 0;
    for (const o of outcomes(
      s.state,
      (ctx) => void msummon(ctx, ctx.state.entities[String(id)]!),
      20,
    )) {
      const added = monsOn(o.state).filter((e) => e.id !== id);
      expect(added.map((e) => e.def)).toEqual(['nh:skeleton']);
      if (o.text.includes('A skeleton appears in a cloud of smoke!')) skeletons++;
    }
    expect(skeletons).toBe(20);
  });
});

describe("makemon()'s in_mklev sleep", () => {
  /** How many of `tries` `def`s made with (or without) the level are asleep. */
  function asleep(def: string, inMklev: boolean, tries = 150): number {
    const { s } = setup('nh:newt', 12, 5);
    let n = 0;
    for (const o of outcomes(
      s.state,
      (ctx) => void makemon(ctx, defs.monster(def as DefId), { x: 9, y: 1 }, { inMklev }),
      tries,
    ))
      if (monsOn(o.state).some((e) => e.def === def && e.c.monster!.asleep)) n++;
    return n;
  }

  test.each(['nh:hezrou', 'nh:incubus', 'nh:wumpus', 'nh:long_worm'])(
    'a %s made with the level sleeps 4 times in 5; made later, never',
    (def) => {
      const n = asleep(def, true);
      expect(n / 150).toBeGreaterThan(0.7);
      expect(n / 150).toBeLessThan(0.9);
      expect(asleep(def, false, 30)).toBe(0);
    },
  );

  test('a lord, a prince or another kind is not put to sleep', () => {
    for (const def of ['nh:yeenoghu', 'nh:demogorgon', 'nh:jackal'])
      expect(asleep(def, true, 30)).toBe(0);
  });
});
