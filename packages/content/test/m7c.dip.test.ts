// m7c step 4: #dip into a fountain (items and "Wash your hands"), water damage, every rnd(30)
// outcome of a dip and the Lady of the Lake refusing the neutral Valkyrie. Outcomes are reached
// by burning RNG draws before the dip (the same as a seed search) and recognised by their
// effect, never by a lucky seed.
import {
  cellIndex,
  contents,
  createEngine,
  createRng,
  getPlayer,
  inventoryOf,
  itemsAt,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type GameState,
  type Mod,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { setTerrain } from '../src/terrain';
import {
  DIP_ID,
  FTN_LOOTED,
  FTN_WARNED,
  T,
  dipfountain,
  fountainBits,
  mksobj,
  setFountainBits,
  somegold,
  vanillaMod,
  waterDamage,
} from '../src/index';
import { beginBurn } from '../src/light';
import { setup } from './helpers';
import { ctxFor, defs, render, type TestCtx } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'dip-probe',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'dip-probe:run',
      labelKey: 'dip-probe',
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

const texts = (r: StepResult): string[] =>
  r.events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );

function run(state: GameState, fn: (ctx: Ctx) => void): string[] {
  probe.fn = fn;
  return texts(engine.step(state, { type: 'mod', action: 'dip-probe:run' }));
}

const ROOM = [
  '-------------',
  '|...........|',
  '|...........|',
  '|.....@.....|',
  '|...........|',
  '|...........|',
  '-------------',
];
const F = { x: 6, y: 3 };

function room(seed = 1) {
  const s = setup(ROOM, seed);
  s.level.rooms = [{ lx: 1, ly: 1, hx: 11, hy: 5, lit: true }];
  setTerrain(s.level, F.x, F.y, T.fountain);
  return s;
}

const give = (state: GameState, id: string, quantity = 1): EntityId =>
  mksobj(ctxFor(state), defs.object(id as DefId), {
    init: false,
    quantity,
    carriedBy: state.playerId,
  });
const cx = (st: GameState): Ctx & TestCtx => ctxFor(st) as unknown as Ctx & TestCtx;
const ent = (state: GameState, id: EntityId): Entity => state.entities[String(id)]!;
const fountainGone = (state: GameState): boolean =>
  state.levels['dlvl1']!.palette[
    state.levels['dlvl1']!.cells[cellIndex(state.levels['dlvl1']!, F.x, F.y)] ?? 0
  ] === T.floor;
const gold = (state: GameState): number =>
  inventoryOf(state, state.playerId)
    .filter((o) => o.def === 'nh:gold_piece')
    .reduce((n, o) => n + (o.c.item?.quantity ?? 0), 0);

interface Dip {
  state: GameState;
  text: string[];
  /** The first rnd(30) after `k` burnt draws (the fate when nothing draws before it). */
  fate: number;
  cost: number;
  /** For the bath: what somegold() / 10 would take, read from the same stream. */
  bathLoss: number;
}

/** Dips `what` (an item id in `state`, or the hands) after `k` burnt draws, on a copy. */
function dipAt(state: GameState, k: number, what: EntityId | 'hands'): Dip {
  const st = structuredClone(state);
  let fate = 0;
  let cost = 0;
  let bathLoss = 0;
  const text = run(st, (ctx) => {
    for (let i = 0; i < k; i++) ctx.rng.rn2(2);
    const peek = createRng(structuredClone(ctx.state.rng.core));
    fate = peek.rnd(30);
    if (fate === 28) bathLoss = Math.trunc(somegold({ rng: peek }, gold(st)) / 10);
    cost = dipfountain(ctx, DIP_ID, what === 'hands' ? 'hands' : ent(st, what));
  });
  return { state: st, text, fate, cost, bathLoss };
}

function dips(
  state: GameState,
  what: EntityId | 'hands',
  pick: (f: number) => boolean,
  tries = 300,
) {
  const out: Dip[] = [];
  for (let k = 0; k < tries; k++) {
    const d = dipAt(state, k, what);
    if (pick(d.fate)) out.push(d);
  }
  return out;
}

