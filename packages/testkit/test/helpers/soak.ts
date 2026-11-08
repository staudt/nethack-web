import { vanillaMod } from '@nh/content';
import { expect, test } from 'vitest';
import { soak } from '../../src/index';

// Soak seeds are spread over several test files so vitest can run them on parallel workers.

/** One 2000-turn 80x21 soak test per seed. */
export function seedSoaks(seeds: readonly number[]): void {
  for (const seed of seeds) {
    test(`seed ${seed}: 2000 turns at 80x21`, { timeout: 120000 }, () => {
      const r = soak([vanillaMod], { seed, turns: 2000, width: 80, height: 21, checkEvery: 10 });
      console.log(
        `soak 80x21 seed=${seed}: outcome=${r.outcome} actions=${r.actions} turns=${r.turns} ` +
          `deepest=${r.deepestLevel} kills=${r.kills} explored=${r.cellsExplored}`,
      );
      expect(r.violations).toBeNull();
      // The bot never quits (#quit is filtered out of its offers).
      expect(r.outcome).not.toBe('quit');
      // Death is an outcome, not a failure.
      if (r.outcome === 'playing') expect(r.turns).toBeGreaterThanOrEqual(2000);
    });
  }
}

/** One 2000-turn item soak per seed, then a check that the bot used items across them. */
export function itemSoaks(seeds: readonly number[]): void {
  const totals = { pickedUp: 0, eaten: 0, quaffed: 0, read: 0, thrown: 0, kills: 0 };
  for (const seed of seeds) {
    test(`seed ${seed}: 2000 turns with item invariants`, { timeout: 60000 }, () => {
      const r = soak([vanillaMod], { seed, turns: 2000, checkEvery: 5 });
      expect(r.violations).toBeNull();
      totals.pickedUp += r.pickedUp;
      totals.eaten += r.eaten;
      totals.quaffed += r.quaffed;
      totals.read += r.read;
      totals.thrown += r.thrown;
      totals.kills += r.kills;
    });
  }
  test('across the seeds the bot picked up, ate and threw things', () => {
    expect(totals.pickedUp).toBeGreaterThan(0);
    expect(totals.eaten).toBeGreaterThan(0);
    expect(totals.thrown).toBeGreaterThan(0);
  });
}
