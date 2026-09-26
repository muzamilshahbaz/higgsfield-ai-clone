'use client'

import * as React from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { AlertTriangle, Images, Loader2, Search, Sparkles, Trash2, X } from 'lucide-react'

import { deleteGenerationAction } from '@/app/(studio)/library/actions'
import { Segmented, type SegmentedOption } from '@/components/composer/segmented'
import { GenerationCard } from '@/components/gallery/generation-card'
import { GenerationDrawer, type DrawerProject } from '@/components/gallery/generation-drawer'
import { MasonryGrid } from '@/components/gallery/masonry-grid'
import { EmptyState } from '@/components/studio/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useGenerationQuery } from '@/hooks/use-generation-query'
import { cn } from '@/lib/utils'
import type { GenerationStatus, GenerationTask, GenerationWithAssets } from '@/types/database'

/**
 * The library.
 *
 * Also the body of a project page and of anywhere else that lists finished
 * work — the only differences are which project it is scoped to and what its
 * empty state says, both of which are props.
 *
 * Filtering is server-side through `/api/generations`, so a filter reaches
 * past the page currently loaded rather than hiding rows already on screen.
 */

const TYPE_FILTERS = {
  all: [] as GenerationTask[],
  image: ['text_to_image'] as GenerationTask[],
  video: ['text_to_video', 'image_to_video'] as GenerationTask[],
}

const STATUS_FILTERS = {
  all: [] as GenerationStatus[],
  ready: ['succeeded'] as GenerationStatus[],
  running: ['queued', 'running'] as GenerationStatus[],
  failed: ['failed', 'canceled'] as GenerationStatus[],
}

type TypeFilter = keyof typeof TYPE_FILTERS
type StatusFilter = keyof typeof STATUS_FILTERS

