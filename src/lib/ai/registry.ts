import type { GenerationTask, ProviderName } from '@/types/database'

/**
 * The model registry.
 *
 * Presets and the UI reference models by `id` only. Swapping the model behind
 * an id — or moving it to a different provider — is a single edit here and
 * touches no preset, no service and no database row.
 *
 * Every entry is an open-weight model, and every entry carries `routes`: the
 * providers that can serve it, in the order the router should try them.
 * services/ai/ai-router.ts walks that list and picks the first provider the
 * caller has a usable key for, so one model id runs on Hugging Face for a user
 * who connected a Hugging Face token and on fal.ai for the user beside them,
 * with no second entry here and no branch in the composer.
 *
 * Order within `routes` is the product decision. Hugging Face first where it
 * can serve at all, because a free token is the shortest path to a first
 * generation; fal.ai next, because its queue is the fastest of the three for
 * video; Replicate last, because it is the broadest but not the cheapest.
 *
 * Only FLUX.1 [schnell] carries a Hugging Face route. Hugging Face stopped
 * hosting these models itself and now routes to partners, and the partners that
 * serve FLUX.1 [dev] and SDXL through it — fal.ai, Replicate, wavespeed — do
 * not expose the one request shape its driver speaks. Those two models talk to
 * fal.ai and Replicate directly instead, which this app already does properly.
 * Verified against the live Hub mapping; see docs/PROVIDERS.md.
 *
 * `indicativeUsd` is a rough per-generation cost used to sanity-check credit
 * pricing. Re-check it against the provider dashboard before charging anyone
 * real money; it is not a quote.
 */

export interface ModelRoute {
  provider: ProviderName
  /** The identifier this provider API expects. Never shown to a user. */
  path: string
  /**
   * Provider-specific input merged over everything the driver computed, for
   * where a vendor parameter name differs from everyone else's. Applied last,
   * so it is also the escape hatch for one awkward model.
   */
  input?: Record<string, unknown>
  /**
   * How this endpoint wants a frame size expressed.
   *
   * Only Replicate needs it, and only because its models have hand-written
   * input schemas that reject a key they do not declare: the FLUX models take
   * an `aspect_ratio` string, SDXL takes `width` and `height`, and sending the
   * wrong one is a 422 charged to the user. Hugging Face and fal each have one
   * house style, so their drivers do not read this.
   */
  sizing?: 'aspect_ratio' | 'dimensions' | 'none'
  /**
   * The model's native frame rate, where it takes a frame count rather than a
   * duration in seconds.
   *
   * `num_frames = duration × fps + 1` is the diffusers convention (latents come
   * in groups of four plus the first frame), and it is how a 5s request becomes
   * Wan's 81 frames or LTX's 121. Absent means the endpoint takes seconds, or
   * that its length is fixed and must not be overridden.
   */
  videoFrameRate?: number
}

export interface ModelEntry {
  id: string
  label: string
  /** One-line pitch shown in the model selector. */
  blurb: string
  task: GenerationTask
  /** The open-weight model this id actually is, for the docs and the UI. */
  family: string
  /** Providers that can serve it, most preferred first. Never empty. */
  routes: ModelRoute[]
  credits: number
  indicativeUsd: number
  avgLatencySec: number
  supports: {
    aspectRatios: string[]
    durations?: number[]
    imageInput: boolean
    negativePrompt: boolean
  }
  /** Model defaults, merged under preset params by lib/presets.ts. */
  defaults?: Record<string, unknown>
  /** Surfaced as a "recommended" chip in the selector. */
  featured?: boolean
}

const ALL_ASPECTS = ['16:9', '9:16', '1:1', '4:5', '21:9']
const VIDEO_ASPECTS = ['16:9', '9:16', '1:1']

