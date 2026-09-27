'use client'

import Link from 'next/link'
import { Expand, Repeat2, Wand2 } from 'lucide-react'

import { DownloadButton } from '@/components/explore/download-button'
import {
  CategoryChips,
  FavouriteButton,
  StatRow,
  VisibilityBadge,
} from '@/components/explore/engagement'
import { LikeButton } from '@/components/explore/like-button'
import { ShareButton } from '@/components/explore/share-button'
import { GenerationMedia, useHoverPlayback } from '@/components/gallery/generation-media'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { getModel } from '@/lib/ai/registry'
import { authorInitialsOf, authorNameOf, displayTitleOf, type ExploreItem } from '@/lib/explore'
import { usePresetCatalogue } from '@/hooks/use-preset-catalogue'
import { aspectStyle, cn, formatRelativeTime, truncate } from '@/lib/utils'

/**
 * One shot in the public feed.
 *
 * The media opens the detail dialog rather than navigating, because a reader
 * scanning a grid wants to look at one thing and carry on scrolling — a full
 * page load in each direction is the wrong cost for that. The permalink is
 * still there and still the thing Share copies, so nothing about the shot
 * becomes unlinkable.
 *
 * Every control except the media itself is a sibling of that button, not a
 * child. A button nested inside a button is invalid markup and, in practice,
 * the inner one stops firing — which is how a heart becomes a thing that
 * navigates away instead of liking something.
 */
export function ExploreCard({
  item,
  signedIn,
  onOpen,
  onLike,
  onFavourite,
  onDownloadCounted,
}: {
  item: ExploreItem
  signedIn: boolean
  onOpen: (item: ExploreItem) => void
  onLike: (item: ExploreItem) => void
  onFavourite: (item: ExploreItem) => void
  onDownloadCounted: (item: ExploreItem, count: number) => void
}) {
  const { byId } = usePresetCatalogue()
  const { ref, handlers } = useHoverPlayback()

  const preset = item.preset_id ? byId.get(item.preset_id) : undefined
  const model = getModel(item.model_id)
  const label = displayTitleOf(item)
  const author = authorNameOf(item)

  return (
    <figure className="panel group overflow-hidden rounded-xl transition-colors hover:border-muted">
      <div className="relative isolate">
        <button
          type="button"
          onClick={() => onOpen(item)}
          aria-label={`Open ${truncate(label, 80)} by ${author}`}
          className="block w-full"
          {...handlers}
        >
          <div
            className="relative w-full overflow-hidden bg-surface"
            style={aspectStyle(item.aspect_ratio)}
          >
            <GenerationMedia assets={item.assets} alt={label} autoPlay={false} mediaRef={ref} />

            {/* The prompt, on hover. Decorative — the button underneath has to
                stay the pointer target, and the same text is in its label. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-background/95 via-background/50 to-transparent p-3 pb-11 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
              <p className="line-clamp-2 text-xs leading-snug text-foreground">
                {item.prompt.trim() || 'Preset-only shot'}
              </p>
            </div>
          </div>
        </button>

        {/* Top-left: what made it. */}
        <div className="pointer-events-none absolute left-2.5 top-2.5 z-20 flex max-w-[calc(100%-1.25rem)] flex-wrap gap-1.5">
          {preset && (
            <Badge variant="secondary" onMedia className="max-w-[10rem]">
              <Wand2 className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{preset.title}</span>
            </Badge>
          )}
        </div>

        {/*
          Top-right: the visibility badge, for its owner only.
          Everything in this feed is public, so on someone else's card the
          badge would be a label that says nothing.
        */}
        {item.isOwner && (
          <span className="pointer-events-none absolute right-2.5 top-2.5 z-20">
            <VisibilityBadge visibility={item.visibility} onMedia />
          </span>
        )}

        {/*
          The hover rail.

          Revealed by `group-hover` and by `group-focus-within`, so it is
          reachable with a keyboard rather than being mouse-only — these are
          the card's real actions, not a shortcut for people with a pointer.
        */}
        <div
          className={cn(
            'absolute inset-x-0 bottom-0 z-20 flex flex-wrap items-center gap-1.5 p-2.5',
            'opacity-0 transition-opacity duration-200',
            'group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100',
          )}
        >
          <button
            type="button"
            onClick={() => onOpen(item)}
            aria-label={`View ${truncate(label, 60)}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/70 px-2.5 py-1 text-xs text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
          >
            <Expand className="size-3.5" aria-hidden />
            View
          </button>

          <LikeButton
            liked={item.liked}
            count={item.like_count}
            signedIn={signedIn}
            onToggle={() => onLike(item)}
            returnTo="/explore"
          />

          <FavouriteButton
            favourited={item.favourited}
            count={item.favourite_count}
            signedIn={signedIn}
            onToggle={() => onFavourite(item)}
            returnTo="/explore"
          />

          <DownloadButton
            generationId={item.id}
            assets={item.assets}
            label={label}
            count={item.download_count}
            onCounted={(next) => onDownloadCounted(item, next)}
          />

          <ShareButton generationId={item.id} variant="chip" />
        </div>
      </div>

      <figcaption className="space-y-2.5 p-3">
        {/* The title line. A shot with a real title leads with it; one without
            leads with its prompt, which is what it is known by anyway. */}
        <p className="line-clamp-1 text-sm font-medium leading-snug" title={label}>
          {label}
        </p>

        <CategoryChips categories={item.categories} limit={3} />

        <div className="flex items-center gap-2.5">
          <Avatar className="size-6 shrink-0">
            {item.author_avatar_url && <AvatarImage src={item.author_avatar_url} alt="" />}
            <AvatarFallback className="text-[10px]">{authorInitialsOf(item)}</AvatarFallback>
          </Avatar>

          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {author}
          </span>

          <Link
            href={`/create?remix=${item.id}`}
            aria-label={`Remix ${truncate(label, 60)}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <Repeat2 className="size-3.5" aria-hidden />
            Remix
          </Link>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2.5">
          <StatRow
            likes={item.like_count}
            comments={item.comment_count}
            downloads={item.download_count}
          />

          {/* Model and date, the two facts a reader asks about a shot they
              like. Truncated rather than wrapped: this row must stay one line
              so every card in a masonry column ends at the same place. */}
          <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="truncate" title={model?.label ?? item.model_id}>
              {model?.label ?? item.model_id}
            </span>
            <span aria-hidden>·</span>
            <time dateTime={item.created_at} className="shrink-0">
              {formatRelativeTime(item.created_at)}
            </time>
          </span>
        </div>
      </figcaption>
    </figure>
  )
}
