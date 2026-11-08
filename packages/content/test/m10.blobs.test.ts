// m10 step 3: blobs, jellies, fungi, vortices, spheres and elementals. The shrieker's shriek
// (forced rolls for the summoned monster), brown pudding division by iron (hero and clone_mon()
// itself), a freezing sphere exploding, an ice vortex engulfing with cold (a hero without the Valkyrie's cold resistance), the jellies' passives.
// ref: src/mon.c m_respond(), m_respond_shrieker(); src/makemon.c clone_mon(); src/uhitm.c
// hmon_hitmon_splitmon(), passive(); src/mhitu.c explmu(), gulpmu()
import {
  getPlayer,
  sortedIds,
  type Ctx,
  type Entity,
  type EntityId,
  type GameEvent,
  type Mod,
  type Rng,
  createEngine,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import { cloneMon } from '../src/clone';
import { heroAttack } from '../src/combat';
import { mksobj } from '../src/items';
import { isFleeing, monflee } from '../src/monflee';
import { isMConfused, setMConfused } from '../src/mstate';
import { mRespond } from '../src/mrespond';
import { P, setIntrinsic } from '../src/props';
import { addMon } from './helpers';
import { obj, plainKit, render } from './itemHelpers';
import { mapSetup } from './maps';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'blob',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'blob:run',
      labelKey: 'blob',
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
const textsOf = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [render({ key: e.key, params: e.params ?? {} })] : []));
type M = ReturnType<typeof mapSetup>;
/** Runs `fn` with a real Ctx; the rendered messages. */
function run(state: M['state'], fn: (ctx: Ctx) => void): string[] {
  probe.fn = fn;
  return textsOf(engine.step(state, { type: 'mod', action: 'blob:run' }).events);
}
/** A Ctx whose rn2() answers from `script` first. */
function scripted(ctx: Ctx, script: number[]): Ctx {
  const real = ctx.rng;
  const rng: Rng = {
    next: () => real.next(),
    rn2: (x) => {
      const v = script.shift();
      if (v === undefined) return real.rn2(x);
      if (v < 0 || v >= x) throw new Error(`scripted rn2(${x}) cannot be ${v}`);
      return v;
    },
    rnd: (x) => real.rnd(x),
    d: (n, s) => real.d(n, s),
  };
  return { ...ctx, rng };
}

const ROOM = [
  '-----------',
  '|.........|',
  '|....@....|',
  '|.........|',
  '|.........|',
  '-----------',
];
function make(seed = 1): M {
  const m = mapSetup(ROOM, { seed });
  plainKit(m.state);
  getPlayer(m.state).c.hp = { cur: 500, max: 500 };
  setIntrinsic(getPlayer(m.state), P.COLD_RES, false); // a Valkyrie's
  return m;
}
const ent = (m: M, id: EntityId): Entity | undefined => m.state.entities[String(id)];
/** A hostile monster of `def` at x,y with `hp` HP and speed `speed`. */
function monAt(m: M, def: string, x: number, y: number, hp = 100, speed = 0): EntityId {
  const id = addMon(m.state, def, x, y, { energy: speed });
  const e = ent(m, id)!;
  e.c.hp = { cur: hp, max: hp };
  e.c.actor!.speed = speed;
  return id;
}
const monsOf = (m: M, def: string): Entity[] =>
  sortedIds(m.state)
    .map((id) => ent(m, id)!)
    .filter((e) => e.c.monster && e.def === def);
const monCount = (m: M): number =>
  sortedIds(m.state).filter((id) => ent(m, id)?.c.monster && id !== m.state.playerId).length;
function unwield(m: M): void {
  for (const e of Object.values(m.state.entities))
    if (e?.c.item?.carriedBy === m.state.playerId && e.c.item.equipped === 'weapon')
      e.c.item.equipped = null;
}
/** Wields a fresh object of `def`. */
function wield(m: M, def: string): void {
  unwield(m);
  const id = mksobj(m.ctx, obj(def), { init: false, carriedBy: m.state.playerId });
  ent(m, id)!.c.item!.equipped = 'weapon';
}

describe('the shrieker', () => {
  test('next to the hero it shrieks and wakes the level; 1 in 10 a monster comes', () => {
    const m = make();
    const shr = monAt(m, 'nh:shrieker', 6, 2);
    const sleeper = monAt(m, 'nh:jackal', 9, 4);
    ent(m, sleeper)!.c.monster!.asleep = true;
    const before = monCount(m);
    // rn2(10) != 0: no monster
    const out = run(m.state, (ctx) => mRespond(scripted(ctx, [1]), ent(m, shr)!));
    expect(out).toEqual(['The shrieker shrieks.']);
    expect(monCount(m)).toBe(before);
    expect(ent(m, sleeper)!.c.monster!.asleep).toBe(false);
    // rn2(10) == 0, rn2(13) != 0: a random monster (makemon(NULL): with its group if it has one)
    const ids0 = new Set(sortedIds(m.state));
    run(m.state, (ctx) => mRespond(scripted(ctx, [0, 1]), ent(m, shr)!));
    const made = sortedIds(m.state)
      .filter((id) => !ids0.has(id))
      .map((id) => ent(m, id)!)
      .filter((e) => e.c.monster);
    expect(made.length).toBeGreaterThan(0);
    expect(monCount(m)).toBe(before + made.length);
    expect(new Set(made.map((e) => e.def)).size).toBe(1);
  });

  test('1 in 13 of those is a purple worm, a baby one when the adult is too strong', () => {
    const m = make();
    const shr = monAt(m, 'nh:shrieker', 6, 2);
    // DL1, XL1: monmax_difficulty is 1, the purple worm (17) is too strong
    run(m.state, (ctx) => mRespond(scripted(ctx, [0, 0]), ent(m, shr)!));
    expect(monsOf(m, 'nh:baby_purple_worm')).toHaveLength(1);
    expect(monsOf(m, 'nh:purple_worm')).toHaveLength(0);
    // deep enough and experienced enough: the adult
    const m2 = make();
    m2.level.depth = 30;
    getPlayer(m2.state).c.experience!.level = 14;
    const shr2 = monAt(m2, 'nh:shrieker', 6, 2);
    run(m2.state, (ctx) => mRespond(scripted(ctx, [0, 0]), ent(m2, shr2)!));
    expect(monsOf(m2, 'nh:purple_worm')).toHaveLength(1);
  });

  test('two squares away it is silent; in play it shrieks on its own turn', () => {
    const m = make();
    const far = monAt(m, 'nh:shrieker', 7, 2);
    expect(run(m.state, (ctx) => mRespond(ctx, ent(m, far)!))).toEqual([]);
    const m2 = make();
    monAt(m2, 'nh:shrieker', 6, 3, 100, 12);
    const out = textsOf(m2.step({ type: 'wait' }).events);
    expect(out).toContain('The shrieker shrieks.');
  });
});

