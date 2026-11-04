// Milestone 6b1 step 4: the Watch. Watchmen and the watch captain are peaceful, never randomly
// generated, armed as mercenaries, and turn hostile together when the hero kicks a town door,
// picks a town lock in their sight, or attacks a peaceful monster they can see.
import {
  createEngine,
  getLevel,
  inTown,
  inventoryOf,
  roomHas,
  sortedIds,
  type Ctx,
  type DefId,
  type LevelDef,
  type Mod,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { T, angryGuards, makemon, mksobj, pacifyGuards, rndmonst, vanillaMod } from '../src/index';
import { addMon, setup } from './helpers';
import { ctxFor, defs, engine, obj } from './itemHelpers';

// A town room (interior 1..12 x 1..6) with a shed subroom (interior 3..4 x 3..4) whose east wall
// has a locked door at 5,3; the hero stands east of it.
const TOWN = [
  '--------------',
  '|............|',
  '|.----.......|',
  '|.|..X@......|',
  '|.|..|.......|',
  '|.----.......|',
  '|............|',
  '--------------',
];
const DOOR = { x: 5, y: 3 };

type S = ReturnType<typeof setup>;
function town(seed: number, isTown = true): S {
  const s = setup(TOWN, seed);
  s.level.rooms = [
    { lx: 1, ly: 1, hx: 12, hy: 6, lit: true },
    { lx: 3, ly: 3, hx: 4, hy: 4, lit: true, parent: 0 },
  ];
  if (isTown) s.level.town = true;
  return s;
}

const keys = (r: StepResult): string[] =>
  r.events.flatMap((e) => (e.type === 'msg' && e.key ? [e.key] : []));
const peaceful = (s: S, id: number): boolean =>
  s.state.entities[String(id)]?.c.monster?.peaceful === true;
const terrainAt = (s: S, x: number, y: number) =>
  s.level.palette[s.level.cells[y * s.level.width + x] ?? 0];
function stats(s: S, str: number, dex: number, con: number): void {
  const h = s.state.entities[String(s.state.playerId)];
  if (h) h.c.attributes = { str, int: 10, wis: 10, dex, con, cha: 10 };
}
/** A peaceful watchman; `still` pins it (speed 0: it never acts). */
function watchman(s: S, x: number, y: number, still = true, def = 'nh:watchman'): number {
  const id = addMon(s.state, def, x, y, { peaceful: true });
  const e = s.state.entities[String(id)];
  if (e?.c.actor && still) e.c.actor.speed = 0;
  if (e?.c.hp) e.c.hp = { cur: 200, max: 200 };
  return id;
}
const kick = (s: S, dir: string): StepResult => {
  engine.step(s.state, { type: 'mod', action: 'nh:kick' as DefId });
  const p = s.state.pendingPrompt?.prompt;
  if (!p) throw new Error('no prompt');
  return engine.stepAll(s.state, { type: 'answer', promptId: p.id, value: dir });
};

describe('Watch monsters', () => {
  test('are never randomly generated and do not change the random pool', () => {
    const s = town(1);
    const ctx = ctxFor(s.state) as unknown as Ctx;
    for (let depth = 1; depth <= 30; depth += 3)
      for (let i = 0; i < 200; i++) {
        const d = rndmonst(ctx, depth);
        expect(d?.id === 'nh:watchman' || d?.id === 'nh:watch_captain').toBe(false);
      }
    const w = defs.monster('nh:watchman' as DefId);
    expect(w.genFlags).toContain('nogen');
    expect(defs.monster('nh:watch_captain' as DefId).genFlags).toContain('nogen');
    expect(w.glyph.ch).toBe('@');
  });

  /** How often each item type is carried by n new monsters of `id`. */
  function gear(id: string, n: number) {
    const s = setup(['@' + '.'.repeat(20)], 4);
    const ctx = ctxFor(s.state) as unknown as Ctx;
    const counts = new Map<string, number>();
    let peacefuls = 0;
    for (let i = 0; i < n; i++) {
      const mid = makemon(ctx, defs.monster(id as DefId), { x: 10, y: 0 }, { nogroup: true })!;
      if (s.state.entities[String(mid)]?.c.monster?.peaceful) peacefuls++;
      for (const d of new Set(inventoryOf(s.state, mid).map((e) => e.def)))
        counts.set(d, (counts.get(d) ?? 0) + 1);
      for (const e of inventoryOf(s.state, mid)) delete s.state.entities[String(e.id)];
      delete s.state.entities[String(mid)];
    }
    return { f: (d: string) => (counts.get(d) ?? 0) / n, peaceful: peacefuls / n };
  }
  const near = (a: number, b: number, tol = 0.04) => expect(Math.abs(a - b)).toBeLessThan(tol);

  test('watchmen are peaceful and get mercenary gear: spear or short sword, a knife, armor', () => {
    const g = gear('nh:watchman', 3000);
    expect(g.peaceful).toBe(1);
    near(g.f('nh:spear'), 2 / 3); // the polearm stand-in 1/3, plus 1/3
    near(g.f('nh:short_sword'), 1 / 3);
    near(g.f('nh:dagger'), 1 / 6); // with the polearm
    near(g.f('nh:knife'), 1 / 6 + (2 / 3) * (1 / 4));
    near(g.f('nh:ring_mail'), (4 / 5) * (2 / 3)); // mac 3: not below 3, so ring mail or ...
    near(g.f('nh:leather_armor'), 1 / 5);
  });

  test('the watch captain is peaceful and gets a long sword', () => {
    const g = gear('nh:watch_captain', 500);
    expect(g.peaceful).toBe(1);
    expect(g.f('nh:long_sword')).toBe(1);
  });
});

describe('angryGuards and pacifyGuards', () => {
  test('anger every peaceful watchman on the level and wake the sleeping ones', () => {
    const s = town(1);
    const a = watchman(s, 8, 4);
    const b = watchman(s, 10, 5);
    const sleeper = s.state.entities[String(b)]!.c.monster!;
    sleeper.asleep = true;
    const gnome = addMon(s.state, 'nh:gnome', 9, 1, { peaceful: true });
    const ctx = { ...(ctxFor(s.state) as unknown as Ctx) };
    const events: string[] = [];
    ctx.emit = (e) => {
      if (e.type === 'msg') events.push(e.key);
    };
    expect(angryGuards(ctx, false)).toBe(true);
    expect([peaceful(s, a), peaceful(s, b), sleeper.asleep, peaceful(s, gnome)]).toEqual([
      false,
      false,
      false,
      true,
    ]);
    expect(events).toEqual(['watch.guard_wakes', 'watch.guards_approaching']);
    // nobody left to anger
    expect(angryGuards(ctx, false)).toBe(false);
    pacifyGuards(ctx);
    expect([peaceful(s, a), peaceful(s, b), peaceful(s, gnome)]).toEqual([true, true, true]);
  });
});

describe('kicking a town door', () => {
  /** Two kicks that both leave the door standing (searched seed). */
  function twoFailedKicks(isTown: boolean, wx: number, wy: number) {
    for (let seed = 1; seed <= 200; seed++) {
      const s = town(seed, isTown);
      stats(s, 3, 3, 3); // the door rarely gives way
      const w = watchman(s, wx, wy);
      const r1 = kick(s, 'w');
      if (terrainAt(s, DOOR.x, DOOR.y) !== T.door_locked) continue;
      const k1 = keys(r1);
      const p1 = peaceful(s, w);
      const r2 = kick(s, 'w');
      if (terrainAt(s, DOOR.x, DOOR.y) !== T.door_locked) continue;
      return { k1, p1, k2: keys(r2), p2: peaceful(s, w) };
    }
    throw new Error('no seed found');
  }

  test('a damaged door is warned about, then the Watch arrests the hero', () => {
    const { k1, p1, k2, p2 } = twoFailedKicks(true, 10, 5);
    expect(k1).toContain('watch.yells');
    expect(k1).toContain('watch.stop_damaging_door');
    expect(p1).toBe(true);
    expect(k2).toContain('watch.halt_vandal');
    expect(k2).toContain('watch.guard_approaching');
    expect(p2).toBe(false);
  });

  test('no watchman in sight, or not a town: nothing happens', () => {
    // behind the shed's walls, inside it
    const hidden = twoFailedKicks(true, 3, 4);
    expect([...hidden.k1, ...hidden.k2].filter((k) => k.startsWith('watch.'))).toEqual([]);
    expect(hidden.p2).toBe(true);
    const away = twoFailedKicks(false, 10, 5);
    expect([...away.k1, ...away.k2].filter((k) => k.startsWith('watch.'))).toEqual([]);
    expect(away.p2).toBe(true);
  });

  test('breaking a town door gets the hero arrested at once', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const s = town(seed);
      stats(s, 18, 18, 18);
      const w = watchman(s, 10, 5);
      const r = kick(s, 'w');
      if (terrainAt(s, DOOR.x, DOOR.y) !== T.doorway) continue;
      expect(keys(r)).toContain('watch.halt_thief');
      expect(peaceful(s, w)).toBe(false);
      return;
    }
    throw new Error('no seed found');
  });
});

