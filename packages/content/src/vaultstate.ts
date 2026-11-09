// The treasure vault's room kind and lookups. A leaf: trap.ts (the vault teleporter), mkroom.ts
// (the special-room threshold) and vault.ts share it, and step 7's guard code reaches it without
// importing vault.ts. The vault teleporter waiting behind its secret corridor lives in
// `modData.nh.vaultTele[levelId]` (the niche's cell index) until the corridor is found; the
// guard's record in `modData.nh.egd`, the hero's vault counter in `modData.nh.uinvault`.
// ref: include/mkroom.h VAULT; src/mkroom.c search_special(); include/mextra.h struct egd;
// src/vault.c findgd(), vault_occupied(), vault_summon_gd()
import type { Ctx, DefId, EntityId, Level, LevelId } from '@nh/core';
import { uRooms } from './urooms';

/** The vault's `Room.type` (ref: VAULT). */
export const VAULT = 'nh:vault';

/** The index in `level.rooms` of the level's vault, or null. ref: src/mkroom.c search_special(VAULT) */
export function vaultRoom(level: Readonly<Level>): number | null {
  const i = level.rooms.findIndex((r) => r.parent === undefined && r.type === VAULT);
  return i === -1 ? null : i;
}

type TeleTable = Record<LevelId, number>;

function teleTable(state: Readonly<Ctx['state']>, create: boolean): TeleTable | null {
  const md = state.modData;
  const nh = md['nh'] as { vaultTele?: TeleTable } | undefined;
  if (nh?.vaultTele) return nh.vaultTele;
  if (!create) return null;
  const d = (md['nh'] ??= {}) as { vaultTele?: TeleTable };
  d.vaultTele = {};
  return d.vaultTele;
}

/** The cell index of the level's vault teleporter still hidden in its secret corridor, or null. */
export function pendingVaultTele(state: Readonly<Ctx['state']>, level: LevelId): number | null {
  return teleTable(state, false)?.[level] ?? null;
}

/** The levels with a hidden vault teleporter, sorted. */
export function pendingVaultTeles(state: Readonly<Ctx['state']>): LevelId[] {
  return Object.keys(teleTable(state, false) ?? {}).sort();
}

/** Records (a cell index) or forgets (null) the level's hidden vault teleporter. */
export function setPendingVaultTele(
  ctx: Pick<Ctx, 'state'>,
  level: LevelId,
  cell: number | null,
): void {
  if (cell !== null) {
    (teleTable(ctx.state, true) as TeleTable)[level] = cell;
    return;
  }
  const t = teleTable(ctx.state, false);
  if (!t) return;
  delete t[level];
  if (Object.keys(t).length === 0)
    delete (ctx.state.modData['nh'] as { vaultTele?: TeleTable }).vaultTele;
}

// ---------------------------------------------------------------------------------------------
// the vault guard's record (EGD) and the hero's vault counter (u.uinvault)

/** One square of the guard's fake corridor and the terrain it had. ref: struct fakecorridor */
export interface FakeCorr {
  x: number;
  y: number;
  ftyp: DefId;
}

/**
 * The vault guard's record, in `modData.nh.egd` keyed by the guard's entity id: a guard is a
 * monster with a record (ref: mtmp->isgd). The record outlives the monster while his fake
 * corridor is still on the map: `parked` stands for C's guard parked at <0,0> (dismissed or
 * dead, `dead` for the latter), whose corridor closes as soon as it can.
 * ref: include/mextra.h struct egd (fcend is `fakecorr.length`)
 */
export interface Egd {
  fcbeg: number;
  /** The vault's index in `Level.rooms`. */
  vroom: number;
  /** Where he leads the hero: a corridor square (find_guard_dest()). */
  gdx: number;
  gdy: number;
  /** His position before his last move (0, 0 once parked). */
  ogx: number;
  ogy: number;
  gdlevel: LevelId;
  warncnt: number;
  gddone: boolean;
  dropgoldcnt: number;
  fakecorr: FakeCorr[];
  parked?: true;
  dead?: true;
}

type NhTable = { egd?: Record<string, Egd>; uinvault?: number };
const nhOf = (state: Readonly<Ctx['state']>): NhTable | undefined =>
  state.modData['nh'] as NhTable | undefined;

