'use client'

import * as React from 'react'
import { toast } from 'sonner'

import { toggleLikeAction } from '@/app/(studio)/explore/actions'
import type { ExploreItem, ExploreSort } from '@/lib/explore'

/**
 * The public feed on the client.
 *
 * Sorting and paging go back to `/api/explore` so a sort reaches past the
 * page already loaded. Likes are the opposite: they resolve locally first and
 * only reconcile with the server's count afterwards, because a heart that
 * waits on a round trip feels broken however fast the round trip is.
 */

interface Options {
  initial: ExploreItem[]
  pageSize: number
  initialSort?: ExploreSort
}

export interface ExploreFeed {
  items: ExploreItem[]
  sort: ExploreSort
  setSort: (sort: ExploreSort) => void
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  loadMore: () => void
  error: string | null
  retry: () => void
  like: (item: ExploreItem) => void
}

export function useExploreFeed({ initial, pageSize, initialSort = 'new' }: Options): ExploreFeed {
  const [items, setItems] = React.useState(initial)
  const [sort, setSortState] = React.useState<ExploreSort>(initialSort)
  const [loading, setLoading] = React.useState(false)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [hasMore, setHasMore] = React.useState(initial.length === pageSize)
  const [error, setError] = React.useState<string | null>(null)

  /** Only the newest request may write to state; late replies are dropped. */
  const requestRef = React.useRef(0)
  /** Skips the fetch that would duplicate the server-rendered first page. */
  const primedRef = React.useRef(true)
  /** Likes in flight, so a double-click cannot queue two opposite toggles. */
  const pendingRef = React.useRef(new Set<string>())

  const fetchPage = React.useCallback(
    async (offset: number) => {
      const ticket = ++requestRef.current
      if (offset === 0) setLoading(true)
      else setLoadingMore(true)
      setError(null)

      try {
        const params = new URLSearchParams({ sort, limit: String(pageSize) })
        if (offset > 0) params.set('offset', String(offset))

        const response = await fetch(`/api/explore?${params.toString()}`)
        if (!response.ok) throw new Error('Could not load the feed.')

        const data = (await response.json()) as {
          generations?: ExploreItem[]
          hasMore?: boolean
        }

        if (ticket !== requestRef.current) return

        const rows = data.generations ?? []
        setItems((current) => (offset === 0 ? rows : dedupe([...current, ...rows])))
        setHasMore(data.hasMore ?? rows.length === pageSize)
      } catch (cause) {
        if (ticket !== requestRef.current) return
        setError(cause instanceof Error ? cause.message : 'Could not load the feed.')
      } finally {
        if (ticket === requestRef.current) {
          setLoading(false)
          setLoadingMore(false)
        }
      }
    },
    [sort, pageSize],
  )

  React.useEffect(() => {
    if (primedRef.current) {
      primedRef.current = false
      return
    }
    void fetchPage(0)
  }, [fetchPage])

  const setSort = React.useCallback((next: ExploreSort) => setSortState(next), [])

  const loadMore = React.useCallback(() => {
    if (loading || loadingMore || !hasMore) return
    void fetchPage(items.length)
  }, [fetchPage, items.length, hasMore, loading, loadingMore])

  const retry = React.useCallback(() => void fetchPage(0), [fetchPage])

  const apply = React.useCallback((id: string, changes: Partial<ExploreItem>) => {
    setItems((current) => current.map((row) => (row.id === id ? { ...row, ...changes } : row)))
  }, [])

  const like = React.useCallback(
    (item: ExploreItem) => {
      if (pendingRef.current.has(item.id)) return
      pendingRef.current.add(item.id)

      const optimistic = {
        liked: !item.liked,
        like_count: Math.max(0, item.like_count + (item.liked ? -1 : 1)),
      }
      apply(item.id, optimistic)

      void (async () => {
        try {
          const result = await toggleLikeAction(item.id)

          if (!result.ok) {
            // Put it back exactly as it was, then say why.
            apply(item.id, { liked: item.liked, like_count: item.like_count })
            toast.error(result.error)
            return
          }

          // The server's count, not ours: other people were clicking too.
          apply(item.id, { liked: result.data.liked, like_count: result.data.likeCount })
        } catch {
          apply(item.id, { liked: item.liked, like_count: item.like_count })
          toast.error('Could not reach the server. Check your connection.')
        } finally {
          pendingRef.current.delete(item.id)
        }
      })()
    },
    [apply],
  )

  return { items, sort, setSort, loading, loadingMore, hasMore, loadMore, error, retry, like }
}

/** Guards against a row arriving twice when a page boundary shifts. */
function dedupe(rows: ExploreItem[]): ExploreItem[] {
  const seen = new Map<string, ExploreItem>()
  for (const row of rows) seen.set(row.id, row)
  return [...seen.values()]
}
