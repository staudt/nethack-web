// m18 step 5: seduction. The amorous demon's gender (drawn at birth; a female one is a
// "succubus" in messages and in the view), could_seduce() for it (the opposite gender only),
// doseduce() with its questions (yes/no prompts), its outcomes, its fee and its wearing out, and
// the same gender doing nothing. Outcomes are found by burning RNG draws with pinned attributes.
// ref: src/mhitu.c could_seduce(), doseduce(), mayberem(); src/uhitm.c mhitm_ad_ssex();
// src/makemon.c makemon()
import {
  createEngine,
  getPlayer,
  inventoryOf,
  type Ctx,
  type DefId,
  type Entity,
  type GameState,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { makemon, vanillaMod } from '../src/index';
import { M_ATTK, mhitmAdtyping, newMhm } from '../src/adtyping';
import { monFemale, setHeroFemale, setMonFemale } from '../src/gender';
import { moneyCnt } from '../src/money';
import { isCancelled, mspecUsed, setCancelled } from '../src/mstate';
import { monNam } from '../src/perception';
import { doseduce } from '../src/seduce';
import { couldSeduce } from '../src/steal';
import { updateWornProps } from '../src/props';
import { pwOf } from '../src/uenergy';
import { createParticular, parseGenesis } from '../src/wizard/genesis';
import { defs, render } from './itemHelpers';
import { mon, room } from './m9helpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'sd18-probe',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'sd18-probe:run',
      labelKey: 'sd18-probe',
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

type Ev = { key: string; text: string };
const evs = (events: readonly { type: string }[]): Ev[] =>
  events.flatMap((e) => {
    if (e.type !== 'msg') return [];
    const m = e as unknown as { key: string; params?: Record<string, never> };
    return [
      { key: m.key, text: render({ key: m.key, ...(m.params ? { params: m.params } : {}) }) },
    ];
  });

/** Runs `fn` with a real Ctx (no time passes). */
function run(state: GameState, fn: (ctx: Ctx) => void): Ev[] {
  probe.fn = fn;
  return evs(engine.step(state, { type: 'mod', action: 'sd18-probe:run' }).events);
}

/** Answers the pending seduction question. */
function answer(state: GameState, value: boolean): Ev[] {
  expect(state.pendingPrompt?.prompt.id).toBe('seduce');
  return evs(engine.step(state, { type: 'answer', promptId: 'seduce', value }).events);
}

/** The amorous demon next to her (female for a succubus); her Cha and Int pinned. */
function setup(o: { succubus?: boolean; heroFemale?: boolean; cha?: number; int?: number } = {}) {
  const s = room();
  setHeroFemale(s.state, o.heroFemale ?? !o.succubus);
  const a = s.hero.c.attributes!;
  a.cha = o.cha ?? 10;
  a.int = o.int ?? 10;
  const m = mon(s.state, 'nh:incubus');
  m.c.actor!.speed = 0;
  if (o.succubus) setMonFemale({ state: s.state }, m.id, true);
  return { s, m };
}

/** Puts on a new item of `def` in `slot`. */
function wear(s: ReturnType<typeof room>, def: string, slot: string): Entity {
  const e = s.state.entities[String(s.carry(def))]!;
  e.c.item!.equipped = slot as never;
  e.c.item!.buc = 'uncursed';
  updateWornProps(s.state, defs, s.state.playerId);
  return e;
}

/** doseduce() after `k` burnt draws, on a copy of the state; answers every question `yes`. */
function seduceAfter(state: GameState, id: number, k: number, yes = true) {
  const st = structuredClone(state);
  const out = run(st, (ctx) => {
    for (let i = 0; i < k; i++) ctx.rng.rn2(2);
    doseduce(ctx, ctx.state.entities[String(id)]!);
  });
  while (st.pendingPrompt) {
    const p = st.pendingPrompt.prompt;
    out.push({
      key: p.key,
      text: render({ key: p.key, ...(p.params ? { params: p.params } : {}) }),
    });
    out.push(...answer(st, yes));
  }
  return { st, out, keys: out.map((e) => e.key), text: out.map((e) => e.text) };
}

const SSEX = defs.monster('nh:incubus' as DefId).attacks[0]!;

describe('could_seduce() for the amorous demon', () => {
  test('the opposite gender only (1), never "engagingly" (2) as a nymph', () => {
    const { s, m } = setup({ heroFemale: true });
    const hero = getPlayer(s.state);
    expect(couldSeduce(s.ctx, m, hero, SSEX)).toBe(1); // incubus, female hero
    expect(couldSeduce(s.ctx, m, hero, defs.monster(m.def).attacks[1]!)).toBe(0); // its claw
    setHeroFemale(s.state, false);
    expect(couldSeduce(s.ctx, m, hero, SSEX)).toBe(0); // incubus, male hero
    setMonFemale(s.ctx, m.id, true);
    expect(couldSeduce(s.ctx, m, hero, SSEX)).toBe(1); // succubus, male hero
    setHeroFemale(s.state, true);
    expect(couldSeduce(s.ctx, m, hero, null)).toBe(0); // succubus, female hero
    const ny = mon(s.state, 'nh:water_nymph', 2, 3);
    expect(couldSeduce(s.ctx, ny, hero, null)).toBe(2); // a nymph still steals "engagingly"
  });

  test('the same gender does nothing: no seduction, no theft, no damage', () => {
    const { s, m } = setup({ heroFemale: false });
    const before = inventoryOf(s.state, s.state.playerId).length;
    const out = run(s.state, (ctx) => {
      const mhm = newMhm(0);
      mhitmAdtyping(ctx, m.id, SSEX, ctx.state.playerId, mhm, { vis: true, mwep: null });
      expect(mhm.done).toBe(false);
      expect(mhm.damage).toBe(0);
    });
    expect(out).toEqual([]);
    expect(inventoryOf(s.state, s.state.playerId).length).toBe(before);
    expect(s.state.pendingPrompt).toBeNull();
  });
});

describe('the amorous demon at birth', () => {
  test('makemon() draws its gender: both come out; a newt gets no entry', () => {
    const genders = new Set<boolean>();
    for (let k = 0; k < 20; k++) {
      const { s } = setup();
      run(s.state, (ctx) => {
        for (let i = 0; i < k; i++) ctx.rng.rn2(2);
        const id = makemon(ctx, defs.monster('nh:incubus' as DefId), { x: 8, y: 4 })!;
        genders.add(monFemale(ctx, ctx.state.entities[String(id)]!));
        makemon(ctx, defs.monster('nh:newt' as DefId), { x: 8, y: 5 });
      });
      const t = (s.state.modData['nh'] as { mfemale?: Record<string, true> }).mfemale ?? {};
      for (const key of Object.keys(t)) expect(s.state.entities[key]?.def).toBe('nh:incubus');
    }
    expect([...genders].sort()).toEqual([false, true]);
  });

  test('genesis of "succubi" makes female ones, of "incubus" male ones; "amorous demon" parses', () => {
    for (const [name, female] of [
      ['2 succubi', true],
      ['incubus', false],
    ] as const) {
      const { s, m } = setup();
      run(s.state, (ctx) => {
        const spec = parseGenesis(ctx, name)!;
        expect(spec.which?.id).toBe('nh:incubus');
        createParticular(ctx, spec);
      });
      const made = Object.values(s.state.entities).filter(
        (e) => e.def === 'nh:incubus' && e.id !== m.id,
      );
      expect(made.length).toBeGreaterThan(0);
      for (const e of made) expect(monFemale({ state: s.state, defs }, e)).toBe(female);
    }
    run(setup().s.state, (ctx) => {
      expect(parseGenesis(ctx, 'amorous demon')?.which?.id).toBe('nh:incubus');
      expect(parseGenesis(ctx, 'amorous demon')?.female).toBeUndefined();
    });
  });

  test('a female one is "succubus" in messages and in the view; a male one "incubus"', () => {
    const { s, m } = setup({ succubus: true });
    expect(render(monNam(s.ctx, m))).toBe('succubus');
    const d = engine.query(s.state).describe({ x: 3, y: 2 });
    expect(d.entities.map((e) => e.def)).toEqual(['nh:succubus']);
    setMonFemale(s.ctx, m.id, false);
    expect(render(monNam(s.ctx, m))).toBe('incubus');
    expect(
      engine
        .query(s.state)
        .describe({ x: 3, y: 2 })
        .entities.map((e) => e.def),
    ).toEqual(['nh:incubus']);
  });
});

describe('doseduce()', () => {
  test('an incubus with a female hero: the question, her armor off, then the night', () => {
    const { s, m } = setup({ heroFemale: true, cha: 25, int: 25 });
    const suit = wear(s, 'nh:leather_armor', 'body');
    const r = seduceAfter(s.state, m.id, 0, true);
    expect(r.text[0]).toBe('You feel very attracted to the incubus.');
    // C's `naked` leaves out the suit
    expect(r.text).toContain('The incubus murmurs sweet nothings into your ear.');
    expect(
      r.text.some((t) => /^"Shall I remove your suit, (lover|dear|sweetheart)\?"$/.test(t)),
    ).toBe(true);
    expect(r.st.entities[String(suit.id)]!.c.item!.equipped).toBeNull();
    expect(r.text).toContain(
      "Time stands still while you and the incubus lie in each other's arms...",
    );
  });

  test('a succubus with a male hero; "no" to the suit: "You\'re such a nice guy; I wish..."', () => {
    const { s, m } = setup({ succubus: true, heroFemale: false, cha: 25 });
    const suit = wear(s, 'nh:leather_armor', 'body');
    const r = seduceAfter(s.state, m.id, 0, false);
    expect(r.text[0]).toBe('You feel very attracted to the succubus.');
    expect(r.st.entities[String(suit.id)]!.c.item!.equipped).toBe('body');
    expect(r.text).toContain('"You\'re such a nice guy; I wish..."');
    expect(r.keys).not.toContain('seduce.time_stands_still');
    const p = r.st.entities[String(m.id)]!.c.pos!;
    expect(p.x !== 3 || p.y !== 2).toBe(true); // rloc(): somewhere else (maybe still beside her)
  });

  test('a low charisma: "Take off your ..." and it comes off without a question', () => {
    const { s, m } = setup({ heroFemale: true, cha: 3 });
    const cloak = wear(s, 'nh:mummy_wrapping', 'cloak');
    // a k whose rn2(20) is not below 3: no question
    const r = [...Array(30).keys()]
      .map((k) => seduceAfter(s.state, m.id, k))
      .find((x) => x.keys.includes('seduce.take_off'))!;
    expect(r.text).toContain('"Take off your cloak; it\'s in the way."');
    expect(r.st.entities[String(cloak.id)]!.c.item!.equipped).toBeNull();
  });

  test('both outcome families: a bad night at Cha+Int 6, a good one at 50', () => {
    const bad = setup({ heroFemale: true, cha: 3, int: 3 });
    const badKeys = new Set(
      [...Array(40).keys()].flatMap((k) => seduceAfter(bad.s.state, bad.m.id, k).keys),
    );
    expect(badKeys.has('seduce.it_enjoyed')).toBe(true);
    for (const k of ['seduce.drained', 'seduce.dumps', 'seduce.dulled', 'seduce.exhausted'])
      expect(badKeys.has(k)).toBe(true);
    const good = setup({ heroFemale: true, cha: 25, int: 25 });
    const goods = [...Array(40).keys()].map((k) => seduceAfter(good.s.state, good.m.id, k));
    const goodKeys = new Set(goods.flatMap((r) => r.keys));
    expect(goodKeys.has('seduce.you_enjoyed')).toBe(true);
    for (const k of ['seduce.full_potential', 'seduce.again', 'seduce.remember', 'seduce.restored'])
      expect(goodKeys.has(k)).toBe(true);
    // a good night tires it out (mspec_used): the next try is "a headache"
    const g = goods.find(
      (r) => r.keys.includes('seduce.you_enjoyed') && !isCancelled({ state: r.st }, good.m.id),
    )!;
    expect(mspecUsed({ state: g.st }, good.m.id)).toBeGreaterThan(0);
    const again = run(g.st, (ctx) => {
      expect(doseduce(ctx, ctx.state.entities[String(good.m.id)]!)).toBe(false);
    });
    expect(again.map((e) => e.text)).toEqual(['The incubus acts as though he has got a headache.']);
  });

  test('a drained night takes her energy', () => {
    const { s, m } = setup({ heroFemale: true, cha: 3, int: 3 });
    const r = [...Array(60).keys()]
      .map((k) => seduceAfter(s.state, m.id, k))
      .find((x) => x.keys.includes('seduce.drained'))!;
    expect(pwOf(r.st).uen).toBe(0);
  });

  test('payment from her gold: "takes 100 zorkmids for services rendered!"', () => {
    const { s, m } = setup({ heroFemale: true, cha: 3, int: 25 });
    s.carry('nh:gold_piece', { quantity: 100 });
    const r = [...Array(40).keys()]
      .map((k) => seduceAfter(s.state, m.id, k))
      .find((x) => x.keys.includes('seduce.takes'))!;
    // rnd(110) + 500 is more than she has: all of it
    expect(r.text).toContain('The incubus takes 100 zorkmids for services rendered!');
    expect(moneyCnt({ state: r.st, defs }, r.st.playerId)).toBe(0);
    expect(moneyCnt({ state: r.st, defs }, m.id)).toBe(100);
  });

  test('a seducer wearing out (!rn2(25)): cancelled for good, "a severe headache"', () => {
    const { s, m } = setup({ heroFemale: true, cha: 25, int: 25 });
    const all = [...Array(80).keys()].map((k) => seduceAfter(s.state, m.id, k));
    const worn = all.filter((r) => isCancelled({ state: r.st }, m.id) && !r.st.gameOver);
    expect(worn.length).toBeGreaterThan(0);
    expect(worn.length).toBeLessThan(all.length / 5); // about 1 in 25
    const st = worn[0]!.st;
    const out = run(st, (ctx) => void doseduce(ctx, ctx.state.entities[String(m.id)]!));
    expect(out.map((e) => e.text)).toEqual([
      'The incubus acts as though he has got a severe headache.',
    ]);
  });

  test('her SSEX bite ends its attack when it seduces; cancelled, it does nothing', () => {
    const { s, m } = setup({ heroFemale: true, cha: 25, int: 25 });
    const out = run(s.state, (ctx) => {
      const mhm = newMhm(0);
      mhitmAdtyping(ctx, m.id, SSEX, ctx.state.playerId, mhm, { vis: true, mwep: null });
      expect(mhm.hitflags).toBe(M_ATTK.AGR_DONE);
    });
    expect(out[0]?.key).toBe('seduce.attracted');
    const c = setup({ heroFemale: true });
    setCancelled(c.s.ctx, c.m.id);
    const none = run(c.s.state, (ctx) => {
      const mhm = newMhm(0);
      mhitmAdtyping(ctx, c.m.id, SSEX, ctx.state.playerId, mhm, { vis: true, mwep: null });
      expect(mhm.done).toBe(false);
    });
    expect(none).toEqual([]);
  });

  test('a succubus asks for her ring of adornment and takes it', () => {
    const { s, m } = setup({ succubus: true, heroFemale: false, cha: 25 });
    const ring = s.carry('nh:ring_of_adornment');
    const r = seduceAfter(s.state, m.id, 0, true);
    expect(
      r.text.some((t) => /^"That [a-z]+ ring looks pretty. {2}May I have it\?"$/.test(t)),
    ).toBe(true);
    expect(r.st.entities[String(ring)]!.c.item!.carriedBy).toBe(m.id);
  });
});
