// m19 step 1: the new objects. The 15 tools, the tin and the potion of oil exist, are made
// with mksobj_init()'s charges, fuel, djinni and tin contents, named, wished for, priced,
// polymorphed into and recharged; Orcus Town makes its magic marker or magic lamp (m17.orcus).
// Outcomes are asserted over many seeds, never a lucky one.
// ref: src/mkobj.c mksobj_init(), fixup_oil(); src/eat.c set_tin_variety(), tin_details();
// src/objnam.c xname(), doname_base(), readobjnam(); src/zap.c poly_obj(); src/read.c
// recharge(); src/shk.c getprice(); src/dog.c dogfood()
import {
  createEngine,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type GameEvent,
  type GameState,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import { MAX_OIL_IN_FLASK, isDiluted, setDiluted } from '../src/dilute';
import { MANFOOD, dogfood } from '../src/dog';
import { isEdible } from '../src/eat';
import { mksobj } from '../src/items';
import { messagesEn } from '../src/messages.en';
import { mksobjFull } from '../src/mkobj';
import { discover } from '../src/o_init';
import { doname } from '../src/objnam';
import { readobjnam, wishNames, type WishSpec } from '../src/objnam_read';
import { polyObj } from '../src/polyobj';
import { getprice } from '../src/price';
import { recharge } from '../src/seffect';
import { veggyItem } from '../src/shtypes';
import { HOMEMADE_TIN, ROTTEN_TIN, TIN, TINTXT, setTinVariety, tinVariety } from '../src/tins';
import { mkWished } from '../src/wish';
import { addMon } from './helpers';
import { ctxFor, defs, freshState, levelSetup, obj, render } from './itemHelpers';
import { setObjKnown } from '../src/items';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'mo',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'mo:run',
      labelKey: 'mo',
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
  return textsOf(eng.step(state, { type: 'mod', action: 'mo:run' as DefId }).events);
}
const ent = (state: GameState, id: EntityId): Entity => {
  const e = state.entities[String(id)];
  if (!e) throw new Error(`no entity ${id}`);
  return e;
};
const nameOf = (state: GameState, id: EntityId): string =>
  render(doname(state, defs, ent(state, id), { noPrice: true }));

const NEW_TOOLS = [
  'nh:magic_lamp',
  'nh:towel',
  'nh:tinning_kit',
  'nh:tin_opener',
  'nh:magic_marker',
  'nh:wooden_flute',
  'nh:magic_flute',
  'nh:tooled_horn',
  'nh:frost_horn',
  'nh:fire_horn',
  'nh:horn_of_plenty',
  'nh:wooden_harp',
  'nh:magic_harp',
  'nh:leather_drum',
  'nh:drum_of_earthquake',
];

describe('the rows', () => {
  test("objects.h's order: the lamps, the towel, the kit and opener, the marker, the instruments", () => {
    const ids = defs.objects.map((d) => d.id as string);
    const after = (a: string, b: string): void => expect(ids.indexOf(b)).toBe(ids.indexOf(a) + 1);
    after('nh:oil_lamp', 'nh:magic_lamp');
    after('nh:blindfold', 'nh:towel');
    // the saddle, leash and stethoscope (m22 step 2)
    after('nh:towel', 'nh:saddle');
    after('nh:saddle', 'nh:leash');
    after('nh:leash', 'nh:stethoscope');
    after('nh:stethoscope', 'nh:tinning_kit');
    after('nh:tinning_kit', 'nh:tin_opener');
    after('nh:tin_opener', 'nh:figurine');
    after('nh:figurine', 'nh:magic_marker');
    const band = [
      'nh:magic_whistle',
      'nh:wooden_flute',
      'nh:magic_flute',
      'nh:tooled_horn',
      'nh:frost_horn',
      'nh:fire_horn',
      'nh:horn_of_plenty',
      'nh:wooden_harp',
      'nh:magic_harp',
      'nh:bell',
      'nh:bugle',
      'nh:leather_drum',
      'nh:drum_of_earthquake',
    ];
    for (let i = 1; i < band.length; i++) after(band[i - 1]!, band[i]!);
    // the tin closes the food class, oil comes just before water
    const food = defs.objects.filter((d) => d.class === 'food').map((d) => d.id);
    expect(food[food.length - 1]).toBe(TIN);
    after('nh:potion_of_oil', 'nh:potion_of_water');
    for (const id of NEW_TOOLS) expect(defs.object(id as DefId).class).toBe('tool');
  });

  test('the potion shuffle covers 26 potions: 25 shuffled descriptions, water stays clear', () => {
    for (const seed of [1, 2, 3]) {
      const s = freshState(seed);
      const potions = defs.objects.filter((d) => d.class === 'potion');
      expect(potions).toHaveLength(26);
      const looks = potions.filter((d) => d.descKey === undefined).map((d) => s.appearances[d.id]);
      expect(looks).toHaveLength(25);
      expect(new Set(looks).size).toBe(25);
      expect(looks).toContain('nh:murky_potion');
      expect(s.appearances['nh:potion_of_water']).toBeUndefined();
    }
  });
});

