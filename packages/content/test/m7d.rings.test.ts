// m7d step 5: the rings of stealth, warning and conflict and the amulet of magical breathing.
// Warning shows a digit for an unseen hostile monster within 10 squares by its level band; the
// ring of stealth announces itself only when her stealth changes; under conflict peacefuls and
// pets attack her and monsters attack each other (outcomes over seeds, never one lucky seed);
// magical breathing turns choking into vomiting. Monsters are pinned (asleep, or in a nook).
// ref: src/display.c display_warning(), warning_of(); include/display.h _mon_warning();
// src/do_wear.c toggle_stealth(), Ring_on(), Ring_off_or_gone(); src/monmove.c dochug();
// src/mhitm.c fightm(); src/dogmove.c dog_move(); src/mondata.c resist_conflict(); src/eat.c
// choke(), gethungry()
import {
  buildSnapshot,
  getPlayer,
  type DefId,
  type EntityId,
  type GameState,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { P, canSpotMon, isKnown, resistConflict, setIntrinsic, setItimeout } from '../src/index';
import { mksobj } from '../src/items';
import { defs, engine, itemOf, levelSetup, obj, plainKit, render } from './itemHelpers';
import { mapSetup } from './maps';

type M = ReturnType<typeof mapSetup>;

const texts = (r: StepResult): string[] =>
  r.events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );
const keys = (r: StepResult): string[] =>
  r.events.flatMap((e) => (e.type === 'msg' ? [e.key] : []));

/** A map (see mapSetup) with a plain kit, rings and amulets known by name. */
function make(rows: string[], seed = 1): M {
  const m = mapSetup(rows, { seed });
  plainKit(m.state);
  getPlayer(m.state).c.hp = { cur: 500, max: 500 };
  for (const d of defs.objects)
    if (d.class === 'ring' || d.class === 'amulet') delete m.state.appearances[d.id];
  return m;
}
const mod = (m: M, action: string, args?: Record<string, unknown>): StepResult =>
  m.step({ type: 'mod', action: action as DefId, ...(args ? { args: args as never } : {}) });
const answer = (m: M, value: unknown): StepResult => {
  const p = m.state.pendingPrompt?.prompt;
  if (!p) throw new Error('no prompt');
  return engine.stepAll(m.state, { type: 'answer', promptId: p.id, value: value as never });
};
const carry = (m: M, id: string): EntityId =>
  mksobj(m.ctx, obj(id), { init: false, carriedBy: m.state.playerId });
/** Puts the ring on her left hand; the messages. */
function putOn(m: M, r: EntityId): string[] {
  const t = texts(mod(m, 'nh:puton', { item: r }));
  return m.state.pendingPrompt ? [...t, ...texts(answer(m, 'l'))] : t;
}
const removeRing = (m: M, r: EntityId): string[] => texts(mod(m, 'nh:remove', { item: r }));

/** A monster at x,y on dlvl1. */
function mon(
  s: GameState,
  def: string,
  x: number,
  y: number,
  o: { level?: number; peaceful?: boolean; asleep?: boolean; tame?: number; speed?: number } = {},
): EntityId {
  const id = s.nextEntityId++;
  s.entities[String(id)] = {
    id,
    def: def as DefId,
    c: {
      pos: { level: 'dlvl1', x, y },
      actor: { energy: 0, speed: o.speed ?? 12 },
      hp: { cur: 200, max: 200 },
      monster: {
        level: o.level ?? 0,
        peaceful: o.peaceful ?? o.tame !== undefined,
        asleep: o.asleep ?? false,
        lastHero: null,
        ...(o.tame !== undefined ? { tame: o.tame } : {}),
      },
    },
  };
  return id;
}

/** What the view shows for a creature, or undefined when it is not shown. */
const shown = (m: M, id: EntityId): string | undefined =>
  buildSnapshot(defs, m.state).entities.find((e) => e.id === id)?.g;

// The hero at x=2 in a 3-wide room; a wall at x=4; a long room behind it (no line of sight).
const WALLED = ['-------------------', '|.@.|.............|', '-------------------'];

