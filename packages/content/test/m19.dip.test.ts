// m19 step 4: #dip into potions. The fountain and pool question before the potion menu, "Dip
// into" from the potion's side, holy and unholy water, plain water (dilution twice to water,
// blank scrolls), alchemy (mixtype() for every pair, the amounts mixed, the explosion), the
// polymorph potion, acid, oil (rust and corrosion, the lamp filled or exploding), the unicorn horn
// and the amethyst, "Interesting...". Frequencies are asserted with a tolerance over many dips,
// never on a lucky seed.
// ref: src/potion.c dodip(), dip_into(), potion_dip(), H2Opotion_dip(), mixtype(),
// dip_potion_explosion(), hold_potion(); src/trap.c water_damage(); src/zap.c cancel_item()
import {
  createEngine,
  getPlayer,
  inventoryOf,
  type Ctx,
  type DefId,
  type EntityId,
  type GameEvent,
  type GameState,
  type Mod,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { DIP_ID, DIP_INTO_ID, mixtype, potionDip, vanillaMod } from '../src/index';
import { isDiluted, setDiluted } from '../src/dilute';
import { glibTimeout, isGlib } from '../src/glib';
import { beginBurn } from '../src/burnstate';
import { addToInventory } from '../src/items';
import { setU } from '../src/luck';
import { T, setTerrain } from '../src/terrain';
import { waterDamageChain } from '../src/water';
import { cancelItem } from '../src/zap';
import { itemOf, levelSetup, plainKit, render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'dp',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'dp:run',
      labelKey: 'dp',
      handles: 'mod',
      offer: () => [],
      perform(ctx) {
        probe.fn(ctx);
        return 0;
      },
    });
  },
};
const eng = createEngine([vanillaMod, probeMod]);
const defs = eng.registry;
const textsOf = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [render({ key: e.key, params: e.params ?? {} })] : []));
function run(state: GameState, fn: (ctx: Ctx) => void): string[] {
  probe.fn = fn;
  return textsOf(eng.step(state, { type: 'mod', action: 'dp:run' as DefId }).events);
}

type S = ReturnType<typeof levelSetup>;
const ROOM = ['.........', '....@....', '.........', '.........'];
function make(seed = 1): S {
  const s = levelSetup(ROOM, seed);
  plainKit(s.state);
  for (const k of Object.keys(s.state.entities)) {
    const e = s.state.entities[k];
    if (e?.c.monster) delete s.state.entities[k];
  }
  // only the potions and objects of each test
  for (const e of inventoryOf(s.state, s.state.playerId))
    if (defs.object(e.def).class === 'potion') delete s.state.entities[String(e.id)];
  s.step({ type: 'wait' });
  return s;
}
const step = (s: S, a: Parameters<typeof eng.step>[1]): StepResult => eng.stepAll(s.state, a);
const answer = (s: S, value: unknown): StepResult =>
  step(s, { type: 'answer', promptId: s.state.pendingPrompt!.prompt.id, value: value as never });
const promptText = (s: S): string => {
  const p = s.state.pendingPrompt!.prompt;
  return render({ key: p.key, ...(p.params ? { params: p.params } : {}) });
};
/** Dips `obj` into `potion` through the action and its menu; returns the messages. */
function dip(s: S, obj: EntityId, potion: EntityId): string[] {
  const out = textsOf(step(s, { type: 'mod', action: DIP_ID, args: { item: obj } }).events);
  expect(s.state.pendingPrompt?.prompt.id).toBe('dip-potion');
  return [...out, ...textsOf(answer(s, potion).events)];
}
const carryPot = (
  s: S,
  id: string,
  quantity = 1,
  buc: 'blessed' | 'uncursed' | 'cursed' = 'uncursed',
): EntityId => {
  // made apart, then carried: a stack of another BUC is not merged into
  const e = s.give(`nh:potion_of_${id}`, { quantity });
  itemOf(s.state, e).buc = buc;
  return addToInventory(s.ctx, s.state.playerId, e);
};
const gone = (s: S, id: EntityId): boolean => s.state.entities[String(id)] === undefined;
const qtyOf = (st: GameState, def: string): number =>
  inventoryOf(st, st.playerId)
    .filter((e) => e.def === def)
    .reduce((n, e) => n + (e.c.item?.quantity ?? 0), 0);