describe('#dip offers', () => {
  test('on a fountain: "Wash your hands" and every item; elsewhere nothing', () => {
    const s = room();
    const sword = give(s.state, 'nh:long_sword');
    const q = engine.query(s.state);
    const self = q
      .actionsFor({ kind: 'self' })
      .filter((o) => o.action.type === 'mod' && o.action.action === DIP_ID);
    expect(self.map((o) => render({ key: o.labelKey }))).toEqual(['Wash your hands']);
    const item = q
      .actionsFor({ kind: 'item', id: sword })
      .find((o) => o.action.type === 'mod' && o.action.action === DIP_ID);
    expect(render({ key: item!.labelKey })).toBe('Dip into the fountain');
    // washing takes a move
    const before = s.state.turn;
    const t = texts(engine.stepAll(s.state, self[0]!.action));
    expect(t[0]).toBe('You wash your hands in the water.');
    expect(s.state.turn).toBeGreaterThan(before);

    const off = room();
    getPlayer(off.state).c.pos!.x = 2;
    const id = give(off.state, 'nh:long_sword');
    const q2 = engine.query(off.state);
    expect(
      q2
        .actionsFor({ kind: 'self' })
        .some((o) => o.action.type === 'mod' && o.action.action === DIP_ID),
    ).toBe(false);
    expect(
      q2
        .actionsFor({ kind: 'item', id })
        .some((o) => o.action.type === 'mod' && o.action.action === DIP_ID),
    ).toBe(false);
  });
});

