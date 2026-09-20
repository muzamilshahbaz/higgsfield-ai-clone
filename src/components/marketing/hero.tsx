import Link from 'next/link'
import { ArrowRight, Play, Sparkles } from 'lucide-react'

// The catalogue file, not the database: this is a server-rendered marketing
// line, and it should not depend on Supabase being reachable to be honest.
import presetCatalogue from '../../../data/presets.json'

import { Button } from '@/components/ui/button'

const HERO_PRESETS = [
  { name: 'Crash Zoom', category: 'Camera' },
  { name: 'Bullet Time', category: 'VFX' },
  { name: 'Dolly Zoom', category: 'Camera' },
  { name: '360 Orbit', category: 'Camera' },
  { name: 'FPV Drone', category: 'Camera' },
  { name: 'Film Noir', category: 'Style' },
  { name: 'Golden Hour', category: 'Style' },
  { name: 'Snorricam', category: 'Camera' },
]

export function Hero({ isSignedIn = false }: { isSignedIn?: boolean }) {
  return (
    <section className="relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-28">
      <div className="aurora" aria-hidden />
      <div className="absolute inset-0 grid-lines opacity-40" aria-hidden />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur">
            <Sparkles className="size-3.5 text-accent" />
            <span>36 cinematic presets · image and video models</span>
          </div>

          <h1 className="text-balance text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
            <span className="text-gradient">Turn a still frame</span>
            <br />
            into cinema.
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
            Pick a camera move. Drop in an image. Kinetic handles the prompt engineering, the model
            routing and the render — you get a shot, not a settings panel.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href={isSignedIn ? '/create' : '/sign-up'}>
                {isSignedIn ? 'Open the composer' : 'Start creating free'}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
              <Link href="/explore">
                <Play className="size-4" />
                See what people made
              </Link>
            </Button>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            200 credits on signup · no card required
          </p>
        </div>

        {/* preset marquee — target of the "Presets" link in the site header */}
        <div id="presets" className="relative mt-16 scroll-mt-24 sm:mt-20">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-background to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-background to-transparent" />

          <div className="flex gap-3 overflow-hidden">
            {HERO_PRESETS.map((preset, index) => (
              <div
                key={preset.name}
                className="group relative aspect-[3/4] w-40 shrink-0 overflow-hidden rounded-xl border border-border bg-surface sm:w-48"
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
