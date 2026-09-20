import type { GenerationWithAssets } from '@/types/database'

/**
 * Shared shapes for the public feed.
 *
 * Separate from `explore.service` because that module is `server-only` — the
 * feed's client components need the same types and the same idea of what a
 * valid sort is, and importing them from the service would drag a server
 * module into the browser bundle.
 */

export type ExploreSort = 'new' | 'top'

export const EXPLORE_SORTS: ExploreSort[] = ['new', 'top']

export const EXPLORE_SORT_LABELS: Record<ExploreSort, string> = {
  new: 'Newest',
  top: 'Most liked',
}

export function isExploreSort(value: string | null | undefined): value is ExploreSort {
  return typeof value === 'string' && EXPLORE_SORTS.includes(value as ExploreSort)
}

/**
 * Fields a published row keeps to itself.
 *
 * Explore is served to anyone, signed in or not, so its rows are a *public
 * projection* rather than the stored row. These five are operational plumbing
 * or commercial data that a visitor has no use for: what a render cost us,
 * which job the vendor gave it, the key that deduplicated the submit, which
 * of the author's projects it was filed under, and how a failure read.
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
] as const

export type ExplorePrivateField = (typeof EXPLORE_PRIVATE_FIELDS)[number]

/** A feed row: the public part of the generation, its media, and the viewer's like. */
export type ExploreItem = Omit<GenerationWithAssets, ExplorePrivateField> & {
  liked: boolean
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
