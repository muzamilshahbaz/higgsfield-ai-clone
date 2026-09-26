import Link from 'next/link'
import { ArrowRight, Info } from 'lucide-react'

import { PlanCard } from '@/components/billing/plan-card'
import { PlanComparison } from '@/components/billing/plan-comparison'
import { Reveal } from '@/components/marketing/reveal'
import { Section, SectionHeading } from '@/components/marketing/section-heading'
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
 * `shotsFor` divides the signup grant by a live model price rather than quoting
 * a figure someone typed once, so the claim stays true when a model is
 * repriced.
 *
 * The simulated-billing notice is a panel rather than small print at the
 * bottom. It is the most important sentence in the section for anyone deciding
 * whether to trust the page, and burying it would be the dishonest choice.
 */

function shotsFor(modelId: string): number {
  return Math.floor(SIGNUP_CREDIT_GRANT / requireModel(modelId).credits)
}

export function Pricing() {
  return (
    <Section id="pricing">
      <SectionHeading
        index="07"
        eyebrow="Pricing"
        title="Credits, not seats"
        align="center"
        lead={`You pay for renders, not for logging in. ${SIGNUP_CREDIT_GRANT} credits is ${shotsFor('lumen-flash')} quick stills, ${shotsFor('lumen-pro')} finished frames, or ${shotsFor('motion-turbo')} five-second motion passes.`}
      />

      <div className="mt-14 grid gap-4 lg:grid-cols-3">
        {PLAN_LIST.map((plan, index) => (
          <Reveal key={plan.id} delay={index * 0.07} className="h-full">
            <PlanCard
              plan={plan}
              action={
                <Button asChild variant={plan.featured ? 'default' : 'outline'} className="w-full">
                  {/*
                    Signed out, the middleware sends /settings/billing to
                    /sign-in?next=… and back again afterwards, so one href
                    serves both the visitor and the returning user.
                  */}
                  <Link href={plan.priceUsd === 0 ? '/sign-up' : '/settings/billing'}>
                    {plan.priceUsd === 0 ? 'Start creating free' : `Choose ${plan.name}`}
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </Button>
              }
            />
          </Reveal>
        ))}
      </div>

      <Reveal>
        <div className="panel mt-4 rounded-2xl p-6 sm:p-8">
          <h3 className="eyebrow text-muted-foreground">Compare plans</h3>
          <div className="mt-6">
            <PlanComparison />
          </div>
        </div>
      </Reveal>

      <Reveal>
        <p className="mt-4 flex items-start gap-3 rounded-xl border border-accent/30 bg-accent/5 p-4 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
          <span>
            <span className="font-medium text-foreground">Billing here is a demonstration.</span>{' '}
            Checkout is simulated — no payment provider is connected, no card is charged and no
            card details are stored. Plans and credit grants otherwise behave exactly as they
            would.
          </span>
        </p>
      </Reveal>
    </Section>
  )
}
