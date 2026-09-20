import Link from 'next/link'
import { Coins } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Live credit balance in the topbar.
 *
 * Turns amber then red as the balance approaches zero, so running out is never
 * a surprise at the moment of pressing Generate.
 */
export function CreditPill({ credits, className }: { credits: number; className?: string }) {
  const tone =
    credits <= 0
      ? 'border-destructive/40 bg-destructive/10 text-danger'
      : credits < 40
        ? 'border-warning/40 bg-warning/10 text-warning'
        : 'border-border bg-surface text-foreground'

  return (
    <Link
      href="/settings"
      title={
        credits <= 0
          ? 'You are out of credits'
          : `${credits.toLocaleString()} credits remaining`
      }
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium tabular-nums transition-colors',
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
