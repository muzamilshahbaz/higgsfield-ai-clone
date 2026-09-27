'use client'

import * as React from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Info, Sparkles, X } from 'lucide-react'

import type { AnnouncementItem } from '@/lib/cms/content'
import { cn } from '@/lib/utils'

/**
 * The announcement banner.
 *
 * A client component for one reason: dismissal. Everything else about it is server-rendered
 * content, but "I have read this" is per-visitor state and belongs in their browser rather than
 * in a database column somebody has to reset.
 *
 * `sessionStorage`, not `localStorage`. A dismissed maintenance notice should come back on the
 * next visit — the thing it was warning about is probably still true — where a permanently
 * dismissed one is a notice the operator thinks they published and nobody ever sees again.
 *
 * The id is part of the key, so editing an announcement brings it back for people who dismissed
 * the previous version. That is the right default: an edited banner is a new thing to say.
 *
 * Every storage access is wrapped, because `sessionStorage` throws rather than returning null in
 * a private window with site data blocked — and a banner is not worth an error boundary.
 */

const ICONS = {
  info: Info,
  brand: Sparkles,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertTriangle,
} as const

const TONES = {
  info: 'border-border bg-surface/60 text-foreground',
  brand: 'border-primary/40 bg-primary/10 text-foreground',
  success: 'border-success/40 bg-success/10 text-foreground',
  warning: 'border-warning/40 bg-warning/10 text-foreground',
  danger: 'border-destructive/40 bg-destructive/10 text-foreground',
} as const

const ICON_TONES = {
  info: 'text-muted-foreground',
  brand: 'text-brand',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
} as const

export function AnnouncementBanner({ announcement }: { announcement: AnnouncementItem }) {
  const storageKey = `kinetic.announcement.${announcement.id}`

  /*
   * Starts visible and hides on mount if it was dismissed.
   *
   * The reverse — starting hidden and showing after a storage read — would mean the banner is
   * absent from the server-rendered HTML and appears a frame later, pushing the page down as
   * somebody starts reading it. A dismissed banner flashing once is the lesser of the two, and
   * only for the visitor who already dismissed it.
   */
  const [dismissed, setDismissed] = React.useState(false)

  React.useEffect(() => {
    if (!announcement.isDismissible) return
    try {
      if (sessionStorage.getItem(storageKey) === '1') setDismissed(true)
    } catch {
      // Private window, or site data blocked. The banner simply stays visible.
    }
  }, [announcement.isDismissible, storageKey])

  if (dismissed) return null

  const Icon = ICONS[announcement.variant] ?? Info

  function dismiss() {
    setDismissed(true)
    try {
      sessionStorage.setItem(storageKey, '1')
    } catch {
      // Nothing to do: it is hidden for this render either way.
    }
  }

  return (
    <div
      // `status` rather than `alert`: this is information that is already on screen, and `alert`
      // interrupts a screen reader mid-sentence for something nobody needs to act on this second.
      role="status"
      className={cn(
        // Clears the fixed header, which is 56px plus its inset on mobile and 64px on desktop.
        'mx-auto mt-[4.75rem] max-w-7xl px-4 sm:mt-[5.5rem] sm:px-6 lg:px-8',
      )}
    >
      <div
        className={cn(
          'flex flex-wrap items-start gap-3 rounded-xl border px-4 py-3',
          TONES[announcement.variant] ?? TONES.info,
        )}
      >
        <Icon
          className={cn('mt-0.5 size-4 shrink-0', ICON_TONES[announcement.variant] ?? ICON_TONES.info)}
          aria-hidden
        />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{announcement.title}</p>
          {announcement.body && (
            <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
              {announcement.body}
            </p>
          )}
        </div>

        {announcement.href && (
          <Link
            href={announcement.href}
            className="shrink-0 text-sm font-medium text-brand underline-offset-4 hover:underline"
          >
            {announcement.ctaLabel ?? 'Read more'}
          </Link>
        )}

        {announcement.isDismissible && (
          <button
            type="button"
            onClick={dismiss}
            className="-m-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
            <span className="sr-only">Dismiss this announcement</span>
          </button>
        )}
      </div>
    </div>
  )
}
