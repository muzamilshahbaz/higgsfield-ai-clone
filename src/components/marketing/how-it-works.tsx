import { Reveal } from '@/components/marketing/reveal'
import { Section, SectionHeading } from '@/components/marketing/section-heading'
import { configBoolean, type LandingSection, type WorkflowStep } from '@/lib/cms/content'

/**
 * How it works.
 *
 * Steps on a single rail — a 1px line that runs horizontally behind the markers on desktop and
 * vertically down the left on mobile, so the sequence is carried by the layout instead of by
 * arrow glyphs that disappear at the breakpoint. The line is drawn once per orientation and the
 * markers sit on it; nothing has to be measured.
 *
 * Each step ends in the artefact it produces, in mono. That is the detail that makes the diagram
 * worth reading: a reader can see what they actually get back at each stage rather than four
 * verbs.
 *
 * The grid column count follows the number of steps rather than being fixed at four, so adding a
 * fifth in the admin panel gives five columns instead of a four-column grid with an orphan.
 */

/** Tailwind needs these as literal strings — a computed `lg:grid-cols-${n}` is never generated. */
const COLUMNS: Record<number, string> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
  6: 'lg:grid-cols-6',
}

export function HowItWorks({
  section,
  steps,
}: {
  section: LandingSection
  steps: WorkflowStep[]
}) {
  if (steps.length === 0) return null

  const columns = COLUMNS[Math.min(steps.length, 6)] ?? 'lg:grid-cols-4'

  return (
    <Section id="workflow" tinted={configBoolean(section.config, 'tinted', true)}>
      <SectionHeading
        index={section.indexLabel ?? '04'}
        eyebrow={section.eyebrow ?? 'How it works'}
        title={section.title ?? 'Four steps, and the fourth one loops'}
        lead={section.lead ?? undefined}
      />

      <ol className={`relative mt-16 grid gap-10 lg:gap-6 ${columns}`}>
        {/* The rail. Vertical under `lg` (left of the markers), horizontal above it (through
            them). Inset at both ends so it stops at the first and last marker rather than
            running off into the padding. */}
        <span
          className="pointer-events-none absolute left-[15px] top-2 bottom-2 w-px bg-gradient-to-b from-primary/60 via-border to-border lg:inset-x-[12%] lg:inset-y-auto lg:top-[15px] lg:h-px lg:w-auto lg:bg-gradient-to-r"
          aria-hidden
        />

        {steps.map((step, index) => (
          <Reveal key={step.id} delay={index * 0.09}>
            <li className="relative pl-12 lg:pl-0">
              <span
                className="absolute left-0 top-0 flex size-8 items-center justify-center rounded-lg border border-border bg-background font-mono text-xs font-medium text-brand lg:static lg:mb-6 lg:flex"
                aria-hidden
              >
                {String(index + 1).padStart(2, '0')}
              </span>

              <h3 className="text-lg font-medium leading-snug">
                <span className="sr-only">Step {index + 1}: </span>
                {step.title}
              </h3>
              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{step.body}</p>

              {step.artefact && (
                <p className="mt-4 truncate rounded-md border border-border bg-background px-3 py-2 font-mono text-[11px] text-muted-foreground">
                  {step.artefact}
                </p>
              )}
            </li>
          </Reveal>
        ))}
      </ol>
    </Section>
  )
}
