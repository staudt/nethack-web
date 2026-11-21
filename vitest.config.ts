import { defineConfig } from 'vitest/config';
import { BaseSequencer, type TestSpecification } from 'vitest/node';
import { isSlowTest } from './vitest.slow.ts';

/**
 * Starts the slow files (vitest.slow.ts) first, longest first by the last run's durations when
 * known: by default each project's files queue after the previous project's and, without cached
 * durations (CI), larger files first, so the long soaks of testkit (the last project, split into
 * small files that share helpers) would start last and stretch the run.
 */
class SlowFirstSequencer extends BaseSequencer {
  override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const sorted = await super.sort(files);
    const took = (f: TestSpecification): number =>
      this.ctx.cache.getTestSpecificationResult(f)?.duration ?? 0;
    const slow = sorted.filter((f) => isSlowTest(f.moduleId));
    // a stable sort: unknown durations keep the default order
    slow.sort((a, b) => took(b) - took(a));
    return [...slow, ...sorted.filter((f) => !isSlowTest(f.moduleId))];
  }
}

export default defineConfig({
  test: {
    // Statistical and soak tests replay many seeded games; under a parallel full run they can
    // take longer than the 5 s default.
    testTimeout: 30000,
    projects: ['packages/*'],
    sequence: { sequencer: SlowFirstSequencer },
    // Keep full runs terse: failures and their console output print in full, passing tests don't.
    reporters: ['dot'],
    silent: 'passed-only',
    coverage: {
      provider: 'v8',
      // The per-file table is ~40 KB; thresholds are still enforced with the summary alone.
      reporter: ['text-summary'],
      include: ['packages/*/src/**'],
      exclude: ['packages/app/**', '**/index.ts', '**/types/**'],
      thresholds: {
        'packages/core/src/**': { lines: 90, branches: 85, functions: 90, statements: 90 },
      },
    },
  },
});
