import { expect, test } from 'vitest';
import {
  MAX_SCORES,
  SCORES_BAD_KEY,
  SCORES_KEY,
  addScore,
  entryText,
  isoDate,
  loadScores,
  ordin,
  resultLine,
  scoreRows,
  type ScoreEntry,
} from '../src/scores';

const mem = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    m,
  };
};

const entry = (over: Partial<ScoreEntry> = {}): ScoreEntry => ({
  how: 'died',
  points: 100,
  name: 'Valkyrie',
  plcode: 'Val-Hum-Fem-Neu',
  death: 'killed by a jackal',
  dungeon: 'The Dungeons of Doom',
  deathLev: 3,
  maxLvl: 4,
  hp: -2,
  maxHp: 16,
  turns: 500,
  gold: 12,
  date: '2026-11-07',
  seed: 42,
  version: '0.0.0',
  ...over,
});

test('entry text for each kind of end, as outentry() words it', () => {
  expect(entryText(entry())).toBe(
    'Valkyrie-Val-Hum-Fem-Neu died in The Dungeons of Doom on level 3 [max 4].  Killed by a jackal.',
  );
  // [max N] only when she had been deeper than where she ended
  expect(entryText(entry({ maxLvl: 3 }))).toBe(
    'Valkyrie-Val-Hum-Fem-Neu died in The Dungeons of Doom on level 3.  Killed by a jackal.',
  );
  expect(entryText(entry({ how: 'choking', death: 'choked on a food ration' }))).toBe(
    'Valkyrie-Val-Hum-Fem-Neu choked on her food in The Dungeons of Doom on level 3 [max 4].  Choked on a food ration.',
  );
  expect(entryText(entry({ how: 'poisoning', death: 'poisoned by a killer bee' }))).toBe(
    'Valkyrie-Val-Hum-Fem-Neu was poisoned in The Dungeons of Doom on level 3 [max 4].  Poisoned by a killer bee.',
  );
  expect(entryText(entry({ how: 'starving', death: 'died of starvation', maxLvl: 3 }))).toBe(
    'Valkyrie-Val-Hum-Fem-Neu starved to death in The Dungeons of Doom on level 3.',
  );
  expect(entryText(entry({ how: 'escaped', death: 'escaped', deathLev: 1 }))).toBe(
    'Valkyrie-Val-Hum-Fem-Neu escaped the dungeon [max level 4].',
  );
  expect(entryText(entry({ how: 'quit', death: 'quit', deathLev: 1, maxLvl: 1 }))).toBe(
    'Valkyrie-Val-Hum-Fem-Neu quit in The Dungeons of Doom on level 1.',
  );
  // a mod's end reads as "died"; no file codes, a long name cut at 10 (%.10s)
  expect(entryText(entry({ how: 'mod:melted', name: 'Brunhilde the Bold', plcode: null }))).toBe(
    'Brunhilde  died in The Dungeons of Doom on level 3 [max 4].  Killed by a jackal.',
  );
});

test('rank on insert: best first, ties after the older entries, no points not recorded', () => {
  const s = mem();
  expect(addScore(s, entry({ points: 50, seed: 1 }))).toBe(1);
  expect(addScore(s, entry({ points: 200, seed: 2 }))).toBe(1);
  expect(addScore(s, entry({ points: 50, seed: 3 }))).toBe(3);
  expect(addScore(s, entry({ points: 100, seed: 4 }))).toBe(2);
  expect(addScore(s, entry({ points: 0, seed: 5 }))).toBeNull();
  expect(loadScores(s).map((e) => e.seed)).toEqual([2, 4, 1, 3]);
  const file = JSON.parse(s.m.get(SCORES_KEY) ?? '') as Record<string, unknown>;
  expect(file['format']).toBe('nh-ts-topten');
  expect(file['version']).toBe(1);
});

