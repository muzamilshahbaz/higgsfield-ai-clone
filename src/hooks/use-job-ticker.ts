'use client'

import { useEffect, useRef } from 'react'

import { LIMITS } from '@/lib/constants'

/**
 * Drives a callback on an interval while `active` is true.
 *
 * There is no long-running worker on Vercel, so this is what actually advances
 * jobs while the tab is open. Two rules keep it honest:
 *
 *  - ticks never overlap; a slow sync delays the next tick rather than
 *    stacking requests on top of it
 *  - the interval stops the moment nothing is in flight, so an idle tab makes
 *    no requests at all
 */
export function useJobTicker(active: boolean, onTick: () => Promise<void> | void) {
  const callbackRef = useRef(onTick)
  callbackRef.current = onTick

  const runningRef = useRef(false)

  useEffect(() => {
    if (!active) return

    let cancelled = false

    const tick = async () => {
      if (runningRef.current || cancelled) return
      runningRef.current = true
      try {
        await callbackRef.current()
      } catch (cause) {
        // A failed tick is not worth a toast: the next one is three seconds away.
        console.error('[job-ticker] tick failed:', cause)
      } finally {
        runningRef.current = false
      }
    }

    const id = setInterval(tick, LIMITS.tickerIntervalMs)

    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [active])
}
