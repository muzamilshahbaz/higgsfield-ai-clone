'use client'

import * as React from 'react'
import { toast } from 'sonner'

import { toggleFavouriteAction, toggleLikeAction } from '@/app/explore/actions'
import type { ExploreItem, ExploreSort } from '@/lib/explore'

/**
 * The public feed on the client.
 *
 * Sorting, filtering, searching and paging all go back to `/api/explore` so
 * they reach past the page already loaded rather than hiding rows that are
 * already on screen. Engagement is the opposite: likes and favourites resolve
 * locally first and only reconcile with the server's count afterwards, because
 * a heart that waits on a round trip feels broken however fast the round trip
 * is.
 */

interface Options {
  initial: ExploreItem[]
  pageSize: number
  initialSort?: ExploreSort
  initialCategory?: string
  initialSearch?: string
  /**
   * Where the rows come from.
   *
   * `/api/favourites` returns the same shape and takes the same paging
   * parameters, which lets the Favourites page reuse this hook — including its
   * optimistic engagement — instead of growing a second copy that drifts.
   */
  endpoint?: string
  /** Filters/search are meaningless on a favourites list, so it opts out. */
  serverFiltering?: boolean
}

export interface ExploreFeed {
  items: ExploreItem[]
  sort: ExploreSort
  setSort: (sort: ExploreSort) => void
  category: string
  setCategory: (category: string) => void
  search: string
  setSearch: (search: string) => void
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  loadMore: () => void
  error: string | null
  retry: () => void
  filtered: boolean
  clearFilters: () => void
  like: (item: ExploreItem) => void
  favourite: (item: ExploreItem) => void
  noteDownload: (item: ExploreItem, count: number) => void
  noteComments: (item: ExploreItem, delta: number) => void
  /** Drops a row without a refetch — used when a favourite is removed. */
  remove: (id: string) => void
  /** Puts a removed row back where it was, when the write that removed it failed. */
  insert: (item: ExploreItem, index: number) => void
  /** Where a row currently sits, captured before an optimistic removal. */
  indexOf: (id: string) => number
  /**
   * Tracks a row that is not in the feed.
   *
   * The detail dialog can open a related shot from a different category, or
   * from further down than has been paged in. Adopting it means a like
   * registered on it lands in the same state as a like on a card — optimistic
   * update, server reconcile and rollback included — instead of needing a
   * second copy of that logic that only the dialog uses.
   */
  adopt: (item: ExploreItem) => void
  /** The current version of a row, whether it is in the feed or adopted. */
  getById: (id: string | null) => ExploreItem | null
}

/** How long the feed waits after the last keystroke before it queries. */
const SEARCH_DEBOUNCE_MS = 350

