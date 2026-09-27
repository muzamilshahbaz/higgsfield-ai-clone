import 'server-only'

import {
  CATEGORY_TAGS,
  TAG_LABELS,
  TASKS_FOR_CATEGORY,
  getCategory,
  isCategoryTag,
} from '@/lib/categories'
import {
  EXPLORE_PRIVATE_FIELDS,
  TRENDING_WINDOW_DAYS,
  type ExploreItem,
  type ExploreSort,
} from '@/lib/explore'
import { createClient, getCurrentUser, tryCreateClient } from '@/lib/supabase/server'
import { assetsByGeneration } from '@/services/asset.service'
import type { ExploreCategorySlug, GenerationRow } from '@/types/database'

/**
 * The public feed.
 *
 * A separate service from `generation.service` because it is a different read
 * model, not a different table: these queries are governed by
 * `generations_select_public`, they must work for a signed-out visitor, and
 * they carry engagement state the private surfaces have no use for. Keeping
 * them here means no read on the library side has to remember to exclude
 * someone else's rows.
 *
 * Everything uses the user-scoped client, which is anon when nobody is signed
 * in — RLS is what decides a visitor sees only published, finished work. The
 * explicit `.eq('visibility', 'public')` on every query is belt and braces on
 * top of that, and it matters: `generations_select_own` and
 * `generations_select_public` are both permissive policies on the same table,
 * so Postgres ORs them together. Without the filter, a signed-in author would
 * see their own private drafts mixed into Explore.
 */

export interface ListPublicOptions {
  sort?: ExploreSort
  /** A slug from `EXPLORE_CATEGORIES` — a tag, a media type, or `trending`. */
  category?: string | null
  /** Matched against prompt, title, creator name/handle and category labels. */
  search?: string | null
  limit?: number
  offset?: number
  /** Excludes one generation — used by "more like this" on a permalink. */
  excludeId?: string
}

export async function listPublicGenerations(
  options: ListPublicOptions = {},
): Promise<ExploreItem[]> {
  const rows = await selectPublic(options)
  return decorate(rows)
}

/**
 * The query behind the feed, before decoration.
 *
 * Split out because "Trending" needs to be able to run twice: once inside its
 * recency window, and once without it when that window is empty. A feed tab
 * that shows nothing on a young site is a bug, not a true statement about
 * engagement.
 */
async function selectPublic(options: ListPublicOptions): Promise<GenerationRow[]> {
  const { category } = options

  // "Trending" is a ranking wearing a category chip — selecting it changes the
  // sort, and leaves the tag filter alone.
  const resolvedSort: ExploreSort = category === 'trending' ? 'trending' : (options.sort ?? 'new')

  const rows = await runQuery(options, resolvedSort, resolvedSort === 'trending')

  if (rows.length === 0 && resolvedSort === 'trending') {
    return runQuery(options, 'trending', false)
  }

  return rows
}

