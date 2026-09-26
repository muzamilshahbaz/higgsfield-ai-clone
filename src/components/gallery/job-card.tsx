'use client'

import * as React from 'react'
import { AlertTriangle, Check, Coins, Loader2, RotateCw, Wand2 } from 'lucide-react'

import { GenerationMedia } from '@/components/gallery/generation-media'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { RelativeTime } from '@/components/ui/relative-time'
import { usePresetCatalogue } from '@/hooks/use-preset-catalogue'
import { getModel } from '@/lib/ai/registry'
import { STATUS_LABELS } from '@/lib/constants'
import { aspectStyle, truncate } from '@/lib/utils'
import { isTerminal, type GenerationWithAssets } from '@/types/database'

/**
 * One job in the live feed.
 *
 * The card is the same component from "queued" to "ready" so nothing jumps when
 * the status changes — only what is inside the frame swaps out. That is worth
 * protecting: the feed is the one surface where a user is watching for a change,
 * and a card that resizes as it settles makes the whole column jump under them.
 *
 * The progress bar sits on the bottom edge of the frame rather than under the
 * caption, so it reads as belonging to the picture that is still arriving.
 */
export function JobCard({
  generation,
  onRetry,
}: {
  generation: GenerationWithAssets
  onRetry?: (generation: GenerationWithAssets) => void
}) {
  const { byId } = usePresetCatalogue()

  const model = getModel(generation.model_id)
  // Null for a shot made without a preset, and for one made with a preset that
  // has since been retired from the catalogue.
  const preset = generation.preset_id ? byId.get(generation.preset_id) : undefined
  const pending = !isTerminal(generation.status)
  const failed = generation.status === 'failed' || generation.status === 'canceled'

  return (
    <figure className="panel group overflow-hidden rounded-xl transition-colors hover:border-muted">
      <div
        className="relative isolate w-full overflow-hidden bg-surface-2"
        style={aspectStyle(generation.aspect_ratio)}
      >
        {generation.status === 'succeeded' && generation.assets.length > 0 ? (
          <GenerationMedia
            assets={generation.assets}
            alt={truncate(generation.prompt || 'Generated shot', 120)}
          />
        ) : failed ? (
          <FailedFrame message={generation.error_message} />
        ) : (
          <PendingFrame generation={generation} />
        )}

        <div className="absolute left-2.5 top-2.5 z-10">
          <StatusBadge status={generation.status} />
        </div>

        {pending && (
          <Progress
            value={generation.progress}
            className="absolute inset-x-0 bottom-0 z-10 h-1 rounded-none"
          />
        )}
      </div>

      <figcaption className="space-y-3 p-3.5">
        <p className="line-clamp-2 text-sm leading-snug text-foreground/90">
          {generation.prompt || <span className="text-muted-foreground">Preset only</span>}
        </p>

        {preset && (
          <Badge variant="outline">
            <Wand2 className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{preset.title}</span>
          </Badge>
        )}

        {/* The spec line. Mono for the values a user compares between cards. */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[11px] text-muted-foreground">
          <span className="truncate text-foreground/70">{model?.label ?? generation.model_id}</span>
          <span aria-hidden>·</span>
          <span>{generation.aspect_ratio}</span>
          {generation.duration_sec ? (
            <>
              <span aria-hidden>·</span>
              <span>{generation.duration_sec}s</span>
            </>
          ) : null}
          <span className="inline-flex items-center gap-1 tabular-nums text-credit">
            <Coins className="size-3" aria-hidden />
            {generation.credit_cost}
            {failed && generation.credit_cost > 0 ? ' refunded' : ''}
          </span>
          <RelativeTime value={generation.created_at} className="ml-auto shrink-0" />
        </div>

        {failed && generation.error_message && (
          <p className="text-xs leading-snug text-danger">{generation.error_message}</p>
        )}

        {failed && onRetry && (
          <Button variant="outline" size="sm" className="w-full" onClick={() => onRetry(generation)}>
            <RotateCw className="size-3.5" />
            Try again
          </Button>
        )}
      </figcaption>
    </figure>
  )
}

function StatusBadge({ status }: { status: GenerationWithAssets['status'] }) {
  if (status === 'succeeded') {
    return (
      <Badge variant="success" onMedia>
        <Check className="size-3" aria-hidden />
        {STATUS_LABELS[status]}
      </Badge>
    )
  }

  if (status === 'failed' || status === 'canceled') {
    return (
      <Badge variant="destructive" onMedia>
        <AlertTriangle className="size-3" aria-hidden />
        {STATUS_LABELS[status]}
      </Badge>
    )
  }

  return (
    <Badge onMedia>
      <Loader2 className="size-3 animate-spin" aria-hidden />
      {STATUS_LABELS[status]}
    </Badge>
  )
}

/**
 * The waiting state: a start frame when we have one, a blueprint when we do not.
 *
 * The percentage is stated as text as well as drawn as a bar. A progress bar on
 * its own tells you roughly where you are; a number tells you whether it moved
 * since the last time you looked, which is the actual question at 40%.
 */
function PendingFrame({ generation }: { generation: GenerationWithAssets }) {
  const percent = Math.round(generation.progress * 100)

  return (
    <div className="absolute inset-0">
      {generation.input_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={generation.input_image_url}
          alt=""
          className="size-full scale-105 object-cover opacity-35 blur-[2px]"
        />
      ) : (
        /* `shimmer` and `blueprint` are defined in globals.css. */
        <div className="blueprint shimmer size-full opacity-60" />
      )}

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-background/40">
        <Loader2 className="size-5 animate-spin text-brand" aria-hidden />
        <span className="font-mono text-xs tabular-nums text-muted-foreground">{percent}%</span>
      </div>
    </div>
  )
}

function FailedFrame({ message }: { message: string | null }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-destructive/5 px-6 text-center">
      <AlertTriangle className="size-5 text-danger" aria-hidden />
      <span className="text-xs leading-snug text-muted-foreground">
        {message ? truncate(message, 90) : 'This one did not make it. Your credits are back.'}
      </span>
    </div>
  )
}
