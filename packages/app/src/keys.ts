import type { AsyncCoreQuery, ClientMod, DefId, Dir, PlayerAction } from '@nh/core';
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
  ['z', 'nh:zap'],
  ['a', 'nh:apply'],
  ['P', 'nh:puton'],
  ['R', 'nh:remove'],
  // #loot: floor containers come as self offers, so the picker lists each one
  ['Alt+l', 'nh:loot'],
  // #dip into a fountain: "Wash your hands" comes as a self offer, then the items
  ['Alt+d', 'nh:dip'],
];

/**
 * Commands without an item: key -> self offer (host command `self:<id>`). Keys follow NetHack's
 * default table (ref: src/cmd.c extcmdlist[]); `Alt+x` is NetHack's `M-x`.
 */
const SELF_KEYS: [string, string][] = [
  [',', 'nh:pickup'],
  ['\\', 'nh:discoveries'],
  ['+', 'nh:spells'],
  ['Z', 'nh:cast'],
  ['x', 'nh:swap_weapon'],
  ['Ctrl+d', 'nh:kick'],
  ['D', 'nh:drop_many'],
  ['C', 'nh:call'],
  ['Alt+n', 'nh:call'],
  ['Alt+p', 'nh:pray'],
  ['Alt+c', 'nh:chat'],
  ['p', 'nh:pay'],
  ['Alt+e', 'nh:enhance'],
  ['Alt+f', 'nh:force'],
  ['Alt+u', 'nh:untrap'],
  ['Alt+j', 'nh:jump'],
  ['Alt+m', 'nh:monster'],
];

/** Direction prefixes (see `runPrefixes`): `o` open, `F` fight, `^` identify a trap. */
const DIR_PREFIX_KEYS: [string, string][] = [
  ['o', 'open'],
  ['F', 'fight'],
  ['^', 'idtrap'],
];

/** Vanilla client keys beyond the UI defaults: stairs, inventory, item verbs and commands. */
export const vanillaKeys: ClientMod = {
  id: 'nh-vanilla-keys',
  version: '1.0.0',
  register(api) {
    api.bindKey('>', { type: 'action', action: { type: 'mod', action: 'nh:down' } });
    api.bindKey('<', { type: 'action', action: { type: 'mod', action: 'nh:up' } });
    api.bindKey('i', { type: 'ui', id: 'inventory' });
    api.bindKey(';', { type: 'ui', id: 'look' });
    // An unavailable self offer does nothing.
    for (const [k, id] of SELF_KEYS) api.bindKey(k, { type: 'ui', id: `self:${id}` });
    for (const [k, id] of PICK_KEYS) api.bindKey(k, { type: 'ui', id: `pick:${id}` });
    for (const [k, p] of DIR_PREFIX_KEYS) api.bindKey(k, { type: 'ui', id: `prefix:${p}` });
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

/**
 * With number_pad on, letters freed from movement get commands: `k` kick, `l` loot, `N` name,
 * `-` fight (ref: src/cmd.c commands_init(), the number_pad bindings).
 */
export const numpadKeys: ClientMod = {
  id: 'nh-numpad-keys',
  version: '1.0.0',
  register(api) {
    api.bindKey('k', { type: 'ui', id: 'self:nh:kick' });
    api.bindKey('l', { type: 'ui', id: 'pick:nh:loot' });
    api.bindKey('N', { type: 'ui', id: 'self:nh:call' });
    api.bindKey('-', { type: 'ui', id: 'prefix:fight' });
  },
};

/** Wizard-mode commands (ref: src/cmd.c extcmdlist[], WIZMODECMD); bound for wizard games only. */
const WIZARD_KEYS: [string, string][] = [
  ['Ctrl+f', 'wiz:map'],
  ['Ctrl+v', 'wiz:levelport'],
  ['Ctrl+w', 'wiz:wish'],
  ['Ctrl+i', 'wiz:identify'],
  ['Ctrl+g', 'wiz:genesis'],
  // NetHack 3.7 moved #wizwhere off ^O (now #overview, which we lack); 3.6 had it there
  ['Ctrl+o', 'wiz:where'],
];

/**
 * Wizard keys. Bound only in a wizard game, so a normal game leaves the browser's own Ctrl
 * shortcuts (find, close tab, ...) alone; each is a self offer of the wizard mod.
 */
export const wizardKeys: ClientMod = {
  id: 'nh-wizard-keys',
  version: '1.0.0',
  register(api) {
    for (const [k, id] of WIZARD_KEYS) api.bindKey(k, { type: 'ui', id: `self:${id}` });
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

const withDir =
  (action: DefId) =>
  (dir: Dir): PlayerAction => ({
    type: 'mod',
    action,
    args: { dir },
  });

/**
 * UI options for the direction prefixes: g/G runs, and the commands that ask "In what
 * direction?" in NetHack (open, fight, ^), which here take the next direction key.
 */
export const runPrefixes = {
  prefixes: {
    rush: (dir: Dir) => runAction(dir, 'rush'),
    run: (dir: Dir) => runAction(dir, 'run'),
    open: withDir('nh:open'),
    fight: withDir('nh:fight'),
    idtrap: withDir('nh:idtrap'),
  },
};

/** The look cursor's `o`/`O` skip boulders and rocks (ref: src/getpos.c gather_locs_interesting()). */
export const lookOptions = { lookSkipObjects: ['nh:boulder', 'nh:rock'] };

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

/**
 * Help descriptions for keys whose command has no `action.*` label of its own, or whose label
 * needs a target (`help.cmd.<command id>`, see the UI's help).
 */
export const keyHelpEn: Record<string, string> = {
  'help.cmd.nh:down': 'Go down a staircase',
  'help.cmd.nh:up': 'Go up a staircase',
  'help.cmd.pick:nh:loot': 'Loot a box on the floor',
  'help.cmd.pick:nh:dip': 'Dip an object',
  'help.cmd.prefix:open': 'Open a door',
  'help.cmd.prefix:fight': 'Fight in a direction, even if you see nothing there',
  'help.cmd.prefix:idtrap': 'Identify a trap next to you',
  'help.cmd.prefix:rush': 'Rush in a direction, until something interesting',
  'help.cmd.prefix:run': 'Run in a direction, until something very interesting',
  'help.dir.nh:run': 'Shift with a direction: run.',
};