describe('dipping: the rnd(30) outcomes', () => {
  test('hands: nothing (1-16), a feeling of loss (17-20), three strange feelings (26-28)', () => {
    const s = room();
    const all = dips(s.state, 'hands', () => true, 400);
    const first = (f: number) => all.find((d) => d.fate === f)!.text;
    for (const d of all) expect(d.text[0]).toBe('You wash your hands in the water.');
    for (const d of all.filter((x) => x.fate <= 15))
      expect(d.text[1]).toBe('Nothing seems to happen.');
    // the curse misses the hands silently
    expect(
      first(16)
        .slice(1)
        .filter((t) => !t.includes('fountain')),
    ).toEqual([]);
    for (const d of all.filter((x) => x.fate >= 17 && x.fate <= 20))
      expect(d.text[1]).toBe('A feeling of loss comes over you.');
    expect(first(26)[1]).toBe('A strange tingling runs up your arm.');
    expect(first(27)[1]).toBe('You feel a sudden chill.');
    expect(first(28)[1]).toBe('An urge to take a bath overwhelms you.');
    expect(first(22)[1]).toBe('A large bubble rises to the surface and pops.');
    expect(first(25)[1]).toBe('Water sprays all over you.');
  });

  test('gloved hands: the gloves get wet', () => {
    const s = room();
    const g = give(s.state, 'nh:leather_gloves');
    ent(s.state, g).c.item!.equipped = 'gloves';
    const d = dipAt(s.state, 0, 'hands');
    expect(d.text[0]).toBe('You wash your gloved hands in the water.');
    // dipping the worn gloves themselves is washing too
    expect(dipAt(s.state, 0, g).text[0]).toBe('You wash your gloved hands in the water.');
  });

  test('16 curses the item (not gold); 17-20 uncurse a cursed one with a glow', () => {
    const s = room();
    const food = give(s.state, 'nh:food_ration');
    const coins = give(s.state, 'nh:gold_piece', 5);
    for (const d of dips(s.state, food, (f) => f === 16)) {
      expect(ent(d.state, food).c.item!.buc).toBe('cursed');
    }
    for (const d of dips(s.state, coins, (f) => f === 16)) {
      expect(ent(d.state, coins).c.item!.buc).not.toBe('cursed');
    }
    ent(s.state, food).c.item!.buc = 'cursed';
    const ups = dips(s.state, food, (f) => f >= 17 && f <= 20);
    expect(ups.length).toBeGreaterThan(0);
    for (const d of ups) {
      expect(d.text[0]).toBe('The water glows for a moment.');
      expect(ent(d.state, food).c.item!.buc).toBe('uncursed');
    }
  });

  test('21: a water demon; his wish is answered through #dip, then the fountain dries up', () => {
    const s = room();
    setFountainBits({ state: s.state }, 'dlvl1', F.x, F.y, FTN_WARNED);
    const wish = dips(s.state, 'hands', (f) => f === 21, 3000).find((d) => d.state.pendingPrompt);
    expect(wish).toBeTruthy();
    expect(wish!.cost).toBe(0);
    expect(wish!.state.pendingPrompt!.handler).toBe(DIP_ID);
    expect(fountainGone(wish!.state)).toBe(false);
    const t = texts(
      engine.step(wish!.state, {
        type: 'answer',
        promptId: wish!.state.pendingPrompt!.prompt.id,
        value: 'blessed +2 long sword',
      }),
    );
    expect(t.at(-1)).toBe('The fountain dries up!');
    expect(fountainGone(wish!.state)).toBe(true);
  });

  test('23: water moccasins; 24: a gem once, then the gush', () => {
    const s = room();
    const snakes = dips(s.state, 'hands', (f) => f === 23)[0]!;
    expect(snakes.text[1]).toBe('An endless stream of snakes pours forth!');
    // a gem dip whose fountain did not dry up afterwards (dryup() takes its bits with it)
    const gem = dips(s.state, 'hands', (f) => f === 24).find((d) => !fountainGone(d.state))!;
    expect(gem.text[1]).toBe('You spot a gem in the sparkling waters!');
    expect(fountainBits(gem.state, 'dlvl1', F.x, F.y) & FTN_LOOTED).toBe(FTN_LOOTED);
    expect(
      itemsAt(defs, gem.state, 'dlvl1', F.x, F.y).some((o) => defs.object(o.def).class === 'gem'),
    ).toBe(true);
    setFountainBits({ state: s.state }, 'dlvl1', F.x, F.y, FTN_LOOTED);
    expect(dips(s.state, 'hands', (f) => f === 24)[0]!.text[1]).toBe('Water sprays all over you.');
  });

  test('28: the bath takes somegold() / 10 and clears the looted flag; 10 or less is kept', () => {
    const s = room();
    give(s.state, 'nh:gold_piece', 345);
    setFountainBits({ state: s.state }, 'dlvl1', F.x, F.y, FTN_LOOTED | FTN_WARNED);
    const baths = dips(s.state, 'hands', (f) => f === 28, 600);
    expect(baths.length).toBeGreaterThan(1);
    for (const d of baths) {
      // somegold(345) is 50..345, so 5..34 pieces go
      expect(d.bathLoss).toBeGreaterThanOrEqual(5);
      expect(d.bathLoss).toBeLessThanOrEqual(34);
      expect(gold(d.state)).toBe(345 - d.bathLoss);
      expect(d.text.slice(1, 3)).toEqual([
        'An urge to take a bath overwhelms you.',
        'You lost some of your gold in the fountain!',
      ]);
      expect(fountainBits(d.state, 'dlvl1', F.x, F.y) & FTN_LOOTED).toBe(0);
    }
    const poor = room();
    give(poor.state, 'nh:gold_piece', 10);
    for (const d of dips(poor.state, 'hands', (f) => f === 28)) {
      expect(gold(d.state)).toBe(10);
      expect(d.text).not.toContain('You lost some of your gold in the fountain!');
    }
  });

  test('somegold(): all under 50, else between the floor and the amount', () => {
    const rng = createRng(structuredClone(engine.newGame({ seed: 3 }).state.rng.core));
    expect(somegold({ rng }, 49)).toBe(49);
    for (const [n, lo] of [
      [99, 25],
      [499, 50],
      [999, 100],
      [4999, 500],
      [9999, 1000],
      [20000, 5000],
    ] as const) {
      for (let i = 0; i < 50; i++) {
        const g = somegold({ rng }, n);
        expect(g).toBeGreaterThanOrEqual(lo);
        expect(g).toBeLessThanOrEqual(n);
      }
    }
  });

  test('29: coins far below, once (rnd((bottom - dlevel + 1) * 2) + 5)', () => {
    const s = room();
    setFountainBits({ state: s.state }, 'dlvl1', F.x, F.y, FTN_WARNED);
    const ds = dips(s.state, 'hands', (f) => f === 29);
    expect(ds.length).toBeGreaterThan(0);
    for (const d of ds) {
      expect(d.text[1]).toBe('Far below you, you see coins glistening in the water.');
      const pile = itemsAt(defs, d.state, 'dlvl1', F.x, F.y).find((o) => o.def === 'nh:gold_piece');
      const n = pile?.c.item?.quantity ?? 0;
      expect(n).toBeGreaterThanOrEqual(6);
      expect(n).toBeLessThanOrEqual(2 * 60 + 5); // at most 60 levels down the main dungeon
    }
    setFountainBits({ state: s.state }, 'dlvl1', F.x, F.y, FTN_LOOTED);
    for (const d of dips(s.state, 'hands', (f) => f === 29)) {
      expect(d.text.slice(1).some((t) => t.includes('coins'))).toBe(false);
      expect(itemsAt(defs, d.state, 'dlvl1', F.x, F.y).length).toBe(0);
    }
  });

  test('a damaged item stops half the time: no outcome and no dry-up then', () => {
    const s = room();
    setFountainBits({ state: s.state }, 'dlvl1', F.x, F.y, FTN_WARNED);
    const scroll = give(s.state, 'nh:scroll_of_identify');
    let stopped = 0;
    let went = 0;
    for (let k = 0; k < 40; k++) {
      const d = dipAt(s.state, k, scroll);
      expect(ent(d.state, scroll).def).toBe('nh:scroll_of_blank_paper');
      if (d.text.length > 1)
        went++; // the fading, then an rnd(30) outcome (and maybe a dry-up)
      else {
        stopped++; // only the fading: no outcome, and the fountain stays
        expect(fountainGone(d.state)).toBe(false);
      }
    }
    expect(stopped).toBeGreaterThan(0);
    expect(went).toBeGreaterThan(0);
  });
});

