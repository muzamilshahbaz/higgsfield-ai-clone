import 'server-only'

import { cache } from 'react'

import {
  DEFAULT_CAPABILITIES,
  DEFAULT_FAQ_ITEMS,
  DEFAULT_FEATURES,
  DEFAULT_NAV,
  DEFAULT_OVERVIEW,
  DEFAULT_STATS,
  DEFAULT_TESTIMONIALS,
  DEFAULT_WORKFLOW,
  EMPTY_NAV,
  emptySection,
  isSectionKey,
  KNOWN_SECTIONS,
  type AnnouncementItem,
  type FaqItem,
  type FeatureCard,
  type LandingSection,
  type NavLinkItem,
  type SiteNav,
  type StatCell,
  type StatSources,
  type TestimonialItem,
  type WorkflowStep,
} from '@/lib/cms/content'
import { getFlags } from '@/lib/flags'
import { cmsReadClient } from '@/lib/supabase/cms'
import type {
  AnnouncementPlacement,
  AnnouncementRow,
  FaqEntryRow,
  LandingSectionRow,
  NavLinkRow,
  SiteFeatureRow,
  SiteStatRow,
  TestimonialRow,
  WorkflowStepRow,
} from '@/types/cms'

/**
 * Public CMS reads.
 *
 * Every function here reads through the RLS-bound client and every one of them
 * falls back to the code-level default on a missing row, an error, or an
 * unconfigured database. That is the contract the whole feature rests on: a
 * marketing page must render completely with Postgres unplugged, because the
 * alternative is a homepage that 500s when a content table is unhappy.
 *
 * `cache()` on the aggregate read, so the landing page, the header and the footer
 * share one round trip per surface rather than one each.
 *
 * Nothing in this file writes. The admin's writers live in services/admin/ and
 * services/cms/ behind the capability guard.
 */

// ---------------------------------------------------------------------------
// Row → shape
// ---------------------------------------------------------------------------

function toSection(row: LandingSectionRow): LandingSection {
  return {
    key: row.key,
    label: row.label,
    indexLabel: row.index_label,
    eyebrow: row.eyebrow,
    title: row.title,
    lead: row.lead,
    body: row.body,
    ctaLabel: row.cta_label,
    ctaHref: row.cta_href,
    mediaId: row.media_id,
    // `config` is jsonb, so it can legitimately be an array or a scalar if
    // somebody wrote one. Anything that is not a plain object becomes `{}`, and
    // the readers in lib/cms/content.ts then hand out their fallbacks.
    config:
      row.config && typeof row.config === 'object' && !Array.isArray(row.config)
        ? (row.config as Record<string, unknown>)
        : {},
    isVisible: row.is_visible,
    sortOrder: row.sort_order,
  }
}

function toFeature(row: SiteFeatureRow): FeatureCard {
  return {
    id: row.id,
    placement: row.placement,
    title: row.title,
    body: row.body,
    detail: row.detail,
    icon: row.icon,
    span: row.span,
    href: row.href,
    mediaId: row.media_id,
    sortOrder: row.sort_order,
  }
}

function toStat(row: SiteStatRow): StatCell {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    detail: row.detail,
    valueKind: row.value_kind,
    literalValue: row.literal_value,
    prefix: row.prefix,
    suffix: row.suffix,
    sortOrder: row.sort_order,
  }
}

function toFaq(row: FaqEntryRow): FaqItem {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    category: row.category,
    sortOrder: row.sort_order,
  }
}

function toTestimonial(row: TestimonialRow): TestimonialItem {
  return {
    id: row.id,
    authorName: row.author_name,
    authorRole: row.author_role,
    authorCompany: row.author_company,
    authorUrl: row.author_url,
    avatarUrl: row.avatar_url,
    quote: row.quote,
    rating: row.rating,
    isVerified: row.is_verified,
    isFeatured: row.is_featured,
    sortOrder: row.sort_order,
  }
}

function toStep(row: WorkflowStepRow): WorkflowStep {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    artefact: row.artefact,
    sortOrder: row.sort_order,
  }
}

function toNavLink(row: NavLinkRow): NavLinkItem {
  return {
    id: row.id,
    group: row.nav_group,
    label: row.label,
    href: row.href,
    icon: row.icon,
    isRoute: row.is_route,
    isExternal: row.is_external,
    sortOrder: row.sort_order,
  }
}