const P = (n: string): DefId => `nh:potion_of_${n}` as DefId;

describe('mixtype(): the alchemy table', () => {
  const potions = defs.objects.filter((d) => d.class === 'potion').map((d) => d.id);
  const key = (a: string, b: string): string => [a, b].sort().join('+');
  // unordered pairs (the swap in mixtype() makes the table symmetric); arrays are the rn2 cases
  const table = new Map<string, DefId | DefId[]>();
  const put = (a: string, b: string, r: DefId | DefId[]): void =>
    void table.set(key(P(a), P(b)), r);
  put('healing', 'speed', P('extra_healing'));
  for (const g of ['gain_level', 'gain_energy']) {
    put('healing', g, P('extra_healing'));
    put('extra_healing', g, P('full_healing'));
    put('full_healing', g, P('gain_ability'));
    put(g, 'confusion', [P('booze'), P('enlightenment')]);
    put(g, 'fruit_juice', P('see_invisible'));
    put(g, 'booze', P('hallucination'));
  }
  for (const h of ['healing', 'extra_healing', 'full_healing']) {
    put(h, 'sickness', P('fruit_juice'));
    for (const w of ['hallucination', 'blindness', 'confusion']) put(h, w, P('water'));
  }
  put('fruit_juice', 'sickness', P('sickness'));
  put('fruit_juice', 'enlightenment', P('booze'));
  put('fruit_juice', 'speed', P('booze'));
  put('enlightenment', 'levitation', [P('gain_level')]); // or nothing, 1 time in 3
  put('enlightenment', 'booze', P('confusion'));

  test('every pair of potions, both orders, with both outcomes of the rn2(3) draws', () => {
    const zero = { rn2: () => 0 };
    const one = { rn2: () => 1 };
    let found = 0;
    for (const a of potions)
      for (const b of potions) {
        if (a === b) continue;
        const want = table.get(key(a, b));
        const r0 = mixtype(defs, a, b, zero);
        const r1 = mixtype(defs, a, b, one);
        if (want === undefined) {
          expect([a, b, r0, r1]).toEqual([a, b, null, null]);
        } else if (Array.isArray(want)) {
          if (want.length === 2) {
            expect(r1).toBe(want[0]); // rn2(3) != 0: booze
            expect(r0).toBe(want[1]);
          } else {
            expect(r1).toBe(want[0]);
            expect(r0).toBeNull();
          }
          found++;
        } else {
          expect([a, b, r0, r1]).toEqual([a, b, want, want]);
          found++;
        }
      }
    expect(found).toBe(table.size * 2);
  });

  test('the unicorn horn and the amethyst', () => {
    const rng = { rn2: () => 0 };
    const horn = 'nh:unicorn_horn' as DefId;
    expect(mixtype(defs, horn, P('sickness'), rng)).toBe(P('fruit_juice'));
    for (const w of ['hallucination', 'blindness', 'confusion'])
      expect(mixtype(defs, horn, P(w), rng)).toBe(P('water'));
    expect(mixtype(defs, horn, P('booze'), rng)).toBeNull();
    expect(mixtype(defs, 'nh:amethyst' as DefId, P('booze'), rng)).toBe(P('fruit_juice'));
    expect(mixtype(defs, 'nh:amethyst' as DefId, P('sickness'), rng)).toBeNull();
  });
});

