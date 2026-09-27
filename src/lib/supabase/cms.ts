import 'server-only'

import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

import {
  isSupabaseConfigured,
  requireServiceRoleConfig,
  requireSupabaseConfig,
} from '@/lib/env'
import type { CmsDatabase } from '@/types/cms'

/**
 * Supabase clients bound to the CMS schema map.
 *
 * Two of them, and the difference between them is the whole security model of
 * this feature:
 *
 *   `cmsReadClient()` carries the anon key and the request's cookies, so RLS
 *   applies. It is what every public surface uses — the landing page, the
 *   branding injector, the flag reader. Migration 0016 grants those tables
 *   SELECT on their visible rows and grants no write policy to anybody, so a
 *   read path physically cannot mutate content.
 *
 *   `cmsAdminClient()` carries the service role and BYPASSES RLS. It is what
 *   the admin panel writes through, and every caller of it sits behind
 *   `requireCapability` in lib/admin/guard.ts. It is also the only way to reach
 *   `app_provider_keys`, `credit_rules`, `audit_log` and `system_logs`, which
 *   have RLS enabled with no policies at all.
 *
 * Neither is exported to a client component: this module is `server-only`, and
 * the admin UI talks to Server Actions rather than to Supabase.
 */

type CookiesToSet = { name: string; value: string; options: CookieOptions }[]

/**
 * The RLS-bound reader, or `null` when Supabase is not configured.
 *
 * Nullable rather than throwing, for the reason `tryCreateClient` is: the
 * landing page reads CMS content before rendering anything, and a deploy with
 * the Supabase variables unset must fall back to the code-level defaults in
 * lib/cms/defaults.ts rather than serve a 500. That is not hypothetical — it is
 * exactly how this app once served 500s on /explore and every studio route.
 */
export async function cmsReadClient() {
  if (!isSupabaseConfigured) return null

  const cookieStore = await cookies()
  const { url, anonKey } = requireSupabaseConfig()

  return createServerClient<CmsDatabase>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet: CookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Called from a Server Component: the middleware refreshes the
          // session instead, so this is safe to ignore.
        }
      },
    },
  })
}

let cachedAdmin: ReturnType<typeof createSupabaseClient<CmsDatabase>> | undefined

/**
 * The service-role writer. BYPASSES ROW LEVEL SECURITY.
 *
 * Throws when the service role is not configured, which is right for a write
 * path: failing loudly beats reporting that a save landed when it did not.
 *
 * Allowed callers: services/cms/* and services/admin/*, every one of which is
 * reached only through a Server Action that has already called
 * `requireCapability`. Never import this from a client component, and never
 * from a public read path — `cmsReadClient` exists for those.
 */
export function cmsAdminClient() {
  if (cachedAdmin) return cachedAdmin
  const { url, serviceRoleKey } = requireServiceRoleConfig()

  cachedAdmin = createSupabaseClient<CmsDatabase>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cachedAdmin
}
