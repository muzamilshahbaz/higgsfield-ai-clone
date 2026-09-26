import { CreatorShowcase } from '@/components/marketing/creator-showcase'
import { Features } from '@/components/marketing/features'
import { FinalCta } from '@/components/marketing/final-cta'
import { Hero } from '@/components/marketing/hero'
import { HowItWorks } from '@/components/marketing/how-it-works'
import { ModelLibrary } from '@/components/marketing/model-library'
import { Pricing } from '@/components/marketing/pricing'
import { SiteFooter } from '@/components/marketing/site-footer'
import { SiteHeader } from '@/components/marketing/site-header'
import { SocialProof } from '@/components/marketing/social-proof'
import { TrendingModels } from '@/components/marketing/trending-models'
import { Workflow } from '@/components/marketing/workflow'
import { isSupabaseConfigured } from '@/lib/env'
import { getCurrentUser } from '@/lib/supabase/server'
import { listPublicGenerations } from '@/services/explore.service'
import { listMedia, listMediaMix } from '@/services/media.service'
import { listPresetCatalogue } from '@/services/preset.service'

const SHOWCASE_COUNT = 8

/**
 * The landing page.
 *
 * The rhythm is deliberate rather than a stack of equal bands: hero (split),
 * trending (full-bleed rail), how it works (flow), features (bento), library
 * (tinted, dense grid), workflow (sticky offset), showcase (masonry, tinted),
 * pricing (cards), proof (stats + quotes), CTA (full-bleed). No two adjacent
 * sections share a layout or a background.
 *
 * The showcase reads the real public feed, so the page is never lying about
 * what the product has made. When nothing has been published it falls back to
 * reference photography — read from `media_assets`, labelled as reference, and
 * credited — rather than to anything pretending to be output.
 *
 * Both reads resolve to an empty array on a fresh or unreachable database, so
 * a landing page missing its decoration still renders instead of 500ing.
 */
export default async function LandingPage() {
  const user = isSupabaseConfigured ? await getCurrentUser() : null
  const isSignedIn = Boolean(user)

  const [showcase, heroMedia, trendingMedia, showcaseMedia, presets] = isSupabaseConfigured
    ? await Promise.all([
        listPublicGenerations({ limit: SHOWCASE_COUNT, sort: 'top' }),
        // The hero gets landscape only: the three frames are small, overlap,
        // and a cropped face at that size reads as a mistake.
        listMedia({ categories: ['landscape'], limit: 3 }),
        listMedia({ limit: 6 }),
        // The showcase grid is the one that should look like a body of work,
        // so it takes a spread across people, animals, cities and landscape.
        listMediaMix(SHOWCASE_COUNT),
        // The marquee used to be ten hardcoded names over generated CSS
        // gradients. It is the real catalogue now, with the real preview each
        // preset holds.
        listPresetCatalogue(),
      ])
    : [[], [], [], [], []]

  return (
    <div className="relative min-h-dvh">
      <SiteHeader isSignedIn={isSignedIn} />

      <main>
        <Hero isSignedIn={isSignedIn} media={heroMedia} presets={presets} />
        <TrendingModels media={trendingMedia} />
        <HowItWorks />
        <Features />
        <ModelLibrary />
        <Workflow />
        <CreatorShowcase items={showcase} media={showcaseMedia} />
        <Pricing />
        <SocialProof />
        <FinalCta isSignedIn={isSignedIn} />
      </main>

      <SiteFooter />
    </div>
  )
}
