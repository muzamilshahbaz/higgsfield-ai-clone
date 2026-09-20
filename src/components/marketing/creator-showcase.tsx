import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { GenerationMedia } from '@/components/gallery/generation-media'
import { Reveal } from '@/components/marketing/reveal'
import { Badge } from '@/components/ui/badge'
import { authorNameOf, type ExploreItem } from '@/lib/explore'
import { aspectStyle, truncate } from '@/lib/utils'

/**
 * Creator showcase.
 *
 * Prefers the real public feed. When the feed is empty — a fresh deployment,
 * or a database that is not reachable — it falls back to the bundled sample
 * frames and says so in a badge, rather than the previous behaviour of
 * hiding the section entirely.
 *
 * The distinction is the important part: a visitor is never shown a sample
 * frame captioned as somebody's published work. Real work carries a byline
 * and links to its permalink; samples carry the preset name and link nowhere.
 */

const SAMPLE_SHOTS = [
  { src: '/samples/shot-01.svg', title: 'Crash Zoom', ratio: '16:9' },
  { src: '/samples/shot-03.svg', title: 'Snorricam', ratio: '9:16' },
  { src: '/samples/model-kling.svg', title: '360 Orbit', ratio: '16:9' },
  { src: '/samples/shot-04.svg', title: 'Bullet Time', ratio: '1:1' },
  { src: '/samples/model-luma.svg', title: 'Crane Up', ratio: '16:9' },
  { src: '/samples/shot-02.svg', title: 'Dolly Zoom', ratio: '16:9' },
  { src: '/samples/model-veo.svg', title: 'FPV Drone', ratio: '16:9' },
  { src: '/samples/shot-06.svg', title: 'Golden Hour', ratio: '9:16' },
] as const

export function CreatorShowcase({ items }: { items: ExploreItem[] }) {
  const usingSamples = items.length === 0

  return (
    <section
      id="showcase"
      className="relative scroll-mt-24 border-t border-border/60 bg-surface/30 py-24"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-xl">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                  Made with Kinetic
                </h2>
                {usingSamples && <Badge variant="outline">Sample output</Badge>}
              </div>

              <p className="mt-3 text-pretty text-muted-foreground">
                {usingSamples
                  ? 'Nothing has been published to the public feed yet, so these are the sample frames that ship with the app. Your work appears here the moment you publish it.'
                  : 'Published by people using the same presets you get on day one. Open any of them and hit remix.'}
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

        {/*
          Columns rather than a grid: the shots are 16:9, 9:16 and 1:1, and a
          fixed-row grid either crops them all to one ratio or leaves gaps.
          A masonry column flow keeps each frame its own shape.
        */}
        <div className="mt-10 columns-2 gap-4 sm:columns-3 lg:columns-4 [&>*]:mb-4">
          {usingSamples
            ? SAMPLE_SHOTS.map((shot, index) => (
                <Reveal key={shot.src} delay={Math.min(index, 5) * 0.05}>
                  <figure className="overflow-hidden rounded-xl border border-border bg-card">
                    <div
                      className="relative w-full overflow-hidden bg-surface"
                      style={aspectStyle(shot.ratio)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={shot.src}
                        alt={`A ${shot.title} sample frame`}
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    </div>
                    <figcaption className="px-3 py-2 text-xs text-muted-foreground">
                      {shot.title} · sample
                    </figcaption>
                  </figure>
                </Reveal>
              ))
            : items.map((item, index) => {
                const label = item.prompt.trim() || 'A shot made with Kinetic'

                return (
                  <Reveal key={item.id} delay={Math.min(index, 5) * 0.05}>
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
