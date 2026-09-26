import Link from 'next/link'
import { ArrowRight, Coins, KeyRound, Timer } from 'lucide-react'

import { Reveal } from '@/components/marketing/reveal'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MODELS } from '@/lib/ai/registry'
import { TASK_LABELS } from '@/lib/constants'

/**
 * The model library.
 *
 * Reads `MODELS` straight out of the registry rather than a copy of it. That
 * is the whole point of the section: the marketing page and the composer are
 * showing the same catalogue, so a model added for the product appears here
 * with its real price, real latency and real capabilities, and a model
 * removed cannot linger in a marketing list nobody remembered to edit.
 */

const TASK_ORDER = ['text_to_image', 'image_to_video', 'text_to_video'] as const

export function ModelLibrary() {
  const grouped = TASK_ORDER.map((task) => ({
    task,
    models: MODELS.filter((model) => model.task === task),
  })).filter((group) => group.models.length > 0)

  return (
    <section
      id="library"
      className="relative scroll-mt-24 border-t border-border/60 bg-surface/30 py-24"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-2xl">
              <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                The whole library, one composer
              </h2>
              <p className="mt-3 text-pretty text-muted-foreground">
                {MODELS.length} open-weight models, every one of them served by Hugging Face,
                fal.ai or Replicate. Connect whichever account you already have — the controls,
                the credits and the job feed do not change underneath you.
              </p>
            </div>

            <Button asChild variant="outline">
              <Link href="/sign-up">
                <KeyRound className="size-4" aria-hidden />
                Connect your own keys
              </Link>
            </Button>
          </div>
        </Reveal>

        <div className="mt-12 space-y-10">
          {grouped.map((group, groupIndex) => (
            <div key={group.task}>
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-medium">{TASK_LABELS[group.task]}</h3>
                <span className="h-px flex-1 bg-border" aria-hidden />
                <span className="text-xs tabular-nums text-muted-foreground">
                  {group.models.length}
                </span>
              </div>

              <div className="mt-4 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
                {group.models.map((model, index) => {
                  return (
                    <Reveal
                      key={model.id}
                      // Capped so a long list does not end with a card that
                      // waits two seconds after it is already on screen.
                      delay={Math.min(groupIndex * 0.05 + index * 0.04, 0.4)}
                    >
                      <div className="h-full bg-background p-5 transition-colors hover:bg-surface">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h4 className="truncate text-[15px] font-medium">{model.label}</h4>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {model.family}
                            </p>
                          </div>
                          {model.featured && (
                            <Badge className="shrink-0">Popular</Badge>
                          )}
                        </div>

                        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                          {model.blurb}
                        </p>

                        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1 tabular-nums text-credit">
                            <Coins className="size-3" aria-hidden />
                            {model.credits} {model.credits === 1 ? 'credit' : 'credits'}
                          </span>
                          <span className="inline-flex items-center gap-1 tabular-nums">
                            <Timer className="size-3" aria-hidden />~{model.avgLatencySec}s
                          </span>
                          <span className="tabular-nums">
                            {model.supports.aspectRatios.length} ratios
                          </span>
                        </div>
                      </div>
                    </Reveal>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <Reveal>
          <p className="mt-10 text-center text-sm text-muted-foreground">
            Adding a model is one entry in the registry.{' '}
            <Link
              href="/presets"
              className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
            >
              See the presets built on them
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </p>
        </Reveal>
      </div>
    </section>
  )
}
