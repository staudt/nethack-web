import { describe, expect, test } from 'vitest';
import { ripLines } from '../src/status';

describe('ripLines (rip.c genl_outrip)', () => {
  const stone = ripLines({ name: 'Valkyrie', gold: 12, death: 'killed by a jackal', year: 2026 });
  /** The face's text between the walls of `row`, trimmed. */
  const face = (row: number): string => (stone[row] ?? '').slice(19, 37).trim();
  /** Centre column of the text on `row` (rip.c: STONE_LINE_CENT 28). */
  const centre = (row: number): number => {
    const l = stone[row] ?? '';
    const t = face(row);
    return l.indexOf(t) + ((t.length + 1) >> 1);
  };

  test('15 lines, 47 columns at most, walls never move', () => {
    expect(stone).toHaveLength(15);
    expect(Math.max(...stone.map((l) => l.length))).toBe(47);
    for (let r = 6; r <= 12; r++) {
      expect(stone[r]?.charAt(18)).toBe('|');
      expect(stone[r]?.charAt(37)).toBe('|');
    }
  });

  test('name, gold, death and year centred on their lines', () => {
    expect(stone[2]?.trim()).toBe('/    REST    \\');
    expect(face(6)).toBe('Valkyrie');
    expect(face(7)).toBe('12 Au');
    expect(face(8)).toBe('killed by a');
    expect(face(9)).toBe('jackal');
    expect(face(12)).toBe('2026');
    for (const r of [6, 7, 8, 9, 12]) expect(centre(r)).toBe(28);
  });

  test('a long death wraps on spaces over four lines; the name is cut at 16', () => {
    const s = ripLines({
      name: 'Brunhilde-the-Mighty',
      gold: 2e9,
      death: 'killed by a falling rock while helpless, having been paralyzed',
      year: 1999,
    });
    const rows = s.slice(8, 12).map((l) => l.slice(19, 37).trim());
    expect(rows).toEqual(['killed by a', 'falling rock', 'while helpless,', 'having been']);
    for (const r of rows) expect(r.length).toBeLessThanOrEqual(16);
    expect(s[6]?.slice(19, 37).trim()).toBe('Brunhilde-the-Mi');
    expect(s[7]?.slice(19, 37).trim()).toBe('999999999 Au');
    expect(Math.max(...s.map((l) => l.length))).toBe(47);
  });

  test('a word longer than the line is cut at 16 characters', () => {
    const s = ripLines({ name: 'x', gold: 0, death: 'abcdefghijklmnopqrstu', year: 2026 });
    expect(s[8]?.slice(19, 37).trim()).toBe('abcdefghijklmnop');
    expect(s[9]?.slice(19, 37).trim()).toBe('qrstu');
  });
});

import { statusLines } from '../src/status';

describe('statusLines line 2', () => {
  test('NetHack order with gold, hunger and encumbrance', () => {
    const [, l2] = statusLines({
      dlvl: 1,
      gold: 0,
      hp: 16,
      hpmax: 16,
      pw: 2,
      pwmax: 2,
      ac: 6,
      xl: 1,
      xp: 0,
      turn: 1,
      hunger: 'weak',
      encumbrance: 'strained',
    });
    expect(l2.map((f) => f.text)).toEqual([
      'Dlvl:1',
      '$:0',
      'HP:16(16)',
      'Pw:2(2)',
      'AC:6',
      'Xp:1/0',
      'T:1',
      'Weak',
      'Strained',
    ]);
    expect(l2.at(-2)?.cls).toBe('nh-hp-crit');
    expect(l2.at(-1)?.cls).toBe('nh-hp-crit');
  });

  test('polymorphed: HD:n in place of Xp (ref: src/botl.c)', () => {
    const [, l2] = statusLines({ xl: 3, xp: 40, hd: 2, turn: 5 });
    expect(l2.map((f) => f.text)).toEqual(['HD:2', 'T:5']);
  });

  test('mild states have no critical class; absent fields are omitted', () => {
    const [, l2] = statusLines({ turn: 3, hunger: 'hungry', encumbrance: 'burdened' });
    expect(l2.map((f) => f.text)).toEqual(['T:3', 'Hungry', 'Burdened']);
    expect(l2[2]?.cls).toBeUndefined();
  });
});
