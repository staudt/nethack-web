import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { testTimeout: 30000, name: 'testkit', include: ['test/**/*.test.ts'] },
});
