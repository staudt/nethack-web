import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { testTimeout: 30000, name: 'modern-ui', include: ['test/**/*.test.ts'] },
});
