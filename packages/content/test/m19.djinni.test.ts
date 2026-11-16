// m19 step 3: the magic lamp and the djinni; bottles. #rub on a wielded magic lamp frees the
// djinni one time in 3 (the lamp becomes a lit oil lamp); djinni_from_bottle()'s five outcomes
// by BUC; the ghost in a milky potion and the djinni in a smoky one, for the hero and for
// monsters (precheck()), rarer with each one born; royal jelly rubbed on eggs.
// Outcomes are asserted by frequency with a tolerance or over searched seeds, never a lucky one.
// ref: src/apply.c dorub(), use_royal_jelly(); src/potion.c djinni_from_bottle(),
// ghost_from_bottle(), dodrink(); src/muse.c precheck(); src/shk.c cost_per_charge()
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
import { vanillaMod } from '../src/index';
import { burnRec } from '../src/burnstate';
import { DJINNI, GHOST, MILKY, SMOKY, occupantDraw } from '../src/bottle';
import { djinniFromBottle } from '../src/djinni';
import { attachEggHatchTimeout, eggHatchAt } from '../src/eggstate';
import { precheck } from '../src/muse';
import { frozenTime } from '../src/mstate';
import { setGenocided } from '../src/vanquished';
import { addMon } from './helpers';
import { itemOf, levelSetup, plainKit, render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'dj',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'dj:run',
      labelKey: 'dj',
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
const textsOf = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [render({ key: e.key, params: e.params ?? {} })] : []));
/** Runs `fn` with the engine's own Ctx and returns the messages. */
function run(state: GameState, fn: (ctx: Ctx) => void): string[] {
  probe.fn = fn;
  return textsOf(eng.step(state, { type: 'mod', action: 'dj:run' as DefId }).events);
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
  s.step({ type: 'wait' });
  return s;
}
const step = (s: S, a: Parameters<typeof eng.step>[1]): StepResult => eng.stepAll(s.state, a);
const rub = (s: S, item: EntityId): StepResult =>
  step(s, { type: 'mod', action: 'nh:rub' as DefId, args: { item } });
const quaff = (s: S, item: EntityId): StepResult =>
  step(s, { type: 'mod', action: 'nh:quaff' as DefId, args: { item } });
const answer = (s: S, value: unknown): StepResult =>
  step(s, {
    type: 'answer',
    promptId: s.state.pendingPrompt!.prompt.id,
    value: value as never,
  });
const monsOf = (st: GameState, def: string) =>
  Object.values(st.entities).filter((e) => e.def === def && e.c.monster);
const offersOn = (s: S, id: EntityId): string[] =>
  eng
    .query(s.state)
    .actionsFor({ kind: 'item', id })
    .map((o) => (o.action.type === 'mod' ? o.action.action : o.action.type));
const born = (st: GameState, id: string, n: number): void => {
  const nh = st.modData['nh'] as { born?: Record<string, number> };
  (nh.born ??= {})[id] = n;
};

/** A carried magic lamp with its djinni. */
function magicLamp(s: S, buc: 'blessed' | 'uncursed' | 'cursed' = 'uncursed'): EntityId {
  const lamp = s.carry('nh:magic_lamp');
  itemOf(s.state, lamp).spe = 1;
  itemOf(s.state, lamp).buc = buc;
  return lamp;
}

