/**
 * Stand-in for the `server-only` package under Vitest.
 *
 * The real package exports nothing and exists purely so that Next's bundler
 * errors when a server module is imported from a Client Component. Vitest has
 * no such bundler, so importing it fails to resolve — this empty module keeps
 * the guard in the app while letting the module be tested.
 */
export {}
