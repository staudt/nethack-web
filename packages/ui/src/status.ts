import type { ViewUpdate } from '@nh/core';
import { uiMessagesEn } from './i18n';

type Status = ViewUpdate['status'];

/** NetHack's get_strength_str. ref: src/botl.c get_strength_str() */
export function formatStr(st: number): string {
  if (st <= 18) return String(st);
  if (st > 118) return String(st - 100);
  if (st === 118) return '18/**';
  return `18/${String(st - 18).padStart(2, '0')}`;
}

export type HpLevel = 'ok' | 'warn' | 'crit';

/** Critical (red) when hp < max/7 or hp < 6; warning (yellow) when hp < max/3. */
export function hpLevel(hp: number, max: number): HpLevel {
  if (hp < max / 7 || hp < 6) return 'crit';
  if (hp < max / 3) return 'warn';
  return 'ok';
}

export interface StatusField {
  text: string;
  cls?: string;
}

const num = (s: Status, k: string): number | undefined => {
  const v = s[k];
  return typeof v === 'number' ? v : undefined;
};

const HUNGER_CLASS: Record<string, string> = {
  hungry: 'nh-hp-warn',
  weak: 'nh-hp-crit',
  fainting: 'nh-hp-crit',
  fainted: 'nh-hp-crit',
};
const ENC_CLASS: Record<string, string> = {
  strained: 'nh-hp-crit',
  overtaxed: 'nh-hp-crit',
  overloaded: 'nh-hp-crit',
};

/** Fields with their own display above. */
/** Fields with their own place on the bottom lines (or the tombstone); never status words. */
const HANDLED: ReadonlySet<string> = new Set([
  'str',
  'int',
  'wis',
  'dex',
  'con',
  'cha',
  'dlvl',
  'gold',
  'hp',
  'hpmax',
  'pw',
  'pwmax',
  'ac',
  'xl',
  'xp',
  'turn',
  'hunger',
  'encumbrance',
  'dead',
  'killer',
  'endTurn',
  'endDepth',
  'endLevel',
]);

/** The two NetHack bottom lines; missing fields are omitted. ref: src/botl.c */
export function statusLines(
  s: Status,
  t: (key: string) => string = (k) => uiMessagesEn[k] ?? k,
  has: (key: string) => boolean = (k) => k in uiMessagesEn,
): [StatusField[], StatusField[]] {
  const l1: StatusField[] = [];
  const l2: StatusField[] = [];
  const str = num(s, 'str');
  if (str !== undefined) l1.push({ text: `St:${formatStr(str)}` });
  for (const [k, label] of [
    ['dex', 'Dx'],
    ['con', 'Co'],
    ['int', 'In'],
    ['wis', 'Wi'],
    ['cha', 'Ch'],
  ] as const) {
    const v = num(s, k);
    if (v !== undefined) l1.push({ text: `${label}:${v}` });
  }
  const dlvl = num(s, 'dlvl');
  if (dlvl !== undefined) l2.push({ text: `Dlvl:${dlvl}` });
  const gold = num(s, 'gold');
  if (gold !== undefined) l2.push({ text: `$:${gold}` });
  const hp = num(s, 'hp');
  const hpmax = num(s, 'hpmax');
  if (hp !== undefined && hpmax !== undefined) {
    l2.push({ text: `HP:${hp}(${hpmax})`, cls: `nh-hp-${hpLevel(hp, hpmax)}` });
  }
  const pw = num(s, 'pw');
  const pwmax = num(s, 'pwmax');
  if (pw !== undefined && pwmax !== undefined) l2.push({ text: `Pw:${pw}(${pwmax})` });
  const ac = num(s, 'ac');
  if (ac !== undefined) l2.push({ text: `AC:${ac}` });
  const xl = num(s, 'xl');
  if (xl !== undefined) {
    const xp = num(s, 'xp');
    l2.push({ text: xp !== undefined ? `Xp:${xl}/${xp}` : `Xp:${xl}` });
  }
  const turn = num(s, 'turn');
  if (turn !== undefined) l2.push({ text: `T:${turn}` });
  const hunger = s['hunger'];
  if (typeof hunger === 'string') {
    const cls = HUNGER_CLASS[hunger];
    l2.push({ text: t(`ui.status.${hunger}`), ...(cls ? { cls } : {}) });
  }
  const enc = s['encumbrance'];
  if (typeof enc === 'string') {
    const cls = ENC_CLASS[enc];
    l2.push({ text: t(`ui.status.${enc}`), ...(cls ? { cls } : {}) });
  }
  // Any other true (or positive) field with a `ui.status.<field>` word, such as `stun`: Stun.
  for (const k of Object.keys(s).sort()) {
    if (HANDLED.has(k)) continue;
    const v = s[k];
    if ((v as unknown) !== true && !(typeof v === 'number' && v > 0)) continue;
    const key = `ui.status.${k}`;
    if (has(key)) l2.push({ text: t(key), cls: 'nh-status-word' });
  }
  return [l1, l2];
}

