import { describe, expect, test } from 'vitest';
import type { ClientApi, UiCommand } from '@nh/core';
import { Keymap, defaultKeymap } from '../src/keymap';

function dflt(): Keymap {
  const km = new Keymap();
  defaultKeymap.register({ bindKey: (k, c) => km.bind(k, c) } as ClientApi);
  return km;
}
const act = (c: UiCommand | undefined) => (c?.type === 'action' ? c.action : undefined);
const mv = (km: Keymap, code: string, key = code) => {
  const a = act(km.resolve({ code, key }));
  return a?.type === 'move' ? a.dir : a?.type;
};

describe('keymap', () => {
  test('code before key, later bindings override', () => {
    const km = new Keymap();
    km.bind('KeyA', { type: 'ui', id: 'code' });
    km.bind('a', { type: 'ui', id: 'key' });
    expect(km.resolve({ code: 'KeyA', key: 'a' })).toEqual({ type: 'ui', id: 'code' });
    expect(km.resolve({ code: 'KeyZ', key: 'a' })).toEqual({ type: 'ui', id: 'key' });
    km.bind('a', { type: 'ui', id: 'key2' });
    expect(km.resolve({ code: 'KeyZ', key: 'a' })).toEqual({ type: 'ui', id: 'key2' });
    expect(km.resolve({ code: 'KeyZ', key: 'z' })).toBeUndefined();
  });
  test('default arrows and vi keys', () => {
    const km = dflt();
    expect(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].map((k) => mv(km, k))).toEqual([
      'n',
      's',
      'w',
      'e',
    ]);
    expect(
      ['h', 'j', 'k', 'l', 'y', 'u', 'b', 'n'].map((k) => mv(km, 'Key' + k.toUpperCase(), k)),
    ).toEqual(['w', 's', 'n', 'e', 'nw', 'ne', 'sw', 'se']);
  });
  test('numpad, nav keys, wait, search', () => {
    const km = dflt();
    const pad = [1, 2, 3, 4, 6, 7, 8, 9].map((n) => mv(km, `Numpad${n}`, String(n)));
    expect(pad).toEqual(['sw', 's', 'se', 'w', 'e', 'nw', 'n', 'ne']);
    expect(['Home', 'PageUp', 'End', 'PageDown'].map((k) => mv(km, k))).toEqual([
      'nw',
      'ne',
      'sw',
      'se',
    ]);
    expect(mv(km, 'Numpad5', '5')).toBe('wait');
    expect(mv(km, 'Clear')).toBe('wait');
    expect(mv(km, 'Period', '.')).toBe('wait');
    expect(mv(km, 'KeyS', 's')).toBe('search');
  });
});

describe('modifier chords', () => {
  const km = new Keymap();
  km.bind('Alt+l', { type: 'ui', id: 'alt-l' });
  km.bind('Alt+N', { type: 'ui', id: 'alt-N' });
  km.bind('Ctrl+d', { type: 'ui', id: 'ctrl-d' });
  km.bind('l', { type: 'ui', id: 'l' });
  km.bind('@', { type: 'ui', id: 'at' });
  test('Alt uses the physical letter; Shift picks the capital', () => {
    expect(km.resolve({ code: 'KeyL', key: '¬', altKey: true })).toEqual({
      type: 'ui',
      id: 'alt-l',
    });
    expect(km.resolve({ code: 'KeyN', key: 'N', altKey: true, shiftKey: true })).toEqual({
      type: 'ui',
      id: 'alt-N',
    });
    expect(km.resolve({ code: 'KeyD', key: 'd', altKey: true })).toBeUndefined();
  });
  test('Ctrl only matches Ctrl bindings; Ctrl+Alt (AltGr) is the typed character', () => {
    expect(km.resolve({ code: 'KeyD', key: 'D', ctrlKey: true })).toEqual({
      type: 'ui',
      id: 'ctrl-d',
    });
    expect(km.resolve({ code: 'KeyL', key: 'l', ctrlKey: true })).toBeUndefined();
    expect(km.resolve({ code: 'KeyQ', key: '@', ctrlKey: true, altKey: true })).toEqual({
      type: 'ui',
      id: 'at',
    });
  });
});
