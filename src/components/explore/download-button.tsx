'use client'

import * as React from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Download, Loader2 } from 'lucide-react'

import { registerDownloadAction } from '@/app/(studio)/explore/actions'
import { downloadMedia, filenameFor } from '@/lib/download'
import { cn } from '@/lib/utils'
import type { AssetRow } from '@/types/database'

/**
 * Saves a public shot and counts that it happened.
 *
 * The order matters. The file is fetched and handed to the browser first, and
 * only then is the server told — so a counter that fails to move never costs
 * the reader their download, and a download that the browser refuses is never
 * counted as one that worked.
 *
 * There is deliberately no `signedIn` prop. Signed-out visitors can download:
 * the feed is public, the file is public,
 * and gating a save behind an account on a page built to be shared with
 * strangers would be a dark pattern rather than a security measure. The
 * `register_download()` function refuses anything that is not published, which
 * is the part that actually matters.
 */
export function DownloadButton({
  generationId,
  assets,
  label,
  count,
  onCounted,
  variant = 'chip',
  className,
}: {
  generationId: string
  assets: AssetRow[]
  /** Used to name the saved file. */
  label: string
  count: number
  /** Lets the feed show the new total without refetching the row. */
  onCounted?: (next: number) => void
  variant?: 'chip' | 'button'
  className?: string
}) {
  const [busy, setBusy] = React.useState(false)

  // The poster is a thumbnail of a clip, never the thing someone means to
  // save, so it is the last resort rather than the first match.
  const media =
    assets.find((asset) => asset.kind === 'video') ??
    assets.find((asset) => asset.kind === 'image') ??
    assets[0]

  const shell =
    variant === 'button'
      ? cn(
          'inline-flex items-center gap-2 rounded-lg border border-border bg-surface/60 px-3.5 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground',
          className,
        )
      : cn(
          'inline-flex items-center gap-1.5 rounded-full border border-border bg-background/70 px-2.5 py-1 text-xs tabular-nums text-muted-foreground backdrop-blur transition-colors hover:text-foreground',
          className,
        )

  // Nothing to save. Rendered as a disabled control rather than hidden, so the
  // action row does not change shape between one card and the next.
  if (!media) {
    return (
      <span className={cn(shell, 'cursor-not-allowed opacity-40')} aria-disabled>
        <Download className="size-3.5" aria-hidden />
        <span className="sr-only">No file to download</span>
        {variant === 'button' && 'Download'}
      </span>
    )
  }

  async function save() {
    if (busy || !media) return
    setBusy(true)

    try {
      const saved = await downloadMedia(media.url, filenameFor(media.url, label))

      if (saved) toast.success('Saved to your downloads')
      else {
        toast.message('Opened in a new tab', {
          description: 'Your browser blocked the download.',
        })
      }

      // Counted whichever way it went: the file reached the reader either way,
      // which is what the number is about.
      const result = await registerDownloadAction(generationId)
      if (result.ok) onCounted?.(result.data.downloadCount)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void save()}
      disabled={busy}
      aria-label={`Download — ${count} ${count === 1 ? 'download' : 'downloads'} so far`}
      className={cn(shell, busy && 'opacity-60')}
    >
      {busy ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <Download className="size-3.5" aria-hidden />
      )}
      {variant === 'button' ? 'Download' : count}
    </button>
  )
}

/**
 * The sign-in nudge used where a download is genuinely gated.
 *
 * Not used by Explore — kept beside the button so that if a surface ever does
 * need to gate one, it gates it the same way likes and favourites do rather
 * than inventing a third pattern.
 */
export function DownloadSignInLink({
  returnTo,
  className,
}: {
  returnTo: string
  className?: string
}) {
  return (
    <Link
      href={`/sign-in?next=${encodeURIComponent(returnTo)}`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-border bg-background/70 px-2.5 py-1 text-xs text-muted-foreground backdrop-blur transition-colors hover:text-foreground',
        className,
      )}
    >
      <Download className="size-3.5" aria-hidden />
      Sign in to download
    </Link>
  )
}
