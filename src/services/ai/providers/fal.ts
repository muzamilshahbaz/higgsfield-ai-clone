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
  providerJson,
  ProviderRequestError,
  type ProviderDriverModule,
} from './base'

/**
 * fal.ai — the provider that serves video.
 *
 * Unlike Hugging Face this is a real queue: a submit returns a request id
 * immediately and the job is polled until it completes, which is the only
 * shape that works for a 90-second video generation on a platform with a
 * per-request time limit. Every model in the registry has a fal route except
 * none — it is the one provider that covers the whole catalogue.
 *
 * Two request ids are in play and they are easy to confuse. `request_id` is
 * fal's handle for the job. The *status URL* it must be polled at depends on
 * the application path, and for a versioned path like
 * `fal-ai/wan/v2.2-a14b/text-to-video` the queue answers on the first two
 * segments (`fal-ai/wan`) rather than the whole thing. Rather than re-derive
 * that rule at poll time, `submit` stores the URL fal itself handed back — see
 * `encodeJobId`.
 */

const VENDOR = 'fal.ai'
const QUEUE_BASE = 'https://queue.fal.run'

/** fal's own auth scheme: `Key`, not `Bearer`. */
function headers(key: string): Record<string, string> {
  return { authorization: `Key ${key}`, 'content-type': 'application/json' }
}

interface QueueSubmitResponse {
  request_id?: string
  status_url?: string
  response_url?: string
}

interface QueueStatusResponse {
  status?: string
  queue_position?: number
  response_url?: string
  error?: unknown
  detail?: unknown
}

interface QueueResultResponse {
  images?: Array<{ url?: string; width?: number; height?: number; content_type?: string }>
  image?: { url?: string; width?: number; height?: number; content_type?: string }
  video?: { url?: string; content_type?: string; file_size?: number }
  videos?: Array<{ url?: string; content_type?: string }>
  seed?: number
  timings?: Record<string, number>
}

/**
 * The job id stored on the generation row.
 *
 * `<request id>|<request url>`, because polling needs both and the row has one
 * column for them. The URL is the one fal returned, with `/status` trimmed, so
 * the status endpoint is `<url>/status` and the result endpoint is `<url>` —
 * which is fal's own convention and survives a path rule changing under us.
 */
export function encodeJobId(requestId: string, requestUrl: string): string {
  return `${requestId}|${requestUrl}`
}

export function decodeJobId(
  providerJobId: string,
): { requestId: string; requestUrl: string } | null {
  const separator = providerJobId.indexOf('|')
  if (separator <= 0) return null

  const requestId = providerJobId.slice(0, separator)
  const requestUrl = providerJobId.slice(separator + 1)

  // Only a fal-hosted URL is ever polled. A row that somehow carried a
  // different host would otherwise make this driver fetch it.
  if (!requestUrl.startsWith(`${QUEUE_BASE}/`)) return null

  return { requestId, requestUrl }
}

/** The base request URL for a submit response, whatever fields it carried. */
function requestUrlFrom(submitted: QueueSubmitResponse, path: string): string | null {
  const fromStatus = submitted.status_url?.replace(/\/status\/?$/, '')
  if (fromStatus?.startsWith(`${QUEUE_BASE}/`)) return fromStatus

  if (submitted.response_url?.startsWith(`${QUEUE_BASE}/`)) return submitted.response_url

  // Last resort, from fal's documented shape: the queue answers about a job on
  // the application's first two path segments.
  if (submitted.request_id) {
    const app = path.split('/').slice(0, 2).join('/')
    return `${QUEUE_BASE}/${app}/requests/${submitted.request_id}`
  }

  return null
}

