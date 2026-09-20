'use client'

import Link from 'next/link'
import { AlertTriangle, Compass, Loader2, Sparkles } from 'lucide-react'

import { Segmented, type SegmentedOption } from '@/components/composer/segmented'
import { ExploreCard } from '@/components/explore/explore-card'
import { MasonryGrid } from '@/components/gallery/masonry-grid'
import { EmptyState } from '@/components/studio/empty-state'
import { Button } from '@/components/ui/button'
import { useExploreFeed } from '@/hooks/use-explore-feed'
import { EXPLORE_SORTS, EXPLORE_SORT_LABELS, type ExploreItem, type ExploreSort } from '@/lib/explore'
import { cn } from '@/lib/utils'

/**
 * The public feed.
 *
 * Same masonry as the library, because published work has the same five aspect
 * ratios and there is no reason for two grids. What differs is what a card
 * does: this one links out to a shareable permalink instead of opening a
 * drawer.
 */

const SORT_OPTIONS: SegmentedOption<ExploreSort>[] = EXPLORE_SORTS.map((value) => ({
  value,
  label: EXPLORE_SORT_LABELS[value],
}))

export function ExploreFeed({
  initialItems,
  pageSize,
  signedIn,
}: {
  initialItems: ExploreItem[]
  pageSize: number
  signedIn: boolean
}) {
  const feed = useExploreFeed({ initial: initialItems, pageSize })
  const empty = feed.items.length === 0

  return (
    <div className="@container space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          name="Sort the feed"
          size="sm"
          value={feed.sort}
          options={SORT_OPTIONS}
          onChange={feed.setSort}
        />

        <p role="status" className="text-xs text-muted-foreground">
          {feed.loading ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="size-3 animate-spin" aria-hidden />
              Loading…
            </span>
          ) : (
            <>
              {feed.items.length}
              {feed.hasMore ? '+' : ''} {feed.items.length === 1 ? 'shot' : 'shots'}
            </>
          )}
        </p>
      </div>

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
      ) : (
        <MasonryGrid className={cn(feed.loading && 'opacity-60 transition-opacity')}>
          {feed.items.map((item) => (
            <ExploreCard key={item.id} item={item} signedIn={signedIn} onLike={feed.like} />
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
    </div>
  )
}
