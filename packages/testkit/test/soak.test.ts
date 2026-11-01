import { vanillaMod } from '@nh/content';
import { describe, expect, test } from 'vitest';
import { recordGame, runReplay, soak, soakKitMod } from '../src/index';

describe('soak', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    test(`seed ${seed}: 2000 turns at 80x21`, { timeout: 40000 }, () => {
      const r = soak([vanillaMod], { seed, turns: 2000, width: 80, height: 21, checkEvery: 10 });
      console.log(
        `soak 80x21 seed=${seed}: outcome=${r.outcome} actions=${r.actions} turns=${r.turns} ` +
          `deepest=${r.deepestLevel} kills=${r.kills} explored=${r.cellsExplored}`,
      );
      expect(r.violations).toBeNull();
      // Death is an outcome, not a failure.
      if (r.outcome === 'playing') expect(r.turns).toBeGreaterThanOrEqual(2000);
    });
  }

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

  test('soak is deterministic', { timeout: 30000 }, () => {
    const a = soak([vanillaMod], { seed: 9, turns: 300 });
    const b = soak([vanillaMod], { seed: 9, turns: 300 });
    expect(a.finalHash).toBe(b.finalHash);
    expect(a.log).toEqual(b.log);
  });
});

describe('soak with multi-turn actions', () => {
  test(
    'the bot sends continue while continuing, and the log replays to the same hash',
    {
      timeout: 30000,
    },
    () => {
      const r = soak([vanillaMod], { seed: 7, turns: 800, checkEvery: 5 });
      expect(r.violations).toBeNull();
      expect(r.log.some((a) => a.type === 'continue')).toBe(true);
      const rec = recordGame([vanillaMod], { seed: 7, width: 80, height: 21 }, r.log);
      expect(rec.hash).toBe(r.finalHash);
      expect(runReplay([vanillaMod], rec).hash).toBe(r.finalHash);
    },
  );
});

describe('soak with the kit mod (fire, throw, kick, text and count prompts)', () => {
  test('three seeds keep every invariant', { timeout: 40000 }, () => {
    const tot = { kicks: 0, fired: 0, thrown: 0, countAnswers: 0, textAnswers: 0 };
    for (const seed of [21, 22, 23]) {
      const r = soak([vanillaMod, soakKitMod], { seed, turns: 1200, checkEvery: 5 });
      expect(r.violations).toBeNull();
      for (const k of Object.keys(tot) as (keyof typeof tot)[]) tot[k] += r[k];
    }
    console.log(`soak kit: ${JSON.stringify(tot)}`);
    expect(tot.kicks).toBeGreaterThan(0);
  });
});
