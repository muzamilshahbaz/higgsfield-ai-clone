import Link from 'next/link'
import { ArrowRight, Check, Coins } from 'lucide-react'

import { Reveal } from '@/components/marketing/reveal'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MODELS, requireModel } from '@/lib/ai/registry'
import { SIGNUP_CREDIT_GRANT } from '@/lib/constants'
import { cn } from '@/lib/utils'

/**
 * Credits.
 *
 * The signup grant and the per-model prices are read from the constants and
 * the registry, so this section cannot promise a number the product does not
 * honour. `whatYouGet` divides the grant by a live model price rather than
 * quoting a figure someone typed once.
 *
 * Only the free tier is a thing you can actually buy today. The two paid
 * tiers are marked as not yet purchasable rather than given a Buy button
 * that goes nowhere — a checkout that 404s is worse than an honest label.
 */

function shotsFor(modelId: string): number {
  return Math.floor(SIGNUP_CREDIT_GRANT / requireModel(modelId).credits)
}

const TIERS = [
  {
    name: 'Free',
    price: '0',
    cadence: 'forever',
    credits: SIGNUP_CREDIT_GRANT,
    blurb: 'Everything in the studio, on the house credits you get at signup.',
    perks: [
      `${SIGNUP_CREDIT_GRANT} credits the moment you sign up`,
      `All ${MODELS.length} models and every preset`,
      'Projects, library, history and Explore',
      'Failed jobs refund automatically',
    ],
    cta: 'Start creating free',
    href: '/sign-up',
    available: true,
    featured: false,
  },
  {
    name: 'Studio',
    price: '24',
    cadence: 'per month',
    credits: 2_500,
    blurb: 'For the week where one idea turns into forty takes.',
    perks: [
      '2,500 credits a month',
      'Priority queue placement',
      'Higher concurrent job limit',
      'Bring your own provider keys',
    ],
    cta: 'Not purchasable yet',
    href: '/sign-up',
    available: false,
    featured: true,
  },
  {
    name: 'Bring your own keys',
    price: '0',
    cadence: 'plus your vendor bill',
    credits: null,
    blurb: 'Connect your own accounts and pay the model providers directly.',
    perks: [
      'Your quota, your rate limits, your invoice',
      'Keys encrypted at rest, never sent to the browser',
      'Per-provider connection status and testing',
      'Falls back to shared capacity when a key is missing',
    ],
    cta: 'See how it works',
    href: '/sign-up',
    available: true,
    featured: false,
  },
] as const

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
          {TIERS.map((tier, index) => (
            <Reveal key={tier.name} delay={index * 0.07}>
              <div
                className={cn(
                  'relative flex h-full flex-col rounded-2xl border bg-card p-7',
                  tier.featured ? 'border-primary/50 shadow-xl shadow-primary/10' : 'border-border',
                )}
              >
                {tier.featured && (
                  <Badge className="absolute -top-2.5 left-7">Most credits per pound</Badge>
                )}

                <h3 className="text-sm font-medium text-muted-foreground">{tier.name}</h3>

                <p className="mt-3 flex items-baseline gap-1.5">
                  <span className="text-4xl font-semibold tracking-tight">£{tier.price}</span>
                  <span className="text-sm text-muted-foreground">{tier.cadence}</span>
                </p>

                {tier.credits !== null && (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-sm tabular-nums text-credit">
                    <Coins className="size-3.5" aria-hidden />
                    {tier.credits.toLocaleString()} credits
                  </p>
                )}

                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{tier.blurb}</p>

                <ul className="mt-6 flex-1 space-y-2.5">
                  {tier.perks.map((perk) => (
                    <li key={perk} className="flex gap-2.5 text-sm">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                      <span className="text-muted-foreground">{perk}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  asChild={tier.available}
                  disabled={!tier.available}
                  variant={tier.featured ? 'default' : 'outline'}
                  className="mt-7 w-full"
                >
                  {tier.available ? (
                    <Link href={tier.href}>
                      {tier.cta}
                      <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  ) : (
                    <span>{tier.cta}</span>
                  )}
                </Button>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal>
          <p className="mt-8 text-center text-xs text-muted-foreground">
            Billing is not wired up in this build. The free tier is real; the Studio tier is
            priced but not purchasable.
          </p>
        </Reveal>
      </div>
    </section>
  )
}
