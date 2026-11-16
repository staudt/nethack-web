// m22 step 8: the new game's character. ref: src/role.c ok_role(), ok_race(), ok_gend(), ok_align()
import { describe, expect, test } from 'vitest';
import {
  characterChoices,
  okAlign,
  okCharacter,
  okGend,
  okRace,
  okRole,
  resolveCharacter,
  welcomeParams,
} from '../src/character';
import { createEngine } from '../src/engine';
import { loadMods } from '../src/registry';
import { getPlayer } from '../src/state';
import type { Mod } from '../src/types/mod';
import { terrainMod } from './helpers/fakeMods';

const GLYPH = { ch: '@', fg: '#fff' };

/** Two roles in the way C's tables look: a female-only lawful/neutral one and a chaotic one. */
const charMod: Mod = {
  id: 'ch',
  version: '1',
  register(api) {
    api.defineRace({
      id: 'ch:human',
      nameKey: 'race.human',
      adjKey: 'race.human.adj',
      genders: ['male', 'female'],
      aligns: [1, 0, -1],
    });
    api.defineRace({
      id: 'ch:dwarf',
      nameKey: 'race.dwarf',
      adjKey: 'race.dwarf.adj',
      genders: ['male', 'female'],
      aligns: [1],
    });
    api.defineRace({
      id: 'ch:orc',
      nameKey: 'race.orc',
      adjKey: 'race.orc.adj',
      genders: ['male', 'female'],
      aligns: [-1],
    });
    // registered first: the default role
    api.defineRole({
      id: 'ch:valk',
      nameKey: 'role.valk',
      speed: 12,
      glyph: GLYPH,
      races: ['ch:human', 'ch:dwarf'],
      genders: ['female'],
      aligns: [0, 1],
      order: 2,
    });
    api.defineRole({
      id: 'ch:barb',
      nameKey: 'role.barb',
      nameKeyFemale: 'role.barb.f',
      speed: 12,
      glyph: GLYPH,
      races: ['ch:human', 'ch:orc'],
      genders: ['male', 'female'],
      aligns: [0, -1],
      order: 1,
    });
    api.defineRole({
      id: 'ch:none',
      nameKey: 'role.none',
      speed: 12,
      glyph: GLYPH,
      races: ['ch:human'],
      genders: ['male'],
      aligns: [1],
    });
  },
};
const reg = loadMods([charMod]);

describe('ok_role(), ok_race(), ok_gend(), ok_align()', () => {
  test('a role against the race, gender and alignment given', () => {
    expect(okRole(reg, { role: 'ch:valk' })).toBe(true);
    expect(okRole(reg, { role: 'ch:valk', race: 'ch:orc' })).toBe(false);
    expect(okRole(reg, { role: 'ch:valk', gender: 'male' })).toBe(false);
    expect(okRole(reg, { role: 'ch:valk', align: -1 })).toBe(false);
    expect(okRole(reg, { role: 'ch:barb', race: 'ch:orc', gender: 'female', align: -1 })).toBe(
      true,
    );
    expect(okRole(reg, { role: 'ch:nope' })).toBe(false);
    // random: any role at all
    expect(okRole(reg, { race: 'ch:orc' })).toBe(true);
    expect(okRole(reg, { race: 'ch:dwarf', gender: 'male' })).toBe(false);
  });

  test('a race against the role, gender and alignment', () => {
    expect(okRace(reg, { role: 'ch:valk', race: 'ch:dwarf' })).toBe(true);
    expect(okRace(reg, { role: 'ch:valk', race: 'ch:dwarf', align: 0 })).toBe(false);
    expect(okRace(reg, { role: 'ch:barb', race: 'ch:dwarf' })).toBe(false);
    expect(okRace(reg, { race: 'ch:orc', align: 1 })).toBe(false);
    expect(okRace(reg, { role: 'ch:barb', align: 1 })).toBe(true); // human allows lawful
    expect(okRace(reg, { role: 'ch:nope' })).toBe(false);
  });

  test('gender and alignment against role and race only (they do not constrain each other)', () => {
    expect(okGend(reg, { role: 'ch:valk', gender: 'female', align: -1 })).toBe(true);
    expect(okGend(reg, { role: 'ch:valk', gender: 'male' })).toBe(false);
    expect(okGend(reg, { role: 'ch:none' })).toBe(true);
    expect(okAlign(reg, { role: 'ch:valk', race: 'ch:dwarf', align: 0, gender: 'male' })).toBe(
      false,
    );
    expect(okAlign(reg, { role: 'ch:valk', race: 'ch:dwarf', align: 1, gender: 'male' })).toBe(
      true,
    );
    expect(okAlign(reg, { role: 'ch:barb', race: 'ch:orc' })).toBe(true);
    expect(okAlign(reg, { role: 'ch:none', race: 'ch:orc' })).toBe(false);
  });

  test('every whole character the tables allow, and only those', () => {
    const ok: string[] = [];
    for (const role of reg.roles)
      for (const race of reg.races)
        for (const gender of ['male', 'female'] as const)
          for (const align of [1, 0, -1] as const)
            if (okCharacter(reg, { role: role.id, race: race.id, gender, align }))
              ok.push(`${role.id} ${race.id} ${gender} ${align}`);
    expect(ok).toEqual([
      'ch:valk ch:human female 1',
      'ch:valk ch:human female 0',
      'ch:valk ch:dwarf female 1',
      'ch:barb ch:human male 0',
      'ch:barb ch:human male -1',
      'ch:barb ch:human female 0',
      'ch:barb ch:human female -1',
      'ch:barb ch:orc male -1',
      'ch:barb ch:orc female -1',
      'ch:none ch:human male 1',
    ]);
  });
});

