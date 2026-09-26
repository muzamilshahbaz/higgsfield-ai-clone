import Link from 'next/link'
import { Coins } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Live credit balance in the topbar.
 *
 * Turns amber then red as the balance approaches zero, so running out is never
 * a surprise at the moment of pressing Generate. The three tones use `credit`,
 * `warning` and `danger` — the ink half of each pair, because this is type on a
 * tinted chip rather than a fill.
 *
 * Links to billing rather than settings: someone who clicks a balance is
 * usually about to top it up.
 */
export function CreditPill({ credits, className }: { credits: number; className?: string }) {
  const tone =
    credits <= 0
      ? 'border-destructive/40 bg-destructive/10 text-danger'
      : credits < 40
        ? 'border-warning/40 bg-warning/10 text-warning'
        : 'border-border bg-surface-2/60 text-credit'

  return (
    <Link
      href="/settings/billing"
      title={
        credits <= 0
          ? 'You are out of credits'
          : `${credits.toLocaleString()} ${credits === 1 ? 'credit' : 'credits'} remaining`
      }
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium tabular-nums transition-colors hover:border-muted',
        tone,
        className,
      )}
    >
      <Coins className="size-3.5" aria-hidden />
      {credits.toLocaleString()}
      <span className="sr-only"> credits remaining</span>
    </Link>
  )
}
