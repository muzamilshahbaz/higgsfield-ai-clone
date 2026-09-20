'use client'

import * as React from 'react'

import { useJobTicker } from '@/hooks/use-job-ticker'
import {
  isTerminal,
  type GenerationStatus,
  type GenerationTask,
  type GenerationWithAssets,
} from '@/types/database'

/**
 * Filtered, paged reads of the signed-in user's generations.
 *
 * The library grid, a project's grid and the history table are the same query
 * with different chrome, so they share this hook rather than each growing
 * their own fetch, their own paging and their own idea of what "empty" means.
 *
 * The first page is server-rendered and handed in, so the surface is never
 * blank on load; everything after that comes from `/api/generations`.
 */

export interface GenerationFilters {
  status: GenerationStatus[]
  task: GenerationTask[]
  search: string
}

export const NO_FILTERS: GenerationFilters = { status: [], task: [], search: '' }

export function hasActiveFilters(filters: GenerationFilters): boolean {
  return filters.status.length > 0 || filters.task.length > 0 || filters.search.trim() !== ''
}

interface Options {
  initial: GenerationWithAssets[]
  pageSize: number
  projectId?: string | null
  /** Filters the server already applied to `initial`. */
  initialFilters?: GenerationFilters
}

export interface GenerationQuery {
  generations: GenerationWithAssets[]
  filters: GenerationFilters
  setFilters: (update: Partial<GenerationFilters>) => void
  clearFilters: () => void
  filtered: boolean
  /** A filter change is in flight — the grid dims rather than emptying. */
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  loadMore: () => void
  error: string | null
  retry: () => void
  /** Drops a row locally after a delete, with no refetch. */
  remove: (id: string) => void
  /** Merges a server-confirmed change into the row it belongs to. */
  patch: (id: string, changes: Partial<GenerationWithAssets>) => void
  /** Rows still queued or running, which is what keeps the ticker alive. */
  activeCount: number
}

const SEARCH_DEBOUNCE_MS = 300

export function useGenerationQuery({
  initial,
  pageSize,
  projectId,
  initialFilters = NO_FILTERS,
}: Options): GenerationQuery {
  const [generations, setGenerations] = React.useState(initial)
  const [filters, setFiltersState] = React.useState<GenerationFilters>(initialFilters)
  const [loading, setLoading] = React.useState(false)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [hasMore, setHasMore] = React.useState(initial.length === pageSize)
  const [error, setError] = React.useState<string | null>(null)

  /** Only the newest request may write to state; late replies are dropped. */
  const requestRef = React.useRef(0)
  /** Skips the fetch that would otherwise duplicate the server's first page. */
  const primedRef = React.useRef(true)

  const query = React.useCallback(
    (offset: number) => {
      const params = new URLSearchParams()
      params.set('limit', String(pageSize))
      if (offset > 0) params.set('offset', String(offset))
      if (projectId) params.set('projectId', projectId)
      for (const status of filters.status) params.append('status', status)
      for (const task of filters.task) params.append('task', task)
      if (filters.search.trim()) params.set('q', filters.search.trim())
      return `/api/generations?${params.toString()}`
    },
    [pageSize, projectId, filters],
  )

  const fetchPage = React.useCallback(
    async (offset: number) => {
      const ticket = ++requestRef.current
      if (offset === 0) setLoading(true)
      else setLoadingMore(true)
      setError(null)

      try {
        const response = await fetch(query(offset))

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: { message: string }
          } | null
          throw new Error(body?.error?.message ?? 'Could not load your generations.')
        }

        const data = (await response.json()) as {
          generations?: GenerationWithAssets[]
          hasMore?: boolean
        }

        if (ticket !== requestRef.current) return

        const rows = data.generations ?? []
        setGenerations((current) => (offset === 0 ? rows : dedupe([...current, ...rows])))
        setHasMore(data.hasMore ?? rows.length === pageSize)
      } catch (cause) {
        if (ticket !== requestRef.current) return
        setError(cause instanceof Error ? cause.message : 'Could not load your generations.')
      } finally {
        if (ticket === requestRef.current) {
          setLoading(false)
          setLoadingMore(false)
        }
      }
    },
    [query, pageSize],
  )

  // Refetch when the filters change. The debounce covers the whole effect
  // rather than just the search box, so typing and clicking a chip cannot fire
  // two overlapping first pages.
  React.useEffect(() => {
    if (primedRef.current) {
      primedRef.current = false
      return
    }

    const timer = setTimeout(() => void fetchPage(0), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [fetchPage])

  const setFilters = React.useCallback((update: Partial<GenerationFilters>) => {
    setFiltersState((current) => ({ ...current, ...update }))
  }, [])

  const clearFilters = React.useCallback(() => setFiltersState(NO_FILTERS), [])

  const loadMore = React.useCallback(() => {
    if (loadingMore || loading || !hasMore) return
    void fetchPage(generations.length)
  }, [fetchPage, generations.length, hasMore, loading, loadingMore])

  const retry = React.useCallback(() => void fetchPage(0), [fetchPage])

  const remove = React.useCallback((id: string) => {
    setGenerations((current) => current.filter((row) => row.id !== id))
  }, [])

  const patch = React.useCallback((id: string, changes: Partial<GenerationWithAssets>) => {
    setGenerations((current) => current.map((row) => (row.id === id ? { ...row, ...changes } : row)))
  }, [])

  /**
   * A job that is still running when the page loads has to finish somewhere.
   *
   * The composer's feed has Realtime; these surfaces do not, so they drive the
   * same `/sync` endpoint the ticker uses on /create — otherwise a shot opened
   * from a project page would spin until the reader reloaded it. Only rows
   * already on screen are merged, so a sync cannot smuggle in a row the
   * current filter excludes.
   */
  const activeCount = React.useMemo(
    () => generations.filter((row) => !isTerminal(row.status)).length,
    [generations],
  )

  const advance = React.useCallback(async () => {
    const response = await fetch('/api/generations/sync', { method: 'POST' })
    if (!response.ok) return

    const data = (await response.json()) as { generations?: GenerationWithAssets[] }
    const advanced = data.generations ?? []
    if (advanced.length === 0) return

    setGenerations((current) => {
      const byId = new Map(advanced.map((row) => [row.id, row]))
      return current.map((row) => {
        const next = byId.get(row.id)
        if (!next) return row
        // Never let a payload without media blank out media we already have.
        return { ...next, assets: next.assets.length > 0 ? next.assets : row.assets }
      })
    })
  }, [])

  useJobTicker(activeCount > 0, advance)

  return {
    generations,
    filters,
    setFilters,
    clearFilters,
    filtered: hasActiveFilters(filters),
    loading,
    loadingMore,
    hasMore,
    loadMore,
    error,
    retry,
    remove,
    patch,
    activeCount,
  }
}

/** Guards against a row arriving twice when a page boundary shifts. */
function dedupe(rows: GenerationWithAssets[]): GenerationWithAssets[] {
  const seen = new Map<string, GenerationWithAssets>()
  for (const row of rows) seen.set(row.id, row)
  return [...seen.values()]
}
