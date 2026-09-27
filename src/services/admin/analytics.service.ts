import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { cmsAdminClient } from '@/lib/supabase/cms'
import type { AdminDailyRow, AdminOverview } from '@/types/cms'
import type { GenerationRow, ProfileRow } from '@/types/database'

/**
 * Dashboard and analytics reads.
 *
 * Aggregates come from `admin_overview()` and `admin_daily_series()` (migration
 * 0016) rather than from a pile of `count: 'exact', head: true` queries. Twenty-one
 * counts as twenty-one PostgREST calls is twenty-one waits on the one page an
 * operator opens first; the function returns them in one round trip, and every
 * count is scoped in SQL the same way the product scopes it elsewhere.
 *
 * Every read degrades to zeroes and empty lists. A dashboard that renders
 * "—" where a number should be is a dashboard; one that throws is an outage on the
 * screen an operator would use to diagnose the outage.
 */

const EMPTY_OVERVIEW: AdminOverview = {
  users: 0,
  users_active: 0,
  users_suspended: 0,
  users_new_7d: 0,
  staff: 0,
  projects: 0,
  generations: 0,
  generations_24h: 0,
  generations_failed: 0,
  generations_running: 0,
  assets: 0,
  public_shots: 0,
  comments: 0,
  comments_hidden: 0,
  credits_held: 0,
  credits_spent_30d: 0,
  subscriptions_paid: 0,
  revenue_minor_30d: 0,
  media: 0,
  presets: 0,
  errors_24h: 0,
}

export async function getOverview(): Promise<AdminOverview> {
  const { data, error } = await cmsAdminClient().rpc('admin_overview')

  if (error || !data) {
    if (error) console.error('[analytics.service] overview failed:', error.message)
    return EMPTY_OVERVIEW
  }

  // Every key is coerced through the empty object, so a function that gains a
  // field before this file does cannot produce `undefined` in a template.
  return { ...EMPTY_OVERVIEW, ...data }
}

/**
 * Daily activity, left-joined onto a date series in SQL.
 *
 * So a quiet day arrives as a zero rather than as a gap the chart has to guess at —
 * which is the difference between a line that dips and a line that lies.
 */
export async function getDailySeries(days = 30): Promise<AdminDailyRow[]> {
  const { data, error } = await cmsAdminClient().rpc('admin_daily_series', { p_days: days })

  if (error || !data) {
    if (error) console.error('[analytics.service] series failed:', error.message)
    return []
  }

  return (data as AdminDailyRow[]).map((row) => ({
    day: row.day,
    // `count(*)` comes back as bigint, which PostgREST may serialise as a string.
    // Coercing here means the chart's arithmetic cannot silently concatenate.
    generations: Number(row.generations) || 0,
    signups: Number(row.signups) || 0,
    credits_spent: Number(row.credits_spent) || 0,
    revenue_minor: Number(row.revenue_minor) || 0,
  }))
}

/**
 * The most-used models, over a window.
 *
 * Grouped in TypeScript rather than in SQL. `group by` is not expressible through
 * PostgREST without a view or a function, and the alternative — one more database
 * function per chart — is a migration every time somebody wants a different
 * breakdown. The window is capped, so this reads a bounded number of rows and
 * counts them in memory.
 */
export async function getModelUsage(days = 30, limit = 8): Promise<{ modelId: string; count: number }[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await createAdminClient()
    .from('generations')
    .select('model_id')
    .gte('created_at', since)
    .is('deleted_at', null)
    // Bounded, because this is a chart on a dashboard and not a report. Beyond a
    // few thousand rows the ranking does not change and the read cost does.
    .limit(5000)

  if (error) {
    console.error('[analytics.service] model usage failed:', error.message)
    return []
  }

  const counts = new Map<string, number>()
  for (const row of data ?? []) {
    counts.set(row.model_id, (counts.get(row.model_id) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([modelId, count]) => ({ modelId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

/** The same shape, for provider share. */
export async function getProviderUsage(days = 30): Promise<{ provider: string; count: number }[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await createAdminClient()
    .from('generations')
    .select('provider')
    .gte('created_at', since)
    .is('deleted_at', null)
    .limit(5000)

  if (error) {
    console.error('[analytics.service] provider usage failed:', error.message)
    return []
  }

  const counts = new Map<string, number>()
  for (const row of data ?? []) {
    counts.set(row.provider, (counts.get(row.provider) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([provider, count]) => ({ provider, count }))
    .sort((a, b) => b.count - a.count)
}

/** The newest accounts, for the dashboard's activity column. */
export async function getRecentUsers(limit = 6): Promise<ProfileRow[]> {
  const { data, error } = await createAdminClient()
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[analytics.service] recent users failed:', error.message)
    return []
  }
  return data ?? []
}

/** The newest jobs, whatever their state. The dashboard shows failures too. */
export async function getRecentGenerations(limit = 8): Promise<GenerationRow[]> {
  const { data, error } = await createAdminClient()
    .from('generations')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[analytics.service] recent generations failed:', error.message)
    return []
  }
  return data ?? []
}

/**
 * The credit ledger across everybody, newest first.
 *
 * Owner-scoped everywhere else in the app; here it is the money trail an operator
 * needs when somebody asks where their credits went.
 */
export async function getRecentLedger(limit = 20) {
  const { data, error } = await createAdminClient()
    .from('credit_ledger')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[analytics.service] ledger failed:', error.message)
    return []
  }
  return data ?? []
}

/** Settled and failed payments, newest first, for the pricing screens. */
export async function getRecentTransactions(limit = 20) {
  const { data, error } = await createAdminClient()
    .from('payment_transactions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[analytics.service] transactions failed:', error.message)
    return []
  }
  return data ?? []
}
