import 'server-only'

import { dimensionsFor } from '@/lib/ai/dimensions'
import { requireModel, routeFor } from '@/lib/ai/registry'
import type {
  AIProvider,
  GenerationRequest,
  ProviderPollResult,
  RawAsset,
  SubmitResult,
} from '@/lib/ai/types'

import {
  cleanText,
  interpret,
  probe,
  providerFetch,
  providerHttpError,
  ProviderRequestError,
  toDataUrl,
  type ProviderDriverModule,
} from './base'

/**
 * Hugging Face — the first provider the router tries.
 *
 * One token, minted free at huggingface.co/settings/tokens, runs FLUX.1
 * [schnell]. That is why it leads the route list: it is the shortest path from
 * a fresh account to a real generation.
 *
 * ## What this actually talks to
 *
 * Hugging Face no longer runs these models on its own hardware. `hf-inference`
 * answers 410 — "the requested model is deprecated and no longer supported by
 * provider hf-inference" — for every image model in this catalogue. What it
 * does now is *route* to partner providers, and each partner is reached at its
 * own path under router.huggingface.co.
 *
 * Those partners do not share a request shape. Some expose the OpenAI images
 * API (`/{provider}/v1/images/generations`); fal.ai and Replicate expose their
 * own native queue shapes, and calling the OpenAI path on them returns
 * "Application images not found". So this driver:
 *
 *   1. asks Hugging Face which providers serve the model, and which are live
 *   2. tries them in order at the OpenAI images path
 *   3. skips any that answer "not supported", and caches the one that worked
 *
 * Discovering it rather than hardcoding a partner list means a partner being
 * added, dropped or taken down is a fact this driver reads at run time instead
 * of a deploy. Verified live: `nscale` serves FLUX.1 [schnell] this way and
 * honours an exact pixel size.
 *
 * ## Why only one model routes here
 *
 * FLUX.1 [dev] and SDXL are served through Hugging Face only by fal.ai,
 * Replicate and wavespeed — none of which speak the OpenAI images API. This app
 * already has native fal.ai and Replicate drivers, so sending those models back
 * through Hugging Face would be a second implementation of a provider we
 * already talk to properly. They route straight to fal/Replicate instead, and
 * the registry says so. See docs/PROVIDERS.md.
 *
 * ## The other thing that makes this driver different
 *
 * There is no queue. One POST goes out and the image comes back on the same
 * response, so there is no job id to hand out and nothing to poll. `submit`
 * returns the finished result in `immediate` and the service applies it through
 * the same path a poll result takes — see lib/ai/types.ts (SubmitResult).
 */

const VENDOR = 'Hugging Face'
const ROUTER = 'https://router.huggingface.co'
const HUB = 'https://huggingface.co/api/models'

/** Image models are trained near one megapixel; asking for more degrades them. */
const TARGET_PIXELS = 1024 * 1024

/**
 * How long a resolved partner is trusted.
 *
 * The mapping changes when Hugging Face adds or drops a partner, not within a
 * request. An hour keeps the lookup off the critical path of almost every job
 * while still picking up a partner outage the same working day.
 */
const MAPPING_TTL_MS = 60 * 60 * 1000

interface ProviderMappingEntry {
  provider: string
  status?: string
  task?: string
  providerId?: string
}

const partnerCache = new Map<string, { partners: string[]; expiresAt: number }>()

/** Test seam, and the escape hatch when a partner list has to be re-read now. */
export function clearPartnerCache(): void {
  partnerCache.clear()
}

/**
 * Partners Hugging Face lists as serving this model, live ones first.
 *
 * `status: 'live'` is the only filter applied here. Which of them can actually
 * take an OpenAI-shaped request is not something the mapping says, so it is
 * settled by asking — see `generate`.
 */
export function livePartnersFrom(mapping: unknown): string[] {
  const entries: ProviderMappingEntry[] = Array.isArray(mapping)
    ? (mapping as ProviderMappingEntry[])
    : mapping && typeof mapping === 'object'
      ? Object.entries(mapping as Record<string, Omit<ProviderMappingEntry, 'provider'>>).map(
          ([provider, value]) => ({ provider, ...value }),
        )
      : []

  return entries
    .filter((entry) => entry.status === 'live' && entry.task === 'text-to-image')
    .map((entry) => entry.provider)
    .filter((provider): provider is string => typeof provider === 'string' && provider.length > 0)
}

/**
 * The request body.
 *
 * The OpenAI images shape, which is all the partners on this path accept:
 * `model`, `prompt`, `size`, `response_format`. Verified live — `size` is
 * honoured to the exact pixel, and a field the partner does not know is ignored
 * rather than rejected.
 *
 * Deliberately absent: `negative_prompt`, `guidance_scale`, `seed`. The shape
 * has no place for them, and FLUX.1 [schnell] is guidance-distilled so two of
 * the three would do nothing even if it did. Sending them anyway would be
 * cargo. A user who needs a pinned seed should run the model on fal.ai or
 * Replicate, whose native APIs take one.
 */
