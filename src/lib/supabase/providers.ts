import 'server-only'

import { env } from '@/lib/env'

/**
 * Which external auth providers the Supabase project actually has enabled.
 *
 * Supabase exposes this on an unauthenticated settings endpoint. We read it so
 * the sign-in page can show the Google button only when Google will really
 * work — a button that always 400s is worse than no button, and enabling the
 * provider later needs no code change.
 *
 * Failures are non-fatal: if the check cannot be made we assume no external
 * providers, so the page still renders with email/password.
 */

export interface AuthProviderAvailability {
  google: boolean
  email: boolean
}

const FALLBACK: AuthProviderAvailability = { google: false, email: true }

export async function getEnabledAuthProviders(): Promise<AuthProviderAvailability> {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return FALLBACK

  try {
    const response = await fetch(`${env.supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: env.supabaseAnonKey },
      // Cheap and slow-moving: re-check every 5 minutes rather than per render.
      next: { revalidate: 300 },
    })

    if (!response.ok) return FALLBACK

    const settings = (await response.json()) as {
      external?: Record<string, boolean>
    }

    return {
      google: settings.external?.google === true,
      email: settings.external?.email !== false,
    }
  } catch {
    return FALLBACK
  }
}
