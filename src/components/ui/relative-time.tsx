'use client'

import * as React from 'react'

import { formatRelativeTime } from '@/lib/utils'

/**
 * A timestamp like "2m ago".
 *
 * Two things this has to get right, both of which a bare
 * `{formatRelativeTime(x)}` gets wrong:
 *
 *  - the server renders "2m ago" and the browser hydrates a moment later,
 *    when the honest answer is "3m ago". That is a genuine hydration
 *    mismatch, so the difference is declared rather than discovered.
 *  - a card that is never re-rendered would say "just now" forever, so it
 *    re-reads the clock every minute, which is the finest granularity the
 *    formatter has.
 */
export function RelativeTime({ value, className }: { value: string; className?: string }) {
  const [, tick] = React.useReducer((count: number) => count + 1, 0)

  React.useEffect(() => {
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [])

  const date = new Date(value)

  return (
    <time
      dateTime={date.toISOString()}
      title={date.toLocaleString()}
      suppressHydrationWarning
      className={className}
    >
      {formatRelativeTime(date)}
    </time>
  )
}