/** Monster `id`'s guard record, or null (ref: mtmp->isgd, EGD(mtmp)). */
export function egdOf(state: Readonly<Ctx['state']>, id: EntityId): Egd | null {
  return nhOf(state)?.egd?.[String(id)] ?? null;
}

/** Monster `id` is a vault guard on the map (ref: mtmp->isgd, not parked). */
export function isGuard(state: Readonly<Ctx['state']>, id: EntityId): boolean {
  const egd = egdOf(state, id);
  return egd !== null && egd.parked === undefined;
}

/** Gives monster `id` a guard record. ref: src/vault.c newegd() */
export function setEgd(ctx: Pick<Ctx, 'state'>, id: EntityId, egd: Egd): void {
  const nh = (ctx.state.modData['nh'] ??= {}) as NhTable;
  (nh.egd ??= {})[String(id)] = egd;
}

/** Drops guard `id`'s record. ref: src/vault.c free_egd() */
export function deleteEgd(ctx: Pick<Ctx, 'state'>, id: EntityId): void {
  const nh = nhOf(ctx.state);
  if (!nh?.egd) return;
  delete nh.egd[String(id)];
  if (Object.keys(nh.egd).length === 0) delete nh.egd;
}

/** The ids with a guard record, in id order. */
export function egdIds(state: Readonly<Ctx['state']>): EntityId[] {
  return Object.keys(nhOf(state)?.egd ?? {})
    .map(Number)
    .sort((a, b) => a - b);
}

/**
 * The guard of the hero's level, parked or not, or null. ref: src/vault.c findgd() (no
 * migrating guards: a guard stays on his level)
 */
export function findgd(state: Readonly<Ctx['state']>): EntityId | null {
  for (const id of egdIds(state)) if (egdOf(state, id)?.gdlevel === state.currentLevel) return id;
  return null;
}

/** u.uinvault: how many turns the hero has spent in the vault (0 when outside). */
export const uinvault = (state: Readonly<Ctx['state']>): number => nhOf(state)?.uinvault ?? 0;

export function setUinvault(ctx: Pick<Ctx, 'state'>, n: number): void {
  if (n === 0) {
    const nh = nhOf(ctx.state);
    if (nh) delete nh.uinvault;
    return;
  }
  ((ctx.state.modData['nh'] ??= {}) as NhTable).uinvault = n;
}

/** ref: include/hack.h VAULT_GUARD_TIME */
export const VAULT_GUARD_TIME = 30;

/** The vault among `rooms` (an in_rooms() list of `level`), or null. ref: vault_occupied() */
export function vaultOccupied(level: Readonly<Level>, rooms: readonly number[]): number | null {
  for (const r of rooms) if (level.rooms[r]?.type === VAULT) return r;
  return null;
}

/**
 * A cursed tin whistle blown in the vault brings the guard on the next turn.
 * ref: src/vault.c vault_summon_gd()
 */
export function vaultSummonGd(ctx: Pick<Ctx, 'state'>): void {
  const level = ctx.state.levels[ctx.state.currentLevel];
  if (level && vaultOccupied(level, uRooms(ctx)) !== null && findgd(ctx.state) === null)
    setUinvault(ctx, VAULT_GUARD_TIME - 1);
}

// late bindings: vault.ts (above monmove.ts, trap.ts and end.ts) registers the guard's code

type GdMove = (ctx: Ctx, id: EntityId) => -2 | -1 | 0 | 1;
type Uleftvault = (ctx: Ctx, id: EntityId) => void;
let gdMoveFn: GdMove | null = null;
let uleftvaultFn: Uleftvault | null = null;

export function setGuardCode(gdMove: GdMove, uleftvault: Uleftvault): void {
  gdMoveFn = gdMove;
  uleftvaultFn = uleftvault;
}

/** gd_move(), late bound. ref: src/vault.c gd_move() */
export function gdMoveLate(ctx: Ctx, id: EntityId): -2 | -1 | 0 | 1 {
  return gdMoveFn ? gdMoveFn(ctx, id) : -1;
}

/** uleftvault(), late bound. ref: src/vault.c uleftvault() */
export function uleftvaultLate(ctx: Ctx, id: EntityId): void {
  uleftvaultFn?.(ctx, id);
}
