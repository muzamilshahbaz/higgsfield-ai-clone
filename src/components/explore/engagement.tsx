'use client'

import Link from 'next/link'
import { Download, Globe2, Heart, Lock, MessageCircle, Star } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { TAG_LABELS } from '@/lib/categories'
import { cn } from '@/lib/utils'
import type { ExploreCategorySlug, GenerationVisibility } from '@/types/database'

/**
 * The small shared pieces of the social layer.
 *
 * All four appear on the card, in the detail dialog and on the permalink. They
 * live together because they share one rule that is easy to break separately:
 * a count is only ever rendered as `1 like`, never `1 likes`, and a control
 * that a signed-out visitor cannot use becomes a link to sign in rather than a
 * button that fails.
 */

/** A count with its icon — read-only, for places that only report. */
export function StatPill({
  icon: Icon,
  count,
  label,
  className,
}: {
  icon: typeof Heart
  count: number
  /** Singular noun: "like", "comment", "download". Pluralised here. */
  label: string
  className?: string
}) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 tabular-nums', className)}
      title={`${count.toLocaleString()} ${count === 1 ? label : `${label}s`}`}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span>{compact(count)}</span>
      <span className="sr-only">{count === 1 ? label : `${label}s`}</span>
    </span>
  )
}

/** The three public counts a card reports, in one row. */
export function StatRow({
  likes,
  comments,
  downloads,
  className,
}: {
  likes: number
  comments: number
  downloads: number
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-3 text-xs text-muted-foreground', className)}>
      <StatPill icon={Heart} count={likes} label="like" />
      <StatPill icon={MessageCircle} count={comments} label="comment" />
      <StatPill icon={Download} count={downloads} label="download" />
    </div>
  )
}

/**
 * Counts above four figures, shortened.
 *
 * A card has room for `1.2k` and not for `1,248`, and the exact number is on
 * the title attribute and in the sr-only text for anyone who wants it.
 */
function compact(value: number): string {
  if (value < 1000) return String(value)
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`
  return `${(value / 1_000_000).toFixed(1)}m`
}

/**
 * Whether a shot is published — shown to its owner and to nobody else.
 *
 * Everything in Explore is public by definition, so a "Public" badge on
 * somebody else's card says nothing. On your own it is the confirmation that
 * the thing you are looking at in a public feed really is the one you meant to
 * publish, which is worth the pixels.
 */
export function VisibilityBadge({
  visibility,
  className,
  onMedia = false,
}: {
  visibility: GenerationVisibility
  className?: string
  onMedia?: boolean
}) {
  const isPublic = visibility === 'public'

  return (
    <Badge
      variant={isPublic ? 'default' : 'secondary'}
      onMedia={onMedia}
      className={className}
    >
      {isPublic ? (
        <Globe2 className="size-3 shrink-0" aria-hidden />
      ) : (
        <Lock className="size-3 shrink-0" aria-hidden />
      )}
      {isPublic ? 'Public' : 'Private'}
    </Badge>
  )
}

/**
 * A shot's category tags, each one a link into that category of the feed.
 *
 * Links rather than buttons because they navigate, which means they open in a
 * new tab on a middle click and can be copied — the things a reader expects of
 * something that takes them somewhere.
 */
export function CategoryChips({
  categories,
  className,
  limit,
}: {
  categories: readonly ExploreCategorySlug[]
  className?: string
  /** Caps what is rendered, with a "+n" for the rest. */
  limit?: number
}) {
  if (categories.length === 0) return null

  const shown = limit ? categories.slice(0, limit) : categories
  const hidden = categories.length - shown.length

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {shown.map((slug) => (
        <Link
          key={slug}
          href={`/explore?category=${slug}`}
          className="rounded-md border border-border bg-surface-2/60 px-1.5 py-0.5 text-[11px] leading-4 text-muted-foreground transition-colors hover:border-muted hover:text-foreground"
        >
          {TAG_LABELS[slug]}
        </Link>
      ))}

      {hidden > 0 && (
        <span className="text-[11px] leading-4 text-muted-foreground">+{hidden}</span>
      )}
    </div>
  )
}

/**
 * The favourite control.
 *
 * Signed out it becomes a link to sign-in carrying a `next`, exactly as
 * `LikeButton` does — the only honest options are "let them do it" or "tell
 * them how", and a dead star is neither.
 */
export function FavouriteButton({
  favourited,
  count,
  signedIn,
  onToggle,
  size = 'sm',
  returnTo = '/explore',
  showCount = true,
  className,
}: {
  favourited: boolean
  count: number
  signedIn: boolean
  onToggle: () => void
  size?: 'sm' | 'lg'
  returnTo?: string
  showCount?: boolean
  className?: string
}) {
  const shell = cn(
    'inline-flex items-center gap-1.5 rounded-full border transition-colors tabular-nums',
    size === 'lg' ? 'px-3.5 py-2 text-sm' : 'px-2.5 py-1 text-xs',
    // Coral, not cyan: a favourite marks something, it does not submit
    // anything, and cyan is reserved for the action a surface wants next.
    favourited
      ? 'border-accent/40 bg-accent/10 text-accent'
      : 'border-border bg-background/70 text-muted-foreground backdrop-blur hover:text-foreground',
    className,
  )

  const plural = count === 1 ? 'favourite' : 'favourites'

  const icon = (
    <Star
      className={cn(size === 'lg' ? 'size-4' : 'size-3.5', favourited && 'fill-current')}
      aria-hidden
    />
  )

  if (!signedIn) {
    return (
      <Link
        href={`/sign-in?next=${encodeURIComponent(returnTo)}`}
        className={shell}
        aria-label={`Sign in to save this — ${count} ${plural} so far`}
      >
        {icon}
        {showCount && compact(count)}
      </Link>
    )
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={favourited}
      aria-label={
        favourited ? `Remove from favourites — ${count} ${plural}` : `Save to favourites — ${count} ${plural}`
      }
      className={shell}
    >
      {icon}
      {showCount && compact(count)}
    </button>
  )
}
