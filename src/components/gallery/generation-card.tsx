'use client'

import * as React from 'react'
import {
  AlertTriangle,
  Check,
  Clapperboard,
  Image as ImageIcon,
  Loader2,
  Trash2,
} from 'lucide-react'

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
 * the clip starts playing for pointer and keyboard alike.
 *
 * The selection checkbox and the delete button are the two exceptions. Both are
 * siblings of that button rather than children of it: a button nested inside a
 * button is invalid markup, and in practice the inner one stops firing. They sit
 * above it on the z-axis and never appear together, because in selection mode
 * the toolbar's bulk delete is the one that applies.
 */
export function GenerationCard({
  generation,
  onOpen,
  selectable = false,
  selected = false,
  onToggleSelect,
  onDelete,
}: {
  generation: GenerationWithAssets
  onOpen: (generation: GenerationWithAssets) => void
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: (generation: GenerationWithAssets) => void
  /**
   * Asks the owner to confirm and perform a delete. The card never deletes
   * anything itself — it has no idea which grid it is in or what should happen
   * to the row afterwards, and two grids would otherwise each need their own
   * confirmation dialog.
   */
  onDelete?: (generation: GenerationWithAssets) => void
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

      {/*
        Hidden until hover or keyboard focus, so a wall of thumbnails is not a
        wall of delete buttons — but `group-focus-within` means it is reachable
        by Tab, not mouse-only. A running job has no delete: the service refuses
        one while a provider still holds the work.
      */}
      {!selectable && onDelete && isTerminal(generation.status) && (
        <button
          type="button"
          onClick={() => onDelete(generation)}
          aria-label={`Delete ${truncate(label, 80)}`}
          className={cn(
            'absolute right-2.5 top-2.5 z-20 flex size-7 items-center justify-center rounded-md',
            'border border-border bg-background/80 text-muted-foreground backdrop-blur',
            'opacity-0 transition-[opacity,color,border-color] hover:border-destructive/50 hover:text-danger',
            'group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100',
          )}
        >
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      )}

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
