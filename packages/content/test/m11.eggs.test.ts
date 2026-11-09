// m11 step 5: eggs (mkobj.c mksobj_init() EGG, timeout.c attach_egg_hatch_timeout()/hatch_egg(),
// invent.c mergable(), objnam.c doname EGG, eat.c fprefx()/fpostfx() EGG, uhitm.c
// hmon_hitmon_misc_obj() EGG, dothrow.c thitmonst()/breakobj(), dog.c dogfood() EGG) and #sit
// (sit.c dosit(), lay_an_egg()). Outcomes are asserted: monsters are pinned and rolls retried.
import {
  createEngine,
  getPlayer,
  itemsAt,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type GameEvent,
  type Mod,
  type Rng,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { mkWished, messagesEn, readobjnam, vanillaMod, wishNames } from '../src/index';
import { heroAttack } from '../src/combat';
import { CADAVER, POISON, dogfood } from '../src/dog';
import { throwObj } from '../src/dothrow';
import { SIT_ID } from '../src/dosit';
import {
  EGG,
  HATCH_EGG,
  attachEggHatchTimeout,
  canBeHatched,
  eggHatchAt,
  knowsEgg,
  learnEggType,
  setEggCorpsenm,
} from '../src/eggstate';
import { setHeroFemale } from '../src/gender';
import { hungerData } from '../src/hunger';
import { mergable, mksobj } from '../src/items';
import { mksobjFull } from '../src/mkobj';
import { polymon } from '../src/polyself';
import { isStoned, stonedKiller } from '../src/stonestate';
import { addMon } from './helpers';
import { defs, levelSetup, plainKit, render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'pt',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'pt:run',
      labelKey: 'pt',
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

const ROOM = [
  '           ',
  ' ......... ',
  ' ......... ',
  ' ....@.... ',
  ' ......... ',
  ' ......... ',
  '           ',
];
type S = ReturnType<typeof levelSetup>;

function room(seed = 1): S {
  const s = levelSetup(ROOM, seed);
  plainKit(s.state);
  s.step({ type: 'wait' });
  return s;
}
const textsOf = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [render({ key: e.key, params: e.params ?? {} })] : []));
/** Runs `fn` with the engine's own Ctx (real timers) and returns the messages. */
function run(s: S, fn: (ctx: Ctx) => void): string[] {
  probe.fn = fn;
  return textsOf(eng.step(s.state, { type: 'mod', action: 'pt:run' }).events);
}
const ent = (s: S, id: EntityId): Entity | undefined => s.state.entities[String(id)];
/** A new egg of `mon` (no hatch timer unless asked), on her square or in her pack. */
function egg(s: S, mon: string | null, where: 'floor' | 'pack', hatchIn = 0): EntityId {
  let id = 0;
  run(s, (ctx) => {
    const o = where === 'floor' ? { at: s.here } : { carriedBy: s.state.playerId };
    id = mksobj(ctx, defs.object(EGG), { init: false, quantity: 1, ...o });
    if (mon) ent(s, id)!.c.item!.corpseOf = mon as DefId;
    if (hatchIn) attachEggHatchTimeout(ctx, id, hatchIn);
  });
  return id;
}
/** An awake, unmoving monster at (x, y). */
function foe(s: S, def: string, x: number, y: number, hp = 200): EntityId {
  const id = addMon(s.state, def, x, y, { asleep: false });
  const e = ent(s, id)!;
  e.c.hp = { cur: hp, max: hp };
  e.c.actor!.speed = 0;
  return id;
}
const monsOf = (s: S, def: string): Entity[] =>
  Object.values(s.state.entities).filter((e): e is Entity => !!e?.c.monster && e.def === def);
function clearFloor(s: S): void {
  for (const o of itemsAt(defs, s.state, s.here.level, s.here.x, s.here.y))
    delete s.state.entities[String(o.id)];
}
const name = (s: S, id: EntityId): string => render(defs.itemName(s.state, ent(s, id)!));

describe('the row', () => {
  test('objects.h: the egg follows the corpse', () => {
    const ids = defs.objects.map((d) => d.id as string);
    expect(ids.indexOf(EGG)).toBe(ids.indexOf('nh:corpse') + 1);
    expect(defs.object(EGG)).toMatchObject({
      class: 'food',
      prob: 85,
      cost: 9,
      weight: 1,
      material: 'flesh',
      food: { nutrition: 80 },
    });
  });
});

