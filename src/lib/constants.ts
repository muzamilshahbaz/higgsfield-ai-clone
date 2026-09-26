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
  // CogVideoX-5B's only length: 49 frames at 8fps is six seconds exactly, so
  // this is a real option rather than a rounding of "about five".
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

/**
 * Per-endpoint rate limits.
 *
 * Deliberately generous: these are brakes on runaway clients and casual
 * scraping, not a pricing tier. The rules that actually protect spend —
 * `maxConcurrentJobs`, `maxGenerationsPerHour`, and the credit functions
 * themselves — are enforced above and in Postgres, where an in-memory counter
 * cannot be forgotten by a cold start.
 */
export const RATE_LIMITS = {
  /** Uploads write to storage, so they cost us something per call. */
  uploads: { limit: 30, windowMs: 10 * 60 * 1000 },
  /** The one endpoint an unauthenticated visitor can hammer. */
  explore: { limit: 120, windowMs: 60 * 1000 },
  /** Cheap per call, but a held-down key should not write 500 rows. */
  likes: { limit: 60, windowMs: 60 * 1000 },
  /** Well under MAX_PROJECTS, which is the real ceiling. */
  projects: { limit: 20, windowMs: 10 * 60 * 1000 },
  /**
   * The brake in front of a real provider account.
   *
   * Above `maxGenerationsPerHour` on every plan, deliberately: the plan limit
   * is the one that decides whether a job may run, and it is enforced in
   * Postgres where a cold start cannot forget it. This one only stops a hot
   * loop from spending a round trip per iteration to be told the same thing.
   */
  generations: { limit: 60, windowMs: 10 * 60 * 1000 },
} as const

export const SIGNUP_CREDIT_GRANT = 200

export const STORAGE_BUCKETS = {
  uploads: 'uploads',
  generations: 'generations',
} as const
