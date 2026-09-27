import type { Metadata } from 'next'

import { ExploreFeed } from '@/components/explore/explore-feed'
import { SiteFooter } from '@/components/marketing/site-footer'
import { SiteHeader } from '@/components/marketing/site-header'
import { getCategory, isExploreCategory } from '@/lib/categories'
import { isExploreSort } from '@/lib/explore'
import { getCurrentUser } from '@/lib/supabase/server'
import { listPublicGenerations } from '@/services/explore.service'
import { getMyProfile } from '@/services/profile.service'

const PAGE_SIZE = 24

/**
 * Explore — the public discovery surface.
 *
 * Deliberately outside the `(studio)` route group. It used to live inside it
 * and wore the workspace shell: a 272px sidebar, a credit pill, a topbar built
 * for someone who is working. That framing was wrong twice over — it made a
 * public gallery look like a private tool, and it meant a signed-out visitor
 * met a dashboard chrome with nothing in it.
 *
 * So it wears the marketing chrome instead, the same header and footer as `/`
 * and `/g/[id]`, and it takes the full width. One route, reachable from the
 * landing nav and from the studio sidebar; there is no second implementation.
 *
 * `middleware.ts` leaves `/explore` out of its protected prefixes, so a
 * stranger can browse, search and filter without an account. What they cannot
 * do is like, favourite or comment — each of those controls becomes a link to
 * sign-in rather than a button that fails.
 */

export const metadata: Metadata = {
  title: 'Explore AI creations',
  description:
    'Discover public images and video shared by the Kinetic Studio community. Browse by category, search by prompt, creator or model, and remix anything.',
  openGraph: {
    title: 'Explore AI creations · Kinetic Studio',
    description: 'Discover public creations shared by the community.',
    type: 'website',
  },
}

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; sort?: string; q?: string }>
}) {
  const params = await searchParams

  // Every parameter is validated against a known set rather than passed
  // through. A hand-edited value falls back to the default instead of
  // erroring — the worst outcome for a shared link is a page that will not
  // load.
  const category = isExploreCategory(params.category) ? params.category! : 'all'
  const sort = isExploreSort(params.sort) ? params.sort : 'new'
  const search = typeof params.q === 'string' ? params.q.slice(0, 80) : ''

  const [user, profile, items] = await Promise.all([
    getCurrentUser(),
    getMyProfile(),
    listPublicGenerations({ limit: PAGE_SIZE, category, sort, search }),
  ])

  const active = getCategory(category)
  const narrowed = active && active.slug !== 'all'

  return (
    <div className="relative min-h-dvh">
      <SiteHeader isSignedIn={Boolean(user)} profile={profile} />

      <main className="pb-24 pt-28 sm:pt-32">
        {/*
          The hero. A light wash over a blueprint grid, faded out before it
          reaches the type — the same two textures the landing page opens with,
          so arriving here from the nav does not feel like leaving the product.
        */}
        <section className="relative overflow-hidden border-b border-border/60">
          <div className="light-wash pointer-events-none absolute inset-0" aria-hidden />
          <div
            className="blueprint blueprint-fade pointer-events-none absolute inset-0 opacity-50"
            aria-hidden
          />

          <div className="relative mx-auto max-w-3xl px-4 pb-12 pt-10 text-center sm:px-6 sm:pb-14 sm:pt-14">
            <p className="eyebrow text-muted-foreground">Community</p>

            <h1 className="mt-4 text-balance text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
              Explore AI creations
            </h1>

            <p className="mx-auto mt-4 max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
              {narrowed
                ? active.description
                : 'Discover public creations shared by the community. Like what lands, save it to your favourites, and remix anything — the prompt, the preset and the settings come with it.'}
            </p>
          </div>
        </section>

        {/*
          Full width, with a ceiling. Edge-to-edge on a 32" monitor gives five
          columns of very wide cards and a line of metadata a metre long;
          `max-w-[120rem]` keeps the grid dense without letting it sprawl.
        */}
        <div className="mx-auto w-full max-w-[120rem] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
          <ExploreFeed
            initialItems={items}
            pageSize={PAGE_SIZE}
            signedIn={Boolean(user)}
            initialCategory={category}
            initialSort={sort}
            initialSearch={search}
          />
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