describe("mksobj_init()'s new cases", () => {
  const made = (id: string, n = 300): Entity[] => {
    const s = freshState(7);
    const ctx = ctxFor(s);
    return Array.from({ length: n }, () =>
      ent(s, mksobjFull(ctx, obj(id), { artif: false }, { level: s.currentLevel })),
    );
  };

  test('charges: markers and kits 30..99, the horn of plenty 3..20, magic instruments 4..8', () => {
    const range = (id: string): [number, number] => {
      const spes = made(id).map((e) => e.c.item!.spe);
      return [Math.min(...spes), Math.max(...spes)];
    };
    expect(range('nh:magic_marker')).toEqual([30, 99]);
    expect(range('nh:tinning_kit')).toEqual([30, 99]);
    expect(range('nh:horn_of_plenty')).toEqual([3, 20]);
    for (const id of [
      'nh:magic_flute',
      'nh:magic_harp',
      'nh:frost_horn',
      'nh:fire_horn',
      'nh:drum_of_earthquake',
    ])
      expect(range(id)).toEqual([4, 8]);
    // the mundane ones have no charges; a towel is dry
    for (const id of ['nh:wooden_flute', 'nh:tooled_horn', 'nh:towel', 'nh:tin_opener'])
      expect(made(id, 50).every((e) => e.c.item!.spe === 0)).toBe(true);
  });

  test('the magic lamp holds its djinni (spe 1) and is blessed or cursed half the time', () => {
    const lamps = made('nh:magic_lamp', 400);
    expect(lamps.every((e) => e.c.item!.spe === 1)).toBe(true);
    const odd = lamps.filter((e) => e.c.item!.buc !== 'uncursed').length / lamps.length;
    expect(odd).toBeGreaterThan(0.4); // blessorcurse(2)
    expect(odd).toBeLessThan(0.6);
  });

  test('a potion of oil holds 400 turns of oil, made with or without init', () => {
    expect(made('nh:potion_of_oil', 20).every((e) => e.c.item!.age === MAX_OIL_IN_FLASK)).toBe(
      true,
    );
    const s = freshState(1);
    const id = mksobj(ctxFor(s), obj('nh:potion_of_oil'), { init: false });
    expect(ent(s, id).c.item!.age).toBe(400);
  });

  test('tins: spinach 1 time in 6, else meat of a monster with corpse nutrition, a variety', () => {
    const tins = made(TIN, 1200);
    const spinach = tins.filter((e) => e.c.item!.spe === 1);
    expect(spinach.every((e) => e.c.item!.corpseOf === undefined)).toBe(true);
    // (the food class's `!rn2(6)` pairs come on top; a pair is one object here)
    expect(spinach.length / tins.length).toBeGreaterThan(0.12);
    expect(spinach.length / tins.length).toBeLessThan(0.22);
    for (const e of tins.filter((t) => t.c.item!.spe !== 1)) {
      const it = e.c.item!;
      expect(it.corpseOf).toBeDefined();
      const m = defs.monster(it.corpseOf!);
      expect(m.nutrition).toBeGreaterThan(0);
      expect(m.genFlags).not.toContain('nocorpse');
      expect(it.spe).toBeGreaterThanOrEqual(-TINTXT.length);
      expect(it.spe).toBeLessThanOrEqual(-1);
    }
    // blessorcurse(10)
    const odd = tins.filter((e) => e.c.item!.buc !== 'uncursed').length / tins.length;
    expect(odd).toBeGreaterThan(0.05);
    expect(odd).toBeLessThan(0.15);
    const pairs = tins.filter((e) => e.c.item!.quantity === 2).length / tins.length;
    expect(pairs).toBeGreaterThan(0.1);
    expect(pairs).toBeLessThan(0.24);
  });

  test("set_tin_variety(): a lizard tin is never rotten; 'healthy' makes spinach of meat", () => {
    const s = freshState(3);
    const ctx = ctxFor(s);
    for (let i = 0; i < 200; i++) {
      const it = { ...ent(s, mksobj(ctx, obj(TIN), { init: false })).c.item! };
      it.corpseOf = 'nh:lizard' as DefId;
      setTinVariety(ctx.rng, defs, it, 'random');
      expect(-it.spe - 1).not.toBe(ROTTEN_TIN);
      expect(tinVariety(null, it, true)).not.toBe(ROTTEN_TIN);
    }
    const meat = { ...ent(s, mksobj(ctx, obj(TIN), { init: false })).c.item! };
    meat.corpseOf = 'nh:newt' as DefId;
    setTinVariety(ctx.rng, defs, meat, 'healthy');
    expect([meat.spe, meat.corpseOf]).toEqual([1, undefined]);
    const veg = { ...ent(s, mksobj(ctx, obj(TIN), { init: false })).c.item! };
    veg.corpseOf = 'nh:lichen' as DefId;
    for (let i = 0; i < 50; i++) {
      setTinVariety(ctx.rng, defs, veg, 'healthy');
      const r = -veg.spe - 1;
      expect(TINTXT[r]?.fodder).toBe(true);
      expect(r).not.toBe(ROTTEN_TIN);
    }
    // a cursed tin is always rotten (but a lichen's: homemade)
    veg.buc = 'cursed';
    expect(tinVariety(null, veg, true)).toBe(HOMEMADE_TIN);
    veg.corpseOf = 'nh:newt' as DefId;
    expect(tinVariety(null, veg, true)).toBe(ROTTEN_TIN);
  });
});

