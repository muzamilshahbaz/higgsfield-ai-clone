import 'server-only'

import {
  activeProviderName,
  creditCostFor,
  getModel,
  resolveProvider,
  type GenerationRequest,
} from '@/lib/ai'
import { LIMITS } from '@/lib/constants'
import { isServiceRoleConfigured } from '@/lib/env'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import type { CreateGenerationInput } from '@/lib/validation/generation'
import { assetsByGeneration, persistProviderAssets } from '@/services/asset.service'
import { refundCredits, spendCredits } from '@/services/credits.service'
import { getPreset } from '@/services/preset.service'
import {
  isTerminal,
  type GenerationRow,
  type GenerationStatus,
  type GenerationWithAssets,
  type Json,
} from '@/types/database'

/**
 * Generations — the job record and the artifact record are the same row.
 *
 * Reads go through the user's client so RLS is the thing that scopes them.
 * Writes go through the admin client, because a generation row carries
 * provider fields the user must never be able to set themselves, and because
 * the credit functions are granted to the service role only. Every admin query
 * therefore filters on `user_id` explicitly — no policy will do it here.
 */

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export type CreateFailure =
  | { code: 'UNAUTHENTICATED'; status: 401 }
  | { code: 'NOT_CONFIGURED'; status: 503 }
  | { code: 'UNKNOWN_MODEL'; status: 400 }
  | { code: 'TOO_MANY_ACTIVE'; status: 429 }
  | { code: 'RATE_LIMITED'; status: 429 }
  | { code: 'INSUFFICIENT_CREDITS'; status: 402; required: number; balance: number }
  | { code: 'ERROR'; status: 500 }

export type CreateResult =
  | { ok: true; generation: GenerationWithAssets; deduped: boolean; balance: number | null }
  | ({ ok: false; message: string } & CreateFailure)

