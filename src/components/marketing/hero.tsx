import Link from 'next/link'
import { ArrowRight, Play, Sparkles } from 'lucide-react'

// The catalogue file, not the database: this is a server-rendered marketing
// line, and it should not depend on Supabase being reachable to be honest.
import presetCatalogue from '../../../data/presets.json'

import { HeroCollage } from '@/components/marketing/hero-collage'
import { Button } from '@/components/ui/button'
import { PROVIDERS } from '@/lib/ai/catalogue'
import { MODELS } from '@/lib/ai/registry'
import { TRENDING_MODELS } from '@/lib/marketing/showcase'

/**
 * Providers a generation can actually run through, not every vendor whose key
 * can be stored. Counting all eleven would promise routing this build does not
 * do — see `generationReady` in lib/ai/catalogue.ts.
 */
const GENERATION_PROVIDER_COUNT = PROVIDERS.filter((provider) => provider.generationReady).length

const HERO_PRESETS = [
  { name: 'Crash Zoom', category: 'Camera' },
  { name: 'Bullet Time', category: 'VFX' },
  { name: 'Dolly Zoom', category: 'Camera' },
  { name: '360 Orbit', category: 'Camera' },
  { name: 'FPV Drone', category: 'Camera' },
  { name: 'Film Noir', category: 'Style' },
  { name: 'Golden Hour', category: 'Style' },
  { name: 'Snorricam', category: 'Camera' },
  { name: 'Whip Pan', category: 'Camera' },
  { name: 'Tilt Shift', category: 'Style' },
]

/**
 * The hero.
 *
 * Asymmetric on desktop: copy on the left, a floating collage of sample
 * frames on the right, rather than a centred column with a picture under it.
 * Below `lg` it collapses to the centred stack, because a two-column hero on
 * a phone is a two-column hero nobody reads.
 *
 * Every number on screen is computed — model count, provider count, preset
 * count — so the page cannot claim a catalogue the build does not have.
 */
export function Hero({ isSignedIn = false }: { isSignedIn?: boolean }) {
  return (
    <section className="relative overflow-hidden pt-28 pb-16 sm:pt-36 sm:pb-24">
      <div className="aurora" aria-hidden />
      <div className="absolute inset-0 grid-lines opacity-40" aria-hidden />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:gap-16">
          <div className="mx-auto max-w-2xl text-center lg:mx-0 lg:text-left">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur">
              <Sparkles className="size-3.5 text-accent" aria-hidden />
              <span>
                {MODELS.length} open models · {GENERATION_PROVIDER_COUNT} providers · bring your own
                keys
              </span>
            </div>

            <h1 className="text-balance text-5xl font-semibold leading-[1.03] tracking-tight sm:text-6xl lg:text-7xl">
              <span className="text-gradient">Every open model.</span>
              <br />
              One cinematic studio.
            </h1>

            <p className="mx-auto mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground lg:mx-0">
              FLUX.1, SDXL, Wan 2.2, LTX-Video and HunyuanVideo behind a single composer. Pick a
              camera move, drop in an image, and let Kinetic handle the prompt engineering, the
              model routing and the render.
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link href={isSignedIn ? '/create' : '/sign-up'}>
                  {isSignedIn ? 'Open the composer' : 'Start creating free'}
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                <Link href="/explore">
                  <Play className="size-4" aria-hidden />
                  See what people made
                </Link>
              </Button>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              200 credits on signup · no card required · connect your own API keys any time
            </p>
          </div>

          <HeroCollage shots={TRENDING_MODELS.slice(0, 3)} />
        </div>

        {/* preset marquee — target of the "Presets" link in the site header */}
        <div id="presets" className="relative mt-20 scroll-mt-24">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-background to-transparent sm:w-24" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-background to-transparent sm:w-24" />

          {/*
            Clipped here rather than relying on the section's overflow: the
            track is deliberately wider than the page, and a wrapper that owns
            its own clipping cannot be broken by a layout change three levels
            up.
          */}
          <div className="overflow-hidden">
            {/*
              The list is rendered twice and the track scrolls exactly half its
              width, so the second copy is under the cursor at the moment the
              first one leaves — a seam-free loop without measuring anything in
              JavaScript. The duplicate is aria-hidden so a screen reader gets
              the presets once.
            */}
            <div className="marquee flex gap-3">
              {[0, 1].map((copy) => (
                <div key={copy} className="flex shrink-0 gap-3" aria-hidden={copy === 1}>
                  {HERO_PRESETS.map((preset, index) => (
                    <div
                      key={preset.name}
                      className="group relative aspect-[3/4] w-36 shrink-0 overflow-hidden rounded-xl border border-border bg-surface sm:w-44"
                      style={{
                        background: `linear-gradient(${140 + index * 24}deg, oklch(0.24 0.05 ${260 + index * 14}), oklch(0.17 0.02 280))`,
                      }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent" />
                      <div className="absolute inset-x-0 bottom-0 p-3">
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                          {preset.category}
                        </p>
                        <p className="text-sm font-medium">{preset.name}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            {presetCatalogue.length} presets in the catalogue.{' '}
            <Link
              href="/presets"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Browse them all
            </Link>
            .
          </p>
        </div>
      </div>
    </section>
  )
}
