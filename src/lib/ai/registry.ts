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
  // ------------------------------------------------- direct vendor: images
  // Everything below names a vendor a user can connect in
  // Settings -> AI model keys. `provider` is what the router looks up, so
  // these entries need no other wiring.
  //
  // APPENDED, never prepended: defaultModelForTask() returns the first
  // featured model for a task, so inserting a featured entry above
  // `lumen-flash` would silently change what every composer opens with.
  {
    id: 'flux-pro',
    label: 'Flux 1.1 Pro',
    blurb: 'Black Forest Labs, direct. Sharpest prompt adherence in the catalogue.',
    task: 'text_to_image',
    provider: 'flux',
    providerModelPath: 'flux-pro-1.1',
    credits: 5,
    indicativeUsd: 0.04,
    avgLatencySec: 10,
    supports: { aspectRatios: ALL_ASPECTS, imageInput: false, negativePrompt: false },
    defaults: { safety_tolerance: 2 },
  },
  {
    id: 'stable-diffusion-35',
    label: 'Stable Diffusion 3.5',
    blurb: 'Stability AI. The open workhorse — broad styles, predictable output.',
    task: 'text_to_image',
    provider: 'stability',
    providerModelPath: 'sd3.5-large',
    credits: 4,
    indicativeUsd: 0.035,
    avgLatencySec: 9,
    supports: { aspectRatios: ALL_ASPECTS, imageInput: false, negativePrompt: true },
    defaults: { cfg_scale: 4 },
  },
  {
    id: 'openai-image',
    label: 'OpenAI Image',
    blurb: 'The one to reach for when the shot has to contain readable text.',
    task: 'text_to_image',
    provider: 'openai',
    providerModelPath: 'gpt-image-1',
    credits: 6,
    indicativeUsd: 0.05,
    avgLatencySec: 14,
    supports: { aspectRatios: ['1:1', '16:9', '9:16'], imageInput: false, negativePrompt: false },
    defaults: { quality: 'high' },
  },
  {
    id: 'imagen-4',
    label: 'Google Imagen 4',
    blurb: 'Photographic realism and clean typography, straight from Google AI.',
    task: 'text_to_image',
    provider: 'google',
    providerModelPath: 'imagen-4.0-generate-001',
    credits: 5,
    indicativeUsd: 0.04,
    avgLatencySec: 11,
    supports: {
      aspectRatios: ['1:1', '16:9', '9:16', '4:5'],
      imageInput: false,
      negativePrompt: true,
    },
  },

  // -------------------------------------------------- direct vendor: video
  {
    id: 'kling-v2-pro',
    label: 'Kling 2.1 Pro',
    blurb: 'Direct from Kling. Character and lighting survive the whole move.',
    task: 'image_to_video',
    provider: 'kling',
    providerModelPath: 'kling-v2-1-pro',
    credits: 38,
    indicativeUsd: 0.38,
    avgLatencySec: 115,
    supports: {
      aspectRatios: ['16:9', '9:16', '1:1'],
      durations: [5, 10],
      imageInput: true,
      negativePrompt: true,
    },
  },
  {
    id: 'runway-gen4',
    label: 'Runway Gen-4',
    blurb: 'The dependable image-to-video pass. Rarely surprises you badly.',
    task: 'image_to_video',
    provider: 'runway',
    providerModelPath: 'gen4_turbo',
    credits: 32,
    indicativeUsd: 0.3,
    avgLatencySec: 90,
    supports: {
      aspectRatios: ['16:9', '9:16', '1:1', '4:5'],
      durations: [5, 10],
      imageInput: true,
      negativePrompt: false,
    },
  },
  {
    id: 'luma-ray',
    label: 'Luma Ray 2',
    blurb: 'Reads camera language from the prompt better than anything else here.',
    task: 'image_to_video',
    provider: 'luma',
    providerModelPath: 'ray-2',
    credits: 26,
    indicativeUsd: 0.25,
    avgLatencySec: 85,
    supports: {
      aspectRatios: ['16:9', '9:16', '1:1', '21:9'],
      durations: [5],
      imageInput: true,
      negativePrompt: false,
    },
  },
  {
    id: 'veo-3',
    label: 'Google Veo 3',
    blurb: 'Text to video with synchronised audio. Fixed eight-second shots.',
    task: 'text_to_video',
    provider: 'google',
    providerModelPath: 'veo-3.0-generate-001',
    credits: 60,
    indicativeUsd: 0.6,
    avgLatencySec: 140,
    supports: {
      aspectRatios: ['16:9', '9:16'],
      durations: [8],
      imageInput: false,
      negativePrompt: true,
    },
  },
  {
    id: 'pika-scene',
    label: 'Pika 2.2',
    blurb: 'Stylised short-form motion and the effect looks Pika is known for.',
    task: 'text_to_video',
    provider: 'pika',
    providerModelPath: 'pika-2.2',
    credits: 24,
    indicativeUsd: 0.22,
    avgLatencySec: 80,
    supports: {
      aspectRatios: ['16:9', '9:16', '1:1'],
      durations: [5],
      imageInput: false,
      negativePrompt: true,
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
