import Link from 'next/link'
import { Plus } from 'lucide-react'

import { Reveal } from '@/components/marketing/reveal'
import { Section } from '@/components/marketing/section-heading'
import { FAQ as QUESTIONS } from '@/lib/marketing/landing'

/**
 * FAQ.
 *
 * Native `<details>` / `<summary>`, not a JavaScript accordion. The browser
 * already gives this Enter and Space handling, the correct expanded state for a
 * screen reader, and — the part hand-rolled accordions always miss — find-in-page
 * that opens the section it matched. It also costs zero bytes of JavaScript on
 * the one route where a first-time visitor is waiting.
 *
 * The heading sits in a sticky column on desktop while the questions scroll
 * past it, which is the section's own layout rather than another centred block.
 */
export function FAQ() {
  return (
    <Section id="faq">
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-4">
          <Reveal>
            <div className="lg:sticky lg:top-28">
              <p className="eyebrow flex items-center gap-3 text-muted-foreground">
                <span className="text-brand">08</span>
                <span className="h-px w-8 bg-border" aria-hidden />
                Questions
              </p>

              <h2 className="mt-5 text-balance text-3xl font-semibold leading-[1.1] sm:text-4xl">
                Before you sign up
              </h2>

              <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
                Including the two most products bury: what it costs, and whether the billing is
                real.
              </p>

              <p className="mt-6 text-sm text-muted-foreground">
                Still deciding?{' '}
                <Link
                  href="/explore"
                  className="font-medium text-brand underline-offset-4 hover:underline"
                >
                  Look at the feed first
                </Link>
                .
              </p>
            </div>
          </Reveal>
        </div>

        <div className="lg:col-span-8">
          <ul className="divide-y divide-border border-y border-border">
            {QUESTIONS.map((entry, index) => (
              <Reveal key={entry.q} delay={Math.min(index, 4) * 0.05}>
                <li>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-start justify-between gap-6 py-5 text-left [&::-webkit-details-marker]:hidden">
                      <h3 className="text-[17px] font-medium leading-snug transition-colors group-hover:text-brand">
                        {entry.q}
                      </h3>

                      <span
                        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-transform duration-200 ease-[var(--ease-out-quint)] group-open:rotate-45 group-open:border-brand/50 group-open:text-brand"
                        aria-hidden
                      >
                        <Plus className="size-3.5" />
                      </span>
                    </summary>

                    <p className="max-w-2xl pb-6 pr-10 text-[15px] leading-relaxed text-muted-foreground">
                      {entry.a}
                    </p>
                  </details>
                </li>
              </Reveal>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  )
}