describe('ring of warning', () => {
  test('an unseen hostile shows as its level band digit; peacefuls and level 0..3 do not', () => {
    const m = make(WALLED);
    putOn(m, carry(m, 'nh:ring_of_warning'));
    const cases: [number, string | undefined][] = [
      [0, undefined],
      [3, undefined],
      [4, 'nh:warning_1'],
      [7, 'nh:warning_1'],
      [8, 'nh:warning_2'],
      [12, 'nh:warning_3'],
      [16, 'nh:warning_4'],
      [20, 'nh:warning_5'],
      [30, 'nh:warning_5'],
    ];
    for (const [level, want] of cases) {
      const id = mon(m.state, 'nh:jackal', 6, 1, { level, asleep: true });
      expect(shown(m, id), `level ${level}`).toBe(want);
      delete m.state.entities[String(id)];
    }
    const peaceful = mon(m.state, 'nh:jackal', 6, 1, { level: 12, peaceful: true, asleep: true });
    expect(shown(m, peaceful)).toBeUndefined();
  });

  test('within distance² 99 only; a seen monster shows as itself; it is not "spotted"', () => {
    const m = make(WALLED);
    putOn(m, carry(m, 'nh:ring_of_warning'));
    const near = mon(m.state, 'nh:jackal', 11, 1, { level: 8, asleep: true }); // 9² = 81
    const far = mon(m.state, 'nh:jackal', 12, 1, { level: 8, asleep: true }); // 10² = 100
    const seen = mon(m.state, 'nh:jackal', 1, 1, { level: 8, asleep: true });
    expect(shown(m, near)).toBe('nh:warning_2');
    expect(shown(m, far)).toBeUndefined();
    expect(shown(m, seen)).toBe('nh:jackal');
    expect(canSpotMon(m.ctx, m.state.entities[String(near)]!)).toBe(false);
    // the look command names the digit
    const d = engine.query(m.state).describe({ x: 11, y: 1 });
    expect(d.entities.map((e) => e.def)).toEqual(['nh:warning_2']);
    expect(render({ key: 'nh:warning_2' })).toBe('unknown creature causing you anxiety');
    expect(buildSnapshot(defs, m.state).legend['nh:warning_2']).toEqual({
      ch: '2',
      fg: '#cc3333',
    });
  });

  test('no digit without the ring, and none once it is off', () => {
    const m = make(WALLED);
    const id = mon(m.state, 'nh:jackal', 6, 1, { level: 8, asleep: true });
    expect(shown(m, id)).toBeUndefined();
    const r = carry(m, 'nh:ring_of_warning');
    putOn(m, r);
    expect(shown(m, id)).toBe('nh:warning_2');
    removeRing(m, r);
    expect(shown(m, id)).toBeUndefined();
  });

  test('telepathy shows the monster itself; hallucination shows some digit 1..5', () => {
    const m = make(WALLED);
    putOn(m, carry(m, 'nh:ring_of_warning'));
    const id = mon(m.state, 'nh:jackal', 6, 1, { level: 4, asleep: true });
    const hero = getPlayer(m.state);
    setItimeout(m.state, hero, P.HALLUC, 100);
    const digits = new Set<string>();
    for (let t = 0; t < 10; t++) {
      m.state.turn = 1000 + t;
      const g = shown(m, id) ?? '';
      expect(g).toMatch(/^nh:warning_[1-5]$/);
      digits.add(g);
    }
    expect(digits.size).toBe(5);
    setItimeout(m.state, hero, P.HALLUC, 0);
    setIntrinsic(hero, P.TELEPAT, true);
    setItimeout(m.state, hero, P.BLINDED, 100);
    expect(shown(m, id)).toBe('nh:jackal');
  });
});

describe('ring of stealth', () => {
  test('"You move very quietly." and the ring is learned; "You sure are noisy." off', () => {
    const m = make(WALLED);
    const r = carry(m, 'nh:ring_of_stealth');
    m.state.appearances['nh:ring_of_stealth'] = 'nh:jade_ring';
    expect(putOn(m, r)).toContain('You move very quietly.');
    expect(isKnown(m.state, defs, defs.object('nh:ring_of_stealth'))).toBe(true);
    expect(removeRing(m, r)).toContain('You sure are noisy.');
  });

  test('silent and not learned when she is already stealthy', () => {
    const m = make(WALLED);
    setIntrinsic(getPlayer(m.state), P.STEALTH, true);
    const r = carry(m, 'nh:ring_of_stealth');
    m.state.appearances['nh:ring_of_stealth'] = 'nh:jade_ring';
    const on = putOn(m, r);
    expect(on).not.toContain('You move very quietly.');
    expect(isKnown(m.state, defs, defs.object('nh:ring_of_stealth'))).toBe(false);
    expect(removeRing(m, r)).not.toContain('You sure are noisy.');
  });
});

/** Whether a step's messages include a monster hitting or missing her. */
const attackedHer = (r: StepResult, hpBefore: number, s: GameState): boolean =>
  keys(r).some((k) => k.startsWith('combat.mon_')) || (getPlayer(s).c.hp?.cur ?? 0) < hpBefore;

// A one-square nook east of her: a monster there can only "move" onto her.
const NOOK = ['-----', '|.@.|', '-----'];

/** Waits up to `turns` turns; true once a monster attacked her. */
function waitsForAttack(m: M, turns: number): boolean {
  for (let i = 0; i < turns; i++) {
    const hp = getPlayer(m.state).c.hp?.cur ?? 0;
    const r = m.step({ type: 'wait' });
    if (attackedHer(r, hp, m.state)) return true;
  }
  return false;
}

