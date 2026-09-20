import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { Reveal } from '@/components/marketing/reveal'
import { GenerationMedia } from '@/components/gallery/generation-media'
import { authorNameOf, type ExploreItem } from '@/lib/explore'
import { aspectStyle, truncate } from '@/lib/utils'

/**
 * Real work on the landing page.
 *
 * Rendered only when the feed actually has something in it — a marketing
 * section headed "made with Kinetic" above six empty boxes is worse than no
 * section, so a fresh deployment simply does not show this.
 */
export function MadeWith({ items }: { items: ExploreItem[] }) {
  if (items.length === 0) return null

  return (
    <section className="relative border-t border-border/60 py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                Made with Kinetic
              </h2>
              <p className="mt-3 max-w-lg text-pretty text-muted-foreground">
                Published by people using the same presets you get on day one. Open any of them
                and hit remix.
              </p>
            </div>

            <Link
              href="/explore"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline-offset-4 hover:underline"
            >
              Browse the feed
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </Reveal>

        <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item, index) => {
            const label = item.prompt.trim() || 'A shot made with Kinetic'

            return (
              <Reveal key={item.id} delay={index * 0.05}>
                <Link
                  href={`/g/${item.id}`}
                  aria-label={`Open ${truncate(label, 70)} by ${authorNameOf(item)}`}
                  className="group block overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-muted"
                >
                  <div
                    className="relative w-full overflow-hidden bg-surface"
                    style={aspectStyle(item.aspect_ratio)}
                  >
                    <GenerationMedia assets={item.assets} alt={label} />

                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/95 via-background/40 to-transparent p-3">
                      <p className="truncate text-xs text-muted-foreground">
                        {authorNameOf(item)}
                      </p>
                    </div>
                  </div>
                </Link>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}
