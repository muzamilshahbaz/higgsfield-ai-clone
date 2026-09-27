'use client'

import * as React from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Repeat2 } from 'lucide-react'

import { toggleFavouriteAction, toggleLikeAction } from '@/app/(studio)/explore/actions'
import { CommentThread } from '@/components/explore/comment-thread'
import { DownloadButton } from '@/components/explore/download-button'
import { FavouriteButton } from '@/components/explore/engagement'
import { LikeButton } from '@/components/explore/like-button'
import { ShareButton } from '@/components/explore/share-button'
import { Button } from '@/components/ui/button'
import type { AssetRow } from '@/types/database'

/**
 * The interactive half of a shared shot.
 *
 * Its own client island so the permalink itself stays a Server Component —
 * the page is the thing that has to render fast for a stranger arriving from
 * a link, and these controls plus the comment thread are the only parts that
 * need to be live.
 *
 * Counts are held here rather than read from props on every render, because
 * every one of them can move without the page reloading: a like from this
 * viewer, a download from this viewer, a comment posted below.
 */
export function PermalinkActions({
  generationId,
  label,
  assets,
  initialLiked,
  initialLikeCount,
  initialFavourited,
  initialFavouriteCount,
  initialDownloadCount,
  signedIn,
}: {
  generationId: string
  label: string
  assets: AssetRow[]
  initialLiked: boolean
  initialLikeCount: number
  initialFavourited: boolean
  initialFavouriteCount: number
  initialDownloadCount: number
  signedIn: boolean
}) {
  const [liked, setLiked] = React.useState(initialLiked)
  const [likeCount, setLikeCount] = React.useState(initialLikeCount)
  const [favourited, setFavourited] = React.useState(initialFavourited)
  const [favouriteCount, setFavouriteCount] = React.useState(initialFavouriteCount)
  const [downloadCount, setDownloadCount] = React.useState(initialDownloadCount)

  const pendingRef = React.useRef(new Set<string>())
  const returnTo = `/g/${generationId}`

  /**
   * One optimistic toggle, used twice.
   *
   * Written once for the same reason the feed hook writes it once: the second
   * copy is the one that ends up without the rollback.
   */
  function toggle(
    key: string,
    apply: (next: boolean, count: number) => void,
    wasOn: boolean,
    wasCount: number,
    run: () => Promise<{ ok: true; on: boolean; count: number } | { ok: false; error: string }>,
  ) {
    if (pendingRef.current.has(key)) return
    pendingRef.current.add(key)

    apply(!wasOn, Math.max(0, wasCount + (wasOn ? -1 : 1)))

    void (async () => {
      try {
        const result = await run()

        if (!result.ok) {
          apply(wasOn, wasCount)
          toast.error(result.error)
          return
        }

        // The server's count, not ours: other people were clicking too.
        apply(result.on, result.count)
      } catch {
        apply(wasOn, wasCount)
        toast.error('Could not reach the server. Check your connection.')
      } finally {
        pendingRef.current.delete(key)
      }
    })()
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild>
          <Link href={`/create?remix=${generationId}`}>
            <Repeat2 className="size-4" />
            Remix this
          </Link>
        </Button>

        <LikeButton
          liked={liked}
          count={likeCount}
          signedIn={signedIn}
          size="lg"
          returnTo={returnTo}
          className="h-10"
          onToggle={() =>
            toggle(
              'like',
              (next, count) => {
                setLiked(next)
                setLikeCount(count)
              },
              liked,
              likeCount,
              async () => {
                const result = await toggleLikeAction(generationId)
                return result.ok
                  ? { ok: true as const, on: result.data.liked, count: result.data.likeCount }
                  : result
              },
            )
          }
        />

        <FavouriteButton
          favourited={favourited}
          count={favouriteCount}
          signedIn={signedIn}
          size="lg"
          returnTo={returnTo}
          className="h-10"
          onToggle={() =>
            toggle(
              'favourite',
              (next, count) => {
                setFavourited(next)
                setFavouriteCount(count)
              },
              favourited,
              favouriteCount,
              async () => {
                const result = await toggleFavouriteAction(generationId)
                return result.ok
                  ? {
                      ok: true as const,
                      on: result.data.favourited,
                      count: result.data.favouriteCount,
                    }
                  : result
              },
            )
          }
        />

        <DownloadButton
          generationId={generationId}
          assets={assets}
          label={label}
          count={downloadCount}
          onCounted={setDownloadCount}
          variant="button"
          className="h-10"
        />

        <ShareButton generationId={generationId} title={label} />
      </div>

      <div className="border-t border-border/60 pt-6">
        <CommentThread generationId={generationId} signedIn={signedIn} returnTo={returnTo} />
      </div>
    </>
  )
}
