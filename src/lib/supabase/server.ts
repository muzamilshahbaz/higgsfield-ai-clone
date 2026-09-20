import 'server-only'

import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

import { isSupabaseConfigured, requireSupabaseConfig } from '@/lib/env'
import type { Database } from '@/types/database'

type CookiesToSet = { name: string; value: string; options: CookieOptions }[]

/**
 * Server Supabase client bound to the request's cookies.
 * RLS applies — this is the client every read path should use.
 */
export async function createClient() {
  const cookieStore = await cookies()
  const { url, anonKey } = requireSupabaseConfig()

  return createServerClient<Database>(url, anonKey, {
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

/**
 * The same client, or `null` when Supabase is not configured.
 *
 * `createClient` throws on missing config, which is right for a write path —
 * failing loudly beats pretending the write landed. It is wrong for a *read*
 * on a page, because the throw propagates to an error boundary and the visitor
 * gets a 500.
 *
 * That is not hypothetical: a deploy with the Supabase variables unset served
 * 500s on /explore, /presets and every studio route, because the shell reads
 * the preset catalogue before rendering. The reads that do not require a
 * session use this and degrade to empty; the ones that do already stop at
 * `getCurrentUser`, which returns null here for the same reason.
 */
export async function tryCreateClient() {
  if (!isSupabaseConfigured) return null
  return createClient()
}

/** The signed-in user, or null. Never throws. */
export async function getCurrentUser() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return user
  } catch {
    return null
  }
}
