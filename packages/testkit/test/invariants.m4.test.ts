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
