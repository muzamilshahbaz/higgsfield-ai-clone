import Link from 'next/link'
import { ArrowRight, KeyRound } from 'lucide-react'

import { Reveal } from '@/components/marketing/reveal'
import { Section, SectionHeading } from '@/components/marketing/section-heading'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getProvider } from '@/lib/ai/catalogue'
import { MODELS, providersFor } from '@/lib/ai/registry'
import { TASK_LABELS } from '@/lib/constants'
import type { GenerationTask } from '@/types/database'

/**
 * The supported-models roster.
 *
 * A spec sheet, not a card grid. Cards would give six near-identical tiles per
 * task and bury the one thing a reader is comparing — price against latency —
 * inside a paragraph. Rows put the numbers in a column you can run your eye
 * down, in mono, right-aligned, which is what makes this section legible at
 * eighteen models and still legible at forty.
 *
 * Everything is read from the registry: label, family, routes, credits and
 * latency. A model added for the product appears here with its real numbers,
 * and a model removed cannot linger in a marketing list nobody remembered to
 * edit. `providersFor` is the same function the router uses to choose one.
 */

const TASK_ORDER: GenerationTask[] = ['text_to_image', 'image_to_video', 'text_to_video']

export function ModelLibrary() {
  const groups = TASK_ORDER.map((task) => ({
    task,
    models: MODELS.filter((model) => model.task === task),
  })).filter((group) => group.models.length > 0)

  return (
    <Section id="models">
      <SectionHeading
        index="03"
        eyebrow="Supported models"
        title="The whole roster, with the real numbers on it"
        lead={`${MODELS.length} open-weight models served through Hugging Face, fal.ai or Replicate. Connect whichever account you already have — the controls, the credits and the job feed do not change underneath you.`}
        action={
          <Button asChild variant="outline">
            <Link href="/settings/keys">
              <KeyRound className="size-4" aria-hidden />
              Connect your keys
            </Link>
          </Button>
        }
      />

      <div className="mt-14 space-y-12">
        {groups.map((group) => (
          <div key={group.task}>
            {/* group rule */}
            <div className="flex items-center gap-4">
              <h3 className="eyebrow text-brand">{TASK_LABELS[group.task]}</h3>
              <span className="h-px flex-1 bg-border" aria-hidden />
              <span className="eyebrow tabular-nums text-muted-foreground">
                {String(group.models.length).padStart(2, '0')}
              </span>
            </div>

            <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border">
              {group.models.map((model, index) => {
                const vendors = providersFor(model).map(
                  (id) => getProvider(id)?.label ?? id,
                )

                return (
                  <Reveal key={model.id} delay={Math.min(index, 6) * 0.03}>
                    <li className="grid gap-x-6 gap-y-3 bg-card/60 px-5 py-4 transition-colors hover:bg-surface-2/40 sm:grid-cols-12 sm:items-center sm:px-6">
                      {/* name + family */}
                      <div className="sm:col-span-4">
                        <div className="flex items-center gap-2">
                          <h4 className="font-display text-[15px] font-medium">{model.label}</h4>
                          {model.featured && (
                            <Badge variant="outline" className="shrink-0">
                              Recommended
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                          {model.family}
                        </p>
                      </div>

                      {/* what it is for */}
                      <p className="text-sm leading-relaxed text-muted-foreground sm:col-span-4">
                        {model.blurb}
                      </p>

                      {/* where it runs */}
                      <p className="text-xs text-muted-foreground sm:col-span-2">
                        <span className="sr-only">Served by </span>
                        {vendors.join(' · ')}
                      </p>

                      {/*
                        The comparison column. Right-aligned and tabular from
                        `sm` up so the prices form a straight edge; left-aligned
                        below it, where there is no column to align to.
                      */}
                      <p className="flex items-baseline gap-3 text-sm tabular-nums sm:col-span-2 sm:justify-end">
                        <span className="font-medium text-credit">
                          {model.credits}
                          <span className="sr-only">
                            {' '}
                            {model.credits === 1 ? 'credit' : 'credits'}
                          </span>
                          <span className="text-xs text-muted-foreground" aria-hidden>
                            {' '}
                            cr
                          </span>
                        </span>
                        <span className="text-muted-foreground">
                          <span className="sr-only">about </span>~{model.avgLatencySec}s
                        </span>
                      </p>
                    </li>
                  </Reveal>
                )
              })}
            </ul>
          </div>
        ))}
      </div>

      <Reveal>
        <p className="mt-10 text-sm text-muted-foreground">
          Prices and latencies are the live values from the registry the composer uses.{' '}
          <Link
            href="/presets"
            className="inline-flex items-center gap-1 font-medium text-brand underline-offset-4 hover:underline"
          >
            See the presets built on them
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </p>
      </Reveal>
    </Section>
  )
}
