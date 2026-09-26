import 'server-only'

import { dimensionsFor, nearestSupportedRatio } from '@/lib/ai/dimensions'
import { requireModel, routeFor, type ModelRoute } from '@/lib/ai/registry'
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
  providerJson,
  ProviderRequestError,
  type ProviderDriverModule,
} from './base'

/**
 * Replicate — the broadest of the three, and the fallback for everything.
 *
 * Predictions are asynchronous, so this is a straight submit/poll driver like
 * fal. The wrinkle is how a model is addressed. Replicate has two ways in:
 *
 *   POST /v1/models/{owner}/{name}/predictions   — official models only
 *   POST /v1/predictions  with a `version` id    — any model, including those
 *
 * A registry route names `owner/name`, which reads well and does not rot every
 * time a maintainer pushes a new version. So `submit` tries the first form and,
 * on the 404 that means "not an official model", resolves the latest version id
 * and uses the second. One extra GET on the first job for a community model,
 * cached afterwards.
 *
 * A route may also pin a version explicitly as `owner/name:<hash>`, which skips
 * all of that — the right choice when a model's output has to be reproducible.
 */

const VENDOR = 'Replicate'
const API = 'https://api.replicate.com/v1'

/** Aspect ratios the FLUX models on Replicate accept as a string. */
const FLUX_RATIOS = ['1:1', '16:9', '9:16', '4:5', '21:9']

function headers(key: string): Record<string, string> {
  return { authorization: `Bearer ${key}`, 'content-type': 'application/json' }
}

interface Prediction {
  id?: string
  status?: string
  output?: unknown
  error?: unknown
  metrics?: { predict_time?: number }
  urls?: { get?: string; cancel?: string }
}

interface ModelResponse {
  latest_version?: { id?: string }
}

/**
 * Resolved version ids, per process.
 *
 * A model's latest version changes when its maintainer pushes, not within a
 * request, so caching for an hour removes a round trip from almost every job
 * without pinning anyone to a stale build for long. Keyed by `owner/name`; the
 * token is not part of the key because a version id is public information.
 */
const versionCache = new Map<string, { id: string; expiresAt: number }>()
const VERSION_TTL_MS = 60 * 60 * 1000

/** Test seam, and the escape hatch if a push has to be picked up immediately. */
export function clearVersionCache(): void {
  versionCache.clear()
}

export function splitModelPath(path: string): { model: string; version: string | null } {
  const separator = path.indexOf(':')
  if (separator <= 0) return { model: path, version: null }

  return { model: path.slice(0, separator), version: path.slice(separator + 1) || null }
}

