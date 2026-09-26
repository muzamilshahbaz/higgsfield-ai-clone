import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { GenerationMedia } from '@/components/gallery/generation-media'
import { Reveal } from '@/components/marketing/reveal'
import { Badge } from '@/components/ui/badge'
import { authorNameOf, type ExploreItem } from '@/lib/explore'
import type { MediaAsset } from '@/services/media.service'
import { aspectStyle, truncate } from '@/lib/utils'

/**
 * Creator showcase.
 *
 * Prefers the real public feed. When the feed is empty — a fresh deployment,
 * or a database that is not reachable — it falls back to reference photographs
 * and says so, rather than the previous behaviour of hiding the section.
 *
 * The distinction is the important part, and it got sharper when the fallback
 * stopped being obvious gradients: a visitor must never be shown a photograph
 * captioned as somebody's published work, under a heading that reads "Made
 * with Kinetic". Real work carries a byline and links to its permalink. The
 * fallback carries the word "reference", a credit to Unsplash, and links
 * nowhere — because nothing in it was made here.
 */

/**
 * Shapes for the masonry fallback.
 *
 * A grid of identical 16:9 cards reads as a placeholder wall; mixing portrait
 * and square into it reads as a curated set. Indexed rather than stored per
 * photograph, because the shape is a property of the layout, not the picture.
 */
const REFERENCE_RATIOS = ['16:9', '9:16', '16:9', '1:1', '16:9', '16:9', '16:9', '9:16']

export function CreatorShowcase({
  items,
  media,
}: {
  items: ExploreItem[]
  media: MediaAsset[]
}) {
  // Real work wins. Reference photography is only ever the empty state, and
  // only when there is any to show.
  const usingSamples = items.length === 0 && media.length > 0

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
                {usingSamples && <Badge variant="outline">Reference imagery</Badge>}
              </div>

              <p className="mt-3 text-pretty text-muted-foreground">
                {usingSamples
                  ? 'Nothing has been published to the public feed yet. These are reference photographs, not output from this app — they show the kind of frame each move is for. Your work replaces them the moment you publish it.'
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
            ? media.map((photo, index) => (
                <Reveal key={photo.slug} delay={Math.min(index, 5) * 0.05}>
                  <figure className="overflow-hidden rounded-xl border border-border bg-card">
                    <div
                      className="relative w-full overflow-hidden bg-surface"
                      style={aspectStyle(REFERENCE_RATIOS[index % REFERENCE_RATIOS.length]!)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.url}
                        alt={photo.alt}
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    </div>
                    <figcaption className="px-3 py-2 text-xs text-muted-foreground">
                      Reference · {photo.category}
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

        {/*
          Attribution is not required by the Unsplash licence, but a page that
          borrows photographs to illustrate itself should say where they came
          from — and it is the second place a visitor is told these frames are
          not this product's output.
        */}
        {usingSamples && (
          <p className="mt-6 text-xs text-muted-foreground">
            Reference photography from{' '}
            <a
              href={media[0]?.creditUrl ?? 'https://unsplash.com'}
              target="_blank"
              rel="noreferrer noopener"
              className="underline underline-offset-2 hover:text-foreground"
            >
              {media[0]?.creditName ?? 'Unsplash'}
            </a>
            . None of these frames were generated by this app.
          </p>
        )}
      </div>
    </section>
  )
}
