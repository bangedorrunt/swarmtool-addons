import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/evals/**/*.eval.ts'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 10000,
    server: {
      deps: {
        // Force inline @opencode-ai/plugin to work around ESM resolution
        inline: ['@opencode-ai/plugin'],
      },
    },
  },
});
