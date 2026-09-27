import type { Metadata } from 'next'

import { ExploreFeed } from '@/components/explore/explore-feed'
import { PageHeader } from '@/components/studio/page-header'
import { getCategory, isExploreCategory } from '@/lib/categories'
import { isExploreSort } from '@/lib/explore'
import { getCurrentUser } from '@/lib/supabase/server'
import { listPublicGenerations } from '@/services/explore.service'

export const metadata: Metadata = {
  title: 'Explore',
  description: 'What the community is making. Like it, save it, remix it.',
}

const PAGE_SIZE = 24

/**
 * The public feed.
 *
 * Reachable signed-out on purpose — `middleware.ts` leaves `/explore` out of
 * its protected prefixes, and the studio shell already renders without a
 * profile. It is the one surface a stranger can see before deciding to sign
 * up, so it has to work for them.
 *
 * The filters are read from the URL rather than starting at their defaults, so
 * a category chip on a card produces a link that actually opens that category,
 * and a filtered feed is something you can send to someone. Everything is
 * validated against a known set — a hand-edited parameter falls back to the
 * default rather than erroring, because the worst outcome for a shared link is
 * a page that does not load.
 */
export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; sort?: string; q?: string }>
}) {
  const params = await searchParams

  const category = isExploreCategory(params.category) ? params.category! : 'all'
  const sort = isExploreSort(params.sort) ? params.sort : 'new'
  const search = typeof params.q === 'string' ? params.q.slice(0, 80) : ''

  const [user, items] = await Promise.all([
    getCurrentUser(),
    listPublicGenerations({ limit: PAGE_SIZE, category, sort, search }),
  ])

  const active = getCategory(category)

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        eyebrow="Community"
        title="Explore"
        description={
          active && active.slug !== 'all'
            ? `${active.description} Like what lands, save it to your favourites, or hit remix to open it in your own composer.`
            : 'What the community is making. Like what lands, save it to your favourites, and hit remix to open any of it in your own composer — same preset, same settings, your subject.'
        }
      />

      <ExploreFeed
        initialItems={items}
        pageSize={PAGE_SIZE}
        signedIn={Boolean(user)}
        initialCategory={category}
        initialSort={sort}
        initialSearch={search}
      />
    </div>
  )
}
