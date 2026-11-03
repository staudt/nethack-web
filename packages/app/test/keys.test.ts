import { describe, expect, test } from 'vitest';
import type { ClientApi, UiCommand } from '@nh/core';
import { runAction, vanillaKeys } from '../src/keys';

test('binds > and < to stairs', () => {
  const bound: Record<string, UiCommand> = {};
  vanillaKeys.register({ bindKey: (k: string, c: UiCommand) => void (bound[k] = c) } as ClientApi);
  expect(bound['>']).toEqual({ type: 'action', action: { type: 'mod', action: 'nh:down' } });
  expect(bound['<']).toEqual({ type: 'action', action: { type: 'mod', action: 'nh:up' } });
});

test('binds inventory and item verbs to ui commands', () => {
  const bound: Record<string, UiCommand> = {};
  vanillaKeys.register({ bindKey: (k: string, c: UiCommand) => void (bound[k] = c) } as ClientApi);
  expect(bound['i']).toEqual({ type: 'ui', id: 'inventory' });
  expect(bound[',']).toEqual({ type: 'ui', id: 'self:nh:pickup' });
  expect(bound['\\']).toEqual({ type: 'ui', id: 'self:nh:discoveries' });
  const picks: Record<string, string> = {
    d: 'drop',
    w: 'wield',
    W: 'wear',
    T: 'takeoff',
    e: 'eat',
    q: 'quaff',
    r: 'read',
    t: 'throw',
  };
  for (const [k, v] of Object.entries(picks)) {
    expect(bound[k]).toEqual({ type: 'ui', id: `pick:nh:${v}` });
  }
});

test('binds run keys: g/G prefixes and Shift+direction', async () => {
  const { runKeys, runAction } = await import('../src/keys');
  const bound: Record<string, UiCommand> = {};
  runKeys('vi').register({
    bindKey: (k: string, c: UiCommand) => void (bound[k] = c),
  } as ClientApi);
  expect(bound['g']).toEqual({ type: 'ui', id: 'prefix:rush' });
  expect(bound['G']).toEqual({ type: 'ui', id: 'prefix:run' });
  expect(bound['H']).toEqual({ type: 'action', action: runAction('w', 'shift') });
  expect(bound['N']).toEqual({ type: 'action', action: runAction('se', 'shift') });
  expect(bound['Shift+ArrowUp']).toEqual({ type: 'action', action: runAction('n', 'shift') });
  expect(runAction('e', 'rush')).toEqual({
    type: 'mod',
    action: 'nh:run',
    args: { dir: 'e', mode: 'rush' },
  });
});

import { extendedCommands, EXTENDED_COMMANDS } from '../src/keys';
import { movementKeys } from '@nh/ui';
import { loadLayout, numpadKeys, runKeys as runKeysFor, saveLayout } from '../src/keys';

const bindings = (mod: { register(api: ClientApi): void }): Record<string, UiCommand> => {
  const bound: Record<string, UiCommand> = {};
  mod.register({ bindKey: (k: string, c: UiCommand) => void (bound[k] = c) } as ClientApi);
  return bound;
};

test('number pad layout: digits and the number pad move, k kicks, no Shift+HJKL runs', () => {
  const move = bindings(movementKeys('numpad'));
  expect(move['8']).toEqual({ type: 'action', action: { type: 'move', dir: 'n' } });
  expect(move['Numpad7']).toEqual({ type: 'action', action: { type: 'move', dir: 'nw' } });
  expect(move['ArrowUp']).toEqual({ type: 'action', action: { type: 'move', dir: 'n' } });
  expect(move['k']).toBeUndefined();
  expect(bindings(numpadKeys)['k']).toEqual({ type: 'ui', id: 'self:nh:kick' });
  expect(bindings(runKeysFor('numpad'))['K']).toBeUndefined();
});

test('vi layout: hjklyubn move and Shift+HJKL run; no digit moves', () => {
  const move = bindings(movementKeys('vi'));
  expect(move['k']).toEqual({ type: 'action', action: { type: 'move', dir: 'n' } });
  expect(move['8']).toBeUndefined();
  expect(bindings(runKeysFor('vi'))['K']).toBeDefined();
});

test('the layout is remembered; number pad is the default', () => {
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
  expect(loadLayout(storage)).toBe('numpad');
  saveLayout(storage, 'vi');
  expect(loadLayout(storage)).toBe('vi');
  expect(loadLayout(null)).toBe('numpad');
  const broken = {
    getItem: (): string => {
      throw new Error('blocked');
    },
    setItem: (): void => {
      throw new Error('blocked');
    },
  };
  expect(loadLayout(broken)).toBe('numpad');
  expect(() => saveLayout(broken, 'vi')).not.toThrow();
});

test('binds swap, kick and fire', () => {
  const bound: Record<string, UiCommand> = {};
  vanillaKeys.register({ bindKey: (k: string, c: UiCommand) => void (bound[k] = c) } as ClientApi);
  expect(bound['x']).toEqual({ type: 'ui', id: 'self:nh:swap_weapon' });
  expect(bound['Ctrl+d']).toEqual({ type: 'ui', id: 'self:nh:kick' });
  expect(bound['f']).toEqual({ type: 'ui', id: 'pick:nh:fire' });
});

