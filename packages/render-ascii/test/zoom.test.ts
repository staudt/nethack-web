import { expect, test } from 'vitest';
import { createAsciiRenderer, fitCell } from '../src/index';

test('fitCell shows the whole map width, floored, with a minimum', () => {
  expect(fitCell(390, 80)).toBe(4);
  expect(fitCell(1280, 80)).toBe(16);
  expect(fitCell(100, 80)).toBe(3);
  expect(fitCell(390, 0)).toBe(3);
});

test('the ascii renderer offers flash() and tolerates it before mounting', () => {
  const r = createAsciiRenderer();
  expect(typeof r.flash).toBe('function');
  expect(() => {
    r.flash([{ pos: { x: 1, y: 2 }, g: 'nh:dagger' }]);
    r.flash([{ pos: { x: 1, y: 3 }, g: { ch: '|', fg: '#ff8800' } }]);
    r.flash([]);
  }).not.toThrow();
});

test('the ascii renderer offers setCursor() and tolerates it before mounting', () => {
  const r = createAsciiRenderer();
  expect(typeof r.setCursor).toBe('function');
  expect(() => {
    r.setCursor({ x: 3, y: 4 });
    r.setCursor(null);
  }).not.toThrow();
});

test('the ascii renderer offers setHighlights() and tolerates it before mounting', () => {
  const r = createAsciiRenderer();
  expect(typeof r.setHighlights).toBe('function');
  expect(() => {
    r.setHighlights([{ x: 3, y: 4 }]);
    r.setHighlights(null);
  }).not.toThrow();
});