describe('the Lady of the Lake', () => {
  test('refuses the neutral Valkyrie: a cursed sword, maybe -1, and the fountain is gone', () => {
    const s = room();
    getPlayer(s.state).c.experience!.level = 5;
    const sword = give(s.state, 'nh:long_sword');
    ent(s.state, sword).c.item!.erodeproof = true;
    let seen = 0;
    const spes = new Set<number>();
    for (let k = 0; k < 400; k++) {
      const st = structuredClone(s.state);
      let lady = false;
      const text = run(st, (ctx) => {
        for (let i = 0; i < k; i++) ctx.rng.rn2(2);
        lady = createRng(structuredClone(ctx.state.rng.core)).rn2(30) === 0;
        dipfountain(ctx, DIP_ID, ent(st, sword));
      });
      if (!lady) {
        expect(text[0]).not.toContain('freezing mist');
        continue;
      }
      seen++;
      expect(text.slice(0, 2)).toEqual([
        'A freezing mist rises from the water and envelopes the sword.',
        'The fountain disappears!',
      ]);
      const it = ent(st, sword).c.item!;
      expect(it.buc).toBe('cursed');
      expect(it.erodeproof).toBeUndefined();
      spes.add(it.spe);
      expect(fountainGone(st)).toBe(true);
      expect(fountainBits(st, 'dlvl1', F.x, F.y)).toBe(0);
    }
    expect(seen).toBeGreaterThan(2);
    expect([...spes].every((x) => x === 0 || x === -1)).toBe(true);
    // below experience level 5 she never comes
    getPlayer(s.state).c.experience!.level = 4;
    for (let k = 0; k < 60; k++)
      expect(dipAt(s.state, k, sword).text[0]).not.toContain('freezing mist');
  });
});

