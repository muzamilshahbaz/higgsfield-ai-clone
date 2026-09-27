import Link from 'next/link'

import { Reveal } from '@/components/marketing/reveal'
import { Section, SectionHeading } from '@/components/marketing/section-heading'
import { Button } from '@/components/ui/button'
import { resolveIcon } from '@/lib/admin/icons'
import { configBoolean, type FeatureCard, type LandingSection } from '@/lib/cms/content'
import { modelsForTask } from '@/lib/ai/registry'
import type { GenerationTask } from '@/types/database'

/**
 * AI capabilities.
 *
 * Three cards, one per generation task, and each one counts the registry rather than quoting a
 * number: the model list, the cheapest price and the fastest latency are all read at render
 * time. A task with nothing left in the catalogue drops off the page instead of advertising an
 * empty capability.
 *
 * That survives the copy becoming editable because of one field. A card carries its task in
 * `href`, which is the join to the registry — so an editor can rewrite every word on the card and
 * the numbers underneath still come from the thing that runs the jobs. A card whose task is
 * missing or unknown renders without the figures rather than with invented ones.
 *
 * The cheapest-price line is the useful part. "From 1 credit" answers the question a visitor is
 * actually holding — what will this cost me — with a figure the composer will charge them.
 */

const TASKS = new Set<GenerationTask>(['text_to_image', 'image_to_video', 'text_to_video'])

function taskOf(card: FeatureCard): GenerationTask | null {
  const value = card.href ?? ''
  return TASKS.has(value as GenerationTask) ? (value as GenerationTask) : null
}

export function Capabilities({
  section,
  cards,
}: {
  section: LandingSection
  cards: FeatureCard[]
}) {
  const resolved = cards
    .map((card) => {
      const task = taskOf(card)
      return { card, task, models: task ? modelsForTask(task) : [] }
    })
    // A card whose task has no models left is a card advertising nothing.
    .filter((entry) => entry.task === null || entry.models.length > 0)

  if (resolved.length === 0) return null

  return (
    <Section id="capabilities" tinted={configBoolean(section.config, 'tinted', true)}>
      <SectionHeading
        index={section.indexLabel ?? '02'}
        eyebrow={section.eyebrow ?? 'Capabilities'}
        title={section.title ?? 'Three things to ask for, one place to ask'}
        lead={section.lead ?? undefined}
        action={
          section.ctaLabel && section.ctaHref ? (
            <Button asChild variant="outline">
              <Link href={section.ctaHref}>{section.ctaLabel}</Link>
            </Button>
          ) : undefined
        }
      />

      <div className="mt-14 grid gap-4 lg:grid-cols-3">
        {resolved.map(({ card, models }, index) => {
          const Icon = resolveIcon(card.icon)
          const cheapest = models.length > 0 ? Math.min(...models.map((model) => model.credits)) : null
          const fastest =
            models.length > 0 ? Math.min(...models.map((model) => model.avgLatencySec)) : null

          return (
            <Reveal key={card.id} delay={index * 0.08} className="h-full">
              <article className="panel flex h-full flex-col rounded-2xl p-6">
                <div className="flex items-start justify-between gap-4">
                  <span className="chip-brand inline-flex size-10 items-center justify-center rounded-lg">
                    <Icon className="size-[18px]" aria-hidden />
                  </span>
                  {models.length > 0 && (
                    <span className="eyebrow tabular-nums text-muted-foreground">
                      {models.length} {models.length === 1 ? 'model' : 'models'}
                    </span>
                  )}
                </div>

                <h3 className="mt-5 text-xl font-medium">{card.title}</h3>
                <p className="mt-2.5 flex-1 text-sm leading-relaxed text-muted-foreground">
                  {card.body}
                </p>

                {card.detail && (
                  <p className="mt-4 border-l-2 border-accent/50 pl-3 text-sm text-foreground/85">
                    {card.detail}
                  </p>
                )}

                {cheapest !== null && fastest !== null && (
                  <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border">
                    <div className="bg-surface-2/40 px-3 py-2.5">
                      <dt className="eyebrow text-muted-foreground">From</dt>
                      <dd className="mt-1.5 text-sm font-medium tabular-nums text-credit">
                        {cheapest} {cheapest === 1 ? 'credit' : 'credits'}
                      </dd>
                    </div>
                    <div className="bg-surface-2/40 px-3 py-2.5">
                      <dt className="eyebrow text-muted-foreground">Fastest</dt>
                      <dd className="mt-1.5 text-sm font-medium tabular-nums">~{fastest}s</dd>
                    </div>
                  </dl>
                )}
              </article>
            </Reveal>
          )
        })}
      </div>
    </Section>
  )
}