describe('picking a town lock', () => {
  /** Applies the card to the door, or resumes the interrupted attempt (no question then). */
  function pick(s: S): StepResult {
    const r = engine.stepAll(s.state, {
      type: 'mod',
      action: 'nh:lock' as DefId,
      args: { item: card(s), dir: 'w' },
    });
    const p = s.state.pendingPrompt?.prompt;
    if (!p) return r;
    expect(p.key).toBe('lock.unlock_it');
    return engine.stepAll(s.state, { type: 'answer', promptId: p.id, value: true });
  }
  function card(s: S): number {
    const have = inventoryOf(s.state, s.state.playerId).find((e) => e.def === 'nh:credit_card');
    if (have) return have.id;
    const ctx = ctxFor(s.state) as unknown as Ctx;
    return mksobj(ctx, obj('nh:credit_card'), { init: false, carriedBy: s.state.playerId });
  }
  const locked = (s: S): boolean => terrainAt(s, DOOR.x, DOOR.y) === T.door_locked;

  test('a watchman in sight warns the hero and stops her, then arrests her', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const s = town(seed);
      stats(s, 10, 3, 10); // a credit card at Dex 3: 6% a turn
      const w = watchman(s, 9, 3, false);
      const r1 = pick(s);
      if (!locked(s)) continue;
      const k1 = keys(r1);
      if (!k1.includes('watch.stop_picking')) continue;
      expect(k1).toContain('lock.stop');
      expect(s.state.occupation).toBeNull();
      expect(peaceful(s, w)).toBe(true);
      const r2 = pick(s);
      if (!locked(s)) continue;
      const k2 = keys(r2);
      expect(k2).toContain('watch.halt_thief');
      expect(peaceful(s, w)).toBe(false);
      return;
    }
    throw new Error('no seed found');
  });

  test('out of town the watchman does not care', () => {
    const s = town(1, false);
    stats(s, 10, 3, 10);
    const w = watchman(s, 9, 3, false);
    const k = keys(pick(s));
    expect(k.filter((x) => x.startsWith('watch.'))).toEqual([]);
    expect(peaceful(s, w)).toBe(true);
  });
});

