import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['__tests__/integration/**/*.test.ts'],
    setupFiles: ['__tests__/integration/utils/setup.ts'],
    maxWorkers: 1,
    isolate: false,
  },
});
