import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Pure-unit tests only — no live database, no network, no React rendering.
 * Everything under test is deterministic: credit math, the model registry,
 * the mock provider's job lifecycle, the preset catalogue's integrity, the
 * remix mapping and the rate limiter.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // `server-only` is a Next.js build-time guard with no runtime outside it.
      // Stubbing it lets a server module be unit tested without weakening the
      // guard in the app, where the real package still refuses a client import.
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    restoreMocks: true,
    /**
     * Above vitest's 5s default.
     *
     * Nothing here is slow on purpose — these are pure unit tests. But a few
     * files reach a service through a dynamic `import()`, and the first one to
     * do so compiles a large module graph while the rest of the suite is
     * running in parallel. That has taken over 2.5s on a loaded machine and
     * produced exactly one unreproducible failure in this suite; a timeout
     * that trips on scheduling noise reports a bug that is not there.
     */
    testTimeout: 15_000,
  },
})
