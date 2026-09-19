import type {
  AIProvider,
  GenerationRequest,
  ProviderPollResult,
  RawAsset,
} from '@/lib/ai/types'
import { requireModel } from '@/lib/ai/registry'

/**
 * Mock provider — the default driver for this build.
 *
 * Deterministic and stateless by design: the job id encodes the start time, the
 * simulated duration and the outcome, so the client ticker, the cron sweeper and
 * a cold serverless invocation all compute the same answer without shared state.
 *
 *   mock_<startedAtMs>_<durationMs>_<outcome>_<assetIndex>
 *
 * It fails roughly one job in twelve on purpose, so the refund path is visible
 * in the demo rather than theoretical.
 */

const FAILURE_RATE = 1 / 12

/**
 * Bundled sample media under public/samples/.
 * Animated SVG "shots" so the mock needs no binary assets and no network.
 */
const SAMPLE_SHOTS = [
  { path: '/samples/shot-01.svg', width: 1920, height: 1080 },
  { path: '/samples/shot-02.svg', width: 1920, height: 1080 },
  { path: '/samples/shot-03.svg', width: 1080, height: 1920 },
  { path: '/samples/shot-04.svg', width: 1080, height: 1080 },
  { path: '/samples/shot-05.svg', width: 1920, height: 1080 },
  { path: '/samples/shot-06.svg', width: 1080, height: 1920 },
] as const

const FAILURE_MODES = [
  { code: 'CONTENT_FILTER', message: 'The provider rejected this prompt as unsafe.' },
  { code: 'PROVIDER_TIMEOUT', message: 'The model took too long to respond.' },
  { code: 'CAPACITY', message: 'The model is at capacity. Try again in a moment.' },
] as const

/** Small deterministic hash so a given generation always rolls the same way. */
function hash(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

interface DecodedJob {
  startedAt: number
  durationMs: number
  willFail: boolean
  assetIndex: number
}

function decode(providerJobId: string): DecodedJob | null {
  const parts = providerJobId.split('_')
  if (parts.length < 5 || parts[0] !== 'mock') return null

  const startedAt = Number(parts[1])
  const durationMs = Number(parts[2])
  const assetIndex = Number(parts[4])

  if (!Number.isFinite(startedAt) || !Number.isFinite(durationMs)) return null

  return {
    startedAt,
    durationMs,
    willFail: parts[3] === 'fail',
    assetIndex: Number.isFinite(assetIndex) ? assetIndex : 0,
  }
}

export class MockProvider implements AIProvider {
  readonly name = 'mock' as const

  async submit(request: GenerationRequest): Promise<{ providerJobId: string }> {
    const model = requireModel(request.modelId)
    const roll = hash(request.generationId)

    // Latency within +/-35% of the model's advertised average, so the queue
    // looks alive rather than metronomic.
    const jitter = 0.65 + ((roll % 70) / 100)
    const durationMs = Math.round(model.avgLatencySec * 1000 * jitter)

    const willFail = (roll % 1000) / 1000 < FAILURE_RATE
    const assetIndex = roll % SAMPLE_SHOTS.length

    const providerJobId = [
      'mock',
      Date.now(),
      durationMs,
      willFail ? 'fail' : 'ok',
      assetIndex,
    ].join('_')

    return { providerJobId }
  }

  async poll(providerJobId: string, request?: GenerationRequest): Promise<ProviderPollResult> {
    const job = decode(providerJobId)
    if (!job) {
      return {
        status: 'failed',
        error: { code: 'BAD_JOB_ID', message: 'Malformed mock job id.', retryable: false },
      }
    }

    const elapsed = Date.now() - job.startedAt
    const ratio = job.durationMs > 0 ? elapsed / job.durationMs : 1

    if (ratio < 0.06) {
      return { status: 'queued', progress: 0 }
    }

    if (ratio < 1) {
      // ease-out so the bar moves quickly at first, then settles
      const progress = Math.min(0.97, 1 - (1 - ratio) ** 1.7)
      return { status: 'running', progress }
    }

    if (job.willFail) {
      const mode = FAILURE_MODES[job.assetIndex % FAILURE_MODES.length]!
      return {
        status: 'failed',
        progress: 1,
        error: { code: mode.code, message: mode.message, retryable: mode.code !== 'CONTENT_FILTER' },
      }
    }

    const shot = SAMPLE_SHOTS[job.assetIndex % SAMPLE_SHOTS.length]!
    const isVideo = request ? request.task !== 'text_to_image' : true

    const assets: RawAsset[] = [
      {
        kind: isVideo ? 'video' : 'image',
        url: shot.path,
        // SVG so the mock ships no binaries; the renderer picks <img> vs <video>
        // from the mime type rather than the asset kind.
        mimeType: 'image/svg+xml',
        width: shot.width,
        height: shot.height,
        durationMs: isVideo ? (request?.durationSec ?? 5) * 1000 : undefined,
      },
    ]

    return { status: 'succeeded', progress: 1, assets, costUsd: 0 }
  }

  async cancel(): Promise<void> {
    // Nothing to cancel: state lives entirely in the job id.
  }
}
