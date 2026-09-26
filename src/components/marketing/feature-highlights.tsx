import { Reveal } from '@/components/marketing/reveal'
import { Section, SectionHeading } from '@/components/marketing/section-heading'
import { FEATURE_HIGHLIGHTS } from '@/lib/marketing/landing'
import { cn } from '@/lib/utils'

/**
 * Feature highlights.
 *
 * A six-column bento so the row widths differ: two wide panels, then three
 * narrower ones. The alternative — a 3×2 grid of equal cards — is the layout
 * that makes a feature list look like a pricing table by mistake.
 *
 * Each panel carries a faint index in its corner rather than an icon. Six
 * invented icons for six abstract capabilities is decoration that has to be
 * decoded; a number is honest about being an ordinal.
 */
export function FeatureHighlights() {
  return (
    <Section id="features" tinted>
      <SectionHeading
        index="06"
        eyebrow="Built in"
        title="The parts you would otherwise wire up yourself"
        lead="None of this is an add-on or a higher tier. It is what the workspace does on the free plan, on day one."
      />

      <div className="mt-14 grid gap-4 lg:grid-cols-6">
        {FEATURE_HIGHLIGHTS.map((feature, index) => (
          <Reveal
            key={feature.title}
            delay={Math.min(index, 4) * 0.06}
            className={cn('h-full', feature.span)}
          >
            <article className="panel group relative flex h-full flex-col overflow-hidden rounded-2xl p-6">
              <span
                className="eyebrow absolute right-5 top-5 text-muted-foreground/40 transition-colors group-hover:text-brand/60"
                aria-hidden
              >
                {String(index + 1).padStart(2, '0')}
              </span>

              <h3 className="max-w-[85%] text-lg font-medium leading-snug">{feature.title}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                {feature.body}
              </p>
            </article>
          </Reveal>
        ))}
      </div>
    </Section>
  )
}
