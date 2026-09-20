'use client'

import Link from 'next/link'

import { LikeButton } from '@/components/explore/like-button'
import { GenerationMedia, useHoverPlayback } from '@/components/gallery/generation-media'
import { useExploreFeed } from '@/hooks/use-explore-feed'
import type { ExploreItem } from '@/lib/explore'
import { authorNameOf } from '@/lib/explore'
import { aspectStyle, truncate } from '@/lib/utils'

/**
 * "More from Explore" under a shared shot.
 *
 * Reuses the feed hook purely for its like handling — paging is off here, so
 * the strip is a fixed row the page already loaded rather than a second
 * infinite feed competing with the one this page links to.
 */
export function PermalinkStrip({
  items,
  signedIn,
}: {
  items: ExploreItem[]
  signedIn: boolean
}) {
  // `pageSize` above the row length, so `hasMore` is false and nothing here
  // ever asks the server for another page.
  const feed = useExploreFeed({ initial: items, pageSize: items.length + 1 })

  if (feed.items.length === 0) return null

  return (
    <section className="mt-14">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">More from Explore</h2>
        <Link
          href="/explore"
          className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          See everything
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {feed.items.map((item) => (
          <StripCard key={item.id} item={item} signedIn={signedIn} onLike={feed.like} />
        ))}
      </div>
    </section>
  )
}

function StripCard({
  item,
  signedIn,
  onLike,
}: {
  item: ExploreItem
  signedIn: boolean
  onLike: (item: ExploreItem) => void
}) {
  const { ref, handlers } = useHoverPlayback()
  const label = item.prompt.trim() || 'Preset-only shot'

  return (
    <figure className="group overflow-hidden rounded-xl border border-border bg-card">
      <Link
        href={`/g/${item.id}`}
        aria-label={`Open ${truncate(label, 60)} by ${authorNameOf(item)}`}
        className="block"
        {...handlers}
      >
        <div
          className="relative w-full overflow-hidden bg-surface"
          style={aspectStyle(item.aspect_ratio)}
        >
          <GenerationMedia assets={item.assets} alt={label} autoPlay={false} mediaRef={ref} />
        </div>
      </Link>

      <figcaption className="flex items-center gap-2 p-2.5">
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {authorNameOf(item)}
        </span>
        <LikeButton
          liked={item.liked}
          count={item.like_count}
          signedIn={signedIn}
          onToggle={() => onLike(item)}
          returnTo={`/g/${item.id}`}
        />
      </figcaption>
    </figure>
  )
}
