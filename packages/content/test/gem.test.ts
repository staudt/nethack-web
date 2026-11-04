// m7c step 1: gems, glass and gray stones (setgemprobs, names, the luckstone, the loadstone,
// shop prices, wishes) and the scroll of blank paper.
import {
  getPlayer,
  inventoryOf,
  type DefId,
  type Entity,
  type Level,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import {
  ALL_GEMS_LEDGER,
  GLASS_GEMS,
  REAL_GEMS,
  gemLedger,
  gemProb,
  moreluck,
  stoneLuck,
} from '../src/gem';
import { messagesEn, mkobj, mksobj, readobjnam, wishNames, xnameOf } from '../src/index';
import { luckOf, setU, uState } from '../src/luck';
import { getCost, glassPricedAs, setCost } from '../src/price';
import { defs, engine, freshState, itemOf, levelSetup, obj, plainKit, render } from './itemHelpers';

type S = ReturnType<typeof levelSetup>;

function make(rows: string[] = ['.....', '..@..', '.....'], seed = 1): S {
  const s = levelSetup(rows, seed);
  plainKit(s.state);
  for (const k of Object.keys(s.state.entities)) {
    if (s.state.entities[k]?.c.monster) delete s.state.entities[k];
  }
  s.step({ type: 'wait' });
  return s;
}
const answer = (s: S, value: unknown): StepResult => {
  const p = s.state.pendingPrompt?.prompt;
  if (!p) throw new Error('no prompt');
  return engine.stepAll(s.state, { type: 'answer', promptId: p.id, value: value as never });
};
const textOf = (r: StepResult): string[] =>
  r.events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );
const ent = (s: S, id: number): Entity => s.state.entities[String(id)]!;
const xname = (s: S, id: number): string => render(xnameOf(s.state, defs, ent(s, id)));

describe('setgemprobs()', () => {
  const probs = (ledger: number): number[] => REAL_GEMS.map((id) => gemProb(obj(id), ledger));
  const sum = (a: number[]): number => a.reduce((x, y) => x + y, 0);

  test('DL1: the 9 most precious gems get 0, the other 13 share 171', () => {
    // first = 9 - 1/3 = 9; (171 + j - 9) / 13 for j = 9..21: 13 up to j = 19, then 14
    expect(probs(1)).toEqual([...Array(9).fill(0), ...Array(11).fill(13), 14, 14]);
    expect(sum(probs(1))).toBe(171);
  });

  test('DL6: 7 get 0; (171 + j - 7) / 15', () => {
    expect(probs(6)).toEqual([...Array(7).fill(0), ...Array(9).fill(11), ...Array(6).fill(12)]);
    expect(sum(probs(6))).toBe(171);
  });

  test('DL27 and deeper: every gem, (171 + j) / 22', () => {
    expect(probs(27)).toEqual([...Array(5).fill(7), ...Array(17).fill(8)]);
    expect(probs(40)).toEqual(probs(27));
  });

  test('glass and gray stones keep their objects.h probabilities', () => {
    for (const ledger of [1, 6, 27]) {
      expect(GLASS_GEMS.map((id) => gemProb(obj(id), ledger))).toEqual([
        77, 77, 77, 77, 76, 77, 76, 77, 77,
      ]);
      expect(
        ['nh:luckstone', 'nh:loadstone', 'nh:touchstone', 'nh:flint_stone', 'nh:rock'].map((id) =>
          gemProb(obj(id), ledger),
        ),
      ).toEqual([10, 10, 8, 10, 100]);
    }
  });

  test('the ledger: dlevel in the main dungeon, past every cutoff in the Mines', () => {
    const state = freshState(3);
    const lv = (dungeon: string, dlevel: number): Level =>
      ({
        ...state.levels[state.currentLevel]!,
        id: `t${dungeon}${dlevel}`,
        dungeon,
        dlevel,
      }) as Level;
    state.levels['tmain6'] = lv('nh:main', 6);
    state.levels['tmines3'] = lv('nh:mines', 3);
    expect(gemLedger(state, 'tmain6')).toBe(6);
    expect(gemLedger(state, 'tmines3')).toBe(ALL_GEMS_LEDGER);
    expect(probs(gemLedger(state, 'tmines3'))).toEqual(probs(27));
  });

  test('random gems on DL1 are never one of the 9 most precious', () => {
    const s = make();
    const seen = new Set<string>();
    for (let i = 0; i < 3000; i++) {
      const id = mkobj(s.ctx, 'gem');
      if (id !== null) seen.add(ent(s, id).def);
    }
    for (const g of REAL_GEMS.slice(0, 9)) expect(seen.has(g), g).toBe(false);
    for (const g of [...REAL_GEMS.slice(9), ...GLASS_GEMS, 'nh:rock', 'nh:luckstone'])
      expect(seen.has(g), g).toBe(true);
  });

  test('mksobj: loadstones are cursed, luckstones single, rocks 6-11', () => {
    const s = make();
    for (let i = 0; i < 200; i++) {
      const load = itemOf(s.state, mksobj(s.ctx, obj('nh:loadstone')));
      expect(load.buc).toBe('cursed');
      expect(itemOf(s.state, mksobj(s.ctx, obj('nh:luckstone'))).quantity).toBe(1);
      const rocks = itemOf(s.state, mksobj(s.ctx, obj('nh:rock'))).quantity;
      expect(rocks).toBeGreaterThanOrEqual(6);
      expect(rocks).toBeLessThanOrEqual(11);
    }
  });
});