describe('#dip offers and questions', () => {
  test('every carried object but coins and covered armor; "Dip into" on potions', () => {
    const s = make();
    const sword = s.carry('nh:long_sword');
    const pot = carryPot(s, 'healing');
    const coins = s.carry('nh:gold_piece', { quantity: 10 });
    const offers = (id: EntityId): string[] =>
      eng
        .query(s.state)
        .actionsFor({ kind: 'item', id })
        .flatMap((o) => (o.action.type === 'mod' ? [o.action.action] : []));
    expect(offers(sword)).toContain(DIP_ID);
    expect(offers(sword)).not.toContain(DIP_INTO_ID);
    expect(offers(pot)).toContain(DIP_ID);
    expect(offers(pot)).toContain(DIP_INTO_ID);
    expect(offers(coins)).not.toContain(DIP_ID);
    // a suit under a cloak cannot be dipped
    const suit = s.carry('nh:leather_armor');
    const cloak = s.carry('nh:mummy_wrapping');
    itemOf(s.state, suit).equipped = 'body';
    itemOf(s.state, cloak).equipped = 'cloak';
    expect(offers(suit)).not.toContain(DIP_ID);
    expect(offers(cloak)).toContain(DIP_ID);
    // off water her hands are not offered
    expect(
      eng
        .query(s.state)
        .actionsFor({ kind: 'self' })
        .some((o) => o.action.type === 'mod' && o.action.action === DIP_ID),
    ).toBe(false);
  });

  test('the potion menu; none to dip into; "Dip into" asks for the object', () => {
    const s = make();
    const sword = s.carry('nh:long_sword');
    const t = textsOf(step(s, { type: 'mod', action: DIP_ID, args: { item: sword } }).events);
    expect(t).toEqual(["You don't have anything to dip a long sword into."]);
    expect(s.state.pendingPrompt).toBeNull();
    const pot = carryPot(s, 'fruit_juice');
    step(s, { type: 'mod', action: DIP_ID, args: { item: sword } });
    expect(promptText(s)).toBe('What do you want to dip a long sword into?');
    expect(s.state.pendingPrompt!.prompt.options!.map((o) => o.value)).toEqual([pot]);
    const turn = s.state.turn;
    expect(textsOf(answer(s, null).events)).toEqual([]); // cancelled: no time
    expect(s.state.turn).toBe(turn);

    step(s, { type: 'mod', action: DIP_INTO_ID, args: { potion: pot } });
    expect(promptText(s)).toMatch(/^What do you want to dip into the .*\?$/);
    expect(textsOf(answer(s, sword).events)).toEqual(['Interesting...']);
    expect(s.state.turn).toBeGreaterThan(turn);
    expect(gone(s, pot)).toBe(false);
  });

  test('a fountain or pool is asked about first; "no" goes on to the potions', () => {
    const s = make();
    const scroll = s.carry('nh:scroll_of_identify');
    carryPot(s, 'fruit_juice');
    const p = getPlayer(s.state).c.pos!;
    setTerrain(s.state.levels['dlvl1']!, p.x, p.y, T.pool);
    // hands are offered on water
    expect(
      eng
        .query(s.state)
        .actionsFor({ kind: 'self' })
        .some((o) => o.action.type === 'mod' && o.action.action === DIP_ID),
    ).toBe(true);
    step(s, { type: 'mod', action: DIP_ID, args: { item: scroll } });
    expect(promptText(s)).toMatch(/^Dip a scroll labeled /);
    expect(promptText(s)).toMatch(/into the pool of water\?$/);
    answer(s, false);
    expect(s.state.pendingPrompt?.prompt.id).toBe('dip-potion');
    answer(s, null);
    step(s, { type: 'mod', action: DIP_ID, args: { item: scroll } });
    const t = textsOf(answer(s, true).events);
    expect(t[0]).toMatch(/fades\.$/);
    expect(itemOf(s.state, scroll) && s.state.entities[String(scroll)]!.def).toBe(
      'nh:scroll_of_blank_paper',
    );
  });
});

