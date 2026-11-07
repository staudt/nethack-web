import { describe, expect, test } from 'vitest';
import type { ViewCell } from '@nh/core';
import {
  createGetpos,
  findFeature,
  gatherLocs,
  getposInput,
  truncateToMap,
  type GetposView,
} from '../src/getpos';

const W = 10;
const H = 6;
const mkView = (over: Partial<GetposView> = {}): GetposView => ({
  width: W,
  height: H,
  cells: Array.from({ length: W * H }, (): ViewCell => ({ g: 'x:floor', v: true })),
  entities: [],
  player: { x: 4, y: 3 },
  glyphOf: (id) =>
    ({
      'x:floor': { ch: '.', fg: '' },
      'x:up': { ch: '<', fg: '' },
      'x:trap': { ch: '^', fg: '' },
    })[id],
  ...over,
});

describe('getposInput', () => {
  const mv = { type: 'action', action: { type: 'move', dir: 'w' } } as const;
  test('pick, cancel, self, gloc and feature keys win over bindings', () => {
    for (const k of ['.', ',', ';', ':'])
      expect(getposInput({ key: k, code: '' }, mv)).toEqual({ type: 'pick' });
    expect(getposInput({ key: 'Escape', code: 'Escape' }, undefined)).toEqual({ type: 'cancel' });
    expect(getposInput({ key: '@', code: '' }, undefined)).toEqual({ type: 'self' });
    expect(getposInput({ key: 'M', code: 'KeyM' }, undefined)).toEqual({
      type: 'gloc',
      gloc: 'mons',
      prev: true,
    });
    expect(getposInput({ key: 'o', code: 'KeyO' }, undefined)).toEqual({
      type: 'gloc',
      gloc: 'objs',
      prev: false,
    });
    expect(getposInput({ key: '>', code: 'Period' }, undefined)).toEqual({
      type: 'feature',
      ch: '>',
    });
  });
  test('directions come from the keymap; Shift or a capital is fast; others are ignored', () => {
    expect(getposInput({ key: 'h', code: 'KeyH' }, mv)).toEqual({
      type: 'move',
      dir: 'w',
      fast: false,
    });
    expect(getposInput({ key: 'H', code: 'KeyH' }, mv)).toEqual({
      type: 'move',
      dir: 'w',
      fast: true,
    });
    expect(getposInput({ key: 'ArrowLeft', code: 'ArrowLeft', shiftKey: true }, mv)).toEqual({
      type: 'move',
      dir: 'w',
      fast: true,
    });
    expect(getposInput({ key: 'h', code: 'KeyH' }, undefined)).toBeNull();
    expect(getposInput({ key: 'x', code: 'KeyX' }, { type: 'ui', id: 'inventory' })).toBeNull();
  });
});

describe('truncateToMap', () => {
  test('a fast diagonal stops on the edge it reaches first, keeping the diagonal', () => {
    // 8 up-left from (4,3): y hits 0 after 3 steps, so x moves 3 too
    expect(truncateToMap({ x: 4, y: 3 }, -8, -8, W, H)).toEqual({ x: 1, y: 0 });
    expect(truncateToMap({ x: 4, y: 3 }, 8, 0, W, H)).toEqual({ x: W - 1, y: 3 });
    expect(truncateToMap({ x: 0, y: 0 }, -1, 0, W, H)).toEqual({ x: 0, y: 0 });
  });
});

describe('gatherLocs', () => {
  test('hero first, then nearest, ties by row then column', () => {
    const v = mkView({
      entities: [
        { id: 1, g: 'x:hero', x: 4, y: 3 },
        { id: 2, g: 'x:a', x: 6, y: 3 },
        { id: 3, g: 'x:b', x: 3, y: 2 },
        { id: 4, g: 'x:c', x: 5, y: 2 },
      ],
    });
    expect(gatherLocs(v, 'mons')).toEqual([
      { x: 4, y: 3 },
      { x: 3, y: 2 },
      { x: 5, y: 2 },
      { x: 6, y: 3 },
    ]);
  });
  test('objects: shown ones only, skipping configured ids and cells a creature covers', () => {
    const v = mkView({ skipObjects: new Set(['x:boulder']) });
    const cells = v.cells as ViewCell[];
    cells[0] = { g: 'x:floor', v: false, o: 'x:gem' }; // remembered: still shown
    cells[1] = { g: 'x:floor', v: true, o: 'x:boulder' };
    cells[2] = { g: 'x:floor', v: false, o: 'x:gem', m: 'x:newt' }; // remembered monster on top
    cells[3 * W + 8] = { g: 'x:floor', v: true, o: 'x:gem' };
    const withMon: GetposView = { ...v, entities: [{ id: 2, g: 'x:a', x: 8, y: 3 }] };
    expect(gatherLocs(withMon, 'objs')).toEqual([
      { x: 4, y: 3 },
      { x: 0, y: 0 },
    ]);
  });
});

describe('findFeature', () => {
  test('searches past the cursor in reading order and wraps; ^ matches any seen trap', () => {
    const v = mkView();
    const cells = v.cells as ViewCell[];
    cells[1 * W + 2] = { g: 'x:up', v: true };
    cells[4 * W + 7] = { g: 'x:up', v: true };
    cells[5 * W + 0] = { g: 'x:floor', v: true, t: 'x:web' };
    expect(findFeature(v, { x: 4, y: 3 }, '<')).toEqual({ x: 7, y: 4 });
    expect(findFeature(v, { x: 7, y: 4 }, '<')).toEqual({ x: 2, y: 1 });
    expect(findFeature(v, { x: 2, y: 1 }, '<')).toEqual({ x: 7, y: 4 });
    expect(findFeature(v, { x: 0, y: 0 }, '^')).toEqual({ x: 0, y: 5 });
    expect(findFeature(v, { x: 0, y: 0 }, '{')).toBeNull();
  });
});

describe('createGetpos', () => {
  test('cycles m forward and back, @ resets the cycle', () => {
    const v = mkView({
      entities: [
        { id: 2, g: 'x:a', x: 5, y: 3 },
        { id: 3, g: 'x:b', x: 0, y: 0 },
      ],
    });
    const g = createGetpos(() => v);
    expect(g.cursor).toEqual({ x: 4, y: 3 });
    g.input({ type: 'gloc', gloc: 'mons', prev: false });
    expect(g.cursor).toEqual({ x: 5, y: 3 });
    g.input({ type: 'gloc', gloc: 'mons', prev: false });
    expect(g.cursor).toEqual({ x: 0, y: 0 });
    g.input({ type: 'self' });
    expect(g.cursor).toEqual({ x: 4, y: 3 });
    g.input({ type: 'gloc', gloc: 'mons', prev: true });
    expect(g.cursor).toEqual({ x: 0, y: 0 });
    g.input({ type: 'move', dir: 'se', fast: true });
    expect(g.cursor).toEqual({ x: 5, y: 5 });
    expect(g.input({ type: 'pick' })).toEqual({ type: 'pick', pos: { x: 5, y: 5 } });
    expect(g.input({ type: 'feature', ch: '_' })).toEqual({ type: 'notfound', ch: '_' });
  });
});