export async function createGeneration(input: CreateGenerationInput): Promise<CreateResult> {
  const user = await getCurrentUser()
  if (!user) {
    return { ok: false, code: 'UNAUTHENTICATED', status: 401, message: 'You need to be signed in.' }
  }

  if (!isServiceRoleConfigured) {
    return {
      ok: false,
      code: 'NOT_CONFIGURED',
      status: 503,
      message: 'Generation is unavailable: SUPABASE_SERVICE_ROLE_KEY is not set.',
    }
  }

  const model = getModel(input.modelId)
  if (!model) {
    return { ok: false, code: 'UNKNOWN_MODEL', status: 400, message: 'That model no longer exists.' }
  }

  const admin = createAdminClient()

  // 1. Idempotency comes first, before any limit or charge: a double-clicked
  //    button must be a no-op, not a 429 and not a second debit.
  const existing = await findByIdempotencyKey(user.id, input.idempotencyKey)
  if (existing) {
    return { ok: true, generation: await withAssets(existing), deduped: true, balance: null }
  }

  // 2. Guardrails on spend and queue depth.
  const limit = await checkLimits(user.id)
  if (limit) return limit

  // 3. Resolve the preset into prompt, params and cost. The model stays the
  //    one the client asked for — the composer sets it from the preset when a
  //    preset is chosen, and an explicit choice there should win.
  const preset = input.presetId ? await getPreset(input.presetId) : null

  const resolvedPrompt = [input.prompt.trim(), preset?.prompt_fragment?.trim()]
    .filter((part): part is string => Boolean(part))
    .join(', ')

  const negativePrompt = model.supports.negativePrompt
    ? (input.negativePrompt?.trim() || preset?.negative_prompt || null)
    : null

  const params = {
    ...(model.defaults ?? {}),
    ...(isRecord(preset?.params) ? preset!.params : {}),
  }

  const creditCost = creditCostFor(model, input.durationSec) + (preset?.credit_cost ?? 0)

  // 4. Everything lands in a project, so the library is never a flat dump.
  const projectId = input.projectId ?? (await ensureProjectId(user.id))

  const author = await readAuthor(user.id)

  const generationId = crypto.randomUUID()

  const { data: inserted, error: insertError } = await admin
    .from('generations')
    .insert({
      id: generationId,
      user_id: user.id,
      project_id: projectId,
      preset_id: preset?.id ?? null,
      parent_id: input.parentId ?? null,
      author_handle: author?.handle ?? null,
      author_name: author?.display_name ?? null,
      author_avatar_url: author?.avatar_url ?? null,
      task: input.task,
      status: 'queued',
      progress: 0,
      prompt: input.prompt.trim(),
      resolved_prompt: resolvedPrompt,
      negative_prompt: negativePrompt,
      input_image_url: input.imageUrl ?? null,
      model_id: model.id,
      provider: activeProviderName(),
      params: params as Json,
      seed: input.seed ?? null,
      duration_sec: input.durationSec ?? null,
      aspect_ratio: input.aspectRatio,
      credit_cost: creditCost,
      idempotency_key: input.idempotencyKey,
    })
    .select('*')
    .single()

  if (insertError || !inserted) {
    // 23505 on the unique idempotency key: another request for the same click
    // won the race, so return its row rather than charging twice.
    if (insertError?.code === '23505') {
      const raced = await findByIdempotencyKey(user.id, input.idempotencyKey)
      if (raced) {
        return { ok: true, generation: await withAssets(raced), deduped: true, balance: null }
      }
    }
    console.error('[generation.service] insert failed:', insertError?.message)
    return { ok: false, code: 'ERROR', status: 500, message: 'Could not start that generation.' }
  }

  // 5. Debit before submit. The row exists first so the ledger can reference
  //    it, which is what makes the (generation_id, reason) unique index a hard
  //    guarantee against a double charge.
  const spend = await spendCredits({
    userId: user.id,
    amount: creditCost,
    generationId,
    note: `${model.label} · ${input.task}`,
  })

  if (!spend.ok) {
    // Nothing was charged and no provider job exists, so the row is noise.
    await admin.from('generations').delete().eq('id', generationId).eq('user_id', user.id)

    if (spend.code === 'INSUFFICIENT_CREDITS') {
      return {
        ok: false,
        code: 'INSUFFICIENT_CREDITS',
        status: 402,
        required: creditCost,
        balance: spend.balance,
        message: `That needs ${creditCost} credits and you have ${spend.balance}.`,
      }
    }
    return { ok: false, code: 'ERROR', status: 500, message: spend.message }
  }

  // 6. Submit. A throw here refunds and leaves a visible failed card rather
  //    than a silent charge.
  const provider = resolveProvider()

  try {
    const { providerJobId } = await provider.submit(toProviderRequest(inserted))

    const { data: running } = await admin
      .from('generations')
      .update({
        provider_job_id: providerJobId,
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .eq('id', generationId)
      .select('*')
      .single()

    return {
      ok: true,
      generation: await withAssets(running ?? inserted),
      deduped: false,
      balance: spend.balance,
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'The provider rejected the job.'
    console.error('[generation.service] submit failed:', message)

    const balance = await refundCredits({
      userId: user.id,
      amount: creditCost,
      generationId,
      note: 'Provider rejected the submission',
    })

    const { data: failed } = await admin
      .from('generations')
      .update({
        status: 'failed',
        error_code: 'SUBMIT_FAILED',
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', generationId)
      .select('*')
      .single()

    return {
      ok: true,
      generation: await withAssets(failed ?? inserted),
      deduped: false,
      balance: balance ?? spend.balance,
    }
  }
}

// ---------------------------------------------------------------------------
// Sync — advancing a job
// ---------------------------------------------------------------------------

/**
 * Advances one job by asking the provider where it got to.
 *
 * There is no long-running worker on Vercel, so this is called from three
 * places: the client ticker while the tab is open, an opportunistic sweep when
 * a page loads, and the cron backstop. All three are safe to overlap — the
 * writes are idempotent and the refund is guarded in SQL.
 */
export async function syncGenerationRow(row: GenerationRow): Promise<GenerationRow> {
  if (isTerminal(row.status)) return row

  const admin = createAdminClient()

  const ageMs = Date.now() - new Date(row.queued_at).getTime()
  if (ageMs > LIMITS.jobTimeoutMs) {
    return finish(row, {
      status: 'failed',
      error_code: 'TIMEOUT',
      error_message: 'The job did not finish in time and was refunded.',
    })
  }

  if (!row.provider_job_id) {
    // Submitted but never recorded — treat as a lost job rather than leaving a
    // card spinning forever.
    if (ageMs < 15_000) return row
    return finish(row, {
      status: 'failed',
      error_code: 'NO_PROVIDER_JOB',
      error_message: 'The job was never accepted by the provider.',
    })
  }

  let poll
  try {
    poll = await resolveProvider().poll(row.provider_job_id, toProviderRequest(row))
  } catch (cause) {
    console.error(
      '[generation.service] poll failed:',
      cause instanceof Error ? cause.message : cause,
    )
    return row // transient: let the next tick try again
  }

  if (poll.status === 'queued' || poll.status === 'running') {
    const progress = clamp01(poll.progress ?? row.progress)
    const status: GenerationStatus = poll.status
    if (status === row.status && Math.abs(progress - row.progress) < 0.01) return row

    const { data } = await admin
      .from('generations')
      .update({
        status,
        progress,
        started_at: row.started_at ?? new Date().toISOString(),
      })
      .eq('id', row.id)
      .select('*')
      .single()

    return data ?? row
  }

  if (poll.status === 'failed') {
    return finish(row, {
      status: 'failed',
      error_code: poll.error?.code ?? 'PROVIDER_ERROR',
      error_message: poll.error?.message ?? 'The provider could not finish this job.',
    })
  }

  // Succeeded: media is persisted BEFORE the status flips, so a card that says
  // "Ready" always has something to show.
  await persistProviderAssets(row, poll.assets ?? [])

  const { data } = await admin
    .from('generations')
    .update({
      status: 'succeeded',
      progress: 1,
      provider_cost_usd: poll.costUsd ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .select('*')
    .single()

  return data ?? row
}

/** Marks a job failed and refunds it. Refunds are idempotent in SQL. */
async function finish(
  row: GenerationRow,
  patch: { status: 'failed'; error_code: string; error_message: string },
): Promise<GenerationRow> {
  const admin = createAdminClient()

  await refundCredits({
    userId: row.user_id,
    amount: row.credit_cost,
    generationId: row.id,
    note: `Refund · ${patch.error_code}`,
  })

  const { data } = await admin
    .from('generations')
    .update({ ...patch, progress: 1, completed_at: new Date().toISOString() })
    .eq('id', row.id)
    .select('*')
    .single()

  return data ?? { ...row, ...patch }
}

/**
 * Advances one job the signed-in user owns.
 * Used by a card's manual "check now" and by the detail view; the ticker uses
 * the batch endpoint instead, so N running jobs cost one round trip.
 */
export async function syncGeneration(id: string): Promise<GenerationWithAssets | null> {
  const user = await getCurrentUser()
  if (!user) return null
  if (!isServiceRoleConfigured) return getGeneration(id)

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('generations')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) {
    console.error('[generation.service] syncGeneration read failed:', error.message)
    return null
  }
  if (!data) return null

  return withAssets(await syncGenerationRow(data))
}

/** Advances every in-flight job the signed-in user owns. */
export async function syncMyJobs(): Promise<GenerationWithAssets[]> {
  const user = await getCurrentUser()
  if (!user || !isServiceRoleConfigured) return []

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('generations')
    .select('*')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .in('status', ['queued', 'running'])
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    console.error('[generation.service] syncMyJobs read failed:', error.message)
    return []
  }

  const advanced = await Promise.all((data ?? []).map((row) => syncGenerationRow(row)))
  return attachAssets(advanced)
}

/**
 * The cron backstop: advances stale jobs across all users.
 * Vercel Hobby caps cron at once a day, so this catches abandoned jobs rather
 * than driving the queue — the ticker and the page-load sweep do that.
 */
export async function sweepStaleJobs(limit = 100): Promise<{ scanned: number; advanced: number }> {
  if (!isServiceRoleConfigured) return { scanned: 0, advanced: 0 }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('generations')
    .select('*')
    .is('deleted_at', null)
    .in('status', ['queued', 'running'])
    .order('queued_at', { ascending: true })
    .limit(limit)

  if (error) {
    console.error('[generation.service] sweep read failed:', error.message)
    return { scanned: 0, advanced: 0 }
  }

  const rows = data ?? []
  const results = await Promise.all(rows.map((row) => syncGenerationRow(row)))
  const advanced = results.filter((row, index) => row.status !== rows[index]!.status).length

  return { scanned: rows.length, advanced }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface ListGenerationsOptions {
  limit?: number
  projectId?: string | null
  status?: GenerationStatus[]
}

/** The signed-in user's generations, newest first, each with its media. */
export async function listMyGenerations(
  options: ListGenerationsOptions = {},
): Promise<GenerationWithAssets[]> {
  const user = await getCurrentUser()
  if (!user) return []

  const supabase = await createClient()
  let query = supabase
    .from('generations')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 24)

  if (options.projectId) query = query.eq('project_id', options.projectId)
  if (options.status?.length) query = query.in('status', options.status)

  const { data, error } = await query

  if (error) {
    console.error('[generation.service] listMyGenerations failed:', error.message)
    return []
  }
  return attachAssets(data ?? [])
}

export async function getGeneration(id: string): Promise<GenerationWithAssets | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('generations')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) {
    console.error('[generation.service] getGeneration failed:', error.message)
    return null
  }
  if (!data) return null

  return withAssets(data)
}

export async function countMyGenerations(): Promise<number> {
  const user = await getCurrentUser()
  if (!user) return 0

  const supabase = await createClient()
  const { count, error } = await supabase
    .from('generations')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)

  if (error) {
    console.error('[generation.service] countMyGenerations failed:', error.message)
    return 0
  }
  return count ?? 0
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Rebuilds the provider's view of a job from the stored row. */
function toProviderRequest(row: GenerationRow): GenerationRequest {
  return {
    generationId: row.id,
    task: row.task,
    modelId: row.model_id,
    prompt: row.resolved_prompt || row.prompt,
    negativePrompt: row.negative_prompt,
    imageUrl: row.input_image_url,
    aspectRatio: row.aspect_ratio,
    durationSec: row.duration_sec,
    seed: row.seed,
    params: isRecord(row.params) ? row.params : {},
  }
}

async function findByIdempotencyKey(
  userId: string,
  idempotencyKey: string,
): Promise<GenerationRow | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('generations')
    .select('*')
    .eq('user_id', userId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle()

  if (error) {
    console.error('[generation.service] idempotency lookup failed:', error.message)
    return null
  }
  return data
}

async function checkLimits(userId: string): Promise<(CreateResult & { ok: false }) | null> {
  const admin = createAdminClient()

  const { count: active } = await admin
    .from('generations')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('deleted_at', null)
    .in('status', ['queued', 'running'])

  if ((active ?? 0) >= LIMITS.maxConcurrentJobs) {
    return {
      ok: false,
      code: 'TOO_MANY_ACTIVE',
      status: 429,
      message: `You already have ${LIMITS.maxConcurrentJobs} jobs running. Wait for one to finish.`,
    }
  }

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count: recent } = await admin
    .from('generations')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since)

  if ((recent ?? 0) >= LIMITS.maxGenerationsPerHour) {
    return {
      ok: false,
      code: 'RATE_LIMITED',
      status: 429,
      message: `That is ${LIMITS.maxGenerationsPerHour} generations in an hour — give it a few minutes.`,
    }
  }

  return null
}

async function ensureProjectId(userId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('ensure_default_project', { p_user_id: userId })

  if (error) {
    console.error('[generation.service] ensureDefaultProject failed:', error.message)
    return null
  }
  return data
}

async function readAuthor(userId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('handle, display_name, avatar_url')
    .eq('id', userId)
    .maybeSingle()
  return data
}

/**
 * Assets are read with the admin client here because this runs right after a
 * write, on rows we have already scoped to one user.
 */
async function withAssets(row: GenerationRow): Promise<GenerationWithAssets> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('assets')
    .select('*')
    .eq('generation_id', row.id)
    .order('sort_order', { ascending: true })

  return { ...row, assets: data ?? [] }
}

async function attachAssets(rows: GenerationRow[]): Promise<GenerationWithAssets[]> {
  if (rows.length === 0) return []
  const grouped = await assetsByGeneration(rows.map((row) => row.id))
  return rows.map((row) => ({ ...row, assets: grouped.get(row.id) ?? [] }))
}
