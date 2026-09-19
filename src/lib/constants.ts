import type { GenerationStatus, GenerationTask } from '@/types/database'

export const ASPECT_RATIOS = [
  { value: '16:9', label: '16:9', hint: 'Cinematic', ratio: 16 / 9 },
  { value: '9:16', label: '9:16', hint: 'Vertical', ratio: 9 / 16 },
  { value: '1:1', label: '1:1', hint: 'Square', ratio: 1 },
  { value: '4:5', label: '4:5', hint: 'Portrait', ratio: 4 / 5 },
  { value: '21:9', label: '21:9', hint: 'Anamorphic', ratio: 21 / 9 },
] as const

export type AspectRatio = (typeof ASPECT_RATIOS)[number]['value']

export const VIDEO_DURATIONS = [
  { value: 5, label: '5s' },
  { value: 8, label: '8s' },
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
