import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { FlatCompat } from '@eslint/eslintrc'

/**
 * ESLint, flat config.
 *
 * `eslint-config-next` still ships as an eslintrc-style config, so it is
 * bridged through FlatCompat rather than rewritten — that way `next/core-web-vitals`
 * stays the single source of truth for the React and Next rules and we only
 * add what this codebase needs on top.
 */
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'next-env.d.ts',
      'supabase/.temp/**',
      // Scratch QA scripts are dot-prefixed and never shipped.
      'scripts/.*',
      // Claude Code lifecycle hooks: plain CommonJS for the Node runtime that
      // executes them, not part of the app's module graph.
      '.claude/hooks/**',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // An unused name prefixed with _ is a deliberate placeholder — the
      // Server Action signature `(_prev, formData)` is the common case.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
]

export default config
