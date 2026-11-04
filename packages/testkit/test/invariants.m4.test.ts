import { vanillaMod } from '@nh/content';
import { createEngine, getLevel, getPlayer, sortedIds, type GameState } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { checkInvariants, runScenario } from '../src/index';

const engine = createEngine([vanillaMod]);
const fresh = (): GameState => {
  const { state } = engine.newGame({ seed: 5 });
  engine.step(state, { type: 'wait' });
  return state;
};
const errs = (s: GameState): string => checkInvariants(s, engine.registry).join('\n');

describe('props invariants', () => {
  test('valid entries pass; malformed or lingering ones fail', () => {
    const s = fresh();
    const hero = getPlayer(s);
    hero.c.props = {
      stealth: { intrinsic: true, timeout: 0 },
      fast: { intrinsic: false, timeout: 9 },
    };
    expect(errs(s)).toBe('');
    hero.c.props['fast'] = { intrinsic: false, timeout: 0 };
    expect(errs(s)).toMatch(/not pruned/);
    hero.c.props['fast'] = { intrinsic: false, timeout: -1 };
    expect(errs(s)).toMatch(/malformed/);
    hero.c.props['fast'] = { intrinsic: false, timeout: 1.5 };
    expect(errs(s)).toMatch(/malformed/);
    hero.c.props['fast'] = { intrinsic: 1 as unknown as boolean, timeout: 3 };
    expect(errs(s)).toMatch(/malformed/);
  });
});

describe('door invariants', () => {
  test('generated doors sit in walls on many seeds and sizes', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { state } = engine.newGame({
        seed,
        width: seed % 2 ? 80 : 120,
        height: seed % 2 ? 21 : 45,
      });
      expect(errs(state), `seed ${seed}`).toBe('');
    }
  });

  test('a locked door in open floor is reported', () => {
    runScenario([vanillaMod], (s) => {
      s.level(['.....', '.....', '..@..', '.....', '.....']);
      s.door({ x: 1, y: 1 }, 'locked');
      s.check((st) => expect(errs(st)).toMatch(/no walls on opposite sides/));
      s.door({ x: 1, y: 1 }, 'broken');
      s.check((st) => expect(errs(st)).toMatch(/no walls on opposite sides/));
    });
  });

  test('a locked door in a wall passes', () => {
    runScenario([vanillaMod], (s) => {
      s.level(['-----', '|.@.|', '--+--', '|...|', '-----']);
      s.door({ x: 2, y: 2 }, 'locked');
      s.check((st) => expect(errs(st)).toBe(''));
    });
  });
});

describe('monster memory invariants', () => {
  test('valid memory passes; bad keys and defs fail', () => {
    const s = fresh();
    const lv = getLevel(s);
    s.monsterMemory[lv.id] = { '3': 'nh:newt' };
    expect(errs(s)).toBe('');
    s.monsterMemory[lv.id] = { [String(lv.width * lv.height)]: 'nh:newt' };
    expect(errs(s)).toMatch(/not a cell index/);
    s.monsterMemory[lv.id] = { '-1': 'nh:newt' };
    expect(errs(s)).toMatch(/not a cell index/);
    s.monsterMemory[lv.id] = { '3': 'nh:dagger' };
    expect(errs(s)).toMatch(/not a registered monster/);
    s.monsterMemory[lv.id] = {};
    s.monsterMemory['nowhere'] = {};
    expect(errs(s)).toMatch(/unknown level/);
  });
});

describe('flee table invariants', () => {
  test('entries must name living monsters and hold non-negative integers', () => {
    runScenario([vanillaMod], (s) => {
      s.level(['-----', '|.@.|', '|...|', '-----']);
      s.monster('nh:newt', { x: 1, y: 2 });
      s.check((st) => {
        const id = sortedIds(st).find((i) => st.entities[String(i)]?.c.monster)!;
        st.modData['nh'] = { mflee: { [String(id)]: 5 } };
        expect(errs(st)).toBe('');
        st.modData['nh'] = { mflee: { [String(id)]: -2 } };
        expect(errs(st)).toMatch(/flee time/);
        st.modData['nh'] = { mflee: { '9999': 3 } };
        expect(errs(st)).toMatch(/is not a monster/);
      });
    });
  });
});

describe('spell state invariants', () => {
  const nh = (s: GameState): Record<string, unknown> => s.modData['nh'] as Record<string, unknown>;

  test('the hero keeps 0 <= Pw <= max <= peak', () => {
    const s = fresh();
    expect(nh(s)['pw']).toEqual({ uen: 2, uenmax: 2, uenpeak: 2 });
    expect(errs(s)).toBe('');
    nh(s)['pw'] = { uen: 3, uenmax: 2, uenpeak: 2 };
    expect(errs(s)).toMatch(/pw: not 0 <= uen 3/);
    nh(s)['pw'] = { uen: 2, uenmax: 5, uenpeak: 4 };
    expect(errs(s)).toMatch(/uenmax 5 <= uenpeak 4/);
    nh(s)['pw'] = { uen: -1, uenmax: 2, uenpeak: 2 };
    expect(errs(s)).toMatch(/pw: bad fields/);
  });

  test('her spell state is whole non-negative numbers, dropped at all 0', () => {
    const s = fresh();
    nh(s)['uspell'] = { uspellprot: 2, uspmtime: 10, usptime: 3, umconf: 45 };
    expect(errs(s)).toBe('');
    nh(s)['uspell'] = { uspellprot: -1, uspmtime: 10, usptime: 3, umconf: 0 };
    expect(errs(s)).toMatch(/uspell: bad fields/);
    nh(s)['uspell'] = { uspellprot: 0, uspmtime: 0, usptime: 0, umconf: 0 };
    expect(errs(s)).toMatch(/kept while every field is 0/);
  });

  test('monster spell delays and confusion name living monsters', () => {
    runScenario([vanillaMod], (sc) => {
      sc.level(['-----', '|.@.|', '|...|', '-----']);
      sc.monster('nh:newt', { x: 1, y: 2 });
      sc.check((st) => {
        const id = String(sortedIds(st).find((i) => st.entities[i]?.c.monster)!);
        const data = (st.modData['nh'] ??= {}) as Record<string, unknown>;
        data['mspecUsed'] = { [id]: 4 };
        data['mconf'] = { [id]: true };
        expect(errs(st)).toBe('');
        data['mspecUsed'] = { [id]: 0 };
        expect(errs(st)).toMatch(/mspecUsed: monster \d+ has 0/);
        data['mspecUsed'] = { '9999': 2 };
        expect(errs(st)).toMatch(/mspecUsed: '9999' is not a monster/);
        delete data['mspecUsed'];
        data['mconf'] = { '9999': true };
        expect(errs(st)).toMatch(/mconf: '9999' is not a monster/);
      });
    });
  });
});
