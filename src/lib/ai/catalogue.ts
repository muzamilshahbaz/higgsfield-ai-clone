import type { ProviderName } from '@/types/database'

/**
 * The connectable-provider catalogue.
 *
 * Data only — no HTTP, no `process.env`, no driver imports. It is safe in a
 * client bundle, which is the point: the settings UI renders the whole "AI
 * model keys" tab straight off this array, so adding a vendor is one entry
 * here plus one driver in services/ai/providers/, and no component changes.
 *
 * `ProviderName` is the shared vocabulary. The same id names the vendor on a
 * generation row, keys a row in `user_provider_keys`, and picks a driver in
 * services/ai/ai-router.ts, so the three can never drift.
 */

export type ProviderMedia = 'image' | 'video' | 'both'

export interface ProviderDescriptor {
  id: ProviderName
  label: string
  /** What the vendor is, in one line, for someone deciding whether to connect. */
  blurb: string
  media: ProviderMedia
  /** Where a user goes to mint a key. */
  consoleUrl: string
  /** Placeholder text and the shape hint for the key input. */
  keyPlaceholder: string
  /**
   * A deliberately loose shape check. It exists to catch a pasted email
   * address or a truncated key before we spend a network round trip — not to
   * predict a vendor's future key format, which is why nothing rejects a key
   * that fails only this.
   */
  keyHint: { minLength: number; pattern?: string }
  /**
   * True when this build can actually run a generation through the vendor —
   * that is, when its module in services/ai/providers/ exports `createDriver`
   * and at least one model in the registry names it.
   *
   * False means the key is stored and verified, and nothing more: no model
   * routes to that vendor yet. The settings row says so in as many words,
   * because a stored key that silently never runs anything is worse than no
   * row at all.
   */
  generationReady: boolean
}

/**
 * The three aggregators come first, in the order the router tries them: they
 * serve many models under one key, so they are the cheapest thing for a new
 * user to connect, and they are the only entries in here that can currently
 * run a generation.
 */
