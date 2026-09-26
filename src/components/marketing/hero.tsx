import Link from 'next/link'
import { ArrowRight, Compass, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { PROVIDERS } from '@/lib/ai/catalogue'
import { MODELS } from '@/lib/ai/registry'
import { SIGNUP_CREDIT_GRANT } from '@/lib/constants'
import type { PresetSummary } from '@/lib/presets'
import type { MediaAsset } from '@/services/media.service'

/**
 * Providers a generation can actually run through, not every vendor whose key
 * can be stored. Counting all eleven would promise routing this build does not
 * do — see `generationReady` in lib/ai/catalogue.ts.
 */
const GENERATION_PROVIDER_COUNT = PROVIDERS.filter((provider) => provider.generationReady).length

/**
 * The hero.
 *
 * The right-hand column is the product, not a picture of it: a static replica
 * of the composer panel, built from the same tokens and the same control shapes
 * as /create. A visitor sees the interface they are being asked to sign up for
 * within the first screen, which no amount of showreel does.
 *
 * It is labelled as an interface preview, and the frame inside it is reference
 * photography read from `media_assets` — captioned as such. A mock-up is fine;
 * a mock-up implying "this model made this" is not.
 *
 * Deliberately not: a centred column with a video under it, a gradient-filled
 * headline, or a glow behind the text. The headline is solid white with one
 * cyan-underscored phrase, and the light in the section is a linear wash from
 * two corners.
 */
export function Hero({
  isSignedIn = false,
  media = [],
  presets = [],
}: {
  isSignedIn?: boolean
  /** Reference photography from `media_assets`, for the console frame. */
  media?: MediaAsset[]
  /** The real catalogue, for the marquee. Empty on an unreachable database. */
  presets?: PresetSummary[]
}) {
  const frame = media[0]

  return (
    <section className="relative overflow-hidden pt-28 sm:pt-36">
      <div className="light-wash pointer-events-none absolute inset-0" aria-hidden />
      <div
        className="blueprint blueprint-fade pointer-events-none absolute inset-0 opacity-60"
        aria-hidden
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-14 lg:grid-cols-12 lg:gap-10">
          {/* ------------------------------------------------------- copy */}
          <div className="lg:col-span-6">
            <p className="chip-brand eyebrow inline-flex items-center gap-2 rounded-md px-2.5 py-2">
              <Sparkles className="size-3.5" aria-hidden />
              {MODELS.length} open models · {GENERATION_PROVIDER_COUNT} providers
            </p>

            <h1 className="mt-6 text-balance text-[2.75rem] font-semibold leading-[1.02] sm:text-6xl xl:text-[4.25rem]">
              A workspace where{' '}
              {/* The one piece of colour in the headline: an underline rather
                  than a gradient fill, so the text keeps its full contrast. */}
              <span className="relative whitespace-nowrap">
                <span className="relative z-10">stills move</span>
                <span
                  className="absolute inset-x-0 bottom-[0.06em] h-[0.2em] bg-primary/25"
                  aria-hidden
                />
              </span>
              .
            </h1>

            <p className="mt-6 max-w-lg text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
              Kinetic Studio puts every open image and video model behind one composer. Write a
              prompt, pick a camera move, and get a finished shot back — with the credit cost on
              screen before you spend it.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link href={isSignedIn ? '/create' : '/sign-up'}>
                  {isSignedIn ? 'Open the composer' : 'Start creating free'}
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                <Link href="/explore">
                  <Compass className="size-4" aria-hidden />
                  Browse the feed
                </Link>
              </Button>
            </div>

            <p className="mt-5 text-sm text-muted-foreground">
              <span className="tabular-nums text-credit">{SIGNUP_CREDIT_GRANT} credits</span> on
              signup · no card required · connect your own keys any time
            </p>
          </div>

          {/* ---------------------------------------------- console replica */}
          <div className="lg:col-span-6 lg:col-start-7">
            <ComposerPreview frame={frame} />
          </div>
        </div>
      </div>

      {/* --------------------------------------------------- preset marquee */}
      <PresetMarquee presets={presets} />
    </section>
  )
}

/**
 * A static replica of the composer.
 *
 * Every value in it is a plausible real one and every control is the same shape
 * as its counterpart in /create, but nothing here is interactive — it is an
 * image made of DOM, which is why it costs no JavaScript and stays sharp on a
 * retina screen. The `aria-hidden` on the control cluster keeps a screen reader
 * out of a form it cannot use; the caption above it carries the meaning.
 */
function ComposerPreview({ frame }: { frame?: MediaAsset }) {
  return (
    <figure className="panel overflow-hidden rounded-2xl">
      {/* window chrome */}
      <div className="flex items-center justify-between border-b border-border bg-surface-2/50 px-4 py-2.5">
        <p className="eyebrow text-muted-foreground">Composer</p>
        <p className="eyebrow flex items-center gap-2 text-muted-foreground">
          <span className="size-1.5 rounded-full bg-success" aria-hidden />
          2 / 2 rendering
        </p>
      </div>

      <div className="p-4 sm:p-5" aria-hidden>
        {/* prompt */}
        <div className="rounded-lg border border-input bg-surface/60 p-3">
          <p className="text-sm leading-relaxed text-foreground">
            a lone figure on a wet rooftop at dusk, neon signage behind her,
            <span className="text-muted-foreground"> slow push in</span>
          </p>
        </div>

        {/* control row */}
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="chip-brand inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium">
            Motion Cine
          </span>
          {['16:9', '5s', 'seed 41273'].map((chip) => (
            <span
              key={chip}
              className="rounded-md border border-border bg-surface-2/60 px-2.5 py-1.5 text-xs tabular-nums text-muted-foreground"
            >
              {chip}
            </span>
          ))}
        </div>

        {/* result frame */}
        <div className="relative mt-4 aspect-video overflow-hidden rounded-lg border border-border bg-surface-2">
          {frame ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={frame.url}
              alt=""
              /* The one image above the fold, so it loads eagerly and is the
                 LCP candidate rather than waiting on the observer. */
              fetchPriority="high"
              className="size-full object-cover"
            />
          ) : (
            <div className="blueprint size-full opacity-50" />
          )}

          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/95 to-transparent p-3">
            <div className="flex items-end justify-between gap-3">
              <p className="eyebrow text-muted-foreground">shot-04.mp4 · 1920×1080</p>
              <p className="eyebrow text-brand">ready · 62s</p>
            </div>
            {/* the progress rail, at rest */}
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full w-full rounded-full bg-primary" />
            </div>
          </div>
        </div>

        {/* action row */}
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            <span className="tabular-nums text-credit">18 credits</span> · balance 182
          </p>
          <span className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
            Generate
          </span>
        </div>
      </div>

      <figcaption className="border-t border-border bg-surface-2/40 px-4 py-2.5 text-[11px] text-muted-foreground">
        Interface preview.{' '}
        {frame
          ? 'The frame is reference photography, not output from this app.'
          : 'No reference imagery loaded.'}
      </figcaption>
    </figure>
  )
}

