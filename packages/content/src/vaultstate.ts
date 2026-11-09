// The treasure vault's room kind and lookups. A leaf: trap.ts (the vault teleporter), mkroom.ts
// (the special-room threshold) and vault.ts share it, and step 7's guard code reaches it without
// importing vault.ts. The vault teleporter waiting behind its secret corridor lives in
// `modData.nh.vaultTele[levelId]` (the niche's cell index) until the corridor is found.
// ref: include/mkroom.h VAULT; src/mkroom.c search_special()
import type { Ctx, Level, LevelId } from '@nh/core';

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
