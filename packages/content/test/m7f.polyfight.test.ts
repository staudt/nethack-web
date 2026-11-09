// m7f-d step 5: fighting as a form. The polymorphed hero attacks with each of her form's attacks
// (hmonas()) through the damage-type functions, the target's passive answers each blow, monsters
// hit her form (its AC, an unsolid form slipping a grab) and her form's passive answers them
// (passiveum()), forms that explode or engulf, kicking as a form, experience, and the
// enlightenment lines. Rolls are forced with a rigged Rng, never a lucky seed.
// ref: src/uhitm.c hmonas(), damageum(), explum(), gulpum(), passive(); src/mhitu.c mattacku(),
// hitmu(), passiveum(); src/do_wear.c find_ac(); src/dokick.c dokick(); src/insight.c
import {
  createEngine,
  getPlayer,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type GameEvent,
  type Mod,
  type Rng,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import { heroAttack, monsterAttack } from '../src/combat';
import { polymon } from '../src/polyself';
import { findAc } from '../src/stats';
import { enlightenment } from '../src/enlightenment';
import { isFrozen, mblinded } from '../src/mstate';
import { setUlycn } from '../src/werestate';
import { upolyd } from '../src/upoly';
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

const ROOM = ['         ', ' ....... ', ' ...@... ', ' ....... ', '         '];
type S = ReturnType<typeof levelSetup>;
function room(seed = 1): S {
  const s = levelSetup(ROOM, seed);
  plainKit(s.state);
  return s;
}
const textsOf = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [render({ key: e.key, params: e.params ?? {} })] : []));
function run(s: S, fn: (ctx: Ctx) => void): string[] {
  probe.fn = fn;
  return textsOf(eng.step(s.state, { type: 'mod', action: 'pt:run' }).events);
}

/** Rolls: rnd() and d() and rn2() answer from these, else from the real generator. */
interface Rig {
  rnd?: (x: number) => number;
  d?: (n: number, s: number) => number;
  rn2?: (x: number) => number;
}
const rigged = (ctx: Ctx, r: Rig): Ctx => {
  const real = ctx.rng;
  const rng: Rng = {
    next: () => real.next(),
    rnd: (x) => (r.rnd ? r.rnd(x) : real.rnd(x)),
    d: (n, s) => (r.d ? r.d(n, s) : real.d(n, s)),
    rn2: (x) => (r.rn2 ? r.rn2(x) : real.rn2(x)),
  };
  return { ...ctx, rng };
};
/** Every to-hit roll hits (rnd() is 1) and every damage die is at its maximum. */
const HIT_MAX: Rig = { rnd: () => 1, d: (n, s) => n * s };

const become = (s: S, id: string): string[] => run(s, (ctx) => polymon(ctx, id as DefId, false));
const ent = (s: S, id: EntityId): Entity | undefined => s.state.entities[String(id)];
/** A monster next to her (east), awake and unmoving, with `hp` hit points. */
function foe(s: S, def: string, hp = 50): EntityId {
  const id = addMon(s.state, def, s.here.x + 1, s.here.y, { asleep: false });
  const e = ent(s, id)!;
  e.c.hp = { cur: hp, max: hp };
  e.c.actor!.speed = 0;
  e.c.monster!.level = defs.monster(def as DefId).level;
  return id;
}
const hpOf = (s: S, id: EntityId): number => ent(s, id)?.c.hp?.cur ?? 0;