export function buildHuggingFaceBody(
  request: GenerationRequest,
  modelPath: string,
): Record<string, unknown> {
  const { width, height } = dimensionsFor(request.aspectRatio, TARGET_PIXELS)

  return {
    model: modelPath,
    prompt: cleanText(request.prompt),
    size: `${width}x${height}`,
    response_format: 'b64_json',
  }
}

/** True when a partner's answer means "wrong door", not "no". */
function isWrongDoor(status: number, body: string): boolean {
  if (status !== 400 && status !== 404) return false

  return /not supported by provider|application .* not found|not found/i.test(body)
}

interface ImagesResponse {
  data?: Array<{ b64_json?: string; url?: string }>
}

class HuggingFaceProvider implements AIProvider {
  readonly name = 'huggingface' as const

  constructor(private readonly key: string) {}

  private get headers(): Record<string, string> {
    return { authorization: `Bearer ${this.key}`, 'content-type': 'application/json' }
  }

  async submit(request: GenerationRequest): Promise<SubmitResult> {
    const model = requireModel(request.modelId)
    const route = routeFor(model, 'huggingface')

    if (!route) {
      // Reachable only if the registry and the router disagree, which is a
      // programming error rather than a provider failure.
      throw new ProviderRequestError(
        'MODEL_UNAVAILABLE',
        `${model.label} is not served by ${VENDOR}.`,
        false,
      )
    }

    if (request.task !== 'text_to_image') {
      throw new ProviderRequestError(
        'MODEL_UNAVAILABLE',
        `${VENDOR} only runs image generations in this build.`,
        false,
      )
    }

    const asset = await this.generate(route.path, buildHuggingFaceBody(request, route.path))

    return {
      // Nothing will ever look this up: it exists so the row carries a provider
      // handle like every other job, and so a lost synchronous result is
      // recognisable in the logs rather than just null.
      providerJobId: `hf-sync-${request.generationId}`,
      immediate: { status: 'succeeded', progress: 1, assets: [asset] },
    }
  }

  /** Runs the model on the first partner that accepts the request. */
  private async generate(modelPath: string, body: Record<string, unknown>): Promise<RawAsset> {
    const partners = await this.partnersFor(modelPath)

    if (partners.length === 0) {
      throw new ProviderRequestError(
        'MODEL_UNAVAILABLE',
        `${VENDOR} has no live provider for this model right now. Try another model, or connect a fal.ai or Replicate key.`,
        false,
      )
    }

    const payload = JSON.stringify(body)
    let lastWrongDoor: string | null = null

    for (const partner of partners) {
      const response = await providerFetch(
        VENDOR,
        `${ROUTER}/${partner}/v1/images/generations`,
        { method: 'POST', headers: this.headers, body: payload },
      )

      if (response.ok) {
        const asset = readImage(response.text)
        // Remember which door opened. The next job for this model goes
        // straight there instead of paying for the same discovery.
        partnerCache.set(modelPath, { partners: [partner], expiresAt: Date.now() + MAPPING_TTL_MS })
        return asset
      }

      if (isWrongDoor(response.status, response.text)) {
        // This partner serves the model but not over this API — fal.ai and
        // Replicate both answer here, and this app talks to them natively
        // anyway. Try the next one.
        lastWrongDoor = partner
        continue
      }

      throw this.explain(response.status, response.text, modelPath)
    }

    throw new ProviderRequestError(
      'MODEL_UNAVAILABLE',
      `No ${VENDOR} provider will serve this model over its images API${
        lastWrongDoor ? ` (${lastWrongDoor} and others declined)` : ''
      }. Connect a fal.ai or Replicate key to run it.`,
      false,
    )
  }

  /** Live partners for a model, from the Hub, cached per process. */
  private async partnersFor(modelPath: string): Promise<string[]> {
    const cached = partnerCache.get(modelPath)
    if (cached && cached.expiresAt > Date.now()) return cached.partners

    const response = await providerFetch(
      VENDOR,
      `${HUB}/${modelPath}?expand[]=inferenceProviderMapping`,
      { headers: this.headers },
    )

    if (!response.ok) throw this.explain(response.status, response.text, modelPath)

    let mapping: unknown
    try {
      mapping = (JSON.parse(response.text) as { inferenceProviderMapping?: unknown })
        .inferenceProviderMapping
    } catch {
      throw new ProviderRequestError(
        'PROVIDER_ERROR',
        `${VENDOR} described this model with something that was not JSON.`,
        true,
      )
    }

    const partners = livePartnersFrom(mapping)
    partnerCache.set(modelPath, { partners, expiresAt: Date.now() + MAPPING_TTL_MS })

    return partners
  }

