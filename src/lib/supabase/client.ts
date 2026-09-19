'use client'

import { createBrowserClient } from '@supabase/ssr'

import { requireSupabaseConfig } from '@/lib/env'
import type { Database } from '@/types/database'

let cached: ReturnType<typeof createBrowserClient<Database>> | undefined

/**
 * Browser Supabase client. Carries the user's session cookie, so every query
 * it makes is subject to row level security.
 */
export function createClient() {
  if (cached) return cached
  const { url, anonKey } = requireSupabaseConfig()
  cached = createBrowserClient<Database>(url, anonKey)
  return cached
}
