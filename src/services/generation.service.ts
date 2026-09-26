import 'server-only'

import {
  getModel,
  providersFor,
  ProviderRequestError,
  type GenerationRequest,
  type ProviderPollResult,
} from '@/lib/ai'
import { routeGeneration } from '@/services/ai/ai-router'
import { getUserProviderKeys } from '@/services/ai-keys.service'
import { planForUser } from '@/services/subscription.service'
import { LIMITS } from '@/lib/constants'
import { isServiceRoleConfigured } from '@/lib/env'
import {
  isRecord,
  presetLikeFromRow,
  resolveCreditCost,
  resolveNegativePrompt,
  resolveParams,
  resolvePrompt,
} from '@/lib/presets'
import { createAdminClient } from '@/lib/supabase/admin'
import { isUnknownProviderEnumValue, PENDING_PROVIDER_MIGRATION } from '@/lib/supabase/errors'
import { createClient, getCurrentUser, tryCreateClient } from '@/lib/supabase/server'
import type { CreateGenerationInput } from '@/lib/validation/generation'
import {
  assetsByGeneration,
  deleteGenerationMedia,
  persistProviderAssets,
} from '@/services/asset.service'
import { refundCredits, spendCredits } from '@/services/credits.service'
import { getPreset } from '@/services/preset.service'
import {
  isTerminal,
  type GenerationRow,
  type GenerationStatus,
  type GenerationTask,
  type GenerationVisibility,
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
  | { code: 'NO_PROVIDER_KEY'; status: 400 }
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
  const presetRow = input.presetId ? await getPreset(input.presetId) : null
  const preset = presetRow ? presetLikeFromRow(presetRow) : null

  // Every one of these four is computed by the same pure helpers the composer
  // used to quote the job, so the price shown and the price charged agree.
  const resolvedPrompt = resolvePrompt(input.prompt, preset)
  const negativePrompt = resolveNegativePrompt(model, input.negativePrompt, preset)
  const params = resolveParams(model, preset)
  const creditCost = resolveCreditCost(model, input.durationSec, preset)

  // 4. Everything lands in a project, so the library is never a flat dump.
  const projectId = input.projectId ?? (await ensureProjectId(user.id))

  const author = await readAuthor(user.id)

  const generationId = crypto.randomUUID()

  // Route before anything is written or charged.
  //
  // Two reasons, in order of importance. First, a job with nowhere to run must
  // cost nothing and leave no row: no credit debit, no failed card to explain,
  // just a sentence telling the user which key to add. Second, `provider` on
  // the row then records who actually ran the job rather than who we hoped
  // would. See services/ai/ai-router.ts for the order it tries.
  const route = await routeForUser(user.id, model.id)

  if (!route.ok) {
    console.info(
      `[generation.service] ${model.id} has no runnable provider (${route.candidates.join(', ') || 'none'})`,
    )

    return {
      ok: false,
      code: route.code === 'UNKNOWN_MODEL' ? 'UNKNOWN_MODEL' : 'NO_PROVIDER_KEY',
      status: 400,
      message: route.message,
    }
  }

  if (route.fallbackReason) {
    console.warn(
      `[generation.service] ${model.id} is running on the mock driver: ${route.fallbackReason}`,
    )
  }

  const { data: inserted, error: insertError } = await admin
    .from('generations')
    .insert({
      id: generationId,
      user_id: user.id,
      project_id: projectId,
      preset_id: presetRow?.id ?? null,
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
      provider: route.providerName,
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

    // The one database failure with an instruction attached: the router picked
    // a provider whose name the enum does not have yet. Nothing was charged —
    // the debit comes after this — so the honest answer is "run the migration",
    // not a 500.
    if (isUnknownProviderEnumValue(insertError)) {
      return {
        ok: false,
        code: 'NOT_CONFIGURED',
        status: 503,
        message: PENDING_PROVIDER_MIGRATION,
      }
    }

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
  try {
    const submitted = await route.driver.submit(toProviderRequest(inserted))
    const startedAt = new Date().toISOString()

    // Lineage is recorded after the job is accepted, so a submission the
    // provider rejected does not inflate the parent's remix count.
    if (input.parentId) await noteRemix(input.parentId)

    let settled: GenerationRow

    if (submitted.immediate) {
      // A provider with no queue — Hugging Face — has already finished by the
      // time submit returns. The job id and the terminal state go down in ONE
      // write, which is the whole point of this branch.
      //
      // Marking it `running` first and settling it second opened a window that
      // a concurrent sweep could land in: the ticker polls every three seconds,
      // `syncMyJobs` picks up anything queued or running that carries a job id,
      // and a synchronous driver has no job left to poll — so it answered
      // SYNC_RESULT_LOST and refunded a generation that had in fact succeeded.
      // Observed in QA: a finished 1MB image sitting under a card that said
      // Failed, refunded. Until the id is persisted there is nothing for a
      // sweep to poll, and `queued` with a null job id is explicitly a no-op
      // for the first fifteen seconds (see syncGenerationRow).
      settled = await applyPollResult(inserted, submitted.immediate, {
        provider_job_id: submitted.providerJobId,
        started_at: startedAt,
      })
    } else {
      // A real queue: the job id is what the ticker needs to advance it, so it
      // is written immediately and the row waits in `running`.
      const { data: running } = await admin
        .from('generations')
        .update({
          provider_job_id: submitted.providerJobId,
          status: 'running',
          started_at: startedAt,
        })
        .eq('id', generationId)
        .select('*')
        .single()

      settled = running ?? inserted
    }

    return {
      ok: true,
      generation: await withAssets(settled),
      deduped: false,
      balance: spend.balance,
    }
  } catch (cause) {
    const failure = describeProviderFailure(cause)
    console.error('[generation.service] submit failed:', failure.message)

    const balance = await refundCredits({
      userId: user.id,
      amount: creditCost,
      generationId,
      note: `Refund · ${failure.code}`,
    })

    const { data: failed } = await admin
      .from('generations')
      .update({
        status: 'failed',
        error_code: failure.code,
        error_message: failure.message,
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

/**
 * What to record when a driver throws.
 *
 * Drivers raise `ProviderRequestError` with a code and a sentence written for a
 * person — "Hugging Face is loading this model", "fal.ai rejected the API key".
 * Those are worth showing verbatim. Anything else is a bug in our own code and
 * gets a generic message, because the alternative is putting a stack-trace
 * fragment on a card in someone's library.
 */
function describeProviderFailure(cause: unknown): { code: string; message: string } {
  if (cause instanceof ProviderRequestError) {
    return { code: cause.code, message: cause.message }
  }

  console.error('[generation.service] unexpected driver failure:', cause)
  return { code: 'SUBMIT_FAILED', message: 'The provider rejected the job. Nothing was charged.' }
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

  const driver = await driverForRow(row)

  if (!driver) {
    // The provider that ran this job is no longer reachable: the key it used is
    // gone and no shared one replaced it. Nothing will ever answer about this
    // job, so failing it now refunds instead of spinning to the timeout.
    return finish(row, {
      status: 'failed',
      error_code: 'PROVIDER_DISCONNECTED',
      error_message: `The ${row.provider} key this job was running on is no longer connected.`,
    })
  }

  let poll: ProviderPollResult
  try {
    poll = await driver.poll(row.provider_job_id, toProviderRequest(row))
  } catch (cause) {
    console.error(
      '[generation.service] poll failed:',
      cause instanceof Error ? cause.message : cause,
    )
    return row // transient: let the next tick try again
  }

  return applyPollResult(row, poll)
}

/**
 * Writes one provider answer onto the row.
 *
 * The single place a job changes state, whether the answer came from a poll or
 * straight back from a submit (see SubmitResult.immediate). Everything that
 * makes a finished job trustworthy lives here and therefore cannot be missed by
 * one of the two callers: media is persisted before the status flips, a failure
 * refunds, and a success that produced no storable media is a failure.
 */
async function applyPollResult(
  row: GenerationRow,
  poll: ProviderPollResult,
  /**
   * Extra columns to write in the SAME statement as the status.
   *
   * Exists for the synchronous providers: a job id written before the terminal
   * state is a job id a concurrent sweep will try to poll. One write, or the
   * race is back.
   */
  patch: Partial<Pick<GenerationRow, 'provider_job_id' | 'started_at'>> = {},
): Promise<GenerationRow> {
  const admin = createAdminClient()

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
        ...patch,
      })
      .eq('id', row.id)
      .select('*')
      .single()

    return data ?? row
  }

  if (poll.status === 'failed') {
    return finish(
      row,
      {
        status: 'failed',
        error_code: poll.error?.code ?? 'PROVIDER_ERROR',
        error_message: poll.error?.message ?? 'The provider could not finish this job.',
      },
      patch,
    )
  }

  // Succeeded: media is persisted BEFORE the status flips, so a card that says
  // "Ready" always has something to show.
  const expected = poll.assets ?? []
  const persisted = await persistProviderAssets(row, expected)

  if (expected.length > 0 && persisted.length === 0) {
    // The provider generated something and we could not keep it. That is a
    // failed generation from the user's side — the card would say "Ready" over
    // an empty frame — so it fails and refunds rather than succeeding hollow.
    return finish(row, {
      status: 'failed',
      error_code: 'STORAGE_FAILED',
      error_message: 'The generation finished but its media could not be stored. Try again.',
    })
  }

  const { data } = await admin
    .from('generations')
    .update({
      status: 'succeeded',
      progress: 1,
      provider_cost_usd: poll.costUsd ?? null,
      completed_at: new Date().toISOString(),
      ...patch,
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
  extra: Partial<Pick<GenerationRow, 'provider_job_id' | 'started_at'>> = {},
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
    .update({ ...patch, ...extra, progress: 1, completed_at: new Date().toISOString() })
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
//
// Every "my ..." read below filters on `user_id` explicitly, and that is not
// redundant with RLS. `generations` carries two PERMISSIVE select policies —
// `generations_select_own` and `generations_select_public` — and Postgres ORs
// permissive policies together. A select with no owner predicate therefore
// returns the caller's rows *plus every published row in the database*, which
// put other people's Explore posts in the library, the history and the counts.
// RLS is the floor here, not the filter.
// ---------------------------------------------------------------------------

export interface ListGenerationsOptions {
  limit?: number
  /** Rows to skip — the library and history pages page through with this. */
  offset?: number
  projectId?: string | null
  status?: GenerationStatus[]
  task?: GenerationTask[]
  /** Free text over what the user typed and what the preset resolved to. */
  search?: string | null
}

/** The signed-in user's generations, newest first, each with its media. */
export async function listMyGenerations(
  options: ListGenerationsOptions = {},
): Promise<GenerationWithAssets[]> {
  const user = await getCurrentUser()
  if (!user) return []

  const limit = options.limit ?? 24
  const offset = Math.max(0, options.offset ?? 0)

  const supabase = await createClient()
  let query = supabase
    .from('generations')
    .select('*')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    // `range` rather than `limit`, so "load more" asks for the next window
    // instead of refetching a bigger first page every time.
    .range(offset, offset + limit - 1)

  if (options.projectId) query = query.eq('project_id', options.projectId)
  if (options.status?.length) query = query.in('status', options.status)
  if (options.task?.length) query = query.in('task', options.task)

  const search = options.search?.trim()
  if (search) {
    // Escaped because a stray comma would split the PostgREST filter list and
    // a stray % would turn a literal search into a wildcard.
    const term = search.replace(/[%,()]/g, ' ')
    query = query.or(`prompt.ilike.%${term}%,resolved_prompt.ilike.%${term}%`)
  }

  const { data, error } = await query

  if (error) {
    console.error('[generation.service] listMyGenerations failed:', error.message)
    return []
  }
  return attachAssets(data ?? [])
}

export async function getGeneration(id: string): Promise<GenerationWithAssets | null> {
  // No session required — this also serves published rows — so it cannot rely
  // on `getCurrentUser` to stop first when Supabase is unconfigured.
  const supabase = await tryCreateClient()
  if (!supabase) return null
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
    .eq('user_id', user.id)
    .is('deleted_at', null)

  if (error) {
    console.error('[generation.service] countMyGenerations failed:', error.message)
    return 0
  }
  return count ?? 0
}

export async function countMyGenerationsWhere(
  options: Pick<ListGenerationsOptions, 'projectId' | 'status' | 'task'> = {},
): Promise<number> {
  const user = await getCurrentUser()
  if (!user) return 0

  const supabase = await createClient()
  let query = supabase
    .from('generations')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('deleted_at', null)

  if (options.projectId) query = query.eq('project_id', options.projectId)
  if (options.status?.length) query = query.in('status', options.status)
  if (options.task?.length) query = query.in('task', options.task)

  const { count, error } = await query

  if (error) {
    console.error('[generation.service] countMyGenerationsWhere failed:', error.message)
    return 0
  }
  return count ?? 0
}

// ---------------------------------------------------------------------------
// Library management
// ---------------------------------------------------------------------------

/**
 * Organisational edits the user makes to their own work.
 *
 * These go through the user's client, not the admin one. The distinction the
 * file header draws is about *provider* fields — status, progress, job ids —
 * which only the server may write. `project_id` and `deleted_at` are the
 * user's to set, so RLS scopes them and there is no `user_id` filter to omit.
 */

export type GenerationMutation<T> = { ok: true; data: T } | { ok: false; error: string }

/** Files a generation under a different project, or none at all. */
export async function moveGenerationToProject(
  generationId: string,
  projectId: string | null,
): Promise<GenerationMutation<GenerationRow>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'You need to be signed in.' }

  const supabase = await createClient()

  // Checked rather than trusted: the id comes from a form, and pointing a row
  // at someone else's project would be invisible to the generations policy.
  if (projectId) {
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .is('deleted_at', null)
      .maybeSingle()

    if (projectError) {
      console.error('[generation.service] project check failed:', projectError.message)
      return { ok: false, error: 'Could not move that generation. Try again.' }
    }
    if (!project) return { ok: false, error: 'That project is gone.' }
  }

  const { data, error } = await supabase
    .from('generations')
    .update({ project_id: projectId })
    .eq('id', generationId)
    .is('deleted_at', null)
    .select('*')
    .maybeSingle()

  if (error) {
    console.error('[generation.service] moveGenerationToProject failed:', error.message)
    return { ok: false, error: 'Could not move that generation. Try again.' }
  }
  if (!data) return { ok: false, error: 'That generation is gone.' }

  return { ok: true, data }
}

/**
 * Publishes a finished shot to Explore, or takes it back down.
 *
 * Through the user's client: `visibility` is theirs to set, and the database
 * carries the one rule that matters — `generations_public_requires_success`
 * makes publishing a failed or in-flight job impossible, so this cannot be
 * talked into listing something that has no media.
 */
export async function setGenerationVisibility(
  generationId: string,
  visibility: GenerationVisibility,
): Promise<GenerationMutation<{ id: string; visibility: GenerationVisibility }>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'You need to be signed in.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('generations')
    .update({ visibility })
    .eq('id', generationId)
    .is('deleted_at', null)
    .select('id, visibility')
    .maybeSingle()

  if (error) {
    // 23514 = check_violation, which on this table only ever means the row was
    // not a succeeded one.
    if (error.code === '23514') {
      return { ok: false, error: 'Only a finished shot can be published.' }
    }
    console.error('[generation.service] setGenerationVisibility failed:', error.message)
    return { ok: false, error: 'Could not change that. Try again.' }
  }
  if (!data) return { ok: false, error: 'That generation is gone.' }

  return { ok: true, data: { id: data.id, visibility: data.visibility } }
}

/**
 * Deletes a generation from the library.
 *
 * The row is soft-deleted so the credit ledger keeps pointing at something,
 * but the media is removed for real — "delete" on a library card has to mean
 * the file is gone, not hidden.
 */
export async function deleteGeneration(
  generationId: string,
): Promise<GenerationMutation<{ id: string; assetsRemoved: number }>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'You need to be signed in.' }

  // Same key generation itself needs, so this is never the first place a
  // misconfigured deployment discovers the problem.
  if (!isServiceRoleConfigured) {
    return { ok: false, error: 'Deleting is unavailable: SUPABASE_SERVICE_ROLE_KEY is not set.' }
  }

  const supabase = await createClient()

  const { data: existing, error: readError } = await supabase
    .from('generations')
    .select('id, status')
    .eq('id', generationId)
    .is('deleted_at', null)
    .maybeSingle()

  if (readError) {
    console.error('[generation.service] delete lookup failed:', readError.message)
    return { ok: false, error: 'Could not delete that generation. Try again.' }
  }
  if (!existing) return { ok: false, error: 'That generation is already gone.' }

  if (!isTerminal(existing.status)) {
    return {
      ok: false,
      error: 'That job is still running. Wait for it to finish before deleting it.',
    }
  }

  const assetsRemoved = await deleteGenerationMedia(generationId)

  // The one write in this function that cannot go through the user's client.
  //
  // PostgREST wraps every UPDATE in a RETURNING clause, and Postgres then
  // checks the SELECT policies against the *new* row. `generations_select_own`
  // requires `deleted_at is null`, so the moment the update sets it the row
  // becomes invisible to its own owner and Postgres rejects the statement
  // outright — "new row violates row-level security policy". A soft delete is
  // therefore impossible under that policy from a user-scoped client.
  //
  // The admin client bypasses RLS, so the `user_id` filter below is doing the
  // scoping that a policy would otherwise do. It is not redundant.
  const admin = createAdminClient()
  const { error } = await admin
    .from('generations')
    .update({ deleted_at: new Date().toISOString(), visibility: 'private' })
    .eq('id', generationId)
    .eq('user_id', user.id)
    .is('deleted_at', null)

  if (error) {
    console.error('[generation.service] deleteGeneration failed:', error.message)
    return { ok: false, error: 'Could not delete that generation. Try again.' }
  }

  return { ok: true, data: { id: generationId, assetsRemoved } }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

/**
 * Routes one job, preferring the user's own keys.
 *
 * A model names several providers it can run on, so this asks the vault for
 * every one of them in a single query and lets the router pick. Split out from
 * routeGeneration() so the router itself stays free of Supabase and remains a
 * pure function the unit tests can drive.
 */
async function routeForUser(userId: string, modelId: string) {
  const model = getModel(modelId)
  const candidates = model ? providersFor(model) : []

  // Only ask the vault for keys the router could actually use.
  const keys = await getUserProviderKeys(userId, candidates)

  return routeGeneration({ modelId, keys })
}

/**
 * The driver that can answer for a job already in flight.
 *
 * Pinned to the provider recorded on the row, never re-chosen: a job submitted
 * to fal holds a fal request id, and a user who connects a Hugging Face token
 * while it is queued must not have that id polled against Hugging Face. It
 * also means removing a key mid-job still leaves the job pollable through the
 * operator's shared key, because the row remembers where it went.
 *
 * Returns null when the provider that ran the job can no longer be reached —
 * every key for it is gone. The caller fails the job and refunds rather than
 * polling something that cannot answer until the timeout.
 */
async function driverForRow(row: GenerationRow) {
  // A mock job's state lives entirely in its job id, so it needs no credential
  // and must not cost a vault query.
  const keys =
    row.provider === 'mock' ? {} : await getUserProviderKeys(row.user_id, [row.provider])

  const route = routeGeneration({ modelId: row.model_id, keys, only: row.provider })

  return route.ok ? route.driver : null
}

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

/**
 * Queue-depth and rate guardrails, scaled by the caller's plan.
 *
 * The numbers live on the plan rather than in `LIMITS` because the pricing
 * page sells them: "higher concurrent job limit" has to be the same number
 * here that the marketing section promises, or the product quietly fails to
 * deliver what was bought. `LIMITS` keeps the free-tier values as the floor
 * and `plans.ts` is what the paid tier raises.
 *
 * A billing lookup that fails resolves to the free plan, so an outage in the
 * subscription table costs a paying user some concurrency rather than all
 * access.
 */
async function checkLimits(userId: string): Promise<(CreateResult & { ok: false }) | null> {
  const admin = createAdminClient()
  const plan = await planForUser(userId)

  const { count: active } = await admin
    .from('generations')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('deleted_at', null)
    .in('status', ['queued', 'running'])

  if ((active ?? 0) >= plan.maxConcurrentJobs) {
    return {
      ok: false,
      code: 'TOO_MANY_ACTIVE',
      status: 429,
      message: `You already have ${plan.maxConcurrentJobs} jobs running. Wait for one to finish.`,
    }
  }

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count: recent } = await admin
    .from('generations')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since)

  if ((recent ?? 0) >= plan.maxGenerationsPerHour) {
    return {
      ok: false,
      code: 'RATE_LIMITED',
      status: 429,
      message: `That is ${plan.maxGenerationsPerHour} generations in an hour — give it a few minutes.`,
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

/**
 * Bumps the parent's remix counter.
 *
 * Read-then-write, and deliberately so: PostgREST cannot express
 * `remix_count = remix_count + 1`, and this is a vanity number on someone
 * else's row — worth an admin-client write, not worth a migration and a
 * `SECURITY DEFINER` function. Two remixes in the same millisecond can cost
 * one increment; nothing else depends on the value.
 */
async function noteRemix(parentId: string): Promise<void> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('generations')
    .select('remix_count')
    .eq('id', parentId)
    .maybeSingle()

  if (error || !data) {
    if (error) console.error('[generation.service] remix lookup failed:', error.message)
    return
  }

  const { error: writeError } = await admin
    .from('generations')
    .update({ remix_count: data.remix_count + 1 })
    .eq('id', parentId)

  if (writeError) {
    console.error('[generation.service] remix count update failed:', writeError.message)
  }
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