describe('names', () => {
  const s = freshState(1);
  const ctx = ctxFor(s);
  const make = (id: string, set: (e: Entity) => void = () => undefined): EntityId => {
    const n = mksobj(ctx, obj(id), { init: false });
    set(ent(s, n));
    return n;
  };

  test('a tin: "tin" until known, then its contents; the variety once its contents are known', () => {
    const newt = make(TIN, (e) => {
      e.c.item!.corpseOf = 'nh:newt' as DefId;
      e.c.item!.spe = -(6 + 1); // smoked
    });
    expect(nameOf(s, newt)).toBe('tin');
    ent(s, newt).c.item!.known.spe = true;
    expect(nameOf(s, newt)).toBe('tin of newt meat');
    setObjKnown(ctx, 'cknown', newt, true);
    expect(nameOf(s, newt)).toBe('tin of smoked newt meat');
    ent(s, newt).c.item!.spe = -(HOMEMADE_TIN + 1);
    expect(nameOf(s, newt)).toBe('homemade tin of newt meat');
    ent(s, newt).c.item!.quantity = 2;
    expect(nameOf(s, newt)).toBe('2 homemade tins of newt meat');
    const lichen = make(TIN, (e) => {
      e.c.item!.corpseOf = 'nh:lichen' as DefId;
      e.c.item!.known.spe = true;
    });
    expect(nameOf(s, lichen)).toBe('tin of lichen');
    const spinach = make(TIN, (e) => {
      e.c.item!.spe = 1;
      e.c.item!.known.spe = true;
    });
    expect(nameOf(s, spinach)).toBe('tin of spinach');
    const empty = make(TIN, (e) => (e.c.item!.known.spe = true));
    expect(nameOf(s, empty)).toBe('empty tin');
  });

  test('a diluted potion, a moist or wet towel, partly used candles', () => {
    discover({ state: s }, 'nh:potion_of_oil');
    const oil = make('nh:potion_of_oil', (e) => setDiluted(e.c.item!, true));
    expect(nameOf(s, oil)).toBe('diluted potion of oil');
    setDiluted(ent(s, oil).c.item!, false);
    expect(isDiluted(ent(s, oil).c.item!)).toBe(false);
    expect(nameOf(s, oil)).toBe('potion of oil');
    const towel = make('nh:towel');
    expect(nameOf(s, towel)).toBe('towel');
    ent(s, towel).c.item!.spe = 2;
    expect(nameOf(s, towel)).toBe('moist towel');
    ent(s, towel).c.item!.spe = 3;
    expect(nameOf(s, towel)).toBe('wet towel');
    const candles = make('nh:wax_candle', (e) => {
      e.c.item!.age = 400;
      e.c.item!.quantity = 3;
    });
    expect(nameOf(s, candles)).toBe('3 candles');
    ent(s, candles).c.item!.age = 399;
    expect(nameOf(s, candles)).toBe('3 partly used candles');
  });

  test('charged tools show "(recharged:charges)" once known, implying "uncursed"', () => {
    const marker = make('nh:magic_marker', (e) => {
      e.c.item!.spe = 50;
      e.c.item!.recharged = 1;
      e.c.item!.known.buc = true;
    });
    expect(nameOf(s, marker)).toBe('uncursed magic marker');
    ent(s, marker).c.item!.known.spe = true;
    expect(nameOf(s, marker)).toBe('magic marker (1:50)');
    // a horn of plenty known to be empty, its charges unknown
    const horn = make('nh:horn_of_plenty');
    discover({ state: s }, 'nh:horn_of_plenty');
    setObjKnown(ctx, 'cknown', horn, true);
    expect(nameOf(s, horn)).toBe('empty horn of plenty');
    // undiscovered ones go by their description
    expect(nameOf(s, make('nh:magic_harp'))).toBe('harp');
    expect(nameOf(s, make('nh:frost_horn'))).toBe('horn');
  });
});