test('extended commands run the self offer if offered, else nothing', async () => {
  const items: { id: string; run(): void }[] = [];
  const acts: unknown[] = [];
  const offers = [{ action: { type: 'mod', action: 'nh:enhance' } }];
  extendedCommands({
    act: (a) => void acts.push(a),
    query: { actionsFor: () => Promise.resolve(offers) } as never,
  }).register({ addMenuItem: (i: { id: string; run(): void }) => items.push(i) } as never);
  expect(items.map((i) => i.id)).toEqual(EXTENDED_COMMANDS.map((c) => c.id));
  items[0]!.run();
  items[1]!.run(); // nh:call not offered
  await new Promise((r) => setTimeout(r, 0));
  expect(acts).toEqual([{ type: 'mod', action: 'nh:enhance' }]);
});

import { Keymap } from '@nh/ui';
import { runPrefixes, wizardKeys } from '../src/keys';
import type { KeyLayout } from '@nh/ui';

/** The keymap main.ts builds for a layout (same mods, same order). */
function keymapFor(layout: KeyLayout): Keymap {
  const km = new Keymap();
  const api = { bindKey: (k: string, c: UiCommand) => km.bind(k, c) } as ClientApi;
  for (const m of [
    movementKeys(layout),
    vanillaKeys,
    ...(layout === 'numpad' ? [numpadKeys] : []),
    runKeysFor(layout),
  ])
    m.register(api);
  return km;
}
const press = (km: Keymap, key: string, mods: { altKey?: boolean; ctrlKey?: boolean } = {}) =>
  km.resolve({ code: /^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : key, key, ...mods });
const ui = (id: string): UiCommand => ({ type: 'ui', id });

describe.each(['vi', 'numpad'] as const)('NetHack command keys (%s)', (layout) => {
  const km = keymapFor(layout);
  test('item verbs, self commands and direction prefixes', () => {
    expect(press(km, 'a')).toEqual(ui('pick:nh:apply'));
    expect(press(km, 'P')).toEqual(ui('pick:nh:puton'));
    expect(press(km, 'R')).toEqual(ui('pick:nh:remove'));
    expect(press(km, 'l', { altKey: true })).toEqual(ui('pick:nh:loot'));
    expect(press(km, 'p', { altKey: true })).toEqual(ui('self:nh:pray'));
    expect(press(km, 'c', { altKey: true })).toEqual(ui('self:nh:chat'));
    expect(press(km, 'e', { altKey: true })).toEqual(ui('self:nh:enhance'));
    expect(press(km, 'n', { altKey: true })).toEqual(ui('self:nh:call'));
    expect(press(km, 'C')).toEqual(ui('self:nh:call'));
    expect(press(km, 'D')).toEqual(ui('self:nh:drop_many'));
    expect(press(km, ';')).toEqual(ui('look'));
    expect(press(km, 'o')).toEqual(ui('prefix:open'));
    expect(press(km, 'F')).toEqual(ui('prefix:fight'));
    expect(press(km, '^')).toEqual(ui('prefix:idtrap'));
    expect(press(km, 'd', { ctrlKey: true })).toEqual(ui('self:nh:kick'));
    // existing keys keep working
    expect(press(km, ',')).toEqual(ui('self:nh:pickup'));
    expect(press(km, 'w')).toEqual(ui('pick:nh:wield'));
    expect(press(km, 'g')).toEqual(ui('prefix:rush'));
    // wizard keys only come with the wizard mod's key set
    expect(press(km, 'f', { ctrlKey: true })).toBeUndefined();
  });
  if (layout === 'vi')
    test('vi letters still move and run: l east, N runs south-east, k north', () => {
      expect(press(km, 'l')).toEqual({ type: 'action', action: { type: 'move', dir: 'e' } });
      expect(press(km, 'k')).toEqual({ type: 'action', action: { type: 'move', dir: 'n' } });
      expect(press(km, 'N')).toEqual({ type: 'action', action: runAction('se', 'shift') });
      expect(press(km, '-')).toBeUndefined();
    });
  else
    test('number pad frees the letters: l loots, k kicks, N names, - fights', () => {
      expect(press(km, 'l')).toEqual(ui('pick:nh:loot'));
      expect(press(km, 'k')).toEqual(ui('self:nh:kick'));
      expect(press(km, 'N')).toEqual(ui('self:nh:call'));
      expect(press(km, '-')).toEqual(ui('prefix:fight'));
      expect(press(km, '6')).toEqual({ type: 'action', action: { type: 'move', dir: 'e' } });
    });
});

test('direction prefixes build open, fight and idtrap actions', () => {
  const p = runPrefixes.prefixes;
  expect(p.open('w')).toEqual({ type: 'mod', action: 'nh:open', args: { dir: 'w' } });
  expect(p.fight('ne')).toEqual({ type: 'mod', action: 'nh:fight', args: { dir: 'ne' } });
  expect(p.idtrap('s')).toEqual({ type: 'mod', action: 'nh:idtrap', args: { dir: 's' } });
});

test('wizard keys are wizard-mod self offers', () => {
  const b = bindings(wizardKeys);
  expect(b['Ctrl+f']).toEqual(ui('self:wiz:map'));
  expect(b['Ctrl+v']).toEqual(ui('self:wiz:levelport'));
  expect(b['Ctrl+w']).toEqual(ui('self:wiz:wish'));
  expect(b['Ctrl+i']).toEqual(ui('self:wiz:identify'));
  expect(b['Ctrl+g']).toEqual(ui('self:wiz:genesis'));
  expect(b['Ctrl+o']).toEqual(ui('self:wiz:where'));
});
