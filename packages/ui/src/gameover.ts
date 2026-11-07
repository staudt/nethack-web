// The end of the game as NetHack shows it: the disclosure questions ("Do you want your
// possessions identified?"), the tombstone and the "Goodbye" summary.
// ref: src/end.c really_done(), disclose(); src/rip.c genl_outrip(); src/topten.c formatkiller()
//
// The questions are the UI's: content sends each disclosure list with its question in `ask`,
// and the answers change nothing in the game.
import type { GameEvent, Params, ViewUpdate } from '@nh/core';
import type { MenuEntry, MenuSpec, OpenMenu } from './menu';
import { an, ripLines } from './status';

type ListEvent = Extract<GameEvent, { type: 'list' }>;
type Status = ViewUpdate['status'];

export interface EndDeps {
  t(key: string, params?: Params): string;
  has(key: string): boolean;
  /** Opens a sheet (replacing any open one). */
  open(spec: MenuSpec): OpenMenu;
  /** The stone's and the summary's name; the role's name when absent. */
  playerName?: (() => string) | undefined;
  year: number;
  onNewGame(): void;
}

const plur = (n: number): string => (n === 1 ? '' : 's');

/** "how" of the end: content's `endHow` status ('died' when absent). */
const howOf = (s: Status): string => String(s['endHow'] ?? 'died');

/**
 * The death as the stone words it: killed_by_prefix[how] and the killer. Monsters take an
 * article (KILLED_BY_AN), `killer.*` phrases are complete (KILLED_BY), '=' names are bare.
 * ref: src/topten.c formatkiller()
 */
export function deathText(d: Pick<EndDeps, 't' | 'has'>, s: Status): string {
  const k = String(s['killer'] ?? '');
  const def = k.startsWith('@') ? k.slice(1) : k;
  const killer = !def
    ? ''
    : def.startsWith('=')
      ? def.slice(1)
      : def.startsWith('killer.')
        ? d.t(def)
        : an(d.t(def));
  const key = `end.killer.${howOf(s)}`;
  return d.t(d.has(key) ? key : 'ui.rip.killed_by', { killer });
}

/** The name on the stone and in "Goodbye". */
const nameOf = (d: EndDeps, s: Status): string =>
  d.playerName?.() ?? (s['role'] ? d.t(String(s['role'])) : '');

/** really_done()'s closing text. ref: src/end.c really_done() "Goodbye %s the %s..." */
export function goodbyeLines(d: Pick<EndDeps, 't' | 'has'>, s: Status, name: string): string[] {
  const how = howOf(s);
  const endsKey = d.has(`end.ends.${how}`) ? `end.ends.${how}` : 'end.ends.died';
  const ends = d.t(endsKey);
  const num = (k: string, dflt: number): number => Number(s[k] ?? dflt);
  const gold = num('gold', 0);
  const moves = num('endTurn', num('turn', 0));
  const hp = num('hpmax', 0);
  const role = s['role'] ? d.t(String(s['role'])) : '';
  return [
    d.t('end.goodbye', { name, role }),
    how === 'escaped'
      ? d.t('end.escaped')
      : d.t('end.died_in', {
          ends,
          dungeon: d.t(String(s['endDungeon'] ?? 'nh:main')),
          depth: num('endDepth', num('dlvl', 1)),
        }),
    d.t('end.gold_moves', { gold, gs: plur(gold), moves, ms: plur(moves) }),
    d.t('end.level_hp', { level: num('endLevel', num('xl', 1)), hp, hs: plur(hp), ends }),
  ];
}

/** Whether the end gets a stone. ref: really_done(): `if (how < GENOCIDED)` outrip() */
const hasStone = (s: Status): boolean => {
  const how = howOf(s);
  return how !== 'escaped' && how !== 'quit';
};

/**
 * Runs the end sequence: lists without a question first, then each question (Yes shows its
 * list; No skips it; Quit skips every later one, C's done_stopprint), then the stone and the
 * summary with New game. Returns nothing; the last sheet stays until New game.
 */
export function playEnd(d: EndDeps, lists: readonly ListEvent[], s: Status): void {
  const plain = lists.filter((l) => l.ask === undefined);
  const asked = lists.filter((l) => l.ask !== undefined);
  const showList = (l: ListEvent, next: () => void): void => {
    d.open({
      title: d.t(l.titleKey),
      entries: l.items.map((m) => ({ label: d.t(m.key, m.params), run: () => {}, text: true })),
      cancelLabel: d.t('ui.close'),
      onCancel: next,
    });
  };
  const ask = (i: number): void => {
    const l = asked[i];
    if (!l?.ask) {
      final();
      return;
    }
    const next = (): void => ask(i + 1);
    const entries: MenuEntry[] = [
      { label: d.t('ui.yes'), run: () => showList(l, next), key: 'y' },
      { label: d.t('ui.no'), run: next, key: 'n' },
      { label: d.t('ui.quit'), run: final, key: 'q' },
    ];
    // Enter answers the highlighted Yes (C's default 'y'); Escape is q
    d.open({ title: d.t(l.ask), entries, onEscape: final });
  };
  const showPlain = (i: number): void => {
    const l = plain[i];
    if (l) showList(l, () => showPlain(i + 1));
    else ask(0);
  };
  const final = (): void => {
    const name = nameOf(d, s);
    const stone = hasStone(s);
    const m = d.open({
      title: d.t(stone ? 'ui.rip.title' : 'ui.escaped'),
      entries: [
        ...goodbyeLines(d, s, name).map((label) => ({ label, run: () => {}, text: true })),
        { label: d.t('ui.newgame'), run: d.onNewGame },
      ],
    });
    m.el.classList.add('nh-tomb');
    if (stone) {
      const doc = m.el.ownerDocument;
      const pre = Object.assign(doc.createElement('pre'), {
        className: 'nh-sheet-body nh-rip',
        textContent: ripLines({
          name,
          gold: Number(s['gold'] ?? 0),
          death: deathText(d, s),
          year: d.year,
        }).join('\n'),
      });
      m.el.querySelector('.nh-sheet-title')?.after(pre);
    }
  };
  showPlain(0);
}
