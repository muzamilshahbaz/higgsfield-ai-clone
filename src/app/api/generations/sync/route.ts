import { NextResponse } from 'next/server'

import { getMyCredits } from '@/services/profile.service'
import { syncMyJobs } from '@/services/generation.service'

/**
 * POST /api/generations/sync — advance the caller's in-flight jobs.
 *
 * Called by the client ticker every few seconds while a job is running, and
 * once when the create or dashboard page mounts. That second call is what
 * heals a job whose tab was closed mid-render: the user comes back, the page
 * sweeps, and the card is finished by the time they look at it.
 *
 * The balance rides along so a refund shows up in the topbar without a
 * separate round trip.
 */
export async function POST() {
  const generations = await syncMyJobs()
  const credits = await getMyCredits()

  return NextResponse.json({ generations, credits })
}
