import Link from 'next/link'
import { ArrowRight, Coins, ImageIcon, TrendingUp, Video } from 'lucide-react'

import { Reveal } from '@/components/marketing/reveal'
import { Badge } from '@/components/ui/badge'
import { creditsFor, TRENDING_MODELS } from '@/lib/marketing/showcase'
import { stockUrl } from '@/lib/marketing/stock'

/**
 * Trending models.
 *
 * A horizontal rail rather than a grid, and full-bleed rather than boxed:
 * this is the section that has to feel like a catalogue you browse, and six
 * equal cards in a tidy 3×2 grid feels like a comparison table. The rail also
 * scales honestly — a seventh model extends it instead of leaving a hole in
 * the last row.
 *
 * It is a plain overflow container, so it scrolls with a trackpad, a swipe,
 * a shift-wheel and the keyboard, with no drag handler to get wrong.
 */
export function TrendingModels() {
  return (
    <section id="models" className="relative scroll-mt-24 overflow-hidden border-t border-border/60 py-24">
      <div className="spotlight absolute inset-x-0 top-0 h-96" aria-hidden />

      <div className="relative">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="max-w-2xl">
                <Badge variant="outline" className="mb-4">
                  <TrendingUp className="size-3" aria-hidden />
                  Trending this week
                </Badge>
                <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                  The models people actually reach for
                </h2>
                <p className="mt-3 text-pretty text-muted-foreground">
                  Every one of these is a single dropdown away in the composer. Prices are the
                  live registry values, not a marketing round number.
                </p>
              </div>

              <Link
                href="/sign-up"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline-offset-4 hover:underline"
              >
                Try them all
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          </Reveal>
        </div>

        {/*
          Bleeds past the container on both sides so the rail reads as
          continuing off-screen. The padding matches the container gutter, so
          the first card still lines up with the heading above it.
        */}
        <div className="rail mt-10 flex gap-4 overflow-x-auto px-4 pb-4 sm:px-6 lg:px-8">
          {TRENDING_MODELS.map((model, index) => {
            const credits = creditsFor(model)
            const KindIcon = model.kind === 'video' ? Video : ImageIcon

            return (
              <Reveal key={model.modelId} delay={Math.min(index, 4) * 0.06}>
                <article className="group flex h-full w-[280px] shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-muted sm:w-[320px]">
                  <div className="relative aspect-video w-full overflow-hidden bg-surface">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={stockUrl(model.preview)}
                      // Reference imagery, not output: the alt says what the
                      // photograph shows rather than claiming this model made
                      // it. See lib/marketing/stock.ts.
                      alt={model.preview.alt}
                      loading="lazy"
                      className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />

                    <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-background/80 px-2.5 py-1 text-[11px] font-medium backdrop-blur">
                      <KindIcon className="size-3 text-accent" aria-hidden />
                      {model.kind === 'video' ? 'Video' : 'Image'}
                    </span>

                    <span className="absolute right-3 top-3 rounded-full bg-background/80 px-2.5 py-1 text-[11px] text-muted-foreground backdrop-blur">
                      {model.trend}
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col p-5">
                    <h3 className="text-[15px] font-medium">{model.name}</h3>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                      {model.description}
                    </p>

                    <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs">
                      <span className="text-muted-foreground">{model.useCase}</span>
                      {credits !== null && (
                        <span className="inline-flex items-center gap-1 tabular-nums text-credit">
                          <Coins className="size-3" aria-hidden />
                          {credits}
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}