describe('potion_dip(): water', () => {
  test('holy water uncurses (amber) and blesses (light blue aura); used up', () => {
    const s = make();
    const sword = s.carry('nh:long_sword');
    itemOf(s.state, sword).buc = 'cursed';
    const w = carryPot(s, 'water', 2, 'blessed');
    expect(dip(s, sword, w)).toEqual(['Your long sword glows amber.']);
    expect(itemOf(s.state, sword).buc).toBe('uncursed');
    expect(itemOf(s.state, sword).known.buc).toBe(true);
    expect(dip(s, sword, w)).toEqual(['Your long sword glows with a light blue aura.']);
    expect(itemOf(s.state, sword).buc).toBe('blessed');
    expect(gone(s, w)).toBe(true);
  });

  test('unholy water unblesses (brown) and curses (black aura); blessed on blessed: nothing', () => {
    const s = make();
    const sword = s.carry('nh:long_sword');
    itemOf(s.state, sword).buc = 'blessed';
    const holy = carryPot(s, 'water', 1, 'blessed');
    expect(dip(s, sword, holy)).toEqual(['Interesting...']);
    expect(gone(s, holy)).toBe(false);
    const w = carryPot(s, 'water', 2, 'cursed');
    expect(dip(s, sword, w)).toEqual(['Your long sword glows brown.']);
    expect(itemOf(s.state, sword).buc).toBe('uncursed');
    expect(dip(s, sword, w)).toEqual(['Your long sword glows with a black aura.']);
    expect(itemOf(s.state, sword).buc).toBe('cursed');
  });

  test('blind, she does not see the glow and forgets the BUC', () => {
    const s = make();
    const sword = s.carry('nh:long_sword');
    itemOf(s.state, sword).known.buc = true;
    const w = carryPot(s, 'water', 1, 'blessed');
    const h = getPlayer(s.state);
    h.c.props = { ...(h.c.props ?? {}), blinded: { intrinsic: true, timeout: 0 } };
    expect(dip(s, sword, w)).toEqual([]);
    expect(itemOf(s.state, sword).buc).toBe('blessed');
    expect(itemOf(s.state, sword).known.buc).toBe(false);
  });

  test('plain water blanks a scroll and dilutes a potion twice into water', () => {
    const s = make();
    const scroll = s.carry('nh:scroll_of_light');
    const w = carryPot(s, 'water', 3);
    expect(dip(s, scroll, w)[0]).toMatch(/^Your scroll labeled .* fades\.$/);
    expect(s.state.entities[String(scroll)]!.def).toBe('nh:scroll_of_blank_paper');
    const heal = carryPot(s, 'healing', 1, 'blessed');
    expect(dip(s, heal, w)[0]).toMatch(/dilutes\.$/);
    expect(isDiluted(itemOf(s.state, heal))).toBe(true);
    expect(s.state.entities[String(heal)]!.def).toBe(P('healing'));
    expect(dip(s, heal, w)[0]).toMatch(/dilutes further\.$/);
    expect(s.state.entities[String(heal)]!.def).toBe(P('water'));
    expect(itemOf(s.state, heal).buc).toBe('uncursed');
    expect(isDiluted(itemOf(s.state, heal))).toBe(false);
    expect(gone(s, w)).toBe(true);
  });

  test('water into water: nothing, and a cancelled diluted potion is plain water', () => {
    const s = make();
    const a = carryPot(s, 'water');
    const b = carryPot(s, 'water', 1, 'cursed');
    expect(dip(s, a, a)).toEqual(['That is a potion bottle, not a Klein bottle!']);
    expect(dip(s, b, a)).toEqual(['Interesting...']);
    const heal = carryPot(s, 'healing');
    setDiluted(itemOf(s.state, heal), true);
    run(s.state, (ctx) => cancelItem(ctx, ctx.state.entities[String(heal)]!));
    expect(s.state.entities[String(heal)]!.def).toBe(P('water'));
    expect(isDiluted(itemOf(s.state, heal))).toBe(false);
  });

  test('acid in water explodes: "A ...", then "Another ..." in the same soaking', () => {
    const s = make();
    setU(s.ctx, { luck: -5 }); // Luck < -4: every item is damaged (none escapes by luck)
    const a1 = carryPot(s, 'acid');
    const a2 = carryPot(s, 'acid', 2, 'cursed');
    const t = run(s.state, (ctx) =>
      waterDamageChain(ctx, [ctx.state.entities[String(a1)]!, ctx.state.entities[String(a2)]!]),
    );
    expect(t).toHaveLength(2);
    expect(t[0]).toMatch(/^A .* explodes!$/);
    expect(t[1]).toMatch(/^More .* explode!$/);
    expect(gone(s, a1)).toBe(true);
    expect(gone(s, a2)).toBe(true);
  });

  test('diluted booze is watered down (no healing); diluted fruit juice is reconstituted', () => {
    const s = make();
    const booze = carryPot(s, 'booze', 1, 'blessed');
    setDiluted(itemOf(s.state, booze), true);
    const hp = getPlayer(s.state).c.hp!;
    hp.cur = 400;
    const t = textsOf(
      step(s, { type: 'mod', action: 'nh:quaff' as DefId, args: { item: booze } }).events,
    );
    expect(t).toContain('Ooph!  This tastes like watered down liquid fire!');
    expect(hp.cur).toBe(400);
    const juice = carryPot(s, 'fruit_juice');
    setDiluted(itemOf(s.state, juice), true);
    const u = textsOf(
      step(s, { type: 'mod', action: 'nh:quaff' as DefId, args: { item: juice } }).events,
    );
    expect(u).toContain('This tastes like reconstituted fruit juice.');
  });

  test('her hands do not fit into the bottle', () => {
    const s = make();
    const p = carryPot(s, 'healing');
    let t: number | undefined;
    const out = run(s.state, (ctx) => {
      t = potionDip(ctx, 'hands', ctx.state.entities[String(p)]!);
    });
    expect(out).toEqual(["You can't fit your hand into the mouth of the bottle!"]);
    expect(t).toBe(0);
  });
});

