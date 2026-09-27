import type { CommentRow, GenerationWithAssets } from '@/types/database'

/**
 * Shared shapes for the public feed.
 *
 * Separate from `explore.service` because that module is `server-only` — the
 * feed's client components need the same types and the same idea of what a
 * valid sort is, and importing them from the service would drag a server
 * module into the browser bundle.
 */

export type ExploreSort = 'new' | 'top' | 'downloads' | 'trending'

export const EXPLORE_SORTS: ExploreSort[] = ['new', 'top', 'downloads', 'trending']

export const EXPLORE_SORT_LABELS: Record<ExploreSort, string> = {
  new: 'Newest',
  top: 'Most liked',
  downloads: 'Most downloaded',
  trending: 'Trending',
}

export function isExploreSort(value: string | null | undefined): value is ExploreSort {
  return typeof value === 'string' && EXPLORE_SORTS.includes(value as ExploreSort)
}

/**
 * How far back "Trending" looks.
 *
 * `engagement_score` is a stored column and so cannot contain a decay term —
 * see migration 0013. The recency it needs comes from this window instead: a
 * month is long enough that a quiet week does not empty the tab, and short
 * enough that the same six shots do not own it forever.
 *
 * `listPublicGenerations` drops the window when it would return nothing, so a
 * young feed still has a Trending tab that works.
 */
export const TRENDING_WINDOW_DAYS = 30

/**
 * Fields a published row keeps to itself.
 *
 * Explore is served to anyone, signed in or not, so its rows are a *public
 * projection* rather than the stored row. Five of these are operational
 * plumbing or commercial data that a visitor has no use for: what a render
 * cost us, which job the vendor gave it, the key that deduplicated the submit,
 * which of the author's projects it was filed under, and how a failure read.
 *
 * `user_id` is the sixth and is here for a different reason. The author is
 * already named publicly by the denormalised `author_handle`, so their
 * internal id adds nothing a visitor can use — but it is the same id that
 * appears in `auth.uid()` comparisons throughout the schema, and an endpoint
 * that hands out a directory of them for free is doing a stranger's
 * enumeration work. `isOwner` is computed on the server precisely so no
 * client needs it.
 *
 * Declared as a type, not just stripped at runtime, so `tsc` is what stops a
 * component reaching for one of them again.
 */
export const EXPLORE_PRIVATE_FIELDS = [
  'provider_cost_usd',
  'provider_job_id',
  'idempotency_key',
  'project_id',
  'error_message',
  'user_id',
] as const

export type ExplorePrivateField = (typeof EXPLORE_PRIVATE_FIELDS)[number]

/**
 * A feed row: the public part of the generation, its media, and the viewer's
 * own engagement with it.
 *
 * `liked` and `favourited` are per-viewer and always `false` for a signed-out
 * visitor. `isOwner` is what gates the visibility badge — a card must be able
 * to tell its author apart from everyone else without the component going
 * back to the server to ask.
 */
export type ExploreItem = Omit<GenerationWithAssets, ExplorePrivateField> & {
  liked: boolean
  favourited: boolean
  isOwner: boolean
}

/** A comment as the thread renders it, plus whether the viewer may remove it. */
export type ExploreComment = CommentRow & {
  /** True for the comment's author and for the owner of the work it is on. */
  canDelete: boolean
  replies: ExploreComment[]
}

/** The byline a card shows, falling back through what the row actually has. */
export function authorNameOf(item: Pick<ExploreItem, 'author_name' | 'author_handle'>): string {
  return item.author_name?.trim() || (item.author_handle ? `@${item.author_handle}` : 'Someone')
}

/** Initials for the byline avatar, matching `initialsFor` on the profile side. */
export function authorInitialsOf(
  item: Pick<ExploreItem, 'author_name' | 'author_handle'>,
): string {
  const source = item.author_name?.trim() || item.author_handle || '?'
  const words = source.split(/\s+/).filter(Boolean)

  if (words.length >= 2) return `${words[0]![0]!}${words[1]![0]!}`.toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

/**
 * What a card leads with.
 *
 * A title when the author set one, the prompt when they did not, and a plain
 * statement of fact when there is neither — a preset-only shot has no prompt
 * by design, and "Untitled" tells the reader less than what it actually is.
 */
export function displayTitleOf(
  item: Pick<ExploreItem, 'title' | 'prompt'>,
): string {
  return item.title?.trim() || item.prompt.trim() || 'Preset-only shot'
}
