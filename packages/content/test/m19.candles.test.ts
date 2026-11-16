// m19 step 2: candles and oil, and their light. Candles burn through their phases and are
// consumed, light more the more there are, split and merge with their burn timers; potions of
// oil light dimly, burn away, explode when a burning one breaks and burn the face of whoever
// drinks them; the magic lamp burns forever; gnomes carry candles, lit in the dark.
// Outcomes are asserted over searched seeds or pinned monsters, never a lucky one.
// ref: src/apply.c use_candle(), use_lamp(), light_cocktail(), snuff_candle(), catch_lit();
// src/light.c candle_light_range(), obj_split_light_source(), obj_merge_light_sources();
// src/timeout.c begin_burn(), burn_object(), end_burn(); src/potion.c peffect_oil();
// src/explode.c explode_oil(); src/makemon.c m_initinv(); src/invent.c mergable()
import {
  createEngine,
  getPlayer,
  inventoryOf,
  itemsAt,
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
import { burnRec, candleLightRange } from '../src/burnstate';
import { setDiluted } from '../src/dilute';
import { applicable } from '../src/apply';
import { mergable, merged, placeObject, placeOnFloor, splitStack } from '../src/items';
import { catchLit, igniteItems, objLights } from '../src/light';
import { mInitInv } from '../src/mongear';
import { explodeOil } from '../src/oil';
import { addMon } from './helpers';
import { defs, itemOf, levelSetup, plainKit, render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'cn',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'cn:run',
      labelKey: 'cn',
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
/** Runs `fn` with the engine's own Ctx (real timers) and returns the messages. */
function run(state: GameState, fn: (ctx: Ctx) => void): string[] {
  probe.fn = fn;
  const r = eng.step(state, { type: 'mod', action: 'cn:run' as DefId });
  return textsOf(r.events);
}

type S = ReturnType<typeof levelSetup>;
function make(rows: string[] = ['@........'], seed = 1): S {
  const s = levelSetup(rows, seed);
  plainKit(s.state);
  for (const k of Object.keys(s.state.entities)) {
    const e = s.state.entities[k];
    if (e?.c.monster) delete s.state.entities[k];
  }
  // the candles are known by name ("wax candle", not "candle")
  s.state.discovered.push('nh:wax_candle' as DefId, 'nh:tallow_candle' as DefId);
  s.step({ type: 'wait' });
  return s;
}
/** A new item on the hero's square that does not merge into the pile there. */
const loose = (s: S, def: string, quantity = 1): EntityId => {
  const id = s.give(def, { quantity });
  run(s.state, (ctx) => placeObject(ctx, id, s.here.level, s.here.x, s.here.y));
  return id;
};
const step = (s: S, a: Parameters<typeof eng.step>[1]): StepResult => eng.stepAll(s.state, a);
const wait = (s: S): string[] => textsOf(step(s, { type: 'wait' }).events);
const apply = (s: S, item: EntityId): string[] =>
  textsOf(step(s, { type: 'mod', action: 'nh:apply' as DefId, args: { item } }).events);
const quaff = (s: S, item: EntityId): string[] =>
  textsOf(step(s, { type: 'mod', action: 'nh:quaff' as DefId, args: { item } }).events);
const nameOf = (s: S, id: EntityId): string =>
  render(defs.itemName(s.state, s.state.entities[String(id)]!));
const gone = (s: S, id: EntityId): boolean => s.state.entities[String(id)] === undefined;

describe('candle light', () => {
  test('the radius grows with the number of candles', () => {
    // ref: candle_light_range(): 1..3 range 2, 4..8 range 3, 9..15 range 4, 16 range 5
    const r = [1, 3, 4, 8, 9, 15, 16].map(candleLightRange);
    expect(r).toEqual([2, 2, 3, 3, 4, 4, 5]);
    expect(candleLightRange(10000)).toBe(15); // MAX_RADIUS
  });

  test('a lit stack lights by its count; oil gives radius 1, lamps 3', () => {
    const s = make();
    const c = s.carry('nh:wax_candle', { quantity: 9 });
    itemOf(s.state, c).age = 400;
    expect(apply(s, c)).toEqual(["Your wax candles' flames burn brightly!"]);
    const oil = s.floor('nh:potion_of_oil');
    run(s.state, (ctx) => catchLit(ctx, ctx.state.entities[String(oil)]!));
    const lamp = s.floor('nh:oil_lamp');
    itemOf(s.state, lamp).age = 400;
    run(s.state, (ctx) => catchLit(ctx, ctx.state.entities[String(lamp)]!));
    expect(objLights(s.state).map((l) => l.radius)).toEqual([4, 1, 3]);
  });
});

describe('burning candles', () => {
  test('a stack burns through its phases, is consumed, and its light is gone', () => {
    const s = make();
    const c = s.carry('nh:wax_candle', { quantity: 2 });
    itemOf(s.state, c).age = 80;
    apply(s, c);
    expect(itemOf(s.state, c).lit).toBe(true);
    expect(nameOf(s, c)).toBe('2 partly used wax candles (lit)');
    const seen: string[] = [];
    for (let i = 0; i < 90 && !gone(s, c); i++)
      seen.push(...wait(s).filter((t) => /andle|lame/.test(t)));
    expect(seen).toEqual([
      'Your candles are getting short.',
      "Your candles' flames flicker low!",
      'Your wax candles are consumed!',
      'Their flames die.',
    ]);
    expect(gone(s, c)).toBe(true);
    expect(objLights(s.state)).toEqual([]);
    expect(burnRec(s.state, c)).toBeUndefined();
  });

  test('a candle burning on the floor is seen consumed', () => {
    const s = make();
    const c = s.floor('nh:tallow_candle');
    itemOf(s.state, c).age = 10;
    run(s.state, (ctx) => catchLit(ctx, ctx.state.entities[String(c)]!));
    const seen: string[] = [];
    for (let i = 0; i < 12 && !gone(s, c); i++) seen.push(...wait(s));
    expect(seen).toEqual(['You see a tallow candle consumed!', 'Its flame dies.']);
  });

  test('snuffing keeps the unused fuel; a full unlit candle is not partly used', () => {
    const s = make();
    const c = s.carry('nh:tallow_candle');
    itemOf(s.state, c).age = 200;
    expect(nameOf(s, c)).toBe('tallow candle');
    // lit this very turn, the timer still holds all its fuel
    run(s.state, (ctx) => catchLit(ctx, ctx.state.entities[String(c)]!));
    expect(nameOf(s, c)).toBe('tallow candle (lit)');
    wait(s);
    wait(s);
    expect(apply(s, c)).toEqual(['You snuff out your tallow candle.']);
    const left = itemOf(s.state, c).age!;
    expect(left).toBeLessThan(200);
    expect(left).toBeGreaterThan(195);
    expect(burnRec(s.state, c)).toBeUndefined();
    expect(nameOf(s, c)).toBe('partly used tallow candle');
  });

  test('a thrown candle goes out', () => {
    const s = make();
    const c = s.carry('nh:wax_candle');
    itemOf(s.state, c).age = 400;
    apply(s, c);
    step(s, { type: 'mod', action: 'nh:throw' as DefId, args: { item: c } });
    const p = s.state.pendingPrompt?.prompt;
    const r = eng.stepAll(s.state, { type: 'answer', promptId: p?.id ?? '', value: 'e' });
    expect(textsOf(r.events)).toContain("The candle's flame is extinguished.");
    expect(itemOf(s.state, c).lit).toBeUndefined();
    expect(burnRec(s.state, c)).toBeUndefined();
  });

  test('fire lights carried candles and oil, not a lantern', () => {
    const s = make();
    const c = s.carry('nh:wax_candle', { quantity: 3 });
    itemOf(s.state, c).age = 400;
    const oil = s.carry('nh:potion_of_oil');
    const lantern = s.carry('nh:brass_lantern');
    itemOf(s.state, lantern).age = 400;
    const t = run(s.state, (ctx) => igniteItems(ctx, ctx.state.playerId));
    expect(t).toContain('Your wax candles catch light!');
    expect(t.filter((l) => / potion catches light!$/.test(l))).toHaveLength(1);
    expect(s.state.discovered).toContain('nh:potion_of_oil'); // makeknown(POT_OIL)
    expect(itemOf(s.state, c).lit && itemOf(s.state, oil).lit).toBe(true);
    expect(itemOf(s.state, lantern).lit).toBeUndefined();
  });
});

describe('lit stacks', () => {
  test('a split lit stack: both parts lit, each with its own timer, both burn out', () => {
    const s = make();
    const c = s.carry('nh:wax_candle', { quantity: 7 });
    itemOf(s.state, c).age = 20;
    apply(s, c);
    let part = 0;
    run(s.state, (ctx) => {
      part = splitStack(ctx, c, 3);
      const p = getPlayer(ctx.state).c.pos!;
      placeOnFloor(ctx, part, p.level, p.x, p.y);
    });
    expect(itemOf(s.state, part).lit).toBe(true);
    expect(burnRec(s.state, part)?.due).toBe(burnRec(s.state, c)?.due);
    expect(burnRec(s.state, part)?.tok).not.toBe(burnRec(s.state, c)?.tok);
    // 4 carried (radius 3) and 3 on the floor (radius 2)
    expect(
      objLights(s.state)
        .map((l) => l.radius)
        .sort(),
    ).toEqual([2, 3]);
    for (let i = 0; i < 25 && !(gone(s, c) && gone(s, part)); i++) wait(s);
    expect(gone(s, c) && gone(s, part)).toBe(true);
    expect((s.state.modData['nh'] as { burn?: unknown }).burn).toBeUndefined();
  });

  test('lit and unlit candles, ages apart, and burning oil never merge', () => {
    const s = make();
    const a = loose(s, 'nh:wax_candle');
    const b = loose(s, 'nh:wax_candle');
    const e = (id: EntityId) => s.state.entities[String(id)]!;
    itemOf(s.state, a).age = 400;
    itemOf(s.state, b).age = 400;
    expect(mergable(defs, e(a), e(b), s.state)).toBe(true);
    itemOf(s.state, b).age = 374; // 374 / 25 != 400 / 25
    expect(mergable(defs, e(a), e(b), s.state)).toBe(false);
    itemOf(s.state, b).age = 400;
    run(s.state, (ctx) => catchLit(ctx, e(b)));
    expect(mergable(defs, e(a), e(b), s.state)).toBe(false);
    const o1 = loose(s, 'nh:potion_of_oil');
    const o2 = loose(s, 'nh:potion_of_oil');
    run(s.state, (ctx) => {
      catchLit(ctx, e(o1));
      catchLit(ctx, e(o2));
    });
    expect(mergable(defs, e(o1), e(o2), s.state)).toBe(false);
  });

  test('merging lit candles keeps the target timer and drops the other', () => {
    const s = make();
    const a = loose(s, 'nh:wax_candle', 2);
    const b = loose(s, 'nh:wax_candle', 3);
    itemOf(s.state, a).age = 400;
    itemOf(s.state, b).age = 400;
    run(s.state, (ctx) => {
      catchLit(ctx, ctx.state.entities[String(a)]!);
      catchLit(ctx, ctx.state.entities[String(b)]!);
      expect(merged(ctx, ctx.state.entities[String(a)]!, ctx.state.entities[String(b)]!)).toBe(
        true,
      );
    });
    expect(itemOf(s.state, a).quantity).toBe(5);
    expect(burnRec(s.state, a)).toBeDefined();
    expect(burnRec(s.state, b)).toBeUndefined();
    expect(objLights(s.state).map((l) => l.radius)).toEqual([3]);
  });
});

describe('the magic lamp', () => {
  test('lit, it burns for thousands of turns without a timer or fuel', () => {
    const s = make();
    const lamp = s.carry('nh:magic_lamp');
    itemOf(s.state, lamp).spe = 1; // the djinni is inside
    const age = itemOf(s.state, lamp).age;
    expect(apply(s, lamp)).toEqual(['Your lamp is now on.']);
    expect(burnRec(s.state, lamp)).toBeUndefined();
    s.state.turn += 5000; // nothing is scheduled for it
    for (let i = 0; i < 20; i++) wait(s);
    expect(itemOf(s.state, lamp).lit).toBe(true);
    expect(itemOf(s.state, lamp).age).toBe(age);
    expect(objLights(s.state).map((l) => l.radius)).toEqual([3]);
    expect(apply(s, lamp)).toEqual(['Your lamp is now off.']);
  });

  test('without its djinni it has no oil', () => {
    const s = make();
    const lamp = s.carry('nh:magic_lamp');
    itemOf(s.state, lamp).spe = 0;
    expect(apply(s, lamp)).toEqual(['This lamp has no oil.']);
  });
});

describe('potions of oil', () => {
  test('applied: one of the stack is lit, dimly, burns away; the rest stays', () => {
    const s = make();
    const oil = s.carry('nh:potion_of_oil', { quantity: 2 });
    expect(applicable(s.ctx, s.state.entities[String(oil)]!)).toBe(true);
    expect(apply(s, oil)).toEqual([
      'You light your potion.  It gives off a dim light.',
      'f - a potion of oil (lit).', // hold_another_object()
    ]);
    const lit = inventoryOf(s.state, s.state.playerId).find(
      (e) => e.def === 'nh:potion_of_oil' && e.c.item?.lit,
    );
    expect(lit).toBeDefined();
    expect(itemOf(s.state, oil).quantity).toBe(1);
    expect(itemOf(s.state, oil).lit).toBeUndefined();
    expect(nameOf(s, lit!.id)).toBe('potion of oil (lit)');
    expect(objLights(s.state).map((l) => l.radius)).toEqual([1]);
    // snuffed, it rejoins the stack
    expect(apply(s, lit!.id)).toEqual(['You snuff the lit potion.']);
    expect(itemOf(s.state, oil).quantity).toBe(2);
    // a lit one burns away
    itemOf(s.state, oil).quantity = 1;
    itemOf(s.state, oil).age = 4;
    apply(s, oil);
    const seen: string[] = [];
    for (let i = 0; i < 6 && !gone(s, oil); i++) seen.push(...wait(s));
    expect(seen).toEqual(['Your potion of oil has burnt away.']);
  });

  test('quaffed: smooth, castor oil when cursed, a burnt face when burning', () => {
    const s = make();
    const a = s.carry('nh:potion_of_oil');
    expect(quaff(s, a)).toEqual(['That was smooth!']);
    const b = s.carry('nh:potion_of_oil');
    itemOf(s.state, b).buc = 'cursed';
    expect(quaff(s, b)).toEqual(['This tastes like castor oil.']);
    const c = s.carry('nh:potion_of_oil');
    run(s.state, (ctx) => catchLit(ctx, ctx.state.entities[String(c)]!));
    const hp = getPlayer(s.state).c.hp!.cur;
    expect(quaff(s, c)).toEqual(['You burn your face.']);
    const lost = hp - getPlayer(s.state).c.hp!.cur;
    expect(lost).toBeGreaterThanOrEqual(4); // d(4, 4) without fire resistance
    expect(lost).toBeLessThanOrEqual(16);
    expect(gone(s, c)).toBe(true);
  });

  test('a burning potion thrown at a monster explodes in flames', () => {
    let hit = 0;
    for (let seed = 1; seed <= 40 && hit < 3; seed++) {
      const s = make(['@.......'], seed);
      const mon = addMon(s.state, 'nh:gnome_lord', 3, 0, { asleep: true });
      s.state.entities[String(mon)]!.c.actor!.speed = 0; // pinned
      s.state.entities[String(mon)]!.c.hp = { cur: 40, max: 40 };
      const oil = s.carry('nh:potion_of_oil');
      run(s.state, (ctx) => catchLit(ctx, ctx.state.entities[String(oil)]!));
      step(s, { type: 'mod', action: 'nh:throw' as DefId, args: { item: oil } });
      const p = s.state.pendingPrompt?.prompt;
      const r = eng.stepAll(s.state, { type: 'answer', promptId: p?.id ?? '', value: 'e' });
      const t = textsOf(r.events);
      if (!t.some((l) => l.includes('crashes'))) continue; // missed: it shatters on the floor
      hit++;
      expect(t).toContain('The gnome lord is caught in the burning oil!');
      expect(s.state.entities[String(mon)]!.c.hp!.cur).toBeLessThan(40);
      expect(gone(s, oil)).toBe(true);
    }
    expect(hit).toBe(3);
  });

  test('a diluted burning potion explodes for d(3, 4), around its square', () => {
    const s = make(['@.......']);
    const mon = addMon(s.state, 'nh:gnome_lord', 4, 0, { asleep: true });
    s.state.entities[String(mon)]!.c.hp = { cur: 40, max: 40 };
    // (out of the blast: a breaking potion is in flight, not on the floor it would relight)
    const oil = s.floor('nh:potion_of_oil', { at: { level: 'dlvl1', x: 7, y: 0 } });
    setDiluted(itemOf(s.state, oil), true);
    const t = run(s.state, (ctx) => {
      const o = ctx.state.entities[String(oil)]!;
      catchLit(ctx, o);
      explodeOil(ctx, o, 5, 0);
    });
    expect(t).toContain('The gnome lord is caught in the burning oil!');
    const lost = 40 - s.state.entities[String(mon)]!.c.hp!.cur;
    expect(lost).toBeGreaterThanOrEqual(2); // half when resisted
    expect(lost).toBeLessThanOrEqual(12);
    expect(itemOf(s.state, oil).lit).toBeUndefined();
  });
});

describe('gnome candles', () => {
  /** A gnome made on a Mines level while it is being created, in the dark or in the light. */
  function gnomeGear(seed: number, dark: boolean, inMklev: boolean): EntityId[] {
    const s = make(['@.......'], seed);
    const lv = s.state.levels['dlvl1']!;
    lv.dungeon = 'nh:mines';
    if (dark) lv.lit = lv.lit.map(() => 0);
    const g = addMon(s.state, 'nh:gnome', 4, 0);
    let out: EntityId[] = [];
    run(s.state, (ctx) => {
      mInitInv(ctx, g, 3, { inMklev });
      out = inventoryOf(ctx.state, g)
        .filter((e) => e.def === 'nh:tallow_candle' || e.def === 'nh:wax_candle')
        .map((e) => e.id);
    });
    for (const id of out) {
      expect(itemOf(s.state, id).quantity).toBe(1);
      expect(itemOf(s.state, id).lit === true).toBe(dark);
      expect(burnRec(s.state, id) !== undefined).toBe(dark);
    }
    return out;
  }

  test('one gnome in 20 carries a candle in the Mines, lit in the dark', () => {
    let n = 0;
    for (let seed = 1; seed <= 400; seed++) n += gnomeGear(seed, true, true).length;
    expect(n / 400).toBeGreaterThan(0.02);
    expect(n / 400).toBeLessThan(0.09);
  });

  test('unlit on a lit square; rarer outside level creation', () => {
    let lit = 0;
    let later = 0;
    for (let seed = 1; seed <= 400; seed++) {
      lit += gnomeGear(seed, false, true).length;
      later += gnomeGear(seed, true, false).length;
    }
    expect(lit).toBeGreaterThan(0);
    expect(later / 400).toBeLessThan(0.04); // 1 in 60
  });
});

describe('apply offers', () => {
  test('candles, the magic lamp and potions of oil can be applied', () => {
    const s = make();
    for (const id of ['nh:wax_candle', 'nh:tallow_candle', 'nh:magic_lamp', 'nh:potion_of_oil'])
      expect(applicable(s.ctx, s.state.entities[String(s.carry(id))]!), id).toBe(true);
  });

  test('a lit candle in a floor pile is shown lit by its name', () => {
    const s = make();
    const c = s.floor('nh:wax_candle', { quantity: 3 });
    itemOf(s.state, c).age = 400;
    run(s.state, (ctx) => catchLit(ctx, ctx.state.entities[String(c)]!));
    const here = itemsAt(defs, s.state, 'dlvl1', s.here.x, s.here.y);
    expect(here.map((e) => nameOf(s, e.id))).toEqual(['3 wax candles (lit)']);
  });
});
