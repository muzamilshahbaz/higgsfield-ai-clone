import Link from 'next/link'

// The catalogue file, not the database: an auth page should not depend on
// Supabase being reachable to render its own decoration.
import presetCatalogue from '../../../data/presets.json'

import { KineticLogo } from '@/components/brand/logo'
import { MODELS } from '@/lib/ai/registry'
import { SIGNUP_CREDIT_GRANT } from '@/lib/constants'

/**
 * Split auth shell: the form on the left, a strip of the product on the right.
 * The right panel is decorative and drops away below `lg`.
 *
 * The header/main/aside/footer elements are load-bearing, not tidiness: this
 * layout previously used plain divs, which left the logo and the disclaimer
 * outside every landmark and the page with no `main` at all — so a screen
 * reader had no way to jump to the form.
 *
 * The right panel's chips are the real preset categories, counted from the
 * catalogue, and the figures under the quote are computed. An auth page is the
 * last place to put a number that could be wrong.
 */

const PRESET_CATEGORIES = Array.from(
  new Set(presetCatalogue.map((preset) => preset.category)),
).slice(0, 8)

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-4 py-8 sm:px-8">
        <header>
          <Link href="/" className="inline-flex w-fit" aria-label="Kinetic Studio, home">
            <KineticLogo markClassName="size-7" />
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
      <aside className="relative hidden overflow-hidden border-l border-border/70 bg-surface/30 lg:block">
        <div className="light-wash pointer-events-none absolute inset-0" aria-hidden />
        <div className="blueprint pointer-events-none absolute inset-0 opacity-50" aria-hidden />

        <div className="relative flex h-full flex-col justify-center px-12">
          <p className="eyebrow text-brand">The workspace</p>

          <blockquote className="mt-6 max-w-md">
            <p className="text-balance font-display text-[1.75rem] font-semibold leading-snug tracking-tight">
              Pick a camera move. Drop in an image. Get a shot, not a settings panel.
            </p>
            <footer className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span className="tabular-nums">{presetCatalogue.length} presets</span>
              <span aria-hidden>·</span>
              <span className="tabular-nums">{MODELS.length} models</span>
              <span aria-hidden>·</span>
              <span className="tabular-nums text-credit">
                {SIGNUP_CREDIT_GRANT} credits on signup
              </span>
            </footer>
          </blockquote>

          <ul className="mt-12 flex flex-wrap gap-2">
            {PRESET_CATEGORIES.map((category) => (
              <li
                key={category}
                className="rounded-md border border-border bg-surface/80 px-2.5 py-1.5 text-xs text-muted-foreground"
              >
                {category}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  )
}
