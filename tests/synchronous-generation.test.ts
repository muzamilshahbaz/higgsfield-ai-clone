import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProviderPollResult } from '@/lib/ai/types'

/**
 * The synchronous-provider write order.
 *
 * A provider with no queue — Hugging Face — hands back a finished job from
 * `submit`. The row must go from `queued` straight to its terminal state in one
 * write that also carries the provider job id.
 *
 * The bug this pins, found in QA against a real Hugging Face token: the row was
 * marked `running` with the job id first and settled second. The client ticker
 * polls every three seconds, `syncMyJobs` picks up anything queued or running
 * that carries a job id, and a synchronous driver has no job left to poll — so
 * it answered SYNC_RESULT_LOST, failed the row and refunded it. The result was
 * a finished 1MB image sitting under a card that said "Failed", with the credit
 * handed back. Both halves are wrong, and the second one is wrong in the
 * direction that costs money.
 *
 * So these tests assert on the *sequence of writes*, not on the returned row.
 * A returned row that says "succeeded" is exactly what the buggy version
 * produced.
 */

const UPDATES: Array<Record<string, unknown>> = []
const INSERTS: Array<Record<string, unknown>> = []
let spent = 0
let refunded = 0

/** A PostgREST-ish chain that records what it was asked to write. */
function chain(rows: unknown[] = [], record?: (op: string, payload: unknown) => void) {
  const self: Record<string, unknown> = {}
  const passthrough = ['eq', 'is', 'in', 'or', 'not', 'order', 'range', 'limit', 'gte', 'select']

  for (const method of passthrough) self[method] = () => self

  self.single = () => Promise.resolve({ data: rows[0] ?? null, error: null })
  self.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null })
  self.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: rows, count: rows.length, error: null }).then(resolve)

  self.insert = (payload: Record<string, unknown>) => {
    record?.('insert', payload)
    return chain([{ ...ROW, ...payload }])
  }
  self.update = (payload: Record<string, unknown>) => {
    record?.('update', payload)
    return chain([{ ...ROW, ...payload }])
  }
  self.delete = () => chain([])
  self.upsert = (payload: unknown) => chain(Array.isArray(payload) ? payload : [payload])

  return self
}

const ROW = {
  id: 'gen-1',
  user_id: 'user-1',
  status: 'queued',
  progress: 0,
  provider: 'huggingface',
  provider_job_id: null,
  model_id: 'lumen-flash',
  task: 'text_to_image',
  prompt: 'a brass compass',
  resolved_prompt: 'a brass compass',
  negative_prompt: null,
  input_image_url: null,
  aspect_ratio: '16:9',
  duration_sec: null,
  seed: null,
  params: {},
  credit_cost: 1,
  queued_at: new Date().toISOString(),
  started_at: null,
  completed_at: null,
  error_code: null,
  error_message: null,
  deleted_at: null,
  remix_count: 0,
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'generations') {
        return chain([], (op, payload) => {
          if (op === 'insert') INSERTS.push(payload as Record<string, unknown>)
          if (op === 'update') UPDATES.push(payload as Record<string, unknown>)
        })
      }
      if (table === 'profiles') return chain([{ handle: 'qa', display_name: 'QA', avatar_url: null }])
      return chain([])
    },
    rpc: () => Promise.resolve({ data: 'project-1', error: null }),
  }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve(chain([])),
  tryCreateClient: () => Promise.resolve(chain([])),
  getCurrentUser: () => Promise.resolve({ id: 'user-1' }),
}))

vi.mock('@/lib/env', () => ({
  env: { siteUrl: 'http://localhost:3000' },
  isServiceRoleConfigured: true,
  isKeyVaultConfigured: false,
  serverProviderKey: () => undefined,
}))

vi.mock('@/services/credits.service', () => ({
  spendCredits: () => {
    spent += 1
    return Promise.resolve({ ok: true, balance: 145 })
  },
  refundCredits: () => {
    refunded += 1
    return Promise.resolve(146)
  },
}))

vi.mock('@/services/subscription.service', () => ({
  planForUser: () => Promise.resolve({ maxConcurrentJobs: 2, maxGenerationsPerHour: 20 }),
}))

vi.mock('@/services/preset.service', () => ({ getPreset: () => Promise.resolve(null) }))

