// The hero's role and race as content keys (C's Role_if()/Race_if()). A leaf module (core only):
// every role or race rule asks these, never `player.role` directly.
//
// Until roles and races are core defs (m22 step 8), the role comes from `player.role`
// ('nh:valkyrie' -> 'valkyrie') and the race is human. The test seam: a test may write
// `modData.nh.urole` / `modData.nh.urace` to play another role or race; nothing else writes them.
// ref: include/you.h Role_if(), Race_if(), Role_switch, Race_switch
import type { GameState } from '@nh/core';

/** C's male role names, lower-cased, in roles[] order (Rogue before Ranger). ref: src/role.c */
export const ROLE_ORDER = [
  'archeologist',
  'barbarian',
  'caveman',
  'healer',
  'knight',
  'monk',
  'priest',
  'rogue',
  'ranger',
  'samurai',
  'tourist',
  'valkyrie',
  'wizard',
] as const;
export type RoleKey = (typeof ROLE_ORDER)[number];

/** ref: src/role.c races[] order */
export const RACE_ORDER = ['human', 'elf', 'dwarf', 'gnome', 'orc'] as const;
export type RaceKey = (typeof RACE_ORDER)[number];

const isRoleKey = (k: unknown): k is RoleKey =>
  typeof k === 'string' && (ROLE_ORDER as readonly string[]).includes(k);
const isRaceKey = (k: unknown): k is RaceKey =>
  typeof k === 'string' && (RACE_ORDER as readonly string[]).includes(k);

const nhTable = (state: Readonly<GameState>): Record<string, unknown> | null => {
  const nh = state.modData['nh'];
  return nh !== null && typeof nh === 'object' && !Array.isArray(nh)
    ? (nh as Record<string, unknown>)
    : null;
};

/**
 * The hero's role: the test seam `modData.nh.urole` when written, else the key of her role def
 * (`nh:<key>`), else the Valkyrie (the stub's role).
 */
export function urole(state: Readonly<GameState>): RoleKey {
  const seam = nhTable(state)?.['urole'];
  if (isRoleKey(seam)) return seam;
  const id = state.entities[String(state.playerId)]?.c.player?.role;
  const key = id?.startsWith('nh:') ? id.slice(3) : undefined;
  return isRoleKey(key) ? key : 'valkyrie';
}

/** The hero's race: the test seam `modData.nh.urace` when written, else human. */
export function urace(state: Readonly<GameState>): RaceKey {
  const seam = nhTable(state)?.['urace'];
  return isRaceKey(seam) ? seam : 'human';
}

/** ref: include/you.h Role_if() */
export const roleIs = (state: Readonly<GameState>, k: RoleKey): boolean => urole(state) === k;
/** ref: include/you.h Race_if() */
export const raceIs = (state: Readonly<GameState>, k: RaceKey): boolean => urace(state) === k;

/** Test seam only (m22a): plays another role and race until the character is a core choice. */
export function setRoleRaceForTest(
  state: GameState,
  role: RoleKey | null,
  race: RaceKey | null = null,
): void {
  let nh = nhTable(state);
  if (!nh) {
    nh = {};
    state.modData['nh'] = nh as GameState['modData'][string];
  }
  if (role) nh['urole'] = role;
  else delete nh['urole'];
  if (race) nh['urace'] = race;
  else delete nh['urace'];
}
