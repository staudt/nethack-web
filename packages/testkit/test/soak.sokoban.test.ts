import { vanillaMod } from '@nh/content';
import { type Mod } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { soak } from '../src/index';

/**
 * A test-local game mod: at new game it levelports the hero to Sokoban's entry level (the
 * bottom one, `nh:soko4`) onto its branch stairs, as wizard mode's levelport would, so the bot
 * plays among the boulders and pits from the start.
 */
const sokobanStartMod: Mod = {
  id: 'test-sokoban-start',
  version: '1',
  dependsOn: ['nh'],
  register(api) {
    // on the first placement (after the pet is made), not at newGame: no level exists yet
    api.on(
      'levelChange',
      (ctx, change) => {
        if (change.from !== null) return;
        const soko = ctx.state.dungeons.find((d) => d.id === 'nh:sokoban');
        if (soko?.levels) ctx.goToLevel({ dungeon: soko.id, dlevel: soko.levels }, 'branch');
      },
      { priority: -100 },
    );
  },
};

// Short runs from Sokoban's entry level with every invariant checked as the bot goes, including
// boulders (none in walls, no monster walking onto one, the sokoban flag only where a LevelDef
// sets it). The bot pushes boulders only when a random move walks into one, so how many it
// pushes depends on the seed: the count is logged, not asserted (invariants.m7b.test.ts checks
// the counter, and content's m7b tests the pushes themselves). An experience level 1 hero
// often dies early this deep; a run that ends is still checked to its last step.
describe('soak in Sokoban', () => {
  for (const seed of [1, 2]) {
    test(`seed ${seed}: 300 turns from Sokoban's entry level`, { timeout: 60000 }, () => {
      const r = soak([vanillaMod, sokobanStartMod], { seed, turns: 300, checkEvery: 1 });
      console.log(
        `soak sokoban seed=${seed}: outcome=${r.outcome} turns=${r.turns} pushes=${r.boulderPushes} special=${r.specialLevels.join(',')}`,
      );
      expect(r.violations).toBeNull();
      expect(r.specialLevels).toContain('nh:soko4');
    });
  }
});
