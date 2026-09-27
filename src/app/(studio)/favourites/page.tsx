import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { FavouritesGrid } from '@/components/favourites/favourites-grid'
import { PageHeader } from '@/components/studio/page-header'
import { getCurrentUser } from '@/lib/supabase/server'
import { listMyFavourites } from '@/services/explore.service'

export const metadata: Metadata = {
  title: 'Favourites',
  description: 'Everything you have saved from Explore.',
}

const PAGE_SIZE = 24

/**
 * The saved list.
 *
 * Unlike Explore this one requires an account, and says so by redirecting
 * rather than rendering an empty grid — a favourites page that looks identical
 * whether you are signed out or have saved nothing is a page that tells you
 * nothing.
 *
 * `middleware.ts` guards the route already; this is the belt-and-braces case
 * where the session expires between that check and this render.
 */
export default async function FavouritesPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in?next=/favourites')

  const items = await listMyFavourites({ limit: PAGE_SIZE })

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        eyebrow="Community"
        title="Favourites"
        description="Everything you have starred in Explore, newest first. Only you can see this list — a favourite is a private bookmark, not a public signal."
      />

      <FavouritesGrid initialItems={items} pageSize={PAGE_SIZE} />
    </div>
  )
}
