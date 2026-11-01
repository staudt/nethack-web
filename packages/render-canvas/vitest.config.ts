import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { testTimeout: 30000, name: 'render-canvas', include: ['test/**/*.test.ts'] },
});
