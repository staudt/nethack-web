// Where Fort Ludios's portal went. C rolls the Ludios branch on DL18-21 and then marks its
// main-dungeon end bogus (end1.dnum = n_dgns) until mk_knox_portal() re-inserts it on the level
// of the vault that gets the portal; here that level is `modData.nh.knox` (`{ dlevel }` of the
// main dungeon), absent until then (the unplaced floater). A leaf: vault.ts, knox.ts and
// wizard/where.ts read it.
// ref: src/mklev.c mk_knox_portal(); src/dungeon.c fixup_level_locations(), insert_branch()
import type { Ctx, GameState, Json, LevelRef } from '@nh/core';

/** `modData.nh.knox`: the main-dungeon level whose vault holds the portal (C's end1). */
export interface KnoxState {
  dlevel: number;
}

/** The main-dungeon level holding the portal to Fort Ludios, or null while it is not placed. */
export function knoxSource(state: Readonly<GameState>): LevelRef | null {
  const nh = state.modData['nh'] as Record<string, Json> | undefined;
  const k = nh?.['knox'] as { dlevel?: unknown } | undefined;
  const main = state.dungeons[0];
  return main && typeof k?.dlevel === 'number' ? { dungeon: main.id, dlevel: k.dlevel } : null;
}

/** Records the portal's main-dungeon level (`*source = u.uz; insert_branch(br, TRUE)`). */
export function setKnoxSource(ctx: Pick<Ctx, 'state'>, dlevel: number): void {
  const nh = (ctx.state.modData['nh'] ??= {}) as Record<string, Json>;
  nh['knox'] = { dlevel } satisfies KnoxState as unknown as Json;
}

/**
 * Whether the game runs in wizard mode (the `wiz` game mod is loaded): C's `wizard` flag, for
 * the few rules that differ there. ref: include/flag.h `wizard` (flags.debug)
 */
export const wizardMode = (state: Readonly<GameState>): boolean =>
  state.mods.some((m) => m.id === 'wiz');
