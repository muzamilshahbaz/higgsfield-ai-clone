import 'server-only'

import { cache } from 'react'

import { DEFAULT_SETTINGS, resolveSettings, type SettingBag, type SiteSettings } from '@/lib/cms/settings'
import { cmsAdminClient, cmsReadClient } from '@/lib/supabase/cms'
import type { AppSettingRow } from '@/types/cms'
import type { Json } from '@/types/database'

/**
 * Application settings.
 *
 * Two readers, and the difference is who is asking.
 *
 *   `getSettings()` is the one every page uses. It reads through the RLS-bound
 *   client, so the `app_settings_select_public` policy limits it to rows marked
 *   public and not secret — which means a page cannot leak a setting by
 *   forgetting a filter, because the filter is in the database.
 *
 *   `listAllSettings()` is the admin's. It reads through the service role, gets
 *   everything, and is only reachable from a Server Action behind
 *   `requireCapability('settings:read')`.
 *
 * `getSettings` is wrapped in `cache()`, so the root layout, the landing page and
 * the footer share one query per request rather than three. It is per-request, not
 * process-wide: an edit in the admin panel is live on the next navigation.
 */

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * The resolved settings for this request.
 *
 * Never throws and never returns a partial object. An unconfigured or unreachable
 * database resolves to `DEFAULT_SETTINGS`, which is the values the app shipped
 * with — so the failure mode is "the site looks like it did before anyone opened
 * the admin panel", not a 500 or a page of empty strings.
 */
export const getSettings = cache(async (): Promise<SiteSettings> => {
  const supabase = await cmsReadClient()
  if (!supabase) return DEFAULT_SETTINGS

  const { data, error } = await supabase.from('app_settings').select('key, value')

  if (error) {
    console.error('[settings.service] read failed, using defaults:', error.message)
    return DEFAULT_SETTINGS
  }

  const bag: SettingBag = new Map((data ?? []).map((row) => [row.key, row.value]))
  return resolveSettings(bag)
})

/**
 * Settings including the non-public ones. Admin only.
 *
 * `value` is returned as stored. Rows flagged `is_secret` come back with their
 * value replaced, because the caller of this is a form renderer and a secret that
 * reaches a form has reached a browser. Nothing in this schema stores a
 * credential in `app_settings` — vendor keys live sealed in `app_provider_keys` —
 * but the flag exists so that a future row cannot accidentally be the exception.
 */
export async function listAllSettings(): Promise<AppSettingRow[]> {
  const { data, error } = await cmsAdminClient()
    .from('app_settings')
    .select('*')
    .order('category', { ascending: true })
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('[settings.service] admin read failed:', error.message)
    return []
  }

  return (data ?? []).map((row) =>
    row.is_secret ? { ...row, value: '[redacted]' as Json } : row,
  )
}

/**
 * The full resolved object from the admin's point of view.
 *
 * Reads every row rather than the public ones, so the Settings, Branding and
 * Theme screens show what is actually stored — including the generation defaults
 * and limits, which are not public and would otherwise render as the code-level
 * fallback and quietly overwrite the real value on save.
 */
export async function getSettingsForAdmin(): Promise<SiteSettings> {
  const { data, error } = await cmsAdminClient().from('app_settings').select('key, value')

  if (error) {
    console.error('[settings.service] admin resolve failed:', error.message)
    return DEFAULT_SETTINGS
  }

  const bag: SettingBag = new Map((data ?? []).map((row) => [row.key, row.value]))
  return resolveSettings(bag)
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export interface SettingWrite {
  key: string
  value: Json
}

/**
 * Writes settings, one round trip, and returns what the values were.
 *
 * The `before` map is the point. Every caller is an audited action, and an audit
 * row that records only the new value answers half the question — "it says
 * 1200 now" is not the same as "somebody changed it from 400". Reading first
 * costs one query and makes the trail useful.
 *
 * `upsert` rather than `update`: a settings key that is not in the seed (a newer
 * deploy's, or one added by hand) should be writable rather than silently
 * discarded. The `app_settings_key_shape` constraint is what stops that becoming
 * a junk drawer.
 */
export async function writeSettings(
  writes: SettingWrite[],
  actorId: string,
): Promise<{ ok: true; before: Record<string, Json> } | { ok: false; error: string }> {
  if (writes.length === 0) return { ok: true, before: {} }

  const client = cmsAdminClient()
  const keys = writes.map((write) => write.key)

  const { data: existing, error: readError } = await client
    .from('app_settings')
    .select('key, value, category, label')
    .in('key', keys)

  if (readError) {
    console.error('[settings.service] pre-read failed:', readError.message)
    return { ok: false, error: 'Could not read the current settings.' }
  }

  const known = new Map((existing ?? []).map((row) => [row.key, row]))
  const before: Record<string, Json> = {}
  for (const row of existing ?? []) before[row.key] = row.value

  const rows = writes.map((write) => {
    const current = known.get(write.key)
    return {
      key: write.key,
      value: write.value,
      // Preserve the metadata on an existing row. Sending a default here would
      // reset every label and category in the panel on the first save.
      category: current?.category ?? 'general',
      label: current?.label ?? write.key,
      updated_by: actorId,
    }
  })

  const { error } = await client.from('app_settings').upsert(rows, { onConflict: 'key' })

  if (error) {
    console.error('[settings.service] write failed:', error.message)
    return { ok: false, error: 'Could not save those settings.' }
  }

  return { ok: true, before }
}
