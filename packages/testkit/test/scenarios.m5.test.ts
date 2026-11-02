import { vanillaMod } from '@nh/content';
import { getPlayer, type DefId, type GameState, type Json } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { checkInvariants, runScenario, soak, soakKitMod } from '../src/index';

const ROOM = [
  '--------------------',
  '|..................|',
  '|..................|',
  '|........@.........|',
  '|..................|',
  '|..................|',
  '--------------------',
];
// at least 10x10: the next level is generated at the same size
const STAIRS = [
  '------------',
  '|..........|',
  '|....>.....|',
  '|..........|',
  '|..........|',
  '|..........|',
  '|..........|',
  '|..........|',
  '|..........|',
  '------------',
];

const nh = (st: GameState): Record<string, Json> => {
  const v = st.modData['nh'];
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, Json>;
  const o: Record<string, Json> = {};
  st.modData['nh'] = o;
  return o;
};
const setU = (st: GameState, patch: Record<string, Json>): void => {
  const n = nh(st);
  const u = (n['u'] && typeof n['u'] === 'object' ? n['u'] : {}) as Record<string, Json>;
  n['u'] = { ...u, ...patch };
};
const petsOn = (st: GameState, level: string) =>
  Object.values(st.entities).filter((e) => e.c.monster?.tame && e.c.pos?.level === level);

/** First seed in 1..max for which `build` does not throw. */
function findSeed(build: (seed: number) => void, max = 80): number {
  for (let seed = 1; seed <= max; seed++) {
    try {
      build(seed);
      return seed;
    } catch {
      // next seed
    }
  }
  throw new Error('no seed found');
}

describe('pets', () => {
  test('the kitten kills a newt and eats its corpse', () => {
    const run = (seed: number) =>
      runScenario([vanillaMod], (s) => {
        s.seed(seed);
        s.level(ROOM);
        s.monster('nh:kitten' as DefId, { x: 11, y: 3 }, { tame: 10, hp: 20 });
        s.monster('nh:newt' as DefId, { x: 12, y: 3 }, { asleep: true, speed: 0, hp: 2 });
        for (let i = 0; i < 30; i++) s.act({ type: 'wait' });
        s.check((st) => {
          const all = Object.values(st.entities);
          // the newt is dead, and no newt corpse is left anywhere: the kitten ate it
          expect(all.some((e) => e.def === 'nh:newt')).toBe(false);
          expect(all.some((e) => e.c.item?.corpseOf === 'nh:newt')).toBe(false);
          const edog = (nh(st)['edog'] as Record<string, { hungrytime: number }>) ?? {};
          const kitten = all.find((e) => e.c.monster?.tame);
          // it was fed: the meal pushed its hunger time past the starting 1000 turns
          expect(edog[String(kitten?.id)]?.hungrytime ?? 0).toBeGreaterThan(st.turn + 1000);
        });
      });
    expect(findSeed(run)).toBeGreaterThan(0);
  });

  test('an adjacent pet follows the hero downstairs; one across the room stays', () => {
    runScenario([vanillaMod], (s) => {
      s.level(STAIRS);
      s.player({ x: 5, y: 2 });
      s.monster('nh:kitten' as DefId, { x: 6, y: 2 }, { tame: 10, asleep: false });
      s.monster('nh:little_dog' as DefId, { x: 10, y: 3 }, { tame: 10, speed: 0 });
      s.act({ type: 'mod', action: 'nh:down' as DefId });
      s.check((st) => {
        expect(st.currentLevel).toBe('dlvl2');
        const here = petsOn(st, 'dlvl2');
        expect(here.map((e) => e.def)).toEqual(['nh:kitten']);
        const h = getPlayer(st).c.pos!;
        const p = here[0]!.c.pos!;
        expect(Math.max(Math.abs(p.x - h.x), Math.abs(p.y - h.y))).toBe(1);
        expect(petsOn(st, 'dlvl1').map((e) => e.def)).toEqual(['nh:little_dog']);
      });
    });
  });
});