describe('djinni_from_bottle(): five outcomes by BUC', () => {
  type Outcome = 'wish' | 'tame' | 'peaceful' | 'vanish' | 'hostile';
  /** Frees `n` djinn from objects of the BUC; each made djinni is checked, then removed. */
  function outcomes(buc: 'blessed' | 'uncursed' | 'cursed', n: number): Record<Outcome, number> {
    const s = make(7);
    const lamp = magicLamp(s, buc);
    const count: Record<Outcome, number> = { wish: 0, tame: 0, peaceful: 0, vanish: 0, hostile: 0 };
    run(s.state, (ctx) => {
      for (let i = 0; i < n; i++) {
        const before = ctx.state.nextEntityId;
        const events: GameEvent[] = [];
        const emit = ctx.emit;
        ctx.emit = (e) => events.push(e);
        const pending = djinniFromBottle(ctx, ctx.state.entities[String(lamp)]!, 'nh:rub' as DefId);
        ctx.emit = emit;
        const keys = events.flatMap((e) => (e.type === 'msg' ? [e.key] : []));
        expect(keys.slice(0, 2)).toEqual(['djinni.emerges', 'djinni.speaks']);
        const made = Object.values(ctx.state.entities).filter(
          (e) => e.def === DJINNI && e.id >= before,
        );
        const m = made[0]?.c.monster;
        if (pending) {
          expect(keys[2]).toBe('djinni.debt');
          expect(ctx.state.pendingPrompt?.prompt.id).toBe('wish');
          expect(made).toEqual([]); // it leaves before the wish
          count.wish++;
          ctx.state.pendingPrompt = null;
        } else if (keys[2] === 'djinni.thanks') {
          expect(m?.tame).toBeGreaterThan(0);
          count.tame++;
        } else if (keys[2] === 'djinni.freed') {
          expect(m?.peaceful).toBe(true);
          expect(m?.tame ?? 0).toBe(0);
          count.peaceful++;
        } else if (keys[2] === 'djinni.about_time') {
          expect(keys[3]).toBe('djinni.vanishes');
          expect(made).toEqual([]);
          count.vanish++;
        } else {
          expect(keys[2]).toBe('djinni.disturbed');
          expect(m?.peaceful).toBe(false);
          count.hostile++;
        }
        for (const e of made) delete ctx.state.entities[String(e.id)];
      }
    });
    return count;
  }
  const N = 600;
  const share = (k: number): number => k / N;

  test('blessed: a wish 80% of the time, each other outcome 5%', () => {
    const c = outcomes('blessed', N);
    expect(share(c.wish)).toBeGreaterThan(0.74);
    expect(share(c.wish)).toBeLessThan(0.86);
    for (const k of [c.tame, c.peaceful, c.vanish, c.hostile]) {
      expect(k).toBeGreaterThan(0);
      expect(share(k)).toBeLessThan(0.1);
    }
  });

  test('uncursed: each outcome 20% of the time', () => {
    const c = outcomes('uncursed', N);
    for (const k of Object.values(c)) {
      expect(share(k)).toBeGreaterThan(0.14);
      expect(share(k)).toBeLessThan(0.26);
    }
  });

  test('cursed: hostile 80% of the time, each other outcome 5%', () => {
    const c = outcomes('cursed', N);
    expect(share(c.hostile)).toBeGreaterThan(0.74);
    expect(share(c.hostile)).toBeLessThan(0.86);
    for (const k of [c.wish, c.tame, c.peaceful, c.vanish]) {
      expect(k).toBeGreaterThan(0);
      expect(share(k)).toBeLessThan(0.1);
    }
  });
});

