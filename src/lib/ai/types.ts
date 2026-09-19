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

export interface AIProvider {
  readonly name: ProviderName
  submit(request: GenerationRequest): Promise<{ providerJobId: string }>
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
