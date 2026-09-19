import type { GenerationTask, ProviderName } from '@/types/database'

/**
 * The model registry.
 *
 * Presets and the UI reference models by `id` only. Swapping the model behind an
 * id — or moving it to a different provider — is a single edit here and touches
 * no preset, no service and no database row.
 *
 * `provider` names the real service that would serve the model. The ACTIVE
 * driver is chosen separately by resolveProvider() from AI_PROVIDER, so with
 * AI_PROVIDER=mock every entry below is served by the mock driver and no key
 * is required.
 *
 * `indicativeUsd` is a rough per-generation cost used to sanity-check credit
 * pricing. Re-check it against the provider's dashboard before charging anyone
 * real money; it is not a quote.
 */
export interface ModelEntry {
  id: string
  label: string
  /** One-line pitch shown in the model selector. */
  blurb: string
  task: GenerationTask
  provider: ProviderName
  /** Path the driver passes to the provider SDK. */
  providerModelPath: string
  credits: number
  indicativeUsd: number
  avgLatencySec: number
  supports: {
    aspectRatios: string[]
    durations?: number[]
    imageInput: boolean
    negativePrompt: boolean
  }
  defaults?: Record<string, unknown>
  /** Surfaced as a "recommended" chip in the selector. */
  featured?: boolean
}

const ALL_ASPECTS = ['16:9', '9:16', '1:1', '4:5', '21:9']

export const MODELS: ModelEntry[] = [
  // ---------------------------------------------------------------- images
  {
    id: 'lumen-flash',
    label: 'Lumen Flash',
    blurb: 'Fast drafts. Great for iterating on a look before you commit.',
    task: 'text_to_image',
    provider: 'fal',
    providerModelPath: 'fal-ai/flux/schnell',
    credits: 1,
    indicativeUsd: 0.003,
    avgLatencySec: 4,
    supports: { aspectRatios: ALL_ASPECTS, imageInput: false, negativePrompt: false },
    defaults: { num_inference_steps: 4 },
    featured: true,
  },
  {
    id: 'lumen-pro',
    label: 'Lumen Pro',
    blurb: 'Photoreal detail and dependable composition. The default for finals.',
    task: 'text_to_image',
    provider: 'fal',
    providerModelPath: 'fal-ai/flux/dev',
    credits: 4,
    indicativeUsd: 0.025,
    avgLatencySec: 9,
    supports: { aspectRatios: ALL_ASPECTS, imageInput: false, negativePrompt: true },
    defaults: { num_inference_steps: 28, guidance_scale: 3.5 },
    featured: true,
  },
  {
    id: 'lumen-portrait',
    label: 'Lumen Portrait',
    blurb: 'Tuned for faces, skin and fashion editorial lighting.',
    task: 'text_to_image',
    provider: 'fal',
    providerModelPath: 'fal-ai/flux/dev',
    credits: 5,
    indicativeUsd: 0.03,
    avgLatencySec: 11,
    supports: { aspectRatios: ['1:1', '4:5', '9:16', '16:9'], imageInput: false, negativePrompt: true },
    defaults: { num_inference_steps: 32, guidance_scale: 4 },
  },

  // ---------------------------------------------------------------- video
  {
    id: 'motion-turbo',
    label: 'Motion Turbo',
    blurb: 'Quick motion passes. Best value while you dial in a camera move.',
    task: 'image_to_video',
    provider: 'fal',
    providerModelPath: 'fal-ai/kling-video/v2/standard/image-to-video',
    credits: 18,
    indicativeUsd: 0.18,
    avgLatencySec: 65,
    supports: {
      aspectRatios: ['16:9', '9:16', '1:1'],
      durations: [5],
      imageInput: true,
      negativePrompt: true,
    },
    featured: true,
  },
  {
    id: 'motion-cine',
    label: 'Motion Cine',
    blurb: 'The cinematic one. Holds character and lighting through the move.',
    task: 'image_to_video',
    provider: 'fal',
    providerModelPath: 'fal-ai/kling-video/v2/pro/image-to-video',
    credits: 35,
    indicativeUsd: 0.35,
    avgLatencySec: 110,
    supports: {
      aspectRatios: ['16:9', '9:16', '1:1', '21:9'],
      durations: [5, 10],
      imageInput: true,
      negativePrompt: true,
    },
    featured: true,
  },
  {
    id: 'motion-scene',
    label: 'Motion Scene',
    blurb: 'Text straight to video when you have no start frame.',
    task: 'text_to_video',
    provider: 'fal',
    providerModelPath: 'fal-ai/minimax/hailuo-02/standard/text-to-video',
    credits: 28,
    indicativeUsd: 0.28,
    avgLatencySec: 95,
    supports: {
      aspectRatios: ['16:9', '9:16'],
      durations: [6],
      imageInput: false,
      negativePrompt: false,
    },
  },
]

const MODELS_BY_ID = new Map(MODELS.map((model) => [model.id, model]))

export function getModel(id: string): ModelEntry | undefined {
  return MODELS_BY_ID.get(id)
}

export function requireModel(id: string): ModelEntry {
  const model = MODELS_BY_ID.get(id)
  if (!model) throw new Error(`Unknown model id: ${id}`)
  return model
}

export function modelsForTask(task: GenerationTask): ModelEntry[] {
  return MODELS.filter((model) => model.task === task)
}

export function defaultModelForTask(task: GenerationTask): ModelEntry {
  const candidates = modelsForTask(task)
  const featured = candidates.find((model) => model.featured)
  const fallback = featured ?? candidates[0]
  if (!fallback) throw new Error(`No model registered for task: ${task}`)
  return fallback
}

/**
 * What a generation costs, in credits.
 * Longer videos scale linearly off the model's shortest supported duration.
 */
export function creditCostFor(model: ModelEntry, durationSec?: number | null): number {
  const durations = model.supports.durations
  if (!durations || durations.length === 0 || !durationSec) return model.credits

  const base = Math.min(...durations)
  if (!base || durationSec <= base) return model.credits

  return Math.ceil(model.credits * (durationSec / base))
}