describe('attacking a peaceful monster in the sight of the Watch', () => {
  function attack(isTown: boolean, wx: number, wy: number) {
    const s = town(2, isTown);
    const victim = addMon(s.state, 'nh:dwarf', 7, 3, { peaceful: true });
    s.state.entities[String(victim)]!.c.hp = { cur: 500, max: 500 };
    const w1 = watchman(s, wx, wy);
    const w2 = watchman(s, 3, 4); // in the shed, unseen: angered with the rest
    const r = engine.step(s.state, {
      type: 'mod',
      action: 'nh:fight' as DefId,
      args: { dir: 'e' },
    });
    expect(r.prompt?.key).toBe('attack.confirm');
    const a = engine.step(s.state, { type: 'answer', promptId: r.prompt!.id, value: true });
    return { k: keys(a), w1: peaceful(s, w1), w2: peaceful(s, w2), victim: peaceful(s, victim) };
  }

  test('angers all of the Watch ("Halt! You\'re under arrest!")', () => {
    const r = attack(true, 10, 5);
    expect(r.victim).toBe(false);
    expect(r.k).toContain('watch.halt_arrest');
    expect([r.w1, r.w2]).toEqual([false, false]);
  });

  test('a watchman who cannot see it does nothing', () => {
    // a wall between: the watchman stands in the shed
    const hidden = attack(true, 4, 3);
    expect(hidden.k).not.toContain('watch.halt_arrest');
    expect([hidden.w1, hidden.w2]).toEqual([true, true]);
  });

  test('attacking a peaceful watchman angers the whole Watch', () => {
    // the blow must hit (a miss only angers him): search for a town where the first one does
    let tested = 0;
    for (let seed = 3; seed < 40 && tested === 0; seed++) {
      const s = town(seed);
      const w1 = watchman(s, 7, 3);
      const w2 = watchman(s, 3, 4); // unseen
      const r = engine.step(s.state, {
        type: 'mod',
        action: 'nh:fight' as DefId,
        args: { dir: 'e' },
      });
      const k = keys(engine.step(s.state, { type: 'answer', promptId: r.prompt!.id, value: true }));
      if (!k.includes('combat.you_hit') && !k.includes('combat.you_hit_hard')) continue;
      tested++;
      expect([peaceful(s, w1), peaceful(s, w2)]).toEqual([false, false]);
    }
    expect(tested).toBe(1);
  });
});