// ---------------------------------------------------------------------------
// The aggregate read
// ---------------------------------------------------------------------------

export interface LandingContent {
  /** Every section the page knows how to render, keyed. Missing rows are stand-ins. */
  sections: Record<string, LandingSection>
  /** The visible section keys, in the operator's order. */
  order: string[]
  features: FeatureCard[]
  overview: FeatureCard[]
  capabilities: FeatureCard[]
  stats: StatCell[]
  faq: FaqItem[]
  testimonials: TestimonialItem[]
  workflow: WorkflowStep[]
}

/**
 * Everything the landing page renders, in one pass.
 *
 * Six queries in parallel rather than six awaits in sequence: they are
 * independent, and on a page a first-time visitor is waiting for, the difference
 * is the sum of the latencies versus the largest one.
 *
 * `order` deserves a note. It is built from the database rows, filtered to keys
 * this build knows how to render, and falls back to `KNOWN_SECTIONS` when there
 * are no rows at all. So an operator can reorder and hide bands, and a row naming
 * a section this deploy has never heard of is skipped rather than crashing the
 * render.
 */
export const getLandingContent = cache(async (): Promise<LandingContent> => {
  const fallback: LandingContent = {
    sections: Object.fromEntries(KNOWN_SECTIONS.map((key) => [key, emptySection(key)])),
    order: [...KNOWN_SECTIONS],
    features: DEFAULT_FEATURES,
    overview: DEFAULT_OVERVIEW,
    capabilities: DEFAULT_CAPABILITIES,
    stats: DEFAULT_STATS,
    faq: DEFAULT_FAQ_ITEMS,
    testimonials: DEFAULT_TESTIMONIALS,
    workflow: DEFAULT_WORKFLOW,
  }

  const supabase = await cmsReadClient()
  if (!supabase) return fallback

  const [sections, features, stats, faq, testimonials, workflow] = await Promise.all([
    supabase.from('landing_sections').select('*').order('sort_order', { ascending: true }),
    supabase.from('site_features').select('*').order('sort_order', { ascending: true }),
    supabase.from('site_stats').select('*').order('sort_order', { ascending: true }),
    supabase.from('faq_entries').select('*').order('sort_order', { ascending: true }),
    supabase.from('testimonials').select('*').order('sort_order', { ascending: true }),
    supabase.from('workflow_steps').select('*').order('sort_order', { ascending: true }),
  ])

  for (const result of [sections, features, stats, faq, testimonials, workflow]) {
    if (result.error) {
      console.error('[content.service] landing read failed:', result.error.message)
    }
  }

  const sectionRows = (sections.data ?? []).map(toSection)
  const resolved: Record<string, LandingSection> = { ...fallback.sections }
  for (const section of sectionRows) resolved[section.key] = section

  const order = sectionRows
    .filter((section) => section.isVisible && isSectionKey(section.key))
    .map((section) => section.key)

  const featureRows = (features.data ?? []).map(toFeature)
  const byPlacement = (placement: FeatureCard['placement'], defaults: FeatureCard[]) => {
    const rows = featureRows.filter((card) => card.placement === placement)
    // An empty table means "never seeded", so the defaults stand in. An operator
    // who genuinely wants no cards hides them, which leaves rows in the table and
    // an empty visible list — respected, because `rows` is only replaced when the
    // whole placement is absent.
    return rows.length > 0 ? rows : defaults
  }

  const statRows = (stats.data ?? []).map(toStat)
  const faqRows = (faq.data ?? []).map(toFaq)
  const workflowRows = (workflow.data ?? []).map(toStep)

  return {
    sections: resolved,
    order: order.length > 0 ? order : fallback.order,
    features: byPlacement('features', DEFAULT_FEATURES),
    overview: byPlacement('overview', DEFAULT_OVERVIEW),
    capabilities: byPlacement('capabilities', DEFAULT_CAPABILITIES),
    stats: statRows.length > 0 ? statRows : DEFAULT_STATS,
    faq: faqRows.length > 0 ? faqRows : DEFAULT_FAQ_ITEMS,
    // No fallback, on purpose. See DEFAULT_TESTIMONIALS.
    testimonials: (testimonials.data ?? []).map(toTestimonial),
    workflow: workflowRows.length > 0 ? workflowRows : DEFAULT_WORKFLOW,
  }
})

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

