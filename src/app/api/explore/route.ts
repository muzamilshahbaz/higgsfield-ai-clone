import { NextResponse } from 'next/server'

import { isExploreCategory } from '@/lib/categories'
import { RATE_LIMITS } from '@/lib/constants'
import { isExploreSort } from '@/lib/explore'
import { clientKey, rateLimit, tooManyRequests } from '@/lib/rate-limit'
import { getCurrentUser } from '@/lib/supabase/server'
import { listPublicGenerations } from '@/services/explore.service'

/**
 * GET /api/explore — the public feed, filtered, searched, sorted and paged.
 *
 * Deliberately open to signed-out callers: it returns exactly what the RLS
 * `generations_select_public` policy allows, which is published, finished,
 * undeleted work and nothing else. The `liked`, `favourited` and `isOwner`
 * flags ride along per viewer, so an anonymous request simply gets `false`
 * everywhere.
 *
 * Every parameter is validated against a known set rather than passed
 * through. An unrecognised sort or category falls back to the default instead
 * of erroring — a hand-edited URL should show the feed, not a stack trace —
 * and the search term is sanitised in the service, where the query it is
 * spliced into lives.
 */
export async function GET(request: Request) {
  // The one endpoint a visitor can reach without an account, so it is keyed
  // by IP. A signed-in caller is keyed by id instead, which survives them
  // switching networks mid-scroll.
  const user = await getCurrentUser()
  const quota = rateLimit(clientKey(request, user?.id), RATE_LIMITS.explore)
  if (!quota.ok) {
    return tooManyRequests(quota, 'Slow down a moment — the feed is rate limited.')
  }

  const url = new URL(request.url)

  const limitParam = Number(url.searchParams.get('limit'))
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 48) : 24

  const offsetParam = Number(url.searchParams.get('offset'))
  const offset = Number.isFinite(offsetParam) && offsetParam > 0 ? Math.floor(offsetParam) : 0

  const sortParam = url.searchParams.get('sort')
  const sort = isExploreSort(sortParam) ? sortParam : 'new'

  const categoryParam = url.searchParams.get('category')
  const category = isExploreCategory(categoryParam) ? categoryParam : null

  const search = url.searchParams.get('q')

  const generations = await listPublicGenerations({ sort, category, search, limit, offset })

  // `hasMore` from a full page rather than a second count query: one extra
  // round trip per scroll is not worth an exact total nobody reads.
  return NextResponse.json({ generations, hasMore: generations.length === limit })
}