const TYPE_OPTIONS: SegmentedOption<TypeFilter>[] = [
  { value: 'all', label: 'All' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Videos' },
]

const STATUS_OPTIONS: SegmentedOption<StatusFilter>[] = [
  { value: 'all', label: 'All' },
  { value: 'ready', label: 'Ready' },
  { value: 'running', label: 'In progress' },
  { value: 'failed', label: 'Failed' },
]

export function LibraryGrid({
  initialGenerations,
  projects,
  projectId = null,
  pageSize,
  emptyTitle = 'Nothing in your library yet',
  emptyDescription = 'Every shot you generate lands here, ready to download, reuse or file away.',
}: {
  initialGenerations: GenerationWithAssets[]
  projects: DrawerProject[]
  /** Scopes the whole surface to one project, and enables "set as cover". */
  projectId?: string | null
  pageSize: number
  emptyTitle?: string
  emptyDescription?: string
}) {
  const query = useGenerationQuery({ initial: initialGenerations, pageSize, projectId })

  const [type, setType] = React.useState<TypeFilter>('all')
  const [status, setStatus] = React.useState<StatusFilter>('all')
  // The drawer holds an id, not a row, so a move or a delete flows straight
  // through to what it shows instead of leaving a stale copy on screen.
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [selection, setSelection] = React.useState<Set<string>>(new Set())
  const [selecting, setSelecting] = React.useState(false)
  const [bulkBusy, setBulkBusy] = React.useState(false)

  const searchId = React.useId()
  const { setFilters, remove, patch } = query

  const chooseType = (next: TypeFilter) => {
    setType(next)
    setFilters({ task: TYPE_FILTERS[next] })
  }

  const chooseStatus = (next: StatusFilter) => {
    setStatus(next)
    setFilters({ status: STATUS_FILTERS[next] })
  }

  const reset = () => {
    setType('all')
    setStatus('all')
    query.clearFilters()
  }

  const toggleSelect = (generation: GenerationWithAssets) => {
    setSelection((current) => {
      const next = new Set(current)
      if (next.has(generation.id)) next.delete(generation.id)
      else next.add(generation.id)
      return next
    })
  }

  const leaveSelection = () => {
    setSelecting(false)
    setSelection(new Set())
  }

  /**
   * Bulk delete, one request per row rather than one batched endpoint: each
   * delete has to clean up its own storage objects, and a partial failure
   * should leave the rows it did remove removed.
   */
  async function deleteSelected() {
    const ids = [...selection]
    if (ids.length === 0) return

    setBulkBusy(true)
    const results = await Promise.all(
      ids.map(async (id) => ({ id, result: await deleteGenerationAction(id, projectId) })),
    )
    setBulkBusy(false)

    const removed = results.filter((entry) => entry.result.ok)
    for (const entry of removed) remove(entry.id)

    const failures = results.length - removed.length
    if (removed.length > 0) {
      toast.success(`Deleted ${removed.length} ${removed.length === 1 ? 'shot' : 'shots'}`)
    }
    if (failures > 0) {
      const first = results.find((entry) => !entry.result.ok)?.result
      toast.error(
        failures === results.length
          ? (first && !first.ok ? first.error : 'Nothing could be deleted.')
          : `${failures} could not be deleted.`,
      )
    }
    leaveSelection()
  }

  const empty = query.generations.length === 0
  const openGeneration = query.generations.find((row) => row.id === openId) ?? null

  return (
    <div className="@container space-y-5">
      {/* The toolbar. Contained in a panel so the filters read as one control
          surface rather than four chips floating above the grid. */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface/40 p-2">
        <Segmented name="Media type" size="sm" value={type} options={TYPE_OPTIONS} onChange={chooseType} />

        {/* Both groups open with an option called "All", so without a rule
            between them the toolbar reads as one control with two of them. */}
        <span className="mx-1 hidden h-6 w-px bg-border sm:block" aria-hidden />

        <Segmented
          name="Job status"
          size="sm"
          value={status}
          options={STATUS_OPTIONS}
          onChange={chooseStatus}
        />

        <div className="relative ml-auto w-full sm:w-56">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <label htmlFor={searchId} className="sr-only">
            Search your prompts
          </label>
          <Input
            id={searchId}
            type="search"
            value={query.filters.search}
            placeholder="Search prompts"
            className="h-8 bg-background/60 pl-8 text-xs"
            onChange={(event) => setFilters({ search: event.target.value })}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <p role="status" className="text-xs text-muted-foreground">
          {query.loading ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="size-3 animate-spin" aria-hidden />
              Filtering…
            </span>
          ) : query.activeCount > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="size-3 animate-spin" aria-hidden />
              {query.activeCount} still rendering
            </span>
          ) : (
            <>
              {query.generations.length}
              {query.hasMore ? '+' : ''} {query.generations.length === 1 ? 'shot' : 'shots'}
            </>
          )}
        </p>

        {query.filtered && (
          <Button variant="ghost" size="sm" onClick={reset}>
            Clear filters
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {selecting ? (
            <>
              <span className="text-xs tabular-nums text-muted-foreground">
                {selection.size} selected
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void deleteSelected()}
                disabled={selection.size === 0 || bulkBusy}
                className="text-danger hover:text-danger"
              >
                {bulkBusy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
                Delete
              </Button>
              <Button variant="ghost" size="sm" onClick={leaveSelection}>
                <X className="size-3.5" />
                Done
              </Button>
            </>
          ) : (
            !empty && (
              <Button variant="ghost" size="sm" onClick={() => setSelecting(true)}>
                Select
              </Button>
            )
          )}
        </div>
      </div>

      {query.error ? (
        <EmptyState
          icon={AlertTriangle}
          title="Could not load your library"
          description={query.error}
          action={
            <Button variant="outline" onClick={query.retry}>
              Try again
            </Button>
          }
        />
      ) : empty ? (
        query.filtered ? (
          <EmptyState
            icon={Search}
            title="Nothing matches those filters"
            description="No shot in your library fits that search. Widen it or start again."
            action={
              <Button variant="outline" onClick={reset}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Images}
            title={emptyTitle}
            description={emptyDescription}
            action={
              <Button asChild>
                <Link href={projectId ? `/create?project=${projectId}` : '/create'}>
                  <Sparkles className="size-4" />
                  Make something
                </Link>
              </Button>
            }
          />
        )
      ) : (
        <MasonryGrid className={cn(query.loading && 'opacity-60 transition-opacity')}>
          {query.generations.map((generation) => (
            <GenerationCard
              key={generation.id}
              generation={generation}
              onOpen={(generation) => setOpenId(generation.id)}
              selectable={selecting}
              selected={selection.has(generation.id)}
              onToggleSelect={toggleSelect}
            />
          ))}
        </MasonryGrid>
      )}

      {query.hasMore && !empty && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={query.loadMore} disabled={query.loadingMore}>
            {query.loadingMore ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Loading…
              </>
            ) : (
              'Load more'
            )}
          </Button>
        </div>
      )}

      <GenerationDrawer
        generation={openGeneration}
        open={openGeneration !== null}
        onOpenChange={(next) => !next && setOpenId(null)}
        projects={projects}
        coverProjectId={projectId}
        onDeleted={remove}
        onVisibilityChanged={(id, visibility) => patch(id, { visibility })}
        onMoved={(id, nextProjectId) => {
          // Moved out of the project being viewed: it no longer belongs here.
          if (projectId && nextProjectId !== projectId) remove(id)
          else patch(id, { project_id: nextProjectId })
        }}
      />
    </div>
  )
}
