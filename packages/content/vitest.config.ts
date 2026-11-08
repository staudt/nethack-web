import { defineConfig } from 'vitest/config';
import { slowTests } from '../../vitest.slow.ts';

export default defineConfig(({ mode }) => ({
  test: {
    testTimeout: 30000,
    name: 'content',
    include: ['test/**/*.test.ts'],
    exclude: slowTests('content', mode),
  },
}));