describe('#rub', () => {
  test('offered on lamps, the lantern and royal jelly only', () => {
    const s = make();
    for (const def of [
      'nh:magic_lamp',
      'nh:oil_lamp',
      'nh:brass_lantern',
      'nh:lump_of_royal_jelly',
    ])
      expect(offersOn(s, s.carry(def))).toContain('nh:rub');
    for (const def of ['nh:long_sword', 'nh:egg', 'nh:wax_candle'])
      expect(offersOn(s, s.carry(def))).not.toContain('nh:rub');
  });

  test('a lamp is wielded first, then rubbed on the next move; lantern and oil lamp do nothing', () => {
    const s = make();
    const lantern = s.carry('nh:brass_lantern');
    const r = rub(s, lantern);
    expect(s.text(r)).toEqual([
      expect.stringMatching(/^You now wield .*lantern\.$/),
      'Rubbing the electric lamp is not particularly rewarding.',
      'Anyway, nothing exciting happens.',
    ]);
    expect(itemOf(s.state, lantern).equipped).toBe('weapon');
    expect(s.state.occupation).toBeNull();
    const t0 = s.state.turn;
    expect(s.text(rub(s, lantern))).toHaveLength(2); // wielded: just the rub
    expect(s.state.turn).toBe(t0 + 1);
    const oil = s.carry('nh:oil_lamp');
    rub(s, oil);
    expect(s.text(rub(s, oil))).toEqual(['Nothing happens.']);
  });

  test('the magic lamp frees its djinni one time in 3 and becomes a lit oil lamp', () => {
    const s = make(3);
    s.state.discovered = s.state.discovered.filter((d) => d !== 'nh:magic_lamp');
    const lamp = magicLamp(s);
    step(s, { type: 'mod', action: 'nh:apply' as DefId, args: { item: lamp } }); // lit
    expect(itemOf(s.state, lamp).lit).toBe(true);
    const lines: string[] = [];
    let rubs = 0;
    while (s.state.entities[String(lamp)]?.def === 'nh:magic_lamp' && rubs < 100) {
      lines.push(...s.text(rub(s, lamp)));
      rubs++;
    }
    expect(s.state.entities[String(lamp)]!.def).toBe('nh:oil_lamp');
    const misses = lines.filter(
      (l) => l === 'You see a puff of smoke.' || l === 'Nothing happens.',
    );
    expect(misses.length).toBeGreaterThanOrEqual(rubs - 2); // the first rub also wields
    expect(lines).toContain('In a cloud of smoke, a djinni emerges!');
    const it = itemOf(s.state, lamp);
    expect(it.spe).toBe(0);
    expect(it.lit).toBe(true); // kept burning, now on rn1(500, 1000) turns of oil
    const left = burnRec(s.state, lamp)!.due - s.state.turn + it.age!;
    expect(left).toBeGreaterThan(990);
    expect(left).toBeLessThanOrEqual(1500);
    expect(s.state.discovered).toContain('nh:magic_lamp');
    if (s.state.pendingPrompt) answer(s, 'nothing');
    // a second rub of the oil lamp: nothing
    expect(s.text(rub(s, lamp))).toEqual(['Nothing happens.']);
  });

  test('a blessed lamp: the djinni grants a wish', () => {
    // search seeds for a freed djinni that grants the wish (80% of blessed ones)
    let found: S | null = null;
    for (let seed = 1; seed <= 20 && !found; seed++) {
      const s = make(seed);
      const lamp = magicLamp(s, 'blessed');
      for (let i = 0; i < 60 && s.state.entities[String(lamp)]?.def === 'nh:magic_lamp'; i++)
        rub(s, lamp);
      if (s.state.pendingPrompt?.prompt.id === 'wish') found = s;
    }
    expect(found).not.toBeNull();
    const s = found!;
    expect(monsOf(s.state, DJINNI)).toEqual([]); // it left before the wish
    const t0 = s.state.turn;
    const r = answer(s, 'blessed amulet of life saving');
    expect(s.state.pendingPrompt).toBeNull();
    expect(s.state.turn).toBe(t0 + 1); // the rub's move is spent with the answer
    const amulet = inventoryOf(s.state, s.state.playerId).find(
      (e) => e.def === 'nh:amulet_of_life_saving',
    );
    expect(amulet?.c.item?.buc).toBe('blessed');
    expect(s.text(r).length).toBeGreaterThan(0);
  });

  test('royal jelly on eggs: a queen bee egg that hatches; cursed, the eggs die', () => {
    const s = make();
    const egg = s.carry('nh:egg', { quantity: 2 });
    itemOf(s.state, egg).corpseOf = 'nh:killer_bee' as DefId;
    const jelly = s.carry('nh:lump_of_royal_jelly', { quantity: 2 });
    itemOf(s.state, jelly).buc = 'blessed';
    const r = rub(s, jelly);
    expect(s.text(r)).toEqual([]);
    expect(s.state.pendingPrompt?.prompt.id).toBe('rub-jelly');
    expect(s.state.pendingPrompt?.prompt.options?.map((o) => o.value)).toEqual([egg]);
    const a = answer(s, egg);
    expect(s.text(a)).toEqual([
      expect.stringMatching(/^You smear royal jelly all over your .*eggs\.$/),
      expect.stringMatching(/^The .*eggs quiver briefly\.$/),
    ]);
    expect(itemOf(s.state, egg).corpseOf).toBe('nh:queen_bee');
    expect(itemOf(s.state, egg).spe).toBe(2); // the hatchling takes her for its parent
    expect(eggHatchAt(s.state, egg)).not.toBeNull();
    expect(itemOf(s.state, jelly).quantity).toBe(1);
    // a cursed lump kills them
    itemOf(s.state, jelly).buc = 'cursed';
    rub(s, jelly);
    expect(s.text(answer(s, egg))).toEqual([
      expect.stringMatching(/^You smear royal jelly/),
      expect.stringMatching(/^The .*eggs quiver feebly\.$/),
    ]);
    expect(eggHatchAt(s.state, egg)).toBeNull();
    expect(s.state.entities[String(jelly)]).toBeUndefined();
  });

  test('royal jelly without eggs; a cancelled menu keeps the lump', () => {
    const s = make();
    const jelly = s.carry('nh:lump_of_royal_jelly');
    const t0 = s.state.turn;
    expect(s.text(rub(s, jelly))).toEqual(["You don't have anything to rub the royal jelly on."]);
    const egg = s.carry('nh:egg');
    run(s.state, (ctx) => attachEggHatchTimeout(ctx, egg, 50));
    rub(s, jelly);
    answer(s, null);
    expect(s.state.turn).toBe(t0);
    expect(itemOf(s.state, jelly).quantity).toBe(1);
  });
});

