import { getModel } from '@/lib/ai/registry'
import type { ProviderName } from '@/types/database'

/**
 * Landing-page showcase content.
 *
 * Deliberately separate from lib/ai/registry.ts. The registry describes what
 * the product can run; this describes what the marketing page says about it.
 * Mixing the two means a copy change is a change to the thing that prices
 * generations, which is not a trade anyone should make for a headline.
 *
 * `modelId` is the join between them, and `creditsFor` reads the live number
 * out of the registry — so the price on the landing page cannot drift from
 * the price in the composer.
 */

export interface ShowcaseModel {
  /** Registry id, when this card maps to a model the composer offers. */
  modelId: string
  name: string
  vendor: ProviderName
  description: string
  /** What someone would actually reach for it to do. */
  useCase: string
  kind: 'image' | 'video'
  /** Animated SVG under public/samples. No binaries, no video decode. */
  preview: string
  /** Rough share of recent generations. Illustrative, not measured. */
  trend: string
}

export const TRENDING_MODELS: ShowcaseModel[] = [
  {
    modelId: 'kling-v2-pro',
    name: 'Kling 2.1 Pro',
    vendor: 'kling',
    description:
      'Holds a face, an outfit and a lighting setup through an entire camera move. The one to use when continuity matters more than speed.',
    useCase: 'Character-led shots',
    kind: 'video',
    preview: '/samples/model-kling.svg',
    trend: 'Most used for motion',
  },
  {
    modelId: 'runway-gen4',
    name: 'Runway Gen-4',
    vendor: 'runway',
    description:
      'The dependable image-to-video pass. Rarely spectacular, rarely a disaster — which is what you want on the fourth take.',
    useCase: 'Image to video',
    kind: 'video',
    preview: '/samples/model-runway.svg',
    trend: 'Best hit rate',
  },
  {
    modelId: 'veo-3',
    name: 'Google Veo 3',
    vendor: 'google',
    description:
      'Text straight to an eight-second shot, with synchronised audio. No start frame, no storyboard, no second tool.',
    useCase: 'Text to video with sound',
    kind: 'video',
    preview: '/samples/model-veo.svg',
    trend: 'Newest',
  },
  {
    modelId: 'luma-ray',
    name: 'Luma Ray 2',
    vendor: 'luma',
    description:
      'Reads camera language out of a prompt better than anything else here. Write "slow push in on a wet street" and it does that.',
    useCase: 'Camera moves from text',
    kind: 'video',
    preview: '/samples/model-luma.svg',
    trend: 'Best value',
  },
  {
    modelId: 'flux-pro',
    name: 'Flux 1.1 Pro',
    vendor: 'flux',
    description:
      'Sharpest prompt adherence in the catalogue. What you asked for is what lands, including the awkward compositions.',
    useCase: 'Start frames',
    kind: 'image',
    preview: '/samples/model-flux.svg',
    trend: 'Most used for stills',
  },
  {
    modelId: 'imagen-4',
    name: 'Google Imagen 4',
    vendor: 'google',
    description:
      'Photographic realism and clean typography. The one that renders a sign in the background without inventing a language.',
    useCase: 'Photoreal stills',
    kind: 'image',
    preview: '/samples/model-imagen.svg',
    trend: 'Rising',
  },
]

/**
 * The live credit price for a showcase card.
 *
 * Returns null rather than a guess when the id is not in the registry, so a
 * card for a model that has been retired shows no price instead of a stale
 * one. The component renders the row only when this is a number.
 */
export function creditsFor(model: ShowcaseModel): number | null {
  return getModel(model.modelId)?.credits ?? null
}

// ---------------------------------------------------------------------------
// Workflow and features
// ---------------------------------------------------------------------------

export const WORKFLOW_STEPS = [
  {
    step: 'Create',
    title: 'Start with a frame or a sentence',
    body: 'Upload a still, or generate one from a prompt in the same composer. Nothing is exported between the two.',
  },
  {
    step: 'Customize',
    title: 'Pick the move and the look',
    body: 'A preset carries the prompt language, the negative prompt and the model parameters that make a camera move actually read.',
  },
  {
    step: 'Generate',
    title: 'Queue it and watch it land',
    body: 'Cards stream from queued to rendering to playing. Two jobs at once, priced in credits before you commit.',
  },
  {
    step: 'Export',
    title: 'Download, publish or remix',
    body: 'Every shot keeps its prompt, preset and seed. Publish it to Explore, or pull it back into the composer and change one thing.',
  },
] as const

export const PLATFORM_FEATURES = [
  {
    title: 'Text to video',
    body: 'Describe the shot and get moving footage back. No start frame required — Veo and Pika take it from the sentence.',
    span: 'lg:col-span-2',
  },
  {
    title: 'Image to video',
    body: 'Drop in a still and choose a move. Kling, Runway and Luma animate the frame you already like instead of inventing a new one.',
    span: '',
  },
  {
    title: 'Character consistency',
    body: 'A face that survives the whole move. The presets pin the model parameters that hold identity through a camera push.',
    span: '',
  },
  {
    title: 'Multiple AI models',
    body: 'Every model in the registry behind one composer. Switch vendor from a dropdown without relearning a single control.',
    span: 'lg:col-span-2',
  },
  {
    title: 'Creative controls',
    body: 'Aspect ratio, duration, seed, negative prompt and per-preset parameters — exposed when you want them, sensible when you do not.',
    span: 'lg:col-span-2',
  },
  {
    title: 'Bring your own keys',
    body: 'Connect your own provider accounts in settings. Your quota, your rate limits, your bill — encrypted at rest.',
    span: '',
  },
] as const

/**
 * Illustrative testimonials.
 *
 * These are written copy, not real customers, and the section says so on the
 * page. Inventing named endorsements and presenting them as genuine is the
 * one thing a landing page must not do, so the label is part of the design
 * rather than a note in a README.
 */
export const TESTIMONIALS = [
  {
    quote:
      'The preset does the prompt engineering I was doing by hand in a text file. Same shot, forty seconds instead of twenty minutes.',
    name: 'Motion designer',
    context: 'Sample copy',
  },
  {
    quote:
      'Being able to send a still straight into a motion preset without exporting is the whole product for me.',
    name: 'Freelance editor',
    context: 'Sample copy',
  },
  {
    quote:
      'I connected my own Runway key and the credits stopped being the thing I thought about.',
    name: 'Studio lead',
    context: 'Sample copy',
  },
] as const
