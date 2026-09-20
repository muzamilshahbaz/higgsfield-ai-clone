import Link from 'next/link'
import { Clapperboard } from 'lucide-react'

import { siteConfig } from '@/config/site'

const MARQUEE = [
  { name: 'Crash Zoom', category: 'Camera' },
  { name: 'Bullet Time', category: 'VFX' },
  { name: 'FPV Drone', category: 'Camera' },
  { name: 'Golden Hour', category: 'Style' },
  { name: '360 Orbit', category: 'Camera' },
  { name: 'Film Noir', category: 'Style' },
]

/**
 * Split auth shell: the form on the left, a strip of the product on the right.
 * The right panel is decorative and drops away below `lg`.
 *
 * The header/main/aside/footer elements are load-bearing, not tidiness: this
 * layout previously used plain divs, which left the logo and the disclaimer
 * outside every landmark and the page with no `main` at all — so a screen
 * reader had no way to jump to the form.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-4 py-8 sm:px-8">
        <header>
          <Link href="/" className="inline-flex w-fit items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary">
              <Clapperboard className="size-4 text-primary-foreground" />
            </span>
            <span className="text-sm font-semibold tracking-tight">{siteConfig.name}</span>
          </Link>
        </header>

        <main className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </main>

        <footer className="text-center text-xs text-muted-foreground">
          <p>Not affiliated with any commercial AI video service.</p>
        </footer>
      </div>

      {/* decorative panel */}
      <aside className="relative hidden overflow-hidden border-l border-border/60 bg-surface/30 lg:block">
        <div className="aurora opacity-50" aria-hidden />

        <div className="relative flex h-full flex-col justify-center px-12">
          <blockquote className="max-w-md">
            <p className="text-balance text-2xl font-semibold leading-snug tracking-tight">
              &ldquo;Pick a camera move. Drop in an image. Get a shot, not a settings panel.&rdquo;
            </p>
            <footer className="mt-4 text-sm text-muted-foreground">
              36 presets · image and video models · 200 credits on signup
            </footer>
          </blockquote>

          <div className="mt-12 flex flex-wrap gap-2" aria-hidden>
            {MARQUEE.map((preset) => (
              <span
                key={preset.name}
                className="rounded-full border border-border bg-surface/80 px-3 py-1.5 text-xs text-muted-foreground"
              >
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                  {preset.category}
                </span>
                <span className="ml-2 text-foreground">{preset.name}</span>
              </span>
            ))}
          </div>
        </div>
      </aside>
    </div>
  )
}