function numberFrom(params: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = params?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * The `input` object for one prediction.
 *
 * Replicate validates input against each model's own schema and rejects a key
 * it does not declare, so this sends the smallest set that every model in the
 * catalogue shares and lets the route add or correct the rest. That is why
 * `sizing` and `videoFrameRate` exist on a route: they are the two places the
 * models genuinely disagree.
 */
export function buildReplicateInput(
  request: GenerationRequest,
  route: Pick<ModelRoute, 'input' | 'sizing' | 'videoFrameRate'>,
): Record<string, unknown> {
  const params = request.params
  const input: Record<string, unknown> = { prompt: cleanText(request.prompt) }

  const negative = cleanText(request.negativePrompt)
  if (negative) input.negative_prompt = negative

  if (typeof request.seed === 'number' && Number.isFinite(request.seed)) {
    input.seed = request.seed
  }

  if (request.task === 'text_to_image') {
    const sizing = route.sizing ?? 'aspect_ratio'

    if (sizing === 'aspect_ratio') {
      input.aspect_ratio = nearestSupportedRatio(request.aspectRatio, FLUX_RATIOS)
    } else if (sizing === 'dimensions') {
      const { width, height } = dimensionsFor(request.aspectRatio)
      input.width = width
      input.height = height
    }

    const steps = numberFrom(params, 'num_inference_steps')
    if (steps !== undefined) input.num_inference_steps = Math.min(Math.max(1, steps), 60)

    const guidance = numberFrom(params, 'guidance_scale')
    if (guidance !== undefined) input.guidance_scale = guidance
  } else {
    // Replicate's video models take an image under `image`, not `image_url`.
    if (request.imageUrl) input.image = request.imageUrl

    // Only when the route declares a frame rate. A model whose length is fixed
    // must not be handed a frame count it will reject or, worse, honour by
    // producing a clip the user was not charged for.
    if (route.videoFrameRate && request.durationSec) {
      input.num_frames = Math.round(request.durationSec * route.videoFrameRate) + 1
    }
  }

  return { ...input, ...(route.input ?? {}) }
}

/**
 * Replicate's prediction lifecycle.
 * `starting` and `processing` are live; `succeeded`, `failed` and `canceled`
 * are terminal. A status nobody recognises is treated as a failure so a job
 * cannot spin forever on a word we have not seen before.
 */
function mapStatus(status: string | undefined): 'queued' | 'running' | 'succeeded' | 'failed' {
  switch (status) {
    case 'starting':
      return 'queued'
    case 'processing':
      return 'running'
    case 'succeeded':
      return 'succeeded'
    default:
      return 'failed'
  }
}

/**
 * Replicate returns a URL, a list of URLs, or an object with one — depending on
 * whether the model declares one output or many. All three collapse here.
 */
export function assetsFromReplicate(output: unknown, isVideo: boolean): RawAsset[] {
  const urls = collectUrls(output).slice(0, 4)

  return urls.map((url, index) => ({
    // A model that returns several files returns frames or variants of one
    // shot; the first is the deliverable and the rest are not charged for, so
    // only the first is kept as the primary asset kind.
    kind: isVideo ? (index === 0 ? 'video' : 'poster') : 'image',
    url,
    mimeType: mimeFromUrl(url, isVideo && index === 0),
  }))
}

function collectUrls(value: unknown, depth = 0): string[] {
  if (depth > 3) return []

  if (typeof value === 'string') {
    return /^https?:\/\//i.test(value) ? [value] : []
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectUrls(entry, depth + 1))
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return ['url', 'video', 'image', 'output'].flatMap((key) =>
      key in record ? collectUrls(record[key], depth + 1) : [],
    )
  }

  return []
}

function mimeFromUrl(url: string, isVideo: boolean): string {
  const extension = url.split('?')[0]?.split('.').pop()?.toLowerCase()

  if (extension === 'mp4') return 'video/mp4'
  if (extension === 'webm') return 'video/webm'
  if (extension === 'png') return 'image/png'
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
  if (extension === 'webp') return 'image/webp'

  return isVideo ? 'video/mp4' : 'image/png'
}

class ReplicateProvider implements AIProvider {
  readonly name = 'replicate' as const

  constructor(private readonly key: string) {}

  async submit(request: GenerationRequest): Promise<SubmitResult> {
    const model = requireModel(request.modelId)
    const route = routeFor(model, 'replicate')

    if (!route) {
      throw new ProviderRequestError(
        'MODEL_UNAVAILABLE',
        `${model.label} is not served by ${VENDOR}.`,
        false,
      )
    }

    if (request.task === 'image_to_video' && !request.imageUrl) {
      throw new ProviderRequestError(
        'PROVIDER_REJECTED',
        'This model needs a start frame. Upload one and try again.',
        false,
      )
    }

    const body = JSON.stringify({ input: buildReplicateInput(request, route) })
    const { model: modelPath, version } = splitModelPath(route.path)

    const prediction = version
      ? await this.createWithVersion(version, body)
      : await this.createForModel(modelPath, body)

    if (!prediction.id) {
      throw new ProviderRequestError(
        'PROVIDER_ERROR',
        `${VENDOR} accepted the job but returned no prediction id.`,
        true,
      )
    }

    return { providerJobId: prediction.id }
  }

  /** The official-model endpoint, falling back to a resolved version id. */
  private async createForModel(modelPath: string, body: string): Promise<Prediction> {
    const response = await providerFetch(VENDOR, `${API}/models/${modelPath}/predictions`, {
      method: 'POST',
      headers: headers(this.key),
      body,
    })

    if (response.ok) return parsePrediction(response.text)

    // 404 here means "that is not an official model", not "no such model" —
    // the same path is still reachable with a version id, which is what
    // resolveVersion goes and gets. Anything else is a real answer.
    if (response.status !== 404) {
      throw providerHttpError(VENDOR, response.status, response.text)
    }

    const version = await this.resolveVersion(modelPath)
    return this.createWithVersion(version, body)
  }

