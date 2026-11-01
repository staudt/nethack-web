import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { testTimeout: 30000, name: 'app', include: ['test/**/*.test.ts'] },
});
