'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'
import type { AssetRow } from '@/types/database'

/**
 * Hover-to-play for a grid of clips.
 *
 * The handlers belong on whatever the reader actually points at — the card
 * button — not on the video, which sits under an overlay and would never see
 * the pointer. The hook keeps that wiring in one place: spread the handlers on
 * the card, pass `ref` to the media.
 */
export function useHoverPlayback() {
  const ref = React.useRef<HTMLVideoElement>(null)

  const play = React.useCallback(() => {
    // `play()` rejects when the element unmounts mid-hover, or when the
    // browser declines playback; neither deserves an unhandled rejection.
    void ref.current?.play().catch(() => {})
  }, [])

  const pause = React.useCallback(() => {
    const video = ref.current
    if (!video) return
    video.pause()
    video.currentTime = 0
  }, [])

  return {
    ref,
    handlers: {
      onMouseEnter: play,
      onMouseLeave: pause,
      onFocus: play,
      onBlur: pause,
    },
  }
}

/**
 * Renders one generation's output.
 *
 * The element is chosen from the mime type, not the asset kind: the mock
 * driver returns animated SVG "shots" tagged `video` so the product can be
 * demoed with no binaries, and those have to render as images.
 */
export function GenerationMedia({
  assets,
  alt,
  className,
  autoPlay = true,
  mediaRef,
}: {
  assets: AssetRow[]
  alt: string
  className?: string
  /**
   * Off in a grid, where a page of clips all decoding at once is a lot of work
   * for media nobody is looking at yet — `useHoverPlayback` drives those.
   */
  autoPlay?: boolean
  mediaRef?: React.Ref<HTMLVideoElement>
}) {
  const primary = assets.find((asset) => asset.kind !== 'poster') ?? assets[0]
  const poster = assets.find((asset) => asset.kind === 'poster')

  if (!primary) return null

  const isVideo = (primary.mime_type ?? '').startsWith('video/')

  if (isVideo) {
    return (
      <video
        ref={mediaRef}
        src={primary.url}
        poster={poster?.url}
        className={cn('size-full object-cover', className)}
        autoPlay={autoPlay}
        muted
        loop
        playsInline
        preload="metadata"
      />
    )
  }

  return (
    // Not next/image: these URLs come from Supabase Storage and from provider
    // CDNs that are not in next.config's remotePatterns, and an optimiser that
    // 500s on an unknown host would take the whole card down.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={primary.url}
      alt={alt}
      loading="lazy"
      className={cn('size-full object-cover', className)}
    />
  )
}
