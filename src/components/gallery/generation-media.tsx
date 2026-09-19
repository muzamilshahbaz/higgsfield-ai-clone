'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'
import type { AssetRow } from '@/types/database'

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
}: {
  assets: AssetRow[]
  alt: string
  className?: string
  autoPlay?: boolean
}) {
  const primary = assets.find((asset) => asset.kind !== 'poster') ?? assets[0]
  const poster = assets.find((asset) => asset.kind === 'poster')

  if (!primary) return null

  const isVideo = (primary.mime_type ?? '').startsWith('video/')

  if (isVideo) {
    return (
      <video
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

/** CSS aspect-ratio from a "16:9" style string, with a sane fallback. */
export function aspectStyle(aspectRatio: string): React.CSSProperties {
  const [width, height] = aspectRatio.split(':').map(Number)
  if (!width || !height) return { aspectRatio: '16 / 9' }
  return { aspectRatio: `${width} / ${height}` }
}
