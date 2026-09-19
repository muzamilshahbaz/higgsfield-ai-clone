import type { GenerationStatus, GenerationTask } from '@/types/database'

export const ASPECT_RATIOS = [
  { value: '16:9', label: '16:9', hint: 'Cinematic', ratio: 16 / 9 },
  { value: '9:16', label: '9:16', hint: 'Vertical', ratio: 9 / 16 },
  { value: '1:1', label: '1:1', hint: 'Square', ratio: 1 },
  { value: '4:5', label: '4:5', hint: 'Portrait', ratio: 4 / 5 },
  { value: '21:9', label: '21:9', hint: 'Anamorphic', ratio: 21 / 9 },
] as const

export type AspectRatio = (typeof ASPECT_RATIOS)[number]['value']

/**
 * Every duration any registered model can produce. The picker intersects this
 * with the selected model's `supports.durations`, so a value that no model
 * offers is dead UI and a supported value missing here has no label.
 * Kept in sync with lib/ai/registry.ts by tests/registry.test.ts, which fails
 * in both directions if the two lists drift apart.
 */
export const VIDEO_DURATIONS = [
  { value: 5, label: '5s' },
  { value: 6, label: '6s' },
  { value: 10, label: '10s' },
] as const

export const TASK_LABELS: Record<GenerationTask, string> = {
  text_to_image: 'Image',
  text_to_video: 'Video',
  image_to_video: 'Image to video',
}

export const STATUS_LABELS: Record<GenerationStatus, string> = {
  queued: 'Queued',
  running: 'Generating',
  succeeded: 'Ready',
  failed: 'Failed',
  canceled: 'Canceled',
}

/** Guardrails that protect spend and keep the queue responsive. */
export const LIMITS = {
  maxConcurrentJobs: 2,
  maxGenerationsPerHour: 20,
  jobTimeoutMs: 6 * 60 * 1000,
  tickerIntervalMs: 3000,
  maxPromptLength: 1200,
  maxUploadBytes: 10 * 1024 * 1024,
} as const

export const SIGNUP_CREDIT_GRANT = 200

export const STORAGE_BUCKETS = {
  uploads: 'uploads',
  generations: 'generations',
} as const
