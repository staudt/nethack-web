// m22 step 8: the 13 roles and 5 races as core defs, and a new game started as any of them.
// ref: src/role.c roles[], races[], ok_role(), ok_race(), ok_gend(), ok_align(), role_init()
import {
  characterChoices,
  createEngine,
  getPlayer,
  okCharacter,
  type Alignment,
  type Character,
  type Gender,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { heroFemale } from '../src/gender';
import {
  RACES_TAB,
  RACE_ORDER,
  ROLES_TAB,
  ROLE_ORDER,
  plname,
  raceDefId,
  roleDefId,
  uState,
  ualignBase,
  urace,
  urole,
  vanillaMod,
  type RaceKey,
  type RoleKey,
} from '../src/index';
import { setGenocided, ugenocided } from '../src/vanquished';
import { defs } from './itemHelpers';

const engine = createEngine([vanillaMod]);
const reg = engine.registry;
const as = (role: RoleKey, race: RaceKey, more: Partial<Character> = {}): Partial<Character> => ({
  role: roleDefId(role),
  race: raceDefId(race),
  ...more,
});

describe('the role and race defs', () => {
  test('13 roles, the Valkyrie registered first (the default), menus in C order', () => {
    expect(reg.roles.map((r) => r.id)).toEqual([
      'nh:role_valkyrie',
      ...ROLE_ORDER.filter((k) => k !== 'valkyrie').map(roleDefId),
    ]);
    const ch = characterChoices(reg);
    expect(ch.roles.map((r) => r.id)).toEqual(ROLE_ORDER.map(roleDefId));
    expect(ch.races.map((r) => r.id)).toEqual(RACE_ORDER.map(raceDefId));
    expect(ch.roles.find((r) => r.id === 'nh:role_caveman')).toMatchObject({
      nameKey: 'role.caveman',
      nameKeyFemale: 'role.caveman.f',
    });
    expect(ch.roles.find((r) => r.id === 'nh:role_valkyrie')).toEqual({
      id: 'nh:role_valkyrie',
      nameKey: 'role.valkyrie',
      races: ['nh:race_human', 'nh:race_dwarf'],
      genders: ['female'],
      aligns: [0, 1],
    });
    expect(ch.races.find((r) => r.id === 'nh:race_elf')).toEqual({
      id: 'nh:race_elf',
      nameKey: 'race.elf',
      adjKey: 'race.elf.adj',
      genders: ['male', 'female'],
      aligns: [-1],
    });
  });

  test("the allowed combinations are role.c's", () => {
    const ok = (role: RoleKey, race: RaceKey, gender: Gender, align: Alignment): boolean =>
      okCharacter(reg, { role: roleDefId(role), race: raceDefId(race), gender, align });
    // every pair: the role's races, both lists' genders and alignments
    for (const role of ROLE_ORDER)
      for (const race of RACE_ORDER)
        for (const gender of ['male', 'female'] as const)
          for (const align of [1, 0, -1] as const)
            expect(ok(role, race, gender, align), `${role} ${race} ${gender} ${align}`).toBe(
              ROLES_TAB[role].races.includes(race) &&
                ROLES_TAB[role].genders.includes(gender) &&
                RACES_TAB[race].genders.includes(gender) &&
                ROLES_TAB[role].aligns.includes(align) &&
                RACES_TAB[race].aligns.includes(align),
            );
    // spot checks against role.c
    expect(ok('valkyrie', 'dwarf', 'female', 1)).toBe(true);
    expect(ok('valkyrie', 'dwarf', 'female', 0)).toBe(false);
    expect(ok('valkyrie', 'human', 'male', 0)).toBe(false);
    expect(ok('priest', 'elf', 'female', -1)).toBe(true);
    expect(ok('archeologist', 'gnome', 'male', 0)).toBe(true);
    expect(ok('knight', 'dwarf', 'male', 1)).toBe(false);
    expect(ok('samurai', 'human', 'female', 0)).toBe(false);
    expect(ok('monk', 'elf', 'male', 0)).toBe(false);
    expect(ok('ranger', 'orc', 'female', -1)).toBe(true);
    expect(ok('wizard', 'orc', 'male', -1)).toBe(true);
  });
});

describe('a new game as any role and race', () => {
  test('every allowed role and race: the hero, her gender and alignment', () => {
    let seed = 1;
    for (const role of ROLE_ORDER)
      for (const race of ROLES_TAB[role].races) {
        const { state } = engine.newGame({ seed: seed++, character: as(role, race) });
        const p = getPlayer(state).c.player!;
        expect([urole(state), urace(state)]).toEqual([role, race]);
        expect(getPlayer(state).def).toBe(roleDefId(role));
        expect(ROLES_TAB[role].genders).toContain(p.gender);
        expect(heroFemale(state)).toBe(p.gender === 'female');
        expect(uState(state).alignType).toBe(p.align);
        expect(ualignBase(state)).toBe(p.align);
        expect(uState(state).alignRecord).toBe(ROLES_TAB[role].initrecord);
      }
  });

  test('the defaults fill what is left out, from the role first', () => {
    const p = (c: Partial<Character>): Character =>
      getPlayer(engine.newGame({ seed: 4, character: c }).state).c.player!;
    expect(p({})).toEqual({
      role: 'nh:role_valkyrie',
      race: 'nh:race_human',
      gender: 'female',
      align: 0,
    });
    expect(p({ race: 'nh:race_dwarf' })).toMatchObject({ role: 'nh:role_valkyrie', align: 1 });
    expect(p({ role: 'nh:role_wizard', race: 'nh:race_elf' })).toMatchObject({
      gender: 'male',
      align: -1,
    });
    expect(p({ race: 'nh:race_orc' })).toMatchObject({ role: 'nh:role_barbarian', align: -1 });
  });

  test('a male hero, a female Caveman and a lawful Priest', () => {
    const cave = engine.newGame({
      seed: 5,
      character: as('caveman', 'human', { gender: 'female' }),
    });
    expect(heroFemale(cave.state)).toBe(true);
    expect(plname({ state: cave.state, defs })).toBe('@role.caveman.f');
    expect(cave.events[0]).toEqual({
      type: 'msg',
      key: 'welcome',
      params: {
        role: '@role.caveman.f',
        race: '@race.human.adj',
        gender: '@gender.female',
        align: '@align.lawful',
        who: { key: 'welcome.who', params: { race: '@race.human.adj', role: '@role.caveman.f' } },
      },
    });
    const man = engine.newGame({ seed: 5, character: as('caveman', 'dwarf', { gender: 'male' }) });
    expect(heroFemale(man.state)).toBe(false);
    expect(plname({ state: man.state, defs })).toBe('@role.caveman');
    const priest = engine.newGame({ seed: 6, character: as('priest', 'human', { align: 1 }) });
    expect(uState(priest.state)).toMatchObject({ alignType: 1, alignRecord: 0 });
  });

  test('a forbidden or unknown character is refused', () => {
    expect(() =>
      engine.newGame({ seed: 1, character: as('valkyrie', 'human', { gender: 'male' }) }),
    ).toThrow('No character can be a male nh:race_human nh:role_valkyrie');
    expect(() => engine.newGame({ seed: 1, character: as('knight', 'orc') })).toThrow(
      /No character can be a/,
    );
    expect(() => engine.newGame({ seed: 1, character: { role: 'nh:valkyrie' } })).toThrow(
      "Unknown role 'nh:valkyrie'",
    );
  });
});

describe('her role monster (urole.mnum)', () => {
  test('ugenocided(): her role or her race wiped out', () => {
    const wiz = engine.newGame({ seed: 2, character: as('wizard', 'gnome') }).state;
    expect(ugenocided(wiz)).toBe(false);
    setGenocided({ state: wiz }, 'nh:valkyrie');
    expect(ugenocided(wiz)).toBe(false);
    setGenocided({ state: wiz }, 'nh:wizard');
    expect(ugenocided(wiz)).toBe(true);
    const priest = engine.newGame({ seed: 2, character: as('priest', 'human') }).state;
    setGenocided({ state: priest }, 'nh:cleric');
    expect(ugenocided(priest)).toBe(true);
    const gnome = engine.newGame({ seed: 2, character: as('wizard', 'gnome') }).state;
    setGenocided({ state: gnome }, 'nh:gnome');
    expect(ugenocided(gnome)).toBe(true);
  });
});
