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
 *
 * The featured tier is marked with a 2px cyan bar across the top edge and a
 * ring, not by being scaled up. A card that is physically larger than its
 * neighbours breaks the price column's alignment, which is the one thing a
 * reader is using the layout for.
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
  const highlighted = plan.featured && !isCurrent

  return (
    <div
      className={cn(
        'panel relative flex h-full flex-col overflow-hidden rounded-2xl p-6 pt-7',
        highlighted && 'ring-1 ring-primary/40',
        isCurrent && 'ring-1 ring-brand/50',
        className,
      )}
    >
      {/* The tier marker: a bar on the top edge, over the panel's own hairline. */}
      {(highlighted || isCurrent) && (
        <span
          className={cn(
            'absolute inset-x-0 top-0 z-10 h-[2px]',
            highlighted ? 'bg-primary' : 'bg-brand/60',
          )}
          aria-hidden
        />
      )}

      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-base font-medium">{plan.name}</h3>
        {isCurrent ? (
          <Badge variant="outline">Current plan</Badge>
        ) : plan.featured ? (
          <Badge>Most popular</Badge>
        ) : null}
      </div>

      <p className="mt-5 flex items-baseline gap-1.5">
        <span className="font-display text-[2.75rem] font-semibold leading-none tracking-tight tabular-nums">
          ${plan.priceUsd}
        </span>
        <span className="text-sm text-muted-foreground">{plan.cadence}</span>
      </p>

      <p className="mt-3 inline-flex w-fit items-center rounded-md bg-credit/10 px-2 py-1 text-xs font-medium tabular-nums text-credit">
        {plan.credits.toLocaleString()} credits
        {plan.priceUsd > 0 ? ' a month' : ' at signup'}
      </p>

      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{plan.tagline}</p>

      <ul className="mt-6 flex-1 space-y-3 border-t border-border pt-6">
        {plan.perks.map((perk) => (
          <li key={perk} className="flex gap-3 text-sm">
            <span
              className="mt-px flex size-4 shrink-0 items-center justify-center rounded-[4px] bg-primary/15"
              aria-hidden
            >
              <Check className="size-3 text-brand" />
            </span>
            <span className="text-muted-foreground">{perk}</span>
          </li>
        ))}
      </ul>

      <div className="mt-7">{action}</div>
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