describe('wishes', () => {
  const s = levelSetup();
  const names = wishNames(s.state, defs, messagesEn);
  const parse = (text: string, wizard = false): WishSpec => {
    const r = readobjnam(text, names, { wizard });
    if (r === null || r === 'nothing') throw new Error(`no spec for "${text}"`);
    return r;
  };
  const wish = (text: string, wizard = false): Entity => {
    let id: EntityId | null = null;
    run(s.state, (ctx) => {
      id = mkWished(ctx, parse(text, wizard), { wizard });
    });
    if (id === null) throw new Error(`nothing made for "${text}"`);
    return ent(s.state, id);
  };

  test('tins: "tin of newt meat", "tin of spinach", "spinach", "empty tin", "can", varieties', () => {
    const newt = wish('tin of newt meat');
    expect([newt.def, newt.c.item!.corpseOf]).toEqual([TIN, 'nh:newt']);
    expect(newt.c.item!.spe).toBeLessThanOrEqual(0); // spe 0, or a variety 3 times in 4
    for (const text of ['tin of spinach', 'spinach', '2 tins of spinach']) {
      const t = wish(text, true);
      expect([t.def, t.c.item!.spe, t.c.item!.corpseOf]).toEqual([TIN, 1, undefined]);
    }
    const empty = wish('empty tin');
    expect([empty.def, empty.c.item!.spe, empty.c.item!.corpseOf]).toEqual([TIN, 0, undefined]);
    expect(wish('can').def).toBe(TIN);
    expect(wish('tin').def).toBe(TIN);
    // in wizard mode the variety asked for is always honoured
    const smoked = wish('tin of smoked newt meat', true);
    expect([smoked.c.item!.corpseOf, smoked.c.item!.spe]).toEqual(['nh:newt', -(6 + 1)]);
    // a monster without a corpse leaves it as it was made (or empty)
    expect(wish('tin of ghost', true).c.item!.corpseOf).not.toBe('nh:ghost');
  });

  test('the alternate spellings and ranges: "marker", "can opener", "lamp", "horn", "candle"', () => {
    expect(wish('marker').def).toBe('nh:magic_marker');
    expect(wish('can opener').def).toBe('nh:tin_opener');
    const lamps = new Set<string>();
    const horns = new Set<string>();
    for (let i = 0; i < 60; i++) {
      lamps.add(wish('lamp', true).def);
      horns.add(wish('horn').def);
    }
    expect([...lamps].sort()).toEqual(['nh:magic_lamp', 'nh:oil_lamp']);
    expect([...horns].every((h) => h.endsWith('horn') || h === 'nh:horn_of_plenty')).toBe(true);
    expect(horns.size).toBeGreaterThan(1);
    expect(['nh:tallow_candle', 'nh:wax_candle']).toContain(wish('candle').def);
  });

  test('a magic lamp is an oil lamp outside wizard mode; wizard mode keeps the djinni', () => {
    expect(wish('magic lamp').def).toBe('nh:oil_lamp');
    const magic = wish('magic lamp', true);
    expect([magic.def, magic.c.item!.spe]).toEqual(['nh:magic_lamp', 1]);
  });

  test('"lit" lights a lamp; "wet"/"moist" towels; "diluted" potions but not water', () => {
    const lamp = wish('lit oil lamp');
    expect(lamp.c.item!.lit).toBe(true);
    expect(wish('unlit oil lamp').c.item!.lit).toBeUndefined();
    for (let i = 0; i < 20; i++) {
      const wet = wish('wet towel').c.item!.spe;
      expect(wet).toBeGreaterThanOrEqual(3);
      expect(wet).toBeLessThanOrEqual(5);
      const moist = wish('moist towel').c.item!.spe;
      expect(moist).toBeGreaterThanOrEqual(1);
      expect(moist).toBeLessThanOrEqual(2);
    }
    expect(isDiluted(wish('diluted potion of healing').c.item!)).toBe(true);
    expect(isDiluted(wish('diluted potion of water').c.item!)).toBe(false);
    expect(isDiluted(wish('potion of healing').c.item!)).toBe(false);
    expect(wish('empty horn of plenty', true).c.item!.spe).toBe(0);
  });
});

