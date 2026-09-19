'use client'

import * as React from 'react'
import { AlertTriangle, Check, Coins, Loader2, RotateCw } from 'lucide-react'

import { aspectStyle, GenerationMedia } from '@/components/gallery/generation-media'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { RelativeTime } from '@/components/ui/relative-time'
import { getModel } from '@/lib/ai/registry'
import { STATUS_LABELS } from '@/lib/constants'
import { truncate } from '@/lib/utils'
import { isTerminal, type GenerationWithAssets } from '@/types/database'

/**
 * One job in the live feed.
 *
 * The card is the same component from "queued" to "ready" so nothing jumps
 * when the status changes — only what is inside the frame swaps out.
 */
export function JobCard({
  generation,
  onRetry,
}: {
  generation: GenerationWithAssets
  onRetry?: (generation: GenerationWithAssets) => void
}) {
  const model = getModel(generation.model_id)
  const pending = !isTerminal(generation.status)
  const failed = generation.status === 'failed' || generation.status === 'canceled'

  return (
    <figure className="group overflow-hidden rounded-xl border border-border bg-card">
      <div
        className="relative isolate w-full overflow-hidden bg-surface"
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
      </div>

      <figcaption className="space-y-2.5 p-3.5">
        <p className="line-clamp-2 text-sm leading-snug text-foreground/90">
          {generation.prompt || <span className="text-muted-foreground">Preset only</span>}
        </p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/70">{model?.label ?? generation.model_id}</span>
          <span>{generation.aspect_ratio}</span>
          {generation.duration_sec ? <span>{generation.duration_sec}s</span> : null}
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Coins className="size-3" aria-hidden />
            {generation.credit_cost}
            {failed && generation.credit_cost > 0 ? ' refunded' : ''}
          </span>
          <RelativeTime value={generation.created_at} className="ml-auto" />
        </div>

        {failed && generation.error_message && (
          <p className="text-xs leading-snug text-destructive">{generation.error_message}</p>
        )}

        {failed && onRetry && (
          <Button variant="outline" size="sm" className="w-full" onClick={() => onRetry(generation)}>
            <RotateCw className="size-3.5" />
            Try again
          </Button>
        )}

        {pending && <Progress value={generation.progress} className="mt-1" />}
      </figcaption>
    </figure>
  )
}

function StatusBadge({ status }: { status: GenerationWithAssets['status'] }) {
  if (status === 'succeeded') {
    return (
      <Badge variant="success">
        <Check className="size-3" aria-hidden />
        {STATUS_LABELS[status]}
      </Badge>
    )
  }

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

/** The waiting state: a start frame when we have one, a shimmer when we do not. */
function PendingFrame({ generation }: { generation: GenerationWithAssets }) {
  const percent = Math.round(generation.progress * 100)

  return (
    <div className="absolute inset-0">
      {generation.input_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={generation.input_image_url}
          alt=""
          className="size-full scale-105 object-cover opacity-40 blur-[2px]"
        />
      ) : (
        /* `shimmer` is defined in globals.css; tailwindcss-animate is not a dependency. */
        <div className="size-full bg-surface-2/40 shimmer" />
      )}

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/30">
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
        <span className="text-xs tabular-nums text-muted-foreground">{percent}%</span>
      </div>
    </div>
  )
}

function FailedFrame({ message }: { message: string | null }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-destructive/5 px-6 text-center">
      <AlertTriangle className="size-5 text-destructive" aria-hidden />
      <span className="text-xs leading-snug text-muted-foreground">
        {message ? truncate(message, 90) : 'This one did not make it. Your credits are back.'}
      </span>
    </div>
  )
}
