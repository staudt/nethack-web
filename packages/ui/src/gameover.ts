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

/**
 * What the end of the game discloses: ask before each list (the default), show every list
 * without asking, or show none. NetHack's `disclose` option, one setting for every list.
 * ref: src/end.c should_query_disclose_option(), really_done() `strcmp(flags.end_disclose, "none")`
 */
export type Disclose = 'ask' | 'all' | 'none';

export interface EndDeps {
  t(key: string, params?: Params): string;
  has(key: string): boolean;
  /** Opens a sheet (replacing any open one). */
  open(spec: MenuSpec): OpenMenu;
  /** The stone's and the summary's name; the role's name when absent or empty. */
  playerName?: (() => string | undefined) | undefined;
  /** Default 'ask'. */
  disclose?: Disclose | undefined;
  year: number;
  onNewGame(): void;
  /** Called once with the finished game, before the stone (the app records the score). */
  onGameOver?: ((s: EndSummary) => void) | undefined;
  /** Extra buttons on the end sheet ("High scores"); `back` shows the end sheet again. */
  endEntries?: (() => EndEntry[]) | undefined;
}

export interface EndEntry {
  labelKey: string;
  run(back: () => void): void;
}

/**
 * A finished game as the score list records it, in the words of the UI's language at the time.
 * ref: src/topten.c topten() (the new `toptenentry`)
 */
export interface EndSummary {
  /** content's `endHow`: 'died', 'choking', 'poisoning', 'starving', 'escaped', 'quit' or a mod's. */
  how: string;
  /** The final score (`u.urexp`); null when content does not score the game. */
  points: number | null;
  name: string;
  /** 'Val-Hum-Fem-Neu'; null for a role without file codes. */
  plcode: string | null;
  /** formatkiller()'s text: "killed by a jackal"; "escaped" / "quit" for those ends. */
  death: string;
  /** The dungeon's name: "The Dungeons of Doom". */
  dungeon: string;
  deathLev: number;
  /** deepest_lev_reached(); null when content does not say. */
  maxLvl: number | null;
  hp: number;
  maxHp: number;
  turns: number;
  gold: number;
}

const plur = (n: number): string => (n === 1 ? '' : 's');

/** "how" of the end: content's `endHow` status ('died' when absent). */
const howOf = (s: Status): string => String(s['endHow'] ?? 'died');

/**
 * The death as the stone words it: killed_by_prefix[how] and the killer. Monsters take an
 * article (KILLED_BY_AN), `killer.*` phrases are complete (KILLED_BY), '=' names are bare; a
 * killer marked with a leading '!' is the whole text, with no prefix ("killed while stuck in
 * creature form": NO_KILLER_PREFIX). ref: src/topten.c formatkiller()
 */
