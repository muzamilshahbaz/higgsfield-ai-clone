'use client'

import { useRouter } from 'next/navigation'
import * as React from 'react'

import { useJobTicker } from '@/hooks/use-job-ticker'
import { createClient } from '@/lib/supabase/client'
import { isTerminal, type GenerationRow, type GenerationWithAssets } from '@/types/database'

/**
 * The live job feed.
 *
 * Three things keep a card honest, in order of how fast they are:
 *
 *  1. an optimistic insert the moment the composer's POST returns
 *  2. a Supabase Realtime subscription on this user's generations, so every
 *     status write made by the server reaches the browser without polling
 *  3. the ticker, which POSTs /sync while anything is in flight — this is what
 *     actually advances the job, since Realtime only reports writes that
 *     something else already made
 *
 * Realtime is the nice-to-have and the ticker is the guarantee: if the
 * websocket never connects, the feed still fills in on the next tick.
 */

interface GenerationFeedValue {
  generations: GenerationWithAssets[]
  /** Jobs still queued or running. */
  activeCount: number
  /** True while a /sync round trip is in flight. */
  syncing: boolean
  upsert: (rows: GenerationWithAssets[]) => void
  sync: () => Promise<void>
}

const GenerationFeedContext = React.createContext<GenerationFeedValue | null>(null)

export function useGenerationFeed(): GenerationFeedValue {
  const value = React.useContext(GenerationFeedContext)
  if (!value) {
    throw new Error('useGenerationFeed must be used inside <GenerationFeedProvider>')
  }
  return value
}

function byNewest(a: GenerationWithAssets, b: GenerationWithAssets) {
  return b.created_at.localeCompare(a.created_at)
}

export function GenerationFeedProvider({
  userId,
  initialGenerations,
  children,
}: {
  userId: string
  initialGenerations: GenerationWithAssets[]
  children: React.ReactNode
}) {
  const router = useRouter()
  const [generations, setGenerations] = React.useState<GenerationWithAssets[]>(initialGenerations)
  const [syncing, setSyncing] = React.useState(false)

  /** Ids we have already counted as finished, so one job refreshes once. */
  const settledRef = React.useRef(new Set(initialGenerations.filter((g) => isTerminal(g.status)).map((g) => g.id)))

  // A finished job changes the credit balance and the dashboard counts, both of
  // which are server-rendered. Refresh once per job rather than once per event.
  const noteSettled = React.useCallback(
    (rows: Pick<GenerationWithAssets, 'id' | 'status'>[]) => {
      const fresh = rows.filter((row) => isTerminal(row.status) && !settledRef.current.has(row.id))
      if (fresh.length === 0) return
      for (const row of fresh) settledRef.current.add(row.id)
      router.refresh()
    },
    [router],
  )

  const upsert = React.useCallback(
    (incoming: GenerationWithAssets[]) => {
      if (incoming.length === 0) return

      setGenerations((current) => {
        const next = new Map(current.map((row) => [row.id, row]))
        for (const row of incoming) {
          const previous = next.get(row.id)
          next.set(row.id, {
            ...row,
            // A realtime payload carries no assets; never let it blank out
            // media we have already loaded.
            assets: row.assets.length > 0 ? row.assets : (previous?.assets ?? []),
          })
        }
        return [...next.values()].sort(byNewest)
      })

      noteSettled(incoming)
    },
    [noteSettled],
  )

  const sync = React.useCallback(async () => {
    setSyncing(true)
    try {
      const response = await fetch('/api/generations/sync', { method: 'POST' })
      if (!response.ok) return
      const data = (await response.json()) as { generations?: GenerationWithAssets[] }
      upsert(data.generations ?? [])
    } finally {
      setSyncing(false)
    }
  }, [upsert])

  /** Pulls one row back with its media, after Realtime says it finished. */
  const refetch = React.useCallback(
    async (id: string) => {
      try {
        const response = await fetch(`/api/generations/${id}`)
        if (!response.ok) return
        const data = (await response.json()) as { generation?: GenerationWithAssets }
        if (data.generation) upsert([data.generation])
      } catch {
        // The ticker will pick it up.
      }
    },
    [upsert],
  )

  const activeCount = React.useMemo(
    () => generations.filter((row) => !isTerminal(row.status)).length,
    [generations],
  )

  // The opportunistic sweep: a job whose tab was closed mid-render heals here,
  // on the next page load, without waiting for the daily cron.
  React.useEffect(() => {
    void sync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useJobTicker(activeCount > 0, sync)

  // Realtime.
  //
  // The token has to reach the realtime socket BEFORE subscribing: the
  // `generations` policies are checked per subscription, and an anonymous
  // socket is simply refused — quietly, with no throw and no event. Reading
  // the session first is what makes this work at all.
  //
  // Wrapped because a missing Supabase config throws in createClient, and a
  // feed that polls is far better than a page that crashes.
  React.useEffect(() => {
    let cancelled = false
    let supabase: ReturnType<typeof createClient> | null = null
    let channel: ReturnType<ReturnType<typeof createClient>['channel']> | null = null

    async function connect() {
      try {
        supabase = createClient()

        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (cancelled) return
        if (!session) return // the ticker still covers us

        supabase.realtime.setAuth(session.access_token)

        channel = supabase
          .channel(`generations:${userId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'generations',
              filter: `user_id=eq.${userId}`,
            },
            (payload) => {
              const row = payload.new as GenerationRow | null
              if (!row?.id) return
              if (row.deleted_at) {
                setGenerations((current) => current.filter((item) => item.id !== row.id))
                return
              }

              upsert([{ ...row, assets: [] }])
              if (row.status === 'succeeded') void refetch(row.id)
            },
          )
          .subscribe((status) => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              console.warn(`[generation-feed] realtime ${status}; the ticker is carrying the feed.`)
            }
          })
      } catch (cause) {
        console.warn('[generation-feed] realtime unavailable, falling back to polling:', cause)
      }
    }

    void connect()

    return () => {
      cancelled = true
      if (supabase && channel) supabase.removeChannel(channel)
    }
  }, [userId, upsert, refetch])

  const value = React.useMemo<GenerationFeedValue>(
    () => ({ generations, activeCount, syncing, upsert, sync }),
    [generations, activeCount, syncing, upsert, sync],
  )

  return <GenerationFeedContext.Provider value={value}>{children}</GenerationFeedContext.Provider>
}
