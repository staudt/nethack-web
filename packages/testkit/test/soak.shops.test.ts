import { vanillaMod } from '@nh/content';
import { describe, expect, test } from 'vitest';
import { soak, soakKitMod } from '../src/index';

// Random dungeon shops (6b3): a run that goes below DL1, shops there with unpaid goods and pays
// (`nh:pay`, 1 time in 2 while owing in a shop, at most once in 20 turns), with every invariant
// checked every third step: unpaid goods are hers (or on his floor) and on a bill, no charge goods
// lie in a shop. The seed was searched for a run that pays (393 since m7c step 2, whose new
// monsters in the random pool moved seed 152's stream); re-pick it when the game stream changes.
describe('soak through a random shop', () => {
  test('seed 393: 3000 turns, buying and paying on DL2+', { timeout: 120000 }, () => {
    const r = soak([vanillaMod, soakKitMod], { seed: 393, turns: 3000, checkEvery: 3 });
    console.log(
      `soak shops seed=393: outcome=${r.outcome} turns=${r.turns} deepest=${r.deepestLevel} paid=${r.paid}`,
    );
    expect(r.violations).toBeNull();
    expect(r.deepestLevel).toBeGreaterThanOrEqual(2);
    expect(r.paid).toBeGreaterThan(0);
  });
});
