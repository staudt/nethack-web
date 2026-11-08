import { expect, test } from 'vitest';
import { monsterLayer, objectLayer } from '../src/index';

test('objectLayer returns the top object id, or null', () => {
  expect(objectLayer({ g: 'nh:floor', v: true, o: 'nh:dagger' })).toBe('nh:dagger');
  expect(objectLayer({ g: 'nh:floor', v: false })).toBeNull();
});

test('monsterLayer shows a remembered monster out of view and a marker on any cell', () => {
  expect(monsterLayer({ g: 'nh:floor', v: false, m: 'nh:newt' })).toBe('nh:newt');
  expect(monsterLayer({ g: 'nh:floor', v: false })).toBeNull();
  expect(monsterLayer({ g: 'nh:floor', v: true })).toBeNull();
  // core sets `m` on a cell in view only for a marker (the remembered-unseen `I`)
  expect(monsterLayer({ g: 'nh:floor', v: true, m: 'nh:remembered_unseen' })).toBe(
    'nh:remembered_unseen',
  );
});

test('objectLayer draws an object over a seen trap, and the trap over terrain', () => {
  expect(objectLayer({ g: 'nh:floor', v: true, o: 'nh:dagger', t: 'nh:bear_trap' })).toBe(
    'nh:dagger',
  );
  expect(objectLayer({ g: 'nh:floor', v: false, t: 'nh:bear_trap' })).toBe('nh:bear_trap');
});
