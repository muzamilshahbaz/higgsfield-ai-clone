import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ProviderRequestError, type GenerationRequest } from '@/lib/ai/types'
import huggingface, {
  buildHuggingFaceBody,
  clearPartnerCache,
  livePartnersFrom,
  readImage,
} from '@/services/ai/providers/huggingface'

/**
 * The Hugging Face driver.
 *
 * Two things make it unlike the other two, and both are load bearing here.
 *
 * It has no queue: submit returns the image, so a whole job is one call. And it
 * does not know in advance who will run the model — Hugging Face routes to
 * partners now, so the driver asks the Hub which partners are live, then tries
 * them until one accepts an OpenAI-shaped request. Every test below stubs
 * `fetch`, so the request shape is as much the subject as the response parsing.
 *
 * The live counterpart is tests/provider-probe.live.test.ts.
 */

const KEY = 'hf_aaaaaaaaaaaaaaaaaaaaaaaaaaaa'

function request(overrides: Partial<GenerationRequest> = {}): GenerationRequest {
  return {
    generationId: '11111111-1111-4111-8111-111111111111',
    task: 'text_to_image',
    modelId: 'lumen-flash',
    prompt: 'a lighthouse in fog',
    aspectRatio: '16:9',
    params: { num_inference_steps: 4 },
    ...overrides,
  }
}

/** A one-pixel PNG, as the bytes a partner would base64 into its response. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
)

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** The Hub's answer: which partners serve the model. */
function mappingResponse(
  partners: Array<{ provider: string; status?: string; task?: string }> = [
    { provider: 'nscale', status: 'live', task: 'text-to-image' },
  ],
) {
  return json({ inferenceProviderMapping: partners })
}

/** A partner's answer: one image, base64, OpenAI images shape. */
function imageResponse(bytes: Buffer = PNG) {
  return json({ data: [{ b64_json: bytes.toString('base64') }] })
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

beforeEach(() => {
  clearPartnerCache()
})

afterEach(() => {
  vi.unstubAllGlobals()
  clearPartnerCache()
})

describe('buildHuggingFaceBody', () => {
  it('sends the OpenAI images shape, which is the only one these partners take', () => {
    const body = buildHuggingFaceBody(request(), 'black-forest-labs/FLUX.1-schnell')

    expect(body.model).toBe('black-forest-labs/FLUX.1-schnell')
    expect(body.prompt).toBe('a lighthouse in fog')
    expect(body.response_format).toBe('b64_json')
    expect(typeof body.size).toBe('string')
  })

  it('turns an aspect ratio into an exact pixel size', () => {
    const size = String(buildHuggingFaceBody(request({ aspectRatio: '16:9' }), 'm').size)
    const match = /^(\d+)x(\d+)$/.exec(size)
    expect(match, size).not.toBeNull()

    const width = Number(match![1])
    const height = Number(match![2])

    expect(width / height).toBeCloseTo(16 / 9, 1)
    // Multiples of 32: an odd size is a shape error deep inside the UNet.
    expect(width % 32).toBe(0)
    expect(height % 32).toBe(0)
  })

  it('asks a square model for a square frame', () => {
    expect(buildHuggingFaceBody(request({ aspectRatio: '1:1' }), 'm').size).toMatch(
      /^(\d+)x\1$/,
    )
  })

  it('strips control characters out of a pasted prompt', () => {
    const body = buildHuggingFaceBody(request({ prompt: 'a lighthouse\u0000\u001b in fog' }), 'm')
    expect(body.prompt).toBe('a lighthouse in fog')
  })

  it('sends nothing the shape has no place for', () => {
    // negative_prompt, guidance and seed are not part of the OpenAI images API,
    // and FLUX.1 [schnell] is guidance-distilled besides. Sending them would be
    // cargo that reads as a supported feature.
    const body = buildHuggingFaceBody(
      request({ negativePrompt: 'blurry, watermark', seed: 42 }),
      'm',
    )

    expect(Object.keys(body).sort()).toEqual(['model', 'prompt', 'response_format', 'size'])
  })
})

describe('livePartnersFrom', () => {
  it('reads the array form the Hub returns', () => {
    expect(
      livePartnersFrom([
        { provider: 'nscale', status: 'live', task: 'text-to-image' },
        { provider: 'fal-ai', status: 'live', task: 'text-to-image' },
      ]),
    ).toEqual(['nscale', 'fal-ai'])
  })

  it('reads the object form too, since the Hub has used both', () => {
    expect(
      livePartnersFrom({
        nscale: { status: 'live', task: 'text-to-image' },
        together: { status: 'error', task: 'text-to-image' },
      }),
    ).toEqual(['nscale'])
  })

  it('drops anything not live', () => {
    // `together` was listed as status=error for FLUX.1 [schnell] when this was
    // written. Sending a job there would fail after the debit.
    expect(
      livePartnersFrom([
        { provider: 'together', status: 'error', task: 'text-to-image' },
        { provider: 'staging', status: 'staging', task: 'text-to-image' },
      ]),
    ).toEqual([])
  })

  it('drops a partner serving a different task', () => {
    expect(
      livePartnersFrom([{ provider: 'nscale', status: 'live', task: 'text-to-video' }]),
    ).toEqual([])
  })

  it('returns nothing for a shape it does not recognise', () => {
    expect(livePartnersFrom(null)).toEqual([])
    expect(livePartnersFrom('nope')).toEqual([])
    expect(livePartnersFrom(undefined)).toEqual([])
  })
})

describe('readImage', () => {
  it('decodes base64 into a data url the asset service can store', () => {
    const asset = readImage(JSON.stringify({ data: [{ b64_json: PNG.toString('base64') }] }))

    expect(asset.kind).toBe('image')
    expect(asset.url.startsWith('data:image/png;base64,')).toBe(true)
    expect(asset.sizeBytes).toBe(PNG.byteLength)
  })

  it('reads the type from the bytes, because the response has no content type', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
    const asset = readImage(JSON.stringify({ data: [{ b64_json: jpeg.toString('base64') }] }))

    expect(asset.mimeType).toBe('image/jpeg')
  })

  it('accepts a url from a partner that ignored response_format', () => {
    const asset = readImage(JSON.stringify({ data: [{ url: 'https://cdn.test/out.png' }] }))
    expect(asset.url).toBe('https://cdn.test/out.png')
  })

  it('fails an empty image rather than storing zero bytes', () => {
    expect(() => readImage(JSON.stringify({ data: [{ b64_json: '' }] }))).toThrow(/no image/i)
  })

  it('fails a response carrying no image at all', () => {
    expect(() => readImage(JSON.stringify({ data: [] }))).toThrow(/no image/i)
  })

  it('fails a response that is not JSON', () => {
    expect(() => readImage('<html>502</html>')).toThrow(/not JSON/i)
  })
})