/**
 * The preset rail under the hero.
 *
 * Full-bleed and clipped by its own wrapper rather than the section's overflow:
 * the track is deliberately wider than the page, and a wrapper that owns its
 * clipping cannot be broken by a layout change three levels up.
 */
function PresetMarquee({ presets }: { presets: PresetSummary[] }) {
  if (presets.length === 0) return null

  return (
    <div className="relative mt-20 border-y border-border/70 py-5 sm:mt-28">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-background to-transparent sm:w-32" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-background to-transparent sm:w-32" />

      <div className="overflow-hidden">
        {/*
          The list is rendered twice and the track scrolls exactly half its
          width, so the second copy is under the cursor at the moment the first
          one leaves — a seam-free loop without measuring anything in
          JavaScript. The duplicate is aria-hidden so a screen reader gets the
          presets once.
        */}
        <div className="marquee flex gap-2.5">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex shrink-0 gap-2.5" aria-hidden={copy === 1}>
              {presets.map((preset) => (
                <Link
                  key={preset.slug}
                  href="/presets"
                  className="group relative aspect-[4/5] w-32 shrink-0 overflow-hidden rounded-lg border border-border bg-surface transition-colors hover:border-brand/60 sm:w-40"
                >
                  {preset.posterUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={preset.posterUrl}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 size-full object-cover transition-transform duration-500 ease-[var(--ease-out-quint)] group-hover:scale-105"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-2.5">
                    <p className="eyebrow truncate text-muted-foreground">{preset.category}</p>
                    <p className="mt-1 truncate text-[13px] font-medium">{preset.title}</p>
                  </div>
                </Link>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
