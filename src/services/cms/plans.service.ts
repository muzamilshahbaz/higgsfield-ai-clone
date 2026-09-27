import 'server-only'

import { cache } from 'react'

import {
  isPlanId,
  isEntitled,
  PLAN_FEATURES,
  PLAN_LIST,
  PLANS,
  type Plan,
  type PlanFeature,
  type PlanId,
  type SubscriptionStatusLike,
} from '@/lib/plans'
import { cmsAdminClient, cmsReadClient } from '@/lib/supabase/cms'
import type { PlanFeatureRow, PlanRow } from '@/types/cms'

/**
 * The plan catalogue, read from the database.
 *
 * The important property: this returns the same `Plan` shape lib/plans.ts
 * declares, and falls back to `PLAN_LIST` — the literal catalogue — on a missing
 * row, an unknown id, an error or an unconfigured database. Because migration
 * 0017 seeds the table with exactly the values that file already held, applying
 * the CMS changes nothing about what anyone is charged or allowed. What it adds
 * is the ability to change those numbers without a deploy.
 *
 * Three rules this file enforces, all of them about not letting a form break the
 * money path:
 *
 *   · A row whose id is not a `PlanId` is discarded. `subscriptions.plan` is a
 *     Postgres enum, so a fourth tier could be written here but could never be
 *     assigned to anybody — it would be a pricing card that fails at checkout.
 *   · A tier missing from the table keeps its code definition rather than
 *     disappearing. Deleting the free plan row should not leave signed-out
 *     visitors with no pricing page and `planFor` with nothing to fall back to.
 *   · The entitlement rules — which statuses count as paid, how ranks compare —
 *     stay in lib/plans.ts, untouched and unit tested. This file changes where
 *     the numbers come from, never what is done with them.
 */

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * `price_usd` is `numeric(10,2)`.
 *
 * PostgREST serialises numeric as a JSON number, but numeric has arrived as a
 * string through other drivers, and a price that silently becomes `"24"` would
 * concatenate instead of adding in `priceInMinorUnits`. Coercing here costs
 * nothing and removes the class.
 */
function toPlan(row: PlanRow, fallback: Plan): Plan {
  const price = Number(row.price_usd)

  return {
    id: fallback.id,
    name: row.name || fallback.name,
    tagline: row.tagline || fallback.tagline,
    priceUsd: Number.isFinite(price) ? price : fallback.priceUsd,
    cadence: row.cadence || fallback.cadence,
    credits: row.credits ?? fallback.credits,
    maxConcurrentJobs: row.max_concurrent_jobs ?? fallback.maxConcurrentJobs,
    maxGenerationsPerHour: row.max_generations_per_hour ?? fallback.maxGenerationsPerHour,
    rank: row.rank ?? fallback.rank,
    perks: row.perks?.length ? row.perks : fallback.perks,
    featured: row.is_popular,
  }
}

/**
 * Every visible tier, cheapest first.
 *
 * Ordered by `rank` rather than by `sort_order`, because rank is what the
 * upgrade/downgrade comparison uses and a pricing page that lists tiers in a
 * different order from the one the app considers "up" is confusing in a way
 * nobody reports as a bug.
 */
export const getPlanCatalogue = cache(async (): Promise<Plan[]> => {
  const supabase = await cmsReadClient()
  if (!supabase) return PLAN_LIST

  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .order('rank', { ascending: true })

  if (error) {
    console.error('[plans.service] read failed, using the code catalogue:', error.message)
    return PLAN_LIST
  }

  const rows = (data ?? []).filter((row): row is PlanRow => isPlanId(row.id))
  if (rows.length === 0) return PLAN_LIST

  const resolved = new Map<PlanId, Plan>()
  for (const row of rows) {
    const id = row.id as PlanId
    resolved.set(id, toPlan(row, PLANS[id]))
  }

  // Any tier the table does not mention keeps its code definition. See the third
  // rule at the top of this file.
  return PLAN_LIST.map((plan) => resolved.get(plan.id) ?? plan).sort((a, b) => a.rank - b.rank)
})

/** One tier, resolved. Falls back to the code definition. */
export async function getPlanById(id: PlanId): Promise<Plan> {
  const catalogue = await getPlanCatalogue()
  return catalogue.find((plan) => plan.id === id) ?? PLANS[id]
}

/**
 * The plan to enforce, given what a subscription row says.
 *
 * The database-backed twin of `planFor` in lib/plans.ts, and deliberately the
 * same two-step: entitlement first, then the tier. `isEntitled` is imported
 * rather than reimplemented, so which statuses count as paying is decided in
 * exactly one place — and `past_due` keeps meaning "still a customer" here for
 * the same reason it does there.
 */
export async function resolvePlan(
  planId: unknown,
  status: SubscriptionStatusLike,
): Promise<Plan> {
  const catalogue = await getPlanCatalogue()
  const free = catalogue.find((plan) => plan.id === 'free') ?? PLANS.free

  if (!isEntitled(status)) return free
  if (!isPlanId(planId)) return free

  return catalogue.find((plan) => plan.id === planId) ?? PLANS[planId]
}

/**
 * The comparison matrix.
 *
 * `values` is jsonb keyed by plan id. A key that is missing renders as a dash,
 * which is what lets an operator add a row without filling in every tier first.
 */
function toFeature(row: PlanFeatureRow): PlanFeature | null {
  if (!row.values || typeof row.values !== 'object' || Array.isArray(row.values)) return null

  const source = row.values as Record<string, unknown>
  const values = {} as PlanFeature['values']

  for (const plan of PLAN_LIST) {
    const value = source[plan.id]
    if (typeof value === 'boolean' || typeof value === 'string') {
      values[plan.id] = value
    } else if (typeof value === 'number') {
      values[plan.id] = String(value)
    } else {
      // Absent, null, or something structural. A dash is the honest render.
      values[plan.id] = false
    }
  }

  return { label: row.label, values }
}

export const getPlanFeatures = cache(async (): Promise<PlanFeature[]> => {
  const supabase = await cmsReadClient()
  if (!supabase) return PLAN_FEATURES

  const { data, error } = await supabase
    .from('plan_features')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('[plans.service] feature read failed, using the code matrix:', error.message)
    return PLAN_FEATURES
  }

  const rows = (data ?? []).map(toFeature).filter((feature): feature is PlanFeature => feature !== null)
  return rows.length > 0 ? rows : PLAN_FEATURES
})

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

/** Every plan row as stored, visible or not. Admin only. */
export async function listPlanRows(): Promise<PlanRow[]> {
  const { data, error } = await cmsAdminClient()
    .from('plans')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('[plans.service] admin read failed:', error.message)
    return []
  }
  return data ?? []
}

export async function getPlanRow(id: string): Promise<PlanRow | null> {
  const { data, error } = await cmsAdminClient().from('plans').select('*').eq('id', id).maybeSingle()
  if (error) {
    console.error('[plans.service] admin row read failed:', error.message)
    return null
  }
  return data
}

export async function listPlanFeatureRows(): Promise<PlanFeatureRow[]> {
  const { data, error } = await cmsAdminClient()
    .from('plan_features')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('[plans.service] admin feature read failed:', error.message)
    return []
  }
  return data ?? []
}
