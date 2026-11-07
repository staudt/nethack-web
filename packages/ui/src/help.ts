// Help: a touch-screen guide, the command list built from the live keymap, the menu's commands
// and an About page. Every command row runs its command when tapped, so nothing needs a keyboard.
// ref: src/pager.c dohelp(), help_menu_items[]; src/cmd.c dokeylist()
import type { DefId, Dir, Params, UiCommand } from '@nh/core';
import type { MenuEntry, MenuSpec, OpenMenu } from './menu';

export interface HelpDeps {
  t(key: string, params?: Params): string;
  has(key: string): boolean;
  /** Opens a sheet (replacing any open one). */
  open(spec: MenuSpec): OpenMenu;
  /** The keymap's bindings, `[key, command]`. */
  entries(): readonly (readonly [string, UiCommand])[];
  /** The main menu's items (New game, Save, the extended commands, ...). */
  menuItems(): readonly { labelKey: string; run(): void }[];
  /** Runs a command chosen from the list (help is already closed). */
  run(cmd: UiCommand): void;
  /** Runs when the help menu itself is closed (the title screen opens again). */
  onClose?: () => void;
}

export interface CommandRow {
  /** The key as NetHack writes it: `k`, `^D`, `M-l`. */
  key: string;
  label: string;
  cmd: UiCommand;
}

export interface CommandList {
  /** Three lines of the movement keys, northwest first, the wait key in the middle. */
  grid: string[];
  /** One line per command that takes a direction from its own keys (Shift+direction runs). */
  dirLines: string[];
  /** Every other binding once, sorted by key. */
  commands: CommandRow[];
}

const GRID: (Dir | null)[][] = [
  ['nw', 'n', 'ne'],
  ['w', null, 'e'],
  ['sw', 's', 'se'],
];

/** `Ctrl+d` is `^D` and `Alt+l` is `M-l`, as NetHack's key list writes them. */
export function keyName(k: string): string {
  if (k.startsWith('Ctrl+')) return `^${k.slice(5).toUpperCase()}`;
  if (k.startsWith('Alt+')) return `M-${k.slice(4)}`;
  if (k === ' ') return 'Space';
  return k;
}

/** The id help describes a command by: the ui id, the mod action id, or the action type. */
export function commandId(cmd: UiCommand): string {
  if (cmd.type === 'ui') return cmd.id;
  return cmd.action.type === 'mod' ? cmd.action.action : cmd.action.type;
}

/**
 * A command's description: `help.cmd.<id>` when a catalog has it, else the action's own
 * `action.<id>` label (for `self:<id>`, `pick:<id>` and mod actions), else the raw id.
 */
export function commandLabel(cmd: UiCommand, t: HelpDeps['t'], has: HelpDeps['has']): string {
  const id = commandId(cmd);
  if (has(`help.cmd.${id}`)) return t(`help.cmd.${id}`);
  const action = /^(?:self|pick):(.+)$/.exec(id)?.[1] ?? id;
  if (has(`action.${action}`)) return t(`action.${action}`);
  return id;
}

const isDirectional = (cmd: UiCommand): boolean => {
  if (cmd.type !== 'action') return false;
  const a = cmd.action;
  if (a.type === 'move' || a.type === 'wait') return true;
  const args = a.type === 'mod' ? a.args : undefined;
  return typeof args === 'object' && args !== null && !Array.isArray(args) && 'dir' in args;
};

/** Plain characters first, then `^x`, then `M-x`, then named keys. */
const keyRank = (name: string): number =>
  [...name].length === 1 ? 0 : name.startsWith('^') ? 1 : name.startsWith('M-') ? 2 : 3;
const compareKeys = (a: string, b: string): number => {
  const r = keyRank(a) - keyRank(b);
  if (r !== 0) return r;
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la !== lb) return la < lb ? -1 : 1;
  return a < b ? 1 : a > b ? -1 : 0; // lowercase before uppercase
};

