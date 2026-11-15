import { vanillaMod } from '@nh/content';
import { describe, expect, test } from 'vitest';
import { soak } from '../src/index';

// Short runs (m16 step 6) with the engraving invariant checked after every step: every
// engraving lies on an existing level, on an ACCESSIBLE() square (never a wall, stone, a tree,
// iron bars, water or lava), with a known type and a text that is not empty. The bot writes
// ("Elbereth" 1 time in 2) and so stands on its own Elbereth now and then, while level creation
// adds graffiti, the vault niche's and the locked shop door's dust, and the monsters and her
// moves wear them.
describe('soak with engravings', () => {
  // seeds whose bot writes and stands on an Elbereth within its run (seed 3 dies at turn 78)
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    test(`seed ${seed}: 300 turns`, { timeout: 60000 }, () => {
      const r = soak([vanillaMod], { seed, turns: 300, checkEvery: 1 });
      console.log(
        `soak engrave seed=${seed}: outcome=${r.outcome} turns=${r.turns} engraved=${r.engraved} onElbereth=${r.onElbereth}`,
      );
      expect(r.violations).toBeNull();
      expect(r.engraved).toBeGreaterThan(0);
      expect(r.onElbereth).toBeGreaterThan(0);
    });
  }
});
