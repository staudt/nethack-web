import { vanillaMod } from '@nh/content';
import { describe, expect, test } from 'vitest';
import { branchStartMod, soak } from '../src/index';

// The hero starts on the Mines staircase (branchStartMod); the bot takes branch stairs down 1
// time in 2, so every run enters the Mines and wanders there, with the stairs and branch
// invariants checked as it goes.
describe('soak in the Mines', () => {
  const deepest: number[] = [];
  // seeds re-picked when the game stream changes; 6 goes down to Mines level 3 (m11 step 5: the egg
  // and the bot's new "Sit" offer; 4 did before, since m11 step 4's gloves shuffle; 9 did before, since m11 step 1's new weapon rows shifted the weapon-class
  // picks; 5 did before, since m7f-d step 2's kicking
  // boots; 7 did before, since m7f-c step 2's new objects; 2 did before, since m7f-c step 1's room statue roll; 6 before, 11 before m7f-b step 2, 2 before
  // m7f-a step 3, 16 before m7f-a step 2, 5 before m7e step 6)
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
