'use client'

import * as React from 'react'
import Link from 'next/link'
import { AlertTriangle, Check, History, Loader2, Search, Sparkles } from 'lucide-react'

import { Segmented, type SegmentedOption } from '@/components/composer/segmented'
import { GenerationDrawer, type DrawerProject } from '@/components/gallery/generation-drawer'
import { GenerationMedia } from '@/components/gallery/generation-media'
import { EmptyState } from '@/components/studio/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RelativeTime } from '@/components/ui/relative-time'
import { useGenerationQuery } from '@/hooks/use-generation-query'
import { getModel } from '@/lib/ai/registry'
import { STATUS_LABELS, TASK_LABELS } from '@/lib/constants'
import { cn, truncate } from '@/lib/utils'
import { isTerminal, type GenerationStatus, type GenerationWithAssets } from '@/types/database'

/**
 * Every job the user has run, failures included.
 *
 * The library shows work; this shows *jobs* — what was spent, what broke and
 * what came back. That is why it is a table rather than a grid, and why the
 * failed rows are not filtered out by default.
 */

const STATUS_FILTERS = {
  all: [] as GenerationStatus[],
  ready: ['succeeded'] as GenerationStatus[],
  running: ['queued', 'running'] as GenerationStatus[],
  failed: ['failed', 'canceled'] as GenerationStatus[],
}

type StatusFilter = keyof typeof STATUS_FILTERS

const STATUS_OPTIONS: SegmentedOption<StatusFilter>[] = [
  { value: 'all', label: 'Everything' },
  { value: 'ready', label: 'Succeeded' },
  { value: 'running', label: 'In progress' },
  { value: 'failed', label: 'Failed' },
]

