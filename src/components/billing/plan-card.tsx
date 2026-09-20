import { Check } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Plan, PlanId } from '@/lib/plans'
import { cn } from '@/lib/utils'

/**
 * One pricing card.
 *
 * Shared by the marketing pricing section and the in-app plan picker, so the
 * two cannot drift. It renders a `Plan` and knows nothing about where the
 * numbers came from — adding a tier is a change to the catalogue, not to this.
 *
 * `action` is a render prop rather than a set of props describing a button,
 * because the two callers want genuinely different things: marketing wants a
 * link to sign up, the billing page wants a button that opens checkout.
 */

interface PlanCardProps {
  plan: Plan
  /** Highlights the card the viewer is currently on. */
  currentPlanId?: PlanId
  action: React.ReactNode
  className?: string
}

export function PlanCard({ plan, currentPlanId, action, className }: PlanCardProps) {
  const isCurrent = currentPlanId === plan.id

  return (
    <div
      className={cn(
        'relative flex h-full flex-col rounded-2xl border bg-card p-6 transition-colors',
        plan.featured && !isCurrent && 'border-primary/50 shadow-xl shadow-primary/10',
        isCurrent ? 'border-brand/60' : !plan.featured && 'border-border',
        className,
      )}
    >
      {isCurrent ? (
        <Badge variant="outline" className="absolute -top-2.5 left-6 bg-card">
          Current plan
        </Badge>
      ) : plan.featured ? (
        <Badge className="absolute -top-2.5 left-6">Most popular</Badge>
      ) : null}

      <h3 className="text-sm font-medium text-muted-foreground">{plan.name}</h3>

      <p className="mt-3 flex items-baseline gap-1.5">
        <span className="text-4xl font-semibold tracking-tight">£{plan.priceGbp}</span>
        <span className="text-sm text-muted-foreground">{plan.cadence}</span>
      </p>

      <p className="mt-1.5 text-sm tabular-nums text-credit">
        {plan.credits.toLocaleString()} credits
        {plan.priceGbp > 0 ? ' a month' : ' at signup'}
      </p>

      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{plan.tagline}</p>

      <ul className="mt-5 flex-1 space-y-2.5">
        {plan.perks.map((perk) => (
          <li key={perk} className="flex gap-2.5 text-sm">
            <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            <span className="text-muted-foreground">{perk}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6">{action}</div>
    </div>
  )
}

/** The disabled "you are here" button, so callers do not each invent one. */
export function CurrentPlanButton() {
  return (
    <Button variant="outline" className="w-full" disabled>
      Current plan
    </Button>
  )
}
