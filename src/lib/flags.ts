import 'server-only'

import { cache } from 'react'

import { cmsReadClient } from '@/lib/supabase/cms'

/**
 * Feature flags.
 *
 * The contract, in one line: an unreadable flag table must not switch the
 * product off. Every lookup falls back to the default in `FLAG_DEFAULTS`, and
 * every default is the behaviour this app shipped with — so a database outage
 * degrades to "everything works as it did", never to "Explore is gone and
 * maintenance mode is on".
 *
 * That direction is the whole reason `maintenance_mode` defaults to false while
 * everything else defaults to true. A flag read that fails open on a kill switch
 * would take the site down on a transient error.
 *
 * `cache()` dedupes the read across a render pass, so a page that checks four
 * flags issues one query. It is per-request, not a module-level cache: a flag
 * flipped in the admin panel takes effect on the next navigation, which is what
 * an operator expects after pressing a switch.
 */

export type FlagKey =
  | 'explore'
  | 'generation'
  | 'billing'
  | 'providers'
  | 'registration'
  | 'comments'
  | 'downloads'
  | 'likes'
  | 'announcements'
  | 'testimonials'
  | 'maintenance_mode'

/**
 * What each flag means when the database has nothing to say.
 *
 * Exhaustive by type, so adding a key to `FlagKey` without deciding its
 * fallback is a compile error rather than an `undefined` that coerces to false.
 */
export const FLAG_DEFAULTS: Record<FlagKey, boolean> = {
  explore: true,
  generation: true,
  billing: true,
  providers: true,
  registration: true,
  comments: true,
  downloads: true,
  likes: true,
  announcements: true,
  testimonials: true,
  // The one that fails closed, because failing open on a kill switch means a
  // dropped connection takes the studio offline.
  maintenance_mode: false,
}

export type FlagMap = Record<FlagKey, boolean>

const FLAG_KEYS = Object.keys(FLAG_DEFAULTS) as FlagKey[]

function isFlagKey(key: string): key is FlagKey {
  return (FLAG_KEYS as string[]).includes(key)
}

/**
 * Every flag, merged over the defaults. One query per request.
 *
 * Read through the RLS-bound client: `feature_flags` grants SELECT to anon
 * because a signed-out visitor's landing page needs to know whether Explore is
 * on. There is no write policy, so this client cannot change one.
 */
export const getFlags = cache(async (): Promise<FlagMap> => {
  const resolved: FlagMap = { ...FLAG_DEFAULTS }

  const supabase = await cmsReadClient()
  if (!supabase) return resolved

  const { data, error } = await supabase.from('feature_flags').select('key, enabled')

  if (error) {
    console.error('[flags] read failed, using defaults:', error.message)
    return resolved
  }

  for (const row of data ?? []) {
    // A row for a key this build does not know is ignored rather than merged in:
    // it is a flag from a newer deploy, and nothing here would read it anyway.
    if (isFlagKey(row.key)) resolved[row.key] = row.enabled
  }

  return resolved
})

/** One flag. Sugar over `getFlags`, and free because of the request cache. */
export async function isEnabled(key: FlagKey): Promise<boolean> {
  const flags = await getFlags()
  return flags[key]
}

/**
 * True when the studio should show a maintenance notice instead of itself.
 *
 * Staff are exempt — the person turning maintenance mode on is usually the
 * person who then needs to check whether the thing they were fixing is fixed,
 * and locking them out of their own switch is a good way to make it stay on.
 * The caller passes whether the viewer is staff; this function does not read the
 * session, so it stays usable from a layout that already has the profile.
 */
export async function isUnderMaintenance(isStaff = false): Promise<boolean> {
  if (isStaff) return false
  return isEnabled('maintenance_mode')
}
