import { Check, Minus } from 'lucide-react'

import { PLAN_FEATURES, PLAN_LIST, type Plan, type PlanFeature, type PlanId } from '@/lib/plans'
import { cn } from '@/lib/utils'

/**
 * The feature matrix.
 *
 * Driven entirely by the plans and rows it is handed, so a new tier or a new
 * row is a data change and never a change here. Both default to the code
 * catalogue, which keeps every existing caller working and is the fallback a
 * page gets when the database is unreachable.
 *
 * A real `<table>`, not a grid of divs: this is tabular data, and a screen
 * reader announcing "Concurrent renders, Pro, 5" depends on the row and column
 * headers actually being headers. On narrow screens it scrolls sideways rather
 * than reflowing into cards, because a comparison you cannot see side by side
 * has stopped being a comparison.
 */

export function PlanComparison({
  currentPlanId,
  plans = PLAN_LIST,
  features = PLAN_FEATURES,
}: {
  currentPlanId?: PlanId
  plans?: Plan[]
  features?: PlanFeature[]
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[34rem] border-collapse text-sm">
        <caption className="sr-only">Feature comparison across plans</caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="eyebrow py-3 pr-4 text-left text-muted-foreground">
              Feature
            </th>
            {plans.map((plan) => (
              <th
                key={plan.id}
                scope="col"
                className={cn(
                  'px-4 py-3 text-center font-medium',
                  currentPlanId === plan.id ? 'text-brand' : 'text-foreground',
                )}
              >
                {plan.name}
                {currentPlanId === plan.id && (
                  <span className="block text-[11px] font-normal text-muted-foreground">
                    Your plan
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {features.map((feature) => (
            <tr key={feature.label} className="border-b border-border/60 last:border-0">
              <th scope="row" className="py-3 pr-4 text-left font-normal text-muted-foreground">
                {feature.label}
              </th>

              {plans.map((plan) => {
                const value = feature.values[plan.id]
                return (
                  <td key={plan.id} className="px-4 py-3 text-center tabular-nums">
                    {typeof value === 'boolean' ? (
                      value ? (
                        <>
                          <Check className="inline size-4 text-success" aria-hidden />
                          <span className="sr-only">Included</span>
                        </>
                      ) : (
                        <>
                          <Minus className="inline size-4 text-muted-foreground/40" aria-hidden />
                          <span className="sr-only">Not included</span>
                        </>
                      )
                    ) : (
                      value
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