export function useExploreFeed({
  initial,
  pageSize,
  initialSort = 'new',
  initialCategory = 'all',
  initialSearch = '',
  endpoint = '/api/explore',
  serverFiltering = true,
}: Options): ExploreFeed {
  const [items, setItems] = React.useState(initial)
  /** Rows opened from the dialog that the feed itself does not hold. */
  const [extras, setExtras] = React.useState<Record<string, ExploreItem>>({})
  const [sort, setSortState] = React.useState<ExploreSort>(initialSort)
  const [category, setCategoryState] = React.useState(initialCategory)
  const [search, setSearchState] = React.useState(initialSearch)
  const [debouncedSearch, setDebouncedSearch] = React.useState(initialSearch)
  const [loading, setLoading] = React.useState(false)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [hasMore, setHasMore] = React.useState(initial.length === pageSize)
  const [error, setError] = React.useState<string | null>(null)

  /** Only the newest request may write to state; late replies are dropped. */
  const requestRef = React.useRef(0)
  /** Skips the fetch that would duplicate the server-rendered first page. */
  const primedRef = React.useRef(true)
  /** Toggles in flight, so a double-click cannot queue two opposite writes. */
  const pendingRef = React.useRef(new Set<string>())

  // A query per keystroke would be one round trip per letter of "cinematic".
  React.useEffect(() => {
    if (search === debouncedSearch) return

    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [search, debouncedSearch])

  const fetchPage = React.useCallback(
    async (offset: number) => {
      const ticket = ++requestRef.current
      if (offset === 0) setLoading(true)
      else setLoadingMore(true)
      setError(null)

      try {
        const params = new URLSearchParams({ limit: String(pageSize) })
        if (offset > 0) params.set('offset', String(offset))

        if (serverFiltering) {
          params.set('sort', sort)
          if (category && category !== 'all') params.set('category', category)
          if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim())
        }

        const response = await fetch(`${endpoint}?${params.toString()}`)
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
    [sort, category, debouncedSearch, pageSize, endpoint, serverFiltering],
  )

  React.useEffect(() => {
    if (primedRef.current) {
      primedRef.current = false
      return
    }
    void fetchPage(0)
  }, [fetchPage])

  const setSort = React.useCallback((next: ExploreSort) => setSortState(next), [])
  const setCategory = React.useCallback((next: string) => setCategoryState(next), [])
  const setSearch = React.useCallback((next: string) => setSearchState(next), [])

  const filtered = category !== 'all' || debouncedSearch.trim().length > 0

  const clearFilters = React.useCallback(() => {
    setCategoryState('all')
    setSearchState('')
    setDebouncedSearch('')
  }, [])

  const loadMore = React.useCallback(() => {
    if (loading || loadingMore || !hasMore) return
    void fetchPage(items.length)
  }, [fetchPage, items.length, hasMore, loading, loadingMore])

  const retry = React.useCallback(() => void fetchPage(0), [fetchPage])

  const apply = React.useCallback((id: string, changes: Partial<ExploreItem>) => {
    setItems((current) => current.map((row) => (row.id === id ? { ...row, ...changes } : row)))
    setExtras((current) =>
      current[id] ? { ...current, [id]: { ...current[id]!, ...changes } } : current,
    )
  }, [])

  const adopt = React.useCallback((item: ExploreItem) => {
    setExtras((current) => (current[item.id] ? current : { ...current, [item.id]: item }))
  }, [])

  /** The feed's copy wins: it is the one a refetch keeps current. */
  const getById = React.useCallback(
    (id: string | null) => {
      if (!id) return null
      return items.find((row) => row.id === id) ?? extras[id] ?? null
    },
    [items, extras],
  )

  const remove = React.useCallback((id: string) => {
    setItems((current) => current.filter((row) => row.id !== id))
  }, [])

  const insert = React.useCallback((item: ExploreItem, index: number) => {
    setItems((current) => {
      if (current.some((row) => row.id === item.id)) return current
      const next = [...current]
      next.splice(Math.max(0, Math.min(index, next.length)), 0, item)
      return next
    })
  }, [])

  const indexOf = React.useCallback(
    (id: string) => items.findIndex((row) => row.id === id),
    [items],
  )

  /**
   * The shared body of "like" and "favourite".
   *
   * The two differ only in which action they call and which two fields they
   * move, and writing them twice is how one of them ends up without the
   * in-flight guard or without the rollback.
   */
  const toggle = React.useCallback(
    (
      item: ExploreItem,
      key: string,
      optimistic: Partial<ExploreItem>,
      previous: Partial<ExploreItem>,
      run: () => Promise<
        { ok: true; data: Partial<ExploreItem> } | { ok: false; error: string }
      >,
    ) => {
      if (pendingRef.current.has(key)) return
      pendingRef.current.add(key)

      apply(item.id, optimistic)

      void (async () => {
        try {
          const result = await run()

          if (!result.ok) {
            // Put it back exactly as it was, then say why.
            apply(item.id, previous)
            toast.error(result.error)
            return
          }

          // The server's count, not ours: other people were clicking too.
          apply(item.id, result.data)
        } catch {
          apply(item.id, previous)
          toast.error('Could not reach the server. Check your connection.')
        } finally {
          pendingRef.current.delete(key)
        }
      })()
    },
    [apply],
  )

  const like = React.useCallback(
    (item: ExploreItem) => {
      toggle(
        item,
        `like:${item.id}`,
        { liked: !item.liked, like_count: Math.max(0, item.like_count + (item.liked ? -1 : 1)) },
        { liked: item.liked, like_count: item.like_count },
        async () => {
          const result = await toggleLikeAction(item.id)
          return result.ok
            ? { ok: true, data: { liked: result.data.liked, like_count: result.data.likeCount } }
            : result
        },
      )
    },
    [toggle],
  )

  const favourite = React.useCallback(
    (item: ExploreItem) => {
      toggle(
        item,
        `fav:${item.id}`,
        {
          favourited: !item.favourited,
          favourite_count: Math.max(0, item.favourite_count + (item.favourited ? -1 : 1)),
        },
        { favourited: item.favourited, favourite_count: item.favourite_count },
        async () => {
          const result = await toggleFavouriteAction(item.id)
          return result.ok
            ? {
                ok: true,
                data: {
                  favourited: result.data.favourited,
                  favourite_count: result.data.favouriteCount,
                },
              }
            : result
        },
      )
    },
    [toggle],
  )

  const noteDownload = React.useCallback(
    (item: ExploreItem, count: number) => apply(item.id, { download_count: count }),
    [apply],
  )

  const noteComments = React.useCallback(
    (item: ExploreItem, delta: number) =>
      apply(item.id, { comment_count: Math.max(0, item.comment_count + delta) }),
    [apply],
  )

  return {
    items,
    sort,
    setSort,
    category,
    setCategory,
    search,
    setSearch,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    error,
    retry,
    filtered,
    clearFilters,
    like,
    favourite,
    noteDownload,
    noteComments,
    remove,
    insert,
    indexOf,
    adopt,
    getById,
  }
}

/** Guards against a row arriving twice when a page boundary shifts. */
function dedupe(rows: ExploreItem[]): ExploreItem[] {
  const seen = new Map<string, ExploreItem>()
  for (const row of rows) seen.set(row.id, row)
  return [...seen.values()]
}
