import {
  Boxes,
  Building2,
  Clapperboard,
  Cpu,
  Flame,
  Image as ImageIcon,
  Leaf,
  Package,
  Shapes,
  Shirt,
  Sparkles,
  UserRound,
  UtensilsCrossed,
  Video,
  type LucideIcon,
} from 'lucide-react'

import type { ExploreCategorySlug, GenerationTask } from '@/types/database'

/**
 * What Explore can be browsed by.
 *
 * Three different things wear the same chip in the filter rail, and keeping
 * that distinction explicit is what stops the feed query from guessing:
 *
 *  - `feed`  — not a property of a shot at all. "Trending" is a ranking, and
 *              selecting it changes the sort rather than adding a filter.
 *  - `task`  — derived from a column that already exists. "Images" and
 *              "Videos" are `task` values, so they need no tag and are
 *              correct for every row ever generated, including the ones made
 *              before categories existed.
 *  - `tag`   — the editorial vocabulary in `categories`, chosen by the author
 *              when they publish.
 *
 * Only `tag` entries may be written to the database. The check constraint in
 * migration 0013 lists exactly those eight slugs, and `categories.test.ts`
 * fails if this file and that constraint drift apart.
 */

export type ExploreCategoryKind = 'feed' | 'task' | 'tag'

export interface ExploreCategory {
  slug: string
  label: string
  kind: ExploreCategoryKind
  /** Shown as the rail's tooltip and on the empty state for that category. */
  description: string
  icon: LucideIcon
}

/** The eight writable tags, in the order the publish dialog offers them. */
export const CATEGORY_TAGS: readonly ExploreCategorySlug[] = [
  'portraits',
  'anime',
  'fashion',
  'architecture',
  'fantasy',
  'nature',
  'product',
  'food',
  'technology',
  'abstract',
  'cinematic',
] as const

export const TAG_LABELS: Record<ExploreCategorySlug, string> = {
  portraits: 'Portraits',
  anime: 'Anime',
  fashion: 'Fashion',
  architecture: 'Architecture',
  fantasy: 'Fantasy',
  nature: 'Nature',
  product: 'Product',
  food: 'Food',
  technology: 'Technology',
  abstract: 'Abstract',
  cinematic: 'Cinematic',
}

const TAG_ICONS: Record<ExploreCategorySlug, LucideIcon> = {
  portraits: UserRound,
  anime: Sparkles,
  fashion: Shirt,
  architecture: Building2,
  fantasy: Shapes,
  nature: Leaf,
  product: Package,
  food: UtensilsCrossed,
  technology: Cpu,
  abstract: Boxes,
  cinematic: Clapperboard,
}

const TAG_DESCRIPTIONS: Record<ExploreCategorySlug, string> = {
  portraits: 'Faces, figures and character work.',
  anime: 'Illustrated and animation-led styles.',
  fashion: 'Clothing, styling and editorial looks.',
  architecture: 'Buildings, interiors and structure.',
  fantasy: 'Invented worlds, myth and the impossible.',
  nature: 'Landscape, weather, plants and animals.',
  product: 'Objects shot like they are for sale.',
  food: 'Dishes, ingredients and the table.',
  technology: 'Machines, interfaces and hardware.',
  abstract: 'Texture, colour and form over subject.',
  cinematic: 'Film looks, camera moves and lighting.',
}

export const EXPLORE_CATEGORIES: readonly ExploreCategory[] = [
  {
    slug: 'all',
    label: 'Everything',
    kind: 'feed',
    description: 'Every public shot, newest first.',
    icon: Sparkles,
  },
  {
    slug: 'trending',
    label: 'Trending',
    kind: 'feed',
    description: 'What people are engaging with this month.',
    icon: Flame,
  },
  {
    slug: 'images',
    label: 'Images',
    kind: 'task',
    description: 'Stills only.',
    icon: ImageIcon,
  },
  {
    slug: 'videos',
    label: 'Videos',
    kind: 'task',
    description: 'Motion only.',
    icon: Video,
  },
  ...CATEGORY_TAGS.map((slug) => ({
    slug,
    label: TAG_LABELS[slug],
    kind: 'tag' as const,
    description: TAG_DESCRIPTIONS[slug],
    icon: TAG_ICONS[slug],
  })),
] as const

const BY_SLUG = new Map(EXPLORE_CATEGORIES.map((category) => [category.slug, category]))

export function getCategory(slug: string | null | undefined): ExploreCategory | null {
  if (!slug) return null
  return BY_SLUG.get(slug) ?? null
}

/** Narrows a URL parameter to a category the feed knows how to serve. */
export function isExploreCategory(value: string | null | undefined): boolean {
  return typeof value === 'string' && BY_SLUG.has(value)
}

/** Narrows an arbitrary string to one of the eight writable tags. */
export function isCategoryTag(value: unknown): value is ExploreCategorySlug {
  return typeof value === 'string' && (CATEGORY_TAGS as readonly string[]).includes(value)
}

/**
 * Keeps only real tags, de-duplicated and capped.
 *
 * The cap matches the check constraint. Enforcing it here too means a user who
 * ticks a fifth box gets a disabled checkbox rather than a database error, and
 * the two limits cannot disagree because the test asserts they are the same
 * number.
 */
export const MAX_CATEGORIES = 4

export function normaliseCategories(input: readonly unknown[]): ExploreCategorySlug[] {
  const kept: ExploreCategorySlug[] = []

  for (const value of input) {
    if (!isCategoryTag(value)) continue
    if (kept.includes(value)) continue
    kept.push(value)
    if (kept.length === MAX_CATEGORIES) break
  }

  // Returned in catalogue order rather than click order, so two shots tagged
  // the same way always render their chips the same way.
  return CATEGORY_TAGS.filter((slug) => kept.includes(slug))
}

