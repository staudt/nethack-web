import { expect, test } from 'vitest';
import { monsterLayer, objectLayer } from '../src/index';

test('objectLayer returns the top object id, or null', () => {
  expect(objectLayer({ g: 'nh:floor', v: true, o: 'nh:dagger' })).toBe('nh:dagger');
  expect(objectLayer({ g: 'nh:floor', v: false })).toBeNull();
});

test('monsterLayer shows a remembered monster only on cells out of view', () => {
  expect(monsterLayer({ g: 'nh:floor', v: false, m: 'nh:newt' })).toBe('nh:newt');
  expect(monsterLayer({ g: 'nh:floor', v: false })).toBeNull();
  // a live monster in view is an entity, never drawn from the cell
  expect(monsterLayer({ g: 'nh:floor', v: true, m: 'nh:newt' })).toBeNull();
});

test('objectLayer draws an object over a seen trap, and the trap over terrain', () => {
  expect(objectLayer({ g: 'nh:floor', v: true, o: 'nh:dagger', t: 'nh:bear_trap' })).toBe(
    'nh:dagger',
  );
  expect(objectLayer({ g: 'nh:floor', v: false, t: 'nh:bear_trap' })).toBe('nh:bear_trap');
});
