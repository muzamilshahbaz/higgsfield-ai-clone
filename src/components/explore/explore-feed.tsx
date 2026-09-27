'use client'

import * as React from 'react'
import Link from 'next/link'
import { AlertTriangle, Compass, Loader2, Search, Sparkles } from 'lucide-react'

import { AssetDialog } from '@/components/explore/asset-dialog'
import { ExploreCard } from '@/components/explore/explore-card'
import { ExploreFilters, ExploreSearch } from '@/components/explore/explore-filters'
import { MasonryGrid } from '@/components/gallery/masonry-grid'
import { EmptyState } from '@/components/studio/empty-state'
import { Button } from '@/components/ui/button'
import { useExploreFeed } from '@/hooks/use-explore-feed'
import { getCategory } from '@/lib/categories'
import type { ExploreItem, ExploreSort } from '@/lib/explore'
import { cn } from '@/lib/utils'

/**
 * The public feed.
 *
 * One component for the whole surface — search, categories, sort, grid and the
 * detail dialog — because all five read and write the same piece of state.
 * Splitting them would mean lifting that state into the page and turning a
 * server component into a client one, which is the opposite of what the
 * standalone route is for.
 *
 * The dialog holds an id rather than a row, so a like registered inside it and
 * the same like registered on the card behind it are the same piece of state.
 * Holding the row instead is how a count ends up correct in one place and
 * stale in the other.
 */
export function ExploreFeed({
  initialItems,
  pageSize,
  signedIn,
  initialCategory = 'all',
  initialSort = 'new',
  initialSearch = '',
}: {
  initialItems: ExploreItem[]
  pageSize: number
  signedIn: boolean
  initialCategory?: string
  initialSort?: ExploreSort
  initialSearch?: string
}) {
  const feed = useExploreFeed({
    initial: initialItems,
    pageSize,
    initialCategory,
    initialSort,
    initialSearch,
  })

  const [openId, setOpenId] = React.useState<string | null>(null)

  /**
   * The row the dialog is showing, resolved through the hook.
   *
   * A related shot opened from inside the dialog may not be in the feed at
   * all — a different category, or further down than has been paged in — so
   * opening one adopts it first. Everything after that treats it exactly like
   * a card: one piece of state, so a like registered in the dialog and the
   * same like on the card behind it can never disagree.
   */
  const { adopt, getById, loadMore, hasMore, loading, loadingMore } = feed
  const openItem = getById(openId)

  const open = React.useCallback(
    (item: ExploreItem) => {
      adopt(item)
      setOpenId(item.id)
    },
    [adopt],
  )

  /**
   * Infinite scroll.
   *
   * An observer on a sentinel below the grid, with a generous root margin so
   * the next page is already arriving by the time the reader reaches the
   * bottom. The Load More button stays underneath it rather than being
   * replaced: an observer that never fires — reduced data, a browser that does
   * not support it, a viewport tall enough that the sentinel starts on screen
   * and never re-intersects — would otherwise leave the feed with no way
   * forward at all.
   */
  const sentinelRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const node = sentinelRef.current
    if (!node || !hasMore || loading || loadingMore) return
    if (typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore()
      },
      { rootMargin: '600px 0px' },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, loading, loadingMore, loadMore])

  const empty = feed.items.length === 0
  const activeCategory = getCategory(feed.category)

  return (
    <div className="@container space-y-8">
      <ExploreSearch value={feed.search} onChange={feed.setSearch} loading={feed.loading} />

      <ExploreFilters
        category={feed.category}
        onCategoryChange={feed.setCategory}
        sort={feed.sort}
        onSortChange={feed.setSort}
        resultCount={feed.items.length}
        hasMore={feed.hasMore}
        loading={feed.loading}
      />

      {feed.error ? (
        <EmptyState
          icon={AlertTriangle}
          title="Could not load the feed"
          description={feed.error}
          action={
            <Button variant="outline" onClick={feed.retry}>
              Try again
            </Button>
          }
        />
      ) : empty ? (
        feed.filtered ? (
          <EmptyState
            icon={Search}
            title="Nothing matches that"
            description={
              feed.search.trim()
                ? `No public creation matches “${feed.search.trim()}”. Try a different word, or browse a category.`
                : `Nobody has published anything under ${activeCategory?.label ?? 'this category'} yet. ${activeCategory?.description ?? ''}`
            }
            action={
              <Button variant="outline" onClick={feed.clearFilters}>
                Show everything
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Compass}
            title="Nothing published yet"
            description="Explore fills up as people publish their work. Make something and be the first."
            action={
              <Button asChild>
                <Link href={signedIn ? '/create' : '/sign-up'}>
                  <Sparkles className="size-4" />
                  {signedIn ? 'Make something' : 'Start creating'}
                </Link>
              </Button>
            }
          />
        )
      ) : (
        <MasonryGrid
          density="wide"
          className={cn(feed.loading && 'opacity-60 transition-opacity')}
        >
          {feed.items.map((item) => (
            <ExploreCard
              key={item.id}
              item={item}
              signedIn={signedIn}
              onOpen={open}
              onLike={feed.like}
              onFavourite={feed.favourite}
              onDownloadCounted={feed.noteDownload}
            />
          ))}
        </MasonryGrid>
      )}

      {feed.hasMore && !empty && (
        <>
          <div ref={sentinelRef} aria-hidden className="h-px w-full" />

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
        </>
      )}

      <AssetDialog
        item={openItem}
        open={openId !== null}
        onOpenChange={(next) => {
          if (!next) setOpenId(null)
        }}
        signedIn={signedIn}
        onLike={feed.like}
        onFavourite={feed.favourite}
        onDownloadCounted={feed.noteDownload}
        onCommentCountChange={feed.noteComments}
        onSelectRelated={open}
      />
    </div>
  )
}