/** The task values behind the Images / Videos chips. */
export const TASKS_FOR_CATEGORY: Record<string, GenerationTask[]> = {
  images: ['text_to_image'],
  videos: ['text_to_video', 'image_to_video'],
}

/**
 * A first guess at what a shot is, from the words in its prompt.
 *
 * Offered as pre-ticked boxes in the publish dialog, never written on the
 * author's behalf — the point is to save typing for someone who agrees, not to
 * tag the feed automatically and be wrong in public. A prompt that matches
 * nothing suggests nothing, which is the honest outcome.
 */
const KEYWORDS: Record<ExploreCategorySlug, readonly string[]> = {
  portraits: [
    'portrait', 'face', 'headshot', 'woman', 'man', 'girl', 'boy', 'person',
    'model', 'character', 'eyes', 'hair', 'smile',
  ],
  anime: ['anime', 'manga', 'studio ghibli', 'ghibli', 'cel shaded', 'chibi', 'shonen', 'waifu'],
  cinematic: [
    'cinematic', 'film', 'movie', 'anamorphic', 'bokeh', '35mm', '70mm', 'grain',
    'dolly', 'tracking shot', 'noir', 'widescreen', 'lens flare',
  ],
  product: [
    'product', 'packshot', 'bottle', 'perfume', 'sneaker', 'watch', 'cosmetic',
    'studio lighting', 'commercial', 'advert', 'mockup', 'branding',
    // A still life on a sweep is the commonest product shot there is, and the
    // words people actually type for it are these.
    'backdrop', 'plinth', 'vase', 'seamless', 'packaging', 'still life',
  ],
  nature: [
    'forest', 'mountain', 'ocean', 'sea', 'beach', 'river', 'sunset', 'sunrise',
    'landscape', 'wildlife', 'animal', 'flower', 'jungle', 'desert', 'sky', 'storm',
    // Landforms and light, which is how people actually describe a landscape —
    // "a cliff edge at golden hour" matched nothing at all before these.
    'cliff', 'coast', 'valley', 'lake', 'hill', 'meadow', 'canyon', 'waterfall',
    'snow', 'horizon', 'golden hour', 'dusk', 'dawn',
  ],
  architecture: [
    'architecture', 'building', 'interior', 'facade', 'skyscraper', 'cathedral',
    'brutalist', 'house', 'room', 'city street', 'bridge', 'temple',
  ],
  fantasy: [
    'fantasy', 'dragon', 'wizard', 'magic', 'elf', 'castle', 'mythical', 'sci-fi',
    'scifi', 'cyberpunk', 'alien', 'spaceship', 'futuristic', 'steampunk',
  ],
  abstract: [
    'abstract', 'geometric', 'fractal', 'pattern', 'texture', 'gradient',
    'minimal', 'surreal', 'kaleidoscope', 'liquid', 'smoke',
  ],
  fashion: [
    'fashion', 'runway', 'couture', 'editorial', 'model', 'outfit', 'dress',
    'suit', 'streetwear', 'garment', 'jacket', 'catwalk', 'vogue', 'styling',
  ],
  food: [
    'food', 'dish', 'meal', 'plate', 'cuisine', 'chef', 'restaurant', 'bakery',
    'dessert', 'cake', 'coffee', 'cocktail', 'kitchen', 'ingredient', 'recipe',
  ],
  technology: [
    'technology', 'robot', 'circuit', 'server', 'laptop', 'phone', 'drone',
    'hardware', 'microchip', 'dashboard', 'interface', 'screen', 'lab',
    'machine', 'engine',
  ],
}

/**
 * Whole words only.
 *
 * A plain `includes` looked fine until a vase on a "seamless studio backdrop"
 * came back tagged Nature — because "seamless" contains "sea". The same trap
 * is waiting in "human" for `man`, "whisky" for `sky` and "romantic" for
 * `man` again, and every one of them would have tagged somebody's work wrongly
 * in a public feed.
 *
 * Built once per keyword and cached: this runs over every tag's word list on
 * each keystroke-free call, and recompiling a hundred regexes per suggestion
 * is waste for no benefit.
 */
const WORD_MATCHERS = new Map<string, RegExp>()

function matchesWord(haystack: string, keyword: string): boolean {
  let matcher = WORD_MATCHERS.get(keyword)

  if (!matcher) {
    // Hyphens and digits appear in real keywords ("sci-fi", "35mm"), and the
    // regex word boundary does not behave around those the way it does around
    // letters, so the boundary is spelled out as "not a letter or digit" on
    // either side. The optional plural lets one keyword cover "bottle" and
    // "bottles" without listing both.
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    matcher = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:s|es)?(?:$|[^a-z0-9])`, 'i')
    WORD_MATCHERS.set(keyword, matcher)
  }

  return matcher.test(haystack)
}

export function suggestCategories(
  prompt: string,
  presetCategory?: string | null,
): ExploreCategorySlug[] {
  const haystack = `${prompt} ${presetCategory ?? ''}`.toLowerCase()
  if (!haystack.trim()) return []

  const scored: { slug: ExploreCategorySlug; hits: number }[] = []

  for (const slug of CATEGORY_TAGS) {
    let hits = 0
    for (const keyword of KEYWORDS[slug]) {
      if (matchesWord(haystack, keyword)) hits += 1
    }
    if (hits > 0) scored.push({ slug, hits })
  }

  // Strongest match first, so the cap keeps the best guesses rather than the
  // alphabetically luckiest.
  scored.sort((a, b) => b.hits - a.hits)

  return normaliseCategories(scored.slice(0, MAX_CATEGORIES).map((entry) => entry.slug))
}