describe('prayer', () => {
  test('praying when Weak (timeout run out) fixes the hunger', () => {
    runScenario([vanillaMod], (s) => {
      s.level(ROOM);
      s.setHunger(30);
      s.expectHunger('weak');
      s.check((st) => setU(st, { ublesscnt: 0, alignRecord: 5 }));
      s.act({ type: 'mod', action: 'nh:pray' as DefId });
      s.check((st) => {
        const id = st.pendingPrompt?.prompt.id;
        expect(id).toBe('pray-confirm');
      });
      s.act({ type: 'answer', promptId: 'pray-confirm', value: true });
      s.expectEvent({ type: 'msg', key: 'pray.stomach' });
      s.expectHunger('not_hungry');
    });
  });

  test('praying too soon angers the god', () => {
    runScenario([vanillaMod], (s) => {
      s.level(ROOM);
      s.act({ type: 'mod', action: 'nh:pray' as DefId });
      s.act({ type: 'answer', promptId: 'pray-confirm', value: true });
      s.check((st) => {
        const u = nh(st)['u'] as Record<string, number>;
        expect(u['ugangr']).toBe(1);
        expect(u['luck']).toBe(-3);
      });
    });
  });
});

describe('status effects', () => {
  test('a blind telepathic hero senses a monster across the room', () => {
    runScenario([vanillaMod], (s) => {
      s.level(ROOM);
      s.monster('nh:jackal' as DefId, { x: 17, y: 1 }, { asleep: true, speed: 0 });
      s.setProp('telepat', { intrinsic: true });
      s.setProp('blinded', { turns: 50 });
      s.act({ type: 'wait' });
      s.check((st, q) => {
        expect(st.visible).toEqual([]);
        expect(q.describe({ x: 17, y: 1 }).entities.map((e) => e.def)).toEqual(['nh:jackal']);
      });
    });
  });
});

describe('M4 carry-over: #enhance and #name, end to end', () => {
  test('a practiced skill is advanced through the #enhance menu', () => {
    runScenario([vanillaMod], (s) => {
      s.level(ROOM);
      s.check((st) => {
        const adv = nh(st)['skillAdvance'] as Record<string, number>;
        adv['spear'] = 10000;
      });
      s.act({ type: 'mod', action: 'nh:enhance' as DefId });
      s.check((st) => expect(st.pendingPrompt?.prompt.id).toBe('enhance-menu'));
      s.act({ type: 'answer', promptId: 'enhance-menu', value: 'spear' });
      s.check((st) => expect((nh(st)['skills'] as Record<string, number>)['spear']).toBe(3));
    });
  });

  test('#name gives an unidentified potion type a name', () => {
    const r = runScenario([vanillaMod], (s) => {
      s.level(ROOM);
      s.item('nh:potion_of_healing' as DefId, 'inventory');
      s.act({ type: 'mod', action: 'nh:call' as DefId });
    });
    // the builder records its steps up front, so the item answer is given afterwards
    const pick = r.state.pendingPrompt?.prompt.options?.[0]?.value;
    expect(r.state.pendingPrompt?.prompt.id).toBe('call-pick');
    r.engine.step(r.state, { type: 'answer', promptId: 'call-pick', value: pick ?? null });
    expect(r.state.pendingPrompt?.prompt.id).toBe('call-name');
    r.engine.step(r.state, { type: 'answer', promptId: 'call-name', value: 'blue goo' });
    expect((nh(r.state)['called'] as Record<string, string>)['nh:potion_of_healing']).toBe(
      'blue goo',
    );
  });
});

describe('soak with the kitten and prayer', () => {
  test(
    'several seeds keep the invariants, including pets changing level',
    { timeout: 60000 },
    () => {
      for (const seed of [11, 12, 13]) {
        const r = soak([vanillaMod, soakKitMod], {
          seed,
          turns: 500,
          botSeed: seed,
          checkEvery: 10,
        });
        expect(r.violations, `seed ${seed}`).toBeNull();
      }
    },
  );
});

describe('pet invariants', () => {
  test('tameness must be 1..20 and a tame monster peaceful', () => {
    const r = runScenario([vanillaMod], (s) => {
      s.level(ROOM);
      s.monster('nh:kitten' as DefId, { x: 11, y: 3 }, { tame: 10 });
    });
    expect(checkInvariants(r.state, r.engine.registry)).toEqual([]);
    const k = Object.values(r.state.entities).find((e) => e.c.monster?.tame)!;
    k.c.monster!.tame = 25;
    k.c.monster!.peaceful = false;
    const errs = checkInvariants(r.state, r.engine.registry);
    expect(errs.some((e) => e.includes('tameness 25 out of range'))).toBe(true);
    expect(errs.some((e) => e.includes('tame but not peaceful'))).toBe(true);
  });
});
