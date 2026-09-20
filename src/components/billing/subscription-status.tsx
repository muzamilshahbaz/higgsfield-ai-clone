import { CalendarClock, Coins, Gauge } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import type { Plan } from '@/lib/plans'
import type { SubscriptionRow } from '@/types/database'

/**
 * The "where you stand" card at the top of the billing page.
 *
 * A server component: every value on it is decided on the server, and there is
 * nothing here to interact with. The badge wording is deliberately specific —
 * "Ending 4 March" rather than "Cancelled", because a plan that is still
 * working is not cancelled yet and telling someone it is invites a support
 * message.
 */

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function SubscriptionStatus({
  plan,
  subscription,
  credits,
}: {
  plan: Plan
  subscription: SubscriptionRow | null
  credits: number
}) {
  const ending = subscription?.cancel_at_period_end ?? false
  const renewal = formatDate(subscription?.current_period_end)
  const isPaid = plan.priceGbp > 0

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-medium">{plan.name}</h2>
            <StatusBadge ending={ending} isPaid={isPaid} status={subscription?.status} />
          </div>

          <p className="mt-1.5 text-sm text-muted-foreground">
            {isPaid
              ? `£${plan.priceGbp} ${plan.cadence}`
              : 'No card required — the credits you got at signup.'}
          </p>
        </div>
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat
          icon={<Coins className="size-4 text-credit" aria-hidden />}
          label="Credits remaining"
          value={credits.toLocaleString()}
        />
        <Stat
          icon={<Gauge className="size-4 text-brand" aria-hidden />}
          label="Concurrent renders"
          value={String(plan.maxConcurrentJobs)}
        />
        <Stat
          icon={<CalendarClock className="size-4 text-muted-foreground" aria-hidden />}
          label={ending ? 'Ends on' : isPaid ? 'Renews on' : 'Billing'}
          value={isPaid ? (renewal ?? '—') : 'Not billed'}
        />
      </dl>
    </Card>
  )
}

function StatusBadge({
  ending,
  isPaid,
  status,
}: {
  ending: boolean
  isPaid: boolean
  status?: string
}) {
  if (ending) return <Badge variant="outline">Ending soon</Badge>
  if (status === 'past_due') return <Badge variant="destructive">Payment failed</Badge>
  if (!isPaid) return <Badge variant="secondary">Free plan</Badge>
  return <Badge>Active</Badge>
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-surface/40 p-4">
      <dt className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="mt-1.5 text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  )
}