describe('the form attacks with each of its attacks (hmonas)', () => {
  test('a jaguar claws twice and bites: three rolls, each hit for its own dice', () => {
    const s = room();
    become(s, 'nh:jaguar');
    const j = foe(s, 'nh:jackal');
    const out = run(s, (ctx) => heroAttack(rigged(ctx, HIT_MAX), j));
    expect(out).toEqual(['You hit the jackal.', 'You hit the jackal.', 'You bite the jackal.']);
    expect(hpOf(s, j)).toBe(50 - 4 - 4 - 8);
  });

  test('each attack rolls to hit on its own: all three miss', () => {
    const s = room();
    become(s, 'nh:jaguar');
    const j = foe(s, 'nh:jackal');
    const out = run(s, (ctx) => heroAttack(rigged(ctx, { rnd: (x) => x }), j));
    expect(out.filter((m) => m === 'You miss the jackal.')).toHaveLength(3);
    expect(hpOf(s, j)).toBe(50);
  });

  test("a soldier ant's poisonous sting goes through the poison damage type", () => {
    const s = room();
    become(s, 'nh:soldier_ant');
    const j = foe(s, 'nh:jackal');
    // rn2() is always 0: not negated, poisoned (1 in 8), deadly (1 in 10)
    const out = run(s, (ctx) => heroAttack(rigged(ctx, { ...HIT_MAX, rn2: () => 0 }), j));
    expect(out).toContain('You bite the jackal.');
    expect(out).toContain('You sting the jackal.');
    expect(out).toContain('Your sting was poisoned!');
    expect(out).toContain('Your poison was deadly...');
    expect(out).toContain('You kill the jackal!');
    expect(ent(s, j)?.c.monster).toBeUndefined();
  });

  test('a weapon-using form hits with its wielded weapon through known_hitum()', () => {
    const s = room();
    become(s, 'nh:dwarf');
    const j = foe(s, 'nh:jackal');
    const out = run(s, (ctx) => heroAttack(rigged(ctx, { ...HIT_MAX, rn2: (x) => x - 1 }), j));
    // the Valkyrie's +1 spear: d6 against a small monster, no Str bonus while polymorphed
    expect(out[0]).toMatch(/^You hit the jackal/);
    expect(hpOf(s, j)).toBe(50 - 6 - 1);
  });

  test('a form with passive attacks only cannot attack', () => {
    const s = room();
    become(s, 'nh:floating_eye');
    const j = foe(s, 'nh:jackal');
    const out = run(s, (ctx) => heroAttack(ctx, j));
    expect(out).toEqual(['You have no way to attack monsters physically.']);
    expect(hpOf(s, j)).toBe(50);
  });

  test('killing as a form gives experience', () => {
    const s = room();
    become(s, 'nh:jaguar');
    const before = getPlayer(s.state).c.experience!.points;
    const j = foe(s, 'nh:gnome_lord', 1);
    run(s, (ctx) => heroAttack(rigged(ctx, HIT_MAX), j));
    expect(ent(s, j)?.c.monster).toBeUndefined();
    expect(getPlayer(s.state).c.experience!.points).toBeGreaterThan(before);
  });
});

describe("the target's passive answers each attack", () => {
  test('a jaguar clawing a cockatrice turns to stone at the first claw (no gloves)', () => {
    const s = room();
    become(s, 'nh:jaguar');
    const c = foe(s, 'nh:cockatrice');
    const out = run(s, (ctx) => heroAttack(rigged(ctx, HIT_MAX), c));
    expect(out.filter((m) => m === 'You hit the cockatrice.')).toHaveLength(1);
    expect(out).toContain('You turn to stone...');
    expect(s.state.gameOver).toBeTruthy();
  });

  test('a bite into an acid blob splashes her, once per bite', () => {
    const s = room();
    become(s, 'nh:jackal');
    const b = foe(s, 'nh:acid_blob');
    // rn2() answers its maximum: the 1 in 2 splash happens (rn2(2) is 1)
    const out = run(s, (ctx) => heroAttack(rigged(ctx, { ...HIT_MAX, rn2: (x) => x - 1 }), b));
    expect(out).toContain('You bite the acid blob.');
    expect(out).toContain("You are splashed by the acid blob's acid!");
  });
});