describe('resolveCharacter()', () => {
  test('defaults: the first registered role, then its first race, gender and alignment', () => {
    expect(resolveCharacter(reg)).toEqual({
      role: 'ch:valk',
      race: 'ch:human',
      gender: 'female',
      align: 0,
    });
    // a dwarf Valkyrie must be lawful
    expect(resolveCharacter(reg, { race: 'ch:dwarf' })).toEqual({
      role: 'ch:valk',
      race: 'ch:dwarf',
      gender: 'female',
      align: 1,
    });
    // an orc: the first role that takes one
    expect(resolveCharacter(reg, { race: 'ch:orc' })).toEqual({
      role: 'ch:barb',
      race: 'ch:orc',
      gender: 'male',
      align: -1,
    });
    expect(resolveCharacter(reg, { gender: 'male', align: 1 })).toEqual({
      role: 'ch:none',
      race: 'ch:human',
      gender: 'male',
      align: 1,
    });
  });

  test('a full choice is kept as it is', () => {
    const c = { role: 'ch:barb', race: 'ch:orc', gender: 'female', align: -1 } as const;
    expect(resolveCharacter(reg, c)).toEqual(c);
  });

  test('unknown ids and forbidden combinations throw', () => {
    expect(() => resolveCharacter(reg, { role: 'ch:nope' })).toThrow("Unknown role 'ch:nope'");
    expect(() => resolveCharacter(reg, { race: 'ch:elf' })).toThrow("Unknown race 'ch:elf'");
    expect(() => resolveCharacter(reg, { gender: 'x' as never })).toThrow("Unknown gender 'x'");
    expect(() => resolveCharacter(reg, { align: 2 as never })).toThrow("Unknown alignment '2'");
    expect(() => resolveCharacter(reg, { role: 'ch:valk', gender: 'male' })).toThrow(
      'No character can be a male ch:valk',
    );
    expect(() => resolveCharacter(reg, { role: 'ch:valk', race: 'ch:dwarf', align: 0 })).toThrow(
      'No character can be a neutral ch:dwarf ch:valk',
    );
  });
});

describe('characterChoices() and welcomeParams()', () => {
  test('roles in menu order (order, then registration), plain data', () => {
    const ch = characterChoices(reg);
    expect(ch.roles.map((r) => r.id)).toEqual(['ch:barb', 'ch:valk', 'ch:none']);
    expect(ch.roles[0]).toEqual({
      id: 'ch:barb',
      nameKey: 'role.barb',
      nameKeyFemale: 'role.barb.f',
      races: ['ch:human', 'ch:orc'],
      genders: ['male', 'female'],
      aligns: [0, -1],
    });
    expect(ch.races.map((r) => r.id)).toEqual(['ch:human', 'ch:dwarf', 'ch:orc']);
    expect(JSON.parse(JSON.stringify(ch))).toEqual(ch);
    // the menus' data answers the same checks as the registry
    expect(okRace(ch, { role: 'ch:valk', race: 'ch:dwarf', align: 0 })).toBe(false);
  });

  test('the female name when she is female and the role has one', () => {
    const c = { role: 'ch:barb', race: 'ch:orc', gender: 'female', align: -1 } as const;
    expect(welcomeParams(reg, c)).toEqual({
      role: '@role.barb.f',
      race: '@race.orc.adj',
      gender: '@gender.female',
      align: '@align.chaotic',
      // the female name says it: no gender word
      who: { key: 'welcome.who', params: { race: '@race.orc.adj', role: '@role.barb.f' } },
    });
    expect(welcomeParams(reg, { ...c, gender: 'male' }).role).toBe('@role.barb');
  });

  test('the gender word only for a new game whose role allows both and has no female name', () => {
    const v = { role: 'ch:valk', race: 'ch:human', gender: 'female', align: 0 } as const;
    expect(welcomeParams(reg, v)['who']).toEqual({
      key: 'welcome.who',
      params: { race: '@race.human.adj', role: '@role.valk' },
    });
    const both: Mod = {
      id: 'b',
      version: '1',
      register(api) {
        api.defineRole({
          id: 'b:arc',
          nameKey: 'role.arc',
          speed: 12,
          glyph: GLYPH,
          races: ['ch:human'],
          genders: ['male', 'female'],
          aligns: [1],
        });
      },
    };
    const r2 = loadMods([charMod, both]);
    const a = { role: 'b:arc', race: 'ch:human', gender: 'female', align: 1 } as const;
    expect(welcomeParams(r2, a)['who']).toEqual({
      key: 'welcome.who.gender',
      params: { gender: '@gender.female', race: '@race.human.adj', role: '@role.arc' },
    });
    // restored: allmain.c shows the gender only when she has changed sex
    expect(welcomeParams(r2, a, false)['who']).toEqual({
      key: 'welcome.who',
      params: { race: '@race.human.adj', role: '@role.arc' },
    });
  });
});

describe('newGame() with a character', () => {
  test('the hero is the role, the player component the whole character', () => {
    const e = createEngine([terrainMod([]), charMod]);
    const s = e.newGame({ seed: 3, character: { race: 'ch:orc', gender: 'female' } }).state;
    const hero = getPlayer(s);
    expect(hero.def).toBe('ch:barb');
    expect(hero.c.player).toEqual({
      role: 'ch:barb',
      race: 'ch:orc',
      gender: 'female',
      align: -1,
    });
    expect(() => e.newGame({ seed: 3, character: { role: 'ch:none', race: 'ch:orc' } })).toThrow(
      'No character can be a ch:orc ch:none',
    );
  });
});
