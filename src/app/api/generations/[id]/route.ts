import { NextResponse } from 'next/server'

import { getGeneration } from '@/services/generation.service'

/**
 * GET /api/generations/:id — one generation with its media.
 *
 * Read through the user's client, so RLS decides what is visible: their own
 * rows, plus anything published to Explore.
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

  return NextResponse.json({ generation })
}
