'use client'

import * as React from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { AlertTriangle, Compass, Loader2, Star } from 'lucide-react'

import { toggleFavouriteAction } from '@/app/explore/actions'
import { AssetDialog } from '@/components/explore/asset-dialog'
import { ExploreCard } from '@/components/explore/explore-card'
import { MasonryGrid } from '@/components/gallery/masonry-grid'
import { EmptyState } from '@/components/studio/empty-state'
import { Button } from '@/components/ui/button'
import { useExploreFeed } from '@/hooks/use-explore-feed'
import type { ExploreItem } from '@/lib/explore'
import { cn } from '@/lib/utils'

/**
 * Everything the signed-in user has saved.
 *
 * The same hook and the same card as Explore, pointed at `/api/favourites`.
 * That endpoint returns the identical shape, which is what makes the reuse
 * honest rather than a coincidence — a favourite is a public shot, and the
 * things you can do to one here are the things you can do to one there.
 *
 * What differs is what un-favouriting means. On Explore it is a state change
 * on a card that stays put; here it removes the card, because the list *is*
 * the set of favourites and leaving an unsaved shot in it would be a lie about
 * what the page shows.
 */
export function FavouritesGrid({
  initialItems,
  pageSize,
}: {
  initialItems: ExploreItem[]
  pageSize: number
}) {
  const feed = useExploreFeed({
    initial: initialItems,
    pageSize,
    endpoint: '/api/favourites',
    // The feed's category rail and search box query `/api/explore`; neither
    // parameter means anything to a list of one person's saved rows.
    serverFiltering: false,
  })

  const [openId, setOpenId] = React.useState<string | null>(null)

  const { adopt, getById, remove, insert, indexOf, favourite } = feed
  const openItem = getById(openId)

  const open = React.useCallback(
    (item: ExploreItem) => {
      adopt(item)
      setOpenId(item.id)
    },
    [adopt],
  )

  /**
   * Un-favouriting, with the card leaving.
   *
   * The row is dropped immediately and put back if the write fails, which is
   * the same optimistic contract the hook applies to the counter — the two
   * have to agree, or a failed unsave leaves a card missing from a list that
   * still counts it.
   */
  const unsave = React.useCallback(
    (item: ExploreItem) => {
      // Re-saving something un-saved a moment ago: the card has not been
      // refetched, so it is still on screen with an empty star. That is an
      // ordinary toggle, and the hook already knows how to do one.
      if (!item.favourited) {
        favourite(item)
        return
      }

      const index = indexOf(item.id)
      remove(item.id)
      if (openId === item.id) setOpenId(null)

      void (async () => {
        const result = await toggleFavouriteAction(item.id)

        if (!result.ok) {
          // Back exactly where it was, not appended: this list is ordered by
          // when things were saved, and a failed removal has not changed that.
          insert(item, index)
          toast.error(result.error)
          return
        }

        toast.success('Removed from favourites')
      })()
    },
    [favourite, remove, insert, indexOf, openId],
  )

  const empty = feed.items.length === 0

  return (
    <div className="@container space-y-5">
      <p role="status" className="text-xs text-muted-foreground">
        {feed.loading ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="size-3 animate-spin" aria-hidden />
            Loading…
          </span>
        ) : (
          <>
            {feed.items.length}
            {feed.hasMore ? '+' : ''} saved {feed.items.length === 1 ? 'shot' : 'shots'}
          </>
        )}
      </p>

      {feed.error ? (
        <EmptyState
          icon={AlertTriangle}
          title="Could not load your favourites"
          description={feed.error}
          action={
            <Button variant="outline" onClick={feed.retry}>
              Try again
            </Button>
          }
        />
      ) : empty ? (
        <EmptyState
          icon={Star}
          title="Nothing saved yet"
          description="Tap the star on anything in Explore and it lands here — your own shortlist, visible only to you."
          action={
            <Button asChild>
              <Link href="/explore">
                <Compass className="size-4" />
                Browse Explore
              </Link>
            </Button>
          }
        />
      ) : (
        <MasonryGrid className={cn(feed.loading && 'opacity-60 transition-opacity')}>
          {feed.items.map((item) => (
            <ExploreCard
              key={item.id}
              item={item}
              signedIn
              onOpen={open}
              onLike={feed.like}
              onFavourite={unsave}
              onDownloadCounted={feed.noteDownload}
            />
          ))}
        </MasonryGrid>
      )}

      {feed.hasMore && !empty && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={feed.loadMore} disabled={feed.loadingMore}>
            {feed.loadingMore ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Loading…
              </>
            ) : (
              'Load more'
            )}
          </Button>
        </div>
      )}

      <AssetDialog
        item={openItem}
        open={openId !== null}
        onOpenChange={(next) => {
          if (!next) setOpenId(null)
        }}
        signedIn
        onLike={feed.like}
        onFavourite={unsave}
        onDownloadCounted={feed.noteDownload}
        onCommentCountChange={feed.noteComments}
        onSelectRelated={open}
      />
    </div>
  )
}
