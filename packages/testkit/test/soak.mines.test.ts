import { vanillaMod } from '@nh/content';
import { describe, expect, test } from 'vitest';
import { branchStartMod, soak } from '../src/index';

// The hero starts on the Mines staircase (branchStartMod); the bot takes branch stairs down 1
// time in 2, so every run enters the Mines and wanders there, with the stairs and branch
// invariants checked as it goes.
describe('soak in the Mines', () => {
  const deepest: number[] = [];
  // seeds re-picked when the game stream changes; 6 goes down to Mines level 2 (m7f-b step 2: the
  // invisibility objects shifted the object pools; 11 did before, 2 before m7f-a step 3, 16
  // before m7f-a step 2, 5 before m7e step 6)
  for (const seed of [1, 6, 23]) {
    test(`seed ${seed}: 2000 turns from the Mines staircase`, { timeout: 120000 }, () => {
      const r = soak([vanillaMod, branchStartMod], { seed, turns: 2000, checkEvery: 5 });
      console.log(
        `soak mines seed=${seed}: outcome=${r.outcome} turns=${r.turns} dungeons=${JSON.stringify(r.dungeons)}`,
      );
      expect(r.violations).toBeNull();
      expect(r.dungeons['nh:mines']).toBeGreaterThanOrEqual(1);
      deepest.push(r.dungeons['nh:mines'] ?? 0);
    });
  }
  test('some run went below the Mines top level', () => {
    expect(Math.max(...deepest)).toBeGreaterThanOrEqual(2);
  });
});
