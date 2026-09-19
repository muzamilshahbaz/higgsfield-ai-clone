import { afterEach, describe, expect, it, vi } from 'vitest'

import { MockProvider } from '@/lib/ai/providers/mock'
import { requireModel } from '@/lib/ai/registry'
import type { GenerationRequest } from '@/lib/ai/types'

const provider = new MockProvider()

function request(overrides: Partial<GenerationRequest> = {}): GenerationRequest {
  return {
    generationId: 'gen-0001',
    task: 'image_to_video',
    modelId: 'motion-turbo',
    prompt: 'a lighthouse in a storm, crash zoom in',
    aspectRatio: '16:9',
    durationSec: 5,
    ...overrides,
  }
}

/** Freezes the clock so poll() sees exactly the elapsed time we want. */
function at(ms: number) {
  vi.useFakeTimers()
  vi.setSystemTime(ms)
}

afterEach(() => {
  vi.useRealTimers()
})

describe('MockProvider.submit', () => {
  it('reports itself as the mock driver', () => {
    expect(provider.name).toBe('mock')
  })

  it('encodes the whole job into the id, so nothing is held in memory', async () => {
    at(1_000_000)
    const { providerJobId } = await provider.submit(request())
    const parts = providerJobId.split('_')

    expect(parts[0]).toBe('mock')
    expect(Number(parts[1])).toBe(1_000_000)
    expect(Number(parts[2])).toBeGreaterThan(0)
    expect(['ok', 'fail']).toContain(parts[3])
    expect(Number(parts[4])).toBeGreaterThanOrEqual(0)
  })

  it('is deterministic: the same generation id always rolls the same outcome', async () => {
    at(1_000_000)
    const a = await provider.submit(request({ generationId: 'stable-id' }))
    const b = await provider.submit(request({ generationId: 'stable-id' }))
    expect(a.providerJobId).toBe(b.providerJobId)
  })

  it('keeps simulated latency within 35% of the model average', async () => {
    const model = requireModel('motion-turbo')
    for (let i = 0; i < 200; i += 1) {
      at(1_000_000)
      const { providerJobId } = await provider.submit(request({ generationId: `gen-${i}` }))
      const durationMs = Number(providerJobId.split('_')[2])
      expect(durationMs).toBeGreaterThanOrEqual(model.avgLatencySec * 1000 * 0.65)
      expect(durationMs).toBeLessThanOrEqual(model.avgLatencySec * 1000 * 1.35)
    }
  })

  it('rejects a model that is not in the registry', async () => {
    await expect(provider.submit(request({ modelId: 'not-a-model' }))).rejects.toThrow(
      /Unknown model id/,
    )
  })

  it('fails some jobs but nowhere near all of them, so refunds are demoable', async () => {
    let failures = 0
    const total = 600
    for (let i = 0; i < total; i += 1) {
      at(1_000_000)
      const { providerJobId } = await provider.submit(request({ generationId: `roll-${i}` }))
      if (providerJobId.split('_')[3] === 'fail') failures += 1
    }
    expect(failures).toBeGreaterThan(0)
    expect(failures / total).toBeLessThan(0.25)
  })
})

describe('MockProvider.poll', () => {
  /** Submits at t=0 and polls after `elapsedRatio` of the job's own duration. */
  async function pollAfter(elapsedRatio: number, overrides: Partial<GenerationRequest> = {}) {
    at(1_000_000)
    const req = request(overrides)
    const { providerJobId } = await provider.submit(req)
    const durationMs = Number(providerJobId.split('_')[2])
    at(1_000_000 + Math.round(durationMs * elapsedRatio))
    return { result: await provider.poll(providerJobId, req), providerJobId }
  }

  it('reports queued before work starts', async () => {
    const { result } = await pollAfter(0)
    expect(result.status).toBe('queued')
    expect(result.progress).toBe(0)
  })

  it('reports running with monotonic progress in between', async () => {
    const early = await pollAfter(0.2)
    const late = await pollAfter(0.8)

    expect(early.result.status).toBe('running')
    expect(late.result.status).toBe('running')
    expect(late.result.progress!).toBeGreaterThan(early.result.progress!)
    expect(late.result.progress!).toBeLessThan(1)
  })

  it('never reports 100% while still running', async () => {
    for (const ratio of [0.1, 0.3, 0.5, 0.7, 0.9, 0.99]) {
      const { result } = await pollAfter(ratio)
      expect(result.progress!, `ratio ${ratio}`).toBeLessThanOrEqual(0.97)
    }
  })

  it('reaches a terminal state once the duration has elapsed', async () => {
    const { result } = await pollAfter(1.5)
    expect(['succeeded', 'failed']).toContain(result.status)
    expect(result.progress).toBe(1)
  })

  it('is stable across repeated polls, so ticker and sweeper agree', async () => {
    at(1_000_000)
    const req = request()
    const { providerJobId } = await provider.submit(req)
    at(2_000_000)

    const first = await provider.poll(providerJobId, req)
    const second = await provider.poll(providerJobId, req)
    expect(second).toEqual(first)
  })

  it('returns a video asset for a video task', async () => {
    // Walk generation ids until we land on one that is rolled to succeed.
    for (let i = 0; i < 50; i += 1) {
      const video = await pollAfter(1.5, { generationId: `v-${i}` })
      if (video.result.status !== 'succeeded') continue

      expect(video.result.assets).toHaveLength(1)
      expect(video.result.assets![0]!.kind).toBe('video')
      expect(video.result.assets![0]!.durationMs).toBe(5000)
      expect(video.result.assets![0]!.url).toMatch(/^\/samples\/shot-\d\d\.svg$/)
      return
    }
    throw new Error('no successful video job in 50 rolls')
  })

  it('returns an image asset with no duration for text_to_image', async () => {
    for (let i = 0; i < 50; i += 1) {
      const image = await pollAfter(1.5, {
        generationId: `i-${i}`,
        task: 'text_to_image',
        modelId: 'lumen-pro',
        durationSec: null,
      })
      if (image.result.status !== 'succeeded') continue

      expect(image.result.assets![0]!.kind).toBe('image')
      expect(image.result.assets![0]!.durationMs).toBeUndefined()
      return
    }
    throw new Error('no successful image job in 50 rolls')
  })

  it('attaches a structured, classified error when a job fails', async () => {
    for (let i = 0; i < 100; i += 1) {
      const { result } = await pollAfter(1.5, { generationId: `f-${i}` })
      if (result.status !== 'failed') continue

      expect(result.error).toBeDefined()
      expect(result.error!.code).toBeTruthy()
      expect(result.error!.message).toBeTruthy()
      // A content-filter rejection cannot be fixed by retrying the same prompt.
      expect(result.error!.retryable).toBe(result.error!.code !== 'CONTENT_FILTER')
      return
    }
    throw new Error('no failed job in 100 rolls')
  })

  it('fails closed on a malformed job id instead of hanging the job', async () => {
    for (const bad of ['', 'nonsense', 'mock_1_2', 'other_1_2_ok_0', 'mock_x_y_ok_0']) {
      const result = await provider.poll(bad)
      expect(result.status, bad).toBe('failed')
      expect(result.error!.code, bad).toBe('BAD_JOB_ID')
      expect(result.error!.retryable, bad).toBe(false)
    }
  })

  it('treats a missing request as a video job rather than throwing', async () => {
    at(1_000_000)
    const { providerJobId } = await provider.submit(request({ generationId: 'no-req' }))
    at(3_000_000)
    const result = await provider.poll(providerJobId)
    expect(['succeeded', 'failed']).toContain(result.status)
  })
})
