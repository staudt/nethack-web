// The Plane of Air's thunderstorms (its "stormy" level flag: the only stormy level). 1 turn in 8
// lightning strikes out of a few of its clouds, and the hero hears it, or (inside a cloud) is
// deafened and hides for 3 turns. ref: src/timeout.c do_storms(); src/allmain.c moveloop_core()
//
// Not ported: deafness (the hero is never deaf here, so the thunder never deafens her).
import { DIR_LIST, DIRS, getLevel, getPlayer, type Ctx, type ModApi } from '@nh/core';
import { buzzFrom } from './buzz';
import { isHelpless, nomulNow } from './hunger';
import { isAirLevel } from './levelflags';
import { uState } from './luck';
import { T, terrainIdAt } from './terrain';

/**
 * A thunderstorm on the Plane of Air (1 turn in 8): 8 - log2(rnd(64)) strikes, each from a
 * random cloud (100 tries to find one) in a random direction, a bolt of lightning of 8 dice; then
 * "Kaboom!!!  Boom!!  Boom!!" and 3 turns hiding from it when she is in a cloud (not while
 * praying), else "You hear a rumbling noise.". ref: src/timeout.c do_storms()
 */
export function doStorms(ctx: Ctx): void {
  // no lightning if not stormy level or too often, even then
  if (!isAirLevel(ctx.state) || ctx.rng.rn2(8)) return;
  const level = getLevel(ctx.state);
  // the number of strikes is 8-log2(nstrike)
  for (let nstrike = ctx.rng.rnd(64); nstrike <= 64; nstrike *= 2) {
    let count = 0;
    let x: number;
    let y: number;
    do {
      x = ctx.rng.rnd(level.width - 1);
      y = ctx.rng.rn2(level.height);
    } while (++count < 100 && terrainIdAt(level, x, y) !== T.cloud);
    if (count < 100) {
      const dx = ctx.rng.rn2(3) - 1;
      const dy = ctx.rng.rn2(3) - 1;
      const dir = DIR_LIST.find((d) => DIRS[d].x === dx && DIRS[d].y === dy);
      // BZ_M_SPELL(BZ_OFS_AD(AD_ELEC)): monster LIGHTNING spell, unspecified attacker
      if (dir) buzzFrom(ctx, 'lightning', 8, { x, y }, dir, { by: 'spell' });
      if (ctx.state.gameOver) return;
    }
  }
  const p = getPlayer(ctx.state).c.pos;
  if (p && terrainIdAt(getLevel(ctx.state, p.level), p.x, p.y) === T.cloud) {
    // inside a cloud during a thunderstorm is deafening
    ctx.emit({ type: 'msg', key: 'bubbles.kaboom' });
    if (!uState(ctx.state).uinvulnerable) {
      ctx.interrupt(); // stop_occupation()
      if (!isHelpless(ctx)) nomulNow(ctx, 3, 'helpless.thunderstorm', null);
    }
  } else ctx.emit({ type: 'msg', key: 'bubbles.rumbling' });
}

/** The storms once a turn, ahead of hunger (moveloop_core(): do_storms(), then gethungry()). */
export function registerStorms(api: ModApi): void {
  api.on('endOfTurn', (ctx) => {
    if (ctx.state.gameOver === null) doStorms(ctx);
  });
}
