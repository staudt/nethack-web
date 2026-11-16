// The hero's role and race as content keys (C's Role_if()/Race_if()). A leaf module (core only):
// every role or race rule asks these, never `player.role` directly. They read the hero's
// starting character (core's PlayerComponent): the role def `nh:role_<key>` and the race def
// `nh:race_<key>` (roles.ts). ref: include/you.h Role_if(), Race_if(), Role_switch, Race_switch
import type { DefId, GameState } from '@nh/core';

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

/** A role's def id (ids of the role names are player monsters'). */
export const roleDefId = (k: RoleKey): DefId => `nh:role_${k}`;
/** A race's def id (`nh:human` .. are the race monsters'). */
export const raceDefId = (k: RaceKey): DefId => `nh:race_${k}`;

/** The vanilla role a def id names, or null (another mod's role). */
export function roleKeyOf(id: DefId | undefined): RoleKey | null {
  const k = id?.startsWith('nh:role_') ? id.slice(8) : null;
  return isRoleKey(k) ? k : null;
}

/** The vanilla race a def id names, or null. */
export function raceKeyOf(id: DefId | undefined): RaceKey | null {
  const k = id?.startsWith('nh:race_') ? id.slice(8) : null;
  return isRaceKey(k) ? k : null;
}

/**
 * The hero's role. A role another mod defines has no tables here: it plays as the Valkyrie (the
 * default role) until the tables become defs (ROADMAP).
 */
export function urole(state: Readonly<GameState>): RoleKey {
  return roleKeyOf(state.entities[String(state.playerId)]?.c.player?.role) ?? 'valkyrie';
}

/** The hero's race (another mod's race plays as a human). */
export function urace(state: Readonly<GameState>): RaceKey {
  return raceKeyOf(state.entities[String(state.playerId)]?.c.player?.race) ?? 'human';
}

/** ref: include/you.h Role_if() */
export const roleIs = (state: Readonly<GameState>, k: RoleKey): boolean => urole(state) === k;
/** ref: include/you.h Race_if() */
export const raceIs = (state: Readonly<GameState>, k: RaceKey): boolean => urace(state) === k;