export function deathText(d: Pick<EndDeps, 't' | 'has'>, s: Status): string {
  const raw = String(s['killer'] ?? '');
  const noPrefix = raw.startsWith('!');
  const k = noPrefix ? raw.slice(1) : raw;
  const def = k.startsWith('@') ? k.slice(1) : k;
  if (noPrefix) return def.startsWith('=') ? def.slice(1) : d.t(def);
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
  d.playerName?.() || (s['role'] ? d.t(String(s['role'])) : '');

/** really_done()'s closing text. ref: src/end.c really_done() "Goodbye %s the %s..." */
export function goodbyeLines(d: Pick<EndDeps, 't' | 'has'>, s: Status, name: string): string[] {
  const how = howOf(s);
  const endsKey = d.has(`end.ends.${how}`) ? `end.ends.${how}` : 'end.ends.died';
  const ends = d.t(endsKey);
  const num = (k: string, dflt: number): number => Number(s[k] ?? dflt);
  // really_done()'s umoney counts the gold in containers too (content's `endGold`)
  const gold = num('endGold', num('gold', 0));
  const moves = num('endTurn', num('turn', 0));
  const hp = num('hpmax', 0);
  const role = s['role'] ? d.t(String(s['role'])) : '';
  // " with N points," once content scores the game (its `score` status)
  const points = typeof s['score'] === 'number' ? s['score'] : null;
  const pts = points === null ? {} : { points, ps: plur(points) };
  const sfx = points === null ? '' : '_points';
  return [
    d.t('end.goodbye', { name, role }),
    how === 'escaped'
      ? d.t(`end.escaped${sfx}`, pts)
      : d.t(`end.died_in${sfx}`, {
          ends,
          dungeon: d.t(String(s['endDungeon'] ?? 'nh:main')),
          depth: num('endDepth', num('dlvl', 1)),
          ...pts,
        }),
    d.t('end.gold_moves', { gold, gs: plur(gold), moves, ms: plur(moves) }),
    d.t('end.level_hp', { level: num('endLevel', num('xl', 1)), hp, hs: plur(hp), ends }),
  ];
}

/** The finished game for the score list. ref: src/topten.c topten() "create a new 'topten' entry" */
export function endSummary(d: Pick<EndDeps, 't' | 'has'>, s: Status, name: string): EndSummary {
  const how = howOf(s);
  const num = (k: string, dflt: number): number => Number(s[k] ?? dflt);
  // done(): escaping and quitting name no killer; deaths[how] is the whole record text
  const death = how === 'escaped' || how === 'quit' ? d.t(`end.ends.${how}`) : deathText(d, s);
  return {
    how,
    points: typeof s['score'] === 'number' ? s['score'] : null,
    name,
    plcode: typeof s['plcode'] === 'string' ? s['plcode'] : null,
    death,
    dungeon: d.t(String(s['endDungeon'] ?? 'nh:main')),
    deathLev: num('endDepth', num('dlvl', 1)),
    maxLvl: typeof s['maxDepth'] === 'number' ? s['maxDepth'] : null,
    hp: num('hp', 0),
    maxHp: num('hpmax', 0),
    turns: num('endTurn', num('turn', 0)),
    gold: num('endGold', num('gold', 0)),
  };
}

/** Whether the end gets a stone. ref: really_done(): `if (how < GENOCIDED)` outrip() */
const hasStone = (s: Status): boolean => {
  const how = howOf(s);
  return how !== 'escaped' && how !== 'quit';
};

/**
 * Runs the end sequence: lists without a question first, then each question (Yes shows its
 * list; No skips it; Quit skips every later one, C's done_stopprint), then the stone and the
 * summary with New game. `disclose` 'all' shows the asked lists without their questions
 * ('+' in C's option), 'none' skips them ('-'). Returns nothing; the last sheet stays until New
 * game.
 */
export function playEnd(d: EndDeps, lists: readonly ListEvent[], s: Status): void {
  const plain = lists.filter((l) => l.ask === undefined);
  const disclose = d.disclose ?? 'ask';
  const asked = disclose === 'none' ? [] : lists.filter((l) => l.ask !== undefined);
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
    if (disclose === 'all') {
      showList(l, next);
      return;
    }
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
  let recorded = false;
  const final = (): void => {
    const name = nameOf(d, s);
    if (!recorded) {
      // really_done(): topten() runs whatever the answers were (done_stopprint only hides it)
      recorded = true;
      d.onGameOver?.(endSummary(d, s, name));
    }
    const stone = hasStone(s);
    const m = d.open({
      title: d.t(stone ? 'ui.rip.title' : howOf(s) === 'quit' ? 'ui.quit.title' : 'ui.escaped'),
      entries: [
        ...goodbyeLines(d, s, name).map((label) => ({ label, run: () => {}, text: true })),
        ...(d.endEntries?.() ?? []).map((e) => ({
          label: d.t(e.labelKey),
          run: () => e.run(final),
        })),
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
          gold: Number(s['endGold'] ?? s['gold'] ?? 0), // gd.done_money
          death: deathText(d, s),
          year: d.year,
        }).join('\n'),
      });
      m.el.querySelector('.nh-sheet-title')?.after(pre);
    }
  };
  showPlain(0);
}
