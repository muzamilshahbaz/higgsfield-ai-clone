import 'server-only'

import { cache } from 'react'

import { PROVIDERS, type ProviderDescriptor } from '@/lib/ai/catalogue'
import { creditCostFor, MODELS, primaryProvider, type ModelEntry } from '@/lib/ai/registry'
import { canGenerateWith } from '@/services/ai/ai-router'
import { cmsAdminClient, cmsReadClient } from '@/lib/supabase/cms'
import type { AiModelRow, AiProviderRow } from '@/types/cms'
import type { GenerationTask, ProviderName } from '@/types/database'

/**
 * The AI catalogue, as the CMS presents it.
 *
 * The boundary this file draws is the most important one in the whole feature, so
 * it is worth stating plainly:
 *
 *   lib/ai/registry.ts decides what a model IS — which providers can serve it,
 *   what it costs in credits, what aspect ratios and durations it supports. Those
 *   are execution facts. They are unit tested, they are what the composer charges
 *   against, and nothing in the admin panel can change them.
 *
 *   `ai_providers` and `ai_models` decide what a visitor is TOLD — the name on the
 *   card, the description, the image, the tags, the order, whether it appears on
 *   the landing page at all.
 *
 * Letting an editor reprice a render from a CMS form is a way to lose money, not
 * a feature. So the merged shapes below carry the presentation from the database
 * and the numbers from the registry, and a row for a model the registry has
 * retired is skipped rather than rendered with no price.
 *
 * `status = 'hidden'` is likewise a display state. It removes a model from the
 * landing roster and from the admin's featured lists; it does NOT remove it from
 * the composer, because a preset that references a model needs that model to stay
 * runnable or the preset breaks. The admin form says so on the field.
 */

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

export interface ProviderView {
  id: ProviderName
  label: string
  description: string
  logoUrl: string | null
  media: 'image' | 'video' | 'both'
  consoleUrl: string | null
  docsUrl: string | null
  isRecommended: boolean
  isEnabled: boolean
  /** True when a driver ships for it AND a model in the registry names it. */
  generationReady: boolean
  status: string
  sortOrder: number
}

/**
 * The descriptor merged with its database row.
 *
 * `generationReady` is recomputed from the code rather than read from the column,
 * always. A driver either exists in services/ai/providers/ or it does not, and a
 * switch in an admin form that claimed otherwise would produce jobs that fail and
 * refund. The column exists so the admin table can render it; this is what
 * decides it.
 */
function mergeProvider(descriptor: ProviderDescriptor, row?: AiProviderRow): ProviderView {
  return {
    id: descriptor.id,
    label: row?.label || descriptor.label,
    description: row?.description || descriptor.blurb,
    logoUrl: row?.logo_url ?? null,
    media: (row?.media as ProviderView['media']) ?? descriptor.media,
    consoleUrl: row?.console_url ?? descriptor.consoleUrl,
    docsUrl: row?.docs_url ?? null,
    isRecommended: row?.is_recommended ?? false,
    isEnabled: row?.is_enabled ?? true,
    generationReady: canGenerateWith(descriptor.id) && descriptor.generationReady,
    status: row?.status ?? 'active',
    sortOrder: row?.sort_order ?? 0,
  }
}

/**
 * Every connectable provider, merged, in the operator's order.
 *
 * Driven by the code catalogue rather than by the table: a vendor with no row
 * still appears, using its descriptor, so adding one to lib/ai/catalogue.ts does
 * not require a seed before the settings page lists it.
 */
export const getProviderViews = cache(async (): Promise<ProviderView[]> => {
  const supabase = await cmsReadClient()
  if (!supabase) return PROVIDERS.map((descriptor) => mergeProvider(descriptor))

  const { data, error } = await supabase.from('ai_providers').select('*')
  if (error) {
    console.error('[catalogue.service] provider read failed:', error.message)
    return PROVIDERS.map((descriptor) => mergeProvider(descriptor))
  }

  const rows = new Map((data ?? []).map((row) => [row.id, row]))

  return PROVIDERS.map((descriptor) => mergeProvider(descriptor, rows.get(descriptor.id)))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
})

/** The ones a visitor should be shown: enabled, and not deprecated. */
export async function getPublicProviders(): Promise<ProviderView[]> {
  const views = await getProviderViews()
  return views.filter((view) => view.isEnabled && view.status !== 'disabled')
}

/** Every provider row as stored. Admin only; includes disabled ones. */
export async function listProviderRows(): Promise<AiProviderRow[]> {
  const { data, error } = await cmsAdminClient()
    .from('ai_providers')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('[catalogue.service] admin provider read failed:', error.message)
    return []
  }
  return data ?? []
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

