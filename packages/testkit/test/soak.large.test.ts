import { vanillaMod } from '@nh/content';
import { describe, expect, test } from 'vitest';
import { soak } from '../src/index';
import { seedSoaks } from './helpers/soak';

describe('soak', () => {
  seedSoaks([4, 5]);

  test('200x200, 500 turns', { timeout: 30000 }, () => {
    const r = soak([vanillaMod], { seed: 11, turns: 500, width: 200, height: 200, checkEvery: 25 });
    console.log(
      `soak 200x200: outcome=${r.outcome} actions=${r.actions} turns=${r.turns} ` +
        `deepest=${r.deepestLevel} kills=${r.kills} explored=${r.cellsExplored}`,
    );
    expect(r.violations).toBeNull();
  });

  test('maxDepth caps descent', { timeout: 30000 }, () => {
    const r = soak([vanillaMod], { seed: 3, turns: 500, maxDepth: 1 });
    expect(r.deepestLevel).toBe(1);
    expect(r.violations).toBeNull();
  });
});
