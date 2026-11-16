// The 13 roles and 5 races as core defs: what core and the character menus need (names, allowed
// races, genders and alignments, menu order). Every mechanic stays in roletab.ts and racetab.ts,
// keyed by urole()/urace() (plan m22 Q3). ref: src/role.c roles[], races[]
import type { RaceDef, RoleDef } from '@nh/core';
import { RACES_TAB } from './racetab';
import { ROLES_TAB, roleNameKey } from './roletab';
import { heroMovement } from './stats';
import { RACE_ORDER, ROLE_ORDER, raceDefId, roleDefId, type RaceKey, type RoleKey } from './urole';

const roleDef = (key: RoleKey): RoleDef => {
  const row = ROLES_TAB[key];
  const female = roleNameKey(key, true);
  return {
    id: roleDefId(key),
    nameKey: roleNameKey(key, false),
    ...(female !== roleNameKey(key, false) ? { nameKeyFemale: female } : {}),
    speed: 12,
    glyph: { ch: '@', fg: '#ffffff' },
    movement: heroMovement,
    races: row.races.map(raceDefId),
    genders: row.genders,
    aligns: row.aligns,
    order: ROLE_ORDER.indexOf(key),
  };
};

/**
 * The Valkyrie first: the first registered role is the default character (plan m22 Q6); the
 * menus follow C's roles[] order through `order`.
 */
export const ROLES: readonly RoleDef[] = [
  roleDef('valkyrie'),
  ...ROLE_ORDER.filter((k) => k !== 'valkyrie').map(roleDef),
];

const raceDef = (key: RaceKey): RaceDef => ({
  id: raceDefId(key),
  nameKey: `race.${key}`,
  adjKey: `race.${key}.adj`,
  genders: RACES_TAB[key].genders,
  aligns: RACES_TAB[key].aligns,
});

export const RACES: readonly RaceDef[] = RACE_ORDER.map(raceDef);
