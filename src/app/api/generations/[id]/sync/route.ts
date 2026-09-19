import { NextResponse } from 'next/server'

import { syncGeneration } from '@/services/generation.service'

/**
 * POST /api/generations/:id/sync — advance one job.
 *
 * The ticker uses the batch endpoint at /api/generations/sync instead, so N
 * running jobs cost one round trip rather than N. This one exists for a single
 * card asking about itself.
 */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params

  const generation = await syncGeneration(id)
  if (!generation) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'That generation does not exist.' } },
      { status: 404 },
    )
  }

  return NextResponse.json({ generation })
}
