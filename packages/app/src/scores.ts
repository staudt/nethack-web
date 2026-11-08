// The high-score list, kept on the device (never in saves).
// ref: src/topten.c topten(), outheader(), outentry(); src/end.c really_done() `if (!wizard) topten()`
//
// Storage: localStorage `nh.topten` = { format: 'nh-ts-topten', version: 1, entries }, best first,
// at most 100 entries (C's sysopt.entrymax). Each entry keeps the words of its end as the UI
// rendered them (C's record keeps text too) plus the seed, the date and the app version.
import type { EndSummary, MenuEntry } from '@nh/ui';

export interface ScoreEntry extends EndSummary {
  points: number;
  /** YYYY-MM-DD, the device's local date at the end of the game. */
  date: string;
  /** The game's seed; null when unknown (an unreadable save). */
  seed: number | null;
  /** The app version that recorded it. */
  version: string;
}

export interface ScoreFile {
  format: 'nh-ts-topten';
  version: 1;
  entries: ScoreEntry[];
}

export const SCORES_KEY = 'nh.topten';
/** An unreadable score file is kept here before a new one replaces it. */
export const SCORES_BAD_KEY = 'nh.topten.bad';
/** ref: sysopt.entrymax (sysconf ENTRYMAX 100) */
export const MAX_SCORES = 100;
/** Entries shown: the top ten and the new entry wherever it is. */
export const TOP_SHOWN = 10;

type Reader = Pick<Storage, 'getItem'> | null;
type Store = Pick<Storage, 'getItem' | 'setItem'> | null;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

function isEntry(v: unknown): v is ScoreEntry {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    isStr(e['how']) &&
    isNum(e['points']) &&
    isStr(e['name']) &&
    (e['plcode'] === null || isStr(e['plcode'])) &&
    isStr(e['death']) &&
    isStr(e['dungeon']) &&
    isNum(e['deathLev']) &&
    (e['maxLvl'] === null || isNum(e['maxLvl'])) &&
    isNum(e['hp']) &&
    isNum(e['maxHp']) &&
    isNum(e['turns']) &&
    isNum(e['gold']) &&
    isStr(e['date']) &&
    (e['seed'] === null || isNum(e['seed'])) &&
    isStr(e['version'])
  );
}

/** The stored text and its entries; `ok` is false for text that is there but unreadable. */
function readFile(s: Reader): { text: string | null; entries: ScoreEntry[]; ok: boolean } {
  let text: string | null;
  try {
    text = s?.getItem(SCORES_KEY) ?? null;
  } catch {
    return { text: null, entries: [], ok: true };
  }
  if (text === null) return { text, entries: [], ok: true };
  try {
    const f = JSON.parse(text) as Partial<ScoreFile> | null;
    if (
      f?.format === 'nh-ts-topten' &&
      f.version === 1 &&
      Array.isArray(f.entries) &&
      f.entries.every(isEntry)
    )
      return { text, entries: f.entries, ok: true };
  } catch {
    // corrupt: read as empty
  }
  return { text, entries: [], ok: false };
}

/** The stored list, best first; missing, corrupt or another format reads as empty. */
export const loadScores = (s: Reader): ScoreEntry[] => readFile(s).entries;

/**
 * Inserts a finished game and returns its rank (1 = best), or null when it is not on the list
 * (no points, below the 100th, or the list could not be written). An equal score goes after the
 * older ones. An unreadable file is copied to `nh.topten.bad` before it is replaced.
 * ref: src/topten.c topten() "rank0" loop (`t1->points < t0->points`), sysopt.pointsmin 1
 */
export function addScore(s: Store, e: ScoreEntry): number | null {
  if (!s || e.points < 1) return null;
  const file = readFile(s);
  const list = file.entries;
  let at = list.findIndex((x) => x.points < e.points);
  if (at < 0) at = list.length;
  if (at >= MAX_SCORES) return null;
  const entries = [...list.slice(0, at), e, ...list.slice(at)].slice(0, MAX_SCORES);
  const out: ScoreFile = { format: 'nh-ts-topten', version: 1, entries };
  try {
    if (!file.ok && file.text !== null) s.setItem(SCORES_BAD_KEY, file.text);
    s.setItem(SCORES_KEY, JSON.stringify(out));
  } catch {
    return null;
  }
  return at + 1;
}

/** ref: src/hacklib.c ordin() */
export function ordin(n: number): string {
  const d = n % 10;
  return d === 0 || d > 3 || Math.floor((n % 100) / 10) === 1
    ? 'th'
    : d === 1
      ? 'st'
      : d === 2
        ? 'nd'
        : 'rd';
}

