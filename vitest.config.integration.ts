import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ["__tests__/integration/**/*.test.ts"],
    setupFiles: ["__tests__/integration/utils/setup.ts"],
    poolOptions: {
      /*threads: {
        singleThread: true
      },
      vmThreads: {
        singleThread: true
      },*/
      forks: {
        singleFork: true,
      },
    }
  }
});