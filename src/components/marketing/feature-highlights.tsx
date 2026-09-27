import { Reveal } from '@/components/marketing/reveal'
import { Section, SectionHeading } from '@/components/marketing/section-heading'
import { configBoolean, type FeatureCard, type LandingSection } from '@/lib/cms/content'
import { cn } from '@/lib/utils'

/**
 * Feature highlights.
 *
 * A six-column bento so the row widths differ: two wide panels, then three narrower ones. The
 * alternative — a 3x2 grid of equal cards — is the layout that makes a feature list look like a
 * pricing table by mistake.
 *
 * `span` comes from the database but is chosen from an allow-list in the admin form, and that is
 * not fussiness: Tailwind only generates the classes it finds in source, so a span typed freehand
 * would be a string with no CSS behind it and a card that silently renders at the default width.
 *
 * Each panel carries a faint index in its corner rather than an icon. Invented icons for abstract
 * capabilities are decoration that has to be decoded; a number is honest about being an ordinal.
 */
export function FeatureHighlights({
  section,
  features,
}: {
  section: LandingSection
  features: FeatureCard[]
}) {
  if (features.length === 0) return null

  return (
    <Section id="features" tinted={configBoolean(section.config, 'tinted', true)}>
      <SectionHeading
        index={section.indexLabel ?? '06'}
        eyebrow={section.eyebrow ?? 'Built in'}
        title={section.title ?? 'The parts you would otherwise wire up yourself'}
        lead={section.lead ?? undefined}
      />

      <div className="mt-14 grid gap-4 lg:grid-cols-6">
        {features.map((feature, index) => (
          <Reveal
            key={feature.id}
            delay={Math.min(index, 4) * 0.06}
            className={cn('h-full', feature.span ?? 'lg:col-span-2')}
          >
            <article className="panel group relative flex h-full flex-col overflow-hidden rounded-2xl p-6">
              <span
                className="eyebrow absolute right-5 top-5 text-muted-foreground/40 transition-colors group-hover:text-brand/60"
                aria-hidden
              >
                {String(index + 1).padStart(2, '0')}
              </span>

              <h3 className="max-w-[85%] text-lg font-medium leading-snug">{feature.title}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
            </article>
          </Reveal>
        ))}
      </div>
    </Section>
  )
}