/**
 * The header, footer columns and social links.
 *
 * Read separately from the landing content because three surfaces need it and
 * only one of them needs the rest — /explore and /g/[id] render the same header
 * and footer without any of the bands.
 */
export const getSiteNav = cache(async (): Promise<SiteNav> => {
  const supabase = await cmsReadClient()
  if (!supabase) return DEFAULT_NAV

  const { data, error } = await supabase
    .from('nav_links')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('[content.service] nav read failed, using defaults:', error.message)
    return DEFAULT_NAV
  }

  const rows = (data ?? []).map(toNavLink)
  if (rows.length === 0) return DEFAULT_NAV

  const nav: SiteNav = { ...EMPTY_NAV, header: [], footer_product: [], footer_workspace: [], footer_account: [], footer_note: [], social: [], legal: [] }
  for (const row of rows) nav[row.group] = [...(nav[row.group] ?? []), row]

  // A group with nothing in the database keeps its shipped links rather than
  // rendering an empty column. The header is the one that matters: a site with no
  // navigation is broken in a way an operator would not have intended by deleting
  // one row.
  for (const group of Object.keys(nav) as (keyof SiteNav)[]) {
    if (nav[group].length === 0 && DEFAULT_NAV[group].length > 0) {
      nav[group] = DEFAULT_NAV[group]
    }
  }

  return nav
})

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

/**
 * The banner to show at this placement, or null.
 *
 * Three gates, and they are all needed. The `announcements` flag is the global
 * off switch; the RLS policy enforces the schedule window so a forgotten filter
 * cannot resurrect an expired notice; and the query filters again so the
 * highest-priority live row is the one that comes back.
 *
 * 'global' rows show everywhere, which is why they are included alongside the
 * requested placement rather than instead of it.
 */
export async function getAnnouncement(
  placement: AnnouncementPlacement,
): Promise<AnnouncementItem | null> {
  const flags = await getFlags()
  if (!flags.announcements) return null

  const supabase = await cmsReadClient()
  if (!supabase) return null

  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .in('placement', placement === 'global' ? ['global'] : ['global', placement])
    .eq('is_active', true)
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`ends_at.is.null,ends_at.gt.${now}`)
    .order('sort_order', { ascending: true })
    .limit(1)

  if (error) {
    console.error('[content.service] announcement read failed:', error.message)
    return null
  }

  const row = (data ?? [])[0] as AnnouncementRow | undefined
  if (!row) return null

  return {
    id: row.id,
    title: row.title,
    body: row.body,
    variant: row.variant,
    href: row.href,
    ctaLabel: row.cta_label,
    isDismissible: row.is_dismissible,
  }
}

// ---------------------------------------------------------------------------
// Statistics sources
// ---------------------------------------------------------------------------

/**
 * The live numbers a counted stat resolves against.
 *
 * `models` and `providers` come from the caller, because those are counted from
 * the code catalogue rather than the database and the landing page already has
 * them in hand. Everything else comes from `site_metrics()` — one function call,
 * and the only way an anonymous visitor can reach an aggregate over
 * owner-scoped tables. See migration 0018.
 *
 * Every field defaults to zero on failure, and `statValue` renders nothing for a
 * zero — so a failed metrics call costs a cell, not a page.
 */
export async function getStatSources(input: {
  models: number
  providers: number
  signupCredits: number
}): Promise<StatSources> {
  const base: StatSources = {
    models: input.models,
    providers: input.providers,
    signupCredits: input.signupCredits,
    presets: 0,
    creators: 0,
    projects: 0,
    assets: 0,
    countries: 0,
    publicGenerations: 0,
  }

  const supabase = await cmsReadClient()
  if (!supabase) return base

  const { data, error } = await supabase.rpc('site_metrics')

  if (error || !data) {
    if (error) console.error('[content.service] site_metrics failed:', error.message)
    return base
  }

  return {
    ...base,
    presets: data.presets ?? 0,
    creators: data.creators ?? 0,
    projects: data.projects ?? 0,
    assets: data.assets ?? 0,
    countries: data.countries ?? 0,
    publicGenerations: data.public_generations ?? 0,
  }
}