describe('monsters hitting the form (find_ac(), passiveum())', () => {
  test("her armor class is her form's base, minus the armor she still wears", () => {
    const s = room();
    const own = run(
      s,
      (ctx) => void expect(findAc(ctx.state, ctx.defs, ctx.state.playerId)).toBeLessThan(10),
    );
    expect(own).toEqual([]);
    become(s, 'nh:jaguar'); // no hands: her shield falls
    run(s, (ctx) => expect(findAc(ctx.state, ctx.defs, ctx.state.playerId)).toBe(6));
    become(s, 'nh:soldier_ant');
    run(s, (ctx) => expect(findAc(ctx.state, ctx.defs, ctx.state.playerId)).toBe(3));
  });

  test('an acid blob form splashes the jackal that bit it, and the acid kills it', () => {
    const s = room();
    become(s, 'nh:acid_blob');
    getPlayer(s.state).c.hp = { cur: 30, max: 30 };
    const j = foe(s, 'nh:jackal', 5);
    // the 1 in 2 splash happens; nothing else rolls low
    const rn2 = (x: number): number => (x === 2 ? 0 : x - 1);
    const out = run(s, (ctx) => monsterAttack(rigged(ctx, { ...HIT_MAX, rn2 }), j));
    // (an acid blob has no eyes: she is blind and names it "it")
    expect(out).toEqual(['It bites!', 'It is splashed by your acid!', 'It dies!']);
    expect(ent(s, j)?.c.monster).toBeUndefined();
  });

  test("a floating eye form's gaze freezes the jackal that bit it", () => {
    const s = room();
    become(s, 'nh:floating_eye');
    getPlayer(s.state).c.hp = { cur: 30, max: 30 };
    const j = foe(s, 'nh:jackal', 5);
    ent(s, j)!.c.monster!.asleep = false;
    const out = run(s, (ctx) => monsterAttack(rigged(ctx, { ...HIT_MAX, rn2: (x) => x - 1 }), j));
    expect(out).toContain('The jackal is frozen by your gaze!');
    run(s, (ctx) => expect(isFrozen(ctx, j)).toBe(true));
  });

  test("an owlbear's hug passes right through a fog cloud form", () => {
    const s = room();
    become(s, 'nh:fog_cloud');
    getPlayer(s.state).c.hp = { cur: 60, max: 60 };
    const o = foe(s, 'nh:owlbear');
    ent(s, o)!.c.monster!.asleep = false;
    const out = run(s, (ctx) => monsterAttack(rigged(ctx, HIT_MAX), o));
    // (a fog cloud has no eyes: she can't see the owlbear)
    expect(out.some((m) => /grab attempt passes right through you!$/.test(m))).toBe(true);
  });
});

describe('exploding and engulfing forms', () => {
  test('a yellow light form explodes: the jackal is blinded, she returns to human form', () => {
    const s = room();
    become(s, 'nh:yellow_light');
    const j = foe(s, 'nh:jackal');
    ent(s, j)!.c.monster!.asleep = false;
    const out = run(s, (ctx) => heroAttack(rigged(ctx, HIT_MAX), j));
    expect(out).toContain('You explode!');
    expect(out).toContain('It is blinded by your flash of light!'); // (no eyes: she is blind)
    expect(out).toContain('You return to human form!');
    expect(upolyd(s.state)).toBe(false);
    run(s, (ctx) => expect(mblinded(ctx, j)).toBe(127));
  });

  test('a fog cloud form engulfs the jackal for a round and expels it', () => {
    const s = room();
    become(s, 'nh:fog_cloud');
    const j = foe(s, 'nh:jackal');
    const out = run(s, (ctx) => heroAttack(rigged(ctx, HIT_MAX), j));
    expect(out).toEqual([
      // (a fog cloud has no eyes: she is blind)
      'You engulf it!',
      'It is laden with your moisture.',
      'You expel it!',
    ]);
    expect(hpOf(s, j)).toBe(50 - 6);
  });
});

describe('kicking as a form', () => {
  test('a limbless form has no legs to kick with', () => {
    const s = room();
    become(s, 'nh:floating_eye');
    const out = textsOf(
      eng.step(s.state, { type: 'mod', action: 'nh:kick' as DefId, args: { dir: 'e' } as never })
        .events,
    );
    expect(out).toEqual(['You have no legs to kick with.']);
  });
});

describe('enlightenment', () => {
  test('"You are polymorphed into a jaguar." and a lycanthrope "in beast form"', () => {
    const s = room();
    become(s, 'nh:jaguar');
    run(s, (ctx) => {
      const lines = enlightenment(ctx).map((m) => render(m));
      expect(lines).toContain('You are polymorphed into a jaguar.');
    });
    run(s, (ctx) => {
      setUlycn(ctx, 'nh:werejackal' as DefId);
      polymon(ctx, 'nh:werejackal' as DefId, false);
      const lines = enlightenment(ctx).map((m) => render(m));
      expect(lines).toContain('You are a werejackal in beast form.');
      expect(lines.some((l) => l.includes('polymorphed into'))).toBe(false);
    });
  });
});
