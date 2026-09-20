'use client'

import * as React from 'react'
import { AlertTriangle, Check, Clapperboard, Image as ImageIcon, Loader2 } from 'lucide-react'

import { GenerationMedia, useHoverPlayback } from '@/components/gallery/generation-media'
import { Badge } from '@/components/ui/badge'
import { STATUS_LABELS } from '@/lib/constants'
import { aspectStyle, cn, truncate } from '@/lib/utils'
import { isTerminal, type GenerationWithAssets } from '@/types/database'

/**
 * One library tile.
 *
 * The whole card is a single button — opening the detail drawer is the only
 * thing it does — so hover, focus and click all land on the same element and
 * the clip starts playing for pointer and keyboard alike. The selection
 * checkbox is the one exception, and it stops the click from reaching the
 * card underneath it.
 */
export function GenerationCard({
  generation,
  onOpen,
  selectable = false,
  selected = false,
  onToggleSelect,
}: {
  generation: GenerationWithAssets
  onOpen: (generation: GenerationWithAssets) => void
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: (generation: GenerationWithAssets) => void
}) {
  const { ref, handlers } = useHoverPlayback()

  const ready = generation.status === 'succeeded' && generation.assets.length > 0
  const failed = generation.status === 'failed' || generation.status === 'canceled'
  const pending = !isTerminal(generation.status)

  const label = generation.prompt.trim() || 'Preset-only shot'

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => onOpen(generation)}
        aria-label={`Open ${truncate(label, 80)}`}
        className={cn(
          'block w-full overflow-hidden rounded-xl border bg-card text-left transition-colors',
          selected ? 'border-primary' : 'border-border hover:border-muted',
        )}
        {...handlers}
      >
        <div
          className="relative isolate w-full overflow-hidden bg-surface"
          style={aspectStyle(generation.aspect_ratio)}
        >
          {ready ? (
            <GenerationMedia assets={generation.assets} alt={label} autoPlay={false} mediaRef={ref} />
          ) : (
            <PlaceholderFrame generation={generation} />
          )}

          {/* Decorative: the button underneath must stay the hover target. */}
          <div
            className={cn(
              'pointer-events-none absolute inset-x-0 bottom-0 z-10 p-3',
              'bg-gradient-to-t from-background/95 via-background/55 to-transparent',
              'opacity-0 transition-opacity duration-200 group-hover:opacity-100',
              'group-focus-within:opacity-100',
            )}
          >
            <p className="line-clamp-2 text-xs leading-snug text-foreground">{label}</p>
          </div>

          {(pending || failed) && (
            <span className="pointer-events-none absolute left-2.5 top-2.5 z-10">
              <StatusBadge status={generation.status} />
            </span>
          )}
        </div>
      </button>

      {selectable && (
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={`Select ${truncate(label, 80)}`}
          onClick={() => onToggleSelect?.(generation)}
          className={cn(
            'absolute right-2.5 top-2.5 z-20 flex size-6 items-center justify-center rounded-md border transition-colors',
            selected
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-background/80 text-transparent backdrop-blur hover:border-muted',
          )}
        >
          <Check className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: GenerationWithAssets['status'] }) {
  if (status === 'failed' || status === 'canceled') {
    return (
      <Badge variant="destructive">
        <AlertTriangle className="size-3" aria-hidden />
        {STATUS_LABELS[status]}
      </Badge>
    )
  }

  return (
    <Badge variant="secondary" className="backdrop-blur">
      <Loader2 className="size-3 animate-spin" aria-hidden />
      {STATUS_LABELS[status]}
    </Badge>
  )
}

/**
 * What a tile shows when there is no media: the start frame for an
 * image-to-video job, otherwise the shape of the job it was.
 */
function PlaceholderFrame({ generation }: { generation: GenerationWithAssets }) {
  const failed = generation.status === 'failed' || generation.status === 'canceled'
  const Icon = generation.task === 'text_to_image' ? ImageIcon : Clapperboard

  if (generation.input_image_url) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={generation.input_image_url}
          alt=""
          loading="lazy"
          className="size-full scale-105 object-cover opacity-40 blur-[2px]"
        />
        <div className="absolute inset-0 bg-background/30" />
      </>
    )
  }

  return (
    <div
      className={cn(
        'flex size-full items-center justify-center',
        failed ? 'bg-destructive/5' : 'bg-surface-2/40',
      )}
    >
      <Icon
        className={cn('size-6', failed ? 'text-danger' : 'text-muted-foreground')}
        aria-hidden
      />
    </div>
  )
}