function numberFrom(params: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = params?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * The input payload for one job.
 *
 * fal keeps one input schema per application, so this is shaped by the task
 * rather than by the model: every image app takes `prompt` and `image_size`,
 * every video app takes `prompt` and a duration, and the image-to-video ones
 * additionally take `image_url`. Anything a preset set that fal does not know
 * is dropped here rather than sent — an unknown key is a 422 on some apps and
 * silently ignored on others, and neither is worth the credit.
 */
export function buildFalInput(
  request: GenerationRequest,
  route: { input?: Record<string, unknown> },
): Record<string, unknown> {
  const params = request.params
  const input: Record<string, unknown> = { prompt: cleanText(request.prompt) }

  const negative = cleanText(request.negativePrompt)
  if (negative) input.negative_prompt = negative

  if (typeof request.seed === 'number' && Number.isFinite(request.seed)) {
    input.seed = request.seed
  }

  if (request.task === 'text_to_image') {
    // fal accepts an explicit {width, height} for `image_size`, which is the
    // one form that does not need a per-app enum of named presets.
    input.image_size = dimensionsFor(request.aspectRatio)

    const steps = numberFrom(params, 'num_inference_steps')
    if (steps !== undefined) input.num_inference_steps = Math.min(Math.max(1, steps), 60)

    const guidance = numberFrom(params, 'guidance_scale')
    if (guidance !== undefined) input.guidance_scale = guidance

    // Ours is a paid product with its own moderation story; fal's safety
    // checker silently returns a black frame, which would look like a bug.
    input.enable_safety_checker = true
  } else {
    input.aspect_ratio = request.aspectRatio

    if (request.durationSec) {
      // Some video apps take seconds as a number, others as a string enum
      // ("5"). Sending the number is correct for the current catalogue; the
      // string form lives on the route when an app needs it.
      input.duration = request.durationSec
    }

    if (request.imageUrl) input.image_url = request.imageUrl
  }

  // Route overrides last: they exist precisely to correct this generic shape
  // for one application.
  return { ...input, ...(route.input ?? {}) }
}

/**
 * fal's queue vocabulary.
 * IN_QUEUE / IN_PROGRESS / COMPLETED, and anything else is a failure — which
 * covers both the documented error states and a field they add later.
 */
function mapStatus(status: string | undefined): 'queued' | 'running' | 'succeeded' | 'failed' {
  switch (status) {
    case 'IN_QUEUE':
      return 'queued'
    case 'IN_PROGRESS':
      return 'running'
    case 'COMPLETED':
      return 'succeeded'
    default:
      return 'failed'
  }
}

/** Every media shape fal returns, collapsed to our assets. */
export function assetsFromFal(result: QueueResultResponse, isVideo: boolean): RawAsset[] {
  const assets: RawAsset[] = []

  const video = result.video ?? result.videos?.[0]
  if (isVideo && video?.url) {
    assets.push({
      kind: 'video',
      url: video.url,
      mimeType: video.content_type ?? 'video/mp4',
      sizeBytes: result.video?.file_size,
    })
  }

  const images = result.images ?? (result.image ? [result.image] : [])
  for (const image of images) {
    if (!image?.url) continue
    assets.push({
      // A still returned alongside a video is its poster frame, not a second
      // deliverable — the gallery renders the video and uses this as the
      // placeholder while it loads.
      kind: isVideo ? 'poster' : 'image',
      url: image.url,
      mimeType: image.content_type ?? 'image/png',
      width: image.width,
      height: image.height,
    })
  }

  return assets
}

class FalProvider implements AIProvider {
  readonly name = 'fal' as const

  constructor(private readonly key: string) {}

  async submit(request: GenerationRequest): Promise<SubmitResult> {
    const model = requireModel(request.modelId)
    const route = routeFor(model, 'fal')

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

    const submitted = await providerJson<QueueSubmitResponse>(
      VENDOR,
      `${QUEUE_BASE}/${route.path}`,
      {
        method: 'POST',
        headers: headers(this.key),
        body: JSON.stringify(buildFalInput(request, route)),
      },
    )

    const requestUrl = submitted.request_id ? requestUrlFrom(submitted, route.path) : null

    if (!submitted.request_id || !requestUrl) {
      throw new ProviderRequestError(
        'PROVIDER_ERROR',
        `${VENDOR} accepted the job but returned no request id.`,
        true,
      )
    }

    return { providerJobId: encodeJobId(submitted.request_id, requestUrl) }
  }

  async poll(providerJobId: string, request?: GenerationRequest): Promise<ProviderPollResult> {
    const job = decodeJobId(providerJobId)
    if (!job) {
      return {
        status: 'failed',
        error: {
          code: 'BAD_JOB_ID',
          message: `This job was not started through ${VENDOR}.`,
          retryable: false,
        },
      }
    }

    const status = await providerJson<QueueStatusResponse>(VENDOR, `${job.requestUrl}/status`, {
      headers: headers(this.key),
    })

    const mapped = mapStatus(status.status)

    if (mapped === 'queued' || mapped === 'running') {
      return { status: mapped, progress: progressFor(mapped, status.queue_position) }
    }

    if (mapped === 'failed') {
      return {
        status: 'failed',
        progress: 1,
        error: {
          code: 'PROVIDER_ERROR',
          message: messageFrom(status) ?? `${VENDOR} could not finish this job.`,
          retryable: true,
        },
      }
    }

    // COMPLETED means the result is ready at the request URL, one more GET
    // away. The status response deliberately does not carry the payload.
    const result = await providerJson<QueueResultResponse>(VENDOR, job.requestUrl, {
      headers: headers(this.key),
    })

    const isVideo = request ? request.task !== 'text_to_image' : false
    const assets = assetsFromFal(result, isVideo)

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

    return { status: 'succeeded', progress: 1, assets }
  }
}

/**
 * Progress without a percentage.
 *
 * fal reports a queue position, not a completion fraction, so there is nothing
 * honest to compute. These two numbers exist so the bar moves once on pickup
 * and then waits, rather than animating a figure nobody measured.
 */
function progressFor(status: 'queued' | 'running', queuePosition?: number): number {
  if (status === 'queued') return queuePosition && queuePosition > 0 ? 0.05 : 0.1
  return 0.5
}

function messageFrom(status: QueueStatusResponse): string | null {
  for (const candidate of [status.error, status.detail]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.slice(0, 200)
    if (candidate && typeof candidate === 'object') {
      const message = (candidate as { message?: unknown }).message
      if (typeof message === 'string' && message.trim()) return message.slice(0, 200)
    }
  }
  return null
}

/**
 * fal publishes no "whoami" endpoint, so the probe asks the queue about a
 * request id that cannot exist. A bogus credential gets 401 before the id is
 * ever looked up; an accepted one gets 404, meaning "you are authenticated,
 * that request is not ours". Nothing is enqueued and nothing is billed.
 *
 * The empty-key guard is load bearing, not defensive padding. fal skips the
 * auth check entirely when no Authorization header value is present and
 * answers 404 — which the whitelist below would read as success. The schema
 * already enforces a minimum length, so this cannot happen through the UI,
 * but the whitelist is what makes 404 mean "good" and it must never be
 * reachable without a credential actually having been checked.
 */
const FAKE_REQUEST_ID = '00000000-0000-4000-8000-000000000000'

const fal: ProviderDriverModule = {
  id: 'fal',

  async verifyKey(key) {
    if (!key.trim()) return { status: 'invalid', message: `No ${VENDOR} key was provided.` }

    const result = await probe(
      `${QUEUE_BASE}/fal-ai/flux/requests/${FAKE_REQUEST_ID}/status`,
      { headers: { authorization: `Key ${key}` } },
    )
    // 404 and 422 both mean "your credential was accepted, that id was not".
    return interpret(result, VENDOR, [404, 422])
  },

  createDriver(key) {
    return new FalProvider(key)
  },
}

export default fal
