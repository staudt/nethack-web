// hell_tweaks(): random lava pools, lava rivers, walls replaced by boulders or by iron bars on a
// Gehennom level, outside a protected area. A leaf over selection.ts and the boulder maker:
// hellfill.ts uses it, and later the lairs, Orcus Town and the towers.
// ref: dat/nhlib.lua hell_tweaks()
import type { Ctx, Level } from '@nh/core';
import { mksobjFull } from './mkobj';
import {
  eachSel,
  percent,
  selAnd,
  selCount,
  selGrow,
  selMatch,
  selNegate,
  selNew,
  selOr,
  selPercentage,
  selRandline,
  selRndcoord,
  selSetRandom,
  setSel,
  setTer,
  ter,
  type Sel,
} from './selection';

/** Lava as set_levltyp() makes it: lit. */
const LIT_LAVA = { litLava: true } as const;

/**
 * hell_tweaks(protected_area) on `level` (its depth is the hero's, u.depth, as the level is
 * made): nothing changes in `protectedArea`.
 * - 20 + depth per cent: 5 + rnd(depth) random spots plus three grown ones (west, north, a random
 *   way) become lava pools, 4 times in 5 with 10..80 per cent of the ground round them floor;
 * - half the time lava rivers, wobbly lines between two random floor spots (roughness 10, each
 *   grown north and west half the time), until they cover a twelfth of the open area or 8 tries,
 *   60 per cent of the time with 10..60 per cent of their banks floor;
 * - 20 per cent: 3..24 per cent of the walls between two floor cells (across, then up and down)
 *   become floor with a boulder;
 * - 20 per cent: as many such walls, grown and kept to walls, become iron bars.
 * ref: dat/nhlib.lua hell_tweaks()
 */
export function hellTweaks(ctx: Ctx, level: Level, protectedArea: Sel): void {
  const rng = ctx.rng;
  const nProt = selCount(protectedArea);
  const prot = selNegate(protectedArea);
  const depth = level.depth;

  // random pools
  if (percent(ctx, 20 + depth)) {
    let pools = selNew(level);
    const maxpools = 5 + rng.rnd(depth);
    for (let i = 1; i <= maxpools; i++) pools = selSetRandom(rng, level, pools);
    pools = selOr(pools, selGrow(level, selSetRandom(rng, level, selNew(level)), 'west'));
    pools = selOr(pools, selGrow(level, selSetRandom(rng, level, selNew(level)), 'north'));
    pools = selOr(pools, selGrow(level, selSetRandom(rng, level, selNew(level)), 'random', rng));
    pools = selAnd(pools, prot);
    if (percent(ctx, 80)) {
      const poolground = selAnd(selGrow(level, pools), prot);
      const pval = rng.rnd(8) * 10;
      setSel(level, selPercentage(rng, level, poolground, pval), '.', LIT_LAVA);
    }
    setSel(level, pools, 'L', LIT_LAVA);
  }

  // river
  if (percent(ctx, 50)) {
    let allrivers = selNew(level);
    // # of lava pools required (lua's division is not truncated)
    const reqpts = (level.width * level.height - nProt) / 12;
    let rpts: number;
    let rivertries = 0;
    do {
      const floor = selMatch(level, '.');
      const a = selRndcoord(rng, level, floor);
      const b = selRndcoord(rng, level, floor);
      if (!a || !b) break; // no floor: NetHack's (-1, -1) spots draw an empty line
      let lavariver = selRandline(rng, level, selNew(level), a.x, a.y, b.x, b.y, 10);
      if (percent(ctx, 50)) lavariver = selGrow(level, lavariver, 'north');
      if (percent(ctx, 50)) lavariver = selGrow(level, lavariver, 'west');
      allrivers = selAnd(selOr(allrivers, lavariver), prot);
      rpts = selCount(allrivers);
      rivertries++;
    } while (!(rpts > reqpts || rivertries > 7));
    if (percent(ctx, 60)) {
      const prc = 10 * rng.rnd(6);
      const riverbanks = selAnd(selGrow(level, allrivers), prot);
      setSel(level, selPercentage(rng, level, riverbanks, prc), '.', LIT_LAVA);
    }
    setSel(level, allrivers, 'L', LIT_LAVA);
  }

  // replacing some walls with boulders
  if (percent(ctx, 20)) {
    const amount = 3 * rng.rnd(8);
    const across = selPercentage(rng, level, selMatch(level, '.w.'), amount);
    const bwalls = selAnd(
      selOr(across, selPercentage(rng, level, selMatch(level, '.\nw\n.'), amount)),
      prot,
    );
    eachSel(level, bwalls, (x, y) => {
      setTer(level, x, y, ter('.'));
      mksobjFull(
        ctx,
        ctx.defs.object('nh:boulder'),
        { at: { level: level.id, x, y } },
        { level: level.id, inMklev: true },
      );
    });
  }

  // replacing some walls with iron bars
  if (percent(ctx, 20)) {
    const amount = 3 * rng.rnd(8);
    const across = selPercentage(rng, level, selMatch(level, '.w.'), amount);
    const fwalls = selOr(across, selPercentage(rng, level, selMatch(level, '.\nw\n.'), amount));
    setSel(level, selAnd(selAnd(selGrow(level, fwalls), selMatch(level, 'w')), prot), 'F');
  }
}
