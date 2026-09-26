import { Quote } from 'lucide-react'

import { Reveal } from '@/components/marketing/reveal'
import { Badge } from '@/components/ui/badge'
import { PROVIDERS } from '@/lib/ai/catalogue'
import { MODELS } from '@/lib/ai/registry'
import { SIGNUP_CREDIT_GRANT } from '@/lib/constants'
import { TESTIMONIALS } from '@/lib/marketing/showcase'

import presetCatalogue from '../../../data/presets.json'

/**
 * Social proof.
 *
 * Two halves that are honest in different ways.
 *
 * The stat row is real: every number is computed from the registry, the
 * catalogue and the constants at render time, so it cannot overstate what
 * the build contains.
 *
 * The quotes are not real, and the section says so — on the page, in a badge,
 * not in a comment. Fabricated named endorsements presented as genuine are
 * the one thing a landing page must never ship, so the copy is attributed to
 * roles rather than invented people and is labelled sample text. Swap
 * TESTIMONIALS for real quotes and drop the badge when there are some.
 */

const STATS = [
  { value: String(MODELS.length), label: 'models in the registry' },
  // "vendors", not "providers": the hero counts the three that can run a
  // generation, and one page using the same word for two different numbers
  // reads as a mistake even when both are true.
  { value: String(PROVIDERS.length), label: 'vendors you can connect' },
  { value: String(presetCatalogue.length), label: 'cinematic presets' },
  { value: String(SIGNUP_CREDIT_GRANT), label: 'credits at signup' },
]

export function SocialProof() {
  return (
    <section className="relative border-t border-border/60 py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border lg:grid-cols-4">
            {/*
              `flex-col-reverse`, not a visually-hidden duplicate label. A
              <dl> wants the <dt> before its <dd> in the DOM, but the number
              reads first visually — reversing the flex direction satisfies
              both, where an sr-only copy of the label made a screen reader
              announce every stat twice.
            */}
            {STATS.map((stat) => (
              <div
                key={stat.label}
                className="flex flex-col-reverse bg-background p-6 text-center"
              >
                <dt className="mt-1 text-xs text-muted-foreground">{stat.label}</dt>
                <dd className="text-3xl font-semibold tabular-nums text-gradient">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>

        <div className="mt-16">
          <Reveal>
            <div className="flex flex-wrap items-center justify-center gap-3 text-center">
              <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
                What people say about it
              </h2>
              <Badge variant="outline">Illustrative copy</Badge>
            </div>
            <p className="mx-auto mt-3 max-w-xl text-center text-sm text-pretty text-muted-foreground">
              Written to show the shape of the section. These are not quotes from real customers,
              and they are attributed to roles rather than to people who never said them.
            </p>
          </Reveal>

          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {TESTIMONIALS.map((testimonial, index) => (
              <Reveal key={testimonial.quote} delay={index * 0.07}>
                <figure className="flex h-full flex-col rounded-2xl border border-border bg-card p-7">
                  <Quote className="size-5 text-brand" aria-hidden />

                  <blockquote className="mt-4 flex-1 text-pretty text-sm leading-relaxed">
                    {testimonial.quote}
                  </blockquote>

                  <figcaption className="mt-5 border-t border-border pt-4 text-xs">
                    <span className="block font-medium">{testimonial.name}</span>
                    <span className="block text-muted-foreground">{testimonial.context}</span>
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
