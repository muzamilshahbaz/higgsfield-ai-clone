import { creditCostFor, type ModelEntry } from '@/lib/ai/registry'
import type { PresetKind, PresetRow } from '@/types/database'

/**
 * Preset resolution — the one place a preset turns into generation input.
 *
 * Both sides of the wire import this file. The composer uses it to show what
 * the job will actually cost and what prompt will actually be sent, and
 * `generation.service` uses it to write the row. If the two ever disagreed the
 * user would be quoted one price and charged another, so neither is allowed
 * its own copy of the rules.
 *
 * Deliberately free of `server-only` and of any Supabase import: it is pure
 * over its arguments.
 */

// ---------------------------------------------------------------------------
// The client-safe shape
// ---------------------------------------------------------------------------

/**
 * A preset as the browser sees it.
 *
 * A camelCase projection of `PresetRow` minus the columns the UI has no use
 * for (`is_active`, `sort_order`, `created_at`) — ordering is already applied
 * by the query, and an inactive preset never leaves the service.
 */
export interface PresetSummary {
  id: string
  slug: string
  title: string
  description: string | null
  kind: PresetKind
  category: string
  promptFragment: string
  negativePrompt: string | null
  modelId: string
  params: Record<string, unknown>
  previewUrl: string | null
  posterUrl: string | null
  accent: string | null
  creditCost: number
  isFeatured: boolean
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function toPresetSummary(row: PresetRow): PresetSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    kind: row.kind,
    category: row.category,
    promptFragment: row.prompt_fragment,
    negativePrompt: row.negative_prompt,
    modelId: row.model_id,
    params: isRecord(row.params) ? row.params : {},
    previewUrl: row.preview_video_url,
    posterUrl: row.preview_poster_url ?? row.preview_video_url,
    accent: row.accent,
    creditCost: row.credit_cost,
    isFeatured: row.is_featured,
  }
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/** What the resolver needs from a preset — satisfied by PresetSummary and by PresetRow. */
export interface PresetLike {
  promptFragment: string
  negativePrompt: string | null
  params: Record<string, unknown>
  creditCost: number
}

export function presetLikeFromRow(row: PresetRow): PresetLike {
  return {
    promptFragment: row.prompt_fragment,
    negativePrompt: row.negative_prompt,
    params: isRecord(row.params) ? row.params : {},
    creditCost: row.credit_cost,
  }
}

/**
 * The prompt that reaches the provider: what the user typed, then the preset's
 * fragment. User intent leads; the preset is the cinematography note after it.
 */
export function resolvePrompt(prompt: string, preset?: PresetLike | null): string {
  return [prompt.trim(), preset?.promptFragment.trim()]
    .filter((part): part is string => Boolean(part))
    .join(', ')
}

/**
 * A typed negative prompt wins over the preset's; both are dropped for a model
 * that does not read them, so we never send a field the provider will reject.
 */
export function resolveNegativePrompt(
  model: Pick<ModelEntry, 'supports'>,
  typed?: string | null,
  preset?: PresetLike | null,
): string | null {
  if (!model.supports.negativePrompt) return null
  return typed?.trim() || preset?.negativePrompt?.trim() || null
}

/** Preset params override the model's defaults, key by key. */
export function resolveParams(
  model: Pick<ModelEntry, 'defaults'>,
  preset?: PresetLike | null,
): Record<string, unknown> {
  return { ...(model.defaults ?? {}), ...(preset?.params ?? {}) }
}

/**
 * Model price for the chosen duration, plus the preset's surcharge.
 * A surcharge covers presets that ask for more steps or a longer render than
 * the model's own default, which the provider bills for.
 */
export function resolveCreditCost(
  model: ModelEntry,
  durationSec?: number | null,
  preset?: PresetLike | null,
): number {
  return creditCostFor(model, durationSec) + (preset?.creditCost ?? 0)
}

// ---------------------------------------------------------------------------
// Catalogue helpers (UI)
// ---------------------------------------------------------------------------

export const PRESET_KIND_LABELS: Record<PresetKind, string> = {
  motion: 'Motion',
  style: 'Style',
}

export const PRESET_KIND_HINTS: Record<PresetKind, string> = {
  motion: 'Camera moves and effects that turn a frame into a shot.',
  style: 'Film stocks, palettes and looks for still frames.',
}

/** Distinct categories within a kind, in the order the presets are given. */
export function categoriesOf(presets: PresetSummary[]): string[] {
  return [...new Set(presets.map((preset) => preset.category))]
}

/** Title-cases a raw category slug for display: `vfx` is kept upper. */
export function formatCategory(category: string): string {
  if (category.length <= 3) return category.toUpperCase()
  return category.charAt(0).toUpperCase() + category.slice(1)
}

/** Case-insensitive match across the fields a user would actually type. */
export function matchesQuery(preset: PresetSummary, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true

  return [preset.title, preset.description ?? '', preset.category, preset.promptFragment].some(
    (field) => field.toLowerCase().includes(needle),
  )
}
