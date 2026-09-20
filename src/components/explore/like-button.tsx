'use client'

import Link from 'next/link'
import { Heart } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * The like control, shared by the feed and the permalink.
 *
 * Signed out it becomes a link to sign-in carrying a `next`, rather than a
 * button that fails: the only honest options are "let them do it" or "tell
 * them how", and a dead heart is neither.
 */
export function LikeButton({
  liked,
  count,
  signedIn,
  onToggle,
  size = 'sm',
  returnTo = '/explore',
  className,
}: {
  liked: boolean
  count: number
  signedIn: boolean
  onToggle: () => void
  size?: 'sm' | 'lg'
  returnTo?: string
  className?: string
}) {
  const shell = cn(
    'inline-flex items-center gap-1.5 rounded-full border transition-colors tabular-nums',
    size === 'lg' ? 'px-3.5 py-2 text-sm' : 'px-2.5 py-1 text-xs',
    liked
      ? 'border-destructive/40 bg-destructive/10 text-danger'
      : 'border-border bg-background/70 text-muted-foreground backdrop-blur hover:text-foreground',
    className,
  )

  const plural = count === 1 ? 'like' : 'likes'

  const icon = (
    <Heart
      className={cn(size === 'lg' ? 'size-4' : 'size-3.5', liked && 'fill-current')}
      aria-hidden
    />
  )

  if (!signedIn) {
    return (
      <Link
        href={`/sign-in?next=${encodeURIComponent(returnTo)}`}
        className={shell}
        aria-label={`Sign in to like this — ${count} ${plural} so far`}
      >
        {icon}
        {count}
      </Link>
    )
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={liked}
      aria-label={liked ? `Unlike — ${count} ${plural}` : `Like — ${count} ${plural}`}
      className={shell}
    >
      {icon}
      {count}
    </button>
  )
}
