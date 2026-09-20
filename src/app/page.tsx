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
 * what the product has made. That read can fail on a fresh or unreachable
 * database, which is why it is caught here and the section falls back to the
 * bundled sample frames — labelled as samples — instead of the page 500ing.
 */
export default async function LandingPage() {
  const user = isSupabaseConfigured ? await getCurrentUser() : null
  const isSignedIn = Boolean(user)

  const showcase = isSupabaseConfigured
    ? await listPublicGenerations({ limit: SHOWCASE_COUNT, sort: 'top' })
    : []

  return (
    <div className="relative min-h-dvh">
      <SiteHeader isSignedIn={isSignedIn} />

      <main>
        <Hero isSignedIn={isSignedIn} />
        <TrendingModels />
        <HowItWorks />
        <Features />
        <ModelLibrary />
        <Workflow />
        <CreatorShowcase items={showcase} />
        <Pricing />
        <SocialProof />
        <FinalCta isSignedIn={isSignedIn} />
      </main>

      <SiteFooter />
    </div>
  )
}
