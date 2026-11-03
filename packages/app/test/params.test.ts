import { expect, test } from 'vitest';
import { parseParams } from '../src/params';

const rnd = (): number => 777;

test('defaults', () => {
  expect(parseParams('', rnd)).toEqual({
    seed: 777,
    width: 80,
    height: 21,
    forceNew: false,
    wizard: false,
    explicit: false,
  });
});

test('wizard=1 asks for wizard mode without making the URL explicit', () => {
  expect(parseParams('?wizard=1', rnd)).toMatchObject({ wizard: true, explicit: false });
  expect(parseParams('?wizard=0', rnd).wizard).toBe(false);
  expect(parseParams('?wizard', rnd).wizard).toBe(false);
});

test('seed and size', () => {
  const p = parseParams('?seed=42&w=100&h=30', rnd);
  expect(p).toMatchObject({ seed: 42, width: 100, height: 30, explicit: true });
});

test('clamps size', () => {
  const p = parseParams('?w=3&h=99999', rnd);
  expect(p).toMatchObject({ width: 10, height: 1000, explicit: true });
});

test('invalid values fall back', () => {
  const p = parseParams('?seed=abc&w=x&h=-5', rnd);
  expect(p).toMatchObject({ seed: 777, width: 80, height: 21 });
  expect(parseParams('?seed=4294967296', rnd).seed).toBe(777);
  expect(parseParams('?seed=4294967295', rnd).seed).toBe(4294967295);
});

test('new=1', () => {
  expect(parseParams('?new=1', rnd)).toMatchObject({ forceNew: true, explicit: false });
});
