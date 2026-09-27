import { NextResponse } from 'next/server'

import { RATE_LIMITS } from '@/lib/constants'
import { clientKey, rateLimit, tooManyRequests } from '@/lib/rate-limit'
import { getCurrentUser } from '@/lib/supabase/server'
import { listMyFavourites } from '@/services/explore.service'

/**
 * GET /api/favourites — the signed-in user's saved shots, paged.
 *
 * Unlike `/api/explore` this one refuses anonymous callers outright. The feed
 * is a public surface whose emptiness means something; a favourites list has
 * no meaningful anonymous form, and returning `[]` to a signed-out caller
 * would look to the page exactly like a user with nothing saved.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Sign in to see your favourites.' } },
      { status: 401 },
    )
  }

  const quota = rateLimit(clientKey(request, user.id), RATE_LIMITS.explore)
  if (!quota.ok) {
    return tooManyRequests(quota, 'Slow down a moment — try again shortly.')
  }

  const url = new URL(request.url)

  const limitParam = Number(url.searchParams.get('limit'))
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 48) : 24

  const offsetParam = Number(url.searchParams.get('offset'))
  const offset = Number.isFinite(offsetParam) && offsetParam > 0 ? Math.floor(offsetParam) : 0

  // The service reads `favourites` under its own own-row policy and with an
  // explicit `user_id` filter on top, so there is no id to pass in here — and
  // therefore no id anyone can substitute.
  const generations = await listMyFavourites({ limit, offset })

  return NextResponse.json({ generations, hasMore: generations.length === limit })
}
