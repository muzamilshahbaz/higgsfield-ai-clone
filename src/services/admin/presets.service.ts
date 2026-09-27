import 'server-only'

import { audit } from '@/lib/admin/audit'
import type { AdminActor, AdminResult } from '@/lib/admin/guard'
import { getModel } from '@/lib/ai/registry'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json, PresetKind, PresetRow } from '@/types/database'

/**
 * Prompt presets, from the admin panel.
 *
 * `presets` predates the CMS — it is in the application schema, publicly readable
 * for active rows, and written by the seed script. This file is the second writer,
 * and it keeps the one rule that matters for a preset:
 *
 *   `model_id` must name a model in lib/ai/registry.ts.
 *
 * A preset whose model does not exist is a preset that fails at Generate with
 * "That model no longer exists", after the user has chosen it and typed a prompt.
 * There is no database constraint that can catch it — the registry is code — so it
 * is checked here, on the way in, where the operator can still fix it.
 *
 * `prompt_fragment` is the interesting field. It is hidden prompt engineering
 * appended to whatever the user wrote, so an edit here changes what every future
 * generation using this preset actually asks for. The audit diff records it.
 */

export interface PresetQuery {
  search?: string
  kind?: PresetKind
  category?: string
  includeInactive?: boolean
  limit?: number
  offset?: number
}

export async function listPresets(
  query: PresetQuery = {},
): Promise<{ presets: PresetRow[]; total: number }> {
  const { search, kind, category, includeInactive = true, limit = 60, offset = 0 } = query

  let builder = createAdminClient().from('presets').select('*', { count: 'exact' })

  if (!includeInactive) builder = builder.eq('is_active', true)
  if (kind) builder = builder.eq('kind', kind)
  if (category) builder = builder.eq('category', category)
  if (search?.trim()) {
    const pattern = `%${search.trim()}%`
    builder = builder.or(`title.ilike.${pattern},slug.ilike.${pattern},description.ilike.${pattern}`)
  }

  const { data, error, count } = await builder
    .order('kind', { ascending: true })
    .order('sort_order', { ascending: true })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('[presets.service] list failed:', error.message)
    return { presets: [], total: 0 }
  }

  return { presets: data ?? [], total: count ?? 0 }
}

export async function getPresetRow(id: string): Promise<PresetRow | null> {
  const { data, error } = await createAdminClient()
    .from('presets')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error('[presets.service] get failed:', error.message)
    return null
  }
  return data
}

/** Categories actually in use, for the filter bar and the form's suggestions. */
export async function listPresetCategories(): Promise<string[]> {
  const { data, error } = await createAdminClient().from('presets').select('category')
  if (error) {
    console.error('[presets.service] categories failed:', error.message)
    return []
  }
  return [...new Set((data ?? []).map((row) => row.category))].sort()
}

export interface PresetInput {
  slug: string
  title: string
  description?: string | null
  kind: PresetKind
  category: string
  promptFragment: string
  negativePrompt?: string | null
  modelId: string
  params?: Json
  previewVideoUrl?: string | null
  previewPosterUrl?: string | null
  accent?: string | null
  creditCost?: number
  sortOrder?: number
  isFeatured?: boolean
  isActive?: boolean
}

/**
 * The checks a preset has to pass before it reaches Postgres.
 *
 * Only two of these have database constraints behind them (`slug` uniqueness and
 * `credit_cost >= 0`); the rest are conditions the schema cannot express. Running
 * them here means an operator gets a sentence under the field instead of a
 * constraint name in a toast.
 */
function validate(input: PresetInput): { ok: true } | { ok: false; error: string; field: string } {
  if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(input.slug)) {
    return {
      ok: false,
      field: 'slug',
      error: 'Use lower-case letters, numbers and hyphens — this is the `?preset=` deep link.',
    }
  }
  if (!input.title.trim()) return { ok: false, field: 'title', error: 'Give it a title.' }
  if (!input.category.trim()) return { ok: false, field: 'category', error: 'Pick a category.' }
  if (!input.promptFragment.trim()) {
    return {
      ok: false,
      field: 'promptFragment',
      error: 'The prompt fragment is what the preset actually does. It cannot be empty.',
    }
  }
  if (!getModel(input.modelId)) {
    return {
      ok: false,
      field: 'modelId',
      error: 'That model is not in the registry. A preset pointing at one would fail at Generate.',
    }
  }
  if ((input.creditCost ?? 0) < 0) {
    return { ok: false, field: 'creditCost', error: 'A credit cost cannot be negative.' }
  }
  return { ok: true }
}

function toRow(input: PresetInput) {
  return {
    slug: input.slug.trim(),
    title: input.title.trim(),
    description: input.description?.trim() || null,
    kind: input.kind,
    category: input.category.trim(),
    prompt_fragment: input.promptFragment.trim(),
    negative_prompt: input.negativePrompt?.trim() || null,
    model_id: input.modelId,
    params: input.params ?? {},
    preview_video_url: input.previewVideoUrl?.trim() || null,
    preview_poster_url: input.previewPosterUrl?.trim() || null,
    accent: input.accent?.trim() || null,
    credit_cost: input.creditCost ?? 0,
    sort_order: input.sortOrder ?? 0,
    is_featured: input.isFeatured ?? false,
    is_active: input.isActive ?? true,
  }
}

