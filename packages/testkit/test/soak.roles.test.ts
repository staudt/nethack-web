// m22 step 10: the soak bot plays every role with every race the role allows (the gender and
// alignment a seeded pick of what the pair allows), with the soak invariants, the character's
// among them, checked as it goes. Split over two files (Archeologist..Priest here, Rogue..Wizard
// in soak.roles2) so vitest runs them on parallel workers.
import { describe, expect, test } from 'vitest';
import { roleRaceCharacters, roleSoaks } from './helpers/soak';

describe('soak over roles and races (1)', () => {
  test('28 role and race pairs: every role, race, gender and alignment among them', () => {
    const all = roleRaceCharacters();
    expect(all).toHaveLength(28);
    expect(new Set(all.map((a) => a.c.role)).size).toBe(13);
    expect(new Set(all.map((a) => a.c.race)).size).toBe(5);
    expect(new Set(all.map((a) => a.c.gender)).size).toBe(2);
    expect(new Set(all.map((a) => a.c.align)).size).toBe(3);
  });
  roleSoaks(['archeologist', 'barbarian', 'caveman', 'healer', 'knight', 'monk', 'priest'], 300);
});
