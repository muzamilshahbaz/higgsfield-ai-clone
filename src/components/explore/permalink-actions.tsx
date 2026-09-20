'use client'

import * as React from 'react'
import Link from 'next/link'
import { Repeat2 } from 'lucide-react'

import { LikeButton } from '@/components/explore/like-button'
import { ShareButton } from '@/components/explore/share-button'
import { Button } from '@/components/ui/button'
import { toggleLikeAction } from '@/app/(studio)/explore/actions'
import { toast } from 'sonner'

/**
 * The action row on a shared shot.
 *
 * Its own client island so the permalink itself stays a Server Component —
 * the page is the thing that has to render fast for a stranger arriving from
 * a link, and the only interactive parts are these three controls.
 */
export function PermalinkActions({
  generationId,
  initialLiked,
  initialCount,
  signedIn,
}: {
  generationId: string
  initialLiked: boolean
  initialCount: number
  signedIn: boolean
}) {
  const [liked, setLiked] = React.useState(initialLiked)
  const [count, setCount] = React.useState(initialCount)
  const pendingRef = React.useRef(false)

  function like() {
    if (pendingRef.current) return
    pendingRef.current = true

    const previous = { liked, count }
    setLiked(!liked)
    setCount(Math.max(0, count + (liked ? -1 : 1)))

    void (async () => {
      try {
        const result = await toggleLikeAction(generationId)

        if (!result.ok) {
          setLiked(previous.liked)
          setCount(previous.count)
          toast.error(result.error)
          return
        }

        setLiked(result.data.liked)
        setCount(result.data.likeCount)
      } catch {
        setLiked(previous.liked)
        setCount(previous.count)
        toast.error('Could not reach the server. Check your connection.')
      } finally {
        pendingRef.current = false
      }
    })()
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild>
        <Link href={`/create?remix=${generationId}`}>
          <Repeat2 className="size-4" />
          Remix this
        </Link>
      </Button>

      <ShareButton generationId={generationId} />

      <LikeButton
        liked={liked}
        count={count}
        signedIn={signedIn}
        onToggle={like}
        size="lg"
        returnTo={`/g/${generationId}`}
        className="h-10"
      />
    </div>
  )
}