export async function createPreset(
  input: PresetInput,
  actor: AdminActor,
): Promise<AdminResult<PresetRow>> {
  const check = validate(input)
  if (!check.ok) return { ok: false, error: check.error, field: check.field }

  const { data, error } = await createAdminClient()
    .from('presets')
    .insert(toRow(input))
    .select('*')
    .single()

  if (error || !data) {
    console.error('[presets.service] create failed:', error?.message)
    if (error?.code === '23505') {
      return { ok: false, error: 'A preset already uses that slug.', field: 'slug' }
    }
    return { ok: false, error: 'Could not create that preset.' }
  }

  await audit({
    actor,
    action: 'create',
    entity: 'preset',
    entityId: data.id,
    summary: `Created the ${data.kind} preset “${data.title}” on ${data.model_id}`,
    after: data as unknown as Record<string, unknown>,
  })

  return { ok: true, data }
}

export async function updatePreset(
  id: string,
  input: PresetInput,
  actor: AdminActor,
): Promise<AdminResult<PresetRow>> {
  const check = validate(input)
  if (!check.ok) return { ok: false, error: check.error, field: check.field }

  const before = await getPresetRow(id)
  if (!before) return { ok: false, error: 'That preset no longer exists.' }

  const { data, error } = await createAdminClient()
    .from('presets')
    .update(toRow(input))
    .eq('id', id)
    .select('*')
    .single()

  if (error || !data) {
    console.error('[presets.service] update failed:', error?.message)
    if (error?.code === '23505') {
      return { ok: false, error: 'Another preset already uses that slug.', field: 'slug' }
    }
    return { ok: false, error: 'Could not save that preset.' }
  }

  await audit({
    actor,
    action: 'update',
    entity: 'preset',
    entityId: id,
    summary: `Edited the preset “${data.title}”`,
    before: before as unknown as Record<string, unknown>,
    after: data as unknown as Record<string, unknown>,
  })

  return { ok: true, data }
}

export async function setPresetActive(
  id: string,
  active: boolean,
  actor: AdminActor,
): Promise<AdminResult<null>> {
  const before = await getPresetRow(id)
  if (!before) return { ok: false, error: 'That preset no longer exists.' }

  const { error } = await createAdminClient()
    .from('presets')
    .update({ is_active: active })
    .eq('id', id)

  if (error) {
    console.error('[presets.service] toggle failed:', error.message)
    return { ok: false, error: 'Could not change that.' }
  }

  await audit({
    actor,
    action: active ? 'enable' : 'disable',
    entity: 'preset',
    entityId: id,
    summary: `${active ? 'Activated' : 'Retired'} the preset “${before.title}”`,
    before: { is_active: before.is_active },
    after: { is_active: active },
  })

  return { ok: true, data: null }
}

export async function setPresetFeatured(
  id: string,
  featured: boolean,
  actor: AdminActor,
): Promise<AdminResult<null>> {
  const before = await getPresetRow(id)
  if (!before) return { ok: false, error: 'That preset no longer exists.' }

  const { error } = await createAdminClient()
    .from('presets')
    .update({ is_featured: featured })
    .eq('id', id)

  if (error) {
    console.error('[presets.service] feature failed:', error.message)
    return { ok: false, error: 'Could not change that.' }
  }

  await audit({
    actor,
    action: featured ? 'feature' : 'unfeature',
    entity: 'preset',
    entityId: id,
    summary: `${featured ? 'Featured' : 'Unfeatured'} the preset “${before.title}”`,
    before: { is_featured: before.is_featured },
    after: { is_featured: featured },
  })

  return { ok: true, data: null }
}

/**
 * Retires a preset rather than deleting it.
 *
 * `generations.preset_id` is `on delete set null`, so a hard delete would quietly
 * break the lineage of every shot made with it: the history row would stop being
 * able to say which preset produced it, and remix would lose the camera move.
 * Deactivating removes it from every browse surface — `presets_select_all` is
 * `using (is_active)` — and keeps that link intact.
 *
 * The admin UI calls this "Retire" and says why on the button.
 */
export async function retirePreset(id: string, actor: AdminActor): Promise<AdminResult<null>> {
  return setPresetActive(id, false, actor)
}

/**
 * Deletes a preset outright. Only offered for one that nothing has used.
 *
 * Checked with a count rather than trusted: a preset created by mistake should be
 * removable, and one with history should not be — and the difference is a query.
 */
export async function deletePreset(id: string, actor: AdminActor): Promise<AdminResult<null>> {
  const before = await getPresetRow(id)
  if (!before) return { ok: false, error: 'That preset no longer exists.' }

  const admin = createAdminClient()

  const { count, error: countError } = await admin
    .from('generations')
    .select('id', { count: 'exact', head: true })
    .eq('preset_id', id)

  if (countError) {
    console.error('[presets.service] usage count failed:', countError.message)
    return { ok: false, error: 'Could not check whether anything uses that preset.' }
  }

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `${count} generation(s) were made with this preset, so deleting it would break their lineage. Retire it instead.`,
    }
  }

  const { error } = await admin.from('presets').delete().eq('id', id)

  if (error) {
    console.error('[presets.service] delete failed:', error.message)
    return { ok: false, error: 'Could not delete that preset.' }
  }

  await audit({
    actor,
    action: 'delete',
    entity: 'preset',
    entityId: id,
    summary: `Deleted the unused preset “${before.title}”`,
    before: before as unknown as Record<string, unknown>,
  })

  return { ok: true, data: null }
}