  private async createWithVersion(version: string, body: string): Promise<Prediction> {
    const payload = JSON.parse(body) as Record<string, unknown>

    return providerJson<Prediction>(VENDOR, `${API}/predictions`, {
      method: 'POST',
      headers: headers(this.key),
      body: JSON.stringify({ ...payload, version }),
    })
  }

  private async resolveVersion(modelPath: string): Promise<string> {
    const cached = versionCache.get(modelPath)
    if (cached && cached.expiresAt > Date.now()) return cached.id

    const model = await providerJson<ModelResponse>(VENDOR, `${API}/models/${modelPath}`, {
      headers: headers(this.key),
    })

    const id = model.latest_version?.id
    if (!id) {
      throw new ProviderRequestError(
        'MODEL_UNAVAILABLE',
        `${VENDOR} has no published version of ${modelPath}.`,
        false,
      )
    }

    versionCache.set(modelPath, { id, expiresAt: Date.now() + VERSION_TTL_MS })
    return id
  }

  async poll(providerJobId: string, request?: GenerationRequest): Promise<ProviderPollResult> {
    const prediction = await providerJson<Prediction>(
      VENDOR,
      `${API}/predictions/${encodeURIComponent(providerJobId)}`,
      { headers: headers(this.key) },
    )

    const mapped = mapStatus(prediction.status)

    if (mapped === 'queued') return { status: 'queued', progress: 0.05 }
    if (mapped === 'running') return { status: 'running', progress: 0.5 }

    if (mapped === 'failed') {
      const canceled = prediction.status === 'canceled'
      return {
        status: 'failed',
        progress: 1,
        error: {
          code: canceled ? 'CANCELED' : 'PROVIDER_ERROR',
          message: canceled
            ? `The ${VENDOR} prediction was canceled.`
            : (textFrom(prediction.error) ?? `${VENDOR} could not finish this job.`),
          retryable: !canceled,
        },
      }
    }

    const isVideo = request ? request.task !== 'text_to_image' : false
    const assets = assetsFromReplicate(prediction.output, isVideo)

    if (assets.length === 0) {
      return {
        status: 'failed',
        progress: 1,
        error: {
          code: 'NO_OUTPUT',
          message: `${VENDOR} finished the job but returned no media.`,
          retryable: true,
        },
      }
    }

    return {
      status: 'succeeded',
      progress: 1,
      assets,
      // Replicate reports compute seconds, not money, and the dollar rate
      // depends on the hardware the model runs on. Reporting nothing is better
      // than reporting a number the billing page would treat as spend.
      costUsd: undefined,
    }
  }

  async cancel(providerJobId: string): Promise<void> {
    await providerFetch(VENDOR, `${API}/predictions/${encodeURIComponent(providerJobId)}/cancel`, {
      method: 'POST',
      headers: headers(this.key),
    })
  }
}

function parsePrediction(text: string): Prediction {
  try {
    return JSON.parse(text) as Prediction
  } catch {
    throw new ProviderRequestError(
      'PROVIDER_ERROR',
      `${VENDOR} answered with something that was not JSON.`,
      true,
    )
  }
}

function textFrom(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.slice(0, 200)
  if (value && typeof value === 'object') {
    const message = (value as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message.slice(0, 200)
  }
  return null
}

const replicate: ProviderDriverModule = {
  id: 'replicate',

  /** `/v1/account` is the documented whoami and bills nothing. */
  async verifyKey(key) {
    if (!key.trim()) return { status: 'invalid', message: `No ${VENDOR} token was provided.` }

    const result = await probe(`${API}/account`, {
      headers: { authorization: `Bearer ${key}` },
    })
    return interpret(result, VENDOR)
  },

  createDriver(key) {
    return new ReplicateProvider(key)
  },
}

export default replicate
