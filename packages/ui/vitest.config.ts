import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30000,
    name: 'ui',
    environment: 'happy-dom',
    include: ['test/**/*.test.ts'],
  },
});
