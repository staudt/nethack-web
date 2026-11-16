// The hero's pantheon and the gods' names. A leaf (core types and the role tables only), so
// that priest and monster naming can use it. ref: src/pray.c align_gname(), align_gtitle();
// src/role.c role_init() (the pantheon), ok_align()
import type { Ctx, GameState, Json } from '@nh/core';
import { A_NONE } from './aligntyp';
import { RACES_TAB } from './racetab';
import { ROLES_TAB, type Align } from './roletab';
import { ROLE_ORDER, urole, type RaceKey, type RoleKey } from './urole';

type Table = { [k: string]: Json };
const isObj = (v: unknown): v is Table => v !== null && typeof v === 'object' && !Array.isArray(v);
const isRoleKey = (k: unknown): k is RoleKey =>
  typeof k === 'string' && (ROLE_ORDER as readonly string[]).includes(k);

/** The first role with gods (C's fallback when no draw found one). ref: src/role.c role_init() */
const FIRST_PANTHEON: RoleKey = ROLE_ORDER.find((r) => ROLES_TAB[r].gods !== null) ?? 'valkyrie';

/**
 * The role whose gods the hero has (C's flags.pantheon): `modData.nh.pantheon` when one was drawn
 * (a Priest), else her own role's; a role without gods falls back to the first that has.
 */
export function pantheon(state: Readonly<GameState>): RoleKey {
  const nh = state.modData['nh'];
  const drawn = isObj(nh) ? nh['pantheon'] : undefined;
  const p = isRoleKey(drawn) ? drawn : urole(state);
  return ROLES_TAB[p].gods ? p : FIRST_PANTHEON;
}

/**
 * At new game: the hero uses her own role's gods unless it has none (the Priest): then other
 * roles are drawn (`randrole(FALSE)`, up to 100 tries) until one has a pantheon. Stored only when
 * it is not her own role's. ref: src/role.c role_init() "Fix up the god names"
 */
export function initPantheon(ctx: Pick<Ctx, 'state' | 'rng'>): void {
  const own = urole(ctx.state);
  let p: RoleKey = own;
  let trycnt = 0;
  while (!ROLES_TAB[p].gods && ++trycnt < 100)
    p = ROLE_ORDER[ctx.rng.rn2(ROLE_ORDER.length)] ?? own;
  if (!ROLES_TAB[p].gods) p = FIRST_PANTHEON;
  const md = ctx.state.modData;
  let nh = md['nh'];
  if (p === own) {
    if (isObj(nh)) delete nh['pantheon'];
    return;
  }
  if (!isObj(nh)) {
    nh = {};
    md['nh'] = nh;
  }
  nh['pantheon'] = p;
}

const godOf = (state: Readonly<GameState>, a: number): { key: string; goddess: boolean } | null => {
  const row = ROLES_TAB[pantheon(state)];
  const gods = row.gods;
  if (!gods || a === A_NONE) return null;
  const which = a > 0 ? 'lawful' : a < 0 ? 'chaotic' : 'neutral';
  return { key: gods[which], goddess: row.goddess[which] === true };
};

/**
 * The god of an alignment in the hero's pantheon as a message param ('@god.odin'), Moloch for
 * A_NONE. ref: src/pray.c align_gname()
 */
export function alignGname(state: Readonly<GameState>, a: number): string {
  return `@${godOf(state, a)?.key ?? 'god.moloch'}`;
}

/**
 * The god's name without the key prefix ('odin'): the suffix of the per-god message keys
 * (`killer.wrath_<god>`, `priest.of.<god>`).
 */
export const godSuffix = (state: Readonly<GameState>, a: number): string =>
  alignGname(state, a).slice('@god.'.length);

/** "god" or "goddess" as a message param. ref: src/pray.c align_gtitle() */
export function alignGtitle(state: Readonly<GameState>, a: number): string {
  return godOf(state, a)?.goddess ? '@align.goddess' : '@align.god';
}

/**
 * The hero's starting alignment: her role's first allowed one that her race allows too (the
 * port's default character, plan m22 Q6). ref: src/role.c ok_align()
 */
export function startAlign(role: RoleKey, race: RaceKey): Align {
  const allowed = RACES_TAB[race].aligns;
  return ROLES_TAB[role].aligns.find((a) => allowed.includes(a)) ?? ROLES_TAB[role].aligns[0] ?? 0;
}