export const PROVIDERS: ProviderDescriptor[] = [
  {
    id: 'huggingface',
    label: 'Hugging Face',
    blurb: 'One token serves FLUX.1 and SDXL. A free account is enough to start.',
    media: 'image',
    consoleUrl: 'https://huggingface.co/settings/tokens',
    keyPlaceholder: 'hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    keyHint: { minLength: 20, pattern: '^hf_' },
    generationReady: true,
  },
  {
    id: 'fal',
    label: 'fal.ai',
    blurb: 'Aggregator. One key serves FLUX, Wan, LTX, CogVideoX and Hunyuan.',
    media: 'both',
    consoleUrl: 'https://fal.ai/dashboard/keys',
    keyPlaceholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:xxxxxxxx',
    // A fal key is two halves joined by a colon, and the dashboard presents
    // them as separate-looking fields — so pasting only the secret is the
    // obvious mistake to make. Without the colon fal answers 401 and the UI
    // reports a rejected key, which sends someone to regenerate a key that was
    // never wrong. A warning here costs nothing and names the actual problem.
    keyHint: { minLength: 20, pattern: ':' },
    generationReady: true,
  },
  {
    id: 'replicate',
    label: 'Replicate',
    blurb: 'Aggregator. Hosted versions of most open image and video models.',
    media: 'both',
    consoleUrl: 'https://replicate.com/account/api-tokens',
    keyPlaceholder: 'r8_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    keyHint: { minLength: 20, pattern: '^r8_' },
    generationReady: true,
  },

  // ------------------------------------------------------------- image
  {
    id: 'flux',
    label: 'Flux · Black Forest Labs',
    blurb: 'The Flux family direct from BFL. Strong prompt adherence, fast drafts.',
    media: 'image',
    consoleUrl: 'https://api.bfl.ai',
    keyPlaceholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    keyHint: { minLength: 20 },
    generationReady: false,
  },
  {
    id: 'stability',
    label: 'Stable Diffusion · Stability AI',
    blurb: 'Stable Diffusion 3.5 and the Stable Image endpoints.',
    media: 'image',
    consoleUrl: 'https://platform.stability.ai/account/keys',
    keyPlaceholder: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    keyHint: { minLength: 20, pattern: '^sk-' },
    generationReady: false,
  },
  {
    id: 'openai',
    label: 'OpenAI Images',
    blurb: 'GPT image generation. Best in the catalogue at text inside an image.',
    media: 'image',
    consoleUrl: 'https://platform.openai.com/api-keys',
    keyPlaceholder: 'sk-proj-xxxxxxxxxxxxxxxxxxxxxxxx',
    keyHint: { minLength: 20, pattern: '^sk-' },
    generationReady: false,
  },
  {
    id: 'google',
    label: 'Google AI · Imagen & Veo',
    blurb: 'One Gemini API key serves both Imagen stills and Veo video.',
    media: 'both',
    consoleUrl: 'https://aistudio.google.com/apikey',
    keyPlaceholder: 'AIzaSy...',
    keyHint: { minLength: 20 },
    generationReady: false,
  },

  // ------------------------------------------------------------- video
  {
    id: 'kling',
    label: 'Kling AI',
    blurb: 'Kuaishou’s video model. Holds a character through a camera move.',
    media: 'video',
    consoleUrl: 'https://app.klingai.com',
    keyPlaceholder: 'accessKey:secretKey',
    keyHint: { minLength: 16, pattern: ':' },
    generationReady: false,
  },
  {
    id: 'runway',
    label: 'Runway',
    blurb: 'Gen-4. The reliable one for image-to-video with a start frame.',
    media: 'video',
    consoleUrl: 'https://dev.runwayml.com',
    keyPlaceholder: 'key_xxxxxxxxxxxxxxxxxxxxxxxx',
    keyHint: { minLength: 20 },
    generationReady: false,
  },
  {
    id: 'luma',
    label: 'Luma Dream Machine',
    blurb: 'Ray. Natural motion and camera language from a single still.',
    media: 'video',
    consoleUrl: 'https://lumalabs.ai/api/keys',
    keyPlaceholder: 'luma-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    keyHint: { minLength: 20 },
    generationReady: false,
  },
  {
    id: 'pika',
    label: 'Pika',
    blurb: 'Stylised short-form motion and the effects presets Pika is known for.',
    media: 'video',
    consoleUrl: 'https://pika.art',
    keyPlaceholder: 'pk-xxxxxxxxxxxxxxxxxxxxxxxx',
    keyHint: { minLength: 16 },
    generationReady: false,
  },
]

const BY_ID = new Map(PROVIDERS.map((provider) => [provider.id, provider]))

export function getProvider(id: string): ProviderDescriptor | undefined {
  return BY_ID.get(id as ProviderName)
}

export function isConnectableProvider(id: string): id is ProviderName {
  return BY_ID.has(id as ProviderName)
}

/** Connectable providers, grouped the way the settings tab lists them. */
export function providersByMedia(media: ProviderMedia): ProviderDescriptor[] {
  return PROVIDERS.filter((provider) => provider.media === media || provider.media === 'both')
}

/**
 * A shape check run before the network call.
 *
 * Returns a reason string or null. Never a hard gate on its own — a vendor
 * that changes its key format should cost a user one confusing warning, not a
 * locked-out account, so the caller stores anything the vendor accepts.
 */
export function keyShapeWarning(provider: ProviderDescriptor, rawKey: string): string | null {
  const key = rawKey.trim()

  if (key.length < provider.keyHint.minLength) {
    return `That looks too short for a ${provider.label} key.`
  }

  if (provider.keyHint.pattern && !new RegExp(provider.keyHint.pattern).test(key)) {
    return `${provider.label} keys usually look like ${provider.keyPlaceholder}.`
  }

  if (/\s/.test(key)) return 'That contains a space — check for a stray copy/paste.'

  return null
}