test('the list is capped at 100', () => {
  const s = mem();
  for (let i = 0; i < MAX_SCORES; i++) addScore(s, entry({ points: 1000 - i }));
  expect(loadScores(s)).toHaveLength(MAX_SCORES);
  // lower than the 100th: not on the list; between: in, and the last one drops off
  expect(addScore(s, entry({ points: 901 }))).toBeNull();
  expect(addScore(s, entry({ points: 950, seed: 7 }))).toBe(52); // after the equal 950
  const list = loadScores(s);
  expect(list).toHaveLength(MAX_SCORES);
  expect(list[51]?.seed).toBe(7);
  expect(list.at(-1)?.points).toBe(902);
});

test.each([
  ['not json', '{oops'],
  ['another format', JSON.stringify({ format: 'other', version: 1, entries: [] })],
  ['a newer version', JSON.stringify({ format: 'nh-ts-topten', version: 2, entries: [] })],
  ['a broken entry', JSON.stringify({ format: 'nh-ts-topten', version: 1, entries: [{}] })],
])('%s reads as empty and is kept aside before being replaced', (_, bad) => {
  const s = mem({ [SCORES_KEY]: bad });
  expect(loadScores(s)).toEqual([]);
  expect(s.m.get(SCORES_KEY)).toBe(bad); // reading never writes
  expect(addScore(s, entry())).toBe(1);
  expect(s.m.get(SCORES_BAD_KEY)).toBe(bad);
  expect(loadScores(s)).toHaveLength(1);
});

test('missing or throwing storage reads empty and records nothing', () => {
  expect(loadScores(null)).toEqual([]);
  expect(loadScores(mem())).toEqual([]);
  const throwing = {
    getItem: () => {
      throw new Error('denied');
    },
    setItem: () => {
      throw new Error('denied');
    },
  };
  expect(loadScores(throwing)).toEqual([]);
  expect(addScore(throwing, entry())).toBeNull();
  expect(addScore(null, entry())).toBeNull();
});

test('rows: header, the top ten, the new entry standing out further down', () => {
  const list = Array.from({ length: 15 }, (_, i) =>
    entry({ points: 1500 - i * 10, hp: i, maxHp: 9 }),
  );
  const own = { entry: list[12] as ScoreEntry, rank: 13, wizard: false };
  const rows = scoreRows(list, own);
  expect(rows[0]?.label).toBe('You reached the 13th place on the top 100 list.');
  expect(rows[1]).toMatchObject({ label: 'Name', lead: ' No Points', aside: 'Hp [max]' });
  const entries = rows.slice(2);
  // ten, a blank, then the own entry
  expect(entries).toHaveLength(12);
  expect(entries[0]).toMatchObject({ lead: '  1   1500', aside: ' -   [9]' });
  expect(entries[10]?.label).toBe('');
  expect(entries[11]).toMatchObject({ lead: ' 13   1380', standout: true, aside: '12   [9]' });
  expect(entries.filter((r) => r.standout)).toHaveLength(1);
  // in the top ten: no blank, stands out in place
  const top = scoreRows(list, { entry: list[2] as ScoreEntry, rank: 3, wizard: false });
  expect(top[0]?.label).toBe('You made the top ten list!');
  expect(top.slice(2)).toHaveLength(10);
  expect(top[4]?.standout).toBe(true);
});

test('rows: a game off the list shows unranked; a wizard game is not shown; empty list', () => {
  const list = [entry({ points: 500 })];
  const off = scoreRows(list, { entry: entry({ points: 0 }), rank: null, wizard: false });
  expect(off.at(-1)).toMatchObject({ lead: '         0', standout: true });
  const wiz = scoreRows(list, { entry: entry({ points: 9 }), rank: null, wizard: true });
  expect(wiz[0]?.label).toBe('Since you were in wizard mode, the score list will not be checked.');
  expect(wiz).toHaveLength(3);
  expect(wiz.some((r) => r.standout)).toBe(false);
  expect(scoreRows([], null).map((r) => r.label)).toEqual(['No games recorded yet.']);
});

test('ordin, result line, date', () => {
  expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 100].map((n) => `${n}${ordin(n)}`)).toEqual([
    '1st',
    '2nd',
    '3rd',
    '4th',
    '11th',
    '12th',
    '13th',
    '21st',
    '22nd',
    '23rd',
    '100th',
  ]);
  expect(resultLine({ entry: entry(), rank: null, wizard: false })).toBeNull();
  expect(isoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
});
