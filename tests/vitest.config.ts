import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 300_000,
    hookTimeout: 120_000,
    // One collector on a fixed port: run the files one at a time.
    fileParallelism: false,
  },
});