describe('ring of conflict', () => {
  test('resist_conflict(): rnd(20) > min(19, Cha - level + XL)', () => {
    const m = make(NOOK);
    const hero = getPlayer(m.state);
    hero.c.attributes!.cha = 30; // capped at 19: resists only on a 20
    const id = mon(m.state, 'nh:jackal', 3, 1, { asleep: true });
    let resisted = 0;
    for (let i = 0; i < 2000; i++)
      if (resistConflict(m.ctx, m.state.entities[String(id)]!)) resisted++;
    expect(resisted / 2000).toBeGreaterThan(0.02);
    expect(resisted / 2000).toBeLessThan(0.09);
    hero.c.attributes!.cha = 3; // 3 - 0 + 1 = 4: resists on 5..20
    resisted = 0;
    for (let i = 0; i < 2000; i++)
      if (resistConflict(m.ctx, m.state.entities[String(id)]!)) resisted++;
    expect(Math.abs(resisted / 2000 - 0.8)).toBeLessThan(0.04);
  });

  test('a peaceful monster next to her attacks her (and stays peaceful); never without it', () => {
    for (const conflict of [true, false]) {
      let attacked = 0;
      for (let seed = 1; seed <= 5; seed++) {
        const m = make(NOOK, seed);
        if (conflict) putOn(m, carry(m, 'nh:ring_of_conflict'));
        const id = mon(m.state, 'nh:jackal', 3, 1, { peaceful: true });
        if (waitsForAttack(m, 20)) attacked++;
        expect(m.state.entities[String(id)]?.c.monster?.peaceful).toBe(true);
      }
      expect(attacked).toBe(conflict ? 5 : 0);
    }
  });

  test('her pet attacks her under conflict', () => {
    let attacked = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const m = make(NOOK, seed);
      putOn(m, carry(m, 'nh:ring_of_conflict'));
      mon(m.state, 'nh:little_dog', 3, 1, { tame: 10 });
      if (waitsForAttack(m, 20)) attacked++;
    }
    expect(attacked).toBe(5);
  });

  test('monsters she sees attack each other, peaceful or tame', () => {
    const ROOM = ['---------', '|@......|', '|.......|', '---------'];
    for (const [a, b] of [
      [{ peaceful: true }, { peaceful: true }],
      [{ tame: 10 }, { tame: 10 }],
    ] as const) {
      let fights = 0;
      for (let seed = 1; seed <= 5; seed++) {
        const m = make(ROOM, seed);
        putOn(m, carry(m, 'nh:ring_of_conflict'));
        mon(m.state, 'nh:jackal', 5, 1, a);
        mon(m.state, 'nh:jackal', 6, 1, b);
        for (let i = 0; i < 10; i++) {
          const r = m.step({ type: 'wait' });
          if (keys(r).some((k) => k.startsWith('mhitm.'))) {
            fights++;
            break;
          }
        }
      }
      expect(fights).toBeGreaterThanOrEqual(4);
    }
  });

  test('without the ring two peacefuls side by side never fight', () => {
    const ROOM = ['---------', '|@......|', '|.......|', '---------'];
    for (let seed = 1; seed <= 3; seed++) {
      const m = make(ROOM, seed);
      mon(m.state, 'nh:jackal', 5, 1, { peaceful: true });
      mon(m.state, 'nh:jackal', 6, 1, { peaceful: true });
      for (let i = 0; i < 10; i++) {
        const r = m.step({ type: 'wait' });
        expect(keys(r).filter((k) => k.startsWith('mhitm.'))).toEqual([]);
      }
    }
  });
});

describe('amulet of magical breathing', () => {
  test('stuffing herself she vomits instead of choking to death', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = levelSetup(['.......', '...@...', '.......'], seed);
      const amul = s.carry('nh:amulet_of_magical_breathing');
      s.mod('nh:puton', { item: amul });
      expect(itemOf(s.state, amul).equipped).toBe('amulet');
      const h = s.hero.c.hunger!;
      h.nutrition = 1900;
      h.state = 'satiated';
      const ration = s.carry('nh:food_ration');
      const k = s.msgKeys(s.mod('nh:eat', { item: ration }));
      expect(s.state.gameOver).toBeNull();
      expect(k).toContain('eat.stuff');
    }
  });
});

describe('conflict burns food', () => {
  test('the ring of conflict makes her hungrier', () => {
    const burned = (conflict: boolean): number => {
      let total = 0;
      for (let seed = 1; seed <= 4; seed++) {
        const m = make(NOOK, seed);
        if (conflict) putOn(m, carry(m, 'nh:ring_of_conflict'));
        const h = getPlayer(m.state).c.hunger!;
        h.nutrition = 900;
        for (let i = 0; i < 100; i++) m.step({ type: 'wait' });
        total += 900 - h.nutrition;
      }
      return total;
    };
    expect(burned(true)).toBeGreaterThan(burned(false) + 100);
  });
});