describe('potion_dip(): mixing', () => {
  test('the amounts: 3..8 for a magic result, 7..N for a mundane one, 2 when diluted', () => {
    const counts = {
      magic: new Set<number>(),
      mundane: new Set<number>(),
      diluted: new Set<number>(),
    };
    let booms = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = make(seed);
      // magic: healing into speed makes extra healing
      const heal = carryPot(s, 'healing', 20);
      const speed = carryPot(s, 'speed');
      const t = dip(s, heal, speed);
      const left = qtyOf(s.state, P('healing'));
      const amt = 20 - left;
      counts.magic.add(amt);
      expect(t[0]).toMatch(new RegExp(`^${amt} of the .* mix with the .*\\.\\.\\.$`));
      if (t.includes('BOOM!  They explode!')) booms++;
      else expect(qtyOf(s.state, P('extra_healing'))).toBe(amt);
      // mundane: fruit juice into booze has no recipe
      const juice = carryPot(s, 'fruit_juice', 12);
      const booze = carryPot(s, 'booze');
      dip(s, juice, booze);
      counts.mundane.add(12 - qtyOf(s.state, P('fruit_juice')));
      // diluted healing into speed: two of them
      for (const e of inventoryOf(s.state, s.state.playerId))
        if (defs.object(e.def).class === 'potion') delete s.state.entities[String(e.id)];
      const dh = carryPot(s, 'healing', 6);
      setDiluted(itemOf(s.state, dh), true);
      const sp2 = carryPot(s, 'speed');
      dip(s, dh, sp2);
      counts.diluted.add(6 - itemOf(s.state, dh).quantity);
    }
    expect(Math.min(...counts.magic)).toBe(3);
    expect(Math.max(...counts.magic)).toBe(8);
    expect(Math.min(...counts.mundane)).toBeGreaterThanOrEqual(7);
    expect(Math.max(...counts.mundane)).toBeLessThanOrEqual(12);
    expect(counts.mundane.size).toBeGreaterThan(2);
    expect([...counts.diluted]).toEqual([2]);
    expect(booms).toBeLessThan(20);
  });

  test('one potion mixes whole; the mixture is uncursed and diluted; healing + speed', () => {
    const s = make(3);
    let made = 0;
    for (let i = 0; i < 40; i++) {
      const heal = carryPot(s, 'healing', 1, 'blessed');
      const speed = carryPot(s, 'speed');
      const t = dip(s, heal, speed);
      expect(t[0]).toMatch(/^The .* mixes with the .*\.\.\.$/);
      expect(gone(s, speed)).toBe(true);
      if (t[1] === 'BOOM!  They explode!') {
        expect(gone(s, heal)).toBe(true);
        continue;
      }
      expect(t[1]).toMatch(/^The mixture looks [a-z -]+\.$/);
      made++;
    }
    const eh = inventoryOf(s.state, s.state.playerId).filter((e) => e.def === P('extra_healing'));
    expect(eh.reduce((n, e) => n + e.c.item!.quantity, 0)).toBe(made);
    for (const e of eh) {
      expect(e.c.item!.buc).toBe('uncursed');
      expect(isDiluted(e.c.item!)).toBe(true);
    }
    expect(made).toBeGreaterThan(28);
  });

  test('the explosion: about 1 time in 10, always for cursed, acid and lit oil', () => {
    const s = make(5);
    let booms = 0;
    const N = 400;
    const killer = { dmgMax: 0 };
    for (let i = 0; i < N; i++) {
      const hp = getPlayer(s.state).c.hp!;
      hp.cur = hp.max = 500;
      const juice = carryPot(s, 'fruit_juice');
      const sick = carryPot(s, 'sickness');
      const t = dip(s, juice, sick);
      if (t.includes('BOOM!  They explode!')) {
        booms++;
        killer.dmgMax = Math.max(killer.dmgMax, 500 - getPlayer(s.state).c.hp!.cur);
        expect(gone(s, juice)).toBe(true);
      }
      for (const e of inventoryOf(s.state, s.state.playerId))
        if (defs.object(e.def).class === 'potion') delete s.state.entities[String(e.id)];
    }
    expect(booms / N).toBeGreaterThan(0.06);
    expect(booms / N).toBeLessThan(0.14);
    expect(killer.dmgMax).toBeLessThanOrEqual(1 + 9 + 5); // amt + rnd(9), vapors of sickness
    for (let i = 0; i < 10; i++) {
      const c = carryPot(s, 'healing', 1, 'cursed');
      expect(dip(s, c, carryPot(s, 'speed'))).toContain('BOOM!  They explode!');
      const acid = carryPot(s, 'acid');
      expect(dip(s, acid, carryPot(s, 'booze'))).toContain('BOOM!  They explode!');
      const oil = carryPot(s, 'oil');
      run(s.state, (ctx) => beginBurn(ctx, ctx.state.entities[String(oil)]!, false));
      expect(dip(s, oil, carryPot(s, 'booze'))).toContain('BOOM!  They explode!');
      getPlayer(s.state).c.hp!.cur = 500;
    }
  });

  test('no recipe: water, sickness, a random potion or evaporation (diluted: water)', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 80; seed++) {
      const s = make(seed);
      const juice = carryPot(s, 'fruit_juice');
      const t = dip(s, juice, carryPot(s, 'booze'));
      if (t.includes('BOOM!  They explode!')) continue;
      const e = s.state.entities[String(juice)];
      if (t.includes('The mixture glows brightly and evaporates.')) {
        expect(e).toBeUndefined();
        seen.add('evaporates');
      } else if (t.includes('The mixture bubbles, then clears.')) {
        expect(e!.def).toBe(P('water'));
        expect(isDiluted(e!.c.item!)).toBe(false);
        seen.add('water');
      } else {
        const inv = inventoryOf(s.state, s.state.playerId).filter(
          (o) => defs.object(o.def).class === 'potion',
        );
        expect(inv).toHaveLength(1);
        expect(isDiluted(inv[0]!.c.item!)).toBe(true);
        seen.add(inv[0]!.def === P('sickness') ? 'sickness' : 'random');
      }
    }
    expect([...seen].sort()).toEqual(['evaporates', 'random', 'sickness', 'water']);
    // a diluted one always turns to water
    for (let seed = 1; seed <= 15; seed++) {
      const s = make(seed);
      const juice = carryPot(s, 'fruit_juice');
      setDiluted(itemOf(s.state, juice), true);
      const t = dip(s, juice, carryPot(s, 'booze'));
      if (!t.includes('BOOM!  They explode!'))
        expect(t).toContain('The mixture bubbles, then clears.');
    }
  });
});

