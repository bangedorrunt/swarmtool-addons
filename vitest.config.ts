import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 60000,
    reporters: ['default', 'json'],
    outputFile: {
      json: './test-results.json',
    },
    server: {
      deps: {
        // Force inline @opencode-ai/plugin to work around ESM resolution
        inline: ['@opencode-ai/plugin'],
      },
    },
  },
});