describe('bottle occupants', () => {
  test('the chance is 1 in 13 + 2 * born, and none once the kind is gone', () => {
    const s = make();
    const rate = (n: number): number => {
      born(s.state, DJINNI, n);
      let k = 0;
      run(s.state, (ctx) => {
        for (let i = 0; i < 6000; i++) if (occupantDraw(ctx, DJINNI)) k++;
      });
      return k / 6000;
    };
    expect(Math.abs(rate(0) - 1 / 13)).toBeLessThan(0.012);
    expect(Math.abs(rate(20) - 1 / 53)).toBeLessThan(0.006);
    run(s.state, (ctx) => {
      setGenocided(ctx, GHOST);
      const before = JSON.stringify(ctx.state.rng);
      for (let i = 0; i < 100; i++) expect(occupantDraw(ctx, GHOST)).toBe(false);
      expect(JSON.stringify(ctx.state.rng)).toBe(before); // no draw
    });
  });

  test('a smoky potion frees a djinni instead of being drunk', () => {
    const s = make(5);
    s.state.appearances['nh:potion_of_see_invisible'] = SMOKY;
    const pots = s.carry('nh:potion_of_see_invisible', { quantity: 40 });
    let r: StepResult | null = null;
    for (let i = 0; i < 40; i++) {
      r = quaff(s, pots);
      if (s.text(r).includes('In a cloud of smoke, a djinni emerges!')) break;
      if (s.state.pendingPrompt) break;
    }
    const t = s.text(r!);
    expect(t.slice(0, 2)).toEqual(['In a cloud of smoke, a djinni emerges!', 'The djinni speaks.']);
    // the potion is used up without its effect
    expect(t.some((l) => /see|peculiar|tastes/i.test(l))).toBe(false);
    expect((s.state.modData['nh'] as { born: Record<string, number> }).born[DJINNI]).toBe(1);
  });

  test('a milky potion holds a ghost: she is frightened to death for 3 moves', () => {
    const s = make(5);
    s.state.appearances['nh:potion_of_see_invisible'] = MILKY;
    const pots = s.carry('nh:potion_of_see_invisible', { quantity: 40 });
    let t: string[] = [];
    let n = 0;
    for (; n < 40; n++) {
      t = s.text(quaff(s, pots));
      if (t[0]?.startsWith('As you open the bottle')) break;
    }
    expect(t.slice(0, 2)).toEqual([
      'As you open the bottle, an enormous ghost emerges!',
      'You are frightened to death, and unable to move.',
    ]);
    expect(t).toContain('You regain your composure.');
    expect(itemOf(s.state, pots).quantity).toBe(40 - n - 1);
    const ghosts = monsOf(s.state, GHOST);
    expect(ghosts).toHaveLength(1);
    const g = ghosts[0]!.c.pos!;
    const h = getPlayer(s.state).c.pos!;
    expect(Math.max(Math.abs(g.x - h.x), Math.abs(g.y - h.y))).toBe(1);
  });

  test('a monster opening a smoky or milky potion (precheck()): the potion is used, it acts', () => {
    const s = make(9);
    s.state.appearances['nh:potion_of_healing'] = SMOKY;
    s.state.appearances['nh:potion_of_extra_healing'] = MILKY;
    const results = { smoky: 0, milky: 0 };
    run(s.state, (ctx) => {
      for (let i = 0; i < 400; i++) {
        const mon = addMon(ctx.state, 'nh:gnome_lord', 1, 1, { asleep: true });
        const smoky = i % 2 === 0;
        const pot = s.give(smoky ? 'nh:potion_of_healing' : 'nh:potion_of_extra_healing', {
          carriedBy: mon,
        });
        born(ctx.state, DJINNI, 0);
        born(ctx.state, GHOST, 0);
        const before = ctx.state.nextEntityId;
        const r = precheck(ctx, mon, ctx.state.entities[String(pot)]!);
        const made = Object.values(ctx.state.entities).filter((e) => e.c.monster && e.id >= before);
        if (r === 2) {
          expect(ctx.state.entities[String(pot)]).toBeUndefined();
          if (smoky) {
            results.smoky++;
            // peaceful, or it vanished ("It is about time.")
            for (const d of made) {
              expect(d.def).toBe(DJINNI);
              expect(d.c.monster?.peaceful).toBe(true);
            }
          } else {
            results.milky++;
            expect(made.map((e) => e.def)).toEqual([GHOST]);
            expect(frozenTime(ctx, mon)).toBe(3);
          }
        } else {
          expect(r).toBe(0);
          expect(made).toEqual([]);
          expect(ctx.state.entities[String(pot)]).toBeDefined();
        }
        for (const e of [...made, ctx.state.entities[String(mon)]!]) {
          for (const o of inventoryOf(ctx.state, e.id)) delete ctx.state.entities[String(o.id)];
          delete ctx.state.entities[String(e.id)];
        }
      }
    });
    // 1 in 13 of 200 each
    for (const k of Object.values(results)) {
      expect(k).toBeGreaterThan(5);
      expect(k).toBeLessThan(35);
    }
  });
});
