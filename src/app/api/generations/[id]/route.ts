import { NextResponse } from 'next/server'

import { EXPLORE_PRIVATE_FIELDS } from '@/lib/explore'
import { getCurrentUser } from '@/lib/supabase/server'
import { getGeneration } from '@/services/generation.service'

/**
 * GET /api/generations/:id — one generation with its media.
 *
 * Read through the user's client, so RLS decides what is visible: their own
 * rows, plus anything published to Explore.
 *
 * Which of those two it is changes the shape of the answer. On your own row
 * you get everything, because it is yours. On someone else's published row
 * you get what Explore gives — the render, not what it cost us to make, which
 * vendor job produced it or which of their projects it lives in.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params

  const generation = await getGeneration(id)
  if (!generation) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'That generation does not exist.' } },
      { status: 404 },
    )
  }

  const user = await getCurrentUser()
  if (user?.id === generation.user_id) return NextResponse.json({ generation })

  const publicRow = { ...generation } as Record<string, unknown>
  for (const field of EXPLORE_PRIVATE_FIELDS) delete publicRow[field]

  return NextResponse.json({ generation: publicRow })
}
