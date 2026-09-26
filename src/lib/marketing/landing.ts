import { getModel } from '@/lib/ai/registry'
import type { ProviderName } from '@/types/database'

/**
 * Landing-page copy.
 *
 * Deliberately separate from lib/ai/registry.ts. The registry describes what
 * the product can run; this describes what the page says about it. Mixing the
 * two means a copy change is a change to the thing that prices generations,
 * which is not a trade anyone should make for a headline.
 *
 * Two rules hold everywhere in this file:
 *
 * 1. No invented social proof. There are no customer logos, no creator counts
 *    and no named testimonials, because none of them would be real. The
 *    numbers on the page are counted from the catalogue at render time, and
 *    the "runs on" row names the three providers this build genuinely talks to.
 *
 * 2. `modelId` is the join to the registry, and `creditsFor` reads the live
 *    price — so a figure here cannot drift from the one the composer charges.
 */

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

export interface ShowcaseModel {
  /** Registry id, so the live price and latency can be looked up. */
  modelId: string
  name: string
  vendor: ProviderName
  /** The open model underneath, named plainly. */
  basis: string
  description: string
  /** What someone would actually reach for it to do. */
  useCase: string
  kind: 'image' | 'video'
}

export const SHOWCASE_MODELS: ShowcaseModel[] = [
  {
    modelId: 'lumen-flash',
    name: 'Lumen Flash',
    vendor: 'huggingface',
    basis: 'FLUX.1 [schnell]',
    description:
      'Four steps and Apache-2.0. Fast enough to iterate on a look before you commit a credit to the finished frame.',
    useCase: 'Drafts and start frames',
    kind: 'image',
  },
  {
    modelId: 'lumen-pro',
    name: 'Lumen Pro',
    vendor: 'fal',
    basis: 'FLUX.1 [dev]',
    description:
      'Photoreal detail and composition that holds together. The default when the frame is the deliverable.',
    useCase: 'Finished stills',
    kind: 'image',
  },
  {
    modelId: 'lumen-sdxl',
    name: 'Lumen SDXL',
    vendor: 'fal',
    basis: 'Stable Diffusion XL',
    description:
      'The open workhorse. Broad style range and the cheapest pass in the catalogue.',
    useCase: 'Style exploration',
    kind: 'image',
  },
  {
    modelId: 'motion-turbo',
    name: 'Motion Turbo',
    vendor: 'fal',
    basis: 'Wan 2.2 turbo',
    description:
      'Quick motion passes while you dial in a camera move, before you pay for the long one.',
    useCase: 'Image to video',
    kind: 'video',
  },
  {
    modelId: 'motion-cine',
    name: 'Motion Cine',
    vendor: 'fal',
    basis: 'Wan 2.2 A14B',
    description:
      'Holds a face, an outfit and a lighting setup through an entire camera move — continuity over speed.',
    useCase: 'Character-led shots',
    kind: 'video',
  },
  {
    modelId: 'motion-scene',
    name: 'Motion Scene',
    vendor: 'fal',
    basis: 'Wan 2.2 text-to-video',
    description:
      'Straight from a sentence to a moving shot, with no start frame and no storyboard.',
    useCase: 'Text to video',
    kind: 'video',
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
// Product overview
// ---------------------------------------------------------------------------

/**
 * The five surfaces of the workspace, in the order the sidebar lists them.
 *
 * `href` points at the real route, so a visitor who clicks one lands on the
 * thing described — via sign-in if they need it. A marketing diagram that is
 * not also a navigation is a diagram nobody uses twice.
 */
export const WORKSPACE_SURFACES = [
  {
    key: 'compose',
    href: '/create',
    label: 'Compose',
    body: 'Prompt, preset, model and reference image in one panel. Queue two jobs and keep typing.',
  },
  {
    key: 'organise',
    href: '/projects',
    label: 'Organise',
    body: 'Projects hold the shots that belong together. Rename, recolour, archive, restore.',
  },
  {
    key: 'library',
    href: '/library',
    label: 'Library',
    body: 'Every asset you own, filterable by kind and ratio, downloadable at full size.',
  },
  {
    key: 'history',
    href: '/history',
    label: 'History',
    body: 'Every job you have run, with the prompt, the seed and what it cost.',
  },
  {
    key: 'explore',
    href: '/explore',
    label: 'Explore',
    body: 'What other people published. Like it, open it, remix it with one value changed.',
  },
] as const

export const OVERVIEW_POINTS = [
  {
    title: 'One surface, not five tools',
    body: 'Generate a still and animate it in the same panel. Nothing is exported, re-uploaded or renamed in between.',
  },
  {
    title: 'The cost is on screen before you spend it',
    body: 'Every model shows its credit price in the selector. The balance updates the moment a job is accepted, and a failed job refunds itself.',
  },
  {
    title: 'Your keys, your quota',
    body: 'Connect a Hugging Face, fal.ai or Replicate account and your generations run on it. Encrypted at rest, removable in one click.',
  },
] as const

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

/**
 * One card per generation task the product actually performs.
 *
 * `task` matches `GenerationTask`, so the section can count the registry
 * rather than quote a number: a task with no models left in the catalogue
 * disappears from the page instead of advertising nothing.
 */
export const CAPABILITIES = [
  {
    task: 'text_to_image',
    title: 'Text to image',
    body: 'A sentence and a style preset return a finished frame. Five aspect ratios, seeds you can reuse, negative prompts when you need to exclude something.',
    detail: 'Reach for it to find the frame before you spend anything animating it.',
  },
  {
    task: 'image_to_video',
    title: 'Image to video',
    body: 'Drop in a still and pick a camera move. The preset carries the prompt language and the model parameters that make a push, an orbit or a crash zoom actually read.',
    detail: 'The shortest path from a photograph you already like to a shot.',
  },
  {
    task: 'text_to_video',
    title: 'Text to video',
    body: 'Straight from a description to moving footage, with no start frame. Useful when the look in your head has no reference to upload.',
    detail: 'Five and ten second passes, up to 21:9.',
  },
] as const

// ---------------------------------------------------------------------------
// Feature highlights
// ---------------------------------------------------------------------------

/**
 * The bento grid. `span` is a Tailwind class rather than a number because the
 * grid is asymmetric by design and the exceptions are easier to read as
 * classes than as a layout algorithm nobody will remember.
 */
export const FEATURE_HIGHLIGHTS = [
  {
    title: 'Presets that carry real craft',
    body: 'Each one pins a prompt fragment, a negative prompt and the model parameters behind a camera move. Browse them, preview them, apply one in a click.',
    span: 'lg:col-span-3',
  },
  {
    title: 'Live job feed',
    body: 'Cards stream queued → rendering → ready without a refresh, with a progress bar that comes from the provider rather than a timer.',
    span: 'lg:col-span-3',
  },
  {
    title: 'Remix anything',
    body: 'Every shot keeps its prompt, preset, model and seed. Pull one back into the composer and change one value.',
    span: 'lg:col-span-2',
  },
  {
    title: 'Publish to Explore',
    body: 'Share a shot to the public feed, or keep everything private. Likes and remix counts are per shot.',
    span: 'lg:col-span-2',
  },
  {
    title: 'Refunds on failure',
    body: 'A provider error returns the credits automatically, in the same transaction that marks the job failed.',
    span: 'lg:col-span-2',
  },
] as const

// ---------------------------------------------------------------------------
// FAQ
// ---------------------------------------------------------------------------

/**
 * Questions someone would actually ask before signing up, including the two
 * most products bury: what this costs, and whether the billing is real.
 */
export const FAQ = [
  {
    q: 'Do I need my own API keys to start?',
    a: 'No. Signing up grants credits that run on the studio account, so your first generation costs nothing and needs no setup. Connecting your own Hugging Face, fal.ai or Replicate key is optional, and after that your generations run on your quota instead of the shared one.',
  },
  {
    q: 'Which models can I use?',
    a: 'Open-weight ones — the FLUX.1 family, Stable Diffusion XL, Wan 2.2, LTX-Video, CogVideoX and HunyuanVideo — served through Hugging Face, fal.ai or Replicate. The model list on this page is read from the same registry the composer uses, so it is never out of date.',
  },
  {
    q: 'What is a credit worth?',
    a: 'A credit is a unit of render cost, and every model shows its price in the composer before you submit. A quick still is a few credits; a ten-second motion pass is more. Jobs that fail refund automatically.',
  },
  {
    q: 'Is the billing real?',
    a: 'No, and the app says so wherever it comes up. Checkout in this build is simulated: no payment provider is connected, no card is charged, and no card details are stored. Plans and credit grants otherwise behave exactly as they would.',
  },
  {
    q: 'Who owns what I make?',
    a: 'You do. Shots stay private until you publish them, downloads are the full-resolution original, and deleting an asset removes it from storage rather than hiding it. The underlying models carry their own licences — all of them open.',
  },
  {
    q: 'What happens to the images I upload?',
    a: 'A reference image is stored in your own private bucket, used as the start frame for the job you submitted, and deletable from the library. It is not used to train anything.',
  },
] as const
