import { expect, test } from 'vitest';
import type { ClientApi, UiCommand } from '@nh/core';
import { vanillaKeys } from '../src/keys';

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
