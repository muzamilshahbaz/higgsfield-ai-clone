import { CheckCircle2, Receipt, XCircle } from 'lucide-react'

import { EmptyState } from '@/components/studio/empty-state'
import { Badge } from '@/components/ui/badge'
import { RelativeTime } from '@/components/ui/relative-time'
import type { PaymentTransactionRow } from '@/types/database'

/**
 * Billing history.
 *
 * Shows failed attempts alongside successful ones, on purpose. A history that
 * only lists what worked is the one people distrust — somebody whose card was
 * declined wants to see that it was declined, not an unexplained gap.
 *
 * Amounts are rendered from integer pence. Money is never a float here.
 */

function money(pence: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(pence / 100)
}

export function TransactionHistory({ transactions }: { transactions: PaymentTransactionRow[] }) {
  if (transactions.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="No payments yet"
        description="Invoices and receipts appear here once you subscribe to a paid plan."
      />
    )
  }

  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[32rem] border-collapse text-sm">
        <caption className="sr-only">Your payment history, newest first</caption>
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th scope="col" className="py-2.5 pr-4 font-medium">
              Payment
            </th>
            <th scope="col" className="px-4 py-2.5 font-medium">
              Card
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              Amount
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              When
            </th>
          </tr>
        </thead>

        <tbody>
          {transactions.map((tx) => {
            const failed = tx.status === 'failed'

            return (
              <tr key={tx.id} className="border-b border-border/60 last:border-0">
                <td className="py-3 pr-4">
                  <div className="flex items-start gap-2.5">
                    {failed ? (
                      <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                    ) : (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-medium">{tx.description}</p>
                      {tx.reference && (
                        <p className="truncate font-mono text-[11px] text-muted-foreground">
                          {tx.reference}
                        </p>
                      )}
                    </div>
                  </div>
                </td>

                <td className="px-4 py-3 text-muted-foreground">
                  {tx.card_last4 ? (
                    <span className="tabular-nums">
                      {tx.card_brand ?? 'Card'} •••• {tx.card_last4}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/60">—</span>
                  )}
                </td>

                <td className="px-4 py-3 text-right tabular-nums">
                  {money(tx.amount_pence, tx.currency)}
                  {failed && (
                    <Badge variant="destructive" className="ml-2">
                      Failed
                    </Badge>
                  )}
                </td>

                <td className="px-4 py-3 text-right text-muted-foreground">
                  <RelativeTime value={tx.created_at} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
