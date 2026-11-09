// Treasure vaults: core's level generator makes the closed 2x2 room and the teleporter's niche
// and hands them over as `Level.vaultSpot` / `Level.vaultTeleSpot`; this module types the room,
// fills it with gold and keeps the once-only teleporter. (The guard comes in m12 step 7.)
// ref: src/mklev.c makelevel() do_vault block, makevtele(), makeniche(TELEP_TRAP);
// src/sp_lev.c fill_special_room() VAULT
//
// Not ported (DEVIATIONS.md "Special rooms"): the Fort Ludios portal (mk_knox_portal()) and the
// "ad aerarium" engraving by the niche. NetHack's teleporter sits on the secret corridor square
// itself; here traps live only on plain floor, so it is kept aside (vaultstate.ts) and made on
// the square once the corridor is found (searching, digging, a wand of secret door detection...),
// after the hero's action or at the end of the turn, before she can step there.
import { cellIndex, isPlainFloor, trapAt, type Ctx, type Level, type ModApi } from '@nh/core';
import { mkgold } from './items';
import { T, terrainIdAt } from './terrain';
import { TRAP, maketrap } from './trap';
import { VAULT, pendingVaultTele, pendingVaultTeles, setPendingVaultTele } from './vaultstate';

/**
 * Turns level generation's vault request into the `nh:vault` room (lit, after the other rooms
 * as C adds it), fills it with gold and keeps the teleporter request; deletes both requests, so
 * no saved level has them. Run first in mklev's `newLevel` hook: the vault exists before the
 * special-room chain, which counts it. ref: src/mklev.c makelevel() do_vault block
 */
export function mkVault(ctx: Ctx, level: Level): void {
  const spot = level.vaultSpot;
  const tele = level.vaultTeleSpot;
  delete level.vaultSpot;
  delete level.vaultTeleSpot;
  if (!spot) return;
  const idx =
    level.rooms.push({
      lx: spot.x,
      ly: spot.y,
      hx: spot.x + 1,
      hy: spot.y + 1,
      lit: true,
      type: VAULT,
    }) - 1;
  fillVault(ctx, level, idx); // fill_special_room() at once
  if (tele) setPendingVaultTele(ctx, level.id, cellIndex(level, tele.x, tele.y));
}

/**
 * Gold on every square of the vault, `rn1(100 * depth, 51)` pieces each, added to any gold
 * there. ref: src/sp_lev.c fill_special_room() case VAULT
 */
export function fillVault(ctx: Ctx, level: Level, roomIndex: number): void {
  const r = level.rooms[roomIndex];
  if (!r) return;
  const depth = Math.abs(level.depth);
  for (let x = r.lx; x <= r.hx; x++)
    for (let y = r.ly; y <= r.hy; y++)
      mkgold(ctx, ctx.rng.rn2(depth * 100) + 51, { level: level.id, x, y });
}

/**
 * Makes each hidden vault teleporter whose secret corridor is no longer secret: a once-only
 * teleportation trap, unseen. ref: src/mklev.c makeniche() maketrap(), `ttmp->once = 1`
 */
export function revealVaultTele(ctx: Ctx): void {
  for (const lid of pendingVaultTeles(ctx.state)) {
    const cell = pendingVaultTele(ctx.state, lid);
    const level = ctx.state.levels[lid];
    if (cell === null || !level) continue;
    const x = cell % level.width;
    const y = Math.trunc(cell / level.width);
    const id = terrainIdAt(level, x, y);
    if (id === T.scorr) continue;
    setPendingVaultTele(ctx, lid, null);
    // found, the secret corridor is a corridor (anything else: the square is no longer the niche)
    if (id === T.corr && isPlainFloor(ctx.defs, level, x, y) && !trapAt(level, x, y))
      maketrap(ctx, lid, x, y, TRAP.tele).once = true;
  }
}

export function registerVault(api: ModApi): void {
  // makelevel()'s last loop fills every special room again, the vault included: C's needfill
  // stays FILL_NORMAL after the do_vault block's fill, so 3.7 vaults get two piles' worth
  api.on('newLevel', (ctx, level) => {
    for (let i = 0; i < level.rooms.length; i++)
      if (level.rooms[i]?.type === VAULT) fillVault(ctx, level, i);
  });
  api.on('afterAction', (ctx) => {
    revealVaultTele(ctx);
  });
  api.on('endOfTurn', revealVaultTele);
}
