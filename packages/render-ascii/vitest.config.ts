import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { testTimeout: 30000, name: 'render-ascii', include: ['test/**/*.test.ts'] },
});