describe('potion_dip(): polymorph, acid, oil, unicorn horn, amethyst', () => {
  test('polymorph: the object changes and the potion is used up, unless it resists', () => {
    let changed = 0;
    let resisted = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = make(seed);
      const ring = s.carry('nh:ring_of_adornment');
      const poly = carryPot(s, 'polymorph');
      const t = dip(s, ring, poly);
      if (t[0] === 'Nothing happens.') {
        resisted++;
        expect(gone(s, poly)).toBe(false);
        continue;
      }
      if (t[0] === 'Nothing seems to happen.') continue; // the same type again: used up
      changed++;
      expect(gone(s, poly)).toBe(true);
      expect(gone(s, ring)).toBe(true);
      expect(s.state.discovered).toContain(P('polymorph'));
      expect(t[0]).toMatch(/^[a-zA-Z] - .* ring/);
    }
    expect(changed).toBeGreaterThan(45);
    expect(resisted).toBeLessThan(10);
  });

  test('acid corrodes; a lichen corpse turns red around the edges', () => {
    const s = make();
    const axe = s.carry('nh:axe');
    const acid = carryPot(s, 'acid', 2);
    const t = dip(s, axe, acid);
    expect(t[0]).toBe('Your axe corrodes!');
    expect(itemOf(s.state, axe).erosion?.e2).toBe(1);
    expect(itemOf(s.state, acid).quantity).toBe(1);
    const corpse = s.carry('nh:corpse', { corpseOf: 'nh:lichen' as DefId });
    expect(dip(s, corpse, acid)).toEqual(['The lichen corpse turns red around the edges.']);
    expect(gone(s, acid)).toBe(false);
    setDiluted(itemOf(s.state, acid), true);
    expect(dip(s, corpse, acid)).toEqual(['The lichen corpse turns orange around the edges.']);
  });

  test('oil takes rust and corrosion away, leaves an oily sheen, spills when cursed', () => {
    const s = make();
    const axe = s.carry('nh:axe');
    itemOf(s.state, axe).erosion = { e1: 2, e2: 1 };
    const oil = carryPot(s, 'oil', 5);
    expect(dip(s, axe, oil)).toEqual(['Your axe is less corroded and rusty.']);
    expect(itemOf(s.state, axe).erosion).toEqual({ e1: 1, e2: 0 });
    expect(dip(s, axe, oil)).toEqual(['Your axe is less rusty.']);
    expect(itemOf(s.state, axe).erosion).toBeUndefined();
    expect(dip(s, axe, oil)).toEqual(['Your axe gleams with an oily sheen.']);
    expect(s.state.discovered).toContain(P('oil'));
    expect(itemOf(s.state, oil).quantity).toBe(2);
    const cursed = carryPot(s, 'oil', 1, 'cursed');
    // slippery fingers: her wielded spear slips at the end of the turn (glibr())
    expect(dip(s, axe, cursed)).toEqual([
      'The potion spills and covers your fingers with oil.',
      'Your spear slips from your hand.',
    ]);
    expect(isGlib(s.state)).toBe(true);
    expect(glibTimeout(s.state)).toBeGreaterThanOrEqual(1);
    // a non-weapon: "Interesting..."
    const scroll = s.carry('nh:scroll_of_light');
    expect(dip(s, scroll, oil)).toEqual(['Interesting...']);
  });

  test('oil fills a lamp up to 1500; a full one is refused; a lit one explodes', () => {
    const s = make();
    const lamp = s.carry('nh:oil_lamp');
    itemOf(s.state, lamp).age = 100;
    const oil = carryPot(s, 'oil', 3);
    expect(dip(s, lamp, oil)).toEqual(['You fill your lamp with oil.']);
    expect(itemOf(s.state, lamp).age).toBe(100 + 800);
    expect(dip(s, lamp, oil)).toEqual(['You fill your lamp with oil.']);
    expect(itemOf(s.state, lamp).age).toBe(1500);
    expect(itemOf(s.state, oil).quantity).toBe(1);
    expect(dip(s, lamp, oil)).toEqual(['Your lamp is full.']);
    expect(gone(s, oil)).toBe(false);
    // a diluted potion gives 3/2 of its oil
    itemOf(s.state, lamp).age = 0;
    setDiluted(itemOf(s.state, oil), true);
    dip(s, lamp, oil);
    expect(itemOf(s.state, lamp).age).toBe(600);
    // an empty magic lamp becomes an oil lamp
    const magic = s.carry('nh:magic_lamp');
    itemOf(s.state, magic).spe = 0;
    dip(s, magic, carryPot(s, 'oil'));
    expect(s.state.entities[String(magic)]!.def).toBe('nh:oil_lamp');
    expect(itemOf(s.state, magic).age).toBe(800);
    // lit: a fiery explosion
    run(s.state, (ctx) => beginBurn(ctx, ctx.state.entities[String(lamp)]!, false));
    const hp = getPlayer(s.state).c.hp!.cur;
    const boom = carryPot(s, 'oil');
    const t = dip(s, lamp, boom);
    expect(gone(s, boom)).toBe(true);
    expect(t.some((m) => /explosion|fireball|caught/i.test(m))).toBe(true);
    expect(getPlayer(s.state).c.hp!.cur).toBeLessThan(hp);
  });

  test('a unicorn horn: sickness to fruit juice, blindness to water; amethyst: booze', () => {
    const s = make();
    const horn = s.carry('nh:unicorn_horn');
    const sick = carryPot(s, 'sickness', 3, 'cursed');
    const t = dip(s, horn, sick);
    expect(t[0]).toMatch(/^The [a-z -]+ potion that you dipped into turns [a-z -]+\.$/);
    expect(itemOf(s.state, sick).quantity).toBe(2);
    const juice = inventoryOf(s.state, s.state.playerId).find((e) => e.def === P('fruit_juice'))!;
    expect(juice.c.item!.buc).toBe('uncursed'); // the horn's BUC
    const blind = carryPot(s, 'blindness', 1, 'blessed');
    expect(dip(s, horn, blind)[0]).toMatch(/^The [a-z -]+ potion clears\.$/);
    expect(s.state.entities[String(blind)]!.def).toBe(P('water'));
    expect(itemOf(s.state, blind).buc).toBe('uncursed');
    const gem = s.carry('nh:amethyst');
    const booze = carryPot(s, 'booze');
    dip(s, gem, booze);
    expect(gone(s, booze)).toBe(true); // it became fruit juice, stacked with the other one
    expect(qtyOf(s.state, P('fruit_juice'))).toBe(2);
    // no recipe: "Interesting..."
    expect(dip(s, horn, carryPot(s, 'speed'))).toEqual(['Interesting...']);
  });
});
