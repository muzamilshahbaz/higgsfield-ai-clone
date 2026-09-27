import {
  CAPABILITIES,
  FAQ as DEFAULT_FAQ,
  FEATURE_HIGHLIGHTS,
  OVERVIEW_POINTS,
} from '@/lib/marketing/landing'
import type {
  AnnouncementVariant,
  FeaturePlacement,
  NavGroup,
  StatValueKind,
} from '@/types/cms'

/**
 * The shapes the marketing components read, and the content they get when the
 * database has nothing to say.
 *
 * The defaults are not a second copy of the copy. `DEFAULT_FEATURES`,
 * `DEFAULT_OVERVIEW`, `DEFAULT_CAPABILITIES` and `DEFAULT_FAQ_ITEMS` are mapped
 * from the arrays that were already in lib/marketing/landing.ts — the literals
 * this sprint replaced. So the fallback is, by construction, exactly what the
 * page rendered before any of this existed, and there is one place to edit if a
 * default ever needs to change.
 *
 * Not `server-only`: every component that renders these is a Server Component
 * today, but the shapes are plain data and a client component will eventually
 * want one. Nothing here reads a cookie or a secret.
 *
 * camelCase throughout. Database rows are snake_case and are converted once, at
 * the service boundary, so no component ever sees an `is_visible`.
 */

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export interface LandingSection {
  key: string
  label: string
  indexLabel: string | null
  eyebrow: string | null
  title: string | null
  lead: string | null
  body: string | null
  ctaLabel: string | null
  ctaHref: string | null
  mediaId: string | null
  config: Record<string, unknown>
  isVisible: boolean
  sortOrder: number
}

/**
 * The bands the page knows how to render, in the order they ship in.
 *
 * This list is the allow-list: `page.tsx` walks the rows from the database and
 * renders only keys it finds here. A row for `key = 'newsletter'` is ignored
 * rather than throwing, which is what makes hand-editing the table safe.
 */
export const KNOWN_SECTIONS = [
  'hero',
  'stats',
  'overview',
  'capabilities',
  'models',
  'workflow',
  'showcase',
  'features',
  'pricing',
  'testimonials',
  'faq',
  'cta',
] as const

export type SectionKey = (typeof KNOWN_SECTIONS)[number]

export function isSectionKey(key: string): key is SectionKey {
  return (KNOWN_SECTIONS as readonly string[]).includes(key)
}

/**
 * Section-specific settings, read out of the `config` jsonb.
 *
 * Narrowed one value at a time rather than cast, because `config` is a column an
 * operator can put anything in. Each reader takes a fallback, so a missing or
 * malformed key costs the default rather than a render error — the same contract
 * as the settings readers.
 */
export function configString(
  config: Record<string, unknown>,
  key: string,
  fallback: string | null = null,
): string | null {
  const value = config[key]
  return typeof value === 'string' && value.trim() ? value : fallback
}

export function configBoolean(
  config: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  const value = config[key]
  return typeof value === 'boolean' ? value : fallback
}