async function runQuery(
  options: ListPublicOptions,
  sort: ExploreSort,
  applyTrendingWindow: boolean,
): Promise<GenerationRow[]> {
  const { limit = 24, offset = 0, excludeId, category, search } = options

  const supabase = await tryCreateClient()
  if (!supabase) return []

  let query = supabase
    .from('generations')
    .select('*')
    .eq('visibility', 'public')
    .eq('status', 'succeeded')
    .is('deleted_at', null)

  if (excludeId) query = query.neq('id', excludeId)

  // ------------------------------------------------------------ category
  const resolved = getCategory(category)

  if (resolved?.kind === 'tag') {
    query = query.contains('categories', [resolved.slug])
  } else if (resolved?.kind === 'task') {
    const tasks = TASKS_FOR_CATEGORY[resolved.slug]
    if (tasks) query = query.in('task', tasks)
  }

  // -------------------------------------------------------------- search
  const term = sanitiseSearch(search)
  if (term) {
    const filters = [
      `prompt.ilike.*${term}*`,
      `title.ilike.*${term}*`,
      `author_handle.ilike.*${term}*`,
      `author_name.ilike.*${term}*`,
    ]

    // Typing "anime" should find shots tagged Anime, not only ones that happen
    // to say the word in their prompt. Matching the term against the category
    // vocabulary is what makes "search by tag" mean something.
    for (const slug of matchingTags(term)) {
      filters.push(`categories.cs.{${slug}}`)
    }

    query = query.or(filters.join(','))
  }

  // ---------------------------------------------------------------- sort
  if (applyTrendingWindow) {
    const since = new Date(Date.now() - TRENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    query = query.gte('created_at', since.toISOString())
  }

  if (sort === 'top') query = query.order('like_count', { ascending: false })
  else if (sort === 'downloads') query = query.order('download_count', { ascending: false })
  else if (sort === 'trending') query = query.order('engagement_score', { ascending: false })

  // `created_at` always breaks the tie, so every sort is stable between
  // renders rather than reshuffling rows that share a count.
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .range(Math.max(0, offset), Math.max(0, offset) + limit - 1)

  if (error) {
    console.error('[explore.service] listPublicGenerations failed:', error.message)
    return []
  }

  return data ?? []
}

/**
 * Makes a user's search term safe to splice into a PostgREST `or` filter.
 *
 * That parameter is a small language of its own — commas separate the
 * alternatives, parentheses group them, dots separate column from operator —
 * and supabase-js passes the string through untouched. A prompt search for
 * "a cat, sitting" would otherwise be read as two filters and return a 400,
 * and a deliberately shaped term could add a filter nobody intended. Every
 * character with meaning to that grammar, and the two `ilike` wildcards, come
 * out here.
 */
function sanitiseSearch(input: string | null | undefined): string {
  if (!input) return ''
  return input
    .trim()
    .replace(/[,().*%\\"'{}:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

/** Category tags whose slug or label contains the search term. */
function matchingTags(term: string): ExploreCategorySlug[] {
  const needle = term.toLowerCase()
  return CATEGORY_TAGS.filter(
    (slug) => slug.includes(needle) || TAG_LABELS[slug].toLowerCase().includes(needle),
  )
}

/**
 * One published generation, for `/g/[id]` and the detail dialog.
 *
 * Deliberately strict about `visibility`: the owner reading their own private
 * row is allowed by RLS, but a permalink that quietly works for its author and
 * 404s for everyone else is worse than one that is simply not live yet.
 */
export async function getPublicGeneration(id: string): Promise<ExploreItem | null> {
  const supabase = await tryCreateClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('generations')
    .select('*')
    .eq('id', id)
    .eq('visibility', 'public')
    .eq('status', 'succeeded')
    .is('deleted_at', null)
    .maybeSingle()

  if (error) {
    console.error('[explore.service] getPublicGeneration failed:', error.message)
    return null
  }
  if (!data) return null

  const [item] = await decorate([data])
  return item ?? null
}

/**
 * More public work like this one.
 *
 * Prefers shots sharing a category, then falls back to the newest of anything
 * so the strip is never half-empty. Both queries exclude the shot being
 * viewed, which is the one row guaranteed to match its own tags.
 */
export async function listRelatedGenerations(
  item: Pick<ExploreItem, 'id' | 'categories' | 'task'>,
  limit = 6,
): Promise<ExploreItem[]> {
  const supabase = await tryCreateClient()
  if (!supabase) return []

  const found = new Map<string, GenerationRow>()

  if (item.categories.length > 0) {
    const { data } = await supabase
      .from('generations')
      .select('*')
      .eq('visibility', 'public')
      .eq('status', 'succeeded')
      .is('deleted_at', null)
      .neq('id', item.id)
      .overlaps('categories', item.categories)
      .order('engagement_score', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit)

    for (const row of data ?? []) found.set(row.id, row)
  }

  if (found.size < limit) {
    const { data } = await supabase
      .from('generations')
      .select('*')
      .eq('visibility', 'public')
      .eq('status', 'succeeded')
      .is('deleted_at', null)
      .neq('id', item.id)
      .order('created_at', { ascending: false })
      .limit(limit)

    for (const row of data ?? []) {
      if (found.size >= limit) break
      if (!found.has(row.id)) found.set(row.id, row)
    }
  }

  return decorate([...found.values()].slice(0, limit))
}

/**
 * Attaches media and the viewer's own engagement, and drops the fields that
 * are not the public's business.
 *
 * The strip happens here rather than in the `select` because every caller of
 * this module is a public surface, and one projection that cannot be bypassed
 * beats a column list each query has to remember. `select('*')` also keeps the
 * queries readable while the row type stays generated.
 */
async function decorate(rows: GenerationRow[]): Promise<ExploreItem[]> {
  if (rows.length === 0) return []

  const ids = rows.map((row) => row.id)
  const user = await getCurrentUser()

  const [assets, liked, favourited] = await Promise.all([
    assetsByGeneration(ids),
    engagementIds('likes', ids, user?.id),
    engagementIds('favourites', ids, user?.id),
  ])

  return rows.map((row) => {
    const publicRow = { ...row } as Record<string, unknown>
    for (const field of EXPLORE_PRIVATE_FIELDS) delete publicRow[field]

    return {
      ...(publicRow as Omit<GenerationRow, (typeof EXPLORE_PRIVATE_FIELDS)[number]>),
      // A row written before migration 0013 has a null array until it is next
      // updated; the feed should render it as untagged rather than crash.
      categories: row.categories ?? [],
      assets: assets.get(row.id) ?? [],
      liked: liked.has(row.id),
      favourited: favourited.has(row.id),
      isOwner: Boolean(user) && row.user_id === user?.id,
    }
  })
}

/**
 * Which of these the signed-in viewer has liked or favourited.
 *
 * Both tables are own-row by policy, so this returns the caller's own rows and
 * nothing else — there is no way to ask who *else* liked something, which is
 * the intended limit of the feature. The explicit `user_id` filter is still
 * there: permissive policies OR together, and a future policy on either table
 * would otherwise silently widen this read.
 */
async function engagementIds(
  table: 'likes' | 'favourites',
  generationIds: string[],
  userId: string | undefined,
): Promise<Set<string>> {
  const found = new Set<string>()
  if (!userId || generationIds.length === 0) return found

  const supabase = await createClient()
  const { data, error } = await supabase
    .from(table)
    .select('generation_id')
    .eq('user_id', userId)
    .in('generation_id', generationIds)

  if (error) {
    console.error(`[explore.service] ${table} lookup failed:`, error.message)
    return found
  }

  for (const row of data ?? []) found.add(row.generation_id)
  return found
}

// ---------------------------------------------------------------------------
// Engagement
// ---------------------------------------------------------------------------

export type LikeResult =
  | { ok: true; liked: boolean; likeCount: number }
  | { ok: false; error: string }

/**
 * Likes and unlikes in one call.
 *
 * The counter on `generations` and the row in `likes` move together inside
 * `toggle_like()` (0002_functions.sql, hardened in 0006), which is
 * `SECURITY DEFINER` — the `likes` policies let a user write their own row,
 * but only that function may touch someone else's `like_count`, so the two can
 * never drift apart.
 *
 * The fresh count is read back rather than inferred, so a viewer who liked
 * something while three other people did the same sees the real number.
 */
export async function toggleLike(generationId: string): Promise<LikeResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Sign in to like a shot.' }

  const supabase = await createClient()

  const { data: liked, error } = await supabase.rpc('toggle_like', {
    p_generation_id: generationId,
  })

  if (error) {
    console.error('[explore.service] toggleLike failed:', error.message)
    return { ok: false, error: engagementError(error.message, 'like') }
  }

  const { data: row } = await supabase
    .from('generations')
    .select('like_count')
    .eq('id', generationId)
    .maybeSingle()

  return { ok: true, liked: Boolean(liked), likeCount: row?.like_count ?? 0 }
}

export type FavouriteResult =
  | { ok: true; favourited: boolean; favouriteCount: number }
  | { ok: false; error: string }

/** Favourites and unfavourites, through `toggle_favourite()` (migration 0013). */
export async function toggleFavourite(generationId: string): Promise<FavouriteResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Sign in to save a shot.' }

  const supabase = await createClient()

  const { data: favourited, error } = await supabase.rpc('toggle_favourite', {
    p_generation_id: generationId,
  })

  if (error) {
    console.error('[explore.service] toggleFavourite failed:', error.message)
    return { ok: false, error: engagementError(error.message, 'save') }
  }

  const { data: row } = await supabase
    .from('generations')
    .select('favourite_count')
    .eq('id', generationId)
    .maybeSingle()

  return {
    ok: true,
    favourited: Boolean(favourited),
    favouriteCount: row?.favourite_count ?? 0,
  }
}

export type DownloadResult =
  | { ok: true; downloadCount: number }
  | { ok: false; error: string }

/**
 * Counts a download of published work.
 *
 * Open to signed-out visitors on purpose: the feed is public and so is the
 * file, and a chart of "most downloaded" that only counted registered users
 * would be a chart of something else. `register_download()` refuses anything
 * that is not public and finished, so this cannot be used to probe for
 * private rows — an unpublished id and a nonexistent one fail identically.
 */
export async function registerDownload(generationId: string): Promise<DownloadResult> {
  const supabase = await tryCreateClient()
  if (!supabase) return { ok: false, error: 'Downloads are unavailable right now.' }

  const { data, error } = await supabase.rpc('register_download', {
    p_generation_id: generationId,
  })

  if (error) {
    console.error('[explore.service] registerDownload failed:', error.message)
    return { ok: false, error: 'That shot is not available to download.' }
  }

  return { ok: true, downloadCount: typeof data === 'number' ? data : 0 }
}

/**
 * Turns a Postgres error into something worth reading.
 *
 * The functions raise named exceptions rather than returning codes, and the
 * only two a user can actually cause are "that is not published" and "you are
 * not signed in". Everything else is ours, and says so.
 */
function engagementError(message: string, verb: string): string {
  if (message.includes('GENERATION_NOT_PUBLIC') || message.includes('GENERATION_NOT_FOUND')) {
    return 'That shot is no longer public.'
  }
  if (message.includes('NOT_AUTHENTICATED')) {
    return `Sign in to ${verb} a shot.`
  }
  return 'Could not register that. Try again.'
}

// ---------------------------------------------------------------------------
// Favourites
// ---------------------------------------------------------------------------

/**
 * Everything the signed-in user has favourited.
 *
 * Two queries rather than a join: `favourites` is own-row by policy and
 * `generations` is governed by its own pair of policies, so asking PostgREST
 * to embed one in the other makes the result depend on how those interact.
 * Reading the ids first and the rows second means each table is read under
 * exactly the policy written for it.
 *
 * A shot that has since been unpublished by its author drops out of the second
 * query — the favourite row survives, so it reappears if they publish again,
 * but it is not listed while it is private. The owner's own work is the
 * exception: they can always see their own.
 */
export async function listMyFavourites(
  options: { limit?: number; offset?: number } = {},
): Promise<ExploreItem[]> {
  const { limit = 24, offset = 0 } = options

  const user = await getCurrentUser()
  if (!user) return []

  const supabase = await createClient()

  const { data: rows, error } = await supabase
    .from('favourites')
    .select('generation_id, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(Math.max(0, offset), Math.max(0, offset) + limit - 1)

  if (error) {
    console.error('[explore.service] listMyFavourites failed:', error.message)
    return []
  }

  const ids = (rows ?? []).map((row) => row.generation_id)
  if (ids.length === 0) return []

  const { data: generations, error: readError } = await supabase
    .from('generations')
    .select('*')
    .in('id', ids)
    .is('deleted_at', null)

  if (readError) {
    console.error('[explore.service] favourite generations failed:', readError.message)
    return []
  }

  const visible = (generations ?? []).filter(
    (row) =>
      row.user_id === user.id ||
      (row.visibility === 'public' && row.status === 'succeeded'),
  )

  // Restored to the order the favourites were saved in; `in()` returns rows in
  // whatever order Postgres finds them, which is not the one the page promises.
  const order = new Map(ids.map((id, index) => [id, index]))
  visible.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))

  return decorate(visible)
}

/** How many favourites the user has, for the page header and paging. */
export async function countMyFavourites(): Promise<number> {
  const user = await getCurrentUser()
  if (!user) return 0

  const supabase = await createClient()
  const { count, error } = await supabase
    .from('favourites')
    .select('generation_id', { count: 'exact', head: true })
    .eq('user_id', user.id)

  if (error) {
    console.error('[explore.service] countMyFavourites failed:', error.message)
    return 0
  }
  return count ?? 0
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

/**
 * Retags a published shot.
 *
 * Ownership is enforced twice: once by `generations_update_own`, and once by
 * the explicit `user_id` filter here so the statement matches no rows at all
 * for anyone else rather than relying on the policy to reject it.
 */
export async function setGenerationCategories(
  generationId: string,
  categories: ExploreCategorySlug[],
): Promise<{ ok: true; categories: ExploreCategorySlug[] } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'You need to be signed in.' }

  const clean = categories.filter(isCategoryTag)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('generations')
    .update({ categories: clean })
    .eq('id', generationId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .select('categories')
    .maybeSingle()

  if (error) {
    // 23514 = check_violation: the only one this statement can raise is the
    // category vocabulary, since the values were filtered above.
    if (error.code === '23514') {
      return { ok: false, error: 'That is not a category you can use.' }
    }
    console.error('[explore.service] setGenerationCategories failed:', error.message)
    return { ok: false, error: 'Could not save those categories. Try again.' }
  }
  if (!data) return { ok: false, error: 'That generation is gone.' }

  return { ok: true, categories: (data.categories ?? []) as ExploreCategorySlug[] }
}