export interface ModelView {
  id: string
  label: string
  description: string
  /** The open model underneath, named plainly. From the row, or the registry. */
  basis: string
  useCase: string | null
  imageUrl: string | null
  category: string | null
  tags: string[]
  capabilities: string[]
  inputTypes: string[]
  outputTypes: string[]
  isRecommended: boolean
  isFeatured: boolean
  showOnLanding: boolean
  status: string
  sortOrder: number

  // ---- From the registry, and only from the registry ----
  task: GenerationTask
  /** The live credit price. Never editable from the CMS; see the file header. */
  credits: number
  avgLatencySec: number
  /** The vendor the badge names: the first route, which the router tries first. */
  provider: ProviderName
  providers: ProviderName[]
  aspectRatios: string[]
  durations: number[]
}

function mergeModel(entry: ModelEntry, row?: AiModelRow): ModelView {
  return {
    id: entry.id,
    label: row?.label || entry.label,
    description: row?.description || entry.blurb,
    basis: row?.basis || entry.family,
    useCase: row?.use_case ?? null,
    imageUrl: row?.image_url ?? null,
    category: row?.category ?? (entry.task === 'text_to_image' ? 'image' : 'video'),
    tags: row?.tags ?? [],
    capabilities: row?.capabilities ?? [entry.task],
    inputTypes: row?.input_types ?? (entry.supports.imageInput ? ['text', 'image'] : ['text']),
    outputTypes: row?.output_types ?? [entry.task === 'text_to_image' ? 'image' : 'video'],
    isRecommended: row?.is_recommended ?? Boolean(entry.featured),
    isFeatured: row?.is_featured ?? Boolean(entry.featured),
    showOnLanding: row?.show_on_landing ?? true,
    status: row?.status ?? 'active',
    sortOrder: row?.sort_order ?? 0,

    task: entry.task,
    credits: entry.credits,
    avgLatencySec: entry.avgLatencySec,
    provider: primaryProvider(entry),
    providers: entry.routes.map((route) => route.provider),
    aspectRatios: entry.supports.aspectRatios,
    durations: entry.supports.durations ?? [],
  }
}

/**
 * Every registry model, merged with its row.
 *
 * Driven by `MODELS`, not by the table — so a row for an id the registry no
 * longer has simply has nothing to merge onto and disappears, which is the
 * correct outcome: a marketing card for a model that cannot run is worse than no
 * card.
 */
export const getModelViews = cache(async (): Promise<ModelView[]> => {
  const supabase = await cmsReadClient()
  if (!supabase) return MODELS.map((entry) => mergeModel(entry))

  const { data, error } = await supabase.from('ai_models').select('*')
  if (error) {
    console.error('[catalogue.service] model read failed:', error.message)
    return MODELS.map((entry) => mergeModel(entry))
  }

  const rows = new Map((data ?? []).map((row) => [row.id, row]))

  return MODELS.map((entry) => mergeModel(entry, rows.get(entry.id))).sort(
    (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label),
  )
})

/** The roster the landing page lists, grouped by task in the page's order. */
export async function getLandingModels(): Promise<ModelView[]> {
  const views = await getModelViews()
  return views.filter((view) => view.showOnLanding && view.status !== 'hidden')
}

/** The showcase cards: featured, landing-visible, in order. */
export async function getFeaturedModels(): Promise<ModelView[]> {
  const views = await getLandingModels()
  return views.filter((view) => view.isFeatured)
}

/**
 * What a ten-second pass of this model costs.
 *
 * Exposed so the admin model screen can show the same figure the composer would
 * charge for a long render, computed by the registry's own `creditCostFor` rather
 * than by multiplying in a component.
 */
export function longestDurationCost(view: ModelView): number | null {
  if (view.durations.length === 0) return null
  const entry = MODELS.find((model) => model.id === view.id)
  if (!entry) return null
  return creditCostFor(entry, Math.max(...view.durations))
}

/** Every model row as stored. Admin only. */
export async function listModelRows(): Promise<AiModelRow[]> {
  const { data, error } = await cmsAdminClient()
    .from('ai_models')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('[catalogue.service] admin model read failed:', error.message)
    return []
  }
  return data ?? []
}

/**
 * Registry ids with no row yet.
 *
 * The admin screen offers these as "not yet described", so a model added to the
 * registry is visible as needing copy rather than quietly inheriting its blurb
 * forever.
 */
export async function undescribedModelIds(): Promise<string[]> {
  const rows = await listModelRows()
  const described = new Set(rows.map((row) => row.id))
  return MODELS.filter((entry) => !described.has(entry.id)).map((entry) => entry.id)
}