export const MODELS: ModelEntry[] = [
  // ---------------------------------------------------------------- images
  //
  // FLUX.1 [schnell] is Apache-2.0 and four steps, which is why it is the
  // default: a first generation should be fast and nearly free.
  {
    id: 'lumen-flash',
    label: 'Lumen Flash',
    blurb: 'FLUX.1 [schnell]. Fast drafts — iterate on a look before you commit.',
    task: 'text_to_image',
    family: 'FLUX.1 [schnell]',
    routes: [
      { provider: 'huggingface', path: 'black-forest-labs/FLUX.1-schnell' },
      { provider: 'fal', path: 'fal-ai/flux/schnell' },
      { provider: 'replicate', path: 'black-forest-labs/flux-schnell', sizing: 'aspect_ratio' },
    ],
    credits: 1,
    indicativeUsd: 0.003,
    avgLatencySec: 6,
    supports: { aspectRatios: ALL_ASPECTS, imageInput: false, negativePrompt: false },
    // schnell is distilled: trained for four steps and guidance-free.
    defaults: { num_inference_steps: 4 },
    featured: true,
  },
  {
    id: 'lumen-pro',
    label: 'Lumen Pro',
    blurb: 'FLUX.1 [dev]. Photoreal detail and dependable composition.',
    task: 'text_to_image',
    family: 'FLUX.1 [dev]',
    routes: [
      { provider: 'fal', path: 'fal-ai/flux/dev' },
      { provider: 'replicate', path: 'black-forest-labs/flux-dev', sizing: 'aspect_ratio' },
    ],
    credits: 4,
    indicativeUsd: 0.025,
    avgLatencySec: 14,
    supports: { aspectRatios: ALL_ASPECTS, imageInput: false, negativePrompt: true },
    defaults: { num_inference_steps: 28, guidance_scale: 3.5 },
    featured: true,
  },
  {
    id: 'lumen-portrait',
    label: 'Lumen Portrait',
    blurb: 'FLUX.1 [dev], tuned for faces, skin and editorial lighting.',
    task: 'text_to_image',
    family: 'FLUX.1 [dev]',
    routes: [
      { provider: 'fal', path: 'fal-ai/flux/dev' },
      { provider: 'replicate', path: 'black-forest-labs/flux-dev', sizing: 'aspect_ratio' },
    ],
    credits: 5,
    indicativeUsd: 0.03,
    avgLatencySec: 16,
    supports: {
      aspectRatios: ['1:1', '4:5', '9:16', '16:9'],
      imageInput: false,
      negativePrompt: true,
    },
    defaults: { num_inference_steps: 32, guidance_scale: 4 },
  },
  {
    id: 'lumen-sdxl',
    label: 'Lumen SDXL',
    blurb: 'Stable Diffusion XL. The open workhorse — broad styles, cheap passes.',
    task: 'text_to_image',
    family: 'Stable Diffusion XL 1.0',
    routes: [
      { provider: 'fal', path: 'fal-ai/fast-sdxl' },
      { provider: 'replicate', path: 'stability-ai/sdxl', sizing: 'dimensions' },
    ],
    credits: 3,
    indicativeUsd: 0.012,
    avgLatencySec: 11,
    supports: { aspectRatios: ALL_ASPECTS, imageInput: false, negativePrompt: true },
    defaults: { num_inference_steps: 30, guidance_scale: 7.5 },
  },

  // ---------------------------------------------------------------- video
  //
  // No Hugging Face route on any of these. HF hosted inference serves images
  // as raw bytes over one documented request; its video models are routed on
  // to partner providers under a per-provider request shape that is not stable
  // enough to charge a user quota against. So video runs on fal.ai or
  // Replicate, both of which expose a real job queue. See docs/PROVIDERS.md.
  {
    id: 'motion-turbo',
    label: 'Motion Turbo',
    blurb: 'Wan 2.2 turbo. Quick motion passes while you dial in a camera move.',
    task: 'image_to_video',
    family: 'Wan 2.2 I2V (turbo)',
    routes: [
      { provider: 'fal', path: 'fal-ai/wan/v2.2-a14b/image-to-video/turbo' },
      { provider: 'replicate', path: 'wan-video/wan-2.2-i2v-fast', videoFrameRate: 16 },
    ],
    credits: 14,
    indicativeUsd: 0.1,
    avgLatencySec: 70,
    supports: {
      aspectRatios: VIDEO_ASPECTS,
      durations: [5],
      imageInput: true,
      negativePrompt: true,
    },
    featured: true,
  },
  {
    id: 'motion-cine',
    label: 'Motion Cine',
    blurb: 'Wan 2.2 A14B. The cinematic one — holds character through the move.',
    task: 'image_to_video',
    family: 'Wan 2.2 I2V A14B',
    routes: [
      { provider: 'fal', path: 'fal-ai/wan/v2.2-a14b/image-to-video' },
      { provider: 'replicate', path: 'wan-video/wan-2.2-i2v-a14b', videoFrameRate: 16 },
    ],
    credits: 30,
    indicativeUsd: 0.25,
    avgLatencySec: 120,
    supports: {
      aspectRatios: VIDEO_ASPECTS,
      durations: [5, 10],
      imageInput: true,
      negativePrompt: true,
    },
    featured: true,
  },
  {
    id: 'motion-scene',
    label: 'Motion Scene',
    blurb: 'Wan 2.2 text-to-video. Straight to motion with no start frame.',
    task: 'text_to_video',
    family: 'Wan 2.2 T2V A14B',
    routes: [
      { provider: 'fal', path: 'fal-ai/wan/v2.2-a14b/text-to-video' },
      { provider: 'replicate', path: 'wan-video/wan-2.2-t2v-fast', videoFrameRate: 16 },
    ],
    credits: 24,
    indicativeUsd: 0.2,
    avgLatencySec: 100,
    supports: {
      aspectRatios: ['16:9', '9:16'],
      durations: [5],
      imageInput: false,
      negativePrompt: true,
    },
    featured: true,
  },
  {
    id: 'motion-ltx',
    label: 'Motion LTX',
    blurb: 'LTX-Video 13B distilled. The cheapest way to see an idea move.',
    task: 'text_to_video',
    family: 'LTX-Video 13B (distilled)',
    routes: [
      { provider: 'fal', path: 'fal-ai/ltx-video-13b-distilled' },
      { provider: 'replicate', path: 'lightricks/ltx-video', videoFrameRate: 24 },
    ],
    credits: 10,
    indicativeUsd: 0.06,
    avgLatencySec: 45,
    supports: {
      aspectRatios: ['16:9', '9:16'],
      durations: [5],
      imageInput: false,
      negativePrompt: true,
    },
  },
  {
    id: 'motion-cog',
    label: 'Motion Cog',
    blurb: 'CogVideoX-5B. Steady six-second shots with unusually clean motion.',
    task: 'text_to_video',
    family: 'CogVideoX-5B',
    routes: [
      { provider: 'fal', path: 'fal-ai/cogvideox-5b' },
      { provider: 'replicate', path: 'cuuupid/cogvideox-5b', videoFrameRate: 8 },
    ],
    credits: 16,
    indicativeUsd: 0.12,
    avgLatencySec: 90,
    supports: {
      aspectRatios: ['16:9'],
      durations: [6],
      imageInput: false,
      negativePrompt: true,
    },
  },
  {
    id: 'motion-hunyuan',
    label: 'Motion Hunyuan',
    blurb: 'HunyuanVideo. The largest open video model here — slow, worth it.',
    task: 'text_to_video',
    family: 'HunyuanVideo',
    routes: [
      { provider: 'fal', path: 'fal-ai/hunyuan-video' },
      { provider: 'replicate', path: 'tencent/hunyuan-video', videoFrameRate: 24 },
    ],
    credits: 34,
    indicativeUsd: 0.3,
    avgLatencySec: 150,
    supports: {
      aspectRatios: ['16:9', '9:16'],
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
 * The vendor a model is attributed to in the UI.
 *
 * The first route, which is also the first one the router tries — so the badge
 * on a card and the account that gets billed agree by construction rather than
 * by a second field somebody has to remember to update.
 */
export function primaryProvider(model: ModelEntry): ProviderName {
  return model.routes[0]?.provider ?? 'mock'
}

/** How this provider names the model, or undefined if it cannot serve it. */
export function routeFor(model: ModelEntry, provider: ProviderName): ModelRoute | undefined {
  return model.routes.find((route) => route.provider === provider)
}

/** Every provider that could run this model, in preference order. */
export function providersFor(model: ModelEntry): ProviderName[] {
  return model.routes.map((route) => route.provider)
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
