import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { PlanCard } from '@/components/billing/plan-card'
import { PlanComparison } from '@/components/billing/plan-comparison'
import { Reveal } from '@/components/marketing/reveal'
import { Button } from '@/components/ui/button'
import { requireModel } from '@/lib/ai/registry'
import { SIGNUP_CREDIT_GRANT } from '@/lib/constants'
import { PLAN_LIST } from '@/lib/plans'

/**
 * Pricing.
 *
 * The cards are the same `PlanCard` the billing page uses, fed from the same
 * catalogue, so what is advertised here and what is sold in the app cannot
 * drift. This section used to keep its own copy of the numbers.
 *
 * `shotsFor` divides the signup grant by a live model price rather than
 * quoting a figure someone typed once, so the claim stays true when a model
 * is repriced.
 */

function shotsFor(modelId: string): number {
  return Math.floor(SIGNUP_CREDIT_GRANT / requireModel(modelId).credits)
}

export function Pricing() {
  return (
    <section id="pricing" className="relative scroll-mt-24 border-t border-border/60 py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              Credits, not seats
            </h2>
            <p className="mt-3 text-pretty text-muted-foreground">
              You pay for renders, not for logging in. {SIGNUP_CREDIT_GRANT} credits is{' '}
              {shotsFor('lumen-flash')} quick stills, {shotsFor('lumen-pro')} finished frames, or{' '}
              {shotsFor('motion-turbo')} five-second motion passes.
            </p>
          </div>
        </Reveal>

        <div className="mt-14 grid gap-4 lg:grid-cols-3">
          {PLAN_LIST.map((plan, index) => (
            <Reveal key={plan.id} delay={index * 0.07}>
              <PlanCard
                plan={plan}
                action={
                  <Button
                    asChild
                    variant={plan.featured ? 'default' : 'outline'}
                    className="w-full"
                  >
                    {/*
                      Signed out, the middleware sends /settings/billing to
                      /sign-in?next=… and back again afterwards, so one href
                      serves both the visitor and the returning user.
                    */}
                    <Link href={plan.priceGbp === 0 ? '/sign-up' : '/settings/billing'}>
                      {plan.priceGbp === 0 ? 'Start creating free' : `Choose ${plan.name}`}
                      <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  </Button>
                }
              />
            </Reveal>
          ))}
        </div>

        <Reveal>
          <div className="mt-14 rounded-2xl border border-border bg-card p-6 sm:p-8">
            <h3 className="text-sm font-medium text-muted-foreground">Compare plans</h3>
            <div className="mt-5">
              <PlanComparison />
            </div>
          </div>
        </Reveal>

        <Reveal>
          <p className="mt-8 text-center text-xs text-muted-foreground">
            Billing in this build is a demonstration. Checkout is simulated, no payment provider
            is connected, no card is charged and no card details are stored.
          </p>
        </Reveal>
      </div>
    </section>
  )
}
