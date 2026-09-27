import { Reveal } from '@/components/marketing/reveal'
import {
  configBoolean,
  statValue,
  type LandingSection,
  type StatCell,
  type StatSources,
} from '@/lib/cms/content'
import type { ProviderView } from '@/services/cms/catalogue.service'

/**
 * The numbers band, directly under the hero.
 *
 * What it is not: a wall of customer logos. This is an independent build with no customers, and
 * a row of borrowed brand marks under the words "trusted by" is the one thing on a landing page
 * that is straightforwardly a lie. So the band does that section's job — establishing that
 * something real is behind the pitch — with figures that are either counted at render time or
 * explicitly set by an operator, and an honest statement of what the product runs on.
 *
 * The honesty survived becoming editable, and this is how. A cell is one of two things: a number
 * the platform counted, or a number somebody typed. A counted cell cannot go stale. A typed one
 * says so by not counting anything — and a counted cell whose source currently resolves to zero
 * is dropped entirely, because "0 Creators" on a landing page is worse than three cells instead
 * of four.
 */
export function Stats({
  section,
  stats,
  sources,
  providers,
}: {
  section: LandingSection
  stats: StatCell[]
  sources: StatSources
  /** Providers a generation can actually run through. Never the whole vendor list. */
  providers: ProviderView[]
}) {
  // Resolved before rendering so a zero-count cell disappears rather than printing a zero, and
  // so the grid's column count reflects what is actually shown.
  const cells = stats
    .map((stat) => ({ stat, value: statValue(stat, sources) }))
    .filter((cell): cell is { stat: StatCell; value: string } => cell.value !== null)

  const showProviders = configBoolean(section.config, 'show_providers', true)

  if (cells.length === 0 && !showProviders) return null

  return (
    <section className="relative py-14 sm:py-16" aria-label={section.label || 'By the numbers'}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {cells.length > 0 && (
          <Reveal>
            {/*
              A gap-px grid over a border-coloured background, so the dividers between cells are
              the background showing through rather than eight border declarations that have to
              agree with each other about which edge to draw.
            */}
            <dl className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
              {cells.map(({ stat, value }) => (
                <div key={stat.id} className="bg-background px-5 py-6 sm:px-6">
                  <dd className="font-display text-4xl font-semibold tabular-nums leading-none">
                    {stat.prefix}
                    {value}
                    {stat.suffix}
                  </dd>
                  <dt className="mt-3 text-sm font-medium">{stat.label}</dt>
                  {stat.detail && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{stat.detail}</p>
                  )}
                </div>
              ))}
            </dl>
          </Reveal>
        )}

        {showProviders && providers.length > 0 && (
          <Reveal delay={0.08}>
            <div className="mt-8 flex flex-col items-center gap-x-6 gap-y-3 sm:flex-row sm:justify-center">
              {section.eyebrow && (
                <p className="eyebrow text-muted-foreground">{section.eyebrow}</p>
              )}

              <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
                {providers.map((provider) => (
                  <li key={provider.id} className="text-sm font-medium text-foreground/90">
                    {provider.label}
                  </li>
                ))}
              </ul>

              {section.body && <p className="text-xs text-muted-foreground">{section.body}</p>}
            </div>
          </Reveal>
        )}
      </div>
    </section>
  )
}