describe('making eggs (mksobj_init() EGG)', () => {
  test('a forced rn2(3) roll makes a typed egg with a hatch timer 151..200 turns away', () => {
    const s = room();
    // deep enough for oviparous monsters among rndmonnum()'s (on DL1 eggs come out generic)
    s.state.levels['dlvl1']!.depth = 12;
    let id = 0;
    run(s, (ctx) => {
      const real = ctx.rng;
      // rn2(3) == 0: a typed egg; the rest of the stream is real
      const rng: Rng = { ...real, rn2: (x) => (x === 3 ? 0 : real.rn2(x)) };
      id = mksobjFull({ ...ctx, rng }, defs.object(EGG), { at: s.here });
    });
    const it = ent(s, id)!.c.item!;
    expect(it.corpseOf).toBeDefined();
    // can_be_hatched(): an oviparous monster, or a killer bee or gargoyle (C's exceptions)
    const kind = it.corpseOf!;
    expect(
      kind === 'nh:killer_bee' ||
        kind === 'nh:gargoyle' ||
        defs.monster(kind).flags.includes('oviparous'),
    ).toBe(true);
    const at = eggHatchAt(s.state, id);
    expect(at).not.toBeNull();
    expect(at! - s.state.turn).toBeGreaterThanOrEqual(151);
    expect(at! - s.state.turn).toBeLessThanOrEqual(200);
  });

  test('can_be_hatched(): oviparous only; a cave spider egg is a giant spider egg', () => {
    const s = room();
    run(s, (ctx) => {
      expect(canBeHatched(ctx, 'nh:jackal' as DefId)).toBeNull();
      expect(canBeHatched(ctx, 'nh:cockatrice' as DefId)).toBe('nh:cockatrice');
      expect(canBeHatched(ctx, 'nh:cave_spider' as DefId)).toBe('nh:giant_spider');
    });
  });

  test('wishing for a "cockatrice egg" gives one that will hatch', () => {
    const s = room();
    const names = wishNames(s.state, defs, messagesEn);
    const spec = readobjnam('cockatrice egg', names);
    if (spec === null || spec === 'nothing') throw new Error('no spec');
    let id: EntityId | null = null;
    run(s, (ctx) => {
      id = mkWished(ctx, spec, { wizard: true });
    });
    expect(id).not.toBeNull();
    expect(ent(s, id!)).toMatchObject({ def: EGG, c: { item: { corpseOf: 'nh:cockatrice' } } });
    expect(eggHatchAt(s.state, id!)).not.toBeNull();
  });
});

describe('names and stacks', () => {
  test('"egg" until the type is known or recognised; " (laid by you)"', () => {
    const s = room();
    const id = egg(s, 'nh:cockatrice', 'pack');
    expect(name(s, id)).toBe('egg');
    expect(name(s, id)).not.toMatch(/cockatrice/);
    run(s, (ctx) => learnEggType(ctx, 'nh:chickatrice' as DefId)); // babies hatch from adult eggs
    expect(knowsEgg(s.state, 'nh:cockatrice' as DefId)).toBe(true);
    expect(name(s, id)).toMatch(/cockatrice egg$/);
    ent(s, id)!.c.item!.spe = 1;
    expect(name(s, id)).toMatch(/cockatrice egg \(laid by you\)$/);
  });

  test('mergable(): same monster and no hatch timer', () => {
    const s = room();
    const a = egg(s, null, 'floor');
    const b = egg(s, null, 'floor');
    // generic eggs on one square stack
    expect(b).toBe(a);
    expect(ent(s, a)!.c.item!.quantity).toBe(2);
    const c = egg(s, 'nh:cockatrice', 'pack');
    const d = egg(s, 'nh:cockatrice', 'pack');
    const e = egg(s, 'nh:cockatrice', 'pack', 50);
    const ok = (x: EntityId, y: EntityId): boolean =>
      mergable(defs, ent(s, x)!, ent(s, y)!, s.state);
    expect(ok(c, d)).toBe(true); // same type, no timers
    expect(ok(c, e)).toBe(false); // hatching eggs don't merge
    expect(ok(e, c)).toBe(false);
    expect(ok(a, c)).toBe(false); // a generic egg and a cockatrice egg
    ent(s, d)!.c.item!.corpseOf = 'nh:garter_snake' as DefId;
    expect(ok(c, d)).toBe(false);
  });
});