/** English indefinite article. */
export function an(word: string): string {
  return /^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`;
}

/** The stone. ref: src/rip.c rip_txt[] (without NH320_DEDICATION) */
const RIP_TXT: readonly string[] = [
  '                       ----------',
  '                      /          \\',
  '                     /    REST    \\',
  '                    /      IN      \\',
  '                   /     PEACE      \\',
  '                  /                  \\',
  '                  |                  |', // Name of player
  '                  |                  |', // Amount of $
  '                  |                  |', // Type of death
  '                  |                  |', // .
  '                  |                  |', // .
  '                  |                  |', // .
  '                  |       1001       |', // Real year of death
  '                 *|     *  *  *      | *',
  '        _________)/\\\\_//(\\/(/\\)/\\//\\/|_)_______',
];
const STONE_LINE_CENT = 28; // char[] element of center of stone face
const STONE_LINE_LEN = 16; // # chars that fit on one line (note 1 ' ' border)
const NAME_LINE = 6;
const GOLD_LINE = 7;
const DEATH_LINE = 8;
const YEAR_LINE = 12;

/**
 * The tombstone's lines: the name (16 characters at most), the gold as `N Au`, the death text
 * wrapped on spaces over four lines, the year. ref: src/rip.c genl_outrip(), center()
 */
export function ripLines(o: { name: string; gold: number; death: string; year: number }): string[] {
  const rip = RIP_TXT.map((l) => l.split(''));
  const center = (line: number, text: string): void => {
    const row = rip[line];
    if (!row) return;
    const at = STONE_LINE_CENT - ((text.length + 1) >> 1);
    for (let k = 0; k < text.length; k++) row[at + k] = text.charAt(k);
  };
  center(NAME_LINE, o.name.slice(0, STONE_LINE_LEN));
  // arbitrary upper limit; practical upper limit is quite a bit less
  center(GOLD_LINE, `${Math.min(Math.max(o.gold, 0), 999999999)} Au`);
  // Put death type on stone
  let dpx = o.death;
  for (let line = DEATH_LINE; line < YEAR_LINE; line++) {
    let i0 = dpx.length;
    if (i0 > STONE_LINE_LEN) {
      let i: number;
      for (i = STONE_LINE_LEN; i > 0 && i0 > STONE_LINE_LEN; --i) if (dpx.charAt(i) === ' ') i0 = i;
      if (!i) i0 = STONE_LINE_LEN;
    }
    const tmpchar = dpx.charAt(i0);
    center(line, dpx.slice(0, i0));
    dpx = tmpchar !== ' ' ? dpx.slice(i0) : dpx.slice(i0 + 1);
  }
  center(YEAR_LINE, String(o.year).padStart(4, ' '));
  return rip.map((r) => r.join(''));
}
