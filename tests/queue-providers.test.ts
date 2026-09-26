import { afterEach, describe, expect, it, vi } from 'vitest'

import type { GenerationRequest } from '@/lib/ai/types'
import fal, { assetsFromFal, buildFalInput, decodeJobId, encodeJobId } from '@/services/ai/providers/fal'
import replicate, {
  assetsFromReplicate,
  buildReplicateInput,
  clearVersionCache,
  splitModelPath,
} from '@/services/ai/providers/replicate'

/**
 * fal.ai and Replicate — the two providers with a real job queue.
 *
 * Both follow the same lifecycle (submit returns a handle, poll advances it) so
 * they are tested together, and both are tested through a stubbed `fetch`. What
 * matters in here is the request shape as much as the response parsing: a key
 * these APIs do not declare is a 422 charged to the user, and a duration we
 * fail to send is a clip shorter than the one they paid for.
 */

const FAL_KEY = 'fal-key-0000:secret'
const REPLICATE_KEY = 'r8_aaaaaaaaaaaaaaaaaaaaaaaa'

function request(overrides: Partial<GenerationRequest> = {}): GenerationRequest {
  return {
    generationId: '22222222-2222-4222-8222-222222222222',
    task: 'text_to_image',
    modelId: 'lumen-flash',
    prompt: 'a lighthouse in fog',
    aspectRatio: '16:9',
    params: {},
    ...overrides,
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function stubFetch(...responses: Response[]) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  let index = 0

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL, init: RequestInit = {}) => {
      calls.push({ url: String(url), init })
      const response = responses[Math.min(index, responses.length - 1)]
      index += 1
      if (!response) throw new Error('no stubbed response')
      return response
    }),
  )

  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
  clearVersionCache()
})

// ---------------------------------------------------------------------------
// fal.ai
// ---------------------------------------------------------------------------

describe('buildFalInput', () => {
  it('sends an explicit size for an image, which needs no per-app enum', () => {
    const input = buildFalInput(request({ aspectRatio: '1:1' }), {})
    const size = input.image_size as { width: number; height: number }

    expect(size.width).toBe(size.height)
    expect(input.enable_safety_checker).toBe(true)
  })

  it('sends a duration in seconds for video, which is what fal reads', () => {
    const input = buildFalInput(
      request({ task: 'text_to_video', modelId: 'motion-scene', durationSec: 5 }),
      {},
    )

    expect(input.duration).toBe(5)
    expect('image_size' in input).toBe(false)
  })

  it('sends the start frame under image_url for image-to-video', () => {
    const input = buildFalInput(
      request({
        task: 'image_to_video',
        modelId: 'motion-turbo',
        imageUrl: 'https://example.test/frame.png',
        durationSec: 5,
      }),
      {},
    )

    expect(input.image_url).toBe('https://example.test/frame.png')
  })

  it('omits a step count and guidance the preset did not set', () => {
    const input = buildFalInput(request({ params: {} }), {})

    expect('num_inference_steps' in input).toBe(false)
    expect('guidance_scale' in input).toBe(false)
  })

  it('lets a route override the generic shape, last', () => {
    const input = buildFalInput(request(), { input: { duration: '5', enable_safety_checker: false } })

    expect(input.duration).toBe('5')
    expect(input.enable_safety_checker).toBe(false)
  })
})

describe('fal job ids', () => {
  it('round-trips the request id and the url it must be polled at', () => {
    const encoded = encodeJobId('req-1', 'https://queue.fal.run/fal-ai/flux/requests/req-1')
    expect(decodeJobId(encoded)).toEqual({
      requestId: 'req-1',
      requestUrl: 'https://queue.fal.run/fal-ai/flux/requests/req-1',
    })
  })

  it('refuses a job id pointing anywhere but fal', () => {
    // Otherwise a tampered row could make this driver fetch an arbitrary host
    // with a live provider key attached.
    expect(decodeJobId('req-1|https://evil.test/steal')).toBeNull()
    expect(decodeJobId('a-mock-job-id')).toBeNull()
    expect(decodeJobId('|https://queue.fal.run/x')).toBeNull()
  })
})

