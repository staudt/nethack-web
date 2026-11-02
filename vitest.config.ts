import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Statistical and soak tests replay many seeded games; under a parallel full run they can
    // take longer than the 5 s default.
    testTimeout: 30000,
    projects: ['packages/*'],
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
