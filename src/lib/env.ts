/**
 * Environment access.
 *
 * Deliberately non-throwing at import time: a fresh clone with no .env.local
 * still boots and renders a clear "connect Supabase" state instead of crashing
 * the whole app with a module-level exception.
 */

const PLACEHOLDER_HINTS = ['your-project-ref', 'your-anon-key', 'your-service-role-key']

/**
 * Every `process.env.X` below is written out in full, never `process.env[name]`.
 *
 * Next.js inlines `NEXT_PUBLIC_*` into the browser bundle by substituting the
 * literal text at build time. A computed key is not text it can match, so a
 * lookup helper leaves the browser with `undefined` and the client Supabase
 * client silently reports "not configured" — which is exactly what happened
 * before this comment existed. Non-public names stay undefined in the browser
 * by the same mechanism, which is what we want.
 */
function clean(value: string | undefined): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (PLACEHOLDER_HINTS.some((hint) => trimmed.includes(hint))) return undefined
  return trimmed
}

export const env = {
  supabaseUrl: clean(process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  supabaseServiceRoleKey: clean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  siteUrl: clean(process.env.NEXT_PUBLIC_SITE_URL) ?? 'http://localhost:3000',
  aiProvider: (clean(process.env.AI_PROVIDER) ?? 'mock') as 'mock' | 'fal' | 'replicate',
  falKey: clean(process.env.FAL_KEY),
  replicateToken: clean(process.env.REPLICATE_API_TOKEN),
  cronSecret: clean(process.env.CRON_SECRET),
} as const

/** True when the public Supabase config is present and looks real. */
export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey)

/** True when privileged server work (credits, provider writes) is possible. */
export const isServiceRoleConfigured = Boolean(env.supabaseUrl && env.supabaseServiceRoleKey)

export function requireSupabaseConfig(): { url: string; anonKey: string } {
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error(
      'Supabase is not configured. Copy .env.example to .env.local and set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    )
  }
  return { url: env.supabaseUrl, anonKey: env.supabaseAnonKey }
}

export function requireServiceRoleConfig(): { url: string; serviceRoleKey: string } {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not configured. Server-side generation work requires it.',
    )
  }
  return { url: env.supabaseUrl, serviceRoleKey: env.supabaseServiceRoleKey }
}