describe('water damage', () => {
  test('scrolls and spellbooks fade to blank, potions are untouched, iron rusts', () => {
    const s = room();
    const ctx = cx(s.state);
    const scroll = give(s.state, 'nh:scroll_of_identify', 2);
    const book = give(s.state, 'nh:spellbook_of_force_bolt');
    const potion = give(s.state, 'nh:potion_of_healing');
    const sword = give(s.state, 'nh:long_sword');
    const food = give(s.state, 'nh:food_ration');
    expect(waterDamage(ctx, ent(s.state, scroll), null, true)).toBe('damaged');
    expect(ent(s.state, scroll).def).toBe('nh:scroll_of_blank_paper');
    expect(waterDamage(ctx, ent(s.state, scroll), null, true)).toBe('nothing');
    expect(waterDamage(ctx, ent(s.state, book), null, true)).toBe('damaged');
    expect(ent(s.state, book).def).toBe('nh:spellbook_of_blank_paper');
    expect(waterDamage(ctx, ent(s.state, potion), null, true)).toBe('nothing');
    expect(ent(s.state, potion).def).toBe('nh:potion_of_healing');
    expect(waterDamage(ctx, ent(s.state, sword), null, true)).toBe('damaged');
    expect(ent(s.state, sword).c.item!.erosion?.e1).toBe(1);
    expect(waterDamage(ctx, ent(s.state, food), null, true)).toBe('nothing');
    const msgs = ctx.events.flatMap((e) => (e.type === 'msg' ? [render(e)] : []));
    expect(msgs[0]).toMatch(/^Your scrolls labeled .* fade\.$/);
    expect(msgs[1]).toMatch(/^Your .* spellbook fades\.$/);
    expect(msgs[2]).toBe('Your long sword rusts!');
  });

  test('without force, Luck protects: about 1 time in 4 at Luck 0', () => {
    let hurt = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const s = room(seed);
      const id = give(s.state, 'nh:scroll_of_identify');
      if (waterDamage(cx(s.state), ent(s.state, id), null, false) === 'damaged') hurt++;
    }
    expect(hurt).toBeGreaterThan(120); // 75% expected
    expect(hurt).toBeLessThan(180);
  });

  test('a sack lets the water in to its contents; an oilskin sack keeps it out', () => {
    let blanked = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = room(seed);
      const ctx = cx(s.state);
      const sack = give(s.state, 'nh:sack');
      const inside = mksobj(ctx, defs.object('nh:scroll_of_identify' as DefId), { init: false });
      ent(s.state, inside).c.item!.containedIn = sack;
      expect(contents(s.state, sack).map((o) => o.id)).toEqual([inside]);
      expect(waterDamage(ctx, ent(s.state, sack), null, true)).toBe('damaged');
      const msgs = ctx.events.flatMap((e) => (e.type === 'msg' ? [render(e)] : []));
      expect(msgs[0]).toBe('Some water gets into your bag!');
      if (ent(s.state, inside).def === 'nh:scroll_of_blank_paper') blanked++;
    }
    expect(blanked).toBeGreaterThan(5);
    const s = room();
    const ctx = cx(s.state);
    const oil = give(s.state, 'nh:oilskin_sack');
    expect(waterDamage(ctx, ent(s.state, oil), null, true)).toBe('damaged');
    const msgs = ctx.events.flatMap((e) => (e.type === 'msg' ? [render(e)] : []));
    expect(msgs[0]).toBe('The water cannot get into your bag.');
  });

  test('a lit oil lamp goes out', () => {
    const s = room();
    const ctx = cx(s.state);
    const lamp = give(s.state, 'nh:oil_lamp');
    ent(s.state, lamp).c.item!.age = 100;
    beginBurn(ctx, ent(s.state, lamp));
    expect(ent(s.state, lamp).c.item!.lit).toBe(true);
    expect(waterDamage(ctx, ent(s.state, lamp), null, true)).toBe('damaged');
    expect(ent(s.state, lamp).c.item!.lit).toBeUndefined();
  });
});