describe('names (xname() GEM_CLASS)', () => {
  test('unidentified: by colour, "gem" or "stone"; identified: the real name', () => {
    const s = make();
    const cases: [string, string, string][] = [
      ['nh:diamond', 'white gem', 'diamond'],
      ['nh:turquoise', 'green gem', 'turquoise stone'],
      ['nh:amber', 'yellowish brown gem', 'amber stone'],
      ['nh:worthless_piece_of_white_glass', 'white gem', 'worthless piece of white glass'],
      ['nh:worthless_piece_of_violet_glass', 'violet gem', 'worthless piece of violet glass'],
      ['nh:luckstone', 'gray stone', 'luckstone'],
      ['nh:loadstone', 'gray stone', 'loadstone'],
      ['nh:touchstone', 'gray stone', 'touchstone'],
      ['nh:flint_stone', 'gray stone', 'flint stone'],
    ];
    for (const [id, unknown, known] of cases) {
      const e = s.carry(id);
      expect(xname(s, e), id).toBe(unknown);
      s.state.discovered.push(id as DefId);
      expect(xname(s, e), id).toBe(known);
    }
    expect(xname(s, s.carry('nh:rock'))).toBe('rock');
    expect(xname(s, s.carry('nh:ruby', { quantity: 2 }))).toBe('red gems');
    expect(xname(s, s.carry('nh:jade', { quantity: 2 }))).toBe('green gems');
    s.state.discovered.push('nh:ruby', 'nh:jade');
    expect(xname(s, s.carry('nh:ruby', { quantity: 3 }))).toBe('rubies');
    expect(xname(s, s.carry('nh:jade', { quantity: 2 }))).toBe('jade stones');
  });

  test('a called type is "gem called" or "stone called"', () => {
    const s = make();
    (s.state.modData['nh'] as Record<string, unknown>)['called'] = {
      'nh:emerald': 'shiny',
      'nh:loadstone': 'heavy',
    };
    expect(xname(s, s.carry('nh:emerald'))).toBe('gem called shiny');
    expect(xname(s, s.carry('nh:loadstone'))).toBe('stone called heavy');
  });
});

