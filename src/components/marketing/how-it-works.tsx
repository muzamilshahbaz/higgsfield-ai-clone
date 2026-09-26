import { Reveal } from '@/components/marketing/reveal'
import { Section, SectionHeading } from '@/components/marketing/section-heading'

/**
 * How it works.
 *
 * Four steps on a single rail — a 1px line that runs horizontally behind the
 * markers on desktop and vertically down the left on mobile, so the sequence is
 * carried by the layout instead of by four arrow glyphs that disappear at the
 * breakpoint. The line is drawn once per orientation and the markers sit on it;
 * nothing has to be measured.
 *
 * Each step ends in the artefact it produces, in mono. That is the detail that
 * makes the diagram worth reading: a reader can see what they actually get back
 * at each stage rather than four verbs.
 */

const STEPS = [
  {
    title: 'Describe the shot',
    body: 'A sentence is enough. Add a reference image if you have one — the same panel takes both.',
    artefact: 'prompt + reference.jpg',
  },
  {
    title: 'Pick a move and a model',
    body: 'A preset carries the camera language, the negative prompt and the parameters that make the move read. The model selector shows what each one costs.',
    artefact: 'preset: slow push · Motion Cine',
  },
  {
    title: 'Queue it',
    body: 'Two jobs run at once on the free plan. The card streams from queued to rendering to ready without a refresh, and the credits leave your balance only once the job is accepted.',
    artefact: 'job 8f21 · rendering · 41%',
  },
  {
    title: 'Use it',
    body: 'Download the original, file it into a project, publish it to Explore, or pull it back into the composer and change one value.',
    artefact: 'shot-04.mp4 · 1920×1080',
  },
] as const

export function HowItWorks() {
  return (
    <Section id="workflow" tinted>
      <SectionHeading
        index="04"
        eyebrow="How it works"
        title="Four steps, and the fourth one loops"
        lead="Nothing here is a wizard you have to finish. Every stage is a control you can come back to, and every result remembers the settings that produced it."
      />

      <ol className="relative mt-16 grid gap-10 lg:grid-cols-4 lg:gap-6">
        {/* The rail. Vertical under `lg` (left of the markers), horizontal above
            it (through them). Inset at both ends so it stops at the first and
            last marker rather than running off into the padding. */}
        <span
          className="pointer-events-none absolute left-[15px] top-2 bottom-2 w-px bg-gradient-to-b from-primary/60 via-border to-border lg:inset-x-[12%] lg:inset-y-auto lg:top-[15px] lg:h-px lg:w-auto lg:bg-gradient-to-r"
          aria-hidden
        />

        {STEPS.map((step, index) => (
          <Reveal key={step.title} delay={index * 0.09}>
            <li className="relative pl-12 lg:pl-0">
              {/* marker */}
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

              <p className="mt-4 truncate rounded-md border border-border bg-background px-3 py-2 font-mono text-[11px] text-muted-foreground">
                {step.artefact}
              </p>
            </li>
          </Reveal>
        ))}
      </ol>
    </Section>
  )
}
