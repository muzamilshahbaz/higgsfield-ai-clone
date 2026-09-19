import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

import { requireServiceRoleConfig } from '@/lib/env'
import type { Database } from '@/types/database'

let cached: ReturnType<typeof createSupabaseClient<Database>> | undefined

/**
 * Service-role client. BYPASSES ROW LEVEL SECURITY.
 *
 * Allowed callers:
 *   - credits.service   (spend_credits / refund_credits)
 *   - generation.service (writing provider results back to a job)
 *   - asset.service     (persisting provider media into Storage)
 *   - scripts/seed.ts
 *
 * Never import this from a client component, and always scope queries by
 * user_id explicitly, because no policy will do it for you.
 */
export function createAdminClient() {
  if (cached) return cached
  const { url, serviceRoleKey } = requireServiceRoleConfig()

  cached = createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cached
}