describe('hatching (hatch_egg())', () => {
  test('an egg on the floor hatches on its turn: "You see a newt hatch." and it is gone', () => {
    const s = room();
    // a garter snake egg (oviparous, no baby form)
    const id = egg(s, 'nh:garter_snake', 'floor', 3);
    const lines: string[] = [];
    for (let i = 0; i < 4; i++) lines.push(...s.text(s.step({ type: 'wait' })));
    expect(lines).toContain('You see a garter snake hatch.');
    expect(ent(s, id)).toBeUndefined();
    expect(monsOf(s, 'nh:garter_snake')).toHaveLength(1);
    expect(knowsEgg(s.state, 'nh:garter_snake' as DefId)).toBe(true);
  });

  test('her own egg hatches from her pack, tame: "Its hissing sounds like "mommy.""', () => {
    const s = room();
    setHeroFemale(s.state, true);
    const id = egg(s, 'nh:cockatrice', 'pack', 2);
    ent(s, id)!.c.item!.spe = 1;
    const lines: string[] = [];
    for (let i = 0; i < 3; i++) lines.push(...s.text(s.step({ type: 'wait' })));
    expect(lines).toContain('You see a chickatrice drop out of your pack!');
    expect(lines).toContain('Its hissing sounds like "mommy."');
    const [chick] = monsOf(s, 'nh:chickatrice');
    expect(chick?.c.monster?.tame).toBe(20);
    expect(ent(s, id)).toBeUndefined();
  });
});

describe('eating eggs', () => {
  test('a cockatrice egg starts the stoning, "killed by a cockatrice egg"', () => {
    const s = room();
    const id = egg(s, 'nh:cockatrice', 'pack');
    s.mod('nh:eat', { item: id });
    expect(isStoned(s.state)).toBe(true);
    expect(render({ key: stonedKiller(s.state)!.slice(1) })).toBe('cockatrice egg');
  });

  test('a stale egg: "Ugh.  Rotten egg." and nausea', () => {
    // the rotten-food roll (1 in 7 for old food) comes first: find a seed where it passes
    let found = false;
    for (let seed = 1; seed <= 30 && !found; seed++) {
      const s = room(seed);
      const id = egg(s, null, 'pack');
      s.state.turn = 1000; // older than 2 * MAX_EGG_HATCH_TIME
      const lines = s.text(s.mod('nh:eat', { item: id }));
      if (!lines.includes('Ugh.  Rotten egg.')) continue;
      found = true;
      expect(hungerData(s.ctx).vomiting).toBeGreaterThan(0);
    }
    expect(found).toBe(true);
  });

  test('pets: an egg is a cadaver for a carnivore, a cockatrice egg poison', () => {
    const s = room();
    const dog = foe(s, 'nh:little_dog', s.here.x + 1, s.here.y);
    expect(dogfood(s.ctx, ent(s, dog)!, ent(s, egg(s, null, 'floor'))!)).toBe(CADAVER);
    expect(dogfood(s.ctx, ent(s, dog)!, ent(s, egg(s, 'nh:cockatrice', 'pack'))!)).toBe(POISON);
  });
});