describe('a town LevelDef with its Watch', () => {
  // shaped like the Minetown room levels: a town room with a subroom, two rooms, corridors
  const TOWN_DEF: LevelDef = {
    id: 'wt:town',
    init: { style: 'solidfill', fg: 'nh:stone', lit: true },
    rooms: [
      {
        x: 3,
        y: 3,
        w: 20,
        h: 8,
        xalign: 'center',
        yalign: 'center',
        lit: true,
        contents: [
          { kind: 'monster', id: 'nh:watchman', peaceful: true },
          { kind: 'monster', id: 'nh:watchman', peaceful: true },
          { kind: 'monster', id: 'nh:watch_captain', peaceful: true },
        ],
        rooms: [{ x: 4, y: 2, w: 3, h: 3, doors: [{ state: 'locked', wall: 'south' }] }],
      },
      { stairs: ['up'] },
      { stairs: ['down'] },
    ],
    corridors: 'random',
  };
  const mod: Mod = {
    id: 'wt',
    version: '1',
    register(api) {
      api.defineLevel(TOWN_DEF);
      api.defineDungeon({
        id: 'wt:d',
        nameKey: 'wt',
        levels: { base: 1 },
        entry: { from: 'nh:main', base: 5 },
        filler: TOWN_DEF.id,
      });
      api.defineAction({
        id: 'wt:go',
        labelKey: 'wt',
        handles: 'mod',
        offer: () => [],
        perform(ctx) {
          ctx.goToLevel({ dungeon: 'wt:d', dlevel: 1 }, 'up');
          return 0;
        },
      });
    },
  };

  test('the watchmen stand in the town, peaceful and armed', () => {
    const eng = createEngine([vanillaMod, mod]);
    for (const seed of [1, 2, 3]) {
      const { state } = eng.newGame({ seed });
      eng.step(state, { type: 'mod', action: 'wt:go' as DefId });
      const level = getLevel(state);
      level.town = true; // step 5 sets it from the dungeon's special-level flag
      const watch = sortedIds(state)
        .map((id) => state.entities[String(id)])
        .filter((e) => e?.c.pos?.level === level.id && e.def.startsWith('nh:watch'));
      expect(watch.map((e) => e?.def).sort()).toEqual([
        'nh:watch_captain',
        'nh:watchman',
        'nh:watchman',
      ]);
      for (const e of watch) {
        const p = e!.c.pos!;
        expect(e!.c.monster?.peaceful).toBe(true);
        expect(roomHas(level, 0, p.x, p.y)).toBe(true);
        expect(inTown(level, p.x, p.y)).toBe(true);
        const weapons = inventoryOf(state, e!.id).filter((o) => defs.object(o.def).weapon);
        expect(weapons.length).toBeGreaterThan(0);
      }
    }
  });
});
