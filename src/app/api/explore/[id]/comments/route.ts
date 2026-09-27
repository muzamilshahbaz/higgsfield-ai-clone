import { NextResponse } from 'next/server'

import { RATE_LIMITS } from '@/lib/constants'
import { clientKey, rateLimit, tooManyRequests } from '@/lib/rate-limit'
import { getCurrentUser } from '@/lib/supabase/server'
import { listComments } from '@/services/comment.service'

/**
 * GET /api/explore/[id]/comments — one shot's thread.
 *
 * A route handler rather than a Server Action because the detail dialog loads
 * a thread on open and after every post, and an action would re-run the
 * page's own data fetching each time to deliver a list of comments.
 *
 * Open to signed-out callers, and safe to be: `comments_select_public`
 * re-checks the parent generation on every row, so an id belonging to private
 * or deleted work returns an empty array — identical to an id with no
 * comments, and identical to one that never existed. There is nothing here to
 * probe with.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  const quota = rateLimit(clientKey(request, user?.id), RATE_LIMITS.explore)
  if (!quota.ok) {
    return tooManyRequests(quota, 'Slow down a moment — comments are rate limited.')
  }

  const { id } = await params
  const comments = await listComments(id)

  return NextResponse.json({ comments })
}