describe('submit', () => {
  it('asks the Hub who serves the model, then generates on that partner', async () => {
    const calls = stubFetch(mappingResponse(), imageResponse())

    const result = await huggingface.createDriver!(KEY).submit(request())

    expect(calls[0]!.url).toContain(
      'huggingface.co/api/models/black-forest-labs/FLUX.1-schnell?expand[]=inferenceProviderMapping',
    )
    expect(calls[1]!.url).toBe('https://router.huggingface.co/nscale/v1/images/generations')
    expect(result.immediate?.status).toBe('succeeded')
    expect(result.immediate?.assets).toHaveLength(1)
    expect(result.providerJobId).toContain('hf-sync')
  })

  it('sends the token as a bearer credential', async () => {
    const calls = stubFetch(mappingResponse(), imageResponse())
    await huggingface.createDriver!(KEY).submit(request())

    for (const call of calls) {
      expect((call.init.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`)
    }
  })

  it('names the model the registry names, not the id the user picked', async () => {
    const calls = stubFetch(mappingResponse(), imageResponse())
    await huggingface.createDriver!(KEY).submit(request({ modelId: 'lumen-flash' }))

    const body = JSON.parse(String(calls[1]!.init.body)) as { model: string }
    expect(body.model).toBe('black-forest-labs/FLUX.1-schnell')
  })

  it('skips a partner that serves the model but not over this API', async () => {
    // fal.ai and Replicate both answer exactly this. They are reachable — this
    // app talks to them natively — just not through the images path.
    const calls = stubFetch(
      mappingResponse([
        { provider: 'fal-ai', status: 'live', task: 'text-to-image' },
        { provider: 'nscale', status: 'live', task: 'text-to-image' },
      ]),
      json({ detail: 'Application "images" not found' }, 404),
      imageResponse(),
    )

    const result = await huggingface.createDriver!(KEY).submit(request())

    expect(result.immediate?.status).toBe('succeeded')
    expect(calls[1]!.url).toContain('/fal-ai/')
    expect(calls[2]!.url).toContain('/nscale/')
  })

  it('remembers which partner worked, so the next job skips the discovery', async () => {
    // Three distinct responses, not two: a Response body can only be read once,
    // so the second job needs its own image rather than the first one's husk.
    const calls = stubFetch(mappingResponse(), imageResponse(), imageResponse())
    const driver = huggingface.createDriver!(KEY)

    await driver.submit(request())
    await driver.submit(request())

    const mappingLookups = calls.filter((call) => call.url.includes('/api/models/'))
    expect(mappingLookups).toHaveLength(1)
  })

  it('refuses when no partner is live, rather than guessing at one', async () => {
    stubFetch(mappingResponse([{ provider: 'together', status: 'error', task: 'text-to-image' }]))

    const failure = (await huggingface
      .createDriver!(KEY)
      .submit(request())
      .catch((cause: unknown) => cause)) as ProviderRequestError

    expect(failure.code).toBe('MODEL_UNAVAILABLE')
    expect(failure.retryable).toBe(false)
    expect(failure.message).toMatch(/fal\.ai or Replicate/)
  })

  it('refuses when every live partner declines the request shape', async () => {
    stubFetch(
      mappingResponse([
        { provider: 'fal-ai', status: 'live', task: 'text-to-image' },
        { provider: 'replicate', status: 'live', task: 'text-to-image' },
      ]),
      json({ error: 'Model not supported by provider fal-ai' }, 400),
      json({ error: 'Model not supported by provider replicate' }, 400),
    )

    const failure = (await huggingface
      .createDriver!(KEY)
      .submit(request())
      .catch((cause: unknown) => cause)) as ProviderRequestError

    expect(failure.code).toBe('MODEL_UNAVAILABLE')
    expect(failure.message).toMatch(/fal\.ai or Replicate/)
  })

  it('stops on an answer about the key instead of trying every partner', async () => {
    const calls = stubFetch(
      mappingResponse([
        { provider: 'nscale', status: 'live', task: 'text-to-image' },
        { provider: 'wavespeed', status: 'live', task: 'text-to-image' },
      ]),
      json({ error: 'Invalid credentials' }, 401),
    )

    await expect(huggingface.createDriver!(KEY).submit(request())).rejects.toThrow(
      /rejected the API key/i,
    )

    // Mapping + one partner. A 401 is the same everywhere; asking again just
    // doubles the wait before the same failure.
    expect(calls).toHaveLength(2)
  })

  it('tells the user to accept a licence, not to check a key that is fine', async () => {
    // A gated repo answers 403 to a valid token until the licence is accepted.
    // The generic 403 message would send them to re-paste a working key forever.
    stubFetch(
      mappingResponse(),
      json({ error: 'Access to model black-forest-labs/FLUX.1-schnell is restricted' }, 403),
    )

    const failure = (await huggingface
      .createDriver!(KEY)
      .submit(request())
      .catch((cause: unknown) => cause)) as ProviderRequestError

    expect(failure.code).toBe('MODEL_GATED')
    expect(failure.retryable).toBe(false)
    expect(failure.message).toContain('black-forest-labs/FLUX.1-schnell')
    expect(failure.message).not.toMatch(/rejected the API key/i)
  })

  it('reports a cold model as retryable, with how long it will take', async () => {
    stubFetch(mappingResponse(), json({ error: 'Model is loading', estimated_time: 21.4 }, 503))

    const failure = (await huggingface
      .createDriver!(KEY)
      .submit(request())
      .catch((cause: unknown) => cause)) as ProviderRequestError

    expect(failure.code).toBe('MODEL_LOADING')
    expect(failure.retryable).toBe(true)
    expect(failure.message).toContain('22s')
  })

  it('reports a retired model as retired, which is what 410 means here', async () => {
    // hf-inference answers 410 for every image model it used to host. The
    // generic message would call that a server error and invite a retry.
    stubFetch(
      mappingResponse(),
      json({ error: 'The requested model is deprecated and no longer supported' }, 410),
    )

    const failure = (await huggingface
      .createDriver!(KEY)
      .submit(request())
      .catch((cause: unknown) => cause)) as ProviderRequestError

    expect(failure.code).toBe('MODEL_UNAVAILABLE')
    expect(failure.retryable).toBe(false)
  })

  it('refuses a video task instead of charging for one it cannot run', async () => {
    const calls = stubFetch(mappingResponse(), imageResponse())

    await expect(
      huggingface.createDriver!(KEY).submit(request({ task: 'text_to_video' })),
    ).rejects.toThrow(/only runs image generations/i)

    expect(calls).toHaveLength(0)
  })

  it('refuses a model with no Hugging Face route', async () => {
    await expect(
      huggingface.createDriver!(KEY).submit(request({ modelId: 'motion-turbo' })),
    ).rejects.toThrow(/not served by/i)
  })
})

describe('poll', () => {
  it('fails a synchronous job that was somehow left in flight', async () => {
    const result = await huggingface.createDriver!(KEY).poll('hf-sync-whatever')

    expect(result.status).toBe('failed')
    expect(result.error?.code).toBe('SYNC_RESULT_LOST')
    // Retryable, because nothing about the request was wrong.
    expect(result.error?.retryable).toBe(true)
  })
})

describe('verifyKey', () => {
  it('accepts a token the account endpoint recognises', async () => {
    stubFetch(json({ name: 'someone' }))

    const result = await huggingface.verifyKey(KEY)
    expect(result.status).toBe('valid')
  })

  it('reports a revoked token as invalid, not as a network problem', async () => {
    stubFetch(new Response('Invalid credentials', { status: 401 }))

    const result = await huggingface.verifyKey(KEY)
    expect(result.status).toBe('invalid')
  })

  it('rejects an empty token without asking anybody', async () => {
    const calls = stubFetch(json({}))

    const result = await huggingface.verifyKey('   ')
    expect(result.status).toBe('invalid')
    expect(calls).toHaveLength(0)
  })
})
