import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { PresetKind, PresetRow } from '@/types/database'

/**
 * Preset reads.
 *
 * Phase 2 needs only `getPreset`, which the composer's create path uses to
 * resolve a preset into a prompt fragment, params and any extra credit cost.
 * The picker UI and the gallery land in Phase 3 on top of `listPresets`.
 *
 * Presets are a public catalogue (`presets_select_all` covers anon), so the
 * user-scoped client is the right one even for signed-out callers.
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

export async function listPresets(kind?: PresetKind): Promise<Preset[]> {
  const supabase = await createClient()
  let query = supabase.from('presets').select('*').eq('is_active', true)
  if (kind) query = query.eq('kind', kind)

  const { data, error } = await query
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true })

  if (error) {
    console.error('[preset.service] listPresets failed:', error.message)
    return []
  }
  return data ?? []
}