vi.mock('@/services/ai-keys.service', () => ({
  getUserProviderKeys: () => Promise.resolve({ huggingface: 'hf_test' }),
}))

vi.mock('@/services/asset.service', () => ({
  persistProviderAssets: (_row: unknown, assets: unknown[]) =>
    Promise.resolve(assets.map((_, index) => ({ id: `asset-${index}` }))),
  assetsByGeneration: () => Promise.resolve(new Map()),
  deleteGenerationMedia: () => Promise.resolve(0),
}))

/** The immediate result a synchronous driver hands back. */
const IMMEDIATE: ProviderPollResult = {
  status: 'succeeded',
  progress: 1,
  assets: [{ kind: 'image', url: 'data:image/png;base64,iVBORw0KGgo=', mimeType: 'image/png' }],
}

let immediate: ProviderPollResult | undefined = IMMEDIATE

vi.mock('@/services/ai/ai-router', () => ({
  routeGeneration: () => ({
    ok: true,
    providerName: 'huggingface',
    keySource: 'user_key',
    driver: {
      name: 'huggingface',
      submit: () => Promise.resolve({ providerJobId: 'hf-sync-gen-1', immediate }),
      poll: () => Promise.resolve({ status: 'failed' }),
    },
  }),
}))

async function create() {
  const { createGeneration } = await import('@/services/generation.service')
  return createGeneration({
    idempotencyKey: 'idem-' + Math.random(),
    task: 'text_to_image',
    modelId: 'lumen-flash',
    prompt: 'a brass compass on wet slate',
    aspectRatio: '16:9',
  } as Parameters<typeof createGeneration>[0])
}

beforeEach(() => {
  UPDATES.length = 0
  INSERTS.length = 0
  spent = 0
  refunded = 0
  immediate = IMMEDIATE
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('a provider with no queue', () => {
  it('never writes a pollable job id before the job is terminal', async () => {
    await create()

    // The invariant. Every write that carries a job id must also carry the
    // terminal status, or a sweep can land between the two and poll a job that
    // no longer exists.
    for (const update of UPDATES) {
      if ('provider_job_id' in update) {
        expect(update.status, JSON.stringify(update)).toBe('succeeded')
      }
    }
  })

  it('settles the row in exactly one write', async () => {
    await create()

    expect(UPDATES).toHaveLength(1)
    expect(UPDATES[0]!.status).toBe('succeeded')
    expect(UPDATES[0]!.provider_job_id).toBe('hf-sync-gen-1')
    expect(UPDATES[0]!.progress).toBe(1)
    expect(UPDATES[0]!.completed_at).toBeTruthy()
  })

  it('never marks the row running, because it never was', async () => {
    await create()
    expect(UPDATES.some((update) => update.status === 'running')).toBe(false)
  })

  it('charges once and refunds nothing for a job that succeeded', async () => {
    await create()

    expect(spent).toBe(1)
    expect(refunded).toBe(0)
  })

  it('inserts the row queued with no job id, which a sweep treats as a no-op', async () => {
    await create()

    expect(INSERTS).toHaveLength(1)
    expect(INSERTS[0]!.status).toBe('queued')
    expect('provider_job_id' in INSERTS[0]!).toBe(false)
  })

  it('still refunds when the synchronous result is a failure', async () => {
    immediate = {
      status: 'failed',
      error: { code: 'MODEL_GATED', message: 'Accept the licence.', retryable: false },
    }

    await create()

    expect(refunded).toBe(1)
    expect(UPDATES[0]!.status).toBe('failed')
    expect(UPDATES[0]!.error_code).toBe('MODEL_GATED')
    // The job id rides along on the terminal write here too.
    expect(UPDATES[0]!.provider_job_id).toBe('hf-sync-gen-1')
  })
})

describe('a provider with a real queue', () => {
  it('marks the row running with its job id, so the ticker can advance it', async () => {
    immediate = undefined

    await create()

    expect(UPDATES).toHaveLength(1)
    expect(UPDATES[0]!.status).toBe('running')
    expect(UPDATES[0]!.provider_job_id).toBe('hf-sync-gen-1')
    expect(spent).toBe(1)
    expect(refunded).toBe(0)
  })
})