export function configNumber(
  config: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const value = config[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/**
 * A section by key, or a minimal stand-in.
 *
 * Returning a placeholder rather than null means a component never has to guard:
 * `section(content, 'faq').title ?? 'Before you sign up'` reads the same whether
 * the row exists or not, and a band with no row simply falls back to the literal
 * copy it always had.
 */
export function emptySection(key: string): LandingSection {
  return {
    key,
    label: key,
    indexLabel: null,
    eyebrow: null,
    title: null,
    lead: null,
    body: null,
    ctaLabel: null,
    ctaHref: null,
    mediaId: null,
    config: {},
    isVisible: true,
    sortOrder: 0,
  }
}

// ---------------------------------------------------------------------------
// Feature cards
// ---------------------------------------------------------------------------

export interface FeatureCard {
  id: string
  placement: FeaturePlacement
  title: string
  body: string
  detail: string | null
  icon: string | null
  span: string | null
  /** For a capability card this carries the `GenerationTask` it counts models for. */
  href: string | null
  mediaId: string | null
  sortOrder: number
}

function card(
  placement: FeaturePlacement,
  index: number,
  fields: Partial<FeatureCard> & { title: string; body: string },
): FeatureCard {
  return {
    // A stable synthetic id, so React keys and `<li key>` behave identically
    // whether the list came from Postgres or from this file.
    id: `default-${placement}-${index}`,
    placement,
    detail: null,
    icon: null,
    span: null,
    href: null,
    mediaId: null,
    sortOrder: (index + 1) * 10,
    ...fields,
  }
}

export const DEFAULT_FEATURES: FeatureCard[] = FEATURE_HIGHLIGHTS.map((entry, index) =>
  card('features', index, { title: entry.title, body: entry.body, span: entry.span }),
)

export const DEFAULT_OVERVIEW: FeatureCard[] = OVERVIEW_POINTS.map((entry, index) =>
  card('overview', index, { title: entry.title, body: entry.body }),
)

/**
 * The capability cards.
 *
 * `href` carries the generation task, which is the join to the registry the card
 * counts models and prices from. It is a slightly odd home for it — but the
 * alternative was a `task` column that only three rows in the whole table would
 * ever use, and `href` is otherwise unused on this placement.
 */
export const DEFAULT_CAPABILITIES: FeatureCard[] = CAPABILITIES.map((entry, index) =>
  card('capabilities', index, {
    title: entry.title,
    body: entry.body,
    detail: entry.detail,
    href: entry.task,
    icon: entry.task === 'text_to_image' ? 'Image' : entry.task === 'image_to_video' ? 'Film' : 'Video',
  }),
)

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

export interface StatCell {
  id: string
  key: string
  label: string
  detail: string | null
  valueKind: StatValueKind
  literalValue: string | null
  prefix: string | null
  suffix: string | null
  sortOrder: number
}

export const DEFAULT_STATS: StatCell[] = [
  { key: 'models', label: 'Open models', detail: 'image and video', valueKind: 'models' },
  { key: 'presets', label: 'Presets', detail: 'camera moves and styles', valueKind: 'presets' },
  { key: 'providers', label: 'Providers', detail: 'bring your own key', valueKind: 'providers' },
  {
    key: 'signup_credits',
    label: 'Credits on signup',
    detail: 'no card required',
    valueKind: 'signup_credits',
  },
].map((entry, index) => ({
  id: `default-stat-${entry.key}`,
  literalValue: null,
  prefix: null,
  suffix: null,
  sortOrder: (index + 1) * 10,
  ...entry,
  valueKind: entry.valueKind as StatValueKind,
}))

/**
 * The live numbers a counted stat resolves against.
 *
 * Assembled by the caller — the landing page already knows the model count and
 * the preset count, and the database counts the rest — and passed in, so this
 * module stays free of queries and the component stays free of arithmetic.
 */
export interface StatSources {
  models: number
  presets: number
  providers: number
  signupCredits: number
  creators: number
  projects: number
  assets: number
  countries: number
  publicGenerations: number
}

/**
 * What a stat cell prints.
 *
 * A counted kind with a zero source returns null rather than "0". A landing page
 * that says "0 Creators" is worse than one with three cells instead of four, and
 * the Stats component drops a null.
 */
export function statValue(stat: StatCell, sources: StatSources): string | null {
  if (stat.valueKind === 'literal') return stat.literalValue?.trim() || null

  const counted: Record<Exclude<StatValueKind, 'literal'>, number> = {
    models: sources.models,
    presets: sources.presets,
    providers: sources.providers,
    signup_credits: sources.signupCredits,
    creators: sources.creators,
    projects: sources.projects,
    assets: sources.assets,
    countries: sources.countries,
    public_generations: sources.publicGenerations,
  }

  const value = counted[stat.valueKind]
  if (!value) return null
  return value.toLocaleString('en-GB')
}

// ---------------------------------------------------------------------------
// FAQ, testimonials, workflow
// ---------------------------------------------------------------------------

export interface FaqItem {
  id: string
  question: string
  answer: string
  category: string
  sortOrder: number
}

export const DEFAULT_FAQ_ITEMS: FaqItem[] = DEFAULT_FAQ.map((entry, index) => ({
  id: `default-faq-${index}`,
  question: entry.q,
  answer: entry.a,
  category: 'general',
  sortOrder: (index + 1) * 10,
}))

export interface TestimonialItem {
  id: string
  authorName: string
  authorRole: string | null
  authorCompany: string | null
  authorUrl: string | null
  avatarUrl: string | null
  quote: string
  rating: number | null
  isVerified: boolean
  isFeatured: boolean
  sortOrder: number
}

/**
 * Empty, and that is the point.
 *
 * The landing page's standing rule is no invented social proof. A default
 * testimonial would be a fabricated quote shipped in a source file, so the
 * fallback for this section is "do not render the section".
 */
export const DEFAULT_TESTIMONIALS: TestimonialItem[] = []

export interface WorkflowStep {
  id: string
  title: string
  body: string
  artefact: string | null
  sortOrder: number
}

export const DEFAULT_WORKFLOW: WorkflowStep[] = [
  {
    title: 'Describe the shot',
    body: 'A sentence is enough. Add a reference image if you have one — the same panel takes both.',
    artefact: 'prompt + reference.jpg',
  },
  {
    title: 'Pick a move and a model',
    body: 'A preset carries the camera language, the negative prompt and the parameters that make the move read. The model selector shows what each one costs.',
    artefact: 'preset: slow push · Motion Cine',
  },
  {
    title: 'Queue it',
    body: 'Two jobs run at once on the free plan. The card streams from queued to rendering to ready without a refresh, and the credits leave your balance only once the job is accepted.',
    artefact: 'job 8f21 · rendering · 41%',
  },
  {
    title: 'Use it',
    body: 'Download the original, file it into a project, publish it to Explore, or pull it back into the composer and change one value.',
    artefact: 'shot-04.mp4 · 1920×1080',
  },
].map((entry, index) => ({ id: `default-step-${index}`, sortOrder: (index + 1) * 10, ...entry }))

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export interface NavLinkItem {
  id: string
  group: NavGroup
  label: string
  href: string
  icon: string | null
  isRoute: boolean
  isExternal: boolean
  sortOrder: number
}

export type SiteNav = Record<NavGroup, NavLinkItem[]>

export const EMPTY_NAV: SiteNav = {
  header: [],
  footer_product: [],
  footer_workspace: [],
  footer_account: [],
  footer_note: [],
  social: [],
  legal: [],
}

function navLink(
  group: NavGroup,
  index: number,
  label: string,
  href: string,
  isRoute = true,
): NavLinkItem {
  return {
    id: `default-nav-${group}-${index}`,
    group,
    label,
    href,
    icon: null,
    isRoute,
    isExternal: false,
    sortOrder: (index + 1) * 10,
  }
}

/**
 * The navigation the app shipped with, as the fallback.
 *
 * `footer_product` is deliberately empty here: that column is built from the
 * header entries at render time so the two cannot disagree, exactly as
 * `columnsFor` in site-footer.tsx did.
 */
export const DEFAULT_NAV: SiteNav = {
  ...EMPTY_NAV,
  header: [
    navLink('header', 0, 'Explore', '/explore'),
    navLink('header', 1, 'Features', '#overview', false),
    navLink('header', 2, 'Models', '#models', false),
    navLink('header', 3, 'How it works', '#workflow', false),
    navLink('header', 4, 'Pricing', '#pricing', false),
    navLink('header', 5, 'FAQ', '#faq', false),
  ],
  footer_workspace: [
    navLink('footer_workspace', 0, 'Dashboard', '/dashboard'),
    navLink('footer_workspace', 1, 'Composer', '/create'),
    navLink('footer_workspace', 2, 'Presets', '/presets'),
    navLink('footer_workspace', 3, 'Explore', '/explore'),
  ],
  footer_account: [
    navLink('footer_account', 0, 'Sign in', '/sign-in'),
    navLink('footer_account', 1, 'Create an account', '/sign-up'),
    navLink('footer_account', 2, 'API keys', '/settings/keys'),
    navLink('footer_account', 3, 'Billing', '/settings/billing'),
  ],
  footer_note: [
    navLink('footer_note', 0, 'Checkout is simulated', '', false),
    navLink('footer_note', 1, 'Every model open-weight', '', false),
    navLink('footer_note', 2, 'Bring your own API keys', '', false),
  ],
}

/**
 * A nav href that works from wherever it is rendered.
 *
 * The same rule `resolveMarketingHref` in config/site.ts encodes, moved here for
 * the database-driven links: a bare `#pricing` scrolls to a section that only
 * exists on the landing page, so off it the anchors become `/#pricing` and real
 * routes are left alone.
 */
export function resolveNavHref(item: NavLinkItem, onLandingPage: boolean): string {
  if (item.isRoute || item.isExternal) return item.href
  return onLandingPage ? item.href : `/${item.href}`
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

export interface AnnouncementItem {
  id: string
  title: string
  body: string | null
  variant: AnnouncementVariant
  href: string | null
  ctaLabel: string | null
  isDismissible: boolean
}
