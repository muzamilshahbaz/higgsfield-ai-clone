/**
 * Environment access.
 *
 * Deliberately non-throwing at import time: a fresh clone with no .env.local
 * still boots and renders a clear "connect Supabase" state instead of crashing
 * the whole app with a module-level exception.
 */

const PLACEHOLDER_HINTS = ['your-project-ref', 'your-anon-key', 'your-service-role-key']

function read(name: string): string | undefined {
  const value = process.env[name]
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (PLACEHOLDER_HINTS.some((hint) => trimmed.includes(hint))) return undefined
  return trimmed
}

export const env = {
  supabaseUrl: read('NEXT_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: read('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  supabaseServiceRoleKey: read('SUPABASE_SERVICE_ROLE_KEY'),
  siteUrl: read('NEXT_PUBLIC_SITE_URL') ?? 'http://localhost:3000',
  aiProvider: (read('AI_PROVIDER') ?? 'mock') as 'mock' | 'fal' | 'replicate',
  falKey: read('FAL_KEY'),
  replicateToken: read('REPLICATE_API_TOKEN'),
  cronSecret: read('CRON_SECRET'),
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
