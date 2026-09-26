import type { GenerationTask, ProviderName } from '@/types/database'

/** Everything a provider needs to start one job. */
export interface GenerationRequest {
  /** Our generation row id — passed through for logging and webhook correlation. */
  generationId: string
  task: GenerationTask
  /** Registry id from lib/ai/registry.ts, never a raw provider path. */
  modelId: string
  /** User prompt already merged with the preset's hidden fragment. */
  prompt: string
  negativePrompt?: string | null
  /** Publicly reachable URL of the start frame, for image_to_video. */
  imageUrl?: string | null
  aspectRatio: string
  durationSec?: number | null
  seed?: number | null
  /** Preset params merged over the model defaults. */
  params?: Record<string, unknown>
}

export type ProviderJobStatus = 'queued' | 'running' | 'succeeded' | 'failed'

export interface RawAsset {
  kind: 'image' | 'video' | 'poster'
  /**
   * Where the bytes are. Three shapes reach services/asset.service.ts:
   * an absolute provider URL (copied into our bucket before it expires), a
   * `data:` URL from a provider that answered with the bytes themselves, and a
   * same-origin path for media this app already serves.
   */
  url: string
  mimeType?: string
  width?: number
  height?: number
  durationMs?: number
  sizeBytes?: number
}

export interface ProviderError {
  code: string
  message: string
  /** Whether resubmitting the same request could plausibly succeed. */
  retryable: boolean
}

export interface ProviderPollResult {
  status: ProviderJobStatus
  /** 0..1 when the provider reports it. */
  progress?: number
  assets?: RawAsset[]
  error?: ProviderError
  /** Real spend, when the provider reports it. */
  costUsd?: number
}

export interface SubmitResult {
  providerJobId: string
  /**
   * The finished job, for a provider whose API has no queue.
   *
   * Hugging Face hosted inference answers one request with the image bytes:
   * there is never a job to poll, and a driver that pretended otherwise would
   * have to invent a handle and hold the bytes somewhere. So it returns the
   * result here instead, and the service applies it through exactly the same
   * code path a poll result takes — one place that persists media, flips the
   * status and refunds a failure.
   */
  immediate?: ProviderPollResult
}

export interface AIProvider {
  readonly name: ProviderName
  submit(request: GenerationRequest): Promise<SubmitResult>
  poll(providerJobId: string, request?: GenerationRequest): Promise<ProviderPollResult>
  cancel?(providerJobId: string): Promise<void>
}

/** Thrown by drivers so the service layer can decide to refund and retry. */
export class ProviderRequestError extends Error {
  readonly code: string
  readonly retryable: boolean

  constructor(code: string, message: string, retryable = false) {
    super(message)
    this.name = 'ProviderRequestError'
    this.code = code
    this.retryable = retryable
  }
}
