import type { AsyncCoreQuery, ClientMod, Dir, PlayerAction } from '@nh/core';
import type { KeyLayout } from '@nh/ui';

/** Item verbs: key -> mod action id; each opens an item picker (host command `pick:<id>`). */
const PICK_KEYS: [string, string][] = [
  ['d', 'nh:drop'],
  ['w', 'nh:wield'],
  ['W', 'nh:wear'],
  ['T', 'nh:takeoff'],
  ['e', 'nh:eat'],
  ['q', 'nh:quaff'],
  ['r', 'nh:read'],
  ['t', 'nh:throw'],
  ['f', 'nh:fire'],
];

/** Vanilla client keys beyond the UI defaults: stairs, inventory and item verbs. */
export const vanillaKeys: ClientMod = {
  id: 'nh-vanilla-keys',
  version: '1.0.0',
  register(api) {
    api.bindKey('>', { type: 'action', action: { type: 'mod', action: 'nh:down' } });
    api.bindKey('<', { type: 'action', action: { type: 'mod', action: 'nh:up' } });
    api.bindKey('i', { type: 'ui', id: 'inventory' });
    api.bindKey(',', { type: 'ui', id: 'self:nh:pickup' });
    api.bindKey('\\', { type: 'ui', id: 'self:nh:discoveries' });
    // Offered by the content once it has them; an unavailable self offer does nothing.
    api.bindKey('x', { type: 'ui', id: 'self:nh:swap_weapon' });
    api.bindKey('Ctrl+d', { type: 'ui', id: 'self:nh:kick' });
    for (const [k, id] of PICK_KEYS) api.bindKey(k, { type: 'ui', id: `pick:${id}` });
  },
};

/**
 * NetHack 5.0 run modes (ref: src/cmd.c; `context.run`): Shift+direction is mode 1 ('shift'),
 * the `g` prefix is mode 2 ('rush'), the `G` prefix is mode 3 ('run').
 */
export const runAction = (dir: Dir, mode: 'shift' | 'rush' | 'run'): PlayerAction => ({
  type: 'mod',
  action: RUN_ACTION,
  args: { dir, mode },
});

export const RUN_ACTION = 'nh:run';

/** vi keys and arrows, with the direction each one means. */
const RUN_KEYS: [string, Dir][] = [
  ['h', 'w'],
  ['j', 's'],
  ['k', 'n'],
  ['l', 'e'],
  ['y', 'nw'],
  ['u', 'ne'],
  ['b', 'sw'],
  ['n', 'se'],
];
const RUN_ARROWS: [string, Dir][] = [
  ['ArrowUp', 'n'],
  ['ArrowDown', 's'],
  ['ArrowLeft', 'w'],
  ['ArrowRight', 'e'],
];

/** Running: g and G prefixes, Shift+direction (Shift+hjklyubn only with vi keys). */
export function runKeys(layout: KeyLayout): ClientMod {
  return {
    id: 'nh-run-keys',
    version: '1.0.0',
    register(api) {
      api.bindKey('g', { type: 'ui', id: 'prefix:rush' });
      api.bindKey('G', { type: 'ui', id: 'prefix:run' });
      if (layout === 'vi')
        for (const [k, d] of RUN_KEYS)
          api.bindKey(k.toUpperCase(), { type: 'action', action: runAction(d, 'shift') });
      for (const [k, d] of RUN_ARROWS)
        api.bindKey(`Shift+${k}`, { type: 'action', action: runAction(d, 'shift') });
    },
  };
}

/** With number_pad on, `k` kicks (ref: src/cmd.c, the number_pad command set). */
export const numpadKeys: ClientMod = {
  id: 'nh-numpad-keys',
  version: '1.0.0',
  register(api) {
    api.bindKey('k', { type: 'ui', id: 'self:nh:kick' });
  },
};

const LAYOUT_KEY = 'nh.keys';

/** The remembered key layout; the number pad unless the player chose vi keys. */
export function loadLayout(storage: Pick<Storage, 'getItem'> | null): KeyLayout {
  try {
    return storage?.getItem(LAYOUT_KEY) === 'vi' ? 'vi' : 'numpad';
  } catch {
    return 'numpad';
  }
}

export function saveLayout(storage: Pick<Storage, 'setItem'> | null, layout: KeyLayout): void {
  try {
    storage?.setItem(LAYOUT_KEY, layout);
  } catch {
    // storage unavailable: the choice lasts for this page only
  }
}

/** UI options for the g/G run prefixes. */
export const runPrefixes = {
  prefixes: {
    rush: (dir: Dir) => runAction(dir, 'rush'),
    run: (dir: Dir) => runAction(dir, 'run'),
  },
};

/** Extended commands (`#enhance`, `#name`) as main-menu items, run if the self offers carry them. */
export const EXTENDED_COMMANDS: readonly { id: string; labelKey: string; action: string }[] = [
  { id: 'app.ext.enhance', labelKey: 'ui.ext.enhance', action: 'nh:enhance' },
  { id: 'app.ext.call', labelKey: 'ui.ext.call', action: 'nh:call' },
];

export function extendedCommands(game: {
  act(a: PlayerAction): void;
  query: Pick<AsyncCoreQuery, 'actionsFor'>;
}): ClientMod {
  return {
    id: 'nh-extended-commands',
    version: '1.0.0',
    register(api) {
      for (const c of EXTENDED_COMMANDS) {
        api.addMenuItem({
          id: c.id,
          labelKey: c.labelKey,
          run: () => {
            void game.query.actionsFor({ kind: 'self' }).then((offers) => {
              const o = offers.find((x) => x.action.type === 'mod' && x.action.action === c.action);
              if (o) game.act(o.action);
            });
          },
        });
      }
    },
  };
}