/** The help's view of a keymap. */
export function commandList(
  entries: readonly (readonly [string, UiCommand])[],
  t: HelpDeps['t'],
  has: HelpDeps['has'],
): CommandList {
  const single = (k: string): boolean => [...k].length === 1;
  const moveKey = new Map<string, string>(); // dir ('.' for wait) -> the first single-character key
  const dirKeys = new Map<DefId, string[]>(); // directional mod command id -> keys
  const commands: CommandRow[] = [];
  for (const [k, cmd] of entries) {
    if (!isDirectional(cmd)) {
      commands.push({ key: keyName(k), label: commandLabel(cmd, t, has), cmd });
      continue;
    }
    if (cmd.type !== 'action') continue;
    const a = cmd.action;
    if (a.type === 'move' || a.type === 'wait') {
      const d = a.type === 'move' ? a.dir : '.';
      if (single(k) && !moveKey.has(d)) moveKey.set(d, k);
    } else if (a.type === 'mod') {
      dirKeys.set(a.action, [...(dirKeys.get(a.action) ?? []), keyName(k)]);
    }
  }
  const grid = GRID.map((row) => row.map((d) => moveKey.get(d ?? '.') ?? '·').join('  '));
  const dirLines = [...dirKeys.keys()].sort().map((id) => {
    if (has(`help.dir.${id}`)) return t(`help.dir.${id}`);
    const keys = (dirKeys.get(id) ?? []).sort(compareKeys).join(' ');
    return `${keys}: ${commandLabel({ type: 'action', action: { type: 'mod', action: id } }, t, has)}`;
  });
  commands.sort((a, b) => compareKeys(a.key, b.key));
  return { grid, dirLines, commands };
}

const TOUCH_LINES = 8;
const ABOUT_LINES = 4;

/** The help menu (`?`, Menu > Help). Closing a page goes back to it. */
export function openHelp(deps: HelpDeps): void {
  const { t, has } = deps;
  const back = (): void => openHelp(deps);
  const page = (title: string, entries: MenuEntry[]): void => {
    deps.open({ title, entries, cancelLabel: t('ui.help.back'), onCancel: back });
  };
  const text = (label: string): MenuEntry => ({ label, run: () => {}, text: true });
  const heading = (label: string): MenuEntry => ({ label, run: () => {}, heading: true });
  const lines = (prefix: string, n: number): MenuEntry[] =>
    Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`)
      .filter((k) => has(k))
      .map((k) => text(t(k)));

  const touch = (): void => page(t('ui.help.touch'), lines('ui.help.touch.', TOUCH_LINES));
  const keys = (): void => {
    const list = commandList(deps.entries(), t, has);
    page(t('ui.help.keys'), [
      heading(t('ui.help.movement')),
      ...list.grid.map(text),
      text(t('ui.help.movement.more')),
      ...list.dirLines.map(text),
      heading(t('ui.help.commands')),
      ...list.commands.map((c) => ({
        label: `${c.key}  ${c.label}`,
        // The row's own key picks it when it is one character; others get no menu letter.
        key: [...c.key].length === 1 ? c.key : '',
        run: () => deps.run(c.cmd),
      })),
    ]);
  };
  const ext = (): void =>
    page(
      t('ui.help.ext'),
      deps.menuItems().map((m) => ({ label: t(m.labelKey), run: () => m.run() })),
    );
  const about = (): void => page(t('ui.help.about'), lines('ui.help.about.', ABOUT_LINES));

  deps.open({
    title: t('ui.help'),
    entries: [
      { label: t('ui.help.touch'), run: touch },
      { label: t('ui.help.keys'), run: keys },
      { label: t('ui.help.ext'), run: ext },
      { label: t('ui.help.about'), run: about },
    ],
    cancelLabel: t('ui.close'),
    ...(deps.onClose ? { onCancel: deps.onClose } : {}),
  });
}
