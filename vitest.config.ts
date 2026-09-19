import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Pure-unit tests only — no live database, no network, no React rendering.
 * Everything under test is deterministic: credit math, the model registry,
 * the mock provider's job lifecycle, and the preset catalogue's integrity.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    restoreMocks: true,
  },
})
