import { vanillaMod } from '@nh/content';
import type { Mod } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { soak } from '../src/index';

/** The Rogue level's special level in the main dungeon's layout (dungeon.lua's "rogue"). */
const ROGUE = 'nh:rogue';

/**
 * A game mod for this soak: on the first placement the hero goes to the Rogue level's up stairs
 * (DL15-18), as specialStartMod does for Minetown.
 */
const rogueStartMod: Mod = {
  id: 'testkit-rogue-start',
  version: '1',
  dependsOn: ['nh'],
  register(api) {
    api.on(
      'levelChange',
      (ctx, change) => {
        if (change.from !== null) return;
        const main = ctx.state.dungeons[0];
        const sp = main?.special.find((s) => s.id === ROGUE);
        if (main && sp) ctx.goToLevel({ dungeon: main.id, dlevel: sp.dlevel }, 'up');
      },
      { priority: -100 },
    );
  },
};

// The hero starts on the Rogue level's up stairs (rogueStartMod) and the bot plays there among
// its uppercase monsters and doorless doorways, with every invariant (no door on a Rogue level
// as made) checked as it goes, at the vanilla size and a bigger map; a run that ends early is
// still checked to its last step. Seeds 2 and 3 play all 400 turns; 7 lasts 187 on the bigger
// map (of 1..9, the others die within 360 turns, most within 50).
describe('soak on the Rogue level', () => {
  for (const [seed, width, height] of [
    [2, 80, 21],
    [3, 80, 21],
    [7, 120, 40],
  ] as const) {
    test(
      `seed ${seed}: 400 turns from the Rogue level at ${width}x${height}`,
      { timeout: 120000 },
      () => {
        const r = soak([vanillaMod, rogueStartMod], {
          seed,
          turns: 400,
          width,
          height,
          checkEvery: 5,
        });
        console.log(
          `soak rogue seed=${seed}: outcome=${r.outcome} turns=${r.turns} special=${r.specialLevels.join(',')} dungeons=${JSON.stringify(r.dungeons)}`,
        );
        expect(r.violations).toBeNull();
        expect(r.specialLevels).toContain(ROGUE);
      },
    );
  }
});
