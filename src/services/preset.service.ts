import 'server-only'

import { toPresetSummary, type PresetSummary } from '@/lib/presets'
import { createClient, tryCreateClient } from '@/lib/supabase/server'
import type { PresetKind, PresetRow } from '@/types/database'

/**
 * Preset reads.
 *
 * Presets are a public catalogue (`presets_select_all` covers anon), so the
 * user-scoped client is the right one even for signed-out callers — browsing
 * the gallery never needs the service-role key.
 *
 * `getPreset` returns the raw row because the create path works in database
 * shape. Everything the UI touches comes back as `PresetSummary`: camelCase,
 * `params` narrowed from `Json` to an object, and safe to hand straight to a
 * Client Component.
 *
 * Every read fails soft. An unreachable database should leave the composer
 * usable without a preset, not 500 the page.
 */

export type Preset = PresetRow

export async function getPreset(id: string): Promise<Preset | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('presets')
    .select('*')
    .eq('id', id)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    console.error('[preset.service] getPreset failed:', error.message)
    return null
  }
  return data
}

/**
 * The whole catalogue, shaped for the browser.
 *
 * One query serves the studio layout, which puts the result in context for the
 * composer's picker, the gallery and the job cards — so browsing presets costs
 * no extra round trip and a card can name the preset that produced it.
 *
 * `kind` then `sort_order` is the curated order: motion before style, and
 * within each kind the order the catalogue file declares. `title` only breaks
 * ties so the list can never reorder itself between renders.
 */
export async function listPresetCatalogue(kind?: PresetKind): Promise<PresetSummary[]> {
  // The studio shell renders this before anything else, so an unconfigured
  // deployment must get an empty catalogue rather than a thrown 500.
  const supabase = await tryCreateClient()
  if (!supabase) return []
  let query = supabase.from('presets').select('*').eq('is_active', true)
  if (kind) query = query.eq('kind', kind)

  const { data, error } = await query
    .order('kind', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true })

  if (error) {
    console.error('[preset.service] listPresetCatalogue failed:', error.message)
    return []
  }
  return (data ?? []).map(toPresetSummary)
}

/** A single preset by its stable slug — what a `?preset=` deep link carries. */
export async function getPresetBySlug(slug: string): Promise<PresetSummary | null> {
  const supabase = await tryCreateClient()
  if (!supabase) return null
  const { data, error } = await supabase
    .from('presets')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    console.error('[preset.service] getPresetBySlug failed:', error.message)
    return null
  }
  return data ? toPresetSummary(data) : null
}

/**
 * A single preset by id, shaped for the browser.
 *
 * `getPreset` above returns the raw row because the create path works in
 * database shape; this is the same lookup for a surface that has an id in hand
 * and needs to hand a preset to a Client Component — the remix loader, which
 * starts from a generation's `preset_id`.
 */
export async function getPresetById(id: string): Promise<PresetSummary | null> {
  const row = await getPreset(id)
  return row ? toPresetSummary(row) : null
}
