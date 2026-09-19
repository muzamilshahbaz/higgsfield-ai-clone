import { NextResponse } from 'next/server'

import { env } from '@/lib/env'
import { sweepStaleJobs } from '@/services/generation.service'

/**
 * GET /api/cron/sweep — the backstop that finishes abandoned jobs.
 *
 * Vercel Hobby caps cron at once a day, so this is not the heartbeat: the
 * client ticker and the page-load sweep advance jobs in practice. This exists
 * so a job whose owner never comes back still gets refunded instead of sitting
 * in `running` forever.
 *
 * Vercel signs cron invocations with CRON_SECRET as a bearer token. When no
 * secret is configured the route stays open on localhost and refuses in
 * production, rather than silently letting anyone on the internet trigger it.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const secret = env.cronSecret

  if (secret) {
    const authorized = request.headers.get('authorization') === `Bearer ${secret}`
    if (!authorized) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Bad cron secret.' } },
        { status: 401 },
      )
    }
  } else if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: { code: 'NOT_CONFIGURED', message: 'CRON_SECRET is not set.' } },
      { status: 503 },
    )
  }

  const result = await sweepStaleJobs()
  return NextResponse.json({ ok: true, ...result })
}
