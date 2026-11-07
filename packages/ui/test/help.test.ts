import { afterEach, describe, expect, test } from 'vitest';
import type {
  ActionOffer,
  AsyncCoreQuery,
  ClientApi,
  ClientMod,
  Dir,
  PlayerAction,
  Renderer,
  UiCommand,
} from '@nh/core';
import { commandList, keyName } from '../src/help';
import { Keymap, movementKeys, type KeyLayout } from '../src/keymap';
import { createUi, type Ui } from '../src/index';

const catalog: Record<string, string> = {
  'help.cmd.nh:down': 'Go down',
  'help.cmd.prefix:open': 'Open a door',
  'action.nh:kick': 'Kick',
  'action.nh:eat': 'Eat',
};
const t = (k: string): string => catalog[k] ?? k;
const has = (k: string): boolean => k in catalog;

const extra: [string, UiCommand][] = [
  ['>', { type: 'action', action: { type: 'mod', action: 'nh:down' } }],
  ['Ctrl+d', { type: 'ui', id: 'self:nh:kick' }],
  ['e', { type: 'ui', id: 'pick:nh:eat' }],
  ['Alt+l', { type: 'ui', id: 'pick:nh:loot' }],
  ['o', { type: 'ui', id: 'prefix:open' }],
  [
    'Shift+ArrowUp',
    { type: 'action', action: { type: 'mod', action: 'nh:run', args: { dir: 'n' } } },
  ],
];
function keymap(layout: KeyLayout): Keymap {
  const km = new Keymap();
  movementKeys(layout).register({ bindKey: (k, c) => km.bind(k, c) } as ClientApi);
  for (const [k, c] of extra) km.bind(k, c);
  return km;
}

describe('command list', () => {
  test('movement grid per layout, the other bindings once each with their labels', () => {
    const vi = commandList(keymap('vi').entries(), t, has);
    expect(vi.grid).toEqual(['y  k  u', 'h  .  l', 'b  j  n']);
    const np = commandList(keymap('numpad').entries(), t, has);
    expect(np.grid).toEqual(['7  8  9', '4  .  6', '1  2  3']);
    // Direction-taking bindings are summarised, not listed one by one.
    expect(np.dirLines).toEqual(['Shift+ArrowUp: nh:run']);
    // s (search) plus the extra non-directional bindings, sorted: plain keys, ^x, M-x.
    expect(np.commands.map((c) => [c.key, c.label])).toEqual([
      ['>', 'Go down'], // help.cmd.<id>
      ['e', 'Eat'], // pick:<id> -> action.<id>
      ['o', 'Open a door'],
      ['s', 'search'], // no label anywhere: the raw id
      ['^D', 'Kick'], // self:<id> -> action.<id>
      ['M-l', 'pick:nh:loot'],
    ]);
  });

  test('key names follow NetHack', () => {
    expect([keyName('Ctrl+w'), keyName('Alt+p'), keyName('k'), keyName(' ')]).toEqual([
      '^W',
      'M-p',
      'k',
      'Space',
    ]);
  });
});

describe('help in the UI', () => {
  let ui: Ui | undefined;
  afterEach(() => {
    ui?.destroy();
    ui = undefined;
    document.body.replaceChildren();
  });
  const mk = (): { root: HTMLElement; acts: PlayerAction[] } => {
    const root = document.createElement('div');
    document.body.append(root);
    const acts: PlayerAction[] = [];
    const renderer = {
      mount() {},
      apply() {},
      setGlyph() {},
      cellAt: () => null,
      resize() {},
      destroy() {},
    } as Renderer;
    const query = {
      actionsFor: () => Promise.resolve([] as ActionOffer[]),
    } as unknown as AsyncCoreQuery;
    const mod: ClientMod = {
      id: 'test',
      version: '1',
      register(api) {
        for (const [k, c] of extra) api.bindKey(k, c);
        api.addMenuItem({ id: 'x', labelKey: 'x.item', run: () => acts.push({ type: 'search' }) });
        api.addMessages('en', catalog);
      },
    };
    ui = createUi({
      root,
      renderer,
      game: { act: (a) => void acts.push(a), query },
      mods: [movementKeys('numpad'), mod],
      prefixes: {
        open: (dir: Dir): PlayerAction => ({ type: 'mod', action: 'nh:open', args: { dir } }),
      },
    });
    return { root, acts };
  };
  const btn = (root: Element, label: string): HTMLButtonElement => {
    const b = [...root.querySelectorAll<HTMLButtonElement>('.nh-sheet button')].find((x) =>
      x.textContent?.includes(label),
    );
    if (!b) throw new Error(`no button ${label}`);
    return b;
  };
  const title = (root: Element): string | null | undefined =>
    root.querySelector('.nh-sheet-title')?.textContent;

  test('? opens help; a tapped command row runs its command', () => {
    const { root, acts } = mk();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: '?', code: 'Slash', shiftKey: true, bubbles: true }),
    );
    expect(title(root)).toBe('Help');
    btn(root, 'List of commands').click();
    btn(root, 'Go down').click();
    expect(acts).toEqual([{ type: 'mod', action: 'nh:down' }]);
    expect(root.querySelector('.nh-sheet')).toBeNull();
  });

  test('Menu > Help; a prefix row asks for its direction on the compass', () => {
    const { root, acts } = mk();
    (root.querySelector('.nh-menu-btn') as HTMLElement).click();
    btn(root, 'Help').click();
    btn(root, 'List of commands').click();
    btn(root, 'Open a door').click();
    (root.querySelector('.nh-dir[data-dir="e"]') as HTMLElement).click();
    expect(acts).toEqual([{ type: 'mod', action: 'nh:open', args: { dir: 'e' } }]);
  });

  test('menu commands are listed and run; Back returns to the help menu', () => {
    const { root, acts } = mk();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: '?', code: 'Slash', bubbles: true }),
    );
    btn(root, 'Menu commands').click();
    btn(root, 'Back').click();
    expect(title(root)).toBe('Help');
    btn(root, 'Menu commands').click();
    btn(root, 'x.item').click();
    expect(acts).toEqual([{ type: 'search' }]);
  });
});