describe('the luckstone', () => {
  const luckstone = (s: S, buc: 'blessed' | 'uncursed' | 'cursed', quantity = 1): number => {
    const id = s.carry('nh:luckstone', { quantity });
    itemOf(s.state, id).buc = buc;
    return id;
  };

  test('stone_luck() and the Luck bonus: +3 unless cursed, -3 cursed', () => {
    const s = make();
    expect([stoneLuck(s.state, true), moreluck(s.state), luckOf(s.state)]).toEqual([0, 0, 0]);
    const b = luckstone(s, 'blessed');
    expect([stoneLuck(s.state, false), stoneLuck(s.state, true), luckOf(s.state)]).toEqual([
      1, 1, 3,
    ]);
    itemOf(s.state, b).buc = 'uncursed';
    expect([stoneLuck(s.state, false), stoneLuck(s.state, true), luckOf(s.state)]).toEqual([
      0, 1, 3,
    ]);
    itemOf(s.state, b).buc = 'cursed';
    expect([stoneLuck(s.state, false), stoneLuck(s.state, true), luckOf(s.state)]).toEqual([
      -1, -1, -3,
    ]);
    // two cursed against one blessed: the quantities count
    luckstone(s, 'blessed', 1);
    itemOf(s.state, b).quantity = 2;
    expect(moreluck(s.state)).toBe(-3);
    // equal pulls: still +3 while a luckstone is carried
    itemOf(s.state, b).quantity = 1;
    expect([stoneLuck(s.state, true), moreluck(s.state)]).toEqual([0, 3]);
    // the stored u.moreluck is not used
    expect(uState(s.state).moreluck).toBe(0);
    setU(s.ctx, { luck: 2 });
    expect(luckOf(s.state)).toBe(5);
  });

  /** u.uluck after the 600-turn timeout with `luck` and the given stone (or none). */
  const timedOut = (luck: number, buc: 'blessed' | 'uncursed' | 'cursed' | null): number => {
    const s = make();
    if (buc) luckstone(s, buc);
    setU(s.ctx, { luck });
    while (s.state.turn % 600 !== 599) s.state.turn++;
    s.step({ type: 'wait' });
    return uState(s.state).luck;
  };

  test('the timeout: blessed keeps good Luck, cursed keeps bad, uncursed keeps both', () => {
    expect([timedOut(5, null), timedOut(-5, null)]).toEqual([4, -4]);
    expect([timedOut(5, 'uncursed'), timedOut(-5, 'uncursed')]).toEqual([5, -5]);
    expect([timedOut(5, 'blessed'), timedOut(-5, 'blessed')]).toEqual([5, -4]);
    expect([timedOut(5, 'cursed'), timedOut(-5, 'cursed')]).toEqual([4, -5]);
  });
});

describe('the loadstone', () => {
  const cursedLoadstone = (s: S): number => {
    const id = s.carry('nh:loadstone');
    itemOf(s.state, id).buc = 'cursed';
    return id;
  };

  test('a cursed one cannot be dropped, thrown or put into a container', () => {
    const s = make();
    const ls = cursedLoadstone(s);
    expect(textOf(s.mod('nh:drop', { item: ls }))).toEqual([
      'For some reason, you cannot drop the stone!',
    ]);
    expect(itemOf(s.state, ls).known.buc).toBe(true);
    expect(itemOf(s.state, ls).carriedBy).toBe(s.state.playerId);
    s.mod('nh:throw', { item: ls });
    const t0 = s.state.turn;
    expect(textOf(answer(s, 'e'))).toEqual(['For some reason, you cannot throw the stone!']);
    expect(s.state.turn).toBe(t0);
    const sack = s.carry('nh:sack');
    s.mod('nh:apply', { item: sack });
    answer(s, 'i');
    expect(textOf(answer(s, [ls]))).toContain("The stone won't leave your person.");
    expect(itemOf(s.state, ls).carriedBy).toBe(s.state.playerId);
    // an uncursed one drops
    itemOf(s.state, ls).buc = 'uncursed';
    s.mod('nh:drop', { item: ls });
    expect(itemOf(s.state, ls).carriedBy).toBeNull();
  });

  test('two cursed stones: "any of the stones" for throwing', () => {
    const s = make();
    const ls = cursedLoadstone(s);
    itemOf(s.state, ls).quantity = 2;
    expect(textOf(s.mod('nh:drop', { item: ls }))).toEqual([
      'For some reason, you cannot drop the stones!',
    ]);
    s.mod('nh:throw', { item: ls });
    expect(textOf(answer(s, 'e'))).toEqual([
      'For some reason, you cannot throw any of the stones!',
    ]);
  });

  test('it is lifted whatever it weighs (lift_object())', () => {
    const s = make();
    // a heavy load first: a 500-weight stone would be "too heavy" for carry_count()
    const boulders = s.carry('nh:rock', { quantity: 80 });
    expect(itemOf(s.state, boulders).quantity).toBe(80);
    const ls = s.floor('nh:loadstone');
    s.mod('nh:pickup');
    expect(itemOf(s.state, ls).carriedBy).toBe(s.state.playerId);
  });
});

