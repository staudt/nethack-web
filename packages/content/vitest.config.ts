import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { testTimeout: 30000, name: 'content', include: ['test/**/*.test.ts'] },
});
