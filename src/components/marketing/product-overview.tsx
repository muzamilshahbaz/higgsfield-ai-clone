import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'

import { Reveal } from '@/components/marketing/reveal'
import { Section, SectionHeading } from '@/components/marketing/section-heading'
import type { FeatureCard, LandingSection } from '@/lib/cms/content'
import { WORKSPACE_SURFACES } from '@/lib/marketing/landing'

/**
 * Product overview.
 *
 * Mirrors the hero: there the panel is on the right and the copy on the left, here it is
 * reversed, which is how the page avoids reading as a column of identical bands.
 *
 * The left panel is a real navigation, not a diagram of one. Each row links to the route it
 * describes — the middleware sends a signed-out visitor through /sign-in and back — so a reader
 * who is curious about the library ends up in the library rather than reading a caption about it.
 *
 * `WORKSPACE_SURFACES` stays in code deliberately, unlike the points beside it. Every entry is a
 * route this build actually has, and an editable list of them is a list that can point at a 404.
 * The copy on each row is one line and changes about as often as the routes do.
 */
export function ProductOverview({
  section,
  points,
}: {
  section: LandingSection
  points: FeatureCard[]
}) {
  return (
    <Section id="overview">
      <SectionHeading
        index={section.indexLabel ?? '01'}
        eyebrow={section.eyebrow ?? 'The workspace'}
        title={section.title ?? 'Five surfaces, one balance, no exports in between'}
        lead={section.lead ?? undefined}
      />

      <div className="mt-14 grid gap-10 lg:grid-cols-12 lg:gap-12">
        {/* ------------------------------------------------- surface map */}
        <Reveal className="lg:col-span-7">
          <ul className="panel divide-y divide-border overflow-hidden rounded-2xl">
            {WORKSPACE_SURFACES.map((surface, index) => (
              <li key={surface.key}>
                <Link
                  href={surface.href}
                  className="group flex items-start gap-4 p-5 transition-colors hover:bg-surface-2/50 sm:gap-5 sm:p-6"
                >
                  <span className="eyebrow mt-1.5 w-6 shrink-0 text-muted-foreground transition-colors group-hover:text-brand">
                    {String(index + 1).padStart(2, '0')}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-display text-[17px] font-medium">
                      {surface.label}
                      <ArrowUpRight
                        className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                        aria-hidden
                      />
                    </span>
                    <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                      {surface.body}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Reveal>

        {/* ----------------------------------------------------- points */}
        <div className="lg:col-span-5">
          <ol className="space-y-8">
            {points.map((point, index) => (
              <Reveal key={point.id} delay={index * 0.08}>
                <li className="border-l-2 border-primary/40 pl-5">
                  <h3 className="text-lg font-medium leading-snug">{point.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{point.body}</p>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </div>
    </Section>
  )
}