describe('shop prices of gems', () => {
  test('get_cost(): unidentified glass is priced as one of two gems of its colour', () => {
    const s = make();
    const shk = { surcharge: false } as never;
    getPlayer(s.state).c.attributes!.cha = 12; // no Charisma adjustment
    for (const [i, glass] of GLASS_GEMS.entries()) {
      const e = ent(s, s.carry(glass));
      const as = glassPricedAs(s.state, defs, glass);
      // pseudorand = seed % otyp >= otyp / 2, otyp being the registry position + 1
      const otyp = defs.objects.findIndex((o) => o.id === glass) + 1;
      const pair = [
        ['nh:diamond', 'nh:opal'],
        ['nh:sapphire', 'nh:aquamarine'],
        ['nh:ruby', 'nh:jasper'],
        ['nh:amber', 'nh:topaz'],
        ['nh:jacinth', 'nh:agate'],
        ['nh:citrine', 'nh:chrysoberyl'],
        ['nh:black_opal', 'nh:jet'],
        ['nh:emerald', 'nh:jade'],
        ['nh:amethyst', 'nh:fluorite'],
      ][i]!;
      expect(as).toBe(s.state.seed % otyp >= Math.trunc(otyp / 2) ? pair[0] : pair[1]);
      expect(getCost(s.state, defs, e, shk)).toBe(obj(as!).cost); // no 4/3 surcharge
      // known glass is worth nothing: the minimum 5
      s.state.discovered.push(glass);
      expect(getCost(s.state, defs, e, shk)).toBe(5);
    }
    // a real gem costs its own price (plus the 4/3 surcharge when its id is a multiple of 4)
    const d = ent(s, s.carry('nh:diamond'));
    expect(getCost(s.state, defs, d, shk)).toBe(d.id % 4 === 0 ? 5333 : 4000);
  });

  test("set_cost(): an unidentified gem or glass fetches 3 to 8, by the shopkeeper's id", () => {
    const s = make();
    const diamond = ent(s, s.carry('nh:diamond', { quantity: 2 })); // offset 1
    const glass = ent(s, s.carry('nh:worthless_piece_of_red_glass')); // offset 24
    const stone = ent(s, s.carry('nh:luckstone')); // mineral: half price, no 3/4
    for (const shkId of [3, 4, 5]) {
      const m = 6 - (shkId % 3); // 6, 5, 4
      expect(setCost(s.state, defs, diamond, shkId)).toBe(((1 % m) + 3) * 2);
      expect(setCost(s.state, defs, glass, shkId)).toBe((24 % m) + 3);
      expect(setCost(s.state, defs, stone, shkId)).toBe(30);
    }
    // hand-worked: shopkeeper 4 (6 - 1 = 5) pays (24 % 5 + 3) = 7 for the red glass
    expect(setCost(s.state, defs, glass, 4)).toBe(7);
    s.state.discovered.push('nh:diamond');
    expect(setCost(s.state, defs, diamond, 4)).toBe(4000); // known: half of 2 x 4000
  });
});

describe('wishes', () => {
  const names = wishNames(freshState(1), defs, messagesEn);
  const what = (s: string) => {
    const r = readobjnam(s, names);
    if (r === null || r === 'nothing') throw new Error(s);
    return r.what;
  };

  test('gem names, glass and gray stones resolve', () => {
    expect(what('luckstone')).toMatchObject({ types: ['nh:luckstone'] });
    expect(what('diamond')).toEqual({ kind: 'type', type: 'nh:diamond' });
    expect(what('ruby')).toEqual({ kind: 'type', type: 'nh:ruby' }); // not the ruby potion
    expect(what('blessed loadstone')).toMatchObject({ types: ['nh:loadstone'] });
    for (const w of ['worthless piece of red glass', 'red glass'])
      expect(what(w)).toMatchObject({ types: ['nh:worthless_piece_of_red_glass'] });
    expect(what('turquoise stone')).toMatchObject({ types: ['nh:turquoise'] });
    expect(what('gray stone')).toEqual({
      kind: 'types',
      types: ['nh:luckstone', 'nh:loadstone', 'nh:touchstone', 'nh:flint_stone'],
      xtra: 0,
    });
    expect(what('glass')).toMatchObject({ kind: 'types', types: GLASS_GEMS });
    expect(readobjnam('broken glass', names)).toBeNull();
  });
});

describe('the scroll of blank paper', () => {
  test('reading it: "This scroll seems to be blank.", it is learned and kept', () => {
    const s = make();
    const sc = s.carry('nh:scroll_of_blank_paper');
    expect(xname(s, sc)).toBe('unlabeled scroll');
    expect(textOf(s.mod('nh:read', { item: sc }))).toEqual(['This scroll seems to be blank.']);
    expect(itemOf(s.state, sc).carriedBy).toBe(s.state.playerId);
    expect(xname(s, sc)).toBe('scroll of blank paper');
    expect(inventoryOf(s.state, s.state.playerId).some((o) => o.id === sc)).toBe(true);
  });
});
