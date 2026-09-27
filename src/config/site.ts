import type { LucideIcon } from 'lucide-react'
import {
  Clapperboard,
  CreditCard,
  FolderOpen,
  Images,
  KeyRound,
  LayoutDashboard,
  Compass,
  History,
  Star,
  UserRound,
  Wand2,
} from 'lucide-react'

export const siteConfig = {
  name: 'Kinetic Studio',
  /** For the places that genuinely cannot fit two words: a 40px sidebar rail. */
  shortName: 'Kinetic',
  tagline: 'The AI creative workspace',
  description:
    'Kinetic Studio is a workspace for making images and video with open models. One composer, one credit balance, your own API keys — from a prompt to a finished shot without leaving the page.',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
} as const

export interface NavItem {
  title: string
  href: string
  icon: LucideIcon
  description?: string
}

export const studioNav: NavItem[] = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    description: 'Your studio at a glance',
  },
  {
    title: 'Create',
    href: '/create',
    icon: Clapperboard,
    description: 'Compose a new generation',
  },
  {
    title: 'Presets',
    href: '/presets',
    icon: Wand2,
    description: 'Camera moves and film styles',
  },
  { title: 'Projects', href: '/projects', icon: FolderOpen, description: 'Organise your work' },
  { title: 'Library', href: '/library', icon: Images, description: 'Every asset you own' },
  { title: 'History', href: '/history', icon: History, description: 'Every job you have run' },
  { title: 'Explore', href: '/explore', icon: Compass, description: 'What the community is making' },
  { title: 'Favourites', href: '/favourites', icon: Star, description: 'Everything you have saved' },
]

/**
 * The sidebar, grouped.
 *
 * Eight flat links is a list you read every time; three labelled groups is a
 * shape you learn once and then navigate by position. The grouping is by what
 * you are doing — making something, managing what you made, looking at what
 * other people made — not by how often a link is clicked.
 *
 * `studioNav` above stays the flat source of truth so nothing can appear in a
 * group without existing as a route; this only arranges it.
 */
export interface NavGroup {
  label: string
  items: NavItem[]
}

function navItem(href: string): NavItem {
  const item = studioNav.find((entry) => entry.href === href)
  if (!item) throw new Error(`No studio nav item for ${href}`)
  return item
}

export const studioNavGroups: NavGroup[] = [
  { label: 'Workspace', items: ['/dashboard', '/create', '/presets'].map(navItem) },
  { label: 'Content', items: ['/projects', '/library', '/history'].map(navItem) },
  { label: 'Community', items: ['/explore', '/favourites'].map(navItem) },
]

/**
 * The settings sections.
 *
 * One list, two renderers: the tab bar on the settings pages and the dropdown
 * behind Settings in the sidebar. They were never going to stay in step as two
 * arrays — the tab bar already carried its own private copy, and a fourth
 * section would have been added to one of them.
 *
 * `description` is what the dropdown shows under each title. The tab bar
 * ignores it, because a tab that explains itself is a tab that is too wide.
 */
export const settingsNav: NavItem[] = [
  {
    title: 'Profile',
    href: '/settings',
    icon: UserRound,
    description: 'Your name, handle and credit ledger',
  },
  {
    title: 'AI model keys',
    href: '/settings/keys',
    icon: KeyRound,
    description: 'Run generations on your own quota',
  },
  {
    title: 'Plan & billing',
    href: '/settings/billing',
    icon: CreditCard,
    description: 'Credits, plan and payment history',
  },
]

/**
 * The public site's nav.
 *
 * Every anchor href is an id that a section on `/` actually renders. Adding an
 * entry without the matching `id` gives a link that scrolls nowhere, which is
 * worse than not linking to the section at all.
 *
 * Explore is the one entry that is a route rather than an anchor, and it is
 * first deliberately: it is the only item that takes a visitor somewhere they
 * can use without an account.
 */
export interface MarketingNavItem {
  title: string
  /** An in-page anchor, or a real route. See `resolveMarketingHref`. */
  href: string
  /** True for a route, which must not be rewritten when off the landing page. */
  route?: boolean
}

export const marketingNav: MarketingNavItem[] = [
  { title: 'Explore', href: '/explore', route: true },
  { title: 'Features', href: '#overview' },
  { title: 'Models', href: '#models' },
  { title: 'Pricing', href: '#pricing' },
  { title: 'FAQ', href: '#faq' },
]

/**
 * A nav href that works from wherever it is rendered.
 *
 * The bar is shared by `/`, `/explore` and `/g/[id]`. A bare `#pricing` scrolls
 * to a section that only exists on the landing page — from anywhere else it is
 * a link that visibly does nothing, which is worse than one that navigates.
 * Off the landing page the anchors become `/#pricing`; real routes are left
 * alone.
 */
export function resolveMarketingHref(item: MarketingNavItem, onLandingPage: boolean): string {
  if (item.route) return item.href
  return onLandingPage ? item.href : `/${item.href}`
}
