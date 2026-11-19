// Magic portals: a hidden trap whose data names the level it leads to; the hero (or a monster)
// stepping on it goes there and arrives on that level's own portal. Vanilla has the pair between
// the first fake Wizard's Tower and the real tower's bottom level, Fort Ludios's and the Quest's
// (m24, branchportal.ts). Never random, never destroyed.
// A leaf: trap.ts (the effects), migrate.ts (monsters arriving through it) and the levels use it.
// ref: src/mkmaze.c mkportal(), fixup_special() (LR_PORTAL); src/teleport.c domagicportal(),
// mlevel_tele_trap(); src/do.c goto_level() (the arrival portal); src/dog.c mon_arrive()
// (MIGR_PORTAL)
import type { DefId, Json, Level, LevelRef, Trap } from '@nh/core';

/** The magic portal's TrapDef id (MAGIC_PORTAL). */
export const MAGIC_PORTAL: DefId = 'nh:magic_portal';

/** Trap.data of a magic portal: where it leads (C's `ttmp->dst`). */
export interface PortalData {
  dst: LevelRef;
}

/** The destination of a magic portal, or null for a malformed one. */
export function portalDest(t: Readonly<Trap>): LevelRef | null {
  const d = t.data as { dst?: { dungeon?: unknown; dlevel?: unknown } } | undefined;
  const dst = d?.dst;
  return dst && typeof dst.dungeon === 'string' && typeof dst.dlevel === 'number'
    ? { dungeon: dst.dungeon as DefId, dlevel: dst.dlevel }
    : null;
}

/** The trap data of a portal to `dst`. */
export const portalData = (dst: LevelRef): Json => ({ dst: { ...dst } }) as unknown as Json;

/**
 * The des.levregion({ type = "portal" }) spots of the levels that have portals, map-relative, by
 * LevelDef id (single-cell regions): their fixups put the portals there (Fort Ludios's is its
 * branch levregion, where a branch portal goes). The hero arrives on the made level's portal
 * (`goToLevel(to, { trap })`). ref: dat/fakewiz1.lua, dat/wizard3.lua, dat/knox.lua
 */
export const PORTAL_SPOTS: Readonly<Record<DefId, readonly [number, number]>> = {
  'nh:fakewiz1': [4, 4],
  'nh:wizard3': [25, 11],
  /** dat/knox.lua's levregion type "branch": the portal back to the vault */
  'nh:knox': [8, 16],
};

/** The first magic portal of `level` (in trap order), or null. */
export function findPortal(level: Readonly<Level>): Trap | null {
  return level.traps.find((t) => t.def === MAGIC_PORTAL) ?? null;
}
