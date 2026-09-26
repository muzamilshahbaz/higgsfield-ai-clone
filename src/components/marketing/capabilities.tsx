import Link from 'next/link'
import { ArrowRight, Image as ImageIcon, Film, Video } from 'lucide-react'

import { Reveal } from '@/components/marketing/reveal'
import { Section, SectionHeading } from '@/components/marketing/section-heading'
import { Button } from '@/components/ui/button'
import { modelsForTask } from '@/lib/ai/registry'
import { CAPABILITIES } from '@/lib/marketing/landing'
import type { GenerationTask } from '@/types/database'

/**
 * AI capabilities.
 *
 * Three cards, one per generation task, and each one counts the registry rather
 * than quoting a number: the model list, the cheapest price and the range of
 * latencies are all read at render time. A task with nothing left in the
 * catalogue drops off the page instead of advertising an empty capability.
 *
 * The cheapest-price line is the useful part. "From 1 credit" answers the
 * question a visitor is actually holding — what will this cost me — with a
 * figure the composer will charge them.
 */

const ICONS: Record<GenerationTask, typeof ImageIcon> = {
  text_to_image: ImageIcon,
  image_to_video: Film,
  text_to_video: Video,
}

export function Capabilities() {
  const cards = CAPABILITIES.map((capability) => ({
    ...capability,
    models: modelsForTask(capability.task),
  })).filter((card) => card.models.length > 0)

  return (
    <Section id="capabilities" tinted>
      <SectionHeading
        index="02"
        eyebrow="Capabilities"
        title="Three things to ask for, one place to ask"
        lead="The composer switches between them with a segmented control. The prompt, the reference image and the credit balance travel with you."
        action={
          <Button asChild variant="outline">
            <Link href="/create">
              Open the composer
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        }
      />

      <div className="mt-14 grid gap-4 lg:grid-cols-3">
        {cards.map((card, index) => {
          const Icon = ICONS[card.task]
          const cheapest = Math.min(...card.models.map((model) => model.credits))
          const fastest = Math.min(...card.models.map((model) => model.avgLatencySec))

          return (
            <Reveal key={card.task} delay={index * 0.08} className="h-full">
              <article className="panel flex h-full flex-col rounded-2xl p-6">
                <div className="flex items-start justify-between gap-4">
                  <span className="chip-brand inline-flex size-10 items-center justify-center rounded-lg">
                    <Icon className="size-[18px]" aria-hidden />
                  </span>
                  <span className="eyebrow tabular-nums text-muted-foreground">
                    {card.models.length} {card.models.length === 1 ? 'model' : 'models'}
                  </span>
                </div>

                <h3 className="mt-5 text-xl font-medium">{card.title}</h3>
                <p className="mt-2.5 flex-1 text-sm leading-relaxed text-muted-foreground">
                  {card.body}
                </p>

                <p className="mt-4 border-l-2 border-accent/50 pl-3 text-sm text-foreground/85">
                  {card.detail}
                </p>

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
              </article>
            </Reveal>
          )
        })}
      </div>
    </Section>
  )
}