describe('brown pudding division', () => {
  test('hit with an iron weapon it divides: half its HP to the clone, same maximum', () => {
    let divided = 0;
    for (let seed = 1; seed <= 40 && divided < 3; seed++) {
      const m = make(seed);
      wield(m, 'nh:long_sword');
      const id = monAt(m, 'nh:brown_pudding', 6, 2, 60);
      const out = run(m.state, (ctx) => void heroAttack(ctx, id));
      if (!out.includes('The brown pudding divides as you hit it!')) {
        expect(monsOf(m, 'nh:brown_pudding')).toHaveLength(1);
        continue;
      }
      divided++;
      expect(out.some((t) => t.startsWith('You hit'))).toBe(false);
      const [a, b] = monsOf(m, 'nh:brown_pudding');
      expect(b).toBeDefined();
      const sum = a!.c.hp!.cur + b!.c.hp!.cur;
      expect(sum).toBeLessThan(60); // the blow's damage came first
      expect(b!.c.hp!.cur).toBe(Math.trunc(sum / 2));
      expect(b!.c.hp!.max).toBe(60);
      const pa = a!.c.pos!;
      const pb = b!.c.pos!;
      expect(Math.max(Math.abs(pa.x - pb.x), Math.abs(pa.y - pb.y))).toBe(1);
    }
    expect(divided).toBe(3);
  });

  test('a wooden weapon or bare hands never divide it', () => {
    let hits = 0;
    for (let seed = 1; seed <= 30; seed++) {
      for (const weapon of ['nh:club', null]) {
        const m = make(seed);
        if (weapon) wield(m, weapon);
        else unwield(m);
        const id = monAt(m, 'nh:brown_pudding', 6, 2, 60);
        const out = run(m.state, (ctx) => void heroAttack(ctx, id));
        if (out.some((t) => t.startsWith('You hit'))) hits++;
        expect(monsOf(m, 'nh:brown_pudding')).toHaveLength(1);
      }
    }
    expect(hits).toBeGreaterThan(5);
  });

  test('clone_mon(): odd HP stays with the original, conditions copy, 1 HP does not split', () => {
    const m = make();
    const id = monAt(m, 'nh:brown_pudding', 6, 2, 7);
    run(m.state, (ctx) => {
      setMConfused(ctx, id, true);
      monflee(ctx, id, 5, false, false);
    });
    let clone: EntityId | null = null;
    run(m.state, (ctx) => {
      clone = cloneMon(ctx, id, true);
    });
    expect(clone).not.toBeNull();
    expect(ent(m, id)!.c.hp).toEqual({ cur: 4, max: 7 });
    expect(ent(m, clone!)!.c.hp).toEqual({ cur: 3, max: 7 });
    expect(isMConfused(m.ctx, clone!)).toBe(true);
    expect(isFleeing(m.ctx, clone!)).toBe(true);
    const one = monAt(m, 'nh:brown_pudding', 2, 4, 1);
    run(m.state, (ctx) => {
      expect(cloneMon(ctx, one, true)).toBeNull();
    });
  });
});

describe('spheres, vortices and jellies', () => {
  test('a freezing sphere next to the hero explodes and is gone', () => {
    const m = make();
    const id = monAt(m, 'nh:freezing_sphere', 6, 2, 30, 13);
    const out = textsOf(m.step({ type: 'wait' }).events);
    expect(out).toContain('The freezing sphere explodes!');
    expect(ent(m, id)).toBeUndefined();
    expect(getPlayer(m.state).c.hp!.cur).toBeLessThan(500);
  });

  test('an ice vortex engulfs her and freezes her', () => {
    const m = make();
    monAt(m, 'nh:ice_vortex', 6, 2, 200, 20);
    const all: string[] = [];
    for (let i = 0; i < 40 && !all.includes('You are freezing to death!'); i++)
      all.push(...textsOf(m.step({ type: 'wait' }).events));
    expect(all).toContain('The ice vortex engulfs you!');
    expect(all).toContain('You are freezing to death!');
  });

  test("hitting a blue jelly chills her; a spotted jelly's acid splashes her", () => {
    for (const [def, line] of [
      ['nh:blue_jelly', 'You are suddenly very cold!'],
      ['nh:spotted_jelly', "You are splashed by the spotted jelly's acid!"],
    ] as const) {
      const m = make();
      wield(m, 'nh:long_sword');
      const id = monAt(m, def, 6, 2, 1000);
      const all: string[] = [];
      for (let i = 0; i < 40 && !all.includes(line); i++)
        all.push(...run(m.state, (ctx) => void heroAttack(ctx, id)));
      expect(all).toContain(line);
    }
  });
});