/**
 * outentry()'s sentence after the rank and points: "Valkyrie-Val-Hum-Fem-Neu died in The
 * Dungeons of Doom on level 3 [max 4].  Killed by a jackal." Escapes, quits and starvation have
 * no second sentence. ref: src/topten.c outentry()
 */
export function entryText(e: EndSummary): string {
  let s = e.name.slice(0, 10); // "%.10s"
  if (e.plcode) s += `-${e.plcode}`;
  s += ' ';
  const maxLvl = e.maxLvl ?? e.deathLev;
  let second = true;
  if (e.how === 'escaped') {
    s += `escaped the dungeon [max level ${maxLvl}]`;
    second = false;
  } else {
    if (e.how === 'quit') {
      s += 'quit';
      second = false;
    } else if (e.how === 'starving') {
      s += 'starved to death';
      second = false;
    } else if (e.how === 'choking') {
      s += `choked on h${e.plcode?.split('-')[2]?.startsWith('F') ? 'er' : 'is'} food`;
    } else if (e.how === 'poisoning') s += 'was poisoned';
    else if (e.how === 'stoning') s += 'turned to stone';
    else s += 'died';
    s += ` in ${e.dungeon} on level ${e.deathLev}`;
    if (e.deathLev !== maxLvl) s += ` [max ${maxLvl}]`;
  }
  s += '.';
  if (second && e.death) s += `  ${e.death.charAt(0).toUpperCase()}${e.death.slice(1)}.`;
  return s;
}

/** The new entry's place: what `topten()` says above the list. */
export interface ScoreResult {
  entry: ScoreEntry;
  rank: number | null;
  /** A wizard-mode game: not recorded. */
  wizard: boolean;
}

/** topten()'s line above the list. ref: src/topten.c topten() */
export function resultLine(r: ScoreResult): string | null {
  if (r.wizard) return 'Since you were in wizard mode, the score list will not be checked.';
  if (r.rank === null) return null;
  if (r.rank <= 10) return 'You made the top ten list!';
  return `You reached the ${r.rank}${ordin(r.rank)} place on the top ${MAX_SCORES} list.`;
}

const hpText = (e: EndSummary): string => {
  // ref: outentry(): "-" for hp <= 0, maxhp right-aligned in three columns
  const hp = e.hp <= 0 ? '-' : String(e.hp);
  return `${hp} ${`[${e.maxHp}]`.padStart(5)}`.padStart(8);
};

/**
 * The list as sheet rows: outheader(), the top ten, the new entry standing out wherever it is
 * (a blank row before it when it is further down), and an entry that did not make the list (or
 * a wizard game's) unranked at the end. ref: src/topten.c topten() display loop (C's end_top
 * and end_around subset: top ten, the own entry), outheader(), outentry()
 */
export function scoreRows(list: readonly ScoreEntry[], own: ScoreResult | null): MenuEntry[] {
  const rank0 = own?.rank ?? null;
  const shown = list
    .map((e, i) => ({ e, rank: i + 1 }))
    .filter((x) => x.rank <= TOP_SHOWN || x.rank === rank0);
  const unranked = own && rank0 === null && !own.wizard ? own.entry : null;
  const pts = [...shown.map((x) => x.e.points), ...(unranked ? [unranked.points] : [])];
  const w = Math.max(6, ...pts.map((p) => String(p).length));
  const row = (rank: number | null, e: ScoreEntry, standout: boolean): MenuEntry => ({
    label: entryText(e),
    lead: `${rank === null ? '' : rank}`.padStart(3) + ' ' + String(e.points).padStart(w),
    aside: hpText(e),
    run: () => {},
    text: true,
    ...(standout ? { standout } : {}),
  });
  const blank: MenuEntry = { label: '', run: () => {}, text: true };
  const rows: MenuEntry[] = [];
  const line = own ? resultLine(own) : null;
  if (line) rows.push({ label: line, run: () => {}, text: true });
  if (shown.length === 0 && !unranked) {
    rows.push({ label: 'No games recorded yet.', run: () => {}, text: true });
    return rows;
  }
  rows.push({
    label: 'Name',
    lead: ' No ' + 'Points'.padStart(w),
    aside: 'Hp [max]',
    run: () => {},
    text: true,
  });
  for (const x of shown) {
    if (x.rank === rank0 && x.rank > TOP_SHOWN + 1) rows.push(blank);
    rows.push(row(x.rank, x.e, x.rank === rank0));
  }
  if (unranked) rows.push(row(null, unranked, true));
  return rows;
}

/** The device's local date as YYYY-MM-DD. */
export const isoDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