  /**
   * A cold model and a gated repo are the two failures a new token actually
   * meets, and the generic message is wrong for both.
   *
   * 503 means weights are loading: not the user's fault, fixes itself, so the
   * message says how long and the error is retryable — which is what earns the
   * refund and the "try again" rather than a dead card.
   *
   * 403 means the repo is gated and the account has not accepted its licence.
   * FLUX.1 [dev] is the one in this catalogue. The generic 403 says "check your
   * API key", which would send someone to re-paste a working token forever.
   */
  private explain(status: number, body: string, modelPath: string): ProviderRequestError {
    if (status === 503) {
      const seconds = estimatedSeconds(body)
      const wait = seconds ? ` It should be ready in about ${seconds}s.` : ''
      return new ProviderRequestError(
        'MODEL_LOADING',
        `${VENDOR} is loading this model.${wait} Try again in a moment.`,
        true,
      )
    }

    if (status === 403) {
      return new ProviderRequestError(
        'MODEL_GATED',
        `This model is gated on ${VENDOR}. Accept its licence at huggingface.co/${modelPath}, then try again — your key is fine.`,
        false,
      )
    }

    if (status === 410) {
      return new ProviderRequestError(
        'MODEL_UNAVAILABLE',
        `${VENDOR} has retired this model from the provider it was running on. Pick another model.`,
        false,
      )
    }

    return providerHttpError(VENDOR, status, body)
  }

  /**
   * There is no job to poll.
   *
   * If this is reached, a synchronous result was produced and then lost between
   * the provider answering and the row being written — a crashed invocation, or
   * a deploy torn down mid-request. Failing it is correct and refunds; leaving
   * it running would spin until the timeout for a job that finished minutes ago.
   */
  async poll(): Promise<ProviderPollResult> {
    return {
      status: 'failed',
      progress: 1,
      error: {
        code: 'SYNC_RESULT_LOST',
        message: `The ${VENDOR} result did not survive the request. Nothing was charged — try again.`,
        retryable: true,
      },
    }
  }
}

/**
 * The image out of an OpenAI images response.
 *
 * Both forms are handled because the partners disagree: base64 inline, which is
 * what we ask for and what nscale returns, or a URL for a partner that ignores
 * `response_format`. The asset service stores either.
 */
export function readImage(text: string): RawAsset {
  let parsed: ImagesResponse
  try {
    parsed = JSON.parse(text) as ImagesResponse
  } catch {
    throw new ProviderRequestError(
      'PROVIDER_ERROR',
      `${VENDOR} answered with something that was not JSON.`,
      true,
    )
  }

  const first = parsed.data?.[0]

  if (first?.b64_json) {
    const bytes = Buffer.from(first.b64_json, 'base64')
    if (bytes.byteLength === 0) {
      throw new ProviderRequestError(
        'NO_OUTPUT',
        `${VENDOR} returned an empty image.`,
        true,
      )
    }

    return {
      kind: 'image',
      url: toDataUrl(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), mimeOf(bytes)),
      mimeType: mimeOf(bytes),
      sizeBytes: bytes.byteLength,
    }
  }

  if (first?.url) {
    return { kind: 'image', url: first.url, mimeType: 'image/png' }
  }

  throw new ProviderRequestError(
    'NO_OUTPUT',
    `${VENDOR} finished the job but returned no image.`,
    true,
  )
}

/**
 * The type from the bytes, not from a header.
 *
 * The response is JSON, so there is no content type for the image inside it,
 * and the extension the asset service picks comes from this. Magic numbers are
 * the only honest source.
 */
function mimeOf(bytes: Buffer): string {
  if (bytes.length >= 8 && bytes.readUInt32BE(0) === 0x89504e47) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (bytes.length >= 12 && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'

  return 'image/png'
}

/** Seconds from `{"error": "...", "estimated_time": 20.5}`, when present. */
function estimatedSeconds(body: string): number | null {
  try {
    const parsed: unknown = JSON.parse(body)
    if (parsed && typeof parsed === 'object' && 'estimated_time' in parsed) {
      const value = (parsed as { estimated_time: unknown }).estimated_time
      if (typeof value === 'number' && Number.isFinite(value)) return Math.ceil(value)
    }
  } catch {
    // Not JSON, or not this shape. The caller has a message without a time.
  }
  return null
}

const huggingface: ProviderDriverModule = {
  id: 'huggingface',

  /**
   * `whoami-v2` is the documented token check. It reads the account behind the
   * token, spends nothing, and returns 401 for a token that has been revoked —
   * which is the one answer that must not be mistaken for a network problem.
   *
   * Worth knowing: it answers for any valid token, including one with no
   * inference permission. A key can therefore verify as connected and still be
   * refused at generation time, which is why the failure there names the
   * permission rather than telling the user to re-paste the key.
   */
  async verifyKey(key) {
    if (!key.trim()) return { status: 'invalid', message: `No ${VENDOR} token was provided.` }

    const result = await probe('https://huggingface.co/api/whoami-v2', {
      headers: { authorization: `Bearer ${key}` },
    })

    return interpret(result, VENDOR)
  },

  createDriver(key) {
    return new HuggingFaceProvider(key)
  },
}

export default huggingface