describe('assetsFromFal', () => {
  it('reads an image list', () => {
    const assets = assetsFromFal(
      { images: [{ url: 'https://cdn.test/a.png', width: 1024, height: 576 }] },
      false,
    )

    expect(assets).toEqual([
      {
        kind: 'image',
        url: 'https://cdn.test/a.png',
        mimeType: 'image/png',
        width: 1024,
        height: 576,
      },
    ])
  })

  it('treats a still returned alongside a video as its poster', () => {
    const assets = assetsFromFal(
      { video: { url: 'https://cdn.test/a.mp4' }, images: [{ url: 'https://cdn.test/a.jpg' }] },
      true,
    )

    expect(assets.map((asset) => asset.kind)).toEqual(['video', 'poster'])
  })

  it('returns nothing for a completed job that carried no media', () => {
    expect(assetsFromFal({ seed: 1 }, false)).toEqual([])
  })
})

describe('fal submit and poll', () => {
  it('enqueues a job and remembers where to poll it', async () => {
    const calls = stubFetch(
      json({
        request_id: 'req-9',
        status_url: 'https://queue.fal.run/fal-ai/flux/requests/req-9/status',
      }),
    )

    const result = await fal.createDriver!(FAL_KEY).submit(request())

    expect(calls[0]!.url).toBe('https://queue.fal.run/fal-ai/flux/schnell')
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe(`Key ${FAL_KEY}`)
    expect(decodeJobId(result.providerJobId)?.requestId).toBe('req-9')
    // A queue job is not finished, so nothing may be applied inline.
    expect(result.immediate).toBeUndefined()
  })

  it('derives a poll url when fal returns only a request id', async () => {
    stubFetch(json({ request_id: 'req-9' }))

    const result = await fal
      .createDriver!(FAL_KEY)
      .submit(request({ modelId: 'motion-scene', task: 'text_to_video', durationSec: 5 }))

    // The queue answers on the app's first two path segments, not the whole
    // versioned path.
    expect(decodeJobId(result.providerJobId)?.requestUrl).toBe(
      'https://queue.fal.run/fal-ai/wan/requests/req-9',
    )
  })

  it('refuses an image-to-video job with no start frame, before spending', async () => {
    const calls = stubFetch(json({ request_id: 'x' }))

    await expect(
      fal.createDriver!(FAL_KEY).submit(
        request({ task: 'image_to_video', modelId: 'motion-turbo', durationSec: 5 }),
      ),
    ).rejects.toThrow(/needs a start frame/i)

    expect(calls).toHaveLength(0)
  })

  it('maps the queue vocabulary onto our statuses', async () => {
    const driver = fal.createDriver!(FAL_KEY)
    const jobId = encodeJobId('req-9', 'https://queue.fal.run/fal-ai/flux/requests/req-9')

    stubFetch(json({ status: 'IN_QUEUE', queue_position: 3 }))
    expect((await driver.poll(jobId)).status).toBe('queued')

    vi.unstubAllGlobals()
    stubFetch(json({ status: 'IN_PROGRESS' }))
    expect((await driver.poll(jobId)).status).toBe('running')
  })

  it('fetches the result separately once the job completes', async () => {
    const calls = stubFetch(
      json({ status: 'COMPLETED' }),
      json({ images: [{ url: 'https://cdn.test/out.png', width: 1024, height: 576 }] }),
    )

    const result = await fal
      .createDriver!(FAL_KEY)
      .poll(
        encodeJobId('req-9', 'https://queue.fal.run/fal-ai/flux/requests/req-9'),
        request(),
      )

    expect(calls[0]!.url).toMatch(/\/status$/)
    expect(calls[1]!.url).toBe('https://queue.fal.run/fal-ai/flux/requests/req-9')
    expect(result.status).toBe('succeeded')
    expect(result.assets?.[0]?.url).toBe('https://cdn.test/out.png')
  })

  it('fails a completed job that produced no media, rather than succeeding empty', async () => {
    stubFetch(json({ status: 'COMPLETED' }), json({ seed: 7 }))

    const result = await fal
      .createDriver!(FAL_KEY)
      .poll(encodeJobId('req-9', 'https://queue.fal.run/fal-ai/flux/requests/req-9'), request())

    expect(result.status).toBe('failed')
    expect(result.error?.code).toBe('NO_OUTPUT')
  })

  it('surfaces the queue error message on a failed job', async () => {
    stubFetch(json({ status: 'ERROR', error: { message: 'out of capacity' } }))

    const result = await fal
      .createDriver!(FAL_KEY)
      .poll(encodeJobId('req-9', 'https://queue.fal.run/fal-ai/flux/requests/req-9'))

    expect(result.status).toBe('failed')
    expect(result.error?.message).toContain('out of capacity')
  })

  it('fails fast on a job id from another provider', async () => {
    const calls = stubFetch(json({}))
    const result = await fal.createDriver!(FAL_KEY).poll('mock_123_456_ok_0')

    expect(result.status).toBe('failed')
    expect(result.error?.code).toBe('BAD_JOB_ID')
    expect(calls).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Replicate
// ---------------------------------------------------------------------------

describe('splitModelPath', () => {
  it('reads a bare owner/name', () => {
    expect(splitModelPath('black-forest-labs/flux-schnell')).toEqual({
      model: 'black-forest-labs/flux-schnell',
      version: null,
    })
  })

  it('reads a pinned version', () => {
    expect(splitModelPath('owner/name:abc123')).toEqual({ model: 'owner/name', version: 'abc123' })
  })
})

describe('buildReplicateInput', () => {
  it('sends an aspect ratio string where the model declares one', () => {
    const input = buildReplicateInput(request({ aspectRatio: '21:9' }), {
      sizing: 'aspect_ratio',
    })

    expect(input.aspect_ratio).toBe('21:9')
    expect('width' in input).toBe(false)
  })

  it('degrades an unsupported ratio to the nearest one the model knows', () => {
    // Passing a ratio Replicate does not list is a 422 after the debit.
    const input = buildReplicateInput(request({ aspectRatio: '4:5' }), { sizing: 'aspect_ratio' })
    expect(['4:5', '9:16', '1:1']).toContain(input.aspect_ratio)
  })

  it('sends dimensions where the model takes width and height', () => {
    const input = buildReplicateInput(request({ aspectRatio: '16:9' }), { sizing: 'dimensions' })

    expect(typeof input.width).toBe('number')
    expect(typeof input.height).toBe('number')
    expect('aspect_ratio' in input).toBe(false)
  })

  it('converts a duration into the frame count the model actually takes', () => {
    // num_frames = duration x fps + 1 — Wan's 81 frames for five seconds.
    const input = buildReplicateInput(
      request({ task: 'text_to_video', modelId: 'motion-scene', durationSec: 5 }),
      { videoFrameRate: 16 },
    )

    expect(input.num_frames).toBe(81)
  })

  it('sends no frame count for a model whose length is fixed', () => {
    const input = buildReplicateInput(
      request({ task: 'text_to_video', modelId: 'motion-scene', durationSec: 5 }),
      {},
    )

    expect('num_frames' in input).toBe(false)
  })

  it('sends a start frame under image, which is what Replicate names it', () => {
    const input = buildReplicateInput(
      request({
        task: 'image_to_video',
        modelId: 'motion-turbo',
        imageUrl: 'https://example.test/frame.png',
      }),
      {},
    )

    expect(input.image).toBe('https://example.test/frame.png')
    expect('image_url' in input).toBe(false)
  })
})

describe('assetsFromReplicate', () => {
  it('reads a single url', () => {
    const assets = assetsFromReplicate('https://cdn.test/out.png', false)
    expect(assets).toEqual([
      { kind: 'image', url: 'https://cdn.test/out.png', mimeType: 'image/png' },
    ])
  })

  it('reads a list, and keeps only the first as the deliverable', () => {
    const assets = assetsFromReplicate(
      ['https://cdn.test/a.mp4', 'https://cdn.test/b.jpg'],
      true,
    )

    expect(assets.map((asset) => asset.kind)).toEqual(['video', 'poster'])
    expect(assets[0]!.mimeType).toBe('video/mp4')
  })

  it('reads a url nested in an object', () => {
    const assets = assetsFromReplicate({ video: { url: 'https://cdn.test/out.mp4' } }, true)
    expect(assets[0]!.url).toBe('https://cdn.test/out.mp4')
  })

  it('ignores output that is not a url at all', () => {
    expect(assetsFromReplicate({ logs: 'done' }, false)).toEqual([])
    expect(assetsFromReplicate(null, false)).toEqual([])
    expect(assetsFromReplicate('not a url', false)).toEqual([])
  })
})

describe('replicate submit and poll', () => {
  it('uses the official-model endpoint first', async () => {
    const calls = stubFetch(json({ id: 'pred-1', status: 'starting' }, 201))

    const result = await replicate.createDriver!(REPLICATE_KEY).submit(request())

    expect(calls[0]!.url).toBe(
      'https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions',
    )
    expect(result.providerJobId).toBe('pred-1')
  })

  it('resolves the latest version when the model is not an official one', async () => {
    const calls = stubFetch(
      json({ detail: 'Not found' }, 404),
      json({ latest_version: { id: 'ver-abc' } }),
      json({ id: 'pred-2', status: 'starting' }, 201),
    )

    const result = await replicate
      .createDriver!(REPLICATE_KEY)
      .submit(request({ modelId: 'lumen-sdxl' }))

    expect(calls[1]!.url).toBe('https://api.replicate.com/v1/models/stability-ai/sdxl')
    expect(calls[2]!.url).toBe('https://api.replicate.com/v1/predictions')
    expect(JSON.parse(String(calls[2]!.init.body)).version).toBe('ver-abc')
    expect(result.providerJobId).toBe('pred-2')
  })

  it('caches a resolved version rather than asking on every job', async () => {
    const calls = stubFetch(
      json({ detail: 'Not found' }, 404),
      json({ latest_version: { id: 'ver-abc' } }),
      json({ id: 'pred-3', status: 'starting' }, 201),
      json({ detail: 'Not found' }, 404),
      json({ id: 'pred-4', status: 'starting' }, 201),
    )

    const driver = replicate.createDriver!(REPLICATE_KEY)
    await driver.submit(request({ modelId: 'lumen-sdxl' }))
    await driver.submit(request({ modelId: 'lumen-sdxl' }))

    const versionLookups = calls.filter((call) => /\/v1\/models\/[^/]+\/[^/]+$/.test(call.url))
    expect(versionLookups).toHaveLength(1)
  })

  it('does not go looking for a version when the answer was about the key', async () => {
    const calls = stubFetch(json({ detail: 'Invalid token' }, 401))

    await expect(replicate.createDriver!(REPLICATE_KEY).submit(request())).rejects.toThrow(
      /rejected the API key/i,
    )
    expect(calls).toHaveLength(1)
  })

  it('maps the prediction lifecycle onto our statuses', async () => {
    const driver = replicate.createDriver!(REPLICATE_KEY)

    stubFetch(json({ id: 'p', status: 'starting' }))
    expect((await driver.poll('p')).status).toBe('queued')

    vi.unstubAllGlobals()
    stubFetch(json({ id: 'p', status: 'processing' }))
    expect((await driver.poll('p')).status).toBe('running')

    vi.unstubAllGlobals()
    stubFetch(json({ id: 'p', status: 'succeeded', output: ['https://cdn.test/out.png'] }))
    expect((await driver.poll('p', request())).status).toBe('succeeded')
  })

  it('reports a cancelled prediction as not worth retrying', async () => {
    stubFetch(json({ id: 'p', status: 'canceled' }))

    const result = await replicate.createDriver!(REPLICATE_KEY).poll('p')

    expect(result.status).toBe('failed')
    expect(result.error?.code).toBe('CANCELED')
    expect(result.error?.retryable).toBe(false)
  })

  it('surfaces the prediction error message', async () => {
    stubFetch(json({ id: 'p', status: 'failed', error: 'CUDA out of memory' }))

    const result = await replicate.createDriver!(REPLICATE_KEY).poll('p')

    expect(result.status).toBe('failed')
    expect(result.error?.message).toContain('CUDA out of memory')
  })

  it('fails a succeeded prediction that returned nothing usable', async () => {
    stubFetch(json({ id: 'p', status: 'succeeded', output: null }))

    const result = await replicate.createDriver!(REPLICATE_KEY).poll('p', request())

    expect(result.status).toBe('failed')
    expect(result.error?.code).toBe('NO_OUTPUT')
  })

  it('never reports a dollar cost it cannot know', async () => {
    // Replicate bills compute seconds at a rate that depends on the hardware.
    stubFetch(
      json({
        id: 'p',
        status: 'succeeded',
        output: ['https://cdn.test/out.png'],
        metrics: { predict_time: 3.2 },
      }),
    )

    const result = await replicate.createDriver!(REPLICATE_KEY).poll('p', request())
    expect(result.costUsd).toBeUndefined()
  })
})
