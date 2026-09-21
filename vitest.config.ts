/**
 * @file vitest.config.ts
 *
 * Vitest configuration for Phase 0 unit tests.
 *
 * Maps the `@/` alias to the repository root so money and token
 * helpers can be imported the same way as application code.
 *
 * @module Config
 */

import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
