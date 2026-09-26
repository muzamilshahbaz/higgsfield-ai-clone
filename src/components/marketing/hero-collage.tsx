'use client'

import { domAnimation, LazyMotion, m, useReducedMotion } from 'framer-motion'

import type { ShowcaseModel } from '@/lib/marketing/showcase'
import { stockUrl } from '@/lib/marketing/stock'

/**
 * The floating frame collage beside the hero copy.
 *
 * Three overlapping cards on slow, offset vertical loops. The offsets are
 * what sell it: three cards drifting in unison read as one element wobbling,
 * where three cards on different phases read as depth.
 *
 * `LazyMotion` with `domAnimation` for the same reason as Reveal — this is
 * decoration on the first page a visitor loads, and the full `motion` bundle
 * is most of the library's weight for a transform and an opacity.
 *
 * Under `prefers-reduced-motion` the cards render in their final positions
 * and simply do not move. A permanently drifting element is precisely what
 * that setting exists to stop, and it cannot be dismissed by scrolling past.
 */

/**
 * Widths sum to just over 100%, so the frames overlap by a couple of percent
 * and read as stacked rather than tiled. Not more than that: the second card
 * sits UNDER the first, and any deeper overlap buries its caption, which
 * looks like clipped text rather than depth.
 */
const PLACEMENTS = [
  { className: 'left-0 top-6 w-[58%] rotate-[-4deg] z-20', drift: 14, delay: 0 },
  { className: 'right-0 top-0 w-[44%] rotate-[5deg] z-10', drift: -11, delay: 0.8 },
  { className: 'bottom-0 right-[6%] w-[54%] rotate-[2deg] z-30', drift: 9, delay: 1.6 },
] as const

export function HeroCollage({ shots }: { shots: ShowcaseModel[] }) {
  const reduced = useReducedMotion()
  const visible = shots.slice(0, PLACEMENTS.length)

  return (
    <div
      // Not aria-hidden: each frame names the model that made it, which is a
      // claim the page is making and a screen reader should hear.
      className="relative mx-auto aspect-[4/5] w-full max-w-md lg:max-w-none"
    >
      <div
        className="absolute inset-[12%] rounded-full bg-primary/20 blur-3xl"
        aria-hidden
      />

      <LazyMotion features={domAnimation} strict>
        {visible.map((shot, index) => {
          const placement = PLACEMENTS[index]!

          return (
            <m.figure
              key={shot.modelId}
              className={`absolute overflow-hidden rounded-2xl border border-border/80 bg-surface shadow-2xl shadow-black/50 ${placement.className}`}
              initial={reduced ? false : { opacity: 0, y: 24, scale: 0.96 }}
              animate={
                reduced
                  ? { opacity: 1 }
                  : { opacity: 1, y: [0, placement.drift, 0], scale: 1 }
              }
              transition={
                reduced
                  ? { duration: 0 }
                  : {
                      opacity: { duration: 0.6, delay: index * 0.12 },
                      scale: { duration: 0.6, delay: index * 0.12, ease: [0.16, 1, 0.3, 1] },
                      y: {
                        duration: 7 + index,
                        delay: placement.delay,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      },
                    }
              }
            >
              <div className="relative aspect-video w-full">
                {/*
                  A plain <img> rather than next/image: Unsplash's CDN already
                  crops and re-encodes from the query string, so the browser is
                  sent exactly the pixels this frame uses. Running it through a
                  second optimiser would buy nothing and add a hop.
                */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={stockUrl(shot.preview)}
                  alt={shot.preview.alt}
                  loading="lazy"
                  className="size-full object-cover"
                />
              </div>

              <figcaption className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="truncate text-[11px] font-medium">{shot.name}</span>
                <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {shot.kind}
                </span>
              </figcaption>
            </m.figure>
          )
        })}
      </LazyMotion>
    </div>
  )
}
