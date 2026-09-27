import Link from 'next/link'
import { ArrowRight, Info } from 'lucide-react'

import { PlanCard } from '@/components/billing/plan-card'
import { PlanComparison } from '@/components/billing/plan-comparison'
import { Reveal } from '@/components/marketing/reveal'
import { Section, SectionHeading } from '@/components/marketing/section-heading'
import { Button } from '@/components/ui/button'
import { configBoolean, configString, type LandingSection } from '@/lib/cms/content'
import { getModel } from '@/lib/ai/registry'
import type { Plan, PlanFeature } from '@/lib/plans'

/**
 * Pricing.
 *
 * The cards are the same `PlanCard` the billing page uses, fed from the same catalogue, so what
 * is advertised here and what is sold in the app cannot drift. This section used to keep its own
 * copy of the numbers.
 *
 * `shotsFor` divides the signup grant by a live model price rather than quoting a figure somebody
 * typed once, so the claim stays true when a model is repriced — and returns null for a model
 * that has left the registry, which drops that clause from the sentence rather than printing
 * "NaN quick stills".
 *
 * The simulated-billing notice is a panel rather than small print at the bottom. It is the most
 * important sentence in the section for anybody deciding whether to trust the page, and burying
 * it would be the dishonest choice. The admin form refuses to save it empty for the same reason.
 */

function shotsFor(modelId: string, grant: number): number | null {
  const model = getModel(modelId)
  if (!model || model.credits <= 0) return null
  const shots = Math.floor(grant / model.credits)
  return shots > 0 ? shots : null
}

/**
 * "200 credits is 200 quick stills, 50 finished frames, or 14 motion passes."
 *
 * Assembled from whichever of the three models still exists, so a retired model costs the
 * sentence a clause instead of breaking it. With none of them, the lead is the operator's copy
 * alone.
 */
function creditsSentence(grant: number): string | null {
  const clauses = [
    { id: 'lumen-flash', noun: 'quick stills' },
    { id: 'lumen-pro', noun: 'finished frames' },
    { id: 'motion-turbo', noun: 'five-second motion passes' },
  ]
    .map((entry) => {
      const shots = shotsFor(entry.id, grant)
      return shots ? `${shots} ${entry.noun}` : null
    })
    .filter((clause): clause is string => clause !== null)

  if (clauses.length === 0) return null

  const list =
    clauses.length === 1
      ? clauses[0]
      : `${clauses.slice(0, -1).join(', ')}, or ${clauses[clauses.length - 1]}`

  return `${grant} credits is ${list}.`
}

export function Pricing({
  section,
  plans,
  features,
  signupGrant,
  disclaimer,
}: {
  section: LandingSection
  plans: Plan[]
  features: PlanFeature[]
  signupGrant: number
  disclaimer: string
}) {
  if (plans.length === 0) return null

  const sentence = creditsSentence(signupGrant)
  const lead = [section.lead, sentence].filter(Boolean).join(' ')

  const columns = plans.length >= 3 ? 'lg:grid-cols-3' : plans.length === 2 ? 'lg:grid-cols-2' : ''

  return (
    <Section id="pricing">
      <SectionHeading
        index={section.indexLabel ?? '07'}
        eyebrow={section.eyebrow ?? 'Pricing'}
        title={section.title ?? 'Credits, not seats'}
        align={configString(section.config, 'align') === 'center' ? 'center' : 'start'}
        lead={lead || undefined}
      />

      <div className={`mt-14 grid gap-4 ${columns}`}>
        {plans.map((plan, index) => (
          <Reveal key={plan.id} delay={index * 0.07} className="h-full">
            <PlanCard
              plan={plan}
              action={
                <Button asChild variant={plan.featured ? 'default' : 'outline'} className="w-full">
                  {/*
                    Signed out, the middleware sends /settings/billing to /sign-in?next=… and back
                    afterwards, so one href serves both the visitor and the returning user.
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

      {configBoolean(section.config, 'show_comparison', true) && features.length > 0 && (
        <Reveal>
          <div className="panel mt-4 rounded-2xl p-6 sm:p-8">
            <h3 className="eyebrow text-muted-foreground">Compare plans</h3>
            <div className="mt-6">
              <PlanComparison plans={plans} features={features} />
            </div>
          </div>
        </Reveal>
      )}

      {configBoolean(section.config, 'show_disclaimer', true) && disclaimer && (
        <Reveal>
          <p className="mt-4 flex items-start gap-3 rounded-xl border border-accent/30 bg-accent/5 p-4 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            <span>
              <span className="font-medium text-foreground">Billing here is a demonstration.</span>{' '}
              {disclaimer}
            </span>
          </p>
        </Reveal>
      )}
    </Section>
  )
}
