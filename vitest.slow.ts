// The slow test files: random-play soaks, the golden and determinism replays, other long replays,
// and statistical tests that took 8 s or more in a full parallel run (2026-11-07). `pnpm test:fast`
// (`vitest run --mode fast`) leaves them out for quick iteration; `pnpm test` and `pnpm check` run
// everything. Globs are relative to each package. The one list for the whole repo: the package
// configs read it through `slowTests()`.
import { configDefaults } from 'vitest/config';

const SLOW: Readonly<Record<string, readonly string[]>> = {
  core: ['test/mkmap.props.test.ts'],
  content: [
    'test/dokick.test.ts',
    'test/dothrow.test.ts',
    'test/generation.test.ts',
    'test/m7c.dip.test.ts',
    'test/m7c.fountain.test.ts',
    'test/mcastu.test.ts',
    'test/mhitm.test.ts',
    'test/mthrowu.test.ts',
    'test/resist.test.ts',
  ],
  testkit: [
    'test/determinism.test.ts',
    'test/golden.test.ts',
    'test/minetown.test.ts',
    'test/replay.test.ts',
    'test/scenarios.m5.test.ts',
    'test/scenarios.m6a.test.ts',
    'test/scenarios.m6b2.test.ts',
    'test/shops.test.ts',
    'test/soak.test.ts',
    'test/soak.*.test.ts',
  ],
};

/** The `exclude` for a package's test config: the default, plus its slow files in fast mode. */
export function slowTests(pkg: string, mode: string): string[] {
  return [...configDefaults.exclude, ...(mode === 'fast' ? (SLOW[pkg] ?? []) : [])];
}
