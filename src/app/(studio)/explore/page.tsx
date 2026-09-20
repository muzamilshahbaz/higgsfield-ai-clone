import type { Metadata } from 'next'

import { ExploreFeed } from '@/components/explore/explore-feed'
import { getCurrentUser } from '@/lib/supabase/server'
import { listPublicGenerations } from '@/services/explore.service'

export const metadata: Metadata = {
  title: 'Explore',
  description: 'What the community is making. Remix anything.',
}

const PAGE_SIZE = 24

/**
 * The public feed.
 *
 * Reachable signed-out on purpose — `middleware.ts` leaves `/explore` out of
 * its protected prefixes, and the studio shell already renders without a
 * profile. It is the one surface a stranger can see before deciding to sign
 * up, so it has to work for them.
 */
export default async function ExplorePage() {
  const [user, items] = await Promise.all([
    getCurrentUser(),
    listPublicGenerations({ limit: PAGE_SIZE }),
  ])

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Explore</h1>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          What the community is making. Like what lands, and hit remix to open any of it in
          your own composer — same preset, same settings, your subject.
        </p>
      </div>

      <ExploreFeed initialItems={items} pageSize={PAGE_SIZE} signedIn={Boolean(user)} />
    </div>
  )
}
