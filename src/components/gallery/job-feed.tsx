'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Clapperboard, Loader2 } from 'lucide-react'

import { JobCard } from '@/components/gallery/job-card'
import { EmptyState } from '@/components/studio/empty-state'
import { useGenerationFeed } from '@/hooks/use-generation-feed'
import { newIdempotencyKey } from '@/lib/utils'
import type { GenerationWithAssets } from '@/types/database'

/**
 * The live feed beside the composer.
 *
 * Cards arrive optimistically from the composer, then update themselves from
 * Realtime and the ticker. Nothing here polls on its own.
 */
export function JobFeed({
  emptyHint,
  showCount = true,
}: {
  emptyHint?: string
  /** Off where a surrounding stat already states the total, as on the dashboard. */
  showCount?: boolean
}) {
  const { generations, activeCount, syncing, upsert } = useGenerationFeed()
  const [retrying, setRetrying] = React.useState<string | null>(null)

  /** Re-runs a failed job with the same settings, as a new generation. */
  const retry = React.useCallback(
    async (generation: GenerationWithAssets) => {
      setRetrying(generation.id)
      try {
        const response = await fetch('/api/generations', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            idempotencyKey: newIdempotencyKey(),
            task: generation.task,
            modelId: generation.model_id,
            projectId: generation.project_id ?? undefined,
            presetId: generation.preset_id ?? undefined,
            prompt: generation.prompt,
            negativePrompt: generation.negative_prompt ?? undefined,
            imageUrl: generation.input_image_url ?? undefined,
            aspectRatio: generation.aspect_ratio,
            durationSec: generation.duration_sec ?? undefined,
            seed: generation.seed ?? undefined,
          }),
        })

        const data = (await response.json()) as {
          generation?: GenerationWithAssets
          error?: { message: string }
        }

        if (!response.ok || !data.generation) {
          toast.error(data.error?.message ?? 'Could not start that generation.')
          return
        }

        upsert([data.generation])
        toast.success('Running it again')
      } catch {
        toast.error('Could not reach the server. Check your connection.')
      } finally {
        setRetrying(null)
      }
    },
    [upsert],
  )

  if (generations.length === 0) {
    return (
      <EmptyState
        icon={Clapperboard}
        title="Nothing here yet"
        description={emptyHint ?? 'Write a prompt, pick a look, and your first shot lands here.'}
      />
    )
  }

  return (
    // Container queries, not viewport ones: this grid sits in a column whose
    // width depends on whether the composer is beside it, so a viewport
    // breakpoint would give three cards 190px each on /create.
    <div className="@container space-y-4">
      <div className="flex h-5 items-center gap-2 text-xs text-muted-foreground">
        {activeCount > 0 ? (
          <>
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            <span>
              {activeCount} {activeCount === 1 ? 'job' : 'jobs'} running
            </span>
          </>
        ) : showCount ? (
          <span>
            {generations.length} {generations.length === 1 ? 'generation' : 'generations'}
          </span>
        ) : null}
        {syncing && <span className="sr-only">Checking for updates</span>}
      </div>

      <div className="grid gap-4 @2xl:grid-cols-2 @4xl:grid-cols-3">
        {generations.map((generation) => (
          <JobCard
            key={generation.id}
            generation={generation}
            onRetry={retrying === generation.id ? undefined : retry}
          />
        ))}
      </div>
    </div>
  )
}
