import Link from 'next/link'
import { ArrowDownLeft, ArrowUpRight, Gift, Wrench } from 'lucide-react'

import { EmptyState } from '@/components/studio/empty-state'
import { Button } from '@/components/ui/button'
import { RelativeTime } from '@/components/ui/relative-time'
import { cn } from '@/lib/utils'
import type { CreditLedgerRow, CreditReason } from '@/types/database'

/**
 * The credit ledger.
 *
 * Append-only and rendered as written: every row shows the balance the
 * database recorded after that movement, so the arithmetic on screen is the
 * arithmetic in Postgres rather than a running total computed here.
 *
 * A server component with a link-driven "show more" rather than a client
 * fetcher — this is a static list that only grows at the top, and a page of it
 * costs one query.
 */

const REASON_LABELS: Record<CreditReason, string> = {
  signup_grant: 'Welcome grant',
  generation_debit: 'Generation',
  generation_refund: 'Refund',
  admin_adjust: 'Adjustment',
  promo: 'Promo credit',
}

const REASON_ICONS: Record<CreditReason, typeof Gift> = {
  signup_grant: Gift,
  generation_debit: ArrowUpRight,
  generation_refund: ArrowDownLeft,
  admin_adjust: Wrench,
  promo: Gift,
}

export function LedgerTable({
  entries,
  total,
  shown,
  step,
}: {
  entries: CreditLedgerRow[]
  total: number
  /** How many rows this render asked for. */
  shown: number
  step: number
}) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={ArrowUpRight}
        title="No credit movements yet"
        description="Your welcome grant and every generation you run will be listed here."
      />
    )
  }

  const hasMore = total > entries.length

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Your credit ledger, newest first, with the balance after each movement.
          </caption>
          <thead>
            <tr className="border-b border-border bg-surface/60 text-left">
              <th scope="col" className="px-3 py-2.5 text-xs font-medium text-muted-foreground">
                Movement
              </th>
              <th
                scope="col"
                className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground"
              >
                Change
              </th>
              <th
                scope="col"
                className="hidden px-3 py-2.5 text-right text-xs font-medium text-muted-foreground sm:table-cell"
              >
                Balance
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
            {entries.map((entry) => {
              const Icon = REASON_ICONS[entry.reason]
              const positive = entry.delta > 0

              return (
                <tr key={entry.id} className="border-b border-border/60 last:border-0">
                  <th scope="row" className="px-3 py-2.5 text-left font-normal">
                    <span className="flex items-center gap-2.5">
                      <span
                        className={cn(
                          'flex size-7 shrink-0 items-center justify-center rounded-lg border border-border',
                          positive ? 'text-success' : 'text-muted-foreground',
                        )}
                      >
                        <Icon className="size-3.5" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm">{REASON_LABELS[entry.reason]}</span>
                        {entry.note && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {entry.note}
                          </span>
                        )}
                      </span>
                    </span>
                  </th>

                  <td
                    className={cn(
                      'px-3 py-2.5 text-right text-sm tabular-nums',
                      positive ? 'text-success' : 'text-foreground/80',
                    )}
                  >
                    {positive ? '+' : ''}
                    {entry.delta}
                  </td>

                  <td className="hidden px-3 py-2.5 text-right text-sm tabular-nums text-muted-foreground sm:table-cell">
                    {entry.balance_after}
                  </td>

                  <td className="px-3 py-2.5 text-right">
                    <RelativeTime
                      value={entry.created_at}
                      className="text-xs text-muted-foreground"
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground tabular-nums">
          Showing {entries.length} of {total}
        </p>

        {hasMore && (
          <Button asChild variant="outline" size="sm">
            {/* A link, not a fetch: the page re-renders with a bigger window
                and the URL keeps the reader's place on a refresh. */}
            <Link href={`/settings?ledger=${shown + step}#ledger`} scroll={false}>
              Show more
            </Link>
          </Button>
        )}
      </div>
    </div>
  )
}
