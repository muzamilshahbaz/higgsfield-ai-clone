'use client'

import Link from 'next/link'
import { Repeat2, Wand2 } from 'lucide-react'

import { LikeButton } from '@/components/explore/like-button'
import { GenerationMedia, useHoverPlayback } from '@/components/gallery/generation-media'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { usePresetCatalogue } from '@/hooks/use-preset-catalogue'
import { authorInitialsOf, authorNameOf, type ExploreItem } from '@/lib/explore'
import { aspectStyle, truncate } from '@/lib/utils'

/**
 * One shot in the public feed.
 *
 * The media is a link to the permalink rather than a drawer: a feed item is
 * something you send to someone, and a modal has no URL to send. The like and
 * remix controls sit outside that link, because nesting them inside an anchor
 * is invalid markup and, in practice, a heart that navigates away.
 */
export function ExploreCard({
  item,
  signedIn,
  onLike,
}: {
  item: ExploreItem
  signedIn: boolean
  onLike: (item: ExploreItem) => void
}) {
  const { byId } = usePresetCatalogue()
  const { ref, handlers } = useHoverPlayback()

  const preset = item.preset_id ? byId.get(item.preset_id) : undefined
  const label = item.prompt.trim() || 'Preset-only shot'
  const author = authorNameOf(item)

  return (
    <figure className="group overflow-hidden rounded-xl border border-border bg-card">
      <Link
        href={`/g/${item.id}`}
        aria-label={`Open ${truncate(label, 80)} by ${author}`}
        className="block"
        {...handlers}
      >
        <div
          className="relative isolate w-full overflow-hidden bg-surface"
          style={aspectStyle(item.aspect_ratio)}
        >
          <GenerationMedia assets={item.assets} alt={label} autoPlay={false} mediaRef={ref} />

          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-background/95 via-background/50 to-transparent p-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
            <p className="line-clamp-2 text-xs leading-snug text-foreground">{label}</p>
          </div>

          {preset && (
            <span className="pointer-events-none absolute left-2.5 top-2.5 z-10">
              <Badge variant="secondary" className="max-w-[12rem] backdrop-blur">
                <Wand2 className="size-3 shrink-0" aria-hidden />
                <span className="truncate">{preset.title}</span>
              </Badge>
            </span>
          )}
        </div>
      </Link>

      <figcaption className="flex items-center gap-2.5 p-3">
        <Avatar className="size-6 shrink-0">
          {item.author_avatar_url && <AvatarImage src={item.author_avatar_url} alt="" />}
          <AvatarFallback className="text-[10px]">{authorInitialsOf(item)}</AvatarFallback>
        </Avatar>

        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{author}</span>

        <Link
          href={`/create?remix=${item.id}`}
          aria-label={`Remix ${truncate(label, 60)}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <Repeat2 className="size-3.5" aria-hidden />
          Remix
        </Link>

        <LikeButton
          liked={item.liked}
          count={item.like_count}
          signedIn={signedIn}
          onToggle={() => onLike(item)}
          returnTo="/explore"
        />
      </figcaption>
    </figure>
  )
}
