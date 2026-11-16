import { vanillaMod } from '@nh/content';
import type { Mod } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { soak } from '../src/index';

const LUDIOS = 'nh:ludios';

/**
 * A game mod for this soak: on the first placement the hero goes to Fort Ludios as wizard
 * mode's #levelport does (a random arrival: the fort's teleport region, its arrival chamber).
 * No vault has the portal yet, so the fort has none back (plan Q13) and the bot stays there
 * among its awake garrison, moat and eels.
 */
const ludiosStartMod: Mod = {
  id: 'testkit-ludios-start',
  version: '1',
  dependsOn: ['nh'],
  register(api) {
    api.on(
      'levelChange',
      (ctx, change) => {
        if (change.from !== null) return;
        if (ctx.state.dungeons.some((d) => d.id === LUDIOS))
          ctx.goToLevel({ dungeon: LUDIOS, dlevel: 1 }, 'random');
      },
      { priority: -100 },
    );
  },
};

// The hero starts in Fort Ludios's arrival chamber (ludiosStartMod) and the bot plays there,
// with every invariant (the fort's portals among them) checked as it goes; a run that ends early
// is still checked to its last step. Seed 9 plays all 400 turns, 10 more than 380 (of 1..12
// the others die sooner: the fort is no place for a first-level hero).
describe('soak on Fort Ludios', () => {
  for (const seed of [9, 10]) {
    test(`seed ${seed}: 400 turns on Fort Ludios`, { timeout: 300000 }, () => {
      const r = soak([vanillaMod, ludiosStartMod], { seed, turns: 400, checkEvery: 5 });
      console.log(
        `soak ludios seed=${seed}: outcome=${r.outcome} turns=${r.turns} kills=${r.kills} special=${r.specialLevels.join(',')}`,
      );
      expect(r.violations).toBeNull();
      expect(r.specialLevels).toContain('nh:knox');
    });
  }
});