describe('hitting with eggs', () => {
  test('a thrown cockatrice egg turns the monster to stone', () => {
    let done = false;
    for (let tries = 0; tries < 30 && !done; tries++) {
      const s = room(tries + 1);
      Object.assign(getPlayer(s.state).c.attributes!, { dex: 18 });
      const j = foe(s, 'nh:jackal', s.here.x + 2, s.here.y);
      const id = egg(s, 'nh:cockatrice', 'pack');
      const lines = run(s, (ctx) => throwObj(ctx, ent(s, id)!, 'e'));
      if (!lines.some((l) => l.startsWith('Splat!  You hit the jackal'))) continue;
      done = true;
      expect(lines).toContain('Splat!  You hit the jackal with a petrifying egg!');
      expect(ent(s, j)).toBeUndefined();
      const statue = itemsAt(defs, s.state, s.here.level, s.here.x + 2, s.here.y).find(
        (o) => o.def === 'nh:statue',
      );
      expect(statue?.c.item?.corpseOf).toBe('nh:jackal');
    }
    expect(done).toBe(true);
  });

  test('a thrown egg splats where it lands (1 time in 100 it does not: obj_resists())', () => {
    let splats = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const s = room(seed);
      const id = egg(s, null, 'pack');
      const lines = run(s, (ctx) => throwObj(ctx, ent(s, id)!, 'e'));
      const left = Object.values(s.state.entities).some((o) => o?.def === EGG);
      expect(lines.includes('Splat!')).toBe(!left);
      if (!left) splats++;
    }
    expect(splats).toBeGreaterThan(0);
  });

  test('hitting a cockatrice with a wielded egg makes it a rock', () => {
    let done = false;
    for (let seed = 1; seed <= 40 && !done; seed++) {
      const s = room(seed);
      const c = foe(s, 'nh:cockatrice', s.here.x + 1, s.here.y);
      for (const o of Object.values(s.state.entities))
        if (o?.c.item?.equipped === 'weapon') o.c.item.equipped = null;
      const id = egg(s, null, 'pack');
      ent(s, id)!.c.item!.equipped = 'weapon';
      const lines = run(s, (ctx) => heroAttack(ctx, c));
      if (!lines.includes('You hit the cockatrice with an egg.')) continue;
      done = true;
      expect(lines).toContain("The egg isn't alive any more...");
      expect(ent(s, id)?.def).toBe('nh:rock');
    }
    expect(done).toBe(true);
  });
});

describe('#sit', () => {
  test('"Sit" is offered on the hero; on the floor: "Having fun sitting on the floor?"', () => {
    const s = room();
    const offers = eng.query(s.state).actionsFor({ kind: 'self' });
    expect(offers.some((o) => o.action.type === 'mod' && o.action.action === SIT_ID)).toBe(true);
    const turn = s.state.turn;
    expect(s.text(s.mod(SIT_ID))).toEqual(['Having fun sitting on the floor?']);
    expect(s.state.turn).toBe(turn + 1);
  });

  test('on an object: "You sit on the egg." "It\'s not very comfortable..."', () => {
    const s = room();
    egg(s, null, 'floor');
    expect(s.text(s.mod(SIT_ID))).toEqual(['You sit on the egg.', "It's not very comfortable..."]);
  });

  test('a female cockatrice form lays a cockatrice egg of her own, at a nutrition cost', () => {
    const s = room();
    setHeroFemale(s.state, true);
    run(s, (ctx) => polymon(ctx, 'nh:cockatrice' as DefId, false));
    clearFloor(s); // the dropped weapon would be sat on
    const hunger = getPlayer(s.state).c.hunger!;
    hunger.nutrition = 900;
    expect(s.text(s.mod(SIT_ID))).toContain('You lay an egg.');
    const laid = itemsAt(defs, s.state, s.here.level, s.here.x, s.here.y).find(
      (o) => o.def === EGG,
    );
    expect(laid?.c.item).toMatchObject({ spe: 1, corpseOf: 'nh:cockatrice' });
    expect(laid?.c.item?.known.spe).toBe(true);
    expect(eggHatchAt(s.state, laid!.id)).not.toBeNull();
    expect(s.state.timers.some((t) => t.kind === HATCH_EGG)).toBe(true);
    expect(hunger.nutrition).toBeLessThanOrEqual(900 - 80);
  });

  test("a male form can't; a hungry one has not the energy", () => {
    const s = room();
    run(s, (ctx) => polymon(ctx, 'nh:cockatrice' as DefId, false));
    clearFloor(s);
    setHeroFemale(s.state, false);
    expect(s.text(s.mod(SIT_ID))).toEqual(["Males can't lay eggs!"]);
    setHeroFemale(s.state, true);
    getPlayer(s.state).c.hunger!.nutrition = 50;
    expect(s.text(s.mod(SIT_ID))).toEqual(["You don't have enough energy to lay an egg."]);
  });
});

describe('set_corpsenm()', () => {
  test('a generic egg never hatches; making it typed keeps a running timer', () => {
    const s = room();
    const id = egg(s, 'nh:cockatrice', 'floor', 40);
    const at = eggHatchAt(s.state, id);
    run(s, (ctx) => setEggCorpsenm(ctx, id, 'nh:garter_snake' as DefId));
    expect(eggHatchAt(s.state, id)).toBe(at);
    run(s, (ctx) => setEggCorpsenm(ctx, id, null));
    expect(eggHatchAt(s.state, id)).toBeNull();
  });
});
