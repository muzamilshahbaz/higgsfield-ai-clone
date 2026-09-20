import 'server-only'

import { EXPLORE_PRIVATE_FIELDS, type ExploreItem, type ExploreSort } from '@/lib/explore'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { assetsByGeneration } from '@/services/asset.service'
import type { GenerationRow } from '@/types/database'

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
 * in — RLS is what decides a visitor sees only published, finished work.
 */

export interface ListPublicOptions {
  sort?: ExploreSort
  limit?: number
  offset?: number
  /** Excludes one generation — used by "more like this" on a permalink. */
  excludeId?: string
}

export async function listPublicGenerations(
  options: ListPublicOptions = {},
): Promise<ExploreItem[]> {
  const { sort = 'new', limit = 24, offset = 0, excludeId } = options

  const supabase = await createClient()

  let query = supabase
    .from('generations')
    .select('*')
    .eq('visibility', 'public')
    .eq('status', 'succeeded')
    .is('deleted_at', null)

  if (excludeId) query = query.neq('id', excludeId)

  // `created_at` always breaks the tie, so "top" is stable between renders
  // rather than reshuffling rows that share a like count.
  if (sort === 'top') query = query.order('like_count', { ascending: false })

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .range(Math.max(0, offset), Math.max(0, offset) + limit - 1)

  if (error) {
    console.error('[explore.service] listPublicGenerations failed:', error.message)
    return []
  }

  return decorate(data ?? [])
}

/**
 * One published generation, for `/g/[id]`.
 *
 * Deliberately strict about `visibility`: the owner reading their own private
 * row is allowed by RLS, but a permalink that quietly works for its author and
 * 404s for everyone else is worse than one that is simply not live yet.
 */
export async function getPublicGeneration(id: string): Promise<ExploreItem | null> {
  const supabase = await createClient()

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
 * Attaches media and the viewer's own like state, and drops the fields that
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
  const [assets, liked] = await Promise.all([assetsByGeneration(ids), likedIds(ids)])

  return rows.map((row) => {
    const publicRow = { ...row } as Record<string, unknown>
    for (const field of EXPLORE_PRIVATE_FIELDS) delete publicRow[field]

    return {
      ...(publicRow as Omit<GenerationRow, (typeof EXPLORE_PRIVATE_FIELDS)[number]>),
      assets: assets.get(row.id) ?? [],
      liked: liked.has(row.id),
    }
  })
}

/**
 * Which of these the signed-in viewer has liked.
 *
 * Read through `likes_select_own`, so this returns the caller's own rows and
 * nothing else — there is no way to ask who else liked something, which is the
 * intended limit of this feature.
 */
async function likedIds(generationIds: string[]): Promise<Set<string>> {
  const found = new Set<string>()

  const user = await getCurrentUser()
  if (!user || generationIds.length === 0) return found

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('likes')
    .select('generation_id')
    .in('generation_id', generationIds)

  if (error) {
    console.error('[explore.service] likedIds failed:', error.message)
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
 * `toggle_like()` (0002_functions.sql), which is `SECURITY DEFINER` — the
 * `likes` policies let a user write their own row, but only that function may
 * touch someone else's `like_count`, so the two can never drift apart.
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
    return { ok: false, error: 'Could not register that. Try again.' }
  }

  const { data: row } = await supabase
    .from('generations')
    .select('like_count')
    .eq('id', generationId)
    .maybeSingle()

  return { ok: true, liked: Boolean(liked), likeCount: row?.like_count ?? 0 }
}
