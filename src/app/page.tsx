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
import { Testimonials } from '@/components/marketing/testimonials'
import { AnnouncementBanner } from '@/components/marketing/announcement-banner'
import { configNumber, emptySection, type LandingSection } from '@/lib/cms/content'
import { getFlags } from '@/lib/flags'
import { MODELS } from '@/lib/ai/registry'
import { isSupabaseConfigured } from '@/lib/env'
import { getCurrentUser } from '@/lib/supabase/server'
import { getPublicProviders, getLandingModels } from '@/services/cms/catalogue.service'
import {
  getAnnouncement,
  getLandingContent,
  getStatSources,
} from '@/services/cms/content.service'
import { signupGrant } from '@/services/cms/credits.service'
import { getPlanCatalogue, getPlanFeatures } from '@/services/cms/plans.service'
import { getSettings } from '@/services/cms/settings.service'
import { getMyProfile } from '@/services/profile.service'
import { listPublicGenerations } from '@/services/explore.service'
import { listMedia, listMediaMix } from '@/services/media.service'
import { listPresetCatalogue } from '@/services/preset.service'
import { isStaffVisitor } from '@/lib/marketing/staff-visitor'

/**
 * The landing page.
 *
 * Twelve bands, and which of them render, in what order, and what each one says is read from
 * `landing_sections` rather than written here. `renderSection` maps a key to a component; the
 * page walks the operator's order and skips anything it does not recognise, so a row added by
 * hand cannot take the homepage down.
 *
 * The visual rules the page was built on survive being editable, because they are in the
 * components rather than in the data: no two adjacent bands share a layout or a background, the
 * tinted ones alternate, and the numbered eyebrows come from `index_label` — stored rather than
 * counted, so a band that moves keeps the number the copy refers to.
 *
 * The showcase reads the real public feed, so the page is never lying about what the product has
 * made. When nothing has been published it falls back to reference photography — read from
 * `media_assets`, labelled as reference, and credited — rather than to anything pretending to be
 * output. That disclaimer is deliberately not editable; see the note in creator-showcase.tsx.
 *
 * Every read resolves to a default or an empty array on a fresh or unreachable database, so a
 * landing page missing its content still renders instead of 500ing. That is not hypothetical:
 * a deploy with the Supabase variables unset once served 500s on every route in this app.
 */

const SHOWCASE_COUNT = 8

export default async function LandingPage() {
  const user = isSupabaseConfigured ? await getCurrentUser() : null
  const isSignedIn = Boolean(user)

  const profile = isSupabaseConfigured ? await getMyProfile() : null

  // Content, settings and flags first: the section list decides what else is worth reading.
  const [content, settings, flags, announcement, grant, providers] = await Promise.all([
    getLandingContent(),
    getSettings(),
    getFlags(),
    getAnnouncement('marketing'),
    signupGrant(),
    getPublicProviders(),
  ])

  const readyProviders = providers.filter((provider) => provider.generationReady)

  const [showcase, heroMedia, showcaseMedia, presets, models, plans, planFeatures, statSources] =
    isSupabaseConfigured
      ? await Promise.all([
          listPublicGenerations({
            limit: configNumber(content.sections.showcase?.config ?? {}, 'limit', SHOWCASE_COUNT),
            sort: 'top',
          }),
          // The console preview gets landscape only: it sits in a 16:9 frame, and a cropped
          // portrait there reads as a mistake.
          listMedia({ categories: ['landscape'], limit: 1 }),
          // The showcase grid is the one that should look like a body of work, so it takes a
          // spread across people, animals, cities and landscape.
          listMediaMix(SHOWCASE_COUNT),
          // The marquee is the real catalogue, with the real preview each preset holds — not a
          // list of names over generated gradients.
          listPresetCatalogue(),
          getLandingModels(),
          getPlanCatalogue(),
          getPlanFeatures(),
          getStatSources({
            models: MODELS.length,
            providers: readyProviders.length,
            signupCredits: grant,
          }),
        ])
      : [
          [],
          [],
          [],
          [],
          [],
          [],
          [],
          {
            models: MODELS.length,
            providers: readyProviders.length,
            signupCredits: grant,
            presets: 0,
            creators: 0,
            projects: 0,
            assets: 0,
            countries: 0,
            publicGenerations: 0,
          },
        ]

  /**
   * One band.
   *
   * A switch rather than a lookup table, so the compiler checks that every key this page claims
   * to know has a case — and an unknown key returns null rather than throwing, which is what
   * makes the section table safe to edit by hand.
   *
   * Two bands are gated by feature flags: the pricing band by `billing`, and the showcase by
   * `explore`, because both link into surfaces that flag can switch off. A pricing page whose
   * buttons lead to a hidden checkout is worse than no pricing page.
   */
  function renderSection(section: LandingSection) {
    switch (section.key) {
      case 'hero':
        return (
          <Hero
            key={section.key}
            section={section}
            isSignedIn={isSignedIn}
            media={heroMedia}
            presets={presets}
            modelCount={MODELS.length}
            providerCount={readyProviders.length}
            signupGrant={grant}
          />
        )

      case 'stats':
        return (
          <Stats
            key={section.key}
            section={section}
            stats={content.stats}
            sources={statSources}
            providers={readyProviders}
          />
        )

      case 'overview':
        return <ProductOverview key={section.key} section={section} points={content.overview} />

      case 'capabilities':
        return <Capabilities key={section.key} section={section} cards={content.capabilities} />

      case 'models':
        return <ModelLibrary key={section.key} section={section} models={models} />

      case 'workflow':
        return <HowItWorks key={section.key} section={section} steps={content.workflow} />

      case 'showcase':
        if (!flags.explore) return null
        return (
          <CreatorShowcase
            key={section.key}
            section={section}
            items={showcase}
            media={showcaseMedia}
            siteName={settings.site.name}
          />
        )

      case 'features':
        return <FeatureHighlights key={section.key} section={section} features={content.features} />

      case 'pricing':
        if (!flags.billing) return null
        return (
          <Pricing
            key={section.key}
            section={section}
            plans={plans}
            features={planFeatures}
            signupGrant={grant}
            disclaimer={settings.legal.billingDisclaimer}
          />
        )

      case 'testimonials':
        if (!flags.testimonials) return null
        return <Testimonials key={section.key} section={section} items={content.testimonials} />

      case 'faq':
        return <FAQ key={section.key} section={section} items={content.faq} />

      case 'cta':
        return (
          <FinalCta
            key={section.key}
            section={section}
            isSignedIn={isSignedIn}
            signupGrant={grant}
            modelCount={MODELS.length}
          />
        )

      default:
        // A key from a newer deploy, or one written by hand. Skipped rather than thrown.
        return null
    }
  }

  return (
    <div className="relative min-h-dvh">
      <SiteHeader isSignedIn={isSignedIn} isStaff={isStaffVisitor(profile)} profile={profile} onLandingPage />

      {announcement && <AnnouncementBanner announcement={announcement} />}

      <main>{content.order.map((key) => renderSection(content.sections[key] ?? emptySection(key)))}</main>

      <SiteFooter onLandingPage />
    </div>
  )
}