describe('polymorph and recharging', () => {
  test('poly_obj(): a magic lamp comes out an oil lamp with 1500 turns of oil, a marker degraded', () => {
    const s = levelSetup();
    run(s.state, (ctx) => {
      const lamp = ent(s.state, s.carry('nh:oil_lamp'));
      const out = polyObj(ctx, lamp, 'nh:magic_lamp' as DefId);
      expect([out.def, out.c.item!.age]).toEqual(['nh:oil_lamp', 1500]);
      const pen = ent(s.state, s.carry('nh:blindfold'));
      const marker = polyObj(ctx, pen, 'nh:magic_marker' as DefId);
      expect([marker.def, marker.c.item!.recharged]).toEqual(['nh:magic_marker', 1]);
    });
  });

  test('fixup_oil(): a partly used oil becomes a diluted potion; a potion becomes full oil', () => {
    const s = levelSetup();
    run(s.state, (ctx) => {
      const oil = ent(s.state, s.carry('nh:potion_of_oil'));
      oil.c.item!.age = 120;
      const heal = polyObj(ctx, oil, 'nh:potion_of_healing' as DefId);
      expect(isDiluted(heal.c.item!)).toBe(true);
      const full = polyObj(ctx, heal, 'nh:potion_of_oil' as DefId);
      expect(full.c.item!.age).toBe(MAX_OIL_IN_FLASK);
      // a full potion of oil leaves no dilution behind (and polymorph keeps none: potions'
      // erosion does not matter)
      const again = polyObj(ctx, full, 'nh:potion_of_healing' as DefId);
      expect(isDiluted(again.c.item!)).toBe(false);
    });
  });

  test('recharge(): markers once, kits, the horn of plenty, magic instruments, lamps', () => {
    const s = levelSetup();
    run(s.state, (ctx) => {
      const marker = ent(s.state, s.carry('nh:magic_marker', { init: false }));
      marker.c.item!.spe = 20;
      recharge(ctx, marker, 0);
      expect([marker.c.item!.spe, marker.c.item!.recharged]).toEqual([50, 1]);
      marker.c.item!.spe = 2;
      recharge(ctx, marker, 1);
      expect([marker.c.item!.spe, marker.c.item!.recharged]).toEqual([2, 1]);
      const kit = ent(s.state, s.carry('nh:tinning_kit', { init: false }));
      kit.c.item!.spe = 40;
      recharge(ctx, kit, 1);
      expect(kit.c.item!.spe).toBe(75);
      recharge(ctx, kit, -1);
      expect([kit.c.item!.spe, kit.c.item!.recharged]).toEqual([0, 2]);
      const horn = ent(s.state, s.carry('nh:horn_of_plenty', { init: false }));
      recharge(ctx, horn, 0);
      expect(horn.c.item!.spe).toBeGreaterThanOrEqual(2);
      expect(horn.c.item!.spe).toBeLessThanOrEqual(6);
      const harp = ent(s.state, s.carry('nh:magic_harp', { init: false }));
      harp.c.item!.spe = 19;
      recharge(ctx, harp, 1);
      expect(harp.c.item!.spe).toBe(20);
      const lamp = ent(s.state, s.carry('nh:oil_lamp', { init: false }));
      lamp.c.item!.age = 1000;
      recharge(ctx, lamp, 0);
      expect([lamp.c.item!.spe, lamp.c.item!.age]).toEqual([1, 1500]);
      // a tool that takes no charge
      recharge(ctx, ent(s.state, s.carry('nh:towel', { init: false })), 0);
    });
    const texts = run(s.state, (ctx) =>
      recharge(ctx, ent(s.state, s.carry('nh:tin_opener', { init: false })), 0),
    );
    expect(texts).toContain('You have a feeling of loss.');
    const dry = run(s.state, (ctx) => {
      const m = ent(s.state, s.carry('nh:magic_marker', { init: false }));
      m.c.item!.recharged = 1;
      recharge(ctx, m, 0);
    });
    expect(dry).toContain('Your marker seems permanently dried out.');
  });
});

describe('inert until their steps, but priced and fed to pets as C', () => {
  test('Eat on a tin (m19 step 5); a dog takes a tin as people food', () => {
    const s = levelSetup();
    const tin = ent(s.state, s.carry(TIN));
    expect(isEdible({ state: s.state, defs }, tin)).toBe(true);
    const dog = ent(s.state, addMon(s.state, 'nh:little_dog', 3, 1, { asleep: true }));
    expect(dogfood({ state: s.state, defs }, dog, tin)).toBe(MANFOOD);
  });

  test("a tin's monster adds to its price; a spinach tin is health food", () => {
    const s = levelSetup();
    const plain = ent(s.state, s.carry(TIN));
    const base = getprice(s.state, defs, plain, false);
    const meat = ent(s.state, s.carry(TIN, { corpseOf: 'nh:floating_eye' as DefId }));
    expect(getprice(s.state, defs, meat, false)).toBeGreaterThan(base);
    expect(veggyItem({ defs }, plain, obj(TIN))).toBe(false); // an empty tin
    plain.c.item!.spe = 1;
    expect(veggyItem({ defs }, plain, obj(TIN))).toBe(true);
    expect(veggyItem({ defs }, meat, obj(TIN))).toBe(false);
  });
});