export function HistoryTable({
  initialGenerations,
  projects,
  pageSize,
}: {
  initialGenerations: GenerationWithAssets[]
  projects: DrawerProject[]
  pageSize: number
}) {
  const query = useGenerationQuery({ initial: initialGenerations, pageSize })

  const [status, setStatus] = React.useState<StatusFilter>('all')
  const [openId, setOpenId] = React.useState<string | null>(null)
  const searchId = React.useId()
  const { setFilters, remove, patch } = query

  const chooseStatus = (next: StatusFilter) => {
    setStatus(next)
    setFilters({ status: STATUS_FILTERS[next] })
  }

  const reset = () => {
    setStatus('all')
    query.clearFilters()
  }

  const empty = query.generations.length === 0
  const openGeneration = query.generations.find((row) => row.id === openId) ?? null

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
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
            className="h-8 pl-8 text-xs"
            onChange={(event) => setFilters({ search: event.target.value })}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <p role="status" className="text-xs text-muted-foreground">
          {query.loading ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="size-3 animate-spin" aria-hidden />
              Filtering…
            </span>
          ) : query.activeCount > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="size-3 animate-spin" aria-hidden />
              {query.activeCount} still running
            </span>
          ) : (
            <>
              {query.generations.length}
              {query.hasMore ? '+' : ''} {query.generations.length === 1 ? 'job' : 'jobs'}
            </>
          )}
        </p>
        {query.filtered && (
          <Button variant="ghost" size="sm" onClick={reset}>
            Clear filters
          </Button>
        )}
      </div>

      {query.error ? (
        <EmptyState
          icon={AlertTriangle}
          title="Could not load your history"
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
            title="No jobs match"
            description="Nothing you have run fits those filters."
            action={
              <Button variant="outline" onClick={reset}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={History}
            title="You have not run anything yet"
            description="Every job you start shows up here — finished, running or failed — with what it cost."
            action={
              <Button asChild>
                <Link href="/create">
                  <Sparkles className="size-4" />
                  Make something
                </Link>
              </Button>
            }
          />
        )
      ) : (
        <div
          className={cn(
            'overflow-hidden rounded-xl border border-border',
            query.loading && 'opacity-60 transition-opacity',
          )}
        >
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">
              Your generation jobs, newest first. Select a row to open its details.
            </caption>
            <thead>
              <tr className="border-b border-border bg-surface/60 text-left">
                <th scope="col" className="px-3 py-2.5 text-xs font-medium text-muted-foreground">
                  Shot
                </th>
                <th
                  scope="col"
                  className="hidden px-3 py-2.5 text-xs font-medium text-muted-foreground sm:table-cell"
                >
                  Model
                </th>
                <th scope="col" className="px-3 py-2.5 text-xs font-medium text-muted-foreground">
                  Status
                </th>
                <th
                  scope="col"
                  className="hidden px-3 py-2.5 text-right text-xs font-medium text-muted-foreground sm:table-cell"
                >
                  Credits
                </th>
                <th
                  scope="col"
                  className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground"
                >
                  When
                </th>
              </tr>
            </thead>
            <tbody>
              {query.generations.map((generation) => (
                <HistoryRow
                  key={generation.id}
                  generation={generation}
                  onOpen={() => setOpenId(generation.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
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
        onDeleted={remove}
        onVisibilityChanged={(id, visibility) => patch(id, { visibility })}
        onMoved={(id, projectId) => patch(id, { project_id: projectId })}
      />
    </div>
  )
}

function HistoryRow({
  generation,
  onOpen,
}: {
  generation: GenerationWithAssets
  onOpen: () => void
}) {
  const model = getModel(generation.model_id)
  const failed = generation.status === 'failed' || generation.status === 'canceled'
  const label = generation.prompt.trim() || 'Preset-only shot'

  return (
    <tr className="border-b border-border/60 transition-colors last:border-0 hover:bg-surface/50">
      {/* `w-full` + `max-w-0` is the CSS-table idiom for "take whatever the
          other columns leave and truncate inside it" — without both, the
          prompt column collapses to its longest unbreakable word. */}
      <th scope="row" className="w-full max-w-0 p-0 text-left font-normal">
        {/*
          The button is the row's only tab stop and carries its whole label, so
          a keyboard reader hears the shot rather than five separate cells.
        */}
        <button
          type="button"
          onClick={onOpen}
          className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
        >
          <span className="size-10 shrink-0 overflow-hidden rounded-md bg-surface-2">
            {generation.status === 'succeeded' && generation.assets.length > 0 ? (
              <GenerationMedia assets={generation.assets} alt="" autoPlay={false} />
            ) : generation.input_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={generation.input_image_url}
                alt=""
                loading="lazy"
                className="size-full object-cover opacity-50"
              />
            ) : null}
          </span>

          <span className="min-w-0">
            <span className="block truncate text-sm">{truncate(label, 90)}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {TASK_LABELS[generation.task]}
              <span className="sm:hidden"> · {model?.label ?? generation.model_id}</span>
            </span>
          </span>
        </button>
      </th>

      <td className="hidden whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground sm:table-cell">
        {model?.label ?? generation.model_id}
      </td>

      <td className="px-3 py-2.5">
        <StatusCell status={generation.status} />
      </td>

      <td className="hidden whitespace-nowrap px-3 py-2.5 text-right text-xs tabular-nums sm:table-cell">
        <span className={cn(failed && 'text-muted-foreground line-through')}>
          {generation.credit_cost}
        </span>
      </td>

      <td className="whitespace-nowrap px-3 py-2.5 text-right">
        <RelativeTime value={generation.created_at} className="text-xs text-muted-foreground" />
      </td>
    </tr>
  )
}

function StatusCell({ status }: { status: GenerationStatus }) {
  if (status === 'succeeded') {
    return (
      <Badge variant="success">
        <Check className="size-3" aria-hidden />
        {STATUS_LABELS[status]}
      </Badge>
    )
  }
  if (!isTerminal(status)) {
    return (
      <Badge variant="secondary">
        <Loader2 className="size-3 animate-spin" aria-hidden />
        {STATUS_LABELS[status]}
      </Badge>
    )
  }
  return (
    <Badge variant="destructive">
      <AlertTriangle className="size-3" aria-hidden />
      {STATUS_LABELS[status]}
    </Badge>
  )
}
