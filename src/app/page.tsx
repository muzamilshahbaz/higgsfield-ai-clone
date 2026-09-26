import { Capabilities } from '@/components/marketing/capabilities'
import { CreatorShowcase } from '@/components/marketing/creator-showcase'
import { FAQ } from '@/components/marketing/faq'
import { FeatureHighlights } from '@/components/marketing/feature-highlights'
import { FinalCta } from '@/components/marketing/final-cta'
import { Hero } from '@/components/marketing/hero'
import { HowItWorks } from '@/components/marketing/how-it-works'
import { ModelLibrary } from '@/components/marketing/model-library'
import { Pricing } from '@/components/marketing/pricing'
import { ProductOverview } from '@/components/marketing/product-overview'
import { SiteFooter } from '@/components/marketing/site-footer'
import { SiteHeader } from '@/components/marketing/site-header'
import { Stats } from '@/components/marketing/stats'
import { isSupabaseConfigured } from '@/lib/env'
import { getCurrentUser } from '@/lib/supabase/server'
import { listPublicGenerations } from '@/services/explore.service'
import { listMedia, listMediaMix } from '@/services/media.service'
import { listPresetCatalogue } from '@/services/preset.service'

const SHOWCASE_COUNT = 8

/**
 * The landing page.
 *
 * Nine bands, numbered 01–08 on screen, and no two adjacent ones share a layout
 * or a background: hero (asymmetric, console panel right), stats (four cells),
 * overview (panel left, points right), capabilities (three cards, tinted),
 * models (spec-sheet rows), how it works (rail, tinted), showcase (masonry),
 * features (bento, tinted), pricing (centred cards), FAQ (sticky heading, native
 * disclosure), CTA (full-bleed), footer.
 *
 * The showcase reads the real public feed, so the page is never lying about what
 * the product has made. When nothing has been published it falls back to
 * reference photography — read from `media_assets`, labelled as reference, and
 * credited — rather than to anything pretending to be output.
 *
 * Every read resolves to an empty array on a fresh or unreachable database, so
 * a landing page missing its decoration still renders instead of 500ing.
 */
export default async function LandingPage() {
  const user = isSupabaseConfigured ? await getCurrentUser() : null
  const isSignedIn = Boolean(user)

  const [showcase, heroMedia, showcaseMedia, presets] = isSupabaseConfigured
    ? await Promise.all([
        listPublicGenerations({ limit: SHOWCASE_COUNT, sort: 'top' }),
        // The console preview gets landscape only: it sits in a 16:9 frame, and
        // a cropped portrait there reads as a mistake.
        listMedia({ categories: ['landscape'], limit: 1 }),
        // The showcase grid is the one that should look like a body of work, so
        // it takes a spread across people, animals, cities and landscape.
        listMediaMix(SHOWCASE_COUNT),
        // The marquee is the real catalogue, with the real preview each preset
        // holds — not a list of names over generated gradients.
        listPresetCatalogue(),
      ])
    : [[], [], [], []]

  return (
    <div className="relative min-h-dvh">
      <SiteHeader isSignedIn={isSignedIn} />

      <main>
        <Hero isSignedIn={isSignedIn} media={heroMedia} presets={presets} />
        <Stats />
        <ProductOverview />
        <Capabilities />
        <ModelLibrary />
        <HowItWorks />
        <CreatorShowcase items={showcase} media={showcaseMedia} />
        <FeatureHighlights />
        <Pricing />
        <FAQ />
        <FinalCta isSignedIn={isSignedIn} />
      </main>

      <SiteFooter />
    </div>
  )
}
